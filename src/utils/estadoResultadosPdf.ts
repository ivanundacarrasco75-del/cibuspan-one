export type CuentaEstadoResultados = {
  cuenta_codigo: string
  cuenta_descripcion: string
  valor_acumulado: number
}

export type ResultadoEstadoResultadosPdf = {
  fecha_desde: string
  fecha_hasta: string
  cuentas: CuentaEstadoResultados[]
}

type ItemTexto = {
  texto: string
  x: number
  y: number
}

type LineaTexto = {
  y: number
  items: ItemTexto[]
  texto: string
}

const RX_CUENTA = /^\s*(\d+(?:\.\d+)+)\s+(.+?)\s+(-?[\d,.]+)\s*$/
const RX_RANGO = /Fecha\s+desde:\s*(\d{2}\/\d{2}\/\d{4})\s+hasta:\s*(\d{2}\/\d{2}\/\d{4})/i
const RX_CORTE = /Fecha\s+de\s+corte\s+al:\s*(\d{2}\/\d{2}\/\d{4})/i

export async function leerEstadoResultadosPdf(
  archivo: File,
): Promise<ResultadoEstadoResultadosPdf> {
  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecciona el Estado de Resultados en formato PDF.")
  }

  const pdfjs = await import("pdfjs-dist")
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default

  const buffer = await archivo.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise

  let fechaDesde = ""
  let fechaHasta = ""
  const cuentas = new Map<string, CuentaEstadoResultados>()

  for (let paginaNumero = 1; paginaNumero <= pdf.numPages; paginaNumero += 1) {
    const pagina = await pdf.getPage(paginaNumero)
    const contenido = await pagina.getTextContent()
    const contenidoItems = contenido.items as Array<{
      str?: string
      transform?: number[]
    }>

    const items = contenidoItems
      .map((item): ItemTexto | null => {
        if (!Array.isArray(item.transform)) return null
        const texto = String(item.str ?? "").trim()
        if (!texto) return null
        return {
          texto,
          x: Number(item.transform[4] ?? 0),
          y: Number(item.transform[5] ?? 0),
        }
      })
      .filter((item): item is ItemTexto => item !== null)

    const lineas = agruparLineas(items)

    if (!fechaDesde || !fechaHasta) {
      const textoPagina = lineas.map((linea) => linea.texto).join("\n")
      const rango = textoPagina.match(RX_RANGO)
      if (rango) {
        fechaDesde = fechaIso(rango[1])
        fechaHasta = fechaIso(rango[2])
      } else {
        const corte = textoPagina.match(RX_CORTE)
        if (corte) {
          fechaHasta = fechaIso(corte[1])
          fechaDesde = `${fechaHasta.slice(0, 4)}-01-01`
        }
      }
    }

    for (const linea of lineas) {
      const match = linea.texto.match(RX_CUENTA)
      if (!match) continue

      const codigo = match[1].trim()
      if (!/^[4-8](?:\.\d+)+$/.test(codigo)) continue

      const descripcion = limpiarTexto(match[2])
      const valor = numeroContable(match[3])
      if (!Number.isFinite(valor)) continue

      cuentas.set(codigo, {
        cuenta_codigo: codigo,
        cuenta_descripcion: descripcion || codigo,
        valor_acumulado: redondear(valor),
      })
    }
  }

  if (!fechaDesde || !fechaHasta) {
    throw new Error("No pude identificar la fecha de corte del Estado de Resultados.")
  }

  if (fechaDesde.slice(0, 4) !== fechaHasta.slice(0, 4)) {
    throw new Error("El Estado de Resultados debe corresponder a un solo año contable.")
  }

  const inicioAnio = `${fechaHasta.slice(0, 4)}-01-01`
  const inicioMes = `${fechaHasta.slice(0, 7)}-01`
  const esAcumulado = fechaDesde === inicioAnio
  const esMensual = fechaDesde === inicioMes

  if (!esAcumulado && !esMensual) {
    throw new Error(
      `El Estado de Resultados debe ser acumulado desde el 01/01/${fechaHasta.slice(0, 4)} o mensual desde el 01/${fechaHasta.slice(5, 7)}/${fechaHasta.slice(0, 4)}. El PDF inicia en ${fechaLegible(fechaDesde)}.`,
    )
  }

  const resultado = Array.from(cuentas.values()).sort((a, b) =>
    a.cuenta_codigo.localeCompare(b.cuenta_codigo, "es", { numeric: true }),
  )

  if (resultado.length < 10) {
    throw new Error(
      "El PDF se pudo abrir, pero no encontré suficientes cuentas contables del Estado de Resultados.",
    )
  }

  if (!resultado.some((cuenta) => cuenta.cuenta_codigo.startsWith("4."))) {
    throw new Error("El PDF no contiene cuentas de ingresos (grupo 4).")
  }

  if (!resultado.some((cuenta) => cuenta.cuenta_codigo.startsWith("5."))) {
    throw new Error("El PDF no contiene cuentas de costo de ventas (grupo 5).")
  }

  if (!resultado.some((cuenta) => cuenta.cuenta_codigo.startsWith("6."))) {
    throw new Error("El PDF no contiene cuentas de gastos (grupo 6).")
  }

  return {
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta,
    cuentas: resultado,
  }
}

function agruparLineas(items: ItemTexto[]): LineaTexto[] {
  const ordenados = items.slice().sort((a, b) => {
    if (Math.abs(a.y - b.y) > 1.8) return b.y - a.y
    return a.x - b.x
  })

  const grupos: ItemTexto[][] = []

  for (const item of ordenados) {
    const grupo = grupos.find((actual) => Math.abs(actual[0].y - item.y) <= 1.8)
    if (grupo) grupo.push(item)
    else grupos.push([item])
  }

  return grupos
    .map((grupo) => {
      const itemsLinea = grupo.slice().sort((a, b) => a.x - b.x)
      return {
        y: itemsLinea[0]?.y ?? 0,
        items: itemsLinea,
        texto: limpiarTexto(itemsLinea.map((item) => item.texto).join(" ")),
      }
    })
    .sort((a, b) => b.y - a.y)
}

function limpiarTexto(texto: string) {
  return texto.replace(/\s+/g, " ").trim()
}

function numeroContable(texto: string) {
  const limpio = texto.replace(/,/g, "").trim()
  const valor = Number(limpio)
  return Number.isFinite(valor) ? valor : Number.NaN
}

function fechaIso(fecha: string) {
  const [dia, mes, anio] = fecha.split("/")
  return `${anio}-${mes}-${dia}`
}

function fechaLegible(fecha: string) {
  const [anio, mes, dia] = fecha.split("-")
  return `${dia}/${mes}/${anio}`
}

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}
