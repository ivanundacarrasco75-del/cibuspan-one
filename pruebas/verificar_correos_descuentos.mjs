import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'vite'
const {PGlite}=await import(process.env.CIBUSPAN_SQL_TEST_MODULE || '@electric-sql/pglite')
const uuid=(n)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
test('Guardar descuento y preparar avisos es atómico, autorizado e idempotente',async()=>{
 const db=new PGlite()
 try {
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
   create table auth.users(id uuid primary key); insert into auth.users values('${uuid(1)}'),('${uuid(2)}'),('${uuid(3)}');
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('prueba.usuario',true),'')::uuid$$;
   create function public.app_puede_alguna(text[]) returns boolean language sql as $$select coalesce(current_setting('prueba.permiso',true),'si')='si'$$;
   create table public.app_profiles(user_id uuid primary key,nombre text,email text,rol text,activo boolean);
   insert into app_profiles values('${uuid(1)}','Gerente','gerente@example.invalid','GERENTE',true),('${uuid(2)}','Ventas','ventas@example.invalid','KAM',true),('${uuid(3)}','Inactivo','inactivo@example.invalid','KAM',false);
   create table clientes(id uuid primary key,nombre text,activo boolean);insert into clientes values('${uuid(10)}','Favorita',true);
   create table productos(id uuid primary key,codigo text,nombre text,activo boolean);insert into productos values('${uuid(20)}','SKU-1','Pan',true);`)
  const base=await readFile(new URL('../supabase/migrations/202608150160_descuentos_promociones_mensajes.sql',import.meta.url),'utf8')
  for(const tabla of ['com_promociones','com_promocion_productos'])await db.exec(base.match(new RegExp(`create table if not exists public.${tabla} \\([\\s\\S]*?\\n\\);`))[0])
  await db.exec(base.slice(base.indexOf('create or replace function public.com_guardar_promocion('),base.indexOf('create or replace function public.com_registrar_nota_descuento(')))
  await db.exec(await readFile(new URL('../supabase/migrations/202610220001_descuentos_correo.sql',import.meta.url),'utf8'))
  await db.query("select set_config('prueba.usuario',$1,false)",[uuid(1)])
  const productos=JSON.stringify([{producto_id:uuid(20),tipo_descuento:'PORCENTAJE',valor_descuento:12.5}])
  const guardar=(id,usuarios,nombre='Campaña octubre')=>db.query('select com_guardar_promocion_correo($1,$2,$3,$4,$5,$6,$7,$8) as id',[id,nombre,uuid(10),'2026-10-22','2026-10-29','Condiciones reales',productos,usuarios])
  const primero=await guardar(uuid(30),[uuid(2),uuid(2)])
  assert.equal((await db.query('select * from com_descuento_correos')).rows.length,1)
  const aviso=(await db.query('select * from com_descuento_correos')).rows[0]
  assert.equal(aviso.email,'ventas@example.invalid');assert.equal(aviso.estado,'PENDIENTE')
  assert.equal(aviso.contenido.productos[0].valor,12.5);assert.equal(aviso.contenido.cliente,'Favorita')
  assert.equal((await guardar(uuid(30),[uuid(2)])).rows[0].id,primero.rows[0].id)
  assert.equal((await db.query('select * from com_promociones')).rows.length,1)
  await assert.rejects(()=>guardar(uuid(30),[uuid(2)],'Otros datos'),/otros datos/)
  await assert.rejects(()=>guardar(uuid(31),[uuid(3)]),/inactivos/)
  assert.equal((await db.query('select * from com_promociones')).rows.length,1)
  await guardar(uuid(32),[])
  assert.equal((await db.query('select * from com_descuento_correos')).rows.length,1)
  await db.query("update app_profiles set activo=true,email='ventas@example.invalid' where user_id=$1",[uuid(3)])
  await guardar(uuid(34),[uuid(2),uuid(3)])
  assert.equal((await db.query('select * from com_descuento_correos where lote_id=$1',[uuid(34)])).rows.length,1)
  await db.exec('set role authenticated')
  await assert.rejects(()=>db.query('select * from com_descuento_correos'),/permission denied/)
  await db.exec('reset role')
  await db.query("select set_config('prueba.permiso','no',false)")
  await assert.rejects(()=>guardar(uuid(33),[uuid(2)]),/Sin permiso/)
  await assert.rejects(()=>db.query('select * from com_destinatarios_descuentos()'),/Sin permiso/)
  await db.query("select set_config('prueba.permiso','si',false)")
  await db.query("select set_config('prueba.usuario',$1,false)",[uuid(2)])
  await assert.rejects(()=>guardar(uuid(30),[uuid(2)]),/otros datos/)
  await db.query("select set_config('prueba.usuario','',false)")
  await assert.rejects(()=>db.query('select * from com_estado_correos_descuentos()'),/Sin permiso/)
 }finally{await db.close()}
})
test('El mensaje incluye SKU, cliente, vigencia, porcentaje y descuento por unidad sin HTML',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'})
 try {
  const {mensajeDescuento}=await server.ssrLoadModule('/supabase/functions/descuentos-correo/mensaje.ts')
  const m=mensajeDescuento({nombre:'Octubre\r\nPrueba',cliente:'Favorita',fecha_inicio:'2026-10-22',fecha_fin:'2026-10-29',observaciones:'Condiciones',productos:[{sku:'1',nombre:'Pan',tipo:'PORCENTAJE',valor:10},{sku:'2',nombre:'Botón',tipo:'VALOR_UNIDAD',valor:.25}]})
  assert.equal(/[\r\n]/.test(m.subject),false)
  for(const v of ['Favorita','2026-10-22','2026-10-29','1 · Pan: 10%','2 · Botón: 0.25 USD por unidad','Condiciones'])assert.equal(m.text.includes(v),true)
 }finally{await server.close()}
})
