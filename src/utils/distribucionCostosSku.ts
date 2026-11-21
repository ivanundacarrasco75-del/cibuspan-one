import type {FilaCalculo} from './calculoRentabilidadSku'
import type {BaseDistribucion,ReglaDistribucionDb} from '../repositories/rentabilidadRepository'

export type RubroCompartidoSku = {
  periodo:string; cuenta_codigo:string; clasificacion_gerencial:string; origen:string
  impacta_ebitda:boolean; incluida_costo_venta_contable:boolean; valor:number
}
export type ResumenCompartidoSku = {
  periodo:string; cif_total_informativo?:number|null; gasto_general?:number|null; depreciaciones?:number|null
}
type Reparto = {importe:number|null; base:BaseDistribucion; asignado:number; pendiente:boolean; motivo:string; incidencias:string[]}

// Materiales de fórmula y MOD no contienen estos rubros. El costo de venta
// contable completo NO se suma: duplicaría los materiales y la mano de obra.
export function distribuirCostosCompartidosSku({movimientos,rubros,resumen,reglas,periodo,devolucionesSinImporte=false,baseCif:baseCifElegida}: {
  movimientos:FilaCalculo[]; rubros:RubroCompartidoSku[]|null|undefined
  resumen:ResumenCompartidoSku[]|null|undefined; reglas:ReglaDistribucionDb[]; periodo:string
  devolucionesSinImporte?:boolean; baseCif?:BaseDistribucion
}) {
  const baseCif = baseCifElegida ?? reglas.find(r=>r.codigo==='OPERACION')?.base_distribucion ?? 'KG_EQUIVALENTE'
  const baseGeneral = reglas.find(r=>r.codigo==='ESTRUCTURA_GENERAL')?.base_distribucion ?? 'VENTAS_NETAS'
  const monto = (v:unknown) => v!==null && v!==undefined && Number.isFinite(Number(v)) ? Number(v) : null
  const balance = resumen?.find(r=>r.periodo===periodo)
  const filas = (rubros??[]).filter(r=>r.periodo===periodo && ['CIF','GASTO_GENERAL'].includes(r.clasificacion_gerencial))
  const sumar = (predicado:(r:RubroCompartidoSku)=>boolean) => filas.filter(predicado).reduce((s,r)=>s+Number(r.valor),0)
  const cif = sumar(r=>r.clasificacion_gerencial==='CIF')
  const generales = sumar(r=>r.clasificacion_gerencial==='GASTO_GENERAL')
  const cifInformativo = sumar(r=>r.clasificacion_gerencial==='CIF' && (r.incluida_costo_venta_contable || r.impacta_ebitda || r.origen==='DETALLE'))
  const generalOperativo = sumar(r=>r.clasificacion_gerencial==='GASTO_GENERAL' && (r.impacta_ebitda || r.origen==='DETALLE'))
  const depreciaciones = sumar(r=>r.origen==='ER' && !r.impacta_ebitda)
  const fuenteDisponible = rubros!=null && balance!=null &&
    filas.every(r=>monto(r.valor)!==null && ['ER','DETALLE'].includes(r.origen)) &&
    monto(balance.cif_total_informativo)!==null && monto(balance.gasto_general)!==null && monto(balance.depreciaciones)!==null
  const conciliado = fuenteDisponible && Math.abs(cifInformativo-Number(balance.cif_total_informativo))<=.05 &&
    Math.abs(generalOperativo-Number(balance.gasto_general))<=.05 && Math.abs(depreciaciones-Number(balance.depreciaciones))<=.05
  const repartir = (importe:number,base:BaseDistribucion) => {
    const incidencias = movimientos.filter(f=>base==='KG_EQUIVALENTE' ? f.unidades>0 && (!Number.isFinite(f.kgEquivalente) || f.kgEquivalente<=0)
      : base==='UNIDADES' ? !Number.isFinite(f.unidades) : !Number.isFinite(f.ventasNetas)).map(f=>`${f.codigo} · ${f.sku}`)
    const peso = (f:FilaCalculo) => Math.max(0,base==='KG_EQUIVALENTE'?f.kgEquivalente:base==='UNIDADES'?f.unidades:f.ventasNetas)
    const total = movimientos.reduce((s,f)=>s+peso(f),0)
    const faltaBase = importe!==0 && (incidencias.length>0 || !Number.isFinite(total) || total<=0 || base==='VENTAS_NETAS' && devolucionesSinImporte)
    const motivo = !fuenteDisponible ? 'Faltan los rubros de CIF, gastos generales o depreciaciones del balance.' : !conciliado ? 'Los rubros no concilian con el resumen mensual del balance.'
      : faltaBase ? base==='KG_EQUIVALENTE' && incidencias.length ? 'Falta equivalencia en kilos para repartir todos los CIF del mes.'
        : base==='VENTAS_NETAS' && devolucionesSinImporte ? 'Faltan importes de devoluciones para calcular la base de ventas netas.' : 'Falta una base completa y positiva para repartir el gasto.' : ''
    const valores = new Map(movimientos.map(f=>[f.key,motivo ? null : importe===0 ? 0 : importe*peso(f)/total]))
    const control:Reparto = {importe:fuenteDisponible?importe:null,base,asignado:[...valores.values()].reduce<number>((s,v)=>s+(v??0),0),pendiente:!!motivo,motivo,incidencias}
    return {valores,control}
  }
  const repartoCif = repartir(cif,baseCif), repartoGeneral = repartir(generales,baseGeneral)
  return {cif:repartoCif.valores,generales:repartoGeneral.valores,controlCif:repartoCif.control,controlGeneral:repartoGeneral.control,
    conciliado,depreciaciones:fuenteDisponible?depreciaciones:null,completo:!repartoCif.control.pendiente && !repartoGeneral.control.pendiente}
}
