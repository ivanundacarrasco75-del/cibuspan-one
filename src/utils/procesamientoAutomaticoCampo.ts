import type { LecturaFavorita } from "../repositories/campoComercialRepository"
import type { RegistroDashboardCampo } from "./dashboardVisitasRotacion"
import type { LocalCampo } from "./georreferenciaCampo"
import { prepararAuditoriaCapturaCampo, type ResultadoRecuperacionCampo } from "./recuperacionCapturasCampo"
import { CAMPOS_LECTURA_VALIDABLES, VERSION_VALIDACION_CAMPO } from "./validacionLecturasCampo"

export const VERSION_PROCESAMIENTO_CAMPO = "20261013.5"
export const claveProcesamientoCampo = (r: RegistroDashboardCampo) => JSON.stringify([r.id, r.capturas_app, VERSION_PROCESAMIENTO_CAMPO])
export function marcaProcesamientoCampo(capturas: string[], estado: "PROCESADA" | "REVISAR", motivo?: string) {
  return { version: VERSION_PROCESAMIENTO_CAMPO, capturas, estado, ...(motivo ? { motivo } : {}) }
}
export function marcaLecturaProcesadaCampo(l: LecturaFavorita, capturas: string[]) {
  const pendientes = CAMPOS_LECTURA_VALIDABLES.filter(([c]) => l.verificacion_campos?.[c]?.estado === "PENDIENTE")
  const motivo = pendientes.map(([c, nombre]) => `${nombre}: ${l.verificacion_campos?.[c]?.motivo ?? "Falta evidencia."}`).join("; ")
  return marcaProcesamientoCampo(capturas, pendientes.length ? "REVISAR" : "PROCESADA", motivo || undefined)
}
export function visitasSinProcesarCampo(registros: RegistroDashboardCampo[]) {
  return registros.filter((r) => {
    if (r.puede_procesar === false || !r.capturas_app?.length || ["RESPALDO_MANUAL", "SIN_LECTOR"].includes(r.lector_estado ?? "")) return false
    const marca = r.lectura_almacenada?.lectura_control?.procesamiento_automatico as ReturnType<typeof marcaProcesamientoCampo> | undefined
    return marca?.version !== VERSION_PROCESAMIENTO_CAMPO || JSON.stringify(marca.capturas) !== JSON.stringify(r.capturas_app)
  })
}
export function excepcionesProcesamientoCampo(registros: RegistroDashboardCampo[]): ResultadoRecuperacionCampo[] {
  return registros.flatMap((r) => {
    const marca = r.lectura_almacenada?.lectura_control?.procesamiento_automatico as ReturnType<typeof marcaProcesamientoCampo> | undefined
    return marca?.estado === "REVISAR" && typeof marca.motivo === "string" ? [{ id: r.id, local: r.local_nombre, producto: r.producto_nombre, fecha: r.fecha,
      estado: "REVISAR" as const, mensaje: marca.motivo }] : []
  })
}
export const lecturaPrincipalComprobadaCampo = (l: LecturaFavorita) =>
  (["rotacion_diaria_unidades", "stock_local_unidades", "dias_inventario_local"] as const).every((c) => {
    const v = l.verificacion_campos?.[c]
    return v?.estado === "SIN_DATO" || !!v && ["DOBLE_LECTURA", "REVISION_MANUAL", "MANUAL_DECLARADO"].includes(v.estado) && v.valor != null && v.valor === l[c]
  })

// Una pasada por versión y capturas. Primero reutiliza los textos guardados;
// sólo descarga imágenes si falta evidencia o los datos principales no se comprobaron.
export async function procesarVisitasAutomaticamenteCampo({ registros, locales, leerImagenes, guardar, cancelada, progreso, resultado }: {
  registros: RegistroDashboardCampo[]; locales: LocalCampo[]
  leerImagenes: (r: RegistroDashboardCampo, avance: (texto: string) => void) => Promise<LecturaFavorita>
  guardar: (r: RegistroDashboardCampo, datos: Record<string, unknown>) => Promise<void>
  cancelada: () => boolean; progreso: (texto: string) => void; resultado: (r: ResultadoRecuperacionCampo) => void
}) {
  const resultados: ResultadoRecuperacionCampo[] = []
  const unicos = [...new Map(visitasSinProcesarCampo(registros).map((r) => [r.id, r])).values()]
  for (const [i, r] of unicos.entries()) {
    if (cancelada()) break
    const base = { id: r.id, local: r.local_nombre, producto: r.producto_nombre, fecha: r.fecha }
    const avance = (texto: string) => progreso(`${i + 1}/${unicos.length} · ${r.local_nombre} · ${r.producto_nombre}: ${texto}`)
    let lectura: LecturaFavorita | undefined
    let respuesta: ResultadoRecuperacionCampo
    try {
      if (r.lectura_almacenada?.lectura_control) {
        try {
          avance("Comprobando la lectura guardada…")
          const { reanalizarDiagnosticoCapturaCampo } = await import("./reanalizarDiagnosticoCapturasCampo")
          lectura = reanalizarDiagnosticoCapturaCampo(r.lectura_almacenada, r.producto_codigo)
          prepararAuditoriaCapturaCampo(r, lectura, locales)
        } catch { lectura = undefined }
      }
      if (!lectura || !lecturaPrincipalComprobadaCampo(lectura)) lectura = await leerImagenes(r, avance)
      if (cancelada()) break
      let datos: Record<string, unknown>, motivo: string | undefined, bloqueada = false
      try {
        datos = prepararAuditoriaCapturaCampo(r, lectura, locales)
        const pendientes = CAMPOS_LECTURA_VALIDABLES.filter(([c]) => (datos.verificacion_campos as NonNullable<LecturaFavorita["verificacion_campos"]>)[c].estado === "PENDIENTE")
        if (pendientes.length) motivo = pendientes.map(([c, nombre]) => `${nombre}: ${(datos.verificacion_campos as NonNullable<LecturaFavorita["verificacion_campos"]>)[c].motivo}`).join("; ")
      } catch (err) {
        bloqueada = true
        motivo = err instanceof Error ? err.message : "La captura requiere una fuente correcta."
        // Registrar la excepción no cambia cantidades ni certificaciones anteriores.
        datos = { verificacion_campos: {}, version_validacion: VERSION_VALIDACION_CAMPO }
        datos.lectura_control = { ...(r.lectura_almacenada?.lectura_control ?? {}), intento_fallido: lectura.lectura_control }
      }
      datos.lectura_control = { ...((datos.lectura_control ?? lectura.lectura_control ?? {}) as Record<string, unknown>),
        procesamiento_automatico: marcaProcesamientoCampo(r.capturas_app!, motivo ? "REVISAR" : "PROCESADA", motivo) }
      if (cancelada()) break
      avance("Guardando información comprobada…")
      await guardar(r, datos)
      respuesta = { ...base, estado: bloqueada ? "REVISAR" : "COMPLETADA", mensaje: bloqueada ? motivo! : motivo ? `Datos comprobados guardados. Excepciones: ${motivo}` : "Datos comprobados y guardados automáticamente.", lectura }
    } catch (err) {
      respuesta = { ...base, estado: "ERROR", mensaje: err instanceof Error ? err.message : "No se pudo guardar la información.", lectura }
    }
    resultados.push(respuesta); resultado(respuesta)
  }
  return resultados
}
