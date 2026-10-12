import type { LecturaFavorita } from "../repositories/campoComercialRepository"

export const CAMPOS_CANTIDADES_CAMPO = [
  ["rotacion_diaria_unidades", "Rotación diaria (unidades)"], ["stock_local_unidades", "Stock en local"],
  ["dias_inventario_local", "Días de inventario local"], ["precio_comercio", "Precio comercio"],
  ["precio_afiliado", "Precio afiliado"], ["venta_diaria_valor", "Venta diaria ($)"],
  ["prediccion_venta_unidades", "Predicción de venta"], ["participacion_clase", "Participación clase (%)"],
  ["participacion_subclase", "Participación subclase (%)"], ["stock_cd_cajas", "Stock CD (cajas)"],
  ["unidades_por_caja", "Unidades por caja"], ["dias_inventario_cd", "Días de inventario CD"],
  ["cantidad_ultimo_pedido", "Cantidad último pedido"], ["cantidad_ultimo_despacho", "Cantidad último despacho"],
] as const
export type CampoCantidadCaptura = typeof CAMPOS_CANTIDADES_CAMPO[number][0]
export const tieneCantidadesCaptura = (datos: Partial<LecturaFavorita>) => CAMPOS_CANTIDADES_CAMPO.some(([campo]) => typeof datos[campo] === "number" && Number.isFinite(datos[campo]))
export function completarCantidadesCaptura(actual: Partial<LecturaFavorita>, lectura: LecturaFavorita) {
  return Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.map(([campo]) => [campo, actual[campo] ?? lectura[campo] ?? null])) as Record<CampoCantidadCaptura, number | null>
}
export function prepararRecuperacionCaptura(valores: Record<CampoCantidadCaptura, number | null>, lectura: LecturaFavorita, actual: Partial<LecturaFavorita>) {
  const cantidades = Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.filter(([campo]) => valores[campo] !== null && valores[campo] !== actual[campo]).map(([campo]) => {
    const valor = valores[campo]!
    if (!Number.isFinite(valor) || valor < 0) throw new Error(`Revisa ${campo}: debe ser un número desde cero.`)
    return [campo, valor]
  }))
  if (!Object.keys(cantidades).length) throw new Error("No hay cantidades nuevas o corregidas para completar la visita.")
  return { ...cantidades, confianza: lectura.confianza, advertencias: lectura.advertencias, texto_ocr: lectura.texto_ocr ?? "" }
}
