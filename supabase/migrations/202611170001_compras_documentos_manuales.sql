begin;

create table if not exists public.compras_documentos_manuales (
  id uuid primary key,
  tipo text not null check (tipo in ('NOTA_VENTA', 'NO_DEDUCIBLE')),
  fecha_documento date not null,
  numero_documento text check (char_length(btrim(numero_documento)) between 1 and 80),
  proveedor text not null check (char_length(btrim(proveedor)) between 1 and 200),
  concepto text not null check (char_length(btrim(concepto)) between 1 and 500),
  subtotal numeric not null check (subtotal > 0 and subtotal < 1000000000 and scale(subtotal) <= 2),
  iva numeric check (iva >= 0 and iva < 1000000000 and scale(iva) <= 2),
  retencion numeric check (retencion >= 0 and retencion < 1000000000 and scale(retencion) <= 2),
  total numeric generated always as (subtotal + coalesce(iva, 0)) stored,
  observaciones text check (char_length(observaciones) <= 500),
  registrado_por uuid not null default auth.uid(),
  registrado_en timestamptz not null default now(),
  check (tipo <> 'NOTA_VENTA' or numero_documento is not null)
);

create index if not exists compras_documentos_manuales_fecha_idx
  on public.compras_documentos_manuales (tipo, fecha_documento desc, id);

alter table public.compras_documentos_manuales enable row level security;
revoke all privileges on public.compras_documentos_manuales from public, anon, authenticated;
grant select on public.compras_documentos_manuales to authenticated;
grant insert (id, tipo, fecha_documento, numero_documento, proveedor, concepto, subtotal, iva, retencion, observaciones)
  on public.compras_documentos_manuales to authenticated;

drop policy if exists compras_documentos_manuales_lectura on public.compras_documentos_manuales;
create policy compras_documentos_manuales_lectura on public.compras_documentos_manuales
  for select to authenticated using ((select public.app_puede('Administración')));

drop policy if exists compras_documentos_manuales_ingreso on public.compras_documentos_manuales;
create policy compras_documentos_manuales_ingreso on public.compras_documentos_manuales
  for insert to authenticated with check (
    (select public.app_puede('Administración')) and registrado_por = (select auth.uid())
  );

-- Los documentos de Compras no generan movimientos contables ni pagos.
create or replace view public.compras_vw_documentos with (security_invoker = true) as
select
  'manual:' || m.id::text as id, m.tipo,
  date_trunc('month', m.fecha_documento::timestamp)::date as periodo,
  m.fecha_documento, m.numero_documento, m.proveedor, m.concepto,
  m.subtotal, m.iva, m.retencion, m.total, m.observaciones,
  null::text as cuenta_codigo, 'MANUAL_COMPRAS'::text as origen
from public.compras_documentos_manuales m
union all
select
  'contable:' || d.id::text as id, tipos.tipo,
  d.periodo::date, d.fecha_documento::date, d.numero_documento::text, d.proveedor::text, d.concepto::text,
  null::numeric, null::numeric, null::numeric, d.valor::numeric, d.observaciones::text,
  d.cuenta_codigo::text, 'CLASIFICACION_GASTOS'::text
from public.fin_vw_resultado_clasificacion_detalle d
cross join lateral (values
  ('NOTA_VENTA', d.tipo_documento::text = 'NOTA_VENTA'),
  ('NO_DEDUCIBLE', d.cuenta_codigo::text = '6.2.01.2.14.31')
) tipos(tipo, aplica)
where tipos.aplica and (select public.app_puede('Administración'));

revoke all privileges on public.compras_vw_documentos from public, anon, authenticated;
grant select on public.compras_vw_documentos to authenticated;

commit;
