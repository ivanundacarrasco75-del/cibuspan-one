-- Guardado de un pedido completo por solicitud, sin modificar existencias ni históricos.
begin;
set local lock_timeout='5s';
do $preflight$ begin
 if to_regprocedure('public.app_exigir_operacion(text[])') is null then raise exception 'Falta autorización operativa instalada.'; end if;
 perform id,cliente_id,bodega_id,numero_pedido_cliente,fecha_entrega,hora_entrega,prioridad,tipo_empaque,estado,total_unidades,creado_por from public.pedidos limit 0;
 perform id,pedido_id,producto_id,total_unidades,unidades_manejo,unidades_despachadas,estado,orden from public.pedido_detalles limit 0;
 perform cliente_id,producto_id,unidad_manejo,activo from public.cliente_productos limit 0;
 if to_regclass('public.ped_solicitudes_registro') is not null and
   obj_description(to_regclass('public.ped_solicitudes_registro'),'pg_class') is distinct from 'cibuspan-pedido-seguro-v1' then
   raise exception 'Ya existe otra tabla de solicitudes de pedidos. Revisar antes de modificar.'; end if;
end $preflight$;

create table if not exists public.ped_solicitudes_registro(
 solicitud_id uuid primary key,actor uuid not null,datos jsonb,
 estado text not null check(estado in ('REGISTRANDO','CONFIRMADA','ANULADA')),
 pedido_id text unique,resultado jsonb,ejecutada boolean not null default false,
 transaccion bigint not null default txid_current(),creado_en timestamptz not null default now(),
 check((estado='ANULADA' and datos is null and pedido_id is null and resultado is null and not ejecutada)
   or (estado='REGISTRANDO' and datos is not null and pedido_id is not null and resultado is null)
   or (estado='CONFIRMADA' and datos is not null and pedido_id is not null and resultado is not null and ejecutada))
);
-- El comprobante sobrevive a la eliminación permitida de un pedido INGRESADO;
-- no hay FK que bloquee esa función ni que borre el comprobante y permita recrearlo.
comment on table public.ped_solicitudes_registro is 'cibuspan-pedido-seguro-v1';
alter table public.ped_solicitudes_registro enable row level security;
revoke all on public.ped_solicitudes_registro from public,anon,authenticated,service_role;

create or replace function public.ped_datos_registro(p_datos jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $body$
-- cibuspan-pedido-seguro-v1:datos
declare d jsonb; detalles jsonb:='[]'; ids uuid[]:=array[]::uuid[]; producto uuid;
 cantidad numeric; manejo numeric; total numeric:=0; fecha date; hora text; numero text;
begin
 if jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'El pedido está incompleto.'; end if;
 numero:=upper(trim(p_datos->>'numeroPedidoCliente'));
 if numero is null or length(numero) not between 1 and 100 then raise exception 'Ingresa un número de pedido de hasta 100 caracteres.'; end if;
 if (p_datos->>'clienteId')::uuid is null or (p_datos->>'bodegaId')::uuid is null then raise exception 'Selecciona cliente y bodega.'; end if;
 if coalesce(p_datos->>'fechaEntrega','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha de entrega inválida.'; end if;
 fecha:=(p_datos->>'fechaEntrega')::date;
 hora:=coalesce(p_datos->>'horaEntrega','');
 if hora<>'' and hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hora de entrega inválida.'; end if;
 if coalesce(p_datos->>'prioridad','') not in ('NORMAL','ALTA','URGENTE') then raise exception 'Prioridad inválida.'; end if;
 if jsonb_typeof(p_datos->'tipoEmpaque') is distinct from 'string' or length(p_datos->>'tipoEmpaque')>100 then raise exception 'Tipo de empaque inválido.'; end if;
 if jsonb_typeof(p_datos->'detalles') is distinct from 'array' or jsonb_array_length(p_datos->'detalles') not between 1 and 1000 then raise exception 'Agrega productos al pedido.'; end if;
 for d in select value from jsonb_array_elements(p_datos->'detalles') loop
   producto:=(d->>'productoId')::uuid;
   if producto is null or producto=any(ids) then raise exception 'Hay productos repetidos o sin identificar.'; end if;
   ids:=array_append(ids,producto);
   if jsonb_typeof(d->'totalUnidades') is distinct from 'number' or jsonb_typeof(d->'unidadManejo') is distinct from 'number' then raise exception 'Cantidades y unidad de manejo deben ser números enteros.'; end if;
   cantidad:=(d->>'totalUnidades')::numeric;manejo:=(d->>'unidadManejo')::numeric;
   if cantidad not between 1 and 2147483647 or manejo not between 1 and 2147483647 or cantidad<>trunc(cantidad) or manejo<>trunc(manejo)
     or mod(cantidad,manejo)<>0 then raise exception 'Revisa cantidades enteras y múltiplos de la unidad de manejo.'; end if;
   total:=total+cantidad;
   if total>2147483647 then raise exception 'El total del pedido excede el rango permitido.'; end if;
   detalles:=detalles||jsonb_build_array(jsonb_build_object('productoId',producto,'totalUnidades',cantidad::integer,'unidadManejo',manejo::integer));
 end loop;
 return jsonb_build_object('numeroPedidoCliente',numero,'clienteId',(p_datos->>'clienteId')::uuid,
   'bodegaId',(p_datos->>'bodegaId')::uuid,'fechaEntrega',fecha,'horaEntrega',hora,
   'prioridad',p_datos->>'prioridad','tipoEmpaque',p_datos->>'tipoEmpaque','detalles',detalles);
end $body$;

create or replace function public.ped_exigir_registro_seguro()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-pedido-seguro-v1:trigger
declare s public.ped_solicitudes_registro%rowtype; solicitud uuid; d jsonb; total integer;
 rol text:=coalesce(current_setting('role',true),'none');
begin
 -- Conserva mantenimiento SQL autorizado sin una identidad de aplicación.
 if auth.uid() is null and (rol in ('postgres','supabase_admin','service_role')
   or rol='none' and session_user in ('postgres','supabase_admin')) then return new; end if;
 perform public.app_exigir_operacion(array['Pedidos','Despachos']);
 solicitud:=nullif(current_setting('cibuspan.pedido_request',true),'')::uuid;
 select * into s from public.ped_solicitudes_registro where solicitud_id=solicitud
   and actor=auth.uid() and estado='REGISTRANDO' and transaccion=txid_current() for update;
 if not found then raise exception 'Actualiza la app para guardar el pedido completo de forma segura.'; end if;
 if TG_TABLE_NAME='pedidos' then
   select sum((value->>'totalUnidades')::integer) into total from jsonb_array_elements(s.datos->'detalles');
   if s.ejecutada or new.id is distinct from s.pedido_id or new.numero_pedido_cliente is distinct from s.datos->>'numeroPedidoCliente'
     or new.cliente_id is distinct from (s.datos->>'clienteId')::uuid or new.bodega_id is distinct from (s.datos->>'bodegaId')::uuid
     or new.fecha_entrega is distinct from (s.datos->>'fechaEntrega')::date or new.hora_entrega is distinct from nullif(s.datos->>'horaEntrega','')::time
     or new.prioridad is distinct from s.datos->>'prioridad' or new.tipo_empaque is distinct from s.datos->>'tipoEmpaque'
     or new.estado<>'INGRESADO' or new.total_unidades is distinct from total or new.creado_por is distinct from auth.uid() then
       raise exception 'La cabecera no coincide con la solicitud de pedido.'; end if;
   update public.ped_solicitudes_registro set ejecutada=true where solicitud_id=solicitud;
 else
   d:=s.datos->'detalles'->(new.orden-1);
   if not s.ejecutada or new.pedido_id is distinct from s.pedido_id or d is null or new.orden<1 or new.orden>jsonb_array_length(s.datos->'detalles')
     or new.producto_id is distinct from (d->>'productoId')::uuid or new.total_unidades is distinct from (d->>'totalUnidades')::integer
     or new.unidades_manejo is distinct from (d->>'unidadManejo')::integer or new.unidades_despachadas<>0 or new.estado<>'PENDIENTE' then
       raise exception 'El detalle no coincide con la solicitud de pedido.'; end if;
 end if;
 return new;
end $body$;
drop trigger if exists ped_exigir_registro_seguro on public.pedidos;
create trigger ped_exigir_registro_seguro before insert on public.pedidos for each row execute function public.ped_exigir_registro_seguro();
drop trigger if exists ped_exigir_registro_seguro on public.pedido_detalles;
create trigger ped_exigir_registro_seguro before insert on public.pedido_detalles for each row execute function public.ped_exigir_registro_seguro();

create or replace function public.registrar_pedido_seguro(p_solicitud_id uuid,p_datos jsonb,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-pedido-seguro-v1:registro
declare datos jsonb; s public.ped_solicitudes_registro%rowtype; d jsonb; articulo uuid; um integer;
 b public.bodegas%rowtype; numero text; pedido text; previo text; total integer; n integer:=0; v_resultado jsonb;
 contexto text:=current_setting('cibuspan.pedido_request',true);
begin
 perform public.app_exigir_operacion(array['Pedidos','Despachos']);
 if auth.uid() is null or auth.uid() is distinct from p_usuario_esperado then raise exception 'La sesión cambió. Ingresa con el usuario del intento.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud del pedido.'; end if;
 perform set_config('lock_timeout','5s',true);
 datos:=public.ped_datos_registro(p_datos);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.pedido:'||p_solicitud_id::text,0));
 select * into s from public.ped_solicitudes_registro where solicitud_id=p_solicitud_id for update;
 if found then
   if s.actor<>auth.uid() then raise exception 'El intento pertenece a otro usuario.' using errcode='42501'; end if;
   if s.estado='ANULADA' then raise exception 'El intento quedó cerrado sin guardar. Revisa los datos y confirma otra vez.'; end if;
   if s.datos is distinct from datos or s.estado<>'CONFIRMADA' then raise exception 'El intento tiene otros datos o requiere revisión.'; end if;
   return s.resultado||jsonb_build_object('repetida',true,'vigente',exists(select 1 from public.pedidos where id=s.pedido_id));
 end if;
 numero:=datos->>'numeroPedidoCliente';
 -- Mantiene el alcance global sin distinguir mayúsculas que ya usa la app.
 -- No crea un índice sobre pedidos históricos ni borra duplicados anteriores.
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.pedido.numero:'||numero,0));
 select id into previo from public.pedidos where upper(trim(numero_pedido_cliente))=numero order by id limit 1;
 if found then raise exception 'El pedido % ya fue registrado como %. No se creó otro.',numero,previo; end if;
 perform 1 from public.clientes where id=(datos->>'clienteId')::uuid and activo for share;
 if not found then raise exception 'El cliente ya no está activo. Actualiza el formulario.'; end if;
 select * into b from public.bodegas where id=(datos->>'bodegaId')::uuid and activo for share;
 if not found or b.cliente_id<>(datos->>'clienteId')::uuid then raise exception 'La bodega no corresponde al cliente activo.'; end if;
 if b.tipo_empaque is distinct from datos->>'tipoEmpaque' then raise exception 'El empaque de la bodega cambió. Actualiza el formulario.'; end if;
 -- Orden estable al bloquear catálogos: mismos SKU en distinto orden no se cruzan.
 for articulo in select (value->>'productoId')::uuid from jsonb_array_elements(datos->'detalles') order by 1 loop
   perform 1 from public.productos where id=articulo and activo for share;
   if not found then raise exception 'Un SKU ya no está activo. Actualiza el catálogo.'; end if;
   select unidad_manejo into um from public.cliente_productos where cliente_id=b.cliente_id and producto_id=articulo and activo for share;
   if not found then raise exception 'Un SKU no está habilitado para este cliente.'; end if;
   select value into d from jsonb_array_elements(datos->'detalles') where (value->>'productoId')::uuid=articulo;
   if um<>(d->>'unidadManejo')::integer then raise exception 'La unidad de manejo cambió. Revisa cantidades antes de guardar.'; end if;
 end loop;
 select sum((value->>'totalUnidades')::integer) into total from jsonb_array_elements(datos->'detalles');
 pedido:='PED-'||to_char(clock_timestamp() at time zone 'America/Guayaquil','YYYYMMDD')||'-'||replace(p_solicitud_id::text,'-','');
 insert into public.ped_solicitudes_registro(solicitud_id,actor,datos,estado,pedido_id) values(p_solicitud_id,auth.uid(),datos,'REGISTRANDO',pedido);
 perform set_config('cibuspan.pedido_request',p_solicitud_id::text,true);
 insert into public.pedidos(id,numero_pedido_cliente,cliente_id,bodega_id,fecha_entrega,hora_entrega,prioridad,tipo_empaque,estado,total_unidades,creado_por)
 values(pedido,numero,b.cliente_id,b.id,(datos->>'fechaEntrega')::date,nullif(datos->>'horaEntrega','')::time,
   datos->>'prioridad',b.tipo_empaque,'INGRESADO',total,auth.uid());
 for d in select value from jsonb_array_elements(datos->'detalles') loop
   n:=n+1;
   insert into public.pedido_detalles(id,pedido_id,producto_id,total_unidades,unidades_manejo,unidades_despachadas,estado,orden)
   values(gen_random_uuid(),pedido,(d->>'productoId')::uuid,(d->>'totalUnidades')::integer,(d->>'unidadManejo')::integer,0,'PENDIENTE',n);
 end loop;
 if (select count(*) from public.pedido_detalles where pedido_id=pedido)<>n
   or (select sum(total_unidades) from public.pedido_detalles where pedido_id=pedido) is distinct from total::bigint then
   raise exception 'No se confirmó el pedido completo. Se revirtió el guardado.'; end if;
 perform set_config('cibuspan.pedido_request',coalesce(contexto,''),true);
 v_resultado:=jsonb_build_object('solicitud_id',p_solicitud_id,'pedido_id',pedido,'numero_pedido_cliente',numero,'total_unidades',total,'repetida',false,'vigente',true);
 update public.ped_solicitudes_registro set estado='CONFIRMADA',resultado=v_resultado where solicitud_id=p_solicitud_id and ejecutada;
 if not found then raise exception 'No se confirmó la solicitud completa.'; end if;
 return v_resultado;
end $body$;

create or replace function public.resolver_registro_pedido(p_solicitud_id uuid,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-pedido-seguro-v1:resolver
declare s public.ped_solicitudes_registro%rowtype;
begin
 perform public.app_exigir_operacion(array['Pedidos','Despachos']);
 if auth.uid() is null or auth.uid() is distinct from p_usuario_esperado then raise exception 'La sesión cambió. Ingresa con el usuario del intento.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud del pedido.'; end if;
 perform set_config('lock_timeout','5s',true);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.pedido:'||p_solicitud_id::text,0));
 select * into s from public.ped_solicitudes_registro where solicitud_id=p_solicitud_id for update;
 if found then
   if s.actor<>auth.uid() then raise exception 'El intento pertenece a otro usuario.' using errcode='42501'; end if;
   if s.estado='CONFIRMADA' then return s.resultado||jsonb_build_object('estado','CONFIRMADA','repetida',true,'vigente',exists(select 1 from public.pedidos where id=s.pedido_id)); end if;
   if s.estado<>'ANULADA' then raise exception 'El intento requiere revisión antes de continuar.'; end if;
 else
   insert into public.ped_solicitudes_registro(solicitud_id,actor,estado) values(p_solicitud_id,auth.uid(),'ANULADA');
 end if;
 return jsonb_build_object('estado','ANULADA','solicitud_id',p_solicitud_id,'pedido_id',null);
end $body$;
revoke all on function public.ped_datos_registro(jsonb),public.ped_exigir_registro_seguro() from public,anon,authenticated,service_role;
revoke all on function public.registrar_pedido_seguro(uuid,jsonb,uuid),public.resolver_registro_pedido(uuid,uuid) from public,anon;
grant execute on function public.registrar_pedido_seguro(uuid,jsonb,uuid),public.resolver_registro_pedido(uuid,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
