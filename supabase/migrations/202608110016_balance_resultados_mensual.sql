-- CIBUSPAN ONE
-- Importacion mensual acumulativa del Balance Comparativo de Resultados.

create table if not exists public.fin_importaciones_resultados (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text not null,
  periodo_desde date not null,
  periodo_hasta date not null,
  meses_incluidos integer not null check (meses_incluidos > 0),
  cuentas_incluidas integer not null check (cuentas_incluidas > 0),
  registros_importados integer not null default 0,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.fin_resultados_mensuales (
  id uuid primary key default gen_random_uuid(),
  periodo date not null,
  cuenta_codigo text not null,
  cuenta_descripcion text not null,
  valor_original numeric(18,2) not null default 0,
  importacion_id uuid not null
    references public.fin_importaciones_resultados(id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint fin_resultados_periodo_cuenta_key
    unique (periodo, cuenta_codigo),
  constraint fin_resultados_periodo_inicio_mes_check
    check (periodo = date_trunc('month', periodo)::date)
);

create index if not exists fin_resultados_periodo_idx
  on public.fin_resultados_mensuales (periodo desc);

create index if not exists fin_resultados_cuenta_idx
  on public.fin_resultados_mensuales (cuenta_codigo);

alter table public.fin_importaciones_resultados enable row level security;
alter table public.fin_resultados_mensuales enable row level security;

revoke all on table public.fin_importaciones_resultados from anon;
revoke all on table public.fin_resultados_mensuales from anon;
revoke insert, update, delete on table public.fin_importaciones_resultados
  from authenticated;
revoke insert, update, delete on table public.fin_resultados_mensuales
  from authenticated;
grant select on table public.fin_importaciones_resultados to authenticated;
grant select on table public.fin_resultados_mensuales to authenticated;

drop policy if exists c1_fin_importaciones_lectura
  on public.fin_importaciones_resultados;
create policy c1_fin_importaciones_lectura
on public.fin_importaciones_resultados
for select
to authenticated
using (
  public.app_puede_alguna(array['Administración', 'Reportes'])
);

drop policy if exists c1_fin_resultados_lectura
  on public.fin_resultados_mensuales;
create policy c1_fin_resultados_lectura
on public.fin_resultados_mensuales
for select
to authenticated
using (
  public.app_puede_alguna(array['Administración', 'Reportes'])
);

create or replace function public.fin_importar_balance_resultados(
  p_archivo_nombre text,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_periodo_desde date;
  v_periodo_hasta date;
  v_meses integer;
  v_cuentas integer;
  v_registros integer;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para importar balances.'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_archivo_nombre, '')), '') is null then
    raise exception 'El nombre del archivo es obligatorio.';
  end if;

  if jsonb_typeof(p_lineas) <> 'array'
     or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no contiene lineas para importar.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lineas) as linea(
      periodo text,
      cuenta_codigo text,
      cuenta_descripcion text,
      valor numeric
    )
    where linea.periodo !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-01$'
       or nullif(trim(coalesce(linea.cuenta_codigo, '')), '') is null
       or nullif(trim(coalesce(linea.cuenta_descripcion, '')), '') is null
       or linea.valor is null
  ) then
    raise exception 'Existen periodos, cuentas o valores invalidos en el archivo.';
  end if;

  select
    min(linea.periodo::date),
    max(linea.periodo::date),
    count(distinct linea.periodo)::integer,
    count(distinct linea.cuenta_codigo)::integer
  into
    v_periodo_desde,
    v_periodo_hasta,
    v_meses,
    v_cuentas
  from jsonb_to_recordset(p_lineas) as linea(
    periodo text,
    cuenta_codigo text,
    cuenta_descripcion text,
    valor numeric
  );

  insert into public.fin_importaciones_resultados (
    archivo_nombre,
    periodo_desde,
    periodo_hasta,
    meses_incluidos,
    cuentas_incluidas,
    creado_por
  )
  values (
    trim(p_archivo_nombre),
    v_periodo_desde,
    v_periodo_hasta,
    v_meses,
    v_cuentas,
    auth.uid()
  )
  returning id into v_importacion_id;

  delete from public.fin_resultados_mensuales resultado
  where resultado.periodo in (
    select distinct linea.periodo::date
    from jsonb_to_recordset(p_lineas) as linea(periodo text)
  );

  insert into public.fin_resultados_mensuales (
    periodo,
    cuenta_codigo,
    cuenta_descripcion,
    valor_original,
    importacion_id
  )
  select
    linea.periodo::date,
    trim(linea.cuenta_codigo),
    trim(linea.cuenta_descripcion),
    round(linea.valor, 2),
    v_importacion_id
  from jsonb_to_recordset(p_lineas) as linea(
    periodo text,
    cuenta_codigo text,
    cuenta_descripcion text,
    valor numeric
  );

  get diagnostics v_registros = row_count;

  update public.fin_importaciones_resultados
  set registros_importados = v_registros
  where id = v_importacion_id;

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'periodo_desde', v_periodo_desde,
    'periodo_hasta', v_periodo_hasta,
    'meses_importados', v_meses,
    'cuentas_importadas', v_cuentas,
    'registros_importados', v_registros
  );
end;
$$;

revoke all on function public.fin_importar_balance_resultados(text, jsonb)
  from public, anon;
grant execute on function public.fin_importar_balance_resultados(text, jsonb)
  to authenticated;

create or replace view public.fin_vw_resultado_mensual
with (security_invoker = true)
as
with resumen as (
  select
    resultado.periodo,
    count(*)::integer as cuentas,
    sum(
      case
        when resultado.cuenta_codigo like '4.1.01.%'
          then -resultado.valor_original
        else 0
      end
    )::numeric(18,2) as ventas_netas,
    sum(
      case
        when resultado.cuenta_codigo like '5.%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as costo_ventas,
    sum(
      case
        when resultado.cuenta_codigo like '6.1.%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as gastos_ventas,
    sum(
      case
        when resultado.cuenta_codigo like '6.2.%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as gastos_administracion,
    sum(
      case
        when resultado.cuenta_codigo like '4.%'
         and resultado.cuenta_codigo not like '4.1.01.%'
          then -resultado.valor_original
        else 0
      end
    )::numeric(18,2) as otros_ingresos,
    sum(
      case
        when resultado.cuenta_codigo like '8.%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as gastos_financieros,
    sum(
      case
        when lower(resultado.cuenta_descripcion) like 'depreciaci%'
          then resultado.valor_original
        else 0
      end
    )::numeric(18,2) as depreciacion,
    max(resultado.actualizado_en) as actualizado_en
  from public.fin_resultados_mensuales resultado
  group by resultado.periodo
)
select
  resumen.periodo,
  resumen.cuentas,
  resumen.ventas_netas,
  resumen.costo_ventas,
  resumen.gastos_ventas,
  resumen.gastos_administracion,
  resumen.otros_ingresos,
  resumen.gastos_financieros,
  resumen.depreciacion,
  (
    resumen.ventas_netas
    - resumen.costo_ventas
    - resumen.gastos_ventas
    - resumen.gastos_administracion
  )::numeric(18,2) as resultado_operativo,
  (
    resumen.ventas_netas
    - resumen.costo_ventas
    - resumen.gastos_ventas
    - resumen.gastos_administracion
    + resumen.depreciacion
  )::numeric(18,2) as ebitda_estimado,
  (
    resumen.ventas_netas
    - resumen.costo_ventas
    - resumen.gastos_ventas
    - resumen.gastos_administracion
    + resumen.depreciacion
  ) / nullif(resumen.ventas_netas, 0) * 100
    as margen_ebitda_estimado,
  (
    resumen.ventas_netas
    - resumen.costo_ventas
    - resumen.gastos_ventas
    - resumen.gastos_administracion
    + resumen.otros_ingresos
    - resumen.gastos_financieros
  )::numeric(18,2) as resultado_ejercicio,
  resumen.actualizado_en
from resumen;

grant select on public.fin_vw_resultado_mensual to authenticated;
revoke all on public.fin_vw_resultado_mensual from anon;
