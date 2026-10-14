// Ejecución explícita con imágenes reales; nunca conecta a Supabase ni guarda visitas.
// node pruebas/verificar_ocr_favorita_real.mjs CABECERA.jpeg PARTE_INFERIOR.jpeg
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,copyFileSync,existsSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {execFileSync} from 'node:child_process'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'

const paths=process.argv.slice(2)
if(paths.length!==2)throw new Error('Indica las dos capturas reales de Integral/Supermaxi América para esta prueba.')
const root=fileURLToPath(new URL('..',import.meta.url)), anterior=process.cwd(), cache=mkdtempSync(join(tmpdir(),'cibuspan-ocr-'))
const cacheAnterior=process.env.CIBUSPAN_OCR_CACHE
if(cacheAnterior && existsSync(join(cacheAnterior,'spa.traineddata')))copyFileSync(join(cacheAnterior,'spa.traineddata'),join(cache,'spa.traineddata'))
process.chdir(cache)
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'})
try{
 const {leerCapturasFavoritaOcr}=await server.ssrLoadModule('/src/utils/ocrFavorita.ts')
 const {detectarAreaReporteFavorita}=await server.ssrLoadModule('/src/utils/areaReporteFavorita.ts')
 const {prepararRecuperacionAutomaticaCampo}=await server.ssrLoadModule('/src/utils/recuperacionCapturasCampo.ts')
 const archivos=paths.map(p=>readFileSync(p)),areas=new Map()
 for(const [i,p] of paths.entries()){
  const rgba=execFileSync('python',['-c','from PIL import Image;import sys,struct;i=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",i.width,i.height)+i.tobytes())',p],{maxBuffer:20*1024*1024})
  const area=detectarAreaReporteFavorita(rgba.readUInt32LE(0),rgba.readUInt32LE(4),rgba.subarray(8))
  assert.ok(area,'Se identifica el cuerpo de EnPercha en cada imagen');areas.set(archivos[i],area)
 }
 const r=await leerCapturasFavoritaOcr(archivos,undefined,async(a)=>areas.get(a))
 assert.equal(r.local_nombre,'SUPERMAXI AMERICA');assert.equal(r.codigo_barras,'7868304262189')
 const esperados={precio_comercio:2.53,precio_afiliado:2.14,rotacion_diaria_unidades:.63,venta_diaria_valor:1.36,prediccion_venta_unidades:0,participacion_clase:1.34,participacion_subclase:2.4,stock_local_unidades:9,dias_inventario_local:14.22,stock_cd_cajas:null,unidades_por_caja:5,dias_inventario_cd:0,cantidad_ultimo_pedido:null,cantidad_ultimo_despacho:5}
 for(const [campo,v] of Object.entries(esperados)){assert.equal(r[campo],v,campo);if(v!==null)assert.equal(r.verificacion_campos[campo].estado,'DOBLE_LECTURA',campo+' debe pasar el control')}
 assert.equal(r.verificacion_campos.fecha_ultimo_despacho.estado,'DOBLE_LECTURA')
 assert.equal(r.fecha_ultimo_pedido,null);assert.equal(r.fecha_ultimo_despacho,'2026-09-21')
 assert.equal(r.fecha_fuente,'2026-09-21T17:08:51')
 const datos=prepararRecuperacionAutomaticaCampo({local_id:'america',producto_codigo:'7868304262189',lectura_guardada:{stock_local_unidades:0}},r,[{id:'america',nombre:'SUPERMAXI AMERICA',codigo:'1'}])
 assert.equal('stock_local_unidades' in datos,false);assert.equal(datos.rotacion_diaria_unidades,.63)
 console.log(JSON.stringify({confianza:r.confianza,local:r.local_nombre,sku:r.codigo_barras,...esperados,fecha_ultimo_despacho:r.fecha_ultimo_despacho,campos_para_recuperar:Object.keys(datos).length-3,texto_ocr:r.texto_ocr},null,2))
 console.log('OCR real verificado: dos capturas, identidad, 14 cantidades/ausencias y conservación del stock manual.')
}finally{await server.close();process.chdir(anterior);rmSync(cache,{recursive:true,force:true})}
