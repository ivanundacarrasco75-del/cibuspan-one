-- CIBUSPAN ONE
-- Separa facturas realmente sin cliente de la diferencia de conciliacion
-- entre el total contable y el detalle de facturas de transporte.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_TRANSPORTE_ATRIBUCION_REAL_V1')
);

create or replace view public.fin_vw_transporte_resumen_mensual
with (security_invoker = true)
as
with meses as (
  select distinct periodo
  from public.fin_resultados_mensuales
),
contable as (
  select
    resultado.periodo,
    sum(resultado.valor_original)::numeric(18,2) as transporte_contable
  from public.fin_resultados_mensuales resultado
  where resultado.cuenta_codigo = '6.1.01.2.13.01'
  group by resultado.periodo
),
asignado as (
  select
    cliente.periodo,
    sum(cliente.gasto_transporte)::numeric(18,2) as transporte_asignado
  from public.fin_vw_transporte_cliente_mensual cliente
  group by cliente.periodo
),
sin_atribuir as (
  select
    factura.periodo_analisis as periodo,
    sum(factura.gasto_sin_iva)::numeric(18,2) as transporte_sin_atribuir
  from public.fin_vw_transporte_facturas factura
  where factura.regla_atribucion = 'SIN_ATRIBUIR'
  group by factura.periodo_analisis
),
confirmacion as (
  select
    factura.periodo_analisis as periodo,
    count(*)::integer as facturas_transporte,
    count(*) filter (where not factura.periodo_confirmado)::integer
      as facturas_periodo_por_confirmar
  from public.fin_vw_transporte_facturas factura
  group by factura.periodo_analisis
)
select
  m.periodo,
  coalesce(c.transporte_contable, 0)::numeric(18,2) as transporte_contable,
  coalesce(a.transporte_asignado, 0)::numeric(18,2) as transporte_asignado,
  coalesce(s.transporte_sin_atribuir, 0)::numeric(18,2)
    as transporte_no_atribuido,
  coalesce(margen.ventas_netas, 0)::numeric(18,2) as ventas_netas_contables,
  case
    when coalesce(margen.ventas_netas, 0) <> 0
    then coalesce(c.transporte_contable, 0) / margen.ventas_netas * 100
    else null
  end::numeric(18,4) as transporte_pct_ventas,
  coalesce(conf.facturas_transporte, 0)::integer as facturas_transporte,
  coalesce(conf.facturas_periodo_por_confirmar, 0)::integer
    as facturas_periodo_por_confirmar,
  (
    coalesce(c.transporte_contable, 0)
    - coalesce(a.transporte_asignado, 0)
    - coalesce(s.transporte_sin_atribuir, 0)
  )::numeric(18,2) as transporte_diferencia_conciliar
from meses m
left join contable c on c.periodo = m.periodo
left join asignado a on a.periodo = m.periodo
left join sin_atribuir s on s.periodo = m.periodo
left join public.fin_vw_margen_bruto_mensual margen on margen.periodo = m.periodo
left join confirmacion conf on conf.periodo = m.periodo
order by m.periodo;

comment on view public.fin_vw_transporte_resumen_mensual is
  'Separa facturas sin cliente de la diferencia entre contabilidad y detalle atribuido.';

grant select on public.fin_vw_transporte_resumen_mensual to authenticated;
revoke all on public.fin_vw_transporte_resumen_mensual from anon;

commit;

notify pgrst, 'reload schema';
