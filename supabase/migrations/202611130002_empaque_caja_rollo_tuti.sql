do $$
declare
  v_producto_id uuid;
  v_caja_id uuid;
begin
  select id into strict v_producto_id
  from public.productos
  where codigo = '7868304262219T' and activo;

  select id into strict v_caja_id
  from public.materias_primas
  where codigo = '00120'
    and activo
    and es_empaque
    and incluir_en_costeo
    and unidad_base = 'UNIDAD';

  insert into public.fm_producto_empaques (
    producto_id, materia_prima_id, cantidad_por_unidad, activo, observaciones
  )
  values (
    v_producto_id, v_caja_id, 1::numeric / 12, true,
    'Una caja de cartón por cada 12 rollos de chocolate Tuti.'
  )
  on conflict (producto_id, materia_prima_id) do update
  set cantidad_por_unidad = excluded.cantidad_por_unidad,
      activo = excluded.activo,
      observaciones = excluded.observaciones,
      actualizado_en = now()
  where (fm_producto_empaques.cantidad_por_unidad, fm_producto_empaques.activo,
         fm_producto_empaques.observaciones)
    is distinct from (excluded.cantidad_por_unidad, excluded.activo, excluded.observaciones);
end;
$$;
