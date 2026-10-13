export type AreaReporteFavorita = { left: number; top: number; width: number; height: number }

// Busca el cuerpo blanco entre las barras azules de EnPercha, sin coordenadas fijas.
export function detectarAreaReporteFavorita(ancho: number, alto: number, pixeles: Uint8Array | Uint8ClampedArray): AreaReporteFavorita | null {
  if (ancho < 240 || alto <= ancho || pixeles.length !== ancho * alto * 4) return null
  const paso = Math.max(1, Math.floor(ancho / 100)), bandas: Array<{ desde: number; hasta: number }> = []
  let inicio: number | null = null
  for (let y = 0; y <= alto; y++) {
    let azules = 0, muestras = 0
    if (y < alto) for (let x = 0; x < ancho; x += paso) {
      const i = (y * ancho + x) * 4
      if (pixeles[i] < 100 && pixeles[i + 1] > 100 && pixeles[i + 2] > 150 && pixeles[i + 2] > pixeles[i + 1]) azules++
      muestras++
    }
    const azul = muestras > 0 && azules / muestras > 0.6
    if (azul && inicio === null) inicio = y
    if (!azul && inicio !== null) { if (y - inicio >= alto * 0.015) bandas.push({ desde: inicio, hasta: y }); inicio = null }
  }
  let area: AreaReporteFavorita | null = null
  for (let i = 0; i < bandas.length - 1; i++) {
    const top = bandas[i].hasta + 2, height = bandas[i + 1].desde - top
    if (bandas[i].desde > alto * 0.2 || height < alto * 0.4) continue
    const left = Math.round(ancho * 0.035), width = ancho - left * 2
    if (!area || height > area.height) area = { left, top, width, height }
  }
  return area
}

export async function areaCapturaFavorita(archivo: File): Promise<AreaReporteFavorita | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null
  const imagen = await createImageBitmap(archivo)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = imagen.width; canvas.height = imagen.height
    const contexto = canvas.getContext("2d", { willReadFrequently: true })
    if (!contexto) return null
    contexto.drawImage(imagen, 0, 0)
    return detectarAreaReporteFavorita(imagen.width, imagen.height, contexto.getImageData(0, 0, imagen.width, imagen.height).data)
  } finally { imagen.close() }
}
