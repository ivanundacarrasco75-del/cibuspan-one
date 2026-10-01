-- CIBUSPAN ONE
-- Corrige Gestion Comercial para que ventas y devoluciones se lean directamente
-- de sus fuentes oficiales, sin multiplicarse por las filas de costeo.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_GESTION_COMERCIAL_FUENTES_REALES_V2')
);

create or replace function public.com_gestion_comercial_dashboard_v2(
  p_periodo date,
  p_kam_user_id uuid default null,
  p_cliente_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde date;
  v_hasta date;
  v_desde_anterior date;
  v_hasta_anterior date;
  v_resultado jsonb;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.' using errcode = '42501';
  end if;

  if p_periodo is null or extract(day from p_periodo) <> 1 then
    raise exception 'El periodo debe ser el primer dia del mes.' using errcode = '22023';
  end if;

  if not public.app_puede_alguna(array['KPI KAM', 'Reportes', 'Administración']) then
    raise exception 'No tienes permiso para consultar Gestion Comercial.' using errcode = '42501';
  end if;

  v_desde := p_periodo;
  v_hasta := (p_periodo + interval '1 month - 1 day')::date;
  v_desde_anterior := (p_periodo - interval '1 month')::date;
  v_hasta_anterior := (p_periodo - interval '1 day')::date;

  with cartera as (
    select
      cliente.id as cliente_id,
      cliente.nombre as cliente_nombre,
      asignacion.kam_user_id
    from public.clientes cliente
    left join lateral (
      select cartera.kam_user_id
      from public.com_kam_clientes cartera
      where cartera.cliente_id = cliente.id
        and cartera.activo
        and cartera.vigente_desde <= v_hasta
        and (cartera.vigente_hasta is null or cartera.vigente_hasta >= v_desde)
      order by cartera.vigente_desde desc
      limit 1
    ) asignacion on true
    where cliente.activo
      and public.com_puede_ver_cliente_kpi(cliente.id, auth.uid())
      and (
        asignacion.kam_user_id is not null
        or exists (
          select 1
          from public.com_ventas_detalle venta
          where venta.cliente_id = cliente.id
            and venta.fecha_emision between v_desde_anterior and v_hasta
        )
        or exists (
          select 1
          from public.com_locales_monitoreados local
          where local.cliente_id = cliente.id and local.activo
        )
        or upper(cliente.nombre) like '%FAVORITA%'
        or upper(cliente.nombre) like '%SANTAMARIA%'
        or upper(cliente.nombre) like '%SANTA MARIA%'
        or upper(cliente.nombre) like '%ROSADO%'
        or upper(cliente.nombre) like '%TUTI%'
      )
      and (p_kam_user_id is null or asignacion.kam_user_id = p_kam_user_id)
      and (p_cliente_id is null or cliente.id = p_cliente_id)
  ),
  ventas as (
    select
      venta.cliente_id,
      coalesce(sum(
        coalesce(venta.total_sin_impuestos, 0)
        + coalesce(venta.descuento, 0) * coalesce(venta.cantidad, 0)
      ) filter (where venta.fecha_emision between v_desde and v_hasta), 0)::numeric
        as venta_bruta,
      coalesce(sum(coalesce(venta.total_sin_impuestos, 0)) filter (
        where venta.fecha_emision between v_desde and v_hasta
      ), 0)::numeric as venta_facturada,
      coalesce(sum(coalesce(venta.total_sin_impuestos, 0)) filter (
        where venta.fecha_emision between v_desde_anterior and v_hasta_anterior
      ), 0)::numeric as venta_facturada_anterior
    from public.com_ventas_detalle venta
    where venta.cliente_id in (select cliente_id from cartera)
      and venta.fecha_emision between v_desde_anterior and v_hasta
    group by venta.cliente_id
  ),
  devoluciones as (
    select
      devolucion.cliente_id,
      coalesce(sum(coalesce(
        detalle.valor_total_documento,
        detalle.unidades * detalle.precio_unitario_documento,
        0
      )) filter (
        where devolucion.fecha_devolucion between v_desde and v_hasta
      ), 0)::numeric as valor,
      coalesce(sum(coalesce(
        detalle.valor_total_documento,
        detalle.unidades * detalle.precio_unitario_documento,
        0
      )) filter (
        where devolucion.fecha_devolucion between v_desde_anterior and v_hasta_anterior
      ), 0)::numeric as valor_anterior
    from public.devoluciones devolucion
    join public.devolucion_detalles detalle on detalle.devolucion_id = devolucion.id
    where devolucion.cliente_id in (select cliente_id from cartera)
      and devolucion.fecha_devolucion between v_desde_anterior and v_hasta
    group by devolucion.cliente_id
  ),
  ajustes as (
    select
      ajuste.cliente_id,
      coalesce(sum(ajuste.valor) filter (
        where ajuste.fecha_documento between v_desde and v_hasta
          and categoria.afecta_venta_neta
          and not categoria.afecta_devoluciones
      ), 0)::numeric as valor,
      coalesce(sum(ajuste.valor) filter (
        where ajuste.fecha_documento between v_desde_anterior and v_hasta_anterior
          and categoria.afecta_venta_neta
          and not categoria.afecta_devoluciones
      ), 0)::numeric as valor_anterior
    from public.com_ajustes_comerciales ajuste
    join public.com_ajuste_categorias categoria on categoria.id = ajuste.categoria_id
    where ajuste.estado = 'ACTIVO'
      and ajuste.cliente_id in (select cliente_id from cartera)
      and ajuste.fecha_documento between v_desde_anterior and v_hasta
    group by ajuste.cliente_id
  ),
  cobertura_actual as (
    select
      cobertura.cliente_id,
      count(*) filter (
        where cobertura.es_objetivo
          and cobertura.estado = 'ACTIVO'
          and cobertura.reportado_ultimo is distinct from false
      )::integer as posiciones_activas,
      count(*) filter (where cobertura.es_objetivo)::integer as posiciones_objetivo,
      count(distinct cobertura.producto_id) filter (
        where cobertura.estado = 'ACTIVO'
          and cobertura.reportado_ultimo is distinct from false
      )::integer as sku_codificados,
      count(distinct cobertura.producto_id) filter (
        where cobertura.estado in ('DESCODIFICADO', 'SUSPENDIDO', 'INACTIVO')
      )::integer as sku_descodificados,
      count(distinct cobertura.producto_id) filter (
        where cobertura.estado = 'PENDIENTE'
      )::integer as sku_pendientes
    from public.com_cobertura_sku_local cobertura
    where cobertura.cliente_id in (select cliente_id from cartera)
      and cobertura.vigente_desde <= v_hasta
      and (cobertura.vigente_hasta is null or cobertura.vigente_hasta >= v_hasta)
    group by cobertura.cliente_id
  ),
  locales_monitoreados as (
    select local.cliente_id, count(*)::integer as locales
    from public.com_locales_monitoreados local
    where local.activo
      and local.cliente_id in (select cliente_id from cartera)
    group by local.cliente_id
  ),
  cambios_cobertura as (
    select
      cobertura.cliente_id,
      count(*) filter (
        where cobertura.estado = 'ACTIVO'
          and exists (
            select 1
            from public.com_cobertura_sku_local anterior
            where anterior.cliente_id = cobertura.cliente_id
              and anterior.producto_id = cobertura.producto_id
              and anterior.bodega_id is not distinct from cobertura.bodega_id
              and anterior.local_monitoreado_id is not distinct from cobertura.local_monitoreado_id
              and anterior.vigente_hasta = cobertura.vigente_desde - 1
              and anterior.estado <> 'ACTIVO'
          )
      )::integer as codificaciones_nuevas,
      count(*) filter (
        where cobertura.estado in ('DESCODIFICADO', 'SUSPENDIDO', 'INACTIVO')
          and exists (
            select 1
            from public.com_cobertura_sku_local anterior
            where anterior.cliente_id = cobertura.cliente_id
              and anterior.producto_id = cobertura.producto_id
              and anterior.bodega_id is not distinct from cobertura.bodega_id
              and anterior.local_monitoreado_id is not distinct from cobertura.local_monitoreado_id
              and anterior.vigente_hasta = cobertura.vigente_desde - 1
              and anterior.estado = 'ACTIVO'
          )
      )::integer as descodificaciones
    from public.com_cobertura_sku_local cobertura
    where cobertura.cliente_id in (select cliente_id from cartera)
      and cobertura.vigente_desde between v_desde and v_hasta
    group by cobertura.cliente_id
  ),
  ultima_revision_campo as (
    select distinct on (
      visita.cliente_id,
      visita.local_monitoreado_id,
      detalle.producto_id
    )
      visita.cliente_id,
      visita.local_monitoreado_id,
      detalle.producto_id,
      detalle.stock_local_unidades,
      detalle.codificado_app,
      visita.visitado_en
    from public.com_visitas_campo visita
    join public.com_visitas_campo_sku detalle on detalle.visita_id = visita.id
    where visita.estado = 'CONFIRMADA'
      and visita.fecha_visita <= v_hasta
      and visita.cliente_id in (select cliente_id from cartera)
    order by
      visita.cliente_id,
      visita.local_monitoreado_id,
      detalle.producto_id,
      visita.visitado_en desc
  ),
  quiebres as (
    select
      revision.cliente_id,
      count(*) filter (
        where revision.stock_local_unidades is not null
          and revision.stock_local_unidades <= 0
          and revision.codificado_app is distinct from false
      )::integer as quiebres_detectados
    from ultima_revision_campo revision
    group by revision.cliente_id
  ),
  acciones as (
    select
      compromiso.cliente_id,
      count(*) filter (
        where compromiso.estado in ('PENDIENTE', 'EN_GESTION')
          and compromiso.fecha_limite >= least(current_date, v_hasta)
      )::integer as acciones_pendientes,
      count(*) filter (
        where compromiso.estado in ('PENDIENTE', 'EN_GESTION')
          and compromiso.fecha_limite < least(current_date, v_hasta)
      )::integer as acciones_vencidas
    from public.com_compromisos compromiso
    where compromiso.cliente_id in (select cliente_id from cartera)
      and compromiso.fecha_creacion <= v_hasta
    group by compromiso.cliente_id
  ),
  clientes_metricas as (
    select
      cartera.cliente_id,
      cartera.cliente_nombre,
      cartera.kam_user_id,
      coalesce(ventas.venta_bruta, 0)::numeric as venta_bruta,
      (
        coalesce(ventas.venta_facturada, 0)
        - coalesce(devoluciones.valor, 0)
        - coalesce(ajustes.valor, 0)
      )::numeric as venta_neta,
      (
        coalesce(ventas.venta_facturada_anterior, 0)
        - coalesce(devoluciones.valor_anterior, 0)
        - coalesce(ajustes.valor_anterior, 0)
      )::numeric as venta_neta_anterior,
      coalesce(devoluciones.valor, 0)::numeric as devoluciones,
      case when coalesce(ventas.venta_bruta, 0) > 0
        then round(coalesce(devoluciones.valor, 0) / ventas.venta_bruta * 100, 2)
        else 0 end::numeric as devoluciones_pct,
      null::numeric as margen_comercial_pct,
      coalesce(cobertura.posiciones_activas, 0)::integer as posiciones_activas,
      coalesce(cobertura.posiciones_objetivo, 0)::integer as posiciones_objetivo,
      coalesce(locales.locales, 0)::integer as locales,
      coalesce(cobertura.sku_codificados, 0)::integer as sku_codificados,
      coalesce(cobertura.sku_descodificados, 0)::integer as sku_descodificados,
      coalesce(cobertura.sku_pendientes, 0)::integer as sku_pendientes,
      coalesce(quiebres.quiebres_detectados, 0)::integer as quiebres_detectados,
      coalesce(cambios.codificaciones_nuevas, 0)::integer as codificaciones_nuevas,
      coalesce(cambios.descodificaciones, 0)::integer as descodificaciones,
      coalesce(acciones.acciones_pendientes, 0)::integer as acciones_pendientes,
      coalesce(acciones.acciones_vencidas, 0)::integer as acciones_vencidas
    from cartera
    left join ventas on ventas.cliente_id = cartera.cliente_id
    left join devoluciones on devoluciones.cliente_id = cartera.cliente_id
    left join ajustes on ajustes.cliente_id = cartera.cliente_id
    left join cobertura_actual cobertura on cobertura.cliente_id = cartera.cliente_id
    left join locales_monitoreados locales on locales.cliente_id = cartera.cliente_id
    left join cambios_cobertura cambios on cambios.cliente_id = cartera.cliente_id
    left join quiebres on quiebres.cliente_id = cartera.cliente_id
    left join acciones on acciones.cliente_id = cartera.cliente_id
  ),
  clientes_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', metrica.cliente_id,
        'nombre', metrica.cliente_nombre,
        'kam_user_id', metrica.kam_user_id,
        'venta_bruta', metrica.venta_bruta,
        'venta_neta', metrica.venta_neta,
        'venta_neta_anterior', metrica.venta_neta_anterior,
        'variacion_pct', case when metrica.venta_neta_anterior <> 0
          then round((metrica.venta_neta - metrica.venta_neta_anterior)
            / abs(metrica.venta_neta_anterior) * 100, 2)
          else null end,
        'devoluciones', metrica.devoluciones,
        'devoluciones_pct', metrica.devoluciones_pct,
        'margen_comercial_pct', metrica.margen_comercial_pct,
        'locales', metrica.locales,
        'sku_codificados', metrica.sku_codificados,
        'sku_descodificados', metrica.sku_descodificados,
        'sku_pendientes', metrica.sku_pendientes,
        'cobertura_pct', case when metrica.posiciones_objetivo > 0
          then round(metrica.posiciones_activas::numeric / metrica.posiciones_objetivo * 100, 2)
          else null end,
        'quiebres_detectados', metrica.quiebres_detectados,
        'codificaciones_nuevas', metrica.codificaciones_nuevas,
        'descodificaciones', metrica.descodificaciones,
        'acciones_pendientes', metrica.acciones_pendientes,
        'acciones_vencidas', metrica.acciones_vencidas,
        'ventas_sku', coalesce((
          select jsonb_agg(jsonb_build_object(
            'producto_id', fila.producto_id,
            'sku', fila.sku,
            'producto', fila.producto,
            'venta_actual', fila.venta_actual,
            'venta_anterior', fila.venta_anterior,
            'variacion_pct', case when fila.venta_anterior <> 0
              then round((fila.venta_actual - fila.venta_anterior)
                / abs(fila.venta_anterior) * 100, 2)
              else null end
          ) order by fila.venta_actual desc)
          from (
            select
              venta.producto_id,
              venta.sku,
              coalesce(producto.nombre, venta.producto_nombre, venta.sku) as producto,
              coalesce(sum(venta.total_sin_impuestos) filter (
                where venta.fecha_emision between v_desde and v_hasta
              ), 0)::numeric as venta_actual,
              coalesce(sum(venta.total_sin_impuestos) filter (
                where venta.fecha_emision between v_desde_anterior and v_hasta_anterior
              ), 0)::numeric as venta_anterior
            from public.com_ventas_detalle venta
            left join public.productos producto on producto.id = venta.producto_id
            where venta.cliente_id = metrica.cliente_id
              and venta.fecha_emision between v_desde_anterior and v_hasta
            group by venta.producto_id, venta.sku,
              coalesce(producto.nombre, venta.producto_nombre, venta.sku)
            order by coalesce(sum(venta.total_sin_impuestos) filter (
              where venta.fecha_emision between v_desde and v_hasta
            ), 0) desc
            limit 15
          ) fila
        ), '[]'::jsonb),
        'devoluciones_sku', coalesce((
          select jsonb_agg(jsonb_build_object(
            'producto_id', fila.producto_id,
            'producto', fila.producto,
            'valor', fila.valor,
            'unidades', fila.unidades
          ) order by fila.valor desc)
          from (
            select
              detalle.producto_id,
              coalesce(producto.nombre, detalle.producto_nombre_documento, detalle.sku_documento, 'Sin SKU') as producto,
              sum(coalesce(
                detalle.valor_total_documento,
                detalle.unidades * detalle.precio_unitario_documento,
                0
              ))::numeric as valor,
              sum(coalesce(detalle.unidades, 0))::numeric as unidades
            from public.devoluciones devolucion
            join public.devolucion_detalles detalle on detalle.devolucion_id = devolucion.id
            left join public.productos producto on producto.id = detalle.producto_id
            where devolucion.cliente_id = metrica.cliente_id
              and devolucion.fecha_devolucion between v_desde and v_hasta
            group by detalle.producto_id,
              coalesce(producto.nombre, detalle.producto_nombre_documento, detalle.sku_documento, 'Sin SKU')
            order by valor desc
            limit 10
          ) fila
        ), '[]'::jsonb),
        'devoluciones_local', coalesce((
          select jsonb_agg(jsonb_build_object(
            'local', fila.local,
            'valor', fila.valor
          ) order by fila.valor desc)
          from (
            select
              coalesce(bodega.nombre, devolucion.nombre_local_documento, 'Sin local identificado') as local,
              sum(coalesce(
                detalle.valor_total_documento,
                detalle.unidades * detalle.precio_unitario_documento,
                0
              ))::numeric as valor
            from public.devoluciones devolucion
            join public.devolucion_detalles detalle on detalle.devolucion_id = devolucion.id
            left join public.bodegas bodega on bodega.id = devolucion.bodega_id
            where devolucion.cliente_id = metrica.cliente_id
              and devolucion.fecha_devolucion between v_desde and v_hasta
            group by coalesce(bodega.nombre, devolucion.nombre_local_documento, 'Sin local identificado')
            order by valor desc
            limit 10
          ) fila
        ), '[]'::jsonb)
      ) order by metrica.cliente_nombre), '[]'::jsonb) as datos
    from clientes_metricas metrica
  ),
  resumen as (
    select
      coalesce(sum(metrica.venta_bruta), 0)::numeric as venta_bruta,
      coalesce(sum(metrica.venta_neta), 0)::numeric as venta_neta,
      coalesce(sum(metrica.venta_neta_anterior), 0)::numeric as venta_neta_anterior,
      coalesce(sum(metrica.devoluciones), 0)::numeric as devoluciones,
      case when coalesce(sum(metrica.venta_bruta), 0) > 0
        then round(sum(metrica.devoluciones) / sum(metrica.venta_bruta) * 100, 2)
        else 0 end::numeric as devoluciones_pct,
      coalesce(sum(metrica.posiciones_activas), 0)::integer as posiciones_activas,
      coalesce(sum(metrica.posiciones_objetivo), 0)::integer as posiciones_objetivo,
      coalesce(sum(metrica.quiebres_detectados), 0)::integer as quiebres_detectados,
      coalesce(sum(metrica.codificaciones_nuevas), 0)::integer as codificaciones_nuevas,
      coalesce(sum(metrica.descodificaciones), 0)::integer as descodificaciones,
      coalesce(sum(metrica.acciones_pendientes), 0)::integer as acciones_pendientes,
      coalesce(sum(metrica.acciones_vencidas), 0)::integer as acciones_vencidas
    from clientes_metricas metrica
  )
  select jsonb_build_object(
    'periodo', v_desde,
    'periodo_anterior', v_desde_anterior,
    'resumen', jsonb_build_object(
      'venta_bruta', resumen.venta_bruta,
      'venta_neta', resumen.venta_neta,
      'venta_neta_anterior', resumen.venta_neta_anterior,
      'crecimiento_pct', case when resumen.venta_neta_anterior <> 0
        then round((resumen.venta_neta - resumen.venta_neta_anterior)
          / abs(resumen.venta_neta_anterior) * 100, 2)
        else null end,
      'devoluciones', resumen.devoluciones,
      'devoluciones_pct', resumen.devoluciones_pct,
      'margen_comercial_pct', null,
      'cobertura_pct', case when resumen.posiciones_objetivo > 0
        then round(resumen.posiciones_activas::numeric / resumen.posiciones_objetivo * 100, 2)
        else null end,
      'quiebres_detectados', resumen.quiebres_detectados,
      'codificaciones_nuevas', resumen.codificaciones_nuevas,
      'descodificaciones', resumen.descodificaciones,
      'acciones_pendientes', resumen.acciones_pendientes,
      'acciones_vencidas', resumen.acciones_vencidas
    ),
    'clientes', clientes_json.datos
  )
  into v_resultado
  from resumen
  cross join clientes_json;

  return coalesce(v_resultado, jsonb_build_object(
    'periodo', v_desde,
    'periodo_anterior', v_desde_anterior,
    'resumen', '{}'::jsonb,
    'clientes', '[]'::jsonb
  ));
end;
$$;

comment on function public.com_gestion_comercial_dashboard_v2(date, uuid, uuid) is
  'Gestion Comercial con ventas y devoluciones directas, sin multiplicacion por costeo.';

revoke all on function public.com_gestion_comercial_dashboard_v2(date, uuid, uuid)
  from public, anon;
grant execute on function public.com_gestion_comercial_dashboard_v2(date, uuid, uuid)
  to authenticated;

commit;

notify pgrst, 'reload schema';
