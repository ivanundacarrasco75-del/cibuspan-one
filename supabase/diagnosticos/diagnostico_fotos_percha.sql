-- Solo lectura: distingue objetos físicos de referencias a capturas.
-- Ninguna fila de storage ni visita se borra mediante SQL.
with protegidas as (
  select distinct ruta from public.com_visitas_campo_sku s
  cross join lateral unnest(s.capturas_app) a(ruta) where ruta is not null
), objetos as (
  select o.id::text id,o.bucket_id,o.name ruta,o.updated_at::text actualizado_en,
    case when o.metadata->>'size' ~ '^[0-9]{1,18}$' then (o.metadata->>'size')::bigint else null end bytes
  from storage.objects o where o.bucket_id='visitas-campo'
)
select jsonb_build_object(
  'tipo','diagnostico_fotos_percha','version',1,
  'generado_en',now(),
  'capturas_protegidas',coalesce((select jsonb_agg(ruta order by ruta) from protegidas),'[]'::jsonb),
  'objetos',coalesce((select jsonb_agg(to_jsonb(o) order by ruta) from objetos o),'[]'::jsonb)
) diagnostico_fotos_percha;
