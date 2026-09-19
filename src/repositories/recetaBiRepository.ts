import { supabase } from "../lib/supabase"

export type TipoRecetaBi =
  | "PRODUCTO_TERMINADO"
  | "MICRO"

export type EstadoVersionRecetaBi =
  | "BORRADOR"
  | "VIGENTE"
  | "OBSOLETA"

export type RecetaBiDb = {
  id: string
  codigo: string
  nombre: string
  tipo: TipoRecetaBi
  descripcion: string | null
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export type VersionRecetaBiDb = {
  id: string
  receta_id: string
  numero_version: number
  estado: EstadoVersionRecetaBi
  vigente_desde: string | null
  vigente_hasta: string | null
  panes_por_batch: number | null
  peso_bola_g: number | null
  peso_final_g: number | null
  peso_batch_kg: number | null
  rendimiento_unidades: number | null
  merma_porcentaje: number
  observaciones: string | null
  creado_en: string
  actualizado_en: string
}

export type MateriaPrimaRecetaDb = {
  id: string
  codigo: string
  nombre: string
  nombre_corto: string | null
  unidad_base: string
  incluir_en_costeo: boolean
}

export type ComponenteRecetaBiDb = {
  id: string
  receta_version_id: string
  tipo_componente:
    | "MATERIA_PRIMA"
    | "MICRO"
  materia_prima_id: string | null
  micro_receta_id: string | null
  porcentaje_panadero: number | null
  porcentaje_composicion: number | null
  es_harina_base: boolean
  incluir_en_costeo: boolean
  orden: number
  observaciones: string | null
  materia_prima:
    | MateriaPrimaRecetaDb
    | null
  micro:
    | {
        id: string
        codigo: string
        nombre: string
      }
    | null
}

export type FormulaProductoBiDb = {
  receta_id: string
  receta_version_id: string
  receta_codigo: string
  receta_nombre: string
  numero_version: number
  panes_por_batch: number | null
  peso_bola_g: number | null
  peso_final_g: number | null
  batch_calculado_kg: number | null
  rendimiento_unidades: number | null
  merma_porcentaje: number
  componente_id: string
  tipo_componente:
    | "MATERIA_PRIMA"
    | "MICRO"
  materia_prima_id: string | null
  micro_receta_id: string | null
  es_harina_base: boolean
  incluir_en_costeo: boolean
  orden: number
  componente_nombre: string
  porcentaje_panadero: number
  total_porcentaje_panadero: number
  porcentaje_real: number
  cantidad_batch_kg: number | null
}

export type RecetaCostoBiDb = {
  receta_id: string
  receta_version_id: string
  receta_codigo: string
  receta_nombre: string
  numero_version: number
  batch_calculado_kg: number | null
  panes_por_batch: number | null
  rendimiento_unidades: number | null
  peso_final_g: number | null
  merma_porcentaje: number
  costo_materia_prima_batch: number
  costo_materia_prima_kg: number | null
  costo_materia_prima_unidad: number | null
  componentes_sin_costo: number
}

export async function obtenerRecetasBiDb() {
  const { data, error } = await supabase
    .from("bi_recetas")
    .select(`
      id,
      codigo,
      nombre,
      tipo,
      descripcion,
      activo,
      creado_en,
      actualizado_en
    `)
    .eq("activo", true)
    .order("tipo", { ascending: true })
    .order("nombre", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar las recetas: ${error.message}`,
    )
  }

  return (data ?? []) as RecetaBiDb[]
}

export async function crearRecetaBiDb(datos: {
  codigo: string
  nombre: string
  tipo: TipoRecetaBi
  descripcion?: string
}) {
  const codigo = datos.codigo
    .trim()
    .toUpperCase()

  const nombre = datos.nombre
    .trim()
    .toUpperCase()

  if (!codigo) {
    throw new Error(
      "El código de la receta es obligatorio.",
    )
  }

  if (!nombre) {
    throw new Error(
      "El nombre de la receta es obligatorio.",
    )
  }

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    throw new Error(
      "No existe una sesión válida.",
    )
  }

  const { data, error } = await supabase
    .from("bi_recetas")
    .insert({
      codigo,
      nombre,
      tipo: datos.tipo,
      descripcion:
        datos.descripcion?.trim() || null,
      activo: true,
      creado_por: user.id,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear la receta: ${error.message}`,
    )
  }

  return data as RecetaBiDb
}

export async function obtenerVersionesRecetaBiDb(
  recetaId: string,
) {
  if (!recetaId) return []

  const { data, error } = await supabase
    .from("bi_receta_versiones")
    .select("*")
    .eq("receta_id", recetaId)
    .order("numero_version", {
      ascending: false,
    })

  if (error) {
    throw new Error(
      `No se pudieron cargar las versiones: ${error.message}`,
    )
  }

  return (data ?? []) as VersionRecetaBiDb[]
}

export async function crearVersionRecetaBiDb(datos: {
  recetaId: string
  panesPorBatch?: number | null
  pesoBolaG?: number | null
  pesoFinalG?: number | null
  pesoBatchKg?: number | null
  rendimientoUnidades?: number | null
  mermaPorcentaje?: number
  observaciones?: string
}) {
  if (!datos.recetaId) {
    throw new Error(
      "No se encontró la receta.",
    )
  }

  const versiones =
    await obtenerVersionesRecetaBiDb(
      datos.recetaId,
    )

  const siguienteVersion =
    versiones.length === 0
      ? 1
      : Math.max(
          ...versiones.map(
            (version) =>
              version.numero_version,
          ),
        ) + 1

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    throw new Error(
      "No existe una sesión válida.",
    )
  }

  const { data, error } = await supabase
    .from("bi_receta_versiones")
    .insert({
      receta_id: datos.recetaId,
      numero_version:
        siguienteVersion,
      estado: "BORRADOR",
      panes_por_batch:
        datos.panesPorBatch ?? null,
      peso_bola_g:
        datos.pesoBolaG ?? null,
      peso_final_g:
        datos.pesoFinalG ?? null,
      peso_batch_kg:
        datos.pesoBatchKg ?? null,
      rendimiento_unidades:
        datos.rendimientoUnidades ?? null,
      merma_porcentaje:
        datos.mermaPorcentaje ?? 0,
      observaciones:
        datos.observaciones?.trim() || null,
      creado_por: user.id,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear la versión: ${error.message}`,
    )
  }

  return data as VersionRecetaBiDb
}

export async function obtenerMateriasPrimasRecetaBiDb() {
  const { data, error } = await supabase
    .from("materias_primas")
    .select(`
      id,
      codigo,
      nombre,
      nombre_corto,
      unidad_base,
      incluir_en_costeo
    `)
    .eq("activo", true)
    .order("nombre", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar las materias primas: ${error.message}`,
    )
  }

  return (data ?? []) as MateriaPrimaRecetaDb[]
}

export async function obtenerMicrosBiDb() {
  const { data, error } = await supabase
    .from("bi_recetas")
    .select(`
      id,
      codigo,
      nombre,
      tipo,
      descripcion,
      activo,
      creado_en,
      actualizado_en
    `)
    .eq("tipo", "MICRO")
    .eq("activo", true)
    .order("nombre", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar los micros: ${error.message}`,
    )
  }

  return (data ?? []) as RecetaBiDb[]
}

export async function obtenerComponentesVersionBiDb(
  versionId: string,
) {
  if (!versionId) return []

  const { data, error } = await supabase
    .from("bi_receta_componentes")
    .select(`
      id,
      receta_version_id,
      tipo_componente,
      materia_prima_id,
      micro_receta_id,
      porcentaje_panadero,
      porcentaje_composicion,
      es_harina_base,
      incluir_en_costeo,
      orden,
      observaciones,
      materia_prima:materias_primas(
        id,
        codigo,
        nombre,
        nombre_corto,
        unidad_base,
        incluir_en_costeo
      ),
      micro:bi_recetas(
        id,
        codigo,
        nombre
      )
    `)
    .eq("receta_version_id", versionId)
    .order("orden", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar los componentes: ${error.message}`,
    )
  }

  return (
    data ?? []
  ) as unknown as ComponenteRecetaBiDb[]
}

export async function agregarComponenteBiDb(datos: {
  recetaVersionId: string
  tipoComponente:
    | "MATERIA_PRIMA"
    | "MICRO"
  materiaPrimaId?: string | null
  microRecetaId?: string | null
  porcentajePanadero?: number | null
  porcentajeComposicion?: number | null
  esHarinaBase?: boolean
  incluirEnCosteo?: boolean
  orden: number
  observaciones?: string
}) {
  if (!datos.recetaVersionId) {
    throw new Error(
      "No se encontró la versión de receta.",
    )
  }

  const { data, error } = await supabase
    .from("bi_receta_componentes")
    .insert({
      receta_version_id:
        datos.recetaVersionId,
      tipo_componente:
        datos.tipoComponente,
      materia_prima_id:
        datos.tipoComponente ===
        "MATERIA_PRIMA"
          ? datos.materiaPrimaId
          : null,
      micro_receta_id:
        datos.tipoComponente === "MICRO"
          ? datos.microRecetaId
          : null,
      porcentaje_panadero:
        datos.porcentajePanadero ?? null,
      porcentaje_composicion:
        datos.porcentajeComposicion ?? null,
      es_harina_base:
        datos.esHarinaBase ?? false,
      incluir_en_costeo:
        datos.incluirEnCosteo ?? true,
      orden: datos.orden,
      observaciones:
        datos.observaciones?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo agregar el componente: ${error.message}`,
    )
  }

  return data
}

export async function actualizarComponenteBiDb(
  componenteId: string,
  datos: {
    porcentajePanadero?: number | null
    porcentajeComposicion?: number | null
    esHarinaBase?: boolean
    incluirEnCosteo?: boolean
    orden?: number
    observaciones?: string
  },
) {
  const { error } = await supabase
    .from("bi_receta_componentes")
    .update({
      porcentaje_panadero:
        datos.porcentajePanadero,
      porcentaje_composicion:
        datos.porcentajeComposicion,
      es_harina_base:
        datos.esHarinaBase,
      incluir_en_costeo:
        datos.incluirEnCosteo,
      orden: datos.orden,
      observaciones:
        datos.observaciones?.trim() || null,
    })
    .eq("id", componenteId)

  if (error) {
    throw new Error(
      `No se pudo actualizar el componente: ${error.message}`,
    )
  }
}

export async function eliminarComponenteBiDb(
  componenteId: string,
) {
  const { error } = await supabase
    .from("bi_receta_componentes")
    .delete()
    .eq("id", componenteId)

  if (error) {
    throw new Error(
      `No se pudo eliminar el componente: ${error.message}`,
    )
  }
}

export async function activarVersionRecetaBiDb(
  versionId: string,
) {
  const { data, error } = await supabase.rpc(
    "bi_activar_version_receta",
    {
      p_receta_version_id: versionId,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo activar la versión: ${error.message}`,
    )
  }

  return data as string
}

export async function obtenerFormulaProductoBiDb(
  versionId: string,
) {
  if (!versionId) return []

  const { data, error } = await supabase
    .from("bi_vw_formula_producto")
    .select("*")
    .eq("receta_version_id", versionId)
    .order("orden", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudo calcular la fórmula: ${error.message}`,
    )
  }

  return (data ?? []) as FormulaProductoBiDb[]
}

export async function obtenerCostoRecetaBiDb(
  versionId: string,
) {
  if (!versionId) return null

  const { data, error } = await supabase
    .from("bi_vw_recetas_costo_actual")
    .select("*")
    .eq("receta_version_id", versionId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `No se pudo calcular el costo: ${error.message}`,
    )
  }

  return data as RecetaCostoBiDb | null
}