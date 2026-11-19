import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

// Exportación de metadatos de la base activa, sin filas de negocio.
// Mismo esquema y vistas de cálculo que usa el simulador.
const ruta = process.env.CIBUSPAN_ALTA_ESQUEMA
if (!ruta) throw new Error("Define CIBUSPAN_ALTA_ESQUEMA con la exportación de metadatos de fórmulas.")
const esquema = JSON.parse((await readFile(ruta, "utf8")).replace(/^\uFEFF/, ""))
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`
const nombre = valor => '"' + valor.replaceAll('"', '""') + '"'

test("Alta atómica con las vistas reales de costeo y catálogo disponible para el simulador", async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('ensayo.usuario',true),'')::uuid $$;
      create function app_exigir_operacion(text[]) returns void language plpgsql as $$
        begin if current_setting('ensayo.permitido',true) is distinct from 'si' then
          raise exception 'Sin permiso' using errcode='42501'; end if; end; $$;
      select set_config('ensayo.usuario','${id(1)}',false),set_config('ensayo.permitido','si',false);
    `)
    for (const tabla of esquema.tablas) {
      const columnas = tabla.columnas.map(c =>
        `${nombre(c.nombre)} ${c.tipo}${c.defecto ? " default " + c.defecto : ""}${c.no_nulo ? " not null" : ""}`
      )
      await db.exec(`create table public.${nombre(tabla.nombre)} (${[...columnas, ...(tabla.restricciones ?? [])].join(",")})`)
    }
    for (const definicion of esquema.funciones) await db.exec(definicion)
    await db.exec(`create trigger validar_componente before insert or update on fm_preformulacion_componentes
      for each row execute function fm_validar_componente_preformulacion()`)
    for (const vista of ["materias_primas_costo_actual", "fm_vw_preformulacion_calculada", "fm_vw_componentes_costeados",
      "fm_vw_costos_formula", "fm_vw_empaques_producto_costeados", "fm_vw_productos_costo_completo",
      "fm_vw_formula_final", "fm_vw_recetas_micro", "fm_vw_micros_costeados", "fm_vw_productos_costeados", "fm_vw_versiones_vigentes"]) {
      await db.exec(`create view public.${nombre(vista)} as ${esquema.vistas[vista]}`)
    }
    await db.exec(await readFile(new URL("../supabase/migrations/202611180004_alta_producto_formula.sql", import.meta.url), "utf8"))
    await db.exec(`
      insert into fm_micros(id,codigo,nombre) values ('${id(15)}','MIC','Micro de ensayo');
      insert into materias_primas(id,codigo,nombre,unidad_base,es_empaque,costo_unitario_referencia) values
        ('${id(10)}','HAR','Harina','KG',false,2),
        ('${id(11)}','AGU','Agua','KG',false,1),
        ('${id(12)}','FUN','Funda','UNIDAD',true,0.1),
        ('${id(13)}','FAL','Sin precio','KG',false,null),
        ('${id(14)}','GRA','En gramos','G',false,1);
    `)
    const datos = {
      codigo: "PAN-NUEVO", nombre: "Pan nuevo", corto: "Pan", descripcion: "",
      panes: 20, rendimiento: 10, vida_util: 30, peso_batch_kg: 15, peso_final_g: 500,
      ingredientes: [
        { materia_prima_id: id(10), porcentaje: 100, harina_base: true, micro_id: null },
        { materia_prima_id: id(11), porcentaje: 50, harina_base: false, micro_id: id(15) },
      ],
      empaques: [{ materia_prima_id: id(12), cantidad: 1 }],
    }
    const guardar = async (solicitud, cambios = {}) => (await db.query(
      "select fm_crear_producto_formula($1,$2::jsonb) resultado", [solicitud, JSON.stringify({ ...datos, ...cambios })]
    )).rows[0].resultado
    const conteo = async () => (await db.query("select count(*)::integer n from productos")).rows[0].n

    await t.test("Costo de la parada dividido entre fundas, con empaque una sola vez", async () => {
      const resultado = await guardar(id(100))
      assert.equal(Number(resultado.costo_materia_prima_unidad), 2.5)
      assert.equal(Number(resultado.costo_empaque_unidad), 0.1)
      assert.equal(Number(resultado.costo_materiales_unidad), 2.6)
      const [fila] = (await db.query(`
        select c.costo_materiales_unidad,v.estado,p.lote_produccion,p.tamano_lote
        from fm_vw_productos_costo_completo c join fm_formula_versiones v on v.id=c.formula_version_id
        join productos p on p.id=c.producto_id where p.id=$1
      `, [resultado.producto_id])).rows
      assert.equal(fila.estado, "VIGENTE")
      assert.equal(Number(fila.costo_materiales_unidad), 2.6)
      assert.equal(fila.lote_produccion, 10)
      assert.equal(fila.tamano_lote, 10)
    })
    await t.test("Una respuesta perdida se reintenta sin repetir producto ni ingredientes", async () => {
      const primero = await guardar(id(100))
      assert.deepEqual(await guardar(id(100)), primero)
      assert.equal(await conteo(), 1)
      assert.equal((await db.query("select count(*)::integer n from fm_preformulacion_componentes")).rows[0].n, 2)
      await assert.rejects(guardar(id(100), { nombre: "Otro" }), /otros datos/)
      await db.exec(`select set_config('ensayo.usuario','${id(2)}',false)`)
      await assert.rejects(guardar(id(100)), /otro usuario/)
      await db.exec(`select set_config('ensayo.usuario','${id(1)}',false)`)
    })
    await t.test("Costos vivos del catálogo actualizan el mismo costo central", async () => {
      await db.exec(`update materias_primas set costo_unitario_referencia=3 where id='${id(10)}'`)
      assert.equal(Number((await db.query("select costo_materiales_unidad from fm_vw_productos_costo_completo")).rows[0].costo_materiales_unidad), 3.6)
    })
    await t.test("Error tardío revierte producto, fórmula, componentes y vínculo", async () => {
      const antes = await conteo()
      await assert.rejects(guardar(id(101), { codigo: "SIN-COSTO", empaques: [{ materia_prima_id: id(13), cantidad: 1 }] }), /empaques activos/)
      assert.equal(await conteo(), antes)
      assert.equal((await db.query("select count(*)::integer n from fm_formulas")).rows[0].n, 1)
      await assert.rejects(guardar(id(101), { codigo: "SIN-COSTO", ingredientes: [
        ...datos.ingredientes, { materia_prima_id: id(13), porcentaje: 5, harina_base: false },
      ] }), /Falta el costo/)
      assert.equal(await conteo(), antes)
    })
    await t.test("Validaciones de base, unidades, duplicados y activación", async () => {
      await assert.rejects(guardar(id(102), { codigo: "BASE", ingredientes: [{ ...datos.ingredientes[0], porcentaje: 90 }] }), /sumar 100/)
      await assert.rejects(guardar(id(102), { codigo: "GRAMOS", ingredientes: [{ ...datos.ingredientes[0], materia_prima_id: id(14) }] }), /requiere un artículo en KG/)
      await assert.rejects(guardar(id(102), { codigo: "DOBLE", ingredientes: [datos.ingredientes[0], datos.ingredientes[0]] }), /una sola vez/)
      await assert.rejects(guardar(id(102)), /código ya existe/)
      await assert.rejects(guardar(id(102), { codigo: "MICRO", ingredientes: [
        datos.ingredientes[0], { ...datos.ingredientes[1], micro_id: id(99) },
      ] }), /inactivo/)
      assert.equal(await conteo(), 1)
    })
    await t.test("Permisos y aislamiento de comprobantes", async () => {
      const [permisos] = (await db.query(`
        select has_function_privilege('anon','fm_crear_producto_formula(uuid,jsonb)','EXECUTE') anon,
          has_function_privilege('authenticated','fm_crear_producto_formula(uuid,jsonb)','EXECUTE') autenticado,
          has_table_privilege('authenticated','fm_altas_producto','SELECT') lectura,
          has_table_privilege('authenticated','fm_altas_producto','INSERT,UPDATE,DELETE,TRUNCATE') escritura
      `)).rows
      assert.deepEqual(permisos, { anon: false, autenticado: true, lectura: false, escritura: false })
      await db.exec("select set_config('ensayo.permitido','no',false)")
      await assert.rejects(guardar(id(103), { codigo: "DENEGADO" }), /Sin permiso/)
      assert.equal(await conteo(), 1)
    })
    await db.exec("select set_config('ensayo.permitido','si',false)")
    // Regla instalada de protección de los componentes de versiones vigentes.
    await db.exec(`
      create function fm_bloquear_eliminacion_componente() returns trigger language plpgsql as $$
      declare estado text; begin
        select v.estado into estado from fm_formula_versiones v where id=old.formula_version_id;
        if estado<>'BORRADOR' then raise exception 'Solo se eliminan componentes de borradores'; end if;
        return old;
      end $$;
      create trigger bloquear_eliminacion before delete on fm_preformulacion_componentes
        for each row execute function fm_bloquear_eliminacion_componente();
    `)
    await db.exec(await readFile(new URL("../supabase/migrations/202611180005_administracion_formulas.sql", import.meta.url), "utf8"))
    const producto = await guardar(id(100))
    const administrar = async (solicitud, accion, objeto) => (await db.query(
      "select fm_administrar_catalogo($1,$2,$3) resultado", [solicitud, accion, objeto]
    )).rows[0].resultado
    await t.test("Bloquear oculta recetas, impresión y costos y desbloquear recupera el mismo costo", async () => {
      await administrar(id(200), "BLOQUEAR", producto.formula_id)
      for (const vista of ["fm_vw_preformulacion_calculada", "fm_vw_componentes_costeados", "fm_vw_costos_formula", "fm_vw_productos_costo_completo",
        "fm_vw_formula_final", "fm_vw_recetas_micro", "fm_vw_micros_costeados", "fm_vw_productos_costeados", "fm_vw_versiones_vigentes"]) {
        assert.equal((await db.query(`select count(*)::integer n from ${vista}`)).rows[0].n, 0)
      }
      assert.equal((await db.query("select activo from fm_formulas")).rows[0].activo, false)
      assert.equal((await db.query("select estado from fm_formula_versiones")).rows[0].estado, "VIGENTE")
      await administrar(id(201), "DESBLOQUEAR", producto.formula_id)
      assert.equal(Number((await db.query("select costo_materiales_unidad from fm_vw_productos_costo_completo")).rows[0].costo_materiales_unidad), 3.6)
    })
    await t.test("Eliminar versión vigente retira sus ingredientes y el costo sin eliminar la fórmula", async () => {
      const respuesta = await administrar(id(202), "ELIMINAR_VERSION", producto.version_id)
      assert.equal(respuesta.version, 1)
      assert.deepEqual(await administrar(id(202), "ELIMINAR_VERSION", producto.version_id), respuesta)
      assert.equal((await db.query("select count(*)::integer n from fm_formula_versiones")).rows[0].n, 0)
      assert.equal((await db.query("select count(*)::integer n from fm_preformulacion_componentes")).rows[0].n, 0)
      assert.equal((await db.query("select count(*)::integer n from fm_formulas")).rows[0].n, 1)
      assert.equal((await db.query("select count(*)::integer n from fm_vw_productos_costo_completo")).rows[0].n, 0)
    })
    await t.test("Una referencia externa impide el borrado completo y revierte las acciones parciales", async () => {
      await db.exec(`create table referencia_externa(formula_id uuid references fm_formulas(id));
        insert into referencia_externa values('${producto.formula_id}')`)
      await assert.rejects(administrar(id(203), "ELIMINAR_FORMULA", producto.formula_id), /foreign key/)
      assert.equal((await db.query("select count(*)::integer n from fm_formula_productos")).rows[0].n, 1)
      assert.equal((await db.query("select count(*)::integer n from fm_acciones_catalogo where solicitud_id=$1", [id(203)])).rows[0].n, 0)
      await db.exec("drop table referencia_externa")
    })
    await t.test("Eliminar fórmula completa es reintentable y un alta atrasada reconoce su eliminación", async () => {
      const respuesta = await administrar(id(203), "ELIMINAR_FORMULA", producto.formula_id)
      assert.deepEqual(await administrar(id(203), "ELIMINAR_FORMULA", producto.formula_id), respuesta)
      assert.equal((await db.query("select count(*)::integer n from fm_formulas")).rows[0].n, 0)
      assert.equal((await db.query("select count(*)::integer n from fm_formula_productos")).rows[0].n, 0)
      await assert.rejects(guardar(id(100)), /fórmula se eliminó/)
      assert.equal(await conteo(), 1)
    })
    await t.test("Las acciones respetan usuario, contenido y permisos, incluidos los reintentos", async () => {
      await assert.rejects(administrar(id(203), "BLOQUEAR", producto.formula_id), /otros datos|solicitud/)
      await db.exec(`select set_config('ensayo.usuario','${id(2)}',false)`)
      await assert.rejects(administrar(id(203), "ELIMINAR_FORMULA", producto.formula_id), /otro usuario/)
      await db.exec("select set_config('ensayo.permitido','no',false)")
      await assert.rejects(administrar(id(203), "ELIMINAR_FORMULA", producto.formula_id), /Sin permiso/)
      assert.equal((await db.query("select has_function_privilege('anon','fm_administrar_catalogo(uuid,text,uuid)','EXECUTE') permitido")).rows[0].permitido, false)
    })
    await db.exec(`select set_config('ensayo.permitido','si',false),set_config('ensayo.usuario','${id(1)}',false)`)
    await db.exec(await readFile(new URL("../supabase/migrations/202611180006_formulacion_parada_micro.sql", import.meta.url), "utf8"))
    const altaMicro = { ...datos, codigo: "AUTO-MICRO", corto: "PAN ENSAYO", peso_bola_g: 580, peso_batch_kg: 0.0001,
      ingredientes: [
        { materia_prima_id: id(10), porcentaje: 100, harina_base: true, destino: "DIRECTO" },
        { materia_prima_id: id(11), porcentaje: 50, harina_base: false, destino: "MICRO" },
      ] }
    const nuevo = await guardar(id(300), altaMicro)
    const versionJson = async idVersion => (await db.query("select to_jsonb(v) datos from fm_formula_versiones v where id=$1", [idVersion])).rows[0].datos
    const filasJson = async idVersion => (await db.query("select jsonb_agg(to_jsonb(c) order by c.orden) datos from fm_preformulacion_componentes c where formula_version_id=$1", [idVersion])).rows[0].datos
    const original = await versionJson(nuevo.version_id)
    const filasOriginales = await filasJson(nuevo.version_id)
    const hoy = (await db.query("select ((now() at time zone 'America/Bogota')::date)::text hoy")).rows[0].hoy
    const solicitud = {
      nombre: "Parada de cuarenta", fecha: hoy, activar: true, panes: 40, rendimiento: 40, peso_bola_g: 580,
      peso_final_g: 500, origen_actualizado_en: original.actualizado_en,
      componentes: filasOriginales.map(c => ({ id: c.id, porcentaje: Number(c.porcentaje_panadero), destino: c.destino_tipo })),
    }
    const guardarVersion = async (uuid, cambios = {}) => (await db.query(
      "select fm_guardar_formulacion($1,$2,$3::jsonb) resultado",
      [uuid, nuevo.version_id, JSON.stringify({ ...solicitud, ...cambios })]
    )).rows[0].resultado
    await t.test("El alta genera MICRO + nombre corto y calcula la parada con panes por peso de bola", async () => {
      assert.equal(Number(original.peso_bola_g), 580)
      assert.equal(Number(original.peso_batch_kg), 11.6)
      const [micro] = (await db.query("select m.nombre,c.micro_id from fm_preformulacion_componentes c join fm_micros m on m.id=c.micro_id where c.formula_version_id=$1", [nuevo.version_id])).rows
      assert.equal(micro.nombre, "MICRO PAN ENSAYO")
      const [detalle] = (await db.query("select porcentaje_composicion_micro from fm_vw_recetas_micro where formula_version_id=$1", [nuevo.version_id])).rows
      assert.equal(Number(detalle.porcentaje_composicion_micro), 100)
    })
    let guardada
    await t.test("Cambiar unidades crea fórmula V2 y micro V2 y mantiene cantidades y destinos anteriores", async () => {
      guardada = await guardarVersion(id(301))
      assert.equal(guardada.numero_version, 2)
      assert.equal(Number(guardada.peso_batch_kg), 23.2)
      assert.deepEqual(await filasJson(nuevo.version_id), filasOriginales)
      const despues = await versionJson(nuevo.version_id)
      for (const campo of ["panes_por_batch", "peso_bola_g", "peso_batch_kg", "rendimiento_unidades", "peso_final_g", "observaciones"]) {
        assert.equal(despues[campo], original[campo])
      }
      const micros = (await db.query("select distinct numero_version,formula_version_id,micro_id from fm_vw_recetas_micro where formula_id=$1 order by numero_version", [nuevo.formula_id])).rows
      assert.deepEqual(micros.map(m => m.numero_version), [1, 2])
      assert.equal(micros[0].micro_id, micros[1].micro_id)
      assert.equal((await versionJson(guardada.version_id)).estado, "VIGENTE")
    })
    await t.test("Reintento recupera V2 y cambio de datos o sesión no duplica versiones", async () => {
      assert.deepEqual(await guardarVersion(id(301)), guardada)
      await assert.rejects(guardarVersion(id(301), { panes: 50 }), /otros datos/)
      await db.exec(`select set_config('ensayo.usuario','${id(2)}',false)`)
      await assert.rejects(guardarVersion(id(301)), /otro usuario/)
      await db.exec(`select set_config('ensayo.usuario','${id(1)}',false)`)
    })
    await t.test("Destinos editables y peso de bola se guardan solo en una nueva versión", async () => {
      const fuente = await versionJson(guardada.version_id)
      const filas = await filasJson(guardada.version_id)
      const [r] = (await db.query("select fm_guardar_formulacion($1,$2,$3::jsonb) resultado", [id(302), guardada.version_id, JSON.stringify({
        ...solicitud, nombre: "Cambio de destino", origen_actualizado_en: fuente.actualizado_en, peso_bola_g: 600,
        componentes: filas.map(c => ({ id: c.id, porcentaje: Number(c.porcentaje_panadero), destino: "DIRECTO" })),
      })])).rows
      assert.equal(Number(r.resultado.peso_batch_kg), 24)
      assert.deepEqual(await filasJson(guardada.version_id), filas)
      assert.equal((await db.query("select count(*)::integer n from fm_vw_recetas_micro where formula_version_id=$1", [r.resultado.version_id])).rows[0].n, 0)
      assert.equal((await db.query("select count(*)::integer n from fm_vw_recetas_micro where formula_version_id=$1", [guardada.version_id])).rows[0].n, 1)
    })
    await t.test("Una versión histórica no se retrofecha y el origen cambiado exige recarga", async () => {
      await assert.rejects(guardarVersion(id(303)), /origen cambió/)
      const actual = await versionJson(nuevo.version_id)
      await assert.rejects(guardarVersion(id(303), { nombre: "Fecha anterior inválida", origen_actualizado_en: actual.actualizado_en, fecha: "2020-01-01" }), /comienza hoy/)
    })
    await db.exec(await readFile(new URL("../supabase/migrations/202611190001_edicion_ingredientes_formula.sql", import.meta.url), "utf8"))
    await db.exec(`insert into materias_primas(id,codigo,nombre,unidad_base,costo_unitario_referencia) values
      ('${id(16)}','SAL','Sal','KG',1),('${id(17)}','LEV','Levadura','KG',3)`)
    const fuenteEdicion = await versionJson(nuevo.version_id)
    const datosEdicion = {
      ...solicitud, nombre: "Completar dos ingredientes", origen_actualizado_en: fuenteEdicion.actualizado_en,
      estructura_completa: true, componentes: [
        ...filasOriginales.map(c => ({ id: c.id, materia_prima_id: c.materia_prima_id, harina_base: c.es_harina_base, porcentaje: Number(c.porcentaje_panadero), destino: c.destino_tipo })),
        { id: null, materia_prima_id: id(16), harina_base: false, porcentaje: 2, destino: "MICRO" },
        { id: null, materia_prima_id: id(17), harina_base: false, porcentaje: 1, destino: "MICRO" },
      ],
    }
    const editar = async (uuid, origen, datos) => (await db.query("select fm_guardar_formulacion($1,$2,$3::jsonb) resultado", [uuid, origen, JSON.stringify(datos)])).rows[0].resultado
    let completa
    await t.test("Agregar dos ingredientes guarda cuatro filas y un micro nuevo sin editar las dos filas anteriores", async () => {
      completa = await editar(id(400), nuevo.version_id, datosEdicion)
      assert.equal((await filasJson(completa.version_id)).length, 4)
      assert.deepEqual(await filasJson(nuevo.version_id), filasOriginales)
      assert.equal((await db.query("select count(*)::integer n from fm_vw_recetas_micro where formula_version_id=$1", [completa.version_id])).rows[0].n, 3)
      assert.deepEqual(await editar(id(400), nuevo.version_id, datosEdicion), completa)
      assert.equal((await db.query("select items_sin_costo from fm_vw_productos_costo_completo where formula_version_id=$1", [completa.version_id])).rows[0].items_sin_costo, 0)
    })
    await t.test("Cambiar y quitar ingredientes genera otra versión completa y conserva la versión de cuatro filas", async () => {
      const fuente = await versionJson(completa.version_id), filas = await filasJson(completa.version_id)
      const cambio = { ...datosEdicion, nombre: "Cambiar y quitar", origen_actualizado_en: fuente.actualizado_en,
        componentes: [
          { id: filas[0].id, materia_prima_id: id(10), harina_base: true, porcentaje: 100, destino: "DIRECTO" },
          { id: filas[2].id, materia_prima_id: id(17), harina_base: false, porcentaje: 2, destino: "MICRO" },
        ] }
      const r = await editar(id(401), completa.version_id, cambio)
      const nuevas = await filasJson(r.version_id)
      assert.deepEqual(nuevas.map(f => f.materia_prima_id), [id(10), id(17)])
      assert.deepEqual(await filasJson(completa.version_id), filas)
    })
    await t.test("Ingredientes repetidos o sin costo revierten toda la nueva versión", async () => {
      const origen = await versionJson(nuevo.version_id)
      const antes = (await db.query("select count(*)::integer n from fm_formula_versiones")).rows[0].n
      const d = { ...datosEdicion, origen_actualizado_en: origen.actualizado_en, nombre: "Duplicado",
        componentes: [...datosEdicion.componentes, datosEdicion.componentes[2]] }
      await assert.rejects(editar(id(402), nuevo.version_id, d), /una sola vez/)
      await assert.rejects(editar(id(402), nuevo.version_id, { ...d, nombre: "Sin precio",
        componentes: [...datosEdicion.componentes, { id: null, materia_prima_id: id(13), harina_base: false, porcentaje: 1, destino: "DIRECTO" }] }), /Falta el costo/)
      assert.equal((await db.query("select count(*)::integer n from fm_formula_versiones")).rows[0].n, antes)
      assert.deepEqual(await filasJson(nuevo.version_id), filasOriginales)
    })
  } finally {
    await db.close()
  }
})
