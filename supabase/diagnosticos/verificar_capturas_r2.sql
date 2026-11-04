select jsonb_build_object(
  'tipo','capturas_r2','version','202611040004',
  'correcto',
    to_regprocedure('public.com_kpi_campo_autorizar_archivo(text,text)') is not null
    and to_regprocedure('public.com_kpi_campo_archivos_migracion(text,integer)') is not null
    and has_function_privilege('authenticated','public.com_kpi_campo_autorizar_archivo(text,text)','EXECUTE')
    and not has_function_privilege('anon','public.com_kpi_campo_autorizar_archivo(text,text)','EXECUTE')
    and has_function_privilege('authenticated','public.com_kpi_campo_archivos_migracion(text,integer)','EXECUTE')
    and not has_function_privilege('anon','public.com_kpi_campo_archivos_migracion(text,integer)','EXECUTE')
    and (select bool_and(prosecdef and provolatile='s' and 'search_path=pg_catalog, public'=any(proconfig))
      from pg_proc where oid in ('public.com_kpi_campo_autorizar_archivo(text,text)'::regprocedure,
      'public.com_kpi_campo_archivos_migracion(text,integer)'::regprocedure))
) as capturas_r2;
