import { supabase } from "../lib/supabase"

export type LineaVentaImportar = {
  comprobante: string
  fecha_emision: string
  cliente_nombre: string
  sku: string
  producto_nombre: string
  cantidad: number
  precio_unitario: number
  descuento: number
  precio_neto: number
  total_sin_impuestos: number
}

export type ImportacionVentasDb = {
  id: string
  archivo_nombre: string
  fecha_desde: string
  fecha_hasta: string
  movimientos_archivo: number
  movimientos_nuevos: number
  movimientos_actualizados: number
  unidades_archivo: number
  venta_sin_impuestos: number
  creado_en: string
}

export type VentaSemanalDb = {
  semana_inicio: string
  cliente_id: string | null
  cliente_nombre: string
  producto_id: string | null
  sku: string
  producto_nombre: string
  movimientos: number
  unidades: number
  venta_sin_impuestos: number
  actualizado_en: string
}

export type RespuestaImportacionVentas = {
  importacion_id: string
  fecha_desde: string
  fecha_hasta: string
  movimientos_archivo: number
  movimientos_nuevos: number
  movimientos_actualizados: number
  unidades_archivo: number
  venta_sin_impuestos: number
}

export async function obtenerImportacionesVentasDb() {
  const { data, error } = await supabase
    .from("com_importaciones_ventas")
    .select(`
      id,
      archivo_nombre,
      fecha_desde,
      fecha_hasta,
      movimientos_archivo,
      movimientos_nuevos,
      movimientos_actualizados,
      unidades_archivo,
      venta_sin_impuestos,
      creado_en
    `)
    .order("creado_en", { ascending: false })
    .limit(40)

  if (error) {
    throw new Error(
      `No se pudo cargar el historial de ventas: ${error.message}`,
    )
  }

  return (data ?? []) as ImportacionVentasDb[]
}

export async function obtenerVentasSemanalesDb() {
  const { data, error } = await supabase
    .from("com_vw_ventas_semanales")
    .select("*")
    .order("semana_inicio", { ascending: true })
    .limit(10000)

  if (error) {
    throw new Error(
      `No se pudo cargar el resumen semanal de ventas: ${error.message}`,
    )
  }

  return (data ?? []) as VentaSemanalDb[]
}

export async function importarVentasDb(datos: {
  archivoNombre: string
  lineas: LineaVentaImportar[]
}) {
  const { data, error } = await supabase.rpc("com_importar_ventas", {
    p_archivo_nombre: datos.archivoNombre,
    p_lineas: datos.lineas,
  })

  if (error) {
    throw new Error(
      `No se pudieron guardar las ventas: ${error.message}`,
    )
  }

  return data as RespuestaImportacionVentas
}
