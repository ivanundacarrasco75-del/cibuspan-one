// PostgreSQL aislado: instalar @electric-sql/pglite o indicar CIBUSPAN_SQL_TEST_MODULE.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const { PGlite } = await import(process.env.CIBUSPAN_SQL_TEST_MODULE || '@electric-sql/pglite')
const ids = {
  admin: '00000000-0000-0000-0000-000000000001', kam: '00000000-0000-0000-0000-000000000002', mercaderista: '00000000-0000-0000-0000-000000000003',
  cliente: '00000000-0000-0000-0000-000000000010', otroCliente: '00000000-0000-0000-0000-000000000011',
  local: '00000000-0000-0000-0000-000000000020', otroLocal: '00000000-0000-0000-0000-000000000021', visita: '00000000-0000-0000-0000-000000000030',
}

test('La migración permite proponer la primera referencia, restringe su aprobación y limita las fotos a clientes permitidos', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth; create schema storage; create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create table public.app_profiles(user_id uuid primary key, nombre text, email text, rol text, activo boolean);
      create table public.campo_clientes(usuario_id uuid, cliente_id uuid);
      create function public.app_puede(text, uuid) returns boolean language sql stable as $$
        select exists(select 1 from public.app_profiles where user_id = $2 and activo) $$;
      create function public.com_es_gerencia_kpi() returns boolean language sql stable as $$
        select exists(select 1 from public.app_profiles where user_id = auth.uid() and activo and rol in ('ADMINISTRADOR','GERENTE')) $$;
      create function public.com_puede_ver_cliente_campo(uuid) returns boolean language sql stable as $$
        select public.com_es_gerencia_kpi() or exists(select 1 from public.campo_clientes where usuario_id = auth.uid() and cliente_id = $1) $$;
      create table public.com_locales_monitoreados(id uuid primary key, cliente_id uuid, nombre text, activo boolean,
        actualizado_en timestamptz, actualizado_por uuid);
      create table public.com_visitas_campo(id uuid primary key, cliente_id uuid, local_monitoreado_id uuid, registrado_por uuid,
        estado text, latitud numeric, longitud numeric, precision_metros numeric, visitado_en timestamptz);
      create table public.com_visitas_campo_sku(id uuid default gen_random_uuid(), visita_id uuid, capturas_app text[], fotos_percha text[], datos_ia jsonb);
      create table storage.objects(name text, bucket_id text);
      alter table storage.objects enable row level security;
      grant usage on schema public, storage, auth to authenticated;
      grant select on all tables in schema public, storage to authenticated;
      insert into public.app_profiles values
        ('${ids.admin}', 'Administrador', 'admin@example.com', 'ADMINISTRADOR', true),
        ('${ids.kam}', 'KAM', 'kam@example.com', 'KAM', true),
        ('${ids.mercaderista}', 'Mercaderista', 'merc@example.com', 'MERCADERISTA', true);
      insert into public.campo_clientes values ('${ids.kam}', '${ids.cliente}'), ('${ids.mercaderista}', '${ids.cliente}');
      insert into public.com_locales_monitoreados values
        ('${ids.local}', '${ids.cliente}', 'SUPERMAXI IÑAQUITO', true, null, null),
        ('${ids.otroLocal}', '${ids.otroCliente}', 'OTRO LOCAL', true, null, null);
      insert into public.com_visitas_campo values ('${ids.visita}', '${ids.cliente}', '${ids.local}', '${ids.mercaderista}',
        'CONFIRMADA', -0.2, -78.5, 10, '2026-10-05T15:00:00Z');
      insert into public.com_visitas_campo_sku(visita_id, capturas_app, fotos_percha, datos_ia) values
        ('${ids.visita}', array['merc/captura.jpg'], array['merc/percha.jpg'],
        '{"nombre_local_ocr":"Supermaxi Inaquito","local_captura_coincide":true}');
      insert into storage.objects values ('merc/percha.jpg', 'visitas-campo'), ('merc/captura.jpg', 'visitas-campo'), ('sin-visita.jpg', 'visitas-campo');
    `)
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/202610050001_georreferencia_locales_campo.sql', import.meta.url), 'utf8'))
    const usuario = (id) => db.query("select set_config('test.user_id', $1, false)", [id])
    const catalogo = async () => (await db.query('select public.com_kpi_campo_georeferencias() as datos')).rows[0].datos
    await usuario(ids.admin)
    const propuesta = (await catalogo()).find((l) => l.id === ids.local).propuesta
    assert.equal(propuesta.nombre_captura, 'Supermaxi Inaquito')
    assert.equal(propuesta.latitud, -0.2)
    await db.exec('update public.com_visitas_campo set precision_metros = 200')
    assert.equal((await catalogo()).find((l) => l.id === ids.local).propuesta, null)
    await db.exec(`update public.com_visitas_campo set precision_metros = 10;
      update public.com_visitas_campo_sku set datos_ia = jsonb_set(datos_ia, '{local_captura_coincide}', 'false'::jsonb)`)
    assert.equal((await catalogo()).find((l) => l.id === ids.local).propuesta, null)
    await db.exec(`update public.com_visitas_campo_sku set datos_ia = jsonb_set(datos_ia, '{local_captura_coincide}', 'true'::jsonb);
      insert into public.com_locales_monitoreados(id,cliente_id,nombre,activo) values
      ('00000000-0000-0000-0000-000000000022', '${ids.cliente}', 'SUPERMAXI INAQUITO', true)`)
    assert.equal((await catalogo()).find((l) => l.id === ids.local).propuesta, null)
    await db.exec("delete from public.com_locales_monitoreados where id = '00000000-0000-0000-0000-000000000022'")
    await usuario(ids.mercaderista)
    assert.equal((await catalogo()).length, 1)
    assert.equal((await catalogo())[0].propuesta, null)
    await assert.rejects(db.query("select public.com_kpi_campo_guardar_georreferencia($1, '', -0.2, -78.5, 150)", [ids.local]), /Solo gerencia/)
    await usuario(ids.kam)
    await db.exec('set role authenticated')
    assert.deepEqual((await db.query('select name from storage.objects order by name')).rows.map((r) => r.name), ['merc/captura.jpg', 'merc/percha.jpg'])
    await db.exec('reset role')
    await db.query('delete from public.campo_clientes where usuario_id = $1', [ids.kam])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select name from storage.objects')).rows.length, 0)
    await db.exec('reset role')
    await usuario(ids.admin)
    await assert.rejects(db.query("select public.com_kpi_campo_guardar_georreferencia($1, '', 91, -78.5, 150)", [ids.local]), /Revisa coordenadas/)
    await db.query("select public.com_kpi_campo_guardar_georreferencia($1, 'Dirección revisada', -0.2, -78.5, 150)", [ids.local])
    const confirmado = (await catalogo()).find((l) => l.id === ids.local)
    assert.equal(confirmado.direccion, 'Dirección revisada')
    assert.equal(confirmado.propuesta, null)
    assert.ok(confirmado.referencia_actualizada_en)
    assert.equal((await db.query('select count(*)::int as n from public.com_visitas_campo')).rows[0].n, 1)
  } finally { await db.close() }
})
