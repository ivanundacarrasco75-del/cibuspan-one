import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const {PGlite}=await import(process.env.CIBUSPAN_SQL_TEST_MODULE || '@electric-sql/pglite')
const archivo=(nombre)=>readFile(new URL(`../supabase/migrations/${nombre}`,import.meta.url),'utf8')
const autor='00000000-0000-0000-0000-000000000001', otro='00000000-0000-0000-0000-000000000002'
const cliente='00000000-0000-0000-0000-000000000003', local='00000000-0000-0000-0000-000000000004'
const producto='00000000-0000-0000-0000-000000000005', visita='00000000-0000-0000-0000-000000000006', detalle='00000000-0000-0000-0000-000000000007'

test('Recuperación de cantidades sobre tablas reales de campo, sin duplicar ni alterar evidencia',async(t)=>{
 const db=new PGlite()
 try{
  await db.exec(`create schema auth; create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    create table public.app_profiles(user_id uuid primary key,rol text,activo boolean default true);
    create table public.clientes(id uuid primary key); create table public.productos(id uuid primary key);
    create table public.com_locales_monitoreados(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.app_puede(text,uuid) returns boolean language sql as $$select coalesce(current_setting('prueba.permiso',true),'si') <> 'no'$$;
    create function public.com_puede_ver_cliente_campo(uuid,uuid,date) returns boolean language sql as $$select coalesce(current_setting('prueba.acceso',true),'si') <> 'no'$$;
    create function public.app_es_admin() returns boolean language sql as $$select exists(select 1 from public.app_profiles where user_id=auth.uid() and rol='ADMINISTRADOR' and activo)$$;
    create function public.com_es_gerencia_kpi() returns boolean language sql as $$select exists(select 1 from public.app_profiles where user_id=auth.uid() and rol in ('ADMINISTRADOR','GERENTE') and activo)$$;
  `)
  const base=await archivo('202609220001_kpi_kam_campo_rotacion.sql')
  for(const tabla of ['com_visitas_campo','com_visitas_campo_sku']) await db.exec(base.match(new RegExp(`create table if not exists public.${tabla} \\([\\s\\S]*?\\n\\);`))[0])
  await db.exec(`insert into auth.users values('${autor}'),('${otro}'); insert into app_profiles values('${autor}','MERCADERISTA',true),('${otro}','KAM',true);
    insert into clientes values('${cliente}'); insert into productos values('${producto}'); insert into com_locales_monitoreados values('${local}');
    insert into com_visitas_campo(id,cliente_id,local_monitoreado_id,fecha_visita,registrado_por) values('${visita}','${cliente}','${local}','2026-10-12','${autor}');
    insert into com_visitas_campo_sku(id,visita_id,producto_id,stock_local_unidades,capturas_app,fotos_percha,datos_ia) values('${detalle}','${visita}','${producto}',7,array['original.png'],array['percha.png'],'{"caras_percha":6,"responsable_id":"${autor}","georreferencia_visita":{"estado":"COMPATIBLE"}}');
  `)
  await db.exec(await archivo('202610120001_completar_lecturas_campo.sql'))
  const sesion=(id)=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  const actual=async()=> (await db.query('select *, actualizado_en::text as token from com_visitas_campo_sku')).rows[0]
  const aplicar=(datos,token)=>db.query('select public.com_kpi_campo_completar_lectura($1::uuid,$2::timestamptz,$3::jsonb) as respuesta',[detalle,token,JSON.stringify(datos)])
  await sesion(autor)
  await t.test('Completa rotación/precio y conserva identidad, stock manual, caras y fotos',async()=>{
    const antes=await actual()
    await aplicar({rotacion_diaria_unidades:2.5,precio_comercio:1.6,confianza:.9,advertencias:[],texto_ocr:'captura'},antes.token)
    const despues=await actual()
    assert.equal(Number(despues.stock_local_unidades),7);assert.equal(Number(despues.rotacion_diaria_unidades),2.5)
    assert.equal(despues.datos_ia.caras_percha,6);assert.deepEqual(despues.datos_ia.georreferencia_visita,{estado:'COMPATIBLE'})
    assert.equal(despues.visita_id,visita);assert.equal(despues.producto_id,producto);assert.deepEqual(despues.capturas_app,antes.capturas_app);assert.deepEqual(despues.fotos_percha,antes.fotos_percha)
    assert.equal(despues.datos_ia.rotacion_diaria_unidades,2.5);assert.equal(despues.datos_ia.responsable_id,autor)
  })
  await t.test('Reintento no duplica visitas ni SKU; una revisión desactualizada no sobreescribe',async()=>{
    const antes=await actual();await aplicar({rotacion_diaria_unidades:2.5},antes.token)
    await assert.rejects(()=>aplicar({rotacion_diaria_unidades:9},antes.token),/cambió/)
    assert.equal((await db.query('select count(*)::int as n from com_visitas_campo')).rows[0].n,1)
    assert.equal((await db.query('select count(*)::int as n from com_visitas_campo_sku')).rows[0].n,1)
    assert.equal(Number((await actual()).rotacion_diaria_unidades),2.5)
  })
  await t.test('Otra persona con acceso al cliente no puede modificar la visita original',async()=>{
    await sesion(otro);const antes=await actual()
    await assert.rejects(()=>aplicar({stock_local_unidades:99},antes.token),/autor o un administrador/)
    assert.equal(Number((await actual()).stock_local_unidades),7);await sesion(autor)
  })
  await t.test('Bloquea falta de permiso y falta de acceso al cliente',async()=>{
    const token=(await actual()).token
    await db.query("select set_config('prueba.permiso','no',false)")
    await assert.rejects(()=>aplicar({rotacion_diaria_unidades:9},token),/permiso/)
    await db.query("select set_config('prueba.permiso','si',false),set_config('prueba.acceso','no',false)")
    await assert.rejects(()=>aplicar({rotacion_diaria_unidades:9},token),/autor o un administrador/)
    await db.query("select set_config('prueba.acceso','si',false)")
  })
  await t.test('Rechaza campos ajenos, valores inválidos y actualización sin cantidades',async()=>{
    const antes=await actual()
    for(const datos of [{caras_percha:0,rotacion_diaria_unidades:1},{rotacion_diaria_unidades:-1},{rotacion_diaria_unidades:'NaN'},{stock_local_unidades:null},{texto_ocr:'texto'}]) await assert.rejects(()=>aplicar(datos,antes.token))
    assert.equal((await actual()).token,antes.token);assert.equal((await actual()).datos_ia.caras_percha,6)
  })
  await t.test('Cero explícito se guarda y un campo nulo no borra el valor anterior',async()=>{
    const antes=await actual();await aplicar({stock_local_unidades:0,precio_comercio:null},antes.token)
    assert.equal(Number((await actual()).stock_local_unidades),0);assert.equal(Number((await actual()).precio_comercio),1.6)
  })
  await t.test('Gerencia autorizada completa datos sin convertirse en autor original',async()=>{
    for(const rol of ['ADMINISTRADOR','GERENTE']){
      await db.query("update app_profiles set rol=$1 where user_id=$2",[rol,otro]);await sesion(otro)
      await aplicar({venta_diaria_valor:4},(await actual()).token)
    }
    assert.equal(Number((await actual()).venta_diaria_valor),4)
    assert.equal((await actual()).datos_ia.responsable_id,autor)
    assert.equal((await db.query('select registrado_por from com_visitas_campo')).rows[0].registrado_por,autor)
    await sesion(autor)
  })
  await t.test('Sesión anónima y visita anulada no pueden completar lecturas',async()=>{
    const token=(await actual()).token;await sesion('')
    await assert.rejects(()=>aplicar({venta_diaria_valor:99},token),/permiso/)
    await sesion(autor);await db.exec("update com_visitas_campo set estado='ANULADA'")
    await assert.rejects(()=>aplicar({venta_diaria_valor:99},token),/autor o un administrador/)
    assert.equal(Number((await actual()).venta_diaria_valor),4)
  })
 }finally{await db.close()}
})
