-- Sólo metadatos. No aplica cortes ni consulta conteos, pedidos o existencias.
with apis(firma,marca) as (values
 ('public.inv_arranque_estado()','estado'),('public.inv_arranque_catalogo()','catalogo'),
 ('public.inv_arranque_prever(date,jsonb)','prever'),
 ('public.inv_arranque_confirmar(uuid,date,jsonb,text,boolean,boolean,uuid)','confirmar'),
 ('public.inv_arranque_resolver(uuid,uuid)','resolver'),('public.inv_arranque_reporte()','reporte')
), tablas(nombre) as (values ('inv_kardex_movimientos'),('inventario_lotes'),('inventario_semielaborados'),
 ('producciones'),('produccion_detalles'),('conversiones_semielaborados'),('reservas_inventario')
), controles(nombre,correcto) as (
 select a.firma,coalesce(p.prosecdef and p.prosrc ~ ('^[[:space:]]*-- cibuspan-arranque-v1:'||a.marca||E'\\r?\\n')
   and (strpos(p.prosrc,'perform public.inv_arranque_admin();')>0 or a.marca='estado' and strpos(p.prosrc,'perform public.app_exigir_operacion(')>0)
   and p.proconfig @> array['search_path=pg_catalog, public']
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from apis a left join pg_proc p on p.oid=to_regprocedure(a.firma)
 union all
 select nombre,coalesce(c.relrowsecurity and obj_description(c.oid,'pg_class')='cibuspan-arranque-v1'
   and not exists(select 1 from unnest(array['anon','authenticated','service_role']) rol
     cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permiso
     where has_table_privilege(rol,c.oid,permiso)),false)
 from unnest(array['inv_arranque_cortes','inv_arranque_solicitudes']) nombre
 left join pg_class c on c.oid=to_regclass('public.'||nombre)
 union all
 select 'auxiliar:'||firma,coalesce(p.proconfig @> array['search_path=pg_catalog, public']
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and not has_function_privilege('service_role',p.oid,'EXECUTE'),false)
 from unnest(array['public.inv_arranque_admin()','public.inv_arranque_en_curso()',
   'public.inv_arranque_numero(jsonb,boolean)','public.inv_arranque_base()',
   'public.inv_arranque_plan(jsonb,date,jsonb)','public.inv_arranque_bloqueos(jsonb,date)',
   'public.inv_arranque_proteger()','public.inv_arranque_no_truncar()','public.inv_arranque_iniciar_mp()']) firma
 left join pg_proc p on p.oid=to_regprocedure(firma)
 union all
 select 'periodo:'||nombre,coalesce(t.tgenabled='O' and t.tgtype=31
   and t.tgfoid=to_regprocedure('public.inv_arranque_proteger()'),false)
 from tablas left join pg_trigger t on t.tgrelid=to_regclass('public.'||nombre) and t.tgname='inv_arranque_periodo'
 union all
 select 'truncate:'||nombre,coalesce(t.tgenabled='O' and t.tgtype=34
   and t.tgfoid=to_regprocedure('public.inv_arranque_no_truncar()'),false)
 from tablas left join pg_trigger t on t.tgrelid=to_regclass('public.'||nombre) and t.tgname='inv_arranque_truncate'
 union all
 select 'nueva_mp',coalesce((select t.tgenabled='O' and t.tgtype=21
   and pg_get_triggerdef(t.oid) like '%AFTER INSERT OR UPDATE OF activo%'
   and t.tgfoid=to_regprocedure('public.inv_arranque_iniciar_mp()')
   from pg_trigger t where t.tgrelid=to_regclass('public.materias_primas') and t.tgname='inv_arranque_nueva_mp'),false)
 union all
 select 'envoltura:'||nombre,coalesce(p.prosrc ~ ('^[[:space:]]*-- cibuspan-arranque-v1:'||nombre||E'\\r?\\n'),false)
 from (values ('inv_kardex_validar_mp','uuid'),('inv_inicio_proteger_fecha',''),('inv_inicio_proteger_lote','')) w(nombre,firma)
 left join pg_proc p on p.oid=to_regprocedure('public.'||nombre||'('||firma||')')
 union all
 select 'aplicacion_bloqueada_y_sesion',coalesce((select strpos(prosrc,'pg_advisory_xact_lock(')>0
   and strpos(prosrc,'in exclusive mode;')>0 and strpos(prosrc,'auth.uid() is distinct from p_usuario')>0
   and strpos(prosrc,'El inventario, catálogo o los pedidos cambiaron')>0
   from pg_proc where oid=to_regprocedure('public.inv_arranque_confirmar(uuid,date,jsonb,text,boolean,boolean,uuid)')),false)
)
select jsonb_build_object('tipo','arranque_operativo','version','202610240001','correcto',bool_and(correcto),
 'controles_correctos',count(*) filter(where correcto),
 'pendientes',coalesce(jsonb_agg(nombre order by nombre) filter(where not correcto),'[]'::jsonb)) as arranque_operativo
from controles;
