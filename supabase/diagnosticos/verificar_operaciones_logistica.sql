-- Sólo metadatos. No consulta documentos, solicitudes ni existencias.
with apis(firma,marca) as (values
 ('public.prever_operacion_logistica(text,jsonb)','prever'),
 ('public.ejecutar_operacion_logistica(uuid,text,jsonb,text,uuid)','ejecutar'),
 ('public.resolver_operacion_logistica(uuid,text,uuid)','resolver')
), controles(nombre,correcto) as (
 select a.firma,coalesce(p.prosecdef and p.prosrc ~ ('^[[:space:]]*-- cibuspan-logistica-segura-v1:'||a.marca||E'\\r?\\n')
   and p.proconfig @> array['search_path=pg_catalog, public']
   and strpos(p.prosrc,'perform public.log_autorizar(')>0
   and not has_function_privilege('anon',p.oid,'EXECUTE') and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma)
 union all
 select 'tabla_privada',coalesce((select c.relrowsecurity and obj_description(c.oid,'pg_class')='cibuspan-logistica-segura-v1'
   and not exists(select 1 from unnest(array['anon','authenticated','service_role']) rol cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permiso
     where has_table_privilege(rol,c.oid,permiso)) from pg_class c where c.oid=to_regclass('public.log_solicitudes_operacion')),false)
 union all
 select firma,coalesce(p.proconfig @> array['search_path=pg_catalog, public']
   and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and not has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from unnest(array['public.log_autorizar(text)','public.log_datos(text,jsonb)','public.log_base(text,jsonb)',
   'public.log_plan(text,jsonb,jsonb)','public.log_exigir_contexto(text,text)','public.log_exigir_confirmacion(text,jsonb)',
   'public.log_exigir_metadato(text)','public.log_proteger_filas()']) firma left join pg_proc p on p.oid=to_regprocedure(firma)
 union all
 select 'guardia:'||nombre,coalesce(t.tgenabled='O' and t.tgtype=tipo and t.tgfoid=to_regprocedure('public.log_proteger_filas()'),false)
 from (values ('pedidos','log_eliminacion_segura',11),('pedido_detalles','log_eliminacion_segura',11),('reservas_inventario','log_confirmacion_segura',19)) v(nombre,trigger_nombre,tipo)
 left join pg_trigger t on t.tgrelid=to_regclass('public.'||nombre) and t.tgname=trigger_nombre
 union all
 select 'compuerta:'||nombre,coalesce(starts_with(p.prosrc,
   E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('||quote_literal(array['Pedidos','Despachos']::text)||E'::text[]);\n  -- cibuspan-logistica-segura-v1\n  PERFORM public.'||gate||E';\n')
   and not has_function_privilege('anon',p.oid,'EXECUTE'),false)
 from (values ('confirmar_despacho_parcial_fefo','text,jsonb','log_exigir_confirmacion(p_reserva_id,p_cantidades)'),
   ('activar_control_conciliacion_despacho','text','log_exigir_metadato(p_reserva_id)'),
   ('vincular_factura_despacho','text,text','log_exigir_metadato(p_reserva_id)')) v(nombre,firma,gate)
 left join pg_proc p on p.oid=to_regprocedure('public.'||nombre||'('||firma||')')
 union all
 select 'sesion_y_bloqueo:'||marca,coalesce(strpos(p.prosrc,'auth.uid() is distinct from p_usuario_esperado')>0 and strpos(p.prosrc,'pg_advisory_xact_lock(')>0,false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma) where marca in ('ejecutar','resolver')
)
select jsonb_build_object('tipo','operaciones_logistica','version','202610270002','correcto',bool_and(correcto),
 'controles_correctos',count(*) filter(where correcto),
 'pendientes',coalesce(jsonb_agg(nombre order by nombre) filter(where not correcto),'[]'::jsonb)) as operaciones_logistica
from controles;
