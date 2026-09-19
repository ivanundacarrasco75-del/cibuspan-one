-- CIBUSPAN ONE
-- Soporte para bases de harina compuestas, costo de empaques y carga inicial
-- de PAN INTEGRAL 600G.

-- Una fórmula puede tener más de un componente como base, siempre que la suma
-- de sus porcentajes panaderos sea exactamente 100%.
drop index if exists public.fm_una_harina_base_idx;

create index if not exists fm_harinas_base_idx
  on public.fm_preformulacion_componentes (formula_version_id)
  where es_harina_base = true;

create or replace function public.fm_validar_componente_preformulacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_estado text;
  v_micro_activo boolean;
begin
  select estado
  into v_estado
  from public.fm_formula_versiones
  where id = new.formula_version_id;

  if v_estado is null then
    raise exception
      'No se encontró la versión de fórmula.';
  end if;

  if v_estado <> 'BORRADOR' then
    raise exception
      'Solo se pueden modificar versiones en BORRADOR.';
  end if;

  if new.es_harina_base = true then
    if new.destino_tipo <> 'DIRECTO' then
      raise exception
        'Los componentes de la base de harina deben ingresar directamente a la fórmula.';
    end if;

    if new.porcentaje_panadero <= 0 then
      raise exception
        'Cada componente de la base de harina debe tener un porcentaje mayor que cero.';
    end if;
  end if;

  if new.destino_tipo = 'DIRECTO' then
    new.micro_id := null;
  end if;

  if new.destino_tipo = 'MICRO' then
    if new.micro_id is null then
      raise exception
        'Selecciona el micro de destino.';
    end if;

    select activo
    into v_micro_activo
    from public.fm_micros
    where id = new.micro_id;

    if coalesce(v_micro_activo, false) = false then
      raise exception
        'El micro seleccionado no existe o está inactivo.';
    end if;

    new.es_harina_base := false;
  end if;

  return new;
end;
$$;

create or replace function public.fm_validar_version(
  p_formula_version_id uuid
)
returns table(es_valida boolean, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_componentes integer;
  v_harinas_base integer;
  v_porcentaje_harina numeric;
begin
  select count(*)
  into v_componentes
  from public.fm_preformulacion_componentes
  where formula_version_id = p_formula_version_id;

  if v_componentes = 0 then
    return query
    select false, 'La preformulación no tiene componentes.';
    return;
  end if;

  select
    count(*),
    coalesce(sum(porcentaje_panadero), 0)
  into
    v_harinas_base,
    v_porcentaje_harina
  from public.fm_preformulacion_componentes
  where formula_version_id = p_formula_version_id
    and es_harina_base = true;

  if v_harinas_base < 1 then
    return query
    select false, 'Debe existir al menos un componente de la base de harina.';
    return;
  end if;

  if abs(v_porcentaje_harina - 100) > 0.000001 then
    return query
    select
      false,
      format(
        'Los componentes de la base de harina deben sumar 100%%. Actualmente suman %s%%.',
        v_porcentaje_harina
      );
    return;
  end if;

  if exists (
    select 1
    from public.fm_preformulacion_componentes
    where formula_version_id = p_formula_version_id
      and destino_tipo = 'MICRO'
      and micro_id is null
  ) then
    return query
    select false, 'Existen ingredientes sin micro asignado.';
    return;
  end if;

  return query
  select true, 'La fórmula es válida.';
end;
$$;

grant execute on function public.fm_validar_version(uuid) to authenticated;

-- Empaques consumidos por cada unidad terminada.
create table if not exists public.fm_producto_empaques (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null
    references public.productos(id) on delete restrict,
  materia_prima_id uuid not null
    references public.materias_primas(id) on delete restrict,
  cantidad_por_unidad numeric(14,6) not null default 1,
  activo boolean not null default true,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint fm_producto_empaques_cantidad_check
    check (cantidad_por_unidad > 0),
  constraint fm_producto_empaques_producto_materia_key
    unique (producto_id, materia_prima_id)
);

create index if not exists fm_producto_empaques_producto_idx
  on public.fm_producto_empaques (producto_id)
  where activo = true;

drop trigger if exists fm_producto_empaques_actualizar_timestamp
  on public.fm_producto_empaques;

create trigger fm_producto_empaques_actualizar_timestamp
before update on public.fm_producto_empaques
for each row execute function public.fm_actualizar_timestamp();

alter table public.fm_producto_empaques enable row level security;
revoke all on table public.fm_producto_empaques from anon;
grant select, insert, update, delete
  on table public.fm_producto_empaques to authenticated;

drop policy if exists c1_base_autenticado
  on public.fm_producto_empaques;
drop policy if exists c1_modulo_lectura
  on public.fm_producto_empaques;
drop policy if exists c1_modulo_inserta
  on public.fm_producto_empaques;
drop policy if exists c1_modulo_actualiza
  on public.fm_producto_empaques;
drop policy if exists c1_modulo_elimina
  on public.fm_producto_empaques;

create policy c1_base_autenticado
on public.fm_producto_empaques
as permissive
for all
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy c1_modulo_lectura
on public.fm_producto_empaques
as restrictive
for select
to authenticated
using (
  public.app_puede_alguna(
    array['Producción', 'Reportes', 'Administración', 'Dashboard']
  )
);

create policy c1_modulo_inserta
on public.fm_producto_empaques
as restrictive
for insert
to authenticated
with check (
  public.app_puede_alguna(array['Producción', 'Administración'])
);

create policy c1_modulo_actualiza
on public.fm_producto_empaques
as restrictive
for update
to authenticated
using (
  public.app_puede_alguna(array['Producción', 'Administración'])
)
with check (
  public.app_puede_alguna(array['Producción', 'Administración'])
);

create policy c1_modulo_elimina
on public.fm_producto_empaques
as restrictive
for delete
to authenticated
using (
  public.app_puede_alguna(array['Producción', 'Administración'])
);

drop trigger if exists c1_validar_escritura_modulo
  on public.fm_producto_empaques;

create trigger c1_validar_escritura_modulo
before insert or update or delete on public.fm_producto_empaques
for each row execute function public.app_validar_escritura_modulo(
  '{Producción,Administración}'
);

-- Costo de empaques por producto y costo material completo por versión.
create or replace view public.fm_vw_empaques_producto_costeados
with (security_invoker = true)
as
select
  empaque.producto_id,
  producto.codigo as producto_codigo,
  producto.nombre as producto_nombre,
  empaque.materia_prima_id,
  materia.codigo as materia_codigo,
  materia.nombre as materia_nombre,
  materia.unidad_base,
  empaque.cantidad_por_unidad,
  costo.fecha_corte as fecha_costo,
  costo.costo_unitario,
  case
    when materia.incluir_en_costeo = false then 0::numeric
    when costo.costo_unitario is null then 0::numeric
    else empaque.cantidad_por_unidad * costo.costo_unitario
  end::numeric(16,8) as costo_empaque_unidad,
  (
    materia.incluir_en_costeo = true
    and costo.costo_unitario is null
  ) as costo_incompleto
from public.fm_producto_empaques empaque
join public.productos producto
  on producto.id = empaque.producto_id
join public.materias_primas materia
  on materia.id = empaque.materia_prima_id
left join public.materias_primas_costo_actual costo
  on costo.id = empaque.materia_prima_id
where empaque.activo = true;

create or replace view public.fm_vw_productos_costo_completo
with (security_invoker = true)
as
with empaques as (
  select
    producto_id,
    sum(costo_empaque_unidad)::numeric(16,8)
      as costo_empaque_unidad,
    count(*) filter (where costo_incompleto = true)::integer
      as empaques_sin_costo
  from public.fm_vw_empaques_producto_costeados
  group by producto_id
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
  costo.batch_calculado_kg,
  costo.panes_por_batch,
  costo.rendimiento_unidades,
  costo.costo_materia_prima_batch,
  costo.costo_materia_prima_kg,
  costo.costo_materia_prima_unidad,
  coalesce(empaque.costo_empaque_unidad, 0)::numeric(16,8)
    as costo_empaque_unidad,
  (
    coalesce(costo.costo_materia_prima_unidad, 0)
    + coalesce(empaque.costo_empaque_unidad, 0)
  )::numeric(16,8) as costo_materiales_unidad,
  (
    coalesce(costo.costo_materia_prima_batch, 0)
    + coalesce(empaque.costo_empaque_unidad, 0)
      * coalesce(costo.rendimiento_unidades, costo.panes_por_batch, 0)
  )::numeric(16,6) as costo_materiales_batch,
  (
    costo.componentes_sin_costo
    + coalesce(empaque.empaques_sin_costo, 0)
  )::integer as items_sin_costo
from public.fm_formula_productos relacion
join public.productos producto
  on producto.id = relacion.producto_id
join public.fm_vw_costos_formula costo
  on costo.formula_id = relacion.formula_id
left join empaques empaque
  on empaque.producto_id = producto.id
where relacion.activo = true;

grant select on public.fm_vw_empaques_producto_costeados
  to authenticated;
grant select on public.fm_vw_productos_costo_completo
  to authenticated;
revoke all on public.fm_vw_empaques_producto_costeados from anon;
revoke all on public.fm_vw_productos_costo_completo from anon;

-- Carga inicial idempotente de PAN INTEGRAL 600G.
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
    'Sin costo por decisión de costeo de la fórmula.'
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
    'PAN-INT-600',
    'PAN INTEGRAL 600G',
    'Pan integral de 600 g. Base compuesta por harina de trigo y afrecho.',
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
    'MIC-INT-600',
    'MICRO PAN INTEGRAL 600G',
    'Micro de azúcar, sal, ECOFRESH, propionato y MOHOSORBIC.',
    true
  )
  on conflict (codigo) do update
  set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    activo = true,
    actualizado_en = now()
  returning id into v_micro_id;

  select id
  into v_version_id
  from public.fm_formula_versiones
  where formula_id = v_formula_id
    and numero_version = 1;

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
      merma_porcentaje,
      observaciones
    )
    values (
      v_formula_id,
      1,
      'BORRADOR',
      100,
      700,
      600,
      70.035,
      100,
      14.3286,
      'Fórmula inicial validada. FRESHMIX A fue reemplazado por ECOFRESH.'
    )
    returning id into v_version_id;
  end if;

  select count(*)
  into v_componentes
  from public.fm_preformulacion_componentes
  where formula_version_id = v_version_id;

  if v_componentes = 0 then
    with requeridas(codigo) as (
      values
        ('00011'),
        ('00012'),
        ('00015'),
        ('00016'),
        ('00017'),
        ('00013'),
        ('00014'),
        ('00020'),
        ('00021'),
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
        'Faltan materias primas para PAN INTEGRAL: %',
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
        ('00011', 86.000000::numeric, 'DIRECTO', true,  true,  1, 'HARINA BLANCA'),
        ('00012', 14.000000::numeric, 'DIRECTO', true,  true,  2, 'AFRECHO'),
        ('00015',  8.000000::numeric, 'DIRECTO', false, true,  3, 'MANTECA'),
        ('00016',  1.250000::numeric, 'DIRECTO', false, true,  4, 'LEVADURA'),
        ('00017',  0.600000::numeric, 'DIRECTO', false, true,  5, 'VINAGRE'),
        ('00013', 10.000000::numeric, 'MICRO',   false, true,  6, 'AZÚCAR'),
        ('00014',  2.200000::numeric, 'MICRO',   false, true,  7, 'SAL'),
        ('00020',  1.500000::numeric, 'MICRO',   false, true,  8, 'ECOFRESH'),
        ('00021',  0.600000::numeric, 'MICRO',   false, true,  9, 'PROPIONATO'),
        ('00124',  0.400000::numeric, 'MICRO',   false, true, 10, 'MOHOSORBIC'),
        ('AGUA',  62.000000::numeric, 'DIRECTO', false, false, 11, 'AGUA SIN COSTO')
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

  select id
  into v_producto_id
  from public.productos
  where trim(codigo) = '7868304262189'
  limit 1;

  if v_producto_id is null then
    raise exception
      'No se encontró el producto PANGOLIN PAN INTEGRAL 600g (7868304262189).';
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

  select id
  into v_funda_id
  from public.materias_primas
  where upper(coalesce(codigo_contable, '')) = '00031'
     or upper(coalesce(codigo, '')) = '00031'
  order by
    case
      when upper(coalesce(codigo_contable, '')) = '00031' then 1
      else 2
    end,
    creado_en
  limit 1;

  if v_funda_id is null then
    raise exception
      'No se encontró la funda de PAN INTEGRAL 600g (código 00031).';
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
    'Una funda por cada pan terminado.'
  )
  on conflict (producto_id, materia_prima_id) do update
  set
    cantidad_por_unidad = excluded.cantidad_por_unidad,
    activo = true,
    observaciones = excluded.observaciones,
    actualizado_en = now();
end;
$$;
