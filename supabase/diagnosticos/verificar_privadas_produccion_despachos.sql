-- Sólo metadatos. No consulta comprobantes ni ejecuta operaciones.
with tablas(nombre,marca) as (values
 ('ped_solicitudes_registro','cibuspan-pedido-seguro-v1'),
 ('pro_solicitudes_registro','cibuspan-registro-produccion-v1'),
 ('log_solicitudes_operacion','cibuspan-logistica-segura-v1'),
 ('res_solicitudes_operacion','cibuspan-reservas-seguras-v1'),
 ('ed_solicitudes_despacho','cibuspan-edicion-despacho-v1')
), controles as (
 select t.nombre,coalesce(c.relkind='r' and c.relrowsecurity
  and obj_description(c.oid,'pg_class')=t.marca
  and not exists(select 1 from unnest(array['anon','authenticated','service_role']) rol
   cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permiso
   where has_table_privilege(rol,c.oid,permiso)),false) correcto
 from tablas t left join pg_class c on c.oid=to_regclass('public.'||t.nombre)
)
select jsonb_build_object('tipo','privadas_produccion_despachos','version','202611270004',
 'correcto',bool_and(correcto),'controles_correctos',count(*) filter(where correcto),
 'pendientes',coalesce(jsonb_agg(nombre order by nombre) filter(where not correcto),'[]'::jsonb))
 as privadas_produccion_despachos from controles;
