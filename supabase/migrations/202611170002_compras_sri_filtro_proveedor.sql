begin;

create index if not exists compras_sri_proveedor_fecha_idx
on public.compras_sri (
  (btrim(coalesce(edicion->>'proveedor', datos->>'proveedor'))),
  fecha_emision desc, clave_acceso
);

create or replace function public.compras_sri_buscar_proveedores(p_texto text)
returns table (proveedor text)
language sql stable security invoker
set search_path = ''
as $$
  select distinct btrim(coalesce(c.edicion->>'proveedor', c.datos->>'proveedor')) as proveedor
  from public.compras_sri c
  where btrim(coalesce(c.edicion->>'proveedor', c.datos->>'proveedor')) <> ''
    and starts_with(
      translate(lower(btrim(coalesce(c.edicion->>'proveedor', c.datos->>'proveedor'))), 'áéíóúüñ', 'aeiouun'),
      translate(lower(btrim(coalesce(p_texto, ''))), 'áéíóúüñ', 'aeiouun')
    )
  order by proveedor
  limit 40;
$$;

create or replace function public.compras_sri_listar_por_proveedor(p_proveedor text, p_desde integer, p_limite integer)
returns table (datos jsonb, ride_leido boolean, edicion jsonb, abonos jsonb)
language sql stable security invoker
set search_path = ''
as $$
  select c.datos, c.ride_leido, c.edicion, c.abonos
  from public.compras_sri c
  where btrim(coalesce(c.edicion->>'proveedor', c.datos->>'proveedor')) = p_proveedor
  order by c.fecha_emision desc, c.clave_acceso
  offset greatest(p_desde, 0) limit least(greatest(p_limite, 1), 100);
$$;

revoke all on function public.compras_sri_buscar_proveedores(text) from public, anon, authenticated;
revoke all on function public.compras_sri_listar_por_proveedor(text,integer,integer) from public, anon, authenticated;
grant execute on function public.compras_sri_buscar_proveedores(text) to authenticated;
grant execute on function public.compras_sri_listar_por_proveedor(text,integer,integer) to authenticated;

commit;
