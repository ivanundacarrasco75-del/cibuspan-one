import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
try {
 const {interpretarReporteFavorita}=await server.ssrLoadModule('/src/utils/ocrFavorita.ts')
 const {verificarDosLecturasCampo}=await server.ssrLoadModule('/src/utils/validacionLecturasCampo.ts')
 const {seleccionarCapturasSkuCampo}=await server.ssrLoadModule('/src/utils/seleccionCapturasSkuCampo.ts')
 const {reanalizarDiagnosticoCapturaCampo}=await server.ssrLoadModule('/src/utils/reanalizarDiagnosticoCapturasCampo.ts')
 const {prepararAuditoriaCapturaCampo}=await server.ssrLoadModule('/src/utils/recuperacionCapturasCampo.ts')
 const texto=(codigo,stock=3,fecha='12/10/2026 17:19:37')=>`Detalle del producto\n${fecha}\n$ LOCAL: SUPERMAXI AMERICA\nCódigo de barras ${codigo}\nPrecio afiliado 2.18\nVenta promedio diaria (Cant): .47\nExistencia en local ${stock}\nFecha ult. pedido =\nCantidad del pedido 5`
 const img=t=>({principal:t,control:t,confianza:.9,confianza_control:.9})
 await test('El símbolo de logotipo $ no impide identificar el local; no altera el precio',()=>{
  const r=interpretarReporteFavorita('$ LOCAL: — SUPERMAXI GRANDA CENTENO\nPrecio afiliado $1.96',.9)
  assert.match(r.local_nombre,/SUPERMAXI GRANDA CENTENO/);assert.equal(r.precio_afiliado,1.96)
 })
 await test('Dos cantidades 5 coincidentes sin fecha de pedido permanecen pendientes',()=>{
  const a=interpretarReporteFavorita(texto('7868304276308'),.9)
  assert.equal(verificarDosLecturasCampo(a,a).cantidad_ultimo_pedido.estado,'PENDIENTE')
  const valido={...a,fecha_ultimo_pedido:'2026-10-10'}
  assert.equal(verificarDosLecturasCampo(valido,valido).cantidad_ultimo_pedido.estado,'DOBLE_LECTURA')
  assert.equal(verificarDosLecturasCampo({...a,cantidad_ultimo_pedido:0},{...a,cantidad_ultimo_pedido:0}).cantidad_ultimo_pedido.estado,'DOBLE_LECTURA')
 })
 await test('Separar SKU no traslada stock ni precios del producto equivocado y mantiene la continuación correcta',()=>{
  const imagenes=[img(texto('7868304276261',6)),img(texto('7868304276308',3)),img('Detalle del producto\n12/10/2026 17:19:37\nPrecio afiliado 2.18\nExistencia en local 3\nDías inventario local 6.42')]
  const seleccion=seleccionarCapturasSkuCampo(imagenes,'7868304276308',interpretarReporteFavorita)
  assert.deepEqual(seleccion.incluidas,[1,2]);assert.equal(seleccion.omitidas.length,1)
  const lectura={confianza:.9,lectura_control:{principal:interpretarReporteFavorita(imagenes.map(i=>i.principal).join('\n'),.9),control:interpretarReporteFavorita(imagenes.map(i=>i.control).join('\n'),.9),imagenes}}
  const r=reanalizarDiagnosticoCapturaCampo(lectura,'7868304276308')
  assert.equal(r.codigo_barras,'7868304276308');assert.equal(r.stock_local_unidades,3);assert.equal(r.dias_inventario_local,6.42)
 })
 await test('La continuación sin cabecera, de otra fecha o después de otro SKU no se asocia automáticamente',()=>{
  const continuacion='Detalle del producto\n13/10/2026 17:19:37\nPrecio afiliado 2.18\nExistencia en local 3'
  assert.equal(seleccionarCapturasSkuCampo([img(continuacion)],'7868304276308',interpretarReporteFavorita).incluidas.length,0)
  assert.deepEqual(seleccionarCapturasSkuCampo([img(texto('7868304276308')),img(continuacion)],'7868304276308',interpretarReporteFavorita).incluidas,[0])
  assert.deepEqual(seleccionarCapturasSkuCampo([img(texto('7868304276308')),img(texto('7868304276261')),img(continuacion)],'7868304276308',interpretarReporteFavorita).incluidas,[0])
 })
 await test('Un diagnóstico sin las lecturas originales no produce una corrección',()=>{
  assert.throws(()=>reanalizarDiagnosticoCapturaCampo({confianza:.9},'7868304276308'),/originales/)
 })
 if(process.env.CIBUSPAN_DIAGNOSTICO_COMPLETO) {
  const datos=JSON.parse(await readFile(process.env.CIBUSPAN_DIAGNOSTICO_COMPLETO,'utf8'))
  await test('Diagnóstico real: reanaliza 208 visitas sin OCR, resuelve los dos casos de texto y mantiene los siete bloqueos',()=>{
   assert.equal(datos.resultados.length,208)
   const fallos=[], corregidos=new Map()
   for(const r of datos.resultados) {
    let codigo=r.lectura.codigo_barras ?? '7868304262196'
    if(r.id==='46f7547e-24be-4865-ae23-cd9d789818df')codigo='7868304276261'
    if(r.id==='ba9e6e68-bcff-46f3-924f-d092c5a1d7dc')codigo='7868304276308'
    const l=reanalizarDiagnosticoCapturaCampo(r.lectura,codigo);corregidos.set(r.id,l)
    try {prepararAuditoriaCapturaCampo({local_id:r.local,local_nombre:r.local,fecha:r.fecha,producto_codigo:codigo,lectura_guardada:{}},l,[{id:r.local,nombre:r.local}])}
    catch(e){fallos.push({id:r.id,error:e.message})}
    if(r.lectura.fecha_ultimo_pedido===null && r.lectura.cantidad_ultimo_pedido===5) assert.equal(l.verificacion_campos.cantidad_ultimo_pedido.estado,'PENDIENTE')
   }
   assert.equal(fallos.length,7,JSON.stringify(fallos))
   assert.ok(!fallos.some(r=>r.id==='6b954b4e-697b-4247-bd96-3a6a484ae90e'))
   assert.ok(!fallos.some(r=>r.id==='ba9e6e68-bcff-46f3-924f-d092c5a1d7dc'))
   const maiz=corregidos.get('ba9e6e68-bcff-46f3-924f-d092c5a1d7dc')
   assert.equal(maiz.codigo_barras,'7868304276308');assert.equal(maiz.stock_local_unidades,3);assert.equal(maiz.precio_afiliado,2.18);assert.equal(maiz.dias_inventario_local,6.42)
   assert.equal(corregidos.get('6b954b4e-697b-4247-bd96-3a6a484ae90e').local_nombre.replace(/^— /,''),'SUPERMAXI GRANDA CENTENO')
   console.log('Textos reales: 201 preparados y 7 conservados para revisión; no se escribió en Supabase.')
  })
 }
}finally{await server.close()}
