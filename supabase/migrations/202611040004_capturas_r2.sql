-- Autoriza el almacenamiento externo con las reglas de evidencia existentes.
-- No mueve archivos, no cambia visitas ni elimina objetos.
begin;
create or replace function public.com_kpi_campo_autorizar_archivo(p_ruta text, p_accion text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_permitido boolean := false;
begin
  if v_uid is null then raise exception 'Sesion no valida.' using errcode='42501'; end if;
  if p_ruta is null or length(p_ruta)>500 or p_ruta !~ '^[0-9a-fA-F-]{36}/[0-9]{4}-[0-9]{2}-[0-9]{2}/(captura|percha)-[a-zA-Z0-9.-]+\.(png|jpg|jpeg|webp)$' then
    raise exception 'Ruta de evidencia no valida.' using errcode='22023';
  end if;
  v_admin := public.app_es_admin(v_uid);
  if p_accion='SUBIR' then
    v_permitido := split_part(p_ruta,'/',1)=v_uid::text
      and public.app_puede('Campo comercial',v_uid)
      and split_part(p_ruta,'/',3) ~ '^captura-r2-[a-f0-9]{64}\.(png|jpg|webp)$';
  elsif p_accion in ('MIGRAR','RETIRAR') then
    v_permitido := v_admin and exists (
      select 1 from public.com_visitas_campo_sku s where p_ruta=any(s.capturas_app)
    ) and split_part(p_ruta,'/',3) !~ '^captura-r2-';
  elsif p_accion='VER' then
    v_permitido := split_part(p_ruta,'/',1)=v_uid::text or v_admin or (
      public.app_puede('Campo comercial',v_uid)
      and exists(select 1 from public.app_profiles p where p.user_id=v_uid and p.activo
        and p.rol in ('ADMINISTRADOR','GERENTE','KAM'))
      and exists(select 1 from public.com_visitas_campo_sku s
        join public.com_visitas_campo v on v.id=s.visita_id
        where v.estado='CONFIRMADA' and public.com_puede_ver_cliente_campo(v.cliente_id)
          and (p_ruta=any(s.capturas_app) or p_ruta=any(s.fotos_percha)))
    );
  else raise exception 'Accion no valida.' using errcode='22023';
  end if;
  return jsonb_build_object('permitido',coalesce(v_permitido,false),'usuario_id',v_uid);
end;
$$;
create or replace function public.com_kpi_campo_archivos_migracion(p_despues text default '',p_limite integer default 50)
returns table(ruta text) language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null or not public.app_es_admin(auth.uid()) then
    raise exception 'Solo administracion puede trasladar capturas.' using errcode='42501';
  end if;
  if p_limite is null or p_limite<1 or p_limite>100 then raise exception 'Limite no valido.'; end if;
  return query select distinct a.ruta from public.com_visitas_campo_sku s
    cross join lateral unnest(s.capturas_app) a(ruta)
    where a.ruta>coalesce(p_despues,'') and split_part(a.ruta,'/',3) !~ '^captura-r2-'
    order by a.ruta limit p_limite;
end;
$$;
revoke all on function public.com_kpi_campo_autorizar_archivo(text,text) from public,anon;
revoke all on function public.com_kpi_campo_archivos_migracion(text,integer) from public,anon;
grant execute on function public.com_kpi_campo_autorizar_archivo(text,text) to authenticated;
grant execute on function public.com_kpi_campo_archivos_migracion(text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
