import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const sql = nombre => readFile(new URL('../supabase/migrations/'+nombre+'.sql', import.meta.url),'utf8')
const id = n => '00000000-0000-0000-0000-'+String(n).padStart(12,'0')
const clave = '1'.repeat(49)

test('SRI autorizado permite XML, Excel, filtros, edición y detalle, y revocar cierra RLS y RPC', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select '${id(1)}'::uuid $$;
      create function app_es_admin() returns boolean language sql stable as $$ select current_setting('test.admin',true)='si' $$;
      create function app_puede(text) returns boolean language sql stable as $$ select
        case when $1='Administración' then current_setting('test.admin',true)='si'
          else current_setting('test.inventario',true)='si' end $$;
      create table app_profiles(user_id uuid primary key,nombre text,rol text,activo boolean);
      create table app_user_permissions(user_id uuid,pantalla text,permitido boolean,primary key(user_id,pantalla));
      create table productos(id uuid,codigo text,nombre text,activo boolean);
      create table materias_primas(id uuid primary key,codigo text,codigo_contable text,nombre text,unidad_base text,activo boolean);
      create table inventario_lotes(id uuid primary key,producto_id uuid,lote text,cantidad numeric,fecha_produccion date,
        fecha_ingreso_bodega date,fecha_vencimiento date);
      create view stock_disponible_lotes as select id,0::numeric cantidad_reservada from inventario_lotes;
      create table historico(id uuid,periodo date,fecha_documento date,numero_documento text,proveedor text,
        concepto text,valor numeric,observaciones text,cuenta_codigo text,tipo_documento text);
      create view fin_vw_resultado_clasificacion_detalle as select * from historico;
      grant select on fin_vw_resultado_clasificacion_detalle to authenticated;
    `)
    for (const nombre of [
      "202610060001_kardex_inventarios", "202611140001_compras_sri", "202611150001_compras_sri_edicion_abonos",
      "202611170001_compras_documentos_manuales", "202611170002_compras_sri_filtro_proveedor",
      "202611170003_fin_cuentas_por_pagar_compras", "202611170004_compras_excel_anual",
      "202611180003_compras_recepcion_mp", "202611200001_compras_sri_permisos",
    ]) await db.exec(await sql(nombre))

    await db.exec(`
      insert into app_profiles values ('${id(1)}','Operador','JEFA_FACTURACION',true);
      insert into app_user_permissions values ('${id(1)}','Compras · Facturas del SRI',true);
      insert into compras_excel_cargas values ('${'a'.repeat(64)}','Prueba.xlsx','Hoja1',2026,'{}',now());
      insert into compras_excel_documentos(id,archivo_hash,tipo,numero,proveedor,descripcion,total,neto,pagado,pagos,observaciones,filas) values
      ('${id(30)}','${'a'.repeat(64)}','FACTURA','F1','Proveedor Excel','Harina',30,30,0,'[]','','[]'),
      ('${id(31)}','${'a'.repeat(64)}','NOTA_VENTA','N1','Proveedor privado','Nota',10,10,0,'[]','','[]');
      insert into fin_pagos_compras(id,documento_id,valor,fecha,documento,registrado_por) values
      ('${id(40)}','excel:${id(30)}',5,current_date,'Pago factura','${id(1)}'),
      ('${id(41)}','excel:${id(31)}',2,current_date,'Pago nota','${id(1)}');
      set test.admin='no'; set test.inventario='no'; set role authenticated;
    `)
    assert.equal((await db.query('select compras_sri_puede() puede')).rows[0].puede,true)
    await db.query("insert into compras_sri(clave_acceso,fecha_emision,datos,xml_original) values ($1,current_date,$2,'<xml/>')",
      [clave, JSON.stringify({ clave, proveedor:'Proveedor XML', total:'30', items:[], pagos:[] })])
    await db.query('update compras_sri set ride_leido=true where clave_acceso=$1',[clave])
    assert.equal((await db.query('select ride_leido from compras_sri')).rows[0].ride_leido,true)
    assert.equal((await db.query('select * from compras_vw_facturas')).rows.length,2)
    assert.deepEqual((await db.query("select proveedor from compras_sri_buscar_proveedores('Proveedor')")).rows,
      [{proveedor:'Proveedor Excel'},{proveedor:'Proveedor XML'}])
    assert.equal((await db.query('select count(*)::int n from compras_excel_documentos')).rows[0].n,1)
    assert.equal((await db.query('select count(*)::int n from fin_pagos_compras')).rows[0].n,1)
    assert.equal(Number((await db.query("select pagado_actual from compras_vw_excel where tipo='FACTURA'")).rows[0].pagado_actual),5)
    await db.query("select compras_sri_editar($1,'descripcion','Actualizada')",[clave])
    assert.equal((await db.query('select edicion from compras_sri')).rows[0].edicion.descripcion,'Actualizada')
    const estado = async key => (await db.query('select compras_recepcion_mp_estado($1) d',[key])).rows[0].d
    assert.equal((await estado(clave)).puede,false)
    assert.equal((await estado('excel:'+id(30))).puede,false)
    await assert.rejects(db.query("select compras_sri_editar($1,'total','-1')",[clave]), /importe/)
    await assert.rejects(db.query('select compras_recepcion_mp_confirmar($1,$2,current_date,$3,$4)',[clave,'v','[]',id(60)]), /permiso/)
    await assert.rejects(db.query('select compras_sri_abonar($1,$2,1,current_date,$3)',[clave,id(50),'Pago']), /administrador/)
    await assert.rejects(db.query('delete from compras_sri'), /permission denied/)
    await db.exec(`reset role; update app_user_permissions set permitido=false; set role authenticated;`)
    assert.equal((await db.query('select compras_sri_puede() puede')).rows[0].puede,false)
    assert.deepEqual((await db.query('select * from compras_vw_facturas')).rows,[])
    assert.deepEqual((await db.query("select * from compras_sri_buscar_proveedores('')")).rows,[])
    await assert.rejects(db.query("select compras_sri_editar($1,'descripcion','Sin acceso')",[clave]), /permiso/)
    await assert.rejects(estado(clave), /acceso/)
    await assert.rejects(db.query("insert into compras_sri(clave_acceso,fecha_emision,datos,xml_original) values ($1,current_date,'{}','xml')",['2'.repeat(49)]), /row-level security/)
    for (const cambios of ["update app_user_permissions set permitido=true; update app_profiles set activo=false",
      "update app_profiles set activo=true,rol='ADMINISTRADOR'; update app_user_permissions set permitido=false"]) {
      await db.exec('reset role; '+cambios+'; set role authenticated;')
      assert.equal((await db.query('select compras_sri_puede() puede')).rows[0].puede,false)
    }
    await db.exec("reset role; delete from app_user_permissions; set test.admin='si'; set role authenticated;")
    assert.equal((await db.query('select compras_sri_puede() puede')).rows[0].puede,true)
    await db.exec('set role anon')
    await assert.rejects(db.query('select compras_sri_puede()'), /permission denied/)
  } finally { await db.close() }
})
