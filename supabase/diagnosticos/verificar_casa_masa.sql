-- Diagnóstico de sólo lectura. No registra pedidos ni movimientos.
with estado as (
 select
 coalesce(obj_description(to_regclass('public.cm_pedidos'),'pg_class')='cibuspan-casa-masa-v1',false) tabla,
 coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.cm_pedidos')),false) rls,
 to_regprocedure('public.registrar_pedido_casa_masa(uuid,jsonb,uuid)') is not null registro,
 to_regprocedure('public.guardar_empaque_casa_masa(text,integer,jsonb)') is not null empaque,
 (select count(*)=2 from pg_proc where oid in (to_regprocedure('public.obtener_produccion_sugerida()'),to_regprocedure('public.obtener_produccion_sugerida_periodo(date,date)'))
 and strpos(prosrc,'cibuspan-cm-demanda-v1')>0 and strpos(prosrc,'cm_detalles_demanda')>0) demanda,
 exists(select 1 from pg_trigger where tgrelid=to_regclass('public.pedidos') and tgname='cm_exigir_empaque_despacho' and tgenabled='O') despacho,
 coalesce(not has_table_privilege('authenticated',to_regclass('public.cm_pedidos'),'INSERT,UPDATE,DELETE'),false) escritura_protegida,
 coalesce(not has_table_privilege('anon',to_regclass('public.cm_pedidos'),'SELECT,INSERT,UPDATE,DELETE'),false) anon_denegado,
 coalesce(not has_table_privilege('authenticated',to_regclass('public.cm_detalles_demanda'),'SELECT'),false) vista_privada,
 exists(select 1 from pg_policy where polrelid=to_regclass('public.cm_pedidos') and polname='cm_lectura') politica
)
select jsonb_build_object('tipo','casa_masa','version','202611190002',
 'correcto',tabla and rls and registro and empaque and demanda and despacho and escritura_protegida and anon_denegado and vista_privada and politica,
 'tabla',tabla,'rls',rls,'registro',registro,'empaque',empaque,'demanda_excluida',demanda,'control_despacho',despacho,
 'escritura_protegida',escritura_protegida,'anon_denegado',anon_denegado,'vista_privada',vista_privada,'politica',politica,
 'sku_cm_activos',(select count(*) from public.productos where activo and upper(trim(codigo)) in ('CM-001','CM-002','CM-003','CM-004'))
) casa_masa from estado;
