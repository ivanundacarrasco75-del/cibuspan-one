-- CIBUSPAN ONE
-- Reformulación versionada y lectura segura del costeo de empaques.

create or replace function public.fm_crear_reformulacion(
  p_formula_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen public.fm_formula_versiones%rowtype;
  v_nueva_version_id uuid;
  v_numero_version integer;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.';
  end if;

  if not public.app_puede_alguna(
    array['Producción', 'Administración']
  ) then
    raise exception 'No tienes permiso para reformular.'
      using errcode = '42501';
  end if;

  select version.*
  into v_origen
  from public.fm_formula_versiones version
  where version.id = p_formula_version_id;

  if v_origen.id is null then
    raise exception 'No se encontró la versión que deseas reformular.';
  end if;

  select coalesce(max(version.numero_version), 0) + 1
  into v_numero_version
  from public.fm_formula_versiones version
  where version.formula_id = v_origen.formula_id;

  insert into public.fm_formula_versiones (
    formula_id,
    numero_version,
    estado,
    panes_por_batch,
    peso_bola_g,
    peso_final_g,
    peso_batch_kg,
    rendimiento_unidades,
    merma_porcentaje,
    observaciones,
    creado_por
  )
  values (
    v_origen.formula_id,
    v_numero_version,
    'BORRADOR',
    v_origen.panes_por_batch,
    v_origen.peso_bola_g,
    v_origen.peso_final_g,
    v_origen.peso_batch_kg,
    v_origen.rendimiento_unidades,
    v_origen.merma_porcentaje,
    concat(
      'Reformulación creada desde la versión ',
      v_origen.numero_version,
      '. ',
      coalesce(v_origen.observaciones, '')
    ),
    auth.uid()
  )
  returning id into v_nueva_version_id;

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
    v_nueva_version_id,
    componente.materia_prima_id,
    componente.porcentaje_panadero,
    componente.destino_tipo,
    componente.micro_id,
    componente.es_harina_base,
    componente.incluir_en_costeo,
    componente.orden,
    componente.observaciones
  from public.fm_preformulacion_componentes componente
  where componente.formula_version_id = p_formula_version_id
  order by componente.orden;

  return v_nueva_version_id;
end;
$$;

revoke all on function public.fm_crear_reformulacion(uuid)
  from public, anon;
grant execute on function public.fm_crear_reformulacion(uuid)
  to authenticated;

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
    raise exception 'No existe una sesión válida.';
  end if;

  if not public.app_puede_alguna(
    array['Producción', 'Reportes', 'Administración', 'Dashboard']
  ) then
    raise exception 'No tienes permiso para consultar costos.'
      using errcode = '42501';
  end if;

  return query
  select
    costo.producto_id,
    costo.producto_codigo,
    costo.producto_nombre,
    costo.formula_id,
    costo.formula_codigo,
    costo.formula_nombre,
    costo.formula_version_id,
    costo.numero_version,
    costo.batch_calculado_kg,
    costo.panes_por_batch,
    costo.rendimiento_unidades,
    costo.costo_materia_prima_batch,
    costo.costo_materia_prima_kg,
    costo.costo_materia_prima_unidad,
    costo.costo_empaque_unidad,
    costo.costo_materiales_unidad,
    costo.costo_materiales_batch,
    costo.items_sin_costo
  from public.fm_vw_productos_costo_completo costo
  where costo.formula_version_id = p_formula_version_id
  order by costo.producto_nombre;
end;
$$;

revoke all on function public.fm_obtener_costos_producto_version(uuid)
  from public, anon;
grant execute on function public.fm_obtener_costos_producto_version(uuid)
  to authenticated;

create or replace function public.fm_obtener_empaques_formula_version(
  p_formula_version_id uuid
)
returns table (
  producto_id uuid,
  producto_codigo text,
  producto_nombre text,
  materia_prima_id uuid,
  materia_codigo text,
  materia_nombre text,
  cantidad_por_unidad numeric,
  precio_empaque numeric,
  costo_empaque_unidad numeric,
  fecha_costo date,
  costo_incompleto boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.';
  end if;

  if not public.app_puede_alguna(
    array['Producción', 'Reportes', 'Administración', 'Dashboard']
  ) then
    raise exception 'No tienes permiso para consultar empaques.'
      using errcode = '42501';
  end if;

  return query
  select
    empaque.producto_id,
    empaque.producto_codigo,
    empaque.producto_nombre,
    empaque.materia_prima_id,
    empaque.materia_codigo,
    empaque.materia_nombre,
    empaque.cantidad_por_unidad,
    empaque.costo_unitario as precio_empaque,
    empaque.costo_empaque_unidad,
    empaque.fecha_costo,
    empaque.costo_incompleto
  from public.fm_vw_empaques_producto_costeados empaque
  join public.fm_formula_productos relacion
    on relacion.producto_id = empaque.producto_id
   and relacion.activo = true
  join public.fm_formula_versiones version
    on version.formula_id = relacion.formula_id
  where version.id = p_formula_version_id
  order by empaque.producto_nombre, empaque.materia_nombre;
end;
$$;

revoke all on function public.fm_obtener_empaques_formula_version(uuid)
  from public, anon;
grant execute on function public.fm_obtener_empaques_formula_version(uuid)
  to authenticated;
