import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
after(()=>server.close())
const {crearControlRegistroPedido,copiarDatosPedido,RegistroPedidoPendienteError,RegistroPedidoNoGuardadoError}=await server.ssrLoadModule('/src/utils/registroPedidoSeguro.ts')
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const datos=()=>({numeroPedidoCliente:' oc-27 ',clienteId:id(2),bodegaId:id(3),fechaEntrega:'2026-10-28',horaEntrega:'08:30',prioridad:'NORMAL',tipoEmpaque:'GAVETA',detalles:[{productoId:id(10),totalUnidades:30,unidadManejo:10}]})
const ok=n=>({solicitud_id:id(n),pedido_id:`PED-20261027-${id(n).replaceAll('-','')}`,numero_pedido_cliente:'OC-27',total_unidades:30,repetida:false,vigente:true})
function almacen(){const m=new Map();return {m,get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
const control=(a,registrar,resolver=async()=>{throw Error('sin conexión')},extra={})=>crearControlRegistroPedido({almacen:a,proyecto:'ensayo',usuarioId:id(1),registrar,resolver,...extra})
test('Copia y normaliza pedido completo sin convertir unidades ni compartir referencias',()=>{
 const d=datos(),c=copiarDatosPedido(d);assert.equal(c.numeroPedidoCliente,'OC-27');assert.equal(c.detalles[0].totalUnidades,30)
 d.detalles[0].totalUnidades=999;assert.equal(c.detalles[0].totalUnidades,30)
})
test('Bloquea cantidades incompletas, repetidas, fraccionadas, fuera de rango y fechas irreales',()=>{
 const variantes=[d=>d.detalles=[],d=>d.detalles.push({...d.detalles[0]}),d=>d.detalles[0].totalUnidades=31,d=>d.detalles[0].unidadManejo=0,d=>d.detalles[0].totalUnidades=NaN,d=>d.detalles[0].totalUnidades=2147483648,d=>d.fechaEntrega='2026-02-30',d=>d.horaEntrega='25:00',d=>d.clienteId='otro',d=>d.numeroPedidoCliente='']
 for(const variar of variantes){const d=datos();variar(d);assert.throws(()=>copiarDatosPedido(d))}
})
test('Guarda copia antes del envío, con origen de importación y cantidades originales',async()=>{
 const a=almacen(),d=datos(),c=control(a,async s=>{assert.equal(a.length,1);assert.equal(s.origen,'Favorita · archivo.zip');d.detalles[0].totalUnidades=999;assert.equal(s.datos.detalles[0].totalUnidades,30);return ok(101)})
 assert.equal((await c.registrar(id(101),d,'Favorita · archivo.zip')).totalUnidades,30);assert.equal(a.length,0)
})
test('Doble clic comparte un envío y resultado; otros datos con la misma clave no entran',async()=>{
 let terminar,envios=0;const c=control(almacen(),()=>{envios++;return new Promise(r=>terminar=r)})
 const uno=c.registrar(id(102),datos()),dos=c.registrar(id(102),datos());assert.equal(envios,1)
 const otro=datos();otro.detalles[0].totalUnidades=40;await assert.rejects(c.registrar(id(102),otro),RegistroPedidoPendienteError)
 terminar(ok(102));assert.deepEqual(await uno,await dos)
})
test('Respuesta perdida recupera pedido confirmado sin enviarlo otra vez',async()=>{
 let enviados=0;const a=almacen(),c=control(a,async()=>{enviados++;throw Error('respuesta perdida')},async()=>({...ok(103),estado:'CONFIRMADA'}))
 assert.equal((await c.registrar(id(103),datos())).repetida,true);assert.equal(enviados,1);assert.equal(a.length,0)
})
test('Recarga mantiene UUID y bloquea otro pedido hasta resolver la incertidumbre',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error('sin conexión')});await assert.rejects(c.registrar(id(104),datos()),RegistroPedidoPendienteError)
 const recarga=control(a,async s=>{assert.equal(s.solicitudId,id(104));return {...ok(104),repetida:true}})
 assert.equal(recarga.listar()[0].datos.numeroPedidoCliente,'OC-27');await assert.rejects(recarga.registrar(id(105),datos()),RegistroPedidoPendienteError)
 const distinta=datos();distinta.horaEntrega='09:00';await assert.rejects(recarga.registrar(id(104),distinta),RegistroPedidoPendienteError)
 await recarga.registrar(id(104),datos());assert.equal(a.length,0)
})
test('Cerrar ausencia confirmada permite corregir con nueva clave, sin anunciar éxito',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error('Unidad cambió')},async n=>({estado:'ANULADA',solicitud_id:n,pedido_id:null}))
 await assert.rejects(c.registrar(id(106),datos()),e=>e instanceof RegistroPedidoNoGuardadoError&&e.message==='Unidad cambió');assert.equal(a.length,0)
 assert.equal((await control(a,async()=>ok(107)).registrar(id(107),datos())).id,ok(107).pedido_id)
})
test('Comprobar resultado resuelve y no reenvía un pedido',async()=>{
 const a=almacen();await assert.rejects(control(a,async()=>{throw Error()}).registrar(id(108),datos()),RegistroPedidoPendienteError)
 const c=control(a,()=>assert.fail('No debe registrar'),async()=>({...ok(108),estado:'CONFIRMADA'}))
 assert.equal((await c.resolver(id(108))).resultado.id,ok(108).pedido_id);assert.equal(a.length,0)
})
test('Comprobante eliminado informa vigente=false sin recrearlo',async()=>{
 const a=almacen();const c=control(a,async()=>({...ok(109),vigente:false,repetida:true}))
 assert.equal((await c.registrar(id(109),datos())).vigente,false);assert.equal(a.length,0)
})
test('Ack ajeno, incompleto o con número/total diferente no retira el intento',async()=>{
 for(const malo of [{...ok(110),solicitud_id:id(999)},{...ok(110),pedido_id:'PED-'},{...ok(110),numero_pedido_cliente:'OTRO'},{...ok(110),total_unidades:40},{...ok(110),vigente:undefined}]){
  const a=almacen(),c=control(a,async()=>malo,async()=>({...malo,estado:'CONFIRMADA'}))
  await assert.rejects(c.registrar(id(110),datos()),RegistroPedidoPendienteError);assert.equal(a.length,1)
 }
})
test('Sin espacio o almacenamiento corrupto no envía ni borra la evidencia',async()=>{
 for(const setItem of [()=>{throw Error('cuota')},()=>{}]){
  const a=almacen();a.setItem=setItem;await assert.rejects(control(a,()=>assert.fail()).registrar(id(111),datos()),/No se envió/)
 }
 const a=almacen();a.setItem(`cibuspan:pedido:v1:ensayo:${id(1)}:${id(111)}`,'roto')
 await assert.rejects(control(a,()=>assert.fail()).registrar(id(111),datos()),/No se pudo leer/);assert.equal(a.length,1)
})
test('Limpieza local fallida conserva éxito confirmado y permite volver a comprobarlo',async()=>{
 const a=almacen();a.removeItem=()=>{throw Error('bloqueo')}
 const c=control(a,async()=>ok(112),async()=>({...ok(112),estado:'CONFIRMADA'}))
 assert.equal((await c.registrar(id(112),datos())).id,ok(112).pedido_id);assert.equal(c.listar().length,1)
 assert.equal((await c.resolver(id(112))).estado,'CONFIRMADA')
})
test('Proyecto y usuario aíslan intentos sin sobrescribir otras claves',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error()});await assert.rejects(c.registrar(id(113),datos()),RegistroPedidoPendienteError)
 assert.equal(control(a,()=>assert.fail(),undefined,{usuarioId:id(2)}).listar().length,0)
 assert.equal(control(a,()=>assert.fail(),undefined,{proyecto:'otro'}).listar().length,0)
 const segundo=control(a,async()=>{throw Error()},undefined,{usuarioId:id(2)});await assert.rejects(segundo.registrar(id(114),datos()),RegistroPedidoPendienteError)
 assert.equal(a.length,2);assert.equal(c.listar()[0].solicitudId,id(113))
})
