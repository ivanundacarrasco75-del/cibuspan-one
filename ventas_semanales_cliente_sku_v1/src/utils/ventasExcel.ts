import {
  readSheet,
  type Row,
} from "read-excel-file/browser"

import type { LineaVentaImportar } from "../repositories/ventasRepository"

export type ResultadoArchivoVentas = {
  lineas: LineaVentaImportar[]
  fechaDesde: string
  fechaHasta: string
  clientes: number
  skus: number
  movimientos: number
  unidades: number
  ventaSinImpuestos: number
}

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function normalizarEncabezado(valor: unknown) {
  return normalizarTexto(valor).replace(/[^a-z0-9]/g, "")
}

function textoCelda(valor: unknown) {
  if (valor === null || valor === undefined) return ""
  return String(valor).replace(/\s+/g, " ").trim()
}

function numeroCelda(valor: unknown) {
  if (typeof valor === "number") return valor
  if (valor === null || valor === undefined || valor === "") return NaN

  let texto = textoCelda(valor).replace(/[$\s]/g, "")

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
    const anio = valor.getUTCFullYear()
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0")
    const dia = String(valor.getUTCDate()).padStart(2, "0")
    return `${anio}-${mes}-${dia}`
  }

  if (typeof valor === "number" && valor > 30000 && valor < 80000) {
    const fecha = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000,
    )
    return fechaIso(fecha)
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

  return null
}

function codigoSku(valor: unknown) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return Number.isInteger(valor)
      ? String(valor)
      : String(valor).replace(/\.0+$/, "")
  }

  return textoCelda(valor).replace(/\s+/g, "")
}

function comprobante(valor: unknown) {
  return textoCelda(valor).replace(/\s*-\s*/g, "-")
}

function buscarColumna(encabezados: Row, nombres: string[]) {
  return encabezados.findIndex((celda) =>
    nombres.includes(normalizarEncabezado(celda)),
  )
}

export function procesarFilasVentas(
  filas: Row[],
): ResultadoArchivoVentas {
  const indiceEncabezado = filas.findIndex((fila) => {
    const encabezados = fila.map(normalizarEncabezado)
    return encabezados.includes("nocomprobante") &&
      encabezados.includes("cliente") &&
      encabezados.includes("coditem") &&
      encabezados.includes("cant") &&
      encabezados.includes("totsinimptos")
  })

  if (indiceEncabezado < 0) {
    throw new Error(
      "El archivo no contiene las columnas No. Comprobante, Cliente, Cod Item, Cant y Tot sin Imptos.",
    )
  }

  const encabezados = filas[indiceEncabezado]
  const columnas = {
    comprobante: buscarColumna(encabezados, ["nocomprobante"]),
    fecha: buscarColumna(encabezados, ["fecha", "fechaemision"]),
    cliente: buscarColumna(encabezados, ["cliente"]),
    sku: buscarColumna(encabezados, ["coditem", "codigoitem", "sku"]),
    producto: buscarColumna(encabezados, ["nombredelitem", "nombreitem", "producto"]),
    cantidad: buscarColumna(encabezados, ["cant", "cantidad"]),
    unitario: buscarColumna(encabezados, ["unit", "unitario"]),
    descuento: buscarColumna(encabezados, ["dcto", "descuento"]),
    neto: buscarColumna(encabezados, ["neto"]),
    total: buscarColumna(encabezados, ["totsinimptos", "totalsinimpuestos"]),
  }

  if (Object.values(columnas).some((indice) => indice < 0)) {
    throw new Error(
      "El reporte de ventas no contiene todas las columnas requeridas.",
    )
  }

  const lineas: LineaVentaImportar[] = []
  const claves = new Set<string>()
  const clientes = new Set<string>()
  const skus = new Set<string>()

  for (let indice = indiceEncabezado + 1; indice < filas.length; indice += 1) {
    const fila = filas[indice]
    const numeroComprobante = comprobante(fila[columnas.comprobante])
    const sku = codigoSku(fila[columnas.sku])
    const fecha = fechaIso(fila[columnas.fecha])

    if (!numeroComprobante && !sku && !fecha) continue
    if (normalizarEncabezado(numeroComprobante) === "nocomprobante") continue
    if (!/^\d{3}-\d{3}-\d+$/.test(numeroComprobante)) continue

    const cliente = textoCelda(fila[columnas.cliente])
    const producto = textoCelda(fila[columnas.producto])
    const cantidad = numeroCelda(fila[columnas.cantidad])
    const unitario = numeroCelda(fila[columnas.unitario])
    const descuento = numeroCelda(fila[columnas.descuento])
    const neto = numeroCelda(fila[columnas.neto])
    const total = numeroCelda(fila[columnas.total])

    if (!fecha || !cliente || !sku || !producto) {
      throw new Error(
        `La fila ${indice + 1} tiene fecha, cliente, SKU o producto incompleto.`,
      )
    }

    if (![cantidad, unitario, descuento, neto, total].every(Number.isFinite)) {
      throw new Error(
        `La fila ${indice + 1} contiene una cantidad o valor inválido.`,
      )
    }

    const clave = `${numeroComprobante}|${sku}`
    if (claves.has(clave)) {
      throw new Error(
        `El comprobante ${numeroComprobante} repite el SKU ${sku}.`,
      )
    }

    claves.add(clave)
    clientes.add(cliente)
    skus.add(sku)
    lineas.push({
      comprobante: numeroComprobante,
      fecha_emision: fecha,
      cliente_nombre: cliente,
      sku,
      producto_nombre: producto,
      cantidad: redondear(cantidad, 3),
      precio_unitario: redondear(unitario, 6),
      descuento: redondear(descuento, 6),
      precio_neto: redondear(neto, 6),
      total_sin_impuestos: redondear(total, 6),
    })
  }

  if (lineas.length === 0) {
    throw new Error("El archivo no contiene movimientos de venta válidos.")
  }

  lineas.sort((a, b) =>
    a.fecha_emision.localeCompare(b.fecha_emision) ||
    a.comprobante.localeCompare(b.comprobante) ||
    a.sku.localeCompare(b.sku),
  )

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
      lineas.reduce(
        (total, linea) => total + linea.total_sin_impuestos,
        0,
      ),
      6,
    ),
  }
}

export async function leerArchivoVentas(archivo: File) {
  try {
    const filas = await readSheet(archivo)
    return procesarFilasVentas(filas)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `No se pudo leer ${archivo.name}: ${error.message}`,
      )
    }

    throw new Error(`No se pudo leer ${archivo.name}.`)
  }
}
