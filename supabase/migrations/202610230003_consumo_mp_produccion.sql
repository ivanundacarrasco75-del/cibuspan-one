-- Consume MP sólo al confirmar una solicitud nueva de producción OP-13.
-- No reconstruye consumos anteriores ni cambia recetas o saldos iniciales.
begin;
set local lock_timeout='5s';
do $preflight$ begin
 if to_regprocedure('public.registrar_produccion_segura(uuid,date,jsonb,uuid)') is null
   or to_regprocedure('public.app_exigir_operacion(text[])') is null
   or to_regprocedure('public.inv_kardex_validar_mp(uuid)') is null then
   raise exception 'Faltan los contratos de autorización, registro seguro o Kardex. No se instaló consumo MP.'; end if;
 perform solicitud_id,actor,datos,estado,ejecutada,transaccion,produccion_id from public.pro_solicitudes_registro limit 0;
 perform id,produccion_id,orden,producto_id,fecha_produccion,unidades from public.produccion_detalles limit 0;
 perform id,codigo,nombre,unidad_base,activo from public.materias_primas limit 0;
 perform id,tipo,articulo_id,fecha,clase,cantidad from public.inv_kardex_movimientos limit 0;
 if to_regclass('public.pro_consumos_detalle') is not null and
   obj_description(to_regclass('public.pro_consumos_detalle'),'pg_class') is distinct from 'cibuspan-consumo-mp-v1' then
   raise exception 'Ya existe otra tabla de consumos. Revisar antes de modificar.'; end if;
end $preflight$;

create table if not exists public.pro_consumos_detalle(
 detalle_id uuid primary key references public.produccion_detalles(id) on delete restrict,
 produccion_id uuid not null references public.producciones(id) on delete restrict,
 solicitud_id uuid not null references public.pro_solicitudes_registro(solicitud_id) on delete restrict,
 fecha date not null, unidades_fabricadas integer not null check(unidades_fabricadas>0),
 datos jsonb not null, movimientos jsonb not null check(jsonb_typeof(movimientos)='array'),
 creado_por uuid, creado_en timestamptz not null default now()
);
comment on table public.pro_consumos_detalle is 'cibuspan-consumo-mp-v1';
create index if not exists pro_consumos_por_produccion on public.pro_consumos_detalle(produccion_id);
alter table public.pro_consumos_detalle enable row level security;
revoke all on public.pro_consumos_detalle from public,anon,authenticated,service_role;
grant select on public.pro_consumos_detalle to authenticated,service_role;
drop policy if exists pro_consumos_lectura on public.pro_consumos_detalle;
create policy pro_consumos_lectura on public.pro_consumos_detalle for select to authenticated using(
 auth.uid() is not null and exists(select 1 from public.app_profiles where user_id=auth.uid() and activo)
 and public.app_puede_alguna(array['Producción','Inventario','Materias primas','Reportes']));

create or replace function public.pro_consumos_al_confirmar()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-consumo-mp-v1:trigger
declare d jsonb; c jsonb; l jsonb; v_orden integer; v_cantidad numeric;
 v_detalle public.produccion_detalles%rowtype; v_materia public.materias_primas%rowtype;
 v_ids uuid[]:=array[]::uuid[]; v_ordenes integer[]:=array[]::integer[]; v_id uuid; v_mov bigint;
 v_movimientos jsonb; v_datos jsonb; v_responsable text; v_n integer:=0;
begin
 perform public.app_exigir_operacion(array['Producción']);
 if TG_OP<>'UPDATE' or old.estado<>'REGISTRANDO' or new.estado<>'CONFIRMADA'
   or not new.ejecutada or new.transaccion<>txid_current() or new.actor<>public.pro_actor_registro()
   or new.produccion_id is null then raise exception 'No existe una confirmación válida para consumir materias primas.'; end if;
 -- Valida toda la declaración antes de adquirir bloqueos y escribir movimientos.
 for d in select value from jsonb_array_elements(new.datos->'detalles') loop
   c:=d->'consumo_mp'; v_orden:=(d->>'orden')::integer;
   if c is null or jsonb_typeof(c)<>'object' or c->'version' is distinct from '1'::jsonb
     or c->'confirmado' is distinct from 'true'::jsonb or jsonb_typeof(c->'lineas') is distinct from 'array'
     or jsonb_typeof(c->'referenciaReceta') is distinct from 'string' or length(c->>'referenciaReceta')>2000
     or jsonb_typeof(c->'observaciones') is distinct from 'string' or length(c->>'observaciones')>2000 then
     raise exception 'Actualiza la app y revisa los consumos reales de cada producto antes de confirmar.'; end if;
   if jsonb_array_length(c->'lineas')>200 or (jsonb_array_length(c->'lineas')=0 and length(trim(c->>'observaciones'))<10) then
     raise exception 'Indica los materiales consumidos o explica por qué no hubo consumo inventariable.'; end if;
   if v_orden is null or v_orden<=0 or v_orden=any(v_ordenes) then raise exception 'El orden de los productos no es válido.'; end if;
   v_ordenes:=array_append(v_ordenes,v_orden); v_ids:=array[]::uuid[]; v_n:=v_n+1;
   for l in select value from jsonb_array_elements(c->'lineas') loop
     v_id:=(l->>'materiaPrimaId')::uuid; v_cantidad:=(l->>'cantidad')::numeric;
     if v_id is null or v_id=any(v_ids) or jsonb_typeof(l->'cantidad') is distinct from 'number'
       or v_cantidad is null or v_cantidad<=0 or v_cantidad>1e12 or v_cantidad<>round(v_cantidad,6)
       or l->>'unidad' is null or l->>'unidad' not in ('KG','G','L','ML','UNIDAD')
       or (l->>'unidad'='UNIDAD' and v_cantidad<>trunc(v_cantidad)) then
       raise exception 'Revisa materiales repetidos, unidades y cantidades de consumo.'; end if;
     v_ids:=array_append(v_ids,v_id);
   end loop;
 end loop;
 if v_n=0 or v_n<>(select count(*) from public.produccion_detalles where produccion_id=new.produccion_id) then
   raise exception 'Falta la declaración de consumo de algún producto.'; end if;
 -- Mismo bloqueo que los ajustes de Kardex; orden único para todos los artículos.
 for v_id in select distinct (l.value->>'materiaPrimaId')::uuid
   from jsonb_array_elements(new.datos->'detalles') d
   cross join lateral jsonb_array_elements(d.value->'consumo_mp'->'lineas') l order by 1 loop
   perform pg_advisory_xact_lock(hashtextextended('MATERIA_PRIMA'||v_id::text,0));
 end loop;
 select coalesce(nombre,'Proceso interno') into v_responsable from public.app_profiles where user_id=auth.uid();
 for d in select value from jsonb_array_elements(new.datos->'detalles') loop
   c:=d->'consumo_mp';
   select * into strict v_detalle from public.produccion_detalles
     where produccion_id=new.produccion_id and orden=(d->>'orden')::integer;
   if v_detalle.fecha_produccion>(now() at time zone 'America/Guayaquil')::date then
     raise exception 'No se pueden registrar consumos de una producción futura.'; end if;
   v_movimientos:='[]'::jsonb;
   for l in select value from jsonb_array_elements(c->'lineas') loop
     select * into v_materia from public.materias_primas where id=(l->>'materiaPrimaId')::uuid for share;
     if not found or not v_materia.activo then raise exception 'Materia prima no disponible: %.',l->>'materiaPrimaId'; end if;
     if v_materia.unidad_base is distinct from l->>'unidad' then
       raise exception 'La unidad de % cambió. Revisa el consumo antes de guardar.',v_materia.nombre; end if;
     if not exists(select 1 from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=v_materia.id and clase='SALDO_INICIAL') then
       raise exception 'Carga primero el saldo inicial de %; no se guardó la producción.',v_materia.nombre; end if;
     if exists(select 1 from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=v_materia.id
       and clase='SALDO_INICIAL' and fecha>=v_detalle.fecha_produccion) then
       raise exception 'El consumo de % debe ser posterior al cierre de su saldo inicial.',v_materia.nombre; end if;
     v_cantidad:=(l->>'cantidad')::numeric;
     v_datos:=jsonb_build_object('produccion_id',new.produccion_id,'detalle_id',v_detalle.id,'solicitud_produccion',new.solicitud_id);
     insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,documento,solicitud_datos,creado_por,responsable)
     values('MATERIA_PRIMA',v_materia.id,v_detalle.fecha_produccion,'SALIDA',-v_cantidad,
       'Consumo real de producción: '||v_detalle.producto_corto,'Producción '||new.produccion_id::text,
       v_datos,auth.uid(),coalesce(v_responsable,'Proceso interno')) returning id into v_mov;
     v_movimientos:=v_movimientos||jsonb_build_array(jsonb_build_object('id',v_mov,'materiaPrimaId',v_materia.id,
       'codigo',v_materia.codigo,'nombre',v_materia.nombre,'cantidad',v_cantidad,'unidad',v_materia.unidad_base));
   end loop;
   insert into public.pro_consumos_detalle(detalle_id,produccion_id,solicitud_id,fecha,unidades_fabricadas,datos,movimientos,creado_por)
   values(v_detalle.id,new.produccion_id,new.solicitud_id,v_detalle.fecha_produccion,v_detalle.unidades,c,v_movimientos,auth.uid());
 end loop;
 -- Incluye saldos posteriores: una salida retroactiva tampoco puede dejar negativos.
 for v_id in select distinct (l.value->>'materiaPrimaId')::uuid
   from jsonb_array_elements(new.datos->'detalles') d
   cross join lateral jsonb_array_elements(d.value->'consumo_mp'->'lineas') l order by 1 loop
   begin perform public.inv_kardex_validar_mp(v_id);
   exception when others then
     select nombre into v_responsable from public.materias_primas where id=v_id;
     raise exception 'Consumo de %: %. No se guardó la producción ni sus consumos.',v_responsable,SQLERRM;
   end;
 end loop;
 return new;
end;
$body$;
revoke all on function public.pro_consumos_al_confirmar() from public,anon,authenticated,service_role;
drop trigger if exists pro_consumos_al_confirmar on public.pro_solicitudes_registro;
create trigger pro_consumos_al_confirmar after update of estado on public.pro_solicitudes_registro
for each row when(new.estado='CONFIRMADA' and old.estado='REGISTRANDO') execute function public.pro_consumos_al_confirmar();
notify pgrst,'reload schema';
commit;
