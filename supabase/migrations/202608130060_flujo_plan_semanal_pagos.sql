-- CIBUSPAN ONE
-- Flujo compartido del plan semanal: preparado (amarillo) y pagado (azul/P).

alter table public.fin_programacion_pagos
  add column if not exists estado_plan text not null default 'PREPARADO',
  add column if not exists abono_id uuid references public.fin_factura_abonos(id) on delete restrict,
  add column if not exists pagado_por uuid references auth.users(id) on delete set null,
  add column if not exists pagado_en timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fin_programacion_estado_plan_check'
      and conrelid = 'public.fin_programacion_pagos'::regclass
  ) then
    alter table public.fin_programacion_pagos
      add constraint fin_programacion_estado_plan_check
      check (estado_plan in ('PREPARADO', 'PAGADO'));
  end if;
end;
$$;

create unique index if not exists fin_programacion_abono_unico_idx
  on public.fin_programacion_pagos (abono_id)
  where abono_id is not null;

-- Reconoce pagos manuales ya registrados que coinciden con un plan anterior.
with coincidencias as (
  select distinct on (plan.id)
    plan.id as plan_id,
    abono.id as abono_id,
    abono.creado_por,
    abono.creado_en
  from public.fin_programacion_pagos plan
  join public.fin_factura_abonos abono
    on abono.factura_id = plan.factura_id
   and abono.fecha_pago between plan.semana_inicio and plan.semana_inicio + 6
   and abs(abono.monto - plan.monto_programado) <= 0.01
  where plan.estado_plan = 'PREPARADO'
    and plan.seleccionada
  order by plan.id, abono.creado_en desc
)
update public.fin_programacion_pagos plan
set estado_plan = 'PAGADO',
    abono_id = coincidencias.abono_id,
    pagado_por = coincidencias.creado_por,
    pagado_en = coincidencias.creado_en
from coincidencias
where plan.id = coincidencias.plan_id
  and not exists (
    select 1
    from public.fin_programacion_pagos otro
    where otro.abono_id = coincidencias.abono_id
      and otro.id <> plan.id
  );

create table if not exists public.fin_planes_pago_semanales (
  semana_inicio date primary key,
  presupuesto_disponible numeric(18,2) not null default 0
    check (presupuesto_disponible >= 0),
  notas text,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en timestamptz not null default now(),
  check (extract(isodow from semana_inicio) = 1)
);

alter table public.fin_planes_pago_semanales enable row level security;
revoke all on table public.fin_planes_pago_semanales from anon;
revoke insert, update, delete on table public.fin_planes_pago_semanales from authenticated;
grant select on table public.fin_planes_pago_semanales to authenticated;

drop policy if exists fin_planes_pago_semanales_lectura
  on public.fin_planes_pago_semanales;
create policy fin_planes_pago_semanales_lectura
  on public.fin_planes_pago_semanales for select to authenticated
  using (public.app_puede_alguna(array['Administración', 'Reportes', 'Dashboard']));

create or replace view public.fin_vw_programacion_pagos
with (security_invoker = true)
as
select
  plan.id,
  plan.factura_id,
  plan.semana_inicio,
  extract(week from plan.semana_inicio)::integer as semana_numero,
  plan.seleccionada,
  plan.monto_programado::numeric(18,2) as monto_programado,
  plan.notas,
  plan.actualizado_en,
  plan.estado_plan,
  plan.abono_id,
  abono.fecha_pago,
  abono.monto::numeric(18,2) as monto_pagado,
  abono.documento as documento_pago,
  plan.pagado_en
from public.fin_programacion_pagos plan
left join public.fin_factura_abonos abono on abono.id = plan.abono_id;

grant select on public.fin_vw_programacion_pagos to authenticated;
revoke all on public.fin_vw_programacion_pagos from anon;

create or replace function public.fin_guardar_presupuesto_semanal(
  p_semana_inicio date,
  p_presupuesto numeric,
  p_notas text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  if p_semana_inicio is null or extract(isodow from p_semana_inicio) <> 1 then
    raise exception 'La semana debe iniciar en lunes.';
  end if;
  if p_presupuesto is null or p_presupuesto < 0 then
    raise exception 'El dinero disponible no puede ser negativo.';
  end if;

  insert into public.fin_planes_pago_semanales (
    semana_inicio, presupuesto_disponible, notas,
    creado_por, actualizado_por
  ) values (
    p_semana_inicio, round(p_presupuesto, 2), nullif(trim(p_notas), ''),
    auth.uid(), auth.uid()
  )
  on conflict (semana_inicio) do update
  set presupuesto_disponible = excluded.presupuesto_disponible,
      notas = excluded.notas,
      actualizado_por = auth.uid(),
      actualizado_en = now();
end;
$$;

revoke all on function public.fin_guardar_presupuesto_semanal(date, numeric, text)
  from public, anon;
grant execute on function public.fin_guardar_presupuesto_semanal(date, numeric, text)
  to authenticated;

create or replace function public.fin_programar_factura(
  p_factura_id uuid,
  p_semana_inicio date,
  p_seleccionada boolean,
  p_monto numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric(18,2);
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.fin_programacion_pagos
    where factura_id = p_factura_id
      and semana_inicio = p_semana_inicio
      and estado_plan = 'PAGADO'
  ) then
    raise exception 'Este pago ya fue ejecutado y no puede modificarse.';
  end if;
  select saldo into v_saldo
  from public.fin_vw_facturas_detalle
  where id = p_factura_id;
  if v_saldo is null or v_saldo <= 0 then
    raise exception 'La factura no tiene saldo pendiente.';
  end if;
  if p_semana_inicio is null or extract(isodow from p_semana_inicio) <> 1 then
    raise exception 'La semana debe iniciar en lunes.';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > v_saldo then
    raise exception 'El monto debe ser mayor a cero y no superar el saldo.';
  end if;

  insert into public.fin_programacion_pagos (
    factura_id, semana_inicio, seleccionada, monto_programado,
    estado_plan, creado_por, actualizado_por
  ) values (
    p_factura_id, p_semana_inicio, p_seleccionada, round(p_monto, 2),
    'PREPARADO', auth.uid(), auth.uid()
  )
  on conflict (factura_id, semana_inicio) do update
  set seleccionada = excluded.seleccionada,
      monto_programado = excluded.monto_programado,
      actualizado_por = auth.uid(),
      actualizado_en = now();
end;
$$;

revoke all on function public.fin_programar_factura(uuid, date, boolean, numeric)
  from public, anon;
grant execute on function public.fin_programar_factura(uuid, date, boolean, numeric)
  to authenticated;

create or replace function public.fin_ejecutar_pago_programado(
  p_programacion_id uuid,
  p_fecha_pago date,
  p_documento text,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.fin_programacion_pagos%rowtype;
  v_saldo numeric(18,2);
  v_monto numeric(18,2);
  v_abono_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;

  select * into v_plan
  from public.fin_programacion_pagos
  where id = p_programacion_id
  for update;

  if not found then raise exception 'El pago programado no existe.'; end if;
  if not v_plan.seleccionada then raise exception 'La factura no esta seleccionada.'; end if;
  if v_plan.estado_plan = 'PAGADO' then raise exception 'Este pago ya fue ejecutado.'; end if;
  if p_fecha_pago is null then raise exception 'La fecha del pago es obligatoria.'; end if;
  if nullif(trim(coalesce(p_documento, '')), '') is null then
    raise exception 'La referencia bancaria es obligatoria.';
  end if;

  select saldo into v_saldo
  from public.fin_vw_facturas_detalle
  where id = v_plan.factura_id;
  if v_saldo is null or v_saldo <= 0 then
    raise exception 'La factura ya no tiene saldo pendiente.';
  end if;

  v_monto := least(v_plan.monto_programado, v_saldo);
  insert into public.fin_factura_abonos (
    id, clave_origen, factura_id, fecha_pago, monto,
    documento, notas, origen, creado_por
  ) values (
    v_abono_id, 'PLAN|' || v_abono_id::text, v_plan.factura_id,
    p_fecha_pago, round(v_monto, 2), trim(p_documento),
    nullif(trim(p_notas), ''), 'MANUAL', auth.uid()
  );

  update public.fin_programacion_pagos
  set estado_plan = 'PAGADO',
      abono_id = v_abono_id,
      pagado_por = auth.uid(),
      pagado_en = now(),
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where id = v_plan.id;

  return v_abono_id;
end;
$$;

revoke all on function public.fin_ejecutar_pago_programado(uuid, date, text, text)
  from public, anon;
grant execute on function public.fin_ejecutar_pago_programado(uuid, date, text, text)
  to authenticated;

