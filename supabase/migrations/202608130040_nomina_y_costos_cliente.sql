-- CIBUSPAN ONE
-- Apertura de nomina por area y atribucion de facturas a cliente o negocio completo.

insert into public.fin_cuentas_pago (
  codigo, nombre, grupo, naturaleza,
  cuenta_contable_referencia, impacta_ebitda, orden
)
values
  ('NOM-MOD', 'Mano de obra directa - producción', 'PERSONAL', 'GASTO_EBITDA', null, true, 14),
  ('NOM-MOI', 'Mano de obra indirecta - producción', 'PERSONAL', 'GASTO_EBITDA', null, true, 15),
  ('NOM-ADM', 'Sueldos administrativos', 'PERSONAL', 'GASTO_EBITDA', null, true, 16),
  ('NOM-VTA', 'Sueldos comerciales', 'PERSONAL', 'GASTO_EBITDA', null, true, 17),
  ('NOM-DIST', 'Sueldos de distribución', 'PERSONAL', 'GASTO_EBITDA', null, true, 18)
on conflict (codigo) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    naturaleza = excluded.naturaleza,
    impacta_ebitda = excluded.impacta_ebitda,
    orden = excluded.orden,
    activo = true;

alter table public.fin_facturas_proveedor
  add column if not exists afecta_tipo text not null default 'GENERAL',
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fin_facturas_afecta_tipo_check'
      and conrelid = 'public.fin_facturas_proveedor'::regclass
  ) then
    alter table public.fin_facturas_proveedor
      add constraint fin_facturas_afecta_tipo_check
      check (afecta_tipo in ('GENERAL', 'CLIENTE'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'fin_facturas_cliente_coherente_check'
      and conrelid = 'public.fin_facturas_proveedor'::regclass
  ) then
    alter table public.fin_facturas_proveedor
      add constraint fin_facturas_cliente_coherente_check
      check (
        (afecta_tipo = 'GENERAL' and cliente_id is null)
        or (afecta_tipo = 'CLIENTE' and cliente_id is not null)
      );
  end if;
end;
$$;

create index if not exists fin_facturas_cliente_fecha_idx
  on public.fin_facturas_proveedor (cliente_id, fecha_emision desc)
  where cliente_id is not null;

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
  greatest(factura.valor_neto_pagar - coalesce(abonos.total_abonado, 0), 0)::numeric(18,2) as saldo,
  case
    when factura.anulada then 'ANULADA'
    when factura.valor_neto_pagar - coalesce(abonos.total_abonado, 0) <= 0.005 then 'PAGADA'
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

create or replace view public.fin_vw_factura_abonos
with (security_invoker = true)
as
select
  abono.id,
  abono.factura_id,
  abono.fecha_pago,
  (abono.fecha_pago - ((extract(isodow from abono.fecha_pago)::integer) - 1))::date as semana_inicio,
  extract(week from abono.fecha_pago)::integer as semana_numero,
  abono.monto,
  abono.documento,
  abono.notas,
  abono.origen,
  factura.proveedor,
  factura.numero_factura,
  factura.descripcion,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  cuenta.grupo,
  cuenta.naturaleza,
  cuenta.impacta_ebitda,
  abono.creado_en,
  factura.afecta_tipo,
  factura.cliente_id,
  cliente.nombre as cliente_nombre
from public.fin_factura_abonos abono
join public.fin_facturas_proveedor factura on factura.id = abono.factura_id
join public.fin_cuentas_pago cuenta on cuenta.id = factura.cuenta_pago_id
left join public.clientes cliente on cliente.id = factura.cliente_id;

create or replace view public.fin_vw_gastos_cliente_mensuales
with (security_invoker = true)
as
select
  date_trunc('month', factura.fecha_emision)::date as mes,
  factura.cliente_id,
  cliente.nombre as cliente_nombre,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  count(*)::integer as facturas,
  sum(factura.subtotal)::numeric(18,2) as gasto_sin_iva
from public.fin_facturas_proveedor factura
join public.clientes cliente on cliente.id = factura.cliente_id
join public.fin_cuentas_pago cuenta on cuenta.id = factura.cuenta_pago_id
where factura.afecta_tipo = 'CLIENTE'
  and not factura.anulada
  and cuenta.naturaleza = 'GASTO_EBITDA'
  and factura.fecha_emision is not null
group by
  date_trunc('month', factura.fecha_emision)::date,
  factura.cliente_id,
  cliente.nombre,
  cuenta.codigo,
  cuenta.nombre;

create or replace view public.fin_vw_gastos_cliente_detalle
with (security_invoker = true)
as
select
  factura.id as factura_id,
  factura.fecha_emision,
  factura.cliente_id,
  cliente.nombre as cliente_nombre,
  cuenta.codigo as cuenta_codigo,
  cuenta.nombre as cuenta_nombre,
  factura.proveedor,
  factura.numero_factura,
  factura.descripcion,
  factura.subtotal::numeric(18,2) as gasto_sin_iva
from public.fin_facturas_proveedor factura
join public.clientes cliente on cliente.id = factura.cliente_id
join public.fin_cuentas_pago cuenta on cuenta.id = factura.cuenta_pago_id
where factura.afecta_tipo = 'CLIENTE'
  and not factura.anulada
  and cuenta.naturaleza = 'GASTO_EBITDA'
  and factura.fecha_emision is not null;

grant select on public.fin_vw_gastos_cliente_mensuales to authenticated;
revoke all on public.fin_vw_gastos_cliente_mensuales from anon;
grant select on public.fin_vw_gastos_cliente_detalle to authenticated;
revoke all on public.fin_vw_gastos_cliente_detalle from anon;

create or replace function public.fin_guardar_factura(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cuenta_id uuid;
  v_cliente_id uuid;
  v_afecta_tipo text;
  v_subtotal numeric(18,2);
  v_tasa numeric(7,4);
  v_iva numeric(18,2);
  v_total numeric(18,2);
  v_retencion numeric(18,2);
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para guardar facturas.' using errcode = '42501';
  end if;

  v_id := nullif(p_datos->>'id', '')::uuid;
  v_subtotal := round(coalesce((p_datos->>'subtotal')::numeric, 0), 2);
  v_tasa := coalesce((p_datos->>'tasa_iva')::numeric, 15);
  v_iva := case when coalesce((p_datos->>'aplica_iva')::boolean, false)
    then round(v_subtotal * v_tasa / 100, 2) else 0 end;
  v_total := v_subtotal + v_iva;
  v_retencion := round(coalesce((p_datos->>'retencion')::numeric, 0), 2);
  v_afecta_tipo := upper(coalesce(nullif(trim(p_datos->>'afecta_tipo'), ''), 'GENERAL'));
  v_cliente_id := nullif(p_datos->>'cliente_id', '')::uuid;

  if trim(coalesce(p_datos->>'proveedor', '')) = '' or v_subtotal <= 0 then
    raise exception 'Proveedor y subtotal mayor a cero son obligatorios.';
  end if;
  if v_retencion < 0 or v_retencion >= v_total then
    raise exception 'La retencion no puede alcanzar el total.';
  end if;
  if v_afecta_tipo not in ('GENERAL', 'CLIENTE') then
    raise exception 'El destino del gasto no es valido.';
  end if;
  if v_afecta_tipo = 'GENERAL' then
    v_cliente_id := null;
  elsif v_cliente_id is null or not exists (
    select 1 from public.clientes where id = v_cliente_id and activo
  ) then
    raise exception 'Seleccione un cliente activo para esta factura.';
  end if;

  select id into v_cuenta_id
  from public.fin_cuentas_pago
  where codigo = coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE')
    and activo;
  if v_cuenta_id is null then
    select id into v_cuenta_id from public.fin_cuentas_pago where codigo = 'PENDIENTE';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.fin_facturas_proveedor (
      id, clave_origen, fecha_emision, fecha_vencimiento, numero_factura,
      proveedor, proveedor_normalizado, descripcion, subtotal, aplica_iva,
      tasa_iva, iva, total_factura, retencion, valor_neto_pagar,
      cuenta_pago_id, estado_clasificacion, confianza, notas,
      afecta_tipo, cliente_id, creado_por, actualizado_por
    ) values (
      v_id, 'MANUAL|' || v_id::text, nullif(p_datos->>'fecha_emision', '')::date,
      nullif(p_datos->>'fecha_vencimiento', '')::date,
      nullif(trim(p_datos->>'numero_factura'), ''), trim(p_datos->>'proveedor'),
      public.fin_normalizar_texto(p_datos->>'proveedor'),
      nullif(trim(p_datos->>'descripcion'), ''), v_subtotal,
      coalesce((p_datos->>'aplica_iva')::boolean, false), v_tasa, v_iva,
      v_total, v_retencion, v_total - v_retencion, v_cuenta_id,
      case when coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') = 'PENDIENTE'
        then 'PENDIENTE' else 'REVISADA' end,
      case when coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') = 'PENDIENTE'
        then 0 else 1 end,
      nullif(trim(p_datos->>'notas'), ''), v_afecta_tipo, v_cliente_id,
      auth.uid(), auth.uid()
    );
  else
    update public.fin_facturas_proveedor
    set fecha_emision = nullif(p_datos->>'fecha_emision', '')::date,
        fecha_vencimiento = nullif(p_datos->>'fecha_vencimiento', '')::date,
        numero_factura = nullif(trim(p_datos->>'numero_factura'), ''),
        proveedor = trim(p_datos->>'proveedor'),
        proveedor_normalizado = public.fin_normalizar_texto(p_datos->>'proveedor'),
        descripcion = nullif(trim(p_datos->>'descripcion'), ''),
        subtotal = v_subtotal,
        aplica_iva = coalesce((p_datos->>'aplica_iva')::boolean, false),
        tasa_iva = v_tasa,
        iva = v_iva,
        total_factura = v_total,
        retencion = v_retencion,
        valor_neto_pagar = v_total - v_retencion,
        cuenta_pago_id = v_cuenta_id,
        estado_clasificacion = case
          when coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') = 'PENDIENTE'
          then 'PENDIENTE' else 'REVISADA' end,
        confianza = case
          when coalesce(nullif(trim(p_datos->>'cuenta_codigo'), ''), 'PENDIENTE') = 'PENDIENTE'
          then 0 else 1 end,
        notas = nullif(trim(p_datos->>'notas'), ''),
        afecta_tipo = v_afecta_tipo,
        cliente_id = v_cliente_id,
        actualizado_por = auth.uid(),
        actualizado_en = now()
    where id = v_id;
    if not found then raise exception 'La factura seleccionada no existe.'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.fin_guardar_factura(jsonb) from public, anon;
grant execute on function public.fin_guardar_factura(jsonb) to authenticated;

comment on view public.fin_vw_gastos_cliente_mensuales is
  'Gastos EBITDA directos por cliente, por fecha de emision y sin IVA recuperable.';

comment on view public.fin_vw_gastos_cliente_detalle is
  'Detalle de gastos EBITDA directos por cliente para margenes por rango de fechas.';
