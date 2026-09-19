-- CIBUSPAN ONE
-- Cuentas por pagar, programacion semanal y abonos de facturas de proveedores.

create table if not exists public.fin_importaciones_facturas (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text not null,
  archivo_hash text not null,
  hoja_origen text not null,
  anio integer not null default 2026 check (anio between 2020 and 2100),
  facturas_archivo integer not null check (facturas_archivo > 0),
  facturas_nuevas integer not null default 0,
  facturas_actualizadas integer not null default 0,
  facturas_pagadas integer not null default 0,
  facturas_pendientes integer not null default 0,
  total_neto numeric(18,2) not null default 0,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.fin_facturas_proveedor (
  id uuid primary key default gen_random_uuid(),
  clave_origen text not null unique,
  fecha_emision date,
  fecha_vencimiento date,
  fecha_pago_origen date,
  pagada_origen boolean not null default false,
  numero_factura text,
  proveedor text not null,
  proveedor_normalizado text not null,
  descripcion text,
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  aplica_iva boolean not null default false,
  tasa_iva numeric(7,4) not null default 15 check (tasa_iva >= 0 and tasa_iva <= 100),
  iva numeric(18,2) not null default 0 check (iva >= 0),
  total_factura numeric(18,2) not null check (total_factura > 0),
  retencion numeric(18,2) not null default 0 check (retencion >= 0),
  retencion_referencia text,
  valor_neto_pagar numeric(18,2) not null check (valor_neto_pagar > 0),
  cuenta_pago_id uuid not null references public.fin_cuentas_pago(id) on delete restrict,
  estado_clasificacion text not null default 'PENDIENTE'
    check (estado_clasificacion in ('AUTOMATICA', 'REVISADA', 'PENDIENTE')),
  confianza numeric(5,4) not null default 0 check (confianza >= 0 and confianza <= 1),
  anulada boolean not null default false,
  notas text,
  importacion_id uuid references public.fin_importaciones_facturas(id) on delete set null,
  archivo_origen text,
  hoja_origen text,
  fila_origen integer,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.fin_factura_abonos (
  id uuid primary key default gen_random_uuid(),
  clave_origen text not null unique,
  factura_id uuid not null references public.fin_facturas_proveedor(id) on delete restrict,
  fecha_pago date not null,
  monto numeric(18,2) not null check (monto > 0),
  documento text,
  notas text,
  origen text not null default 'MANUAL' check (origen in ('EXCEL', 'MANUAL')),
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.fin_programacion_pagos (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.fin_facturas_proveedor(id) on delete restrict,
  semana_inicio date not null,
  seleccionada boolean not null default true,
  monto_programado numeric(18,2) not null check (monto_programado > 0),
  notas text,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en timestamptz not null default now(),
  unique (factura_id, semana_inicio)
);

create index if not exists fin_facturas_fecha_idx
  on public.fin_facturas_proveedor (fecha_emision desc);
create index if not exists fin_facturas_proveedor_idx
  on public.fin_facturas_proveedor (proveedor_normalizado, fecha_emision desc);
create index if not exists fin_facturas_cuenta_idx
  on public.fin_facturas_proveedor (cuenta_pago_id, fecha_emision desc);
create index if not exists fin_abonos_fecha_idx
  on public.fin_factura_abonos (fecha_pago desc);
create index if not exists fin_abonos_factura_idx
  on public.fin_factura_abonos (factura_id, fecha_pago desc);
create index if not exists fin_programacion_semana_idx
  on public.fin_programacion_pagos (semana_inicio, seleccionada);

alter table public.fin_importaciones_facturas enable row level security;
alter table public.fin_facturas_proveedor enable row level security;
alter table public.fin_factura_abonos enable row level security;
alter table public.fin_programacion_pagos enable row level security;

revoke all on table public.fin_importaciones_facturas from anon;
revoke all on table public.fin_facturas_proveedor from anon;
revoke all on table public.fin_factura_abonos from anon;
revoke all on table public.fin_programacion_pagos from anon;
revoke insert, update, delete on table public.fin_importaciones_facturas from authenticated;
revoke insert, update, delete on table public.fin_facturas_proveedor from authenticated;
revoke insert, update, delete on table public.fin_factura_abonos from authenticated;
revoke insert, update, delete on table public.fin_programacion_pagos from authenticated;
grant select on table public.fin_importaciones_facturas to authenticated;
grant select on table public.fin_facturas_proveedor to authenticated;
grant select on table public.fin_factura_abonos to authenticated;
grant select on table public.fin_programacion_pagos to authenticated;

drop policy if exists fin_importaciones_facturas_lectura on public.fin_importaciones_facturas;
create policy fin_importaciones_facturas_lectura
  on public.fin_importaciones_facturas for select to authenticated
  using (public.app_puede_alguna(array['Administración', 'Reportes', 'Dashboard']));

drop policy if exists fin_facturas_lectura on public.fin_facturas_proveedor;
create policy fin_facturas_lectura
  on public.fin_facturas_proveedor for select to authenticated
  using (public.app_puede_alguna(array['Administración', 'Reportes', 'Dashboard']));

drop policy if exists fin_abonos_facturas_lectura on public.fin_factura_abonos;
create policy fin_abonos_facturas_lectura
  on public.fin_factura_abonos for select to authenticated
  using (public.app_puede_alguna(array['Administración', 'Reportes', 'Dashboard']));

drop policy if exists fin_programacion_pagos_lectura on public.fin_programacion_pagos;
create policy fin_programacion_pagos_lectura
  on public.fin_programacion_pagos for select to authenticated
  using (public.app_puede_alguna(array['Administración', 'Reportes', 'Dashboard']));

create or replace view public.fin_vw_facturas_detalle
with (security_invoker = true)
as
select
  factura.id,
  factura.clave_origen,
  factura.fecha_emision,
  factura.fecha_vencimiento,
  factura.fecha_pago_origen,
  factura.pagada_origen,
  factura.numero_factura,
  factura.proveedor,
  factura.proveedor_normalizado,
  factura.descripcion,
  factura.subtotal,
  factura.aplica_iva,
  factura.tasa_iva,
  factura.iva,
  factura.total_factura,
  factura.retencion,
  factura.retencion_referencia,
  factura.valor_neto_pagar,
  coalesce(abonos.total_abonado, 0)::numeric(18,2) as total_abonado,
  greatest(factura.valor_neto_pagar - coalesce(abonos.total_abonado, 0), 0)::numeric(18,2) as saldo,
  case
    when factura.anulada then 'ANULADA'
    when factura.valor_neto_pagar - coalesce(abonos.total_abonado, 0) <= 0.005 then 'PAGADA'
    when coalesce(abonos.total_abonado, 0) > 0 then 'ABONO'
    else 'PENDIENTE'
  end as estado,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  cuenta.grupo,
  cuenta.naturaleza,
  cuenta.impacta_ebitda,
  factura.estado_clasificacion,
  factura.confianza,
  factura.notas,
  factura.archivo_origen,
  factura.hoja_origen,
  factura.fila_origen,
  factura.creado_en,
  factura.actualizado_en
from public.fin_facturas_proveedor factura
join public.fin_cuentas_pago cuenta on cuenta.id = factura.cuenta_pago_id
left join lateral (
  select sum(abono.monto) as total_abonado
  from public.fin_factura_abonos abono
  where abono.factura_id = factura.id
) abonos on true;

create or replace view public.fin_vw_factura_abonos
with (security_invoker = true)
as
select
  abono.id,
  abono.factura_id,
  abono.fecha_pago,
  (abono.fecha_pago - ((extract(isodow from abono.fecha_pago)::integer) - 1))::date as semana_inicio,
  extract(week from abono.fecha_pago)::integer as semana_numero,
  abono.monto,
  abono.documento,
  abono.notas,
  abono.origen,
  factura.proveedor,
  factura.numero_factura,
  factura.descripcion,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  cuenta.grupo,
  cuenta.naturaleza,
  cuenta.impacta_ebitda,
  abono.creado_en
from public.fin_factura_abonos abono
join public.fin_facturas_proveedor factura on factura.id = abono.factura_id
join public.fin_cuentas_pago cuenta on cuenta.id = factura.cuenta_pago_id;

create or replace view public.fin_vw_factura_pagos_semanales
with (security_invoker = true)
as
select
  (abono.fecha_pago - ((extract(isodow from abono.fecha_pago)::integer) - 1))::date as semana_inicio,
  extract(week from abono.fecha_pago)::integer as semana_numero,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  cuenta.grupo,
  cuenta.naturaleza,
  cuenta.impacta_ebitda,
  count(*)::integer as movimientos,
  sum(abono.monto)::numeric(18,2) as total_pagado,
  max(abono.creado_en) as actualizado_en
from public.fin_factura_abonos abono
join public.fin_facturas_proveedor factura on factura.id = abono.factura_id
join public.fin_cuentas_pago cuenta on cuenta.id = factura.cuenta_pago_id
where not factura.anulada
group by
  (abono.fecha_pago - ((extract(isodow from abono.fecha_pago)::integer) - 1))::date,
  extract(week from abono.fecha_pago)::integer,
  cuenta.codigo, cuenta.nombre, cuenta.grupo, cuenta.naturaleza, cuenta.impacta_ebitda;

create or replace view public.fin_vw_programacion_pagos
with (security_invoker = true)
as
select
  plan.id,
  plan.factura_id,
  plan.semana_inicio,
  extract(week from plan.semana_inicio)::integer as semana_numero,
  plan.seleccionada,
  least(plan.monto_programado, factura.saldo)::numeric(18,2) as monto_programado,
  plan.notas,
  plan.actualizado_en
from public.fin_programacion_pagos plan
join public.fin_vw_facturas_detalle factura on factura.id = plan.factura_id
where factura.estado in ('PENDIENTE', 'ABONO');

grant select on public.fin_vw_facturas_detalle to authenticated;
grant select on public.fin_vw_factura_abonos to authenticated;
grant select on public.fin_vw_factura_pagos_semanales to authenticated;
grant select on public.fin_vw_programacion_pagos to authenticated;
revoke all on public.fin_vw_facturas_detalle from anon;
revoke all on public.fin_vw_factura_abonos from anon;
revoke all on public.fin_vw_factura_pagos_semanales from anon;
revoke all on public.fin_vw_programacion_pagos from anon;

create or replace function public.fin_importar_facturas_2026(
  p_archivo_nombre text,
  p_archivo_hash text,
  p_hoja_origen text,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_total integer;
  v_nuevas integer;
  v_actualizadas integer;
  v_pagadas integer;
  v_pendientes integer;
  v_total_neto numeric(18,2);
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para importar facturas.' using errcode = '42501';
  end if;
  if trim(coalesce(p_archivo_nombre, '')) = '' or trim(coalesce(p_archivo_hash, '')) = ''
     or trim(coalesce(p_hoja_origen, '')) = '' then
    raise exception 'El archivo, su huella y la hoja son obligatorios.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no contiene facturas de 2026.';
  end if;
  if jsonb_array_length(p_lineas) > 5000 then raise exception 'El archivo supera 5000 facturas.'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lineas) as linea(
      clave_origen text, fecha_emision text, fecha_pago text, pagada boolean,
      proveedor text, proveedor_normalizado text, total_factura numeric,
      valor_neto_pagar numeric, cuenta_codigo text, fila_origen integer
    )
    where nullif(trim(coalesce(linea.clave_origen, '')), '') is null
      or nullif(trim(coalesce(linea.proveedor, '')), '') is null
      or nullif(trim(coalesce(linea.proveedor_normalizado, '')), '') is null
      or linea.total_factura is null or linea.total_factura <= 0
      or linea.valor_neto_pagar is null or linea.valor_neto_pagar <= 0
      or linea.fila_origen is null or linea.fila_origen < 1
      or (linea.pagada and (linea.fecha_pago is null or extract(year from linea.fecha_pago::date) <> 2026))
      or (not linea.pagada and (linea.fecha_emision is null or extract(year from linea.fecha_emision::date) <> 2026))
  ) then
    raise exception 'Existen facturas con datos incompletos o fuera del año 2026.';
  end if;

  select count(*)::integer,
    count(*) filter (where linea.pagada)::integer,
    count(*) filter (where not linea.pagada)::integer,
    sum(linea.valor_neto_pagar)::numeric(18,2)
  into v_total, v_pagadas, v_pendientes, v_total_neto
  from jsonb_to_recordset(p_lineas) as linea(pagada boolean, valor_neto_pagar numeric);

  select count(*)::integer into v_actualizadas
  from jsonb_to_recordset(p_lineas) as linea(clave_origen text)
  join public.fin_facturas_proveedor factura on factura.clave_origen = trim(linea.clave_origen);
  v_nuevas := v_total - v_actualizadas;

  insert into public.fin_importaciones_facturas (
    archivo_nombre, archivo_hash, hoja_origen, anio, facturas_archivo,
    facturas_nuevas, facturas_actualizadas, facturas_pagadas,
    facturas_pendientes, total_neto, creado_por
  ) values (
    trim(p_archivo_nombre), trim(p_archivo_hash), trim(p_hoja_origen), 2026, v_total,
    v_nuevas, v_actualizadas, v_pagadas, v_pendientes, v_total_neto, auth.uid()
  ) returning id into v_importacion_id;

  insert into public.fin_facturas_proveedor as existente (
    clave_origen, fecha_emision, fecha_vencimiento, fecha_pago_origen,
    pagada_origen, numero_factura, proveedor, proveedor_normalizado,
    descripcion, subtotal, aplica_iva, tasa_iva, iva, total_factura,
    retencion, retencion_referencia, valor_neto_pagar, cuenta_pago_id,
    estado_clasificacion, confianza, importacion_id, archivo_origen,
    hoja_origen, fila_origen, creado_por, actualizado_por
  )
  select
    trim(linea.clave_origen), nullif(linea.fecha_emision, '')::date,
    nullif(linea.fecha_vencimiento, '')::date, nullif(linea.fecha_pago, '')::date,
    linea.pagada, nullif(trim(linea.numero_factura), ''), trim(linea.proveedor),
    trim(linea.proveedor_normalizado), nullif(trim(linea.descripcion), ''),
    round(greatest(linea.subtotal, 0), 2), linea.aplica_iva,
    coalesce(linea.tasa_iva, 15), round(greatest(linea.iva, 0), 2),
    round(linea.total_factura, 2), round(greatest(linea.retencion, 0), 2),
    nullif(trim(linea.retencion_referencia), ''), round(linea.valor_neto_pagar, 2),
    coalesce(cuenta.id, pendiente.id),
    case when cuenta.id is null then 'PENDIENTE' else linea.estado_clasificacion end,
    case when cuenta.id is null then 0 else linea.confianza end,
    v_importacion_id, trim(p_archivo_nombre), trim(p_hoja_origen),
    linea.fila_origen, auth.uid(), auth.uid()
  from jsonb_to_recordset(p_lineas) as linea(
    clave_origen text, fecha_emision text, fecha_vencimiento text, fecha_pago text,
    pagada boolean, numero_factura text, proveedor text, proveedor_normalizado text,
    descripcion text, subtotal numeric, aplica_iva boolean, tasa_iva numeric,
    iva numeric, total_factura numeric, retencion numeric, retencion_referencia text,
    valor_neto_pagar numeric, cuenta_codigo text, estado_clasificacion text,
    confianza numeric, fila_origen integer
  )
  left join public.fin_cuentas_pago cuenta on cuenta.codigo = trim(linea.cuenta_codigo) and cuenta.activo
  cross join lateral (select id from public.fin_cuentas_pago where codigo = 'PENDIENTE') pendiente
  on conflict (clave_origen) do update
  set fecha_emision = excluded.fecha_emision,
      fecha_vencimiento = coalesce(existente.fecha_vencimiento, excluded.fecha_vencimiento),
      fecha_pago_origen = excluded.fecha_pago_origen,
      pagada_origen = excluded.pagada_origen,
      numero_factura = excluded.numero_factura,
      proveedor = excluded.proveedor,
      proveedor_normalizado = excluded.proveedor_normalizado,
      descripcion = excluded.descripcion,
      subtotal = excluded.subtotal,
      aplica_iva = excluded.aplica_iva,
      tasa_iva = excluded.tasa_iva,
      iva = excluded.iva,
      total_factura = excluded.total_factura,
      retencion = excluded.retencion,
      retencion_referencia = excluded.retencion_referencia,
      valor_neto_pagar = excluded.valor_neto_pagar,
      cuenta_pago_id = case when existente.estado_clasificacion = 'REVISADA' then existente.cuenta_pago_id else excluded.cuenta_pago_id end,
      estado_clasificacion = case when existente.estado_clasificacion = 'REVISADA' then existente.estado_clasificacion else excluded.estado_clasificacion end,
      confianza = case when existente.estado_clasificacion = 'REVISADA' then existente.confianza else excluded.confianza end,
      importacion_id = excluded.importacion_id,
      archivo_origen = excluded.archivo_origen,
      hoja_origen = excluded.hoja_origen,
      fila_origen = excluded.fila_origen,
      actualizado_por = auth.uid(),
      actualizado_en = now();

  insert into public.fin_factura_abonos (
    clave_origen, factura_id, fecha_pago, monto, documento, origen, creado_por
  )
  select
    'EXCEL|' || trim(linea.clave_origen), factura.id, linea.fecha_pago::date,
    round(linea.valor_neto_pagar, 2), nullif(trim(linea.documento), ''), 'EXCEL', auth.uid()
  from jsonb_to_recordset(p_lineas) as linea(
    clave_origen text, fecha_pago text, pagada boolean,
    valor_neto_pagar numeric, documento text
  )
  join public.fin_facturas_proveedor factura on factura.clave_origen = trim(linea.clave_origen)
  where linea.pagada
  on conflict (clave_origen) do update
  set fecha_pago = excluded.fecha_pago,
      monto = excluded.monto,
      documento = excluded.documento;

  return jsonb_build_object(
    'importacion_id', v_importacion_id, 'facturas_archivo', v_total,
    'facturas_nuevas', v_nuevas, 'facturas_actualizadas', v_actualizadas,
    'facturas_pagadas', v_pagadas, 'facturas_pendientes', v_pendientes,
    'total_neto', v_total_neto
  );
end;
$$;

revoke all on function public.fin_importar_facturas_2026(text, text, text, jsonb) from public, anon;
grant execute on function public.fin_importar_facturas_2026(text, text, text, jsonb) to authenticated;

create or replace function public.fin_guardar_factura(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cuenta_id uuid;
  v_subtotal numeric(18,2);
  v_tasa numeric(7,4);
  v_iva numeric(18,2);
  v_total numeric(18,2);
  v_retencion numeric(18,2);
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para guardar facturas.' using errcode = '42501';
  end if;

  v_id := nullif(p_datos->>'id', '')::uuid;
  v_subtotal := round(coalesce((p_datos->>'subtotal')::numeric, 0), 2);
  v_tasa := coalesce((p_datos->>'tasa_iva')::numeric, 15);
  v_iva := case when coalesce((p_datos->>'aplica_iva')::boolean, false)
    then round(v_subtotal * v_tasa / 100, 2) else 0 end;
  v_total := v_subtotal + v_iva;
  v_retencion := round(coalesce((p_datos->>'retencion')::numeric, 0), 2);

  if trim(coalesce(p_datos->>'proveedor', '')) = '' or v_subtotal <= 0 then
    raise exception 'Proveedor y subtotal mayor a cero son obligatorios.';
  end if;
  if v_retencion < 0 or v_retencion >= v_total then raise exception 'La retencion no puede alcanzar el total.'; end if;

  select id into v_cuenta_id from public.fin_cuentas_pago
  where codigo = coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') and activo;
  if v_cuenta_id is null then select id into v_cuenta_id from public.fin_cuentas_pago where codigo = 'PENDIENTE'; end if;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.fin_facturas_proveedor (
      id, clave_origen, fecha_emision, fecha_vencimiento, numero_factura,
      proveedor, proveedor_normalizado, descripcion, subtotal, aplica_iva,
      tasa_iva, iva, total_factura, retencion, valor_neto_pagar,
      cuenta_pago_id, estado_clasificacion, confianza, notas,
      creado_por, actualizado_por
    ) values (
      v_id, 'MANUAL|' || v_id::text, nullif(p_datos->>'fecha_emision', '')::date,
      nullif(p_datos->>'fecha_vencimiento', '')::date, nullif(trim(p_datos->>'numero_factura'), ''),
      trim(p_datos->>'proveedor'), public.fin_normalizar_texto(p_datos->>'proveedor'),
      nullif(trim(p_datos->>'descripcion'), ''), v_subtotal,
      coalesce((p_datos->>'aplica_iva')::boolean, false), v_tasa, v_iva,
      v_total, v_retencion, v_total - v_retencion, v_cuenta_id,
      case when coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') = 'PENDIENTE' then 'PENDIENTE' else 'REVISADA' end,
      case when coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') = 'PENDIENTE' then 0 else 1 end,
      nullif(trim(p_datos->>'notas'), ''), auth.uid(), auth.uid()
    );
  else
    update public.fin_facturas_proveedor
    set fecha_emision = nullif(p_datos->>'fecha_emision', '')::date,
        fecha_vencimiento = nullif(p_datos->>'fecha_vencimiento', '')::date,
        numero_factura = nullif(trim(p_datos->>'numero_factura'), ''),
        proveedor = trim(p_datos->>'proveedor'),
        proveedor_normalizado = public.fin_normalizar_texto(p_datos->>'proveedor'),
        descripcion = nullif(trim(p_datos->>'descripcion'), ''),
        subtotal = v_subtotal,
        aplica_iva = coalesce((p_datos->>'aplica_iva')::boolean, false),
        tasa_iva = v_tasa, iva = v_iva, total_factura = v_total,
        retencion = v_retencion, valor_neto_pagar = v_total - v_retencion,
        cuenta_pago_id = v_cuenta_id,
        estado_clasificacion = case when coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') = 'PENDIENTE' then 'PENDIENTE' else 'REVISADA' end,
        confianza = case when coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') = 'PENDIENTE' then 0 else 1 end,
        notas = nullif(trim(p_datos->>'notas'), ''),
        actualizado_por = auth.uid(), actualizado_en = now()
    where id = v_id;
    if not found then raise exception 'La factura seleccionada no existe.'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.fin_guardar_factura(jsonb) from public, anon;
grant execute on function public.fin_guardar_factura(jsonb) to authenticated;

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
declare v_saldo numeric(18,2);
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  select saldo into v_saldo from public.fin_vw_facturas_detalle where id = p_factura_id;
  if v_saldo is null or v_saldo <= 0 then raise exception 'La factura no tiene saldo pendiente.'; end if;
  if p_semana_inicio is null or extract(isodow from p_semana_inicio) <> 1 then raise exception 'La semana debe iniciar en lunes.'; end if;
  if p_monto is null or p_monto <= 0 or p_monto > v_saldo then raise exception 'El monto debe ser mayor a cero y no superar el saldo.'; end if;
  insert into public.fin_programacion_pagos (
    factura_id, semana_inicio, seleccionada, monto_programado,
    creado_por, actualizado_por
  ) values (
    p_factura_id, p_semana_inicio, p_seleccionada, round(p_monto, 2),
    auth.uid(), auth.uid()
  ) on conflict (factura_id, semana_inicio) do update
  set seleccionada = excluded.seleccionada,
      monto_programado = excluded.monto_programado,
      actualizado_por = auth.uid(), actualizado_en = now();
end;
$$;

revoke all on function public.fin_programar_factura(uuid, date, boolean, numeric) from public, anon;
grant execute on function public.fin_programar_factura(uuid, date, boolean, numeric) to authenticated;

create or replace function public.fin_registrar_abono_factura(
  p_factura_id uuid,
  p_fecha_pago date,
  p_monto numeric,
  p_documento text default null,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_saldo numeric(18,2); v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  select saldo into v_saldo from public.fin_vw_facturas_detalle where id = p_factura_id;
  if v_saldo is null or v_saldo <= 0 then raise exception 'La factura no tiene saldo pendiente.'; end if;
  if p_fecha_pago is null then raise exception 'La fecha de pago es obligatoria.'; end if;
  if p_monto is null or p_monto <= 0 or p_monto > v_saldo then raise exception 'El abono no puede superar el saldo.'; end if;
  insert into public.fin_factura_abonos (
    id, clave_origen, factura_id, fecha_pago, monto,
    documento, notas, origen, creado_por
  ) values (
    v_id, 'MANUAL|' || v_id::text, p_factura_id, p_fecha_pago,
    round(p_monto, 2), nullif(trim(p_documento), ''),
    nullif(trim(p_notas), ''), 'MANUAL', auth.uid()
  );
  return v_id;
end;
$$;

revoke all on function public.fin_registrar_abono_factura(uuid, date, numeric, text, text) from public, anon;
grant execute on function public.fin_registrar_abono_factura(uuid, date, numeric, text, text) to authenticated;

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
declare v_cuenta_id uuid; v_proveedor text;
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then raise exception 'No tienes permiso.' using errcode = '42501'; end if;
  select id into v_cuenta_id from public.fin_cuentas_pago where codigo = trim(p_cuenta_codigo) and activo;
  if v_cuenta_id is null then raise exception 'La cuenta no existe.'; end if;
  update public.fin_facturas_proveedor
  set cuenta_pago_id = v_cuenta_id,
      estado_clasificacion = case when trim(p_cuenta_codigo) = 'PENDIENTE' then 'PENDIENTE' else 'REVISADA' end,
      confianza = case when trim(p_cuenta_codigo) = 'PENDIENTE' then 0 else 1 end,
      actualizado_por = auth.uid(), actualizado_en = now()
  where id = p_factura_id returning proveedor_normalizado into v_proveedor;
  if v_proveedor is null then raise exception 'La factura no existe.'; end if;
  if coalesce(p_recordar_proveedor, false) and trim(p_cuenta_codigo) <> 'PENDIENTE' then
    insert into public.fin_reglas_clasificacion_pago (
      campo, patron, cuenta_pago_id, prioridad, confianza, origen, creado_por
    ) values ('PROVEEDOR', v_proveedor, v_cuenta_id, 34, 1, 'USUARIO', auth.uid())
    on conflict (campo, patron) do update
    set cuenta_pago_id = excluded.cuenta_pago_id, prioridad = 34,
        confianza = 1, origen = 'USUARIO', activo = true, actualizado_en = now();
  end if;
end;
$$;

revoke all on function public.fin_clasificar_factura(uuid, text, boolean) from public, anon;
grant execute on function public.fin_clasificar_factura(uuid, text, boolean) to authenticated;

comment on table public.fin_facturas_proveedor is
  'Facturas de proveedores y obligaciones por pagar. Pagada se determina por sus abonos.';
