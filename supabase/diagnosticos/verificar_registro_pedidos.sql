-- Sólo metadatos: no registra ni consulta pedidos, solicitudes o existencias.
with apis(firma,marca) as (values
 ('public.registrar_pedido_seguro(uuid,jsonb,uuid)','registro'),
 ('public.resolver_registro_pedido(uuid,uuid)','resolver')
), controles(nombre,correcto) as (
 select a.firma,coalesce(p.prosecdef and p.prosrc ~ ('^[[:space:]]*-- cibuspan-pedido-seguro-v1:'||a.marca||E'\\r?\\n')
   and p.proconfig @> array['search_path=pg_catalog, public']
   and strpos(p.prosrc,'perform public.app_exigir_operacion(')>0
   and strpos(p.prosrc,'auth.uid() is distinct from p_usuario_esperado')>0
   and strpos(p.prosrc,'pg_advisory_xact_lock(')>0
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma)
 union all
 select 'tabla_privada',coalesce((select c.relrowsecurity and obj_description(c.oid,'pg_class')='cibuspan-pedido-seguro-v1'
   and not exists(select 1 from unnest(array['anon','authenticated','service_role']) rol
     cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permiso
     where has_table_privilege(rol,c.oid,permiso))
   from pg_class c where c.oid=to_regclass('public.ped_solicitudes_registro')),false)
 union all
 select firma,coalesce(p.proconfig @> array['search_path=pg_catalog, public']
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and not has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from unnest(array['public.ped_datos_registro(jsonb)','public.ped_exigir_registro_seguro()']) firma
 left join pg_proc p on p.oid=to_regprocedure(firma)
 union all
 select 'guardia:'||nombre,coalesce(t.tgenabled='O' and t.tgtype=7
   and t.tgfoid=to_regprocedure('public.ped_exigir_registro_seguro()'),false)
 from unnest(array['pedidos','pedido_detalles']) nombre
 left join pg_trigger t on t.tgrelid=to_regclass('public.'||nombre) and t.tgname='ped_exigir_registro_seguro'
 union all
 select 'solicitud_privada_no_simulable',coalesce((select p.prosecdef
   and strpos(p.prosrc,'transaccion=txid_current()')>0 and strpos(p.prosrc,'actor=auth.uid()')>0
   and strpos(p.prosrc,'estado=''REGISTRANDO''')>0
   from pg_proc p where p.oid=to_regprocedure('public.ped_exigir_registro_seguro()')),false)
)
select jsonb_build_object('tipo','registro_pedidos_seguro','version','202610270001','correcto',bool_and(correcto),
 'controles_correctos',count(*) filter(where correcto),
 'pendientes',coalesce(jsonb_agg(nombre order by nombre) filter(where not correcto),'[]'::jsonb)) as registro_pedidos_seguro
from controles;
