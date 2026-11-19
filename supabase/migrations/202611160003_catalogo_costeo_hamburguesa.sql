do $$
declare
  v_brioche_id uuid;
  v_ham001_id uuid;
  v_formula_brioche_id uuid;
  v_formula_ham001_id uuid;
begin
  select id into strict v_formula_brioche_id
  from public.fm_formulas where codigo = 'HAM-003' and activo;

  select id into strict v_formula_ham001_id
  from public.fm_formulas where codigo = 'HAM001' and activo;

  select id into strict v_ham001_id
  from public.productos where codigo = 'HAM001' and activo;

  insert into public.productos (codigo, nombre, corto)
  values ('HAM-003', 'PAN DE HAMBURGUESA BRIOCHE', 'HAMBURGUESA BRIOCHE')
  on conflict (codigo) do nothing;

  select id into strict v_brioche_id
  from public.productos where codigo = 'HAM-003' and activo;

  insert into public.fm_formula_productos (formula_id, producto_id, activo)
  values (v_formula_brioche_id, v_brioche_id, true),
         (v_formula_ham001_id, v_ham001_id, true)
  on conflict (formula_id, producto_id) do update set activo = excluded.activo
  where not fm_formula_productos.activo;
end;
$$;
