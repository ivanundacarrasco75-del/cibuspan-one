begin;
set local lock_timeout='5s';
create table public.fin_impuestos (
 id uuid primary key,periodo date not null check(isfinite(periodo) and extract(day from periodo)=1),
 impuesto text not null check(impuesto in ('RENTA','IVA')),vencimiento date not null check(isfinite(vencimiento)),
 monto numeric(14,2) not null check(monto>0),referencia text not null default '',detalle text not null default '',
 enviada boolean not null default false,revision integer not null default 1,
 creado_por uuid not null,creado_en timestamptz not null default now(),modificado_por uuid not null,modificado_en timestamptz not null default now(),
 unique(periodo,impuesto)
);
create table public.fin_impuestos_operaciones(id uuid primary key,solicitud jsonb not null,creado_por uuid not null,creado_en timestamptz not null default now());
alter table public.fin_impuestos enable row level security;
alter table public.fin_impuestos_operaciones enable row level security;
revoke all on public.fin_impuestos,public.fin_impuestos_operaciones from public,anon,authenticated;
grant select on public.fin_impuestos to authenticated;
create policy fin_impuestos_lectura on public.fin_impuestos for select to authenticated using((select public.fin_puede_consultar_cuentas()));
create view public.fin_vw_impuestos with(security_invoker=true) as
select i.*,coalesce(p.pagado,0) as pagado,greatest(i.monto-coalesce(p.pagado,0),0) as saldo,coalesce(p.pagos,'[]'::jsonb) as pagos,plan.semana as semana_activa
from public.fin_impuestos i
left join lateral(select sum(x.valor) as pagado,jsonb_agg(jsonb_build_object('id',x.id,'valor',x.valor,'fecha',x.fecha,'documento',x.documento) order by x.fecha,x.registrado_en,x.id) as pagos
 from public.fin_pagos_compras x where x.documento_id='impuesto:'||i.id::text) p on true
left join public.fin_programacion_compras plan on plan.documento_id='impuesto:'||i.id::text and plan.pagado<plan.monto;
revoke all on public.fin_vw_impuestos from public,anon,authenticated;
grant select on public.fin_vw_impuestos to authenticated;

create function public.fin_guardar_impuestos(p_operacion uuid,p_filas jsonb,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare fila record; anterior public.fin_impuestos%rowtype; solicitud jsonb; previa jsonb; cambian boolean;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para gestionar impuestos.' using errcode='42501'; end if;
 if p_operacion is null or jsonb_typeof(p_filas) is distinct from 'array' or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Revisa los impuestos y el motivo.'; end if;
 if jsonb_array_length(p_filas) not between 1 and 2 or (select count(distinct x.id) from jsonb_to_recordset(p_filas) x(id uuid))<>jsonb_array_length(p_filas) then raise exception 'Incluye uno o dos impuestos distintos.'; end if;
 -- Serializa también reintentos de la misma operación sobre filas diferentes.
 perform pg_advisory_xact_lock(hashtextextended('fin_impuestos_op:'||p_operacion::text,0));
 solicitud:=jsonb_build_object('filas',p_filas,'motivo',p_motivo);
 select o.solicitud into previa from public.fin_impuestos_operaciones o where id=p_operacion;
 if found then if previa is distinct from solicitud then raise exception 'Esta operación ya se utilizó con otros datos.'; end if; return; end if;
 for fila in select * from jsonb_to_recordset(p_filas) x(id uuid,periodo date,impuesto text,vencimiento date,monto numeric,referencia text,detalle text,revision integer,enviar boolean) order by id loop
  if fila.id is null or fila.periodo is null or not isfinite(fila.periodo) or extract(day from fila.periodo)<>1
   or fila.impuesto is null or fila.impuesto not in ('RENTA','IVA') or fila.vencimiento is null or not isfinite(fila.vencimiento)
   or fila.monto is null or not(fila.monto>0 and fila.monto<1000000000 and fila.monto=round(fila.monto,2))
   or char_length(coalesce(fila.referencia,''))>100 or char_length(coalesce(fila.detalle,''))>500 then raise exception 'Revisa período, impuesto, vencimiento e importe manual.'; end if;
  perform public.fin_bloquear_documento_compra('impuesto:'||fila.id::text);
  select * into anterior from public.fin_impuestos where id=fila.id;
  if found then
   if anterior.periodo<>fila.periodo or anterior.impuesto<>fila.impuesto or anterior.revision is distinct from fila.revision then raise exception 'El impuesto cambió. Actualiza antes de guardar.'; end if;
   cambian:=anterior.vencimiento<>fila.vencimiento or anterior.monto<>fila.monto or anterior.referencia<>coalesce(fila.referencia,'') or anterior.detalle<>coalesce(fila.detalle,'');
   if cambian and (exists(select 1 from public.fin_pagos_compras where documento_id='impuesto:'||fila.id::text) or exists(select 1 from public.fin_programacion_compras where documento_id='impuesto:'||fila.id::text)) then raise exception 'El impuesto tiene pagos o programación y no se puede modificar.'; end if;
   if cambian or (not anterior.enviada and coalesce(fila.enviar,false)) then
    update public.fin_impuestos set vencimiento=fila.vencimiento,monto=fila.monto,referencia=coalesce(fila.referencia,''),detalle=coalesce(fila.detalle,''),
     enviada=enviada or coalesce(fila.enviar,false),revision=revision+1,modificado_por=auth.uid(),modificado_en=clock_timestamp() where id=fila.id;
   end if;
  else
   if coalesce(fila.revision,0)<>0 then raise exception 'El impuesto ya no está disponible. Actualiza.'; end if;
   if exists(select 1 from public.fin_impuestos where periodo=fila.periodo and impuesto=fila.impuesto) then raise exception 'Ya está registrado ese impuesto para el mes. Actualiza la tabla.'; end if;
   insert into public.fin_impuestos(id,periodo,impuesto,vencimiento,monto,referencia,detalle,enviada,creado_por,modificado_por)
    values(fila.id,fila.periodo,fila.impuesto,fila.vencimiento,fila.monto,coalesce(fila.referencia,''),coalesce(fila.detalle,''),coalesce(fila.enviar,false),auth.uid(),auth.uid());
  end if;
  insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_IMPUESTO_GUARDAR',jsonb_build_object('impuesto_id',fila.id,'operacion',p_operacion,'motivo',p_motivo,'anterior',to_jsonb(anterior),'nuevo',(select to_jsonb(i) from public.fin_impuestos i where id=fila.id)));
 end loop;
 insert into public.fin_impuestos_operaciones(id,solicitud,creado_por) values(p_operacion,solicitud,auth.uid());
end $$;
create function public.fin_consultar_impuestos(p_periodo date) returns setof public.fin_vw_impuestos language plpgsql stable security definer set search_path='' as $$
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para consultar impuestos.' using errcode='42501'; end if;
 return query select * from public.fin_vw_impuestos where periodo=p_periodo;
end $$;
revoke all on function public.fin_guardar_impuestos(uuid,jsonb,text),public.fin_consultar_impuestos(date) from public,anon,authenticated;
grant execute on function public.fin_guardar_impuestos(uuid,jsonb,text),public.fin_consultar_impuestos(date) to authenticated;

create view public.fin_vw_cuentas_sin_impuestos with(security_invoker=true) as select * from public.fin_vw_cuentas_por_pagar_compras;
do $$ begin execute 'create or replace view public.fin_vw_cuentas_sin_impuestos with(security_invoker=true) as '||pg_get_viewdef('public.fin_vw_cuentas_por_pagar_compras'::regclass,true); end $$;
revoke all on public.fin_vw_cuentas_sin_impuestos from public,anon,authenticated;
grant select on public.fin_vw_cuentas_sin_impuestos to authenticated;
create or replace view public.fin_vw_cuentas_por_pagar_compras with(security_invoker=true) as
select * from public.fin_vw_cuentas_sin_impuestos
union all
select 'impuesto:'||i.id::text,'IMPUESTO'::text,'IMPUESTO'::text,(i.creado_en at time zone 'America/Guayaquil')::date,
 i.impuesto||' · '||to_char(i.periodo,'YYYY-MM')||case when i.referencia<>'' then ' · '||i.referencia else '' end,'SRI'::text,
 case when i.impuesto='RENTA' then 'Impuesto a la renta' else 'IVA' end||' · Período '||to_char(i.periodo,'YYYY-MM')||' · Vence '||i.vencimiento::text,
 null::numeric,null::numeric,null::numeric,i.monto,i.monto,i.detalle,null::text,i.pagos,i.pagado,i.saldo,i.semana_activa,
 concat_ws(' ','SRI',i.impuesto,i.periodo,i.referencia,i.detalle)
from public.fin_vw_impuestos i where i.enviada and (select public.fin_puede_consultar_cuentas());
commit;
