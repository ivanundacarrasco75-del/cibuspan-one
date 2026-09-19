import { readSheet, type Row } from "read-excel-file/browser"

export type DetalleOrdenProduccionImportar = {
  orden_linea: number
  materia_codigo: string
  materia_nombre: string
  cantidad: number
  costo_unitario: number
  costo_total: number
  es_empaque: boolean
}

export type OrdenProduccionImportar = {
  numero_orden: string
  sucursal_codigo: string
  sucursal_nombre: string
  fecha_registro: string
  fecha_fin_original: string
  fecha_produccion: string
  descripcion: string
  producto_codigo: string
  producto_nombre: string
  tipo_orden: "SKU" | "MICRO"
  tamano_parada: number
  numero_paradas: number
  unidades_producidas: number
  kg_micro: number
  costo_total: number
  estado_validacion: "VALIDA" | "REVISAR"
  observaciones: string
  detalles: DetalleOrdenProduccionImportar[]
}

export type ResultadoOrdenesProduccionExcel = {
  ordenes: OrdenProduccionImportar[]
  fechaDesde: string
  fechaHasta: string
  filas: number
  ordenesSku: number
  ordenesMicro: number
  unidadesSku: number
  kgMicro: number
  costoTotal: number
  ordenesRevisar: number
  skus: string[]
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

function numero(valor: unknown) {
  if (typeof valor === "number") return valor
  let contenido = texto(valor).replace(/[$\s]/g, "")
  if (contenido.includes(",") && contenido.includes(".")) {
    contenido = contenido.lastIndexOf(",") > contenido.lastIndexOf(".")
      ? contenido.replace(/\./g, "").replace(",", ".")
      : contenido.replace(/,/g, "")
  } else if (contenido.includes(",")) {
    contenido = contenido.replace(",", ".")
  }
  const resultado = Number(contenido)
  return Number.isFinite(resultado) ? resultado : NaN
}

function redondear(valor: number, decimales = 6) {
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
    return fechaIso(new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000))
  }
  const contenido = texto(valor)
  const local = contenido.match(/^([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})$/)
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
  const iso = contenido.match(/^(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  return ""
}

function diasEntre(desde: string, hasta: string) {
  return Math.round(
    (new Date(`${hasta}T12:00:00`).getTime() -
      new Date(`${desde}T12:00:00`).getTime()) / 86400000,
  )
}

function fechaDesdeNumeroOrden(numeroOrden: string) {
  const coincidencia = numeroOrden.match(/^(\d{2})(\d{2})(\d{2})\d{2}$/)
  if (!coincidencia) return ""
  const candidata = `20${coincidencia[1]}-${coincidencia[2]}-${coincidencia[3]}`
  const fecha = new Date(`${candidata}T12:00:00`)
  return Number.isNaN(fecha.getTime()) || fechaIso(fecha) !== candidata
    ? ""
    : candidata
}

function buscarColumna(encabezados: Row, opciones: string[]) {
  return encabezados.findIndex((celda) => opciones.includes(normalizar(celda)))
}

function tokensRelevantes(valor: string) {
  const ignorar = new Set([
    "PANGOLIN", "PAN", "FUNDA", "PRODUCTO", "TERMINADO", "GRAMOS",
    "UNIDADES", "PARA", "CON", "DEL", "LOS", "LAS",
  ])
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 4 && !ignorar.has(token) && !/^\d+$/.test(token))
}

function escogerEmpaque(
  producto: string,
  detalles: DetalleOrdenProduccionImportar[],
) {
  const empaques = detalles.filter((detalle) => detalle.es_empaque)
  if (empaques.length <= 1) return empaques[0] ?? null
  const productoTokens = new Set(tokensRelevantes(producto))
  return empaques
    .map((empaque, indice) => ({
      empaque,
      indice,
      puntos: tokensRelevantes(empaque.materia_nombre)
        .filter((token) => productoTokens.has(token)).length,
    }))
    .sort((a, b) => b.puntos - a.puntos || a.indice - b.indice)[0].empaque
}

export function procesarFilasOrdenesProduccion(
  filas: Row[],
): ResultadoOrdenesProduccionExcel {
  const indiceEncabezado = filas.findIndex((fila) => {
    const encabezados = fila.map(normalizar)
    return encabezados.includes("NOORDEN") &&
      encabezados.includes("CODPRODTERM") &&
      encabezados.includes("CANT") &&
      encabezados.includes("CODMP") &&
      encabezados.includes("COSTOTOTAL")
  })

  if (indiceEncabezado < 0) {
    throw new Error(
      "No se encontraron las columnas No. Orden, Cód Prod. Term., Cant, Cód M.P. y Costo Total.",
    )
  }

  const encabezados = filas[indiceEncabezado]
  const columnas = {
    sucursalCodigo: buscarColumna(encabezados, ["CODSUC"]),
    sucursal: buscarColumna(encabezados, ["SUCURSAL"]),
    fechaRegistro: buscarColumna(encabezados, ["FECHAREG"]),
    fechaFin: buscarColumna(encabezados, ["FECHAFIN"]),
    descripcion: buscarColumna(encabezados, ["DESCRIPCION"]),
    productoCodigo: buscarColumna(encabezados, ["CODPRODTERM"]),
    productoNombre: buscarColumna(encabezados, ["NOMBREPRODTERMINADO"]),
    orden: buscarColumna(encabezados, ["NOORDEN"]),
    cantidad: buscarColumna(encabezados, ["CANT"]),
    materiaCodigo: buscarColumna(encabezados, ["CODMP"]),
    materiaNombre: buscarColumna(encabezados, ["NOMBREDELAMP", "NOMBREMP"]),
    costoUnitario: buscarColumna(encabezados, ["COSTOUNIT"]),
    costoTotal: buscarColumna(encabezados, ["COSTOTOTAL"]),
  }
  if (Object.values(columnas).some((indice) => indice < 0)) {
    throw new Error("El reporte no contiene todas las columnas requeridas.")
  }

  type Grupo = {
    numeroOrden: string
    sucursalCodigo: string
    sucursal: string
    fechaRegistro: string
    fechaFin: string
    descripcion: string
    productoCodigo: string
    productoNombre: string
    detalles: DetalleOrdenProduccionImportar[]
    alertas: string[]
  }
  const grupos = new Map<string, Grupo>()
  let filasValidas = 0

  for (let indice = indiceEncabezado + 1; indice < filas.length; indice += 1) {
    const fila = filas[indice]
    const numeroOrden = texto(fila[columnas.orden])
    if (!/^\d{8}$/.test(numeroOrden)) continue

    const fechaRegistro = fechaIso(fila[columnas.fechaRegistro])
    const productoCodigo = texto(fila[columnas.productoCodigo]).replace(/\s+/g, "")
    const productoNombre = texto(fila[columnas.productoNombre])
    const materiaNombre = texto(fila[columnas.materiaNombre])
    const cantidad = numero(fila[columnas.cantidad])
    const costoUnitario = numero(fila[columnas.costoUnitario])
    const costoTotal = numero(fila[columnas.costoTotal])

    if (!fechaRegistro || !productoCodigo || !productoNombre || !materiaNombre) {
      throw new Error(`La fila ${indice + 1} tiene datos obligatorios incompletos.`)
    }
    if (![cantidad, costoUnitario, costoTotal].every(Number.isFinite)) {
      throw new Error(`La fila ${indice + 1} contiene una cantidad o costo inválido.`)
    }

    const existente = grupos.get(numeroOrden)
    const grupo = existente ?? {
      numeroOrden,
      sucursalCodigo: texto(fila[columnas.sucursalCodigo]),
      sucursal: texto(fila[columnas.sucursal]),
      fechaRegistro,
      fechaFin: fechaIso(fila[columnas.fechaFin]),
      descripcion: texto(fila[columnas.descripcion]),
      productoCodigo,
      productoNombre,
      detalles: [],
      alertas: [],
    }

    if (existente && (
      existente.productoCodigo !== productoCodigo ||
      existente.fechaRegistro !== fechaRegistro
    )) {
      grupo.alertas.push("La orden repite líneas con producto o fecha diferente.")
    }

    grupo.detalles.push({
      orden_linea: grupo.detalles.length + 1,
      materia_codigo: texto(fila[columnas.materiaCodigo]),
      materia_nombre: materiaNombre,
      cantidad: redondear(cantidad),
      costo_unitario: redondear(costoUnitario, 8),
      costo_total: redondear(costoTotal),
      es_empaque: /^FUNDA\b/i.test(materiaNombre),
    })
    grupos.set(numeroOrden, grupo)
    filasValidas += 1
  }

  if (grupos.size === 0) {
    throw new Error("El archivo no contiene órdenes de producción válidas.")
  }

  const ordenes: OrdenProduccionImportar[] = Array.from(grupos.values())
    .map((grupo) => {
      const tipoOrden: "SKU" | "MICRO" =
        /^\d{13}(?:T)?$/i.test(grupo.productoCodigo) || /^PH/i.test(grupo.productoCodigo)
          ? "SKU"
          : "MICRO"
      const unidadNominal = numero(
        grupo.descripcion.match(
          tipoOrden === "SKU"
            ? /(\d+(?:[.,]\d+)?)\s*U\b/i
            : /(\d+(?:[.,]\d+)?)\s*KG\b/i,
        )?.[1] ?? 0,
      )
      const empaque = escogerEmpaque(grupo.productoNombre, grupo.detalles)
      const unidades = tipoOrden === "SKU" ? Number(empaque?.cantidad ?? 0) : 0
      const kgMicro = tipoOrden === "MICRO"
        ? grupo.detalles.reduce((total, detalle) => total + detalle.cantidad, 0)
        : 0

      if (tipoOrden === "SKU" && !empaque) {
        grupo.alertas.push("No se encontró una línea de funda para determinar las unidades producidas.")
      }
      if (tipoOrden === "SKU" && !Number.isInteger(unidades)) {
        grupo.alertas.push("La cantidad producida contiene decimales y requiere revisión.")
      }
      if (unidadNominal <= 0) {
        grupo.alertas.push("No se pudo identificar el tamaño de parada en la descripción.")
      }

      const fechaOrden = fechaDesdeNumeroOrden(grupo.numeroOrden)
      let fechaProduccion = grupo.fechaRegistro
      if (fechaOrden) {
        const finDesdeOrden = grupo.fechaFin
          ? diasEntre(fechaOrden, grupo.fechaFin)
          : Number.NaN
        const registroDesdeOrden = diasEntre(fechaOrden, grupo.fechaRegistro)
        if (Number.isFinite(finDesdeOrden) && finDesdeOrden >= 0 && finDesdeOrden <= 31) {
          fechaProduccion = grupo.fechaFin
        } else if (Math.abs(registroDesdeOrden) <= 31) {
          fechaProduccion = grupo.fechaRegistro
        } else {
          fechaProduccion = fechaOrden
        }
      } else if (grupo.fechaFin) {
        const diferencia = diasEntre(grupo.fechaRegistro, grupo.fechaFin)
        if (diferencia >= 0 && diferencia <= 31) fechaProduccion = grupo.fechaFin
      }

      if (!grupo.fechaFin || diasEntre(fechaProduccion, grupo.fechaFin) < 0 || Math.abs(diasEntre(fechaProduccion, grupo.fechaFin)) > 31) {
        grupo.alertas.push(
          grupo.fechaFin
            ? `La fecha final (${grupo.fechaFin}) es inconsistente; se utilizó ${fechaProduccion}.`
            : `No existe fecha de finalización; se utilizó ${fechaProduccion}.`,
        )
      }

      return {
        numero_orden: grupo.numeroOrden,
        sucursal_codigo: grupo.sucursalCodigo,
        sucursal_nombre: grupo.sucursal,
        fecha_registro: grupo.fechaRegistro,
        fecha_fin_original: grupo.fechaFin,
        fecha_produccion: fechaProduccion,
        descripcion: grupo.descripcion,
        producto_codigo: grupo.productoCodigo,
        producto_nombre: grupo.productoNombre,
        tipo_orden: tipoOrden,
        tamano_parada: Number.isFinite(unidadNominal) ? redondear(unidadNominal, 3) : 0,
        numero_paradas:
          tipoOrden === "SKU" && unidadNominal > 0
            ? redondear(unidades / unidadNominal, 3)
            : 0,
        unidades_producidas: redondear(unidades, 3),
        kg_micro: redondear(kgMicro, 3),
        costo_total: redondear(
          grupo.detalles.reduce((total, detalle) => total + detalle.costo_total, 0),
        ),
        estado_validacion: grupo.alertas.length > 0 ? "REVISAR" as const : "VALIDA" as const,
        observaciones: Array.from(new Set(grupo.alertas)).join(" "),
        detalles: grupo.detalles,
      }
    })
    .sort((a, b) =>
      a.fecha_produccion.localeCompare(b.fecha_produccion) ||
      a.numero_orden.localeCompare(b.numero_orden),
    )

  const ordenesSku = ordenes.filter((orden) => orden.tipo_orden === "SKU")
  const ordenesMicro = ordenes.filter((orden) => orden.tipo_orden === "MICRO")

  return {
    ordenes,
    fechaDesde: ordenes[0].fecha_produccion,
    fechaHasta: ordenes.at(-1)?.fecha_produccion ?? ordenes[0].fecha_produccion,
    filas: filasValidas,
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
      ordenes.reduce((total, orden) => total + orden.costo_total, 0),
      6,
    ),
    ordenesRevisar: ordenes.filter((orden) => orden.estado_validacion === "REVISAR").length,
    skus: Array.from(new Set(ordenesSku.map((orden) => orden.producto_codigo))).sort(),
  }
}

export async function leerArchivoOrdenesProduccion(archivo: File) {
  try {
    return procesarFilasOrdenesProduccion(await readSheet(archivo))
  } catch (error) {
    throw new Error(
      `No se pudo leer ${archivo.name}: ${error instanceof Error ? error.message : "formato desconocido"}`,
    )
  }
}

export async function huellaArchivo(archivo: File) {
  const contenido = await archivo.arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", contenido)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
