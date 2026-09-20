import readWorkbook, { type Row } from "read-excel-file/browser"

export type FilaCoberturaFavorita = {
  codigo_local: string
  nombre_local: string
  codigo_sku: string
  nombre_sku: string
}

export type ResultadoCoberturaFavoritaExcel = {
  filas: FilaCoberturaFavorita[]
  fechaReporte: string
  hoja: string
  usaColumnaQuito: boolean
  localesArchivo: number
  localesSeleccionados: number
  posicionesSeleccionadas: number
  skusSeleccionados: number
  localesNoMonitoreados: number
  advertencias: string[]
}

function texto(valor: unknown) {
  return String(valor ?? "").replace(/\s+/g, " ").trim()
}

function normalizar(valor: unknown) {
  return texto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
}

function codigo(valor: unknown) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return Number.isInteger(valor)
      ? valor.toLocaleString("fullwide", { useGrouping: false })
      : String(valor).replace(/\.0+$/, "")
  }
  return texto(valor).replace(/\s+/g, "")
}

function fechaIso(valor: unknown) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const anio = valor.getUTCFullYear()
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0")
    const dia = String(valor.getUTCDate()).padStart(2, "0")
    return `${anio}-${mes}-${dia}`
  }
  if (typeof valor === "number" && valor > 30000 && valor < 80000) {
    return fechaIso(new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000))
  }
  const contenido = texto(valor)
  const iso = contenido.match(/^(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  const local = contenido.match(/^([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})$/)
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
  return ""
}

function buscarColumna(encabezados: Row, opciones: string[]) {
  return encabezados.findIndex((celda) => opciones.includes(normalizar(celda)))
}

function separarLocal(valor: unknown) {
  const contenido = texto(valor)
  const coincidencia = contenido.match(/^([A-Z0-9]+)\s*[-–—]\s*(.+)$/i)
  if (!coincidencia) return null
  return {
    codigo: coincidencia[1].toUpperCase(),
    nombre: coincidencia[2].trim().toUpperCase(),
  }
}

function esSi(valor: unknown) {
  return ["SI", "S", "YES", "X", "1"].includes(normalizar(valor))
}

function localizarEncabezado(filas: Row[]) {
  for (let indice = 0; indice < Math.min(filas.length, 80); indice += 1) {
    const encabezados = filas[indice].map(normalizar)
    const tieneLocal = encabezados.some((item) =>
      ["UNIDADOPERATIVA", "LOCAL", "SUCURSAL", "PUNTODEVENTA"].includes(item),
    )
    const tieneSku = encabezados.some((item) =>
      ["CODIGODEBARRAS", "CODIGOBARRAS", "EAN", "SKU", "ACABADO"].includes(item),
    )
    if (tieneLocal && tieneSku) return indice
  }
  return -1
}

export function procesarFilasCoberturaFavorita(
  filas: Row[],
  codigosMonitoreados: string[],
): Omit<ResultadoCoberturaFavoritaExcel, "hoja"> {
  const indiceEncabezado = localizarEncabezado(filas)
  if (indiceEncabezado < 0) {
    throw new Error(
      "No se encontraron las columnas de local y código de barras. El archivo puede estar sin formato, pero debe conservar esos encabezados.",
    )
  }

  const encabezados = filas[indiceEncabezado]
  const columnas = {
    fecha: buscarColumna(encabezados, ["FECHADEACTUALIZACION", "FECHAACTUALIZACION", "FECHA"]),
    sku: buscarColumna(encabezados, ["CODIGODEBARRAS", "CODIGOBARRAS", "EAN", "SKU", "ACABADO"]),
    producto: buscarColumna(encabezados, ["ITEM", "PRODUCTO", "NOMBREITEM", "NOMBREPRODUCTO"]),
    local: buscarColumna(encabezados, ["UNIDADOPERATIVA", "LOCAL", "SUCURSAL", "PUNTODEVENTA"]),
    quito: buscarColumna(encabezados, ["QUITO"]),
  }

  if (columnas.sku < 0 || columnas.local < 0) {
    throw new Error("El reporte no contiene código de barras y unidad operativa.")
  }

  const usaColumnaQuito = columnas.quito >= 0
  const monitoreados = new Set(codigosMonitoreados.map((item) => normalizar(item)))
  const todas: FilaCoberturaFavorita[] = []
  const seleccionadas = new Map<string, FilaCoberturaFavorita>()
  const fechas: string[] = []

  for (let indice = indiceEncabezado + 1; indice < filas.length; indice += 1) {
    const fila = filas[indice]
    const local = separarLocal(fila[columnas.local])
    const codigoSku = codigo(fila[columnas.sku])
    if (!local || !/^\d{8,14}$/.test(codigoSku)) continue

    const item: FilaCoberturaFavorita = {
      codigo_local: local.codigo,
      nombre_local: local.nombre,
      codigo_sku: codigoSku,
      nombre_sku: columnas.producto >= 0
        ? texto(fila[columnas.producto]).toUpperCase()
        : codigoSku,
    }
    todas.push(item)

    const fecha = columnas.fecha >= 0 ? fechaIso(fila[columnas.fecha]) : ""
    if (fecha) fechas.push(fecha)

    const incluir = usaColumnaQuito
      ? esSi(fila[columnas.quito])
      : monitoreados.has(normalizar(local.codigo))
    if (incluir) seleccionadas.set(`${local.codigo}|${codigoSku}`, item)
  }

  if (todas.length === 0) {
    throw new Error("El archivo no contiene posiciones SKU-local válidas.")
  }
  if (!usaColumnaQuito && monitoreados.size === 0) {
    throw new Error(
      "Este archivo no tiene columna QUITO y todavía no existen locales monitoreados guardados.",
    )
  }
  if (seleccionadas.size === 0) {
    throw new Error(
      usaColumnaQuito
        ? "La columna QUITO no contiene locales marcados con SI."
        : "Ningún código de local del archivo coincide con los locales monitoreados.",
    )
  }

  const localesArchivo = new Set(todas.map((item) => item.codigo_local))
  const localesSeleccionados = new Set(
    Array.from(seleccionadas.values()).map((item) => item.codigo_local),
  )
  const noMonitoreados = usaColumnaQuito
    ? 0
    : Array.from(localesArchivo).filter((item) => !monitoreados.has(normalizar(item))).length
  const fechaReporte = fechas.sort().at(-1) ?? new Date().toISOString().slice(0, 10)
  const advertencias: string[] = []
  if (!usaColumnaQuito && noMonitoreados > 0) {
    advertencias.push(
      `${noMonitoreados} locales del archivo no forman parte del seguimiento y fueron ignorados.`,
    )
  }

  return {
    filas: Array.from(seleccionadas.values()),
    fechaReporte,
    usaColumnaQuito,
    localesArchivo: localesArchivo.size,
    localesSeleccionados: localesSeleccionados.size,
    posicionesSeleccionadas: seleccionadas.size,
    skusSeleccionados: new Set(
      Array.from(seleccionadas.values()).map((item) => item.codigo_sku),
    ).size,
    localesNoMonitoreados: noMonitoreados,
    advertencias,
  }
}

export async function leerReporteCoberturaFavorita(
  archivo: File,
  codigosMonitoreados: string[],
) {
  try {
    const hojas = await readWorkbook(archivo)
    const errores: string[] = []
    for (const hoja of hojas) {
      try {
        return {
          ...procesarFilasCoberturaFavorita(hoja.data, codigosMonitoreados),
          hoja: hoja.sheet,
        } satisfies ResultadoCoberturaFavoritaExcel
      } catch (error) {
        errores.push(error instanceof Error ? error.message : "Hoja no reconocida")
      }
    }
    throw new Error(errores[0] ?? "No se encontró una hoja compatible.")
  } catch (error) {
    throw new Error(
      `No se pudo leer ${archivo.name}: ${error instanceof Error ? error.message : "formato desconocido"}`,
    )
  }
}

export async function huellaArchivoCobertura(archivo: File) {
  const contenido = await archivo.arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", contenido)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
