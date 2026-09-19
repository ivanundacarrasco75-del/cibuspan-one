-- CIBUSPAN ONE: aplica los permisos de módulo también a las tablas operativas.
-- Esta migración es tolerante a tablas que todavía no existan en el proyecto.

create or replace function public.app_puede_alguna(p_pantallas text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(bool_or(public.app_puede(pantalla)), false)
  from unnest(p_pantallas) as pantalla;
$$;

grant execute on function public.app_puede_alguna(text[]) to authenticated;

-- El trigger mantiene la validación incluso si una función transaccional escribe
-- con SECURITY DEFINER. Los procesos internos sin JWT conservan su operación.
create or replace function public.app_validar_escritura_modulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.app_puede_alguna(TG_ARGV[0]::text[]) then
    raise exception 'No tienes permiso para modificar este módulo.'
      using errcode = '42501';
  end if;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  item record;
  nombre_calificado text;
begin
  for item in
    select * from (values
      -- Catálogos: se consultan desde varios módulos y se modifican en Administración.
      ('clientes', array['Pedidos','Despachos','Devoluciones','Reportes','Administración'], array['Administración']),
      ('cliente_productos', array['Pedidos','Despachos','Devoluciones','Reportes','Administración'], array['Administración']),
      ('bodegas', array['Pedidos','Inventario','Despachos','Devoluciones','Reportes','Administración'], array['Administración']),
      ('productos', array['Pedidos','Inventario','Producción','Despachos','Devoluciones','Reportes','Administración'], array['Administración']),

      -- Pedidos, reservas y despachos.
      ('pedidos', array['Pedidos','Despachos','Reportes'], array['Pedidos','Despachos']),
      ('pedido_detalles', array['Pedidos','Despachos','Reportes'], array['Pedidos','Despachos']),
      ('reservas_inventario', array['Pedidos','Despachos','Reportes'], array['Pedidos','Despachos']),
      ('reserva_detalles', array['Pedidos','Despachos','Reportes'], array['Pedidos','Despachos']),
      ('despachos', array['Despachos','Reportes'], array['Despachos']),
      ('despacho_detalles', array['Despachos','Reportes'], array['Despachos']),

      -- Inventario y producción.
      ('inventario_lotes', array['Inventario','Producción','Despachos','Reportes'], array['Inventario','Producción','Despachos']),
      ('producciones', array['Producción','Reportes'], array['Producción']),
      ('produccion_detalles', array['Producción','Reportes'], array['Producción']),
      ('devoluciones', array['Devoluciones','Reportes'], array['Devoluciones']),
      ('devolucion_detalles', array['Devoluciones','Reportes'], array['Devoluciones']),

      -- Semielaborados.
      ('semielaborado_tipos', array['Producción','Reportes'], array['Producción']),
      ('semielaborado_destinos', array['Producción','Reportes'], array['Producción']),
      ('inventario_semielaborados', array['Producción','Reportes'], array['Producción']),
      ('conversiones_semielaborados', array['Producción','Reportes'], array['Producción']),

      -- Costos, materias primas y fórmulas.
      ('materias_primas', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('categorias_materia_prima', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('importaciones_costos', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('fm_formulas', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('fm_formula_versiones', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('fm_micros', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('fm_preformulacion_componentes', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('bi_recetas', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('bi_receta_versiones', array['Producción','Reportes','Administración'], array['Producción','Administración']),
      ('bi_receta_componentes', array['Producción','Reportes','Administración'], array['Producción','Administración'])
    ) as t(tabla, lectura, escritura)
  loop
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = item.tabla
        and c.relkind in ('r', 'p')
    ) then
      nombre_calificado := format('public.%I', item.tabla);
      item.lectura := item.lectura || array['Dashboard'];

      execute format('alter table %s enable row level security', nombre_calificado);
      execute format('revoke all on table %s from anon', nombre_calificado);
      execute format('grant select, insert, update, delete on table %s to authenticated', nombre_calificado);

      execute format('drop policy if exists c1_base_autenticado on %s', nombre_calificado);
      execute format('drop policy if exists c1_modulo_lectura on %s', nombre_calificado);
      execute format('drop policy if exists c1_modulo_inserta on %s', nombre_calificado);
      execute format('drop policy if exists c1_modulo_actualiza on %s', nombre_calificado);
      execute format('drop policy if exists c1_modulo_elimina on %s', nombre_calificado);

      execute format(
        'create policy c1_base_autenticado on %s as permissive for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)',
        nombre_calificado
      );
      execute format(
        'create policy c1_modulo_lectura on %s as restrictive for select to authenticated using (public.app_puede_alguna(%L::text[]))',
        nombre_calificado, item.lectura
      );
      execute format(
        'create policy c1_modulo_inserta on %s as restrictive for insert to authenticated with check (public.app_puede_alguna(%L::text[]))',
        nombre_calificado, item.escritura
      );
      execute format(
        'create policy c1_modulo_actualiza on %s as restrictive for update to authenticated using (public.app_puede_alguna(%L::text[])) with check (public.app_puede_alguna(%L::text[]))',
        nombre_calificado, item.escritura, item.escritura
      );
      execute format(
        'create policy c1_modulo_elimina on %s as restrictive for delete to authenticated using (public.app_puede_alguna(%L::text[]))',
        nombre_calificado, item.escritura
      );

      execute format('drop trigger if exists c1_validar_escritura_modulo on %s', nombre_calificado);
      execute format(
        'create trigger c1_validar_escritura_modulo before insert or update or delete on %s for each row execute function public.app_validar_escritura_modulo(%L)',
        nombre_calificado, item.escritura
      );
    end if;
  end loop;
end $$;

-- Las vistas usan los permisos de quien las consulta para no saltarse el RLS.
do $$
declare
  vista text;
begin
  foreach vista in array array[
    'stock_disponible_lotes',
    'vw_producciones_resumen',
    'vw_produccion_historial_detalle',
    'stock_semielaborados',
    'stock_semielaborados_resumen',
    'materias_primas_costo_actual',
    'fm_vw_costos_formula',
    'fm_vw_formula_final',
    'fm_vw_preformulacion_calculada',
    'fm_vw_recetas_micro',
    'bi_vw_formula_producto',
    'bi_vw_recetas_costo_actual'
  ]
  loop
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = vista and c.relkind = 'v'
    ) then
      execute format('alter view public.%I set (security_invoker = true)', vista);
      execute format('grant select on public.%I to authenticated', vista);
      execute format('revoke all on public.%I from anon', vista);
    end if;
  end loop;
end $$;
