begin;
set local lock_timeout='5s';
set local search_path='';

-- El 100% observado también puede corresponder a arriendo; no clasificarlo como honorarios.
insert into public.fin_reglas_retencion(id,impuesto,concepto,porcentaje,desde,hasta,fuente)
values('IVA_ARRIENDO_PN','IVA','Arrendamiento de inmuebles de persona natural',100,'2020-10-01',null,
  'NAC-DGERCGC20-00000061 y reformas; cuadro SRI de agentes') on conflict(id) do nothing;

-- Observaciones contables, independientes de retenciones emitidas y salidas de caja.
create table public.fin_fuentes_historial_iva (
  hash text primary key check(hash ~ '^[a-f0-9]{64}$'),
  archivo text not null check(char_length(archivo) between 1 and 200),
  desde date not null, hasta date not null,
  datos_hash text not null, filas integer not null check(filas between 1 and 5000),
  cargado_por uuid not null, cargado_en timestamptz not null default now(),
  check(isfinite(desde) and isfinite(hasta) and hasta>=desde)
);
create table public.fin_historial_iva (
  fuente text not null references public.fin_fuentes_historial_iva(hash),
  fila integer not null check(fila>0), pagina integer not null check(pagina>0),
  ruc text not null check(ruc ~ '^[0-9]{13}$'), proveedor text not null,
  fecha date not null, factura text not null,
  iva numeric(14,2) not null check(iva>=0), retenido numeric(14,2) not null check(retenido>=0 and retenido<=iva),
  primary key(fuente,fila)
);
create index fin_historial_iva_ruc_idx on public.fin_historial_iva(ruc,fuente);
alter table public.fin_fuentes_historial_iva enable row level security;
alter table public.fin_historial_iva enable row level security;
revoke all on public.fin_fuentes_historial_iva,public.fin_historial_iva from public,anon,authenticated;

create view public.fin_vw_perfiles_iva with(security_invoker=true) as
with observaciones as (
  select h.*,p.hasta,p.archivo,p.cargado_en,
    case when h.iva>0 and t.cantidad=1 then t.porcentaje end as porcentaje
  from public.fin_historial_iva h join public.fin_fuentes_historial_iva p on p.hash=h.fuente
  cross join lateral (
    select count(*) cantidad,min(pct) porcentaje from unnest(array[0,30,70,100]) pct
    where abs(h.retenido-round(h.iva*pct/100,2))<=0.01
  ) t
), agrupado as (
  select ruc,fuente,archivo,hasta,cargado_en,
    (array_agg(proveedor order by fecha desc,fila desc))[1] as proveedor,
    count(*)::integer as facturas,count(*) filter(where iva>0)::integer as con_iva,
    count(*) filter(where iva>0 and porcentaje=0)::integer as sin_retencion,
    count(*) filter(where iva>0 and porcentaje=30)::integer as al_30,
    count(*) filter(where iva>0 and porcentaje=70)::integer as al_70,
    count(*) filter(where iva>0 and porcentaje=100)::integer as al_100,
    count(*) filter(where iva>0 and porcentaje is null)::integer as revisar,
    count(distinct porcentaje) filter(where iva>0)::integer as patrones,
    min(porcentaje) filter(where iva>0) as porcentaje,
    max(fecha) as ultima_factura,
    (jsonb_agg(jsonb_build_object('factura',factura,'fecha',fecha,'pagina',pagina,'porcentaje',porcentaje)
      order by (iva>0) desc,fecha desc,fila desc) -> 0) as ejemplo
  from observaciones group by ruc,fuente,archivo,hasta,cargado_en
), recientes as (
  select *,row_number() over(partition by ruc order by hasta desc,cargado_en desc,fuente) as orden from agrupado
)
select ruc,proveedor,fuente,archivo,hasta,facturas,con_iva,sin_retencion,al_30,al_70,al_100,revisar,ultima_factura,ejemplo,
  case when con_iva=0 then 'SIN_IVA' when patrones<>1 or revisar>0 then 'VARIABLE'
    when con_iva<3 then 'INSUFICIENTE' when porcentaje=0 then 'REVISAR_CERO' else 'SUGERIDA' end as estado,
  case when con_iva>=3 and patrones=1 and revisar=0 and porcentaje>0 then porcentaje end as porcentaje_sugerido
from recientes where orden=1;
revoke all on public.fin_vw_perfiles_iva from public,anon,authenticated;

create function public.fin_consultar_perfiles_iva()
returns setof public.fin_vw_perfiles_iva language plpgsql stable security definer set search_path='' as $$
begin
  if not (public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') or public.compras_sri_puede()) then
    raise exception 'No tienes permiso para consultar sugerencias de retención.' using errcode='42501'; end if;
  return query select * from public.fin_vw_perfiles_iva;
end;
$$;

create function public.fin_importar_historial_iva(p_hash text,p_archivo text,p_desde date,p_hasta date,p_filas jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare anterior public.fin_fuentes_historial_iva%rowtype; cantidad integer;
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
    raise exception 'No tienes permiso para cargar el historial de retenciones.' using errcode='42501'; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or char_length(btrim(coalesce(p_archivo,''))) not between 1 and 200
    or p_desde is null or p_hasta is null or not isfinite(p_desde) or not isfinite(p_hasta) or p_hasta<p_desde
    or jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Revisa la fuente y el período del historial.'; end if;
  cantidad:=jsonb_array_length(p_filas);
  if cantidad not between 1 and 5000 then raise exception 'El historial debe contener entre 1 y 5000 facturas.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('fin_historial_iva:'||p_hash,0));
  select * into anterior from public.fin_fuentes_historial_iva where hash=p_hash;
  if found then
    if anterior.datos_hash<>md5(p_filas::text) or anterior.desde<>p_desde or anterior.hasta<>p_hasta
      or anterior.archivo<>btrim(p_archivo) then raise exception 'Esta fuente ya se cargó con otros datos.'; end if;
    return anterior.filas;
  end if;
  if (select count(distinct fila) from jsonb_to_recordset(p_filas) as x(fila integer))<>cantidad
    or exists(select 1 from jsonb_to_recordset(p_filas) as x(fila integer,pagina integer,ruc text,proveedor text,fecha date,factura text,iva numeric,retenido numeric)
      where fila is null or fila<=0 or pagina is null or pagina<=0 or ruc is null or ruc !~ '^[0-9]{13}$'
        or char_length(btrim(coalesce(proveedor,''))) not between 1 and 250 or char_length(btrim(coalesce(factura,''))) not between 1 and 80
        or fecha is null or not isfinite(fecha) or fecha not between p_desde and p_hasta
        or iva is null or retenido is null or iva<0 or retenido<0 or retenido>iva or iva>=1000000000
        or iva<>round(iva,2) or retenido<>round(retenido,2)) then
    raise exception 'Revisa las filas, RUC, fechas e importes del historial.'; end if;
  insert into public.fin_fuentes_historial_iva(hash,archivo,desde,hasta,datos_hash,filas,cargado_por)
    values(p_hash,btrim(p_archivo),p_desde,p_hasta,md5(p_filas::text),cantidad,auth.uid());
  insert into public.fin_historial_iva(fuente,fila,pagina,ruc,proveedor,fecha,factura,iva,retenido)
    select p_hash,fila,pagina,ruc,btrim(proveedor),fecha,btrim(factura),iva,retenido
    from jsonb_to_recordset(p_filas) as x(fila integer,pagina integer,ruc text,proveedor text,fecha date,factura text,iva numeric,retenido numeric);
  insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CARGAR_HISTORIAL_IVA',
    jsonb_build_object('fuente',p_hash,'archivo',p_archivo,'desde',p_desde,'hasta',p_hasta,'facturas',cantidad));
  return cantidad;
end;
$$;
revoke all on function public.fin_consultar_perfiles_iva(),public.fin_importar_historial_iva(text,text,date,date,jsonb) from public,anon,authenticated;
grant execute on function public.fin_consultar_perfiles_iva(),public.fin_importar_historial_iva(text,text,date,date,jsonb) to authenticated;
commit;
