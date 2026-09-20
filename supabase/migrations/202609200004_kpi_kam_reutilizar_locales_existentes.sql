-- CIBUSPAN ONE
-- KPI KAM - reutiliza locales operativos e históricos sin duplicarlos.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_KPI_KAM_REUTILIZAR_LOCALES_V1')
);

alter table public.com_locales_monitoreados
  add column if not exists bodega_origen_id uuid
    references public.bodegas(id) on delete set null;

create unique index if not exists com_locales_monitoreados_bodega_origen_uidx
  on public.com_locales_monitoreados (cliente_id, bodega_origen_id)
  where bodega_origen_id is not null;

create or replace function public.com_kpi_kam_candidatos_locales(
  p_cliente_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.com_es_gerencia_kpi() then
    return '[]'::jsonb;
  end if;

  if not exists (
    select 1
    from public.clientes cliente
    where cliente.id = p_cliente_id and cliente.activo
  ) then
    raise exception 'El cliente seleccionado no está activo.'
      using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'clave', candidato.clave,
        'tipo', candidato.tipo,
        'referencia_id', candidato.referencia_id,
        'codigo_sugerido', candidato.codigo_sugerido,
        'nombre', candidato.nombre,
        'origen', candidato.origen
      ) order by candidato.orden_origen, candidato.nombre
    )
    from (
      select
        'BODEGA:' || bodega.id::text as clave,
        'BODEGA'::text as tipo,
        bodega.id::text as referencia_id,
        'BOD-' || upper(substr(replace(bodega.id::text, '-', ''), 1, 8))
          as codigo_sugerido,
        upper(regexp_replace(trim(bodega.nombre), '\s+', ' ', 'g')) as nombre,
        'Catálogo operativo'::text as origen,
        1 as orden_origen
      from public.bodegas bodega
      where bodega.cliente_id = p_cliente_id
        and bodega.activo
        and not exists (
          select 1
          from public.com_locales_monitoreados local
          where local.cliente_id = p_cliente_id
            and (
              local.bodega_origen_id = bodega.id
              or upper(regexp_replace(trim(local.nombre), '\s+', ' ', 'g')) =
                 upper(regexp_replace(trim(bodega.nombre), '\s+', ' ', 'g'))
            )
        )

      union all

      select
        'DOCUMENTO:' || md5(documento.nombre_normalizado) as clave,
        'DOCUMENTO'::text as tipo,
        md5(documento.nombre_normalizado) as referencia_id,
        'DOC-' || upper(substr(md5(documento.nombre_normalizado), 1, 8))
          as codigo_sugerido,
        documento.nombre_normalizado as nombre,
        'Documentos históricos'::text as origen,
        2 as orden_origen
      from (
        select distinct
          upper(regexp_replace(trim(devolucion.nombre_local_documento), '\s+', ' ', 'g'))
            as nombre_normalizado
        from public.devoluciones devolucion
        where devolucion.cliente_id = p_cliente_id
          and nullif(trim(devolucion.nombre_local_documento), '') is not null
      ) documento
      where not exists (
        select 1
        from public.com_locales_monitoreados local
        where local.cliente_id = p_cliente_id
          and upper(regexp_replace(trim(local.nombre), '\s+', ' ', 'g')) =
              documento.nombre_normalizado
      )
        and not exists (
          select 1
          from public.bodegas bodega
          where bodega.cliente_id = p_cliente_id
            and bodega.activo
            and upper(regexp_replace(trim(bodega.nombre), '\s+', ' ', 'g')) =
                documento.nombre_normalizado
        )
    ) candidato
  ), '[]'::jsonb);
end;
$$;

create or replace function public.com_kpi_kam_incorporar_locales_existentes(
  p_cliente_id uuid,
  p_candidatos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_tipo text;
  v_referencia text;
  v_bodega_id uuid;
  v_nombre text;
  v_codigo text;
  v_existente_id uuid;
  v_incorporados integer := 0;
  v_existentes integer := 0;
begin
  if not public.com_es_gerencia_kpi() then
    raise exception 'Solo gerencia puede incorporar locales monitoreados.'
      using errcode = '42501';
  end if;

  if p_candidatos is null or jsonb_typeof(p_candidatos) <> 'array' then
    raise exception 'Selecciona una lista válida de locales.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_candidatos) = 0
     or jsonb_array_length(p_candidatos) > 500 then
    raise exception 'Selecciona entre 1 y 500 locales.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.clientes cliente
    where cliente.id = p_cliente_id and cliente.activo
  ) then
    raise exception 'El cliente seleccionado no está activo.'
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_candidatos)
  loop
    v_tipo := upper(trim(coalesce(v_item->>'tipo', '')));
    v_referencia := trim(coalesce(v_item->>'referencia_id', ''));
    v_bodega_id := null;
    v_nombre := null;
    v_codigo := null;
    v_existente_id := null;

    if v_tipo = 'BODEGA' then
      begin
        v_bodega_id := v_referencia::uuid;
      exception when others then
        raise exception 'Existe un local operativo con identificador inválido.'
          using errcode = '22023';
      end;

      select
        upper(regexp_replace(trim(bodega.nombre), '\s+', ' ', 'g')),
        'BOD-' || upper(substr(replace(bodega.id::text, '-', ''), 1, 8))
      into v_nombre, v_codigo
      from public.bodegas bodega
      where bodega.id = v_bodega_id
        and bodega.cliente_id = p_cliente_id
        and bodega.activo;

      if v_nombre is null then
        raise exception 'Uno de los locales operativos ya no está disponible.'
          using errcode = '22023';
      end if;

      select local.id
      into v_existente_id
      from public.com_locales_monitoreados local
      where local.cliente_id = p_cliente_id
        and (
          local.bodega_origen_id = v_bodega_id
          or upper(regexp_replace(trim(local.nombre), '\s+', ' ', 'g')) = v_nombre
        )
      order by local.creado_en
      limit 1
      for update;

      if v_existente_id is not null then
        update public.com_locales_monitoreados
        set activo = true,
            bodega_origen_id = coalesce(bodega_origen_id, v_bodega_id),
            actualizado_por = auth.uid(),
            actualizado_en = now()
        where id = v_existente_id;
        v_existentes := v_existentes + 1;
        continue;
      end if;

      insert into public.com_locales_monitoreados (
        cliente_id, codigo_externo, nombre, activo, fuente_inicial,
        bodega_origen_id, creado_por, actualizado_por
      ) values (
        p_cliente_id, v_codigo, v_nombre, true, 'CATALOGO_OPERATIVO',
        v_bodega_id, auth.uid(), auth.uid()
      );
      v_incorporados := v_incorporados + 1;

    elsif v_tipo = 'DOCUMENTO' then
      select documento.nombre_normalizado
      into v_nombre
      from (
        select distinct
          upper(regexp_replace(trim(devolucion.nombre_local_documento), '\s+', ' ', 'g'))
            as nombre_normalizado
        from public.devoluciones devolucion
        where devolucion.cliente_id = p_cliente_id
          and nullif(trim(devolucion.nombre_local_documento), '') is not null
      ) documento
      where md5(documento.nombre_normalizado) = v_referencia
      limit 1;

      if v_nombre is null then
        raise exception 'Uno de los locales históricos ya no está disponible.'
          using errcode = '22023';
      end if;

      v_codigo := 'DOC-' || upper(substr(md5(v_nombre), 1, 8));

      select local.id
      into v_existente_id
      from public.com_locales_monitoreados local
      where local.cliente_id = p_cliente_id
        and upper(regexp_replace(trim(local.nombre), '\s+', ' ', 'g')) = v_nombre
      order by local.creado_en
      limit 1
      for update;

      if v_existente_id is not null then
        update public.com_locales_monitoreados
        set activo = true,
            actualizado_por = auth.uid(),
            actualizado_en = now()
        where id = v_existente_id;
        v_existentes := v_existentes + 1;
        continue;
      end if;

      insert into public.com_locales_monitoreados (
        cliente_id, codigo_externo, nombre, activo, fuente_inicial,
        creado_por, actualizado_por
      ) values (
        p_cliente_id, v_codigo, v_nombre, true, 'DOCUMENTOS_HISTORICOS',
        auth.uid(), auth.uid()
      );
      v_incorporados := v_incorporados + 1;
    else
      raise exception 'Existe un origen de local no reconocido.'
        using errcode = '22023';
    end if;
  end loop;

  return jsonb_build_object(
    'incorporados', v_incorporados,
    'ya_existian', v_existentes
  );
end;
$$;

revoke all on function public.com_kpi_kam_candidatos_locales(uuid)
  from public;
grant execute on function public.com_kpi_kam_candidatos_locales(uuid)
  to authenticated;

revoke all on function public.com_kpi_kam_incorporar_locales_existentes(uuid, jsonb)
  from public;
grant execute on function public.com_kpi_kam_incorporar_locales_existentes(uuid, jsonb)
  to authenticated;

notify pgrst, 'reload schema';

commit;
