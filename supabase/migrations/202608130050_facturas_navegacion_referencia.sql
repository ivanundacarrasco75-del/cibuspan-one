-- CIBUSPAN ONE
-- Corrige la precision de la tasa de IVA que provocaba numeric field overflow.

drop view if exists public.fin_vw_programacion_pagos;
drop view if exists public.fin_vw_facturas_detalle;

alter table public.fin_facturas_proveedor
  alter column tasa_iva type numeric(7,4)
  using least(greatest(coalesce(tasa_iva, 15), 0), 100)::numeric(7,4),
  alter column confianza type numeric(7,6)
  using least(greatest(coalesce(confianza, 0), 0), 1)::numeric(7,6);

create or replace view public.fin_vw_facturas_detalle
with (security_invoker = true)
as
select
  factura.id,
  factura.clave_origen,
  factura.fecha_emision,
  factura.fecha_vencimiento,
  factura.fecha_pago_origen,
  factura.pagada_origen,
  factura.numero_factura,
  factura.proveedor,
  factura.proveedor_normalizado,
  factura.descripcion,
  factura.subtotal,
  factura.aplica_iva,
  factura.tasa_iva,
  factura.iva,
  factura.total_factura,
  factura.retencion,
  factura.retencion_referencia,
  factura.valor_neto_pagar,
  coalesce(abonos.total_abonado, 0)::numeric(18,2) as total_abonado,
  greatest(
    factura.valor_neto_pagar - coalesce(abonos.total_abonado, 0),
    0
  )::numeric(18,2) as saldo,
  case
    when factura.anulada then 'ANULADA'
    when factura.valor_neto_pagar - coalesce(abonos.total_abonado, 0) <= 0.005
      then 'PAGADA'
    when coalesce(abonos.total_abonado, 0) > 0 then 'ABONO'
    else 'PENDIENTE'
  end as estado,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  cuenta.grupo,
  cuenta.naturaleza,
  cuenta.impacta_ebitda,
  factura.estado_clasificacion,
  factura.confianza,
  factura.notas,
  factura.archivo_origen,
  factura.hoja_origen,
  factura.fila_origen,
  factura.creado_en,
  factura.actualizado_en,
  factura.afecta_tipo,
  factura.cliente_id,
  cliente.nombre as cliente_nombre
from public.fin_facturas_proveedor factura
join public.fin_cuentas_pago cuenta on cuenta.id = factura.cuenta_pago_id
left join public.clientes cliente on cliente.id = factura.cliente_id
left join lateral (
  select sum(abono.monto) as total_abonado
  from public.fin_factura_abonos abono
  where abono.factura_id = factura.id
) abonos on true;

create or replace view public.fin_vw_programacion_pagos
with (security_invoker = true)
as
select
  plan.id,
  plan.factura_id,
  plan.semana_inicio,
  extract(week from plan.semana_inicio)::integer as semana_numero,
  plan.seleccionada,
  least(plan.monto_programado, factura.saldo)::numeric(18,2)
    as monto_programado,
  plan.notas,
  plan.actualizado_en
from public.fin_programacion_pagos plan
join public.fin_vw_facturas_detalle factura on factura.id = plan.factura_id
where factura.estado in ('PENDIENTE', 'ABONO');

grant select on public.fin_vw_facturas_detalle to authenticated;
grant select on public.fin_vw_programacion_pagos to authenticated;
revoke all on public.fin_vw_facturas_detalle from anon;
revoke all on public.fin_vw_programacion_pagos from anon;
