import { supabase } from "../lib/supabase"

export type ReservaListadoDb = {
  id: string
  pedido_id: string
  estado: "ACTIVA" | "LIBERADA" | "DESPACHADA"
  creado_en: string
}

export type DetalleReservaDb = {
  id: string
  unidades: number
  pedido_detalle_id: string
  inventario_lote_id: string
  pedido_detalle: {
    producto: {
      codigo: string
      nombre: string
      corto: string
    } | null
    unidades_manejo: number
    total_unidades: number
  } | null
  inventario_lote: {
    lote: string
    fecha_produccion: string
    fecha_vencimiento: string
    cantidad: number
  } | null
}

export async function reservarPedidoFefoDb(
  pedidoId: string,
) {
  if (!pedidoId) {
    throw new Error(
      "Selecciona un pedido.",
    )
  }

  const { data, error } = await supabase.rpc(
    "reservar_pedido_fefo",
    {
      p_pedido_id: pedidoId,
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo reservar el pedido por FEFO.",
    )
  }

  return data as string
}

export async function liberarReservaFefoDb(
  reservaId: string,
) {
  if (!reservaId) {
    throw new Error(
      "No se encontró la reserva.",
    )
  }

  const { error } = await supabase.rpc(
    "liberar_reserva_fefo",
    {
      p_reserva_id: reservaId,
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo liberar la reserva.",
    )
  }
}

export async function obtenerReservaActivaPedidoDb(
  pedidoId: string,
) {
  const { data, error } = await supabase
    .from("reservas_inventario")
    .select(
      `
      id,
      pedido_id,
      estado,
      creado_en
      `,
    )
    .eq("pedido_id", pedidoId)
    .eq("estado", "ACTIVA")
    .maybeSingle()

  if (error) {
    throw new Error(
      `No se pudo cargar la reserva: ${error.message}`,
    )
  }

  return data as ReservaListadoDb | null
}

export async function obtenerDetallesReservaDb(
  reservaId: string,
) {
  if (!reservaId) return []

  const { data, error } = await supabase
    .from("reserva_detalles")
    .select(
      `
      id,
      unidades,
      pedido_detalle_id,
      inventario_lote_id,
      pedido_detalle:pedido_detalles(
        unidades_manejo,
        total_unidades,
        producto:productos(
          codigo,
          nombre,
          corto
        )
      ),
      inventario_lote:inventario_lotes(
        lote,
        fecha_produccion,
        fecha_vencimiento,
        cantidad
      )
      `,
    )
    .eq("reserva_id", reservaId)

  if (error) {
    throw new Error(
      `No se pudieron cargar los detalles de la reserva: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as DetalleReservaDb[]
}