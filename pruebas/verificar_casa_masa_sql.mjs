import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const {PGlite}=await import(process.env.CIBUSPAN_SQL_TEST_MODULE || '@electric-sql/pglite')
const leer = n => readFile(new URL('../supabase/migrations/'+n,import.meta.url),'utf8')
const registro=await leer('202610270001_registro_pedidos_seguro.sql')
const migracion=await leer('202611190002_casa_masa_empaque.sql')
const diagnostico=await readFile(new URL('../supabase/diagnosticos/verificar_casa_masa.sql',import.meta.url),'utf8')
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`

// Esquema mínimo según contratos del repositorio. Registro de pedidos real;
// planificación anterior y permisos auxiliares modelados, sin cuenta remota.
async function escenario(){
 const db=new PGlite()
 await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('ensayo.usuario',true),'')::uuid$$;
 create table app_profiles(user_id uuid primary key,activo boolean,rol text);
 create table app_role_permissions(rol text,pantalla text,permitido boolean,primary key(rol,pantalla));
 create table app_user_permissions(user_id uuid,pantalla text,permitido boolean,primary key(user_id,pantalla));
 create function app_puede(p text) returns boolean language sql stable security definer as $$
 select coalesce((select permitido from app_user_permissions where user_id=auth.uid() and pantalla=p),
 (select permitido from app_role_permissions r join app_profiles a on a.rol=r.rol where a.user_id=auth.uid() and a.activo and r.pantalla=p),false)$$;
 create function app_exigir_operacion(p text[]) returns void language plpgsql security definer as $$begin
 if not exists(select 1 from app_profiles where user_id=auth.uid() and activo) or not exists(select 1 from unnest(p) x where app_puede(x)) then
 raise exception 'Sin permiso' using errcode='42501';end if;end$$;
 create table clientes(id uuid primary key,nombre text,activo boolean);
 create table bodegas(id uuid primary key,cliente_id uuid,nombre text,tipo_empaque text,activo boolean);
 create table productos(id uuid primary key,codigo text,nombre text,corto text,activo boolean,producto_produccion_id uuid);
 create table cliente_productos(cliente_id uuid,producto_id uuid,unidad_manejo integer,activo boolean);
 create table pedidos(id text primary key,cliente_id uuid,bodega_id uuid,numero_pedido_cliente text,fecha_entrega date,hora_entrega time,prioridad text,tipo_empaque text,estado text,total_unidades integer,creado_por uuid);
 create table pedido_detalles(id uuid primary key,pedido_id text references pedidos(id) on delete cascade,producto_id uuid,total_unidades integer,unidades_manejo integer,unidades_despachadas integer,estado text,orden integer);
 create table reservas_inventario(id uuid primary key,pedido_id text,estado text);
 create table reserva_detalles(id uuid primary key,reserva_id uuid,pedido_detalle_id uuid,unidades integer);
 create function obtener_produccion_sugerida() returns table(producto_id uuid,cantidad bigint) language plpgsql security definer as $$
 begin perform app_exigir_operacion(array['Producción']); return query execute 'select coalesce(p.producto_produccion_id,p.id),sum(d.total_unidades)::bigint from public.pedido_detalles d join productos p on p.id=d.producto_id group by 1'; end$$;
 create function obtener_produccion_sugerida_periodo(p_desde date,p_hasta date) returns table(producto_id uuid,cantidad bigint) language plpgsql security definer as $$
 begin perform app_exigir_operacion(array['Producción']); return query select coalesce(p.producto_produccion_id,p.id),sum(d.total_unidades)::bigint from public.pedido_detalles d join productos p on p.id=d.producto_id join pedidos o on o.id=d.pedido_id where o.fecha_entrega between p_desde and p_hasta group by 1;end$$;
 insert into app_profiles values('${id(1)}',true,'ADMINISTRADOR'),('${id(2)}',true,'BODEGUERO'),('${id(3)}',false,'ADMINISTRADOR'),('${id(4)}',true,'MERCADERISTA');
 insert into app_role_permissions values('ADMINISTRADOR','Pedidos',true),('ADMINISTRADOR','Producción',true),('BODEGUERO','Despachos',true);
 insert into clientes values('${id(10)}','Cliente',true);
 insert into bodegas values('${id(11)}','${id(10)}','Entrega','UNIDAD',true);
 insert into productos values('${id(20)}','CM-001','CM uno','CM uno',true,'${id(30)}'),('${id(21)}','CM-002','CM dos','CM dos',true,null),('${id(22)}','NORMAL','Normal','Normal',true,'${id(30)}');
 insert into cliente_productos values('${id(10)}','${id(20)}',1,true),('${id(10)}','${id(21)}',1,true),('${id(10)}','${id(22)}',1,true);
 grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
 grant select on app_profiles to authenticated;
 select set_config('ensayo.usuario','${id(1)}',false);`)
 await db.exec(registro); await db.exec(migracion)
 return db
}
const datos=(codigo=20)=>({numeroPedidoCliente:'CM-ENSAYO',clienteId:id(10),bodegaId:id(11),fechaEntrega:'2026-11-19',horaEntrega:'10:00',prioridad:'NORMAL',tipoEmpaque:'UNIDAD',detalles:[{productoId:id(codigo),totalUnidades:3,unidadManejo:1}]})
const registrar=async(db,d=datos(),sol=100)=> (await db.query('select registrar_pedido_casa_masa($1,$2,$3) r',[id(sol),d,id(1)])).rows[0].r
const guardar=async(db,p,version,estado,extra={})=>(await db.query('select guardar_empaque_casa_masa($1,$2,$3) r',[p,version,{estado,responsable:'Empaque',direccion:'Punto real',repartidor:'Repartidor',verificado:true,...extra}])).rows[0].r

test('Registro central atómico, reintento y canal sin duplicación',async()=>{
 const db=await escenario();try {
 const r=await registrar(db);assert.equal(r.repetida,false)
 assert.equal((await db.query(diagnostico)).rows[0].casa_masa.correcto,true)
 const otro=await registrar(db);assert.equal(otro.pedido_id,r.pedido_id);assert.equal(otro.repetida,true)
 for(const tabla of ['pedidos','pedido_detalles','cm_pedidos','cm_empaque_eventos']) assert.equal((await db.query(`select count(*)::integer n from ${tabla}`)).rows[0].n,1)
 await assert.rejects(registrar(db,{...datos(),numeroPedidoCliente:'OTRO'},100),/otros datos/)
 await assert.rejects(registrar(db,datos(22),101),/únicamente/)
 assert.equal((await db.query('select count(*)::integer n from pedidos')).rows[0].n,1)
 }finally{await db.close()}
})

test('Empaque exige secuencia, reserva completa, responsable, etiquetas y repartidor; conserva auditoría',async()=>{
 const db=await escenario();try{
 const {pedido_id:p}=await registrar(db)
 await assert.rejects(guardar(db,p,1,'LISTO'),/en orden/)
 let r=await guardar(db,p,1,'EN PREPARACION');assert.equal(r.version,2)
 await assert.rejects(guardar(db,p,1,'EN PREPARACION'),/Otro usuario/)
 await assert.rejects(guardar(db,p,2,'EMPACADO Y ETIQUETADO'),/Reserva todas/)
 const detalle=(await db.query('select id from pedido_detalles')).rows[0].id
 await db.query('insert into reservas_inventario values($1,$2,\'ACTIVA\')',[id(500),p])
 await db.query('insert into reserva_detalles values($1,$2,$3,2)',[id(501),id(500),detalle])
 await assert.rejects(guardar(db,p,2,'EMPACADO Y ETIQUETADO'),/Reserva todas/)
 await db.exec('update reserva_detalles set unidades=3')
 await assert.rejects(guardar(db,p,2,'EMPACADO Y ETIQUETADO',{verificado:false}),/Confirma/)
 await assert.rejects(guardar(db,p,2,'EMPACADO Y ETIQUETADO',{responsable:''}),/responsable/)
 r=await guardar(db,p,2,'EMPACADO Y ETIQUETADO');assert.equal(r.version,3)
 await assert.rejects(db.query("update pedidos set estado='DESPACHADO' where id=$1",[p]),/márcalo LISTO/)
 await assert.rejects(guardar(db,p,3,'LISTO',{repartidor:''}),/repartidor/)
 r=await guardar(db,p,3,'LISTO');assert.equal(r.version,4)
 await db.query("update pedidos set estado='DESPACHADO' where id=$1",[p])
 await assert.rejects(guardar(db,p,4,'PENDIENTE'),/ya salió/)
 assert.equal((await db.query('select count(*)::integer n from cm_empaque_eventos')).rows[0].n,4)
 }finally{await db.close()}
})

test('CM excluido antes de producto base en ambos cálculos; pedidos mixtos y normales conservados',async()=>{
 const db=await escenario();try{
 await registrar(db)
 const d={...datos(22),numeroPedidoCliente:'MIXTO',detalles:[...datos(22).detalles,{productoId:id(21),totalUnidades:5,unidadManejo:1}]}
 await db.query('select registrar_pedido_seguro($1,$2,$3)',[id(101),d,id(1)])
 assert.equal((await db.query('select sum(total_unidades)::integer n from pedido_detalles')).rows[0].n,11)
 assert.equal((await db.query('select sum(total_unidades)::integer n from cm_detalles_demanda')).rows[0].n,3)
 for(const sql of ['select * from obtener_produccion_sugerida()',"select * from obtener_produccion_sugerida_periodo('2026-11-19','2026-11-19')"]){
 const r=(await db.query(sql)).rows;assert.equal(r.length,1);assert.equal(r[0].producto_id,id(30));assert.equal(Number(r[0].cantidad),3)
 }
 await db.exec(migracion) // Reinstalación no duplica ni modifica datos.
 assert.equal((await db.query('select count(*)::integer n from pedidos')).rows[0].n,2)
 }finally{await db.close()}
})

test('Permisos: inactivo, denegación personalizada, usuario externo, escritura directa y vista privada',async()=>{
 const db=await escenario();try{
 const {pedido_id:p}=await registrar(db)
 await db.exec('set role authenticated')
 assert.equal((await db.query('select count(*)::integer n from cm_pedidos')).rows[0].n,1)
 await assert.rejects(db.query("update cm_pedidos set estado_empaque='LISTO'"),/permission denied/)
 await assert.rejects(db.query('select * from cm_detalles_demanda'),/permission denied/)
 for(const usuario of [3,4]){
 await db.query("select set_config('ensayo.usuario',$1,false)",[id(usuario)])
 assert.equal((await db.query('select count(*)::integer n from cm_pedidos')).rows[0].n,0)
 await assert.rejects(guardar(db,p,1,'EN PREPARACION'),/Sin permiso/)
 }
 await db.exec('reset role');await db.query('insert into app_user_permissions values($1,\'Casa Masa · Pedidos y empaque\',false)',[id(1)])
 await db.query("select set_config('ensayo.usuario',$1,false)",[id(1)]);await db.exec('set role authenticated')
 assert.equal((await db.query('select count(*)::integer n from cm_pedidos')).rows[0].n,0)
 await assert.rejects(guardar(db,p,1,'EN PREPARACION'),/No tienes acceso/)
 await db.exec('reset role');await db.query('insert into app_user_permissions values($1,\'Casa Masa\',false)',[id(2)])
 await db.query("select set_config('ensayo.usuario',$1,false)",[id(2)]);await db.exec('set role authenticated')
 await assert.rejects(guardar(db,p,1,'EN PREPARACION'),/Sin permiso/)
 await db.exec('reset role; set role anon')
 await assert.rejects(db.query('select * from cm_pedidos'),/permission denied/)
 }finally{await db.close()}
})

test('Fallo al instalar por contrato inesperado revierte toda la migración',async()=>{
 const db=await escenario();try{
 await db.exec(`drop trigger cm_exigir_empaque_despacho on pedidos;
 drop function cm_exigir_empaque_despacho();drop table cm_empaque_eventos,cm_pedidos;
 create or replace function obtener_produccion_sugerida() returns table(producto_id uuid,cantidad bigint) language sql security definer as $$select null::uuid,0::bigint$$;`)
 await assert.rejects(db.exec(migracion),/fuente\/autorización esperada/)
 await db.exec('rollback')
 assert.equal((await db.query("select to_regclass('public.cm_pedidos') t")).rows[0].t,null)
 }finally{await db.close()}
})
