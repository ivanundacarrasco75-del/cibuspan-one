begin;
set local lock_timeout='5s';

-- Una corrección del importe del anticipo conserva el desembolso y el cruce originales.
create table public.fin_anticipos_ajustes_retencion(
  id uuid primary key, solicitud jsonb not null, anterior jsonb not null,
  creado_por uuid not null, creado_en timestamptz not null default now()
);
alter table public.fin_anticipos_ajustes_retencion enable row level security;
revoke all on public.fin_anticipos_ajustes_retencion from public,anon,authenticated;
alter table public.fin_retenciones_documentos add column ajuste_anticipo uuid
  references public.fin_anticipos_ajustes_retencion(id);
alter table public.fin_retenciones_documentos drop constraint fin_retenciones_origen_completo;
alter table public.fin_retenciones_documentos add constraint fin_retenciones_origen_completo check(
  reporte_fila is not null or (regimen is not null and proveedor_especial is not null)
  or (tipo_registro='CALCULADA' and ajuste_anticipo is not null)
);

create function public.fin_liquidar_anticipo_retencion(
  p_operacion uuid,p_anticipo uuid,p_factura text,p_monto_anterior numeric,
  p_pagado_anterior numeric,p_retencion numeric,p_motivo text
) returns void language plpgsql security definer set search_path='' as $$
declare
  solicitud jsonb; previa jsonb; clave text; cantidad integer;
  a public.fin_vw_anticipos%rowtype;
  f public.fin_vw_cuentas_por_pagar_compras%rowtype;
  base public.fin_vw_cuentas_sin_reglas_retencion%rowtype;
  r public.fin_retenciones_documentos%rowtype;
  antes_plan jsonb; plan record; pendiente numeric; diferencia numeric;
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
    raise exception 'No tienes permiso para ajustar anticipos.' using errcode='42501';
  end if;
  p_motivo:=btrim(coalesce(p_motivo,''));
  if p_operacion is null or p_anticipo is null or p_factura is null
    or p_monto_anterior is null or p_pagado_anterior is null
    or p_retencion is null or not(p_retencion>0 and p_retencion<1000000000 and p_retencion=round(p_retencion,2))
    or char_length(p_motivo) not between 5 and 500 then
    raise exception 'Revisa la retención y el motivo del ajuste.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('liquidar_anticipo_retencion:'||p_operacion::text,0));
  solicitud:=jsonb_build_object('anticipo',p_anticipo,'factura',p_factura,'monto_anterior',p_monto_anterior,
    'pagado_anterior',p_pagado_anterior,'retencion',p_retencion,'motivo',p_motivo);
  select o.solicitud into previa from public.fin_anticipos_ajustes_retencion o where id=p_operacion;
  if found then
    if previa is distinct from solicitud then raise exception 'La operación ya se utilizó con otros datos.'; end if;
    return;
  end if;
  for clave in select unnest(array['anticipo:'||p_anticipo::text,p_factura]) order by 1
  loop perform public.fin_bloquear_documento_compra(clave); end loop;
  perform 1 from public.fin_anticipos where id=p_anticipo for update;
  select * into a from public.fin_vw_anticipos where id=p_anticipo;
  if not found then raise exception 'No se encontró el anticipo.'; end if;
  select count(distinct factura_id) into cantidad from public.fin_anticipos_aplicaciones where anticipo_id=p_anticipo;
  if cantidad<>1 or not exists(select 1 from public.fin_anticipos_aplicaciones where anticipo_id=p_anticipo and factura_id=p_factura)
    or a.pagado<=0 or a.pagado<>a.aplicado or a.monto<>p_monto_anterior or a.pagado<>p_pagado_anterior then
    raise exception 'El anticipo cambió: requiere un único cruce y todo su pago aplicado. Actualiza el detalle.';
  end if;
  select * into f from public.fin_vw_cuentas_por_pagar_compras where id=p_factura;
  if not found or f.tipo<>'SRI' or f.origen<>'SRI' or f.total is null or f.total<>a.monto
    or f.pagado<>a.aplicado or nullif(a.ruc,'') is null or a.ruc is distinct from f.ruc
    or a.monto-a.pagado<>p_retencion then
    raise exception 'Revisa el cruce: el anticipo debe cubrir la misma factura y la diferencia debe ser la retención confirmada.';
  end if;
  select * into base from public.fin_vw_cuentas_sin_reglas_retencion where id=p_factura;
  if not found or base.neto is null then raise exception 'No se pudo verificar el importe original de la factura.'; end if;
  select * into r from public.fin_retenciones_documentos where documento_id=p_factura and estado='ACTIVA' for update;
  if found and r.total<>p_retencion then
    raise exception 'La factura ya tiene otra retención. Revísala en Reglas de retenciones.';
  end if;
  diferencia:=p_retencion-(base.total-base.neto);
  if diferencia<0 or base.neto-diferencia<>base.pagado then
    raise exception 'La retención no cubre exactamente el saldo de la factura.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into antes_plan from public.fin_programacion_compras p
    where documento_id in(p_factura,'anticipo:'||p_anticipo::text) and pagado<monto;
  insert into public.fin_anticipos_ajustes_retencion values(p_operacion,solicitud,
    jsonb_build_object('anticipo',to_jsonb(a),'factura',to_jsonb(f),'retencion',to_jsonb(r),'programacion',antes_plan),auth.uid(),now());
  if r.id is null then
    insert into public.fin_retenciones_documentos(id,documento_id,fecha,regimen,proveedor_especial,
      comprobante,motivo,lineas,solicitud,total,descuento,creado_por,tipo_registro,ajuste_anticipo)
    values(p_operacion,p_factura,(now() at time zone 'America/Guayaquil')::date,null,null,'',p_motivo,
      jsonb_build_array(jsonb_build_object('impuesto','TOTAL_RETENIDO','concepto','Total confirmado al liquidar anticipo; pendiente de emisión',
        'base',0,'valor',p_retencion,'ajuste_manual',true)),solicitud,p_retencion,diferencia,auth.uid(),'CALCULADA',p_operacion);
  end if;
  update public.fin_anticipos set monto=a.pagado where id=p_anticipo;
  -- Reduce solamente la parte pendiente; nunca modifica pagos bancarios ni cruces.
  for plan in select * from public.fin_programacion_compras
    where documento_id in(p_factura,'anticipo:'||p_anticipo::text) and pagado<monto
    order by documento_id,semana for update loop
    select c.saldo into pendiente from public.fin_vw_cuentas_por_pagar_compras c where c.id=plan.documento_id;
    if pendiente is distinct from 0::numeric then raise exception 'No se pudo verificar el saldo liquidado.'; end if;
    if plan.pagado=0 then delete from public.fin_programacion_compras where documento_id=plan.documento_id and semana=plan.semana;
    else update public.fin_programacion_compras set monto=plan.pagado where documento_id=plan.documento_id and semana=plan.semana; end if;
  end loop;
  if exists(select 1 from public.fin_vw_cuentas_por_pagar_compras
    where id in(p_factura,'anticipo:'||p_anticipo::text) and saldo is distinct from 0::numeric) then
    raise exception 'La liquidación no dejó ambos documentos sin saldo.';
  end if;
  insert into public.app_audit_log(actor_user_id,accion,detalle)
    values(auth.uid(),'FIN_LIQUIDAR_ANTICIPO_RETENCION',jsonb_build_object('operacion',p_operacion,
      'solicitud',solicitud,'anticipo_anterior',to_jsonb(a),'monto_corregido',a.pagado,
      'factura_anterior',to_jsonb(f),'retencion_anterior',to_jsonb(r),'programacion_anterior',antes_plan));
end $$;
revoke all on function public.fin_liquidar_anticipo_retencion(uuid,uuid,text,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.fin_liquidar_anticipo_retencion(uuid,uuid,text,numeric,numeric,numeric,text) to authenticated;
commit;
