import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
} from "../repositories/devolucionRepository"
import {
  obtenerFacturasDb,
  type FacturaDetalleDb,
} from "../repositories/facturasRepository"
import {
  obtenerNominaMensualAreaDb,
  type NominaMensualAreaDb,
} from "../repositories/nominaRepository"
import {
  obtenerPromocionesDb,
  type PromocionDb,
} from "../repositories/promocionesRepository"
import {
  obtenerReglasDistribucionDb,
  REGLAS_DISTRIBUCION_PREDETERMINADAS,
  type BaseDistribucion,
  type ReglaDistribucionDb,
} from "../repositories/rentabilidadRepository"
import {
  obtenerVentasDiariasRangoDb,
  type VentaDiariaDb,
} from "../repositories/ventasRepository"

type Cliente = {
  id: string
  nombre: string
}

type Producto = {
  id: string
  codigo: string
  nombre: string
  corto: string
}

type ClienteProducto = {
  cliente_id: string
  producto_id: string
  precio: number | null
}

type CostoProducto = {
  producto_id: string
  producto_codigo: string
  batch_calculado_kg: number | null
  rendimiento_unidades: number | null
  costo_materia_prima_unidad: number | null
  costo_empaque_unidad: number | null
  costo_materiales_unidad: number | null
  items_sin_costo: number
}

type FilaRentabilidad = {
  key: string
  clienteId: string
  cliente: string
  productoId: string
  codigo: string
  sku: string
  unidades: number
  unidadesDevueltas: number
  ventaFacturada: number
  descuentos: number
  devoluciones: number
  ventasNetas: number
  kgEquivalente: number
  costoMateriaPrimaUnitario: number | null
  costoEmpaqueUnitario: number | null
  costoMaterialesUnitario: number | null
  costoMateriales: number | null
  manoObraDirecta: number
  transporte: number
  gastoClienteDirecto: number
  gastoGeneralAsignado: number
  margenBruto: number | null
  margenBrutoPorcentaje: number | null
  contribucion: number | null
  ebitda: number | null
  margenEbitda: number | null
  completo: boolean
}

type ResumenSku = {
  id: string
  codigo: string
  nombre: string
  unidades: number
  unidadesDevueltas: number
  ventaFacturada: number
  descuentos: number
  devoluciones: number
  ventasNetas: number
  costoMateriales: number | null
  manoObraDirecta: number
  margenBruto: number | null
  margenBrutoPorcentaje: number | null
  completo: boolean
}

type ResumenCliente = {
  id: string
  nombre: string
  unidades: number
  ventasNetas: number
  transporte: number
  gastoClienteDirecto: number
  gastoGeneralAsignado: number
  gastosCliente: number
  gastosPorcentaje: number
  ebitda: number | null
  margenEbitda: number | null
  completo: boolean
}

type EscenarioComparacion = {
  id: string
  etiqueta: string
  periodo: string
  cliente: string
  sku: string
  codigo: string
  diasPromocion: number
  precio: number
  unidadesBase: number
  unidades: number
  incrementoVentasPorcentaje: number
  incrementoMinimoPorcentaje: number | null
  unidadesEquilibrio: number | null
  devolucionPorcentaje: number
  descuentoPorcentaje: number
  descuentoMaximo: number
  objetivo: number
  ventaNeta: number
  margenBrutoPorcentaje: number
  ebitdaBase: number
  ebitda: number
  ebitdaIncremental: number
  ebitdaIncrementalPorcentaje: number | null
  margenEbitdaPorcentaje: number
  cumple: boolean
}

function fechaIsoLocal(fecha = new Date()) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function rangoMes(mes: string) {
  const [anio, numeroMes] = mes.split("-").map(Number)
  const ultimo = new Date(anio, numeroMes, 0).getDate()
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimo).padStart(2, "0")}`,
  }
}

function nombreMes(mes: string) {
  if (!mes) return ""
  return new Intl.DateTimeFormat("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mes}-01T00:00:00Z`))
}

function rangoCostosAnioCurso() {
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const ultimoDiaMesCerrado = new Date(anio, hoy.getMonth(), 0)

  if (ultimoDiaMesCerrado.getFullYear() !== anio) {
    return {
      desde: `${anio}-01-01`,
      hasta: `${anio}-01-01`,
      periodoDesde: `${anio}-01-01`,
      periodoHasta: `${anio}-01-01`,
      etiqueta: `Sin meses cerrados en ${anio}`,
    }
  }

  const hasta = fechaIsoLocal(ultimoDiaMesCerrado)
  const mesHasta = hasta.slice(0, 7)

  return {
    desde: `${anio}-01-01`,
    hasta,
    periodoDesde: `${anio}-01-01`,
    periodoHasta: `${mesHasta}-01`,
    etiqueta: `Promedio ponderado enero–${nombreMes(mesHasta)}`,
  }
}

function sumarDias(fechaIso: string, dias: number) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIsoLocal(fecha)
}

function inicioSemana(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  const dia = fecha.getDay()
  fecha.setDate(fecha.getDate() - (dia === 0 ? 6 : dia - 1))
  return fechaIsoLocal(fecha)
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
}

function claveCliente(nombre: string) {
  const texto = normalizar(nombre)
  if (
    texto.includes("FAVORITA") ||
    texto.includes("SUPERMAXI") ||
    texto.includes("MEGAMAXI")
  ) return "CORPORACION FAVORITA"
  if (texto.includes("SANTAMARIA")) return "MEGA SANTAMARIA"
  if (
    texto.includes("EL ROSADO") ||
    texto.includes("MI COMISARIATO") ||
    texto.includes("COMISARIATO")
  ) return "CORPORACION EL ROSADO"
  if (texto.includes("TUTI")) return "TUTI"
  return texto
    .replace(/\bC A\b/g, "")
    .replace(/\bCIA LTDA\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function dinero(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(valor) ? valor : 0)
}

function numero(valor: number, decimales = 0) {
  return new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  }).format(Number.isFinite(valor) ? valor : 0)
}

function porcentaje(valor: number | null) {
  return valor === null || !Number.isFinite(valor)
    ? "—"
    : `${valor.toFixed(1)}%`
}

function valorPositivo(valor: string, respaldo = 0) {
  const numeroValor = Number(valor)
  return Number.isFinite(numeroValor) && numeroValor >= 0
    ? numeroValor
    : respaldo
}

type SimuladorRentabilidadProps = {
  modoIntegrado?: boolean
  clienteInicial?: string
  productoInicial?: string
  mesInicial?: string
}

export default function SimuladorRentabilidad({
  modoIntegrado = false,
  clienteInicial = "",
  productoInicial = "",
  mesInicial = "",
}: SimuladorRentabilidadProps = {}) {
  const mesActual = mesInicial || fechaIsoLocal().slice(0, 7)
  const [mes, setMes] = useState(mesActual)
  const [vista, setVista] = useState<"SKU" | "CLIENTE" | "SIMULADOR">(
    modoIntegrado ? "SIMULADOR" : "SKU",
  )
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [relaciones, setRelaciones] = useState<ClienteProducto[]>([])
  const [costos, setCostos] = useState<CostoProducto[]>([])
  const [ventas, setVentas] = useState<VentaDiariaDb[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionListadoDb[]>([])
  const [facturas, setFacturas] = useState<FacturaDetalleDb[]>([])
  const [nomina, setNomina] = useState<NominaMensualAreaDb[]>([])
  const [promociones, setPromociones] = useState<PromocionDb[]>([])
  const [reglas, setReglas] = useState<ReglaDistribucionDb[]>(
    REGLAS_DISTRIBUCION_PREDETERMINADAS,
  )
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const solicitudRef = useRef(0)

  const [clienteSimulador, setClienteSimulador] = useState("")
  const [productoSimulador, setProductoSimulador] = useState("")
  const [precioSimulador, setPrecioSimulador] = useState("")
  const [diasPromocion, setDiasPromocion] = useState("30")
  const [unidadesBasePeriodo, setUnidadesBasePeriodo] = useState(0)
  const [referenciaVentasSimulador, setReferenciaVentasSimulador] = useState("")
  const [unidadesSimulador, setUnidadesSimulador] = useState("0")
  const [devolucionSimulador, setDevolucionSimulador] = useState("0")
  const [descuentoSimulador, setDescuentoSimulador] = useState("0")
  const [incrementoVentasSimulador, setIncrementoVentasSimulador] = useState("0")
  const [manoObraVariable, setManoObraVariable] = useState(false)
  const [transporteVariable, setTransporteVariable] = useState(false)
  const [gastoClienteVariable, setGastoClienteVariable] = useState(false)
  const [margenObjetivo, setMargenObjetivo] = useState("10")
  const [escenarios, setEscenarios] = useState<EscenarioComparacion[]>([])
  const [mensajeComparacion, setMensajeComparacion] = useState("")
  const [referenciaSimulador, setReferenciaSimulador] = useState("")
  const numeroEscenarioRef = useRef(1)

  const rango = useMemo(() => rangoMes(mes), [mes])
  const rangoCostos = useMemo(() => rangoCostosAnioCurso(), [])
  const rangoDatos = modoIntegrado
    ? { desde: rangoCostos.desde, hasta: rangoCostos.hasta }
    : rango
  const referenciaCostosTexto = modoIntegrado
    ? rangoCostos.etiqueta
    : nombreMes(mes)
  const vistaActiva = modoIntegrado ? "SIMULADOR" : vista

  useEffect(() => {
    if (mesInicial) {
      setMes(mesInicial)
    }
  }, [mesInicial])

  useEffect(() => {
    if (clienteInicial) {
      setClienteSimulador(clienteInicial)
    }
  }, [clienteInicial])

  useEffect(() => {
    if (productoInicial) {
      setProductoSimulador(productoInicial)
    }
  }, [productoInicial])

  const cargarDatos = useCallback(async () => {
    const solicitud = solicitudRef.current + 1
    solicitudRef.current = solicitud
    setCargando(true)
    setError("")
    setAdvertencias([])

    const avisos: string[] = []
    const opcional = async <T,>(
      promesa: Promise<T>,
      respaldo: T,
      etiqueta: string,
    ) => {
      try {
        return await promesa
      } catch {
        avisos.push(etiqueta)
        return respaldo
      }
    }

    try {
      const [
        clientesRes,
        productosRes,
        relacionesRes,
        costosRes,
        ventasDb,
        devolucionesDb,
        facturasDb,
        nominaDb,
        promocionesDb,
        reglasDb,
      ] = await Promise.all([
        supabase
          .from("clientes")
          .select("id,nombre")
          .eq("activo", true)
          .order("nombre"),
        supabase
          .from("productos")
          .select("id,codigo,nombre,corto")
          .eq("activo", true)
          .order("corto"),
        supabase
          .from("cliente_productos")
          .select("cliente_id,producto_id,precio")
          .eq("activo", true),
        supabase
          .from("fm_vw_productos_costo_completo")
          .select(
            "producto_id,producto_codigo,batch_calculado_kg,rendimiento_unidades,costo_materia_prima_unidad,costo_empaque_unidad,costo_materiales_unidad,items_sin_costo",
          ),
        obtenerVentasDiariasRangoDb(rangoDatos.desde, rangoDatos.hasta),
        obtenerDevolucionesDb(
          rangoDatos.desde,
          sumarDias(rangoDatos.hasta, 60),
        ),
        opcional(obtenerFacturasDb(), [], "facturas y gastos"),
        opcional(obtenerNominaMensualAreaDb(), [], "nómina"),
        opcional(obtenerPromocionesDb(), [], "promociones"),
        opcional(
          obtenerReglasDistribucionDb(),
          REGLAS_DISTRIBUCION_PREDETERMINADAS,
          "reglas de distribución",
        ),
      ])

      if (clientesRes.error) throw clientesRes.error
      if (productosRes.error) throw productosRes.error
      if (relacionesRes.error) throw relacionesRes.error
      if (costosRes.error) throw costosRes.error
      if (solicitud !== solicitudRef.current) return

      setClientes((clientesRes.data ?? []) as Cliente[])
      setProductos((productosRes.data ?? []) as Producto[])
      setRelaciones((relacionesRes.data ?? []) as ClienteProducto[])
      setCostos((costosRes.data ?? []) as CostoProducto[])
      setVentas(ventasDb)
      setDevoluciones(devolucionesDb)
      setFacturas(facturasDb)
      setNomina(nominaDb)
      setPromociones(promocionesDb)
      setReglas(reglasDb)
      setAdvertencias(avisos)
    } catch (err) {
      if (solicitud !== solicitudRef.current) return
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo calcular la rentabilidad.",
      )
    } finally {
      if (solicitud === solicitudRef.current) {
        setCargando(false)
      }
    }
  }, [rangoDatos.desde, rangoDatos.hasta])

  useEffect(() => {
    void cargarDatos()
  }, [cargarDatos])

  const calculo = useMemo(() => {
    type Movimiento = Omit<
      FilaRentabilidad,
      | "ventasNetas"
      | "kgEquivalente"
      | "costoMateriaPrimaUnitario"
      | "costoEmpaqueUnitario"
      | "costoMaterialesUnitario"
      | "costoMateriales"
      | "manoObraDirecta"
      | "transporte"
      | "gastoClienteDirecto"
      | "gastoGeneralAsignado"
      | "margenBruto"
      | "margenBrutoPorcentaje"
      | "contribucion"
      | "ebitda"
      | "margenEbitda"
      | "completo"
    >
    type CampoAsignado =
      | "manoObraDirecta"
      | "transporte"
      | "gastoClienteDirecto"
      | "gastoGeneralAsignado"

    const clientesId = new Map(clientes.map((item) => [item.id, item]))
    const clientesClave = new Map(
      clientes.map((item) => [claveCliente(item.nombre), item]),
    )
    const productosId = new Map(productos.map((item) => [item.id, item]))
    const productosCodigo = new Map(
      productos.map((item) => [normalizar(item.codigo), item]),
    )
    const precios = new Map(
      relaciones.map((item) => [
        `${item.cliente_id}|${item.producto_id}`,
        item.precio == null ? null : Number(item.precio),
      ]),
    )
    const costosId = new Map(
      costos.map((item) => [item.producto_id, item]),
    )
    const costosCodigo = new Map(
      costos.map((item) => [normalizar(item.producto_codigo), item]),
    )
    const reglasMapa = new Map(
      reglas.map((item) => [item.codigo, item.base_distribucion]),
    )
    const baseRegla = (codigo: string, respaldo: BaseDistribucion) =>
      reglasMapa.get(codigo) ?? respaldo

    const resolverCliente = (id: string | null, nombre: string) => {
      if (id && clientesId.has(id)) return clientesId.get(id)!
      return clientesClave.get(claveCliente(nombre)) ?? {
        id: `CLIENTE:${claveCliente(nombre)}`,
        nombre,
      }
    }
    const resolverProducto = (id: string | null, codigo: string, nombre: string) => {
      if (id && productosId.has(id)) return productosId.get(id)!
      return productosCodigo.get(normalizar(codigo)) ?? {
        id: `SKU:${normalizar(codigo)}`,
        codigo,
        corto: nombre || codigo,
        nombre: nombre || codigo,
      }
    }

    const promocionesPorClave = new Map<
      string,
      Array<{
        desde: string
        hasta: string
        tipo: "PORCENTAJE" | "VALOR_UNIDAD"
        valor: number
      }>
    >()
    promociones
      .filter((promocion) => promocion.activo)
      .forEach((promocion) => {
        promocion.productos.forEach((producto) => {
          const key = `${promocion.cliente_id}|${producto.producto_id}`
          const lista = promocionesPorClave.get(key) ?? []
          lista.push({
            desde: promocion.fecha_inicio,
            hasta: promocion.fecha_fin,
            tipo: producto.tipo_descuento,
            valor: Number(producto.valor_descuento),
          })
          promocionesPorClave.set(key, lista)
        })
      })

    const movimientos = new Map<string, Movimiento>()
    const obtenerMovimiento = (
      cliente: Cliente,
      producto: Producto,
    ) => {
      const key = `${cliente.id}|${producto.id}`
      const existente = movimientos.get(key)
      if (existente) return existente
      const nuevo: Movimiento = {
        key,
        clienteId: cliente.id,
        cliente: cliente.nombre,
        productoId: producto.id,
        codigo: producto.codigo,
        sku: producto.corto || producto.nombre,
        unidades: 0,
        unidadesDevueltas: 0,
        ventaFacturada: 0,
        descuentos: 0,
        devoluciones: 0,
      }
      movimientos.set(key, nuevo)
      return nuevo
    }

    ventas.forEach((venta) => {
      const cliente = resolverCliente(
        venta.cliente_id,
        venta.cliente_nombre,
      )
      const producto = resolverProducto(
        venta.producto_id,
        venta.sku,
        venta.producto_nombre,
      )
      const movimiento = obtenerMovimiento(cliente, producto)
      const unidades = Number(venta.cantidad ?? 0)
      const valor = Number(venta.total_sin_impuestos ?? 0)
      movimiento.unidades += unidades
      movimiento.ventaFacturada += valor

      const descuentosVenta = (
        promocionesPorClave.get(movimiento.key) ?? []
      )
        .filter(
          (promocion) =>
            venta.fecha_emision >= promocion.desde &&
            venta.fecha_emision <= promocion.hasta,
        )
        .reduce(
          (total, promocion) =>
            total +
            (promocion.tipo === "PORCENTAJE"
              ? (valor * promocion.valor) / 100
              : unidades * promocion.valor),
          0,
        )
      movimiento.descuentos += Math.min(
        Math.max(0, descuentosVenta),
        Math.max(0, valor),
      )
    })

    const semanaDesde = inicioSemana(rangoDatos.desde)
    const semanaHasta = inicioSemana(rangoDatos.hasta)
    devoluciones.forEach((devolucion) => {
      if (!devolucion.cliente) return
      const cliente = resolverCliente(
        devolucion.cliente.id,
        devolucion.cliente.nombre,
      )
      devolucion.detalles.forEach((detalle) => {
        if (
          !detalle.producto ||
          detalle.semana_origen_inicio < semanaDesde ||
          detalle.semana_origen_inicio > semanaHasta
        ) return
        const producto = resolverProducto(
          detalle.producto_id,
          detalle.producto.codigo,
          detalle.producto.corto,
        )
        const movimiento = obtenerMovimiento(cliente, producto)
        const unidades = Number(detalle.unidades ?? 0)
        const precioDocumento =
          detalle.precio_unitario_documento == null
            ? null
            : Number(detalle.precio_unitario_documento)
        const precioConfigurado = precios.get(movimiento.key) ?? null
        movimiento.unidadesDevueltas += unidades
        movimiento.devoluciones +=
          detalle.valor_total_documento == null
            ? unidades * Number(precioDocumento ?? precioConfigurado ?? 0)
            : Number(detalle.valor_total_documento)
      })
    })

    const filas: FilaRentabilidad[] = Array.from(movimientos.values()).map(
      (movimiento) => {
        const costo =
          costosId.get(movimiento.productoId) ??
          costosCodigo.get(normalizar(movimiento.codigo))
        const costoMateriaPrimaUnitario =
          costo?.costo_materia_prima_unidad == null
            ? null
            : Number(costo.costo_materia_prima_unidad)
        const costoEmpaqueUnitario =
          costo?.costo_empaque_unidad == null
            ? null
            : Number(costo.costo_empaque_unidad)
        const costoMaterialesUnitario =
          costo?.costo_materiales_unidad == null
            ? null
            : Number(costo.costo_materiales_unidad)
        const rendimiento = Number(costo?.rendimiento_unidades ?? 0)
        const kgUnitario =
          rendimiento > 0
            ? Number(costo?.batch_calculado_kg ?? 0) / rendimiento
            : 0
        const completo =
          costoMaterialesUnitario !== null &&
          Number(costo?.items_sin_costo ?? 0) === 0
        const ventasNetas =
          movimiento.ventaFacturada -
          movimiento.descuentos -
          movimiento.devoluciones
        return {
          ...movimiento,
          ventasNetas,
          kgEquivalente: movimiento.unidades * kgUnitario,
          costoMateriaPrimaUnitario,
          costoEmpaqueUnitario,
          costoMaterialesUnitario,
          costoMateriales:
            costoMaterialesUnitario === null
              ? null
              : movimiento.unidades * costoMaterialesUnitario,
          manoObraDirecta: 0,
          transporte: 0,
          gastoClienteDirecto: 0,
          gastoGeneralAsignado: 0,
          margenBruto: null,
          margenBrutoPorcentaje: null,
          contribucion: null,
          ebitda: null,
          margenEbitda: null,
          completo,
        }
      },
    )

    let costosSinAsignar = 0
    const valorBase = (fila: FilaRentabilidad, base: BaseDistribucion) => {
      if (base === "UNIDADES") return Math.max(0, fila.unidades)
      if (base === "KG_EQUIVALENTE") return Math.max(0, fila.kgEquivalente)
      return Math.max(0, fila.ventasNetas)
    }
    const asignar = (
      monto: number,
      base: BaseDistribucion,
      campo: CampoAsignado,
      clienteId?: string | null,
      excluirClienteIds?: Set<string>,
    ) => {
      if (!Number.isFinite(monto) || monto === 0) return
      const candidatas = clienteId
        ? filas.filter((fila) => fila.clienteId === clienteId)
        : excluirClienteIds?.size
          ? filas.filter((fila) => !excluirClienteIds.has(fila.clienteId))
          : filas
      let baseAplicada = base
      let totalBase = candidatas.reduce(
        (total, fila) => total + valorBase(fila, baseAplicada),
        0,
      )
      if (totalBase <= 0 && baseAplicada !== "VENTAS_NETAS") {
        baseAplicada = "VENTAS_NETAS"
        totalBase = candidatas.reduce(
          (total, fila) => total + valorBase(fila, baseAplicada),
          0,
        )
      }
      if (totalBase <= 0) {
        costosSinAsignar += monto
        return
      }
      candidatas.forEach((fila) => {
        fila[campo] +=
          (monto * valorBase(fila, baseAplicada)) / totalBase
      })
    }

    const clienteIdsTuti = new Set(
      filas
        .filter((fila) => claveCliente(fila.cliente) === "TUTI")
        .map((fila) => fila.clienteId),
    )
    const periodoDesdeCalculo = modoIntegrado
      ? rangoCostos.periodoDesde
      : `${mes}-01`
    const periodoHastaCalculo = modoIntegrado
      ? rangoCostos.periodoHasta
      : `${mes}-01`

    nomina.forEach((fila) => {
      if (
        fila.periodo < periodoDesdeCalculo ||
        fila.periodo > periodoHastaCalculo
      ) return
      const costo = Number(fila.costo_empresa ?? 0)
      if (fila.area === "MANO_OBRA_DIRECTA") {
        asignar(
          costo,
          baseRegla("PERSONAL_PRODUCCION", "KG_EQUIVALENTE"),
          "manoObraDirecta",
        )
      } else if (fila.area === "DISTRIBUCION") {
        asignar(
          costo,
          baseRegla("TRANSPORTE", "UNIDADES"),
          "transporte",
          null,
          clienteIdsTuti,
        )
      } else {
        asignar(
          costo,
          fila.area === "MANO_OBRA_INDIRECTA"
            ? baseRegla("OPERACION", "KG_EQUIVALENTE")
            : baseRegla("PERSONAL_ESTRUCTURA", "VENTAS_NETAS"),
          "gastoGeneralAsignado",
        )
      }
    })

    const cuentasPersonal = new Set([
      "6.1.01.1.01.01",
      "6.1.01.1.01.04",
      "6.2.01.1.01.05",
      "6.1.01.1.01.06",
      "NOM-MOD",
      "NOM-MOI",
      "NOM-ADM",
      "NOM-VTA",
      "NOM-DIST",
    ])
    const cuentasTransporte = new Set([
      "6.1.01.2.13.01",
      "6.1.01.2.13.02",
    ])
    facturas.forEach((factura) => {
      const periodoFactura = factura.periodo_servicio
        ?? (factura.fecha_emision ? `${factura.fecha_emision.slice(0, 7)}-01` : null)
      if (
        factura.estado === "ANULADA" ||
        !periodoFactura ||
        periodoFactura < periodoDesdeCalculo ||
        periodoFactura > periodoHastaCalculo ||
        !factura.impacta_ebitda ||
        cuentasPersonal.has(factura.cuenta_codigo)
      ) return
      const monto = Number(factura.subtotal ?? 0)
      const clienteIds = factura.afecta_tipo === "CLIENTE"
        ? factura.cliente_ids?.length
          ? factura.cliente_ids
          : factura.cliente_id
            ? [factura.cliente_id]
            : []
        : []
      const esTransporte = cuentasTransporte.has(
        factura.cuenta_codigo,
      )
      const base = esTransporte
        ? baseRegla("TRANSPORTE", "UNIDADES")
        : factura.grupo === "OPERACION"
          ? baseRegla("OPERACION", "KG_EQUIVALENTE")
          : baseRegla("ESTRUCTURA_GENERAL", "VENTAS_NETAS")
      if (clienteIds.length > 0) {
        const montoPorCliente = monto / clienteIds.length
        clienteIds.forEach((clienteId) => asignar(
          montoPorCliente,
          base,
          esTransporte ? "transporte" : "gastoClienteDirecto",
          clienteId,
        ))
      } else {
        asignar(
          monto,
          base,
          esTransporte ? "transporte" : "gastoGeneralAsignado",
        )
      }
    })

    filas.forEach((fila) => {
      if (!fila.completo || fila.costoMateriales === null) return
      fila.margenBruto =
        fila.ventasNetas -
        fila.costoMateriales -
        fila.manoObraDirecta
      fila.margenBrutoPorcentaje =
        fila.ventasNetas > 0
          ? (fila.margenBruto / fila.ventasNetas) * 100
          : 0
      fila.contribucion =
        fila.margenBruto -
        fila.transporte -
        fila.gastoClienteDirecto
      fila.ebitda = fila.contribucion - fila.gastoGeneralAsignado
      fila.margenEbitda =
        fila.ventasNetas > 0
          ? (fila.ebitda / fila.ventasNetas) * 100
          : 0
    })

    return { filas, costosSinAsignar, precios, costosId, costosCodigo }
  }, [
    clientes,
    productos,
    relaciones,
    costos,
    ventas,
    devoluciones,
    facturas,
    nomina,
    promociones,
    reglas,
    mes,
    modoIntegrado,
    rangoDatos.desde,
    rangoDatos.hasta,
    rangoCostos.periodoDesde,
    rangoCostos.periodoHasta,
  ])

  const resumenSku = useMemo(() => {
    const mapa = new Map<string, ResumenSku>()
    calculo.filas.forEach((fila) => {
      const actual = mapa.get(fila.productoId)
      if (actual) {
        actual.unidades += fila.unidades
        actual.unidadesDevueltas += fila.unidadesDevueltas
        actual.ventaFacturada += fila.ventaFacturada
        actual.descuentos += fila.descuentos
        actual.devoluciones += fila.devoluciones
        actual.ventasNetas += fila.ventasNetas
        actual.costoMateriales =
          (actual.costoMateriales ?? 0) +
          Number(fila.costoMateriales ?? 0)
        actual.manoObraDirecta += fila.manoObraDirecta
        actual.margenBruto =
          (actual.margenBruto ?? 0) +
          Number(fila.margenBruto ?? 0)
        actual.completo = actual.completo && fila.completo
      } else {
        mapa.set(fila.productoId, {
          id: fila.productoId,
          codigo: fila.codigo,
          nombre: fila.sku,
          unidades: fila.unidades,
          unidadesDevueltas: fila.unidadesDevueltas,
          ventaFacturada: fila.ventaFacturada,
          descuentos: fila.descuentos,
          devoluciones: fila.devoluciones,
          ventasNetas: fila.ventasNetas,
          costoMateriales: fila.costoMateriales,
          manoObraDirecta: fila.manoObraDirecta,
          margenBruto: fila.margenBruto,
          margenBrutoPorcentaje: null,
          completo: fila.completo,
        })
      }
    })
    return Array.from(mapa.values())
      .map((fila) => ({
        ...fila,
        costoMateriales: fila.completo
          ? fila.costoMateriales
          : null,
        margenBruto: fila.completo ? fila.margenBruto : null,
        margenBrutoPorcentaje:
          fila.completo && fila.ventasNetas > 0
            ? (Number(fila.margenBruto) / fila.ventasNetas) * 100
            : fila.completo
              ? 0
              : null,
      }))
      .sort(
        (a, b) =>
          (b.margenBrutoPorcentaje ?? -Infinity) -
          (a.margenBrutoPorcentaje ?? -Infinity),
      )
  }, [calculo.filas])

  const resumenClientes = useMemo(() => {
    const mapa = new Map<string, ResumenCliente>()
    calculo.filas.forEach((fila) => {
      const gastosCliente =
        fila.transporte +
        fila.gastoClienteDirecto +
        fila.gastoGeneralAsignado
      const actual = mapa.get(fila.clienteId)
      if (actual) {
        actual.unidades += fila.unidades
        actual.ventasNetas += fila.ventasNetas
        actual.transporte += fila.transporte
        actual.gastoClienteDirecto += fila.gastoClienteDirecto
        actual.gastoGeneralAsignado += fila.gastoGeneralAsignado
        actual.gastosCliente += gastosCliente
        actual.ebitda =
          (actual.ebitda ?? 0) + Number(fila.ebitda ?? 0)
        actual.completo = actual.completo && fila.completo
      } else {
        mapa.set(fila.clienteId, {
          id: fila.clienteId,
          nombre: fila.cliente,
          unidades: fila.unidades,
          ventasNetas: fila.ventasNetas,
          transporte: fila.transporte,
          gastoClienteDirecto: fila.gastoClienteDirecto,
          gastoGeneralAsignado: fila.gastoGeneralAsignado,
          gastosCliente,
          gastosPorcentaje: 0,
          ebitda: fila.ebitda,
          margenEbitda: null,
          completo: fila.completo,
        })
      }
    })
    return Array.from(mapa.values())
      .map((fila) => ({
        ...fila,
        ebitda: fila.completo ? fila.ebitda : null,
        gastosPorcentaje:
          fila.ventasNetas > 0
            ? (fila.gastosCliente / fila.ventasNetas) * 100
            : 0,
        margenEbitda:
          fila.completo && fila.ventasNetas > 0
            ? (Number(fila.ebitda) / fila.ventasNetas) * 100
            : fila.completo
              ? 0
              : null,
      }))
      .sort((a, b) => b.ventasNetas - a.ventasNetas)
  }, [calculo.filas])

  const clientesSimulador = useMemo(
    () =>
      clientes.filter((cliente) =>
        relaciones.some(
          (relacion) => relacion.cliente_id === cliente.id,
        ),
      ),
    [clientes, relaciones],
  )

  const productosSimulador = useMemo(() => {
    const ids = new Set(
      relaciones
        .filter(
          (relacion) =>
            relacion.cliente_id === clienteSimulador,
        )
        .map((relacion) => relacion.producto_id),
    )
    return productos.filter((producto) => ids.has(producto.id))
  }, [clienteSimulador, productos, relaciones])

  useEffect(() => {
    if (
      clientesSimulador.length > 0 &&
      !clientesSimulador.some(
        (cliente) => cliente.id === clienteSimulador,
      )
    ) {
      setClienteSimulador(clientesSimulador[0].id)
    }
  }, [clientesSimulador, clienteSimulador])

  useEffect(() => {
    if (
      productosSimulador.length > 0 &&
      !productosSimulador.some(
        (producto) => producto.id === productoSimulador,
      )
    ) {
      setProductoSimulador(productosSimulador[0].id)
    }
  }, [productosSimulador, productoSimulador])

  const filaSimulador = calculo.filas.find(
    (fila) =>
      fila.clienteId === clienteSimulador &&
      fila.productoId === productoSimulador,
  )
  const resumenClienteSimulador = resumenClientes.find(
    (fila) => fila.id === clienteSimulador,
  )
  const costoSimulador =
    calculo.costosId.get(productoSimulador) ??
    calculo.costosCodigo.get(
      normalizar(
        productos.find((item) => item.id === productoSimulador)
          ?.codigo ?? "",
      ),
    )
  const precioConfigurado = calculo.precios.get(
    `${clienteSimulador}|${productoSimulador}`,
  )

  useEffect(() => {
    if (!clienteSimulador || !productoSimulador) return

    let cancelado = false

    async function cargarReferenciaSimulador() {
      const cliente = clientes.find(
        (item) => item.id === clienteSimulador,
      )
      const producto = productos.find(
        (item) => item.id === productoSimulador,
      )

      const precioMaestro = Number(precioConfigurado ?? 0)
      const dias = Math.max(
        1,
        Math.min(365, Math.round(valorPositivo(diasPromocion, 30))),
      )

      if (!cancelado) {
        setPrecioSimulador(
          precioMaestro > 0 ? precioMaestro.toFixed(4) : "",
        )
        setReferenciaSimulador("")
      }

      try {
        const ultimaVentaPeriodoRes = await supabase
          .from("com_ventas_detalle")
          .select("fecha_emision")
          .eq("cliente_id", clienteSimulador)
          .eq("producto_id", productoSimulador)
          .order("fecha_emision", { ascending: false })
          .limit(1)

        if (ultimaVentaPeriodoRes.error) {
          throw ultimaVentaPeriodoRes.error
        }

        const fechaHastaBase =
          ultimaVentaPeriodoRes.data?.[0]?.fecha_emision ?? ""

        if (fechaHastaBase) {
          const fechaDesdeBase = sumarDias(fechaHastaBase, -(dias - 1))
          const ventasBaseDb = await obtenerVentasDiariasRangoDb(
            fechaDesdeBase,
            fechaHastaBase,
          )

          const ventasBase = ventasBaseDb.filter((venta) => {
            const mismoCliente =
              venta.cliente_id === clienteSimulador ||
              (!venta.cliente_id &&
                cliente &&
                claveCliente(venta.cliente_nombre) ===
                  claveCliente(cliente.nombre))

            const mismoProducto =
              venta.producto_id === productoSimulador ||
              (producto &&
                normalizar(venta.sku) ===
                  normalizar(producto.codigo))

            return mismoCliente && mismoProducto
          })

          const unidadesBase = ventasBase.reduce(
            (total, venta) => total + Number(venta.cantidad ?? 0),
            0,
          )

          if (!cancelado) {
            setUnidadesBasePeriodo(unidadesBase)
            setReferenciaVentasSimulador(
              `${fechaDesdeBase.split("-").reverse().slice(0, 2).join("/")}–${fechaHastaBase
                .split("-")
                .reverse()
                .slice(0, 2)
                .join("/")}`,
            )
          }
        } else if (!cancelado) {
          setUnidadesBasePeriodo(0)
          setReferenciaVentasSimulador("sin ventas previas")
        }

        const inicioMesActual = `${fechaIsoLocal().slice(0, 7)}-01`

        const buscarUltimaDevolucion = async (
          soloMesesCerrados: boolean,
        ) => {
          let consulta = supabase
            .from("devolucion_detalles")
            .select(
              "semana_origen_inicio,devoluciones!inner(cliente_id)",
            )
            .eq("producto_id", productoSimulador)
            .eq("devoluciones.cliente_id", clienteSimulador)
            .order("semana_origen_inicio", { ascending: false })
            .limit(1)

          if (soloMesesCerrados) {
            consulta = consulta.lt(
              "semana_origen_inicio",
              inicioMesActual,
            )
          }

          return await consulta
        }

        let ultimaDevolucionRes =
          await buscarUltimaDevolucion(true)

        if (ultimaDevolucionRes.error) {
          throw ultimaDevolucionRes.error
        }

        if (
          !ultimaDevolucionRes.data?.[0]?.semana_origen_inicio
        ) {
          ultimaDevolucionRes =
            await buscarUltimaDevolucion(false)

          if (ultimaDevolucionRes.error) {
            throw ultimaDevolucionRes.error
          }
        }

        const ultimaSemanaOrigen =
          ultimaDevolucionRes.data?.[0]?.semana_origen_inicio ?? ""

        let mesReferencia = ultimaSemanaOrigen
          ? ultimaSemanaOrigen.slice(0, 7)
          : ""

        // Si todavía no existe devolución para ese cliente/SKU,
        // usamos el último mes cerrado con ventas como base de unidades.
        if (!mesReferencia) {
          const ultimoDiaMesCerrado = sumarDias(
            inicioMesActual,
            -1,
          )

          const ultimaVentaRes = await supabase
            .from("com_ventas_detalle")
            .select("fecha_emision")
            .eq("cliente_id", clienteSimulador)
            .eq("producto_id", productoSimulador)
            .lte("fecha_emision", ultimoDiaMesCerrado)
            .order("fecha_emision", { ascending: false })
            .limit(1)

          if (ultimaVentaRes.error) throw ultimaVentaRes.error

          mesReferencia =
            ultimaVentaRes.data?.[0]?.fecha_emision?.slice(0, 7) ??
            ""
        }

        if (!mesReferencia) {
          if (!cancelado) {
            setDevolucionSimulador("0.00")
            setUnidadesSimulador("1000")
            setReferenciaSimulador("sin histórico disponible")
          }
          return
        }

        const rangoReferencia = rangoMes(mesReferencia)

        const [ventasReferenciaDb, devolucionesReferenciaDb] =
          await Promise.all([
            obtenerVentasDiariasRangoDb(
              rangoReferencia.desde,
              rangoReferencia.hasta,
            ),
            obtenerDevolucionesDb(
              rangoReferencia.desde,
              sumarDias(rangoReferencia.hasta, 60),
            ),
          ])

        if (cancelado) return

        const ventasReferencia = ventasReferenciaDb.filter(
          (venta) => {
            const mismoCliente =
              venta.cliente_id === clienteSimulador ||
              (!venta.cliente_id &&
                cliente &&
                claveCliente(venta.cliente_nombre) ===
                  claveCliente(cliente.nombre))

            const mismoProducto =
              venta.producto_id === productoSimulador ||
              (producto &&
                normalizar(venta.sku) ===
                  normalizar(producto.codigo))

            return mismoCliente && mismoProducto
          },
        )

        const unidadesVendidas = ventasReferencia.reduce(
          (total, venta) =>
            total + Number(venta.cantidad ?? 0),
          0,
        )

        const ventaFacturada = ventasReferencia.reduce(
          (total, venta) =>
            total + Number(venta.total_sin_impuestos ?? 0),
          0,
        )

        const unidadesDevueltas = devolucionesReferenciaDb.reduce(
          (total, devolucion) => {
            const mismoCliente =
              devolucion.cliente?.id === clienteSimulador ||
              (devolucion.cliente &&
                cliente &&
                claveCliente(devolucion.cliente.nombre) ===
                  claveCliente(cliente.nombre))

            if (!mismoCliente) return total

            return (
              total +
              (devolucion.detalles ?? []).reduce(
                (suma, detalle) => {
                  const mismoProducto =
                    detalle.producto_id === productoSimulador ||
                    (producto &&
                      detalle.producto &&
                      normalizar(detalle.producto.codigo) ===
                        normalizar(producto.codigo))

                  if (!mismoProducto) return suma

                  if (
                    detalle.semana_origen_inicio <
                      rangoReferencia.desde ||
                    detalle.semana_origen_inicio >
                      rangoReferencia.hasta
                  ) {
                    return suma
                  }

                  return suma + Number(detalle.unidades ?? 0)
                },
                0,
              )
            )
          },
          0,
        )

        const precioReal =
          unidadesVendidas > 0
            ? ventaFacturada / unidadesVendidas
            : 0

        const tasaDevolucion =
          unidadesVendidas > 0
            ? (unidadesDevueltas / unidadesVendidas) * 100
            : 0

        if (precioMaestro <= 0 && precioReal > 0) {
          setPrecioSimulador(precioReal.toFixed(4))
        }

        setDevolucionSimulador(tasaDevolucion.toFixed(2))
        setReferenciaSimulador(nombreMes(mesReferencia))
      } catch {
        if (!cancelado) {
          const precioActual =
            filaSimulador && filaSimulador.unidades > 0
              ? filaSimulador.ventaFacturada /
                filaSimulador.unidades
              : 0

          const tasaDevolucion =
            filaSimulador && filaSimulador.unidades > 0
              ? (filaSimulador.unidadesDevueltas /
                  filaSimulador.unidades) *
                100
              : 0

          if (precioMaestro <= 0) {
            setPrecioSimulador(
              precioActual > 0 ? precioActual.toFixed(4) : "",
            )
          }

          setDevolucionSimulador(tasaDevolucion.toFixed(2))
          setReferenciaSimulador(
            "referencia disponible del período seleccionado",
          )
        }
      }

      if (!cancelado) {
        const tasaDescuento =
          filaSimulador && filaSimulador.ventaFacturada > 0
            ? (filaSimulador.descuentos /
                filaSimulador.ventaFacturada) *
              100
            : 0

        setDescuentoSimulador(tasaDescuento.toFixed(2))
      }
    }

    void cargarReferenciaSimulador()

    return () => {
      cancelado = true
    }
  }, [
    clienteSimulador,
    productoSimulador,
    clientes,
    productos,
    filaSimulador,
    precioConfigurado,
    diasPromocion,
  ])

  useEffect(() => {
    const incrementoEsperado = Math.max(
      0,
      valorPositivo(incrementoVentasSimulador),
    )
    const unidadesObjetivo = Math.ceil(
      unidadesBasePeriodo * (1 + incrementoEsperado / 100),
    )
    setUnidadesSimulador(String(unidadesObjetivo))
  }, [unidadesBasePeriodo, incrementoVentasSimulador])

  const escenario = useMemo(() => {
    const precio = valorPositivo(precioSimulador)
    const unidades = valorPositivo(unidadesSimulador)
    const tasaDevolucion = Math.min(
      100,
      valorPositivo(devolucionSimulador),
    )
    const tasaDescuento = Math.min(
      100,
      valorPositivo(descuentoSimulador),
    )
    const objetivo = Math.min(99.99, valorPositivo(margenObjetivo))
    const unidadesBase = Math.max(0, filaSimulador?.unidades ?? 0)
    const unidadesCliente = Math.max(
      0,
      resumenClienteSimulador?.unidades ?? 0,
    )
    const unidadesEmpresa = calculo.filas.reduce(
      (total, fila) => total + Math.max(0, fila.unidades),
      0,
    )
    const tasaUnitaria = (
      valorFila: number | undefined,
      valorCliente: number,
      valorEmpresa: number,
    ) => {
      if (unidadesBase > 0 && valorFila !== undefined) {
        return valorFila / unidadesBase
      }
      if (unidadesCliente > 0) return valorCliente / unidadesCliente
      return unidadesEmpresa > 0 ? valorEmpresa / unidadesEmpresa : 0
    }
    const filasCliente = calculo.filas.filter(
      (fila) => fila.clienteId === clienteSimulador,
    )
    const totalCliente = (campo: keyof FilaRentabilidad) =>
      filasCliente.reduce(
        (total, fila) => total + Number(fila[campo] ?? 0),
        0,
      )
    const totalEmpresa = (campo: keyof FilaRentabilidad) =>
      calculo.filas.reduce(
        (total, fila) => total + Number(fila[campo] ?? 0),
        0,
      )
    const materialesUnidad = Number(
      costoSimulador?.costo_materiales_unidad ?? 0,
    )
    const modUnidad = tasaUnitaria(
      filaSimulador?.manoObraDirecta,
      totalCliente("manoObraDirecta"),
      totalEmpresa("manoObraDirecta"),
    )
    const transporteUnidad = tasaUnitaria(
      filaSimulador?.transporte,
      totalCliente("transporte"),
      totalEmpresa("transporte"),
    )
    const gastoClienteUnidad = tasaUnitaria(
      filaSimulador?.gastoClienteDirecto,
      totalCliente("gastoClienteDirecto"),
      0,
    )
    const gastoGeneralUnidad = tasaUnitaria(
      filaSimulador?.gastoGeneralAsignado,
      totalCliente("gastoGeneralAsignado"),
      totalEmpresa("gastoGeneralAsignado"),
    )
    const unidadesBasePromocion = Math.max(0, unidadesBasePeriodo)
    const incrementoVentasPorcentaje = Math.max(
      0,
      valorPositivo(incrementoVentasSimulador),
    )

    // Costos históricos del período comparable.
    const materialesBase = materialesUnidad * unidadesBasePromocion
    const modBase = modUnidad * unidadesBasePromocion
    const transporteBase = transporteUnidad * unidadesBasePromocion
    const gastoClienteBase = gastoClienteUnidad * unidadesBasePromocion
    const gastoGeneralBase = gastoGeneralUnidad * unidadesBasePromocion

    const costoTotalBase =
      materialesBase +
      modBase +
      transporteBase +
      gastoClienteBase +
      gastoGeneralBase

    const ventaBrutaBase = precio * unidadesBasePromocion
    const valorDevolucionBase =
      (ventaBrutaBase * tasaDevolucion) / 100
    const ventaNetaBase = ventaBrutaBase - valorDevolucionBase
    const ebitdaBase = ventaNetaBase - costoTotalBase
    const margenEbitdaBase =
      ventaNetaBase > 0 ? (ebitdaBase / ventaNetaBase) * 100 : 0

    // Materiales siempre varían. MOD, transporte y gasto directo se mantienen
    // fijos mientras el usuario no marque que la promoción exige aumentarlos.
    // Los gastos generales permanecen fijos.
    const materialesPromocion = materialesUnidad * unidades
    const modPromocion = manoObraVariable
      ? modUnidad * unidades
      : modBase
    const transportePromocion = transporteVariable
      ? transporteUnidad * unidades
      : transporteBase
    const gastoClientePromocion = gastoClienteVariable
      ? gastoClienteUnidad * unidades
      : gastoClienteBase
    const gastoGeneralPromocion = gastoGeneralBase

    const costoTotal =
      materialesPromocion +
      modPromocion +
      transportePromocion +
      gastoClientePromocion +
      gastoGeneralPromocion

    const costoTotalUnidad =
      unidades > 0 ? costoTotal / unidades : 0

    const modPromocionUnidad =
      unidades > 0 ? modPromocion / unidades : 0
    const transportePromocionUnidad =
      unidades > 0 ? transportePromocion / unidades : 0
    const gastoClientePromocionUnidad =
      unidades > 0 ? gastoClientePromocion / unidades : 0
    const gastoGeneralPromocionUnidad =
      unidades > 0 ? gastoGeneralPromocion / unidades : 0

    const ventaBruta = precio * unidades
    const valorDescuento = (ventaBruta * tasaDescuento) / 100
    const valorDevolucion = (ventaBruta * tasaDevolucion) / 100
    const ventaNeta =
      ventaBruta - valorDescuento - valorDevolucion

    const margenBruto =
      ventaNeta - materialesPromocion - modPromocion
    const ebitda = ventaNeta - costoTotal
    const margenBrutoPorcentaje =
      ventaNeta > 0 ? (margenBruto / ventaNeta) * 100 : 0
    const margenEbitdaPorcentaje =
      ventaNeta > 0 ? (ebitda / ventaNeta) * 100 : 0

    const ventaNetaMinima =
      objetivo < 100 ? costoTotal / (1 - objetivo / 100) : Infinity
    const descuentoMaximoSinLimite =
      ventaBruta > 0
        ? ((ventaBruta - valorDevolucion - ventaNetaMinima) /
            ventaBruta) *
          100
        : 0
    const descuentoMaximo = Math.max(
      0,
      Math.min(100 - tasaDevolucion, descuentoMaximoSinLimite),
    )

    const ingresoNetoUnitarioPromocion =
      precio *
      (1 - tasaDescuento / 100 - tasaDevolucion / 100)

    const costoVariableUnitarioPromocion =
      materialesUnidad +
      (manoObraVariable ? modUnidad : 0) +
      (transporteVariable ? transporteUnidad : 0) +
      (gastoClienteVariable ? gastoClienteUnidad : 0)

    const costosFijosPromocion =
      (manoObraVariable ? 0 : modBase) +
      (transporteVariable ? 0 : transporteBase) +
      (gastoClienteVariable ? 0 : gastoClienteBase) +
      gastoGeneralBase

    const contribucionUnitariaPromocion =
      ingresoNetoUnitarioPromocion -
      costoVariableUnitarioPromocion

    const unidadesEquilibrio =
      unidadesBasePromocion > 0 &&
      contribucionUnitariaPromocion > 0
        ? Math.max(
            0,
            (ebitdaBase + costosFijosPromocion) /
              contribucionUnitariaPromocion,
          )
        : null

    const incrementoMinimoPorcentaje =
      unidadesEquilibrio != null && unidadesBasePromocion > 0
        ? ((unidadesEquilibrio / unidadesBasePromocion) - 1) * 100
        : null

    const ebitdaIncremental = ebitda - ebitdaBase
    const ebitdaIncrementalPorcentaje =
      Math.abs(ebitdaBase) > 0.0001
        ? (ebitdaIncremental / Math.abs(ebitdaBase)) * 100
        : null

    const unidadesAdicionales = unidades - unidadesBasePromocion
    const ventaExtraBruta = unidadesAdicionales * precio
    const devolucionExtra =
      (ventaExtraBruta * tasaDevolucion) / 100

    const materialesIncrementales =
      Math.max(0, unidadesAdicionales) * materialesUnidad
    const modIncremental =
      manoObraVariable
        ? Math.max(0, modPromocion - modBase)
        : 0
    const transporteIncremental =
      transporteVariable
        ? Math.max(0, transportePromocion - transporteBase)
        : 0
    const gastoClienteIncremental =
      gastoClienteVariable
        ? Math.max(0, gastoClientePromocion - gastoClienteBase)
        : 0

    const costoUnidadesExtra =
      materialesIncrementales +
      modIncremental +
      transporteIncremental +
      gastoClienteIncremental

    return {
      precio,
      unidadesBasePromocion,
      unidades,
      incrementoVentasPorcentaje,
      tasaDevolucion,
      tasaDescuento,
      objetivo,
      ventaBrutaBase,
      valorDevolucionBase,
      ventaNetaBase,
      costoTotalBase,
      ebitdaBase,
      margenEbitdaBase,
      materialesUnidad,
      modUnidad,
      transporteUnidad,
      gastoClienteUnidad,
      gastoGeneralUnidad,
      modPromocionUnidad,
      transportePromocionUnidad,
      gastoClientePromocionUnidad,
      gastoGeneralPromocionUnidad,
      materialesBase,
      modBase,
      transporteBase,
      gastoClienteBase,
      gastoGeneralBase,
      materialesPromocion,
      modPromocion,
      transportePromocion,
      gastoClientePromocion,
      gastoGeneralPromocion,
      materialesIncrementales,
      modIncremental,
      transporteIncremental,
      gastoClienteIncremental,
      costoTotalUnidad,
      ventaBruta,
      valorDescuento,
      valorDevolucion,
      ventaNeta,
      costoTotal,
      margenBruto,
      margenBrutoPorcentaje,
      ebitda,
      margenEbitdaPorcentaje,
      descuentoMaximo,
      unidadesEquilibrio,
      incrementoMinimoPorcentaje,
      ebitdaIncremental,
      ebitdaIncrementalPorcentaje,
      unidadesAdicionales,
      ventaExtraBruta,
      devolucionExtra,
      costoUnidadesExtra,
      viable: descuentoMaximoSinLimite >= 0,
      dentroDelLimite:
        tasaDescuento <= descuentoMaximo + 0.0001,
      costoCompleto:
        costoSimulador != null &&
        Number(costoSimulador.items_sin_costo ?? 0) === 0,
    }
  }, [
    precioSimulador,
    unidadesSimulador,
    devolucionSimulador,
    descuentoSimulador,
    incrementoVentasSimulador,
    manoObraVariable,
    transporteVariable,
    gastoClienteVariable,
    margenObjetivo,
    unidadesBasePeriodo,
    filaSimulador,
    resumenClienteSimulador,
    calculo.filas,
    clienteSimulador,
    costoSimulador,
  ])

  const totales = useMemo(() => {
    const completas = calculo.filas.filter((fila) => fila.completo)
    const ventasNetas = completas.reduce(
      (total, fila) => total + fila.ventasNetas,
      0,
    )
    const margenBruto = completas.reduce(
      (total, fila) => total + Number(fila.margenBruto ?? 0),
      0,
    )
    const ebitda = completas.reduce(
      (total, fila) => total + Number(fila.ebitda ?? 0),
      0,
    )
    return {
      ventasNetas,
      margenBruto,
      ebitda,
      margenBrutoPorcentaje:
        ventasNetas > 0 ? (margenBruto / ventasNetas) * 100 : 0,
      margenEbitda:
        ventasNetas > 0 ? (ebitda / ventasNetas) * 100 : 0,
      pendientes: calculo.filas.filter((fila) => !fila.completo).length,
    }
  }, [calculo.filas])

  const escenarioRecomendado = useMemo(() => {
    const cumplen = escenarios.filter((item) => item.cumple)
    const candidatas = cumplen.length > 0 ? cumplen : escenarios
    return [...candidatas].sort(
      (a, b) =>
        b.ebitdaIncremental - a.ebitdaIncremental ||
        b.ebitda - a.ebitda,
    )[0] ?? null
  }, [escenarios])

  function cargarEscenario() {
    const cliente = clientes.find(
      (item) => item.id === clienteSimulador,
    )
    const producto = productos.find(
      (item) => item.id === productoSimulador,
    )
    if (!cliente || !producto || escenario.precio <= 0 || escenario.unidades <= 0) {
      setMensajeComparacion(
        "Selecciona cliente y SKU, y verifica el precio y el período de la promoción.",
      )
      return
    }
    if (!escenario.costoCompleto) {
      setMensajeComparacion(
        "No se puede cargar este escenario hasta completar el costo del SKU.",
      )
      return
    }

    const etiqueta = `E${numeroEscenarioRef.current}`
    numeroEscenarioRef.current += 1
    setEscenarios((actuales) => [
      ...actuales,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        etiqueta,
        periodo: mes,
        cliente: cliente.nombre,
        sku: producto.corto || producto.nombre,
        codigo: producto.codigo,
        diasPromocion: Math.max(1, Math.round(valorPositivo(diasPromocion, 30))),
        precio: escenario.precio,
        unidadesBase: escenario.unidadesBasePromocion,
        unidades: escenario.unidades,
        incrementoVentasPorcentaje: escenario.incrementoVentasPorcentaje,
        incrementoMinimoPorcentaje: escenario.incrementoMinimoPorcentaje,
        unidadesEquilibrio: escenario.unidadesEquilibrio,
        devolucionPorcentaje: escenario.tasaDevolucion,
        descuentoPorcentaje: escenario.tasaDescuento,
        descuentoMaximo: escenario.descuentoMaximo,
        objetivo: escenario.objetivo,
        ventaNeta: escenario.ventaNeta,
        margenBrutoPorcentaje: escenario.margenBrutoPorcentaje,
        ebitdaBase: escenario.ebitdaBase,
        ebitda: escenario.ebitda,
        ebitdaIncremental: escenario.ebitdaIncremental,
        ebitdaIncrementalPorcentaje: escenario.ebitdaIncrementalPorcentaje,
        margenEbitdaPorcentaje: escenario.margenEbitdaPorcentaje,
        cumple:
          escenario.viable &&
          escenario.dentroDelLimite &&
          escenario.margenEbitdaPorcentaje >= escenario.objetivo - 0.001,
      },
    ])
    setMensajeComparacion(`${etiqueta} cargado correctamente.`)
  }

  function eliminarEscenario(id: string) {
    setEscenarios((actuales) =>
      actuales.filter((item) => item.id !== id),
    )
    setMensajeComparacion("")
  }

  return (
    <main className={`profit-sim-page ${modoIntegrado ? "embedded" : ""}`}>
      <style>{css}</style>

      {modoIntegrado ? (
        <div className="profit-sim-embedded-bar">
          <div>
            <span>BASE DE COSTOS DEL SIMULADOR</span>
            <small>
              {referenciaCostosTexto}. Materiales y empaque usan el costo actual
              de la fórmula.
            </small>
          </div>
          <strong className="cost-reference-badge">
            {rangoCostos.desde.slice(0, 4)}
          </strong>
        </div>
      ) : (
        <header className="profit-sim-header">
          <div>
            <span>RENTABILIDAD Y DECISIONES COMERCIALES</span>
            <h1>Simulador de descuentos</h1>
            <p>
              Margen bruto por SKU, gastos por cliente y descuento máximo
              para conservar la rentabilidad objetivo.
            </p>
          </div>
          <label>
            <small>Mes analizado</small>
            <input
              type="month"
              value={mes}
              onChange={(evento) => setMes(evento.target.value)}
              disabled={cargando}
            />
          </label>
        </header>
      )}

      {error && <div className="profit-sim-error">{error}</div>}
      {advertencias.length > 0 && (
        <div className="profit-sim-warning">
          Faltan datos de {advertencias.join(", ")}; los resultados que
          dependen de ellos pueden quedar incompletos.
        </div>
      )}

      {!modoIntegrado && (
        <>
          <section className="profit-sim-kpis">
            <article>
              <span>Ventas netas</span>
              <strong>{cargando ? "…" : dinero(totales.ventasNetas)}</strong>
              <small>facturación − descuentos − devoluciones</small>
            </article>
            <article>
              <span>Margen bruto</span>
              <strong>
                {cargando ? "…" : porcentaje(totales.margenBrutoPorcentaje)}
              </strong>
              <small>después de materiales y mano de obra directa</small>
            </article>
            <article>
              <span>Margen EBITDA estimado</span>
              <strong>
                {cargando ? "…" : porcentaje(totales.margenEbitda)}
              </strong>
              <small>después de transporte y demás gastos</small>
            </article>
            <article>
              <span>Costos sin asignar</span>
              <strong>
                {cargando ? "…" : dinero(calculo.costosSinAsignar)}
              </strong>
              <small>{totales.pendientes} SKU con costo incompleto</small>
            </article>
          </section>

          <nav className="profit-sim-tabs">
            <button
              type="button"
              className={vista === "SKU" ? "active" : ""}
              onClick={() => setVista("SKU")}
            >
              Margen por SKU
            </button>
            <button
              type="button"
              className={vista === "CLIENTE" ? "active" : ""}
              onClick={() => setVista("CLIENTE")}
            >
              Gastos por cliente
            </button>
            <button
              type="button"
              className={vista === "SIMULADOR" ? "active" : ""}
              onClick={() => setVista("SIMULADOR")}
            >
              Simular descuento
            </button>
          </nav>
        </>
      )}

      {cargando ? (
        <section className="profit-sim-empty">Calculando rentabilidad…</section>
      ) : vistaActiva === "SKU" ? (
        <section className="profit-sim-panel">
          <header>
            <div>
              <h2>Margen bruto real por SKU</h2>
              <p>
                Incluye descuentos promocionales, devoluciones, materia
                prima, empaques y mano de obra directa.
              </p>
            </div>
          </header>
          <TablaSku filas={resumenSku} />
        </section>
      ) : vistaActiva === "CLIENTE" ? (
        <section className="profit-sim-panel">
          <header>
            <div>
              <h2>Gastos y rentabilidad por cliente</h2>
              <p>
                Separa transporte, gastos directos del cliente y gastos
                compartidos distribuidos con las reglas vigentes.
              </p>
            </div>
          </header>
          <TablaClientes filas={resumenClientes} />
        </section>
      ) : (
        <section className="profit-sim-panel simulator-panel">
          <header>
            <div>
              <h2>Escenario de descuento</h2>
              <p>
                El cálculo no modifica precios, promociones ni información
                real del sistema.
              </p>
            </div>
          </header>

          <div className="simulator-layout">
            <section className="simulator-inputs">
              <h3>Datos del escenario</h3>
              <div className="simulator-fields">
                <label>
                  <span>Cliente</span>
                  <select
                    value={clienteSimulador}
                    onChange={(evento) =>
                      setClienteSimulador(evento.target.value)
                    }
                  >
                    {clientesSimulador.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>SKU</span>
                  <select
                    value={productoSimulador}
                    onChange={(evento) =>
                      setProductoSimulador(evento.target.value)
                    }
                  >
                    {productosSimulador.map((producto) => (
                      <option key={producto.id} value={producto.id}>
                        {producto.corto} · {producto.codigo}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Precio unitario · cliente / SKU</span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={precioSimulador}
                    onChange={(evento) =>
                      setPrecioSimulador(evento.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Duración de la promoción</span>
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      step="1"
                      value={diasPromocion}
                      onChange={(evento) =>
                        setDiasPromocion(evento.target.value)
                      }
                    />
                    <b>días</b>
                  </div>
                </label>

                <label>
                  <span>Unidades objetivo mínimo</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={unidadesSimulador}
                    readOnly
                  />
                  <small className="simulator-reference">
                    Base período anterior: {Math.round(unidadesBasePeriodo).toLocaleString("es-EC")}
                    {referenciaVentasSimulador
                      ? ` Unid. · ${referenciaVentasSimulador}`
                      : " Unid."}
                    {" "}+ {Number(incrementoVentasSimulador || 0).toFixed(1)}%
                  </small>
                </label>
                <label>
                  <span>
                    Devolución histórica
                    {referenciaSimulador
                      ? ` · ${referenciaSimulador}`
                      : ""}
                  </span>
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={devolucionSimulador}
                      onChange={(evento) =>
                        setDevolucionSimulador(evento.target.value)
                      }
                    />
                    <b>%</b>
                  </div>
                </label>
                <label>
                  <span>Descuento propuesto total</span>
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={descuentoSimulador}
                      onChange={(evento) => {
                        setDescuentoSimulador(evento.target.value)
                        setIncrementoVentasSimulador(evento.target.value)
                      }}
                    />
                    <b>%</b>
                  </div>
                  <small className="simulator-reference">
                    Al cambiar el descuento, el incremento esperado parte del
                    mismo porcentaje; puedes ajustarlo después.
                  </small>
                </label>
                <label>
                  <span>Incremento esperado de unidades</span>
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={incrementoVentasSimulador}
                      onChange={(evento) =>
                        setIncrementoVentasSimulador(evento.target.value)
                      }
                    />
                    <b>%</b>
                  </div>
                  <small className="simulator-reference">
                    Tu hipótesis comercial de crecimiento durante la promoción.
                  </small>
                </label>
                <label>
                  <span>Margen EBITDA objetivo</span>
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      step="0.5"
                      value={margenObjetivo}
                      onChange={(evento) =>
                        setMargenObjetivo(evento.target.value)
                      }
                    />
                    <b>%</b>
                  </div>
                </label>
              </div>

              <div className="cost-behavior-panel">
                <div className="cost-behavior-intro">
                  <span>COMPORTAMIENTO DE COSTOS AL AUMENTAR VOLUMEN</span>
                  <strong>
                    Marca solo cuando la promoción obligue a aumentar ese costo.
                  </strong>
                  <small>
                    Materiales y empaque siempre crecen. Gastos generales se
                    mantienen fijos en esta simulación.
                  </small>
                </div>

                <label className="cost-check">
                  <input
                    type="checkbox"
                    checked={manoObraVariable}
                    onChange={(evento) =>
                      setManoObraVariable(evento.target.checked)
                    }
                  />
                  <span>
                    <b>La mano de obra aumenta</b>
                    <small>
                      Marca si necesitas horas extra, más personal o un turno adicional.
                    </small>
                  </span>
                </label>

                <label className="cost-check">
                  <input
                    type="checkbox"
                    checked={transporteVariable}
                    onChange={(evento) =>
                      setTransporteVariable(evento.target.checked)
                    }
                  />
                  <span>
                    <b>El transporte aumenta</b>
                    <small>
                      Déjalo sin marcar mientras el costo del viaje o ruta sea el mismo.
                    </small>
                  </span>
                </label>

                <label className="cost-check">
                  <input
                    type="checkbox"
                    checked={gastoClienteVariable}
                    onChange={(evento) =>
                      setGastoClienteVariable(evento.target.checked)
                    }
                  />
                  <span>
                    <b>El gasto directo del cliente aumenta</b>
                    <small>
                      Déjalo sin marcar para mercaderistas u otros gastos fijos.
                    </small>
                  </span>
                </label>
              </div>

              <div className="load-scenario-actions">
                <button type="button" onClick={cargarEscenario}>
                  Cargar escenario
                </button>
                {mensajeComparacion && <small>{mensajeComparacion}</small>}
              </div>
            </section>

            <section className="simulator-result">
              <span>DESCUENTO MÁXIMO RECOMENDADO</span>
              <strong className={escenario.viable ? "good" : "bad"}>
                {escenario.costoCompleto
                  ? porcentaje(escenario.descuentoMaximo)
                  : "—"}
              </strong>
              <p>
                Para conservar un margen EBITDA de al menos{" "}
                {escenario.objetivo.toFixed(1)}%, considerando una devolución
                de {escenario.tasaDevolucion.toFixed(1)}%.
              </p>
              {!escenario.costoCompleto ? (
                <div className="decision bad">
                  Completa primero los costos de este SKU.
                </div>
              ) : escenario.dentroDelLimite && escenario.viable ? (
                <div className="decision good">
                  El descuento propuesto está dentro del límite.
                </div>
              ) : (
                <div className="decision bad">
                  El descuento propuesto reduce el margen por debajo del
                  objetivo.
                </div>
              )}
            </section>
          </div>

          <section className="scenario-kpis">
            <article>
              <span>Venta bruta</span>
              <strong>{dinero(escenario.ventaBruta)}</strong>
              <small>{numero(escenario.unidades)} unidades</small>
            </article>
            <article>
              <span>Descuento</span>
              <strong>{dinero(escenario.valorDescuento)}</strong>
              <small>{escenario.tasaDescuento.toFixed(1)}%</small>
            </article>
            <article>
              <span>Devoluciones</span>
              <strong>{dinero(escenario.valorDevolucion)}</strong>
              <small>{escenario.tasaDevolucion.toFixed(1)}%</small>
            </article>
            <article>
              <span>Venta neta</span>
              <strong>{dinero(escenario.ventaNeta)}</strong>
              <small>después de descuentos y devoluciones</small>
            </article>
            <article>
              <span>Margen bruto</span>
              <strong>{porcentaje(escenario.margenBrutoPorcentaje)}</strong>
              <small>{dinero(escenario.margenBruto)}</small>
            </article>
            <article>
              <span>Margen EBITDA</span>
              <strong>{porcentaje(escenario.margenEbitdaPorcentaje)}</strong>
              <small>{dinero(escenario.ebitda)}</small>
            </article>
          </section>

          <section className="promotion-economics">
            <header>
              <div>
                <span>RESULTADO ECONÓMICO DE LA PROMOCIÓN</span>
                <h3>¿La promoción deja más EBITDA que vender sin descuento?</h3>
                <p>
                  Compara el mismo período de {Math.max(1, Math.round(valorPositivo(diasPromocion, 30)))} días.
                  Los costos fijos se mantienen constantes salvo que marques que aumentan.
                </p>
              </div>
              <div
                className={`economic-verdict ${
                  escenario.ebitdaIncremental >= 0 ? "positive" : "negative"
                }`}
              >
                <small>RESULTADO INCREMENTAL</small>
                <strong>
                  {escenario.ebitdaIncremental >= 0 ? "+" : ""}
                  {dinero(escenario.ebitdaIncremental)}
                </strong>
                <span>
                  {escenario.ebitdaIncrementalPorcentaje == null
                    ? "Sin base comparable"
                    : `${escenario.ebitdaIncrementalPorcentaje >= 0 ? "+" : ""}${escenario.ebitdaIncrementalPorcentaje.toFixed(1)}% vs. EBITDA sin promoción`}
                </span>
              </div>
            </header>

            <div className="economic-compare-grid">
              <article className="economic-column baseline">
                <span>SIN PROMOCIÓN</span>
                <strong>{dinero(escenario.ebitdaBase)}</strong>
                <small>EBITDA estimado</small>
                <dl>
                  <div><dt>Unidades</dt><dd>{numero(escenario.unidadesBasePromocion)}</dd></div>
                  <div><dt>Venta bruta</dt><dd>{dinero(escenario.ventaBrutaBase)}</dd></div>
                  <div><dt>Descuento</dt><dd>{dinero(0)}</dd></div>
                  <div><dt>Devoluciones</dt><dd>{dinero(escenario.valorDevolucionBase)}</dd></div>
                  <div><dt>Venta neta</dt><dd>{dinero(escenario.ventaNetaBase)}</dd></div>
                  <div><dt>Costos</dt><dd>{dinero(escenario.costoTotalBase)}</dd></div>
                  <div><dt>Margen EBITDA</dt><dd>{porcentaje(escenario.margenEbitdaBase)}</dd></div>
                </dl>
              </article>

              <article className="economic-column promotion">
                <span>CON PROMOCIÓN</span>
                <strong>{dinero(escenario.ebitda)}</strong>
                <small>EBITDA estimado</small>
                <dl>
                  <div><dt>Unidades</dt><dd>{numero(escenario.unidades)}</dd></div>
                  <div><dt>Venta bruta</dt><dd>{dinero(escenario.ventaBruta)}</dd></div>
                  <div><dt>Descuento</dt><dd>-{dinero(escenario.valorDescuento)}</dd></div>
                  <div><dt>Devoluciones</dt><dd>{dinero(escenario.valorDevolucion)}</dd></div>
                  <div><dt>Venta neta</dt><dd>{dinero(escenario.ventaNeta)}</dd></div>
                  <div><dt>Costos</dt><dd>{dinero(escenario.costoTotal)}</dd></div>
                  <div><dt>Margen EBITDA</dt><dd>{porcentaje(escenario.margenEbitdaPorcentaje)}</dd></div>
                </dl>
              </article>

              <article className="break-even-card">
                <span>PUNTO DE EQUILIBRIO DE LA PROMOCIÓN</span>
                {escenario.incrementoMinimoPorcentaje == null ? (
                  <>
                    <strong>No alcanzable</strong>
                    <p>
                      Con este descuento, devolución y costo unitario, cada unidad
                      promocional no genera contribución suficiente para igualar el
                      EBITDA de vender sin promoción.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>
                      {Math.max(0, escenario.incrementoMinimoPorcentaje).toFixed(1)}%
                    </strong>
                    <p>
                      Incremento mínimo de unidades necesario para igualar el EBITDA
                      sin promoción.
                    </p>
                    <div className="break-even-units">
                      <span>Necesitas</span>
                      <b>{numero(Math.ceil(escenario.unidadesEquilibrio ?? 0))} Unid.</b>
                    </div>
                    <div className="break-even-units">
                      <span>Tu escenario</span>
                      <b>{numero(escenario.unidades)} Unid. · +{escenario.incrementoVentasPorcentaje.toFixed(1)}%</b>
                    </div>
                    <div className={`decision ${
                      escenario.ebitdaIncremental >= 0 ? "good" : "bad"
                    }`}>
                      {escenario.ebitdaIncremental >= 0
                        ? "El incremento esperado cubre el costo económico de la promoción."
                        : `Faltan ${numero(Math.max(0, Math.ceil((escenario.unidadesEquilibrio ?? 0) - escenario.unidades)))} unidades para igualar el EBITDA sin promoción.`}
                    </div>
                  </>
                )}
              </article>
            </div>

            <div className="incremental-bridge">
              <h4>De dónde sale la ganancia o pérdida incremental</h4>
              <div><span>Venta bruta de unidades adicionales</span><strong className={escenario.ventaExtraBruta >= 0 ? "positive" : "negative"}>{escenario.ventaExtraBruta >= 0 ? "+" : ""}{dinero(escenario.ventaExtraBruta)}</strong></div>
              <div><span>Devoluciones sobre unidades adicionales</span><strong className="negative">-{dinero(Math.max(0, escenario.devolucionExtra))}</strong></div>
              <div><span>Materiales y empaque adicionales</span><strong className="negative">-{dinero(escenario.materialesIncrementales)}</strong></div>
              {manoObraVariable && (
                <div><span>Mano de obra adicional</span><strong className="negative">-{dinero(escenario.modIncremental)}</strong></div>
              )}
              {transporteVariable && (
                <div><span>Transporte adicional</span><strong className="negative">-{dinero(escenario.transporteIncremental)}</strong></div>
              )}
              {gastoClienteVariable && (
                <div><span>Gasto directo adicional</span><strong className="negative">-{dinero(escenario.gastoClienteIncremental)}</strong></div>
              )}
              <div><span>Costo total del descuento</span><strong className="negative">-{dinero(escenario.valorDescuento)}</strong></div>
              <div className="bridge-total"><span>EBITDA incremental</span><strong className={escenario.ebitdaIncremental >= 0 ? "positive" : "negative"}>{escenario.ebitdaIncremental >= 0 ? "+" : ""}{dinero(escenario.ebitdaIncremental)}</strong></div>
            </div>
          </section>

          <section className="unit-costs">
            <h3>Costo efectivo por unidad durante la promoción</h3>
            <div>
              <CostoUnidad
                etiqueta="Materiales y empaque"
                valor={escenario.materialesUnidad}
                detalle="Costo actual de fórmula"
              />
              <CostoUnidad
                etiqueta="Mano de obra directa"
                valor={escenario.modPromocionUnidad}
                detalle={
                  manoObraVariable
                    ? `Variable con volumen · base ${dinero(escenario.modUnidad)}/Unid.`
                    : `Fija dentro de capacidad · base ${dinero(escenario.modUnidad)}/Unid.`
                }
              />
              <CostoUnidad
                etiqueta="Transporte"
                valor={escenario.transportePromocionUnidad}
                detalle={
                  transporteVariable
                    ? `Variable con volumen · base ${dinero(escenario.transporteUnidad)}/Unid.`
                    : `Fijo en la ruta actual · base ${dinero(escenario.transporteUnidad)}/Unid.`
                }
              />
              <CostoUnidad
                etiqueta="Gasto directo del cliente"
                valor={escenario.gastoClientePromocionUnidad}
                detalle={
                  gastoClienteVariable
                    ? `Variable con volumen · base ${dinero(escenario.gastoClienteUnidad)}/Unid.`
                    : `Fijo (ej. mercaderistas) · base ${dinero(escenario.gastoClienteUnidad)}/Unid.`
                }
              />
              <CostoUnidad
                etiqueta="Gastos generales asignados"
                valor={escenario.gastoGeneralPromocionUnidad}
                detalle={`Fijos · ${referenciaCostosTexto}`}
              />
              <CostoUnidad
                etiqueta="Costo total unitario"
                valor={escenario.costoTotalUnidad}
                detalle="Incluye absorción de costos fijos"
                total
              />
            </div>
          </section>

          {escenarios.length > 0 && (
            <section className="scenario-comparison">
              <header>
                <div>
                  <span>COMPARACIÓN DE PROPUESTAS</span>
                  <h3>Escenarios cargados</h3>
                  <p>
                    Se destaca el escenario que genera mayor EBITDA incremental frente a vender sin promoción.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEscenarios([])
                    setMensajeComparacion("")
                  }}
                >
                  Limpiar escenarios
                </button>
              </header>
              <TablaEscenarios
                escenarios={escenarios}
                recomendadoId={escenarioRecomendado?.id ?? null}
                onEliminar={eliminarEscenario}
              />
              <div className="comparison-chart-section">
                <h3>Ganancia o pérdida incremental por escenario</h3>
                <p className="comparison-chart-description">
                  Cada barra muestra cuánto EBITDA adicional genera —o destruye— la promoción frente a vender sin descuento.
                </p>
                <GraficoEbitdaEscenarios
                  escenarios={escenarios}
                  recomendadoId={escenarioRecomendado?.id ?? null}
                />
              </div>
            </section>
          )}
        </section>
      )}

      <footer className="profit-sim-footnote">
        Herramienta gerencial. El margen bruto resta materiales, empaques y
        mano de obra directa. El margen EBITDA añade transporte, gastos
        específicos del cliente y gastos generales distribuidos.
      </footer>
    </main>
  )
}

function TablaSku({ filas }: { filas: ResumenSku[] }) {
  if (filas.length === 0) {
    return <div className="profit-sim-empty">No existen ventas en este mes.</div>
  }
  return (
    <div className="profit-table-wrap">
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Unidades</th>
            <th>Ventas brutas</th>
            <th>Descuentos</th>
            <th>Devoluciones</th>
            <th>Ventas netas</th>
            <th>Costo producto</th>
            <th>Margen bruto</th>
            <th>Margen %</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.id}>
              <td data-label="SKU">
                <strong>{fila.nombre}</strong>
                <small>{fila.codigo}</small>
              </td>
              <td data-label="Unidades">{numero(fila.unidades)}</td>
              <td data-label="Ventas brutas">{dinero(fila.ventaFacturada)}</td>
              <td data-label="Descuentos">{dinero(fila.descuentos)}</td>
              <td data-label="Devoluciones">
                {dinero(fila.devoluciones)}
                <small>
                  {fila.unidades > 0
                    ? `${((fila.unidadesDevueltas / fila.unidades) * 100).toFixed(1)}%`
                    : "0%"}
                </small>
              </td>
              <td data-label="Ventas netas">{dinero(fila.ventasNetas)}</td>
              <td data-label="Costo producto">
                {fila.costoMateriales === null
                  ? "—"
                  : dinero(fila.costoMateriales + fila.manoObraDirecta)}
              </td>
              <td data-label="Margen bruto">
                {fila.margenBruto === null ? "—" : dinero(fila.margenBruto)}
              </td>
              <td data-label="Margen %">
                <strong
                  className={
                    Number(fila.margenBrutoPorcentaje ?? -1) >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  {porcentaje(fila.margenBrutoPorcentaje)}
                </strong>
                {!fila.completo && <small>Costo incompleto</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaClientes({ filas }: { filas: ResumenCliente[] }) {
  if (filas.length === 0) {
    return <div className="profit-sim-empty">No existen ventas en este mes.</div>
  }
  return (
    <div className="profit-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Ventas netas</th>
            <th>Transporte</th>
            <th>Gastos directos</th>
            <th>Gastos compartidos</th>
            <th>Gasto total</th>
            <th>Gasto / ventas</th>
            <th>EBITDA estimado</th>
            <th>Margen EBITDA</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.id}>
              <td data-label="Cliente">
                <strong>{fila.nombre}</strong>
                <small>{numero(fila.unidades)} unidades</small>
              </td>
              <td data-label="Ventas netas">{dinero(fila.ventasNetas)}</td>
              <td data-label="Transporte">{dinero(fila.transporte)}</td>
              <td data-label="Gastos directos">
                {dinero(fila.gastoClienteDirecto)}
              </td>
              <td data-label="Gastos compartidos">
                {dinero(fila.gastoGeneralAsignado)}
              </td>
              <td data-label="Gasto total">{dinero(fila.gastosCliente)}</td>
              <td data-label="Gasto / ventas">
                {porcentaje(fila.gastosPorcentaje)}
              </td>
              <td data-label="EBITDA estimado">
                {fila.ebitda === null ? "—" : dinero(fila.ebitda)}
              </td>
              <td data-label="Margen EBITDA">
                <strong
                  className={
                    Number(fila.margenEbitda ?? -1) >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  {porcentaje(fila.margenEbitda)}
                </strong>
                {!fila.completo && <small>Costo incompleto</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaEscenarios({
  escenarios,
  recomendadoId,
  onEliminar,
}: {
  escenarios: EscenarioComparacion[]
  recomendadoId: string | null
  onEliminar: (id: string) => void
}) {
  return (
    <div className="profit-table-wrap scenario-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Escenario</th>
            <th>Cliente</th>
            <th>SKU</th>
            <th>Días</th>
            <th>Base</th>
            <th>Promo</th>
            <th>Incremento esperado</th>
            <th>Incremento mínimo</th>
            <th>Descuento</th>
            <th>EBITDA sin promo</th>
            <th>EBITDA con promo</th>
            <th>Δ EBITDA</th>
            <th>Resultado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {escenarios.map((item) => (
            <tr
              key={item.id}
              className={item.id === recomendadoId ? "recommended-row" : ""}
            >
              <td data-label="Escenario">
                <strong>{item.etiqueta}</strong>
              </td>
              <td data-label="Cliente">{item.cliente}</td>
              <td data-label="SKU">
                <strong>{item.sku}</strong>
                <small>{item.codigo}</small>
              </td>
              <td data-label="Días">{numero(item.diasPromocion)}</td>
              <td data-label="Base">{numero(item.unidadesBase)}</td>
              <td data-label="Promo">{numero(item.unidades)}</td>
              <td data-label="Incremento esperado">
                +{item.incrementoVentasPorcentaje.toFixed(1)}%
              </td>
              <td data-label="Incremento mínimo">
                {item.incrementoMinimoPorcentaje == null
                  ? "No alcanzable"
                  : `${Math.max(0, item.incrementoMinimoPorcentaje).toFixed(1)}%`}
              </td>
              <td data-label="Descuento">
                {porcentaje(item.descuentoPorcentaje)}
              </td>
              <td data-label="EBITDA sin promo">{dinero(item.ebitdaBase)}</td>
              <td data-label="EBITDA con promo">{dinero(item.ebitda)}</td>
              <td data-label="Δ EBITDA">
                <strong className={item.ebitdaIncremental >= 0 ? "positive" : "negative"}>
                  {item.ebitdaIncremental >= 0 ? "+" : ""}
                  {dinero(item.ebitdaIncremental)}
                </strong>
              </td>
              <td data-label="Resultado">
                <span className={`scenario-status ${item.ebitdaIncremental >= 0 ? "ok" : "no"}`}>
                  {item.id === recomendadoId
                    ? item.ebitdaIncremental >= 0
                      ? "Mayor ganancia"
                      : "Menor pérdida"
                    : item.ebitdaIncremental >= 0
                      ? "Crea valor"
                      : "Destruye valor"}
                </span>
              </td>
              <td data-label="Acción">
                <button
                  type="button"
                  className="delete-scenario"
                  onClick={() => onEliminar(item.id)}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GraficoEbitdaEscenarios({
  escenarios,
  recomendadoId,
}: {
  escenarios: EscenarioComparacion[]
  recomendadoId: string | null
}) {
  const ancho = Math.max(760, 150 + escenarios.length * 125)
  const alto = 320
  const izquierda = 72
  const derecha = 28
  const arriba = 34
  const abajo = 82
  const anchoGrafico = ancho - izquierda - derecha
  const altoGrafico = alto - arriba - abajo
  const maxAbs = Math.max(
    1,
    ...escenarios.map((item) => Math.abs(item.ebitdaIncremental)),
  )
  const limite = maxAbs * 1.2
  const y = (valor: number) =>
    arriba + ((limite - valor) / (limite * 2)) * altoGrafico
  const cero = y(0)
  const anchoGrupo = anchoGrafico / Math.max(1, escenarios.length)
  const anchoBarra = Math.min(54, anchoGrupo * 0.48)

  return (
    <div className="comparison-chart economic-chart">
      <div className="chart-scroll">
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          style={{ minWidth: ancho }}
          role="img"
          aria-label="EBITDA incremental en dólares por escenario"
        >
          {[-1, -0.5, 0, 0.5, 1].map((factor) => {
            const valor = limite * factor
            const posicionY = y(valor)
            return (
              <g key={factor}>
                <line
                  x1={izquierda}
                  y1={posicionY}
                  x2={ancho - derecha}
                  y2={posicionY}
                  stroke={factor === 0 ? "#78716c" : "#e7e5e4"}
                  strokeWidth={factor === 0 ? 1.5 : 1}
                />
                <text
                  x={izquierda - 9}
                  y={posicionY + 4}
                  textAnchor="end"
                  className="chart-axis-label"
                >
                  {dinero(valor)}
                </text>
              </g>
            )
          })}

          {escenarios.map((item, indice) => {
            const centro = izquierda + anchoGrupo * (indice + 0.5)
            const posicionY = y(item.ebitdaIncremental)
            const altoBarra = Math.max(2, Math.abs(cero - posicionY))
            const positivo = item.ebitdaIncremental >= 0
            return (
              <g key={item.id}>
                {item.id === recomendadoId && (
                  <rect
                    x={izquierda + anchoGrupo * indice + 6}
                    y={arriba - 14}
                    width={Math.max(0, anchoGrupo - 12)}
                    height={altoGrafico + 44}
                    rx="10"
                    fill="#fff7ed"
                  />
                )}
                <rect
                  x={centro - anchoBarra / 2}
                  y={Math.min(cero, posicionY)}
                  width={anchoBarra}
                  height={altoBarra}
                  rx="5"
                  fill={positivo ? "#15803d" : "#b91c1c"}
                >
                  <title>
                    {item.etiqueta}: {item.ebitdaIncremental >= 0 ? "+" : ""}
                    {dinero(item.ebitdaIncremental)} de EBITDA incremental
                  </title>
                </rect>
                <text
                  x={centro}
                  y={positivo ? posicionY - 8 : posicionY + 15}
                  textAnchor="middle"
                  className={positivo ? "chart-value-positive" : "chart-value-negative"}
                >
                  {item.ebitdaIncremental >= 0 ? "+" : ""}{dinero(item.ebitdaIncremental)}
                </text>
                <text
                  x={centro}
                  y={alto - 48}
                  textAnchor="middle"
                  className="chart-scenario-label"
                >
                  {item.etiqueta}
                </text>
                <text
                  x={centro}
                  y={alto - 31}
                  textAnchor="middle"
                  className="chart-scenario-detail"
                >
                  Desc. {item.descuentoPorcentaje.toFixed(1)}% · +{item.incrementoVentasPorcentaje.toFixed(1)}% unid.
                </text>
                <text
                  x={centro}
                  y={alto - 15}
                  textAnchor="middle"
                  className="chart-scenario-detail"
                >
                  {item.sku.slice(0, 16)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function CostoUnidad({
  etiqueta,
  valor,
  detalle,
  total = false,
}: {
  etiqueta: string
  valor: number
  detalle?: string
  total?: boolean
}) {
  return (
    <article className={total ? "total" : ""}>
      <span>{etiqueta}</span>
      <strong>{dinero(valor)}</strong>
      {detalle && <small>{detalle}</small>}
    </article>
  )
}

const css = `
  .profit-sim-page{max-width:1720px;margin:0 auto;padding:28px;color:#25272b;background:#f8f5f1;min-height:100vh}
  .profit-sim-page.embedded{max-width:none;margin:0;padding:0;background:transparent;min-height:0}
  .profit-sim-embedded-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;padding:12px 14px;border:1px solid #eaded8;border-radius:10px;background:#fbf8f6}
  .profit-sim-embedded-bar>div>span{display:block;color:#8f1d24;font-size:10px;font-weight:900;letter-spacing:.08em}
  .profit-sim-embedded-bar>div>small{display:block;margin-top:4px;color:#756963;font-size:11px}
  .profit-sim-embedded-bar label{display:flex;align-items:center;gap:8px}.profit-sim-embedded-bar label small{color:#6b7280;font-weight:800;white-space:nowrap}.profit-sim-embedded-bar input{min-height:38px;padding:7px 9px;border:1px solid #d5d9de;border-radius:8px;background:white;color:#25272b}.cost-reference-badge{padding:7px 11px;border-radius:999px;background:#f3ece8;color:#8f1d24;font-size:12px}
  .profit-sim-header{display:flex;justify-content:space-between;align-items:flex-end;gap:22px;margin-bottom:20px}
  .profit-sim-header>div>span,.profit-sim-panel>header span,.simulator-result>span{color:#8f1d24;font-size:11px;font-weight:900;letter-spacing:1px}
  .profit-sim-header h1{margin:5px 0;font-size:34px}.profit-sim-header p,.profit-sim-panel header p{margin:0;color:#6b7280;font-size:13px}
  .profit-sim-header label{width:220px}.profit-sim-header label small{display:block;margin-bottom:6px;color:#6b7280;font-weight:800}
  .profit-sim-header input,.simulator-fields input,.simulator-fields select{width:100%;min-height:42px;box-sizing:border-box;padding:9px 11px;border:1px solid #d5d9de;border-radius:8px;background:white;color:#25272b}
  .profit-sim-error,.profit-sim-warning{margin-bottom:16px;padding:13px 15px;border-radius:9px;font-size:13px}.profit-sim-error{background:#fee2e2;color:#991b1b;border-left:5px solid #b91c1c}.profit-sim-warning{background:#fff7ed;color:#9a3412;border-left:5px solid #f7931e}
  .profit-sim-kpis,.scenario-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:18px}
  .profit-sim-kpis article,.scenario-kpis article{display:flex;flex-direction:column;gap:6px;padding:16px;border:1px solid #eee3dd;border-radius:12px;background:white;box-shadow:0 4px 14px rgba(72,42,32,.04)}
  .profit-sim-kpis span,.scenario-kpis span{color:#6b7280;font-size:11px;font-weight:800}.profit-sim-kpis strong,.scenario-kpis strong{color:#8f1d24;font-size:24px}.profit-sim-kpis small,.scenario-kpis small{color:#8e7c75;font-size:10px}
  .profit-sim-tabs{display:flex;gap:7px;width:fit-content;margin-bottom:18px;padding:5px;border-radius:10px;background:#ece8e5}
  .profit-sim-tabs button{padding:10px 15px;border:0;border-radius:8px;background:transparent;color:#6b7280;font-weight:800;cursor:pointer}.profit-sim-tabs button.active{background:#8f1d24;color:white;box-shadow:0 5px 12px rgba(143,29,36,.18)}
  .profit-sim-panel{padding:20px;border:1px solid #eee3dd;border-radius:14px;background:white;box-shadow:0 6px 20px rgba(72,42,32,.05)}
  .profit-sim-panel>header{display:flex;justify-content:space-between;gap:14px;margin-bottom:16px}.profit-sim-panel h2{margin:0 0 5px;font-size:22px}
  .profit-table-wrap{overflow:auto;border:1px solid #eceff2;border-radius:10px}.profit-table-wrap table{width:100%;border-collapse:collapse;min-width:1050px}.profit-table-wrap th{padding:10px;background:#f8f6f4;color:#6b7280;text-align:left;font-size:11px;white-space:nowrap}.profit-table-wrap td{padding:10px;border-top:1px solid #edf0f2;text-align:right;font-size:12px;white-space:nowrap}.profit-table-wrap th:first-child,.profit-table-wrap td:first-child{text-align:left}.profit-table-wrap td strong{display:block}.profit-table-wrap td small{display:block;margin-top:3px;color:#8e7c75;font-size:10px}.positive{color:#15803d}.negative{color:#b91c1c}
  .profit-sim-empty{padding:32px;border:1px dashed #d1d5db;border-radius:10px;background:white;color:#6b7280;text-align:center}
  .simulator-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(290px,.8fr);gap:16px;margin-bottom:18px}.simulator-inputs,.simulator-result,.unit-costs{padding:17px;border:1px solid #eee3dd;border-radius:12px;background:#fff}.simulator-inputs h3,.unit-costs h3{margin:0 0 13px;font-size:16px}.simulator-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.simulator-fields label>span{display:block;margin-bottom:6px;color:#4b5563;font-size:11px;font-weight:800}.simulator-reference{display:block;margin-top:5px;color:#7a6f69;font-size:10px;line-height:1.35}.input-suffix{position:relative}.input-suffix input{padding-right:32px}.input-suffix b{position:absolute;right:11px;top:12px;color:#8f1d24;font-size:12px}
  .cost-behavior-panel{margin-top:14px;padding:14px;border:1px solid #eaded8;border-radius:12px;background:#fffaf7;display:grid;grid-template-columns:minmax(220px,1.15fr) repeat(3,minmax(180px,1fr));gap:10px;align-items:stretch}.cost-behavior-intro{padding:4px 8px}.cost-behavior-intro>span{display:block;color:#8f1d24;font-size:10px;font-weight:900;letter-spacing:.06em}.cost-behavior-intro>strong{display:block;margin-top:5px;font-size:12px}.cost-behavior-intro>small{display:block;margin-top:5px;color:#786d67;font-size:10px;line-height:1.4}.cost-check{display:flex!important;gap:9px;align-items:flex-start;padding:10px;border:1px solid #eaded8;border-radius:10px;background:white}.cost-check input{width:17px!important;height:17px!important;min-height:0!important;margin-top:2px;flex:0 0 auto}.cost-check span{display:block!important;margin:0!important}.cost-check b{display:block;font-size:11px;color:#3f3531}.cost-check small{display:block;margin-top:4px;color:#7a6f69;font-size:9px;line-height:1.35}
  .load-scenario-actions{display:flex;align-items:center;gap:12px;margin-top:15px}.load-scenario-actions button{min-height:42px;padding:0 20px;border:0;border-radius:8px;background:#8f1d24;color:white;font-weight:900;cursor:pointer;box-shadow:0 6px 14px rgba(143,29,36,.18)}.load-scenario-actions button:hover{background:#68151a}.load-scenario-actions small{color:#6b7280;font-size:11px}
  .simulator-result{display:flex;flex-direction:column;justify-content:center;text-align:center;background:linear-gradient(145deg,#fff7ed,#fff)}.simulator-result>strong{display:block;margin:8px 0;font-size:54px;line-height:1}.simulator-result>strong.good{color:#15803d}.simulator-result>strong.bad{color:#b91c1c}.simulator-result p{margin:0;color:#6b7280;font-size:12px;line-height:1.5}.decision{margin-top:14px;padding:10px;border-radius:8px;font-size:12px;font-weight:800}.decision.good{background:#dcfce7;color:#166534}.decision.bad{background:#fee2e2;color:#991b1b}
  .scenario-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}.scenario-kpis strong{font-size:20px}
  .promotion-economics{margin:18px 0;padding:18px;border:1px solid #e7ddd7;border-radius:14px;background:#fbfaf9}.promotion-economics>header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:16px}.promotion-economics>header>div:first-child>span{color:#8f1d24;font-size:10px;font-weight:900;letter-spacing:1px}.promotion-economics>header h3{margin:4px 0 5px;font-size:20px}.promotion-economics>header p{margin:0;color:#6b7280;font-size:11px;line-height:1.45}.economic-verdict{min-width:245px;padding:14px 16px;border-radius:12px;text-align:right}.economic-verdict.positive{background:#ecfdf3}.economic-verdict.negative{background:#fff1f2}.economic-verdict small{display:block;color:#6b7280;font-size:9px;font-weight:900}.economic-verdict strong{display:block;margin:4px 0;font-size:31px;line-height:1}.economic-verdict.positive strong{color:#15803d}.economic-verdict.negative strong{color:#b91c1c}.economic-verdict span{font-size:10px;font-weight:800;color:#6b7280}.economic-compare-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.economic-column,.break-even-card{padding:15px;border:1px solid #e8dfda;border-radius:11px;background:white}.economic-column>span,.break-even-card>span{display:block;color:#6b7280;font-size:10px;font-weight:900;letter-spacing:.05em}.economic-column>strong,.break-even-card>strong{display:block;margin:6px 0 2px;font-size:26px;color:#25272b}.economic-column>small{color:#8e7c75;font-size:10px}.economic-column dl{margin:12px 0 0}.economic-column dl div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid #f0ebe8}.economic-column dt{color:#6b7280;font-size:10px}.economic-column dd{margin:0;font-size:11px;font-weight:800}.economic-column.promotion{border-color:#d9c4bc}.break-even-card{background:#fffaf4}.break-even-card>strong{color:#8f1d24;font-size:34px}.break-even-card p{margin:4px 0 12px;color:#6b7280;font-size:11px;line-height:1.45}.break-even-units{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid #f0e2d5;font-size:11px}.break-even-units span{color:#6b7280}.incremental-bridge{margin-top:13px;padding:14px;border-radius:10px;background:white;border:1px solid #ece5e1}.incremental-bridge h4{margin:0 0 9px;font-size:13px}.incremental-bridge>div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid #f1ece9;font-size:11px}.incremental-bridge>div:first-of-type{border-top:0}.incremental-bridge .bridge-total{margin-top:3px;padding-top:9px;border-top:2px solid #ddd0c9;font-weight:900}.incremental-bridge strong.positive,.chart-value-positive{color:#15803d}.incremental-bridge strong.negative,.chart-value-negative{color:#b91c1c}.comparison-chart-description{margin:-4px 0 10px;color:#6b7280;font-size:10px;line-height:1.4}.chart-value-positive,.chart-value-negative{font-size:9px;font-weight:900}
  .unit-costs{margin-top:4px;background:#faf9f8}.unit-costs>div{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.unit-costs article{display:flex;flex-direction:column;gap:5px;padding:10px;border-radius:8px;background:white}.unit-costs article span{color:#6b7280;font-size:10px}.unit-costs article strong{font-size:15px}.unit-costs article small{color:#948983;font-size:9px;line-height:1.25}.unit-costs article.total{background:#8f1d24;color:white}.unit-costs article.total span,.unit-costs article.total small{color:#f8e8e9}
  .scenario-comparison{margin-top:20px;padding-top:20px;border-top:2px solid #eee3dd}.scenario-comparison>header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.scenario-comparison>header span{color:#8f1d24;font-size:10px;font-weight:900;letter-spacing:1px}.scenario-comparison>header h3{margin:3px 0;font-size:19px}.scenario-comparison>header p{margin:0;color:#6b7280;font-size:11px}.scenario-comparison>header button{min-height:38px;padding:0 13px;border:1px solid #b9aaa4;border-radius:8px;background:white;color:#6b4d45;font-weight:800;cursor:pointer}.scenario-table-wrap table{min-width:1380px}.scenario-table-wrap tr.recommended-row{background:#fffaf0}.scenario-status{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900}.scenario-status.ok{background:#dcfce7;color:#166534}.scenario-status.no{background:#fee2e2;color:#991b1b}.delete-scenario{padding:6px 9px;border:1px solid #efb5b5;border-radius:7px;background:white;color:#b91c1c;font-size:10px;font-weight:800;cursor:pointer}.comparison-chart-section{margin-top:18px;padding:16px;border:1px solid #eee3dd;border-radius:12px;background:#faf9f8}.comparison-chart-section>h3{margin:0 0 10px;font-size:16px}.comparison-chart{border-radius:9px;background:white}.chart-legend{display:flex;flex-wrap:wrap;gap:14px;padding:13px 15px 0}.chart-legend span{display:flex;align-items:center;gap:6px;color:#6b7280;font-size:10px;font-weight:800}.chart-legend i{width:10px;height:10px;border-radius:3px}.chart-scroll{overflow-x:auto}.chart-scroll svg{display:block;width:100%;height:auto}.chart-axis-label{fill:#78716c;font-size:10px}.chart-scenario-label{fill:#8f1d24;font-size:12px;font-weight:900}.chart-scenario-detail{fill:#78716c;font-size:8px}
  .profit-sim-footnote{margin-top:13px;color:#8e7c75;font-size:11px;line-height:1.5}
  @media(max-width:1100px){.cost-behavior-panel{grid-template-columns:1fr 1fr}.profit-sim-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.scenario-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.unit-costs>div{grid-template-columns:repeat(3,minmax(0,1fr))}.simulator-layout{grid-template-columns:1fr}.economic-compare-grid{grid-template-columns:1fr 1fr}.break-even-card{grid-column:1/-1}}
  @media(max-width:700px){.cost-behavior-panel{grid-template-columns:1fr}.profit-sim-page{padding:12px 10px 24px}.profit-sim-page.embedded{padding:0}.profit-sim-embedded-bar{align-items:stretch;flex-direction:column}.profit-sim-embedded-bar label{justify-content:space-between}.profit-sim-header{align-items:stretch;flex-direction:column}.profit-sim-header h1{font-size:26px}.profit-sim-header label{width:100%}.profit-sim-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.profit-sim-kpis article{padding:11px}.profit-sim-kpis strong{font-size:19px}.profit-sim-tabs{display:grid;grid-template-columns:1fr;width:100%;box-sizing:border-box}.profit-sim-panel{padding:12px}.simulator-fields{grid-template-columns:1fr}.load-scenario-actions{align-items:stretch;flex-direction:column}.scenario-kpis,.unit-costs>div{grid-template-columns:repeat(2,minmax(0,1fr))}.promotion-economics>header{flex-direction:column}.economic-verdict{width:100%;min-width:0;box-sizing:border-box;text-align:left}.economic-compare-grid{grid-template-columns:1fr}.break-even-card{grid-column:auto}.profit-table-wrap{overflow:visible;border:0}.profit-table-wrap table,.profit-table-wrap tbody,.profit-table-wrap tr,.profit-table-wrap td{display:block;width:100%;box-sizing:border-box}.profit-table-wrap table{min-width:0}.profit-table-wrap thead{display:none}.profit-table-wrap tbody{display:grid;gap:9px}.profit-table-wrap tr{padding:9px 11px;border:1px solid #eee3dd;border-radius:10px}.profit-table-wrap td{display:grid;grid-template-columns:120px minmax(0,1fr);align-items:center;gap:8px;padding:6px 0;border:0;text-align:right;white-space:normal}.profit-table-wrap td:first-child{text-align:right}.profit-table-wrap td:before{content:attr(data-label);color:#8e7c75;text-align:left;font-size:10px;font-weight:800}.simulator-result>strong{font-size:44px}.scenario-comparison>header{flex-direction:column}.comparison-chart-section{padding:10px}}
`
