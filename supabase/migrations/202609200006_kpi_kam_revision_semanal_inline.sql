-- CIBUSPAN ONE
-- KPI KAM - revisión semanal directa desde la matriz SKU-local.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_KPI_KAM_REVISION_SEMANAL_INLINE_V1')
);

create or replace function public.com_kpi_kam_revisar_cobertura(
  p_cliente_id uuid,
  p_local_id uuid,
  p_producto_id uuid,
  p_estado text,
  p_fecha_revision date
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
  v_estado_actual text;
  v_objetivo_actual boolean;
  v_origen_actual text;
  v_reportado_actual boolean;
  v_ultima_fecha_actual date;
  v_ultima_importacion_actual uuid;
  v_es_objetivo boolean;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid() and perfil.activo;

  v_es_gerencia := coalesce(v_rol in ('ADMINISTRADOR', 'GERENTE'), false);

  if not v_es_gerencia and not (
    v_rol = 'KAM' and exists (
      select 1
      from public.com_kam_clientes asignacion
      where asignacion.kam_user_id = auth.uid()
        and asignacion.cliente_id = p_cliente_id
        and asignacion.activo
        and asignacion.vigente_desde <= p_fecha_revision
        and (
          asignacion.vigente_hasta is null
          or asignacion.vigente_hasta >= p_fecha_revision
        )
    )
  ) then
    raise exception 'No tienes permiso para revisar la cobertura de este cliente.'
      using errcode = '42501';
  end if;

  if p_fecha_revision is null then
    raise exception 'La fecha de revisión es obligatoria.'
      using errcode = '22023';
  end if;

  if p_estado is null or p_estado not in (
    'ACTIVO', 'DESCODIFICADO', 'SUSPENDIDO',
    'NO_AUTORIZADO', 'PENDIENTE', 'INACTIVO'
  ) then
    raise exception 'El estado de cobertura no es válido.'
      using errcode = '22023';
  end if;

  select local.id
  into v_local_monitoreado_id
  from public.com_locales_monitoreados local
  where local.id = p_local_id
    and local.cliente_id = p_cliente_id
    and local.activo;

  if v_local_monitoreado_id is null then
    select bodega.id
    into v_bodega_id
    from public.bodegas bodega
    where bodega.id = p_local_id
      and bodega.cliente_id = p_cliente_id
      and bodega.activo;
  end if;

  if v_local_monitoreado_id is null and v_bodega_id is null then
    raise exception 'El local seleccionado no pertenece al cliente o está inactivo.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.productos producto
    where producto.id = p_producto_id and producto.activo
  ) then
    raise exception 'El SKU seleccionado no está activo.'
      using errcode = '22023';
  end if;

  if p_estado = 'ACTIVO' and not exists (
    select 1
    from public.cliente_productos relacion
    where relacion.cliente_id = p_cliente_id
      and relacion.producto_id = p_producto_id
      and relacion.activo
  ) then
    raise exception 'El SKU no está autorizado para este cliente.'
      using errcode = '22023';
  end if;

  select
    cobertura.id,
    cobertura.vigente_desde,
    cobertura.estado,
    cobertura.es_objetivo,
    cobertura.origen,
    cobertura.reportado_ultimo,
    cobertura.ultima_fecha_reporte,
    cobertura.ultima_importacion_id
  into
    v_id,
    v_desde_actual,
    v_estado_actual,
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

  if v_id is not null and v_desde_actual > p_fecha_revision then
    raise exception 'Ya existe una revisión posterior desde %.', v_desde_actual
      using errcode = '22023';
  end if;

  v_es_objetivo := case
    when v_id is not null then v_objetivo_actual
    when p_estado = 'NO_AUTORIZADO' then false
    else true
  end;
  v_motivo := 'Estado registrado en revisión semanal del '
    || to_char(p_fecha_revision, 'DD/MM/YYYY');

  if v_id is not null and v_estado_actual = p_estado then
    update public.com_cobertura_sku_local
    set confirmado_por = auth.uid(),
        confirmado_en = now(),
        actualizado_por = auth.uid(),
        actualizado_en = now()
    where id = v_id;
    return v_id;
  end if;

  if v_id is not null and v_desde_actual = p_fecha_revision then
    update public.com_cobertura_sku_local
    set estado = p_estado,
        es_objetivo = v_es_objetivo,
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
    set vigente_hasta = p_fecha_revision - 1,
        actualizado_por = auth.uid(),
        actualizado_en = now()
    where id = v_id;
  end if;

  insert into public.com_cobertura_sku_local (
    cliente_id,
    bodega_id,
    local_monitoreado_id,
    producto_id,
    es_objetivo,
    estado,
    vigente_desde,
    motivo,
    origen,
    reportado_ultimo,
    ultima_fecha_reporte,
    ultima_importacion_id,
    confirmado_por,
    confirmado_en,
    creado_por,
    actualizado_por
  ) values (
    p_cliente_id,
    v_bodega_id,
    v_local_monitoreado_id,
    p_producto_id,
    v_es_objetivo,
    p_estado,
    p_fecha_revision,
    v_motivo,
    case when v_id is null then 'MANUAL' else v_origen_actual end,
    case when p_estado = 'ACTIVO' then true else v_reportado_actual end,
    v_ultima_fecha_actual,
    v_ultima_importacion_actual,
    auth.uid(),
    now(),
    auth.uid(),
    auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.com_kpi_kam_revisar_cobertura(
  uuid, uuid, uuid, text, date
) from public, anon;

grant execute on function public.com_kpi_kam_revisar_cobertura(
  uuid, uuid, uuid, text, date
) to authenticated;

comment on function public.com_kpi_kam_revisar_cobertura(
  uuid, uuid, uuid, text, date
) is 'Registra cambios semanales de cobertura desde la matriz y conserva la vigencia anterior.';

notify pgrst, 'reload schema';

commit;
