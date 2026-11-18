begin;
set local lock_timeout='5s';

create table public.fm_altas_producto (
  solicitud_id uuid primary key,
  actor uuid not null,
  datos jsonb not null,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.fm_altas_producto enable row level security;
revoke all on public.fm_altas_producto from public,anon,authenticated,service_role;

create function public.fm_crear_producto_formula(p_solicitud uuid,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  anterior public.fm_altas_producto%rowtype;
  producto uuid; formula uuid; version uuid;
  v_codigo text; nombre text; corto text; descripcion text;
  panes integer; rendimiento integer; vida integer; peso numeric; peso_final numeric;
  ingrediente record; empaque record; articulo public.materias_primas_costo_actual%rowtype;
  costo record; resultado jsonb; numero integer:=0; base numeric:=0;
begin
  perform public.app_exigir_operacion(array['Administración']);
  perform public.app_exigir_operacion(array['Producción','Administración']);
  if auth.uid() is null or p_solicitud is null then raise exception 'Inicia sesión para crear el producto.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cibuspan.alta.producto.'||p_solicitud::text,0));
  select * into anterior from public.fm_altas_producto where solicitud_id=p_solicitud;
  if found then
    if anterior.actor<>auth.uid() then raise exception 'La solicitud pertenece a otro usuario.' using errcode='42501'; end if;
    if anterior.datos is distinct from p_datos then raise exception 'El intento guardado tiene otros datos.'; end if;
    return anterior.resultado;
  end if;

  v_codigo:=upper(trim(p_datos->>'codigo'));
  nombre:=upper(trim(p_datos->>'nombre'));
  corto:=trim(p_datos->>'corto');
  descripcion:=nullif(trim(p_datos->>'descripcion'),'');
  if v_codigo is null or length(v_codigo) not between 1 and 100 or nombre is null or length(nombre) not between 1 and 200
    or corto is null or length(corto) not between 1 and 100 or coalesce(length(descripcion),0)>2000 then
    raise exception 'Completa código, nombre y nombre corto del producto.';
  end if;
  panes:=(p_datos->>'panes')::integer;
  rendimiento:=(p_datos->>'rendimiento')::integer;
  vida:=(p_datos->>'vida_util')::integer;
  peso:=(p_datos->>'peso_batch_kg')::numeric;
  peso_final:=(p_datos->>'peso_final_g')::numeric;
  if panes is null or panes<=0 or rendimiento is null or rendimiento<=0 or vida is null or vida<=0
    or peso is null or peso<=0 or peso>1000000 or peso_final is null or peso_final<=0 or peso_final>1000000 then
    raise exception 'Completa las unidades por parada, el rendimiento, la vida útil y los pesos positivos.';
  end if;
  if jsonb_typeof(p_datos->'ingredientes') is distinct from 'array'
    or jsonb_array_length(p_datos->'ingredientes') not between 1 and 500
    or jsonb_typeof(p_datos->'empaques') is distinct from 'array' or jsonb_array_length(p_datos->'empaques')>100 then
    raise exception 'Agrega ingredientes a la fórmula y revisa los empaques.';
  end if;
  if exists(select 1 from public.productos where upper(trim(productos.codigo))=v_codigo)
    or exists(select 1 from public.fm_formulas where upper(trim(fm_formulas.codigo))=v_codigo) then
    raise exception 'El código ya existe en Productos o Fórmulas. Usa un código nuevo.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_datos->'ingredientes') i group by i->>'materia_prima_id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(p_datos->'empaques') e group by e->>'materia_prima_id' having count(*)>1) then
    raise exception 'Cada ingrediente o empaque debe aparecer una sola vez.';
  end if;

  -- Mantiene coherentes los precios del catálogo durante el cálculo y la activación.
  lock table public.materias_primas,public.materia_prima_costos in share mode;
  insert into public.productos(codigo,nombre,corto,lote_produccion,tamano_lote,vida_util_dias,activo)
    values(v_codigo,nombre,corto,rendimiento,rendimiento,vida,true) returning id into producto;
  insert into public.fm_formulas(codigo,nombre,descripcion,creado_por)
    values(v_codigo,nombre,descripcion,auth.uid()) returning id into formula;
  insert into public.fm_formula_versiones(formula_id,numero_version,estado,panes_por_batch,peso_bola_g,peso_final_g,
    peso_batch_kg,rendimiento_unidades,paradas_por_batch,merma_porcentaje,creado_por)
    values(formula,1,'BORRADOR',panes,peso*1000/panes,peso_final,peso,rendimiento,1,0,auth.uid()) returning id into version;
  for ingrediente in select * from jsonb_to_recordset(p_datos->'ingredientes')
    as i(materia_prima_id uuid,porcentaje numeric,harina_base boolean,micro_id uuid)
  loop
    select * into articulo from public.materias_primas_costo_actual where id=ingrediente.materia_prima_id;
    if not found or not articulo.activo or articulo.es_empaque then raise exception 'Selecciona ingredientes activos del catálogo de materias primas.'; end if;
    if articulo.unidad_base<>'KG' then
      raise exception 'El ingrediente % usa %. La fórmula por peso requiere un artículo en KG.',articulo.nombre,articulo.unidad_base;
    end if;
    if ingrediente.porcentaje is null or ingrediente.porcentaje<=0 or ingrediente.porcentaje>100000
      or ingrediente.porcentaje<>round(ingrediente.porcentaje,6) then raise exception 'Revisa el porcentaje de % (hasta seis decimales).',articulo.nombre; end if;
    if articulo.incluir_en_costeo and (articulo.costo_unitario is null or articulo.costo_unitario<0) then
      raise exception 'Falta el costo vigente de %. Actualiza su costo en Materias primas.',articulo.nombre;
    end if;
    if ingrediente.harina_base is true then
      base:=base+ingrediente.porcentaje;
      if ingrediente.micro_id is not null then raise exception 'La harina base debe incorporarse directamente.'; end if;
    end if;
    numero:=numero+1;
    insert into public.fm_preformulacion_componentes(formula_version_id,materia_prima_id,porcentaje_panadero,
      destino_tipo,micro_id,es_harina_base,incluir_en_costeo,orden)
      values(version,articulo.id,ingrediente.porcentaje,case when ingrediente.micro_id is null then 'DIRECTO' else 'MICRO' end,
        ingrediente.micro_id,coalesce(ingrediente.harina_base,false),articulo.incluir_en_costeo,numero);
  end loop;
  if abs(base-100)>0.000001 then raise exception 'Las harinas base deben sumar 100%%.'; end if;

  for empaque in select * from jsonb_to_recordset(p_datos->'empaques') as e(materia_prima_id uuid,cantidad numeric)
  loop
    select * into articulo from public.materias_primas_costo_actual where id=empaque.materia_prima_id;
    if not found or not articulo.activo or not articulo.es_empaque then raise exception 'Selecciona empaques activos del catálogo.'; end if;
    if empaque.cantidad is null or empaque.cantidad<=0 or empaque.cantidad>1000000
      or empaque.cantidad<>round(empaque.cantidad,6) then raise exception 'Revisa la cantidad por unidad de cada empaque (hasta seis decimales).'; end if;
    if articulo.incluir_en_costeo and (articulo.costo_unitario is null or articulo.costo_unitario<0) then
      raise exception 'Falta el costo vigente del empaque %.',articulo.nombre;
    end if;
    insert into public.fm_producto_empaques(producto_id,materia_prima_id,cantidad_por_unidad)
      values(producto,articulo.id,empaque.cantidad);
  end loop;
  insert into public.fm_formula_productos(formula_id,producto_id,activo) values(formula,producto,true);
  perform public.fm_activar_version(version);
  select * into costo from public.fm_vw_productos_costo_completo
    where producto_id=producto and formula_version_id=version;
  if not found or costo.items_sin_costo is distinct from 0 or costo.costo_materia_prima_unidad is null
    or costo.costo_materiales_unidad is null then raise exception 'No se pudo obtener el costo completo del producto. Revisa su fórmula.'; end if;
  resultado:=jsonb_build_object('producto_id',producto,'formula_id',formula,'version_id',version,
    'codigo',v_codigo,'nombre',nombre,'costo_materia_prima_unidad',costo.costo_materia_prima_unidad,
    'costo_empaque_unidad',costo.costo_empaque_unidad,'costo_materiales_unidad',costo.costo_materiales_unidad);
  insert into public.fm_altas_producto(solicitud_id,actor,datos,resultado) values(p_solicitud,auth.uid(),p_datos,resultado);
  return resultado;
end $$;

revoke all on function public.fm_crear_producto_formula(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fm_crear_producto_formula(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
