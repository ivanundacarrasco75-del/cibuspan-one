import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { onRequest, sha256 } from '../functions/api/capturas/[[accion]].js'
if (!globalThis.crypto) globalThis.crypto = webcrypto
const uid='11111111-1111-4111-8111-111111111111'
const png=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4])
const viejo=`${uid}/2026-10-01/captura-123-0-abc.png`
const headers={Authorization:'Bearer jwt-prueba',apikey:'publica-prueba','Content-Type':'application/json'}
function almacen() {
  const objetos=new Map();let escrituras=0
  const item=(key)=>{const x=objetos.get(key);return x && {...x,size:x.bytes.byteLength,body:x.bytes, arrayBuffer:async()=>x.bytes.slice(0)}}
  return {objetos,get escrituras(){return escrituras},get:async k=>item(k),head:async k=>item(k),put:async(k,b,o)=>{if(objetos.has(k) && o.onlyIf)return null;escrituras++;objetos.set(k,{bytes:b.slice(0),customMetadata:o.customMetadata,httpMetadata:o.httpMetadata});return item(k)}}
}
function entorno() { return {CAPTURAS_CAMPO:almacen(),CAPTURAS_FIRMA:'a'.repeat(64)} }
async function llamar(env,accion,body={},extras={}) {
  return onRequest({env,params:{accion},request:new Request('https://app.test/api/capturas/'+accion+(extras.query??''),{method:extras.method??'POST',headers:{...headers,...extras.headers},body:extras.method==='GET'?undefined:extras.raw??JSON.stringify(body)})})
}
function remoto({permiso=true,cuota=false,origen=png,quitarEfectivo=true}={}) {
  let eliminado=false,descargas=0,borrados=0,autorizaciones=0
  const fetch=async(url,op={})=>{
    assert.ok(url.startsWith('https://mkntfvsbmlgobettavnu.supabase.co/'))
    if(cuota)return new Response('exceed_storage_size_quota',{status:402})
    if(url.includes('/rpc/')){autorizaciones++;return Response.json({permitido:permiso,usuario_id:uid})}
    if(op.method==='DELETE'){borrados++;if(quitarEfectivo)eliminado=true;return Response.json([{name:viejo}])}
    if(url.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/visitas-campo/'+viejo+'?token=xxx'})
    descargas++;return eliminado?new Response('not_found',{status:404}):new Response(origen,{headers:{'Content-Type':'image/png'}})
  }
  return {fetch,get borrados(){return borrados},get descargas(){return descargas},get autorizaciones(){return autorizaciones}}
}
async function usar(op,fn){const anterior=globalThis.fetch;globalThis.fetch=op.fetch;try{await fn()}finally{globalThis.fetch=anterior}}

test('nueva captura: bytes intactos, lectura privada y reintento sin duplicados', async()=>{
  const env=entorno(),mock=remoto(),hash=await sha256(png),ruta=`${uid}/2026-11-04/captura-r2-${hash}.png`
  await usar(mock,async()=>{
    for(let i=0;i<2;i++){const r=await llamar(env,'subir',{}, {method:'PUT',query:'?ruta='+encodeURIComponent(ruta),raw:png,headers:{'Content-Type':'image/png'}});assert.equal(r.status,200);assert.equal((await r.json()).sha256,hash)}
    assert.equal(env.CAPTURAS_CAMPO.escrituras,1)
    const firmada=await llamar(env,'firmar',{rutas:[ruta]});assert.equal(firmada.status,200)
    const [dato]=await firmada.json();const enlace=new URL(dato.url)
    const leer=async(u)=>onRequest({env,params:{accion:'imagen'},request:new Request(u)})
    assert.deepEqual(new Uint8Array(await (await leer(enlace)).arrayBuffer()),png)
    enlace.searchParams.set('ruta',viejo);assert.equal((await leer(enlace)).status,403)
    assert.equal((await llamar(env,'imagen',{}, {method:'GET',query:'?ruta='+ruta})).status,403)
  })
})
test('perchas, MIME falso, hash alterado y archivos grandes no se guardan', async()=>{
  const env=entorno(),hash=await sha256(png)
  await usar(remoto(),async()=>{
    for(const [ruta,raw,tipo,estado]of[
      [`${uid}/2026-11-04/percha-123.png`,png,'image/png',400],
      [`${uid}/2026-11-04/captura-r2-${hash}.png`,new TextEncoder().encode('<script>'), 'image/png',400],
      [`${uid}/2026-11-04/captura-r2-${'0'.repeat(64)}.png`,png,'image/png',409],
      [`${uid}/2026-11-04/captura-r2-${hash}.png`,new Uint8Array(10*1024*1024+1),'image/png',413],
      [`${uid}/2026-11-04/captura-r2-${hash}.png`,png,'image/jpeg',400],
    ]) assert.equal((await llamar(env,'subir',{}, {method:'PUT',query:'?ruta='+encodeURIComponent(ruta),raw,headers:{'Content-Type':tipo}})).status,estado)
    assert.equal(env.CAPTURAS_CAMPO.escrituras,0)
  })
})
test('sin permiso ni sesion no se accede a R2; restriccion de cuota no es exito',async()=>{
  const env=entorno()
  await usar(remoto({permiso:false}),async()=>assert.equal((await llamar(env,'migrar',{ruta:viejo})).status,403))
  await usar(remoto(),async()=>assert.equal((await llamar(env,'migrar',{ruta:viejo},{headers:{Authorization:''}})).status,401))
  await usar(remoto({cuota:true}),async()=>{const r=await llamar(env,'migrar',{ruta:viejo});assert.equal(r.status,503);assert.match((await r.json()).error,/sigue restringido/)})
  assert.equal(env.CAPTURAS_CAMPO.escrituras,0)
})
test('copiar es reanudable y conserva originales; retirar exige comparar otra vez',async()=>{
  const env=entorno(),mock=remoto()
  await usar(mock,async()=>{
    const a=await (await llamar(env,'migrar',{ruta:viejo})).json();assert.equal(a.verificada,true)
    const b=await (await llamar(env,'migrar',{ruta:viejo})).json();assert.equal(b.ya_copiada,true)
    assert.equal(mock.descargas,1);assert.equal(mock.borrados,0);assert.equal(env.CAPTURAS_CAMPO.escrituras,1)
    assert.equal((await llamar(env,'retirar',{ruta:viejo,sha256:a.sha256})).status,400)
    const body={ruta:viejo,sha256:a.sha256,confirmacion:'RETIRAR_ORIGINAL_VERIFICADO'}
    assert.equal((await (await llamar(env,'retirar',body)).json()).retirado,true)
    assert.equal((await (await llamar(env,'retirar',body)).json()).ya_retirado,true)
    assert.equal(mock.borrados,1);assert.ok(await env.CAPTURAS_CAMPO.get(viejo))
  })
})
test('original modificado o copia corrupta: no permite retirar',async()=>{
  const env=entorno();let sha
  await usar(remoto(),async()=>{sha=(await (await llamar(env,'migrar',{ruta:viejo})).json()).sha256})
  const distinto=remoto({origen:new Uint8Array([...png,9])})
  await usar(distinto,async()=>{assert.equal((await llamar(env,'retirar',{ruta:viejo,sha256:sha,confirmacion:'RETIRAR_ORIGINAL_VERIFICADO'})).status,409);assert.equal(distinto.borrados,0)})
  env.CAPTURAS_CAMPO.objetos.get(viejo).bytes=new Uint8Array([1,2,3]).buffer
  const limpio=remoto()
  await usar(limpio,async()=>{assert.equal((await llamar(env,'retirar',{ruta:viejo,sha256:sha,confirmacion:'RETIRAR_ORIGINAL_VERIFICADO'})).status,409);assert.equal(limpio.borrados,0)})
})
test('DELETE sin efecto no se muestra como retirado',async()=>{
  const env=entorno(),mock=remoto({quitarEfectivo:false})
  await usar(mock,async()=>{
    const c=await (await llamar(env,'migrar',{ruta:viejo})).json()
    assert.equal((await llamar(env,'retirar',{ruta:viejo,sha256:c.sha256,confirmacion:'RETIRAR_ORIGINAL_VERIFICADO'})).status,409)
  })
})
test('legado sin copia abre con permisos; legado copiado abre desde R2',async()=>{
  const env=entorno(),mock=remoto()
  await usar(mock,async()=>{
    let r=await (await llamar(env,'firmar',{rutas:[viejo]})).json();assert.match(r[0].url,/supabase.co\/storage\/v1\/object\/sign/)
    await llamar(env,'migrar',{ruta:viejo})
    r=await (await llamar(env,'firmar',{rutas:[viejo]})).json();assert.match(r[0].url,/app.test\/api\/capturas\/imagen/)
  })
})
test('formulario sin carga de perchas conserva campos, GPS e ingreso manual',()=>{
  const c=readFileSync(new URL('../src/components/kpiKam/CampoComercial.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(c,/seleccionarFotosPercha|fotosPercha|georreferenciandoFoto/)
  assert.match(c,/fotos_percha: \[\]/);assert.match(c,/Caras en percha/);assert.match(c,/georreferencia_visita/)
  assert.match(c,/clienteCapturasFavoritaCampo/);assert.match(c,/ingresar los datos manualmente/)
})
test('Storage puede devolver ausencia como HTTP400 con statusCode404; RPC faltante indica instalacion',async()=>{
  const env=entorno();let c
  await usar(remoto(),async()=>{c=await (await llamar(env,'migrar',{ruta:viejo})).json()})
  const originalFetch=globalThis.fetch
  try {
    globalThis.fetch=async(url)=>url.includes('/rpc/')?Response.json({permitido:true,usuario_id:uid}):Response.json({statusCode:'404',error:'not_found'},{status:400})
    const r=await llamar(env,'retirar',{ruta:viejo,sha256:c.sha256,confirmacion:'RETIRAR_ORIGINAL_VERIFICADO'});assert.equal(r.status,200);assert.equal((await r.json()).ya_retirado,true)
    globalThis.fetch=async()=>Response.json({code:'PGRST202'},{status:404})
    const falta=await llamar(env,'migrar',{ruta:viejo});assert.equal(falta.status,503);assert.match((await falta.json()).error,/Falta instalar/)
  }finally{globalThis.fetch=originalFetch}
})
test('enlace vencido y rutas externas no firman ni leen evidencia',async()=>{
  const env=entorno(),mock=remoto()
  await usar(mock,async()=>{
    assert.equal((await llamar(env,'firmar',{rutas:['https://otro.test/imagen.png']})).status,400)
    assert.equal((await llamar(env,'imagen',{}, {method:'GET',query:'?'+new URLSearchParams({ruta:viejo,vence:'1',firma:'a'.repeat(64)})})).status,403)
    assert.equal(mock.autorizaciones,0)
  })
})
