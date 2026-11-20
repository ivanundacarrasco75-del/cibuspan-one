import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'

const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {resumirTableroSku}=await server.ssrLoadModule('/src/utils/tableroSku.ts')
 const {puedeAbrirPantalla}=await server.ssrLoadModule('/src/utils/permisosAplicacion.ts')
 const base=()=>({
  productos:[{id:'p',codigo:'EAN',nombre:'Pan',corto:'Pan'},{id:'q',codigo:'OTRO',nombre:'Otro',corto:'Otro'}],
  clientes:[{id:'c',nombre:'Cadena'},{id:'d',nombre:'Otra cadena'}],
  asignaciones:[{cliente_id:'c',producto_id:'p'},{cliente_id:'d',producto_id:'q'}],
  ventas:[{cliente_id:'c',cliente_nombre:'Cadena',producto_id:'p',sku:'EAN',cantidad:100,total_sin_impuestos:200}],
  devoluciones:[{fecha_devolucion:'2026-11-10',cliente:{id:'c'},detalles:[{producto_id:'p',unidades:10,valor_total_documento:20,precio_unitario_documento:2}]}],
  visitas:[],costos:[{producto_id:'p',costo_materiales_unidad:1,items_sin_costo:0}],errores:[],
 })
 const visita=(id,fecha,valor,extra={})=>({
  id,fecha,cliente_id:'c',local_id:'l',local_nombre:'Local',producto_id:'p',producto_nombre:'Pan',
  visitado_en:fecha+'T12:00:00Z',actualizado_en:fecha+'T12:00:00Z',
  lector_estado:'RESPALDO_MANUAL',valores:{rotacion:valor},...extra,
 })
 await test('Resta la devolución una sola vez y conserva el costo de todas las unidades facturadas',()=>{
  const f=resumirTableroSku(base(),'c').filas[0]
  assert.equal(f.neto,180)
  assert.equal(f.aporte,80)
  assert.equal(f.tasaDevolucion,10)
 })
 await test('Costos incompletos y devoluciones sin valor dejan sus resultados pendientes',()=>{
  const datos=base()
  datos.costos[0].items_sin_costo=1
  assert.equal(resumirTableroSku(datos).filas.find(f=>f.id==='p').aporte,null)
  datos.devoluciones[0].detalles[0].valor_total_documento=null
  datos.devoluciones[0].detalles[0].precio_unitario_documento=null
  const f=resumirTableroSku(datos).filas.find(f=>f.id==='p')
  assert.equal(f.neto,null)
  assert.equal(f.aporte,null)
  assert.equal(f.devolucionesSinValor,1)
 })
 await test('Un error de fuente no equivale a un neto o aporte de cero',()=>{
  const datos=base()
  datos.devoluciones=null
  const f=resumirTableroSku(datos).filas.find(f=>f.id==='p')
  assert.equal(f.neto,null);assert.equal(f.aporte,null);assert.equal(f.tasaDevolucion,null)
 })
 await test('El catálogo activo y su asignación por cliente impiden mezclar SKU de cadenas distintas',()=>{
  const datos=base()
  datos.ventas.push({...datos.ventas[0],cliente_id:'d',cantidad:900,total_sin_impuestos:1800})
  assert.equal(resumirTableroSku(datos).filas.find(f=>f.id==='p').unidades,100)
  assert.deepEqual(resumirTableroSku(datos,'c').filas.map(f=>f.id),['p'])
  assert.deepEqual(resumirTableroSku(datos,'c','q').filas,[])
 })
 await test('La última visita semanal evita repetir el local y promedia las semanas disponibles',()=>{
  const datos=base()
  datos.visitas=[visita('a','2026-11-02',100),visita('b','2026-11-03',0),visita('c','2026-11-10',4)]
  const r=resumirTableroSku(datos)
  assert.equal(r.rotaciones[0].rotacion,2)
  assert.equal(r.rotaciones[0].semanas,2)
  assert.equal(r.locales[0].skus,1)
  assert.equal(r.locales[0].mediciones,2)
  datos.visitas.push(visita('d','2026-11-11',null))
  const actual=resumirTableroSku(datos)
  assert.equal(actual.rotaciones[0].rotacion,0)
  assert.equal(actual.pendientes,1)
 })
 await test('Una rotación sin verificar queda fuera del ranking, incluso si hay una anterior comprobada',()=>{
  const datos=base()
  datos.visitas=[visita('a','2026-11-02',2),visita('b','2026-11-03',100,{
   lector_estado:'REVISAR',capturas_app:['captura.png'],lectura_guardada:{rotacion_diaria_unidades:100},verificacion_campos:{rotacion_diaria_unidades:{estado:'PENDIENTE',valor:100}},
  })]
  assert.deepEqual(resumirTableroSku(datos).rotaciones,[])
 })
 await test('La ruta respeta el acceso y las denegaciones del Dashboard Comercial',()=>{
  assert.equal(puedeAbrirPantalla('Dashboard · SKU','KAM',['Dashboard · Comercial']),true)
  assert.equal(puedeAbrirPantalla('Dashboard · SKU','KAM',['Dashboard'],['Dashboard · Comercial']),false)
 })
} finally {await server.close()}
