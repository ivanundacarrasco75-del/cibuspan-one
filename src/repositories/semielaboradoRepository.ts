import { supabase } from "../lib/supabase"

export type SemielaboradoTipoDb = {
  id: string
  producto_base_id: string
  nombre: string
  activo: boolean
  producto_base: {
    id: string
    codigo: string
    nombre: string
    corto: string
    codigo_lote: string | null
    vida_util_dias: number
  } | null
}

export type SemielaboradoDestinoDb = {
  id: string
  semielaborado_tipo_id: string
  producto_final_id: string
  activo: boolean
  producto_final: {
    id: string
    codigo: string
    nombre: string
    corto: string
    codigo_lote: string | null
    vida_util_dias: number
  } | null
}

export type StockSemielaboradoDb = {
  id: string
  semielaborado_tipo_id: string
  producto_base_id: string
  nombre: string
  fecha_produccion: string
  lote_interno: string
  cantidad_inicial: number
  cantidad_convertida: number
  cantidad_disponible: number
  creado_en: string
}

export type StockSemielaboradoResumenDb = {
  semielaborado_tipo_id: string
  producto_base_id: string
  nombre: string
  cantidad_disponible: number
}

export type ConversionSemielaboradoDb = {
  id: string
  inventario_semielaborado_id: string
  producto_final_id: string
  cantidad: number
  fecha_elaboracion_etiqueta: string
  lote_final: string
  fecha_vencimiento: string
  inventario_lote_id: string | null
  creado_en: string
  producto_final: {
    id: string
    codigo: string
    nombre: string
    corto: string
  } | null
}

export async function obtenerTiposSemielaboradoDb() {
  const { data, error } = await supabase
    .from("semielaborado_tipos")
    .select(`
      id,
      producto_base_id,
      nombre,
      activo,
      producto_base:productos(
        id,
        codigo,
        nombre,
        corto,
        codigo_lote,
        vida_util_dias
      )
    `)
    .eq("activo", true)
    .order("nombre")

  if (error) {
    throw new Error(
      `No se pudieron cargar los tipos de semielaborado: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as SemielaboradoTipoDb[]
}

export async function obtenerDestinosSemielaboradoDb(
  semielaboradoTipoId: string,
) {
  if (!semielaboradoTipoId) return []

  const { data, error } = await supabase
    .from("semielaborado_destinos")
    .select(`
      id,
      semielaborado_tipo_id,
      producto_final_id,
      activo,
      producto_final:productos(
        id,
        codigo,
        nombre,
        corto,
        codigo_lote,
        vida_util_dias
      )
    `)
    .eq(
      "semielaborado_tipo_id",
      semielaboradoTipoId,
    )
    .eq("activo", true)

  if (error) {
    throw new Error(
      `No se pudieron cargar los productos finales permitidos: ${error.message}`,
    )
  }

  return (
    (data ?? []) as unknown as SemielaboradoDestinoDb[]
  ).sort((a, b) =>
    (a.producto_final?.corto ?? "").localeCompare(
      b.producto_final?.corto ?? "",
    ),
  )
}

export async function obtenerStockSemielaboradosDb() {
  const { data, error } = await supabase
    .from("stock_semielaborados")
    .select("*")
    .gt("cantidad_disponible", 0)
    .order("fecha_produccion", {
      ascending: true,
    })
    .order("creado_en", {
      ascending: true,
    })

  if (error) {
    throw new Error(
      `No se pudo cargar el stock de semielaborados: ${error.message}`,
    )
  }

  return (data ?? []) as StockSemielaboradoDb[]
}

export async function obtenerResumenSemielaboradosDb() {
  const { data, error } = await supabase
    .from("stock_semielaborados_resumen")
    .select("*")
    .order("nombre")

  if (error) {
    throw new Error(
      `No se pudo cargar el resumen de semielaborados: ${error.message}`,
    )
  }

  return (data ?? []) as StockSemielaboradoResumenDb[]
}

export async function ingresarSemielaboradoDb(datos: {
  semielaboradoTipoId: string
  fechaProduccion: string
  cantidad: number
}) {
  if (!datos.semielaboradoTipoId) throw new Error("Selecciona el tipo de semielaborado.")
  if (!datos.fechaProduccion) throw new Error("La fecha de ingreso a prebodega es obligatoria.")
  if (!Number.isInteger(datos.cantidad) || datos.cantidad <= 0) throw new Error("La cantidad debe ser un número entero mayor que cero.")

  const { data: { user }, error: errorUsuario } = await supabase.auth.getUser()
  if (errorUsuario || !user) throw new Error("No existe una sesión válida.")

  const lotePendiente = ""

  const { data: existente, error: errorConsulta } = await supabase
    .from("inventario_semielaborados")
    .select(`id, cantidad_inicial`)
    .eq("semielaborado_tipo_id", datos.semielaboradoTipoId)
    .eq("fecha_produccion", datos.fechaProduccion)
    .eq("lote_interno", lotePendiente)
    .maybeSingle()

  if (errorConsulta) throw new Error(`No se pudo verificar el semielaborado: ${errorConsulta.message}`)

  if (existente) {
    const nuevaCantidad = Number(existente.cantidad_inicial) + datos.cantidad
    const { data, error } = await supabase
      .from("inventario_semielaborados")
      .update({ cantidad_inicial: nuevaCantidad, actualizado_en: new Date().toISOString() })
      .eq("id", existente.id)
      .select()
      .single()
    if (error) throw new Error(`No se pudo actualizar el semielaborado existente: ${error.message}`)
    return data
  }

  const { data, error } = await supabase
    .from("inventario_semielaborados")
    .insert({
      semielaborado_tipo_id: datos.semielaboradoTipoId,
      fecha_produccion: datos.fechaProduccion,
      lote_interno: lotePendiente,
      cantidad_inicial: datos.cantidad,
      creado_por: user.id,
    })
    .select()
    .single()
  if (error) throw new Error(`No se pudo ingresar el semielaborado: ${error.message}`)
  return data
}

export async function editarLoteSemielaboradoDb(datos: {
  inventarioSemielaboradoId: string
  fechaProduccion: string
  cantidadDisponible: number
}) {
  if (!datos.inventarioSemielaboradoId) {
    throw new Error(
      "No se encontró el registro de semielaborado.",
    )
  }

  if (!datos.fechaProduccion) {
    throw new Error(
      "La fecha de ingreso a prebodega es obligatoria.",
    )
  }

  if (
    !Number.isInteger(datos.cantidadDisponible) ||
    datos.cantidadDisponible < 0
  ) {
    throw new Error(
      "La cantidad disponible debe ser un número entero mayor o igual a cero.",
    )
  }

  const {
    data: conversiones,
    error: errorConversiones,
  } = await supabase
    .from("conversiones_semielaborados")
    .select("cantidad")
    .eq(
      "inventario_semielaborado_id",
      datos.inventarioSemielaboradoId,
    )

  if (errorConversiones) {
    throw new Error(
      `No se pudo verificar lo ya convertido: ${errorConversiones.message}`,
    )
  }

  const cantidadConvertida = (
    conversiones ?? []
  ).reduce(
    (total, conversion) =>
      total + Number(conversion.cantidad ?? 0),
    0,
  )

  // La tabla guarda cantidad_inicial.
  // Para que el DISPONIBLE quede exactamente como pide el usuario:
  // cantidad_inicial = ya convertido + disponible deseado.
  const nuevaCantidadInicial =
    cantidadConvertida +
    datos.cantidadDisponible

  const { data, error } = await supabase
    .from("inventario_semielaborados")
    .update({
      fecha_produccion:
        datos.fechaProduccion,
      cantidad_inicial:
        nuevaCantidadInicial,
      actualizado_en:
        new Date().toISOString(),
    })
    .eq(
      "id",
      datos.inventarioSemielaboradoId,
    )
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo editar el semielaborado: ${error.message}`,
    )
  }

  return data
}

export async function convertirSemielaboradoDb(datos: {
  inventarioSemielaboradoId: string
  productoFinalId: string
  cantidad: number
  fechaElaboracionEtiqueta: string
  loteFinal: string
  fechaVencimiento: string
}) {
  if (!datos.inventarioSemielaboradoId) {
    throw new Error(
      "Selecciona el lote de semielaborado.",
    )
  }

  if (!datos.productoFinalId) {
    throw new Error(
      "Selecciona el producto final.",
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

  if (!datos.fechaElaboracionEtiqueta) {
    throw new Error(
      "La fecha de elaboración es obligatoria.",
    )
  }

  const loteFinalLimpio =
    datos.loteFinal.trim().toUpperCase()

  if (!loteFinalLimpio) {
    throw new Error(
      "El lote final es obligatorio.",
    )
  }

  if (!datos.fechaVencimiento) {
    throw new Error(
      "La fecha de vencimiento es obligatoria.",
    )
  }

  if (
    datos.fechaVencimiento <
    datos.fechaElaboracionEtiqueta
  ) {
    throw new Error(
      "La fecha de vencimiento no puede ser anterior a la fecha de elaboración.",
    )
  }

  const { data, error } = await supabase.rpc(
    "convertir_semielaborado",
    {
      p_inventario_semielaborado_id:
        datos.inventarioSemielaboradoId,
      p_producto_final_id:
        datos.productoFinalId,
      p_cantidad:
        datos.cantidad,
      p_fecha_elaboracion_etiqueta:
        datos.fechaElaboracionEtiqueta,
      p_lote_final:
        loteFinalLimpio,
      p_fecha_vencimiento:
        datos.fechaVencimiento,
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo convertir el semielaborado.",
    )
  }

  return data as string
}

export async function obtenerConversionesSemielaboradoDb() {
  const { data, error } = await supabase
    .from("conversiones_semielaborados")
    .select(`
      id,
      inventario_semielaborado_id,
      producto_final_id,
      cantidad,
      fecha_elaboracion_etiqueta,
      lote_final,
      fecha_vencimiento,
      inventario_lote_id,
      creado_en,
      producto_final:productos(
        id,
        codigo,
        nombre,
        corto
      )
    `)
    .order("creado_en", {
      ascending: false,
    })

  if (error) {
    throw new Error(
      `No se pudo cargar el historial de etiquetado: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as ConversionSemielaboradoDb[]
}