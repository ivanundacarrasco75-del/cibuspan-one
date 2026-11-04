export type PeriodoProduccion = { desde: string; hasta: string }
function fechaValida(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T12:00:00Z")) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s
}
export function validarPeriodoProduccion(p: PeriodoProduccion): PeriodoProduccion {
  if (!p || !fechaValida(p.desde) || !fechaValida(p.hasta) || p.desde > p.hasta || (Date.parse(p.hasta + "T12:00:00Z") - Date.parse(p.desde + "T12:00:00Z")) / 86400000 > 365) throw new Error("Elige fechas de entrega válidas, desde menor o igual a hasta y hasta 366 días por consulta.")
  return { desde: p.desde, hasta: p.hasta }
}
export function periodoProduccionInicial(ahora = new Date()): PeriodoProduccion {
  const partes = new Intl.DateTimeFormat("en", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora)
  const campo = (tipo: string) => partes.find(p => p.type === tipo)!.value
  const desde = `${campo("year")}-${campo("month")}-${campo("day")}`
  const siguiente = new Date(desde + "T12:00:00Z"); siguiente.setUTCDate(siguiente.getUTCDate() + 1)
  return { desde, hasta: siguiente.toISOString().slice(0, 10) }
}
export function mismoPeriodoProduccion(a: PeriodoProduccion | null, b: PeriodoProduccion) { return !!a && a.desde === b.desde && a.hasta === b.hasta }
