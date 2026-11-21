import { supabase } from "../lib/supabase"
import { obtenerVentasDiariasRangoDb } from "./ventasRepository"
import { obtenerDevolucionesDb } from "./devolucionRepository"
import { obtenerDashboardVisitasRotacion } from "./dashboardVisitasRotacionRepository"
import type { DatosTableroSku, CatalogoSku, CostoSku } from "../utils/tableroSku"
import { obtenerNominaMensualAreaDb } from "./nominaRepository"
import { obtenerPromocionesDb } from "./promocionesRepository"
import { obtenerReglasDistribucionDb } from "./rentabilidadRepository"
import { obtenerResultadosMensualesDb } from "./costosIndirectosRepository"
import { periodosCerradosTableroSku,periodoRecientePdv } from "../utils/tableroSku"
import { fechaHoyCampoDashboard } from "../utils/dashboardVisitasRotacion"

export async function obtenerPeriodosTableroSku() {
  const [balances,cierres] = await Promise.all([obtenerResultadosMensualesDb(),supabase.from('fin_vw_cierre_contable_mensual').select('periodo,mes_cerrado')])
  if (cierres.error) throw new Error(`No se pudo comprobar el cierre de los balances: ${cierres.error.message}`)
  return periodosCerradosTableroSku(balances,cierres.data??[],fechaHoyCampoDashboard())
}

// La rotación operativa no se limita al mes del balance: se consulta la última
// fecha PDV disponible para el cliente/SKU activo y los 28 días que la incluyen.
export async function obtenerRotacionRecienteTableroSku(datos:DatosTableroSku, clienteId='', productoId='') {
  const activos = new Set(datos.productos.map(p=>p.id))
  const clientes = new Set(datos.clientes.map(c=>c.id))
  const asignaciones = datos.asignaciones.filter(a=>activos.has(a.producto_id) && clientes.has(a.cliente_id) && (!clienteId || a.cliente_id===clienteId) && (!productoId || a.producto_id===productoId))
  if (!asignaciones.length) return null
  const permitidos = new Set(asignaciones.map(a=>`${a.cliente_id}|${a.producto_id}`))
  const idsProducto = [...new Set(asignaciones.map(a=>a.producto_id))]
  const idsCliente = [...new Set(asignaciones.map(a=>a.cliente_id))]
  for(let inicio=0;;inicio+=200) {
    const {data,error} = await supabase.from('com_visitas_campo')
      .select('id,fecha_visita,cliente_id,mediciones:com_visitas_campo_sku!inner(producto_id,rotacion_diaria_unidades)')
      .eq('estado','CONFIRMADA').lte('fecha_visita',fechaHoyCampoDashboard())
      .in('cliente_id',idsCliente).in('mediciones.producto_id',idsProducto)
      .not('mediciones.rotacion_diaria_unidades','is',null)
      .order('fecha_visita',{ascending:false}).order('id',{ascending:false}).range(inicio,inicio+199)
    if(error)throw new Error(`No se pudo consultar la última rotación PDV: ${error.message}`)
    const visitas = (data??[]) as unknown as Array<{fecha_visita:string;cliente_id:string;mediciones:Array<{producto_id:string;rotacion_diaria_unidades:number|null}>}>
    const ultima = visitas.find(v=>v.mediciones.some(m=>m.rotacion_diaria_unidades!==null && permitidos.has(`${v.cliente_id}|${m.producto_id}`)))
    if(ultima) {
      const periodo = periodoRecientePdv(ultima.fecha_visita)
      const resultado = await obtenerDashboardVisitasRotacion(clienteId,periodo.desde,periodo.hasta,{soloAsignados:true})
      return {...periodo,clienteId,productoId,registros:resultado.registros.filter(r=>permitidos.has(`${r.cliente_id}|${r.producto_id}`))}
    }
    if(visitas.length<200)return null
  }
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

async function obtenerRubrosCompartidos(desde:string,hasta:string) {
  const filas:NonNullable<NonNullable<DatosTableroSku['contabilidad']>['rubros']> = []
  for(let inicio=0;;inicio+=500){
    const {data,error}=await supabase.from('fin_vw_costos_gastos_rubros_mensual')
      .select('periodo,cuenta_codigo,clasificacion_gerencial,origen,impacta_ebitda,incluida_costo_venta_contable,valor')
      .gte('periodo',desde).lte('periodo',hasta).in('clasificacion_gerencial',['CIF','GASTO_GENERAL'])
      .order('periodo').order('cuenta_codigo').order('clasificacion_gerencial').order('origen').order('impacta_ebitda').order('incluida_costo_venta_contable').order('valor')
      .range(inicio,inicio+499)
    if(error)throw new Error(error.message)
    filas.push(...(data??[]));if((data?.length??0)<500)return filas
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
    Promise.resolve({registros:[]}),
    leerCatalogo<CostoSku>("fm_vw_productos_costo_completo",
      "producto_id,producto_codigo,batch_calculado_kg,rendimiento_unidades,costo_materiales_unidad,items_sin_costo", "producto_id"),
    Promise.resolve([]), obtenerNominaMensualAreaDb(), obtenerPromocionesDb(), obtenerReglasDistribucionDb(),
    obtenerGastosClasificados(desde,hasta),
    supabase.from('fin_vw_costos_gastos_mensual').select('periodo,gasto_especifico_cliente,clasificacion_pendiente,cuentas_pendientes,cuentas_sin_matriz,cif_total_informativo,gasto_general,depreciaciones').gte('periodo',desde).lte('periodo',hasta).then(r=>{if(r.error)throw new Error(r.error.message);return r.data}),
    obtenerRubrosCompartidos(desde,hasta),
  ] as const)
  const errores: string[] = []
  const nombres = ["Ventas", "Devoluciones", "Visitas", "Costos", "Facturas", "Nómina", "Promociones", "Reglas de distribución", "Gastos del libro mayor", "Conciliación del balance", "CIF y gastos generales"]
  resultados.forEach((resultado, indice) => {
    if (resultado.status === "rejected") {
      errores.push(`${nombres[indice]} · ${resultado.reason instanceof Error ? resultado.reason.message : "No se pudo consultar esta fuente"}`)
    }
  })
  const [ventas, devoluciones, visitas, costos, facturas, nomina, promociones, reglas, gastos, resumen, rubros] = resultados
  return {
    productos, clientes, asignaciones, errores,
    ventas: ventas.status === "fulfilled" ? ventas.value : null,
    devoluciones: devoluciones.status === "fulfilled" ? devoluciones.value : null,
    visitas: visitas.status === "fulfilled" ? visitas.value.registros : null,
    costos: costos.status === "fulfilled" ? costos.value : null,
    contabilidad: {gastos:gastos.status==='fulfilled'?gastos.value:null,resumen:resumen.status==='fulfilled'?resumen.value:null,rubros:rubros.status==='fulfilled'?rubros.value:null},
    rentabilidad: {
      facturas: facturas.status === "fulfilled" ? facturas.value : null,
      nomina: nomina.status === "fulfilled" ? nomina.value : null,
      promociones: promociones.status === "fulfilled" ? promociones.value : null,
      reglas: reglas.status === "fulfilled" ? reglas.value : null,
    },
  }
}
