import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const module={exports:{}}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/retencionesCobros.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports})
const sugerir=module.exports.sugerirRetencionCobro
const factura=(cliente,extras={})=>({cliente,total:115,retenido:0,saldo:115,verificada:true,fuente_valida:true,...extras})
test('Porcentajes informados usan el total confirmado con IVA y reconocen únicamente clientes conocidos',()=>{
 assert.equal(sugerir(factura('CORPORACION FAVORITA C.A.')).importe,'2.30')
 assert.equal(sugerir(factura('MEGA SANTAMARIA S. A.')).importe,'2.30')
 assert.equal(sugerir(factura('TIENDAS TUTI TTDE S. A.')).importe,'2.01')
 assert.equal(sugerir(factura('Santa María')).porcentaje,2)
 assert.equal(sugerir(factura('Tuti')).porcentaje,1.75)
 for(const cliente of ['Cliente Prueba','LA FAVORITA DEL BARRIO','Otro TUTI','Emisión CORPORACION FAVORITA C.A.','CORPORACION FAVORITA C.A. / OTRO']) assert.equal(sugerir(factura(cliente)),null)
})
test('Descuenta retenciones previas sin repetirlas y evita sugerencias que superan el saldo',()=>{
 assert.equal(sugerir(factura('FAVORITA',{retenido:1,saldo:80})).importe,'1.30')
 assert.equal(sugerir(factura('FAVORITA',{retenido:2.3,saldo:50})).importe,'0.00')
 assert.equal(sugerir(factura('FAVORITA',{retenido:3,saldo:50})).importe,'0.00')
 assert.equal(sugerir(factura('FAVORITA',{saldo:1})).importe,null)
 assert.equal(sugerir(factura('TUTI',{total:100,retenido:0.75,saldo:30})).importe,'1.00')
})
test('No estima importes de facturas sin confirmar o inconsistentes, y redondea a centavos',()=>{
 for(const extras of [{verificada:false},{fuente_valida:false},{total:null},{saldo:null},{total:NaN},{retenido:-1},{saldo:-1}])assert.equal(sugerir(factura('FAVORITA',extras)),null)
 assert.equal(sugerir(factura('TUTI',{total:114.99})).importe,'2.01')
 assert.equal(sugerir(factura('FAVORITA',{total:0.25})).importe,'0.01')
})

const sinIva=module.exports.facturaSinIvaCobro
test('Producto sin IVA propone total y retención desde ventas nuevas sin confirmar, sin sustituir correcciones ni fuentes cambiadas',()=>{
 const f={...factura('CORPORACION FAVORITA C.A.'),total:null,saldo:null,revision:0,subtotal_importado:1327.10,cobrado:0}
 const propuesta=sinIva(f)
 assert.equal(propuesta.total,1327.10);assert.equal(propuesta.saldo,1327.10);assert.equal(sugerir(propuesta).importe,'26.54');assert.equal(f.total,null)
 assert.equal(sugerir(sinIva({...f,cliente:'TUTI',subtotal_importado:2059.20})).importe,'36.04')
 for(const extras of [{total:1400},{revision:1},{fuente_valida:false},{subtotal_importado:-1},{cobrado:1},{retenido:1}]){const original={...f,...extras};assert.equal(sinIva(original),original)}
})

const neto=module.exports.netoPendienteCobro
test('Conciliación busca netos de Tuti y descuenta retenciones una sola vez, incluso con cobros parciales',()=>{
 for(const [total,retencion,esperado] of [[2400,'42.00',2358],[1872,'32.76',1839.24],[2688,'47.04',2640.96],[2630.4,'46.03',2584.37]])assert.equal(neto(factura('TUTI',{total,saldo:total}),retencion),esperado)
 assert.equal(neto(factura('FAVORITA',{total:1000,retenido:20,saldo:980}),'0'),980)
 assert.equal(neto(factura('FAVORITA',{total:1000,cobrado:400,retenido:10,saldo:590}),'10'),580)
 assert.equal(neto(factura('FAVORITA'),'3.21'),111.79)
 for(const retencion of ['-1','116','1.001','NaN'])assert.equal(neto(factura('TUTI'),retencion),null)
 assert.equal(neto(factura('TUTI',{fuente_valida:false,verificada:false}),'2'),null)
})
