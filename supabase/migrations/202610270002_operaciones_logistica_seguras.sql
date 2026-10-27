-- Eliminar un pedido y confirmar un despacho: operaciones completas y recuperables.
-- Instalar no ejecuta ninguna operación ni cambia saldos o documentos existentes.
begin;
set local lock_timeout='5s';
do $preflight$
declare nombre text; firma text; prefijo text; src text;
begin
 if to_regprocedure('public.app_exigir_operacion(text[])') is null then raise exception 'Falta autorización operativa.'; end if;
 foreach nombre in array array['confirmar_despacho_parcial_fefo','activar_control_conciliacion_despacho','vincular_factura_despacho'] loop
   firma:=case nombre when 'confirmar_despacho_parcial_fefo' then 'text,jsonb' when 'vincular_factura_despacho' then 'text,text' else 'text' end;
   select prosrc into src from pg_proc where oid=to_regprocedure('public.'||nombre||'('||firma||')');
   prefijo:=E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('||quote_literal(array['Pedidos','Despachos']::text)||E'::text[]);\n';
   if src is null or not starts_with(src,prefijo) or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=nombre)<>1 then
     raise exception 'El contrato de % requiere revisión. No se instaló logística.',nombre; end if;
 end loop;
 perform id,pedido_id,estado,numero_factura,conciliacion_aplica from public.reservas_inventario limit 0;
 perform id,reserva_id,pedido_detalle_id,inventario_lote_id,unidades from public.reserva_detalles limit 0;
 if to_regclass('public.log_solicitudes_operacion') is not null and obj_description(to_regclass('public.log_solicitudes_operacion'),'pg_class') is distinct from 'cibuspan-logistica-segura-v1' then
   raise exception 'Existe otra tabla de operaciones logísticas. Revisar antes de modificar.'; end if;
end $preflight$;

create table if not exists public.log_solicitudes_operacion(
 solicitud_id uuid primary key, actor uuid not null, tipo text not null check(tipo in ('ELIMINAR','DESPACHAR')),
 datos jsonb, base jsonb, resultado jsonb,
 estado text not null check(estado in ('EJECUTANDO','CONFIRMADA','ANULADA')),
 ejecutada boolean not null default false,transaccion bigint not null default txid_current(),
 creado_en timestamptz not null default now(),
 check((estado='ANULADA' and datos is null and base is null and resultado is null and not ejecutada)
   or (estado='EJECUTANDO' and datos is not null and base is not null and resultado is null)
   or (estado='CONFIRMADA' and datos is not null and base is not null and resultado is not null and ejecutada))
);
comment on table public.log_solicitudes_operacion is 'cibuspan-logistica-segura-v1';
alter table public.log_solicitudes_operacion enable row level security;
revoke all on public.log_solicitudes_operacion from public,anon,authenticated,service_role;

create or replace function public.log_autorizar(p_tipo text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:autorizar
begin
 if p_tipo='ELIMINAR' then perform public.app_exigir_operacion(array['Pedidos','Despachos']);
 elsif p_tipo='DESPACHAR' then perform public.app_exigir_operacion(array['Pedidos','Despachos']);
 else raise exception 'Operación logística inválida.'; end if;
end $body$;

create or replace function public.log_datos(p_tipo text,p_datos jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:datos
declare d jsonb; ids uuid[]:=array[]::uuid[]; detalle uuid; cantidad numeric; total numeric:=0; lineas jsonb:='[]';
begin
 if jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Operación incompleta.'; end if;
 if p_tipo='ELIMINAR' then
   if jsonb_typeof(p_datos->'pedidoId') is distinct from 'string' or length(trim(p_datos->>'pedidoId')) not between 1 and 200 then raise exception 'Selecciona un pedido.'; end if;
   return jsonb_build_object('pedidoId',trim(p_datos->>'pedidoId'));
 elsif p_tipo<>'DESPACHAR' or (p_datos->>'reservaId')::uuid is null then raise exception 'Selecciona una reserva.'; end if;
 if jsonb_typeof(p_datos->'numeroFactura') is distinct from 'string' or length(trim(p_datos->>'numeroFactura'))>200 then raise exception 'Número de factura inválido.'; end if;
 if jsonb_typeof(p_datos->'cantidades') is distinct from 'array' or jsonb_array_length(p_datos->'cantidades') not between 1 and 1000 then raise exception 'Completa las cantidades de cada SKU.'; end if;
 for d in select value from jsonb_array_elements(p_datos->'cantidades') loop
   detalle:=(d->>'pedidoDetalleId')::uuid;
   if detalle is null or detalle=any(ids) or jsonb_typeof(d->'unidades') is distinct from 'number' then raise exception 'Hay líneas duplicadas o cantidades incompletas.'; end if;
   cantidad:=(d->>'unidades')::numeric;
   if cantidad<0 or cantidad>2147483647 or cantidad<>trunc(cantidad) then raise exception 'Las cantidades deben ser unidades enteras, sin negativos.'; end if;
   total:=total+cantidad;ids:=array_append(ids,detalle);
   if total>2147483647 then raise exception 'Total fuera del rango permitido.'; end if;
   lineas:=lineas||jsonb_build_array(jsonb_build_object('pedidoDetalleId',detalle,'unidades',cantidad::integer));
 end loop;
 if total=0 then raise exception 'Despacha al menos una unidad de manejo.'; end if;
 select jsonb_agg(value order by value->>'pedidoDetalleId') into lineas from jsonb_array_elements(lineas);
 return jsonb_build_object('reservaId',(p_datos->>'reservaId')::uuid,'numeroFactura',trim(p_datos->>'numeroFactura'),'cantidades',lineas);
end $body$;

create or replace function public.log_base(p_tipo text,p_datos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:base
declare pedido text; r jsonb; p jsonb; detalles jsonb; reservas jsonb; rd jsonb; lotes jsonb;
begin
 if p_tipo='ELIMINAR' then pedido:=p_datos->>'pedidoId';
 else
   select to_jsonb(x),x.pedido_id into r,pedido from public.reservas_inventario x where id=(p_datos->>'reservaId')::uuid;
   if not found then raise exception 'La reserva ya no existe. Actualiza el pedido.'; end if;
 end if;
 select to_jsonb(x) into p from public.pedidos x where id=pedido;
 if not found then raise exception 'El pedido ya no existe. Comprueba cualquier intento anterior antes de repetir la operación.'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into detalles from public.pedido_detalles x where pedido_id=pedido;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into reservas from public.reservas_inventario x where pedido_id=pedido;
 if p_tipo='DESPACHAR' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into rd from public.reserva_detalles x where reserva_id=(r->>'id')::uuid;
   select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into lotes from public.inventario_lotes x where id in(select (value->>'inventario_lote_id')::uuid from jsonb_array_elements(rd));
 end if;
 return jsonb_build_object('pedido',p,'detalles',detalles,'reservas',reservas,'reserva',r,'reserva_detalles',rd,'lotes',lotes,
   'dia',(now() at time zone 'America/Guayaquil')::date,'dia_sql',current_date);
end $body$;

create or replace function public.log_plan(p_tipo text,p_datos jsonb,p_base jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:plan
declare p jsonb:=p_base->'pedido'; r jsonb:=p_base->'reserva'; d jsonb; l jsonb; reservado integer; unidades integer; total integer:=0; bloqueos jsonb:='[]';
begin
 if p_tipo='ELIMINAR' then
   if p->>'estado'<>'INGRESADO' then bloqueos:=bloqueos||jsonb_build_array('Sólo se eliminan pedidos INGRESADOS.'); end if;
   if jsonb_array_length(p_base->'reservas')>0 then bloqueos:=bloqueos||jsonb_build_array('El pedido tiene reservas o despachos asociados. No se elimina su historial; revísalo desde Despachos.'); end if;
   if exists(select 1 from jsonb_array_elements(p_base->'detalles') x where (x->>'unidades_despachadas')::integer<>0) then bloqueos:=bloqueos||jsonb_build_array('Hay unidades despachadas. No elimines el pedido.'); end if;
   return jsonb_build_object('pedido_id',p->>'id','numero_pedido_cliente',p->>'numero_pedido_cliente',
     'unidades',(p->>'total_unidades')::integer,'skus',jsonb_array_length(p_base->'detalles'),'bloqueos',bloqueos,'puede_ejecutar',jsonb_array_length(bloqueos)=0);
 end if;
 if (select coalesce(sum((value->>'total_unidades')::bigint),0) from jsonb_array_elements(p_base->'detalles')) is distinct from (p->>'total_unidades')::bigint then
   raise exception 'La cabecera y los productos del pedido no coinciden. Revisa el pedido antes de despachar.'; end if;
 if r->>'estado'<>'ACTIVA' or p->>'estado'<>'PREPARADO' then bloqueos:=bloqueos||jsonb_build_array('La reserva no está ACTIVA con pedido PREPARADO. Actualiza antes de confirmar.'); end if;
 if jsonb_array_length(p_datos->'cantidades')<>jsonb_array_length(p_base->'detalles') then raise exception 'Completa todos los SKU, incluyendo cero cuando no salgan unidades.'; end if;
 for l in select value from jsonb_array_elements(p_datos->'cantidades') loop
   select value into d from jsonb_array_elements(p_base->'detalles') where value->>'id'=l->>'pedidoDetalleId';
   if not found then raise exception 'Una línea no pertenece al pedido.'; end if;
   unidades:=(l->>'unidades')::integer;
   select coalesce(sum((value->>'unidades')::integer),0) into reservado from jsonb_array_elements(p_base->'reserva_detalles') where value->>'pedido_detalle_id'=l->>'pedidoDetalleId';
   if (d->>'unidades_manejo')::integer<=0 or mod(unidades,(d->>'unidades_manejo')::integer)<>0 or unidades>reservado or unidades>(d->>'total_unidades')::integer then raise exception 'Revisa cantidades reservadas, pedidas y unidad de manejo.'; end if;
   total:=total+unidades;
 end loop;
 return jsonb_build_object('pedido_id',p->>'id','numero_pedido_cliente',p->>'numero_pedido_cliente','reserva_id',r->>'id',
   'unidades',total,'total_pedido',(p->>'total_unidades')::integer,'parcial',total<(p->>'total_unidades')::integer,
   'numero_factura',p_datos->>'numeroFactura','bloqueos',bloqueos,'puede_ejecutar',jsonb_array_length(bloqueos)=0);
end $body$;

create or replace function public.log_exigir_contexto(p_tipo text,p_objeto text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:contexto
declare rol text:=coalesce(current_setting('role',true),'none'); s uuid:=nullif(current_setting('cibuspan.logistica_request',true),'')::uuid;
begin
 if auth.uid() is null and (rol in ('postgres','supabase_admin','service_role') or rol='none' and session_user in ('postgres','supabase_admin')) then return; end if;
 perform public.log_autorizar(p_tipo);
 if not exists(select 1 from public.log_solicitudes_operacion where solicitud_id=s and actor=auth.uid() and tipo=p_tipo
   and estado='EJECUTANDO' and transaccion=txid_current()
   and datos->>case p_tipo when 'ELIMINAR' then 'pedidoId' else 'reservaId' end=p_objeto) then
     raise exception 'Actualiza la app: esta operación debe confirmarse completa con una solicitud segura.'; end if;
end $body$;

create or replace function public.log_exigir_confirmacion(p_reserva text,p_cantidades jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:confirmacion
declare rol text:=coalesce(current_setting('role',true),'none'); lineas jsonb;
begin
 perform public.log_exigir_contexto('DESPACHAR',p_reserva);
 if auth.uid() is null and (rol in ('postgres','supabase_admin','service_role') or rol='none' and session_user in ('postgres','supabase_admin')) then return; end if;
 select jsonb_agg(jsonb_build_object('pedidoDetalleId',(value->>'pedido_detalle_id')::uuid,'unidades',value->'unidades') order by value->>'pedido_detalle_id')
 into lineas from jsonb_array_elements(p_cantidades);
 update public.log_solicitudes_operacion set ejecutada=true where solicitud_id=nullif(current_setting('cibuspan.logistica_request',true),'')::uuid
   and tipo='DESPACHAR' and estado='EJECUTANDO' and not ejecutada and datos->'cantidades'=lineas and actor=auth.uid() and transaccion=txid_current();
 if not found then raise exception 'Las cantidades no corresponden a la solicitud o ya se ejecutó.'; end if;
end $body$;

create or replace function public.log_exigir_metadato(p_reserva text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:metadato
declare estado text;
begin
 select r.estado into estado from public.reservas_inventario r where r.id::text=p_reserva for update;
 if estado='ACTIVA' then perform public.log_exigir_contexto('DESPACHAR',p_reserva); end if;
end $body$;

create or replace function public.log_proteger_filas()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:trigger
begin
 if TG_OP='DELETE' then
   if TG_TABLE_NAME='pedidos' then perform public.log_exigir_contexto('ELIMINAR',old.id);
   else perform public.log_exigir_contexto('ELIMINAR',old.pedido_id); end if;
   return old;
 end if;
 if (new.estado='DESPACHADA' and old.estado is distinct from new.estado)
   or (old.estado='ACTIVA' and (new.numero_factura is distinct from old.numero_factura or new.conciliacion_aplica is distinct from old.conciliacion_aplica)) then
     perform public.log_exigir_contexto('DESPACHAR',old.id::text); end if;
 return new;
end $body$;
drop trigger if exists log_eliminacion_segura on public.pedidos;
create trigger log_eliminacion_segura before delete on public.pedidos for each row execute function public.log_proteger_filas();
drop trigger if exists log_eliminacion_segura on public.pedido_detalles;
create trigger log_eliminacion_segura before delete on public.pedido_detalles for each row execute function public.log_proteger_filas();
drop trigger if exists log_confirmacion_segura on public.reservas_inventario;
create trigger log_confirmacion_segura before update on public.reservas_inventario for each row execute function public.log_proteger_filas();

create or replace function public.prever_operacion_logistica(p_tipo text,p_datos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:prever
declare datos jsonb; b jsonb; plan jsonb;
begin
 perform public.log_autorizar(p_tipo); datos:=public.log_datos(p_tipo,p_datos);b:=public.log_base(p_tipo,datos);plan:=public.log_plan(p_tipo,datos,b);
 return plan||jsonb_build_object('token',md5(jsonb_build_object('tipo',p_tipo,'datos',datos,'base',b)::text));
end $body$;

create or replace function public.ejecutar_operacion_logistica(p_solicitud_id uuid,p_tipo text,p_datos jsonb,p_token text,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:ejecutar
declare s public.log_solicitudes_operacion%rowtype; datos jsonb; b jsonb; plan jsonb; r jsonb; pedido text; devuelto text; factura text; cantidades jsonb;
 contexto text:=current_setting('cibuspan.logistica_request',true);
begin
 perform public.log_autorizar(p_tipo);
 if auth.uid() is null or auth.uid() is distinct from p_usuario_esperado then raise exception 'La sesión cambió. Usa el usuario del intento.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud de operación.'; end if;
 perform set_config('lock_timeout','5s',true);datos:=public.log_datos(p_tipo,p_datos);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.logistica:'||p_solicitud_id::text,0));
 select * into s from public.log_solicitudes_operacion where solicitud_id=p_solicitud_id for update;
 if found then
   if s.actor<>auth.uid() then raise exception 'El intento pertenece a otro usuario.' using errcode='42501'; end if;
   if s.estado='ANULADA' then raise exception 'El intento está cerrado sin ejecutar. Actualiza y revisa otra vez.'; end if;
   if s.tipo<>p_tipo or s.datos is distinct from datos or s.estado<>'CONFIRMADA' then raise exception 'La solicitud corresponde a otra operación o datos.'; end if;
   return s.resultado||jsonb_build_object('repetida',true);
 end if;
 if p_tipo='ELIMINAR' then pedido:=datos->>'pedidoId';
 else
   select pedido_id into pedido from public.reservas_inventario where id=(datos->>'reservaId')::uuid for update;
   if not found then raise exception 'La reserva ya no existe.'; end if;
 end if;
 perform 1 from public.pedidos where id=pedido for update;
 if not found then raise exception 'El pedido ya no existe. Comprueba su intento anterior.'; end if;
 perform id from public.pedido_detalles where pedido_id=pedido order by id for update;
 if p_tipo='DESPACHAR' then
   perform id from public.reserva_detalles where reserva_id=(datos->>'reservaId')::uuid order by id for update;
   perform id from public.inventario_lotes where id in(select inventario_lote_id from public.reserva_detalles where reserva_id=(datos->>'reservaId')::uuid) order by id for update;
 end if;
 b:=public.log_base(p_tipo,datos);plan:=public.log_plan(p_tipo,datos,b);
 if p_token is null or p_token<>md5(jsonb_build_object('tipo',p_tipo,'datos',datos,'base',b)::text) then raise exception 'El pedido, reserva o inventario cambió desde la revisión. Actualiza y vuelve a confirmar.'; end if;
 if plan->>'puede_ejecutar'<>'true' then raise exception '%',plan->'bloqueos'->>0; end if;
 insert into public.log_solicitudes_operacion(solicitud_id,actor,tipo,datos,base,estado) values(p_solicitud_id,auth.uid(),p_tipo,datos,b,'EJECUTANDO');
 perform set_config('cibuspan.logistica_request',p_solicitud_id::text,true);
 if p_tipo='ELIMINAR' then
   delete from public.pedidos where id=pedido;
   if not found or exists(select 1 from public.pedido_detalles where pedido_id=pedido) then raise exception 'No se eliminó el pedido completo. Se revirtió la operación.'; end if;
   update public.log_solicitudes_operacion set ejecutada=true where solicitud_id=p_solicitud_id;
 else
   if public.activar_control_conciliacion_despacho(datos->>'reservaId') is distinct from true then raise exception 'No se confirmó la conciliación.'; end if;
   factura:=public.vincular_factura_despacho(datos->>'reservaId',datos->>'numeroFactura');
   if factura is distinct from datos->>'numeroFactura' then raise exception 'No se confirmó el vínculo de factura.'; end if;
   select jsonb_agg(jsonb_build_object('pedido_detalle_id',value->>'pedidoDetalleId','unidades',value->'unidades')) into cantidades from jsonb_array_elements(datos->'cantidades');
   devuelto:=public.confirmar_despacho_parcial_fefo(datos->>'reservaId',cantidades);
   if devuelto is distinct from pedido or not exists(select 1 from public.reservas_inventario where id=(datos->>'reservaId')::uuid and estado='DESPACHADA' and conciliacion_aplica and coalesce(numero_factura,'')=datos->>'numeroFactura') then
     raise exception 'No se confirmó el despacho completo. Se revirtió la operación.'; end if;
 end if;
 perform set_config('cibuspan.logistica_request',coalesce(contexto,''),true);
 r:=jsonb_build_object('estado','CONFIRMADA','solicitud_id',p_solicitud_id,'tipo',p_tipo,'pedido_id',pedido,
   'objeto_id',case when p_tipo='ELIMINAR' then pedido else datos->>'reservaId' end,'resumen',plan,'repetida',false);
 update public.log_solicitudes_operacion set estado='CONFIRMADA',resultado=r where solicitud_id=p_solicitud_id and ejecutada;
 if not found then raise exception 'No se confirmó la operación.'; end if;
 return r;
end $body$;

create or replace function public.resolver_operacion_logistica(p_solicitud_id uuid,p_tipo text,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-logistica-segura-v1:resolver
declare s public.log_solicitudes_operacion%rowtype;
begin
 perform public.log_autorizar(p_tipo);
 if auth.uid() is null or auth.uid() is distinct from p_usuario_esperado then raise exception 'La sesión cambió. Usa el usuario del intento.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud.'; end if;
 perform set_config('lock_timeout','5s',true);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.logistica:'||p_solicitud_id::text,0));
 select * into s from public.log_solicitudes_operacion where solicitud_id=p_solicitud_id for update;
 if found then
   if s.actor<>auth.uid() or s.tipo<>p_tipo then raise exception 'El intento pertenece a otro usuario u operación.' using errcode='42501'; end if;
   if s.estado='CONFIRMADA' then return s.resultado||jsonb_build_object('repetida',true); end if;
   if s.estado<>'ANULADA' then raise exception 'El intento requiere revisión.'; end if;
 else
   insert into public.log_solicitudes_operacion(solicitud_id,actor,tipo,estado) values(p_solicitud_id,auth.uid(),p_tipo,'ANULADA');
 end if;
 return jsonb_build_object('estado','ANULADA','solicitud_id',p_solicitud_id,'tipo',p_tipo);
end $body$;

-- Inserta sólo la compuerta después del control OP-12. Conserva cuerpos,
-- firmas, propietario, configuración y grants de las funciones instaladas.
do $envolver$
declare nombre text; firma text; id oid; src text; def text; prefijo text; gate text; pos integer; propietario text;
begin
 foreach nombre in array array['confirmar_despacho_parcial_fefo','activar_control_conciliacion_despacho','vincular_factura_despacho'] loop
   firma:=case nombre when 'confirmar_despacho_parcial_fefo' then 'text,jsonb' when 'vincular_factura_despacho' then 'text,text' else 'text' end;
   id:=to_regprocedure('public.'||nombre||'('||firma||')');
   select prosrc,pg_get_userbyid(proowner) into src,propietario from pg_proc where oid=id;
   if propietario in ('anon','authenticated','service_role') then raise exception 'El propietario de % requiere revisión.',nombre; end if;
   prefijo:=E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('||quote_literal(array['Pedidos','Despachos']::text)||E'::text[]);\n';
   gate:=E'  -- cibuspan-logistica-segura-v1\n  PERFORM public.'||case nombre when 'confirmar_despacho_parcial_fefo' then 'log_exigir_confirmacion(p_reserva_id,p_cantidades)' else 'log_exigir_metadato(p_reserva_id)' end||E';\n';
   if not starts_with(src,prefijo||gate) then
     if strpos(src,'-- cibuspan-logistica-segura-v1')>0 then raise exception 'La compuerta de % no coincide.',nombre; end if;
     def:=pg_get_functiondef(id);pos:=strpos(def,src);
     if pos=0 then raise exception 'No se pudo preservar %.',nombre; end if;
     execute overlay(def placing prefijo||gate||substr(src,length(prefijo)+1) from pos for length(src));
   end if;
   execute format('grant execute on function public.log_exigir_confirmacion(text,jsonb),public.log_exigir_metadato(text) to %I',propietario);
 end loop;
end $envolver$;

do $privilegios$
declare f record;
begin
 for f in select p.oid::regprocedure firma from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
   'log_autorizar','log_datos','log_base','log_plan','log_exigir_contexto','log_exigir_confirmacion','log_exigir_metadato','log_proteger_filas',
   'prever_operacion_logistica','ejecutar_operacion_logistica','resolver_operacion_logistica') loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.firma);
 end loop;
end $privilegios$;
grant execute on function public.prever_operacion_logistica(text,jsonb),public.ejecutar_operacion_logistica(uuid,text,jsonb,text,uuid),public.resolver_operacion_logistica(uuid,text,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
