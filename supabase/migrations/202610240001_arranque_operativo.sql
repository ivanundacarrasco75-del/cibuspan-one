-- Corte físico único. Instalar no aplica conteos ni modifica existencias.
begin;
set local lock_timeout='5s';
do $preflight$ begin
 if to_regprocedure('public.app_exigir_operacion(text[])') is null
   or to_regprocedure('public.inv_kardex_validar_mp(uuid)') is null
   or to_regprocedure('public.inv_inicio_proteger_fecha()') is null
   or to_regprocedure('public.inv_inicio_proteger_lote()') is null then
   raise exception 'Faltan los contratos instalados de autorización/Kardex. No se instaló el arranque.'; end if;
 perform id,fecha_produccion,fecha_vencimiento,fecha_ingreso_bodega,cantidad,inv_archivo_id from public.inventario_lotes limit 0;
 perform id,semielaborado_tipo_id,fecha_produccion,lote_interno,cantidad_inicial from public.inventario_semielaborados limit 0;
 perform id,inventario_semielaborado_id,cantidad,fecha_elaboracion_etiqueta from public.conversiones_semielaborados limit 0;
 perform id,estado,pedido_id,creado_en from public.reservas_inventario limit 0;
 perform id,estado,fecha_entrega from public.pedidos limit 0;
 if to_regclass('public.inv_arranque_cortes') is not null and
   obj_description(to_regclass('public.inv_arranque_cortes'),'pg_class') is distinct from 'cibuspan-arranque-v1' then
   raise exception 'Ya existe otra tabla de cortes. Revisar antes de modificar.'; end if;
 if to_regclass('public.inv_arranque_solicitudes') is not null and
   obj_description(to_regclass('public.inv_arranque_solicitudes'),'pg_class') is distinct from 'cibuspan-arranque-v1' then
   raise exception 'Ya existe otra tabla de solicitudes. Revisar antes de modificar.'; end if;
end $preflight$;

create table if not exists public.inv_arranque_solicitudes(
 id uuid primary key, actor uuid not null, estado text not null check(estado in ('APLICANDO','APLICADO','ANULADO')),
 datos jsonb, resultado jsonb, creado_en timestamptz not null default now()
);
create table if not exists public.inv_arranque_cortes(
 unico boolean primary key default true check(unico),
 solicitud_id uuid not null unique references public.inv_arranque_solicitudes(id),
 actor uuid not null, fecha_inicio date not null, fecha_cierre date not null,
 estado text not null check(estado in ('APLICANDO','APLICADO')),
 transaccion bigint not null default txid_current(), datos jsonb not null,
 base jsonb not null, resumen jsonb not null, aplicado_en timestamptz,
 check(fecha_cierre=fecha_inicio-1)
);
comment on table public.inv_arranque_cortes is 'cibuspan-arranque-v1';
comment on table public.inv_arranque_solicitudes is 'cibuspan-arranque-v1';
alter table public.inv_arranque_solicitudes enable row level security;
alter table public.inv_arranque_cortes enable row level security;
revoke all on public.inv_arranque_solicitudes,public.inv_arranque_cortes from public,anon,authenticated,service_role;

create or replace function public.inv_arranque_admin()
returns void language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:admin
begin
 perform public.app_exigir_operacion(array['Inventario']);
 if auth.uid() is null or not exists(select 1 from public.app_profiles where user_id=auth.uid() and activo and rol='ADMINISTRADOR') then
   raise exception 'Sólo un administrador habilitado puede preparar/aplicar el arranque.' using errcode='42501'; end if;
end $body$;

create or replace function public.inv_arranque_en_curso()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:curso
 select exists(select 1 from public.inv_arranque_cortes where estado='APLICANDO' and transaccion=txid_current() and actor=auth.uid());
$body$;

create or replace function public.inv_arranque_numero(p_valor jsonb,p_entero boolean)
returns numeric language plpgsql immutable set search_path=pg_catalog,public as $body$
declare n numeric;
begin
 if jsonb_typeof(p_valor) is distinct from 'number' then raise exception 'Completa todos los conteos: una casilla vacía no es cero.'; end if;
 n:=p_valor::text::numeric;
 if n<0 or n>1e12 or n<>round(n,6) or (p_entero and (n<>trunc(n) or n>2147483647)) then
   raise exception 'Cantidad inválida: usa hasta seis decimales y unidades enteras cuando corresponda.'; end if;
 return n;
end $body$;

create or replace function public.inv_arranque_base()
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:base
 with mp_saldo as(select articulo_id,sum(cantidad) saldo,bool_or(clase='SALDO_INICIAL') iniciado
   from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' group by articulo_id),
 pt_saldo as(select producto_id,sum(cantidad) saldo from public.inventario_lotes group by producto_id),
 pt_kardex as(select articulo_id,sum(cantidad) saldo from public.inv_kardex_movimientos where tipo='PRODUCTO_TERMINADO' group by articulo_id),
 convertidas as(select inventario_semielaborado_id,sum(cantidad) n from public.conversiones_semielaborados group by inventario_semielaborado_id),
 semi as(select i.*,coalesce(c.n,0)::integer convertido,(i.cantidad_inicial-coalesce(c.n,0))::integer disponible
   from public.inventario_semielaborados i left join convertidas c on c.inventario_semielaborado_id=i.id),
 semi_saldo as(select semielaborado_tipo_id,sum(disponible) saldo from semi group by semielaborado_tipo_id)
 select jsonb_build_object('hoy',(now() at time zone 'America/Guayaquil')::date,
 'mp',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'codigo',m.codigo,'codigo_contable',m.codigo_contable,'nombre',m.nombre,
   'unidad',m.unidad_base,'activo',m.activo,'saldo',coalesce(k.saldo,0),'iniciado',coalesce(k.iniciado,false)) order by m.id)
   from public.materias_primas m left join mp_saldo k on k.articulo_id=m.id where m.activo or coalesce(k.saldo,0)<>0),'[]'::jsonb),
 'pt',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'codigo',p.codigo,'nombre',p.nombre,'unidad','UNIDAD','activo',p.activo,
   'saldo',coalesce(s.saldo,0),'saldo_kardex',coalesce(k.saldo,0)) order by p.id)
   from public.productos p left join pt_saldo s on s.producto_id=p.id left join pt_kardex k on k.articulo_id=p.id
   where p.activo or coalesce(s.saldo,0)<>0 or coalesce(k.saldo,0)<>0),'[]'::jsonb),
 'semi',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'producto_id',t.producto_base_id,'codigo',p.codigo,'nombre',t.nombre,
   'unidad','UNIDAD','activo',t.activo,'saldo',coalesce(s.saldo,0)) order by t.id)
   from public.semielaborado_tipos t join public.productos p on p.id=t.producto_base_id
   left join semi_saldo s on s.semielaborado_tipo_id=t.id where t.activo or coalesce(s.saldo,0)<>0),'[]'::jsonb),
 'lotes_pt',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.inventario_lotes i),'[]'::jsonb),
 'lotes_semi',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from semi s),'[]'::jsonb),
 'movimientos',coalesce((select jsonb_agg(to_jsonb(k) order by k.id) from public.inv_kardex_movimientos k),'[]'::jsonb),
 'reservas',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.reservas_inventario r),'[]'::jsonb),
 'reservas_detalle',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.reserva_detalles r),'[]'::jsonb),
 'pedidos',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.pedidos p),'[]'::jsonb),
 'pedidos_detalle',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.pedido_detalles p),'[]'::jsonb),
 'producciones',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.producciones p),'[]'::jsonb),
 'producciones_detalle',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.produccion_detalles p),'[]'::jsonb),
 'conversiones',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.conversiones_semielaborados c),'[]'::jsonb),
 'catalogo_mp',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.materias_primas m),'[]'::jsonb),
 'catalogo_pt',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.productos p),'[]'::jsonb),
 'catalogo_semi',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.semielaborado_tipos t),'[]'::jsonb));
$body$;

create or replace function public.inv_arranque_plan(p_base jsonb,p_inicio date,p_datos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:plan
declare grupo text; g jsonb; a jsonb; l jsonb; existente jsonb; n numeric; total numeric; suma numeric;
 ids uuid[]; lotes uuid[]:=array[]::uuid[]; claves text[]; clave text; item uuid; lote_id uuid;
 lineas jsonb:='[]'; avisos jsonb:='[]'; cantidad_articulos integer; h date; f date; v date;
begin
 h:=(p_base->>'hoy')::date;
 if p_inicio is null or p_inicio<h or p_inicio>h+1 then raise exception 'Elige inicio hoy o mañana, con conteo físico al cierre del día anterior.'; end if;
 if p_datos->'version' is distinct from '1'::jsonb or jsonb_typeof(p_datos->'nota') is distinct from 'string'
   or length(p_datos->>'nota') not between 5 and 2000 then raise exception 'Describe el conteo y su responsable (5 a 2000 caracteres).'; end if;
 foreach grupo in array array['mp','pt','semi'] loop
   if jsonb_typeof(p_datos->grupo) is distinct from 'array' or jsonb_array_length(p_datos->grupo)>4000 then
     raise exception 'Completa el conteo de MP, PT y semielaborados.'; end if;
   ids:=array[]::uuid[];
   for g in select value from jsonb_array_elements(p_datos->grupo) loop
     item:=(g->>'id')::uuid;
     if item is null or item=any(ids) then raise exception 'Hay artículos repetidos o sin identificar.'; end if;
     select value into a from jsonb_array_elements(p_base->grupo) where value->>'id'=item::text;
     if not found then raise exception 'El catálogo cambió o el artículo no corresponde a este grupo. Actualiza la revisión.'; end if;
     ids:=array_append(ids,item);
     if grupo='mp' then
       n:=public.inv_arranque_numero(g->'cantidad',a->>'unidad'='UNIDAD');
       if g->>'unidad' is distinct from a->>'unidad' then raise exception 'La unidad de % cambió. Actualiza el conteo.',a->>'nombre'; end if;
     else
       n:=public.inv_arranque_numero(g->'total',true); suma:=0; claves:=array[]::text[];
       if jsonb_typeof(g->'lotes') is distinct from 'array' or jsonb_array_length(g->'lotes')>1000 then raise exception 'Completa los lotes del artículo %.',a->>'nombre'; end if;
       for l in select value from jsonb_array_elements(g->'lotes') loop
         lote_id:=(l->>'id')::uuid; total:=public.inv_arranque_numero(l->'cantidad',true);
         if lote_id is null or lote_id=any(lotes) or total=0 then raise exception 'Lotes repetidos o cantidades de lote sin completar.'; end if;
         lotes:=array_append(lotes,lote_id);suma:=suma+total;
         f:=(l->>'fecha_produccion')::date;
         if f is null or f>=p_inicio then raise exception 'La fecha real de los lotes del conteo debe ser anterior al inicio.'; end if;
         if grupo='pt' then
           v:=(l->>'fecha_vencimiento')::date;
           if jsonb_typeof(l->'lote') is distinct from 'string' or length(trim(l->>'lote')) not between 1 and 100 or v is null or v<f then raise exception 'Completa lote y vencimiento reales de %.',a->>'nombre'; end if;
           clave:=upper(trim(l->>'lote'))||'|'||f::text;
           select value into existente from jsonb_array_elements(p_base->'lotes_pt') where value->>'id'=lote_id::text;
           if found then
             if existente->>'producto_id'<>item::text or upper(trim(existente->>'lote'))<>upper(trim(l->>'lote')) or (existente->>'fecha_produccion')::date<>f then
               raise exception 'El lote existente cambió de identidad. Para otro lote físico agrega una fila nueva.'; end if;
           elsif exists(select 1 from jsonb_array_elements(p_base->'lotes_pt') x where x->>'producto_id'=item::text
             and upper(trim(x->>'lote'))=upper(trim(l->>'lote')) and (x->>'fecha_produccion')::date=f) then
             raise exception 'Ese lote ya existe. Selecciónalo del catálogo en vez de duplicarlo.';
           end if;
           if v<p_inicio then avisos:=avisos||jsonb_build_array('Lote vencido de '||(a->>'nombre')||': se cuenta físicamente; FEFO no lo reserva. Revisar disposición y planificación.'); end if;
         else
           if jsonb_typeof(l->'lote_interno') is distinct from 'string' or length(l->>'lote_interno')>100 then raise exception 'Referencia interna de semielaborado inválida.'; end if;
           clave:=(l->>'lote_interno')||'|'||f::text;
           select value into existente from jsonb_array_elements(p_base->'lotes_semi') where value->>'id'=lote_id::text;
           if found then
             if existente->>'semielaborado_tipo_id'<>item::text or existente->>'lote_interno'<>l->>'lote_interno' or (existente->>'fecha_produccion')::date<>f then
               raise exception 'La identidad del semielaborado existente cambió. Usa una fila nueva para otro lote.'; end if;
           elsif exists(select 1 from jsonb_array_elements(p_base->'lotes_semi') x where x->>'semielaborado_tipo_id'=item::text
             and x->>'lote_interno'=l->>'lote_interno' and (x->>'fecha_produccion')::date=f) then
             raise exception 'Ese semielaborado ya existe. Selecciona su fila del catálogo.';
           end if;
         end if;
         if clave=any(claves) then raise exception 'Hay un lote físico repetido en %.',a->>'nombre'; end if;
         claves:=array_append(claves,clave);
       end loop;
       if suma<>n then raise exception 'Los lotes de % suman %, pero el total contado es %.',a->>'nombre',suma,n; end if;
     end if;
     if a->>'activo'='false' and n>0 then avisos:=avisos||jsonb_build_array('Artículo inactivo con conteo positivo: '||(a->>'nombre')||'. Reactívalo en catálogo si debe usarse operativamente.'); end if;
     lineas:=lineas||jsonb_build_array(jsonb_build_object('grupo',grupo,'id',item,'codigo',a->>'codigo','nombre',a->>'nombre',
       'unidad',a->>'unidad','sistema',(a->>'saldo')::numeric,'conteo',n,'diferencia',n-(a->>'saldo')::numeric,
       'kardex',case when grupo='pt' then (a->>'saldo_kardex')::numeric else (a->>'saldo')::numeric end));
   end loop;
   cantidad_articulos:=jsonb_array_length(p_base->grupo);
   if cardinality(ids)<>cantidad_articulos then raise exception 'Faltan artículos del grupo %. Un artículo no contado no se toma como cero.',grupo; end if;
 end loop;
 return jsonb_build_object('lineas',lineas,'avisos',avisos);
end $body$;

create or replace function public.inv_arranque_bloqueos(p_base jsonb,p_inicio date)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $body$
declare r jsonb:='[]';
begin
 if exists(select 1 from jsonb_array_elements(p_base->'reservas') x where x->>'estado'='ACTIVA') then
   r:=r||jsonb_build_array('Hay reservas activas. Revísalas y libéralas desde Despachos antes del corte; no se eliminan automáticamente.'); end if;
 if exists(select 1 from jsonb_array_elements(p_base->'movimientos') x where (x->>'fecha')::date>=p_inicio)
   or exists(select 1 from jsonb_array_elements(p_base->'producciones_detalle') x where (x->>'fecha_produccion')::date>=p_inicio)
   or exists(select 1 from jsonb_array_elements(p_base->'conversiones') x where (x->>'fecha_elaboracion_etiqueta')::date>=p_inicio)
   or exists(select 1 from jsonb_array_elements(p_base->'lotes_semi') x where (x->>'fecha_produccion')::date>=p_inicio and (x->>'disponible')::numeric<>0)
   or exists(select 1 from jsonb_array_elements(p_base->'lotes_pt') x where (x->>'fecha_ingreso_bodega')::date>=p_inicio and (x->>'cantidad')::numeric<>0) then
   r:=r||jsonb_build_array('Ya hay movimientos o fabricaciones fechados desde ese inicio. Revisa la fecha del corte y el puente de movimientos; no se descartan operaciones.'); end if;
 return r;
end $body$;

create or replace function public.inv_arranque_estado()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:estado
declare c public.inv_arranque_cortes%rowtype; admin boolean;
begin
 perform public.app_exigir_operacion(array['Inventario','Producción','Reportes','Materias primas']);
 admin:=exists(select 1 from public.app_profiles where user_id=auth.uid() and activo and rol='ADMINISTRADOR');
 select * into c from public.inv_arranque_cortes where estado='APLICADO';
 return jsonb_build_object('instalado',true,'aplicado',found,'puede_preparar',admin,'hoy',(now() at time zone 'America/Guayaquil')::date,
   'id',c.solicitud_id,'fecha_inicio',c.fecha_inicio,'fecha_cierre',c.fecha_cierre,'aplicado_en',c.aplicado_en);
end $body$;

create or replace function public.inv_arranque_catalogo()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:catalogo
declare b jsonb;
begin
 perform public.inv_arranque_admin(); b:=public.inv_arranque_base();
 return jsonb_build_object('mp',b->'mp','pt',b->'pt','semi',b->'semi','lotes_pt',b->'lotes_pt','lotes_semi',b->'lotes_semi','hoy',b->'hoy',
   'reservas_activas',(select count(*) from jsonb_array_elements(b->'reservas') x where x->>'estado'='ACTIVA'),
   'pedidos_pendientes',(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(b->'pedidos') x where x->>'estado' in ('INGRESADO','PREPARADO')));
end $body$;

create or replace function public.inv_arranque_prever(p_inicio date,p_conteos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:prever
declare b jsonb; plan jsonb; bloqueos jsonb;
begin
 perform public.inv_arranque_admin();
 if exists(select 1 from public.inv_arranque_cortes) then raise exception 'El arranque ya está aplicado. Consulta su informe; no se vuelve a abrir.'; end if;
 b:=public.inv_arranque_base();plan:=public.inv_arranque_plan(b,p_inicio,p_conteos);bloqueos:=public.inv_arranque_bloqueos(b,p_inicio);
 return plan||jsonb_build_object('token',md5(jsonb_build_object('base',b,'inicio',p_inicio,'conteos',p_conteos)::text),
   'bloqueos',bloqueos,'puede_aplicar',jsonb_array_length(bloqueos)=0,'fecha_inicio',p_inicio,'fecha_cierre',p_inicio-1);
end $body$;

create or replace function public.inv_arranque_confirmar(p_solicitud uuid,p_inicio date,p_conteos jsonb,p_token text,
 p_conteo_completo boolean,p_pedidos_revisados boolean,p_usuario uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:confirmar
declare s public.inv_arranque_solicitudes%rowtype; b jsonb; plan jsonb; bloqueos jsonb; datos jsonb; v_resultado jsonb;
 g jsonb; l jsonb; x jsonb; objetivo numeric; saldo numeric; delta numeric; convertido integer; cierre date;
 contexto text:=current_setting('cibuspan.kardex_contexto',true); responsable text;
begin
 perform public.inv_arranque_admin();
 if p_solicitud is null or auth.uid() is distinct from p_usuario then raise exception 'La sesión cambió o falta la solicitud.' using errcode='42501'; end if;
 perform set_config('lock_timeout','5s',true);
 if p_conteo_completo is distinct from true or p_pedidos_revisados is distinct from true then raise exception 'Confirma el conteo completo y la revisión de pedidos pendientes.'; end if;
 datos:=jsonb_build_object('inicio',p_inicio,'conteos',p_conteos);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.arranque.operativo',0));
 select * into s from public.inv_arranque_solicitudes where id=p_solicitud for update;
 if found then
   if s.actor<>auth.uid() then raise exception 'La solicitud pertenece a otro usuario.' using errcode='42501'; end if;
   if s.estado='ANULADO' then raise exception 'Este intento quedó cerrado sin aplicar. Revisa y genera otra vista previa.'; end if;
   if s.datos is distinct from datos or s.estado<>'APLICADO' then raise exception 'El intento tiene otros datos o requiere revisión.'; end if;
   return s.resultado||jsonb_build_object('repetido',true);
 end if;
 if exists(select 1 from public.inv_arranque_cortes) then raise exception 'Ya existe un arranque aplicado. No se vuelve a sustituir el inventario.'; end if;
 -- Ventana breve: lectores normales continúan; escritores/SELECT FOR UPDATE esperan.
 lock table public.productos,public.materias_primas,public.semielaborado_tipos,
   public.producciones,public.produccion_detalles,public.pedidos,public.pedido_detalles,
   public.reservas_inventario,public.reserva_detalles,public.inventario_semielaborados,
   public.inventario_lotes,public.conversiones_semielaborados,public.inv_kardex_movimientos in exclusive mode;
 b:=public.inv_arranque_base();plan:=public.inv_arranque_plan(b,p_inicio,p_conteos);bloqueos:=public.inv_arranque_bloqueos(b,p_inicio);
 if p_token is null or p_token<>md5(jsonb_build_object('base',b,'inicio',p_inicio,'conteos',p_conteos)::text) then
   raise exception 'El inventario, catálogo o los pedidos cambiaron desde la vista previa. Actualiza y revisa de nuevo.'; end if;
 if jsonb_array_length(bloqueos)>0 then raise exception '%',bloqueos->>0; end if;
 cierre:=p_inicio-1;
 select nombre into responsable from public.app_profiles where user_id=auth.uid();
 insert into public.inv_arranque_solicitudes(id,actor,estado,datos) values(p_solicitud,auth.uid(),'APLICANDO',datos);
 insert into public.inv_arranque_cortes(solicitud_id,actor,fecha_inicio,fecha_cierre,estado,datos,base,resumen)
 values(p_solicitud,auth.uid(),p_inicio,cierre,'APLICANDO',datos,b,plan);
 for g in select value from jsonb_array_elements(p_conteos->'mp') loop
   objetivo:=(g->>'cantidad')::numeric;
   select coalesce(sum(cantidad),0) into saldo from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=(g->>'id')::uuid;
   if not exists(select 1 from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=(g->>'id')::uuid and clase='SALDO_INICIAL') then
     insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,documento,creado_por,responsable)
     values('MATERIA_PRIMA',(g->>'id')::uuid,cierre,'SALDO_INICIAL',0,'Base cero para corte físico','ARRANQUE '||p_solicitud,auth.uid(),responsable);
   end if;
   delta:=objetivo-saldo;
   if delta<>0 then
     insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,documento,creado_por,responsable)
     values('MATERIA_PRIMA',(g->>'id')::uuid,cierre,'CONTEO',delta,'Conteo físico de arranque','ARRANQUE '||p_solicitud,auth.uid(),responsable);
   end if;
 end loop;
 perform set_config('cibuspan.kardex_contexto',jsonb_build_object('fecha',cierre,'clase','CONTEO',
   'motivo','Conteo físico de arranque','documento','ARRANQUE '||p_solicitud)::text,true);
 for x in select value from jsonb_array_elements(b->'lotes_pt') loop
   select z.value into l from jsonb_array_elements(p_conteos->'pt') a cross join lateral jsonb_array_elements(a.value->'lotes') z where z.value->>'id'=x->>'id';
   objetivo:=case when found then (l->>'cantidad')::numeric else 0 end;
   if (x->>'cantidad')::numeric<>objetivo or (objetivo>0 and (x->>'fecha_vencimiento' is distinct from l->>'fecha_vencimiento' or x->>'inv_archivo_id' is not null)) then
     update public.inventario_lotes set cantidad=objetivo::integer,
       fecha_vencimiento=case when objetivo>0 then (l->>'fecha_vencimiento')::date else fecha_vencimiento end,
       inv_archivo_id=case when objetivo>0 then null else inv_archivo_id end,actualizado_en=now()
       where id=(x->>'id')::uuid;
   end if;
 end loop;
 for g in select value from jsonb_array_elements(p_conteos->'pt') loop
   for l in select value from jsonb_array_elements(g->'lotes') loop
     if not exists(select 1 from public.inventario_lotes where id=(l->>'id')::uuid) then
       insert into public.inventario_lotes(id,producto_id,lote,fecha_produccion,fecha_ingreso_bodega,fecha_vencimiento,cantidad,creado_por)
       values((l->>'id')::uuid,(g->>'id')::uuid,upper(trim(l->>'lote')),(l->>'fecha_produccion')::date,cierre,
         (l->>'fecha_vencimiento')::date,(l->>'cantidad')::integer,auth.uid());
     end if;
   end loop;
   -- Si el histórico contable no coincidía con el físico, conciliar sólo esa
   -- diferencia residual; nunca volver a modificar el stock físico por ella.
   select coalesce(sum(cantidad),0) into saldo from public.inv_kardex_movimientos where tipo='PRODUCTO_TERMINADO' and articulo_id=(g->>'id')::uuid;
   delta:=(g->>'total')::numeric-saldo;
   if delta<>0 then
     insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,documento,creado_por,responsable)
     values('PRODUCTO_TERMINADO',(g->>'id')::uuid,cierre,'SISTEMA',delta,
       'Conciliación de Kardex previo con el físico de arranque','ARRANQUE '||p_solicitud,auth.uid(),responsable);
   end if;
 end loop;
 perform set_config('cibuspan.kardex_contexto',coalesce(contexto,''),true);
 for x in select value from jsonb_array_elements(b->'lotes_semi') loop
   select z.value into l from jsonb_array_elements(p_conteos->'semi') a cross join lateral jsonb_array_elements(a.value->'lotes') z where z.value->>'id'=x->>'id';
   objetivo:=case when found then (l->>'cantidad')::numeric else 0 end;
   convertido:=(x->>'convertido')::integer;
   if objetivo+convertido>2147483647 then raise exception 'Cantidad de semielaborado fuera del rango permitido.'; end if;
   if (x->>'cantidad_inicial')::numeric<>objetivo+convertido then
     update public.inventario_semielaborados set cantidad_inicial=(objetivo+convertido)::integer,actualizado_en=now() where id=(x->>'id')::uuid;
   end if;
 end loop;
 for g in select value from jsonb_array_elements(p_conteos->'semi') loop
   for l in select value from jsonb_array_elements(g->'lotes') loop
     if not exists(select 1 from public.inventario_semielaborados where id=(l->>'id')::uuid) then
       insert into public.inventario_semielaborados(id,semielaborado_tipo_id,fecha_produccion,lote_interno,cantidad_inicial,creado_por)
       values((l->>'id')::uuid,(g->>'id')::uuid,(l->>'fecha_produccion')::date,l->>'lote_interno',(l->>'cantidad')::integer,auth.uid());
     end if;
   end loop;
 end loop;
 -- Verificación de cierre: físico, Kardex y semielaborado disponible deben ser exactos.
 for g in select value from jsonb_array_elements(p_conteos->'mp') loop
   select coalesce(sum(cantidad),0) into saldo from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=(g->>'id')::uuid;
   if saldo<>(g->>'cantidad')::numeric then raise exception 'No coincidió el cierre MP. Se revirtió todo el corte.'; end if;
 end loop;
 for g in select value from jsonb_array_elements(p_conteos->'pt') loop
   select coalesce(sum(cantidad),0) into saldo from public.inventario_lotes where producto_id=(g->>'id')::uuid;
   if saldo<>(g->>'total')::numeric then raise exception 'No coincidió el físico PT. Se revirtió todo el corte.'; end if;
   select coalesce(sum(cantidad),0) into saldo from public.inv_kardex_movimientos where tipo='PRODUCTO_TERMINADO' and articulo_id=(g->>'id')::uuid;
   if saldo<>(g->>'total')::numeric then raise exception 'No coincidió el Kardex PT. Se revirtió todo el corte.'; end if;
 end loop;
 for g in select value from jsonb_array_elements(p_conteos->'semi') loop
   select coalesce(sum(i.cantidad_inicial-coalesce(c.n,0)),0) into saldo from public.inventario_semielaborados i
     left join (select inventario_semielaborado_id,sum(cantidad) n from public.conversiones_semielaborados group by inventario_semielaborado_id) c on c.inventario_semielaborado_id=i.id
     where i.semielaborado_tipo_id=(g->>'id')::uuid;
   if saldo<>(g->>'total')::numeric then raise exception 'No coincidió el semielaborado disponible. Se revirtió todo el corte.'; end if;
 end loop;
 v_resultado:=jsonb_build_object('estado','APLICADO','solicitud_id',p_solicitud,'fecha_inicio',p_inicio,'fecha_cierre',cierre,'resumen',plan,'repetido',false);
 update public.inv_arranque_cortes set estado='APLICADO',aplicado_en=clock_timestamp() where unico;
 update public.inv_arranque_solicitudes set estado='APLICADO',resultado=v_resultado where id=p_solicitud;
 return v_resultado;
end $body$;

create or replace function public.inv_arranque_resolver(p_solicitud uuid,p_usuario uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:resolver
declare s public.inv_arranque_solicitudes%rowtype;
begin
 perform public.inv_arranque_admin();
 if p_solicitud is null or auth.uid() is distinct from p_usuario then raise exception 'La sesión cambió o falta la solicitud.' using errcode='42501'; end if;
 perform set_config('lock_timeout','5s',true);
 perform pg_advisory_xact_lock(hashtextextended('cibuspan.arranque.operativo',0));
 select * into s from public.inv_arranque_solicitudes where id=p_solicitud for update;
 if found then
   if s.actor<>auth.uid() then raise exception 'La solicitud pertenece a otro usuario.' using errcode='42501'; end if;
   if s.estado='APLICADO' then return s.resultado||jsonb_build_object('repetido',true); end if;
   if s.estado<>'ANULADO' then raise exception 'El intento requiere revisión antes de continuar.'; end if;
 else
   -- Ausencia sellada bajo el bloqueo de aplicar: un envío atrasado no podrá entrar.
   insert into public.inv_arranque_solicitudes(id,actor,estado) values(p_solicitud,auth.uid(),'ANULADO');
 end if;
 return jsonb_build_object('estado','ANULADO','solicitud_id',p_solicitud);
end $body$;

create or replace function public.inv_arranque_reporte()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:reporte
declare r jsonb;
begin
 perform public.inv_arranque_admin();
 select to_jsonb(c) into r from public.inv_arranque_cortes c where estado='APLICADO';
 return r;
end $body$;

create or replace function public.inv_arranque_proteger()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:proteger
declare c public.inv_arranque_cortes%rowtype; j jsonb; anterior jsonb; campo text; confirmado boolean;
begin
 if public.inv_arranque_en_curso() then if TG_OP='DELETE' then return old; else return new; end if; end if;
 select * into c from public.inv_arranque_cortes where estado='APLICADO';
 if not found then if TG_OP='DELETE' then return old; else return new; end if; end if;
 if TG_OP<>'INSERT' then anterior:=to_jsonb(old); end if;
 if TG_OP<>'DELETE' then j:=to_jsonb(new); end if;
 if TG_TABLE_NAME='inv_kardex_movimientos' and TG_OP='INSERT' and j->>'tipo'='MATERIA_PRIMA' and j->>'clase'='SALDO_INICIAL'
   and (j->>'cantidad')::numeric=0 and j->>'solicitud_id' is null and (j->>'fecha')::date=c.fecha_cierre
   and not exists(select 1 from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=(j->>'articulo_id')::uuid and clase='SALDO_INICIAL') then return new; end if;
 if (now() at time zone 'America/Guayaquil')::date<c.fecha_inicio then raise exception 'El período operativo inicia el %. Hasta entonces continúa con pedidos.',c.fecha_inicio; end if;
 if TG_TABLE_NAME='inv_kardex_movimientos' then campo:='fecha';
 elsif TG_TABLE_NAME in ('produccion_detalles','conversiones_semielaborados','producciones') then
   campo:=case TG_TABLE_NAME when 'producciones' then 'fecha_produccion_general' when 'conversiones_semielaborados' then 'fecha_elaboracion_etiqueta' else 'fecha_produccion' end;
 elsif TG_TABLE_NAME='reservas_inventario' then
   if TG_OP='UPDATE' and old.creado_en<c.aplicado_en and new.estado in ('ACTIVA','DESPACHADA') and old.estado is distinct from new.estado then
     raise exception 'Esta reserva es anterior al corte. Prepara una reserva nueva con el stock del arranque.'; end if;
 elsif TG_TABLE_NAME='inventario_lotes' then
   confirmado:=TG_OP<>'INSERT' and (c.base->'lotes_pt' @> jsonb_build_array(jsonb_build_object('id',anterior->>'id'))
     or exists(select 1 from jsonb_array_elements(c.datos->'conteos'->'pt') a cross join lateral jsonb_array_elements(a->'lotes') l where l->>'id'=anterior->>'id'));
   if TG_OP='DELETE' and confirmado then raise exception 'No se elimina un lote respaldado por el arranque; registra su salida o ajuste.'; end if;
   if TG_OP='UPDATE' and confirmado and
     (new.producto_id is distinct from old.producto_id or new.lote is distinct from old.lote or new.fecha_produccion is distinct from old.fecha_produccion
       or new.fecha_vencimiento is distinct from old.fecha_vencimiento or new.inv_archivo_id is distinct from old.inv_archivo_id) then
     raise exception 'La identidad del lote fue confirmada en el arranque; usa movimientos trazables para corregir inventario.'; end if;
 elsif TG_TABLE_NAME='inventario_semielaborados' then
   confirmado:=TG_OP<>'INSERT' and (c.base->'lotes_semi' @> jsonb_build_array(jsonb_build_object('id',anterior->>'id'))
     or exists(select 1 from jsonb_array_elements(c.datos->'conteos'->'semi') a cross join lateral jsonb_array_elements(a->'lotes') l where l->>'id'=anterior->>'id'));
   if TG_OP='INSERT' and new.fecha_produccion<c.fecha_inicio then raise exception 'No ingreses una fabricación anterior al arranque como stock nuevo.'; end if;
   if TG_OP='DELETE' and confirmado then raise exception 'No se elimina un semielaborado respaldado por el arranque.'; end if;
   if TG_OP='UPDATE' and confirmado and
     (new.semielaborado_tipo_id is distinct from old.semielaborado_tipo_id or new.fecha_produccion is distinct from old.fecha_produccion or new.lote_interno is distinct from old.lote_interno) then
     raise exception 'No cambies la identidad del semielaborado confirmado en el arranque.'; end if;
 end if;
 if campo is not null then
   if (anterior->>campo)::date<c.fecha_inicio or (j->>campo)::date<c.fecha_inicio then
     raise exception 'El período anterior al % está cerrado. El historial no modifica el saldo físico del arranque.',c.fecha_inicio; end if;
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $body$;

create or replace function public.inv_arranque_no_truncar()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
begin
 if exists(select 1 from public.inv_arranque_cortes) then raise exception 'No se vacían tablas con un arranque registrado.'; end if;
 return null;
end $body$;

create or replace function public.inv_arranque_iniciar_mp()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $body$
-- cibuspan-arranque-v1:iniciar-mp
declare cierre date;
begin
 select fecha_cierre into cierre from public.inv_arranque_cortes where estado='APLICADO';
 if found and not exists(select 1 from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=new.id and clase='SALDO_INICIAL') then
   insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,responsable,creado_por)
   values('MATERIA_PRIMA',new.id,cierre,'SALDO_INICIAL',0,'Base cero de artículo posterior al arranque','Proceso de catálogo',auth.uid());
 end if;
 return new;
end $body$;

do $triggers$
declare t text;
begin
 foreach t in array array['inv_kardex_movimientos','inventario_lotes','inventario_semielaborados','producciones','produccion_detalles','conversiones_semielaborados','reservas_inventario'] loop
   execute format('drop trigger if exists inv_arranque_periodo on public.%I',t);
   execute format('create trigger inv_arranque_periodo before insert or update or delete on public.%I for each row execute function public.inv_arranque_proteger()',t);
   execute format('drop trigger if exists inv_arranque_truncate on public.%I',t);
   execute format('create trigger inv_arranque_truncate before truncate on public.%I for each statement execute function public.inv_arranque_no_truncar()',t);
 end loop;
end $triggers$;
drop trigger if exists inv_arranque_nueva_mp on public.materias_primas;
create trigger inv_arranque_nueva_mp after insert or update of activo on public.materias_primas for each row execute function public.inv_arranque_iniciar_mp();

-- Preserva las definiciones vigentes. No pega cuerpos del exportado privado.
do $envolver$
declare nombre text; firma text; id oid; src text; def text; marca text; cuerpo text; pos integer; propietario text;
begin
 foreach nombre in array array['inv_kardex_validar_mp','inv_inicio_proteger_fecha','inv_inicio_proteger_lote'] loop
   firma:=case when nombre='inv_kardex_validar_mp' then 'uuid' else '' end;
   id:=to_regprocedure('public.'||nombre||'('||firma||')');
   select p.prosrc,pg_get_userbyid(p.proowner) into src,propietario from pg_proc p where p.oid=id;
   if propietario in ('anon','authenticated','service_role') then raise exception 'El propietario de % requiere revisión.',nombre; end if;
   marca:=E'\n-- cibuspan-arranque-v1:'||nombre||E'\n';
   if starts_with(src,marca) then continue; end if;
   if strpos(src,'cibuspan-arranque-v1:')>0 then raise exception 'La marca de % no es compatible.',nombre; end if;
   if nombre='inv_kardex_validar_mp' then
     cuerpo:=marca||$nuevo$DECLARE v_inicio date; v_apertura numeric;
BEGIN
 SELECT fecha_inicio INTO v_inicio FROM public.inv_arranque_cortes WHERE estado='APLICADO';
 IF FOUND THEN
   SELECT coalesce(sum(cantidad),0) INTO v_apertura FROM public.inv_kardex_movimientos WHERE tipo='MATERIA_PRIMA' AND articulo_id=p_articulo_id AND fecha<v_inicio;
   IF EXISTS(SELECT 1 FROM (SELECT v_apertura+sum(cantidad) over(order by fecha,id rows unbounded preceding) saldo
     FROM public.inv_kardex_movimientos WHERE tipo='MATERIA_PRIMA' AND articulo_id=p_articulo_id AND fecha>=v_inicio) x WHERE saldo<0) OR v_apertura<0 THEN
     RAISE EXCEPTION 'El movimiento deja stock negativo en el período operativo. Revise entradas y consumos.';
   END IF;
 ELSE
$nuevo$||src||E'\n END IF;\nEND;\n';
   elsif nombre='inv_inicio_proteger_fecha' then
     cuerpo:=marca||$nuevo$BEGIN
 IF NEW.tipo='MATERIA_PRIMA' AND NEW.clase='SALDO_INICIAL' AND NEW.cantidad=0 AND NEW.solicitud_id IS NULL
   AND EXISTS(SELECT 1 FROM public.inv_arranque_cortes WHERE fecha_cierre=NEW.fecha AND (estado='APLICADO' OR public.inv_arranque_en_curso())) THEN RETURN NEW; END IF;
$nuevo$||src||E'\nEND;\n';
   else
     cuerpo:=marca||$nuevo$BEGIN
 IF public.inv_arranque_en_curso() THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
$nuevo$||src||E'\nEND;\n';
   end if;
   def:=pg_get_functiondef(id);pos:=strpos(def,src);
   if pos=0 then raise exception 'No se pudo conservar la definición de %.',nombre; end if;
   execute overlay(def placing cuerpo from pos for length(src));
   execute format('grant select on public.inv_arranque_cortes to %I',propietario);
   execute format('grant execute on function public.inv_arranque_en_curso() to %I',propietario);
 end loop;
end $envolver$;

do $privilegios$
declare f record;
begin
 for f in select p.oid::regprocedure firma from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('inv_arranque_admin','inv_arranque_en_curso','inv_arranque_numero','inv_arranque_base',
   'inv_arranque_plan','inv_arranque_bloqueos','inv_arranque_estado','inv_arranque_catalogo','inv_arranque_prever','inv_arranque_confirmar',
   'inv_arranque_resolver','inv_arranque_reporte','inv_arranque_proteger','inv_arranque_no_truncar','inv_arranque_iniciar_mp') loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.firma);
 end loop;
end $privilegios$;
grant execute on function public.inv_arranque_estado(),public.inv_arranque_catalogo(),public.inv_arranque_prever(date,jsonb),
 public.inv_arranque_confirmar(uuid,date,jsonb,text,boolean,boolean,uuid),public.inv_arranque_resolver(uuid,uuid),public.inv_arranque_reporte() to authenticated,service_role;
notify pgrst,'reload schema';
commit;
