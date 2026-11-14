import { supabase } from "../lib/supabase"
import type { FacturaSri } from "../utils/comprasSri"

export type CompraGuardada = {
  datos: FacturaSri
  ride_leido: boolean
}

export async function listarComprasSri(desde: number, limite: number) {
  const { data, error } = await supabase.from("compras_sri")
    .select("datos,ride_leido").order("fecha_emision", { ascending: false })
    .order("clave_acceso").range(desde, desde + limite - 1)
  if (error) throw error
  return data as CompraGuardada[]
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
