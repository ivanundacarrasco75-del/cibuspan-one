begin;
set local lock_timeout='5s';
set local search_path='';

create table if not exists public.fin_anticipos (
  id uuid primary key,
  fecha date not null check(isfinite(fecha)),
  proveedor text not null check(char_length(btrim(proveedor)) between 2 and 200),
  ruc text not null default '' check(ruc='' or ruc ~ '^[0-9]{13}$'),
  concepto text not null check(char_length(btrim(concepto)) between 1 and 500),
  monto numeric(14,2) not null check(monto>0 and monto<1000000000),
  creado_por uuid not null,
  creado_en timestamptz not null default now()
);
create table if not exists public.fin_anticipos_aplicaciones (
  id uuid primary key,
  anticipo_id uuid not null references public.fin_anticipos(id),
  factura_id text not null,
  numero_factura text not null,
  proveedor_factura text not null,
  monto numeric(14,2) not null check(monto>0),
  documento_anticipo text not null,
  fecha_pago date not null,
  referencias_pago text not null,
  aplicado_por uuid not null,
  creado_en timestamptz not null default now()
);
create index if not exists fin_anticipos_aplicaciones_anticipo_idx on public.fin_anticipos_aplicaciones(anticipo_id);
create index if not exists fin_anticipos_aplicaciones_factura_idx on public.fin_anticipos_aplicaciones(factura_id);
alter table public.fin_anticipos enable row level security;
alter table public.fin_anticipos_aplicaciones enable row level security;
revoke all on public.fin_anticipos,public.fin_anticipos_aplicaciones from public,anon,authenticated;
grant select on public.fin_anticipos,public.fin_anticipos_aplicaciones to authenticated;
drop policy if exists fin_anticipos_lectura on public.fin_anticipos;
create policy fin_anticipos_lectura on public.fin_anticipos for select to authenticated
  using((select public.fin_puede_consultar_cuentas()));
drop policy if exists fin_anticipos_aplicaciones_lectura on public.fin_anticipos_aplicaciones;
create policy fin_anticipos_aplicaciones_lectura on public.fin_anticipos_aplicaciones for select to authenticated
  using((select public.fin_puede_consultar_cuentas()) or (select public.compras_sri_puede()));

create or replace view public.fin_vw_anticipos_creditos with(security_invoker=true) as
select a.factura_id,sum(a.monto) as monto,
  jsonb_agg(jsonb_build_object('id',a.id,'valor',a.monto,'fecha',a.fecha_pago,
    'documento','Cruce de '||a.documento_anticipo||' · '||a.referencias_pago,
    'clase','APLICACION_ANTICIPO','anticipo_id',a.anticipo_id)
    order by a.creado_en,a.id) as pagos
from public.fin_anticipos_aplicaciones a group by a.factura_id;
revoke all on public.fin_vw_anticipos_creditos from public,anon,authenticated;
grant select on public.fin_vw_anticipos_creditos to authenticated;

create or replace view public.fin_vw_anticipos with(security_invoker=true) as
select a.*, 'ANT-'||to_char(a.fecha,'YYYYMMDD')||'-'||upper(substr(a.id::text,1,8)) as numero,
  coalesce(p.pagado,0) as pagado,coalesce(c.aplicado,0) as aplicado,
  greatest(coalesce(p.pagado,0)-coalesce(c.aplicado,0),0) as disponible,
  greatest(a.monto-coalesce(p.pagado,0),0) as saldo,coalesce(p.pagos,'[]'::jsonb) as pagos,
  plan.semana as semana_activa,coalesce(c.aplicaciones,'[]'::jsonb) as aplicaciones
from public.fin_anticipos a
cross join lateral (
  select sum(valor) as pagado,jsonb_agg(jsonb_build_object('id',id,'valor',valor,'fecha',fecha,'documento',documento)
    order by fecha,registrado_en,id) as pagos
  from public.fin_pagos_compras where documento_id='anticipo:'||a.id::text
) p
cross join lateral(
  select sum(monto) as aplicado,jsonb_agg(jsonb_build_object('id',id,'factura_id',factura_id,'numero',numero_factura,
    'proveedor',proveedor_factura,'monto',monto,'fecha',creado_en) order by creado_en,id) as aplicaciones
  from public.fin_anticipos_aplicaciones where anticipo_id=a.id
) c
left join public.fin_programacion_compras plan on plan.documento_id='anticipo:'||a.id::text and plan.pagado<plan.monto;
revoke all on public.fin_vw_anticipos from public,anon,authenticated;
grant select on public.fin_vw_anticipos to authenticated;

-- Se conserva el OID y las columnas de la vista consumida por los RPC existentes.
do $fuente$
begin
  if to_regclass('public.fin_vw_cuentas_sin_anticipos') is null then
    execute 'create view public.fin_vw_cuentas_sin_anticipos with(security_invoker=true) as '||
      pg_get_viewdef('public.fin_vw_cuentas_por_pagar_compras'::regclass,true);
  end if;
end $fuente$;
revoke all on public.fin_vw_cuentas_sin_anticipos from public,anon,authenticated;
grant select on public.fin_vw_cuentas_sin_anticipos to authenticated;
create or replace view public.fin_vw_cuentas_por_pagar_compras with(security_invoker=true) as
select o.id,o.tipo,o.origen,o.fecha_documento,o.numero_documento,o.proveedor,o.concepto,o.subtotal,o.iva,o.retencion,
  o.total,o.neto,o.observaciones,o.ruc,o.pagos||coalesce(c.pagos,'[]'::jsonb) as pagos,
  o.pagado+coalesce(c.monto,0) as pagado,
  case when o.saldo is null then null else greatest(o.saldo-coalesce(c.monto,0),0) end as saldo,
  o.semana_activa,o.busqueda
from public.fin_vw_cuentas_sin_anticipos o
left join public.fin_vw_anticipos_creditos c on c.factura_id=o.id
union all
select 'anticipo:'||a.id::text,'ANTICIPO'::text,'ANTICIPO'::text,a.fecha,a.numero,a.proveedor,a.concepto,
  null::numeric,null::numeric,null::numeric,a.monto,a.monto,
  'Anticipo previo a la factura'::text,nullif(a.ruc,''),a.pagos,a.pagado,a.saldo,a.semana_activa,
  concat_ws(' ',a.numero,a.proveedor,a.ruc,a.concepto)
from public.fin_vw_anticipos a where (select public.fin_puede_consultar_cuentas());

-- La tabla de Facturas SRI también muestra el crédito aplicado.
do $facturas$
begin
  if to_regclass('public.compras_vw_facturas_sin_anticipos') is null then
    execute 'create view public.compras_vw_facturas_sin_anticipos with(security_invoker=true) as '||
      pg_get_viewdef('public.compras_vw_facturas'::regclass,true);
  end if;
end $facturas$;
revoke all on public.compras_vw_facturas_sin_anticipos from public,anon,authenticated;
grant select on public.compras_vw_facturas_sin_anticipos to authenticated;
create or replace view public.compras_vw_facturas with(security_invoker=true) as
select f.id,f.fecha_orden,f.datos,f.ride_leido,f.edicion,
  f.abonos||coalesce(c.pagos,'[]'::jsonb) as abonos,
  f.neto_excel,f.origen_excel,f.observaciones_excel,f.documento_excel,f.proveedor_filtro
from public.compras_vw_facturas_sin_anticipos f
left join public.fin_vw_anticipos_creditos c on c.factura_id=f.id;

create or replace function public.fin_consultar_anticipos()
returns setof public.fin_vw_anticipos language plpgsql stable security definer set search_path='' as $$
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
    raise exception 'No tienes permiso para gestionar anticipos.' using errcode='42501';
  end if;
  return query select * from public.fin_vw_anticipos;
end;
$$;
create or replace function public.fin_guardar_anticipo(
  p_id uuid,p_fecha date,p_proveedor text,p_ruc text,p_concepto text,p_monto numeric
) returns void language plpgsql security definer set search_path='' as $$
declare anterior public.fin_anticipos%rowtype;
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
    raise exception 'No tienes permiso para gestionar anticipos.' using errcode='42501';
  end if;
  p_proveedor:=btrim(p_proveedor); p_ruc:=btrim(coalesce(p_ruc,'')); p_concepto:=btrim(p_concepto);
  if p_id is null or p_fecha is null or not isfinite(p_fecha)
    or p_proveedor is null or char_length(p_proveedor) not between 2 and 200
    or p_concepto is null or char_length(p_concepto) not between 1 and 500
    or (p_ruc<>'' and p_ruc !~ '^[0-9]{13}$')
    or p_monto is null or p_monto<=0 or p_monto>=1000000000 or p_monto<>round(p_monto,2) then
    raise exception 'Revisa fecha, proveedor, identificación, concepto y monto del anticipo.';
  end if;
  perform public.fin_bloquear_documento_compra('anticipo:'||p_id::text);
  select * into anterior from public.fin_anticipos where id=p_id for update;
  if found then
    if anterior.fecha=p_fecha and anterior.proveedor=p_proveedor and anterior.ruc=p_ruc
      and anterior.concepto=p_concepto and anterior.monto=p_monto then return; end if;
    if exists(select 1 from public.fin_pagos_compras where documento_id='anticipo:'||p_id::text)
      or exists(select 1 from public.fin_programacion_compras where documento_id='anticipo:'||p_id::text) then
      raise exception 'El anticipo ya tiene programación o pagos. Revisa su detalle.';
    end if;
    update public.fin_anticipos set fecha=p_fecha,proveedor=p_proveedor,ruc=p_ruc,concepto=p_concepto,monto=p_monto where id=p_id;
  else
    insert into public.fin_anticipos(id,fecha,proveedor,ruc,concepto,monto,creado_por)
      values(p_id,p_fecha,p_proveedor,p_ruc,p_concepto,p_monto,auth.uid());
  end if;
end;
$$;

create or replace function public.fin_aplicar_anticipo(
  p_id uuid,p_anticipo uuid,p_factura text,p_monto numeric,p_confirmado boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.fin_vw_anticipos%rowtype; f public.fin_vw_cuentas_por_pagar_compras%rowtype;
  anterior public.fin_anticipos_aplicaciones%rowtype; clave text;
  fecha_pago date; referencias text; plan public.fin_programacion_compras%rowtype; pendiente numeric;
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
    raise exception 'No tienes permiso para cruzar anticipos.' using errcode='42501';
  end if;
  if p_id is null or p_anticipo is null or p_factura is null or p_monto is null or p_monto<=0
    or p_monto<>round(p_monto,2) or p_confirmado is not true then
    raise exception 'Escoge la factura, revisa el monto y confirma el proveedor.';
  end if;
  for clave in select unnest(array['anticipo:'||p_anticipo::text,p_factura]) order by 1
  loop perform public.fin_bloquear_documento_compra(clave); end loop;
  select * into anterior from public.fin_anticipos_aplicaciones where id=p_id;
  if found then
    if anterior.anticipo_id<>p_anticipo or anterior.factura_id<>p_factura or anterior.monto<>p_monto then
      raise exception 'Esta operación ya se guardó con otros datos. Actualiza el detalle.';
    end if;
    return jsonb_build_object('factura_id',p_factura,'aplicado',anterior.monto);
  end if;
  select * into a from public.fin_vw_anticipos where id=p_anticipo;
  if not found or a.disponible<p_monto then raise exception 'El anticipo no tiene ese importe pagado disponible para cruzar.'; end if;
  select * into f from public.fin_vw_cuentas_por_pagar_compras where id=p_factura;
  if not found or f.tipo<>'SRI' or f.saldo is null or f.saldo<p_monto then
    raise exception 'La factura no está disponible o el monto supera su saldo. Actualiza la búsqueda.';
  end if;
  if a.ruc<>'' and coalesce(f.ruc,'')<>'' and a.ruc<>f.ruc then
    raise exception 'La identificación del proveedor no coincide con la factura.';
  end if;
  select min(fecha),string_agg(distinct documento,' · ' order by documento) into fecha_pago,referencias
    from public.fin_pagos_compras where documento_id='anticipo:'||p_anticipo::text;
  insert into public.fin_anticipos_aplicaciones(id,anticipo_id,factura_id,numero_factura,proveedor_factura,monto,documento_anticipo,fecha_pago,referencias_pago,aplicado_por)
    values(p_id,p_anticipo,p_factura,coalesce(f.numero_documento,p_factura),coalesce(f.proveedor,''),p_monto,a.numero,fecha_pago,coalesce(referencias,''),auth.uid());
  -- El crédito reduce también cualquier pago futuro pendiente de esa factura.
  select * into plan from public.fin_programacion_compras where documento_id=p_factura and pagado<monto for update;
  if found then
    pendiente:=least(plan.monto-plan.pagado,greatest(f.saldo-p_monto,0));
    if plan.pagado=0 and pendiente=0 then
      delete from public.fin_programacion_compras where semana=plan.semana and documento_id=p_factura;
    else
      update public.fin_programacion_compras set monto=plan.pagado+pendiente
        where semana=plan.semana and documento_id=p_factura;
    end if;
  end if;
  insert into public.app_audit_log(actor_user_id,accion,detalle)
    values(auth.uid(),'FIN_APLICAR_ANTICIPO',jsonb_build_object('operacion',p_id,'anticipo',p_anticipo,
      'factura',p_factura,'monto',p_monto,'proveedor_anticipo',a.proveedor,'proveedor_factura',f.proveedor,
      'plan_anterior',case when plan.documento_id is null then null else to_jsonb(plan) end));
  return jsonb_build_object('factura_id',p_factura,'aplicado',p_monto,'saldo',f.saldo-p_monto);
end;
$$;

-- La edición y los abonos del XML consideran el crédito aplicado.
do $guardas$
declare definicion text;
begin
  select pg_get_functiondef('public.compras_sri_editar(text,text,text)'::regprocedure) into definicion;
  if position('public.fin_vw_anticipos_creditos' in definicion)=0 then
    if position('if p_valor::numeric < pagado then' in definicion)=0 then raise exception 'Revisar contrato de edición SRI.'; end if;
    definicion:=replace(definicion,'if p_valor::numeric < pagado then',
      'pagado := pagado + coalesce((select monto from public.fin_vw_anticipos_creditos where factura_id=''sri:''||p_clave),0);
       if p_valor::numeric < pagado then');
  end if;
  -- Devuelve los créditos junto con los abonos para conservar el estado de la fila editada.
  definicion:=replace(definicion,'''abonos'', compra.abonos);',
    '''abonos'', compra.abonos || coalesce((select pagos from public.fin_vw_anticipos_creditos where factura_id=''sri:''||p_clave),''[]''::jsonb));');
  execute definicion;
  select pg_get_functiondef('public.compras_sri_abonar(text,uuid,numeric,date,text)'::regprocedure) into definicion;
  if position('public.fin_vw_anticipos_creditos' in definicion)=0 then
    if position('valor := coalesce(p_valor, saldo);' in definicion)=0 then raise exception 'Revisar contrato de abonos SRI.'; end if;
    definicion:=replace(definicion,'valor := coalesce(p_valor, saldo);',
      'saldo := saldo - coalesce((select monto from public.fin_vw_anticipos_creditos where factura_id=''sri:''||p_clave),0);
       valor := coalesce(p_valor, saldo);');
  end if;
  definicion:=replace(definicion,'''abonos'', compra.abonos);',
    '''abonos'', compra.abonos || coalesce((select pagos from public.fin_vw_anticipos_creditos where factura_id=''sri:''||p_clave),''[]''::jsonb));');
  execute definicion;
end $guardas$;
revoke all on function public.fin_consultar_anticipos(),public.fin_guardar_anticipo(uuid,date,text,text,text,numeric),
  public.fin_aplicar_anticipo(uuid,uuid,text,numeric,boolean) from public,anon,authenticated;
grant execute on function public.fin_consultar_anticipos(),public.fin_guardar_anticipo(uuid,date,text,text,text,numeric),
  public.fin_aplicar_anticipo(uuid,uuid,text,numeric,boolean) to authenticated;
commit;
