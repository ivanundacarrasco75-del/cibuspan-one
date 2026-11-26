begin;
set local lock_timeout='5s';
-- XML válidos pueden expresar el mismo subtotal con seis o más decimales.
-- Se conserva el texto original y la conciliación exacta a centavos con IVA/total.
do $$
declare definicion text;
  anterior constant text := '^[0-9]+([.][0-9]{1,5})?$';
  nueva constant text := '^[0-9]+([.][0-9]+)?$';
begin
 select pg_get_functiondef('public.compras_enlazar_excel_sri(text,uuid,text,boolean)'::regprocedure) into definicion;
 if position(anterior in definicion)>0 then
  execute replace(definicion,anterior,nueva);
 elsif position(nueva in definicion)=0 then
  raise exception 'Revisar el contrato de validación del subtotal al vincular.';
 end if;
end $$;
commit;
