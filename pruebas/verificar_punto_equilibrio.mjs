import assert from "node:assert/strict"
import fs from "node:fs"
import { PGlite } from "@electric-sql/pglite"

const db = new PGlite()
const sql = fs.readFileSync(
  new URL("../CIBUSPAN_ONE_V12_42_PUNTO_EQUILIBRIO.sql", import.meta.url),
  "utf8",
)

await db.exec(`
  create role authenticated;
  create role anon;

  create table public.fin_resultados_mensuales (
    periodo date not null,
    cuenta_codigo text not null,
    valor_original numeric(18,2) not null
  );

  create table public.fin_matriz_clasificacion_cuentas (
    cuenta_codigo text primary key,
    activo boolean not null default true,
    requiere_detalle boolean not null default false,
    impacta_ebitda boolean,
    comportamiento text
  );

  create table public.fin_resultado_clasificacion_detalle (
    periodo date not null,
    cuenta_codigo text not null,
    valor numeric(18,2) not null,
    clasificacion_gerencial text not null,
    comportamiento text
  );

  grant select on public.fin_resultados_mensuales,
    public.fin_matriz_clasificacion_cuentas,
    public.fin_resultado_clasificacion_detalle to authenticated;

  insert into public.fin_matriz_clasificacion_cuentas values
    ('5.1', true, false, true, 'VARIABLE'),
    ('6.1', true, false, true, 'FIJO_RANGO'),
    ('6.2', true, true, true, 'FIJO_RANGO'),
    ('5.9', true, false, true, null),
    ('6.9', true, false, false, 'FIJO_RANGO');

  insert into public.fin_resultados_mensuales values
    ('2026-01-01', '4.1', -1000),
    ('2026-01-01', '5.1', 500),
    ('2026-01-01', '6.1', 200),
    ('2026-01-01', '6.2', 100),
    ('2026-01-01', '6.9', 80),
    ('2026-02-01', '4.1', -1000),
    ('2026-02-01', '5.1', 500),
    ('2026-02-01', '6.1', 200),
    ('2026-02-01', '5.9', 100),
    ('2026-03-01', '4.1', -1200),
    ('2026-03-01', '5.1', 500),
    ('2026-03-01', '5.1', -50),
    ('2026-03-01', '6.1', 300);

  insert into public.fin_resultado_clasificacion_detalle values
    ('2026-01-01', '6.2', 100, 'GASTO_GENERAL', 'FIJO_RANGO');
`)

await db.exec(sql)
await db.exec(sql)

const { rows } = await db.query(`
  select * from public.fin_vw_punto_equilibrio_mensual order by periodo
`)

assert.equal(rows.length, 3)

const enero = rows[0]
assert.equal(Number(enero.ventas_netas), 1000)
assert.equal(Number(enero.costos_variables), 500)
assert.equal(Number(enero.costos_fijos), 300)
assert.equal(Number(enero.margen_contribucion), 500)
assert.equal(Number(enero.margen_contribucion_pct), 50)
assert.equal(Number(enero.punto_equilibrio), 600)
assert.equal(Number(enero.excedente_deficit), 400)
assert.equal(Number(enero.cobertura_pct), 166.67)
assert.equal(enero.clasificacion_completa, true)

const febrero = rows[1]
assert.equal(Number(febrero.costos_sin_clasificar), 100)
assert.equal(febrero.clasificacion_completa, false)
assert.equal(febrero.punto_equilibrio, null)

const marzo = rows[2]
assert.equal(Number(marzo.costos_variables), 450)
assert.equal(Number(marzo.costos_fijos), 300)
assert.equal(Number(marzo.punto_equilibrio), 480)

await db.exec("set role authenticated")
assert.equal((await db.query("select count(*)::int total from public.fin_vw_punto_equilibrio_mensual")).rows[0].total, 3)
await db.exec("reset role; set role anon")
await assert.rejects(
  db.query("select * from public.fin_vw_punto_equilibrio_mensual"),
  /permission denied/,
)
await db.exec("reset role")

console.log("OK: punto de equilibrio, incompletos, créditos, permisos y reinstalación")
await db.close()
