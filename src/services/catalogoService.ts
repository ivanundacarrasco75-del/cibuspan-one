import { supabase } from "../lib/supabase"

export type ClienteDb = {
  id: string
  nombre: string
  activo: boolean
  creado_en: string
}

export type BodegaDb = {
  id: string
  cliente_id: string
  nombre: string
  tipo_empaque: string
  activo: boolean
  creado_en: string
}

export type ProductoDb = {
  id: string
  codigo: string
  nombre: string
  corto: string
  lote_produccion: number
  stock_seguridad: number
  vida_util_dias: number
  activo: boolean
  creado_en: string
}

export type ClienteProductoDb = {
  id: string
  cliente_id: string
  producto_id: string
  unidad_manejo: number
  precio: number | null
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export async function obtenerClientesDb() {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("nombre")

  if (error) {
    throw new Error(
      `No se pudieron cargar los clientes: ${error.message}`,
    )
  }

  return (data ?? []) as ClienteDb[]
}

export async function crearClienteDb(
  nombre: string,
) {
  const nombreLimpio = nombre.trim().toUpperCase()

  if (!nombreLimpio) {
    throw new Error(
      "El nombre del cliente es obligatorio.",
    )
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nombre: nombreLimpio,
      activo: true,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear el cliente: ${error.message}`,
    )
  }

  return data as ClienteDb
}

export async function cambiarEstadoClienteDb(
  clienteId: string,
  activo: boolean,
) {
  const { error } = await supabase
    .from("clientes")
    .update({ activo })
    .eq("id", clienteId)

  if (error) {
    throw new Error(
      `No se pudo actualizar el cliente: ${error.message}`,
    )
  }
}

export async function obtenerBodegasDb() {
  const { data, error } = await supabase
    .from("bodegas")
    .select("*")
    .order("nombre")

  if (error) {
    throw new Error(
      `No se pudieron cargar las bodegas: ${error.message}`,
    )
  }

  return (data ?? []) as BodegaDb[]
}

export async function crearBodegaDb(datos: {
  clienteId: string
  nombre: string
  tipoEmpaque: string
}) {
  const nombreLimpio =
    datos.nombre.trim().toUpperCase()

  const empaqueLimpio =
    datos.tipoEmpaque.trim().toUpperCase()

  if (!datos.clienteId) {
    throw new Error(
      "Selecciona un cliente.",
    )
  }

  if (!nombreLimpio) {
    throw new Error(
      "El nombre de la bodega es obligatorio.",
    )
  }

  if (!empaqueLimpio) {
    throw new Error(
      "El tipo de empaque es obligatorio.",
    )
  }

  const { data, error } = await supabase
    .from("bodegas")
    .insert({
      cliente_id: datos.clienteId,
      nombre: nombreLimpio,
      tipo_empaque: empaqueLimpio,
      activo: true,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear la bodega: ${error.message}`,
    )
  }

  return data as BodegaDb
}

export async function cambiarEstadoBodegaDb(
  bodegaId: string,
  activo: boolean,
) {
  const { error } = await supabase
    .from("bodegas")
    .update({ activo })
    .eq("id", bodegaId)

  if (error) {
    throw new Error(
      `No se pudo actualizar la bodega: ${error.message}`,
    )
  }
}

export async function obtenerProductosDb() {
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .order("corto")

  if (error) {
    throw new Error(
      `No se pudieron cargar los productos: ${error.message}`,
    )
  }

  return (data ?? []) as ProductoDb[]
}

export async function crearProductoDb(datos: {
  codigo: string
  nombre: string
  corto: string
  loteProduccion: number
  stockSeguridad: number
  vidaUtilDias: number
}) {
  const codigoLimpio = datos.codigo.trim()
  const nombreLimpio =
    datos.nombre.trim().toUpperCase()
  const cortoLimpio =
    datos.corto.trim().toUpperCase()

  if (!codigoLimpio) {
    throw new Error(
      "El código del producto es obligatorio.",
    )
  }

  if (!nombreLimpio) {
    throw new Error(
      "El nombre del producto es obligatorio.",
    )
  }

  if (!cortoLimpio) {
    throw new Error(
      "El nombre corto es obligatorio.",
    )
  }

  if (datos.loteProduccion <= 0) {
    throw new Error(
      "El tamaño del lote debe ser mayor que cero.",
    )
  }

  if (datos.vidaUtilDias <= 0) {
    throw new Error(
      "La vida útil debe ser mayor que cero.",
    )
  }

  const { data, error } = await supabase
    .from("productos")
    .insert({
      codigo: codigoLimpio,
      nombre: nombreLimpio,
      corto: cortoLimpio,
      lote_produccion: datos.loteProduccion,
      stock_seguridad: Math.max(
        0,
        datos.stockSeguridad,
      ),
      vida_util_dias: datos.vidaUtilDias,
      activo: true,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear el producto: ${error.message}`,
    )
  }

  return data as ProductoDb
}

export async function cambiarEstadoProductoDb(
  productoId: string,
  activo: boolean,
) {
  const { error } = await supabase
    .from("productos")
    .update({ activo })
    .eq("id", productoId)

  if (error) {
    throw new Error(
      `No se pudo actualizar el producto: ${error.message}`,
    )
  }
}

export async function obtenerClienteProductosDb() {
  const { data, error } = await supabase
    .from("cliente_productos")
    .select("*")

  if (error) {
    throw new Error(
      `No se pudieron cargar las asignaciones: ${error.message}`,
    )
  }

  return (data ?? []) as ClienteProductoDb[]
}

export async function asignarProductoClienteDb(datos: {
  clienteId: string
  productoId: string
  unidadManejo: number
  precio?: number | null
}) {
  if (!datos.clienteId) {
    throw new Error(
      "Selecciona un cliente.",
    )
  }

  if (!datos.productoId) {
    throw new Error(
      "Selecciona un producto.",
    )
  }

  if (datos.unidadManejo <= 0) {
    throw new Error(
      "La unidad de manejo debe ser mayor que cero.",
    )
  }

  const { data, error } = await supabase
    .from("cliente_productos")
    .upsert(
      {
        cliente_id: datos.clienteId,
        producto_id: datos.productoId,
        unidad_manejo: datos.unidadManejo,
        precio: datos.precio ?? null,
        activo: true,
        actualizado_en:
          new Date().toISOString(),
      },
      {
        onConflict:
          "cliente_id,producto_id",
      },
    )
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo asignar el producto: ${error.message}`,
    )
  }

  return data as ClienteProductoDb
}

export async function cambiarEstadoClienteProductoDb(
  asignacionId: string,
  activo: boolean,
) {
  const { error } = await supabase
    .from("cliente_productos")
    .update({
      activo,
      actualizado_en:
        new Date().toISOString(),
    })
    .eq("id", asignacionId)

  if (error) {
    throw new Error(
      `No se pudo actualizar la asignación: ${error.message}`,
    )
  }
}