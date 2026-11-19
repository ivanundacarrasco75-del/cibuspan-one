import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

const leer = nombre => readFile(new URL(`../supabase/migrations/${nombre}.sql`, import.meta.url), "utf8")
const migracion = await leer("202611180001_nomina_programacion_personal")
const empleado = "00000000-0000-0000-0000-000000000001"
const externo = "00000000-0000-0000-0000-000000000002"
const retirado = "00000000-0000-0000-0000-000000000003"
const semana = "2026-11-16"

async function preparar(t) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql as $$ select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
    create function app_es_admin() returns boolean language sql as $$ select current_setting('prueba.admin',true)='si' $$;
    create function app_puede(text) returns boolean language sql as $$ select public.app_es_admin() $$;
    create function app_puede_alguna(text[]) returns boolean language sql as $$ select public.app_es_admin() $$;
    create function fin_normalizar_texto(text) returns text language sql immutable as $$ select upper(btrim($1)) $$;
    create table historico(id uuid, periodo date, fecha_documento date, numero_documento text, proveedor text,
      concepto text, valor numeric, observaciones text, cuenta_codigo text, tipo_documento text);
    create view fin_vw_resultado_clasificacion_detalle as select * from historico;
    grant select on fin_vw_resultado_clasificacion_detalle to authenticated;
  `)
  for (const nombre of ["202611140001_compras_sri", "202611150001_compras_sri_edicion_abonos",
    "202611170001_compras_documentos_manuales", "202611170003_fin_cuentas_por_pagar_compras",
    "202608150110_roles_pago_mensuales"]) await db.exec(await leer(nombre))
  await db.exec(migracion)
  await db.exec(migracion)
  const correccion = await leer("202611180002_nomina_cuentas_por_pagar")
  await db.exec(correccion)
  await db.exec(correccion)
  await db.exec("set role authenticated; set prueba.admin='si'")
  const guardar = (id, nombre, activo, tipo) => db.query(
    "select fin_guardar_personal($1,$2,'ADMINISTRACION',$3,$4)", [id, nombre, activo, tipo])
  await guardar(empleado, "Persona Uno", true, "NOMINA")
  await guardar(externo, "Persona Externa", true, "EXTERNO")
  await guardar(retirado, "Persona Retirada", false, "NOMINA")
  const cargar = (filas, concepto = "PRIMERA_QUINCENA", periodo = "2026-11-01") =>
    db.query("select fin_cargar_nomina_cuentas($1,$2,$3)", [periodo, concepto, JSON.stringify(filas)])
  return { db, guardar, cargar }
}

test("carga nómina y externos a cuentas por pagar y solo programa los documentos elegidos después", async t => {
  const { db, cargar } = await preparar(t)
  const filas = [{ empleado_id: empleado, monto: "300.00" }, { empleado_id: externo, monto: "125.50" }]
  await cargar(filas)
  await cargar(filas)
  assert.equal((await db.query("select count(*)::int as n from fin_nomina_obligaciones")).rows[0].n, 2)
  assert.equal((await db.query("select count(*)::int as n from fin_programacion_compras")).rows[0].n, 0)
  await db.query("select fin_cargar_nomina_semanal('2026-11-01','PRIMERA_QUINCENA',$1,$2)", [semana, JSON.stringify(filas)])
  assert.equal((await db.query("select count(*)::int as n from fin_programacion_compras")).rows[0].n, 0)
  const cuenta = (await db.query("select id,saldo::text from fin_vw_cuentas_por_pagar_compras where proveedor='Persona Uno'")).rows[0]
  assert.equal(cuenta.saldo, "300.00")
  await db.query("select fin_programar_compras($1,$2)", [semana, JSON.stringify([{ id: cuenta.id, monto: "100.00" }])])
  assert.equal((await db.query("select count(*)::int as n from fin_programacion_compras")).rows[0].n, 1)
  await assert.rejects(cargar([{ empleado_id: empleado, monto: "301" }]), /otro monto/)
  const pagar = id => db.query("select fin_pagar_compra($1,$2,100,'2026-11-18','DEP-1',$3,false)", [cuenta.id, id, semana])
  const pago = "11111111-1111-1111-1111-111111111111"
  await pagar(pago)
  await pagar(pago)
  assert.equal((await db.query("select saldo::text from fin_vw_cuentas_por_pagar_compras where id=$1", [cuenta.id])).rows[0].saldo, "200.00")
  assert.equal((await db.query("select pagado::text from fin_programacion_compras where documento_id=$1", [cuenta.id])).rows[0].pagado, "100.00")
  for (const concepto of ["SEGUNDA_QUINCENA", "DECIMO_TERCERO", "DECIMO_CUARTO", "DECIMO_SEXTO"]) {
    await cargar([{ empleado_id: empleado, monto: "20.00" }], concepto)
  }
  assert.equal((await db.query("select count(*)::int as n from fin_nomina_obligaciones")).rows[0].n, 6)
})

test("valida activos, montos, autorización y conserva desvinculados al importar roles históricos", async t => {
  const { db, cargar, guardar } = await preparar(t)
  await assert.rejects(cargar([{ empleado_id: empleado, monto: "300" }, { empleado_id: retirado, monto: "300" }]), /no está activa/)
  assert.equal((await db.query("select count(*)::int as n from fin_nomina_obligaciones")).rows[0].n, 0)
  await assert.rejects(cargar([{ empleado_id: empleado, monto: "0" }]), /monto/)
  await assert.rejects(cargar([{ empleado_id: empleado, monto: "3.333" }]), /monto/)
  await assert.rejects(cargar([{ empleado_id: empleado, monto: "300" }], "OTRO"), /concepto/)
  await guardar(externo, "Persona Externa", false, "EXTERNO")
  await db.query("select fin_importar_nomina_pdf('2026-10-01','reporte.pdf','hash',$1)", [JSON.stringify([{
    empleado: "Persona Externa", area: "ADMINISTRACION", rubro: "SUELDO", ingresos: 20, egresos: 0,
    mostrar_rol: true, provision: false, numero_linea: 1,
  }])])
  const persona = (await db.query("select activo,tipo_vinculo from fin_nomina_empleados where id=$1", [externo])).rows[0]
  assert.deepEqual(persona, { activo: false, tipo_vinculo: "EXTERNO" })
  await db.exec("set prueba.admin='no'")
  await assert.rejects(cargar([{ empleado_id: empleado, monto: "300" }]), /administrador/)
  await assert.rejects(guardar(empleado, "Persona Uno", true, "NOMINA"), /permiso/)
  assert.deepEqual((await db.query("select * from fin_nomina_obligaciones")).rows, [])
  await db.exec("set role anon")
  await assert.rejects(cargar([{ empleado_id: empleado, monto: "300" }]), /permission denied/)
})
