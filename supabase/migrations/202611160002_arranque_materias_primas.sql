begin;
set local lock_timeout='5s';

-- El corte usado por logística sigue siendo el de PT o el arranque completo.
create table if not exists public.inv_arranque_corte_mp (
  unico boolean primary key default true check (unico),
  solicitud_id uuid not null unique references public.inv_arranque_solicitudes(id),
  actor uuid not null,
  fecha_inicio date not null,
  fecha_cierre date not null check (fecha_cierre=fecha_inicio-1),
  transaccion bigint not null default txid_current(),
  datos jsonb not null,
  base jsonb not null,
  resumen jsonb not null,
  aplicado_en timestamptz
);
alter table public.inv_arranque_corte_mp enable row level security;
revoke all on public.inv_arranque_corte_mp from public,anon,authenticated,service_role;

create or replace function public.inv_arranque_cierre_mp()
returns date language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(
    (select fecha_cierre from public.inv_arranque_corte_mp where aplicado_en is not null),
    (select fecha_cierre from public.inv_arranque_cortes
      where estado='APLICADO' and (datos->'conteos'->>'alcance') is distinct from 'PT')
  );
$$;

create or replace function public.inv_arranque_mp_en_curso()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.inv_arranque_corte_mp
    where aplicado_en is null and transaccion=txid_current() and actor=auth.uid());
$$;

create or replace function public.inv_arranque_revision_mp(p_inicio date,p_conteos jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare b jsonb; base_mp jsonb; plan jsonb; bloqueos jsonb:='[]';
begin
  perform public.inv_arranque_admin();
  if public.inv_arranque_cierre_mp() is not null then
    raise exception 'El saldo inicial de materias primas y empaques ya fue confirmado.';
  end if;
  if p_conteos->>'alcance' is distinct from 'MP' or p_conteos->'pt' is distinct from '[]'::jsonb
    or p_conteos->'semi' is distinct from '[]'::jsonb then
    raise exception 'Este corte solo admite materias primas y empaques.';
  end if;

  b:=public.inv_arranque_base();
  if jsonb_array_length(b->'mp')=0 then raise exception 'El catálogo de materias primas y empaques está vacío.'; end if;
  base_mp:=jsonb_build_object('hoy',b->'hoy','mp',b->'mp','pt','[]'::jsonb,'semi','[]'::jsonb,
    'movimientos',(select coalesce(jsonb_agg(m),'[]'::jsonb)
      from jsonb_array_elements(b->'movimientos') m where m->>'tipo'='MATERIA_PRIMA'));
  plan:=public.inv_arranque_plan(base_mp,p_inicio,p_conteos-'alcance');
  if exists(select 1 from jsonb_array_elements(base_mp->'movimientos') m where (m->>'fecha')::date>=p_inicio) then
    bloqueos:=jsonb_build_array('Ya hay entradas o consumos de materiales desde la fecha de inicio. Revisa el cierre anterior y elige una fecha que incluya esos movimientos.');
  end if;
  return plan||jsonb_build_object('token',md5(jsonb_build_object('base',base_mp,'inicio',p_inicio,'conteos',p_conteos)::text),
    'bloqueos',bloqueos,'puede_aplicar',jsonb_array_length(bloqueos)=0,'fecha_inicio',p_inicio,'fecha_cierre',p_inicio-1,'base',base_mp);
end $$;

create or replace function public.inv_arranque_prever_mp(p_inicio date,p_conteos jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select public.inv_arranque_revision_mp(p_inicio,p_conteos)-'base';
$$;

create or replace function public.inv_arranque_confirmar_mp(p_solicitud uuid,p_inicio date,p_conteos jsonb,
  p_token text,p_conteo_completo boolean,p_usuario uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  s public.inv_arranque_solicitudes%rowtype;
  datos jsonb; revision jsonb; resumen jsonb; v_resultado jsonb; g jsonb; articulo uuid;
  saldo numeric; objetivo numeric; responsable text; cierre date;
begin
  perform public.inv_arranque_admin();
  if p_solicitud is null or auth.uid() is distinct from p_usuario then
    raise exception 'La sesión cambió o falta la solicitud.' using errcode='42501';
  end if;
  if p_conteo_completo is distinct from true then raise exception 'Confirma el conteo completo.'; end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('cibuspan.arranque.operativo',0));
  datos:=jsonb_build_object('inicio',p_inicio,'conteos',p_conteos);
  select * into s from public.inv_arranque_solicitudes where id=p_solicitud for update;
  if found then
    if s.actor<>auth.uid() then raise exception 'La solicitud pertenece a otro usuario.' using errcode='42501'; end if;
    if s.estado='ANULADO' then raise exception 'Este intento quedó cerrado sin aplicar. Genera otra vista previa.'; end if;
    if s.estado<>'APLICADO' or s.datos is distinct from datos then raise exception 'El intento tiene otros datos o requiere revisión.'; end if;
    return s.resultado||jsonb_build_object('repetido',true);
  end if;

  lock table public.materias_primas,public.inv_kardex_movimientos in exclusive mode;
  revision:=public.inv_arranque_revision_mp(p_inicio,p_conteos);
  if p_token is null or p_token<>revision->>'token' then
    raise exception 'El inventario o el catálogo de materiales cambió desde la vista previa. Actualiza y revisa de nuevo.';
  end if;
  if not (revision->>'puede_aplicar')::boolean then raise exception '%',revision->'bloqueos'->>0; end if;
  cierre:=p_inicio-1;
  resumen:=jsonb_build_object('lineas',revision->'lineas','avisos',revision->'avisos');
  select nombre into responsable from public.app_profiles where user_id=auth.uid();

  insert into public.inv_arranque_solicitudes(id,actor,estado,datos) values(p_solicitud,auth.uid(),'APLICANDO',datos);
  insert into public.inv_arranque_corte_mp(solicitud_id,actor,fecha_inicio,fecha_cierre,datos,base,resumen)
    values(p_solicitud,auth.uid(),p_inicio,cierre,datos,revision->'base',resumen);
  for g in select value from jsonb_array_elements(p_conteos->'mp') loop
    articulo:=(g->>'id')::uuid;
    objetivo:=(g->>'cantidad')::numeric;
    select coalesce(sum(cantidad),0) into saldo
      from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=articulo;
    if not exists(select 1 from public.inv_kardex_movimientos
      where tipo='MATERIA_PRIMA' and articulo_id=articulo and clase='SALDO_INICIAL') then
      insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,documento,creado_por,responsable)
        values('MATERIA_PRIMA',articulo,cierre,'SALDO_INICIAL',0,'Base cero para corte físico','ARRANQUE MP '||p_solicitud,auth.uid(),responsable);
    end if;
    if objetivo<>saldo then
      insert into public.inv_kardex_movimientos(tipo,articulo_id,fecha,clase,cantidad,motivo,documento,creado_por,responsable)
        values('MATERIA_PRIMA',articulo,cierre,'CONTEO',objetivo-saldo,'Conteo físico de materiales','ARRANQUE MP '||p_solicitud,auth.uid(),responsable);
    end if;
    select coalesce(sum(cantidad),0) into saldo
      from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA' and articulo_id=articulo;
    if saldo<>objetivo then raise exception 'No coincidió el saldo de materiales. Se revirtió el corte.'; end if;
  end loop;

  v_resultado:=jsonb_build_object('estado','APLICADO','solicitud_id',p_solicitud,'fecha_inicio',p_inicio,'fecha_cierre',cierre,
    'resumen',resumen,'repetido',false);
  update public.inv_arranque_corte_mp set aplicado_en=clock_timestamp() where unico;
  update public.inv_arranque_solicitudes set estado='APLICADO',resultado=v_resultado where id=p_solicitud;
  return v_resultado;
end $$;

create or replace function public.inv_arranque_reporte_mp()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r jsonb;
begin
  perform public.inv_arranque_admin();
  select to_jsonb(c) into r from public.inv_arranque_corte_mp c where aplicado_en is not null;
  if found then return r; end if;
  select to_jsonb(c) into r from public.inv_arranque_cortes c
    where estado='APLICADO' and (datos->'conteos'->>'alcance') is distinct from 'PT';
  return r;
end $$;

create or replace function public.inv_arranque_proteger_mp()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare corte date;
begin
  select fecha_cierre into corte from public.inv_arranque_corte_mp where aplicado_en is not null;
  if found and not public.inv_arranque_mp_en_curso() then
    if TG_OP='INSERT' and new.tipo='MATERIA_PRIMA' and new.fecha=corte and new.clase='SALDO_INICIAL'
      and new.cantidad=0 and new.solicitud_id is null
      and not exists(select 1 from public.inv_kardex_movimientos where tipo='MATERIA_PRIMA'
        and articulo_id=new.articulo_id and clase='SALDO_INICIAL') then
      return new;
    end if;
    if (TG_OP<>'INSERT' and old.tipo='MATERIA_PRIMA' and old.fecha<=corte)
       or (TG_OP<>'DELETE' and new.tipo='MATERIA_PRIMA' and new.fecha<=corte) then
      raise exception 'El período de materias primas y empaques anterior al % está cerrado.',corte+1;
    end if;
    if (now() at time zone 'America/Guayaquil')::date<=corte and
      ((TG_OP<>'INSERT' and old.tipo='MATERIA_PRIMA') or (TG_OP<>'DELETE' and new.tipo='MATERIA_PRIMA')) then
      raise exception 'El período de materias primas y empaques inicia el %.',corte+1;
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists inv_arranque_periodo_mp on public.inv_kardex_movimientos;
create trigger inv_arranque_periodo_mp before insert or update or delete on public.inv_kardex_movimientos
  for each row execute function public.inv_arranque_proteger_mp();

do $ajustar$
declare cambio record; definicion text;
begin
  for cambio in select * from (values
    ('inv_arranque_estado()',
      $a$'permite_solo_pt',true,'alcance'$a$,
      $d$'corte_mp',coalesce(
        (select jsonb_build_object('id',m.solicitud_id,'fecha_inicio',m.fecha_inicio,'fecha_cierre',m.fecha_cierre,'aplicado_en',m.aplicado_en)
         from public.inv_arranque_corte_mp m where m.aplicado_en is not null),
        case when c.estado='APLICADO' and (c.datos->'conteos'->>'alcance') is distinct from 'PT'
          then jsonb_build_object('id',c.solicitud_id,'fecha_inicio',c.fecha_inicio,'fecha_cierre',c.fecha_cierre,'aplicado_en',c.aplicado_en) end),
   'permite_solo_pt',true,'alcance'$d$),
    ('inv_arranque_prever(date,jsonb)',
      $a$ perform public.inv_arranque_admin();$a$,
      $d$ perform public.inv_arranque_admin();
 if (p_conteos->>'alcance') is distinct from 'PT' and public.inv_arranque_cierre_mp() is not null then
   raise exception 'Los materiales ya tienen saldo inicial confirmado. Usa la toma física de PT.';
 end if;$d$),
    ('inv_arranque_confirmar(uuid,date,jsonb,text,boolean,boolean,uuid)',
      $a$ -- Ventana breve:$a$,
      $d$ if (p_conteos->>'alcance') is distinct from 'PT' and public.inv_arranque_cierre_mp() is not null then
   raise exception 'Los materiales ya tienen saldo inicial confirmado. Usa la toma física de PT.';
 end if;
 -- Ventana breve:$d$),
    ('inv_arranque_iniciar_mp()',
      $a$ select fecha_cierre into cierre from public.inv_arranque_cortes
 where estado='APLICADO' and (datos->'conteos'->>'alcance') is distinct from 'PT';
 if found and$a$,
      $d$ cierre:=public.inv_arranque_cierre_mp();
 if cierre is not null and$d$),
    ('inv_kardex_validar_mp(uuid)',
      $a$ SELECT fecha_inicio INTO v_inicio FROM public.inv_arranque_cortes
 WHERE estado='APLICADO' AND (datos->'conteos'->>'alcance') IS DISTINCT FROM 'PT';
 IF FOUND THEN$a$,
      $d$ v_inicio:=public.inv_arranque_cierre_mp()+1;
 IF v_inicio IS NOT NULL THEN$d$),
    ('inv_inicio_proteger_fecha()',
      $a$AND EXISTS(SELECT 1 FROM public.inv_arranque_cortes WHERE fecha_cierre=NEW.fecha AND (datos->'conteos'->>'alcance') IS DISTINCT FROM 'PT'
     AND (estado='APLICADO' OR public.inv_arranque_en_curso())) THEN RETURN NEW;$a$,
      $d$AND (NEW.fecha=public.inv_arranque_cierre_mp() OR public.inv_arranque_mp_en_curso()
     OR EXISTS(SELECT 1 FROM public.inv_arranque_cortes WHERE fecha_cierre=NEW.fecha AND (datos->'conteos'->>'alcance') IS DISTINCT FROM 'PT'
       AND (estado='APLICADO' OR public.inv_arranque_en_curso()))) THEN RETURN NEW;$d$),
    ('inv_arranque_no_truncar()',
      $a$if exists(select 1 from public.inv_arranque_cortes) then$a$,
      $d$if exists(select 1 from public.inv_arranque_cortes)
    or (TG_TABLE_NAME='inv_kardex_movimientos' and public.inv_arranque_cierre_mp() is not null) then$d$)
  ) as cambios(firma,anterior,nuevo)
  loop
    definicion:=replace(pg_get_functiondef(to_regprocedure('public.'||cambio.firma)),chr(13)||chr(10),chr(10));
    if strpos(definicion,cambio.nuevo)>0 then continue; end if;
    if definicion is null or length(definicion)-length(replace(definicion,cambio.anterior,''))<>length(cambio.anterior) then
      raise exception 'La definición instalada de % requiere revisión.',cambio.firma;
    end if;
    execute replace(definicion,cambio.anterior,cambio.nuevo);
  end loop;
end $ajustar$;

revoke all on function public.inv_arranque_cierre_mp(),public.inv_arranque_mp_en_curso(),public.inv_arranque_proteger_mp(),
  public.inv_arranque_revision_mp(date,jsonb),
  public.inv_arranque_prever_mp(date,jsonb),public.inv_arranque_confirmar_mp(uuid,date,jsonb,text,boolean,uuid),
  public.inv_arranque_reporte_mp() from public,anon,authenticated,service_role;
grant execute on function public.inv_arranque_prever_mp(date,jsonb),public.inv_arranque_confirmar_mp(uuid,date,jsonb,text,boolean,uuid),
  public.inv_arranque_reporte_mp() to authenticated,service_role;
notify pgrst,'reload schema';
commit;
