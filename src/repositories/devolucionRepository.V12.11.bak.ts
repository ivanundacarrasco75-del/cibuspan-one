import { supabase } from "../lib/supabase"

export type ClienteDevolucionDb = {
  id: string
  nombre: string
}

export type BodegaDevolucionDb = {
  id: string
  cliente_id: string
  nombre: string
}

export type ProductoDevolucionDb = {
  id: string
  codigo: string
  nombre: string
  corto: string
  vida_util_dias: number
}

export type DetalleNuevaDevolucionDb = {
  productoId: string
  unidades: number
  motivo: string
  observaciones?: string
}

export type NuevaDevolucionDb = {
  fechaDevolucion: string
  clienteId: string
  bodegaId: string | null
  origenRegistro: "MANUAL" | "DOCUMENTO"
  documentoReferencia: string
  detalles: DetalleNuevaDevolucionDb[]
}

export type DetalleDevolucionListadoDb = {
  id: string
  producto_id: string
  unidades: number
  motivo: string
  observaciones: string | null
  vida_util_dias_snapshot: number
  dias_retiro_antes_caducidad: number
  vida_efectiva_dias: number
  desfase_semanas: number
  semana_recepcion_inicio: string
  semana_origen_inicio: string
  sku_documento: string | null
  producto_nombre_documento: string | null
  precio_unitario_documento: number | null
  valor_total_documento: number | null
  producto: {
    id: string
    codigo: string
    nombre: string
    corto: string
  } | null
}

export type DevolucionListadoDb = {
  id: string
  fecha_devolucion: string
  origen_registro: "MANUAL" | "DOCUMENTO"
  documento_referencia: string | null
  fuente_documento: string | null
  archivo_origen: string | null
  codigo_local_documento: string | null
  nombre_local_documento: string | null
  estado_documento: string | null
  valor_total_documento: number | null
  creado_en: string
  cliente: {
    id: string
    nombre: string
  } | null
  bodega: {
    id: string
    nombre: string
  } | null
  detalles: DetalleDevolucionListadoDb[]
}

export type DocumentoDevolucionMasivaDb = {
  fuente: "SUPERMAXI" | "SANTAMARIA"
  archivo_origen: string
  documento_referencia: string
  fecha_devolucion: string
  cliente_id: string
  codigo_local: string
  nombre_local: string
  estado_documento: string
  observacion: string
  motivo: string
  valor_total: number
  detalles: Array<{
    sku: string
    producto_nombre: string
    unidades: number
    precio_unitario: number
    valor_total: number
  }>
}

export type RespuestaImportacionDevolucionesDb = {
  importacion_id: string
  documentos_archivo: number
  documentos_nuevos: number
  documentos_duplicados: number
  documentos_sin_sku: number
  lineas_archivo: number
  unidades_importadas: number
  valor_importado: number
  skus_no_reconocidos: string[]
}

export async function obtenerCatalogoProductosDevolucionDb() {
  const { data, error } = await supabase
    .from("productos")
    .select("id,codigo,nombre,corto,vida_util_dias")
    .order("codigo")

  if (error) {
    throw new Error(
      `No se pudo cargar el catálogo de SKU: ${error.message}`,
    )
  }

  return (data ?? []) as ProductoDevolucionDb[]
}

export async function obtenerReferenciasDevolucionesDb() {
  const { data, error } = await supabase
    .from("devoluciones")
    .select("cliente_id,documento_referencia")
    .not("documento_referencia", "is", null)

  if (error) {
    throw new Error(
      `No se pudieron consultar los documentos existentes: ${error.message}`,
    )
  }

  return (data ?? []) as Array<{
    cliente_id: string
    documento_referencia: string
  }>
}

export async function importarDevolucionesMasivasDb(datos: {
  archivos: string[]
  documentos: DocumentoDevolucionMasivaDb[]
}) {
  const { data, error } = await supabase.rpc(
    "dev_importar_devoluciones",
    {
      p_archivos: datos.archivos,
      p_documentos: datos.documentos,
    },
  )

  if (error) {
    throw new Error(
      `No se pudieron guardar las devoluciones: ${error.message}`,
    )
  }

  return data as RespuestaImportacionDevolucionesDb
}

export async function obtenerClientesDevolucionDb() {
  const { data, error } = await supabase
    .from("clientes")
    .select("id,nombre")
    .eq("activo", true)
    .order("nombre")

  if (error) {
    throw new Error(
      `No se pudieron cargar los clientes: ${error.message}`,
    )
  }

  return (data ?? []) as ClienteDevolucionDb[]
}

export async function obtenerBodegasDevolucionDb(
  clienteId: string,
) {
  if (!clienteId) return []

  const { data, error } = await supabase
    .from("bodegas")
    .select("id,cliente_id,nombre")
    .eq("cliente_id", clienteId)
    .eq("activo", true)
    .order("nombre")

  if (error) {
    throw new Error(
      `No se pudieron cargar las bodegas/locales: ${error.message}`,
    )
  }

  return (data ?? []) as BodegaDevolucionDb[]
}

export async function obtenerProductosDevolucionDb(
  clienteId: string,
) {
  if (!clienteId) return []

  const { data, error } = await supabase
    .from("cliente_productos")
    .select(`
      producto:productos!inner(
        id,
        codigo,
        nombre,
        corto,
        vida_util_dias,
        activo
      )
    `)
    .eq("cliente_id", clienteId)
    .eq("activo", true)
    .eq("producto.activo", true)

  if (error) {
    throw new Error(
      `No se pudieron cargar los SKU del cliente: ${error.message}`,
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

      return {
        id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        corto: producto.corto,
        vida_util_dias: Number(
          producto.vida_util_dias ?? 0,
        ),
      }
    })
    .filter(
      (
        producto,
      ): producto is ProductoDevolucionDb =>
        producto !== null,
    )
    .sort((a, b) =>
      a.corto.localeCompare(b.corto),
    )
}

export async function registrarDevolucionDb(
  datos: NuevaDevolucionDb,
) {
  if (!datos.fechaDevolucion) {
    throw new Error(
      "La fecha de devolución es obligatoria.",
    )
  }

  if (!datos.clienteId) {
    throw new Error("Selecciona un cliente.")
  }

  const detallesValidos = datos.detalles.filter(
    (detalle) =>
      detalle.productoId &&
      Number(detalle.unidades) > 0,
  )

  if (detallesValidos.length === 0) {
    throw new Error(
      "Ingresa al menos un SKU con unidades devueltas.",
    )
  }

  const { data, error } = await supabase.rpc(
    "registrar_devolucion_completa",
    {
      p_fecha_devolucion: datos.fechaDevolucion,
      p_cliente_id: datos.clienteId,
      p_bodega_id: datos.bodegaId || null,
      p_origen_registro: datos.origenRegistro,
      p_documento_referencia:
        datos.documentoReferencia || null,
      p_detalles: detallesValidos.map(
        (detalle) => ({
          producto_id: detalle.productoId,
          unidades: Number(detalle.unidades),
          motivo:
            detalle.motivo ||
            "VENCIMIENTO / RETIRO DE PERCHA",
          observaciones:
            detalle.observaciones || null,
        }),
      ),
    },
  )

  if (error) {
    throw new Error(
      error.message ||
        "No se pudo registrar la devolución.",
    )
  }

  return data as string
}

export async function obtenerDevolucionesDb(
  fechaDesde?: string,
  fechaHasta?: string,
) {
  const devoluciones: DevolucionListadoDb[] = []
  const tamanoPagina = 300
  let desde = 0

  while (true) {
    let consulta = supabase
      .from("devoluciones")
      .select(`
        id,
        fecha_devolucion,
        origen_registro,
        documento_referencia,
        fuente_documento,
        archivo_origen,
        codigo_local_documento,
        nombre_local_documento,
        estado_documento,
        valor_total_documento,
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
      .order("fecha_devolucion", { ascending: false })
      .order("creado_en", { ascending: false })
      .order("id", { ascending: false })

    if (fechaDesde) consulta = consulta.gte("fecha_devolucion", fechaDesde)
    if (fechaHasta) consulta = consulta.lte("fecha_devolucion", fechaHasta)

    const { data, error } = await consulta.range(
      desde,
      desde + tamanoPagina - 1,
    )

    if (error) {
      throw new Error(
        `No se pudieron cargar las devoluciones: ${error.message}`,
      )
    }

    const paginaBase = (data ?? []) as unknown as Omit<
      DevolucionListadoDb,
      "detalles"
    >[]
    const detallesPorDevolucion = new Map<
      string,
      DevolucionListadoDb["detalles"]
    >()
    const ids = paginaBase.map((item) => item.id)

    for (let indice = 0; indice < ids.length; indice += 100) {
      const bloqueIds = ids.slice(indice, indice + 100)
      const { data: detallesData, error: detallesError } = await supabase
        .from("devolucion_detalles")
        .select(`
          devolucion_id,
          id,
          producto_id,
          unidades,
          motivo,
          observaciones,
          vida_util_dias_snapshot,
          dias_retiro_antes_caducidad,
          vida_efectiva_dias,
          desfase_semanas,
          semana_recepcion_inicio,
          semana_origen_inicio,
          sku_documento,
          producto_nombre_documento,
          precio_unitario_documento,
          valor_total_documento,
          producto:productos(
            id,
            codigo,
            nombre,
            corto
          )
        `)
        .in("devolucion_id", bloqueIds)

      if (detallesError) {
        throw new Error(
          `No se pudieron cargar los detalles de devoluciones: ${detallesError.message}`,
        )
      }

      ;(
        (detallesData ?? []) as unknown as Array<
          DevolucionListadoDb["detalles"][number] & { devolucion_id: string }
        >
      ).forEach(({ devolucion_id, ...detalle }) => {
        const actuales = detallesPorDevolucion.get(devolucion_id) ?? []
        actuales.push(detalle)
        detallesPorDevolucion.set(devolucion_id, actuales)
      })
    }

    const pagina = paginaBase.map((devolucion) => ({
      ...devolucion,
      detalles: detallesPorDevolucion.get(devolucion.id) ?? [],
    })) as DevolucionListadoDb[]
    devoluciones.push(...pagina)

    if (pagina.length < tamanoPagina) break
    desde += tamanoPagina
  }

  return devoluciones.map((devolucion) => ({
    ...devolucion,
    detalles: [...(devolucion.detalles ?? [])].sort(
      (a, b) =>
        (a.producto?.corto ?? "").localeCompare(
          b.producto?.corto ?? "",
        ),
    ),
  }))
}
