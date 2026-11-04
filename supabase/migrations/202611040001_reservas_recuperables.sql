-- Preparar y liberar con comprobante. Instalar no crea ni libera reservas.
begin;
set local lock_timeout='5s';
do $preflight$
declare n text; firma text; src text; prefijo text;
begin
 if to_regprocedure('public.log_exigir_contexto(text,text)') is null or to_regprocedure('public.log_datos(text,jsonb)') is null then
   raise exception 'Instala primero OperacionesLogistica (202610270002). No se modificaron reservas.'; end if;
 foreach n in array array['reservar_pedido_fefo_parcial','liberar_reserva_fefo'] loop
   firma:=case n when 'reservar_pedido_fefo_parcial' then 'text,jsonb' else 'uuid' end;
   select prosrc into src from pg_proc where oid=to_regprocedure('public.'||n||'('||firma||')');
   prefijo:=E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('||quote_literal(array['Pedidos','Despachos']::text)||E'::text[]);\n';
   if src is null or not starts_with(src,prefijo) or (select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=n)<>1 then
     raise exception 'El contrato de % requiere revisión. No se instalaron reservas recuperables.',n; end if;
 end loop;
 if to_regclass('public.res_solicitudes_operacion') is not null and obj_description(to_regclass('public.res_solicitudes_operacion'),'pg_class') is distinct from 'cibuspan-reservas-seguras-v1' then
   raise exception 'Existe otra tabla de solicitudes de reserva. Revisar antes de modificar.'; end if;
end $preflight$;
create table if not exists public.res_solicitudes_operacion(
 solicitud_id uuid primary key, actor uuid not null, tipo text not null check(tipo in ('PREPARAR','LIBERAR')),
 datos jsonb, base jsonb, resultado jsonb, estado text not null check(estado in ('EJECUTANDO','CONFIRMADA','ANULADA')),
 ejecutada boolean not null default false,transaccion bigint not null default txid_current(),creado_en timestamptz not null default now(),
 check((estado='ANULADA' and datos is null and base is null and resultado is null and not ejecutada)
   or (estado='EJECUTANDO' and datos is not null and base is not null and resultado is null)
   or (estado='CONFIRMADA' and datos is not null and base is not null and resultado is not null and ejecutada))
);
comment on table public.res_solicitudes_operacion is 'cibuspan-reservas-seguras-v1';
alter table public.res_solicitudes_operacion enable row level security;
revoke all on public.res_solicitudes_operacion from public,anon,authenticated,service_role;

create or replace function public.res_autorizar(p_tipo text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:autorizar
begin
 if p_tipo not in ('PREPARAR','LIBERAR') or p_tipo is null then raise exception 'Operación de reserva inválida.'; end if;
 perform public.app_exigir_operacion(array['Pedidos','Despachos']);
end $body$;
create or replace function public.res_datos(p_tipo text,p_datos jsonb)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:datos
declare normal jsonb;
begin
 if jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Operación incompleta.'; end if;
 if p_tipo='LIBERAR' then
   if jsonb_typeof(p_datos->'reservaId') is distinct from 'string' or (p_datos->>'reservaId')::uuid is null then raise exception 'Selecciona la reserva.'; end if;
   return jsonb_build_object('reservaId',(p_datos->>'reservaId')::uuid);
 elsif p_tipo<>'PREPARAR' or p_tipo is null then raise exception 'Operación inválida.'; end if;
 if jsonb_typeof(p_datos->'pedidoId') is distinct from 'string' or length(trim(p_datos->>'pedidoId')) not between 1 and 200 then raise exception 'Selecciona el pedido.'; end if;
 -- Usa las mismas reglas de enteros/duplicados/total del despacho, sin factura.
 normal:=public.log_datos('DESPACHAR',jsonb_build_object('reservaId','00000000-0000-0000-0000-000000000000','numeroFactura','','cantidades',p_datos->'cantidades'));
 return jsonb_build_object('pedidoId',trim(p_datos->>'pedidoId'),'cantidades',normal->'cantidades');
end $body$;
create or replace function public.res_base(p_tipo text,p_datos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:base
declare b jsonb; lotes jsonb; ocupadas jsonb;
begin
 if p_tipo='LIBERAR' then return public.log_base('DESPACHAR',p_datos); end if;
 b:=public.log_base('ELIMINAR',p_datos);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into lotes from public.inventario_lotes x
 where x.producto_id in (select (value->>'producto_id')::uuid from jsonb_array_elements(b->'detalles'))
   and x.cantidad>0 and x.fecha_vencimiento>=current_date;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') into ocupadas from public.reserva_detalles d
 join public.reservas_inventario r on r.id=d.reserva_id and r.estado='ACTIVA'
 where d.inventario_lote_id in(select (value->>'id')::uuid from jsonb_array_elements(lotes));
 return b||jsonb_build_object('lotes',lotes,'ocupadas',ocupadas);
end $body$;
create or replace function public.res_plan(p_tipo text,p_datos jsonb,p_base jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:plan
declare p jsonb:=p_base->'pedido'; d jsonb; l jsonb; cant integer; total integer:=0; disp bigint; manejo integer; bloqueos jsonb:='[]';
begin
 if p_tipo='LIBERAR' then
   if p_base->'reserva'->>'estado'<>'ACTIVA' or p->>'estado'<>'PREPARADO' then bloqueos:=bloqueos||jsonb_build_array('Sólo se libera la reserva ACTIVA de un pedido PREPARADO. Actualiza el pedido.'); end if;
   if (select count(*) from jsonb_array_elements(p_base->'reservas') x where x->>'estado'='ACTIVA')<>1 then bloqueos:=bloqueos||jsonb_build_array('El pedido tiene un estado de reservas inconsistente. Solicita revisión.'); end if;
   select coalesce(sum((value->>'unidades')::integer),0) into total from jsonb_array_elements(p_base->'reserva_detalles');
 else
   if p->>'estado'<>'INGRESADO' or exists(select 1 from jsonb_array_elements(p_base->'reservas') x where x->>'estado' in ('ACTIVA','DESPACHADA')) then
     bloqueos:=bloqueos||jsonb_build_array('El pedido debe estar INGRESADO y sin reserva activa ni despacho.'); end if;
   if (select coalesce(sum((value->>'total_unidades')::bigint),0) from jsonb_array_elements(p_base->'detalles')) is distinct from (p->>'total_unidades')::bigint then
     raise exception 'La cabecera y los productos del pedido no coinciden.'; end if;
   if jsonb_array_length(p_datos->'cantidades')<>jsonb_array_length(p_base->'detalles') then raise exception 'Completa todos los SKU, incluyendo cero cuando no se preparen unidades.'; end if;
   for l in select value from jsonb_array_elements(p_datos->'cantidades') loop
     select value into d from jsonb_array_elements(p_base->'detalles') where value->>'id'=l->>'pedidoDetalleId';
     if not found then raise exception 'Una línea no pertenece al pedido.'; end if;
     cant:=(l->>'unidades')::integer; manejo:=(d->>'unidades_manejo')::integer;
     if manejo is null or manejo<=0 or mod(cant,manejo)<>0 or cant>(d->>'total_unidades')::integer or coalesce((d->>'unidades_despachadas')::integer,0)<>0 then
       raise exception 'Revisa cantidades, unidad de manejo y unidades ya despachadas.'; end if;
     -- La función FEFO requiere múltiplos completos por lote: no suma sobrantes.
     select coalesce(sum(floor(greatest((x->>'cantidad')::bigint-coalesce((select sum((v->>'unidades')::bigint) from jsonb_array_elements(p_base->'ocupadas') v where v->>'inventario_lote_id'=x->>'id'),0),0)/manejo)*manejo),0)
       into disp from jsonb_array_elements(p_base->'lotes') x where x->>'producto_id'=d->>'producto_id';
     if cant>disp then bloqueos:=bloqueos||jsonb_build_array('Stock despachable insuficiente para una línea. Actualiza o reduce las cantidades.'); end if;
     total:=total+cant;
   end loop;
 end if;
 return jsonb_build_object('pedido_id',p->>'id','numero_pedido_cliente',p->>'numero_pedido_cliente','unidades',total,
   'total_pedido',(p->>'total_unidades')::integer,'parcial',total<(p->>'total_unidades')::integer,
   'reserva_id',p_datos->>'reservaId','bloqueos',bloqueos,'puede_ejecutar',jsonb_array_length(bloqueos)=0);
end $body$;
create or replace function public.res_exigir_contexto(p_tipo text,p_objeto text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:contexto
declare rol text:=coalesce(current_setting('role',true),'none');
begin
 if auth.uid() is null and (rol in ('postgres','supabase_admin','service_role') or rol='none' and session_user in ('postgres','supabase_admin')) then return; end if;
 perform public.res_autorizar(p_tipo);
 if not exists(select 1 from public.res_solicitudes_operacion where solicitud_id=nullif(current_setting('cibuspan.reserva_request',true),'')::uuid
   and actor=auth.uid() and transaccion=txid_current() and tipo=p_tipo and estado='EJECUTANDO'
   and datos->>case p_tipo when 'PREPARAR' then 'pedidoId' else 'reservaId' end=p_objeto) then
   raise exception 'Actualiza la app: preparar o liberar requiere una solicitud recuperable.'; end if;
end $body$;
create or replace function public.res_exigir_llamada(p_tipo text,p_objeto text,p_cantidades jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:llamada
declare rol text:=coalesce(current_setting('role',true),'none'); lineas jsonb;
begin
 perform public.res_exigir_contexto(p_tipo,p_objeto);
 if auth.uid() is null and (rol in ('postgres','supabase_admin','service_role') or rol='none' and session_user in ('postgres','supabase_admin')) then return; end if;
 if p_tipo='PREPARAR' then select jsonb_agg(jsonb_build_object('pedidoDetalleId',(value->>'pedido_detalle_id')::uuid,'unidades',value->'unidades') order by value->>'pedido_detalle_id') into lineas from jsonb_array_elements(p_cantidades); end if;
 update public.res_solicitudes_operacion set ejecutada=true where solicitud_id=nullif(current_setting('cibuspan.reserva_request',true),'')::uuid
   and estado='EJECUTANDO' and actor=auth.uid() and tipo=p_tipo and transaccion=txid_current() and not ejecutada
   and (p_tipo='LIBERAR' or datos->'cantidades'=lineas);
 if not found then raise exception 'Las cantidades no corresponden al intento o ya se ejecutó.'; end if;
end $body$;
create or replace function public.res_proteger_filas()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:trigger
begin
 if TG_OP='INSERT' then perform public.res_exigir_contexto('PREPARAR',new.pedido_id);
 elsif new.estado='LIBERADA' and old.estado is distinct from new.estado then perform public.res_exigir_contexto('LIBERAR',old.id::text); end if;
 return new;
end $body$;
drop trigger if exists res_operacion_segura on public.reservas_inventario;
create trigger res_operacion_segura before insert or update on public.reservas_inventario for each row execute function public.res_proteger_filas();

create or replace function public.prever_operacion_reserva(p_tipo text,p_datos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:prever
declare d jsonb; b jsonb;
begin
 perform public.res_autorizar(p_tipo);d:=public.res_datos(p_tipo,p_datos);b:=public.res_base(p_tipo,d);
 return public.res_plan(p_tipo,d,b)||jsonb_build_object('token',md5(jsonb_build_object('tipo',p_tipo,'datos',d,'base',b)::text));
end $body$;
create or replace function public.ejecutar_operacion_reserva(p_solicitud_id uuid,p_tipo text,p_datos jsonb,p_token text,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:ejecutar
declare s public.res_solicitudes_operacion%rowtype; d jsonb; b jsonb; plan jsonb; r jsonb; pedido text; reserva uuid; lineas jsonb;
 contexto text:=current_setting('cibuspan.reserva_request',true);
begin
 perform public.res_autorizar(p_tipo);
 if auth.uid() is null or auth.uid() is distinct from p_usuario_esperado then raise exception 'La sesión cambió. Usa el usuario del intento.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud de reserva.'; end if;
 perform set_config('lock_timeout','5s',true);d:=public.res_datos(p_tipo,p_datos);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.reserva:'||p_solicitud_id::text,0));
 select * into s from public.res_solicitudes_operacion where solicitud_id=p_solicitud_id for update;
 if found then
   if s.actor<>auth.uid() then raise exception 'El intento pertenece a otro usuario.' using errcode='42501'; end if;
   if s.tipo<>p_tipo then raise exception 'La solicitud corresponde a otra operación.'; end if;
   if s.estado='ANULADA' then raise exception 'El intento está cerrado sin ejecutar. Actualiza y revisa otra vez.'; end if;
   if s.datos is distinct from d or s.estado<>'CONFIRMADA' then raise exception 'La solicitud corresponde a otros datos.'; end if;
   return s.resultado||jsonb_build_object('repetida',true);
 end if;
 if p_tipo='PREPARAR' then pedido:=d->>'pedidoId';
 else
   reserva:=(d->>'reservaId')::uuid;
   select pedido_id into pedido from public.reservas_inventario where id=reserva for update;
   if not found then raise exception 'La reserva ya no existe.'; end if;
 end if;
 perform 1 from public.pedidos where id=pedido for update;
 if not found then raise exception 'El pedido ya no existe.'; end if;
 perform id from public.pedido_detalles where pedido_id=pedido order by id for update;
 if p_tipo='PREPARAR' then
   -- Serializa preparaciones recuperables. Los lotes también se bloquean frente
   -- a confirmaciones/ajustes, manteniendo FEFO de la función instalada.
   perform pg_advisory_xact_lock(hashtextextended('cibuspan.reservas:preparar',0));
   perform id from public.inventario_lotes where producto_id in(select producto_id from public.pedido_detalles where pedido_id=pedido)
     and cantidad>0 and fecha_vencimiento>=current_date order by id for update;
 else perform id from public.reserva_detalles where reserva_id=reserva order by id for update;
 end if;
 b:=public.res_base(p_tipo,d);plan:=public.res_plan(p_tipo,d,b);
 if p_token is null or p_token<>md5(jsonb_build_object('tipo',p_tipo,'datos',d,'base',b)::text) then raise exception 'El pedido, reserva o inventario cambió desde la revisión. Actualiza y revisa otra vez.'; end if;
 if plan->>'puede_ejecutar'<>'true' then raise exception '%',plan->'bloqueos'->>0; end if;
 insert into public.res_solicitudes_operacion(solicitud_id,actor,tipo,datos,base,estado) values(p_solicitud_id,auth.uid(),p_tipo,d,b,'EJECUTANDO');
 perform set_config('cibuspan.reserva_request',p_solicitud_id::text,true);
 if p_tipo='PREPARAR' then
   select jsonb_agg(jsonb_build_object('pedido_detalle_id',value->>'pedidoDetalleId','unidades',value->'unidades')) into lineas from jsonb_array_elements(d->'cantidades');
   reserva:=public.reservar_pedido_fefo_parcial(pedido,lineas)::uuid;
   if reserva is null or not exists(select 1 from public.reservas_inventario where id=reserva and pedido_id=pedido and estado='ACTIVA')
     or not exists(select 1 from public.pedidos where id=pedido and estado='PREPARADO') then raise exception 'No se confirmó la preparación completa.'; end if;
   if exists(select 1 from jsonb_array_elements(d->'cantidades') x where (x->>'unidades')::bigint<>(select coalesce(sum(unidades),0) from public.reserva_detalles where reserva_id=reserva and pedido_detalle_id=(x->>'pedidoDetalleId')::uuid)) then
     raise exception 'Las cantidades reservadas no coinciden. Se revirtió la preparación.'; end if;
 else
   perform public.liberar_reserva_fefo(reserva);
   if not exists(select 1 from public.reservas_inventario where id=reserva and pedido_id=pedido and estado='LIBERADA')
     or not exists(select 1 from public.pedidos where id=pedido and estado='INGRESADO') then raise exception 'No se confirmó la liberación completa.'; end if;
 end if;
 perform set_config('cibuspan.reserva_request',coalesce(contexto,''),true);
 plan:=plan||jsonb_build_object('reserva_id',reserva);
 r:=jsonb_build_object('estado','CONFIRMADA','solicitud_id',p_solicitud_id,'tipo',p_tipo,'pedido_id',pedido,'reserva_id',reserva,
   'objeto_id',case p_tipo when 'PREPARAR' then pedido else reserva::text end,'resumen',plan,'repetida',false);
 update public.res_solicitudes_operacion set estado='CONFIRMADA',resultado=r where solicitud_id=p_solicitud_id and ejecutada;
 if not found then raise exception 'No se confirmó el comprobante.'; end if;
 return r;
end $body$;
create or replace function public.resolver_operacion_reserva(p_solicitud_id uuid,p_tipo text,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-reservas-seguras-v1:resolver
declare s public.res_solicitudes_operacion%rowtype;
begin
 perform public.res_autorizar(p_tipo);
 if auth.uid() is null or auth.uid() is distinct from p_usuario_esperado then raise exception 'La sesión cambió. Usa el usuario del intento.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud de reserva.'; end if;
 perform set_config('lock_timeout','5s',true);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.reserva:'||p_solicitud_id::text,0));
 select * into s from public.res_solicitudes_operacion where solicitud_id=p_solicitud_id for update;
 if found then
   if s.actor<>auth.uid() or s.tipo<>p_tipo then raise exception 'El intento pertenece a otro usuario u operación.' using errcode='42501'; end if;
   if s.estado='CONFIRMADA' then return s.resultado||jsonb_build_object('repetida',true); end if;
   if s.estado<>'ANULADA' then raise exception 'El intento requiere revisión.'; end if;
 else insert into public.res_solicitudes_operacion(solicitud_id,actor,tipo,estado) values(p_solicitud_id,auth.uid(),p_tipo,'ANULADA');
 end if;
 return jsonb_build_object('estado','ANULADA','solicitud_id',p_solicitud_id,'tipo',p_tipo);
end $body$;
-- Preserva cuerpos originales, firmas, propietarios, configuración y grants.
do $envolver$
declare n text; firma text; f oid; src text; prefijo text; gate text; def text; pos integer; propietario text;
begin
 foreach n in array array['reservar_pedido_fefo_parcial','liberar_reserva_fefo'] loop
   firma:=case n when 'reservar_pedido_fefo_parcial' then 'text,jsonb' else 'uuid' end;f:=to_regprocedure('public.'||n||'('||firma||')');
   select prosrc,pg_get_userbyid(proowner) into src,propietario from pg_proc where oid=f;
   if propietario in ('anon','authenticated','service_role') then raise exception 'Propietario de % requiere revisión.',n; end if;
   prefijo:=E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('||quote_literal(array['Pedidos','Despachos']::text)||E'::text[]);\n';
   gate:=E'  -- cibuspan-reservas-seguras-v1\n  PERFORM public.res_exigir_llamada('||case n when 'reservar_pedido_fefo_parcial' then '''PREPARAR'',p_pedido_id,p_cantidades' else '''LIBERAR'',p_reserva_id::text,null' end||E');\n';
   if not starts_with(src,prefijo||gate) then
     if strpos(src,'-- cibuspan-reservas-seguras-v1')>0 then raise exception 'Compuerta de % no coincide.',n; end if;
     def:=pg_get_functiondef(f);pos:=strpos(def,src);if pos=0 then raise exception 'No se pudo preservar %.',n; end if;
     execute overlay(def placing prefijo||gate||substr(src,length(prefijo)+1) from pos for length(src));
   end if;
   execute format('grant execute on function public.res_exigir_llamada(text,text,jsonb) to %I',propietario);
 end loop;
end $envolver$;
do $privilegios$
declare f record;
begin
 for f in select p.oid::regprocedure firma from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
   'res_autorizar','res_datos','res_base','res_plan','res_exigir_contexto','res_exigir_llamada','res_proteger_filas',
   'prever_operacion_reserva','ejecutar_operacion_reserva','resolver_operacion_reserva') loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.firma);
 end loop;
end $privilegios$;
grant execute on function public.prever_operacion_reserva(text,jsonb),public.ejecutar_operacion_reserva(uuid,text,jsonb,text,uuid),public.resolver_operacion_reserva(uuid,text,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
