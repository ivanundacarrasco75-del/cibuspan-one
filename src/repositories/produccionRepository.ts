import { supabase } from "../lib/supabase"
import type { OrdenProduccionImportar } from "../utils/ordenesProduccionExcel"

export type ProduccionSugeridaDb = {
  producto_id: string
  codigo: string
  nombre: string
  corto: string
  codigo_lote: string
  vida_util_dias: number
  pedidos_pendientes: number
  inventario_disponible: number
  stock_minimo: number
  tamano_lote: number
  necesidad_neta: number
  lotes_sugeridos: number
  unidades_sugeridas: number
}

export type ProduccionIngresadaDb = {
  id: string
  producto_id: string
  lote: string
  fecha_produccion: string
  fecha_vencimiento: string
  cantidad: number
  numero_paradas: number | null
  tamano_parada: number | null
  creado_en: string
  actualizado_en: string
  producto: {
    codigo: string
    nombre: string
    corto: string
    tamano_lote: number
  } | null
}

export async function obtenerProduccionSugeridaDb() {
  const { data, error } = await supabase.rpc(
    "obtener_produccion_sugerida",
  )

  if (error) {
    throw new Error(
      `No se pudo calcular la producción sugerida: ${error.message}`,
    )
  }

  return (data ?? []) as ProduccionSugeridaDb[]
}

export async function obtenerProduccionesIngresadasDb() {
  const { data, error } = await supabase
    .from("inventario_lotes")
    .select(`
      id,
      producto_id,
      lote,
      fecha_produccion,
      fecha_vencimiento,
      cantidad,
      numero_paradas,
      tamano_parada,
      creado_en,
      actualizado_en,
      producto:productos(
        codigo,
        nombre,
        corto,
        tamano_lote
      )
    `)
    .not("numero_paradas", "is", null)
    .order("fecha_produccion", {
      ascending: false,
    })
    .order("creado_en", {
      ascending: false,
    })

  if (error) {
    throw new Error(
      `No se pudieron cargar las producciones ingresadas: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as ProduccionIngresadaDb[]
}

export type ProduccionResumenHistorialDb = {
  id: string
  numero_produccion: number | null
  numero_orden_externa: string | null
  fecha_produccion_general: string
  estado: "REGISTRADA" | "ANULADA"
  observaciones: string | null
  creado_por: string | null
  creado_en: string
  total_skus: number
  total_paradas: number
  total_unidades: number
  sku_terminados: number
  sku_semielaborados: number
  ordenes_micro: number
  total_kg_micro: number
  costo_total: number | null
  origen: "APP" | "HISTORICO"
  estado_validacion: "VALIDA" | "REVISAR"
}

export type ProduccionDetalleHistorialDb = {
  produccion_id: string
  numero_produccion: number | null
  numero_orden_externa: string | null
  fecha_produccion_general: string
  estado: "REGISTRADA" | "ANULADA"
  produccion_creada_en: string
  detalle_id: string
  producto_id: string | null
  producto_codigo: string
  producto_corto: string
  producto_nombre: string
  codigo_lote_producto: string | null
  tipo_destino:
    | "PRODUCTO_TERMINADO"
    | "SEMIELABORADO"
    | "MICRO"
  numero_paradas: number
  tamano_parada: number
  unidades: number
  kg_micro: number
  fecha_produccion: string
  lote: string | null
  fecha_vencimiento: string | null
  inventario_lote_id: string | null
  inventario_semielaborado_id: string | null
  orden: number
  costo_total: number | null
  origen: "APP" | "HISTORICO"
  estado_validacion: "VALIDA" | "REVISAR"
}

export type ImportacionOrdenesProduccionDb = {
  id: string
  archivo_nombre: string
  archivo_hash: string
  estado: "PROCESANDO" | "COMPLETADA"
  fecha_desde: string | null
  fecha_hasta: string | null
  filas_archivo: number
  ordenes_archivo: number
  ordenes_sku: number
  ordenes_micro: number
  unidades_sku: number
  kg_micro: number
  costo_total: number
  creado_en: string
}

export type RespuestaLoteOrdenesProduccionDb = {
  importacion_id: string
  ordenes_nuevas: number
  ordenes_actualizadas: number
  finalizada: boolean
}

export type DetalleNuevaProduccionDb = {
  productoId: string
  tipoDestino:
    | "PRODUCTO_TERMINADO"
    | "SEMIELABORADO"
  semielaboradoTipoId?: string | null
  numeroParadas: number
  tamanoParada: number
  unidades: number
  fechaProduccion: string
  lote?: string | null
  fechaVencimiento?: string | null
  orden: number
}

export type DetalleEditarProduccionDb = {
  detalleId: string
  numeroParadas: number
  unidades: number
  fechaProduccion: string
  lote?: string | null
  fechaVencimiento?: string | null
}

export async function registrarProduccionCompletaDb(datos: {
  fechaProduccionGeneral: string
  detalles: DetalleNuevaProduccionDb[]
}) {
  if (!datos.fechaProduccionGeneral) {
    throw new Error(
      "La fecha general de producción es obligatoria.",
    )
  }

  if (datos.detalles.length === 0) {
    throw new Error(
      "La producción no contiene productos.",
    )
  }

  const detallesRpc = datos.detalles.map(
    (detalle) => ({
      producto_id: detalle.productoId,
      tipo_destino: detalle.tipoDestino,
      semielaborado_tipo_id:
        detalle.semielaboradoTipoId ?? null,
      numero_paradas:
        detalle.numeroParadas,
      tamano_parada:
        detalle.tamanoParada,
      unidades:
        detalle.unidades,
      fecha_produccion:
        detalle.fechaProduccion,
      lote:
        detalle.lote ?? null,
      fecha_vencimiento:
        detalle.fechaVencimiento ?? null,
      orden:
        detalle.orden,
    }),
  )

  const { data, error } = await supabase.rpc(
    "registrar_produccion_completa",
    {
      p_fecha_produccion_general:
        datos.fechaProduccionGeneral,
      p_detalles:
        detallesRpc,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo registrar la producción: ${error.message}`,
    )
  }

  return data as string
}

export async function editarProduccionCompletaDb(datos: {
  produccionId: string
  fechaProduccionGeneral: string
  detalles: DetalleEditarProduccionDb[]
}) {
  if (!datos.produccionId) {
    throw new Error("No se encontró la producción.")
  }

  if (!datos.fechaProduccionGeneral) {
    throw new Error(
      "La fecha general de producción es obligatoria.",
    )
  }

  if (datos.detalles.length === 0) {
    throw new Error(
      "La producción no contiene productos.",
    )
  }

  const { data, error } = await supabase.rpc(
    "editar_produccion_completa",
    {
      p_produccion_id: datos.produccionId,
      p_fecha_produccion_general:
        datos.fechaProduccionGeneral,
      p_detalles: datos.detalles.map(
        (detalle) => ({
          detalle_id: detalle.detalleId,
          numero_paradas:
            detalle.numeroParadas,
          unidades: detalle.unidades,
          fecha_produccion:
            detalle.fechaProduccion,
          lote: detalle.lote ?? null,
          fecha_vencimiento:
            detalle.fechaVencimiento ?? null,
        }),
      ),
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo editar la producción.",
    )
  }

  return data as string
}

export async function obtenerResumenProduccionesUnificadoDb(
  ascending = false,
) {
  const registros: ProduccionResumenHistorialDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("vw_producciones_resumen_unificado")
      .select("*")
      .order("fecha_produccion_general", { ascending })
      .order("id", { ascending })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(
        `No se pudo cargar el historial de producciones: ${error.message}`,
      )
    }

    const pagina = (data ?? []) as ProduccionResumenHistorialDb[]
    registros.push(...pagina)

    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

export async function obtenerResumenProduccionesRangoDb(
  fechaDesde: string,
  fechaHasta: string,
  ascending = false,
) {
  if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
    throw new Error("El rango de producción no es válido.")
  }

  const registros: ProduccionResumenHistorialDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("vw_producciones_resumen_unificado")
      .select("*")
      .gte("fecha_produccion_general", fechaDesde)
      .lte("fecha_produccion_general", fechaHasta)
      .order("fecha_produccion_general", { ascending })
      .order("id", { ascending })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(
        `No se pudo cargar la producción del periodo: ${error.message}`,
      )
    }

    const pagina = (data ?? []) as ProduccionResumenHistorialDb[]
    registros.push(...pagina)
    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

export async function obtenerHistorialProduccionesDb() {
  return obtenerResumenProduccionesUnificadoDb(false)
}

export async function obtenerDetalleProduccionDb(
  produccionId: string,
) {
  if (!produccionId) return []

  const { data, error } = await supabase
    .from("vw_produccion_historial_detalle_unificado")
    .select("*")
    .eq("produccion_id", produccionId)
    .order("orden", {
      ascending: true,
    })

  if (error) {
    throw new Error(
      `No se pudo cargar el detalle de la producción: ${error.message}`,
    )
  }

  return (
    data ?? []
  ) as ProduccionDetalleHistorialDb[]
}

export async function obtenerImportacionesOrdenesProduccionDb() {
  const { data, error } = await supabase
    .from("pro_vw_importaciones_ordenes")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(20)

  if (error) {
    throw new Error(
      `No se pudo cargar el historial de importaciones: ${error.message}`,
    )
  }

  return (data ?? []) as ImportacionOrdenesProduccionDb[]
}

export async function obtenerCodigosProductosProduccionDb() {
  const { data, error } = await supabase
    .from("productos")
    .select("codigo")

  if (error) {
    throw new Error(
      `No se pudo consultar el catálogo de SKU: ${error.message}`,
    )
  }

  return (data ?? []).map((item) => String(item.codigo).trim())
}

export async function importarLoteOrdenesProduccionDb(datos: {
  archivoNombre: string
  archivoHash: string
  ordenes: OrdenProduccionImportar[]
  finalizar: boolean
}) {
  const { data, error } = await supabase.rpc(
    "pro_importar_ordenes_historicas",
    {
      p_archivo_nombre: datos.archivoNombre,
      p_archivo_hash: datos.archivoHash,
      p_ordenes: datos.ordenes,
      p_finalizar: datos.finalizar,
    },
  )

  if (error) {
    throw new Error(
      `No se pudieron importar las órdenes: ${error.message}`,
    )
  }

  return data as RespuestaLoteOrdenesProduccionDb
}
