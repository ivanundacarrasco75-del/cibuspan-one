begin;

create table if not exists public.cliente_bodega_precios (
  bodega_id uuid not null references public.bodegas(id),
  producto_id uuid not null references public.productos(id),
  precio numeric(16,4) not null check (precio > 0),
  primary key (bodega_id, producto_id)
);

alter table public.cliente_bodega_precios enable row level security;
revoke all on public.cliente_bodega_precios from public, anon;
grant select on public.cliente_bodega_precios to authenticated;

drop policy if exists leer_precio_bodega on public.cliente_bodega_precios;
create policy leer_precio_bodega on public.cliente_bodega_precios
for select to authenticated using (
  exists (
    select 1
    from public.bodegas bodega
    join public.cliente_productos relacion on relacion.cliente_id = bodega.cliente_id
    where bodega.id = bodega_id and bodega.activo
      and relacion.producto_id = cliente_bodega_precios.producto_id and relacion.activo
  )
);

do $$
declare
  sucursal record;
  v_cliente_id uuid;
  v_producto_id uuid;
  v_bodega_id uuid;
begin
  select id into strict v_cliente_id from public.clientes
  where nombre = 'TIENDAS TUTI TTDE S. A.' and activo;

  select producto.id into strict v_producto_id
  from public.productos producto
  join public.cliente_productos relacion on relacion.producto_id = producto.id
  where producto.codigo = '7868304262219T' and producto.activo
    and relacion.cliente_id = v_cliente_id and relacion.activo;

  for sucursal in select * from (values ('MANABI', 1.56), ('SAMBORONDON', 1.60)) as datos(nombre, precio)
  loop
    select id into strict v_bodega_id from public.bodegas
    where cliente_id = v_cliente_id and nombre = sucursal.nombre and activo;

    insert into public.cliente_bodega_precios (bodega_id, producto_id, precio)
    values (v_bodega_id, v_producto_id, sucursal.precio)
    on conflict (bodega_id, producto_id) do nothing;
  end loop;
end;
$$;

commit;
