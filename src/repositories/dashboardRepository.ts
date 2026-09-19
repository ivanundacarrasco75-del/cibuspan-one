import { supabase } from "../lib/supabase"

export type ResumenDashboardDb = {
  pedidos_ingresados: number
  pedidos_preparados: number
  pedidos_despachados_hoy: number
  unidades_despachadas_hoy: number

  inventario_fisico: number
  inventario_reservado: number
  inventario_disponible: number
  lotes_activos: number
  lotes_proximos_vencer: number

  productos_por_producir: number
  lotes_sugeridos: number
  unidades_sugeridas: number
}

export type ProduccionDashboardDb = {
  producto_id: string
  codigo: string
  corto: string
  nombre: string
  pedidos_pendientes: number
  inventario_disponible: number
  stock_minimo: number
  necesidad_neta: number
  lotes_sugeridos: number
  unidades_sugeridas: number
}

export async function obtenerResumenDashboardDb() {
  const hoy = new Date()
    .toISOString()
    .slice(0, 10)

  const [
    pedidosResultado,
    inventarioResultado,
    produccionResultado,
    despachosResultado,
  ] = await Promise.all([
    supabase
      .from("pedidos")
      .select(
        "id, estado",
      ),

    supabase
      .from("stock_disponible_lotes")
      .select(
        `
        id,
        cantidad_fisica,
        cantidad_reservada,
        cantidad_disponible,
        fecha_vencimiento
        `,
      ),

    supabase.rpc(
      "obtener_produccion_sugerida",
    ),

    supabase
      .from("despachos")
      .select(`
        id,
        fecha_despacho,
        detalles:despacho_detalles(
          unidades
        )
      `)
      .gte(
        "fecha_despacho",
        `${hoy}T00:00:00`,
      )
      .lt(
        "fecha_despacho",
        `${hoy}T23:59:59.999`,
      ),
  ])

  if (pedidosResultado.error) {
    throw new Error(
      `No se pudieron cargar los pedidos: ${pedidosResultado.error.message}`,
    )
  }

  if (inventarioResultado.error) {
    throw new Error(
      `No se pudo cargar el inventario: ${inventarioResultado.error.message}`,
    )
  }

  if (produccionResultado.error) {
    throw new Error(
      `No se pudo cargar la producción sugerida: ${produccionResultado.error.message}`,
    )
  }

  if (despachosResultado.error) {
    throw new Error(
      `No se pudieron cargar los despachos: ${despachosResultado.error.message}`,
    )
  }

  const pedidos =
    pedidosResultado.data ?? []

  const inventario =
    inventarioResultado.data ?? []

  const produccion =
    (produccionResultado.data ??
      []) as ProduccionDashboardDb[]

  const despachos =
    despachosResultado.data ?? []

  const pedidosIngresados =
    pedidos.filter(
      (pedido) =>
        pedido.estado === "INGRESADO",
    ).length

  const pedidosPreparados =
    pedidos.filter(
      (pedido) =>
        pedido.estado === "PREPARADO",
    ).length

  const inventarioFisico =
    inventario.reduce(
      (total, lote) =>
        total +
        Number(
          lote.cantidad_fisica ?? 0,
        ),
      0,
    )

  const inventarioReservado =
    inventario.reduce(
      (total, lote) =>
        total +
        Number(
          lote.cantidad_reservada ?? 0,
        ),
      0,
    )

  const inventarioDisponible =
    inventario.reduce(
      (total, lote) =>
        total +
        Number(
          lote.cantidad_disponible ?? 0,
        ),
      0,
    )

  const lotesActivos =
    inventario.filter(
      (lote) =>
        Number(
          lote.cantidad_fisica ?? 0,
        ) > 0,
    ).length

  const fechaLimite = new Date()
  fechaLimite.setDate(
    fechaLimite.getDate() + 7,
  )

  const fechaLimiteTexto =
    fechaLimite
      .toISOString()
      .slice(0, 10)

  const lotesProximosVencer =
    inventario.filter((lote) => {
      const fechaVencimiento =
        lote.fecha_vencimiento

      return (
        fechaVencimiento >= hoy &&
        fechaVencimiento <=
          fechaLimiteTexto &&
        Number(
          lote.cantidad_fisica ?? 0,
        ) > 0
      )
    }).length

  const productosPorProducir =
    produccion.filter(
      (producto) =>
        producto.unidades_sugeridas > 0,
    ).length

  const lotesSugeridos =
    produccion.reduce(
      (total, producto) =>
        total +
        producto.lotes_sugeridos,
      0,
    )

  const unidadesSugeridas =
    produccion.reduce(
      (total, producto) =>
        total +
        producto.unidades_sugeridas,
      0,
    )

  const unidadesDespachadasHoy =
    despachos.reduce(
      (total, despacho) => {
        const detalles =
          Array.isArray(
            despacho.detalles,
          )
            ? despacho.detalles
            : []

        return (
          total +
          detalles.reduce(
            (
              subtotal,
              detalle,
            ) =>
              subtotal +
              Number(
                detalle.unidades ??
                  0,
              ),
            0,
          )
        )
      },
      0,
    )

  const resumen: ResumenDashboardDb = {
    pedidos_ingresados:
      pedidosIngresados,

    pedidos_preparados:
      pedidosPreparados,

    pedidos_despachados_hoy:
      despachos.length,

    unidades_despachadas_hoy:
      unidadesDespachadasHoy,

    inventario_fisico:
      inventarioFisico,

    inventario_reservado:
      inventarioReservado,

    inventario_disponible:
      inventarioDisponible,

    lotes_activos:
      lotesActivos,

    lotes_proximos_vencer:
      lotesProximosVencer,

    productos_por_producir:
      productosPorProducir,

    lotes_sugeridos:
      lotesSugeridos,

    unidades_sugeridas:
      unidadesSugeridas,
  }

  return {
    resumen,
    produccion,
  }
}