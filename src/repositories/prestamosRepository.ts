import { supabase } from "../lib/supabase"
export type Prestamo = {
  id: string; acreedor: string; referencia: string; fecha: string; numero_cuotas: number; monto_total: number; pagado_previo: number
  observaciones: string; revision: number; pagado_registrado: number; pagado_total: number; saldo: number; sin_distribuir: number
  monto_cuotas: number; cuotas_registradas: number; cuotas_enviadas: number
}
export type CuotaPrestamo = {
  id: string; prestamo_id: string; numero: number; vencimiento: string; monto: number; detalle: string
  enviada: boolean; revision: number; pagado: number; saldo: number; semana_activa: string | null
}
export type HistorialPrestamo = { id: number; creado_en: string; accion: string; responsable: string | null; detalle: {
  motivo?: string; anterior?: { numero?: number; monto?: number; monto_total?: number } | null
  nuevo?: { numero?: number; monto?: number; monto_total?: number } | null
} }
export async function listarPrestamos() {
  const filas: Prestamo[] = []
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.rpc("fin_consultar_prestamos").select("*").order("acreedor").order("id").range(inicio, inicio + 499)
    if (error) throw error
    filas.push(...data as Prestamo[])
    if (data.length < 500) return filas
  }
}
export async function listarCuotasPrestamo(id: string) {
  const { data, error } = await supabase.rpc("fin_consultar_cuotas_prestamo", { p_prestamo: id }).select("*").order("numero").limit(600)
  if (error) throw error
  return data as CuotaPrestamo[]
}
export async function historialPrestamo(id: string) {
  const { data, error } = await supabase.rpc("fin_historial_prestamo", { p_prestamo: id })
  if (error) throw error
  return data as HistorialPrestamo[]
}
async function ejecutar(nombre: string, parametros: Record<string, unknown>) {
  const { error, status } = await supabase.rpc(nombre, parametros)
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
}
export type DatosPrestamo = { id: string; revision: number | null; acreedor: string; referencia: string; fecha: string; numero_cuotas: number; monto_total: string; pagado_previo: string; observaciones: string; motivo: string }
export async function guardarPrestamo(datos: DatosPrestamo) {
  await ejecutar("fin_guardar_prestamo", { p_id: datos.id, p_revision: datos.revision, p_acreedor: datos.acreedor, p_referencia: datos.referencia, p_fecha: datos.fecha,
    p_numero_cuotas: datos.numero_cuotas, p_monto_total: datos.monto_total, p_pagado_previo: datos.pagado_previo, p_observaciones: datos.observaciones, p_motivo: datos.motivo })
}
export type DatosCuotas = { operacion: string; prestamo: string; revision: number; motivo: string; filas: {
  id: string; numero: number; vencimiento: string; monto: string; detalle: string; revision: number; enviar: boolean
}[] }
export async function guardarCuotasPrestamo(datos: DatosCuotas) {
  await ejecutar("fin_guardar_cuotas_prestamo", { p_operacion: datos.operacion, p_prestamo: datos.prestamo, p_revision: datos.revision, p_filas: datos.filas, p_motivo: datos.motivo })
}
export async function retirarCuotaPrestamo(cuota: CuotaPrestamo, motivo: string) {
  await ejecutar("fin_retirar_cuota_prestamo", { p_id: cuota.id, p_revision: cuota.revision, p_motivo: motivo })
}
