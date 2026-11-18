import {
  activarVersionFmDb, crearReformulacionFmDb, guardarDatosVersionBorradorFmDb,
  guardarPorcentajeBorradorFmDb, obtenerComponentesFmDb, obtenerVersionesFormulaFmDb,
  type FormulaVersionFmDb, type PreformulacionComponenteFmDb,
} from "../repositories/formulaRepository"
import { observacionesNuevaFormula } from "../utils/formulacionVersion"

// La copia permanece en borrador hasta completar todas las filas y los metadatos.
// Un reintento continúa sobre esa copia, nunca sobre la versión de origen.
export async function guardarNuevaFormulacion(datos: {
  origen: FormulaVersionFmDb
  componentes: PreformulacionComponenteFmDb[]
  porcentajes: Record<string, string>
  nombre: string
  fecha: string
  activar: boolean
  borradorId?: string
}, alCrearBorrador: (id: string) => void) {
  const { origen, componentes, porcentajes, nombre, fecha, activar } = datos
  if (!nombre.trim() || nombre.trim().length > 120 || /[\r\n]/.test(nombre)) throw new Error("Ingresa un nombre de versión de hasta 120 caracteres.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)) || new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) !== fecha) throw new Error("Selecciona una fecha de modificación válida.")
  if (!componentes.length || componentes.some(fila => fila.formula_version_id !== origen.id)) throw new Error("Vuelve a cargar la fórmula antes de guardar.")
  const valores = componentes.map(fila => {
    const texto = porcentajes[fila.id]?.trim().replace(",", ".") ?? ""
    const valor = Number(texto)
    if (!texto || !Number.isFinite(valor) || valor < 0) throw new Error(`Revisa el porcentaje de ${fila.materia_prima?.nombre ?? "cada ingrediente"}.`)
    return valor
  })
  if (!valores.some(valor => valor > 0)) throw new Error("La fórmula debe tener al menos un porcentaje mayor que cero.")
  const versiones = await obtenerVersionesFormulaFmDb(origen.formula_id)
  if (versiones.some(version => version.id !== datos.borradorId && version.observaciones?.split("\n")[0]?.toLocaleLowerCase() === `Nombre de versión: ${nombre.trim()}`.toLocaleLowerCase())) throw new Error("Ya existe una versión con ese nombre para el SKU.")
  const observaciones = observacionesNuevaFormula(nombre, fecha, origen)
  const id = datos.borradorId ?? await crearReformulacionFmDb(origen.id)
  if (id === origen.id) throw new Error("La nueva versión debe ser distinta de la versión de origen.")
  alCrearBorrador(id)
  const version = datos.borradorId ? versiones.find(fila => fila.id === id) : undefined
  if (datos.borradorId && !version) throw new Error("No se encontró el borrador guardado. Recarga las versiones.")
  const copia = await obtenerComponentesFmDb(id)
  const clave = (fila: PreformulacionComponenteFmDb) => JSON.stringify([
    fila.materia_prima_id, fila.destino_tipo, fila.micro_id, fila.es_harina_base,
    fila.incluir_en_costeo, fila.orden, fila.observaciones,
  ])
  const grupos = new Map<string, PreformulacionComponenteFmDb[]>()
  for (const fila of copia) grupos.set(clave(fila), [...(grupos.get(clave(fila)) ?? []), fila])
  const destino = componentes.map(fila => grupos.get(clave(fila))?.shift())
  if (copia.length !== componentes.length || destino.some(fila => !fila)) throw new Error("La estructura de la copia cambió. Revisa el borrador antes de continuar.")
  if (activar && version?.estado === "VIGENTE" && version.observaciones === observaciones && destino.every((fila, i) => Number(fila!.porcentaje_panadero) === valores[i])) return id
  if (version && version.estado !== "BORRADOR") throw new Error("Esta versión ya no es un borrador. Recarga las versiones para revisarla.")
  for (let i = 0; i < destino.length; i++) await guardarPorcentajeBorradorFmDb(destino[i]!.id, id, valores[i])
  await guardarDatosVersionBorradorFmDb(id, observaciones)
  if (activar) await activarVersionFmDb(id)
  return id
}
