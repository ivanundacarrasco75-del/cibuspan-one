import {
  readSheet,
  type Row,
} from "read-excel-file/browser"

import type { LineaResultadoImportar } from "../repositories/costosIndirectosRepository"

export type ResultadoArchivoBalance = {
  lineas: LineaResultadoImportar[]
  periodos: string[]
  cuentas: number
  registros: number
  filasLeidas: number
}

const MESES: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11,
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
  return String(valor).trim()
}

function numeroCelda(valor: unknown) {
  if (valor === null || valor === "") return 0
  if (typeof valor === "number") return valor

  let texto = textoCelda(valor)
    .replace(/[$\s]/g, "")

  if (texto.includes(",") && texto.includes(".")) {
    if (texto.lastIndexOf(",") > texto.lastIndexOf(".")) {
      texto = texto.replace(/\./g, "").replace(",", ".")
    } else {
      texto = texto.replace(/,/g, "")
    }
  } else if (texto.includes(",")) {
    texto = texto.replace(",", ".")
  }

  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : NaN
}

function periodoIso(anio: number, mes: number) {
  return `${anio}-${String(mes + 1).padStart(2, "0")}-01`
}

function periodoDesdeCelda(
  valor: unknown,
  anioPredeterminado: number | null,
) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return periodoIso(valor.getUTCFullYear(), valor.getUTCMonth())
  }

  if (typeof valor === "number" && valor > 30000 && valor < 80000) {
    const fecha = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000,
    )
    return periodoIso(fecha.getUTCFullYear(), fecha.getUTCMonth())
  }

  const texto = normalizarTexto(valor)
  const mes = Object.entries(MESES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([nombre]) =>
      new RegExp(`(^|[^a-z])${nombre}([^a-z]|$)`).test(texto),
    )

  if (!mes) return null

  const coincidenciaAnio = texto.match(/(?:^|\D)(20\d{2})(?:\D|$)/)
  const anio = coincidenciaAnio
    ? Number(coincidenciaAnio[1])
    : anioPredeterminado

  return anio ? periodoIso(anio, mes[1]) : null
}

function obtenerAnio(filas: Row[]) {
  for (const fila of filas.slice(0, 12)) {
    for (const celda of fila) {
      const coincidencia = normalizarTexto(celda).match(
        /(?:ano|anio|año)\s*:?\s*(20\d{2})/,
      )
      if (coincidencia) return Number(coincidencia[1])
    }
  }

  return null
}

export function procesarFilasBalance(
  filas: Row[],
): ResultadoArchivoBalance {
  const indiceEncabezado = filas.findIndex((fila) => {
    const encabezados = fila.map(normalizarEncabezado)
    return encabezados.includes("cuenta") && encabezados.includes("descripcion")
  })

  if (indiceEncabezado < 0) {
    throw new Error(
      "El archivo no contiene las columnas Cuenta y Descripción.",
    )
  }

  const encabezados = filas[indiceEncabezado]
  const columnaCuenta = encabezados.findIndex(
    (celda) => normalizarEncabezado(celda) === "cuenta",
  )
  const columnaDescripcion = encabezados.findIndex(
    (celda) => normalizarEncabezado(celda) === "descripcion",
  )
  const anio = obtenerAnio(filas)
  const columnasPeriodo = encabezados
    .map((celda, indice) => ({
      indice,
      periodo: periodoDesdeCelda(celda, anio),
    }))
    .filter(
      (columna): columna is { indice: number; periodo: string } =>
        columna.periodo !== null,
    )

  if (columnasPeriodo.length === 0) {
    throw new Error(
      "No se encontraron columnas mensuales en el balance.",
    )
  }

  const lineasPorClave = new Map<string, LineaResultadoImportar>()
  const cuentas = new Set<string>()
  let filasLeidas = 0

  for (const fila of filas.slice(indiceEncabezado + 1)) {
    const cuentaCodigo = textoCelda(fila[columnaCuenta])
    const cuentaDescripcion = textoCelda(fila[columnaDescripcion])

    if (!/^\d+(?:\.\d+)+$/.test(cuentaCodigo) || !cuentaDescripcion) {
      continue
    }

    filasLeidas += 1
    cuentas.add(cuentaCodigo)

    for (const columna of columnasPeriodo) {
      const valor = numeroCelda(fila[columna.indice])

      if (!Number.isFinite(valor)) {
        throw new Error(
          `La cuenta ${cuentaCodigo} tiene un valor inválido en ${columna.periodo}.`,
        )
      }

      const linea: LineaResultadoImportar = {
        periodo: columna.periodo,
        cuenta_codigo: cuentaCodigo,
        cuenta_descripcion: cuentaDescripcion,
        valor: Math.round(valor * 100) / 100,
      }

      lineasPorClave.set(
        `${linea.periodo}|${linea.cuenta_codigo}`,
        linea,
      )
    }
  }

  const lineas = Array.from(lineasPorClave.values()).sort((a, b) =>
    a.periodo.localeCompare(b.periodo) ||
    a.cuenta_codigo.localeCompare(b.cuenta_codigo),
  )
  const periodos = Array.from(
    new Set(lineas.map((linea) => linea.periodo)),
  ).sort()

  if (lineas.length === 0) {
    throw new Error(
      "El balance no contiene cuentas contables mensuales válidas.",
    )
  }

  return {
    lineas,
    periodos,
    cuentas: cuentas.size,
    registros: lineas.length,
    filasLeidas,
  }
}

export async function leerArchivoBalance(archivo: File) {
  try {
    const filas = await readSheet(archivo)
    return procesarFilasBalance(filas)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `No se pudo leer ${archivo.name}: ${error.message}`,
      )
    }

    throw new Error(`No se pudo leer ${archivo.name}.`)
  }
}
