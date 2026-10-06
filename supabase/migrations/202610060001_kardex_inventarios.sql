-- Kardex adicional. No vuelve a ejecutar migraciones antiguas ni reemplaza vistas.
begin;
set local lock_timeout = '5s';
-- Comprobar los contratos utilizados antes de crear objetos en la base existente.
do $$ begin
  perform id,producto_id,lote,cantidad,fecha_produccion,fecha_ingreso_bodega,fecha_vencimiento from public.inventario_lotes limit 0;
  perform id,codigo,nombre,activo from public.productos limit 0;
  perform id,codigo,codigo_contable,nombre,unidad_base,activo from public.materias_primas limit 0;
  perform user_id,nombre from public.app_profiles limit 0;
  perform id,cantidad_reservada from public.stock_disponible_lotes limit 0;
end $$;

create table if not exists public.inv_cargas_iniciales (
  id uuid primary key default gen_random_uuid(), archivo text not null,
  archivo_hash text not null, seleccion_hash text not null, fecha_corte date not null, lineas integer not null, datos jsonb not null,
  creado_por uuid not null, creado_en timestamptz not null default now(),
  unique(archivo_hash, fecha_corte, seleccion_hash)
);
create table if not exists public.inv_kardex_movimientos (
  id bigint generated always as identity primary key,
  tipo text not null check(tipo in ('MATERIA_PRIMA','PRODUCTO_TERMINADO')),
  articulo_id uuid not null, inventario_lote_id uuid, lote text,
  fecha date not null,
  clase text not null check(clase in ('SALDO_INICIAL','SALDO_EXISTENTE','ENTRADA','SALIDA','CONTEO','SISTEMA')),
  cantidad numeric(20,6) not null, motivo text not null, documento text,
  valor_inicial numeric(20,6), carga_id uuid references public.inv_cargas_iniciales(id),
  solicitud_id uuid unique, solicitud_datos jsonb, creado_por uuid, responsable text not null,
  creado_en timestamptz not null default now()
);
create index if not exists inv_kardex_articulo_fecha on public.inv_kardex_movimientos(tipo,articulo_id,fecha,id);
create unique index if not exists inv_kardex_mp_inicial on public.inv_kardex_movimientos(articulo_id)
  where tipo='MATERIA_PRIMA' and clase='SALDO_INICIAL';

create or replace function public.inv_kardex_puede(p_tipo text default null, p_escribir boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and (
    public.app_puede('Inventario') or public.app_puede('Producción') or
    (coalesce(p_tipo,'MATERIA_PRIMA')='MATERIA_PRIMA' and public.app_puede('Materias primas')) or
    (not p_escribir and public.app_puede('Reportes'))
  );
$$;
alter table public.inv_cargas_iniciales enable row level security;
alter table public.inv_kardex_movimientos enable row level security;
drop policy if exists inv_cargas_lectura on public.inv_cargas_iniciales;
create policy inv_cargas_lectura on public.inv_cargas_iniciales for select to authenticated using(public.inv_kardex_puede());
drop policy if exists inv_kardex_lectura on public.inv_kardex_movimientos;
create policy inv_kardex_lectura on public.inv_kardex_movimientos for select to authenticated using(public.inv_kardex_puede(tipo));
revoke all on public.inv_cargas_iniciales, public.inv_kardex_movimientos from public, anon, authenticated;
grant select on public.inv_cargas_iniciales, public.inv_kardex_movimientos to authenticated;

-- Captura los cambios reales de PT en el inventario existente, incluyendo los
-- hechos por Producción, Despachos, empaque y ajustes. Las reservas no son salidas.
create or replace function public.inv_kardex_observar_pt()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_contexto jsonb := coalesce(nullif(current_setting('cibuspan.kardex_contexto',true),''),'{}')::jsonb;
  v_delta numeric; v_articulo uuid; v_id uuid; v_lote text; v_fecha date;
  v_clase text; v_motivo text;
begin
  if TG_OP='UPDATE' and new.producto_id<>old.producto_id then
    raise exception 'No se puede cambiar el SKU de un lote con trazabilidad.';
  end if;
  if TG_OP='DELETE' then
    v_delta:=-old.cantidad; v_articulo:=old.producto_id; v_id:=old.id; v_lote:=old.lote;
  else
    if new.cantidad<0 then raise exception 'El stock no puede ser negativo.'; end if;
    v_delta:=new.cantidad-case when TG_OP='INSERT' then 0 else old.cantidad end;
    v_articulo:=new.producto_id; v_id:=new.id; v_lote:=new.lote;
  end if;
  if v_delta=0 and TG_OP='UPDATE' and new.lote is not distinct from old.lote
    and new.fecha_produccion is not distinct from old.fecha_produccion
    and new.fecha_vencimiento is not distinct from old.fecha_vencimiento then return new; end if;
  v_fecha:=coalesce((v_contexto->>'fecha')::date,(now() at time zone 'America/Guayaquil')::date);
  if v_contexto='{}'::jsonb and TG_OP='INSERT' then
    v_fecha:=coalesce(new.fecha_ingreso_bodega,new.fecha_produccion,v_fecha);
  end if;
  v_clase:=coalesce(v_contexto->>'clase','SISTEMA');
  v_motivo:=coalesce(v_contexto->>'motivo',case when TG_OP='DELETE' then 'Lote eliminado desde el inventario'
    when v_delta=0 then 'Cambio de identificación o fechas del lote'
    else 'Cambio de stock desde un módulo operativo' end);
  insert into public.inv_kardex_movimientos(tipo,articulo_id,inventario_lote_id,lote,fecha,clase,cantidad,motivo,documento,
    valor_inicial,carga_id,solicitud_id,solicitud_datos,creado_por,responsable)
  values('PRODUCTO_TERMINADO',v_articulo,v_id,v_lote,v_fecha,v_clase,v_delta,v_motivo,v_contexto->>'documento',
    (v_contexto->>'valor_inicial')::numeric,(v_contexto->>'carga_id')::uuid,(v_contexto->>'solicitud_id')::uuid,v_contexto->'solicitud_datos',auth.uid(),
    coalesce((select nombre from public.app_profiles where user_id=auth.uid()),'Proceso interno'));
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
-- Copia de arranque solo para lotes que ya existen. No se altera su cantidad ni
-- se inventa su historia. Repetir esta migración no duplica saldos o movimientos.
insert into public.inv_kardex_movimientos(tipo,articulo_id,inventario_lote_id,lote,fecha,clase,cantidad,motivo,responsable)
select 'PRODUCTO_TERMINADO',l.producto_id,l.id,l.lote,(now() at time zone 'America/Guayaquil')::date,
  'SALDO_EXISTENTE',l.cantidad,'Existencias al activar el Kardex; movimientos anteriores pendientes de reconstruir','Instalación del Kardex'
from public.inventario_lotes l where l.cantidad>0 and not exists(
  select 1 from public.inv_kardex_movimientos m where m.inventario_lote_id=l.id);
drop trigger if exists inv_kardex_pt on public.inventario_lotes;
-- BEFORE ve las reservas y el saldo previo; todo queda dentro de la transacción.
create trigger inv_kardex_pt before insert or update or delete on public.inventario_lotes
for each row execute function public.inv_kardex_observar_pt();

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
    where public.inv_kardex_puede('PRODUCTO_TERMINADO')
  ) l),'[]'::jsonb));
end;
$$;

create or replace function public.inv_kardex_consultar(p_tipo text,p_articulo_id uuid,p_desde date default null,p_hasta date default null,
  p_inicio integer default 0,p_limite integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_resultado jsonb;
begin
  if not public.inv_kardex_puede(p_tipo) then raise exception 'No tienes acceso al Kardex.' using errcode='42501'; end if;
  if p_desde>p_hasta then raise exception 'Rango de fechas inválido.'; end if;
  with todos as (
    select m.*,sum(cantidad) over(order by fecha,id rows unbounded preceding) saldo
    from public.inv_kardex_movimientos m where tipo=p_tipo and articulo_id=p_articulo_id
  ), filtrados as (select * from todos where (p_desde is null or fecha>=p_desde) and (p_hasta is null or fecha<=p_hasta)),
  pagina as (select * from filtrados order by fecha,id offset greatest(p_inicio,0) limit least(greatest(p_limite,1),500))
  select jsonb_build_object('movimientos',coalesce((select jsonb_agg(p order by p.fecha,p.id) from pagina p),'[]'::jsonb),
    'total',(select count(*) from filtrados),
    'saldo_anterior',coalesce((select sum(cantidad) from todos where p_desde is not null and fecha<p_desde),0),
    'saldo_cierre',coalesce((select sum(cantidad) from todos where p_hasta is null or fecha<=p_hasta),0)) into v_resultado;
  return v_resultado;
end;
$$;

create or replace function public.inv_kardex_validar_mp(p_articulo_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from (
    select sum(cantidad) over(order by fecha,id rows unbounded preceding) saldo from public.inv_kardex_movimientos
    where tipo='MATERIA_PRIMA' and articulo_id=p_articulo_id
  ) s where saldo<0) then raise exception 'El movimiento deja stock negativo en alguna fecha. Revisa las entradas anteriores.'; end if;
end;
$$;

create or replace function public.inv_kardex_registrar(p_tipo text,p_articulo_id uuid,p_lote_id uuid,p_fecha date,p_clase text,
  p_cantidad numeric,p_saldo_esperado numeric,p_motivo text,p_documento text,p_solicitud_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_saldo numeric; v_delta numeric; v_id bigint; v_lote public.inventario_lotes%rowtype; v_existente record; v_reservado numeric; v_datos jsonb;
begin
  if not public.inv_kardex_puede(p_tipo,true) then raise exception 'No tienes permiso para ajustar inventario.' using errcode='42501'; end if;
  if p_tipo not in ('MATERIA_PRIMA','PRODUCTO_TERMINADO') or p_tipo is null or p_fecha is null or p_fecha>(now() at time zone 'America/Guayaquil')::date
    or p_clase not in ('ENTRADA','SALIDA','CONTEO') or p_clase is null or p_cantidad is null or p_cantidad::text in ('NaN','Infinity','-Infinity')
    or p_cantidad<0 or p_cantidad<>round(p_cantidad,6) or (p_clase<>'CONTEO' and p_cantidad=0) or length(trim(coalesce(p_motivo,'')))<5
    or length(p_motivo)>500 or length(coalesce(p_documento,''))>200 or p_solicitud_id is null or p_saldo_esperado is null
    then raise exception 'Revisa fecha, cantidad y motivo (mínimo 5 caracteres).'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tipo||p_articulo_id::text,0));
  v_datos:=jsonb_build_object('tipo',p_tipo,'articulo',p_articulo_id,'lote',p_lote_id,'fecha',p_fecha,'clase',p_clase,
    'cantidad',p_cantidad,'saldo',p_saldo_esperado,'motivo',trim(p_motivo),'documento',trim(coalesce(p_documento,'')));
  select * into v_existente from public.inv_kardex_movimientos where solicitud_id=p_solicitud_id;
  if found then
    if v_existente.creado_por<>auth.uid() or v_existente.articulo_id<>p_articulo_id or v_existente.tipo<>p_tipo
      then raise exception 'La solicitud ya se usó para otro movimiento.'; end if;
    if v_existente.solicitud_datos is distinct from v_datos then raise exception 'El movimiento anterior ya se guardó con otros datos. Cierra el formulario y abre uno nuevo.'; end if;
    return jsonb_build_object('id',v_existente.id,'repetido',true);
  end if;
  if p_tipo='MATERIA_PRIMA' then
    if not exists(select 1 from public.materias_primas where id=p_articulo_id and activo) then raise exception 'Materia prima no disponible.'; end if;
    if p_cantidad<>trunc(p_cantidad) and exists(select 1 from public.materias_primas where id=p_articulo_id and unidad_base::text='UNIDAD')
      then raise exception 'Este artículo requiere unidades enteras.'; end if;
    if not exists(select 1 from public.inv_kardex_movimientos where tipo=p_tipo and articulo_id=p_articulo_id and clase='SALDO_INICIAL')
      then raise exception 'Carga primero el saldo inicial de este artículo.'; end if;
    if exists(select 1 from public.inv_kardex_movimientos where tipo=p_tipo and articulo_id=p_articulo_id and clase='SALDO_INICIAL' and fecha>=p_fecha)
      then raise exception 'Los movimientos deben ser posteriores al cierre del saldo inicial.'; end if;
    select coalesce(sum(cantidad),0) into v_saldo from public.inv_kardex_movimientos where tipo=p_tipo and articulo_id=p_articulo_id and fecha<=p_fecha;
  else
    if p_cantidad<>trunc(p_cantidad) then raise exception 'PT requiere unidades enteras.'; end if;
    if p_fecha<>(now() at time zone 'America/Guayaquil')::date then raise exception 'Los ajustes de lotes existentes de PT se hacen con la fecha actual.'; end if;
    select * into v_lote from public.inventario_lotes where id=p_lote_id and producto_id=p_articulo_id for update;
    if not found then raise exception 'Selecciona un lote existente del SKU.'; end if;
    v_saldo:=v_lote.cantidad;
  end if;
  if abs(v_saldo-p_saldo_esperado)>0.000001 then raise exception 'El saldo cambió. Actualiza el Kardex antes de guardar.'; end if;
  v_delta:=case p_clase when 'CONTEO' then p_cantidad-v_saldo when 'SALIDA' then -p_cantidad else p_cantidad end;
  if p_tipo='MATERIA_PRIMA' then
    insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,documento,solicitud_id,solicitud_datos,creado_por,responsable)
    values(p_tipo,p_articulo_id,p_fecha,p_clase,v_delta,trim(p_motivo),nullif(trim(p_documento),''),p_solicitud_id,v_datos,auth.uid(),
      coalesce((select nombre from public.app_profiles where user_id=auth.uid()),'Usuario')) returning id into v_id;
    perform public.inv_kardex_validar_mp(p_articulo_id);
  else
    if v_delta=0 then raise exception 'El conteo coincide con el saldo; no hay ajuste para registrar.'; end if;
    select coalesce(cantidad_reservada,0) into v_reservado from public.stock_disponible_lotes where id=p_lote_id;
    if v_saldo+v_delta<coalesce(v_reservado,0) then
      raise exception 'El ajuste dejaría menos unidades que las reservadas. Libera primero la reserva.';
    end if;
    perform set_config('cibuspan.kardex_contexto',jsonb_build_object('fecha',p_fecha,'clase',p_clase,'motivo',trim(p_motivo),
      'documento',nullif(trim(p_documento),''),'solicitud_id',p_solicitud_id,'solicitud_datos',v_datos)::text,true);
    update public.inventario_lotes set cantidad=cantidad+v_delta where id=p_lote_id;
    perform set_config('cibuspan.kardex_contexto','',true);
    select id into v_id from public.inv_kardex_movimientos where solicitud_id=p_solicitud_id;
  end if;
  return jsonb_build_object('id',v_id,'repetido',false);
end;
$$;

create or replace function public.inv_kardex_cargar_inicial(p_archivo text,p_hash text,p_fecha date,p_lineas jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_carga uuid; v_linea jsonb; v_lote jsonb; v_tipo text; v_articulo uuid; v_stock numeric;
  v_clave text; v_vistos text[]:='{}'; v_id uuid;
begin
  if not public.inv_kardex_puede('MATERIA_PRIMA',true) or not public.inv_kardex_puede('PRODUCTO_TERMINADO',true)
    then raise exception 'Necesitas permiso de Inventario o Producción para cargar ambos inventarios.' using errcode='42501'; end if;
  if p_fecha is null or p_fecha>(now() at time zone 'America/Guayaquil')::date or p_hash is null or p_hash!~'^[a-f0-9]{64}$'
    or length(trim(coalesce(p_archivo,'')))=0 or length(p_archivo)>250 or jsonb_typeof(p_lineas)<>'array'
    or p_lineas is null or jsonb_array_length(p_lineas) not between 1 and 2000 then raise exception 'Carga inicial inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('inv_carga:'||p_hash||p_fecha::text,0));
  select id into v_carga from public.inv_cargas_iniciales where archivo_hash=p_hash and fecha_corte=p_fecha and seleccion_hash=md5(p_lineas::text);
  if found then return jsonb_build_object('id',v_carga,'repetido',true); end if;
  lock table public.inventario_lotes in share row exclusive mode;
  -- Orden fijo de bloqueos para dos cargas concurrentes con artículos comunes.
  for v_linea in select value from jsonb_array_elements(p_lineas) order by value->>'tipo',value->>'articulo_id' loop
    v_tipo:=v_linea->>'tipo'; v_articulo:=(v_linea->>'articulo_id')::uuid; v_stock:=(v_linea->>'cantidad')::numeric;
    if v_tipo is null or v_tipo not in ('MATERIA_PRIMA','PRODUCTO_TERMINADO') or v_articulo is null or v_stock is null or v_stock<0
      or v_stock::text in ('NaN','Infinity','-Infinity') or v_stock<>round(v_stock,6) then raise exception 'Artículo o cantidad inicial inválidos.'; end if;
    if v_linea->>'costo_total' is not null and ((v_linea->>'costo_total')::numeric<0
      or (v_linea->>'costo_total')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'Costo inicial inválido.'; end if;
    v_clave:=v_tipo||v_articulo::text;
    if v_clave=any(v_vistos) then raise exception 'Hay filas repetidas del mismo artículo. Unifica su saldo antes de cargar.'; end if;
    v_vistos:=array_append(v_vistos,v_clave);
    perform pg_advisory_xact_lock(hashtextextended(v_clave,0));
    if exists(select 1 from public.inv_kardex_movimientos where tipo=v_tipo and articulo_id=v_articulo)
      or (v_tipo='PRODUCTO_TERMINADO' and exists(select 1 from public.inventario_lotes where producto_id=v_articulo and cantidad>0))
      then raise exception 'El artículo % ya tiene existencias o movimientos. Usa un ajuste; no se duplicará su saldo inicial.',v_articulo; end if;
    if v_tipo='MATERIA_PRIMA' then
      if not exists(select 1 from public.materias_primas where id=v_articulo and activo) then raise exception 'Materia prima no vinculada al catálogo.'; end if;
      if v_stock<>trunc(v_stock) and exists(select 1 from public.materias_primas where id=v_articulo and unidad_base::text='UNIDAD')
        then raise exception 'El artículo requiere unidades enteras.'; end if;
    else
      if not exists(select 1 from public.productos where id=v_articulo and activo) or v_stock<>trunc(v_stock)
        then raise exception 'SKU no disponible o cantidad no entera.'; end if;
      if v_stock>0 and (jsonb_typeof(v_linea->'lotes') is distinct from 'array' or jsonb_array_length(v_linea->'lotes')=0
        or (select sum((value->>'cantidad')::numeric) from jsonb_array_elements(v_linea->'lotes')) is distinct from v_stock)
        then raise exception 'Las cantidades de los lotes no suman el stock del Excel.'; end if;
    end if;
  end loop;
  insert into public.inv_cargas_iniciales(archivo,archivo_hash,seleccion_hash,fecha_corte,lineas,datos,creado_por)
    values(p_archivo,p_hash,md5(p_lineas::text),p_fecha,jsonb_array_length(p_lineas),p_lineas,auth.uid()) returning id into v_carga;
  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_tipo:=v_linea->>'tipo'; v_articulo:=(v_linea->>'articulo_id')::uuid; v_stock:=(v_linea->>'cantidad')::numeric;
    if v_tipo='MATERIA_PRIMA' or v_stock=0 then
      insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,documento,valor_inicial,carga_id,creado_por,responsable)
      values(v_tipo,v_articulo,p_fecha,'SALDO_INICIAL',v_stock,'Saldo inicial del Excel revisado',p_archivo,
        (v_linea->>'costo_total')::numeric,v_carga,auth.uid(),coalesce((select nombre from public.app_profiles where user_id=auth.uid()),'Usuario'));
    else
      for v_lote in select value from jsonb_array_elements(v_linea->'lotes') loop
        if nullif(trim(v_lote->>'lote'),'') is null or (v_lote->>'cantidad')::numeric<=0
          or (v_lote->>'cantidad')::numeric<>trunc((v_lote->>'cantidad')::numeric)
          or nullif(v_lote->>'fecha_produccion','') is null or nullif(v_lote->>'fecha_vencimiento','') is null
          or (v_lote->>'fecha_produccion')::date>p_fecha or (v_lote->>'fecha_vencimiento')::date<(v_lote->>'fecha_produccion')::date
          then raise exception 'Completa lote, fechas y cantidad de cada producto terminado.'; end if;
        if exists(select 1 from public.inventario_lotes where producto_id=v_articulo and upper(trim(lote))=upper(trim(v_lote->>'lote'))
          and fecha_produccion=(v_lote->>'fecha_produccion')::date) then raise exception 'El lote ya existe. Revisa su saldo antes de cargar.'; end if;
        perform set_config('cibuspan.kardex_contexto',jsonb_build_object('fecha',p_fecha,'clase','SALDO_INICIAL',
          'motivo','Saldo inicial del Excel revisado','documento',p_archivo,'carga_id',v_carga,
          'valor_inicial',(v_linea->>'costo_total')::numeric*(v_lote->>'cantidad')::numeric/v_stock)::text,true);
        insert into public.inventario_lotes(producto_id,lote,fecha_produccion,fecha_vencimiento,fecha_ingreso_bodega,cantidad)
        values(v_articulo,upper(trim(v_lote->>'lote')),(v_lote->>'fecha_produccion')::date,(v_lote->>'fecha_vencimiento')::date,p_fecha,
          (v_lote->>'cantidad')::integer) returning id into v_id;
      end loop;
      perform set_config('cibuspan.kardex_contexto','',true);
    end if;
  end loop;
  return jsonb_build_object('id',v_carga,'repetido',false);
end;
$$;
revoke all on function public.inv_kardex_observar_pt(),public.inv_kardex_validar_mp(uuid) from public,anon,authenticated;
revoke all on function public.inv_kardex_puede(text,boolean),public.inv_kardex_catalogo(),public.inv_kardex_consultar(text,uuid,date,date,integer,integer),
  public.inv_kardex_registrar(text,uuid,uuid,date,text,numeric,numeric,text,text,uuid),public.inv_kardex_cargar_inicial(text,text,date,jsonb) from public,anon;
grant execute on function public.inv_kardex_puede(text,boolean),public.inv_kardex_catalogo(),public.inv_kardex_consultar(text,uuid,date,date,integer,integer),
  public.inv_kardex_registrar(text,uuid,uuid,date,text,numeric,numeric,text,text,uuid),public.inv_kardex_cargar_inicial(text,text,date,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
