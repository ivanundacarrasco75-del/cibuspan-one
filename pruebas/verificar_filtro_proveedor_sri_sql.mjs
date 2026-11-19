import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

const migracion = nombre => readFile(new URL(`../supabase/migrations/${nombre}`, import.meta.url), "utf8")

test("busca por prefijo y pagina únicamente las facturas del proveedor visible para administradores", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function app_es_admin() returns boolean language sql as
      $$ select current_setting('prueba.admin', true) = 'si' $$;
    `)
    for (const archivo of [
      "202611140001_compras_sri.sql", "202611150001_compras_sri_edicion_abonos.sql",
      "202611170002_compras_sri_filtro_proveedor.sql",
    ]) await db.exec(await migracion(archivo))
    await db.exec(`
      insert into compras_sri (clave_acceso, fecha_emision, datos, edicion, xml_original)
      select lpad(i::text,49,'0'), date '2026-11-17' - i,
        jsonb_build_object('serie',i,'proveedor',case when i < 29 then 'Álamo, S.A. (Norte)' else 'Alamos Sur' end),
        case when i = 28 then '{"proveedor":"Bodega Editada"}'::jsonb else '{}'::jsonb end,
        'xml'
      from generate_series(1,30) i;
      set role authenticated;
      set prueba.admin = 'no';
    `)
    assert.deepEqual((await db.query("select * from compras_sri_buscar_proveedores('')")).rows, [])
    assert.deepEqual((await db.query("select * from compras_sri_listar_por_proveedor('Álamo, S.A. (Norte)', 0, 26)")).rows, [])
    await db.exec("set prueba.admin = 'si'")
    const nombres = (await db.query("select proveedor from compras_sri_buscar_proveedores('  aLa  ')")).rows.map(x => x.proveedor).sort()
    assert.deepEqual(nombres, ["Alamos Sur", "Álamo, S.A. (Norte)"])
    assert.deepEqual((await db.query("select * from compras_sri_buscar_proveedores('BOD')")).rows, [{ proveedor: "Bodega Editada" }])
    assert.deepEqual((await db.query("select * from compras_sri_buscar_proveedores('%')")).rows, [])
    const primera = (await db.query("select datos, abonos from compras_sri_listar_por_proveedor('Álamo, S.A. (Norte)', 0, 26)")).rows
    assert.deepEqual(primera.map(f => f.datos.serie), Array.from({ length: 26 }, (_, i) => i + 1))
    assert.deepEqual(primera[0].abonos, [])
    const segunda = (await db.query("select datos->'serie' as serie from compras_sri_listar_por_proveedor('Álamo, S.A. (Norte)', 25, 26)")).rows
    assert.deepEqual(segunda, [{ serie: 26 }, { serie: 27 }])
    await db.exec("set role anon")
    await assert.rejects(db.query("select * from compras_sri_buscar_proveedores('')"), /permission denied/)
  } finally {
    await db.close()
  }
})
