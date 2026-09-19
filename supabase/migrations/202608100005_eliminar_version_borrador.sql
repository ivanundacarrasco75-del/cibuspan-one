-- CIBUSPAN ONE
-- Eliminación segura de versiones que todavía están en borrador.

create or replace function public.fm_eliminar_version_borrador(
  p_formula_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_formula_id uuid;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception 'No existe una sesión válida.';
  end if;

  if not public.app_puede_alguna(
    array['Producción', 'Administración']
  ) then
    raise exception 'No tienes permiso para eliminar versiones.'
      using errcode = '42501';
  end if;

  select version.formula_id, version.estado
  into v_formula_id, v_estado
  from public.fm_formula_versiones version
  where version.id = p_formula_version_id
  for update;

  if v_formula_id is null then
    raise exception 'No se encontró la versión.';
  end if;

  if v_estado <> 'BORRADOR' then
    raise exception
      'Solo se pueden eliminar versiones en BORRADOR. La versión vigente y el historial están protegidos.';
  end if;

  delete from public.fm_formula_versiones
  where id = p_formula_version_id;

  return v_formula_id;
end;
$$;

revoke all on function public.fm_eliminar_version_borrador(uuid)
  from public, anon;
grant execute on function public.fm_eliminar_version_borrador(uuid)
  to authenticated;
