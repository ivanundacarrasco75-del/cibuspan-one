begin;
set local lock_timeout='5s';
create table public.compras_retenciones_lotes(hash text primary key check(hash~'^[a-f0-9]{64}$'),archivo text not null,desde date not null,hasta date not null,base numeric(14,2) not null,renta numeric(14,2) not null,segunda numeric(14,2) not null,creado_por uuid not null,creado_en timestamptz not null default now());
create table public.compras_retenciones_filas(id uuid primary key default gen_random_uuid(),identidad text unique not null,datos jsonb not null,retencion_id uuid references public.fin_retenciones_documentos(id));
create table public.compras_retenciones_archivos(hash text references public.compras_retenciones_lotes(hash),fila_id uuid references public.compras_retenciones_filas(id),renglon integer not null,datos_originales jsonb not null,primary key(hash,fila_id));
create table public.compras_retenciones_operaciones(id uuid primary key,solicitud jsonb not null,creado_por uuid not null,creado_en timestamptz not null default now());
alter table public.compras_retenciones_lotes enable row level security;
alter table public.compras_retenciones_filas enable row level security;
alter table public.compras_retenciones_archivos enable row level security;
alter table public.compras_retenciones_operaciones enable row level security;
revoke all on public.compras_retenciones_lotes,public.compras_retenciones_filas,public.compras_retenciones_archivos,public.compras_retenciones_operaciones from public,anon,authenticated;
-- Un reporte contable acredita importes, pero no informa régimen ni condición especial.
alter table public.fin_retenciones_documentos add column reporte_fila uuid references public.compras_retenciones_filas(id);
alter table public.fin_retenciones_documentos alter column regimen drop not null;
alter table public.fin_retenciones_documentos alter column proveedor_especial drop not null;
alter table public.fin_retenciones_documentos add constraint fin_retenciones_origen_completo check(reporte_fila is not null or (regimen is not null and proveedor_especial is not null));

create function public.compras_importar_retenciones(p_hash text,p_archivo text,p_reporte jsonb) returns void language plpgsql security definer set search_path='' as $$
declare f jsonb; v_datos jsonb; v_identidad text; guardada public.compras_retenciones_filas%rowtype; d date; h date; base numeric; renta numeric; segunda numeric; x text; v numeric; filas integer;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para importar retenciones.' using errcode='42501';end if;
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$' or char_length(btrim(coalesce(p_archivo,''))) not between 1 and 200 or jsonb_typeof(p_reporte->'filas') is distinct from 'array' then raise exception 'Revisa el archivo de retenciones.';end if;
 perform pg_advisory_xact_lock(hashtextextended('retenciones_archivo:'||p_hash,0));
 if exists(select 1 from public.compras_retenciones_lotes where hash=p_hash) then return;end if;
 d:=(p_reporte->>'desde')::date;h:=(p_reporte->>'hasta')::date;filas:=jsonb_array_length(p_reporte->'filas');
 if d is null or h is null or not isfinite(d) or not isfinite(h) or h<d or filas not between 1 and 2000 then raise exception 'Período o número de filas inválido.';end if;
 select sum((j->>'base_renta')::numeric),sum((j->>'renta')::numeric),sum((j->>'segunda')::numeric) into base,renta,segunda from jsonb_array_elements(p_reporte->'filas') j;
 if base is distinct from (p_reporte->>'base')::numeric or renta is distinct from (p_reporte->>'renta')::numeric or segunda is distinct from (p_reporte->>'segunda')::numeric then raise exception 'El detalle no cuadra con los totales del reporte.';end if;
 insert into public.compras_retenciones_lotes values(p_hash,btrim(p_archivo),d,h,base,renta,segunda,auth.uid(),now());
 for f in select value from jsonb_array_elements(p_reporte->'filas') loop
  if coalesce(f->>'ruc','')!~'^[0-9]{13}$' or coalesce(f->>'factura','')!~'^[0-9]{3}-[0-9]{3}-[0-9]{9}$' or coalesce(f->>'comprobante','')!~'^[0-9]{3}-[0-9]{3}-[0-9]{9}$' or char_length(btrim(coalesce(f->>'proveedor',''))) not between 2 and 500 then raise exception 'Identificación incompleta en el reporte.';end if;
  if coalesce(f->>'fecha','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(f->>'fecha_factura','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Fecha incompleta en el reporte.';end if;
  if (f->>'fecha')::date not between d and h or (f->>'fecha_factura')::date>(f->>'fecha')::date or not isfinite((f->>'fecha_factura')::date) then raise exception 'Fecha inválida en el reporte.';end if;
  foreach x in array array['base_renta','renta','base_segunda','segunda'] loop
   if coalesce(f->>x,'')!~'^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Importe inválido en el reporte.';end if;
   v:=(f->>x)::numeric;if v>=1000000000 then raise exception 'Importe fuera de rango.';end if;
  end loop;
  if (f->>'renta')::numeric>(f->>'base_renta')::numeric or (f->>'segunda')::numeric>(f->>'base_segunda')::numeric or ((f->>'renta')::numeric+(f->>'segunda')::numeric>0 and f->>'comprobante'='000-000-000000000') then raise exception 'Revisa el importe y el comprobante del reporte.';end if;
  v_identidad:=f->>'ruc'||':'||(f->>'comprobante')||':'||(f->>'factura');v_datos:=f-'renglon';
  insert into public.compras_retenciones_filas(identidad,datos) values(v_identidad,v_datos) on conflict(identidad) do nothing;
  select * into guardada from public.compras_retenciones_filas a where a.identidad=v_identidad for update;
  if guardada.datos is distinct from v_datos then
   if exists(select 1 from public.fin_retenciones_documentos where id=guardada.retencion_id and estado='ACTIVA')  then
    raise exception 'El comprobante % ya fue cruzado con otros datos. Revisa y anula su cruce antes de corregir.',f->>'comprobante';end if;
   update public.compras_retenciones_filas set datos=v_datos where id=guardada.id;
   insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'COMPRAS_ACTUALIZAR_RETENCION_IMPORTADA',jsonb_build_object('fila',guardada.id,'hash',p_hash,'anterior',guardada.datos,'nuevo',v_datos));
  end if;
  insert into public.compras_retenciones_archivos values(p_hash,guardada.id,(f->>'renglon')::integer,f);
 end loop;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'COMPRAS_IMPORTAR_RETENCIONES',jsonb_build_object('hash',p_hash,'archivo',p_archivo,'filas',filas,'renta',renta,'segunda',segunda));
end $$;

create function public.compras_retencion_candidato(f jsonb,c jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n text; numero text; segura boolean; actual jsonb; total numeric; error text; previo numeric; neto numeric;
begin
 n:=regexp_replace(coalesce(c->>'numero_documento',''),'[^0-9]','','g');numero:=replace(f->>'factura','-','');
 if c->>'tipo' not in('SRI','NOTA_VENTA') or not(n=numero or (length(n) between 1 and 9 and ltrim(n,'0')=ltrim(right(numero,9),'0'))) then return null;end if;
 if nullif(c->>'ruc','') is not null and c->>'ruc'<>f->>'ruc' then return null;end if;
 segura:=n=numero and c->>'ruc'=f->>'ruc' and c->>'fecha_documento'=f->>'fecha_factura';
 select to_jsonb(r) into actual from public.fin_retenciones_documentos r where r.documento_id=c->>'id' and r.estado='ACTIVA';
 total:=(f->>'renta')::numeric+(f->>'segunda')::numeric;
 select b.neto,b.pagado into neto,previo from public.fin_vw_cuentas_sin_reglas_retencion b where b.id=c->>'id';
 if c->>'neto' is null or c->>'total' is null then error:='Completa los importes de la factura.';
 elsif c->>'fecha_documento'>f->>'fecha' then error:='La retención precede a la factura.';
 elsif (c->>'observaciones') like '%Revisar coincidencia con Excel antes de programar pagos%' then error:='Resuelve primero la coincidencia Excel/SRI.';
 elsif actual->>'tipo_registro'='EMITIDA' and (replace(actual->>'comprobante','-','')<>replace(f->>'comprobante','-','') or (actual->>'total')::numeric<>total) then error:='La factura tiene otra retención emitida; revisa su detalle.';
 elsif (c->>'total')::numeric-total<previo then error:='El pago supera el neto con esta retención; requiere revisión.';
 elsif total>(c->>'total')::numeric then error:='La retención supera el total de factura.';
 end if;
 segura:=segura and ((c->>'total')::numeric-(c->>'neto')::numeric<=total);
 return jsonb_build_object('id',c->>'id','numero',c->>'numero_documento','proveedor',c->>'proveedor','fecha',c->>'fecha_documento','total',c->'total','pagado',c->'pagado','saldo',c->'saldo','retencion',c->'retencion','saldo_nuevo',greatest((c->>'total')::numeric-total-previo,0),'segura',coalesce(segura,false),'aviso',case when (c->>'total')::numeric-(c->>'neto')::numeric>total then 'El total reportado es menor que el descuento anterior; revisa el saldo resultante.' end,'error',error,'firma',md5(f::text||c::text||coalesce(actual,'null'::jsonb)::text));
end $$;
create function public.compras_consultar_retenciones(p_desde date,p_hasta date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para consultar retenciones.' using errcode='42501';end if;
 if p_desde is null or p_hasta is null or not isfinite(p_desde) or not isfinite(p_hasta) or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Selecciona un rango de hasta un año.';end if;
 with cuentas as materialized(select to_jsonb(c) datos from public.fin_vw_cuentas_por_pagar_compras c where tipo in('SRI','NOTA_VENTA')),
 registros as(select f.id,f.datos,f.retencion_id,r.estado estado_retencion,r.documento_id, (array_agg(l.archivo order by l.creado_en desc))[1] archivo from public.compras_retenciones_filas f join public.compras_retenciones_archivos a on a.fila_id=f.id join public.compras_retenciones_lotes l on l.hash=a.hash left join public.fin_retenciones_documentos r on r.id=f.retencion_id where (f.datos->>'fecha')::date between p_desde and p_hasta group by f.id,r.estado,r.documento_id)
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('candidatos',coalesce((select jsonb_agg(q.candidato order by q.candidato->>'numero') from(select public.compras_retencion_candidato(f.datos,c.datos) candidato from cuentas c where regexp_replace(c.datos->>'numero_documento','[^0-9]','','g')=replace(f.datos->>'factura','-','') or (length(regexp_replace(c.datos->>'numero_documento','[^0-9]','','g')) between 1 and 9 and ltrim(regexp_replace(c.datos->>'numero_documento','[^0-9]','','g'),'0')=ltrim(right(replace(f.datos->>'factura','-',''),9),'0'))) q where q.candidato is not null),'[]'::jsonb)) order by f.datos->>'fecha',f.datos->>'factura'),'[]'::jsonb) into resultado from registros f;
 return resultado;
end $$;

create function public.compras_cruzar_retenciones(p_operacion uuid,p_filas jsonb) returns void language plpgsql security definer set search_path='' as $$
declare fila record; f public.compras_retenciones_filas%rowtype; c public.fin_vw_cuentas_por_pagar_compras%rowtype; b public.fin_vw_cuentas_sin_reglas_retencion%rowtype; anterior public.fin_retenciones_documentos%rowtype; candidato jsonb; total numeric; descontado numeric; diferencia numeric; retencion uuid; plan public.fin_programacion_compras%rowtype; pendiente numeric; previa jsonb;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para cruzar retenciones.' using errcode='42501';end if;
 if p_operacion is null or jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) not between 1 and 100 then raise exception 'Selecciona hasta 100 retenciones.';end if;
 if (select count(distinct j->>'documento') from jsonb_array_elements(p_filas) j)<>jsonb_array_length(p_filas) or (select count(distinct j->>'fila') from jsonb_array_elements(p_filas) j)<>jsonb_array_length(p_filas) then raise exception 'No repitas factura ni retención en el cruce.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cruce_retenciones:'||p_operacion::text,0));select solicitud into previa from public.compras_retenciones_operaciones where id=p_operacion;
 if found then if previa is distinct from p_filas then raise exception 'Operación utilizada con otros datos.';end if;return;end if;
 for fila in select * from jsonb_to_recordset(p_filas) x(fila uuid,documento text,firma text) order by documento loop
  plan:=null;
  perform public.fin_bloquear_documento_compra(fila.documento);
  select * into f from public.compras_retenciones_filas where id=fila.fila for update;if not found then raise exception 'Retención no disponible.';end if;
  if f.retencion_id is not null and exists(select 1 from public.fin_retenciones_documentos where id=f.retencion_id and estado='ACTIVA') then raise exception 'La retención ya fue cruzada. Actualiza la tabla.';end if;
  select * into c from public.fin_vw_cuentas_por_pagar_compras where id=fila.documento;if not found then raise exception 'Factura no disponible.';end if;
  candidato:=public.compras_retencion_candidato(f.datos,to_jsonb(c));
  if candidato is null or candidato->>'firma' is distinct from fila.firma then raise exception 'La factura cambió. Actualiza y revisa el cruce.';end if;
  if candidato->>'error' is not null then raise exception '%',candidato->>'error';end if;
  total:=(f.datos->>'renta')::numeric+(f.datos->>'segunda')::numeric;if total<=0 then raise exception 'Este registro no tiene importe retenido.';end if;
  select * into anterior from public.fin_retenciones_documentos where documento_id=c.id and estado='ACTIVA' for update;
  if found and anterior.tipo_registro='EMITIDA' then retencion:=anterior.id;
  else
   select * into b from public.fin_vw_cuentas_sin_reglas_retencion where id=c.id;
   descontado:=case when b.origen='SRI' then 0 else b.total-b.neto end;diferencia:=total-descontado;
   if b.total is null or b.neto is null or descontado<0 or b.neto-diferencia<b.pagado then raise exception 'Revisa el neto y los pagos existentes antes de cruzar.';end if;
   if anterior.id is not null then update public.fin_retenciones_documentos set estado='ANULADA',anulado_por=auth.uid(),anulado_en=now(),motivo_anulacion='Reemplazado por comprobante del reporte contable' where id=anterior.id;end if;
   retencion:=gen_random_uuid();
   insert into public.fin_retenciones_documentos(id,documento_id,fecha,regimen,proveedor_especial,comprobante,motivo,lineas,solicitud,total,descuento,creado_por,tipo_registro,reporte_fila)
   values(retencion,c.id,(f.datos->>'fecha')::date,null,null,f.datos->>'comprobante','Cruce del reporte contable de retenciones; no es un nuevo pago bancario',jsonb_build_array(jsonb_build_object('impuesto','SEGUN_REPORTE','concepto','Total retenido reportado por Contabilidad','base',(f.datos->>'base_renta')::numeric,'valor',total)),jsonb_build_object('reporte_fila',f.id,'datos',f.datos),total,diferencia,auth.uid(),'EMITIDA',f.id);
   select * into plan from public.fin_programacion_compras where documento_id=c.id and pagado<monto for update;
   if found then pendiente:=least(plan.monto-plan.pagado,greatest(b.saldo-diferencia,0));if plan.pagado=0 and pendiente=0 then delete from public.fin_programacion_compras where documento_id=c.id and semana=plan.semana;else update public.fin_programacion_compras set monto=plan.pagado+pendiente where documento_id=c.id and semana=plan.semana;end if;end if;
  end if;
  update public.compras_retenciones_filas set retencion_id=retencion where id=f.id;
  insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'COMPRAS_CRUZAR_RETENCION',jsonb_build_object('operacion',p_operacion,'fila',f.id,'documento',c.id,'retencion',retencion,'total',total,'cuenta_anterior',to_jsonb(c),'retencion_anterior',to_jsonb(anterior),'plan_anterior',to_jsonb(plan)));
 end loop;
 insert into public.compras_retenciones_operaciones values(p_operacion,p_filas,auth.uid(),now());
end $$;
revoke all on function public.compras_importar_retenciones(text,text,jsonb),public.compras_retencion_candidato(jsonb,jsonb),public.compras_consultar_retenciones(date,date),public.compras_cruzar_retenciones(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.compras_importar_retenciones(text,text,jsonb),public.compras_consultar_retenciones(date,date),public.compras_cruzar_retenciones(uuid,jsonb) to authenticated;
commit;
