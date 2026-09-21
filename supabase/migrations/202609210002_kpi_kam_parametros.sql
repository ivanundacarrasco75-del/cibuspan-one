-- KPI KAM - configuracion vigente de metas, pesos y aplicabilidad.

create or replace function public.com_kpi_kam_catalogo_parametros(
  p_periodo date,
  p_cliente_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_rol text;
  v_puede_configurar boolean := false;
begin
  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  v_puede_configurar := coalesce(v_rol in ('ADMINISTRADOR', 'GERENTE'), false);

  if v_rol is null or not public.app_puede('KPI KAM', auth.uid()) then
    raise exception 'No tienes permiso para consultar KPI KAM.';
  end if;

  if p_cliente_id is not null
    and not public.com_puede_ver_cliente_kpi(p_cliente_id, auth.uid()) then
    raise exception 'No tienes permiso para consultar este cliente.';
  end if;

  return jsonb_build_object(
    'puede_configurar', v_puede_configurar,
    'clientes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cliente.id,
          'nombre', cliente.nombre
        )
        order by cliente.nombre
      )
      from public.clientes cliente
      where cliente.activo
        and (
          v_puede_configurar
          or public.com_puede_ver_cliente_kpi(cliente.id, auth.uid())
        )
    ), '[]'::jsonb),
    'configuraciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'codigo', definicion.codigo,
          'nombre', definicion.nombre,
          'descripcion', definicion.descripcion,
          'aplica', configuracion.aplica,
          'peso', configuracion.peso,
          'meta', configuracion.meta,
          'rangos_puntuacion', configuracion.rangos_puntuacion,
          'reglas_criticas', configuracion.reglas_criticas,
          'origen', configuracion.alcance,
          'vigente_desde', configuracion.vigente_desde
        )
        order by definicion.orden
      )
      from public.com_kpi_definiciones definicion
      left join lateral (
        select fila.*
        from public.com_kpi_configuraciones fila
        where fila.kpi_id = definicion.id
          and fila.activo
          and fila.vigente_desde <= (v_periodo + interval '1 month - 1 day')::date
          and (fila.vigente_hasta is null or fila.vigente_hasta >= v_periodo)
          and (
            (p_cliente_id is not null and fila.alcance = 'CLIENTE' and fila.cliente_id = p_cliente_id)
            or fila.alcance = 'GENERAL'
          )
        order by
          case
            when p_cliente_id is not null
              and fila.alcance = 'CLIENTE'
              and fila.cliente_id = p_cliente_id then 0
            else 1
          end,
          fila.vigente_desde desc
        limit 1
      ) configuracion on true
      where definicion.activo
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.com_kpi_kam_guardar_parametros(
  p_periodo date,
  p_cliente_id uuid default null,
  p_configuraciones jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_rol text;
  v_alcance text := case when p_cliente_id is null then 'GENERAL' else 'CLIENTE' end;
  v_total numeric;
  v_fila record;
  v_kpi_id uuid;
  v_vigente_hasta date;
begin
  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE') then
    raise exception 'Solo Administrador o Gerente puede cambiar metas y pesos.';
  end if;

  if p_periodo <> v_periodo then
    raise exception 'El periodo debe corresponder al primer dia del mes.';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from public.clientes cliente
    where cliente.id = p_cliente_id and cliente.activo
  ) then
    raise exception 'El cliente seleccionado no existe o esta inactivo.';
  end if;

  if jsonb_typeof(p_configuraciones) <> 'array'
    or jsonb_array_length(p_configuraciones) <> 7 then
    raise exception 'Deben enviarse exactamente los siete KPI.';
  end if;

  if (
    select count(distinct item->>'codigo')
    from jsonb_array_elements(p_configuraciones) item
  ) <> 7 then
    raise exception 'Los siete KPI deben ser unicos.';
  end if;

  select sum((item->>'peso')::numeric)
  into v_total
  from jsonb_array_elements(p_configuraciones) item;

  if v_total is null or abs(v_total - 100) > 0.01 then
    raise exception 'La suma de los pesos configurados debe ser 100%%.';
  end if;

  for v_fila in
    select
      item->>'codigo' as codigo,
      coalesce((item->>'aplica')::boolean, true) as aplica,
      (item->>'peso')::numeric as peso,
      nullif(item->>'meta', '')::numeric as meta,
      item->'rangos_puntuacion' as rangos_puntuacion,
      coalesce(item->'reglas_criticas', '[]'::jsonb) as reglas_criticas
    from jsonb_array_elements(p_configuraciones) item
  loop
    select definicion.id
    into v_kpi_id
    from public.com_kpi_definiciones definicion
    where definicion.codigo = v_fila.codigo
      and definicion.activo;

    if v_kpi_id is null then
      raise exception 'KPI desconocido: %.', v_fila.codigo;
    end if;

    if v_fila.peso < 0 or v_fila.peso > 100 then
      raise exception 'El peso de % debe estar entre 0 y 100.', v_fila.codigo;
    end if;

    if v_fila.aplica and v_fila.meta is null then
      raise exception 'La meta de % es obligatoria mientras el KPI aplique.', v_fila.codigo;
    end if;

    if v_fila.aplica
      and v_fila.codigo = 'CRECIMIENTO_RENTABLE'
      and v_fila.meta <= 0 then
      raise exception 'La meta de crecimiento rentable debe ser mayor que cero.';
    end if;

    if jsonb_typeof(v_fila.rangos_puntuacion) <> 'array'
      or jsonb_array_length(v_fila.rangos_puntuacion) = 0 then
      raise exception 'Los rangos de % no son validos.', v_fila.codigo;
    end if;

    select min(siguiente.vigente_desde) - 1
    into v_vigente_hasta
    from public.com_kpi_configuraciones siguiente
    where siguiente.kpi_id = v_kpi_id
      and siguiente.alcance = v_alcance
      and siguiente.cliente_id is not distinct from p_cliente_id
      and siguiente.activo
      and siguiente.vigente_desde > v_periodo;

    update public.com_kpi_configuraciones anterior
    set vigente_hasta = v_periodo - 1,
        actualizado_por = auth.uid(),
        actualizado_en = now()
    where anterior.kpi_id = v_kpi_id
      and anterior.alcance = v_alcance
      and anterior.cliente_id is not distinct from p_cliente_id
      and anterior.activo
      and anterior.vigente_desde < v_periodo
      and (anterior.vigente_hasta is null or anterior.vigente_hasta >= v_periodo);

    insert into public.com_kpi_configuraciones (
      kpi_id,
      alcance,
      cliente_id,
      vigente_desde,
      vigente_hasta,
      activo,
      aplica,
      peso,
      meta,
      rangos_puntuacion,
      reglas_criticas,
      observaciones,
      creado_por,
      actualizado_por
    ) values (
      v_kpi_id,
      v_alcance,
      p_cliente_id,
      v_periodo,
      v_vigente_hasta,
      true,
      v_fila.aplica,
      v_fila.peso,
      v_fila.meta,
      v_fila.rangos_puntuacion,
      v_fila.reglas_criticas,
      case when p_cliente_id is null
        then 'Configuracion general desde la aplicacion.'
        else 'Excepcion por cliente desde la aplicacion.'
      end,
      auth.uid(),
      auth.uid()
    )
    on conflict (
      kpi_id,
      alcance,
      coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
      vigente_desde
    ) do update set
      activo = true,
      aplica = excluded.aplica,
      peso = excluded.peso,
      meta = excluded.meta,
      vigente_hasta = excluded.vigente_hasta,
      rangos_puntuacion = excluded.rangos_puntuacion,
      reglas_criticas = excluded.reglas_criticas,
      observaciones = excluded.observaciones,
      actualizado_por = auth.uid(),
      actualizado_en = now();
  end loop;
end;
$$;

revoke all on function public.com_kpi_kam_catalogo_parametros(date, uuid)
  from public, anon;
revoke all on function public.com_kpi_kam_guardar_parametros(date, uuid, jsonb)
  from public, anon;
grant execute on function public.com_kpi_kam_catalogo_parametros(date, uuid)
  to authenticated;
grant execute on function public.com_kpi_kam_guardar_parametros(date, uuid, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
