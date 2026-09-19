-- CIBUSPAN ONE
-- Optimiza el historial de devoluciones para los filtros del dashboard.

create index if not exists devoluciones_fecha_creado_id_idx
  on public.devoluciones (
    fecha_devolucion desc,
    creado_en desc,
    id desc
  );

create index if not exists devolucion_detalles_devolucion_id_idx
  on public.devolucion_detalles (devolucion_id);
