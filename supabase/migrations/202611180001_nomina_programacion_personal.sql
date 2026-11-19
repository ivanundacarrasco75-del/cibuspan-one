begin;

alter table public.fin_nomina_empleados
  add column if not exists tipo_vinculo text not null default 'NOMINA'
  check (tipo_vinculo in ('NOMINA','EXTERNO'));

create or replace function public.fin_guardar_personal(
  p_id uuid, p_nombre text, p_area text, p_activo boolean, p_tipo text
) returns void language plpgsql security definer set search_path='' as $$
declare normalizado text;
begin
  if auth.uid() is null or not coalesce(public.app_puede_alguna(array['Administración']),false) then
    raise exception 'No tienes permiso para gestionar el personal.' using errcode='42501';
  end if;
  p_nombre := btrim(p_nombre);
  normalizado := public.fin_normalizar_texto(p_nombre);
  if p_id is null or normalizado is null or char_length(normalizado) not between 2 and 200
    or p_area is null or p_area not in ('MANO_OBRA_DIRECTA','MANO_OBRA_INDIRECTA','ADMINISTRACION','VENTAS','DISTRIBUCION')
    or p_tipo is null or p_tipo not in ('NOMINA','EXTERNO') or p_activo is null then
    raise exception 'Completa el nombre, área, estado y vínculo de la persona.';
  end if;
  insert into public.fin_nomina_empleados(id,nombre,nombre_normalizado,area,activo,tipo_vinculo)
    values(p_id,p_nombre,normalizado,p_area,p_activo,p_tipo)
  on conflict(id) do update set nombre=excluded.nombre,nombre_normalizado=excluded.nombre_normalizado,
    area=excluded.area,activo=excluded.activo,tipo_vinculo=excluded.tipo_vinculo,actualizado_en=now();
end;
$$;

-- Cargar un rol histórico conserva el estado laboral definido en el maestro.
do $ajuste$
declare definicion text;
begin
  select pg_get_functiondef('public.fin_importar_nomina_pdf(date,text,text,jsonb)'::regprocedure) into definicion;
  if position('activo = true,' in definicion)>0 then
    execute replace(definicion,'activo = true,','');
  elsif position('activo = true' in definicion)>0 then
    raise exception 'Revisar el contrato de importación de nómina.';
  end if;
end $ajuste$;

create table if not exists public.fin_nomina_obligaciones (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.fin_nomina_empleados(id),
  periodo date not null check (isfinite(periodo) and periodo=date_trunc('month',periodo)::date),
  concepto text not null check (concepto in ('PRIMERA_QUINCENA','SEGUNDA_QUINCENA','DECIMO_TERCERO','DECIMO_CUARTO','DECIMO_SEXTO')),
  nombre text not null,
  tipo_vinculo text not null check (tipo_vinculo in ('NOMINA','EXTERNO')),
  monto numeric(14,2) not null check (monto>0),
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  unique(empleado_id,periodo,concepto)
);
alter table public.fin_nomina_obligaciones enable row level security;
revoke all on public.fin_nomina_obligaciones from public,anon,authenticated;
grant select on public.fin_nomina_obligaciones to authenticated;
drop policy if exists fin_nomina_obligaciones_lectura on public.fin_nomina_obligaciones;
create policy fin_nomina_obligaciones_lectura on public.fin_nomina_obligaciones
  for select to authenticated using ((select public.app_es_admin()));

do $vista$
begin
  if to_regclass('public.fin_vw_compras_sin_nomina') is null then
    alter view public.fin_vw_cuentas_por_pagar_compras rename to fin_vw_compras_sin_nomina;
  end if;
end $vista$;

create or replace view public.fin_vw_cuentas_por_pagar_compras with (security_invoker=true) as
select * from public.fin_vw_compras_sin_nomina
union all
select 'nomina:'||n.id::text,'NOMINA'::text,'NOMINA'::text,n.periodo,
  to_char(n.periodo,'YYYY-MM')||' · '||n.concepto,n.nombre,
  case n.concepto when 'PRIMERA_QUINCENA' then 'Primera quincena' when 'SEGUNDA_QUINCENA' then 'Segunda quincena'
    when 'DECIMO_TERCERO' then 'Décimo tercer sueldo' when 'DECIMO_CUARTO' then 'Décimo cuarto sueldo'
    when 'DECIMO_SEXTO' then 'Décimo sexto sueldo' end ||' · '||to_char(n.periodo,'MM/YYYY'),
  null::numeric,null::numeric,null::numeric,n.monto,n.monto,
  case n.tipo_vinculo when 'EXTERNO' then 'Prestador externo' else 'Nómina' end,null::text,
  coalesce(p.pagos,'[]'::jsonb),coalesce(p.pagado,0),greatest(n.monto-coalesce(p.pagado,0),0),plan.semana,
  concat_ws(' ',n.nombre,n.concepto,n.periodo)
from public.fin_nomina_obligaciones n
cross join lateral (
  select sum(a.valor) as pagado,
    jsonb_agg(jsonb_build_object('id',a.id,'valor',a.valor,'fecha',a.fecha,'documento',a.documento)
      order by a.fecha,a.registrado_en,a.id) as pagos
  from public.fin_pagos_compras a where a.documento_id='nomina:'||n.id::text
) p
left join public.fin_programacion_compras plan on plan.documento_id='nomina:'||n.id::text and plan.pagado<plan.monto
where (select public.app_es_admin());

revoke all on public.fin_vw_cuentas_por_pagar_compras from public,anon,authenticated;
grant select on public.fin_vw_cuentas_por_pagar_compras to authenticated;

create or replace function public.fin_cargar_nomina_semanal(
  p_periodo date,p_concepto text,p_semana date,p_filas jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  fila record;
  persona public.fin_nomina_empleados%rowtype;
  obligacion public.fin_nomina_obligaciones%rowtype;
  lista jsonb := '[]'::jsonb;
begin
  if not coalesce(public.app_es_admin(),false) then
    raise exception 'Solo un administrador puede programar nómina.' using errcode='42501';
  end if;
  if p_periodo is null or not isfinite(p_periodo) or p_periodo<>date_trunc('month',p_periodo)::date
    or p_concepto is null or p_concepto not in ('PRIMERA_QUINCENA','SEGUNDA_QUINCENA','DECIMO_TERCERO','DECIMO_CUARTO','DECIMO_SEXTO')
    or p_semana is null or not isfinite(p_semana) or extract(isodow from p_semana)<>1
    or jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Selecciona mes, concepto, semana y personas.';
  end if;
  if jsonb_array_length(p_filas) not between 1 and 200
    or (select count(distinct x.empleado_id) from jsonb_to_recordset(p_filas) as x(empleado_id uuid))<>jsonb_array_length(p_filas) then
    raise exception 'Selecciona entre 1 y 200 personas distintas.';
  end if;
  for fila in select * from jsonb_to_recordset(p_filas) as x(empleado_id uuid,monto numeric) order by empleado_id
  loop
    select * into persona from public.fin_nomina_empleados where id=fila.empleado_id for update;
    if not found or not persona.activo then raise exception 'La persona no está activa o ya no existe.'; end if;
    if fila.monto is null or fila.monto<=0 or fila.monto<>round(fila.monto,2) or fila.monto>=1000000000 then
      raise exception 'Revisa el monto de %.',persona.nombre;
    end if;
    insert into public.fin_nomina_obligaciones(empleado_id,periodo,concepto,nombre,tipo_vinculo,monto,creado_por)
      values(persona.id,p_periodo,p_concepto,persona.nombre,persona.tipo_vinculo,fila.monto,auth.uid())
      on conflict(empleado_id,periodo,concepto) do nothing;
    select * into obligacion from public.fin_nomina_obligaciones
      where empleado_id=persona.id and periodo=p_periodo and concepto=p_concepto for update;
    perform public.fin_bloquear_documento_compra('nomina:'||obligacion.id::text);
    if obligacion.monto<>fila.monto then
      if exists(select 1 from public.fin_pagos_compras where documento_id='nomina:'||obligacion.id::text)
        or exists(select 1 from public.fin_programacion_compras where documento_id='nomina:'||obligacion.id::text) then
        raise exception 'El pago de % ya está programado con otro monto. Revisa Pagos semanales.',persona.nombre;
      end if;
      update public.fin_nomina_obligaciones set monto=fila.monto where id=obligacion.id;
    end if;
    lista := lista||jsonb_build_array(jsonb_build_object('id','nomina:'||obligacion.id::text,'monto',fila.monto));
  end loop;
  perform public.fin_programar_compras(p_semana,lista);
end;
$$;

revoke all on function public.fin_guardar_personal(uuid,text,text,boolean,text),
  public.fin_cargar_nomina_semanal(date,text,date,jsonb) from public,anon,authenticated;
grant execute on function public.fin_guardar_personal(uuid,text,text,boolean,text),
  public.fin_cargar_nomina_semanal(date,text,date,jsonb) to authenticated;

commit;
