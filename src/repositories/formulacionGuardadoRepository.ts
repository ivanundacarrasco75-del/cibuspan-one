import { supabase } from "../lib/supabase"

export type DatosVersionFormulacion = {
  nombre: string
  fecha: string
  activar: boolean
  panes: number
  rendimiento: number
  peso_bola_g: number
  peso_final_g: number
  origen_actualizado_en: string
  estructura_completa?: boolean
  componentes: { id: string | null; porcentaje: number; destino: "DIRECTO" | "MICRO"; materia_prima_id?: string; harina_base?: boolean }[]
}
export type IntentoVersionFormulacion = { id: string; usuario: string; origen: string; datos: DatosVersionFormulacion }
async function contexto() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error("Inicia sesión para guardar la nueva versión.")
  return { usuario: data.user.id, clave: `cibuspan:version-formulacion:v1:${import.meta.env.VITE_SUPABASE_URL}:${data.user.id}` }
}
export async function leerIntentoVersionFormulacion() {
  const ctx = await contexto()
  const copia = localStorage.getItem(ctx.clave)
  if (!copia) return null
  const intento = JSON.parse(copia) as IntentoVersionFormulacion
  if (!intento.id || intento.usuario !== ctx.usuario || !intento.origen || !Array.isArray(intento.datos?.componentes)) {
    throw new Error("Hay un guardado de formulación que requiere revisión. Conserva el almacenamiento del navegador.")
  }
  return intento
}
export async function guardarVersionFormulacion(origen: string, datos: DatosVersionFormulacion) {
  const ctx = await contexto()
  const previo = await leerIntentoVersionFormulacion()
  if (previo && (previo.origen !== origen || JSON.stringify(previo.datos) !== JSON.stringify(datos))) {
    throw new Error("Primero comprueba el guardado pendiente de formulación.")
  }
  const intento = previo ?? { id: crypto.randomUUID(), usuario: ctx.usuario, origen, datos }
  const copia = JSON.stringify(intento)
  localStorage.setItem(ctx.clave, copia)
  if (localStorage.getItem(ctx.clave) !== copia) throw new Error("No se pudo conservar el guardado antes de enviarlo.")
  const { data, error } = await supabase.rpc("fm_guardar_formulacion", {
    p_solicitud: intento.id, p_origen: intento.origen, p_datos: intento.datos,
  })
  if (error) {
    const rechazoConfirmado = /^(P0001|22\w{3}|23\w{3}|42501|PGRST202)$/.test(error.code ?? "")
    if (rechazoConfirmado) localStorage.removeItem(ctx.clave)
    throw new Error(error.code === "PGRST202" ? "La actualización de formulación está pendiente de instalar." : error.message)
  }
  if (!data?.version_id || !Number.isInteger(data.numero_version) || !Number.isFinite(Number(data.peso_batch_kg))) {
    throw new Error("La respuesta no confirmó la nueva versión. Comprueba el mismo guardado.")
  }
  try { localStorage.removeItem(ctx.clave) } catch { /* El RPC devuelve el comprobante al reintentar. */ }
  return data.version_id as string
}
