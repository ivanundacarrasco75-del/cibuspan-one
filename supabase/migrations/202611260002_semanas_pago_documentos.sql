begin;
set local lock_timeout='5s';
create table public.fin_semanas_pago_documentos(documento_id text primary key,semana date check(semana is null or (isfinite(semana) and extract(isodow from semana)=1)),modificado_por uuid not null,modificado_en timestamptz not null default now());
create table public.fin_semanas_pago_operaciones(id uuid primary key,solicitud jsonb not null,creado_por uuid not null,creado_en timestamptz not null default now());
alter table public.fin_semanas_pago_documentos enable row level security;
alter table public.fin_semanas_pago_operaciones enable row level security;
revoke all on public.fin_semanas_pago_documentos,public.fin_semanas_pago_operaciones from public,anon,authenticated;
create function public.fin_clave_semana_pago(p_documento text) returns text language plpgsql stable security definer set search_path='' as $$
declare clave text; begin
 if starts_with(p_documento,'excel:') then select sri_clave into clave from public.compras_excel_documentos where id=substr(p_documento,7)::uuid;return case when clave is null then p_documento else 'sri:'||clave end;end if;
 return p_documento;
end $$;
create function public.fin_puede_semana_pago(p_documento text,p_editar boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$
declare clase text; begin
 if starts_with(p_documento,'sri:') then if not exists(select 1 from public.compras_sri where clave_acceso=substr(p_documento,5)) then return false;end if;
 elsif starts_with(p_documento,'excel:') then select tipo into clase from public.compras_excel_documentos where id=substr(p_documento,7)::uuid;if not found then return false;end if;
 elsif starts_with(p_documento,'manual:') then select tipo into clase from public.compras_documentos_manuales where id=substr(p_documento,8)::uuid;if not found then return false;end if;
 elsif starts_with(p_documento,'anticipo:') then if not exists(select 1 from public.fin_anticipos where id=substr(p_documento,10)::uuid) then return false;end if;
 else return false;end if;
 if public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then return true;end if;
 if not p_editar and public.fin_puede_modulo('Pagos y Finanzas · Pagos semanales') then return true;end if;
 if starts_with(p_documento,'sri:') or clase='FACTURA' then return public.compras_sri_puede();end if;
 if clase is not null then return public.app_puede(case when clase='NOTA_VENTA' then 'Compras · Notas de venta' else 'Compras · Gastos no deducibles' end) or public.app_puede('Administración');end if;
 return false;
end $$;
create function public.fin_fecha_semana_pago(p_documento text) returns date language plpgsql stable security definer set search_path='' as $$
declare clave text; resultado date; begin
 if not public.fin_puede_semana_pago(p_documento,false) then return null;end if;
 clave:=public.fin_clave_semana_pago(p_documento);
 select s.semana into resultado from public.fin_semanas_pago_documentos s where s.documento_id in(clave,p_documento) or (starts_with(clave,'sri:') and s.documento_id in(select 'excel:'||id::text from public.compras_excel_documentos where sri_clave=substr(clave,5)))
 order by (s.documento_id=clave) desc,(s.documento_id=p_documento) desc,s.modificado_en desc limit 1;
 return resultado;
end $$;
create function public.fin_consultar_semanas_pago(p_documentos text[]) returns table(documento_id text,semana_pago date) language plpgsql stable security definer set search_path='' as $$ begin
 if coalesce(cardinality(p_documentos),0)>500 then raise exception 'Consulta hasta 500 documentos.';end if;
 if not (public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') or public.fin_puede_modulo('Pagos y Finanzas · Pagos semanales') or public.compras_sri_puede() or public.app_puede('Compras · Notas de venta') or public.app_puede('Compras · Gastos no deducibles') or public.app_puede('Administración')) then raise exception 'No tienes permiso para consultar semanas de pago.' using errcode='42501';end if;
 return query select d,public.fin_fecha_semana_pago(d) from unnest(p_documentos) d;
end $$;
create function public.fin_guardar_semana_pago(p_operacion uuid,p_documento text,p_semana date,p_anterior date) returns void language plpgsql security definer set search_path='' as $$
declare clave text; semana date; previa jsonb; solicitud jsonb; anterior date; begin
 if not public.fin_puede_semana_pago(p_documento,true) then raise exception 'No tienes permiso para editar la semana de este documento.' using errcode='42501';end if;
 if p_operacion is null or (p_semana is not null and not isfinite(p_semana)) then raise exception 'Revisa la semana de pago.';end if;
 clave:=public.fin_clave_semana_pago(p_documento);semana:=case when p_semana is null then null else p_semana-(extract(isodow from p_semana)::integer-1) end;
 solicitud:=jsonb_build_object('documento',p_documento,'semana',semana);
 perform pg_advisory_xact_lock(hashtextextended('fin_semana_operacion:'||p_operacion::text,0));
 select o.solicitud into previa from public.fin_semanas_pago_operaciones o where id=p_operacion;
 if found then if previa is distinct from solicitud then raise exception 'Operación utilizada con otros datos.';end if;return;end if;
 perform pg_advisory_xact_lock(hashtextextended('fin_semana_documento:'||clave,0));
 anterior:=public.fin_fecha_semana_pago(p_documento);
 if anterior is distinct from p_anterior then raise exception 'La semana cambió. Actualiza antes de guardar.';end if;
 insert into public.fin_semanas_pago_documentos(documento_id,semana,modificado_por) values(clave,semana,auth.uid()) on conflict(documento_id) do update set semana=excluded.semana,modificado_por=auth.uid(),modificado_en=clock_timestamp();
 insert into public.fin_semanas_pago_operaciones values(p_operacion,solicitud,auth.uid(),now());
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_SEMANA_PAGO_EDITAR',jsonb_build_object('operacion',p_operacion,'documento',p_documento,'clave',clave,'anterior',anterior,'semana',semana));
end $$;
-- Añade un campo al final; conserva todas las columnas y el OID de la consulta.
do $$ declare definicion text;begin
 definicion:=regexp_replace(pg_get_viewdef('public.fin_vw_cuentas_por_pagar_compras'::regclass,true),';\s*$','');
 execute 'create or replace view public.fin_vw_cuentas_por_pagar_compras with(security_invoker=true) as select c.*,public.fin_fecha_semana_pago(c.id) as semana_pago from ('||definicion||') c';
end $$;
revoke all on function public.fin_clave_semana_pago(text),public.fin_puede_semana_pago(text,boolean),public.fin_fecha_semana_pago(text),public.fin_consultar_semanas_pago(text[]),public.fin_guardar_semana_pago(uuid,text,date,date) from public,anon,authenticated;
grant execute on function public.fin_fecha_semana_pago(text),public.fin_consultar_semanas_pago(text[]),public.fin_guardar_semana_pago(uuid,text,date,date) to authenticated;
commit;
