import {
  obtenerPedidos,
  type EstadoDetalle,
  type EstadoPedido,
  type Pedido,
} from "./pedidoService"

type RegistroInventario = {
  id: string
  codigo: string
  lote: string
  fechaProduccion: string
  fechaVencimiento: string
  cantidad: number
}

export type DetalleReserva = {
  codigo: string
  corto: string
  lote: string
  inventarioId: string
  fechaProduccion: string
  fechaVencimiento: string
  unidadesManejo: number
  disponibleFisico: number
  disponibleDespachable: number
  saldoNoDespachable: number
  unidades: number
}

export type ReservaInventario = {
  id: string
  pedidoId: string
  fechaCreacion: string
  estado: "ACTIVA" | "LIBERADA" | "DESPACHADA"
  detalles: DetalleReserva[]
}

export type ResumenReservaSku = {
  codigo: string
  corto: string
  unidadesManejo: number
  solicitado: number
  reservado: number
  faltante: number
}

const CLAVE_INVENTARIO = "cibuspan-inventario"
const CLAVE_RESERVAS = "cibuspan-reservas"
const CLAVE_PEDIDOS = "cibuspan-pedidos"
const CLAVE_DESPACHOS = "cibuspan-despachos"

export function obtenerInventario(): RegistroInventario[] {
  return JSON.parse(
    localStorage.getItem(CLAVE_INVENTARIO) ?? "[]",
  )
}

export function obtenerReservas(): ReservaInventario[] {
  return JSON.parse(
    localStorage.getItem(CLAVE_RESERVAS) ?? "[]",
  )
}

function guardarReservas(
  reservas: ReservaInventario[],
) {
  localStorage.setItem(
    CLAVE_RESERVAS,
    JSON.stringify(reservas),
  )
}

function unidadesReservadasPorInventario(
  inventarioId: string,
) {
  return obtenerReservas()
    .filter(
      (reserva) => reserva.estado === "ACTIVA",
    )
    .flatMap((reserva) => reserva.detalles)
    .filter(
      (detalle) =>
        detalle.inventarioId === inventarioId,
    )
    .reduce(
      (total, detalle) =>
        total + detalle.unidades,
      0,
    )
}

export function stockDisponibleLote(
  inventarioId: string,
) {
  const registro = obtenerInventario().find(
    (item) => item.id === inventarioId,
  )

  if (!registro) return 0

  const reservado =
    unidadesReservadasPorInventario(inventarioId)

  return Math.max(
    0,
    registro.cantidad - reservado,
  )
}

export function calcularStockDespachable(
  stockDisponible: number,
  unidadesManejo: number,
) {
  if (unidadesManejo <= 0) return 0

  return (
    Math.floor(
      stockDisponible / unidadesManejo,
    ) * unidadesManejo
  )
}

export function obtenerLotesFefo(
  codigo: string,
  unidadesManejo = 1,
) {
  return obtenerInventario()
    .filter(
      (registro) => registro.codigo === codigo,
    )
    .map((registro) => {
      const disponibleFisico =
        stockDisponibleLote(registro.id)

      const disponibleDespachable =
        calcularStockDespachable(
          disponibleFisico,
          unidadesManejo,
        )

      return {
        ...registro,
        disponibleFisico,
        disponibleDespachable,
        saldoNoDespachable:
          disponibleFisico -
          disponibleDespachable,
      }
    })
    .filter(
      (registro) =>
        registro.disponibleDespachable > 0,
    )
    .sort((a, b) => {
      const comparacionVencimiento =
        a.fechaVencimiento.localeCompare(
          b.fechaVencimiento,
        )

      if (comparacionVencimiento !== 0) {
        return comparacionVencimiento
      }

      return a.fechaProduccion.localeCompare(
        b.fechaProduccion,
      )
    })
}

export function crearReservaPedido(
  pedidoId: string,
) {
  const pedidos = obtenerPedidos()

  const pedido = pedidos.find(
    (item) => item.id === pedidoId,
  )

  if (!pedido) {
    throw new Error(
      "No se encontró el pedido.",
    )
  }

  if (
    pedido.estado === "DESPACHADO" ||
    pedido.estado === "CANCELADO"
  ) {
    throw new Error(
      "Este pedido no puede reservar inventario.",
    )
  }

  const reservaExistente =
    obtenerReservas().find(
      (reserva) =>
        reserva.pedidoId === pedidoId &&
        reserva.estado === "ACTIVA",
    )

  if (reservaExistente) {
    throw new Error(
      "El pedido ya tiene una reserva activa.",
    )
  }

  const detallesReserva: DetalleReserva[] = []

  pedido.productos.forEach((producto) => {
    const unidadesManejo =
      producto.unidadesManejo

    if (
      !unidadesManejo ||
      unidadesManejo <= 0
    ) {
      throw new Error(
        `La unidad de manejo de ${producto.corto} no es válida.`,
      )
    }

    const pendiente =
      producto.totalUnidades -
      producto.unidadesDespachadas

    if (
      pendiente % unidadesManejo !== 0
    ) {
      throw new Error(
        `${producto.corto}: la cantidad pendiente (${pendiente}) no es múltiplo de la unidad de manejo (${unidadesManejo}).`,
      )
    }

    let unidadesPorReservar = pendiente

    const lotes = obtenerLotesFefo(
      producto.codigo,
      unidadesManejo,
    )

    for (const lote of lotes) {
      if (unidadesPorReservar <= 0) break

      const cantidadNecesaria =
        Math.min(
          unidadesPorReservar,
          lote.disponibleDespachable,
        )

      const unidadesAsignadas =
        calcularStockDespachable(
          cantidadNecesaria,
          unidadesManejo,
        )

      if (unidadesAsignadas <= 0) {
        continue
      }

      detallesReserva.push({
        codigo: producto.codigo,
        corto: producto.corto,
        lote: lote.lote,
        inventarioId: lote.id,
        fechaProduccion:
          lote.fechaProduccion,
        fechaVencimiento:
          lote.fechaVencimiento,
        unidadesManejo,
        disponibleFisico:
          lote.disponibleFisico,
        disponibleDespachable:
          lote.disponibleDespachable,
        saldoNoDespachable:
          lote.saldoNoDespachable,
        unidades: unidadesAsignadas,
      })

      unidadesPorReservar -=
        unidadesAsignadas
    }

    if (unidadesPorReservar > 0) {
      const unidadesManejoFaltantes = Math.ceil(
        unidadesPorReservar /
          unidadesManejo,
      )

      throw new Error(
        `${producto.corto}: faltan ${unidadesPorReservar} unidades despachables, equivalentes a ${unidadesManejoFaltantes} unidades de manejo completas.`,
      )
    }
  })

  const nuevaReserva: ReservaInventario = {
    id: `RES-${Date.now()}`,
    pedidoId,
    fechaCreacion:
      new Date().toISOString(),
    estado: "ACTIVA",
    detalles: detallesReserva,
  }

  guardarReservas([
    ...obtenerReservas(),
    nuevaReserva,
  ])

  actualizarPedidoReservado(pedidoId)

  return nuevaReserva
}

function actualizarPedidoReservado(
  pedidoId: string,
) {
  const pedidos = obtenerPedidos()

  const actualizados: Pedido[] =
    pedidos.map((pedido) =>
      pedido.id === pedidoId
        ? {
            ...pedido,
            estado:
              "LISTO PARA DESPACHO" as EstadoPedido,
            productos:
              pedido.productos.map(
                (producto) => ({
                  ...producto,
                  estado:
                    "LISTO" as EstadoDetalle,
                }),
              ),
          }
        : pedido,
    )

  localStorage.setItem(
    CLAVE_PEDIDOS,
    JSON.stringify(actualizados),
  )
}

export function obtenerResumenReserva(
  pedidoId: string,
): ResumenReservaSku[] {
  const pedido = obtenerPedidos().find(
    (item) => item.id === pedidoId,
  )

  if (!pedido) return []

  const reserva = obtenerReservas().find(
    (item) =>
      item.pedidoId === pedidoId &&
      item.estado === "ACTIVA",
  )

  return pedido.productos.map(
    (producto) => {
      const solicitado =
        producto.totalUnidades -
        producto.unidadesDespachadas

      const reservado =
        reserva?.detalles
          .filter(
            (detalle) =>
              detalle.codigo ===
              producto.codigo,
          )
          .reduce(
            (total, detalle) =>
              total + detalle.unidades,
            0,
          ) ?? 0

      return {
        codigo: producto.codigo,
        corto: producto.corto,
        unidadesManejo:
          producto.unidadesManejo,
        solicitado,
        reservado,
        faltante: Math.max(
          0,
          solicitado - reservado,
        ),
      }
    },
  )
}

export function liberarReserva(
  reservaId: string,
) {
  const reservas = obtenerReservas()

  const reserva = reservas.find(
    (item) => item.id === reservaId,
  )

  if (!reserva) {
    throw new Error(
      "No se encontró la reserva.",
    )
  }

  const actualizadas = reservas.map(
    (item) =>
      item.id === reservaId
        ? {
            ...item,
            estado: "LIBERADA" as const,
          }
        : item,
  )

  guardarReservas(actualizadas)

  const pedidos = obtenerPedidos()

  const pedidosActualizados: Pedido[] =
    pedidos.map((pedido) =>
      pedido.id === reserva.pedidoId
        ? {
            ...pedido,
            estado:
              "INGRESADO" as EstadoPedido,
            productos:
              pedido.productos.map(
                (producto) => ({
                  ...producto,
                  estado:
                    "PENDIENTE" as EstadoDetalle,
                }),
              ),
          }
        : pedido,
    )

  localStorage.setItem(
    CLAVE_PEDIDOS,
    JSON.stringify(pedidosActualizados),
  )
}

export function confirmarDespacho(
  reservaId: string,
) {
  const reservas = obtenerReservas()

  const reserva = reservas.find(
    (item) => item.id === reservaId,
  )

  if (!reserva) {
    throw new Error(
      "No se encontró la reserva.",
    )
  }

  if (reserva.estado !== "ACTIVA") {
    throw new Error(
      "La reserva ya fue liberada o despachada.",
    )
  }

  const inventario = obtenerInventario()

  const inventarioActualizado =
    inventario.map((registro) => {
      const unidadesDespachadas =
        reserva.detalles
          .filter(
            (detalle) =>
              detalle.inventarioId ===
              registro.id,
          )
          .reduce(
            (total, detalle) =>
              total + detalle.unidades,
            0,
          )

      const nuevaCantidad =
        registro.cantidad -
        unidadesDespachadas

      if (nuevaCantidad < 0) {
        throw new Error(
          `El lote ${registro.lote} no tiene stock suficiente.`,
        )
      }

      return {
        ...registro,
        cantidad: nuevaCantidad,
      }
    })

  localStorage.setItem(
    CLAVE_INVENTARIO,
    JSON.stringify(
      inventarioActualizado.filter(
        (registro) =>
          registro.cantidad > 0,
      ),
    ),
  )

  const pedidos = obtenerPedidos()

  const pedidosActualizados: Pedido[] =
    pedidos.map((pedido) => {
      if (
        pedido.id !== reserva.pedidoId
      ) {
        return pedido
      }

      const productosActualizados =
        pedido.productos.map(
          (producto) => {
            const detallesProducto =
              reserva.detalles.filter(
                (detalle) =>
                  detalle.codigo ===
                  producto.codigo,
              )

            const unidadesDespachadas =
              detallesProducto.reduce(
                (total, detalle) =>
                  total + detalle.unidades,
                0,
              )

            const nuevoTotalDespachado =
              producto.unidadesDespachadas +
              unidadesDespachadas

            const estaCompleto =
              nuevoTotalDespachado >=
              producto.totalUnidades

            return {
              ...producto,
              unidadesDespachadas:
                nuevoTotalDespachado,
              estado: estaCompleto
                ? ("DESPACHADO" as EstadoDetalle)
                : ("PARCIAL" as EstadoDetalle),
              lotesDespachados: [
                ...producto.lotesDespachados,
                ...detallesProducto.map(
                  (detalle) => ({
                    lote: detalle.lote,
                    unidades:
                      detalle.unidades,
                  }),
                ),
              ],
            }
          },
        )

      const pedidoCompleto =
        productosActualizados.every(
          (producto) =>
            producto.estado ===
            "DESPACHADO",
        )

      return {
        ...pedido,
        estado: pedidoCompleto
          ? ("DESPACHADO" as EstadoPedido)
          : ("LISTO PARA DESPACHO" as EstadoPedido),
        productos:
          productosActualizados,
      }
    })

  localStorage.setItem(
    CLAVE_PEDIDOS,
    JSON.stringify(pedidosActualizados),
  )

  guardarReservas(
    reservas.map((item) =>
      item.id === reservaId
        ? {
            ...item,
            estado:
              "DESPACHADA" as const,
          }
        : item,
    ),
  )

  const despachos = JSON.parse(
    localStorage.getItem(
      CLAVE_DESPACHOS,
    ) ?? "[]",
  )

  localStorage.setItem(
    CLAVE_DESPACHOS,
    JSON.stringify([
      ...despachos,
      {
        id: `DES-${Date.now()}`,
        pedidoId: reserva.pedidoId,
        reservaId,
        fechaDespacho:
          new Date().toISOString(),
        detalles: reserva.detalles,
      },
    ]),
  )
}