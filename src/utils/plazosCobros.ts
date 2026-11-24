import type { FacturaCobro } from "../repositories/cobrosRepository"

const reglas = [
  { dias: 21, nombres: ["FAVORITA", "CORPORACIONFAVORITA", "CORPORACIONFAVORITACA", "ROSADO", "ELROSADO", "CORPORACIONELROSADO", "CORPORACIONELROSADOSA", "SANTAMARIA", "MEGASANTAMARIA", "MEGASANTAMARIASA"] },
  { dias: 60, nombres: ["TUTI", "TIENDASTUTI", "TIENDASTUTITTDESA"] },
  { dias: 0, nombres: ["SOLDMER", "SOLDMERSA", "SOLDMERSAA"] },
]
const iso = (fecha: Date) => fecha.toISOString().slice(0, 10)
function fechaValida(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null
  const fecha = new Date(valor + "T12:00:00Z")
  return Number.isFinite(fecha.getTime()) && iso(fecha) === valor ? fecha : null
}
function sumarDias(valor: string, dias: number) {
  const fecha = fechaValida(valor)
  if (!fecha) return null
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return iso(fecha)
}
export function semanaEmisionCobro(valor: string) {
  const fecha = fechaValida(valor)
  if (!fecha) return null
  fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay() + 6) % 7)
  const desde = iso(fecha), hasta = sumarDias(desde, 6)!
  const jueves = new Date(fecha); jueves.setUTCDate(jueves.getUTCDate() + 3)
  const anio = jueves.getUTCFullYear(), primero = new Date(Date.UTC(anio, 0, 1, 12))
  const numero = Math.ceil(((jueves.getTime() - primero.getTime()) / 86400000 + 1) / 7)
  return { desde, hasta, etiqueta: `${anio}-S${String(numero).padStart(2, "0")}` }
}
export function plazoClienteCobro(cliente: string) {
  const nombre = cliente.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  return reglas.find(r => r.nombres.includes(nombre))?.dias ?? null
}
type FuentePlazo = Pick<FacturaCobro, "cliente" | "fecha_emision" | "vencimiento" | "fuente_valida">
export function previsionCobro(factura: FuentePlazo) {
  if (!factura.fuente_valida) return null
  const emision = semanaEmisionCobro(factura.fecha_emision), dias = plazoClienteCobro(factura.cliente)
  if (!emision) return null
  const sugerida = dias === null ? null : sumarDias(factura.fecha_emision, dias)
  if (factura.vencimiento && factura.vencimiento !== sugerida) {
    const semana = semanaEmisionCobro(factura.vencimiento)
    return semana ? { fecha: factura.vencimiento, desde: semana.desde, hasta: semana.hasta, dias, origen: "manual" as const } : null
  }
  if (dias === null || !sugerida) return null
  // Desplaza la semana completa de emisión por el plazo y amplía a semanas
  // completas de pago. Un plazo de 60 días puede abarcar dos semanas.
  const desde = semanaEmisionCobro(sumarDias(emision.desde, dias)!)!.desde
  const hasta = semanaEmisionCobro(sumarDias(emision.hasta, dias)!)!.hasta
  return { fecha: sugerida, desde, hasta, dias, origen: "regla" as const }
}
export function ventanasCobros(facturas: FuentePlazo[]) {
  const intervalos = facturas.flatMap(f => { const p = previsionCobro(f); return p ? [{ desde: p.desde, hasta: p.hasta }] : [] })
    .sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta))
  const unidas: Array<{ desde: string; hasta: string }> = []
  for (const intervalo of intervalos) {
    const anterior = unidas.at(-1)
    if (anterior && intervalo.desde <= sumarDias(anterior.hasta, 1)!) anterior.hasta = anterior.hasta > intervalo.hasta ? anterior.hasta : intervalo.hasta
    else unidas.push({ ...intervalo })
  }
  return unidas
}
export function depositoEnSemanasCobro(fecha: string, ventanas: Array<{ desde: string; hasta: string }>) {
  return ventanas.some(v => fecha >= v.desde && fecha <= v.hasta)
}
export function rangoMesCobros(mes: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null
  const ultimo = new Date(`${mes}-01T12:00:00Z`)
  if (!Number.isFinite(ultimo.getTime())) return null
  ultimo.setUTCMonth(ultimo.getUTCMonth() + 1, 0)
  return { desde: `${mes}-01`, hasta: iso(ultimo) }
}
