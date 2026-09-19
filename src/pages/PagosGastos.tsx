import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"

import ModalMensaje from "../components/ModalMensaje"
import { supabase } from "../lib/supabase"
import {
  clasificarFacturaDb, clasificarFacturasMasivoDb, ejecutarPagoProgramadoDb,
  guardarFacturaCompletaDb,
  guardarPresupuestoSemanalDb, importarFacturas2026Db,
  obtenerAbonosFacturasDb, obtenerFacturasDb, obtenerImportacionesFacturasDb,
  obtenerPlanesPagoSemanalesDb, obtenerProgramacionesDb,
  programarFacturaDb, registrarAbonoFacturaDb,
  type AbonoFacturaDb, type FacturaDetalleDb, type ImportacionFacturaDb,
  type PagoFacturaEditar, type PlanPagoSemanalDb, type ProgramacionPagoDb,
} from "../repositories/facturasRepository"
import {
  obtenerCuentasPagosDb, obtenerReglasPagosDb,
  type CuentaPagoDb, type ReglaClasificacionPagoDb,
} from "../repositories/pagosRepository"
import {
  obtenerClientesPedidoDb,
  type ClientePedidoDb,
} from "../repositories/pedidoRepository"
import {
  calcularHashFacturaArchivo, leerArchivoFacturas2026,
  type ResultadoArchivoFacturas,
} from "../utils/facturasExcel"
import { crearReportePagosXlsx } from "../utils/exportarXlsx"

type Vista = "RESUMEN" | "FACTURAS" | "CLASIFICAR" | "PLAN" | "PAGADAS" | "IMPORTAR"
type ReferenciaPago = { referencias: string; fechaUltimoPago: string | null }
const VINO = "#8F1D24"
const NARANJA = "#F7931E"
const POR_PAGINA = 40
const CLAVE_VISTA_PAGOS = "cibuspan-one:facturas-pagos-vista"
const CLAVE_ESTADO_PAGOS = "cibuspan-one:facturas-pagos-estado-v2"
const VISTAS_PAGOS: Vista[] = ["RESUMEN", "FACTURAS", "CLASIFICAR", "PLAN", "PAGADAS", "IMPORTAR"]

type FacturaClienteAsignacionDb = {
  factura_id: string
  cliente_id: string
}

async function obtenerAsignacionesClientesFacturasDb() {
  const { data, error } = await supabase
    .from("fin_factura_clientes")
    .select("factura_id, cliente_id")

  if (error) {
    throw new Error(`No se pudieron cargar los clientes asociados a las facturas: ${error.message}`)
  }

  return (data ?? []) as FacturaClienteAsignacionDb[]
}

function vistaPagosInicial(): Vista {
  try {
    const guardada = (window.sessionStorage.getItem(CLAVE_VISTA_PAGOS)
      || window.localStorage.getItem(CLAVE_VISTA_PAGOS)) as Vista | null
    return guardada && VISTAS_PAGOS.includes(guardada) ? guardada : "RESUMEN"
  } catch {
    return "RESUMEN"
  }
}

function fechaIsoLocal(fecha: Date) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`
}
function sumarDias(fechaIso: string, dias: number) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIsoLocal(fecha)
}
function inicioSemana(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setDate(fecha.getDate() - (fecha.getDay() === 0 ? 6 : fecha.getDay() - 1))
  return fechaIsoLocal(fecha)
}
function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(valor || 0))
}
function numero(valor: number) { return new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 }).format(Number(valor || 0)) }
function fechaCorta(fecha: string | null) {
  if (!fecha) return "—"
  const [anio, mes, dia] = fecha.split("-")
  return `${dia}/${mes}/${anio}`
}
function numeroSemanaIso(fecha: string) {
  const objeto = new Date(`${fecha}T12:00:00`)
  const jueves = new Date(objeto); jueves.setDate(objeto.getDate() + 3)
  const primero = new Date(jueves.getFullYear(), 0, 4)
  return 1 + Math.round(((jueves.getTime() - primero.getTime()) / 86400000 - 3 + ((primero.getDay() + 6) % 7)) / 7)
}
function semanaEtiqueta(fecha: string) {
  const semana = numeroSemanaIso(fecha)
  return `Semana ${String(semana).padStart(2, "0")} · ${fecha.slice(0, 4)}`
}

const formularioVacio = {
  id: "", fecha_emision: fechaIsoLocal(new Date()), fecha_vencimiento: "",
  periodo_servicio: fechaIsoLocal(new Date()).slice(0, 7),
  numero_factura: "", proveedor: "", descripcion: "", subtotal: "",
  aplica_iva: true, tasa_iva: "15", retencion: "0", retencion_referencia: "",
  cuenta_codigo: "PENDIENTE", notas: "",
  afecta_tipo: "GENERAL" as "GENERAL" | "CLIENTE",
  cliente_id: "",
  cliente_ids: [] as string[],
}

type PagoEdicion = Omit<PagoFacturaEditar, "monto"> & {
  monto: string
  origen: "EXCEL" | "MANUAL"
}

type EstadoPagosPersistido = {
  vista: Vista
  semana: string
  buscar: string
  buscarPagadas: string
  proveedorPagadas: string
  mesPagadas: string
  estado: string
  buscarClasificacion: string
  proveedorClasificacion: string
  cuentaClasificacion: string
  afectaClasificacion: "GENERAL" | "CLIENTE"
  clienteClasificacion: string
  recordarClasificacion: boolean
  seleccionClasificacion: string[]
  filtroVencimiento: string
  filtroSemanaPago: string
  pagina: number
  paginaPagadas: number
  formulario: typeof formularioVacio
  pagosEdicion: PagoEdicion[]
  mostrarFormulario: boolean
  guardadoEn: string
}

function leerEstadoPagos(): Partial<EstadoPagosPersistido> {
  try {
    const contenido = window.sessionStorage.getItem(CLAVE_ESTADO_PAGOS)
      || window.localStorage.getItem(CLAVE_ESTADO_PAGOS)
    return contenido ? JSON.parse(contenido) as Partial<EstadoPagosPersistido> : {}
  } catch {
    return {}
  }
}

function escribirEstadoPagos(estado: EstadoPagosPersistido) {
  try {
    const contenido = JSON.stringify(estado)
    window.localStorage.setItem(CLAVE_ESTADO_PAGOS, contenido)
    window.sessionStorage.setItem(CLAVE_ESTADO_PAGOS, contenido)
    window.localStorage.setItem(CLAVE_VISTA_PAGOS, estado.vista)
  } catch {
    // El módulo sigue funcionando si el navegador bloquea el almacenamiento.
  }
}

export default function PagosGastos() {
  const hoy = fechaIsoLocal(new Date())
  const [estadoInicial] = useState(leerEstadoPagos)
  const vistaGuardada = vistaPagosInicial()
  const [vista, setVista] = useState<Vista>(vistaGuardada)
  const [cuentas, setCuentas] = useState<CuentaPagoDb[]>([])
  const [reglas, setReglas] = useState<ReglaClasificacionPagoDb[]>([])
  const [clientes, setClientes] = useState<ClientePedidoDb[]>([])
  const [clientesPorFactura, setClientesPorFactura] = useState<Map<string, string[]>>(new Map())
  const [facturas, setFacturas] = useState<FacturaDetalleDb[]>([])
  const [planes, setPlanes] = useState<ProgramacionPagoDb[]>([])
  const [planesSemanales, setPlanesSemanales] = useState<PlanPagoSemanalDb[]>([])
  const [abonos, setAbonos] = useState<AbonoFacturaDb[]>([])
  const [importaciones, setImportaciones] = useState<ImportacionFacturaDb[]>([])
  const [semana, setSemana] = useState(estadoInicial.semana || inicioSemana(hoy))
  const [buscar, setBuscar] = useState(estadoInicial.buscar || "")
  const [buscarPagadas, setBuscarPagadas] = useState(estadoInicial.buscarPagadas || "")
  const [proveedorPagadas, setProveedorPagadas] = useState(estadoInicial.proveedorPagadas || "TODOS")
  const [mesPagadas, setMesPagadas] = useState(estadoInicial.mesPagadas || hoy.slice(0, 7))
  const [estado, setEstado] = useState(estadoInicial.estado || "ABIERTAS")
  const [buscarClasificacion, setBuscarClasificacion] = useState(estadoInicial.buscarClasificacion || "")
  const [proveedorClasificacion, setProveedorClasificacion] = useState(estadoInicial.proveedorClasificacion || "TODOS")
  const [cuentaClasificacion, setCuentaClasificacion] = useState(estadoInicial.cuentaClasificacion || "PENDIENTE")
  const [afectaClasificacion, setAfectaClasificacion] = useState<"GENERAL" | "CLIENTE">(estadoInicial.afectaClasificacion || "GENERAL")
  const [clienteClasificacion, setClienteClasificacion] = useState(estadoInicial.clienteClasificacion || "")
  const [recordarClasificacion, setRecordarClasificacion] = useState(estadoInicial.recordarClasificacion ?? true)
  const [seleccionClasificacion, setSeleccionClasificacion] = useState<Set<string>>(
    () => new Set(estadoInicial.seleccionClasificacion || []),
  )
  const [filtroVencimiento, setFiltroVencimiento] = useState(estadoInicial.filtroVencimiento || "TODAS")
  const [filtroSemanaPago, setFiltroSemanaPago] = useState(estadoInicial.filtroSemanaPago || "TODAS")
  const [pagina, setPagina] = useState(estadoInicial.pagina || 1)
  const [paginaPagadas, setPaginaPagadas] = useState(estadoInicial.paginaPagadas || 1)
  const [formulario, setFormulario] = useState(() => {
    const recuperado = { ...formularioVacio, ...estadoInicial.formulario }
    return {
      ...recuperado,
      cliente_ids: recuperado.cliente_ids?.length
        ? recuperado.cliente_ids
        : recuperado.cliente_id
          ? [recuperado.cliente_id]
          : [],
    }
  })
  const [pagosEdicion, setPagosEdicion] = useState<PagoEdicion[]>(estadoInicial.pagosEdicion || [])
  const [mostrarFormulario, setMostrarFormulario] = useState(Boolean(estadoInicial.mostrarFormulario))
  const [abonoFactura, setAbonoFactura] = useState<FacturaDetalleDb | null>(null)
  const [abonoMonto, setAbonoMonto] = useState("")
  const [abonoFecha, setAbonoFecha] = useState(hoy)
  const [abonoDocumento, setAbonoDocumento] = useState("")
  const [pagoProgramado, setPagoProgramado] = useState<{ factura: FacturaDetalleDb; plan: ProgramacionPagoDb } | null>(null)
  const [pagoProgramadoFecha, setPagoProgramadoFecha] = useState(hoy)
  const [pagoProgramadoDocumento, setPagoProgramadoDocumento] = useState("")
  const [pagoProgramadoNotas, setPagoProgramadoNotas] = useState("")
  const [presupuestoEdicion, setPresupuestoEdicion] = useState("")
  const [planesGuardando, setPlanesGuardando] = useState<Set<string>>(new Set())
  const [archivo, setArchivo] = useState<File | null>(null)
  const [archivoHash, setArchivoHash] = useState("")
  const [archivoLeido, setArchivoLeido] = useState<ResultadoArchivoFacturas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const estadoPersistenteRef = useRef<EstadoPagosPersistido | null>(null)
  const filtroFacturasListoRef = useRef(false)
  const filtroPagadasListoRef = useRef(false)

  useEffect(() => { void cargarDatos() }, [])
  useEffect(() => {
    const actual: EstadoPagosPersistido = {
      vista, semana, buscar, buscarPagadas, proveedorPagadas, mesPagadas, estado,
      buscarClasificacion, proveedorClasificacion, cuentaClasificacion,
      afectaClasificacion, clienteClasificacion, recordarClasificacion,
      seleccionClasificacion: Array.from(seleccionClasificacion),
      filtroVencimiento, filtroSemanaPago, pagina, paginaPagadas, formulario, pagosEdicion,
      mostrarFormulario, guardadoEn: new Date().toISOString(),
    }
    estadoPersistenteRef.current = actual
    escribirEstadoPagos(actual)
  }, [vista, semana, buscar, buscarPagadas, proveedorPagadas, mesPagadas, estado,
    buscarClasificacion, proveedorClasificacion, cuentaClasificacion,
    afectaClasificacion, clienteClasificacion, recordarClasificacion, seleccionClasificacion,
    filtroVencimiento, filtroSemanaPago, pagina, paginaPagadas, formulario, pagosEdicion, mostrarFormulario])

  useEffect(() => {
    const guardarAntesDeOcultar = () => {
      if (estadoPersistenteRef.current) escribirEstadoPagos(estadoPersistenteRef.current)
    }
    const controlarVisibilidad = () => {
      if (document.visibilityState === "hidden") guardarAntesDeOcultar()
    }
    window.addEventListener("pagehide", guardarAntesDeOcultar)
    window.addEventListener("blur", guardarAntesDeOcultar)
    document.addEventListener("visibilitychange", controlarVisibilidad)
    return () => {
      window.removeEventListener("pagehide", guardarAntesDeOcultar)
      window.removeEventListener("blur", guardarAntesDeOcultar)
      document.removeEventListener("visibilitychange", controlarVisibilidad)
    }
  }, [])
  async function cargarDatos() {
    setCargando(true); setError("")
    try {
      const [cuentasDb, reglasDb, clientesDb, asignacionesClientesDb, facturasDb, planesDb, planesSemanalesDb, abonosDb, importacionesDb] = await Promise.all([
        obtenerCuentasPagosDb(), obtenerReglasPagosDb(), obtenerClientesPedidoDb(),
        obtenerAsignacionesClientesFacturasDb(),
        obtenerFacturasDb(), obtenerProgramacionesDb(), obtenerPlanesPagoSemanalesDb(),
        obtenerAbonosFacturasDb(), obtenerImportacionesFacturasDb(),
      ])
      const mapaClientes = new Map<string, string[]>()
      asignacionesClientesDb.forEach((asignacion) => {
        const ids = mapaClientes.get(asignacion.factura_id) ?? []
        if (!ids.includes(asignacion.cliente_id)) ids.push(asignacion.cliente_id)
        mapaClientes.set(asignacion.factura_id, ids)
      })
      setCuentas(cuentasDb); setReglas(reglasDb); setClientes(clientesDb); setClientesPorFactura(mapaClientes); setFacturas(facturasDb)
      setPlanes(planesDb); setPlanesSemanales(planesSemanalesDb); setAbonos(abonosDb); setImportaciones(importacionesDb)
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar el módulo.") }
    finally { setCargando(false) }
  }

  const nombresClientesPorFactura = useMemo(() => {
    const nombres = new Map(clientes.map((cliente) => [cliente.id, cliente.nombre]))
    const resultado = new Map<string, string>()
    clientesPorFactura.forEach((ids, facturaId) => {
      const etiquetas = ids.map((id) => nombres.get(id)).filter((nombre): nombre is string => Boolean(nombre))
      if (etiquetas.length) resultado.set(facturaId, etiquetas.join(" · "))
    })
    return resultado
  }, [clientes, clientesPorFactura])

  function destinoFactura(factura: FacturaDetalleDb) {
    if (factura.afecta_tipo !== "CLIENTE") return "Negocio completo"
    return nombresClientesPorFactura.get(factura.id)
      || factura.cliente_nombre
      || "Cliente sin nombre"
  }

  const abiertas = useMemo(() => facturas.filter((f) => ["PENDIENTE", "ABONO"].includes(f.estado)), [facturas])
  const referenciasPago = useMemo(() => {
    const agrupadas = new Map<string, { documentos: string[]; fechaUltimoPago: string | null }>()
    abonos.forEach((abono) => {
      const existente = agrupadas.get(abono.factura_id) ?? { documentos: [], fechaUltimoPago: null }
      const documento = abono.documento?.trim()
      if (documento && !existente.documentos.includes(documento)) existente.documentos.push(documento)
      if (!existente.fechaUltimoPago || abono.fecha_pago > existente.fechaUltimoPago) existente.fechaUltimoPago = abono.fecha_pago
      agrupadas.set(abono.factura_id, existente)
    })
    return new Map<string, ReferenciaPago>(Array.from(agrupadas, ([id, pago]) => [id, {
      referencias: pago.documentos.join(" · "),
      fechaUltimoPago: pago.fechaUltimoPago,
    }]))
  }, [abonos])
  const proveedoresPagadas = useMemo(
    () => Array.from(new Set(abonos.map((abono) => abono.proveedor))).sort((a, b) => a.localeCompare(b, "es")),
    [abonos],
  )
  const proveedoresSugeridos = useMemo(
    () => Array.from(new Set(facturas.map((factura) => factura.proveedor).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "es")),
    [facturas],
  )
  const descripcionesSugeridas = useMemo(
    () => Array.from(new Set(facturas.map((factura) => factura.descripcion?.trim()).filter((valor): valor is string => Boolean(valor))))
      .sort((a, b) => a.localeCompare(b, "es"))
      .slice(0, 800),
    [facturas],
  )
  const pagosReporteFiltrados = useMemo(() => {
    const texto = buscarPagadas.trim().toLocaleLowerCase("es")
    return abonos.filter((abono) => {
      const coincideMes = !mesPagadas || abono.fecha_pago.startsWith(mesPagadas)
      const coincideProveedor = proveedorPagadas === "TODOS" || abono.proveedor === proveedorPagadas
      const contenido = `${abono.numero_factura ?? ""} ${abono.proveedor} ${abono.descripcion ?? ""} ${abono.documento ?? ""} ${abono.cuenta_nombre} ${abono.cliente_nombre ?? "negocio completo"}`.toLocaleLowerCase("es")
      return coincideMes && coincideProveedor && (!texto || contenido.includes(texto))
    }).sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago) || a.proveedor.localeCompare(b.proveedor, "es"))
  }, [abonos, buscarPagadas, proveedorPagadas, mesPagadas])
  const pagadasFiltradas = useMemo(() => {
    const ids = new Set(pagosReporteFiltrados.map((pago) => pago.factura_id))
    const fechaPago = new Map<string, string>()
    pagosReporteFiltrados.forEach((pago) => {
      if (!fechaPago.has(pago.factura_id)) fechaPago.set(pago.factura_id, pago.fecha_pago)
    })
    return facturas.filter((factura) => ids.has(factura.id)).sort((a, b) =>
      (fechaPago.get(b.id) ?? "").localeCompare(fechaPago.get(a.id) ?? ""))
  }, [facturas, pagosReporteFiltrados])
  const totalReportePagos = useMemo(
    () => pagosReporteFiltrados.reduce((total, pago) => total + Number(pago.monto), 0),
    [pagosReporteFiltrados],
  )
  const planesSemana = useMemo(() => new Map(planes.filter((p) => p.semana_inicio === semana).map((p) => [p.factura_id, p])), [planes, semana])
  const resumenPlanSemana = useMemo(
    () => planesSemanales.find((plan) => plan.semana_inicio === semana),
    [planesSemanales, semana],
  )
  const programacionesSeleccionadas = useMemo(
    () => Array.from(planesSemana.values()).filter((plan) => plan.seleccionada),
    [planesSemana],
  )
  const totalPendiente = abiertas.reduce((total, f) => total + Number(f.saldo), 0)
  const totalProgramado = programacionesSeleccionadas.reduce((total, plan) => total + Number(plan.monto_programado), 0)
  const totalEjecutadoPlan = programacionesSeleccionadas.reduce(
    (total, plan) => total + (plan.estado_plan === "PAGADO" ? Number(plan.monto_pagado ?? plan.monto_programado) : 0),
    0,
  )
  const totalPorEjecutarPlan = programacionesSeleccionadas.reduce(
    (total, plan) => total + (plan.estado_plan === "PREPARADO" ? Number(plan.monto_programado) : 0),
    0,
  )
  const presupuestoDisponible = Number(presupuestoEdicion || 0)
  const saldoPresupuesto = presupuestoDisponible - totalProgramado
  const pagosMes = abonos.filter((a) => a.fecha_pago.slice(0, 7) === hoy.slice(0, 7)).reduce((total, a) => total + Number(a.monto), 0)
  const vencidas = abiertas.filter((f) => f.fecha_vencimiento && f.fecha_vencimiento < hoy)

  const facturasFiltradas = useMemo(() => {
    const texto = buscar.trim().toLocaleLowerCase("es")
    return facturas.filter((f) => {
      const coincideEstado = estado === "TODAS" || (estado === "ABIERTAS" ? ["PENDIENTE", "ABONO"].includes(f.estado) : f.estado === estado)
      return coincideEstado && (!texto || `${f.proveedor} ${f.numero_factura ?? ""} ${f.descripcion ?? ""} ${f.cliente_nombre ?? "negocio completo"}`.toLocaleLowerCase("es").includes(texto))
    })
  }, [facturas, buscar, estado])

  const facturasPorClasificar = useMemo(
    () => facturas.filter((factura) => factura.estado_clasificacion === "PENDIENTE"),
    [facturas],
  )
  const proveedoresPorClasificar = useMemo(
    () => Array.from(new Set(facturasPorClasificar.map((factura) => factura.proveedor)))
      .sort((a, b) => a.localeCompare(b, "es")),
    [facturasPorClasificar],
  )
  const facturasClasificacionFiltradas = useMemo(() => {
    const texto = buscarClasificacion.trim().toLocaleLowerCase("es")
    return facturasPorClasificar.filter((factura) => {
      const coincideProveedor = proveedorClasificacion === "TODOS"
        || factura.proveedor === proveedorClasificacion
      const contenido = `${factura.proveedor} ${factura.numero_factura ?? ""} ${factura.descripcion ?? ""}`
        .toLocaleLowerCase("es")
      return coincideProveedor && (!texto || contenido.includes(texto))
    }).sort((a, b) => a.proveedor.localeCompare(b.proveedor, "es")
      || (a.fecha_emision ?? "").localeCompare(b.fecha_emision ?? ""))
  }, [facturasPorClasificar, buscarClasificacion, proveedorClasificacion])
  const facturasClasificacionSeleccionadas = useMemo(
    () => facturasPorClasificar.filter((factura) => seleccionClasificacion.has(factura.id)),
    [facturasPorClasificar, seleccionClasificacion],
  )
  const totalClasificacionSeleccionada = useMemo(
    () => facturasClasificacionSeleccionadas.reduce(
      (total, factura) => total + Number(factura.valor_neto_pagar), 0,
    ),
    [facturasClasificacionSeleccionadas],
  )
  const todasClasificacionVisibles = facturasClasificacionFiltradas.length > 0
    && facturasClasificacionFiltradas.every((factura) => seleccionClasificacion.has(factura.id))

  const semanasPagoDisponibles = useMemo(
    () => Array.from({ length: 53 }, (_, indice) => indice + 1),
    [],
  )

  const planFiltrado = useMemo(() => {
    const fin = sumarDias(semana, 6); const texto = buscar.trim().toLocaleLowerCase("es")
    return facturas.filter((f) => {
      const plan = planesSemana.get(f.id)
      const estaAbierta = ["PENDIENTE", "ABONO"].includes(f.estado)
      if (!estaAbierta && !(plan?.seleccionada && plan.estado_plan === "PAGADO")) return false
      const coincideTexto = !texto || `${f.proveedor} ${f.numero_factura ?? ""} ${f.descripcion ?? ""}`.toLocaleLowerCase("es").includes(texto)
      const coincideFecha = filtroVencimiento === "TODAS" ||
        (filtroVencimiento === "VENCIDAS" && Boolean(f.fecha_vencimiento && f.fecha_vencimiento < semana)) ||
        (filtroVencimiento === "SEMANA" && Boolean(f.fecha_vencimiento && f.fecha_vencimiento >= semana && f.fecha_vencimiento <= fin)) ||
        (filtroVencimiento === "SIN_FECHA" && !f.fecha_vencimiento)
      const yaSeleccionada = Boolean(plan?.seleccionada)
      const coincideSemanaPago = yaSeleccionada
        || filtroSemanaPago === "TODAS"
        || (filtroSemanaPago === "SIN_SEMANA" && !f.semana_pago_numero)
        || Boolean(f.semana_pago_numero && f.semana_pago_numero <= Number(filtroSemanaPago))
      return coincideTexto && coincideFecha && coincideSemanaPago
    }).sort((a, b) => {
      const planA = planesSemana.get(a.id)
      const planB = planesSemana.get(b.id)
      const orden = (plan?: ProgramacionPagoDb) => plan?.estado_plan === "PREPARADO" && plan.seleccionada ? 0 : plan?.estado_plan === "PAGADO" ? 1 : 2
      return orden(planA) - orden(planB)
        || (a.semana_pago_numero ?? 99) - (b.semana_pago_numero ?? 99)
        || (a.fecha_vencimiento ?? "9999-12-31").localeCompare(b.fecha_vencimiento ?? "9999-12-31")
    })
  }, [facturas, buscar, filtroVencimiento, filtroSemanaPago, semana, planesSemana])

  useEffect(() => {
    setPresupuestoEdicion(resumenPlanSemana ? String(Number(resumenPlanSemana.presupuesto_disponible).toFixed(2)) : "")
  }, [resumenPlanSemana, semana])

  useEffect(() => {
    if (!filtroFacturasListoRef.current) {
      filtroFacturasListoRef.current = true
      return
    }
    setPagina(1)
  }, [buscar, estado])
  useEffect(() => {
    if (!filtroPagadasListoRef.current) {
      filtroPagadasListoRef.current = true
      return
    }
    setPaginaPagadas(1)
  }, [buscarPagadas, proveedorPagadas, mesPagadas])
  const paginas = Math.max(1, Math.ceil(facturasFiltradas.length / POR_PAGINA))
  const paginaFacturas = facturasFiltradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const paginasPagadas = Math.max(1, Math.ceil(pagadasFiltradas.length / POR_PAGINA))
  const paginaFacturasPagadas = pagadasFiltradas.slice((paginaPagadas - 1) * POR_PAGINA, paginaPagadas * POR_PAGINA)

  async function seleccionarArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const seleccionado = evento.target.files?.[0]; if (!seleccionado) return
    setProcesando(true); setError(""); setMensaje(""); setArchivoLeido(null)
    try {
      const [resultado, hash] = await Promise.all([leerArchivoFacturas2026(seleccionado, cuentas, reglas), calcularHashFacturaArchivo(seleccionado)])
      setArchivo(seleccionado); setArchivoHash(hash); setArchivoLeido(resultado)
    } catch (err) {
      if (inputRef.current) inputRef.current.value = ""
      setError(err instanceof Error ? err.message : "No se pudo leer el Excel.")
    } finally { setProcesando(false) }
  }

  function cambiarCuentaPrevia(clave: string, cuenta: string) {
    setArchivoLeido((actual) => {
      if (!actual) return actual
      const lineas = actual.lineas.map((linea) => linea.clave_origen === clave ? {
        ...linea, cuenta_codigo: cuenta,
        estado_clasificacion: cuenta === "PENDIENTE" ? "PENDIENTE" as const : "REVISADA" as const,
        confianza: cuenta === "PENDIENTE" ? 0 : 1,
      } : linea)
      return { ...actual, lineas, clasificadas: lineas.filter((l) => l.estado_clasificacion !== "PENDIENTE").length, porRevisar: lineas.filter((l) => l.estado_clasificacion === "PENDIENTE").length }
    })
  }

  async function importarArchivo() {
    if (!archivo || !archivoLeido || !archivoHash) return
    setProcesando(true); setError("")
    try {
      const r = await importarFacturas2026Db({ archivoNombre: archivo.name, archivoHash, hojaOrigen: archivoLeido.hojaOrigen, lineas: archivoLeido.lineas })
      setMensaje(`Importación completada: ${r.facturas_nuevas} nuevas, ${r.facturas_actualizadas} actualizadas y ${r.facturas_pendientes} pendientes.`)
      setArchivo(null); setArchivoLeido(null); setArchivoHash(""); if (inputRef.current) inputRef.current.value = ""
      await cargarDatos(); cambiarVista("FACTURAS")
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudieron importar las facturas.") }
    finally { setProcesando(false) }
  }

  function cambiarVista(destino: Vista) {
    try {
      window.localStorage.setItem(CLAVE_VISTA_PAGOS, destino)
      window.sessionStorage.setItem(CLAVE_VISTA_PAGOS, destino)
      if (estadoPersistenteRef.current) {
        const actualizado = {
          ...estadoPersistenteRef.current,
          vista: destino,
          guardadoEn: new Date().toISOString(),
        }
        estadoPersistenteRef.current = actualizado
        escribirEstadoPagos(actualizado)
      }
    } catch {
      // La navegación interna continúa sin almacenamiento.
    }
    setVista(destino)
  }

  function nuevaFactura() {
    setFormulario({ ...formularioVacio, fecha_emision: hoy, periodo_servicio: hoy.slice(0, 7) })
    setPagosEdicion([])
    setMostrarFormulario(true)
  }
  function editarFactura(f: FacturaDetalleDb) {
    const clienteIds = clientesPorFactura.get(f.id)?.length
      ? clientesPorFactura.get(f.id)!
      : f.cliente_ids?.length
        ? f.cliente_ids
        : f.cliente_id
          ? [f.cliente_id]
          : []
    setFormulario({ id: f.id, fecha_emision: f.fecha_emision ?? "", fecha_vencimiento: f.fecha_vencimiento ?? "", periodo_servicio: (f.periodo_servicio ?? f.fecha_emision ?? "").slice(0, 7), numero_factura: f.numero_factura ?? "", proveedor: f.proveedor, descripcion: f.descripcion ?? "", subtotal: String(f.subtotal), aplica_iva: f.aplica_iva, tasa_iva: String(f.tasa_iva), retencion: String(f.retencion), retencion_referencia: f.retencion_referencia ?? "", cuenta_codigo: f.cuenta_codigo, notas: f.notas ?? "", afecta_tipo: f.afecta_tipo ?? "GENERAL", cliente_id: clienteIds[0] ?? "", cliente_ids: clienteIds })
    setPagosEdicion(abonos.filter((abono) => abono.factura_id === f.id).map((abono) => ({
      id: abono.id,
      fecha_pago: abono.fecha_pago,
      monto: String(Number(abono.monto).toFixed(2)),
      documento: abono.documento ?? "",
      notas: abono.notas ?? "",
      origen: abono.origen,
    })))
    setMostrarFormulario(true); window.scrollTo({ top: 0, behavior: "smooth" })
  }
  async function guardarFormulario() {
    setProcesando(true); setError("")
    try {
      const clienteIds = formulario.afecta_tipo === "CLIENTE"
        ? formulario.cliente_ids
        : []
      await guardarFacturaCompletaDb({ ...formulario, periodo_servicio: `${formulario.periodo_servicio}-01`, id: formulario.id || null, subtotal: Number(formulario.subtotal), tasa_iva: Number(formulario.tasa_iva), retencion: Number(formulario.retencion || 0), cliente_id: clienteIds[0] ?? null, cliente_ids: clienteIds }, pagosEdicion.map((pago) => ({ ...pago, monto: Number(pago.monto) })))
      setMensaje(formulario.id ? "Factura y pagos actualizados." : "Factura creada.")
      setMostrarFormulario(false); setPagosEdicion([]); await cargarDatos()
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la factura.") }
    finally { setProcesando(false) }
  }
  async function cambiarPlan(f: FacturaDetalleDb, seleccionada: boolean, monto?: number) {
    const claveGuardado = `${f.id}|${semana}`
    if (planesGuardando.has(claveGuardado)) return
    const anterior = planesSemana.get(f.id)
    const montoProgramado = monto ?? Number(anterior?.monto_programado ?? f.saldo)
    const actualizadoEn = new Date().toISOString()
    const temporal: ProgramacionPagoDb = {
      id: anterior?.id ?? `local:${claveGuardado}`,
      factura_id: f.id,
      semana_inicio: semana,
      semana_numero: numeroSemanaIso(semana),
      seleccionada,
      monto_programado: montoProgramado,
      notas: anterior?.notas ?? null,
      actualizado_en: actualizadoEn,
      estado_plan: anterior?.estado_plan ?? "PREPARADO",
      abono_id: anterior?.abono_id ?? null,
      fecha_pago: anterior?.fecha_pago ?? null,
      monto_pagado: anterior?.monto_pagado ?? null,
      documento_pago: anterior?.documento_pago ?? null,
      pagado_en: anterior?.pagado_en ?? null,
    }

    setError("")
    setPlanesGuardando((actual) => new Set(actual).add(claveGuardado))
    setPlanes((actuales) => anterior
      ? actuales.map((plan) => plan.factura_id === f.id && plan.semana_inicio === semana ? temporal : plan)
      : [...actuales, temporal])
    try {
      const id = await programarFacturaDb({ facturaId: f.id, semanaInicio: semana, seleccionada, monto: montoProgramado })
      setPlanes((actuales) => actuales.map((plan) =>
        plan.factura_id === f.id && plan.semana_inicio === semana
          ? { ...plan, id, actualizado_en: new Date().toISOString() }
          : plan))
    } catch (err) {
      setPlanes((actuales) => anterior
        ? actuales.map((plan) => plan.factura_id === f.id && plan.semana_inicio === semana ? anterior : plan)
        : actuales.filter((plan) => !(plan.factura_id === f.id && plan.semana_inicio === semana)))
      setError(err instanceof Error ? err.message : "No se pudo actualizar la selección.")
    } finally {
      setPlanesGuardando((actual) => {
        const siguiente = new Set(actual)
        siguiente.delete(claveGuardado)
        return siguiente
      })
    }
  }
  async function guardarPresupuestoSemana() {
    const presupuesto = Number(presupuestoEdicion || 0)
    if (!Number.isFinite(presupuesto) || presupuesto < 0) {
      setError("El dinero disponible debe ser un valor válido y no puede ser negativo.")
      return
    }
    setProcesando(true); setError("")
    try {
      await guardarPresupuestoSemanalDb({ semanaInicio: semana, presupuesto })
      setMensaje("Dinero disponible de la semana guardado para todo el equipo.")
      await cargarDatos()
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el dinero disponible.") }
    finally { setProcesando(false) }
  }
  function abrirPagoProgramado(factura: FacturaDetalleDb, plan: ProgramacionPagoDb) {
    setPagoProgramado({ factura, plan })
    setPagoProgramadoFecha(hoy)
    setPagoProgramadoDocumento("")
    setPagoProgramadoNotas("")
  }
  async function guardarPagoProgramado() {
    if (!pagoProgramado) return
    if (!pagoProgramadoDocumento.trim()) {
      setError("Ingresa la referencia bancaria antes de marcar el pago con P.")
      return
    }
    setProcesando(true); setError("")
    try {
      await ejecutarPagoProgramadoDb({
        programacionId: pagoProgramado.plan.id,
        fechaPago: pagoProgramadoFecha,
        documento: pagoProgramadoDocumento,
        notas: pagoProgramadoNotas,
      })
      setMensaje(`Pago registrado para ${pagoProgramado.factura.proveedor}. La fila quedó marcada en azul con P.`)
      setPagoProgramado(null)
      await cargarDatos()
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo completar el pago programado.") }
    finally { setProcesando(false) }
  }
  function abrirAbono(f: FacturaDetalleDb) { setAbonoFactura(f); setAbonoMonto(String(f.saldo)); setAbonoFecha(hoy); setAbonoDocumento("") }
  async function guardarAbono() {
    if (!abonoFactura) return
    setProcesando(true); setError("")
    try {
      await registrarAbonoFacturaDb({ facturaId: abonoFactura.id, fechaPago: abonoFecha, monto: Number(abonoMonto), documento: abonoDocumento, notas: "" })
      setMensaje(`Abono registrado para ${abonoFactura.proveedor}.`); setAbonoFactura(null); await cargarDatos()
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar el abono.") }
    finally { setProcesando(false) }
  }
  async function cambiarClasificacion(f: FacturaDetalleDb, cuentaCodigo: string, recordar = false) {
    setProcesando(true); setError("")
    try { await clasificarFacturaDb({ facturaId: f.id, cuentaCodigo, recordarProveedor: recordar }); if (recordar) setMensaje(`Cuenta recordada para ${f.proveedor}.`); await cargarDatos() }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo clasificar.") }
    finally { setProcesando(false) }
  }

  function alternarFacturaClasificacion(facturaId: string, seleccionada: boolean) {
    setSeleccionClasificacion((actual) => {
      const siguiente = new Set(actual)
      if (seleccionada) siguiente.add(facturaId)
      else siguiente.delete(facturaId)
      return siguiente
    })
  }

  function alternarTodasClasificacion(seleccionadas: boolean) {
    setSeleccionClasificacion((actual) => {
      const siguiente = new Set(actual)
      facturasClasificacionFiltradas.forEach((factura) => {
        if (seleccionadas) siguiente.add(factura.id)
        else siguiente.delete(factura.id)
      })
      return siguiente
    })
  }

  async function aplicarClasificacionMasiva() {
    if (facturasClasificacionSeleccionadas.length === 0) {
      setError("Selecciona al menos una factura.")
      return
    }
    if (cuentaClasificacion === "PENDIENTE") {
      setError("Selecciona la cuenta que corresponde a las facturas.")
      return
    }
    if (afectaClasificacion === "CLIENTE" && !clienteClasificacion) {
      setError("Selecciona el cliente afectado.")
      return
    }
    setProcesando(true); setError("")
    try {
      const resultado = await clasificarFacturasMasivoDb({
        facturaIds: facturasClasificacionSeleccionadas.map((factura) => factura.id),
        cuentaCodigo: cuentaClasificacion,
        afectaTipo: afectaClasificacion,
        clienteId: afectaClasificacion === "CLIENTE" ? clienteClasificacion : null,
        recordarProveedor: recordarClasificacion,
      })
      setSeleccionClasificacion(new Set())
      setMensaje(`${numero(resultado.facturas_actualizadas)} facturas clasificadas${resultado.proveedores_recordados ? ` y ${numero(resultado.proveedores_recordados)} proveedores recordados` : ""}.`)
      await cargarDatos()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la clasificación masiva.")
    } finally { setProcesando(false) }
  }

  async function descargarReportePagos() {
    if (pagosReporteFiltrados.length === 0) {
      setError("No existen pagos para los filtros seleccionados.")
      return
    }
    const estados = new Map(facturas.map((factura) => [factura.id, factura.estado]))
    const archivo = await crearReportePagosXlsx({
      mes: mesPagadas,
      proveedor: proveedorPagadas === "TODOS" ? "Todos" : proveedorPagadas,
      generado: new Date().toLocaleString("es-EC"),
      total: totalReportePagos,
      pagos: pagosReporteFiltrados.map((pago) => ({
        fechaPago: pago.fecha_pago,
        proveedor: pago.proveedor,
        factura: pago.numero_factura ?? "Sin número",
        descripcion: pago.descripcion ?? "",
        cuenta: pago.cuenta_nombre,
        afectaA: pago.afecta_tipo === "CLIENTE" ? "Cliente específico" : "Negocio completo",
        cliente: pago.cliente_nombre ?? "",
        referencia: pago.documento ?? "",
        origen: pago.origen,
        estadoFactura: estados.get(pago.factura_id) ?? "",
        monto: Number(pago.monto),
      })),
    })
    const url = URL.createObjectURL(archivo)
    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = `reporte-pagos-${mesPagadas || "todos"}.xlsx`
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    URL.revokeObjectURL(url)
    setMensaje(`Reporte generado: ${numero(pagosReporteFiltrados.length)} pagos por ${moneda(totalReportePagos)}.`)
  }

  const subtotalForm = Number(formulario.subtotal || 0)
  const ivaForm = formulario.aplica_iva ? subtotalForm * Number(formulario.tasa_iva || 0) / 100 : 0
  const totalForm = subtotalForm + ivaForm
  const netoForm = Math.max(0, totalForm - Number(formulario.retencion || 0))
  const pendientesPrevia = archivoLeido?.lineas.filter((l) => l.estado_clasificacion === "PENDIENTE").slice(0, 60) ?? []

  return (
    <main className="cxp-page"><style>{css}</style><style>{tablaAjustadaCss}</style>
      <ModalMensaje abierto={mensaje !== ""} tipo="EXITO" mensaje={mensaje} cerrar={() => setMensaje("")} cierreAutomaticoMs={4500}/>
      <ModalMensaje abierto={error !== ""} tipo="ERROR" mensaje={error} cerrar={() => setError("")}/>
      <header className="cxp-header"><div><span>CONTROL FINANCIERO · CUENTAS POR PAGAR</span><h1>Facturas y pagos</h1><p>Registra facturas, programa la semana, controla abonos y conserva visibles las obligaciones no seleccionadas.</p></div><button type="button" onClick={() => void cargarDatos()} disabled={cargando || procesando}>{cargando ? "Actualizando…" : "Actualizar"}</button></header>
      <nav className="cxp-tabs">{([['RESUMEN','Resumen'],['FACTURAS',`Facturas · ${abiertas.length} abiertas`],['CLASIFICAR',`Clasificar · ${facturasPorClasificar.length}`],['PLAN','Plan semanal'],['PAGADAS','Pagadas'],['IMPORTAR','Importar Excel']] as [Vista,string][]).map(([codigo, etiqueta]) => <button key={codigo} type="button" className={vista === codigo ? "active" : ""} onClick={() => cambiarVista(codigo)}>{etiqueta}</button>)}</nav>

      {mostrarFormulario && <FormularioFactura formulario={formulario} setFormulario={setFormulario} pagos={pagosEdicion} setPagos={setPagosEdicion} cuentas={cuentas} clientes={clientes} proveedoresSugeridos={proveedoresSugeridos} descripcionesSugeridas={descripcionesSugeridas} iva={ivaForm} total={totalForm} neto={netoForm} procesando={procesando} cerrar={()=>{setMostrarFormulario(false);setPagosEdicion([])}} guardar={guardarFormulario}/>} 

      {vista === "RESUMEN" && <><section className="cxp-kpis"><Kpi titulo="Saldo por pagar" valor={moneda(totalPendiente)} detalle={`${numero(abiertas.length)} facturas abiertas`} clase="vino"/><Kpi titulo="Programado esta semana" valor={moneda(totalProgramado)} detalle={semanaEtiqueta(semana)} clase="naranja"/><Kpi titulo="Facturas vencidas" valor={numero(vencidas.length)} detalle={moneda(vencidas.reduce((t,f)=>t+Number(f.saldo),0))} clase={vencidas.length ? "alerta" : "verde"}/><Kpi titulo="Pagado este mes" valor={moneda(pagosMes)} detalle="Abonos y pagos completos" clase="verde"/></section><section className="cxp-panel"><div className="cxp-panel-head"><div><span>PRIORIDAD DE CAJA</span><h2>Próximas obligaciones</h2></div><button type="button" onClick={() => cambiarVista("PLAN")}>Preparar pagos</button></div><TablaFacturas facturas={abiertas.slice().sort((a,b)=>(a.fecha_vencimiento??'9999').localeCompare(b.fecha_vencimiento??'9999')).slice(0,12)} cuentas={cuentas} procesando={procesando} editar={editarFactura} abonar={abrirAbono} clasificar={cambiarClasificacion} nombresClientesPorFactura={nombresClientesPorFactura}/></section><div className="cxp-note">Las facturas registran la obligación; los abonos registran la salida real de caja. La factura permanece visible hasta que su saldo llegue a cero.</div></>}

      {vista === "FACTURAS" && <><section className="cxp-toolbar"><div><button type="button" onClick={nuevaFactura}>+ Nueva factura</button></div><label>Estado<select value={estado} onChange={(e)=>setEstado(e.target.value)}><option value="ABIERTAS">Abiertas</option><option value="TODAS">Todas</option><option value="PENDIENTE">Pendientes</option><option value="ABONO">Con abonos</option><option value="PAGADA">Pagadas</option></select></label><label className="search">Proveedor, factura o concepto<input type="search" value={buscar} onChange={(e)=>setBuscar(e.target.value)} placeholder="Buscar…"/></label></section><section className="cxp-panel"><div className="cxp-panel-head"><div><span>REGISTRO COMPLETO</span><h2>{numero(facturasFiltradas.length)} facturas</h2></div><small>Todas pueden editarse o recibir abonos</small></div><TablaFacturas facturas={paginaFacturas} cuentas={cuentas} procesando={procesando} editar={editarFactura} abonar={abrirAbono} clasificar={cambiarClasificacion} nombresClientesPorFactura={nombresClientesPorFactura}/><Paginacion pagina={pagina} paginas={paginas} cambiar={setPagina}/></section></>}

      {vista === "CLASIFICAR" && <>
        <section className="cxp-panel classification-settings">
          <div className="cxp-panel-head"><div><span>CLASIFICACIÓN GERENCIAL</span><h2>Asignar cuenta y cliente en conjunto</h2><p>Filtra, selecciona las facturas similares y aplica una sola clasificación.</p></div><small>{numero(facturasPorClasificar.length)} pendientes en total</small></div>
          <div className="classification-form">
            <label>Proveedor<select value={proveedorClasificacion} onChange={(e)=>setProveedorClasificacion(e.target.value)}><option value="TODOS">Todos los proveedores</option>{proveedoresPorClasificar.map((proveedor)=><option key={proveedor} value={proveedor}>{proveedor}</option>)}</select></label>
            <label className="search">Buscar factura o concepto<input type="search" value={buscarClasificacion} onChange={(e)=>setBuscarClasificacion(e.target.value)} placeholder="Escribe para filtrar…"/></label>
            <label>Cuenta<select value={cuentaClasificacion} onChange={(e)=>setCuentaClasificacion(e.target.value)}>{cuentas.map((cuenta)=><option key={cuenta.codigo} value={cuenta.codigo}>{cuenta.nombre}</option>)}</select></label>
            <label>Afecta a<select value={afectaClasificacion} onChange={(e)=>{const valor=e.target.value as "GENERAL"|"CLIENTE";setAfectaClasificacion(valor);if(valor==="GENERAL")setClienteClasificacion("")}}><option value="GENERAL">Negocio completo</option><option value="CLIENTE">Cliente específico</option></select></label>
            <label>Cliente<select value={clienteClasificacion} disabled={afectaClasificacion!=="CLIENTE"} onChange={(e)=>setClienteClasificacion(e.target.value)}><option value="">Seleccione un cliente…</option>{clientes.map((cliente)=><option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label>
          </div>
          <div className="classification-footer">
            <label className="remember-rule"><input type="checkbox" checked={recordarClasificacion} onChange={(e)=>setRecordarClasificacion(e.target.checked)}/><span>Recordar por proveedor para clasificar automáticamente las próximas facturas</span></label>
            <div className="classification-total"><span>Seleccionadas</span><strong>{numero(facturasClasificacionSeleccionadas.length)}</strong><small>{moneda(totalClasificacionSeleccionada)}</small></div>
            <button type="button" className="secondary" disabled={seleccionClasificacion.size===0||procesando} onClick={()=>setSeleccionClasificacion(new Set())}>Quitar selección</button>
            <button type="button" disabled={facturasClasificacionSeleccionadas.length===0||procesando} onClick={()=>void aplicarClasificacionMasiva()}>{procesando?"Clasificando…":"Aplicar a seleccionadas"}</button>
          </div>
        </section>
        <section className="cxp-panel classification-list-panel">
          <div className="cxp-panel-head"><div><span>FACTURAS SIN CLASIFICAR</span><h2>{numero(facturasClasificacionFiltradas.length)} visibles</h2></div><label className="select-all"><input type="checkbox" checked={todasClasificacionVisibles} disabled={facturasClasificacionFiltradas.length===0} onChange={(e)=>alternarTodasClasificacion(e.target.checked)}/><span>Seleccionar todas las visibles</span></label></div>
          <div className="classification-scroll"><table><thead><tr><th></th><th>Emisión</th><th>Proveedor</th><th>Factura y concepto</th><th>Destino actual</th><th>Valor neto</th></tr></thead><tbody>{facturasClasificacionFiltradas.map((factura)=><tr key={factura.id} className={seleccionClasificacion.has(factura.id)?"selected":""}><td><input aria-label={`Seleccionar ${factura.numero_factura||factura.proveedor}`} type="checkbox" checked={seleccionClasificacion.has(factura.id)} onChange={(e)=>alternarFacturaClasificacion(factura.id,e.target.checked)}/></td><td>{fechaCorta(factura.fecha_emision)}</td><td><strong>{factura.proveedor}</strong></td><td><strong>{factura.numero_factura||"Sin número"}</strong><small>{factura.descripcion||"Sin descripción"}</small></td><td>{destinoFactura(factura)}</td><td className="money">{moneda(factura.valor_neto_pagar)}</td></tr>)}</tbody></table>{facturasClasificacionFiltradas.length===0&&<Vacio texto="No hay facturas pendientes para este filtro."/>}</div>
        </section>
      </>}

      {vista === "PLAN" && <>
        <section className="cxp-toolbar plan">
          <label>Semana que se pagará<input type="date" value={semana} onChange={(e)=>setSemana(inicioSemana(e.target.value))}/><small>{semanaEtiqueta(semana)} · lunes a domingo</small></label>
          <label>Facturas pendientes hasta<select value={filtroSemanaPago} onChange={(e)=>setFiltroSemanaPago(e.target.value)}><option value="TODAS">Todas las semanas</option>{semanasPagoDisponibles.map((numeroSemana)=><option key={numeroSemana} value={numeroSemana}>Hasta semana {String(numeroSemana).padStart(2,"0")}</option>)}<option value="SIN_SEMANA">Sin semana asignada</option></select><small>Incluye desde la semana 01 hasta la elegida</small></label>
          <label>Vencimiento<select value={filtroVencimiento} onChange={(e)=>setFiltroVencimiento(e.target.value)}><option value="TODAS">Todas las abiertas</option><option value="VENCIDAS">Vencidas</option><option value="SEMANA">Vencen esta semana</option><option value="SIN_FECHA">Sin vencimiento</option></select></label>
          <label className="search">Proveedor o factura<input type="search" value={buscar} onChange={(e)=>setBuscar(e.target.value)} placeholder="Buscar…"/></label>
        </section>
        <section className="weekly-money">
          <label>Dinero disponible esta semana<div><input type="number" min="0" step="0.01" value={presupuestoEdicion} onChange={(e)=>setPresupuestoEdicion(e.target.value)} placeholder="0.00"/><button type="button" disabled={procesando} onClick={()=>void guardarPresupuestoSemana()}>Guardar</button></div><small>Este valor es compartido por el equipo.</small></label>
          <article><span>Plan total</span><strong>{moneda(totalProgramado)}</strong><small>{numero(programacionesSeleccionadas.length)} pagos o abonos</small></article>
          <article className="blue"><span>Ya pagado</span><strong>{moneda(totalEjecutadoPlan)}</strong><small>Filas azules con P</small></article>
          <article className="yellow"><span>Por ejecutar</span><strong>{moneda(totalPorEjecutarPlan)}</strong><small>Filas amarillas</small></article>
          <article className={saldoPresupuesto < 0 ? "negative" : "available"}><span>Saldo disponible</span><strong>{moneda(saldoPresupuesto)}</strong><small>{presupuestoEdicion ? "Disponible menos el plan total" : "Primero registra el dinero disponible"}</small></article>
        </section>
        <section className="cxp-panel">
          <div className="cxp-panel-head"><div><span>PLAN DE TESORERÍA COMPARTIDO</span><h2>Preparar y ejecutar pagos</h2><p>Compras selecciona en amarillo. La persona que paga registra la referencia y la fila cambia a azul con P.</p></div></div>
          <div className="plan-legend"><span className="yellow">Seleccionada para pagar</span><span className="blue">P · Pago ejecutado</span><span className="gray">No seleccionada</span></div>
          <div className="plan-scroll"><div className="plan-list">{planFiltrado.map((f)=>{
            const plan=planesSemana.get(f.id)
            const seleccionada=Boolean(plan?.seleccionada)
            const pagada=plan?.estado_plan === "PAGADO"
            const claveGuardado=`${f.id}|${semana}`
            const guardando=planesGuardando.has(claveGuardado)
            return <article key={f.id} className={pagada ? "paid" : seleccionada ? "selected" : "muted"}>
              <input aria-label="Seleccionar factura" type="checkbox" checked={seleccionada} disabled={guardando || pagada} onChange={(e)=>void cambiarPlan(f,e.target.checked)}/>
              <div><strong>{f.proveedor}</strong><small>{f.numero_factura || 'Sin número'} · {f.descripcion || 'Sin descripción'}</small><small className={f.semana_pago_numero ? "week-hint" : "week-hint missing"}>{f.semana_pago_numero ? `Semana sugerida ${String(f.semana_pago_numero).padStart(2,"0")}` : "Sin semana sugerida"}</small></div>
              <span><small>Vence</small>{fechaCorta(f.fecha_vencimiento)}</span>
              <span><small>Saldo actual</small>{moneda(f.saldo)}</span>
              <label>Monto del pago o abono<input key={`${plan?.actualizado_en ?? "nuevo"}-${plan?.monto_programado ?? f.saldo}`} type="number" min="0.01" max={pagada ? plan?.monto_programado : f.saldo} step="0.01" disabled={!seleccionada || guardando || pagada} defaultValue={Number(plan?.monto_programado ?? f.saldo).toFixed(2)} onBlur={(e)=>seleccionada && !pagada && void cambiarPlan(f,true,Number(e.target.value))}/></label>
              <div className="plan-action">{pagada
                ? <div className="paid-mark"><b>P</b><span>{moneda(plan.monto_pagado ?? plan.monto_programado)}<small>{fechaCorta(plan.fecha_pago)} · {plan.documento_pago || "Sin referencia"}</small></span></div>
                : seleccionada && plan
                  ? <button type="button" disabled={guardando || plan.id.startsWith("local:")} onClick={()=>abrirPagoProgramado(f,plan)}>{guardando ? "Guardando…" : "Pagar / abonar"}</button>
                  : <small>Selecciona para incluir</small>}
              </div>
            </article>
          })}{planFiltrado.length===0&&<Vacio texto="No hay facturas para este filtro."/>}</div></div>
        </section>
      </>}

      {vista === "PAGADAS" && <><section className="cxp-toolbar paid"><label>Mes del reporte<input type="month" value={mesPagadas} onChange={(e)=>setMesPagadas(e.target.value)}/></label><label>Proveedor<select value={proveedorPagadas} onChange={(e)=>setProveedorPagadas(e.target.value)}><option value="TODOS">Todos los proveedores</option>{proveedoresPagadas.map((proveedor)=><option key={proveedor} value={proveedor}>{proveedor}</option>)}</select></label><label className="search">Factura, referencia o concepto<input type="search" value={buscarPagadas} onChange={(e)=>setBuscarPagadas(e.target.value)} placeholder="Buscar factura o referencia…"/></label><div className="paid-report"><button type="button" onClick={descargarReportePagos} disabled={pagosReporteFiltrados.length===0}>Descargar reporte</button><small>{numero(pagosReporteFiltrados.length)} pagos · {moneda(totalReportePagos)}</small></div></section><section className="cxp-panel paid-panel"><div className="cxp-panel-head"><div><span>HISTORIAL DE CAJA</span><h2>{numero(pagosReporteFiltrados.length)} pagos realizados en el mes</h2></div><small>{numero(pagadasFiltradas.length)} facturas involucradas · {moneda(totalReportePagos)}</small></div><TablaFacturas facturas={paginaFacturasPagadas} cuentas={cuentas} procesando={procesando} editar={editarFactura} abonar={abrirAbono} clasificar={cambiarClasificacion} nombresClientesPorFactura={nombresClientesPorFactura} mostrarReferencia referenciasPago={referenciasPago}/><Paginacion pagina={paginaPagadas} paginas={paginasPagadas} cambiar={setPaginaPagadas}/></section></>}

      {vista === "IMPORTAR" && <Importador archivo={archivo} archivoLeido={archivoLeido} importaciones={importaciones} pendientes={pendientesPrevia} cuentas={cuentas} procesando={procesando} inputRef={inputRef} seleccionar={seleccionarArchivo} cambiarCuenta={cambiarCuentaPrevia} quitar={()=>{setArchivo(null);setArchivoLeido(null)}} importar={importarArchivo}/>} 

      {pagoProgramado&&<div className="modal-bg"><section className="abono-modal payment-modal"><span>EJECUTAR PAGO DEL PLAN SEMANAL</span><h2>{pagoProgramado.factura.proveedor}</h2><p>{pagoProgramado.factura.numero_factura || 'Sin número'} · {pagoProgramado.factura.descripcion || 'Sin descripción'}</p><div className="payment-amount"><small>Monto aprobado para pagar o abonar</small><strong>{moneda(pagoProgramado.plan.monto_programado)}</strong></div><Campo etiqueta="Fecha del pago"><input type="date" value={pagoProgramadoFecha} onChange={(e)=>setPagoProgramadoFecha(e.target.value)}/></Campo><Campo etiqueta="Referencia bancaria"><input autoFocus value={pagoProgramadoDocumento} onChange={(e)=>setPagoProgramadoDocumento(e.target.value)} placeholder="Número de transferencia o documento"/></Campo><Campo etiqueta="Observación opcional"><input value={pagoProgramadoNotas} onChange={(e)=>setPagoProgramadoNotas(e.target.value)} placeholder="Detalle adicional"/></Campo><div className="payment-confirmation">Al confirmar, la factura se registrará como pagada o abonada y la fila quedará azul con la señal P.</div><div className="actions"><button type="button" className="secondary" onClick={()=>setPagoProgramado(null)}>Cancelar</button><button type="button" onClick={()=>void guardarPagoProgramado()} disabled={procesando||!pagoProgramadoDocumento.trim()}>{procesando ? "Registrando…" : "Confirmar pago y marcar P"}</button></div></section></div>}

      {abonoFactura&&<div className="modal-bg"><section className="abono-modal"><span>REGISTRAR SALIDA DE CAJA</span><h2>{abonoFactura.proveedor}</h2><p>{abonoFactura.numero_factura || 'Sin número'} · Saldo {moneda(abonoFactura.saldo)}</p><Campo etiqueta="Fecha del pago"><input type="date" value={abonoFecha} onChange={(e)=>setAbonoFecha(e.target.value)}/></Campo><Campo etiqueta="Monto del abono"><input type="number" min="0.01" max={abonoFactura.saldo} step="0.01" value={abonoMonto} onChange={(e)=>setAbonoMonto(e.target.value)}/></Campo><Campo etiqueta="# documento o transferencia"><input value={abonoDocumento} onChange={(e)=>setAbonoDocumento(e.target.value)}/></Campo><div className="actions"><button type="button" className="secondary" onClick={()=>setAbonoFactura(null)}>Cancelar</button><button type="button" onClick={()=>void guardarAbono()} disabled={procesando}>Guardar abono</button></div></section></div>}
    </main>
  )
}

function FormularioFactura({formulario,setFormulario,pagos,setPagos,cuentas,clientes,proveedoresSugeridos,descripcionesSugeridas,iva,total,neto,procesando,cerrar,guardar}:{formulario:typeof formularioVacio;setFormulario:React.Dispatch<React.SetStateAction<typeof formularioVacio>>;pagos:PagoEdicion[];setPagos:React.Dispatch<React.SetStateAction<PagoEdicion[]>>;cuentas:CuentaPagoDb[];clientes:ClientePedidoDb[];proveedoresSugeridos:string[];descripcionesSugeridas:string[];iva:number;total:number;neto:number;procesando:boolean;cerrar:()=>void;guardar:()=>Promise<void>}) {
  const clienteObligatorio = formulario.afecta_tipo === "CLIENTE" && formulario.cliente_ids.length === 0
  const totalPagos = pagos.reduce((suma,pago)=>suma+Number(pago.monto||0),0)
  const pagosInvalidos = pagos.some((pago)=>!pago.fecha_pago||!Number.isFinite(Number(pago.monto))||Number(pago.monto)<=0)
  const pagosExcedidos = totalPagos > neto + 0.005
  function cambiarPago(id:string,campo:"fecha_pago"|"monto"|"documento"|"notas",valor:string) {
    setPagos((actuales)=>actuales.map((pago)=>pago.id===id?{...pago,[campo]:valor}:pago))
  }
  function alternarCliente(clienteId: string, seleccionado: boolean) {
    setFormulario((actual) => {
      const ids = seleccionado
        ? Array.from(new Set([...actual.cliente_ids, clienteId]))
        : actual.cliente_ids.filter((id) => id !== clienteId)
      return { ...actual, cliente_ids: ids, cliente_id: ids[0] ?? "" }
    })
  }
  return (
    <section className="cxp-panel form full-editor">
      <div className="cxp-panel-head"><div><span>INGRESO Y EDICIÓN COMPLETA</span><h2>{formulario.id ? pagos.length ? "Editar factura y pagos" : "Editar factura" : "Nueva factura"}</h2><p>Los cambios actualizan el historial, los reportes y el saldo de la factura.</p></div><button type="button" className="secondary" onClick={cerrar}>Cerrar</button></div>
      <div className="form-grid">
        <Campo etiqueta="Fecha emisión"><input type="date" value={formulario.fecha_emision} onChange={(e)=>{const fecha=e.target.value;const mesAnterior=formulario.fecha_emision.slice(0,7);setFormulario({...formulario,fecha_emision:fecha,periodo_servicio:!formulario.id&&(!formulario.periodo_servicio||formulario.periodo_servicio===mesAnterior)?fecha.slice(0,7):formulario.periodo_servicio})}}/></Campo>
        <Campo etiqueta="Periodo del servicio"><input required type="month" value={formulario.periodo_servicio} onChange={(e)=>setFormulario({...formulario,periodo_servicio:e.target.value})}/></Campo>
        <Campo etiqueta="Fecha vencimiento"><input type="date" value={formulario.fecha_vencimiento} onChange={(e)=>setFormulario({...formulario,fecha_vencimiento:e.target.value})}/></Campo>
        <Campo etiqueta="# factura"><input value={formulario.numero_factura} onChange={(e)=>setFormulario({...formulario,numero_factura:e.target.value})}/></Campo>
        <Campo etiqueta="Proveedor" clase="span2"><input list="cxp-proveedores" autoComplete="off" value={formulario.proveedor} onChange={(e)=>setFormulario({...formulario,proveedor:e.target.value})} placeholder="Escribe para buscar o ingresar uno nuevo"/><datalist id="cxp-proveedores">{proveedoresSugeridos.map((proveedor)=><option key={proveedor} value={proveedor}/>)}</datalist></Campo>
        <Campo etiqueta="Descripción" clase="span2"><input list="cxp-descripciones" autoComplete="off" value={formulario.descripcion} onChange={(e)=>setFormulario({...formulario,descripcion:e.target.value})} placeholder="Escribe para buscar o ingresar una nueva"/><datalist id="cxp-descripciones">{descripcionesSugeridas.map((descripcion)=><option key={descripcion} value={descripcion}/>)}</datalist></Campo>
        <Campo etiqueta="Subtotal"><input type="number" min="0" step="0.01" value={formulario.subtotal} onChange={(e)=>setFormulario({...formulario,subtotal:e.target.value})}/></Campo>
        <Campo etiqueta="IVA"><div className="inline"><input type="checkbox" checked={formulario.aplica_iva} onChange={(e)=>setFormulario({...formulario,aplica_iva:e.target.checked})}/><input type="number" min="0" max="100" step="0.01" disabled={!formulario.aplica_iva} value={formulario.tasa_iva} onChange={(e)=>setFormulario({...formulario,tasa_iva:e.target.value})}/><span>%</span></div></Campo>
        <Campo etiqueta="Retenciones"><input type="number" min="0" step="0.01" value={formulario.retencion} onChange={(e)=>setFormulario({...formulario,retencion:e.target.value})}/></Campo>
        <Campo etiqueta="Referencia de retención"><input value={formulario.retencion_referencia} onChange={(e)=>setFormulario({...formulario,retencion_referencia:e.target.value})} placeholder="Número de comprobante"/></Campo>
        <Campo etiqueta="Cuenta" clase="span2"><select value={formulario.cuenta_codigo} onChange={(e)=>setFormulario({...formulario,cuenta_codigo:e.target.value})}>{cuentas.map(c=><option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Afecta a"><select value={formulario.afecta_tipo} onChange={(e)=>{const afectaTipo=e.target.value as "GENERAL"|"CLIENTE";setFormulario({...formulario,afecta_tipo:afectaTipo,cliente_id:afectaTipo === "GENERAL" ? "" : formulario.cliente_id,cliente_ids:afectaTipo === "GENERAL" ? [] : formulario.cliente_ids})}}><option value="GENERAL">Negocio completo</option><option value="CLIENTE">Uno o varios clientes</option></select></Campo>
        <div className={`client-field span2 ${formulario.afecta_tipo !== "CLIENTE" ? "disabled" : ""}`}><span>Clientes afectados</span><div className="client-checklist">{clientes.map((cliente)=><label key={cliente.id}><input type="checkbox" disabled={formulario.afecta_tipo !== "CLIENTE"} checked={formulario.cliente_ids.includes(cliente.id)} onChange={(e)=>alternarCliente(cliente.id,e.target.checked)}/><b>{cliente.nombre}</b></label>)}</div><small className={clienteObligatorio ? "warning-text" : "client-selection-help"}>{clienteObligatorio ? "Seleccione al menos un cliente afectado." : formulario.afecta_tipo === "CLIENTE" ? `${formulario.cliente_ids.length} cliente${formulario.cliente_ids.length === 1 ? "" : "s"} seleccionado${formulario.cliente_ids.length === 1 ? "" : "s"}. El gasto se repartirá en partes iguales.` : "El gasto se distribuirá entre todo el negocio."}</small></div>
        <Campo etiqueta="Observaciones de la factura" clase="span2"><input value={formulario.notas} onChange={(e)=>setFormulario({...formulario,notas:e.target.value})} placeholder="Información adicional"/></Campo>
      </div>
      {pagos.length>0&&<section className="payment-editor"><div><span>PAGOS REGISTRADOS</span><h3>Corrige la fecha, monto o referencia</h3></div>{pagos.map((pago,indice)=><article key={pago.id}><b>Pago {indice+1}<small>{pago.origen==="EXCEL"?"Importado desde Excel":"Registrado en la app"}</small></b><Campo etiqueta="Fecha del pago"><input type="date" value={pago.fecha_pago} onChange={(e)=>cambiarPago(pago.id,"fecha_pago",e.target.value)}/></Campo><Campo etiqueta="Monto pagado"><input type="number" min="0.01" step="0.01" value={pago.monto} onChange={(e)=>cambiarPago(pago.id,"monto",e.target.value)}/></Campo><Campo etiqueta="Referencia bancaria"><input value={pago.documento} onChange={(e)=>cambiarPago(pago.id,"documento",e.target.value)} placeholder="Transferencia o documento"/></Campo><Campo etiqueta="Observación del pago"><input value={pago.notas} onChange={(e)=>cambiarPago(pago.id,"notas",e.target.value)} placeholder="Detalle opcional"/></Campo></article>)}</section>}
      {pagosExcedidos&&<div className="editor-warning">La suma de pagos no puede superar el neto de la factura.</div>}
      <div className="calc"><span>IVA <b>{moneda(iva)}</b></span><span>Total <b>{moneda(total)}</b></span><span>Neto a pagar <strong>{moneda(neto)}</strong></span>{pagos.length>0&&<><span>Total pagado <b>{moneda(totalPagos)}</b></span><span>Saldo resultante <strong>{moneda(Math.max(0,neto-totalPagos))}</strong></span></>}<button type="button" onClick={()=>void guardar()} disabled={procesando||!formulario.periodo_servicio||clienteObligatorio||pagosInvalidos||pagosExcedidos}>{procesando ? "Guardando…" : pagos.length ? "Guardar factura y pagos" : "Guardar factura"}</button></div>
    </section>
  )
}

function Importador({archivo,archivoLeido,importaciones,pendientes,cuentas,procesando,inputRef,seleccionar,cambiarCuenta,quitar,importar}:{archivo:File|null;archivoLeido:ResultadoArchivoFacturas|null;importaciones:ImportacionFacturaDb[];pendientes:ResultadoArchivoFacturas['lineas'];cuentas:CuentaPagoDb[];procesando:boolean;inputRef:React.RefObject<HTMLInputElement|null>;seleccionar:(e:ChangeEvent<HTMLInputElement>)=>Promise<void>;cambiarCuenta:(clave:string,cuenta:string)=>void;quitar:()=>void;importar:()=>Promise<void>}) {
  return <section className="cxp-panel"><div className="cxp-panel-head import"><div><span>IMPORTACIÓN INICIAL 2026</span><h2>Cargar facturas y pagos</h2><p>Solo se importan las facturas de 2026. La letra P identifica las pagadas; las demás quedan por pagar.</p></div><button type="button" onClick={()=>inputRef.current?.click()} disabled={procesando}>{procesando ? "Analizando…" : "Seleccionar Excel"}</button><input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={seleccionar}/></div>{archivoLeido&&archivo?<><section className="cxp-kpis five"><Kpi titulo="Facturas 2026" valor={numero(archivoLeido.facturas)} detalle={`${archivoLeido.proveedores} proveedores`} clase="vino"/><Kpi titulo="Ya pagadas" valor={numero(archivoLeido.pagadas)} detalle="Marcadas con P" clase="verde"/><Kpi titulo="Por pagar" valor={numero(archivoLeido.pendientes)} detalle={moneda(archivoLeido.totalPendiente)} clase="alerta"/><Kpi titulo="Total neto" valor={moneda(archivoLeido.totalNeto)} detalle="Pagadas y pendientes" clase="naranja"/><Kpi titulo="Por clasificar" valor={numero(archivoLeido.porRevisar)} detalle="No afecta el estado de pago" clase="gris"/></section>{archivoLeido.advertencias.length>0&&<div className="cxp-warning">{archivoLeido.advertencias.map(a=><p key={a}>{a}</p>)}</div>}{pendientes.length>0&&<div className="preview"><h3>Clasificación pendiente</h3>{pendientes.map(l=><article key={l.clave_origen}><div><strong>{l.proveedor}</strong><small>{l.numero_factura || 'Sin factura'} · {l.descripcion || 'Sin descripción'}</small></div><b>{moneda(l.valor_neto_pagar)}</b><select value={l.cuenta_codigo} onChange={(e)=>cambiarCuenta(l.clave_origen,e.target.value)}>{cuentas.map(c=><option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select></article>)}</div>}<div className="actions"><button type="button" className="secondary" onClick={quitar}>Quitar</button><button type="button" onClick={()=>void importar()} disabled={procesando}>{procesando ? "Importando…" : `Importar ${numero(archivoLeido.facturas)} facturas`}</button></div></>:<Vacio texto="Selecciona el archivo APROBACION PAGOS. Antes de importar se mostrará la validación de 2026."/>}{importaciones.length>0&&<div className="history"><h3>Importaciones realizadas</h3>{importaciones.map(item=><article key={item.id}><div><strong>{item.archivo_nombre}</strong><small>{new Date(item.creado_en).toLocaleString('es-EC')}</small></div><span>{item.facturas_nuevas} nuevas · {item.facturas_actualizadas} actualizadas</span><b>{moneda(item.total_neto)}</b></article>)}</div>}</section>
}

function TablaFacturas({facturas,cuentas,procesando,editar,abonar,clasificar,nombresClientesPorFactura,mostrarReferencia=false,referenciasPago=new Map()}:{facturas:FacturaDetalleDb[];cuentas:CuentaPagoDb[];procesando:boolean;editar:(f:FacturaDetalleDb)=>void;abonar:(f:FacturaDetalleDb)=>void;clasificar:(f:FacturaDetalleDb,c:string,r?:boolean)=>void;nombresClientesPorFactura:Map<string,string>;mostrarReferencia?:boolean;referenciasPago?:Map<string,ReferenciaPago>}) {
  if (!facturas.length) return <Vacio texto="No hay facturas para mostrar."/>
  return <div className="table-wrap"><table className={mostrarReferencia ? "with-reference" : ""}><colgroup><col className="col-date"/><col className="col-provider"/><col className="col-invoice"/>{mostrarReferencia&&<col className="col-reference"/>}<col className="col-target"/><col className="col-money"/><col className="col-money"/><col className="col-money"/><col className="col-status"/><col className="col-account"/><col className="col-actions"/></colgroup><thead><tr><th>Emisión / servicio / vencimiento</th><th>Proveedor</th><th>Factura / concepto</th>{mostrarReferencia&&<th>Referencia de pago</th>}<th>Afecta a</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Estado</th><th>Cuenta</th><th>Acciones</th></tr></thead><tbody>{facturas.map(f=>{const pago=referenciasPago.get(f.id);return <tr key={f.id}><td>{fechaCorta(f.fecha_emision)}<small>Servicio {(f.periodo_servicio ?? f.fecha_emision ?? "").slice(0,7) || "—"}</small><small>Vence {fechaCorta(f.fecha_vencimiento)}</small></td><td><strong>{f.proveedor}</strong></td><td>{f.numero_factura || '—'}<small>{f.descripcion || 'Sin descripción'}</small></td>{mostrarReferencia&&<td><strong>{pago?.referencias || 'Sin referencia'}</strong><small>Pago {fechaCorta(pago?.fechaUltimoPago ?? f.fecha_pago_origen)}</small></td>}<td><strong>{f.afecta_tipo === 'CLIENTE' ? nombresClientesPorFactura.get(f.id) || f.cliente_nombre || 'Cliente sin nombre' : 'Negocio completo'}</strong></td><td className="money">{moneda(f.valor_neto_pagar)}<small>IVA {moneda(f.iva)}</small></td><td className="money">{moneda(f.total_abonado)}</td><td className="money saldo">{moneda(f.saldo)}</td><td><em className={`status ${f.estado.toLowerCase()}`}>{f.estado==='ABONO'?'Con abono':f.estado.charAt(0)+f.estado.slice(1).toLowerCase()}</em></td><td><select value={f.cuenta_codigo} disabled={procesando} onChange={(e)=>void clasificar(f,e.target.value)}>{cuentas.map(c=><option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select>{f.estado_clasificacion==='PENDIENTE'&&<small className="warning-text">Por revisar</small>}</td><td><div className="row-actions"><button type="button" onClick={()=>editar(f)}>Editar</button>{f.estado!=='PAGADA'&&<button type="button" onClick={()=>abonar(f)}>Abono</button>}<button type="button" disabled={f.cuenta_codigo==='PENDIENTE'} onClick={()=>void clasificar(f,f.cuenta_codigo,true)}>Recordar</button></div></td></tr>})}</tbody></table></div>
}

function Campo({etiqueta,clase="",children}:{etiqueta:string;clase?:string;children:React.ReactNode}) { return <label className={clase}>{etiqueta}{children}</label> }
function Kpi({titulo,valor,detalle,clase}:{titulo:string;valor:string;detalle:string;clase:string}) { return <article className={`kpi ${clase}`}><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article> }
function Vacio({texto}:{texto:string}) { return <div className="empty">{texto}</div> }
function Paginacion({pagina,paginas,cambiar}:{pagina:number;paginas:number;cambiar:(n:number)=>void}) { return <div className="pagination"><button disabled={pagina<=1} onClick={()=>cambiar(pagina-1)}>Anterior</button><span>Página {pagina} de {paginas}</span><button disabled={pagina>=paginas} onClick={()=>cambiar(pagina+1)}>Siguiente</button></div> }

const tablaAjustadaCss = `
.cxp-page{width:100%;max-width:1580px;box-sizing:border-box;padding-left:20px;padding-right:20px}
.cxp-toolbar.paid{grid-template-columns:180px minmax(210px,290px) minmax(260px,1fr) 190px}
.paid-report{display:flex;flex-direction:column;align-items:stretch;gap:6px}.paid-report button{width:100%}.paid-report small{color:#7c6d66;font-size:10px;font-weight:850;text-align:center}
.paid-panel{padding:14px 10px}
.table-wrap{width:100%;overflow-x:auto}
.table-wrap table{width:100%;min-width:0;table-layout:fixed}
.table-wrap col.col-date{width:8%}
.table-wrap col.col-provider{width:12%}
.table-wrap col.col-invoice{width:13%}
.table-wrap col.col-reference{width:10%}
.table-wrap col.col-target{width:9%}
.table-wrap col.col-money{width:6%}
.table-wrap col.col-status{width:7%}
.table-wrap col.col-account{width:14%}
.table-wrap col.col-actions{width:9%}
.table-wrap th{padding:10px 6px;font-size:9px;line-height:1.3;white-space:normal}
.table-wrap td{padding:10px 6px;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
.table-wrap td strong{font-size:11px}
.table-wrap td small{font-size:9px}
.table-wrap td.money{font-size:12px}
.table-wrap td.saldo{font-size:13px}
.table-wrap select{width:100%;min-width:0;min-height:36px;padding:4px;font-size:10px}
.row-actions{display:grid;gap:3px}
.row-actions button{width:100%;min-height:30px;padding:0 4px;font-size:9px}
.plan-list strong{font-size:13px}
.plan-list small{font-size:10px}
.plan-list article>span{font-size:12px}
.plan-list label{font-size:10px}
.plan-list label input{font-size:12px;font-weight:800}
.cxp-toolbar input,.cxp-toolbar select,.form-grid input,.form-grid select,.abono-modal input{font-size:13px}
.cxp-toolbar article strong{font-size:26px}
.kpi strong{font-size:clamp(23px,2.2vw,30px)}
.kpi small{font-size:11px}
.calc b{font-size:18px}.calc strong{font-size:23px}
.cxp-toolbar.plan{grid-template-columns:210px 220px 190px minmax(250px,1fr)}
.weekly-money{display:grid;grid-template-columns:minmax(260px,1.25fr) repeat(4,minmax(150px,1fr));gap:10px;margin-bottom:15px}
.weekly-money>label,.weekly-money>article{min-width:0;min-height:100px;box-sizing:border-box;padding:14px;border:1px solid #e6ddd7;border-top:4px solid #9e8e86;border-radius:10px;background:#fff}
.weekly-money>label{color:#655650;font-size:10px;font-weight:900;text-transform:uppercase}
.weekly-money>label>div{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:7px}
.weekly-money input{width:100%;min-width:0;min-height:40px;box-sizing:border-box;padding:7px 9px;border:1px solid #d8cbc4;border-radius:7px;font-size:16px;font-weight:900}
.weekly-money button{min-height:40px;padding:0 13px;border:0;border-radius:7px;background:${VINO};color:#fff;font-weight:900;cursor:pointer}
.weekly-money span,.weekly-money small{display:block;color:#877972;font-size:9px}.weekly-money>label small{margin-top:6px;text-transform:none}
.weekly-money strong{display:block;margin:8px 0 5px;color:#322522;font-size:22px}
.weekly-money article.blue{border-top-color:#2878bd;background:#f0f7ff}.weekly-money article.yellow{border-top-color:#e0a20b;background:#fff9e7}.weekly-money article.available{border-top-color:#168b4a;background:#f2fbf5}.weekly-money article.negative{border-top-color:#c52a2a;background:#fff1f1}.weekly-money article.negative strong{color:#b51f24}
.plan-legend{display:flex;flex-wrap:wrap;gap:8px;margin:-2px 0 13px}.plan-legend span{padding:6px 10px;border-radius:999px;font-size:10px;font-weight:900}.plan-legend .yellow{background:#fff1a8;color:#795400}.plan-legend .blue{background:#ddebff;color:#15558c}.plan-legend .gray{background:#eeeae8;color:#746a65}
.plan-scroll{height:clamp(390px,58vh,720px);overflow-y:auto;overscroll-behavior:contain;padding-right:5px;scrollbar-gutter:stable}.plan-scroll::-webkit-scrollbar{width:11px}.plan-scroll::-webkit-scrollbar-track{border-radius:10px;background:#f0ebe8}.plan-scroll::-webkit-scrollbar-thumb{border:2px solid #f0ebe8;border-radius:10px;background:#a9958c}.plan-scroll::-webkit-scrollbar-thumb:hover{background:#806c63}.plan-scroll .plan-list{padding-bottom:5px}
.plan-list article{grid-template-columns:26px minmax(220px,1fr) 95px 120px 170px minmax(170px,230px);min-height:78px;padding:10px 12px}
.plan-list article.selected{border-color:#efd57e;border-left:6px solid #dfa20e;background:#fff5c7;opacity:1}
.plan-list article.paid{border-color:#9ec8ed;border-left:6px solid #2878bd;background:#e8f3ff;opacity:1}
.plan-list article.paid label input{background:#f4f9ff;color:#2c597d}
.plan-list .week-hint{display:inline-flex;width:max-content;margin-top:5px;padding:3px 6px;border-radius:999px;background:#e8f3ff;color:#205e91;font-size:9px;font-weight:900}.plan-list .week-hint.missing{background:#eeeae8;color:#84766f}
.plan-action{min-width:0}.plan-action>small{color:#8e817b;text-align:center}.plan-action button{width:100%;font-size:10px}
.paid-mark{display:grid;grid-template-columns:38px minmax(0,1fr);align-items:center;gap:8px}.paid-mark>b{display:grid;width:36px;height:36px;place-items:center;border-radius:50%;background:#2878bd;color:#fff;font-size:19px}.paid-mark>span{color:#194d79;font-size:12px;font-weight:950}.paid-mark small{margin-top:2px;overflow-wrap:anywhere;color:#527796;font-size:9px}
.payment-modal{width:min(520px,100%)}.payment-amount{margin:10px 0 16px;padding:13px;border-left:4px solid #dfa20e;background:#fff7d8}.payment-amount small{display:block;color:#806c50;font-size:10px}.payment-amount strong{display:block;margin-top:4px;color:${VINO};font-size:27px}.payment-confirmation{margin-top:15px;padding:10px;border-radius:7px;background:#e8f3ff;color:#315c7e;font-size:10px;line-height:1.45}
.classification-form{display:grid;grid-template-columns:minmax(210px,1.15fr) minmax(230px,1.25fr) minmax(230px,1.25fr) minmax(180px,.8fr) minmax(210px,1fr);align-items:end;gap:10px}.classification-form label{color:#756862;font-size:10px;font-weight:900;text-transform:uppercase}.classification-form input,.classification-form select{display:block;width:100%;min-height:42px;box-sizing:border-box;margin-top:6px;padding:7px 9px;border:1px solid #d8ccc6;border-radius:7px;background:#fff;color:#493b36;font-size:12px}.classification-form select:disabled{background:#f1eeec}.classification-footer{display:grid;grid-template-columns:minmax(280px,1fr) 130px auto auto;align-items:center;gap:10px;margin-top:15px;padding-top:13px;border-top:1px solid #eee5e0}.remember-rule{display:flex;align-items:center;gap:9px;color:#5e514b;font-size:11px;font-weight:800}.remember-rule input,.select-all input{width:18px;height:18px;accent-color:${VINO}}.classification-total{display:grid;grid-template-columns:auto auto;column-gap:8px;align-items:center;padding:8px 11px;border-left:3px solid ${NARANJA};background:#fff8ec}.classification-total span{grid-column:1/-1;color:#826f66;font-size:8px;font-weight:900;text-transform:uppercase}.classification-total strong{color:${VINO};font-size:19px}.classification-total small{color:#66554e;font-size:11px;font-weight:900}.select-all{display:flex;align-items:center;gap:8px;color:#62544e;font-size:11px;font-weight:900}.classification-list-panel{padding-bottom:10px}.classification-scroll{height:clamp(390px,56vh,690px);overflow:auto;scrollbar-gutter:stable;border:1px solid #eee4df;border-radius:8px}.classification-scroll table{width:100%;min-width:920px;border-collapse:collapse}.classification-scroll thead{position:sticky;top:0;z-index:2;background:#f6f1ee;box-shadow:0 1px 0 #d9cdc7}.classification-scroll th{padding:11px 9px;color:#6e5e57;font-size:9px;text-align:left;text-transform:uppercase}.classification-scroll th:first-child{width:38px}.classification-scroll th:nth-child(2){width:95px}.classification-scroll th:nth-child(3){width:22%}.classification-scroll th:nth-child(5){width:160px}.classification-scroll th:last-child{width:120px;text-align:right}.classification-scroll td{padding:10px 9px;border-top:1px solid #eee6e2;color:#4e423d;font-size:11px}.classification-scroll td strong,.classification-scroll td small{display:block}.classification-scroll td small{margin-top:3px;color:#90817a;font-size:10px}.classification-scroll td.money{text-align:right;font-size:12px;font-weight:900}.classification-scroll tbody tr.selected{background:#fff5c7}.classification-scroll tbody tr:hover{background:#fffaf1}.classification-scroll tbody tr.selected:hover{background:#ffefad}.classification-scroll td>input{width:18px;height:18px;accent-color:${VINO}}
.full-editor{border-top:4px solid ${VINO};scroll-margin-top:12px}.full-editor .calc{flex-wrap:wrap}.payment-editor{margin-top:18px;padding:15px;border:1px solid #d8e5f1;border-radius:9px;background:#f5f9fd}.payment-editor>div>span{color:#2878bd;font-size:9px;font-weight:950;letter-spacing:1px}.payment-editor h3{margin:4px 0 12px;color:#315c7e;font-size:16px}.payment-editor article{display:grid;grid-template-columns:145px 145px 145px minmax(190px,1fr) minmax(190px,1fr);align-items:end;gap:10px;padding:10px 0;border-top:1px solid #d8e5f1}.payment-editor article>b{align-self:center;color:#315c7e;font-size:12px}.payment-editor article>b small{display:block;margin-top:3px;color:#7890a5;font-size:9px;font-weight:700}.payment-editor label{color:#65798b;font-size:9px;font-weight:900;text-transform:uppercase}.payment-editor input{display:block;width:100%;min-height:39px;box-sizing:border-box;margin-top:5px;padding:7px 9px;border:1px solid #c9d9e6;border-radius:7px;background:#fff;color:#3d4c57;font-size:12px}.editor-warning{margin-top:12px;padding:10px 12px;border-left:4px solid #c72b34;background:#fff0f0;color:#a52129;font-size:11px;font-weight:850}
.client-field{min-width:0}.client-field>span{display:block;margin-bottom:5px;color:#756862;font-size:9px;font-weight:900;text-transform:uppercase}.client-checklist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));max-height:132px;overflow-y:auto;border:1px solid #dcd1cb;border-radius:7px;background:#fff}.client-checklist label{display:flex;align-items:center;gap:8px;min-height:39px;padding:5px 9px;border-bottom:1px solid #eee7e3;color:#493b36;font-size:10px;font-weight:800;text-transform:none;cursor:pointer}.client-checklist label:nth-child(odd){border-right:1px solid #eee7e3}.client-checklist input{flex:0 0 auto;width:17px;height:17px;min-height:0;margin:0;accent-color:${VINO}}.client-field.disabled .client-checklist{background:#f1eeec;opacity:.65}.client-field>small{display:block;margin-top:5px;font-size:9px;line-height:1.35}.client-selection-help{color:#7f716b}
@media(max-width:1180px){.cxp-toolbar.paid,.cxp-toolbar.plan{grid-template-columns:1fr 1fr}.cxp-toolbar.paid .search,.cxp-toolbar.plan .search{grid-column:1/-1}.paid-report{grid-column:1/-1}.weekly-money{grid-template-columns:repeat(2,minmax(0,1fr))}.weekly-money>label{grid-column:1/-1}.plan-list article{grid-template-columns:26px minmax(190px,1fr) 110px 160px}.plan-list article>span:first-of-type{display:none}.plan-action{grid-column:4}.classification-form{grid-template-columns:1fr 1fr}.classification-form .search{grid-column:span 1}.classification-footer{grid-template-columns:1fr 130px}.classification-footer>button{width:100%}.payment-editor article{grid-template-columns:120px 1fr 1fr}.payment-editor article label:nth-of-type(3),.payment-editor article label:nth-of-type(4){grid-column:span 1}}
@media(max-width:720px){.cxp-page{padding-left:12px;padding-right:12px}.cxp-toolbar.paid,.cxp-toolbar.plan{grid-template-columns:1fr}.cxp-toolbar.plan .search{grid-column:auto}.table-wrap table{min-width:1180px}.weekly-money{grid-template-columns:1fr 1fr}.weekly-money strong{font-size:18px}.plan-scroll{height:54vh;min-height:360px}.plan-list article{grid-template-columns:26px minmax(0,1fr)}.plan-list article>span{display:none}.plan-list article label{grid-column:2}.plan-action{grid-column:2}.paid-mark{grid-template-columns:38px minmax(0,1fr)}.classification-form,.classification-footer{grid-template-columns:1fr}.classification-form .search{grid-column:auto}.classification-scroll{height:52vh;min-height:360px}.classification-settings .cxp-panel-head,.classification-list-panel .cxp-panel-head{align-items:flex-start;flex-direction:column}.payment-editor article{grid-template-columns:1fr 1fr}.payment-editor article>b{grid-column:1/-1}.payment-editor article label:nth-of-type(3),.payment-editor article label:nth-of-type(4){grid-column:1/-1}.client-checklist{grid-template-columns:1fr}.client-checklist label:nth-child(odd){border-right:0}}
`

const css = `
.cxp-page{max-width:1580px;margin:0 auto;padding:24px 28px 48px;color:#392b27;font-variant-numeric:tabular-nums}.cxp-header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}.cxp-header>div{max-width:980px}.cxp-header span,.cxp-panel-head span,.abono-modal>span{color:${NARANJA};font-size:9px;font-weight:950;letter-spacing:1.15px}.cxp-header h1{margin:4px 0;color:${VINO};font-size:clamp(28px,3vw,38px)}.cxp-header p,.cxp-panel-head p{margin:0;color:#82736d;font-size:11px;line-height:1.5}.cxp-header button,.cxp-panel button,.cxp-toolbar button,.actions button,.pagination button,.plan-list button{min-height:38px;padding:0 14px;border:1px solid ${VINO};border-radius:8px;background:${VINO};color:#fff;font-weight:850;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed!important}.secondary{background:#fff!important;color:${VINO}!important}.cxp-tabs{display:flex;gap:4px;margin-bottom:15px;padding:5px;border:1px solid #e6ddd8;border-radius:10px;background:#f1edeb;overflow-x:auto}.cxp-tabs button{flex:1;min-width:max-content;min-height:42px;padding:0 14px;border:0;border-radius:7px;background:transparent;color:#74665f;font-weight:850;cursor:pointer}.cxp-tabs button.active{background:#fff;color:${VINO};box-shadow:0 3px 11px #4c2d221a}.cxp-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.cxp-kpis.five{grid-template-columns:repeat(5,minmax(0,1fr));margin-top:18px}.kpi{min-width:0;min-height:105px;display:flex;flex-direction:column;justify-content:center;padding:15px;border:1px solid #e8ded9;border-top:3px solid #9d8f88;border-radius:9px;background:linear-gradient(145deg,#fffaf6,#fff)}.kpi span{color:#796b65;font-size:8px;font-weight:950;text-transform:uppercase}.kpi strong{margin:7px 0 4px;overflow:hidden;color:#2e2320;font-size:clamp(18px,2vw,25px);text-overflow:ellipsis}.kpi small{color:#978a84;font-size:9px}.kpi.vino{border-top-color:${VINO}}.kpi.naranja{border-top-color:${NARANJA}}.kpi.verde{border-top-color:#159447}.kpi.alerta{border-top-color:#d69213;background:#fffaf0}.cxp-panel{margin-bottom:16px;padding:18px;border:1px solid #e7ddd7;border-radius:10px;background:#fff;box-shadow:0 5px 18px #3e28210b}.cxp-panel-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}.cxp-panel-head h2{margin:3px 0 0;color:#4b2727;font-size:20px}.cxp-panel-head small{color:#988a84;font-size:9px}.cxp-toolbar{display:grid;grid-template-columns:auto 180px minmax(250px,1fr);align-items:end;gap:12px;margin-bottom:15px;padding:13px;border:1px solid #e8dfda;border-radius:10px;background:#fff}.cxp-toolbar.plan{grid-template-columns:230px 190px minmax(240px,1fr) 210px}.cxp-toolbar label,.form-grid label,.abono-modal label{color:#756862;font-size:9px;font-weight:900;text-transform:uppercase}.cxp-toolbar input,.cxp-toolbar select,.form-grid input,.form-grid select,.abono-modal input{display:block;width:100%;min-height:38px;box-sizing:border-box;margin-top:5px;padding:7px 9px;border:1px solid #dcd1cb;border-radius:7px;background:#fff;color:#493b36;font:inherit}.cxp-toolbar label small{display:block;margin-top:3px;color:#a0928b;font-size:8px}.cxp-toolbar article{padding:9px 12px;border-left:3px solid ${NARANJA};background:#fff7ec}.cxp-toolbar article span{display:block;color:#86756e;font-size:8px;font-weight:900;text-transform:uppercase}.cxp-toolbar article strong{display:block;margin-top:4px;color:${VINO};font-size:21px}.form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.form-grid .span2{grid-column:span 2}.inline{display:grid;grid-template-columns:25px 1fr 20px;align-items:center;gap:5px}.inline input[type=checkbox]{min-height:18px;margin:5px 0 0}.calc{display:flex;justify-content:flex-end;align-items:center;gap:22px;margin-top:18px;padding-top:14px;border-top:1px solid #eee5e0}.calc span{color:#87766f;font-size:9px}.calc b,.calc strong{display:block;margin-top:3px;color:#3e2c28;font-size:15px}.calc strong{color:${VINO};font-size:19px}.table-wrap{overflow:auto}.table-wrap table{width:100%;min-width:1280px;border-collapse:collapse}.table-wrap th{padding:10px 8px;border-bottom:2px solid #dfd5cf;color:#74655f;font-size:8px;text-align:left;text-transform:uppercase}.table-wrap td{padding:9px 8px;border-bottom:1px solid #eee7e3;vertical-align:middle;font-size:9px}.table-wrap td strong,.table-wrap td small{display:block}.table-wrap td small{margin-top:3px;color:#998b85;font-size:8px}.table-wrap td.money{text-align:right;font-weight:850}.table-wrap td.saldo{color:${VINO};font-size:10px}.table-wrap select{width:170px;min-height:34px;padding:4px;border:1px solid #d8ccc6;border-radius:6px;font-size:8px}.row-actions{display:flex;gap:4px}.row-actions button{min-height:29px;padding:0 7px;border:1px solid #d9c9c0;border-radius:5px;background:#fff;color:${VINO};font-size:7px;font-weight:850;cursor:pointer}.warning-text{color:#a36000!important}.status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:8px;font-style:normal;font-weight:900}.status.pendiente{background:#fff3dc;color:#9b5a00}.status.abono{background:#eef4ff;color:#315f9c}.status.pagada{background:#e9f7ee;color:#14763a}.status.anulada{background:#eee;color:#777}.plan-list{display:grid;gap:6px}.plan-list article{display:grid;grid-template-columns:26px minmax(220px,1fr) 95px 115px 145px 110px;align-items:center;gap:10px;min-height:64px;padding:7px 10px;border:1px solid #eadfd9;border-left:4px solid #d7cbc5;border-radius:8px;transition:.15s}.plan-list article.selected{border-left-color:${NARANJA};background:#fffaf3}.plan-list article.muted{opacity:.46;background:#f6f3f1}.plan-list article.muted:hover{opacity:.75}.plan-list article>input{width:18px;height:18px}.plan-list strong,.plan-list small{display:block}.plan-list strong{color:#4d3030;font-size:10px}.plan-list small{color:#958780;font-size:8px}.plan-list article>span{font-size:9px;font-weight:850}.plan-list label{color:#82746e;font-size:8px;font-weight:850}.plan-list label input{width:100%;min-height:34px;box-sizing:border-box;margin-top:3px;padding:5px;border:1px solid #d7cbc5;border-radius:5px}.preview{margin-top:18px}.preview h3,.history h3{color:#4d3030;font-size:14px}.preview article{display:grid;grid-template-columns:minmax(260px,1fr) 110px 260px;align-items:center;gap:12px;min-height:52px;border-top:1px solid #eee6e2}.preview strong,.preview small{display:block}.preview strong{font-size:9px}.preview small{color:#958780;font-size:8px}.preview b{text-align:right;font-size:10px}.preview select{min-height:34px;border:1px solid #d8ccc6;border-radius:6px;font-size:8px}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.history{margin-top:26px;border-top:1px solid #eadfd9}.history article{display:grid;grid-template-columns:minmax(0,1fr) 260px 110px;align-items:center;gap:12px;min-height:55px;border-top:1px solid #f0e9e5}.history strong,.history small{display:block}.history small{color:#958781;font-size:8px}.history span{color:#7c6c65;font-size:9px}.history b{text-align:right;font-size:10px}.cxp-note,.cxp-warning{padding:12px 14px;border-left:3px solid ${NARANJA};background:#fff8ec;color:#7a654f;font-size:10px;line-height:1.5}.cxp-warning p{margin:3px}.empty{padding:44px 20px;border:1px dashed #d8ccc5;border-radius:9px;color:#8e817b;text-align:center;font-size:11px}.pagination{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px}.pagination span{color:#7c6e67;font-size:9px}.modal-bg{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;padding:20px;background:#2b1717a6}.abono-modal{width:min(460px,100%);padding:24px;border-radius:12px;background:#fff;box-shadow:0 20px 60px #0004}.abono-modal h2{margin:5px 0;color:${VINO}}.abono-modal p{margin:0 0 16px;color:#7d6d66;font-size:10px}.abono-modal label{display:block;margin-top:11px}
@media(max-width:1100px){.cxp-kpis,.cxp-kpis.five{grid-template-columns:repeat(2,minmax(0,1fr))}.cxp-toolbar.plan{grid-template-columns:1fr 1fr}.cxp-toolbar.plan .search{grid-column:1/-1}.plan-list article{grid-template-columns:26px minmax(180px,1fr) 100px 130px}.plan-list article>span:first-of-type{display:none}.plan-list article button{grid-column:4}.form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.cxp-page{padding:15px 12px 90px}.cxp-header{align-items:flex-start}.cxp-header p{display:none}.cxp-kpis,.cxp-kpis.five{grid-template-columns:1fr 1fr}.cxp-toolbar,.cxp-toolbar.plan{grid-template-columns:1fr}.cxp-toolbar .search,.cxp-toolbar.plan .search{grid-column:auto}.form-grid{grid-template-columns:1fr}.form-grid .span2{grid-column:auto}.calc{align-items:flex-end;flex-wrap:wrap}.plan-list article{grid-template-columns:26px 1fr 110px}.plan-list article>span{display:none}.plan-list article label{grid-column:2}.plan-list article button{grid-column:3}.preview article{grid-template-columns:1fr 90px}.preview select{grid-column:1/-1}.history article{grid-template-columns:1fr auto}.history span{grid-column:1/-1}}
`
