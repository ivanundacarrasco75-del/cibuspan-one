begin;
set local lock_timeout='5s';
set local search_path='';

-- Catálogo de casos frecuentes para CIBUSPAN como agente, no contribuyente especial.
create table public.fin_reglas_retencion (
  id text primary key, impuesto text not null check(impuesto in ('RENTA','IVA')),
  concepto text not null, porcentaje numeric(5,2) not null check(porcentaje between 0 and 100),
  desde date not null, hasta date, fuente text not null,
  check(hasta is null or hasta>=desde)
);
insert into public.fin_reglas_retencion values
  ('IR_BIENES_2026','RENTA','Bienes muebles corporales',2,'2026-03-01',null,'NAC-DGERCGC26-00000009, art. 2.4.i'),
  ('IR_MANO_OBRA_2026','RENTA','Servicios de personas naturales: predomina mano de obra',3,'2026-03-01',null,'NAC-DGERCGC26-00000009, art. 2.5.a'),
  ('IR_PROF_SOC_2026','RENTA','Servicios profesionales de sociedades',5,'2026-03-01',null,'NAC-DGERCGC26-00000009, art. 2.6.a'),
  ('IR_INTELECTO_PN_2026','RENTA','Servicios de personas naturales: predomina intelecto',10,'2026-03-01',null,'NAC-DGERCGC26-00000009, art. 2.7.a'),
  ('IR_TRANSPORTE_2026','RENTA','Transporte privado de pasajeros o público/privado de carga',1,'2026-03-01',null,'NAC-DGERCGC26-00000009, art. 2.2.a'),
  ('IR_RIMPE_2026','RENTA','RIMPE Emprendedor: actividad acogida al régimen',1,'2026-03-01',null,'NAC-DGERCGC26-00000009, art. 2.2.c'),
  ('IR_NO_APLICA','RENTA','No procede / ingreso exento: documentar motivo',0,'2026-03-01',null,'LRTI y NAC-DGERCGC26-00000009, art. 6; verificar supuesto'),
  ('IVA_BIENES','IVA','Bienes: proveedor no especial, operación sujeta a retención',30,'2020-10-01',null,'NAC-DGERCGC20-00000061 y reformas; cuadro SRI de agentes'),
  ('IVA_SERVICIOS','IVA','Servicios: proveedor no especial, sin supuesto de 100%',70,'2020-10-01',null,'NAC-DGERCGC20-00000061 y reformas; cuadro SRI de agentes'),
  ('IVA_PROF_PN','IVA','Servicios profesionales de persona natural, excepto consultoría',100,'2020-10-01',null,'NAC-DGERCGC20-00000061 y reformas; cuadro SRI de agentes'),
  ('IVA_NO_APLICA','IVA','Sin IVA / no procede: documentar motivo',0,'2020-10-01',null,'NAC-DGERCGC20-00000061 y reformas; verificar supuesto');

create table public.fin_retenciones_documentos (
  id uuid primary key, documento_id text not null, fecha date not null check(isfinite(fecha)),
  regimen text not null check(regimen in ('GENERAL','RIMPE_EMPRENDEDOR','RIMPE_POPULAR')),
  proveedor_especial boolean not null, comprobante text not null,
  motivo text not null check(char_length(motivo) between 1 and 500),
  lineas jsonb not null, solicitud jsonb not null,
  total numeric(14,2) not null check(total>=0), descuento numeric(14,2) not null,
  estado text not null default 'ACTIVA' check(estado in ('ACTIVA','ANULADA')),
  creado_por uuid not null, creado_en timestamptz not null default now(),
  anulado_por uuid, anulado_en timestamptz, motivo_anulacion text
);
create unique index fin_retenciones_documento_activa on public.fin_retenciones_documentos(documento_id) where estado='ACTIVA';
alter table public.fin_reglas_retencion enable row level security;
alter table public.fin_retenciones_documentos enable row level security;
revoke all on public.fin_reglas_retencion,public.fin_retenciones_documentos from public,anon,authenticated;
grant select on public.fin_reglas_retencion,public.fin_retenciones_documentos to authenticated;
create policy fin_reglas_lectura on public.fin_reglas_retencion for select to authenticated
  using((select public.fin_puede_consultar_cuentas()));
create policy fin_retenciones_lectura on public.fin_retenciones_documentos for select to authenticated
  using((select public.fin_puede_consultar_cuentas()) or (select public.compras_sri_puede()));

-- Preserva los contratos y los créditos de anticipos, sin duplicar retenciones históricas.
create view public.fin_vw_cuentas_sin_reglas_retencion with(security_invoker=true) as
select * from public.fin_vw_cuentas_por_pagar_compras;
-- Copia la definición, en lugar de depender de la vista que se va a sustituir.
do $copia$ begin execute 'create or replace view public.fin_vw_cuentas_sin_reglas_retencion with(security_invoker=true) as '||
  pg_get_viewdef('public.fin_vw_cuentas_por_pagar_compras'::regclass,true); end $copia$;
revoke all on public.fin_vw_cuentas_sin_reglas_retencion from public,anon,authenticated;
grant select on public.fin_vw_cuentas_sin_reglas_retencion to authenticated;
create or replace view public.fin_vw_cuentas_por_pagar_compras with(security_invoker=true) as
select c.id,c.tipo,c.origen,c.fecha_documento,c.numero_documento,c.proveedor,c.concepto,c.subtotal,c.iva,
  coalesce(r.total,c.retencion) as retencion,c.total,c.neto-coalesce(r.descuento,0) as neto,
  case when r.id is null then c.observaciones else concat_ws(' · ',c.observaciones,'Retención '||coalesce(nullif(r.comprobante,''),'sin importe')) end as observaciones,
  c.ruc,c.pagos,c.pagado,
  case when c.saldo is null then null else greatest(c.saldo-coalesce(r.descuento,0),0) end as saldo,
  c.semana_activa,c.busqueda
from public.fin_vw_cuentas_sin_reglas_retencion c
left join public.fin_retenciones_documentos r on r.documento_id=c.id and r.estado='ACTIVA';

create view public.compras_vw_facturas_sin_reglas_retencion with(security_invoker=true) as
select * from public.compras_vw_facturas;
do $copia$ begin execute 'create or replace view public.compras_vw_facturas_sin_reglas_retencion with(security_invoker=true) as '||
  pg_get_viewdef('public.compras_vw_facturas'::regclass,true); end $copia$;
revoke all on public.compras_vw_facturas_sin_reglas_retencion from public,anon,authenticated;
grant select on public.compras_vw_facturas_sin_reglas_retencion to authenticated;
create or replace view public.compras_vw_facturas with(security_invoker=true) as
select f.id,f.fecha_orden,f.datos,f.ride_leido,
  case when r.id is null then f.edicion else f.edicion||jsonb_build_object('retencion',r.total::text) end as edicion,
  f.abonos,
  case when r.id is null then f.neto_excel
    when f.origen_excel then f.neto_excel-r.descuento
    else round(coalesce(f.edicion->>'total',f.datos->>'total')::numeric,2)-r.descuento end as neto_excel,
  f.origen_excel,f.observaciones_excel,f.documento_excel,f.proveedor_filtro
from public.compras_vw_facturas_sin_reglas_retencion f
left join public.fin_retenciones_documentos r on r.documento_id=f.id and r.estado='ACTIVA';

create function public.fin_aplicar_retencion(p_id uuid,p_documento text,p_fecha date,p_regimen text,
  p_especial boolean,p_comprobante text,p_motivo text,p_lineas jsonb,p_confirmado boolean)
returns void language plpgsql security definer set search_path='' as $$
declare c public.fin_vw_cuentas_por_pagar_compras%rowtype; regla public.fin_reglas_retencion%rowtype;
  anterior public.fin_retenciones_documentos%rowtype; fila record; solicitud jsonb;
  lineas jsonb:='[]'; total numeric:=0; base_ir numeric:=0; base_iva numeric:=0;
  retenido numeric; descontado numeric; diferencia numeric; plan public.fin_programacion_compras%rowtype; pendiente numeric;
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
    raise exception 'No tienes permiso para gestionar retenciones.' using errcode='42501'; end if;
  if p_id is null or p_documento is null or p_fecha is null or not isfinite(p_fecha) or p_confirmado is not true
    or p_regimen is null or p_regimen not in ('GENERAL','RIMPE_EMPRENDEDOR','RIMPE_POPULAR') or p_especial is null
    or char_length(btrim(coalesce(p_motivo,''))) not between 1 and 500
    or char_length(coalesce(p_comprobante,''))>100 or jsonb_typeof(p_lineas) is distinct from 'array' then
    raise exception 'Revisa régimen, fecha, motivo, comprobante y reglas.'; end if;
  if jsonb_array_length(p_lineas) not between 2 and 20 then raise exception 'Incluye las reglas de renta e IVA.'; end if;
  solicitud:=jsonb_build_object('documento',p_documento,'fecha',p_fecha,'regimen',p_regimen,'especial',p_especial,
    'comprobante',btrim(coalesce(p_comprobante,'')),'motivo',btrim(p_motivo),'lineas',p_lineas);
  perform public.fin_bloquear_documento_compra(p_documento);
  select * into anterior from public.fin_retenciones_documentos where id=p_id;
  if found then
    if anterior.solicitud<>solicitud or anterior.estado<>'ACTIVA' then raise exception 'Esta operación ya se utilizó. Actualiza el documento.'; end if;
    return;
  end if;
  if exists(select 1 from public.fin_retenciones_documentos where documento_id=p_documento and estado='ACTIVA') then
    raise exception 'El documento ya tiene retención revisada. Consulta su detalle o anúlala antes de corregirla.'; end if;
  select * into c from public.fin_vw_cuentas_por_pagar_compras where id=p_documento;
  if not found or c.tipo not in ('SRI','NOTA_VENTA') or c.neto is null or c.total is null or c.subtotal is null or c.iva is null then
    raise exception 'Completa subtotal, IVA y total de la factura o nota de venta antes de calcular.'; end if;
  if p_fecha< c.fecha_documento then raise exception 'La fecha de retención no puede preceder al documento.'; end if;
  if c.tipo='NOTA_VENTA' and (p_regimen<>'RIMPE_POPULAR' or c.iva<>0) then
    raise exception 'Verifica la nota de venta: este flujo admite Negocio Popular sin IVA; otros casos requieren revisión tributaria.'; end if;
  if not exists(select 1 from jsonb_to_recordset(p_lineas) x(regla text,base numeric)
      join public.fin_reglas_retencion r on r.id=x.regla where r.impuesto='RENTA')
    or not exists(select 1 from jsonb_to_recordset(p_lineas) x(regla text,base numeric)
      join public.fin_reglas_retencion r on r.id=x.regla where r.impuesto='IVA') then
    raise exception 'Incluye una regla de renta y una de IVA, incluso cuando no procede.'; end if;
  for fila in select * from jsonb_to_recordset(p_lineas) x(regla text,base numeric)
  loop
    select * into regla from public.fin_reglas_retencion where id=fila.regla;
    if not found or p_fecha<regla.desde or (regla.hasta is not null and p_fecha>regla.hasta)
      or fila.base is null or fila.base<0 or fila.base<>round(fila.base,2) then raise exception 'Regla o base fuera de vigencia.'; end if;
    if p_regimen='RIMPE_POPULAR' and regla.porcentaje<>0 then raise exception 'Negocio Popular: no apliques renta ni IVA sin revisar el supuesto tributario.'; end if;
    if p_especial and regla.impuesto='IVA' and regla.porcentaje<>0 then
      raise exception 'CIBUSPAN agente no especial: no retiene IVA al proveedor especial en este flujo.'; end if;
    if regla.impuesto='RENTA' and ((p_regimen='RIMPE_EMPRENDEDOR' and regla.id not in ('IR_RIMPE_2026','IR_NO_APLICA'))
      or (p_regimen<>'RIMPE_EMPRENDEDOR' and regla.id='IR_RIMPE_2026')) then raise exception 'La regla no corresponde al régimen declarado.'; end if;
    if regla.impuesto='RENTA' then base_ir:=base_ir+fila.base; else base_iva:=base_iva+fila.base; end if;
    retenido:=round(fila.base*regla.porcentaje/100,2); total:=total+retenido;
    lineas:=lineas||jsonb_build_array(to_jsonb(regla)||jsonb_build_object('base',fila.base,'valor',retenido));
  end loop;
  if base_ir>c.subtotal or base_iva>c.iva or total>c.total then raise exception 'Las bases superan el subtotal o el IVA del documento.'; end if;
  if total>0 and btrim(coalesce(p_comprobante,''))='' then raise exception 'Registra la referencia del comprobante de retención emitido.'; end if;
  -- En XML el neto anterior es bruto; Excel y documentos manuales pueden tener descuento previo.
  descontado:=case when c.origen='SRI' then 0 else c.total-c.neto end;
  if descontado<0 then raise exception 'El neto anterior supera el total. Revisa el documento.'; end if;
  diferencia:=total-descontado;
  if c.neto-diferencia<c.pagado then raise exception 'El neto resultante es menor que los pagos o anticipos aplicados. Revisa la conciliación.'; end if;
  insert into public.fin_retenciones_documentos(id,documento_id,fecha,regimen,proveedor_especial,comprobante,motivo,lineas,solicitud,total,descuento,creado_por)
    values(p_id,p_documento,p_fecha,p_regimen,p_especial,btrim(coalesce(p_comprobante,'')),btrim(p_motivo),lineas,solicitud,total,diferencia,auth.uid());
  select * into plan from public.fin_programacion_compras where documento_id=p_documento and pagado<monto for update;
  if found then
    pendiente:=least(plan.monto-plan.pagado,greatest(c.saldo-diferencia,0));
    if plan.pagado=0 and pendiente=0 then delete from public.fin_programacion_compras where semana=plan.semana and documento_id=p_documento;
    else update public.fin_programacion_compras set monto=plan.pagado+pendiente where semana=plan.semana and documento_id=p_documento; end if;
  end if;
  insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_APLICAR_RETENCION',
    jsonb_build_object('id',p_id,'documento',p_documento,'total',total,'descuento_anterior',descontado,'plan_anterior',to_jsonb(plan)));
end;
$$;

create function public.fin_anular_retencion(p_id uuid,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.fin_retenciones_documentos%rowtype;
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para retenciones.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Explica el motivo de anulación.'; end if;
  select * into r from public.fin_retenciones_documentos where id=p_id;
  if not found then raise exception 'La retención no existe.'; end if;
  perform public.fin_bloquear_documento_compra(r.documento_id);
  select * into r from public.fin_retenciones_documentos where id=p_id for update;
  if r.estado='ANULADA' then return; end if;
  if r.descuento<0 and exists(select 1 from public.fin_vw_cuentas_por_pagar_compras c where c.id=r.documento_id and c.neto+r.descuento<c.pagado) then
    raise exception 'La anulación dejaría pagos superiores al neto anterior. Revisa la conciliación.'; end if;
  update public.fin_retenciones_documentos set estado='ANULADA',anulado_por=auth.uid(),anulado_en=now(),motivo_anulacion=btrim(p_motivo) where id=p_id;
  insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_ANULAR_RETENCION',jsonb_build_object('id',p_id,'motivo',btrim(p_motivo)));
end;
$$;

-- Los abonos XML descuentan la retención una sola vez, además del anticipo existente.
do $abonos$
declare definicion text; firma text;
begin
  select pg_get_functiondef('public.compras_sri_abonar(text,uuid,numeric,date,text)'::regprocedure) into definicion;
  if position('valor := coalesce(p_valor, saldo);' in definicion)=0 then raise exception 'Revisar contrato de abonos.'; end if;
  execute replace(definicion,'valor := coalesce(p_valor, saldo);',
    'saldo := saldo - coalesce((select descuento from public.fin_retenciones_documentos where documento_id=''sri:''||p_clave and estado=''ACTIVA''),0);
     valor := coalesce(p_valor, saldo);');
  foreach firma in array array['public.compras_sri_editar(text,text,text)','public.compras_sri_abonar(text,uuid,numeric,date,text)'] loop
    select pg_get_functiondef(firma::regprocedure) into definicion;
    if position('''edicion'', compra.edicion,' in definicion)=0 then raise exception 'Revisar respuesta de edición o abonos.'; end if;
    execute replace(definicion,'''edicion'', compra.edicion,',
      '''edicion'', compra.edicion || coalesce((select jsonb_build_object(''retencion'',total::text) from public.fin_retenciones_documentos
        where documento_id=''sri:''||p_clave and estado=''ACTIVA''),''{}''::jsonb),');
  end loop;
end $abonos$;

create function public.fin_proteger_documento_retenido() returns trigger language plpgsql security definer set search_path='' as $$
declare documento text; previo jsonb; nuevo jsonb; campos text[]; retenido boolean;
begin
  if tg_table_name='compras_sri' then
    documento:='sri:'||old.clave_acceso;
    select exists(select 1 from public.fin_retenciones_documentos r where r.estado='ACTIVA' and
      (r.documento_id=documento or r.documento_id in(select 'excel:'||e.id::text from public.compras_excel_documentos e where e.sri_clave=old.clave_acceso))) into retenido;
    previo:=old.edicion; nuevo:=new.edicion; campos:=array['subtotal','iva','retencion','total'];
    if new.datos is distinct from old.datos and retenido then
      raise exception 'La factura tiene retención revisada. Anúlala antes de cambiar sus importes.'; end if;
  else
    documento:=case when tg_table_name='compras_excel_documentos' then 'excel:' else 'manual:' end||old.id::text;
    previo:=to_jsonb(old); nuevo:=to_jsonb(new); campos:=array['subtotal','iva','retencion','total','neto'];
    select exists(select 1 from public.fin_retenciones_documentos where documento_id=documento and estado='ACTIVA') into retenido;
  end if;
  if retenido
    and exists(select 1 from unnest(campos) campo where previo->campo is distinct from nuevo->campo) then
    raise exception 'El documento tiene retención revisada. Anúlala antes de cambiar sus importes.'; end if;
  return new;
end;
$$;
create trigger fin_retencion_sri before update on public.compras_sri for each row execute function public.fin_proteger_documento_retenido();
create trigger fin_retencion_excel before update on public.compras_excel_documentos for each row execute function public.fin_proteger_documento_retenido();
create trigger fin_retencion_manual before update on public.compras_documentos_manuales for each row execute function public.fin_proteger_documento_retenido();
revoke all on function public.fin_aplicar_retencion(uuid,text,date,text,boolean,text,text,jsonb,boolean),public.fin_anular_retencion(uuid,text),
  public.fin_proteger_documento_retenido() from public,anon,authenticated;
grant execute on function public.fin_aplicar_retencion(uuid,text,date,text,boolean,text,text,jsonb,boolean),public.fin_anular_retencion(uuid,text) to authenticated;
commit;
