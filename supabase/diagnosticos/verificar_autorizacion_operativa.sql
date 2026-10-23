-- Sólo catálogos del esquema. No ejecuta las operaciones ni consulta existencias.
-- Una fila con correcto=true y todos los contadores en 12 confirma instalación.
with esperadas(nombre,argumentos) as (values
 ('registrar_produccion_completa','date,jsonb'),
 ('editar_produccion_completa','uuid,date,jsonb'),
 ('reservar_pedido_fefo_parcial','text,jsonb'),
 ('confirmar_despacho_parcial_fefo','text,jsonb'),
 ('liberar_reserva_fefo','uuid'),
 ('activar_control_conciliacion_despacho','text'),
 ('vincular_factura_despacho','text,text'),
 ('ajustar_inventario_lote','uuid,text,integer,text,text'),
 ('convertir_inventario_empaque','uuid,uuid,integer'),
 ('convertir_semielaborado','uuid,uuid,integer,date,text,date'),
 ('registrar_devolucion_completa','date,uuid,uuid,text,text,jsonb'),
 ('obtener_produccion_sugerida','')
), funciones as (
 select e.nombre,p.oid,
   coalesce(starts_with(p.prosrc,E'\n-- cibuspan-autorizacion-operativa-v1\n')
     and strpos(p.prosrc,'PERFORM public.app_exigir_operacion(')>0,false) protegida,
   coalesce(not has_function_privilege('anon',p.oid,'EXECUTE'),false) anon_cerrado,
   coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) usuario_habilitado,
   coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) servicio_habilitado
 from esperadas e left join pg_proc p
   on p.oid=to_regprocedure(format('public.%I(%s)',e.nombre,e.argumentos))
), resumen as (
 select count(oid)::integer funciones_encontradas,count(*) filter(where protegida)::integer funciones_protegidas,
   count(*) filter(where anon_cerrado)::integer accesos_anonimos_cerrados,
   count(*) filter(where usuario_habilitado)::integer accesos_usuarios_conservados,
   count(*) filter(where servicio_habilitado)::integer accesos_servicio_conservados from funciones
), helper as (
 select coalesce((select (p.prosrc ~ E'^[[:space:]]*-- cibuspan-autorizacion-operativa-v1:helper\\r?\\n')
   and not has_function_privilege('anon',p.oid,'EXECUTE')
   and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and has_function_privilege('service_role',p.oid,'EXECUTE')
   from pg_proc p where p.oid=to_regprocedure('public.app_exigir_operacion(text[])')),false) valido
)
select jsonb_build_object('tipo','autorizacion_operativa','version','202610230001',
 'correcto',helper.valido and funciones_encontradas=12 and funciones_protegidas=12
   and accesos_anonimos_cerrados=12 and accesos_usuarios_conservados=12 and accesos_servicio_conservados=12,
 'funciones_encontradas',funciones_encontradas,'funciones_protegidas',funciones_protegidas,
 'accesos_anonimos_cerrados',accesos_anonimos_cerrados,
 'accesos_usuarios_conservados',accesos_usuarios_conservados,
 'accesos_servicio_conservados',accesos_servicio_conservados,
 'pendientes',(select coalesce(jsonb_agg(nombre order by nombre),'[]'::jsonb) from funciones
   where not(protegida and anon_cerrado and usuario_habilitado and servicio_habilitado))) as autorizacion_operativa
from resumen cross join helper;
