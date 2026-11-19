begin;
set local lock_timeout='5s';

create table public.fm_micro_automatico (
  formula_id uuid primary key references public.fm_formulas(id) on delete cascade,
  micro_id uuid not null unique references public.fm_micros(id) on delete restrict
);
alter table public.fm_micro_automatico enable row level security;
revoke all on public.fm_micro_automatico from public,anon,authenticated,service_role;

create function public.fm_micro_para_formula(p_formula uuid,p_corto text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare micro uuid; nombre text;
begin
  select micro_id into micro from public.fm_micro_automatico where formula_id=p_formula;
  if found then return micro; end if;
  nombre:='MICRO '||upper(trim(p_corto));
  if p_corto is null or length(trim(p_corto))=0 then raise exception 'Completa el nombre corto para generar el micro.'; end if;
  insert into public.fm_micros(codigo,nombre,descripcion,activo,creado_por)
    values('FM-'||p_formula::text,nombre,'Micro calculado por versión de fórmula',true,auth.uid()) returning id into micro;
  insert into public.fm_micro_automatico(formula_id,micro_id) values(p_formula,micro);
  return micro;
end $$;
revoke all on function public.fm_micro_para_formula(uuid,text) from public,anon,authenticated,service_role;

-- Conserva el RPC y sus comprobantes para altas previas. Las nuevas altas envían
-- peso de bola y destino DIRECTO/MICRO, calculados y comprobados también en SQL.
do $alta$
declare cambio record; definicion text;
begin
  for cambio in select * from (values
    ($a$  producto uuid; formula uuid; version uuid;$a$,
     $d$  producto uuid; formula uuid; version uuid; micro_auto uuid; peso_bola numeric;$d$),
    ($a$  peso:=(p_datos->>'peso_batch_kg')::numeric;$a$,
     $d$  peso:=(p_datos->>'peso_batch_kg')::numeric;
  if p_datos ? 'peso_bola_g' then
    peso_bola:=(p_datos->>'peso_bola_g')::numeric;
    if peso_bola is null or peso_bola<=0 or peso_bola>1000000 then raise exception 'Completa el peso de bola positivo.'; end if;
    peso:=round(panes*peso_bola/1000,4);
  end if;$d$),
    ($a$  for ingrediente in select * from jsonb_to_recordset(p_datos->'ingredientes')
    as i(materia_prima_id uuid,porcentaje numeric,harina_base boolean,micro_id uuid)$a$,
     $d$  if exists(select 1 from jsonb_array_elements(p_datos->'ingredientes') i where i->>'destino'='MICRO') then
    micro_auto:=public.fm_micro_para_formula(formula,corto);
  end if;
  if exists(select 1 from jsonb_array_elements(p_datos->'ingredientes') i
    where i ? 'destino' and coalesce(i->>'destino','') not in ('DIRECTO','MICRO')) then
    raise exception 'El destino debe ser Directo o Micro.';
  end if;
  for ingrediente in select * from jsonb_to_recordset(p_datos->'ingredientes')
    as i(materia_prima_id uuid,porcentaje numeric,harina_base boolean,micro_id uuid,destino text)$d$),
    ($a$    numero:=numero+1;$a$,
     $d$    if ingrediente.destino is not null then
      ingrediente.micro_id:=case when ingrediente.destino='MICRO' then micro_auto else null end;
      if ingrediente.harina_base is true and ingrediente.micro_id is not null then
        raise exception 'La harina base debe incorporarse directamente.';
      end if;
    end if;
    numero:=numero+1;$d$)
  ) as cambios(anterior,nuevo)
  loop
    definicion:=replace(pg_get_functiondef('public.fm_crear_producto_formula(uuid,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
    if strpos(definicion,cambio.nuevo)>0 then continue; end if;
    if length(definicion)-length(replace(definicion,cambio.anterior,''))<>length(cambio.anterior) then
      raise exception 'La definición del alta de producto requiere revisión.';
    end if;
    execute replace(definicion,cambio.anterior,cambio.nuevo);
  end loop;
end $alta$;

create table public.fm_guardados_formulacion (
  solicitud_id uuid primary key,
  actor uuid not null,
  origen_id uuid not null,
  datos jsonb not null,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.fm_guardados_formulacion enable row level security;
revoke all on public.fm_guardados_formulacion from public,anon,authenticated,service_role;

create function public.fm_guardar_formulacion(p_solicitud uuid,p_origen uuid,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  previo public.fm_guardados_formulacion%rowtype;
  origen public.fm_formula_versiones%rowtype;
  formula public.fm_formulas%rowtype;
  componente public.fm_preformulacion_componentes%rowtype;
  datos_componente record;
  nueva uuid; micro uuid; vigente_anterior uuid; corto text; numero integer; panes integer; rendimiento integer;
  peso_bola numeric; peso_final numeric; peso numeric; fecha date; hoy date;
  nombre text; observaciones text; resultado jsonb;
begin
  perform public.app_exigir_operacion(array['Producción','Administración']);
  if auth.uid() is null or p_solicitud is null or p_origen is null then raise exception 'Falta la sesión o la solicitud.' using errcode='42501'; end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('cibuspan.catalogo.formulas',0));
  select * into previo from public.fm_guardados_formulacion where solicitud_id=p_solicitud;
  if found then
    if previo.actor<>auth.uid() then raise exception 'La solicitud pertenece a otro usuario.' using errcode='42501'; end if;
    if previo.origen_id<>p_origen or previo.datos is distinct from p_datos then raise exception 'La solicitud tiene otros datos.'; end if;
    if not exists(select 1 from public.fm_formula_versiones where id=(previo.resultado->>'version_id')::uuid) then
      raise exception 'La versión se guardó y posteriormente fue eliminada desde el catálogo. Revisa sus versiones.';
    end if;
    return previo.resultado;
  end if;
  lock table public.fm_formulas,public.fm_formula_versiones,public.fm_preformulacion_componentes,
    public.fm_formula_productos in share row exclusive mode;
  select * into origen from public.fm_formula_versiones where id=p_origen;
  if not found then raise exception 'La versión de origen ya no existe. Actualiza las fórmulas.'; end if;
  select * into formula from public.fm_formulas where id=origen.formula_id;
  if not formula.activo then raise exception 'La fórmula está bloqueada.'; end if;
  if p_datos->>'origen_actualizado_en' is not null and
    (p_datos->>'origen_actualizado_en')::timestamptz is distinct from origen.actualizado_en then
    raise exception 'La versión de origen cambió. Actualiza antes de crear una nueva versión.';
  end if;
  nombre:=trim(p_datos->>'nombre');
  if nombre is null or length(nombre) not between 1 and 120 or nombre ~ E'[\r\n]' then raise exception 'Ingresa un nombre de versión válido.'; end if;
  if exists(select 1 from public.fm_formula_versiones v where v.formula_id=formula.id
    and lower(split_part(v.observaciones,E'\n',1))=lower('Nombre de versión: '||nombre)) then
    raise exception 'Ya existe una versión con ese nombre.';
  end if;
  hoy:=(now() at time zone 'America/Bogota')::date;
  fecha:=(p_datos->>'fecha')::date;
  if fecha is null or fecha<hoy or ((p_datos->>'activar')::boolean is true and fecha<>hoy) then
    raise exception 'Una nueva versión vigente comienza hoy. Usa borrador para preparar una fecha posterior.';
  end if;
  panes:=(p_datos->>'panes')::integer;
  rendimiento:=(p_datos->>'rendimiento')::integer;
  peso_bola:=(p_datos->>'peso_bola_g')::numeric;
  peso_final:=(p_datos->>'peso_final_g')::numeric;
  peso:=round(panes*peso_bola/1000,4);
  if panes is null or panes<=0 or rendimiento is null or rendimiento<=0 or peso_bola is null or peso_bola<=0
    or peso_bola>1000000 or peso_final is null or peso_final<=0 or peso_final>1000000 or peso<=0 or peso>1000000 then
    raise exception 'Revisa unidades por parada, rendimiento, peso de bola y peso final.';
  end if;
  if jsonb_typeof(p_datos->'componentes') is distinct from 'array' then raise exception 'Completa los ingredientes de la fórmula.'; end if;
  if jsonb_array_length(p_datos->'componentes')<>(select count(*) from public.fm_preformulacion_componentes where formula_version_id=p_origen)
    or exists(select 1 from jsonb_array_elements(p_datos->'componentes') c group by c->>'id' having count(*)>1) then
    raise exception 'La estructura de ingredientes cambió. Recarga la fórmula.';
  end if;
  select p.corto into corto from public.fm_formula_productos r join public.productos p on p.id=r.producto_id
    where r.formula_id=formula.id and r.activo order by p.creado_en,p.id limit 1;
  if exists(select 1 from jsonb_array_elements(p_datos->'componentes') c where c->>'destino'='MICRO') then
    micro:=public.fm_micro_para_formula(formula.id,coalesce(corto,formula.nombre));
  end if;
  select coalesce(max(numero_version),0)+1 into numero from public.fm_formula_versiones where formula_id=formula.id;
  observaciones:='Nombre de versión: '||nombre||E'\nFecha de modificación: '||fecha||E'\n'
    ||regexp_replace(coalesce(origen.observaciones,''),E'^Nombre de versión: [^\n]*\nFecha de modificación: [^\n]*\n?','');
  insert into public.fm_formula_versiones(formula_id,numero_version,estado,panes_por_batch,peso_bola_g,peso_final_g,
    peso_batch_kg,rendimiento_unidades,paradas_por_batch,merma_porcentaje,observaciones,creado_por)
    values(formula.id,numero,'BORRADOR',panes,peso_bola,peso_final,peso,rendimiento,1,origen.merma_porcentaje,observaciones,auth.uid())
    returning id into nueva;
  for datos_componente in select * from jsonb_to_recordset(p_datos->'componentes') as c(id uuid,porcentaje numeric,destino text)
  loop
    select * into componente from public.fm_preformulacion_componentes where id=datos_componente.id and formula_version_id=p_origen;
    if not found then raise exception 'Un ingrediente ya no corresponde a la fórmula seleccionada.'; end if;
    if datos_componente.porcentaje is null or datos_componente.porcentaje<0 or datos_componente.porcentaje>100000
      or datos_componente.porcentaje<>round(datos_componente.porcentaje,6)
      or datos_componente.destino is null or datos_componente.destino not in ('DIRECTO','MICRO') then
      raise exception 'Revisa los porcentajes y el destino Directo/Micro.';
    end if;
    if componente.es_harina_base and datos_componente.destino='MICRO' then raise exception 'La harina base debe incorporarse directamente.'; end if;
    insert into public.fm_preformulacion_componentes(formula_version_id,materia_prima_id,porcentaje_panadero,destino_tipo,
      micro_id,es_harina_base,incluir_en_costeo,orden,observaciones)
      values(nueva,componente.materia_prima_id,datos_componente.porcentaje,datos_componente.destino,
        case when datos_componente.destino='MICRO' then micro else null end,componente.es_harina_base,
        componente.incluir_en_costeo,componente.orden,componente.observaciones);
  end loop;
  if not exists(select 1 from public.fm_validar_version(nueva) where es_valida) then
    raise exception 'Revisa la fórmula. Las harinas base deben sumar 100%%.';
  end if;
  if (p_datos->>'activar')::boolean is true then
    select id into vigente_anterior from public.fm_formula_versiones where formula_id=formula.id and estado='VIGENTE';
    perform public.fm_activar_version(nueva);
    update public.fm_formula_versiones set vigente_desde=hoy where id=nueva;
    update public.fm_formula_versiones set vigente_hasta=hoy where id=vigente_anterior;
  end if;
  resultado:=jsonb_build_object('version_id',nueva,'numero_version',numero,'micro_id',micro,'peso_batch_kg',peso);
  insert into public.fm_guardados_formulacion(solicitud_id,actor,origen_id,datos,resultado)
    values(p_solicitud,auth.uid(),p_origen,p_datos,resultado);
  return resultado;
end $$;
revoke all on function public.fm_guardar_formulacion(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fm_guardar_formulacion(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
