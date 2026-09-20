-- CIBUSPAN ONE
-- KPI KAM - configuración histórica de cobertura cliente + local + SKU.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtext('CIBUSPAN_ONE_KPI_KAM_COBERTURA_V1'));

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
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE') then
    return jsonb_build_object(
      'puede_configurar', false,
      'clientes', '[]'::jsonb,
      'locales', '[]'::jsonb,
      'productos', '[]'::jsonb,
      'posiciones', '[]'::jsonb
    );
  end if;

  if p_cliente_id is not null and not exists (
    select 1
    from public.clientes cliente
    where cliente.id = p_cliente_id
      and cliente.activo
  ) then
    raise exception 'El cliente seleccionado no está activo.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'puede_configurar', true,
    'clientes', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', cliente.id, 'nombre', cliente.nombre)
        order by cliente.nombre
      )
      from public.clientes cliente
      where cliente.activo
    ), '[]'::jsonb),
    'locales', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', bodega.id, 'nombre', bodega.nombre)
        order by bodega.nombre
      )
      from public.bodegas bodega
      where bodega.cliente_id = p_cliente_id
        and bodega.activo
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', producto.id,
          'codigo', producto.codigo,
          'nombre', coalesce(nullif(producto.corto, ''), producto.nombre)
        )
        order by coalesce(nullif(producto.corto, ''), producto.nombre)
      )
      from public.cliente_productos relacion
      join public.productos producto
        on producto.id = relacion.producto_id
      where relacion.cliente_id = p_cliente_id
        and relacion.activo
        and producto.activo
    ), '[]'::jsonb),
    'posiciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cobertura.id,
          'cliente_id', cobertura.cliente_id,
          'local_id', cobertura.bodega_id,
          'local_nombre', bodega.nombre,
          'producto_id', cobertura.producto_id,
          'producto_codigo', producto.codigo,
          'producto_nombre', coalesce(nullif(producto.corto, ''), producto.nombre),
          'es_objetivo', cobertura.es_objetivo,
          'estado', cobertura.estado,
          'vigente_desde', cobertura.vigente_desde,
          'vigente_hasta', cobertura.vigente_hasta,
          'motivo', cobertura.motivo
        )
        order by bodega.nombre,
          coalesce(nullif(producto.corto, ''), producto.nombre)
      )
      from public.com_cobertura_sku_local cobertura
      join public.bodegas bodega
        on bodega.id = cobertura.bodega_id
      join public.productos producto
        on producto.id = cobertura.producto_id
      where cobertura.cliente_id = p_cliente_id
        and cobertura.vigente_desde <= p_fecha
        and (
          cobertura.vigente_hasta is null
          or cobertura.vigente_hasta >= p_fecha
        )
    ), '[]'::jsonb)
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
  v_id uuid;
  v_desde_actual date;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE') then
    raise exception 'Solo gerencia puede configurar cobertura.' using errcode = '42501';
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

  if p_es_objetivo is null then
    raise exception 'Define si la posición forma parte del objetivo.' using errcode = '22023';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo, '')), '');
  if p_estado in ('DESCODIFICADO', 'SUSPENDIDO', 'NO_AUTORIZADO', 'INACTIVO')
     and v_motivo is null then
    raise exception 'Registra el motivo del estado seleccionado.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.bodegas bodega
    where bodega.id = p_bodega_id
      and bodega.cliente_id = p_cliente_id
      and bodega.activo
  ) then
    raise exception 'El local seleccionado no pertenece al cliente o está inactivo.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.cliente_productos relacion
    join public.productos producto
      on producto.id = relacion.producto_id
    where relacion.cliente_id = p_cliente_id
      and relacion.producto_id = p_producto_id
      and relacion.activo
      and producto.activo
  ) then
    raise exception 'El SKU no está autorizado para el cliente.' using errcode = '22023';
  end if;

  select cobertura.id, cobertura.vigente_desde
  into v_id, v_desde_actual
  from public.com_cobertura_sku_local cobertura
  where cobertura.cliente_id = p_cliente_id
    and cobertura.bodega_id = p_bodega_id
    and cobertura.producto_id = p_producto_id
    and cobertura.vigente_hasta is null
  order by cobertura.vigente_desde desc
  limit 1
  for update;

  if v_id is not null and v_desde_actual > p_vigente_desde then
    raise exception
      'Ya existe una configuración futura desde %. Selecciona esa fecha o una posterior.',
      v_desde_actual using errcode = '22023';
  end if;

  if v_id is not null and v_desde_actual = p_vigente_desde then
    update public.com_cobertura_sku_local
    set
      es_objetivo = p_es_objetivo,
      estado = p_estado,
      motivo = v_motivo,
      actualizado_por = auth.uid(),
      actualizado_en = now()
    where id = v_id;
    return v_id;
  end if;

  if v_id is not null then
    update public.com_cobertura_sku_local
    set
      vigente_hasta = p_vigente_desde - 1,
      actualizado_por = auth.uid(),
      actualizado_en = now()
    where id = v_id;
  end if;

  insert into public.com_cobertura_sku_local (
    cliente_id,
    bodega_id,
    producto_id,
    es_objetivo,
    estado,
    vigente_desde,
    vigente_hasta,
    motivo,
    creado_por,
    actualizado_por
  )
  values (
    p_cliente_id,
    p_bodega_id,
    p_producto_id,
    p_es_objetivo,
    p_estado,
    p_vigente_desde,
    null,
    v_motivo,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.com_kpi_kam_inicializar_cobertura(
  p_cliente_id uuid,
  p_vigente_desde date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_insertados integer;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE') then
    raise exception 'Solo gerencia puede configurar cobertura.' using errcode = '42501';
  end if;

  if p_vigente_desde is null then
    raise exception 'La fecha de vigencia es obligatoria.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.clientes cliente
    where cliente.id = p_cliente_id and cliente.activo
  ) then
    raise exception 'El cliente seleccionado no está activo.' using errcode = '22023';
  end if;

  insert into public.com_cobertura_sku_local (
    cliente_id,
    bodega_id,
    producto_id,
    es_objetivo,
    estado,
    vigente_desde,
    motivo,
    creado_por,
    actualizado_por
  )
  select distinct
    p_cliente_id,
    bodega.id,
    relacion.producto_id,
    true,
    'PENDIENTE',
    p_vigente_desde,
    'Matriz inicial pendiente de validación gerencial',
    auth.uid(),
    auth.uid()
  from public.bodegas bodega
  join public.cliente_productos relacion
    on relacion.cliente_id = p_cliente_id
   and relacion.activo
  join public.productos producto
    on producto.id = relacion.producto_id
   and producto.activo
  where bodega.cliente_id = p_cliente_id
    and bodega.activo
    and not exists (
      select 1
      from public.com_cobertura_sku_local cobertura
      where cobertura.cliente_id = p_cliente_id
        and cobertura.bodega_id = bodega.id
        and cobertura.producto_id = relacion.producto_id
        and cobertura.vigente_hasta is null
    );

  get diagnostics v_insertados = row_count;
  return v_insertados;
end;
$$;

comment on function public.com_kpi_kam_catalogo_cobertura(uuid, date) is
  'Devuelve clientes, locales, SKU autorizados y posiciones vigentes de cobertura.';
comment on function public.com_kpi_kam_guardar_cobertura(uuid, uuid, uuid, boolean, text, date, text) is
  'Crea o cambia una posición de cobertura conservando la vigencia histórica.';
comment on function public.com_kpi_kam_inicializar_cobertura(uuid, date) is
  'Crea como pendientes las posiciones faltantes de la matriz local por SKU del cliente.';

revoke all on function public.com_kpi_kam_catalogo_cobertura(uuid, date)
  from public, anon;
revoke all on function public.com_kpi_kam_guardar_cobertura(uuid, uuid, uuid, boolean, text, date, text)
  from public, anon;
revoke all on function public.com_kpi_kam_inicializar_cobertura(uuid, date)
  from public, anon;

grant execute on function public.com_kpi_kam_catalogo_cobertura(uuid, date)
  to authenticated;
grant execute on function public.com_kpi_kam_guardar_cobertura(uuid, uuid, uuid, boolean, text, date, text)
  to authenticated;
grant execute on function public.com_kpi_kam_inicializar_cobertura(uuid, date)
  to authenticated;

commit;

notify pgrst, 'reload schema';
