import { obtenerPedidos } from "./pedidoService"

type RegistroInventario = {
  id: string
  codigo: string
  lote: string
  fechaProduccion: string
  fechaVencimiento: string
  cantidad: number
}

export function obtenerInventario(): RegistroInventario[] {
  return JSON.parse(
    localStorage.getItem("cibuspan-inventario") ?? "[]",
  )
}

export function stockFisicoPorSku(codigo: string) {
  return obtenerInventario()
    .filter(
      (registro) => registro.codigo === codigo,
    )
    .reduce(
      (total, registro) =>
        total + registro.cantidad,
      0,
    )
}

export function stockComprometidoPorSku(
  codigo: string,
  fechaEntregaExcluida?: string,
) {
  return obtenerPedidos()
    .filter(
      (pedido) =>
        pedido.estado !== "DESPACHADO" &&
        pedido.estado !== "CANCELADO" &&
        pedido.fechaEntrega !== fechaEntregaExcluida,
    )
    .reduce((totalPedidos, pedido) => {
      const unidadesComprometidas =
        pedido.productos
          .filter(
            (producto) =>
              producto.codigo === codigo,
          )
          .reduce(
            (totalProductos, producto) =>
              totalProductos +
              Math.max(
                0,
                producto.totalUnidades -
                  producto.unidadesDespachadas,
              ),
            0,
          )

      return (
        totalPedidos + unidadesComprometidas
      )
    }, 0)
}

export function stockDisponiblePorSku(
  codigo: string,
  fechaEntregaExcluida?: string,
) {
  const stockFisico =
    stockFisicoPorSku(codigo)

  const stockComprometido =
    stockComprometidoPorSku(
      codigo,
      fechaEntregaExcluida,
    )

  return Math.max(
    0,
    stockFisico - stockComprometido,
  )
}

// Se mantiene para evitar errores en archivos antiguos.
export function stockPorSku(codigo: string) {
  return stockFisicoPorSku(codigo)
}