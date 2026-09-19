import { strFromU8, unzipSync } from "fflate"
import { readSheet, type Row } from "read-excel-file/browser"

export type FuenteDevolucionMasiva = "SUPERMAXI" | "SANTAMARIA"

export type DetalleDocumentoDevolucionMasiva = {
  sku: string
  producto_nombre: string
  unidades: number
  precio_unitario: number
  valor_total: number
}

export type DocumentoDevolucionMasiva = {
  fuente: FuenteDevolucionMasiva
  archivo_origen: string
  documento_referencia: string
  fecha_devolucion: string
  cliente_origen: string
  codigo_local: string
  nombre_local: string
  estado_documento: string
  observacion: string
  motivo: string
  valor_total: number
  detalles: DetalleDocumentoDevolucionMasiva[]
}

export type ResultadoLecturaDevolucionesMasivas = {
  archivos: string[]
  documentos: DocumentoDevolucionMasiva[]
  documentosDuplicados: number
  documentosVacios: number
  conflictos: string[]
  advertencias: string[]
}

const MESES: Record<string, string> = {
  ENE: "01",
  FEB: "02",
  MAR: "03",
  ABR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AGO: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DIC: "12",
  JAN: "01",
  APR: "04",
  AUG: "08",
  DEC: "12",
}

const MAXIMO_BYTES_DESCOMPRIMIDOS = 60 * 1024 * 1024
const MAXIMO_DOCUMENTOS = 5000

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function normalizarEncabezado(valor: unknown) {
  return normalizarTexto(valor).replace(/[^A-Z0-9]/g, "")
}

function textoCelda(valor: unknown) {
  return String(valor ?? "").replace(/\s+/g, " ").trim()
}

function numeroCelda(valor: unknown) {
  if (typeof valor === "number") return valor
  let texto = textoCelda(valor).replace(/[$\s]/g, "")
  if (!texto) return NaN

  if (texto.includes(",") && texto.includes(".")) {
    texto = texto.lastIndexOf(",") > texto.lastIndexOf(".")
      ? texto.replace(/\./g, "").replace(",", ".")
      : texto.replace(/,/g, "")
  } else if (texto.includes(",")) {
    texto = texto.replace(",", ".")
  }

  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : NaN
}

function redondear(valor: number, decimales: number) {
  const factor = 10 ** decimales
  return Math.round((valor + Number.EPSILON) * factor) / factor
}

function fechaIso(valor: unknown) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10)
  }

  if (typeof valor === "number" && valor > 30000 && valor < 80000) {
    const fecha = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000,
    )
    return fecha.toISOString().slice(0, 10)
  }

  const texto = textoCelda(valor)
  const iso = texto.match(/^(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)$/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  }

  const local = texto.match(/^([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})$/)
  if (local) {
    return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
  }

  return ""
}

function motivoDocumento(observacion: string) {
  const texto = normalizarTexto(observacion)
  if (texto.includes("VIDA UTIL") || texto.includes("VENCIMIENTO")) {
    return "VENCIMIENTO / RETIRO DE PERCHA"
  }
  if (
    texto.includes("FABRICACION") ||
    texto.includes("PRODUCCION") ||
    texto.includes("CALIDAD") ||
    texto.includes("ERROR EN RECEPCION")
  ) {
    return "CALIDAD"
  }
  return "OTRO"
}

function agruparDetalles(
  detalles: DetalleDocumentoDevolucionMasiva[],
) {
  const mapa = new Map<string, DetalleDocumentoDevolucionMasiva>()

  detalles.forEach((detalle) => {
    const existente = mapa.get(detalle.sku)
    if (!existente) {
      mapa.set(detalle.sku, { ...detalle })
      return
    }

    existente.unidades += detalle.unidades
    existente.valor_total += detalle.valor_total
    existente.precio_unitario = existente.unidades > 0
      ? existente.valor_total / existente.unidades
      : 0
  })

  return Array.from(mapa.values())
    .map((detalle) => ({
      ...detalle,
      unidades: redondear(detalle.unidades, 3),
      precio_unitario: redondear(detalle.precio_unitario, 6),
      valor_total: redondear(detalle.valor_total, 6),
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku))
}

function extraerSupermaxi(
  texto: string,
  archivoOrigen: string,
): DocumentoDevolucionMasiva | null {
  const textoNormalizado = normalizarTexto(texto)
  if (
    !textoNormalizado.includes("CORPORACION FAVORITA") ||
    !textoNormalizado.includes("DEVOLUCION PROVEEDOR")
  ) {
    throw new Error(`${archivoOrigen}: no corresponde a una devolución de Supermaxi.`)
  }

  const lineas = texto.split(/\r?\n/)
  const referencia = texto.match(/No\.\s*:\s*(\d+)/i)?.[1] ?? ""
  const fechaDocumento = texto.match(
    /Fecha\s+Elaboracion\s*:\s*(\d{2})\/([A-Z]{3})\/(\d{4})/i,
  )
  const fecha = fechaDocumento
    ? `${fechaDocumento[3]}-${MESES[normalizarTexto(fechaDocumento[2])] ?? ""}-${fechaDocumento[1]}`
    : ""

  const indiceLocal = lineas.findIndex((linea) =>
    normalizarTexto(linea).includes("TDA/ALM/CDI:"),
  )
  const lineaLocal = indiceLocal >= 0
    ? lineas.slice(indiceLocal + 1).find((linea) => linea.trim()) ?? ""
    : ""
  const local = lineaLocal.match(/^\s*(\d+)\s+(.+?)\s{2,}\d+\s+/)
  const observacion = lineas
    .find((linea) => /^\s*Observaciones\s*:/i.test(linea))
    ?.replace(/^\s*Observaciones\s*:\s*/i, "")
    .trim() ?? ""
  const totalDocumento = Math.abs(Number(
    texto.match(/\bTOTAL:\s*(-?\d+(?:[.,]\d+)?)/i)?.[1]
      ?.replace(",", ".") ?? 0,
  ))

  const detalles: DetalleDocumentoDevolucionMasiva[] = []
  lineas.forEach((lineaOriginal) => {
    const linea = lineaOriginal.trim()
    if (!/^\d{13}\s+/.test(linea)) return

    const coincidencia = linea.match(
      /^(\d{13})\s+\d+\s+(.+?)\s+(\d+)\s*g\s+\d+(?:[.,]\d+)?\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?\s+(\d+(?:[.,]\d+)?)(?:\s|$)/i,
    )
    if (!coincidencia) {
      throw new Error(
        `${archivoOrigen}: no se pudo interpretar una línea del SKU ${linea.slice(0, 13)}.`,
      )
    }

    const unidadesPorEmpaque = Number(coincidencia[4].replace(",", "."))
    const empaques = Number(coincidencia[5].replace(",", "."))
    const unidades = Math.round(unidadesPorEmpaque * empaques)
    const precio = Number(coincidencia[6].replace(",", "."))

    detalles.push({
      sku: coincidencia[1],
      producto_nombre: coincidencia[2].trim(),
      unidades,
      precio_unitario: redondear(precio, 6),
      valor_total: redondear(unidades * precio, 6),
    })
  })

  if (!referencia || !fecha || fecha.includes("--")) {
    throw new Error(
      `${archivoOrigen}: faltan número o fecha válidos.`,
    )
  }

  if (detalles.length === 0) {
    if (totalDocumento === 0) return null
    throw new Error(
      `${archivoOrigen}: tiene valor pero no contiene líneas de producto válidas.`,
    )
  }

  const detallesAgrupados = agruparDetalles(detalles)
  const totalCalculado = detallesAgrupados.reduce(
    (total, detalle) => total + detalle.valor_total,
    0,
  )

  return {
    fuente: "SUPERMAXI",
    archivo_origen: archivoOrigen,
    documento_referencia: referencia,
    fecha_devolucion: fecha,
    cliente_origen: "CORPORACION FAVORITA C.A.",
    codigo_local: local?.[1] ?? "",
    nombre_local: local?.[2]?.trim() ?? "",
    estado_documento: "EMITIDO",
    observacion,
    motivo: motivoDocumento(observacion),
    valor_total: redondear(totalDocumento || totalCalculado, 6),
    detalles: detallesAgrupados,
  }
}

function columna(encabezados: Map<string, number>, ...nombres: string[]) {
  for (const nombre of nombres) {
    const indice = encabezados.get(normalizarEncabezado(nombre))
    if (indice !== undefined) return indice
  }
  return -1
}

function extraerSantamaria(
  filas: Row[],
  archivoOrigen: string,
): DocumentoDevolucionMasiva[] {
  const indiceEncabezado = filas.findIndex((fila) => {
    const celdas = fila.map(normalizarEncabezado)
    return celdas.includes("NUMEROSOLICITUD") &&
      celdas.includes("CODIGO") &&
      celdas.includes("CANTIDAD") &&
      celdas.includes("VALORTOTAL")
  })
  if (indiceEncabezado < 0) {
    throw new Error(
      `${archivoOrigen}: no contiene las columnas de notas de crédito de Santamaría.`,
    )
  }

  const encabezados = new Map<string, number>()
  filas[indiceEncabezado].forEach((valor, indice) => {
    encabezados.set(normalizarEncabezado(valor), indice)
  })

  const indices = {
    empresa: columna(encabezados, "Empresa"),
    local: columna(encabezados, "Unidad negocio"),
    fecha: columna(encabezados, "Fecha emisión"),
    referencia: columna(encabezados, "Número solicitud"),
    estado: columna(encabezados, "Estado"),
    sku: columna(encabezados, "Código"),
    producto: columna(encabezados, "Item"),
    cantidadEmpaque: columna(encabezados, "Cantidad embalaje"),
    cantidad: columna(encabezados, "Cantidad"),
    precio: columna(encabezados, "Precio unitario"),
    totalUnitario: columna(encabezados, "Total unitario"),
    total: columna(encabezados, "Valor total"),
  }

  if (Object.values(indices).some((indice) => indice < 0)) {
    throw new Error(`${archivoOrigen}: faltan columnas obligatorias de Santamaría.`)
  }

  const mapa = new Map<string, DocumentoDevolucionMasiva>()
  filas.slice(indiceEncabezado + 1).forEach((fila) => {
    const referencia = textoCelda(fila[indices.referencia])
    const sku = textoCelda(fila[indices.sku]).replace(/\.0$/, "")
    const fecha = fechaIso(fila[indices.fecha])
    if (!referencia || !sku || !fecha) return

    const cantidadEmpaque = Math.abs(numeroCelda(fila[indices.cantidadEmpaque]))
    const cantidad = Math.abs(numeroCelda(fila[indices.cantidad]))
    const unidades = redondear(
      (Number.isFinite(cantidadEmpaque) && cantidadEmpaque > 0
        ? cantidadEmpaque
        : 1) * cantidad,
      3,
    )
    if (!Number.isFinite(unidades) || unidades <= 0) return

    const precioLeido = Math.abs(numeroCelda(fila[indices.precio]))
    const totalLeido = Math.abs(numeroCelda(
      fila[indices.totalUnitario] ?? fila[indices.total],
    ))
    const valor = Number.isFinite(totalLeido)
      ? totalLeido
      : unidades * (Number.isFinite(precioLeido) ? precioLeido : 0)
    const precio = Number.isFinite(precioLeido)
      ? precioLeido
      : unidades > 0 ? valor / unidades : 0
    const local = textoCelda(fila[indices.local])
    const clave = `${referencia}|${local}|${fecha}`
    const existente = mapa.get(clave) ?? {
      fuente: "SANTAMARIA" as const,
      archivo_origen: archivoOrigen,
      documento_referencia: referencia,
      fecha_devolucion: fecha,
      cliente_origen: textoCelda(fila[indices.empresa]) || "MEGA SANTAMARIA S.A.",
      codigo_local: "",
      nombre_local: local,
      estado_documento: textoCelda(fila[indices.estado]),
      observacion: "Nota de crédito importada de Santamaría",
      motivo: "VENCIMIENTO / RETIRO DE PERCHA",
      valor_total: 0,
      detalles: [],
    }

    existente.detalles.push({
      sku,
      producto_nombre: textoCelda(fila[indices.producto]),
      unidades,
      precio_unitario: redondear(precio, 6),
      valor_total: redondear(valor, 6),
    })
    existente.valor_total += valor
    mapa.set(clave, existente)
  })

  const documentos = Array.from(mapa.values()).map((documento) => ({
    ...documento,
    valor_total: redondear(documento.valor_total, 6),
    detalles: agruparDetalles(documento.detalles),
  }))

  if (documentos.length === 0) {
    throw new Error(`${archivoOrigen}: no contiene notas de crédito válidas.`)
  }

  return documentos
}

async function documentosArchivo(archivo: File) {
  const nombre = archivo.name.toLowerCase()
  if (nombre.endsWith(".zip")) {
    const contenido = unzipSync(new Uint8Array(await archivo.arrayBuffer()))
    const entradas = Object.entries(contenido).filter(
      ([nombreEntrada]) => nombreEntrada.toLowerCase().endsWith(".txt"),
    )
    const bytes = entradas.reduce((total, [, datos]) => total + datos.length, 0)
    if (bytes > MAXIMO_BYTES_DESCOMPRIMIDOS) {
      throw new Error(`${archivo.name}: el contenido descomprimido es demasiado grande.`)
    }
    if (entradas.length === 0) {
      throw new Error(`${archivo.name}: no contiene documentos TXT de Supermaxi.`)
    }
    const documentosLeidos = entradas.map(([nombreEntrada, datos]) =>
      extraerSupermaxi(strFromU8(datos), `${archivo.name}/${nombreEntrada}`),
    )
    const documentos = documentosLeidos.filter(
      (documento): documento is DocumentoDevolucionMasiva => documento !== null,
    )
    return {
      documentos,
      vacios: documentosLeidos.length - documentos.length,
    }
  }

  if (nombre.endsWith(".txt")) {
    const documento = extraerSupermaxi(await archivo.text(), archivo.name)
    return {
      documentos: documento ? [documento] : [],
      vacios: documento ? 0 : 1,
    }
  }

  if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) {
    return {
      documentos: extraerSantamaria(await readSheet(archivo), archivo.name),
      vacios: 0,
    }
  }

  throw new Error(`${archivo.name}: tipo de archivo no compatible.`)
}

function firmaDocumento(documento: DocumentoDevolucionMasiva) {
  return JSON.stringify({
    fecha: documento.fecha_devolucion,
    local: documento.nombre_local,
    valor: documento.valor_total,
    detalles: documento.detalles,
  })
}

export async function leerArchivosDevolucionesMasivas(
  archivos: File[],
): Promise<ResultadoLecturaDevolucionesMasivas> {
  if (archivos.length === 0) {
    throw new Error("Selecciona al menos un archivo.")
  }

  const mapa = new Map<string, DocumentoDevolucionMasiva>()
  const conflictos: string[] = []
  const advertencias: string[] = []
  let duplicados = 0
  let vacios = 0

  for (const archivo of archivos) {
    const resultadoArchivo = await documentosArchivo(archivo)
    vacios += resultadoArchivo.vacios
    for (const documento of resultadoArchivo.documentos) {
      const clave = `${documento.fuente}|${documento.documento_referencia}`
      const existente = mapa.get(clave)
      if (!existente) {
        mapa.set(clave, documento)
      } else if (firmaDocumento(existente) === firmaDocumento(documento)) {
        duplicados += 1
      } else {
        conflictos.push(documento.documento_referencia)
      }

      if (mapa.size > MAXIMO_DOCUMENTOS) {
        throw new Error(`La selección supera el límite de ${MAXIMO_DOCUMENTOS} documentos.`)
      }
    }
  }

  const documentos = Array.from(mapa.values()).sort((a, b) =>
    a.fecha_devolucion.localeCompare(b.fecha_devolucion) ||
    a.documento_referencia.localeCompare(b.documento_referencia),
  )

  if (duplicados > 0) {
    advertencias.push(
      `${duplicados} documentos repetidos entre los archivos fueron descartados.`,
    )
  }

  if (vacios > 0) {
    advertencias.push(
      `${vacios} documentos sin productos y con valor cero fueron omitidos.`,
    )
  }

  return {
    archivos: archivos.map((archivo) => archivo.name),
    documentos,
    documentosDuplicados: duplicados,
    documentosVacios: vacios,
    conflictos: Array.from(new Set(conflictos)).sort(),
    advertencias,
  }
}
