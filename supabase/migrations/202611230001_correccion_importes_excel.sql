begin;
set local lock_timeout='5s';
create table public.fin_correcciones_excel_importes (
 id uuid primary key,documento_id text not null,
 subtotal numeric not null,iva numeric not null,total numeric not null,retencion numeric not null,neto numeric not null,
 motivo text not null,anterior jsonb not null,solicitud jsonb not null,
 responsable uuid not null references auth.users(id),responsable_email text not null,
 creado_en timestamptz not null default clock_timestamp(),
 check(subtotal>=0 and iva>=0 and retencion>=0 and total=subtotal+iva and neto=total-retencion and neto>=0)
);
create index fin_correcciones_excel_documento on public.fin_correcciones_excel_importes(documento_id,creado_en desc,id);
alter table public.fin_correcciones_excel_importes enable row level security;
revoke all on public.fin_correcciones_excel_importes from public,anon,authenticated;
grant select on public.fin_correcciones_excel_importes to authenticated;
create policy fin_correcciones_excel_lectura on public.fin_correcciones_excel_importes for select to authenticated
 using((select public.fin_puede_consultar_cuentas()) or ((select public.compras_sri_puede()) and exists(
  select 1 from public.compras_excel_documentos e where documento_id='excel:'||e.id::text and e.tipo='FACTURA')));

create function public.fin_corregir_importes_excel(p_operacion uuid,p_documento text,p_subtotal numeric,p_iva numeric,
 p_total numeric,p_retencion numeric,p_motivo text,p_anterior jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare c public.fin_vw_cuentas_por_pagar_compras%rowtype; e public.compras_excel_documentos%rowtype;
 previo public.fin_correcciones_excel_importes%rowtype; solicitud jsonb; v_neto numeric; v_estado jsonb; plan record;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
  raise exception 'No tienes permiso para corregir importes.' using errcode='42501'; end if;
 if p_operacion is null or p_documento is null or not starts_with(p_documento,'excel:')
  or p_subtotal is null or p_iva is null or p_total is null or p_retencion is null
  or p_subtotal<0 or p_iva<0 or p_total<=0 or p_retencion<0 or p_retencion>p_total
  or p_subtotal<>round(p_subtotal,2) or p_iva<>round(p_iva,2) or p_total<>round(p_total,2)
  or p_retencion<>round(p_retencion,2) or p_total<>p_subtotal+p_iva
  or p_total::text in ('NaN','Infinity','-Infinity') or p_retencion::text in ('NaN','Infinity','-Infinity')
  or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then
  raise exception 'Revisa subtotal, IVA, total, retención y motivo de la corrección.'; end if;
 solicitud:=jsonb_build_object('documento',p_documento,'subtotal',p_subtotal,'iva',p_iva,'total',p_total,
  'retencion',p_retencion,'motivo',btrim(p_motivo),'anterior',p_anterior);
 perform public.fin_bloquear_documento_compra(p_documento);
 select * into previo from public.fin_correcciones_excel_importes where id=p_operacion;
 if found then
  if previo.solicitud is distinct from solicitud then raise exception 'Operación ya utilizada; actualiza el documento.'; end if;
  return;
 end if;
 select * into c from public.fin_vw_cuentas_por_pagar_compras where id=p_documento;
 if not found or c.origen<>'EXCEL' then raise exception 'Documento importado no disponible.'; end if;
 v_estado:=jsonb_build_object('subtotal',c.subtotal,'iva',c.iva,'total',c.total,'retencion',c.retencion,'neto',c.neto,'pagado',c.pagado);
 if v_estado is distinct from p_anterior then raise exception 'El documento cambió. Actualiza y revisa los importes antes de guardar.'; end if;
 if exists(select 1 from public.fin_retenciones_documentos where documento_id=p_documento and estado='ACTIVA') then
  raise exception 'Tiene retención revisada. Corrige el cálculo en Reglas de retenciones o revisa su comprobante antes de modificar las bases.'; end if;
 v_neto:=p_total-p_retencion;
 if v_neto<c.pagado then raise exception 'El neto no puede ser menor que los pagos o anticipos ya aplicados.'; end if;
 select * into e from public.compras_excel_documentos where id=substr(p_documento,7)::uuid;
 if e.sri_clave is not null then
  perform 1 from public.compras_sri where clave_acceso=e.sri_clave for update;
  update public.compras_sri set edicion=edicion||jsonb_build_object('subtotal',p_subtotal::text,'iva',p_iva::text,'total',p_total::text,'retencion',p_retencion::text)
   where clave_acceso=e.sri_clave;
 end if;
 update public.compras_excel_documentos set total=p_total,iva=p_iva,neto=v_neto,
  observaciones=regexp_replace(observaciones,'\. Neto pendiente:[^.]*','','g')||' · Importes verificados contra factura física'
  where id=e.id;
 insert into public.fin_correcciones_excel_importes(id,documento_id,subtotal,iva,total,retencion,neto,motivo,anterior,solicitud,responsable,responsable_email)
  values(p_operacion,p_documento,p_subtotal,p_iva,p_total,p_retencion,v_neto,btrim(p_motivo),to_jsonb(c),solicitud,auth.uid(),
   coalesce((select email from public.app_profiles where user_id=auth.uid()),auth.uid()::text));
 select * into plan from public.fin_programacion_compras where documento_id=p_documento and pagado<monto for update;
 if found then
  if plan.pagado=0 and v_neto=c.pagado then delete from public.fin_programacion_compras where documento_id=p_documento and semana=plan.semana;
  else update public.fin_programacion_compras set monto=plan.pagado+least(plan.monto-plan.pagado,v_neto-c.pagado)
   where documento_id=p_documento and semana=plan.semana; end if;
 end if;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CORREGIR_IMPORTES_EXCEL',
  jsonb_build_object('operacion',p_operacion,'documento',p_documento,'motivo',btrim(p_motivo),'anterior',to_jsonb(c),
   'origen_excel_anterior',to_jsonb(e),'nuevo',solicitud||jsonb_build_object('neto',v_neto),'plan_anterior',to_jsonb(plan)));
end $$;
revoke all on function public.fin_corregir_importes_excel(uuid,text,numeric,numeric,numeric,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.fin_corregir_importes_excel(uuid,text,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;

create or replace view public.fin_vw_cuentas_por_pagar_compras with(security_invoker=true) as
select c.id,c.tipo,c.origen,c.fecha_documento,c.numero_documento,c.proveedor,c.concepto,
 coalesce(a.subtotal,c.subtotal) as subtotal,coalesce(a.iva,c.iva) as iva,coalesce(r.total,a.retencion,c.retencion) as retencion,
 coalesce(a.total,c.total) as total,c.neto-coalesce(r.descuento,0) as neto,
 case when r.id is null then concat_ws(' · ',c.observaciones,nullif(s.edicion->>'retencion_revision','')) else concat_ws(' · ',c.observaciones,
  case when r.tipo_registro='CALCULADA' then 'Retención calculada pendiente de emisión' else 'Retención '||coalesce(nullif(r.comprobante,''),'sin importe') end) end as observaciones,
 c.ruc,c.pagos,c.pagado,case when c.saldo is null then null else greatest(c.saldo-coalesce(r.descuento,0),0) end as saldo,c.semana_activa,c.busqueda
from public.fin_vw_cuentas_sin_reglas_retencion c
left join public.fin_retenciones_documentos r on r.documento_id=c.id and r.estado='ACTIVA'
left join public.compras_sri s on c.id='sri:'||s.clave_acceso
left join (select distinct on(documento_id) * from public.fin_correcciones_excel_importes order by documento_id,creado_en desc,id desc) a on a.documento_id=c.id;

create or replace view public.compras_vw_facturas with(security_invoker=true) as
select f.id,f.fecha_orden,f.datos,f.ride_leido,
 f.edicion||case when a.id is null then '{}'::jsonb else jsonb_build_object('subtotal',a.subtotal::text,'iva',a.iva::text,'total',a.total::text,'retencion',a.retencion::text) end
 ||case when r.id is null then '{}'::jsonb else jsonb_build_object('retencion',r.total::text,'retencion_estado',r.tipo_registro,'retencion_revision',null) end as edicion,
 f.abonos,case when r.id is null then f.neto_excel when f.origen_excel then f.neto_excel-r.descuento
  else round(coalesce(f.edicion->>'total',f.datos->>'total')::numeric,2)-r.descuento end as neto_excel,
 f.origen_excel,f.observaciones_excel,f.documento_excel,f.proveedor_filtro
from public.compras_vw_facturas_sin_reglas_retencion f
left join public.fin_retenciones_documentos r on r.documento_id=f.id and r.estado='ACTIVA'
left join (select distinct on(documento_id) * from public.fin_correcciones_excel_importes order by documento_id,creado_en desc,id desc) a on a.documento_id=f.id;
commit;
