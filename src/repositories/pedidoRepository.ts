import { supabase } from "../lib/supabase"
import { crearControlRegistroPedido, type NuevoPedidoDb, type SolicitudPedidoPendiente } from "../utils/registroPedidoSeguro"
export type { NuevoPedidoDb, DetalleNuevoPedido } from "../utils/registroPedidoSeguro"

export type ClientePedidoDb = {
  id: string
  nombre: string
}

export type BodegaPedidoDb = {
  id: string
  cliente_id: string
  nombre: string
  tipo_empaque: string
}

export type ProductoPedidoDb = {
  id: string
  codigo: string
  nombre: string
  corto: string
  unidad_manejo: number
  precio: number | null
}

export type PedidoListadoDb = {
  id: string
  numero_pedido_cliente: string
  fecha_entrega: string
  hora_entrega: string | null
  prioridad: string
  tipo_empaque: string
  estado: string
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

export type PedidoActivoMismaFechaDb = {
  id: string
  numero_pedido_cliente: string
  fecha_entrega: string
  estado: string
  total_unidades: number
  creado_en: string
}

export type DetallePedidoConsultaDb = {
  id: string
  orden: number
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

export async function obtenerClientesPedidoDb() {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre")

  if (error) {
    throw new Error(
      `No se pudieron cargar los clientes: ${error.message}`,
    )
  }

  return (data ?? []) as ClientePedidoDb[]
}

export async function obtenerBodegasClienteDb(
  clienteId: string,
) {
  if (!clienteId) return []

  const { data, error } = await supabase
    .from("bodegas")
    .select(
      "id, cliente_id, nombre, tipo_empaque",
    )
    .eq("cliente_id", clienteId)
    .eq("activo", true)
    .order("nombre")

  if (error) {
    throw new Error(
      `No se pudieron cargar las bodegas: ${error.message}`,
    )
  }

  return (data ?? []) as BodegaPedidoDb[]
}

export async function obtenerProductosClienteDb(
  clienteId: string,
) {
  if (!clienteId) return []

  const { data, error } = await supabase
    .from("cliente_productos")
    .select(`
      unidad_manejo,
      precio,
      producto:productos!inner(
        id,
        codigo,
        nombre,
        corto,
        activo
      )
    `)
    .eq("cliente_id", clienteId)
    .eq("activo", true)
    .eq("producto.activo", true)

  if (error) {
    throw new Error(
      `No se pudieron cargar los productos: ${error.message}`,
    )
  }

  return (data ?? [])
    .map((registro) => {
      const producto = Array.isArray(
        registro.producto,
      )
        ? registro.producto[0]
        : registro.producto

      if (!producto) return null

      const codigo = String(producto.codigo ?? "").trim()
      const nombre = String(producto.nombre ?? "").trim()
      const corto = String(
        producto.corto ?? producto.nombre ?? "Producto",
      ).trim()

      return {
        id: producto.id,
        codigo,
        nombre,
        corto: corto || nombre || "Producto",
        unidad_manejo:
          Number(registro.unidad_manejo) || 1,
        precio: registro.precio,
      }
    })
    .filter(
      (
        producto,
      ): producto is ProductoPedidoDb =>
        producto !== null,
    )
    .sort((a, b) =>
      a.corto.localeCompare(b.corto),
    )
}

export async function obtenerPedidosDb() {
  const { data, error } = await supabase
    .from("pedidos")
    .select(`
      id,
      numero_pedido_cliente,
      fecha_entrega,
      hora_entrega,
      prioridad,
      tipo_empaque,
      estado,
      total_unidades,
      creado_en,
      cliente:clientes(
        id,
        nombre
      ),
      bodega:bodegas(
        id,
        nombre
      )
    `)
    .order("fecha_entrega", {
      ascending: true,
    })
    .order("creado_en", {
      ascending: false,
    })

  if (error) {
    throw new Error(
      `No se pudieron cargar los pedidos: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as PedidoListadoDb[]
}

export async function obtenerPedidosRangoDb(
  fechaDesde: string,
  fechaHasta: string,
) {
  if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
    throw new Error("El rango de pedidos no es válido.")
  }

  const { data, error } = await supabase
    .from("pedidos")
    .select(`
      id,
      numero_pedido_cliente,
      fecha_entrega,
      hora_entrega,
      prioridad,
      tipo_empaque,
      estado,
      total_unidades,
      creado_en,
      cliente:clientes(
        id,
        nombre
      ),
      bodega:bodegas(
        id,
        nombre
      )
    `)
    .gte("fecha_entrega", fechaDesde)
    .lte("fecha_entrega", fechaHasta)
    .order("fecha_entrega", { ascending: true })
    .order("creado_en", { ascending: false })

  if (error) {
    throw new Error(
      `No se pudieron cargar los pedidos del periodo: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as PedidoListadoDb[]
}

export async function obtenerDetallesPedidosPorIdsDb(
  pedidoIds: string[],
) {
  const ids = Array.from(new Set(pedidoIds.filter(Boolean)))
  const mapa = new Map<string, DetallePedidoConsultaDb[]>()
  ids.forEach((id) => mapa.set(id, []))

  for (let indice = 0; indice < ids.length; indice += 100) {
    const bloque = ids.slice(indice, indice + 100)
    const { data, error } = await supabase
      .from("pedido_detalles")
      .select(`
        pedido_id,
        id,
        orden,
        producto_id,
        total_unidades,
        unidades_manejo,
        unidades_despachadas,
        estado,
        producto:productos(
          id,
          codigo,
          nombre,
          corto
        )
      `)
      .in("pedido_id", bloque)
      .order("pedido_id", { ascending: true })
      .order("orden", { ascending: true })

    if (error) {
      throw new Error(
        `No se pudo cargar el detalle consolidado de pedidos: ${error.message}`,
      )
    }

    ;((data ?? []) as unknown as (DetallePedidoConsultaDb & { pedido_id: string })[])
      .forEach((detalle) => {
        const { pedido_id, ...resto } = detalle
        const actual = mapa.get(pedido_id) ?? []
        actual.push(resto as DetallePedidoConsultaDb)
        mapa.set(pedido_id, actual)
      })
  }

  return mapa
}

export async function buscarPedidosActivosBodegaFechaDb(
  bodegaId: string,
  fechaEntrega: string,
) {
  if (!bodegaId || !fechaEntrega) return []

  const { data, error } = await supabase
    .from("pedidos")
    .select(`
      id,
      numero_pedido_cliente,
      fecha_entrega,
      estado,
      total_unidades,
      creado_en
    `)
    .eq("bodega_id", bodegaId)
    .eq("fecha_entrega", fechaEntrega)
    .in("estado", [
      "INGRESADO",
      "PREPARADO",
    ])
    .order("creado_en", {
      ascending: true,
    })

  if (error) {
    throw new Error(
      `No se pudo verificar si ya existen pedidos: ${error.message}`,
    )
  }

  return (data ?? []) as PedidoActivoMismaFechaDb[]
}

async function controlRegistroPedidoDb(usuarioEsperado?: string) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || usuarioEsperado && user.id !== usuarioEsperado) throw new Error("Ingresa con el usuario que preparó el pedido.")
  let almacen: Storage
  try { almacen = window.localStorage } catch { throw new Error("Habilita el almacenamiento del navegador para conservar el intento.") }
  return crearControlRegistroPedido({ almacen, proyecto: import.meta.env.VITE_SUPABASE_URL, usuarioId: user.id,
    registrar: async s => {
      const { data, error } = await supabase.rpc("registrar_pedido_seguro", { p_solicitud_id: s.solicitudId, p_datos: s.datos, p_usuario_esperado: user.id })
      if (error) throw new Error(error.code === "PGRST202" || error.code === "42883" ? "Falta instalar el registro seguro de pedidos. No se usó el guardado anterior." : error.message)
      return data
    },
    resolver: async id => {
      const { data, error } = await supabase.rpc("resolver_registro_pedido", { p_solicitud_id: id, p_usuario_esperado: user.id })
      if (error) throw new Error(error.message)
      return data
    },
  })
}
export async function obtenerRegistrosPedidoPendientesDb() { return (await controlRegistroPedidoDb()).listar() }
export async function resolverRegistroPedidoDb(s: SolicitudPedidoPendiente) { return (await controlRegistroPedidoDb(s.usuarioId)).resolver(s.solicitudId) }
export async function reintentarRegistroPedidoDb(s: SolicitudPedidoPendiente) { return (await controlRegistroPedidoDb(s.usuarioId)).registrar(s.solicitudId, s.datos, s.origen) }
export async function crearPedidoDb(datos: NuevoPedidoDb, solicitudId = crypto.randomUUID(), origen = "MANUAL") {
  return (await controlRegistroPedidoDb()).registrar(solicitudId, datos, origen)
}

export async function eliminarPedidoIngresadoDb(
  pedidoId: string,
) {
  if (!pedidoId) {
    throw new Error("No se encontró el pedido.")
  }

  const {
    data: pedido,
    error: errorConsulta,
  } = await supabase
    .from("pedidos")
    .select(`
      id,
      numero_pedido_cliente,
      estado
    `)
    .eq("id", pedidoId)
    .maybeSingle()

  if (errorConsulta) {
    throw new Error(
      `No se pudo consultar el pedido: ${errorConsulta.message}`,
    )
  }

  if (!pedido) {
    throw new Error(
      "El pedido ya no existe o no está disponible.",
    )
  }

  if (pedido.estado !== "INGRESADO") {
    throw new Error(
      `El pedido ${pedido.numero_pedido_cliente} está en estado ${pedido.estado} y no puede eliminarse. Solo se pueden eliminar pedidos INGRESADOS.`,
    )
  }

  const {
    data: detalles,
    error: errorDetallesConsulta,
  } = await supabase
    .from("pedido_detalles")
    .select("id")
    .eq("pedido_id", pedidoId)

  if (errorDetallesConsulta) {
    throw new Error(
      `No se pudieron verificar los productos del pedido: ${errorDetallesConsulta.message}`,
    )
  }

  const idsDetalles =
    (detalles ?? []).map((detalle) => detalle.id)

  if (idsDetalles.length > 0) {
    const {
      data: reservas,
      error: errorReservas,
    } = await supabase
      .from("reserva_detalles")
      .select("id")
      .in(
        "pedido_detalle_id",
        idsDetalles,
      )
      .limit(1)

    if (errorReservas) {
      throw new Error(
        `No se pudo verificar si el pedido tiene reservas: ${errorReservas.message}`,
      )
    }

    if ((reservas ?? []).length > 0) {
      throw new Error(
        "El pedido tiene reservas asociadas y no puede eliminarse. Libera primero la reserva desde Despachos.",
      )
    }
  }

  const {
    data: detallesEliminados,
    error: errorEliminarDetalles,
  } = await supabase
    .from("pedido_detalles")
    .delete()
    .eq("pedido_id", pedidoId)
    .select("id")

  if (errorEliminarDetalles) {
    throw new Error(
      `No se pudieron eliminar los productos del pedido: ${errorEliminarDetalles.message}`,
    )
  }

  if (
    idsDetalles.length > 0 &&
    (detallesEliminados ?? []).length !==
      idsDetalles.length
  ) {
    throw new Error(
      "No fue posible eliminar todos los productos del pedido. Revisa las políticas de seguridad de Supabase.",
    )
  }

  const {
    data: pedidoEliminado,
    error: errorEliminarPedido,
  } = await supabase
    .from("pedidos")
    .delete()
    .eq("id", pedidoId)
    .eq("estado", "INGRESADO")
    .select(`
      id,
      numero_pedido_cliente
    `)
    .maybeSingle()

  if (errorEliminarPedido) {
    throw new Error(
      `No se pudo eliminar el pedido: ${errorEliminarPedido.message}`,
    )
  }

  if (!pedidoEliminado) {
    throw new Error(
      "Supabase no permitió eliminar el pedido. Revisa las políticas de seguridad.",
    )
  }

  return {
    id: pedidoEliminado.id,
    numeroPedidoCliente:
      pedidoEliminado.numero_pedido_cliente,
  }
}

export async function obtenerDetallePedidoDb(
  pedidoId: string,
) {
  if (!pedidoId) return []

  const { data, error } = await supabase
    .from("pedido_detalles")
    .select(`
      id,
      orden,
      producto_id,
      total_unidades,
      unidades_manejo,
      unidades_despachadas,
      estado,
      producto:productos(
        id,
        codigo,
        nombre,
        corto
      )
    `)
    .eq("pedido_id", pedidoId)
    .order("orden", {
      ascending: true,
    })

  if (error) {
    throw new Error(
      `No se pudo cargar el detalle del pedido: ${error.message}`,
    )
  }

  return (
    data ?? []
  ) as unknown as DetallePedidoConsultaDb[]
}
