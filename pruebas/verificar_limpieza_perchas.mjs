import {test} from 'node:test'
import assert from 'node:assert/strict'
import {clasificarFotosPercha,loteSinCambios} from '../scripts/lib/fotosPerchaStorage.mjs'
const uid='11111111-1111-4111-8111-111111111111'
const ruta=n=>`${uid}/2026-11-05/${n}`
const obj=(n=1,nombre='percha-123.png',extra={})=>({id:`22222222-2222-4222-8222-${String(n).padStart(12,'0')}`,bucket_id:'visitas-campo',ruta:ruta(nombre),bytes:1234,actualizado_en:'2026-11-05 12:00:00+00',...extra})
const raw=(objetos=[],protegidas=[])=>[{diagnostico_fotos_percha:{tipo:'diagnostico_fotos_percha',version:1,generado_en:'2026-11-05',objetos,capturas_protegidas:protegidas}}]
test('distingue perchas fisicas, capturas y archivos no identificables sin mezclar',()=>{
 const d=clasificarFotosPercha(raw([obj(),obj(2,'captura-123.png'),obj(3,`captura-r2-${'a'.repeat(64)}.png`),obj(4,'foto.png')],[ruta('captura-123.png')]))
 assert.equal(d.candidatas.length,1);assert.equal(d.candidatas[0].uri,'ss:///visitas-campo/'+ruta('percha-123.png'));assert.equal(d.resumen.archivos_conservados,3)
})
test('protege cualquier ruta referenciada como captura aunque se llame percha',()=>{
 const d=clasificarFotosPercha(raw([obj()],[ruta('percha-123.png')]))
 assert.equal(d.candidatas.length,0);assert.equal(d.resumen.archivos_captura_presentes,1)
})
test('lista de proteccion incompleta y respuestas ambiguas bloquean limpieza',()=>{
 for(const r of [[],[{}],raw([obj(),obj()]),raw([obj(1),obj(2)]),raw([obj(1,'percha-1.png',{bucket_id:'documentos'})]),raw([obj(1,'percha-1.png',{bytes:-1})])])assert.throws(()=>clasificarFotosPercha(r))
 const r=raw([obj()]);delete r[0].diagnostico_fotos_percha.capturas_protegidas;assert.throws(()=>clasificarFotosPercha(r))
})
test('sin comodines, directorios ni rutas externas en la seleccion',()=>{
 const nombres=['percha-*.png','percha-123.png/otra.png','percha-123?x.png','../percha-1.png','percha-.svg','percha-123.PNG/','percha-%2f.png']
 for(const n of nombres)assert.equal(clasificarFotosPercha(raw([obj(1,n)])).candidatas.length,0)
})
test('reintento solo contiene pendientes del plan original; no agrega nuevas fotos',()=>{
 const a=obj(1,'percha-1.png'),b=obj(2,'percha-2.jpg'),c=obj(3,'percha-3.webp')
 const plan=clasificarFotosPercha(raw([a,b]))
 assert.deepEqual(loteSinCambios(plan,clasificarFotosPercha(raw([b,c]))).map(o=>o.id),[b.id])
 assert.equal(loteSinCambios(plan,clasificarFotosPercha(raw([]))).length,0)
})
test('cambio en archivo o referencias de captura detiene el lote',()=>{
 const plan=clasificarFotosPercha(raw([obj()]))
 assert.throws(()=>loteSinCambios(plan,clasificarFotosPercha(raw([obj(1,'percha-123.png',{actualizado_en:'2026-11-05 13:00:00+00'})]))))
 assert.throws(()=>loteSinCambios(plan,clasificarFotosPercha(raw([obj()],[ruta('percha-123.png')]))))
})
test('tamano desconocido se reporta como desconocido, no como cero comprobado',()=>{
 const d=clasificarFotosPercha(raw([obj(1,'percha-1.png',{bytes:null}),obj(2,'percha-2.jpg',{bytes:0})]))
 assert.equal(d.resumen.perchas_sin_tamano,1);assert.equal(d.resumen.bytes_percha_conocidos,0)
})
test('CLI devuelve JSON utilizable y falla cerrado si cambian las capturas',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs')
 const {tmpdir}=await import('node:os')
 const {join}=await import('node:path')
 const {fileURLToPath}=await import('node:url')
 const {spawnSync}=await import('node:child_process')
 const carpeta=mkdtempSync(join(tmpdir(),'cibuspan perchas ')),p=join(carpeta,'plan.json'),a=join(carpeta,'actual.json')
 const script=fileURLToPath(new URL('../scripts/lib/fotosPerchaStorage.mjs',import.meta.url))
 try{
  writeFileSync(p,JSON.stringify(raw([obj()])))
  writeFileSync(a,JSON.stringify(raw([obj()])))
  let r=spawnSync(process.execPath,[script,'clasificar',p],{encoding:'utf8'});assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).candidatas.length,1)
  r=spawnSync(process.execPath,[script,'lote',p,a],{encoding:'utf8'});assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).length,1)
  writeFileSync(a,JSON.stringify(raw([obj()],[ruta('percha-123.png')])))
  r=spawnSync(process.execPath,[script,'lote',p,a],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/Cambio la lista/)
 }finally{rmSync(carpeta,{recursive:true,force:true})}
})
