begin;
set local lock_timeout='5s';

create function public.compras_identidad_proveedor(p_texto text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(upper(translate(coalesce(p_texto,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')),'[^A-Z0-9]','','g');
$$;
create table public.compras_vinculos_excel (
 clave text primary key references public.compras_sri(clave_acceso),
 estado text not null check(estado in ('REVISION','VINCULADA','DISTINTAS')),
 revision uuid not null default gen_random_uuid(),datos_sri jsonb not null,candidatos jsonb not null,
 excel_id uuid references public.compras_excel_documentos(id),motivo text not null,
 automatico boolean not null default false,actualizado_en timestamptz not null default clock_timestamp(),responsable uuid
);
alter table public.compras_vinculos_excel enable row level security;
revoke all on public.compras_vinculos_excel from public,anon,authenticated;
grant select on public.compras_vinculos_excel to authenticated;
create policy compras_vinculos_lectura on public.compras_vinculos_excel for select to authenticated
 using((select public.compras_sri_puede()) or (select public.fin_puede_consultar_cuentas()));

-- Se conserva la identidad financiera Excel: sus netos, abonos y planes no se trasladan ni se duplican.
create function public.compras_enlazar_excel_sri(p_clave text,p_excel uuid,p_motivo text,p_automatico boolean)
returns void language plpgsql security definer set search_path='' as $$
declare e public.compras_excel_documentos%rowtype; s public.compras_sri%rowtype; v_total numeric; v_iva numeric;
begin
 select * into e from public.compras_excel_documentos where id=p_excel for update;
 if not found or e.tipo<>'FACTURA' then raise exception 'Factura Excel no disponible.'; end if;
 if e.sri_clave=p_clave then return; end if;
 if e.sri_clave is not null then raise exception 'La factura Excel ya tiene otro XML vinculado.'; end if;
 select * into s from public.compras_sri where clave_acceso=p_clave for update;
 if not found then raise exception 'XML no disponible.'; end if;
 if coalesce(s.datos->>'total','') !~ '^[0-9]+([.][0-9]{1,2})?$'
  or coalesce(s.datos->>'subtotal','') !~ '^[0-9]+([.][0-9]{1,5})?$' then raise exception 'Revisa los importes del XML.'; end if;
 v_total:=round((s.datos->>'total')::numeric,2);
 select coalesce(sum((x->>'valor')::numeric),0) into v_iva from jsonb_array_elements(s.datos->'impuestos') x where x->>'codigo'='2';
 if v_total<=0 or v_total<>round((s.datos->>'subtotal')::numeric+v_iva,2)
  or (e.total is not null and e.total<>v_total) or (e.iva is not null and e.iva<>v_iva)
  or (e.neto is not null and e.neto>v_total) then
  raise exception 'Los importes difieren. Verifica y corrige el Excel contra la factura antes de vincular.'; end if;
 if s.edicion<>'{}'::jsonb or s.abonos<>'[]'::jsonb
  or exists(select 1 from public.fin_pagos_compras where documento_id='sri:'||p_clave)
  or exists(select 1 from public.fin_programacion_compras where documento_id='sri:'||p_clave)
  or exists(select 1 from public.fin_retenciones_documentos where documento_id='sri:'||p_clave and estado='ACTIVA')
  or exists(select 1 from public.fin_anticipos_aplicaciones where factura_id='sri:'||p_clave) then
  raise exception 'El XML ya tiene cambios o movimientos financieros. Requiere conciliación antes de vincular.'; end if;
 if exists(select 1 from public.compras_excel_documentos where sri_clave=p_clave) then raise exception 'El XML ya tiene otro registro Excel vinculado.'; end if;
 update public.compras_excel_documentos set sri_clave=p_clave,numero=s.datos->>'serie',fecha=s.fecha_emision,
  total=coalesce(total,v_total),iva=coalesce(iva,v_iva),
  observaciones=observaciones||' · XML SRI vinculado; pagos Excel conservados'
   ||case when e.fecha is distinct from s.fecha_emision then ' · Fecha Excel '||coalesce(e.fecha::text,'sin fecha')||'; emisión XML '||s.fecha_emision::text else '' end
  where id=p_excel;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'COMPRAS_VINCULAR_EXCEL_SRI',
  jsonb_build_object('documento','excel:'||p_excel::text,'clave_sri',p_clave,'automatico',p_automatico,'motivo',p_motivo,
   'excel_anterior',to_jsonb(e),'sri',jsonb_build_object('datos',s.datos,'edicion',s.edicion,'abonos',s.abonos),
   'excel_nuevo',(select to_jsonb(n) from public.compras_excel_documentos n where id=p_excel)));
end $$;
revoke all on function public.compras_enlazar_excel_sri(text,uuid,text,boolean) from public,anon,authenticated;

create function public.compras_detectar_excel_sri() returns trigger language plpgsql security definer set search_path='' as $$
declare candidatos jsonb; candidato jsonb; e public.compras_excel_documentos%rowtype;
 identidad boolean; datos_validos boolean; puede_auto boolean:=false; razon text:='Coincidencia por revisar con Excel.';
 v_numero text; secuencial text; v_proveedor text; ruc text; alias_rucs text[];
begin
 if not public.compras_sri_puede() then return new; end if;
 v_numero:=regexp_replace(coalesce(new.datos->>'serie',''),'[^0-9]','','g');
 if length(v_numero)<>15 then return new; end if;
 secuencial:=ltrim(right(v_numero,9),'0'); v_proveedor:=public.compras_identidad_proveedor(new.datos->>'proveedor'); ruc:=new.datos->>'ruc';
 select jsonb_agg(jsonb_build_object('id',x.id,'numero',x.numero,'proveedor',x.proveedor,'fecha',x.fecha,
  'total',x.total,'iva',x.iva,'neto',x.neto,'pagado',x.pagado,'version',md5(to_jsonb(x)::text)) order by x.id)
 into candidatos from (select b.* from public.compras_excel_documentos b
  where b.tipo='FACTURA' and b.sri_clave is null and (
   regexp_replace(b.numero,'[^0-9]','','g')=v_numero or
   (length(regexp_replace(b.numero,'[^0-9]','','g')) between 1 and 9
     and ltrim(regexp_replace(b.numero,'[^0-9]','','g'),'0')=secuencial))
  order by (public.compras_identidad_proveedor(b.proveedor)=v_proveedor) desc,(b.fecha=new.fecha_emision) desc,b.id limit 50) x;
 if candidatos is null then return new; end if;
 if jsonb_array_length(candidatos)=1 then
  candidato:=candidatos->0;
  select * into e from public.compras_excel_documentos where id=(candidato->>'id')::uuid;
  select array_agg(distinct s.datos->>'ruc') into alias_rucs
   from public.compras_excel_documentos a join public.compras_sri s on s.clave_acceso=a.sri_clave
   where public.compras_identidad_proveedor(a.proveedor)=public.compras_identidad_proveedor(e.proveedor)
    and s.datos->>'ruc' ~ '^[0-9]{13}$';
  identidad:=case when cardinality(alias_rucs)>0 then cardinality(alias_rucs)=1 and alias_rucs[1]=ruc
   else length(v_proveedor)>=8 and v_proveedor=public.compras_identidad_proveedor(e.proveedor) end;
  datos_validos:=ruc ~ '^[0-9]{13}$' and substring(new.clave_acceso,11,13)=ruc
   and substring(new.clave_acceso,25,15)=v_numero and to_char(new.fecha_emision,'DDMMYYYY')=left(new.clave_acceso,8);
  if coalesce(identidad,false) and coalesce(datos_validos,false) and e.fecha=new.fecha_emision
   and coalesce(new.datos->>'total','') ~ '^[0-9]+([.][0-9]{1,2})?$' then
   puede_auto:=e.total=(new.datos->>'total')::numeric and e.total>0;
  end if;
  if length(regexp_replace(e.numero,'[^0-9]','','g'))<15 and exists(select 1 from public.compras_sri s
   where s.clave_acceso<>new.clave_acceso and s.datos->>'ruc'=ruc
    and right(regexp_replace(s.datos->>'serie','[^0-9]','','g'),9)=right(v_numero,9)) then
   puede_auto:=false; razon:='Secuencial repetido en otra serie del mismo proveedor; revisar número completo.';
  end if;
  if puede_auto then
   -- En un trigger de inserción el XML ya está bloqueado: no esperar otro bloqueo de Excel.
   if pg_try_advisory_xact_lock(hashtextextended('fin_compras:excel:'||e.id::text,0))
    and pg_try_advisory_xact_lock(hashtextextended('fin_compras:sri:'||new.clave_acceso,0)) then
    begin
     select * into e from public.compras_excel_documentos where id=e.id for update nowait;
     if md5(to_jsonb(e)::text)<>candidato->>'version' then raise exception 'El Excel cambió durante la importación.'; end if;
     perform public.compras_enlazar_excel_sri(new.clave_acceso,e.id,'Proveedor identificado, número, fecha y total coincidentes.',true);
     insert into public.compras_vinculos_excel(clave,estado,datos_sri,candidatos,excel_id,motivo,automatico,responsable)
      values(new.clave_acceso,'VINCULADA',jsonb_build_object('numero',new.datos->>'serie','proveedor',new.datos->>'proveedor','ruc',ruc,'fecha',new.fecha_emision,'total',new.datos->>'total'),
       candidatos,e.id,'Vinculación automática; pagos Excel conservados.',true,auth.uid());
     return new;
    exception when lock_not_available or raise_exception then razon:=sqlerrm;
    end;
   else razon:='Documento ocupado; revisar la vinculación cuando termine la operación en curso.';
   end if;
  elsif razon='Coincidencia por revisar con Excel.' then razon:='Confirmar proveedor, fecha e importes: el secuencial por sí solo no identifica una factura.';
  end if;
 else razon:='Hay varias facturas Excel con ese número; selecciona la correcta después de verificarla.';
 end if;
 insert into public.compras_vinculos_excel(clave,estado,datos_sri,candidatos,motivo,responsable)
 values(new.clave_acceso,'REVISION',jsonb_build_object('numero',new.datos->>'serie','proveedor',new.datos->>'proveedor','ruc',ruc,'fecha',new.fecha_emision,'total',new.datos->>'total'),candidatos,razon,auth.uid());
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'COMPRAS_VINCULO_EXCEL_PENDIENTE',
  jsonb_build_object('clave_sri',new.clave_acceso,'motivo',razon,'candidatos',candidatos));
 return new;
end $$;
revoke all on function public.compras_detectar_excel_sri() from public,anon,authenticated;
create trigger compras_detectar_excel after insert on public.compras_sri for each row execute function public.compras_detectar_excel_sri();

create function public.compras_resolver_vinculo_excel(p_clave text,p_revision uuid,p_excel uuid,p_motivo text,p_confirmado boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v public.compras_vinculos_excel%rowtype; e public.compras_excel_documentos%rowtype; candidato jsonb;
begin
 if not public.compras_sri_puede() or not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
  raise exception 'Necesitas permiso de Facturas SRI y Cuentas por pagar para resolver la coincidencia.' using errcode='42501'; end if;
 if p_revision is null or p_confirmado is not true or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Confirma la revisión e indica el motivo.'; end if;
 if p_excel is not null then perform public.fin_bloquear_documento_compra('excel:'||p_excel::text); end if;
 perform public.fin_bloquear_documento_compra('sri:'||p_clave);
 select * into v from public.compras_vinculos_excel where clave=p_clave for update;
 if not found then raise exception 'No hay coincidencia pendiente.'; end if;
 if v.revision<>p_revision then raise exception 'La revisión cambió; actualiza la lista.'; end if;
 if v.estado<>'REVISION' then
  if (v.estado='VINCULADA' and v.excel_id=p_excel) or (v.estado='DISTINTAS' and p_excel is null) then return; end if;
  raise exception 'La coincidencia ya fue resuelta.';
 end if;
 if p_excel is not null then
  select x into candidato from jsonb_array_elements(v.candidatos) x where x->>'id'=p_excel::text;
  if candidato is null then raise exception 'Elige uno de los registros propuestos.'; end if;
  select * into e from public.compras_excel_documentos where id=p_excel;
  if md5(to_jsonb(e)::text) is distinct from candidato->>'version' then
   raise exception 'El Excel cambió. Actualiza la coincidencia antes de confirmar.'; end if;
  perform public.compras_enlazar_excel_sri(p_clave,p_excel,p_motivo,false);
 end if;
 update public.compras_vinculos_excel set estado=case when p_excel is null then 'DISTINTAS' else 'VINCULADA' end,
  excel_id=p_excel,motivo=btrim(p_motivo),responsable=auth.uid(),automatico=false,actualizado_en=clock_timestamp() where clave=p_clave;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'COMPRAS_RESOLVER_VINCULO_EXCEL',
  jsonb_build_object('clave_sri',p_clave,'excel_id',p_excel,'motivo',p_motivo,'anterior',to_jsonb(v)));
end $$;
revoke all on function public.compras_resolver_vinculo_excel(text,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.compras_resolver_vinculo_excel(text,uuid,uuid,text,boolean) to authenticated;

create function public.compras_refrescar_vinculo_excel(p_clave text,p_revision uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.compras_vinculos_excel%rowtype; nuevos jsonb;
begin
 if not public.compras_sri_puede() or not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
  raise exception 'Necesitas permiso de Facturas SRI y Cuentas por pagar.' using errcode='42501'; end if;
 perform public.fin_bloquear_documento_compra('sri:'||p_clave);
 select * into v from public.compras_vinculos_excel where clave=p_clave for update;
 if not found or p_revision is null or v.estado<>'REVISION' or v.revision<>p_revision then raise exception 'Actualiza la lista de coincidencias.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'numero',e.numero,'proveedor',e.proveedor,'fecha',e.fecha,
  'total',e.total,'iva',e.iva,'neto',e.neto,'pagado',e.pagado,'version',md5(to_jsonb(e)::text)) order by e.id),'[]'::jsonb)
 into nuevos from public.compras_excel_documentos e where e.sri_clave is null
  and e.id in(select (x->>'id')::uuid from jsonb_array_elements(v.candidatos) x);
 update public.compras_vinculos_excel set candidatos=nuevos,revision=gen_random_uuid(),actualizado_en=clock_timestamp(),responsable=auth.uid() where clave=p_clave;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'COMPRAS_REFRESCAR_VINCULO_EXCEL',jsonb_build_object('clave_sri',p_clave,'anterior',to_jsonb(v),'candidatos',nuevos));
end $$;
revoke all on function public.compras_refrescar_vinculo_excel(text,uuid) from public,anon,authenticated;
grant execute on function public.compras_refrescar_vinculo_excel(text,uuid) to authenticated;

-- La revisión no inventa saldos ni permite pagar dos veces mientras se decide la identidad.
create function public.compras_proteger_pago_vinculo() returns trigger language plpgsql security definer set search_path='' as $$
declare v_clave text; v_estado text;
begin
 if tg_table_name='compras_sri' then
  if new.abonos is not distinct from old.abonos then return new; end if;
  v_clave:=new.clave_acceso;
 else
  if not starts_with(new.documento_id,'sri:') then return new; end if;
  v_clave:=substr(new.documento_id,5);
 end if;
 select v.estado into v_estado from public.compras_vinculos_excel v where v.clave=v_clave;
 if v_estado='REVISION' then raise exception 'Revisa la coincidencia con Excel en Facturas SRI antes de programar o pagar.'; end if;
 if v_estado='VINCULADA' then raise exception 'La factura ya está vinculada al Excel. Utiliza el documento consolidado.'; end if;
 return new;
end $$;
revoke all on function public.compras_proteger_pago_vinculo() from public,anon,authenticated;
create trigger compras_vinculo_programacion before insert or update on public.fin_programacion_compras for each row execute function public.compras_proteger_pago_vinculo();
create trigger compras_vinculo_pago before insert or update on public.fin_pagos_compras for each row execute function public.compras_proteger_pago_vinculo();
create trigger compras_vinculo_abono_sri before update of abonos on public.compras_sri for each row execute function public.compras_proteger_pago_vinculo();

create view public.fin_vw_cuentas_sin_revision_vinculos with(security_invoker=true) as select * from public.fin_vw_cuentas_por_pagar_compras;
do $$ begin execute 'create or replace view public.fin_vw_cuentas_sin_revision_vinculos with(security_invoker=true) as '||
 pg_get_viewdef('public.fin_vw_cuentas_por_pagar_compras'::regclass,true); end $$;
revoke all on public.fin_vw_cuentas_sin_revision_vinculos from public,anon,authenticated;
grant select on public.fin_vw_cuentas_sin_revision_vinculos to authenticated;
create or replace view public.fin_vw_cuentas_por_pagar_compras with(security_invoker=true) as
select c.id,c.tipo,c.origen,c.fecha_documento,c.numero_documento,c.proveedor,c.concepto,c.subtotal,c.iva,c.retencion,c.total,c.neto,
 case when v.estado='REVISION' then concat_ws(' · ',c.observaciones,'Revisar coincidencia con Excel antes de programar pagos') else c.observaciones end as observaciones,
 c.ruc,c.pagos,c.pagado,c.saldo,c.semana_activa,c.busqueda
from public.fin_vw_cuentas_sin_revision_vinculos c left join public.compras_vinculos_excel v on c.id='sri:'||v.clave;
commit;
