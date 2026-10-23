-- Una solicitud representa una fabricación, no un SKU/fecha. No aplica consumos MP.
begin;
do $preflight$
declare v_src text; v_prefijo text;
begin
 if to_regprocedure('public.app_exigir_operacion(text[])') is null then
   raise exception 'Primero instala la autorización operativa 202610230001.'; end if;
 v_prefijo:=E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('
   ||quote_literal(array['Producción']::text)||E'::text[]);\n';
 select prosrc into v_src from pg_proc where oid=to_regprocedure('public.registrar_produccion_completa(date,jsonb)');
 if v_src is null or not starts_with(v_src,v_prefijo) then
   raise exception 'La función de producción no tiene el contrato autorizado esperado. No se cambió el registro.'; end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='registrar_produccion_completa')<>1 then
   raise exception 'Hay variantes de producción que requieren revisión.'; end if;
 if to_regclass('public.pro_solicitudes_registro') is not null and
   obj_description(to_regclass('public.pro_solicitudes_registro'),'pg_class') is distinct from 'cibuspan-registro-produccion-v1' then
   raise exception 'Ya existe otra tabla de solicitudes. Revisar antes de modificar.'; end if;
end;
$preflight$;

create table if not exists public.pro_solicitudes_registro(
 solicitud_id uuid primary key,
 actor text not null,
 datos jsonb,
 estado text not null check(estado in ('REGISTRANDO','CONFIRMADA','ANULADA')),
 ejecutada boolean not null default false,
 transaccion bigint not null default txid_current(),
 produccion_id uuid unique references public.producciones(id) on delete restrict,
 creado_en timestamptz not null default now(),
 check((estado='ANULADA' and datos is null and produccion_id is null and not ejecutada)
   or (estado='REGISTRANDO' and datos is not null and produccion_id is null)
   or (estado='CONFIRMADA' and datos is not null and produccion_id is not null and ejecutada))
);
comment on table public.pro_solicitudes_registro is 'cibuspan-registro-produccion-v1';
alter table public.pro_solicitudes_registro enable row level security;
revoke all on public.pro_solicitudes_registro from public,anon,authenticated,service_role;

create or replace function public.pro_actor_registro()
returns text language sql stable security invoker set search_path=pg_catalog,public as $body$
 select case when auth.uid() is not null then 'USUARIO:'||auth.uid()::text
   else 'PROCESO:'||case when current_setting('role',true) in ('none','') then session_user::text
     else current_setting('role',true) end end;
$body$;
revoke all on function public.pro_actor_registro() from public,anon,authenticated,service_role;

create or replace function public.pro_exigir_solicitud_registro(p_fecha date,p_detalles jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-registro-produccion-v1:interno
declare v_id uuid:=nullif(current_setting('cibuspan.produccion_request',true),'')::uuid;
begin
 if v_id is null then
   raise exception 'Actualiza la aplicación para registrar la producción de forma segura.'; end if;
 update public.pro_solicitudes_registro set ejecutada=true
 where solicitud_id=v_id and actor=public.pro_actor_registro()
   and estado='REGISTRANDO' and not ejecutada and produccion_id is null and transaccion=txid_current()
   and datos=jsonb_build_object('fechaProduccionGeneral',p_fecha,'detalles',p_detalles);
 if not found then raise exception 'Esta solicitud no puede volver a ejecutar la producción.'; end if;
end;
$body$;
revoke all on function public.pro_exigir_solicitud_registro(date,jsonb) from public,anon,authenticated,service_role;

create or replace function public.registrar_produccion_segura(p_solicitud_id uuid,p_fecha_produccion_general date,
 p_detalles jsonb,p_usuario_esperado uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-registro-produccion-v1:registro
declare v_actor text; v_datos jsonb; v_reg public.pro_solicitudes_registro%rowtype;
 v_produccion uuid; v_contexto text:=current_setting('cibuspan.produccion_request',true);
begin
 perform public.app_exigir_operacion(array['Producción']);
 if auth.uid() is distinct from p_usuario_esperado then
   raise exception 'La sesión cambió. Vuelve a ingresar con tu usuario.' using errcode='42501'; end if;
 if p_solicitud_id is null or p_fecha_produccion_general is null or p_detalles is null
   or jsonb_typeof(p_detalles)<>'array' or jsonb_array_length(p_detalles)=0 then
   raise exception 'La solicitud de producción está incompleta.'; end if;
 v_actor:=public.pro_actor_registro();
 v_datos:=jsonb_build_object('fechaProduccionGeneral',p_fecha_produccion_general,'detalles',p_detalles);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.produccion:'||p_solicitud_id::text,0));
 select * into v_reg from public.pro_solicitudes_registro where solicitud_id=p_solicitud_id for update;
 if found then
   if v_reg.actor<>v_actor then raise exception 'La solicitud pertenece a otro usuario.' using errcode='42501'; end if;
   if v_reg.estado='ANULADA' then raise exception 'La solicitud fue cerrada sin registro. Confirma nuevamente los datos.'; end if;
   if v_reg.datos is distinct from v_datos then raise exception 'Esta solicitud ya tiene otros datos. Comprueba el registro anterior antes de editar.'; end if;
   if v_reg.estado<>'CONFIRMADA' or v_reg.produccion_id is null then raise exception 'La solicitud requiere revisión antes de continuar.'; end if;
   return jsonb_build_object('solicitud_id',p_solicitud_id,'produccion_id',v_reg.produccion_id,'repetida',true);
 end if;
 insert into public.pro_solicitudes_registro(solicitud_id,actor,datos,estado)
 values(p_solicitud_id,v_actor,v_datos,'REGISTRANDO');
 perform set_config('cibuspan.produccion_request',p_solicitud_id::text,true);
 v_produccion:=public.registrar_produccion_completa(p_fecha_produccion_general,p_detalles);
 perform set_config('cibuspan.produccion_request',coalesce(v_contexto,''),true);
 if v_produccion is null then raise exception 'El servidor no confirmó el número de producción.'; end if;
 update public.pro_solicitudes_registro set estado='CONFIRMADA',produccion_id=v_produccion
 where solicitud_id=p_solicitud_id and ejecutada;
 if not found then raise exception 'No se confirmó la ejecución de la solicitud.'; end if;
 return jsonb_build_object('solicitud_id',p_solicitud_id,'produccion_id',v_produccion,'repetida',false);
end;
$body$;

create or replace function public.resolver_registro_produccion(p_solicitud_id uuid,p_usuario_esperado uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-registro-produccion-v1:resolver
declare v_reg public.pro_solicitudes_registro%rowtype; v_actor text;
begin
 perform public.app_exigir_operacion(array['Producción']);
 if auth.uid() is distinct from p_usuario_esperado then
   raise exception 'La sesión cambió. Vuelve a ingresar con tu usuario.' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta la solicitud pendiente.'; end if;
 v_actor:=public.pro_actor_registro();
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.produccion:'||p_solicitud_id::text,0));
 select * into v_reg from public.pro_solicitudes_registro where solicitud_id=p_solicitud_id for update;
 if found then
   if v_reg.actor<>v_actor then raise exception 'La solicitud pertenece a otro usuario.' using errcode='42501'; end if;
   if v_reg.estado='CONFIRMADA' then
     return jsonb_build_object('estado','CONFIRMADA','solicitud_id',p_solicitud_id,'produccion_id',v_reg.produccion_id);
   end if;
   if v_reg.estado<>'ANULADA' then raise exception 'La solicitud requiere revisión antes de continuar.'; end if;
 else
   -- Sella la ausencia bajo el mismo bloqueo. Un envío atrasado con esta clave
   -- ya no podrá producir después de que el usuario corrija o descarte el intento.
   insert into public.pro_solicitudes_registro(solicitud_id,actor,estado)
   values(p_solicitud_id,v_actor,'ANULADA');
 end if;
 return jsonb_build_object('estado','ANULADA','solicitud_id',p_solicitud_id,'produccion_id',null);
end;
$body$;
revoke all on function public.registrar_produccion_segura(uuid,date,jsonb,uuid),
 public.resolver_registro_produccion(uuid,uuid) from public,anon;
grant execute on function public.registrar_produccion_segura(uuid,date,jsonb,uuid),
 public.resolver_registro_produccion(uuid,uuid) to authenticated,service_role;

do $conservar$
declare v_id oid:=to_regprocedure('public.registrar_produccion_completa(date,jsonb)');
 v_src text; v_def text; v_prefijo text; v_gate text; v_pos integer; v_owner text;
begin
 select prosrc,pg_get_userbyid(proowner) into v_src,v_owner from pg_proc where oid=v_id;
 if v_owner in ('anon','authenticated','service_role') then raise exception 'El dueño de la función requiere revisión.'; end if;
 v_prefijo:=E'\n-- cibuspan-autorizacion-operativa-v1\nBEGIN\n  PERFORM public.app_exigir_operacion('
   ||quote_literal(array['Producción']::text)||E'::text[]);\n';
 v_gate:=E'  -- cibuspan-registro-produccion-v1\n  PERFORM public.pro_exigir_solicitud_registro(p_fecha_produccion_general,p_detalles);\n';
 if not starts_with(v_src,v_prefijo||v_gate) then
   if strpos(v_src,'-- cibuspan-registro-produccion-v1')>0 then raise exception 'El registro requiere revisión antes de reinstalar.'; end if;
   v_def:=pg_get_functiondef(v_id);v_pos:=strpos(v_def,v_src);
   execute overlay(v_def placing v_prefijo||v_gate||substr(v_src,length(v_prefijo)+1) from v_pos for length(v_src));
 end if;
 execute format('grant execute on function public.pro_exigir_solicitud_registro(date,jsonb) to %I',v_owner);
end;
$conservar$;
notify pgrst,'reload schema';
commit;
