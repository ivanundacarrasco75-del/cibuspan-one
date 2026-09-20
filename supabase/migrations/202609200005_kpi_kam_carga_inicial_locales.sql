-- CIBUSPAN ONE
-- KPI KAM - carga inicial de locales Rosado, TUTI y Santa Maria Quito.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(
  hashtext('CIBUSPAN_ONE_KPI_KAM_CARGA_INICIAL_LOCALES_V1')
);

alter table public.com_locales_monitoreados
  add column if not exists bodega_origen_id uuid
    references public.bodegas(id) on delete set null;

create unique index if not exists com_locales_monitoreados_bodega_origen_uidx
  on public.com_locales_monitoreados (cliente_id, bodega_origen_id)
  where bodega_origen_id is not null;

-- Incorpora automáticamente los locales operativos de Rosado y TUTI.
insert into public.com_locales_monitoreados (
  cliente_id,
  codigo_externo,
  nombre,
  activo,
  fuente_inicial,
  bodega_origen_id
)
select
  bodega.cliente_id,
  'BOD-' || upper(substr(replace(bodega.id::text, '-', ''), 1, 8)),
  upper(regexp_replace(trim(bodega.nombre), '\s+', ' ', 'g')),
  true,
  'CATALOGO_OPERATIVO',
  bodega.id
from public.bodegas bodega
join public.clientes cliente on cliente.id = bodega.cliente_id
where bodega.activo
  and (
    replace(upper(cliente.nombre), ' ', '') like '%ROSADO%'
    or replace(upper(cliente.nombre), ' ', '') like '%TUTI%'
  )
  and not exists (
    select 1
    from public.com_locales_monitoreados local
    where local.cliente_id = bodega.cliente_id
      and (
        local.bodega_origen_id = bodega.id
        or upper(regexp_replace(trim(local.nombre), '\s+', ' ', 'g')) =
           upper(regexp_replace(trim(bodega.nombre), '\s+', ' ', 'g'))
      )
  )
on conflict (cliente_id, codigo_externo) do update
set nombre = excluded.nombre,
    activo = true,
    bodega_origen_id = excluded.bodega_origen_id,
    actualizado_en = now();

-- Lista inicial de 12 locales Santa Maria en Quito.
with locales_santa(codigo, nombre) as (
  values
    ('SM-Q01', 'NACIONES UNIDAS Y SHYRIS'),
    ('SM-Q02', '6 DE DICIEMBRE Y PASAJE DE LOS MANZANOS'),
    ('SM-Q03', 'IÑAQUITO Y VILLALENGUA'),
    ('SM-Q04', 'AMAZONAS Y ELOY ALFARO'),
    ('SM-Q05', 'ELOY ALFARO Y 10 DE AGOSTO'),
    ('SM-Q06', '9 DE OCTUBRE ENTRE SUCRE Y OLMEDO'),
    ('SM-Q07', 'FRANCISCO SALAZAR Y RAFAEL RAMOS'),
    ('SM-Q08', 'RÍO AMAZONAS Y RÍO PALORA'),
    ('SM-Q09', 'RAMÍREZ DÁVALOS'),
    ('SM-Q10', 'DE LOS JAZMINES Y DE LOS PINOS'),
    ('SM-Q11', 'JUAN MOLINERO Y ELOY ALFARO'),
    ('SM-Q12', 'SIMÓN BOLÍVAR Y VENEZUELA')
)
insert into public.com_locales_monitoreados (
  cliente_id,
  codigo_externo,
  nombre,
  activo,
  fuente_inicial
)
select
  cliente.id,
  local.codigo,
  local.nombre,
  true,
  'LISTA_INICIAL_QUITO_12'
from public.clientes cliente
cross join locales_santa local
where cliente.activo
  and replace(upper(cliente.nombre), ' ', '') like '%SANTAMARIA%'
  and not exists (
    select 1
    from public.com_locales_monitoreados existente
    where existente.cliente_id = cliente.id
      and upper(regexp_replace(trim(existente.nombre), '\s+', ' ', 'g')) =
          upper(regexp_replace(trim(local.nombre), '\s+', ' ', 'g'))
  )
on conflict (cliente_id, codigo_externo) do update
set nombre = excluded.nombre,
    activo = true,
    actualizado_en = now();

notify pgrst, 'reload schema';

commit;
