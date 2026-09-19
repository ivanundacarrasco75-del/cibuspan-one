-- CIBUSPAN ONE
-- Reglas editables para distribuir costos compartidos en la rentabilidad gerencial.

create table if not exists public.fin_reglas_distribucion (
  codigo text primary key,
  nombre text not null,
  descripcion text not null,
  base_distribucion text not null check (
    base_distribucion in ('VENTAS_NETAS', 'UNIDADES', 'KG_EQUIVALENTE')
  ),
  orden integer not null default 100,
  activo boolean not null default true,
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_en timestamptz not null default now()
);

insert into public.fin_reglas_distribucion (
  codigo, nombre, descripcion, base_distribucion, orden
)
values
  (
    'PERSONAL_PRODUCCION',
    'Personal de producción',
    'Mano de obra directa e indirecta.',
    'KG_EQUIVALENTE',
    10
  ),
  (
    'PERSONAL_ESTRUCTURA',
    'Personal administrativo y comercial',
    'Administración, ventas y distribución.',
    'VENTAS_NETAS',
    20
  ),
  (
    'TRANSPORTE',
    'Transporte y distribución',
    'Fletes, movilización, peajes y costos logísticos.',
    'UNIDADES',
    30
  ),
  (
    'OPERACION',
    'Gastos de operación',
    'Servicios e insumos para operar la planta.',
    'KG_EQUIVALENTE',
    40
  ),
  (
    'ESTRUCTURA_GENERAL',
    'Administración y comercial general',
    'Gastos administrativos, comerciales y otros gastos EBITDA.',
    'VENTAS_NETAS',
    50
  )
on conflict (codigo) do update
set nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    orden = excluded.orden,
    activo = true;

alter table public.fin_reglas_distribucion enable row level security;
revoke all on table public.fin_reglas_distribucion from anon;
revoke insert, update, delete on table public.fin_reglas_distribucion from authenticated;
grant select on table public.fin_reglas_distribucion to authenticated;

drop policy if exists fin_reglas_distribucion_lectura
  on public.fin_reglas_distribucion;
create policy fin_reglas_distribucion_lectura
  on public.fin_reglas_distribucion
  for select
  to authenticated
  using (auth.uid() is not null);

create or replace function public.fin_guardar_reglas_distribucion(
  p_reglas jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regla record;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.';
  end if;

  if not exists (
    select 1
    from public.app_profiles perfil
    where perfil.user_id = auth.uid()
      and perfil.activo
      and perfil.rol::text in ('ADMINISTRADOR', 'GERENTE')
  ) then
    raise exception 'Solo Administrador o Gerente puede cambiar estas reglas.';
  end if;

  if jsonb_typeof(coalesce(p_reglas, '[]'::jsonb)) <> 'array' then
    raise exception 'Las reglas deben enviarse como una lista.';
  end if;

  for v_regla in
    select *
    from jsonb_to_recordset(p_reglas) as x(
      codigo text,
      base_distribucion text
    )
  loop
    if v_regla.base_distribucion not in (
      'VENTAS_NETAS', 'UNIDADES', 'KG_EQUIVALENTE'
    ) then
      raise exception 'Base de distribución no válida para %.', v_regla.codigo;
    end if;

    update public.fin_reglas_distribucion
    set base_distribucion = v_regla.base_distribucion,
        actualizado_por = auth.uid(),
        actualizado_en = now()
    where codigo = v_regla.codigo
      and activo;

    if not found then
      raise exception 'La regla % no existe o está inactiva.', v_regla.codigo;
    end if;
  end loop;
end;
$$;

revoke all on function public.fin_guardar_reglas_distribucion(jsonb)
  from public, anon;
grant execute on function public.fin_guardar_reglas_distribucion(jsonb)
  to authenticated;
