-- ============================================================
-- CIBUSPAN ONE
-- CONCILIACION DESDE ACTIVACION + REVISION HISTORICA MANUAL
-- V2 - 2026-08-30
-- AUTOCONTENIDO: puede ejecutarse haya o no sido aplicado el V1.
-- NO modifica FEFO, pedidos, Fill Rate ni cantidades historicas.
-- ============================================================
begin;

alter table public.reservas_inventario
  add column if not exists numero_factura text;

alter table public.reservas_inventario
  add column if not exists conciliacion_aplica boolean not null default false;

comment on column public.reservas_inventario.numero_factura is
  'Numero de factura/comprobante asociado al despacho.';

comment on column public.reservas_inventario.conciliacion_aplica is
  'TRUE solo para despachos confirmados usando el control de conciliacion de CIBUSPAN ONE. Historicos permanecen FALSE.';

create index if not exists idx_reservas_inventario_numero_factura
  on public.reservas_inventario (numero_factura)
  where numero_factura is not null;

create index if not exists idx_reservas_inventario_conciliacion_aplica
  on public.reservas_inventario (conciliacion_aplica, estado);

create or replace function public.vincular_factura_despacho(
  p_reserva_id text,
  p_numero_factura text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva_id public.reservas_inventario.id%type;
  v_numero text;
begin
  if p_reserva_id is null or trim(p_reserva_id) = '' then
    raise exception 'No se encontro el despacho.';
  end if;

  select r.id into v_reserva_id
  from public.reservas_inventario r
  where r.id::text = p_reserva_id
    and r.estado in ('ACTIVA', 'DESPACHADA')
  for update;

  if not found then
    raise exception 'No se encontro una reserva activa o un despacho confirmado.';
  end if;

  v_numero := nullif(trim(coalesce(p_numero_factura, '')), '');

  update public.reservas_inventario
  set numero_factura = v_numero
  where id = v_reserva_id;

  return coalesce(v_numero, '');
end;
$$;

grant execute on function public.vincular_factura_despacho(text, text)
to authenticated;

create or replace function public.activar_control_conciliacion_despacho(
  p_reserva_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva_id public.reservas_inventario.id%type;
begin
  if p_reserva_id is null or trim(p_reserva_id) = '' then
    raise exception 'No se encontro el despacho.';
  end if;

  select r.id into v_reserva_id
  from public.reservas_inventario r
  where r.id::text = p_reserva_id
    and r.estado in ('ACTIVA', 'DESPACHADA')
  for update;

  if not found then
    raise exception 'No se encontro una reserva activa o un despacho confirmado.';
  end if;

  update public.reservas_inventario
  set conciliacion_aplica = true
  where id = v_reserva_id;

  return true;
end;
$$;

grant execute on function public.activar_control_conciliacion_despacho(text)
to authenticated;

create or replace function public.com_buscar_ventas_por_comprobantes(
  p_comprobantes text[]
)
returns setof public.com_ventas_detalle
language sql
stable
security invoker
set search_path = public
as $$
  select v.*
  from public.com_ventas_detalle v
  where regexp_replace(
          upper(coalesce(v.comprobante, '')),
          '[^A-Z0-9]',
          '',
          'g'
        ) = any(p_comprobantes);
$$;

grant execute on function public.com_buscar_ventas_por_comprobantes(text[])
to authenticated;

commit;
