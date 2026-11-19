-- Casa Masa, primera entrega: pedido central y seguimiento de empaque.
-- Versión 202611190002: 202611190001 pertenece a edición de ingredientes.
-- No carga stock, no fabrica ni registra pagos. Aplicar sólo este SQL nuevo.
begin;
set local lock_timeout='5s';
do $preflight$
begin
 if to_regprocedure('public.registrar_pedido_seguro(uuid,jsonb,uuid)') is null
 or to_regprocedure('public.app_exigir_operacion(text[])') is null
 or to_regprocedure('public.obtener_produccion_sugerida()') is null
 or to_regprocedure('public.obtener_produccion_sugerida_periodo(date,date)') is null then
   raise exception 'Faltan contratos de pedidos, autorización o planificación por fechas. Revisar instalación existente.';
 end if;
 if to_regclass('public.cm_pedidos') is not null and
 obj_description(to_regclass('public.cm_pedidos'),'pg_class') is distinct from 'cibuspan-casa-masa-v1' then
   raise exception 'Ya existe otra tabla cm_pedidos. Revisar antes de instalar.';
 end if;
 perform id,pedido_id,producto_id,total_unidades from public.pedido_detalles limit 0;
 perform id,pedido_id,estado from public.reservas_inventario limit 0;
 perform reserva_id,pedido_detalle_id,unidades from public.reserva_detalles limit 0;
 if to_regclass('public.cm_detalles_demanda') is not null and
 obj_description(to_regclass('public.cm_detalles_demanda'),'pg_class') is distinct from 'cibuspan-cm-demanda-v1' then
   raise exception 'Ya existe otra vista cm_detalles_demanda. Revisar antes de instalar.';
 end if;
 if to_regclass('public.cm_empaque_eventos') is not null and
 obj_description(to_regclass('public.cm_empaque_eventos'),'pg_class') is distinct from 'cibuspan-cm-empaque-eventos-v1' then
   raise exception 'Ya existe otra tabla cm_empaque_eventos. Revisar antes de instalar.';
 end if;
end $preflight$;

create table if not exists public.cm_pedidos (
 pedido_id text primary key references public.pedidos(id) on delete cascade,
 estado_empaque text not null default 'PENDIENTE' check(estado_empaque in ('PENDIENTE','EN PREPARACION','EMPACADO Y ETIQUETADO','LISTO')),
 contacto text not null default '' check(length(contacto)<=300),
 direccion text not null default '' check(length(direccion)<=1000),
 repartidor text not null default '' check(length(repartidor)<=200),
 observaciones text not null default '' check(length(observaciones)<=2000),
 responsable text not null default '' check(length(responsable)<=200),
 version integer not null default 1,
 actualizado_por uuid not null,
 actualizado_en timestamptz not null default now()
);
comment on table public.cm_pedidos is 'cibuspan-casa-masa-v1';
create table if not exists public.cm_empaque_eventos (
 id bigint generated always as identity primary key,
 pedido_id text not null, actor uuid not null, datos jsonb not null,
 creado_en timestamptz not null default now()
);
comment on table public.cm_empaque_eventos is 'cibuspan-cm-empaque-eventos-v1';
alter table public.cm_pedidos enable row level security;
alter table public.cm_empaque_eventos enable row level security;
revoke all on public.cm_pedidos,public.cm_empaque_eventos from public,anon,authenticated,service_role;
grant select on public.cm_pedidos to authenticated;
drop policy if exists cm_lectura on public.cm_pedidos;

-- La denegación explícita del submenú prevalece sobre el permiso heredado.
create or replace function public.cm_puede_operar()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $body$
 select exists(select 1 from public.app_profiles where user_id=auth.uid() and activo)
 and coalesce((select permitido from public.app_user_permissions where user_id=auth.uid()
 and pantalla='Casa Masa · Pedidos y empaque'),public.app_puede('Casa Masa'));
$body$;
revoke all on function public.cm_puede_operar() from public,anon;
grant execute on function public.cm_puede_operar() to authenticated;
create policy cm_lectura on public.cm_pedidos for select to authenticated
 using (public.cm_puede_operar());

insert into public.app_role_permissions(rol,pantalla,permitido)
select rol,'Casa Masa',true from unnest(array['ADMINISTRADOR','GERENTE','GERENTE_OPERACIONES','BODEGUERO']) rol
on conflict(rol,pantalla) do nothing;

-- Vista privada usada únicamente como fuente de demanda de producción.
-- Se filtra el SKU ANTES de agrupar por producto base, también en pedidos mixtos.
-- Conserva las columnas y todos los detalles de los demás SKU.
create or replace view public.cm_detalles_demanda as
select d.* from public.pedido_detalles d
where not exists(select 1 from public.productos p where p.id=d.producto_id
 and upper(trim(p.codigo)) in ('CM-001','CM-002','CM-003','CM-004'));
comment on view public.cm_detalles_demanda is 'cibuspan-cm-demanda-v1';
revoke all on public.cm_detalles_demanda from public,anon,authenticated,service_role;

-- Preservar íntegro el cálculo vigente: cambiar sólo la fuente de detalles.
-- También funciona cuando el contrato anterior usa RETURN QUERY EXECUTE.
do $demanda$
declare firma text; cuerpo text; definicion text; nuevo text;
begin
 foreach firma in array array['public.obtener_produccion_sugerida()','public.obtener_produccion_sugerida_periodo(date,date)'] loop
   select prosrc,pg_get_functiondef(oid) into cuerpo,definicion from pg_proc where oid=to_regprocedure(firma) and prosecdef;
   if cuerpo is null then raise exception 'El cálculo % requiere revisar sus permisos antes de instalar.',firma; end if;
   if strpos(cuerpo,'cibuspan-cm-demanda-v1')>0 then continue; end if;
   if cuerpo !~ '\mpedido_detalles\M' or cuerpo !~ 'app_exigir_operacion' then
     raise exception 'El cálculo % no tiene la fuente/autorización esperada. Revisar su definición antes de instalar.',firma;
   end if;
   nuevo:=E'\n-- cibuspan-cm-demanda-v1\n'||regexp_replace(cuerpo,'\mpedido_detalles\M','cm_detalles_demanda','g');
   execute replace(definicion,cuerpo,nuevo);
 end loop;
end $demanda$;

create or replace function public.registrar_pedido_casa_masa(p_solicitud_id uuid,p_datos jsonb,p_usuario_esperado uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
declare resultado jsonb; datos jsonb;
begin
 perform public.app_exigir_operacion(array['Casa Masa','Casa Masa · Pedidos y empaque']);
 if not public.cm_puede_operar() then raise exception 'No tienes acceso a Casa Masa.' using errcode='42501'; end if;
 datos:=public.ped_datos_registro(p_datos);
 if exists(select 1 from jsonb_array_elements(datos->'detalles') d left join public.productos p on p.id=(d->>'productoId')::uuid
 where p.id is null or upper(trim(p.codigo)) not in ('CM-001','CM-002','CM-003','CM-004')) then
   raise exception 'Casa Masa admite únicamente CM-001, CM-002, CM-003 y CM-004.';
 end if;
 resultado:=public.registrar_pedido_seguro(p_solicitud_id,datos,p_usuario_esperado);
 if (resultado->>'repetida')::boolean then
   if (resultado->>'vigente')::boolean and not exists(select 1 from public.cm_pedidos where pedido_id=resultado->>'pedido_id') then
     raise exception 'El intento corresponde a otro canal. No se cambió el pedido.';
   end if;
   return resultado;
 end if;
 insert into public.cm_pedidos(pedido_id,actualizado_por) values(resultado->>'pedido_id',auth.uid());
 insert into public.cm_empaque_eventos(pedido_id,actor,datos) values(resultado->>'pedido_id',auth.uid(),jsonb_build_object('accion','REGISTRO'));
 return resultado;
end $body$;

create or replace function public.guardar_empaque_casa_masa(p_pedido_id text,p_version integer,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
declare actual public.cm_pedidos%rowtype; nuevo public.cm_pedidos%rowtype; estado text; orden_estado text[]:=array['PENDIENTE','EN PREPARACION','EMPACADO Y ETIQUETADO','LISTO'];
begin
 perform public.app_exigir_operacion(array['Casa Masa','Casa Masa · Pedidos y empaque']);
 if not public.cm_puede_operar() then raise exception 'No tienes acceso a Casa Masa.' using errcode='42501'; end if;
 if auth.uid() is null then raise exception 'Se requiere un usuario identificado.'; end if;
 -- Mismo orden de bloqueos que logística: cabecera, detalles, reserva.
 select p.estado into estado from public.pedidos p where id=p_pedido_id for update;
 if not found or estado not in ('INGRESADO','PREPARADO') then raise exception 'El pedido ya salió, fue cancelado o no está disponible. Actualiza la lista.'; end if;
 perform 1 from public.pedido_detalles where pedido_id=p_pedido_id order by id for update;
 perform 1 from public.reservas_inventario where pedido_id=p_pedido_id order by id for update;
 select * into actual from public.cm_pedidos where pedido_id=p_pedido_id for update;
 if not found then raise exception 'El pedido no pertenece al módulo Casa Masa.'; end if;
 if actual.version is distinct from p_version then raise exception 'Otro usuario actualizó el pedido. Recarga antes de guardar.'; end if;
 if jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Revisa los datos de empaque.'; end if;
 estado:=p_datos->>'estado';
 if estado is null or not estado=any(orden_estado) or array_position(orden_estado,estado)>array_position(orden_estado,actual.estado_empaque)+1 then
   raise exception 'Completa las etapas de empaque en orden.';
 end if;
 if exists(select 1 from public.pedido_detalles d join public.productos p on p.id=d.producto_id where d.pedido_id=p_pedido_id
   and upper(trim(p.codigo)) not in ('CM-001','CM-002','CM-003','CM-004')) then raise exception 'El detalle ya no corresponde a Casa Masa.'; end if;
 if estado in ('EMPACADO Y ETIQUETADO','LISTO') then
   if nullif(trim(p_datos->>'responsable'),'') is null or nullif(trim(p_datos->>'direccion'),'') is null then
     raise exception 'Completa responsable y dirección o punto de entrega.';
   end if;
   if p_datos->'verificado' is distinct from 'true'::jsonb then raise exception 'Confirma que revisaste cantidades y etiquetas contra los lotes reservados.'; end if;
   if not exists(select 1 from public.pedido_detalles where pedido_id=p_pedido_id) or exists(
     select 1 from public.pedido_detalles d where d.pedido_id=p_pedido_id and d.total_unidades>
       coalesce((select sum(rd.unidades) from public.reserva_detalles rd join public.reservas_inventario r on r.id=rd.reserva_id
       where r.pedido_id=p_pedido_id and r.estado='ACTIVA' and rd.pedido_detalle_id=d.id),0)
   ) then raise exception 'Reserva todas las unidades por lote desde Preparación antes de confirmar el empaque.'; end if;
 end if;
 if estado='LISTO' and nullif(trim(p_datos->>'repartidor'),'') is null then raise exception 'Asigna el repartidor antes de dejar listo el pedido.'; end if;
 update public.cm_pedidos set estado_empaque=estado,contacto=trim(coalesce(p_datos->>'contacto','')),
 direccion=trim(coalesce(p_datos->>'direccion','')),repartidor=trim(coalesce(p_datos->>'repartidor','')),
 responsable=trim(coalesce(p_datos->>'responsable','')),observaciones=trim(coalesce(p_datos->>'observaciones','')),
 version=version+1,actualizado_por=auth.uid(),actualizado_en=now() where pedido_id=p_pedido_id returning * into nuevo;
 insert into public.cm_empaque_eventos(pedido_id,actor,datos) values(p_pedido_id,auth.uid(),jsonb_build_object('antes',to_jsonb(actual),'despues',to_jsonb(nuevo),'verificado',p_datos->'verificado'));
 return to_jsonb(nuevo);
end $body$;

-- Un pedido CM sólo sale después de completar empaque, aun desde Despachos general.
create or replace function public.cm_exigir_empaque_despacho()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
begin
 if new.estado='DESPACHADO' and old.estado is distinct from new.estado and
 exists(select 1 from public.cm_pedidos where pedido_id=new.id and estado_empaque<>'LISTO') then
   raise exception 'Completa el empaque de Casa Masa y márcalo LISTO antes del despacho.';
 end if;
 return new;
end $body$;
drop trigger if exists cm_exigir_empaque_despacho on public.pedidos;
create trigger cm_exigir_empaque_despacho before update of estado on public.pedidos
for each row execute function public.cm_exigir_empaque_despacho();
revoke all on function public.cm_exigir_empaque_despacho() from public,anon,authenticated,service_role;
revoke all on function public.registrar_pedido_casa_masa(uuid,jsonb,uuid),public.guardar_empaque_casa_masa(text,integer,jsonb) from public,anon;
grant execute on function public.registrar_pedido_casa_masa(uuid,jsonb,uuid),public.guardar_empaque_casa_masa(text,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
