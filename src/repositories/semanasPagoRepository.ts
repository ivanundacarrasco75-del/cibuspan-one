import { supabase } from "../lib/supabase"
export const idSemanaSri = (clave: string) => clave.startsWith("excel:") ? clave : "sri:" + clave
export async function consultarSemanasPago(documentos: string[]) {
  if (!documentos.length) return {} as Record<string, string | null>
  if (documentos.length > 500) { const todos: Record<string, string | null> = {}; for (let i = 0; i < documentos.length; i += 500) Object.assign(todos, await consultarSemanasPago(documentos.slice(i, i + 500))); return todos }
  const { data, error } = await supabase.rpc("fin_consultar_semanas_pago", { p_documentos: documentos })
  if (error) throw error
  return Object.fromEntries((data as { documento_id: string; semana_pago: string | null }[]).map(f => [f.documento_id, f.semana_pago])) as Record<string, string | null>
}
export async function guardarSemanaPago(documento: string, semana: string, anterior: string | null, operacion: string = crypto.randomUUID()) {
  const { error, status } = await supabase.rpc("fin_guardar_semana_pago", { p_operacion: operacion, p_documento: documento, p_semana: semana || null, p_anterior: anterior })
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
}
export async function guardarSemanaAlIngresar(documento: string, semana: string | undefined, operacion: string) {
  if (semana === undefined) return
  const semanas = await consultarSemanasPago([documento])
  await guardarSemanaPago(documento, semana, semanas[documento] ?? null, operacion)
}
