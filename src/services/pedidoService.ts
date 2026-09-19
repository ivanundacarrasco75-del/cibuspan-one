export type EstadoPedido =
  | "INGRESADO"
  | "PLANIFICADO"
  | "EN PRODUCCION"
  | "LISTO PARA DESPACHO"
  | "DESPACHADO"
  | "ENTREGADO"
  | "CANCELADO"

export type EstadoDetalle =
  | "PENDIENTE"
  | "PARCIAL"
  | "LISTO"
  | "DESPACHADO"
  | "CANCELADO"

export type DetallePedido = {
  codigo: string
  nombre: string
  corto: string
  unidadesManejo: number
  cantidadManejo: number
  totalUnidades: number
  unidadesDespachadas: number
  estado: EstadoDetalle
  lotesDespachados: {
    lote: string
    unidades: number
  }[]
}

export type Pedido = {
  id: string
  numero: number
  fechaIngreso: string
  fechaEntrega: string
  horaEntrega: string
  prioridad: string
  contactoRecepcion: string
  observaciones: string
  clienteId: number
  cliente: string
  bodegaId: number
  bodega: string
  tipoEmpaque: string
  productos: DetallePedido[]
  totalUnidades: number
  estado: EstadoPedido
}

const CLAVE_PEDIDOS = "cibuspan-pedidos"
const CLAVE_SECUENCIA = "cibuspan-secuencia-pedidos"

export function obtenerPedidos(): Pedido[] {
  return JSON.parse(
    localStorage.getItem(CLAVE_PEDIDOS) ?? "[]",
  )
}

function obtenerSiguienteNumero() {
  const numeroActual = Number(
    localStorage.getItem(CLAVE_SECUENCIA) ?? "0",
  )

  const siguienteNumero = numeroActual + 1

  localStorage.setItem(
    CLAVE_SECUENCIA,
    String(siguienteNumero),
  )

  return siguienteNumero
}

function formarNumeroPedido(numero: number) {
  return `PED-${String(numero).padStart(6, "0")}`
}

export function guardarPedido(
  datos: Omit<
    Pedido,
    "id" | "numero" | "fechaIngreso" | "estado"
  >,
) {
  const numero = obtenerSiguienteNumero()

  const nuevoPedido: Pedido = {
    ...datos,
    id: formarNumeroPedido(numero),
    numero,
    fechaIngreso: new Date().toISOString(),
    estado: "INGRESADO",
    productos: datos.productos.map((producto) => ({
      ...producto,
      unidadesDespachadas: 0,
      estado: "PENDIENTE",
      lotesDespachados: [],
    })),
  }

  const pedidos = obtenerPedidos()

  localStorage.setItem(
    CLAVE_PEDIDOS,
    JSON.stringify([...pedidos, nuevoPedido]),
  )

  return nuevoPedido
}

export function actualizarEstadoPedido(
  pedidoId: string,
  estado: EstadoPedido,
) {
  const pedidos = obtenerPedidos()

  const actualizados = pedidos.map((pedido) =>
    pedido.id === pedidoId
      ? { ...pedido, estado }
      : pedido,
  )

  localStorage.setItem(
    CLAVE_PEDIDOS,
    JSON.stringify(actualizados),
  )
}

export function cancelarPedido(pedidoId: string) {
  const pedidos = obtenerPedidos()

  const actualizados = pedidos.map((pedido) =>
    pedido.id === pedidoId
      ? {
          ...pedido,
          estado: "CANCELADO" as EstadoPedido,
          productos: pedido.productos.map((producto) => ({
            ...producto,
            estado: "CANCELADO" as EstadoDetalle,
          })),
        }
      : pedido,
  )

  localStorage.setItem(
    CLAVE_PEDIDOS,
    JSON.stringify(actualizados),
  )
}