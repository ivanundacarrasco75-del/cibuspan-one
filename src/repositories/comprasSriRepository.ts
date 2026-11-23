import { supabase } from "../lib/supabase"
import type { FacturaSri } from "../utils/comprasSri"

export type CampoCompra = "fecha" | "serie" | "proveedor" | "descripcion" | "subtotal" | "iva" | "total" | "retencion" | "documento"
export type AbonoCompra = { id: string; valor: string; fecha: string; documento: string }
export type ControlCompra = {
  edicion: Partial<Record<CampoCompra, string>> & { retencion_estado?: "CALCULADA" | "EMITIDA"; retencion_revision?: string | null }
  abonos: AbonoCompra[]
}
export type CompraGuardada = ControlCompra & {
  datos: FacturaSri
  ride_leido: boolean
  neto_excel?: number | null
  origen_excel?: boolean
  observaciones_excel?: string | null
  documento_excel?: string | null
}

export type VinculoExcelSri = {
  clave: string; revision: string; estado: "REVISION" | "VINCULADA" | "DISTINTAS"; motivo: string
  datos_sri: { numero: string; proveedor: string; ruc: string; fecha: string; total: string }
  candidatos: { id: string; numero: string; proveedor: string; fecha: string | null; total: number | null; neto: number | null; pagado: number }[]
}
export async function listarVinculosPendientes() {
  const { data, error } = await supabase.from("compras_vinculos_excel").select("clave,revision,estado,motivo,datos_sri,candidatos")
    .eq("estado", "REVISION").order("actualizado_en").limit(50)
  if (error) throw error
  return data as VinculoExcelSri[]
}
export async function consultarVinculoSri(clave: string) {
  const { data, error } = await supabase.from("compras_vinculos_excel").select("estado").eq("clave", clave).maybeSingle()
  if (error) throw error
  return data as Pick<VinculoExcelSri, "estado"> | null
}
export async function resolverVinculoSri(vinculo: VinculoExcelSri, excel: string | null, motivo: string) {
  const { error } = await supabase.rpc("compras_resolver_vinculo_excel", {
    p_clave: vinculo.clave, p_revision: vinculo.revision, p_excel: excel, p_motivo: motivo, p_confirmado: true,
  })
  if (error) throw error
}
export async function refrescarVinculoSri(vinculo: VinculoExcelSri) {
  const { error } = await supabase.rpc("compras_refrescar_vinculo_excel", { p_clave: vinculo.clave, p_revision: vinculo.revision })
  if (error) throw error
}

export async function listarComprasSri(desde: number, limite: number, proveedor: string | null) {
  let consulta = supabase.from("compras_vw_facturas")
    .select("datos,ride_leido,edicion,abonos,neto_excel,origen_excel,observaciones_excel,documento_excel")
    .order("fecha_orden", { ascending: false, nullsFirst: false }).order("id")
    .range(desde, desde + limite - 1)
  if (proveedor !== null) consulta = consulta.eq("proveedor_filtro", proveedor)
  const { data, error } = await consulta
  if (error) throw error
  return data as CompraGuardada[]
}

export async function buscarProveedoresSri(texto: string) {
  const { data, error } = await supabase.rpc("compras_sri_buscar_proveedores", { p_texto: texto })
  if (error) throw error
  return ((data ?? []) as { proveedor: string }[]).map(fila => fila.proveedor)
}

export async function editarCompraSri(clave: string, campo: CampoCompra, valor: string) {
  const { data, error } = await supabase.rpc("compras_sri_editar", {
    p_clave: clave, p_campo: campo, p_valor: valor,
  })
  if (error) throw error
  return data as ControlCompra
}

export async function guardarCompraSri(datos: FacturaSri, xml: string) {
  const { data, error } = await supabase.from("compras_sri").upsert({
    clave_acceso: datos.clave,
    fecha_emision: datos.fecha,
    datos,
    xml_original: xml,
  }, { onConflict: "clave_acceso", ignoreDuplicates: true }).select("clave_acceso")
  if (error) throw error
  return data.length > 0
}

export async function marcarRideLeido(clave: string) {
  const { data, error } = await supabase.from("compras_sri")
    .update({ ride_leido: true }).eq("clave_acceso", clave).select("clave_acceso")
  if (error) throw error
  return data.length > 0
}
