import { createWorker, PSM, type LoggerMessage } from "tesseract.js"

export type LineaPedidoClientePdf = {
  codigoBarras: string
  nombre: string
  cantidadEmpaques: number
  unidadManejoArchivo?: number
}

export type PedidoClientePdf = {
  numeroPedido: string
  bodegaTexto: string
  fechaEntrega: string
  productos: LineaPedidoClientePdf[]
  advertencias: string[]
}

type ProgresoPdf = (porcentaje: number, mensaje: string) => void

type PalabraOcr = {
  pagina: number
  bloque: number
  parrafo: number
  linea: number
  izquierda: number
  arriba: number
  anchoPagina: number
  texto: string
}

type LineaOcr = {
  pagina: number
  arriba: number
  palabras: PalabraOcr[]
  texto: string
}

const PRODUCTOS_ROSADO = [
  { codigo: "7868304262189", nombre: "Integral", firmas: ["MOLDE INTEGRAL"] },
  { codigo: "7868304262196", nombre: "Granos", firmas: ["GRANOS SEMILLAS", "GRANOS Y SEMILLAS"] },
  { codigo: "7868304262202", nombre: "Dulce", firmas: ["DULCE BOTON", "BOTON INTEGRAL"] },
  { codigo: "7868304262219", nombre: "Rollo", firmas: ["ROLLO CHOCOLATE"] },
  { codigo: "7868304276254", nombre: "Centeno", firmas: ["CENTENO"] },
  { codigo: "7868304276261", nombre: "Mantequilla", firmas: ["MANTEQUILLA"] },
  { codigo: "7868304276285", nombre: "Sanduchero integral", firmas: ["SANDUCHERO INTEGRAL"] },
  { codigo: "7868304276292", nombre: "Blanco", firmas: ["PAN BLANCO", "MOLDE BLANCO"] },
  { codigo: "7868304276308", nombre: "Maíz", firmas: ["MAIZ QUESO"] },
  { codigo: "7868304276315", nombre: "Chocobits", firmas: ["CHOCOBITS"] },
  { codigo: "7868304276322", nombre: "Manjar", firmas: ["MANJAR"] },
]

export async function leerPedidosTutiPdf(
  archivo: File,
  onProgreso?: ProgresoPdf,
) {
  onProgreso?.(10, "Abriendo PDF de TUTI…")
  const texto = await extraerTextoPdf(archivo)
  onProgreso?.(100, "Pedido de TUTI leído.")
  return interpretarPedidoTutiTexto(texto)
}

export function interpretarPedidoTutiTexto(textoOriginal: string) {
  const texto = normalizarTexto(textoOriginal)
  const numeroPedido =
    texto.match(/ORDEN\s+DE\s+COMPRA\s+(\d{8,})/)?.[1] ??
    texto.match(/CITA\s+PARA\s+ENTREGA\s*:\s*(\d{8,})/)?.[1] ??
    ""
  const fechaTexto =
    texto.match(/FECHA\s+Y\s+HORA\s*:\s*(\d{2}[./-]\d{2}[./-]\d{4})/)?.[1] ??
    texto.match(/NOTAS\s*:\s*FECHA\s*:\s*(\d{2}[./-]\d{2}[./-]\d{4})/)?.[1] ??
    ""
  const bodega = texto.match(
    /ENTREGAR\s+EN\s*:\s*\d+\s+TUTI\s+BODEGA\s+(.+?)(?:\n|DIRECCION\s*:)/,
  )?.[1]?.trim() ?? ""

  const lineaRollo = texto
    .split("\n")
    .find((linea) => /ROLLO\s+DE\s+CHOCOLATE/.test(linea)) ?? ""
  const cantidades = lineaRollo.match(
    /PANGOLI\s*N?\s+(\d+)\s+(\d+)\s+CJ\b/,
  ) ?? texto.match(
    /ROLLO\s+DE\s+CHOCOLATE[\s\S]{0,160}?PANGOLI\s*N?\s+(\d+)\s+(\d+)\s+CJ\b/,
  )
  const cantidadEmpaques = Number(cantidades?.[2] ?? 0)
  const advertencias: string[] = []

  if (!numeroPedido) advertencias.push("No se reconoció el número de orden.")
  if (!fechaTexto) advertencias.push("No se reconoció la fecha de entrega.")
  if (!bodega) advertencias.push("No se reconoció la bodega de entrega.")
  if (cantidadEmpaques <= 0) advertencias.push("No se reconoció la cantidad de cajas.")

  return [{
    numeroPedido,
    bodegaTexto: bodega,
    fechaEntrega: fechaIso(fechaTexto),
    productos: cantidadEmpaques > 0
      ? [{
          codigoBarras: "7868304262219T",
          nombre: "Rollo de chocolate TUTI",
          cantidadEmpaques,
          unidadManejoArchivo: Number(cantidades?.[1] ?? 0) || undefined,
        }]
      : [],
    advertencias,
  }] satisfies PedidoClientePdf[]
}

export async function leerPedidosRosadoPdf(
  archivo: File,
  onProgreso?: ProgresoPdf,
) {
  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecciona una orden de El Rosado en formato PDF.")
  }

  const pdfjs = await import("pdfjs-dist")
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await archivo.arrayBuffer()),
  }).promise
  let paginaActual = 0
  const worker = await createWorker("spa", 1, {
    logger: (mensaje: LoggerMessage) => {
      if (mensaje.status !== "recognizing text") return
      const avancePagina = Number(mensaje.progress || 0)
      const avance = ((paginaActual + avancePagina) / pdf.numPages) * 100
      onProgreso?.(Math.min(99, Math.round(avance)), "Reconociendo órdenes de El Rosado…")
    },
  })

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    })

    const palabras: PalabraOcr[] = []

    for (paginaActual = 0; paginaActual < pdf.numPages; paginaActual += 1) {
      onProgreso?.(
        Math.round((paginaActual / pdf.numPages) * 100),
        `Leyendo página ${paginaActual + 1} de ${pdf.numPages}…`,
      )
      const pagina = await pdf.getPage(paginaActual + 1)
      const viewport = pagina.getViewport({ scale: 4 })
      const canvas = document.createElement("canvas")
      const contexto = canvas.getContext("2d", { alpha: false })

      if (!contexto) throw new Error("No se pudo preparar la lectura del PDF.")

      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      contexto.fillStyle = "white"
      contexto.fillRect(0, 0, canvas.width, canvas.height)
      await pagina.render({ canvas, canvasContext: contexto, viewport }).promise

      const resultado = await worker.recognize(
        canvas,
        undefined,
        { text: true, tsv: true },
      )
      palabras.push(
        ...palabrasDesdeTsv(
          resultado.data.tsv ?? "",
          paginaActual + 1,
          canvas.width,
        ),
      )
      canvas.width = 1
      canvas.height = 1
    }

    onProgreso?.(100, "Órdenes de El Rosado interpretadas.")
    return interpretarPedidosRosadoOcr(palabras)
  } finally {
    await worker.terminate()
  }
}

function interpretarPedidosRosadoOcr(palabras: PalabraOcr[]) {
  const lineas = agruparLineas(palabras)
  const marcadores = palabras
    .filter((palabra) => /^46\d{8}$/.test(limpiarNumero(palabra.texto)))
    .sort((a, b) => a.pagina - b.pagina || a.arriba - b.arriba)

  if (marcadores.length === 0) {
    throw new Error("No se reconocieron números de orden en el PDF de El Rosado.")
  }

  return marcadores.map<PedidoClientePdf>((marcador, indice) => {
    const siguiente = marcadores[indice + 1]
    const lineasOrden = lineas.filter((linea) => {
      if (linea.pagina !== marcador.pagina) return false
      if (linea.arriba < marcador.arriba) return false
      return !siguiente || siguiente.pagina !== marcador.pagina || linea.arriba < siguiente.arriba
    })
    const textoOrden = lineasOrden.map((linea) => linea.texto).join("\n")
    const fechas = Array.from(
      textoOrden.matchAll(/(20\d{2})[./-](\d{2})[./-](\d{2})/g),
    )
    const ultimaFecha = fechas.at(-1)
    const fechaEntrega = ultimaFecha
      ? `${ultimaFecha[1]}-${ultimaFecha[2]}-${ultimaFecha[3]}`
      : ""
    const bodegaTexto = extraerBodegaRosado(lineasOrden)
    const productos: LineaPedidoClientePdf[] = []

    lineasOrden.forEach((linea) => {
      const texto = normalizarSimple(linea.texto)
      const producto = PRODUCTOS_ROSADO.find((candidato) =>
        candidato.firmas.some((firma) => texto.includes(firma)),
      )

      if (!producto) return

      const palabraCantidad = linea.palabras.find((palabra) => {
        const proporcion = palabra.izquierda / palabra.anchoPagina
        return proporcion >= 0.605 && proporcion <= 0.66
      })
      const cantidadEmpaques = interpretarCantidadRosado(
        palabraCantidad?.texto ?? "",
      )

      productos.push({
        codigoBarras: producto.codigo,
        nombre: producto.nombre,
        cantidadEmpaques: cantidadEmpaques ?? 1,
      })
    })

    const totalDeclarado = Number(
      textoOrden.match(/TOTAL\s+DE\s+ITEMS\s*:\s*(\d+)/)?.[1] ?? 0,
    )
    const advertencias: string[] = []

    if (!fechaEntrega) advertencias.push("No se reconoció la fecha de entrega.")
    if (!bodegaTexto) advertencias.push("No se reconoció el almacén de destino.")
    if (productos.length === 0) advertencias.push("No se reconocieron productos.")
    if (totalDeclarado > 0 && totalDeclarado !== productos.length) {
      advertencias.push(
        `El documento indica ${totalDeclarado} ítems, pero se reconocieron ${productos.length}.`,
      )
    }

    return {
      numeroPedido: limpiarNumero(marcador.texto),
      bodegaTexto,
      fechaEntrega,
      productos,
      advertencias,
    }
  })
}

export function interpretarPedidosRosadoTsv(
  tsv: string,
  anchoPagina: number,
  pagina = 1,
) {
  return interpretarPedidosRosadoOcr(
    palabrasDesdeTsv(tsv, pagina, anchoPagina),
  )
}

async function extraerTextoPdf(archivo: File) {
  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecciona un archivo PDF.")
  }

  const pdfjs = await import("pdfjs-dist")
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await archivo.arrayBuffer()),
  }).promise
  const paginas: string[] = []

  for (let numero = 1; numero <= pdf.numPages; numero += 1) {
    const pagina = await pdf.getPage(numero)
    const contenido = await pagina.getTextContent()
    const filas = new Map<number, { x: number; texto: string }[]>()

    contenido.items.forEach((item) => {
      if (!("str" in item) || !item.str.trim()) return
      const y = Math.round(item.transform[5] / 3) * 3
      const fila = filas.get(y) ?? []
      fila.push({ x: item.transform[4], texto: item.str })
      filas.set(y, fila)
    })

    paginas.push(
      Array.from(filas.entries())
        .sort(([yA], [yB]) => yB - yA)
        .map(([, fila]) =>
          fila.sort((a, b) => a.x - b.x).map((item) => item.texto).join(" "),
        )
        .join("\n"),
    )
  }

  return paginas.join("\n")
}

function palabrasDesdeTsv(tsv: string, pagina: number, anchoPagina: number) {
  return tsv
    .split("\n")
    .slice(1)
    .map((fila) => fila.split("\t"))
    .filter((columnas) => columnas.length >= 12 && columnas[0] === "5")
    .map<PalabraOcr>((columnas) => ({
      pagina,
      bloque: Number(columnas[2]),
      parrafo: Number(columnas[3]),
      linea: Number(columnas[4]),
      izquierda: Number(columnas[6]),
      arriba: Number(columnas[7]),
      anchoPagina,
      texto: columnas.slice(11).join("\t").trim(),
    }))
    .filter((palabra) => palabra.texto.length > 0)
}

function agruparLineas(palabras: PalabraOcr[]) {
  const grupos = new Map<string, PalabraOcr[]>()

  palabras.forEach((palabra) => {
    const clave = `${palabra.pagina}-${palabra.bloque}-${palabra.parrafo}-${palabra.linea}`
    const grupo = grupos.get(clave) ?? []
    grupo.push(palabra)
    grupos.set(clave, grupo)
  })

  return Array.from(grupos.values())
    .map<LineaOcr>((grupo) => {
      const ordenadas = grupo.sort((a, b) => a.izquierda - b.izquierda)
      return {
        pagina: ordenadas[0].pagina,
        arriba: Math.min(...ordenadas.map((palabra) => palabra.arriba)),
        palabras: ordenadas,
        texto: ordenadas.map((palabra) => palabra.texto).join(" "),
      }
    })
    .sort((a, b) => a.pagina - b.pagina || a.arriba - b.arriba)
}

function extraerBodegaRosado(lineas: LineaOcr[]) {
  const indiceInicio = lineas.findIndex((linea) => /PEDIDOS\s+POR/.test(normalizarSimple(linea.texto)))
  const indiceFin = lineas.findIndex((linea, indice) =>
    indice > indiceInicio && /ITEN|ITEM/.test(normalizarSimple(linea.texto)),
  )

  if (indiceInicio < 0 || indiceFin < 0) return ""

  const palabras = lineas
    .slice(indiceInicio, indiceFin)
    .flatMap((linea) => linea.palabras)
    .filter((palabra) => {
      const proporcion = palabra.izquierda / palabra.anchoPagina
      return proporcion >= 0.25 && proporcion <= 0.43
    })
    .map((palabra) => normalizarSimple(palabra.texto))
    .filter((texto) =>
      texto &&
      !["ALMACEN", "DESTINO", "PEDIDO", "PEDIDOS", "POR"].includes(texto) &&
      !/^\d+$/.test(texto),
    )

  return palabras.join(" ").trim()
}

function interpretarCantidadRosado(valor: string) {
  const limpio = valor.replace(/[^\d.,]/g, "")
  const decimal = limpio.match(/^(\d+)[.,](\d{2})$/)
  if (decimal) return Number(decimal[1])
  if (/^\d00$/.test(limpio)) return Number(limpio[0])
  if (/^\d+$/.test(limpio)) {
    const numero = Number(limpio)
    return numero > 0 && numero < 100 ? numero : null
  }
  return null
}

function fechaIso(valor: string) {
  const coincidencia = valor.match(/(\d{2})[./-](\d{2})[./-](\d{4})/)
  return coincidencia
    ? `${coincidencia[3]}-${coincidencia[2]}-${coincidencia[1]}`
    : ""
}

function limpiarNumero(valor: string) {
  return valor.replace(/\D/g, "")
}

function normalizarTexto(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
}

function normalizarSimple(valor: string) {
  return normalizarTexto(valor).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}
