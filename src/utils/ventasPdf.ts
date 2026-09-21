import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"

import type { LineaVentaImportar } from "../repositories/ventasRepository"
import type { ResultadoArchivoVentas } from "./ventasExcel"

GlobalWorkerOptions.workerSrc = pdfWorker

type TextoPosicionado = {
  texto: string
  x: number
  y: number
}

type FilaPdf = {
  numero: number
  y: number
  items: TextoPosicionado[]
}

function textoRango(items: TextoPosicionado[], desde: number, hasta: number) {
  return items
    .filter((item) => item.x >= desde && item.x < hasta)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((item) => item.texto.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function numeroPdf(valor: string) {
  const texto = valor.replace(/[$\s]/g, "")
  if (!texto) return NaN

  const normalizado = texto.includes(",") && texto.includes(".")
    ? texto.lastIndexOf(",") > texto.lastIndexOf(".")
      ? texto.replace(/\./g, "").replace(",", ".")
      : texto.replace(/,/g, "")
    : texto.replace(",", ".")

  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : NaN
}

function redondear(valor: number, decimales: number) {
  const factor = 10 ** decimales
  return Math.round((valor + Number.EPSILON) * factor) / factor
}

function fechaIso(valor: string) {
  const partes = valor.trim().match(/^([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})$/)
  if (!partes) return null
  return `${partes[3]}-${partes[2].padStart(2, "0")}-${partes[1].padStart(2, "0")}`
}

function comprobantePdf(valor: string) {
  return valor
    .replace(/\s+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function filasDePagina(items: TextoPosicionado[]) {
  const anclas = items
    .filter((item) => item.x >= 24 && item.x < 49 && /^\d+$/.test(item.texto.trim()))
    .map((item) => ({
      numero: Number(item.texto.trim()),
      y: item.y,
    }))
    .filter((item) => item.numero > 0)
    .sort((a, b) => b.y - a.y)

  return anclas.map<FilaPdf>((ancla) => {
    const itemsFila = items.filter((item) => {
      const distanciaActual = Math.abs(item.y - ancla.y)
      return distanciaActual <= 18 && anclas.every(
        (otra) => otra === ancla || distanciaActual <= Math.abs(item.y - otra.y),
      )
    })

    return { numero: ancla.numero, y: ancla.y, items: itemsFila }
  })
}

function continuacionAlFinal(items: TextoPosicionado[], filas: FilaPdf[]) {
  const ultimaY = Math.min(...filas.map((fila) => fila.y))
  const inicio = items.find((item) =>
    item.x >= 49
    && item.x < 109
    && item.y < ultimaY - 12
    && /^\d{3}\s*-\s*\d{3}\s*-$/.test(item.texto.trim()),
  )

  if (!inicio) return []
  return items.filter((item) =>
    item.x >= 49
    && item.x < 406
    && Math.abs(item.y - inicio.y) <= 1.5,
  )
}

function continuacionAlInicio(items: TextoPosicionado[], filas: FilaPdf[]) {
  const primeraY = Math.max(...filas.map((fila) => fila.y))
  const numeroComprobante = items.find((item) =>
    item.x >= 49
    && item.x < 109
    && item.y > primeraY + 12
    && /^\d{9}$/.test(item.texto.trim()),
  )

  if (!numeroComprobante) return []
  return items.filter((item) =>
    item.x >= 49
    && item.x < 406
    && Math.abs(item.y - numeroComprobante.y) <= 1.5,
  )
}

function analizarFilaLegacy(fila: FilaPdf): LineaVentaImportar | null {
  const comprobante = comprobantePdf(textoRango(fila.items, 49, 109))
  const bloqueIdentificacion = textoRango(fila.items, 109, 406)
  const fechaTexto = bloqueIdentificacion.match(/[0-3]\d\/[01]\d\/20\d{2}/)?.[0] ?? ""
  const sku = bloqueIdentificacion.match(/\d{13}[A-Z]?/)?.[0] ?? ""
  const fecha = fechaIso(fechaTexto)
  const cliente = textoRango(fila.items, 109, 244)
    .replace(fechaTexto, "")
    .replace(sku, "")
    .replace(/\s+/g, " ")
    .trim()
  const producto = textoRango(fila.items, 244, 406)
    .replace(sku, "")
    .replace(/\s+/g, " ")
    .trim()
  const valores = textoRango(fila.items, 406, 590)
    .split(/\s+/)
    .map(numeroPdf)
  const [cantidad, unitario, descuento, neto, total] = valores

  if (
    !/^\d{3}-\d{3}-\d+$/.test(comprobante)
    || !fecha
    || !cliente
    || !sku
    || !producto
  ) {
    return null
  }

  if (
    valores.length !== 5
    || ![cantidad, unitario, descuento, neto, total].every(Number.isFinite)
  ) {
    return null
  }

  return {
    comprobante,
    fecha_emision: fecha,
    cliente_nombre: cliente,
    sku,
    producto_nombre: producto,
    cantidad: redondear(cantidad, 3),
    precio_unitario: redondear(unitario, 6),
    descuento: redondear(descuento, 6),
    precio_neto: redondear(neto, 6),
    total_sin_impuestos: redondear(total, 6),
  }
}

function analizarFilaAdmisys2026(
  fila: FilaPdf,
): LineaVentaImportar | null {
  // En el formato emitido por Admisys en 2026 la columna Fecha comienza
  // ligeramente antes que en el formato anterior (x≈108.4). El parser
  // legado tomaba esa fecha como parte del comprobante y por eso rechazaba
  // todas las filas del PDF.
  const comprobante = comprobantePdf(
    textoRango(fila.items, 49, 105),
  )
  const fechaTexto =
    textoRango(fila.items, 105, 151)
      .match(/[0-3]\d\/[01]\d\/20\d{2}/)?.[0] ?? ""
  const fecha = fechaIso(fechaTexto)

  // Cod Item puede ser EAN de 13 dígitos (+ sufijo T) o un código interno
  // corto de Admisys, por ejemplo 00034 / 00049.
  const sku =
    textoRango(fila.items, 230, 305)
      .match(/\b\d{5,13}[A-Z]?\b/)?.[0] ?? ""

  const cliente = textoRango(fila.items, 105, 239)
    .replace(fechaTexto, "")
    .replace(sku, "")
    .replace(/^Emisión\s+/i, "")
    .replace(/\s+Fecha$/i, "")
    .replace(/\s+/g, " ")
    .trim()

  // Microsoft Print to PDF puede ubicar Nombre del Item en x=304.0.
  // El límite anterior (305) dejaba el producto vacío y descartaba todas
  // las filas aunque el resto de columnas fuera válido.
  const producto = textoRango(fila.items, 299, 419)
    .replace(/\s+/g, " ")
    .trim()

  const valores = textoRango(fila.items, 419, 590)
    .split(/\s+/)
    .map(numeroPdf)
  const [cantidad, unitario, descuento, neto, total] = valores

  if (
    !/^\d{3}-\d{3}-\d+$/.test(comprobante)
    || !fecha
    || !cliente
    || !sku
    || !producto
  ) {
    return null
  }

  if (
    valores.length !== 5
    || ![cantidad, unitario, descuento, neto, total].every(Number.isFinite)
  ) {
    return null
  }

  return {
    comprobante,
    fecha_emision: fecha,
    cliente_nombre: cliente,
    sku,
    producto_nombre: producto,
    cantidad: redondear(cantidad, 3),
    precio_unitario: redondear(unitario, 6),
    descuento: redondear(descuento, 6),
    precio_neto: redondear(neto, 6),
    total_sin_impuestos: redondear(total, 6),
  }
}

function analizarFila(
  fila: FilaPdf,
): LineaVentaImportar | null {
  return analizarFilaLegacy(fila) ?? analizarFilaAdmisys2026(fila)
}

export async function leerArchivoVentasPdf(
  archivo: File,
): Promise<ResultadoArchivoVentas> {
  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecciona el reporte VENTAS POR ITEM en formato PDF.")
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const documento = await getDocument({ data: bytes }).promise
  const filasDocumento: FilaPdf[] = []
  const lineas: LineaVentaImportar[] = []
  const numerosLeidos: number[] = []
  const textosDocumento: string[] = []
  let continuacionAnterior: TextoPosicionado[] = []
  let ultimaFilaAnterior: FilaPdf | null = null

  for (let paginaNumero = 1; paginaNumero <= documento.numPages; paginaNumero += 1) {
    const pagina = await documento.getPage(paginaNumero)
    const contenido = await pagina.getTextContent()
    const ancho = pagina.getViewport({ scale: 1 }).width || 612
    const escala = 612 / ancho
    const items = contenido.items
      .filter((item): item is typeof item & { str: string; transform: number[] } =>
        "str" in item && "transform" in item && Boolean(item.str.trim()),
      )
      .map((item) => ({
        texto: item.str,
        x: Number(item.transform[4]) * escala,
        y: Number(item.transform[5]),
      }))

    textosDocumento.push(...items.map((item) => item.texto))
    const filasPagina = filasDePagina(items)
    const continuacionInicial = continuacionAlInicio(items, filasPagina)
    if (ultimaFilaAnterior && continuacionInicial.length > 0) {
      // Los textos de continuación también pueden quedar incluidos por
      // proximidad en la primera fila de la página nueva. Quitarlos evita
      // duplicar el número de comprobante en esa primera fila.
      const itemsContinuacion = new Set(continuacionInicial)
      if (filasPagina[0]) {
        filasPagina[0].items = filasPagina[0].items.filter(
          (item) => !itemsContinuacion.has(item),
        )
      }

      ultimaFilaAnterior.items.push(
        ...continuacionInicial.map((item) => ({
          ...item,
          y: ultimaFilaAnterior!.y - 4,
        })),
      )
    }
    if (continuacionAnterior.length > 0 && filasPagina[0]) {
      filasPagina[0].items.push(
        ...continuacionAnterior.map((item) => ({
          ...item,
          y: filasPagina[0].y + 4,
        })),
      )
    }
    continuacionAnterior = continuacionAlFinal(items, filasPagina)
    filasDocumento.push(...filasPagina)
    ultimaFilaAnterior = filasPagina.at(-1) ?? ultimaFilaAnterior
  }

  filasDocumento.forEach((fila) => {
    const linea = analizarFila(fila)
    if (!linea) return
    lineas.push(linea)
    numerosLeidos.push(fila.numero)
  })

  if (!/VENTAS\s+POR\s+ITEM/i.test(textosDocumento.join(" "))) {
    throw new Error(
      "El PDF no corresponde al reporte VENTAS POR ITEM del sistema de facturación.",
    )
  }

  if (lineas.length === 0) {
    throw new Error("El PDF no contiene movimientos de venta reconocibles.")
  }

  const claves = new Set<string>()
  for (const linea of lineas) {
    const clave = `${linea.comprobante}|${linea.sku}`
    if (claves.has(clave)) {
      throw new Error(
        `El comprobante ${linea.comprobante} repite el SKU ${linea.sku}.`,
      )
    }
    claves.add(clave)
  }

  lineas.sort((a, b) =>
    a.fecha_emision.localeCompare(b.fecha_emision)
    || a.comprobante.localeCompare(b.comprobante)
    || a.sku.localeCompare(b.sku),
  )

  const clientes = new Set(lineas.map((linea) => linea.cliente_nombre))
  const skus = new Set(lineas.map((linea) => linea.sku))
  const advertencias: string[] = []
  const ultimoNumero = Math.max(...numerosLeidos)

  if (ultimoNumero !== lineas.length) {
    advertencias.push(
      `El reporte numera ${ultimoNumero.toLocaleString("es-EC")} filas y se reconocieron ${lineas.length.toLocaleString("es-EC")}. Revisa el archivo antes de guardarlo.`,
    )
  }

  return {
    lineas,
    fechaDesde: lineas[0].fecha_emision,
    fechaHasta: lineas.at(-1)?.fecha_emision ?? lineas[0].fecha_emision,
    clientes: clientes.size,
    skus: skus.size,
    movimientos: lineas.length,
    unidades: redondear(
      lineas.reduce((total, linea) => total + linea.cantidad, 0),
      3,
    ),
    ventaSinImpuestos: redondear(
      lineas.reduce((total, linea) => total + linea.total_sin_impuestos, 0),
      6,
    ),
    advertencias,
  }
}

