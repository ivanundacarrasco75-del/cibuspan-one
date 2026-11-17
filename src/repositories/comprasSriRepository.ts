import { supabase } from "../lib/supabase"
import type { FacturaSri } from "../utils/comprasSri"

export type CampoCompra = "fecha" | "serie" | "proveedor" | "descripcion" | "subtotal" | "iva" | "total" | "retencion" | "documento"
export type AbonoCompra = { id: string; valor: string; fecha: string; documento: string }
export type ControlCompra = {
  edicion: Partial<Record<CampoCompra, string>>
  abonos: AbonoCompra[]
}
export type CompraGuardada = ControlCompra & {
  datos: FacturaSri
  ride_leido: boolean
}

export async function listarComprasSri(desde: number, limite: number, proveedor: string | null) {
  if (proveedor !== null) {
    const { data, error } = await supabase.rpc("compras_sri_listar_por_proveedor", {
      p_proveedor: proveedor, p_desde: desde, p_limite: limite,
    })
    if (error) throw error
    return (data ?? []) as CompraGuardada[]
  }
  const { data, error } = await supabase.from("compras_sri")
    .select("datos,ride_leido,edicion,abonos").order("fecha_emision", { ascending: false })
    .order("clave_acceso").range(desde, desde + limite - 1)
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

export async function abonarCompraSri(
  clave: string, id: string, valor: string | null, fecha: string, documento: string,
) {
  const { data, error } = await supabase.rpc("compras_sri_abonar", {
    p_clave: clave, p_id: id, p_valor: valor, p_fecha: fecha, p_documento: documento,
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
