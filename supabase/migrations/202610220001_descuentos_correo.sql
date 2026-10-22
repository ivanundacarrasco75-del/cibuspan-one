begin;
create table public.com_descuento_correo_lotes (
 id uuid primary key, creado_por uuid not null references auth.users(id), promocion_id uuid not null references public.com_promociones(id),
 solicitud jsonb not null, creado_en timestamptz not null default now()
);
create table public.com_descuento_correos (
 id uuid primary key default gen_random_uuid(), lote_id uuid not null references public.com_descuento_correo_lotes(id),
 usuario_id uuid not null references public.app_profiles(user_id), email text not null, contenido jsonb not null,
 estado text not null default 'PENDIENTE' check(estado in ('PENDIENTE','ENVIANDO','ENVIADO','ERROR')),
 primer_intento timestamptz, actualizado_en timestamptz not null default now(), proveedor_id text, error text,
 unique(lote_id,usuario_id), unique(lote_id,email)
);
alter table public.com_descuento_correo_lotes enable row level security;
alter table public.com_descuento_correos enable row level security;
revoke all on public.com_descuento_correo_lotes, public.com_descuento_correos from anon, authenticated;
grant all on public.com_descuento_correo_lotes, public.com_descuento_correos to service_role;

create function public.com_destinatarios_descuentos()
returns table(user_id uuid,nombre text,email text,rol text)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.app_puede_alguna(array['Reportes','Administración','Descuentos']) then raise exception 'Sin permiso para descuentos' using errcode='42501'; end if;
 return query select p.user_id,p.nombre,p.email,p.rol from public.app_profiles p where p.activo and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' order by coalesce(p.nombre,p.email);
end $$;

create function public.com_guardar_promocion_correo(p_solicitud_id uuid,p_nombre text,p_cliente_id uuid,p_fecha_inicio date,p_fecha_fin date,p_observaciones text,p_productos jsonb,p_destinatarios uuid[])
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_anterior public.com_descuento_correo_lotes; v_solicitud jsonb; v_contenido jsonb; v_usuarios uuid[];
begin
 if auth.uid() is null or not public.app_puede_alguna(array['Reportes','Administración']) then raise exception 'Sin permiso para guardar descuentos' using errcode='42501'; end if;
 if p_solicitud_id is null then raise exception 'Falta identificador de guardado'; end if;
 v_usuarios := array(select distinct x from unnest(coalesce(p_destinatarios,'{}')) x order by x);
 if cardinality(v_usuarios)>50 then raise exception 'Máximo 50 destinatarios'; end if;
 v_solicitud := jsonb_build_object('nombre',p_nombre,'cliente',p_cliente_id,'inicio',p_fecha_inicio,'fin',p_fecha_fin,'observaciones',p_observaciones,'productos',p_productos,'usuarios',v_usuarios);
 perform pg_advisory_xact_lock(hashtextextended(p_solicitud_id::text,0));
 select * into v_anterior from public.com_descuento_correo_lotes where id=p_solicitud_id;
 if found then
  if v_anterior.creado_por<>auth.uid() or v_anterior.solicitud<>v_solicitud then raise exception 'Este guardado ya existe con otros datos'; end if;
  return v_anterior.promocion_id;
 end if;
 if exists(select 1 from unnest(v_usuarios) x where not exists(select 1 from public.app_profiles p where p.user_id=x and p.activo and p.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'Hay destinatarios inactivos o sin correo válido'; end if;
 v_id:=public.com_guardar_promocion(p_nombre,p_cliente_id,p_fecha_inicio,p_fecha_fin,p_observaciones,p_productos);
 select jsonb_build_object('nombre',p.nombre,'cliente',c.nombre,'fecha_inicio',p.fecha_inicio,'fecha_fin',p.fecha_fin,'observaciones',p.observaciones,
 'productos',(select jsonb_agg(jsonb_build_object('sku',pr.codigo,'nombre',pr.nombre,'tipo',d.tipo_descuento,'valor',d.valor_descuento) order by pr.codigo)
 from public.com_promocion_productos d join public.productos pr on pr.id=d.producto_id where d.promocion_id=p.id)) into v_contenido
 from public.com_promociones p join public.clientes c on c.id=p.cliente_id where p.id=v_id;
 insert into public.com_descuento_correo_lotes(id,creado_por,promocion_id,solicitud) values(p_solicitud_id,auth.uid(),v_id,v_solicitud);
 insert into public.com_descuento_correos(lote_id,usuario_id,email,contenido)
 select distinct on (lower(trim(p.email))) p_solicitud_id,p.user_id,lower(trim(p.email)),v_contenido from public.app_profiles p where p.user_id=any(v_usuarios) order by lower(trim(p.email)),p.user_id;
 return v_id;
end $$;

create function public.com_estado_correos_descuentos()
returns table(id uuid,lote_id uuid,promocion_id uuid,email text,nombre text,estado text,error text,creado_en timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.app_puede_alguna(array['Reportes','Administración','Descuentos']) then raise exception 'Sin permiso para descuentos' using errcode='42501'; end if;
 return query select e.id,e.lote_id,l.promocion_id,e.email,e.contenido->>'nombre',e.estado,e.error,l.creado_en
 from public.com_descuento_correos e join public.com_descuento_correo_lotes l on l.id=e.lote_id order by l.creado_en desc,e.email limit 200;
end $$;
revoke all on function public.com_destinatarios_descuentos(), public.com_estado_correos_descuentos(), public.com_guardar_promocion_correo(uuid,text,uuid,date,date,text,jsonb,uuid[]) from public,anon;
grant execute on function public.com_destinatarios_descuentos(), public.com_estado_correos_descuentos(), public.com_guardar_promocion_correo(uuid,text,uuid,date,date,text,jsonb,uuid[]) to authenticated;
commit;
