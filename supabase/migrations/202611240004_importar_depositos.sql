begin;
set local lock_timeout='5s';
create table public.fin_cxc_importaciones (
 id uuid primary key,archivo text not null,huella text not null,cuenta_ultimos4 text not null,tipo text not null,
 solicitud jsonb not null,resultado jsonb not null,creado_por uuid not null,creado_en timestamptz not null default now()
);
alter table public.fin_cxc_importaciones enable row level security;
revoke all on public.fin_cxc_importaciones from public,anon,authenticated;
create function public.fin_cxc_importar_depositos(p_operacion uuid,p_archivo text,p_huella text,p_cuenta text,p_tipo text,p_filas jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare solicitud jsonb; anterior public.fin_cxc_importaciones%rowtype; fila record; existente public.fin_cxc_depositos%rowtype;
 v_banco text; creados integer:=0; duplicados integer:=0; importe numeric:=0; importe_duplicado numeric:=0; resultado jsonb;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para importar depósitos.' using errcode='42501'; end if;
 if p_operacion is null or char_length(btrim(coalesce(p_archivo,''))) not between 1 and 200 or coalesce(p_huella,'') !~ '^[0-9a-f]{64}$'
  or coalesce(p_cuenta,'') !~ '^[0-9]{6,24}$' or p_tipo is null or p_tipo not in ('CORRIENTE','AHORROS') or jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Revisa el archivo, la cuenta y los depósitos seleccionados.'; end if;
 if jsonb_array_length(p_filas) not between 1 and 2000 or (select count(distinct x.id) from jsonb_to_recordset(p_filas) x(id uuid))<>jsonb_array_length(p_filas)
  or (select count(*) from(select x.fecha,upper(btrim(x.referencia)) from jsonb_to_recordset(p_filas) x(fecha date,referencia text) group by 1,2) s)<>jsonb_array_length(p_filas) then raise exception 'Selecciona entre 1 y 2000 depósitos sin referencias repetidas en una misma fecha.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cxc_importacion:'||p_operacion::text,0));
 solicitud:=jsonb_build_object('archivo',p_archivo,'huella',p_huella,'cuenta',p_cuenta,'tipo',p_tipo,'filas',p_filas);
 select * into anterior from public.fin_cxc_importaciones where id=p_operacion;
 if found then
  if anterior.solicitud is distinct from solicitud then raise exception 'Esta operación ya se utilizó con otros datos.'; end if;
  return anterior.resultado;
 end if;
 v_banco:='Produbanco · '||case when p_tipo='CORRIENTE' then 'Corriente' else 'Ahorros' end||' · ****'||right(p_cuenta,4);
 perform pg_advisory_xact_lock(hashtextextended('cxc_importar_produbanco:'||p_cuenta||':'||p_tipo,0));
 for fila in select * from jsonb_to_recordset(p_filas) x(id uuid,fecha date,referencia text,monto numeric,ordenante text,observaciones text) order by id loop
  if fila.id is null or fila.fecha is null or not isfinite(fila.fecha) or char_length(btrim(coalesce(fila.referencia,''))) not between 1 and 100
   or fila.monto is null or not(fila.monto>0 and fila.monto<1000000000 and fila.monto=round(fila.monto,2))
   or char_length(coalesce(fila.ordenante,''))>200 or char_length(coalesce(fila.observaciones,''))>500 then raise exception 'Revisa fecha, referencia e importe positivo de cada depósito.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cxc_deposito:'||fila.id::text,0));
  select * into existente from public.fin_cxc_depositos d where d.id=fila.id or (not d.anulado and upper(btrim(d.banco))=upper(btrim(v_banco)) and upper(btrim(d.referencia))=upper(btrim(fila.referencia)) and d.fecha=fila.fecha) order by (d.id=fila.id) desc limit 1;
  if found then
   if existente.anulado then raise exception 'La referencia % del % fue anulada. Revísala antes de volver a ingresarla.',fila.referencia,fila.fecha; end if;
   if upper(btrim(existente.banco))<>upper(btrim(v_banco)) or upper(btrim(existente.referencia))<>upper(btrim(fila.referencia)) or existente.fecha<>fila.fecha or existente.monto<>fila.monto then
    raise exception 'La referencia % del % ya existe con otros datos o importe. No se guardó la importación.',fila.referencia,fila.fecha;
   end if;
   duplicados:=duplicados+1; importe_duplicado:=importe_duplicado+fila.monto;
  else
   perform public.fin_cxc_crear_deposito(fila.id,v_banco,fila.referencia,fila.fecha,fila.monto,coalesce(fila.ordenante,''),coalesce(fila.observaciones,''));
   creados:=creados+1; importe:=importe+fila.monto;
  end if;
 end loop;
 resultado:=jsonb_build_object('creados',creados,'duplicados',duplicados,'importe_creado',importe,'importe_duplicado',importe_duplicado);
 insert into public.fin_cxc_importaciones(id,archivo,huella,cuenta_ultimos4,tipo,solicitud,resultado,creado_por)
 values(p_operacion,p_archivo,p_huella,right(p_cuenta,4),p_tipo,solicitud,resultado,auth.uid());
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_IMPORTAR_DEPOSITOS',jsonb_build_object('operacion',p_operacion,'archivo',p_archivo,'huella',p_huella,'banco',v_banco,'resultado',resultado));
 return resultado;
end $$;
revoke all on function public.fin_cxc_importar_depositos(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.fin_cxc_importar_depositos(uuid,text,text,text,text,jsonb) to authenticated;
commit;
