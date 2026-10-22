import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@9"
import { mensajeDescuento } from "./mensaje.ts"
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}
const respuesta=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return respuesta(200,{})
 if(req.method!=='POST')return respuesta(405,{error:'Usa POST'})
 try {
  const url=Deno.env.get('SUPABASE_URL')!, auth=req.headers.get('Authorization')??''
  const usuario=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}})
  const {data:sesion,error:sinSesion}=await usuario.auth.getUser()
  if(sinSesion||!sesion.user)return respuesta(401,{error:'Sesión requerida'})
  const {error:permiso}=await usuario.rpc('com_destinatarios_descuentos')
  if(permiso)return respuesta(403,{error:'Sin permiso para descuentos'})
  const {lote_id}=await req.json()
  if(typeof lote_id!=='string'||!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(lote_id))return respuesta(400,{error:'Lote inválido'})
  const key=Deno.env.get('RESEND_API_KEY'), from=Deno.env.get('DESCUENTOS_EMAIL_FROM')
  const smtpHost=Deno.env.get('SMTP_HOST'), smtpPort=Number(Deno.env.get('SMTP_PORT')??'465')
  const smtpUser=Deno.env.get('SMTP_USER'), smtpPassword=Deno.env.get('SMTP_PASSWORD')
  const usaSmtp=!!smtpHost
  if(!from||(usaSmtp?(!smtpUser||!smtpPassword||smtpPort!==465):!key))return respuesta(503,{error:'Descuento guardado. Falta configurar el servicio de correo; los avisos siguen pendientes.'})
  const transport=usaSmtp?nodemailer.createTransport({host:smtpHost,port:465,secure:true,auth:{user:smtpUser,pass:smtpPassword},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,tls:{minVersion:'TLSv1.2'},logger:false,debug:false}):null
  // Comprobar conexión y autenticación antes de reclamar avisos; no envía mensajes.
  if(transport){try{await transport.verify()}catch{return respuesta(503,{error:'No se pudo autenticar el servidor SMTP. El descuento y sus avisos se conservan pendientes.'})}}
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const {data:filas,error}=await admin.from('com_descuento_correos').select('*').eq('lote_id',lote_id)
  if(error)throw error
  if(!filas?.length)return respuesta(404,{error:"No hay correos registrados para este descuento."})
  let enviados=0,pendientes=0
  for(const fila of filas??[]){
   if(fila.estado==='ENVIADO')continue
   // SMTP no garantiza idempotencia: un intento anterior sin confirmación requiere revisión.
   if((usaSmtp&&fila.primer_intento)||String(fila.proveedor_id??'').startsWith('SMTP:')){pendientes++;continue}
   // El proveedor conserva claves 24 h: fuera de esta ventana no reintentamos a ciegas.
   if(fila.primer_intento&&Date.now()-Date.parse(fila.primer_intento)>23*3600000){await admin.from('com_descuento_correos').update({estado:'ERROR',error:'Reintento bloqueado por antigüedad. Revisar el proveedor antes de reenviar.'}).eq('id',fila.id).eq('actualizado_en',fila.actualizado_en);pendientes++;continue}
   if(fila.estado==='ENVIANDO'&&Date.now()-Date.parse(fila.actualizado_en)<10*60000){pendientes++;continue}
   const ahora=new Date().toISOString()
   const {data:reclamada,error:falloClaim}=await admin.from('com_descuento_correos').update({estado:'ENVIANDO',primer_intento:fila.primer_intento??ahora,actualizado_en:ahora,error:null,...(usaSmtp?{proveedor_id:'SMTP:ENVIANDO'}:{})}).eq('id',fila.id).eq('actualizado_en',fila.actualizado_en).eq('estado',fila.estado).select('id').maybeSingle()
   if(falloClaim)throw falloClaim
   if(!reclamada){pendientes++;continue}
   try {
    const body={from,to:[fila.email],...mensajeDescuento(fila.contenido)}
    let proveedorId: string
    if(transport){
      const resultado=await transport.sendMail({...body,messageId:`<descuento-${fila.id}@cibuspan.com>`,disableFileAccess:true,disableUrlAccess:true})
      if(!resultado.accepted?.some((a: string | {address:string})=>(typeof a==='string'?a:a.address).toLowerCase()===fila.email.toLowerCase()))throw new Error('SMTP no confirmó el destinatario')
      proveedorId=`SMTP:${resultado.messageId}`
    } else {
      const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`descuento/${fila.id}`},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)})
      const resultado=await r.json()
      if(!r.ok||!resultado.id)throw new Error('El proveedor no confirmó el envío')
      proveedorId=resultado.id
    }
    const {error:falloGuardar}=await admin.from('com_descuento_correos').update({estado:'ENVIADO',proveedor_id:proveedorId,actualizado_en:new Date().toISOString(),error:null}).eq('id',fila.id).eq('estado','ENVIANDO')
    if(falloGuardar)throw falloGuardar
    enviados++
   } catch {
    await admin.from('com_descuento_correos').update({estado:'ERROR',actualizado_en:new Date().toISOString(),error:usaSmtp?'SMTP sin confirmación. No reenviar automáticamente: administración debe comprobar el servidor antes de repetir para evitar duplicados.':'Envío no confirmado. Reintentar antes de 23 h desde el primer intento; después revisar con administración.'}).eq('id',fila.id).eq('estado','ENVIANDO')
    pendientes++
   }
  }
  return respuesta(200,{enviados,pendientes})
 }catch{return respuesta(500,{error:'No se pudo completar el envío. El descuento guardado se conserva.'})}
})
