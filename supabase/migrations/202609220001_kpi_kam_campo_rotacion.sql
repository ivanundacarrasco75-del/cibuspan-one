-- CIBUSPAN ONE
-- KPI KAM - visitas de campo, lectura de Favorita, rotacion y clientes nuevos.

begin;

set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtext('CIBUSPAN_ONE_KPI_KAM_CAMPO_V1'));

-- -----------------------------------------------------------------------------
-- 1. Rol de mercaderista y pantalla exclusiva de campo
-- -----------------------------------------------------------------------------

alter table public.app_profiles drop constraint if exists app_profiles_rol_check;
alter table public.app_profiles add constraint app_profiles_rol_check check (rol in (
  'ADMINISTRADOR', 'GERENTE', 'BODEGUERO', 'GERENTE_OPERACIONES',
  'JEFA_FACTURACION', 'KAM', 'MERCADERISTA'
));

alter table public.app_role_permissions
  drop constraint if exists app_role_permissions_rol_check;
alter table public.app_role_permissions add constraint app_role_permissions_rol_check check (rol in (
  'ADMINISTRADOR', 'GERENTE', 'BODEGUERO', 'GERENTE_OPERACIONES',
  'JEFA_FACTURACION', 'KAM', 'MERCADERISTA'
));

insert into public.app_role_permissions (rol, pantalla, permitido)
values
  ('ADMINISTRADOR', 'Campo comercial', true),
  ('GERENTE', 'Campo comercial', true),
  ('KAM', 'Campo comercial', true),
  ('MERCADERISTA', 'Campo comercial', true)
on conflict (rol, pantalla) do update set permitido = excluded.permitido;

create or replace function public.app_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rol_inicial text;
begin
  rol_inicial := case
    when new.raw_user_meta_data ->> 'rol' in (
      'ADMINISTRADOR', 'GERENTE', 'BODEGUERO', 'GERENTE_OPERACIONES',
      'JEFA_FACTURACION', 'KAM', 'MERCADERISTA'
    ) then new.raw_user_meta_data ->> 'rol'
    else 'BODEGUERO'
  end;

  insert into public.app_profiles (user_id, email, nombre, rol)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'nombre', ''),
    rol_inicial
  )
  on conflict (user_id) do update set
    email = excluded.email,
    nombre = coalesce(excluded.nombre, public.app_profiles.nombre),
    actualizado_en = now();
  return new;
end;
$$;

create table if not exists public.com_mercaderista_clientes (
  id uuid primary key default gen_random_uuid(),
  mercaderista_user_id uuid not null references public.app_profiles(user_id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  activo boolean not null default true,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint com_mercaderista_clientes_fechas_check check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  ),
  constraint com_mercaderista_clientes_inicio_key unique (
    mercaderista_user_id, cliente_id, vigente_desde
  )
);

create unique index if not exists com_mercaderista_cliente_actual_uidx
  on public.com_mercaderista_clientes (mercaderista_user_id, cliente_id)
  where activo and vigente_hasta is null;

-- Una mercaderista nueva queda habilitada para los clientes activos. La gerencia
-- puede restringir posteriormente las asignaciones desde esta tabla.
insert into public.com_mercaderista_clientes (
  mercaderista_user_id, cliente_id, vigente_desde, creado_por
)
select perfil.user_id, cliente.id, current_date, auth.uid()
from public.app_profiles perfil
cross join public.clientes cliente
where perfil.rol = 'MERCADERISTA'
  and perfil.activo
  and cliente.activo
on conflict do nothing;

create or replace function public.com_puede_ver_cliente_campo(
  p_cliente_id uuid,
  p_user_id uuid default auth.uid(),
  p_fecha date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_profiles perfil
    where perfil.user_id = p_user_id
      and perfil.activo
      and (
        perfil.rol in ('ADMINISTRADOR', 'GERENTE')
        or (
          perfil.rol = 'KAM'
          and exists (
            select 1 from public.com_kam_clientes asignacion
            where asignacion.kam_user_id = p_user_id
              and asignacion.cliente_id = p_cliente_id
              and asignacion.activo
              and asignacion.vigente_desde <= p_fecha
              and (asignacion.vigente_hasta is null or asignacion.vigente_hasta >= p_fecha)
          )
        )
        or (
          perfil.rol = 'MERCADERISTA'
          and exists (
            select 1 from public.com_mercaderista_clientes asignacion
            where asignacion.mercaderista_user_id = p_user_id
              and asignacion.cliente_id = p_cliente_id
              and asignacion.activo
              and asignacion.vigente_desde <= p_fecha
              and (asignacion.vigente_hasta is null or asignacion.vigente_hasta >= p_fecha)
          )
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. Visitas móviles y detalle SKU
-- -----------------------------------------------------------------------------

create table if not exists public.com_visitas_campo (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  local_monitoreado_id uuid not null references public.com_locales_monitoreados(id) on delete restrict,
  fecha_visita date not null default current_date,
  visitado_en timestamptz not null default now(),
  latitud numeric(10,7),
  longitud numeric(10,7),
  precision_metros numeric(10,2),
  observaciones text,
  estado text not null default 'CONFIRMADA' check (estado in ('BORRADOR', 'CONFIRMADA', 'ANULADA')),
  registrado_por uuid not null references public.app_profiles(user_id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_visitas_campo_ubicacion_check check (
    (latitud is null and longitud is null)
    or (latitud between -90 and 90 and longitud between -180 and 180)
  )
);

create index if not exists com_visitas_campo_cliente_fecha_idx
  on public.com_visitas_campo (cliente_id, fecha_visita desc);
create index if not exists com_visitas_campo_local_fecha_idx
  on public.com_visitas_campo (local_monitoreado_id, fecha_visita desc);

create table if not exists public.com_visitas_campo_sku (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.com_visitas_campo(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete restrict,
  codigo_barras text,
  nombre_reportado text,
  fecha_fuente timestamptz,
  codificado_app boolean,
  presencia_percha text not null default 'NO_REVISADO'
    check (presencia_percha in ('PRESENTE', 'AUSENTE', 'NO_REVISADO')),
  precio_comercio numeric(18,6),
  precio_afiliado numeric(18,6),
  rotacion_diaria_unidades numeric(18,6),
  venta_diaria_valor numeric(18,6),
  prediccion_venta_unidades numeric(18,6),
  participacion_clase numeric(18,6),
  participacion_subclase numeric(18,6),
  stock_local_unidades numeric(18,6),
  dias_inventario_local numeric(18,6),
  stock_cd_cajas numeric(18,6),
  unidades_por_caja numeric(18,6),
  dias_inventario_cd numeric(18,6),
  fecha_ultimo_pedido date,
  cantidad_ultimo_pedido numeric(18,6),
  fecha_ultimo_despacho date,
  cantidad_ultimo_despacho numeric(18,6),
  capturas_app text[] not null default '{}'::text[],
  fotos_percha text[] not null default '{}'::text[],
  confianza_ia numeric(7,4) check (confianza_ia is null or confianza_ia between 0 and 1),
  datos_ia jsonb not null default '{}'::jsonb,
  confirmado_por uuid references auth.users(id) on delete set null,
  confirmado_en timestamptz,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_visitas_campo_sku_visita_producto_key unique (visita_id, producto_id),
  constraint com_visitas_campo_sku_datos_ia_check check (jsonb_typeof(datos_ia) = 'object')
);

create index if not exists com_visitas_campo_sku_producto_idx
  on public.com_visitas_campo_sku (producto_id, creado_en desc);

alter table public.com_mercaderista_clientes enable row level security;
alter table public.com_visitas_campo enable row level security;
alter table public.com_visitas_campo_sku enable row level security;

drop policy if exists com_mercaderista_clientes_lectura on public.com_mercaderista_clientes;
create policy com_mercaderista_clientes_lectura on public.com_mercaderista_clientes
  for select to authenticated
  using (mercaderista_user_id = auth.uid() or public.app_es_admin());

drop policy if exists com_visitas_campo_lectura on public.com_visitas_campo;
create policy com_visitas_campo_lectura on public.com_visitas_campo
  for select to authenticated
  using (public.com_puede_ver_cliente_campo(cliente_id));

drop policy if exists com_visitas_campo_sku_lectura on public.com_visitas_campo_sku;
create policy com_visitas_campo_sku_lectura on public.com_visitas_campo_sku
  for select to authenticated
  using (exists (
    select 1 from public.com_visitas_campo visita
    where visita.id = visita_id
      and public.com_puede_ver_cliente_campo(visita.cliente_id)
  ));

-- -----------------------------------------------------------------------------
-- 3. Almacenamiento privado para capturas y fotografías
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visitas-campo', 'visitas-campo', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists visitas_campo_subir_propias on storage.objects;
create policy visitas_campo_subir_propias on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'visitas-campo'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.app_puede('Campo comercial', auth.uid())
  );

drop policy if exists visitas_campo_ver_propias on storage.objects;
create policy visitas_campo_ver_propias on storage.objects
  for select to authenticated
  using (
    bucket_id = 'visitas-campo'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.app_es_admin()
    )
  );

drop policy if exists visitas_campo_eliminar_propias on storage.objects;
create policy visitas_campo_eliminar_propias on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'visitas-campo'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- 4. Catálogo móvil, dashboard semanal y guardado transaccional
-- -----------------------------------------------------------------------------

create or replace function public.com_kpi_campo_catalogo(
  p_cliente_id uuid default null,
  p_desde date default (current_date - 6),
  p_hasta date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango semanal no es válido.' using errcode = '22023';
  end if;

  select perfil.rol into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid() and perfil.activo;

  if v_rol not in ('ADMINISTRADOR', 'GERENTE', 'KAM', 'MERCADERISTA')
    or not public.app_puede('Campo comercial', auth.uid()) then
    raise exception 'No tienes permiso para consultar el trabajo de campo.' using errcode = '42501';
  end if;
  if p_cliente_id is not null and not public.com_puede_ver_cliente_campo(p_cliente_id) then
    raise exception 'No tienes permiso para consultar este cliente.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'rol', v_rol,
    'puede_administrar', v_rol in ('ADMINISTRADOR', 'GERENTE'),
    'clientes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) order by c.nombre)
      from public.clientes c
      where c.activo and public.com_puede_ver_cliente_campo(c.id)
    ), '[]'::jsonb),
    'locales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'codigo', l.codigo_externo, 'nombre', l.nombre
      ) order by l.nombre)
      from public.com_locales_monitoreados l
      where l.activo and (p_cliente_id is null or l.cliente_id = p_cliente_id)
        and public.com_puede_ver_cliente_campo(l.cliente_id)
    ), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'codigo', p.codigo, 'nombre', p.nombre,
        'autorizado', exists (
          select 1 from public.cliente_productos cp
          where cp.cliente_id = p_cliente_id and cp.producto_id = p.id and cp.activo
        )
      ) order by
        case when exists (
          select 1 from public.cliente_productos cp
          where cp.cliente_id = p_cliente_id and cp.producto_id = p.id and cp.activo
        ) then 0 else 1 end,
        p.nombre)
      from public.productos p
      where p.activo
    ), '[]'::jsonb),
    'resumen', jsonb_build_object(
      'locales_visitados', coalesce((
        select count(distinct v.local_monitoreado_id)
        from public.com_visitas_campo v
        where v.estado = 'CONFIRMADA'
          and v.fecha_visita between p_desde and p_hasta
          and (p_cliente_id is null or v.cliente_id = p_cliente_id)
          and public.com_puede_ver_cliente_campo(v.cliente_id)
      ), 0),
      'posiciones_revisadas', coalesce((
        select count(*) from public.com_visitas_campo_sku d
        join public.com_visitas_campo v on v.id = d.visita_id
        where v.estado = 'CONFIRMADA' and v.fecha_visita between p_desde and p_hasta
          and (p_cliente_id is null or v.cliente_id = p_cliente_id)
          and public.com_puede_ver_cliente_campo(v.cliente_id)
      ), 0),
      'codificadas', coalesce((
        select count(*) from public.com_visitas_campo_sku d
        join public.com_visitas_campo v on v.id = d.visita_id
        where v.estado = 'CONFIRMADA' and v.fecha_visita between p_desde and p_hasta
          and d.codificado_app is true
          and (p_cliente_id is null or v.cliente_id = p_cliente_id)
          and public.com_puede_ver_cliente_campo(v.cliente_id)
      ), 0),
      'presentes_percha', coalesce((
        select count(*) from public.com_visitas_campo_sku d
        join public.com_visitas_campo v on v.id = d.visita_id
        where v.estado = 'CONFIRMADA' and v.fecha_visita between p_desde and p_hasta
          and d.presencia_percha = 'PRESENTE'
          and (p_cliente_id is null or v.cliente_id = p_cliente_id)
          and public.com_puede_ver_cliente_campo(v.cliente_id)
      ), 0),
      'quiebres_stock', coalesce((
        select count(*) from public.com_visitas_campo_sku d
        join public.com_visitas_campo v on v.id = d.visita_id
        where v.estado = 'CONFIRMADA' and v.fecha_visita between p_desde and p_hasta
          and d.stock_local_unidades is not null
          and d.stock_local_unidades <= 0
          and (p_cliente_id is null or v.cliente_id = p_cliente_id)
          and public.com_puede_ver_cliente_campo(v.cliente_id)
      ), 0),
      'rotacion_diaria_promedio', (
        select avg(d.rotacion_diaria_unidades)::numeric
        from public.com_visitas_campo_sku d
        join public.com_visitas_campo v on v.id = d.visita_id
        where v.estado = 'CONFIRMADA' and v.fecha_visita between p_desde and p_hasta
          and d.rotacion_diaria_unidades is not null
          and (p_cliente_id is null or v.cliente_id = p_cliente_id)
          and public.com_puede_ver_cliente_campo(v.cliente_id)
      ),
      'dias_inventario_promedio', (
        select avg(d.dias_inventario_local)::numeric
        from public.com_visitas_campo_sku d
        join public.com_visitas_campo v on v.id = d.visita_id
        where v.estado = 'CONFIRMADA' and v.fecha_visita between p_desde and p_hasta
          and d.dias_inventario_local is not null
          and (p_cliente_id is null or v.cliente_id = p_cliente_id)
          and public.com_puede_ver_cliente_campo(v.cliente_id)
      )
    ),
    'registros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fila.id, 'fecha', fila.fecha_visita, 'cliente_id', fila.cliente_id,
        'local_id', fila.local_monitoreado_id, 'local_nombre', fila.local_nombre,
        'producto_id', fila.producto_id, 'producto_nombre', fila.producto_nombre,
        'producto_codigo', fila.producto_codigo, 'codificado_app', fila.codificado_app,
        'presencia_percha', fila.presencia_percha,
        'rotacion_diaria_unidades', fila.rotacion_diaria_unidades,
        'stock_local_unidades', fila.stock_local_unidades,
        'dias_inventario_local', fila.dias_inventario_local,
        'observaciones', fila.observaciones
      ) order by fila.visitado_en desc)
      from (
        select d.id, v.fecha_visita, v.visitado_en, v.cliente_id,
          v.local_monitoreado_id, l.nombre as local_nombre,
          d.producto_id, p.nombre as producto_nombre, p.codigo as producto_codigo,
          d.codificado_app, d.presencia_percha, d.rotacion_diaria_unidades,
          d.stock_local_unidades, d.dias_inventario_local,
          coalesce(d.observaciones, v.observaciones) as observaciones
        from public.com_visitas_campo_sku d
        join public.com_visitas_campo v on v.id = d.visita_id
        join public.com_locales_monitoreados l on l.id = v.local_monitoreado_id
        join public.productos p on p.id = d.producto_id
        where v.estado = 'CONFIRMADA' and v.fecha_visita between p_desde and p_hasta
          and (p_cliente_id is null or v.cliente_id = p_cliente_id)
          and public.com_puede_ver_cliente_campo(v.cliente_id)
        order by v.visitado_en desc
        limit 200
      ) fila
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.com_kpi_campo_guardar_visita(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := (p_datos->>'cliente_id')::uuid;
  v_local uuid := (p_datos->>'local_id')::uuid;
  v_producto uuid := (p_datos->>'producto_id')::uuid;
  v_fecha date := coalesce(nullif(p_datos->>'fecha_visita', '')::date, current_date);
  v_visita uuid;
  v_cobertura uuid;
  v_desde date;
  v_estado text;
  v_codificado boolean := nullif(p_datos->>'codificado_app', '')::boolean;
begin
  if auth.uid() is null or not public.app_puede('Campo comercial', auth.uid()) then
    raise exception 'No tienes permiso para registrar trabajo de campo.' using errcode = '42501';
  end if;
  if not public.com_puede_ver_cliente_campo(v_cliente, auth.uid(), v_fecha) then
    raise exception 'No tienes permiso para registrar este cliente.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.com_locales_monitoreados l
    where l.id = v_local and l.cliente_id = v_cliente and l.activo
  ) then
    raise exception 'El local no pertenece al cliente seleccionado.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.productos p where p.id = v_producto and p.activo) then
    raise exception 'El SKU seleccionado no está activo.' using errcode = '22023';
  end if;

  insert into public.com_visitas_campo (
    cliente_id, local_monitoreado_id, fecha_visita, visitado_en,
    latitud, longitud, precision_metros, observaciones, estado, registrado_por
  ) values (
    v_cliente, v_local, v_fecha,
    coalesce(nullif(p_datos->>'visitado_en', '')::timestamptz, now()),
    nullif(p_datos->>'latitud', '')::numeric,
    nullif(p_datos->>'longitud', '')::numeric,
    nullif(p_datos->>'precision_metros', '')::numeric,
    nullif(trim(p_datos->>'observaciones'), ''), 'CONFIRMADA', auth.uid()
  ) returning id into v_visita;

  insert into public.com_visitas_campo_sku (
    visita_id, producto_id, codigo_barras, nombre_reportado, fecha_fuente,
    codificado_app, presencia_percha, precio_comercio, precio_afiliado,
    rotacion_diaria_unidades, venta_diaria_valor, prediccion_venta_unidades,
    participacion_clase, participacion_subclase, stock_local_unidades,
    dias_inventario_local, stock_cd_cajas, unidades_por_caja, dias_inventario_cd,
    fecha_ultimo_pedido, cantidad_ultimo_pedido, fecha_ultimo_despacho,
    cantidad_ultimo_despacho, capturas_app, fotos_percha, confianza_ia,
    datos_ia, confirmado_por, confirmado_en, observaciones
  ) values (
    v_visita, v_producto, nullif(trim(p_datos->>'codigo_barras'), ''),
    nullif(trim(p_datos->>'nombre_reportado'), ''),
    nullif(p_datos->>'fecha_fuente', '')::timestamptz,
    v_codificado,
    coalesce(nullif(p_datos->>'presencia_percha', ''), 'NO_REVISADO'),
    nullif(p_datos->>'precio_comercio', '')::numeric,
    nullif(p_datos->>'precio_afiliado', '')::numeric,
    nullif(p_datos->>'rotacion_diaria_unidades', '')::numeric,
    nullif(p_datos->>'venta_diaria_valor', '')::numeric,
    nullif(p_datos->>'prediccion_venta_unidades', '')::numeric,
    nullif(p_datos->>'participacion_clase', '')::numeric,
    nullif(p_datos->>'participacion_subclase', '')::numeric,
    nullif(p_datos->>'stock_local_unidades', '')::numeric,
    nullif(p_datos->>'dias_inventario_local', '')::numeric,
    nullif(p_datos->>'stock_cd_cajas', '')::numeric,
    nullif(p_datos->>'unidades_por_caja', '')::numeric,
    nullif(p_datos->>'dias_inventario_cd', '')::numeric,
    nullif(p_datos->>'fecha_ultimo_pedido', '')::date,
    nullif(p_datos->>'cantidad_ultimo_pedido', '')::numeric,
    nullif(p_datos->>'fecha_ultimo_despacho', '')::date,
    nullif(p_datos->>'cantidad_ultimo_despacho', '')::numeric,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_datos->'capturas_app', '[]'::jsonb))), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_datos->'fotos_percha', '[]'::jsonb))), '{}'::text[]),
    nullif(p_datos->>'confianza_ia', '')::numeric,
    coalesce(p_datos->'datos_ia', '{}'::jsonb), auth.uid(), now(),
    nullif(trim(p_datos->>'observaciones_sku'), '')
  );

  -- La captura de la aplicación acredita codificación, pero nunca presencia
  -- física en percha. Por eso ambos datos se guardan de forma independiente.
  if v_codificado is not null then
    select c.id, c.vigente_desde, c.estado
      into v_cobertura, v_desde, v_estado
    from public.com_cobertura_sku_local c
    where c.cliente_id = v_cliente
      and c.local_monitoreado_id = v_local
      and c.producto_id = v_producto
      and c.vigente_hasta is null
    order by c.vigente_desde desc limit 1 for update;

    if v_cobertura is not null and v_desde > v_fecha then
      raise exception 'Ya existe una revisión de cobertura posterior a la visita.' using errcode = '22023';
    end if;

    if v_cobertura is not null and v_desde = v_fecha then
      update public.com_cobertura_sku_local
      set estado = case when v_codificado then 'ACTIVO' else 'DESCODIFICADO' end,
          reportado_ultimo = v_codificado,
          ultima_fecha_reporte = v_fecha,
          confirmado_por = auth.uid(), confirmado_en = now(),
          motivo = 'Confirmado desde visita de campo',
          actualizado_por = auth.uid(), actualizado_en = now()
      where id = v_cobertura;
    elsif v_cobertura is null or v_estado <> case when v_codificado then 'ACTIVO' else 'DESCODIFICADO' end then
      if v_cobertura is not null then
        update public.com_cobertura_sku_local
        set vigente_hasta = v_fecha - 1, actualizado_por = auth.uid(), actualizado_en = now()
        where id = v_cobertura;
      end if;
      insert into public.com_cobertura_sku_local (
        cliente_id, local_monitoreado_id, producto_id, es_objetivo, estado,
        vigente_desde, motivo, origen, reportado_ultimo, ultima_fecha_reporte,
        confirmado_por, confirmado_en, creado_por, actualizado_por
      ) values (
        v_cliente, v_local, v_producto, true,
        case when v_codificado then 'ACTIVO' else 'DESCODIFICADO' end,
        v_fecha, 'Confirmado desde visita de campo', 'FAVORITA_REPORTE',
        v_codificado, v_fecha, auth.uid(), now(), auth.uid(), auth.uid()
      );
    else
      update public.com_cobertura_sku_local
      set reportado_ultimo = v_codificado, ultima_fecha_reporte = v_fecha,
          confirmado_por = auth.uid(), confirmado_en = now(),
          actualizado_por = auth.uid(), actualizado_en = now()
      where id = v_cobertura;
    end if;
  end if;

  return v_visita;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. KPI de rotación y KPI trimestral independiente de clientes nuevos
-- -----------------------------------------------------------------------------

insert into public.com_kpi_definiciones (
  codigo, nombre, descripcion, unidad, sentido, orden
)
values (
  'ROTACION_DIARIA', 'Rotación diaria',
  'Promedio diario de unidades vendidas reportado en las visitas de campo.',
  'CANTIDAD', 'MAYOR_ES_MEJOR', 65
)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  unidad = excluded.unidad,
  sentido = excluded.sentido,
  orden = excluded.orden,
  activo = true,
  actualizado_en = now();

-- Cierra la regla general anterior y crea la distribución acordada desde septiembre.
update public.com_kpi_configuraciones
set vigente_hasta = date '2026-08-31', actualizado_en = now()
where alcance = 'GENERAL' and activo
  and vigente_desde < date '2026-09-01'
  and (vigente_hasta is null or vigente_hasta >= date '2026-09-01');

insert into public.com_kpi_configuraciones (
  kpi_id, alcance, cliente_id, vigente_desde, peso, meta,
  rangos_puntuacion, reglas_criticas, observaciones
)
select d.id, 'GENERAL', null, date '2026-09-01', v.peso, v.meta,
  v.rangos, v.criticas, 'Distribución KPI KAM con rotación diaria.'
from public.com_kpi_definiciones d
join (values
  ('VENTAS_PRESUPUESTO', 20::numeric, 100::numeric,
    '[{"desde":100,"puntos":100},{"desde":95,"puntos":80},{"desde":90,"puntos":60},{"desde":80,"puntos":30},{"desde":0,"puntos":0}]'::jsonb, '[]'::jsonb),
  ('MARGEN_CONTRIBUCION', 20::numeric, null::numeric,
    '[{"brecha_pp_hasta":0,"puntos":100},{"brecha_pp_hasta":1,"puntos":80},{"brecha_pp_hasta":2,"puntos":60},{"brecha_pp_hasta":4,"puntos":30},{"brecha_pp_mayor":4,"puntos":0}]'::jsonb,
    '[{"codigo":"MARGEN_NEGATIVO","operador":"MENOR_QUE","umbral":0,"bloquea_verde":true}]'::jsonb),
  ('DEVOLUCIONES', 15::numeric, 8::numeric,
    '[{"hasta":8,"puntos":100},{"hasta":10,"puntos":80},{"hasta":12,"puntos":60},{"hasta":15,"puntos":30},{"mayor_que":15,"puntos":0}]'::jsonb,
    '[{"codigo":"DEVOLUCIONES_ALTAS","operador":"MAYOR_QUE","umbral":12,"bloquea_verde":true}]'::jsonb),
  ('FUGAS_COMERCIALES', 10::numeric, 0.25::numeric,
    '[{"hasta":0.25,"puntos":100},{"hasta":0.50,"puntos":80},{"hasta":1,"puntos":60},{"hasta":2,"puntos":30},{"mayor_que":2,"puntos":0}]'::jsonb,
    '[{"codigo":"FUGA_SEVERA","operador":"MAYOR_QUE","umbral":2,"bloquea_verde":true}]'::jsonb),
  ('CRECIMIENTO_RENTABLE', 10::numeric, null::numeric,
    '[{"cumplimiento_meta_desde":100,"puntos":100},{"cumplimiento_meta_desde":75,"puntos":80},{"cumplimiento_meta_desde":50,"puntos":60},{"cumplimiento_meta_desde":0,"puntos":30},{"crecimiento_negativo":true,"puntos":0}]'::jsonb, '[]'::jsonb),
  ('COBERTURA_SKU', 10::numeric, 95::numeric,
    '[{"desde":95,"puntos":100},{"desde":90,"puntos":80},{"desde":85,"puntos":60},{"desde":75,"puntos":30},{"desde":0,"puntos":0}]'::jsonb, '[]'::jsonb),
  ('ROTACION_DIARIA', 10::numeric, 1::numeric,
    '[{"cumplimiento_meta_desde":100,"puntos":100},{"cumplimiento_meta_desde":80,"puntos":80},{"cumplimiento_meta_desde":60,"puntos":60},{"cumplimiento_meta_desde":30,"puntos":30},{"desde":0,"puntos":0}]'::jsonb, '[]'::jsonb),
  ('COMPROMISOS', 5::numeric, 95::numeric,
    '[{"desde":95,"puntos":100},{"desde":90,"puntos":80},{"desde":80,"puntos":60},{"desde":70,"puntos":30},{"desde":0,"puntos":0}]'::jsonb, '[]'::jsonb)
) as v(codigo, peso, meta, rangos, criticas) on v.codigo = d.codigo
on conflict (
  kpi_id, alcance,
  coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
  vigente_desde
) do update set
  peso = excluded.peso,
  meta = coalesce(com_kpi_configuraciones.meta, excluded.meta),
  rangos_puntuacion = excluded.rangos_puntuacion,
  reglas_criticas = excluded.reglas_criticas,
  actualizado_en = now();

-- Si ya existían excepciones por cliente, genera una versión completa de ocho
-- indicadores para evitar sumar la nueva rotación sobre una configuración de 100%.
with clientes_override as (
  select distinct c.cliente_id
  from public.com_kpi_configuraciones c
  where c.alcance = 'CLIENTE' and c.activo
), pesos(codigo, peso) as (values
  ('VENTAS_PRESUPUESTO', 20::numeric),
  ('MARGEN_CONTRIBUCION', 20::numeric),
  ('DEVOLUCIONES', 15::numeric),
  ('FUGAS_COMERCIALES', 10::numeric),
  ('CRECIMIENTO_RENTABLE', 10::numeric),
  ('COBERTURA_SKU', 10::numeric),
  ('ROTACION_DIARIA', 10::numeric),
  ('COMPROMISOS', 5::numeric)
)
insert into public.com_kpi_configuraciones (
  kpi_id, alcance, cliente_id, vigente_desde, peso, meta,
  rangos_puntuacion, reglas_criticas, observaciones
)
select d.id, 'CLIENTE', cliente.cliente_id, date '2026-09-01', pesos.peso,
  base.meta, base.rangos_puntuacion, base.reglas_criticas,
  'Excepción migrada a ocho KPI con rotación diaria.'
from clientes_override cliente
join public.com_kpi_definiciones d on d.activo
join pesos on pesos.codigo = d.codigo
join lateral (
  select cfg.meta, cfg.rangos_puntuacion, cfg.reglas_criticas
  from public.com_kpi_configuraciones cfg
  where cfg.kpi_id = d.id and cfg.activo
    and cfg.vigente_desde <= date '2026-09-30'
    and (cfg.vigente_hasta is null or cfg.vigente_hasta >= date '2026-09-01')
    and (
      (cfg.alcance = 'CLIENTE' and cfg.cliente_id = cliente.cliente_id)
      or cfg.alcance = 'GENERAL'
    )
  order by case when cfg.alcance = 'CLIENTE' then 0 else 1 end,
    cfg.vigente_desde desc
  limit 1
) base on true
on conflict (
  kpi_id, alcance,
  coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
  vigente_desde
) do update set
  peso = excluded.peso,
  meta = coalesce(com_kpi_configuraciones.meta, excluded.meta),
  actualizado_en = now();

update public.com_kpi_configuraciones
set vigente_hasta = date '2026-08-31', actualizado_en = now()
where alcance = 'CLIENTE' and activo
  and vigente_desde < date '2026-09-01'
  and (vigente_hasta is null or vigente_hasta >= date '2026-09-01');

create table if not exists public.com_metas_clientes_nuevos (
  id uuid primary key default gen_random_uuid(),
  anio integer not null check (anio between 2020 and 2100),
  trimestre integer not null check (trimestre between 1 and 4),
  kam_user_id uuid references public.app_profiles(user_id) on delete cascade,
  meta_clientes integer not null default 1 check (meta_clientes > 0),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists com_metas_clientes_nuevos_unica_idx
  on public.com_metas_clientes_nuevos (
    anio, trimestre,
    coalesce(kam_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
alter table public.com_metas_clientes_nuevos enable row level security;
drop policy if exists com_metas_clientes_nuevos_lectura on public.com_metas_clientes_nuevos;
create policy com_metas_clientes_nuevos_lectura on public.com_metas_clientes_nuevos
  for select to authenticated using (public.app_puede('KPI KAM', auth.uid()));

create or replace function public.com_kpi_kam_rotacion(
  p_periodo date,
  p_kam_user_id uuid default null,
  p_cliente_id uuid default null
)
returns table (cliente_id uuid, rotacion_diaria_promedio numeric, observaciones integer)
language sql
stable
security definer
set search_path = public
as $$
  select v.cliente_id,
    avg(d.rotacion_diaria_unidades)::numeric,
    count(d.rotacion_diaria_unidades)::integer
  from public.com_visitas_campo v
  join public.com_visitas_campo_sku d on d.visita_id = v.id
  where v.estado = 'CONFIRMADA'
    and v.fecha_visita >= date_trunc('month', p_periodo)::date
    and v.fecha_visita < (date_trunc('month', p_periodo) + interval '1 month')::date
    and d.rotacion_diaria_unidades is not null
    and (p_cliente_id is null or v.cliente_id = p_cliente_id)
    and public.com_puede_ver_cliente_campo(v.cliente_id)
    and (
      p_kam_user_id is null or exists (
        select 1 from public.com_kam_clientes k
        where k.kam_user_id = p_kam_user_id and k.cliente_id = v.cliente_id
          and k.activo and k.vigente_desde <= v.fecha_visita
          and (k.vigente_hasta is null or k.vigente_hasta >= v.fecha_visita)
      )
    )
  group by v.cliente_id;
$$;

create or replace function public.com_kpi_kam_clientes_nuevos(
  p_periodo date,
  p_kam_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde date := date_trunc('quarter', p_periodo)::date;
  v_hasta date := (date_trunc('quarter', p_periodo) + interval '3 months - 1 day')::date;
  v_trimestre integer := extract(quarter from p_periodo)::integer;
  v_anio integer := extract(year from p_periodo)::integer;
  v_meta integer;
  v_actual integer;
begin
  if auth.uid() is null or not public.app_puede('KPI KAM', auth.uid()) then
    raise exception 'No tienes permiso para consultar KPI KAM.' using errcode = '42501';
  end if;
  select m.meta_clientes into v_meta
  from public.com_metas_clientes_nuevos m
  where m.anio = v_anio and m.trimestre = v_trimestre
    and m.kam_user_id is not distinct from p_kam_user_id
  limit 1;
  v_meta := coalesce(v_meta, 1);

  select count(*)::integer into v_actual
  from (
    select venta.cliente_id, min(venta.fecha_emision)::date as primera_venta
    from public.com_ventas_detalle venta
    group by venta.cliente_id
  ) primeras
  where primeras.primera_venta between v_desde and v_hasta
    and (
      p_kam_user_id is null or exists (
        select 1 from public.com_kam_clientes k
        where k.kam_user_id = p_kam_user_id and k.cliente_id = primeras.cliente_id
          and k.activo and k.vigente_desde <= v_hasta
          and (k.vigente_hasta is null or k.vigente_hasta >= v_desde)
      )
    )
    and public.com_puede_ver_cliente_kpi(primeras.cliente_id, auth.uid());

  return jsonb_build_object(
    'desde', v_desde, 'hasta', v_hasta, 'meta', v_meta, 'actual', v_actual,
    'porcentaje', least(100, round(v_actual::numeric / v_meta * 100, 2)),
    'puede_configurar', exists (
      select 1 from public.app_profiles p
      where p.user_id = auth.uid() and p.activo
        and p.rol in ('ADMINISTRADOR', 'GERENTE')
    )
  );
end;
$$;

create or replace function public.com_kpi_kam_guardar_meta_clientes_nuevos(
  p_periodo date,
  p_kam_user_id uuid default null,
  p_meta integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  select p.rol into v_rol from public.app_profiles p
  where p.user_id = auth.uid() and p.activo;
  if v_rol not in ('ADMINISTRADOR', 'GERENTE') then
    raise exception 'Solo Administrador o Gerente puede cambiar esta meta.' using errcode = '42501';
  end if;
  if p_meta is null or p_meta <= 0 then
    raise exception 'La meta trimestral debe ser mayor que cero.' using errcode = '22023';
  end if;
  insert into public.com_metas_clientes_nuevos (
    anio, trimestre, kam_user_id, meta_clientes, creado_por, actualizado_por
  ) values (
    extract(year from p_periodo)::integer,
    extract(quarter from p_periodo)::integer,
    p_kam_user_id, p_meta, auth.uid(), auth.uid()
  )
  on conflict (
    anio, trimestre,
    coalesce(kam_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) do update set
    meta_clientes = excluded.meta_clientes,
    actualizado_por = auth.uid(), actualizado_en = now();
end;
$$;

-- La pantalla de parámetros ahora recibe ocho KPI. Se conserva la misma lógica
-- temporal y de excepciones por cliente de la función anterior.
create or replace function public.com_kpi_kam_guardar_parametros(
  p_periodo date,
  p_cliente_id uuid default null,
  p_configuraciones jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_rol text;
  v_alcance text := case when p_cliente_id is null then 'GENERAL' else 'CLIENTE' end;
  v_total numeric;
  v_fila record;
  v_kpi_id uuid;
  v_vigente_hasta date;
begin
  select perfil.rol into v_rol
  from public.app_profiles perfil
  where perfil.user_id = auth.uid() and perfil.activo;

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'GERENTE') then
    raise exception 'Solo Administrador o Gerente puede cambiar metas y pesos.';
  end if;
  if p_periodo <> v_periodo then
    raise exception 'El periodo debe corresponder al primer dia del mes.';
  end if;
  if p_cliente_id is not null and not exists (
    select 1 from public.clientes c where c.id = p_cliente_id and c.activo
  ) then
    raise exception 'El cliente seleccionado no existe o esta inactivo.';
  end if;
  if jsonb_typeof(p_configuraciones) <> 'array'
    or jsonb_array_length(p_configuraciones) <> 8 then
    raise exception 'Deben enviarse exactamente los ocho KPI.';
  end if;
  if (
    select count(distinct item->>'codigo')
    from jsonb_array_elements(p_configuraciones) item
  ) <> 8 then
    raise exception 'Los ocho KPI deben ser unicos.';
  end if;

  select sum((item->>'peso')::numeric) into v_total
  from jsonb_array_elements(p_configuraciones) item;
  if v_total is null or abs(v_total - 100) > 0.01 then
    raise exception 'La suma de los pesos configurados debe ser 100%%.';
  end if;

  for v_fila in
    select
      item->>'codigo' as codigo,
      coalesce((item->>'aplica')::boolean, true) as aplica,
      (item->>'peso')::numeric as peso,
      nullif(item->>'meta', '')::numeric as meta,
      item->'rangos_puntuacion' as rangos_puntuacion,
      coalesce(item->'reglas_criticas', '[]'::jsonb) as reglas_criticas
    from jsonb_array_elements(p_configuraciones) item
  loop
    select d.id into v_kpi_id
    from public.com_kpi_definiciones d
    where d.codigo = v_fila.codigo and d.activo;
    if v_kpi_id is null then
      raise exception 'KPI desconocido: %.', v_fila.codigo;
    end if;
    if v_fila.peso < 0 or v_fila.peso > 100 then
      raise exception 'El peso de % debe estar entre 0 y 100.', v_fila.codigo;
    end if;
    if v_fila.aplica and v_fila.meta is null then
      raise exception 'La meta de % es obligatoria mientras el KPI aplique.', v_fila.codigo;
    end if;
    if v_fila.aplica and v_fila.codigo in ('CRECIMIENTO_RENTABLE', 'ROTACION_DIARIA')
      and v_fila.meta <= 0 then
      raise exception 'La meta de % debe ser mayor que cero.', v_fila.codigo;
    end if;
    if jsonb_typeof(v_fila.rangos_puntuacion) <> 'array'
      or jsonb_array_length(v_fila.rangos_puntuacion) = 0 then
      raise exception 'Los rangos de % no son validos.', v_fila.codigo;
    end if;

    select min(s.vigente_desde) - 1 into v_vigente_hasta
    from public.com_kpi_configuraciones s
    where s.kpi_id = v_kpi_id and s.alcance = v_alcance
      and s.cliente_id is not distinct from p_cliente_id and s.activo
      and s.vigente_desde > v_periodo;

    update public.com_kpi_configuraciones a
    set vigente_hasta = v_periodo - 1,
        actualizado_por = auth.uid(), actualizado_en = now()
    where a.kpi_id = v_kpi_id and a.alcance = v_alcance
      and a.cliente_id is not distinct from p_cliente_id and a.activo
      and a.vigente_desde < v_periodo
      and (a.vigente_hasta is null or a.vigente_hasta >= v_periodo);

    insert into public.com_kpi_configuraciones (
      kpi_id, alcance, cliente_id, vigente_desde, vigente_hasta, activo,
      aplica, peso, meta, rangos_puntuacion, reglas_criticas, observaciones,
      creado_por, actualizado_por
    ) values (
      v_kpi_id, v_alcance, p_cliente_id, v_periodo, v_vigente_hasta, true,
      v_fila.aplica, v_fila.peso, v_fila.meta, v_fila.rangos_puntuacion,
      v_fila.reglas_criticas,
      case when p_cliente_id is null
        then 'Configuracion general desde la aplicacion.'
        else 'Excepcion por cliente desde la aplicacion.' end,
      auth.uid(), auth.uid()
    )
    on conflict (
      kpi_id, alcance,
      coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
      vigente_desde
    ) do update set
      activo = true, aplica = excluded.aplica, peso = excluded.peso,
      meta = excluded.meta, vigente_hasta = excluded.vigente_hasta,
      rangos_puntuacion = excluded.rangos_puntuacion,
      reglas_criticas = excluded.reglas_criticas,
      observaciones = excluded.observaciones,
      actualizado_por = auth.uid(), actualizado_en = now();
  end loop;
end;
$$;

revoke all on function public.com_puede_ver_cliente_campo(uuid, uuid, date) from public, anon;
revoke all on function public.com_kpi_campo_catalogo(uuid, date, date) from public, anon;
revoke all on function public.com_kpi_campo_guardar_visita(jsonb) from public, anon;
revoke all on function public.com_kpi_kam_rotacion(date, uuid, uuid) from public, anon;
revoke all on function public.com_kpi_kam_clientes_nuevos(date, uuid) from public, anon;
revoke all on function public.com_kpi_kam_guardar_meta_clientes_nuevos(date, uuid, integer) from public, anon;
revoke all on function public.com_kpi_kam_guardar_parametros(date, uuid, jsonb) from public, anon;

grant select on public.com_mercaderista_clientes to authenticated;
grant select on public.com_visitas_campo to authenticated;
grant select on public.com_visitas_campo_sku to authenticated;
grant select on public.com_metas_clientes_nuevos to authenticated;
grant execute on function public.com_puede_ver_cliente_campo(uuid, uuid, date) to authenticated;
grant execute on function public.com_kpi_campo_catalogo(uuid, date, date) to authenticated;
grant execute on function public.com_kpi_campo_guardar_visita(jsonb) to authenticated;
grant execute on function public.com_kpi_kam_rotacion(date, uuid, uuid) to authenticated;
grant execute on function public.com_kpi_kam_clientes_nuevos(date, uuid) to authenticated;
grant execute on function public.com_kpi_kam_guardar_meta_clientes_nuevos(date, uuid, integer) to authenticated;
grant execute on function public.com_kpi_kam_guardar_parametros(date, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
