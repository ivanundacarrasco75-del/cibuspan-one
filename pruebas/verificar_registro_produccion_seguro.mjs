import test from 'node:test'
import assert from 'node:assert/strict'
import {after} from 'node:test'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
after(()=>server.close())
const {crearControlRegistroProduccion,RegistroProduccionPendienteError,RegistroProduccionNoGuardadaError,detallesProduccionRpc}=await server.ssrLoadModule('/src/utils/registroProduccionSeguro.ts')
const {copiarConsumoProduccion,sugerirConsumoProduccion}=await server.ssrLoadModule('/src/utils/consumoProduccion.ts')
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const datos=()=>({fechaProduccionGeneral:'2026-10-23',detalles:[{productoId:id(10),tipoDestino:'PRODUCTO_TERMINADO',numeroParadas:2,tamanoParada:50,unidades:100,fechaProduccion:'2026-10-23',orden:1}]})
const ok=n=>({solicitud_id:id(n),produccion_id:id(100),repetida:false})
function almacen(){
 const m=new Map()
 return {m,get length(){return m.size},key:n=>[...m.keys()][n]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}
}
function control(a,registrar,resolver=async()=>{throw new Error('sin conexión')},extra={}){
 return crearControlRegistroProduccion({almacen:a,proyecto:'proyecto-ensayo',usuarioId:id(1),registrar,resolver,...extra})
}
await test('Conserva copia del intento antes de enviar y retira sólo una confirmación válida',async()=>{
 const a=almacen(),d=datos()
 const c=control(a,async s=>{assert.equal(a.length,1);assert.notEqual(s.detalles,d.detalles);d.detalles[0].unidades=999;assert.equal(s.detalles[0].unidades,100);return ok(1)})
 assert.deepEqual(await c.registrar(id(1),d),{produccionId:id(100),repetida:false});assert.equal(a.length,0)
})
await test('Dos clics simultáneos comparten el envío y su resultado',async()=>{
 let enviar,veces=0
 const c=control(almacen(),()=>{veces++;return new Promise(r=>enviar=r)})
 const uno=c.registrar(id(2),datos()),dos=c.registrar(id(2),datos())
 assert.equal(veces,1);enviar(ok(2));assert.deepEqual(await uno,await dos)
})
await test('Respuesta perdida recupera la confirmación sin enviar otra producción',async()=>{
 let envios=0,consultas=0;const a=almacen()
 const c=control(a,async()=>{envios++;throw new Error('respuesta perdida')},async n=>{consultas++;return {solicitud_id:n,produccion_id:id(100),estado:'CONFIRMADA'}})
 assert.deepEqual(await c.registrar(id(3),datos()),{produccionId:id(100),repetida:true})
 assert.equal(envios,1);assert.equal(consultas,1);assert.equal(a.length,0)
})
await test('Sin resultado conserva la clave tras recargar y bloquea otro registro',async()=>{
 const a=almacen();const c=control(a,async()=>{throw new Error('sin conexión')})
 await assert.rejects(c.registrar(id(4),datos()),RegistroProduccionPendienteError)
 let enviada
 const recarga=control(a,async s=>{enviada=s;return {...ok(4),repetida:true}})
 assert.equal(recarga.listar()[0].solicitudId,id(4))
 await assert.rejects(recarga.registrar(id(5),datos()),RegistroProduccionPendienteError)
 await recarga.registrar(id(4),datos());assert.equal(enviada.solicitudId,id(4));assert.equal(a.length,0)
})
await test('No admite cambiar los datos de una solicitud incierta',async()=>{
 const a=almacen(),c=control(a,async()=>{throw new Error('sin conexión')})
 await assert.rejects(c.registrar(id(6),datos()),RegistroProduccionPendienteError)
 const d=datos();d.detalles[0].unidades=200
 await assert.rejects(c.registrar(id(6),d),RegistroProduccionPendienteError)
 assert.equal(c.listar()[0].detalles[0].unidades,100)
})
await test('Cerrar ausencia en servidor permite corregir con una nueva clave',async()=>{
 const a=almacen();const c=control(a,async()=>{throw new Error('cantidad rechazada')},async n=>({estado:'ANULADA',solicitud_id:n,produccion_id:null}))
 await assert.rejects(c.registrar(id(7),datos()),e=>e instanceof RegistroProduccionNoGuardadaError && e.message==='cantidad rechazada');assert.equal(a.length,0)
 assert.equal((await control(a,async()=>ok(8)).registrar(id(8),datos())).produccionId,id(100))
})
await test('Comprobar resultado no reenvía y exige confirmación de cierre antes de retirar',async()=>{
 const a=almacen();const c=control(a,async()=>{throw new Error('sin conexión')})
 await assert.rejects(c.registrar(id(9),datos()),RegistroProduccionPendienteError)
 const r=control(a,()=>assert.fail('no debe reenviar'),async n=>({estado:'ANULADA',solicitud_id:n,produccion_id:null}))
 assert.deepEqual(await r.resolver(id(9)),{estado:'ANULADA',produccionId:null});assert.equal(a.length,0)
})
await test('Respuesta de otra clave o sin identificador no se acepta ni borra el intento',async()=>{
 const a=almacen();const c=control(a,async()=>ok(99),async()=>({estado:'CONFIRMADA',solicitud_id:id(11),produccion_id:null}))
 await assert.rejects(c.registrar(id(11),datos()),RegistroProduccionPendienteError);assert.equal(a.length,1)
 await assert.rejects(c.resolver(id(11)),RegistroProduccionPendienteError);assert.equal(a.length,1)
})
await test('Almacenamiento lleno o sin escritura impide iniciar el envío',async()=>{
 for(const setItem of [()=>{throw new Error('cuota')},()=>{}]){
  const a={...almacen(),setItem};let envios=0
  await assert.rejects(control(a,async()=>{envios++;return ok(12)}).registrar(id(12),datos()),/No se envió/)
  assert.equal(envios,0)
 }
})
await test('Fallo al limpiar almacenamiento conserva el éxito confirmado',async()=>{
 const a=almacen();a.removeItem=()=>{throw new Error('bloqueado')}
 const c=control(a,async()=>ok(13))
 assert.equal((await c.registrar(id(13),datos())).produccionId,id(100));assert.equal(c.listar().length,1)
 const recarga=control(a,()=>assert.fail(),async n=>({estado:'CONFIRMADA',solicitud_id:n,produccion_id:id(100)}))
 assert.equal((await recarga.resolver(id(13))).estado,'CONFIRMADA')
})
await test('Pendientes se aíslan por usuario y proyecto y no se sobrescriben entre claves',async()=>{
 const a=almacen();const c=control(a,async()=>{throw new Error('sin conexión')})
 await assert.rejects(c.registrar(id(14),datos()),RegistroProduccionPendienteError)
 const otro=control(a,async()=>{throw new Error('sin conexión')},undefined,{usuarioId:id(2)})
 assert.equal(otro.listar().length,0)
 await assert.rejects(otro.registrar(id(15),datos()),RegistroProduccionPendienteError)
 assert.equal(a.length,2);assert.equal(c.listar()[0].solicitudId,id(14));assert.equal(otro.listar()[0].solicitudId,id(15))
 assert.equal(control(a,()=>assert.fail(),undefined,{proyecto:'otro-proyecto'}).listar().length,0)
})
await test('Intento local corrupto bloquea el guardado sin enviar ni descartar datos',async()=>{
 const a=almacen();a.setItem(`cibuspan:produccion:v1:proyecto-ensayo:${id(1)}:${id(16)}`,'dato corrupto')
 await assert.rejects(control(a,()=>assert.fail('no debe enviar')).registrar(id(16),datos()),/No se pudo leer/)
 assert.equal(a.length,1)
})
await test('Validación local y mapeo RPC mantienen cantidades, destino, fechas y lote',async()=>{
 const d=datos();d.detalles[0].tipoDestino='SEMIELABORADO';d.detalles[0].semielaboradoTipoId=id(20);d.detalles[0].lote='261023';d.detalles[0].fechaVencimiento='2026-11-23'
 assert.deepEqual(detallesProduccionRpc(d),[{producto_id:id(10),tipo_destino:'SEMIELABORADO',semielaborado_tipo_id:id(20),numero_paradas:2,tamano_parada:50,unidades:100,fecha_produccion:'2026-10-23',lote:'261023',fecha_vencimiento:'2026-11-23',orden:1}])
 d.detalles[0].unidades=NaN;const a=almacen()
 await assert.rejects(control(a,()=>assert.fail()).registrar(id(17),d),/cantidades/);assert.equal(a.length,0)
})
const mp=[{id:id(11),codigo:'HAR',nombre:'Harina',unidad:'KG',saldo:100},
 {id:id(12),codigo:'FUN',nombre:'Funda',unidad:'UNIDAD',saldo:200,esEmpaque:true}]
const referencia={codigoProducto:'SKU',version:'Receta v2',advertencias:[],componentes:[
 {materiaPrimaId:id(11),codigo:'HAR',nombre:'Harina',unidad:'KG',cantidadPorUnidad:0.2},
 {materiaPrimaId:id(11),codigo:'HAR',nombre:'Harina',unidad:'KG',cantidadPorUnidad:0.1},
 {materiaPrimaId:id(12),codigo:'FUN',nombre:'Funda',unidad:'UNIDAD',cantidadPorUnidad:1,esEmpaque:true}]}
const consumo=()=>({version:1,confirmado:true,referenciaReceta:'Receta v2',observaciones:'Revisado en producción',lineas:[{materiaPrimaId:id(11),unidad:'KG',cantidad:20}]})
await test('Sugerencia suma fórmulas por material y escala sin afirmar consumo confirmado',()=>{
 const s=sugerirConsumoProduccion(referencia,50,mp,false)
 assert.deepEqual(s.consumo.lineas,[{materiaPrimaId:id(11),unidad:'KG',cantidad:15},{materiaPrimaId:id(12),unidad:'UNIDAD',cantidad:50}])
 assert.equal(s.consumo.confirmado,false);assert.equal(s.consumo.referenciaReceta,'Receta v2')
})
await test('Semielaborado no propone empaque que sólo se utilizará al etiquetar',()=>{
 const s=sugerirConsumoProduccion(referencia,50,mp,true)
 assert.equal(s.consumo.lineas.length,1);assert.match(s.avisos.join(' '),/etiquetar/)
})
await test('Sin vínculo, receta o unidad inequívoca no inventa cantidades ni convierte litros a kilos',()=>{
 const sin=sugerirConsumoProduccion(undefined,50,mp,false)
 assert.deepEqual(sin.consumo.lineas,[]);assert.ok(sin.avisos.length>0)
 const otra={...referencia,componentes:[{...referencia.componentes[0],unidad:'L'}]}
 const s=sugerirConsumoProduccion(otra,50,mp,false)
 assert.deepEqual(s.consumo.lineas,[]);assert.match(s.avisos[0],/unidad segura/)
})
await test('Gramos conservan su unidad y cantidades fraccionadas de empaque requieren corregirse',()=>{
 const g={...referencia,componentes:[{...referencia.componentes[0],unidad:'G',cantidadPorUnidad:5},{...referencia.componentes[2],cantidadPorUnidad:0.5}]}
 const s=sugerirConsumoProduccion(g,1,[{...mp[0],unidad:'G'},mp[1]],false)
 assert.equal(s.consumo.lineas[0].cantidad,5);assert.equal(s.consumo.lineas[0].unidad,'G')
 assert.match(s.avisos.join(' '),/fraccionados/)
 assert.throws(()=>copiarConsumoProduccion({...s.consumo,confirmado:true}),/cantidades/)
})
await test('Declaración exige revisión, cantidades válidas y materiales sin repetirse',()=>{
 assert.equal(copiarConsumoProduccion(consumo()).lineas[0].cantidad,20)
 for(const c of [{...consumo(),confirmado:false},{...consumo(),lineas:[{...consumo().lineas[0],cantidad:0}]},
  {...consumo(),lineas:[...consumo().lineas,...consumo().lineas]},
  {...consumo(),lineas:[{...consumo().lineas[0],cantidad:0.0000001}]}]) {
   assert.throws(()=>copiarConsumoProduccion(c))
 }
})
await test('Ausencia de consumo necesita motivo explícito y copia no comparte referencias mutables',()=>{
 assert.throws(()=>copiarConsumoProduccion({...consumo(),lineas:[],observaciones:''}))
 assert.deepEqual(copiarConsumoProduccion({...consumo(),lineas:[],observaciones:'No hubo consumo de materiales inventariables'}).lineas,[])
 const c=consumo(),copia=copiarConsumoProduccion(c);c.lineas[0].cantidad=999;assert.equal(copia.lineas[0].cantidad,20)
})
await test('Intento incierto conserva consumo y versión; otro consumo con misma clave queda bloqueado',async()=>{
 const a=almacen(),d=datos();d.detalles[0].consumoMp=consumo()
 const c=control(a,async()=>{throw new Error('sin conexión')})
 await assert.rejects(c.registrar(id(21),d),RegistroProduccionPendienteError)
 d.detalles[0].consumoMp.lineas[0].cantidad=25
 assert.equal(c.listar()[0].detalles[0].consumoMp.lineas[0].cantidad,20)
 await assert.rejects(c.registrar(id(21),d),RegistroProduccionPendienteError)
 const recarga=control(a,async s=>{assert.equal(detallesProduccionRpc(s)[0].consumo_mp.lineas[0].cantidad,20);return ok(21)})
 await recarga.registrar(id(21),c.listar()[0]);assert.equal(a.length,0)
})
