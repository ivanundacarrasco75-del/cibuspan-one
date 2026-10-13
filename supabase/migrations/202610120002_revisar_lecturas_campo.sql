-- Revisión explícita de cantidades y fechas de pedido/despacho del mismo detalle.
-- No cambia la fecha de visita, SKU, autor, caras, fotos, georreferencias ni cobertura.
create or replace function public.com_kpi_campo_completar_lectura(
  p_registro_id uuid, p_actualizado_en timestamptz, p_datos jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_detalle public.com_visitas_campo_sku%rowtype;
  v_visita public.com_visitas_campo%rowtype;
  v_campo text; v_valor numeric; v_fecha date; v_cantidad integer := 0;
  v_campos text[] := array['precio_comercio','precio_afiliado','rotacion_diaria_unidades',
    'venta_diaria_valor','prediccion_venta_unidades','participacion_clase','participacion_subclase',
    'stock_local_unidades','dias_inventario_local','stock_cd_cajas','unidades_por_caja',
    'dias_inventario_cd','cantidad_ultimo_pedido','cantidad_ultimo_despacho'];
  v_valores jsonb := '{}'::jsonb;
  v_fechas text[] := array['fecha_ultimo_pedido','fecha_ultimo_despacho'];
  v_fechas_valores jsonb := '{}'::jsonb;
  v_borrar text[] := '{}'::text[];
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
    if not (v_campo = any(v_campos || v_fechas || array['confianza','advertencias','texto_ocr','campos_borrar'])) then
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
  foreach v_campo in array v_fechas loop
    if p_datos ? v_campo and p_datos->v_campo <> 'null'::jsonb then
      if jsonb_typeof(p_datos->v_campo) <> 'string' or (p_datos->>v_campo) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'La fecha % debe estar completa en formato AAAA-MM-DD.', v_campo;
      end if;
      v_fecha := (p_datos->>v_campo)::date;
      v_fechas_valores := v_fechas_valores || jsonb_build_object(v_campo, v_fecha);
      v_cantidad := v_cantidad + 1;
    end if;
  end loop;
  if p_datos ? 'campos_borrar' then
    if jsonb_typeof(p_datos->'campos_borrar') <> 'array' then raise exception 'Los campos a quitar no son válidos.'; end if;
    for v_campo in select value #>> '{}' from jsonb_array_elements(p_datos->'campos_borrar') loop
      if v_campo is null or not (v_campo = any(v_campos || v_fechas)) then raise exception 'No se puede quitar el campo %.', v_campo; end if;
      if v_valores ? v_campo or v_fechas_valores ? v_campo then raise exception 'No se puede asignar y quitar el mismo campo.'; end if;
      v_borrar := array_append(v_borrar, v_campo);
      v_valores := v_valores || jsonb_build_object(v_campo, null);
      v_cantidad := v_cantidad + 1;
    end loop;
  end if;
  if v_cantidad = 0 then raise exception 'No hay datos para completar o corregir la visita.'; end if;
  if p_datos ? 'confianza' and p_datos->'confianza' <> 'null'::jsonb then
    if jsonb_typeof(p_datos->'confianza') <> 'number' or (p_datos->>'confianza')::numeric not between 0 and 1 then
      raise exception 'La confianza del lector no es válida.';
    end if;
  end if;
  if p_datos ? 'advertencias' and jsonb_typeof(p_datos->'advertencias') <> 'array' then raise exception 'Las advertencias no son válidas.'; end if;
  if p_datos ? 'texto_ocr' and jsonb_typeof(p_datos->'texto_ocr') <> 'string' then raise exception 'El texto OCR no es válido.'; end if;
  update public.com_visitas_campo_sku set
    precio_comercio = case when 'precio_comercio' = any(v_borrar) then null else coalesce((v_valores->>'precio_comercio')::numeric, precio_comercio) end,
    precio_afiliado = case when 'precio_afiliado' = any(v_borrar) then null else coalesce((v_valores->>'precio_afiliado')::numeric, precio_afiliado) end,
    rotacion_diaria_unidades = case when 'rotacion_diaria_unidades' = any(v_borrar) then null else coalesce((v_valores->>'rotacion_diaria_unidades')::numeric, rotacion_diaria_unidades) end,
    venta_diaria_valor = case when 'venta_diaria_valor' = any(v_borrar) then null else coalesce((v_valores->>'venta_diaria_valor')::numeric, venta_diaria_valor) end,
    prediccion_venta_unidades = case when 'prediccion_venta_unidades' = any(v_borrar) then null else coalesce((v_valores->>'prediccion_venta_unidades')::numeric, prediccion_venta_unidades) end,
    participacion_clase = case when 'participacion_clase' = any(v_borrar) then null else coalesce((v_valores->>'participacion_clase')::numeric, participacion_clase) end,
    participacion_subclase = case when 'participacion_subclase' = any(v_borrar) then null else coalesce((v_valores->>'participacion_subclase')::numeric, participacion_subclase) end,
    stock_local_unidades = case when 'stock_local_unidades' = any(v_borrar) then null else coalesce((v_valores->>'stock_local_unidades')::numeric, stock_local_unidades) end,
    dias_inventario_local = case when 'dias_inventario_local' = any(v_borrar) then null else coalesce((v_valores->>'dias_inventario_local')::numeric, dias_inventario_local) end,
    stock_cd_cajas = case when 'stock_cd_cajas' = any(v_borrar) then null else coalesce((v_valores->>'stock_cd_cajas')::numeric, stock_cd_cajas) end,
    unidades_por_caja = case when 'unidades_por_caja' = any(v_borrar) then null else coalesce((v_valores->>'unidades_por_caja')::numeric, unidades_por_caja) end,
    dias_inventario_cd = case when 'dias_inventario_cd' = any(v_borrar) then null else coalesce((v_valores->>'dias_inventario_cd')::numeric, dias_inventario_cd) end,
    cantidad_ultimo_pedido = case when 'cantidad_ultimo_pedido' = any(v_borrar) then null else coalesce((v_valores->>'cantidad_ultimo_pedido')::numeric, cantidad_ultimo_pedido) end,
    cantidad_ultimo_despacho = case when 'cantidad_ultimo_despacho' = any(v_borrar) then null else coalesce((v_valores->>'cantidad_ultimo_despacho')::numeric, cantidad_ultimo_despacho) end,
    fecha_ultimo_pedido = case when 'fecha_ultimo_pedido' = any(v_borrar) then null else coalesce((v_fechas_valores->>'fecha_ultimo_pedido')::date, fecha_ultimo_pedido) end,
    fecha_ultimo_despacho = case when 'fecha_ultimo_despacho' = any(v_borrar) then null else coalesce((v_fechas_valores->>'fecha_ultimo_despacho')::date, fecha_ultimo_despacho) end,
    confianza_ia = coalesce((p_datos->>'confianza')::numeric, confianza_ia),
    datos_ia = coalesce(datos_ia, '{}'::jsonb) || v_valores || v_fechas_valores || jsonb_build_object(
      'lector_estado', 'RECUPERADA_REVISADA', 'lector_recuperado_por', auth.uid(), 'lector_recuperado_en', now(),
      'lector_campos_quitados', to_jsonb(v_borrar),
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
