-- CIBUSPAN ONE
-- Excluye del transporte comercial los movimientos clasificados como CIF.
-- La conciliacion conserva la comparacion entre la cuenta contable completa
-- y todo su detalle, incluido el combustible clasificado como CIF.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_TRANSPORTE_EXCLUIR_CIF_V1')
);

create or replace view public.fin_vw_transporte_resumen_clasificado
with (security_invoker = true)
as
with meses as (
  select distinct resultado.periodo
  from public.fin_resultados_mensuales resultado
),
contable_total as (
  select
    resultado.periodo,
    abs(sum(resultado.valor_original))::numeric(18,2)
      as transporte_cuenta_contable
  from public.fin_resultados_mensuales resultado
  where resultado.cuenta_codigo = '6.1.01.2.13.01'
  group by resultado.periodo
),
detalle_total as (
  select
    movimiento.periodo,
    abs(sum(coalesce(movimiento.valor, 0)))::numeric(18,2)
      as transporte_detallado_total
  from public.fin_vw_resultado_clasificacion_detalle movimiento
  where movimiento.cuenta_codigo = '6.1.01.2.13.01'
  group by movimiento.periodo
),
detalle_comercial as (
  select
    movimiento.periodo,
    abs(sum(coalesce(movimiento.valor, 0)))::numeric(18,2)
      as transporte_comercial,
    count(*)::integer as movimientos_transporte
  from public.fin_vw_resultado_clasificacion_detalle movimiento
  where movimiento.cuenta_codigo = '6.1.01.2.13.01'
    and movimiento.clasificacion_gerencial <> 'CIF'
  group by movimiento.periodo
),
asignado as (
  select
    cliente.periodo,
    sum(cliente.gasto_transporte)::numeric(18,2)
      as transporte_asignado
  from public.fin_vw_transporte_cliente_clasificado cliente
  group by cliente.periodo
)
select
  mes.periodo,
  coalesce(comercial.transporte_comercial, 0)::numeric(18,2)
    as transporte_contable,
  coalesce(asignado.transporte_asignado, 0)::numeric(18,2)
    as transporte_asignado,
  greatest(
    coalesce(comercial.transporte_comercial, 0)
      - coalesce(asignado.transporte_asignado, 0),
    0
  )::numeric(18,2) as transporte_no_atribuido,
  coalesce(margen.ventas_netas, 0)::numeric(18,2)
    as ventas_netas_contables,
  case
    when coalesce(margen.ventas_netas, 0) <> 0
      then coalesce(comercial.transporte_comercial, 0)
        / margen.ventas_netas * 100
    else null
  end::numeric(18,4) as transporte_pct_ventas,
  coalesce(comercial.movimientos_transporte, 0)::integer
    as facturas_transporte,
  0::integer as facturas_periodo_por_confirmar,
  (
    coalesce(contable.transporte_cuenta_contable, 0)
      - coalesce(detalle.transporte_detallado_total, 0)
  )::numeric(18,2) as transporte_diferencia_conciliar
from meses mes
left join contable_total contable on contable.periodo = mes.periodo
left join detalle_total detalle on detalle.periodo = mes.periodo
left join detalle_comercial comercial on comercial.periodo = mes.periodo
left join asignado on asignado.periodo = mes.periodo
left join public.fin_vw_margen_bruto_mensual margen
  on margen.periodo = mes.periodo
order by mes.periodo;

comment on view public.fin_vw_transporte_resumen_clasificado is
  'Transporte comercial sin CIF; conciliacion de la cuenta completa contra todo el detalle.';

grant select on public.fin_vw_transporte_resumen_clasificado to authenticated;
revoke all on public.fin_vw_transporte_resumen_clasificado from anon;

commit;

notify pgrst, 'reload schema';
