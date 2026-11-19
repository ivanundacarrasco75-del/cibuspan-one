begin;

alter table public.materias_primas
  add column if not exists costo_unitario_referencia numeric(16,8)
  check (costo_unitario_referencia > 0);

create or replace view public.materias_primas_costo_actual
with (security_invoker = true)
as
select materia.id,
       materia.codigo,
       materia.codigo_contable,
       materia.nombre,
       materia.nombre_corto,
       materia.unidad_base,
       materia.incluir_en_costeo,
       materia.es_empaque,
       materia.activo,
       categoria.nombre as categoria,
       costo.fecha_corte,
       costo.stock,
       costo.costo_total,
       coalesce(costo.costo_unitario, materia.costo_unitario_referencia)::numeric(16,8) as costo_unitario
from public.materias_primas materia
left join public.categorias_materia_prima categoria on categoria.id = materia.categoria_id
left join lateral (
  select historial.fecha_corte, historial.stock, historial.costo_total, historial.costo_unitario
  from public.materia_prima_costos historial
  where historial.materia_prima_id = materia.id and historial.costo_unitario > 0
  order by historial.fecha_corte desc, historial.creado_en desc
  limit 1
) costo on true;

do $$
declare
  v_categoria_id uuid;
  v_funda_id uuid;
  v_brioche_id uuid;
  v_ham001_id uuid;
begin
  select id into strict v_categoria_id
  from public.categorias_materia_prima where nombre = 'Empaques';

  select id into strict v_brioche_id
  from public.productos where codigo = 'HAM-003' and activo;

  select id into strict v_ham001_id
  from public.productos where codigo = 'HAM001' and activo;

  insert into public.materias_primas (
    codigo, nombre, nombre_corto, unidad_base, categoria_id,
    es_empaque, incluir_en_costeo, activo, costo_unitario_referencia, observaciones
  )
  values (
    'FUNDA-ARROBERA', 'FUNDA ARROBERA', 'FUNDA ARROBERA', 'UNIDAD', v_categoria_id,
    true, true, true, 7.90::numeric / 100,
    'Costo de referencia informado el 16/11/2026. USD 7,90 por 100 fundas.'
  )
  on conflict (codigo) do nothing;

  select id into strict v_funda_id
  from public.materias_primas
  where codigo = 'FUNDA-ARROBERA' and nombre = 'FUNDA ARROBERA'
    and activo and es_empaque and incluir_en_costeo and unidad_base = 'UNIDAD';

  insert into public.fm_producto_empaques (
    producto_id, materia_prima_id, cantidad_por_unidad, activo, observaciones
  )
  values
    (v_brioche_id, v_funda_id, 1, true, 'Una funda por presentación de 10 panes.'),
    (v_ham001_id, v_funda_id, 1::numeric / 10, true, 'Una funda por 10 panes, prorrateada por pan.')
  on conflict (producto_id, materia_prima_id) do nothing;
end;
$$;

commit;
