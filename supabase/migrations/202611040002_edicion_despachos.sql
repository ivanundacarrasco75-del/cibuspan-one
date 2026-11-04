-- Corrección explícita de un despacho cerrado. Instalar no corrige documentos.
begin;
set local lock_timeout='5s';
do $preflight$ begin
 if to_regprocedure('public.log_base(text,jsonb)') is null or to_regprocedure('public.resolver_operacion_reserva(uuid,text,uuid)') is null
   or to_regclass('public.inv_arranque_cortes') is null then raise exception 'Faltan los contratos instalados de logística/reservas/arranque.'; end if;
 perform inventario_lote_id,solicitud_id,solicitud_datos,documento from public.inv_kardex_movimientos limit 0;
 if to_regclass('public.ed_solicitudes_despacho') is not null and obj_description(to_regclass('public.ed_solicitudes_despacho'),'pg_class') is distinct from 'cibuspan-edicion-despacho-v1' then raise exception 'Existe otra tabla de correcciones. Revisar antes de modificar.'; end if;
end $preflight$;
create table if not exists public.ed_solicitudes_despacho(
 solicitud_id uuid primary key,actor uuid not null,tipo text not null check(tipo='CORREGIR'),datos jsonb,base jsonb,resultado jsonb,
 estado text not null check(estado in ('EJECUTANDO','CONFIRMADA','ANULADA')),transaccion bigint not null default txid_current(),creado_en timestamptz not null default now(),
 check((estado='ANULADA' and datos is null and base is null and resultado is null) or (estado='EJECUTANDO' and datos is not null and base is not null and resultado is null)
   or (estado='CONFIRMADA' and datos is not null and base is not null and resultado is not null))
);
comment on table public.ed_solicitudes_despacho is 'cibuspan-edicion-despacho-v1';
alter table public.ed_solicitudes_despacho enable row level security;
revoke all on public.ed_solicitudes_despacho from public,anon,authenticated,service_role;
create or replace function public.ed_autorizar(p_tipo text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:autorizar
begin
 if p_tipo is distinct from 'CORREGIR' then raise exception 'Operación inválida.'; end if;
 perform public.app_exigir_operacion(array['Pedidos','Despachos']);
end $body$;
create or replace function public.ed_datos(p_datos jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:datos
declare l jsonb;lineas jsonb:='[]';claves text[]:=array[]::text[];clave text;n numeric;total numeric:=0;detalle uuid;lote uuid;
begin
 if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(p_datos->'reservaId') is distinct from 'string' or (p_datos->>'reservaId')::uuid is null then raise exception 'Selecciona el despacho.'; end if;
 if jsonb_typeof(p_datos->'motivo') is distinct from 'string' or length(trim(p_datos->>'motivo')) not between 8 and 1000 then raise exception 'Explica el motivo de corrección (8 a 1000 caracteres).'; end if;
 if jsonb_typeof(p_datos->'lineas') is distinct from 'array' or jsonb_array_length(p_datos->'lineas') not between 1 and 3000 then raise exception 'Completa las cantidades y lotes del despacho.'; end if;
 for l in select value from jsonb_array_elements(p_datos->'lineas') loop
   if jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(l->'pedidoDetalleId') is distinct from 'string' or jsonb_typeof(l->'inventarioLoteId') is distinct from 'string' then raise exception 'Completa SKU y lote de cada línea.'; end if;
   detalle:=(l->>'pedidoDetalleId')::uuid;lote:=(l->>'inventarioLoteId')::uuid;clave:=detalle::text||':'||lote::text;
   if detalle is null or lote is null or clave=any(claves) or jsonb_typeof(l->'unidades') is distinct from 'number' then raise exception 'Revisa líneas, lotes repetidos y cantidades.'; end if;
   n:=(l->>'unidades')::numeric;
   if n<0 or n<>trunc(n) or n>2147483647 then raise exception 'Usa unidades enteras sin negativos.'; end if;
   total:=total+n;if total>2147483647 then raise exception 'Total fuera de rango.'; end if;
   claves:=array_append(claves,clave);lineas:=lineas||jsonb_build_array(jsonb_build_object('pedidoDetalleId',detalle,'inventarioLoteId',lote,'unidades',n::integer));
 end loop;
 if total=0 then raise exception 'La corrección debe conservar al menos una unidad de manejo; no es una anulación de despacho.'; end if;
 select jsonb_agg(value order by value->>'pedidoDetalleId',value->>'inventarioLoteId') into lineas from jsonb_array_elements(lineas);
 return jsonb_build_object('reservaId',(p_datos->>'reservaId')::uuid,'motivo',trim(p_datos->>'motivo'),'lineas',lineas);
end $body$;
create or replace function public.ed_base(p_datos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:base
declare b jsonb;lotes jsonb;ocupadas jsonb;corte jsonb;confirmado timestamptz;
begin
 b:=public.log_base('DESPACHAR',p_datos);
 select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') into lotes from public.inventario_lotes i where id in(
   select (value->>'inventario_lote_id')::uuid from jsonb_array_elements(b->'reserva_detalles')
   union select (value->>'inventarioLoteId')::uuid from jsonb_array_elements(coalesce(p_datos->'lineas','[]')));
 select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') into ocupadas from public.reserva_detalles d
 join public.reservas_inventario r on r.id=d.reserva_id and r.estado='ACTIVA'
 where d.inventario_lote_id in(select (value->>'id')::uuid from jsonb_array_elements(lotes));
 select jsonb_build_object('fecha_inicio',fecha_inicio,'aplicado_en',aplicado_en) into corte from public.inv_arranque_cortes where estado='APLICADO';
 -- Fecha comprobada de ejecución de la salida, no fecha de entrega solicitada.
 select min(creado_en) into confirmado from public.log_solicitudes_operacion where tipo='DESPACHAR' and estado='CONFIRMADA' and datos->>'reservaId'=p_datos->>'reservaId';
 return b||jsonb_build_object('lotes',lotes,'ocupadas',ocupadas,'corte',corte,'confirmado_en',confirmado);
end $body$;
create or replace function public.ed_plan(p_datos jsonb,p_base jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:plan
declare p jsonb:=p_base->'pedido';l jsonb;d jsonb;i jsonb;antes bigint;nuevo bigint;ocupado bigint;total bigint:=0;entrada bigint:=0;salida bigint:=0;delta bigint;bloqueos jsonb:='[]';cambios boolean:=false;
begin
 if p_base->'reserva'->>'estado'<>'DESPACHADA' or p->>'estado'<>'DESPACHADO' then bloqueos:=bloqueos||jsonb_build_array('Sólo se corrige un despacho confirmado y cerrado.'); end if;
 if (select count(*) from jsonb_array_elements(p_base->'reservas') x where x->>'estado'='DESPACHADA')>1 then raise exception 'Hay varios despachos para el pedido. Requiere revisión.'; end if;
 if exists(select 1 from jsonb_array_elements(p_base->'reservas') x where x->>'estado'='ACTIVA') then raise exception 'El pedido tiene una reserva activa; revisa su estado.'; end if;
 if p_base->'corte'<>'null'::jsonb and p_base->'corte' is not null and
   (p_base->>'confirmado_en' is null or (p_base->>'confirmado_en')::timestamptz<(p_base->'corte'->>'aplicado_en')::timestamptz) then
   bloqueos:=bloqueos||jsonb_build_array('Este despacho es anterior al conteo de arranque o no tiene fecha de salida comprobada. No altera el inventario del nuevo período.'); end if;
 if (select coalesce(sum((value->>'total_unidades')::bigint),0) from jsonb_array_elements(p_base->'detalles')) is distinct from (p->>'total_unidades')::bigint then raise exception 'La cabecera y los productos del pedido no coinciden.'; end if;
 if exists(select 1 from jsonb_array_elements(p_base->'reserva_detalles') x group by x->>'pedido_detalle_id',x->>'inventario_lote_id' having count(*)>1) then raise exception 'Hay asignaciones duplicadas en el despacho; solicita revisión.'; end if;
 -- Cada asignación previa debe conservarse en la propuesta, aun con cero.
 if exists(select 1 from jsonb_array_elements(p_base->'reserva_detalles') rd where not exists(select 1 from jsonb_array_elements(p_datos->'lineas') x where x->>'pedidoDetalleId'=rd->>'pedido_detalle_id' and x->>'inventarioLoteId'=rd->>'inventario_lote_id')) then raise exception 'No omitas lotes originales; escribe cero si se registraron por error.'; end if;
 for d in select value from jsonb_array_elements(p_base->'detalles') loop
   select coalesce(sum((value->>'unidades')::bigint),0) into antes from jsonb_array_elements(p_base->'reserva_detalles') where value->>'pedido_detalle_id'=d->>'id';
   if antes is distinct from (d->>'unidades_despachadas')::bigint then raise exception 'El despacho y las unidades registradas no coinciden. Solicita revisión antes de corregir.'; end if;
   select coalesce(sum((value->>'unidades')::bigint),0) into nuevo from jsonb_array_elements(p_datos->'lineas') where value->>'pedidoDetalleId'=d->>'id';
   if nuevo>(d->>'total_unidades')::bigint then raise exception 'No puedes registrar más unidades que las pedidas.'; end if;
 end loop;
 for l in select value from jsonb_array_elements(p_datos->'lineas') loop
   select value into d from jsonb_array_elements(p_base->'detalles') where value->>'id'=l->>'pedidoDetalleId';
   if not found then raise exception 'Una línea no pertenece al pedido.'; end if;
   select value into i from jsonb_array_elements(p_base->'lotes') where value->>'id'=l->>'inventarioLoteId' and value->>'producto_id'=d->>'producto_id';
   if not found then raise exception 'El lote no existe o pertenece a otro SKU.'; end if;
   nuevo:=(l->>'unidades')::bigint;
   if (d->>'unidades_manejo')::integer<=0 or mod(nuevo,(d->>'unidades_manejo')::integer)<>0 then raise exception 'Respeta la unidad de manejo de cada SKU y lote.'; end if;
   select coalesce(sum((value->>'unidades')::bigint),0) into antes from jsonb_array_elements(p_base->'reserva_detalles') where value->>'pedido_detalle_id'=d->>'id' and value->>'inventario_lote_id'=i->>'id';
   if nuevo<>antes then
     cambios:=true;
     if i->>'inv_archivo_id' is not null then raise exception 'No se reactiva ni modifica un lote archivado.'; end if;
     if nuevo>antes and ((i->>'fecha_vencimiento')::date<current_date or (i->>'fecha_produccion')::date>current_date) then raise exception 'No se aumenta la salida de un lote vencido o de producción futura.'; end if;
   end if;
   total:=total+nuevo;
 end loop;
 -- Ajusta físico por lote agregado, incluso si cambian asignaciones entre SKU.
 for i in select value from jsonb_array_elements(p_base->'lotes') loop
   select coalesce(sum((value->>'unidades')::bigint),0) into antes from jsonb_array_elements(p_base->'reserva_detalles') where value->>'inventario_lote_id'=i->>'id';
   select coalesce(sum((value->>'unidades')::bigint),0) into nuevo from jsonb_array_elements(p_datos->'lineas') where value->>'inventarioLoteId'=i->>'id';
   delta:=nuevo-antes;
   if (i->>'cantidad')::bigint-delta>2147483647 then raise exception 'El stock corregido excede el rango permitido.'; end if;
   select coalesce(sum((value->>'unidades')::bigint),0) into ocupado from jsonb_array_elements(p_base->'ocupadas') where value->>'inventario_lote_id'=i->>'id';
   if delta>0 and delta>greatest((i->>'cantidad')::bigint-ocupado,0) then bloqueos:=bloqueos||jsonb_build_array('Stock disponible insuficiente en el lote seleccionado; hay otras reservas que se deben respetar.'); end if;
   entrada:=entrada+greatest(-delta,0);salida:=salida+greatest(delta,0);
 end loop;
 if not cambios then bloqueos:=bloqueos||jsonb_build_array('No hay cambios de cantidades o lotes para guardar.'); end if;
 return jsonb_build_object('pedido_id',p->>'id','numero_pedido_cliente',p->>'numero_pedido_cliente','reserva_id',p_datos->>'reservaId','unidades',total,
 'unidades_anteriores',(select coalesce(sum((value->>'unidades')::bigint),0) from jsonb_array_elements(p_base->'reserva_detalles')),
 'entrada_stock',entrada,'salida_stock',salida,'motivo',p_datos->>'motivo','total_pedido',(p->>'total_unidades')::integer,'parcial',total<(p->>'total_unidades')::integer,
 'bloqueos',bloqueos,'puede_ejecutar',jsonb_array_length(bloqueos)=0);
end $body$;
create or replace function public.ed_exigir_contexto(p_reserva uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:contexto
declare rol text:=coalesce(current_setting('role',true),'none');
begin
 if auth.uid() is null and (rol in ('postgres','supabase_admin','service_role') or rol='none' and session_user in ('postgres','supabase_admin')) then return; end if;
 perform public.ed_autorizar('CORREGIR');
 if not exists(select 1 from public.ed_solicitudes_despacho where solicitud_id=nullif(current_setting('cibuspan.edicion_despacho',true),'')::uuid and actor=auth.uid() and transaccion=txid_current()
   and estado='EJECUTANDO' and datos->>'reservaId'=p_reserva::text) then raise exception 'Usa Editar despacho para corregir cantidades con trazabilidad.'; end if;
end $body$;
create or replace function public.ed_proteger_filas()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:trigger
declare r uuid;
begin
 if TG_TABLE_NAME='reserva_detalles' then
   if TG_OP<>'INSERT' and exists(select 1 from public.reservas_inventario where id=old.reserva_id and estado='DESPACHADA') then perform public.ed_exigir_contexto(old.reserva_id); end if;
   if TG_OP<>'DELETE' and exists(select 1 from public.reservas_inventario where id=new.reserva_id and estado='DESPACHADA') then perform public.ed_exigir_contexto(new.reserva_id); end if;
 elsif TG_TABLE_NAME='pedido_detalles' then
   if new.unidades_despachadas is distinct from old.unidades_despachadas and exists(select 1 from public.pedidos where id=old.pedido_id and estado='DESPACHADO') then
     for r in select id from public.reservas_inventario where pedido_id=old.pedido_id and estado='DESPACHADA' loop perform public.ed_exigir_contexto(r); end loop;
   end if;
 elsif old.estado='DESPACHADA' and new.estado is distinct from old.estado then perform public.ed_exigir_contexto(old.id); end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end $body$;
drop trigger if exists ed_correccion_segura on public.reserva_detalles;
create trigger ed_correccion_segura before insert or update or delete on public.reserva_detalles for each row execute function public.ed_proteger_filas();
drop trigger if exists ed_correccion_segura on public.pedido_detalles;
create trigger ed_correccion_segura before update on public.pedido_detalles for each row execute function public.ed_proteger_filas();
drop trigger if exists ed_correccion_segura on public.reservas_inventario;
create trigger ed_correccion_segura before update on public.reservas_inventario for each row execute function public.ed_proteger_filas();
create or replace function public.obtener_edicion_despacho(p_reserva_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:editor
declare b jsonb;detalles jsonb;lotes jsonb;historial jsonb;
begin
 perform public.ed_autorizar('CORREGIR');b:=public.ed_base(jsonb_build_object('reservaId',p_reserva_id,'lineas','[]'::jsonb));
 select jsonb_agg(x||jsonb_build_object('nombre',p.nombre,'codigo',p.codigo) order by x->>'id') into detalles from jsonb_array_elements(b->'detalles') x left join public.productos p on p.id=(x->>'producto_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('disponible',greatest(i.cantidad-coalesce((select sum(d.unidades) from public.reserva_detalles d join public.reservas_inventario r on r.id=d.reserva_id and r.estado='ACTIVA' where d.inventario_lote_id=i.id),0),0)) order by i.fecha_vencimiento,i.id),'[]') into lotes
 from public.inventario_lotes i where i.producto_id in(select (value->>'producto_id')::uuid from jsonb_array_elements(b->'detalles'))
   and (i.inv_archivo_id is null or i.id in(select (value->>'inventario_lote_id')::uuid from jsonb_array_elements(b->'reserva_detalles')));
 select coalesce(jsonb_agg(jsonb_build_object('solicitud_id',s.solicitud_id,'creado_en',s.creado_en,'responsable',p.nombre,'motivo',s.datos->>'motivo','antes',s.resultado->'resumen'->'unidades_anteriores','despues',s.resultado->'resumen'->'unidades') order by s.creado_en desc),'[]') into historial
 from public.ed_solicitudes_despacho s left join public.app_profiles p on p.user_id=s.actor where s.estado='CONFIRMADA' and s.datos->>'reservaId'=p_reserva_id::text;
 return jsonb_build_object('pedido_id',b->'pedido'->>'id','reserva_id',p_reserva_id,'detalles',coalesce(detalles,'[]'),'asignaciones',b->'reserva_detalles','lotes',lotes,'historial',historial);
end $body$;
create or replace function public.prever_edicion_despacho(p_tipo text,p_datos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:prever
declare d jsonb;b jsonb;
begin
 perform public.ed_autorizar(p_tipo);d:=public.ed_datos(p_datos);b:=public.ed_base(d);
 return public.ed_plan(d,b)||jsonb_build_object('token',md5(jsonb_build_object('datos',d,'base',b)::text));
end $body$;
create or replace function public.ejecutar_edicion_despacho(p_solicitud_id uuid,p_tipo text,p_datos jsonb,p_token text,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:ejecutar
declare s public.ed_solicitudes_despacho%rowtype;d jsonb;b jsonb;plan jsonb;r jsonb;reserva uuid;pedido text;i jsonb;antes bigint;despues bigint;contexto text:=current_setting('cibuspan.edicion_despacho',true);kardex text:=current_setting('cibuspan.kardex_contexto',true);
begin
 perform public.ed_autorizar(p_tipo);
 if auth.uid() is null or auth.uid() is distinct from p_usuario_esperado then raise exception 'La sesión cambió. Usa el usuario del intento.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud.'; end if;
 perform set_config('lock_timeout','5s',true);d:=public.ed_datos(p_datos);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.edicion:'||p_solicitud_id::text,0));
 select * into s from public.ed_solicitudes_despacho where solicitud_id=p_solicitud_id for update;
 if found then
   if s.actor<>auth.uid() then raise exception 'El intento pertenece a otro usuario.' using errcode='42501'; end if;
   if s.estado='ANULADA' then raise exception 'El intento está cerrado sin ejecutar. Revisa nuevamente.'; end if;
   if s.datos is distinct from d or s.estado<>'CONFIRMADA' then raise exception 'La solicitud corresponde a otros datos.'; end if;
   return s.resultado||jsonb_build_object('repetida',true);
 end if;
 reserva:=(d->>'reservaId')::uuid;select pedido_id into pedido from public.reservas_inventario where id=reserva for update;
 if not found then raise exception 'El despacho ya no existe.'; end if;
 perform id from public.pedidos where id=pedido for update;perform id from public.pedido_detalles where pedido_id=pedido order by id for update;
 perform id from public.reserva_detalles where reserva_id=reserva order by id for update;
 -- Mismo mutex que las preparaciones, además de bloquear los lotes exactos.
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.reservas:preparar',0));
 perform id from public.inventario_lotes where id in(select inventario_lote_id from public.reserva_detalles where reserva_id=reserva union select (value->>'inventarioLoteId')::uuid from jsonb_array_elements(d->'lineas')) order by id for update;
 b:=public.ed_base(d);plan:=public.ed_plan(d,b);
 if p_token is null or p_token<>md5(jsonb_build_object('datos',d,'base',b)::text) then raise exception 'El despacho o inventario cambió. Actualiza y vuelve a revisar.'; end if;
 if plan->>'puede_ejecutar'<>'true' then raise exception '%',plan->'bloqueos'->>0; end if;
 insert into public.ed_solicitudes_despacho(solicitud_id,actor,tipo,datos,base,estado) values(p_solicitud_id,auth.uid(),'CORREGIR',d,b,'EJECUTANDO');
 perform set_config('cibuspan.edicion_despacho',p_solicitud_id::text,true);
 for i in select value from jsonb_array_elements(b->'lotes') loop
   select coalesce(sum((value->>'unidades')::bigint),0) into antes from jsonb_array_elements(b->'reserva_detalles') where value->>'inventario_lote_id'=i->>'id';
   select coalesce(sum((value->>'unidades')::bigint),0) into despues from jsonb_array_elements(d->'lineas') where value->>'inventarioLoteId'=i->>'id';
   if antes<>despues then
     -- solicitud_id del Kardex es UNIQUE por movimiento, no por operación.
     perform set_config('cibuspan.kardex_contexto',jsonb_build_object('fecha',(now() at time zone 'America/Guayaquil')::date,
       'clase',case when antes>despues then 'ENTRADA' else 'SALIDA' end,'motivo','Corrección de despacho: '||(d->>'motivo'),'documento',reserva,
       'solicitud_id',md5(p_solicitud_id::text||':lote:'||(i->>'id'))::uuid,
       'solicitud_datos',jsonb_build_object('solicitud_correccion',p_solicitud_id,'datos',d,'lote_id',i->>'id','diferencia',antes-despues))::text,true);
     update public.inventario_lotes set cantidad=cantidad+antes-despues where id=(i->>'id')::uuid;
     if not exists(select 1 from public.inventario_lotes where id=(i->>'id')::uuid and cantidad=(i->>'cantidad')::bigint+antes-despues) then raise exception 'No se confirmó el ajuste completo del lote.'; end if;
   end if;
 end loop;
 -- Conserva IDs de asignaciones existentes. Sólo quita las puestas en cero.
 for i in select value from jsonb_array_elements(d->'lineas') loop
   if (i->>'unidades')::integer=0 then
     delete from public.reserva_detalles where reserva_id=reserva and pedido_detalle_id=(i->>'pedidoDetalleId')::uuid and inventario_lote_id=(i->>'inventarioLoteId')::uuid;
   else
     update public.reserva_detalles set unidades=(i->>'unidades')::integer where reserva_id=reserva and pedido_detalle_id=(i->>'pedidoDetalleId')::uuid and inventario_lote_id=(i->>'inventarioLoteId')::uuid;
     if not found then insert into public.reserva_detalles(reserva_id,pedido_detalle_id,inventario_lote_id,unidades) values(reserva,(i->>'pedidoDetalleId')::uuid,(i->>'inventarioLoteId')::uuid,(i->>'unidades')::integer);end if;
   end if;
 end loop;
 update public.pedido_detalles pd set unidades_despachadas=coalesce((select sum(rd.unidades)::integer from public.reserva_detalles rd where rd.reserva_id=reserva and rd.pedido_detalle_id=pd.id),0) where pd.pedido_id=pedido;
 -- No confirmar éxito si algún trigger omitió o alteró una escritura.
 if (select count(*) from public.reserva_detalles where reserva_id=reserva)<>(select count(*) from jsonb_array_elements(d->'lineas') x where (x->>'unidades')::integer>0)
   or exists(select 1 from public.reserva_detalles rd where rd.reserva_id=reserva and not exists(select 1 from jsonb_array_elements(d->'lineas') x where x->>'pedidoDetalleId'=rd.pedido_detalle_id::text and x->>'inventarioLoteId'=rd.inventario_lote_id::text and (x->>'unidades')::integer=rd.unidades))
   or exists(select 1 from public.pedido_detalles pd where pd.pedido_id=pedido and pd.unidades_despachadas is distinct from coalesce((select sum(rd.unidades)::integer from public.reserva_detalles rd where rd.reserva_id=reserva and rd.pedido_detalle_id=pd.id),0))
   or not exists(select 1 from public.pedidos where id=pedido and estado='DESPACHADO')
   or not exists(select 1 from public.reservas_inventario where id=reserva and estado='DESPACHADA' and numero_factura is not distinct from b->'reserva'->>'numero_factura' and conciliacion_aplica is not distinct from (b->'reserva'->>'conciliacion_aplica')::boolean) then
   raise exception 'No se confirmó la corrección completa. Se revirtió el ajuste de inventario.';end if;
 perform set_config('cibuspan.edicion_despacho',coalesce(contexto,''),true);perform set_config('cibuspan.kardex_contexto',coalesce(kardex,''),true);
 r:=jsonb_build_object('estado','CONFIRMADA','solicitud_id',p_solicitud_id,'tipo','CORREGIR','objeto_id',reserva,'reserva_id',reserva,'pedido_id',pedido,'resumen',plan,'repetida',false);
 update public.ed_solicitudes_despacho set estado='CONFIRMADA',resultado=r where solicitud_id=p_solicitud_id;
 return r;
end $body$;
create or replace function public.resolver_edicion_despacho(p_solicitud_id uuid,p_tipo text,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-edicion-despacho-v1:resolver
declare s public.ed_solicitudes_despacho%rowtype;
begin
 perform public.ed_autorizar(p_tipo);
 if auth.uid() is null or auth.uid() is distinct from p_usuario_esperado then raise exception 'La sesión cambió. Usa el usuario del intento.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud.'; end if;
 perform set_config('lock_timeout','5s',true);perform pg_advisory_xact_lock(hashtextextended('cibuspan.edicion:'||p_solicitud_id::text,0));
 select * into s from public.ed_solicitudes_despacho where solicitud_id=p_solicitud_id for update;
 if found then
   if s.actor<>auth.uid() then raise exception 'El intento pertenece a otro usuario.' using errcode='42501'; end if;
   if s.estado='CONFIRMADA' then return s.resultado||jsonb_build_object('repetida',true); end if;
   if s.estado<>'ANULADA' then raise exception 'La solicitud requiere revisión.'; end if;
 else insert into public.ed_solicitudes_despacho(solicitud_id,actor,tipo,estado) values(p_solicitud_id,auth.uid(),'CORREGIR','ANULADA');end if;
 return jsonb_build_object('estado','ANULADA','solicitud_id',p_solicitud_id,'tipo','CORREGIR');
end $body$;
do $privilegios$ declare f record;begin
 for f in select p.oid::regprocedure firma from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('ed_autorizar','ed_datos','ed_base','ed_plan','ed_exigir_contexto','ed_proteger_filas','obtener_edicion_despacho','prever_edicion_despacho','ejecutar_edicion_despacho','resolver_edicion_despacho') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.firma);end loop;
end $privilegios$;
grant execute on function public.obtener_edicion_despacho(uuid),public.prever_edicion_despacho(text,jsonb),public.ejecutar_edicion_despacho(uuid,text,jsonb,text,uuid),public.resolver_edicion_despacho(uuid,text,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
