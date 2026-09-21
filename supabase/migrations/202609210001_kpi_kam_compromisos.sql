-- CIBUSPAN ONE
-- KPI KAM - captura y gestión de compromisos comerciales.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_KPI_KAM_COMPROMISOS_V1')
);

create or replace function public.com_kpi_kam_catalogo_compromisos(
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

  if v_rol is null or not coalesce(public.app_puede('KPI KAM'), false) then
    raise exception 'No tienes permiso para consultar los compromisos KPI KAM.'
      using errcode = '42501';
  end if;

  v_hasta := (p_periodo + interval '1 month - 1 day')::date;

  return jsonb_build_object(
    'puede_gestionar', v_rol in ('ADMINISTRADOR', 'GERENTE', 'KAM'),
    'clientes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cliente_id', cliente.id,
          'cliente_nombre', cliente.nombre,
          'kam_user_id', asignacion.kam_user_id,
          'kam_nombre', perfil.nombre
        )
        order by cliente.nombre
      )
      from public.clientes cliente
      join lateral (
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
      where cliente.activo
        and public.com_puede_ver_cliente_kpi(cliente.id)
    ), '[]'::jsonb),
    'compromisos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', compromiso.id,
          'descripcion', compromiso.descripcion,
          'cliente_id', compromiso.cliente_id,
          'cliente_nombre', cliente.nombre,
          'kam_user_id', compromiso.kam_user_id,
          'kam_nombre', coalesce(perfil.nombre, perfil.email),
          'fecha_creacion', compromiso.fecha_creacion,
          'fecha_limite', compromiso.fecha_limite,
          'estado', compromiso.estado,
          'estado_efectivo', case
            when compromiso.estado in ('PENDIENTE', 'EN_GESTION')
              and compromiso.fecha_limite < current_date
              then 'VENCIDO'
            else compromiso.estado
          end,
          'prioridad', compromiso.prioridad,
          'fecha_cumplimiento', compromiso.fecha_cumplimiento,
          'observaciones', compromiso.observaciones,
          'motivo_cancelacion', compromiso.motivo_cancelacion
        )
        order by
          case when compromiso.estado in ('PENDIENTE', 'EN_GESTION') then 0 else 1 end,
          compromiso.fecha_limite,
          compromiso.creado_en desc
      )
      from public.com_compromisos compromiso
      join public.clientes cliente on cliente.id = compromiso.cliente_id
      left join public.app_profiles perfil
        on perfil.user_id = compromiso.kam_user_id
      where public.com_puede_ver_cliente_kpi(compromiso.cliente_id)
        and (
          compromiso.fecha_limite between p_periodo and v_hasta
          or compromiso.estado in ('PENDIENTE', 'EN_GESTION')
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.com_kpi_kam_guardar_compromiso(
  p_id uuid,
  p_cliente_id uuid,
  p_descripcion text,
  p_fecha_limite date,
  p_prioridad text,
  p_observaciones text default null
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
  v_fecha_creacion date;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE', 'KAM') then
    raise exception 'No tienes permiso para gestionar compromisos.'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_descripcion, '')), '') is null then
    raise exception 'La descripción del compromiso es obligatoria.'
      using errcode = '22023';
  end if;

  if p_prioridad is null or p_prioridad not in ('BAJA', 'MEDIA', 'ALTA') then
    raise exception 'La prioridad seleccionada no es válida.'
      using errcode = '22023';
  end if;

  select asignacion.kam_user_id
  into v_kam_user_id
  from public.com_kam_clientes asignacion
  where asignacion.cliente_id = p_cliente_id
    and asignacion.activo
    and asignacion.vigente_desde <= current_date
    and (
      asignacion.vigente_hasta is null
      or asignacion.vigente_hasta >= current_date
    )
  order by asignacion.vigente_desde desc
  limit 1;

  if v_kam_user_id is null then
    raise exception 'El cliente no tiene un responsable KAM vigente.'
      using errcode = '22023';
  end if;

  if v_rol = 'KAM' and v_kam_user_id <> auth.uid() then
    raise exception 'No puedes gestionar compromisos de otro responsable.'
      using errcode = '42501';
  end if;

  if p_id is null then
    if p_fecha_limite is null or p_fecha_limite < current_date then
      raise exception 'La fecha límite no puede ser anterior a hoy.'
        using errcode = '22023';
    end if;

    insert into public.com_compromisos (
      descripcion,
      cliente_id,
      kam_user_id,
      fecha_creacion,
      fecha_limite,
      estado,
      prioridad,
      observaciones,
      creado_por,
      actualizado_por
    ) values (
      trim(p_descripcion),
      p_cliente_id,
      v_kam_user_id,
      current_date,
      p_fecha_limite,
      'PENDIENTE',
      p_prioridad,
      nullif(trim(coalesce(p_observaciones, '')), ''),
      auth.uid(),
      auth.uid()
    ) returning id into v_id;

    return v_id;
  end if;

  select compromiso.fecha_creacion
  into v_fecha_creacion
  from public.com_compromisos compromiso
  where compromiso.id = p_id
    and compromiso.cliente_id = p_cliente_id
  for update;

  if v_fecha_creacion is null then
    raise exception 'No se encontró el compromiso seleccionado.'
      using errcode = 'P0002';
  end if;

  if p_fecha_limite is null or p_fecha_limite < v_fecha_creacion then
    raise exception 'La fecha límite no puede ser anterior a la creación.'
      using errcode = '22023';
  end if;

  update public.com_compromisos
  set descripcion = trim(p_descripcion),
      kam_user_id = v_kam_user_id,
      fecha_limite = p_fecha_limite,
      prioridad = p_prioridad,
      observaciones = nullif(trim(coalesce(p_observaciones, '')), ''),
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where id = p_id
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.com_kpi_kam_actualizar_estado_compromiso(
  p_id uuid,
  p_estado text,
  p_motivo_cancelacion text default null,
  p_fecha_cumplimiento date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_compromiso public.com_compromisos%rowtype;
  v_asignado_actual boolean;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE', 'KAM') then
    raise exception 'No tienes permiso para gestionar compromisos.'
      using errcode = '42501';
  end if;

  select compromiso.*
  into v_compromiso
  from public.com_compromisos compromiso
  where compromiso.id = p_id
  for update;

  if v_compromiso.id is null then
    raise exception 'No se encontró el compromiso seleccionado.'
      using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.com_kam_clientes asignacion
    where asignacion.kam_user_id = auth.uid()
      and asignacion.cliente_id = v_compromiso.cliente_id
      and asignacion.activo
      and asignacion.vigente_desde <= current_date
      and (
        asignacion.vigente_hasta is null
        or asignacion.vigente_hasta >= current_date
      )
  ) into v_asignado_actual;

  if v_rol = 'KAM'
    and v_compromiso.kam_user_id <> auth.uid()
    and not v_asignado_actual then
    raise exception 'No puedes gestionar compromisos de otro responsable.'
      using errcode = '42501';
  end if;

  if p_estado is null or p_estado not in (
    'PENDIENTE', 'EN_GESTION', 'CUMPLIDO', 'CANCELADO'
  ) then
    raise exception 'El estado seleccionado no es válido.'
      using errcode = '22023';
  end if;

  if p_estado = 'CUMPLIDO' and (
    p_fecha_cumplimiento is null
    or p_fecha_cumplimiento < v_compromiso.fecha_creacion
    or p_fecha_cumplimiento > current_date
  ) then
    raise exception 'La fecha de cumplimiento no es válida.'
      using errcode = '22023';
  end if;

  if p_estado = 'CANCELADO'
    and nullif(trim(coalesce(p_motivo_cancelacion, '')), '') is null then
    raise exception 'Debes justificar la cancelación.'
      using errcode = '22023';
  end if;

  update public.com_compromisos
  set estado = p_estado,
      fecha_cumplimiento = case
        when p_estado = 'CUMPLIDO' then p_fecha_cumplimiento
        else null
      end,
      motivo_cancelacion = case
        when p_estado = 'CANCELADO'
          then trim(p_motivo_cancelacion)
        else null
      end,
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where id = p_id;

  return p_id;
end;
$$;

revoke all on function public.com_kpi_kam_catalogo_compromisos(date)
  from public, anon;
revoke all on function public.com_kpi_kam_guardar_compromiso(
  uuid, uuid, text, date, text, text
) from public, anon;
revoke all on function public.com_kpi_kam_actualizar_estado_compromiso(
  uuid, text, text, date
) from public, anon;

grant execute on function public.com_kpi_kam_catalogo_compromisos(date)
  to authenticated;
grant execute on function public.com_kpi_kam_guardar_compromiso(
  uuid, uuid, text, date, text, text
) to authenticated;
grant execute on function public.com_kpi_kam_actualizar_estado_compromiso(
  uuid, text, text, date
) to authenticated;

comment on function public.com_kpi_kam_catalogo_compromisos(date) is
  'Lista clientes visibles y compromisos abiertos o con vencimiento en el periodo.';
comment on function public.com_kpi_kam_guardar_compromiso(uuid, uuid, text, date, text, text) is
  'Crea o edita un compromiso para el responsable vigente del cliente.';
comment on function public.com_kpi_kam_actualizar_estado_compromiso(uuid, text, text, date) is
  'Actualiza el flujo de un compromiso y exige justificación al cancelar.';

notify pgrst, 'reload schema';

commit;
