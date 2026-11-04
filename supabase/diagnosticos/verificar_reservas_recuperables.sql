-- Sólo metadatos. No consulta documentos, solicitudes ni existencias.
with apis(firma,marca) as (values
 ('public.prever_operacion_reserva(text,jsonb)','prever'),
 ('public.ejecutar_operacion_reserva(uuid,text,jsonb,text,uuid)','ejecutar'),
 ('public.resolver_operacion_reserva(uuid,text,uuid)','resolver')
), controles(nombre,correcto) as (
 select a.firma,coalesce(p.prosecdef and p.prosrc ~ ('^[[:space:]]*-- cibuspan-reservas-seguras-v1:'||a.marca||E'\\r?\\n')
   and p.proconfig @> array['search_path=pg_catalog, public']
   and strpos(p.prosrc,'perform public.res_autorizar(')>0
   and not has_function_privilege('anon',p.oid,'EXECUTE') and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma)
 union all
 select 'tabla_privada',coalesce((select c.relrowsecurity and obj_description(c.oid,'pg_class')='cibuspan-reservas-seguras-v1'
   and not exists(select 1 from unnest(array['anon','authenticated','service_role']) rol cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permiso
     where has_table_privilege(rol,c.oid,permiso)) from pg_class c where c.oid=to_regclass('public.res_solicitudes_operacion')),false)
 union all
 select firma,coalesce(p.proconfig @> array['search_path=pg_catalog, public']
   and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and not has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from unnest(array['public.res_autorizar(text)','public.res_datos(text,jsonb)','public.res_base(text,jsonb)',
   'public.res_plan(text,jsonb,jsonb)','public.res_exigir_contexto(text,text)','public.res_exigir_llamada(text,text,jsonb)',
   'public.res_proteger_filas()']) firma left join pg_proc p on p.oid=to_regprocedure(firma)
 union all
 select 'guardia:'||nombre,coalesce(t.tgenabled='O' and t.tgtype=tipo and t.tgfoid=to_regprocedure('public.res_proteger_filas()'),false)
 from (values ('reservas_inventario','res_operacion_segura',23)) v(nombre,trigger_nombre,tipo)
 left join pg_trigger t on t.tgrelid=to_regclass('public.'||nombre) and t.tgname=trigger_nombre
 union all
 select 'compuerta:'||nombre,coalesce(starts_with(p.prosrc,
   E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('||quote_literal(array['Pedidos','Despachos']::text)||E'::text[]);\n  -- cibuspan-reservas-seguras-v1\n  PERFORM public.'||gate||E';\n')
   and not has_function_privilege('anon',p.oid,'EXECUTE'),false)
 from (values ('reservar_pedido_fefo_parcial','text,jsonb','res_exigir_llamada(''PREPARAR'',p_pedido_id,p_cantidades)'),
   ('liberar_reserva_fefo','uuid','res_exigir_llamada(''LIBERAR'',p_reserva_id::text,null)')) v(nombre,firma,gate)
 left join pg_proc p on p.oid=to_regprocedure('public.'||nombre||'('||firma||')')
 union all
 select 'sesion_y_bloqueo:'||marca,coalesce(strpos(p.prosrc,'auth.uid() is distinct from p_usuario_esperado')>0 and strpos(p.prosrc,'pg_advisory_xact_lock(')>0,false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma) where marca in ('ejecutar','resolver')
)
select jsonb_build_object('tipo','reservas_recuperables','version','202611040001','correcto',bool_and(correcto),
 'controles_correctos',count(*) filter(where correcto),
 'pendientes',coalesce(jsonb_agg(nombre order by nombre) filter(where not correcto),'[]'::jsonb)) as reservas_recuperables
from controles;
