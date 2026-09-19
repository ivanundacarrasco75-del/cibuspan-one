-- CIBUSPAN ONE
-- Roles de pago mensuales desde el reporte DETALLE RUBROS.
-- El costo empresa se calcula con los rubros de ingreso. Los egresos del rol
-- (aportes personales, anticipos y prestamos) se conservan como descuentos.

create table if not exists public.fin_nomina_empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text not null unique,
  area text not null default 'MANO_OBRA_DIRECTA' check (area in (
    'MANO_OBRA_DIRECTA',
    'MANO_OBRA_INDIRECTA',
    'ADMINISTRACION',
    'VENTAS',
    'DISTRIBUCION'
  )),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.fin_nomina_importaciones (
  id uuid primary key default gen_random_uuid(),
  periodo date not null unique check (periodo = date_trunc('month', periodo)::date),
  archivo_nombre text not null,
  archivo_hash text not null,
  empleados integer not null check (empleados > 0),
  movimientos integer not null check (movimientos > 0),
  costo_empresa numeric(18,2) not null default 0,
  descuentos numeric(18,2) not null default 0,
  pago_neto_rol numeric(18,2) not null default 0,
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.fin_nomina_movimientos (
  id uuid primary key default gen_random_uuid(),
  importacion_id uuid not null
    references public.fin_nomina_importaciones(id) on delete cascade,
  empleado_id uuid not null
    references public.fin_nomina_empleados(id) on delete restrict,
  periodo date not null,
  numero_linea integer not null,
  departamento text,
  rubro text not null,
  rubro_normalizado text not null,
  observaciones text,
  mostrar_rol boolean not null default false,
  provision boolean not null default false,
  ingresos numeric(18,2) not null default 0 check (ingresos >= 0),
  egresos numeric(18,2) not null default 0 check (egresos >= 0),
  creado_en timestamptz not null default now(),
  unique (importacion_id, numero_linea)
);

create index if not exists fin_nomina_movimientos_periodo_idx
  on public.fin_nomina_movimientos (periodo, empleado_id);

create index if not exists fin_nomina_movimientos_rubro_idx
  on public.fin_nomina_movimientos (rubro_normalizado, periodo);

alter table public.fin_nomina_empleados enable row level security;
alter table public.fin_nomina_importaciones enable row level security;
alter table public.fin_nomina_movimientos enable row level security;

drop policy if exists fin_nomina_empleados_lectura on public.fin_nomina_empleados;
create policy fin_nomina_empleados_lectura
  on public.fin_nomina_empleados for select to authenticated
  using (public.app_puede_alguna(array['Administración']));

drop policy if exists fin_nomina_importaciones_lectura on public.fin_nomina_importaciones;
create policy fin_nomina_importaciones_lectura
  on public.fin_nomina_importaciones for select to authenticated
  using (public.app_puede_alguna(array['Administración']));

drop policy if exists fin_nomina_movimientos_lectura on public.fin_nomina_movimientos;
create policy fin_nomina_movimientos_lectura
  on public.fin_nomina_movimientos for select to authenticated
  using (public.app_puede_alguna(array['Administración']));

grant select on public.fin_nomina_empleados to authenticated;
grant select on public.fin_nomina_importaciones to authenticated;
grant select on public.fin_nomina_movimientos to authenticated;
revoke all on public.fin_nomina_empleados from anon;
revoke all on public.fin_nomina_importaciones from anon;
revoke all on public.fin_nomina_movimientos from anon;

insert into public.fin_nomina_empleados (nombre, nombre_normalizado, area)
values
  ('PACHACAMA CONDOR CRISTIAN FABRICIO', public.fin_normalizar_texto('PACHACAMA CONDOR CRISTIAN FABRICIO'), 'MANO_OBRA_DIRECTA'),
  ('QUISHPE MEDRAÑO DANNY LISANDRO', public.fin_normalizar_texto('QUISHPE MEDRAÑO DANNY LISANDRO'), 'MANO_OBRA_DIRECTA'),
  ('ORTIZ BUSTAMANTE DAYSI JEANNETH', public.fin_normalizar_texto('ORTIZ BUSTAMANTE DAYSI JEANNETH'), 'VENTAS'),
  ('SAMANIEGO ZAMBRANO ELVIA TERESA', public.fin_normalizar_texto('SAMANIEGO ZAMBRANO ELVIA TERESA'), 'ADMINISTRACION'),
  ('GUALOTUÑA PAUCAR FRANKLIN GIOVANNI', public.fin_normalizar_texto('GUALOTUÑA PAUCAR FRANKLIN GIOVANNI'), 'MANO_OBRA_DIRECTA'),
  ('UNDA CARRASCO IVAN', public.fin_normalizar_texto('UNDA CARRASCO IVAN'), 'ADMINISTRACION'),
  ('NATO CANDO JEFFERSON JOEL', public.fin_normalizar_texto('NATO CANDO JEFFERSON JOEL'), 'MANO_OBRA_DIRECTA'),
  ('CARGUAQUISPE MULLO JEYSON FRANCISCO', public.fin_normalizar_texto('CARGUAQUISPE MULLO JEYSON FRANCISCO'), 'MANO_OBRA_DIRECTA'),
  ('TAPIA IZA JHONATAN HENRY', public.fin_normalizar_texto('TAPIA IZA JHONATAN HENRY'), 'MANO_OBRA_DIRECTA'),
  ('DONOSO OROZCO JORGE SANTIAGO', public.fin_normalizar_texto('DONOSO OROZCO JORGE SANTIAGO'), 'ADMINISTRACION'),
  ('NATO CASAMEN VICTOR ALFONSO', public.fin_normalizar_texto('NATO CASAMEN VICTOR ALFONSO'), 'MANO_OBRA_DIRECTA'),
  ('GUANOTASIG ULLCO VINICIO ENRIQUE', public.fin_normalizar_texto('GUANOTASIG ULLCO VINICIO ENRIQUE'), 'MANO_OBRA_DIRECTA'),
  ('PATIÑO QUILLUPANGUI VIVIANA CAROLINA', public.fin_normalizar_texto('PATIÑO QUILLUPANGUI VIVIANA CAROLINA'), 'MANO_OBRA_DIRECTA')
on conflict (nombre_normalizado) do update
set nombre = excluded.nombre,
    area = excluded.area,
    activo = true,
    actualizado_en = now();

create or replace function public.fin_importar_nomina_pdf(
  p_periodo date,
  p_archivo_nombre text,
  p_archivo_hash text,
  p_movimientos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_importacion_id uuid;
  v_movimiento jsonb;
  v_empleado_id uuid;
  v_nombre text;
  v_nombre_normalizado text;
  v_area text;
  v_ingresos numeric(18,2);
  v_egresos numeric(18,2);
  v_empleados integer;
  v_costo numeric(18,2);
  v_descuentos numeric(18,2);
  v_pago_neto numeric(18,2);
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para importar roles de pago.' using errcode = '42501';
  end if;
  if p_periodo is null or trim(coalesce(p_archivo_nombre, '')) = ''
    or trim(coalesce(p_archivo_hash, '')) = '' then
    raise exception 'Periodo, archivo y huella digital son obligatorios.';
  end if;
  if jsonb_typeof(p_movimientos) <> 'array'
    or jsonb_array_length(p_movimientos) = 0
    or jsonb_array_length(p_movimientos) > 10000 then
    raise exception 'El reporte no contiene movimientos validos.';
  end if;

  select id into v_importacion_id
  from public.fin_nomina_importaciones
  where periodo = v_periodo
  for update;

  if v_importacion_id is null then
    insert into public.fin_nomina_importaciones (
      periodo, archivo_nombre, archivo_hash, empleados, movimientos,
      costo_empresa, descuentos, pago_neto_rol, creado_por, actualizado_por
    ) values (
      v_periodo, trim(p_archivo_nombre), trim(p_archivo_hash), 1,
      jsonb_array_length(p_movimientos), 0, 0, 0, auth.uid(), auth.uid()
    ) returning id into v_importacion_id;
  else
    delete from public.fin_nomina_movimientos
    where importacion_id = v_importacion_id;

    update public.fin_nomina_importaciones
    set archivo_nombre = trim(p_archivo_nombre),
        archivo_hash = trim(p_archivo_hash),
        movimientos = jsonb_array_length(p_movimientos),
        actualizado_por = auth.uid(),
        actualizado_en = now()
    where id = v_importacion_id;
  end if;

  for v_movimiento in select value from jsonb_array_elements(p_movimientos)
  loop
    v_nombre := trim(coalesce(v_movimiento->>'empleado', ''));
    v_nombre_normalizado := public.fin_normalizar_texto(v_nombre);
    v_area := upper(trim(coalesce(v_movimiento->>'area', 'MANO_OBRA_DIRECTA')));
    v_ingresos := round(coalesce((v_movimiento->>'ingresos')::numeric, 0), 2);
    v_egresos := round(coalesce((v_movimiento->>'egresos')::numeric, 0), 2);

    if v_nombre_normalizado = '' or trim(coalesce(v_movimiento->>'rubro', '')) = '' then
      raise exception 'Existe una linea sin empleado o rubro.';
    end if;
    if v_area not in (
      'MANO_OBRA_DIRECTA', 'MANO_OBRA_INDIRECTA',
      'ADMINISTRACION', 'VENTAS', 'DISTRIBUCION'
    ) then
      raise exception 'El area de % no es valida.', v_nombre;
    end if;
    if v_ingresos < 0 or v_egresos < 0 or (v_ingresos = 0 and v_egresos = 0) then
      raise exception 'El valor del rubro de % no es valido.', v_nombre;
    end if;

    insert into public.fin_nomina_empleados (
      nombre, nombre_normalizado, area
    ) values (
      v_nombre, v_nombre_normalizado, v_area
    )
    on conflict (nombre_normalizado) do update
    set nombre = excluded.nombre,
        area = excluded.area,
        activo = true,
        actualizado_en = now()
    returning id into v_empleado_id;

    insert into public.fin_nomina_movimientos (
      importacion_id, empleado_id, periodo, numero_linea, departamento,
      rubro, rubro_normalizado, observaciones, mostrar_rol, provision,
      ingresos, egresos
    ) values (
      v_importacion_id,
      v_empleado_id,
      v_periodo,
      (v_movimiento->>'numero_linea')::integer,
      nullif(trim(v_movimiento->>'departamento'), ''),
      trim(v_movimiento->>'rubro'),
      public.fin_normalizar_texto(v_movimiento->>'rubro'),
      nullif(trim(v_movimiento->>'observaciones'), ''),
      coalesce((v_movimiento->>'mostrar_rol')::boolean, false),
      coalesce((v_movimiento->>'provision')::boolean, false),
      v_ingresos,
      v_egresos
    );
  end loop;

  select
    count(distinct empleado_id)::integer,
    coalesce(sum(ingresos), 0)::numeric(18,2),
    coalesce(sum(egresos), 0)::numeric(18,2),
    coalesce(sum(case when mostrar_rol then ingresos - egresos else 0 end), 0)::numeric(18,2)
  into v_empleados, v_costo, v_descuentos, v_pago_neto
  from public.fin_nomina_movimientos
  where importacion_id = v_importacion_id;

  update public.fin_nomina_importaciones
  set empleados = v_empleados,
      costo_empresa = v_costo,
      descuentos = v_descuentos,
      pago_neto_rol = v_pago_neto,
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where id = v_importacion_id;

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'periodo', v_periodo,
    'empleados', v_empleados,
    'movimientos', jsonb_array_length(p_movimientos),
    'costo_empresa', v_costo,
    'descuentos', v_descuentos,
    'pago_neto_rol', v_pago_neto
  );
end;
$$;

revoke all on function public.fin_importar_nomina_pdf(date,text,text,jsonb) from public, anon;
grant execute on function public.fin_importar_nomina_pdf(date,text,text,jsonb) to authenticated;

create or replace function public.fin_actualizar_area_nomina(
  p_empleado_id uuid,
  p_area text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area text := upper(trim(coalesce(p_area, '')));
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para editar la nomina.' using errcode = '42501';
  end if;
  if v_area not in (
    'MANO_OBRA_DIRECTA', 'MANO_OBRA_INDIRECTA',
    'ADMINISTRACION', 'VENTAS', 'DISTRIBUCION'
  ) then
    raise exception 'El area seleccionada no es valida.';
  end if;
  update public.fin_nomina_empleados
  set area = v_area, actualizado_en = now()
  where id = p_empleado_id;
  if not found then raise exception 'El empleado no existe.'; end if;
end;
$$;

revoke all on function public.fin_actualizar_area_nomina(uuid,text) from public, anon;
grant execute on function public.fin_actualizar_area_nomina(uuid,text) to authenticated;

create or replace view public.fin_vw_nomina_mensual_area
with (security_invoker = true)
as
select
  movimiento.periodo,
  empleado.area,
  count(distinct movimiento.empleado_id)::integer as empleados,
  sum(movimiento.ingresos)::numeric(18,2) as costo_empresa,
  sum(movimiento.egresos)::numeric(18,2) as descuentos,
  sum(case when movimiento.mostrar_rol
    then movimiento.ingresos - movimiento.egresos else 0 end)::numeric(18,2) as pago_neto_rol
from public.fin_nomina_movimientos movimiento
join public.fin_nomina_empleados empleado on empleado.id = movimiento.empleado_id
group by movimiento.periodo, empleado.area;

create or replace view public.fin_vw_nomina_empleado_mes
with (security_invoker = true)
as
select
  movimiento.periodo,
  empleado.id as empleado_id,
  empleado.nombre,
  empleado.area,
  count(*)::integer as movimientos,
  sum(movimiento.ingresos)::numeric(18,2) as costo_empresa,
  sum(movimiento.egresos)::numeric(18,2) as descuentos,
  sum(case when movimiento.mostrar_rol
    then movimiento.ingresos - movimiento.egresos else 0 end)::numeric(18,2) as pago_neto_rol
from public.fin_nomina_movimientos movimiento
join public.fin_nomina_empleados empleado on empleado.id = movimiento.empleado_id
group by movimiento.periodo, empleado.id, empleado.nombre, empleado.area;

grant select on public.fin_vw_nomina_mensual_area to authenticated;
grant select on public.fin_vw_nomina_empleado_mes to authenticated;
revoke all on public.fin_vw_nomina_mensual_area from anon;
revoke all on public.fin_vw_nomina_empleado_mes from anon;

comment on table public.fin_nomina_movimientos is
  'Detalle mensual de rubros de rol. Ingresos forman el costo empresa; egresos son descuentos del trabajador.';
comment on view public.fin_vw_nomina_mensual_area is
  'Costo laboral, descuentos y pago neto del rol agrupados por mes y area.';
