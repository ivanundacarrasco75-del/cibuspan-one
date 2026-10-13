-- Instala la función de revisión completa y la auditoría con respaldo transaccional.
-- No requiere db push ni cambia otros módulos.
-- Revisión explícita de cantidades y fechas de pedido/despacho del mismo detalle.
-- No cambia la fecha de visita, SKU, autor, caras, fotos, georreferencias ni cobertura.
create or replace function public.com_kpi_campo_completar_lectura(
  p_registro_id uuid, p_actualizado_en timestamptz, p_datos jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_detalle public.com_visitas_campo_sku%rowtype;
  v_visita public.com_visitas_campo%rowtype;
  v_campo text; v_valor numeric; v_fecha date; v_cantidad integer := 0;
  v_campos text[] := array['precio_comercio','precio_afiliado','rotacion_diaria_unidades',
    'venta_diaria_valor','prediccion_venta_unidades','participacion_clase','participacion_subclase',
    'stock_local_unidades','dias_inventario_local','stock_cd_cajas','unidades_por_caja',
    'dias_inventario_cd','cantidad_ultimo_pedido','cantidad_ultimo_despacho'];
  v_valores jsonb := '{}'::jsonb;
  v_fechas text[] := array['fecha_ultimo_pedido','fecha_ultimo_despacho'];
  v_fechas_valores jsonb := '{}'::jsonb;
  v_borrar text[] := '{}'::text[];
begin
  if auth.uid() is null or not public.app_puede('Campo comercial', auth.uid()) then
    raise exception 'No tienes permiso para completar lecturas.' using errcode = '42501';
  end if;
  select * into v_detalle from public.com_visitas_campo_sku where id = p_registro_id for update;
  if not found then raise exception 'El registro de visita ya no existe.'; end if;
  select * into v_visita from public.com_visitas_campo where id = v_detalle.visita_id;
  if v_visita.estado <> 'CONFIRMADA'
    or not public.com_puede_ver_cliente_campo(v_visita.cliente_id, auth.uid(), v_visita.fecha_visita)
    or (v_visita.registrado_por is distinct from auth.uid() and not public.com_es_gerencia_kpi()) then
    raise exception 'Solo el autor o un administrador/gerente autorizado puede completar esta visita.' using errcode = '42501';
  end if;
  if p_actualizado_en is null or v_detalle.actualizado_en is distinct from p_actualizado_en then
    raise exception 'Esta visita cambió. Actualiza el dashboard y revisa nuevamente antes de guardar.' using errcode = '40001';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'La lectura no es válida.'; end if;
  for v_campo in select jsonb_object_keys(p_datos) loop
    if not (v_campo = any(v_campos || v_fechas || array['confianza','advertencias','texto_ocr','campos_borrar'])) then
      raise exception 'No se puede modificar el campo % desde la recuperación de lectura.', v_campo;
    end if;
  end loop;
  foreach v_campo in array v_campos loop
    if p_datos ? v_campo and p_datos->v_campo <> 'null'::jsonb then
      if jsonb_typeof(p_datos->v_campo) <> 'number' then raise exception 'La cantidad % no es numérica.', v_campo; end if;
      v_valor := (p_datos->>v_campo)::numeric;
      if v_valor < 0 or v_valor::text in ('NaN','Infinity','-Infinity') then raise exception 'La cantidad % no es válida.', v_campo; end if;
      v_valores := v_valores || jsonb_build_object(v_campo, v_valor);
      v_cantidad := v_cantidad + 1;
    end if;
  end loop;
  foreach v_campo in array v_fechas loop
    if p_datos ? v_campo and p_datos->v_campo <> 'null'::jsonb then
      if jsonb_typeof(p_datos->v_campo) <> 'string' or (p_datos->>v_campo) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'La fecha % debe estar completa en formato AAAA-MM-DD.', v_campo;
      end if;
      v_fecha := (p_datos->>v_campo)::date;
      v_fechas_valores := v_fechas_valores || jsonb_build_object(v_campo, v_fecha);
      v_cantidad := v_cantidad + 1;
    end if;
  end loop;
  if p_datos ? 'campos_borrar' then
    if jsonb_typeof(p_datos->'campos_borrar') <> 'array' then raise exception 'Los campos a quitar no son válidos.'; end if;
    for v_campo in select value #>> '{}' from jsonb_array_elements(p_datos->'campos_borrar') loop
      if v_campo is null or not (v_campo = any(v_campos || v_fechas)) then raise exception 'No se puede quitar el campo %.', v_campo; end if;
      if v_valores ? v_campo or v_fechas_valores ? v_campo then raise exception 'No se puede asignar y quitar el mismo campo.'; end if;
      v_borrar := array_append(v_borrar, v_campo);
      v_valores := v_valores || jsonb_build_object(v_campo, null);
      v_cantidad := v_cantidad + 1;
    end loop;
  end if;
  if v_cantidad = 0 then raise exception 'No hay datos para completar o corregir la visita.'; end if;
  if p_datos ? 'confianza' and p_datos->'confianza' <> 'null'::jsonb then
    if jsonb_typeof(p_datos->'confianza') <> 'number' or (p_datos->>'confianza')::numeric not between 0 and 1 then
      raise exception 'La confianza del lector no es válida.';
    end if;
  end if;
  if p_datos ? 'advertencias' and jsonb_typeof(p_datos->'advertencias') <> 'array' then raise exception 'Las advertencias no son válidas.'; end if;
  if p_datos ? 'texto_ocr' and jsonb_typeof(p_datos->'texto_ocr') <> 'string' then raise exception 'El texto OCR no es válido.'; end if;
  update public.com_visitas_campo_sku set
    precio_comercio = case when 'precio_comercio' = any(v_borrar) then null else coalesce((v_valores->>'precio_comercio')::numeric, precio_comercio) end,
    precio_afiliado = case when 'precio_afiliado' = any(v_borrar) then null else coalesce((v_valores->>'precio_afiliado')::numeric, precio_afiliado) end,
    rotacion_diaria_unidades = case when 'rotacion_diaria_unidades' = any(v_borrar) then null else coalesce((v_valores->>'rotacion_diaria_unidades')::numeric, rotacion_diaria_unidades) end,
    venta_diaria_valor = case when 'venta_diaria_valor' = any(v_borrar) then null else coalesce((v_valores->>'venta_diaria_valor')::numeric, venta_diaria_valor) end,
    prediccion_venta_unidades = case when 'prediccion_venta_unidades' = any(v_borrar) then null else coalesce((v_valores->>'prediccion_venta_unidades')::numeric, prediccion_venta_unidades) end,
    participacion_clase = case when 'participacion_clase' = any(v_borrar) then null else coalesce((v_valores->>'participacion_clase')::numeric, participacion_clase) end,
    participacion_subclase = case when 'participacion_subclase' = any(v_borrar) then null else coalesce((v_valores->>'participacion_subclase')::numeric, participacion_subclase) end,
    stock_local_unidades = case when 'stock_local_unidades' = any(v_borrar) then null else coalesce((v_valores->>'stock_local_unidades')::numeric, stock_local_unidades) end,
    dias_inventario_local = case when 'dias_inventario_local' = any(v_borrar) then null else coalesce((v_valores->>'dias_inventario_local')::numeric, dias_inventario_local) end,
    stock_cd_cajas = case when 'stock_cd_cajas' = any(v_borrar) then null else coalesce((v_valores->>'stock_cd_cajas')::numeric, stock_cd_cajas) end,
    unidades_por_caja = case when 'unidades_por_caja' = any(v_borrar) then null else coalesce((v_valores->>'unidades_por_caja')::numeric, unidades_por_caja) end,
    dias_inventario_cd = case when 'dias_inventario_cd' = any(v_borrar) then null else coalesce((v_valores->>'dias_inventario_cd')::numeric, dias_inventario_cd) end,
    cantidad_ultimo_pedido = case when 'cantidad_ultimo_pedido' = any(v_borrar) then null else coalesce((v_valores->>'cantidad_ultimo_pedido')::numeric, cantidad_ultimo_pedido) end,
    cantidad_ultimo_despacho = case when 'cantidad_ultimo_despacho' = any(v_borrar) then null else coalesce((v_valores->>'cantidad_ultimo_despacho')::numeric, cantidad_ultimo_despacho) end,
    fecha_ultimo_pedido = case when 'fecha_ultimo_pedido' = any(v_borrar) then null else coalesce((v_fechas_valores->>'fecha_ultimo_pedido')::date, fecha_ultimo_pedido) end,
    fecha_ultimo_despacho = case when 'fecha_ultimo_despacho' = any(v_borrar) then null else coalesce((v_fechas_valores->>'fecha_ultimo_despacho')::date, fecha_ultimo_despacho) end,
    confianza_ia = coalesce((p_datos->>'confianza')::numeric, confianza_ia),
    datos_ia = coalesce(datos_ia, '{}'::jsonb) || v_valores || v_fechas_valores || jsonb_build_object(
      'lector_estado', 'RECUPERADA_REVISADA', 'lector_recuperado_por', auth.uid(), 'lector_recuperado_en', now(),
      'lector_campos_quitados', to_jsonb(v_borrar),
      'texto_ocr', left(coalesce(p_datos->>'texto_ocr', ''), 20000),
      'advertencias', coalesce(p_datos->'advertencias', '[]'::jsonb)),
    actualizado_en = clock_timestamp()
  where id = p_registro_id
  returning * into v_detalle;
  return jsonb_build_object('id', v_detalle.id, 'actualizado_en', v_detalle.actualizado_en);
end;
$$;
revoke all on function public.com_kpi_campo_completar_lectura(uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.com_kpi_campo_completar_lectura(uuid,timestamptz,jsonb) to authenticated;

create table if not exists public.com_lecturas_campo_auditoria (
  id bigint generated always as identity primary key,
  registro_id uuid not null references public.com_visitas_campo_sku(id),
  editado_por uuid not null references auth.users(id),
  editado_en timestamptz not null default clock_timestamp(),
  anterior jsonb not null, posterior jsonb not null, evidencia jsonb not null
);
alter table public.com_lecturas_campo_auditoria enable row level security;
revoke all on public.com_lecturas_campo_auditoria from public, anon, authenticated;
grant select on public.com_lecturas_campo_auditoria to authenticated;
drop policy if exists lecturas_campo_auditoria_select on public.com_lecturas_campo_auditoria;
create policy lecturas_campo_auditoria_select on public.com_lecturas_campo_auditoria for select to authenticated using (
  public.app_puede('Campo comercial', auth.uid()) and exists (
    select 1 from public.com_visitas_campo_sku d join public.com_visitas_campo v on v.id=d.visita_id
    where d.id=registro_id and public.com_puede_ver_cliente_campo(v.cliente_id,auth.uid(),v.fecha_visita)
    and (v.registrado_por=auth.uid() or public.com_es_gerencia_kpi())
  )
);

create or replace function public.com_kpi_campo_auditar_lectura(
  p_registro_id uuid, p_actualizado_en timestamptz, p_datos jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_antes public.com_visitas_campo_sku%rowtype; v_despues public.com_visitas_campo_sku%rowtype;
  v_visita public.com_visitas_campo%rowtype;
  v_campos text[] := array['precio_comercio','precio_afiliado','rotacion_diaria_unidades',
    'venta_diaria_valor','prediccion_venta_unidades','participacion_clase','participacion_subclase',
    'stock_local_unidades','dias_inventario_local','stock_cd_cajas','unidades_por_caja',
    'dias_inventario_cd','cantidad_ultimo_pedido','cantidad_ultimo_despacho','fecha_ultimo_pedido','fecha_ultimo_despacho'];
  v_campo text; v_estado text; v_dato jsonb; v_revision jsonb;
  v_principal jsonb; v_control jsonb; v_base jsonb; v_codigo text; v_local text; v_norm_local text; v_norm_captura text; v_coincidencias integer;
begin
  if auth.uid() is null or not public.app_puede('Campo comercial', auth.uid()) then
    raise exception 'No tienes permiso para auditar lecturas.' using errcode='42501';
  end if;
  select * into v_antes from public.com_visitas_campo_sku where id=p_registro_id for update;
  if not found then raise exception 'El registro de visita ya no existe.'; end if;
  select * into v_visita from public.com_visitas_campo where id=v_antes.visita_id;
  if v_visita.estado <> 'CONFIRMADA' or not public.com_puede_ver_cliente_campo(v_visita.cliente_id,auth.uid(),v_visita.fecha_visita)
    or (v_visita.registrado_por is distinct from auth.uid() and not public.com_es_gerencia_kpi()) then
    raise exception 'Solo el autor o un administrador/gerente autorizado puede auditar esta visita.' using errcode='42501';
  end if;
  if p_actualizado_en is null or v_antes.actualizado_en is distinct from p_actualizado_en then
    raise exception 'Esta visita cambió. Actualiza el dashboard antes de guardar.' using errcode='40001';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(p_datos->'verificacion_campos') is distinct from 'object'
    or coalesce(p_datos->>'version_validacion','') <> '20261013.1' then raise exception 'Falta una verificación válida.'; end if;
  v_revision := p_datos->'verificacion_campos';
  v_principal := p_datos->'lectura_control'->'principal'; v_control := p_datos->'lectura_control'->'control';
  v_base := p_datos - array['verificacion_campos','lectura_control','version_validacion'];
  -- La función existente valida la lista de campos, formatos, permisos y concurrencia.
  if exists (select 1 from jsonb_object_keys(v_base) k where k=any(v_campos) and v_base->k <> 'null'::jsonb)
    or jsonb_array_length(coalesce(v_base->'campos_borrar','[]'::jsonb)) > 0 then
    perform public.com_kpi_campo_completar_lectura(p_registro_id,p_actualizado_en,v_base);
  else
    for v_campo in select jsonb_object_keys(v_base) loop
      if not v_campo=any(v_campos || array['confianza','advertencias','texto_ocr','campos_borrar']) then raise exception 'Campo no autorizado: %',v_campo; end if;
    end loop;
  end if;
  select * into v_despues from public.com_visitas_campo_sku where id=p_registro_id;
  for v_campo,v_dato in select key,value from jsonb_each(v_revision) loop
    if not v_campo=any(v_campos) or jsonb_typeof(v_dato) <> 'object' then raise exception 'Campo de verificación inválido.'; end if;
    v_estado := v_dato->>'estado';
    if v_estado is null or not v_estado=any(array['DOBLE_LECTURA','REVISION_MANUAL','MANUAL_DECLARADO','SIN_DATO','PENDIENTE']) then raise exception 'Estado de verificación inválido.'; end if;
    if v_dato->'valor' is distinct from to_jsonb(v_despues)->v_campo then raise exception 'La verificación no corresponde al valor guardado de %.',v_campo; end if;
    if v_antes.datos_ia->'verificacion_campos'->v_campo->>'estado'=any(array['REVISION_MANUAL','MANUAL_DECLARADO'])
      and v_estado=any(array['DOBLE_LECTURA','SIN_DATO','PENDIENTE']) and to_jsonb(v_antes)->v_campo is distinct from to_jsonb(v_despues)->v_campo then
      raise exception 'No se puede sustituir automáticamente un dato manual declarado.';
    end if;
    if v_estado=any(array['DOBLE_LECTURA','SIN_DATO']) then
      if jsonb_typeof(v_principal) is distinct from 'object' or jsonb_typeof(v_control) is distinct from 'object' then raise exception 'Faltan dos lecturas de evidencia.'; end if;
      select regexp_replace(codigo,'T$','','i') into v_codigo from public.productos where id=v_antes.producto_id;
      select nombre into v_local from public.com_locales_monitoreados where id=v_visita.local_monitoreado_id;
      v_norm_local := regexp_replace(upper(translate(coalesce(v_local,''),'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN')),'[^A-Z0-9]','','g');
      v_norm_captura := regexp_replace(upper(translate(coalesce(v_principal->>'local_nombre',''),'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN')),'[^A-Z0-9]','','g');
      select count(*) into v_coincidencias from public.com_locales_monitoreados l where l.cliente_id=v_visita.cliente_id
        and length(regexp_replace(upper(translate(l.nombre,'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN')),'[^A-Z0-9]','','g')) >= 6
        and (position(v_norm_captura in regexp_replace(upper(translate(l.nombre,'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN')),'[^A-Z0-9]','','g'))>0
          or position(regexp_replace(upper(translate(l.nombre,'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN')),'[^A-Z0-9]','','g') in v_norm_captura)>0);
      if v_codigo is null or v_codigo !~ '^[0-9]{13}$' or v_principal->>'codigo_barras' is distinct from v_codigo or v_control->>'codigo_barras' is distinct from v_codigo
        or length(v_norm_local)<6 or length(v_norm_captura)<6 or v_coincidencias<>1 or (position(v_norm_local in v_norm_captura)=0 and position(v_norm_captura in v_norm_local)=0)
        or v_principal->>'local_nombre' is distinct from v_control->>'local_nombre' then raise exception 'La identidad del local/SKU no coincide con la evidencia.'; end if;
      if coalesce(v_principal->>'fecha_fuente','') <> '' and left(v_principal->>'fecha_fuente',10) <> v_visita.fecha_visita::text then raise exception 'La fecha de la captura no coincide con la visita.'; end if;
      if v_estado='DOBLE_LECTURA' then
        if coalesce((v_principal->>'confianza')::numeric,0)<0.65 or coalesce((v_control->>'confianza')::numeric,0)<0.65
          or v_principal->v_campo is distinct from v_dato->'valor' or v_control->v_campo is distinct from v_dato->'valor' or v_dato->'valor'='null'::jsonb then
          raise exception 'Las dos lecturas no respaldan el valor de %.',v_campo;
        end if;
      elsif not coalesce(v_principal->'campos_sin_dato','[]'::jsonb) ? v_campo or not coalesce(v_control->'campos_sin_dato','[]'::jsonb) ? v_campo then
        raise exception 'No se confirmó que el campo esté sin dato.';
      end if;
    end if;
  end loop;
  -- Un valor modificado requiere su propia verificación, también en una revisión manual.
  foreach v_campo in array v_campos loop
    if to_jsonb(v_antes)->v_campo is distinct from to_jsonb(v_despues)->v_campo and not v_revision ? v_campo then raise exception 'Falta verificación para el campo modificado %.',v_campo; end if;
  end loop;
  update public.com_visitas_campo_sku set datos_ia=coalesce(datos_ia,'{}'::jsonb) || jsonb_build_object(
    'verificacion_campos',coalesce(datos_ia->'verificacion_campos','{}'::jsonb)||v_revision,
    'version_validacion','20261013.1','lectura_control',coalesce(p_datos->'lectura_control','{}'::jsonb),
    'lector_auditado_por',auth.uid(),'lector_auditado_en',clock_timestamp()), actualizado_en=clock_timestamp()
  where id=p_registro_id returning * into v_despues;
  insert into public.com_lecturas_campo_auditoria(registro_id,editado_por,anterior,posterior,evidencia)
    values(p_registro_id,auth.uid(),to_jsonb(v_antes),to_jsonb(v_despues),p_datos);
  return jsonb_build_object('id',p_registro_id,'actualizado_en',v_despues.actualizado_en);
end;
$$;
revoke all on function public.com_kpi_campo_auditar_lectura(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.com_kpi_campo_auditar_lectura(uuid,timestamptz,jsonb) to authenticated;
