-- CIBUSPAN ONE
-- Guarda la columna SEMANA dentro de la misma importacion de facturas.

create or replace function public.fin_importar_facturas_2026(
  p_archivo_nombre text,
  p_archivo_hash text,
  p_hoja_origen text,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_total integer;
  v_nuevas integer;
  v_actualizadas integer;
  v_pagadas integer;
  v_pendientes integer;
  v_total_neto numeric(18,2);
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para importar facturas.' using errcode = '42501';
  end if;
  if trim(coalesce(p_archivo_nombre, '')) = '' or trim(coalesce(p_archivo_hash, '')) = ''
     or trim(coalesce(p_hoja_origen, '')) = '' then
    raise exception 'El archivo, su huella y la hoja son obligatorios.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no contiene facturas de 2026.';
  end if;
  if jsonb_array_length(p_lineas) > 5000 then raise exception 'El archivo supera 5000 facturas.'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lineas) as linea(
      clave_origen text, fecha_emision text, fecha_pago text, pagada boolean,
      proveedor text, proveedor_normalizado text, total_factura numeric,
      valor_neto_pagar numeric, cuenta_codigo text, fila_origen integer
    )
    where nullif(trim(coalesce(linea.clave_origen, '')), '') is null
      or nullif(trim(coalesce(linea.proveedor, '')), '') is null
      or nullif(trim(coalesce(linea.proveedor_normalizado, '')), '') is null
      or linea.total_factura is null or linea.total_factura <= 0
      or linea.valor_neto_pagar is null or linea.valor_neto_pagar <= 0
      or linea.fila_origen is null or linea.fila_origen < 1
      or (linea.pagada and (linea.fecha_pago is null or extract(year from linea.fecha_pago::date) <> 2026))
      or (not linea.pagada and (linea.fecha_emision is null or extract(year from linea.fecha_emision::date) <> 2026))
  ) then
    raise exception 'Existen facturas con datos incompletos o fuera del año 2026.';
  end if;

  select count(*)::integer,
    count(*) filter (where linea.pagada)::integer,
    count(*) filter (where not linea.pagada)::integer,
    sum(linea.valor_neto_pagar)::numeric(18,2)
  into v_total, v_pagadas, v_pendientes, v_total_neto
  from jsonb_to_recordset(p_lineas) as linea(pagada boolean, valor_neto_pagar numeric);

  select count(*)::integer into v_actualizadas
  from jsonb_to_recordset(p_lineas) as linea(clave_origen text)
  join public.fin_facturas_proveedor factura on factura.clave_origen = trim(linea.clave_origen);
  v_nuevas := v_total - v_actualizadas;

  insert into public.fin_importaciones_facturas (
    archivo_nombre, archivo_hash, hoja_origen, anio, facturas_archivo,
    facturas_nuevas, facturas_actualizadas, facturas_pagadas,
    facturas_pendientes, total_neto, creado_por
  ) values (
    trim(p_archivo_nombre), trim(p_archivo_hash), trim(p_hoja_origen), 2026, v_total,
    v_nuevas, v_actualizadas, v_pagadas, v_pendientes, v_total_neto, auth.uid()
  ) returning id into v_importacion_id;

  insert into public.fin_facturas_proveedor as existente (
    clave_origen, fecha_emision, fecha_vencimiento, fecha_pago_origen,
    pagada_origen, numero_factura, proveedor, proveedor_normalizado,
    descripcion, subtotal, aplica_iva, tasa_iva, iva, total_factura,
    retencion, retencion_referencia, valor_neto_pagar, cuenta_pago_id,
    estado_clasificacion, confianza, importacion_id, archivo_origen,
    hoja_origen, fila_origen, semana_pago_sugerida, semana_pago_numero,
    creado_por, actualizado_por
  )
  select
    trim(linea.clave_origen), nullif(linea.fecha_emision, '')::date,
    nullif(linea.fecha_vencimiento, '')::date, nullif(linea.fecha_pago, '')::date,
    linea.pagada, nullif(trim(linea.numero_factura), ''), trim(linea.proveedor),
    trim(linea.proveedor_normalizado), nullif(trim(linea.descripcion), ''),
    round(greatest(linea.subtotal, 0), 2), linea.aplica_iva,
    coalesce(linea.tasa_iva, 15), round(greatest(linea.iva, 0), 2),
    round(linea.total_factura, 2), round(greatest(linea.retencion, 0), 2),
    nullif(trim(linea.retencion_referencia), ''), round(linea.valor_neto_pagar, 2),
    coalesce(cuenta.id, pendiente.id),
    case when cuenta.id is null then 'PENDIENTE' else linea.estado_clasificacion end,
    case when cuenta.id is null then 0 else linea.confianza end,
    v_importacion_id, trim(p_archivo_nombre), trim(p_hoja_origen), linea.fila_origen,
    nullif(trim(linea.semana_pago_sugerida), ''),
    case when linea.semana_pago_numero between 1 and 53 then linea.semana_pago_numero else null end,
    auth.uid(), auth.uid()
  from jsonb_to_recordset(p_lineas) as linea(
    clave_origen text, fecha_emision text, fecha_vencimiento text, fecha_pago text,
    pagada boolean, numero_factura text, proveedor text, proveedor_normalizado text,
    descripcion text, subtotal numeric, aplica_iva boolean, tasa_iva numeric,
    iva numeric, total_factura numeric, retencion numeric, retencion_referencia text,
    valor_neto_pagar numeric, cuenta_codigo text, estado_clasificacion text,
    confianza numeric, fila_origen integer, semana_pago_sugerida text,
    semana_pago_numero integer
  )
  left join public.fin_cuentas_pago cuenta on cuenta.codigo = trim(linea.cuenta_codigo) and cuenta.activo
  cross join lateral (select id from public.fin_cuentas_pago where codigo = 'PENDIENTE') pendiente
  on conflict (clave_origen) do update
  set fecha_emision = excluded.fecha_emision,
      fecha_vencimiento = coalesce(existente.fecha_vencimiento, excluded.fecha_vencimiento),
      fecha_pago_origen = excluded.fecha_pago_origen,
      pagada_origen = excluded.pagada_origen,
      numero_factura = excluded.numero_factura,
      proveedor = excluded.proveedor,
      proveedor_normalizado = excluded.proveedor_normalizado,
      descripcion = excluded.descripcion,
      subtotal = excluded.subtotal,
      aplica_iva = excluded.aplica_iva,
      tasa_iva = excluded.tasa_iva,
      iva = excluded.iva,
      total_factura = excluded.total_factura,
      retencion = excluded.retencion,
      retencion_referencia = excluded.retencion_referencia,
      valor_neto_pagar = excluded.valor_neto_pagar,
      cuenta_pago_id = case when existente.estado_clasificacion = 'REVISADA' then existente.cuenta_pago_id else excluded.cuenta_pago_id end,
      estado_clasificacion = case when existente.estado_clasificacion = 'REVISADA' then existente.estado_clasificacion else excluded.estado_clasificacion end,
      confianza = case when existente.estado_clasificacion = 'REVISADA' then existente.confianza else excluded.confianza end,
      importacion_id = excluded.importacion_id,
      archivo_origen = excluded.archivo_origen,
      hoja_origen = excluded.hoja_origen,
      fila_origen = excluded.fila_origen,
      semana_pago_sugerida = excluded.semana_pago_sugerida,
      semana_pago_numero = excluded.semana_pago_numero,
      actualizado_por = auth.uid(),
      actualizado_en = now();

  insert into public.fin_factura_abonos (
    clave_origen, factura_id, fecha_pago, monto, documento, origen, creado_por
  )
  select
    'EXCEL|' || trim(linea.clave_origen), factura.id, linea.fecha_pago::date,
    round(linea.valor_neto_pagar, 2), nullif(trim(linea.documento), ''), 'EXCEL', auth.uid()
  from jsonb_to_recordset(p_lineas) as linea(
    clave_origen text, fecha_pago text, pagada boolean,
    valor_neto_pagar numeric, documento text
  )
  join public.fin_facturas_proveedor factura on factura.clave_origen = trim(linea.clave_origen)
  where linea.pagada
  on conflict (clave_origen) do update
  set fecha_pago = excluded.fecha_pago,
      monto = excluded.monto,
      documento = excluded.documento;

  return jsonb_build_object(
    'importacion_id', v_importacion_id, 'facturas_archivo', v_total,
    'facturas_nuevas', v_nuevas, 'facturas_actualizadas', v_actualizadas,
    'facturas_pagadas', v_pagadas, 'facturas_pendientes', v_pendientes,
    'total_neto', v_total_neto
  );
end;
$$;

revoke all on function public.fin_importar_facturas_2026(text, text, text, jsonb)
  from public, anon;
grant execute on function public.fin_importar_facturas_2026(text, text, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
