-- CIBUSPAN ONE
-- Importacion idempotente de ordenes historicas del sistema contable.
-- Estas ordenes alimentan historial, reportes y dashboard, pero NO inventario.

create table if not exists public.pro_importaciones_ordenes (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text not null,
  archivo_hash text not null unique,
  estado text not null default 'PROCESANDO'
    check (estado in ('PROCESANDO', 'COMPLETADA')),
  fecha_desde date,
  fecha_hasta date,
  filas_archivo integer not null default 0,
  ordenes_archivo integer not null default 0,
  ordenes_sku integer not null default 0,
  ordenes_micro integer not null default 0,
  unidades_sku numeric(16,3) not null default 0,
  kg_micro numeric(16,3) not null default 0,
  costo_total numeric(16,6) not null default 0,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.pro_ordenes_historicas (
  id uuid primary key default gen_random_uuid(),
  importacion_id uuid not null
    references public.pro_importaciones_ordenes(id) on delete cascade,
  numero_orden text not null unique,
  sucursal_codigo text,
  sucursal_nombre text,
  fecha_registro date not null,
  fecha_fin_original date,
  fecha_produccion date not null,
  descripcion text,
  producto_id uuid references public.productos(id) on delete set null,
  producto_codigo text not null,
  producto_nombre text not null,
  tipo_orden text not null check (tipo_orden in ('SKU', 'MICRO')),
  tamano_parada numeric(16,3) not null default 0,
  numero_paradas numeric(16,3) not null default 0,
  unidades_producidas numeric(16,3) not null default 0,
  kg_micro numeric(16,3) not null default 0,
  costo_total numeric(16,6) not null default 0,
  estado_validacion text not null default 'VALIDA'
    check (estado_validacion in ('VALIDA', 'REVISAR')),
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.pro_ordenes_historicas_detalles (
  id uuid primary key default gen_random_uuid(),
  orden_historica_id uuid not null
    references public.pro_ordenes_historicas(id) on delete cascade,
  orden_linea integer not null,
  materia_codigo text,
  materia_nombre text not null,
  cantidad numeric(18,6) not null default 0,
  costo_unitario numeric(18,8) not null default 0,
  costo_total numeric(18,6) not null default 0,
  es_empaque boolean not null default false,
  creado_en timestamptz not null default now(),
  unique (orden_historica_id, orden_linea)
);

create index if not exists pro_ordenes_historicas_fecha_idx
  on public.pro_ordenes_historicas(fecha_produccion);
create index if not exists pro_ordenes_historicas_producto_idx
  on public.pro_ordenes_historicas(producto_codigo, fecha_produccion);
create index if not exists pro_ordenes_historicas_importacion_idx
  on public.pro_ordenes_historicas(importacion_id);
create index if not exists pro_ordenes_historicas_detalles_orden_idx
  on public.pro_ordenes_historicas_detalles(orden_historica_id);

alter table public.pro_importaciones_ordenes enable row level security;
alter table public.pro_ordenes_historicas enable row level security;
alter table public.pro_ordenes_historicas_detalles enable row level security;

drop policy if exists pro_importaciones_ordenes_lectura
  on public.pro_importaciones_ordenes;
create policy pro_importaciones_ordenes_lectura
  on public.pro_importaciones_ordenes
  for select to authenticated
  using (public.app_puede_alguna(
    array['Producción', 'Reportes', 'Dashboard', 'Administración']
  ));

drop policy if exists pro_ordenes_historicas_lectura
  on public.pro_ordenes_historicas;
create policy pro_ordenes_historicas_lectura
  on public.pro_ordenes_historicas
  for select to authenticated
  using (public.app_puede_alguna(
    array['Producción', 'Reportes', 'Dashboard', 'Administración']
  ));

drop policy if exists pro_ordenes_historicas_detalles_lectura
  on public.pro_ordenes_historicas_detalles;
create policy pro_ordenes_historicas_detalles_lectura
  on public.pro_ordenes_historicas_detalles
  for select to authenticated
  using (public.app_puede_alguna(
    array['Producción', 'Reportes', 'Dashboard', 'Administración']
  ));

create or replace function public.pro_importar_ordenes_historicas(
  p_archivo_nombre text,
  p_archivo_hash text,
  p_ordenes jsonb,
  p_finalizar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_orden jsonb;
  v_detalle jsonb;
  v_orden_id uuid;
  v_producto_id uuid;
  v_nuevas integer := 0;
  v_actualizadas integer := 0;
  v_numero_orden text;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if not public.app_puede_alguna(array['Producción', 'Administración']) then
    raise exception 'No tienes permiso para importar ordenes de produccion.'
      using errcode = '42501';
  end if;

  if trim(coalesce(p_archivo_nombre, '')) = ''
     or trim(coalesce(p_archivo_hash, '')) = '' then
    raise exception 'El nombre y la huella del archivo son obligatorios.';
  end if;

  if p_ordenes is null or jsonb_typeof(p_ordenes) <> 'array' then
    raise exception 'El lote de ordenes no es valido.';
  end if;

  insert into public.pro_importaciones_ordenes (
    archivo_nombre,
    archivo_hash,
    estado,
    creado_por
  )
  values (
    trim(p_archivo_nombre),
    trim(p_archivo_hash),
    'PROCESANDO',
    auth.uid()
  )
  on conflict (archivo_hash) do update
  set
    archivo_nombre = excluded.archivo_nombre,
    estado = 'PROCESANDO',
    actualizado_en = now()
  returning id into v_importacion_id;

  for v_orden in
    select value from jsonb_array_elements(p_ordenes)
  loop
    v_numero_orden := trim(v_orden->>'numero_orden');
    if v_numero_orden = '' then
      raise exception 'Existe una orden sin numero.';
    end if;

    select historica.id
    into v_orden_id
    from public.pro_ordenes_historicas historica
    where historica.numero_orden = v_numero_orden;

    if v_orden_id is null then
      v_nuevas := v_nuevas + 1;
    else
      v_actualizadas := v_actualizadas + 1;
    end if;

    select producto.id
    into v_producto_id
    from public.productos producto
    where trim(producto.codigo) = trim(v_orden->>'producto_codigo')
    order by producto.activo desc, producto.creado_en
    limit 1;

    insert into public.pro_ordenes_historicas (
      importacion_id,
      numero_orden,
      sucursal_codigo,
      sucursal_nombre,
      fecha_registro,
      fecha_fin_original,
      fecha_produccion,
      descripcion,
      producto_id,
      producto_codigo,
      producto_nombre,
      tipo_orden,
      tamano_parada,
      numero_paradas,
      unidades_producidas,
      kg_micro,
      costo_total,
      estado_validacion,
      observaciones,
      actualizado_en
    )
    values (
      v_importacion_id,
      v_numero_orden,
      nullif(trim(v_orden->>'sucursal_codigo'), ''),
      nullif(trim(v_orden->>'sucursal_nombre'), ''),
      (v_orden->>'fecha_registro')::date,
      nullif(v_orden->>'fecha_fin_original', '')::date,
      (v_orden->>'fecha_produccion')::date,
      nullif(trim(v_orden->>'descripcion'), ''),
      v_producto_id,
      trim(v_orden->>'producto_codigo'),
      trim(v_orden->>'producto_nombre'),
      upper(trim(v_orden->>'tipo_orden')),
      coalesce((v_orden->>'tamano_parada')::numeric, 0),
      coalesce((v_orden->>'numero_paradas')::numeric, 0),
      coalesce((v_orden->>'unidades_producidas')::numeric, 0),
      coalesce((v_orden->>'kg_micro')::numeric, 0),
      coalesce((v_orden->>'costo_total')::numeric, 0),
      coalesce(nullif(upper(trim(v_orden->>'estado_validacion')), ''), 'VALIDA'),
      nullif(trim(v_orden->>'observaciones'), ''),
      now()
    )
    on conflict (numero_orden) do update
    set
      importacion_id = excluded.importacion_id,
      sucursal_codigo = excluded.sucursal_codigo,
      sucursal_nombre = excluded.sucursal_nombre,
      fecha_registro = excluded.fecha_registro,
      fecha_fin_original = excluded.fecha_fin_original,
      fecha_produccion = excluded.fecha_produccion,
      descripcion = excluded.descripcion,
      producto_id = excluded.producto_id,
      producto_codigo = excluded.producto_codigo,
      producto_nombre = excluded.producto_nombre,
      tipo_orden = excluded.tipo_orden,
      tamano_parada = excluded.tamano_parada,
      numero_paradas = excluded.numero_paradas,
      unidades_producidas = excluded.unidades_producidas,
      kg_micro = excluded.kg_micro,
      costo_total = excluded.costo_total,
      estado_validacion = excluded.estado_validacion,
      observaciones = excluded.observaciones,
      actualizado_en = now()
    returning id into v_orden_id;

    delete from public.pro_ordenes_historicas_detalles
    where orden_historica_id = v_orden_id;

    for v_detalle in
      select value
      from jsonb_array_elements(coalesce(v_orden->'detalles', '[]'::jsonb))
    loop
      insert into public.pro_ordenes_historicas_detalles (
        orden_historica_id,
        orden_linea,
        materia_codigo,
        materia_nombre,
        cantidad,
        costo_unitario,
        costo_total,
        es_empaque
      )
      values (
        v_orden_id,
        coalesce((v_detalle->>'orden_linea')::integer, 0),
        nullif(trim(v_detalle->>'materia_codigo'), ''),
        trim(v_detalle->>'materia_nombre'),
        coalesce((v_detalle->>'cantidad')::numeric, 0),
        coalesce((v_detalle->>'costo_unitario')::numeric, 0),
        coalesce((v_detalle->>'costo_total')::numeric, 0),
        coalesce((v_detalle->>'es_empaque')::boolean, false)
      );
    end loop;
  end loop;

  if p_finalizar then
    update public.pro_importaciones_ordenes importacion
    set
      estado = 'COMPLETADA',
      fecha_desde = resumen.fecha_desde,
      fecha_hasta = resumen.fecha_hasta,
      filas_archivo = resumen.filas_archivo,
      ordenes_archivo = resumen.ordenes_archivo,
      ordenes_sku = resumen.ordenes_sku,
      ordenes_micro = resumen.ordenes_micro,
      unidades_sku = resumen.unidades_sku,
      kg_micro = resumen.kg_micro,
      costo_total = resumen.costo_total,
      actualizado_en = now()
    from (
      select
        min(orden.fecha_produccion) as fecha_desde,
        max(orden.fecha_produccion) as fecha_hasta,
        (
          select count(*)::integer
          from public.pro_ordenes_historicas_detalles detalle
          join public.pro_ordenes_historicas orden_detalle
            on orden_detalle.id = detalle.orden_historica_id
          where orden_detalle.importacion_id = v_importacion_id
        ) as filas_archivo,
        count(*)::integer as ordenes_archivo,
        count(*) filter (where orden.tipo_orden = 'SKU')::integer as ordenes_sku,
        count(*) filter (where orden.tipo_orden = 'MICRO')::integer as ordenes_micro,
        coalesce(sum(orden.unidades_producidas), 0) as unidades_sku,
        coalesce(sum(orden.kg_micro), 0) as kg_micro,
        coalesce(sum(orden.costo_total), 0) as costo_total
      from public.pro_ordenes_historicas orden
      where orden.importacion_id = v_importacion_id
    ) resumen
    where importacion.id = v_importacion_id;
  end if;

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'ordenes_nuevas', v_nuevas,
    'ordenes_actualizadas', v_actualizadas,
    'finalizada', p_finalizar
  );
end;
$$;

revoke all on function public.pro_importar_ordenes_historicas(text, text, jsonb, boolean)
  from public, anon;
grant execute on function public.pro_importar_ordenes_historicas(text, text, jsonb, boolean)
  to authenticated;

create or replace view public.pro_vw_importaciones_ordenes
with (security_invoker = true)
as
select
  importacion.*
from public.pro_importaciones_ordenes importacion;

create or replace view public.vw_producciones_resumen_unificado
with (security_invoker = true)
as
select
  produccion.id,
  produccion.numero_produccion,
  null::text as numero_orden_externa,
  produccion.fecha_produccion_general,
  produccion.estado,
  produccion.observaciones,
  produccion.creado_por,
  produccion.creado_en,
  count(detalle.id)::integer as total_skus,
  coalesce(sum(detalle.numero_paradas), 0)::numeric as total_paradas,
  coalesce(sum(detalle.unidades), 0)::numeric as total_unidades,
  count(detalle.id) filter (
    where detalle.tipo_destino = 'PRODUCTO_TERMINADO'
  )::integer as sku_terminados,
  count(detalle.id) filter (
    where detalle.tipo_destino = 'SEMIELABORADO'
  )::integer as sku_semielaborados,
  0::integer as ordenes_micro,
  0::numeric as total_kg_micro,
  null::numeric as costo_total,
  'APP'::text as origen,
  'VALIDA'::text as estado_validacion
from public.producciones produccion
left join public.produccion_detalles detalle
  on detalle.produccion_id = produccion.id
group by produccion.id

union all

select
  historica.id,
  null::bigint as numero_produccion,
  historica.numero_orden as numero_orden_externa,
  historica.fecha_produccion as fecha_produccion_general,
  'REGISTRADA'::text as estado,
  historica.observaciones,
  null::uuid as creado_por,
  historica.creado_en,
  case when historica.tipo_orden = 'SKU' then 1 else 0 end::integer as total_skus,
  case when historica.tipo_orden = 'SKU' then historica.numero_paradas else 0 end::numeric as total_paradas,
  case when historica.tipo_orden = 'SKU' then historica.unidades_producidas else 0 end::numeric as total_unidades,
  case when historica.tipo_orden = 'SKU' then 1 else 0 end::integer as sku_terminados,
  0::integer as sku_semielaborados,
  case when historica.tipo_orden = 'MICRO' then 1 else 0 end::integer as ordenes_micro,
  case when historica.tipo_orden = 'MICRO' then historica.kg_micro else 0 end::numeric as total_kg_micro,
  historica.costo_total,
  'HISTORICO'::text as origen,
  historica.estado_validacion
from public.pro_ordenes_historicas historica;

create or replace view public.vw_produccion_historial_detalle_unificado
with (security_invoker = true)
as
select
  produccion.id as produccion_id,
  produccion.numero_produccion,
  null::text as numero_orden_externa,
  produccion.fecha_produccion_general,
  produccion.estado,
  produccion.creado_en as produccion_creada_en,
  detalle.id as detalle_id,
  detalle.producto_id,
  detalle.producto_codigo,
  detalle.producto_corto,
  detalle.producto_nombre,
  detalle.codigo_lote_producto,
  detalle.tipo_destino,
  detalle.numero_paradas::numeric,
  detalle.tamano_parada::numeric,
  detalle.unidades::numeric,
  0::numeric as kg_micro,
  detalle.fecha_produccion,
  detalle.lote,
  detalle.fecha_vencimiento,
  detalle.inventario_lote_id,
  detalle.inventario_semielaborado_id,
  detalle.orden,
  null::numeric as costo_total,
  'APP'::text as origen,
  'VALIDA'::text as estado_validacion
from public.producciones produccion
join public.produccion_detalles detalle
  on detalle.produccion_id = produccion.id

union all

select
  historica.id as produccion_id,
  null::bigint as numero_produccion,
  historica.numero_orden as numero_orden_externa,
  historica.fecha_produccion as fecha_produccion_general,
  'REGISTRADA'::text as estado,
  historica.creado_en as produccion_creada_en,
  historica.id as detalle_id,
  historica.producto_id,
  historica.producto_codigo,
  historica.producto_nombre as producto_corto,
  historica.producto_nombre,
  null::text as codigo_lote_producto,
  case
    when historica.tipo_orden = 'MICRO' then 'MICRO'
    else 'PRODUCTO_TERMINADO'
  end::text as tipo_destino,
  historica.numero_paradas,
  historica.tamano_parada,
  historica.unidades_producidas as unidades,
  historica.kg_micro,
  historica.fecha_produccion,
  null::text as lote,
  null::date as fecha_vencimiento,
  null::uuid as inventario_lote_id,
  null::uuid as inventario_semielaborado_id,
  1::integer as orden,
  historica.costo_total,
  'HISTORICO'::text as origen,
  historica.estado_validacion
from public.pro_ordenes_historicas historica;

grant select on public.pro_importaciones_ordenes to authenticated;
grant select on public.pro_ordenes_historicas to authenticated;
grant select on public.pro_ordenes_historicas_detalles to authenticated;
grant select on public.pro_vw_importaciones_ordenes to authenticated;
grant select on public.vw_producciones_resumen_unificado to authenticated;
grant select on public.vw_produccion_historial_detalle_unificado to authenticated;

comment on table public.pro_ordenes_historicas is
  'Historial de ordenes externas. No modifica inventario ni semielaborados.';
