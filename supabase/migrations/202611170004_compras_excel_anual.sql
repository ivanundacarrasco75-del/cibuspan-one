begin;

create table public.compras_excel_cargas (
  archivo_hash text primary key check (archivo_hash ~ '^[a-f0-9]{64}$'),
  archivo text not null,
  hoja text not null,
  anio integer not null check (anio = 2026),
  resumen jsonb not null,
  creado_en timestamptz not null default now()
);
create table public.compras_excel_documentos (
  id uuid primary key,
  archivo_hash text not null references public.compras_excel_cargas,
  tipo text not null check (tipo in ('FACTURA','NOTA_VENTA','NO_DEDUCIBLE')),
  fecha date,
  numero text not null,
  proveedor text not null,
  descripcion text not null,
  total numeric,
  iva numeric,
  neto numeric check (neto >= 0),
  pagado numeric not null check (pagado >= 0),
  pagos jsonb not null check (jsonb_typeof(pagos) = 'array'),
  sri_clave text unique references public.compras_sri,
  observaciones text not null,
  filas jsonb not null check (jsonb_typeof(filas) = 'array'),
  check (neto is null or pagado <= neto)
);
create index compras_excel_documentos_tipo_fecha on public.compras_excel_documentos(tipo,fecha desc,id);
alter table public.compras_excel_cargas enable row level security;
alter table public.compras_excel_documentos enable row level security;
revoke all on public.compras_excel_cargas, public.compras_excel_documentos from public, anon, authenticated;
grant select on public.compras_excel_cargas, public.compras_excel_documentos to authenticated;
create policy compras_excel_cargas_lectura on public.compras_excel_cargas for select to authenticated
  using ((select public.app_puede('Administración')));
create policy compras_excel_documentos_lectura on public.compras_excel_documentos for select to authenticated
  using ((select public.app_puede('Administración')) and (tipo<>'FACTURA' or (select public.app_es_admin())));

-- El Excel conserva su propio origen y nunca genera claves de acceso ni XML.
create view public.compras_vw_excel with (security_invoker = true) as
select e.*, coalesce(p.pagos,'[]'::jsonb) as pagos_nuevos,
  e.pagado + coalesce(p.pagado,0) as pagado_actual,
  case when e.neto is not null then greatest(e.neto-e.pagado-coalesce(p.pagado,0),0) end as saldo
from public.compras_excel_documentos e
left join lateral (
  select sum(valor) as pagado, jsonb_agg(jsonb_build_object(
    'id',id,'valor',valor,'fecha',fecha,'documento',documento) order by fecha,registrado_en,id) as pagos
  from public.fin_pagos_compras where documento_id='excel:'||e.id::text
) p on true;
grant select on public.compras_vw_excel to authenticated;
revoke all on public.compras_vw_excel from public,anon;

create view public.compras_vw_facturas with (security_invoker = true) as
select 'sri:'||c.clave_acceso as id, c.fecha_emision as fecha_orden,
  c.datos,c.ride_leido,c.edicion,c.abonos,
  null::numeric as neto_excel, false as origen_excel, null::text as observaciones_excel,
  c.edicion->>'documento' as documento_excel,
  btrim(coalesce(c.edicion->>'proveedor',c.datos->>'proveedor')) as proveedor_filtro
from public.compras_sri c
where not exists (select 1 from public.compras_excel_documentos e where e.sri_clave=c.clave_acceso)
union all
select 'excel:'||e.id::text, e.fecha,
  coalesce(c.datos,jsonb_build_object(
    'clave','excel:'||e.id::text,'fecha',coalesce(e.fecha::text,''),'serie',e.numero,
    'proveedor',e.proveedor,'subtotal',case when e.total is not null and e.iva is not null then (e.total-e.iva)::text else '' end,
    'total',coalesce(e.total::text,''),'impuestos',case when e.iva is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('codigo','2','valor',e.iva::text)) end,
    'items',jsonb_build_array(jsonb_build_object('descripcion',e.descripcion,'cantidad','','precio','','subtotal','')),
    'pagos','[]'::jsonb,'ruc','','autorizacion','','estadoXml','Factura registrada desde Excel; XML pendiente'
  )),
  coalesce(c.ride_leido,false),coalesce(c.edicion,'{}'::jsonb),
  e.pagos||e.pagos_nuevos, e.neto, true, e.observaciones,
  (select string_agg(distinct x->>'documento',' · ') from jsonb_array_elements(e.pagos) x),
  btrim(coalesce(c.edicion->>'proveedor',c.datos->>'proveedor',e.proveedor))
from public.compras_vw_excel e
left join public.compras_sri c on c.clave_acceso=e.sri_clave
where e.tipo='FACTURA';
revoke all on public.compras_vw_facturas from public,anon,authenticated;
grant select on public.compras_vw_facturas to authenticated;

create or replace function public.compras_sri_buscar_proveedores(p_texto text)
returns table (proveedor text) language sql stable security invoker set search_path='' as $$
  select distinct c.proveedor_filtro from public.compras_vw_facturas c
  where starts_with(translate(lower(c.proveedor_filtro),'áéíóúüñ','aeiouun'),
    translate(lower(btrim(coalesce(p_texto,''))),'áéíóúüñ','aeiouun'))
  order by c.proveedor_filtro limit 40;
$$;

create view public.compras_vw_documentos_tabla with (security_invoker = true) as
select d.*, null::numeric as pagado_excel, null::numeric as saldo_excel
from public.compras_vw_documentos d
union all
select 'excel:'||e.id::text,e.tipo,date_trunc('month',e.fecha)::date,
  e.fecha,e.numero,e.proveedor,e.descripcion,
  case when e.total is not null and e.iva is not null then e.total-e.iva end,
  e.iva,null::numeric,e.total,e.observaciones,null::text,'EXCEL'::text,
  e.pagado_actual,e.saldo
from public.compras_vw_excel e where tipo in ('NOTA_VENTA','NO_DEDUCIBLE');
revoke all on public.compras_vw_documentos_tabla from public,anon,authenticated;
grant select on public.compras_vw_documentos_tabla to authenticated;

-- Se conserva el contrato de Finanzas para programación y pagos.
alter view public.fin_vw_cuentas_por_pagar_compras rename to fin_vw_compras_anteriores;
create view public.fin_vw_cuentas_por_pagar_compras with (security_invoker = true) as
select a.* from public.fin_vw_compras_anteriores a
where not exists (select 1 from public.compras_excel_documentos e where a.id='sri:'||e.sri_clave)
  and not (a.tipo='NO_DEDUCIBLE' and a.origen='CLASIFICACION_GASTOS')
union all
select 'excel:'||e.id::text,
  case when e.tipo='FACTURA' then 'SRI' else e.tipo end,
  'EXCEL'::text,e.fecha,e.numero,coalesce(c.datos->>'proveedor',e.proveedor),e.descripcion,
  coalesce((c.edicion->>'subtotal')::numeric,(c.datos->>'subtotal')::numeric,
    case when e.total is not null and e.iva is not null then e.total-e.iva end),
  e.iva,null::numeric,coalesce((c.edicion->>'total')::numeric,(c.datos->>'total')::numeric,e.total),
  e.neto,e.observaciones,c.datos->>'ruc',
  e.pagos||e.pagos_nuevos,e.pagado_actual,e.saldo,plan.semana,
  concat_ws(' ',e.proveedor,e.numero,e.descripcion)
from public.compras_vw_excel e
left join public.compras_sri c on c.clave_acceso=e.sri_clave
left join public.fin_programacion_compras plan on plan.documento_id='excel:'||e.id::text and plan.pagado<plan.monto
where (select public.app_es_admin());
revoke all on public.fin_vw_cuentas_por_pagar_compras from public,anon,authenticated;
grant select on public.fin_vw_cuentas_por_pagar_compras to authenticated;

create or replace function public.fin_bloquear_documento_compra(p_id text)
returns void language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('fin_compras:'||p_id,0));
  if starts_with(p_id,'sri:') then
    perform 1 from public.compras_sri where clave_acceso=substr(p_id,5) for update;
  elsif starts_with(p_id,'excel:') then
    perform 1 from public.compras_excel_documentos where id=substr(p_id,7)::uuid for update;
  end if;
end;
$$;

do $ajuste$
declare definicion text;
begin
  select pg_get_functiondef('public.fin_pagar_compra(text,uuid,numeric,date,text,date,boolean)'::regprocedure) into definicion;
  if position('if compra.tipo = ''SRI'' then' in definicion)=0 then
    raise exception 'La función de pagos cambió. Revisar el contrato antes de instalar.';
  end if;
  definicion:=replace(definicion,'if compra.tipo = ''SRI'' then','if starts_with(p_id, ''sri:'') then');
  definicion:=replace(definicion,'if not found or p_monto > compra.saldo then','if not found or compra.saldo is null or p_monto > compra.saldo then');
  execute definicion;
  select pg_get_functiondef('public.fin_programar_compras(date,jsonb)'::regprocedure) into definicion;
  if position('or fila.monto > compra.saldo' in definicion)=0 then raise exception 'Cambió el contrato de programación'; end if;
  execute replace(definicion,'or fila.monto > compra.saldo','or compra.saldo is null or fila.monto > compra.saldo');
end $ajuste$;

commit;
