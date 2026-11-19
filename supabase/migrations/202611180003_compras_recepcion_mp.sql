begin;
set local lock_timeout='5s';

-- La factura no demuestra recepción física. Solo la confirmación explícita
-- genera entradas; importar XML, registrar pagos o cargar Excel no mueve stock.
create table public.compras_recepciones_mp (
  documento_id text primary key,
  fecha date not null,
  solicitud uuid not null unique,
  datos jsonb not null,
  factura jsonb not null,
  movimientos jsonb not null,
  creado_por uuid not null,
  creado_en timestamptz not null default now()
);
alter table public.compras_recepciones_mp enable row level security;
revoke all on public.compras_recepciones_mp from public,anon,authenticated;
grant select on public.compras_recepciones_mp to authenticated;
create policy compras_recepciones_mp_lectura on public.compras_recepciones_mp
  for select to authenticated using (public.app_es_admin() and public.inv_kardex_puede('MATERIA_PRIMA'));

create function public.compras_recepcion_mp_fuente(p_clave text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c record; clave text:=p_clave;
begin
  if auth.uid() is null or public.app_es_admin() is not true then
    raise exception 'No tienes acceso a las facturas de compra.' using errcode='42501';
  end if;
  -- La factura vinculada al Excel y su XML representan un solo documento.
  if p_clave like 'excel:%' then
    if public.app_puede('Administración') is not true then raise exception 'Sin acceso a la compra importada.' using errcode='42501'; end if;
    select coalesce(sri_clave,'excel:'||id::text) into clave
      from public.compras_excel_documentos where 'excel:'||id::text=p_clave and tipo='FACTURA';
  end if;
  select * into c from public.compras_vw_facturas where datos->>'clave'=clave;
  if not found then raise exception 'La factura ya no está disponible. Actualiza la tabla.'; end if;
  if c.origen_excel and public.app_puede('Administración') is not true then
    raise exception 'Sin acceso a la compra importada.' using errcode='42501';
  end if;
  return jsonb_build_object('id',case when clave like 'excel:%' then clave else 'sri:'||clave end,
    'factura',c.datos,'edicion',c.edicion,'version',md5(c.datos::text||c.edicion::text));
end $$;
revoke all on function public.compras_recepcion_mp_fuente(text) from public,anon,authenticated;

create function public.compras_recepcion_mp_estado(p_clave text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare f jsonb; r jsonb; articulos jsonb:='[]'; puede boolean;
begin
  f:=public.compras_recepcion_mp_fuente(p_clave);
  puede:=public.inv_kardex_puede('MATERIA_PRIMA',true);
  if public.inv_kardex_puede('MATERIA_PRIMA') then
    select to_jsonb(x) into r from public.compras_recepciones_mp x where documento_id=f->>'id';
  end if;
  if puede then
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'codigo',m.codigo,'nombre',m.nombre,'unidad',m.unidad_base,
      'iniciado',exists(select 1 from public.inv_kardex_movimientos k
        where k.tipo='MATERIA_PRIMA' and k.articulo_id=m.id and k.clase='SALDO_INICIAL')) order by m.nombre),'[]')
    into articulos from public.materias_primas m where m.activo;
  end if;
  return jsonb_build_object('version',f->>'version','puede',puede,'recepcion',r,'articulos',articulos);
end $$;

create function public.compras_recepcion_mp_confirmar(p_clave text,p_version text,p_fecha date,p_lineas jsonb,p_solicitud uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare f jsonb; previo public.compras_recepciones_mp%rowtype; linea jsonb; movimientos jsonb:='[]';
  datos jsonb; respuesta jsonb; saldo numeric; unidades numeric; articulo uuid; indice integer; documento text;
begin
  if public.inv_kardex_puede('MATERIA_PRIMA',true) is not true then
    raise exception 'No tienes permiso para registrar entradas de materias primas.' using errcode='42501';
  end if;
  f:=public.compras_recepcion_mp_fuente(p_clave);
  if p_fecha is null or p_solicitud is null or p_version is null
    or jsonb_typeof(p_lineas) is distinct from 'array' then raise exception 'Completa la recepción.'; end if;
  if jsonb_array_length(p_lineas) not between 1 and 200 then raise exception 'Incluye de 1 a 200 líneas de materiales.'; end if;
  datos:=jsonb_build_object('fecha',p_fecha,'lineas',p_lineas,'version',p_version);
  perform pg_advisory_xact_lock(hashtextextended('recepcion-mp:'||(f->>'id'),0));
  select * into previo from public.compras_recepciones_mp where documento_id=f->>'id';
  if found then
    if previo.solicitud=p_solicitud and previo.datos=datos then
      return jsonb_build_object('repetido',true,'recepcion',to_jsonb(previo));
    end if;
    raise exception 'Esta factura ya tiene su recepción registrada. Actualiza el detalle; no se duplicaron entradas.';
  end if;
  if p_version is distinct from f->>'version' then raise exception 'La factura cambió. Cierra y vuelve a abrir el detalle antes de confirmar.'; end if;
  if (select count(distinct (x->>'linea')::integer) from jsonb_array_elements(p_lineas) x)<>jsonb_array_length(p_lineas) then
    raise exception 'Hay líneas repetidas o sin referencia en la recepción.';
  end if;
  documento:=left(coalesce(nullif(f->'edicion'->>'serie',''),f->'factura'->>'serie','')||' · '||coalesce(f->'factura'->>'proveedor',''),200);
  -- Orden de bloqueo común al Kardex y producción; todo se confirma o revierte junto.
  for linea in select x from jsonb_array_elements(p_lineas) x order by x->>'articulo_id',x->>'linea' loop
    articulo:=(linea->>'articulo_id')::uuid;
    unidades:=(linea->>'cantidad')::numeric;
    indice:=(linea->>'linea')::integer;
    if indice is null or indice<0 or indice>=jsonb_array_length(f->'factura'->'items') then
      raise exception 'La línea no pertenece a la factura.';
    end if;
    if unidades is null or unidades::text in ('NaN','Infinity','-Infinity') or unidades<=0 or unidades<>round(unidades,6) then
      raise exception 'Indica una cantidad positiva, con máximo seis decimales, en la unidad del catálogo.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('MATERIA_PRIMA'||articulo::text,0));
    select coalesce(sum(cantidad),0) into saldo from public.inv_kardex_movimientos
      where tipo='MATERIA_PRIMA' and articulo_id=articulo and fecha<=p_fecha;
    respuesta:=public.inv_kardex_registrar('MATERIA_PRIMA',articulo,null,p_fecha,'ENTRADA',unidades,saldo,
      'Recepción de compra · '||documento,documento,gen_random_uuid());
    movimientos:=movimientos||jsonb_build_array(jsonb_build_object('linea',indice,'articulo_id',articulo,
      'cantidad',unidades,'movimiento_id',respuesta->'id',
      'nombre',(select nombre from public.materias_primas where id=articulo),
      'unidad',(select unidad_base from public.materias_primas where id=articulo)));
  end loop;
  insert into public.compras_recepciones_mp(documento_id,fecha,solicitud,datos,factura,movimientos,creado_por)
    values(f->>'id',p_fecha,p_solicitud,datos,f,movimientos,auth.uid()) returning * into previo;
  return jsonb_build_object('repetido',false,'recepcion',to_jsonb(previo));
end $$;
revoke all on function public.compras_recepcion_mp_estado(text),
  public.compras_recepcion_mp_confirmar(text,text,date,jsonb,uuid) from public,anon;
grant execute on function public.compras_recepcion_mp_estado(text),
  public.compras_recepcion_mp_confirmar(text,text,date,jsonb,uuid) to authenticated;
commit;
