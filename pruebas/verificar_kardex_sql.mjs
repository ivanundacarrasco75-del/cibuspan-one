import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const { PGlite } = await import(process.env.CIBUSPAN_SQL_TEST_MODULE || '@electric-sql/pglite')
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const migracion = fs.readFileSync(new URL('../supabase/migrations/202610060001_kardex_inventarios.sql',import.meta.url),'utf8')

test('Kardex transaccional, trazabilidad de PT, saldos iniciales, permisos y reintentos',async (t) => {
  const db = new PGlite()
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      create function public.app_puede(text) returns boolean language sql stable as $$ select current_setting('test.permiso',true)='ADMIN'
        or $1=current_setting('test.permiso',true) $$;
      create table public.app_profiles(id uuid primary key,nombre text);
      create table public.productos(id uuid primary key,codigo text,nombre text,activo boolean default true);
      create table public.materias_primas(id uuid primary key,codigo text,codigo_contable text,nombre text,unidad_base text,activo boolean default true);
      create table public.inventario_lotes(id uuid primary key default gen_random_uuid(),producto_id uuid references public.productos(id),lote text,
        fecha_produccion date,fecha_ingreso_bodega date default current_date,fecha_vencimiento date,cantidad integer not null default 0,
        numero_paradas integer,tamano_parada integer,creado_en timestamptz default now(),actualizado_en timestamptz default now());
      create table public.test_reservas(lote_id uuid primary key,reservado integer);
      create view public.stock_disponible_lotes as select i.id,i.cantidad cantidad_fisica,coalesce(r.reservado,0) cantidad_reservada,
        i.cantidad-coalesce(r.reservado,0) cantidad_disponible from public.inventario_lotes i left join public.test_reservas r on r.lote_id=i.id;
      insert into public.app_profiles values('${id(1)}','Iván'),('${id(2)}','Sin permiso');
      insert into public.productos(id,codigo,nombre) values('${id(10)}','7868304262189','Integral'),('${id(11)}','EXISTENTE','Existente'),('${id(12)}','NUEVO','Nuevo');
      insert into public.materias_primas(id,codigo,codigo_contable,nombre,unidad_base) values
        ('${id(20)}','HARINA','1001','Harina','KG'),('${id(21)}','FUNDA','1002','Fundas','UNIDAD'),
        ('${id(22)}','AZUCAR','1003','Azúcar','KG');
      insert into public.inventario_lotes(id,producto_id,lote,fecha_produccion,fecha_vencimiento,cantidad)
        values('${id(30)}','${id(11)}','PREVIO',current_date-2,current_date+20,100);
      grant usage on schema public,auth to authenticated;
    `)
    await db.exec(migracion)
    await db.query("select set_config('test.user',$1,false),set_config('test.permiso','ADMIN',false)",[id(1)])
    const fechas=(await db.query("select (now() at time zone 'America/Guayaquil')::date::text hoy,((now() at time zone 'America/Guayaquil')::date-4)::text corte,((now() at time zone 'America/Guayaquil')::date-1)::text ayer")).rows[0]
    const carga = [ {tipo:'MATERIA_PRIMA',articulo_id:id(20),cantidad:100.5,costo_total:70.35},
      {tipo:'MATERIA_PRIMA',articulo_id:id(21),cantidad:100,costo_total:10},
      {tipo:'PRODUCTO_TERMINADO',articulo_id:id(10),cantidad:20,costo_total:20,lotes:[
        {cantidad:8,lote:'A',fecha_produccion:fechas.corte,fecha_vencimiento:fechas.hoy},
        {cantidad:12,lote:'B',fecha_produccion:fechas.corte,fecha_vencimiento:fechas.hoy} ]} ]
    const inicial = (lineas=carga,hash='a'.repeat(64)) => db.query('select public.inv_kardex_cargar_inicial($1,$2,$3,$4::jsonb) datos',['Inventario.xlsx',hash,fechas.corte,JSON.stringify(lineas)])
    const contar = async () => (await db.query('select count(*)::int n from public.inv_kardex_movimientos')).rows[0].n
    const consultar = async (tipo,articulo,desde=null,hasta=null,inicio=0,limite=100) => (await db.query('select public.inv_kardex_consultar($1,$2,$3,$4,$5,$6) datos',[tipo,articulo,desde,hasta,inicio,limite])).rows[0].datos
    const mover = (tipo,articulo,lote,fecha,clase,cantidad,saldo,solicitud) => db.query('select public.inv_kardex_registrar($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) datos',
      [tipo,articulo,lote,fecha,clase,cantidad,saldo,'Prueba de movimiento','OP-1',id(solicitud)])

    await t.test('La carga mixta crea ambos inventarios y puede repetirse sin duplicación',async () => {
      const resultado=(await inicial()).rows[0].datos; assert.equal(resultado.repetido,false)
      assert.equal((await consultar('MATERIA_PRIMA',id(20))).saldo_cierre,100.5)
      assert.equal((await consultar('PRODUCTO_TERMINADO',id(10))).saldo_cierre,20)
      assert.equal((await db.query('select sum(cantidad)::int saldo from public.inventario_lotes where producto_id=$1',[id(10)])).rows[0].saldo,20)
      assert.equal(Number((await db.query("select sum(valor_inicial) valor from public.inv_kardex_movimientos where articulo_id=$1",[id(10)])).rows[0].valor),20)
      const n=await contar(); assert.equal((await inicial()).rows[0].datos.repetido,true); assert.equal(await contar(),n)
      await assert.rejects(inicial(carga,'b'.repeat(64)),/ya tiene/); assert.equal(await contar(),n)
    })
    await t.test('Una carga inválida completa revierte MP, PT y cabecera',async () => {
      const n=await contar()
      await assert.rejects(inicial([{tipo:'MATERIA_PRIMA',articulo_id:id(22),cantidad:2,costo_total:1},
        {tipo:'PRODUCTO_TERMINADO',articulo_id:id(11),cantidad:1,lotes:[]}],'c'.repeat(64)),/ya tiene/)
      assert.equal(await contar(),n)
      assert.equal((await db.query('select count(*)::int n from public.inv_cargas_iniciales')).rows[0].n,1)
      await assert.rejects(inicial([{tipo:'MATERIA_PRIMA',articulo_id:id(22),cantidad:2,costo_total:-1}],'d'.repeat(64)),/Costo/)
      await assert.rejects(inicial([{tipo:'MATERIA_PRIMA',articulo_id:id(22),cantidad:2},{tipo:'MATERIA_PRIMA',articulo_id:id(22),cantidad:3}],'e'.repeat(64)),/repetidas/)
      // Error después de insertar la primera MP: debe revertir también esa fila.
      await assert.rejects(inicial([{tipo:'MATERIA_PRIMA',articulo_id:id(22),cantidad:2},
        {tipo:'PRODUCTO_TERMINADO',articulo_id:id(12),cantidad:3,lotes:[{cantidad:3,lote:'',fecha_produccion:fechas.corte,fecha_vencimiento:fechas.hoy}]}],'e'.repeat(64)),/Completa lote/)
      assert.equal(await contar(),n)
    })
    await t.test('Entradas, consumos y conteos solo registran diferencias y reintentos exactos',async () => {
      await mover('MATERIA_PRIMA',id(20),null,fechas.ayer,'SALIDA',15.5,100.5,100)
      await mover('MATERIA_PRIMA',id(20),null,fechas.hoy,'ENTRADA',20,85,101)
      await mover('MATERIA_PRIMA',id(20),null,fechas.hoy,'CONTEO',103,105,102)
      const datos=await consultar('MATERIA_PRIMA',id(20),fechas.hoy,fechas.hoy)
      assert.equal(datos.saldo_anterior,85); assert.equal(datos.saldo_cierre,103); assert.equal(datos.total,2)
      assert.equal(datos.movimientos[1].cantidad,-2)
      assert.equal((await mover('MATERIA_PRIMA',id(20),null,fechas.hoy,'CONTEO',103,105,102)).rows[0].datos.repetido,true)
      await assert.rejects(mover('MATERIA_PRIMA',id(20),null,fechas.hoy,'CONTEO',99,105,102),/otros datos/)
      await assert.rejects(mover('MATERIA_PRIMA',id(20),null,fechas.hoy,'CONTEO',99,105,103),/saldo cambió/)
      assert.equal((await consultar('MATERIA_PRIMA',id(20),null,null,1,1)).movimientos.length,1)
    })
    await t.test('No se permiten saldos negativos ni compras futuras para cubrir salidas anteriores',async () => {
      const n=await contar()
      await assert.rejects(mover('MATERIA_PRIMA',id(20),null,fechas.ayer,'SALIDA',90,85,104),/negativo/)
      await assert.rejects(mover('MATERIA_PRIMA',id(21),null,fechas.hoy,'ENTRADA',1.5,100,105),/enteras/)
      await assert.rejects(mover('MATERIA_PRIMA',id(20),null,fechas.corte,'SALIDA',1,100.5,106),/posteriores/)
      assert.equal(await contar(),n)
    })
    await t.test('Ajustes PT respetan reservas y el mismo saldo del inventario operativo',async () => {
      const lote=(await db.query("select id from public.inventario_lotes where lote='A'")).rows[0].id
      await db.query('insert into public.test_reservas values($1,5)',[lote])
      await assert.rejects(mover('PRODUCTO_TERMINADO',id(10),lote,fechas.hoy,'CONTEO',4,8,107),/reservadas/)
      await mover('PRODUCTO_TERMINADO',id(10),lote,fechas.hoy,'CONTEO',6,8,108)
      assert.equal((await consultar('PRODUCTO_TERMINADO',id(10))).saldo_cierre,18)
      assert.equal((await db.query('select cantidad from public.inventario_lotes where id=$1',[lote])).rows[0].cantidad,6)
      assert.equal((await mover('PRODUCTO_TERMINADO',id(10),lote,fechas.hoy,'CONTEO',6,8,108)).rows[0].datos.repetido,true)
      // Un despacho operativo puede actualizar stock antes de cerrar la reserva.
      await db.query('update public.inventario_lotes set cantidad=cantidad-5 where id=$1',[lote])
      await db.query('delete from public.test_reservas where lote_id=$1',[lote])
      assert.equal((await consultar('PRODUCTO_TERMINADO',id(10))).saldo_cierre,13)
      await db.query('update public.inventario_lotes set lote=$1 where id=$2',['A-CORREGIDO',lote])
      const historia=await consultar('PRODUCTO_TERMINADO',id(10)); assert.equal(historia.movimientos.at(-1).cantidad,0)
      assert.equal(historia.movimientos.at(-1).lote,'A-CORREGIDO')
    })
    await t.test('La seguridad impide escritura directa y limita lecturas y RPC',async () => {
      await db.exec('set role authenticated')
      assert.ok((await db.query('select count(*)::int n from public.inv_kardex_movimientos')).rows[0].n>0)
      await assert.rejects(db.exec('delete from public.inv_kardex_movimientos'),/permission denied/)
      await db.query("select set_config('test.permiso','Pedidos',false)")
      assert.equal((await db.query('select count(*)::int n from public.inv_kardex_movimientos')).rows[0].n,0)
      await assert.rejects(consultar('MATERIA_PRIMA',id(20)),/No tienes/)
      await assert.rejects(mover('MATERIA_PRIMA',id(20),null,fechas.hoy,'ENTRADA',1,103,109),/permiso/)
      await assert.rejects(inicial(carga,'f'.repeat(64)),/permiso/)
      await db.query("select set_config('test.permiso','Materias primas',false)")
      const catalogo=(await db.query('select public.inv_kardex_catalogo() datos')).rows[0].datos
      assert.equal(catalogo.articulos.length,3); assert.equal(catalogo.lotes.length,0)
      await db.exec('reset role'); await db.query("select set_config('test.permiso','ADMIN',false)")
    })
    await t.test('Repetir la migración conserva cantidades y no duplica el arranque',async () => {
      const n=await contar(); await db.exec(migracion); assert.equal(await contar(),n)
      assert.equal((await consultar('MATERIA_PRIMA',id(20))).saldo_cierre,103)
      assert.equal((await consultar('PRODUCTO_TERMINADO',id(10))).saldo_cierre,13)
      assert.equal((await consultar('PRODUCTO_TERMINADO',id(11))).movimientos[0].clase,'SALDO_EXISTENTE')
    })
    await t.test('El mismo archivo permite cargar después otro artículo pendiente, incluyendo saldo cero',async () => {
      const resultado=(await inicial([{tipo:'MATERIA_PRIMA',articulo_id:id(22),cantidad:0,costo_total:0}])).rows[0].datos
      assert.equal(resultado.repetido,false)
      assert.equal((await consultar('MATERIA_PRIMA',id(22))).movimientos[0].cantidad,0)
      await mover('MATERIA_PRIMA',id(22),null,fechas.hoy,'ENTRADA',1.5,0,110)
      assert.equal((await consultar('MATERIA_PRIMA',id(22))).saldo_cierre,1.5)
    })
  } finally { await db.close() }
})
