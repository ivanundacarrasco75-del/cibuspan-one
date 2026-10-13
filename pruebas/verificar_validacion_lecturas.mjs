import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
try {
 const {interpretarReporteFavorita}=await server.ssrLoadModule('/src/utils/ocrFavorita.ts')
 const {verificarDosLecturasCampo,combinarLecturaValidadaCampo,VERSION_VALIDACION_CAMPO}=await server.ssrLoadModule('/src/utils/validacionLecturasCampo.ts')
 const {prepararAuditoriaCapturaCampo}=await server.ssrLoadModule('/src/utils/recuperacionCapturasCampo.ts')
 const {resumirSemanasCampo,semanasDashboardCampo}=await server.ssrLoadModule('/src/utils/dashboardVisitasRotacion.ts')
 const texto='Local SUPERMAXI AMERICA\nCódigo de barras 7868304262189\nVenta promedio diaria (Cant): 1.13\nExistencia en local 10\nDías inventario local 8.85\nPrecio comercio 2.22\nPrecio afiliado 1.96\nCantidad pedido -'
 const a=interpretarReporteFavorita(texto,.9), b=interpretarReporteFavorita(texto,.92)
 const r={id:'r',fecha:'2026-10-12',local_id:'l',producto_id:'p',cliente_id:'c',producto_codigo:a.codigo_barras,producto_nombre:'pan',local_nombre:a.local_nombre,visitado_en:'2026-10-12T12:00:00',actualizado_en:'token',lectura_guardada:{rotacion_diaria_unidades:115,stock_local_unidades:14,cantidad_ultimo_pedido:2026},valores:{rotacion:115,stock:14,caras:2}}
 const lectura={...a,verificacion_campos:verificarDosLecturasCampo(a,b),lectura_control:{principal:a,control:b},version_validacion:VERSION_VALIDACION_CAMPO}
 await test('Las coincidencias conservan decimales y cero; un desacuerdo afecta únicamente su campo',()=>{
  const c={...b,precio_comercio:222,stock_cd_cajas:0},d={...a,stock_cd_cajas:0}
  const v=verificarDosLecturasCampo(d,c)
  assert.equal(v.rotacion_diaria_unidades.estado,'DOBLE_LECTURA');assert.equal(v.rotacion_diaria_unidades.valor,1.13)
  assert.equal(v.precio_comercio.estado,'PENDIENTE');assert.equal(v.stock_cd_cajas.estado,'DOBLE_LECTURA');assert.equal(v.stock_cd_cajas.valor,0)
 })
 await test('Ni dos lecturas iguales permiten rotación incoherente ni inventan un decimal',()=>{
  const v=verificarDosLecturasCampo({...a,rotacion_diaria_unidades:113},{...b,rotacion_diaria_unidades:113})
  assert.equal(v.rotacion_diaria_unidades.estado,'PENDIENTE');assert.equal(v.rotacion_diaria_unidades.valor,113)
  assert.equal(v.precio_comercio.estado,'DOBLE_LECTURA')
  assert.equal(verificarDosLecturasCampo({...a,rotacion_diaria_unidades:0},{...b,rotacion_diaria_unidades:0}).rotacion_diaria_unidades.estado,'PENDIENTE')
 })
 await test('Audita columnas ya llenas, quita año tomado como cantidad y preserva declaraciones manuales',()=>{
  const datos=prepararAuditoriaCapturaCampo(r,lectura,[{id:'l',nombre:a.local_nombre}])
  assert.equal(datos.rotacion_diaria_unidades,1.13);assert.equal(datos.stock_local_unidades,10);assert.deepEqual(datos.campos_borrar,['cantidad_ultimo_pedido'])
  const manual={...r,verificacion_campos:{stock_local_unidades:{estado:'MANUAL_DECLARADO',valor:14}}}
  assert.equal('stock_local_unidades' in prepararAuditoriaCapturaCampo(manual,lectura,[{id:'l',nombre:a.local_nombre}]),false)
  assert.equal(r.lectura_guardada.rotacion_diaria_unidades,115)
 })
 await test('Nuevo ingreso llena comprobados, conserva cero declarado y deja discrepancias vacías',()=>{
  const entrada={...lectura,verificacion_campos:{...lectura.verificacion_campos,precio_comercio:{estado:'PENDIENTE',valor:2.22}}}
  const actual={...a,stock_local_unidades:0,verificacion_campos:{stock_local_unidades:{estado:'MANUAL_DECLARADO',valor:0}}}
  const c=combinarLecturaValidadaCampo(actual,entrada)
  assert.equal(c.rotacion_diaria_unidades,1.13);assert.equal(c.precio_comercio,null);assert.equal(c.stock_local_unidades,0)
 })
 await test('Última visita pendiente no arrastra dato validado anterior; caras manuales permanecen',()=>{
  const viejo={...r,id:'viejo',visitado_en:'2026-10-12T09:00:00',lectura_guardada:{rotacion_diaria_unidades:1.13},valores:{...r.valores,rotacion:1.13},verificacion_campos:{rotacion_diaria_unidades:{estado:'DOBLE_LECTURA',valor:1.13}}}
  const args={registros:[viejo,r],productos:[{id:'p',codigo:'sku',nombre:'pan'}],semanas:semanasDashboardCampo('2026-10-12'),indicador:'rotacion',soloValidados:true}
  assert.equal(resumirSemanasCampo(args)[0].semanas[4].valor,null)
  assert.equal(resumirSemanasCampo({...args,soloValidados:false})[0].semanas[4].valor,115)
  assert.equal(resumirSemanasCampo({...args,indicador:'caras'})[0].semanas[4].valor,2)
  const falso={...r,verificacion_campos:{rotacion_diaria_unidades:{estado:'DOBLE_LECTURA',valor:1.13}}}
  assert.equal(resumirSemanasCampo({...args,registros:[falso]})[0].semanas[4].valor,null)
 })
 await test('Captura de otro local, SKU o fecha no se aplica a la visita',()=>{
  for(const cambio of [{local_nombre:'SUPERMAXI OTRO'},{codigo_barras:'7868304262196'},{fecha_fuente:'2026-10-01T12:00:00'}]) assert.throws(()=>prepararAuditoriaCapturaCampo(r,{...lectura,...cambio},[{id:'l',nombre:a.local_nombre}]))
 })
} finally {await server.close()}
