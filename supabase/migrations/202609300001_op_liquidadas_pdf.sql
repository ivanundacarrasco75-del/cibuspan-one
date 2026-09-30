-- Permite importar el reporte resumido de OP liquidadas.
-- Una misma OP de Admisys puede contener mas de un producto terminado.

alter table public.pro_ordenes_historicas
  drop constraint if exists pro_ordenes_historicas_numero_orden_key;

alter table public.pro_ordenes_historicas
  drop constraint if exists pro_ordenes_historicas_numero_producto_key;

alter table public.pro_ordenes_historicas
  add constraint pro_ordenes_historicas_numero_producto_key
  unique (numero_orden, producto_codigo);

create or replace function public.pro_importar_ordenes_historicas(
  p_archivo_nombre text,
  p_archivo_hash text,
  p_ordenes jsonb,
  p_finalizar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_importacion_id uuid;
  v_orden jsonb;
  v_detalle jsonb;
  v_orden_id uuid;
  v_producto_id uuid;
  v_nuevas integer := 0;
  v_actualizadas integer := 0;
  v_numero_orden text;
  v_producto_codigo text;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if not public.app_puede_alguna(array['Producción', 'Administración']) then
    raise exception 'No tienes permiso para importar ordenes de produccion.'
      using errcode = '42501';
  end if;

  if trim(coalesce(p_archivo_nombre, '')) = ''
     or trim(coalesce(p_archivo_hash, '')) = '' then
    raise exception 'El nombre y la huella del archivo son obligatorios.';
  end if;

  if p_ordenes is null or jsonb_typeof(p_ordenes) <> 'array' then
    raise exception 'El lote de ordenes no es valido.';
  end if;

  insert into public.pro_importaciones_ordenes (
    archivo_nombre,
    archivo_hash,
    estado,
    creado_por
  )
  values (
    trim(p_archivo_nombre),
    trim(p_archivo_hash),
    'PROCESANDO',
    auth.uid()
  )
  on conflict (archivo_hash) do update
  set
    archivo_nombre = excluded.archivo_nombre,
    estado = 'PROCESANDO',
    actualizado_en = now()
  returning id into v_importacion_id;

  for v_orden in
    select value from jsonb_array_elements(p_ordenes)
  loop
    v_numero_orden := trim(v_orden->>'numero_orden');
    v_producto_codigo := trim(v_orden->>'producto_codigo');
    if v_numero_orden = '' or v_producto_codigo = '' then
      raise exception 'Existe una orden sin numero o codigo de producto.';
    end if;

    select historica.id
    into v_orden_id
    from public.pro_ordenes_historicas historica
    where historica.numero_orden = v_numero_orden
      and historica.producto_codigo = v_producto_codigo;

    if v_orden_id is null then
      v_nuevas := v_nuevas + 1;
    else
      v_actualizadas := v_actualizadas + 1;
    end if;

    select producto.id
    into v_producto_id
    from public.productos producto
    where trim(producto.codigo) = v_producto_codigo
    order by producto.activo desc, producto.creado_en
    limit 1;

    insert into public.pro_ordenes_historicas (
      importacion_id,
      numero_orden,
      sucursal_codigo,
      sucursal_nombre,
      fecha_registro,
      fecha_fin_original,
      fecha_produccion,
      descripcion,
      producto_id,
      producto_codigo,
      producto_nombre,
      tipo_orden,
      tamano_parada,
      numero_paradas,
      unidades_producidas,
      kg_micro,
      costo_total,
      estado_validacion,
      observaciones,
      actualizado_en
    )
    values (
      v_importacion_id,
      v_numero_orden,
      nullif(trim(v_orden->>'sucursal_codigo'), ''),
      nullif(trim(v_orden->>'sucursal_nombre'), ''),
      (v_orden->>'fecha_registro')::date,
      nullif(v_orden->>'fecha_fin_original', '')::date,
      (v_orden->>'fecha_produccion')::date,
      nullif(trim(v_orden->>'descripcion'), ''),
      v_producto_id,
      v_producto_codigo,
      trim(v_orden->>'producto_nombre'),
      upper(trim(v_orden->>'tipo_orden')),
      coalesce((v_orden->>'tamano_parada')::numeric, 0),
      coalesce((v_orden->>'numero_paradas')::numeric, 0),
      coalesce((v_orden->>'unidades_producidas')::numeric, 0),
      coalesce((v_orden->>'kg_micro')::numeric, 0),
      coalesce((v_orden->>'costo_total')::numeric, 0),
      coalesce(nullif(upper(trim(v_orden->>'estado_validacion')), ''), 'VALIDA'),
      nullif(trim(v_orden->>'observaciones'), ''),
      now()
    )
    on conflict (numero_orden, producto_codigo) do update
    set
      importacion_id = excluded.importacion_id,
      sucursal_codigo = excluded.sucursal_codigo,
      sucursal_nombre = excluded.sucursal_nombre,
      fecha_registro = excluded.fecha_registro,
      fecha_fin_original = excluded.fecha_fin_original,
      fecha_produccion = excluded.fecha_produccion,
      descripcion = excluded.descripcion,
      producto_id = excluded.producto_id,
      producto_nombre = excluded.producto_nombre,
      tipo_orden = excluded.tipo_orden,
      tamano_parada = excluded.tamano_parada,
      numero_paradas = excluded.numero_paradas,
      unidades_producidas = excluded.unidades_producidas,
      kg_micro = excluded.kg_micro,
      costo_total = excluded.costo_total,
      estado_validacion = excluded.estado_validacion,
      observaciones = excluded.observaciones,
      actualizado_en = now()
    returning id into v_orden_id;

    delete from public.pro_ordenes_historicas_detalles
    where orden_historica_id = v_orden_id;

    for v_detalle in
      select value
      from jsonb_array_elements(coalesce(v_orden->'detalles', '[]'::jsonb))
    loop
      insert into public.pro_ordenes_historicas_detalles (
        orden_historica_id,
        orden_linea,
        materia_codigo,
        materia_nombre,
        cantidad,
        costo_unitario,
        costo_total,
        es_empaque
      )
      values (
        v_orden_id,
        coalesce((v_detalle->>'orden_linea')::integer, 0),
        nullif(trim(v_detalle->>'materia_codigo'), ''),
        trim(v_detalle->>'materia_nombre'),
        coalesce((v_detalle->>'cantidad')::numeric, 0),
        coalesce((v_detalle->>'costo_unitario')::numeric, 0),
        coalesce((v_detalle->>'costo_total')::numeric, 0),
        coalesce((v_detalle->>'es_empaque')::boolean, false)
      );
    end loop;
  end loop;

  if p_finalizar then
    update public.pro_importaciones_ordenes importacion
    set
      estado = 'COMPLETADA',
      fecha_desde = resumen.fecha_desde,
      fecha_hasta = resumen.fecha_hasta,
      filas_archivo = resumen.filas_archivo,
      ordenes_archivo = resumen.ordenes_archivo,
      ordenes_sku = resumen.ordenes_sku,
      ordenes_micro = resumen.ordenes_micro,
      unidades_sku = resumen.unidades_sku,
      kg_micro = resumen.kg_micro,
      costo_total = resumen.costo_total,
      actualizado_en = now()
    from (
      select
        min(orden.fecha_produccion) as fecha_desde,
        max(orden.fecha_produccion) as fecha_hasta,
        greatest(
          count(*)::integer,
          (
            select count(*)::integer
            from public.pro_ordenes_historicas_detalles detalle
            join public.pro_ordenes_historicas orden_detalle
              on orden_detalle.id = detalle.orden_historica_id
            where orden_detalle.importacion_id = v_importacion_id
          )
        ) as filas_archivo,
        count(*)::integer as ordenes_archivo,
        count(*) filter (where orden.tipo_orden = 'SKU')::integer as ordenes_sku,
        count(*) filter (where orden.tipo_orden = 'MICRO')::integer as ordenes_micro,
        coalesce(sum(orden.unidades_producidas), 0) as unidades_sku,
        coalesce(sum(orden.kg_micro), 0) as kg_micro,
        coalesce(sum(orden.costo_total), 0) as costo_total
      from public.pro_ordenes_historicas orden
      where orden.importacion_id = v_importacion_id
    ) resumen
    where importacion.id = v_importacion_id;
  end if;

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'ordenes_nuevas', v_nuevas,
    'ordenes_actualizadas', v_actualizadas,
    'finalizada', p_finalizar
  );
end;
$$;

revoke all on function public.pro_importar_ordenes_historicas(text, text, jsonb, boolean)
  from public, anon;
grant execute on function public.pro_importar_ordenes_historicas(text, text, jsonb, boolean)
  to authenticated;
