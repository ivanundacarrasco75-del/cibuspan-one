// Pages Function. CAPTURAS_CAMPO is a PRIVATE R2 binding; no S3 keys in the app.
const PROYECTO = 'https://mkntfvsbmlgobettavnu.supabase.co';
const MAX = 10 * 1024 * 1024;
const tipos = new Set(['image/png', 'image/jpeg', 'image/webp']);
const enc = new TextEncoder();
const fallo = (mensaje, estado = 400) => Object.assign(new Error(mensaje), { estado });
const json = (dato, estado = 200) => Response.json(dato, { status: estado, headers: { 'Cache-Control': 'no-store' } });
const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async b => hex(await crypto.subtle.digest('SHA-256', b));
export function rutaValida(ruta) {
  return typeof ruta === 'string' && ruta.length <= 500 && /^[a-f0-9-]{36}\/\d{4}-\d{2}-\d{2}\/(captura|percha)-[a-z0-9.-]+\.(png|jpg|jpeg|webp)$/i.test(ruta);
}
function tipoReal(b) {
  const a = new Uint8Array(b);
  if (a[0] === 0xff && a[1] === 0xd8 && a[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((v,i) => a[i] === v)) return 'image/png';
  if (String.fromCharCode(...a.slice(0,4)) === 'RIFF' && String.fromCharCode(...a.slice(8,12)) === 'WEBP') return 'image/webp';
  throw fallo('Solo se admiten capturas PNG, JPEG o WebP.');
}
async function bytesLimitados(respuesta, limite = MAX) {
  const declarado = respuesta.headers.get('Content-Length');
  if (declarado && Number(declarado) > limite) throw fallo('La captura supera 10 MB.', 413);
  if (!respuesta.body) throw fallo('La captura esta vacia.');
  const lector = respuesta.body.getReader(), partes = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await lector.read(); if (done) break;
      total += value.byteLength;
      if (total > limite) throw fallo('La captura supera 10 MB.', 413);
      partes.push(value);
    }
  } catch (e) { await lector.cancel().catch(() => {}); throw e; }
  if (!total) throw fallo('La captura esta vacia.');
  const salida = new Uint8Array(total); let offset = 0;
  for (const parte of partes) { salida.set(parte,offset); offset += parte.length; }
  return salida.buffer;
}
function credenciales(request) {
  const Authorization = request.headers.get('Authorization'), apikey = request.headers.get('apikey');
  if (!Authorization?.startsWith('Bearer ') || !apikey || apikey.length > 3000) throw fallo('Inicia sesion para acceder a las capturas.', 401);
  return { Authorization, apikey, 'Content-Type': 'application/json' };
}
async function remoto(ruta, opciones) {
  const res = await fetch(PROYECTO + ruta, { ...opciones, signal: AbortSignal.timeout(25000) });
  if (!res.ok) {
    // Do not leak tokens, signed URLs or raw upstream error bodies.
    const texto = await res.text();
    if (res.status === 402 || texto.includes('exceed_storage_size_quota')) throw fallo('Supabase sigue restringido por su cuota de almacenamiento. No se confirmo la operacion; primero hay que restablecer el proyecto.', 503);
    let detalle; try { detalle = JSON.parse(texto); } catch { detalle = {}; }
    if (detalle.code === 'PGRST202') throw fallo('Falta instalar los permisos de capturas R2 en Supabase.',503);
    if (ruta.startsWith('/storage/') && (res.status === 404 || String(detalle.statusCode) === '404')) throw fallo('No se encontro la captura original.',404);
    if (res.status === 401 || res.status === 403) throw fallo('La sesion o los permisos no permiten acceder a esta evidencia.', 403);
    throw fallo('No se pudo consultar Supabase. No se confirmo la operacion.', 503);
  }
  return res;
}
async function autorizar(request, ruta, accion) {
  if (!rutaValida(ruta)) throw fallo('Ruta de evidencia no valida.');
  const headers = credenciales(request);
  const res = await remoto('/rest/v1/rpc/com_kpi_campo_autorizar_archivo', {
    method: 'POST', headers, body: JSON.stringify({ p_ruta: ruta, p_accion: accion }),
  });
  const data = await res.json();
  if (data.permitido !== true || !data.usuario_id) throw fallo('No tienes permiso para esta evidencia.', 403);
  return headers;
}
function rutaStorage(ruta) { return '/storage/v1/object/visitas-campo/' + ruta.split('/').map(encodeURIComponent).join('/'); }
async function claveFirma(env) {
  if (!env.CAPTURAS_FIRMA || env.CAPTURAS_FIRMA.length < 32) throw fallo('Falta configurar la firma privada de capturas en Cloudflare.', 503);
  return crypto.subtle.importKey('raw',enc.encode(env.CAPTURAS_FIRMA),{ name:'HMAC',hash:'SHA-256' },false,['sign','verify']);
}
async function firmar(ruta, env, origin) {
  const vence = Math.floor(Date.now()/1000)+600;
  const firma = hex(await crypto.subtle.sign('HMAC',await claveFirma(env),enc.encode(`${ruta}\n${vence}`)));
  const u = new URL('/api/capturas/imagen',origin); u.search = new URLSearchParams({ ruta,vence:String(vence),firma }).toString();
  return u.href;
}
async function verificarCopia(bucket,ruta) {
  const objeto = await bucket.get(ruta);
  if (!objeto) return null;
  const sha = objeto.customMetadata?.sha256;
  if (!sha || objeto.size > MAX || !tipos.has(objeto.httpMetadata?.contentType)) throw fallo('La copia de R2 no tiene verificacion valida. Se conserva el original.', 409);
  const bytes = await objeto.arrayBuffer();
  if (await sha256(bytes) !== sha) throw fallo('La copia de R2 no coincide con su verificacion. Se conserva el original.', 409);
  return { bytes,sha,tipo:objeto.httpMetadata.contentType, origen:objeto.customMetadata?.origen };
}
async function copiar(bucket,ruta,bytes,tipo,origen) {
  const sha = await sha256(bytes);
  const previa = await bucket.head(ruta);
  if (previa && (previa.customMetadata?.sha256 !== sha || previa.size !== bytes.byteLength)) throw fallo('Ya existe un archivo diferente en esa ruta. No se sobrescribio.', 409);
  if (!previa) await bucket.put(ruta, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata:{ contentType:tipo }, customMetadata:{ sha256:sha,origen,verificado_en:new Date().toISOString() } });
  const verificada = await verificarCopia(bucket,ruta);
  if (!verificada || verificada.sha !== sha) throw fallo('No se confirmo la copia completa en R2.', 503);
  return { ruta,sha256:sha,bytes:bytes.byteLength,verificada:true };
}
export async function onRequest({ request,env,params }) {
  try {
    const accion = String(params.accion ?? ''), url = new URL(request.url);
    if (accion === 'estado' && request.method === 'GET') return json({ version:'202611040004',r2:!!env.CAPTURAS_CAMPO,firma:!!env.CAPTURAS_FIRMA,solo_capturas:true });
    if (!env.CAPTURAS_CAMPO) throw fallo('Falta vincular el almacen de capturas R2 en Cloudflare.',503);
    if (accion === 'imagen' && request.method === 'GET') {
      const ruta = url.searchParams.get('ruta'), vence = url.searchParams.get('vence'), firma = url.searchParams.get('firma');
      const segundos = Number(vence), ahora = Math.floor(Date.now()/1000);
      if (!rutaValida(ruta) || !/^\d+$/.test(vence ?? '') || segundos <= ahora || segundos > ahora+600 || !/^[a-f0-9]{64}$/.test(firma ?? '')) throw fallo('El enlace de la captura vencio o no es valido. Abre nuevamente la evidencia.',403);
      const bytesFirma = Uint8Array.from(firma.match(/../g),x => parseInt(x,16));
      if (!await crypto.subtle.verify('HMAC',await claveFirma(env),bytesFirma,enc.encode(`${ruta}\n${vence}`))) throw fallo('Enlace de evidencia no valido.',403);
      const objeto = await env.CAPTURAS_CAMPO.get(ruta);
      if (!objeto) throw fallo('No se encontro la captura en R2.',404);
      return new Response(objeto.body,{ headers:{ 'Content-Type':objeto.httpMetadata?.contentType ?? 'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer' } });
    }
    if (accion === 'subir' && request.method === 'PUT') {
      const ruta = url.searchParams.get('ruta'); await autorizar(request,ruta,'SUBIR');
      if (!/\/captura-r2-[a-f0-9]{64}\.(png|jpg|webp)$/.test(ruta)) throw fallo('Solo se suben capturas de En Percha.');
      const bytes = await bytesLimitados(request), tipo = tipoReal(bytes);
      if (request.headers.get('Content-Type') !== tipo) throw fallo('El formato de la captura no coincide con su contenido.');
      const extension = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg';
      if (!ruta.endsWith(`captura-r2-${await sha256(bytes)}.${extension}`)) throw fallo('La captura no coincide con su identificador.',409);
      return json(await copiar(env.CAPTURAS_CAMPO,ruta,bytes,tipo,'r2'));
    }
    if (request.method !== 'POST' || !['firmar','migrar','retirar'].includes(accion)) return json({error:'Operacion no disponible.'},405);
    let datos;
    try { datos = JSON.parse(new TextDecoder().decode(await bytesLimitados(request,16384))); }
    catch (e) { if(e.estado) throw e; throw fallo('Solicitud no valida.'); }
    if (!datos || typeof datos !== 'object') throw fallo('Solicitud no valida.');
    if (accion === 'firmar') {
      if (!Array.isArray(datos.rutas) || !datos.rutas.length || datos.rutas.length > 10) throw fallo('Selecciona de 1 a 10 capturas.');
      const salida = [];
      for (const ruta of datos.rutas) {
        const headers = await autorizar(request,ruta,'VER');
        let enlace;
        if (await env.CAPTURAS_CAMPO.head(ruta)) enlace = await firmar(ruta,env,url.origin);
        else {
          const res = await remoto('/storage/v1/object/sign/visitas-campo/'+ruta.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers,body:JSON.stringify({expiresIn:600})});
          const original = await res.json();
          if (typeof original.signedURL !== 'string' || !original.signedURL.startsWith('/object/sign/visitas-campo/')) throw fallo('No se confirmo el acceso al original.',503);
          enlace = PROYECTO+'/storage/v1'+original.signedURL;
        }
        salida.push({ruta,url:enlace});
      }
      return json(salida);
    }
    const {ruta} = datos, headers = await autorizar(request,ruta,accion === 'migrar' ? 'MIGRAR' : 'RETIRAR');
    if (accion === 'migrar') {
      const existente = await verificarCopia(env.CAPTURAS_CAMPO,ruta);
      if (existente) {
        if (existente.origen !== 'supabase') throw fallo('El origen de la copia no coincide.',409);
        return json({ruta,sha256:existente.sha,bytes:existente.bytes.byteLength,verificada:true,ya_copiada:true});
      }
      const res = await remoto(rutaStorage(ruta),{headers});
      const bytes = await bytesLimitados(res), tipo = tipoReal(bytes);
      return json(await copiar(env.CAPTURAS_CAMPO,ruta,bytes,tipo,'supabase'));
    }
    if (datos.confirmacion !== 'RETIRAR_ORIGINAL_VERIFICADO') throw fallo('Confirma expresamente el retiro del original.');
    const copia = await verificarCopia(env.CAPTURAS_CAMPO,ruta);
    if (!copia || copia.origen !== 'supabase' || datos.sha256 !== copia.sha) throw fallo('Primero copia y verifica la captura en R2. No se elimino el original.',409);
    // Download and compare again immediately before deleting through Storage API.
    let original;
    try { original = await remoto(rutaStorage(ruta),{headers}); }
    catch (e) { if(e.estado === 404) return json({ruta,retirado:true,ya_retirado:true}); throw e; }
    if (await sha256(await bytesLimitados(original)) !== copia.sha) throw fallo('El original cambio. No se elimino.',409);
    await remoto('/storage/v1/object/visitas-campo',{method:'DELETE',headers,body:JSON.stringify({prefixes:[ruta]})});
    // Never return success based only on a DELETE response.
    try { await remoto(rutaStorage(ruta),{headers}); }
    catch(e) { if(e.estado === 404) return json({ruta,retirado:true}); throw e; }
    throw fallo('No se pudo confirmar el retiro del original. La copia de R2 se conserva.',409);
  } catch (e) { return json({error:e.estado ? e.message : 'No se completo la operacion de capturas. Reintenta; no se confirmaron cambios.'},e.estado ?? 503); }
}
