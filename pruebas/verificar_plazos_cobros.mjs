import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const module={exports:{}}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/plazosCobros.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports})
const {previsionCobro,plazoClienteCobro,semanaEmisionCobro,ventanasCobros,depositoEnSemanasCobro,rangoMesCobros}=module.exports
const f=(cliente,fecha_emision='2026-01-31',vencimiento=null)=>({cliente,fecha_emision,vencimiento,fuente_valida:true})
test('Plazos informados reconocen las razones sociales reales y no inventan reglas para otros clientes',()=>{
 for(const c of ['CORPORACION FAVORITA C.A.','CORPORACION EL ROSADO S.A.','MEGA SANTAMARIA S. A.'])assert.equal(plazoClienteCobro(c),21)
 assert.equal(plazoClienteCobro('TIENDAS TUTI TTDE S. A.'),60)
 assert.equal(plazoClienteCobro('SOLDMER S.A.A.'),0)
 assert.equal(plazoClienteCobro('FAVORITA DEL BARRIO'),null)
 assert.equal(plazoClienteCobro('Cliente Prueba'),null)
})
test('Emisión de fin de mes se desplaza por días calendario y amplía a semanas completas',()=>{
 const favorita=previsionCobro(f('FAVORITA'))
 assert.equal(favorita.fecha,'2026-02-21');assert.equal(favorita.desde,'2026-02-16');assert.equal(favorita.hasta,'2026-02-22')
 const tuti=previsionCobro(f('TUTI'))
 assert.equal(tuti.fecha,'2026-04-01');assert.equal(tuti.desde,'2026-03-23');assert.equal(tuti.hasta,'2026-04-05')
 const soldmer=previsionCobro(f('SOLDMER'))
 assert.equal(soldmer.fecha,'2026-01-31');assert.equal(soldmer.desde,'2026-01-26');assert.equal(soldmer.hasta,'2026-02-01')
 assert.equal(previsionCobro(f('TUTI','2028-01-01')).fecha,'2028-03-01')
})
test('Vencimiento manual prevalece y datos inválidos quedan sin previsión',()=>{
 const manual=previsionCobro(f('TUTI','2026-01-31','2026-05-10'))
 assert.equal(manual.origen,'manual');assert.equal(manual.desde,'2026-05-04');assert.equal(manual.hasta,'2026-05-10')
 assert.equal(previsionCobro(f('Cliente Prueba','2026-01-31','2026-05-10')).fecha,'2026-05-10')
 assert.equal(previsionCobro(f('Cliente Prueba')),null)
 assert.equal(previsionCobro({...f('FAVORITA'),fuente_valida:false}),null)
 for(const fecha of ['2026-02-30','','2026-13-01'])assert.equal(semanaEmisionCobro(fecha),null)
 assert.equal(previsionCobro(f('TUTI','2026-01-31','2026-02-30')),null)
})
test('Filtro usa la unión de ventanas, no rellena huecos entre clientes/plazos ni asigna facturas automáticamente',()=>{
 const ventanas=ventanasCobros([f('FAVORITA'),f('FAVORITA'),f('TUTI')])
 assert.equal(ventanas.length,2)
 for(const fecha of ['2026-02-16','2026-02-22','2026-03-23','2026-04-05'])assert.equal(depositoEnSemanasCobro(fecha,ventanas),true)
 for(const fecha of ['2026-02-15','2026-03-01','2026-04-06'])assert.equal(depositoEnSemanasCobro(fecha,ventanas),false)
 assert.equal(ventanasCobros([f('Cliente Prueba')]).length,0)
 assert.equal(ventanasCobros([f('FAVORITA','2026-01-31'),f('FAVORITA','2026-02-02')]).length,1)
})
test('Semanas ISO y meses cruzan año, febrero y años bisiestos sin depender del huso horario',()=>{
 const semana=semanaEmisionCobro('2027-01-01')
 assert.equal(semana.etiqueta,'2026-S53');assert.equal(semana.desde,'2026-12-28');assert.equal(semana.hasta,'2027-01-03')
 assert.equal(rangoMesCobros('2028-02').hasta,'2028-02-29')
 assert.equal(rangoMesCobros('2026-02').hasta,'2026-02-28')
 assert.equal(rangoMesCobros('2026-12').hasta,'2026-12-31')
 assert.equal(rangoMesCobros('2026-13'),null)
})

test('Reconoce el prefijo Emisión importado sin extender el plazo a otros clientes ni cambiar su fuente',()=>{
 for(const cliente of ['Emisión TIENDAS TUTI TTDE S. A.','Emision: TIENDAS TUTI TTDE S. A.',' EMISIÓN TIENDAS TUTI TTDE S. A.'])assert.equal(plazoClienteCobro(cliente),60)
 assert.equal(plazoClienteCobro('Emisión CORPORACION FAVORITA C.A.'),21)
 assert.equal(plazoClienteCobro('Emisión SOLDMER S.A.A.'),0)
 for(const cliente of ['Otra Emisión TIENDAS TUTI TTDE S. A.','Emisión TIENDAS TUTI TTDE S. A. / OTRO','EMISIONES TUTI','Emisión Cliente nuevo'])assert.equal(plazoClienteCobro(cliente),null)
 const factura=f('Emisión TIENDAS TUTI TTDE S. A.','2026-08-01')
 const previsto=previsionCobro(factura)
 assert.equal(previsto.fecha,'2026-09-30');assert.equal(previsto.desde,'2026-09-21');assert.equal(previsto.hasta,'2026-10-04');assert.equal(factura.cliente,'Emisión TIENDAS TUTI TTDE S. A.')
 assert.equal(previsionCobro({...factura,fuente_valida:false}),null)
})
