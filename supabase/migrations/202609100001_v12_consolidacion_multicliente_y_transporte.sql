-- CIBUSPAN ONE · V12.1
-- Consolidación segura de facturas multicliente y transporte comercial.
--
-- PRINCIPIOS:
-- 1) La cuenta asignada a la factura es la fuente oficial del tipo de gasto.
-- 2) El proveedor NO clasifica el gasto.
-- 3) Una factura puede afectar a cero, uno o varios clientes.
-- 4) Para transporte multicliente, el reparto se hace por unidades facturadas
--    del mes entre SOLO los clientes seleccionados en la factura.
-- 5) Si no existe un driver objetivo, la parte queda sin atribuir.
-- 6) No se modifica la cuenta contable de ninguna factura.

begin;

-- ============================================================
-- A. RELACIÓN OFICIAL FACTURA <-> CLIENTES
-- ============================================================
create table if not exists public.fin_factura_clientes (
  factura_id uuid not null,
  cliente_id uuid not null,
  participacion numeric(18,8) not null default 1
);

-- Compatibilidad con la estructura que ya existe en tu Supabase:
-- esa tabla ya tenía una columna NOT NULL llamada participacion.
-- V12.1 la conserva; no borra ni recalcula participaciones existentes.
alter table public.fin_factura_clientes
  add column if not exists participacion numeric(18,8);

update public.fin_factura_clientes
set participacion = 1
where participacion is null;

alter table public.fin_factura_clientes
  alter column participacion set default 1,
  alter column participacion set not null;

-- La tabla ya podía existir en una versión previa con columnas adicionales.
alter table public.fin_factura_clientes
  add column if not exists orden smallint;

alter table public.fin_factura_clientes
  add column if not exists origen text;

alter table public.fin_factura_clientes
  add column if not exists creado_en timestamptz;

update public.fin_factura_clientes
set
  orden = coalesce(orden, 1),
  origen = coalesce(nullif(trim(origen), ''), 'LEGACY'),
  creado_en = coalesce(creado_en, now())
where orden is null
   or origen is null
   or trim(origen) = ''
   or creado_en is null;

alter table public.fin_factura_clientes
  alter column orden set default 1,
  alter column orden set not null,
  alter column origen set default 'USUARIO',
  alter column origen set not null,
  alter column creado_en set default now(),
  alter column creado_en set not null;

-- Limpiar duplicados antes de garantizar unicidad.
delete from public.fin_factura_clientes a
using public.fin_factura_clientes b
where a.ctid < b.ctid
  and a.factura_id = b.factura_id
  and a.cliente_id = b.cliente_id;

create unique index if not exists fin_factura_clientes_factura_cliente_uidx
  on public.fin_factura_clientes(factura_id, cliente_id);

create index if not exists fin_factura_clientes_cliente_idx
  on public.fin_factura_clientes(cliente_id, factura_id);

-- Integridad referencial: solo agregar si no existe ya una FK equivalente.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.fin_factura_clientes'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.fin_facturas_proveedor'::regclass
  ) then
    alter table public.fin_factura_clientes
      add constraint fin_factura_clientes_factura_fk
      foreign key (factura_id)
      references public.fin_facturas_proveedor(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.fin_factura_clientes'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.clientes'::regclass
  ) then
    alter table public.fin_factura_clientes
      add constraint fin_factura_clientes_cliente_fk
      foreign key (cliente_id)
      references public.clientes(id)
      on delete restrict;
  end if;
end
$$;

alter table public.fin_factura_clientes enable row level security;

drop policy if exists fin_factura_clientes_select_authenticated
  on public.fin_factura_clientes;

create policy fin_factura_clientes_select_authenticated
  on public.fin_factura_clientes
  for select
  to authenticated
  using (true);

revoke all on public.fin_factura_clientes from anon;
revoke insert, update, delete on public.fin_factura_clientes from authenticated;
grant select on public.fin_factura_clientes to authenticated;

comment on column public.fin_factura_clientes.participacion is
'Campo legado conservado por compatibilidad. V12.1 no lo usa para distribuir transporte; el reparto multicliente de transporte usa unidades facturadas del periodo entre los clientes seleccionados.';

-- ============================================================
-- B. RECUPERACIÓN SEGURA DE RELACIONES EXISTENTES
-- ============================================================
-- 1. Cliente legacy de la factura activa.
insert into public.fin_factura_clientes (
  factura_id,
  cliente_id,
  orden,
  origen
)
select
  f.id,
  f.cliente_id,
  1,
  'LEGACY'
from public.fin_facturas_proveedor f
join public.clientes c
  on c.id = f.cliente_id
where f.cliente_id is not null
on conflict (factura_id, cliente_id) do nothing;

-- 2. Cliente conservado en copias anuladas por V40.4e.
with auditoria as (
  select
    a.factura_destino_id as factura_id,
    case
      when coalesce(a.datos_antes->>'cliente_id', '') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (a.datos_antes->>'cliente_id')::uuid
      else null
    end as cliente_id
  from public.fin_auditoria_consolidacion_facturas a
  where a.lote = 'V40.4e-20260828'
    and a.tipo = 'FACTURA_ANULADA'
)
insert into public.fin_factura_clientes (
  factura_id,
  cliente_id,
  orden,
  origen
)
select distinct
  a.factura_id,
  a.cliente_id,
  20,
  'AUDITORIA_V40_4E'
from auditoria a
join public.fin_facturas_proveedor f
  on f.id = a.factura_id
join public.clientes c
  on c.id = a.cliente_id
where a.factura_id is not null
  and a.cliente_id is not null
on conflict (factura_id, cliente_id) do nothing;

-- 3. Recuperación documentada de las FACT 494 y 532 de Moya.
-- El archivo histórico previo a la consolidación las mostraba asociadas a
-- Rosado + Favorita + Mega Santamaría. No se aplica a ninguna otra factura.
do $$
declare
  v_rosado uuid;
  v_favorita uuid;
  v_santamaria uuid;
  v_factura uuid;
begin
  select id into v_rosado
  from public.clientes
  where activo and upper(nombre) like '%ROSADO%'
  order by nombre, id
  limit 1;

  select id into v_favorita
  from public.clientes
  where activo and upper(nombre) like '%FAVORITA%'
  order by nombre, id
  limit 1;

  select id into v_santamaria
  from public.clientes
  where activo
    and (upper(nombre) like '%SANTAMARIA%' or upper(nombre) like '%SANTA MARIA%')
  order by nombre, id
  limit 1;

  if v_rosado is null or v_favorita is null or v_santamaria is null then
    raise exception 'V12: no se pudieron localizar Rosado, Favorita y Mega Santamaria en clientes activos.';
  end if;

  foreach v_factura in array array[
    '2fa74317-7e42-4e23-8f61-17b3cacc4063'::uuid,
    '3240bd27-641d-489a-b82d-0b2a4158bfeb'::uuid
  ]
  loop
    if exists (
      select 1
      from public.fin_facturas_proveedor
      where id = v_factura
        and coalesce(anulada, false) = false
    ) then
      insert into public.fin_factura_clientes(factura_id, cliente_id, orden, origen)
      values
        (v_factura, v_rosado, 1, 'RECUPERADO_2026'),
        (v_factura, v_favorita, 2, 'RECUPERADO_2026'),
        (v_factura, v_santamaria, 3, 'RECUPERADO_2026')
      on conflict (factura_id, cliente_id)
      do update set
        orden = least(public.fin_factura_clientes.orden, excluded.orden),
        origen = case
          when public.fin_factura_clientes.origen = 'USUARIO'
          then 'USUARIO'
          else excluded.origen
        end;
    end if;
  end loop;
end
$$;

create or replace view public.fin_vw_factura_clientes_resumen
with (security_invoker = true)
as
select
  fc.factura_id,
  array_agg(fc.cliente_id order by fc.orden, c.nombre, fc.cliente_id) as cliente_ids,
  string_agg(c.nombre, ' · ' order by fc.orden, c.nombre, fc.cliente_id) as cliente_nombre,
  count(*)::integer as cantidad_clientes
from public.fin_factura_clientes fc
join public.clientes c
  on c.id = fc.cliente_id
group by fc.factura_id;

grant select on public.fin_vw_factura_clientes_resumen to authenticated;
revoke all on public.fin_vw_factura_clientes_resumen from anon;

-- ============================================================
-- C. GUARDADO V12 DE FACTURA + PAGOS + PERIODO + VARIOS CLIENTES
-- ============================================================
-- No reemplaza las funciones anteriores: se apoya en la función estable
-- fin_guardar_factura_completa y agrega las dos responsabilidades nuevas.
create or replace function public.fin_guardar_factura_v12(
  p_datos jsonb,
  p_abonos jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factura_id uuid;
  v_datos jsonb := coalesce(p_datos, '{}'::jsonb);
  v_afecta_tipo text;
  v_cliente_ids uuid[] := array[]::uuid[];
  v_cliente_id uuid;
  v_periodo date;
  v_total integer;
  v_validos integer;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;

  if to_regprocedure('public.fin_guardar_factura_completa(jsonb,jsonb)') is null then
    raise exception 'V12 requiere la función fin_guardar_factura_completa(jsonb,jsonb).';
  end if;

  v_afecta_tipo := upper(
    coalesce(nullif(trim(v_datos->>'afecta_tipo'), ''), 'GENERAL')
  );

  if v_afecta_tipo not in ('GENERAL', 'CLIENTE') then
    raise exception 'El destino del gasto no es valido.';
  end if;

  if v_afecta_tipo = 'CLIENTE' then
    if jsonb_typeof(v_datos->'cliente_ids') = 'array' then
      select coalesce(array_agg(x.cliente_id order by x.orden), array[]::uuid[])
      into v_cliente_ids
      from (
        select
          valor::uuid as cliente_id,
          min(ord) as orden
        from jsonb_array_elements_text(v_datos->'cliente_ids')
          with ordinality as j(valor, ord)
        where nullif(trim(valor), '') is not null
        group by valor::uuid
      ) x;
    end if;

    if cardinality(v_cliente_ids) = 0
       and nullif(trim(v_datos->>'cliente_id'), '') is not null then
      v_cliente_ids := array[(v_datos->>'cliente_id')::uuid];
    end if;

    v_total := cardinality(v_cliente_ids);
    if v_total = 0 then
      raise exception 'Seleccione al menos un cliente activo para esta factura.';
    end if;

    select count(*)::integer
    into v_validos
    from public.clientes c
    where c.id = any(v_cliente_ids)
      and c.activo;

    if v_validos <> v_total then
      raise exception 'Uno o más clientes seleccionados no existen o están inactivos.';
    end if;

    v_cliente_id := v_cliente_ids[1];
    v_datos := jsonb_set(v_datos, '{cliente_id}', to_jsonb(v_cliente_id::text), true);
  else
    v_cliente_ids := array[]::uuid[];
    v_datos := jsonb_set(v_datos, '{cliente_id}', 'null'::jsonb, true);
  end if;

  -- La pantalla envía YYYY-MM-01. Si no envía periodo, se usa el mes de emisión.
  v_periodo := nullif(trim(v_datos->>'periodo_servicio'), '')::date;
  if v_periodo is not null then
    v_periodo := date_trunc('month', v_periodo)::date;
  end if;

  v_factura_id := public.fin_guardar_factura_completa(v_datos, p_abonos);

  update public.fin_facturas_proveedor
  set periodo_servicio = v_periodo,
      actualizado_en = now()
  where id = v_factura_id;

  delete from public.fin_factura_clientes
  where factura_id = v_factura_id;

  if v_afecta_tipo = 'CLIENTE' then
    insert into public.fin_factura_clientes(factura_id, cliente_id, orden, origen)
    select
      v_factura_id,
      u.cliente_id,
      u.ord::smallint,
      'USUARIO'
    from unnest(v_cliente_ids) with ordinality as u(cliente_id, ord)
    on conflict (factura_id, cliente_id)
    do update set orden = excluded.orden, origen = 'USUARIO';
  end if;

  return v_factura_id;
end;
$$;

revoke all on function public.fin_guardar_factura_v12(jsonb, jsonb)
  from public, anon;
grant execute on function public.fin_guardar_factura_v12(jsonb, jsonb)
  to authenticated;

-- ============================================================
-- D. TRANSPORTE: CONSUMIR CLASIFICACIÓN OFICIAL, NO PROVEEDOR
-- ============================================================
create or replace view public.fin_vw_transporte_facturas
with (security_invoker = true)
as
with cantidad_clientes as (
  select factura_id, count(*)::integer as cantidad
  from public.fin_factura_clientes
  group by factura_id
)
select
  factura.id as factura_id,
  factura.fecha_emision,
  date_trunc('month', factura.fecha_emision)::date as periodo_emision,
  factura.periodo_servicio,
  coalesce(
    factura.periodo_servicio,
    date_trunc('month', factura.fecha_emision)::date
  ) as periodo_analisis,
  (factura.periodo_servicio is not null) as periodo_confirmado,
  factura.numero_factura,
  factura.proveedor,
  factura.proveedor_normalizado,
  factura.descripcion,
  factura.subtotal::numeric(18,2) as gasto_sin_iva,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  factura.cliente_id as cliente_directo_id,
  cliente.nombre as cliente_directo_nombre,
  case
    when coalesce(cc.cantidad, 0) > 1 then 'MULTICLIENTE'
    when coalesce(cc.cantidad, 0) = 1 then 'CLIENTE_DIRECTO'
    else 'SIN_ATRIBUIR'
  end as regla_atribucion
from public.fin_facturas_proveedor factura
join public.fin_cuentas_pago cuenta
  on cuenta.id = factura.cuenta_pago_id
left join public.clientes cliente
  on cliente.id = factura.cliente_id
left join cantidad_clientes cc
  on cc.factura_id = factura.id
where coalesce(factura.anulada, false) = false
  and factura.fecha_emision is not null
  and cuenta.codigo = '6.1.01.2.13.01';

-- Ventas facturadas por cliente y mes como driver objetivo.
create or replace view public.fin_vw_transporte_driver_cliente
with (security_invoker = true)
as
select
  date_trunc('month', venta.fecha_emision)::date as periodo,
  venta.cliente_id,
  max(venta.cliente_nombre) as cliente_nombre,
  case
    when upper(max(venta.cliente_nombre)) like '%TUTI%' then 'TUTI'
    when upper(max(venta.cliente_nombre)) like '%FAVORITA%' then 'FAVORITA'
    when upper(max(venta.cliente_nombre)) like '%ROSADO%' then 'ROSADO'
    when upper(max(venta.cliente_nombre)) like '%SANTAMARIA%'
      or upper(max(venta.cliente_nombre)) like '%SANTA MARIA%' then 'SANTAMARIA'
    else 'OTRO'
  end as cliente_bucket,
  sum(greatest(coalesce(venta.cantidad, 0), 0))::numeric(18,3) as unidades_facturadas,
  sum(coalesce(venta.total_sin_impuestos, 0))::numeric(18,2) as venta_facturada_sin_impuestos
from public.com_ventas_detalle venta
where venta.fecha_emision is not null
  and venta.cliente_id is not null
group by date_trunc('month', venta.fecha_emision)::date, venta.cliente_id;

-- Asignación por factura: un cliente = directo; varios = prorrateo por unidades.
create or replace view public.fin_vw_transporte_asignacion_factura
with (security_invoker = true)
as
with relaciones as (
  select
    f.factura_id,
    f.periodo_analisis as periodo,
    f.periodo_confirmado,
    f.gasto_sin_iva,
    fc.cliente_id,
    c.nombre as cliente_nombre,
    coalesce(d.unidades_facturadas, 0)::numeric(18,3) as unidades_facturadas,
    coalesce(d.venta_facturada_sin_impuestos, 0)::numeric(18,2) as venta_facturada_sin_impuestos,
    count(*) over (partition by f.factura_id) as clientes_factura,
    sum(coalesce(d.unidades_facturadas, 0)) over (partition by f.factura_id) as unidades_grupo
  from public.fin_vw_transporte_facturas f
  join public.fin_factura_clientes fc
    on fc.factura_id = f.factura_id
  join public.clientes c
    on c.id = fc.cliente_id
  left join public.fin_vw_transporte_driver_cliente d
    on d.periodo = f.periodo_analisis
   and d.cliente_id = fc.cliente_id
),
directo as (
  select
    factura_id,
    periodo,
    periodo_confirmado,
    cliente_id,
    cliente_nombre,
    gasto_sin_iva::numeric(18,2) as gasto_transporte,
    unidades_facturadas,
    venta_facturada_sin_impuestos,
    'CLIENTE_DIRECTO'::text as metodo
  from relaciones
  where clientes_factura = 1
),
multi as (
  select
    factura_id,
    periodo,
    periodo_confirmado,
    cliente_id,
    cliente_nombre,
    (gasto_sin_iva * unidades_facturadas / unidades_grupo)::numeric(18,2) as gasto_transporte,
    unidades_facturadas,
    venta_facturada_sin_impuestos,
    'PRORRATEO_UNIDADES'::text as metodo
  from relaciones
  where clientes_factura > 1
    and unidades_grupo > 0
    and unidades_facturadas > 0
)
select * from directo
union all
select * from multi;

create or replace view public.fin_vw_transporte_cliente_mensual
with (security_invoker = true)
as
select
  asignacion.periodo,
  asignacion.cliente_id,
  asignacion.cliente_nombre,
  sum(asignacion.gasto_transporte)::numeric(18,2) as gasto_transporte,
  max(asignacion.unidades_facturadas)::numeric(18,3) as unidades_facturadas,
  max(asignacion.venta_facturada_sin_impuestos)::numeric(18,2) as venta_facturada_sin_impuestos,
  case
    when max(asignacion.unidades_facturadas) > 0
    then sum(asignacion.gasto_transporte) / max(asignacion.unidades_facturadas)
    else null
  end::numeric(18,6) as transporte_por_unidad,
  case
    when max(asignacion.venta_facturada_sin_impuestos) <> 0
    then sum(asignacion.gasto_transporte) / max(asignacion.venta_facturada_sin_impuestos) * 100
    else null
  end::numeric(18,4) as transporte_pct_facturacion,
  count(distinct asignacion.factura_id)::integer as facturas_transporte,
  bool_and(asignacion.periodo_confirmado) as periodo_confirmado,
  string_agg(distinct asignacion.metodo, ' · ' order by asignacion.metodo) as metodo
from public.fin_vw_transporte_asignacion_factura asignacion
group by asignacion.periodo, asignacion.cliente_id, asignacion.cliente_nombre;

create or replace view public.fin_vw_transporte_resumen_mensual
with (security_invoker = true)
as
with meses as (
  select distinct periodo
  from public.fin_resultados_mensuales
),
contable as (
  select
    resultado.periodo,
    sum(resultado.valor_original)::numeric(18,2) as transporte_contable
  from public.fin_resultados_mensuales resultado
  where resultado.cuenta_codigo = '6.1.01.2.13.01'
  group by resultado.periodo
),
asignado as (
  select
    cliente.periodo,
    sum(cliente.gasto_transporte)::numeric(18,2) as transporte_asignado
  from public.fin_vw_transporte_cliente_mensual cliente
  group by cliente.periodo
),
confirmacion as (
  select
    factura.periodo_analisis as periodo,
    count(*)::integer as facturas_transporte,
    count(*) filter (where not factura.periodo_confirmado)::integer
      as facturas_periodo_por_confirmar
  from public.fin_vw_transporte_facturas factura
  group by factura.periodo_analisis
)
select
  m.periodo,
  coalesce(c.transporte_contable, 0)::numeric(18,2) as transporte_contable,
  coalesce(a.transporte_asignado, 0)::numeric(18,2) as transporte_asignado,
  (coalesce(c.transporte_contable, 0) - coalesce(a.transporte_asignado, 0))::numeric(18,2)
    as transporte_no_atribuido,
  coalesce(margen.ventas_netas, 0)::numeric(18,2) as ventas_netas_contables,
  case
    when coalesce(margen.ventas_netas, 0) <> 0
    then coalesce(c.transporte_contable, 0) / margen.ventas_netas * 100
    else null
  end::numeric(18,4) as transporte_pct_ventas,
  coalesce(conf.facturas_transporte, 0)::integer as facturas_transporte,
  coalesce(conf.facturas_periodo_por_confirmar, 0)::integer
    as facturas_periodo_por_confirmar
from meses m
left join contable c on c.periodo = m.periodo
left join asignado a on a.periodo = m.periodo
left join public.fin_vw_margen_bruto_mensual margen on margen.periodo = m.periodo
left join confirmacion conf on conf.periodo = m.periodo
order by m.periodo;

grant select on public.fin_vw_transporte_facturas to authenticated;
grant select on public.fin_vw_transporte_driver_cliente to authenticated;
grant select on public.fin_vw_transporte_asignacion_factura to authenticated;
grant select on public.fin_vw_transporte_cliente_mensual to authenticated;
grant select on public.fin_vw_transporte_resumen_mensual to authenticated;

revoke all on public.fin_vw_transporte_facturas from anon;
revoke all on public.fin_vw_transporte_driver_cliente from anon;
revoke all on public.fin_vw_transporte_asignacion_factura from anon;
revoke all on public.fin_vw_transporte_cliente_mensual from anon;
revoke all on public.fin_vw_transporte_resumen_mensual from anon;

comment on table public.fin_factura_clientes is
'Fuente oficial de relación entre una factura de proveedor y uno o varios clientes afectados.';

comment on function public.fin_guardar_factura_v12(jsonb, jsonb) is
'Guarda factura, pagos, periodo de servicio y todos los clientes seleccionados sin reemplazar la lógica financiera estable.';

commit;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICACIONES DE LECTURA
-- ============================================================
-- 1) FACT 494 y 532 deben mostrar 3 clientes.
select
  f.numero_factura,
  f.fecha_emision,
  r.cantidad_clientes,
  r.cliente_nombre
from public.fin_facturas_proveedor f
left join public.fin_vw_factura_clientes_resumen r
  on r.factura_id = f.id
where f.id in (
  '2fa74317-7e42-4e23-8f61-17b3cacc4063'::uuid,
  '3240bd27-641d-489a-b82d-0b2a4158bfeb'::uuid
)
order by f.fecha_emision;

-- 2) Transporte ahora se clasifica SOLO por la cuenta oficial.
select
  periodo_analisis,
  proveedor,
  numero_factura,
  gasto_sin_iva,
  regla_atribucion
from public.fin_vw_transporte_facturas
order by periodo_analisis, proveedor, numero_factura;
