import { supabase } from "../lib/supabase"
import type { FormulaFmDb, FormulaVersionFmDb } from "./formulaRepository"

export type FormulaCatalogo = FormulaFmDb & { versiones: FormulaVersionFmDb[] }
export type AccionCatalogo = "BLOQUEAR" | "DESBLOQUEAR" | "ELIMINAR_FORMULA" | "ELIMINAR_VERSION"
export type IntentoCatalogo = { id: string; accion: AccionCatalogo; objeto: string; etiqueta: string }

export async function obtenerCatalogoFormulas() {
  const filas: FormulaCatalogo[] = []
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from("fm_formulas")
      .select("*,versiones:fm_formula_versiones(*)").order("codigo").order("id").range(inicio, inicio + 499)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []) as FormulaCatalogo[])
    if ((data?.length ?? 0) < 500) return filas
  }
}

export async function contextoCatalogoFormulas() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error("Inicia sesión para administrar fórmulas.")
  return { usuario: data.user.id, clave: `cibuspan:catalogo-formulas:v1:${import.meta.env.VITE_SUPABASE_URL}:${data.user.id}` }
}

export async function ejecutarAccionCatalogo(intento: IntentoCatalogo, usuario: string) {
  const ctx = await contextoCatalogoFormulas()
  if (ctx.usuario !== usuario) throw new Error("La sesión cambió. Vuelve al usuario que inició la acción.")
  const { data, error } = await supabase.rpc("fm_administrar_catalogo", {
    p_solicitud: intento.id, p_accion: intento.accion, p_objeto: intento.objeto,
  })
  if (error) throw Object.assign(new Error(error.code === "PGRST202"
    ? "La actualización de administración de fórmulas está pendiente de instalar."
    : error.message), { rechazoConfirmado: /^(P0001|22\w{3}|23\w{3}|42501|PGRST202)$/.test(error.code ?? "") })
  if (data?.objeto_id !== intento.objeto || data?.accion !== intento.accion) throw new Error("El resultado está pendiente de confirmar. Reintenta la misma acción.")
}
