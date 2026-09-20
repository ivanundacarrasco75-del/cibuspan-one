-- CIBUSPAN ONE
-- KPI KAM - propuesta de presupuesto basada en tres meses cerrados.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtext('CIBUSPAN_ONE_KPI_KAM_PRESUPUESTO_V1'));

create or replace function public.com_kpi_kam_propuesta_presupuesto(
  p_periodo date
)
returns table (
  cliente_id uuid,
  periodo_desde date,
  periodo_hasta date,
  meses_base integer,
  meses_con_ventas integer,
  venta_facturada_promedio numeric,
  devoluciones_promedio numeric,
  ajustes_promedio numeric,
  venta_neta_promedio numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_ultimo_mes date;
  v_primer_mes date;
  v_hasta date;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;

  if p_periodo is null or extract(day from p_periodo) <> 1 then
    raise exception 'El periodo debe ser el primer día del mes.' using errcode = '22023';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid()
    and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE') then
    raise exception 'Solo gerencia puede calcular propuestas de presupuesto.'
      using errcode = '42501';
  end if;

  v_ultimo_mes := least(
    (p_periodo - interval '1 month')::date,
    (date_trunc('month', current_date) - interval '1 month')::date
  );
  v_primer_mes := (v_ultimo_mes - interval '2 months')::date;
  v_hasta := (v_ultimo_mes + interval '1 month - 1 day')::date;

  return query
  with meses as (
    select generate_series(
      v_primer_mes,
      v_ultimo_mes,
      interval '1 month'
    )::date as periodo
  ),
  clientes_activos as (
    select cliente.id
    from public.clientes cliente
    where cliente.activo
  ),
  ventas as (
    select
      date_trunc('month', venta.fecha_emision)::date as periodo,
      venta.cliente_id,
      sum(coalesce(venta.total_sin_impuestos, 0))::numeric as valor
    from public.com_ventas_detalle venta
    where venta.fecha_emision >= v_primer_mes
      and venta.fecha_emision <= v_hasta
      and venta.cliente_id in (select activo.id from clientes_activos activo)
    group by date_trunc('month', venta.fecha_emision)::date, venta.cliente_id
  ),
  devoluciones as (
    select
      date_trunc('month', devolucion.fecha_devolucion)::date as periodo,
      devolucion.cliente_id,
      sum(
        coalesce(
          detalle.valor_total_documento,
          detalle.unidades * detalle.precio_unitario_documento,
          0
        )
      )::numeric as valor
    from public.devoluciones devolucion
    join public.devolucion_detalles detalle
      on detalle.devolucion_id = devolucion.id
    where devolucion.fecha_devolucion >= v_primer_mes
      and devolucion.fecha_devolucion <= v_hasta
      and devolucion.cliente_id in (select activo.id from clientes_activos activo)
    group by date_trunc('month', devolucion.fecha_devolucion)::date,
      devolucion.cliente_id
  ),
  ajustes as (
    select
      date_trunc('month', ajuste.fecha_documento)::date as periodo,
      ajuste.cliente_id,
      sum(ajuste.valor)::numeric as valor
    from public.com_ajustes_comerciales ajuste
    join public.com_ajuste_categorias categoria
      on categoria.id = ajuste.categoria_id
    where ajuste.estado = 'ACTIVO'
      and categoria.afecta_venta_neta
      and not categoria.afecta_devoluciones
      and ajuste.fecha_documento >= v_primer_mes
      and ajuste.fecha_documento <= v_hasta
      and ajuste.cliente_id in (select activo.id from clientes_activos activo)
    group by date_trunc('month', ajuste.fecha_documento)::date,
      ajuste.cliente_id
  ),
  base as (
    select
      activo.id as cliente_id,
      mes.periodo,
      coalesce(venta.valor, 0)::numeric as venta_facturada,
      coalesce(devolucion.valor, 0)::numeric as devoluciones,
      coalesce(ajuste.valor, 0)::numeric as ajustes
    from clientes_activos activo
    cross join meses mes
    left join ventas venta
      on venta.cliente_id = activo.id
     and venta.periodo = mes.periodo
    left join devoluciones devolucion
      on devolucion.cliente_id = activo.id
     and devolucion.periodo = mes.periodo
    left join ajustes ajuste
      on ajuste.cliente_id = activo.id
     and ajuste.periodo = mes.periodo
  )
  select
    base.cliente_id,
    v_primer_mes as periodo_desde,
    v_hasta as periodo_hasta,
    3::integer as meses_base,
    count(*) filter (where base.venta_facturada > 0)::integer
      as meses_con_ventas,
    round(avg(base.venta_facturada), 2)::numeric
      as venta_facturada_promedio,
    round(avg(base.devoluciones), 2)::numeric
      as devoluciones_promedio,
    round(avg(base.ajustes), 2)::numeric
      as ajustes_promedio,
    greatest(
      0,
      round(avg(
        base.venta_facturada - base.devoluciones - base.ajustes
      ), 2)
    )::numeric as venta_neta_promedio
  from base
  group by base.cliente_id
  order by base.cliente_id;
end;
$$;

comment on function public.com_kpi_kam_propuesta_presupuesto(date) is
  'Calcula por cliente el promedio mensual neto de los últimos tres meses cerrados disponibles.';

revoke all on function public.com_kpi_kam_propuesta_presupuesto(date)
  from public, anon;
grant execute on function public.com_kpi_kam_propuesta_presupuesto(date)
  to authenticated;

commit;

notify pgrst, 'reload schema';
