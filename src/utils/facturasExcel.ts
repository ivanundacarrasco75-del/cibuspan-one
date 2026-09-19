import readXlsxFile, { type Row, type Sheet } from "read-excel-file/browser"

import type {
  CuentaPagoDb,
  ReglaClasificacionPagoDb,
} from "../repositories/pagosRepository"
import type { LineaFacturaImportar } from "../repositories/facturasRepository"
import {
  clasificarPagoAutomaticamente,
  normalizarPagoTexto,
} from "./pagosExcel"

export type ResultadoArchivoFacturas = {
  lineas: LineaFacturaImportar[]
  hojaOrigen: string
  facturas: number
  pagadas: number
  pendientes: number
  totalNeto: number
  totalPendiente: number
  proveedores: number
  clasificadas: number
  porRevisar: number
  filasOmitidas: number
  advertencias: string[]
}

const ENCABEZADOS_FECHA = ["fechatranferencia", "fechatransferencia"]

function texto(valor: unknown) {
  return String(valor ?? "").replace(/\s+/g, " ").trim()
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
  } else if (contenido.includes(",")) contenido = contenido.replace(",", ".")
  const resultado = Number(contenido)
  return Number.isFinite(resultado) ? resultado : null
}

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function semanaPago(valor: unknown) {
  const contenido = texto(valor).toUpperCase()
  const coincidencia = contenido.match(/(\d{1,2})\s*$/)
  if (!coincidencia) return { etiqueta: null, numero: null }
  const numeroSemana = Number(coincidencia[1])
  if (!Number.isInteger(numeroSemana) || numeroSemana < 1 || numeroSemana > 53) {
    return { etiqueta: null, numero: null }
  }
  return {
    etiqueta: `S${String(numeroSemana).padStart(2, "0")}`,
    numero: numeroSemana,
  }
}

function fechaIso(valor: unknown) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getUTCFullYear()}-${String(valor.getUTCMonth() + 1).padStart(2, "0")}-${String(valor.getUTCDate()).padStart(2, "0")}`
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

function buscarColumna(fila: Row, nombres: string[]) {
  return fila.findIndex((celda) => nombres.includes(encabezado(celda)))
}

function indiceEncabezado(filas: Row[]) {
  return filas.findIndex((fila) => {
    const titulos = fila.map(encabezado)
    return titulos.some((titulo) => ENCABEZADOS_FECHA.includes(titulo)) &&
      titulos.includes("pagado") && titulos.includes("cliente") &&
      titulos.includes("valortotal")
  })
}

function hashTexto(valor: string) {
  let hash = 2166136261
  for (let indice = 0; indice < valor.length; indice += 1) {
    hash ^= valor.charCodeAt(indice)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function esAnio(fecha: string, anio: number) {
  return fecha.startsWith(`${anio}-`)
}

function procesarHoja(
  hoja: Sheet,
  cuentas: CuentaPagoDb[],
  reglas: ReglaClasificacionPagoDb[],
  anio: number,
) {
  const encabezadoFila = indiceEncabezado(hoja.data)
  if (encabezadoFila < 0) throw new Error("No se encontró la estructura de facturas en TRANSFERENCIAS.")
  const titulos = hoja.data[encabezadoFila]
  const columnas = {
    fechaPago: buscarColumna(titulos, ENCABEZADOS_FECHA),
    semanaPago: buscarColumna(titulos, ["semana", "semanapago", "semanadepago"]),
    fechaEmision: buscarColumna(titulos, ["fechaemision", "emision"]),
    pagado: buscarColumna(titulos, ["pagado", "estado"]),
    factura: buscarColumna(titulos, ["factura", "nfactura", "numerofactura"]),
    proveedor: buscarColumna(titulos, ["cliente", "proveedor", "beneficiario"]),
    descripcion: buscarColumna(titulos, ["descripcion", "motivo", "concepto"]),
    total: buscarColumna(titulos, ["valortotal", "total"]),
    iva: buscarColumna(titulos, ["iva"]),
    retencionReferencia: buscarColumna(titulos, ["retencion", "nretencion"]),
    neto: buscarColumna(titulos, ["valor", "valorpagado", "cantidad"]),
    documento: buscarColumna(titulos, ["documento", "ndocumento", "numerodocumento"]),
  }

  const lineasBase: Omit<LineaFacturaImportar, "clave_origen">[] = []
  const advertencias: string[] = []
  let filasOmitidas = 0

  for (let indice = encabezadoFila + 1; indice < hoja.data.length; indice += 1) {
    const fila = hoja.data[indice]
    const fechaPago = fechaIso(fila[columnas.fechaPago])
    const fechaEmision = fechaIso(fila[columnas.fechaEmision])
    const pagada = normalizarPagoTexto(fila[columnas.pagado]) === "P"

    if (pagada ? !esAnio(fechaPago, anio) : !esAnio(fechaEmision, anio)) continue

    const proveedorOriginal = texto(fila[columnas.proveedor])
    const descripcion = texto(fila[columnas.descripcion])
    const proveedor = proveedorOriginal || (descripcion ? "SIN PROVEEDOR" : "")
    const totalOriginal = numero(fila[columnas.total])
    const netoOriginal = numero(fila[columnas.neto])
    const ivaLeido = Math.max(0, numero(fila[columnas.iva]) ?? 0)
    const total = totalOriginal && totalOriginal > 0
      ? totalOriginal
      : netoOriginal && netoOriginal > 0 ? netoOriginal : 0
    const neto = netoOriginal && netoOriginal > 0 ? netoOriginal : total

    if (!proveedor || total <= 0 || neto <= 0) {
      filasOmitidas += 1
      if (advertencias.length < 12) advertencias.push(
        `Fila ${indice + 1}: se omitió por proveedor o valor incompleto.`,
      )
      continue
    }

    let iva = ivaLeido
    let subtotal = Math.max(0, total - iva)
    let tasaIva = subtotal > 0 && iva > 0 ? iva / subtotal * 100 : 15
    if (iva >= total || tasaIva > 100) {
      if (advertencias.length < 12) advertencias.push(
        `Fila ${indice + 1}: el IVA ${redondear(iva)} no es válido para el total ${redondear(total)}; se importará sin IVA para revisión.`,
      )
      iva = 0
      subtotal = total
      tasaIva = 15
    }
    const clasificacion = clasificarPagoAutomaticamente({
      proveedor,
      proveedor_normalizado: normalizarPagoTexto(proveedor),
      descripcion,
      factura: texto(fila[columnas.factura]),
    }, cuentas, reglas)
    const numeroFactura = texto(fila[columnas.factura])
    const documento = texto(fila[columnas.documento])
    const semanaSugerida = semanaPago(columnas.semanaPago >= 0 ? fila[columnas.semanaPago] : null)
    const base = [
      pagada ? fechaPago : fechaEmision,
      numeroFactura,
      proveedor,
      descripcion,
      redondear(neto),
    ].join("|")

    lineasBase.push({
      fecha_emision: fechaEmision || null,
      fecha_vencimiento: null,
      fecha_pago: fechaPago || null,
      pagada,
      numero_factura: numeroFactura || null,
      proveedor,
      proveedor_normalizado: normalizarPagoTexto(proveedor),
      descripcion: descripcion || null,
      subtotal: redondear(subtotal),
      aplica_iva: iva > 0,
      tasa_iva: redondear(tasaIva),
      iva: redondear(iva),
      total_factura: redondear(total),
      retencion: redondear(Math.max(total - neto, 0)),
      retencion_referencia: texto(fila[columnas.retencionReferencia]) || null,
      valor_neto_pagar: redondear(neto),
      documento: documento || null,
      cuenta_codigo: clasificacion.cuenta_codigo,
      estado_clasificacion: clasificacion.estado_clasificacion,
      confianza: clasificacion.confianza,
      fila_origen: indice + 1,
      semana_pago_sugerida: semanaSugerida.etiqueta,
      semana_pago_numero: semanaSugerida.numero,
      clave_base: hashTexto(base),
    } as Omit<LineaFacturaImportar, "clave_origen"> & { clave_base: string })
  }

  const ocurrencias = new Map<string, number>()
  const lineas = lineasBase.map((linea) => {
    const base = (linea as typeof linea & { clave_base: string }).clave_base
    const ocurrencia = (ocurrencias.get(base) ?? 0) + 1
    ocurrencias.set(base, ocurrencia)
    const { clave_base: _claveBase, ...resto } = linea as typeof linea & { clave_base: string }
    return { ...resto, clave_origen: `FACTURA|${base}|${ocurrencia}` } as LineaFacturaImportar
  })

  return { lineas, advertencias, filasOmitidas }
}

export async function leerArchivoFacturas2026(
  archivo: File,
  cuentas: CuentaPagoDb[],
  reglas: ReglaClasificacionPagoDb[],
) {
  const hojas = await readXlsxFile(archivo)
  const hoja = hojas.find((item) => normalizarPagoTexto(item.sheet) === "TRANSFERENCIAS")
  if (!hoja) throw new Error("El Excel debe contener la hoja TRANSFERENCIAS.")
  const resultado = procesarHoja(hoja, cuentas, reglas, 2026)
  if (resultado.lineas.length === 0) throw new Error("No se encontraron facturas válidas de 2026.")

  return {
    lineas: resultado.lineas,
    hojaOrigen: hoja.sheet,
    facturas: resultado.lineas.length,
    pagadas: resultado.lineas.filter((linea) => linea.pagada).length,
    pendientes: resultado.lineas.filter((linea) => !linea.pagada).length,
    totalNeto: redondear(resultado.lineas.reduce((total, linea) => total + linea.valor_neto_pagar, 0)),
    totalPendiente: redondear(resultado.lineas.filter((linea) => !linea.pagada).reduce((total, linea) => total + linea.valor_neto_pagar, 0)),
    proveedores: new Set(resultado.lineas.map((linea) => linea.proveedor_normalizado)).size,
    clasificadas: resultado.lineas.filter((linea) => linea.estado_clasificacion !== "PENDIENTE").length,
    porRevisar: resultado.lineas.filter((linea) => linea.estado_clasificacion === "PENDIENTE").length,
    filasOmitidas: resultado.filasOmitidas,
    advertencias: resultado.advertencias,
  } satisfies ResultadoArchivoFacturas
}

export async function calcularHashFacturaArchivo(archivo: File) {
  if (globalThis.crypto?.subtle) {
    const buffer = await archivo.arrayBuffer()
    const hash = await globalThis.crypto.subtle.digest("SHA-256", buffer)
    return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
  }
  return `${archivo.name}|${archivo.size}|${archivo.lastModified}`
}
