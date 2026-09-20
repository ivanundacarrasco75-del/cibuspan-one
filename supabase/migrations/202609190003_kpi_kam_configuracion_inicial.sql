-- CIBUSPAN ONE
-- KPI KAM - configuración inicial de responsables y presupuestos.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtext('CIBUSPAN_ONE_KPI_KAM_CONFIG_V1'));

create or replace function public.com_kpi_kam_responsables()
returns table (
  user_id uuid,
  nombre text,
  email text
)
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

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or not coalesce(public.app_puede('KPI KAM'), false) then
    raise exception 'No tienes permiso para consultar KPI KAM.' using errcode = '42501';
  end if;

  return query
  select distinct
    perfil.user_id,
    perfil.nombre,
    perfil.email
  from public.app_profiles perfil
  where perfil.activo
    and (
      (v_rol = 'KAM' and perfil.user_id = auth.uid())
      or (
        v_rol <> 'KAM'
        and (
          perfil.rol = 'KAM'
          or exists (
            select 1
            from public.com_kam_clientes asignacion
            where asignacion.kam_user_id = perfil.user_id
              and asignacion.activo
          )
        )
      )
    )
  order by coalesce(perfil.nombre, perfil.email), perfil.email;
end;
$$;

create or replace function public.com_kpi_kam_catalogo_configuracion(
  p_periodo date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_hasta date;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;

  if p_periodo is null or extract(day from p_periodo) <> 1 then
    raise exception 'El periodo debe ser el primer día del mes.' using errcode = '22023';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE') then
    return jsonb_build_object(
      'puede_configurar', false,
      'usuarios', '[]'::jsonb,
      'clientes', '[]'::jsonb
    );
  end if;

  v_hasta := (p_periodo + interval '1 month - 1 day')::date;

  return jsonb_build_object(
    'puede_configurar', true,
    'usuarios', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', perfil.user_id,
          'nombre', perfil.nombre,
          'email', perfil.email,
          'rol', perfil.rol
        )
        order by coalesce(perfil.nombre, perfil.email), perfil.email
      )
      from public.app_profiles perfil
      where perfil.activo
    ), '[]'::jsonb),
    'clientes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cliente_id', cliente.id,
          'cliente_nombre', cliente.nombre,
          'kam_user_id', asignacion.kam_user_id,
          'kam_nombre', perfil.nombre,
          'presupuesto', presupuesto.presupuesto
        )
        order by cliente.nombre
      )
      from public.clientes cliente
      left join lateral (
        select cartera.kam_user_id
        from public.com_kam_clientes cartera
        where cartera.cliente_id = cliente.id
          and cartera.activo
          and cartera.vigente_desde <= v_hasta
          and (
            cartera.vigente_hasta is null
            or cartera.vigente_hasta >= p_periodo
          )
        order by cartera.vigente_desde desc
        limit 1
      ) asignacion on true
      left join public.app_profiles perfil
        on perfil.user_id = asignacion.kam_user_id
      left join public.com_presupuestos_mensuales presupuesto
        on presupuesto.periodo = p_periodo
       and presupuesto.cliente_id = cliente.id
      where cliente.activo
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.com_kpi_kam_guardar_asignacion(
  p_periodo date,
  p_cliente_id uuid,
  p_kam_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_id uuid;
  v_hasta date;
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
    raise exception 'Solo gerencia puede configurar responsables.' using errcode = '42501';
  end if;

  if p_periodo is null or extract(day from p_periodo) <> 1 then
    raise exception 'El periodo debe ser el primer día del mes.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.clientes cliente
    where cliente.id = p_cliente_id and cliente.activo
  ) then
    raise exception 'El cliente seleccionado no está activo.' using errcode = '22023';
  end if;

  if p_kam_user_id is not null and not exists (
    select 1 from public.app_profiles perfil
    where perfil.user_id = p_kam_user_id and perfil.activo
  ) then
    raise exception 'El responsable seleccionado no está activo.' using errcode = '22023';
  end if;

  v_hasta := (p_periodo + interval '1 month - 1 day')::date;

  select asignacion.id
  into v_id
  from public.com_kam_clientes asignacion
  where asignacion.cliente_id = p_cliente_id
    and asignacion.kam_user_id = p_kam_user_id
    and asignacion.activo
    and asignacion.vigente_desde <= v_hasta
    and (
      asignacion.vigente_hasta is null
      or asignacion.vigente_hasta >= p_periodo
    )
  order by asignacion.vigente_desde desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  update public.com_kam_clientes asignacion
  set
    vigente_hasta = case
      when asignacion.vigente_desde < p_periodo then p_periodo - 1
      else asignacion.vigente_hasta
    end,
    activo = case
      when asignacion.vigente_desde >= p_periodo then false
      else asignacion.activo
    end,
    actualizado_por = auth.uid(),
    actualizado_en = now()
  where asignacion.cliente_id = p_cliente_id
    and asignacion.activo
    and asignacion.vigente_desde <= v_hasta
    and (
      asignacion.vigente_hasta is null
      or asignacion.vigente_hasta >= p_periodo
    );

  if p_kam_user_id is null then
    return null;
  end if;

  insert into public.com_kam_clientes (
    kam_user_id,
    cliente_id,
    vigente_desde,
    vigente_hasta,
    activo,
    creado_por,
    actualizado_por
  )
  values (
    p_kam_user_id,
    p_cliente_id,
    p_periodo,
    null,
    true,
    auth.uid(),
    auth.uid()
  )
  on conflict (kam_user_id, cliente_id, vigente_desde)
  do update set
    vigente_hasta = null,
    activo = true,
    actualizado_por = auth.uid(),
    actualizado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.com_kpi_kam_habilitar_usuario(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_rol_objetivo text;
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
    raise exception 'Solo gerencia puede habilitar un usuario KAM.' using errcode = '42501';
  end if;

  select perfil.rol
  into v_rol_objetivo
  from public.app_profiles perfil
  where perfil.user_id = p_user_id
    and perfil.activo;

  if v_rol_objetivo is null then
    raise exception 'El usuario seleccionado no está activo.' using errcode = '22023';
  end if;

  if v_rol_objetivo in ('ADMINISTRADOR', 'GERENTE') then
    raise exception 'No se puede reemplazar el rol de un Administrador o Gerente.' using errcode = '22023';
  end if;

  update public.app_profiles perfil
  set
    rol = 'KAM',
    actualizado_en = now()
  where perfil.user_id = p_user_id
    and perfil.activo;

  insert into public.app_role_permissions (rol, pantalla, permitido)
  values ('KAM', 'KPI KAM', true)
  on conflict (rol, pantalla)
  do update set permitido = true;
end;
$$;

create or replace function public.com_kpi_kam_guardar_presupuesto(
  p_periodo date,
  p_cliente_id uuid,
  p_presupuesto numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_kam_user_id uuid;
  v_id uuid;
  v_hasta date;
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
    raise exception 'Solo gerencia puede guardar presupuestos.' using errcode = '42501';
  end if;

  if p_periodo is null or extract(day from p_periodo) <> 1 then
    raise exception 'El periodo debe ser el primer día del mes.' using errcode = '22023';
  end if;

  if p_presupuesto is null or p_presupuesto < 0 then
    raise exception 'El presupuesto debe ser mayor o igual a cero.' using errcode = '22023';
  end if;

  v_hasta := (p_periodo + interval '1 month - 1 day')::date;

  select asignacion.kam_user_id
  into v_kam_user_id
  from public.com_kam_clientes asignacion
  where asignacion.cliente_id = p_cliente_id
    and asignacion.activo
    and asignacion.vigente_desde <= v_hasta
    and (
      asignacion.vigente_hasta is null
      or asignacion.vigente_hasta >= p_periodo
    )
  order by asignacion.vigente_desde desc
  limit 1;

  if v_kam_user_id is null then
    raise exception 'Primero asigna un responsable al cliente.' using errcode = '22023';
  end if;

  insert into public.com_presupuestos_mensuales (
    periodo,
    cliente_id,
    kam_user_id,
    presupuesto,
    creado_por,
    actualizado_por
  )
  values (
    p_periodo,
    p_cliente_id,
    v_kam_user_id,
    round(p_presupuesto, 2),
    auth.uid(),
    auth.uid()
  )
  on conflict (periodo, cliente_id)
  do update set
    kam_user_id = excluded.kam_user_id,
    presupuesto = excluded.presupuesto,
    actualizado_por = auth.uid(),
    actualizado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.com_kpi_kam_catalogo_configuracion(date) is
  'Lista usuarios, clientes, responsables y presupuestos para configuración KPI KAM.';
comment on function public.com_kpi_kam_guardar_asignacion(date, uuid, uuid) is
  'Asigna o retira el responsable comercial de un cliente conservando vigencia histórica.';
comment on function public.com_kpi_kam_guardar_presupuesto(date, uuid, numeric) is
  'Crea o actualiza el presupuesto mensual de un cliente asignado.';
comment on function public.com_kpi_kam_habilitar_usuario(uuid) is
  'Cambia explícitamente el rol de un usuario activo a KAM.';

revoke all on function public.com_kpi_kam_responsables() from public, anon;
revoke all on function public.com_kpi_kam_catalogo_configuracion(date) from public, anon;
revoke all on function public.com_kpi_kam_guardar_asignacion(date, uuid, uuid) from public, anon;
revoke all on function public.com_kpi_kam_guardar_presupuesto(date, uuid, numeric) from public, anon;
revoke all on function public.com_kpi_kam_habilitar_usuario(uuid) from public, anon;

grant execute on function public.com_kpi_kam_responsables() to authenticated;
grant execute on function public.com_kpi_kam_catalogo_configuracion(date) to authenticated;
grant execute on function public.com_kpi_kam_guardar_asignacion(date, uuid, uuid) to authenticated;
grant execute on function public.com_kpi_kam_guardar_presupuesto(date, uuid, numeric) to authenticated;
grant execute on function public.com_kpi_kam_habilitar_usuario(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
