-- Sólo definiciones. No exporta filas de negocio ni ejecuta operaciones.
with nombres(nombre) as (values
 ('clientes'),('bodegas'),('productos'),('cliente_productos'),('app_profiles'),('materias_primas'),
 ('inv_cargas_iniciales'),('inv_inicio_octubre'),('inv_kardex_movimientos'),('inventario_lotes'),
 ('semielaborado_tipos'),('semielaborado_destinos'),('inventario_semielaborados'),('conversiones_semielaborados'),
 ('pedidos'),('pedido_detalles'),('producciones'),('produccion_detalles'),('reservas_inventario'),('reserva_detalles'),
 ('inv_respaldos_inicio'),('inv_arranque_cortes'),('inv_arranque_solicitudes'),('inv_arranque_corte_mp'),
 ('ped_solicitudes_registro'),('pro_solicitudes_registro'),('pro_consumos_detalle'),
 ('log_solicitudes_operacion'),('res_solicitudes_operacion'),('ed_solicitudes_despacho'),
 ('stock_disponible_lotes'),('stock_semielaborados'),('stock_semielaborados_resumen'),
 ('cm_pedidos'),('cm_detalles_demanda')
), objetos as (
 select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join nombres x on x.nombre=c.relname where n.nspname='public'
), funciones as (
 select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and (
  p.proname ~ '^(inv_|app_|ped_|pro_|log_|res_|ed_)'
  or p.proname in ('registrar_pedido_seguro','resolver_registro_pedido','registrar_produccion_segura',
   'resolver_registro_produccion','registrar_produccion_completa','editar_produccion_completa',
   'obtener_produccion_sugerida','obtener_produccion_sugerida_periodo','reservar_pedido_fefo_parcial',
   'confirmar_despacho_parcial_fefo','liberar_reserva_fefo','activar_control_conciliacion_despacho',
   'vincular_factura_despacho','prever_operacion_logistica','ejecutar_operacion_logistica','resolver_operacion_logistica',
   'prever_operacion_reserva','ejecutar_operacion_reserva','resolver_operacion_reserva',
   'obtener_edicion_despacho','prever_edicion_despacho','ejecutar_edicion_despacho','resolver_edicion_despacho')
  or p.oid in (select tgfoid from pg_trigger where tgrelid in(select oid from objetos) and not tgisinternal))
)
select jsonb_build_object('tipo','auditoria_arranque_diciembre','version',1,'generado_en',current_timestamp,
 'objetos',(select jsonb_agg(jsonb_build_object('nombre',o.relname,'tipo',o.relkind,
  'columnas',(select jsonb_agg(jsonb_build_object('nombre',a.attname,'tipo',format_type(a.atttypid,a.atttypmod),
   'no_nulo',a.attnotnull,'identidad',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid=o.oid and a.attnum>0 and not a.attisdropped),
  'restricciones',(select jsonb_agg(jsonb_build_object('nombre',c.conname,'tipo',c.contype,'definicion',pg_get_constraintdef(c.oid)))
   from pg_constraint c where c.conrelid=o.oid),
  'triggers',(select jsonb_agg(jsonb_build_object('nombre',t.tgname,'habilitado',t.tgenabled,'definicion',pg_get_triggerdef(t.oid)))
   from pg_trigger t where t.tgrelid=o.oid and not t.tgisinternal),
  'vista',case when o.relkind='v' then pg_get_viewdef(o.oid,true) end) order by o.relname) from objetos o),
 'funciones',(select jsonb_agg(jsonb_build_object('nombre',f.proname,'firma',pg_get_function_identity_arguments(f.oid),
  'definicion',pg_get_functiondef(f.oid)) order by f.proname) from funciones f)
) as auditoria_arranque_diciembre;
