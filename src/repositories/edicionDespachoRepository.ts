import { supabase } from "../lib/supabase"
export type DatosEditorDespacho = {
  pedido_id: string; reserva_id: string
  detalles: { id: string; producto_id: string; nombre: string; codigo: string; unidades_manejo: number; total_unidades: number; unidades_despachadas: number }[]
  asignaciones: { pedido_detalle_id: string; inventario_lote_id: string; unidades: number }[]
  lotes: { id: string; producto_id: string; lote: string; fecha_produccion: string; fecha_vencimiento: string; cantidad: number; disponible: number; inv_archivo_id: string | null }[]
  historial: { solicitud_id: string; creado_en: string; responsable: string | null; motivo: string; antes: number; despues: number }[]
}
export async function obtenerEditorDespachoDb(reservaId: string, pedidoId: string) {
  const { data, error } = await supabase.rpc("obtener_edicion_despacho", { p_reserva_id: reservaId })
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42883" ? "Falta instalar la actualización de edición de despachos." : error.message)
  if (!data || data.reserva_id !== reservaId || data.pedido_id !== pedidoId || ![data.detalles, data.asignaciones, data.lotes, data.historial].every(Array.isArray)) throw new Error("No se confirmó la información del despacho. Actualiza antes de editar.")
  return data as DatosEditorDespacho
}
