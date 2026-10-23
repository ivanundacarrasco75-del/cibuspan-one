-- Control de acceso a las operaciones existentes, sin reescribir sus reglas.
-- Aplicar sólo este archivo. No ejecutar todo el historial de migraciones.
begin;

do $preflight$
declare v_oid oid;
begin
  if to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.app_puede_alguna(text[])') is null
     or (select count(*) from pg_attribute where attrelid=to_regclass('public.app_profiles')
       and ((attname='activo' and atttypid='boolean'::regtype)
         or (attname='user_id' and atttypid='uuid'::regtype)) and not attisdropped)<>2 then
    raise exception 'Falta la base de usuarios/permisos. No se instaló la autorización operativa.';
  end if;
  v_oid:=to_regprocedure('public.app_exigir_operacion(text[])');
  if v_oid is not null and not ((select prosrc from pg_proc where oid=v_oid)
    ~ E'^[[:space:]]*-- cibuspan-autorizacion-operativa-v1:helper\\r?\\n') then
    raise exception 'Ya existe otra app_exigir_operacion. Revisar antes de modificarla.';
  end if;
end;
$preflight$;

create or replace function public.app_exigir_operacion(p_modulos text[])
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $guard$
-- cibuspan-autorizacion-operativa-v1:helper
declare
  v_rol_sql text:=coalesce(current_setting('role',true),'none');
  v_usuario uuid:=auth.uid();
begin
  if coalesce(cardinality(p_modulos),0)=0 then
    raise exception 'No se definió el permiso de la operación.' using errcode='42501';
  end if;

  -- El rol SQL lo establece PostgREST al verificar la sesión. No basta un
  -- texto que diga service_role en un claim o un parámetro de la aplicación.
  if v_rol_sql='service_role' then return; end if;

  -- Conserva mantenimiento SQL directo autorizado. Dentro de SECURITY DEFINER
  -- current_user cambia de identidad: por eso NO se usa para esta excepción.
  if v_usuario is null and (v_rol_sql in ('postgres','supabase_admin')
    or (v_rol_sql='none' and session_user in ('postgres','supabase_admin'))) then return; end if;

  if v_usuario is null then
    raise exception 'No existe una sesión válida.' using errcode='42501';
  end if;
  if not exists(select 1 from public.app_profiles where user_id=v_usuario and activo) then
    raise exception 'El usuario no está habilitado.' using errcode='42501';
  end if;
  if not coalesce(public.app_puede_alguna(p_modulos),false) then
    raise exception 'No tienes permiso para esta operación.' using errcode='42501';
  end if;
end;
$guard$;

revoke all on function public.app_exigir_operacion(text[]) from public,anon;
grant execute on function public.app_exigir_operacion(text[]) to authenticated,service_role;

do $proteger$
declare
  v_item record; v_funcion record; v_def text; v_nuevo text; v_pos integer;
  v_marca constant text:=E'\n-- cibuspan-autorizacion-operativa-v1\n';
begin
  for v_item in select * from (values
    ('registrar_produccion_completa','date,jsonb',array['Producción']),
    ('editar_produccion_completa','uuid,date,jsonb',array['Producción','Administración']),
    ('reservar_pedido_fefo_parcial','text,jsonb',array['Pedidos','Despachos']),
    ('confirmar_despacho_parcial_fefo','text,jsonb',array['Pedidos','Despachos']),
    ('liberar_reserva_fefo','uuid',array['Pedidos','Despachos']),
    ('activar_control_conciliacion_despacho','text',array['Pedidos','Despachos']),
    ('vincular_factura_despacho','text,text',array['Pedidos','Despachos']),
    ('ajustar_inventario_lote','uuid,text,integer,text,text',array['Inventario','Producción','Despachos']),
    ('convertir_inventario_empaque','uuid,uuid,integer',array['Inventario','Producción','Despachos']),
    ('convertir_semielaborado','uuid,uuid,integer,date,text,date',array['Producción']),
    ('registrar_devolucion_completa','date,uuid,uuid,text,text,jsonb',array['Devoluciones']),
    ('obtener_produccion_sugerida','',array['Producción','Reportes','Dashboard'])
  ) as t(nombre,argumentos,modulos)
  loop
    select p.*,l.lanname into v_funcion from pg_proc p
    join pg_language l on l.oid=p.prolang
    where p.oid=to_regprocedure(format('public.%I(%s)',v_item.nombre,v_item.argumentos));
    if not found then
      raise exception 'Falta la función %. No se aplicó ningún cambio.',v_item.nombre;
    end if;
    if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=v_item.nombre)<>1 then
      raise exception 'La función % tiene variantes no revisadas. No se aplicó ningún cambio.',v_item.nombre;
    end if;

    if not starts_with(v_funcion.prosrc,v_marca) then
      if v_funcion.lanname='plpgsql' then
        if ltrim(v_funcion.prosrc,E' \t\r\n') like '#%' then
          raise exception 'La función % tiene directivas que requieren revisión.',v_item.nombre;
        end if;
        -- El bloque anterior se conserva íntegro como bloque interior. La
        -- autorización sucede antes de sus DECLARE, BEGIN y EXCEPTION.
        v_nuevo:=v_marca||E'BEGIN\n  PERFORM public.app_exigir_operacion('
          ||quote_literal(v_item.modulos::text)||E'::text[]);\n'
          ||v_funcion.prosrc||E'\nEND;\n';
      elsif v_funcion.lanname='sql' and v_item.nombre='obtener_produccion_sugerida'
            and v_funcion.pronargs=0 and v_funcion.proretset then
        -- Conserva el SELECT/CTE vigente sin tocar sus columnas o sus cuentas.
        v_nuevo:=v_marca||E'BEGIN\n  PERFORM public.app_exigir_operacion('
          ||quote_literal(v_item.modulos::text)||E'::text[]);\n  RETURN QUERY EXECUTE '
          ||quote_literal(v_funcion.prosrc)||E';\nEND;\n';
      else
        raise exception 'El contrato de % requiere revisión. No se aplicó ningún cambio.',v_item.nombre;
      end if;

      v_def:=pg_get_functiondef(v_funcion.oid);
      v_pos:=strpos(v_def,v_funcion.prosrc);
      if v_pos=0 or v_funcion.prosrc='' then
        raise exception 'No se pudo conservar el cuerpo de %.',v_item.nombre;
      end if;
      v_def:=overlay(v_def placing v_nuevo from v_pos for length(v_funcion.prosrc));
      if v_funcion.lanname='sql' then
        v_pos:=strpos(v_def,E'\n LANGUAGE sql\n');
        if v_pos=0 then raise exception 'No se identificó el lenguaje de %.',v_item.nombre; end if;
        v_def:=overlay(v_def placing E'\n LANGUAGE plpgsql\n' from v_pos for length(E'\n LANGUAGE sql\n'));
      end if;
      execute v_def;
    end if;

    if not starts_with((select prosrc from pg_proc where oid=v_funcion.oid),
      v_marca||E'BEGIN\n  PERFORM public.app_exigir_operacion('
        ||quote_literal(v_item.modulos::text)||E'::text[]);\n') then
      raise exception 'El control de % no coincide con esta versión. Se revierte la instalación.',v_item.nombre;
    end if;

    -- Se conservan otros grants expresos y los contratos existentes. Se retira
    -- la herencia de PUBLIC y el acceso anónimo para estas operaciones.
    execute format('revoke all on function public.%I(%s) from public,anon',v_item.nombre,v_item.argumentos);
    execute format('grant execute on function public.%I(%s) to authenticated,service_role',v_item.nombre,v_item.argumentos);
    if has_function_privilege('anon',v_funcion.oid,'EXECUTE')
       or not has_function_privilege('authenticated',v_funcion.oid,'EXECUTE')
       or not has_function_privilege('service_role',v_funcion.oid,'EXECUTE') then
      raise exception 'No se pudieron verificar los accesos de %. Se revierte la instalación.',v_item.nombre;
    end if;
  end loop;
end;
$proteger$;

notify pgrst,'reload schema';
commit;
