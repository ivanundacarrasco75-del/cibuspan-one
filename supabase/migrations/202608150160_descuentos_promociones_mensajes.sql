-- CIBUSPAN ONE
-- Descuentos y promociones, conciliacion de notas de credito y alertas internas.

create table if not exists public.com_promociones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  fecha_inicio date not null,
  fecha_fin date not null,
  observaciones text,
  activo boolean not null default true,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_promociones_fechas_check check (fecha_fin >= fecha_inicio)
);

create table if not exists public.com_promocion_productos (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references public.com_promociones(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  tipo_descuento text not null check (tipo_descuento in ('PORCENTAJE', 'VALOR_UNIDAD')),
  valor_descuento numeric(18,6) not null check (valor_descuento > 0),
  creado_en timestamptz not null default now(),
  constraint com_promocion_producto_key unique (promocion_id, producto_id),
  constraint com_promocion_porcentaje_check check (
    tipo_descuento <> 'PORCENTAJE' or valor_descuento <= 100
  )
);

create table if not exists public.com_promocion_notas_credito (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references public.com_promociones(id) on delete restrict,
  numero text not null,
  fecha date not null,
  valor_aplicado numeric(18,6) not null check (valor_aplicado > 0),
  observaciones text,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_promocion_nota_numero_key unique (promocion_id, numero)
);

create table if not exists public.app_recordatorios (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  mensaje text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  prioridad text not null default 'NORMAL' check (prioridad in ('NORMAL', 'ALTA')),
  destino_tipo text not null default 'TODOS' check (destino_tipo in ('TODOS', 'ROL', 'USUARIO')),
  destino_rol text,
  destino_usuario uuid references public.app_profiles(user_id) on delete cascade,
  activo boolean not null default true,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint app_recordatorios_fechas_check check (fecha_fin >= fecha_inicio),
  constraint app_recordatorios_destino_check check (
    (destino_tipo = 'TODOS' and destino_rol is null and destino_usuario is null)
    or (destino_tipo = 'ROL' and destino_rol is not null and destino_usuario is null)
    or (destino_tipo = 'USUARIO' and destino_rol is null and destino_usuario is not null)
  )
);

create table if not exists public.app_alertas_leidas (
  user_id uuid not null references auth.users(id) on delete cascade,
  alerta_clave text not null,
  leida_en timestamptz not null default now(),
  primary key (user_id, alerta_clave)
);

create index if not exists com_promociones_cliente_fechas_idx
  on public.com_promociones (cliente_id, fecha_inicio, fecha_fin);
create index if not exists com_promocion_productos_producto_idx
  on public.com_promocion_productos (producto_id, promocion_id);
create index if not exists com_promocion_notas_fecha_idx
  on public.com_promocion_notas_credito (fecha desc);
create index if not exists app_recordatorios_fechas_idx
  on public.app_recordatorios (fecha_inicio, fecha_fin) where activo;

alter table public.com_promociones enable row level security;
alter table public.com_promocion_productos enable row level security;
alter table public.com_promocion_notas_credito enable row level security;
alter table public.app_recordatorios enable row level security;
alter table public.app_alertas_leidas enable row level security;

revoke all on table public.com_promociones from anon;
revoke all on table public.com_promocion_productos from anon;
revoke all on table public.com_promocion_notas_credito from anon;
revoke all on table public.app_recordatorios from anon;
revoke all on table public.app_alertas_leidas from anon;

revoke insert, update, delete on table public.com_promociones from authenticated;
revoke insert, update, delete on table public.com_promocion_productos from authenticated;
revoke insert, update, delete on table public.com_promocion_notas_credito from authenticated;
revoke insert, update, delete on table public.app_recordatorios from authenticated;
revoke insert, update, delete on table public.app_alertas_leidas from authenticated;

grant select on table public.com_promociones to authenticated;
grant select on table public.com_promocion_productos to authenticated;
grant select on table public.com_promocion_notas_credito to authenticated;

drop policy if exists c1_promociones_lectura on public.com_promociones;
create policy c1_promociones_lectura on public.com_promociones
for select to authenticated
using (public.app_puede_alguna(array['Reportes', 'Administración']));

drop policy if exists c1_promocion_productos_lectura on public.com_promocion_productos;
create policy c1_promocion_productos_lectura on public.com_promocion_productos
for select to authenticated
using (public.app_puede_alguna(array['Reportes', 'Administración']));

drop policy if exists c1_promocion_notas_lectura on public.com_promocion_notas_credito;
create policy c1_promocion_notas_lectura on public.com_promocion_notas_credito
for select to authenticated
using (public.app_puede_alguna(array['Reportes', 'Administración']));

create or replace function public.com_guardar_promocion(
  p_nombre text,
  p_cliente_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_observaciones text,
  p_productos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promocion_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesion valida.';
  end if;
  if not public.app_puede_alguna(array['Reportes', 'Administración']) then
    raise exception 'No tienes permiso para registrar promociones.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'El nombre de la promocion es obligatorio.';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and activo) then
    raise exception 'Selecciona un cliente activo.';
  end if;
  if p_fecha_inicio is null or p_fecha_fin is null or p_fecha_fin < p_fecha_inicio then
    raise exception 'El rango de fechas de la promocion no es valido.';
  end if;
  if jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'Agrega al menos un SKU a la promocion.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_productos) as item(
      producto_id uuid, tipo_descuento text, valor_descuento numeric
    )
    where item.producto_id is null
       or item.tipo_descuento not in ('PORCENTAJE', 'VALOR_UNIDAD')
       or item.valor_descuento is null
       or item.valor_descuento <= 0
       or (item.tipo_descuento = 'PORCENTAJE' and item.valor_descuento > 100)
       or not exists (
         select 1 from public.productos producto
         where producto.id = item.producto_id and producto.activo
       )
  ) then
    raise exception 'Existen SKU o descuentos invalidos en la promocion.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_productos) as item(producto_id uuid)
    group by item.producto_id
    having count(*) > 1
  ) then
    raise exception 'No puedes repetir un SKU dentro de la misma promocion.';
  end if;

  insert into public.com_promociones (
    nombre, cliente_id, fecha_inicio, fecha_fin, observaciones, creado_por
  ) values (
    trim(p_nombre), p_cliente_id, p_fecha_inicio, p_fecha_fin,
    nullif(trim(coalesce(p_observaciones, '')), ''), auth.uid()
  ) returning id into v_promocion_id;

  insert into public.com_promocion_productos (
    promocion_id, producto_id, tipo_descuento, valor_descuento
  )
  select
    v_promocion_id,
    item.producto_id,
    item.tipo_descuento,
    round(item.valor_descuento, 6)
  from jsonb_to_recordset(p_productos) as item(
    producto_id uuid, tipo_descuento text, valor_descuento numeric
  );

  return v_promocion_id;
end;
$$;

create or replace function public.com_registrar_nota_descuento(
  p_promocion_id uuid,
  p_numero text,
  p_fecha date,
  p_valor_aplicado numeric,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_nota_id uuid;
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Reportes', 'Administración']) then
    raise exception 'No tienes permiso para registrar notas de credito.' using errcode = '42501';
  end if;
  select cliente_id into v_cliente_id
  from public.com_promociones where id = p_promocion_id;
  if v_cliente_id is null then raise exception 'La promocion no existe.'; end if;
  if nullif(trim(coalesce(p_numero, '')), '') is null then
    raise exception 'El numero de la nota de credito es obligatorio.';
  end if;
  if p_fecha is null then raise exception 'La fecha de la nota de credito es obligatoria.'; end if;
  if coalesce(p_valor_aplicado, 0) <= 0 then
    raise exception 'El valor aplicado debe ser mayor que cero.';
  end if;
  if exists (
    select 1
    from public.com_promocion_notas_credito nota
    join public.com_promociones promocion on promocion.id = nota.promocion_id
    where promocion.cliente_id = v_cliente_id
      and upper(trim(nota.numero)) = upper(trim(p_numero))
      and nota.promocion_id <> p_promocion_id
  ) then
    raise exception 'Esta nota de credito ya fue registrada para otra promocion del mismo cliente.';
  end if;

  insert into public.com_promocion_notas_credito (
    promocion_id, numero, fecha, valor_aplicado, observaciones, creado_por
  ) values (
    p_promocion_id, trim(p_numero), p_fecha, round(p_valor_aplicado, 6),
    nullif(trim(coalesce(p_observaciones, '')), ''), auth.uid()
  )
  on conflict (promocion_id, numero) do update
  set fecha = excluded.fecha,
      valor_aplicado = excluded.valor_aplicado,
      observaciones = excluded.observaciones,
      actualizado_en = now()
  returning id into v_nota_id;

  return v_nota_id;
end;
$$;

create or replace function public.com_cambiar_estado_promocion(
  p_promocion_id uuid,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Reportes', 'Administración']) then
    raise exception 'No tienes permiso para modificar promociones.' using errcode = '42501';
  end if;
  update public.com_promociones
  set activo = coalesce(p_activo, false), actualizado_en = now()
  where id = p_promocion_id;
  if not found then raise exception 'La promocion no existe.'; end if;
end;
$$;

create or replace function public.com_listar_promociones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Reportes', 'Administración']) then
    raise exception 'No tienes permiso para consultar promociones.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(resumen) order by resumen.fecha_inicio desc, resumen.creado_en desc), '[]'::jsonb)
  into v_resultado
  from (
    select
      promocion.id,
      promocion.nombre,
      promocion.cliente_id,
      cliente.nombre as cliente_nombre,
      promocion.fecha_inicio,
      promocion.fecha_fin,
      promocion.observaciones,
      promocion.activo,
      promocion.creado_en,
      case
        when not promocion.activo then 'CANCELADA'
        when current_date < promocion.fecha_inicio then 'PROXIMA'
        when current_date > promocion.fecha_fin then 'FINALIZADA'
        else 'ACTIVA'
      end as estado,
      coalesce(productos.detalle, '[]'::jsonb) as productos,
      coalesce(productos.unidades, 0)::numeric(18,3) as unidades_vendidas,
      coalesce(productos.venta_base, 0)::numeric(18,6) as venta_base,
      coalesce(productos.descuento_esperado, 0)::numeric(18,6) as descuento_esperado,
      coalesce(notas.detalle, '[]'::jsonb) as notas_credito,
      coalesce(notas.total, 0)::numeric(18,6) as notas_total,
      (coalesce(productos.descuento_esperado, 0) - coalesce(notas.total, 0))::numeric(18,6) as diferencia
    from public.com_promociones promocion
    join public.clientes cliente on cliente.id = promocion.cliente_id
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'producto_id', item.producto_id,
            'sku', item.sku,
            'producto_nombre', item.producto_nombre,
            'tipo_descuento', item.tipo_descuento,
            'valor_descuento', item.valor_descuento,
            'unidades_vendidas', item.unidades,
            'venta_base', item.venta_base,
            'descuento_esperado', item.descuento_esperado
          ) order by item.producto_nombre
        ) as detalle,
        sum(item.unidades) as unidades,
        sum(item.venta_base) as venta_base,
        sum(item.descuento_esperado) as descuento_esperado
      from (
        select
          relacion.id,
          relacion.producto_id,
          producto.codigo as sku,
          producto.nombre as producto_nombre,
          relacion.tipo_descuento,
          relacion.valor_descuento,
          coalesce(ventas.unidades, 0) as unidades,
          coalesce(ventas.venta_base, 0) as venta_base,
          case
            when relacion.tipo_descuento = 'PORCENTAJE'
              then coalesce(ventas.venta_base, 0) * relacion.valor_descuento / 100
            else coalesce(ventas.unidades, 0) * relacion.valor_descuento
          end as descuento_esperado
        from public.com_promocion_productos relacion
        join public.productos producto on producto.id = relacion.producto_id
        left join lateral (
          select
            coalesce(sum(venta.cantidad), 0)::numeric as unidades,
            coalesce(sum(venta.total_sin_impuestos), 0)::numeric as venta_base
          from public.com_ventas_detalle venta
          where venta.fecha_emision between promocion.fecha_inicio and promocion.fecha_fin
            and (
              venta.cliente_id = promocion.cliente_id
              or (
                venta.cliente_id is null
                and upper(regexp_replace(trim(venta.cliente_nombre), '[[:space:]]+', ' ', 'g')) =
                    upper(regexp_replace(trim(cliente.nombre), '[[:space:]]+', ' ', 'g'))
              )
            )
            and (venta.producto_id = relacion.producto_id or trim(venta.sku) = trim(producto.codigo))
        ) ventas on true
        where relacion.promocion_id = promocion.id
      ) item
    ) productos on true
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'id', nota.id,
            'numero', nota.numero,
            'fecha', nota.fecha,
            'valor_aplicado', nota.valor_aplicado,
            'observaciones', nota.observaciones
          ) order by nota.fecha desc, nota.numero
        ) as detalle,
        sum(nota.valor_aplicado) as total
      from public.com_promocion_notas_credito nota
      where nota.promocion_id = promocion.id
    ) notas on true
  ) resumen;

  return v_resultado;
end;
$$;

create or replace function public.app_guardar_recordatorio(
  p_titulo text,
  p_mensaje text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_prioridad text,
  p_destino_tipo text,
  p_destino_rol text default null,
  p_destino_usuario uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tipo text := upper(trim(coalesce(p_destino_tipo, 'TODOS')));
  v_prioridad text := upper(trim(coalesce(p_prioridad, 'NORMAL')));
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para crear recordatorios.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_titulo, '')), '') is null
     or nullif(trim(coalesce(p_mensaje, '')), '') is null then
    raise exception 'El titulo y el mensaje son obligatorios.';
  end if;
  if p_fecha_inicio is null or p_fecha_fin is null or p_fecha_fin < p_fecha_inicio then
    raise exception 'El rango de fechas del mensaje no es valido.';
  end if;
  if v_prioridad not in ('NORMAL', 'ALTA') then raise exception 'La prioridad no es valida.'; end if;
  if v_tipo not in ('TODOS', 'ROL', 'USUARIO') then raise exception 'El tipo de destinatario no es valido.'; end if;
  if v_tipo = 'ROL' and coalesce(p_destino_rol, '') not in (
    'ADMINISTRADOR', 'GERENTE', 'BODEGUERO', 'GERENTE_OPERACIONES', 'JEFA_FACTURACION'
  ) then raise exception 'Selecciona un rol valido.'; end if;
  if v_tipo = 'USUARIO' and not exists (
    select 1 from public.app_profiles where user_id = p_destino_usuario and activo
  ) then raise exception 'Selecciona un usuario activo.'; end if;

  insert into public.app_recordatorios (
    titulo, mensaje, fecha_inicio, fecha_fin, prioridad,
    destino_tipo, destino_rol, destino_usuario, creado_por
  ) values (
    trim(p_titulo), trim(p_mensaje), p_fecha_inicio, p_fecha_fin, v_prioridad,
    v_tipo,
    case when v_tipo = 'ROL' then p_destino_rol else null end,
    case when v_tipo = 'USUARIO' then p_destino_usuario else null end,
    auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.app_cambiar_estado_recordatorio(
  p_recordatorio_id uuid,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para modificar recordatorios.' using errcode = '42501';
  end if;
  update public.app_recordatorios
  set activo = coalesce(p_activo, false), actualizado_en = now()
  where id = p_recordatorio_id;
  if not found then raise exception 'El recordatorio no existe.'; end if;
end;
$$;

create or replace function public.app_listar_recordatorios()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para consultar recordatorios.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.fecha_inicio desc, item.creado_en desc), '[]'::jsonb)
  into v_resultado
  from (
    select
      recordatorio.id,
      recordatorio.titulo,
      recordatorio.mensaje,
      recordatorio.fecha_inicio,
      recordatorio.fecha_fin,
      recordatorio.prioridad,
      recordatorio.destino_tipo,
      recordatorio.destino_rol,
      recordatorio.destino_usuario,
      coalesce(perfil.nombre, perfil.email) as destino_usuario_nombre,
      recordatorio.activo,
      recordatorio.creado_en
    from public.app_recordatorios recordatorio
    left join public.app_profiles perfil on perfil.user_id = recordatorio.destino_usuario
  ) item;
  return v_resultado;
end;
$$;

create or replace function public.app_destinatarios_recordatorios()
returns table (user_id uuid, nombre text, email text, rol text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if not public.app_puede_alguna(array['Administración']) then
    raise exception 'No tienes permiso para consultar usuarios.' using errcode = '42501';
  end if;
  return query
  select perfil.user_id, perfil.nombre, perfil.email, perfil.rol
  from public.app_profiles perfil
  where perfil.activo
  order by coalesce(perfil.nombre, perfil.email);
end;
$$;

create or replace function public.app_mis_alertas()
returns table (
  clave text,
  tipo text,
  titulo text,
  mensaje text,
  fecha date,
  prioridad text,
  pantalla_destino text,
  leida boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with mi_perfil as (
    select perfil.user_id, perfil.rol
    from public.app_profiles perfil
    where perfil.user_id = auth.uid() and perfil.activo
  ), alertas as (
    select
      'MENSAJE:' || recordatorio.id::text as clave,
      'MENSAJE'::text as tipo,
      recordatorio.titulo,
      recordatorio.mensaje,
      case when current_date < recordatorio.fecha_inicio then recordatorio.fecha_inicio else current_date end as fecha,
      recordatorio.prioridad,
      'Dashboard'::text as pantalla_destino
    from public.app_recordatorios recordatorio
    cross join mi_perfil perfil
    where recordatorio.activo
      and recordatorio.fecha_inicio <= current_date + 7
      and recordatorio.fecha_fin >= current_date - 1
      and (
        recordatorio.destino_tipo = 'TODOS'
        or (recordatorio.destino_tipo = 'ROL' and recordatorio.destino_rol = perfil.rol)
        or (recordatorio.destino_tipo = 'USUARIO' and recordatorio.destino_usuario = perfil.user_id)
      )

    union all

    select
      'PROMO_INICIO:' || promocion.id::text,
      'PROMOCION_INICIO'::text,
      'Inicia promocion: ' || promocion.nombre,
      cliente.nombre || ' · ' || count(producto.id)::text ||
        case when count(producto.id) = 1 then ' SKU en descuento.' else ' SKU en descuento.' end,
      promocion.fecha_inicio,
      'ALTA'::text,
      'Descuentos y promociones'::text
    from public.com_promociones promocion
    join public.clientes cliente on cliente.id = promocion.cliente_id
    join public.com_promocion_productos producto on producto.promocion_id = promocion.id
    where promocion.activo
      and public.app_puede_alguna(array['Reportes', 'Administración'])
      and promocion.fecha_inicio between current_date and current_date + 7
    group by promocion.id, promocion.nombre, cliente.nombre, promocion.fecha_inicio

    union all

    select
      'PROMO_FIN:' || promocion.id::text,
      'PROMOCION_FIN'::text,
      'Termina promocion: ' || promocion.nombre,
      cliente.nombre || ' · verifica las notas de credito pendientes.',
      promocion.fecha_fin,
      'ALTA'::text,
      'Descuentos y promociones'::text
    from public.com_promociones promocion
    join public.clientes cliente on cliente.id = promocion.cliente_id
    where promocion.activo
      and public.app_puede_alguna(array['Reportes', 'Administración'])
      and promocion.fecha_fin between current_date - 1 and current_date + 7
  )
  select
    alerta.clave,
    alerta.tipo,
    alerta.titulo,
    alerta.mensaje,
    alerta.fecha,
    alerta.prioridad,
    alerta.pantalla_destino,
    (leida.alerta_clave is not null) as leida
  from alertas alerta
  left join public.app_alertas_leidas leida
    on leida.user_id = auth.uid() and leida.alerta_clave = alerta.clave
  where auth.uid() is not null
  order by alerta.fecha asc, alerta.prioridad desc, alerta.titulo;
$$;

create or replace function public.app_marcar_alerta_leida(p_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No existe una sesion valida.'; end if;
  if nullif(trim(coalesce(p_clave, '')), '') is null or length(p_clave) > 160 then
    raise exception 'La alerta no es valida.';
  end if;
  insert into public.app_alertas_leidas (user_id, alerta_clave)
  values (auth.uid(), trim(p_clave))
  on conflict (user_id, alerta_clave) do update set leida_en = now();
end;
$$;

revoke all on function public.com_guardar_promocion(text, uuid, date, date, text, jsonb) from public, anon;
revoke all on function public.com_registrar_nota_descuento(uuid, text, date, numeric, text) from public, anon;
revoke all on function public.com_cambiar_estado_promocion(uuid, boolean) from public, anon;
revoke all on function public.com_listar_promociones() from public, anon;
revoke all on function public.app_guardar_recordatorio(text, text, date, date, text, text, text, uuid) from public, anon;
revoke all on function public.app_cambiar_estado_recordatorio(uuid, boolean) from public, anon;
revoke all on function public.app_listar_recordatorios() from public, anon;
revoke all on function public.app_destinatarios_recordatorios() from public, anon;
revoke all on function public.app_mis_alertas() from public, anon;
revoke all on function public.app_marcar_alerta_leida(text) from public, anon;

grant execute on function public.com_guardar_promocion(text, uuid, date, date, text, jsonb) to authenticated;
grant execute on function public.com_registrar_nota_descuento(uuid, text, date, numeric, text) to authenticated;
grant execute on function public.com_cambiar_estado_promocion(uuid, boolean) to authenticated;
grant execute on function public.com_listar_promociones() to authenticated;
grant execute on function public.app_guardar_recordatorio(text, text, date, date, text, text, text, uuid) to authenticated;
grant execute on function public.app_cambiar_estado_recordatorio(uuid, boolean) to authenticated;
grant execute on function public.app_listar_recordatorios() to authenticated;
grant execute on function public.app_destinatarios_recordatorios() to authenticated;
grant execute on function public.app_mis_alertas() to authenticated;
grant execute on function public.app_marcar_alerta_leida(text) to authenticated;
