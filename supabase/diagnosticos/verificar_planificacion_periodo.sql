-- Sólo metadatos del contrato nuevo; no documentos ni existencias.
select jsonb_build_object('tipo','planificacion_periodo','version','202611040003','instalada',p.oid is not null,'correcto',coalesce(
 p.prosecdef and p.provolatile='s' and p.prosrc ~ E'^[[:space:]]*-- cibuspan-planificacion-periodo-v1\\r?\\n'
 and p.proconfig @> array['search_path=pg_catalog, public']
 and strpos(p.prosrc,'perform public.app_exigir_operacion(array[''Producción'',''Reportes'',''Dashboard''])')>0
 and strpos(p.prosrc,'o.fecha_entrega between p_desde and p_hasta')>0
 and not has_function_privilege('anon',p.oid,'EXECUTE') and has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE'),false)) planificacion_periodo
from (select to_regprocedure('public.obtener_produccion_sugerida_periodo(date,date)') oid) x left join pg_proc p on p.oid=x.oid;
