import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

const sql = nombre => readFile(new URL(`../supabase/migrations/${nombre}.sql`, import.meta.url), "utf8")
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`
const clave = "1".repeat(49), clave2 = "2".repeat(49)

test("Recepción de compras: entradas atómicas, permisos, fechas, vínculo XML/Excel y reintentos", async () => {
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
      create table app_profiles(user_id uuid,nombre text);
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
      "202611180003_compras_recepcion_mp",
    ]) await db.exec(await sql(nombre))
    const { hoy, corte, ayer, manana } = (await db.query(`select
      (now() at time zone 'America/Guayaquil')::date::text hoy,
      ((now() at time zone 'America/Guayaquil')::date-4)::text corte,
      ((now() at time zone 'America/Guayaquil')::date-1)::text ayer,
      ((now() at time zone 'America/Guayaquil')::date+1)::text manana`)).rows[0]
    const factura = { clave, serie: "001-001-000000001", proveedor: "Proveedor de prueba", total: "30", items: [
      { descripcion: "Saco de harina", cantidad: "1" }, { descripcion: "Fundas", cantidad: "10" },
    ], impuestos: [], pagos: [] }
    await db.query("insert into compras_sri(clave_acceso,fecha_emision,datos,xml_original) values($1,$2,$3,'<original/>'),($4,$2,$5,'<original2/>')",
      [clave, ayer, JSON.stringify(factura), clave2, JSON.stringify({ ...factura, clave: clave2 })])
    await db.exec(`insert into materias_primas values
      ('${id(20)}','HARINA','1','Harina','KG',true),('${id(21)}','FUNDA','2','Fundas','UNIDAD',true),
      ('${id(22)}','SIN-SALDO','3','Sin saldo','KG',true);
      insert into inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,responsable) values
      ('MATERIA_PRIMA','${id(20)}','${corte}','SALDO_INICIAL',100,'Prueba','Prueba'),
      ('MATERIA_PRIMA','${id(21)}','${corte}','SALDO_INICIAL',0,'Prueba','Prueba');
      insert into compras_excel_cargas values('${"a".repeat(64)}','Prueba.xlsx','Hoja1',2026,'{}',now());
      insert into compras_excel_documentos(id,archivo_hash,tipo,numero,proveedor,descripcion,pagado,pagos,sri_clave,observaciones,filas) values
      ('${id(30)}','${"a".repeat(64)}','FACTURA','FACT 1','Proveedor','Harina',0,'[]','${clave}','','[]'),
      ('${id(31)}','${"a".repeat(64)}','FACTURA','FACT 2','Proveedor','Harina sin cantidad',0,'[]',null,'','[]');
      set role authenticated; set test.admin='si'; set test.inventario='si';`)
    const estado = async key => (await db.query("select compras_recepcion_mp_estado($1) d", [key])).rows[0].d
    const base = await estado(clave)
    assert.equal(base.recepcion, null)
    assert.equal(base.puede, true)
    assert.equal(base.articulos.find(a => a.id === id(22)).iniciado, false)
    const lineas = [{ linea: 0, articulo_id: id(20), cantidad: 50 }, { linea: 1, articulo_id: id(21), cantidad: 10 }]
    const enviar = (key = clave, version = base.version, fecha = hoy, filas = lineas, solicitud = id(40)) =>
      db.query("select compras_recepcion_mp_confirmar($1,$2,$3,$4,$5) d", [key, version, fecha, JSON.stringify(filas), solicitud])
    const contar = async () => (await db.query("select count(*)::int n from inv_kardex_movimientos")).rows[0].n
    const n = await contar()
    await assert.rejects(enviar(clave, base.version, manana), /fecha/)
    await assert.rejects(enviar(clave, base.version, corte), /posteriores/)
    await assert.rejects(enviar(clave, "caducada"), /cambió/)
    await assert.rejects(enviar(clave, base.version, hoy, [lineas[0], { ...lineas[1], articulo_id: id(22) }]), /saldo inicial/)
    assert.equal(await contar(), n, "fallar la segunda línea revierte la primera")
    await assert.rejects(enviar(clave, base.version, hoy, [{ ...lineas[0], cantidad: -2 }]), /positiva/)
    await assert.rejects(enviar(clave, base.version, hoy, [{ ...lineas[1], cantidad: 0.5 }]), /enteras/)
    await assert.rejects(enviar(clave, base.version, hoy, [{ ...lineas[0], linea: 20 }]), /pertenece/)
    await assert.rejects(enviar(clave, base.version, hoy, [lineas[0], lineas[0]]), /repetidas/)
    assert.equal((await enviar()).rows[0].d.repetido, false)
    assert.equal((await enviar()).rows[0].d.repetido, true)
    assert.equal((await enviar(`excel:${id(30)}`)).rows[0].d.repetido, true, "XML y Excel enlazados comparten recepción")
    await assert.rejects(enviar(clave, base.version, hoy, lineas, id(41)), /ya tiene/)
    assert.equal(await contar(), n + 2)
    const saldo = (await db.query("select inv_kardex_consultar('MATERIA_PRIMA',$1) d", [id(20)])).rows[0].d
    assert.equal(saldo.saldo_cierre, 150)
    assert.equal(saldo.movimientos.at(-1).clase, "ENTRADA")
    assert.match(saldo.movimientos.at(-1).documento, /001-001/)
    assert.equal((await estado(clave)).recepcion.movimientos.length, 2)
    const excel = await estado(`excel:${id(31)}`)
    assert.equal(excel.recepcion, null)
    await enviar(`excel:${id(31)}`, excel.version, hoy, [lineas[0]], id(43))
    assert.equal((await db.query("select xml_original from compras_sri where clave_acceso=$1", [clave])).rows[0].xml_original, "<original/>")
    assert.equal((await db.query("select count(*)::int n from fin_pagos_compras")).rows[0].n, 0)
    await db.exec("set test.inventario='no'")
    assert.equal((await estado(clave2)).puede, false)
    await assert.rejects(enviar(clave2), /permiso/)
    assert.deepEqual((await db.query("select * from compras_recepciones_mp")).rows, [])
    await db.exec("set test.admin='no'; set test.inventario='si'")
    await assert.rejects(estado(clave2), /acceso/)
    await db.exec("set role anon")
    await assert.rejects(estado(clave2), /permission denied/)
    await assert.rejects(enviar(), /permission denied/)
  } finally { await db.close() }
})
