-- CIBUSPAN ONE
-- Transporte por cliente desde la clasificacion oficial del Libro Mayor.
-- Evita comparar el total contable con atribuciones de facturas proveedor.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_TRANSPORTE_DESDE_CLASIFICACION_V1')
);

create or replace view public.fin_vw_transporte_cliente_clasificado
with (security_invoker = true)
as
with asignaciones as (
  select
    detalle.periodo,
    detalle.id as detalle_id,
    nullif(cliente.valor ->> 'cliente_id', '')::uuid as cliente_id,
    abs(
      coalesce(
        nullif(cliente.valor ->> 'valor_asignado', '')::numeric,
        coalesce(detalle.valor, 0)::numeric
          * coalesce(
              nullif(cliente.valor ->> 'porcentaje', '')::numeric,
              0
            ) / 100
      )
    )::numeric(18,2) as gasto_transporte
  from public.fin_vw_resultado_clasificacion_detalle detalle
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(to_jsonb(detalle) -> 'clientes') = 'array'
        then to_jsonb(detalle) -> 'clientes'
      else '[]'::jsonb
    end
  ) as cliente(valor)
  where detalle.cuenta_codigo = '6.1.01.2.13.01'
    and detalle.clasificacion_gerencial = 'GASTO_ESPECIFICO_CLIENTE'
    and nullif(cliente.valor ->> 'cliente_id', '') is not null
),
por_cliente as (
  select
    asignacion.periodo,
    asignacion.cliente_id,
    sum(asignacion.gasto_transporte)::numeric(18,2) as gasto_transporte,
    count(distinct asignacion.detalle_id)::integer as movimientos_transporte
  from asignaciones asignacion
  group by asignacion.periodo, asignacion.cliente_id
)
select
  asignado.periodo,
  asignado.cliente_id,
  cliente.nombre as cliente_nombre,
  asignado.gasto_transporte,
  coalesce(driver.unidades_facturadas, 0)::numeric(18,3)
    as unidades_facturadas,
  coalesce(driver.venta_facturada_sin_impuestos, 0)::numeric(18,2)
    as venta_facturada_sin_impuestos,
  case
    when coalesce(driver.unidades_facturadas, 0) > 0
      then asignado.gasto_transporte / driver.unidades_facturadas
    else null
  end::numeric(18,6) as transporte_por_unidad,
  case
    when coalesce(driver.venta_facturada_sin_impuestos, 0) <> 0
      then asignado.gasto_transporte
        / driver.venta_facturada_sin_impuestos * 100
    else null
  end::numeric(18,4) as transporte_pct_facturacion,
  asignado.movimientos_transporte as facturas_transporte,
  true as periodo_confirmado,
  'CLASIFICACION_LIBRO_MAYOR'::text as metodo
from por_cliente asignado
join public.clientes cliente on cliente.id = asignado.cliente_id
left join public.fin_vw_transporte_driver_cliente driver
  on driver.periodo = asignado.periodo
 and driver.cliente_id = asignado.cliente_id;

create or replace view public.fin_vw_transporte_resumen_clasificado
with (security_invoker = true)
as
with meses as (
  select distinct resultado.periodo
  from public.fin_resultados_mensuales resultado
),
contable as (
  select
    resultado.periodo,
    abs(sum(resultado.valor_original))::numeric(18,2)
      as transporte_contable
  from public.fin_resultados_mensuales resultado
  where resultado.cuenta_codigo = '6.1.01.2.13.01'
  group by resultado.periodo
),
detalle as (
  select
    movimiento.periodo,
    abs(sum(coalesce(movimiento.valor, 0)))::numeric(18,2)
      as transporte_detallado,
    count(*)::integer as movimientos_transporte
  from public.fin_vw_resultado_clasificacion_detalle movimiento
  where movimiento.cuenta_codigo = '6.1.01.2.13.01'
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
  coalesce(contable.transporte_contable, 0)::numeric(18,2)
    as transporte_contable,
  coalesce(asignado.transporte_asignado, 0)::numeric(18,2)
    as transporte_asignado,
  greatest(
    coalesce(detalle.transporte_detallado, 0)
      - coalesce(asignado.transporte_asignado, 0),
    0
  )::numeric(18,2) as transporte_no_atribuido,
  coalesce(margen.ventas_netas, 0)::numeric(18,2)
    as ventas_netas_contables,
  case
    when coalesce(margen.ventas_netas, 0) <> 0
      then coalesce(contable.transporte_contable, 0)
        / margen.ventas_netas * 100
    else null
  end::numeric(18,4) as transporte_pct_ventas,
  coalesce(detalle.movimientos_transporte, 0)::integer
    as facturas_transporte,
  0::integer as facturas_periodo_por_confirmar,
  (
    coalesce(contable.transporte_contable, 0)
      - coalesce(detalle.transporte_detallado, 0)
  )::numeric(18,2) as transporte_diferencia_conciliar
from meses mes
left join contable on contable.periodo = mes.periodo
left join detalle on detalle.periodo = mes.periodo
left join asignado on asignado.periodo = mes.periodo
left join public.fin_vw_margen_bruto_mensual margen
  on margen.periodo = mes.periodo
order by mes.periodo;

comment on view public.fin_vw_transporte_cliente_clasificado is
  'Transporte por cliente desde la clasificacion guardada en Gastos y costos.';

comment on view public.fin_vw_transporte_resumen_clasificado is
  'Concilia transporte contable, detalle clasificado y asignacion a clientes desde una misma fuente.';

grant select on public.fin_vw_transporte_cliente_clasificado to authenticated;
grant select on public.fin_vw_transporte_resumen_clasificado to authenticated;

revoke all on public.fin_vw_transporte_cliente_clasificado from anon;
revoke all on public.fin_vw_transporte_resumen_clasificado from anon;

commit;

notify pgrst, 'reload schema';
