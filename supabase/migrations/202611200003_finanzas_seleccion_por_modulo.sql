begin;
set local lock_timeout='5s';

create or replace function public.fin_puede_modulo(p_ruta text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_ruta in ('Pagos y Finanzas · Cuentas por Pagar','Pagos y Finanzas · Roles de pago','Pagos y Finanzas · Pagos semanales')
    and exists(select 1 from public.app_profiles p where p.user_id=auth.uid() and p.activo
      and coalesce((select u.permitido from public.app_user_permissions u
        where u.user_id=p.user_id and u.pantalla=p_ruta),p.rol='ADMINISTRADOR' or public.app_puede(p_ruta)));
$$;
create or replace function public.fin_puede_consultar_cuentas()
returns boolean language sql stable security definer set search_path='' as $$
  select public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar')
    or public.fin_puede_modulo('Pagos y Finanzas · Pagos semanales');
$$;
create or replace function public.fin_consultar_programaciones()
returns setof public.fin_programacion_compras
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Pagos semanales') then
    raise exception 'No tienes permiso para Pagos semanales.' using errcode='42501';
  end if;
  return query select * from public.fin_programacion_compras;
end;
$$;

do $programacion$
declare definicion text;
begin
  select pg_get_functiondef('public.fin_programar_compras(date,jsonb)'::regprocedure) into definicion;
  if position('if not coalesce(public.app_es_admin(), false) then' in definicion)>0 then
    execute replace(definicion,'if not coalesce(public.app_es_admin(), false) then',
      'if not coalesce(public.fin_puede_consultar_cuentas(), false) then');
  elsif position('public.fin_puede_consultar_cuentas()' in definicion)=0 then
    raise exception 'Revisar el contrato de programación.';
  end if;
  select pg_get_functiondef('public.fin_quitar_compra_programada(date,text)'::regprocedure) into definicion;
  if position('if not coalesce(public.app_es_admin(), false) then' in definicion)>0 then
    execute replace(definicion,'if not coalesce(public.app_es_admin(), false) then',
      'if not coalesce(public.fin_puede_modulo(''Pagos y Finanzas · Pagos semanales''), false) then');
  elsif position('public.fin_puede_modulo(' in definicion)=0 then
    raise exception 'Revisar el contrato de retiro de programación.';
  end if;
end $programacion$;

do $pagos$
declare definicion text;
begin
  select pg_get_functiondef('public.fin_pagar_compra(text,uuid,numeric,date,text,date,boolean)'::regprocedure) into definicion;
  if position('p_semana is not null and not coalesce(public.app_es_admin(),false)' in definicion)>0 then
    definicion:=replace(definicion,'p_semana is not null and not coalesce(public.app_es_admin(),false)',
      'p_semana is not null and not coalesce(public.fin_puede_modulo(''Pagos y Finanzas · Pagos semanales''),false)');
  elsif position('p_semana is not null and not coalesce(public.fin_puede_modulo(' in definicion)=0 then
    raise exception 'Revisar el contrato de pago semanal.';
  end if;
  if position('p_semana is null and not public.fin_puede_modulo(' in definicion)=0 then
    if position('p_referencia := btrim(p_referencia);' in definicion)=0 then raise exception 'Revisar el contrato del pago directo.'; end if;
    definicion:=replace(definicion,'p_referencia := btrim(p_referencia);',
      'if p_semana is null and not public.fin_puede_modulo(''Pagos y Finanzas · Cuentas por Pagar'') then
        raise exception ''No tienes permiso para registrar pagos desde Cuentas por pagar.'' using errcode=''42501'';
      end if;
      p_referencia := btrim(p_referencia);');
  end if;
  execute definicion;
  select pg_get_functiondef('public.compras_sri_abonar(text,uuid,numeric,date,text)'::regprocedure) into definicion;
  if position('if not public.app_es_admin() and (' in definicion)>0 then
    definicion:=replace(definicion,'if not public.app_es_admin() and (',
      'if not public.fin_puede_modulo(''Pagos y Finanzas · Pagos semanales'') and (');
  elsif position('if not public.fin_puede_modulo(' in definicion)=0 then
    raise exception 'Revisar el contrato de abonos SRI.';
  end if;
  if position('No tienes permiso para abonar esta factura desde esta entrada.' in definicion)=0 then
    if position('select * into compra from public.compras_sri where clave_acceso = p_clave for update;' in definicion)=0 then
      raise exception 'Revisar el bloqueo del abono SRI.';
    end if;
    definicion:=replace(definicion,'select * into compra from public.compras_sri where clave_acceso = p_clave for update;',
      'if not public.fin_puede_modulo(''Pagos y Finanzas · Cuentas por Pagar'') and not (
        public.fin_puede_modulo(''Pagos y Finanzas · Pagos semanales'') and exists(
          select 1 from public.fin_programacion_compras where documento_id=''sri:''||p_clave and pagado<monto)
      ) then raise exception ''No tienes permiso para abonar esta factura desde esta entrada.'' using errcode=''42501''; end if;
      select * into compra from public.compras_sri where clave_acceso = p_clave for update;');
  end if;
  execute definicion;
end $pagos$;
revoke all on function public.fin_consultar_programaciones() from public,anon,authenticated;
grant execute on function public.fin_consultar_programaciones() to authenticated;
commit;
