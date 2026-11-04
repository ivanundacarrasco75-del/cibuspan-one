import { test } from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
const modulo=process.env.CIBUSPAN_SQL_TEST_MODULE
if(!modulo)throw Error('Indica CIBUSPAN_SQL_TEST_MODULE con la instalacion aislada de PGlite; nunca conectar este test a produccion.')
const {PGlite}=await import(pathToFileURL(modulo).href)
const db=new PGlite()
const leer=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table app_profiles(user_id uuid primary key,activo boolean,rol text);
create table app_user_permissions(user_id uuid,pantalla text,permitido boolean);
create table app_role_permissions(rol text,pantalla text,permitido boolean);
create table com_kam_clientes(kam_user_id uuid,cliente_id uuid,activo boolean,vigente_desde date,vigente_hasta date);
create table com_mercaderista_clientes(mercaderista_user_id uuid,cliente_id uuid,activo boolean,vigente_desde date,vigente_hasta date);
create table com_visitas_campo(id uuid primary key,cliente_id uuid,estado text);
create table com_visitas_campo_sku(id uuid primary key,visita_id uuid,capturas_app text[],fotos_percha text[]);`)
for(const [p,nombres] of [
 ['supabase/migrations/202608090001_usuarios_permisos.sql',['app_es_admin','app_puede']],
 ['supabase/migrations/202609220001_kpi_kam_campo_rotacion.sql',['com_puede_ver_cliente_campo']],
])for(const nombre of nombres){const sql=leer(p),inicio=sql.indexOf('create or replace function public.'+nombre+'('),fin=sql.indexOf('$$;',sql.indexOf('as $$',inicio))+3;assert.ok(inicio>=0 && fin>inicio);await db.exec(sql.slice(inicio,fin))}
await db.exec(leer('supabase/migrations/202611040004_capturas_r2.sql'))
const u='11111111-1111-4111-8111-111111111111',admin='22222222-2222-4222-8222-222222222222',kam='33333333-3333-4333-8333-333333333333',fuera='44444444-4444-4444-8444-444444444444'
const cliente='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',v='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ruta=`${u}/2026-10-01/captura-123-0-abc.png`,percha=`${u}/2026-10-01/percha-123.png`,sinVisita=`${u}/2026-10-01/captura-sin-visita.png`,nueva=`${u}/2026-11-04/captura-r2-${'a'.repeat(64)}.png`
await db.query(`insert into app_profiles values($1,true,'MERCADERISTA'),($2,true,'ADMINISTRADOR'),($3,true,'KAM'),($4,true,'KAM')`,[u,admin,kam,fuera])
await db.exec("insert into app_role_permissions values('MERCADERISTA','Campo comercial',true),('KAM','Campo comercial',true)")
await db.query('insert into com_kam_clientes values($1,$2,true,current_date-1,null)',[kam,cliente])
await db.query("insert into com_visitas_campo values($1,$2,'CONFIRMADA')",[v,cliente])
await db.query('insert into com_visitas_campo_sku values($1,$2,$3,$4)',[cliente,v,[ruta,nueva],[percha]])
const sesion=async id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
const autorizar=async(r,a)=>(await db.query('select com_kpi_campo_autorizar_archivo($1,$2) as r',[r,a])).rows[0].r.permitido
try{
 await test('autor sube solo captura propia con hash; no percha ni ruta ajena',async()=>{
  await sesion(u);assert.equal(await autorizar(nueva,'SUBIR'),true);assert.equal(await autorizar(percha,'SUBIR'),false);assert.equal(await autorizar(ruta,'SUBIR'),false)
  assert.equal(await autorizar(nueva.replace(u,kam),'SUBIR'),false);assert.equal(await autorizar(sinVisita,'VER'),true)
 })
 await test('KAM asignado ve evidencia confirmada; no originales sin visita ni otro cliente',async()=>{
  await sesion(kam);assert.equal(await autorizar(ruta,'VER'),true);assert.equal(await autorizar(percha,'VER'),true);assert.equal(await autorizar(sinVisita,'VER'),false)
  await sesion(fuera);assert.equal(await autorizar(ruta,'VER'),false)
  await sesion(kam);await db.query("update com_visitas_campo set estado='BORRADOR' where id=$1",[v]);assert.equal(await autorizar(ruta,'VER'),false)
  await db.query("update com_visitas_campo set estado='CONFIRMADA' where id=$1",[v])
 })
 await test('solo admin migra/retira capturas vinculadas: nunca perchas, nuevas o archivos huerfanos',async()=>{
  for(const id of [u,kam,fuera]){await sesion(id);assert.equal(await autorizar(ruta,'MIGRAR'),false);assert.equal(await autorizar(ruta,'RETIRAR'),false)}
  await sesion(admin);assert.equal(await autorizar(ruta,'MIGRAR'),true);assert.equal(await autorizar(ruta,'RETIRAR'),true)
  for(const r of [percha,nueva,sinVisita])assert.equal(await autorizar(r,'MIGRAR'),false)
 })
 await test('sin permiso de campo no se sube, ni se ve evidencia supervisada',async()=>{
  await db.query("insert into app_user_permissions values($1,'Campo comercial',false),($2,'Campo comercial',false)",[u,kam])
  await sesion(u);assert.equal(await autorizar(nueva,'SUBIR'),false)
  await sesion(kam);assert.equal(await autorizar(ruta,'VER'),false)
  await db.exec('delete from app_user_permissions')
 })
 await test('anonimo no ejecuta; listado exclusivo admin paginado y sin nuevas/perchas',async()=>{
  await sesion('');await assert.rejects(()=>autorizar(ruta,'VER'))
  await sesion(kam);await assert.rejects(()=>db.query('select * from com_kpi_campo_archivos_migracion()'))
  await sesion(admin);assert.deepEqual((await db.query('select * from com_kpi_campo_archivos_migracion()')).rows,[{ruta}])
  assert.deepEqual((await db.query('select * from com_kpi_campo_archivos_migracion($1,10)',[ruta])).rows,[])
  await assert.rejects(()=>db.query('select * from com_kpi_campo_archivos_migracion($1,0)',['']))
  const r=(await db.query(leer('supabase/diagnosticos/verificar_capturas_r2.sql'))).rows[0].capturas_r2
  assert.equal(r.correcto,true)
 })
 await test('rutas externas o transversales y accion no valida rechazadas',async()=>{
  await sesion(admin)
  for(const r of ['https://otro.test/foto.png','../secreto',ruta+'/../secreto',null])await assert.rejects(()=>autorizar(r,'VER'))
  await assert.rejects(()=>autorizar(ruta,'BORRAR_TODO'))
 })
}finally{await db.close()}
