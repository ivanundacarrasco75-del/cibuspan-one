-- CIBUSPAN ONE
-- ROLLO DE CHOCOLATE: dos masas separadas para produccion y un solo costeo
-- conjunto por SKU, con el empaque contabilizado una sola vez.

-- El modelo original permitia una sola formula activa por producto. El Rollo
-- de Chocolate necesita mantener activas sus dos masas para el mismo SKU.
drop index if exists public.fm_producto_una_formula_activa_idx;

create index if not exists fm_formula_productos_producto_activo_idx
  on public.fm_formula_productos (producto_id)
  where activo = true;

create or replace function public.fm_obtener_costos_producto_version(
  p_formula_version_id uuid
)
returns table (
  producto_id uuid,
  producto_codigo text,
  producto_nombre text,
  formula_id uuid,
  formula_codigo text,
  formula_nombre text,
  formula_version_id uuid,
  numero_version integer,
  batch_calculado_kg numeric,
  panes_por_batch integer,
  rendimiento_unidades integer,
  costo_materia_prima_batch numeric,
  costo_materia_prima_kg numeric,
  costo_materia_prima_unidad numeric,
  costo_empaque_unidad numeric,
  costo_materiales_unidad numeric,
  costo_materiales_batch numeric,
  items_sin_costo integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if not public.app_puede_alguna(
    array['Producción', 'Reportes', 'Administración', 'Dashboard']
  ) then
    raise exception 'No tienes permiso para consultar costos.'
      using errcode = '42501';
  end if;

  return query
  with version_solicitada as (
    select
      version.id,
      version.formula_id,
      version.numero_version,
      version.panes_por_batch,
      version.rendimiento_unidades,
      formula.codigo as formula_codigo,
      formula.nombre as formula_nombre,
      coalesce(
        version.rendimiento_unidades,
        version.panes_por_batch,
        0
      )::numeric as unidades_objetivo
    from public.fm_formula_versiones version
    join public.fm_formulas formula
      on formula.id = version.formula_id
    where version.id = p_formula_version_id
  ),
  productos_objetivo as (
    select distinct relacion.producto_id
    from public.fm_formula_productos relacion
    join version_solicitada solicitada
      on solicitada.formula_id = relacion.formula_id
    where relacion.activo = true
  ),
  versiones_elegidas as (
    select
      objetivo.producto_id,
      relacion.formula_id,
      case
        when relacion.formula_id = solicitada.formula_id
          then solicitada.id
        else (
          select version_vigente.id
          from public.fm_formula_versiones version_vigente
          where version_vigente.formula_id = relacion.formula_id
            and version_vigente.estado = 'VIGENTE'
          order by version_vigente.numero_version desc
          limit 1
        )
      end as formula_version_id,
      solicitada.unidades_objetivo
    from productos_objetivo objetivo
    cross join version_solicitada solicitada
    join public.fm_formula_productos relacion
      on relacion.producto_id = objetivo.producto_id
     and relacion.activo = true
  ),
  costos_escalados as (
    select
      elegida.producto_id,
      costo.batch_calculado_kg
        * case
            when coalesce(
              costo.rendimiento_unidades,
              costo.panes_por_batch,
              0
            ) > 0
              then elegida.unidades_objetivo
                / coalesce(
                    costo.rendimiento_unidades,
                    costo.panes_por_batch
                  )
            else 1
          end as batch_calculado_kg,
      costo.costo_materia_prima_batch
        * case
            when coalesce(
              costo.rendimiento_unidades,
              costo.panes_por_batch,
              0
            ) > 0
              then elegida.unidades_objetivo
                / coalesce(
                    costo.rendimiento_unidades,
                    costo.panes_por_batch
                  )
            else 1
          end as costo_materia_prima_batch,
      costo.componentes_sin_costo
    from versiones_elegidas elegida
    join public.fm_vw_costos_formula costo
      on costo.formula_version_id = elegida.formula_version_id
  ),
  ingredientes as (
    select
      costo.producto_id,
      sum(costo.batch_calculado_kg)::numeric
        as batch_calculado_kg,
      sum(costo.costo_materia_prima_batch)::numeric
        as costo_materia_prima_batch,
      sum(costo.componentes_sin_costo)::integer
        as componentes_sin_costo
    from costos_escalados costo
    group by costo.producto_id
  ),
  empaques as (
    select
      empaque.producto_id,
      sum(empaque.costo_empaque_unidad)::numeric
        as costo_empaque_unidad,
      count(*) filter (
        where empaque.costo_incompleto = true
      )::integer as empaques_sin_costo
    from public.fm_vw_empaques_producto_costeados empaque
    group by empaque.producto_id
  )
  select
    producto.id as producto_id,
    producto.codigo as producto_codigo,
    producto.nombre as producto_nombre,
    solicitada.formula_id,
    solicitada.formula_codigo,
    solicitada.formula_nombre,
    solicitada.id as formula_version_id,
    solicitada.numero_version,
    ingredientes.batch_calculado_kg,
    solicitada.panes_por_batch,
    solicitada.rendimiento_unidades,
    ingredientes.costo_materia_prima_batch,
    (
      ingredientes.costo_materia_prima_batch
      / nullif(ingredientes.batch_calculado_kg, 0)
    )::numeric as costo_materia_prima_kg,
    (
      ingredientes.costo_materia_prima_batch
      / nullif(solicitada.unidades_objetivo, 0)
    )::numeric as costo_materia_prima_unidad,
    coalesce(empaques.costo_empaque_unidad, 0)::numeric
      as costo_empaque_unidad,
    (
      ingredientes.costo_materia_prima_batch
        / nullif(solicitada.unidades_objetivo, 0)
      + coalesce(empaques.costo_empaque_unidad, 0)
    )::numeric as costo_materiales_unidad,
    (
      ingredientes.costo_materia_prima_batch
      + coalesce(empaques.costo_empaque_unidad, 0)
        * solicitada.unidades_objetivo
    )::numeric as costo_materiales_batch,
    (
      ingredientes.componentes_sin_costo
      + coalesce(empaques.empaques_sin_costo, 0)
    )::integer as items_sin_costo
  from productos_objetivo objetivo
  join public.productos producto
    on producto.id = objetivo.producto_id
  cross join version_solicitada solicitada
  join ingredientes
    on ingredientes.producto_id = objetivo.producto_id
  left join empaques
    on empaques.producto_id = objetivo.producto_id
  order by producto.nombre;
end;
$$;

revoke all on function public.fm_obtener_costos_producto_version(uuid)
  from public, anon;
grant execute on function public.fm_obtener_costos_producto_version(uuid)
  to authenticated;

do $$
declare
  v_formula_blanca_id uuid;
  v_version_blanca_id uuid;
  v_micro_blanca_id uuid;
  v_formula_chocolate_id uuid;
  v_version_chocolate_id uuid;
  v_micro_chocolate_id uuid;
  v_funda_id uuid;
  v_componentes integer;
  v_productos_encontrados integer;
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

  with requeridas(codigo) as (
    values
      ('00011'),
      ('00016'),
      ('00017'),
      ('00015'),
      ('00023'),
      ('00013'),
      ('00014'),
      ('00020'),
      ('00019'),
      ('00021'),
      ('00115'),
      ('00124'),
      ('00026'),
      ('00029'),
      ('00034'),
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
      'Faltan materias primas para ROLLO DE CHOCOLATE: %',
      v_faltantes;
  end if;

  insert into public.fm_formulas (
    codigo,
    nombre,
    descripcion,
    activo
  )
  values (
    'ROLLO MASA BLANCA',
    'ROLLO DE CHOCOLATE · MASA BLANCA',
    'Primera de las dos masas del Rollo de Chocolate. Se prepara e imprime por separado y se costea junto con la masa de chocolate.',
    true
  )
  on conflict (codigo) do update
  set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    activo = true,
    actualizado_en = now()
  returning id into v_formula_blanca_id;

  insert into public.fm_micros (
    codigo,
    nombre,
    descripcion,
    activo
  )
  values (
    'MIC-ROLLO-BLANCA',
    'MICRO ROLLO MASA BLANCA',
    'Micro de azucar, sal, ECOFRESH, leche en polvo, propionato, yema en polvo y MOHOSORBIC.',
    true
  )
  on conflict (codigo) do update
  set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    activo = true,
    actualizado_en = now()
  returning id into v_micro_blanca_id;

  select version.id
  into v_version_blanca_id
  from public.fm_formula_versiones version
  where version.formula_id = v_formula_blanca_id
    and version.numero_version = 1;

  if v_version_blanca_id is null then
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
      v_formula_blanca_id,
      1,
      'BORRADOR',
      120,
      295,
      500,
      35.418,
      120,
      1,
      14.529915,
      'Masa blanca del Rollo de Chocolate. Peso de bola grande: 5.900 kg. Peso calculado del micro: 5.008 kg. Cada rollo terminado usa 295 g de esta masa y 290 g de la masa de chocolate.'
    )
    returning id into v_version_blanca_id;
  end if;

  select count(*)
  into v_componentes
  from public.fm_preformulacion_componentes componente
  where componente.formula_version_id = v_version_blanca_id;

  if v_componentes = 0 then
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
      v_version_blanca_id,
      materia.id,
      receta.porcentaje,
      receta.destino,
      case when receta.destino = 'MICRO' then v_micro_blanca_id end,
      receta.es_base,
      receta.costea,
      receta.orden,
      receta.observaciones
    from (
      values
        ('00011', 100.000000::numeric, 'DIRECTO', true,  true,  1, 'HARINA BLANCA'),
        ('00016',   1.150000::numeric, 'DIRECTO', false, true,  2, 'LEVADURA'),
        ('00017',   0.600000::numeric, 'DIRECTO', false, true,  3, 'VINAGRE'),
        ('00015',  17.000000::numeric, 'DIRECTO', false, true,  4, 'MANTECA'),
        ('00023',   1.000000::numeric, 'DIRECTO', false, true,  5, 'VAINILLA FRANCESA'),
        ('00013',  22.000000::numeric, 'MICRO',   false, true,  6, 'AZUCAR'),
        ('00014',   0.500000::numeric, 'MICRO',   false, true,  7, 'SAL'),
        ('00020',   1.000000::numeric, 'MICRO',   false, true,  8, 'ECOFRESH'),
        ('00019',   3.000000::numeric, 'MICRO',   false, true,  9, 'LECHE EN POLVO'),
        ('00021',   0.200000::numeric, 'MICRO',   false, true, 10, 'PROPIONATO'),
        ('00115',   1.250000::numeric, 'MICRO',   false, true, 11, 'YEMA EN POLVO'),
        ('00124',   0.400000::numeric, 'MICRO',   false, true, 12, 'MOHOSORBIC'),
        ('AGUA',    52.400000::numeric, 'DIRECTO', false, false, 13, 'AGUA SIN COSTO')
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

    perform public.fm_activar_version(v_version_blanca_id);
  end if;

  insert into public.fm_formulas (
    codigo,
    nombre,
    descripcion,
    activo
  )
  values (
    'ROLLO MASA CHOCOLATE',
    'ROLLO DE CHOCOLATE · MASA CHOCOLATE',
    'Segunda de las dos masas del Rollo de Chocolate. Se prepara e imprime por separado y se costea junto con la masa blanca.',
    true
  )
  on conflict (codigo) do update
  set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    activo = true,
    actualizado_en = now()
  returning id into v_formula_chocolate_id;

  insert into public.fm_micros (
    codigo,
    nombre,
    descripcion,
    activo
  )
  values (
    'MIC-ROLLO-CHOCOLATE',
    'MICRO ROLLO MASA CHOCOLATE',
    'Micro de azucar, sal, ECOFRESH, propionato, polvo de cacao y MOHOSORBIC.',
    true
  )
  on conflict (codigo) do update
  set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    activo = true,
    actualizado_en = now()
  returning id into v_micro_chocolate_id;

  select version.id
  into v_version_chocolate_id
  from public.fm_formula_versiones version
  where version.formula_id = v_formula_chocolate_id
    and version.numero_version = 1;

  if v_version_chocolate_id is null then
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
      v_formula_chocolate_id,
      1,
      'BORRADOR',
      120,
      290,
      500,
      34.817,
      120,
      1,
      14.529915,
      'Masa de chocolate del Rollo de Chocolate. Peso de bola grande: 5.800 kg. Peso calculado del micro: 4.975 kg. Cada rollo terminado usa 290 g de esta masa y 295 g de la masa blanca.'
    )
    returning id into v_version_chocolate_id;
  end if;

  select count(*)
  into v_componentes
  from public.fm_preformulacion_componentes componente
  where componente.formula_version_id = v_version_chocolate_id;

  if v_componentes = 0 then
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
      v_version_chocolate_id,
      materia.id,
      receta.porcentaje,
      receta.destino,
      case when receta.destino = 'MICRO' then v_micro_chocolate_id end,
      receta.es_base,
      receta.costea,
      receta.orden,
      receta.observaciones
    from (
      values
        ('00011', 100.000000::numeric, 'DIRECTO', true,  true,  1, 'HARINA BLANCA'),
        ('00016',   1.200000::numeric, 'DIRECTO', false, true,  2, 'LEVADURA'),
        ('00026',  28.000000::numeric, 'DIRECTO', false, true,  3, 'MONEDAS DE CHOCOLATE'),
        ('00017',   0.600000::numeric, 'DIRECTO', false, true,  4, 'VINAGRE'),
        ('00015',  15.000000::numeric, 'DIRECTO', false, true,  5, 'MANTECA'),
        ('00013',  24.000000::numeric, 'MICRO',   false, true,  6, 'AZUCAR'),
        ('00014',   0.500000::numeric, 'MICRO',   false, true,  7, 'SAL'),
        ('00020',   1.000000::numeric, 'MICRO',   false, true,  8, 'ECOFRESH'),
        ('00021',   0.200000::numeric, 'MICRO',   false, true,  9, 'PROPIONATO'),
        ('00029',   8.400000::numeric, 'MICRO',   false, true, 10, 'POLVO DE CACAO'),
        ('00124',   0.400000::numeric, 'MICRO',   false, true, 11, 'MOHOSORBIC'),
        ('AGUA',    62.150000::numeric, 'DIRECTO', false, false, 12, 'AGUA SIN COSTO')
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

    perform public.fm_activar_version(v_version_chocolate_id);
  end if;

  select count(distinct trim(producto.codigo))
  into v_productos_encontrados
  from public.productos producto
  where trim(producto.codigo) in (
    '7868304262219',
    '7868304262219T'
  );

  if v_productos_encontrados <> 2 then
    raise exception
      'Deben existir los dos SKU de Rollo de Chocolate: 7868304262219 y 7868304262219T.';
  end if;

  insert into public.fm_formula_productos (
    formula_id,
    producto_id,
    activo
  )
  select
    formula.id,
    producto.id,
    true
  from (
    values
      (v_formula_blanca_id),
      (v_formula_chocolate_id)
  ) as formula(id)
  cross join public.productos producto
  where trim(producto.codigo) in (
    '7868304262219',
    '7868304262219T'
  )
  on conflict (formula_id, producto_id) do update
  set activo = true;

  select materia.id
  into v_funda_id
  from public.materias_primas materia
  where upper(coalesce(materia.codigo_contable, '')) = '00034'
     or upper(coalesce(materia.codigo, '')) = '00034'
  order by
    case
      when upper(coalesce(materia.codigo_contable, '')) = '00034' then 1
      else 2
    end,
    materia.creado_en
  limit 1;

  insert into public.fm_producto_empaques (
    producto_id,
    materia_prima_id,
    cantidad_por_unidad,
    activo,
    observaciones
  )
  select
    producto.id,
    v_funda_id,
    1,
    true,
    'Una funda 00034 por cada Rollo de Chocolate terminado. El costeo conjunto suma las dos masas y contabiliza esta funda una sola vez.'
  from public.productos producto
  where trim(producto.codigo) in (
    '7868304262219',
    '7868304262219T'
  )
  on conflict (producto_id, materia_prima_id) do update
  set
    cantidad_por_unidad = excluded.cantidad_por_unidad,
    activo = true,
    observaciones = excluded.observaciones,
    actualizado_en = now();
end;
$$;
