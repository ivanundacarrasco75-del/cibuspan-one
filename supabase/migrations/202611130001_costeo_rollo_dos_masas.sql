create or replace view public.fm_vw_productos_costo_completo
with (security_invoker = true)
as
with empaques as (
  select
    producto_id,
    sum(costo_empaque_unidad)::numeric(16,8) as costo_empaque_unidad,
    count(*) filter (where costo_incompleto)::integer as empaques_sin_costo
  from public.fm_vw_empaques_producto_costeados
  group by producto_id
), masas_rollo as (
  select
    producto.id as producto_id,
    masa.codigo,
    costo.*,
    nullif(coalesce(costo.rendimiento_unidades, costo.panes_por_batch), 0)
      as unidades_lote
  from public.productos producto
  cross join (values ('ROLLO MASA BLANCA'), ('ROLLO MASA CHOCOLATE')) masa(codigo)
  left join lateral (
    select costo.*
    from public.fm_formula_productos relacion
    join public.fm_formulas formula on formula.id = relacion.formula_id
    join public.fm_vw_costos_formula costo on costo.formula_id = formula.id
    where relacion.producto_id = producto.id
      and relacion.activo
      and formula.activo
      and formula.codigo = masa.codigo
      and costo.estado = 'VIGENTE'
    order by costo.numero_version desc, costo.formula_version_id
    limit 1
  ) costo on true
  where producto.codigo in ('7868304262219', '7868304262219T')
), sumas_rollo as (
  select
    producto_id,
    sum(costo_materia_prima_batch / unidades_lote) as costo_unitario,
    sum(batch_calculado_kg / unidades_lote) as kg_unitarios,
    count(*) filter (
      where unidades_lote is null or unidades_lote < 0
        or batch_calculado_kg is null or batch_calculado_kg <= 0
        or costo_materia_prima_batch is null
        or componentes_sin_costo is null
    ) as masas_sin_base,
    coalesce(sum(componentes_sin_costo), 0) as componentes_sin_costo
  from masas_rollo
  group by producto_id
), costos as (
  select
    relacion.producto_id,
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
    costo.componentes_sin_costo,
    true as base_completa
  from public.fm_formula_productos relacion
  join public.productos producto on producto.id = relacion.producto_id
  join public.fm_vw_costos_formula costo on costo.formula_id = relacion.formula_id
  where relacion.activo
    and producto.codigo is distinct from '7868304262219'
    and producto.codigo is distinct from '7868304262219T'

  union all

  -- El lote de referencia es el de masa blanca. La masa de chocolate se
  -- prorratea por su propio rendimiento para costear la misma cantidad de rollos.
  select
    base.producto_id,
    base.formula_id,
    base.formula_codigo,
    base.formula_nombre,
    base.formula_version_id,
    base.numero_version,
    case when sumas.masas_sin_base = 0 then sumas.kg_unitarios * base.unidades_lote end,
    base.panes_por_batch,
    base.unidades_lote,
    case when sumas.masas_sin_base = 0 then sumas.costo_unitario * base.unidades_lote end,
    case when sumas.masas_sin_base = 0 then sumas.costo_unitario / nullif(sumas.kg_unitarios, 0) end,
    case when sumas.masas_sin_base = 0 then sumas.costo_unitario end,
    (sumas.componentes_sin_costo + sumas.masas_sin_base)::integer,
    sumas.masas_sin_base = 0
  from masas_rollo base
  join sumas_rollo sumas on sumas.producto_id = base.producto_id
  where base.codigo = 'ROLLO MASA BLANCA'
)
select
  producto.id as producto_id,
  producto.codigo as producto_codigo,
  producto.nombre as producto_nombre,
  costo.formula_id,
  costo.formula_codigo,
  costo.formula_nombre,
  costo.formula_version_id,
  costo.numero_version,
  costo.batch_calculado_kg::numeric(14,4) as batch_calculado_kg,
  costo.panes_por_batch,
  costo.rendimiento_unidades,
  costo.costo_materia_prima_batch::numeric(16,6) as costo_materia_prima_batch,
  costo.costo_materia_prima_kg::numeric(16,8) as costo_materia_prima_kg,
  costo.costo_materia_prima_unidad::numeric(16,8) as costo_materia_prima_unidad,
  coalesce(empaque.costo_empaque_unidad, 0)::numeric(16,8) as costo_empaque_unidad,
  (case when costo.base_completa then
    coalesce(costo.costo_materia_prima_unidad, 0)
      + coalesce(empaque.costo_empaque_unidad, 0)
  end)::numeric(16,8) as costo_materiales_unidad,
  (case when costo.base_completa then
    coalesce(costo.costo_materia_prima_batch, 0)
      + coalesce(empaque.costo_empaque_unidad, 0)
        * coalesce(costo.rendimiento_unidades, costo.panes_por_batch, 0)
  end)::numeric(16,6) as costo_materiales_batch,
  (costo.componentes_sin_costo + coalesce(empaque.empaques_sin_costo, 0))::integer
    as items_sin_costo
from costos costo
join public.productos producto on producto.id = costo.producto_id
left join empaques empaque on empaque.producto_id = producto.id;
