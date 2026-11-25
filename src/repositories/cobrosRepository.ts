import { supabase } from "../lib/supabase"
export type FacturaCobro = { comprobante: string; fecha_emision: string; cliente: string; subtotal_importado: number; huella: string; fuente_valida: boolean; total: number | null; vencimiento: string | null; revision: number; verificada: boolean; cobrado: number; retenido: number; saldo: number | null }
export type DepositoCobro = { id: string; banco: string; referencia: string; fecha: string; monto: number; ordenante: string; observaciones: string; anulado: boolean; aplicado: number; disponible: number }
export type NuevoDeposito = { id: string; banco: string; referencia: string; fecha: string; monto: string; ordenante: string; observaciones: string }
export type AplicacionCobro = { id: string; efectivo: number; retencion: number; referencia_retencion: string; fecha_retencion: string | null; referencia_deposito: string | null; fecha_deposito: string | null; banco: string | null; anulada: boolean; responsable: string | null; creado_en: string }
export type DistribucionCobro = { comprobante: string; revision: number; huella: string; saldo: number; efectivo: string; retencion: string; referencia_retencion: string; fecha_retencion: string | null }
export type ConciliacionCobro = { id: string; deposito: string | null; filas: DistribucionCobro[]; motivo: string }
export async function consultarFacturasCobro(desde: string, hasta: string, buscar: string) {
  const filas: FacturaCobro[] = []
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.rpc("fin_cxc_consultar", { p_desde: desde, p_hasta: hasta, p_buscar: buscar }).select("*").order("fecha_emision").order("comprobante").range(inicio, inicio + 499)
    if (error) throw error
    filas.push(...data as FacturaCobro[]); if (data.length < 500) return filas
  }
}
export async function consultarDepositosCobro() {
  const filas: DepositoCobro[] = []
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.rpc("fin_cxc_consultar_depositos").select("*").order("fecha", { ascending: false }).order("id").range(inicio, inicio + 499)
    if (error) throw error
    filas.push(...data as DepositoCobro[]); if (data.length < 500) return filas
  }
}
export async function historialCobro(comprobante: string) {
  const { data, error } = await supabase.rpc("fin_cxc_historial", { p_comprobante: comprobante })
  if (error) throw error
  return data as AplicacionCobro[]
}
async function ejecutar(nombre: string, parametros: Record<string, unknown>) {
  const { error, status } = await supabase.rpc(nombre, parametros)
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
}
export async function confirmarFacturaCobro(f: FacturaCobro, total: string, vencimiento: string, motivo: string) {
  await ejecutar("fin_cxc_confirmar_factura", { p_comprobante: f.comprobante, p_revision: f.revision, p_huella: f.huella, p_total: total, p_vencimiento: vencimiento, p_motivo: motivo })
}
export async function crearDepositoCobro(d: NuevoDeposito) {
  await ejecutar("fin_cxc_crear_deposito", { p_id: d.id, p_banco: d.banco, p_referencia: d.referencia, p_fecha: d.fecha, p_monto: d.monto, p_ordenante: d.ordenante, p_observaciones: d.observaciones })
}
export async function conciliarCobro(d: ConciliacionCobro) {
  await ejecutar("fin_cxc_conciliar", { p_id: d.id, p_deposito: d.deposito, p_filas: d.filas, p_motivo: d.motivo })
}
export async function anularCobro(aplicacion: string | null, deposito: string | null, motivo: string) {
  await ejecutar("fin_cxc_anular", { p_aplicacion: aplicacion, p_deposito: deposito, p_motivo: motivo })
}
export type ImportacionDepositos = { operacion: string; archivo: string; huella: string; cuenta: string; tipo: "CORRIENTE" | "AHORROS"; filas: Omit<NuevoDeposito, "banco">[] }
export type ResultadoImportacionDepositos = { creados: number; duplicados: number; importe_creado: number; importe_duplicado: number }
export async function importarDepositos(datos: ImportacionDepositos) {
  const { data, error, status } = await supabase.rpc("fin_cxc_importar_depositos", { p_operacion: datos.operacion, p_archivo: datos.archivo, p_huella: datos.huella, p_cuenta: datos.cuenta, p_tipo: datos.tipo, p_filas: datos.filas })
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
  return data as ResultadoImportacionDepositos
}
