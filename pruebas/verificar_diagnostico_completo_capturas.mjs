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
 const {prepararAuditoriaCapturaCampo,guardarLecturaComprobadaCampo}=await server.ssrLoadModule('/src/utils/recuperacionCapturasCampo.ts')
 const {resumirSemanasCampo,semanasDashboardCampo}=await server.ssrLoadModule('/src/utils/dashboardVisitasRotacion.ts')
 const texto=(codigo,stock=3,fecha='12/10/2026 17:19:37')=>`Detalle del producto\n${fecha}\n$ LOCAL: SUPERMAXI AMERICA\nCódigo de barras ${codigo}\nPrecio afiliado 2.18\nVenta promedio diaria (Cant): .47\nExistencia en local ${stock}\nFecha ult. pedido =\nCantidad del pedido 5`
 const img=t=>({principal:t,control:t,confianza:.9,confianza_control:.9})
 await test('El símbolo de logotipo $ no impide identificar el local; no altera el precio',()=>{
  const r=interpretarReporteFavorita('$ LOCAL: — SUPERMAXI GRANDA CENTENO\nPrecio afiliado $1.96',.9)
  assert.equal(r.local_nombre,'SUPERMAXI GRANDA CENTENO');assert.equal(r.precio_afiliado,1.96)
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
 const rotacion=(r,stock=10,dias=8.83)=>`${texto('7868304262196',stock)}\nVenta promedio diaria (Cant): ${r}\nDías inventario local ${dias}`
 const reanalizar=imagenes=>reanalizarDiagnosticoCapturaCampo({confianza:.9,lectura_control:{
  principal:interpretarReporteFavorita(imagenes.map(i=>i.principal).join('\n'),.9),
  control:interpretarReporteFavorita(imagenes.map(i=>i.control).join('\n'),.9),imagenes}},'7868304262196')
 await test('Stock dividido por días resuelve 113 frente a 1,13 y conserva la evidencia original',()=>{
  const imagenes=[{...img(rotacion(113)),control:rotacion(1.13)},img(rotacion(1.13))]
  const l=reanalizar(imagenes)
  assert.equal(l.rotacion_diaria_unidades,1.13);assert.equal(l.verificacion_campos.rotacion_diaria_unidades.estado,'DOBLE_LECTURA')
  assert.equal(l.verificacion_campos.stock_local_unidades.estado,'DOBLE_LECTURA');assert.equal(l.verificacion_campos.dias_inventario_local.estado,'DOBLE_LECTURA')
  assert.deepEqual(l.lectura_control.comprobacion_inventario.lecturas_observadas,[113,1.13,1.13,1.13])
  assert.ok(l.lectura_control.comprobacion_inventario.cociente>1.13)
  assert.match(imagenes[0].principal,/Cant\): 113/)
  const patch=prepararAuditoriaCapturaCampo({local_id:'l',local_nombre:'SUPERMAXI AMERICA',fecha:'2026-10-12',producto_codigo:'7868304262196',lectura_guardada:{rotacion_diaria_unidades:115}},l,[{id:'l',nombre:'SUPERMAXI AMERICA'}])
  assert.equal(patch.rotacion_diaria_unidades,1.13)
 })
 await test('El cociente no inventa 1,13 si las imágenes sólo contienen 113 ni valida rotación de 100',()=>{
  for(const imagenes of [[img(rotacion(113))],[img(rotacion(100,100,1))]]) {
   const l=reanalizar(imagenes)
   assert.equal(l.verificacion_campos.rotacion_diaria_unidades.estado,'PENDIENTE')
   assert.equal(l.lectura_control.comprobacion_inventario,null)
  }
 })
 await test('Stock contradictorio y días cero no permiten corregir la rotación; cero declarado se conserva',()=>{
  for(const imagenes of [[{...img(rotacion(113)),control:rotacion(1.13,11)},img(rotacion(1.13))],
   [{...img(rotacion(113,10,0)),control:rotacion(1.13,10,0)},img(rotacion(1.13,10,0))]]) {
   const l=reanalizar(imagenes)
   assert.equal(l.lectura_control.comprobacion_inventario,null)
   assert.equal(l.verificacion_campos.rotacion_diaria_unidades.estado,'PENDIENTE')
  }
  const l=reanalizar([img(rotacion(0,0,0))])
  assert.equal(l.rotacion_diaria_unidades,0);assert.equal(l.verificacion_campos.rotacion_diaria_unidades.estado,'DOBLE_LECTURA')
 })
 await test('Dos candidatos cercanos compatibles con el redondeo permanecen pendientes; otro SKU no aporta rotación',()=>{
  const l=reanalizar([img(rotacion(1.13)),img(rotacion(1.14))])
  assert.equal(l.lectura_control.comprobacion_inventario,null)
  assert.equal(l.verificacion_campos.rotacion_diaria_unidades.estado,'PENDIENTE')
  const otro=img(rotacion(1.13).replaceAll('7868304262196','7868304276308'))
  const r=reanalizar([img(rotacion(113)),otro])
  assert.equal(r.rotacion_diaria_unidades,113);assert.equal(r.verificacion_campos.rotacion_diaria_unidades.estado,'PENDIENTE')
 })
 const visita=()=>({id:'v',local_id:'l',local_nombre:'SUPERMAXI AMERICA',fecha:'2026-10-12',visitado_en:'2026-10-12T12:00:00',actualizado_en:'token',
  cliente_id:'c',producto_id:'p',producto_nombre:'Granos',producto_codigo:'7868304262196',lectura_guardada:{rotacion_diaria_unidades:null},valores:{rotacion:null}})
 const guardarComprobada=(registro,lectura,guardar,cancelada=()=>false)=>guardarLecturaComprobadaCampo({registro,lectura,guardar,cancelada,locales:[{id:'l',nombre:registro.local_nombre}]})
 await test('Una relectura comprobada guarda el dato vacío y el gráfico usa el valor persistido; repetir no escribe',async()=>{
  const registro=visita(),l=reanalizar([img(rotacion(1.6,10,6.25))]);let llamadas=0
  const args={registros:[registro],productos:[{id:'p',codigo:registro.producto_codigo,nombre:'Granos'}],semanas:semanasDashboardCampo('2026-10-12'),indicador:'rotacion',soloValidados:true}
  assert.equal(resumirSemanasCampo(args)[0].semanas[4].valor,null)
  assert.equal(await guardarComprobada(registro,l,async datos=>{
   llamadas++;assert.equal(datos.rotacion_diaria_unidades,1.6)
   registro.lectura_guardada={...registro.lectura_guardada,...Object.fromEntries(Object.entries(datos).filter(([c])=>c in l.verificacion_campos))}
   registro.verificacion_campos=datos.verificacion_campos;registro.valores.rotacion=datos.rotacion_diaria_unidades
  }),true)
  assert.equal(resumirSemanasCampo(args)[0].semanas[4].valor,1.6)
  assert.equal(await guardarComprobada(registro,l,async()=>{llamadas++}),false);assert.equal(llamadas,1)
 })
 await test('Un fallo de guardado no anuncia éxito ni añade un dato leído al gráfico; cancelación no escribe',async()=>{
  const registro=visita(),l=reanalizar([img(rotacion(1.6,10,6.25))]);let llamadas=0
  await assert.rejects(()=>guardarComprobada(registro,l,async()=>{llamadas++;throw new Error('La visita cambió')}),/cambió/)
  assert.equal(registro.lectura_guardada.rotacion_diaria_unidades,null)
  assert.equal(await guardarComprobada(registro,l,async()=>{llamadas++},()=>true),false);assert.equal(llamadas,1)
  assert.equal(await guardarComprobada({...registro,lector_estado:'RESPALDO_MANUAL'},l,async()=>{llamadas++}),false);assert.equal(llamadas,1)
 })
 if(process.env.CIBUSPAN_DIAGNOSTICO_COMPLETO) {
  const datos=JSON.parse(await readFile(process.env.CIBUSPAN_DIAGNOSTICO_COMPLETO,'utf8'))
  await test('Diagnóstico real: reanaliza 208 visitas sin OCR, resuelve los dos casos de texto y mantiene los siete bloqueos',async()=>{
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
   const granos=corregidos.get('10e65c28-ce9c-4c28-abf4-292fb0b0f6ed')
   assert.equal(granos.rotacion_diaria_unidades,1.13)
   assert.equal(granos.verificacion_campos.rotacion_diaria_unidades.estado,'DOBLE_LECTURA')
   assert.equal(granos.lectura_control.comprobacion_inventario.stock,10)
   assert.equal(granos.lectura_control.comprobacion_inventario.dias,8.83)
   const granda=corregidos.get('6b954b4e-697b-4247-bd96-3a6a484ae90e')
   assert.equal(granda.lectura_control.principal.local_nombre,granda.lectura_control.control.local_nombre)
   const registro={...visita(),local_nombre:'SUPERMAXI GRANDA CENTENO'}
   assert.equal(granda.rotacion_diaria_unidades,1.6);assert.equal(granda.verificacion_campos.rotacion_diaria_unidades.estado,'DOBLE_LECTURA')
   let guardada
   assert.equal(await guardarComprobada(registro,granda,async datos=>{guardada=datos}),true)
   assert.equal(guardada.rotacion_diaria_unidades,1.6);assert.equal(guardada.verificacion_campos.rotacion_diaria_unidades.estado,'DOBLE_LECTURA')
   console.log('Textos reales: 201 preparados y 7 conservados para revisión; no se escribió en Supabase.')
  })
 }
}finally{await server.close()}
