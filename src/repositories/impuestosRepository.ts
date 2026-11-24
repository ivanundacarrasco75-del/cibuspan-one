import { supabase } from "../lib/supabase"
export type Impuesto = { id: string; periodo: string; impuesto: "RENTA" | "IVA"; vencimiento: string; monto: string; referencia: string; detalle: string; revision: number; enviada: boolean; pagado: number; saldo: number; semana_activa: string | null }
export type FilaImpuesto = Pick<Impuesto, "id" | "periodo" | "impuesto" | "vencimiento" | "monto" | "referencia" | "detalle" | "revision"> & { enviar: boolean }
export type GuardadoImpuestos = { operacion: string; filas: FilaImpuesto[]; motivo: string; enviar: boolean }
export async function listarImpuestos(periodo: string) {
  const { data, error } = await supabase.rpc("fin_consultar_impuestos", { p_periodo: periodo })
  if (error) throw error
  return data as Impuesto[]
}
export async function guardarImpuestos(datos: GuardadoImpuestos) {
  const { error, status } = await supabase.rpc("fin_guardar_impuestos", { p_operacion: datos.operacion, p_filas: datos.filas, p_motivo: datos.motivo })
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
}
