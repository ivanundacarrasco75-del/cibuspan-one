begin;
set local lock_timeout='5s';
create function public.fin_cxc_puede(p_cobros boolean default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_profiles p where p.user_id=auth.uid() and p.activo and exists(
  select 1 from unnest(case when p_cobros is null then array['Pagos y Finanzas · Cuentas por Cobrar','Pagos y Finanzas · Cobros y Conciliación']
   when p_cobros then array['Pagos y Finanzas · Cobros y Conciliación'] else array['Pagos y Finanzas · Cuentas por Cobrar'] end) ruta
  where coalesce((select u.permitido from public.app_user_permissions u where u.user_id=p.user_id and u.pantalla=ruta),p.rol='ADMINISTRADOR' or public.app_puede(ruta))));
$$;
create table public.fin_cxc_facturas(comprobante text primary key,total numeric(14,2) not null check(total>0),vencimiento date not null check(isfinite(vencimiento)),
 huella text not null,revision integer not null default 1,modificado_por uuid not null,modificado_en timestamptz not null default now());
create table public.fin_cxc_depositos(id uuid primary key,banco text not null,referencia text not null,fecha date not null check(isfinite(fecha)),
 monto numeric(14,2) not null check(monto>0),ordenante text not null default '',observaciones text not null default '',anulado boolean not null default false,
 creado_por uuid not null,creado_en timestamptz not null default now());
create unique index fin_cxc_deposito_unico on public.fin_cxc_depositos(upper(btrim(banco)),upper(btrim(referencia)),fecha) where not anulado;
create table public.fin_cxc_operaciones(id uuid primary key,solicitud jsonb not null,creado_por uuid not null,creado_en timestamptz not null default now());
create table public.fin_cxc_aplicaciones(id uuid primary key,operacion uuid not null references public.fin_cxc_operaciones,comprobante text not null references public.fin_cxc_facturas,
 deposito uuid references public.fin_cxc_depositos,efectivo numeric(14,2) not null check(efectivo>=0),retencion numeric(14,2) not null check(retencion>=0),
 referencia_retencion text not null default '',fecha_retencion date,anulada boolean not null default false,creado_por uuid not null,creado_en timestamptz not null default now(),
 check(efectivo+retencion>0),check(efectivo=0 or deposito is not null),check(retencion=0 or (btrim(referencia_retencion)<>'' and fecha_retencion is not null and isfinite(fecha_retencion))));
create unique index fin_cxc_retencion_unica on public.fin_cxc_aplicaciones(comprobante,upper(btrim(referencia_retencion))) where not anulada and retencion>0;
create index fin_cxc_aplicaciones_factura on public.fin_cxc_aplicaciones(comprobante) where not anulada;
create index fin_cxc_aplicaciones_deposito on public.fin_cxc_aplicaciones(deposito) where not anulada;
alter table public.fin_cxc_facturas enable row level security;
alter table public.fin_cxc_depositos enable row level security;
alter table public.fin_cxc_operaciones enable row level security;
alter table public.fin_cxc_aplicaciones enable row level security;
revoke all on public.fin_cxc_facturas,public.fin_cxc_depositos,public.fin_cxc_operaciones,public.fin_cxc_aplicaciones from public,anon,authenticated;

-- La factura conserva el comprobante de la fuente. No duplica ni modifica ventas.
create view public.fin_cxc_fuente as
select comprobante,min(fecha_emision) as fecha_emision,string_agg(distinct cliente_nombre,' / ' order by cliente_nombre) as cliente,
 round(sum(total_sin_impuestos),2) as subtotal_importado,
 count(distinct fecha_emision)=1 and count(distinct upper(btrim(cliente_nombre)))=1 and bool_and(total_sin_impuestos>=0) as fuente_valida,
 md5(jsonb_agg(jsonb_build_array(id,fecha_emision,cliente_nombre,total_sin_impuestos) order by id)::text) as huella
from public.com_ventas_detalle where btrim(comprobante)<>'' group by comprobante;
create view public.fin_cxc_saldos as
select s.*,f.total,f.vencimiento,coalesce(f.revision,0) as revision,
 coalesce(s.fuente_valida and f.huella=s.huella,false) as verificada,
 coalesce(a.efectivo,0) as cobrado,coalesce(a.retencion,0) as retenido,
 case when f.total is not null then f.total-coalesce(a.efectivo,0)-coalesce(a.retencion,0) end as saldo
from public.fin_cxc_fuente s left join public.fin_cxc_facturas f using(comprobante)
left join lateral(select sum(efectivo) as efectivo,sum(retencion) as retencion from public.fin_cxc_aplicaciones where comprobante=s.comprobante and not anulada) a on true;
create view public.fin_cxc_depositos_saldos as
select d.*,coalesce(a.aplicado,0) as aplicado,d.monto-coalesce(a.aplicado,0) as disponible
from public.fin_cxc_depositos d left join lateral(select sum(efectivo) as aplicado from public.fin_cxc_aplicaciones where deposito=d.id and not anulada) a on true;
revoke all on public.fin_cxc_fuente,public.fin_cxc_saldos,public.fin_cxc_depositos_saldos from public,anon,authenticated;

create function public.fin_cxc_consultar(p_desde date,p_hasta date,p_buscar text default '') returns setof public.fin_cxc_saldos
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.fin_cxc_puede() then raise exception 'No tienes permiso para consultar Cuentas por cobrar.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or not isfinite(p_desde) or not isfinite(p_hasta) or p_desde>p_hasta then raise exception 'Revisa el rango de fechas.'; end if;
 return query select * from public.fin_cxc_saldos s where s.fecha_emision between p_desde and p_hasta and (coalesce(p_buscar,'')='' or strpos(upper(s.cliente||' '||s.comprobante),upper(p_buscar))>0);
end $$;
create function public.fin_cxc_consultar_depositos() returns setof public.fin_cxc_depositos_saldos
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.fin_cxc_puede() then raise exception 'No tienes permiso para consultar depósitos.' using errcode='42501'; end if;
 return query select * from public.fin_cxc_depositos_saldos;
end $$;
create function public.fin_cxc_confirmar_factura(p_comprobante text,p_revision integer,p_huella text,p_total numeric,p_vencimiento date,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.fin_cxc_saldos%rowtype; anterior public.fin_cxc_facturas%rowtype;
begin
 if not public.fin_cxc_puede(false) then raise exception 'No tienes permiso para completar facturas.' using errcode='42501'; end if;
 if p_total is null or not(p_total>0 and p_total<1000000000 and p_total=round(p_total,2)) or p_vencimiento is null or not isfinite(p_vencimiento) or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Revisa el total real, vencimiento y motivo.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cxc_factura:'||p_comprobante,0));
 -- Impide que la importación de ventas cambie mientras se valida y confirma.
 perform 1 from public.com_ventas_detalle where comprobante=p_comprobante order by id for share;
 select * into s from public.fin_cxc_saldos where comprobante=p_comprobante;
 if not found or not s.fuente_valida or s.huella is distinct from p_huella then raise exception 'Revisa la fuente de ventas: cambió o tiene clientes/fechas distintos.'; end if;
 if s.verificada and s.total=p_total and s.vencimiento=p_vencimiento then return; end if;
 if s.revision is distinct from p_revision then raise exception 'La factura cambió. Actualiza antes de guardar.'; end if;
 if p_total<s.cobrado+s.retenido then raise exception 'El total no puede ser menor que los cobros y retenciones registrados.'; end if;
 select * into anterior from public.fin_cxc_facturas where comprobante=p_comprobante;
 insert into public.fin_cxc_facturas(comprobante,total,vencimiento,huella,modificado_por) values(p_comprobante,p_total,p_vencimiento,p_huella,auth.uid())
 on conflict(comprobante) do update set total=excluded.total,vencimiento=excluded.vencimiento,huella=excluded.huella,revision=fin_cxc_facturas.revision+1,modificado_por=auth.uid(),modificado_en=clock_timestamp();
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_FACTURA_CONFIRMAR',jsonb_build_object('comprobante',p_comprobante,'motivo',p_motivo,'anterior',to_jsonb(anterior),'total',p_total,'vencimiento',p_vencimiento,'huella',p_huella));
end $$;
create function public.fin_cxc_crear_deposito(p_id uuid,p_banco text,p_referencia text,p_fecha date,p_monto numeric,p_ordenante text,p_observaciones text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.fin_cxc_depositos%rowtype;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para registrar depósitos.' using errcode='42501'; end if;
 if p_id is null or char_length(btrim(coalesce(p_banco,''))) not between 2 and 120 or char_length(btrim(coalesce(p_referencia,''))) not between 1 and 100
  or char_length(coalesce(p_ordenante,''))>200 or char_length(coalesce(p_observaciones,''))>500 or p_fecha is null or not isfinite(p_fecha)
  or p_monto is null or not(p_monto>0 and p_monto<1000000000 and p_monto=round(p_monto,2)) then raise exception 'Revisa banco, referencia, fecha e importe del depósito.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cxc_deposito:'||p_id::text,0));
 select * into d from public.fin_cxc_depositos where id=p_id;
 if found then
  if not d.anulado and d.banco=btrim(p_banco) and d.referencia=btrim(p_referencia) and d.fecha=p_fecha and d.monto=p_monto and d.ordenante=coalesce(p_ordenante,'') and d.observaciones=coalesce(p_observaciones,'') then return; end if;
  raise exception 'El depósito ya existe con otros datos. Actualiza la tabla.';
 end if;
 insert into public.fin_cxc_depositos(id,banco,referencia,fecha,monto,ordenante,observaciones,creado_por) values(p_id,btrim(p_banco),btrim(p_referencia),p_fecha,p_monto,coalesce(p_ordenante,''),coalesce(p_observaciones,''),auth.uid());
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_DEPOSITO_CREAR',jsonb_build_object('deposito',p_id,'banco',p_banco,'referencia',p_referencia,'fecha',p_fecha,'monto',p_monto));
end $$;
create function public.fin_cxc_conciliar(p_id uuid,p_deposito uuid,p_filas jsonb,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare solicitud jsonb; previa jsonb; fila record; s public.fin_cxc_saldos%rowtype; disponible numeric; total_efectivo numeric;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para conciliar cobros.' using errcode='42501'; end if;
 if p_id is null or jsonb_typeof(p_filas) is distinct from 'array' or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Revisa la conciliación y su motivo.'; end if;
 if jsonb_array_length(p_filas) not between 1 and 100 or (select count(distinct x.comprobante) from jsonb_to_recordset(p_filas) x(comprobante text))<>jsonb_array_length(p_filas) then raise exception 'Selecciona hasta 100 facturas distintas.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cxc_operacion:'||p_id::text,0));
 solicitud:=jsonb_build_object('deposito',p_deposito,'filas',p_filas,'motivo',p_motivo);
 select o.solicitud into previa from public.fin_cxc_operaciones o where id=p_id;
 if found then if previa is distinct from solicitud then raise exception 'Esta operación ya se utilizó con otros datos.'; end if; return; end if;
 if p_deposito is not null then
  perform pg_advisory_xact_lock(hashtextextended('cxc_deposito:'||p_deposito::text,0));
  select d.disponible into disponible from public.fin_cxc_depositos_saldos d where d.id=p_deposito and not d.anulado;
  if not found then raise exception 'Depósito no disponible.'; end if;
 end if;
 select coalesce(sum(x.efectivo),0) into total_efectivo from jsonb_to_recordset(p_filas) x(efectivo numeric);
 if total_efectivo>0 and (p_deposito is null or total_efectivo>disponible) then raise exception 'El importe aplicado supera el disponible del depósito.'; end if;
 insert into public.fin_cxc_operaciones(id,solicitud,creado_por) values(p_id,solicitud,auth.uid());
 for fila in select * from jsonb_to_recordset(p_filas) x(comprobante text,revision integer,huella text,saldo numeric,efectivo numeric,retencion numeric,referencia_retencion text,fecha_retencion date) order by comprobante loop
  if fila.efectivo is null or fila.retencion is null or not(fila.efectivo>=0 and fila.efectivo<1000000000 and fila.efectivo=round(fila.efectivo,2) and fila.retencion>=0 and fila.retencion<1000000000 and fila.retencion=round(fila.retencion,2) and fila.efectivo+fila.retencion>0)
   or char_length(coalesce(fila.referencia_retencion,''))>100 then raise exception 'Revisa los importes aplicados y la referencia de retención.'; end if;
  if fila.retencion>0 and (btrim(coalesce(fila.referencia_retencion,''))='' or fila.fecha_retencion is null or not isfinite(fila.fecha_retencion)) then raise exception 'La retención requiere número de comprobante y fecha.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cxc_factura:'||fila.comprobante,0));
  perform 1 from public.com_ventas_detalle where comprobante=fila.comprobante order by id for share;
  select * into s from public.fin_cxc_saldos where comprobante=fila.comprobante;
  if not found or not s.verificada or s.huella is distinct from fila.huella or s.revision is distinct from fila.revision or s.saldo is distinct from fila.saldo then raise exception 'La factura cambió o falta confirmar su total. Actualiza los saldos.'; end if;
  if fila.efectivo+fila.retencion>s.saldo then raise exception 'El cobro más la retención supera el saldo de la factura.'; end if;
  insert into public.fin_cxc_aplicaciones(id,operacion,comprobante,deposito,efectivo,retencion,referencia_retencion,fecha_retencion,creado_por)
   values(gen_random_uuid(),p_id,fila.comprobante,p_deposito,fila.efectivo,fila.retencion,case when fila.retencion>0 then btrim(fila.referencia_retencion) else '' end,case when fila.retencion>0 then fila.fecha_retencion end,auth.uid());
 end loop;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_CONCILIAR',solicitud||jsonb_build_object('operacion',p_id));
end $$;
create function public.fin_cxc_historial(p_comprobante text) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not public.fin_cxc_puede() then raise exception 'No tienes permiso para consultar cobros.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_en desc,x.id),'[]') from(
  select a.*,d.banco,d.referencia as referencia_deposito,d.fecha as fecha_deposito,p.email as responsable
  from public.fin_cxc_aplicaciones a left join public.fin_cxc_depositos d on d.id=a.deposito left join public.app_profiles p on p.user_id=a.creado_por where a.comprobante=p_comprobante) x);
end $$;
create function public.fin_cxc_anular(p_aplicacion uuid,p_deposito uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare a public.fin_cxc_aplicaciones%rowtype;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para anular cobros.' using errcode='42501'; end if;
 if (p_aplicacion is null)=(p_deposito is null) or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Selecciona un movimiento e indica el motivo de anulación.'; end if;
 if p_aplicacion is not null then
  select * into a from public.fin_cxc_aplicaciones where id=p_aplicacion;
  if not found then raise exception 'Movimiento no disponible.'; end if;
  if a.deposito is not null then perform pg_advisory_xact_lock(hashtextextended('cxc_deposito:'||a.deposito::text,0)); end if;
  perform pg_advisory_xact_lock(hashtextextended('cxc_factura:'||a.comprobante,0));
  if exists(select 1 from public.fin_cxc_aplicaciones where id=p_aplicacion and anulada) then return; end if;
  update public.fin_cxc_aplicaciones set anulada=true where id=p_aplicacion;
 else
  perform pg_advisory_xact_lock(hashtextextended('cxc_deposito:'||p_deposito::text,0));
  if not exists(select 1 from public.fin_cxc_depositos where id=p_deposito) then raise exception 'Depósito no disponible.'; end if;
  if exists(select 1 from public.fin_cxc_aplicaciones where deposito=p_deposito and not anulada) then raise exception 'Primero anula las aplicaciones del depósito.'; end if;
  if exists(select 1 from public.fin_cxc_depositos where id=p_deposito and anulado) then return; end if;
  update public.fin_cxc_depositos set anulado=true where id=p_deposito;
 end if;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_ANULAR',jsonb_build_object('aplicacion',p_aplicacion,'deposito',p_deposito,'motivo',p_motivo));
end $$;
revoke all on function public.fin_cxc_puede(boolean),public.fin_cxc_consultar(date,date,text),public.fin_cxc_consultar_depositos(),public.fin_cxc_confirmar_factura(text,integer,text,numeric,date,text),
 public.fin_cxc_crear_deposito(uuid,text,text,date,numeric,text,text),public.fin_cxc_conciliar(uuid,uuid,jsonb,text),public.fin_cxc_historial(text),public.fin_cxc_anular(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fin_cxc_puede(boolean),public.fin_cxc_consultar(date,date,text),public.fin_cxc_consultar_depositos(),public.fin_cxc_confirmar_factura(text,integer,text,numeric,date,text),
 public.fin_cxc_crear_deposito(uuid,text,text,date,numeric,text,text),public.fin_cxc_conciliar(uuid,uuid,jsonb,text),public.fin_cxc_historial(text),public.fin_cxc_anular(uuid,uuid,text) to authenticated;
commit;
