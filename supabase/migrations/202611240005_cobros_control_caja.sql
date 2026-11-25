begin;
set local lock_timeout='5s';
-- El comprobante lo gestiona Contabilidad. Se conserva cualquier soporte previo.
alter table public.fin_cxc_aplicaciones drop constraint fin_cxc_aplicaciones_check2;
alter table public.fin_cxc_aplicaciones add constraint fin_cxc_retencion_soporte_opcional check (
 retencion=0 or (btrim(referencia_retencion)='' and fecha_retencion is null)
 or (btrim(referencia_retencion)<>'' and fecha_retencion is not null and isfinite(fecha_retencion))
);
drop index public.fin_cxc_retencion_unica;
create unique index fin_cxc_retencion_unica on public.fin_cxc_aplicaciones(comprobante,upper(btrim(referencia_retencion)))
 where not anulada and retencion>0 and btrim(referencia_retencion)<>'';
create or replace function public.fin_cxc_conciliar(p_id uuid,p_deposito uuid,p_filas jsonb,p_motivo text) returns void
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
  if fila.retencion>0 and ((btrim(coalesce(fila.referencia_retencion,''))='')<>(fila.fecha_retencion is null) or (fila.fecha_retencion is not null and not isfinite(fila.fecha_retencion))) then raise exception 'Los datos contables opcionales deben incluir número y fecha válidos, o dejar ambos vacíos.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cxc_factura:'||fila.comprobante,0));
  perform 1 from public.com_ventas_detalle where comprobante=fila.comprobante order by id for share;
  select * into s from public.fin_cxc_saldos where comprobante=fila.comprobante;
  if not found or not s.verificada or s.huella is distinct from fila.huella or s.revision is distinct from fila.revision or s.saldo is distinct from fila.saldo then raise exception 'La factura cambió o falta confirmar su total. Actualiza los saldos.'; end if;
  if fila.efectivo+fila.retencion>s.saldo then raise exception 'El cobro más la retención supera el saldo de la factura.'; end if;
  insert into public.fin_cxc_aplicaciones(id,operacion,comprobante,deposito,efectivo,retencion,referencia_retencion,fecha_retencion,creado_por)
   values(gen_random_uuid(),p_id,fila.comprobante,p_deposito,fila.efectivo,fila.retencion,case when fila.retencion>0 then btrim(coalesce(fila.referencia_retencion,'')) else '' end,case when fila.retencion>0 then fila.fecha_retencion end,auth.uid());
 end loop;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_CONCILIAR',solicitud||jsonb_build_object('operacion',p_id,'alcance','CONTROL_CAJA','retenciones_sin_comprobante',(select count(*) from jsonb_to_recordset(p_filas) x(retencion numeric,referencia_retencion text) where x.retencion>0 and btrim(coalesce(x.referencia_retencion,''))='')));
end $$;

revoke all on function public.fin_cxc_conciliar(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.fin_cxc_conciliar(uuid,uuid,jsonb,text) to authenticated;
commit;
