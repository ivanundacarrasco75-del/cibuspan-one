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
  gastos: number
}

const cuentasTransporte = new Set(["6.1.01.2.13.01", "6.1.01.2.13.02"])

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
      supabase.from("fin_vw_costos_gastos_rubros_mensual").select("cuenta_codigo,valor")
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

    const transporte = (rubros.data ?? []).reduce((total, rubro) => total + Number(rubro.valor), 0)
    const gastos = Number(fila.gasto_especifico_cliente) + Number(fila.gasto_general) - transporte
    const manoObra = mod.reduce((total, registro) => total + Number(registro.costo_empresa), 0)
    const cif = Number(fila.cif_total_informativo)
    if (![manoObra, cif, transporte, gastos].every(Number.isFinite)) continue
    return { periodo, archivos, unidadesProducidas, unidadesVendidas, manoObra, cif, transporte, gastos }
  }
  return null
}
