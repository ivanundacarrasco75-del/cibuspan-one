import type { GeorreferenciaCampo, FotoCampo } from "./georreferenciaCampo"

export type RegistroSupervision = {
  id: string
  fecha: string
  visitado_en: string
  cliente_id: string
  local_id: string
  local_nombre: string
  producto_id: string
  producto_nombre: string
  responsable_id: string
  responsable_nombre: string
  responsable_rol: string | null
  caras_percha: number | null
  stock_local_unidades: number | null
  rotacion_diaria_unidades: number | null
  presencia_percha: string
  observaciones: string | null
  georreferencia?: GeorreferenciaCampo | null
  fotos_georreferencia?: FotoCampo[]
}

export function leerCarasPercha(datosIa: unknown): number | null {
  if (!datosIa || typeof datosIa !== "object" || Array.isArray(datosIa)) return null
  const valor = (datosIa as Record<string, unknown>).caras_percha
  if (typeof valor !== "number" && typeof valor !== "string") return null
  if (typeof valor === "string" && valor.trim() === "") return null
  const numero = Number(valor)
  return Number.isSafeInteger(numero) && numero >= 0 ? numero : null
}

export function inicioSemanaCampo(fecha: string) {
  const dia = new Date(`${fecha.slice(0, 10)}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7))
  return dia.toISOString().slice(0, 10)
}

export function compararSupervision(registros: RegistroSupervision[]) {
  const mercaderistas = registros.filter((r) => r.responsable_rol === "MERCADERISTA")
  return registros.filter((r) => r.responsable_rol === "KAM").map((kam) => {
    const candidatas = mercaderistas.filter((m) =>
      m.cliente_id === kam.cliente_id && m.local_id === kam.local_id &&
      m.producto_id === kam.producto_id && m.responsable_id !== kam.responsable_id &&
      inicioSemanaCampo(m.fecha) === inicioSemanaCampo(kam.fecha)
    )
    const instanteKam = Date.parse(kam.visitado_en)
    candidatas.sort((a, b) =>
      Number(b.fecha === kam.fecha) - Number(a.fecha === kam.fecha) ||
      Math.abs(Date.parse(a.visitado_en) - instanteKam) - Math.abs(Date.parse(b.visitado_en) - instanteKam) ||
      a.id.localeCompare(b.id)
    )
    const mercaderista = candidatas[0] ?? null
    const diferencias: string[] = []
    const faltantes: string[] = []
    if (mercaderista) {
      for (const [campo, etiqueta] of [
        ["caras_percha", "Caras"], ["stock_local_unidades", "Stock"],
        ["rotacion_diaria_unidades", "Rotación"], ["presencia_percha", "Presencia"],
      ] as const) {
        const a = mercaderista[campo], b = kam[campo]
        if (a == null || b == null || a === "NO_REVISADO" || b === "NO_REVISADO") faltantes.push(etiqueta)
        else if (a !== b) diferencias.push(etiqueta)
      }
    }
    return { kam, mercaderista, diferencias, faltantes, mismoDia: mercaderista?.fecha === kam.fecha }
  })
}
