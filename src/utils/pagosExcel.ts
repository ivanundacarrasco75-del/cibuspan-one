import readXlsxFile, {
  type Row,
  type Sheet,
} from "read-excel-file/browser"

import type {
  CuentaPagoDb,
  LineaPagoImportar,
  ReglaClasificacionPagoDb,
} from "../repositories/pagosRepository"

export type ResultadoArchivoPagos = {
  lineas: LineaPagoImportar[]
  hojaOrigen: string
  fechaDesde: string
  fechaHasta: string
  movimientos: number
  totalPagado: number
  automaticos: number
  pendientes: number
  proveedores: number
  filasOmitidas: number
  advertencias: string[]
}

type LineaPagoPreparada = Omit<LineaPagoImportar, "clave_origen"> & {
  clave_base: string
}

const ENCABEZADOS_FECHA = [
  "fechatransferencia",
  "fechatranferencia",
  "fechapago",
  "fecha",
]

function texto(valor: unknown) {
  if (valor === null || valor === undefined) return ""
  if (typeof valor === "number" && Number.isInteger(valor)) {
    return String(valor)
  }
  return String(valor).replace(/\s+/g, " ").trim()
}

export function normalizarPagoTexto(valor: unknown) {
  return texto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .trim()
    .toUpperCase()
}

function encabezado(valor: unknown) {
  return normalizarPagoTexto(valor).replace(/[^A-Z0-9]/g, "").toLowerCase()
}

function numero(valor: unknown) {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor
  if (valor === null || valor === undefined || valor === "") return null

  let contenido = texto(valor).replace(/[$\s]/g, "")
  if (contenido.includes(",") && contenido.includes(".")) {
    contenido = contenido.lastIndexOf(",") > contenido.lastIndexOf(".")
      ? contenido.replace(/\./g, "").replace(",", ".")
      : contenido.replace(/,/g, "")
  } else if (contenido.includes(",")) {
    contenido = contenido.replace(",", ".")
  }

  const resultado = Number(contenido)
  return Number.isFinite(resultado) ? resultado : null
}

function redondear(valor: number, decimales = 2) {
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
    return fechaIso(
      new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000),
    )
  }

  const contenido = texto(valor)
  const local = contenido.match(/^([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})$/)
  if (local) {
    return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
  }

  const iso = contenido.match(/^(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)$/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  }

  return ""
}

function inicioSemana(fechaIsoTexto: string) {
  const fecha = new Date(`${fechaIsoTexto}T12:00:00`)
  const dia = fecha.getDay()
  fecha.setDate(fecha.getDate() - (dia === 0 ? 6 : dia - 1))
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const fechaDia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${fechaDia}`
}

function buscarColumna(fila: Row, nombres: string[]) {
  return fila.findIndex((celda) => nombres.includes(encabezado(celda)))
}

function indiceEncabezado(filas: Row[]) {
  return filas.findIndex((fila) => {
    const titulos = fila.map(encabezado)
    return titulos.some((titulo) => ENCABEZADOS_FECHA.includes(titulo)) &&
      titulos.some((titulo) => ["cliente", "proveedor", "beneficiario", "destinatario"].includes(titulo)) &&
      titulos.some((titulo) => ["valor", "valorpagado", "cantidad"].includes(titulo))
  })
}

function tieneEstructuraPagos(hoja: Sheet) {
  return indiceEncabezado(hoja.data) >= 0
}

function estadoPago(valor: unknown) {
  const estado = normalizarPagoTexto(valor)
  if (["ANULADO", "A"].includes(estado)) return "ANULADO" as const
  if (["PROGRAMADO", "S", "PENDIENTE"].includes(estado)) {
    return "PROGRAMADO" as const
  }
  return "PAGADO" as const
}

function hashTexto(valor: string) {
  const fnv = (semilla: number) => {
    let hash = semilla >>> 0
    for (let indice = 0; indice < valor.length; indice += 1) {
      hash ^= valor.charCodeAt(indice)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
  }
  return `${fnv(2166136261)}${fnv(3339675911)}`
}

function cuentaPendiente(cuentas: CuentaPagoDb[]) {
  return cuentas.find((cuenta) => cuenta.codigo === "PENDIENTE")
}

export function clasificarPagoAutomaticamente(
  linea: Pick<
    LineaPagoImportar,
    "proveedor" | "proveedor_normalizado" | "descripcion" | "factura"
  >,
  cuentas: CuentaPagoDb[],
  reglas: ReglaClasificacionPagoDb[],
) {
  const porCodigo = new Map(cuentas.map((cuenta) => [cuenta.codigo, cuenta]))
  const proveedor = linea.proveedor_normalizado || normalizarPagoTexto(linea.proveedor)
  const descripcion = normalizarPagoTexto(linea.descripcion)
  const combinado = normalizarPagoTexto(
    `${linea.proveedor} ${linea.descripcion ?? ""} ${linea.factura ?? ""}`,
  )

  for (const regla of [...reglas].sort((a, b) => a.prioridad - b.prioridad)) {
    if (!regla.activo || !regla.patron) continue
    const contenido = regla.campo === "PROVEEDOR"
      ? proveedor
      : regla.campo === "DESCRIPCION"
        ? descripcion
        : combinado
    if (!contenido.includes(regla.patron)) continue

    const cuenta = porCodigo.get(regla.cuenta_codigo)
    if (cuenta?.activo) {
      return {
        cuenta_codigo: cuenta.codigo,
        estado_clasificacion: "AUTOMATICA" as const,
        confianza: Number(regla.confianza ?? 0.9),
      }
    }
  }

  return {
    cuenta_codigo: cuentaPendiente(cuentas)?.codigo ?? "PENDIENTE",
    estado_clasificacion: "PENDIENTE" as const,
    confianza: 0,
  }
}

function procesarHojas(
  hojas: Sheet[],
  cuentas: CuentaPagoDb[],
  reglas: ReglaClasificacionPagoDb[],
) {
  const lineasSinClave: LineaPagoPreparada[] = []
  const advertencias: string[] = []
  let filasOmitidas = 0

  for (const hoja of hojas) {
    const encabezadoFila = indiceEncabezado(hoja.data)
    if (encabezadoFila < 0) continue

    const titulos = hoja.data[encabezadoFila]
    const columnas = {
      fecha: buscarColumna(titulos, ENCABEZADOS_FECHA),
      fechaEmision: buscarColumna(titulos, ["fechaemision", "emision"]),
      pagado: buscarColumna(titulos, ["pagado", "estado"]),
      factura: buscarColumna(titulos, ["factura", "nfactura", "numerofactura"]),
      proveedor: buscarColumna(titulos, ["cliente", "proveedor", "beneficiario", "destinatario"]),
      descripcion: buscarColumna(titulos, ["descripcion", "motivo", "concepto", "motivopago"]),
      valorTotal: buscarColumna(titulos, ["valortotal", "total"]),
      iva: buscarColumna(titulos, ["iva"]),
      retencion: buscarColumna(titulos, ["retencion", "nretencion"]),
      valorPagado: buscarColumna(titulos, ["valor", "valorpagado", "cantidad"]),
      documento: buscarColumna(titulos, ["documento", "ndocumento", "numerodocumento", "referencia"]),
    }

    for (let indice = encabezadoFila + 1; indice < hoja.data.length; indice += 1) {
      const fila = hoja.data[indice]
      const fechaPago = fechaIso(fila[columnas.fecha])
      const descripcion = columnas.descripcion >= 0
        ? texto(fila[columnas.descripcion])
        : ""
      const proveedorOriginal = texto(fila[columnas.proveedor])
      const proveedor = proveedorOriginal || (descripcion ? "SIN PROVEEDOR" : "")
      const valorPagado = numero(fila[columnas.valorPagado])

      const filaVacia = fila.every((celda) => celda === null || texto(celda) === "")
      if (filaVacia) continue

      if (!fechaPago || !proveedor || valorPagado === null || valorPagado <= 0) {
        filasOmitidas += 1
        if (advertencias.length < 12 && (fechaPago || proveedor || valorPagado)) {
          advertencias.push(
            `${hoja.sheet}, fila ${indice + 1}: se omitió por fecha, proveedor o valor pagado incompleto.`,
          )
        }
        continue
      }

      if (!proveedorOriginal && advertencias.length < 12) {
        advertencias.push(
          `${hoja.sheet}, fila ${indice + 1}: no tiene proveedor; se guardará como SIN PROVEEDOR para revisión.`,
        )
      }
      const factura = columnas.factura >= 0 ? texto(fila[columnas.factura]) : ""
      const documento = columnas.documento >= 0 ? texto(fila[columnas.documento]) : ""
      const base = documento
        ? [fechaPago, documento, factura, proveedor, descripcion].join("|")
        : [fechaPago, factura, proveedor, descripcion, redondear(valorPagado)].join("|")

      const parcial: Omit<
        LineaPagoPreparada,
        "cuenta_codigo" | "estado_clasificacion" | "confianza"
      > = {
        fecha_pago: fechaPago,
        semana_inicio: inicioSemana(fechaPago),
        fecha_emision: columnas.fechaEmision >= 0
          ? fechaIso(fila[columnas.fechaEmision]) || null
          : null,
        estado_pago: columnas.pagado >= 0
          ? estadoPago(fila[columnas.pagado])
          : "PAGADO",
        factura: factura || null,
        proveedor,
        proveedor_normalizado: normalizarPagoTexto(proveedor),
        descripcion: descripcion || null,
        valor_total: columnas.valorTotal >= 0
          ? numero(fila[columnas.valorTotal])
          : null,
        iva: columnas.iva >= 0 ? numero(fila[columnas.iva]) : null,
        retencion_referencia: columnas.retencion >= 0
          ? texto(fila[columnas.retencion]) || null
          : null,
        valor_pagado: redondear(valorPagado),
        documento: documento || null,
        fila_origen: indice + 1,
        clave_base: normalizarPagoTexto(base),
      }

      const clasificacion = clasificarPagoAutomaticamente(
        parcial,
        cuentas,
        reglas,
      )
      lineasSinClave.push({
        ...parcial,
        ...clasificacion,
      })
    }
  }

  const repeticiones = new Map<string, number>()
  const lineas = lineasSinClave.map((linea) => {
    const numeroRepeticion = (repeticiones.get(linea.clave_base) ?? 0) + 1
    repeticiones.set(linea.clave_base, numeroRepeticion)
    const claveOrigen = `PAGO-${hashTexto(`${linea.clave_base}|${numeroRepeticion}`)}`
    const { clave_base: _claveBase, ...lineaFinal } = linea
    return { ...lineaFinal, clave_origen: claveOrigen }
  })

  return { lineas, filasOmitidas, advertencias }
}

export async function leerArchivoPagos(
  archivo: File,
  cuentas: CuentaPagoDb[],
  reglas: ReglaClasificacionPagoDb[],
): Promise<ResultadoArchivoPagos> {
  try {
    const hojas = await readXlsxFile(archivo)
    const consolidada = hojas.find(
      (hoja) => normalizarPagoTexto(hoja.sheet) === "TRANSFERENCIAS",
    )
    const hojasFuente = consolidada
      ? [consolidada]
      : hojas.filter(tieneEstructuraPagos)

    if (hojasFuente.length === 0) {
      throw new Error(
        "No se encontró la hoja TRANSFERENCIAS ni otra hoja con fecha, proveedor y valor pagado.",
      )
    }

    const resultado = procesarHojas(hojasFuente, cuentas, reglas)
    if (resultado.lineas.length === 0) {
      throw new Error("El archivo no contiene pagos válidos.")
    }

    resultado.lineas.sort((a, b) =>
      a.fecha_pago.localeCompare(b.fecha_pago) ||
      a.proveedor.localeCompare(b.proveedor) ||
      a.clave_origen.localeCompare(b.clave_origen),
    )

    return {
      lineas: resultado.lineas,
      hojaOrigen: hojasFuente.map((hoja) => hoja.sheet).join(", "),
      fechaDesde: resultado.lineas[0].fecha_pago,
      fechaHasta: resultado.lineas.at(-1)?.fecha_pago ?? resultado.lineas[0].fecha_pago,
      movimientos: resultado.lineas.length,
      totalPagado: redondear(
        resultado.lineas.reduce((total, linea) => total + linea.valor_pagado, 0),
      ),
      automaticos: resultado.lineas.filter(
        (linea) => linea.estado_clasificacion === "AUTOMATICA",
      ).length,
      pendientes: resultado.lineas.filter(
        (linea) => linea.estado_clasificacion === "PENDIENTE",
      ).length,
      proveedores: new Set(
        resultado.lineas.map((linea) => linea.proveedor_normalizado),
      ).size,
      filasOmitidas: resultado.filasOmitidas,
      advertencias: resultado.advertencias,
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`No se pudo leer ${archivo.name}: ${error.message}`)
    }
    throw new Error(`No se pudo leer ${archivo.name}.`)
  }
}

export async function calcularHashArchivo(archivo: File) {
  const bytes = await archivo.arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
