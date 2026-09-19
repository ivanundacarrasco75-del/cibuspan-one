export type MovimientoLibroMayor = {
  cuenta_codigo: string
  cuenta_nombre: string
  fecha: string
  tipo_asiento: string | null
  numero_asiento: string | null
  numero_documento: string | null
  tercero: string | null
  descripcion: string
  debito: number
  credito: number
  valor: number
}

export type ResultadoLibroMayor = {
  periodo: string
  fecha_desde: string
  fecha_hasta: string
  movimientos: MovimientoLibroMayor[]
  registros_leidos: number
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

type CuentaActual = {
  codigo: string
  nombre: string
}

const RX_FECHA = /^(\d{2}\/\d{2}\/\d{4})\s+([A-Z]\/\w)\b/i
const RX_CUENTA = /Código Cuenta:\s*([0-9.]+)\s+Nombre de la Cuenta:\s*(.+)$/i
const RX_MONEDA = /^-?\d[\d,]*\.\d{2}$/

export async function calcularHashArchivo(archivo: File) {
  const buffer = await archivo.arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function leerLibroMayorPdf(
  archivo: File,
  codigosObjetivo: string[],
): Promise<ResultadoLibroMayor> {
  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecciona el Libro Mayor en formato PDF.")
  }

  if (codigosObjetivo.length === 0) {
    throw new Error("No existen cuentas configuradas para requerir detalle en este periodo.")
  }

  const pdfjs = await import("pdfjs-dist")
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default

  const buffer = await archivo.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const objetivo = new Set(codigosObjetivo)

  let cuentaActual: CuentaActual | null = null
  let fechaDesde = ""
  let fechaHasta = ""
  let registrosLeidos = 0
  const movimientos: MovimientoLibroMayor[] = []

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
    const textoPagina = lineas.map((linea) => linea.texto).join("\n")

    if (paginaNumero === 1) {
      const rango = extraerRango(textoPagina)
      fechaDesde = rango.fechaDesde
      fechaHasta = rango.fechaHasta
    }

    const fechasPagina = lineas
      .map((linea, indice) => {
        const match = linea.texto.match(RX_FECHA)
        return match
          ? { indice, y: linea.y, fechaTexto: match[1], tipoAsiento: match[2].toUpperCase() }
          : null
      })
      .filter(
        (
          fila,
        ): fila is { indice: number; y: number; fechaTexto: string; tipoAsiento: string } =>
          fila !== null,
      )

    const cuentaPorLinea = new Map<number, CuentaActual | null>()
    let cuentaEnPagina: CuentaActual | null = cuentaActual

    lineas.forEach((linea, indice) => {
      const matchCuenta = linea.texto.match(RX_CUENTA)
      if (matchCuenta) {
        cuentaEnPagina = {
          codigo: matchCuenta[1].trim(),
          nombre: limpiarTexto(matchCuenta[2]),
        }
      }
      cuentaPorLinea.set(indice, cuentaEnPagina)
    })

    cuentaActual = cuentaEnPagina

    for (const fechaLinea of fechasPagina) {
      registrosLeidos += 1
      const cuenta = cuentaPorLinea.get(fechaLinea.indice)
      if (!cuenta || !objetivo.has(cuenta.codigo)) continue

      const linea = lineas[fechaLinea.indice]
      const { debito, credito } = extraerImportes(linea.items)
      const valor = redondear(debito - credito)
      if (Math.abs(valor) < 0.005) continue

      const cluster = items.filter((item) => {
        const distancia = Math.abs(item.y - fechaLinea.y)
        if (distancia > 15) return false

        const distanciaMinima = fechasPagina.reduce(
          (minimo, otra) => Math.min(minimo, Math.abs(item.y - otra.y)),
          Number.POSITIVE_INFINITY,
        )

        return distancia <= distanciaMinima + 0.35
      })

      const descripcion = extraerDescripcion(cluster)
      const textoCluster = limpiarTexto(
        cluster
          .slice()
          .sort((a, b) => {
            if (Math.abs(a.y - b.y) > 1.5) return b.y - a.y
            return a.x - b.x
          })
          .map((item) => item.texto)
          .join(" "),
      )

      const numeroAsiento = extraerNumeroAsiento(cluster, fechaLinea.y)
      const numeroDocumento = extraerNumeroDocumento(textoCluster)
      const tercero =
        cuenta.codigo.startsWith("6.1.01.1.01.")
          ? extraerPersonaNomina(descripcion)
          : extraerTercero(descripcion, numeroDocumento)

      movimientos.push({
        cuenta_codigo: cuenta.codigo,
        cuenta_nombre: cuenta.nombre,
        fecha: fechaIso(fechaLinea.fechaTexto),
        tipo_asiento: fechaLinea.tipoAsiento || null,
        numero_asiento: numeroAsiento,
        numero_documento: numeroDocumento,
        tercero,
        descripcion,
        debito: redondear(debito),
        credito: redondear(credito),
        valor,
      })
    }
  }

  if (!fechaDesde || !fechaHasta) {
    throw new Error("No pude identificar el rango 'Fecha desde / hasta' del Libro Mayor.")
  }

  if (movimientos.length === 0) {
    throw new Error("No encontré movimientos para las cuentas que requieren detalle.")
  }

  const periodo = `${fechaDesde.slice(0, 7)}-01`

  if (fechaDesde.slice(0, 7) !== fechaHasta.slice(0, 7)) {
    throw new Error("El Libro Mayor debe corresponder a un solo mes.")
  }

  return {
    periodo,
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta,
    movimientos,
    registros_leidos: registrosLeidos,
  }
}

function agruparLineas(items: ItemTexto[]) {
  const ordenados = items.slice().sort((a, b) => {
    if (Math.abs(a.y - b.y) > 1.8) return b.y - a.y
    return a.x - b.x
  })

  const lineas: LineaTexto[] = []

  for (const item of ordenados) {
    let linea = lineas.find((candidata) => Math.abs(candidata.y - item.y) <= 1.8)

    if (!linea) {
      linea = { y: item.y, items: [], texto: "" }
      lineas.push(linea)
    }

    linea.items.push(item)
    linea.y =
      linea.items.reduce((total, actual) => total + actual.y, 0) / linea.items.length
  }

  return lineas
    .map((linea) => {
      const itemsLinea = linea.items.slice().sort((a, b) => a.x - b.x)
      return {
        ...linea,
        items: itemsLinea,
        texto: limpiarTexto(itemsLinea.map((item) => item.texto).join(" ")),
      }
    })
    .sort((a, b) => b.y - a.y)
}

function extraerImportes(items: ItemTexto[]) {
  let debito = 0
  let credito = 0

  for (const item of items) {
    if (!RX_MONEDA.test(item.texto)) continue
    const valor = numero(item.texto)

    // El reporte de CIBUSPAN usa aproximadamente estas columnas en A4:
    // Débitos ~ x 428-470 / Créditos ~ x 480-520 / Saldo > x 530.
    if (item.x >= 405 && item.x < 475) debito = valor
    else if (item.x >= 475 && item.x < 525) credito = valor
  }

  return { debito, credito }
}

function extraerDescripcion(items: ItemTexto[]) {
  const texto = items
    .filter((item) => item.x >= 180 && item.x < 425)
    .slice()
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > 1.5) return b.y - a.y
      return a.x - b.x
    })
    .map((item) => item.texto)
    .join(" ")

  return limpiarTexto(texto)
    .replace(/Saldo anterior:/gi, "")
    .replace(/Total por cuenta:/gi, "")
    .trim()
}

function extraerNumeroAsiento(items: ItemTexto[], yFecha: number) {
  const candidatos = items
    .filter(
      (item) =>
        item.x >= 78 &&
        item.x < 120 &&
        /^\d{7}$/.test(item.texto),
    )
    .sort((a, b) => Math.abs(a.y - yFecha) - Math.abs(b.y - yFecha))

  return candidatos[0]?.texto ?? null
}

function extraerNumeroDocumento(texto: string) {
  const match = texto.match(/\b(\d{3})\s*-\s*(\d{3})\s*-\s*(\d{6,9})\b/)
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

function extraerPersonaNomina(texto: string) {
  const limpio = limpiarTexto(texto)
    .replace(/^.*?MATRIZ\s+/i, "")
    .trim()

  const patrones = [
    /\bDECIMO\s+CUARTO\s+SUELDO\s+PROVISION\s+(.+)$/i,
    /\bDECIMO\s+TERCERO\s+SUELDO\s+PROVISION\s+(.+)$/i,
    /\bFONDO\s+DE\s+RESERVA\s+MENSUAL\s+(.+)$/i,
    /\bFONDO\s+DE\s+RESERVA\s+PROVISION\s+(.+)$/i,
    /\bAPORTE\s+PATRONAL\s+(.+)$/i,
    /\bSUELDO\s+(.+)$/i,
  ]

  for (const patron of patrones) {
    const match = limpio.match(patron)
    if (match?.[1]) return limpiarTexto(match[1])
  }

  return null
}

function extraerTercero(texto: string, numeroDocumento: string | null) {
  const limpio = limpiarTexto(texto)
  if (!numeroDocumento) return null

  const partes = numeroDocumento.split("-")
  const numeroFinal = partes[2]
  const indiceNumero = limpio.indexOf(numeroFinal)
  if (indiceNumero < 0) return null

  const despues = limpio.slice(indiceNumero + numeroFinal.length).trim()
  const corte = despues.search(/\b(?:FACT\s*\d+|NV\s*\d+)\b/i)
  if (corte <= 0) return null

  const tercero = limpiarTexto(despues.slice(0, corte))
  return tercero.length >= 3 ? tercero : null
}

function extraerRango(texto: string) {
  const limpio = texto.replace(/\s+/g, " ")
  const match = limpio.match(
    /Fecha desde:\s*(\d{2}\/\d{2}\/\d{4})\s+hasta:\s*(\d{2}\/\d{2}\/\d{4})/i,
  )

  if (!match) return { fechaDesde: "", fechaHasta: "" }
  return {
    fechaDesde: fechaIso(match[1]),
    fechaHasta: fechaIso(match[2]),
  }
}

function fechaIso(fecha: string) {
  const [dia, mes, anio] = fecha.split("/")
  return `${anio}-${mes}-${dia}`
}

function numero(texto: string) {
  const valor = Number(texto.replace(/,/g, ""))
  return Number.isFinite(valor) ? valor : 0
}

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function limpiarTexto(texto: string) {
  return texto.replace(/\s+/g, " ").trim()
}
