import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const {PGlite}=await import(process.env.CIBUSPAN_SQL_TEST_MODULE || '@electric-sql/pglite')
const migracion=await readFile(new URL('../supabase/migrations/202610230001_autorizacion_operativa.sql',import.meta.url),'utf8')
const diagnostico=await readFile(new URL('../supabase/diagnosticos/verificar_autorizacion_operativa.sql',import.meta.url),'utf8')
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const rutinas=[
 ['registrar_produccion_completa','p_fecha_produccion_general date,p_detalles jsonb','uuid',"current_date,'[]'::jsonb",'Producción'],
 ['editar_produccion_completa','p_produccion_id uuid,p_fecha_produccion_general date,p_detalles jsonb','uuid',`'${id(10)}',current_date,'[]'::jsonb`,'Producción'],
 ['reservar_pedido_fefo_parcial','p_pedido_id text,p_cantidades jsonb','text',"'PED-ENSAYO','[]'::jsonb",'Pedidos'],
 ['confirmar_despacho_parcial_fefo','p_reserva_id text,p_cantidades jsonb','text',"'RES-ENSAYO','[]'::jsonb",'Despachos'],
 ['liberar_reserva_fefo','p_reserva_id uuid','void',`'${id(10)}'`,'Despachos'],
 ['activar_control_conciliacion_despacho','p_reserva_id text','boolean',"'RES-ENSAYO'",'Despachos'],
 ['vincular_factura_despacho','p_reserva_id text,p_numero_factura text','text',"'RES-ENSAYO','FAC-ENSAYO'",'Despachos'],
 ['ajustar_inventario_lote','p_inventario_lote_id uuid,p_tipo text,p_cantidad integer,p_motivo text,p_observaciones text default null','uuid',`'${id(10)}','ENTRADA',1,'Ensayo',null`,'Inventario'],
 ['convertir_inventario_empaque','p_inventario_origen_id uuid,p_producto_destino_id uuid,p_cantidad integer','uuid',`'${id(10)}','${id(11)}',1`,'Inventario'],
 ['convertir_semielaborado','p_inventario_semielaborado_id uuid,p_producto_final_id uuid,p_cantidad integer,p_fecha_elaboracion_etiqueta date,p_lote_final text,p_fecha_vencimiento date','uuid',`'${id(10)}','${id(11)}',1,current_date,'ENSAYO',current_date+30`,'Producción'],
 ['registrar_devolucion_completa','p_fecha_devolucion date,p_cliente_id uuid,p_bodega_id uuid,p_origen_registro text,p_documento_referencia text,p_detalles jsonb','uuid',`current_date,'${id(10)}','${id(11)}','MANUAL','DEV-ENSAYO','[]'::jsonb`,'Devoluciones'],
 ['obtener_produccion_sugerida','','table(producto_id uuid,unidades_sugeridas integer)','','Dashboard'],
]
async function escenario(){
 const db=new PGlite()
 await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role; create role externo;
   create table public.app_profiles(user_id uuid primary key,activo boolean not null);
   insert into app_profiles values('${id(1)}',true),('${id(2)}',false);
   create table public.efectos(id bigint generated always as identity,rutina text);
   grant usage on schema public,auth to anon,authenticated,service_role,externo;
   grant insert,select on efectos to authenticated,service_role;
   grant usage on sequence efectos_id_seq to authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$
     select nullif(current_setting('ensayo.usuario',true),'')::uuid $$;
   create function app_puede_alguna(text[]) returns boolean language sql stable as $$
     select coalesce($1 && array(select jsonb_array_elements_text(coalesce(nullif(current_setting('ensayo.modulos',true),''),'[]')::jsonb)),false) $$;
   create function ensayo_declarar() returns integer language plpgsql as $$begin
     insert into efectos(rutina) values('DECLARAR'); return 1; end$$;`)
 for(const [nombre,args,retorno] of rutinas){
   if(nombre==='obtener_produccion_sugerida'){
     await db.exec(`create function public.${nombre}() returns ${retorno} language sql security definer set search_path=public as $func$
       with calculo as(select '${id(10)}'::uuid producto_id,42::integer unidades_sugeridas)
       select calculo.producto_id,calculo.unidades_sugeridas from calculo order by unidades_sugeridas;
       $func$;`)
     continue
   }
   const devolver=retorno==='void'?'return;':retorno==='boolean'?'return true;':retorno==='uuid'?`return '${id(10)}'::uuid;`:"return 'RESULTADO';"
   const declarar=nombre==='editar_produccion_completa'?'declare v_inicial integer:=public.ensayo_declarar();':''
   // La excepción de negocio interior no debe capturar ni ocultar un rechazo
   // de acceso. La declaración tampoco debe producir efectos antes del guard.
   const excepcion=nombre==='editar_produccion_completa'?`exception when others then ${devolver}`:''
   await db.exec(`create function public.${nombre}(${args}) returns ${retorno} language plpgsql
     ${nombre==='registrar_devolucion_completa'?'security invoker':'security definer'} set search_path=public as $func$
     ${declarar} begin insert into public.efectos(rutina) values('${nombre}'); ${devolver} ${excepcion} end;
     $func$; grant execute on function public.${nombre} to authenticated,service_role;`)
 }
 return db
}
const estado=async db=>(await db.query(`select p.oid::integer oid,p.proname,p.prosrc,p.proargnames,p.proallargtypes::text,
  p.proargtypes::text,p.prorettype::integer,p.proretset,p.prosecdef,p.proconfig,p.provolatile,p.proisstrict,
  pg_get_expr(p.proargdefaults,0) argumentos_default from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=any($1::text[]) order by p.proname`,[rutinas.map(r=>r[0])])).rows
const usuario=async(db,modulos,uid=id(1))=>{
 await db.exec('reset role')
 await db.query("select set_config('ensayo.usuario',$1,false),set_config('ensayo.modulos',$2,false)",[uid,JSON.stringify(modulos)])
 await db.exec('set role authenticated')
}
const llamar=(db,r)=>db.query(`select * from public.${r[0]}(${r[3]})`)

test('Autorización operativa: sesión, módulos, mantenimiento, contratos y atomicidad',async t=>{
 const db=await escenario()
 try{
  const anterior=await estado(db)
  await db.exec(migracion)
  await t.test('Conserva OID, firmas, defaults, configuración, seguridad y lógica anterior',async()=>{
   const posterior=await estado(db)
   for(let n=0;n<anterior.length;n++){
    const {prosrc:viejo,...contratoAntes}=anterior[n]
    const {prosrc:nuevo,...contratoDespues}=posterior[n]
    assert.deepEqual(contratoDespues,contratoAntes)
    assert.ok(nuevo.startsWith('\n-- cibuspan-autorizacion-operativa-v1\n'))
    if(anterior[n].proname!=='obtener_produccion_sugerida')assert.ok(nuevo.includes(viejo))
   }
  })
  await t.test('Anónimo y otro rol sin acceso no pueden ejecutar las doce operaciones',async()=>{
   for(const rol of ['anon','externo']){
    await db.exec('reset role')
    await db.query("select set_config('ensayo.usuario','',false)")
    await db.exec(`set role ${rol}`)
    for(const r of rutinas)await assert.rejects(()=>llamar(db,r),e=>e.code==='42501')
   }
   await db.exec('reset role')
   assert.equal((await db.query('select count(*)::int n from efectos')).rows[0].n,0)
  })
  await t.test('Rol autenticado sin sesión se rechaza antes de ejecutar negocio o declaraciones',async()=>{
   await usuario(db,[], '')
   for(const r of rutinas)await assert.rejects(()=>llamar(db,r),e=>e.code==='42501')
   await db.exec('reset role')
   assert.equal((await db.query('select count(*)::int n from efectos')).rows[0].n,0)
  })
  await t.test('Sin permiso se rechaza incluso si el cuerpo interior captura excepciones',async()=>{
   await usuario(db,['Visitas'])
   for(const r of rutinas)await assert.rejects(()=>llamar(db,r),e=>e.code==='42501')
   await db.exec('reset role')
   assert.equal((await db.query('select count(*)::int n from efectos')).rows[0].n,0)
  })
  await t.test('Usuarios inactivos o sin perfil no pasan con un permiso declarado',async()=>{
   for(const uid of [id(2),id(3)]){
    await usuario(db,['Producción'],uid)
    await assert.rejects(()=>llamar(db,rutinas[0]),e=>e.code==='42501')
   }
  })
  await t.test('Sólo cada módulo autorizado puede llegar a su operación',async()=>{
   for(const r of rutinas){
    await usuario(db,[r[4]])
    const result=await llamar(db,r)
    if(r[0]==='obtener_produccion_sugerida')assert.deepEqual(result.rows,[{producto_id:id(10),unidades_sugeridas:42}])
   }
   await db.exec('reset role')
   assert.equal((await db.query("select count(*)::int n from efectos where rutina<>'DECLARAR'")).rows[0].n,11)
  })
  await t.test('Dashboard conserva lectura y no obtiene permiso para registrar producción',async()=>{
   await usuario(db,['Dashboard'])
   assert.equal((await llamar(db,rutinas.at(-1))).rows[0].unidades_sugeridas,42)
   await assert.rejects(()=>llamar(db,rutinas[0]),e=>e.code==='42501')
  })
  await t.test('Un claim service_role no reemplaza el rol SQL verificado',async()=>{
   await usuario(db,[])
   await db.exec(`select set_config('request.jwt.claim.role','service_role',false),
      set_config('request.jwt.claims','{"role":"service_role"}',false)`)
   await assert.rejects(()=>llamar(db,rutinas[0]),e=>e.code==='42501')
  })
  await t.test('Service_role real y mantenimiento directo conservan operaciones ya autorizadas',async()=>{
   await db.exec("reset role; select set_config('ensayo.usuario','',false),set_config('ensayo.modulos','[]',false); set role service_role")
   assert.equal((await llamar(db,rutinas[0])).rows.length,1)
   assert.equal((await llamar(db,rutinas.at(-1))).rows[0].unidades_sugeridas,42)
   await db.exec('reset role')
   assert.equal((await llamar(db,rutinas[0])).rows.length,1)
  })
  await t.test('Mantenimiento con login temporal conserva el rol SQL administrativo real',async()=>{
   await db.exec('reset role; create role cli_login_ensayo; grant postgres to cli_login_ensayo; set session authorization cli_login_ensayo; set role postgres')
   try{assert.equal((await llamar(db,rutinas[0])).rows.length,1)}
   finally{await db.exec('reset session authorization; reset role')}
  })
  await t.test('Reinstalar no anida guardias, cambia contratos ni ejecuta operaciones',async()=>{
   await db.exec('reset role')
   const antes=await estado(db),n=(await db.query('select count(*)::int n from efectos')).rows[0].n
   await db.exec(migracion)
   assert.deepEqual(await estado(db),antes)
   assert.equal((await db.query('select count(*)::int n from efectos')).rows[0].n,n)
  })
  await t.test('Verificación de sólo lectura confirma doce contratos y detecta cambios de acceso',async()=>{
   await db.exec('begin read only')
   let r=(await db.query(diagnostico)).rows[0].autorizacion_operativa
   assert.equal(r.correcto,true);assert.equal(r.funciones_protegidas,12)
   assert.equal(r.accesos_anonimos_cerrados,12);assert.deepEqual(r.pendientes,[])
   await db.exec('rollback')
   await db.exec('begin; grant execute on function obtener_produccion_sugerida() to anon')
   r=(await db.query(diagnostico)).rows[0].autorizacion_operativa
   assert.equal(r.correcto,false);assert.equal(r.accesos_anonimos_cerrados,11)
   assert.deepEqual(r.pendientes,['obtener_produccion_sugerida'])
   await db.exec('rollback')
  })
 }finally{await db.close()}
})

test('Si falta una firma instalada, se revierte toda la instalación',async()=>{
 const db=await escenario()
 try{
  await db.exec('drop function public.vincular_factura_despacho(text,text)')
  const antes=await estado(db)
  await assert.rejects(()=>db.exec(migracion),/Falta la función/)
  await db.exec('rollback')
  assert.deepEqual(await estado(db),antes)
  assert.equal((await db.query("select to_regprocedure('public.app_exigir_operacion(text[])')::text id")).rows[0].id,null)
 }finally{await db.close()}
})

test('Una variante no revisada impide instalar parcialmente la protección',async()=>{
 const db=await escenario()
 try{
  await db.exec("create function public.registrar_produccion_completa(text) returns text language sql as $$select $1$$")
  const antes=await estado(db)
  await assert.rejects(()=>db.exec(migracion),/variantes no revisadas/)
  await db.exec('rollback')
  assert.deepEqual(await estado(db),antes)
 }finally{await db.close()}
})

test('El SQL guardado por Windows con CRLF se instala, verifica y reinstala',async()=>{
 const db=await escenario()
 try{
  const windows=migracion.replace(/\r?\n/g,'\r\n')
  await db.exec(windows)
  assert.equal((await db.query(diagnostico)).rows[0].autorizacion_operativa.correcto,true)
  const antes=await estado(db)
  await db.exec(windows)
  assert.deepEqual(await estado(db),antes)
  assert.equal((await db.query(diagnostico)).rows[0].autorizacion_operativa.correcto,true)
 }finally{await db.close()}
})

test('Una marca de versión sin su control no permite anunciar instalación correcta',async()=>{
 const db=await escenario()
 try{
  await db.exec(migracion)
  await db.exec(`create or replace function registrar_produccion_completa(p_fecha_produccion_general date,p_detalles jsonb)
    returns uuid language plpgsql security definer set search_path=public as $func$
-- cibuspan-autorizacion-operativa-v1
begin return '${id(10)}'::uuid; end;
$func$`)
  const antes=await estado(db)
  await assert.rejects(()=>db.exec(migracion),/no coincide con esta versión/)
  await db.exec('rollback')
  assert.deepEqual(await estado(db),antes)
 }finally{await db.close()}
})
