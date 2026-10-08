import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarOrdenesConfirmadasPdf } from '../src/utils/ordenesConfirmadasPdf.ts'
import { compararConsumosOp } from '../src/utils/comparacionConsumosOp.ts'
import { procesarFilasOrdenesProduccion } from '../src/utils/ordenesProduccionExcel.ts'
import { ajustarFechasOrdenesHistoricas, claveOrdenHistorica } from '../src/utils/fechasOrdenesHistoricas.ts'

const item = (texto,x,y) => ({texto,x,y})
const row = (numero,op,sku,cantidad,codigo,nombre,y,costo='1',total=cantidad) => [
 item(`${numero} 001`,29,y),item('MATRIZ',60,y),item('02/10/2026',89,y),item('02/10/2026',126,y),
 item('PANGOLIN ROLLO 120U',163,y),item(sku,213,y),item('ROLLO',268,y),item(op,363,y),
 // PDF.js puede unir cantidades y códigos de columnas contiguas.
 item(`${cantidad} ${codigo}`,397,y),item(nombre,462,y),item(costo,520,y),item(total,559,y),
]
const corte = item('Fecha de corte del: 01/10/2026 al: 08/10/2026',29,790)
const total = (cantidad,costo) => item(`Totales del: 01/10/2026 al: 08/10/2026 ${cantidad} 10 ${costo}`,29,20)

test('PDF confirmado conserva consumo y SKU TUTI; una cantidad de 1920 nunca se convierte en cero', () => {
 const filas = [corte,...row(1,'26100201','7868304262219T','1920','00034','FUNDA ROLLO',740),...row(2,'26100201','7868304262219T','513.36','00011','HARINA',700),total('2433.36','2433.36')]
 const r=interpretarOrdenesConfirmadasPdf([filas])
 assert.equal(r.filas,2);assert.equal(r.ordenes[0].producto_codigo,'7868304262219T')
 assert.equal(r.unidadesSku,1920);assert.equal(r.ordenes[0].detalles[1].cantidad,513.36)
 assert.equal(r.fechaHasta,'2026-10-02');assert.equal(r.fuente,'CONFIRMADAS');assert.equal(r.advertencias.length,3)
})
test('Filas o totales incompletos impiden una importación parcial del PDF', () => {
 const a=[corte,...row(1,'26100201','7868304262219T','1920','00034','FUNDA ROLLO',740),total('2000','2000')]
 assert.throws(()=>interpretarOrdenesConfirmadasPdf([a]),/no coinciden/)
 assert.throws(()=>interpretarOrdenesConfirmadasPdf([[corte,...row(2,'26100201','7868304262219T','1920','00034','FUNDA ROLLO',740),total('1920','1920')]]),/filas faltantes/)
 const b=[corte,...row(1,'26100201','7868304262219T','','00034','FUNDA ROLLO',740),total('0','0')]
 assert.throws(()=>interpretarOrdenesConfirmadasPdf([b]),/ilegible|vacío/)
})

const op = (detalles,unidades=100,tipo='SKU') => ({ numero_orden:'26100101',producto_codigo:'SKU',producto_nombre:'Producto',fecha_produccion:'2026-10-01',tipo_orden:tipo,unidades_producidas:unidades,kg_micro:unidades,detalles:detalles.map(([codigo,nombre,cantidad])=>({materia_codigo:codigo,materia_nombre:nombre,cantidad})) })
const ref=(componentes)=>({codigoProducto:'SKU',version:'Receta v1',advertencias:[],componentes})
const harina={codigo:'HARINA',nombre:'Harina',unidad:'KG',cantidadPorUnidad:0.3,aliases:['00011']}

test('Compara cantidades escaladas y vincula código contable con ceros iniciales',()=>{
 const r=compararConsumosOp(op([['11','Harina',33]]),ref([harina]))
 assert.equal(r.lineas[0].teorico,30);assert.equal(r.lineas[0].diferencia,3);assert.equal(r.lineas[0].porcentaje,10);assert.equal(r.lineas[0].estado,'DIFERENCIA')
})
test('Ingredientes ausentes no se presentan como consumo cero comprobado, ni se inventa referencia',()=>{
 const r=compararConsumosOp(op([]),ref([harina]));assert.equal(r.lineas[0].real,null);assert.equal(r.lineas[0].estado,'NO REPORTADO');assert.equal(r.lineas[0].diferencia,null)
 const sin=compararConsumosOp(op([['11','Harina',30]]));assert.equal(sin.lineas[0].teorico,null);assert.equal(sin.lineas[0].estado,'SIN REFERENCIA')
})
test('Dos masas suman el consumo del mismo ingrediente y el empaque queda una sola vez',()=>{
 const r=compararConsumosOp(op([['11','Harina',30],['34','Funda',100]]),ref([
  {...harina,cantidadPorUnidad:0.1},{...harina,cantidadPorUnidad:0.2},
  {codigo:'FUNDA',nombre:'Funda',unidad:'UNIDAD',cantidadPorUnidad:1,aliases:['00034']},
 ]));assert.equal(r.lineas.length,2);assert.ok(Math.abs(r.lineas[0].teorico-30)<1e-10);assert.equal(r.lineas[1].teorico,100);assert.ok(r.lineas.every(l=>l.estado==='COINCIDE'))
})
test('La OP de micro se compara por composición y kilo producido sin consumir nuevamente sus ingredientes en PT',()=>{
 const r=compararConsumosOp(op([['13','Azúcar',8],['14','Sal',2]],10,'MICRO'),ref([
  {codigo:'13',nombre:'Azúcar',unidad:'KG',cantidadPorUnidad:0.8},{codigo:'14',nombre:'Sal',unidad:'KG',cantidadPorUnidad:0.2},
 ]));assert.ok(r.lineas.every(l=>l.estado==='COINCIDE'));assert.equal(r.lineas[0].teorico,8)
 const pt=compararConsumosOp(op([['52','Micro chocolate',10]],100),ref([{codigo:'52',nombre:'Micro chocolate',unidad:'KG',cantidadPorUnidad:0.1}]))
 assert.equal(pt.lineas.length,1);assert.equal(pt.lineas[0].codigo,'52')
})
test('Una misma OP con dos SKU conserva ambos registros independientes',()=>{
 const encabezado=['Cod Suc','Sucursal','Fecha Reg','Fecha Fin','Descripción','Cód Prod Term','Nombre Prod Terminado','No Orden','Cant','Cod MP','Nombre de la MP','Costo Unit','Costo Total']
 const linea=(sku)=>['001','MATRIZ','01/10/2026','01/10/2026','120U',sku,'ROLLO','26100101',120,'34','FUNDA ROLLO',1,120]
 const r=procesarFilasOrdenesProduccion([encabezado,linea('7868304262219'),linea('7868304262219T')])
 assert.equal(r.ordenes.length,2);assert.equal(r.unidadesSku,240)
})

const historico = () => procesarFilasOrdenesProduccion([
 ['Cod Suc','Sucursal','Fecha Reg','Fecha Fin','Descripción','Cód Prod Term','Nombre Prod Terminado','No Orden','Cant','Cod MP','Nombre de la MP','Costo Unit','Costo Total'],
 ['001','MATRIZ','03/10/2026','03/10/2026','96U','7868304276322','MANJAR','26100304',192,'86','FUNDA MANJAR',1,192],
 ['001','MATRIZ','03/10/2026','03/10/2026','96U','7868304276322','MANJAR','26100304',17.018,'11','HARINA',1,17.018],
 ['001','MATRIZ','03/10/2026','03/10/2026','96U','7868304262202','OTRO SKU','26100304',96,'86','FUNDA MANJAR',1,96],
])
test('Corregir el día real conserva fechas contables, consumos, costos y clave OP+SKU',()=>{
 const origen=historico(), copia=structuredClone(origen), clave=claveOrdenHistorica(origen.ordenes[0])
 const fechas={ [clave]:'2026-10-01' }, r=ajustarFechasOrdenesHistoricas(origen,fechas)
 assert.deepEqual(origen,copia)
 const a=r.ordenes.find(o=>o.producto_codigo==='7868304276322'), b=r.ordenes.find(o=>o.producto_codigo==='7868304262202')
 assert.equal(a.fecha_produccion,'2026-10-01');assert.equal(a.fecha_registro,'2026-10-03');assert.equal(a.fecha_fin_original,'2026-10-03')
 assert.deepEqual(a.detalles,copia.ordenes[0].detalles);assert.equal(a.unidades_producidas,192);assert.equal(a.costo_total,copia.ordenes[0].costo_total)
 assert.equal(b.fecha_produccion,'2026-10-03');assert.equal(r.fechaDesde,'2026-10-01');assert.equal(r.fechaHasta,'2026-10-03')
 assert.match(a.observaciones,/corregida/);assert.match(b.observaciones,/provisional/)
 assert.deepEqual(ajustarFechasOrdenesHistoricas(origen,fechas),r)
 const comparacion=compararConsumosOp(a)
 assert.equal(comparacion.fecha,'2026-10-01');assert.equal(comparacion.fecha_registro,'2026-10-03');assert.equal(comparacion.fecha_fin_original,'2026-10-03')
})
test('Sin fecha real conocida no se descuentan automáticamente uno o dos días',()=>{
 const origen=historico(), r=ajustarFechasOrdenesHistoricas(origen,{})
 assert.ok(r.ordenes.every(o=>o.fecha_produccion==='2026-10-03'))
 assert.equal(r.unidadesSku,origen.unidadesSku);assert.equal(r.costoTotal,origen.costoTotal)
})
test('Una fecha vacía o imposible bloquea el lote completo; acepta días reales anteriores al corte contable',()=>{
 const origen=historico(), clave=claveOrdenHistorica(origen.ordenes[0])
 for(const fecha of ['', '2026-02-30','2026-13-01','01/10/2026']) assert.throws(()=>ajustarFechasOrdenesHistoricas(origen,{[clave]:fecha}),/fecha válida/)
 assert.equal(ajustarFechasOrdenesHistoricas(origen,{[clave]:'2026-09-30'}).fechaDesde,'2026-09-30')
 assert.equal(ajustarFechasOrdenesHistoricas(origen,{[clave]:'2024-02-29'}).fechaDesde,'2024-02-29')
})
