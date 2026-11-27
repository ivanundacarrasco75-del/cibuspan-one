-- Restaurar el aislamiento previsto de los comprobantes de reintentos.
-- No borra solicitudes, pedidos, producción, inventarios ni documentos.
begin;
set local lock_timeout='5s';
do $comprobar$
declare x record;
begin
 for x in select * from (values
  ('ped_solicitudes_registro','cibuspan-pedido-seguro-v1'),
  ('pro_solicitudes_registro','cibuspan-registro-produccion-v1'),
  ('log_solicitudes_operacion','cibuspan-logistica-segura-v1'),
  ('res_solicitudes_operacion','cibuspan-reservas-seguras-v1'),
  ('ed_solicitudes_despacho','cibuspan-edicion-despacho-v1')
 ) t(tabla,marca) loop
  if not coalesce((select c.relkind='r' and c.relrowsecurity
    and obj_description(c.oid,'pg_class')=x.marca
    from pg_class c where c.oid=to_regclass('public.'||x.tabla)),false) then
   raise exception 'La tabla privada % no coincide con el contrato esperado. No se aplicó la corrección.',x.tabla;
  end if;
 end loop;
end $comprobar$;
revoke all on public.ped_solicitudes_registro,public.pro_solicitudes_registro,
 public.log_solicitudes_operacion,public.res_solicitudes_operacion,public.ed_solicitudes_despacho
 from public,anon,authenticated,service_role;
commit;
