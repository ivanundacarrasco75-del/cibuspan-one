-- CIBUSPAN ONE V11
-- GASTOS - FASE 1: TRANSPORTE
--
-- PRINCIPIOS:
-- 1. Contabilidad = total oficial del negocio.
-- 2. Facturas de proveedor = detalle explicativo / atribuible.
-- 3. El mes de servicio puede ser distinto al mes de emisión.
-- 4. Daniel Parra se reconoce como transporte directo de TUTI.
-- 5. Milton Moya se distribuye entre Favorita, El Rosado y Mega Santamaría
--    por unidades facturadas del período de servicio.
-- 6. Otros fletes/logística quedan como NO ATRIBUIDOS hasta tener una
--    relación objetiva con cliente.
-- 7. No se fuerza una asignación para conseguir 100% artificial.

alter table public.fin_facturas_proveedor
  add column if not exists periodo_servicio date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fin_facturas_periodo_servicio_inicio_mes_check'
      and conrelid = 'public.fin_facturas_proveedor'::regclass
  ) then
    alter table public.fin_facturas_proveedor
      add constraint fin_facturas_periodo_servicio_inicio_mes_check
      check (
        periodo_servicio is null
        or periodo_servicio = date_trunc('month', periodo_servicio)::date
      );
  end if;
end;
$$;

create index if not exists fin_facturas_periodo_servicio_idx
  on public.fin_facturas_proveedor(periodo_servicio)
  where periodo_servicio is not null;

-- ------------------------------------------------------------
-- Guardar / corregir el mes real del servicio.
-- NULL deja el período como "por confirmar".
-- ------------------------------------------------------------
create or replace function public.fin_guardar_periodo_servicio_factura(
  p_factura_id uuid,
  p_periodo date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.';
  end if;

  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para corregir el período de servicio.'
      using errcode = '42501';
  end if;

  if p_periodo is not null
     and p_periodo <> date_trunc('month', p_periodo)::date then
    raise exception 'El período de servicio debe ser el primer día del mes.';
  end if;

  update public.fin_facturas_proveedor
  set
    periodo_servicio = p_periodo,
    actualizado_en = now()
  where id = p_factura_id
    and coalesce(anulada, false) = false;

  if not found then
    raise exception 'La factura seleccionada no existe o está anulada.';
  end if;
end;
$$;

revoke all on function public.fin_guardar_periodo_servicio_factura(uuid, date)
  from public, anon;
grant execute on function public.fin_guardar_periodo_servicio_factura(uuid, date)
  to authenticated;

-- ------------------------------------------------------------
-- Facturas que explican transporte.
--
-- Se incluyen:
-- - cuenta contable / clasificación Transporte y Fletes;
-- - Daniel Parra y Milton Moya por proveedor para recuperar facturas
--   históricas que pudieron haber quedado mal clasificadas en la importación.
-- ------------------------------------------------------------
create or replace view public.fin_vw_transporte_facturas
with (security_invoker = true)
as
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
    when factura.cliente_id is not null then 'CLIENTE_DIRECTO'
    when upper(coalesce(factura.proveedor_normalizado, factura.proveedor, ''))
         like '%DANIEL PARRA%'
      or upper(coalesce(factura.proveedor_normalizado, factura.proveedor, ''))
         like '%PARRA PEREZ MAURO%'
      then 'TUTI'
    when upper(coalesce(factura.proveedor_normalizado, factura.proveedor, ''))
         like '%MILTON MOYA%'
      or upper(coalesce(factura.proveedor_normalizado, factura.proveedor, ''))
         like '%MOYA ALVAREZ MILTON%'
      then 'FAVORITA_ROSADO_SANTAMARIA'
    else 'SIN_ATRIBUIR'
  end as regla_atribucion
from public.fin_facturas_proveedor factura
join public.fin_cuentas_pago cuenta
  on cuenta.id = factura.cuenta_pago_id
left join public.clientes cliente
  on cliente.id = factura.cliente_id
where coalesce(factura.anulada, false) = false
  and factura.fecha_emision is not null
  and (
    cuenta.codigo = '6.1.01.2.13.01'
    or upper(coalesce(factura.proveedor_normalizado, factura.proveedor, ''))
       like '%DANIEL PARRA%'
    or upper(coalesce(factura.proveedor_normalizado, factura.proveedor, ''))
       like '%PARRA PEREZ MAURO%'
    or upper(coalesce(factura.proveedor_normalizado, factura.proveedor, ''))
       like '%MILTON MOYA%'
    or upper(coalesce(factura.proveedor_normalizado, factura.proveedor, ''))
       like '%MOYA ALVAREZ MILTON%'
  );

-- ------------------------------------------------------------
-- Ventas facturadas por cliente y mes.
-- Sirven SOLO como driver para repartir transporte multi-cliente
-- y para calcular transporte / facturación.
-- No reemplazan la venta neta contable de Resultados.
-- ------------------------------------------------------------
create or replace view public.fin_vw_transporte_driver_cliente
with (security_invoker = true)
as
select
  date_trunc('month', venta.fecha_emision)::date as periodo,
  venta.cliente_id,
  max(venta.cliente_nombre) as cliente_nombre,
  case
    when upper(max(venta.cliente_nombre)) like '%TUTI%'
      then 'TUTI'
    when upper(max(venta.cliente_nombre)) like '%FAVORITA%'
      then 'FAVORITA'
    when upper(max(venta.cliente_nombre)) like '%ROSADO%'
      then 'ROSADO'
    when upper(max(venta.cliente_nombre)) like '%SANTAMARIA%'
      or upper(max(venta.cliente_nombre)) like '%SANTA MARIA%'
      then 'SANTAMARIA'
    else 'OTRO'
  end as cliente_bucket,
  sum(greatest(coalesce(venta.cantidad, 0), 0))::numeric(18,3)
    as unidades_facturadas,
  sum(coalesce(venta.total_sin_impuestos, 0))::numeric(18,2)
    as venta_facturada_sin_impuestos
from public.com_ventas_detalle venta
where venta.fecha_emision is not null
  and venta.cliente_id is not null
group by
  date_trunc('month', venta.fecha_emision)::date,
  venta.cliente_id;

-- ------------------------------------------------------------
-- Asignación por factura.
-- ------------------------------------------------------------
create or replace view public.fin_vw_transporte_asignacion_factura
with (security_invoker = true)
as
with facturas as (
  select *
  from public.fin_vw_transporte_facturas
),
directo as (
  select
    f.factura_id,
    f.periodo_analisis as periodo,
    f.periodo_confirmado,
    f.cliente_directo_id as cliente_id,
    coalesce(
      f.cliente_directo_nombre,
      d.cliente_nombre
    ) as cliente_nombre,
    f.gasto_sin_iva as gasto_transporte,
    coalesce(d.unidades_facturadas, 0)::numeric(18,3)
      as unidades_facturadas,
    coalesce(d.venta_facturada_sin_impuestos, 0)::numeric(18,2)
      as venta_facturada_sin_impuestos,
    'CLIENTE_DIRECTO'::text as metodo
  from facturas f
  left join public.fin_vw_transporte_driver_cliente d
    on d.periodo = f.periodo_analisis
   and d.cliente_id = f.cliente_directo_id
  where f.regla_atribucion = 'CLIENTE_DIRECTO'
    and f.cliente_directo_id is not null
),
tuti as (
  select
    f.factura_id,
    f.periodo_analisis as periodo,
    f.periodo_confirmado,
    d.cliente_id,
    d.cliente_nombre,
    f.gasto_sin_iva as gasto_transporte,
    d.unidades_facturadas,
    d.venta_facturada_sin_impuestos,
    'PROVEEDOR_TUTI'::text as metodo
  from facturas f
  join public.fin_vw_transporte_driver_cliente d
    on d.periodo = f.periodo_analisis
   and d.cliente_bucket = 'TUTI'
  where f.regla_atribucion = 'TUTI'
),
multi_base as (
  select
    f.factura_id,
    f.periodo_analisis as periodo,
    f.periodo_confirmado,
    f.gasto_sin_iva,
    d.cliente_id,
    d.cliente_nombre,
    d.unidades_facturadas,
    d.venta_facturada_sin_impuestos,
    sum(d.unidades_facturadas) over (
      partition by f.factura_id
    ) as unidades_grupo
  from facturas f
  join public.fin_vw_transporte_driver_cliente d
    on d.periodo = f.periodo_analisis
   and d.cliente_bucket in ('FAVORITA', 'ROSADO', 'SANTAMARIA')
  where f.regla_atribucion = 'FAVORITA_ROSADO_SANTAMARIA'
),
multi as (
  select
    factura_id,
    periodo,
    periodo_confirmado,
    cliente_id,
    cliente_nombre,
    case
      when unidades_grupo > 0
        then gasto_sin_iva * unidades_facturadas / unidades_grupo
      else 0
    end::numeric(18,2) as gasto_transporte,
    unidades_facturadas,
    venta_facturada_sin_impuestos,
    'PRORRATEO_UNIDADES'::text as metodo
  from multi_base
  where unidades_grupo > 0
)
select * from directo
union all
select * from tuti
union all
select * from multi;

-- ------------------------------------------------------------
-- Transporte por cliente / mes.
-- ------------------------------------------------------------
create or replace view public.fin_vw_transporte_cliente_mensual
with (security_invoker = true)
as
select
  asignacion.periodo,
  asignacion.cliente_id,
  asignacion.cliente_nombre,
  sum(asignacion.gasto_transporte)::numeric(18,2)
    as gasto_transporte,
  max(asignacion.unidades_facturadas)::numeric(18,3)
    as unidades_facturadas,
  max(asignacion.venta_facturada_sin_impuestos)::numeric(18,2)
    as venta_facturada_sin_impuestos,
  case
    when max(asignacion.unidades_facturadas) > 0
      then sum(asignacion.gasto_transporte)
           / max(asignacion.unidades_facturadas)
    else null
  end::numeric(18,6) as transporte_por_unidad,
  case
    when max(asignacion.venta_facturada_sin_impuestos) <> 0
      then sum(asignacion.gasto_transporte)
           / max(asignacion.venta_facturada_sin_impuestos) * 100
    else null
  end::numeric(18,4) as transporte_pct_facturacion,
  count(distinct asignacion.factura_id)::integer as facturas_transporte,
  bool_and(asignacion.periodo_confirmado) as periodo_confirmado,
  string_agg(
    distinct asignacion.metodo,
    ' · '
    order by asignacion.metodo
  ) as metodo
from public.fin_vw_transporte_asignacion_factura asignacion
group by
  asignacion.periodo,
  asignacion.cliente_id,
  asignacion.cliente_nombre;

-- ------------------------------------------------------------
-- Resumen negocio / mes:
-- total contable oficial vs parte explicada por cliente.
-- ------------------------------------------------------------
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
    sum(resultado.valor_original)::numeric(18,2)
      as transporte_contable
  from public.fin_resultados_mensuales resultado
  where resultado.cuenta_codigo = '6.1.01.2.13.01'
  group by resultado.periodo
),
asignado as (
  select
    cliente.periodo,
    sum(cliente.gasto_transporte)::numeric(18,2)
      as transporte_asignado
  from public.fin_vw_transporte_cliente_mensual cliente
  group by cliente.periodo
),
confirmacion as (
  select
    factura.periodo_analisis as periodo,
    count(*)::integer as facturas_transporte,
    count(*) filter (
      where not factura.periodo_confirmado
    )::integer as facturas_periodo_por_confirmar
  from public.fin_vw_transporte_facturas factura
  group by factura.periodo_analisis
)
select
  m.periodo,
  coalesce(c.transporte_contable, 0)::numeric(18,2)
    as transporte_contable,
  coalesce(a.transporte_asignado, 0)::numeric(18,2)
    as transporte_asignado,
  (
    coalesce(c.transporte_contable, 0)
    - coalesce(a.transporte_asignado, 0)
  )::numeric(18,2) as transporte_no_atribuido,
  coalesce(margen.ventas_netas, 0)::numeric(18,2)
    as ventas_netas_contables,
  case
    when coalesce(margen.ventas_netas, 0) <> 0
      then coalesce(c.transporte_contable, 0)
           / margen.ventas_netas * 100
    else null
  end::numeric(18,4) as transporte_pct_ventas,
  coalesce(conf.facturas_transporte, 0)::integer
    as facturas_transporte,
  coalesce(conf.facturas_periodo_por_confirmar, 0)::integer
    as facturas_periodo_por_confirmar
from meses m
left join contable c on c.periodo = m.periodo
left join asignado a on a.periodo = m.periodo
left join public.fin_vw_margen_bruto_mensual margen
  on margen.periodo = m.periodo
left join confirmacion conf on conf.periodo = m.periodo;

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

comment on column public.fin_facturas_proveedor.periodo_servicio is
'Mes real al que corresponde el servicio. Permite separar fecha de factura y período económico del gasto.';

comment on view public.fin_vw_transporte_resumen_mensual is
'Transporte oficial del negocio desde contabilidad y parte atribuida objetivamente a clientes.';

comment on view public.fin_vw_transporte_cliente_mensual is
'Transporte atribuible por cliente. El prorrateo multi-cliente usa unidades facturadas del período de servicio.';
