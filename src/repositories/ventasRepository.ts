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

export type VentaDiariaDb = {
  fecha_emision: string
  cliente_id: string | null
  cliente_nombre: string
  producto_id: string | null
  sku: string
  producto_nombre: string
  cantidad: number
  total_sin_impuestos: number
}

export type VentaDetalleDb = {
  id: string
  comprobante: string
  fecha_emision: string
  cliente_id: string | null
  cliente_nombre: string
  producto_id: string | null
  sku: string
  producto_nombre: string
  cantidad: number
  precio_unitario: number
  descuento: number
  precio_neto: number
  total_sin_impuestos: number
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

export async function obtenerVentasSemanalesRangoDb(
  fechaDesde: string,
  fechaHasta: string,
) {
  if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
    throw new Error("El rango semanal de ventas no es válido.")
  }

  const registros: VentaSemanalDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("com_vw_ventas_semanales")
      .select("*")
      .gte("semana_inicio", fechaDesde)
      .lte("semana_inicio", fechaHasta)
      .order("semana_inicio", { ascending: true })
      .order("cliente_nombre", { ascending: true })
      .order("sku", { ascending: true })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(
        `No se pudo cargar el resumen semanal de ventas del periodo: ${error.message}`,
      )
    }

    const pagina = (data ?? []) as VentaSemanalDb[]
    registros.push(...pagina)
    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

export async function obtenerVentasSemanalesDb() {
  const registros: VentaSemanalDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("com_vw_ventas_semanales")
      .select("*")
      .order("semana_inicio", { ascending: true })
      .order("cliente_nombre", { ascending: true })
      .order("sku", { ascending: true })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(
        `No se pudo cargar el resumen semanal de ventas: ${error.message}`,
      )
    }

    const pagina = (data ?? []) as VentaSemanalDb[]
    registros.push(...pagina)
    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

export async function obtenerVentasDiariasDb() {
  const registros: VentaDiariaDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("com_ventas_detalle")
      .select(
        "fecha_emision,cliente_id,cliente_nombre,producto_id,sku,producto_nombre,cantidad,total_sin_impuestos",
      )
      .order("fecha_emision", { ascending: true })
      .order("cliente_nombre", { ascending: true })
      .order("sku", { ascending: true })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(
        `No se pudo cargar el detalle diario de ventas: ${error.message}`,
      )
    }

    const pagina = (data ?? []) as VentaDiariaDb[]
    registros.push(...pagina)
    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

export async function obtenerVentasDiariasRangoDb(
  fechaDesde: string,
  fechaHasta: string,
) {
  if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
    throw new Error("El rango de ventas no es válido.")
  }

  const registros: VentaDiariaDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("com_ventas_detalle")
      .select(
        "fecha_emision,cliente_id,cliente_nombre,producto_id,sku,producto_nombre,cantidad,total_sin_impuestos",
      )
      .gte("fecha_emision", fechaDesde)
      .lte("fecha_emision", fechaHasta)
      .order("fecha_emision", { ascending: true })
      .order("cliente_nombre", { ascending: true })
      .order("sku", { ascending: true })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(
        `No se pudieron cargar las ventas del periodo: ${error.message}`,
      )
    }

    const pagina = (data ?? []) as VentaDiariaDb[]
    registros.push(...pagina)
    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

export async function obtenerVentasDetalleRangoDb(
  fechaDesde: string,
  fechaHasta: string,
) {
  if (!fechaDesde || !fechaHasta || fechaDesde > fechaHasta) {
    throw new Error("El rango de ventas no es válido.")
  }

  const registros: VentaDetalleDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("com_ventas_detalle")
      .select(
        "id,comprobante,fecha_emision,cliente_id,cliente_nombre,producto_id,sku,producto_nombre,cantidad,precio_unitario,descuento,precio_neto,total_sin_impuestos,actualizado_en",
      )
      .gte("fecha_emision", fechaDesde)
      .lte("fecha_emision", fechaHasta)
      .order("fecha_emision", { ascending: false })
      .order("comprobante", { ascending: false })
      .order("sku", { ascending: true })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(
        `No se pudo cargar el detalle real de ventas: ${error.message}`,
      )
    }

    const pagina = (data ?? []) as VentaDetalleDb[]
    registros.push(...pagina)
    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

function normalizarComprobanteBusqueda(
  valor: string,
) {
  return valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

export async function obtenerVentasDetallePorComprobantesDb(
  comprobantes: string[],
) {
  const normalizados = Array.from(
    new Set(
      comprobantes
        .map(normalizarComprobanteBusqueda)
        .filter(Boolean),
    ),
  )

  if (normalizados.length === 0) {
    return [] as VentaDetalleDb[]
  }

  const registros: VentaDetalleDb[] = []
  const tamanoLote = 100

  for (
    let i = 0;
    i < normalizados.length;
    i += tamanoLote
  ) {
    const lote =
      normalizados.slice(
        i,
        i + tamanoLote,
      )

    const { data, error } =
      await supabase.rpc(
        "com_buscar_ventas_por_comprobantes",
        {
          p_comprobantes: lote,
        },
      )

    if (error) {
      throw new Error(
        `No se pudieron buscar las facturas vinculadas: ${error.message}`,
      )
    }

    registros.push(
      ...((data ?? []) as VentaDetalleDb[]),
    )
  }

  const unicos = new Map<
    string,
    VentaDetalleDb
  >()

  registros.forEach((registro) =>
    unicos.set(
      registro.id,
      registro,
    ),
  )

  return Array.from(unicos.values())
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
