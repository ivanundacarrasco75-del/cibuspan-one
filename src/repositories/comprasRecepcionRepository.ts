import { supabase } from "../lib/supabase"
import { leerFacturaSri, type FacturaSri } from "../utils/comprasSri"

export type ArticuloRecepcion = { id: string; codigo: string; nombre: string; unidad: string; iniciado: boolean }
export type RecepcionCompra = {
  documento_id: string; fecha: string
  movimientos: { linea: number; articulo_id: string; cantidad: number; movimiento_id: number; nombre: string; unidad: string }[]
}
export type EstadoRecepcion = {
  version: string; puede: boolean; recepcion: RecepcionCompra | null; articulos: ArticuloRecepcion[]
  facturaXml?: FacturaSri
}
export type SolicitudRecepcion = {
  p_clave: string; p_version: string; p_fecha: string; p_solicitud: string
  p_lineas: { linea: number; articulo_id: string; cantidad: number }[]
}

export async function estadoRecepcionCompra(clave: string) {
  const { data, error } = await supabase.rpc("compras_recepcion_mp_estado", { p_clave: clave })
  if (error) throw error
  const estado = data as EstadoRecepcion
  if (/^\d{49}$/.test(clave) && estado.puede && !estado.recepcion) {
    // Los XML antiguos conservan su original aunque datos no incluya la unidad.
    const original = await supabase.from("compras_sri").select("xml_original").eq("clave_acceso", clave).maybeSingle()
    if (original.data?.xml_original) {
      try { estado.facturaXml = leerFacturaSri(original.data.xml_original) } catch { /* Mantener los datos registrados si el XML no se puede releer. */ }
    }
  }
  return estado
}

export async function confirmarRecepcionCompra(solicitud: SolicitudRecepcion) {
  const { data, error, status } = await supabase.rpc("compras_recepcion_mp_confirmar", solicitud)
  if (error) throw Object.assign(new Error(error.message), { incierto: status === 0 || status >= 500 })
  if (!data?.recepcion) throw Object.assign(new Error("No se recibió la confirmación. Reintenta para verificarla."), { incierto: true })
  return data.recepcion as RecepcionCompra
}
