import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { PGlite } from "@electric-sql/pglite"

const migracion = nombre => readFile(new URL(`../supabase/migrations/${nombre}.sql`, import.meta.url), "utf8")
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`

test("Corte PT sobre el arranque instalado: valida, concilia y conserva los demás saldos", async () => {
  const db = new PGlite()
  try {
    // Esquema mínimo del circuito. El observador simula el delta normal del Kardex PT.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '${id(1)}'::uuid $$;
      create function app_exigir_operacion(text[]) returns void language plpgsql as $$ begin return; end $$;
      create function inv_kardex_validar_mp(p_articulo_id uuid) returns void language plpgsql as $$ begin return; end; $$;
      create function inv_inicio_proteger_fecha() returns trigger language plpgsql as $$ begin return new; end; $$;
      create function inv_inicio_proteger_lote() returns trigger language plpgsql as $$ begin return new; end; $$;
      create table app_profiles (user_id uuid, activo boolean, rol text, nombre text);
      create table productos (id uuid primary key, codigo text, nombre text, activo boolean);
      create table materias_primas (id uuid primary key, codigo text, codigo_contable text, nombre text, unidad_base text, activo boolean);
      create table semielaborado_tipos (id uuid primary key, producto_base_id uuid, nombre text, activo boolean);
      create table inventario_semielaborados (id uuid primary key, semielaborado_tipo_id uuid, fecha_produccion date,
        lote_interno text, cantidad_inicial integer, actualizado_en timestamptz, creado_por uuid);
      create table conversiones_semielaborados (id uuid primary key, inventario_semielaborado_id uuid, cantidad integer, fecha_elaboracion_etiqueta date);
      create table inventario_lotes (id uuid primary key, producto_id uuid, lote text, fecha_produccion date,
        fecha_ingreso_bodega date, fecha_vencimiento date, cantidad integer, inv_archivo_id uuid, actualizado_en timestamptz, creado_por uuid);
      create table inv_kardex_movimientos (id bigint generated always as identity primary key, tipo text, articulo_id uuid,
        clase text, fecha date, cantidad numeric, motivo text, documento text, creado_por uuid, responsable text, solicitud_id uuid);
      create table pedidos (id uuid primary key, estado text, fecha_entrega date);
      create table pedido_detalles (id uuid primary key);
      create table reservas_inventario (id uuid primary key, pedido_id uuid, estado text, creado_en timestamptz);
      create table reserva_detalles (id uuid primary key);
      create table producciones (id uuid primary key, fecha_produccion_general date);
      create table produccion_detalles (id uuid primary key, fecha_produccion date);
      create table pro_consumos_detalle (id uuid primary key);
      create function observar_pt() returns trigger language plpgsql as $$
      declare delta integer; contexto jsonb;
      begin
        delta:=new.cantidad-coalesce(old.cantidad,0);
        contexto:=nullif(current_setting('cibuspan.kardex_contexto',true),'')::jsonb;
        if delta<>0 then
          insert into inv_kardex_movimientos(tipo,articulo_id,clase,fecha,cantidad)
          values('PRODUCTO_TERMINADO',new.producto_id,'CONTEO',coalesce((contexto->>'fecha')::date,current_date),delta);
        end if;
        return new;
      end $$;
      create trigger observar_pt after insert or update on inventario_lotes for each row execute function observar_pt();
    `)
    await db.exec(await migracion("202610240001_arranque_operativo"))
    await db.exec(`
      grant truncate, references, trigger on inv_arranque_cortes, inv_arranque_solicitudes,
        pro_consumos_detalle to authenticated, service_role;
      grant select on pro_consumos_detalle to authenticated;
    `)
    const sqlPt = await migracion("202611160001_arranque_producto_terminado")
    await db.exec(sqlPt)
    await db.exec(sqlPt)
    const [permisos] = (await db.query(`
      select has_table_privilege('authenticated','inv_arranque_cortes','TRUNCATE') as vaciar_corte,
             has_table_privilege('service_role','inv_arranque_solicitudes','TRUNCATE') as vaciar_solicitudes,
             has_table_privilege('authenticated','pro_consumos_detalle','TRUNCATE') as vaciar_consumos,
             has_table_privilege('authenticated','pro_consumos_detalle','SELECT') as leer_consumos
    `)).rows
    assert.deepEqual(permisos, { vaciar_corte: false, vaciar_solicitudes: false, vaciar_consumos: false, leer_consumos: true })

    const hoy = "(now() at time zone 'America/Guayaquil')::date"
    await db.exec(`
      insert into app_profiles values ('${id(1)}',true,'ADMINISTRADOR','Ensayo');
      insert into productos values ('${id(2)}','PT','Pan',true);
      insert into materias_primas values ('${id(3)}','MP',null,'Harina','KG',true);
      insert into semielaborado_tipos values ('${id(4)}','${id(2)}','Base',true);
      insert into inventario_semielaborados(id,semielaborado_tipo_id,fecha_produccion,lote_interno,cantidad_inicial)
      values ('${id(5)}','${id(4)}',${hoy},'Base',7);
      insert into inventario_lotes(id,producto_id,lote,fecha_produccion,fecha_ingreso_bodega,fecha_vencimiento,cantidad)
      values ('${id(6)}','${id(2)}','EXISTENTE',${hoy}-1,${hoy}-1,${hoy}+20,10),
             ('${id(7)}','${id(2)}','NO CONTADO',${hoy}-1,${hoy}-1,${hoy}+20,3);
      update inv_kardex_movimientos set fecha=${hoy}-1;
      insert into inv_kardex_movimientos(tipo,articulo_id,clase,fecha,cantidad)
      values ('MATERIA_PRIMA','${id(3)}','ENTRADA',${hoy},20);
      insert into pedidos values ('${id(8)}','INGRESADO',${hoy});
      insert into reservas_inventario values ('${id(9)}','${id(8)}','ACTIVA',now());
    `)

    const [{ cierre, vence }] = (await db.query(`select (${hoy}-1)::text cierre, (${hoy}+20)::text vence`)).rows
    const datos = {
      version: 1, alcance: "PT", nota: "Conteo de bodega",
      mp: [], semi: [],
      pt: [{ id: id(2), total: 9, lotes: [
        { id: id(6), lote: "EXISTENTE", fecha_produccion: cierre, fecha_vencimiento: vence, cantidad: 4 },
        { id: id(10), lote: "NUEVO", fecha_produccion: cierre, fecha_vencimiento: vence, cantidad: 5 },
      ] }],
    }
    const prever = async conteos => (await db.query(
      `select inv_arranque_prever(${hoy},$1::jsonb) as vista`, [JSON.stringify(conteos)]
    )).rows[0].vista
    const confirmar = async token => (await db.query(
      `select inv_arranque_confirmar($1,${hoy},$2::jsonb,$3,true,true,auth.uid()) as resultado`,
      [id(11), JSON.stringify(datos), token]
    )).rows[0].resultado

    await assert.rejects(prever({ ...datos, mp: [{ id: id(3), cantidad: 0 }] }), /solo admite conteos/)
    await assert.rejects(prever({ ...datos, pt: [] }), /Faltan artículos/)
    const { alcance, ...completo } = datos
    await assert.rejects(prever(completo), /Faltan artículos del grupo mp/)
    assert.equal((await prever(datos)).puede_aplicar, false)
    await db.exec("update reservas_inventario set estado='LIBERADA'")

    const vista = await prever(datos)
    assert.ok(vista.puede_aplicar)
    assert.deepEqual(vista.lineas.map(({ grupo, sistema, conteo }) => [grupo, sistema, conteo]), [["pt", 13, 9]])
    await db.exec(`update pedidos set fecha_entrega=${hoy}+1`)
    await assert.rejects(confirmar(vista.token), /cambiaron desde la vista previa/)
    const vigente = await prever(datos)
    assert.equal((await confirmar(vigente.token)).repetido, false)
    assert.equal((await confirmar(vigente.token)).repetido, true)
    assert.deepEqual((await db.query("select cantidad from inventario_lotes order by id")).rows.map(r => r.cantidad), [4, 0, 5])
    assert.equal((await db.query("select sum(cantidad) saldo from inv_kardex_movimientos where tipo='PRODUCTO_TERMINADO'")).rows[0].saldo, "9")
    assert.equal((await db.query("select sum(cantidad) saldo from inv_kardex_movimientos where tipo='MATERIA_PRIMA'")).rows[0].saldo, "20")
    assert.equal((await db.query("select cantidad_inicial from inventario_semielaborados")).rows[0].cantidad_inicial, 7)
    assert.equal((await db.query("select estado from pedidos")).rows[0].estado, "INGRESADO")
    assert.equal((await db.query("select inv_arranque_estado()->>'alcance' alcance")).rows[0].alcance, "PT")
    await assert.rejects(db.exec(`delete from inventario_lotes where id='${id(6)}'`), /No se elimina un lote/)
    await db.exec(`
      insert into inv_kardex_movimientos(tipo,articulo_id,clase,fecha,cantidad)
      values ('MATERIA_PRIMA','${id(3)}','ENTRADA',${hoy}-1,5);
    `)
  } finally {
    await db.close()
  }
})
