-- ============================================================
-- CIBUSPAN ONE · V12.42
-- PUNTO DE EQUILIBRIO MENSUAL PARA EL DASHBOARD COMERCIAL
--
-- Fuente: Estado de Resultados y clasificación gerencial.
-- No modifica importaciones, saldos ni periodos históricos.
-- ============================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if not pg_try_advisory_xact_lock(hashtext('CIBUSPAN_ONE_V12_42')) then
    raise exception using
      errcode = '55P03',
      message = 'Ya existe otra instalación de CIBUSPAN ONE V12.42 en curso. Espere unos segundos y vuelva a ejecutar el archivo completo.';
  end if;

  if to_regclass('public.fin_vw_punto_equilibrio_mensual') is not null then
    execute 'lock table public.fin_vw_punto_equilibrio_mensual in access exclusive mode nowait';
  end if;
exception
  when lock_not_available then
    raise exception using
      errcode = '55P03',
      message = 'El Dashboard está consultando el punto de equilibrio. Cierre CIBUSPAN ONE, espere unos segundos y vuelva a ejecutar este archivo completo.';
end;
$$;

create or replace view public.fin_vw_punto_equilibrio_mensual
with (security_invoker = true)
as
with cuentas as (
  select
    r.periodo,
    r.cuenta_codigo,
    abs(sum(coalesce(r.valor_original, 0)))::numeric(18,2) as valor
  from public.fin_resultados_mensuales r
  group by r.periodo, r.cuenta_codigo
),
detalle as (
  select
    d.periodo,
    d.cuenta_codigo,
    abs(sum(d.valor) filter (
      where coalesce(d.comportamiento, m.comportamiento) in (
        'VARIABLE', 'SEMI_VARIABLE'
      )
    ))::numeric(18,2) as variable,
    abs(sum(d.valor) filter (
      where coalesce(d.comportamiento, m.comportamiento) in (
        'FIJO_RANGO', 'ESCALONADO'
      )
    ))::numeric(18,2) as fijo
  from public.fin_resultado_clasificacion_detalle d
  join public.fin_matriz_clasificacion_cuentas m
    on m.cuenta_codigo = d.cuenta_codigo
  where d.clasificacion_gerencial <> 'FUERA_EBITDA'
  group by d.periodo, d.cuenta_codigo
),
costos as (
  select
    c.periodo,
    c.cuenta_codigo,
    c.valor,
    case
      when coalesce(m.impacta_ebitda, false) = false then 0
      when m.requiere_detalle then coalesce(d.variable, 0)
      when m.comportamiento in ('VARIABLE', 'SEMI_VARIABLE') then c.valor
      else 0
    end::numeric(18,2) as variable,
    case
      when coalesce(m.impacta_ebitda, false) = false then 0
      when m.requiere_detalle then coalesce(d.fijo, 0)
      when m.comportamiento in ('FIJO_RANGO', 'ESCALONADO') then c.valor
      else 0
    end::numeric(18,2) as fijo,
    case
      when m.cuenta_codigo is null then c.valor
      when coalesce(m.impacta_ebitda, false) = false then 0
      when m.requiere_detalle then greatest(
        c.valor - coalesce(d.variable, 0) - coalesce(d.fijo, 0),
        0
      )
      when m.comportamiento not in (
        'VARIABLE', 'SEMI_VARIABLE', 'FIJO_RANGO', 'ESCALONADO'
      ) or m.comportamiento is null then c.valor
      else 0
    end::numeric(18,2) as sin_clasificar
  from cuentas c
  left join public.fin_matriz_clasificacion_cuentas m
    on m.cuenta_codigo = c.cuenta_codigo
   and m.activo
  left join detalle d
    on d.periodo = c.periodo
   and d.cuenta_codigo = c.cuenta_codigo
  where c.cuenta_codigo like '5.%'
     or c.cuenta_codigo like '6.%'
),
mensual as (
  select
    c.periodo,
    coalesce(sum(c.valor) filter (
      where c.cuenta_codigo like '4.%'
    ), 0)::numeric(18,2) as ventas_netas,
    coalesce((select sum(k.variable) from costos k where k.periodo = c.periodo), 0)::numeric(18,2)
      as costos_variables,
    coalesce((select sum(k.fijo) from costos k where k.periodo = c.periodo), 0)::numeric(18,2)
      as costos_fijos,
    coalesce((select sum(k.sin_clasificar) from costos k where k.periodo = c.periodo), 0)::numeric(18,2)
      as costos_sin_clasificar
  from cuentas c
  group by c.periodo
),
calculo as (
  select
    m.*,
    (m.ventas_netas - m.costos_variables)::numeric(18,2)
      as margen_contribucion,
    case
      when m.ventas_netas > 0 then
        round((m.ventas_netas - m.costos_variables) / m.ventas_netas * 100, 2)
      else 0
    end::numeric(9,2) as margen_contribucion_pct,
    (
      m.costos_sin_clasificar <= 0.02
      and m.ventas_netas > 0
      and m.ventas_netas > m.costos_variables
    ) as clasificacion_completa
  from mensual m
)
select
  c.periodo,
  c.ventas_netas,
  c.costos_variables,
  c.costos_fijos,
  c.margen_contribucion,
  c.margen_contribucion_pct,
  case when c.clasificacion_completa then
    round(c.costos_fijos / (c.margen_contribucion / c.ventas_netas), 2)
  else null end::numeric(18,2) as punto_equilibrio,
  case when c.clasificacion_completa then
    round(c.ventas_netas - c.costos_fijos / (c.margen_contribucion / c.ventas_netas), 2)
  else null end::numeric(18,2) as excedente_deficit,
  case
    when c.clasificacion_completa and c.costos_fijos > 0 then
      round(c.ventas_netas / (c.costos_fijos / (c.margen_contribucion / c.ventas_netas)) * 100, 2)
    when c.clasificacion_completa and c.costos_fijos = 0 then 100
    else null
  end::numeric(9,2) as cobertura_pct,
  c.costos_sin_clasificar,
  c.clasificacion_completa
from calculo c
order by c.periodo;

comment on view public.fin_vw_punto_equilibrio_mensual is
  'Punto de equilibrio por mes: costos fijos divididos para el margen de contribución porcentual. SEMI_VARIABLE se trata como variable y ESCALONADO como fijo.';

revoke all on public.fin_vw_punto_equilibrio_mensual from public, anon;
grant select on public.fin_vw_punto_equilibrio_mensual to authenticated;

commit;

notify pgrst, 'reload schema';

select *
from public.fin_vw_punto_equilibrio_mensual
order by periodo desc
limit 12;
