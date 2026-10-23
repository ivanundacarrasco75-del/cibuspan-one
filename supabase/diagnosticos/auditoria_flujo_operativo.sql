-- Sólo consulta catálogos de PostgreSQL. No ejecuta los RPC operativos ni lee filas de negocio.
-- No es una migración. No crear/actualizar/borrar inventarios, pedidos o permisos para ejecutarla.
with
funciones_necesarias(nombre) as (values
 ('obtener_produccion_sugerida'),('registrar_produccion_completa'),('editar_produccion_completa'),
 ('reservar_pedido_fefo_parcial'),('confirmar_despacho_parcial_fefo'),('liberar_reserva_fefo'),
 ('activar_control_conciliacion_despacho'),('vincular_factura_despacho'),
 ('ajustar_inventario_lote'),('convertir_inventario_empaque'),('convertir_semielaborado'),
 ('registrar_devolucion_completa'),('pro_importar_ordenes_historicas'),
 ('inv_kardex_observar_pt'),('inv_kardex_registrar'),('inv_kardex_consultar'),('inv_kardex_puede'),
 ('inv_kardex_validar_mp'),('inv_inicio_estado'),('inv_inicio_proteger_lote'),('inv_inicio_proteger_fecha')
),
objetos_necesarios(nombre) as (values
 ('pedidos'),('pedido_detalles'),('producciones'),('produccion_detalles'),('inventario_lotes'),
 ('reservas_inventario'),('reserva_detalles'),('materias_primas'),('inv_kardex_movimientos'),('inv_cargas_iniciales'),
 ('productos'),('clientes'),('bodegas'),('cliente_productos'),('app_profiles'),
 ('bi_recetas'),('bi_receta_versiones'),('bi_receta_componentes'),('bi_vw_formula_producto'),
 ('fm_formulas'),('fm_formula_versiones'),('fm_micros'),('fm_preformulacion_componentes'),
 ('fm_vw_formula_final'),('fm_vw_recetas_micro'),('semielaborado_tipos'),('semielaborado_destinos'),
 ('inv_inicio_octubre'),('pro_importaciones_ordenes'),
 ('pro_ordenes_historicas'),('pro_ordenes_historicas_detalles'),('inventario_semielaborados'),('conversiones_semielaborados'),
 ('devoluciones'),('devolucion_detalles'),('stock_disponible_lotes'),('stock_semielaborados'),
 ('vw_producciones_resumen_unificado'),('vw_produccion_historial_detalle_unificado')
),
objetos as (
 select c.oid,c.relname,c.relkind,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in(select nombre from objetos_necesarios)
),
funciones as (
 select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind in ('f','p') and (p.proname in(select nombre from funciones_necesarias)
 or p.oid in(select t.tgfoid from pg_trigger t where t.tgrelid in(select oid from objetos) and not t.tgisinternal))
)
select jsonb_build_object(
 'tipo','auditoria_flujo_operativo','version',1,'generado_en',current_timestamp,
 'alcance','Sólo definiciones y permisos del esquema. No incluye filas de negocio ni ejecuta operaciones.',
 'funciones',coalesce((select jsonb_agg(jsonb_build_object('nombre',f.proname,'firma',pg_get_function_identity_arguments(f.oid),
    'security_definer',f.prosecdef,'configuracion',f.proconfig,'definicion',pg_get_functiondef(f.oid),
    'privilegios',(select jsonb_agg(jsonb_build_object('rol',r.rolname,'puede_ejecutar',has_function_privilege(r.oid,f.oid,'EXECUTE')) order by r.rolname)
      from pg_roles r where r.rolname in ('anon','authenticated','service_role'))) order by f.proname,f.oid) from funciones f),'[]'::jsonb),
 'funciones_no_encontradas',coalesce((select jsonb_agg(n.nombre order by n.nombre) from funciones_necesarias n where not exists(select 1 from funciones f where f.proname=n.nombre)),'[]'::jsonb),
 'objetos',coalesce((select jsonb_agg(jsonb_build_object('nombre',o.relname,'tipo',o.relkind,'rls_activo',o.relrowsecurity,
    'columnas',(select jsonb_agg(jsonb_build_object('nombre',a.attname,'tipo',format_type(a.atttypid,a.atttypmod),'no_nulo',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=o.oid and a.attnum>0 and not a.attisdropped),
    'restricciones',(select jsonb_agg(jsonb_build_object('nombre',c.conname,'tipo',c.contype,'definicion',pg_get_constraintdef(c.oid)) order by c.conname) from pg_constraint c where c.conrelid=o.oid),
    'indices',(select jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid) from pg_index i where i.indrelid=o.oid),
    'vista',case when o.relkind='v' then pg_get_viewdef(o.oid,true) else null end,
    'triggers',(select jsonb_agg(jsonb_build_object('nombre',t.tgname,'habilitado',t.tgenabled,'definicion',pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t where t.tgrelid=o.oid and not t.tgisinternal)
   ) order by o.relname) from objetos o),'[]'::jsonb),
 'objetos_no_encontrados',coalesce((select jsonb_agg(n.nombre order by n.nombre) from objetos_necesarios n where not exists(select 1 from objetos o where o.relname=n.nombre)),'[]'::jsonb),
 'politicas',coalesce((select jsonb_agg(jsonb_build_object('tabla',p.tablename,'nombre',p.policyname,'roles',p.roles,'operacion',p.cmd,'condicion',p.qual,'verificacion',p.with_check) order by p.tablename,p.policyname) from pg_policies p where p.schemaname='public' and p.tablename in(select nombre from objetos_necesarios)),'[]'::jsonb)
) as auditoria_flujo_operativo;
