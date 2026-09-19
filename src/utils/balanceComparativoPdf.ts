import { calcularHashArchivo } from "./libroMayorPdf"

export type ValorBalanceComparativo = {
  mes: number
  valor: number
}

export type CuentaBalanceComparativo = {
  cuenta_codigo: string
  cuenta_nombre: string
  valores: ValorBalanceComparativo[]
}

export type ResultadoBalanceComparativo = {
  anio: number
  ultimo_mes: number
  cuentas: CuentaBalanceComparativo[]
  archivo_hash: string
}

type ItemTexto = {
  texto: string
  x: number
  y: number
}

type LineaTexto = {
  y: number
  items: ItemTexto[]
}

const MESES: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
}

const RX_CUENTA = /^\d+(?:\.\d+)+$/
const RX_NUMERO = /^-?[\d,]+(?:\.\d+)?$/

export async function leerBalanceComparativoPdf(
  archivo: File,
): Promise<ResultadoBalanceComparativo> {
  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecciona el Balance Comparativo en formato PDF.")
  }

  const pdfjs = await import("pdfjs-dist")
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default

  const buffer = await archivo.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const archivoHash = await calcularHashArchivo(archivo)

  let anio = 0
  const cuentas = new Map<string, CuentaBalanceComparativo>()
  let columnasReferencia: { mes: number; x: number }[] = []

  for (let paginaNumero = 1; paginaNumero <= pdf.numPages; paginaNumero += 1) {
    const pagina = await pdf.getPage(paginaNumero)
    const contenido = await pagina.getTextContent()
    const items = (contenido.items as Array<{ str?: string; transform?: number[] }>)
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

    if (!anio) {
      const texto = lineas
        .map((linea) => linea.items.map((item) => item.texto).join(" "))
        .join("\n")
      const matchAnio = texto.match(/Año:\s*(20\d{2})/i)
      if (matchAnio) anio = Number(matchAnio[1])
    }

    const columnasPagina = detectarColumnasMes(items)
    if (columnasPagina.length > 0) columnasReferencia = columnasPagina

    if (columnasReferencia.length === 0) continue

    const xPrimeraColumna = Math.min(...columnasReferencia.map((columna) => columna.x))
    const xDescripcionHasta = xPrimeraColumna - 12

    for (const linea of lineas) {
      const codigoItem = linea.items.find((item) => RX_CUENTA.test(item.texto))
      if (!codigoItem || codigoItem.x > 80) continue

      const codigo = codigoItem.texto
      const descripcion = limpiarTexto(
        linea.items
          .filter(
            (item) =>
              item !== codigoItem &&
              item.x > codigoItem.x &&
              item.x < xDescripcionHasta &&
              !RX_NUMERO.test(item.texto),
          )
          .sort((a, b) => a.x - b.x)
          .map((item) => item.texto)
          .join(" "),
      )

      if (!descripcion) continue

      const valores: ValorBalanceComparativo[] = []
      const numericos = linea.items
        .filter((item) => item.x >= xPrimeraColumna - 15 && RX_NUMERO.test(item.texto))
        .map((item) => ({ ...item, valor: numero(item.texto) }))

      for (const columna of columnasReferencia) {
        const candidato = numericos
          .map((item) => ({ item, distancia: Math.abs(item.x - columna.x) }))
          .filter((entrada) => entrada.distancia <= 22)
          .sort((a, b) => a.distancia - b.distancia)[0]

        valores.push({
          mes: columna.mes,
          valor: candidato ? redondear(candidato.item.valor) : 0,
        })
      }

      if (!cuentas.has(codigo)) {
        cuentas.set(codigo, {
          cuenta_codigo: codigo,
          cuenta_nombre: descripcion,
          valores,
        })
      }
    }
  }

  if (!anio) {
    throw new Error("No pude identificar el año del Balance Comparativo.")
  }

  if (cuentas.size === 0) {
    throw new Error("No pude identificar cuentas en el Balance Comparativo.")
  }

  const cuentasLista = Array.from(cuentas.values())
  let ultimoMes = 0

  for (let mes = 1; mes <= 12; mes += 1) {
    const hayMovimiento = cuentasLista.some((cuenta) => {
      const valor = cuenta.valores.find((item) => item.mes === mes)?.valor ?? 0
      return Math.abs(valor) > 0.005
    })
    if (hayMovimiento) ultimoMes = mes
  }

  if (ultimoMes === 0) {
    throw new Error("El Balance no contiene meses con movimientos.")
  }

  return {
    anio,
    ultimo_mes: ultimoMes,
    cuentas: cuentasLista,
    archivo_hash: archivoHash,
  }
}

function detectarColumnasMes(items: ItemTexto[]) {
  const candidatos = items
    .map((item) => {
      const textoOriginal = item.texto.trim()
      const letras = normalizar(textoOriginal).replace(/[^A-Z]/g, "")

      // El encabezado del ERP usa Ene-, Feb-, Mar-...
      // No confundimos palabras del filtro como "enero" o "diciembre".
      if (!textoOriginal.includes("-") && letras.length !== 3) return null

      const mes = MESES[letras.slice(0, 3)]
      return mes ? { mes, x: item.x, y: item.y } : null
    })
    .filter((item): item is { mes: number; x: number; y: number } => item !== null)

  if (candidatos.length < 2) return []

  const grupos: Array<Array<{ mes: number; x: number; y: number }>> = []
  for (const item of candidatos) {
    let grupo = grupos.find((actual) => Math.abs(actual[0].y - item.y) <= 2)
    if (!grupo) {
      grupo = []
      grupos.push(grupo)
    }
    grupo.push(item)
  }

  const encabezados = grupos
    .map((grupo) => Array.from(new Map(grupo.map((item) => [item.mes, item])).values()))
    .sort((a, b) => b.length - a.length)[0] ?? []

  if (encabezados.length < 2) return []

  const meses = encabezados.sort((a, b) => a.mes - b.mes)
  const paso = mediana(
    meses.slice(1).map((item, indice) => item.x - meses[indice].x),
  )
  const xSaldoAnterior = meses[0].x - (paso || 38)

  return [{ mes: 0, x: xSaldoAnterior }, ...meses.map(({ mes, x }) => ({ mes, x }))]
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
      linea = { y: item.y, items: [] }
      lineas.push(linea)
    }
    linea.items.push(item)
    linea.y = linea.items.reduce((total, actual) => total + actual.y, 0) / linea.items.length
  }

  return lineas
    .map((linea) => ({
      ...linea,
      items: linea.items.slice().sort((a, b) => a.x - b.x),
    }))
    .sort((a, b) => b.y - a.y)
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

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
}

function mediana(valores: number[]) {
  const validos = valores.filter((valor) => Number.isFinite(valor) && valor > 20 && valor < 60)
  if (validos.length === 0) return 38
  const ordenados = validos.sort((a, b) => a - b)
  return ordenados[Math.floor(ordenados.length / 2)]
}
