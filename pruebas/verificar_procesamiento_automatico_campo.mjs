import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
process.env.VITE_SUPABASE_URL='https://automatico-prueba.invalid'
process.env.VITE_SUPABASE_ANON_KEY='clave-publica-de-prueba'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
try {
 const {procesarVisitasAutomaticamenteCampo,visitasSinProcesarCampo,excepcionesProcesamientoCampo,marcaProcesamientoCampo}=await server.ssrLoadModule('/src/utils/procesamientoAutomaticoCampo.ts')
 const {interpretarReporteFavorita}=await server.ssrLoadModule('/src/utils/ocrFavorita.ts')
 const {verificarDosLecturasCampo}=await server.ssrLoadModule('/src/utils/validacionLecturasCampo.ts')
 const {resumirSemanasCampo,semanasDashboardCampo}=await server.ssrLoadModule('/src/utils/dashboardVisitasRotacion.ts')
 const {CAMPOS_LECTURA_VALIDABLES}=await server.ssrLoadModule('/src/utils/validacionLecturasCampo.ts')
 const texto='Detalle del producto\n12/10/2026 12:35:07\nS LOCAL: SUPERMAXI GRANDA CENTENO\nCódigo de barras 7868304262196\nPrecio comercio 2.22\nPrecio afiliado 1.96\nVenta promedio diaria (Cant): 1.60\nExistencia en local 10\nDías inventario local 6.25\nFecha ult. pedido -\nCantidad del pedido -'
 const a=interpretarReporteFavorita(texto,.9), lectura={...a,verificacion_campos:verificarDosLecturasCampo(a,a),lectura_control:{principal:a,control:a}}
 const registro=(id='r')=>({id,fecha:'2026-10-12',visitado_en:'2026-10-12T12:35:07',actualizado_en:'token',cliente_id:'c',local_id:'l',local_nombre:'SUPERMAXI GRANDA CENTENO',producto_id:'p',producto_nombre:'Granos',producto_codigo:'7868304262196',capturas_app:['original.png'],lectura_guardada:{rotacion_diaria_unidades:null},valores:{rotacion:null}})
 const procesar=(registros,extra={})=>procesarVisitasAutomaticamenteCampo({registros,locales:[{id:'l',nombre:'SUPERMAXI GRANDA CENTENO'}],leerImagenes:async()=>lectura,guardar:async()=>{},cancelada:()=>false,progreso:()=>{},resultado:()=>{},...extra})
 const persistir=(r,d)=>{r.lectura_almacenada={...lectura,lectura_control:d.lectura_control};r.verificacion_campos={...r.verificacion_campos,...d.verificacion_campos};r.lectura_guardada={...r.lectura_guardada,...Object.fromEntries(CAMPOS_LECTURA_VALIDABLES.filter(([c])=>c in d).map(([c])=>[c,d[c]]))};for(const c of d.campos_borrar??[])r.lectura_guardada[c]=null;r.valores.rotacion=r.lectura_guardada.rotacion_diaria_unidades}
 await test('Reutiliza lectura guardada, guarda 1,60 automáticamente y no reprocesa los mismos pendientes al reabrir',async()=>{
  const r={...registro(),lectura_almacenada:lectura};let imagenes=0,guardados=0
  await procesar([r],{leerImagenes:async()=>{imagenes++;return lectura},guardar:async(reg,d)=>{guardados++;persistir(reg,d)}})
  assert.equal(imagenes,0);assert.equal(guardados,1);assert.equal(r.valores.rotacion,1.6)
  assert.equal(resumirSemanasCampo({registros:[r],productos:[{id:'p',codigo:r.producto_codigo,nombre:'Granos'}],semanas:semanasDashboardCampo('2026-10-12'),indicador:'rotacion',soloValidados:true})[0].semanas[4].valor,1.6)
  assert.equal(visitasSinProcesarCampo([r]).length,0)
  await procesar([r],{leerImagenes:async()=>{imagenes++;return lectura},guardar:async()=>{guardados++}})
  assert.equal(guardados,1);assert.equal(imagenes,0);assert.ok(excepcionesProcesamientoCampo([r]).length>0)
  assert.equal(visitasSinProcesarCampo([{...r,capturas_app:['nueva.png']}]).length,1)
 })
 await test('Sin texto guardado hace una lectura por ID, secuencialmente, y respeta cancelación antes de guardar',async()=>{
  let lecturas=0,guardados=0,cancelada=false
  const r=registro()
  await procesar([r,r],{leerImagenes:async()=>{lecturas++;return lectura},guardar:async()=>{guardados++}})
  assert.equal(lecturas,1);assert.equal(guardados,1)
  await procesar([registro('otro')],{leerImagenes:async()=>{cancelada=true;return lectura},cancelada:()=>cancelada,guardar:async()=>{guardados++}})
  assert.equal(guardados,1)
 })
 await test('Dato principal pendiente activa una única relectura; un campo manual cero permanece intacto',async()=>{
  const mala={...a,rotacion_diaria_unidades:113,texto_ocr:texto.replace('1.60','113')}
  const r={...registro(),lectura_almacenada:{...mala,lectura_control:{principal:mala,control:mala}},lectura_guardada:{stock_local_unidades:0},verificacion_campos:{stock_local_unidades:{estado:'MANUAL_DECLARADO',valor:0}}}
  let lecturas=0
  await procesar([r],{leerImagenes:async()=>{lecturas++;return lectura},guardar:async(_,d)=>{assert.ok(!('stock_local_unidades' in d));assert.equal(d.verificacion_campos.stock_local_unidades.valor,0)}})
  assert.equal(lecturas,1)
 })
 await test('Otra fecha conserva datos/evidencia previos y registra una excepción que no se repite',async()=>{
  const r={...registro(),fecha:'2026-10-01',lectura_guardada:{rotacion_diaria_unidades:2},lectura_almacenada:lectura}
  await procesar([r],{guardar:async(reg,d)=>{assert.ok(!('rotacion_diaria_unidades' in d));assert.deepEqual(d.verificacion_campos,{});persistir(reg,d)}})
  assert.equal(r.lectura_guardada.rotacion_diaria_unidades,2);assert.equal(r.lectura_almacenada.lectura_control.principal.texto_ocr,texto)
  assert.equal(visitasSinProcesarCampo([r]).length,0);assert.match(excepcionesProcesamientoCampo([r])[0].mensaje,/fecha/)
 })
 await test('Errores de descarga o guardado son errores, no éxitos; los manuales no entran a la cola',async()=>{
  for(const extra of [{leerImagenes:async()=>{throw new Error('Descarga fallida')}},{guardar:async()=>{throw new Error('Sin permiso')}}]) {
   const r=registro(),resultados=await procesar([r],extra)
   assert.equal(resultados[0].estado,'ERROR');assert.equal(r.valores.rotacion,null);assert.equal(visitasSinProcesarCampo([r]).length,1)
  }
  assert.equal(visitasSinProcesarCampo([{...registro(),lector_estado:'RESPALDO_MANUAL'},{...registro(),lector_estado:'SIN_LECTOR'}]).length,0)
  assert.equal(visitasSinProcesarCampo([{...registro(),puede_procesar:false}]).length,0)
 })
 await test('Nueva visita guarda sus datos y marca de procesamiento en un solo RPC; una respuesta vacía no anuncia éxito',async()=>{
  const {supabase}=await server.ssrLoadModule('/src/lib/supabase.ts')
  const {guardarVisitaCampo}=await server.ssrLoadModule('/src/repositories/campoComercialRepository.ts')
  const anteriores={user:supabase.auth.getUser,from:supabase.from,rpc:supabase.rpc}
  let enviada,confirmacion='00000000-0000-0000-0000-000000000001'
  try {
   supabase.auth.getUser=async()=>({data:{user:{id:'autor'}},error:null})
   supabase.from=tabla=>{assert.equal(tabla,'app_profiles');return {select:()=>({eq:(c,v)=>{assert.equal(c,'user_id');assert.equal(v,'autor');return {single:async()=>({data:{nombre:'Mercaderista',rol:'MERCADERISTA'},error:null})}}})}}
   supabase.rpc=async(nombre,args)=>{assert.equal(nombre,'com_kpi_campo_guardar_visita');enviada=args.p_datos;return {data:confirmacion,error:null}}
   const datos={capturas_app:['original.png'],datos_ia:lectura,rotacion_diaria_unidades:1.6}
   assert.equal(await guardarVisitaCampo(datos),confirmacion)
   assert.equal(enviada.rotacion_diaria_unidades,1.6)
   assert.deepEqual(enviada.datos_ia.lectura_control.procesamiento_automatico.capturas,['original.png'])
   assert.equal(visitasSinProcesarCampo([{...registro(),lectura_almacenada:enviada.datos_ia}]).length,0)
   confirmacion=null
   await assert.rejects(()=>guardarVisitaCampo(datos),/no confirmó/)
  } finally {supabase.auth.getUser=anteriores.user;supabase.from=anteriores.from;supabase.rpc=anteriores.rpc}
 })
 if(process.env.CIBUSPAN_DIAGNOSTICO_COMPLETO) await test('Diagnóstico real de Granda Centeno se recupera solo desde la evidencia almacenada, sin JSON ni OCR adicionales',async()=>{
  const datos=JSON.parse(await readFile(process.env.CIBUSPAN_DIAGNOSTICO_COMPLETO,'utf8'))
  const fuente=datos.resultados.find(r=>r.id==='6b954b4e-697b-4247-bd96-3a6a484ae90e')
  const r={...registro(),lectura_almacenada:fuente.lectura};let guardados=0
  await procesar([r],{leerImagenes:async()=>{throw new Error('No debe releer imágenes')},guardar:async(reg,d)=>{guardados++;persistir(reg,d)}})
  assert.equal(guardados,1);assert.equal(r.valores.rotacion,1.6);assert.equal(visitasSinProcesarCampo([r]).length,0)
 })
} finally {await server.close()}
