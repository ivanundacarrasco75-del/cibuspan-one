-- CIBUSPAN ONE
-- Importacion acumulativa o semanal de ventas por cliente y SKU.

create table if not exists public.com_importaciones_ventas (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text not null,
  fecha_desde date not null,
  fecha_hasta date not null,
  movimientos_archivo integer not null check (movimientos_archivo > 0),
  movimientos_nuevos integer not null default 0,
  movimientos_actualizados integer not null default 0,
  unidades_archivo numeric(18,3) not null default 0,
  venta_sin_impuestos numeric(18,6) not null default 0,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.com_ventas_detalle (
  id uuid primary key default gen_random_uuid(),
  comprobante text not null,
  fecha_emision date not null,
  cliente_nombre text not null,
  cliente_id uuid references public.clientes(id) on delete set null,
  sku text not null,
  producto_nombre text not null,
  producto_id uuid references public.productos(id) on delete set null,
  cantidad numeric(18,3) not null,
  precio_unitario numeric(18,6) not null,
  descuento numeric(18,6) not null default 0,
  precio_neto numeric(18,6) not null,
  total_sin_impuestos numeric(18,6) not null,
  importacion_id uuid not null
    references public.com_importaciones_ventas(id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_ventas_comprobante_sku_key unique (comprobante, sku)
);

create index if not exists com_ventas_fecha_idx
  on public.com_ventas_detalle (fecha_emision desc);

create index if not exists com_ventas_cliente_fecha_idx
  on public.com_ventas_detalle (cliente_nombre, fecha_emision desc);

create index if not exists com_ventas_sku_fecha_idx
  on public.com_ventas_detalle (sku, fecha_emision desc);

alter table public.com_importaciones_ventas enable row level security;
alter table public.com_ventas_detalle enable row level security;

revoke all on table public.com_importaciones_ventas from anon;
revoke all on table public.com_ventas_detalle from anon;
revoke insert, update, delete on table public.com_importaciones_ventas
  from authenticated;
revoke insert, update, delete on table public.com_ventas_detalle
  from authenticated;
grant select on table public.com_importaciones_ventas to authenticated;
grant select on table public.com_ventas_detalle to authenticated;

drop policy if exists c1_com_importaciones_ventas_lectura
  on public.com_importaciones_ventas;
create policy c1_com_importaciones_ventas_lectura
on public.com_importaciones_ventas
for select
to authenticated
using (
  public.app_puede_alguna(array['Reportes', 'Administración'])
);

drop policy if exists c1_com_ventas_detalle_lectura
  on public.com_ventas_detalle;
create policy c1_com_ventas_detalle_lectura
on public.com_ventas_detalle
for select
to authenticated
using (
  public.app_puede_alguna(array['Reportes', 'Administración'])
);

create or replace function public.com_importar_ventas(
  p_archivo_nombre text,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_fecha_desde date;
  v_fecha_hasta date;
  v_movimientos integer;
  v_nuevos integer;
  v_actualizados integer;
  v_unidades numeric(18,3);
  v_venta numeric(18,6);
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if not public.app_puede_alguna(array['Reportes', 'Administración']) then
    raise exception 'No tienes permiso para importar ventas.'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_archivo_nombre, '')), '') is null then
    raise exception 'El nombre del archivo es obligatorio.';
  end if;

  if jsonb_typeof(p_lineas) <> 'array'
     or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no contiene ventas para importar.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lineas) as linea(
      comprobante text,
      fecha_emision text,
      cliente_nombre text,
      sku text,
      producto_nombre text,
      cantidad numeric,
      precio_unitario numeric,
      descuento numeric,
      precio_neto numeric,
      total_sin_impuestos numeric
    )
    where linea.fecha_emision !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])$'
       or nullif(trim(coalesce(linea.comprobante, '')), '') is null
       or nullif(trim(coalesce(linea.cliente_nombre, '')), '') is null
       or nullif(trim(coalesce(linea.sku, '')), '') is null
       or nullif(trim(coalesce(linea.producto_nombre, '')), '') is null
       or linea.cantidad is null
       or linea.precio_unitario is null
       or linea.descuento is null
       or linea.precio_neto is null
       or linea.total_sin_impuestos is null
  ) then
    raise exception 'Existen fechas, clientes, SKU o valores invalidos en el archivo.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lineas) as linea(
      comprobante text,
      sku text
    )
    group by trim(linea.comprobante), trim(linea.sku)
    having count(*) > 1
  ) then
    raise exception 'El archivo repite un mismo SKU dentro del mismo comprobante.';
  end if;

  select
    min(linea.fecha_emision::date),
    max(linea.fecha_emision::date),
    count(*)::integer,
    coalesce(sum(linea.cantidad), 0)::numeric(18,3),
    coalesce(sum(linea.total_sin_impuestos), 0)::numeric(18,6)
  into
    v_fecha_desde,
    v_fecha_hasta,
    v_movimientos,
    v_unidades,
    v_venta
  from jsonb_to_recordset(p_lineas) as linea(
    fecha_emision text,
    cantidad numeric,
    total_sin_impuestos numeric
  );

  select count(*)::integer
  into v_actualizados
  from jsonb_to_recordset(p_lineas) as linea(
    comprobante text,
    sku text
  )
  join public.com_ventas_detalle venta
    on venta.comprobante = trim(linea.comprobante)
   and venta.sku = trim(linea.sku);

  v_nuevos := v_movimientos - v_actualizados;

  insert into public.com_importaciones_ventas (
    archivo_nombre,
    fecha_desde,
    fecha_hasta,
    movimientos_archivo,
    movimientos_nuevos,
    movimientos_actualizados,
    unidades_archivo,
    venta_sin_impuestos,
    creado_por
  )
  values (
    trim(p_archivo_nombre),
    v_fecha_desde,
    v_fecha_hasta,
    v_movimientos,
    v_nuevos,
    v_actualizados,
    v_unidades,
    v_venta,
    auth.uid()
  )
  returning id into v_importacion_id;

  insert into public.com_ventas_detalle (
    comprobante,
    fecha_emision,
    cliente_nombre,
    cliente_id,
    sku,
    producto_nombre,
    producto_id,
    cantidad,
    precio_unitario,
    descuento,
    precio_neto,
    total_sin_impuestos,
    importacion_id
  )
  select
    trim(linea.comprobante),
    linea.fecha_emision::date,
    trim(linea.cliente_nombre),
    cliente.id,
    trim(linea.sku),
    trim(linea.producto_nombre),
    producto.id,
    round(linea.cantidad, 3),
    round(linea.precio_unitario, 6),
    round(linea.descuento, 6),
    round(linea.precio_neto, 6),
    round(linea.total_sin_impuestos, 6),
    v_importacion_id
  from jsonb_to_recordset(p_lineas) as linea(
    comprobante text,
    fecha_emision text,
    cliente_nombre text,
    sku text,
    producto_nombre text,
    cantidad numeric,
    precio_unitario numeric,
    descuento numeric,
    precio_neto numeric,
    total_sin_impuestos numeric
  )
  left join lateral (
    select c.id
    from public.clientes c
    where upper(regexp_replace(trim(c.nombre), '[[:space:]]+', ' ', 'g')) =
          upper(regexp_replace(trim(linea.cliente_nombre), '[[:space:]]+', ' ', 'g'))
    limit 1
  ) cliente on true
  left join lateral (
    select p.id
    from public.productos p
    where trim(p.codigo) = trim(linea.sku)
    limit 1
  ) producto on true
  on conflict (comprobante, sku) do update
  set fecha_emision = excluded.fecha_emision,
      cliente_nombre = excluded.cliente_nombre,
      cliente_id = excluded.cliente_id,
      producto_nombre = excluded.producto_nombre,
      producto_id = excluded.producto_id,
      cantidad = excluded.cantidad,
      precio_unitario = excluded.precio_unitario,
      descuento = excluded.descuento,
      precio_neto = excluded.precio_neto,
      total_sin_impuestos = excluded.total_sin_impuestos,
      importacion_id = excluded.importacion_id,
      actualizado_en = now();

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'fecha_desde', v_fecha_desde,
    'fecha_hasta', v_fecha_hasta,
    'movimientos_archivo', v_movimientos,
    'movimientos_nuevos', v_nuevos,
    'movimientos_actualizados', v_actualizados,
    'unidades_archivo', v_unidades,
    'venta_sin_impuestos', v_venta
  );
end;
$$;

revoke all on function public.com_importar_ventas(text, jsonb)
  from public, anon;
grant execute on function public.com_importar_ventas(text, jsonb)
  to authenticated;

create or replace view public.com_vw_ventas_semanales
with (security_invoker = true)
as
select
  date_trunc('week', venta.fecha_emision)::date as semana_inicio,
  venta.cliente_id,
  venta.cliente_nombre,
  venta.producto_id,
  venta.sku,
  venta.producto_nombre,
  count(*)::integer as movimientos,
  sum(venta.cantidad)::numeric(18,3) as unidades,
  sum(venta.total_sin_impuestos)::numeric(18,6) as venta_sin_impuestos,
  max(venta.actualizado_en) as actualizado_en
from public.com_ventas_detalle venta
group by
  date_trunc('week', venta.fecha_emision)::date,
  venta.cliente_id,
  venta.cliente_nombre,
  venta.producto_id,
  venta.sku,
  venta.producto_nombre;

grant select on public.com_vw_ventas_semanales to authenticated;
revoke all on public.com_vw_ventas_semanales from anon;
