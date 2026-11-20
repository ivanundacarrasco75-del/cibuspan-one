import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

const leer = nombre => readFile(new URL(`../supabase/migrations/${nombre}.sql`, import.meta.url), "utf8")
const uid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const persona = "00000000-0000-0000-0000-000000000001"
const clave = "1".repeat(49)

test("el permiso de Cuentas y Roles permite sus datos y operaciones, sin conceder Pagos semanales ni acceso directo a XML", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values('${uid}');
      create function auth.uid() returns uuid language sql stable as $$ select '${uid}'::uuid $$;
      grant usage on schema auth to authenticated;
      create table app_profiles(user_id uuid primary key,rol text,activo boolean);
      create table app_user_permissions(user_id uuid,pantalla text,permitido boolean,primary key(user_id,pantalla));
      insert into app_profiles values('${uid}','JEFA_FACTURACION',true);
      insert into app_user_permissions values
        ('${uid}','Administración',false),
        ('${uid}','Pagos y Finanzas · Cuentas por Pagar',true),
        ('${uid}','Pagos y Finanzas · Roles de pago',true),
        ('${uid}','Pagos y Finanzas · Pagos semanales',false);
      create function app_es_admin() returns boolean language sql stable security definer set search_path='' as
        $$ select exists(select 1 from public.app_profiles where user_id=auth.uid() and activo and rol='ADMINISTRADOR') $$;
      create function app_puede(text) returns boolean language sql stable security definer set search_path='' as
        $$ select coalesce((select permitido from public.app_user_permissions where user_id=auth.uid() and pantalla=$1),public.app_es_admin()) $$;
      create function app_puede_alguna(text[]) returns boolean language sql stable security definer set search_path='' as
        $$ select coalesce(bool_or(public.app_puede(ruta)),false) from unnest($1) ruta $$;
      create function fin_normalizar_texto(text) returns text language sql immutable as $$ select upper(btrim($1)) $$;
      create table historico(id uuid, periodo date,fecha_documento date,numero_documento text,proveedor text,
        concepto text,valor numeric,observaciones text,cuenta_codigo text,tipo_documento text);
      create view fin_vw_resultado_clasificacion_detalle as select * from historico;
      grant select on fin_vw_resultado_clasificacion_detalle to authenticated;
    `)
    for (const nombre of ["202611140001_compras_sri","202611150001_compras_sri_edicion_abonos",
      "202611170001_compras_documentos_manuales","202611170003_fin_cuentas_por_pagar_compras",
      "202611170004_compras_excel_anual","202608150110_roles_pago_mensuales",
      "202611180001_nomina_programacion_personal","202611180002_nomina_cuentas_por_pagar"]) await db.exec(await leer(nombre))
    const sql = await leer("202611200002_finanzas_permisos_asignados")
    await db.exec(sql)
    await db.exec(sql)
    await db.query("insert into compras_sri(clave_acceso,fecha_emision,datos,xml_original) values($1,current_date,$2,'<xml/>')",
      [clave,JSON.stringify({ clave,serie:"SRI-1",proveedor:"Proveedor SRI",total:"100",subtotal:"100",items:[],impuestos:[] })])
    await db.exec(`
      insert into compras_excel_cargas values('${"a".repeat(64)}','Prueba.xlsx','Hoja1',2026,'{}',now());
      insert into compras_excel_documentos(id,archivo_hash,tipo,numero,proveedor,descripcion,total,neto,pagado,pagos,observaciones,filas)
        values('${persona}','${"a".repeat(64)}','FACTURA','F-1','Proveedor Excel','Material',40,40,0,'[]','','[]');
      insert into compras_documentos_manuales(id,tipo,fecha_documento,numero_documento,proveedor,concepto,subtotal)
        values('${persona}','NOTA_VENTA',current_date,'N-1','Manual','Insumos',20);
      insert into historico values('${persona}','2026-11-01','2026-11-01','NV-ANT','Histórico','Servicio',30,null,'1.1','NOTA_VENTA');
      set role authenticated;
    `)
    assert.equal((await db.query("select count(*)::int n from compras_sri")).rows[0].n,0)
    assert.equal((await db.query("select count(*)::int n from fin_consultar_cuentas()")).rows[0].n,4)
    await db.query("select fin_pagar_compra($1,$2,10,current_date,'REF',null,false)", ["sri:"+clave,persona])
    assert.equal((await db.query("select saldo::int from fin_consultar_cuentas() where id=$1",["sri:"+clave])).rows[0].saldo,90)
    await assert.rejects(db.query("select fin_programar_compras('2026-11-16',$1)",[JSON.stringify([{id:"sri:"+clave,monto:20}])]),/administrador/)
    await assert.rejects(db.query("select fin_pagar_compra($1,$2,10,current_date,'REF','2026-11-16',false)",["sri:"+clave,"11111111-1111-1111-1111-111111111111"]),/pagos semanales/)
    await db.query("reset role")
    await db.query("insert into fin_programacion_compras(semana,documento_id,monto,confirmado_por) values('2026-11-16',$1,20,$2)",["sri:"+clave,uid])
    await db.query("set role authenticated")
    await assert.rejects(db.query("select compras_sri_abonar($1,$2,5,current_date,'REF')",[clave,"11111111-1111-1111-1111-111111111111"]),/factura programada/)
    await db.query("select fin_guardar_personal($1,'Personal Prueba','ADMINISTRACION',true,'EXTERNO')",[persona])
    assert.equal((await db.query("select nombre from fin_consultar_personal() where id=$1",[persona])).rows[0].nombre,"Personal Prueba")
    await db.query("select fin_cargar_nomina_cuentas('2026-11-01','PRIMERA_QUINCENA',$1)",[JSON.stringify([{empleado_id:persona,monto:"300"}])])
    assert.equal((await db.query("select count(*)::int n from fin_consultar_cuentas() where tipo='NOMINA'")).rows[0].n,1)
    assert.equal((await db.query("select count(*)::int n from fin_consultar_roles_importados()")).rows[0].n,0)
    assert.equal((await db.query("select count(*)::int n from fin_consultar_resumen_roles()")).rows[0].n,0)
    await db.exec(`reset role; update app_user_permissions set permitido=false where user_id='${uid}'; set role authenticated`)
    await assert.rejects(db.query("select * from fin_consultar_cuentas()"),/permiso/)
    await assert.rejects(db.query("select * from fin_consultar_personal()"),/permiso/)
    await assert.rejects(db.query("select fin_guardar_personal($1,'Personal Prueba','ADMINISTRACION',true,'EXTERNO')",[persona]),/permiso/)
    await db.exec(`reset role; update app_user_permissions set permitido=true; update app_profiles set activo=false; set role authenticated`)
    await assert.rejects(db.query("select * from fin_consultar_cuentas()"),/permiso/)
    await db.exec("set role anon")
    await assert.rejects(db.query("select * from fin_consultar_cuentas()"),/permission denied/)
    await assert.rejects(db.query("select * from fin_consultar_personal()"),/permission denied/)
  } finally {
    await db.close()
  }
})
