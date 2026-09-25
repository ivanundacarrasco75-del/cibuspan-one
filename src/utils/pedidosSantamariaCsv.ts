export type LineaPedidoSantamariaCsv = {
  codigoBarras: string
  nombre: string
  cantidadEmpaques: number
  unidadManejoArchivo: number
  totalUnidades: number
}

export type PedidoSantamariaCsv = {
  numeroPedido: string
  unidadNegocio: string
  fechaElaboracion: string
  fechaEntrega: string
  productos: LineaPedidoSantamariaCsv[]
}

function dividirCsv(linea: string) {
  const celdas: string[] = []
  let celda = ""
  let entreComillas = false

  for (let indice = 0; indice < linea.length; indice += 1) {
    const caracter = linea[indice]

    if (caracter === '"') {
      if (entreComillas && linea[indice + 1] === '"') {
        celda += '"'
        indice += 1
      } else {
        entreComillas = !entreComillas
      }
    } else if (caracter === "," && !entreComillas) {
      celdas.push(celda.trim())
      celda = ""
    } else {
      celda += caracter
    }
  }

  celdas.push(celda.trim())
  return celdas
}

function numeroCsv(valor: string) {
  const numero = Number(valor.replace(/\s+/g, ""))
  return Number.isFinite(numero) ? numero : 0
}

function fechaIso(valor: string) {
  const coincidencia = valor.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)

  if (!coincidencia) return ""

  const [, dia, mes, anio] = coincidencia
  return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`
}

export function extraerPedidosSantamariaCsv(texto: string) {
  const lineas = texto
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")

  const pedidos: PedidoSantamariaCsv[] = []
  let pedidoActual: PedidoSantamariaCsv | null = null
  let columnas: Record<string, number> | null = null

  const cerrarPedido = () => {
    if (pedidoActual?.numeroPedido || pedidoActual?.productos.length) {
      pedidos.push(pedidoActual)
    }

    pedidoActual = null
    columnas = null
  }

  lineas.forEach((lineaOriginal) => {
    const linea = lineaOriginal.trim()

    if (linea.startsWith("Unidad de Negocio:")) {
      cerrarPedido()
      pedidoActual = {
        numeroPedido: "",
        unidadNegocio: linea.split(":").slice(1).join(":").trim(),
        fechaElaboracion: "",
        fechaEntrega: "",
        productos: [],
      }
      return
    }

    if (!pedidoActual) return

    if (linea.startsWith("Nro. Orden:")) {
      pedidoActual.numeroPedido = linea.split(":").slice(1).join(":").trim()
      return
    }

    if (linea.startsWith("Elaborado:")) {
      pedidoActual.fechaElaboracion = fechaIso(
        linea.split(":").slice(1).join(":").trim(),
      )
      return
    }

    if (linea.startsWith("Fecha de Cancelacion:")) {
      pedidoActual.fechaEntrega = fechaIso(
        linea.split(":").slice(1).join(":").trim(),
      )
      return
    }

    if (linea.startsWith("No.,Codigo Barras Ref")) {
      columnas = dividirCsv(linea).reduce<Record<string, number>>(
        (resultado, nombre, indice) => {
          resultado[nombre] = indice
          return resultado
        },
        {},
      )
      return
    }

    if (!columnas || linea === "." || linea === ",") return

    const celdas = dividirCsv(linea)
    const numeroLinea = celdas[columnas["No."]]?.trim() ?? ""

    if (!/^\d+$/.test(numeroLinea)) return

    const codigoBarras = celdas[columnas["Codigo Barras Ref"]]?.trim() ?? ""
    const nombre = celdas[columnas.Item]?.trim() ?? ""
    const cantidadEmpaques = numeroCsv(celdas[columnas.Cantidad] ?? "")
    const unidadManejoArchivo = numeroCsv(celdas[columnas["U. Embalaje"]] ?? "")
    const totalUnidades = numeroCsv(celdas[columnas["Total Unidades"]] ?? "")

    if (!codigoBarras || totalUnidades <= 0) return

    pedidoActual.productos.push({
      codigoBarras,
      nombre,
      cantidadEmpaques,
      unidadManejoArchivo,
      totalUnidades,
    })
  })

  cerrarPedido()
  return pedidos
}
