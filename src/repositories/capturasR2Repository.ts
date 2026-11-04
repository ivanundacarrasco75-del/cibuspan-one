import { supabase } from "../lib/supabase"

async function cabecerasCapturas() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error("Inicia sesión para trabajar con las capturas.")
  return { Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string }
}
export async function solicitarCapturasR2<T>(accion: string, datos: unknown): Promise<T> {
  const respuesta = await fetch(`/api/capturas/${accion}`, { method: "POST", headers: { ...await cabecerasCapturas(), "Content-Type": "application/json" }, body: JSON.stringify(datos) })
  if (!respuesta.headers.get("Content-Type")?.includes("application/json")) throw new Error("Falta publicar el servicio de capturas R2. No se confirmó la operación.")
  const resultado = await respuesta.json()
  if (!respuesta.ok) throw new Error(resultado.error || "No se completó la operación de capturas.")
  return resultado as T
}
export async function subirCapturasR2(archivos: File[]) {
  const { data: usuario, error } = await supabase.auth.getUser()
  if (error || !usuario.user) throw new Error("La sesión no es válida.")
  if (archivos.length > 3) throw new Error("Se permiten hasta tres capturas por SKU.")
  const headers = await cabecerasCapturas(), rutas: string[] = []
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value
  const fecha = `${valor("year")}-${valor("month")}-${valor("day")}`
  // Content-addressed names make a failed visit save/retry reuse uploaded files.
  // Original screenshot bytes and resolution are preserved for OCR.
  for (const archivo of archivos) {
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[archivo.type]
    if (!extension || !archivo.size || archivo.size > 10 * 1024 * 1024) throw new Error("Usa capturas PNG, JPEG o WebP de hasta 10 MB.")
    const bytes = await archivo.arrayBuffer()
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("")
    const ruta = `${usuario.user.id}/${fecha}/captura-r2-${hash}.${extension}`
    const respuesta = await fetch(`/api/capturas/subir?ruta=${encodeURIComponent(ruta)}`, { method: "PUT", headers: { ...headers, "Content-Type": archivo.type }, body: archivo })
    if (!respuesta.headers.get("Content-Type")?.includes("application/json")) throw new Error("Falta publicar el servicio de capturas R2. La captura no quedó confirmada.")
    const resultado = await respuesta.json()
    if (!respuesta.ok || resultado.ruta !== ruta || resultado.sha256 !== hash || resultado.verificada !== true) throw new Error(resultado.error || "No se confirmó la captura completa en R2.")
    rutas.push(ruta)
  }
  return rutas
}
export type CopiaCaptura = { ruta: string; sha256: string; bytes: number; verificada: boolean; ya_copiada?: boolean }
export async function listarCapturasParaMigrar(despues: string) {
  const { data, error } = await supabase.rpc("com_kpi_campo_archivos_migracion", { p_despues: despues, p_limite: 100 })
  if (error) throw new Error(`No se pudo obtener el listado de capturas: ${error.message}`)
  return (data ?? []) as Array<{ ruta: string }>
}
export function mensajeErrorCampo(mensaje: string) {
  return /exceed_storage_size_quota|Service for this project is restricted/i.test(mensaje)
    ? "Supabase está restringido por superar su cuota de almacenamiento. No se confirmó el guardado. Administración debe restablecer el proyecto; releer o corregir el campo no resuelve este bloqueo."
    : mensaje
}
