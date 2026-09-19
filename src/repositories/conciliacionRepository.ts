import { supabase } from "../lib/supabase"

/**
 * Devuelve la fecha del primer despacho que fue confirmado con
 * conciliacion_aplica = TRUE.
 *
 * Esa fecha separa el histórico incompleto del periodo en el que
 * CIBUSPAN ONE ya exige el control despacho <-> factura.
 */
export async function obtenerFechaInicioConciliacionDb() {
  const { data, error } = await supabase
    .from("reservas_inventario")
    .select(`
      creado_en,
      pedido:pedidos(
        fecha_entrega
      )
    `)
    .eq("estado", "DESPACHADA")
    .eq("conciliacion_aplica", true)
    .order("creado_en", { ascending: true })
    .limit(1)

  if (error) {
    throw new Error(
      `No se pudo determinar el inicio del control de conciliación: ${error.message}`,
    )
  }

  const fila = (data ?? [])[0] as
    | {
        creado_en: string
        pedido:
          | { fecha_entrega: string }
          | { fecha_entrega: string }[]
          | null
      }
    | undefined

  if (!fila) return null

  const pedido = Array.isArray(fila.pedido)
    ? fila.pedido[0]
    : fila.pedido

  return (
    pedido?.fecha_entrega ||
    String(fila.creado_en ?? "").slice(0, 10) ||
    null
  )
}
