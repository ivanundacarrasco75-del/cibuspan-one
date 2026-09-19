-- CIBUSPAN ONE
-- Carga inicial idempotente de PAN GRANOS Y SEMILLAS 500G.

do $$
declare
  v_formula_id uuid;
  v_version_id uuid;
  v_micro_id uuid;
  v_producto_id uuid;
  v_funda_id uuid;
  v_componentes integer;
  v_faltantes text;
begin
  insert into public.materias_primas (
    codigo,
    nombre,
    nombre_corto,
    unidad_base,
    incluir_en_costeo,
    es_empaque,
    activo,
    observaciones
  )
  values (
    'AGUA',
    'AGUA',
    'AGUA',
    'KG',
    false,
    false,
    true,
    'Sin costo por decision de costeo de la formula.'
  )
  on conflict (codigo) do update
  set
    activo = true,
    incluir_en_costeo = false,
    actualizado_en = now();

  insert into public.fm_formulas (
    codigo,
    nombre,
    descripcion,
    activo
  )
  values (
    'GRANOS SEMILLAS',
    'PAN GRANOS Y SEMILLAS 500G',
    'Pan de granos y semillas de 500 g. Una parada produce 120 panes y 120 fundas.',
    true
  )
  on conflict (codigo) do update
  set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    activo = true,
    actualizado_en = now()
  returning id into v_formula_id;

  insert into public.fm_micros (
    codigo,
    nombre,
    descripcion,
    activo
  )
  values (
    'MIC-GRANOS-SEMILLAS',
    'MICRO GRANOS Y SEMILLAS',
    'Micro de azucar, sal, ECOFRESH, propionato, avena molida, machica y MOHOSORBIC.',
    true
  )
  on conflict (codigo) do update
  set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    activo = true,
    actualizado_en = now()
  returning id into v_micro_id;

  select version.id
  into v_version_id
  from public.fm_formula_versiones version
  where version.formula_id = v_formula_id
    and version.numero_version = 1;

  if v_version_id is null then
    insert into public.fm_formula_versiones (
      formula_id,
      numero_version,
      estado,
      panes_por_batch,
      peso_bola_g,
      peso_final_g,
      peso_batch_kg,
      rendimiento_unidades,
      paradas_por_batch,
      merma_porcentaje,
      observaciones
    )
    values (
      v_formula_id,
      1,
      'BORRADOR',
      120,
      590,
      500,
      70.835,
      120,
      1,
      15.254237,
      '120 panes por parada. Un pan de 500 g por funda. Peso calculado del micro: 6.976 kg. FRESHMIX A fue reemplazado por ECOFRESH.'
    )
    returning id into v_version_id;
  end if;

  select count(*)
  into v_componentes
  from public.fm_preformulacion_componentes componente
  where componente.formula_version_id = v_version_id;

  if v_componentes = 0 then
    with requeridas(codigo) as (
      values
        ('00011'),
        ('00012'),
        ('00015'),
        ('00016'),
        ('00017'),
        ('00024'),
        ('00025'),
        ('00013'),
        ('00014'),
        ('00020'),
        ('00021'),
        ('00042'),
        ('00043'),
        ('00124'),
        ('AGUA')
    )
    select string_agg(requerida.codigo, ', ' order by requerida.codigo)
    into v_faltantes
    from requeridas requerida
    where not exists (
      select 1
      from public.materias_primas materia
      where upper(coalesce(materia.codigo_contable, '')) = requerida.codigo
         or upper(coalesce(materia.codigo, '')) = requerida.codigo
    );

    if v_faltantes is not null then
      raise exception
        'Faltan materias primas para GRANOS Y SEMILLAS: %',
        v_faltantes;
    end if;

    insert into public.fm_preformulacion_componentes (
      formula_version_id,
      materia_prima_id,
      porcentaje_panadero,
      destino_tipo,
      micro_id,
      es_harina_base,
      incluir_en_costeo,
      orden,
      observaciones
    )
    select
      v_version_id,
      materia.id,
      receta.porcentaje,
      receta.destino,
      case
        when receta.destino = 'MICRO' then v_micro_id
        else null
      end,
      receta.es_base,
      receta.costea,
      receta.orden,
      receta.observaciones
    from (
      values
        ('00011', 90.000000::numeric, 'DIRECTO', true,  true,  1, 'HARINA BLANCA'),
        ('00012', 10.000000::numeric, 'DIRECTO', true,  true,  2, 'AFRECHO'),
        ('00015', 10.000000::numeric, 'DIRECTO', false, true,  3, 'MANTECA'),
        ('00016',  1.000000::numeric, 'DIRECTO', false, true,  4, 'LEVADURA'),
        ('00017',  0.600000::numeric, 'DIRECTO', false, true,  5, 'VINAGRE'),
        ('00024',  1.000000::numeric, 'DIRECTO', false, true,  6, 'CHIA'),
        ('00025',  1.000000::numeric, 'DIRECTO', false, true,  7, 'LINAZA'),
        ('00013', 10.000000::numeric, 'MICRO',   false, true,  8, 'AZUCAR'),
        ('00014',  2.400000::numeric, 'MICRO',   false, true,  9, 'SAL'),
        ('00020',  1.500000::numeric, 'MICRO',   false, true, 10, 'ECOFRESH'),
        ('00021',  0.600000::numeric, 'MICRO',   false, true, 11, 'PROPIONATO'),
        ('00042',  2.000000::numeric, 'MICRO',   false, true, 12, 'AVENA MOLIDA'),
        ('00043',  2.000000::numeric, 'MICRO',   false, true, 13, 'MACHICA'),
        ('00124',  0.400000::numeric, 'MICRO',   false, true, 14, 'MOHOSORBIC'),
        ('AGUA',   59.400000::numeric, 'DIRECTO', false, false, 15, 'AGUA SIN COSTO')
    ) as receta(
      codigo,
      porcentaje,
      destino,
      es_base,
      costea,
      orden,
      observaciones
    )
    join lateral (
      select candidata.id
      from public.materias_primas candidata
      where upper(coalesce(candidata.codigo_contable, '')) = receta.codigo
         or upper(coalesce(candidata.codigo, '')) = receta.codigo
      order by
        case
          when upper(coalesce(candidata.codigo_contable, '')) = receta.codigo
            then 1
          else 2
        end,
        candidata.creado_en
      limit 1
    ) materia on true;

    perform public.fm_activar_version(v_version_id);
  end if;

  select producto.id
  into v_producto_id
  from public.productos producto
  where trim(producto.codigo) = '7868304262196'
  limit 1;

  if v_producto_id is null then
    raise exception
      'No se encontro el SKU GRANOS Y SEMILLAS 500g (7868304262196).';
  end if;

  insert into public.fm_formula_productos (
    formula_id,
    producto_id,
    activo
  )
  values (
    v_formula_id,
    v_producto_id,
    true
  )
  on conflict (formula_id, producto_id) do update
  set activo = true;

  select materia.id
  into v_funda_id
  from public.materias_primas materia
  where upper(coalesce(materia.codigo_contable, '')) = '00033'
     or upper(coalesce(materia.codigo, '')) = '00033'
  order by
    case
      when upper(coalesce(materia.codigo_contable, '')) = '00033' then 1
      else 2
    end,
    materia.creado_en
  limit 1;

  if v_funda_id is null then
    raise exception
      'No se encontro la funda de GRANOS Y SEMILLAS 500g (00033).';
  end if;

  insert into public.fm_producto_empaques (
    producto_id,
    materia_prima_id,
    cantidad_por_unidad,
    activo,
    observaciones
  )
  values (
    v_producto_id,
    v_funda_id,
    1,
    true,
    'Una funda por cada pan terminado de 500 g.'
  )
  on conflict (producto_id, materia_prima_id) do update
  set
    cantidad_por_unidad = excluded.cantidad_por_unidad,
    activo = true,
    observaciones = excluded.observaciones,
    actualizado_en = now();
end;
$$;
