-- Completa cantidades del mismo registro de visita, sin volver a crear la visita.
-- No modifica fechas, SKU, autor, caras, fotos, georreferencias ni cobertura.
create or replace function public.com_kpi_campo_completar_lectura(
  p_registro_id uuid, p_actualizado_en timestamptz, p_datos jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_detalle public.com_visitas_campo_sku%rowtype;
  v_visita public.com_visitas_campo%rowtype;
  v_campo text; v_valor numeric; v_cantidad integer := 0;
  v_campos text[] := array['precio_comercio','precio_afiliado','rotacion_diaria_unidades',
    'venta_diaria_valor','prediccion_venta_unidades','participacion_clase','participacion_subclase',
    'stock_local_unidades','dias_inventario_local','stock_cd_cajas','unidades_por_caja',
    'dias_inventario_cd','cantidad_ultimo_pedido','cantidad_ultimo_despacho'];
  v_valores jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.app_puede('Campo comercial', auth.uid()) then
    raise exception 'No tienes permiso para completar lecturas.' using errcode = '42501';
  end if;
  select * into v_detalle from public.com_visitas_campo_sku where id = p_registro_id for update;
  if not found then raise exception 'El registro de visita ya no existe.'; end if;
  select * into v_visita from public.com_visitas_campo where id = v_detalle.visita_id;
  if v_visita.estado <> 'CONFIRMADA'
    or not public.com_puede_ver_cliente_campo(v_visita.cliente_id, auth.uid(), v_visita.fecha_visita)
    or (v_visita.registrado_por is distinct from auth.uid() and not public.com_es_gerencia_kpi()) then
    raise exception 'Solo el autor o un administrador/gerente autorizado puede completar esta visita.' using errcode = '42501';
  end if;
  if p_actualizado_en is null or v_detalle.actualizado_en is distinct from p_actualizado_en then
    raise exception 'Esta visita cambió. Actualiza el dashboard y revisa nuevamente antes de guardar.' using errcode = '40001';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'La lectura no es válida.'; end if;
  for v_campo in select jsonb_object_keys(p_datos) loop
    if not (v_campo = any(v_campos || array['confianza','advertencias','texto_ocr'])) then
      raise exception 'No se puede modificar el campo % desde la recuperación de lectura.', v_campo;
    end if;
  end loop;
  foreach v_campo in array v_campos loop
    if p_datos ? v_campo and p_datos->v_campo <> 'null'::jsonb then
      if jsonb_typeof(p_datos->v_campo) <> 'number' then raise exception 'La cantidad % no es numérica.', v_campo; end if;
      v_valor := (p_datos->>v_campo)::numeric;
      if v_valor < 0 or v_valor::text in ('NaN','Infinity','-Infinity') then raise exception 'La cantidad % no es válida.', v_campo; end if;
      v_valores := v_valores || jsonb_build_object(v_campo, v_valor);
      v_cantidad := v_cantidad + 1;
    end if;
  end loop;
  if v_cantidad = 0 then raise exception 'No hay cantidades para completar la visita.'; end if;
  if p_datos ? 'confianza' and p_datos->'confianza' <> 'null'::jsonb then
    if jsonb_typeof(p_datos->'confianza') <> 'number' or (p_datos->>'confianza')::numeric not between 0 and 1 then
      raise exception 'La confianza del lector no es válida.';
    end if;
  end if;
  if p_datos ? 'advertencias' and jsonb_typeof(p_datos->'advertencias') <> 'array' then raise exception 'Las advertencias no son válidas.'; end if;
  if p_datos ? 'texto_ocr' and jsonb_typeof(p_datos->'texto_ocr') <> 'string' then raise exception 'El texto OCR no es válido.'; end if;
  update public.com_visitas_campo_sku set
    precio_comercio = coalesce((v_valores->>'precio_comercio')::numeric, precio_comercio),
    precio_afiliado = coalesce((v_valores->>'precio_afiliado')::numeric, precio_afiliado),
    rotacion_diaria_unidades = coalesce((v_valores->>'rotacion_diaria_unidades')::numeric, rotacion_diaria_unidades),
    venta_diaria_valor = coalesce((v_valores->>'venta_diaria_valor')::numeric, venta_diaria_valor),
    prediccion_venta_unidades = coalesce((v_valores->>'prediccion_venta_unidades')::numeric, prediccion_venta_unidades),
    participacion_clase = coalesce((v_valores->>'participacion_clase')::numeric, participacion_clase),
    participacion_subclase = coalesce((v_valores->>'participacion_subclase')::numeric, participacion_subclase),
    stock_local_unidades = coalesce((v_valores->>'stock_local_unidades')::numeric, stock_local_unidades),
    dias_inventario_local = coalesce((v_valores->>'dias_inventario_local')::numeric, dias_inventario_local),
    stock_cd_cajas = coalesce((v_valores->>'stock_cd_cajas')::numeric, stock_cd_cajas),
    unidades_por_caja = coalesce((v_valores->>'unidades_por_caja')::numeric, unidades_por_caja),
    dias_inventario_cd = coalesce((v_valores->>'dias_inventario_cd')::numeric, dias_inventario_cd),
    cantidad_ultimo_pedido = coalesce((v_valores->>'cantidad_ultimo_pedido')::numeric, cantidad_ultimo_pedido),
    cantidad_ultimo_despacho = coalesce((v_valores->>'cantidad_ultimo_despacho')::numeric, cantidad_ultimo_despacho),
    confianza_ia = coalesce((p_datos->>'confianza')::numeric, confianza_ia),
    datos_ia = coalesce(datos_ia, '{}'::jsonb) || v_valores || jsonb_build_object(
      'lector_estado', 'RECUPERADA_REVISADA', 'lector_recuperado_por', auth.uid(), 'lector_recuperado_en', now(),
      'texto_ocr', left(coalesce(p_datos->>'texto_ocr', ''), 20000),
      'advertencias', coalesce(p_datos->'advertencias', '[]'::jsonb)),
    actualizado_en = clock_timestamp()
  where id = p_registro_id
  returning * into v_detalle;
  return jsonb_build_object('id', v_detalle.id, 'actualizado_en', v_detalle.actualizado_en);
end;
$$;
revoke all on function public.com_kpi_campo_completar_lectura(uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.com_kpi_campo_completar_lectura(uuid,timestamptz,jsonb) to authenticated;
