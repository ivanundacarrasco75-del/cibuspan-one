import { useEffect, useMemo, useRef, useState } from "react"
import DashboardDevolucionesPanel from "../components/dashboard/DashboardDevolucionesPanel"
import DashboardPilotoPanel from "../components/dashboard/DashboardPilotoPanel"
import DashboardRentabilidadPilotoPanel from "../components/dashboard/DashboardRentabilidadPilotoPanel"
import DashboardCostosGastosPanel from "../components/dashboard/DashboardCostosGastosPanel"
import { supabase } from "../lib/supabase"
import {
  obtenerDetallesPedidosPorIdsDb,
  obtenerPedidosRangoDb,
  type DetallePedidoConsultaDb,
  type PedidoListadoDb,
} from "../repositories/pedidoRepository"
import {
  obtenerCatalogoProductosDevolucionDb,
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
  type ProductoDevolucionDb,
} from "../repositories/devolucionRepository"
import {
  obtenerVentasDiariasRangoDb,
  obtenerVentasSemanalesRangoDb,
  type VentaDiariaDb,
  type VentaSemanalDb,
} from "../repositories/ventasRepository"
import { obtenerResumenProduccionesRangoDb } from "../repositories/produccionRepository"
import {
  obtenerFacturasDb,
  obtenerPagosFacturasSemanalesDb,
  type FacturaDetalleDb,
  type PagoFacturaSemanalDb,
} from "../repositories/facturasRepository"
import {
  obtenerResultadosMensualesDb,
  type ResultadoMensualDb,
} from "../repositories/costosIndirectosRepository"
import {
  obtenerNominaMensualAreaDb,
  type NominaMensualAreaDb,
} from "../repositories/nominaRepository"
import {
  guardarReglasDistribucionDb,
  obtenerReglasDistribucionDb,
  REGLAS_DISTRIBUCION_PREDETERMINADAS,
  type BaseDistribucion,
  type ReglaDistribucionDb,
} from "../repositories/rentabilidadRepository"
import { ETIQUETAS_AREA_NOMINA, type AreaNomina } from "../utils/rolesPagoPdf"

type ProduccionResumen = {
  id: string
  fecha_produccion_general: string
  total_unidades: number
  total_paradas: number
  ordenes_micro: number
  total_kg_micro: number
  costo_total: number | null
  origen: "APP" | "HISTORICO"
}

type ProduccionSemanal = {
  semana: string
  unidades: number
  paradas: number
  ordenes: number
  kgMicro: number
  costoHistorico: number
}

type StockResumen = { cantidad_disponible: number }

type PedidoConDetalle = {
  pedido: PedidoListadoDb
  detalles: DetallePedidoConsultaDb[]
}

type SkuSemanal = {
  id: string
  codigo: string
  corto: string
  nombre: string
  despachosActual: number
  despachosAnterior: number
  devolucionesActual: number
  devolucionesAnterior: number
}

type PrecioClienteProducto = {
  cliente_id: string
  producto_id: string
  precio: number | null
}

type CostoReceta = {
  producto_id: string
  producto_codigo: string
  batch_calculado_kg: number | null
  rendimiento_unidades: number | null
  costo_materia_prima_unidad: number | null
  costo_empaque_unidad: number | null
  costo_materiales_unidad: number | null
  items_sin_costo: number
}

type TipoCostoGasto = "EBITDA" | "INVENTARIO" | "PENDIENTE"

type RubroCostoGasto = {
  id: string
  etiqueta: string
  tipo: TipoCostoGasto
  actual: number
  anterior: number
  facturasActual: number
  facturasAnterior: number
}

type CuentaCostoGasto = {
  codigo: string
  nombre: string
  grupo: string
  tipo: TipoCostoGasto
  actual: number
  anterior: number
  facturasActual: number
  facturasAnterior: number
  proveedoresActual: number
}

type ReporteCostosGastos = {
  actual: {
    gastoEbitda: number
    inventario: number
    pendientes: number
    facturas: number
  }
  anterior: {
    gastoEbitda: number
    inventario: number
    pendientes: number
    facturas: number
  }
  rubros: RubroCostoGasto[]
  cuentas: CuentaCostoGasto[]
}

type ReporteNominaFinanciero = {
  actual: {
    costo: number
    descuentos: number
    pagoNeto: number
    meses: number
  }
  anterior: {
    costo: number
    descuentos: number
    pagoNeto: number
    meses: number
  }
  areas: {
    area: AreaNomina
    actual: number
    anterior: number
  }[]
  equipoVentas: {
    actual: {
      nominaInterna: number
      serviciosExternos: number
      total: number
    }
    anterior: {
      nominaInterna: number
      serviciosExternos: number
      total: number
    }
  }
}

type RentabilidadDetalle = {
  key: string
  clienteId: string
  cliente: string
  productoId: string
  codigo: string
  sku: string
  unidadesDespachadas: number
  unidadesDevueltas: number
  kgEquivalente: number
  ventaFacturada: number
  costoMateriaPrimaUnitario: number | null
  costoEmpaqueUnitario: number | null
  componentesSinCosto: number
  valorDevoluciones: number
  ventasNetas: number
  costoMateriaPrima: number | null
  costoEmpaque: number | null
  costoMateriales: number | null
  manoObraDirecta: number
  transporte: number
  gastosAsignados: number
  contribucion: number | null
  margenContribucion: number | null
  ebitdaEstimado: number | null
  margenEbitda: number | null
  completo: boolean
}

type TabId =
  | "ejecutivo"
  | "comercial"
  | "devoluciones"
  | "produccion"
  | "inventario"
  | "financiero"
  | "costos_gastos"
  | "rentabilidad_piloto"
  | "piloto"

type AgrupacionDashboard =
  | "DIA"
  | "SEMANA"
  | "MES"
  | "TRIMESTRE"
  | "SEMESTRE"

const AGRUPACIONES_POR_PERIODO: Record<
  string,
  { valor: AgrupacionDashboard; etiqueta: string }[]
> = {
  MES: [
    { valor: "DIA", etiqueta: "Días" },
    { valor: "SEMANA", etiqueta: "Semanas" },
  ],
  MES_ESPECIFICO: [
    { valor: "DIA", etiqueta: "Días" },
    { valor: "SEMANA", etiqueta: "Semanas" },
  ],
  TRIMESTRE: [
    { valor: "SEMANA", etiqueta: "Semanas" },
    { valor: "MES", etiqueta: "Meses" },
  ],
  SEMESTRE: [
    { valor: "MES", etiqueta: "Meses" },
    { valor: "TRIMESTRE", etiqueta: "Trimestres" },
  ],
  ANIO: [
    { valor: "MES", etiqueta: "Meses" },
    { valor: "TRIMESTRE", etiqueta: "Trimestres" },
    { valor: "SEMESTRE", etiqueta: "Semestres" },
  ],
  PERSONALIZADO: [
    { valor: "DIA", etiqueta: "Días" },
    { valor: "SEMANA", etiqueta: "Semanas" },
    { valor: "MES", etiqueta: "Meses" },
    { valor: "TRIMESTRE", etiqueta: "Trimestres" },
    { valor: "SEMESTRE", etiqueta: "Semestres" },
  ],
}

function agrupacionPredeterminada(tipo: string): AgrupacionDashboard {
  if (tipo === "ANIO" || tipo === "SEMESTRE") return "MES"
  if (tipo === "TRIMESTRE") return "SEMANA"
  return "DIA"
}

const TABS: { id: TabId; etiqueta: string; icono: string }[] = [
  { id: "ejecutivo", etiqueta: "Ejecutivo", icono: "◆" },
  { id: "comercial", etiqueta: "Comercial", icono: "↗" },
  { id: "devoluciones", etiqueta: "Devoluciones", icono: "↩" },
  { id: "produccion", etiqueta: "Producción", icono: "⚙" },
  { id: "inventario", etiqueta: "Inventario", icono: "▦" },
  { id: "financiero", etiqueta: "Financiero", icono: "$" },
  { id: "costos_gastos", etiqueta: "Costos y gastos", icono: "▤" },
  { id: "rentabilidad_piloto", etiqueta: "Rentabilidad piloto", icono: "%" },
]

const VINO = "#8F1D24"
const NARANJA = "#F7931E"

function fechaIsoLocal(fecha: Date) {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, "0")
  const d = String(fecha.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
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

function fechaCorta(fechaIso: string) {
  const [, mes, dia] = fechaIso.split("-")
  return `${dia}/${mes}`
}

function numero(valor: number) {
  return new Intl.NumberFormat("es-EC").format(valor || 0)
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor || 0)
}

function porcentajeVariacion(actual: number, anterior: number) {
  if (anterior === 0) return actual === 0 ? 0 : null
  return ((actual - anterior) / anterior) * 100
}

export default function DashboardV2({
  cambiarPantalla,
  tabInicial = "ejecutivo",
}: {
  cambiarPantalla: (pantalla: string) => void
  tabInicial?: TabId
}) {
  const fechaFinalInicial = fechaIsoLocal(new Date())
  const fechaInicialInicial = `${fechaFinalInicial.slice(0, 7)}-01`
  const [tabActiva, setTabActiva] = useState<TabId>(tabInicial)

  useEffect(() => {
    setTabActiva(tabInicial)
  }, [tabInicial])
  const [fechaDesde, setFechaDesde] = useState(fechaInicialInicial)
  const [fechaHasta, setFechaHasta] = useState(fechaFinalInicial)
  const [fechaDesdeFiltro, setFechaDesdeFiltro] = useState(fechaInicialInicial)
  const [fechaHastaFiltro, setFechaHastaFiltro] = useState(fechaFinalInicial)
  const [periodoRapido, setPeriodoRapido] = useState("MES")
  const [mesEspecifico, setMesEspecifico] = useState(fechaFinalInicial.slice(0, 7))
  const [agrupacionDashboard, setAgrupacionDashboard] =
    useState<AgrupacionDashboard>("SEMANA")
  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionListadoDb[]>([])
  const [producciones, setProducciones] = useState<ProduccionResumen[]>([])
  const [stock, setStock] = useState<StockResumen[]>([])
  const [precios, setPrecios] = useState<PrecioClienteProducto[]>([])
  const [costosReceta, setCostosReceta] = useState<CostoReceta[]>([])
  const [ventasDiarias, setVentasDiarias] = useState<VentaDiariaDb[]>([])
  const [ventasSemanales, setVentasSemanales] = useState<VentaSemanalDb[]>([])
  const [facturas, setFacturas] = useState<FacturaDetalleDb[]>([])
  const [pagosSemanales, setPagosSemanales] = useState<PagoFacturaSemanalDb[]>([])
  const [resultadosMensuales, setResultadosMensuales] = useState<ResultadoMensualDb[]>([])
  const [nominaMensual, setNominaMensual] = useState<NominaMensualAreaDb[]>([])
  const [reglasDistribucion, setReglasDistribucion] = useState<ReglaDistribucionDb[]>(
    REGLAS_DISTRIBUCION_PREDETERMINADAS,
  )
  const [productosDevolucion, setProductosDevolucion] = useState<
    ProductoDevolucionDb[]
  >([])
  const [avisoVentas, setAvisoVentas] = useState("")
  const [avisoRentabilidad, setAvisoRentabilidad] = useState("")
  const [avisoFinanciero, setAvisoFinanciero] = useState("")
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const solicitudCargaRef = useRef(0)

  const hoy = fechaIsoLocal(new Date())
  const periodoAnterior = periodoAnteriorEquivalente(fechaDesde, fechaHasta)
  const semanaActualDesde = inicioSemana(fechaDesde)
  const semanaActualHasta = inicioSemana(fechaHasta)
  const semanaAnteriorDesde = inicioSemana(periodoAnterior.desde)
  const semanaAnteriorHasta = inicioSemana(periodoAnterior.hasta)

  const cargasCompletadasRef = useRef(new Set<string>())

  useEffect(() => {
    void cargar(fechaDesde, fechaHasta, tabActiva)
  }, [tabActiva])

  async function cargar(
    rangoDesde = fechaDesde,
    rangoHasta = fechaHasta,
    tab: TabId = tabActiva,
    forzar = false,
  ) {
    const claveCarga = `${tab}|${rangoDesde}|${rangoHasta}`
    if (!forzar && cargasCompletadasRef.current.has(claveCarga)) {
      setCargando(false)
      return
    }

    const solicitudActual = solicitudCargaRef.current + 1
    solicitudCargaRef.current = solicitudActual
    setCargando(true)
    setError("")

    try {
      const comparacion = periodoAnteriorEquivalente(rangoDesde, rangoHasta)
      const devolucionesHastaConsulta = sumarDias(rangoHasta, 60)
      const semanaConsultaDesde = inicioSemana(comparacion.desde)
      const semanaConsultaHasta = inicioSemana(rangoHasta)

      const ventasDiariasSeguras = (desde: string, hasta: string) =>
        obtenerVentasDiariasRangoDb(desde, hasta)
          .then((data) => ({ data, error: "" }))
          .catch((err) => ({
            data: [] as VentaDiariaDb[],
            error:
              err instanceof Error
                ? err.message
                : "No se pudo consultar el detalle diario de ventas.",
          }))

      const ventasSemanalesSeguras = (desde: string, hasta: string) =>
        obtenerVentasSemanalesRangoDb(desde, hasta)
          .then((data) => ({ data, error: "" }))
          .catch((err) => ({
            data: [] as VentaSemanalDb[],
            error:
              err instanceof Error
                ? err.message
                : "No se pudo consultar la facturación importada.",
          }))

      if (tab === "comercial" || tab === "piloto") {
        const [ventasDiariasRes, devolucionesDb] = await Promise.all([
          ventasDiariasSeguras(rangoDesde, rangoHasta),
          obtenerDevolucionesDb(rangoDesde, devolucionesHastaConsulta),
        ])

        if (solicitudActual !== solicitudCargaRef.current) return
        setVentasDiarias(ventasDiariasRes.data)
        setDevoluciones(devolucionesDb)
        setAvisoVentas(ventasDiariasRes.error)
      } else if (tab === "devoluciones") {
        const [ventasRes, ventasDiariasRes, devolucionesDb, productosDb] =
          await Promise.all([
            ventasSemanalesSeguras(inicioSemana(rangoDesde), semanaConsultaHasta),
            ventasDiariasSeguras(rangoDesde, rangoHasta),
            obtenerDevolucionesDb(rangoDesde, devolucionesHastaConsulta),
            obtenerCatalogoProductosDevolucionDb(),
          ])

        if (solicitudActual !== solicitudCargaRef.current) return
        setVentasSemanales(ventasRes.data)
        setVentasDiarias(ventasDiariasRes.data)
        setDevoluciones(devolucionesDb)
        setProductosDevolucion(productosDb)
        setAvisoVentas([ventasRes.error, ventasDiariasRes.error].filter(Boolean).join(" "))
      } else if (tab === "inventario") {
        const stockRes = await supabase
          .from("stock_disponible_lotes")
          .select("cantidad_disponible")
        if (stockRes.error) throw stockRes.error
        if (solicitudActual !== solicitudCargaRef.current) return
        setStock((stockRes.data ?? []) as StockResumen[])
      } else if (tab === "ejecutivo" || tab === "produccion") {
        const produccionDesde = comparacion.desde < hoy ? comparacion.desde : hoy
        const produccionHasta = rangoHasta > hoy ? rangoHasta : hoy
        const [pedidosDb, devolucionesDb, produccionesDb, stockRes] =
          await Promise.all([
            obtenerPedidosRangoDb(comparacion.desde, rangoHasta),
            obtenerDevolucionesDb(comparacion.desde, devolucionesHastaConsulta),
            obtenerResumenProduccionesRangoDb(produccionDesde, produccionHasta, true),
            supabase.from("stock_disponible_lotes").select("cantidad_disponible"),
          ])

        if (stockRes.error) throw stockRes.error

        const detallesMapa = await obtenerDetallesPedidosPorIdsDb(
          pedidosDb.map((pedido) => pedido.id),
        )
        const pedidosConDetalle = pedidosDb.map((pedido) => ({
          pedido,
          detalles: detallesMapa.get(pedido.id) ?? [],
        }))

        if (solicitudActual !== solicitudCargaRef.current) return
        setPedidos(pedidosConDetalle)
        setDevoluciones(devolucionesDb)
        setProducciones(produccionesDb as ProduccionResumen[])
        setStock((stockRes.data ?? []) as StockResumen[])
      } else if (tab === "financiero" || tab === "rentabilidad_piloto") {
        const ventasPromise = ventasSemanalesSeguras(
          semanaConsultaDesde,
          semanaConsultaHasta,
        )
        const ventasDiariasPromise = ventasDiariasSeguras(
          comparacion.desde,
          rangoHasta,
        )
        const pagosPromise = obtenerPagosFacturasSemanalesDb()
          .then((data) => ({ data, error: "" }))
          .catch((err) => ({
            data: [] as PagoFacturaSemanalDb[],
            error: err instanceof Error ? err.message : "No se pudieron consultar los pagos.",
          }))
        const facturasPromise = obtenerFacturasDb()
          .then((data) => ({ data, error: "" }))
          .catch((err) => ({
            data: [] as FacturaDetalleDb[],
            error: err instanceof Error ? err.message : "No se pudieron consultar las facturas.",
          }))
        const resultadosPromise = obtenerResultadosMensualesDb()
          .then((data) => ({ data, error: "" }))
          .catch((err) => ({
            data: [] as ResultadoMensualDb[],
            error: err instanceof Error ? err.message : "No se pudo consultar el balance.",
          }))
        const nominaPromise = obtenerNominaMensualAreaDb()
          .then((data) => ({ data, error: "" }))
          .catch((err) => ({
            data: [] as NominaMensualAreaDb[],
            error: err instanceof Error ? err.message : "No se pudo consultar la nómina.",
          }))
        const reglasPromise = obtenerReglasDistribucionDb()
          .then((data) => ({ data, error: "" }))
          .catch((err) => ({
            data: REGLAS_DISTRIBUCION_PREDETERMINADAS,
            error:
              err instanceof Error
                ? err.message
                : "No se pudieron consultar las reglas de distribución.",
          }))

        const [
          devolucionesDb,
          preciosRes,
          costosRes,
          ventasRes,
          ventasDiariasRes,
          facturasRes,
          pagosRes,
          resultadosRes,
          nominaRes,
          reglasRes,
        ] = await Promise.all([
          obtenerDevolucionesDb(comparacion.desde, devolucionesHastaConsulta),
          supabase
            .from("cliente_productos")
            .select("cliente_id, producto_id, precio")
            .eq("activo", true),
          supabase
            .from("fm_vw_productos_costo_completo")
            .select(
              "producto_id, producto_codigo, batch_calculado_kg, rendimiento_unidades, costo_materia_prima_unidad, costo_empaque_unidad, costo_materiales_unidad, items_sin_costo",
            ),
          ventasPromise,
          ventasDiariasPromise,
          facturasPromise,
          pagosPromise,
          resultadosPromise,
          nominaPromise,
          reglasPromise,
        ])

        if (solicitudActual !== solicitudCargaRef.current) return
        setDevoluciones(devolucionesDb)
        setPrecios((preciosRes.data ?? []) as PrecioClienteProducto[])
        setCostosReceta((costosRes.data ?? []) as CostoReceta[])
        setVentasSemanales(ventasRes.data)
        setVentasDiarias(ventasDiariasRes.data)
        setFacturas(facturasRes.data)
        setPagosSemanales(pagosRes.data)
        setResultadosMensuales(resultadosRes.data)
        setNominaMensual(nominaRes.data)
        setReglasDistribucion(reglasRes.data)
        setAvisoVentas([ventasRes.error, ventasDiariasRes.error].filter(Boolean).join(" "))
        setAvisoFinanciero(
          [facturasRes.error, pagosRes.error, resultadosRes.error, nominaRes.error, reglasRes.error]
            .filter(Boolean)
            .join(" "),
        )

        const avisos: string[] = []
        if (preciosRes.error) avisos.push("precios por cliente")
        if (costosRes.error) avisos.push("costos de recetas")
        setAvisoRentabilidad(
          avisos.length > 0
            ? `No se pudieron consultar: ${avisos.join(" y ")}.`
            : "",
        )
      }

      cargasCompletadasRef.current.add(claveCarga)
    } catch (err) {
      if (solicitudActual !== solicitudCargaRef.current) return
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el dashboard.",
      )
    } finally {
      if (solicitudActual === solicitudCargaRef.current) {
        setCargando(false)
      }
    }
  }

  async function aplicarPeriodo(desde: string, hasta: string) {
    if (!desde || !hasta || desde > hasta) {
      setError("El rango de fechas no es válido.")
      return
    }
    setFechaDesde(desde)
    setFechaHasta(hasta)
    setFechaDesdeFiltro(desde)
    setFechaHastaFiltro(hasta)
    await cargar(desde, hasta)
  }

  function rangoRapido(tipo: string) {
    const referencia = fechaIsoLocal(new Date())
    const fecha = new Date(`${referencia}T12:00:00`)
    if (tipo === "MES") {
      return { desde: `${referencia.slice(0, 7)}-01`, hasta: referencia }
    }
    if (tipo === "TRIMESTRE") {
      const mesInicial = Math.floor(fecha.getMonth() / 3) * 3
      return {
        desde: fechaIsoLocal(new Date(fecha.getFullYear(), mesInicial, 1)),
        hasta: referencia,
      }
    }
    if (tipo === "SEMESTRE") {
      const mesInicial = fecha.getMonth() < 6 ? 0 : 6
      return {
        desde: fechaIsoLocal(new Date(fecha.getFullYear(), mesInicial, 1)),
        hasta: referencia,
      }
    }
    if (tipo === "TRIMESTRE_ANTERIOR") {
      const mesInicialActual = Math.floor(fecha.getMonth() / 3) * 3
      const finAnterior = new Date(fecha.getFullYear(), mesInicialActual, 0)
      const inicioAnterior = new Date(
        finAnterior.getFullYear(),
        Math.floor(finAnterior.getMonth() / 3) * 3,
        1,
      )
      return {
        desde: fechaIsoLocal(inicioAnterior),
        hasta: fechaIsoLocal(finAnterior),
      }
    }
    if (tipo === "ANIO") {
      return { desde: `${referencia.slice(0, 4)}-01-01`, hasta: referencia }
    }
    return {
      desde: inicioSemana(sumarDias(referencia, -49)),
      hasta: referencia,
    }
  }

  async function cambiarPeriodoRapido(tipo: string) {
    setPeriodoRapido(tipo)
    setMesEspecifico("")
    setAgrupacionDashboard(agrupacionPredeterminada(tipo))
    if (tipo === "PERSONALIZADO") return
    const rango = rangoRapido(tipo)
    await aplicarPeriodo(rango.desde, rango.hasta)
  }

  async function cambiarMesEspecifico(valor: string) {
    setMesEspecifico(valor)
    if (!valor) return

    const [anio, mes] = valor.split("-").map(Number)
    const desde = `${valor}-01`
    const ultimoDia = fechaIsoLocal(new Date(anio, mes, 0))
    const hasta = valor === fechaFinalInicial.slice(0, 7)
      ? fechaFinalInicial
      : ultimoDia

    setPeriodoRapido("MES_ESPECIFICO")
    setAgrupacionDashboard("DIA")
    await aplicarPeriodo(desde, hasta)
  }

  async function actualizarReglasRentabilidad(reglas: ReglaDistribucionDb[]) {
    await guardarReglasDistribucionDb(
      reglas.map(({ codigo, base_distribucion }) => ({ codigo, base_distribucion })),
    )
    setReglasDistribucion(reglas)
  }

  const resumenSku = useMemo<SkuSemanal[]>(() => {
    const mapa = new Map<string, SkuSemanal>()

    const obtener = (
      productoId: string,
      producto?: { codigo?: string; corto?: string; nombre?: string } | null,
    ) => {
      const existente = mapa.get(productoId)
      if (existente) return existente

      const nuevo: SkuSemanal = {
        id: productoId,
        codigo: producto?.codigo ?? "—",
        corto: producto?.corto ?? producto?.nombre ?? "SKU sin nombre",
        nombre: producto?.nombre ?? "",
        despachosActual: 0,
        despachosAnterior: 0,
        devolucionesActual: 0,
        devolucionesAnterior: 0,
      }
      mapa.set(productoId, nuevo)
      return nuevo
    }

    pedidos.forEach(({ pedido, detalles }) => {
      if (pedido.estado !== "DESPACHADO") return
      const esActual =
        pedido.fecha_entrega >= fechaDesde &&
        pedido.fecha_entrega <= fechaHasta
      const esAnterior =
        pedido.fecha_entrega >= periodoAnterior.desde &&
        pedido.fecha_entrega <= periodoAnterior.hasta
      if (!esActual && !esAnterior) return

      detalles.forEach((detalle) => {
        const sku = obtener(detalle.producto_id, detalle.producto)
        const unidades = Number(detalle.unidades_despachadas ?? 0)
        if (esActual) sku.despachosActual += unidades
        else if (esAnterior) sku.despachosAnterior += unidades
      })
    })

    devoluciones.forEach((devolucion) => {
      ;(devolucion.detalles ?? []).forEach((detalle) => {
        const semana = detalle.semana_origen_inicio
        const esActual =
          semana >= semanaActualDesde && semana <= semanaActualHasta
        const esAnterior =
          semana >= semanaAnteriorDesde && semana <= semanaAnteriorHasta
        if (!esActual && !esAnterior) return

        const sku = obtener(detalle.producto_id, detalle.producto)
        const unidades = Number(detalle.unidades ?? 0)
        if (esActual) sku.devolucionesActual += unidades
        else if (esAnterior) sku.devolucionesAnterior += unidades
      })
    })

    return Array.from(mapa.values()).sort(
      (a, b) => b.despachosActual - a.despachosActual,
    )
  }, [
    pedidos,
    devoluciones,
    fechaDesde,
    fechaHasta,
    periodoAnterior.desde,
    periodoAnterior.hasta,
    semanaActualDesde,
    semanaActualHasta,
    semanaAnteriorDesde,
    semanaAnteriorHasta,
  ])

  const totales = resumenSku.reduce(
    (total, sku) => ({
      despachosActual: total.despachosActual + sku.despachosActual,
      despachosAnterior: total.despachosAnterior + sku.despachosAnterior,
      devolucionesActual: total.devolucionesActual + sku.devolucionesActual,
      devolucionesAnterior:
        total.devolucionesAnterior + sku.devolucionesAnterior,
    }),
    {
      despachosActual: 0,
      despachosAnterior: 0,
      devolucionesActual: 0,
      devolucionesAnterior: 0,
    },
  )

  const tasaActual =
    totales.despachosActual > 0
      ? (totales.devolucionesActual / totales.despachosActual) * 100
      : 0
  const tasaAnterior =
    totales.despachosAnterior > 0
      ? (totales.devolucionesAnterior / totales.despachosAnterior) * 100
      : 0
  const stockDisponible = stock.reduce(
    (total, item) => total + Number(item.cantidad_disponible || 0),
    0,
  )
  const produccionHoy = producciones.reduce(
    (total, item) => item.fecha_produccion_general === hoy
      ? total + Number(item.total_unidades || 0)
      : total,
    0,
  )
  const ordenesHoy = producciones.filter(
    (item) => item.fecha_produccion_general === hoy,
  ).length
  const produccionSemanal = useMemo<ProduccionSemanal[]>(() => {
    const mapa = new Map<string, ProduccionSemanal>()
    semanasEntre(fechaDesde, fechaHasta).forEach((semana) => {
      mapa.set(semana, {
        semana,
        unidades: 0,
        paradas: 0,
        ordenes: 0,
        kgMicro: 0,
        costoHistorico: 0,
      })
    })
    producciones.forEach((produccion) => {
      if (
        produccion.fecha_produccion_general < fechaDesde ||
        produccion.fecha_produccion_general > fechaHasta
      ) return
      const semana = inicioSemana(produccion.fecha_produccion_general)
      const actual = mapa.get(semana)
      if (!actual) return
      actual.unidades += Number(produccion.total_unidades ?? 0)
      actual.paradas += Number(produccion.total_paradas ?? 0)
      actual.ordenes += 1
      actual.kgMicro += Number(produccion.total_kg_micro ?? 0)
      actual.costoHistorico += Number(produccion.costo_total ?? 0)
      mapa.set(semana, actual)
    })
    return Array.from(mapa.values()).sort((a, b) =>
      a.semana.localeCompare(b.semana),
    )
  }, [producciones, fechaDesde, fechaHasta])

  const totalProduccionPeriodo = useMemo(() => {
    const acumular = (desde: string, hasta: string) =>
      producciones.reduce(
        (total, item) => {
          if (
            item.fecha_produccion_general < desde ||
            item.fecha_produccion_general > hasta
          ) return total
          total.unidades += Number(item.total_unidades ?? 0)
          total.paradas += Number(item.total_paradas ?? 0)
          total.ordenes += 1
          total.kgMicro += Number(item.total_kg_micro ?? 0)
          return total
        },
        { unidades: 0, paradas: 0, ordenes: 0, kgMicro: 0 },
      )
    return {
      actual: acumular(fechaDesde, fechaHasta),
      anterior: acumular(periodoAnterior.desde, periodoAnterior.hasta),
    }
  }, [producciones, fechaDesde, fechaHasta, periodoAnterior.desde, periodoAnterior.hasta])

  const rentabilidadCalculo = useMemo(() => {
    type Movimiento = {
      key: string
      clienteId: string
      cliente: string
      productoId: string
      codigo: string
      sku: string
      unidadesDespachadas: number
      unidadesDevueltas: number
      ventaFacturada: number
      valorDevoluciones: number
    }
    type CampoAsignado = "manoObraDirecta" | "transporte" | "gastosAsignados"

    const normalizar = (valor: string) => valor.trim().toUpperCase()
    const movimientos = new Map<string, Movimiento>()
    const preciosMapa = new Map(
      precios.map((item) => [
        `${item.cliente_id}|${item.producto_id}`,
        item.precio === null ? null : Number(item.precio),
      ]),
    )
    const costosPorProducto = new Map(
      costosReceta.map((item) => [item.producto_id, item]),
    )
    const costosPorCodigo = new Map(
      costosReceta.map((item) => [normalizar(item.producto_codigo), item]),
    )
    const reglasMapa = new Map(
      reglasDistribucion.map((regla) => [regla.codigo, regla.base_distribucion]),
    )
    const baseRegla = (codigo: string, respaldo: BaseDistribucion) =>
      reglasMapa.get(codigo) ?? respaldo

    const obtenerMovimiento = ({
      clienteId,
      cliente,
      productoId,
      codigo,
      sku,
    }: {
      clienteId: string
      cliente: string
      productoId: string
      codigo: string
      sku: string
    }) => {
      const key = `${clienteId}|${productoId}`
      const existente = movimientos.get(key)
      if (existente) return existente
      const nuevo: Movimiento = {
        key,
        clienteId,
        cliente,
        productoId,
        codigo,
        sku,
        unidadesDespachadas: 0,
        unidadesDevueltas: 0,
        ventaFacturada: 0,
        valorDevoluciones: 0,
      }
      movimientos.set(key, nuevo)
      return nuevo
    }

    ventasSemanales.forEach((venta) => {
      if (
        venta.semana_inicio < semanaActualDesde
        || venta.semana_inicio > semanaActualHasta
      ) return
      const clienteId = venta.cliente_id ?? `CLIENTE:${normalizar(venta.cliente_nombre)}`
      const productoId = venta.producto_id ?? `SKU:${normalizar(venta.sku)}`
      const movimiento = obtenerMovimiento({
        clienteId,
        cliente: venta.cliente_nombre,
        productoId,
        codigo: venta.sku,
        sku: venta.producto_nombre || venta.sku,
      })
      movimiento.unidadesDespachadas += Number(venta.unidades ?? 0)
      movimiento.ventaFacturada += Number(venta.venta_sin_impuestos ?? 0)
    })

    devoluciones.forEach((devolucion) => {
      if (!devolucion.cliente?.id) return
      ;(devolucion.detalles ?? []).forEach((detalle) => {
        if (
          detalle.semana_origen_inicio < semanaActualDesde
          || detalle.semana_origen_inicio > semanaActualHasta
          || !detalle.producto
        ) return
        const movimiento = obtenerMovimiento({
          clienteId: devolucion.cliente!.id,
          cliente: devolucion.cliente!.nombre,
          productoId: detalle.producto_id,
          codigo: detalle.producto.codigo,
          sku: detalle.producto.corto,
        })
        const unidades = Number(detalle.unidades ?? 0)
        const precioDocumento = detalle.precio_unitario_documento == null
          ? null
          : Number(detalle.precio_unitario_documento)
        const precioConfigurado = preciosMapa.get(movimiento.key) ?? null
        movimiento.unidadesDevueltas += unidades
        movimiento.valorDevoluciones += detalle.valor_total_documento == null
          ? unidades * Number(precioDocumento ?? precioConfigurado ?? 0)
          : Number(detalle.valor_total_documento)
      })
    })

    const detalle = Array.from(movimientos.values()).map<RentabilidadDetalle>((movimiento) => {
      const costo = costosPorProducto.get(movimiento.productoId)
        ?? costosPorCodigo.get(normalizar(movimiento.codigo))
      const costoMateriaPrimaUnitario = costo?.costo_materia_prima_unidad == null
        ? null
        : Number(costo.costo_materia_prima_unidad)
      const costoEmpaqueUnitario = costo?.costo_empaque_unidad == null
        ? null
        : Number(costo.costo_empaque_unidad)
      const costoMaterialesUnitario = costo?.costo_materiales_unidad == null
        ? null
        : Number(costo.costo_materiales_unidad)
      const componentesSinCosto = Number(costo?.items_sin_costo ?? 0)
      const rendimiento = Number(costo?.rendimiento_unidades ?? 0)
      const kgUnitario = rendimiento > 0
        ? Number(costo?.batch_calculado_kg ?? 0) / rendimiento
        : 0
      const completo = costoMaterialesUnitario !== null && componentesSinCosto === 0
      const ventasNetas = movimiento.ventaFacturada - movimiento.valorDevoluciones
      const costoMateriaPrima = costoMateriaPrimaUnitario === null
        ? null
        : movimiento.unidadesDespachadas * costoMateriaPrimaUnitario
      const costoEmpaque = costoEmpaqueUnitario === null
        ? null
        : movimiento.unidadesDespachadas * costoEmpaqueUnitario
      const costoMateriales = costoMaterialesUnitario === null
        ? null
        : movimiento.unidadesDespachadas * costoMaterialesUnitario

      return {
        ...movimiento,
        kgEquivalente: movimiento.unidadesDespachadas * kgUnitario,
        costoMateriaPrimaUnitario,
        costoEmpaqueUnitario,
        componentesSinCosto,
        ventasNetas,
        costoMateriaPrima,
        costoEmpaque,
        costoMateriales,
        manoObraDirecta: 0,
        transporte: 0,
        gastosAsignados: 0,
        contribucion: null,
        margenContribucion: null,
        ebitdaEstimado: null,
        margenEbitda: null,
        completo,
      }
    })

    let costosSinAsignar = 0
    const valorBase = (fila: RentabilidadDetalle, base: BaseDistribucion) => {
      if (base === "UNIDADES") return Math.max(0, fila.unidadesDespachadas)
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
        ? detalle.filter((fila) => fila.clienteId === clienteId)
        : excluirClienteIds?.size
          ? detalle.filter((fila) => !excluirClienteIds.has(fila.clienteId))
          : detalle
      let baseAplicada = base
      let totalBase = candidatas.reduce((total, fila) => total + valorBase(fila, baseAplicada), 0)
      if (totalBase <= 0 && baseAplicada !== "VENTAS_NETAS") {
        baseAplicada = "VENTAS_NETAS"
        totalBase = candidatas.reduce((total, fila) => total + valorBase(fila, baseAplicada), 0)
      }
      if (totalBase <= 0) {
        costosSinAsignar += monto
        return
      }
      candidatas.forEach((fila) => {
        fila[campo] += monto * valorBase(fila, baseAplicada) / totalBase
      })
    }

    const clienteIdsTuti = new Set(
      detalle
        .filter((fila) => normalizar(fila.cliente).includes("TUTI"))
        .map((fila) => fila.clienteId),
    )
    const periodoNominaDesde = `${fechaDesde.slice(0, 7)}-01`
    const periodoNominaHasta = `${fechaHasta.slice(0, 7)}-01`
    nominaMensual.forEach((fila) => {
      if (fila.periodo < periodoNominaDesde || fila.periodo > periodoNominaHasta) return
      const costo = Number(fila.costo_empresa ?? 0)
      if (fila.area === "MANO_OBRA_DIRECTA") {
        asignar(costo, baseRegla("PERSONAL_PRODUCCION", "KG_EQUIVALENTE"), "manoObraDirecta")
      } else if (fila.area === "MANO_OBRA_INDIRECTA") {
        asignar(costo, baseRegla("PERSONAL_PRODUCCION", "KG_EQUIVALENTE"), "gastosAsignados")
      } else if (fila.area === "DISTRIBUCION") {
        asignar(costo, baseRegla("TRANSPORTE", "UNIDADES"), "transporte", null, clienteIdsTuti)
      } else {
        asignar(costo, baseRegla("PERSONAL_ESTRUCTURA", "VENTAS_NETAS"), "gastosAsignados")
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
    const cuentasTransporte = new Set(["6.1.01.2.13.01", "6.1.01.2.13.02"])
    facturas.forEach((factura) => {
      const periodoFactura = factura.periodo_servicio
        ?? (factura.fecha_emision ? `${factura.fecha_emision.slice(0, 7)}-01` : null)
      if (
        factura.estado === "ANULADA"
        || !periodoFactura
        || periodoFactura < periodoNominaDesde
        || periodoFactura > periodoNominaHasta
        || !factura.impacta_ebitda
        || cuentasPersonal.has(factura.cuenta_codigo)
      ) return
      const monto = Number(factura.subtotal ?? 0)
      const clienteIds = factura.afecta_tipo === "CLIENTE"
        ? factura.cliente_ids?.length
          ? factura.cliente_ids
          : factura.cliente_id
            ? [factura.cliente_id]
            : []
        : []
      const esTransporte = cuentasTransporte.has(factura.cuenta_codigo)
      const campo: CampoAsignado = esTransporte
        ? "transporte"
        : "gastosAsignados"
      const base = esTransporte
        ? baseRegla("TRANSPORTE", "UNIDADES")
        : factura.grupo === "OPERACION"
          ? baseRegla("OPERACION", "KG_EQUIVALENTE")
          : baseRegla("ESTRUCTURA_GENERAL", "VENTAS_NETAS")
      if (clienteIds.length > 0) {
        const montoPorCliente = monto / clienteIds.length
        clienteIds.forEach((clienteId) => asignar(montoPorCliente, base, campo, clienteId))
      } else {
        asignar(monto, base, campo)
      }
    })

    detalle.forEach((fila) => {
      if (!fila.completo || fila.costoMateriales === null) return
      fila.contribucion = fila.ventasNetas
        - fila.costoMateriales
        - fila.manoObraDirecta
        - fila.transporte
      fila.margenContribucion = fila.ventasNetas > 0
        ? fila.contribucion / fila.ventasNetas * 100
        : 0
      fila.ebitdaEstimado = fila.contribucion - fila.gastosAsignados
      fila.margenEbitda = fila.ventasNetas > 0
        ? fila.ebitdaEstimado / fila.ventasNetas * 100
        : 0
    })

    return {
      detalle: detalle.sort(
        (a, b) => (b.ebitdaEstimado ?? -Infinity) - (a.ebitdaEstimado ?? -Infinity),
      ),
      costosSinAsignar,
    }
  }, [
    ventasSemanales,
    devoluciones,
    precios,
    costosReceta,
    nominaMensual,
    facturas,
    reglasDistribucion,
    fechaDesde,
    fechaHasta,
    semanaActualDesde,
    semanaActualHasta,
  ])

  const pagosFinancieros = useMemo(() => {
    type TotalesPago = {
      total: number
      gastoEbitda: number
      inventario: number
      otrasSalidas: number
      pendientes: number
      movimientos: number
    }
    const vacio = (): TotalesPago => ({
      total: 0,
      gastoEbitda: 0,
      inventario: 0,
      otrasSalidas: 0,
      pendientes: 0,
      movimientos: 0,
    })
    const actual = vacio()
    const anterior = vacio()
    const semanas = new Map<string, TotalesPago>()
    semanasEntre(fechaDesde, fechaHasta).forEach((semana) => semanas.set(semana, vacio()))

    const acumular = (destino: TotalesPago, pago: PagoFacturaSemanalDb) => {
      const valor = Number(pago.total_pagado ?? 0)
      destino.total += valor
      destino.movimientos += Number(pago.movimientos ?? 0)
      if (pago.impacta_ebitda) destino.gastoEbitda += valor
      else if (pago.naturaleza === "INVENTARIO") destino.inventario += valor
      else if (pago.naturaleza === "PENDIENTE") destino.pendientes += valor
      else destino.otrasSalidas += valor
    }

    pagosSemanales.forEach((pago) => {
      if (pago.semana_inicio >= semanaActualDesde && pago.semana_inicio <= semanaActualHasta) {
        acumular(actual, pago)
        const semana = semanas.get(pago.semana_inicio)
        if (semana) acumular(semana, pago)
      } else if (
        pago.semana_inicio >= semanaAnteriorDesde &&
        pago.semana_inicio <= semanaAnteriorHasta
      ) {
        acumular(anterior, pago)
      }
    })

    return {
      actual,
      anterior,
      semanas: Array.from(semanas.entries()).map(([semana, totales]) => ({
        semana,
        ...totales,
      })),
    }
  }, [
    pagosSemanales,
    fechaDesde,
    fechaHasta,
    semanaActualDesde,
    semanaActualHasta,
    semanaAnteriorDesde,
    semanaAnteriorHasta,
  ])

  const costosGastosFinancieros = useMemo<ReporteCostosGastos>(() => {
    type Periodo = "actual" | "anterior"
    type CuentaAcumulada = Omit<CuentaCostoGasto, "proveedoresActual"> & {
      proveedores: Set<string>
    }
    const totalesVacios = () => ({
      gastoEbitda: 0,
      inventario: 0,
      pendientes: 0,
      facturas: 0,
    })
    const totales = {
      actual: totalesVacios(),
      anterior: totalesVacios(),
    }
    const rubros = new Map<string, RubroCostoGasto>()
    const cuentas = new Map<string, CuentaAcumulada>()

    const clasificar = (factura: FacturaDetalleDb) => {
      if (
        factura.naturaleza === "PENDIENTE" ||
        factura.estado_clasificacion === "PENDIENTE"
      ) {
        return { id: "PENDIENTE", etiqueta: "Por clasificar", tipo: "PENDIENTE" as const }
      }
      if (factura.naturaleza === "INVENTARIO") {
        return {
          id: "INVENTARIO",
          etiqueta: "Materias primas e inventario",
          tipo: "INVENTARIO" as const,
        }
      }
      if (!factura.impacta_ebitda) return null

      const etiquetas: Record<string, string> = {
        PERSONAL: "Personal",
        OPERACION: "Operación y producción",
        ADMINISTRACION: "Administración",
        COMERCIAL: "Comercial y ventas",
        OTROS: "Otros gastos EBITDA",
      }
      const id = etiquetas[factura.grupo] ? factura.grupo : "OTROS"
      return { id, etiqueta: etiquetas[id], tipo: "EBITDA" as const }
    }

    const periodoDe = (fecha: string): Periodo | null => {
      if (fecha >= fechaDesde && fecha <= fechaHasta) return "actual"
      if (fecha >= periodoAnterior.desde && fecha <= periodoAnterior.hasta) return "anterior"
      return null
    }

    facturas.forEach((factura) => {
      if (!factura.fecha_emision || factura.estado === "ANULADA") return
      const periodo = periodoDe(factura.fecha_emision)
      if (!periodo) return
      const categoria = clasificar(factura)
      if (!categoria) return
      const valor = Number(factura.subtotal ?? 0)
      if (!Number.isFinite(valor)) return

      totales[periodo].facturas += 1
      if (categoria.tipo === "EBITDA") totales[periodo].gastoEbitda += valor
      else if (categoria.tipo === "INVENTARIO") totales[periodo].inventario += valor
      else totales[periodo].pendientes += valor

      const rubro = rubros.get(categoria.id) ?? {
        ...categoria,
        actual: 0,
        anterior: 0,
        facturasActual: 0,
        facturasAnterior: 0,
      }
      rubro[periodo] += valor
      if (periodo === "actual") rubro.facturasActual += 1
      else rubro.facturasAnterior += 1
      rubros.set(categoria.id, rubro)

      const codigo = factura.cuenta_codigo || "PENDIENTE"
      const cuenta = cuentas.get(codigo) ?? {
        codigo,
        nombre: factura.cuenta_nombre || "Por clasificar",
        grupo: categoria.etiqueta,
        tipo: categoria.tipo,
        actual: 0,
        anterior: 0,
        facturasActual: 0,
        facturasAnterior: 0,
        proveedores: new Set<string>(),
      }
      cuenta[periodo] += valor
      if (periodo === "actual") {
        cuenta.facturasActual += 1
        cuenta.proveedores.add(factura.proveedor_normalizado || factura.proveedor)
      } else {
        cuenta.facturasAnterior += 1
      }
      cuentas.set(codigo, cuenta)
    })

    return {
      ...totales,
      rubros: Array.from(rubros.values()).sort((a, b) => b.actual - a.actual),
      cuentas: Array.from(cuentas.values())
        .map(({ proveedores, ...cuenta }) => ({
          ...cuenta,
          proveedoresActual: proveedores.size,
        }))
        .sort((a, b) => b.actual - a.actual),
    }
  }, [
    facturas,
    fechaDesde,
    fechaHasta,
    periodoAnterior.desde,
    periodoAnterior.hasta,
  ])

  const nominaFinanciera = useMemo<ReporteNominaFinanciero>(() => {
    type PeriodoNomina = "actual" | "anterior"
    const vacio = () => ({ costo: 0, descuentos: 0, pagoNeto: 0, meses: new Set<string>() })
    const totales = { actual: vacio(), anterior: vacio() }
    const areas = new Map<AreaNomina, { actual: number; anterior: number }>()
    const ventasInternas = { actual: 0, anterior: 0 }
    const ventasExternas = { actual: 0, anterior: 0 }
    const actualDesde = `${fechaDesde.slice(0, 7)}-01`
    const actualHasta = `${fechaHasta.slice(0, 7)}-01`
    const anteriorDesde = `${periodoAnterior.desde.slice(0, 7)}-01`
    const anteriorHasta = `${periodoAnterior.hasta.slice(0, 7)}-01`

    nominaMensual.forEach((fila) => {
      let periodo: PeriodoNomina | null = null
      if (fila.periodo >= actualDesde && fila.periodo <= actualHasta) periodo = "actual"
      else if (fila.periodo >= anteriorDesde && fila.periodo <= anteriorHasta) periodo = "anterior"
      if (!periodo) return

      totales[periodo].costo += Number(fila.costo_empresa ?? 0)
      totales[periodo].descuentos += Number(fila.descuentos ?? 0)
      totales[periodo].pagoNeto += Number(fila.pago_neto_rol ?? 0)
      totales[periodo].meses.add(fila.periodo)
      const area = areas.get(fila.area) ?? { actual: 0, anterior: 0 }
      area[periodo] += Number(fila.costo_empresa ?? 0)
      areas.set(fila.area, area)
      if (fila.area === "VENTAS") {
        ventasInternas[periodo] += Number(fila.costo_empresa ?? 0)
      }
    })

    facturas.forEach((factura) => {
      if (
        factura.cuenta_codigo !== "SERV-VTA-EXT"
        || !factura.fecha_emision
        || factura.estado === "ANULADA"
      ) return
      if (factura.fecha_emision >= fechaDesde && factura.fecha_emision <= fechaHasta) {
        ventasExternas.actual += Number(factura.subtotal ?? 0)
      } else if (
        factura.fecha_emision >= periodoAnterior.desde
        && factura.fecha_emision <= periodoAnterior.hasta
      ) {
        ventasExternas.anterior += Number(factura.subtotal ?? 0)
      }
    })

    return {
      actual: {
        costo: totales.actual.costo,
        descuentos: totales.actual.descuentos,
        pagoNeto: totales.actual.pagoNeto,
        meses: totales.actual.meses.size,
      },
      anterior: {
        costo: totales.anterior.costo,
        descuentos: totales.anterior.descuentos,
        pagoNeto: totales.anterior.pagoNeto,
        meses: totales.anterior.meses.size,
      },
      areas: Array.from(areas.entries())
        .map(([area, valores]) => ({ area, ...valores }))
        .sort((a, b) => b.actual - a.actual),
      equipoVentas: {
        actual: {
          nominaInterna: ventasInternas.actual,
          serviciosExternos: ventasExternas.actual,
          total: ventasInternas.actual + ventasExternas.actual,
        },
        anterior: {
          nominaInterna: ventasInternas.anterior,
          serviciosExternos: ventasExternas.anterior,
          total: ventasInternas.anterior + ventasExternas.anterior,
        },
      },
    }
  }, [
    nominaMensual,
    facturas,
    fechaDesde,
    fechaHasta,
    periodoAnterior.desde,
    periodoAnterior.hasta,
  ])

  const balanceFinanciero = useMemo(() => {
    type TotalesBalance = {
      disponible: boolean
      meses: number
      ingresos: number
      ebitda: number
      resultado: number
      margenEbitda: number
    }
    const acumular = (desde: string, hasta: string): TotalesBalance => {
      const mesDesde = `${desde.slice(0, 7)}-01`
      const mesHasta = `${hasta.slice(0, 7)}-01`
      const filas = resultadosMensuales.filter(
        (resultado) => resultado.periodo >= mesDesde && resultado.periodo <= mesHasta,
      )
      const ingresos = filas.reduce((total, fila) => total + Number(fila.ventas_netas ?? 0), 0)
      const ebitda = filas.reduce((total, fila) => total + Number(fila.ebitda_estimado ?? 0), 0)
      const resultado = filas.reduce((total, fila) => total + Number(fila.resultado_ejercicio ?? 0), 0)
      return {
        disponible: filas.length > 0,
        meses: filas.length,
        ingresos,
        ebitda,
        resultado,
        margenEbitda: ingresos > 0 ? ebitda / ingresos * 100 : 0,
      }
    }
    return {
      actual: acumular(fechaDesde, fechaHasta),
      anterior: acumular(periodoAnterior.desde, periodoAnterior.hasta),
    }
  }, [
    resultadosMensuales,
    fechaDesde,
    fechaHasta,
    periodoAnterior.desde,
    periodoAnterior.hasta,
  ])

  const periodoTexto = `${textoPeriodo(fechaDesde, fechaHasta)} vs. ${textoPeriodo(
    periodoAnterior.desde,
    periodoAnterior.hasta,
  )}`
  const propsDashboardDevoluciones = {
    ventas: ventasSemanales,
    ventasDiarias,
    devoluciones,
    productos: productosDevolucion,
    cargando,
    cambiarPantalla,
    fechaDesde,
    fechaHasta,
    agrupacion: agrupacionDashboard,
  }

  return (
    <main className="wall-dashboard">
      <style>{css}</style>

      <header className="wall-header">
        <div>
          <span className="wall-kicker">CIBUSPAN ONE · CENTRO DE CONTROL</span>
          <h1>Dashboard ejecutivo</h1>
          <p>Orden, datos y ejecución rentable.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (tabActiva === "costos_gastos") {
              window.dispatchEvent(new Event("cibuspan-costos-refresh"))
              return
            }
            void cargar(fechaDesde, fechaHasta, tabActiva, true)
          }}
          disabled={cargando}
        >
          {cargando ? "Actualizando…" : "Actualizar datos"}
        </button>
      </header>

      <nav className="dashboard-tabs" aria-label="Dashboards de Cibuspan One">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tabActiva === tab.id ? "active" : ""}
            onClick={() => setTabActiva(tab.id)}
            aria-pressed={tabActiva === tab.id}
          >
            <span>{tab.icono}</span>
            {tab.etiqueta}
          </button>
        ))}
      </nav>

      {tabActiva !== "costos_gastos" && (
      <section className="dashboard-period-filter">
        <div className="dashboard-period-buttons">
          <span>Vista por periodo</span>
          <section>
            {[
              ["MES", "Mes"],
              ["TRIMESTRE", "Trimestre"],
              ["SEMESTRE", "Semestre"],
              ["ANIO", "Año"],
            ].map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                className={periodoRapido === valor ? "active" : ""}
                onClick={() => void cambiarPeriodoRapido(valor)}
                disabled={cargando}
              >
                {etiqueta}
              </button>
            ))}
          </section>
        </div>
        <label>
          Mes específico
          <input
            type="month"
            value={mesEspecifico}
            max={fechaFinalInicial.slice(0, 7)}
            disabled={cargando}
            onChange={(evento) => void cambiarMesEspecifico(evento.target.value)}
          />
        </label>
        <label>
          Mostrar datos por
          <select
            value={agrupacionDashboard}
            onChange={(evento) =>
              setAgrupacionDashboard(evento.target.value as AgrupacionDashboard)
            }
          >
            {(AGRUPACIONES_POR_PERIODO[periodoRapido] ??
              AGRUPACIONES_POR_PERIODO.PERSONALIZADO
            ).map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input
            type="date"
            value={fechaDesdeFiltro}
            max={fechaHastaFiltro}
            onChange={(evento) => {
              setFechaDesdeFiltro(evento.target.value)
              setPeriodoRapido("PERSONALIZADO")
              setMesEspecifico("")
            }}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={fechaHastaFiltro}
            min={fechaDesdeFiltro}
            onChange={(evento) => {
              setFechaHastaFiltro(evento.target.value)
              setPeriodoRapido("PERSONALIZADO")
              setMesEspecifico("")
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => void aplicarPeriodo(fechaDesdeFiltro, fechaHastaFiltro)}
          disabled={cargando}
        >
          Aplicar
        </button>
        <div className="dashboard-period-comparison">
          <span>Rango aplicado al gráfico</span>
          <strong>{textoPeriodo(fechaDesde, fechaHasta)}</strong>
          <small>
            Periodo anterior de comparación: {textoPeriodo(
              periodoAnterior.desde,
              periodoAnterior.hasta,
            )}
          </small>
        </div>
      </section>
      )}

      {error && <div className="wall-error">{error}</div>}

      {tabActiva === "ejecutivo" && (
        <DashboardEjecutivo
          totales={totales}
          tasaActual={tasaActual}
          tasaAnterior={tasaAnterior}
          produccionHoy={produccionHoy}
          stockDisponible={stockDisponible}
          periodoTexto={periodoTexto}
        />
      )}

      {tabActiva === "comercial" && (
        <DashboardPilotoPanel
          ventas={ventasDiarias}
          devoluciones={devoluciones}
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
          agrupacion={agrupacionDashboard}
        />
      )}

      {tabActiva === "devoluciones" && (
        <DashboardDevolucionesPanel {...propsDashboardDevoluciones} />
      )}

      {tabActiva === "produccion" && (
        <DashboardProduccion
          produccionHoy={produccionHoy}
          ordenesHoy={ordenesHoy}
          produccionSemanal={produccionSemanal}
          totalPeriodo={totalProduccionPeriodo}
          resumenSku={resumenSku}
          totales={totales}
          periodoTexto={periodoTexto}
        />
      )}

      {tabActiva === "inventario" && (
        <DashboardInventario stockDisponible={stockDisponible} />
      )}

      {tabActiva === "financiero" && (
        <DashboardFinanciero
          rentabilidadDetalle={rentabilidadCalculo.detalle}
          costosSinAsignar={rentabilidadCalculo.costosSinAsignar}
          reglasDistribucion={reglasDistribucion}
          guardarReglas={actualizarReglasRentabilidad}
          avisoRentabilidad={avisoRentabilidad}
          avisoFinanciero={avisoFinanciero}
          costosGastos={costosGastosFinancieros}
          nomina={nominaFinanciera}
          pagos={pagosFinancieros}
          balance={balanceFinanciero}
          cambiarPantalla={cambiarPantalla}
        />
      )}

      {tabActiva === "costos_gastos" && (
        <DashboardCostosGastosPanel cambiarPantalla={cambiarPantalla} />
      )}

      {tabActiva === "rentabilidad_piloto" && (
        <DashboardRentabilidadPilotoPanel
          detalle={rentabilidadCalculo.detalle}
          ventas={ventasDiarias}
          devoluciones={devoluciones}
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
          agrupacion={agrupacionDashboard}
          costosSinAsignar={rentabilidadCalculo.costosSinAsignar}
          aviso={avisoRentabilidad}
        />
      )}
    </main>
  )
}

type TotalesSemanales = {
  despachosActual: number
  despachosAnterior: number
  devolucionesActual: number
  devolucionesAnterior: number
}

function EncabezadoDashboard({
  kicker,
  titulo,
  descripcion,
}: {
  kicker: string
  titulo: string
  descripcion: string
}) {
  return (
    <div className="dashboard-title">
      <span>{kicker}</span>
      <h2>{titulo}</h2>
      <p>{descripcion}</p>
    </div>
  )
}

function DashboardEjecutivo({
  totales,
  tasaActual,
  tasaAnterior,
  produccionHoy,
  stockDisponible,
  periodoTexto,
}: {
  totales: TotalesSemanales
  tasaActual: number
  tasaAnterior: number
  produccionHoy: number
  stockDisponible: number
  periodoTexto: string
}) {
  return (
    <section className="dashboard-view">
      <EncabezadoDashboard
        kicker="VISIÓN GENERAL"
        titulo="Resumen ejecutivo"
        descripcion="Los indicadores esenciales para decidir dónde actuar primero."
      />

      <div className="executive-finance-grid">
        <IndicadorPendiente titulo="Rentabilidad operativa" />
        <IndicadorPendiente titulo="EBITDA" />
        <IndicadorPendiente titulo="Margen comercial" />
        <IndicadorPendiente titulo="Flujo de caja operativo" />
      </div>

      <div className="wall-section-head compact">
        <div><span>PULSO DEL NEGOCIO</span><h2>{periodoTexto}</h2></div>
      </div>
      <section className="market-strip">
        <ResumenMercado etiqueta="Despachados" actual={totales.despachosActual} anterior={totales.despachosAnterior} mejorCuandoSube />
        <ResumenMercado etiqueta="Devueltos" actual={totales.devolucionesActual} anterior={totales.devolucionesAnterior} mejorCuandoSube={false} />
        <ResumenMercado etiqueta="Tasa de devolución" actual={tasaActual} anterior={tasaAnterior} mejorCuandoSube={false} porcentaje />
        <article className="market-summary neutral"><span>Meta devolución</span><strong>≤ 8%</strong><small className={tasaActual <= 8 ? "positive" : "negative"}>{tasaActual <= 8 ? "● Dentro de meta" : "● Requiere atención"}</small></article>
      </section>

      <section className="operation-ticker" aria-label="Operación de hoy">
        <span>OPERACIÓN HOY</span>
        <div><small>Producción</small><strong>{numero(produccionHoy)} Unid.</strong></div>
        <div><small>Stock libre</small><strong>{numero(stockDisponible)} Unid.</strong></div>
        <i className="online">● Datos operativos conectados</i>
      </section>
    </section>
  )
}

type RankingVentaDashboard = {
  id: string
  nombre: string
  secundario: string
  ventaActual: number
  ventaAnterior: number
  unidadesActual: number
}

function numeroSemanaIso(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setHours(0, 0, 0, 0)
  fecha.setDate(fecha.getDate() + 3 - ((fecha.getDay() + 6) % 7))
  const primerJueves = new Date(fecha.getFullYear(), 0, 4)
  return 1 + Math.round(
    ((fecha.getTime() - primerJueves.getTime()) / 86400000 -
      3 +
      ((primerJueves.getDay() + 6) % 7)) /
      7,
  )
}

function etiquetaEjeSemana(fechaIso: string) {
  return `Sem. ${String(numeroSemanaIso(fechaIso)).padStart(2, "0")}`
}

function diasEntre(desde: string, hasta: string) {
  const inicio = new Date(`${desde}T12:00:00`).getTime()
  const fin = new Date(`${hasta}T12:00:00`).getTime()
  return Math.max(1, Math.round((fin - inicio) / 86400000) + 1)
}

function periodoAnteriorEquivalente(desde: string, hasta: string) {
  const inicio = new Date(`${desde}T12:00:00`)
  const fin = new Date(`${hasta}T12:00:00`)
  const finEsUltimoDiaMes =
    fin.getDate() ===
    new Date(fin.getFullYear(), fin.getMonth() + 1, 0).getDate()

  const esAnioCompleto =
    inicio.getMonth() === 0 &&
    inicio.getDate() === 1 &&
    fin.getMonth() === 11 &&
    finEsUltimoDiaMes &&
    inicio.getFullYear() === fin.getFullYear()
  if (esAnioCompleto) {
    const anio = inicio.getFullYear() - 1
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
  }

  const esTrimestreCompleto =
    inicio.getDate() === 1 &&
    inicio.getMonth() % 3 === 0 &&
    finEsUltimoDiaMes &&
    inicio.getFullYear() === fin.getFullYear() &&
    fin.getMonth() === inicio.getMonth() + 2
  if (esTrimestreCompleto) {
    const finAnterior = new Date(inicio.getFullYear(), inicio.getMonth(), 0)
    const inicioAnterior = new Date(
      finAnterior.getFullYear(),
      finAnterior.getMonth() - 2,
      1,
    )
    return {
      desde: fechaIsoLocal(inicioAnterior),
      hasta: fechaIsoLocal(finAnterior),
    }
  }

  const esMesCompleto =
    inicio.getDate() === 1 &&
    finEsUltimoDiaMes &&
    inicio.getFullYear() === fin.getFullYear() &&
    inicio.getMonth() === fin.getMonth()
  if (esMesCompleto) {
    const finAnterior = new Date(inicio.getFullYear(), inicio.getMonth(), 0)
    return {
      desde: fechaIsoLocal(
        new Date(finAnterior.getFullYear(), finAnterior.getMonth(), 1),
      ),
      hasta: fechaIsoLocal(finAnterior),
    }
  }

  const dias = diasEntre(desde, hasta)
  const anteriorHasta = sumarDias(desde, -1)
  return {
    desde: sumarDias(anteriorHasta, -(dias - 1)),
    hasta: anteriorHasta,
  }
}

function semanasEntre(desde: string, hasta: string) {
  const semanas: string[] = []
  let actual = inicioSemana(desde)
  const ultima = inicioSemana(hasta)
  while (actual <= ultima) {
    semanas.push(actual)
    actual = sumarDias(actual, 7)
  }
  return semanas
}

function textoPeriodo(desde: string, hasta: string) {
  return `${fechaCorta(desde)}–${fechaCorta(hasta)}`
}

function DashboardComercial({
  ventas,
  devoluciones,
  aviso,
  fechaDesde,
  fechaHasta,
  anteriorDesde,
  anteriorHasta,
}: {
  ventas: VentaSemanalDb[]
  devoluciones: DevolucionListadoDb[]
  aviso: string
  fechaDesde: string
  fechaHasta: string
  anteriorDesde: string
  anteriorHasta: string
}) {
  const resumen = useMemo(() => {
    const actualSemanaDesde = inicioSemana(fechaDesde)
    const actualSemanaHasta = inicioSemana(fechaHasta)
    const anteriorSemanaDesde = inicioSemana(anteriorDesde)
    const anteriorSemanaHasta = inicioSemana(anteriorHasta)
    const actuales = ventas.filter(
      (item) =>
        item.semana_inicio >= actualSemanaDesde &&
        item.semana_inicio <= actualSemanaHasta,
    )
    const anteriores = ventas.filter(
      (item) =>
        item.semana_inicio >= anteriorSemanaDesde &&
        item.semana_inicio <= anteriorSemanaHasta,
    )

    const sumar = (filas: VentaSemanalDb[]) => ({
      venta: filas.reduce(
        (total, item) => total + Number(item.venta_sin_impuestos ?? 0),
        0,
      ),
      unidades: filas.reduce(
        (total, item) => total + Number(item.unidades ?? 0),
        0,
      ),
      clientes: new Set(filas.map((item) => item.cliente_nombre)).size,
      skus: new Set(filas.map((item) => item.sku)).size,
    })

    const totalesActuales = sumar(actuales)
    const totalesAnteriores = sumar(anteriores)

    const sumarDevoluciones = (desde: string, hasta: string) => {
      return devoluciones.reduce(
        (total, devolucion) => {
          if (
            devolucion.fecha_devolucion < desde ||
            devolucion.fecha_devolucion > hasta
          ) return total
          total.documentos += 1
          total.valor += Number(devolucion.valor_total_documento ?? 0)
          ;(devolucion.detalles ?? []).forEach((detalle) => {
            total.unidades += Number(detalle.unidades ?? 0)
          })
          return total
        },
        { unidades: 0, valor: 0, documentos: 0 },
      )
    }

    const devolucionesActuales = sumarDevoluciones(fechaDesde, fechaHasta)
    const devolucionesAnteriores = sumarDevoluciones(anteriorDesde, anteriorHasta)

    const ranking = (
      modo: "CLIENTE" | "SKU",
    ): RankingVentaDashboard[] => {
      const mapa = new Map<string, RankingVentaDashboard>()

      const acumular = (filas: VentaSemanalDb[], esActual: boolean) => {
        filas.forEach((item) => {
          const id = modo === "CLIENTE" ? item.cliente_nombre : item.sku
          const existente = mapa.get(id) ?? {
            id,
            nombre:
              modo === "CLIENTE" ? item.cliente_nombre : item.producto_nombre,
            secundario: modo === "CLIENTE" ? "Cliente" : item.sku,
            ventaActual: 0,
            ventaAnterior: 0,
            unidadesActual: 0,
          }
          if (esActual) {
            existente.ventaActual += Number(item.venta_sin_impuestos ?? 0)
            existente.unidadesActual += Number(item.unidades ?? 0)
          } else {
            existente.ventaAnterior += Number(item.venta_sin_impuestos ?? 0)
          }
          mapa.set(id, existente)
        })
      }

      acumular(actuales, true)
      acumular(anteriores, false)
      return Array.from(mapa.values())
        .filter((item) => item.ventaActual !== 0)
        .sort((a, b) => b.ventaActual - a.ventaActual)
        .slice(0, 6)
    }

    const serie = semanasEntre(fechaDesde, fechaHasta).map((semana, indice, lista) => {
      const venta = ventas
        .filter((item) => item.semana_inicio === semana)
        .reduce(
          (total, item) => total + Number(item.venta_sin_impuestos ?? 0),
          0,
        )
      const semanaPrevia = lista[indice - 1]
      const anterior = semanaPrevia
        ? ventas
            .filter((item) => item.semana_inicio === semanaPrevia)
            .reduce(
              (total, item) =>
                total + Number(item.venta_sin_impuestos ?? 0),
              0,
            )
        : venta
      return { semana, venta, anterior }
    })

    return {
      actuales: totalesActuales,
      anteriores: totalesAnteriores,
      devolucionesActuales,
      devolucionesAnteriores,
      clientes: ranking("CLIENTE"),
      skus: ranking("SKU"),
      serie,
    }
  }, [ventas, devoluciones, fechaDesde, fechaHasta, anteriorDesde, anteriorHasta])

  const maxVenta = Math.max(1, ...resumen.serie.map((item) => item.venta))
  const periodo = `${textoPeriodo(fechaDesde, fechaHasta)} vs. ${textoPeriodo(
    anteriorDesde,
    anteriorHasta,
  )}`

  return (
    <section className="dashboard-view">
      <EncabezadoDashboard
        kicker="FACTURACIÓN REAL"
        titulo="Comercial y clientes"
        descripcion={`${periodo}. Datos tomados del reporte de ventas importado.`}
      />

      {aviso && <div className="wall-error">{aviso}</div>}

      {ventas.length === 0 ? (
        <div className="wall-empty">
          Importa el reporte de ventas desde Reportes para activar los
          indicadores comerciales.
        </div>
      ) : (
        <>
          <section className="market-strip commercial-strip">
            <ResumenMercado
              etiqueta="Facturación sin impuestos"
              actual={resumen.actuales.venta}
              anterior={resumen.anteriores.venta}
              mejorCuandoSube
              monedaValor
            />
            <ResumenMercado
              etiqueta="Unidades facturadas"
              actual={resumen.actuales.unidades}
              anterior={resumen.anteriores.unidades}
              mejorCuandoSube
            />
            <ResumenMercado
              etiqueta="Clientes activos"
              actual={resumen.actuales.clientes}
              anterior={resumen.anteriores.clientes}
              mejorCuandoSube
            />
            <ResumenMercado
              etiqueta="SKU facturados"
              actual={resumen.actuales.skus}
              anterior={resumen.anteriores.skus}
              mejorCuandoSube
            />
          </section>

          <div className="wall-section-head compact commercial-returns-title">
            <div>
              <span>DEVOLUCIONES RECIBIDAS</span>
              <h2>{periodo}</h2>
            </div>
          </div>
          <section className="market-strip commercial-returns-strip">
            <ResumenMercado
              etiqueta="Valor devuelto recibido"
              actual={resumen.devolucionesActuales.valor}
              anterior={resumen.devolucionesAnteriores.valor}
              mejorCuandoSube={false}
              monedaValor
            />
            <ResumenMercado
              etiqueta="Unidades devueltas recibidas"
              actual={resumen.devolucionesActuales.unidades}
              anterior={resumen.devolucionesAnteriores.unidades}
              mejorCuandoSube={false}
            />
            <ResumenMercado
              etiqueta="Documentos recibidos"
              actual={resumen.devolucionesActuales.documentos}
              anterior={resumen.devolucionesAnteriores.documentos}
              mejorCuandoSube={false}
            />
            <ResumenMercado
              etiqueta="Valor promedio por unidad"
              actual={resumen.devolucionesActuales.unidades > 0
                ? resumen.devolucionesActuales.valor /
                  resumen.devolucionesActuales.unidades
                : 0}
              anterior={resumen.devolucionesAnteriores.unidades > 0
                ? resumen.devolucionesAnteriores.valor /
                  resumen.devolucionesAnteriores.unidades
                : 0}
              mejorCuandoSube={false}
              monedaValor
            />
          </section>

          <section className="sales-pulse-panel">
            <div className="wall-section-head">
              <div>
                <span>TENDENCIA COMERCIAL</span>
                <h2>Facturación semanal del periodo seleccionado</h2>
              </div>
              <small>Sin impuestos</small>
            </div>
            <div className="sales-week-bars">
              {resumen.serie.map((item) => (
                <article key={item.semana}>
                  <span>{etiquetaEjeSemana(item.semana)}</span>
                  <div>
                    <i style={{ width: `${(item.venta / maxVenta) * 100}%` }} />
                  </div>
                  <strong>{moneda(item.venta)}</strong>
                  <Tendencia
                    actual={item.venta}
                    anterior={item.anterior}
                    mejorCuandoSube
                  />
                </article>
              ))}
            </div>
          </section>

          <div className="commercial-columns">
            <RankingVentasDashboard
              titulo="Clientes con mayor facturación"
              kicker="CLIENTES"
              filas={resumen.clientes}
            />
            <RankingVentasDashboard
              titulo="SKU con mayor facturación"
              kicker="PORTAFOLIO"
              filas={resumen.skus}
              mostrarUnidades
            />
          </div>
        </>
      )}
    </section>
  )
}

function RankingVentasDashboard({
  titulo,
  kicker,
  filas,
  mostrarUnidades = false,
}: {
  titulo: string
  kicker: string
  filas: RankingVentaDashboard[]
  mostrarUnidades?: boolean
}) {
  return (
    <section>
      <div className="wall-section-head">
        <div><span>{kicker}</span><h2>{titulo}</h2></div>
        <small>Top 6 · periodo seleccionado</small>
      </div>
      <div className="commercial-ranking">
        {filas.map((fila, indice) => (
          <article key={fila.id}>
            <b>{String(indice + 1).padStart(2, "0")}</b>
            <div><span>{fila.secundario}</span><strong>{fila.nombre}</strong></div>
            <em>
              {moneda(fila.ventaActual)}
              {mostrarUnidades && <small>{numero(fila.unidadesActual)} Unid.</small>}
            </em>
            <Tendencia actual={fila.ventaActual} anterior={fila.ventaAnterior} mejorCuandoSube />
          </article>
        ))}
      </div>
    </section>
  )
}

type FilaRentabilidadAgrupada = {
  id: string
  nombre: string
  secundario: string
  unidadesDespachadas: number
  unidadesDevueltas: number
  ventasNetas: number
  costoMateriaPrima: number | null
  costoEmpaque: number | null
  costoMateriales: number | null
  manoObraDirecta: number
  transporte: number
  gastosAsignados: number
  contribucion: number | null
  margenContribucion: number | null
  ebitdaEstimado: number | null
  margenEbitda: number | null
  completo: boolean
  pendientes: number
}

function agruparRentabilidad(
  detalle: RentabilidadDetalle[],
  vista: "CLIENTE" | "SKU",
) {
  const mapa = new Map<
    string,
    Omit<FilaRentabilidadAgrupada, "margenContribucion" | "margenEbitda">
  >()

  detalle.forEach((fila) => {
    const id = vista === "CLIENTE" ? fila.clienteId : fila.productoId
    const existente = mapa.get(id)
    const ventasNetas = fila.ventasNetas
    const costoMateriaPrima = fila.costoMateriaPrima ?? 0
    const costoEmpaque = fila.costoEmpaque ?? 0
    const costoMateriales = fila.costoMateriales ?? 0
    const contribucion = fila.contribucion ?? 0
    const ebitdaEstimado = fila.ebitdaEstimado ?? 0

    if (existente) {
      existente.unidadesDespachadas += fila.unidadesDespachadas
      existente.unidadesDevueltas += fila.unidadesDevueltas
      existente.ventasNetas += ventasNetas
      existente.costoMateriaPrima =
        (existente.costoMateriaPrima ?? 0) + costoMateriaPrima
      existente.costoEmpaque = (existente.costoEmpaque ?? 0) + costoEmpaque
      existente.costoMateriales = (existente.costoMateriales ?? 0) + costoMateriales
      existente.manoObraDirecta += fila.manoObraDirecta
      existente.transporte += fila.transporte
      existente.gastosAsignados += fila.gastosAsignados
      existente.contribucion = (existente.contribucion ?? 0) + contribucion
      existente.ebitdaEstimado = (existente.ebitdaEstimado ?? 0) + ebitdaEstimado
      existente.completo = existente.completo && fila.completo
      if (!fila.completo) existente.pendientes += 1
      return
    }

    mapa.set(id, {
      id,
      nombre: vista === "CLIENTE" ? fila.cliente : fila.sku,
      secundario: vista === "CLIENTE" ? "Cliente" : fila.codigo,
      unidadesDespachadas: fila.unidadesDespachadas,
      unidadesDevueltas: fila.unidadesDevueltas,
      ventasNetas,
      costoMateriaPrima,
      costoEmpaque,
      costoMateriales,
      manoObraDirecta: fila.manoObraDirecta,
      transporte: fila.transporte,
      gastosAsignados: fila.gastosAsignados,
      contribucion,
      ebitdaEstimado,
      completo: fila.completo,
      pendientes: fila.completo ? 0 : 1,
    })
  })

  return Array.from(mapa.values())
    .map((fila) => {
      if (!fila.completo) {
        return {
          ...fila,
          costoMateriaPrima: null,
          costoEmpaque: null,
          costoMateriales: null,
          contribucion: null,
          margenContribucion: null,
          ebitdaEstimado: null,
          margenEbitda: null,
        }
      }

      const margenContribucion = fila.contribucion !== null && fila.ventasNetas > 0
          ? (fila.contribucion / fila.ventasNetas) * 100
          : 0
      const margenEbitda = fila.ebitdaEstimado !== null && fila.ventasNetas > 0
          ? (fila.ebitdaEstimado / fila.ventasNetas) * 100
          : 0

      return { ...fila, margenContribucion, margenEbitda }
    })
    .sort(
      (a, b) =>
        (b.ebitdaEstimado ?? -Infinity) -
        (a.ebitdaEstimado ?? -Infinity),
    )
}

function RentabilidadPanel({
  detalle,
  costosSinAsignar,
  reglas,
  onGuardarReglas,
  aviso,
}: {
  detalle: RentabilidadDetalle[]
  costosSinAsignar: number
  reglas: ReglaDistribucionDb[]
  onGuardarReglas: (reglas: ReglaDistribucionDb[]) => Promise<void>
  aviso: string
}) {
  const [vista, setVista] = useState<"CLIENTE" | "SKU" | "REGLAS">("CLIENTE")
  const [reglasEdicion, setReglasEdicion] = useState(reglas)
  const [guardandoReglas, setGuardandoReglas] = useState(false)
  const [mensajeReglas, setMensajeReglas] = useState("")
  useEffect(() => setReglasEdicion(reglas), [reglas])
  const filas = useMemo(
    () => agruparRentabilidad(detalle, vista === "SKU" ? "SKU" : "CLIENTE"),
    [detalle, vista],
  )
  const completas = filas.filter((fila) => fila.completo)
  const ventasNetas = completas.reduce(
    (total, fila) => total + fila.ventasNetas,
    0,
  )
  const contribucion = completas.reduce(
    (total, fila) => total + Number(fila.contribucion ?? 0),
    0,
  )
  const ebitda = completas.reduce(
    (total, fila) => total + Number(fila.ebitdaEstimado ?? 0),
    0,
  )
  const margenContribucion = ventasNetas > 0 ? contribucion / ventasNetas * 100 : 0
  const margenEbitda = ventasNetas > 0 ? ebitda / ventasNetas * 100 : 0
  const pendientes = filas.filter((fila) => !fila.completo).length

  function cambiarRegla(codigo: string, base: BaseDistribucion) {
    setMensajeReglas("")
    setReglasEdicion((actuales) => actuales.map((regla) =>
      regla.codigo === codigo ? { ...regla, base_distribucion: base } : regla,
    ))
  }

  async function guardarReglas() {
    setGuardandoReglas(true)
    setMensajeReglas("")
    try {
      await onGuardarReglas(reglasEdicion)
      setMensajeReglas("Reglas guardadas. La rentabilidad fue recalculada.")
    } catch (err) {
      setMensajeReglas(err instanceof Error ? err.message : "No se pudieron guardar las reglas.")
    } finally {
      setGuardandoReglas(false)
    }
  }

  return (
    <section className="profitability-panel">
      <header>
        <div>
          <span>RENTABILIDAD COMERCIAL</span>
          <h2>Rentabilidad por cliente y SKU</h2>
          <p>
            Ventas reales, devoluciones atribuidas, materiales, personal,
            transporte y gastos distribuidos.
          </p>
        </div>
        <div className="profitability-switch">
          <button type="button" className={vista === "CLIENTE" ? "active" : ""} onClick={() => setVista("CLIENTE")}>Por cliente</button>
          <button type="button" className={vista === "SKU" ? "active" : ""} onClick={() => setVista("SKU")}>Por SKU</button>
          <button type="button" className={vista === "REGLAS" ? "active" : ""} onClick={() => setVista("REGLAS")}>Reglas</button>
        </div>
      </header>

      {(aviso || pendientes > 0 || costosSinAsignar > 0) && (
        <div className="profitability-warning">
          <b>Información pendiente:</b>{" "}
          {aviso || (costosSinAsignar > 0
            ? `${moneda(costosSinAsignar)} no pudieron distribuirse porque no existe una base de venta para el periodo.`
            : `${pendientes} ${vista === "CLIENTE" ? "clientes" : "SKU"} todavía no tienen el costo completo de materiales.`)}
        </div>
      )}

      {vista === "REGLAS" ? (
        <section className="profitability-rules">
          <div className="profitability-rules-intro">
            <h3>Reglas de distribución</h3>
            <p>Los costos asignados directamente a un cliente permanecen en ese cliente. Estas bases reparten únicamente los costos compartidos y luego los distribuyen entre sus SKU.</p>
          </div>
          <div className="profitability-rules-grid">
            {reglasEdicion.map((regla) => (
              <label key={regla.codigo}>
                <span>{regla.nombre}</span>
                <small>{regla.descripcion}</small>
                <select
                  value={regla.base_distribucion}
                  onChange={(evento) => cambiarRegla(regla.codigo, evento.target.value as BaseDistribucion)}
                >
                  <option value="VENTAS_NETAS">Ventas netas</option>
                  <option value="UNIDADES">Unidades vendidas</option>
                  <option value="KG_EQUIVALENTE">Kg equivalentes</option>
                </select>
              </label>
            ))}
          </div>
          <div className="profitability-rules-actions">
            {mensajeReglas && <span>{mensajeReglas}</span>}
            <button type="button" onClick={() => void guardarReglas()} disabled={guardandoReglas}>
              {guardandoReglas ? "Guardando…" : "Guardar y recalcular"}
            </button>
          </div>
        </section>
      ) : <>
        <div className="profitability-kpis">
          <article><span>Ventas netas</span><strong>{completas.length > 0 ? moneda(ventasNetas) : "—"}</strong><small>facturación menos devoluciones</small></article>
          <article><span>Margen contribución</span><strong>{completas.length > 0 ? `${margenContribucion.toFixed(1)}%` : "—"}</strong><small>después de materiales, MOD y transporte</small></article>
          <article><span>EBITDA estimado</span><strong>{completas.length > 0 ? moneda(ebitda) : "—"}</strong><small>después de gastos distribuidos</small></article>
          <article className={ebitda >= 0 ? "ready" : "pending"}><span>Margen EBITDA estimado</span><strong>{completas.length > 0 ? `${margenEbitda.toFixed(1)}%` : "—"}</strong><small>indicador gerencial, no contable</small></article>
        </div>

        {filas.length === 0 ? (
        <div className="wall-empty">No existen movimientos para calcular rentabilidad en esta semana.</div>
      ) : (
        <div className="profitability-table-wrap">
          <table className="profitability-table">
            <thead><tr><th>{vista === "CLIENTE" ? "Cliente" : "SKU"}</th><th>Ventas netas</th><th>Materiales</th><th>MOD</th><th>Transporte</th><th>Contribución</th><th>Gastos asignados</th><th>EBITDA est.</th><th>Margen EBITDA</th><th>Estado</th></tr></thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.id}>
                  <td data-label={vista === "CLIENTE" ? "Cliente" : "SKU"}><strong>{fila.nombre}</strong><small>{numero(fila.unidadesDespachadas)} vendidas · {numero(fila.unidadesDevueltas)} devueltas</small></td>
                  <td data-label="Ventas netas">{moneda(fila.ventasNetas)}</td>
                  <td data-label="Materiales">{fila.costoMateriales === null ? "—" : moneda(fila.costoMateriales)}</td>
                  <td data-label="MOD">{moneda(fila.manoObraDirecta)}</td>
                  <td data-label="Transporte">{moneda(fila.transporte)}</td>
                  <td data-label="Contribución">{fila.contribucion === null ? "—" : moneda(fila.contribucion)}</td>
                  <td data-label="Gastos asignados">{moneda(fila.gastosAsignados)}</td>
                  <td data-label="EBITDA estimado"><strong className={fila.ebitdaEstimado !== null && fila.ebitdaEstimado >= 0 ? "positive" : "negative"}>{fila.ebitdaEstimado === null ? "—" : moneda(fila.ebitdaEstimado)}</strong></td>
                  <td data-label="Margen EBITDA">{fila.margenEbitda === null ? "—" : `${fila.margenEbitda.toFixed(1)}%`}</td>
                  <td data-label="Estado"><span className={`config-status ${fila.completo ? "ready" : "pending"}`}>{fila.completo ? "Calculado" : `${fila.pendientes} pendiente${fila.pendientes === 1 ? "" : "s"}`}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </>}

      <footer>
        El EBITDA estimado distribuye los costos disponibles para análisis gerencial.
        El EBITDA contable oficial continúa siendo el informado por el balance de resultados.
      </footer>
    </section>
  )
}

function DashboardProduccion({
  produccionHoy,
  ordenesHoy,
  produccionSemanal,
  totalPeriodo,
  resumenSku,
  totales,
  periodoTexto,
}: {
  produccionHoy: number
  ordenesHoy: number
  produccionSemanal: ProduccionSemanal[]
  totalPeriodo: {
    actual: { unidades: number; paradas: number; ordenes: number; kgMicro: number }
    anterior: { unidades: number; paradas: number; ordenes: number; kgMicro: number }
  }
  resumenSku: SkuSemanal[]
  totales: TotalesSemanales
  periodoTexto: string
}) {
  const skuActuales = resumenSku.filter(
    (item) => item.despachosActual > 0,
  ).length
  const skuAnteriores = resumenSku.filter(
    (item) => item.despachosAnterior > 0,
  ).length
  return (
    <section className="dashboard-view">
      <EncabezadoDashboard kicker="EFICIENCIA OPERATIVA" titulo="Producción" descripcion="Producción del día y salida operativa del portafolio." />
      <section className="production-grid">
        <DatoOperativo titulo="Producción hoy" valor={`${numero(produccionHoy)} Unid.`} detalle="unidades registradas" />
        <DatoOperativo titulo="Órdenes hoy" valor={numero(ordenesHoy)} detalle="órdenes de producción" />
        <IndicadorPendiente titulo="Cumplimiento del plan" compacto />
        <IndicadorPendiente titulo="Costo de conversión" compacto />
      </section>

      <div className="wall-section-head compact">
        <div><span>HISTORIAL CONECTADO</span><h2>Producción semanal</h2></div>
        <small>Producto terminado y micros del sistema contable + registros actuales</small>
      </div>
      {produccionSemanal.length === 0 ? (
        <div className="wall-empty">Todavía no existe producción histórica importada.</div>
      ) : (
        <section className="production-history-panel">
          <div className="production-month-kpis">
            <ResumenMercado etiqueta="Unidades del periodo" actual={totalPeriodo.actual.unidades} anterior={totalPeriodo.anterior.unidades} mejorCuandoSube />
            <ResumenMercado etiqueta="Paradas del periodo" actual={totalPeriodo.actual.paradas} anterior={totalPeriodo.anterior.paradas} mejorCuandoSube />
            <ResumenMercado etiqueta="Órdenes del periodo" actual={totalPeriodo.actual.ordenes} anterior={totalPeriodo.anterior.ordenes} mejorCuandoSube />
            <ResumenMercado etiqueta="Kg de micros" actual={totalPeriodo.actual.kgMicro} anterior={totalPeriodo.anterior.kgMicro} mejorCuandoSube />
          </div>
          <GraficoProduccionSemanal datos={produccionSemanal} />
        </section>
      )}

      <div className="wall-section-head compact">
        <div><span>SALIDA OPERATIVA</span><h2>{periodoTexto}</h2></div>
      </div>
      <section className="market-strip commercial-strip">
        <ResumenMercado etiqueta="Unidades despachadas" actual={totales.despachosActual} anterior={totales.despachosAnterior} mejorCuandoSube />
        <ResumenMercado etiqueta="SKU despachados" actual={skuActuales} anterior={skuAnteriores} mejorCuandoSube />
        <article className="market-summary neutral"><span>Producción registrada hoy</span><strong>{numero(produccionHoy)}</strong><small>Unid. producidas</small></article>
        <article className="market-summary neutral"><span>Órdenes registradas hoy</span><strong>{numero(ordenesHoy)}</strong><small>órdenes de producción</small></article>
      </section>

      <div className="wall-section-head"><div><span>PORTAFOLIO PRODUCIDO</span><h2>SKU con mayor despacho semanal</h2></div><small>Top 6</small></div>
      {resumenSku.length === 0 ? (
        <div className="wall-empty">No existen despachos en las semanas comparadas.</div>
      ) : (
        <div className="commercial-ranking operational-ranking">
          {resumenSku.slice(0, 6).map((sku, indice) => (
            <article key={sku.id}>
              <b>{String(indice + 1).padStart(2, "0")}</b>
              <div><span>{sku.codigo}</span><strong>{sku.corto}</strong></div>
              <em>{numero(sku.despachosActual)} Unid.</em>
              <Tendencia actual={sku.despachosActual} anterior={sku.despachosAnterior} mejorCuandoSube />
            </article>
          ))}
        </div>
      )}
      <ModulosPendientes items={["Planificado vs. producido", "Paradas y utilización de capacidad", "Desperdicio y reproceso", "Costo real por SKU"]} />
    </section>
  )
}

function GraficoProduccionSemanal({ datos }: { datos: ProduccionSemanal[] }) {
  const maximo = Math.max(1, ...datos.map((item) => item.unidades))
  return (
    <div className="production-month-bars">
      {datos.map((item) => (
          <article key={item.semana}>
            <span>{etiquetaEjeSemana(item.semana)}</span>
            <div><i style={{ width: `${Math.max(2, item.unidades / maximo * 100)}%` }} /></div>
            <strong>{numero(item.unidades)} Unid.</strong>
            <small>{numero(item.paradas)} paradas · {numero(item.kgMicro)} kg micro</small>
          </article>
      ))}
    </div>
  )
}

function DashboardInventario({ stockDisponible }: { stockDisponible: number }) {
  return (
    <section className="dashboard-view">
      <EncabezadoDashboard kicker="FEFO Y DISPONIBILIDAD" titulo="Inventario y logística" descripcion="Stock utilizable, antigüedad, vencimientos y eficiencia del despacho." />
      <section className="production-grid">
        <DatoOperativo titulo="Stock libre" valor={`${numero(stockDisponible)} Unid.`} detalle="inventario disponible" />
        <IndicadorPendiente titulo="Días de inventario" compacto />
        <IndicadorPendiente titulo="Próximos vencimientos" compacto />
        <IndicadorPendiente titulo="Dropsize promedio" compacto />
      </section>
      <ModulosPendientes items={["Inventario por edad y lote", "Alertas FEFO", "Stock reservado vs. libre", "Despachos y utilización de transporte"]} />
    </section>
  )
}

type TotalesPagoFinanciero = {
  total: number
  gastoEbitda: number
  inventario: number
  otrasSalidas: number
  pendientes: number
  movimientos: number
}

type TotalesBalanceFinanciero = {
  disponible: boolean
  meses: number
  ingresos: number
  ebitda: number
  resultado: number
  margenEbitda: number
}

function DashboardFinanciero({
  rentabilidadDetalle,
  costosSinAsignar,
  reglasDistribucion,
  guardarReglas,
  avisoRentabilidad,
  avisoFinanciero,
  costosGastos,
  nomina,
  pagos,
  balance,
  cambiarPantalla,
}: {
  rentabilidadDetalle: RentabilidadDetalle[]
  costosSinAsignar: number
  reglasDistribucion: ReglaDistribucionDb[]
  guardarReglas: (reglas: ReglaDistribucionDb[]) => Promise<void>
  avisoRentabilidad: string
  avisoFinanciero: string
  costosGastos: ReporteCostosGastos
  nomina: ReporteNominaFinanciero
  pagos: {
    actual: TotalesPagoFinanciero
    anterior: TotalesPagoFinanciero
    semanas: (TotalesPagoFinanciero & { semana: string })[]
  }
  balance: {
    actual: TotalesBalanceFinanciero
    anterior: TotalesBalanceFinanciero
  }
  cambiarPantalla: (pantalla: string) => void
}) {
  return (
    <section className="dashboard-view">
      <div className="financial-dashboard-head">
        <EncabezadoDashboard kicker="RENTABILIDAD Y CAJA" titulo="Financiero" descripcion="Balance mensual por devengo y salidas reales de caja clasificadas sin mezclar conceptos." />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={() => cambiarPantalla("Pagos y gastos")}>Abrir facturas y pagos</button>
        </div>
      </div>

      <div className="wall-section-head compact">
        <div><span>BALANCE DE RESULTADOS</span><h2>Resultado contable mensual</h2></div>
        <small>{balance.actual.disponible ? `${balance.actual.meses} meses incluidos` : "Sin meses contables para este periodo"}</small>
      </div>
      <section className="market-strip commercial-strip">
        {balance.actual.disponible ? <>
          <ResumenMercado etiqueta="Ingresos netos" actual={balance.actual.ingresos} anterior={balance.anterior.ingresos} mejorCuandoSube monedaValor />
          <ResumenMercado etiqueta="EBITDA" actual={balance.actual.ebitda} anterior={balance.anterior.ebitda} mejorCuandoSube monedaValor />
          <ResumenMercado etiqueta="Margen EBITDA" actual={balance.actual.margenEbitda} anterior={balance.anterior.margenEbitda} mejorCuandoSube porcentaje />
          <ResumenMercado etiqueta="Resultado ejercicio" actual={balance.actual.resultado} anterior={balance.anterior.resultado} mejorCuandoSube monedaValor />
        </> : <>
          <IndicadorPendiente titulo="Ingresos netos" compacto />
          <IndicadorPendiente titulo="EBITDA" compacto />
          <IndicadorPendiente titulo="Margen EBITDA" compacto />
          <IndicadorPendiente titulo="Resultado ejercicio" compacto />
        </>}
      </section>

      <ReporteCostosGastosPanel datos={costosGastos} />

      <ReporteNominaPanel datos={nomina} />

      <div className="wall-section-head compact">
        <div><span>SALIDAS DE CAJA</span><h2>Pagos reales del periodo</h2></div>
        <small>{numero(pagos.actual.movimientos)} movimientos pagados</small>
      </div>
      <section className="market-strip commercial-strip">
        <ResumenMercado etiqueta="Total pagado" actual={pagos.actual.total} anterior={pagos.anterior.total} mejorCuandoSube={false} monedaValor />
        <ResumenMercado etiqueta="Gastos EBITDA pagados" actual={pagos.actual.gastoEbitda} anterior={pagos.anterior.gastoEbitda} mejorCuandoSube={false} monedaValor />
        <ResumenMercado etiqueta="Compras de inventario" actual={pagos.actual.inventario} anterior={pagos.anterior.inventario} mejorCuandoSube={false} monedaValor />
        <ResumenMercado etiqueta="Por clasificar" actual={pagos.actual.pendientes} anterior={pagos.anterior.pendientes} mejorCuandoSube={false} monedaValor />
      </section>

      <section className="sales-pulse-panel">
        <div className="wall-section-head compact"><div><span>TENDENCIA SEMANAL</span><h2>Pagos por número de semana</h2></div><small>Total · gasto EBITDA · inventario</small></div>
        <GraficoPagosSemanal datos={pagos.semanas} />
      </section>

      <RentabilidadPanel
        detalle={rentabilidadDetalle}
        costosSinAsignar={costosSinAsignar}
        reglas={reglasDistribucion}
        onGuardarReglas={guardarReglas}
        aviso={avisoRentabilidad}
      />
      {avisoFinanciero && <div className="data-notice"><span>CONEXIÓN INCOMPLETA</span><h3>Revisa la instalación financiera</h3><p>{avisoFinanciero}</p></div>}
      <div className="data-notice"><span>LECTURA CORRECTA</span><h3>Devengo y caja se muestran por separado</h3><p>El EBITDA proviene del balance contable. Los pagos muestran cuándo salió el dinero; cartera por cobrar, cobros y saldo bancario todavía requieren sus fuentes específicas.</p></div>
    </section>
  )
}

function ReporteNominaPanel({ datos }: { datos: ReporteNominaFinanciero }) {
  const participacionExternaActual = datos.equipoVentas.actual.total > 0
    ? datos.equipoVentas.actual.serviciosExternos / datos.equipoVentas.actual.total * 100
    : 0
  const participacionExternaAnterior = datos.equipoVentas.anterior.total > 0
    ? datos.equipoVentas.anterior.serviciosExternos / datos.equipoVentas.anterior.total * 100
    : 0
  const areasCompletas = (() => {
    const areas = datos.areas.map((item) => ({ ...item }))
    const ventas = areas.find((item) => item.area === "VENTAS")
    if (ventas) {
      ventas.actual += datos.equipoVentas.actual.serviciosExternos
      ventas.anterior += datos.equipoVentas.anterior.serviciosExternos
    } else if (
      datos.equipoVentas.actual.serviciosExternos !== 0
      || datos.equipoVentas.anterior.serviciosExternos !== 0
    ) {
      areas.push({
        area: "VENTAS",
        actual: datos.equipoVentas.actual.serviciosExternos,
        anterior: datos.equipoVentas.anterior.serviciosExternos,
      })
    }
    return areas.sort((a, b) => b.actual - a.actual)
  })()
  const costoCompletoActual = datos.actual.costo + datos.equipoVentas.actual.serviciosExternos
  const costoCompletoAnterior = datos.anterior.costo + datos.equipoVentas.anterior.serviciosExternos
  return (
    <section className="expense-analysis">
      <div className="wall-section-head compact expense-analysis-head">
        <div>
          <span>COSTO LABORAL POR DEVENGO</span>
          <h2>Nómina por área</h2>
          <p>Sueldos, beneficios, aporte patronal y provisiones del reporte de roles.</p>
        </div>
        <small>{datos.actual.meses > 0 ? `${numero(datos.actual.meses)} meses incluidos` : "Sin roles para este periodo"}</small>
      </div>

      {datos.actual.meses === 0 ? (
        <div className="wall-empty">Carga los PDF mensuales desde Roles de pago para activar este análisis.</div>
      ) : (
        <>
          <section className="market-strip expense-kpis">
            <ResumenMercado etiqueta="Costo laboral" actual={datos.actual.costo} anterior={datos.anterior.costo} mejorCuandoSube={false} monedaValor />
            <ResumenMercado etiqueta="Pago neto del rol" actual={datos.actual.pagoNeto} anterior={datos.anterior.pagoNeto} mejorCuandoSube={false} monedaValor />
            <ResumenMercado etiqueta="Descuentos al personal" actual={datos.actual.descuentos} anterior={datos.anterior.descuentos} mejorCuandoSube={false} monedaValor />
            <ResumenMercado etiqueta="Meses cargados" actual={datos.actual.meses} anterior={datos.anterior.meses} mejorCuandoSube />
          </section>

          <div className="wall-section-head compact">
            <div><span>EQUIPO COMERCIAL COMPLETO</span><h3>Personal interno y servicios externos</h3></div>
            <small>Las facturas externas se reconocen por fecha de emisión y subtotal sin IVA</small>
          </div>
          <section className="market-strip expense-kpis">
            <ResumenMercado etiqueta="Nómina interna de ventas" actual={datos.equipoVentas.actual.nominaInterna} anterior={datos.equipoVentas.anterior.nominaInterna} mejorCuandoSube={false} monedaValor />
            <ResumenMercado etiqueta="Servicios comerciales externos" actual={datos.equipoVentas.actual.serviciosExternos} anterior={datos.equipoVentas.anterior.serviciosExternos} mejorCuandoSube={false} monedaValor />
            <ResumenMercado etiqueta="Costo total equipo comercial" actual={datos.equipoVentas.actual.total} anterior={datos.equipoVentas.anterior.total} mejorCuandoSube={false} monedaValor />
            <ResumenMercado etiqueta="Participación externa" actual={participacionExternaActual} anterior={participacionExternaAnterior} mejorCuandoSube={false} porcentaje />
          </section>

          <section className="expense-accounts">
            <header><div><span>DISTRIBUCIÓN</span><h3>Costo por área</h3></div><small>Incluye personal interno y servicios externos</small></header>
            <div className="expense-table-wrap">
              <table>
                <thead><tr><th>Área</th><th>Periodo</th><th>Anterior</th><th>Variación</th><th>Participación</th></tr></thead>
                <tbody>
                  {areasCompletas.map((item) => {
                    const participacion = costoCompletoActual > 0
                      ? item.actual / costoCompletoActual * 100
                      : 0
                    return (
                      <tr key={item.area}>
                        <td data-label="Área"><strong>{ETIQUETAS_AREA_NOMINA[item.area]}</strong></td>
                        <td data-label="Periodo">{moneda(item.actual)}</td>
                        <td data-label="Anterior">{moneda(item.anterior)}</td>
                        <td data-label="Variación"><Tendencia actual={item.actual} anterior={item.anterior} mejorCuandoSube={false} /></td>
                        <td data-label="Participación">{participacion.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer className="expense-analysis-note">
        <span>Sin doble conteo</span>
        <p>La fila Ventas suma la nómina interna y los servicios comerciales externos. La distribución usa {moneda(costoCompletoActual)} en el periodo y {moneda(costoCompletoAnterior)} en el anterior, sin duplicar facturas.</p>
      </footer>
    </section>
  )
}

function ReporteCostosGastosPanel({ datos }: { datos: ReporteCostosGastos }) {
  const totalActual = datos.actual.gastoEbitda + datos.actual.inventario
  const totalAnterior = datos.anterior.gastoEbitda + datos.anterior.inventario
  const rubros = datos.rubros.filter((item) => item.actual !== 0 || item.anterior !== 0)
  const cuentas = datos.cuentas
    .filter((item) => item.actual !== 0 || item.anterior !== 0)
    .slice(0, 12)
  const aumentos = datos.cuentas
    .filter(
      (item) =>
        item.tipo === "EBITDA" &&
        item.actual > item.anterior &&
        item.actual - item.anterior > 0,
    )
    .sort((a, b) => (b.actual - b.anterior) - (a.actual - a.anterior))
    .slice(0, 4)
  const maximoRubro = Math.max(1, ...rubros.map((item) => item.actual))

  return (
    <section className="expense-analysis">
      <div className="wall-section-head compact expense-analysis-head">
        <div>
          <span>COSTOS Y GASTOS POR DEVENGO</span>
          <h2>¿Dónde se está usando el dinero?</h2>
          <p>Facturas agrupadas por fecha de emisión y valor sin IVA.</p>
        </div>
        <small>{numero(datos.actual.facturas)} facturas incluidas</small>
      </div>

      <section className="market-strip expense-kpis">
        <ResumenMercado etiqueta="Gastos que afectan EBITDA" actual={datos.actual.gastoEbitda} anterior={datos.anterior.gastoEbitda} mejorCuandoSube={false} monedaValor />
        <ResumenMercado etiqueta="Compras de inventario" actual={datos.actual.inventario} anterior={datos.anterior.inventario} mejorCuandoSube={false} monedaValor />
        <ResumenMercado etiqueta="Total monitoreado" actual={totalActual} anterior={totalAnterior} mejorCuandoSube={false} monedaValor />
        <ResumenMercado etiqueta="Pendiente de clasificar" actual={datos.actual.pendientes} anterior={datos.anterior.pendientes} mejorCuandoSube={false} monedaValor />
      </section>

      {rubros.length === 0 ? (
        <div className="wall-empty">No existen facturas emitidas en el rango seleccionado.</div>
      ) : (
        <div className="expense-analysis-grid">
          <section className="expense-rubrics">
            <header><div><span>DISTRIBUCIÓN</span><h3>Rubros principales</h3></div><small>Participación del periodo</small></header>
            <div>
              {rubros.map((item) => {
                const baseParticipacion = totalActual + datos.actual.pendientes
                const participacion = baseParticipacion > 0 ? item.actual / baseParticipacion * 100 : 0
                return (
                  <article key={item.id}>
                    <div className="expense-rubric-title">
                      <div><strong>{item.etiqueta}</strong><span className={`expense-kind ${item.tipo.toLowerCase()}`}>{item.tipo === "EBITDA" ? "Afecta EBITDA" : item.tipo === "INVENTARIO" ? "Inventario" : "Revisar"}</span></div>
                      <Tendencia actual={item.actual} anterior={item.anterior} mejorCuandoSube={false} />
                    </div>
                    <div className="expense-rubric-line"><i className={item.tipo.toLowerCase()} style={{ width: `${Math.max(item.actual > 0 ? 2 : 0, item.actual / maximoRubro * 100)}%` }} /></div>
                    <footer><strong>{moneda(item.actual)}</strong><span>{participacion.toFixed(1)}% del total · {numero(item.facturasActual)} facturas</span><small>Anterior {moneda(item.anterior)}</small></footer>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="expense-opportunities">
            <header><div><span>FOCO GERENCIAL</span><h3>Mayores aumentos a revisar</h3></div><small>Solo gastos EBITDA</small></header>
            {aumentos.length === 0 ? (
              <div className="expense-opportunities-empty">No hay rubros EBITDA con aumento frente al periodo anterior.</div>
            ) : (
              <div>
                {aumentos.map((item, indice) => (
                  <article key={item.codigo}>
                    <b>{String(indice + 1).padStart(2, "0")}</b>
                    <div><strong>{item.nombre}</strong><small>{item.grupo}</small></div>
                    <span><strong>+{moneda(item.actual - item.anterior)}</strong><small>Ahora {moneda(item.actual)}</small></span>
                  </article>
                ))}
              </div>
            )}
            <p>Un aumento no significa automáticamente que deba recortarse: señala dónde conviene revisar precio, consumo, frecuencia y proveedor.</p>
          </section>
        </div>
      )}

      {cuentas.length > 0 && (
        <section className="expense-accounts">
          <header><div><span>DETALLE DE CUENTAS</span><h3>Rubros con mayor valor</h3></div><small>Top 12 del periodo seleccionado</small></header>
          <div className="expense-table-wrap">
            <table>
              <thead><tr><th>Cuenta o rubro</th><th>Clasificación</th><th>Periodo</th><th>Anterior</th><th>Variación</th><th>Peso</th><th>Actividad</th></tr></thead>
              <tbody>
                {cuentas.map((item) => {
                  const participacion = totalActual > 0 ? item.actual / totalActual * 100 : 0
                  return (
                    <tr key={item.codigo}>
                      <td data-label="Cuenta"><strong>{item.nombre}</strong><small>{item.codigo}</small></td>
                      <td data-label="Clasificación"><span className={`expense-kind ${item.tipo.toLowerCase()}`}>{item.grupo}</span></td>
                      <td data-label="Periodo">{moneda(item.actual)}</td>
                      <td data-label="Anterior">{moneda(item.anterior)}</td>
                      <td data-label="Variación"><Tendencia actual={item.actual} anterior={item.anterior} mejorCuandoSube={false} /></td>
                      <td data-label="Peso">{participacion.toFixed(1)}%</td>
                      <td data-label="Actividad"><strong>{numero(item.facturasActual)} fact.</strong><small>{numero(item.proveedoresActual)} proveedores</small></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="expense-analysis-note">
        <span>Cómo leerlo</span>
        <p>“Gastos EBITDA” afecta la rentabilidad del periodo. “Inventario” muestra compras de materias primas e insumos: afecta caja ahora, pero su costo llega al resultado cuando se consume. Obligaciones, préstamos, activos y transferencias no se incluyen como gasto.</p>
      </footer>
    </section>
  )
}

function GraficoPagosSemanal({
  datos,
}: {
  datos: (TotalesPagoFinanciero & { semana: string })[]
}) {
  const conDatos = datos.filter((item) => item.total > 0)
  const maximo = Math.max(1, ...conDatos.map((item) => item.total))
  if (conDatos.length === 0) {
    return <div className="wall-empty">No existen pagos importados en el rango seleccionado.</div>
  }
  return (
    <div className="finance-week-bars">
      {conDatos.map((item) => (
        <article key={item.semana}>
          <span>{etiquetaEjeSemana(item.semana)}</span>
          <div><i style={{ width: `${Math.max(2, item.total / maximo * 100)}%` }} /></div>
          <strong>{moneda(item.total)}</strong>
          <small>EBITDA {moneda(item.gastoEbitda)} · Inventario {moneda(item.inventario)}</small>
        </article>
      ))}
    </div>
  )
}

function IndicadorPendiente({ titulo, compacto = false }: { titulo: string; compacto?: boolean }) {
  return <article className={`pending-kpi ${compacto ? "compact" : ""}`}><span>{titulo}</span><strong>—</strong><small>Pendiente de integración</small></article>
}

function DatoOperativo({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return <article className="operational-kpi"><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>
}

function ModulosPendientes({ items }: { items: string[] }) {
  return <section className="future-modules"><div><span>PRÓXIMAS CONEXIONES</span><h3>Indicadores preparados para crecer</h3></div><div>{items.map((item) => <p key={item}><i>○</i>{item}</p>)}</div></section>
}

function estadoTendencia(
  actual: number,
  anterior: number,
  mejorCuandoSube: boolean,
) {
  if (actual === anterior) return "neutral"
  const subio = actual > anterior
  return subio === mejorCuandoSube ? "positive" : "negative"
}

function Tendencia({
  actual,
  anterior,
  mejorCuandoSube,
}: {
  actual: number
  anterior: number
  mejorCuandoSube: boolean
}) {
  const estado = estadoTendencia(actual, anterior, mejorCuandoSube)
  const variacion = porcentajeVariacion(actual, anterior)
  const flecha = actual > anterior ? "↑" : actual < anterior ? "↓" : "→"
  const texto = variacion === null ? "NUEVO" : `${Math.abs(variacion).toFixed(1)}%`

  return (
    <span className={`trend ${estado}`}>
      <b>{flecha}</b> {texto}
    </span>
  )
}

function ResumenMercado({
  etiqueta,
  actual,
  anterior,
  mejorCuandoSube,
  porcentaje = false,
  monedaValor = false,
}: {
  etiqueta: string
  actual: number
  anterior: number
  mejorCuandoSube: boolean
  porcentaje?: boolean
  monedaValor?: boolean
}) {
  const estado = estadoTendencia(actual, anterior, mejorCuandoSube)
  const formato = (valor: number) => {
    if (monedaValor) return moneda(valor)
    return porcentaje ? `${valor.toFixed(1)}%` : numero(valor)
  }

  return (
    <article className={`market-summary ${estado}`}>
      <div className="market-summary-title">
        <span>{etiqueta}</span>
        <Tendencia
          actual={actual}
          anterior={anterior}
          mejorCuandoSube={mejorCuandoSube}
        />
      </div>
      <strong>{formato(actual)}</strong>
      <small>Anterior: {formato(anterior)}</small>
    </article>
  )
}

const css = `
  .wall-dashboard { width: 100%; max-width: none; margin: 0; padding: 20px 14px 40px; color: #2d2522; font-variant-numeric: tabular-nums; }
  .wall-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
  .wall-header h1 { margin: 4px 0 3px; color: ${VINO}; font-size: clamp(28px,3vw,38px); letter-spacing: -.7px; }
  .wall-header p { margin: 0; color: #786d69; font-size: 13px; }
  .wall-kicker, .wall-section-head > div > span { color: ${NARANJA}; font-size: 10px; font-weight: 950; letter-spacing: 1.35px; }
  .wall-header button { min-height: 42px; padding: 0 17px; border: 1px solid #e1d5ce; border-radius: 8px; background: #fff; color: ${VINO}; font-weight: 850; cursor: pointer; box-shadow: 0 4px 12px rgba(71,39,30,.06); }
  .wall-header button:disabled { opacity: .6; cursor: wait; }
  .dashboard-tabs { display: flex; gap: 4px; margin: 0 0 23px; padding: 5px; border: 1px solid #e6dcd6; border-radius: 11px; background: #f5f0ed; overflow-x: auto; scrollbar-width: thin; }
  .dashboard-tabs button { min-width: max-content; flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 42px; padding: 0 13px; border: 0; border-radius: 7px; background: transparent; color: #766963; font-size: 11px; font-weight: 850; cursor: pointer; transition: background .16s ease,color .16s ease,box-shadow .16s ease; }
  .dashboard-tabs button span { color: #aa9388; font-size: 13px; }
  .dashboard-tabs button:hover { background: #fff9f5; color: ${VINO}; }
  .dashboard-tabs button.active { background: #fff; color: ${VINO}; box-shadow: 0 3px 11px rgba(76,45,34,.1); }
  .dashboard-tabs button.active span { color: ${NARANJA}; }
  .dashboard-period-filter { width:100%; min-width:0; display: grid; grid-template-columns: minmax(290px,auto) 145px 145px 135px 135px auto minmax(220px,1fr); align-items: end; gap: 10px; margin: -10px 0 22px; padding: 13px; border: 1px solid #e6dcd6; border-radius: 10px; background: #fff; box-shadow: 0 4px 14px rgba(70,43,34,.04); }
  .dashboard-period-filter label { min-width:0; color: #756862; font-size: 9px; font-weight: 900; text-transform: uppercase; }
  .dashboard-period-filter select, .dashboard-period-filter input { display: block; width: 100%; min-height: 39px; box-sizing: border-box; margin-top: 5px; padding: 7px 9px; border: 1px solid #dcd1cb; border-radius: 7px; background: #fff; color: #493b36; font: inherit; }
  .dashboard-period-buttons { min-width:0; }
  .dashboard-period-buttons > span { display:block; margin-bottom:5px; color:#756862; font-size:9px; font-weight:900; text-transform:uppercase; }
  .dashboard-period-buttons > section { display:flex; gap:3px; padding:3px; border:1px solid #ddd2cc; border-radius:8px; background:#f5f0ed; }
  .dashboard-period-buttons button { flex:1; min-height:31px; padding:0 9px; border:0; border-radius:5px; background:transparent; color:#786b65; font-size:9px; font-weight:900; cursor:pointer; }
  .dashboard-period-buttons button:hover { color:${VINO}; }
  .dashboard-period-buttons button.active { background:#fff; color:${VINO}; box-shadow:0 2px 7px rgba(67,42,34,.11); }
  .dashboard-period-buttons button:disabled { cursor:wait; opacity:.6; }
  .dashboard-period-filter > button { width:100%; min-height: 39px; padding: 0 15px; border: 0; border-radius: 7px; background: ${VINO}; color: #fff; font-size: 10px; font-weight: 900; cursor: pointer; }
  .dashboard-period-comparison { display: flex; flex-direction: column; justify-content: center; min-height: 39px; padding-left: 10px; border-left: 2px solid ${NARANJA}; }
  .dashboard-period-comparison span { color: #8e817b; font-size: 8px; font-weight: 900; text-transform: uppercase; }
  .dashboard-period-comparison strong { margin-top: 2px; color: #5b3031; font-size: 11px; }
  .dashboard-period-comparison small { margin-top: 2px; color: #998b85; font-size: 8px; }
  .wall-error { margin-bottom: 16px; padding: 12px 14px; border-left: 4px solid #d14343; background: #fff0f0; color: #a62525; }
  .dashboard-view { animation: dashboard-in .18s ease-out; }
  @keyframes dashboard-in { from { opacity: .3; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
  .dashboard-title { margin-bottom: 17px; }
  .dashboard-title > span { color: ${NARANJA}; font-size: 9px; font-weight: 950; letter-spacing: 1.3px; }
  .dashboard-title h2 { margin: 3px 0; color: #4d2828; font-size: 22px; }
  .dashboard-title p { margin: 0; color: #887b76; font-size: 12px; }
  .executive-finance-grid, .production-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 11px; margin-bottom: 25px; }
  .financial-large { grid-template-columns: repeat(4,minmax(0,1fr)); }
  .financial-dashboard-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
  .financial-dashboard-head > button { min-height:40px; padding:0 15px; border:1px solid ${VINO}; border-radius:8px; background:${VINO}; color:#fff; font-size:10px; font-weight:900; cursor:pointer; white-space:nowrap; }
  .pending-kpi, .operational-kpi { min-height: 108px; display: flex; flex-direction: column; justify-content: center; padding: 16px; border: 1px solid #eadfd9; border-radius: 9px; background: linear-gradient(145deg,#fffaf6,#fff); box-shadow: 0 4px 14px rgba(70,43,34,.04); }
  .pending-kpi { border-top: 3px solid #c8b8b0; }
  .operational-kpi { border-top: 3px solid ${NARANJA}; }
  .pending-kpi.compact { min-height: 101px; }
  .pending-kpi span, .operational-kpi span { color: #75645e; font-size: 9px; font-weight: 950; letter-spacing: .45px; text-transform: uppercase; }
  .pending-kpi strong, .operational-kpi strong { margin: 6px 0 3px; color: ${VINO}; font-size: 26px; line-height: 1; }
  .pending-kpi small, .operational-kpi small { color: #a0918b; font-size: 9px; }
  .market-strip { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 11px; margin-bottom: 12px; }
  .commercial-strip { margin-bottom: 25px; }
  .market-summary { min-width: 0; padding: 16px 17px; border: 1px solid #e8e0db; border-top: 3px solid #9b8d87; border-radius: 9px; background: linear-gradient(150deg,#fff,#fbf8f6); box-shadow: 0 5px 16px rgba(55,36,30,.045); }
  .market-summary.positive { border-top-color: #159447; }
  .market-summary.negative { border-top-color: #d33d3d; }
  .market-summary-title { display: flex; align-items: center; justify-content: space-between; gap: 7px; }
  .market-summary span, .market-summary.neutral > span { color: #756964; font-size: 10px; font-weight: 900; letter-spacing: .45px; text-transform: uppercase; }
  .market-summary > strong { display: block; margin: 7px 0 4px; color: #211c1a; font-size: 29px; line-height: 1; }
  .market-summary small { color: #91857f; font-size: 10px; }
  .trend { display: inline-flex; align-items: center; gap: 3px; width: fit-content; padding: 3px 6px; border-radius: 4px; font-size: 10px !important; font-weight: 950 !important; white-space: nowrap; }
  .trend b { font-size: 14px; line-height: 9px; }
  .positive { color: #087b35 !important; }
  .negative { color: #c72e2e !important; }
  .neutral { color: #746b67 !important; }
  .trend.positive { background: #e8f7ed; }
  .trend.negative { background: #fff0f0; }
  .trend.neutral { background: #f1efee; }
  .operation-ticker { display: flex; align-items: center; gap: 0; min-height: 47px; margin-bottom: 26px; border: 1px solid #e7ddd7; border-radius: 8px; background: #342925; color: #fff; overflow: hidden; }
  .operation-ticker > span { align-self: stretch; display: grid; place-items: center; padding: 0 15px; background: ${VINO}; color: #fff; font-size: 9px; font-weight: 950; letter-spacing: 1px; }
  .operation-ticker div { display: flex; align-items: baseline; gap: 7px; padding: 0 17px; border-right: 1px solid #594c47; }
  .operation-ticker small { color: #baaFAA; font-size: 9px; text-transform: uppercase; }
  .operation-ticker strong { font-size: 12px; }
  .operation-ticker i { margin-left: auto; padding: 0 16px; font-size: 10px; font-style: normal; }
  .operation-ticker i.online { color: #61db8b; }
  .operation-ticker i.offline { color: #ff7777; }
  .wall-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 15px; margin-bottom: 12px; }
  .wall-section-head.compact { margin-top: 2px; }
  .wall-section-head h2 { margin: 3px 0 0; color: #4b2727; font-size: 20px; }
  .wall-section-head small { color: #9b8d87; font-size: 10px; }
  .wall-legend { display: flex; gap: 13px; font-size: 10px; font-weight: 850; }
  .sku-market-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
  .sku-market-card { min-width: 0; border: 1px solid #e7ded9; border-radius: 10px; background: #fff; box-shadow: 0 5px 18px rgba(62,40,33,.05); overflow: hidden; }
  .sku-market-card > header { display: flex; justify-content: space-between; gap: 12px; min-height: 77px; padding: 14px 15px 12px; border-bottom: 1px solid #eee7e3; background: linear-gradient(135deg,#fff,#fcf9f7); }
  .sku-market-card header > div:first-child { min-width: 0; }
  .sku-market-card header span { color: ${NARANJA}; font-size: 9px; font-weight: 950; letter-spacing: .7px; }
  .sku-market-card h3 { margin: 3px 0 1px; color: ${VINO}; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sku-market-card header small { display: block; color: #958984; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rate { min-width: 70px; text-align: right; }
  .rate small { color: inherit !important; font-size: 8px !important; font-weight: 900; }
  .rate strong { display: block; margin-top: 3px; font-size: 19px; }
  .sku-quotes { display: grid; grid-template-columns: 1fr 1fr; }
  .sku-quotes > div { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 3px 6px; padding: 13px 15px 14px; }
  .sku-quotes > div + div { border-left: 1px solid #eee7e3; }
  .sku-quotes span { grid-column: 1 / -1; color: #827671; font-size: 8px; font-weight: 950; letter-spacing: .7px; }
  .sku-quotes strong { color: #241e1c; font-size: 24px; line-height: 1; }
  .sku-quotes small { grid-column: 1 / -1; color: #9a8f8a; font-size: 9px; }
  .wall-empty { padding: 45px 20px; border: 1px dashed #d8ccc5; border-radius: 10px; color: #8e817b; text-align: center; }
  .commercial-ranking { display: flex; flex-direction: column; gap: 7px; margin-bottom: 20px; }
  .commercial-ranking article { display: grid; grid-template-columns: 35px minmax(0,1fr) auto auto; align-items: center; gap: 12px; min-height: 57px; padding: 7px 13px; border: 1px solid #eae1dc; border-radius: 8px; background: #fff; }
  .commercial-ranking article > b { color: #c2b3ac; font-size: 13px; }
  .commercial-ranking article div { min-width: 0; }
  .commercial-ranking article div span { display: block; color: ${NARANJA}; font-size: 8px; font-weight: 900; }
  .commercial-ranking article div strong { display: block; color: #513031; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .commercial-ranking article em { color: #312826; font-size: 13px; font-style: normal; font-weight: 900; text-align: right; }
  .commercial-ranking article em small { display: block; margin-top: 2px; color: #998b85; font-size: 8px; font-weight: 750; }
  .commercial-columns { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; }
  .sales-pulse-panel { margin: 0 0 25px; padding: 18px; border: 1px solid #e7ddd7; border-radius: 10px; background: #fff; box-shadow: 0 5px 18px rgba(62,40,33,.045); }
  .sales-week-bars { display: grid; gap: 8px; }
  .sales-week-bars article { display: grid; grid-template-columns: 92px minmax(90px,1fr) 105px 67px; align-items: center; gap: 10px; }
  .sales-week-bars article > span { color: #806f69; font-size: 9px; font-weight: 850; }
  .finance-week-bars { display:grid; gap:8px; }
  .finance-week-bars article { display:grid; grid-template-columns:92px minmax(90px,1fr) 110px 230px; align-items:center; gap:10px; }
  .finance-week-bars article > span { color:#806f69; font-size:9px; font-weight:850; }
  .finance-week-bars article > div { height:9px; overflow:hidden; border-radius:999px; background:#eee7e3; }
  .finance-week-bars article i { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,${VINO},${NARANJA}); }
  .finance-week-bars article strong { color:#3a2d29; font-size:10px; text-align:right; }
  .finance-week-bars article small { color:#998b85; font-size:8px; }
  .sales-week-bars article > div { height: 8px; border-radius: 999px; background: #f1eae6; overflow: hidden; }
  .sales-week-bars article > div i { display: block; min-width: 3px; height: 100%; border-radius: inherit; background: linear-gradient(90deg,${VINO},${NARANJA}); }
  .sales-week-bars article > strong { color: #392927; font-size: 11px; text-align: right; }
  .expense-analysis { margin: 4px 0 28px; padding: 19px; border: 1px solid #e5dad4; border-radius: 11px; background: linear-gradient(145deg,#fff,#fcfaf8); box-shadow: 0 5px 18px rgba(62,40,33,.045); }
  .expense-analysis-head { margin-bottom: 14px; }
  .expense-analysis-head p { margin: 4px 0 0; color: #8d7f79; font-size: 10px; }
  .expense-kpis { margin-bottom: 17px; }
  .expense-analysis-grid { display: grid; grid-template-columns: minmax(0,1.35fr) minmax(300px,.65fr); gap: 13px; }
  .expense-rubrics, .expense-opportunities, .expense-accounts { min-width: 0; padding: 15px; border: 1px solid #eae0db; border-radius: 9px; background: #fff; }
  .expense-rubrics > header, .expense-opportunities > header, .expense-accounts > header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .expense-rubrics header span, .expense-opportunities header span, .expense-accounts header span { color: ${NARANJA}; font-size: 8px; font-weight: 950; letter-spacing: 1px; }
  .expense-rubrics h3, .expense-opportunities h3, .expense-accounts h3 { margin: 3px 0 0; color: #4d2a2a; font-size: 16px; }
  .expense-rubrics header small, .expense-opportunities header small, .expense-accounts header small { color: #9d8f89; font-size: 8px; }
  .expense-rubrics > div { display: grid; gap: 10px; }
  .expense-rubrics article { padding-bottom: 10px; border-bottom: 1px solid #f0e9e5; }
  .expense-rubrics article:last-child { padding-bottom: 0; border-bottom: 0; }
  .expense-rubric-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .expense-rubric-title > div { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .expense-rubric-title strong { color: #4e3d38; font-size: 10px; }
  .expense-kind { display: inline-flex; width: fit-content; padding: 3px 6px; border-radius: 999px; background: #f2eeec; color: #776b66; font-size: 7px; font-weight: 950; white-space: nowrap; }
  .expense-kind.ebitda { background: #f8e9e9; color: ${VINO}; }
  .expense-kind.inventario { background: #fff0dc; color: #a65d06; }
  .expense-kind.pendiente { background: #fff5d8; color: #8c6816; }
  .expense-rubric-line { height: 7px; margin: 7px 0 6px; overflow: hidden; border-radius: 999px; background: #f1ebe7; }
  .expense-rubric-line i { display: block; min-width: 0; height: 100%; border-radius: inherit; background: ${VINO}; }
  .expense-rubric-line i.inventario { background: ${NARANJA}; }
  .expense-rubric-line i.pendiente { background: #d6a52d; }
  .expense-rubrics footer { display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: 10px; }
  .expense-rubrics footer strong { color: #352a27; font-size: 11px; }
  .expense-rubrics footer span, .expense-rubrics footer small { color: #9a8d87; font-size: 8px; }
  .expense-rubrics footer small { text-align: right; }
  .expense-opportunities { border-top: 3px solid ${NARANJA}; }
  .expense-opportunities > div { display: grid; gap: 7px; }
  .expense-opportunities article { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 9px; border-radius: 7px; background: #fcf8f5; }
  .expense-opportunities article > b { color: #cab8af; font-size: 9px; }
  .expense-opportunities article > div { min-width: 0; }
  .expense-opportunities article > div strong { display: block; overflow: hidden; color: #563031; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .expense-opportunities article small { display: block; margin-top: 2px; color: #9a8c86; font-size: 7px; }
  .expense-opportunities article > span { text-align: right; }
  .expense-opportunities article > span strong { color: #c72e2e; font-size: 10px; }
  .expense-opportunities > p, .expense-opportunities-empty { margin: 11px 0 0; padding-top: 10px; border-top: 1px solid #eee5e0; color: #8e807a; font-size: 8px; line-height: 1.45; }
  .expense-opportunities-empty { padding: 22px 8px; border: 0; text-align: center; }
  .expense-accounts { margin-top: 13px; padding-bottom: 8px; }
  .expense-table-wrap { width: 100%; overflow-x: auto; }
  .expense-accounts table { width: 100%; min-width: 930px; border-collapse: collapse; }
  .expense-accounts th { padding: 9px 8px; border-bottom: 2px solid #eadfd9; color: #887a74; font-size: 7px; font-weight: 950; letter-spacing: .4px; text-align: right; text-transform: uppercase; }
  .expense-accounts th:first-child, .expense-accounts th:nth-child(2) { text-align: left; }
  .expense-accounts td { padding: 10px 8px; border-bottom: 1px solid #f0e9e5; color: #4d413d; font-size: 9px; text-align: right; white-space: nowrap; }
  .expense-accounts td:first-child, .expense-accounts td:nth-child(2) { text-align: left; }
  .expense-accounts td:first-child strong, .expense-accounts td:last-child strong { display: block; color: #542e2f; font-size: 9px; }
  .expense-accounts td small { display: block; margin-top: 2px; color: #a0928c; font-size: 7px; }
  .expense-accounts tbody tr:hover { background: #fffbf8; }
  .expense-analysis-note { display: flex; align-items: flex-start; gap: 10px; margin-top: 12px; padding: 10px 12px; border-left: 3px solid ${NARANJA}; border-radius: 5px; background: #fff8f0; }
  .expense-analysis-note span { flex: 0 0 auto; color: ${NARANJA}; font-size: 8px; font-weight: 950; letter-spacing: .7px; text-transform: uppercase; }
  .expense-analysis-note p { margin: 0; color: #806f69; font-size: 8px; line-height: 1.5; }
  .production-history-panel { margin-bottom: 25px; padding: 16px; border: 1px solid #e7ddd7; border-radius: 10px; background: #fff; box-shadow: 0 5px 18px rgba(62,40,33,.045); }
  .production-month-kpis { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 9px; margin-bottom: 17px; }
  .production-month-bars { display: grid; gap: 8px; }
  .production-month-bars article { display: grid; grid-template-columns: 65px minmax(100px,1fr) 105px 175px; align-items: center; gap: 10px; }
  .production-month-bars article > span { color: #7e6f69; font-size: 9px; font-weight: 900; }
  .production-month-bars article > div { height: 9px; border-radius: 99px; background: #f1eae6; overflow: hidden; }
  .production-month-bars article > div i { display: block; min-width: 3px; height: 100%; border-radius: inherit; background: linear-gradient(90deg,${VINO},${NARANJA}); }
  .production-month-bars article > strong { color: #382927; font-size: 10px; text-align: right; }
  .production-month-bars article > small { color: #93847e; font-size: 8px; }
  .operational-ranking { margin-bottom: 0; }
  .profitability-panel { margin-top: 27px; padding: 20px; border: 1px solid #e5dad4; border-radius: 11px; background: #fff; box-shadow: 0 5px 18px rgba(62,40,33,.045); }
  .profitability-panel > header { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 15px; }
  .profitability-panel > header > div:first-child > span { color: ${NARANJA}; font-size: 9px; font-weight: 950; letter-spacing: 1.1px; }
  .profitability-panel h2 { margin: 3px 0; color: #4f292a; font-size: 20px; }
  .profitability-panel header p { margin: 0; color: #8c7e78; font-size: 11px; }
  .profitability-switch { display: flex; flex: 0 0 auto; gap: 3px; padding: 3px; border-radius: 7px; background: #f1ebe7; }
  .profitability-switch button { min-height: 34px; padding: 0 12px; border: 0; border-radius: 5px; background: transparent; color: #786b65; font-size: 10px; font-weight: 900; cursor: pointer; }
  .profitability-switch button.active { background: #fff; color: ${VINO}; box-shadow: 0 2px 7px rgba(67,42,34,.11); }
  .profitability-warning { margin-bottom: 12px; padding: 10px 12px; border-left: 3px solid #d99a28; border-radius: 5px; background: #fff8e8; color: #846222; font-size: 10px; }
  .profitability-kpis { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; margin-bottom: 15px; }
  .profitability-kpis article { min-width: 0; padding: 12px; border: 1px solid #ece3de; border-radius: 7px; background: #fcfaf9; }
  .profitability-kpis article > span { display: block; color: #7c6f69; font-size: 8px; font-weight: 950; letter-spacing: .45px; text-transform: uppercase; }
  .profitability-kpis article > strong { display: block; margin: 5px 0 2px; color: #342825; font-size: 20px; }
  .profitability-kpis article > small { color: #a0928c; font-size: 8px; }
  .profitability-kpis article.ready { border-top: 2px solid #159447; }
  .profitability-kpis article.pending { border-top: 2px solid #d99a28; }
  .profitability-table-wrap { width: 100%; overflow-x: auto; }
  .profitability-table { width: 100%; min-width: 1180px; border-collapse: collapse; }
  .profitability-table th { padding: 10px 9px; border-bottom: 2px solid #eadfd9; color: #887a74; font-size: 8px; font-weight: 950; letter-spacing: .5px; text-align: right; text-transform: uppercase; }
  .profitability-table th:first-child { text-align: left; }
  .profitability-table td { padding: 11px 9px; border-bottom: 1px solid #f0e9e5; color: #4c413d; font-size: 10px; text-align: right; white-space: nowrap; }
  .profitability-table td:first-child { min-width: 180px; text-align: left; }
  .profitability-table td:first-child strong { display: block; color: #542e2f; font-size: 11px; }
  .profitability-table td:first-child small { display: block; margin-top: 1px; color: #a0918b; font-size: 8px; }
  .profitability-table tbody tr:hover { background: #fffbf8; }
  .config-status { display: inline-flex; padding: 4px 7px; border-radius: 999px; font-size: 8px; font-weight: 950; }
  .config-status.ready { background: #e7f6ec; color: #087b35; }
  .config-status.pending { background: #fff4dc; color: #9a6a10; }
  .profitability-rules { padding: 15px; border: 1px solid #eadfd9; border-radius: 9px; background: #fcfaf9; }
  .profitability-rules-intro h3 { margin: 0 0 4px; color: #4f292a; font-size: 16px; }
  .profitability-rules-intro p { margin: 0; color: #8c7e78; font-size: 10px; line-height: 1.5; }
  .profitability-rules-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; margin-top: 13px; }
  .profitability-rules-grid label { display: grid; grid-template-columns: minmax(0,1fr) 170px; gap: 3px 12px; padding: 11px; border: 1px solid #ece3de; border-radius: 7px; background: #fff; }
  .profitability-rules-grid label > span { color: #542e2f; font-size: 10px; font-weight: 900; }
  .profitability-rules-grid label > small { grid-column: 1; color: #9b8c85; font-size: 8px; }
  .profitability-rules-grid select { grid-column: 2; grid-row: 1 / span 2; width: 100%; min-height: 38px; padding: 0 9px; border: 1px solid #d9ccc6; border-radius: 6px; background: #fff; color: #493c37; font-size: 10px; }
  .profitability-rules-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 12px; }
  .profitability-rules-actions span { color: #72645e; font-size: 9px; }
  .profitability-rules-actions button { min-height: 38px; padding: 0 15px; border: 0; border-radius: 7px; background: ${VINO}; color: #fff; font-size: 10px; font-weight: 900; cursor: pointer; }
  .profitability-rules-actions button:disabled { cursor: wait; opacity: .65; }
  .profitability-panel > footer { margin-top: 12px; padding-top: 10px; border-top: 1px solid #eee6e1; color: #8d7f79; font-size: 9px; line-height: 1.45; }
  .future-modules { display: grid; grid-template-columns: minmax(220px,.75fr) minmax(0,1.6fr); gap: 22px; margin-top: 22px; padding: 20px; border: 1px solid #ebdfd6; border-radius: 10px; background: #fffaf5; }
  .future-modules > div:first-child span, .data-notice > span { color: ${NARANJA}; font-size: 9px; font-weight: 950; letter-spacing: 1px; }
  .future-modules h3, .data-notice h3 { margin: 4px 0 0; color: #582e2f; font-size: 17px; }
  .future-modules > div:last-child { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px 18px; }
  .future-modules p { display: flex; align-items: center; gap: 8px; margin: 0; color: #746762; font-size: 11px; }
  .future-modules i { color: ${NARANJA}; font-size: 15px; font-style: normal; }
  .data-notice { max-width: 720px; margin-top: 22px; padding: 20px; border-left: 4px solid ${NARANJA}; border-radius: 7px; background: #fff8f0; }
  .data-notice p { margin: 6px 0 0; color: #7e6f69; font-size: 12px; line-height: 1.5; }

  @media (max-width: 1500px) {
    .dashboard-period-filter { grid-template-columns: repeat(4,minmax(0,1fr)); }
    .dashboard-period-buttons { grid-column:1 / span 2; }
    .dashboard-period-filter > button { align-self:end; }
    .dashboard-period-comparison { grid-column: 1 / -1; }
    .market-strip { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .executive-finance-grid, .production-grid, .financial-large { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .profitability-kpis { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .sku-market-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .commercial-columns { grid-template-columns: 1fr; }
    .production-month-kpis { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .expense-analysis-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 760px) {
    .wall-dashboard { padding: 15px 12px 26px; }
    .wall-header { align-items: flex-start; }
    .wall-header button { min-height: 38px; padding: 0 11px; font-size: 11px; }
    .dashboard-tabs { margin-bottom: 18px; }
    .dashboard-tabs button { flex: 0 0 auto; min-height: 39px; }
    .dashboard-period-filter { grid-template-columns: 1fr 1fr; margin-top: -7px; }
    .dashboard-period-buttons, .dashboard-period-comparison { grid-column: 1 / -1; }
    .profitability-panel { padding: 14px; }
    .profitability-panel > header { align-items: flex-start; flex-direction: column; }
    .profitability-rules-grid { grid-template-columns: 1fr; }
    .market-strip { gap: 8px; }
    .market-summary { padding: 13px; }
    .market-summary > strong { font-size: 24px; }
    .operation-ticker { flex-wrap: wrap; padding-bottom: 7px; }
    .operation-ticker > span { width: 100%; min-height: 28px; }
    .operation-ticker div { flex: 1; justify-content: center; padding: 8px 7px 0; border-right: 0; }
    .operation-ticker i { width: 100%; margin: 0; padding: 7px 0 0; text-align: center; }
    .sku-market-grid { grid-template-columns: 1fr; }
    .sales-week-bars article { grid-template-columns: 76px minmax(70px,1fr) 88px; gap: 7px; }
    .sales-week-bars article .trend { grid-column: 3; justify-self: end; }
    .financial-dashboard-head { align-items:flex-start; }
    .financial-dashboard-head > button { min-height:36px; padding:0 10px; font-size:8px; }
    .finance-week-bars article { grid-template-columns:76px minmax(70px,1fr) 92px; gap:7px; }
    .finance-week-bars article small { grid-column:2/-1; }
    .production-month-kpis { grid-template-columns: 1fr; }
    .production-month-bars article { grid-template-columns: 52px minmax(70px,1fr) 90px; gap: 7px; }
    .production-month-bars article > small { grid-column: 2 / -1; }
    .expense-analysis { padding: 13px; }
    .expense-rubrics, .expense-opportunities, .expense-accounts { padding: 12px; }
    .expense-rubrics footer { grid-template-columns: auto 1fr; }
    .expense-rubrics footer small { grid-column: 1 / -1; text-align: left; }
    .expense-opportunities article { grid-template-columns: 21px minmax(0,1fr); }
    .expense-opportunities article > span { grid-column: 2; text-align: left; }
    .expense-accounts table { min-width: 0; }
    .expense-accounts thead { display: none; }
    .expense-accounts table, .expense-accounts tbody, .expense-accounts tr, .expense-accounts td { display: block; width: 100%; }
    .expense-accounts tr { box-sizing: border-box; margin-bottom: 8px; padding: 9px; border: 1px solid #ebe1dc; border-radius: 8px; }
    .expense-accounts td, .expense-accounts td:first-child, .expense-accounts td:nth-child(2) { display: flex; align-items: center; justify-content: space-between; gap: 10px; box-sizing: border-box; padding: 5px 0; border: 0; text-align: right; }
    .expense-accounts td::before { content: attr(data-label); color: #988983; font-size: 7px; font-weight: 950; text-transform: uppercase; }
    .expense-accounts td:first-child { align-items: flex-start; margin-bottom: 3px; padding-bottom: 7px; border-bottom: 1px solid #eee6e1; }
    .expense-accounts td:first-child::before { display: none; }
    .future-modules { grid-template-columns: 1fr; gap: 13px; }
    .profitability-table { min-width: 0; }
    .profitability-table thead { display: none; }
    .profitability-table, .profitability-table tbody, .profitability-table tr, .profitability-table td { display: block; width: 100%; }
    .profitability-table tr { margin-bottom: 9px; padding: 10px; border: 1px solid #ebe1dc; border-radius: 8px; }
    .profitability-table td, .profitability-table td:first-child { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 6px 0; border: 0; text-align: right; }
    .profitability-table td::before { content: attr(data-label); color: #988983; font-size: 8px; font-weight: 900; text-transform: uppercase; }
    .profitability-table td:first-child { align-items: flex-start; border-bottom: 1px solid #eee6e1; margin-bottom: 4px; padding-bottom: 8px; }
    .profitability-table td:first-child::before { display: none; }
    .profitability-table td:first-child strong, .profitability-table td:first-child small { text-align: left; }
    .profitability-rules-grid label { grid-template-columns: 1fr; }
    .profitability-rules-grid select { grid-column: 1; grid-row: auto; margin-top: 5px; }
    .profitability-rules-actions { align-items: stretch; flex-direction: column; }
  }
  @media (max-width: 430px) {
    .dashboard-period-filter { grid-template-columns: 1fr; }
    .dashboard-period-buttons, .dashboard-period-comparison { grid-column: auto; }
    .dashboard-period-buttons > section { display:grid; grid-template-columns:1fr 1fr; }
    .wall-header h1 { font-size: 25px; }
    .wall-header p { font-size: 10px; }
    .market-summary-title { align-items: flex-start; }
    .market-summary span { font-size: 8px; }
    .market-summary > strong { font-size: 21px; }
    .wall-section-head { align-items: flex-start; flex-direction: column; }
    .executive-finance-grid, .production-grid, .financial-large { gap: 8px; }
    .pending-kpi, .operational-kpi { min-height: 91px; padding: 12px; }
    .pending-kpi strong, .operational-kpi strong { font-size: 21px; }
    .commercial-ranking article { grid-template-columns: 25px minmax(0,1fr) auto; gap: 8px; }
    .commercial-ranking article .trend { grid-column: 3; }
    .future-modules > div:last-child { grid-template-columns: 1fr; }
    .profitability-kpis { gap: 7px; }
    .profitability-kpis article { padding: 10px; }
    .profitability-kpis article > strong { font-size: 17px; }
  }
`
