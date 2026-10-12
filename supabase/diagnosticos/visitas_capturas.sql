-- Diagnóstico de solo lectura. No cambia visitas, archivos ni permisos.
-- Revisar los 20 SKU guardados más recientemente, incluso si fecha_visita
-- corresponde a otra semana por un borrador antiguo.
with campos as (
  select array[
    'precio_comercio', 'precio_afiliado', 'rotacion_diaria_unidades',
    'venta_diaria_valor', 'prediccion_venta_unidades', 'participacion_clase',
    'participacion_subclase', 'stock_local_unidades', 'dias_inventario_local',
    'stock_cd_cajas', 'unidades_por_caja', 'dias_inventario_cd',
    'cantidad_ultimo_pedido', 'cantidad_ultimo_despacho'
  ]::text[] as nombres
), ultimos as (
  select d.*, v.fecha_visita, v.visitado_en, v.estado as estado_visita,
    c.nombre as cliente, l.nombre as local, p.codigo as sku, p.nombre as producto
  from public.com_visitas_campo_sku d
  join public.com_visitas_campo v on v.id = d.visita_id
  left join public.clientes c on c.id = v.cliente_id
  left join public.com_locales_monitoreados l on l.id = v.local_monitoreado_id
  left join public.productos p on p.id = d.producto_id
  order by d.creado_en desc, d.id
  limit 20
), lectura as (
  select u.*,
    coalesce(cardinality(u.capturas_app), 0) as capturas_registradas,
    (select count(*) from unnest(u.capturas_app) ruta where exists (
      select 1 from storage.objects o where o.bucket_id = 'visitas-campo' and o.name = ruta
    )) as capturas_en_storage,
    (select count(*) from unnest(campos.nombres) nombre
      where to_jsonb(u)->nombre is not null
        and to_jsonb(u)->nombre <> 'null'::jsonb) as cantidades_en_columnas,
    (select count(*) from unnest(campos.nombres) nombre
      where u.datos_ia->nombre is not null and u.datos_ia->nombre not in ('null'::jsonb, '""'::jsonb)) as cantidades_en_json,
    (select jsonb_object_agg(nombre, to_jsonb(u)->nombre) from unnest(campos.nombres) nombre) as valores_columnas,
    (select jsonb_object_agg(nombre, u.datos_ia->nombre) from unnest(campos.nombres) nombre) as valores_json
  from ultimos u cross join campos
), diagnostico as (
  select lectura.*,
    case
      when cantidades_en_columnas > 0 then 'HAY_VALORES_EN_COLUMNAS'
      when cantidades_en_json > 0 then 'VALORES_EN_JSON_PERO_NO_EN_COLUMNAS'
      when capturas_registradas > 0 and capturas_en_storage < capturas_registradas then 'FALTAN_IMAGENES_EN_STORAGE'
      when capturas_registradas > 0 then 'IMAGENES_GUARDADAS_SIN_CANTIDADES'
      else 'SIN_CAPTURAS_NI_CANTIDADES'
    end as resultado
  from lectura
)
select jsonb_build_object(
  'consultado_en', now(),
  'solo_lectura', true,
  'alcance', '20 SKU guardados más recientemente; cantidades nulas no equivalen a cero',
  'resumen', (select coalesce(jsonb_agg(jsonb_build_object('resultado', resultado, 'registros', registros)), '[]'::jsonb)
    from (select resultado, count(*) as registros from diagnostico group by resultado order by resultado) resumen),
  'registros', (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'visita_id', visita_id, 'cliente', cliente, 'local', local,
    'sku', sku, 'producto', producto, 'fecha_visita', fecha_visita,
    'visitado_en', visitado_en, 'guardado_en', creado_en, 'estado_visita', estado_visita,
    'resultado', resultado, 'capturas_registradas', capturas_registradas,
    'capturas_en_storage', capturas_en_storage,
    'cantidades_en_columnas', cantidades_en_columnas, 'cantidades_en_json', cantidades_en_json,
    'valores_columnas', valores_columnas, 'valores_json', valores_json,
    'caras_percha', datos_ia->'caras_percha', 'confianza_lector', confianza_ia,
    'advertencias_lector', datos_ia->'advertencias',
    'nombre_leido', datos_ia->'nombre_producto', 'codigo_leido', datos_ia->'codigo_barras'
  ) order by creado_en desc, id), '[]'::jsonb) from diagnostico),
  'funcion_guardado_instalada', pg_get_functiondef(to_regprocedure('public.com_kpi_campo_guardar_visita(jsonb)'))
) as diagnostico;
