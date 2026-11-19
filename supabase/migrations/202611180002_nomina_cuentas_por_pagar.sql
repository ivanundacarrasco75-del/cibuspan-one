begin;

create or replace function public.fin_cargar_nomina_cuentas(
  p_periodo date,p_concepto text,p_filas jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  fila record;
  persona public.fin_nomina_empleados%rowtype;
  obligacion public.fin_nomina_obligaciones%rowtype;
begin
  if not coalesce(public.app_es_admin(),false) then
    raise exception 'Solo un administrador puede cargar obligaciones de nómina.' using errcode='42501';
  end if;
  if p_periodo is null or not isfinite(p_periodo) or p_periodo<>date_trunc('month',p_periodo)::date
    or p_concepto is null or p_concepto not in ('PRIMERA_QUINCENA','SEGUNDA_QUINCENA','DECIMO_TERCERO','DECIMO_CUARTO','DECIMO_SEXTO')
    or jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Selecciona mes, concepto y personas.';
  end if;
  if jsonb_array_length(p_filas) not between 1 and 200
    or (select count(distinct x.empleado_id) from jsonb_to_recordset(p_filas) as x(empleado_id uuid))<>jsonb_array_length(p_filas) then
    raise exception 'Selecciona entre 1 y 200 personas distintas.';
  end if;
  for fila in select * from jsonb_to_recordset(p_filas) as x(empleado_id uuid,monto numeric) order by empleado_id
  loop
    select * into persona from public.fin_nomina_empleados where id=fila.empleado_id for update;
    if not found or not persona.activo then raise exception 'La persona no está activa o ya no existe.'; end if;
    if fila.monto is null or fila.monto<=0 or fila.monto<>round(fila.monto,2) or fila.monto>=1000000000 then
      raise exception 'Revisa el monto de %.',persona.nombre;
    end if;
    insert into public.fin_nomina_obligaciones(empleado_id,periodo,concepto,nombre,tipo_vinculo,monto,creado_por)
      values(persona.id,p_periodo,p_concepto,persona.nombre,persona.tipo_vinculo,fila.monto,auth.uid())
      on conflict(empleado_id,periodo,concepto) do nothing;
    select * into obligacion from public.fin_nomina_obligaciones
      where empleado_id=persona.id and periodo=p_periodo and concepto=p_concepto for update;
    perform public.fin_bloquear_documento_compra('nomina:'||obligacion.id::text);
    if obligacion.monto<>fila.monto then
      if exists(select 1 from public.fin_pagos_compras where documento_id='nomina:'||obligacion.id::text)
        or exists(select 1 from public.fin_programacion_compras where documento_id='nomina:'||obligacion.id::text) then
        raise exception 'El pago de % ya está programado con otro monto. Revisa Pagos semanales.',persona.nombre;
      end if;
      update public.fin_nomina_obligaciones set monto=fila.monto where id=obligacion.id;
    end if;
  end loop;
end;
$$;

-- Los clientes anteriores conservan su entrada, con el destino corregido.
create or replace function public.fin_cargar_nomina_semanal(
  p_periodo date,p_concepto text,p_semana date,p_filas jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.fin_cargar_nomina_cuentas(p_periodo,p_concepto,p_filas);
end;
$$;

revoke all on function public.fin_cargar_nomina_cuentas(date,text,jsonb),
  public.fin_cargar_nomina_semanal(date,text,date,jsonb) from public,anon,authenticated;
grant execute on function public.fin_cargar_nomina_cuentas(date,text,jsonb),
  public.fin_cargar_nomina_semanal(date,text,date,jsonb) to authenticated;

commit;
