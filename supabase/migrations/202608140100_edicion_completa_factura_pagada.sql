-- CIBUSPAN ONE
-- Edicion atomica de la factura y de todos sus pagos registrados.

create or replace function public.fin_guardar_factura_completa(
  p_datos jsonb,
  p_abonos jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura_id uuid;
  v_total_abonos numeric(18,2);
  v_valor_neto numeric(18,2);
  v_cantidad_abonos integer;
  v_abonos_enviados integer;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para editar facturas y pagos.' using errcode = '42501';
  end if;
  if p_abonos is null or jsonb_typeof(p_abonos) <> 'array' then
    raise exception 'La lista de pagos no es valida.';
  end if;
  if jsonb_array_length(p_abonos) > 100 then
    raise exception 'La factura supera 100 pagos registrados.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_abonos) as pago(
      id text, fecha_pago text, monto numeric, documento text, notas text
    )
    where nullif(trim(coalesce(pago.id, '')), '') is null
      or nullif(trim(coalesce(pago.fecha_pago, '')), '') is null
      or pago.monto is null
      or pago.monto <= 0
  ) then
    raise exception 'Todos los pagos necesitan fecha y monto mayor a cero.';
  end if;

  select count(*)::integer, count(distinct pago.id)::integer
  into v_abonos_enviados, v_cantidad_abonos
  from jsonb_to_recordset(p_abonos) as pago(id text);
  if v_abonos_enviados <> v_cantidad_abonos then
    raise exception 'La lista contiene pagos duplicados.';
  end if;

  v_factura_id := public.fin_guardar_factura(p_datos);

  update public.fin_facturas_proveedor
  set retencion_referencia = nullif(trim(p_datos->>'retencion_referencia'), ''),
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where id = v_factura_id;

  if exists (
    select 1
    from jsonb_to_recordset(p_abonos) as pago(id text)
    left join public.fin_factura_abonos abono
      on abono.id = pago.id::uuid
     and abono.factura_id = v_factura_id
    where abono.id is null
  ) then
    raise exception 'Uno de los pagos no pertenece a la factura seleccionada.';
  end if;

  update public.fin_factura_abonos abono
  set fecha_pago = pago.fecha_pago::date,
      monto = round(pago.monto, 2),
      documento = nullif(trim(pago.documento), ''),
      notas = nullif(trim(pago.notas), '')
  from jsonb_to_recordset(p_abonos) as pago(
    id uuid, fecha_pago text, monto numeric, documento text, notas text
  )
  where abono.id = pago.id
    and abono.factura_id = v_factura_id;

  select factura.valor_neto_pagar,
         coalesce(sum(abono.monto), 0)::numeric(18,2)
  into v_valor_neto, v_total_abonos
  from public.fin_facturas_proveedor factura
  left join public.fin_factura_abonos abono on abono.factura_id = factura.id
  where factura.id = v_factura_id
  group by factura.valor_neto_pagar;

  if v_total_abonos > v_valor_neto + 0.005 then
    raise exception 'La suma de los pagos (%) supera el neto de la factura (%).',
      v_total_abonos, v_valor_neto;
  end if;

  update public.fin_facturas_proveedor factura
  set fecha_pago_origen = (
        select max(abono.fecha_pago)
        from public.fin_factura_abonos abono
        where abono.factura_id = factura.id
      ),
      pagada_origen = exists (
        select 1
        from public.fin_factura_abonos abono
        where abono.factura_id = factura.id
      ),
      actualizado_por = auth.uid(),
      actualizado_en = now()
  where factura.id = v_factura_id;

  return v_factura_id;
end;
$$;

revoke all on function public.fin_guardar_factura_completa(jsonb, jsonb)
  from public, anon;
grant execute on function public.fin_guardar_factura_completa(jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
