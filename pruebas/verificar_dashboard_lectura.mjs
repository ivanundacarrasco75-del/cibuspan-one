import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
// Solo respuestas de prueba: ninguna solicitud llega a Supabase real.
process.env.VITE_SUPABASE_URL='https://dashboard-prueba.invalid'
process.env.VITE_SUPABASE_ANON_KEY='clave-publica-de-prueba'
const solicitudes=[]
let administrador=true
const filas=Array.from({length:702},(_,i)=>({
 id:`d${String(i).padStart(4,'0')}`,producto_id:'p1',actualizado_en:'2026-10-12T12:00:00Z',
 datos_ia:{caras_percha:i===0?0:2,responsable_id:'u1',responsable_rol:'MERCADERISTA',responsable_nombre:'Ana'},
 stock_local_unidades:i===0?'0':'10',rotacion_diaria_unidades:i===0?null:'1.25',dias_inventario_local:'8',
 precio_comercio:'1.6',precio_afiliado:null,venta_diaria_valor:'2',prediccion_venta_unidades:null,
 stock_cd_cajas:'12',dias_inventario_cd:'4',codificado_app:true,presencia_percha:i===0?'NO_REVISADO':'PRESENTE',
 producto:{nombre:'INTEGRAL',codigo:'EAN'},
 visita:{id:'visita'+i,fecha_visita:'2026-10-12',visitado_en:'2026-10-12T12:00:00Z',registrado_por:'u1',cliente_id:'c1',local_monitoreado_id:'l1',local:{nombre:'Local 1'}},
}))
filas[2].datos_ia.responsable_id='autor-distinto'
filas[1].datos_ia.lectura_control={principal:{texto_ocr:'original',confianza:.9},control:{texto_ocr:'control',confianza:.9}}
const originalFetch=globalThis.fetch
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(input)),nombre=u.pathname.split('/').at(-1)
 solicitudes.push(u)
 if(nombre==='com_kpi_campo_catalogo')return new Response(JSON.stringify({puede_administrar:administrador,clientes:[{id:'c1',nombre:'Cliente'}],locales:[{id:'l1',nombre:'Local 1',codigo:'1'}],productos:[{id:'p1',nombre:'INTEGRAL',codigo:'EAN'}]}),{headers:{'Content-Type':'application/json'}})
 if(nombre==='com_visitas_campo_sku'){
  const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||500)
  assert.equal(u.searchParams.get('visita.cliente_id'),'eq.c1')
  assert.equal(u.searchParams.get('visita.estado'),'eq.CONFIRMADA')
  assert.ok(u.searchParams.getAll('visita.fecha_visita').includes('gte.2026-09-14'))
  assert.ok(u.searchParams.getAll('visita.fecha_visita').includes('lte.2026-10-12'))
  return new Response(JSON.stringify(filas.slice(offset,offset+limit)),{headers:{'Content-Type':'application/json'}})
 }
 throw new Error('Solicitud inesperada: '+u.pathname)
}
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
try{
 const {obtenerDashboardVisitasRotacion}=await server.ssrLoadModule('/src/repositories/dashboardVisitasRotacionRepository.ts')
 const r=await obtenerDashboardVisitasRotacion('c1','2026-09-14','2026-10-12')
 assert.equal(r.registros.length,702)
 assert.equal(solicitudes.filter(u=>u.pathname.endsWith('com_visitas_campo_sku')).length,2)
 assert.equal(r.registros[0].valores.stock,0);assert.equal(r.registros[0].valores.caras,0);assert.equal(r.registros[0].valores.rotacion,null)
 assert.equal(r.registros[0].valores.presencia,null);assert.equal(r.registros[0].valores.quiebres,100)
 assert.equal(r.registros[1].valores.rotacion,1.25);assert.equal(r.registros[1].responsable_rol,'MERCADERISTA')
 assert.equal(r.registros[1].lectura_almacenada.lectura_control.principal.texto_ocr,'original')
 assert.equal(r.registros[1].puede_procesar,true);assert.equal(r.registros[1].registrado_por,'u1')
 assert.equal(r.registros[1].visita_id,'visita1');assert.equal(r.registros[1].responsable_nombre,'Ana');assert.equal(r.registros[2].responsable_nombre,null)
 assert.equal(r.registros[2].responsable_rol,null)
 console.log('Lectura verificada con 702 filas: paginación, cliente, visitas confirmadas, ceros, nulos y caras.')
 const {supabase}=await server.ssrLoadModule('/src/lib/supabase.ts'),getUser=supabase.auth.getUser
 try {
  administrador=false;filas[2].visita.registrado_por='u2'
  supabase.auth.getUser=async()=>({data:{user:{id:'u1'}},error:null})
  const propios=await obtenerDashboardVisitasRotacion('c1','2026-09-14','2026-10-12')
  assert.equal(propios.registros[1].puede_procesar,true);assert.equal(propios.registros[2].puede_procesar,false)
 } finally {supabase.auth.getUser=getUser}
 globalThis.fetch=async()=>new Response(JSON.stringify({message:'Sin permiso de lectura',code:'42501'}),{status:403,headers:{'Content-Type':'application/json'}})
 await assert.rejects(()=>obtenerDashboardVisitasRotacion('c1','2026-09-14','2026-10-12'),/Sin permiso/)
 console.log('El error de permisos se muestra como error; no se convierte en un tablero de ceros.')
}finally{globalThis.fetch=originalFetch;await server.close()}
