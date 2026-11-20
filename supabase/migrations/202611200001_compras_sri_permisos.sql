begin;
set local lock_timeout = '5s';

-- El permiso exacto se asigna desde Usuarios y Permisos. Una denegación
-- explícita prevalece también para administradores y perfiles inactivos.
create or replace function public.compras_sri_puede()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_profiles p
    where p.user_id = auth.uid() and p.activo
      and coalesce(
        (select up.permitido from public.app_user_permissions up
          where up.user_id = p.user_id and up.pantalla = 'Compras · Facturas del SRI'),
        p.rol = 'ADMINISTRADOR' or public.app_puede('Compras · Facturas del SRI')
      )
  );
$$;
revoke all on function public.compras_sri_puede() from public, anon, authenticated;
grant execute on function public.compras_sri_puede() to authenticated;

alter policy compras_sri_lectura on public.compras_sri
  using ((select public.compras_sri_puede()));
alter policy compras_sri_ingreso on public.compras_sri
  with check ((select public.compras_sri_puede()));
alter policy compras_sri_ride on public.compras_sri
  using ((select public.compras_sri_puede())) with check ((select public.compras_sri_puede()));

-- Las facturas importadas de Excel forman parte de la misma tabla de la app.
alter policy compras_excel_documentos_lectura on public.compras_excel_documentos
  using (case when tipo = 'FACTURA' then (select public.compras_sri_puede())
    else (select public.app_puede('Administración')) end);

-- Permite mostrar los pagos ya registrados en el detalle de la factura.
-- El registro y la programación de pagos mantienen sus controles propios.
drop policy if exists fin_pagos_compras_lectura_sri on public.fin_pagos_compras;
create policy fin_pagos_compras_lectura_sri on public.fin_pagos_compras
  for select to authenticated using (
    (select public.compras_sri_puede()) and (
      exists (select 1 from public.compras_sri c where documento_id = 'sri:' || c.clave_acceso)
      or exists (select 1 from public.compras_excel_documentos e
        where e.tipo = 'FACTURA' and documento_id = 'excel:' || e.id::text)
    )
  );

create or replace function public.compras_sri_editar(p_clave text, p_campo text, p_valor text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  compra public.compras_sri%rowtype;
  pagado numeric;
begin
  if not coalesce(public.compras_sri_puede(), false) then
    raise exception 'No tienes permiso para editar facturas SRI.' using errcode = '42501';
  end if;
  if p_campo is null or p_campo not in ('fecha','serie','proveedor','descripcion','subtotal','iva','total','retencion','documento')
    or p_valor is null or length(p_valor) > 500 then
    raise exception 'Revisa el valor de la celda.';
  end if;
  p_valor := btrim(p_valor);
  if p_campo in ('fecha', 'serie', 'proveedor') and p_valor = '' then
    raise exception 'Completa esta celda.';
  end if;
  if p_campo = 'fecha' then
    if p_valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Fecha inválida.'; end if;
    perform p_valor::date;
  end if;
  if p_campo in ('subtotal','iva','total') and p_valor !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then
    raise exception 'Usa un importe de hasta dos decimales.';
  end if;

  select * into compra from public.compras_sri where clave_acceso = p_clave for update;
  if not found then raise exception 'La factura no existe.'; end if;
  if p_campo = 'total' then
    select coalesce(sum((a->>'valor')::numeric), 0)
      into pagado from jsonb_array_elements(compra.abonos) a;
    if p_valor::numeric < pagado then
      raise exception 'El total no puede ser menor que los abonos registrados.';
    end if;
  end if;

  update public.compras_sri
    set edicion = jsonb_set(compra.edicion, array[p_campo], to_jsonb(p_valor))
    where clave_acceso = p_clave returning * into compra;
  return jsonb_build_object('edicion', compra.edicion, 'abonos', compra.abonos);
end;
$$;


-- Se conservan las validaciones, bloqueos y control de versiones de recepción.
create or replace function public.compras_recepcion_mp_fuente(p_clave text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c record; clave text:=p_clave;
begin
  if auth.uid() is null or public.compras_sri_puede() is not true then
    raise exception 'No tienes acceso a las facturas de compra.' using errcode='42501';
  end if;
  -- La factura vinculada al Excel y su XML representan un solo documento.
  if p_clave like 'excel:%' then
    select coalesce(sri_clave,'excel:'||id::text) into clave
      from public.compras_excel_documentos where 'excel:'||id::text=p_clave and tipo='FACTURA';
  end if;
  select * into c from public.compras_vw_facturas where datos->>'clave'=clave;
  if not found then raise exception 'La factura ya no está disponible. Actualiza la tabla.'; end if;
  return jsonb_build_object('id',case when clave like 'excel:%' then clave else 'sri:'||clave end,
    'factura',c.datos,'edicion',c.edicion,'version',md5(c.datos::text||c.edicion::text));
end $$;
revoke all on function public.compras_recepcion_mp_fuente(text) from public,anon,authenticated;


alter policy compras_recepciones_mp_lectura on public.compras_recepciones_mp
  using (public.compras_sri_puede() and public.inv_kardex_puede('MATERIA_PRIMA'));

commit;
