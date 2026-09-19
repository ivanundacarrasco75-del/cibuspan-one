-- CIBUSPAN ONE
-- Carga inicial idempotente de BOTON DE MANJAR 360G.

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
    'BOTON MANJAR',
    'BOTON DE MANJAR 360G',
    'Boton de manjar de 35 g. Batch de 1.920 botones para 192 fundas.',
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
    'MIC-BOTON-MANJAR',
    'MICRO BOTON DE MANJAR',
    'Micro de sal, azucar, ECOFRESH, propionato, yema en polvo y MOHOSORBIC.',
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
      1920,
      42,
      35,
      80.680,
      192,
      2,
      16.666667,
      '48 botones por lata. 960 botones por parada. 10 botones por funda. Peso de bola grande: 3.024 kg. Peso calculado del micro: 6.664 kg.'
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
        ('00016'),
        ('00017'),
        ('00070'),
        ('00089'),
        ('00098'),
        ('00014'),
        ('00013'),
        ('00020'),
        ('00021'),
        ('00115'),
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
        'Faltan materias primas para BOTON DE MANJAR: %',
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
        ('00011', 100.000000::numeric, 'DIRECTO', true,  true,  1, 'HARINA BLANCA'),
        ('00016',   1.000000::numeric, 'DIRECTO', false, true,  2, 'LEVADURA'),
        ('00017',   0.600000::numeric, 'DIRECTO', false, true,  3, 'VINAGRE'),
        ('00070',  24.000000::numeric, 'DIRECTO', false, true,  4, 'MARGARINA'),
        ('00089',  35.000000::numeric, 'DIRECTO', false, true,  5, 'CHIP DE MANJAR'),
        ('00098',   0.100000::numeric, 'DIRECTO', false, true,  6, 'ESENCIA MANJAR'),
        ('00014',   1.800000::numeric, 'MICRO',   false, true,  7, 'SAL'),
        ('00013',  14.000000::numeric, 'MICRO',   false, true,  8, 'AZUCAR'),
        ('00020',   1.500000::numeric, 'MICRO',   false, true,  9, 'ECOFRESH'),
        ('00021',   0.200000::numeric, 'MICRO',   false, true, 10, 'PROPIONATO'),
        ('00115',   1.250000::numeric, 'MICRO',   false, true, 11, 'YEMA EN POLVO'),
        ('00124',   0.400000::numeric, 'MICRO',   false, true, 12, 'MOHOSORBIC'),
        ('AGUA',    52.000000::numeric, 'DIRECTO', false, false, 13, 'AGUA SIN COSTO')
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
  where trim(producto.codigo) = '7868304276322'
  limit 1;

  if v_producto_id is null then
    raise exception
      'No se encontro el SKU BOTON DE MANJAR 360g (7868304276322).';
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
  where upper(coalesce(materia.codigo_contable, '')) = '00086'
     or upper(coalesce(materia.codigo, '')) = '00086'
  order by
    case
      when upper(coalesce(materia.codigo_contable, '')) = '00086' then 1
      else 2
    end,
    materia.creado_en
  limit 1;

  if v_funda_id is null then
    raise exception
      'No se encontro la funda de BOTON DE MANJAR 360g (00086).';
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
    'Una funda por cada SKU terminado de 10 botones.'
  )
  on conflict (producto_id, materia_prima_id) do update
  set
    cantidad_por_unidad = excluded.cantidad_por_unidad,
    activo = true,
    observaciones = excluded.observaciones,
    actualizado_en = now();
end;
$$;
