import { supabase } from "../lib/supabase"

export type InventarioLoteDb = {
  id: string
  producto_id: string
  lote: string
  fecha_produccion: string
  fecha_ingreso_bodega: string
  fecha_vencimiento: string
  cantidad: number
  numero_paradas: number | null
  tamano_parada: number | null
  creado_en: string
  actualizado_en: string
  producto: {
    id: string
    codigo: string
    nombre: string
    corto: string
  } | null
}

export type StockDisponibleLoteDb = {
  id: string
  producto_id: string
  lote: string
  fecha_produccion: string
  fecha_vencimiento: string
  cantidad_fisica: number
  cantidad_reservada: number
  cantidad_disponible: number
}

export async function obtenerInventarioLotesDb() {
  const { data, error } = await supabase
    .from("inventario_lotes")
    .select(`
      id,
      producto_id,
      lote,
      fecha_produccion,
      fecha_ingreso_bodega,
      fecha_vencimiento,
      cantidad,
      numero_paradas,
      tamano_parada,
      creado_en,
      actualizado_en,
      producto:productos(
        id,
        codigo,
        nombre,
        corto
      )
    `)
    .order("fecha_ingreso_bodega", {
      ascending: false,
    })
    .order("fecha_vencimiento", {
      ascending: true,
    })
    .order("fecha_produccion", {
      ascending: true,
    })

  if (error) {
    throw new Error(
      `No se pudo cargar el inventario: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as InventarioLoteDb[]
}

export async function obtenerStockDisponibleLotesDb() {
  const { data, error } = await supabase
    .from("stock_disponible_lotes")
    .select("*")

  if (error) {
    throw new Error(
      `No se pudo cargar el stock disponible: ${error.message}`,
    )
  }

  return (data ?? []) as StockDisponibleLoteDb[]
}

export async function crearLoteInventarioDb(datos: {
  productoId: string
  lote: string
  fechaProduccion: string
  fechaVencimiento: string
  cantidad: number
  fechaIngresoBodega?: string
  numeroParadas?: number
  tamanoParada?: number
}) {
  if (!datos.productoId) {
    throw new Error("Selecciona un producto.")
  }

  const loteLimpio = datos.lote
    .trim()
    .toUpperCase()

  if (!loteLimpio) {
    throw new Error("El lote es obligatorio.")
  }

  if (!datos.fechaProduccion) {
    throw new Error(
      "La fecha de producción es obligatoria.",
    )
  }

  if (!datos.fechaVencimiento) {
    throw new Error(
      "La fecha de vencimiento es obligatoria.",
    )
  }

  if (
    datos.fechaVencimiento <
    datos.fechaProduccion
  ) {
    throw new Error(
      "La fecha de vencimiento no puede ser anterior a la fecha de producción.",
    )
  }

  if (
    !Number.isInteger(datos.cantidad) ||
    datos.cantidad <= 0
  ) {
    throw new Error(
      "La cantidad debe ser un número entero mayor que cero.",
    )
  }

  if (
    datos.numeroParadas !== undefined &&
    (
      !Number.isInteger(datos.numeroParadas) ||
      datos.numeroParadas <= 0
    )
  ) {
    throw new Error(
      "El número de paradas debe ser un entero mayor que cero.",
    )
  }

  if (
    datos.tamanoParada !== undefined &&
    (
      !Number.isInteger(datos.tamanoParada) ||
      datos.tamanoParada <= 0
    )
  ) {
    throw new Error(
      "El tamaño de parada debe ser un entero mayor que cero.",
    )
  }

  const {
    data: loteExistente,
    error: errorConsulta,
  } = await supabase
    .from("inventario_lotes")
    .select(`
      id,
      cantidad,
      numero_paradas,
      tamano_parada,
      fecha_ingreso_bodega
    `)
    .eq("producto_id", datos.productoId)
    .eq("lote", loteLimpio)
    .eq(
      "fecha_produccion",
      datos.fechaProduccion,
    )
    .maybeSingle()

  if (errorConsulta) {
    throw new Error(
      `No se pudo verificar el lote: ${errorConsulta.message}`,
    )
  }

  if (loteExistente) {
    const nuevaCantidad =
      Number(loteExistente.cantidad) +
      datos.cantidad

    const nuevasParadas =
      datos.numeroParadas === undefined
        ? loteExistente.numero_paradas
        : Number(
            loteExistente.numero_paradas ?? 0,
          ) + datos.numeroParadas

    const { data, error } = await supabase
      .from("inventario_lotes")
      .update({
        cantidad: nuevaCantidad,
        numero_paradas: nuevasParadas,
        tamano_parada:
          datos.tamanoParada ??
          loteExistente.tamano_parada,
        fecha_ingreso_bodega:
          datos.fechaIngresoBodega ??
          loteExistente.fecha_ingreso_bodega,
        fecha_vencimiento:
          datos.fechaVencimiento,
        actualizado_en:
          new Date().toISOString(),
      })
      .eq("id", loteExistente.id)
      .select()
      .single()

    if (error) {
      throw new Error(
        `No se pudo actualizar el lote existente: ${error.message}`,
      )
    }

    return data
  }

  const registroNuevo: {
    producto_id: string
    lote: string
    fecha_produccion: string
    fecha_vencimiento: string
    cantidad: number
    fecha_ingreso_bodega?: string
    numero_paradas: number | null
    tamano_parada: number | null
  } = {
    producto_id: datos.productoId,
    lote: loteLimpio,
    fecha_produccion:
      datos.fechaProduccion,
    fecha_vencimiento:
      datos.fechaVencimiento,
    cantidad: datos.cantidad,
    numero_paradas:
      datos.numeroParadas ?? null,
    tamano_parada:
      datos.tamanoParada ?? null,
  }

  if (datos.fechaIngresoBodega) {
    registroNuevo.fecha_ingreso_bodega =
      datos.fechaIngresoBodega
  }

  const { data, error } = await supabase
    .from("inventario_lotes")
    .insert(registroNuevo)
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear el lote: ${error.message}`,
    )
  }

  return data
}

export async function actualizarLoteInventarioDb(
  loteId: string,
  datos: {
    lote: string
    fechaProduccion: string
    fechaVencimiento: string
    cantidad: number
    fechaIngresoBodega?: string
  },
) {
  if (!loteId) {
    throw new Error("No se encontró el lote.")
  }

  const loteLimpio = datos.lote
    .trim()
    .toUpperCase()

  if (!loteLimpio) {
    throw new Error("El lote es obligatorio.")
  }

  if (
    datos.fechaVencimiento <
    datos.fechaProduccion
  ) {
    throw new Error(
      "La fecha de vencimiento no puede ser anterior a la fecha de producción.",
    )
  }

  if (
    !Number.isInteger(datos.cantidad) ||
    datos.cantidad < 0
  ) {
    throw new Error(
      "La cantidad debe ser un número entero mayor o igual que cero.",
    )
  }

  const cambios: {
    lote: string
    fecha_produccion: string
    fecha_vencimiento: string
    cantidad: number
    fecha_ingreso_bodega?: string
    actualizado_en: string
  } = {
    lote: loteLimpio,
    fecha_produccion:
      datos.fechaProduccion,
    fecha_vencimiento:
      datos.fechaVencimiento,
    cantidad: datos.cantidad,
    actualizado_en:
      new Date().toISOString(),
  }

  if (datos.fechaIngresoBodega) {
    cambios.fecha_ingreso_bodega =
      datos.fechaIngresoBodega
  }

  const { error } = await supabase
    .from("inventario_lotes")
    .update(cambios)
    .eq("id", loteId)

  if (error) {
    throw new Error(
      `No se pudo actualizar el lote: ${error.message}`,
    )
  }
}

export async function eliminarLoteInventarioDb(
  loteId: string,
) {
  if (!loteId) {
    throw new Error("No se encontró el lote.")
  }

  const { data, error } = await supabase
    .from("inventario_lotes")
    .delete()
    .eq("id", loteId)
    .select("id")

  if (error) {
    throw new Error(
      `No se pudo eliminar el lote: ${error.message}`,
    )
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Supabase no permitió eliminar el lote. Revisa las políticas de seguridad o las relaciones del registro.",
    )
  }
}

export async function convertirInventarioEmpaqueDb(
  datos: {
    inventarioOrigenId: string
    productoDestinoId: string
    cantidad: number
  },
) {
  if (!datos.inventarioOrigenId) {
    throw new Error(
      "Selecciona el lote de origen.",
    )
  }

  if (!datos.productoDestinoId) {
    throw new Error(
      "Selecciona el producto de destino.",
    )
  }

  if (
    !Number.isInteger(datos.cantidad) ||
    datos.cantidad <= 0
  ) {
    throw new Error(
      "La cantidad debe ser un número entero mayor que cero.",
    )
  }

  const { data, error } = await supabase.rpc(
    "convertir_inventario_empaque",
    {
      p_inventario_origen_id:
        datos.inventarioOrigenId,
      p_producto_destino_id:
        datos.productoDestinoId,
      p_cantidad:
        datos.cantidad,
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo realizar el empaque.",
    )
  }

  return data as string
}

export async function ajustarInventarioLoteDb(
  datos: {
    inventarioLoteId: string
    tipo: "ENTRADA" | "SALIDA"
    cantidad: number
    motivo: string
    observaciones: string
  },
) {
  if (!datos.inventarioLoteId) {
    throw new Error(
      "Selecciona un lote.",
    )
  }

  if (
    !Number.isInteger(datos.cantidad) ||
    datos.cantidad <= 0
  ) {
    throw new Error(
      "La cantidad debe ser un número entero mayor que cero.",
    )
  }

  if (!datos.motivo.trim()) {
    throw new Error(
      "Selecciona un motivo.",
    )
  }

  const { data, error } = await supabase.rpc(
    "ajustar_inventario_lote",
    {
      p_inventario_lote_id:
        datos.inventarioLoteId,
      p_tipo:
        datos.tipo,
      p_cantidad:
        datos.cantidad,
      p_motivo:
        datos.motivo,
      p_observaciones:
        datos.observaciones.trim() || null,
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo ajustar el inventario.",
    )
  }

  return data as string
}