import type { LecturaFavorita } from "../repositories/campoComercialRepository"
import { interpretarReporteFavorita } from "./ocrFavorita"
import { separarTextosDiagnosticoCampo, seleccionarCapturasSkuCampo, type TextoImagenCampo } from "./seleccionCapturasSkuCampo"
import { CAMPOS_LECTURA_VALIDABLES, conciliarRotacionInventarioCampo, verificarDosLecturasCampo, VERSION_VALIDACION_CAMPO } from "./validacionLecturasCampo"

export function reanalizarDiagnosticoCapturaCampo(lectura: LecturaFavorita, codigoEsperado: string): LecturaFavorita {
  const evidencia = lectura.lectura_control
  const a = evidencia?.principal as LecturaFavorita | undefined, b = evidencia?.control as LecturaFavorita | undefined
  if (!a || !b || typeof a.texto_ocr !== "string" || typeof b.texto_ocr !== "string" || !Number.isFinite(a.confianza) || !Number.isFinite(b.confianza)) throw new Error("El diagnóstico no contiene las dos lecturas originales de esta visita.")
  const guardadas = evidencia?.imagenes as TextoImagenCampo[] | undefined
  const imagenes = Array.isArray(guardadas) && guardadas.length && guardadas.every((i) => typeof i.principal === "string" && typeof i.control === "string" && Number.isFinite(i.confianza) && Number.isFinite(i.confianza_control))
    ? guardadas : separarTextosDiagnosticoCampo(a.texto_ocr, b.texto_ocr, a.confianza, b.confianza)
  const seleccion = seleccionarCapturasSkuCampo(imagenes, codigoEsperado, interpretarReporteFavorita)
  const indices = seleccion.incluidas.length ? seleccion.incluidas : imagenes.map((_, i) => i)
  const promedio = (campo: "confianza" | "confianza_control") => indices.reduce((s, i) => s + imagenes[i][campo], 0) / indices.length
  const principal = interpretarReporteFavorita(indices.map((i) => imagenes[i].principal).join("\n"), promedio("confianza"))
  const control = interpretarReporteFavorita(indices.map((i) => imagenes[i].control).join("\n"), promedio("confianza_control"))
  const filas = Array.isArray(evidencia?.confirmaciones_fila) ? evidencia.confirmaciones_fila as Array<{campo: string; texto: string; confianza: number; imagen?: number}> : []
  // Las confirmaciones antiguas no identifican el archivo: no se reutilizan si
  // se omitió una captura de otro producto. Nunca trasladar datos entre SKU.
  for (const [campo] of CAMPOS_LECTURA_VALIDABLES) {
    const comprobaciones = filas.filter((f) => f.campo === campo && typeof f.texto === "string" && f.confianza >= .65 &&
      (f.imagen !== undefined ? indices.includes(f.imagen) : indices.length === imagenes.length))
    if (principal[campo] != null && comprobaciones.length && comprobaciones.every((f) => interpretarReporteFavorita(f.texto)[campo] === principal[campo])) Object.assign(control, {[campo]: principal[campo]})
  }
  const comprobacionInventario = conciliarRotacionInventarioCampo(principal, control, indices.flatMap((i) => [
    interpretarReporteFavorita(imagenes[i].principal, imagenes[i].confianza),
    interpretarReporteFavorita(imagenes[i].control, imagenes[i].confianza_control),
  ]))
  const verificacion = verificarDosLecturasCampo(principal, control)
  return { ...principal, version_validacion: VERSION_VALIDACION_CAMPO, verificacion_campos: verificacion,
    lectura_control: { principal, control, comprobacion_inventario: comprobacionInventario, imagenes, confirmaciones_fila: filas, capturas_incluidas: seleccion.incluidas, capturas_omitidas: seleccion.omitidas, origen: "REANALISIS_DIAGNOSTICO" },
    advertencias: [...principal.advertencias, ...Object.entries(verificacion).filter(([, v]) => v.estado === "PENDIENTE").map(([c,v]) => `${c}: ${v.motivo}`)] }
}
