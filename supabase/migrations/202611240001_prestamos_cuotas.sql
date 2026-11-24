begin;
set local lock_timeout='5s';
create table public.fin_prestamos (
 id uuid primary key,acreedor text not null,referencia text not null,fecha date not null check(isfinite(fecha)),
 numero_cuotas integer not null check(numero_cuotas between 1 and 600),
 monto_total numeric(14,2) not null check(monto_total>0),pagado_previo numeric(14,2) not null default 0 check(pagado_previo>=0 and pagado_previo<=monto_total),
 observaciones text not null default '',revision integer not null default 1,
 creado_por uuid not null,creado_en timestamptz not null default now(),modificado_por uuid not null,modificado_en timestamptz not null default now()
);
create unique index fin_prestamos_referencia on public.fin_prestamos(upper(btrim(acreedor)),upper(btrim(referencia)));
create table public.fin_prestamo_cuotas (
 id uuid primary key,prestamo_id uuid not null references public.fin_prestamos,
 numero integer not null check(numero between 1 and 600),vencimiento date not null check(isfinite(vencimiento)),
 monto numeric(14,2) not null check(monto>0),detalle text not null default '',enviada boolean not null default false,
 revision integer not null default 1,creado_por uuid not null,creado_en timestamptz not null default now(),
 modificado_por uuid not null,modificado_en timestamptz not null default now(),
 constraint fin_prestamo_numero unique(prestamo_id,numero) deferrable initially deferred
);
create table public.fin_prestamo_operaciones(id uuid primary key,prestamo_id uuid not null references public.fin_prestamos,solicitud jsonb not null,creado_por uuid not null,creado_en timestamptz not null default now());
alter table public.fin_prestamos enable row level security;
alter table public.fin_prestamo_cuotas enable row level security;
alter table public.fin_prestamo_operaciones enable row level security;
revoke all on public.fin_prestamos,public.fin_prestamo_cuotas,public.fin_prestamo_operaciones from public,anon,authenticated;
grant select on public.fin_prestamos,public.fin_prestamo_cuotas to authenticated;
create policy fin_prestamos_lectura on public.fin_prestamos for select to authenticated using((select public.fin_puede_consultar_cuentas()));
create policy fin_prestamo_cuotas_lectura on public.fin_prestamo_cuotas for select to authenticated using((select public.fin_puede_consultar_cuentas()));

create view public.fin_vw_prestamo_cuotas with(security_invoker=true) as
select q.*,coalesce(p.pagado,0) as pagado,greatest(q.monto-coalesce(p.pagado,0),0) as saldo,
 coalesce(p.pagos,'[]'::jsonb) as pagos,plan.semana as semana_activa
from public.fin_prestamo_cuotas q
left join lateral(select sum(x.valor) as pagado,jsonb_agg(jsonb_build_object('id',x.id,'valor',x.valor,'fecha',x.fecha,'documento',x.documento) order by x.fecha,x.registrado_en,x.id) as pagos
 from public.fin_pagos_compras x where x.documento_id='prestamo:'||q.id::text) p on true
left join public.fin_programacion_compras plan on plan.documento_id='prestamo:'||q.id::text and plan.pagado<plan.monto;
create view public.fin_vw_prestamos with(security_invoker=true) as
select p.*,coalesce(c.monto,0) as monto_cuotas,coalesce(c.pagado,0) as pagado_registrado,
 p.pagado_previo+coalesce(c.pagado,0) as pagado_total,greatest(p.monto_total-p.pagado_previo-coalesce(c.pagado,0),0) as saldo,
 greatest(p.monto_total-p.pagado_previo-coalesce(c.monto,0),0) as sin_distribuir,
 coalesce(c.cuotas,0) as cuotas_registradas,coalesce(c.enviadas,0) as cuotas_enviadas
from public.fin_prestamos p left join lateral(select sum(q.monto) as monto,sum(q.pagado) as pagado,count(*) as cuotas,count(*) filter(where q.enviada) as enviadas
 from public.fin_vw_prestamo_cuotas q where q.prestamo_id=p.id) c on true;
revoke all on public.fin_vw_prestamo_cuotas,public.fin_vw_prestamos from public,anon,authenticated;
grant select on public.fin_vw_prestamo_cuotas,public.fin_vw_prestamos to authenticated;

create function public.fin_bloquear_prestamo(p_id uuid) returns void language plpgsql set search_path='' as $$
begin
 if p_id is null then raise exception 'El préstamo o la cuota no existe.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fin_prestamo:'||p_id::text,0));
 perform 1 from public.fin_prestamos where id=p_id for update;
end $$;
revoke all on function public.fin_bloquear_prestamo(uuid) from public,anon,authenticated;
-- Todos los cambios y pagos toman primero el mismo bloqueo del préstamo.
do $bloqueo$
declare definicion text; marca text:='perform pg_advisory_xact_lock(hashtextextended(''fin_compras:''||p_id,0));';
begin
 select pg_get_functiondef('public.fin_bloquear_documento_compra(text)'::regprocedure) into definicion;
 if position(marca in definicion)=0 then raise exception 'Revisar el contrato de bloqueo de documentos.'; end if;
 execute replace(definicion,marca,'if starts_with(p_id,''prestamo:'') then
  perform public.fin_bloquear_prestamo((select prestamo_id from public.fin_prestamo_cuotas where id=substr(p_id,10)::uuid));
 end if; '||marca);
end $bloqueo$;

create function public.fin_guardar_prestamo(p_id uuid,p_revision integer,p_acreedor text,p_referencia text,p_fecha date,p_numero_cuotas integer,p_monto_total numeric,p_pagado_previo numeric,p_observaciones text,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare anterior public.fin_prestamos%rowtype;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para gestionar préstamos.' using errcode='42501'; end if;
 if p_id is null or p_fecha is null or not isfinite(p_fecha) or p_numero_cuotas is null or p_numero_cuotas not between 1 and 600
  or char_length(btrim(coalesce(p_acreedor,''))) not between 2 and 200 or char_length(btrim(coalesce(p_referencia,''))) not between 1 and 100
  or char_length(coalesce(p_observaciones,''))>500 or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500
  or p_monto_total is null or not(p_monto_total>0 and p_monto_total<1000000000 and p_monto_total=round(p_monto_total,2))
  or p_pagado_previo is null or not(p_pagado_previo>=0 and p_pagado_previo<=p_monto_total and p_pagado_previo=round(p_pagado_previo,2)) then
  raise exception 'Revisa acreedor, referencia, fecha, número de cuotas, importes y motivo.'; end if;
 perform public.fin_bloquear_prestamo(p_id);
 select * into anterior from public.fin_prestamos where id=p_id;
 if found then
  if anterior.acreedor=btrim(p_acreedor) and anterior.referencia=btrim(p_referencia) and anterior.fecha=p_fecha and anterior.numero_cuotas=p_numero_cuotas
   and anterior.monto_total=p_monto_total and anterior.pagado_previo=p_pagado_previo and anterior.observaciones=coalesce(p_observaciones,'') then return; end if;
  if p_revision is distinct from anterior.revision then raise exception 'El préstamo cambió. Actualiza antes de corregirlo.'; end if;
 elsif p_revision is not null then raise exception 'El préstamo ya no está disponible.';
 end if;
 if exists(select 1 from public.fin_prestamos where id<>p_id and upper(btrim(acreedor))=upper(btrim(p_acreedor)) and upper(btrim(referencia))=upper(btrim(p_referencia))) then
  raise exception 'Ya existe ese préstamo para el acreedor.'; end if;
 if exists(select 1 from public.fin_prestamo_cuotas where prestamo_id=p_id and numero>p_numero_cuotas)
  or coalesce((select sum(monto) from public.fin_prestamo_cuotas where prestamo_id=p_id),0)+p_pagado_previo>p_monto_total then
  raise exception 'Las cuotas registradas y el pago previo superan el total o el número de cuotas indicado.'; end if;
 insert into public.fin_prestamos(id,acreedor,referencia,fecha,numero_cuotas,monto_total,pagado_previo,observaciones,creado_por,modificado_por)
 values(p_id,btrim(p_acreedor),btrim(p_referencia),p_fecha,p_numero_cuotas,p_monto_total,p_pagado_previo,coalesce(p_observaciones,''),auth.uid(),auth.uid())
 on conflict(id) do update set acreedor=excluded.acreedor,referencia=excluded.referencia,fecha=excluded.fecha,numero_cuotas=excluded.numero_cuotas,
 monto_total=excluded.monto_total,pagado_previo=excluded.pagado_previo,observaciones=excluded.observaciones,revision=fin_prestamos.revision+1,modificado_por=auth.uid(),modificado_en=clock_timestamp();
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_PRESTAMO_GUARDAR',jsonb_build_object('prestamo_id',p_id,'motivo',p_motivo,'anterior',to_jsonb(anterior),'nuevo',(select to_jsonb(p) from public.fin_prestamos p where id=p_id)));
end $$;

create function public.fin_guardar_cuotas_prestamo(p_operacion uuid,p_prestamo uuid,p_revision integer,p_filas jsonb,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare prestamo public.fin_prestamos%rowtype; anterior public.fin_prestamo_cuotas%rowtype; fila record; solicitud jsonb; previa jsonb; cambian boolean;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para gestionar cuotas.' using errcode='42501'; end if;
 if p_operacion is null or p_prestamo is null or p_revision is null or jsonb_typeof(p_filas) is distinct from 'array'
  or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Revisa las cuotas y el motivo.'; end if;
 if jsonb_array_length(p_filas) not between 1 and 600 or (select count(distinct x.id) from jsonb_to_recordset(p_filas) x(id uuid))<>jsonb_array_length(p_filas)
  or (select count(distinct x.numero) from jsonb_to_recordset(p_filas) x(numero integer))<>jsonb_array_length(p_filas) then raise exception 'Incluye cuotas distintas y sin números repetidos.'; end if;
 solicitud:=jsonb_build_object('prestamo',p_prestamo,'revision',p_revision,'filas',p_filas,'motivo',p_motivo);
 perform public.fin_bloquear_prestamo(p_prestamo);
 select o.solicitud into previa from public.fin_prestamo_operaciones o where id=p_operacion;
 if found then
  if previa is distinct from solicitud then raise exception 'Esta operación ya se utilizó con otros datos.'; end if; return;
 end if;
 select * into prestamo from public.fin_prestamos where id=p_prestamo;
 if not found or prestamo.revision<>p_revision then raise exception 'El préstamo cambió. Actualiza antes de guardar las cuotas.'; end if;
 for fila in select * from jsonb_to_recordset(p_filas) x(id uuid,numero integer,vencimiento date,monto numeric,detalle text,revision integer,enviar boolean) order by id loop
  if fila.id is null or fila.numero is null or fila.numero not between 1 and prestamo.numero_cuotas or fila.vencimiento is null or not isfinite(fila.vencimiento)
   or fila.monto is null or not(fila.monto>0 and fila.monto<1000000000 and fila.monto=round(fila.monto,2)) or char_length(coalesce(fila.detalle,''))>500 then
   raise exception 'Revisa número, vencimiento, importe y detalle de cada cuota.'; end if;
  select * into anterior from public.fin_prestamo_cuotas where id=fila.id;
  if found then
   if anterior.prestamo_id<>p_prestamo or anterior.revision is distinct from fila.revision then raise exception 'Una cuota cambió o pertenece a otro préstamo. Actualiza la tabla.'; end if;
   cambian:=anterior.numero<>fila.numero or anterior.vencimiento<>fila.vencimiento or anterior.monto<>fila.monto or anterior.detalle<>coalesce(fila.detalle,'');
   if cambian and (exists(select 1 from public.fin_pagos_compras where documento_id='prestamo:'||fila.id::text)
    or exists(select 1 from public.fin_programacion_compras where documento_id='prestamo:'||fila.id::text)) then
    raise exception 'La cuota ya tiene pagos o programación; no se pueden cambiar sus datos.'; end if;
   if cambian or (not anterior.enviada and coalesce(fila.enviar,false)) then
    update public.fin_prestamo_cuotas set numero=fila.numero,vencimiento=fila.vencimiento,monto=fila.monto,detalle=coalesce(fila.detalle,''),enviada=enviada or coalesce(fila.enviar,false),
     revision=revision+1,modificado_por=auth.uid(),modificado_en=clock_timestamp() where id=fila.id;
   end if;
  else
   if coalesce(fila.revision,0)<>0 then raise exception 'La cuota ya no existe. Actualiza.'; end if;
   insert into public.fin_prestamo_cuotas(id,prestamo_id,numero,vencimiento,monto,detalle,enviada,creado_por,modificado_por)
    values(fila.id,p_prestamo,fila.numero,fila.vencimiento,fila.monto,coalesce(fila.detalle,''),coalesce(fila.enviar,false),auth.uid(),auth.uid());
  end if;
  insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_PRESTAMO_CUOTA_GUARDAR',
   jsonb_build_object('prestamo_id',p_prestamo,'operacion',p_operacion,'motivo',p_motivo,'anterior',to_jsonb(anterior),'nuevo',(select to_jsonb(q) from public.fin_prestamo_cuotas q where id=fila.id)));
 end loop;
 if (select sum(monto) from public.fin_prestamo_cuotas where prestamo_id=p_prestamo)+prestamo.pagado_previo>prestamo.monto_total then
  raise exception 'La suma de cuotas más el pago previo supera el total del préstamo.'; end if;
 update public.fin_prestamos set revision=revision+1,modificado_por=auth.uid(),modificado_en=clock_timestamp() where id=p_prestamo;
 insert into public.fin_prestamo_operaciones(id,prestamo_id,solicitud,creado_por) values(p_operacion,p_prestamo,solicitud,auth.uid());
end $$;

create function public.fin_retirar_cuota_prestamo(p_id uuid,p_revision integer,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare q public.fin_prestamo_cuotas%rowtype;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para retirar cuotas.' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Indica el motivo del retiro.'; end if;
 perform public.fin_bloquear_documento_compra('prestamo:'||p_id::text);
 select * into q from public.fin_prestamo_cuotas where id=p_id;
 if not found then raise exception 'Cuota no disponible.'; end if;
 if not q.enviada then return; end if;
 if p_revision is distinct from q.revision then raise exception 'La cuota cambió. Actualiza la tabla.'; end if;
 if exists(select 1 from public.fin_pagos_compras where documento_id='prestamo:'||p_id::text) or exists(select 1 from public.fin_programacion_compras where documento_id='prestamo:'||p_id::text) then
  raise exception 'La cuota tiene pagos o programación. Revisa Pagos semanales antes de retirarla.'; end if;
 update public.fin_prestamo_cuotas set enviada=false,revision=revision+1,modificado_por=auth.uid(),modificado_en=clock_timestamp() where id=p_id;
 update public.fin_prestamos set revision=revision+1,modificado_por=auth.uid(),modificado_en=clock_timestamp() where id=q.prestamo_id;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_PRESTAMO_CUOTA_RETIRAR',jsonb_build_object('prestamo_id',q.prestamo_id,'motivo',p_motivo,'anterior',to_jsonb(q)));
end $$;

create function public.fin_consultar_prestamos() returns setof public.fin_vw_prestamos language plpgsql stable security definer set search_path='' as $$
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para consultar préstamos.' using errcode='42501'; end if;
 return query select * from public.fin_vw_prestamos;
end $$;
create function public.fin_consultar_cuotas_prestamo(p_prestamo uuid) returns setof public.fin_vw_prestamo_cuotas language plpgsql stable security definer set search_path='' as $$
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para consultar cuotas.' using errcode='42501'; end if;
 return query select * from public.fin_vw_prestamo_cuotas where prestamo_id=p_prestamo;
end $$;
create function public.fin_historial_prestamo(p_prestamo uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para consultar el historial.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc),'[]') from(select a.id,a.creado_en,a.accion,a.detalle,p.email as responsable
  from public.app_audit_log a left join public.app_profiles p on p.user_id=a.actor_user_id where a.detalle->>'prestamo_id'=p_prestamo::text order by a.id desc limit 100) x);
end $$;

create view public.fin_vw_cuentas_sin_prestamos with(security_invoker=true) as select * from public.fin_vw_cuentas_por_pagar_compras;
do $$ begin execute 'create or replace view public.fin_vw_cuentas_sin_prestamos with(security_invoker=true) as '||pg_get_viewdef('public.fin_vw_cuentas_por_pagar_compras'::regclass,true); end $$;
revoke all on public.fin_vw_cuentas_sin_prestamos from public,anon,authenticated;
grant select on public.fin_vw_cuentas_sin_prestamos to authenticated;
create or replace view public.fin_vw_cuentas_por_pagar_compras with(security_invoker=true) as
select * from public.fin_vw_cuentas_sin_prestamos
union all
select 'prestamo:'||q.id::text,'PRESTAMO'::text,'PRESTAMO'::text,p.fecha,
 p.referencia||' · Cuota '||q.numero::text,p.acreedor,
 'Cuota '||q.numero::text||' de '||p.numero_cuotas::text||' · Vence '||q.vencimiento::text||case when q.detalle<>'' then ' · '||q.detalle else '' end,
 null::numeric,null::numeric,null::numeric,q.monto,q.monto,
 concat_ws(' · ','Préstamo · Total de cuotas pactado',p.observaciones),null::text,q.pagos,q.pagado,q.saldo,q.semana_activa,
 concat_ws(' ',p.acreedor,p.referencia,'Cuota',q.numero,q.detalle)
from public.fin_vw_prestamo_cuotas q join public.fin_prestamos p on p.id=q.prestamo_id
where q.enviada and (select public.fin_puede_consultar_cuentas());

revoke all on function public.fin_guardar_prestamo(uuid,integer,text,text,date,integer,numeric,numeric,text,text),public.fin_guardar_cuotas_prestamo(uuid,uuid,integer,jsonb,text),
 public.fin_retirar_cuota_prestamo(uuid,integer,text),public.fin_consultar_prestamos(),public.fin_consultar_cuotas_prestamo(uuid),public.fin_historial_prestamo(uuid) from public,anon,authenticated;
grant execute on function public.fin_guardar_prestamo(uuid,integer,text,text,date,integer,numeric,numeric,text,text),public.fin_guardar_cuotas_prestamo(uuid,uuid,integer,jsonb,text),
 public.fin_retirar_cuota_prestamo(uuid,integer,text),public.fin_consultar_prestamos(),public.fin_consultar_cuotas_prestamo(uuid),public.fin_historial_prestamo(uuid) to authenticated;
commit;
