import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { supabase } from "../lib/supabase"
import {
  calcularHashArchivo,
  leerLibroMayorPdf,
  type MovimientoLibroMayor,
} from "../utils/libroMayorPdf"

type CuentaConciliacion = {
  periodo: string
  cuenta_codigo: string
  cuenta_nombre: string
  regla_clasificacion: "FIJA" | "MIXTA"
  fuente_detalle: "NINGUNA" | "FACTURA" | "NOMINA" | "DOCUMENTO"
  valor_contable: number
  valor_registrado: number
  valor_clasificado: number
  valor_pendiente_clasificacion: number
  valor_pendiente_documentos: number
  movimientos_registrados: number
  movimientos_pendientes: number
  cobertura_clasificacion_pct: number
  estado: string
}

type CuentaAutomatica = {
  periodo: string
  cuenta_codigo: string
  cuenta_nombre: string
  origen_contable: string
  clasificacion_gerencial: ClasificacionGerencial
  incluida_costo_venta_contable: boolean
  impacta_margen_bruto: boolean
  impacta_ebitda: boolean
  comportamiento: string
  base_asignacion: string
  valor_contable: number
}

type ImportacionLibroMayor = {
  id: string
  periodo: string
  archivo_nombre: string
  archivo_hash: string
  fecha_desde: string
  fecha_hasta: string
  registros_leidos: number
  registros_importados: number
  creado_en: string
}

type PersonaNomina = {
  periodo: string
  persona: string
  valor_total: number
  movimientos: number
  movimientos_clasificados: number
  estado: "CLASIFICADO" | "PENDIENTE"
}

type Cliente = {
  id: string
  nombre: string
}

type ClienteDetalle = {
  cliente_id: string
  cliente_nombre?: string
  porcentaje: number
  valor_asignado?: number
}

type MovimientoDetalle = {
  id: string
  periodo: string
  cuenta_codigo: string
  cuenta_nombre: string
  fecha_documento: string | null
  tipo_documento: TipoDocumento
  numero_documento: string | null
  proveedor: string | null
  concepto: string | null
  valor: number
  clasificacion_gerencial: ClasificacionGerencial
  subcategoria: string | null
  area: Area | null
  comportamiento: Comportamiento | null
  producto_id: string | null
  producto_codigo: string | null
  producto_nombre: string | null
  factura_id: string | null
  libro_mayor_movimiento_id: string | null
  origen_detalle: OrigenDetalle
  origen_referencia: string | null
  observaciones: string | null
  clientes: ClienteDetalle[] | null
  clientes_resumen: string | null
}

type ClasificacionGerencial =
  | "PENDIENTE"
  | "GASTO_ESPECIFICO_CLIENTE"
  | "CIF"
  | "GASTO_GENERAL"
  | "FUERA_EBITDA"
  | "COSTO_VENTA"

type TipoDocumento = "FACTURA" | "NOTA_VENTA" | "PAGO" | "ASIENTO" | "OTRO"
type Area = "PRODUCCION" | "COMERCIAL" | "ADMINISTRACION" | "DISTRIBUCION" | "OTRO"
type Comportamiento = "VARIABLE" | "SEMI_VARIABLE" | "FIJO_RANGO" | "ESCALONADO" | "NO_APLICA"
type OrigenDetalle = "FACTURA_EXISTENTE" | "LIBRO_MAYOR" | "MANUAL"

type Formulario = {
  id: string | null
  fecha_documento: string
  tipo_documento: TipoDocumento
  numero_documento: string
  proveedor: string
  concepto: string
  valor: string
  clasificacion_gerencial: ClasificacionGerencial
  subcategoria: string
  area: "" | Area
  comportamiento: "" | Comportamiento
  origen_detalle: OrigenDetalle
  origen_referencia: string
  observaciones: string
}

type DistribucionCliente = {
  cliente_id: string
  porcentaje: string
}

type FormularioMasivo = {
  clasificacion_gerencial: ClasificacionGerencial
  subcategoria: string
  area: "" | Area
  comportamiento: "" | Comportamiento
  observaciones: string
}

type ComparacionImportacion = {
  cuenta_codigo: string
  cuenta_nombre: string
  valor_contable: number
  valor_libro: number
  movimientos: number
  diferencia: number
  cuadra: boolean
}

type VistaPreviaImportacion = {
  archivoNombre: string
  archivoHash: string
  periodo: string
  fechaDesde: string
  fechaHasta: string
  registrosLeidos: number
  movimientos: MovimientoLibroMayor[]
  comparacion: ComparacionImportacion[]
  valido: boolean
}

const CLASIFICACIONES: { valor: ClasificacionGerencial; etiqueta: string }[] = [
  { valor: "PENDIENTE", etiqueta: "Pendiente de clasificación" },
  { valor: "GASTO_ESPECIFICO_CLIENTE", etiqueta: "Gasto específico de cliente" },
  { valor: "CIF", etiqueta: "CIF · Costo indirecto de fabricación" },
  { valor: "GASTO_GENERAL", etiqueta: "Gasto general" },
  { valor: "FUERA_EBITDA", etiqueta: "Fuera de EBITDA" },
  { valor: "COSTO_VENTA", etiqueta: "Costo de venta" },
]

const AREAS: { valor: Area; etiqueta: string }[] = [
  { valor: "PRODUCCION", etiqueta: "Producción" },
  { valor: "COMERCIAL", etiqueta: "Comercial" },
  { valor: "ADMINISTRACION", etiqueta: "Administración" },
  { valor: "DISTRIBUCION", etiqueta: "Distribución" },
  { valor: "OTRO", etiqueta: "Otro" },
]

const COMPORTAMIENTOS: { valor: Comportamiento; etiqueta: string }[] = [
  { valor: "VARIABLE", etiqueta: "Variable" },
  { valor: "SEMI_VARIABLE", etiqueta: "Semi-variable" },
  { valor: "FIJO_RANGO", etiqueta: "Fijo en rango" },
  { valor: "ESCALONADO", etiqueta: "Escalonado" },
  { valor: "NO_APLICA", etiqueta: "No aplica" },
]

const TIPOS_DOCUMENTO: { valor: TipoDocumento; etiqueta: string }[] = [
  { valor: "FACTURA", etiqueta: "Factura" },
  { valor: "NOTA_VENTA", etiqueta: "Nota de venta" },
  { valor: "PAGO", etiqueta: "Pago" },
  { valor: "ASIENTO", etiqueta: "Asiento contable" },
  { valor: "OTRO", etiqueta: "Otro" },
]

const ORIGENES: { valor: OrigenDetalle; etiqueta: string }[] = [
  { valor: "MANUAL", etiqueta: "Ingreso manual" },
  { valor: "LIBRO_MAYOR", etiqueta: "Libro Mayor" },
  { valor: "FACTURA_EXISTENTE", etiqueta: "Factura existente en CIBUSPAN ONE" },
]

const DISTRIBUCION_INICIAL: DistribucionCliente[] = [
  { cliente_id: "", porcentaje: "100" },
]

function distribuirEnPartesIguales(
  filas: DistribucionCliente[],
): DistribucionCliente[] {
  if (filas.length === 0) return []

  // Trabajamos en centésimas de porcentaje para que el total sea
  // exactamente 100,00%, incluso con 3, 6, 7, etc. clientes.
  const totalCentésimas = 10_000
  const base = Math.floor(totalCentésimas / filas.length)
  const resto = totalCentésimas - base * filas.length

  return filas.map((fila, indice) => ({
    ...fila,
    porcentaje: String((base + (indice < resto ? 1 : 0)) / 100),
  }))
}

const FORMULARIO_MASIVO_INICIAL: FormularioMasivo = {
  clasificacion_gerencial: "PENDIENTE",
  subcategoria: "",
  area: "",
  comportamiento: "",
  observaciones: "",
}

function formularioVacio(cuenta?: CuentaConciliacion | null): Formulario {
  const esNomina = cuenta?.fuente_detalle === "NOMINA"
  const esTransporte = cuenta?.cuenta_codigo === "6.1.01.2.13.01"
  return {
    id: null,
    fecha_documento: "",
    tipo_documento: esNomina ? "ASIENTO" : "FACTURA",
    numero_documento: "",
    proveedor: "",
    concepto: "",
    valor: "",
    clasificacion_gerencial: esNomina ? "GASTO_ESPECIFICO_CLIENTE" : "PENDIENTE",
    subcategoria: esNomina ? "NOMINA VENTAS" : esTransporte ? "TRANSPORTE" : "",
    area: esNomina ? "COMERCIAL" : esTransporte ? "DISTRIBUCION" : "",
    comportamiento: esNomina || esTransporte ? "FIJO_RANGO" : "",
    origen_detalle: "MANUAL",
    origen_referencia: "",
    observaciones: "",
  }
}

function dinero(valor: number | null | undefined) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(valor ?? 0))
}

function porcentaje(valor: number | null | undefined) {
  return `${Number(valor ?? 0).toFixed(1)}%`
}

function etiquetaClasificacion(valor: ClasificacionGerencial) {
  return CLASIFICACIONES.find((item) => item.valor === valor)?.etiqueta ?? valor
}

function claseEstado(estado: string) {
  if (estado === "CONCILIADO") return "ok"
  if (estado.includes("FALTA CLASIFICAR")) return "advertencia"
  if (estado === "SIN DETALLE") return "pendiente"
  return "incompleto"
}

export default function ClasificacionGastos() {
  const inputLibroMayorRef = useRef<HTMLInputElement>(null)

  const [cuentas, setCuentas] = useState<CuentaConciliacion[]>([])
  const [automaticas, setAutomaticas] = useState<CuentaAutomatica[]>([])
  const [importaciones, setImportaciones] = useState<ImportacionLibroMayor[]>([])
  const [personasNomina, setPersonasNomina] = useState<PersonaNomina[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [periodo, setPeriodo] = useState("")
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string>("")
  const [movimientos, setMovimientos] = useState<MovimientoDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarAutomaticas, setMostrarAutomaticas] = useState(false)
  const [formulario, setFormulario] = useState<Formulario>(formularioVacio())
  const [distribucion, setDistribucion] = useState<DistribucionCliente[]>(DISTRIBUCION_INICIAL)
  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaImportacion | null>(null)

  const [personaEditando, setPersonaEditando] = useState<string | null>(null)
  const [clasificacionNomina, setClasificacionNomina] = useState<
    "GASTO_ESPECIFICO_CLIENTE" | "GASTO_GENERAL"
  >("GASTO_ESPECIFICO_CLIENTE")
  const [distribucionNomina, setDistribucionNomina] = useState<DistribucionCliente[]>(
    DISTRIBUCION_INICIAL,
  )
  const [guardandoNomina, setGuardandoNomina] = useState(false)

  const [seleccionados, setSeleccionados] = useState<string[]>([])
  const [mostrarMasivo, setMostrarMasivo] = useState(false)
  const [formularioMasivo, setFormularioMasivo] = useState<FormularioMasivo>(
    FORMULARIO_MASIVO_INICIAL,
  )
  const [distribucionMasiva, setDistribucionMasiva] = useState<DistribucionCliente[]>(
    DISTRIBUCION_INICIAL,
  )
  const [guardandoMasivo, setGuardandoMasivo] = useState(false)

  async function cargarBase() {
    setCargando(true)
    setError("")

    const [conciliacionRes, clientesRes, automaticasRes, importacionesRes, personasRes] =
      await Promise.all([
        supabase
          .from("fin_vw_conciliacion_cuentas_mixtas")
          .select("*")
          .order("periodo", { ascending: false })
          .order("cuenta_codigo", { ascending: true }),
        supabase
          .from("clientes")
          .select("id,nombre")
          .eq("activo", true)
          .order("nombre", { ascending: true }),
        supabase
          .from("fin_vw_clasificacion_automatica_periodo")
          .select("*")
          .order("periodo", { ascending: false })
          .order("cuenta_codigo", { ascending: true }),
        supabase
          .from("fin_libro_mayor_importaciones")
          .select("*")
          .order("periodo", { ascending: false }),
        supabase
          .from("fin_vw_nomina_personas_clasificacion")
          .select("*")
          .order("periodo", { ascending: false })
          .order("persona", { ascending: true }),
      ])

    const primerError =
      conciliacionRes.error ??
      clientesRes.error ??
      automaticasRes.error ??
      importacionesRes.error ??
      personasRes.error

    if (primerError) {
      setError(primerError.message)
      setCargando(false)
      return
    }

    const filas = (conciliacionRes.data ?? []).map((fila) => ({
      ...fila,
      valor_contable: Number(fila.valor_contable ?? 0),
      valor_registrado: Number(fila.valor_registrado ?? 0),
      valor_clasificado: Number(fila.valor_clasificado ?? 0),
      valor_pendiente_clasificacion: Number(fila.valor_pendiente_clasificacion ?? 0),
      valor_pendiente_documentos: Number(fila.valor_pendiente_documentos ?? 0),
      movimientos_registrados: Number(fila.movimientos_registrados ?? 0),
      movimientos_pendientes: Number(fila.movimientos_pendientes ?? 0),
      cobertura_clasificacion_pct: Number(fila.cobertura_clasificacion_pct ?? 0),
    })) as CuentaConciliacion[]

    setCuentas(filas)
    setClientes((clientesRes.data ?? []) as Cliente[])
    setAutomaticas(
      (automaticasRes.data ?? []).map((fila) => ({
        ...fila,
        valor_contable: Number(fila.valor_contable ?? 0),
      })) as CuentaAutomatica[],
    )
    setImportaciones(
      (importacionesRes.data ?? []).map((fila) => ({
        ...fila,
        registros_leidos: Number(fila.registros_leidos ?? 0),
        registros_importados: Number(fila.registros_importados ?? 0),
      })) as ImportacionLibroMayor[],
    )
    setPersonasNomina(
      (personasRes.data ?? []).map((fila) => ({
        ...fila,
        valor_total: Number(fila.valor_total ?? 0),
        movimientos: Number(fila.movimientos ?? 0),
        movimientos_clasificados: Number(fila.movimientos_clasificados ?? 0),
      })) as PersonaNomina[],
    )

    if (!periodo && filas.length > 0) {
      setPeriodo(filas[0].periodo.slice(0, 7))
    }

    setCargando(false)
  }

  async function cargarDetalle(codigo: string, mes = periodo) {
    if (!codigo || !mes) {
      setMovimientos([])
      return
    }

    setCargandoDetalle(true)
    setError("")

    const { data, error: errorDetalle } = await supabase
      .from("fin_vw_resultado_clasificacion_detalle")
      .select("*")
      .eq("periodo", `${mes}-01`)
      .eq("cuenta_codigo", codigo)
      .order("fecha_documento", { ascending: true, nullsFirst: false })

    if (errorDetalle) {
      setError(errorDetalle.message)
      setMovimientos([])
      setCargandoDetalle(false)
      return
    }

    const filas = (data ?? []).map((fila) => ({
      ...fila,
      valor: Number(fila.valor ?? 0),
      clientes: Array.isArray(fila.clientes) ? fila.clientes : [],
    })) as MovimientoDetalle[]

    setMovimientos(filas)
    setCargandoDetalle(false)
  }

  useEffect(() => {
    void cargarBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!periodo) return

    const disponibles = cuentas.filter((fila) => fila.periodo.startsWith(periodo))
    if (disponibles.length === 0) {
      setCuentaSeleccionada("")
      setMovimientos([])
      return
    }

    if (!disponibles.some((fila) => fila.cuenta_codigo === cuentaSeleccionada)) {
      const primeraPendiente =
        disponibles.find((fila) => fila.estado !== "CONCILIADO") ?? disponibles[0]
      setCuentaSeleccionada(primeraPendiente.cuenta_codigo)
    }
  }, [periodo, cuentas, cuentaSeleccionada])

  useEffect(() => {
    if (!cuentaSeleccionada || !periodo) return
    void cargarDetalle(cuentaSeleccionada, periodo)
    setMostrarFormulario(false)
    setFormulario(formularioVacio(cuentaActual(cuentas, periodo, cuentaSeleccionada)))
    setDistribucion(DISTRIBUCION_INICIAL)
    setPersonaEditando(null)
    setSeleccionados([])
    setMostrarMasivo(false)
    setFormularioMasivo(FORMULARIO_MASIVO_INICIAL)
    setDistribucionMasiva(DISTRIBUCION_INICIAL)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaSeleccionada, periodo])

  const periodosDisponibles = useMemo(() => {
    return Array.from(new Set(cuentas.map((fila) => fila.periodo.slice(0, 7)))).sort().reverse()
  }, [cuentas])

  const cuentasPeriodo = useMemo(
    () => cuentas.filter((fila) => fila.periodo.startsWith(periodo)),
    [cuentas, periodo],
  )

  const automaticasPeriodo = useMemo(
    () => automaticas.filter((fila) => fila.periodo.startsWith(periodo)),
    [automaticas, periodo],
  )

  const personasPeriodo = useMemo(
    () => personasNomina.filter((fila) => fila.periodo.startsWith(periodo)),
    [personasNomina, periodo],
  )

  const importacionPeriodo = useMemo(
    () => importaciones.find((fila) => fila.periodo.startsWith(periodo)) ?? null,
    [importaciones, periodo],
  )

  const cuenta = useMemo(
    () => cuentaActual(cuentas, periodo, cuentaSeleccionada),
    [cuentas, periodo, cuentaSeleccionada],
  )

  const movimientoEditado = useMemo(
    () => movimientos.find((fila) => fila.id === formulario.id) ?? null,
    [movimientos, formulario.id],
  )

  const esMovimientoLibroMayor = movimientoEditado?.origen_detalle === "LIBRO_MAYOR"

  const resumen = useMemo(() => {
    return cuentasPeriodo.reduce(
      (acc, fila) => {
        acc.contable += fila.valor_contable
        acc.registrado += fila.valor_registrado
        acc.clasificado += fila.valor_clasificado
        acc.pendiente += fila.valor_pendiente_clasificacion
        if (fila.estado === "CONCILIADO") acc.conciliadas += 1
        return acc
      },
      { contable: 0, registrado: 0, clasificado: 0, pendiente: 0, conciliadas: 0 },
    )
  }, [cuentasPeriodo])

  const sumaDistribucion = useMemo(
    () => distribucion.reduce((total, fila) => total + Number(fila.porcentaje || 0), 0),
    [distribucion],
  )

  const sumaDistribucionNomina = useMemo(
    () =>
      distribucionNomina.reduce(
        (total, fila) => total + Number(fila.porcentaje || 0),
        0,
      ),
    [distribucionNomina],
  )

  const pendientesSeleccionables = useMemo(
    () =>
      cuenta?.fuente_detalle === "NOMINA"
        ? []
        : movimientos.filter((fila) => fila.clasificacion_gerencial === "PENDIENTE"),
    [movimientos, cuenta],
  )

  const movimientosSeleccionados = useMemo(
    () => movimientos.filter((fila) => seleccionados.includes(fila.id)),
    [movimientos, seleccionados],
  )

  const todosPendientesSeleccionados =
    pendientesSeleccionables.length > 0 &&
    pendientesSeleccionables.every((fila) => seleccionados.includes(fila.id))

  const sumaSeleccionados = useMemo(
    () => movimientosSeleccionados.reduce((total, fila) => total + Number(fila.valor || 0), 0),
    [movimientosSeleccionados],
  )

  const sumaDistribucionMasiva = useMemo(
    () =>
      distribucionMasiva.reduce(
        (total, fila) => total + Number(fila.porcentaje || 0),
        0,
      ),
    [distribucionMasiva],
  )

  function abrirNuevo() {
    setMensaje("")
    setError("")
    setFormulario(formularioVacio(cuenta))
    setDistribucion(DISTRIBUCION_INICIAL)
    setMostrarFormulario(true)
  }

  function editarMovimiento(movimiento: MovimientoDetalle) {
    setMensaje("")
    setError("")
    setFormulario({
      id: movimiento.id,
      fecha_documento: movimiento.fecha_documento ?? "",
      tipo_documento: movimiento.tipo_documento,
      numero_documento: movimiento.numero_documento ?? "",
      proveedor: movimiento.proveedor ?? "",
      concepto: movimiento.concepto ?? "",
      valor: String(movimiento.valor),
      clasificacion_gerencial: movimiento.clasificacion_gerencial,
      subcategoria: movimiento.subcategoria ?? "",
      area: movimiento.area ?? "",
      comportamiento: movimiento.comportamiento ?? "",
      origen_detalle: movimiento.origen_detalle,
      origen_referencia: movimiento.origen_referencia ?? "",
      observaciones: movimiento.observaciones ?? "",
    })

    const clientesMovimiento = Array.isArray(movimiento.clientes) ? movimiento.clientes : []
    setDistribucion(
      clientesMovimiento.length > 0
        ? clientesMovimiento.map((fila) => ({
            cliente_id: fila.cliente_id,
            porcentaje: String(Number(fila.porcentaje)),
          }))
        : DISTRIBUCION_INICIAL,
    )
    setMostrarFormulario(true)
    window.setTimeout(() => {
      document
        .getElementById("clasificacion-formulario")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 50)
  }

  function actualizarFormulario<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }))
  }

  function cambiarClasificacion(valor: ClasificacionGerencial) {
    actualizarFormulario("clasificacion_gerencial", valor)
    if (valor !== "GASTO_ESPECIFICO_CLIENTE") {
      setDistribucion(DISTRIBUCION_INICIAL)
    }
  }

  function cambiarDistribucion(
    indice: number,
    campo: keyof DistribucionCliente,
    valor: string,
  ) {
    setDistribucion((anterior) =>
      anterior.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)),
    )
  }

  function agregarCliente() {
    setDistribucion((anterior) =>
      distribuirEnPartesIguales([
        ...anterior,
        { cliente_id: "", porcentaje: "" },
      ]),
    )
  }

  function quitarCliente(indice: number) {
    setDistribucion((anterior) => {
      const nuevas = anterior.filter((_, i) => i !== indice)
      return nuevas.length > 0
        ? distribuirEnPartesIguales(nuevas)
        : DISTRIBUCION_INICIAL
    })
  }

  async function guardarMovimiento() {
    if (!cuenta || !periodo) return

    setError("")
    setMensaje("")

    const valor = Number(formulario.valor)
    if (!Number.isFinite(valor) || valor === 0) {
      setError("Ingresa un valor distinto de cero.")
      return
    }

    let clientesRpc: { cliente_id: string; porcentaje: number }[] = []
    if (formulario.clasificacion_gerencial === "GASTO_ESPECIFICO_CLIENTE") {
      clientesRpc = distribucion
        .filter((fila) => fila.cliente_id)
        .map((fila) => ({
          cliente_id: fila.cliente_id,
          porcentaje: Number(fila.porcentaje || 0),
        }))

      if (clientesRpc.length === 0) {
        setError("Selecciona al menos un cliente.")
        return
      }

      if (Math.abs(sumaDistribucion - 100) > 0.01) {
        setError("La distribución entre clientes debe sumar 100%.")
        return
      }
    }

    setGuardando(true)

    const datosRpc = {
      id: formulario.id,
      periodo: `${periodo}-01`,
      cuenta_codigo: cuenta.cuenta_codigo,
      fecha_documento: formulario.fecha_documento || null,
      tipo_documento: formulario.tipo_documento,
      numero_documento: formulario.numero_documento.trim() || null,
      proveedor: formulario.proveedor.trim() || null,
      concepto: formulario.concepto.trim() || null,
      valor,
      clasificacion_gerencial: formulario.clasificacion_gerencial,
      subcategoria: formulario.subcategoria.trim() || null,
      area: formulario.area || null,
      comportamiento: formulario.comportamiento || null,
      producto_id: null,
      factura_id: null,
      origen_detalle: formulario.origen_detalle,
      origen_referencia: formulario.origen_referencia.trim() || null,
      observaciones: formulario.observaciones.trim() || null,
    }

    const { error: errorGuardar } = await supabase.rpc(
      "fin_guardar_resultado_clasificacion_detalle",
      {
        p_datos: datosRpc,
        p_clientes: clientesRpc,
      },
    )

    if (errorGuardar) {
      setError(errorGuardar.message)
      setGuardando(false)
      return
    }

    setMensaje(
      formulario.id ? "Clasificación actualizada correctamente." : "Movimiento registrado correctamente.",
    )
    setMostrarFormulario(false)
    setFormulario(formularioVacio(cuenta))
    setDistribucion(DISTRIBUCION_INICIAL)

    await cargarBase()
    await cargarDetalle(cuenta.cuenta_codigo, periodo)
    setGuardando(false)
  }

  function alternarSeleccion(id: string) {
    setSeleccionados((anterior) =>
      anterior.includes(id)
        ? anterior.filter((item) => item !== id)
        : [...anterior, id],
    )
  }

  function alternarTodosPendientes() {
    if (todosPendientesSeleccionados) {
      setSeleccionados((anterior) =>
        anterior.filter(
          (id) => !pendientesSeleccionables.some((fila) => fila.id === id),
        ),
      )
      return
    }

    setSeleccionados((anterior) =>
      Array.from(
        new Set([
          ...anterior,
          ...pendientesSeleccionables.map((fila) => fila.id),
        ]),
      ),
    )
  }

  function abrirClasificacionMasiva() {
    if (movimientosSeleccionados.length === 0) {
      setError("Selecciona al menos un movimiento pendiente.")
      return
    }

    const primera = movimientosSeleccionados[0]
    setFormularioMasivo({
      clasificacion_gerencial: "PENDIENTE",
      subcategoria: primera.subcategoria ?? "",
      area: primera.area ?? "",
      comportamiento: primera.comportamiento ?? "",
      observaciones: "",
    })
    setDistribucionMasiva(DISTRIBUCION_INICIAL)
    setMostrarMasivo(true)
    setMostrarFormulario(false)
    setError("")
    setMensaje("")
  }

  function actualizarFormularioMasivo<K extends keyof FormularioMasivo>(
    campo: K,
    valor: FormularioMasivo[K],
  ) {
    setFormularioMasivo((anterior) => ({ ...anterior, [campo]: valor }))
  }

  function cambiarClasificacionMasiva(valor: ClasificacionGerencial) {
    actualizarFormularioMasivo("clasificacion_gerencial", valor)
    if (valor !== "GASTO_ESPECIFICO_CLIENTE") {
      setDistribucionMasiva(DISTRIBUCION_INICIAL)
    }
  }

  function cambiarDistribucionMasiva(
    indice: number,
    campo: keyof DistribucionCliente,
    valor: string,
  ) {
    setDistribucionMasiva((anterior) =>
      anterior.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)),
    )
  }

  function agregarClienteMasivo() {
    setDistribucionMasiva((anterior) =>
      distribuirEnPartesIguales([
        ...anterior,
        { cliente_id: "", porcentaje: "" },
      ]),
    )
  }

  function quitarClienteMasivo(indice: number) {
    setDistribucionMasiva((anterior) => {
      const nuevas = anterior.filter((_, i) => i !== indice)
      return nuevas.length > 0
        ? distribuirEnPartesIguales(nuevas)
        : DISTRIBUCION_INICIAL
    })
  }

  async function guardarClasificacionMasiva() {
    if (!cuenta || !periodo || movimientosSeleccionados.length === 0) return

    setError("")
    setMensaje("")

    if (formularioMasivo.clasificacion_gerencial === "PENDIENTE") {
      setError("Selecciona una clasificación para los movimientos marcados.")
      return
    }

    let clientesRpc: { cliente_id: string; porcentaje: number }[] = []
    if (formularioMasivo.clasificacion_gerencial === "GASTO_ESPECIFICO_CLIENTE") {
      clientesRpc = distribucionMasiva
        .filter((fila) => fila.cliente_id)
        .map((fila) => ({
          cliente_id: fila.cliente_id,
          porcentaje: Number(fila.porcentaje || 0),
        }))

      if (clientesRpc.length === 0) {
        setError("Selecciona al menos un cliente para la clasificación masiva.")
        return
      }

      if (Math.abs(sumaDistribucionMasiva - 100) > 0.01) {
        setError("La distribución masiva entre clientes debe sumar exactamente 100%.")
        return
      }

      if (new Set(clientesRpc.map((fila) => fila.cliente_id)).size !== clientesRpc.length) {
        setError("No puedes repetir el mismo cliente en la distribución masiva.")
        return
      }
    }

    setGuardandoMasivo(true)

    try {
      for (const movimiento of movimientosSeleccionados) {
        const datosRpc = {
          id: movimiento.id,
          periodo: `${periodo}-01`,
          cuenta_codigo: movimiento.cuenta_codigo,
          fecha_documento: movimiento.fecha_documento,
          tipo_documento: movimiento.tipo_documento,
          numero_documento: movimiento.numero_documento,
          proveedor: movimiento.proveedor,
          concepto: movimiento.concepto,
          valor: movimiento.valor,
          clasificacion_gerencial: formularioMasivo.clasificacion_gerencial,
          subcategoria: formularioMasivo.subcategoria.trim() || movimiento.subcategoria || null,
          area: formularioMasivo.area || movimiento.area || null,
          comportamiento:
            formularioMasivo.comportamiento || movimiento.comportamiento || null,
          producto_id: movimiento.producto_id,
          factura_id: movimiento.factura_id,
          origen_detalle: movimiento.origen_detalle,
          origen_referencia: movimiento.origen_referencia,
          observaciones:
            formularioMasivo.observaciones.trim() || movimiento.observaciones || null,
        }

        const { error: errorGuardar } = await supabase.rpc(
          "fin_guardar_resultado_clasificacion_detalle",
          {
            p_datos: datosRpc,
            p_clientes: clientesRpc,
          },
        )

        if (errorGuardar) throw errorGuardar
      }

      const cantidad = movimientosSeleccionados.length
      setMensaje(
        `${cantidad} movimiento${cantidad === 1 ? "" : "s"} clasificado${cantidad === 1 ? "" : "s"} en una sola operación.`,
      )
      setSeleccionados([])
      setMostrarMasivo(false)
      setFormularioMasivo(FORMULARIO_MASIVO_INICIAL)
      setDistribucionMasiva(DISTRIBUCION_INICIAL)

      await cargarBase()
      await cargarDetalle(cuenta.cuenta_codigo, periodo)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo completar la clasificación masiva.",
      )
    } finally {
      setGuardandoMasivo(false)
    }
  }

  async function eliminarMovimiento(movimiento: MovimientoDetalle) {
    if (movimiento.origen_detalle === "LIBRO_MAYOR") {
      setError("Los movimientos importados desde el Libro Mayor no se eliminan desde esta pantalla.")
      return
    }

    const confirmar = window.confirm(
      `¿Eliminar ${movimiento.numero_documento || movimiento.concepto || "este movimiento"} por ${dinero(movimiento.valor)}?`,
    )
    if (!confirmar) return

    setError("")
    setMensaje("")

    const { error: errorEliminar } = await supabase.rpc(
      "fin_eliminar_resultado_clasificacion_detalle",
      { p_id: movimiento.id },
    )

    if (errorEliminar) {
      setError(errorEliminar.message)
      return
    }

    setMensaje("Movimiento eliminado.")
    await cargarBase()
    await cargarDetalle(movimiento.cuenta_codigo, periodo)
  }

  async function seleccionarLibroMayor(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ""
    if (!archivo || !periodo) return

    setError("")
    setMensaje("")
    setVistaPrevia(null)
    setImportando(true)

    try {
      const [resultado, hash] = await Promise.all([
        leerLibroMayorPdf(
          archivo,
          cuentasPeriodo.map((fila) => fila.cuenta_codigo),
        ),
        calcularHashArchivo(archivo),
      ])

      if (resultado.periodo.slice(0, 7) !== periodo) {
        throw new Error(
          `El PDF corresponde a ${nombreMes(resultado.periodo.slice(0, 7))}, pero en la pantalla está seleccionado ${nombreMes(periodo)}.`,
        )
      }

      const porCuenta = new Map<string, { valor: number; movimientos: number }>()
      for (const movimiento of resultado.movimientos) {
        const actual = porCuenta.get(movimiento.cuenta_codigo) ?? { valor: 0, movimientos: 0 }
        actual.valor += movimiento.valor
        actual.movimientos += 1
        porCuenta.set(movimiento.cuenta_codigo, actual)
      }

      const comparacion = cuentasPeriodo.map((fila) => {
        const libro = porCuenta.get(fila.cuenta_codigo) ?? { valor: 0, movimientos: 0 }
        const valorLibro = redondear(libro.valor)
        const diferencia = redondear(fila.valor_contable - valorLibro)
        return {
          cuenta_codigo: fila.cuenta_codigo,
          cuenta_nombre: fila.cuenta_nombre,
          valor_contable: fila.valor_contable,
          valor_libro: valorLibro,
          movimientos: libro.movimientos,
          diferencia,
          cuadra: Math.abs(diferencia) <= 0.02,
        }
      })

      const valido = comparacion.every((fila) => fila.cuadra)
      setVistaPrevia({
        archivoNombre: archivo.name,
        archivoHash: hash,
        periodo: resultado.periodo,
        fechaDesde: resultado.fecha_desde,
        fechaHasta: resultado.fecha_hasta,
        registrosLeidos: resultado.registros_leidos,
        movimientos: resultado.movimientos,
        comparacion,
        valido,
      })

      if (!valido) {
        setError(
          "El PDF fue leído, pero al menos una cuenta no cuadra contra el Estado de Resultados. No se permitirá importarlo hasta que todas las diferencias sean $0,00.",
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el Libro Mayor.")
    } finally {
      setImportando(false)
    }
  }

  async function confirmarImportacion() {
    if (!vistaPrevia || !vistaPrevia.valido) return

    setImportando(true)
    setError("")
    setMensaje("")

    const { error: errorImportar } = await supabase.rpc("fin_importar_libro_mayor", {
      p_meta: {
        periodo: vistaPrevia.periodo,
        archivo_nombre: vistaPrevia.archivoNombre,
        archivo_hash: vistaPrevia.archivoHash,
        fecha_desde: vistaPrevia.fechaDesde,
        fecha_hasta: vistaPrevia.fechaHasta,
        registros_leidos: vistaPrevia.registrosLeidos,
      },
      p_movimientos: vistaPrevia.movimientos,
    })

    if (errorImportar) {
      setError(errorImportar.message)
      setImportando(false)
      return
    }

    setVistaPrevia(null)
    setMensaje(
      `Libro Mayor de ${nombreMes(periodo)} importado y conciliado. Ahora solo faltan las decisiones de clasificación.`,
    )
    await cargarBase()
    if (cuentaSeleccionada) await cargarDetalle(cuentaSeleccionada, periodo)
    setImportando(false)
  }

  function abrirPersona(persona: string) {
    setPersonaEditando(persona)
    setClasificacionNomina("GASTO_ESPECIFICO_CLIENTE")
    setDistribucionNomina(DISTRIBUCION_INICIAL)
    setError("")
    setMensaje("")
  }

  function cambiarDistribucionNomina(
    indice: number,
    campo: keyof DistribucionCliente,
    valor: string,
  ) {
    setDistribucionNomina((anterior) =>
      anterior.map((fila, i) => (i === indice ? { ...fila, [campo]: valor } : fila)),
    )
  }

  function agregarClienteNomina() {
    setDistribucionNomina((anterior) =>
      distribuirEnPartesIguales([
        ...anterior,
        { cliente_id: "", porcentaje: "" },
      ]),
    )
  }

  function quitarClienteNomina(indice: number) {
    setDistribucionNomina((anterior) => {
      const nuevas = anterior.filter((_, i) => i !== indice)
      return nuevas.length > 0
        ? distribuirEnPartesIguales(nuevas)
        : DISTRIBUCION_INICIAL
    })
  }

  async function guardarPersonaNomina() {
    if (!personaEditando || !periodo) return

    setError("")
    setMensaje("")

    let clientesRpc: { cliente_id: string; porcentaje: number }[] = []
    if (clasificacionNomina === "GASTO_ESPECIFICO_CLIENTE") {
      clientesRpc = distribucionNomina
        .filter((fila) => fila.cliente_id)
        .map((fila) => ({
          cliente_id: fila.cliente_id,
          porcentaje: Number(fila.porcentaje || 0),
        }))

      if (clientesRpc.length === 0) {
        setError("Selecciona al menos un cliente para esta persona.")
        return
      }

      if (Math.abs(sumaDistribucionNomina - 100) > 0.01) {
        setError("La distribución de la persona debe sumar exactamente 100%.")
        return
      }
    }

    setGuardandoNomina(true)

    const { data, error: errorNomina } = await supabase.rpc(
      "fin_clasificar_nomina_persona",
      {
        p_periodo: `${periodo}-01`,
        p_persona: personaEditando,
        p_clasificacion: clasificacionNomina,
        p_clientes: clientesRpc,
      },
    )

    if (errorNomina) {
      setError(errorNomina.message)
      setGuardandoNomina(false)
      return
    }

    setMensaje(
      `${personaEditando}: distribución aplicada a ${Number(data ?? 0)} movimiento(s) de nómina.`,
    )
    setPersonaEditando(null)
    await cargarBase()
    if (cuentaSeleccionada) await cargarDetalle(cuentaSeleccionada, periodo)
    setGuardandoNomina(false)
  }

  if (cargando) {
    return (
      <section className="cg-page">
        <style>{css}</style>
        <div className="cg-loading">Cargando conciliación financiera…</div>
      </section>
    )
  }

  return (
    <section className="cg-page">
      <style>{css}</style>

      <header className="cg-header">
        <div>
          <span className="cg-kicker">CIBUSPAN ONE · Pagos y Finanzas</span>
          <h1>Clasificación de gastos</h1>
          <p>
            Estado de Resultados = total oficial. Libro Mayor = detalle. Tú solo decides las
            partidas que realmente requieren clasificación.
          </p>
        </div>

        <div className="cg-header-actions">
          <label className="cg-periodo">
            <span>Periodo</span>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {periodosDisponibles.map((mes) => (
                <option key={mes} value={mes}>
                  {nombreMes(mes)}
                </option>
              ))}
            </select>
          </label>

          <input
            ref={inputLibroMayorRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => void seleccionarLibroMayor(e)}
          />

          <button
            type="button"
            className={`cg-btn ${importacionPeriodo ? "cg-btn-secundario" : "cg-btn-primario"}`}
            onClick={() => inputLibroMayorRef.current?.click()}
            disabled={Boolean(importacionPeriodo) || importando || !periodo}
            title={
              importacionPeriodo
                ? `Ya cargado: ${importacionPeriodo.archivo_nombre}`
                : "Seleccionar Libro Mayor PDF"
            }
          >
            {importando
              ? "Leyendo PDF…"
              : importacionPeriodo
                ? "✓ Libro Mayor cargado"
                : "Subir Libro Mayor"}
          </button>
        </div>
      </header>

      {importacionPeriodo && (
        <div className="cg-import-ok">
          <strong>Libro Mayor conciliado:</strong> {importacionPeriodo.archivo_nombre} · {" "}
          {importacionPeriodo.registros_importados} movimientos relevantes importados.
        </div>
      )}

      {error && <div className="cg-alert cg-alert-error">{error}</div>}
      {mensaje && <div className="cg-alert cg-alert-ok">{mensaje}</div>}

      {vistaPrevia && (
        <section className="cg-preview-card">
          <div className="cg-preview-header">
            <div>
              <span className="cg-kicker">Vista previa del Libro Mayor</span>
              <h2>{vistaPrevia.archivoNombre}</h2>
              <p>
                {fechaCorta(vistaPrevia.fechaDesde)} al {fechaCorta(vistaPrevia.fechaHasta)} · {" "}
                {vistaPrevia.movimientos.length} movimientos relevantes encontrados.
              </p>
            </div>
            <span className={`cg-preview-status ${vistaPrevia.valido ? "ok" : "mal"}`}>
              {vistaPrevia.valido ? "Todas las cuentas cuadran" : "Hay diferencias"}
            </span>
          </div>

          <div className="cg-tabla-scroll">
            <table className="cg-tabla cg-preview-table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="numero">Estado de Resultados</th>
                  <th className="numero">Libro Mayor</th>
                  <th className="numero">Mov.</th>
                  <th className="numero">Diferencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {vistaPrevia.comparacion.map((fila) => (
                  <tr key={fila.cuenta_codigo}>
                    <td>
                      <strong>{fila.cuenta_nombre}</strong>
                      <small>{fila.cuenta_codigo}</small>
                    </td>
                    <td className="numero">{dinero(fila.valor_contable)}</td>
                    <td className="numero">{dinero(fila.valor_libro)}</td>
                    <td className="numero">{fila.movimientos}</td>
                    <td className="numero">{dinero(fila.diferencia)}</td>
                    <td>
                      <span className={`cg-estado ${fila.cuadra ? "ok" : "incompleto"}`}>
                        {fila.cuadra ? "Cuadra" : "Revisar"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cg-form-actions">
            <button
              type="button"
              className="cg-btn cg-btn-secundario"
              onClick={() => setVistaPrevia(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="cg-btn cg-btn-primario"
              disabled={!vistaPrevia.valido || importando}
              onClick={() => void confirmarImportacion()}
            >
              {importando ? "Importando…" : "Importar y conciliar"}
            </button>
          </div>
        </section>
      )}

      <div className="cg-resumen-grid">
        <TarjetaResumen
          titulo="Total a clasificar"
          valor={dinero(resumen.contable)}
          detalle={`${cuentasPeriodo.length} cuentas con detalle`}
        />
        <TarjetaResumen
          titulo="Registrado"
          valor={dinero(resumen.registrado)}
          detalle={
            resumen.contable > 0
              ? porcentaje((resumen.registrado / resumen.contable) * 100)
              : "100%"
          }
        />
        <TarjetaResumen
          titulo="Clasificado"
          valor={dinero(resumen.clasificado)}
          detalle={
            resumen.contable > 0
              ? porcentaje((resumen.clasificado / resumen.contable) * 100)
              : "100%"
          }
        />
        <TarjetaResumen
          titulo="Conciliadas"
          valor={`${resumen.conciliadas}/${cuentasPeriodo.length}`}
          detalle={`${dinero(resumen.pendiente)} pendiente de clasificar`}
        />
      </div>

      <div className="cg-layout">
        <aside className="cg-cuentas-panel">
          <div className="cg-panel-title">
            <div>
              <h2>Requieren decisión</h2>
              <p>Solo estas cuentas necesitan apertura o asignación.</p>
            </div>
          </div>

          <div className="cg-cuentas-lista">
            {cuentasPeriodo.map((fila) => (
              <button
                key={fila.cuenta_codigo}
                type="button"
                className={`cg-cuenta ${cuentaSeleccionada === fila.cuenta_codigo ? "activa" : ""}`}
                onClick={() => setCuentaSeleccionada(fila.cuenta_codigo)}
              >
                <div className="cg-cuenta-top">
                  <span className="cg-cuenta-codigo">{fila.cuenta_codigo}</span>
                  <span className={`cg-estado ${claseEstado(fila.estado)}`}>
                    {textoEstado(fila.estado)}
                  </span>
                </div>
                <strong>{fila.cuenta_nombre}</strong>
                <div className="cg-cuenta-valores">
                  <span>{dinero(fila.valor_contable)}</span>
                  <span>{porcentaje(fila.cobertura_clasificacion_pct)}</span>
                </div>
                <div className="cg-barra">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(0, fila.cobertura_clasificacion_pct))}%`,
                    }}
                  />
                </div>
                <small>
                  Registrado: {dinero(fila.valor_registrado)} · Pendiente: {" "}
                  {dinero(fila.valor_pendiente_clasificacion)}
                </small>
              </button>
            ))}

            <div className="cg-auto-block">
              <button
                type="button"
                className="cg-auto-toggle"
                onClick={() => setMostrarAutomaticas((valor) => !valor)}
              >
                <span>
                  <strong>Clasificadas automáticamente</strong>
                  <small>{automaticasPeriodo.length} cuentas del periodo</small>
                </span>
                <b>{mostrarAutomaticas ? "−" : "+"}</b>
              </button>

              {mostrarAutomaticas && (
                <div className="cg-auto-lista">
                  {automaticasPeriodo.map((fila) => (
                    <div className="cg-auto-fila" key={fila.cuenta_codigo}>
                      <div>
                        <span className="cg-cuenta-codigo">{fila.cuenta_codigo}</span>
                        <strong>{fila.cuenta_nombre}</strong>
                        <small>{etiquetaClasificacion(fila.clasificacion_gerencial)}</small>
                      </div>
                      <b>{dinero(fila.valor_contable)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="cg-detalle-panel">
          {!cuenta ? (
            <div className="cg-vacio">No hay cuentas para el periodo seleccionado.</div>
          ) : (
            <>
              <div className="cg-detalle-cabecera">
                <div>
                  <span className="cg-cuenta-codigo">{cuenta.cuenta_codigo}</span>
                  <h2>{cuenta.cuenta_nombre}</h2>
                  <p>
                    Fuente esperada: {" "}
                    <strong>
                      {cuenta.fuente_detalle === "NOMINA" ? "Nómina / Libro Mayor" : "Libro Mayor"}
                    </strong>
                  </p>
                </div>

                {!importacionPeriodo && cuenta.fuente_detalle !== "NOMINA" && (
                  <button type="button" className="cg-btn cg-btn-secundario" onClick={abrirNuevo}>
                    + Agregar manualmente
                  </button>
                )}
              </div>

              <div className="cg-metricas-cuenta">
                <MiniMetrica titulo="Contable" valor={dinero(cuenta.valor_contable)} />
                <MiniMetrica titulo="Registrado" valor={dinero(cuenta.valor_registrado)} />
                <MiniMetrica titulo="Clasificado" valor={dinero(cuenta.valor_clasificado)} />
                <MiniMetrica
                  titulo="Pendiente"
                  valor={dinero(cuenta.valor_pendiente_clasificacion)}
                  destacada={cuenta.valor_pendiente_clasificacion > 0.02}
                />
              </div>

              <div className="cg-conciliacion">
                <div>
                  <span>Cobertura de clasificación</span>
                  <strong>{porcentaje(cuenta.cobertura_clasificacion_pct)}</strong>
                </div>
                <div className="cg-barra cg-barra-grande">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(0, cuenta.cobertura_clasificacion_pct))}%`,
                    }}
                  />
                </div>
                <small>
                  El Libro Mayor debe cuadrar al centavo con el total contable antes de habilitar la
                  clasificación.
                </small>
              </div>

              {cuenta.fuente_detalle === "NOMINA" && importacionPeriodo && (
                <section className="cg-nomina-card">
                  <div className="cg-tabla-cabecera">
                    <div>
                      <h3>Personas de nómina</h3>
                      <p>
                        Asigna cada persona una sola vez. La distribución se aplica automáticamente a
                        sueldo, provisiones, fondos e IESS encontrados para esa persona.
                      </p>
                    </div>
                  </div>

                  {personasPeriodo.length === 0 ? (
                    <div className="cg-vacio">No se identificaron personas de nómina en el Libro Mayor.</div>
                  ) : (
                    <div className="cg-personas-lista">
                      {personasPeriodo.map((persona) => (
                        <div className="cg-persona-fila" key={persona.persona}>
                          <div>
                            <strong>{persona.persona}</strong>
                            <small>
                              {persona.movimientos} movimiento(s) · {dinero(persona.valor_total)}
                            </small>
                          </div>
                          <span
                            className={`cg-estado ${persona.estado === "CLASIFICADO" ? "ok" : "pendiente"}`}
                          >
                            {persona.estado === "CLASIFICADO" ? "Clasificada" : "Pendiente"}
                          </span>
                          <button
                            type="button"
                            className="cg-btn cg-btn-secundario"
                            onClick={() => abrirPersona(persona.persona)}
                          >
                            {persona.estado === "CLASIFICADO" ? "Cambiar asignación" : "Asignar clientes"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {personaEditando && (
                    <div className="cg-persona-editor">
                      <div className="cg-form-header">
                        <div>
                          <span className="cg-kicker">Distribución de nómina</span>
                          <h3>{personaEditando}</h3>
                        </div>
                        <button
                          type="button"
                          className="cg-btn cg-btn-secundario"
                          onClick={() => setPersonaEditando(null)}
                        >
                          Cancelar
                        </button>
                      </div>

                      <Campo label="Tratamiento gerencial">
                        <select
                          value={clasificacionNomina}
                          onChange={(e) => {
                            const valor = e.target.value as
                              | "GASTO_ESPECIFICO_CLIENTE"
                              | "GASTO_GENERAL"
                            setClasificacionNomina(valor)
                            if (valor !== "GASTO_ESPECIFICO_CLIENTE") {
                              setDistribucionNomina(DISTRIBUCION_INICIAL)
                            }
                          }}
                        >
                          <option value="GASTO_ESPECIFICO_CLIENTE">
                            Gasto específico de cliente
                          </option>
                          <option value="GASTO_GENERAL">Gasto general</option>
                        </select>
                      </Campo>

                      {clasificacionNomina === "GASTO_ESPECIFICO_CLIENTE" && (
                        <DistribucionClientes
                          clientes={clientes}
                          distribucion={distribucionNomina}
                          suma={sumaDistribucionNomina}
                          cambiar={cambiarDistribucionNomina}
                          agregar={agregarClienteNomina}
                          quitar={quitarClienteNomina}
                        />
                      )}

                      <div className="cg-form-actions">
                        <button
                          type="button"
                          className="cg-btn cg-btn-primario"
                          disabled={guardandoNomina}
                          onClick={() => void guardarPersonaNomina()}
                        >
                          {guardandoNomina ? "Aplicando…" : "Aplicar a toda su nómina"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {mostrarFormulario && (
                <div id="clasificacion-formulario" className="cg-form-card">
                  <div className="cg-form-header">
                    <div>
                      <span className="cg-kicker">
                        {esMovimientoLibroMayor ? "Movimiento del Libro Mayor" : formulario.id ? "Editar movimiento" : "Nuevo movimiento"}
                      </span>
                      <h3>
                        {esMovimientoLibroMayor ? "Clasificar movimiento" : formulario.id ? "Actualizar clasificación" : "Registrar y clasificar"}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="cg-btn cg-btn-secundario"
                      onClick={() => setMostrarFormulario(false)}
                    >
                      Cancelar
                    </button>
                  </div>

                  {esMovimientoLibroMayor && (
                    <div className="cg-lock-note">
                      Fecha, documento, proveedor, concepto y valor vienen del Libro Mayor y quedan
                      bloqueados. Aquí solo decides su tratamiento gerencial.
                    </div>
                  )}

                  <div className="cg-form-grid">
                    <Campo label="Fecha">
                      <input
                        type="date"
                        value={formulario.fecha_documento}
                        disabled={esMovimientoLibroMayor}
                        onChange={(e) => actualizarFormulario("fecha_documento", e.target.value)}
                      />
                    </Campo>

                    <Campo label="Tipo de documento">
                      <select
                        value={formulario.tipo_documento}
                        disabled={esMovimientoLibroMayor}
                        onChange={(e) =>
                          actualizarFormulario("tipo_documento", e.target.value as TipoDocumento)
                        }
                      >
                        {TIPOS_DOCUMENTO.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="N.º factura / documento">
                      <input
                        value={formulario.numero_documento}
                        disabled={esMovimientoLibroMayor}
                        onChange={(e) => actualizarFormulario("numero_documento", e.target.value)}
                        placeholder="Ej. 001-002-000000239"
                      />
                    </Campo>

                    <Campo label={cuenta.fuente_detalle === "NOMINA" ? "Persona" : "Proveedor"}>
                      <input
                        value={formulario.proveedor}
                        disabled={esMovimientoLibroMayor}
                        onChange={(e) => actualizarFormulario("proveedor", e.target.value)}
                        placeholder="Proveedor / beneficiario"
                      />
                    </Campo>

                    <Campo label="Valor" requerido>
                      <input
                        type="number"
                        step="0.01"
                        value={formulario.valor}
                        disabled={esMovimientoLibroMayor}
                        onChange={(e) => actualizarFormulario("valor", e.target.value)}
                        placeholder="0.00"
                      />
                    </Campo>

                    <Campo label="Clasificación gerencial" requerido>
                      <select
                        value={formulario.clasificacion_gerencial}
                        onChange={(e) =>
                          cambiarClasificacion(e.target.value as ClasificacionGerencial)
                        }
                      >
                        {CLASIFICACIONES.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Subcategoría">
                      <input
                        value={formulario.subcategoria}
                        onChange={(e) => actualizarFormulario("subcategoria", e.target.value)}
                        placeholder="Ej. Transporte, asesoría, donación"
                      />
                    </Campo>

                    <Campo label="Área">
                      <select
                        value={formulario.area}
                        onChange={(e) =>
                          actualizarFormulario("area", e.target.value as "" | Area)
                        }
                      >
                        <option value="">Sin definir</option>
                        {AREAS.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Comportamiento del costo">
                      <select
                        value={formulario.comportamiento}
                        onChange={(e) =>
                          actualizarFormulario(
                            "comportamiento",
                            e.target.value as "" | Comportamiento,
                          )
                        }
                      >
                        <option value="">Sin definir</option>
                        {COMPORTAMIENTOS.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Origen del detalle">
                      <select
                        value={formulario.origen_detalle}
                        disabled={esMovimientoLibroMayor}
                        onChange={(e) =>
                          actualizarFormulario("origen_detalle", e.target.value as OrigenDetalle)
                        }
                      >
                        {ORIGENES.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Referencia del origen">
                      <input
                        value={formulario.origen_referencia}
                        disabled={esMovimientoLibroMayor}
                        onChange={(e) => actualizarFormulario("origen_referencia", e.target.value)}
                        placeholder="Ej. C/D 001-0005061"
                      />
                    </Campo>

                    <Campo label="Concepto" ancho>
                      <input
                        value={formulario.concepto}
                        disabled={esMovimientoLibroMayor}
                        onChange={(e) => actualizarFormulario("concepto", e.target.value)}
                        placeholder="Descripción del gasto"
                      />
                    </Campo>
                  </div>

                  {formulario.clasificacion_gerencial === "GASTO_ESPECIFICO_CLIENTE" && (
                    <DistribucionClientes
                      clientes={clientes}
                      distribucion={distribucion}
                      suma={sumaDistribucion}
                      cambiar={cambiarDistribucion}
                      agregar={agregarCliente}
                      quitar={quitarCliente}
                    />
                  )}

                  <Campo label="Observaciones" ancho>
                    <textarea
                      rows={3}
                      value={formulario.observaciones}
                      onChange={(e) => actualizarFormulario("observaciones", e.target.value)}
                      placeholder="Cualquier aclaración necesaria para auditoría o futuras revisiones."
                    />
                  </Campo>

                  <div className="cg-form-actions">
                    <button
                      type="button"
                      className="cg-btn cg-btn-secundario"
                      onClick={() => setMostrarFormulario(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="cg-btn cg-btn-primario"
                      onClick={() => void guardarMovimiento()}
                      disabled={guardando}
                    >
                      {guardando ? "Guardando…" : "Guardar clasificación"}
                    </button>
                  </div>
                </div>
              )}

              {mostrarMasivo && (
                <section className="cg-masivo-card">
                  <div className="cg-form-header">
                    <div>
                      <span className="cg-kicker">Clasificación masiva</span>
                      <h3>
                        {movimientosSeleccionados.length} movimiento
                        {movimientosSeleccionados.length === 1 ? "" : "s"} seleccionado
                        {movimientosSeleccionados.length === 1 ? "" : "s"}
                      </h3>
                      <p>
                        Valor total seleccionado: <strong>{dinero(sumaSeleccionados)}</strong>.
                        La misma clasificación se aplicará a todas estas partidas.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="cg-btn cg-btn-secundario"
                      onClick={() => setMostrarMasivo(false)}
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="cg-form-grid">
                    <Campo label="Clasificación gerencial" requerido>
                      <select
                        value={formularioMasivo.clasificacion_gerencial}
                        onChange={(e) =>
                          cambiarClasificacionMasiva(
                            e.target.value as ClasificacionGerencial,
                          )
                        }
                      >
                        {CLASIFICACIONES.filter((item) => item.valor !== "PENDIENTE").map(
                          (item) => (
                            <option key={item.valor} value={item.valor}>
                              {item.etiqueta}
                            </option>
                          ),
                        )}
                        <option value="PENDIENTE" disabled>
                          Selecciona una clasificación
                        </option>
                      </select>
                    </Campo>

                    <Campo label="Subcategoría">
                      <input
                        value={formularioMasivo.subcategoria}
                        onChange={(e) =>
                          actualizarFormularioMasivo("subcategoria", e.target.value)
                        }
                        placeholder="Ej. Transporte, combustible, estibaje"
                      />
                    </Campo>

                    <Campo label="Área">
                      <select
                        value={formularioMasivo.area}
                        onChange={(e) =>
                          actualizarFormularioMasivo(
                            "area",
                            e.target.value as "" | Area,
                          )
                        }
                      >
                        <option value="">Conservar / sin definir</option>
                        {AREAS.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Comportamiento del costo">
                      <select
                        value={formularioMasivo.comportamiento}
                        onChange={(e) =>
                          actualizarFormularioMasivo(
                            "comportamiento",
                            e.target.value as "" | Comportamiento,
                          )
                        }
                      >
                        <option value="">Conservar / sin definir</option>
                        {COMPORTAMIENTOS.map((item) => (
                          <option key={item.valor} value={item.valor}>
                            {item.etiqueta}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  </div>

                  {formularioMasivo.clasificacion_gerencial ===
                    "GASTO_ESPECIFICO_CLIENTE" && (
                    <DistribucionClientes
                      clientes={clientes}
                      distribucion={distribucionMasiva}
                      suma={sumaDistribucionMasiva}
                      cambiar={cambiarDistribucionMasiva}
                      agregar={agregarClienteMasivo}
                      quitar={quitarClienteMasivo}
                    />
                  )}

                  <Campo label="Observaciones" ancho>
                    <textarea
                      rows={2}
                      value={formularioMasivo.observaciones}
                      onChange={(e) =>
                        actualizarFormularioMasivo("observaciones", e.target.value)
                      }
                      placeholder="Opcional. Se aplicará a todas las partidas seleccionadas."
                    />
                  </Campo>

                  <div className="cg-form-actions">
                    <button
                      type="button"
                      className="cg-btn cg-btn-secundario"
                      onClick={() => {
                        setMostrarMasivo(false)
                        setSeleccionados([])
                      }}
                    >
                      Cancelar y limpiar selección
                    </button>
                    <button
                      type="button"
                      className="cg-btn cg-btn-primario"
                      disabled={
                        guardandoMasivo ||
                        formularioMasivo.clasificacion_gerencial === "PENDIENTE"
                      }
                      onClick={() => void guardarClasificacionMasiva()}
                    >
                      {guardandoMasivo
                        ? "Aplicando…"
                        : `Aplicar a ${movimientosSeleccionados.length} movimiento${
                            movimientosSeleccionados.length === 1 ? "" : "s"
                          }`}
                    </button>
                  </div>
                </section>
              )}

              <div className="cg-tabla-card">
                <div className="cg-tabla-cabecera">
                  <div>
                    <h3>Movimientos registrados</h3>
                    <p>
                      {movimientos.length} movimiento{movimientos.length === 1 ? "" : "s"} en esta
                      cuenta.
                      {pendientesSeleccionables.length > 0 && (
                        <> · {pendientesSeleccionables.length} pendiente
                          {pendientesSeleccionables.length === 1 ? "" : "s"} seleccionable
                          {pendientesSeleccionables.length === 1 ? "" : "s"}.</>
                      )}
                    </p>
                  </div>

                  {seleccionados.length > 0 && (
                    <div className="cg-masivo-toolbar">
                      <strong>{seleccionados.length} seleccionada{seleccionados.length === 1 ? "" : "s"}</strong>
                      <button
                        type="button"
                        className="cg-btn cg-btn-primario"
                        onClick={abrirClasificacionMasiva}
                      >
                        Clasificar seleccionadas
                      </button>
                      <button
                        type="button"
                        className="cg-btn cg-btn-secundario"
                        onClick={() => {
                          setSeleccionados([])
                          setMostrarMasivo(false)
                        }}
                      >
                        Limpiar
                      </button>
                    </div>
                  )}
                </div>

                {cargandoDetalle ? (
                  <div className="cg-vacio">Cargando movimientos…</div>
                ) : movimientos.length === 0 ? (
                  <div className="cg-vacio">
                    <strong>Aún no hay detalle cargado.</strong>
                    <span>
                      {importacionPeriodo
                        ? "No se encontraron movimientos para esta cuenta en el Libro Mayor."
                        : "Sube el Libro Mayor del mes para llenar automáticamente el detalle."}
                    </span>
                  </div>
                ) : (
                  <div className="cg-tabla-scroll">
                    <table className="cg-tabla">
                      <thead>
                        <tr>
                          <th className="cg-check-col">
                            <input
                              type="checkbox"
                              checked={todosPendientesSeleccionados}
                              onChange={alternarTodosPendientes}
                              disabled={pendientesSeleccionables.length === 0}
                              title="Seleccionar todas las partidas pendientes de esta cuenta"
                              aria-label="Seleccionar todas las partidas pendientes"
                            />
                          </th>
                          <th>Fecha</th>
                          <th>Documento</th>
                          <th>Proveedor / persona</th>
                          <th>Concepto</th>
                          <th>Clasificación</th>
                          <th>Cliente(s)</th>
                          <th className="numero">Valor</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((movimiento) => {
                          const seleccionable =
                            cuenta.fuente_detalle !== "NOMINA" &&
                            movimiento.clasificacion_gerencial === "PENDIENTE"
                          const seleccionado = seleccionados.includes(movimiento.id)

                          return (
                          <tr
                            key={movimiento.id}
                            className={seleccionado ? "cg-fila-seleccionada" : ""}
                          >
                            <td className="cg-check-col">
                              <input
                                type="checkbox"
                                checked={seleccionado}
                                disabled={!seleccionable || guardandoMasivo}
                                onChange={() => alternarSeleccion(movimiento.id)}
                                title={
                                  seleccionable
                                    ? "Seleccionar para clasificar en grupo"
                                    : "Esta partida ya está clasificada"
                                }
                                aria-label={`Seleccionar ${movimiento.numero_documento || movimiento.id}`}
                              />
                            </td>
                            <td>
                              {movimiento.fecha_documento
                                ? fechaCorta(movimiento.fecha_documento)
                                : "—"}
                            </td>
                            <td>
                              <strong>{movimiento.numero_documento || "—"}</strong>
                              <small>
                                {movimiento.tipo_documento} · {movimiento.origen_detalle}
                              </small>
                            </td>
                            <td>{movimiento.proveedor || "—"}</td>
                            <td>{movimiento.concepto || movimiento.subcategoria || "—"}</td>
                            <td>
                              <span
                                className={`cg-chip-clasificacion ${movimiento.clasificacion_gerencial.toLowerCase()}`}
                              >
                                {etiquetaClasificacion(movimiento.clasificacion_gerencial)}
                              </span>
                            </td>
                            <td>{movimiento.clientes_resumen || "—"}</td>
                            <td className="numero">
                              <strong>{dinero(movimiento.valor)}</strong>
                            </td>
                            <td>
                              <div className="cg-acciones-tabla">
                                <button type="button" onClick={() => editarMovimiento(movimiento)}>
                                  {movimiento.clasificacion_gerencial === "PENDIENTE"
                                    ? "Clasificar"
                                    : "Editar"}
                                </button>
                                {movimiento.origen_detalle !== "LIBRO_MAYOR" && (
                                  <button
                                    type="button"
                                    className="peligro"
                                    onClick={() => void eliminarMovimiento(movimiento)}
                                  >
                                    Eliminar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </section>
  )
}

function DistribucionClientes({
  clientes,
  distribucion,
  suma,
  cambiar,
  agregar,
  quitar,
}: {
  clientes: Cliente[]
  distribucion: DistribucionCliente[]
  suma: number
  cambiar: (indice: number, campo: keyof DistribucionCliente, valor: string) => void
  agregar: () => void
  quitar: (indice: number) => void
}) {
  return (
    <div className="cg-clientes-card">
      <div className="cg-clientes-header">
        <div>
          <h4>Clientes afectados</h4>
          <p>Por defecto se reparte en partes iguales entre los clientes; puedes ajustar los porcentajes manualmente.</p>
        </div>
        <span className={`cg-suma ${Math.abs(suma - 100) <= 0.01 ? "ok" : "mal"}`}>
          Total {suma.toFixed(2)}%
        </span>
      </div>

      <div className="cg-clientes-lista">
        {distribucion.map((fila, indice) => (
          <div className="cg-cliente-fila" key={`${indice}-${fila.cliente_id}`}>
            <select
              value={fila.cliente_id}
              onChange={(e) => cambiar(indice, "cliente_id", e.target.value)}
            >
              <option value="">Selecciona cliente</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>
            <div className="cg-porcentaje-input">
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={fila.porcentaje}
                onChange={(e) => cambiar(indice, "porcentaje", e.target.value)}
              />
              <span>%</span>
            </div>
            <button
              type="button"
              className="cg-btn-icono"
              onClick={() => quitar(indice)}
              title="Quitar cliente"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="cg-link-btn" onClick={agregar}>
        + Agregar otro cliente
      </button>
    </div>
  )
}

function cuentaActual(cuentas: CuentaConciliacion[], periodo: string, codigo: string) {
  return (
    cuentas.find(
      (fila) => fila.periodo.startsWith(periodo) && fila.cuenta_codigo === codigo,
    ) ?? null
  )
}

function nombreMes(mes: string) {
  if (!mes) return ""
  const [anio, numeroMes] = mes.split("-").map(Number)
  const fecha = new Date(anio, numeroMes - 1, 1)
  const texto = new Intl.DateTimeFormat("es-EC", {
    month: "long",
    year: "numeric",
  }).format(fecha)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function fechaCorta(fecha: string) {
  const [anio, mes, dia] = fecha.slice(0, 10).split("-")
  return `${dia}/${mes}/${anio}`
}

function textoEstado(estado: string) {
  if (estado === "CONCILIADO") return "Conciliado"
  if (estado === "SIN DETALLE") return "Sin detalle"
  if (estado.includes("FALTA CLASIFICAR")) return "Falta clasificar"
  return "Incompleto"
}

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function TarjetaResumen({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="cg-resumen-card">
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small>{detalle}</small>
    </div>
  )
}

function MiniMetrica({
  titulo,
  valor,
  destacada = false,
}: {
  titulo: string
  valor: string
  destacada?: boolean
}) {
  return (
    <div className={`cg-mini-metrica ${destacada ? "destacada" : ""}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
    </div>
  )
}

function Campo({
  label,
  requerido = false,
  ancho = false,
  children,
}: {
  label: string
  requerido?: boolean
  ancho?: boolean
  children: ReactNode
}) {
  return (
    <label className={`cg-campo ${ancho ? "ancho" : ""}`}>
      <span>
        {label}
        {requerido && <b> *</b>}
      </span>
      {children}
    </label>
  )
}

const css = `
  * { box-sizing: border-box; }

  .cg-page {
    max-width: 1500px;
    margin: 0 auto;
    padding: 24px 24px 44px;
    color: #302824;
  }

  .cg-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 22px;
    margin-bottom: 20px;
  }

  .cg-kicker {
    display: block;
    margin-bottom: 6px;
    color: #F7931E;
    font-size: 11px;
    font-weight: 850;
    text-transform: uppercase;
    letter-spacing: .05em;
  }

  .cg-header h1,
  .cg-detalle-cabecera h2,
  .cg-panel-title h2,
  .cg-form-header h3,
  .cg-tabla-cabecera h3,
  .cg-clientes-header h4 {
    margin: 0;
    color: #8F1D24;
  }

  .cg-header h1 { font-size: clamp(26px, 3vw, 36px); }
  .cg-header p,
  .cg-detalle-cabecera p,
  .cg-panel-title p,
  .cg-tabla-cabecera p,
  .cg-clientes-header p {
    margin: 6px 0 0;
    color: #766862;
    line-height: 1.45;
  }

  .cg-periodo {
    min-width: 210px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cg-periodo span,
  .cg-campo > span {
    color: #695d58;
    font-size: 12px;
    font-weight: 800;
  }

  .cg-periodo select,
  .cg-campo input,
  .cg-campo select,
  .cg-campo textarea,
  .cg-cliente-fila select,
  .cg-cliente-fila input {
    width: 100%;
    min-height: 40px;
    border: 1px solid #ded3cd;
    border-radius: 9px;
    background: white;
    padding: 9px 11px;
    color: #342d29;
    font: inherit;
    outline: none;
  }

  .cg-campo textarea { resize: vertical; }

  .cg-periodo select:focus,
  .cg-campo input:focus,
  .cg-campo select:focus,
  .cg-campo textarea:focus,
  .cg-cliente-fila select:focus,
  .cg-cliente-fila input:focus {
    border-color: #b97865;
    box-shadow: 0 0 0 3px rgba(143,29,36,.08);
  }

  .cg-alert {
    margin: 0 0 16px;
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
  }
  .cg-alert-error { background: #fff0f0; color: #9b2429; border: 1px solid #f1c4c6; }
  .cg-alert-ok { background: #eef8f1; color: #25643a; border: 1px solid #cce6d3; }

  .cg-resumen-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 12px;
    margin-bottom: 18px;
  }

  .cg-resumen-card,
  .cg-mini-metrica {
    border: 1px solid #eadfd8;
    border-radius: 14px;
    background: white;
    box-shadow: 0 6px 20px rgba(73,45,35,.045);
  }

  .cg-resumen-card { padding: 16px; }
  .cg-resumen-card span,
  .cg-mini-metrica span {
    display: block;
    color: #776a64;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .035em;
  }
  .cg-resumen-card strong {
    display: block;
    margin-top: 7px;
    color: #332b28;
    font-size: 24px;
  }
  .cg-resumen-card small { display: block; margin-top: 4px; color: #8b7c75; }

  .cg-layout {
    display: grid;
    grid-template-columns: minmax(280px, 350px) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  .cg-cuentas-panel,
  .cg-detalle-panel {
    border: 1px solid #eadfd8;
    border-radius: 16px;
    background: white;
    box-shadow: 0 8px 28px rgba(73,45,35,.05);
  }

  .cg-cuentas-panel { overflow: hidden; position: sticky; top: 78px; }
  .cg-panel-title { padding: 18px; border-bottom: 1px solid #eee5df; }
  .cg-panel-title h2 { font-size: 17px; }
  .cg-panel-title p { font-size: 12px; }

  .cg-cuentas-lista {
    max-height: calc(100vh - 205px);
    overflow-y: auto;
    padding: 8px;
  }

  .cg-cuenta {
    width: 100%;
    display: block;
    padding: 12px;
    border: 1px solid transparent;
    border-radius: 11px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: .15s ease;
  }
  .cg-cuenta:hover { background: #fff9f5; }
  .cg-cuenta.activa { border-color: #d6b7aa; background: #fff7f1; }
  .cg-cuenta + .cg-cuenta { margin-top: 5px; }

  .cg-cuenta-top,
  .cg-cuenta-valores,
  .cg-clientes-header,
  .cg-detalle-cabecera,
  .cg-form-header,
  .cg-tabla-cabecera,
  .cg-conciliacion > div:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .cg-cuenta-codigo {
    color: #9b8b84;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    font-weight: 700;
  }

  .cg-cuenta > strong { display: block; margin-top: 5px; font-size: 13px; line-height: 1.3; }
  .cg-cuenta-valores { margin-top: 9px; font-size: 12px; font-weight: 800; }
  .cg-cuenta small { display: block; margin-top: 6px; color: #897a73; font-size: 10px; }

  .cg-estado {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 850;
    text-transform: uppercase;
  }
  .cg-estado.ok { background: #e7f6ec; color: #237041; }
  .cg-estado.advertencia { background: #fff4d9; color: #8a6311; }
  .cg-estado.pendiente { background: #f4f0ee; color: #746963; }
  .cg-estado.incompleto { background: #fff0f0; color: #9e3035; }

  .cg-barra {
    height: 6px;
    margin-top: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: #eee7e3;
  }
  .cg-barra i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #F7931E, #8F1D24); }
  .cg-barra-grande { height: 9px; margin: 8px 0 7px; }

  .cg-detalle-panel { padding: 20px; min-width: 0; }
  .cg-detalle-cabecera { align-items: flex-start; padding-bottom: 16px; border-bottom: 1px solid #eee6e2; }
  .cg-detalle-cabecera h2 { margin-top: 4px; font-size: 22px; }
  .cg-detalle-cabecera p { font-size: 12px; }

  .cg-btn {
    min-height: 38px;
    padding: 0 14px;
    border-radius: 9px;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    transition: .15s ease;
  }
  .cg-btn:disabled { opacity: .6; cursor: wait; }
  .cg-btn-primario { border: 1px solid #8F1D24; background: #8F1D24; color: white; }
  .cg-btn-primario:hover:not(:disabled) { background: #74171d; }
  .cg-btn-secundario { border: 1px solid #dfd4ce; background: white; color: #675a54; }

  .cg-metricas-cuenta {
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 9px;
    margin: 16px 0 10px;
  }
  .cg-mini-metrica { padding: 12px; box-shadow: none; }
  .cg-mini-metrica strong { display: block; margin-top: 5px; color: #332b28; font-size: 17px; }
  .cg-mini-metrica.destacada { border-color: #efc4c6; background: #fff7f7; }
  .cg-mini-metrica.destacada strong { color: #9a292e; }

  .cg-conciliacion {
    margin-bottom: 18px;
    padding: 13px 14px;
    border-radius: 11px;
    background: #faf7f5;
    border: 1px solid #eee3de;
  }
  .cg-conciliacion span { color: #6e615b; font-size: 12px; font-weight: 750; }
  .cg-conciliacion strong { color: #8F1D24; font-size: 16px; }
  .cg-conciliacion small { color: #897b74; }

  .cg-form-card,
  .cg-masivo-card {
    margin: 0 0 18px;
    padding: 18px;
    border: 1px solid #dfc8bd;
    border-radius: 14px;
    background: #fffaf7;
  }

  .cg-masivo-card {
    border-color: #e5b98d;
    background: #fff8ef;
    box-shadow: 0 8px 24px rgba(115, 71, 30, .06);
  }

  .cg-masivo-card .cg-form-header p {
    margin: 5px 0 0;
    color: #78685f;
    font-size: 12px;
  }

  .cg-masivo-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    flex-wrap: wrap;
  }

  .cg-masivo-toolbar > strong {
    color: #8F1D24;
    font-size: 11px;
  }
  .cg-form-header { align-items: flex-start; margin-bottom: 16px; }
  .cg-form-header h3 { font-size: 19px; }

  .cg-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0,1fr));
    gap: 12px;
  }

  .cg-campo { display: flex; flex-direction: column; gap: 6px; }
  .cg-campo.ancho { grid-column: 1 / -1; }
  .cg-campo > span b { color: #b42e34; }

  .cg-clientes-card {
    margin: 14px 0;
    padding: 14px;
    border: 1px solid #ead9ce;
    border-radius: 12px;
    background: white;
  }
  .cg-clientes-header { align-items: flex-start; margin-bottom: 10px; }
  .cg-clientes-header h4 { font-size: 15px; }
  .cg-clientes-header p { font-size: 11px; }
  .cg-suma { padding: 5px 8px; border-radius: 999px; font-size: 11px; font-weight: 850; }
  .cg-suma.ok { background: #e8f6ec; color: #287043; }
  .cg-suma.mal { background: #fff0f0; color: #9d3036; }

  .cg-clientes-lista { display: flex; flex-direction: column; gap: 8px; }
  .cg-cliente-fila { display: grid; grid-template-columns: minmax(0,1fr) 125px 36px; gap: 8px; }
  .cg-porcentaje-input { position: relative; }
  .cg-porcentaje-input input { padding-right: 30px; }
  .cg-porcentaje-input span { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); color: #8c7d76; }
  .cg-btn-icono { border: 1px solid #ebd9d9; border-radius: 8px; background: #fff7f7; color: #a53238; font-size: 20px; cursor: pointer; }
  .cg-link-btn { margin-top: 9px; border: 0; background: transparent; color: #8F1D24; font-weight: 800; cursor: pointer; padding: 4px 0; }

  .cg-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

  .cg-tabla-card {
    overflow: hidden;
    border: 1px solid #eadfd8;
    border-radius: 13px;
    background: white;
  }
  .cg-tabla-cabecera { padding: 14px 15px; border-bottom: 1px solid #eee6e2; }
  .cg-tabla-cabecera h3 { font-size: 16px; }
  .cg-tabla-cabecera p { font-size: 11px; }
  .cg-tabla-scroll { overflow-x: auto; }
  .cg-tabla { width: 100%; min-width: 980px; border-collapse: collapse; }
  .cg-tabla th,
  .cg-tabla td { padding: 10px 11px; border-bottom: 1px solid #f0e9e5; text-align: left; vertical-align: top; }
  .cg-tabla th { background: #faf7f5; color: #776961; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  .cg-tabla td { color: #4b403b; font-size: 11px; }
  .cg-tabla td small { display: block; margin-top: 3px; color: #9a8d87; font-size: 9px; }
  .cg-tabla .numero { text-align: right; white-space: nowrap; }
  .cg-tabla .cg-check-col {
    width: 42px;
    min-width: 42px;
    text-align: center;
    vertical-align: middle;
  }
  .cg-check-col input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #8F1D24;
    cursor: pointer;
  }
  .cg-check-col input[type="checkbox"]:disabled {
    cursor: not-allowed;
    opacity: .35;
  }
  .cg-fila-seleccionada td {
    background: #fff6ea;
  }

  .cg-chip-clasificacion {
    display: inline-block;
    max-width: 190px;
    padding: 4px 7px;
    border-radius: 7px;
    background: #f0ece9;
    color: #675a54;
    font-size: 9px;
    font-weight: 800;
    line-height: 1.25;
  }
  .cg-chip-clasificacion.gasto_especifico_cliente { background: #fff0df; color: #8b5510; }
  .cg-chip-clasificacion.cif { background: #e9f0fb; color: #315d94; }
  .cg-chip-clasificacion.gasto_general { background: #efedf7; color: #5e5088; }
  .cg-chip-clasificacion.fuera_ebitda { background: #f2f2f2; color: #555; }
  .cg-chip-clasificacion.pendiente { background: #fff0f0; color: #9e3035; }

  .cg-acciones-tabla { display: flex; gap: 5px; white-space: nowrap; }
  .cg-acciones-tabla button { border: 0; background: transparent; color: #8F1D24; font-size: 10px; font-weight: 800; cursor: pointer; }
  .cg-acciones-tabla button.peligro { color: #a9363b; }

  .cg-vacio,
  .cg-loading {
    min-height: 170px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 24px;
    color: #857771;
    text-align: center;
  }
  .cg-vacio strong { color: #5c504b; }
  .cg-vacio span { font-size: 12px; }

  @media (max-width: 1150px) {
    .cg-resumen-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .cg-layout { grid-template-columns: 300px minmax(0,1fr); }
    .cg-metricas-cuenta { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }

  @media (max-width: 900px) {
    .cg-page { padding: 16px 12px 32px; }
    .cg-header { align-items: stretch; flex-direction: column; }
    .cg-periodo { min-width: 0; }
    .cg-layout { grid-template-columns: 1fr; }
    .cg-cuentas-panel { position: static; }
    .cg-cuentas-lista { max-height: 360px; }
  }

  @media (max-width: 620px) {
    .cg-resumen-grid,
    .cg-form-grid,
    .cg-metricas-cuenta { grid-template-columns: 1fr; }
    .cg-masivo-toolbar { width: 100%; justify-content: stretch; }
    .cg-masivo-toolbar .cg-btn { flex: 1 1 auto; }
    .cg-campo.ancho { grid-column: auto; }
    .cg-detalle-panel { padding: 14px; }
    .cg-detalle-cabecera { flex-direction: column; }
    .cg-detalle-cabecera .cg-btn { width: 100%; }
    .cg-form-header { flex-direction: column; }
    .cg-cliente-fila { grid-template-columns: 1fr 100px 36px; }
    .cg-form-actions { flex-direction: column-reverse; }
    .cg-form-actions .cg-btn { width: 100%; }
  }


  .cg-header-actions {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .cg-import-ok {
    margin: -8px 0 14px;
    padding: 10px 13px;
    border: 1px solid #cce6d3;
    border-radius: 10px;
    background: #eef8f1;
    color: #25643a;
    font-size: 12px;
  }

  .cg-preview-card {
    margin: 0 0 18px;
    padding: 18px;
    border: 1px solid #dfc8bd;
    border-radius: 15px;
    background: white;
    box-shadow: 0 8px 28px rgba(73,45,35,.05);
  }

  .cg-preview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
  }

  .cg-preview-header h2 { margin: 0; color: #8F1D24; font-size: 20px; }
  .cg-preview-header p { margin: 5px 0 0; color: #786b65; font-size: 12px; }

  .cg-preview-status {
    flex: 0 0 auto;
    padding: 6px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 850;
    text-transform: uppercase;
  }
  .cg-preview-status.ok { background: #e7f6ec; color: #237041; }
  .cg-preview-status.mal { background: #fff0f0; color: #9e3035; }
  .cg-preview-table { min-width: 820px; }

  .cg-auto-block {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #eee5df;
  }

  .cg-auto-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 11px 10px;
    border: 0;
    border-radius: 10px;
    background: #faf7f5;
    color: #5f524c;
    text-align: left;
    cursor: pointer;
  }
  .cg-auto-toggle span { display: flex; flex-direction: column; gap: 2px; }
  .cg-auto-toggle strong { font-size: 12px; }
  .cg-auto-toggle small { color: #8a7c75; font-size: 10px; }
  .cg-auto-toggle b { color: #8F1D24; font-size: 18px; }

  .cg-auto-lista { padding: 5px 2px 2px; }
  .cg-auto-fila {
    display: grid;
    grid-template-columns: minmax(0,1fr) auto;
    gap: 8px;
    padding: 9px 8px;
    border-bottom: 1px solid #f1ebe7;
  }
  .cg-auto-fila > div { min-width: 0; }
  .cg-auto-fila strong { display: block; margin: 3px 0; font-size: 11px; line-height: 1.25; }
  .cg-auto-fila small { color: #887a73; font-size: 9px; }
  .cg-auto-fila > b { align-self: center; color: #4d423d; font-size: 11px; white-space: nowrap; }

  .cg-nomina-card {
    margin-bottom: 18px;
    overflow: hidden;
    border: 1px solid #eadfd8;
    border-radius: 13px;
    background: #fffdfa;
  }

  .cg-personas-lista { padding: 8px 14px 14px; }
  .cg-persona-fila {
    display: grid;
    grid-template-columns: minmax(0,1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid #eee7e3;
  }
  .cg-persona-fila:last-child { border-bottom: 0; }
  .cg-persona-fila strong { display: block; color: #423834; font-size: 12px; }
  .cg-persona-fila small { display: block; margin-top: 3px; color: #897b74; font-size: 10px; }

  .cg-persona-editor {
    margin: 0 14px 14px;
    padding: 15px;
    border: 1px solid #dfc8bd;
    border-radius: 12px;
    background: #fff7f1;
  }

  .cg-lock-note {
    margin-bottom: 13px;
    padding: 10px 12px;
    border: 1px solid #d9e2ec;
    border-radius: 9px;
    background: #f4f7fa;
    color: #51606e;
    font-size: 11px;
    line-height: 1.45;
  }

  .cg-campo input:disabled,
  .cg-campo select:disabled {
    background: #f3f0ee;
    color: #746963;
    cursor: not-allowed;
  }

  @media (max-width: 900px) {
    .cg-header-actions { justify-content: stretch; }
    .cg-header-actions .cg-periodo,
    .cg-header-actions .cg-btn { width: 100%; }
    .cg-preview-header { flex-direction: column; }
  }

  @media (max-width: 620px) {
    .cg-persona-fila { grid-template-columns: 1fr; }
    .cg-persona-fila .cg-btn { width: 100%; }
  }
`
