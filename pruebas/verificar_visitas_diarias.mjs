import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
try {
 const {agruparVisitasDiariasCampo}=await server.ssrLoadModule('/src/utils/visitasDiariasCampo.ts')
 const {resumenDatosCampo,camposPendientesDatosCampo,resumenResultadosDatosCampo}=await server.ssrLoadModule('/src/utils/estadoDatosCampo.ts')
 const {CAMPOS_LECTURA_VALIDABLES}=await server.ssrLoadModule('/src/utils/validacionLecturasCampo.ts')
 const {puedeAbrirPantalla}=await server.ssrLoadModule('/src/utils/permisosAplicacion.ts')
 const registro=(i,cambios={})=>({id:'r'+i,fecha:'2026-10-14',visitado_en:'2026-10-14T14:00:00Z',actualizado_en:'2026-10-14T14:00:01Z',cliente_id:'c',local_id:'l',local_nombre:'SUPERMAXI GRANDA CENTENO',producto_id:'p'+i,producto_codigo:'sku'+i,registrado_por:'u',responsable_nombre:'Mercaderista',responsable_rol:'MERCADERISTA',capturas_app:['cabecera'+i+'.png','detalle'+i+'.png'],lectura_guardada:{...Object.fromEntries(CAMPOS_LECTURA_VALIDABLES.map(([c])=>[c,null])),rotacion_diaria_unidades:1.6},verificacion_campos:{...Object.fromEntries(CAMPOS_LECTURA_VALIDABLES.map(([c])=>[c,{estado:'SIN_DATO',valor:null}])),rotacion_diaria_unidades:{estado:'DOBLE_LECTURA',valor:1.6}},valores:{rotacion:1.6},...cambios})
 await test('Diez SKU y un ID repetido cuentan como un local visitado, diez SKU y veinte capturas',()=>{
  const registros=Array.from({length:10},(_,i)=>registro(i));registros.push(registros[0])
  const filas=agruparVisitasDiariasCampo(registros)
  assert.equal(filas.length,1);assert.equal(filas[0].skus,10);assert.equal(filas[0].capturas,20);assert.equal(filas[0].rotaciones,10)
  assert.equal(filas[0].responsables.length,1);assert.equal(filas[0].pendientes,0)
  assert.equal(resumenDatosCampo(registros).registros,10)
 })
 await test('KAM y mercaderista en un local/día son una fila con ambos responsables; filtros conservan sólo el responsable seleccionado',()=>{
  const a=registro(1),b=registro(2,{registrado_por:'kam',responsable_nombre:'KAM',responsable_rol:'KAM'})
  const juntos=agruparVisitasDiariasCampo([a,b]);assert.equal(juntos.length,1);assert.equal(juntos[0].responsables.length,2)
  const filtrado=agruparVisitasDiariasCampo([a,b],'kam');assert.equal(filtrado[0].skus,1);assert.equal(filtrado[0].responsables[0].nombre,'KAM')
  assert.equal(agruparVisitasDiariasCampo([a,b],'','otro-local').length,0)
 })
 await test('Fecha de visita, IDs de cliente/local y última lectura gobiernan la lista; pendientes no eliminan visitas',()=>{
  const a=registro(1),b=registro(2,{fecha:'2026-10-13'}),c=registro(3,{cliente_id:'otro'}),d=registro(4,{local_id:'otro'})
  assert.equal(agruparVisitasDiariasCampo([a,b,c,d]).length,4)
  const posterior=registro(5,{producto_id:a.producto_id,visitado_en:'2026-10-14T15:00:00Z',valores:{rotacion:null},lectura_guardada:{rotacion_diaria_unidades:null},verificacion_campos:{rotacion_diaria_unidades:{estado:'PENDIENTE',valor:null}}})
  const filas=agruparVisitasDiariasCampo([a,posterior]);assert.equal(filas.length,1);assert.equal(filas[0].skus,1);assert.equal(filas[0].rotaciones,0);assert.equal(filas[0].pendientes,1)
 })
 await test('Un pedido pendiente no oculta la rotación disponible ni presenta una captura como no subida',()=>{
  const r=registro(1);r.verificacion_campos.cantidad_ultimo_pedido={estado:'PENDIENTE',valor:null,motivo:'Sin fecha confirmada'}
  const s=resumenDatosCampo([r]);assert.equal(s.capturas,2);assert.equal(s.registrosConCapturas,1);assert.equal(s.rotacionesDisponibles,1);assert.equal(s.rotacionesPendientes,0);assert.equal(s.otrosPendientes,1)
  assert.equal(camposPendientesDatosCampo(r)[0].nombre,'Cantidad último pedido')
 })
 await test('Resumen de proceso divide completos, parciales y bloqueados sin sumar registros dos veces',()=>{
  const r=[...Array.from({length:230},()=>({estado:'COMPLETADA',mensaje:'Datos guardados. Excepciones: cantidad de pedido'})),...Array.from({length:21},()=>({estado:'COMPLETADA',mensaje:'Datos comprobados'})),{estado:'REVISAR',mensaje:'Otra fecha'},{estado:'ERROR',mensaje:'Sin permiso'},{estado:'SIN_CAMBIOS',mensaje:'Ya guardado'}]
  const s=resumenResultadosDatosCampo(r)
  assert.equal(s.completos,21);assert.equal(s.parciales,230);assert.equal(Object.values(s).reduce((a,b)=>a+b,0),254)
  assert.equal(resumenResultadosDatosCampo([{estado:'COMPLETADA',mensaje:'2 campos corregidos; 5 campos pendientes.'}]).parciales,1)
 })
 await test('Rotación pendiente y cero declarado se distinguen; ingreso manual sin imágenes sigue siendo una visita',()=>{
  const a=registro(1);a.verificacion_campos.rotacion_diaria_unidades={estado:'PENDIENTE',valor:1.6}
  const b=registro(2);b.lectura_guardada.rotacion_diaria_unidades=0;b.valores.rotacion=0;b.verificacion_campos.rotacion_diaria_unidades={estado:'MANUAL_DECLARADO',valor:0}
  const c=registro(3,{capturas_app:[],lector_estado:'SIN_LECTOR',lectura_guardada:{rotacion_diaria_unidades:2},valores:{rotacion:2},verificacion_campos:{}})
  const s=resumenDatosCampo([a,b,c]);assert.equal(s.rotacionesDisponibles,2);assert.equal(s.rotacionesPendientes,1);assert.equal(s.registrosConCapturas,2)
  assert.equal(agruparVisitasDiariasCampo([a,b,c])[0].skus,3)
 })
 await test('No inventa nombres de responsables antiguos y conserva el permiso Campo comercial en ambas rutas',()=>{
  const r=registro(1,{responsable_nombre:null});assert.equal(agruparVisitasDiariasCampo([r])[0].responsables[0].nombre,'Sin nombre registrado')
  for(const ruta of ['Comercial · Visitas diarias','Visitas diarias']){
   assert.equal(puedeAbrirPantalla(ruta,'MERCADERISTA',['Campo comercial']),true)
   assert.equal(puedeAbrirPantalla(ruta,'MERCADERISTA',[]),false)
  }
 })
}finally{await server.close()}
