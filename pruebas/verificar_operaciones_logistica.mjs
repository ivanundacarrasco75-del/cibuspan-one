import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
after(()=>server.close())
const {crearControlLogistica,copiarDatosLogistica,LogisticaPendienteError,LogisticaNoEjecutadaError}=await server.ssrLoadModule('/src/utils/operacionLogisticaSegura.ts')
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const intento=(n,tipo='DESPACHAR')=>({version:1,id:id(n),usuarioId:id(1),tipo,pedidoId:'PED-ENSAYO',token:'a'.repeat(32),creadoEn:'2026-10-27T12:00:00Z',datos:tipo==='ELIMINAR'?{pedidoId:'PED-ENSAYO'}:{reservaId:id(10),numeroFactura:'FAC-01',cantidades:[{pedidoDetalleId:id(20),unidades:20}]}})
const ok=(n,tipo='DESPACHAR')=>({estado:'CONFIRMADA',solicitud_id:id(n),tipo,objeto_id:tipo==='ELIMINAR'?'PED-ENSAYO':id(10),pedido_id:'PED-ENSAYO',resumen:{pedido_id:'PED-ENSAYO',numero_pedido_cliente:'OC-ENSAYO',unidades:20,numero_factura:'FAC-01',bloqueos:[],puede_ejecutar:true},repetida:false})
function almacen(){const m=new Map();return {m,get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
const control=(a,ejecutar,resolver=async()=>{throw Error('sin conexión')},extra={})=>crearControlLogistica({almacen:a,proyecto:'ensayo',usuarioId:id(1),ejecutar,resolver,...extra})
test('Copia cantidades y normaliza orden/UUID/factura sin compartir referencias',()=>{
 const d=intento(1).datos;d.cantidades.push({pedidoDetalleId:id(19),unidades:0});d.numeroFactura=' FAC-01 '
 const c=copiarDatosLogistica('DESPACHAR',d);assert.equal(c.cantidades[0].pedidoDetalleId,id(19));assert.equal(c.numeroFactura,'FAC-01')
 d.cantidades[0].unidades=999;assert.equal(c.cantidades[1].unidades,20)
 assert.deepEqual(copiarDatosLogistica('ELIMINAR',{pedidoId:' PED-ENSAYO '}),{pedidoId:'PED-ENSAYO'})
})
test('Bloquea líneas repetidas/ajenas, decimales, negativos, cero total y valores no numéricos',()=>{
 for(const cantidades of [[],[{pedidoDetalleId:id(20),unidades:0}],[{pedidoDetalleId:id(20),unidades:-1}],[{pedidoDetalleId:id(20),unidades:0.5}],[{pedidoDetalleId:id(20),unidades:NaN}],[{pedidoDetalleId:'OTRO',unidades:1}],[{pedidoDetalleId:id(20),unidades:1},{pedidoDetalleId:id(20),unidades:1}]])assert.throws(()=>copiarDatosLogistica('DESPACHAR',{...intento(1).datos,cantidades}))
 assert.throws(()=>copiarDatosLogistica('ELIMINAR',{pedidoId:''}))
})
test('Persiste revisión y copia de datos antes de enviar cualquiera de las operaciones',async()=>{
 for(const tipo of ['ELIMINAR','DESPACHAR']){
  const a=almacen(),s=intento(101,tipo),c=control(a,async recibido=>{assert.equal(a.length,1);assert.notEqual(recibido,s);assert.equal(recibido.token,s.token);return ok(101,tipo)})
  assert.equal((await c.ejecutar(s)).estado,'CONFIRMADA');assert.equal(a.length,0)
 }
})
test('Dos clics comparten una petición y no aceptan datos diferentes con el mismo UUID',async()=>{
 const a=almacen();let terminar,veces=0;const c=control(a,()=>{veces++;return new Promise(r=>terminar=r)})
 const s=intento(102),uno=c.ejecutar(s),dos=c.ejecutar(s);assert.equal(veces,1)
 const diferente=intento(102);diferente.datos.numeroFactura='OTRA';await assert.rejects(c.ejecutar(diferente),LogisticaPendienteError)
 terminar(ok(102));assert.deepEqual(await uno,await dos)
})
test('Respuesta perdida recupera confirmación sin repetir eliminación o salida',async()=>{
 for(const tipo of ['ELIMINAR','DESPACHAR']){
  const a=almacen();let envios=0;const c=control(a,async()=>{envios++;throw Error('respuesta perdida')},async()=>ok(103,tipo))
  assert.equal((await c.ejecutar(intento(103,tipo))).repetida,true);assert.equal(envios,1);assert.equal(a.length,0)
 }
})
test('Recarga conserva intento y bloquea otra clase de operación hasta resolverlo',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error('sin conexión')});await assert.rejects(c.ejecutar(intento(104)),LogisticaPendienteError)
 const recarga=control(a,async s=>{assert.equal(s.id,id(104));return ok(104)})
 assert.equal(recarga.listar()[0].datos.numeroFactura,'FAC-01');await assert.rejects(recarga.ejecutar(intento(105,'ELIMINAR')),LogisticaPendienteError)
 await recarga.ejecutar(intento(104));assert.equal(a.length,0)
})
test('No cambia token ni pedido esperado de una solicitud incierta',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error()});await assert.rejects(c.ejecutar(intento(106)),LogisticaPendienteError)
 for(const cambiar of [s=>s.token='b'.repeat(32),s=>s.pedidoId='PED-OTRO']){const s=intento(106);cambiar(s);await assert.rejects(c.ejecutar(s),LogisticaPendienteError)}
 assert.equal(c.listar().length,1)
})
test('Un intento de eliminación con identidad local incompatible no se envía',async()=>{
 const s=intento(115,'ELIMINAR');s.pedidoId='PED-DIFERENTE'
 await assert.rejects(control(almacen(),()=>assert.fail()).ejecutar(s),/no coincide/)
})
test('Ausencia sellada permite nueva revisión sin anunciar éxito de la anterior',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error('Inventario cambió')},async s=>({estado:'ANULADA',solicitud_id:s.id,tipo:s.tipo}))
 await assert.rejects(c.ejecutar(intento(107)),e=>e instanceof LogisticaNoEjecutadaError&&e.message==='Inventario cambió');assert.equal(a.length,0)
 assert.equal((await control(a,async()=>ok(108)).ejecutar(intento(108))).estado,'CONFIRMADA')
})
test('Comprobar consulta el resultado sin reenviar y sin descartar incertidumbre',async()=>{
 const a=almacen();await assert.rejects(control(a,async()=>{throw Error()}).ejecutar(intento(109)),LogisticaPendienteError)
 const c=control(a,()=>assert.fail('No debe reenviar'),async()=>ok(109))
 assert.equal((await c.resolver(c.listar()[0])).estado,'CONFIRMADA');assert.equal(a.length,0)
})
test('Respuestas ajenas o incompatibles no borran evidencia local',async()=>{
 for(const malo of [{...ok(110),solicitud_id:id(999)},{...ok(110),tipo:'ELIMINAR'},{...ok(110),pedido_id:'PED-OTRO'},{...ok(110),objeto_id:id(999)},{...ok(110),resumen:{...ok(110).resumen,unidades:30}},{...ok(110),resumen:{...ok(110).resumen,numero_factura:'OTRA'}},{...ok(110),repetida:undefined}]){
  const a=almacen(),c=control(a,async()=>malo,async()=>malo);await assert.rejects(c.ejecutar(intento(110)),LogisticaPendienteError);assert.equal(a.length,1)
 }
})
test('Cuota agotada o escritura no persistida impide enviar la operación',async()=>{
 for(const setItem of [()=>{throw Error('cuota')},()=>{}]){const a=almacen();a.setItem=setItem;await assert.rejects(control(a,()=>assert.fail()).ejecutar(intento(111)),/No se envió/)}
})
test('Almacenamiento corrupto no se borra para permitir un nuevo envío',async()=>{
 const a=almacen();a.setItem(`cibuspan:logistica:v1:ensayo:${id(1)}:${id(112)}`,'roto')
 await assert.rejects(control(a,()=>assert.fail()).ejecutar(intento(112)),/No se pudo leer/);assert.equal(a.length,1)
})
test('Limpieza fallida no convierte éxito conocido en fallo',async()=>{
 const a=almacen();a.removeItem=()=>{throw Error('bloqueo')};const c=control(a,async()=>ok(113),async()=>ok(113))
 assert.equal((await c.ejecutar(intento(113))).estado,'CONFIRMADA');assert.equal(c.listar().length,1)
 assert.equal((await c.resolver(intento(113))).estado,'CONFIRMADA')
})
test('Sesiones y proyectos aíslan intentos y rechazan usar la copia de otro usuario',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error()});await assert.rejects(c.ejecutar(intento(114)),LogisticaPendienteError)
 assert.equal(control(a,()=>assert.fail(),undefined,{proyecto:'otro'}).listar().length,0)
 const otra=control(a,()=>assert.fail(),undefined,{usuarioId:id(2)});assert.equal(otra.listar().length,0);await assert.rejects(otra.ejecutar(intento(114)),/inválido/)
})
