-- ============================================================
-- CIBUSPAN ONE
-- VINCULO DESPACHO <-> FACTURA PARA CONCILIACION COMERCIAL
-- Fecha: 2026-08-30
--
-- NO modifica la lógica FEFO ni el cálculo de Fill Rate.
-- Solo añade el número de factura al despacho y una función
-- segura para guardarlo/corregirlo.
-- ============================================================

begin;

alter table public.reservas_inventario
  add column if not exists numero_factura text;

comment on column public.reservas_inventario.numero_factura is
  'Número de factura/comprobante asociado al despacho. Se usa para conciliación con com_ventas_detalle.comprobante.';

create index if not exists idx_reservas_inventario_numero_factura
  on public.reservas_inventario (numero_factura)
  where numero_factura is not null;

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
    raise exception 'No se encontró el despacho.';
  end if;

  select r.id
  into v_reserva_id
  from public.reservas_inventario r
  where r.id::text = p_reserva_id
    and r.estado in ('ACTIVA', 'DESPACHADA')
  for update;

  if not found then
    raise exception 'No se encontró una reserva activa o un despacho confirmado.';
  end if;

  v_numero := nullif(trim(coalesce(p_numero_factura, '')), '');

  update public.reservas_inventario
  set numero_factura = v_numero
  where id = v_reserva_id;

  return coalesce(v_numero, '');
end;
$$;

grant execute
on function public.vincular_factura_despacho(text, text)
to authenticated;

-- Buscar comprobantes por su versión normalizada permite cruzar
-- 002-001-000016732 con 002 - 001 - 000016732 sin depender de espacios.
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

grant execute
on function public.com_buscar_ventas_por_comprobantes(text[])
to authenticated;

commit;
