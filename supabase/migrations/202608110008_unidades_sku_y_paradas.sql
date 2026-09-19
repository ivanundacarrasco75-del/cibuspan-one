-- CIBUSPAN ONE
-- Distingue las unidades individuales, los SKU terminados y las paradas.

alter table public.fm_formula_versiones
  add column if not exists paradas_por_batch numeric(12,3)
  not null default 1
  check (paradas_por_batch > 0);

comment on column public.fm_formula_versiones.paradas_por_batch is
  'Numero de paradas de produccion representadas por el batch de la version.';

-- BOTON DULCE: 1.920 botones forman 192 fundas de 10 unidades y equivalen
-- a dos paradas de 960 botones cada una.
update public.fm_formula_versiones version
set
  panes_por_batch = 1920,
  rendimiento_unidades = 192,
  paradas_por_batch = 2,
  actualizado_en = now()
from public.fm_formulas formula
where formula.id = version.formula_id
  and formula.codigo = 'BOTON DULCE'
  and version.numero_version = 1;

-- Las nuevas reformulaciones deben conservar esta informacion operativa.
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
    raise exception 'No existe una sesion valida.';
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
    raise exception 'No se encontro la version que deseas reformular.';
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
    paradas_por_batch,
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
    v_origen.paradas_por_batch,
    v_origen.merma_porcentaje,
    concat(
      'Reformulacion creada desde la version ',
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

