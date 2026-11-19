begin;

alter table public.compras_sri
  add column if not exists edicion jsonb not null default '{}'::jsonb,
  add column if not exists abonos jsonb not null default '[]'::jsonb;

create or replace function public.compras_sri_editar(p_clave text, p_campo text, p_valor text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  compra public.compras_sri%rowtype;
  pagado numeric;
begin
  if not coalesce(public.app_es_admin(), false) then
    raise exception 'Solo un administrador puede editar compras.' using errcode = '42501';
  end if;
  if p_campo is null or p_campo not in ('fecha','serie','proveedor','descripcion','subtotal','iva','total','retencion','documento')
    or p_valor is null or length(p_valor) > 500 then
    raise exception 'Revisa el valor de la celda.';
  end if;
  p_valor := btrim(p_valor);
  if p_campo in ('fecha', 'serie', 'proveedor') and p_valor = '' then
    raise exception 'Completa esta celda.';
  end if;
  if p_campo = 'fecha' then
    if p_valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Fecha inválida.'; end if;
    perform p_valor::date;
  end if;
  if p_campo in ('subtotal','iva','total') and p_valor !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then
    raise exception 'Usa un importe de hasta dos decimales.';
  end if;

  select * into compra from public.compras_sri where clave_acceso = p_clave for update;
  if not found then raise exception 'La factura no existe.'; end if;
  if p_campo = 'total' then
    select coalesce(sum((a->>'valor')::numeric), 0)
      into pagado from jsonb_array_elements(compra.abonos) a;
    if p_valor::numeric < pagado then
      raise exception 'El total no puede ser menor que los abonos registrados.';
    end if;
  end if;

  update public.compras_sri
    set edicion = jsonb_set(compra.edicion, array[p_campo], to_jsonb(p_valor))
    where clave_acceso = p_clave returning * into compra;
  return jsonb_build_object('edicion', compra.edicion, 'abonos', compra.abonos);
end;
$$;

create or replace function public.compras_sri_abonar(
  p_clave text, p_id uuid, p_valor numeric, p_fecha date, p_documento text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  compra public.compras_sri%rowtype;
  saldo numeric;
  valor numeric;
begin
  if not coalesce(public.app_es_admin(), false) then
    raise exception 'Solo un administrador puede registrar abonos.' using errcode = '42501';
  end if;
  if p_id is null or p_fecha is null or not isfinite(p_fecha) or length(coalesce(p_documento,'')) > 500 then
    raise exception 'Revisa la fecha y el documento del abono.';
  end if;
  select * into compra from public.compras_sri where clave_acceso = p_clave for update;
  if not found then raise exception 'La factura no existe.'; end if;
  if compra.abonos @> jsonb_build_array(jsonb_build_object('id', p_id)) then
    return jsonb_build_object('edicion', compra.edicion, 'abonos', compra.abonos);
  end if;

  select round(coalesce(compra.edicion->>'total', compra.datos->>'total')::numeric, 2)
    - coalesce(sum((a->>'valor')::numeric), 0)
    into saldo from jsonb_array_elements(compra.abonos) a;
  valor := coalesce(p_valor, saldo);
  if valor <= 0 or valor > saldo or valor <> round(valor, 2) then
    raise exception 'El importe debe ser mayor que cero y no superar el saldo.';
  end if;
  update public.compras_sri
    set abonos = compra.abonos || jsonb_build_array(jsonb_build_object(
      'id', p_id, 'valor', round(valor, 2)::text, 'fecha', p_fecha,
      'documento', btrim(coalesce(p_documento,'')), 'registrado_por', auth.uid()
    ))
    where clave_acceso = p_clave returning * into compra;
  return jsonb_build_object('edicion', compra.edicion, 'abonos', compra.abonos);
end;
$$;

revoke all on function public.compras_sri_editar(text,text,text) from public, anon, authenticated;
revoke all on function public.compras_sri_abonar(text,uuid,numeric,date,text) from public, anon, authenticated;
grant execute on function public.compras_sri_editar(text,text,text) to authenticated;
grant execute on function public.compras_sri_abonar(text,uuid,numeric,date,text) to authenticated;

commit;
