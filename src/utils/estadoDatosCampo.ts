import type { RegistroDashboardCampo } from "./dashboardVisitasRotacion"
import { valorIndicadorValidadoCampo } from "./dashboardVisitasRotacion"
import { CAMPOS_LECTURA_VALIDABLES, datoVerificadoCampo } from "./validacionLecturasCampo"
import type { ResultadoRecuperacionCampo } from "./recuperacionCapturasCampo"

export function resumenResultadosDatosCampo(resultados: ResultadoRecuperacionCampo[]) {
  const parciales = (r: ResultadoRecuperacionCampo) => r.mensaje.includes("Excepciones:") || /\b[1-9]\d* campos pendientes\b/.test(r.mensaje)
  return {
    completos: resultados.filter((r) => r.estado === "COMPLETADA" && !parciales(r)).length,
    parciales: resultados.filter((r) => r.estado === "COMPLETADA" && parciales(r)).length,
    bloqueados: resultados.filter((r) => r.estado === "REVISAR").length,
    errores: resultados.filter((r) => r.estado === "ERROR").length,
    sinCambios: resultados.filter((r) => r.estado === "SIN_CAMBIOS").length,
  }
}

export function camposPendientesDatosCampo(r: RegistroDashboardCampo) {
  const manual = ["SIN_LECTOR", "RESPALDO_MANUAL"].includes(r.lector_estado ?? "")
  return CAMPOS_LECTURA_VALIDABLES.filter(([c]) => {
    const valor = r.lectura_guardada?.[c] ?? null, v = r.verificacion_campos?.[c]
    if (datoVerificadoCampo(c, valor, r.verificacion_campos) || v?.estado === "SIN_DATO" && valor === null) return false
    if (!v && (manual || !r.capturas_app?.length && valor === null)) return false
    return true
  }).map(([campo, nombre]) => ({ campo, nombre, motivo: r.verificacion_campos?.[campo]?.motivo ?? "Este campo no tiene una lectura comprobada." }))
}
export function resumenDatosCampo(registros: RegistroDashboardCampo[]) {
  const unicos = [...new Map(registros.map((r) => [r.id, r])).values()]
  return {
    registros: unicos.length,
    capturas: new Set(unicos.flatMap((r) => r.capturas_app ?? [])).size,
    registrosConCapturas: unicos.filter((r) => r.capturas_app?.length).length,
    rotacionesDisponibles: unicos.filter((r) => valorIndicadorValidadoCampo(r, "rotacion") !== null).length,
    rotacionesPendientes: unicos.filter((r) => camposPendientesDatosCampo(r).some((c) => c.campo === "rotacion_diaria_unidades")).length,
    otrosPendientes: unicos.filter((r) => camposPendientesDatosCampo(r).some((c) => c.campo !== "rotacion_diaria_unidades")).length,
  }
}
