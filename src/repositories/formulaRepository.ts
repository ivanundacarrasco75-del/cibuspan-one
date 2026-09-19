import { supabase } from "../lib/supabase"

export type FormulaFmDb = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export type MicroFmDb = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export type FormulaVersionFmDb = {
  id: string
  formula_id: string
  numero_version: number
  estado: "BORRADOR" | "VIGENTE" | "OBSOLETA"
  vigente_desde: string | null
  vigente_hasta: string | null
  panes_por_batch: number | null
  peso_bola_g: number | null
  peso_final_g: number | null
  peso_batch_kg: number | null
  rendimiento_unidades: number | null
  paradas_por_batch: number
  merma_porcentaje: number
  observaciones: string | null
  creado_en: string
  actualizado_en: string
}

export type MateriaPrimaFmDb = {
  id: string
  codigo: string
  nombre: string
  nombre_corto: string | null
  unidad_base: string
  incluir_en_costeo: boolean
}

export type PreformulacionComponenteFmDb = {
  id: string
  formula_version_id: string
  materia_prima_id: string
  porcentaje_panadero: number
  destino_tipo: "DIRECTO" | "MICRO"
  micro_id: string | null
  es_harina_base: boolean
  incluir_en_costeo: boolean
  orden: number
  observaciones: string | null
  materia_prima: MateriaPrimaFmDb | null
  micro: {
    id: string
    codigo: string
    nombre: string
  } | null
}

export type PreformulacionCalculadaFmDb = {
  formula_id: string
  formula_codigo: string
  formula_nombre: string
  formula_version_id: string
  numero_version: number
  estado: "BORRADOR" | "VIGENTE" | "OBSOLETA"
  batch_calculado_kg: number | null
  componente_id: string
  materia_prima_id: string
  materia_codigo: string
  materia_nombre: string
  unidad_base: string
  porcentaje_panadero: number
  total_porcentaje_panadero: number
  porcentaje_real: number
  cantidad_batch_kg: number | null
  destino_tipo: "DIRECTO" | "MICRO"
  micro_id: string | null
  micro_codigo: string | null
  micro_nombre: string | null
  es_harina_base: boolean
  incluir_en_costeo: boolean
  orden: number
  observaciones: string | null
}

export type FormulaFinalFmDb = {
  formula_id: string
  formula_codigo: string
  formula_nombre: string
  formula_version_id: string
  numero_version: number
  estado: "BORRADOR" | "VIGENTE" | "OBSOLETA"
  batch_calculado_kg: number | null
  tipo_componente: "MATERIA_PRIMA" | "MICRO"
  materia_prima_id: string | null
  micro_id: string | null
  componente_codigo: string
  componente_nombre: string
  porcentaje_panadero: number
  cantidad_batch_kg: number | null
  es_harina_base: boolean
  incluir_en_costeo: boolean
  orden: number
}

export type RecetaMicroFmDb = {
  formula_id: string
  formula_codigo: string
  formula_nombre: string
  formula_version_id: string
  numero_version: number
  estado: "BORRADOR" | "VIGENTE" | "OBSOLETA"
  micro_id: string
  micro_codigo: string
  micro_nombre: string
  materia_prima_id: string
  materia_codigo: string
  materia_nombre: string
  porcentaje_panadero_ingrediente: number
  porcentaje_panadero_micro: number
  porcentaje_composicion_micro: number
  incluir_en_costeo: boolean
  orden: number
}

export type MicroVersionFmDb = {
  formula_id: string
  formula_codigo: string
  formula_nombre: string
  formula_version_id: string
  numero_version: number
  estado: "BORRADOR" | "VIGENTE" | "OBSOLETA"
  micro_id: string
  micro_codigo: string
  micro_nombre: string
}

export type ComponenteCosteadoFmDb = {
  formula_id: string
  formula_codigo: string
  formula_nombre: string
  formula_version_id: string
  numero_version: number
  estado: "BORRADOR" | "VIGENTE" | "OBSOLETA"
  batch_calculado_kg: number | null
  componente_id: string
  materia_prima_id: string
  materia_codigo: string
  materia_nombre: string
  unidad_base: string
  porcentaje_panadero: number
  total_porcentaje_panadero: number
  porcentaje_real: number
  cantidad_batch_kg: number | null
  destino_tipo: "DIRECTO" | "MICRO"
  micro_id: string | null
  micro_codigo: string | null
  micro_nombre: string | null
  es_harina_base: boolean
  incluir_en_costeo: boolean
  orden: number
  observaciones: string | null
  fecha_costo: string | null
  costo_unitario: number | null
  costo_componente_batch: number | null
  costo_incompleto: boolean
}

export type CostoFormulaFmDb = {
  formula_id: string
  formula_codigo: string
  formula_nombre: string
  formula_version_id: string
  numero_version: number
  estado: "BORRADOR" | "VIGENTE" | "OBSOLETA"
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

export type CostoProductoCompletoFmDb = {
  producto_id: string
  producto_codigo: string
  producto_nombre: string
  formula_id: string
  formula_codigo: string
  formula_nombre: string
  formula_version_id: string
  numero_version: number
  batch_calculado_kg: number | null
  panes_por_batch: number | null
  rendimiento_unidades: number | null
  costo_materia_prima_batch: number
  costo_materia_prima_kg: number | null
  costo_materia_prima_unidad: number | null
  costo_empaque_unidad: number
  costo_materiales_unidad: number
  costo_materiales_batch: number
  items_sin_costo: number
}

export type EmpaqueProductoFmDb = {
  producto_id: string
  producto_codigo: string
  producto_nombre: string
  materia_prima_id: string
  materia_codigo: string
  materia_nombre: string
  cantidad_por_unidad: number
  precio_empaque: number | null
  costo_empaque_unidad: number
  fecha_costo: string | null
  costo_incompleto: boolean
}

export async function obtenerFormulasFmDb() {
  const { data, error } = await supabase
    .from("fm_formulas")
    .select(`
      id,
      codigo,
      nombre,
      descripcion,
      activo,
      creado_en,
      actualizado_en
    `)
    .eq("activo", true)
    .order("nombre", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar las fórmulas: ${error.message}`,
    )
  }

  return (data ?? []) as FormulaFmDb[]
}

export async function crearFormulaFmDb(datos: {
  codigo: string
  nombre: string
  descripcion?: string
}) {
  const codigo = datos.codigo.trim().toUpperCase()
  const nombre = datos.nombre.trim().toUpperCase()

  if (!codigo) {
    throw new Error("El código de la fórmula es obligatorio.")
  }

  if (!nombre) {
    throw new Error("El nombre de la fórmula es obligatorio.")
  }

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    throw new Error("No existe una sesión válida.")
  }

  const { data, error } = await supabase
    .from("fm_formulas")
    .insert({
      codigo,
      nombre,
      descripcion: datos.descripcion?.trim() || null,
      activo: true,
      creado_por: user.id,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear la fórmula: ${error.message}`,
    )
  }

  return data as FormulaFmDb
}

export async function obtenerMicrosFmDb() {
  const { data, error } = await supabase
    .from("fm_micros")
    .select(`
      id,
      codigo,
      nombre,
      descripcion,
      activo,
      creado_en,
      actualizado_en
    `)
    .eq("activo", true)
    .order("nombre", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar los micros: ${error.message}`,
    )
  }

  return (data ?? []) as MicroFmDb[]
}

export async function crearMicroFmDb(datos: {
  codigo: string
  nombre: string
  descripcion?: string
}) {
  const codigo = datos.codigo.trim().toUpperCase()
  const nombre = datos.nombre.trim().toUpperCase()

  if (!codigo) {
    throw new Error("El código del micro es obligatorio.")
  }

  if (!nombre) {
    throw new Error("El nombre del micro es obligatorio.")
  }

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    throw new Error("No existe una sesión válida.")
  }

  const { data, error } = await supabase
    .from("fm_micros")
    .insert({
      codigo,
      nombre,
      descripcion: datos.descripcion?.trim() || null,
      activo: true,
      creado_por: user.id,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear el micro: ${error.message}`,
    )
  }

  return data as MicroFmDb
}

export async function obtenerVersionesFormulaFmDb(
  formulaId: string,
) {
  if (!formulaId) return []

  const { data, error } = await supabase
    .from("fm_formula_versiones")
    .select("*")
    .eq("formula_id", formulaId)
    .order("numero_version", { ascending: false })

  if (error) {
    throw new Error(
      `No se pudieron cargar las versiones: ${error.message}`,
    )
  }

  return (data ?? []) as FormulaVersionFmDb[]
}

export async function crearVersionFormulaFmDb(datos: {
  formulaId: string
  versionOrigenId?: string | null
  panesPorBatch?: number | null
  pesoBolaG?: number | null
  pesoFinalG?: number | null
  pesoBatchKg?: number | null
  rendimientoUnidades?: number | null
  paradasPorBatch?: number | null
  mermaPorcentaje?: number
  observaciones?: string
}) {
  if (!datos.formulaId) {
    throw new Error("No se encontró la fórmula.")
  }

  const versiones = await obtenerVersionesFormulaFmDb(
    datos.formulaId,
  )

  const siguienteVersion =
    versiones.length === 0
      ? 1
      : Math.max(
          ...versiones.map((version) => version.numero_version),
        ) + 1

  if (versiones.length > 0) {
    const versionOrigenId =
      datos.versionOrigenId ??
      versiones.find(
        (version) => version.estado === "VIGENTE",
      )?.id ??
      versiones[0].id

    const nuevaVersionId =
      await crearReformulacionFmDb(versionOrigenId)

    const cambios: Record<string, unknown> = {}

    if (datos.panesPorBatch != null) {
      cambios.panes_por_batch = datos.panesPorBatch
    }
    if (datos.pesoBolaG != null) {
      cambios.peso_bola_g = datos.pesoBolaG
    }
    if (datos.pesoFinalG != null) {
      cambios.peso_final_g = datos.pesoFinalG
    }
    if (datos.pesoBatchKg != null) {
      cambios.peso_batch_kg = datos.pesoBatchKg
    }
    if (datos.rendimientoUnidades != null) {
      cambios.rendimiento_unidades =
        datos.rendimientoUnidades
    }
    if (datos.paradasPorBatch != null) {
      cambios.paradas_por_batch = datos.paradasPorBatch
    }
    if (datos.mermaPorcentaje != null) {
      cambios.merma_porcentaje =
        datos.mermaPorcentaje
    }
    if (datos.observaciones?.trim()) {
      cambios.observaciones = datos.observaciones.trim()
    }

    const { data, error } = await supabase
      .from("fm_formula_versiones")
      .update(cambios)
      .eq("id", nuevaVersionId)
      .select()
      .single()

    if (error) {
      throw new Error(
        `La versión se creó, pero no se pudieron actualizar sus datos: ${error.message}`,
      )
    }

    return data as FormulaVersionFmDb
  }

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    throw new Error("No existe una sesión válida.")
  }

  const { data, error } = await supabase
    .from("fm_formula_versiones")
    .insert({
      formula_id: datos.formulaId,
      numero_version: siguienteVersion,
      estado: "BORRADOR",
      panes_por_batch: datos.panesPorBatch ?? null,
      peso_bola_g: datos.pesoBolaG ?? null,
      peso_final_g: datos.pesoFinalG ?? null,
      peso_batch_kg: datos.pesoBatchKg ?? null,
      rendimiento_unidades: datos.rendimientoUnidades ?? null,
      paradas_por_batch: datos.paradasPorBatch ?? 1,
      merma_porcentaje: datos.mermaPorcentaje ?? 0,
      observaciones: datos.observaciones?.trim() || null,
      creado_por: user.id,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `No se pudo crear la versión: ${error.message}`,
    )
  }

  return data as FormulaVersionFmDb
}

export async function crearReformulacionFmDb(
  formulaVersionId: string,
) {
  const { data, error } = await supabase.rpc(
    "fm_crear_reformulacion",
    {
      p_formula_version_id: formulaVersionId,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo crear la reformulación: ${error.message}`,
    )
  }

  return data as string
}

export async function eliminarVersionBorradorFmDb(
  formulaVersionId: string,
) {
  const { data, error } = await supabase.rpc(
    "fm_eliminar_version_borrador",
    {
      p_formula_version_id: formulaVersionId,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo eliminar la versión: ${error.message}`,
    )
  }

  return data as string
}

export async function obtenerMateriasPrimasFmDb() {
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

  return (data ?? []) as MateriaPrimaFmDb[]
}

export async function obtenerComponentesFmDb(
  formulaVersionId: string,
) {
  if (!formulaVersionId) return []

  const { data, error } = await supabase
    .from("fm_preformulacion_componentes")
    .select(`
      id,
      formula_version_id,
      materia_prima_id,
      porcentaje_panadero,
      destino_tipo,
      micro_id,
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
      micro:fm_micros(
        id,
        codigo,
        nombre
      )
    `)
    .eq("formula_version_id", formulaVersionId)
    .order("orden", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar los componentes: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as PreformulacionComponenteFmDb[]
}

export async function agregarComponenteFmDb(datos: {
  formulaVersionId: string
  materiaPrimaId: string
  porcentajePanadero: number
  destinoTipo: "DIRECTO" | "MICRO"
  microId?: string | null
  esHarinaBase?: boolean
  incluirEnCosteo?: boolean
  orden: number
  observaciones?: string
}) {
  if (!datos.formulaVersionId) {
    throw new Error("No se encontró la versión de fórmula.")
  }

  if (!datos.materiaPrimaId) {
    throw new Error("Selecciona una materia prima.")
  }

  if (
    !Number.isFinite(datos.porcentajePanadero) ||
    datos.porcentajePanadero < 0
  ) {
    throw new Error("El porcentaje panadero no es válido.")
  }

  if (datos.destinoTipo === "MICRO" && !datos.microId) {
    throw new Error("Selecciona el micro de destino.")
  }

  const { data, error } = await supabase
    .from("fm_preformulacion_componentes")
    .insert({
      formula_version_id: datos.formulaVersionId,
      materia_prima_id: datos.materiaPrimaId,
      porcentaje_panadero: datos.porcentajePanadero,
      destino_tipo: datos.destinoTipo,
      micro_id:
        datos.destinoTipo === "MICRO" ? datos.microId : null,
      es_harina_base: datos.esHarinaBase ?? false,
      incluir_en_costeo: datos.incluirEnCosteo ?? true,
      orden: datos.orden,
      observaciones: datos.observaciones?.trim() || null,
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

export async function actualizarComponenteFmDb(
  componenteId: string,
  datos: {
    materiaPrimaId: string
    porcentajePanadero: number
    destinoTipo: "DIRECTO" | "MICRO"
    microId?: string | null
    esHarinaBase: boolean
    incluirEnCosteo: boolean
    orden: number
    observaciones?: string
  },
) {
  const { error } = await supabase
    .from("fm_preformulacion_componentes")
    .update({
      materia_prima_id: datos.materiaPrimaId,
      porcentaje_panadero: datos.porcentajePanadero,
      destino_tipo: datos.destinoTipo,
      micro_id:
        datos.destinoTipo === "MICRO" ? datos.microId : null,
      es_harina_base: datos.esHarinaBase,
      incluir_en_costeo: datos.incluirEnCosteo,
      orden: datos.orden,
      observaciones: datos.observaciones?.trim() || null,
    })
    .eq("id", componenteId)

  if (error) {
    throw new Error(
      `No se pudo actualizar el componente: ${error.message}`,
    )
  }
}

export async function eliminarComponenteFmDb(
  componenteId: string,
) {
  const { error } = await supabase
    .from("fm_preformulacion_componentes")
    .delete()
    .eq("id", componenteId)

  if (error) {
    throw new Error(
      `No se pudo eliminar el componente: ${error.message}`,
    )
  }
}

export async function activarVersionFmDb(
  formulaVersionId: string,
) {
  const { data, error } = await supabase.rpc(
    "fm_activar_version",
    {
      p_formula_version_id: formulaVersionId,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo activar la versión: ${error.message}`,
    )
  }

  return data as string
}

export async function obtenerPreformulacionCalculadaFmDb(
  formulaVersionId: string,
) {
  if (!formulaVersionId) return []

  const { data, error } = await supabase
    .from("fm_vw_preformulacion_calculada")
    .select("*")
    .eq("formula_version_id", formulaVersionId)
    .order("orden", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudo calcular la preformulación: ${error.message}`,
    )
  }

  return (data ?? []) as PreformulacionCalculadaFmDb[]
}

export async function obtenerComponentesCosteadosFmDb(
  formulaVersionId: string,
) {
  if (!formulaVersionId) return []

  const { data, error } = await supabase
    .from("fm_vw_componentes_costeados")
    .select("*")
    .eq("formula_version_id", formulaVersionId)
    .order("orden", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron cargar los costos de la fórmula: ${error.message}`,
    )
  }

  return (data ?? []) as ComponenteCosteadoFmDb[]
}

export async function obtenerFormulaFinalFmDb(
  formulaVersionId: string,
) {
  if (!formulaVersionId) return []

  const { data, error } = await supabase
    .from("fm_vw_formula_final")
    .select("*")
    .eq("formula_version_id", formulaVersionId)
    .order("orden", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudo calcular la fórmula final: ${error.message}`,
    )
  }

  return (data ?? []) as FormulaFinalFmDb[]
}

export async function obtenerRecetasMicroFmDb(
  formulaVersionId: string,
) {
  if (!formulaVersionId) return []

  const { data, error } = await supabase
    .from("fm_vw_recetas_micro")
    .select("*")
    .eq("formula_version_id", formulaVersionId)
    .order("micro_nombre", { ascending: true })
    .order("orden", { ascending: true })

  if (error) {
    throw new Error(
      `No se pudieron calcular los micros: ${error.message}`,
    )
  }

  return (data ?? []) as RecetaMicroFmDb[]
}

export async function obtenerVersionesMicroFmDb(
  microId: string,
) {
  if (!microId) return []

  const { data, error } = await supabase
    .from("fm_vw_recetas_micro")
    .select(`
      formula_id,
      formula_codigo,
      formula_nombre,
      formula_version_id,
      numero_version,
      estado,
      micro_id,
      micro_codigo,
      micro_nombre
    `)
    .eq("micro_id", microId)
    .order("numero_version", { ascending: false })

  if (error) {
    throw new Error(
      `No se pudieron cargar las versiones del micro: ${error.message}`,
    )
  }

  const versionesUnicas = new Map<
    string,
    MicroVersionFmDb
  >()

  for (const fila of data ?? []) {
    const version = fila as MicroVersionFmDb
    versionesUnicas.set(
      version.formula_version_id,
      version,
    )
  }

  return Array.from(versionesUnicas.values()).sort(
    (a, b) => b.numero_version - a.numero_version,
  )
}

export async function obtenerCostoFormulaFmDb(
  formulaVersionId: string,
) {
  if (!formulaVersionId) return null

  const { data, error } = await supabase
    .from("fm_vw_costos_formula")
    .select("*")
    .eq("formula_version_id", formulaVersionId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `No se pudo calcular el costo: ${error.message}`,
    )
  }

  return data as CostoFormulaFmDb | null
}

export async function obtenerCostosProductoCompletosFmDb(
  formulaVersionId: string,
) {
  if (!formulaVersionId) return []

  const { data, error } = await supabase
    .rpc("fm_obtener_costos_producto_version", {
      p_formula_version_id: formulaVersionId,
    })

  if (error) {
    throw new Error(
      `No se pudo calcular el costo completo del producto: ${error.message}`,
    )
  }

  return (data ?? []) as CostoProductoCompletoFmDb[]
}

export async function obtenerEmpaquesFormulaVersionFmDb(
  formulaVersionId: string,
) {
  if (!formulaVersionId) return []

  const { data, error } = await supabase.rpc(
    "fm_obtener_empaques_formula_version",
    {
      p_formula_version_id: formulaVersionId,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo cargar el detalle de empaques: ${error.message}`,
    )
  }

  return (data ?? []) as EmpaqueProductoFmDb[]
}

export async function obtenerResumenFormulaFmDb(
  formulaVersionId: string,
) {
  const [
    preformulacion,
    formulaFinal,
    recetasMicro,
    costo,
    costosProducto,
    empaquesProducto,
  ] =
    await Promise.all([
      obtenerPreformulacionCalculadaFmDb(formulaVersionId),
      obtenerFormulaFinalFmDb(formulaVersionId),
      obtenerRecetasMicroFmDb(formulaVersionId),
      obtenerCostoFormulaFmDb(formulaVersionId),
      obtenerCostosProductoCompletosFmDb(formulaVersionId),
      obtenerEmpaquesFormulaVersionFmDb(formulaVersionId),
    ])

  return {
    preformulacion,
    formulaFinal,
    recetasMicro,
    costo,
    costosProducto,
    empaquesProducto,
  }
}
