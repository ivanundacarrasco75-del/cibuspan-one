-- CIBUSPAN ONE
-- Prestadores externos que trabajan como parte del equipo comercial.
-- Se registran mediante factura, no como empleados de nomina.

insert into public.fin_cuentas_pago (
  codigo,
  nombre,
  grupo,
  naturaleza,
  cuenta_contable_referencia,
  impacta_ebitda,
  orden
)
values (
  'SERV-VTA-EXT',
  'Servicios comerciales externos',
  'COMERCIAL',
  'GASTO_EBITDA',
  null,
  true,
  41
)
on conflict (codigo) do update
set nombre = excluded.nombre,
    grupo = excluded.grupo,
    naturaleza = excluded.naturaleza,
    cuenta_contable_referencia = excluded.cuenta_contable_referencia,
    impacta_ebitda = excluded.impacta_ebitda,
    orden = excluded.orden,
    activo = true;

comment on column public.fin_cuentas_pago.grupo is
  'Funcion gerencial del costo. SERV-VTA-EXT permanece separado de la nomina interna.';
