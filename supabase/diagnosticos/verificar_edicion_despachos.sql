-- Sólo metadatos; no lee documentos, cantidades ni correcciones reales.
with apis(firma,marca) as (values
 ('public.obtener_edicion_despacho(uuid)','editor'),('public.prever_edicion_despacho(text,jsonb)','prever'),
 ('public.ejecutar_edicion_despacho(uuid,text,jsonb,text,uuid)','ejecutar'),('public.resolver_edicion_despacho(uuid,text,uuid)','resolver')
), controles(nombre,correcto) as (
 select a.firma,coalesce(p.prosecdef and p.prosrc ~ ('^[[:space:]]*-- cibuspan-edicion-despacho-v1:'||a.marca||E'\\r?\\n')
   and p.proconfig @> array['search_path=pg_catalog, public'] and strpos(p.prosrc,'perform public.ed_autorizar(')>0
   and not has_function_privilege('anon',p.oid,'EXECUTE') and has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma)
 union all
 select 'tabla_privada',coalesce((select c.relrowsecurity and obj_description(c.oid,'pg_class')='cibuspan-edicion-despacho-v1'
 and not exists(select 1 from unnest(array['anon','authenticated','service_role']) rol cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permiso where has_table_privilege(rol,c.oid,permiso))
 from pg_class c where c.oid=to_regclass('public.ed_solicitudes_despacho')),false)
 union all
 select firma,coalesce(p.proconfig @> array['search_path=pg_catalog, public'] and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from unnest(array['public.ed_autorizar(text)','public.ed_datos(jsonb)','public.ed_base(jsonb)','public.ed_plan(jsonb,jsonb)','public.ed_exigir_contexto(uuid)','public.ed_proteger_filas()']) firma left join pg_proc p on p.oid=to_regprocedure(firma)
 union all
 select 'guardia:'||nombre,coalesce(t.tgenabled='O' and t.tgtype=tipo and t.tgfoid=to_regprocedure('public.ed_proteger_filas()'),false)
 from (values('reserva_detalles',31),('pedido_detalles',19),('reservas_inventario',19)) v(nombre,tipo) left join pg_trigger t on t.tgrelid=to_regclass('public.'||nombre) and t.tgname='ed_correccion_segura'
 union all
 select 'sesion_y_bloqueo:'||marca,coalesce(strpos(p.prosrc,'auth.uid() is distinct from p_usuario_esperado')>0 and strpos(p.prosrc,'pg_advisory_xact_lock(')>0,false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma) where marca in('ejecutar','resolver')
)
select jsonb_build_object('tipo','edicion_despachos','version','202611040002','correcto',bool_and(correcto),'controles_correctos',count(*) filter(where correcto),
 'pendientes',coalesce(jsonb_agg(nombre order by nombre) filter(where not correcto),'[]'::jsonb)) edicion_despachos from controles;
