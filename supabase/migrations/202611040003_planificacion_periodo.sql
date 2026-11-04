-- Planificación por fecha de entrega, sólo lectura; no registra producción.
begin;
do $preflight$ begin
 if to_regprocedure('public.app_exigir_operacion(text[])') is null or to_regprocedure('public.obtener_produccion_sugerida()') is null then raise exception 'Falta el contrato de producción/autorización.'; end if;
 if to_regprocedure('public.obtener_produccion_sugerida_periodo(date,date)') is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('public.obtener_produccion_sugerida_periodo(date,date)') and prosrc ~ E'^[[:space:]]*-- cibuspan-planificacion-periodo-v1\\r?\\n') then raise exception 'Existe otra planificación por período. Revisar antes de modificar.'; end if;
 perform producto_produccion_id,vida_util_dias,tamano_lote,stock_minimo,codigo_lote from public.productos limit 0;
 perform producto_base_id,cantidad_disponible from public.stock_semielaborados_resumen limit 0;
end $preflight$;
create or replace function public.obtener_produccion_sugerida_periodo(p_desde date,p_hasta date)
returns table(producto_id uuid,codigo text,nombre text,corto text,codigo_lote text,vida_util_dias integer,pedidos_pendientes integer,inventario_disponible integer,stock_minimo integer,tamano_lote integer,necesidad_neta integer,lotes_sugeridos integer,unidades_sugeridas integer)
language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-planificacion-periodo-v1
begin
 perform public.app_exigir_operacion(array['Producción','Reportes','Dashboard']);
 if p_desde is null or p_hasta is null or p_desde>p_hasta or p_hasta-p_desde>365 then raise exception 'Elige un período de entrega válido, hasta 366 días por consulta.'; end if;
 return query
 with pedidos as (
   select coalesce(p.producto_produccion_id,p.id) id,sum(greatest(d.total_unidades-d.unidades_despachadas,0))::integer cantidad
   from public.pedido_detalles d join public.pedidos o on o.id=d.pedido_id join public.productos p on p.id=d.producto_id
   where o.estado='INGRESADO' and o.fecha_entrega between p_desde and p_hasta
   group by coalesce(p.producto_produccion_id,p.id)
 ), pt as (
   select coalesce(p.producto_produccion_id,p.id) id,sum(greatest(s.cantidad_disponible,0))::integer cantidad
   from public.stock_disponible_lotes s join public.productos p on p.id=s.producto_id where s.fecha_vencimiento>=greatest(current_date,p_hasta)
   group by coalesce(p.producto_produccion_id,p.id)
 ), semi as (
   select s.producto_base_id id,sum(greatest(s.cantidad_disponible,0))::integer cantidad from public.stock_semielaborados_resumen s group by s.producto_base_id
 ), calculo as (
   select p.id,p.codigo,p.nombre,p.corto,coalesce(p.codigo_lote,'') lote,p.vida_util_dias,coalesce(d.cantidad,0)::integer demanda,
   (coalesce(t.cantidad,0)+coalesce(s.cantidad,0))::integer disponible,p.stock_minimo,p.tamano_lote,
   greatest(0,coalesce(d.cantidad,0)-coalesce(t.cantidad,0)-coalesce(s.cantidad,0))::integer necesidad
   from public.productos p left join pedidos d on d.id=p.id left join pt t on t.id=p.id left join semi s on s.id=p.id
   where p.activo and p.id=coalesce(p.producto_produccion_id,p.id)
 )
 select c.id,c.codigo,c.nombre,c.corto,c.lote,c.vida_util_dias,c.demanda,c.disponible,c.stock_minimo,c.tamano_lote,c.necesidad,
 case when c.necesidad=0 then 0 else ceil(c.necesidad::numeric/nullif(c.tamano_lote,0))::integer end,
 case when c.necesidad=0 then 0 else ceil(c.necesidad::numeric/nullif(c.tamano_lote,0))::integer*c.tamano_lote end
 from calculo c order by 13 desc,c.corto;
end $body$;
revoke all on function public.obtener_produccion_sugerida_periodo(date,date) from public,anon,authenticated,service_role;
grant execute on function public.obtener_produccion_sugerida_periodo(date,date) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
