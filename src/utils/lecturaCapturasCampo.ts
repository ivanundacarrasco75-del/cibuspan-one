import type { LecturaFavorita } from "../repositories/campoComercialRepository"

export const CAMPOS_CANTIDADES_CAMPO = [
  ["rotacion_diaria_unidades", "Rotación diaria (unidades)"], ["stock_local_unidades", "Stock en local"],
  ["dias_inventario_local", "Días de inventario local"], ["precio_comercio", "Precio comercio"],
  ["precio_afiliado", "Precio afiliado"], ["venta_diaria_valor", "Venta diaria ($)"],
  ["prediccion_venta_unidades", "Predicción de venta"], ["participacion_clase", "Participación clase (%)"],
  ["participacion_subclase", "Participación subclase (%)"],
  ["unidades_por_caja", "Unidades por caja"], ["dias_inventario_cd", "Días de inventario CD"],
  ["cantidad_ultimo_pedido", "Cantidad último pedido"], ["cantidad_ultimo_despacho", "Cantidad último despacho"],
] as const
export type CampoCantidadCaptura = typeof CAMPOS_CANTIDADES_CAMPO[number][0]
export const CAMPOS_FECHAS_CAMPO = [["fecha_ultimo_pedido", "Fecha del último pedido"], ["fecha_ultimo_despacho", "Fecha del último despacho"]] as const
export type CampoFechaCaptura = typeof CAMPOS_FECHAS_CAMPO[number][0]
export function completarFechasCaptura(actual: Partial<LecturaFavorita>, lectura: LecturaFavorita) {
  return Object.fromEntries(CAMPOS_FECHAS_CAMPO.map(([campo]) => [campo, actual[campo] ?? lectura[campo] ?? null])) as Record<CampoFechaCaptura, string | null>
}
export const tieneCantidadesCaptura = (datos: Partial<LecturaFavorita>) => CAMPOS_CANTIDADES_CAMPO.some(([campo]) => typeof datos[campo] === "number" && Number.isFinite(datos[campo]))
export function completarCantidadesCaptura(actual: Partial<LecturaFavorita>, lectura: LecturaFavorita) {
  return Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.map(([campo]) => [campo, actual[campo] ?? lectura[campo] ?? null])) as Record<CampoCantidadCaptura, number | null>
}
// Releer una visita prepara una propuesta para revisión; no guarda ni cambia el original.
export function proponerLecturaRevisadaCampo(actual: Partial<LecturaFavorita>, lectura: LecturaFavorita) {
  const valores = Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.map(([c]) => [c, lectura[c] ?? actual[c] ?? null])) as Record<CampoCantidadCaptura, number | null>
  const fechas = Object.fromEntries(CAMPOS_FECHAS_CAMPO.map(([c]) => [c, lectura[c] ?? actual[c] ?? null])) as Record<CampoFechaCaptura, string | null>
  const camposBorrar: string[] = []
  for (const [c] of CAMPOS_CANTIDADES_CAMPO) if (lectura[c] == null && lectura.campos_sin_dato?.includes(c)) {
    valores[c] = null; if (actual[c] != null) camposBorrar.push(c)
  }
  for (const [c] of CAMPOS_FECHAS_CAMPO) if (lectura[c] == null && lectura.campos_sin_dato?.includes(c)) {
    fechas[c] = null; if (actual[c] != null) camposBorrar.push(c)
  }
  return { valores, fechas, camposBorrar }
}
export function prepararRecuperacionCaptura(valores: Record<CampoCantidadCaptura, number | null>, lectura: LecturaFavorita, actual: Partial<LecturaFavorita>, fechas = completarFechasCaptura(actual, lectura), camposBorrar: string[] = []) {
  const cantidades = Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.filter(([campo]) => valores[campo] !== null && valores[campo] !== actual[campo]).map(([campo]) => {
    const valor = valores[campo]!
    if (!Number.isFinite(valor) || valor < 0) throw new Error(`Revisa ${campo}: debe ser un número desde cero.`)
    return [campo, valor]
  }))
  const fechasNuevas = Object.fromEntries(CAMPOS_FECHAS_CAMPO.filter(([c]) => fechas[c] !== null && fechas[c] !== actual[c]).map(([campo]) => {
    const fecha = fechas[campo]!
    const dia = new Date(`${fecha}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) throw new Error(`Revisa ${campo}: la fecha no es válida.`)
    return [campo, fecha]
  }))
  const permitidos: string[] = [...CAMPOS_CANTIDADES_CAMPO, ...CAMPOS_FECHAS_CAMPO].map(([c]) => c)
  const borrar = [...new Set(camposBorrar)].filter((c) => {
    if (!permitidos.includes(c)) throw new Error("Solo se pueden quitar campos de la lectura.")
    if (c in cantidades || c in fechasNuevas) throw new Error("Un campo no puede tener valor y borrarse a la vez.")
    return actual[c as CampoCantidadCaptura | CampoFechaCaptura] != null
  })
  if (!Object.keys(cantidades).length && !Object.keys(fechasNuevas).length && !borrar.length) throw new Error("No hay cantidades nuevas o corregidas para completar la visita; los valores elegidos ya están guardados.")
  return { ...cantidades, ...fechasNuevas, ...(borrar.length ? { campos_borrar: borrar } : {}), confianza: lectura.confianza, advertencias: lectura.advertencias, texto_ocr: lectura.texto_ocr ?? "" }
}
