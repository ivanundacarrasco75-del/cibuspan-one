begin;
set local lock_timeout='5s';
create table public.fin_nomina_cargas_operaciones(id uuid primary key,solicitud jsonb not null,resultado jsonb not null,creado_por uuid not null,creado_en timestamptz not null default now());
alter table public.fin_nomina_cargas_operaciones enable row level security;
revoke all on public.fin_nomina_cargas_operaciones from public,anon,authenticated;
create table public.fin_nomina_correcciones_monto(id uuid primary key,documento text not null,anterior jsonb not null,nuevo numeric(14,2) not null,motivo text not null,responsable uuid not null,creado_en timestamptz not null default now());
alter table public.fin_nomina_correcciones_monto enable row level security;
revoke all on public.fin_nomina_correcciones_monto from public,anon,authenticated;
create function public.fin_corregir_monto_nomina(p_operacion uuid,p_documento text,p_anterior numeric,p_total numeric,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare n public.fin_nomina_obligaciones%rowtype;r public.fin_nomina_correcciones_monto%rowtype;persona uuid;pagos_registrados numeric;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then raise exception 'No tienes permiso para corregir cuentas de nómina.' using errcode='42501';end if;
 p_motivo:=btrim(p_motivo);
 if p_operacion is null or coalesce(p_documento,'')!~'^nomina:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or p_anterior is null or p_total is null or not(p_total>0 and p_total<1000000000 and p_total=round(p_total,2)) or char_length(coalesce(p_motivo,'')) not between 5 and 500 then raise exception 'Revisa monto y motivo de corrección.';end if;
 perform pg_advisory_xact_lock(hashtextextended('fin_nomina_correccion:'||p_operacion::text,0));
 select * into r from public.fin_nomina_correcciones_monto where id=p_operacion;
 if found then if r.documento<>p_documento or (r.anterior->>'monto')::numeric<>p_anterior or r.nuevo<>p_total or r.motivo<>p_motivo then raise exception 'Esta operación ya se utilizó con otros datos.';end if;return;end if;
 select empleado_id into persona from public.fin_nomina_obligaciones where id=substr(p_documento,8)::uuid;
 if not found then raise exception 'Cuenta de nómina no disponible.';end if;
 perform 1 from public.fin_nomina_empleados where id=persona for update;
 perform public.fin_bloquear_documento_compra(p_documento);
 select * into n from public.fin_nomina_obligaciones where id=substr(p_documento,8)::uuid for update;
 if not found or n.monto is distinct from p_anterior then raise exception 'La cuenta cambió. Actualiza antes de corregirla.';end if;
 select coalesce(sum(valor),0) into pagos_registrados from public.fin_pagos_compras where documento_id=p_documento;
 if p_total<pagos_registrados then raise exception 'El monto no puede ser menor que los pagos registrados (USD %).',pagos_registrados;end if;
 if exists(select 1 from public.fin_programacion_compras plan where plan.documento_id=p_documento and plan.monto-plan.pagado>p_total-pagos_registrados) then raise exception 'El nuevo saldo no cubre la programación. Revisa primero Pagos semanales.';end if;
 insert into public.fin_nomina_correcciones_monto values(p_operacion,p_documento,to_jsonb(n),p_total,p_motivo,auth.uid(),now());
 update public.fin_nomina_obligaciones set monto=p_total where id=n.id;
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_NOMINA_CORREGIR_MONTO',jsonb_build_object('operacion',p_operacion,'documento',p_documento,'anterior',to_jsonb(n),'monto',p_total,'pagado',pagos_registrados,'saldo',p_total-pagos_registrados,'motivo',p_motivo));
end $$;
create function public.fin_cargar_nomina_verificada(p_operacion uuid,p_periodo date,p_concepto text,p_filas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare solicitud jsonb; previa public.fin_nomina_cargas_operaciones%rowtype; antes jsonb;resultado jsonb;fila record;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Roles de pago') then raise exception 'No tienes permiso para cargar nómina.' using errcode='42501';end if;
 if p_operacion is null or jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) not between 1 and 200 then raise exception 'Selecciona entre 1 y 200 personas.';end if;
 solicitud:=jsonb_build_object('periodo',p_periodo,'concepto',p_concepto,'filas',p_filas);
 perform pg_advisory_xact_lock(hashtextextended('fin_nomina_carga:'||p_operacion::text,0));
 select * into previa from public.fin_nomina_cargas_operaciones where id=p_operacion;
 if found then if previa.solicitud is distinct from solicitud then raise exception 'La operación ya se utilizó con otros datos.';end if;return previa.resultado;end if;
 -- Mismo orden de bloqueo que la carga original y el retiro de cuentas.
 for fila in select x.empleado_id from jsonb_to_recordset(p_filas) x(empleado_id uuid) order by x.empleado_id loop
  perform 1 from public.fin_nomina_empleados where id=fila.empleado_id for update;
 end loop;
 select coalesce(jsonb_object_agg(n.id::text,n.monto),'{}') into antes from public.fin_nomina_obligaciones n
 where n.periodo=p_periodo and n.concepto=p_concepto and n.empleado_id in(select x.empleado_id from jsonb_to_recordset(p_filas) x(empleado_id uuid));
 perform public.fin_cargar_nomina_cuentas(p_periodo,p_concepto,p_filas);
 select jsonb_build_object('operacion',p_operacion,'filas',jsonb_agg(jsonb_build_object('id','nomina:'||n.id::text,'nombre',n.nombre,'periodo',n.periodo,'concepto',n.concepto,'monto',n.monto,
 'estado',case when not (antes?n.id::text) then 'CREADA' when (antes->>n.id::text)::numeric<>n.monto then 'ACTUALIZADA' when coalesce(p.pagado,0)>=n.monto then 'YA_PAGADA' else 'YA_EXISTIA' end) order by n.nombre,n.id)) into resultado
 from public.fin_nomina_obligaciones n left join lateral(select sum(a.valor) pagado from public.fin_pagos_compras a where a.documento_id='nomina:'||n.id::text) p on true
 where n.periodo=p_periodo and n.concepto=p_concepto and n.empleado_id in(select x.empleado_id from jsonb_to_recordset(p_filas) x(empleado_id uuid));
 insert into public.fin_nomina_cargas_operaciones values(p_operacion,solicitud,resultado,auth.uid(),now());
 insert into public.app_audit_log(actor_user_id,accion,detalle) values(auth.uid(),'FIN_NOMINA_CARGA_VERIFICADA',solicitud||resultado);
 return resultado;
end $$;
-- Búsqueda por palabras, sin distinguir tildes ni orden del nombre/apellido.
create function public.fin_buscar_cuentas(p_buscar text) returns setof public.fin_vw_cuentas_por_pagar_compras
language plpgsql stable security definer set search_path='' as $$
declare terminos text[];
begin
 if not public.fin_puede_consultar_cuentas() then raise exception 'No tienes permiso para Cuentas por pagar.' using errcode='42501';end if;
 if char_length(coalesce(p_buscar,''))>300 then raise exception 'Escribe hasta 300 caracteres para buscar.';end if;
 terminos:=regexp_split_to_array(btrim(translate(upper(coalesce(p_buscar,'')),'ÁÉÍÓÚÜÑ','AEIOUUN')),'[[:space:]]+');
 return query select c.* from public.fin_vw_cuentas_por_pagar_compras c where not exists(select 1 from unnest(terminos) t where t<>'' and strpos(translate(upper(coalesce(c.busqueda,'')||' '||coalesce(c.proveedor,'')||' '||coalesce(c.numero_documento,'')||' '||coalesce(c.concepto,'')),'ÁÉÍÓÚÜÑ','AEIOUUN'),t)=0);
end $$;
revoke all on function public.fin_cargar_nomina_verificada(uuid,date,text,jsonb),public.fin_buscar_cuentas(text),public.fin_corregir_monto_nomina(uuid,text,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.fin_cargar_nomina_verificada(uuid,date,text,jsonb),public.fin_buscar_cuentas(text),public.fin_corregir_monto_nomina(uuid,text,numeric,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
