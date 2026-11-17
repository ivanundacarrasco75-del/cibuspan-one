import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

const sql = nombre => readFile(new URL(`../supabase/migrations/${nombre}.sql`, import.meta.url), "utf8")
const clave = "1".repeat(49)
const factura = "00000000-0000-0000-0000-000000000001"
const nota = "00000000-0000-0000-0000-000000000002"
const incompleta = "00000000-0000-0000-0000-000000000003"

test("importa una factura vinculada una vez, conserva XML y calcula abonos y saldo del Excel", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql as $$ select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
      create function app_es_admin() returns boolean language sql as $$ select current_setting('prueba.admin',true)='si' $$;
      create function app_puede(text) returns boolean language sql as $$ select current_setting('prueba.acceso',true)='si' $$;
      create table historico(id uuid, periodo date, fecha_documento date, numero_documento text, proveedor text,
        concepto text, valor numeric, observaciones text, cuenta_codigo text, tipo_documento text);
      create view fin_vw_resultado_clasificacion_detalle as select * from historico;
      grant select on fin_vw_resultado_clasificacion_detalle to authenticated;
    `)
    for (const nombre of [
      "202611140001_compras_sri", "202611150001_compras_sri_edicion_abonos",
      "202611170001_compras_documentos_manuales", "202611170002_compras_sri_filtro_proveedor",
      "202611170003_fin_cuentas_por_pagar_compras", "202611170004_compras_excel_anual",
    ]) await db.exec(await sql(nombre))
    await db.exec(`
      insert into compras_sri(clave_acceso,fecha_emision,datos,xml_original) values
        ('${clave}','2026-11-05','{"clave":"${clave}","proveedor":"Proveedor XML","serie":"001-002-000000097","total":"1725","subtotal":"1500","impuestos":[{"codigo":"2","valor":"225"}],"items":[],"pagos":[]}','<XML original/>');
      insert into compras_excel_cargas values ('${"a".repeat(64)}','Prueba.xlsx','Hoja1',2026,'{}',now());
      insert into compras_excel_documentos(id,archivo_hash,tipo,fecha,numero,proveedor,descripcion,total,iva,neto,pagado,pagos,sri_clave,observaciones,filas)
      values ('${factura}','${"a".repeat(64)}','FACTURA','2026-11-05','FACT 97','Proveedor Excel','Renta',1500,225,1350,800,
        '[{"id":"excel-previo","valor":"800","fecha":"2026-11-13","documento":"EXCEL"}]','${clave}','Origen de prueba','[]'),
        ('${nota}','${"a".repeat(64)}','NOTA_VENTA','2026-11-05','NV 1','Proveedor Nota','Insumo',20,null,20,20,
        '[{"id":"nota-previa","valor":"20","fecha":null,"documento":""}]',null,'Fecha del pago pendiente','[]'),
        ('${incompleta}','${"a".repeat(64)}','NO_DEDUCIBLE',null,'S/F','Proveedor','Dato incompleto',30,null,null,0,'[]',null,'Falta neto','[]');
      set role authenticated; set prueba.admin='si'; set prueba.acceso='si';
    `)
    assert.equal((await db.query("select count(*)::int n from compras_vw_facturas")).rows[0].n, 1)
    const xml = (await db.query("select datos->>'total' total,neto_excel from compras_vw_facturas")).rows[0]
    assert.deepEqual(xml, { total: "1725", neto_excel: "1350" })
    assert.deepEqual((await db.query("select pagado::int,saldo::int from fin_vw_cuentas_por_pagar_compras where id=$1", ["excel:" + factura])).rows, [{ pagado: 800, saldo: 550 }])
    assert.deepEqual((await db.query("select * from compras_sri_buscar_proveedores('prov')")).rows, [{ proveedor: "Proveedor XML" }])
    const pagar = (id, monto, operacion) => db.query("select fin_pagar_compra($1,$2,$3,'2026-11-17','REF',null,false)",
      ["excel:" + id, operacion, monto])
    await assert.rejects(pagar(incompleta, 10, "00000000-0000-0000-0001-000000000001"), /saldo/)
    await pagar(factura, 550, "00000000-0000-0000-0001-000000000002")
    await pagar(factura, 550, "00000000-0000-0000-0001-000000000002")
    assert.deepEqual((await db.query("select pagado::int,saldo::int from fin_vw_cuentas_por_pagar_compras where id=$1", ["excel:" + factura])).rows, [{ pagado: 1350, saldo: 0 }])
    assert.equal((await db.query("select xml_original from compras_sri")).rows[0].xml_original, "<XML original/>")
    assert.equal((await db.query("select jsonb_array_length(abonos) n from compras_sri")).rows[0].n, 0)
    await db.exec("set prueba.admin='no'")
    assert.deepEqual((await db.query("select * from compras_vw_facturas")).rows, [])
    assert.equal((await db.query("select count(*)::int n from compras_vw_documentos_tabla where origen='EXCEL'")).rows[0].n, 2)
    await db.exec("set prueba.acceso='no'")
    assert.deepEqual((await db.query("select * from compras_vw_excel")).rows, [])
    await db.exec("set role anon")
    await assert.rejects(db.query("select * from compras_vw_excel"), /permission denied/)
  } finally {
    await db.close()
  }
})
