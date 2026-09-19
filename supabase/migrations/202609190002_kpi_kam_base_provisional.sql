-- CIBUSPAN ONE
-- KPI KAM - fuente provisional mensual por cliente.
--
-- Consolida fuentes existentes sin duplicarlas. El resultado sigue siendo
-- provisional: los cierres mensuales se implementan en una fase posterior.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtext('CIBUSPAN_ONE_KPI_KAM_BASE_V1'));

create or replace function public.com_kpi_kam_base_provisional(
  p_periodo date,
  p_kam_user_id uuid default null,
  p_cliente_id uuid default null
)
returns table (
  periodo date,
  kam_user_id uuid,
  cliente_id uuid,
  cliente_nombre text,
  venta_bruta numeric,
  venta_facturada_neta numeric,
  devoluciones_valor numeric,
  ajustes_venta_neta numeric,
  fugas_comerciales_valor numeric,
  presupuesto numeric,
  costo_producto numeric,
  transporte numeric,
  costos_variables_comerciales numeric,
  promociones_costo_adicional numeric,
  contribucion_anterior numeric,
  posiciones_sku_local_activas integer,
  posiciones_sku_local_objetivo integer,
  compromisos_cumplidos_a_tiempo integer,
  compromisos_con_vencimiento integer,
  advertencias text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde date;
  v_hasta date;
  v_anterior date;
  v_rol text;
  v_usuario uuid;
begin
  v_usuario := auth.uid();

  if v_usuario is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;

  if p_periodo is null or extract(day from p_periodo) <> 1 then
    raise exception 'El periodo debe ser el primer día del mes.' using errcode = '22023';
  end if;

  select perfil.rol
  into v_rol
  from public.app_profiles perfil
  where perfil.user_id = v_usuario
    and perfil.activo;

  if v_rol is null then
    raise exception 'El perfil de usuario no está activo.' using errcode = '42501';
  end if;

  if not public.app_puede_alguna(
    array['KPI KAM', 'Reportes', 'Administración']
  ) then
    raise exception 'No tienes permiso para consultar KPI KAM.' using errcode = '42501';
  end if;

  if v_rol = 'KAM' and p_kam_user_id is not null
     and p_kam_user_id <> v_usuario then
    raise exception 'Un KAM solo puede consultar sus propios clientes.' using errcode = '42501';
  end if;

  v_desde := p_periodo;
  v_hasta := (p_periodo + interval '1 month - 1 day')::date;
  v_anterior := (p_periodo - interval '1 year')::date;

  return query
  with asignaciones as (
    select distinct on (asignacion.cliente_id)
      asignacion.cliente_id,
      asignacion.kam_user_id
    from public.com_kam_clientes asignacion
    where asignacion.activo
      and asignacion.vigente_desde <= v_hasta
      and (
        asignacion.vigente_hasta is null
        or asignacion.vigente_hasta >= v_desde
      )
      and (
        case when v_rol = 'KAM'
          then asignacion.kam_user_id = v_usuario
          else p_kam_user_id is null
            or asignacion.kam_user_id = p_kam_user_id
        end
      )
      and (p_cliente_id is null or asignacion.cliente_id = p_cliente_id)
    order by asignacion.cliente_id, asignacion.vigente_desde desc
  ),
  ventas_periodos as (
    select
      date_trunc('month', venta.fecha_emision)::date as periodo_venta,
      venta.cliente_id,
      sum(
        coalesce(venta.total_sin_impuestos, 0)
        + coalesce(venta.descuento, 0) * coalesce(venta.cantidad, 0)
      )::numeric as venta_bruta,
      sum(coalesce(venta.total_sin_impuestos, 0))::numeric
        as venta_facturada_neta,
      sum(
        case
          when costo.producto_id is not null
            and coalesce(costo.items_sin_costo, 0) = 0
          then coalesce(venta.cantidad, 0)
            * coalesce(costo.costo_materiales_unidad, 0)
          else 0
        end
      )::numeric as costo_materiales,
      count(*) filter (
        where costo.producto_id is null
           or coalesce(costo.items_sin_costo, 0) > 0
      )::integer as lineas_sin_costo,
      sum(
        coalesce(venta.cantidad, 0)
        * case
            when coalesce(costo.rendimiento_unidades, 0) > 0
            then coalesce(costo.batch_calculado_kg, 0)
              / costo.rendimiento_unidades
            else 0
          end
      )::numeric as kg_equivalente
    from public.com_ventas_detalle venta
    left join public.fm_vw_productos_costo_completo costo
      on costo.producto_id = venta.producto_id
    where venta.cliente_id in (select a.cliente_id from asignaciones a)
      and venta.fecha_emision >= v_anterior
      and venta.fecha_emision <= v_hasta
      and extract(month from venta.fecha_emision) = extract(month from v_desde)
    group by date_trunc('month', venta.fecha_emision)::date, venta.cliente_id
  ),
  kg_periodo as (
    select
      date_trunc('month', venta.fecha_emision)::date as periodo_venta,
      sum(
        coalesce(venta.cantidad, 0)
        * case
            when coalesce(costo.rendimiento_unidades, 0) > 0
            then coalesce(costo.batch_calculado_kg, 0)
              / costo.rendimiento_unidades
            else 0
          end
      )::numeric as kg_total
    from public.com_ventas_detalle venta
    left join public.fm_vw_productos_costo_completo costo
      on costo.producto_id = venta.producto_id
    where venta.fecha_emision >= v_anterior
      and venta.fecha_emision <= v_hasta
      and extract(month from venta.fecha_emision) = extract(month from v_desde)
    group by date_trunc('month', venta.fecha_emision)::date
  ),
  mod_periodo as (
    select
      nomina.periodo,
      sum(coalesce(nomina.costo_empresa, 0))::numeric as costo_mod
    from public.fin_vw_nomina_mensual_area nomina
    where nomina.area = 'MANO_OBRA_DIRECTA'
      and nomina.periodo in (v_desde, v_anterior)
    group by nomina.periodo
  ),
  devoluciones_periodos as (
    select
      date_trunc('month', devolucion.fecha_devolucion)::date as periodo_devolucion,
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
    where devolucion.cliente_id in (select a.cliente_id from asignaciones a)
      and devolucion.fecha_devolucion >= v_anterior
      and devolucion.fecha_devolucion <= v_hasta
      and extract(month from devolucion.fecha_devolucion) = extract(month from v_desde)
    group by date_trunc('month', devolucion.fecha_devolucion)::date,
      devolucion.cliente_id
  ),
  ajustes_periodos as (
    select
      date_trunc('month', ajuste.fecha_documento)::date as periodo_ajuste,
      ajuste.cliente_id,
      sum(ajuste.valor) filter (
        where categoria.afecta_venta_neta
          and not categoria.afecta_devoluciones
      )::numeric as afecta_venta_neta,
      sum(ajuste.valor) filter (
        where categoria.afecta_fugas
      )::numeric as fugas
    from public.com_ajustes_comerciales ajuste
    join public.com_ajuste_categorias categoria
      on categoria.id = ajuste.categoria_id
    where ajuste.estado = 'ACTIVO'
      and ajuste.cliente_id in (select a.cliente_id from asignaciones a)
      and ajuste.fecha_documento >= v_anterior
      and ajuste.fecha_documento <= v_hasta
      and extract(month from ajuste.fecha_documento) = extract(month from v_desde)
    group by date_trunc('month', ajuste.fecha_documento)::date,
      ajuste.cliente_id
  ),
  fugas_descuentos as (
    select
      date_trunc('month', venta.fecha_emision)::date as periodo_descuento,
      venta.cliente_id,
      sum(coalesce(venta.descuento, 0) * coalesce(venta.cantidad, 0))::numeric
        as valor
    from public.com_ventas_detalle venta
    join public.com_venta_descuento_clasificaciones clasificacion
      on clasificacion.venta_detalle_id = venta.id
    join public.com_ajuste_categorias categoria
      on categoria.id = clasificacion.categoria_id
    where categoria.afecta_fugas
      and venta.cliente_id in (select a.cliente_id from asignaciones a)
      and venta.fecha_emision >= v_anterior
      and venta.fecha_emision <= v_hasta
      and extract(month from venta.fecha_emision) = extract(month from v_desde)
    group by date_trunc('month', venta.fecha_emision)::date, venta.cliente_id
  ),
  transporte_periodos as (
    select
      transporte.periodo,
      transporte.cliente_id,
      sum(coalesce(transporte.gasto_transporte, 0))::numeric as valor
    from public.fin_vw_transporte_cliente_mensual transporte
    where transporte.cliente_id in (select a.cliente_id from asignaciones a)
      and transporte.periodo in (v_desde, v_anterior)
    group by transporte.periodo, transporte.cliente_id
  ),
  gastos_periodos as (
    select
      gasto.mes as periodo_gasto,
      gasto.cliente_id,
      sum(coalesce(gasto.gasto_sin_iva, 0)) filter (
        where gasto.cuenta_codigo not in ('6.1.01.2.13.01', '6.1.01.2.13.02')
      )::numeric as valor
    from public.fin_vw_gastos_cliente_mensuales gasto
    where gasto.cliente_id in (select a.cliente_id from asignaciones a)
      and gasto.mes in (v_desde, v_anterior)
    group by gasto.mes, gasto.cliente_id
  ),
  rentabilidad as (
    select
      venta.periodo_venta,
      venta.cliente_id,
      venta.venta_bruta,
      venta.venta_facturada_neta,
      venta.lineas_sin_costo,
      case
        when venta.lineas_sin_costo > 0 then null
        when coalesce(kg.kg_total, 0) <= 0
          and coalesce(mod.costo_mod, 0) > 0 then null
        else venta.costo_materiales
          + case
              when coalesce(kg.kg_total, 0) > 0
              then coalesce(mod.costo_mod, 0)
                * venta.kg_equivalente / kg.kg_total
              else 0
            end
      end::numeric as costo_producto,
      coalesce(transporte.valor, 0)::numeric as transporte,
      coalesce(gasto.valor, 0)::numeric as costos_variables_comerciales,
      coalesce(devolucion.valor, 0)::numeric as devoluciones,
      coalesce(ajuste.afecta_venta_neta, 0)::numeric as ajustes,
      (
        coalesce(ajuste.fugas, 0)
        + coalesce(fuga_descuento.valor, 0)
      )::numeric as fugas
    from ventas_periodos venta
    left join kg_periodo kg
      on kg.periodo_venta = venta.periodo_venta
    left join mod_periodo mod
      on mod.periodo = venta.periodo_venta
    left join devoluciones_periodos devolucion
      on devolucion.periodo_devolucion = venta.periodo_venta
     and devolucion.cliente_id = venta.cliente_id
    left join ajustes_periodos ajuste
      on ajuste.periodo_ajuste = venta.periodo_venta
     and ajuste.cliente_id = venta.cliente_id
    left join fugas_descuentos fuga_descuento
      on fuga_descuento.periodo_descuento = venta.periodo_venta
     and fuga_descuento.cliente_id = venta.cliente_id
    left join transporte_periodos transporte
      on transporte.periodo = venta.periodo_venta
     and transporte.cliente_id = venta.cliente_id
    left join gastos_periodos gasto
      on gasto.periodo_gasto = venta.periodo_venta
     and gasto.cliente_id = venta.cliente_id
  ),
  contribucion_anterior as (
    select
      rentabilidad.cliente_id,
      case when rentabilidad.costo_producto is null then null
      else (
        rentabilidad.venta_facturada_neta
        - rentabilidad.devoluciones
        - rentabilidad.ajustes
        - rentabilidad.costo_producto
        - rentabilidad.transporte
        - rentabilidad.costos_variables_comerciales
      ) end::numeric as valor
    from rentabilidad
    where rentabilidad.periodo_venta = v_anterior
  ),
  cobertura as (
    select
      cobertura.cliente_id,
      count(*) filter (where cobertura.es_objetivo)::integer as objetivo,
      count(*) filter (
        where cobertura.es_objetivo and cobertura.estado = 'ACTIVO'
      )::integer as activas
    from public.com_cobertura_sku_local cobertura
    where cobertura.cliente_id in (select a.cliente_id from asignaciones a)
      and cobertura.vigente_desde <= v_hasta
      and (
        cobertura.vigente_hasta is null
        or cobertura.vigente_hasta >= v_hasta
      )
    group by cobertura.cliente_id
  ),
  compromisos as (
    select
      compromiso.cliente_id,
      count(*) filter (where compromiso.estado <> 'CANCELADO')::integer
        as vencimiento,
      count(*) filter (
        where compromiso.estado = 'CUMPLIDO'
          and compromiso.fecha_cumplimiento <= compromiso.fecha_limite
      )::integer as cumplidos
    from public.com_compromisos compromiso
    where compromiso.cliente_id in (select a.cliente_id from asignaciones a)
      and compromiso.fecha_limite between v_desde and v_hasta
    group by compromiso.cliente_id
  )
  select
    v_desde as periodo,
    asignacion.kam_user_id,
    cliente.id as cliente_id,
    cliente.nombre as cliente_nombre,
    coalesce(actual.venta_bruta, 0)::numeric as venta_bruta,
    coalesce(actual.venta_facturada_neta, 0)::numeric as venta_facturada_neta,
    coalesce(actual.devoluciones, 0)::numeric as devoluciones_valor,
    coalesce(actual.ajustes, 0)::numeric as ajustes_venta_neta,
    coalesce(actual.fugas, 0)::numeric as fugas_comerciales_valor,
    presupuesto.presupuesto::numeric,
    actual.costo_producto::numeric,
    actual.transporte::numeric,
    actual.costos_variables_comerciales::numeric,
    0::numeric as promociones_costo_adicional,
    anterior.valor::numeric as contribucion_anterior,
    coalesce(cobertura.activas, 0)::integer as posiciones_sku_local_activas,
    coalesce(cobertura.objetivo, 0)::integer as posiciones_sku_local_objetivo,
    coalesce(compromisos.cumplidos, 0)::integer
      as compromisos_cumplidos_a_tiempo,
    coalesce(compromisos.vencimiento, 0)::integer
      as compromisos_con_vencimiento,
    array_remove(array[
      case when actual.cliente_id is null
        then 'No existen ventas para el cliente en el periodo.' end,
      case when presupuesto.id is null
        then 'Falta presupuesto mensual.' end,
      case when actual.lineas_sin_costo > 0
        then format('%s líneas de venta no tienen costo completo.', actual.lineas_sin_costo) end,
      case when actual.costo_producto is null and actual.cliente_id is not null
        then 'No se pudo completar el costo de producto y MOD.' end,
      case when cobertura.objetivo is null or cobertura.objetivo = 0
        then 'Falta configurar cobertura SKU-local.' end,
      case when compromisos.vencimiento is null or compromisos.vencimiento = 0
        then 'No existen compromisos con vencimiento en el periodo.' end,
      case when anterior.valor is null
        then 'Falta contribución comparable del mismo mes del año anterior.' end
    ]::text[], null)::text[] as advertencias
  from asignaciones asignacion
  join public.clientes cliente
    on cliente.id = asignacion.cliente_id
  left join rentabilidad actual
    on actual.cliente_id = asignacion.cliente_id
   and actual.periodo_venta = v_desde
  left join contribucion_anterior anterior
    on anterior.cliente_id = asignacion.cliente_id
  left join public.com_presupuestos_mensuales presupuesto
    on presupuesto.periodo = v_desde
   and presupuesto.cliente_id = asignacion.cliente_id
  left join cobertura
    on cobertura.cliente_id = asignacion.cliente_id
  left join compromisos
    on compromisos.cliente_id = asignacion.cliente_id
  order by cliente.nombre;
end;
$$;

comment on function public.com_kpi_kam_base_provisional(date, uuid, uuid) is
  'Consolida las fuentes mensuales reales por cliente para el cálculo provisional KPI KAM.';

revoke all on function public.com_kpi_kam_base_provisional(date, uuid, uuid)
  from public, anon;
grant execute on function public.com_kpi_kam_base_provisional(date, uuid, uuid)
  to authenticated;

commit;

notify pgrst, 'reload schema';
