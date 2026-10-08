import type { OrdenProduccionImportar, ResultadoOrdenesProduccionExcel } from "./ordenesProduccionExcel"

export const claveOrdenHistorica = (orden: OrdenProduccionImportar) => `${orden.numero_orden}|${orden.producto_codigo}`

export function ajustarFechasOrdenesHistoricas(
  resultado: ResultadoOrdenesProduccionExcel,
  fechas: Record<string, string>,
): ResultadoOrdenesProduccionExcel {
  const ordenes = resultado.ordenes.map((orden) => {
    const propuesta = fechas[claveOrdenHistorica(orden)] ?? orden.fecha_produccion
    const parsed = new Date(`${propuesta}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(propuesta) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== propuesta) {
      throw new Error(`Indica una fecha válida para la OP ${orden.numero_orden} · ${orden.producto_nombre}.`)
    }
    const nota = propuesta !== orden.fecha_produccion
      ? `Fecha de producción corregida en la importación: ${orden.fecha_produccion} → ${propuesta}. Se conservan las fechas originales del documento.`
      : "Fecha de producción provisional tomada del documento contable; puede diferir del día real de producción."
    return { ...orden, fecha_produccion: propuesta, observaciones: [orden.observaciones, nota].filter(Boolean).join(" ") }
  }).sort((a, b) => a.fecha_produccion.localeCompare(b.fecha_produccion) || a.numero_orden.localeCompare(b.numero_orden))
  return {
    ...resultado, ordenes,
    fechaDesde: ordenes[0]?.fecha_produccion ?? resultado.fechaDesde,
    fechaHasta: ordenes.at(-1)?.fecha_produccion ?? resultado.fechaHasta,
  }
}
