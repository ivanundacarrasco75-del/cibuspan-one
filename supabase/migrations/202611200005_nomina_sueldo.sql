begin;
set local lock_timeout='5s';
set local search_path='';
alter table public.fin_nomina_obligaciones drop constraint fin_nomina_obligaciones_concepto_check;
alter table public.fin_nomina_obligaciones add constraint fin_nomina_obligaciones_concepto_check
  check(concepto in ('SUELDO','PRIMERA_QUINCENA','SEGUNDA_QUINCENA','DECIMO_TERCERO','DECIMO_CUARTO','DECIMO_SEXTO'));
do $contratos$
declare definicion text;
begin
  select pg_get_functiondef('public.fin_cargar_nomina_cuentas(date,text,jsonb)'::regprocedure) into definicion;
  if position('''PRIMERA_QUINCENA'',''SEGUNDA_QUINCENA''' in definicion)=0 then raise exception 'Revisar contrato de carga de nómina.'; end if;
  execute replace(definicion,'''PRIMERA_QUINCENA'',''SEGUNDA_QUINCENA''','''SUELDO'',''PRIMERA_QUINCENA'',''SEGUNDA_QUINCENA''');
  select pg_get_viewdef('public.fin_vw_cuentas_sin_anticipos'::regclass,true) into definicion;
  if position('WHEN ''PRIMERA_QUINCENA''::text THEN' in definicion)=0 then raise exception 'Revisar contrato de conceptos de nómina.'; end if;
  execute 'create or replace view public.fin_vw_cuentas_sin_anticipos with(security_invoker=true) as '||
    replace(definicion,'WHEN ''PRIMERA_QUINCENA''::text THEN','WHEN ''SUELDO''::text THEN ''Sueldo''::text WHEN ''PRIMERA_QUINCENA''::text THEN');
end $contratos$;
commit;
