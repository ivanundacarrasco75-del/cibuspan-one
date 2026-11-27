begin;
set local lock_timeout='5s';
create table public.fin_cxc_comprobantes_pago(id uuid primary key default gen_random_uuid(),cliente text not null check(cliente in('FAVORITA','SANTAMARIA')),referencia text not null,fecha date not null,neto numeric(14,2) not null check(neto>=0),datos jsonb not null,version uuid not null default gen_random_uuid(),operacion uuid references public.fin_cxc_operaciones(id),creado_por uuid not null,creado_en timestamptz not null default now(),unique(cliente,referencia,fecha));
create table public.fin_cxc_comprobantes_archivos(hash text primary key check(hash~'^[a-f0-9]{64}$'),archivo text not null,datos jsonb not null,creado_por uuid not null,creado_en timestamptz not null default now());
create table public.fin_cxc_comprobantes_origen(hash text references public.fin_cxc_comprobantes_archivos(hash),documento_id uuid references public.fin_cxc_comprobantes_pago(id),primary key(hash,documento_id));
create table public.fin_cxc_descuentos_documento(id uuid primary key default gen_random_uuid(),documento_id uuid references public.fin_cxc_comprobantes_pago(id),operacion uuid references public.fin_cxc_operaciones(id),cliente text not null,clase text not null,numero text not null,total numeric(14,2) not null,aplicado numeric(14,2) not null,anulada boolean not null default false);
create index fin_cxc_descuento_identidad on public.fin_cxc_descuentos_documento(cliente,clase,numero) where not anulada;
alter table public.fin_cxc_comprobantes_pago enable row level security;
alter table public.fin_cxc_comprobantes_archivos enable row level security;
alter table public.fin_cxc_comprobantes_origen enable row level security;
alter table public.fin_cxc_descuentos_documento enable row level security;
revoke all on public.fin_cxc_comprobantes_pago,public.fin_cxc_comprobantes_archivos,public.fin_cxc_comprobantes_origen,public.fin_cxc_descuentos_documento from public,anon,authenticated;
alter table public.fin_cxc_aplicaciones add column ajuste numeric(14,2) not null default 0 check(ajuste>=0);
alter table public.fin_cxc_aplicaciones add column documento_pago uuid references public.fin_cxc_comprobantes_pago(id);
alter table public.fin_cxc_aplicaciones drop constraint fin_cxc_aplicaciones_check;
alter table public.fin_cxc_aplicaciones add constraint fin_cxc_aplicacion_positiva check(efectivo+retencion+ajuste>0);
-- Conserva columnas, OID y fuentes: solo añade descuentos registrados a la ecuación del saldo.
do $$ declare definicion text; columnas text;begin
 if exists(select 1 from pg_attribute where attrelid='public.fin_cxc_saldos'::regclass and attname='ajustado' and not attisdropped) then raise exception 'Revisar estructura de saldos CxC.';end if;
 definicion:=regexp_replace(pg_get_viewdef('public.fin_cxc_saldos'::regclass,true),';\s*$','');
 select string_agg(case when attname='saldo' then 'c.saldo-coalesce(j.ajustado,0) as saldo' else format('c.%I',attname) end,',' order by attnum) into columnas from pg_attribute where attrelid='public.fin_cxc_saldos'::regclass and attnum>0 and not attisdropped;
 execute 'create or replace view public.fin_cxc_saldos as select '||columnas||',coalesce(j.ajustado,0) as ajustado from ('||definicion||') c left join lateral(select sum(a.ajuste) ajustado from public.fin_cxc_aplicaciones a where a.comprobante=c.comprobante and not a.anulada) j on true';
 select pg_get_functiondef('public.fin_cxc_confirmar_factura(text,integer,text,numeric,date,text)'::regprocedure) into definicion;
 if position('p_total<s.cobrado+s.retenido' in definicion)=0 then raise exception 'Revisar confirmación CxC.';end if;
 execute replace(definicion,'p_total<s.cobrado+s.retenido','p_total<s.cobrado+s.retenido+s.ajustado');
 -- Una conciliación por comprobante se revierte completa desde su propia tarjeta.
 select pg_get_functiondef('public.fin_cxc_anular(uuid,uuid,text)'::regprocedure) into definicion;
 if position('if p_aplicacion is not null then' in definicion)=0 then raise exception 'Revisar anulación CxC.';end if;
 execute replace(definicion,'if p_aplicacion is not null then','if p_aplicacion is not null then
  if exists(select 1 from public.fin_cxc_aplicaciones where id=p_aplicacion and documento_pago is not null) then raise exception ''Anula el comprobante completo desde Documentos de pago de clientes.'';end if;');
end $$;
create function public.fin_cxc_cliente_documento(p_cliente text,p_nombre text) returns boolean language sql immutable set search_path='' as $$
 select case p_cliente when 'FAVORITA' then n in('FAVORITA','CORPORACIONFAVORITA','CORPORACIONFAVORITACA') when 'SANTAMARIA' then n in('SANTAMARIA','MEGASANTAMARIA','MEGASANTAMARIASA') else false end
 from(select regexp_replace(upper(translate(regexp_replace(btrim(coalesce(p_nombre,'')),'^emisi[oó]n[[:space:]:]+','','i'),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')),'[^A-Z0-9]','','g') n) x;
$$;
create function public.fin_cxc_importar_comprobantes(p_hash text,p_archivo text,p_documentos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb;l jsonb;canon jsonb;r public.fin_cxc_comprobantes_pago%rowtype;v numeric;campo text;suma numeric;facturas integer;creados integer:=0;repetidos integer:=0;viejo jsonb;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para importar documentos de pago.' using errcode='42501';end if;
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$' or char_length(btrim(coalesce(p_archivo,''))) not between 1 and 200 or jsonb_typeof(p_documentos) is distinct from 'array' then raise exception 'Revisa archivo y documentos.';end if;
 if jsonb_array_length(p_documentos) not between 1 and 100 then raise exception 'Importa entre 1 y 100 pagos completos.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cxc_archivo_pago:'||p_hash,0));select datos into viejo from public.fin_cxc_comprobantes_archivos where hash=p_hash;
 if found then if viejo is distinct from p_documentos then raise exception 'El archivo ya fue importado con otros datos.';end if;return jsonb_build_object('creados',0,'duplicados',jsonb_array_length(p_documentos));end if;
 insert into public.fin_cxc_comprobantes_archivos values(p_hash,btrim(p_archivo),p_documentos,auth.uid(),now());
 for d in select value from jsonb_array_elements(p_documentos) loop
  if coalesce(d->>'cliente','') not in('FAVORITA','SANTAMARIA') or char_length(btrim(coalesce(d->>'referencia',''))) not between 1 and 100 or char_length(coalesce(d->>'banco',''))>200 or coalesce(d->>'fecha','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not isfinite((d->>'fecha')::date) or jsonb_typeof(d->'lineas') is distinct from 'array' then raise exception 'Identificación incompleta del pago.';end if;
  if jsonb_array_length(d->'lineas') not between 1 and 100 or coalesce(d->>'neto','')!~'^[0-9]+([.][0-9]{1,2})?$' or (d->>'neto')::numeric>=1000000000 then raise exception 'Detalle o neto inválido.';end if;
  suma:=0;facturas:=0;
  for l in select value from jsonb_array_elements(d->'lineas') loop
   if coalesce(l->>'tipo','') not in('FACTURA','DESCUENTO') or char_length(btrim(coalesce(l->>'clase',''))) not between 1 and 200 or char_length(btrim(coalesce(l->>'numero',''))) not between 1 and 100 or coalesce(l->>'fecha','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not isfinite((l->>'fecha')::date) or (l->>'fecha')::date>(d->>'fecha')::date then raise exception 'Documento o fecha incompletos.';end if;
   foreach campo in array array['valor','retencion','aplicado'] loop if coalesce(l->>campo,'')!~'^-?[0-9]+([.][0-9]{1,2})?$' then raise exception 'Revisa los importes del pago.';end if;v:=(l->>campo)::numeric;if abs(v)>=1000000000 then raise exception 'Importe fuera de rango.';end if;end loop;
   if l->>'tipo'='FACTURA' then
    facturas:=facturas+1;
    if l->>'numero'!~'^[0-9]{3}-[0-9]{3}-[0-9]{9}$' or (l->>'valor')::numeric<=0 or (l->>'retencion')::numeric<0 or (l->>'aplicado')::numeric<0 or (l->>'aplicado')::numeric+(l->>'retencion')::numeric<=0 or (l->>'aplicado')::numeric+(l->>'retencion')::numeric>(l->>'valor')::numeric then raise exception 'Revisa factura, pago parcial y retención.';end if;
   elsif (l->>'valor')::numeric>=0 or (l->>'aplicado')::numeric>=0 or (l->>'retencion')::numeric<>0 or abs((l->>'aplicado')::numeric)>abs((l->>'valor')::numeric) then raise exception 'Revisa los descuentos y sus importes aplicados.';end if;
   suma:=suma+(l->>'aplicado')::numeric;
  end loop;
  if facturas=0 or suma is distinct from (d->>'neto')::numeric or (select count(distinct j->>'numero') from jsonb_array_elements(d->'lineas') j where j->>'tipo'='FACTURA')<>facturas or (select count(*)-count(distinct (j->>'clase')||':'||(j->>'numero')) from jsonb_array_elements(d->'lineas') j where j->>'tipo'='DESCUENTO')<>0 then raise exception 'El pago no cuadra o repite documentos.';end if;
  canon:=d||jsonb_build_object('lineas',(select jsonb_agg(j-'fuente' order by ord) from jsonb_array_elements(d->'lineas') with ordinality x(j,ord)));
  perform pg_advisory_xact_lock(hashtextextended('cxc_pago_cliente:'||(d->>'cliente')||':'||(d->>'referencia')||':'||(d->>'fecha'),0));
  select * into r from public.fin_cxc_comprobantes_pago where cliente=d->>'cliente' and referencia=d->>'referencia' and fecha=(d->>'fecha')::date;
  if found then if r.datos is distinct from canon then raise exception 'El comprobante % ya está cargado con otro detalle. Revisa antes de reemplazarlo.',d->>'referencia';end if;repetidos:=repetidos+1;
  else insert into public.fin_cxc_comprobantes_pago(cliente,referencia,fecha,neto,datos,creado_por) values(d->>'cliente',d->>'referencia',(d->>'fecha')::date,(d->>'neto')::numeric,canon,auth.uid()) returning * into r;creados:=creados+1;end if;
  insert into public.fin_cxc_comprobantes_origen values(p_hash,r.id);
 end loop;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_IMPORTAR_COMPROBANTES',jsonb_build_object('hash',p_hash,'archivo',p_archivo,'creados',creados,'duplicados',repetidos));
 return jsonb_build_object('creados',creados,'duplicados',repetidos);
end $$;
create function public.fin_cxc_comprobantes_consultar(p_desde date,p_hasta date,p_cliente text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para consultar documentos de pago.' using errcode='42501';end if;
 if p_desde is null or p_hasta is null or not isfinite(p_desde) or not isfinite(p_hasta) or p_hasta<p_desde then raise exception 'Revisa el rango de fechas.';end if;
 return (select jsonb_build_object('total',(select count(*) from public.fin_cxc_comprobantes_pago d where d.fecha between p_desde and p_hasta and (coalesce(p_cliente,'')='' or d.cliente=p_cliente)),'filas',coalesce(jsonb_agg(to_jsonb(x) order by fecha desc,referencia),'[]'::jsonb)) from(select d.id,d.cliente,d.referencia,d.fecha,d.neto,d.version,d.operacion,(select min(a.archivo) from public.fin_cxc_comprobantes_origen o join public.fin_cxc_comprobantes_archivos a on a.hash=o.hash where o.documento_id=d.id) archivo,(select count(*) from jsonb_array_elements(d.datos->'lineas') j where j->>'tipo'='FACTURA') facturas from public.fin_cxc_comprobantes_pago d where d.fecha between p_desde and p_hasta and (coalesce(p_cliente,'')='' or d.cliente=p_cliente) order by d.fecha desc,d.referencia limit 500) x);
end $$;
create function public.fin_cxc_comprobante_previa(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.fin_cxc_comprobantes_pago%rowtype;c public.fin_cxc_saldos%rowtype;j record;filas jsonb:='[]';err text;auto_confirmar boolean;cantidad integer;descuentos numeric;usado numeric;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para consultar el comprobante.' using errcode='42501';end if;
 select * into d from public.fin_cxc_comprobantes_pago where id=p_id;if not found then raise exception 'Documento de pago no disponible.';end if;
 for j in select value l,(ordinality-1)::integer indice from jsonb_array_elements(d.datos->'lineas') with ordinality where value->>'tipo'='FACTURA' loop
  err:=null;auto_confirmar:=false;
  select count(*) into cantidad from public.fin_cxc_saldos where regexp_replace(comprobante,'[^0-9]','','g')=replace(j.l->>'numero','-','');
  c:=null;if cantidad=1 then select * into c from public.fin_cxc_saldos where regexp_replace(comprobante,'[^0-9]','','g')=replace(j.l->>'numero','-','');end if;
  if cantidad<>1 then err:=case when cantidad=0 then 'Factura no encontrada en Ventas.' else 'Hay más de una factura con ese número.' end;
  elsif not public.fin_cxc_cliente_documento(d.cliente,c.cliente) or not c.fuente_valida then err:='Cliente o fuente de ventas no coincide.';
  elsif c.verificada and c.total is distinct from (j.l->>'valor')::numeric then err:='El total confirmado difiere del comprobante.';
  elsif not c.verificada then
   auto_confirmar:=public.fin_cxc_puede(false) and c.total is null and c.revision=0 and c.cobrado=0 and c.retenido=0 and c.ajustado=0 and c.subtotal_importado=(j.l->>'valor')::numeric;
   if not auto_confirmar then err:='Verifica primero el total y vencimiento en Cuentas por cobrar.';end if;
  end if;
  if err is null and (j.l->>'aplicado')::numeric+(j.l->>'retencion')::numeric>(case when auto_confirmar then c.subtotal_importado else c.saldo end) then err:='El importe del documento supera el saldo; revisa cobros ya registrados.';end if;
  if err is null and nullif(j.l->>'referencia_retencion','') is not null and (j.l->>'retencion')::numeric>0 and exists(select 1 from public.fin_cxc_comprobantes_pago otro where otro.id<>d.id and otro.operacion is not null and otro.cliente=d.cliente and exists(select 1 from jsonb_array_elements(otro.datos->'lineas') l where l->>'numero'=j.l->>'numero' and l->>'referencia_retencion'=j.l->>'referencia_retencion' and (l->>'retencion')::numeric>0)) then err:='La retención ya está incluida en otro comprobante conciliado.';end if;
  filas:=filas||jsonb_build_array(jsonb_build_object('indice',j.indice,'linea',j.l,'cuenta',case when cantidad=1 then to_jsonb(c) else null end,'firma',md5(to_jsonb(c)::text),'confirmar_total',auto_confirmar,'error',err,'aviso',case when cantidad=1 and c.fecha_emision::text<>j.l->>'fecha' then 'La fecha del documento difiere de Ventas; verifica la factura.' end));
 end loop;
 select coalesce(-sum((l->>'aplicado')::numeric),0) into descuentos from jsonb_array_elements(d.datos->'lineas') l where l->>'tipo'='DESCUENTO';
 return jsonb_build_object('documento',to_jsonb(d),'facturas',filas,'descuentos',descuentos);
end $$;
create function public.fin_cxc_conciliar_comprobante(p_id uuid,p_operacion uuid,p_version uuid,p_deposito uuid,p_repartos jsonb,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare d public.fin_cxc_comprobantes_pago%rowtype;s public.fin_cxc_saldos%rowtype;linea jsonb;r record;previa jsonb;solicitud jsonb;vprevia jsonb;f jsonb;importe numeric;descuentos numeric;repartido numeric;usado numeric;neto_banco numeric:=0;cantidad integer;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para conciliar comprobantes.' using errcode='42501';end if;
 if p_id is null or p_operacion is null or p_version is null or jsonb_typeof(p_repartos) is distinct from 'array' or char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Revisa la conciliación y su motivo.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cxc_documento_pago:'||p_id::text,0));perform pg_advisory_xact_lock(hashtextextended('cxc_operacion:'||p_operacion::text,0));
 select * into d from public.fin_cxc_comprobantes_pago where id=p_id for update;if not found then raise exception 'Documento no disponible.';end if;
 solicitud:=jsonb_build_object('documento',p_id,'version',p_version,'deposito',p_deposito,'repartos',p_repartos,'motivo',p_motivo);
 select o.solicitud into previa from public.fin_cxc_operaciones o where o.id=p_operacion;
 if found then if previa is distinct from solicitud or d.operacion is distinct from p_operacion then raise exception 'Esta operación ya se utilizó o fue anulada. Actualiza el comprobante.';end if;return;end if;
 if d.operacion is not null or d.version<>p_version then raise exception 'El comprobante ya cambió o fue conciliado. Actualiza la lista.';end if;
 if d.neto>0 then
  if p_deposito is null then raise exception 'Selecciona el depósito del neto del comprobante.';end if;
  perform pg_advisory_xact_lock(hashtextextended('cxc_deposito:'||p_deposito::text,0));
  if not exists(select 1 from public.fin_cxc_depositos_saldos where id=p_deposito and not anulado and disponible>=d.neto) then raise exception 'El depósito no tiene disponible el neto completo.';end if;
 elsif p_deposito is not null then raise exception 'Una compensación de neto cero no utiliza depósito bancario.';end if;
 select count(*) into cantidad from jsonb_array_elements(d.datos->'lineas') l where l->>'tipo'='FACTURA';
 if jsonb_array_length(p_repartos)<>cantidad or (select count(distinct j->>'indice') from jsonb_array_elements(p_repartos) j)<>cantidad then raise exception 'Incluye todas las facturas del comprobante una sola vez.';end if;
 select coalesce(-sum((l->>'aplicado')::numeric),0) into descuentos from jsonb_array_elements(d.datos->'lineas') l where l->>'tipo'='DESCUENTO';
 repartido:=0;
 for r in select * from jsonb_to_recordset(p_repartos) x(indice integer,firma text,descuento numeric) loop
  linea:=d.datos->'lineas'->r.indice;
  if r.indice is null or r.indice<0 or linea is null or linea->>'tipo'<>'FACTURA' or r.descuento is null or r.descuento<0 or r.descuento<>round(r.descuento,2) or r.descuento>(linea->>'aplicado')::numeric then raise exception 'Revisa la distribución de descuentos.';end if;
  repartido:=repartido+r.descuento;
 end loop;
 if repartido<>descuentos then raise exception 'Los descuentos distribuidos no cuadran con el comprobante.';end if;
 -- Bloquea el consumo de cada nota/cargo para impedir reutilizarlo en otros pagos.
 for linea in select value from jsonb_array_elements(d.datos->'lineas') where value->>'tipo'='DESCUENTO' order by value->>'clase',value->>'numero' loop
  perform pg_advisory_xact_lock(hashtextextended('cxc_descuento:'||d.cliente||':'||(linea->>'clase')||':'||(linea->>'numero'),0));
  select coalesce(sum(aplicado),0) into usado from public.fin_cxc_descuentos_documento where cliente=d.cliente and clase=linea->>'clase' and numero=linea->>'numero' and not anulada;
  if usado+abs((linea->>'aplicado')::numeric)>abs((linea->>'valor')::numeric) or exists(select 1 from public.fin_cxc_descuentos_documento where cliente=d.cliente and clase=linea->>'clase' and numero=linea->>'numero' and not anulada and total<>abs((linea->>'valor')::numeric)) then raise exception 'El descuento % ya fue aplicado o su total cambió.',linea->>'numero';end if;
 end loop;
 vprevia:=public.fin_cxc_comprobante_previa(p_id);
 insert into public.fin_cxc_operaciones values(p_operacion,solicitud,auth.uid(),now());
 for r in select x.* from jsonb_to_recordset(p_repartos) x(indice integer,firma text,descuento numeric) order by d.datos->'lineas'->x.indice->>'numero' loop
  linea:=d.datos->'lineas'->r.indice;
  select value into f from jsonb_array_elements(vprevia->'facturas') where (value->>'indice')::integer=r.indice;
  if f is null or f->>'error' is not null then raise exception '%',coalesce(f->>'error','Factura no disponible.');end if;
  perform pg_advisory_xact_lock(hashtextextended('cxc_factura:'||(f->'cuenta'->>'comprobante'),0));
  perform 1 from public.com_ventas_detalle where comprobante=f->'cuenta'->>'comprobante' order by id for share;
  select * into s from public.fin_cxc_saldos where comprobante=f->'cuenta'->>'comprobante';
  if md5(to_jsonb(s)::text) is distinct from r.firma or md5(to_jsonb(s)::text) is distinct from f->>'firma' then raise exception 'La factura cambió; actualiza la vista previa.';end if;
  if (f->>'confirmar_total')::boolean then
   perform public.fin_cxc_confirmar_factura(s.comprobante,s.revision,s.huella,(linea->>'valor')::numeric,s.fecha_emision+21,'Total sin IVA según ventas y comprobante del cliente; plazo informado de 21 días');
   select * into s from public.fin_cxc_saldos where comprobante=f->'cuenta'->>'comprobante';
  end if;
  importe:=(linea->>'aplicado')::numeric-r.descuento;
  if not s.verificada or (linea->>'aplicado')::numeric+(linea->>'retencion')::numeric>s.saldo then raise exception 'El importe aplicado supera el saldo de la factura.';end if;
  insert into public.fin_cxc_aplicaciones(id,operacion,comprobante,deposito,efectivo,retencion,referencia_retencion,fecha_retencion,creado_por,ajuste,documento_pago) values(gen_random_uuid(),p_operacion,s.comprobante,p_deposito,importe,(linea->>'retencion')::numeric,'',null,auth.uid(),r.descuento,d.id);
  neto_banco:=neto_banco+importe;
 end loop;
 if neto_banco<>d.neto then raise exception 'El efectivo no cuadra con el neto del comprobante.';end if;
 for linea in select value from jsonb_array_elements(d.datos->'lineas') where value->>'tipo'='DESCUENTO' loop
  insert into public.fin_cxc_descuentos_documento(documento_id,operacion,cliente,clase,numero,total,aplicado) values(d.id,p_operacion,d.cliente,linea->>'clase',linea->>'numero',abs((linea->>'valor')::numeric),abs((linea->>'aplicado')::numeric));
 end loop;
 update public.fin_cxc_comprobantes_pago set operacion=p_operacion,version=gen_random_uuid() where id=d.id;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_CONCILIAR_COMPROBANTE',solicitud||jsonb_build_object('cliente',d.cliente,'referencia',d.referencia,'neto',d.neto,'descuentos',descuentos,'previa',vprevia));
end $$;
create function public.fin_cxc_anular_comprobante(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare d public.fin_cxc_comprobantes_pago%rowtype;r record;deposito_id uuid;
begin
 if not public.fin_cxc_puede(true) then raise exception 'No tienes permiso para anular el comprobante.' using errcode='42501';end if;
 if char_length(btrim(coalesce(p_motivo,''))) not between 5 and 500 then raise exception 'Explica el motivo de anulación.';end if;
 perform pg_advisory_xact_lock(hashtextextended('cxc_documento_pago:'||p_id::text,0));select * into d from public.fin_cxc_comprobantes_pago where id=p_id for update;if not found then raise exception 'Documento no disponible.';end if;if d.operacion is null then return;end if;
 select a.deposito into deposito_id from public.fin_cxc_aplicaciones a where a.operacion=d.operacion and not a.anulada and a.deposito is not null limit 1;
 if deposito_id is not null then perform pg_advisory_xact_lock(hashtextextended('cxc_deposito:'||deposito_id::text,0));end if;
 for r in select comprobante from public.fin_cxc_aplicaciones where operacion=d.operacion and not anulada order by comprobante loop perform pg_advisory_xact_lock(hashtextextended('cxc_factura:'||r.comprobante,0));end loop;
 update public.fin_cxc_aplicaciones set anulada=true where operacion=d.operacion;
 update public.fin_cxc_descuentos_documento set anulada=true where operacion=d.operacion;
 update public.fin_cxc_comprobantes_pago set operacion=null,version=gen_random_uuid() where id=d.id;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_CXC_ANULAR_COMPROBANTE',jsonb_build_object('documento',d.id,'operacion',d.operacion,'motivo',p_motivo));
end $$;
revoke all on function public.fin_cxc_cliente_documento(text,text),public.fin_cxc_importar_comprobantes(text,text,jsonb),public.fin_cxc_comprobantes_consultar(date,date,text),public.fin_cxc_comprobante_previa(uuid),public.fin_cxc_conciliar_comprobante(uuid,uuid,uuid,uuid,jsonb,text),public.fin_cxc_anular_comprobante(uuid,text) from public,anon,authenticated;
grant execute on function public.fin_cxc_importar_comprobantes(text,text,jsonb),public.fin_cxc_comprobantes_consultar(date,date,text),public.fin_cxc_comprobante_previa(uuid),public.fin_cxc_conciliar_comprobante(uuid,uuid,uuid,uuid,jsonb,text),public.fin_cxc_anular_comprobante(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
