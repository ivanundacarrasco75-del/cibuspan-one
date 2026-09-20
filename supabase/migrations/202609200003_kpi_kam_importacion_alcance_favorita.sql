-- CIBUSPAN ONE
-- KPI KAM - locales comerciales monitoreados e importación del alcance Favorita.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_KPI_KAM_COBERTURA_FAVORITA_V1')
);

create table if not exists public.com_locales_monitoreados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  codigo_externo text not null,
  nombre text not null,
  activo boolean not null default true,
  fuente_inicial text,
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_locales_monitoreados_codigo_check
    check (length(trim(codigo_externo)) between 1 and 30),
  constraint com_locales_monitoreados_nombre_check
    check (length(trim(nombre)) between 2 and 180),
  constraint com_locales_monitoreados_codigo_key
    unique (cliente_id, codigo_externo)
);

create index if not exists com_locales_monitoreados_cliente_idx
  on public.com_locales_monitoreados (cliente_id, activo, codigo_externo);

create table if not exists public.com_cobertura_importaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  archivo_nombre text not null,
  archivo_hash text not null,
  fecha_reporte date not null,
  tipo text not null check (tipo in ('INICIAL_QUITO', 'SEGUIMIENTO')),
  filas_archivo integer not null default 0 check (filas_archivo >= 0),
  locales_archivo integer not null default 0 check (locales_archivo >= 0),
  posiciones_importadas integer not null default 0 check (posiciones_importadas >= 0),
  locales_ignorados integer not null default 0 check (locales_ignorados >= 0),
  skus_no_encontrados jsonb not null default '[]'::jsonb,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint com_cobertura_importaciones_hash_key
    unique (cliente_id, archivo_hash)
);

create index if not exists com_cobertura_importaciones_cliente_fecha_idx
  on public.com_cobertura_importaciones (cliente_id, fecha_reporte desc);

alter table public.com_cobertura_sku_local
  add column if not exists local_monitoreado_id uuid
    references public.com_locales_monitoreados(id) on delete restrict,
  add column if not exists origen text not null default 'MANUAL',
  add column if not exists reportado_ultimo boolean,
  add column if not exists ultima_fecha_reporte date,
  add column if not exists ultima_importacion_id uuid
    references public.com_cobertura_importaciones(id) on delete set null,
  add column if not exists confirmado_por uuid
    references auth.users(id) on delete set null,
  add column if not exists confirmado_en timestamptz;

alter table public.com_cobertura_sku_local
  alter column bodega_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.com_cobertura_sku_local'::regclass
      and conname = 'com_cobertura_local_origen_check'
  ) then
    alter table public.com_cobertura_sku_local
      add constraint com_cobertura_local_origen_check
      check (num_nonnulls(bodega_id, local_monitoreado_id) = 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.com_cobertura_sku_local'::regclass
      and conname = 'com_cobertura_origen_check'
  ) then
    alter table public.com_cobertura_sku_local
      add constraint com_cobertura_origen_check
      check (origen in ('MANUAL', 'FAVORITA_REPORTE', 'OPORTUNIDAD'));
  end if;
end;
$$;

create unique index if not exists com_cobertura_monitor_inicio_uidx
  on public.com_cobertura_sku_local (
    cliente_id, local_monitoreado_id, producto_id, vigente_desde
  )
  where local_monitoreado_id is not null;

create unique index if not exists com_cobertura_monitor_actual_uidx
  on public.com_cobertura_sku_local (
    cliente_id, local_monitoreado_id, producto_id
  )
  where local_monitoreado_id is not null and vigente_hasta is null;

create or replace function public.com_validar_cobertura_sku_local()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.local_monitoreado_id is not null then
    if not exists (
      select 1
      from public.com_locales_monitoreados local
      where local.id = new.local_monitoreado_id
        and local.cliente_id = new.cliente_id
    ) then
      raise exception 'El local monitoreado no pertenece al cliente seleccionado.';
    end if;
  elsif new.bodega_id is not null then
    if not exists (
      select 1
      from public.bodegas bodega
      where bodega.id = new.bodega_id
        and bodega.cliente_id = new.cliente_id
    ) then
      raise exception 'El local no pertenece al cliente seleccionado.';
    end if;
  else
    raise exception 'La posición debe tener un local válido.';
  end if;

  if not exists (
    select 1
    from public.productos producto
    where producto.id = new.producto_id and producto.activo
  ) then
    raise exception 'El SKU seleccionado no está activo.';
  end if;

  if new.estado = 'ACTIVO'
     and new.origen <> 'FAVORITA_REPORTE'
     and new.ultima_importacion_id is null
     and not exists (
       select 1
       from public.cliente_productos relacion
       where relacion.cliente_id = new.cliente_id
         and relacion.producto_id = new.producto_id
         and relacion.activo
     ) then
    raise exception 'El SKU no está autorizado para el cliente seleccionado.';
  end if;

  if exists (
    select 1
    from public.com_cobertura_sku_local cobertura
    where cobertura.cliente_id = new.cliente_id
      and cobertura.producto_id = new.producto_id
      and cobertura.id <> new.id
      and (
        (new.local_monitoreado_id is not null
          and cobertura.local_monitoreado_id = new.local_monitoreado_id)
        or
        (new.bodega_id is not null and cobertura.bodega_id = new.bodega_id)
      )
      and daterange(
        cobertura.vigente_desde,
        coalesce(cobertura.vigente_hasta + 1, 'infinity'::date),
        '[)'
      ) && daterange(
        new.vigente_desde,
        coalesce(new.vigente_hasta + 1, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'La posición SKU-local ya tiene un estado en ese periodo.';
  end if;

  return new;
end;
$$;

alter table public.com_locales_monitoreados enable row level security;
alter table public.com_cobertura_importaciones enable row level security;

drop policy if exists com_locales_monitoreados_lectura
  on public.com_locales_monitoreados;
create policy com_locales_monitoreados_lectura
  on public.com_locales_monitoreados
  for select to authenticated
  using (public.com_puede_ver_cliente_kpi(cliente_id));

drop policy if exists com_cobertura_importaciones_lectura
  on public.com_cobertura_importaciones;
create policy com_cobertura_importaciones_lectura
  on public.com_cobertura_importaciones
  for select to authenticated
  using (public.com_puede_ver_cliente_kpi(cliente_id));

create or replace function public.com_kpi_kam_catalogo_cobertura(
  p_cliente_id uuid default null,
  p_fecha date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_es_gerencia boolean := false;
  v_puede_ver boolean := false;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;
  if p_fecha is null then
    raise exception 'La fecha de vigencia es obligatoria.' using errcode = '22023';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid() and perfil.activo;

  v_es_gerencia := coalesce(v_rol in ('ADMINISTRADOR', 'GERENTE'), false);
  v_puede_ver := v_es_gerencia or v_rol = 'KAM';

  if not v_puede_ver then
    return jsonb_build_object(
      'puede_configurar', false,
      'puede_importar', false,
      'puede_gestionar_locales', false,
      'clientes', '[]'::jsonb,
      'locales', '[]'::jsonb,
      'productos', '[]'::jsonb,
      'posiciones', '[]'::jsonb,
      'importaciones', '[]'::jsonb
    );
  end if;

  if p_cliente_id is not null then
    if v_es_gerencia then
      v_puede_ver := exists (
        select 1 from public.clientes cliente
        where cliente.id = p_cliente_id and cliente.activo
      );
    else
      v_puede_ver := exists (
        select 1
        from public.com_kam_clientes asignacion
        where asignacion.kam_user_id = auth.uid()
          and asignacion.cliente_id = p_cliente_id
          and asignacion.activo
          and asignacion.vigente_desde <= p_fecha
          and (asignacion.vigente_hasta is null or asignacion.vigente_hasta >= p_fecha)
      );
    end if;
    if not v_puede_ver then
      raise exception 'No tienes acceso al cliente seleccionado.' using errcode = '42501';
    end if;
  end if;

  return jsonb_build_object(
    'puede_configurar', true,
    'puede_importar', v_es_gerencia,
    'puede_gestionar_locales', v_es_gerencia,
    'clientes', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', cliente.id, 'nombre', cliente.nombre)
        order by cliente.nombre
      )
      from public.clientes cliente
      where cliente.activo
        and (
          v_es_gerencia
          or exists (
            select 1
            from public.com_kam_clientes asignacion
            where asignacion.kam_user_id = auth.uid()
              and asignacion.cliente_id = cliente.id
              and asignacion.activo
              and asignacion.vigente_desde <= p_fecha
              and (asignacion.vigente_hasta is null or asignacion.vigente_hasta >= p_fecha)
          )
        )
    ), '[]'::jsonb),
    'locales', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', local.id,
          'codigo', local.codigo_externo,
          'nombre', local.nombre,
          'activo', local.activo
        ) order by local.codigo_externo
      )
      from public.com_locales_monitoreados local
      where local.cliente_id = p_cliente_id
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', producto.id,
          'codigo', producto.codigo,
          'nombre', coalesce(nullif(producto.corto, ''), producto.nombre),
          'autorizado', exists (
            select 1
            from public.cliente_productos relacion
            where relacion.cliente_id = p_cliente_id
              and relacion.producto_id = producto.id
              and relacion.activo
          )
        ) order by coalesce(nullif(producto.corto, ''), producto.nombre)
      )
      from public.productos producto
      where producto.activo
    ), '[]'::jsonb),
    'posiciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cobertura.id,
          'cliente_id', cobertura.cliente_id,
          'local_id', coalesce(cobertura.local_monitoreado_id, cobertura.bodega_id),
          'local_codigo', coalesce(local.codigo_externo, ''),
          'local_nombre', coalesce(local.nombre, bodega.nombre),
          'producto_id', cobertura.producto_id,
          'producto_codigo', producto.codigo,
          'producto_nombre', coalesce(nullif(producto.corto, ''), producto.nombre),
          'es_objetivo', cobertura.es_objetivo,
          'estado', cobertura.estado,
          'vigente_desde', cobertura.vigente_desde,
          'vigente_hasta', cobertura.vigente_hasta,
          'motivo', cobertura.motivo,
          'origen', cobertura.origen,
          'reportado_ultimo', cobertura.reportado_ultimo,
          'ultima_fecha_reporte', cobertura.ultima_fecha_reporte,
          'confirmado_en', cobertura.confirmado_en
        ) order by coalesce(local.codigo_externo, bodega.nombre),
          coalesce(nullif(producto.corto, ''), producto.nombre)
      )
      from public.com_cobertura_sku_local cobertura
      left join public.com_locales_monitoreados local
        on local.id = cobertura.local_monitoreado_id
      left join public.bodegas bodega
        on bodega.id = cobertura.bodega_id
      join public.productos producto
        on producto.id = cobertura.producto_id
      where cobertura.cliente_id = p_cliente_id
        and cobertura.vigente_desde <= p_fecha
        and (cobertura.vigente_hasta is null or cobertura.vigente_hasta >= p_fecha)
    ), '[]'::jsonb),
    'importaciones', coalesce((
      select jsonb_agg(to_jsonb(historial) order by historial.fecha_reporte desc, historial.creado_en desc)
      from (
        select
          importacion.id,
          importacion.archivo_nombre,
          importacion.fecha_reporte,
          importacion.tipo,
          importacion.locales_archivo,
          importacion.posiciones_importadas,
          importacion.locales_ignorados,
          importacion.skus_no_encontrados,
          importacion.creado_en
        from public.com_cobertura_importaciones importacion
        where importacion.cliente_id = p_cliente_id
        order by importacion.fecha_reporte desc, importacion.creado_en desc
        limit 10
      ) historial
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.com_kpi_kam_guardar_local_monitoreado(
  p_cliente_id uuid,
  p_codigo_externo text,
  p_nombre text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_codigo text;
  v_nombre text;
begin
  if not public.com_es_gerencia_kpi() then
    raise exception 'Solo gerencia puede administrar locales monitoreados.' using errcode = '42501';
  end if;
  v_codigo := upper(regexp_replace(trim(coalesce(p_codigo_externo, '')), '\s+', '', 'g'));
  v_nombre := upper(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'));
  if v_codigo = '' or v_nombre = '' then
    raise exception 'El código y el nombre del local son obligatorios.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.clientes cliente
    where cliente.id = p_cliente_id and cliente.activo
  ) then
    raise exception 'El cliente seleccionado no está activo.' using errcode = '22023';
  end if;

  insert into public.com_locales_monitoreados (
    cliente_id, codigo_externo, nombre, activo, fuente_inicial,
    creado_por, actualizado_por
  ) values (
    p_cliente_id, v_codigo, v_nombre, true, 'REGISTRO_MANUAL',
    auth.uid(), auth.uid()
  )
  on conflict (cliente_id, codigo_externo) do update
  set nombre = excluded.nombre,
      activo = true,
      actualizado_por = auth.uid(),
      actualizado_en = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.com_kpi_kam_importar_alcance_favorita(
  p_cliente_id uuid,
  p_archivo_nombre text,
  p_archivo_hash text,
  p_fecha_reporte date,
  p_inicial_quito boolean,
  p_filas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_importadas integer := 0;
  v_locales integer := 0;
  v_locales_ignorados integer := 0;
  v_skus_no_encontrados jsonb := '[]'::jsonb;
  v_existente public.com_cobertura_sku_local%rowtype;
  v_fila record;
begin
  if not public.com_es_gerencia_kpi() then
    raise exception 'Solo gerencia puede importar reportes de alcance.' using errcode = '42501';
  end if;
  if p_fecha_reporte is null or p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La fecha y las filas del reporte son obligatorias.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) = 0 or jsonb_array_length(p_filas) > 10000 then
    raise exception 'El reporte debe contener entre 1 y 10000 posiciones.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.com_cobertura_importaciones importacion
    where importacion.cliente_id = p_cliente_id
      and importacion.archivo_hash = trim(p_archivo_hash)
  ) then
    raise exception 'Este mismo archivo ya fue importado.' using errcode = '23505';
  end if;

  if p_inicial_quito then
    insert into public.com_locales_monitoreados (
      cliente_id, codigo_externo, nombre, activo, fuente_inicial,
      creado_por, actualizado_por
    )
    select distinct
      p_cliente_id,
      upper(regexp_replace(trim(fila.codigo_local), '\s+', '', 'g')),
      upper(regexp_replace(trim(fila.nombre_local), '\s+', ' ', 'g')),
      true,
      trim(p_archivo_nombre),
      auth.uid(),
      auth.uid()
    from jsonb_to_recordset(p_filas) as fila(
      codigo_local text, nombre_local text, codigo_sku text, nombre_sku text
    )
    where trim(coalesce(fila.codigo_local, '')) <> ''
      and trim(coalesce(fila.nombre_local, '')) <> ''
    on conflict (cliente_id, codigo_externo) do update
    set nombre = excluded.nombre,
        activo = true,
        actualizado_por = auth.uid(),
        actualizado_en = now();
  end if;

  select count(distinct local.id)::integer
  into v_locales
  from jsonb_to_recordset(p_filas) as fila(
    codigo_local text, nombre_local text, codigo_sku text, nombre_sku text
  )
  join public.com_locales_monitoreados local
    on local.cliente_id = p_cliente_id
   and local.codigo_externo = upper(regexp_replace(trim(fila.codigo_local), '\s+', '', 'g'))
   and local.activo;

  select count(distinct upper(regexp_replace(trim(fila.codigo_local), '\s+', '', 'g')))::integer
  into v_locales_ignorados
  from jsonb_to_recordset(p_filas) as fila(
    codigo_local text, nombre_local text, codigo_sku text, nombre_sku text
  )
  where not exists (
    select 1
    from public.com_locales_monitoreados local
    where local.cliente_id = p_cliente_id
      and local.codigo_externo = upper(regexp_replace(trim(fila.codigo_local), '\s+', '', 'g'))
      and local.activo
  );

  select coalesce(jsonb_agg(codigo order by codigo), '[]'::jsonb)
  into v_skus_no_encontrados
  from (
    select distinct trim(fila.codigo_sku) as codigo
    from jsonb_to_recordset(p_filas) as fila(
      codigo_local text, nombre_local text, codigo_sku text, nombre_sku text
    )
    where not exists (
      select 1
      from public.productos producto
      where producto.activo
        and regexp_replace(upper(producto.codigo), '[^A-Z0-9]', '', 'g') =
            regexp_replace(upper(trim(fila.codigo_sku)), '[^A-Z0-9]', '', 'g')
    )
  ) faltantes;

  insert into public.com_cobertura_importaciones (
    cliente_id, archivo_nombre, archivo_hash, fecha_reporte, tipo,
    filas_archivo, locales_archivo, locales_ignorados,
    skus_no_encontrados, creado_por
  ) values (
    p_cliente_id, trim(p_archivo_nombre), trim(p_archivo_hash), p_fecha_reporte,
    case when p_inicial_quito then 'INICIAL_QUITO' else 'SEGUIMIENTO' end,
    jsonb_array_length(p_filas), v_locales, v_locales_ignorados,
    v_skus_no_encontrados, auth.uid()
  ) returning id into v_importacion_id;

  update public.com_cobertura_sku_local cobertura
  set reportado_ultimo = false,
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where cobertura.cliente_id = p_cliente_id
    and cobertura.local_monitoreado_id is not null
    and cobertura.vigente_hasta is null
    and cobertura.ultima_importacion_id is not null;

  for v_fila in
    select distinct
      local.id as local_id,
      producto.id as producto_id
    from jsonb_to_recordset(p_filas) as fila(
      codigo_local text, nombre_local text, codigo_sku text, nombre_sku text
    )
    join public.com_locales_monitoreados local
      on local.cliente_id = p_cliente_id
     and local.codigo_externo = upper(regexp_replace(trim(fila.codigo_local), '\s+', '', 'g'))
     and local.activo
    join public.productos producto
      on producto.activo
     and regexp_replace(upper(producto.codigo), '[^A-Z0-9]', '', 'g') =
         regexp_replace(upper(trim(fila.codigo_sku)), '[^A-Z0-9]', '', 'g')
  loop
    select cobertura.*
    into v_existente
    from public.com_cobertura_sku_local cobertura
    where cobertura.cliente_id = p_cliente_id
      and cobertura.local_monitoreado_id = v_fila.local_id
      and cobertura.producto_id = v_fila.producto_id
      and cobertura.vigente_hasta is null
    order by cobertura.vigente_desde desc
    limit 1
    for update;

    if v_existente.id is null then
      insert into public.com_cobertura_sku_local (
        cliente_id, bodega_id, local_monitoreado_id, producto_id,
        es_objetivo, estado, vigente_desde, origen,
        reportado_ultimo, ultima_fecha_reporte, ultima_importacion_id,
        motivo, creado_por, actualizado_por
      ) values (
        p_cliente_id, null, v_fila.local_id, v_fila.producto_id,
        true, 'ACTIVO', p_fecha_reporte, 'FAVORITA_REPORTE',
        true, p_fecha_reporte, v_importacion_id,
        'Alcance reportado por Corporación Favorita', auth.uid(), auth.uid()
      );
    elsif v_existente.estado = 'ACTIVO' then
      update public.com_cobertura_sku_local
      set reportado_ultimo = true,
          ultima_fecha_reporte = p_fecha_reporte,
          ultima_importacion_id = v_importacion_id,
          actualizado_por = auth.uid(),
          actualizado_en = now()
      where id = v_existente.id;
    elsif v_existente.vigente_desde = p_fecha_reporte then
      update public.com_cobertura_sku_local
      set estado = 'ACTIVO',
          es_objetivo = true,
          reportado_ultimo = true,
          ultima_fecha_reporte = p_fecha_reporte,
          ultima_importacion_id = v_importacion_id,
          motivo = 'Alcance confirmado por el reporte de Corporación Favorita',
          actualizado_por = auth.uid(),
          actualizado_en = now()
      where id = v_existente.id;
    elsif v_existente.vigente_desde < p_fecha_reporte then
      update public.com_cobertura_sku_local
      set vigente_hasta = p_fecha_reporte - 1,
          actualizado_por = auth.uid(),
          actualizado_en = now()
      where id = v_existente.id;

      insert into public.com_cobertura_sku_local (
        cliente_id, bodega_id, local_monitoreado_id, producto_id,
        es_objetivo, estado, vigente_desde, origen,
        reportado_ultimo, ultima_fecha_reporte, ultima_importacion_id,
        motivo, creado_por, actualizado_por
      ) values (
        p_cliente_id, null, v_fila.local_id, v_fila.producto_id,
        true, 'ACTIVO', p_fecha_reporte,
        case when v_existente.origen = 'OPORTUNIDAD' then 'OPORTUNIDAD' else 'FAVORITA_REPORTE' end,
        true, p_fecha_reporte, v_importacion_id,
        'Alcance confirmado por el reporte de Corporación Favorita',
        auth.uid(), auth.uid()
      );
    else
      raise exception
        'Existe una cobertura futura para una posición del reporte desde %.',
        v_existente.vigente_desde using errcode = '22023';
    end if;
    v_importadas := v_importadas + 1;
  end loop;

  update public.com_cobertura_importaciones
  set posiciones_importadas = v_importadas
  where id = v_importacion_id;

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'locales_monitoreados', v_locales,
    'posiciones_importadas', v_importadas,
    'locales_ignorados', v_locales_ignorados,
    'skus_no_encontrados', v_skus_no_encontrados
  );
end;
$$;

create or replace function public.com_kpi_kam_guardar_cobertura(
  p_cliente_id uuid,
  p_bodega_id uuid,
  p_producto_id uuid,
  p_es_objetivo boolean,
  p_estado text,
  p_vigente_desde date,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_es_gerencia boolean := false;
  v_local_monitoreado_id uuid;
  v_bodega_id uuid;
  v_id uuid;
  v_desde_actual date;
  v_objetivo_actual boolean;
  v_origen_actual text;
  v_reportado_actual boolean;
  v_ultima_fecha_actual date;
  v_ultima_importacion_actual uuid;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;
  select perfil.rol into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid() and perfil.activo;
  v_es_gerencia := coalesce(v_rol in ('ADMINISTRADOR', 'GERENTE'), false);

  if not v_es_gerencia and not (
    v_rol = 'KAM' and exists (
      select 1 from public.com_kam_clientes asignacion
      where asignacion.kam_user_id = auth.uid()
        and asignacion.cliente_id = p_cliente_id
        and asignacion.activo
        and asignacion.vigente_desde <= p_vigente_desde
        and (asignacion.vigente_hasta is null or asignacion.vigente_hasta >= p_vigente_desde)
    )
  ) then
    raise exception 'No tienes permiso para gestionar esta cobertura.' using errcode = '42501';
  end if;
  if p_vigente_desde is null then
    raise exception 'La fecha de vigencia es obligatoria.' using errcode = '22023';
  end if;
  if p_estado is null or p_estado not in (
    'ACTIVO', 'DESCODIFICADO', 'SUSPENDIDO',
    'NO_AUTORIZADO', 'PENDIENTE', 'INACTIVO'
  ) then
    raise exception 'El estado de cobertura no es válido.' using errcode = '22023';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo, '')), '');
  if p_estado in ('DESCODIFICADO', 'SUSPENDIDO', 'NO_AUTORIZADO', 'INACTIVO')
     and v_motivo is null then
    raise exception 'Registra el motivo del estado seleccionado.' using errcode = '22023';
  end if;

  select local.id into v_local_monitoreado_id
  from public.com_locales_monitoreados local
  where local.id = p_bodega_id
    and local.cliente_id = p_cliente_id
    and local.activo;

  if v_local_monitoreado_id is null then
    select bodega.id into v_bodega_id
    from public.bodegas bodega
    where bodega.id = p_bodega_id
      and bodega.cliente_id = p_cliente_id
      and bodega.activo;
  end if;
  if v_local_monitoreado_id is null and v_bodega_id is null then
    raise exception 'El local seleccionado no pertenece al cliente o está inactivo.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.productos producto
    where producto.id = p_producto_id and producto.activo
  ) then
    raise exception 'El SKU seleccionado no está activo.' using errcode = '22023';
  end if;
  if p_estado = 'ACTIVO' and not exists (
    select 1 from public.cliente_productos relacion
    where relacion.cliente_id = p_cliente_id
      and relacion.producto_id = p_producto_id
      and relacion.activo
  ) then
    raise exception 'El SKU debe ser autorizado para el cliente antes de marcarlo activo.' using errcode = '22023';
  end if;

  select
    cobertura.id,
    cobertura.vigente_desde,
    cobertura.es_objetivo,
    cobertura.origen,
    cobertura.reportado_ultimo,
    cobertura.ultima_fecha_reporte,
    cobertura.ultima_importacion_id
  into
    v_id,
    v_desde_actual,
    v_objetivo_actual,
    v_origen_actual,
    v_reportado_actual,
    v_ultima_fecha_actual,
    v_ultima_importacion_actual
  from public.com_cobertura_sku_local cobertura
  where cobertura.cliente_id = p_cliente_id
    and cobertura.producto_id = p_producto_id
    and cobertura.vigente_hasta is null
    and (
      cobertura.local_monitoreado_id = v_local_monitoreado_id
      or cobertura.bodega_id = v_bodega_id
    )
  order by cobertura.vigente_desde desc
  limit 1
  for update;

  if not v_es_gerencia then
    if v_id is null and p_estado <> 'PENDIENTE' then
      raise exception 'Una oportunidad nueva debe registrarse como pendiente.' using errcode = '22023';
    end if;
    if v_id is not null and p_es_objetivo is distinct from v_objetivo_actual then
      raise exception 'Solo gerencia puede cambiar una posición objetivo.' using errcode = '42501';
    end if;
    if v_id is null and p_es_objetivo then
      raise exception 'Gerencia debe aprobar la nueva oportunidad como objetivo.' using errcode = '42501';
    end if;
  end if;

  if v_id is not null and v_desde_actual > p_vigente_desde then
    raise exception 'Ya existe una configuración futura desde %.', v_desde_actual using errcode = '22023';
  end if;

  if v_id is not null and v_desde_actual = p_vigente_desde then
    update public.com_cobertura_sku_local
    set es_objetivo = p_es_objetivo,
        estado = p_estado,
        motivo = v_motivo,
        confirmado_por = auth.uid(),
        confirmado_en = now(),
        actualizado_por = auth.uid(),
        actualizado_en = now()
    where id = v_id;
    return v_id;
  end if;

  if v_id is not null then
    update public.com_cobertura_sku_local
    set vigente_hasta = p_vigente_desde - 1,
        actualizado_por = auth.uid(),
        actualizado_en = now()
    where id = v_id;
  end if;

  insert into public.com_cobertura_sku_local (
    cliente_id, bodega_id, local_monitoreado_id, producto_id,
    es_objetivo, estado, vigente_desde, motivo, origen,
    reportado_ultimo, ultima_fecha_reporte, ultima_importacion_id,
    confirmado_por, confirmado_en, creado_por, actualizado_por
  ) values (
    p_cliente_id, v_bodega_id, v_local_monitoreado_id, p_producto_id,
    p_es_objetivo, p_estado, p_vigente_desde, v_motivo,
    case when v_id is null then 'OPORTUNIDAD' else v_origen_actual end,
    v_reportado_actual, v_ultima_fecha_actual, v_ultima_importacion_actual,
    auth.uid(), now(), auth.uid(), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

comment on table public.com_locales_monitoreados is
  'Locales comerciales seguidos por KPI KAM, identificados por el código estable del cliente.';
comment on table public.com_cobertura_importaciones is
  'Historial de reportes de alcance comercial importados para cobertura SKU-local.';
comment on function public.com_kpi_kam_importar_alcance_favorita(uuid, text, text, date, boolean, jsonb) is
  'Importa alcance Favorita. La primera carga fija locales por QUITO; las siguientes cruzan sus códigos guardados.';

drop function if exists public.com_kpi_kam_inicializar_cobertura(uuid, date);

revoke all on function public.com_kpi_kam_catalogo_cobertura(uuid, date)
  from public, anon;
revoke all on function public.com_kpi_kam_guardar_local_monitoreado(uuid, text, text)
  from public, anon;
revoke all on function public.com_kpi_kam_importar_alcance_favorita(uuid, text, text, date, boolean, jsonb)
  from public, anon;
revoke all on function public.com_kpi_kam_guardar_cobertura(uuid, uuid, uuid, boolean, text, date, text)
  from public, anon;

grant execute on function public.com_kpi_kam_catalogo_cobertura(uuid, date)
  to authenticated;
grant execute on function public.com_kpi_kam_guardar_local_monitoreado(uuid, text, text)
  to authenticated;
grant execute on function public.com_kpi_kam_importar_alcance_favorita(uuid, text, text, date, boolean, jsonb)
  to authenticated;
grant execute on function public.com_kpi_kam_guardar_cobertura(uuid, uuid, uuid, boolean, text, date, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
