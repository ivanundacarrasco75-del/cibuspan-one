import test, {after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
after(()=>server.close())
const {crearBorradorArranque,leerBorradorArranque,sincronizarBorradorArranque,prepararConteosArranque,numeroArranque,vincularCodigoArranque,importarFilasArranque}=await server.ssrLoadModule('/src/utils/arranqueOperativo.ts')
const {crearControlArranque,ArranquePendienteError,ArranqueNoAplicadoError}=await server.ssrLoadModule('/src/utils/controlArranque.ts')
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const catalogo=()=>({hoy:'2026-10-24',mp:[{id:id(10),codigo:'00042',codigo_contable:null,nombre:'Harina',unidad:'KG',activo:true,saldo:20}],
 pt:[{id:id(20),codigo:'SKU',nombre:'Pan',unidad:'UNIDAD',activo:true,saldo:10}],semi:[],
 lotes_pt:[{id:id(30),producto_id:id(20),lote:'FISICO',fecha_produccion:'2026-10-23',fecha_vencimiento:'2026-11-23',cantidad:10,inv_archivo_id:null}],lotes_semi:[],reservas_activas:0,pedidos_pendientes:[]})
const listo=()=>{const c=catalogo(),d=crearBorradorArranque(c);d.inicio=c.hoy;d.mp[0].cantidad='5,25';d.pt[0].total='6';d.pt[0].lotes[0].cantidad='6';return {c,d}}
const fila=(cambios={})=>({codigo:'42',nombre:'Harina',cantidad:15,unidadArchivo:'KG',origen:'Inventario:2',...cambios})
test('Borrador nuevo deja fecha y cantidades pendientes; no copia el saldo como conteo',()=>{
 const d=crearBorradorArranque(catalogo());assert.equal(d.inicio,'');assert.equal(d.mp[0].cantidad,'');assert.equal(d.pt[0].total,'');assert.equal(d.pt[0].lotes[0].cantidad,'')
 assert.equal(d.pt[0].lotes[0].fecha_produccion,'2026-10-23');assert.throws(()=>prepararConteosArranque(d,catalogo()))
})
test('Vacío no es cero; cantidades sin miles, precisión y enteros se verifican',()=>{
 assert.equal(numeroArranque('0'),0);assert.equal(numeroArranque('2,500001'),2.500001)
 for(const s of ['',' ','-1','NaN','1.000.000','1e2','2.0000001'])assert.throws(()=>numeroArranque(s))
 assert.throws(()=>numeroArranque('2,5',true));assert.throws(()=>numeroArranque('2147483648',true))
})
test('Todos los artículos deben contarse y PT requiere suma y fechas reales',()=>{
 const {c,d}=listo();assert.equal(prepararConteosArranque(d,c).mp[0].cantidad,5.25)
 const variantes=[x=>x.mp.pop(),x=>x.mp.push({...x.mp[0]}),x=>x.mp[0].unidad='L',x=>x.pt[0].total='7',x=>x.pt[0].lotes[0].fecha_produccion='2026-10-24',x=>x.pt[0].lotes[0].fecha_vencimiento='2026-02-30',x=>x.inicio='2026-10-26']
 for(const variar of variantes){const v=structuredClone(d);variar(v);assert.throws(()=>prepararConteosArranque(v,c))}
 d.mp[0].cantidad='0';d.pt[0].total='0';d.pt[0].lotes=[];assert.equal(prepararConteosArranque(d,c).pt[0].total,0)
})
test('Código sin ceros se vincula; alias ambiguos y EAN distintos no se adivinan',()=>{
 const c=catalogo();assert.equal(vincularCodigoArranque('42',c).articulo.id,id(10))
 c.pt[0].codigo='42';assert.equal(vincularCodigoArranque('00042',c),null)
 c.pt[0].codigo='0123456789012';assert.equal(vincularCodigoArranque('123456789012',c),null)
})
test('Excel asigna, no acumula; filas repetidas o unidades dudosas quedan pendientes',()=>{
 const {c,d}=listo();const una=importarFilasArranque(d,c,[fila()],'archivo:sha')
 assert.equal(una.mp[0].cantidad,'15');assert.equal(importarFilasArranque(una,c,[fila()],'archivo:sha').mp[0].cantidad,'15')
 const doble=importarFilasArranque(d,c,[fila(),fila({origen:'OtraBodega:2'})],'duplicado')
 assert.equal(doble.mp[0].cantidad,'5,25');assert.equal(doble.incidencias.length,2);assert.throws(()=>prepararConteosArranque(doble,c))
 const unidad=importarFilasArranque(d,c,[fila({unidadArchivo:'L'})],'unidad');assert.equal(unidad.incidencias.length,1)
 const raro=importarFilasArranque(d,c,[fila({codigo:'NO EXISTE'})],'raro');assert.equal(raro.incidencias.length,1)
 raro.incidencias[0].decision='Fuera del alcance documentado';assert.equal(prepararConteosArranque(raro,c).incidencias[0].decision,raro.incidencias[0].decision)
})
test('Importar PT no inventa lotes ni cantidades de lote; cero es explícito',()=>{
 const {c,d}=listo(),f=fila({codigo:'SKU',cantidad:9,unidadArchivo:'UND'})
 const v=importarFilasArranque(d,c,[f],'pt');assert.equal(v.pt[0].total,'9');assert.equal(v.pt[0].lotes[0].cantidad,'6');assert.throws(()=>prepararConteosArranque(v,c))
 assert.equal(importarFilasArranque(d,c,[{...f,cantidad:0}],'cero').pt[0].lotes.length,0)
})
test('Reenlaza identidad exacta de lote archivado y rechaza duplicados',()=>{
 const {c,d}=listo();c.lotes_pt[0].inv_archivo_id=id(90);d.pt[0].lotes[0].id=id(99)
 assert.equal(prepararConteosArranque(d,c).pt[0].lotes[0].id,id(30))
 d.pt[0].lotes.push({...d.pt[0].lotes[0],id:id(98)});d.pt[0].total='12';assert.throws(()=>prepararConteosArranque(d,c),/repetido/)
})
test('Sincronizar conserva conteos, añade nuevos vacíos y guarda evidencia de retirados/unidades cambiadas',()=>{
 const {c,d}=listo();c.mp.push({...c.mp[0],id:id(11),codigo:'NUEVO'});let s=sincronizarBorradorArranque(d,c)
 assert.equal(s.mp[0].cantidad,'5,25');assert.equal(s.mp[1].cantidad,'')
 c.mp.shift();s=sincronizarBorradorArranque(d,c);assert.equal(s.incidencias[0].conteoAnterior.cantidad,'5,25')
 const otro=listo();otro.c.mp[0].unidad='G';s=sincronizarBorradorArranque(otro.d,otro.c);assert.equal(s.mp[0].cantidad,'');assert.ok(s.incidencias.length)
 assert.deepEqual(leerBorradorArranque(JSON.stringify(s)),s);assert.throws(()=>leerBorradorArranque('{roto'))
})
function almacen(){const m=new Map();return {m,get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
const intento=n=>({version:1,id:id(n),usuarioId:id(1),inicio:'2026-10-24',conteos:prepararConteosArranque(listo().d,catalogo()),token:'a'.repeat(32),creadoEn:'2026-10-24T00:00:00Z'})
const ok=n=>({estado:'APLICADO',solicitud_id:id(n),fecha_inicio:'2026-10-24',fecha_cierre:'2026-10-23',resumen:{lineas:[],avisos:[]},repetido:false})
const control=(a,aplicar,resolver=async()=>{throw Error('sin conexión')},extra={})=>crearControlArranque({almacen:a,proyecto:'ensayo',usuarioId:id(1),aplicar,resolver,...extra})
test('Persiste copia antes de enviar y dos clics comparten un solo envío',async()=>{
 const a=almacen(),s=intento(101);let terminar,envios=0
 const c=control(a,recibido=>{envios++;assert.equal(a.length,1);assert.notEqual(recibido,s);return new Promise(r=>terminar=r)})
 const uno=c.aplicar(s),dos=c.aplicar(s);assert.equal(envios,1);terminar(ok(101));assert.deepEqual(await uno,await dos);assert.equal(a.length,0)
})
test('Respuesta perdida recupera aplicación sin duplicarla',async()=>{
 let envios=0;const a=almacen(),c=control(a,async()=>{envios++;throw Error('respuesta perdida')},async()=>ok(102))
 assert.equal((await c.aplicar(intento(102))).repetido,true);assert.equal(envios,1);assert.equal(a.length,0)
})
test('Recarga conserva solicitud incierta y rechaza otro UUID o datos distintos',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error('sin conexión')})
 await assert.rejects(c.aplicar(intento(103)),ArranquePendienteError)
 const recarga=control(a,async()=>ok(103));assert.equal(recarga.listar()[0].id,id(103))
 await assert.rejects(recarga.aplicar(intento(104)),ArranquePendienteError)
 const cambiada=intento(103);cambiada.conteos.mp[0].cantidad=999;await assert.rejects(recarga.aplicar(cambiada),ArranquePendienteError)
 assert.equal((await recarga.aplicar(intento(103))).estado,'APLICADO');assert.equal(a.length,0)
})
test('Resolver ausencia sellada permite corregir sin repetir el intento',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error('vista previa vencida')},async n=>({estado:'ANULADO',solicitud_id:n}))
 await assert.rejects(c.aplicar(intento(105)),ArranqueNoAplicadoError);assert.equal(a.length,0)
 assert.equal((await control(a,async()=>ok(106)).aplicar(intento(106))).estado,'APLICADO')
})
test('Respuestas ajenas o malformadas no borran la solicitud pendiente',async()=>{
 const a=almacen(),c=control(a,async()=>ok(999),async()=>({...ok(107),resumen:null}))
 await assert.rejects(c.aplicar(intento(107)),ArranquePendienteError);assert.equal(a.length,1)
 await assert.rejects(c.resolver(id(107)),ArranquePendienteError);assert.equal(a.length,1)
 const b=almacen(),fecha=control(b,async()=>({...ok(111),fecha_inicio:'2026-10-25',fecha_cierre:'2026-10-24'}),async()=>({...ok(111),fecha_cierre:'2026-10-22'}))
 await assert.rejects(fecha.aplicar(intento(111)),ArranquePendienteError);assert.equal(b.length,1)
})
test('Sin espacio, almacenamiento corrupto y otra sesión no envían ningún corte',async()=>{
 for(const setItem of [()=>{throw Error('cuota')},()=>{}]){
  const a=almacen();a.setItem=setItem;await assert.rejects(control(a,()=>assert.fail()).aplicar(intento(108)),/no se envió/)
 }
 const a=almacen();a.setItem(`cibuspan:arranque:intento:v1:ensayo:${id(1)}:${id(108)}`,'roto')
 await assert.rejects(control(a,()=>assert.fail()).aplicar(intento(108)),/No se pudo leer/);assert.equal(a.length,1)
 await assert.rejects(control(almacen(),()=>assert.fail(),undefined,{usuarioId:id(2)}).aplicar(intento(108)),/inválido/)
})
test('Proyecto/usuario aíslan pendientes; fallo al limpiar conserva éxito confirmado',async()=>{
 const a=almacen(),c=control(a,async()=>{throw Error('sin conexión')});await assert.rejects(c.aplicar(intento(109)),ArranquePendienteError)
 assert.equal(control(a,()=>assert.fail(),undefined,{proyecto:'otro'}).listar().length,0)
 assert.equal(control(a,()=>assert.fail(),undefined,{usuarioId:id(2)}).listar().length,0)
 const b=almacen();b.removeItem=()=>{throw Error('bloqueo')};assert.equal((await control(b,async()=>ok(110)).aplicar(intento(110))).estado,'APLICADO');assert.equal(b.length,1)
 assert.equal((await control(b,()=>assert.fail(),async()=>ok(110)).resolver(id(110))).estado,'APLICADO')
})
