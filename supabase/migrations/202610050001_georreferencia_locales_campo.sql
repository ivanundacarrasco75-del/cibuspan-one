-- Referencias propias de locales; no consulta APIs de mapas ni cambia visitas históricas.
begin;
set local lock_timeout = '5s';
alter table public.com_locales_monitoreados
  add column if not exists direccion text,
  add column if not exists latitud numeric(10,7),
  add column if not exists longitud numeric(10,7),
  add column if not exists radio_metros integer not null default 150,
  add column if not exists referencia_actualizada_en timestamptz;
-- Permitir repetir únicamente este archivo si la publicación posterior falla.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.com_locales_monitoreados'::regclass
    and conname = 'com_locales_georreferencia_check') then
    alter table public.com_locales_monitoreados add constraint com_locales_georreferencia_check check (
      (latitud is null and longitud is null) or
      (latitud is not null and longitud is not null and latitud between -90 and 90 and longitud between -180 and 180)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.com_locales_monitoreados'::regclass
    and conname = 'com_locales_radio_check') then
    alter table public.com_locales_monitoreados add constraint com_locales_radio_check check (radio_metros between 30 and 500);
  end if;
end;
$$;

create or replace function public.com_kpi_campo_georeferencias(p_cliente_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.app_puede('Campo comercial', auth.uid()) then
    raise exception 'No tienes permiso para consultar el trabajo de campo.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', l.id, 'direccion', l.direccion, 'latitud', l.latitud, 'longitud', l.longitud,
    'radio_metros', l.radio_metros, 'referencia_actualizada_en', l.referencia_actualizada_en,
    'propuesta', case when public.com_es_gerencia_kpi() and l.latitud is null then propuesta.dato else null end
  )) from public.com_locales_monitoreados l
  left join lateral (
    select jsonb_build_object('visita_id', v.id, 'nombre_captura', s.datos_ia->>'nombre_local_ocr',
      'visitado_en', coalesce(s.datos_ia->'georreferencia_visita'->'ubicacion'->>'registrado_en', v.visitado_en::text),
      'latitud', v.latitud, 'longitud', v.longitud, 'precision', v.precision_metros,
      'responsable', coalesce(p.nombre, p.email, 'Responsable'), 'capturas', to_jsonb(s.capturas_app)) as dato
    from public.com_visitas_campo v join public.com_visitas_campo_sku s on s.visita_id = v.id
    left join public.app_profiles p on p.user_id = v.registrado_por
    cross join lateral (select regexp_replace(translate(upper(s.datos_ia->>'nombre_local_ocr'),
      'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]', '', 'g') as nombre) ocr
    where public.com_es_gerencia_kpi() and l.latitud is null
      and v.local_monitoreado_id = l.id and v.cliente_id = l.cliente_id and v.estado = 'CONFIRMADA'
      and v.latitud is not null and v.longitud is not null and v.precision_metros between 0 and 100
      and cardinality(s.capturas_app) > 0 and s.datos_ia->'local_captura_coincide' = 'true'::jsonb
      and length(ocr.nombre) >= 6
      and 1 = (select count(*) from public.com_locales_monitoreados candidata
        cross join lateral (select regexp_replace(translate(upper(candidata.nombre),
          'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]', '', 'g') as nombre) n
        where candidata.activo and candidata.cliente_id = l.cliente_id and length(n.nombre) >= 6
          and (strpos(n.nombre, ocr.nombre) > 0 or strpos(ocr.nombre, n.nombre) > 0))
    order by v.visitado_en, v.id limit 1
  ) propuesta on true
  where l.activo
    and (p_cliente_id is null or l.cliente_id = p_cliente_id)
    and public.com_puede_ver_cliente_campo(l.cliente_id)), '[]'::jsonb);
end;
$$;

create or replace function public.com_kpi_campo_guardar_georreferencia(
  p_local_id uuid, p_direccion text, p_latitud numeric, p_longitud numeric, p_radio_metros integer default 150
)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.com_es_gerencia_kpi() or not public.app_puede('Campo comercial', auth.uid()) then
    raise exception 'Solo gerencia puede registrar la ubicación de un local.' using errcode = '42501';
  end if;
  if p_latitud is null or p_longitud is null or not (p_latitud between -90 and 90)
    or not (p_longitud between -180 and 180) or p_radio_metros is null or not (p_radio_metros between 30 and 500)
    or length(trim(coalesce(p_direccion, ''))) > 300 then
    raise exception 'Revisa coordenadas, dirección y radio del local.' using errcode = '22023';
  end if;
  update public.com_locales_monitoreados set direccion = nullif(trim(p_direccion), ''),
    latitud = p_latitud, longitud = p_longitud, radio_metros = p_radio_metros,
    referencia_actualizada_en = now(), actualizado_en = now(), actualizado_por = auth.uid()
  where id = p_local_id and activo;
  if not found then raise exception 'El local no está activo.' using errcode = '22023'; end if;
  return p_local_id;
end;
$$;
revoke all on function public.com_kpi_campo_georeferencias(uuid) from public, anon;
revoke all on function public.com_kpi_campo_guardar_georreferencia(uuid,text,numeric,numeric,integer) from public, anon;
grant execute on function public.com_kpi_campo_georeferencias(uuid) to authenticated;
grant execute on function public.com_kpi_campo_guardar_georreferencia(uuid,text,numeric,numeric,integer) to authenticated;

-- KAM/gerencia pueden ver evidencia vinculada a visitas confirmadas de sus clientes.
-- No se amplía el permiso para subir, borrar o ver archivos sin visita.
drop policy if exists visitas_campo_ver_supervision on storage.objects;
create policy visitas_campo_ver_supervision on storage.objects for select to authenticated using (
  bucket_id = 'visitas-campo' and public.app_puede('Campo comercial', auth.uid())
  and exists (select 1 from public.app_profiles p where p.user_id = auth.uid()
    and p.activo and p.rol in ('ADMINISTRADOR', 'GERENTE', 'KAM'))
  and exists (select 1 from public.com_visitas_campo_sku s
    join public.com_visitas_campo v on v.id = s.visita_id
    where v.estado = 'CONFIRMADA' and public.com_puede_ver_cliente_campo(v.cliente_id)
      and (storage.objects.name = any(s.fotos_percha) or storage.objects.name = any(s.capturas_app)))
);
notify pgrst, 'reload schema';
commit;
