import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  importarVentasDb,
  obtenerImportacionesVentasDb,
  obtenerVentasDiariasDb,
  type ImportacionVentasDb,
  type VentaDiariaDb,
} from "../repositories/ventasRepository"
import {
  leerArchivoVentas,
  type ResultadoArchivoVentas,
} from "../utils/ventasExcel"
import { leerArchivoVentasPdf } from "../utils/ventasPdf"
import {
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
} from "../repositories/devolucionRepository"

type Vista = "IMPORTAR" | "HISTORIAL"

type PeriodoTipo = "SEMANA" | "MES" | "TRIMESTRE" | "SEMESTRE" | "ANIO" | "PERSONALIZADO"
type Escala = "DIA" | "SEMANA" | "MES" | "TRIMESTRE" | "SEMESTRE"

type OpcionPeriodo = {
  clave: string
  etiqueta: string
}

type DevolucionEstimada = {
  fecha: string
  clienteClave: string
  cliente: string
  sku: string
  producto: string
  unidades: number
  valor: number
}

type PuntoTemporal = {
  clave: string
  desde: string
  hasta: string
  etiqueta: string
  unidades: number
  venta: number
  devolucion: number
  movimientos: number
  variacion: number | null
}

function moneda(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numero(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    maximumFractionDigits: 0,
  })
}

function fecha(valor: string) {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${valor.slice(0, 10)}T00:00:00Z`))
}

function fechaHora(valor: string) {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(valor))
}

function sumarDias(fechaIso: string, dias: number) {
  const valor = new Date(`${fechaIso}T00:00:00Z`)
  valor.setUTCDate(valor.getUTCDate() + dias)
  return valor.toISOString().slice(0, 10)
}

function inicioSemana(fechaIso: string) {
  if (!fechaIso) return ""
  const fecha = new Date(`${fechaIso}T00:00:00Z`)
  const dia = fecha.getUTCDay()
  fecha.setUTCDate(fecha.getUTCDate() - (dia === 0 ? 6 : dia - 1))
  return fecha.toISOString().slice(0, 10)
}

function etiquetaSemana(inicio: string, limiteDesde = "", limiteHasta = "") {
  const finSemana = sumarDias(inicio, 6)
  const desde = limiteDesde && limiteDesde > inicio ? limiteDesde : inicio
  const hasta = limiteHasta && limiteHasta < finSemana ? limiteHasta : finSemana
  return `${fecha(desde)} – ${fecha(hasta)}`
}

function fechaCorta(valor: string) {
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${valor}T00:00:00Z`)).replace(".", "")
}

function etiquetaEjeRango(inicio: string, limiteDesde = "", limiteHasta = "") {
  const finSemana = sumarDias(inicio, 6)
  const desde = limiteDesde && limiteDesde > inicio ? limiteDesde : inicio
  const hasta = limiteHasta && limiteHasta < finSemana ? limiteHasta : finSemana
  if (desde === hasta) return fechaCorta(desde)
  return `${fechaCorta(desde)}–${fechaCorta(hasta)}`
}


function normalizar(valor: string) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function clienteClave(nombre: string) {
  const valor = normalizar(nombre)
  if (
    valor.includes("FAVORITA") ||
    valor.includes("SUPERMAXI") ||
    valor.includes("MEGAMAXI")
  ) return "CORPORACION FAVORITA"
  if (
    valor.includes("SANTAMARIA") ||
    valor.includes("SANTA MARIA") ||
    valor.includes("MEGA SANTA")
  ) return "MEGA SANTAMARIA"
  if (valor.includes("ROSADO") || valor.includes("COMISARIATO")) {
    return "CORPORACION EL ROSADO"
  }
  if (valor.includes("TUTI")) return "TUTI"
  return valor || "SIN CLIENTE"
}

function clienteEtiqueta(clave: string, nombre: string) {
  if (clave === "CORPORACION FAVORITA") return "Corporación Favorita"
  if (clave === "MEGA SANTAMARIA") return "Mega Santamaría"
  if (clave === "CORPORACION EL ROSADO") return "Corporación El Rosado"
  if (clave === "TUTI") return "TUTI"
  return nombre || "Sin cliente"
}

function porcentaje(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—"
  return `${Number(valor).toLocaleString("es-EC", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function finDeMes(claveMes: string) {
  const [anio, mes] = claveMes.split("-").map(Number)
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
}

function claveTrimestre(fechaIso: string) {
  const anio = Number(fechaIso.slice(0, 4))
  const mes = Number(fechaIso.slice(5, 7))
  return `${anio}-Q${Math.ceil(mes / 3)}`
}

function claveSemestre(fechaIso: string) {
  const anio = Number(fechaIso.slice(0, 4))
  const mes = Number(fechaIso.slice(5, 7))
  return `${anio}-S${mes <= 6 ? 1 : 2}`
}

function etiquetaMes(claveMes: string) {
  const [anio, mes] = claveMes.split("-").map(Number)
  const texto = new Intl.DateTimeFormat("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function etiquetaPeriodo(tipo: PeriodoTipo, clave: string) {
  if (!clave) return "—"
  if (tipo === "SEMANA") return `${fecha(clave)} – ${fecha(sumarDias(clave, 6))}`
  if (tipo === "MES") return etiquetaMes(clave)
  if (tipo === "TRIMESTRE") {
    const [anio, trimestre] = clave.split("-Q")
    return `T${trimestre} ${anio}`
  }
  if (tipo === "SEMESTRE") {
    const [anio, semestre] = clave.split("-S")
    return `S${semestre} ${anio}`
  }
  if (tipo === "ANIO") return clave
  return "Rango personalizado"
}

function rangoPeriodo(
  tipo: PeriodoTipo,
  clave: string,
  personalizadoDesde: string,
  personalizadoHasta: string,
) {
  if (tipo === "PERSONALIZADO") {
    return { desde: personalizadoDesde, hasta: personalizadoHasta }
  }
  if (!clave) return { desde: "", hasta: "" }
  if (tipo === "SEMANA") return { desde: clave, hasta: sumarDias(clave, 6) }
  if (tipo === "MES") return { desde: `${clave}-01`, hasta: finDeMes(clave) }
  if (tipo === "TRIMESTRE") {
    const [anioTexto, trimestreTexto] = clave.split("-Q")
    const anio = Number(anioTexto)
    const trimestre = Number(trimestreTexto)
    const mesInicial = (trimestre - 1) * 3 + 1
    const mesFinal = mesInicial + 2
    const mesInicialTexto = String(mesInicial).padStart(2, "0")
    const mesFinalTexto = String(mesFinal).padStart(2, "0")
    return {
      desde: `${anio}-${mesInicialTexto}-01`,
      hasta: finDeMes(`${anio}-${mesFinalTexto}`),
    }
  }
  if (tipo === "SEMESTRE") {
    const [anioTexto, semestreTexto] = clave.split("-S")
    const anio = Number(anioTexto)
    const semestre = Number(semestreTexto)
    const mesInicial = semestre === 1 ? 1 : 7
    const mesFinal = semestre === 1 ? 6 : 12
    return {
      desde: `${anio}-${String(mesInicial).padStart(2, "0")}-01`,
      hasta: finDeMes(`${anio}-${String(mesFinal).padStart(2, "0")}`),
    }
  }
  return { desde: `${clave}-01-01`, hasta: `${clave}-12-31` }
}

function opcionesPeriodo(ventas: VentaDiariaDb[], tipo: PeriodoTipo): OpcionPeriodo[] {
  if (tipo === "PERSONALIZADO") return []
  const claves = new Set<string>()
  ventas.forEach((item) => {
    const f = item.fecha_emision
    if (!f) return
    if (tipo === "SEMANA") claves.add(inicioSemana(f))
    else if (tipo === "MES") claves.add(f.slice(0, 7))
    else if (tipo === "TRIMESTRE") claves.add(claveTrimestre(f))
    else if (tipo === "SEMESTRE") claves.add(claveSemestre(f))
    else claves.add(f.slice(0, 4))
  })
  return Array.from(claves)
    .sort()
    .map((clave) => ({ clave, etiqueta: etiquetaPeriodo(tipo, clave) }))
}

function escalasParaPeriodo(tipo: PeriodoTipo): Escala[] {
  if (tipo === "SEMANA") return ["DIA"]
  if (tipo === "MES") return ["DIA", "SEMANA"]
  if (tipo === "TRIMESTRE") return ["DIA", "SEMANA", "MES"]
  if (tipo === "SEMESTRE") return ["SEMANA", "MES", "TRIMESTRE"]
  if (tipo === "ANIO") return ["SEMANA", "MES", "TRIMESTRE", "SEMESTRE"]
  return ["DIA", "SEMANA", "MES", "TRIMESTRE", "SEMESTRE"]
}

function escalaPredeterminada(tipo: PeriodoTipo): Escala {
  if (tipo === "SEMANA" || tipo === "MES") return "DIA"
  if (tipo === "TRIMESTRE") return "SEMANA"
  return "MES"
}

function etiquetaEscala(escala: Escala) {
  if (escala === "DIA") return "Día"
  if (escala === "SEMANA") return "Semana"
  if (escala === "MES") return "Mes"
  if (escala === "TRIMESTRE") return "Trimestre"
  return "Semestre"
}

function desplazamientoLunes(fechaIso: string) {
  const valor = new Date(`${fechaIso}T00:00:00Z`)
  const dia = valor.getUTCDay()
  return dia === 0 ? 6 : dia - 1
}

function claveEscala(fechaIso: string, escala: Escala) {
  if (escala === "DIA") return fechaIso
  if (escala === "SEMANA") return inicioSemana(fechaIso)
  if (escala === "MES") return fechaIso.slice(0, 7)
  if (escala === "TRIMESTRE") return claveTrimestre(fechaIso)
  return claveSemestre(fechaIso)
}

function etiquetaTramo(desde: string, hasta: string, escala: Escala) {
  if (escala === "DIA") return fechaCorta(desde)
  if (escala === "MES") return etiquetaMes(desde.slice(0, 7)).replace(/\s+\d{4}$/, "")
  if (escala === "TRIMESTRE") {
    const clave = claveTrimestre(desde)
    const [anio, trimestre] = clave.split("-Q")
    return `T${trimestre} ${anio}`
  }
  if (escala === "SEMESTRE") {
    const clave = claveSemestre(desde)
    const [anio, semestre] = clave.split("-S")
    return `S${semestre} ${anio}`
  }
  if (desde === hasta) return fechaCorta(desde)
  return `${fechaCorta(desde)}–${fechaCorta(hasta)}`
}

function crearTramos(desde: string, hasta: string, escala: Escala): PuntoTemporal[] {
  if (!desde || !hasta || desde > hasta) return []
  const tramos: PuntoTemporal[] = []

  if (escala === "DIA") {
    let actual = desde
    while (actual <= hasta) {
      tramos.push({
        clave: actual,
        desde: actual,
        hasta: actual,
        etiqueta: etiquetaTramo(actual, actual, escala),
        unidades: 0,
        venta: 0,
        devolucion: 0,
        movimientos: 0,
        variacion: null,
      })
      actual = sumarDias(actual, 1)
    }
    return tramos
  }

  if (escala === "SEMANA") {
    let semana = inicioSemana(desde)
    while (semana <= hasta) {
      const fin = sumarDias(semana, 6)
      const tramoDesde = semana < desde ? desde : semana
      const tramoHasta = fin > hasta ? hasta : fin
      tramos.push({
        clave: semana,
        desde: tramoDesde,
        hasta: tramoHasta,
        etiqueta: etiquetaTramo(tramoDesde, tramoHasta, escala),
        unidades: 0,
        venta: 0,
        devolucion: 0,
        movimientos: 0,
        variacion: null,
      })
      semana = sumarDias(semana, 7)
    }
    return tramos
  }

  if (escala === "MES") {
    let mes = `${desde.slice(0, 7)}-01`
    while (mes <= hasta) {
      const fin = finDeMes(mes.slice(0, 7))
      const tramoDesde = mes < desde ? desde : mes
      const tramoHasta = fin > hasta ? hasta : fin
      tramos.push({
        clave: mes.slice(0, 7),
        desde: tramoDesde,
        hasta: tramoHasta,
        etiqueta: etiquetaTramo(tramoDesde, tramoHasta, escala),
        unidades: 0,
        venta: 0,
        devolucion: 0,
        movimientos: 0,
        variacion: null,
      })
      const [anio, numeroMes] = mes.slice(0, 7).split("-").map(Number)
      mes = new Date(Date.UTC(anio, numeroMes, 1)).toISOString().slice(0, 10)
    }
    return tramos
  }

  const saltoMeses = escala === "TRIMESTRE" ? 3 : 6
  const [anioDesde, mesDesde] = desde.slice(0, 7).split("-").map(Number)
  const bloque = escala === "TRIMESTRE"
    ? Math.floor((mesDesde - 1) / 3)
    : Math.floor((mesDesde - 1) / 6)
  let inicio = new Date(Date.UTC(anioDesde, bloque * saltoMeses, 1)).toISOString().slice(0, 10)

  while (inicio <= hasta) {
    const [anio, mesNumero] = inicio.slice(0, 7).split("-").map(Number)
    const siguiente = new Date(Date.UTC(anio, mesNumero - 1 + saltoMeses, 1))
    const fin = new Date(siguiente.getTime() - 86400000).toISOString().slice(0, 10)
    const tramoDesde = inicio < desde ? desde : inicio
    const tramoHasta = fin > hasta ? hasta : fin
    tramos.push({
      clave: claveEscala(inicio, escala),
      desde: tramoDesde,
      hasta: tramoHasta,
      etiqueta: etiquetaTramo(inicio, fin, escala),
      unidades: 0,
      venta: 0,
      devolucion: 0,
      movimientos: 0,
      variacion: null,
    })
    inicio = siguiente.toISOString().slice(0, 10)
  }
  return tramos
}

export default function VentasClienteSku() {
  const [vista, setVista] = useState<Vista>("IMPORTAR")
  const [ventas, setVentas] = useState<VentaDiariaDb[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionListadoDb[]>([])
  const [importaciones, setImportaciones] = useState<ImportacionVentasDb[]>([])
  const [clientesSeleccionados, setClientesSeleccionados] = useState<string[]>([])
  const [sku, setSku] = useState("TODOS")
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("MES")
  const [periodoClave, setPeriodoClave] = useState("")
  const [escala, setEscala] = useState<Escala>("DIA")
  const [personalizadoDesde, setPersonalizadoDesde] = useState("")
  const [personalizadoHasta, setPersonalizadoHasta] = useState("")
  const [archivoNombre, setArchivoNombre] = useState("")
  const [archivoLeido, setArchivoLeido] =
    useState<ResultadoArchivoVentas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")

    try {
      const [ventasDb, devolucionesDb, importacionesDb] = await Promise.all([
        obtenerVentasDiariasDb(),
        obtenerDevolucionesDb(),
        obtenerImportacionesVentasDb(),
      ])
      setVentas(ventasDb)
      setDevoluciones(devolucionesDb)
      setImportaciones(importacionesDb)
      seleccionarUltimoMes(ventasDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el módulo de ventas.",
      )
    } finally {
      setCargando(false)
    }
  }

  function seleccionarUltimoMes(datos: VentaDiariaDb[] = ventas) {
    const fechas = Array.from(new Set(datos.map((item) => item.fecha_emision))).sort()
    const ultimaFecha = fechas.at(-1) ?? ""
    if (!ultimaFecha) {
      setPeriodoClave("")
      setPersonalizadoDesde("")
      setPersonalizadoHasta("")
      return
    }
    const mes = ultimaFecha.slice(0, 7)
    setPeriodoTipo("MES")
    setPeriodoClave(mes)
    setEscala("DIA")
    setPersonalizadoDesde(`${mes}-01`)
    setPersonalizadoHasta(finDeMes(mes))
  }

  function cambiarTipoPeriodo(tipo: PeriodoTipo) {
    setPeriodoTipo(tipo)
    setEscala(escalaPredeterminada(tipo))
    if (tipo === "PERSONALIZADO") {
      const actual = rangoPeriodo(periodoTipo, periodoClave, personalizadoDesde, personalizadoHasta)
      if (actual.desde) setPersonalizadoDesde(actual.desde)
      if (actual.hasta) setPersonalizadoHasta(actual.hasta)
      return
    }
    const opciones = opcionesPeriodo(ventas, tipo)
    setPeriodoClave(opciones.at(-1)?.clave ?? "")
  }

  function limpiarArchivo() {
    setArchivoNombre("")
    setArchivoLeido(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function seleccionarArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    if (!archivo) return

    setLeyendo(true)
    setMensaje("")
    setError("")
    setArchivoLeido(null)

    try {
      const resultado = archivo.name.toLowerCase().endsWith(".pdf")
        ? await leerArchivoVentasPdf(archivo)
        : await leerArchivoVentas(archivo)
      setArchivoNombre(archivo.name)
      setArchivoLeido(resultado)
    } catch (err) {
      limpiarArchivo()
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo leer el reporte de ventas.",
      )
    } finally {
      setLeyendo(false)
    }
  }

  async function guardarArchivo() {
    if (!archivoLeido || !archivoNombre) return

    if (
      importaciones.length > 0 &&
      !window.confirm(
        "Las líneas ya existentes se actualizarán por comprobante y SKU; las ventas nuevas se agregarán. ¿Deseas continuar?",
      )
    ) {
      return
    }

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      const respuesta = await importarVentasDb({
        archivoNombre,
        lineas: archivoLeido.lineas,
      })

      setMensaje(
        `Ventas guardadas: ${numero(respuesta.movimientos_nuevos)} nuevas y ${numero(respuesta.movimientos_actualizados)} actualizadas.`,
      )
      limpiarArchivo()
      await cargarDatos()
      setVista("HISTORIAL")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron guardar las ventas.",
      )
    } finally {
      setGuardando(false)
    }
  }

  const opciones = useMemo(
    () => opcionesPeriodo(ventas, periodoTipo),
    [ventas, periodoTipo],
  )

  useEffect(() => {
    if (periodoTipo === "PERSONALIZADO") return
    if (opciones.length === 0) {
      if (periodoClave) setPeriodoClave("")
      return
    }
    if (!opciones.some((item) => item.clave === periodoClave)) {
      setPeriodoClave(opciones.at(-1)?.clave ?? "")
    }
  }, [opciones, periodoClave, periodoTipo])

  const escalasDisponibles = useMemo(
    () => escalasParaPeriodo(periodoTipo),
    [periodoTipo],
  )

  useEffect(() => {
    if (!escalasDisponibles.includes(escala)) {
      setEscala(escalaPredeterminada(periodoTipo))
    }
  }, [escala, escalasDisponibles, periodoTipo])

  const rangoActivo = useMemo(
    () => rangoPeriodo(
      periodoTipo,
      periodoClave,
      personalizadoDesde,
      personalizadoHasta,
    ),
    [periodoTipo, periodoClave, personalizadoDesde, personalizadoHasta],
  )

  const ventasPeriodo = useMemo(
    () => ventas.filter((item) =>
      (!rangoActivo.desde || item.fecha_emision >= rangoActivo.desde) &&
      (!rangoActivo.hasta || item.fecha_emision <= rangoActivo.hasta)),
    [ventas, rangoActivo],
  )

  const clientes = useMemo(() => {
    const mapa = new Map<string, string>()
    ventasPeriodo.forEach((item) => {
      const clave = clienteClave(item.cliente_nombre)
      if (!mapa.has(clave)) mapa.set(clave, clienteEtiqueta(clave, item.cliente_nombre))
    })
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"))
  }, [ventasPeriodo])

  useEffect(() => {
    if (clientesSeleccionados.length === 0) return
    const disponibles = new Set(clientes.map(([clave]) => clave))
    const validos = clientesSeleccionados.filter((clave) => disponibles.has(clave))
    if (validos.length !== clientesSeleccionados.length) setClientesSeleccionados(validos)
  }, [clientes, clientesSeleccionados])

  const todosLosClientes = clientesSeleccionados.length === 0

  const resumenClientes = useMemo(() => {
    if (todosLosClientes) return "Todos los clientes"
    if (clientesSeleccionados.length === 1) {
      return clientes.find(([clave]) => clave === clientesSeleccionados[0])?.[1] ?? "1 cliente seleccionado"
    }
    return `${clientesSeleccionados.length} clientes seleccionados`
  }, [todosLosClientes, clientesSeleccionados, clientes])

  function alternarCliente(clave: string) {
    setClientesSeleccionados((actual) =>
      actual.includes(clave)
        ? actual.filter((item) => item !== clave)
        : [...actual, clave],
    )
    setSku("TODOS")
  }

  const skus = useMemo(() => {
    const mapa = new Map<string, string>()
    ventasPeriodo
      .filter((item) => clientesSeleccionados.length === 0 || clientesSeleccionados.includes(clienteClave(item.cliente_nombre)))
      .forEach((item) => mapa.set(item.sku, item.producto_nombre))
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"))
  }, [ventasPeriodo, clientesSeleccionados])

  useEffect(() => {
    if (sku !== "TODOS" && !skus.some(([codigo]) => codigo === sku)) setSku("TODOS")
  }, [sku, skus])

  const ventasFiltradas = useMemo(
    () => ventasPeriodo.filter((item) =>
      (clientesSeleccionados.length === 0 || clientesSeleccionados.includes(clienteClave(item.cliente_nombre))) &&
      (sku === "TODOS" || item.sku === sku)),
    [ventasPeriodo, clientesSeleccionados, sku],
  )

  const devolucionesEstimadas = useMemo<DevolucionEstimada[]>(() => {
    const filas: DevolucionEstimada[] = []
    devoluciones.forEach((devolucion) => {
      const nombreCliente = devolucion.cliente?.nombre ?? "Sin cliente"
      const claveCliente = clienteClave(nombreCliente)
      ;(devolucion.detalles ?? []).forEach((detalle) => {
        const semanaOrigen = detalle.semana_origen_inicio
        const codigo = detalle.producto?.codigo ?? detalle.sku_documento ?? ""
        if (!semanaOrigen || !codigo) return

        // La semana de origen es la clasificación oficial ya calculada por Devoluciones.
        // Para la escala diaria conservamos el mismo día relativo dentro de esa semana.
        const fechaEstimada = sumarDias(
          semanaOrigen,
          desplazamientoLunes(devolucion.fecha_devolucion),
        )
        if (rangoActivo.desde && fechaEstimada < rangoActivo.desde) return
        if (rangoActivo.hasta && fechaEstimada > rangoActivo.hasta) return
        if (clientesSeleccionados.length > 0 && !clientesSeleccionados.includes(claveCliente)) return
        if (sku !== "TODOS" && codigo !== sku) return

        const unidades = Number(detalle.unidades ?? 0)
        const valorDocumento = Number(detalle.valor_total_documento ?? 0)
        const precio = Number(detalle.precio_unitario_documento ?? 0)
        const valor = Math.abs(valorDocumento || (unidades * precio))
        filas.push({
          fecha: fechaEstimada,
          clienteClave: claveCliente,
          cliente: clienteEtiqueta(claveCliente, nombreCliente),
          sku: codigo,
          producto:
            detalle.producto?.corto ??
            detalle.producto_nombre_documento ??
            codigo,
          unidades,
          valor,
        })
      })
    })
    return filas
  }, [devoluciones, rangoActivo, clientesSeleccionados, sku])

  const serieTemporal = useMemo<PuntoTemporal[]>(() => {
    const tramos = crearTramos(rangoActivo.desde, rangoActivo.hasta, escala)
    const mapa = new Map(tramos.map((item) => [item.clave, item]))

    ventasFiltradas.forEach((item) => {
      const clave = claveEscala(item.fecha_emision, escala)
      const actual = mapa.get(clave)
      if (!actual) return
      actual.unidades += Number(item.cantidad ?? 0)
      actual.venta += Number(item.total_sin_impuestos ?? 0)
      actual.movimientos += 1
    })

    devolucionesEstimadas.forEach((item) => {
      const clave = claveEscala(item.fecha, escala)
      const actual = mapa.get(clave)
      if (!actual) return
      actual.devolucion += Number(item.valor ?? 0)
    })

    return tramos.map((item, indice, lista) => {
      const anterior = lista[indice - 1]?.venta
      const variacion = indice === 0
        ? null
        : anterior === 0
          ? item.venta > 0 ? 100 : 0
          : ((item.venta - anterior) / Math.abs(anterior)) * 100
      return { ...item, variacion }
    })
  }, [rangoActivo, escala, ventasFiltradas, devolucionesEstimadas])

  const totalVenta = ventasFiltradas.reduce(
    (total, item) => total + Number(item.total_sin_impuestos ?? 0),
    0,
  )
  const totalUnidades = ventasFiltradas.reduce(
    (total, item) => total + Number(item.cantidad ?? 0),
    0,
  )
  const totalMovimientos = ventasFiltradas.length
  const totalDevolucion = devolucionesEstimadas.reduce(
    (total, item) => total + Number(item.valor ?? 0),
    0,
  )
  const tasaDevolucion = totalVenta > 0 ? (totalDevolucion / totalVenta) * 100 : null

  const rankingClientes = useMemo(
    () => agruparVentas(
      ventasFiltradas,
      (item) => {
        const clave = clienteClave(item.cliente_nombre)
        return clienteEtiqueta(clave, item.cliente_nombre)
      },
    ).slice(0, 8),
    [ventasFiltradas],
  )

  const rankingSku = useMemo(
    () => agruparVentas(
      ventasFiltradas,
      (item) => `${item.sku}|${item.producto_nombre}`,
    ).slice(0, 12),
    [ventasFiltradas],
  )

  return (
    <main className="c1-ventas" style={pagina}>
      <style>{estilosResponsive}</style>

      <ModalMensaje
        abierto={mensaje !== ""}
        tipo="EXITO"
        mensaje={mensaje}
        cerrar={() => setMensaje("")}
        cierreAutomaticoMs={4000}
      />
      <ModalMensaje
        abierto={error !== ""}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />

      <header className="ventas-header" style={cabecera}>
        <div>
          <span style={etiqueta}>FACTURACIÓN REAL</span>
          <h1 style={titulo}>Ventas</h1>
          <p style={subtitulo}>
            Importa el PDF “VENTAS POR ITEM” del sistema de facturación y consulta
            el historial de cargas. El análisis comercial está centralizado en Inicio → Comercial.
          </p>
        </div>
        <button
          type="button"
          onClick={cargarDatos}
          disabled={cargando || guardando}
          style={botonSecundario}
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </header>
<nav style={pestanas}>
        {([
          ["IMPORTAR", "Importar ventas"],
          ["HISTORIAL", "Historial"],
        ] as [Vista, string][]).map(([codigo, texto]) => (
          <button
            key={codigo}
            type="button"
            onClick={() => setVista(codigo)}
            style={{
              ...botonPestana,
              ...(vista === codigo ? botonPestanaActivo : {}),
            }}
          >
            {texto}
          </button>
        ))}
      </nav>

      {vista === "IMPORTAR" && (
        <section style={panel}>
          <div className="ventas-panel-heading">
            <div>
              <h2 style={tituloPanel}>Cargar reporte de ventas</h2>
              <p style={descripcion}>
                Carga el PDF del sistema de facturación. También puedes usar el
                Excel del mismo reporte. Antes de guardar verás una validación.
              </p>
              <p style={{ ...descripcion, marginTop: 6, fontWeight: 800, color: "#a51d24" }}>
                Lector PDF 2026 · V12.4B
              </p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={leyendo || guardando}
              style={botonPrincipal}
            >
              {leyendo ? "Leyendo archivo..." : "Seleccionar PDF o Excel"}
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.xlsx,.xls"
            onChange={seleccionarArchivo}
            style={{ display: "none" }}
          />

          {archivoLeido ? (
            <>
              <div className="ventas-summary-grid" style={resumenArchivo}>
                <Tarjeta etiqueta="Archivo" valor={archivoNombre} />
                <Tarjeta
                  etiqueta="Periodo"
                  valor={`${fecha(archivoLeido.fechaDesde)} a ${fecha(archivoLeido.fechaHasta)}`}
                />
                <Tarjeta
                  etiqueta="Movimientos"
                  valor={numero(archivoLeido.movimientos)}
                />
                <Tarjeta etiqueta="Clientes" valor={numero(archivoLeido.clientes)} />
                <Tarjeta etiqueta="SKU" valor={numero(archivoLeido.skus)} />
                <Tarjeta etiqueta="Unidades" valor={numero(archivoLeido.unidades)} />
                <Tarjeta
                  etiqueta="Venta sin impuestos"
                  valor={moneda(archivoLeido.ventaSinImpuestos)}
                />
              </div>

              <div style={aviso}>
                La identificación se realiza por comprobante y SKU. Si vuelves a
                cargar el acumulado, se actualizarán las líneas existentes y se
                agregarán solamente las nuevas.
              </div>

              {archivoLeido.advertencias.length > 0 && (
                <div style={advertenciaArchivo}>
                  {archivoLeido.advertencias.map((advertencia) => (
                    <p key={advertencia}>{advertencia}</p>
                  ))}
                </div>
              )}

              <div style={acciones}>
                <button
                  type="button"
                  onClick={limpiarArchivo}
                  disabled={guardando}
                  style={botonSecundario}
                >
                  Quitar archivo
                </button>
                <button
                  type="button"
                  onClick={guardarArchivo}
                  disabled={guardando}
                  style={botonPrincipal}
                >
                  {guardando ? "Guardando..." : "Guardar ventas"}
                </button>
              </div>
            </>
          ) : (
            <div style={zonaVacia}>
              Selecciona el PDF “VENTAS POR ITEM” exportado desde Admisys.
            </div>
          )}
        </section>
      )}

      {vista === "HISTORIAL" && (
        <section style={panel}>
          <h2 style={tituloPanel}>Archivos procesados</h2>
          {importaciones.length === 0 ? (
            <div style={zonaVacia}>Aún no existen importaciones de ventas.</div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>Fecha de carga</th>
                    <th style={encabezado}>Archivo</th>
                    <th style={encabezado}>Periodo</th>
                    <th style={encabezadoNumero}>Movimientos</th>
                    <th style={encabezadoNumero}>Nuevos</th>
                    <th style={encabezadoNumero}>Actualizados</th>
                    <th style={encabezadoNumero}>Unidades</th>
                    <th style={encabezadoNumero}>Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {importaciones.map((item) => (
                    <tr key={item.id}>
                      <td style={celda}>{fechaHora(item.creado_en)}</td>
                      <td style={celda}>{item.archivo_nombre}</td>
                      <td style={celda}>
                        {fecha(item.fecha_desde)} a {fecha(item.fecha_hasta)}
                      </td>
                      <td style={celdaNumero}>{numero(item.movimientos_archivo)}</td>
                      <td style={celdaNumero}>{numero(item.movimientos_nuevos)}</td>
                      <td style={celdaNumero}>{numero(item.movimientos_actualizados)}</td>
                      <td style={celdaNumero}>{numero(item.unidades_archivo)}</td>
                      <td style={celdaNumero}>{moneda(item.venta_sin_impuestos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function agruparVentas(
  ventas: VentaDiariaDb[],
  clave: (item: VentaDiariaDb) => string,
) {
  const mapa = new Map<string, { etiqueta: string; venta: number; unidades: number }>()
  ventas.forEach((item) => {
    const etiqueta = clave(item)
    const actual = mapa.get(etiqueta) ?? { etiqueta, venta: 0, unidades: 0 }
    actual.venta += Number(item.total_sin_impuestos ?? 0)
    actual.unidades += Number(item.cantidad ?? 0)
    mapa.set(etiqueta, actual)
  })
  return Array.from(mapa.values()).sort((a, b) => b.venta - a.venta)
}

function Tarjeta({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <article style={tarjeta}>
      <span style={tarjetaEtiqueta}>{etiqueta}</span>
      <strong style={tarjetaValor}>{valor}</strong>
    </article>
  )
}

function Variacion({ valor }: { valor: number | null }) {
  if (valor === null) return <span style={{ color: "#6b7280" }}>—</span>
  const positivo = valor >= 0
  return (
    <strong style={{ color: positivo ? "#15803d" : "#b91c1c" }}>
      {positivo ? "▲" : "▼"} {Math.abs(valor).toLocaleString("es-EC", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%
    </strong>
  )
}

function Ranking({
  titulo: tituloRanking,
  datos,
}: {
  titulo: string
  datos: { etiqueta: string; venta: number; unidades: number }[]
}) {
  const maximo = Math.max(...datos.map((item) => item.venta), 1)
  return (
    <section style={panel}>
      <h2 style={tituloPanel}>{tituloRanking}</h2>
      {datos.length === 0 ? (
        <div style={zonaVacia}>Sin información.</div>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {datos.map((item) => (
            <div key={item.etiqueta}>
              <div style={rankingCabecera}>
                <span>{item.etiqueta}</span>
                <strong>{moneda(item.venta)}</strong>
              </div>
              <div style={barraFondo}>
                <div
                  style={{
                    ...barraValor,
                    width: `${Math.max((item.venta / maximo) * 100, 1)}%`,
                  }}
                />
              </div>
              <small style={{ color: "#786d68" }}>
                {numero(item.unidades)} Unid.
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function GraficoVentas({ datos, escala }: { datos: PuntoTemporal[]; escala: Escala }) {
  const ancho = 940
  const alto = 330
  const margen = { izquierda: 76, derecha: 24, arriba: 44, abajo: 64 }
  const anchoUtil = ancho - margen.izquierda - margen.derecha
  const altoUtil = alto - margen.arriba - margen.abajo
  const maximo = Math.max(
    ...datos.flatMap((item) => [item.venta, item.devolucion]),
    1,
  ) * 1.08
  const x = (indice: number) => margen.izquierda +
    (datos.length === 1 ? anchoUtil / 2 : (indice / (datos.length - 1)) * anchoUtil)
  const y = (valor: number) => margen.arriba + altoUtil - (valor / maximo) * altoUtil
  const puntosVenta = datos.map((item, indice) => `${x(indice)},${y(item.venta)}`).join(" ")
  const puntosDevolucion = datos.map((item, indice) => `${x(indice)},${y(item.devolucion)}`).join(" ")
  const cada = Math.max(1, Math.ceil(datos.length / 12))

  return (
    <div className="ventas-chart">
      <div className="ventas-chart-legend">
        <span><i className="venta" />Facturación</span>
        <span><i className="devolucion" />Devolución estimada</span>
      </div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Facturación y devolución estimada por ${etiquetaEscala(escala).toLowerCase()}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((porcion) => {
          const valor = maximo * porcion
          const posicionY = y(valor)
          return (
            <g key={porcion}>
              <line
                x1={margen.izquierda}
                x2={ancho - margen.derecha}
                y1={posicionY}
                y2={posicionY}
                stroke="#eadfd9"
              />
              <text
                x={margen.izquierda - 10}
                y={posicionY + 4}
                textAnchor="end"
                fontSize="10"
                fill="#766762"
              >
                {moneda(valor).replace(",00", "")}
              </text>
            </g>
          )
        })}

        <polyline
          points={puntosVenta}
          fill="none"
          stroke="#8f1d24"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={puntosDevolucion}
          fill="none"
          stroke="#f7931e"
          strokeWidth="3"
          strokeDasharray="8 5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {datos.map((item, indice) => (
          <g key={item.clave}>
            <circle cx={x(indice)} cy={y(item.venta)} r="4.5" fill="#8f1d24">
              <title>{item.etiqueta} · Facturación: {moneda(item.venta)}</title>
            </circle>
            {item.devolucion > 0 && (
              <circle cx={x(indice)} cy={y(item.devolucion)} r="4" fill="#f7931e">
                <title>{item.etiqueta} · Devolución estimada: {moneda(item.devolucion)}</title>
              </circle>
            )}
            {(indice % cada === 0 || indice === datos.length - 1) && (
              <text
                x={x(indice)}
                y={alto - 28}
                textAnchor="middle"
                fontSize="9"
                fill="#766762"
              >
                {item.etiqueta}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

const selectorMultiple = {
  position: "relative" as const,
  width: "100%",
}

const selectorMultipleResumen = {
  width: "100%",
  minHeight: "43px",
  padding: "9px 11px",
  border: "1px solid #d6d9df",
  borderRadius: "8px",
  background: "white",
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  listStyle: "none" as const,
  boxSizing: "border-box" as const,
  color: "#25272b",
  fontSize: "14px",
  fontWeight: 400,
  textTransform: "none" as const,
}

const selectorMultipleLista = {
  position: "absolute" as const,
  zIndex: 30,
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  maxHeight: 280,
  overflowY: "auto" as const,
  padding: 10,
  border: "1px solid #d9cdc7",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 12px 28px rgba(74, 49, 40, 0.16)",
}

const opcionMultiple = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "8px 6px",
  cursor: "pointer",
  fontSize: 13,
  color: "#403633",
}

const pagina = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "24px",
  color: "#25272b",
}

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "18px",
  marginBottom: "18px",
}

const etiqueta = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: ".7px",
}

const titulo = { margin: "5px 0 4px", fontSize: "32px", color: "#261d1c" }
const subtitulo = { margin: 0, color: "#6b7280", lineHeight: 1.45 }

const pestanas = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "6px",
  padding: "6px",
  marginBottom: "22px",
  borderRadius: "11px",
  background: "#e9ebef",
}

const botonPestana = {
  padding: "10px 18px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "#6b7280",
  fontWeight: 800,
  cursor: "pointer",
}

const botonPestanaActivo = { background: "#9f1f28", color: "white" }

const panel = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "22px",
  marginBottom: "18px",
  border: "1px solid #e0e3e8",
  borderRadius: "14px",
  background: "white",
  boxShadow: "0 6px 20px rgba(70,42,32,.045)",
}

const tituloPanel = { margin: 0, fontSize: "20px", color: "#211b1b" }
const descripcion = { margin: "5px 0 0", color: "#6b7280", lineHeight: 1.45 }

const botonPrincipal = {
  padding: "11px 17px",
  border: "none",
  borderRadius: "9px",
  background: "#9f1f28",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
}

const botonSecundario = {
  padding: "10px 16px",
  border: "1px solid #9f1f28",
  borderRadius: "9px",
  background: "white",
  color: "#9f1f28",
  fontWeight: 800,
  cursor: "pointer",
}

const resumenArchivo = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "12px",
  marginTop: "22px",
}

const kpis = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: "12px",
  marginBottom: "18px",
}

const tarjeta = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  padding: "16px",
  border: "1px solid #e0e3e8",
  borderRadius: "12px",
  background: "white",
}

const tarjetaEtiqueta = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase" as const,
  letterSpacing: ".35px",
}

const tarjetaValor = {
  color: "#8f1d24",
  fontSize: "clamp(17px, 2vw, 21px)",
  lineHeight: 1.15,
  overflowWrap: "anywhere" as const,
}

const aviso = {
  marginTop: "16px",
  padding: "12px 14px",
  border: "1px solid #fed7aa",
  borderRadius: "10px",
  background: "#fff7ed",
  color: "#9a4c00",
  lineHeight: 1.45,
}

const advertenciaArchivo = {
  marginTop: "12px",
  padding: "12px 14px",
  borderLeft: "4px solid #dc2626",
  background: "#fef2f2",
  color: "#991b1b",
  lineHeight: 1.45,
}

const acciones = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "18px",
}

const zonaVacia = {
  marginTop: "18px",
  padding: "24px",
  border: "1px dashed #d7dbe2",
  borderRadius: "11px",
  background: "#fafafa",
  color: "#6b7280",
  textAlign: "center" as const,
}

const filtros = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "14px",
  marginTop: "18px",
}

const label = {
  display: "grid",
  gap: "7px",
  color: "#6b5b55",
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase" as const,
}

const campo = {
  width: "100%",
  minHeight: "43px",
  padding: "9px 11px",
  border: "1px solid #d6d9df",
  borderRadius: "8px",
  background: "white",
}

const tabla = {
  width: "100%",
  minWidth: "760px",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "11px",
  borderBottom: "2px solid #ded2cc",
  color: "#6b5b55",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
}

const encabezadoNumero = { ...encabezado, textAlign: "right" as const }
const celda = { padding: "11px", borderBottom: "1px solid #eeeeee" }
const celdaNumero = { ...celda, textAlign: "right" as const, whiteSpace: "nowrap" as const }

const rankings = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "18px",
}

const rankingCabecera = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "5px",
  color: "#403735",
  fontSize: "12px",
}

const barraFondo = {
  height: "7px",
  marginBottom: "4px",
  borderRadius: "999px",
  background: "#f0e7e2",
  overflow: "hidden",
}

const barraValor = {
  height: "100%",
  borderRadius: "999px",
  background: "linear-gradient(90deg, #8f1d24, #f7931e)",
}

const estilosResponsive = `
  .c1-ventas .ventas-panel-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
  }

  .c1-ventas .ventas-filter-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .c1-ventas .ventas-main-tabs {
    display: flex;
    gap: 6px;
    padding: 6px;
    margin-bottom: 14px;
    border-radius: 11px;
    background: #e9ebef;
  }

  .c1-ventas .ventas-main-tabs button {
    flex: 0 1 210px;
    min-height: 42px;
    padding: 10px 18px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #6b7280;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .c1-ventas .ventas-main-tabs button.active {
    background: #9f1f28;
    color: white;
  }

  .c1-ventas .ventas-chart {
    width: 100%;
    margin-top: 18px;
    overflow-x: auto;
    border: 1px solid #eee3dd;
    border-radius: 12px;
    background: #fffdfb;
  }

  .c1-ventas .ventas-chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    padding: 12px 16px 0;
    color: #6b5b55;
    font-size: 11px;
    font-weight: 800;
  }

  .c1-ventas .ventas-chart-legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .c1-ventas .ventas-chart-legend i {
    display: inline-block;
    width: 18px;
    height: 3px;
    border-radius: 999px;
  }

  .c1-ventas .ventas-chart-legend i.venta { background: #8f1d24; }
  .c1-ventas .ventas-chart-legend i.devolucion { background: #f7931e; }

  .c1-ventas .ventas-chart svg {
    display: block;
    min-width: 760px;
    width: 100%;
    height: auto;
  }

  @media (max-width: 1100px) {
    .c1-ventas { padding: 18px !important; }
    .c1-ventas .ventas-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  }

  @media (max-width: 760px) {
    .c1-ventas { padding: 14px !important; }
    .c1-ventas .ventas-header,
    .c1-ventas .ventas-panel-heading {
      flex-direction: column;
    }
    .c1-ventas .ventas-header button,
    .c1-ventas .ventas-panel-heading button {
      width: 100%;
    }
    .c1-ventas .ventas-filter-actions {
      width: 100%;
    }
    .c1-ventas h1 { font-size: 25px !important; }
    .c1-ventas nav button { flex: 1 1 140px; }
    .c1-ventas .ventas-main-tabs button { flex: 1 1 50%; }
    .c1-ventas .ventas-kpis,
    .c1-ventas .ventas-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
    .c1-ventas .ventas-rankings {
      grid-template-columns: 1fr !important;
    }
    .c1-ventas .ventas-filtros {
      grid-template-columns: 1fr !important;
    }
  }
`
