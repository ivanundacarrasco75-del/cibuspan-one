-- Sólo catálogos; no registra producción, no consume ni consulta saldos.
with controles(nombre,correcto) as (
 select 'tabla_consumos',coalesce((select c.relrowsecurity
   and obj_description(c.oid,'pg_class')='cibuspan-consumo-mp-v1'
   and has_table_privilege('authenticated',c.oid,'SELECT')
   and not exists(select 1 from unnest(array['anon','authenticated','service_role']) rol
     cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) permiso where has_table_privilege(rol,c.oid,permiso))
   and not has_table_privilege('anon',c.oid,'SELECT')
   from pg_class c where c.oid=to_regclass('public.pro_consumos_detalle')),false)
 union all
 select 'trigger_confirmacion',coalesce((select t.tgenabled='O' and t.tgtype=17
   and t.tgfoid=to_regprocedure('public.pro_consumos_al_confirmar()')
   and pg_get_triggerdef(t.oid) like '%AFTER UPDATE OF estado%'
   and pg_get_triggerdef(t.oid) like '%CONFIRMADA%' and pg_get_triggerdef(t.oid) like '%REGISTRANDO%'
   from pg_trigger t where t.tgrelid=to_regclass('public.pro_solicitudes_registro') and t.tgname='pro_consumos_al_confirmar'),false)
 union all
 select 'funcion_privada',coalesce((select p.prosecdef
   and p.prosrc ~ E'^[[:space:]]*-- cibuspan-consumo-mp-v1:trigger\\r?\\n'
   and strpos(p.prosrc,'perform public.app_exigir_operacion(')>0
   and strpos(p.prosrc,'public.inv_kardex_validar_mp(')>0
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and not has_function_privilege('service_role',p.oid,'EXECUTE')
   from pg_proc p where p.oid=to_regprocedure('public.pro_consumos_al_confirmar()')),false)
)
select jsonb_build_object('tipo','consumo_mp_produccion','version','202610230003','correcto',bool_and(correcto),
 'controles_correctos',count(*) filter(where correcto),
 'pendientes',coalesce(jsonb_agg(nombre order by nombre) filter(where not correcto),'[]'::jsonb)) as consumo_mp_produccion
from controles;
