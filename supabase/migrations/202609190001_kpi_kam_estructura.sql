-- CIBUSPAN ONE
-- KPI KAM - estructura base, configuración, operación y cierres históricos.
--
-- Esta migración NO calcula todavía los KPI. Prepara las fuentes nuevas y los
-- snapshots necesarios para que la lógica de cálculo se implemente en una fase
-- posterior sin duplicar ventas, devoluciones, promociones ni costos existentes.

-- -----------------------------------------------------------------------------
-- 1. Rol y permiso de pantalla
-- -----------------------------------------------------------------------------

do $$
declare
  v_roles_no_reconocidos text;
begin
  select string_agg(distinct perfil.rol, ', ' order by perfil.rol)
  into v_roles_no_reconocidos
  from public.app_profiles perfil
  where perfil.rol not in (
    'ADMINISTRADOR', 'GERENTE', 'BODEGUERO',
    'GERENTE_OPERACIONES', 'JEFA_FACTURACION', 'KAM'
  );

  if v_roles_no_reconocidos is not null then
    raise exception
      'Existen roles no contemplados por la migración KPI KAM: %',
      v_roles_no_reconocidos;
  end if;
end;
$$;

alter table public.app_profiles
  drop constraint if exists app_profiles_rol_check;

alter table public.app_profiles
  add constraint app_profiles_rol_check check (rol in (
    'ADMINISTRADOR', 'GERENTE', 'BODEGUERO',
    'GERENTE_OPERACIONES', 'JEFA_FACTURACION', 'KAM'
  ));

alter table public.app_role_permissions
  drop constraint if exists app_role_permissions_rol_check;

alter table public.app_role_permissions
  add constraint app_role_permissions_rol_check check (rol in (
    'ADMINISTRADOR', 'GERENTE', 'BODEGUERO',
    'GERENTE_OPERACIONES', 'JEFA_FACTURACION', 'KAM'
  ));

insert into public.app_role_permissions (rol, pantalla, permitido)
values
  ('ADMINISTRADOR', 'KPI KAM', true),
  ('GERENTE', 'KPI KAM', true),
  ('KAM', 'KPI KAM', true)
on conflict (rol, pantalla) do update
set permitido = excluded.permitido;

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
      'ADMINISTRADOR', 'GERENTE', 'BODEGUERO',
      'GERENTE_OPERACIONES', 'JEFA_FACTURACION', 'KAM'
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

-- -----------------------------------------------------------------------------
-- 2. Asignación histórica de clientes a KAM
-- -----------------------------------------------------------------------------

create table if not exists public.com_kam_clientes (
  id uuid primary key default gen_random_uuid(),
  kam_user_id uuid not null
    references public.app_profiles(user_id) on delete restrict,
  cliente_id uuid not null
    references public.clientes(id) on delete restrict,
  vigente_desde date not null,
  vigente_hasta date,
  activo boolean not null default true,
  observaciones text,
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_kam_clientes_fechas_check check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  ),
  constraint com_kam_clientes_inicio_key unique (
    kam_user_id, cliente_id, vigente_desde
  )
);

create index if not exists com_kam_clientes_cliente_vigencia_idx
  on public.com_kam_clientes (cliente_id, vigente_desde, vigente_hasta);

create index if not exists com_kam_clientes_kam_vigencia_idx
  on public.com_kam_clientes (kam_user_id, vigente_desde, vigente_hasta);

create unique index if not exists com_kam_clientes_cliente_actual_uidx
  on public.com_kam_clientes (cliente_id)
  where activo and vigente_hasta is null;

-- -----------------------------------------------------------------------------
-- 3. Presupuesto mensual
-- -----------------------------------------------------------------------------

create table if not exists public.com_presupuestos_mensuales (
  id uuid primary key default gen_random_uuid(),
  periodo date not null,
  cliente_id uuid not null
    references public.clientes(id) on delete restrict,
  kam_user_id uuid not null
    references public.app_profiles(user_id) on delete restrict,
  presupuesto numeric(18,2) not null check (presupuesto >= 0),
  observaciones text,
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_presupuestos_periodo_mes_check check (
    extract(day from periodo) = 1
  ),
  constraint com_presupuestos_periodo_cliente_key unique (
    periodo, cliente_id
  )
);

create index if not exists com_presupuestos_kam_periodo_idx
  on public.com_presupuestos_mensuales (kam_user_id, periodo desc);

-- -----------------------------------------------------------------------------
-- 4. Clasificación y registro de ajustes comerciales
-- -----------------------------------------------------------------------------

create table if not exists public.com_ajuste_categorias (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  afecta_venta_neta boolean not null default true,
  afecta_devoluciones boolean not null default false,
  afecta_fugas boolean not null default false,
  afecta_rentabilidad boolean not null default true,
  requiere_revision boolean not null default false,
  activo boolean not null default true,
  orden integer not null default 100,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

insert into public.com_ajuste_categorias (
  codigo,
  nombre,
  descripcion,
  afecta_venta_neta,
  afecta_devoluciones,
  afecta_fugas,
  afecta_rentabilidad,
  requiere_revision,
  orden
)
values
  ('DEVOLUCION', 'Devolución',
    'Devolución de producto; se mide en su KPI propio y no como fuga.',
    true, true, false, true, false, 10),
  ('PROMOCION_ACORDADA', 'Promoción acordada',
    'Promoción aprobada previamente.',
    true, false, false, true, false, 20),
  ('DESCUENTO_COMERCIAL_ACORDADO', 'Descuento comercial acordado',
    'Descuento negociado y aprobado con el cliente.',
    true, false, false, true, false, 30),
  ('PENALIZACION', 'Penalización',
    'Penalización o cobro comercial no previsto.',
    true, false, true, true, false, 40),
  ('DIFERENCIA_COMERCIAL', 'Diferencia comercial',
    'Diferencia o deducción unilateral del cliente.',
    true, false, true, true, false, 50),
  ('NOTA_CREDITO_EXTRAORDINARIA', 'Nota de crédito extraordinaria',
    'Nota de crédito no originada en devolución ni promoción aprobada.',
    true, false, true, true, false, 60),
  ('OTRO', 'Otro',
    'Ajuste pendiente de revisión gerencial.',
    true, false, true, true, true, 70)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  afecta_venta_neta = excluded.afecta_venta_neta,
  afecta_devoluciones = excluded.afecta_devoluciones,
  afecta_fugas = excluded.afecta_fugas,
  afecta_rentabilidad = excluded.afecta_rentabilidad,
  requiere_revision = excluded.requiere_revision,
  orden = excluded.orden,
  activo = true,
  actualizado_en = now();

create table if not exists public.com_ajustes_comerciales (
  id uuid primary key default gen_random_uuid(),
  fecha_documento date not null,
  cliente_id uuid not null
    references public.clientes(id) on delete restrict,
  producto_id uuid references public.productos(id) on delete restrict,
  bodega_id uuid references public.bodegas(id) on delete restrict,
  categoria_id uuid not null
    references public.com_ajuste_categorias(id) on delete restrict,
  tipo text not null check (tipo in (
    'DESCUENTO', 'NOTA_CREDITO', 'DEDUCCION',
    'PENALIZACION', 'DIFERENCIA', 'OTRO'
  )),
  numero_documento text,
  valor numeric(18,6) not null check (valor > 0),
  descripcion text,
  fuente_tipo text,
  fuente_clave text,
  estado text not null default 'ACTIVO'
    check (estado in ('ACTIVO', 'ANULADO')),
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_ajustes_fuente_coherente_check check (
    (fuente_tipo is null and fuente_clave is null)
    or (fuente_tipo is not null and fuente_clave is not null)
  )
);

create unique index if not exists com_ajustes_fuente_uidx
  on public.com_ajustes_comerciales (fuente_tipo, fuente_clave)
  where fuente_tipo is not null and fuente_clave is not null;

create index if not exists com_ajustes_cliente_fecha_idx
  on public.com_ajustes_comerciales (cliente_id, fecha_documento desc)
  where estado = 'ACTIVO';

create table if not exists public.com_venta_descuento_clasificaciones (
  venta_detalle_id uuid primary key
    references public.com_ventas_detalle(id) on delete cascade,
  categoria_id uuid not null
    references public.com_ajuste_categorias(id) on delete restrict,
  observaciones text,
  clasificado_por uuid references auth.users(id) on delete set null,
  clasificado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. Cobertura comercial cliente + local + SKU
-- -----------------------------------------------------------------------------

create table if not exists public.com_cobertura_sku_local (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null
    references public.clientes(id) on delete restrict,
  bodega_id uuid not null
    references public.bodegas(id) on delete restrict,
  producto_id uuid not null
    references public.productos(id) on delete restrict,
  es_objetivo boolean not null default true,
  estado text not null check (estado in (
    'ACTIVO', 'DESCODIFICADO', 'SUSPENDIDO',
    'NO_AUTORIZADO', 'PENDIENTE', 'INACTIVO'
  )),
  vigente_desde date not null,
  vigente_hasta date,
  motivo text,
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_cobertura_fechas_check check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  ),
  constraint com_cobertura_inicio_key unique (
    cliente_id, bodega_id, producto_id, vigente_desde
  )
);

create index if not exists com_cobertura_cliente_vigencia_idx
  on public.com_cobertura_sku_local (
    cliente_id, vigente_desde, vigente_hasta, estado
  );

create unique index if not exists com_cobertura_posicion_actual_uidx
  on public.com_cobertura_sku_local (cliente_id, bodega_id, producto_id)
  where vigente_hasta is null;

-- -----------------------------------------------------------------------------
-- 6. Compromisos comerciales
-- -----------------------------------------------------------------------------

create table if not exists public.com_compromisos (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,
  cliente_id uuid not null
    references public.clientes(id) on delete restrict,
  kam_user_id uuid not null
    references public.app_profiles(user_id) on delete restrict,
  fecha_creacion date not null default current_date,
  fecha_limite date not null,
  estado text not null default 'PENDIENTE' check (estado in (
    'PENDIENTE', 'EN_GESTION', 'CUMPLIDO', 'VENCIDO', 'CANCELADO'
  )),
  prioridad text not null default 'MEDIA'
    check (prioridad in ('BAJA', 'MEDIA', 'ALTA')),
  fecha_cumplimiento date,
  observaciones text,
  motivo_cancelacion text,
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_compromisos_fechas_check check (
    fecha_limite >= fecha_creacion
  ),
  constraint com_compromisos_cumplimiento_check check (
    (estado = 'CUMPLIDO' and fecha_cumplimiento is not null)
    or (estado <> 'CUMPLIDO')
  ),
  constraint com_compromisos_cancelacion_check check (
    estado <> 'CANCELADO'
    or nullif(trim(coalesce(motivo_cancelacion, '')), '') is not null
  )
);

create index if not exists com_compromisos_kam_vencimiento_idx
  on public.com_compromisos (kam_user_id, fecha_limite, estado);

create index if not exists com_compromisos_cliente_vencimiento_idx
  on public.com_compromisos (cliente_id, fecha_limite, estado);

-- -----------------------------------------------------------------------------
-- 7. Definición y configuración efectiva de KPI
-- -----------------------------------------------------------------------------

create table if not exists public.com_kpi_definiciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text not null,
  unidad text not null check (unidad in (
    'PORCENTAJE', 'MONEDA', 'PUNTOS', 'CANTIDAD'
  )),
  sentido text not null check (sentido in (
    'MAYOR_ES_MEJOR', 'MENOR_ES_MEJOR'
  )),
  orden integer not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

insert into public.com_kpi_definiciones (
  codigo, nombre, descripcion, unidad, sentido, orden
)
values
  ('VENTAS_PRESUPUESTO', 'Ventas netas vs presupuesto',
    'Cumplimiento de la venta neta mensual frente al presupuesto.',
    'PORCENTAJE', 'MAYOR_ES_MEJOR', 10),
  ('MARGEN_CONTRIBUCION', 'Margen de contribución',
    'Contribución económica después de costos variables.',
    'PORCENTAJE', 'MAYOR_ES_MEJOR', 20),
  ('DEVOLUCIONES', 'Devoluciones',
    'Valor de devoluciones sobre venta bruta.',
    'PORCENTAJE', 'MENOR_ES_MEJOR', 30),
  ('FUGAS_COMERCIALES', 'Fugas comerciales',
    'Pérdidas comerciales no previstas sobre venta bruta.',
    'PORCENTAJE', 'MENOR_ES_MEJOR', 40),
  ('CRECIMIENTO_RENTABLE', 'Crecimiento rentable',
    'Crecimiento de la contribución frente al mismo periodo del año anterior.',
    'PORCENTAJE', 'MAYOR_ES_MEJOR', 50),
  ('COBERTURA_SKU', 'Cobertura / alcance SKU',
    'Posiciones cliente-local-SKU activas frente al objetivo.',
    'PORCENTAJE', 'MAYOR_ES_MEJOR', 60),
  ('COMPROMISOS', 'Cumplimiento de compromisos',
    'Compromisos cumplidos a tiempo frente a los vencidos en el periodo.',
    'PORCENTAJE', 'MAYOR_ES_MEJOR', 70)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  unidad = excluded.unidad,
  sentido = excluded.sentido,
  orden = excluded.orden,
  activo = true,
  actualizado_en = now();

create table if not exists public.com_kpi_configuraciones (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null
    references public.com_kpi_definiciones(id) on delete restrict,
  alcance text not null default 'GENERAL'
    check (alcance in ('GENERAL', 'CLIENTE')),
  cliente_id uuid references public.clientes(id) on delete restrict,
  vigente_desde date not null,
  vigente_hasta date,
  activo boolean not null default true,
  aplica boolean not null default true,
  peso numeric(7,4) not null check (peso >= 0 and peso <= 100),
  meta numeric(18,6),
  rangos_puntuacion jsonb not null,
  reglas_criticas jsonb not null default '[]'::jsonb,
  observaciones text,
  creado_por uuid references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint com_kpi_config_alcance_check check (
    (alcance = 'GENERAL' and cliente_id is null)
    or (alcance = 'CLIENTE' and cliente_id is not null)
  ),
  constraint com_kpi_config_fechas_check check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  ),
  constraint com_kpi_config_rangos_check check (
    jsonb_typeof(rangos_puntuacion) = 'array'
  ),
  constraint com_kpi_config_criticas_check check (
    jsonb_typeof(reglas_criticas) = 'array'
  )
);

create unique index if not exists com_kpi_config_inicio_uidx
  on public.com_kpi_configuraciones (
    kpi_id,
    alcance,
    coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
    vigente_desde
  );

create index if not exists com_kpi_config_vigencia_idx
  on public.com_kpi_configuraciones (
    alcance, cliente_id, vigente_desde, vigente_hasta
  )
  where activo;

insert into public.com_kpi_configuraciones (
  kpi_id,
  alcance,
  cliente_id,
  vigente_desde,
  peso,
  meta,
  rangos_puntuacion,
  reglas_criticas,
  observaciones
)
select
  definicion.id,
  'GENERAL',
  null,
  date '2026-01-01',
  valores.peso,
  valores.meta,
  valores.rangos,
  valores.criticas,
  valores.observaciones
from public.com_kpi_definiciones definicion
join (
  values
    (
      'VENTAS_PRESUPUESTO', 20::numeric, 100::numeric,
      '[{"desde":100,"puntos":100},{"desde":95,"puntos":80},{"desde":90,"puntos":60},{"desde":80,"puntos":30},{"desde":0,"puntos":0}]'::jsonb,
      '[]'::jsonb,
      'Porcentaje de cumplimiento del presupuesto.'
    ),
    (
      'MARGEN_CONTRIBUCION', 20::numeric, null::numeric,
      '[{"brecha_pp_hasta":0,"puntos":100},{"brecha_pp_hasta":1,"puntos":80},{"brecha_pp_hasta":2,"puntos":60},{"brecha_pp_hasta":4,"puntos":30},{"brecha_pp_mayor":4,"puntos":0}]'::jsonb,
      '[{"codigo":"MARGEN_NEGATIVO","operador":"MENOR_QUE","umbral":0,"bloquea_verde":true}]'::jsonb,
      'La meta inicial debe definirse antes de activar el cálculo definitivo.'
    ),
    (
      'DEVOLUCIONES', 15::numeric, 8::numeric,
      '[{"hasta":8,"puntos":100},{"hasta":10,"puntos":80},{"hasta":12,"puntos":60},{"hasta":15,"puntos":30},{"mayor_que":15,"puntos":0}]'::jsonb,
      '[{"codigo":"DEVOLUCIONES_ALTAS","operador":"MAYOR_QUE","umbral":12,"bloquea_verde":true}]'::jsonb,
      'Valor devuelto sobre venta bruta.'
    ),
    (
      'FUGAS_COMERCIALES', 15::numeric, 0.25::numeric,
      '[{"hasta":0.25,"puntos":100},{"hasta":0.50,"puntos":80},{"hasta":1.00,"puntos":60},{"hasta":2.00,"puntos":30},{"mayor_que":2.00,"puntos":0}]'::jsonb,
      '[{"codigo":"FUGA_SEVERA","operador":"MAYOR_QUE","umbral":2,"bloquea_verde":true}]'::jsonb,
      'Solo ajustes clasificados como fuga comercial.'
    ),
    (
      'CRECIMIENTO_RENTABLE', 10::numeric, null::numeric,
      '[{"cumplimiento_meta_desde":100,"puntos":100},{"cumplimiento_meta_desde":75,"puntos":80},{"cumplimiento_meta_desde":50,"puntos":60},{"cumplimiento_meta_desde":0,"puntos":30},{"crecimiento_negativo":true,"puntos":0}]'::jsonb,
      '[]'::jsonb,
      'La meta inicial debe definirse antes de activar el cálculo definitivo.'
    ),
    (
      'COBERTURA_SKU', 10::numeric, 95::numeric,
      '[{"desde":95,"puntos":100},{"desde":90,"puntos":80},{"desde":85,"puntos":60},{"desde":75,"puntos":30},{"desde":0,"puntos":0}]'::jsonb,
      '[]'::jsonb,
      'Posiciones SKU-local activas sobre posiciones objetivo.'
    ),
    (
      'COMPROMISOS', 10::numeric, 95::numeric,
      '[{"desde":95,"puntos":100},{"desde":90,"puntos":80},{"desde":80,"puntos":60},{"desde":70,"puntos":30},{"desde":0,"puntos":0}]'::jsonb,
      '[]'::jsonb,
      'Cumplidos dentro del plazo sobre compromisos con vencimiento en el periodo.'
    )
) as valores(codigo, peso, meta, rangos, criticas, observaciones)
  on valores.codigo = definicion.codigo
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 8. Cierre y snapshot histórico
-- -----------------------------------------------------------------------------

create table if not exists public.com_kpi_cierres (
  id uuid primary key default gen_random_uuid(),
  periodo date not null,
  version integer not null default 1 check (version > 0),
  estado text not null default 'CERRADO'
    check (estado in ('CERRADO', 'ANULADO')),
  fecha_corte_datos timestamptz not null,
  configuracion_snapshot jsonb not null,
  observaciones text,
  cerrado_por uuid not null references auth.users(id) on delete restrict,
  cerrado_en timestamptz not null default now(),
  anulado_por uuid references auth.users(id) on delete restrict,
  anulado_en timestamptz,
  motivo_anulacion text,
  constraint com_kpi_cierres_periodo_mes_check check (
    extract(day from periodo) = 1
  ),
  constraint com_kpi_cierres_periodo_version_key unique (periodo, version),
  constraint com_kpi_cierres_anulacion_check check (
    (estado = 'CERRADO' and anulado_por is null and anulado_en is null)
    or (
      estado = 'ANULADO'
      and anulado_por is not null
      and anulado_en is not null
      and nullif(trim(coalesce(motivo_anulacion, '')), '') is not null
    )
  )
);

create unique index if not exists com_kpi_cierres_periodo_activo_uidx
  on public.com_kpi_cierres (periodo)
  where estado = 'CERRADO';

create table if not exists public.com_kpi_resultados_cierre (
  id uuid primary key default gen_random_uuid(),
  cierre_id uuid not null
    references public.com_kpi_cierres(id) on delete restrict,
  nivel text not null check (nivel in ('GENERAL', 'KAM', 'CLIENTE')),
  kam_user_id uuid references public.app_profiles(user_id) on delete restrict,
  cliente_id uuid references public.clientes(id) on delete restrict,
  puntaje numeric(7,4) not null check (puntaje >= 0 and puntaje <= 100),
  clasificacion text not null check (clasificacion in (
    'VERDE', 'AMARILLO', 'ROJO'
  )),
  alerta_critica boolean not null default false,
  alertas jsonb not null default '[]'::jsonb,
  valores_base jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  constraint com_kpi_resultado_nivel_check check (
    (nivel = 'GENERAL' and kam_user_id is null and cliente_id is null)
    or (nivel = 'KAM' and kam_user_id is not null and cliente_id is null)
    or (nivel = 'CLIENTE' and kam_user_id is not null and cliente_id is not null)
  ),
  constraint com_kpi_resultado_alertas_check check (
    jsonb_typeof(alertas) = 'array'
  ),
  constraint com_kpi_resultado_bases_check check (
    jsonb_typeof(valores_base) = 'object'
  )
);

create unique index if not exists com_kpi_resultado_nivel_uidx
  on public.com_kpi_resultados_cierre (
    cierre_id,
    nivel,
    coalesce(kam_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists com_kpi_resultado_kam_idx
  on public.com_kpi_resultados_cierre (kam_user_id, cierre_id);

create index if not exists com_kpi_resultado_cliente_idx
  on public.com_kpi_resultados_cierre (cliente_id, cierre_id);

create table if not exists public.com_kpi_resultados_cierre_detalle (
  id uuid primary key default gen_random_uuid(),
  resultado_id uuid not null
    references public.com_kpi_resultados_cierre(id) on delete restrict,
  kpi_id uuid not null
    references public.com_kpi_definiciones(id) on delete restrict,
  aplica boolean not null,
  valor numeric(18,6),
  numerador numeric(18,6),
  denominador numeric(18,6),
  meta numeric(18,6),
  nota numeric(7,4) check (nota is null or (nota >= 0 and nota <= 100)),
  peso_configurado numeric(7,4) not null
    check (peso_configurado >= 0 and peso_configurado <= 100),
  peso_efectivo numeric(7,4) not null
    check (peso_efectivo >= 0 and peso_efectivo <= 100),
  puntos numeric(7,4) not null check (puntos >= 0 and puntos <= 100),
  regla_puntuacion_snapshot jsonb not null,
  reglas_criticas_snapshot jsonb not null default '[]'::jsonb,
  valores_base jsonb not null default '{}'::jsonb,
  alertas jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  constraint com_kpi_resultado_detalle_key unique (resultado_id, kpi_id),
  constraint com_kpi_detalle_regla_check check (
    jsonb_typeof(regla_puntuacion_snapshot) = 'array'
  ),
  constraint com_kpi_detalle_criticas_check check (
    jsonb_typeof(reglas_criticas_snapshot) = 'array'
  ),
  constraint com_kpi_detalle_bases_check check (
    jsonb_typeof(valores_base) = 'object'
  ),
  constraint com_kpi_detalle_alertas_check check (
    jsonb_typeof(alertas) = 'array'
  )
);

create table if not exists public.com_kpi_cierre_desglose (
  id uuid primary key default gen_random_uuid(),
  resultado_detalle_id uuid not null
    references public.com_kpi_resultados_cierre_detalle(id) on delete restrict,
  dimension text not null check (dimension in (
    'CLIENTE', 'SKU', 'LOCAL', 'SKU_LOCAL', 'COMPROMISO', 'AJUSTE'
  )),
  clave text not null,
  etiqueta text not null,
  cliente_id uuid references public.clientes(id) on delete restrict,
  producto_id uuid references public.productos(id) on delete restrict,
  bodega_id uuid references public.bodegas(id) on delete restrict,
  valores jsonb not null,
  creado_en timestamptz not null default now(),
  constraint com_kpi_cierre_desglose_key unique (
    resultado_detalle_id, dimension, clave
  ),
  constraint com_kpi_cierre_desglose_valores_check check (
    jsonb_typeof(valores) = 'object'
  )
);

create index if not exists com_kpi_cierre_desglose_cliente_idx
  on public.com_kpi_cierre_desglose (cliente_id, resultado_detalle_id);

create index if not exists com_kpi_cierre_desglose_producto_idx
  on public.com_kpi_cierre_desglose (producto_id, resultado_detalle_id);

-- -----------------------------------------------------------------------------
-- 9. Validaciones y timestamps
-- -----------------------------------------------------------------------------

create or replace function public.com_kpi_actualizar_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce(auth.uid(), new.actualizado_por);
  return new;
end;
$$;

create or replace function public.com_validar_kam_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.app_profiles perfil
    where perfil.user_id = new.kam_user_id
      and perfil.activo
      and perfil.rol = 'KAM'
  ) then
    raise exception 'El usuario seleccionado no es un KAM activo.';
  end if;

  if exists (
    select 1
    from public.com_kam_clientes asignacion
    where asignacion.cliente_id = new.cliente_id
      and asignacion.id <> new.id
      and asignacion.activo
      and daterange(
        asignacion.vigente_desde,
        coalesce(asignacion.vigente_hasta + 1, 'infinity'::date),
        '[)'
      ) && daterange(
        new.vigente_desde,
        coalesce(new.vigente_hasta + 1, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'El cliente ya tiene un KAM asignado en ese periodo.';
  end if;

  return new;
end;
$$;

create or replace function public.com_validar_cobertura_sku_local()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.bodegas bodega
    where bodega.id = new.bodega_id
      and bodega.cliente_id = new.cliente_id
  ) then
    raise exception 'El local no pertenece al cliente seleccionado.';
  end if;

  if not exists (
    select 1
    from public.cliente_productos relacion
    where relacion.cliente_id = new.cliente_id
      and relacion.producto_id = new.producto_id
  ) then
    raise exception 'El SKU no está relacionado con el cliente seleccionado.';
  end if;

  if exists (
    select 1
    from public.com_cobertura_sku_local cobertura
    where cobertura.cliente_id = new.cliente_id
      and cobertura.bodega_id = new.bodega_id
      and cobertura.producto_id = new.producto_id
      and cobertura.id <> new.id
      and daterange(
        cobertura.vigente_desde,
        coalesce(cobertura.vigente_hasta + 1, 'infinity'::date),
        '[)'
      ) && daterange(
        new.vigente_desde,
        coalesce(new.vigente_hasta + 1, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'La posición SKU-local ya tiene un estado en ese periodo.';
  end if;

  return new;
end;
$$;

drop trigger if exists com_kam_clientes_validar
  on public.com_kam_clientes;
create trigger com_kam_clientes_validar
before insert or update on public.com_kam_clientes
for each row execute function public.com_validar_kam_cliente();

drop trigger if exists com_cobertura_validar
  on public.com_cobertura_sku_local;
create trigger com_cobertura_validar
before insert or update on public.com_cobertura_sku_local
for each row execute function public.com_validar_cobertura_sku_local();

do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'com_kam_clientes',
    'com_presupuestos_mensuales',
    'com_ajustes_comerciales',
    'com_cobertura_sku_local',
    'com_compromisos',
    'com_kpi_configuraciones'
  ]
  loop
    execute format(
      'drop trigger if exists com_kpi_actualizar_timestamp on public.%I',
      tabla
    );
    execute format(
      'create trigger com_kpi_actualizar_timestamp before update on public.%I for each row execute function public.com_kpi_actualizar_timestamp()',
      tabla
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Seguridad por rol, permiso y cartera del KAM
-- -----------------------------------------------------------------------------

create or replace function public.com_es_gerencia_kpi(
  p_user_id uuid default auth.uid()
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
      and perfil.rol in ('ADMINISTRADOR', 'GERENTE')
  );
$$;

create or replace function public.com_puede_ver_cliente_kpi(
  p_cliente_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.com_es_gerencia_kpi(p_user_id) then true
    when exists (
      select 1
      from public.app_profiles perfil
      where perfil.user_id = p_user_id
        and perfil.activo
        and perfil.rol = 'KAM'
    ) then exists (
      select 1
      from public.com_kam_clientes asignacion
      where asignacion.kam_user_id = p_user_id
        and asignacion.cliente_id = p_cliente_id
        and asignacion.activo
        and asignacion.vigente_desde <= current_date
        and (
          asignacion.vigente_hasta is null
          or asignacion.vigente_hasta >= current_date
        )
    )
    else public.app_puede('KPI KAM', p_user_id)
  end;
$$;

revoke all on function public.com_es_gerencia_kpi(uuid)
  from public, anon;
revoke all on function public.com_puede_ver_cliente_kpi(uuid, uuid)
  from public, anon;
grant execute on function public.com_es_gerencia_kpi(uuid)
  to authenticated;
grant execute on function public.com_puede_ver_cliente_kpi(uuid, uuid)
  to authenticated;

do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'com_kam_clientes',
    'com_presupuestos_mensuales',
    'com_ajuste_categorias',
    'com_ajustes_comerciales',
    'com_venta_descuento_clasificaciones',
    'com_cobertura_sku_local',
    'com_compromisos',
    'com_kpi_definiciones',
    'com_kpi_configuraciones',
    'com_kpi_cierres',
    'com_kpi_resultados_cierre',
    'com_kpi_resultados_cierre_detalle',
    'com_kpi_cierre_desglose'
  ]
  loop
    execute format('alter table public.%I enable row level security', tabla);
    execute format('revoke all on table public.%I from anon', tabla);
    execute format('revoke all on table public.%I from authenticated', tabla);
    execute format('grant select on table public.%I to authenticated', tabla);
  end loop;
end;
$$;

-- Catálogos y configuración: lectura con permiso; escritura mediante RPC de
-- gerencia que se implementará junto con la lógica de cálculo.
drop policy if exists com_ajuste_categorias_lectura
  on public.com_ajuste_categorias;
create policy com_ajuste_categorias_lectura
  on public.com_ajuste_categorias
  for select to authenticated
  using (public.app_puede('KPI KAM'));

drop policy if exists com_kpi_definiciones_lectura
  on public.com_kpi_definiciones;
create policy com_kpi_definiciones_lectura
  on public.com_kpi_definiciones
  for select to authenticated
  using (public.app_puede('KPI KAM'));

drop policy if exists com_kpi_configuraciones_lectura
  on public.com_kpi_configuraciones;
create policy com_kpi_configuraciones_lectura
  on public.com_kpi_configuraciones
  for select to authenticated
  using (public.app_puede('KPI KAM'));

-- Fuentes por cliente.
drop policy if exists com_kam_clientes_lectura on public.com_kam_clientes;
create policy com_kam_clientes_lectura
  on public.com_kam_clientes
  for select to authenticated
  using (
    public.com_es_gerencia_kpi()
    or kam_user_id = auth.uid()
    or public.com_puede_ver_cliente_kpi(cliente_id)
  );

drop policy if exists com_presupuestos_lectura
  on public.com_presupuestos_mensuales;
create policy com_presupuestos_lectura
  on public.com_presupuestos_mensuales
  for select to authenticated
  using (public.com_puede_ver_cliente_kpi(cliente_id));

drop policy if exists com_ajustes_lectura
  on public.com_ajustes_comerciales;
create policy com_ajustes_lectura
  on public.com_ajustes_comerciales
  for select to authenticated
  using (public.com_puede_ver_cliente_kpi(cliente_id));

drop policy if exists com_cobertura_lectura
  on public.com_cobertura_sku_local;
create policy com_cobertura_lectura
  on public.com_cobertura_sku_local
  for select to authenticated
  using (public.com_puede_ver_cliente_kpi(cliente_id));

drop policy if exists com_compromisos_lectura
  on public.com_compromisos;
create policy com_compromisos_lectura
  on public.com_compromisos
  for select to authenticated
  using (
    public.com_es_gerencia_kpi()
    or kam_user_id = auth.uid()
    or public.com_puede_ver_cliente_kpi(cliente_id)
  );

-- La clasificación de descuentos hereda el acceso de la venta relacionada.
drop policy if exists com_venta_descuento_clasificaciones_lectura
  on public.com_venta_descuento_clasificaciones;
create policy com_venta_descuento_clasificaciones_lectura
  on public.com_venta_descuento_clasificaciones
  for select to authenticated
  using (
    exists (
      select 1
      from public.com_ventas_detalle venta
      where venta.id = venta_detalle_id
        and venta.cliente_id is not null
        and public.com_puede_ver_cliente_kpi(venta.cliente_id)
    )
  );

-- Cierres: el resultado general/KAM requiere permiso; el detalle de cliente
-- queda limitado por la cartera cuando el usuario es KAM.
drop policy if exists com_kpi_cierres_lectura on public.com_kpi_cierres;
create policy com_kpi_cierres_lectura
  on public.com_kpi_cierres
  for select to authenticated
  using (public.app_puede('KPI KAM'));

drop policy if exists com_kpi_resultados_lectura
  on public.com_kpi_resultados_cierre;
create policy com_kpi_resultados_lectura
  on public.com_kpi_resultados_cierre
  for select to authenticated
  using (
    public.com_es_gerencia_kpi()
    or (
      nivel = 'KAM'
      and kam_user_id = auth.uid()
    )
    or (
      nivel = 'CLIENTE'
      and (
        kam_user_id = auth.uid()
        or (
          cliente_id is not null
          and public.com_puede_ver_cliente_kpi(cliente_id)
        )
      )
    )
    or (
      nivel = 'GENERAL'
      and public.app_puede('KPI KAM')
      and not exists (
        select 1
        from public.app_profiles perfil
        where perfil.user_id = auth.uid()
          and perfil.rol = 'KAM'
      )
    )
  );

drop policy if exists com_kpi_resultado_detalle_lectura
  on public.com_kpi_resultados_cierre_detalle;
create policy com_kpi_resultado_detalle_lectura
  on public.com_kpi_resultados_cierre_detalle
  for select to authenticated
  using (
    exists (
      select 1
      from public.com_kpi_resultados_cierre resultado
      where resultado.id = resultado_id
    )
  );

drop policy if exists com_kpi_cierre_desglose_lectura
  on public.com_kpi_cierre_desglose;
create policy com_kpi_cierre_desglose_lectura
  on public.com_kpi_cierre_desglose
  for select to authenticated
  using (
    exists (
      select 1
      from public.com_kpi_resultados_cierre_detalle detalle
      join public.com_kpi_resultados_cierre resultado
        on resultado.id = detalle.resultado_id
      where detalle.id = resultado_detalle_id
    )
  );

comment on table public.com_kam_clientes is
  'Asignación histórica de cada cliente a su KAM responsable.';
comment on table public.com_presupuestos_mensuales is
  'Presupuesto comercial mensual por cliente y KAM responsable.';
comment on table public.com_ajustes_comerciales is
  'Ajustes comerciales que no están ya representados por devoluciones o promociones.';
comment on table public.com_cobertura_sku_local is
  'Historial de posiciones comerciales cliente-local-SKU y su estado.';
comment on table public.com_compromisos is
  'Compromisos comerciales gestionados por cada KAM.';
comment on table public.com_kpi_configuraciones is
  'Pesos, metas, rangos, aplicabilidad y reglas críticas con vigencia histórica.';
comment on table public.com_kpi_cierres is
  'Cabecera versionada del cierre mensual inmutable de KPI KAM.';
comment on table public.com_kpi_resultados_cierre_detalle is
  'Snapshot de cada KPI, incluidos pesos redistribuidos y reglas utilizadas.';
