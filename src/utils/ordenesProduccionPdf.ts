import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { interpretarOrdenesConfirmadasPdf, type TextoOpPdf } from "./ordenesConfirmadasPdf"

import type {
  OrdenProduccionImportar,
  ResultadoOrdenesProduccionExcel,
} from "./ordenesProduccionExcel"

GlobalWorkerOptions.workerSrc = pdfWorker

type TextoPosicionado = {
  texto: string
  x: number
  y: number
}

function textoRango(items: TextoPosicionado[], desde: number, hasta: number) {
  return items
    .filter((item) => item.x >= desde && item.x < hasta)
    .sort((a, b) => a.x - b.x)
    .map((item) => item.texto.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function numeroPdf(valor: string) {
  const contenido = valor.replace(/[$\s]/g, "")
  if (!contenido) return Number.NaN
  const normalizado = contenido.includes(",") && contenido.includes(".")
    ? contenido.lastIndexOf(",") > contenido.lastIndexOf(".")
      ? contenido.replace(/\./g, "").replace(",", ".")
      : contenido.replace(/,/g, "")
    : contenido.replace(",", ".")
  const resultado = Number(normalizado)
  return Number.isFinite(resultado) ? resultado : Number.NaN
}

function redondear(valor: number, decimales = 6) {
  const factor = 10 ** decimales
  return Math.round((valor + Number.EPSILON) * factor) / factor
}

function fechaIso(valor: string) {
  const partes = valor.match(/^([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})$/)
  if (!partes) return ""
  return `${partes[3]}-${partes[2].padStart(2, "0")}-${partes[1].padStart(2, "0")}`
}

function esSku(codigo: string) {
  return /^\d{13}(?:T)?$/i.test(codigo) || /^PH/i.test(codigo)
}

function construirResultado(
  ordenes: OrdenProduccionImportar[],
  filas: number,
): ResultadoOrdenesProduccionExcel {
  const ordenadas = [...ordenes].sort((a, b) =>
    a.fecha_produccion.localeCompare(b.fecha_produccion)
      || a.numero_orden.localeCompare(b.numero_orden)
      || a.producto_codigo.localeCompare(b.producto_codigo),
  )
  const ordenesSku = ordenadas.filter((orden) => orden.tipo_orden === "SKU")
  const ordenesMicro = ordenadas.filter((orden) => orden.tipo_orden === "MICRO")

  return {
    ordenes: ordenadas,
    fechaDesde: ordenadas[0].fecha_produccion,
    fechaHasta: ordenadas.at(-1)?.fecha_produccion ?? ordenadas[0].fecha_produccion,
    filas,
    ordenesSku: ordenesSku.length,
    ordenesMicro: ordenesMicro.length,
    unidadesSku: redondear(
      ordenesSku.reduce((total, orden) => total + orden.unidades_producidas, 0),
      3,
    ),
    kgMicro: redondear(
      ordenesMicro.reduce((total, orden) => total + orden.kg_micro, 0),
      3,
    ),
    costoTotal: redondear(
      ordenadas.reduce((total, orden) => total + orden.costo_total, 0),
      6,
    ),
    ordenesRevisar: ordenadas.filter((orden) => orden.estado_validacion === "REVISAR").length,
    skus: Array.from(new Set(ordenesSku.map((orden) => orden.producto_codigo))).sort(),
  }
}

export async function leerPdfOrdenesProduccion(
  archivo: File,
): Promise<ResultadoOrdenesProduccionExcel> {
  const documento = await getDocument({ data: await archivo.arrayBuffer() }).promise
  const primeraPagina = await documento.getPage(1)
  const primerContenido = await primeraPagina.getTextContent()
  const titulo = primerContenido.items.filter((item) => "str" in item).map((item) => "str" in item ? item.str : "").join(" ")
  if (/EGRESOS DE MATERIA PRIMA/i.test(titulo)) {
    const paginas: TextoOpPdf[][] = []
    for (let n = 1; n <= documento.numPages; n += 1) {
      const contenido = n === 1 ? primerContenido : await (await documento.getPage(n)).getTextContent()
      paginas.push(contenido.items.filter((item) => "str" in item && item.str.trim()).map((item) => {
        if (!("str" in item)) throw new Error("Texto ilegible en el PDF.")
        return { texto: item.str.trim(), x: item.transform[4], y: item.transform[5] }
      }))
    }
    return interpretarOrdenesConfirmadasPdf(paginas)
  }
  const ordenes: OrdenProduccionImportar[] = []
  let fechaCorteDesde = ""
  let fechaCorteHasta = ""
  let filasDetectadas = 0

  for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina += 1) {
    const pagina = await documento.getPage(numeroPagina)
    const contenido = await pagina.getTextContent()
    const items: TextoPosicionado[] = contenido.items
      .filter((item): item is typeof item & { str: string; transform: number[] } =>
        "str" in item && Boolean(item.str.trim()),
      )
      .map((item) => ({
        texto: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
      }))

    for (const item of items) {
      const corte = item.texto.match(
        /Fecha de corte del:\s*([0-3]?\d[/-][01]?\d[/-]20\d{2})\s+al:\s*([0-3]?\d[/-][01]?\d[/-]20\d{2})/i,
      )
      if (corte) {
        fechaCorteDesde = fechaIso(corte[1])
        fechaCorteHasta = fechaIso(corte[2])
      }
    }

    const anclas = items.filter(
      (item) => item.x >= 375 && item.x < 430 && /^\d{8}$/.test(item.texto),
    )

    for (const ancla of anclas) {
      const fila = items.filter((item) => Math.abs(item.y - ancla.y) <= 1.5)
      const fechaTexto = fila
        .map((item) => item.texto)
        .join(" ")
        .match(/\b[0-3]?\d[/-][01]?\d[/-]20\d{2}\b/)?.[0] ?? ""
      const fecha = fechaIso(fechaTexto)
      const productoCodigo = textoRango(fila, 100, 180).replace(/\s+/g, "")
      const productoNombre = textoRango(fila, 180, 375)
      const cantidad = numeroPdf(textoRango(fila, 430, 475))
      const costoUnitario = numeroPdf(textoRango(fila, 475, 530))
      const costoTotal = numeroPdf(textoRango(fila, 530, 590))

      if (
        !fecha
        || !productoCodigo
        || !productoNombre
        || ![cantidad, costoUnitario, costoTotal].every(Number.isFinite)
      ) {
        continue
      }
      filasDetectadas += 1

      // Algunos reportes de Admisys incluyen registros posteriores al rango
      // indicado en la cabecera. No deben contaminar el periodo importado.
      if (fechaCorteDesde && fecha < fechaCorteDesde) continue
      if (fechaCorteHasta && fecha > fechaCorteHasta) continue

      const tipoOrden = esSku(productoCodigo) ? "SKU" as const : "MICRO" as const
      const alertas: string[] = []
      if (tipoOrden === "SKU" && !Number.isInteger(cantidad)) {
        alertas.push("La cantidad producida contiene decimales.")
      }

      ordenes.push({
        numero_orden: ancla.texto,
        sucursal_codigo: "",
        sucursal_nombre: "",
        fecha_registro: fecha,
        fecha_fin_original: fecha,
        fecha_produccion: fecha,
        descripcion: "OP liquidada importada desde PDF",
        producto_codigo: productoCodigo,
        producto_nombre: productoNombre,
        tipo_orden: tipoOrden,
        tamano_parada: 0,
        numero_paradas: 0,
        unidades_producidas: tipoOrden === "SKU" ? redondear(cantidad, 3) : 0,
        kg_micro: tipoOrden === "MICRO" ? redondear(cantidad, 3) : 0,
        costo_total: redondear(costoTotal, 6),
        estado_validacion: alertas.length > 0 ? "REVISAR" : "VALIDA",
        observaciones: [
          `Costo unitario reportado: ${redondear(costoUnitario, 8)}.`,
          ...alertas,
        ].join(" "),
        detalles: [],
      })
    }
  }

  if (ordenes.length === 0) {
    throw new Error(
      "El PDF no contiene filas reconocibles del reporte ÓRDENES DE PRODUCCIÓN LIQUIDADAS.",
    )
  }
  if (!fechaCorteDesde || !fechaCorteHasta) {
    throw new Error("No se pudo identificar el rango de fechas indicado en el reporte.")
  }

  const claves = new Set<string>()
  const unicas = ordenes.filter((orden) => {
    const clave = `${orden.numero_orden}|${orden.producto_codigo}`
    if (claves.has(clave)) return false
    claves.add(clave)
    return true
  })

  return construirResultado(unicas, filasDetectadas)
}
