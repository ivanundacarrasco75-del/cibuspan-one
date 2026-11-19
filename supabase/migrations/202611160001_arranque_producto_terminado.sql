begin;
set local lock_timeout='5s';

-- Reutiliza el cierre, la idempotencia y la conciliación del arranque instalado.
-- Cada cambio exige encontrar el fragmento esperado y conserva firma, propietario y permisos.
do $alcance$
declare
 cambio record;
 firma regprocedure;
 definicion text;
begin
 for cambio in
   select nombre, antes, despues from (values
     (array['inv_arranque_plan(jsonb,date,jsonb)'],
      $antes$ foreach grupo in array array['mp','pt','semi'] loop$antes$,
      $despues$ if p_datos ? 'alcance' and p_datos->'alcance' is distinct from '"PT"'::jsonb then
   raise exception 'Alcance de conteo inválido.';
 end if;
 if p_datos->>'alcance'='PT' and
   (p_datos->'mp' is distinct from '[]'::jsonb or p_datos->'semi' is distinct from '[]'::jsonb
    or jsonb_array_length(p_base->'pt')=0) then
   raise exception 'La toma física de PT requiere productos en el catálogo y solo admite conteos de producto terminado.';
 end if;
 foreach grupo in array (case when p_datos->>'alcance'='PT' then array['pt'] else array['mp','pt','semi'] end) loop$despues$),

     (array['inv_arranque_prever(date,jsonb)', 'inv_arranque_confirmar(uuid,date,jsonb,text,boolean,boolean,uuid)'],
      $antes$bloqueos:=public.inv_arranque_bloqueos(b,p_inicio);$antes$,
      $despues$bloqueos:=public.inv_arranque_bloqueos(
   case when p_conteos->>'alcance'='PT' then
     (b-'lotes_semi') || jsonb_build_object('movimientos',(
       select coalesce(jsonb_agg(m),'[]'::jsonb)
       from jsonb_array_elements(b->'movimientos') m where m->>'tipo'='PRODUCTO_TERMINADO'
     ))
   else b end,p_inicio);$despues$),

     (array['inv_arranque_confirmar(uuid,date,jsonb,text,boolean,boolean,uuid)'],
      $antes$ for x in select value from jsonb_array_elements(b->'lotes_semi') loop$antes$,
      $despues$ for x in select value from jsonb_array_elements(b->'lotes_semi')
   where (p_conteos->>'alcance') is distinct from 'PT' loop$despues$),

     (array['inv_arranque_estado()'],
      $antes$'id',c.solicitud_id,'fecha_inicio'$antes$,
      $despues$'permite_solo_pt',true,'alcance',case when c.datos->'conteos'->>'alcance'='PT' then 'PT' else 'COMPLETO' end,
   'id',c.solicitud_id,'fecha_inicio'$despues$),

     (array['inv_arranque_proteger()'],
      $antes$ if TG_OP<>'DELETE' then j:=to_jsonb(new); end if;$antes$,
      $despues$ if TG_OP<>'DELETE' then j:=to_jsonb(new); end if;
 if c.datos->'conteos'->>'alcance'='PT' and (
   TG_TABLE_NAME='inventario_semielaborados' or
   (TG_TABLE_NAME='inv_kardex_movimientos'
     and (TG_OP='INSERT' or anterior->>'tipo'='MATERIA_PRIMA')
     and (TG_OP='DELETE' or j->>'tipo'='MATERIA_PRIMA'))
 ) then
   if TG_OP='DELETE' then return old; else return new; end if;
 end if;$despues$),

     (array['inv_arranque_iniciar_mp()'],
      $antes$ select fecha_cierre into cierre from public.inv_arranque_cortes where estado='APLICADO';$antes$,
      $despues$ select fecha_cierre into cierre from public.inv_arranque_cortes
 where estado='APLICADO' and (datos->'conteos'->>'alcance') is distinct from 'PT';$despues$),

     (array['inv_kardex_validar_mp(uuid)'],
      $antes$ SELECT fecha_inicio INTO v_inicio FROM public.inv_arranque_cortes WHERE estado='APLICADO';$antes$,
      $despues$ SELECT fecha_inicio INTO v_inicio FROM public.inv_arranque_cortes
 WHERE estado='APLICADO' AND (datos->'conteos'->>'alcance') IS DISTINCT FROM 'PT';$despues$),

     (array['inv_inicio_proteger_fecha()'],
      $antes$WHERE fecha_cierre=NEW.fecha AND (estado='APLICADO' OR public.inv_arranque_en_curso())$antes$,
      $despues$WHERE fecha_cierre=NEW.fecha AND (datos->'conteos'->>'alcance') IS DISTINCT FROM 'PT'
     AND (estado='APLICADO' OR public.inv_arranque_en_curso())$despues$)
   ) as cambios(nombres, antes, despues)
   cross join lateral unnest(cambios.nombres) as funciones(nombre)
 loop
   firma := to_regprocedure('public.' || cambio.nombre);
   if firma is null then raise exception 'Falta la función de arranque %.', cambio.nombre; end if;
   definicion := pg_get_functiondef(firma);
   if strpos(definicion,cambio.despues)>0 then continue; end if;
   if length(definicion)-length(replace(definicion,cambio.antes,'')) <> length(cambio.antes) then
     raise exception 'La definición instalada de % requiere revisión.', cambio.nombre;
   end if;
   execute replace(definicion,cambio.antes,cambio.despues);
 end loop;
end $alcance$;

-- La restauración recuperó permisos directos sobre estas tablas privadas.
-- Los RPC conservan su acceso mediante sus propietarios.
revoke truncate, references, trigger on public.inv_arranque_cortes, public.inv_arranque_solicitudes,
  public.pro_consumos_detalle from authenticated, service_role;

notify pgrst,'reload schema';
commit;
