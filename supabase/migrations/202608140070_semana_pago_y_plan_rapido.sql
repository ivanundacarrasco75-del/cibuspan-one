-- CIBUSPAN ONE
-- Importa la semana sugerida del Excel y acelera la seleccion del plan semanal.

alter table public.fin_facturas_proveedor
  add column if not exists semana_pago_sugerida text,
  add column if not exists semana_pago_numero integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fin_facturas_semana_pago_numero_check'
      and conrelid = 'public.fin_facturas_proveedor'::regclass
  ) then
    alter table public.fin_facturas_proveedor
      add constraint fin_facturas_semana_pago_numero_check
      check (semana_pago_numero is null or semana_pago_numero between 1 and 53);
  end if;
end;
$$;

create index if not exists fin_facturas_semana_pago_idx
  on public.fin_facturas_proveedor (semana_pago_numero)
  where semana_pago_numero is not null;

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
  cliente.nombre as cliente_nombre,
  factura.semana_pago_sugerida,
  factura.semana_pago_numero
from public.fin_facturas_proveedor factura
join public.fin_cuentas_pago cuenta on cuenta.id = factura.cuenta_pago_id
left join public.clientes cliente on cliente.id = factura.cliente_id
left join lateral (
  select sum(abono.monto) as total_abonado
  from public.fin_factura_abonos abono
  where abono.factura_id = factura.id
) abonos on true;

grant select on public.fin_vw_facturas_detalle to authenticated;
revoke all on public.fin_vw_facturas_detalle from anon;

create or replace function public.fin_actualizar_semanas_pago_facturas(
  p_lineas jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actualizadas integer;
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Las lineas del archivo no son validas.';
  end if;
  if jsonb_array_length(p_lineas) > 5000 then
    raise exception 'El archivo supera 5000 facturas.';
  end if;

  update public.fin_facturas_proveedor factura
  set semana_pago_sugerida = nullif(trim(linea.semana_pago_sugerida), ''),
      semana_pago_numero = case
        when linea.semana_pago_numero between 1 and 53
          then linea.semana_pago_numero
        else null
      end,
      actualizado_por = auth.uid(),
      actualizado_en = now()
  from jsonb_to_recordset(p_lineas) as linea(
    clave_origen text,
    semana_pago_sugerida text,
    semana_pago_numero integer
  )
  where factura.clave_origen = trim(linea.clave_origen);

  get diagnostics v_actualizadas = row_count;
  return v_actualizadas;
end;
$$;

revoke all on function public.fin_actualizar_semanas_pago_facturas(jsonb)
  from public, anon;
grant execute on function public.fin_actualizar_semanas_pago_facturas(jsonb)
  to authenticated;

drop function if exists public.fin_programar_factura(uuid, date, boolean, numeric);

create function public.fin_programar_factura(
  p_factura_id uuid,
  p_semana_inicio date,
  p_seleccionada boolean,
  p_monto numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric(18,2);
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.fin_programacion_pagos
    where factura_id = p_factura_id
      and semana_inicio = p_semana_inicio
      and estado_plan = 'PAGADO'
  ) then
    raise exception 'Este pago ya fue ejecutado y no puede modificarse.';
  end if;

  select saldo into v_saldo
  from public.fin_vw_facturas_detalle
  where id = p_factura_id;
  if v_saldo is null or v_saldo <= 0 then
    raise exception 'La factura no tiene saldo pendiente.';
  end if;
  if p_semana_inicio is null or extract(isodow from p_semana_inicio) <> 1 then
    raise exception 'La semana debe iniciar en lunes.';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > v_saldo then
    raise exception 'El monto debe ser mayor a cero y no superar el saldo.';
  end if;

  insert into public.fin_programacion_pagos (
    factura_id, semana_inicio, seleccionada, monto_programado,
    estado_plan, creado_por, actualizado_por
  ) values (
    p_factura_id, p_semana_inicio, p_seleccionada, round(p_monto, 2),
    'PREPARADO', auth.uid(), auth.uid()
  )
  on conflict (factura_id, semana_inicio) do update
  set seleccionada = excluded.seleccionada,
      monto_programado = excluded.monto_programado,
      actualizado_por = auth.uid(),
      actualizado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.fin_programar_factura(uuid, date, boolean, numeric)
  from public, anon;
grant execute on function public.fin_programar_factura(uuid, date, boolean, numeric)
  to authenticated;

