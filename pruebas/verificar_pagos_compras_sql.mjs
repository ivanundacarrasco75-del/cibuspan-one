import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

const sql = nombre => readFile(new URL(`../supabase/migrations/${nombre}.sql`, import.meta.url), "utf8")
const clave = "1".repeat(49)
const factura = `sri:${clave}`
const nota = "manual:00000000-0000-0000-0000-000000000001"
const gasto = "manual:00000000-0000-0000-0000-000000000002"
const historico = "contable:00000000-0000-0000-0000-000000000003"
const fecha = "2026-11-17"
const semana = "2026-11-16"
const migracion = await sql("202611170003_fin_cuentas_por_pagar_compras")

async function preparar(t) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql as $$ select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
    create function app_es_admin() returns boolean language sql as
      $$ select current_setting('prueba.admin', true) = 'si' $$;
    create function app_puede(text) returns boolean language sql as $$ select public.app_es_admin() $$;
    create table historico(id uuid, periodo date, fecha_documento date, numero_documento text, proveedor text,
      concepto text, valor numeric, observaciones text, cuenta_codigo text, tipo_documento text);
    create view fin_vw_resultado_clasificacion_detalle as select * from historico;
    grant select on fin_vw_resultado_clasificacion_detalle to authenticated;
  `)
  for (const nombre of [
    "202611140001_compras_sri", "202611150001_compras_sri_edicion_abonos",
    "202611170001_compras_documentos_manuales",
  ]) await db.exec(await sql(nombre))
  await db.exec(migracion)
  await db.exec(migracion)
  await db.exec(`
    insert into compras_sri (clave_acceso, fecha_emision, datos, xml_original, edicion)
    values ('${clave}', '${fecha}', '{"serie":"001","proveedor":"Proveedor SRI","subtotal":"100","total":"115",
      "impuestos":[{"codigo":"2","valor":"15"}],"items":[{"descripcion":"Insumos"}]}', '<xml/>', '{"total":"120"}');
    insert into compras_documentos_manuales (id,tipo,fecha_documento,numero_documento,proveedor,concepto,subtotal,iva,retencion)
    values (split_part('${nota}',':',2)::uuid,'NOTA_VENTA','${fecha}','NV-1','Proveedor','Nota',100,15,2),
      (split_part('${gasto}',':',2)::uuid,'NO_DEDUCIBLE','${fecha}',null,'Proveedor','Gasto',20,null,null);
    insert into historico values (split_part('${historico}',':',2)::uuid,'2026-10-01','2026-10-10',
      'NV-3','Histórico','Gasto histórico',30,null,'6.2.01.2.14.31','NOTA_VENTA');
    set role authenticated;
    set prueba.admin = 'si';
    select compras_sri_abonar('${clave}','99999999-9999-9999-9999-999999999999',20,'${fecha}','PREVIO');
  `)
  const programar = (filas, dia = semana) => db.query("select fin_programar_compras($1,$2)", [dia, JSON.stringify(filas)])
  const abonar = (id, ultimo, valor, dia = null, verificado = false) => db.query(
    "select fin_pagar_compra($1,$2,$3,$4,$5,$6,$7)",
    [id, `00000000-0000-0000-1111-${String(ultimo).padStart(12, "0")}`, valor, fecha, `REF-${ultimo}`, dia, verificado],
  )
  return { db, programar, abonar }
}

test("consolida compras y sus abonos, programa montos y completa un plan con pagos parciales", async t => {
  const { db, programar, abonar } = await preparar(t)
  const saldos = async () => (await db.query("select id,saldo::int from fin_vw_cuentas_por_pagar_compras order by id")).rows
  assert.deepEqual(await saldos(), [
    { id: historico, saldo: 30 }, { id: nota, saldo: 113 }, { id: gasto, saldo: 20 }, { id: factura, saldo: 100 },
  ])
  const filas = [{ id: factura, monto: 40 }, { id: nota, monto: 100 }]
  await programar(filas)
  await programar(filas)
  await assert.rejects(programar([{ id: nota, monto: 80 }]), /programado con otro monto/)
  await assert.rejects(programar(filas, "2026-11-23"), /ya está en la semana/)
  await assert.rejects(abonar(factura, 1, 10), /Pagos semanales/)
  await assert.rejects(abonar(factura, 1, 41, semana), /importe pendiente/)
  await abonar(factura, 1, 15, semana)
  await abonar(factura, 1, 15, semana)
  await assert.rejects(abonar(factura, 1, 16, semana), /otros datos/)
  await abonar(factura, 2, 25, semana)
  await abonar(nota, 3, 100, semana)
  await abonar(gasto, 4, 20)
  assert.deepEqual(await saldos(), [
    { id: historico, saldo: 30 }, { id: nota, saldo: 13 }, { id: gasto, saldo: 0 }, { id: factura, saldo: 60 },
  ])
  assert.equal((await db.query("select jsonb_array_length(abonos) as abonos from compras_sri")).rows[0].abonos, 3)
  assert.equal((await db.query("select count(*)::int as n from fin_programacion_compras where monto = pagado")).rows[0].n, 2)
})

test("valida históricos, importes, transacciones completas y permisos de las tres operaciones", async t => {
  const { db, programar, abonar } = await preparar(t)
  await assert.rejects(programar([{ id: nota, monto: 12 }, { id: factura, monto: 101 }]), /supera el saldo/)
  assert.equal((await db.query("select count(*)::int as n from fin_programacion_compras")).rows[0].n, 0)
  await assert.rejects(programar([{ id: historico, monto: 12 }]), /Verifica el saldo/)
  await assert.rejects(programar([{ id: nota, monto: 2.345 }]), /no es válido/)
  await assert.rejects(abonar(historico, 5, 30), /Verifica el saldo/)
  await programar([{ id: historico, monto: 30, verificado: true }])
  await db.query("select fin_quitar_compra_programada($1,$2)", [semana, historico])
  await abonar(historico, 5, 30, null, true)
  await programar([{ id: nota, monto: 30 }])
  await abonar(nota, 6, 15, semana)
  await assert.rejects(db.query("select fin_quitar_compra_programada($1,$2)", [semana, nota]), /tiene pagos/)
  await db.exec("set prueba.admin = 'no'")
  assert.deepEqual((await db.query("select * from fin_vw_cuentas_por_pagar_compras")).rows, [])
  await assert.rejects(programar([{ id: gasto, monto: 2 }]), /administrador/)
  await assert.rejects(abonar(gasto, 7, 2), /administrador/)
  await assert.rejects(db.query("select fin_quitar_compra_programada($1,$2)", [semana, nota]), /administrador/)
  await db.exec("set role anon")
  await assert.rejects(db.query("select * from fin_vw_cuentas_por_pagar_compras"), /permission denied/)
  await assert.rejects(abonar(gasto, 7, 2), /permission denied/)
})
