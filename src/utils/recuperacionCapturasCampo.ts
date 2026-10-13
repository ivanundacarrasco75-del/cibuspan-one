import type { LecturaFavorita } from "../repositories/campoComercialRepository"
import type { RegistroDashboardCampo } from "./dashboardVisitasRotacion"
import { localDeCaptura, type LocalCampo } from "./georreferenciaCampo"
import { CAMPOS_CANTIDADES_CAMPO, completarCantidadesCaptura, prepararRecuperacionCaptura } from "./lecturaCapturasCampo"

export type ResultadoRecuperacionCampo = { id: string; producto: string; local: string; fecha: string; estado: "COMPLETADA" | "SIN_CAMBIOS" | "REVISAR" | "ERROR"; mensaje: string; lectura?: LecturaFavorita }
export const capturasPendientesCampo = (registros: RegistroDashboardCampo[]) => registros.filter((r) =>
  r.capturas_app?.length && r.lector_estado !== "RESPALDO_MANUAL" && CAMPOS_CANTIDADES_CAMPO.some(([c]) => r.lectura_guardada?.[c] == null),
)

export function prepararRecuperacionAutomaticaCampo(registro: RegistroDashboardCampo, lectura: LecturaFavorita, locales: LocalCampo[]) {
  if (!Number.isFinite(lectura.confianza) || lectura.confianza < 0.8) throw new Error("Lectura de baja calidad; requiere revisión individual.")
  if (localDeCaptura(lectura.local_nombre, locales)?.id !== registro.local_id) throw new Error("No se pudo verificar el local de la captura; requiere revisión individual.")
  const codigo = (lectura.codigo_barras ?? "").replace(/\D/g, "")
  if (!/^\d{13}$/.test(codigo) || codigo !== registro.producto_codigo.replace(/T$/i, "")) throw new Error("No se pudo verificar el SKU de la captura; requiere revisión individual.")
  if (lectura.advertencias.some((a) => a.startsWith("Valores distintos"))) throw new Error("Las capturas contienen cantidades contradictorias; requiere revisión individual.")
  const nuevos = CAMPOS_CANTIDADES_CAMPO.filter(([c]) => registro.lectura_guardada?.[c] == null && lectura[c] != null)
  if (!nuevos.length) return null
  for (const [campo] of nuevos) {
    const valor = lectura[campo]!
    if (!Number.isFinite(valor) || valor < 0 || (campo.startsWith("participacion_") && valor > 100)) throw new Error("Se reconoció una cantidad inválida; requiere revisión individual.")
    if (["stock_local_unidades", "unidades_por_caja", "cantidad_ultimo_pedido", "cantidad_ultimo_despacho"].includes(campo) && !Number.isSafeInteger(valor)) throw new Error("Una cantidad de unidades no es entera; requiere revisión individual.")
  }
  return prepararRecuperacionCaptura(completarCantidadesCaptura(registro.lectura_guardada ?? {}, lectura), {
    ...lectura, advertencias: [...lectura.advertencias, "Recuperación automática: campos vacíos completados; cantidades previas conservadas."],
  }, registro.lectura_guardada ?? {})
}

// Secuencial: una lectura y un guardado por registro; conserva el token de concurrencia.
export async function recuperarCapturasPendientesCampo({ registros, locales, leer, guardar, cancelada, progreso, resultado }: {
  registros: RegistroDashboardCampo[]; locales: LocalCampo[]
  leer: (registro: RegistroDashboardCampo, avance: (texto: string) => void) => Promise<LecturaFavorita>
  guardar: (registro: RegistroDashboardCampo, datos: Record<string, unknown>) => Promise<void>
  cancelada: () => boolean; progreso: (texto: string) => void
  resultado: (resultado: ResultadoRecuperacionCampo) => void
}) {
  const resultados: ResultadoRecuperacionCampo[] = []
  const unicos = [...new Map(registros.map((r) => [r.id, r])).values()]
  for (const [i, registro] of unicos.entries()) {
    if (cancelada()) break
    const base = { id: registro.id, producto: registro.producto_nombre, local: registro.local_nombre, fecha: registro.fecha }
    const prefijo = `${i + 1} de ${unicos.length} · ${registro.local_nombre} · ${registro.producto_nombre}`
    let respuesta: ResultadoRecuperacionCampo
    let lectura: LecturaFavorita | undefined
    try {
      lectura = await leer(registro, (texto) => progreso(`${prefijo}: ${texto}`))
      if (cancelada()) break
      let datos: Record<string, unknown> | null
      try { datos = prepararRecuperacionAutomaticaCampo(registro, lectura, locales) }
      catch (err) { respuesta = { ...base, estado: "REVISAR", mensaje: err instanceof Error ? err.message : "Revisa la captura.", lectura }; resultados.push(respuesta); resultado(respuesta); continue }
      if (!datos) respuesta = { ...base, estado: "SIN_CAMBIOS", mensaje: "No se reconocieron cantidades nuevas para los campos vacíos." }
      else {
        progreso(`${prefijo}: guardando cantidades…`)
        await guardar(registro, datos)
        respuesta = { ...base, estado: "COMPLETADA", mensaje: `${CAMPOS_CANTIDADES_CAMPO.filter(([c]) => c in datos!).length} campos completados. Se conservaron los datos anteriores.` }
      }
    } catch (err) { respuesta = { ...base, estado: "ERROR", mensaje: err instanceof Error ? err.message : "No se pudo completar esta visita." } }
    resultados.push({ ...respuesta, lectura }); resultado({ ...respuesta, lectura })
  }
  return resultados
}
