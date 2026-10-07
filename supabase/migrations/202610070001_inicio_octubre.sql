-- Instala la opción de inicio. No cambia existencias hasta confirmar el Excel.
begin;
set local lock_timeout = '5s';
do $$ begin
  perform id from public.inv_kardex_movimientos limit 0;
  perform public.app_es_admin();
end $$;

create table if not exists public.inv_respaldos_inicio (
  id uuid primary key default gen_random_uuid(), fecha_corte date not null,
  archivo text not null, archivo_hash text not null, seleccion_hash text not null,
  datos jsonb not null, creado_por uuid not null, creado_en timestamptz not null default now()
);
create table if not exists public.inv_inicio_octubre (
  unico boolean primary key default true check(unico),
  fecha_corte date not null check(fecha_corte=date '2026-09-30'),
  respaldo_id uuid not null references public.inv_respaldos_inicio(id),
  carga_id uuid not null references public.inv_cargas_iniciales(id)
);
alter table public.inventario_lotes add column if not exists inv_archivo_id uuid references public.inv_respaldos_inicio(id);
alter table public.inv_respaldos_inicio enable row level security;
alter table public.inv_inicio_octubre enable row level security;
drop policy if exists inv_respaldo_admin on public.inv_respaldos_inicio;
create policy inv_respaldo_admin on public.inv_respaldos_inicio for select to authenticated using(public.app_es_admin());
drop policy if exists inv_inicio_lectura on public.inv_inicio_octubre;
create policy inv_inicio_lectura on public.inv_inicio_octubre for select to authenticated using(public.inv_kardex_puede());
revoke all on public.inv_respaldos_inicio,public.inv_inicio_octubre from public,anon,authenticated;
grant select on public.inv_respaldos_inicio,public.inv_inicio_octubre to authenticated;

create or replace function public.inv_inicio_foto()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'lotes',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.inventario_lotes l),'[]'::jsonb),
    'movimientos',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.inv_kardex_movimientos m),'[]'::jsonb),
    'cargas',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.inv_cargas_iniciales c),'[]'::jsonb),
    'productos',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.productos p),'[]'::jsonb),
    'materias_primas',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.materias_primas m),'[]'::jsonb),
    'reservas',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.stock_disponible_lotes s),'[]'::jsonb));
$$;

create or replace function public.inv_inicio_estado()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_inicio public.inv_inicio_octubre%rowtype; v_foto jsonb;
begin
  if not public.inv_kardex_puede() and not public.app_es_admin() then
    raise exception 'No tienes acceso al inventario.' using errcode='42501'; end if;
  select * into v_inicio from public.inv_inicio_octubre;
  if found then return jsonb_build_object('instalado',true,'activo',true,'puede_iniciar',false,
    'fecha_corte',v_inicio.fecha_corte,'respaldo_id',v_inicio.respaldo_id,'puede_descargar',public.app_es_admin()); end if;
  if not public.app_es_admin() then return jsonb_build_object('instalado',true,'activo',false,'puede_iniciar',false); end if;
  v_foto:=public.inv_inicio_foto();
  return jsonb_build_object('instalado',true,'activo',false,'puede_iniciar',true,'token',md5(v_foto::text),
    'lotes',jsonb_array_length(v_foto->'lotes'),'movimientos',jsonb_array_length(v_foto->'movimientos'),
    'reservadas',coalesce((select sum(cantidad_reservada) from public.stock_disponible_lotes),0));
end;
$$;

create or replace function public.inv_inicio_confirmar(p_archivo text,p_hash text,p_fecha date,p_lineas jsonb,p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_foto jsonb; v_respaldo uuid; v_previo public.inv_respaldos_inicio%rowtype;
  v_resultado jsonb; v_tabla record; v_linea jsonb; v_lote jsonb; v_lotes jsonb; v_lineas jsonb:='[]';
begin
  if not public.app_es_admin() then raise exception 'Solo un administrador puede iniciar octubre.' using errcode='42501'; end if;
  if p_fecha is distinct from date '2026-09-30' or jsonb_typeof(p_lineas) is distinct from 'array'
    or jsonb_array_length(p_lineas) not between 2 and 2000
    or not exists(select 1 from jsonb_array_elements(p_lineas) l where l->>'tipo'='MATERIA_PRIMA')
    or not exists(select 1 from jsonb_array_elements(p_lineas) l where l->>'tipo'='PRODUCTO_TERMINADO')
    then raise exception 'Selecciona el Excel completo de MP y PT con cierre 30/09/2026.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('inv_inicio_octubre',0));
  select r.* into v_previo from public.inv_inicio_octubre i join public.inv_respaldos_inicio r on r.id=i.respaldo_id;
  if found then
    if v_previo.archivo_hash=p_hash and v_previo.seleccion_hash=md5(p_lineas::text) then
      return jsonb_build_object('id',(select carga_id from public.inv_inicio_octubre),'respaldo_id',v_previo.id,'repetido',true);
    end if;
    raise exception 'Octubre ya está iniciado. No se volverán a sustituir los movimientos registrados.';
  end if;
  -- Bloquear también las tablas que alimentan las reservas, sin asumir sus nombres.
  -- Las referencias a lotes en pedidos y despachos se conservan.
  for v_tabla in
    with recursive dependencias(oid) as (
      select 'public.stock_disponible_lotes'::regclass::oid
      union
      select d.refobjid from dependencias a join pg_rewrite w on w.ev_class=a.oid
        join pg_depend d on d.classid='pg_rewrite'::regclass and d.objid=w.oid
        where d.refclassid='pg_class'::regclass and d.refobjid<>a.oid
    ) select distinct c.oid::regclass nombre from dependencias a join pg_class c on c.oid=a.oid
      where c.relkind in ('r','p') order by nombre
  loop execute format('lock table %s in share row exclusive mode',v_tabla.nombre); end loop;
  lock table public.inventario_lotes,public.inv_kardex_movimientos,public.inv_cargas_iniciales,
    public.productos,public.materias_primas in share row exclusive mode;
  if exists(select 1 from public.stock_disponible_lotes where cantidad_reservada<>0) then
    raise exception 'Hay reservas pendientes. Libéralas desde sus pedidos antes de iniciar octubre; no se modificarán silenciosamente.'; end if;
  v_foto:=public.inv_inicio_foto();
  if p_token is null or p_token<>md5(v_foto::text) then
    raise exception 'El inventario cambió desde la revisión. Actualiza y vuelve a revisar el inicio.'; end if;
  insert into public.inv_respaldos_inicio(fecha_corte,archivo,archivo_hash,seleccion_hash,datos,creado_por)
    values(p_fecha,p_archivo,p_hash,md5(p_lineas::text),v_foto,auth.uid()) returning id into v_respaldo;
  -- Los lotes previos quedan en cero e identificados como archivo. No se borran
  -- los IDs utilizados por producción, despachos o devoluciones.
  perform set_config('cibuspan.inicio_octubre',v_respaldo::text,true);
  perform set_config('cibuspan.kardex_contexto',jsonb_build_object('fecha',current_date,
    'clase','SISTEMA','motivo','Archivo respaldado para el inicio de octubre')::text,true);
  update public.inventario_lotes set cantidad=0,inv_archivo_id=v_respaldo where inv_archivo_id is null;
  perform set_config('cibuspan.kardex_contexto','',true);
  delete from public.inv_kardex_movimientos;
  delete from public.inv_cargas_iniciales;
  -- Si hubo una carga anterior con el mismo nombre de lote, conservarla en el
  -- archivo y dar una referencia diferente al nuevo lote inicial.
  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    if v_linea->>'tipo'='PRODUCTO_TERMINADO' and jsonb_typeof(v_linea->'lotes')='array' then
      v_lotes:='[]';
      for v_lote in select value from jsonb_array_elements(v_linea->'lotes') loop
        if exists(select 1 from public.inventario_lotes where producto_id=(v_linea->>'articulo_id')::uuid
          and upper(trim(lote))=upper(trim(v_lote->>'lote')) and fecha_produccion=(v_lote->>'fecha_produccion')::date) then
          v_lote:=jsonb_set(v_lote,'{lote}',to_jsonb((v_lote->>'lote')||'-INICIO-'||left(v_respaldo::text,8)));
        end if;
        v_lotes:=v_lotes||jsonb_build_array(v_lote);
      end loop;
      v_linea:=jsonb_set(v_linea,'{lotes}',v_lotes);
    end if;
    v_lineas:=v_lineas||jsonb_build_array(v_linea);
  end loop;
  -- Reutiliza las validaciones completas. Cualquier error revierte TODO,
  -- incluyendo el respaldo y la puesta en cero.
  v_resultado:=public.inv_kardex_cargar_inicial(p_archivo,p_hash,p_fecha,v_lineas);
  insert into public.inv_inicio_octubre(fecha_corte,respaldo_id,carga_id)
    values(p_fecha,v_respaldo,(v_resultado->>'id')::uuid);
  perform set_config('cibuspan.inicio_octubre','',true);
  return v_resultado||jsonb_build_object('respaldo_id',v_respaldo);
end;
$$;

create or replace function public.inv_inicio_proteger_lote()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP<>'INSERT' and old.inv_archivo_id is not null then
    if TG_OP='DELETE' or new is distinct from old then
      raise exception 'Este lote pertenece al respaldo anterior a octubre y no puede volver al inventario activo.'; end if;
    return new;
  end if;
  if TG_OP<>'DELETE' and new.inv_archivo_id is not null
    and new.inv_archivo_id::text is distinct from nullif(current_setting('cibuspan.inicio_octubre',true),'') then
    raise exception 'El archivo de un lote solo se establece al confirmar el inicio.'; end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists inv_inicio_guardar_pt on public.inventario_lotes;
create trigger inv_inicio_guardar_pt before insert or update or delete on public.inventario_lotes
for each row execute function public.inv_inicio_proteger_lote();

create or replace function public.inv_inicio_proteger_fecha()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_corte date;
begin
  select fecha_corte into v_corte from public.inv_inicio_octubre;
  if found and ((new.clase='SALDO_INICIAL' and new.fecha<>v_corte)
    or (new.clase<>'SALDO_INICIAL' and new.fecha<=v_corte)) then
    raise exception 'El saldo inicial corresponde al 30/09/2026; los movimientos operativos empiezan el 01/10/2026.'; end if;
  if new.solicitud_id is not null and exists(select 1 from public.inv_respaldos_inicio r
    where r.datos->'movimientos' @> jsonb_build_array(jsonb_build_object('solicitud_id',new.solicitud_id))) then
    raise exception 'Esta solicitud pertenece al inventario anterior respaldado. No se volverá a registrar.'; end if;
  return new;
end;
$$;
drop trigger if exists inv_inicio_fecha on public.inv_kardex_movimientos;
create trigger inv_inicio_fecha before insert on public.inv_kardex_movimientos
for each row execute function public.inv_inicio_proteger_fecha();

revoke all on function public.inv_inicio_foto(),public.inv_inicio_proteger_lote(),public.inv_inicio_proteger_fecha() from public,anon,authenticated;
revoke all on function public.inv_inicio_estado(),public.inv_inicio_confirmar(text,text,date,jsonb,text) from public,anon,authenticated;
grant execute on function public.inv_inicio_estado(),public.inv_inicio_confirmar(text,text,date,jsonb,text) to authenticated;
-- Ocultar los lotes archivados en la selección activa del Kardex.
create or replace function public.inv_kardex_catalogo()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_resultado jsonb;
begin
  if not public.inv_kardex_puede() then raise exception 'No tienes acceso al Kardex.' using errcode='42501'; end if;
  select jsonb_build_object('articulos',coalesce(jsonb_agg(a order by a.tipo,a.nombre),'[]'::jsonb)) into v_resultado from (
    select 'MATERIA_PRIMA'::text tipo,m.id,m.codigo,m.codigo_contable,m.nombre,m.unidad_base::text unidad,
      coalesce((select sum(k.cantidad) from public.inv_kardex_movimientos k where k.tipo='MATERIA_PRIMA' and k.articulo_id=m.id),0) saldo,
      exists(select 1 from public.inv_kardex_movimientos k where k.tipo='MATERIA_PRIMA' and k.articulo_id=m.id) iniciado
    from public.materias_primas m where m.activo and public.inv_kardex_puede('MATERIA_PRIMA')
    union all
    select 'PRODUCTO_TERMINADO',p.id,p.codigo,null,p.nombre,'UNIDAD',
      coalesce((select sum(l.cantidad) from public.inventario_lotes l where l.producto_id=p.id),0),
      exists(select 1 from public.inv_kardex_movimientos k where k.tipo='PRODUCTO_TERMINADO' and k.articulo_id=p.id)
    from public.productos p where p.activo and public.inv_kardex_puede('PRODUCTO_TERMINADO')
  ) a;
  return v_resultado || jsonb_build_object('lotes',coalesce((select jsonb_agg(l order by l.fecha_vencimiento,l.id) from (
    select i.id,i.producto_id,i.lote,i.fecha_produccion,i.fecha_vencimiento,i.cantidad,
      coalesce(s.cantidad_reservada,0) reservado
    from public.inventario_lotes i left join public.stock_disponible_lotes s on s.id=i.id
    where i.inv_archivo_id is null and public.inv_kardex_puede('PRODUCTO_TERMINADO')
  ) l),'[]'::jsonb));
end;
$$;

notify pgrst, 'reload schema';
commit;
