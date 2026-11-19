import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

const sql = await readFile(new URL("../supabase/migrations/202611170001_compras_documentos_manuales.sql", import.meta.url), "utf8")
const nota = "00000000-0000-0000-0000-000000000001"
const gasto = "00000000-0000-0000-0000-000000000002"
const altaNota = `insert into compras_documentos_manuales
  (id,tipo,fecha_documento,numero_documento,proveedor,concepto,subtotal,iva,retencion)
  values ('${nota}','NOTA_VENTA','2026-11-17','NV-001','Prueba','Insumos',100,15,2)`

test("el registro manual y el histórico se consultan por separado sin crear pagos ni modificar contabilidad", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql as $$ select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
      create function app_puede(text) returns boolean language sql as
      $$ select $1 = 'Administración' and current_setting('prueba.admin', true) = 'si' $$;
      create table historico(id uuid, periodo date, fecha_documento date, numero_documento text, proveedor text,
        concepto text, valor numeric, observaciones text, cuenta_codigo text, tipo_documento text);
      create view fin_vw_resultado_clasificacion_detalle as select * from historico;
      grant select on fin_vw_resultado_clasificacion_detalle to authenticated;
      insert into historico values
        ('${nota}','2026-10-01','2026-10-17','NV-ANT','Histórico','Nota anterior',45,null,'1.1','NOTA_VENTA'),
        ('${gasto}','2026-10-01',null,null,'Histórico','Ajuste anterior',-12,null,'6.2.01.2.14.31','ASIENTO');
    `)
    await db.exec(sql)
    await db.exec(sql)
    await db.exec("set role authenticated; set prueba.admin = 'no'")
    assert.deepEqual((await db.query("select * from compras_vw_documentos")).rows, [])
    await assert.rejects(db.exec(altaNota), /row-level security/)
    await db.exec("set prueba.admin = 'si'")
    await db.exec(altaNota)
    assert.equal((await db.query(altaNota + " on conflict (id) do nothing returning id")).rows.length, 0)
    await db.exec(`insert into compras_documentos_manuales (id,tipo,fecha_documento,proveedor,concepto,subtotal)
      values ('${gasto}','NO_DEDUCIBLE','2026-11-17','Prueba','Gasto manual',25)`)
    const notas = (await db.query("select id,subtotal::text,iva::text,retencion::text,total::text from compras_vw_documentos where tipo='NOTA_VENTA' order by periodo desc")).rows
    assert.deepEqual(notas, [
      { id: `manual:${nota}`, subtotal: "100", iva: "15", retencion: "2", total: "115" },
      { id: `contable:${nota}`, subtotal: null, iva: null, retencion: null, total: "45" },
    ])
    const gastos = (await db.query("select numero_documento,total::text from compras_vw_documentos where tipo='NO_DEDUCIBLE' order by periodo desc")).rows
    assert.deepEqual(gastos, [{ numero_documento: null, total: "25" }, { numero_documento: null, total: "-12" }])
    await assert.rejects(db.exec(altaNota.replace(nota, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").replace("'NV-001'", "null")), /check constraint/)
    await assert.rejects(db.exec("update compras_documentos_manuales set subtotal=0"), /permission denied/)
    await db.exec("set role anon")
    await assert.rejects(db.query("select * from compras_vw_documentos"), /permission denied/)
    await db.exec("reset role")
    assert.equal((await db.query("select count(*)::int as cantidad from historico")).rows[0].cantidad, 2)
  } finally {
    await db.close()
  }
})
