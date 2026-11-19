import { supabase } from "../lib/supabase"
import { obtenerNominaMensualAreaDb } from "./nominaRepository"
import { obtenerResumenProduccionesRangoDb } from "./produccionRepository"
import { obtenerVentasDiariasRangoDb } from "./ventasRepository"

export type BaseCostosCotizacion = {
  periodo: string
  archivos: string[]
  unidadesProducidas: number
  unidadesVendidas: number
  manoObra: number
  cif: number
  transporte: number
  gastosGenerales: number
  gastosEspecificos: number
  gastosEspecificosPorCliente: Map<string, number>
  unidadesPorCliente: Map<string, number>
}

const cuentasTransporte = new Set(["6.1.01.2.13.01", "6.1.01.2.13.02"])

export async function obtenerMaterialesCotizacion(productoId: string) {
  const [costos, empaques] = await Promise.all([
    supabase.from("fm_vw_productos_costo_completo")
      .select("formula_version_id,panes_por_batch,rendimiento_unidades,costo_materia_prima_unidad,costo_materiales_unidad,items_sin_costo")
      .eq("producto_id", productoId),
    supabase.from("fm_vw_empaques_producto_costeados").select("producto_id")
      .eq("producto_id", productoId).limit(1),
  ])
  if (costos.error) throw costos.error
  if (empaques.error) throw empaques.error
  const ids = costos.data.flatMap((fila) => fila.formula_version_id ? [fila.formula_version_id] : [])
  if (ids.length === 0) return null

  const { data: versiones, error } = await supabase.from("fm_formula_versiones").select("id")
    .in("id", ids).eq("estado", "VIGENTE")
  if (error) throw error
  const vigentes = new Set(versiones.map(({ id }) => id))
  const filas = costos.data.filter((fila) => vigentes.has(fila.formula_version_id))
  if (filas.length !== 1) return null
  const [fila] = filas
  if (fila.costo_materia_prima_unidad == null || fila.costo_materiales_unidad == null ||
    fila.items_sin_costo == null || Number(fila.items_sin_costo) !== 0) return null
  const costo = Number(fila.costo_materiales_unidad)
  if (!Number.isFinite(costo) || costo < 0) return null

  const panes = Number(fila.panes_por_batch)
  const rendimiento = Number(fila.rendimiento_unidades ?? fila.panes_por_batch)
  return {
    costo,
    panesPorUnidad: panes > 0 && rendimiento > 0 ? panes / rendimiento : null,
    tieneEmpaque: empaques.data.length > 0,
  }
}

async function obtenerGastosEspecificosPorCliente(periodo: string) {
  const gastos = new Map<string, number>()
  const limite = 1000
  for (let inicio = 0; ; inicio += limite) {
    const { data, error } = await supabase.from("fin_vw_resultado_clasificacion_detalle")
      .select("cuenta_codigo,valor,clientes")
      .eq("periodo", periodo).eq("clasificacion_gerencial", "GASTO_ESPECIFICO_CLIENTE")
      .order("id").range(inicio, inicio + limite - 1)
    if (error) throw error

    for (const fila of data) {
      if (cuentasTransporte.has(fila.cuenta_codigo) || !Array.isArray(fila.clientes)) continue
      for (const asignacion of fila.clientes) {
        if (!asignacion.cliente_id) continue
        const valor = asignacion.valor_asignado == null
          ? Number(fila.valor) * Number(asignacion.porcentaje) / 100
          : Number(asignacion.valor_asignado)
        if (!Number.isFinite(valor)) throw new Error("El gasto específico asignado no es válido.")
        gastos.set(asignacion.cliente_id, (gastos.get(asignacion.cliente_id) ?? 0) + valor)
      }
    }
    if (data.length < limite) return gastos
  }
}

type PrecioSucursal = {
  precio: number
  bodega: { id: string; cliente_id: string; nombre: string }
}

export async function obtenerPreciosSucursalCotizacion(productoId: string) {
  const { data, error } = await supabase.from("cliente_bodega_precios")
    .select("precio,bodega:bodegas!inner(id,cliente_id,nombre)")
    .eq("producto_id", productoId).eq("bodega.activo", true)
  if (error) throw error
  return (data ?? []) as unknown as PrecioSucursal[]
}

export async function obtenerPrecioFacturadoCotizacion(clienteId: string, productoId: string) {
  const ventas = () => supabase.from("com_ventas_detalle")
    .select("fecha_emision,precio_unitario")
    .eq("cliente_id", clienteId).eq("producto_id", productoId)
    .gt("cantidad", 0).gt("precio_unitario", 0)

  const { data: ultima, error } = await ventas()
    .order("fecha_emision", { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!ultima) return null

  const { data: distintos, error: errorDistintos } = await ventas()
    .eq("fecha_emision", ultima.fecha_emision)
    .neq("precio_unitario", ultima.precio_unitario).limit(1)
  if (errorDistintos) throw errorDistintos
  return distintos.length
    ? { estado: "varios" as const, fecha: ultima.fecha_emision }
    : { estado: "disponible" as const, fecha: ultima.fecha_emision, precio: Number(ultima.precio_unitario) }
}

export async function obtenerTransporteClienteCotizacion(periodo: string, clienteId: string) {
  const { data, error } = await supabase.from("fin_vw_transporte_cliente_clasificado")
    .select("gasto_transporte,unidades_facturadas")
    .eq("periodo", periodo).eq("cliente_id", clienteId).maybeSingle()
  if (error) throw error
  if (data?.gasto_transporte == null || data.unidades_facturadas == null) return null

  const total = Number(data.gasto_transporte)
  const unidades = Number(data.unidades_facturadas)
  return Number.isFinite(total) && total >= 0 && Number.isFinite(unidades) && unidades > 0
    ? { total, unidades }
    : null
}

export async function obtenerBaseCostosCotizacion(): Promise<BaseCostosCotizacion | null> {
  const [finanzas, cierres, nomina] = await Promise.all([
    supabase.from("fin_vw_costos_gastos_mensual")
      .select("periodo,cif_total_informativo,gasto_especifico_cliente,gasto_general,clasificacion_pendiente,cuentas_pendientes,cuentas_sin_matriz")
      .order("periodo", { ascending: false }),
    supabase.from("fin_vw_cierre_contable_mensual").select("periodo").eq("mes_cerrado", true),
    obtenerNominaMensualAreaDb(),
  ])
  if (finanzas.error) throw finanzas.error
  if (cierres.error) throw cierres.error
  const cerrados = new Set(cierres.data?.map((fila) => fila.periodo))

  for (const fila of finanzas.data ?? []) {
    const periodo = fila.periodo as string
    if (!cerrados.has(periodo) || Number(fila.clasificacion_pendiente) > 0.02 ||
      Number(fila.cuentas_pendientes) !== 0 || Number(fila.cuentas_sin_matriz) !== 0) continue
    const mod = nomina.filter((registro) => registro.periodo === periodo && registro.area === "MANO_OBRA_DIRECTA" && registro.costo_empresa !== null)
    if (mod.length === 0 || fila.cif_total_informativo == null || fila.gasto_especifico_cliente == null || fila.gasto_general == null) continue

    const [anio, mes] = periodo.split("-").map(Number)
    const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
    const [produccion, ventas, rubros, balance] = await Promise.all([
      obtenerResumenProduccionesRangoDb(periodo, hasta, true),
      obtenerVentasDiariasRangoDb(periodo, hasta),
      supabase.from("fin_vw_costos_gastos_rubros_mensual").select("clasificacion_gerencial,valor")
        .eq("periodo", periodo).in("cuenta_codigo", [...cuentasTransporte])
        .in("clasificacion_gerencial", ["GASTO_ESPECIFICO_CLIENTE", "GASTO_GENERAL"])
        .eq("impacta_ebitda", true).eq("incluida_costo_venta_contable", false),
      supabase.from("fin_resultados_mensuales")
        .select("fin_importaciones_resultados(archivo_nombre)").eq("periodo", periodo),
    ])
    if (rubros.error) throw rubros.error
    if (balance.error) throw balance.error
    const archivos = [...new Set((balance.data ?? []).flatMap((cuenta) => {
      const origen = cuenta.fin_importaciones_resultados as unknown as { archivo_nombre: string } | null
      return origen?.archivo_nombre ? [origen.archivo_nombre] : []
    }))].sort()
    const unidadesHistoricas = produccion.filter((orden) => orden.origen === "HISTORICO")
      .reduce((total, orden) => total + Number(orden.total_unidades ?? 0), 0)
    const unidadesProducidas = unidadesHistoricas > 0 ? unidadesHistoricas
      : produccion.filter((orden) => orden.origen === "APP")
        .reduce((total, orden) => total + Number(orden.total_unidades ?? 0), 0)
    const unidadesVendidas = ventas.reduce((total, venta) => total + Number(venta.cantidad ?? 0), 0)
    if (unidadesProducidas <= 0 || unidadesVendidas <= 0) continue

    const transporteGeneral = (rubros.data ?? [])
      .filter((rubro) => rubro.clasificacion_gerencial === "GASTO_GENERAL")
      .reduce((total, rubro) => total + Number(rubro.valor), 0)
    const transporteEspecifico = (rubros.data ?? [])
      .filter((rubro) => rubro.clasificacion_gerencial === "GASTO_ESPECIFICO_CLIENTE")
      .reduce((total, rubro) => total + Number(rubro.valor), 0)
    const transporte = transporteGeneral + transporteEspecifico
    const gastosGenerales = Number(fila.gasto_general) - transporteGeneral
    const gastosEspecificos = Number(fila.gasto_especifico_cliente) - transporteEspecifico
    const manoObra = mod.reduce((total, registro) => total + Number(registro.costo_empresa), 0)
    const cif = Number(fila.cif_total_informativo)
    if (![manoObra, cif, transporte, gastosGenerales, gastosEspecificos].every(Number.isFinite)) continue
    const unidadesPorCliente = new Map<string, number>()
    for (const venta of ventas) {
      if (!venta.cliente_id) continue
      unidadesPorCliente.set(venta.cliente_id, (unidadesPorCliente.get(venta.cliente_id) ?? 0) + Number(venta.cantidad ?? 0))
    }
    const gastosEspecificosPorCliente = await obtenerGastosEspecificosPorCliente(periodo)
    return {
      periodo, archivos, unidadesProducidas, unidadesVendidas, manoObra, cif,
      transporte, gastosGenerales, gastosEspecificos, gastosEspecificosPorCliente, unidadesPorCliente,
    }
  }
  return null
}
