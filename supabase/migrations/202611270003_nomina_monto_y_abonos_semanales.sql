begin;
set local lock_timeout='5s';
create table public.fin_nomina_montos_pagar (
 obligacion_id uuid primary key references public.fin_nomina_obligaciones(id) on delete cascade,
 monto numeric(14,2) not null check(monto>0),operacion uuid not null, responsable uuid not null,modificado_en timestamptz not null default now()
);
create table public.fin_programacion_operaciones(id uuid primary key,solicitud jsonb not null,responsable uuid not null,creado_en timestamptz not null default now());
alter table public.fin_nomina_montos_pagar enable row level security;
alter table public.fin_programacion_operaciones enable row level security;
revoke all on public.fin_nomina_montos_pagar,public.fin_programacion_operaciones from public,anon,authenticated;

-- El importe digitado en nómina es una propuesta de pago. El total ya registrado
-- de la obligación y sus pagos anteriores se conservan.
create or replace function public.fin_cargar_nomina_verificada(p_operacion uuid,p_periodo date,p_concepto text,p_filas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare solicitud jsonb;previa public.fin_nomina_cargas_operaciones%rowtype;antes jsonb;resultado jsonb;fila record;para_cargar jsonb;restante numeric;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Roles de pago') then raise exception 'No tienes permiso para cargar nómina.' using errcode='42501';end if;
 if p_operacion is null or jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Selecciona las personas y sus montos a pagar.';end if;
 if jsonb_array_length(p_filas) not between 1 and 200 or (select count(distinct x.empleado_id) from jsonb_to_recordset(p_filas) x(empleado_id uuid))<>jsonb_array_length(p_filas) then raise exception 'Selecciona entre 1 y 200 personas distintas.';end if;
 solicitud:=jsonb_build_object('periodo',p_periodo,'concepto',p_concepto,'filas',p_filas);
 perform pg_advisory_xact_lock(hashtextextended('fin_nomina_carga:'||p_operacion::text,0));
 select * into previa from public.fin_nomina_cargas_operaciones where id=p_operacion;
 if found then if previa.solicitud is distinct from solicitud then raise exception 'La operación ya se utilizó con otros datos.';end if;return previa.resultado;end if;
 for fila in select * from jsonb_to_recordset(p_filas) x(empleado_id uuid,monto numeric) order by empleado_id loop
  if fila.monto is null or not(fila.monto>0 and fila.monto<1000000000 and fila.monto=round(fila.monto,2)) then raise exception 'Revisa el monto a pagar.';end if;
  perform 1 from public.fin_nomina_empleados where id=fila.empleado_id for update;
 end loop;
 select coalesce(jsonb_object_agg(n.id::text,n.monto),'{}') into antes from public.fin_nomina_obligaciones n
 where n.periodo=p_periodo and n.concepto=p_concepto and n.empleado_id in(select x.empleado_id from jsonb_to_recordset(p_filas) x(empleado_id uuid));
 select jsonb_agg(jsonb_build_object('empleado_id',x.empleado_id,'monto',coalesce(n.monto,x.monto)) order by x.empleado_id) into para_cargar
 from jsonb_to_recordset(p_filas) x(empleado_id uuid,monto numeric) left join public.fin_nomina_obligaciones n on n.empleado_id=x.empleado_id and n.periodo=p_periodo and n.concepto=p_concepto;
 perform public.fin_cargar_nomina_cuentas(p_periodo,p_concepto,para_cargar);
 for fila in select n.*,x.monto solicitado from public.fin_nomina_obligaciones n join jsonb_to_recordset(p_filas) x(empleado_id uuid,monto numeric) on x.empleado_id=n.empleado_id where n.periodo=p_periodo and n.concepto=p_concepto order by n.id loop
  select fila.monto-coalesce(sum(valor),0) into restante from public.fin_pagos_compras where documento_id='nomina:'||fila.id::text;
  if restante>0 then
   if fila.solicitado>restante then raise exception 'El monto a pagar supera el saldo de %. Saldo disponible: USD %.',fila.nombre,restante;end if;
   insert into public.fin_nomina_montos_pagar values(fila.id,fila.solicitado,p_operacion,auth.uid(),now())
   on conflict(obligacion_id) do update set monto=excluded.monto,operacion=excluded.operacion,responsable=excluded.responsable,modificado_en=now();
  end if;
 end loop;
 select jsonb_build_object('operacion',p_operacion,'filas',jsonb_agg(jsonb_build_object('id','nomina:'||n.id::text,'nombre',n.nombre,'periodo',n.periodo,'concepto',n.concepto,'monto',x.monto,'total',n.monto,'pagado',coalesce(p.pagado,0),'saldo',greatest(n.monto-coalesce(p.pagado,0),0),
 'estado',case when not(antes?n.id::text) then 'CREADA' when coalesce(p.pagado,0)>=n.monto then 'YA_PAGADA' else 'PREPARADA' end) order by n.nombre,n.id)) into resultado
 from public.fin_nomina_obligaciones n join jsonb_to_recordset(p_filas) x(empleado_id uuid,monto numeric) on x.empleado_id=n.empleado_id
 left join lateral(select sum(a.valor) pagado from public.fin_pagos_compras a where a.documento_id='nomina:'||n.id::text) p on true where n.periodo=p_periodo and n.concepto=p_concepto;
 insert into public.fin_nomina_cargas_operaciones values(p_operacion,solicitud,resultado,auth.uid(),now());
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_NOMINA_PREPARAR_PAGO',solicitud||resultado);
 return resultado;
end $$;
create function public.fin_consultar_montos_nomina(p_documentos text[]) returns table(documento_id text,monto numeric)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.fin_puede_consultar_cuentas() then raise exception 'No tienes permiso para consultar montos de nómina.' using errcode='42501';end if;
 if coalesce(cardinality(p_documentos),0)>500 then raise exception 'Consulta hasta 500 documentos.';end if;
 return query select 'nomina:'||m.obligacion_id::text,m.monto from public.fin_nomina_montos_pagar m where 'nomina:'||m.obligacion_id::text=any(p_documentos);
end $$;

-- Cada envío tiene identidad propia. Solo se reabre una programación totalmente
-- ejecutada, acumulando lo anterior sin volver a registrar ese dinero como pago.
create function public.fin_programar_compras_operacion(p_operacion uuid,p_semana date,p_filas jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare solicitud jsonb;previa jsonb;fila record;c public.fin_vw_cuentas_por_pagar_compras%rowtype;plan public.fin_programacion_compras%rowtype;
begin
 if not public.fin_puede_consultar_cuentas() then raise exception 'No tienes permiso para programar pagos.' using errcode='42501';end if;
 if p_operacion is null or p_semana is null or not isfinite(p_semana) or extract(isodow from p_semana)<>1 or jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'Revisa semana y selección de pagos.';end if;
 if jsonb_array_length(p_filas) not between 1 and 200 or (select count(distinct x.id) from jsonb_to_recordset(p_filas) x(id text))<>jsonb_array_length(p_filas) then raise exception 'Selecciona hasta 200 documentos distintos.';end if;
 solicitud:=jsonb_build_object('tipo','ENVIAR','semana',p_semana,'filas',p_filas);
 perform pg_advisory_xact_lock(hashtextextended('fin_plan_operacion:'||p_operacion::text,0));
 select o.solicitud into previa from public.fin_programacion_operaciones o where id=p_operacion;
 if found then if previa is distinct from solicitud then raise exception 'Esta operación ya se utilizó con otros datos.';end if;return;end if;
 -- La propuesta tiene FK a nómina: bloquea primero todas las personas en el
 -- mismo orden de la carga, antes de tomar documentos o verificar esa FK.
 for fila in select distinct n.empleado_id from public.fin_nomina_obligaciones n
  join jsonb_to_recordset(p_filas) x(id text) on x.id='nomina:'||n.id::text order by n.empleado_id loop
  perform 1 from public.fin_nomina_empleados where id=fila.empleado_id for update;
 end loop;
 for fila in select * from jsonb_to_recordset(p_filas) x(id text,monto numeric,verificado boolean) order by id loop
  perform public.fin_bloquear_documento_compra(fila.id);
  select * into c from public.fin_vw_cuentas_por_pagar_compras where id=fila.id;
  if not found or fila.monto is null or not(fila.monto>0 and fila.monto<1000000000 and fila.monto=round(fila.monto,2)) or c.saldo is null or fila.monto>c.saldo then raise exception 'El monto a pagar supera el saldo o no es válido (%).',fila.id;end if;
  if c.origen='CLASIFICACION_GASTOS' and not coalesce(fila.verificado,false) then raise exception 'Verifica el saldo del documento histórico antes de programarlo.';end if;
  if c.semana_activa is not null then raise exception 'La cuenta ya tiene un pago pendiente en la semana del %. Revísalo antes de enviar otro.',c.semana_activa;end if;
  select * into plan from public.fin_programacion_compras where semana=p_semana and documento_id=fila.id for update;
  if found then
   if plan.pagado<>plan.monto then raise exception 'La programación ya tiene un pago pendiente. Actualiza Pagos semanales.';end if;
   if plan.pagado+fila.monto>=1000000000000 then raise exception 'Importe acumulado fuera de rango.';end if;
   update public.fin_programacion_compras set monto=plan.pagado+fila.monto,confirmado_por=auth.uid() where semana=p_semana and documento_id=fila.id;
  else perform public.fin_programar_compras(p_semana,jsonb_build_array(jsonb_build_object('id',fila.id,'monto',fila.monto,'verificado',fila.verificado)));end if;
  if c.tipo='NOMINA' then
   insert into public.fin_nomina_montos_pagar values(substr(fila.id,8)::uuid,fila.monto,p_operacion,auth.uid(),now())
   on conflict(obligacion_id) do update set monto=excluded.monto,operacion=excluded.operacion,responsable=excluded.responsable,modificado_en=now();
  end if;
 end loop;
 insert into public.fin_programacion_operaciones values(p_operacion,solicitud,auth.uid(),now());
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_COMPRAS_ENVIAR_PAGO',solicitud||jsonb_build_object('operacion',p_operacion));
end $$;
create function public.fin_quitar_pendiente_programado(p_operacion uuid,p_semana date,p_documento text,p_monto numeric,p_pagado numeric) returns void
language plpgsql security definer set search_path='' as $$
declare solicitud jsonb;previa jsonb;plan public.fin_programacion_compras%rowtype;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Pagos semanales') then raise exception 'No tienes permiso para retirar programaciones.' using errcode='42501';end if;
 if p_operacion is null or p_semana is null or p_documento is null or p_monto is null or p_pagado is null then raise exception 'Revisa la programación a retirar.';end if;
 solicitud:=jsonb_build_object('tipo','QUITAR','semana',p_semana,'documento',p_documento,'monto',p_monto,'pagado',p_pagado);
 perform pg_advisory_xact_lock(hashtextextended('fin_plan_operacion:'||p_operacion::text,0));
 select o.solicitud into previa from public.fin_programacion_operaciones o where id=p_operacion;
 if found then if previa is distinct from solicitud then raise exception 'Esta operación ya se utilizó con otros datos.';end if;return;end if;
 perform public.fin_bloquear_documento_compra(p_documento);
 select * into plan from public.fin_programacion_compras where semana=p_semana and documento_id=p_documento for update;
 if not found or plan.monto is distinct from p_monto or plan.pagado is distinct from p_pagado then raise exception 'La programación cambió. Actualiza antes de quitarla.';end if;
 if plan.monto<=plan.pagado then raise exception 'La programación ya está ejecutada.';end if;
 if plan.pagado=0 then delete from public.fin_programacion_compras where semana=p_semana and documento_id=p_documento;
 else update public.fin_programacion_compras set monto=pagado where semana=p_semana and documento_id=p_documento;end if;
 insert into public.fin_programacion_operaciones values(p_operacion,solicitud,auth.uid(),now());
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_COMPRAS_QUITAR_PENDIENTE',solicitud||jsonb_build_object('operacion',p_operacion,'pendiente_retirado',plan.monto-plan.pagado));
end $$;
revoke all on function public.fin_cargar_nomina_verificada(uuid,date,text,jsonb),public.fin_consultar_montos_nomina(text[]),public.fin_programar_compras_operacion(uuid,date,jsonb),public.fin_quitar_pendiente_programado(uuid,date,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.fin_cargar_nomina_verificada(uuid,date,text,jsonb),public.fin_consultar_montos_nomina(text[]),public.fin_programar_compras_operacion(uuid,date,jsonb),public.fin_quitar_pendiente_programado(uuid,date,text,numeric,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
