import { supabase } from "../lib/supabase"

export type EstadoPedidoDespacho =
  | "INGRESADO"
  | "PREPARADO"
  | "DESPACHADO"
  | "CANCELADO"

export type PedidoDespachoDb = {
  id: string
  fecha_entrega: string
  hora_entrega: string | null
  prioridad: string
  tipo_empaque: string
  estado: EstadoPedidoDespacho
  total_unidades: number
  creado_en: string
  cliente: {
    id: string
    nombre: string
  } | null
  bodega: {
    id: string
    nombre: string
  } | null
}

export type DetallePedidoDespachoDb = {
  id: string
  producto_id: string
  total_unidades: number
  unidades_manejo: number
  unidades_despachadas: number
  estado: string
  producto: {
    id: string
    codigo: string
    nombre: string
    corto: string
  } | null
}

export type ReservaDespachoDb = {
  id: string
  pedido_id: string
  estado: "ACTIVA" | "LIBERADA" | "DESPACHADA"
  creado_en: string
  numero_factura: string | null
  conciliacion_aplica: boolean
}

export type DetalleReservaDespachoDb = {
  id: string
  unidades: number
  pedido_detalle_id: string
  inventario_lote_id: string
  pedido_detalle: {
    unidades_manejo: number
    total_unidades: number
    producto: {
      codigo: string
      nombre: string
      corto: string
    } | null
  } | null
  inventario_lote: {
    lote: string
    fecha_produccion: string
    fecha_vencimiento: string
    cantidad: number
  } | null
}

export type CantidadDespachoSkuDb = {
  pedidoDetalleId: string
  unidades: number
}

export type DespachoConciliacionDb = {
  reserva_id: string
  pedido_id: string
  numero_pedido_cliente: string | null
  numero_factura: string | null
  conciliacion_aplica: boolean
  fecha: string
  cliente_id: string | null
  cliente_nombre: string
  detalles: {
    pedido_detalle_id: string
    producto_id: string | null
    sku: string
    producto_nombre: string
    unidades: number
  }[]
}

export type AnexoSuperDb = {
  reserva_id: string
  pedido_id: string
  fecha_despacho: string
  cliente: string
  bodega: string
  detalles: {
    codigo: string
    corto: string
    nombre: string
    lote: string
    fechaProduccion: string
    fechaVencimiento: string
    unidades: number
  }[]
}

export async function obtenerPedidosDespachoDb() {
  const { data, error } = await supabase
    .from("pedidos")
    .select(`
      id,
      fecha_entrega,
      hora_entrega,
      prioridad,
      tipo_empaque,
      estado,
      total_unidades,
      creado_en,
      cliente:clientes(id,nombre),
      bodega:bodegas(id,nombre)
    `)
    .in("estado", ["INGRESADO", "PREPARADO", "DESPACHADO"])
    .order("fecha_entrega", { ascending: true })
    .order("creado_en", { ascending: false })

  if (error) {
    throw new Error(`No se pudieron cargar los pedidos: ${error.message}`)
  }

  return (data ?? []) as unknown as PedidoDespachoDb[]
}

export async function obtenerDetallePedidoDespachoDb(pedidoId: string) {
  if (!pedidoId) return []

  const { data, error } = await supabase
    .from("pedido_detalles")
    .select(`
      id,
      producto_id,
      total_unidades,
      unidades_manejo,
      unidades_despachadas,
      estado,
      producto:productos(id,codigo,nombre,corto)
    `)
    .eq("pedido_id", pedidoId)

  if (error) {
    throw new Error(`No se pudo cargar el detalle del pedido: ${error.message}`)
  }

  const detalles = (data ?? []) as unknown as DetallePedidoDespachoDb[]

  return detalles.sort((a, b) =>
    (a.producto?.corto ?? "").localeCompare(b.producto?.corto ?? ""),
  )
}

export async function obtenerReservaActivaDespachoDb(pedidoId: string) {
  if (!pedidoId) return null

  const { data, error } = await supabase
    .from("reservas_inventario")
    .select("id,pedido_id,estado,creado_en,numero_factura,conciliacion_aplica")
    .eq("pedido_id", pedidoId)
    .eq("estado", "ACTIVA")
    .maybeSingle()

  if (error) {
    throw new Error(`No se pudo cargar la reserva: ${error.message}`)
  }

  return data as ReservaDespachoDb | null
}

export async function obtenerReservaDespachadaPedidoDb(
  pedidoId: string,
) {
  if (!pedidoId) return null

  const { data, error } = await supabase
    .from("reservas_inventario")
    .select("id,pedido_id,estado,creado_en,numero_factura,conciliacion_aplica")
    .eq("pedido_id", pedidoId)
    .eq("estado", "DESPACHADA")
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(
      `No se pudo cargar la reserva despachada: ${error.message}`,
    )
  }

  return data as ReservaDespachoDb | null
}

export async function obtenerDetalleReservaDespachoDb(reservaId: string) {
  if (!reservaId) return []

  const { data, error } = await supabase
    .from("reserva_detalles")
    .select(`
      id,
      unidades,
      pedido_detalle_id,
      inventario_lote_id,
      pedido_detalle:pedido_detalles(
        unidades_manejo,
        total_unidades,
        producto:productos(codigo,nombre,corto)
      ),
      inventario_lote:inventario_lotes(
        lote,
        fecha_produccion,
        fecha_vencimiento,
        cantidad
      )
    `)
    .eq("reserva_id", reservaId)

  if (error) {
    throw new Error(`No se pudo cargar el detalle de la reserva: ${error.message}`)
  }

  const detalles = (data ?? []) as unknown as DetalleReservaDespachoDb[]

  return detalles.sort((a, b) => {
    const productoA = a.pedido_detalle?.producto?.corto ?? ""
    const productoB = b.pedido_detalle?.producto?.corto ?? ""
    const comparacionProducto = productoA.localeCompare(productoB)

    if (comparacionProducto !== 0) return comparacionProducto

    return (
      a.inventario_lote?.fecha_vencimiento ?? ""
    ).localeCompare(b.inventario_lote?.fecha_vencimiento ?? "")
  })
}

export async function obtenerAnexosSuperDb() {
  const { data: reservas, error } = await supabase
    .from("reservas_inventario")
    .select(`
      id,
      pedido_id,
      estado,
      creado_en,
      pedido:pedidos(
        id,
        estado,
        cliente:clientes(nombre),
        bodega:bodegas(nombre)
      )
    `)
    .eq("estado", "DESPACHADA")
    .order("creado_en", { ascending: false })

  if (error) {
    throw new Error(`No se pudieron cargar los despachos: ${error.message}`)
  }

  const anexos: AnexoSuperDb[] = []

  for (const reserva of reservas ?? []) {
    const pedido = Array.isArray(reserva.pedido) ? reserva.pedido[0] : reserva.pedido
    const cliente = Array.isArray(pedido?.cliente) ? pedido?.cliente[0] : pedido?.cliente
    const bodega = Array.isArray(pedido?.bodega) ? pedido?.bodega[0] : pedido?.bodega

    if (!cliente?.nombre?.toLowerCase().includes("favorita")) continue

    const detalles = await obtenerDetalleReservaDespachoDb(reserva.id)

    anexos.push({
      reserva_id: reserva.id,
      pedido_id: reserva.pedido_id,
      fecha_despacho: reserva.creado_en,
      cliente: cliente?.nombre ?? "",
      bodega: bodega?.nombre ?? "",
      detalles: detalles.map((detalle) => ({
        codigo: detalle.pedido_detalle?.producto?.codigo ?? "",
        corto: detalle.pedido_detalle?.producto?.corto ?? "",
        nombre: detalle.pedido_detalle?.producto?.nombre ?? "",
        lote: detalle.inventario_lote?.lote ?? "",
        fechaProduccion: detalle.inventario_lote?.fecha_produccion ?? "",
        fechaVencimiento: detalle.inventario_lote?.fecha_vencimiento ?? "",
        unidades: detalle.unidades,
      })),
    })
  }

  return anexos
}

export async function guardarNumeroFacturaDespachoDb(
  reservaId: string,
  numeroFactura: string,
) {
  if (!reservaId) {
    throw new Error("No se encontró el despacho.")
  }

  const { data, error } = await supabase.rpc(
    "vincular_factura_despacho",
    {
      p_reserva_id: reservaId,
      p_numero_factura: numeroFactura.trim(),
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo guardar el número de factura.",
    )
  }

  return String(data ?? "")
}

export async function activarControlConciliacionDespachoDb(
  reservaId: string,
) {
  if (!reservaId) {
    throw new Error("No se encontró el despacho.")
  }

  const { data, error } = await supabase.rpc(
    "activar_control_conciliacion_despacho",
    { p_reserva_id: reservaId },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo activar el control de conciliación para el despacho.",
    )
  }

  return Boolean(data)
}

export async function obtenerDespachosConciliacionDb() {
  const reservas: any[] = []
  const tamanoPagina = 500
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("reservas_inventario")
      .select(`
        id,
        pedido_id,
        numero_factura,
        conciliacion_aplica,
        creado_en,
        pedido:pedidos(
          id,
          numero_pedido_cliente,
          fecha_entrega,
          cliente:clientes(id,nombre)
        )
      `)
      .eq("estado", "DESPACHADA")
      .order("creado_en", { ascending: false })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(
        `No se pudieron cargar los despachos para conciliación: ${error.message}`,
      )
    }

    const pagina = data ?? []
    reservas.push(...pagina)

    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  if (reservas.length === 0) {
    return [] as DespachoConciliacionDb[]
  }

  const detalles: any[] = []
  const ids = reservas.map((reserva) => reserva.id)
  const tamanoLote = 100

  for (let i = 0; i < ids.length; i += tamanoLote) {
    const loteIds = ids.slice(i, i + tamanoLote)
    let detalleInicio = 0

    while (true) {
      const { data, error } = await supabase
        .from("reserva_detalles")
        .select(`
          reserva_id,
          pedido_detalle_id,
          unidades,
          pedido_detalle:pedido_detalles(
            producto_id,
            producto:productos(
              id,
              codigo,
              nombre,
              corto
            )
          )
        `)
        .in("reserva_id", loteIds)
        .range(detalleInicio, detalleInicio + 999)

      if (error) {
        throw new Error(
          `No se pudo cargar el detalle de despachos para conciliación: ${error.message}`,
        )
      }

      const pagina = data ?? []
      detalles.push(...pagina)

      if (pagina.length < 1000) break
      detalleInicio += 1000
    }
  }

  const detallesPorReserva = new Map<
    string,
    DespachoConciliacionDb["detalles"]
  >()

  for (const detalle of detalles) {
    const pedidoDetalle = Array.isArray(detalle.pedido_detalle)
      ? detalle.pedido_detalle[0]
      : detalle.pedido_detalle

    const producto = Array.isArray(pedidoDetalle?.producto)
      ? pedidoDetalle.producto[0]
      : pedidoDetalle?.producto

    const lista =
      detallesPorReserva.get(detalle.reserva_id) ?? []

    lista.push({
      pedido_detalle_id: detalle.pedido_detalle_id,
      producto_id:
        pedidoDetalle?.producto_id ??
        producto?.id ??
        null,
      sku: producto?.codigo ?? "",
      producto_nombre:
        producto?.corto ||
        producto?.nombre ||
        "Producto no identificado",
      unidades: Number(detalle.unidades ?? 0),
    })

    detallesPorReserva.set(detalle.reserva_id, lista)
  }

  return reservas.map((reserva) => {
    const pedido = Array.isArray(reserva.pedido)
      ? reserva.pedido[0]
      : reserva.pedido

    const cliente = Array.isArray(pedido?.cliente)
      ? pedido.cliente[0]
      : pedido?.cliente

    return {
      reserva_id: reserva.id,
      pedido_id: reserva.pedido_id,
      numero_pedido_cliente:
        pedido?.numero_pedido_cliente ?? null,
      numero_factura: reserva.numero_factura,
      conciliacion_aplica:
        Boolean(reserva.conciliacion_aplica),
      fecha:
        pedido?.fecha_entrega ??
        String(reserva.creado_en ?? "").slice(0, 10),
      cliente_id: cliente?.id ?? null,
      cliente_nombre:
        cliente?.nombre ?? "Cliente no identificado",
      detalles:
        detallesPorReserva.get(reserva.id) ?? [],
    } as DespachoConciliacionDb
  })
}

export async function prepararPedidoDespachoDb(
  pedidoId: string,
  cantidades: CantidadDespachoSkuDb[],
) {
  if (!pedidoId) throw new Error("Selecciona un pedido.")

  if (!cantidades.length) {
    throw new Error(
      "No existen cantidades para preparar el pedido.",
    )
  }

  const { data, error } = await supabase.rpc(
    "reservar_pedido_fefo_parcial",
    {
      p_pedido_id: pedidoId,
      p_cantidades: cantidades.map(
        (cantidad) => ({
          pedido_detalle_id:
            cantidad.pedidoDetalleId,
          unidades: cantidad.unidades,
        }),
      ),
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo preparar el pedido.",
    )
  }

  return data as string
}

export async function liberarReservaDespachoDb(reservaId: string) {
  if (!reservaId) throw new Error("No se encontró la reserva.")

  const { error } = await supabase.rpc("liberar_reserva_fefo", {
    p_reserva_id: reservaId,
  })

  if (error) throw new Error(error.message || "No se pudo liberar la reserva.")
}

export async function confirmarDespachoDb(
  reservaId: string,
  cantidades: CantidadDespachoSkuDb[],
) {
  if (!reservaId) {
    throw new Error("No se encontró la reserva.")
  }

  if (!cantidades.length) {
    throw new Error(
      "No existen cantidades para confirmar el despacho.",
    )
  }

  const { data, error } = await supabase.rpc(
    "confirmar_despacho_parcial_fefo",
    {
      p_reserva_id: reservaId,
      p_cantidades: cantidades.map(
        (cantidad) => ({
          pedido_detalle_id:
            cantidad.pedidoDetalleId,
          unidades: cantidad.unidades,
        }),
      ),
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo confirmar el despacho.",
    )
  }

  return data as string
}
