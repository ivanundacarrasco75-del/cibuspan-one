import { supabase } from "../lib/supabase"
import type { PerfilRetencionIva } from "../utils/sugerenciasRetencionIva"

export async function listarPerfilesRetencionIva() {
  const filas: PerfilRetencionIva[] = []
  for (let desde = 0; ; desde += 200) {
    const { data, error } = await supabase.rpc("fin_consultar_perfiles_iva").select("*").order("ruc").range(desde, desde + 199)
    if (error) throw error
    const pagina = (data ?? []) as PerfilRetencionIva[]
    filas.push(...pagina)
    if (pagina.length < 200) return filas
  }
}

export type ReglaRetencion = {
  id: string; impuesto: "RENTA" | "IVA"; concepto: string; porcentaje: number; desde: string; hasta: string | null; fuente: string
}
export type RetencionDocumento = {
  id: string; documento_id: string; fecha: string; regimen: string | null; proveedor_especial: boolean | null; comprobante: string
  motivo: string; total: number; descuento: number; estado: "ACTIVA" | "ANULADA"; tipo_registro: "CALCULADA" | "EMITIDA"
  lineas: { id?: string; impuesto: "RENTA" | "IVA" | "SEGUN_REPORTE" | "TOTAL_RETENIDO"; concepto: string; porcentaje?: number; base: number; valor: number; valor_calculado?: number; ajuste_manual?: boolean }[]
}
export type SolicitudRetencion = {
  id: string; documento: string; fecha: string; regimen: string; especial: boolean; comprobante: string; motivo: string
  lineas: { regla: string; base: string; valor?: string }[]; confirmado: boolean; calculada?: boolean
}
export async function listarReglasRetencion() {
  const { data, error } = await supabase.from("fin_reglas_retencion").select("*").order("impuesto").order("porcentaje")
  if (error) throw error
  return data as ReglaRetencion[]
}
export async function listarRetenciones(documento: string) {
  const { data, error } = await supabase.from("fin_retenciones_documentos").select("*")
    .eq("documento_id", documento).order("creado_en", { ascending: false })
  if (error) throw error
  return data as RetencionDocumento[]
}
export async function aplicarRetencion(datos: SolicitudRetencion) {
  const { error, status } = await supabase.rpc(datos.calculada ? "fin_guardar_calculo_retencion" : "fin_aplicar_retencion", {
    p_id: datos.id, p_documento: datos.documento, p_fecha: datos.fecha, p_regimen: datos.regimen,
    p_especial: datos.especial, p_comprobante: datos.comprobante, p_motivo: datos.motivo,
    p_lineas: datos.lineas, p_confirmado: datos.confirmado,
  })
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
}
export async function anularRetencion(id: string, motivo: string) {
  const { error } = await supabase.rpc("fin_anular_retencion", { p_id: id, p_motivo: motivo })
  if (error) throw error
}
