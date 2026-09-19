import { supabase } from "../lib/supabase"

export type CategoriaMateriaPrimaDb = {
  id: string
  nombre: string
  orden: number
  activo: boolean
}

export type MateriaPrimaCostoActualDb = {
  id: string
  codigo: string
  codigo_contable: string | null
  nombre: string
  nombre_corto: string | null
  unidad_base: "KG" | "UNIDAD"
  incluir_en_costeo: boolean
  es_empaque: boolean
  activo: boolean
  categoria: string | null
  fecha_corte: string | null
  stock: number | null
  costo_total: number | null
  costo_unitario: number | null
}

export type ImportacionCostoDb = {
  id: string
  fecha_corte: string
  fecha_emision: string | null
  archivo_origen: string | null
  registros_leidos: number
  registros_importados: number
  registros_sin_costo: number
  creado_en: string
}

export type LineaCostoImportar = {
  codigoContable: string
  nombre: string
  stock: number
  costoTotal: number
}

export async function obtenerCategoriasMateriaPrimaDb() {
  const { data, error } = await supabase
    .from("categorias_materia_prima")
    .select(`
      id,
      nombre,
      orden,
      activo
    `)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar las categorías: ${error.message}`,
    )
  }

  return (data ?? []) as CategoriaMateriaPrimaDb[]
}

export async function obtenerMateriasPrimasCostoActualDb() {
  const { data, error } = await supabase
    .from("materias_primas_costo_actual")
    .select("*")
    .eq("activo", true)
    .order("nombre", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar las materias primas: ${error.message}`,
    )
  }

  return (data ?? []) as MateriaPrimaCostoActualDb[]
}

export async function obtenerImportacionesCostosDb() {
  const { data, error } = await supabase
    .from("importaciones_costos")
    .select(`
      id,
      fecha_corte,
      fecha_emision,
      archivo_origen,
      registros_leidos,
      registros_importados,
      registros_sin_costo,
      creado_en
    `)
    .order("fecha_corte", { ascending: false })
    .order("creado_en", { ascending: false })

  if (error) {
    throw new Error(
      `No se pudo cargar el historial de importaciones: ${error.message}`,
    )
  }

  return (data ?? []) as ImportacionCostoDb[]
}

export async function crearImportacionCostosDb(datos: {
  fechaCorte: string
  fechaEmision?: string
  archivoOrigen: string
  registrosLeidos: number
}) {
  if (!datos.fechaCorte) {
    throw new Error("La fecha de corte es obligatoria.")
  }

  if (!datos.archivoOrigen.trim()) {
    throw new Error("El nombre del archivo es obligatorio.")
  }

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    throw new Error("No existe una sesión válida.")
  }

  const { data, error } = await supabase
    .from("importaciones_costos")
    .upsert(
      {
        fecha_corte: datos.fechaCorte,
        fecha_emision:
          datos.fechaEmision?.trim() || null,
        archivo_origen:
          datos.archivoOrigen.trim(),
        registros_leidos:
          Math.max(
            0,
            Math.trunc(datos.registrosLeidos),
          ),
        creado_por: user.id,
      },
      {
        onConflict:
          "fecha_corte,archivo_origen",
      },
    )
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo registrar la importación: ${error.message}`,
    )
  }

  return data as ImportacionCostoDb
}

export async function importarLineaCostoMateriaPrimaDb(datos: {
  linea: LineaCostoImportar
  fechaCorte: string
  archivoOrigen: string
  importacionId: string
}) {
  const codigo =
    datos.linea.codigoContable
      .trim()
      .toUpperCase()

  const nombre =
    datos.linea.nombre
      .trim()
      .toUpperCase()

  if (!codigo) {
    throw new Error(
      "Existe una línea sin código contable.",
    )
  }

  if (!nombre) {
    throw new Error(
      `El artículo ${codigo} no tiene nombre.`,
    )
  }

  if (
    !Number.isFinite(datos.linea.stock) ||
    datos.linea.stock < 0
  ) {
    throw new Error(
      `El stock de ${codigo} no es válido.`,
    )
  }

  if (
    !Number.isFinite(datos.linea.costoTotal) ||
    datos.linea.costoTotal < 0
  ) {
    throw new Error(
      `El costo total de ${codigo} no es válido.`,
    )
  }

  const { data, error } = await supabase.rpc(
    "importar_costo_materia_prima",
    {
      p_codigo_contable: codigo,
      p_nombre: nombre,
      p_fecha_corte: datos.fechaCorte,
      p_stock: datos.linea.stock,
      p_costo_total:
        datos.linea.costoTotal,
      p_archivo_origen:
        datos.archivoOrigen,
      p_importacion_id:
        datos.importacionId,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo importar ${codigo} - ${nombre}: ${error.message}`,
    )
  }

  return data as string
}

export async function importarCostosMateriasPrimasDb(datos: {
  lineas: LineaCostoImportar[]
  fechaCorte: string
  fechaEmision?: string
  archivoOrigen: string
}) {
  if (datos.lineas.length === 0) {
    throw new Error(
      "No existen líneas para importar.",
    )
  }

  const importacion =
    await crearImportacionCostosDb({
      fechaCorte: datos.fechaCorte,
      fechaEmision: datos.fechaEmision,
      archivoOrigen: datos.archivoOrigen,
      registrosLeidos: datos.lineas.length,
    })

  let registrosImportados = 0
  let registrosSinCosto = 0

  for (const linea of datos.lineas) {
    await importarLineaCostoMateriaPrimaDb({
      linea,
      fechaCorte: datos.fechaCorte,
      archivoOrigen:
        datos.archivoOrigen,
      importacionId: importacion.id,
    })

    if (
      linea.stock > 0 &&
      linea.costoTotal > 0
    ) {
      registrosImportados += 1
    } else {
      registrosSinCosto += 1
    }
  }

  const { error } = await supabase
    .from("importaciones_costos")
    .update({
      registros_importados:
        registrosImportados,
      registros_sin_costo:
        registrosSinCosto,
    })
    .eq("id", importacion.id)

  if (error) {
    throw new Error(
      `Los costos se importaron, pero no se pudo actualizar el resumen: ${error.message}`,
    )
  }

  return {
    importacionId: importacion.id,
    registrosLeidos:
      datos.lineas.length,
    registrosImportados,
    registrosSinCosto,
  }
}

export async function actualizarMateriaPrimaDb(
  materiaPrimaId: string,
  datos: {
    categoriaId: string | null
    unidadBase: "KG" | "UNIDAD"
    incluirEnCosteo: boolean
    esEmpaque: boolean
    nombreCorto: string
    observaciones: string
  },
) {
  if (!materiaPrimaId) {
    throw new Error(
      "No se encontró la materia prima.",
    )
  }

  const { error } = await supabase
    .from("materias_primas")
    .update({
      categoria_id:
        datos.categoriaId || null,
      unidad_base:
        datos.unidadBase,
      incluir_en_costeo:
        datos.incluirEnCosteo,
      es_empaque:
        datos.esEmpaque,
      nombre_corto:
        datos.nombreCorto.trim() || null,
      observaciones:
        datos.observaciones.trim() || null,
    })
    .eq("id", materiaPrimaId)

  if (error) {
    throw new Error(
      `No se pudo actualizar la materia prima: ${error.message}`,
    )
  }
}