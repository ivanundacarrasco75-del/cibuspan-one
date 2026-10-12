import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaHoyCampoDashboard, semanasDashboardCampo, resumirSemanasCampo, variacionSemanalCampo } from '../src/utils/dashboardVisitasRotacion.ts'

const semanas=semanasDashboardCampo('2026-10-12')
const productos=[{id:'p1',codigo:'EAN1',nombre:'Integral'},{id:'p2',codigo:'EAN2',nombre:'Rollo'}]
const registro=(id, fecha, valor, extra={})=>({id,fecha,visitado_en:`${fecha}T12:00:00Z`,actualizado_en:`${fecha}T12:00:00Z`,cliente_id:'c1',local_id:'l1',local_nombre:'Local 1',producto_id:'p1',producto_codigo:'EAN1',producto_nombre:'Integral',responsable_rol:'MERCADERISTA',valores:{rotacion:valor,stock:valor,stock_cd:valor},...extra})
const resumen=(registros,extra={})=>resumirSemanasCampo({registros,productos,semanas,indicador:'rotacion',...extra})
const sku=(series,id='p1')=>series.find(s=>s.id===id)

test('Cinco semanas calendario lunes a domingo, incluyendo cambios de mes y año',()=>{
 assert.equal(semanas.length,5);assert.deepEqual(semanas.map(s=>s.desde),['2026-09-14','2026-09-21','2026-09-28','2026-10-05','2026-10-12'])
 assert.equal(semanas[4].hasta,'2026-10-18')
 assert.deepEqual(semanasDashboardCampo('2026-10-11').at(-1),{desde:'2026-10-05',hasta:'2026-10-11',etiqueta:'Semana de referencia'})
 assert.equal(semanasDashboardCampo('2027-01-01').at(-1).desde,'2026-12-28')
 assert.throws(()=>semanasDashboardCampo('2026-02-30'),/válida/)
})
test('La semana actual usa la fecha ecuatoriana aun cuando UTC ya es lunes',()=>{
 assert.equal(fechaHoyCampoDashboard(new Date('2026-10-12T03:00:00Z')),'2026-10-11')
 assert.equal(fechaHoyCampoDashboard(new Date('2026-10-12T05:00:00Z')),'2026-10-12')
})
test('Visitas repetidas no inflan el dato: última revisión por local y SKU; cero registrado permanece cero',()=>{
 const datos=[registro('1','2026-10-12',10,{visitado_en:'2026-10-12T09:00:00Z'}),registro('2','2026-10-12',0),registro('3','2026-10-12',6,{local_id:'l2'})]
 const p=sku(resumen(datos)).semanas[4]
 assert.equal(p.valor,3);assert.equal(p.locales_con_dato,2);assert.equal(p.locales_revisados,2)
 assert.deepEqual(resumen([...datos].reverse()),resumen(datos))
})
test('No rellena semanas ni campos ausentes con cero o con datos de visitas antiguas',()=>{
 const datos=[registro('1','2026-10-05',8),registro('2','2026-10-12',10,{visitado_en:'2026-10-12T09:00:00Z'}),registro('3','2026-10-12',null)]
 const p=sku(resumen(datos))
 assert.equal(p.semanas[2].valor,null);assert.equal(p.semanas[3].valor,8);assert.equal(p.semanas[4].valor,null)
 assert.equal(p.semanas[4].locales_revisados,1);assert.equal(p.semanas[4].locales_con_dato,0)
 assert.ok(sku(resumen(datos),'p2').semanas.every(s=>s.valor===null))
})
test('Filtros de cliente, local y tipo de visita se aplican antes de seleccionar la última revisión',()=>{
 const datos=[registro('1','2026-10-12',3),registro('2','2026-10-12',9,{responsable_rol:'KAM',visitado_en:'2026-10-12T16:00:00Z'}),registro('3','2026-10-12',5,{local_id:'l2'}),registro('4','2026-10-12',100,{cliente_id:'c2',local_id:'l3'})]
 assert.equal(sku(resumen(datos,{clienteId:'c1',localId:'l1',origen:'MERCADERISTA'})).semanas[4].valor,3)
 assert.equal(sku(resumen(datos,{clienteId:'c1',localId:'l1'})).semanas[4].valor,9)
 assert.equal(sku(resumen(datos,{clienteId:'c1'})).semanas[4].valor,7)
 assert.equal(sku(resumen(datos,{clienteId:'c2'})).semanas[4].valor,100)
})
test('Stock de locales se suma una vez; CD y rotación se promedian sin sumar el mismo CD repetido',()=>{
 const datos=[registro('1','2026-10-12',10),registro('2','2026-10-12',20,{local_id:'l2'}),registro('3','2026-10-12',null,{local_id:'l3'})]
 assert.equal(sku(resumen(datos,{indicador:'stock'})).semanas[4].valor,30)
 assert.equal(sku(resumen(datos,{indicador:'stock_cd'})).semanas[4].valor,15)
 assert.equal(sku(resumen(datos)).semanas[4].valor,15)
})
test('Conserva todos los SKU del catálogo y los históricos que tienen revisión en el rango',()=>{
 const datos=[registro('1','2026-10-12',4,{producto_id:'antiguo',producto_codigo:'OLD',producto_nombre:'Producto histórico'}),registro('2','2026-09-01',90,{producto_id:'fuera'})]
 const result=resumen(datos)
 assert.deepEqual(new Set(result.map(r=>r.id)),new Set(['p1','p2','antiguo']))
})
test('Variación requiere ambas semanas y nunca divide entre cero',()=>{
 const dato=(valor)=>({valor,locales_con_dato:1,locales_revisados:1,ultima_fecha:'2026-10-12'})
 assert.deepEqual(variacionSemanalCampo(dato(6),dato(4)),{diferencia:2,porcentaje:50})
 assert.deepEqual(variacionSemanalCampo(dato(6),dato(0)),{diferencia:6,porcentaje:null})
 assert.equal(variacionSemanalCampo(dato(6),dato(null)),null)
 assert.deepEqual(variacionSemanalCampo(dato(0),dato(4)),{diferencia:-4,porcentaje:-100})
})
