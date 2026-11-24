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
