import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = pdfWorker

export async function leerClaveRide(archivo: File) {
  const tarea = getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) })
  try {
    const pdf = await tarea.promise
    const pagina = await pdf.getPage(1)
    const contenido = await pagina.getTextContent()
    const texto = contenido.items.map((item) => "str" in item ? item.str : "").join(" ")
    const claves = [...new Set(texto.match(/\b\d{49}\b/g) ?? [])]
    if (!/\bFACTURA\b/i.test(texto) || claves.length !== 1 || claves[0].slice(8, 10) !== "01") {
      throw new Error("No se pudo identificar una única clave de factura en el RIDE. Usa el PDF original con texto.")
    }
    return claves[0]
  } finally {
    await tarea.destroy()
  }
}
