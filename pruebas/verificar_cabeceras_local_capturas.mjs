import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
try {
 const {interpretarReporteFavorita}=await server.ssrLoadModule('/src/utils/ocrFavorita.ts')
 const {localDeCaptura}=await server.ssrLoadModule('/src/utils/georreferenciaCampo.ts')
 const {localesHistoricosCapturasCampo,prepararAuditoriaCapturaCampo}=await server.ssrLoadModule('/src/utils/recuperacionCapturasCampo.ts')
 const {verificarDosLecturasCampo}=await server.ssrLoadModule('/src/utils/validacionLecturasCampo.ts')
 const nombre=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'')
 await test('Lee los prefijos de logotipo del diagnóstico sin capturar Existencia en local',()=>{
  for(const prefijo of ['SH','ES','SS','M£','NM','Dl','M','E','Y','']) {
   const r=interpretarReporteFavorita(`${prefijo} LOCAL: SUPERMAXI AMERICA\nEXISTENCIA EN LOCAL: 9 unidades`,.9)
   assert.equal(r.local_nombre,'SUPERMAXI AMERICA',prefijo);assert.equal(r.stock_local_unidades,9)
  }
  assert.equal(interpretarReporteFavorita('EXISTENCIA EN LOCAL: 9 unidades').local_nombre,null)
  assert.equal(interpretarReporteFavorita('OTRO LOCAL: SUPERMAXI AMERICA').local_nombre,null)
  assert.equal(interpretarReporteFavorita('SH LOCAL: SUPERMAXI AMERICA\nM£ LOCAL: MEGAMAXI SCALA').local_nombre,null)
 })
 await test('La coincidencia exacta no se confunde con una parcial; duplicados reales siguen bloqueados',()=>{
  const locales=[{id:'a',nombre:'MEGAMAXI 6 DE DICIEMBRE'},{id:'b',nombre:'MEGAMAXI 6 DE DICIEMBRE NORTE'}]
  assert.equal(localDeCaptura('MEGAMAXI 6 DE DICIEMBRE',locales).id,'a')
  assert.equal(localDeCaptura('MEGAMAXI',locales),null)
  assert.equal(localDeCaptura('MEGAMAXI 6 DE DICIEMBRE',[...locales,{id:'c',nombre:locales[0].nombre}]),null)
  assert.equal(localDeCaptura(locales[0].nombre,[locales[0],locales[0]]).id,'a')
 })
 await test('Una visita a local desactivado se verifica contra su ID/nombre histórico; no contra el primer local',()=>{
  const a=interpretarReporteFavorita('M LOCAL: MEGAMAXI 6 DE DICIEMBRE\nCódigo de barras 7868304262189\nVenta promedio diaria (Cant): 2.90\nExistencia en local 15\nDías inventario local 5.17',.9)
  const registro={local_id:'historico',local_nombre:a.local_nombre,fecha:'2026-10-06',producto_codigo:a.codigo_barras,lectura_guardada:{}}
  const activos=[{id:'otro',nombre:'MEGAMAXI SCALA'}]
  const referencias=localesHistoricosCapturasCampo([registro,registro],activos)
  assert.equal(referencias.length,2);assert.equal(localDeCaptura(a.local_nombre,referencias).id,'historico')
  const lectura={...a,verificacion_campos:verificarDosLecturasCampo(a,a),lectura_control:{principal:a,control:a}}
  assert.equal(prepararAuditoriaCapturaCampo(registro,lectura,activos).rotacion_diaria_unidades,2.9)
  assert.throws(()=>prepararAuditoriaCapturaCampo(registro,{...lectura,local_nombre:'MEGAMAXI SCALA'},activos),/Local leído.*visita/)
 })
 if(process.env.CIBUSPAN_DIAGNOSTICO_CAPTURAS) {
  const datos=JSON.parse(await readFile(process.env.CIBUSPAN_DIAGNOSTICO_CAPTURAS,'utf8'))
  await test('Reinterpreta las veinte cabeceras reales del diagnóstico en ambas lecturas',()=>{
   assert.equal(datos.resultados.length,20)
   for(const r of datos.resultados) {
    const evidencias=r.lectura.lectura_control
    const a=interpretarReporteFavorita(evidencias.principal.texto_ocr,evidencias.principal.confianza)
    const b=interpretarReporteFavorita(evidencias.control.texto_ocr,evidencias.control.confianza)
    assert.equal(nombre(a.local_nombre ?? ''),nombre(r.local),`Principal: ${r.local}`)
    assert.equal(nombre(b.local_nombre ?? ''),nombre(r.local),`Control: ${r.local}`)
    const locales=[{id:r.local,nombre:r.local}]
    const registro={local_id:r.local,local_nombre:r.local,fecha:r.fecha,producto_codigo:a.codigo_barras,lectura_guardada:{}}
    const lectura={...a,verificacion_campos:verificarDosLecturasCampo(a,b),lectura_control:{principal:a,control:b}}
    const patch=prepararAuditoriaCapturaCampo(registro,lectura,locales)
    assert.ok(Object.values(patch.verificacion_campos).some(v=>v.estado==='DOBLE_LECTURA'),r.local)
   }
  })
 }
}finally{await server.close()}
