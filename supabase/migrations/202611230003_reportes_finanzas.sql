begin;
set local lock_timeout='5s';

create function public.fin_fecha_reporte(p_fecha text) returns date language plpgsql immutable set search_path='' as $$
begin
 if coalesce(p_fecha,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
 return p_fecha::date;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $$;

create function public.fin_reporte_pagos(p_desde date,p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
  raise exception 'No tienes permiso para consultar reportes financieros.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or not isfinite(p_desde) or not isfinite(p_hasta) or p_hasta<p_desde then
  raise exception 'Selecciona un rango de fechas válido.'; end if;
 with movimientos as (
  select distinct on(c.id,coalesce(nullif(a.p->>'id',''),a.orden::text))
   c.id as documento_id,coalesce(nullif(a.p->>'id',''),a.orden::text) as movimiento,
   public.fin_fecha_reporte(a.p->>'fecha') as fecha_pago,c.proveedor,c.numero_documento,c.concepto,c.tipo,c.origen,
   a.p->>'documento' as referencia,case when coalesce(a.p->>'valor','') ~ '^[0-9]+([.][0-9]{1,2})?$' then (a.p->>'valor')::numeric end as valor
  from public.fin_vw_cuentas_por_pagar_compras c
  cross join lateral jsonb_array_elements(c.pagos) with ordinality a(p,orden)
  where a.p->>'clase' is distinct from 'APLICACION_ANTICIPO'
   and coalesce(a.p->>'valor','') ~ '^[0-9]+([.][0-9]{1,2})?$'
   and case when coalesce(a.p->>'valor','') ~ '^[0-9]+([.][0-9]{1,2})?$' then (a.p->>'valor')::numeric>0 else false end
  order by c.id,coalesce(nullif(a.p->>'id',''),a.orden::text),a.orden
 ), filas as (select * from movimientos where fecha_pago between p_desde and p_hasta)
 select jsonb_build_object('filas',coalesce((select jsonb_agg(to_jsonb(f) order by fecha_pago,documento_id,movimiento) from filas f),'[]'::jsonb),
  'total',coalesce((select sum(valor) from filas),0),'documentos',(select count(distinct documento_id) from filas),
  'movimientos',(select count(*) from filas),'sin_fecha',(select count(*) from movimientos where fecha_pago is null)) into resultado;
 return resultado;
end $$;

create function public.fin_reporte_recepciones_mp(p_desde date,p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin
 if not public.fin_puede_modulo('Pagos y Finanzas · Cuentas por Pagar') then
  raise exception 'No tienes permiso para consultar reportes financieros.' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or not isfinite(p_desde) or not isfinite(p_hasta) or p_hasta<p_desde then
  raise exception 'Selecciona un rango de fechas válido.'; end if;
 with filas as (
  select r.documento_id,r.fecha as fecha_ingreso,
   coalesce(r.factura->'edicion'->>'serie',r.factura->'factura'->>'serie','') as numero_documento,
   coalesce(r.factura->'edicion'->>'proveedor',r.factura->'factura'->>'proveedor','') as proveedor,
   m.p->>'movimiento_id' as movimiento,m.p->>'linea' as linea,mp.codigo as codigo_material,
   coalesce(m.p->>'nombre',mp.nombre,'') as material,coalesce(m.p->>'unidad',mp.unidad_base,'') as unidad,
   (m.p->>'cantidad')::numeric as cantidad,
   case when coalesce(i.d->>'subtotal','') ~ '^[0-9]+([.][0-9]+)?$' then round((i.d->>'subtotal')::numeric,2) end as subtotal_facturado
  from public.compras_recepciones_mp r cross join lateral jsonb_array_elements(r.movimientos) m(p)
  left join public.materias_primas mp on mp.id=(m.p->>'articulo_id')::uuid
  cross join lateral (select r.factura->'factura'->'items'->((m.p->>'linea')::integer) as d) i
  where r.fecha between p_desde and p_hasta
 )
 select jsonb_build_object('filas',coalesce((select jsonb_agg(to_jsonb(f) order by fecha_ingreso,documento_id,linea) from filas f),'[]'::jsonb),
  'recepciones',(select count(distinct documento_id) from filas),'lineas',(select count(*) from filas),
  'cantidades',coalesce((select jsonb_agg(to_jsonb(g) order by unidad) from (select unidad,sum(cantidad) as cantidad from filas group by unidad) g),'[]'::jsonb)) into resultado;
 return resultado;
end $$;
revoke all on function public.fin_reporte_pagos(date,date),public.fin_reporte_recepciones_mp(date,date) from public,anon,authenticated;
grant execute on function public.fin_reporte_pagos(date,date),public.fin_reporte_recepciones_mp(date,date) to authenticated;
commit;
