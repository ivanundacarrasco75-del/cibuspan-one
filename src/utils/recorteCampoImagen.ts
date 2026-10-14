export type RegionCampoImagen = { left: number; top: number; width: number; height: number }
type Linea = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }
const etiquetas: Record<string, RegExp> = {
  rotacion_diaria_unidades: /VENTA.*(?:CANT|CANTIDAD)/, venta_diaria_valor: /VENTA.*VALOR/,
  stock_local_unidades: /EXISTENCIA.*LOCAL/, dias_inventario_local: /DIAS.*INVENTARIO.*LOCAL/,
  precio_comercio: /PRECIO.*COMERCIO/, precio_afiliado: /PRECIO.*AFILIADO/,
  prediccion_venta_unidades: /PREDICCION.*VENTA/, participacion_clase: /PARTICIPACION\s+(?:CLA\b|CLASE\b)/,
  participacion_subclase: /PARTICIPACION\s+(?:SCLA\b|SUBCLASE\b)/,
  unidades_por_caja: /EXISTENCIA.*\bCD\b/,
  dias_inventario_cd: /DIAS.*INVENTARIO.*\bCD\b/,
  fecha_ultimo_pedido: /FECHA.*PEDIDO/, cantidad_ultimo_pedido: /CANTIDAD.*PEDIDO/,
  fecha_ultimo_despacho: /FECHA.*DESPACHO/, cantidad_ultimo_despacho: /CANTIDAD.*DESPACHO/,
}
export function regionesCampoDesdeLineas(lineas: Linea[], ancho: number, alto: number) {
  const regiones: Record<string, RegionCampoImagen> = {}
  for (const [campo, etiqueta] of Object.entries(etiquetas)) {
    const j = lineas.findIndex((l) => etiqueta.test(l.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()))
    if (j < 0) continue
    const grupo = lineas.slice(j, j + 2), top = Math.max(0, Math.min(...grupo.map((l) => l.bbox.y0)) - 8)
    const bottom = Math.min(alto, Math.max(...grupo.map((l) => l.bbox.y1)) + 8)
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top && ancho > 0) regiones[campo] = { left: 0, top, width: ancho, height: bottom - top }
  }
  return regiones
}
// Sólo localiza filas para mostrarlas al revisor; nunca interpreta ni guarda cantidades.
export async function localizarCamposImagen(archivo: File, ancho: number, alto: number) {
  const { createWorker, PSM } = await import("tesseract.js")
  const worker = await createWorker("spa")
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const r = await worker.recognize(archivo, {}, { blocks: true })
    const lineas = r.data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)) ?? []
    return regionesCampoDesdeLineas(lineas, ancho, alto)
  } finally { await worker.terminate() }
}
