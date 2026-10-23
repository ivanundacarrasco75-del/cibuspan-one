-- Sólo metadatos; no registra producción ni consulta existencias o solicitudes.
with apis(firma,marca) as (values
 ('public.registrar_produccion_segura(uuid,date,jsonb,uuid)','registro'),
 ('public.resolver_registro_produccion(uuid,uuid)','resolver')
), controles(nombre,correcto) as (
 select a.firma,coalesce(p.prosecdef and p.prosrc ~ ('^[[:space:]]*-- cibuspan-registro-produccion-v1:'||a.marca||E'\\r?\\n')
   and strpos(p.prosrc,'perform public.app_exigir_operacion(array[')>0
   and strpos(p.prosrc,'pg_advisory_xact_lock(')>0
   and strpos(p.prosrc,'auth.uid() is distinct from p_usuario_esperado')>0
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma)
 union all
 select 'tabla_privada',coalesce((select c.relrowsecurity
   and obj_description(c.oid,'pg_class')='cibuspan-registro-produccion-v1'
   and not exists(select 1 from unnest(array['anon','authenticated','service_role']) rol
     cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permiso
     where has_table_privilege(rol,c.oid,permiso))
   from pg_class c where c.oid=to_regclass('public.pro_solicitudes_registro')),false)
 union all
 select 'auxiliares_privados',not exists(
   select 1 from unnest(array['public.pro_actor_registro()','public.pro_exigir_solicitud_registro(date,jsonb)']) firma
   left join pg_proc p on p.oid=to_regprocedure(firma)
   where p.oid is null or has_function_privilege('anon',p.oid,'EXECUTE')
     or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))
 union all
 select 'entrada_anterior_protegida',coalesce((select starts_with(p.prosrc,
   E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('
   ||quote_literal(array['Producción']::text)||E'::text[]);\n  -- cibuspan-registro-produccion-v1\n  PERFORM public.pro_exigir_solicitud_registro(p_fecha_produccion_general,p_detalles);\n')
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   from pg_proc p where p.oid=to_regprocedure('public.registrar_produccion_completa(date,jsonb)')),false)
)
select jsonb_build_object('tipo','registro_produccion_seguro','version','202610230002',
 'correcto',bool_and(correcto),'controles_correctos',count(*) filter(where correcto),
 'pendientes',coalesce(jsonb_agg(nombre order by nombre) filter(where not correcto),'[]'::jsonb)) as registro_produccion_seguro
from controles;
