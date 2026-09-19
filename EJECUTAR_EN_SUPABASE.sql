-- CIBUSPAN ONE
-- Importacion masiva e idempotente de devoluciones de Supermaxi y Santamaria.

begin;

alter table public.devoluciones
  add column if not exists fuente_documento text,
  add column if not exists archivo_origen text,
  add column if not exists codigo_local_documento text,
  add column if not exists nombre_local_documento text,
  add column if not exists estado_documento text,
  add column if not exists valor_total_documento numeric(18,6);

alter table public.devolucion_detalles
  add column if not exists sku_documento text,
  add column if not exists producto_nombre_documento text,
  add column if not exists precio_unitario_documento numeric(18,6),
  add column if not exists valor_total_documento numeric(18,6);

create table if not exists public.dev_importaciones_devoluciones (
  id uuid primary key default gen_random_uuid(),
  archivos_nombres text[] not null default array[]::text[],
  documentos_archivo integer not null default 0,
  documentos_nuevos integer not null default 0,
  documentos_duplicados integer not null default 0,
  documentos_sin_sku integer not null default 0,
  lineas_archivo integer not null default 0,
  unidades_importadas numeric(18,3) not null default 0,
  valor_importado numeric(18,6) not null default 0,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists devoluciones_fuente_fecha_idx
  on public.devoluciones (fuente_documento, fecha_devolucion desc);

create index if not exists devolucion_detalles_valor_idx
  on public.devolucion_detalles (producto_id, semana_origen_inicio);

alter table public.dev_importaciones_devoluciones enable row level security;
revoke all on table public.dev_importaciones_devoluciones from anon;
revoke insert, update, delete on table public.dev_importaciones_devoluciones
  from authenticated;
grant select on table public.dev_importaciones_devoluciones to authenticated;

drop policy if exists c1_dev_importaciones_devoluciones_lectura
  on public.dev_importaciones_devoluciones;
create policy c1_dev_importaciones_devoluciones_lectura
on public.dev_importaciones_devoluciones
for select
to authenticated
using (
  public.app_puede_alguna(
    array['Devoluciones', 'Reportes', 'Dashboard', 'Administración']
  )
);

create or replace function public.dev_importar_devoluciones(
  p_archivos text[],
  p_documentos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_documento jsonb;
  v_cliente_id uuid;
  v_bodega_id uuid;
  v_devolucion_id uuid;
  v_referencia text;
  v_fecha date;
  v_fuente text;
  v_archivo text;
  v_codigo_local text;
  v_nombre_local text;
  v_estado text;
  v_observacion text;
  v_motivo text;
  v_valor numeric(18,6);
  v_detalles jsonb;
  v_documentos integer := 0;
  v_nuevos integer := 0;
  v_duplicados integer := 0;
  v_sin_sku integer := 0;
  v_lineas integer := 0;
  v_unidades numeric(18,3) := 0;
  v_valor_importado numeric(18,6) := 0;
  v_skus_no_reconocidos text[] := array[]::text[];
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if not public.app_puede_alguna(
    array['Devoluciones', 'Administración']
  ) then
    raise exception 'No tienes permiso para importar devoluciones.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_documentos) <> 'array'
     or jsonb_array_length(p_documentos) = 0 then
    raise exception 'No existen documentos para importar.';
  end if;

  insert into public.dev_importaciones_devoluciones (
    archivos_nombres,
    documentos_archivo,
    creado_por
  )
  values (
    coalesce(p_archivos, array[]::text[]),
    jsonb_array_length(p_documentos),
    auth.uid()
  )
  returning id into v_importacion_id;

  for v_documento in
    select value from jsonb_array_elements(p_documentos)
  loop
    v_documentos := v_documentos + 1;
    v_referencia := trim(coalesce(v_documento->>'documento_referencia', ''));
    v_fuente := upper(trim(coalesce(v_documento->>'fuente', '')));
    v_archivo := trim(coalesce(v_documento->>'archivo_origen', ''));
    v_codigo_local := trim(coalesce(v_documento->>'codigo_local', ''));
    v_nombre_local := trim(coalesce(v_documento->>'nombre_local', ''));
    v_estado := trim(coalesce(v_documento->>'estado_documento', ''));
    v_observacion := trim(coalesce(v_documento->>'observacion', ''));
    v_motivo := trim(coalesce(
      v_documento->>'motivo',
      'VENCIMIENTO / RETIRO DE PERCHA'
    ));
    v_valor := abs(coalesce((v_documento->>'valor_total')::numeric, 0));

    if v_referencia = '' then
      raise exception 'Existe un documento sin numero o referencia.';
    end if;

    if v_fuente not in ('SUPERMAXI', 'SANTAMARIA') then
      raise exception 'Fuente de devolucion no reconocida: %', v_fuente;
    end if;

    begin
      v_cliente_id := (v_documento->>'cliente_id')::uuid;
      v_fecha := (v_documento->>'fecha_devolucion')::date;
    exception when others then
      raise exception 'El documento % tiene cliente o fecha invalida.',
        v_referencia;
    end;

    if not exists (
      select 1 from public.clientes cliente
      where cliente.id = v_cliente_id and cliente.activo = true
    ) then
      raise exception 'El cliente del documento % no esta activo.',
        v_referencia;
    end if;

    select bodega.id
    into v_bodega_id
    from public.bodegas bodega
    where bodega.cliente_id = v_cliente_id
      and bodega.activo = true
      and v_nombre_local <> ''
      and upper(trim(bodega.nombre)) = upper(v_nombre_local)
    order by bodega.nombre
    limit 1;

    select devolucion.id
    into v_devolucion_id
    from public.devoluciones devolucion
    where devolucion.cliente_id = v_cliente_id
      and upper(trim(coalesce(devolucion.documento_referencia, ''))) =
          upper(v_referencia)
    order by devolucion.creado_en
    limit 1;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'producto_id', linea.producto_id,
        'unidades', linea.unidades,
        'motivo', v_motivo,
        'observaciones', nullif(v_observacion, '')
      )
    ), '[]'::jsonb)
    into v_detalles
    from (
      select
        producto.id as producto_id,
        sum(abs(coalesce(registro.unidades, 0))) as unidades
      from jsonb_to_recordset(
        coalesce(v_documento->'detalles', '[]'::jsonb)
      ) as registro(
        sku text,
        producto_nombre text,
        unidades numeric,
        precio_unitario numeric,
        valor_total numeric
      )
      join public.productos producto
        on trim(producto.codigo) = trim(registro.sku)
      where abs(coalesce(registro.unidades, 0)) > 0
      group by producto.id
    ) as linea;

    select array_cat(
      v_skus_no_reconocidos,
      coalesce(array_agg(distinct trim(registro.sku)), array[]::text[])
    )
    into v_skus_no_reconocidos
    from jsonb_to_recordset(
      coalesce(v_documento->'detalles', '[]'::jsonb)
    ) as registro(sku text)
    left join public.productos producto
      on trim(producto.codigo) = trim(registro.sku)
    where producto.id is null
      and nullif(trim(coalesce(registro.sku, '')), '') is not null;

    v_lineas := v_lineas + jsonb_array_length(
      coalesce(v_documento->'detalles', '[]'::jsonb)
    );

    if jsonb_array_length(v_detalles) = 0 then
      v_sin_sku := v_sin_sku + 1;
      continue;
    end if;

    if v_devolucion_id is null then
      if exists (
        select 1
        from jsonb_to_recordset(v_detalles) as linea(
          producto_id uuid,
          unidades numeric
        )
        join public.productos producto
          on producto.id = linea.producto_id
        where coalesce(producto.vida_util_dias, 0) <= 0
      ) then
        raise exception 'El documento % contiene un SKU sin vida util valida.',
          v_referencia;
      end if;

      insert into public.devoluciones (
        fecha_devolucion,
        cliente_id,
        bodega_id,
        origen_registro,
        documento_referencia,
        creado_por
      )
      values (
        v_fecha,
        v_cliente_id,
        v_bodega_id,
        'DOCUMENTO',
        v_referencia,
        auth.uid()
      )
      returning id into v_devolucion_id;

      insert into public.devolucion_detalles (
        devolucion_id,
        producto_id,
        unidades,
        motivo,
        observaciones,
        vida_util_dias_snapshot,
        dias_retiro_antes_caducidad,
        vida_efectiva_dias,
        desfase_semanas,
        semana_recepcion_inicio,
        semana_origen_inicio
      )
      select
        v_devolucion_id,
        producto.id,
        round(linea.unidades)::integer,
        coalesce(nullif(trim(linea.motivo), ''),
          'VENCIMIENTO / RETIRO DE PERCHA'),
        nullif(trim(linea.observaciones), ''),
        producto.vida_util_dias,
        2,
        greatest(1, producto.vida_util_dias - 2),
        greatest(
          0,
          round(greatest(1, producto.vida_util_dias - 2)::numeric / 7.0)::integer
        ),
        v_fecha - (extract(isodow from v_fecha)::integer - 1),
        v_fecha - (extract(isodow from v_fecha)::integer - 1) -
          (
            greatest(
              0,
              round(greatest(1, producto.vida_util_dias - 2)::numeric / 7.0)::integer
            ) * 7
          )
      from jsonb_to_recordset(v_detalles) as linea(
        producto_id uuid,
        unidades numeric,
        motivo text,
        observaciones text
      )
      join public.productos producto
        on producto.id = linea.producto_id;

      v_nuevos := v_nuevos + 1;
      v_unidades := v_unidades + coalesce((
        select sum((detalle->>'unidades')::numeric)
        from jsonb_array_elements(v_detalles) as detalle
      ), 0);
      v_valor_importado := v_valor_importado + v_valor;
    else
      v_duplicados := v_duplicados + 1;
    end if;

    update public.devoluciones
    set
      fuente_documento = v_fuente,
      archivo_origen = nullif(v_archivo, ''),
      codigo_local_documento = nullif(v_codigo_local, ''),
      nombre_local_documento = nullif(v_nombre_local, ''),
      estado_documento = nullif(v_estado, ''),
      valor_total_documento = v_valor,
      bodega_id = coalesce(bodega_id, v_bodega_id)
    where id = v_devolucion_id;

    with lineas as (
      select
        producto.id as producto_id,
        max(trim(registro.sku)) as sku,
        max(trim(registro.producto_nombre)) as producto_nombre,
        case
          when sum(abs(coalesce(registro.unidades, 0))) > 0 then
            sum(abs(coalesce(
              registro.valor_total,
              registro.unidades * registro.precio_unitario,
              0
            ))) / sum(abs(coalesce(registro.unidades, 0)))
          else 0
        end as precio_unitario,
        sum(abs(coalesce(
          registro.valor_total,
          registro.unidades * registro.precio_unitario,
          0
        ))) as valor_total
      from jsonb_to_recordset(
        coalesce(v_documento->'detalles', '[]'::jsonb)
      ) as registro(
        sku text,
        producto_nombre text,
        unidades numeric,
        precio_unitario numeric,
        valor_total numeric
      )
      join public.productos producto
        on trim(producto.codigo) = trim(registro.sku)
      group by producto.id
    )
    update public.devolucion_detalles detalle
    set
      sku_documento = lineas.sku,
      producto_nombre_documento = lineas.producto_nombre,
      precio_unitario_documento = round(lineas.precio_unitario, 6),
      valor_total_documento = round(lineas.valor_total, 6)
    from lineas
    where detalle.devolucion_id = v_devolucion_id
      and detalle.producto_id = lineas.producto_id;
  end loop;

  update public.dev_importaciones_devoluciones
  set
    documentos_archivo = v_documentos,
    documentos_nuevos = v_nuevos,
    documentos_duplicados = v_duplicados,
    documentos_sin_sku = v_sin_sku,
    lineas_archivo = v_lineas,
    unidades_importadas = round(v_unidades, 3),
    valor_importado = round(v_valor_importado, 6)
  where id = v_importacion_id;

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'documentos_archivo', v_documentos,
    'documentos_nuevos', v_nuevos,
    'documentos_duplicados', v_duplicados,
    'documentos_sin_sku', v_sin_sku,
    'lineas_archivo', v_lineas,
    'unidades_importadas', round(v_unidades, 3),
    'valor_importado', round(v_valor_importado, 6),
    'skus_no_reconocidos', to_jsonb(
      array(
        select distinct sku
        from unnest(v_skus_no_reconocidos) as sku
        where nullif(trim(sku), '') is not null
        order by sku
      )
    )
  );
end;
$$;

revoke all on function public.dev_importar_devoluciones(text[], jsonb)
  from public;
grant execute on function public.dev_importar_devoluciones(text[], jsonb)
  to authenticated;

create or replace view public.dev_vw_devoluciones_clasificadas
with (security_invoker = true)
as
select
  devolucion.id as devolucion_id,
  devolucion.fecha_devolucion,
  date_trunc('week', devolucion.fecha_devolucion)::date
    as semana_recepcion_inicio,
  detalle.semana_origen_inicio,
  devolucion.fuente_documento,
  devolucion.documento_referencia,
  devolucion.codigo_local_documento,
  coalesce(
    devolucion.nombre_local_documento,
    bodega.nombre,
    'Sin local'
  ) as local_nombre,
  cliente.id as cliente_id,
  cliente.nombre as cliente_nombre,
  producto.id as producto_id,
  producto.codigo as sku,
  producto.corto as producto_nombre,
  detalle.unidades,
  detalle.precio_unitario_documento,
  detalle.valor_total_documento,
  detalle.motivo
from public.devoluciones devolucion
join public.devolucion_detalles detalle
  on detalle.devolucion_id = devolucion.id
left join public.clientes cliente
  on cliente.id = devolucion.cliente_id
left join public.bodegas bodega
  on bodega.id = devolucion.bodega_id
left join public.productos producto
  on producto.id = detalle.producto_id;

grant select on public.dev_vw_devoluciones_clasificadas to authenticated;
revoke all on public.dev_vw_devoluciones_clasificadas from anon;

notify pgrst, 'reload schema';

commit;
