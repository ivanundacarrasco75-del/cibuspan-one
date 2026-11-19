begin;

create table if not exists public.fin_programacion_compras (
  semana date not null check (isfinite(semana) and extract(isodow from semana) = 1),
  documento_id text not null,
  monto numeric(14,2) not null check (monto > 0),
  pagado numeric(14,2) not null default 0 check (pagado between 0 and monto),
  confirmado_por uuid not null,
  creado_en timestamptz not null default now(),
  primary key (semana, documento_id)
);

create unique index if not exists fin_programacion_compras_activa_idx
  on public.fin_programacion_compras (documento_id) where pagado < monto;

create table if not exists public.fin_pagos_compras (
  id uuid primary key,
  documento_id text not null,
  semana date,
  valor numeric(14,2) not null check (valor > 0),
  fecha date not null check (isfinite(fecha)),
  documento text not null check (char_length(documento) between 1 and 500),
  registrado_por uuid not null,
  registrado_en timestamptz not null default now(),
  foreign key (semana, documento_id) references public.fin_programacion_compras (semana, documento_id)
);

create index if not exists fin_pagos_compras_documento_idx on public.fin_pagos_compras (documento_id);

alter table public.fin_programacion_compras enable row level security;
alter table public.fin_pagos_compras enable row level security;
revoke all on public.fin_programacion_compras, public.fin_pagos_compras from public, anon, authenticated;
grant select on public.fin_programacion_compras, public.fin_pagos_compras to authenticated;

drop policy if exists fin_programacion_compras_lectura on public.fin_programacion_compras;
create policy fin_programacion_compras_lectura on public.fin_programacion_compras
  for select to authenticated using ((select public.app_es_admin()));
drop policy if exists fin_pagos_compras_lectura on public.fin_pagos_compras;
create policy fin_pagos_compras_lectura on public.fin_pagos_compras
  for select to authenticated using ((select public.app_es_admin()));

create or replace view public.fin_vw_cuentas_por_pagar_compras with (security_invoker = true) as
with documentos as (
  select 'sri:' || c.clave_acceso as id, 'SRI'::text as tipo, 'SRI'::text as origen,
    coalesce(c.edicion->>'fecha', c.fecha_emision::text)::date as fecha_documento,
    coalesce(c.edicion->>'serie', c.datos->>'serie') as numero_documento,
    coalesce(c.edicion->>'proveedor', c.datos->>'proveedor') as proveedor,
    coalesce(c.edicion->>'descripcion', items.descripcion) as concepto,
    coalesce(c.edicion->>'subtotal', c.datos->>'subtotal')::numeric as subtotal,
    coalesce((c.edicion->>'iva')::numeric, impuestos.iva, 0) as iva,
    case when c.edicion->>'retencion' ~ '^[0-9]{1,9}([.,][0-9]{1,2})?$'
      then replace(c.edicion->>'retencion', ',', '.')::numeric end as retencion,
    round(coalesce(c.edicion->>'total', c.datos->>'total')::numeric, 2) as total,
    round(coalesce(c.edicion->>'total', c.datos->>'total')::numeric, 2) as neto,
    c.edicion->>'documento' as observaciones, c.datos->>'ruc' as ruc, c.abonos as pagos
  from public.compras_sri c
  cross join lateral (
    select string_agg(i->>'descripcion', ' · ' order by orden) as descripcion
    from jsonb_array_elements(c.datos->'items') with ordinality as x(i, orden)
  ) items
  cross join lateral (
    select sum((i->>'valor')::numeric) as iva from jsonb_array_elements(c.datos->'impuestos') i
    where i->>'codigo' = '2'
  ) impuestos
  union all
  select d.id, d.tipo, d.origen, d.fecha_documento, d.numero_documento,
    d.proveedor, d.concepto, d.subtotal, d.iva, d.retencion, d.total,
    round(d.total - coalesce(d.retencion, 0), 2), d.observaciones, null::text, coalesce(p.pagos, '[]'::jsonb)
  from (
    select distinct on (id) * from public.compras_vw_documentos
    order by id, case when tipo = 'NO_DEDUCIBLE' then 0 else 1 end
  ) d
  cross join lateral (
    select jsonb_agg(jsonb_build_object('id', a.id, 'valor', a.valor, 'fecha', a.fecha, 'documento', a.documento)
      order by a.fecha, a.registrado_en, a.id) as pagos
    from public.fin_pagos_compras a where a.documento_id = d.id
  ) p
)
select d.*, abonos.pagado, greatest(d.neto - abonos.pagado, 0) as saldo, plan.semana as semana_activa,
  concat_ws(' ', d.proveedor, d.numero_documento, d.concepto) as busqueda
from documentos d
cross join lateral (
  select coalesce(sum((a->>'valor')::numeric), 0) as pagado from jsonb_array_elements(d.pagos) a
) abonos
left join public.fin_programacion_compras plan on plan.documento_id = d.id and plan.pagado < plan.monto
where (select public.app_es_admin());

revoke all on public.fin_vw_cuentas_por_pagar_compras from public, anon, authenticated;
grant select on public.fin_vw_cuentas_por_pagar_compras to authenticated;

-- Ambas operaciones bloquean los documentos en el mismo orden y los pagos SRI
-- también se coordinan con la función de abonos existente.
create or replace function public.fin_bloquear_documento_compra(p_id text)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('fin_compras:' || p_id, 0));
  if starts_with(p_id, 'sri:') then
    perform 1 from public.compras_sri where clave_acceso = substr(p_id, 5) for update;
  end if;
end;
$$;

create or replace function public.fin_programar_compras(p_semana date, p_filas jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  fila record;
  compra public.fin_vw_cuentas_por_pagar_compras%rowtype;
  plan public.fin_programacion_compras%rowtype;
begin
  if not coalesce(public.app_es_admin(), false) then
    raise exception 'Solo un administrador puede programar pagos de compras.' using errcode = '42501';
  end if;
  if p_semana is null or not isfinite(p_semana) or extract(isodow from p_semana) <> 1
    or jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Selecciona una semana válida y sus documentos.';
  end if;
  if jsonb_array_length(p_filas) not between 1 and 200
    or (select count(distinct x.id) from jsonb_to_recordset(p_filas) as x(id text)) <> jsonb_array_length(p_filas) then
    raise exception 'Selecciona entre 1 y 200 documentos distintos.';
  end if;
  for fila in select * from jsonb_to_recordset(p_filas) as x(id text, monto numeric, verificado boolean) order by id
  loop
    perform public.fin_bloquear_documento_compra(fila.id);
    select * into plan from public.fin_programacion_compras where semana = p_semana and documento_id = fila.id;
    if found and plan.monto = fila.monto then continue; end if;
    if found then raise exception 'El documento ya está programado con otro monto para esa semana.'; end if;
    select * into compra from public.fin_vw_cuentas_por_pagar_compras where id = fila.id;
    if not found or fila.monto is null or fila.monto <= 0 or fila.monto > compra.saldo
      or fila.monto <> round(fila.monto, 2) then
      raise exception 'El monto programado supera el saldo o no es válido (%).', fila.id;
    end if;
    if compra.origen = 'CLASIFICACION_GASTOS' and not coalesce(fila.verificado, false) then
      raise exception 'Verifica el saldo del documento histórico antes de programarlo.';
    end if;
    if compra.semana_activa is not null and compra.semana_activa <> p_semana then
      raise exception 'El documento % ya está en la semana del %.', coalesce(compra.numero_documento, compra.proveedor), compra.semana_activa;
    end if;
    insert into public.fin_programacion_compras (semana, documento_id, monto, confirmado_por)
    values (p_semana, fila.id, fila.monto, auth.uid());
  end loop;
end;
$$;

create or replace function public.fin_quitar_compra_programada(p_semana date, p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.app_es_admin(), false) then
    raise exception 'Solo un administrador puede retirar pagos programados.' using errcode = '42501';
  end if;
  perform public.fin_bloquear_documento_compra(p_id);
  if exists (select 1 from public.fin_programacion_compras where semana = p_semana and documento_id = p_id and pagado > 0) then
    raise exception 'La programación tiene pagos registrados.';
  end if;
  delete from public.fin_programacion_compras where semana = p_semana and documento_id = p_id;
end;
$$;

create or replace function public.fin_pagar_compra(
  p_id text, p_operacion uuid, p_monto numeric, p_fecha date, p_referencia text,
  p_semana date, p_verificado boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  compra public.fin_vw_cuentas_por_pagar_compras%rowtype;
  plan public.fin_programacion_compras%rowtype;
  pago public.fin_pagos_compras%rowtype;
begin
  if not coalesce(public.app_es_admin(), false) then
    raise exception 'Solo un administrador puede registrar pagos de compras.' using errcode = '42501';
  end if;
  p_referencia := btrim(p_referencia);
  if p_id is null or p_operacion is null or p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2)
    or p_fecha is null or not isfinite(p_fecha) or p_referencia is null or char_length(p_referencia) not between 1 and 500 then
    raise exception 'Completa monto, fecha y referencia del pago.';
  end if;
  perform public.fin_bloquear_documento_compra(p_id);
  select * into pago from public.fin_pagos_compras where id = p_operacion;
  if found then
    if pago.documento_id <> p_id or pago.valor <> p_monto or pago.fecha <> p_fecha
      or pago.documento <> p_referencia or pago.semana is distinct from p_semana then
      raise exception 'Esta operación ya se registró con otros datos. Actualiza la tabla.';
    end if;
    return;
  end if;
  select * into compra from public.fin_vw_cuentas_por_pagar_compras where id = p_id;
  if not found or p_monto > compra.saldo then
    raise exception 'El saldo cambió o el documento no está disponible. Actualiza la tabla.';
  end if;
  if p_semana is null then
    if compra.semana_activa is not null then raise exception 'Registra el pago desde Pagos semanales.'; end if;
    if compra.origen = 'CLASIFICACION_GASTOS' and not coalesce(p_verificado, false) then
      raise exception 'Verifica el saldo del documento histórico antes de pagar.';
    end if;
  else
    select * into plan from public.fin_programacion_compras where semana = p_semana and documento_id = p_id;
    if not found or p_monto > plan.monto - plan.pagado then
      raise exception 'El monto supera el importe pendiente de la programación.';
    end if;
  end if;
  if compra.tipo = 'SRI' then
    if compra.pagos @> jsonb_build_array(jsonb_build_object('id', p_operacion)) then
      raise exception 'La referencia de operación ya existe en Facturas SRI.';
    end if;
    perform public.compras_sri_abonar(substr(p_id, 5), p_operacion, p_monto, p_fecha, p_referencia);
  end if;
  insert into public.fin_pagos_compras (id, documento_id, semana, valor, fecha, documento, registrado_por)
    values (p_operacion, p_id, p_semana, p_monto, p_fecha, p_referencia, auth.uid());
  if p_semana is not null then
    update public.fin_programacion_compras set pagado = pagado + p_monto
    where semana = p_semana and documento_id = p_id;
  end if;
end;
$$;

revoke all on function public.fin_bloquear_documento_compra(text), public.fin_programar_compras(date,jsonb),
  public.fin_quitar_compra_programada(date,text), public.fin_pagar_compra(text,uuid,numeric,date,text,date,boolean)
  from public, anon, authenticated;
grant execute on function public.fin_programar_compras(date,jsonb), public.fin_quitar_compra_programada(date,text),
  public.fin_pagar_compra(text,uuid,numeric,date,text,date,boolean) to authenticated;

commit;
