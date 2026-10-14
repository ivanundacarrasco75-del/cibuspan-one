import type { RegistroDashboardCampo } from "./dashboardVisitasRotacion"
import { camposPendientesDatosCampo } from "./estadoDatosCampo"
import { CAMPOS_LECTURA_VALIDABLES, motivosCoherenciaCampo, VERSION_VALIDACION_CAMPO } from "./validacionLecturasCampo"
import { marcaProcesamientoCampo } from "./procesamientoAutomaticoCampo"

export const CLAVE_REVISION_CAMPO = "cibuspan-one:revision-dato"
export type FocoRevisionCampo = { registroId: string; campo: string; fecha: string; clienteId: string }
export function pendientesRevisionCampo(registros: RegistroDashboardCampo[]) {
  return registros.flatMap((registro) => camposPendientesDatosCampo(registro).map((c) => ({ ...c, registro, clave: `${registro.id}:${c.campo}` })))
}
export function prepararRevisionDatoCampo(r: RegistroDashboardCampo, campo: string, valor: number | string | null) {
  const permitido = CAMPOS_LECTURA_VALIDABLES.find(([c]) => c === campo)
  if (!permitido) throw new Error("Este campo no se puede revisar aquí.")
  if (valor !== null && (campo.startsWith("fecha_") ? typeof valor !== "string" : typeof valor !== "number")) throw new Error("Revisa el formato del dato.")
  const motivo = motivosCoherenciaCampo({ [campo]: valor })[campo]
  if (motivo) throw new Error(motivo)
  const anterior = r.lectura_guardada?.[permitido[0]] ?? null
  const restantes = camposPendientesDatosCampo(r).filter((c) => c.campo !== campo)
  return { ...(valor !== null && valor !== anterior ? { [campo]: valor } : {}),
    ...(valor === null && anterior !== null ? { campos_borrar: [campo] } : {}),
    verificacion_campos: { [campo]: { estado: "REVISION_MANUAL", valor } }, version_validacion: VERSION_VALIDACION_CAMPO,
    lectura_control: { ...(r.lectura_almacenada?.lectura_control ?? {}), procesamiento_automatico: marcaProcesamientoCampo(r.capturas_app ?? [], restantes.length ? "REVISAR" : "PROCESADA", restantes.map((c) => `${c.nombre}: ${c.motivo}`).join("; ") || undefined) } }
}
