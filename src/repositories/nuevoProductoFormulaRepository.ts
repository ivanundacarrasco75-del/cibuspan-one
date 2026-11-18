import { supabase } from "../lib/supabase"

export type MaterialAltaFormula = {
  id: string
  codigo: string | null
  nombre: string
  unidad_base: string
  es_empaque: boolean
  incluir_en_costeo: boolean
  costo_unitario: number | null
}
export type DatosNuevoProducto = {
  codigo: string
  nombre: string
  corto: string
  descripcion: string
  panes: number
  rendimiento: number
  vida_util: number
  peso_batch_kg: number
  peso_final_g: number
  ingredientes: { materia_prima_id: string; porcentaje: number; harina_base: boolean; micro_id: string | null }[]
  empaques: { materia_prima_id: string; cantidad: number }[]
}
export type ResultadoNuevoProducto = {
  producto_id: string
  formula_id: string
  version_id: string
  codigo: string
  nombre: string
  costo_materia_prima_unidad: number
  costo_empaque_unidad: number
  costo_materiales_unidad: number
}
export async function obtenerMaterialesAltaFormula() {
  const { data, error } = await supabase.from("materias_primas_costo_actual")
    .select("id,codigo,nombre,unidad_base,es_empaque,incluir_en_costeo,costo_unitario")
    .eq("activo", true).order("nombre")
  if (error) throw new Error(error.message)
  return (data ?? []) as MaterialAltaFormula[]
}

export async function contextoAltaFormula() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error("Inicia sesión para crear el producto.")
  return { usuario: data.user.id, clave: `cibuspan:alta-producto:v1:${import.meta.env.VITE_SUPABASE_URL}:${data.user.id}` }
}

export async function guardarProductoFormula(id: string, datos: DatosNuevoProducto, usuario: string) {
  const contexto = await contextoAltaFormula()
  if (contexto.usuario !== usuario) throw new Error("La sesión cambió. Vuelve al usuario que preparó el producto.")
  const { data, error } = await supabase.rpc("fm_crear_producto_formula", { p_solicitud: id, p_datos: datos })
  if (error) {
    // Un error SQL confirma que la transacción fue revertida. Un fallo de red conserva el intento.
    const rechazoConfirmado = /^(P0001|22\w{3}|23\w{3}|42501|PGRST202)$/.test(error.code ?? "")
    const mensaje = error.code === "PGRST202"
      ? "La actualización para guardar el producto y su fórmula está pendiente de instalar."
      : error.message
    throw Object.assign(new Error(mensaje), { rechazoConfirmado })
  }
  const resultado = data as ResultadoNuevoProducto | null
  if (!resultado?.producto_id || !resultado.formula_id || !resultado.version_id ||
    !Number.isFinite(Number(resultado.costo_materiales_unidad))) {
    throw new Error("La respuesta no confirmó el producto y su costo. Reintenta el mismo guardado.")
  }
  return resultado
}
