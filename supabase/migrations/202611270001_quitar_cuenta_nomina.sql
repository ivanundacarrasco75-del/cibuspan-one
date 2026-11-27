begin;
set local lock_timeout='5s';
-- Conserva el documento original y libera la combinación empleado/mes/concepto
-- para poder repetir la carga. No elimina ni modifica pagos o programaciones.
create table public.fin_nomina_obligaciones_retiradas (
 operacion uuid primary key,
 obligacion_id uuid not null unique,
 datos jsonb not null,
 motivo text not null check(char_length(motivo) between 5 and 500),
 responsable uuid not null,
 creado_en timestamptz not null default now()
);
alter table public.fin_nomina_obligaciones_retiradas enable row level security;
revoke all on public.fin_nomina_obligaciones_retiradas from public,anon,authenticated;

create function public.fin_quitar_cuenta_nomina(p_operacion uuid,p_documento text,p_monto numeric,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare n public.fin_nomina_obligaciones%rowtype; anterior public.fin_nomina_obligaciones_retiradas%rowtype; persona uuid;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
  raise exception 'No tienes permiso para quitar cuentas de nómina.' using errcode='42501';
 end if;
 p_motivo:=btrim(p_motivo);
 if p_operacion is null or p_documento is null or p_documento!~'^nomina:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  or p_monto is null or not(p_monto>0 and p_monto<1000000000 and p_monto=round(p_monto,2))
  or char_length(coalesce(p_motivo,'')) not between 5 and 500 then
  raise exception 'Revisa la cuenta de nómina y explica el motivo para quitarla.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('fin_quitar_nomina:'||p_operacion::text,0));
 select * into anterior from public.fin_nomina_obligaciones_retiradas where operacion=p_operacion;
 if found then
  if 'nomina:'||anterior.obligacion_id::text<>p_documento or (anterior.datos->>'monto')::numeric<>p_monto or anterior.motivo<>p_motivo then
   raise exception 'Esta operación ya se utilizó con otros datos.';
  end if;
  return;
 end if;
 select empleado_id into persona from public.fin_nomina_obligaciones where id=substring(p_documento from 8)::uuid;
 if not found then raise exception 'La cuenta ya no está disponible. Actualiza Cuentas por pagar.';end if;
 -- La carga de nómina bloquea primero a la persona. Se conserva ese orden para
 -- evitar interbloqueos con una corrección de monto o una carga simultánea.
 perform 1 from public.fin_nomina_empleados where id=persona for update;
 perform public.fin_bloquear_documento_compra(p_documento);
 select * into n from public.fin_nomina_obligaciones where id=substring(p_documento from 8)::uuid for update;
 if not found then raise exception 'La cuenta ya no está disponible. Actualiza Cuentas por pagar.';end if;
 if n.monto is distinct from p_monto then raise exception 'La cuenta cambió de monto. Actualiza antes de quitarla.';end if;
 if exists(select 1 from public.fin_pagos_compras where documento_id=p_documento) then
  raise exception 'Esta cuenta tiene pagos registrados y no se puede quitar. Revisa su detalle.';
 end if;
 if exists(select 1 from public.fin_programacion_compras where documento_id=p_documento) then
  raise exception 'Quita primero esta cuenta de Pagos semanales y luego vuelve a intentarlo.';
 end if;
 insert into public.fin_nomina_obligaciones_retiradas(operacion,obligacion_id,datos,motivo,responsable)
 values(p_operacion,n.id,to_jsonb(n),p_motivo,auth.uid());
 delete from public.fin_nomina_obligaciones where id=n.id;
 insert into public.app_audit_log(actor_user_id,accion,detalle)
 values(auth.uid(),'FIN_NOMINA_QUITAR_CUENTA',jsonb_build_object('operacion',p_operacion,'documento',p_documento,'anterior',to_jsonb(n),'motivo',p_motivo));
end $$;
revoke all on function public.fin_quitar_cuenta_nomina(uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.fin_quitar_cuenta_nomina(uuid,text,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
