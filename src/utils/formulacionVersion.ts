import type { FormulaVersionFmDb } from "../repositories/formulaRepository"

export function fechaFormulacionHoy() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

export function nombreVersionFormula(version: FormulaVersionFmDb) {
  return version.observaciones?.match(/^Nombre de versión: (.+)$/m)?.[1] ?? `V${version.numero_version}`
}

export function etiquetaVersionFormula(version: FormulaVersionFmDb) {
  const nombre = nombreVersionFormula(version)
  return `${nombre === `V${version.numero_version}` ? nombre : `V${version.numero_version} · ${nombre}`} · ${version.estado}`
}

export function versionPreferidaFormula(versiones: FormulaVersionFmDb[]) {
  const ordenadas = [...versiones].sort((a, b) => b.numero_version - a.numero_version)
  return ordenadas.find(version => version.estado === "VIGENTE") ?? ordenadas[0]
}

export function observacionesNuevaFormula(nombre: string, fecha: string, origen: FormulaVersionFmDb) {
  const notas = (origen.observaciones ?? "").replace(/^Nombre de versión: .*\r?\nFecha de modificación: .*\r?\n?/, "")
  return `Nombre de versión: ${nombre.trim()}\nFecha de modificación: ${fecha}\n${notas}`.trim()
}

export function agruparIngredientesImpresion(filas: { materia_nombre: string; micro_id: string | null; micro_nombre: string | null; cantidad: number }[]) {
  const resultado: { nombre: string; cantidad: number }[] = []
  const micros = new Map<string, number>()
  for (const fila of filas) {
    if (!fila.micro_id) { resultado.push({ nombre: fila.materia_nombre, cantidad: fila.cantidad }); continue }
    const indice = micros.get(fila.micro_id)
    if (indice === undefined) {
      micros.set(fila.micro_id, resultado.length)
      resultado.push({ nombre: fila.micro_nombre ?? "MICRO", cantidad: fila.cantidad })
    } else resultado[indice].cantidad += fila.cantidad
  }
  return resultado
}
