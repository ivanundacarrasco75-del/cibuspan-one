import { supabase } from "../lib/supabase"
import { obtenerDetallesPedidosPorIdsDb, type PedidoListadoDb, type DetallePedidoConsultaDb } from "./pedidoRepository"
import type { EstadoEmpaqueCM } from "../utils/casaMasa"

export type EmpaqueCM = {
  pedido_id: string; estado_empaque: EstadoEmpaqueCM; contacto: string; direccion: string
  responsable: string; repartidor: string; observaciones: string; version: number; actualizado_en: string
}
export type PedidoCM = { empaque: EmpaqueCM; pedido: PedidoListadoDb; detalles: DetallePedidoConsultaDb[] }
function fallo(error: { code?: string; message: string }) {
  return new Error(["42P01", "PGRST205", "PGRST202", "42883"].includes(error.code ?? "")
    ? "Falta instalar la actualización de Casa Masa en Supabase. No se guardaron cambios de empaque."
    : error.message)
}

export async function listarPedidosCM(desde: string, hasta: string) {
  // Paginación explícita para no omitir pedidos por el límite de PostgREST.
  const filas: (EmpaqueCM & { pedido: PedidoListadoDb })[] = []
  for (let inicio = 0; ; inicio += 100) {
    const { data, error } = await supabase.from("cm_pedidos")
      .select("*,pedido:pedidos!inner(id,numero_pedido_cliente,fecha_entrega,hora_entrega,prioridad,tipo_empaque,estado,total_unidades,creado_en,cliente:clientes(id,nombre),bodega:bodegas(id,nombre))")
      .gte("pedido.fecha_entrega", desde).lte("pedido.fecha_entrega", hasta)
      .order("pedido_id").range(inicio, inicio + 99)
    if (error) throw fallo(error)
    const pagina = data as unknown as typeof filas
    filas.push(...pagina)
    if (pagina.length < 100) break
  }
  const detalles = await obtenerDetallesPedidosPorIdsDb(filas.map(f => f.pedido_id))
  return filas.map(({ pedido, ...empaque }) => ({ empaque, pedido, detalles: detalles.get(empaque.pedido_id) ?? [] }))
    .sort((a, b) => `${a.pedido.fecha_entrega} ${a.pedido.hora_entrega ?? ""}`.localeCompare(`${b.pedido.fecha_entrega} ${b.pedido.hora_entrega ?? ""}`))
}

export async function guardarEmpaqueCM(e: EmpaqueCM, verificado: boolean) {
  const { data, error } = await supabase.rpc("guardar_empaque_casa_masa", { p_pedido_id: e.pedido_id, p_version: e.version,
    p_datos: { estado: e.estado_empaque, contacto: e.contacto, direccion: e.direccion, responsable: e.responsable,
      repartidor: e.repartidor, observaciones: e.observaciones, verificado } })
  if (error) throw fallo(error)
  if (!data || data.pedido_id !== e.pedido_id || data.version !== e.version + 1) throw new Error("No se confirmó el guardado. Recarga para comprobar el estado antes de reintentar.")
  return data as EmpaqueCM
}
