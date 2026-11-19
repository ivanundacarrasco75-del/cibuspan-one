begin;
set local lock_timeout='5s';

-- Amplía el guardado versionado para recibir la lista completa de ingredientes.
-- Los clientes anteriores y sus reintentos conservan el contrato por IDs de origen.
do $editar$
declare cambio record; definicion text;
begin
  for cambio in select * from (values
    ($a$  componente public.fm_preformulacion_componentes%rowtype;$a$,
     $d$  componente public.fm_preformulacion_componentes%rowtype;
  materia public.materias_primas_costo_actual%rowtype;
  estructura_completa boolean; orden_linea integer:=0;$d$),
    ($a$  if jsonb_array_length(p_datos->'componentes')<>(select count(*) from public.fm_preformulacion_componentes where formula_version_id=p_origen)
    or exists(select 1 from jsonb_array_elements(p_datos->'componentes') c group by c->>'id' having count(*)>1) then
    raise exception 'La estructura de ingredientes cambió. Recarga la fórmula.';
  end if;$a$,
     $d$  estructura_completa:=p_datos->'estructura_completa'='true'::jsonb;
  if jsonb_array_length(p_datos->'componentes') not between 1 and 500 then
    raise exception 'La fórmula debe tener entre 1 y 500 ingredientes.';
  end if;
  if (not coalesce(estructura_completa,false) and
      jsonb_array_length(p_datos->'componentes')<>(select count(*) from public.fm_preformulacion_componentes where formula_version_id=p_origen))
    or exists(select 1 from jsonb_array_elements(p_datos->'componentes') c where c->>'id' is not null
      group by c->>'id' having count(*)>1) then
    raise exception 'La estructura de ingredientes cambió. Recarga la fórmula.';
  end if;
  if estructura_completa and exists(select 1 from jsonb_array_elements(p_datos->'componentes') c
    group by c->>'materia_prima_id' having count(*)>1 and bool_or(
      c->>'id' is null or not exists(select 1 from public.fm_preformulacion_componentes original
        where original.id=(c->>'id')::uuid and original.formula_version_id=p_origen
          and original.materia_prima_id=(c->>'materia_prima_id')::uuid))) then
    raise exception 'Cada ingrediente debe aparecer una sola vez.';
  end if;$d$),
    ($a$  for datos_componente in select * from jsonb_to_recordset(p_datos->'componentes') as c(id uuid,porcentaje numeric,destino text)
  loop
    select * into componente from public.fm_preformulacion_componentes where id=datos_componente.id and formula_version_id=p_origen;
    if not found then raise exception 'Un ingrediente ya no corresponde a la fórmula seleccionada.'; end if;$a$,
     $d$  for datos_componente in select * from jsonb_to_recordset(p_datos->'componentes')
    as c(id uuid,porcentaje numeric,destino text,materia_prima_id uuid,harina_base boolean)
  loop
    componente:=null;
    if datos_componente.id is not null then
      select * into componente from public.fm_preformulacion_componentes where id=datos_componente.id and formula_version_id=p_origen;
      if not found then raise exception 'Un ingrediente ya no corresponde a la fórmula seleccionada.'; end if;
    elsif not coalesce(estructura_completa,false) then
      raise exception 'Un ingrediente ya no corresponde a la fórmula seleccionada.';
    end if;
    orden_linea:=orden_linea+1;
    if estructura_completa then
      select * into materia from public.materias_primas_costo_actual where id=datos_componente.materia_prima_id;
      if not found or materia.es_empaque then raise exception 'Selecciona una materia prima para cada ingrediente.'; end if;
      if componente.materia_prima_id is distinct from materia.id then
        if not materia.activo then raise exception 'La materia prima % está inactiva.',materia.nombre; end if;
        if materia.unidad_base<>'KG' then raise exception 'Selecciona el artículo de % registrado en KG.',materia.nombre; end if;
        if materia.incluir_en_costeo and (materia.costo_unitario is null or materia.costo_unitario<0) then
          raise exception 'Falta el costo vigente de %.',materia.nombre;
        end if;
        componente.incluir_en_costeo:=materia.incluir_en_costeo;
        componente.observaciones:=null;
      end if;
      if datos_componente.harina_base is null then raise exception 'Revisa las harinas base de la fórmula.'; end if;
      componente.materia_prima_id:=materia.id;
      componente.es_harina_base:=datos_componente.harina_base;
      componente.orden:=orden_linea;
    end if;$d$)
  ) as cambios(anterior,nuevo)
  loop
    definicion:=replace(pg_get_functiondef('public.fm_guardar_formulacion(uuid,uuid,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
    if strpos(definicion,cambio.nuevo)>0 then continue; end if;
    if length(definicion)-length(replace(definicion,cambio.anterior,''))<>length(cambio.anterior) then
      raise exception 'La definición instalada de formulación requiere revisión.';
    end if;
    execute replace(definicion,cambio.anterior,cambio.nuevo);
  end loop;
end $editar$;
notify pgrst,'reload schema';
commit;
