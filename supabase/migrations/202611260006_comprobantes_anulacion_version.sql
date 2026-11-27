begin;
set local lock_timeout='5s';
-- Vincula la anulación a la operación revisada. Un reintento nunca anula un cruce posterior.
drop function public.fin_cxc_anular_comprobante(uuid,text);
create function public.fin_cxc_anular_comprobante(p_id uuid,p_operacion uuid,p_version uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.fin_cxc_comprobantes_pago%rowtype;r record;deposito_id uuid;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para anular el comprobante.' using errcode='42501';end if;
 if p_id is null or p_operacion is null or p_version is null or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Revisa la conciliación a anular y su motivo.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cxc_documento_pago:'||p_id::text,0));
 select * into d from public.fin_cxc_comprobantes_pago where id=p_id for update;
 if not found then raise exception 'Documento no disponible.';end if;
 if exists(select 1 from public.app_audit_log a where a.accion='FIN_CXC_ANULAR_COMPROBANTE' and a.detalle->>'documento'=p_id::text and a.detalle->>'operacion'=p_operacion::text and a.detalle->>'version'=p_version::text) then return;end if;
 if d.operacion is distinct from p_operacion or d.version is distinct from p_version then raise exception 'La conciliación cambió. Actualiza antes de anular.';end if;
 select a.deposito into deposito_id from public.fin_cxc_aplicaciones a where a.operacion=d.operacion and not a.anulada and a.deposito is not null limit 1;
 if deposito_id is not null then perform pg_advisory_xact_lock(hashtextextended('cxc_deposito:'||deposito_id::text,0));end if;
 for r in select comprobante from public.fin_cxc_aplicaciones where operacion=d.operacion and not anulada order by comprobante loop
  perform pg_advisory_xact_lock(hashtextextended('cxc_factura:'||r.comprobante,0));
 end loop;
 update public.fin_cxc_aplicaciones set anulada=true where operacion=d.operacion;
 update public.fin_cxc_descuentos_documento set anulada=true where operacion=d.operacion;
 update public.fin_cxc_comprobantes_pago set operacion=null,version=gen_random_uuid() where id=d.id;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_ANULAR_COMPROBANTE',jsonb_build_object('documento',d.id,'operacion',d.operacion,'version',d.version,'motivo',p_motivo));
end $$;
revoke all on function public.fin_cxc_anular_comprobante(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fin_cxc_anular_comprobante(uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
