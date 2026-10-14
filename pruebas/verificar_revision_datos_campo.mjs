import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
try {
 const {prepararRevisionDatoCampo,pendientesRevisionCampo}=await server.ssrLoadModule('/src/utils/revisionDatosCampo.ts')
 const {regionesCampoDesdeLineas}=await server.ssrLoadModule('/src/utils/recorteCampoImagen.ts')
 const {visitasSinProcesarCampo}=await server.ssrLoadModule('/src/utils/procesamientoAutomaticoCampo.ts')
 const {resumirSemanasCampo,semanasDashboardCampo}=await server.ssrLoadModule('/src/utils/dashboardVisitasRotacion.ts')
 const {camposPendientesDatosCampo}=await server.ssrLoadModule('/src/utils/estadoDatosCampo.ts')
 const r={id:'r',fecha:'2026-10-14',cliente_id:'c',local_id:'l',local_nombre:'Local',producto_id:'p',producto_nombre:'Pan',producto_codigo:'sku',visitado_en:'2026-10-14T12:00:00Z',capturas_app:['original.png'],lectura_guardada:{rotacion_diaria_unidades:1.2,precio_comercio:2},verificacion_campos:{rotacion_diaria_unidades:{estado:'PENDIENTE',valor:1.2},precio_comercio:{estado:'DOBLE_LECTURA',valor:2}},lectura_almacenada:{lectura_control:{principal:{rotacion_diaria_unidades:1.2},control:{rotacion_diaria_unidades:12}}},valores:{rotacion:1.2}}
 await test('Confirmar el mismo valor guarda sólo su certificado y preserva evidencia; no vuelve a procesarse',()=>{
  const d=prepararRevisionDatoCampo(r,'rotacion_diaria_unidades',1.2)
  assert.equal('rotacion_diaria_unidades' in d,false)
  assert.deepEqual(Object.keys(d.verificacion_campos),['rotacion_diaria_unidades'])
  assert.equal(d.lectura_control.control.rotacion_diaria_unidades,12)
  const revisado={...r,verificacion_campos:{...r.verificacion_campos,...d.verificacion_campos},lectura_almacenada:{...r.lectura_almacenada,lectura_control:d.lectura_control}}
  assert.equal(pendientesRevisionCampo([revisado]).some(p=>p.campo==='rotacion_diaria_unidades'),false)
  assert.equal(visitasSinProcesarCampo([revisado]).length,0)
  revisado.lectura_almacenada.lectura_control.procesamiento_automatico.version='version-antigua'
  assert.equal(visitasSinProcesarCampo([revisado]).length,0)
 })
 await test('Cantidad CD antigua no genera revisión; nuevas lecturas y cambios no la incluyen',async()=>{
  const {CAMPOS_CANTIDADES_CAMPO}=await server.ssrLoadModule('/src/utils/lecturaCapturasCampo.ts')
  const {interpretarReporteFavorita}=await server.ssrLoadModule('/src/utils/ocrFavorita.ts')
  assert.equal(CAMPOS_CANTIDADES_CAMPO.some(([c])=>c==='stock_cd_cajas'),false)
  assert.equal(pendientesRevisionCampo([{...r,lectura_guardada:{...r.lectura_guardada,stock_cd_cajas:999},verificacion_campos:{...r.verificacion_campos,stock_cd_cajas:{estado:'PENDIENTE',valor:999}}}]).some(p=>p.campo==='stock_cd_cajas'),false)
  const lectura=interpretarReporteFavorita('Existencia en CD 13 cajas de 5\nExistencia en local 7',.9)
  assert.equal(lectura.stock_cd_cajas,null);assert.equal(lectura.stock_local_unidades,7)
  assert.throws(()=>prepararRevisionDatoCampo(r,'stock_cd_cajas',5))
 })
 await test('Rosado/Santamaría manual no pide imagen ni revisión; OCR Favorita conserva pendientes',async()=>{
  const {valorIndicadorValidadoCampo}=await server.ssrLoadModule('/src/utils/dashboardVisitasRotacion.ts')
  for(const lector_estado of ['SIN_LECTOR','RESPALDO_MANUAL',null]) {
   const manual={...r,capturas_app:[],lector_estado,lectura_almacenada:undefined}
   assert.deepEqual(pendientesRevisionCampo([manual]),[])
   assert.equal(valorIndicadorValidadoCampo(manual,'rotacion'),1.2)
  }
  const fotoManual={...r,lector_estado:'RESPALDO_MANUAL'}
  assert.deepEqual(pendientesRevisionCampo([fotoManual]),[])
  assert.equal(pendientesRevisionCampo([r]).some(p=>p.campo==='rotacion_diaria_unidades'),true)
  assert.equal(valorIndicadorValidadoCampo(r,'rotacion'),null)
 })
 await test('Fotos cargadas en capturas de Rosado/Santamaría no crean pendientes OCR',async()=>{
  const {clienteCapturasFavoritaCampo}=await server.ssrLoadModule('/src/utils/validacionLecturasCampo.ts')
  for(const cliente_nombre of ['CORPORACION EL ROSADO','MEGA SANTAMARÍA','SANTA MARIA']) assert.deepEqual(pendientesRevisionCampo([{...r,cliente_nombre}]),[])
  assert.equal(clienteCapturasFavoritaCampo('CORPORACION FAVORITA'),true)
  assert.equal(clienteCapturasFavoritaCampo('CORPORACION EL ROSADO'),false)
  assert.equal(pendientesRevisionCampo([{...r,cliente_nombre:'CORPORACION FAVORITA'}]).some(p=>p.campo==='rotacion_diaria_unidades'),true)
 })
 await test('Corregir cero o declarar ausencia no borra otro campo; rechaza formatos inválidos',()=>{
  assert.equal(prepararRevisionDatoCampo(r,'rotacion_diaria_unidades',0).rotacion_diaria_unidades,0)
  assert.deepEqual(prepararRevisionDatoCampo(r,'rotacion_diaria_unidades',null).campos_borrar,['rotacion_diaria_unidades'])
  for(const [campo,valor] of [['precio_comercio',NaN],['precio_comercio',-1],['fecha_ultimo_pedido','2026-02-31'],['caras_percha',2]]) assert.throws(()=>prepararRevisionDatoCampo(r,campo,valor))
 })
 await test('Gráfico conserva provisional y enlaza sólo último registro semanal del SKU',()=>{
  const viejo={...r,id:'viejo',visitado_en:'2026-10-13T12:00:00Z'}
  const s=resumirSemanasCampo({registros:[viejo,r],productos:[{id:'p',codigo:'sku',nombre:'Pan'}],semanas:semanasDashboardCampo(r.fecha),indicador:'rotacion',soloValidados:false,camposPendientes:camposPendientesDatosCampo})[0]
  assert.equal(s.semanas[4].valor,1.2)
  assert.equal(s.semanas[4].pendientes.every(p=>p.registroId==='r'),true)
  assert.equal(s.semanas[4].pendientes.some(p=>p.campo==='precio_comercio'),false)
 })
 await test('Recorte localiza etiqueta y valor siguiente, respeta límites y no inventa campo ausente',()=>{
  const lineas=[{text:'Venta promedio diaria (Cant)',bbox:{x0:10,y0:4,x1:200,y1:18}},{text:'1.20',bbox:{x0:10,y0:20,x1:40,y1:35}}]
  const regiones=regionesCampoDesdeLineas(lineas,300,40)
  assert.deepEqual(regiones.rotacion_diaria_unidades,{left:0,top:0,width:300,height:40})
  assert.equal(regiones.precio_comercio,undefined)
 })
} finally {await server.close()}
