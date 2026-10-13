import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
const { interpretarReporteFavorita } = await server.ssrLoadModule('/src/utils/ocrFavorita.ts')
const {detectarAreaReporteFavorita}=await server.ssrLoadModule('/src/utils/areaReporteFavorita.ts')
const { prepararRecuperacionAutomaticaCampo, recuperarCapturasPendientesCampo, capturasPendientesCampo } = await server.ssrLoadModule('/src/utils/recuperacionCapturasCampo.ts')
const texto = `Local: SUPERMAXI PLAZA NORTE
Código de barras: 7868304262189
Precio comercio: 2,30
Precio afiliado 2.20
Venta promedio diaria (Cant.) 1,25
Venta promedio diaria (Valor): 2,87
Predicción de ventas futuras (Cant.): 15
Participación CLA (%) 4,5
Participación SCLA (%) : 8,5
Existencia en local: 7
Días de inventario local: 5,6
Existencia en CD: 10 cajas de 12
Días de inventario CD: 8
Cantidad pedido: 12
Cantidad despacho: 6`
const locales=[{id:'l1',nombre:'SUPERMAXI PLAZA NORTE',codigo:'1'}]
const registro=(id='r1',extra={})=>({id,local_id:'l1',local_nombre:locales[0].nombre,producto_codigo:'7868304262189',producto_nombre:'INTEGRAL',fecha:'2026-10-12',actualizado_en:'token-inicial',capturas_app:['captura'],lectura_guardada:{stock_local_unidades:0},...extra})
const lectura=()=>interpretarReporteFavorita(texto,.92)

try {
 await test('Reconoce el formato real de EnPercha: logotipo, categorías y etiquetas partidas',()=>{
  const r=interpretarReporteFavorita(`E LOCAL: SUPERMAXI AMERICA
CÓDIGO DE BARRAS: 7868304262189
PAN INTEGRAL GDE PANGOLIN.
PREDICCIÓN DE VENTAS FUTURAS 0.00
(CANT.):
PARTICIPACIÓN CLA. PAN INTEGRAL 1.34 %
PRECORTADO
PARTICIPACIÓN SCLA. INTEGRALES 2.40 %
DÍAS DE INVENTARIO LOCAL: 14.22080s
FECHA ULT. PEDIDO: -
CANTIDAD DEL PEDIDO: -
FECHA ULT. DESPACHO: 2026-09-21`,.9)
  assert.equal(r.local_nombre,'SUPERMAXI AMERICA');assert.equal(r.prediccion_venta_unidades,0)
  assert.equal(r.participacion_clase,1.34);assert.equal(r.participacion_subclase,2.4)
  assert.equal(r.dias_inventario_local,null);assert.equal(r.fecha_ultimo_pedido,null);assert.equal(r.fecha_ultimo_despacho,'2026-09-21')
  assert.equal(interpretarReporteFavorita('EXISTENCIA EN LOCAL: 9',.9).local_nombre,null)
  assert.equal(interpretarReporteFavorita('S LOCAL: SUPERMAXI AMERICA',.9).local_nombre,'SUPERMAXI AMERICA')
  assert.equal(interpretarReporteFavorita('PARTICIPACIÓN SCLA. INTEGRALES 240 %',.9).participacion_subclase,null)
 })
 await test('Delimita el reporte por las barras de EnPercha y conserva imágenes sin ese formato',()=>{
  const w=300,h=700,px=new Uint8Array(w*h*4).fill(255)
  for(let y=0;y<h;y++)if(y<80 || y>=600 && y<650)for(let x=0;x<w;x++)px.set([0,170,230,255],(y*w+x)*4)
  const a=detectarAreaReporteFavorita(w,h,px)
  assert.ok(a);assert.equal(a.top,82);assert.equal(a.top+a.height,600);assert.ok(a.left>0);assert.ok(a.left+a.width<w)
  assert.equal(detectarAreaReporteFavorita(w,h,new Uint8Array(w*h*4).fill(255)),null)
  assert.equal(detectarAreaReporteFavorita(700,300,px),null)
 })
 await test('Lee cantidades sin dos puntos, sin arrastrar etiquetas y manteniendo decimales',()=>{
  const r=lectura()
  assert.equal(r.rotacion_diaria_unidades,1.25);assert.equal(r.venta_diaria_valor,2.87)
  assert.equal(r.precio_comercio,2.3);assert.equal(r.precio_afiliado,2.2)
  assert.equal(r.prediccion_venta_unidades,15);assert.equal(r.participacion_clase,4.5);assert.equal(r.participacion_subclase,8.5)
  assert.equal(r.stock_local_unidades,7);assert.equal(r.stock_cd_cajas,10);assert.equal(r.unidades_por_caja,12)
 })
 await test('Campo vacío no toma precio, fecha o cantidad de otro campo; no convierte negativos en positivos',()=>{
  const r=interpretarReporteFavorita('Venta promedio diaria (Cant.):\nPrecio comercio: 2,30\nExistencia en local: -7\nPrecio afiliado: N/D\nCantidad pedido: 12',.9)
  assert.equal(r.rotacion_diaria_unidades,null);assert.equal(r.precio_afiliado,null);assert.equal(r.stock_local_unidades,-7)
  assert.equal(interpretarReporteFavorita('Precio comercio: 1,234.56',.9).precio_comercio,null)
 })
 await test('Capturas contradictorias no se recuperan automáticamente; repetir datos iguales sí se permite',()=>{
  const r=interpretarReporteFavorita(texto+'\nExistencia en local: 9',.9)
  assert.equal(r.stock_local_unidades,null);assert.throws(()=>prepararRecuperacionAutomaticaCampo(registro(),r,locales),/contradictorias/)
  assert.equal(interpretarReporteFavorita(texto+'\nExistencia en local: 7',.9).stock_local_unidades,7)
  assert.equal(interpretarReporteFavorita(texto+'\nCódigo de barras: 7868304262196',.9).codigo_barras,null)
  assert.equal(interpretarReporteFavorita(texto+'\nLocal: SUPERMAXI OTRO LOCAL',.9).local_nombre,null)
 })
 await test('Completa solo vacíos, conserva cero manual y acepta nuevas cantidades cero',()=>{
  const original=registro(),r=lectura();r.precio_afiliado=0
  const patch=prepararRecuperacionAutomaticaCampo(original,r,locales)
  assert.equal('stock_local_unidades' in patch,false);assert.equal(patch.rotacion_diaria_unidades,1.25);assert.equal(patch.precio_afiliado,0)
  assert.equal('caras_percha' in patch,false);assert.equal('fecha_visita' in patch,false)
  assert.equal(original.lectura_guardada.stock_local_unidades,0)
 })
 await test('Exige calidad, SKU y local verificables; rechaza números inválidos',()=>{
  for(const datos of [{confianza:.6},{codigo_barras:null},{codigo_barras:'7868304262196'},{local_nombre:null},{local_nombre:'SUPERMAXI OTRO'}, {precio_comercio:-1},{participacion_clase:150},{cantidad_ultimo_pedido:1.5}]){
   assert.throws(()=>prepararRecuperacionAutomaticaCampo(registro(),{...lectura(),...datos},locales))
  }
  const r=lectura();const previo={...r};delete previo.texto_ocr
  assert.equal(prepararRecuperacionAutomaticaCampo(registro('r',{lectura_guardada:previo}),r,locales),null)
  assert.ok(prepararRecuperacionAutomaticaCampo(registro('r',{producto_codigo:'7868304262189T'}),r,locales))
 })
 await test('Procesa una sola vez cada ID, secuencialmente; continúa tras un error y no guarda lecturas dudosas',async()=>{
  const filas=[registro('r1'),registro('r1'),registro('r2'),registro('r3'),registro('r4')], escritos=[],orden=[],actualizaciones=[]
  const r=await recuperarCapturasPendientesCampo({registros:filas,locales,cancelada:()=>false,progreso:()=>{},resultado:r=>actualizaciones.push(r),
   leer:async(r)=>{orden.push('leer '+r.id);return {...lectura(),confianza:r.id==='r3'?.5:.9}},
   guardar:async(r,datos)=>{assert.equal(r.actualizado_en,'token-inicial');assert.equal('stock_local_unidades' in datos,false);orden.push('guardar '+r.id);if(r.id==='r2')throw new Error('Token obsoleto');escritos.push(r.id)},
  })
  assert.deepEqual(escritos,['r1','r4']);assert.deepEqual(r.map(r=>r.estado),['COMPLETADA','ERROR','REVISAR','COMPLETADA'])
  assert.equal(r[2].lectura.confianza,.5);assert.equal(r[2].lectura.texto_ocr,texto)
  assert.deepEqual(orden,['leer r1','guardar r1','leer r2','guardar r2','leer r3','leer r4','guardar r4']);assert.equal(actualizaciones.length,4)
 })
 await test('Cancelar durante OCR impide guardar ese registro y continuar; los previos se conservan',async()=>{
  let detener=false;const escritos=[]
  const r=await recuperarCapturasPendientesCampo({registros:[registro('r1'),registro('r2'),registro('r3')],locales,cancelada:()=>detener,progreso:()=>{},resultado:()=>{},
   leer:async(r)=>{if(r.id==='r2')detener=true;return lectura()},guardar:async(r)=>{escritos.push(r.id)},
  })
  assert.deepEqual(escritos,['r1']);assert.equal(r.length,1)
 })
 await test('Una segunda ejecución no escribe ni duplica los registros completados; respeta imágenes solo de respaldo',async()=>{
  const r=lectura(),fila=registro('r1',{lectura_guardada:{...r}});let guardados=0
  const respuesta=await recuperarCapturasPendientesCampo({registros:[fila],locales,cancelada:()=>false,progreso:()=>{},resultado:()=>{},leer:async()=>r,guardar:async()=>{guardados++}})
  assert.equal(guardados,0);assert.equal(respuesta[0].estado,'SIN_CAMBIOS')
  assert.equal(capturasPendientesCampo([registro('r2',{lector_estado:'RESPALDO_MANUAL'}),registro('r3',{capturas_app:[]}),fila]).length,0)
 })
} finally { await server.close() }
