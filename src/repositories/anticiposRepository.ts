import { consultarSemanasPago, guardarSemanaAlIngresar } from "./semanasPagoRepository"
import { supabase } from "../lib/supabase"

export type Anticipo = {
  semana_pago?: string | null
  id: string; numero: string; fecha: string; proveedor: string; ruc: string; concepto: string
  monto: number; pagado: number; aplicado: number; disponible: number; saldo: number; semana_activa: string | null
  pagos: { id: string; fecha: string; valor: number; documento: string }[]
  aplicaciones: { id: string; factura_id: string; numero: string; proveedor: string; monto: number; fecha: string }[]
}
export type DatosAnticipo = Pick<Anticipo, "id" | "fecha" | "proveedor" | "ruc" | "concepto"> & { monto: string; semana_pago?: string | null; semana_operacion?: string }
export type CruceAnticipo = { id: string; anticipo: string; factura: string; monto: string; confirmado: boolean }

export async function listarAnticipos() {
  const filas: Anticipo[] = []
  for (let inicio = 0; ; inicio += 200) {
    const { data, error } = await supabase.rpc("fin_consultar_anticipos").select("*")
      .order("fecha", { ascending: false }).order("id").range(inicio, inicio + 199)
    if (error) throw error
    const pagina = (data ?? []) as Anticipo[]
    filas.push(...pagina)
    if (pagina.length < 200) { const semanas = await consultarSemanasPago(filas.map(f => "anticipo:" + f.id)); return filas.map(f => ({ ...f, semana_pago: semanas["anticipo:" + f.id] ?? null })) }
  }
}
export async function guardarAnticipo(datos: DatosAnticipo) {
  const { error, status } = await supabase.rpc("fin_guardar_anticipo", {
    p_id: datos.id, p_fecha: datos.fecha, p_proveedor: datos.proveedor, p_ruc: datos.ruc,
    p_concepto: datos.concepto, p_monto: datos.monto,
  })
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
  await guardarSemanaAlIngresar("anticipo:" + datos.id, datos.semana_pago ?? undefined, datos.semana_operacion ?? crypto.randomUUID())
}
export async function aplicarAnticipo(datos: CruceAnticipo) {
  const { error, status, data } = await supabase.rpc("fin_aplicar_anticipo", {
    p_id: datos.id, p_anticipo: datos.anticipo, p_factura: datos.factura, p_monto: datos.monto, p_confirmado: datos.confirmado,
  })
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
  return data as { factura_id: string; aplicado: number; saldo?: number }
}
