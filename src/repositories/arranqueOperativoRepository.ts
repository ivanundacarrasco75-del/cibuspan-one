import { supabase } from "../lib/supabase"
import type { CatalogoArranque, ConteosArranque, EstadoArranque, VistaArranque } from "../utils/arranqueOperativo"
import { crearControlArranque, type IntentoArranque } from "../utils/controlArranque"
async function sesion(esperado?: string) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || (esperado && esperado !== user.id)) throw new Error("Inicia sesión con el usuario que preparó el corte.")
  return user.id
}
export async function consultarArranqueOperativo(): Promise<EstadoArranque> {
  const { data, error } = await supabase.rpc("inv_arranque_estado")
  if (error?.code === "PGRST202" || error?.code === "42883") return { instalado: false, aplicado: false, puede_preparar: false, hoy: "" }
  if (error) throw new Error(`No se pudo consultar el arranque. ${error.message}`)
  return data as EstadoArranque
}
export async function obtenerCatalogoArranque() {
  const { data, error } = await supabase.rpc("inv_arranque_catalogo")
  if (error) throw new Error(error.message)
  return data as CatalogoArranque
}
export async function preverArranqueOperativo(inicio: string, conteos: ConteosArranque) {
  const { data, error } = await supabase.rpc("inv_arranque_prever", { p_inicio: inicio, p_conteos: conteos })
  if (error) throw new Error(error.message)
  return data as VistaArranque
}
export async function contextoBorradorArranque() {
  const usuarioId = await sesion()
  return { usuarioId, clave: `cibuspan:arranque:borrador:v1:${encodeURIComponent(import.meta.env.VITE_SUPABASE_URL)}:${usuarioId}` }
}
async function control(esperado?: string) {
  const usuarioId = await sesion(esperado)
  let almacen: Storage
  try { almacen = window.localStorage } catch { throw new Error("Habilita el almacenamiento del navegador para conservar el intento.") }
  return crearControlArranque({ almacen, proyecto: import.meta.env.VITE_SUPABASE_URL, usuarioId,
    aplicar: async s => {
      const { data, error } = await supabase.rpc("inv_arranque_confirmar", { p_solicitud: s.id, p_inicio: s.inicio, p_conteos: s.conteos, p_token: s.token, p_conteo_completo: true, p_pedidos_revisados: true, p_usuario: usuarioId })
      if (error) throw new Error(error.message); return data
    },
    resolver: async id => {
      const { data, error } = await supabase.rpc("inv_arranque_resolver", { p_solicitud: id, p_usuario: usuarioId })
      if (error) throw new Error(error.message); return data
    },
  })
}
export async function intentosArranquePendientes() { return (await control()).listar() }
export async function aplicarArranqueOperativo(s: IntentoArranque) { return (await control(s.usuarioId)).aplicar(s) }
export async function resolverArranqueOperativo(s: IntentoArranque) { return (await control(s.usuarioId)).resolver(s.id) }
export async function informeArranqueOperativo() {
  const { data, error } = await supabase.rpc("inv_arranque_reporte")
  if (error) throw new Error(error.message); return data as Record<string, unknown> | null
}
