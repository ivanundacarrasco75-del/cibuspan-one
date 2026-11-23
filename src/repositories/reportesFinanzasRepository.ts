import { supabase } from "../lib/supabase"
export type TipoReporteFinanzas = "PAGOS" | "MP"
export type FilaReporteFinanzas = Record<string, string | number | null>
export type DatosReporteFinanzas = {
  filas: FilaReporteFinanzas[]; total?: number; documentos?: number; movimientos?: number; sin_fecha?: number
  recepciones?: number; lineas?: number; cantidades?: { unidad: string; cantidad: number }[]
}
export async function consultarReporteFinanzas(tipo: TipoReporteFinanzas, desde: string, hasta: string) {
  const { data, error } = await supabase.rpc(tipo === "PAGOS" ? "fin_reporte_pagos" : "fin_reporte_recepciones_mp", { p_desde: desde, p_hasta: hasta })
  if (error) throw error
  if (!data || !Array.isArray(data.filas)) throw new Error("La respuesta del reporte está incompleta. Intenta consultar de nuevo.")
  return data as DatosReporteFinanzas
}
