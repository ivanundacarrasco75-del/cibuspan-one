import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const fuente=(await readFile(new URL('../supabase/functions/descuentos-correo/index.ts',import.meta.url),'utf8')).replace(/^import .*$/gm,'')
const js=ts.transpileModule(fuente,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.None}}).outputText
function sistema({configurado=true,autorizado=true,fallaProveedor=false,smtp=false,fallaAutenticacion=false}={}){
 const fila={id:'correo-1',lote_id:'00000000-0000-0000-0000-000000000001',email:'ventas@example.invalid',contenido:{},estado:'PENDIENTE',primer_intento:null,actualizado_en:'2026-10-22T12:00:00Z'}
 let handler,envios=0
 const cliente={auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},rpc:async()=>({error:autorizado?null:{message:'sin permiso'}}),from:()=>{
  const filtros=[],q={actualizacion:null,select(){return q},eq(k,v){filtros.push(r=>r[k]===v);return q},neq(k,v){filtros.push(r=>r[k]!==v);return q},update(v){q.actualizacion=v;return q},maybeSingle(){return q.then(r=>({...r,data:r.data?.[0]??null}))},then(resolve,reject){return Promise.resolve().then(()=>{const coincide=filtros.every(f=>f(fila));if(coincide&&q.actualizacion)Object.assign(fila,q.actualizacion);return {data:coincide?[{...fila}]:[],error:null}}).then(resolve,reject)}};return q
 }}
 const env={SUPABASE_URL:'https://no-real.invalid',SUPABASE_ANON_KEY:'mock',SUPABASE_SERVICE_ROLE_KEY:'mock',...(configurado?{RESEND_API_KEY:'mock',DESCUENTOS_EMAIL_FROM:'no-real@example.invalid',...(smtp?{SMTP_HOST:'mail.cibuspan.com',SMTP_PORT:'465',SMTP_USER:'papolo@cibuspan.com',SMTP_PASSWORD:'clave-ficticia'}:{})}:{})}
 new Function('createClient','mensajeDescuento','Deno','fetch','nodemailer',js)(()=>cliente,()=>({subject:'Aviso',text:'Contenido'}),{env:{get:k=>env[k]},serve:f=>handler=f},async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');envios++;assert.equal(options.headers['Idempotency-Key'],'descuento/correo-1');if(fallaProveedor)throw Error('red');return new Response(JSON.stringify({id:'proveedor-1'}))},{createTransport:opciones=>{assert.equal(opciones.secure,true);assert.equal(opciones.port,465);assert.equal(opciones.host,'mail.cibuspan.com');return {verify:async()=>{if(fallaAutenticacion)throw Error('auth')},sendMail:async mensaje=>{envios++;assert.equal(mensaje.to[0],fila.email);if(fallaProveedor)throw Error('conexión cortada');return {accepted:[fila.email],messageId:mensaje.messageId}}}}})
 const enviar=()=>handler(new Request('https://local.invalid',{method:'POST',headers:{Authorization:'Bearer mock','Content-Type':'application/json'},body:JSON.stringify({lote_id:fila.lote_id})}))
 return {fila,enviar,envios:()=>envios}
}
test('Sin servicio o permiso no contacta al proveedor y conserva pendiente',async()=>{
 for(const opciones of [{configurado:false},{autorizado:false}]){const s=sistema(opciones);assert.ok((await s.enviar()).status>=400);assert.equal(s.envios(),0);assert.equal(s.fila.estado,'PENDIENTE')}
})
test('Proveedor confirma una vez; reintentar no envía un correo ya confirmado',async()=>{
 const s=sistema();assert.equal((await s.enviar()).status,200);assert.equal(s.fila.estado,'ENVIADO');await s.enviar();assert.equal(s.envios(),1)
})
test('Red fallida queda ERROR, reintento conserva clave y no reintenta pasadas 23 horas',async()=>{
 const s=sistema({fallaProveedor:true});await s.enviar();assert.equal(s.fila.estado,'ERROR');await s.enviar();assert.equal(s.envios(),2)
 s.fila.primer_intento=new Date(Date.now()-24*3600000).toISOString();await s.enviar();assert.equal(s.envios(),2)
})
test('Un envío reclamado por otro proceso no se envía simultáneamente',async()=>{
 const s=sistema();s.fila.estado='ENVIANDO';s.fila.actualizado_en=new Date().toISOString();await s.enviar();assert.equal(s.envios(),0)
})

test('SMTP usa TLS 465 y registra aceptación sin repetir el mensaje',async()=>{
 const s=sistema({smtp:true});await s.enviar();assert.equal(s.envios(),1);assert.equal(s.fila.estado,'ENVIADO');assert.ok(s.fila.proveedor_id.startsWith('SMTP:'));await s.enviar();assert.equal(s.envios(),1)
})
test('SMTP no autenticado conserva pendiente y permite probar nuevamente sin mandar nada',async()=>{
 const s=sistema({smtp:true,fallaAutenticacion:true});assert.equal((await s.enviar()).status,503);assert.equal(s.envios(),0);assert.equal(s.fila.estado,'PENDIENTE');assert.equal(s.fila.primer_intento,null)
})
test('SMTP interrumpido no se repite automáticamente y conserva evidencia del intento',async()=>{
 const s=sistema({smtp:true,fallaProveedor:true});await s.enviar();assert.equal(s.fila.estado,'ERROR');await s.enviar();assert.equal(s.envios(),1);assert.ok(s.fila.error.includes('No reenviar'))
})
