begin;
set local lock_timeout='5s';
set local search_path='';

create or replace function public.fin_puede_modulo(p_ruta text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_ruta in ('Pagos y Finanzas · Cuentas por Pagar','Pagos y Finanzas · Roles de pago')
    and exists(select 1 from public.app_profiles p where p.user_id=auth.uid() and p.activo
      and coalesce((select u.permitido from public.app_user_permissions u
        where u.user_id=p.user_id and u.pantalla=p_ruta),p.rol='ADMINISTRADOR' or public.app_puede(p_ruta)));
$$;

create or replace function public.fin_puede_consultar_cuentas()
returns boolean language sql stable security definer set search_path='' as $$
  select public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') or public.app_es_admin();
$$;

-- Proyección financiera de las fuentes de Compras para la consulta autorizada.
create or replace view public.fin_vw_documentos_para_cuentas with(security_invoker=true) as
select 'manual:'||m.id::text as id,m.tipo,date_trunc('month',m.fecha_documento::timestamp)::date as periodo,
  m.fecha_documento,m.numero_documento,m.proveedor,m.concepto,m.subtotal,m.iva,m.retencion,m.total,
  m.observaciones,null::text as cuenta_codigo,'MANUAL_COMPRAS'::text as origen
from public.compras_documentos_manuales m
union all
select 'contable:'||d.id::text,t.tipo,d.periodo::date,d.fecha_documento::date,d.numero_documento::text,
  d.proveedor::text,d.concepto::text,null::numeric,null::numeric,null::numeric,d.valor::numeric,
  d.observaciones::text,d.cuenta_codigo::text,'CLASIFICACION_GASTOS'::text
from public.fin_vw_resultado_clasificacion_detalle d
cross join lateral(values ('NOTA_VENTA',d.tipo_documento::text='NOTA_VENTA'),
  ('NO_DEDUCIBLE',d.cuenta_codigo::text='6.2.01.2.14.31')) t(tipo,aplica)
where t.aplica and (select public.fin_puede_consultar_cuentas());
revoke all on public.fin_vw_documentos_para_cuentas from public,anon,authenticated;
grant select on public.fin_vw_documentos_para_cuentas to authenticated;

-- Solo cambian las condiciones de acceso de las vistas propias de Finanzas.
do $vistas$
declare nombre text; definicion text;
begin
  foreach nombre in array array['fin_vw_compras_anteriores','fin_vw_compras_sin_nomina','fin_vw_cuentas_por_pagar_compras']
  loop
    select pg_get_viewdef(to_regclass('public.'||nombre),true) into definicion;
    if position('public.app_es_admin()' in definicion)=0 then
      if position('public.fin_puede_consultar_cuentas()' in definicion)>0 then continue; end if;
      raise exception 'Revisar el contrato de la vista %.',nombre;
    end if;
    definicion:=replace(definicion,'public.app_es_admin()','public.fin_puede_consultar_cuentas()');
    definicion:=replace(definicion,'public.compras_vw_documentos','public.fin_vw_documentos_para_cuentas AS compras_vw_documentos');
    execute format('create or replace view public.%I with(security_invoker=true) as %s',nombre,definicion);
  end loop;
end $vistas$;

create or replace function public.fin_consultar_cuentas()
returns setof public.fin_vw_cuentas_por_pagar_compras
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.fin_puede_consultar_cuentas() then raise exception 'No tienes permiso para Cuentas por pagar.' using errcode='42501'; end if;
  return query select * from public.fin_vw_cuentas_por_pagar_compras;
end;
$$;
create or replace function public.fin_consultar_personal()
returns setof public.fin_nomina_empleados
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Roles de pago') then raise exception 'No tienes permiso para Roles de pago.' using errcode='42501'; end if;
  return query select * from public.fin_nomina_empleados;
end;
$$;
create or replace function public.fin_consultar_roles_importados()
returns setof public.fin_nomina_importaciones
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Roles de pago') then raise exception 'No tienes permiso para Roles de pago.' using errcode='42501'; end if;
  return query select * from public.fin_nomina_importaciones;
end;
$$;
create or replace function public.fin_consultar_resumen_roles()
returns setof public.fin_vw_nomina_mensual_area
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.fin_puede_modulo('Pagos y Finanzas · Roles de pago') then raise exception 'No tienes permiso para Roles de pago.' using errcode='42501'; end if;
  return query select * from public.fin_vw_nomina_mensual_area;
end;
$$;

do $funciones$
declare firma text; definicion text;
begin
  foreach firma in array array['public.fin_guardar_personal(uuid,text,text,boolean,text)',
    'public.fin_importar_nomina_pdf(date,text,text,jsonb)',
    'public.fin_cargar_nomina_cuentas(date,text,jsonb)']
  loop
    select pg_get_functiondef(firma::regprocedure) into definicion;
    if position('public.app_puede_alguna(array[''Administración''])' in definicion)>0 then
      definicion:=replace(definicion,'public.app_puede_alguna(array[''Administración''])',
        'public.fin_puede_modulo(''Pagos y Finanzas · Roles de pago'')');
    elsif position('public.app_es_admin()' in definicion)>0 then
      definicion:=replace(definicion,'public.app_es_admin()','public.fin_puede_modulo(''Pagos y Finanzas · Roles de pago'')');
    elsif position('public.fin_puede_modulo(' in definicion)=0 then
      raise exception 'Revisar el contrato de %.',firma;
    end if;
    execute definicion;
  end loop;
  foreach firma in array array['public.fin_pagar_compra(text,uuid,numeric,date,text,date,boolean)',
    'public.compras_sri_abonar(text,uuid,numeric,date,text)']
  loop
    select pg_get_functiondef(firma::regprocedure) into definicion;
    if position('if not coalesce(public.app_es_admin(), false) then' in definicion)>0 then
      execute replace(definicion,'if not coalesce(public.app_es_admin(), false) then','if not coalesce(public.fin_puede_consultar_cuentas(), false) then');
    elsif position('public.fin_puede_consultar_cuentas()' in definicion)=0 then
      raise exception 'Revisar el contrato de %.',firma;
    end if;
  end loop;
end $funciones$;

-- Los pagos de una semana siguen requiriendo su autorización propia.
do $pago_semanal$
declare definicion text;
begin
  select pg_get_functiondef('public.fin_pagar_compra(text,uuid,numeric,date,text,date,boolean)'::regprocedure) into definicion;
  if position('p_semana is not null and not coalesce(public.app_es_admin()' in definicion)=0 then
    if position('p_referencia := btrim(p_referencia);' in definicion)=0 then raise exception 'Revisar el contrato del pago semanal.'; end if;
    execute replace(definicion,'p_referencia := btrim(p_referencia);',
      'if p_semana is not null and not coalesce(public.app_es_admin(),false) then
        raise exception ''No tienes permiso para ejecutar pagos semanales.'' using errcode=''42501'';
      end if;
      p_referencia := btrim(p_referencia);');
  end if;
end $pago_semanal$;

do $abono_sri$
declare definicion text; bloqueo text := 'select * into compra from public.compras_sri where clave_acceso = p_clave for update;';
begin
  select pg_get_functiondef('public.compras_sri_abonar(text,uuid,numeric,date,text)'::regprocedure) into definicion;
  if position('No tienes permiso para abonar una factura programada' in definicion)=0 then
    if position(bloqueo in definicion)=0 then raise exception 'Revisar el contrato del abono SRI.'; end if;
    execute replace(definicion,bloqueo,
      'perform public.fin_bloquear_documento_compra(''sri:''||p_clave);
       if not public.app_es_admin() and (
         exists(select 1 from public.fin_programacion_compras where documento_id=''sri:''||p_clave and pagado<monto)
         or exists(select 1 from public.compras_excel_documentos where sri_clave=p_clave)
       ) then raise exception ''No tienes permiso para abonar una factura programada o vinculada al Excel por esta entrada.'' using errcode=''42501''; end if;
       '||bloqueo);
  end if;
end $abono_sri$;

revoke all on function public.fin_puede_modulo(text),public.fin_puede_consultar_cuentas(),
  public.fin_consultar_cuentas(),public.fin_consultar_personal(),public.fin_consultar_roles_importados(),
  public.fin_consultar_resumen_roles() from public,anon,authenticated;
grant execute on function public.fin_puede_modulo(text),public.fin_puede_consultar_cuentas(),
  public.fin_consultar_cuentas(),public.fin_consultar_personal(),public.fin_consultar_roles_importados(),
  public.fin_consultar_resumen_roles() to authenticated;
commit;
