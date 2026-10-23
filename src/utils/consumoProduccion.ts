import type { ReferenciaRecetaOp } from "./comparacionConsumosOp"

export type LineaConsumoProduccion = { materiaPrimaId: string; unidad: string; cantidad: number }
export type ConsumoProduccion = {
  version: 1; confirmado: boolean; referenciaReceta: string; observaciones: string
  lineas: LineaConsumoProduccion[]
}
export type MateriaConsumo = { id: string; codigo: string; nombre: string; unidad: string; saldo: number; iniciado?: boolean; esEmpaque?: boolean }
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s)
export function copiarConsumoProduccion(c: ConsumoProduccion): ConsumoProduccion {
  if (c.version !== 1 || c.confirmado !== true || !Array.isArray(c.lineas) || c.lineas.length > 200 ||
    typeof c.referenciaReceta !== "string" || c.referenciaReceta.length > 2000 ||
    typeof c.observaciones !== "string" || c.observaciones.length > 2000 || (!c.lineas.length && c.observaciones.trim().length < 10)) {
    throw new Error("Revisa y confirma los consumos reales de cada producto. Si no hubo consumo inventariable, explica el motivo.")
  }
  const ids = new Set<string>()
  return { version: 1, confirmado: true, referenciaReceta: c.referenciaReceta, observaciones: c.observaciones,
    lineas: c.lineas.map(l => {
      if (!uuid(l.materiaPrimaId) || ids.has(l.materiaPrimaId) || !["KG", "G", "L", "ML", "UNIDAD"].includes(l.unidad) ||
        !Number.isFinite(l.cantidad) || l.cantidad <= 0 || l.cantidad > 1e12 ||
        Math.abs(l.cantidad * 1e6 - Math.round(l.cantidad * 1e6)) > 0.0001 || (l.unidad === "UNIDAD" && !Number.isSafeInteger(l.cantidad))) {
        throw new Error("Revisa materiales repetidos, unidades y cantidades de consumo (máximo seis decimales).")
      }
      ids.add(l.materiaPrimaId)
      return { materiaPrimaId: l.materiaPrimaId, cantidad: l.cantidad, unidad: l.unidad }
    }) }
}

export function sugerirConsumoProduccion(ref: ReferenciaRecetaOp | undefined, unidades: number, materias: MateriaConsumo[], semi: boolean) {
  const avisos = [...(ref?.advertencias ?? [])], porId = new Map(materias.map(m => [m.id, m])), cantidades = new Map<string, number>()
  if (!ref?.componentes.length) avisos.push("No hay receta inequívoca disponible. Ingresa los materiales y cantidades realmente utilizados.")
  for (const c of ref?.componentes ?? []) {
    const m = c.materiaPrimaId ? porId.get(c.materiaPrimaId) : undefined
    if (!m || m.unidad !== c.unidad || !Number.isFinite(c.cantidadPorUnidad) || c.cantidadPorUnidad < 0) {
      avisos.push(`Revisa manualmente ${c.nombre}: no tiene vínculo o unidad segura.`); continue
    }
    if (semi && (c.esEmpaque || m.esEmpaque)) { avisos.push("El empaque del semielaborado se registra cuando se utiliza al etiquetar, desde el Kardex."); continue }
    cantidades.set(m.id, (cantidades.get(m.id) ?? 0) + c.cantidadPorUnidad * unidades)
  }
  const lineas = [...cantidades].map(([materiaPrimaId, n]) => ({ materiaPrimaId, unidad: porId.get(materiaPrimaId)!.unidad, cantidad: Math.round(n * 1e6) / 1e6 })).filter(l => l.cantidad > 0)
  if (lineas.some(l => l.unidad === "UNIDAD" && !Number.isInteger(l.cantidad))) avisos.push("Hay empaques fraccionados en la receta: corrige a las unidades realmente utilizadas.")
  return { consumo: { version: 1, confirmado: false, referenciaReceta: ref?.version ?? "Ingreso manual", observaciones: "", lineas } as ConsumoProduccion,
    avisos: [...new Set(avisos)] }
}
