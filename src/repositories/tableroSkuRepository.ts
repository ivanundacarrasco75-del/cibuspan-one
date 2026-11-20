import { supabase } from "../lib/supabase"
import { obtenerVentasDiariasRangoDb } from "./ventasRepository"
import { obtenerDevolucionesDb } from "./devolucionRepository"
import { obtenerDashboardVisitasRotacion } from "./dashboardVisitasRotacionRepository"
import type { DatosTableroSku, CatalogoSku, CostoSku } from "../utils/tableroSku"
import { obtenerNominaMensualAreaDb } from "./nominaRepository"
import { obtenerPromocionesDb } from "./promocionesRepository"
import { obtenerReglasDistribucionDb } from "./rentabilidadRepository"
import { obtenerResultadosMensualesDb } from "./costosIndirectosRepository"
import { periodosCerradosTableroSku } from "../utils/tableroSku"
import { fechaHoyCampoDashboard } from "../utils/dashboardVisitasRotacion"

export async function obtenerPeriodosTableroSku() {
  const [balances,cierres] = await Promise.all([obtenerResultadosMensualesDb(),supabase.from('fin_vw_cierre_contable_mensual').select('periodo,mes_cerrado')])
  if (cierres.error) throw new Error(`No se pudo comprobar el cierre de los balances: ${cierres.error.message}`)
  return periodosCerradosTableroSku(balances,cierres.data??[],fechaHoyCampoDashboard())
}

async function obtenerGastosClasificados(desde:string,hasta:string) {
  const filas:NonNullable<NonNullable<DatosTableroSku['contabilidad']>['gastos']> = []
  for (let inicio=0;;inicio+=500) {
    const {data,error} = await supabase.from('fin_vw_gasto_especifico_cliente_clasificado')
      .select('periodo,detalle_id,cuenta_codigo,cliente_id,valor_asignado').gte('periodo',desde).lte('periodo',hasta)
      .order('detalle_id').order('cliente_id').range(inicio,inicio+499)
    if(error)throw new Error(error.message)
    filas.push(...(data??[])); if((data?.length??0)<500)return filas
  }
}

async function leerCatalogo<T>(tabla: string, campos: string, orden: string, activo = false): Promise<T[]> {
  const filas: T[] = []
  for (let inicio = 0; ; inicio += 500) {
    let consulta = supabase.from(tabla).select(campos).order(orden)
    if (activo) consulta = consulta.eq("activo", true)
    const { data, error } = await consulta.range(inicio, inicio + 499)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []) as unknown as T[])
    if ((data?.length ?? 0) < 500) return filas
  }
}

export async function obtenerTableroSku(desde: string, hasta: string): Promise<DatosTableroSku> {
  const [productos, clientes, asignaciones] = await Promise.all([
    leerCatalogo<CatalogoSku>("productos", "id,codigo,nombre,corto", "id", true),
    leerCatalogo<{ id: string; nombre: string }>("clientes", "id,nombre", "id", true),
    leerCatalogo<{ cliente_id: string; producto_id: string; precio: number | null }>("cliente_productos", "cliente_id,producto_id,precio", "id", true),
  ])
  const resultados = await Promise.allSettled([
    obtenerVentasDiariasRangoDb(desde, hasta),
    obtenerDevolucionesDb(desde, hasta),
    obtenerDashboardVisitasRotacion("", desde, hasta, { soloAsignados: true }),
    leerCatalogo<CostoSku>("fm_vw_productos_costo_completo",
      "producto_id,producto_codigo,batch_calculado_kg,rendimiento_unidades,costo_materiales_unidad,items_sin_costo", "producto_id"),
    Promise.resolve([]), obtenerNominaMensualAreaDb(), obtenerPromocionesDb(), obtenerReglasDistribucionDb(),
    obtenerGastosClasificados(desde,hasta),
    supabase.from('fin_vw_costos_gastos_mensual').select('periodo,gasto_especifico_cliente,clasificacion_pendiente,cuentas_pendientes,cuentas_sin_matriz').gte('periodo',desde).lte('periodo',hasta).then(r=>{if(r.error)throw new Error(r.error.message);return r.data}),
  ] as const)
  const errores: string[] = []
  const nombres = ["Ventas", "Devoluciones", "Visitas", "Costos", "Facturas", "Nómina", "Promociones", "Reglas de distribución", "Gastos del libro mayor", "Conciliación del balance"]
  resultados.forEach((resultado, indice) => {
    if (resultado.status === "rejected") {
      errores.push(`${nombres[indice]} · ${resultado.reason instanceof Error ? resultado.reason.message : "No se pudo consultar esta fuente"}`)
    }
  })
  const [ventas, devoluciones, visitas, costos, facturas, nomina, promociones, reglas, gastos, resumen] = resultados
  return {
    productos, clientes, asignaciones, errores,
    ventas: ventas.status === "fulfilled" ? ventas.value : null,
    devoluciones: devoluciones.status === "fulfilled" ? devoluciones.value : null,
    visitas: visitas.status === "fulfilled" ? visitas.value.registros : null,
    costos: costos.status === "fulfilled" ? costos.value : null,
    contabilidad: {gastos:gastos.status==='fulfilled'?gastos.value:null,resumen:resumen.status==='fulfilled'?resumen.value:null},
    rentabilidad: {
      facturas: facturas.status === "fulfilled" ? facturas.value : null,
      nomina: nomina.status === "fulfilled" ? nomina.value : null,
      promociones: promociones.status === "fulfilled" ? promociones.value : null,
      reglas: reglas.status === "fulfilled" ? reglas.value : null,
    },
  }
}
