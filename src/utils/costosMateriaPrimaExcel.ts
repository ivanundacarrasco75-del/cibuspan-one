import {
  readSheet,
  type Row,
} from "read-excel-file/browser"

import type { LineaCostoImportar } from "../repositories/materiaPrimaRepository"

export type TipoArticuloCosto =
  | "MATERIA_PRIMA"
  | "EMPAQUE"
  | "MICRO"

export type LineaCostoExcel =
  LineaCostoImportar & {
    costoUnitario: number
    tipoArticulo: TipoArticuloCosto
  }

export type ResultadoArchivoCostos = {
  lineas: LineaCostoExcel[]
  filasLeidas: number
  productosTerminadosOmitidos: number
  otrasSucursalesOmitidas: number
  filasInvalidas: number
  fechaCorteSugerida: string | null
}

const MESES: Record<string, number> = {
  ene: 0,
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  septiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11,
}

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function normalizarEncabezado(valor: unknown) {
  return normalizarTexto(valor)
    .replace(/[^a-z0-9]/g, "")
}

function textoCelda(valor: unknown) {
  if (valor === null || valor === undefined) return ""
  return String(valor).trim()
}

function numeroCelda(valor: unknown) {
  if (typeof valor === "number") return valor

  const texto = textoCelda(valor)
    .replace(/\s/g, "")
    .replace(/,/g, "")

  if (!texto) return NaN

  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : NaN
}

function buscarColumna(
  encabezados: Row,
  alternativas: string[],
) {
  const normalizados = encabezados.map(
    normalizarEncabezado,
  )

  return normalizados.findIndex((encabezado) =>
    alternativas.includes(encabezado),
  )
}

function esProductoTerminado(
  codigo: string,
  nombre: string,
) {
  const nombreNormalizado = normalizarTexto(nombre)
  const codigoNormalizado = codigo
    .replace(/\s/g, "")
    .toUpperCase()

  return (
    /^\d{12,14}[A-Z]?$/.test(codigoNormalizado) ||
    nombreNormalizado.startsWith("pangolin ") ||
    nombreNormalizado.startsWith("santa maria ")
  )
}

function clasificarArticulo(
  nombre: string,
): TipoArticuloCosto {
  const normalizado = normalizarTexto(nombre)

  if (normalizado.startsWith("micro ")) {
    return "MICRO"
  }

  if (
    normalizado.startsWith("funda ") ||
    normalizado.startsWith("caja ") ||
    normalizado.includes("etiqueta") ||
    normalizado.includes("empaque")
  ) {
    return "EMPAQUE"
  }

  return "MATERIA_PRIMA"
}

export function sugerirFechaCorte(
  nombreArchivo: string,
) {
  const nombre = normalizarTexto(nombreArchivo)
  const mesEncontrado = Object.entries(MESES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([mes]) =>
      new RegExp(`(^|[^a-z])${mes}([^a-z]|$)`).test(
        nombre,
      ),
    )

  if (!mesEncontrado) return null

  const coincidenciaAnio = nombre.match(
    /(?:^|\D)(20\d{2}|\d{2})(?:\D|$)/,
  )

  if (!coincidenciaAnio) return null

  const anioTexto = coincidenciaAnio[1]
  const anio =
    anioTexto.length === 2
      ? 2000 + Number(anioTexto)
      : Number(anioTexto)
  const mes = mesEncontrado[1]
  const ultimoDia = new Date(
    anio,
    mes + 1,
    0,
  ).getDate()

  return `${anio}-${String(mes + 1).padStart(
    2,
    "0",
  )}-${String(ultimoDia).padStart(2, "0")}`
}

export function procesarFilasCostos(
  filas: Row[],
  nombreArchivo: string,
): ResultadoArchivoCostos {
  const indiceEncabezado = filas.findIndex(
    (fila) =>
      fila.some(
        (celda) =>
          normalizarEncabezado(celda) ===
          "codarticulo",
      ) &&
      fila.some(
        (celda) =>
          normalizarEncabezado(celda) ===
          "nombredelarticulo",
      ),
  )

  if (indiceEncabezado < 0) {
    throw new Error(
      "El archivo no contiene las columnas Cód Artículo y Nombre del Artículo.",
    )
  }

  const encabezados = filas[indiceEncabezado]
  const columnaSucursal = buscarColumna(
    encabezados,
    ["sucursal"],
  )
  const columnaCodigo = buscarColumna(
    encabezados,
    ["codarticulo", "codigoarticulo"],
  )
  const columnaNombre = buscarColumna(
    encabezados,
    ["nombredelarticulo", "nombrearticulo"],
  )
  const columnaStock = buscarColumna(
    encabezados,
    ["stock"],
  )
  const columnaCostoUnitario = buscarColumna(
    encabezados,
    ["pcosto", "costounitario"],
  )
  const columnaCostoTotal = buscarColumna(
    encabezados,
    ["costototal"],
  )

  const obligatorias = [
    columnaSucursal,
    columnaCodigo,
    columnaNombre,
    columnaStock,
    columnaCostoUnitario,
    columnaCostoTotal,
  ]

  if (obligatorias.some((indice) => indice < 0)) {
    throw new Error(
      "El archivo no tiene todas las columnas requeridas: Sucursal, código, nombre, stock, P.Costo y Costo Total.",
    )
  }

  const datos = filas
    .slice(indiceEncabezado + 1)
    .filter((fila) =>
      fila.some(
        (celda) => celda !== null && celda !== "",
      ),
    )

  const lineas: LineaCostoExcel[] = []
  let productosTerminadosOmitidos = 0
  let otrasSucursalesOmitidas = 0
  let filasInvalidas = 0

  for (const fila of datos) {
    const sucursal = normalizarTexto(
      fila[columnaSucursal],
    )
    const codigo = textoCelda(fila[columnaCodigo])
    const nombre = textoCelda(fila[columnaNombre])
    const stock = numeroCelda(fila[columnaStock])
    const costoUnitario = numeroCelda(
      fila[columnaCostoUnitario],
    )
    const costoTotal = numeroCelda(
      fila[columnaCostoTotal],
    )

    if (sucursal !== "matriz") {
      otrasSucursalesOmitidas += 1
      continue
    }

    if (esProductoTerminado(codigo, nombre)) {
      productosTerminadosOmitidos += 1
      continue
    }

    if (
      !codigo ||
      !nombre ||
      !Number.isFinite(stock) ||
      !Number.isFinite(costoUnitario) ||
      !Number.isFinite(costoTotal) ||
      stock < 0 ||
      costoUnitario < 0 ||
      costoTotal < 0
    ) {
      filasInvalidas += 1
      continue
    }

    lineas.push({
      codigoContable: codigo,
      nombre,
      stock,
      costoTotal,
      costoUnitario,
      tipoArticulo:
        clasificarArticulo(nombre),
    })
  }

  return {
    lineas,
    filasLeidas: datos.length,
    productosTerminadosOmitidos,
    otrasSucursalesOmitidas,
    filasInvalidas,
    fechaCorteSugerida:
      sugerirFechaCorte(nombreArchivo),
  }
}

export async function leerArchivoCostos(
  archivo: File,
) {
  try {
    const filas = await readSheet(archivo)
    return procesarFilasCostos(
      filas,
      archivo.name,
    )
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `No se pudo leer ${archivo.name}: ${error.message}`,
      )
    }

    throw new Error(
      `No se pudo leer ${archivo.name}.`,
    )
  }
}
