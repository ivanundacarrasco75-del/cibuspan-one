-- CIBUSPAN ONE
-- Clasificacion masiva de facturas y reglas completas por proveedor.

alter table public.fin_reglas_clasificacion_pago
  add column if not exists afecta_tipo text not null default 'GENERAL',
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fin_reglas_afecta_tipo_check'
      and conrelid = 'public.fin_reglas_clasificacion_pago'::regclass
  ) then
    alter table public.fin_reglas_clasificacion_pago
      add constraint fin_reglas_afecta_tipo_check
      check (afecta_tipo in ('GENERAL', 'CLIENTE'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fin_reglas_cliente_coherente_check'
      and conrelid = 'public.fin_reglas_clasificacion_pago'::regclass
  ) then
    alter table public.fin_reglas_clasificacion_pago
      add constraint fin_reglas_cliente_coherente_check
      check (
        (afecta_tipo = 'GENERAL' and cliente_id is null)
        or (afecta_tipo = 'CLIENTE' and cliente_id is not null)
      );
  end if;
end;
$$;

create index if not exists fin_reglas_cliente_idx
  on public.fin_reglas_clasificacion_pago (cliente_id)
  where cliente_id is not null and activo;

create or replace function public.fin_aplicar_regla_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regla record;
begin
  if new.estado_clasificacion = 'REVISADA'
     or trim(coalesce(new.proveedor_normalizado, '')) = '' then
    return new;
  end if;

  select
    regla.cuenta_pago_id,
    regla.confianza,
    regla.afecta_tipo,
    regla.cliente_id
  into v_regla
  from public.fin_reglas_clasificacion_pago regla
  where regla.activo
    and regla.campo = 'PROVEEDOR'
    and new.proveedor_normalizado like '%' || regla.patron || '%'
  order by regla.prioridad, length(regla.patron) desc
  limit 1;

  if found then
    new.cuenta_pago_id := v_regla.cuenta_pago_id;
    new.estado_clasificacion := 'AUTOMATICA';
    new.confianza := v_regla.confianza;
    new.afecta_tipo := v_regla.afecta_tipo;
    new.cliente_id := case
      when v_regla.afecta_tipo = 'CLIENTE' then v_regla.cliente_id
      else null
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists fin_facturas_aplicar_regla_trg
  on public.fin_facturas_proveedor;
create trigger fin_facturas_aplicar_regla_trg
before insert or update of proveedor_normalizado, estado_clasificacion
on public.fin_facturas_proveedor
for each row execute function public.fin_aplicar_regla_factura();

create or replace function public.fin_clasificar_facturas_masivo(
  p_factura_ids uuid[],
  p_cuenta_codigo text,
  p_afecta_tipo text default 'GENERAL',
  p_cliente_id uuid default null,
  p_recordar_proveedor boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta_id uuid;
  v_afecta_tipo text;
  v_cliente_id uuid;
  v_actualizadas integer := 0;
  v_proveedores integer := 0;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  if p_factura_ids is null or cardinality(p_factura_ids) = 0 then
    raise exception 'Selecciona al menos una factura.';
  end if;
  if cardinality(p_factura_ids) > 2000 then
    raise exception 'La seleccion supera 2000 facturas.';
  end if;

  select id into v_cuenta_id
  from public.fin_cuentas_pago
  where codigo = trim(coalesce(p_cuenta_codigo, '')) and activo;
  if v_cuenta_id is null or trim(coalesce(p_cuenta_codigo, '')) = 'PENDIENTE' then
    raise exception 'Selecciona una cuenta válida.';
  end if;

  v_afecta_tipo := upper(trim(coalesce(p_afecta_tipo, 'GENERAL')));
  if v_afecta_tipo not in ('GENERAL', 'CLIENTE') then
    raise exception 'La afectacion seleccionada no es valida.';
  end if;
  v_cliente_id := case when v_afecta_tipo = 'CLIENTE' then p_cliente_id else null end;
  if v_afecta_tipo = 'CLIENTE' and (
    v_cliente_id is null or not exists (
      select 1 from public.clientes cliente
      where cliente.id = v_cliente_id and cliente.activo
    )
  ) then
    raise exception 'Selecciona un cliente activo.';
  end if;

  update public.fin_facturas_proveedor factura
  set cuenta_pago_id = v_cuenta_id,
      estado_clasificacion = 'REVISADA',
      confianza = 1,
      afecta_tipo = v_afecta_tipo,
      cliente_id = v_cliente_id,
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where factura.id = any(p_factura_ids);
  get diagnostics v_actualizadas = row_count;

  if v_actualizadas = 0 then
    raise exception 'No se encontraron las facturas seleccionadas.';
  end if;

  if coalesce(p_recordar_proveedor, false) then
    with proveedores as (
      select distinct factura.proveedor_normalizado
      from public.fin_facturas_proveedor factura
      where factura.id = any(p_factura_ids)
        and trim(coalesce(factura.proveedor_normalizado, '')) <> ''
    ), reglas as (
      insert into public.fin_reglas_clasificacion_pago (
        campo, patron, cuenta_pago_id, prioridad, confianza,
        origen, afecta_tipo, cliente_id, creado_por
      )
      select
        'PROVEEDOR', proveedor.proveedor_normalizado, v_cuenta_id, 34, 1,
        'USUARIO', v_afecta_tipo, v_cliente_id, auth.uid()
      from proveedores proveedor
      on conflict (campo, patron) do update
      set cuenta_pago_id = excluded.cuenta_pago_id,
          prioridad = 34,
          confianza = 1,
          origen = 'USUARIO',
          afecta_tipo = excluded.afecta_tipo,
          cliente_id = excluded.cliente_id,
          activo = true,
          actualizado_en = now()
      returning id
    )
    select count(*)::integer into v_proveedores from reglas;
  end if;

  return jsonb_build_object(
    'facturas_actualizadas', v_actualizadas,
    'proveedores_recordados', v_proveedores
  );
end;
$$;

revoke all on function public.fin_clasificar_facturas_masivo(
  uuid[], text, text, uuid, boolean
) from public, anon;
grant execute on function public.fin_clasificar_facturas_masivo(
  uuid[], text, text, uuid, boolean
) to authenticated;

create or replace function public.fin_clasificar_factura(
  p_factura_id uuid,
  p_cuenta_codigo text,
  p_recordar_proveedor boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta_id uuid;
  v_proveedor text;
  v_afecta_tipo text;
  v_cliente_id uuid;
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  select id into v_cuenta_id
  from public.fin_cuentas_pago
  where codigo = trim(p_cuenta_codigo) and activo;
  if v_cuenta_id is null then raise exception 'La cuenta no existe.'; end if;

  update public.fin_facturas_proveedor
  set cuenta_pago_id = v_cuenta_id,
      estado_clasificacion = case when trim(p_cuenta_codigo) = 'PENDIENTE' then 'PENDIENTE' else 'REVISADA' end,
      confianza = case when trim(p_cuenta_codigo) = 'PENDIENTE' then 0 else 1 end,
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where id = p_factura_id
  returning proveedor_normalizado, afecta_tipo, cliente_id
  into v_proveedor, v_afecta_tipo, v_cliente_id;

  if v_proveedor is null then raise exception 'La factura no existe.'; end if;

  if coalesce(p_recordar_proveedor, false)
     and trim(p_cuenta_codigo) <> 'PENDIENTE' then
    insert into public.fin_reglas_clasificacion_pago (
      campo, patron, cuenta_pago_id, prioridad, confianza,
      origen, afecta_tipo, cliente_id, creado_por
    ) values (
      'PROVEEDOR', v_proveedor, v_cuenta_id, 34, 1,
      'USUARIO', v_afecta_tipo, v_cliente_id, auth.uid()
    )
    on conflict (campo, patron) do update
    set cuenta_pago_id = excluded.cuenta_pago_id,
        prioridad = 34,
        confianza = 1,
        origen = 'USUARIO',
        afecta_tipo = excluded.afecta_tipo,
        cliente_id = excluded.cliente_id,
        activo = true,
        actualizado_en = now();
  end if;
end;
$$;

revoke all on function public.fin_clasificar_factura(uuid, text, boolean)
  from public, anon;
grant execute on function public.fin_clasificar_factura(uuid, text, boolean)
  to authenticated;

notify pgrst, 'reload schema';
