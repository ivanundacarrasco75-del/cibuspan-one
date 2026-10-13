import type { LecturaFavorita } from "../repositories/campoComercialRepository"
import type { RegistroDashboardCampo } from "./dashboardVisitasRotacion"
import { localDeCaptura, type LocalCampo } from "./georreferenciaCampo"
import { CAMPOS_CANTIDADES_CAMPO, CAMPOS_FECHAS_CAMPO, completarCantidadesCaptura, prepararRecuperacionCaptura } from "./lecturaCapturasCampo"

import { CAMPOS_LECTURA_VALIDABLES, VERSION_VALIDACION_CAMPO, type VerificacionCamposCampo } from "./validacionLecturasCampo"

export type ResultadoRecuperacionCampo = { id: string; producto: string; local: string; fecha: string; estado: "COMPLETADA" | "SIN_CAMBIOS" | "REVISAR" | "ERROR"; mensaje: string; lectura?: LecturaFavorita }
export const capturasPendientesCampo = (registros: RegistroDashboardCampo[]) => registros.filter((r) =>
  r.capturas_app?.length && r.lector_estado !== "RESPALDO_MANUAL" &&
  (r.version_validacion !== VERSION_VALIDACION_CAMPO || CAMPOS_LECTURA_VALIDABLES.some(([c]) => !r.verificacion_campos?.[c] || r.verificacion_campos[c].estado === "PENDIENTE")),
)

// El catálogo de selección sólo incluye locales activos; las visitas históricas
// conservan el ID/nombre del local real aunque éste haya sido desactivado.
export function localesHistoricosCapturasCampo(registros: RegistroDashboardCampo[], locales: LocalCampo[]) {
  const referencias = new Map(locales.map((l) => [l.id, l]))
  for (const r of registros) if (!referencias.has(r.local_id)) referencias.set(r.local_id, { id: r.local_id, nombre: r.local_nombre, codigo: "" })
  return [...referencias.values()]
}

export function prepararAuditoriaCapturaCampo(registro: RegistroDashboardCampo, lectura: LecturaFavorita, locales: LocalCampo[]) {
  if (!lectura.local_nombre || !lectura.codigo_barras) {
    const texto = (lectura.texto_ocr ?? "").toUpperCase()
    if (/ACTIVOS/.test(texto) && /EXISTENCIAS/.test(texto) && !/PRECIO\s+AFILIADO|VENTA\s+PROMED/.test(texto)) throw new Error("La captura muestra la lista de productos; falta el detalle del SKU con local, código y cantidades.")
    if (/PRECIO\s+AFILIADO|VENTA\s+PROMED/.test(texto) && !/CODIGO\s+DE\s+BARRAS|CÓDIGO\s+DE\s+BARRAS/.test(texto)) throw new Error("El detalle está incompleto: falta la primera captura con local y código del SKU.")
    if (!/PRECIO\s+AFILIADO|VENTA\s+PROMED|LOCAL/.test(texto)) throw new Error("Las imágenes no contienen un detalle identificable de EnPercha; no se pueden obtener cantidades históricas de fotos de percha.")
  }
  const referencias = localesHistoricosCapturasCampo([registro], locales)
  const localReconocido = localDeCaptura(lectura.local_nombre, referencias)
  if (localReconocido?.id !== registro.local_id) throw new Error(`Local leído: ${lectura.local_nombre ?? "sin reconocer"}; visita: ${registro.local_nombre}. No se encontró una coincidencia única con el local de esta visita.`)
  if ((lectura.codigo_barras ?? "").replace(/\D/g, "") !== registro.producto_codigo.replace(/T$/i, "")) throw new Error("La captura no corresponde al SKU guardado.")
  if (lectura.fecha_fuente && lectura.fecha_fuente.slice(0, 10) !== registro.fecha) throw new Error("La fecha de la captura no coincide con la visita; no se cambia automáticamente.")
  if (!lectura.verificacion_campos || !lectura.lectura_control) throw new Error("Falta la lectura de control; actualiza la app.")
  const datos: Record<string, unknown> = {}, borrar: string[] = [], verificacion: VerificacionCamposCampo = {}
  for (const [c] of CAMPOS_LECTURA_VALIDABLES) {
    const anterior = registro.lectura_guardada?.[c] ?? null, manual = registro.verificacion_campos?.[c]
    if (manual && ["REVISION_MANUAL", "MANUAL_DECLARADO"].includes(manual.estado) && manual.valor === anterior) { verificacion[c] = manual; continue }
    const comprobado = lectura.verificacion_campos[c]
    if (comprobado?.estado === "DOBLE_LECTURA") {
      if (comprobado.valor !== anterior) datos[c] = comprobado.valor
      verificacion[c] = comprobado
    } else if (comprobado?.estado === "SIN_DATO") {
      if (anterior !== null) borrar.push(c)
      verificacion[c] = comprobado
    } else verificacion[c] = { estado: "PENDIENTE", valor: anterior, motivo: comprobado?.motivo ?? "Falta evidencia." }
  }
  for (const [cantidad, fecha] of [["cantidad_ultimo_pedido", "fecha_ultimo_pedido"], ["cantidad_ultimo_despacho", "fecha_ultimo_despacho"]] as const) {
    if (verificacion[cantidad]?.estado === "DOBLE_LECTURA" && Number(verificacion[cantidad].valor) > 0 && (datos[fecha] ?? registro.lectura_guardada?.[fecha] ?? null) !== lectura[fecha]) {
      delete datos[cantidad]
      verificacion[cantidad] = { estado: "PENDIENTE", valor: registro.lectura_guardada?.[cantidad] ?? null, motivo: "La fecha conservada no coincide con la cantidad del reporte." }
    }
  }
  return { ...datos, ...(borrar.length ? { campos_borrar: borrar } : {}), verificacion_campos: verificacion,
    lectura_control: lectura.lectura_control, version_validacion: VERSION_VALIDACION_CAMPO,
    confianza: lectura.confianza, texto_ocr: lectura.texto_ocr ?? "", advertencias: lectura.advertencias }
}

// Releer también persiste la lectura comprobada: reconocer no equivale a guardar.
// Reutiliza el RPC auditado y no escribe otra vez si los campos ya están validados.
export async function guardarLecturaComprobadaCampo({ registro, lectura, locales, guardar, cancelada }: {
  registro: RegistroDashboardCampo; lectura: LecturaFavorita; locales: LocalCampo[]
  guardar: (datos: Record<string, unknown>) => Promise<void>; cancelada: () => boolean
}) {
  if (cancelada() || registro.lector_estado === "RESPALDO_MANUAL" ||
    !Object.values(lectura.verificacion_campos ?? {}).some((v) => v.estado === "DOBLE_LECTURA")) return false
  const datos = prepararAuditoriaCapturaCampo(registro, lectura, locales)
  const verificacion = datos.verificacion_campos
  const necesitaGuardar = CAMPOS_LECTURA_VALIDABLES.some(([c]) => {
    const nueva = verificacion[c], previa = registro.verificacion_campos?.[c]
    return ["DOBLE_LECTURA", "SIN_DATO"].includes(nueva.estado) &&
      (nueva.valor !== (registro.lectura_guardada?.[c] ?? null) || nueva.estado !== previa?.estado || nueva.valor !== previa?.valor)
  })
  if (!necesitaGuardar || cancelada()) return false
  await guardar(datos)
  return true
}

export function prepararRecuperacionAutomaticaCampo(registro: RegistroDashboardCampo, lectura: LecturaFavorita, locales: LocalCampo[]) {
  if (!Number.isFinite(lectura.confianza) || lectura.confianza < 0.8) throw new Error(`Confianza general del lector ${Number.isFinite(lectura.confianza) ? Math.round(lectura.confianza * 100) : 0}%. Revisa las cantidades; puedes guardar una lectura verificada individualmente.`)
  if (localDeCaptura(lectura.local_nombre, locales)?.id !== registro.local_id) throw new Error("No se pudo verificar el local de la captura; requiere revisión individual.")
  const codigo = (lectura.codigo_barras ?? "").replace(/\D/g, "")
  if (!/^\d{13}$/.test(codigo) || codigo !== registro.producto_codigo.replace(/T$/i, "")) throw new Error("No se pudo verificar el SKU de la captura; requiere revisión individual.")
  if (lectura.advertencias.some((a) => a.startsWith("Valores distintos"))) throw new Error("Las capturas contienen cantidades contradictorias; requiere revisión individual.")
  const nuevos = CAMPOS_CANTIDADES_CAMPO.filter(([c]) => registro.lectura_guardada?.[c] == null && lectura[c] != null)
  const nuevasFechas = CAMPOS_FECHAS_CAMPO.filter(([c]) => registro.lectura_guardada?.[c] == null && lectura[c] != null)
  if (!nuevos.length && !nuevasFechas.length) return null
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
  const referencias = localesHistoricosCapturasCampo(registros, locales)
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
      try { datos = lectura.verificacion_campos ? prepararAuditoriaCapturaCampo(registro, lectura, referencias) : prepararRecuperacionAutomaticaCampo(registro, lectura, referencias) }
      catch (err) { respuesta = { ...base, estado: "REVISAR", mensaje: err instanceof Error ? err.message : "Revisa la captura.", lectura }; resultados.push(respuesta); resultado(respuesta); continue }
      if (!datos) respuesta = { ...base, estado: "SIN_CAMBIOS", mensaje: "No se reconocieron cantidades nuevas para los campos vacíos." }
      else {
        progreso(`${prefijo}: guardando cantidades…`)
        await guardar(registro, datos)
        respuesta = { ...base, estado: "COMPLETADA", mensaje: lectura.verificacion_campos ? `${[...CAMPOS_CANTIDADES_CAMPO, ...CAMPOS_FECHAS_CAMPO].filter(([c]) => c in datos!).length + ((datos.campos_borrar as string[] | undefined)?.length ?? 0)} campos corregidos/completados con respaldo; ${Object.values(datos.verificacion_campos as VerificacionCamposCampo).filter((v) => v.estado === "PENDIENTE").length} campos pendientes. Los manuales declarados se conservan.` : `${[...CAMPOS_CANTIDADES_CAMPO, ...CAMPOS_FECHAS_CAMPO].filter(([c]) => c in datos!).length} campos completados. Se conservaron los datos anteriores.` }
      }
    } catch (err) { respuesta = { ...base, estado: "ERROR", mensaje: err instanceof Error ? err.message : "No se pudo completar esta visita." } }
    resultados.push({ ...respuesta, lectura }); resultado({ ...respuesta, lectura })
  }
  return resultados
}
