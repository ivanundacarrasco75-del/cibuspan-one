begin;
set local lock_timeout='5s';
set local search_path='';
alter table public.fin_retenciones_documentos add column tipo_registro text not null default 'EMITIDA'
  check(tipo_registro in ('CALCULADA','EMITIDA'));

-- El cálculo se puede corregir; emitirlo requiere una nueva operación y un comprobante real.
do $calculo$
declare definicion text; guarda text;
begin
  select pg_get_functiondef('public.fin_aplicar_retencion(uuid,text,date,text,boolean,text,text,jsonb,boolean)'::regprocedure) into definicion;
  guarda:='if exists(select 1 from public.fin_retenciones_documentos where documento_id=p_documento and estado=''ACTIVA'') then
    raise exception ''El documento ya tiene retención revisada. Consulta su detalle o anúlala antes de corregirla.''; end if;';
  if position(guarda in definicion)=0 or position('declare c public.fin_vw_cuentas_por_pagar_compras%rowtype;' in definicion)=0
    or position('retenido:=coalesce(fila.valor,' in definicion)=0 then raise exception 'Revisar contrato de retenciones editables.'; end if;
  definicion:=replace(definicion,'declare c public.fin_vw_cuentas_por_pagar_compras%rowtype;',
    'declare previa public.fin_retenciones_documentos%rowtype; modo text := ''EMITIDA''; c public.fin_vw_cuentas_por_pagar_compras%rowtype;');
  definicion:=replace(definicion,'if anterior.solicitud<>solicitud or anterior.estado<>''ACTIVA'' then',
    'if anterior.solicitud<>solicitud or anterior.estado<>''ACTIVA'' or anterior.tipo_registro<>modo then');
  definicion:=replace(definicion,guarda,
    'select * into previa from public.fin_retenciones_documentos where documento_id=p_documento and estado=''ACTIVA'' for update;
     if found and previa.tipo_registro<>''CALCULADA'' then
       raise exception ''El documento ya tiene retención emitida. Anula su registro antes de corregirla.'';
     end if;');
  definicion:=replace(definicion,'select * into c from public.fin_vw_cuentas_por_pagar_compras where id=p_documento;',
    'select * into c from public.fin_vw_cuentas_sin_reglas_retencion where id=p_documento;');
  definicion:=replace(definicion,'if total>0 and btrim(coalesce(p_comprobante,''''))='''' then',
    'if modo=''EMITIDA'' and total>0 and btrim(coalesce(p_comprobante,''''))='''' then');
  definicion:=replace(definicion,'if p_id is null or p_documento is null',
    'if modo=''CALCULADA'' and btrim(coalesce(p_comprobante,''''))<>'''' then
       raise exception ''Un cálculo pendiente no lleva número de comprobante emitido.'';
     end if;
     if p_id is null or p_documento is null');
  definicion:=replace(definicion,'insert into public.fin_retenciones_documentos(id,documento_id,fecha,regimen,proveedor_especial,comprobante,motivo,lineas,solicitud,total,descuento,creado_por)',
    'if previa.id is not null then
       update public.fin_retenciones_documentos set estado=''ANULADA'',anulado_por=auth.uid(),anulado_en=now(),
         motivo_anulacion=case when modo=''EMITIDA'' then ''Comprobante registrado en operación '' else ''Cálculo corregido en operación '' end||p_id::text
         where id=previa.id;
     end if;
     insert into public.fin_retenciones_documentos(id,documento_id,fecha,regimen,proveedor_especial,comprobante,motivo,lineas,solicitud,total,descuento,tipo_registro,creado_por)');
  definicion:=replace(definicion,'lineas,solicitud,total,diferencia,auth.uid())','lineas,solicitud,total,diferencia,modo,auth.uid())');
  definicion:=replace(definicion,'''FIN_APLICAR_RETENCION'',',
    'case when modo=''CALCULADA'' then ''FIN_GUARDAR_CALCULO_RETENCION'' else ''FIN_APLICAR_RETENCION'' end,');
  definicion:=replace(definicion,'''plan_anterior'',to_jsonb(plan))',
    '''plan_anterior'',to_jsonb(plan),''registro_anterior'',to_jsonb(previa),''tipo_registro'',modo)');
  execute definicion;
  definicion:=replace(definicion,'public.fin_aplicar_retencion(','public.fin_guardar_calculo_retencion(');
  definicion:=replace(definicion,'modo text := ''EMITIDA''','modo text := ''CALCULADA''');
  execute definicion;
end $calculo$;
revoke all on function public.fin_guardar_calculo_retencion(uuid,text,date,text,boolean,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.fin_guardar_calculo_retencion(uuid,text,date,text,boolean,text,text,jsonb,boolean) to authenticated;

create or replace view public.fin_vw_cuentas_por_pagar_compras with(security_invoker=true) as
select c.id,c.tipo,c.origen,c.fecha_documento,c.numero_documento,c.proveedor,c.concepto,c.subtotal,c.iva,
  coalesce(r.total,c.retencion) as retencion,c.total,c.neto-coalesce(r.descuento,0) as neto,
  case when r.id is null then concat_ws(' · ',c.observaciones,nullif(s.edicion->>'retencion_revision','')) else concat_ws(' · ',c.observaciones,
    case when r.tipo_registro='CALCULADA' then 'Retención calculada pendiente de emisión' else 'Retención '||coalesce(nullif(r.comprobante,''),'sin importe') end) end as observaciones,
  c.ruc,c.pagos,c.pagado,
  case when c.saldo is null then null else greatest(c.saldo-coalesce(r.descuento,0),0) end as saldo,
  c.semana_activa,c.busqueda
from public.fin_vw_cuentas_sin_reglas_retencion c
left join public.fin_retenciones_documentos r on r.documento_id=c.id and r.estado='ACTIVA'
left join public.compras_sri s on c.id='sri:'||s.clave_acceso;

create or replace view public.compras_vw_facturas with(security_invoker=true) as
select f.id,f.fecha_orden,f.datos,f.ride_leido,
  case when r.id is null then f.edicion else f.edicion||jsonb_build_object('retencion',r.total::text,'retencion_estado',r.tipo_registro,'retencion_revision',null) end as edicion,
  f.abonos,
  case when r.id is null then f.neto_excel when f.origen_excel then f.neto_excel-r.descuento
    else round(coalesce(f.edicion->>'total',f.datos->>'total')::numeric,2)-r.descuento end as neto_excel,
  f.origen_excel,f.observaciones_excel,f.documento_excel,f.proveedor_filtro
from public.compras_vw_facturas_sin_reglas_retencion f
left join public.fin_retenciones_documentos r on r.documento_id=f.id and r.estado='ACTIVA';

do $respuestas$
declare firma text; definicion text;
begin
  foreach firma in array array['public.compras_sri_editar(text,text,text)','public.compras_sri_abonar(text,uuid,numeric,date,text)'] loop
    select pg_get_functiondef(firma::regprocedure) into definicion;
    if position('jsonb_build_object(''retencion'',total::text)' in definicion)=0 then raise exception 'Revisar respuesta de edición y abonos.'; end if;
    execute replace(definicion,'jsonb_build_object(''retencion'',total::text)',
      'jsonb_build_object(''retencion'',total::text,''retencion_estado'',tipo_registro,''retencion_revision'',null)');
  end loop;
end $respuestas$;
commit;
