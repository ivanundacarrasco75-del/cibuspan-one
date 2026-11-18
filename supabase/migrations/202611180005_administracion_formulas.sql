begin;
set local lock_timeout='5s';

create table public.fm_acciones_catalogo (
  solicitud_id uuid primary key,
  actor uuid not null,
  accion text not null,
  objeto_id uuid not null,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
);
alter table public.fm_acciones_catalogo enable row level security;
revoke all on public.fm_acciones_catalogo from public,anon,authenticated,service_role;

-- Todas las vistas de recetas y costos FM con fórmula identificada respetan su estado.
-- Conserva columnas, cálculos, dependencias y permisos de cada vista.
do $vistas$
declare vista record; definicion text; comentario text;
begin
  for vista in
    select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v' and c.relname like 'fm\_vw\_%' escape '\'
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='formula_id' and not a.attisdropped)
  loop
    comentario:=obj_description(vista.oid,'pg_class');
    if strpos(coalesce(comentario,''),'cibuspan-formulas-bloqueo-v1')>0 then continue; end if;
    definicion:=regexp_replace(pg_get_viewdef(vista.oid,true),';[[:space:]]*$','');
    execute format('create or replace view public.%I as select contenido.* from (%s) contenido
      where exists(select 1 from public.fm_formulas catalogo where catalogo.id=contenido.formula_id and catalogo.activo)',
      vista.relname,definicion);
    execute format('comment on view public.%I is %L',vista.relname,
      concat_ws(E'\n',comentario,'cibuspan-formulas-bloqueo-v1'));
  end loop;
end $vistas$;

create function public.fm_administrar_catalogo(p_solicitud uuid,p_accion text,p_objeto uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  anterior public.fm_acciones_catalogo%rowtype;
  formula public.fm_formulas%rowtype;
  version public.fm_formula_versiones%rowtype;
  resultado jsonb;
begin
  perform public.app_exigir_operacion(array['Administración']);
  if auth.uid() is null or p_solicitud is null or p_objeto is null then raise exception 'Falta la sesión o la solicitud.' using errcode='42501'; end if;
  if p_accion is null or p_accion not in ('BLOQUEAR','DESBLOQUEAR','ELIMINAR_FORMULA','ELIMINAR_VERSION') then
    raise exception 'Acción de catálogo inválida.';
  end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('cibuspan.catalogo.formulas',0));
  select * into anterior from public.fm_acciones_catalogo where solicitud_id=p_solicitud;
  if found then
    if anterior.actor<>auth.uid() then raise exception 'La solicitud pertenece a otro usuario.' using errcode='42501'; end if;
    if anterior.accion<>p_accion or anterior.objeto_id<>p_objeto then raise exception 'La solicitud tiene otros datos.'; end if;
    return anterior.resultado;
  end if;

  -- Serializa activaciones y cambios de receta con las acciones de catálogo.
  lock table public.fm_formulas,public.fm_formula_versiones,public.fm_preformulacion_componentes,
    public.fm_formula_productos in share row exclusive mode;
  if p_accion='ELIMINAR_VERSION' then
    select * into version from public.fm_formula_versiones where id=p_objeto for update;
    if not found then raise exception 'No se encontró la versión. Actualiza el listado.'; end if;
    select * into formula from public.fm_formulas where id=version.formula_id for update;
    -- El trigger de componentes permite retirar una versión en borrador.
    -- La transición y la eliminación se realizan en la misma transacción.
    update public.fm_formula_versiones set estado='BORRADOR' where id=p_objeto;
    delete from public.fm_preformulacion_componentes where formula_version_id=p_objeto;
    delete from public.fm_formula_versiones where id=p_objeto;
  else
    select * into formula from public.fm_formulas where id=p_objeto for update;
    if not found then raise exception 'No se encontró la fórmula. Actualiza el listado.'; end if;
    if p_accion='ELIMINAR_FORMULA' then
      update public.fm_formula_versiones set estado='BORRADOR' where formula_id=p_objeto;
      delete from public.fm_preformulacion_componentes where formula_version_id in (
        select id from public.fm_formula_versiones where formula_id=p_objeto);
      delete from public.fm_formula_versiones where formula_id=p_objeto;
      delete from public.fm_formula_productos where formula_id=p_objeto;
      delete from public.fm_formulas where id=p_objeto;
    else
      update public.fm_formulas set activo=(p_accion='DESBLOQUEAR') where id=p_objeto;
    end if;
  end if;
  resultado:=jsonb_build_object('accion',p_accion,'objeto_id',p_objeto,'formula_id',formula.id,
    'codigo',formula.codigo,'nombre',formula.nombre,'version',version.numero_version);
  insert into public.fm_acciones_catalogo(solicitud_id,actor,accion,objeto_id,resultado)
    values(p_solicitud,auth.uid(),p_accion,p_objeto,resultado);
  return resultado;
end $$;
revoke all on function public.fm_administrar_catalogo(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fm_administrar_catalogo(uuid,text,uuid) to authenticated;

-- Un guardado atrasado debe informar que su fórmula fue eliminada, conservando el comprobante.
do $alta$
declare definicion text; anterior text; nuevo text;
begin
  anterior:='    return anterior.resultado;';
  nuevo:='    if not exists(select 1 from public.fm_formulas where id=(anterior.resultado->>''formula_id'')::uuid) then
      raise exception ''El producto fue creado, pero su fórmula se eliminó desde Administración. Revisa el catálogo.'';
    end if;
    return anterior.resultado;';
  definicion:=replace(pg_get_functiondef('public.fm_crear_producto_formula(uuid,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
  if strpos(definicion,nuevo)=0 then
    if length(definicion)-length(replace(definicion,anterior,''))<>length(anterior) then
      raise exception 'La definición del alta de producto requiere revisión.';
    end if;
    execute replace(definicion,anterior,nuevo);
  end if;
end $alta$;

notify pgrst,'reload schema';
commit;
