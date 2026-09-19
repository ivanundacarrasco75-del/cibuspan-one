import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = pdfWorker

export const AREAS_NOMINA = [
  "MANO_OBRA_DIRECTA",
  "MANO_OBRA_INDIRECTA",
  "ADMINISTRACION",
  "VENTAS",
  "DISTRIBUCION",
] as const

export type AreaNomina = (typeof AREAS_NOMINA)[number]

export const ETIQUETAS_AREA_NOMINA: Record<AreaNomina, string> = {
  MANO_OBRA_DIRECTA: "Mano de obra directa",
  MANO_OBRA_INDIRECTA: "Mano de obra indirecta",
  ADMINISTRACION: "Administración",
  VENTAS: "Ventas",
  DISTRIBUCION: "Distribución",
}

export type MovimientoRolPdf = {
  numero_linea: number
  departamento: string
  empleado: string
  empleado_normalizado: string
  mes: string
  anio: number
  rubro: string
  observaciones: string
  mostrar_rol: boolean
  provision: boolean
  ingresos: number
  egresos: number
  area: AreaNomina
}

export type EmpleadoRolPdf = {
  nombre: string
  nombreNormalizado: string
  area: AreaNomina
  movimientos: number
  costoEmpresa: number
  descuentos: number
  pagoNetoRol: number
}

export type AnalisisRolesPdf = {
  archivoNombre: string
  archivoHash: string
  periodo: string
  anio: number
  mes: number
  movimientos: MovimientoRolPdf[]
  empleados: EmpleadoRolPdf[]
  costoEmpresa: number
  descuentos: number
  pagoNetoRol: number
  advertencias: string[]
}

type TextoPosicionado = {
  texto: string
  x: number
  y: number
}

const MESES: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
}

const AREAS_INICIALES: Record<string, AreaNomina> = {
  "DONOSO OROZCO JORGE SANTIAGO": "ADMINISTRACION",
  "UNDA CARRASCO IVAN": "ADMINISTRACION",
  "SAMANIEGO ZAMBRANO ELVIA TERESA": "ADMINISTRACION",
  "ORTIZ BUSTAMANTE DAYSI JEANNETH": "VENTAS",
}

export function normalizarTextoNomina(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
}

export function areaInicialEmpleado(nombre: string): AreaNomina {
  return AREAS_INICIALES[normalizarTextoNomina(nombre)] ?? "MANO_OBRA_DIRECTA"
}

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function numeroPdf(valor: string) {
  const limpio = valor.replace(/\s/g, "")
  if (!limpio) return 0
  const normalizado = limpio.includes(",") && limpio.includes(".")
    ? limpio.replace(/,/g, "")
    : limpio.replace(",", ".")
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : 0
}

async function hashArchivo(archivo: File) {
  const datos = await archivo.arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", datos)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function agruparPorLinea(items: TextoPosicionado[]) {
  const lineas: TextoPosicionado[][] = []
  const ordenados = [...items].sort((a, b) => b.y - a.y || a.x - b.x)

  ordenados.forEach((item) => {
    const linea = lineas.find((grupo) => Math.abs(grupo[0].y - item.y) <= 1.5)
    if (linea) linea.push(item)
    else lineas.push([item])
  })

  return lineas.map((linea) => linea.sort((a, b) => a.x - b.x))
}

function unirRango(linea: TextoPosicionado[], desde: number, hasta: number) {
  return linea
    .filter((item) => item.x >= desde && item.x < hasta)
    .map((item) => item.texto.trim())
    .filter(Boolean)
    .join(" ")
    .trim()
}

function analizarLinea(
  linea: TextoPosicionado[],
  areaGuardada: (nombreNormalizado: string) => AreaNomina | undefined,
) {
  const numeroTexto = unirRango(linea, 0, 44)
  if (!/^\d+$/.test(numeroTexto)) return null

  const itemMes = linea.find((item) => {
    const candidato = normalizarTextoNomina(item.texto)
    return item.x >= 220 && item.x < 285 && Boolean(MESES[candidato])
  })
  if (!itemMes) return null

  const empleado = unirRango(linea, 80, itemMes.x - 0.5)
  const mes = normalizarTextoNomina(itemMes.texto)
  const anioRubro = unirRango(linea, itemMes.x + 5, 419)
  const coincidencia = anioRubro.match(/^(\d{4})\s+(.+)$/)
  if (!empleado || !MESES[mes] || !coincidencia) return null

  const empleadoNormalizado = normalizarTextoNomina(empleado)
  const ingresos = numeroPdf(unirRango(linea, 526, 558))
  const egresos = numeroPdf(unirRango(linea, 558, 613))
  if (ingresos <= 0 && egresos <= 0) return null

  return {
    numero_linea: Number(numeroTexto),
    departamento: unirRango(linea, 44, 80),
    empleado,
    empleado_normalizado: empleadoNormalizado,
    mes,
    anio: Number(coincidencia[1]),
    rubro: coincidencia[2].trim(),
    observaciones: unirRango(linea, 419, 467),
    mostrar_rol: normalizarTextoNomina(unirRango(linea, 467, 493)) === "S",
    provision: normalizarTextoNomina(unirRango(linea, 493, 526)) === "S",
    ingresos,
    egresos,
    area: areaGuardada(empleadoNormalizado) ?? areaInicialEmpleado(empleado),
  } satisfies MovimientoRolPdf
}

export async function leerRolesPagoPdf(
  archivo: File,
  areasGuardadas: Map<string, AreaNomina> = new Map(),
): Promise<AnalisisRolesPdf> {
  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecciona el reporte mensual en formato PDF.")
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const documento = await getDocument({ data: bytes }).promise
  const movimientos: MovimientoRolPdf[] = []
  const textosDocumento: string[] = []
  const advertencias: string[] = []
  const totalesImpresos: {
    ingresos: number | null
    egresos: number | null
  } = { ingresos: null, egresos: null }

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
    const lineas = agruparPorLinea(items)
    lineas.forEach((linea) => {
      const movimiento = analizarLinea(
        linea,
        (nombre) => areasGuardadas.get(nombre),
      )
      if (movimiento) movimientos.push(movimiento)

      const textoLinea = linea.map((item) => item.texto.trim()).join(" ")
      if (/^Totales\b/i.test(textoLinea)) {
        totalesImpresos.ingresos = numeroPdf(unirRango(linea, 526, 558))
        totalesImpresos.egresos = numeroPdf(unirRango(linea, 558, 613))
      }
    })
  }

  if (movimientos.length === 0) {
    throw new Error(
      "No se encontraron rubros. Usa el reporte DETALLE RUBROS que muestra empleado, rubro, ingresos y egresos.",
    )
  }

  const periodos = new Set(movimientos.map((item) => `${item.anio}-${item.mes}`))
  if (periodos.size !== 1) {
    throw new Error("El archivo contiene más de un periodo de nómina.")
  }

  const anio = movimientos[0].anio
  const mesNumero = MESES[movimientos[0].mes]
  const periodo = `${anio}-${String(mesNumero).padStart(2, "0")}-01`
  const costoEmpresa = redondear(
    movimientos.reduce((total, item) => total + item.ingresos, 0),
  )
  const descuentos = redondear(
    movimientos.reduce((total, item) => total + item.egresos, 0),
  )
  const pagoNetoRol = redondear(
    movimientos.reduce(
      (total, item) => total + (item.mostrar_rol ? item.ingresos - item.egresos : 0),
      0,
    ),
  )

  if (
    totalesImpresos.ingresos !== null
    && Math.abs(totalesImpresos.ingresos - costoEmpresa) > 0.02
  ) {
    advertencias.push(
      `Los ingresos leídos (${costoEmpresa.toFixed(2)}) no coinciden con el total impreso (${totalesImpresos.ingresos.toFixed(2)}).`,
    )
  }
  if (
    totalesImpresos.egresos !== null
    && Math.abs(totalesImpresos.egresos - descuentos) > 0.02
  ) {
    advertencias.push(
      `Los egresos leídos (${descuentos.toFixed(2)}) no coinciden con el total impreso (${totalesImpresos.egresos.toFixed(2)}).`,
    )
  }

  const cabecera = textosDocumento.join(" ")
  if (!/DETALLE\s+RUBROS/i.test(cabecera)) {
    advertencias.push("El encabezado no coincide exactamente con DETALLE RUBROS.")
  }

  const mapaEmpleados = new Map<string, EmpleadoRolPdf>()
  movimientos.forEach((item) => {
    const empleado = mapaEmpleados.get(item.empleado_normalizado) ?? {
      nombre: item.empleado,
      nombreNormalizado: item.empleado_normalizado,
      area: item.area,
      movimientos: 0,
      costoEmpresa: 0,
      descuentos: 0,
      pagoNetoRol: 0,
    }
    empleado.movimientos += 1
    empleado.costoEmpresa = redondear(empleado.costoEmpresa + item.ingresos)
    empleado.descuentos = redondear(empleado.descuentos + item.egresos)
    if (item.mostrar_rol) {
      empleado.pagoNetoRol = redondear(
        empleado.pagoNetoRol + item.ingresos - item.egresos,
      )
    }
    mapaEmpleados.set(item.empleado_normalizado, empleado)
  })

  return {
    archivoNombre: archivo.name,
    archivoHash: await hashArchivo(archivo),
    periodo,
    anio,
    mes: mesNumero,
    movimientos,
    empleados: Array.from(mapaEmpleados.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es"),
    ),
    costoEmpresa,
    descuentos,
    pagoNetoRol,
    advertencias,
  }
}
