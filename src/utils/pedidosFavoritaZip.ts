import { unzip, strFromU8, type Unzipped } from "fflate"

export type PedidoFavoritaListado = {
  numeroPedido: string
  fechaPedido: string
  fechaEntrega: string
  bodegaTexto: string
  productos: {
    codigoBarras: string
    nombre: string
    cantidadEmpaques: number
    unidadManejoArchivo: number
  }[]
  advertencias: string[]
}

function celdasCsv(linea: string) {
  const celdas: string[] = []
  let celda = "", comillas = false
  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i]
    if (caracter === '"') {
      if (comillas && linea[i + 1] === '"') { celda += '"'; i += 1 }
      else comillas = !comillas
    } else if (caracter === "," && !comillas) {
      celdas.push(celda.trim()); celda = ""
    } else celda += caracter
  }
  if (comillas) throw new Error("El TXT de Favorita contiene comillas sin cerrar.")
  celdas.push(celda.trim())
  return celdas
}

function fechaListado(valor: string) {
  if (!/^\d{8}$/.test(valor)) throw new Error(`Fecha de Favorita inválida: ${valor}.`)
  const fecha = `${valor.slice(0, 4)}-${valor.slice(4, 6)}-${valor.slice(6, 8)}`
  const dia = new Date(`${fecha}T12:00:00Z`)
  if (!Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) {
    throw new Error(`Fecha de Favorita inválida: ${valor}.`)
  }
  return fecha
}

export function esListadoFavorita(texto: string) {
  return texto.replace(/^\uFEFF/, "").trimStart().startsWith("No. Mercado,Mercado,Fecha Pedido,")
}

export function interpretarListadoFavorita(texto: string): PedidoFavoritaListado[] {
  const filas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((fila) => fila.trim())
  if (!esListadoFavorita(texto)) throw new Error("No se reconoce el listado TXT de Favorita.")
  const encabezados = celdasCsv(filas[0])
  const requeridas = ["Mercado", "Fecha Pedido", "No. Orden", "Fecha Entrega", "Codigo de Barra", "Descripcion", "Empaque", "Cantidad"]
  for (const columna of requeridas) {
    if (!encabezados.includes(columna)) throw new Error(`Falta la columna ${columna} en Favorita.`)
  }
  const pedidos = new Map<string, PedidoFavoritaListado>()
  for (let i = 1; i < filas.length; i += 1) {
    const celdas = celdasCsv(filas[i])
    if (celdas.length !== encabezados.length) throw new Error(`Favorita: fila ${i + 1} incompleta.`)
    const valor = (nombre: string) => celdas[encabezados.indexOf(nombre)]
    const numeroPedido = valor("No. Orden")
    if (!/^\d+$/.test(numeroPedido)) throw new Error(`Favorita: orden inválida en fila ${i + 1}.`)
    // La exportación antepone tres ceros al EAN de 13 dígitos.
    const codigoBarras = valor("Codigo de Barra").replace(/^0+(?=\d{13}$)/, "")
    const cantidadEmpaques = Number(valor("Cantidad"))
    const unidadManejoArchivo = Number(valor("Empaque"))
    if (!/^\d{13}$/.test(codigoBarras) || !Number.isSafeInteger(cantidadEmpaques) || cantidadEmpaques <= 0 ||
      !Number.isSafeInteger(unidadManejoArchivo) || unidadManejoArchivo <= 0 ||
      !Number.isSafeInteger(cantidadEmpaques * unidadManejoArchivo)) {
      throw new Error(`Favorita: código o cantidad inválida en la orden ${numeroPedido}, fila ${i + 1}.`)
    }
    const fechaPedido = fechaListado(valor("Fecha Pedido"))
    const fechaEntrega = fechaListado(valor("Fecha Entrega"))
    const bodegaTexto = valor("Mercado").replace(/^\d+\s*-\s*/, "")
    if (!bodegaTexto) throw new Error(`Favorita: falta el destino en la orden ${numeroPedido}.`)
    let pedido = pedidos.get(numeroPedido)
    if (pedido && (pedido.fechaPedido !== fechaPedido || pedido.fechaEntrega !== fechaEntrega || pedido.bodegaTexto !== bodegaTexto)) {
      throw new Error(`La orden ${numeroPedido} tiene fechas o destinos diferentes.`)
    }
    if (!pedido) {
      pedido = { numeroPedido, fechaPedido, fechaEntrega, bodegaTexto, productos: [], advertencias: [] }
      pedidos.set(numeroPedido, pedido)
    }
    if (pedido.productos.some((producto) => producto.codigoBarras === codigoBarras)) {
      throw new Error(`La orden ${numeroPedido} repite el código ${codigoBarras}; revisa el documento.`)
    }
    pedido.productos.push({ codigoBarras, nombre: valor("Descripcion"), cantidadEmpaques, unidadManejoArchivo })
  }
  if (!pedidos.size) throw new Error("El listado de Favorita no contiene productos.")
  return [...pedidos.values()]
}

export async function leerPedidosFavoritaZip(datos: Uint8Array) {
  if (datos.length > 20 * 1024 * 1024) throw new Error("El ZIP de Favorita supera 20 MB.")
  let archivos = 0, tamano = 0
  const contenido = await new Promise<Unzipped>((resolve, reject) => {
    unzip(datos, {
      filter: (entrada) => {
        if (!/(?:^|\/)F\d+\.txt$/i.test(entrada.name)) return false
        archivos += 1; tamano += entrada.originalSize
        if (archivos > 200 || tamano > 20 * 1024 * 1024) {
          throw new Error("El ZIP de Favorita contiene demasiados datos; divídelo en archivos más pequeños.")
        }
        return true
      },
    }, (error, resultado) => error ? reject(error) : resolve(resultado))
  })
  const pedidos = new Map<string, PedidoFavoritaListado>()
  for (const nombre of Object.keys(contenido).sort()) {
    try {
      for (const pedido of interpretarListadoFavorita(strFromU8(contenido[nombre]))) {
        const anterior = pedidos.get(pedido.numeroPedido)
        if (anterior) {
          const firma = (orden: PedidoFavoritaListado) => JSON.stringify({
            ...orden, productos: [...orden.productos].sort((a, b) => a.codigoBarras.localeCompare(b.codigoBarras)),
          })
          if (firma(anterior) !== firma(pedido)) throw new Error(`La orden ${pedido.numeroPedido} aparece con datos diferentes.`)
        } else pedidos.set(pedido.numeroPedido, pedido)
      }
    } catch (err) {
      throw new Error(`${nombre}: ${err instanceof Error ? err.message : "No se pudo leer."}`)
    }
  }
  if (!pedidos.size) throw new Error("El ZIP no contiene listados F…txt de pedidos de Favorita.")
  return [...pedidos.values()].sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega) || a.numeroPedido.localeCompare(b.numeroPedido))
}
