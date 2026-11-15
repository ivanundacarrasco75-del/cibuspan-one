begin;

create table if not exists public.compras_sri (
  clave_acceso text primary key check (clave_acceso ~ '^[0-9]{49}$'),
  fecha_emision date not null,
  datos jsonb not null check (jsonb_typeof(datos) = 'object'),
  xml_original text not null check (octet_length(xml_original) between 1 and 2097152),
  ride_leido boolean not null default false,
  registrado_en timestamptz not null default now()
);

create index if not exists compras_sri_fecha_idx
  on public.compras_sri (fecha_emision desc, clave_acceso);

alter table public.compras_sri enable row level security;
revoke all privileges on public.compras_sri from public, anon, authenticated;
grant select, insert on public.compras_sri to authenticated;
grant update (ride_leido) on public.compras_sri to authenticated;

drop policy if exists compras_sri_lectura on public.compras_sri;
create policy compras_sri_lectura on public.compras_sri
  for select to authenticated using ((select public.app_es_admin()));
drop policy if exists compras_sri_ingreso on public.compras_sri;
create policy compras_sri_ingreso on public.compras_sri
  for insert to authenticated with check ((select public.app_es_admin()));
drop policy if exists compras_sri_ride on public.compras_sri;
create policy compras_sri_ride on public.compras_sri
  for update to authenticated using ((select public.app_es_admin()))
  with check ((select public.app_es_admin()));

commit;
