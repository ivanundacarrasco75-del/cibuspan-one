begin;
set local lock_timeout='5s';
set local search_path='';
do $importe$
declare definicion text;
begin
  select pg_get_functiondef('public.fin_aplicar_retencion(uuid,text,date,text,boolean,text,text,jsonb,boolean)'::regprocedure) into definicion;
  if position('for fila in select * from jsonb_to_recordset(p_lineas) x(regla text,base numeric)' in definicion)=0
    or position('retenido:=round(fila.base*regla.porcentaje/100,2); total:=total+retenido;' in definicion)=0 then
    raise exception 'Revisar contrato de cálculo de retenciones.'; end if;
  definicion:=replace(definicion,'for fila in select * from jsonb_to_recordset(p_lineas) x(regla text,base numeric)',
    'for fila in select * from jsonb_to_recordset(p_lineas) x(regla text,base numeric,valor numeric)');
  definicion:=replace(definicion,'retenido:=round(fila.base*regla.porcentaje/100,2); total:=total+retenido;',
    'retenido:=coalesce(fila.valor,round(fila.base*regla.porcentaje/100,2));
     if retenido<0 or retenido<>round(retenido,2)
       or (regla.impuesto=''IVA'' and retenido>fila.base)
       or (regla.impuesto=''RENTA'' and retenido>round(fila.base*0.10,2))
       or (regla.porcentaje=0 and retenido<>0) then
       raise exception ''Revisa el importe retenido: no puede ser negativo, exceder la base permitida ni contradecir una regla sin retención.'';
     end if;
     if fila.valor is not null and retenido<>round(fila.base*regla.porcentaje/100,2) and char_length(btrim(p_motivo))<5 then
       raise exception ''Explica el motivo del ajuste manual de retención.'';
     end if;
     total:=total+retenido;');
  definicion:=replace(definicion,'''base'',fila.base,''valor'',retenido)',
    '''base'',fila.base,''valor'',retenido,''valor_calculado'',round(fila.base*regla.porcentaje/100,2),
      ''ajuste_manual'',fila.valor is not null and retenido<>round(fila.base*regla.porcentaje/100,2))');
  execute definicion;
end $importe$;
commit;
