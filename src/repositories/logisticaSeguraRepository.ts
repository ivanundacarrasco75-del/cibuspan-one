import { supabase } from "../lib/supabase"
import { copiarDatosLogistica, crearControlLogistica, type DatosLogistica, type TipoLogistica, type IntentoLogistica, type VistaLogistica } from "../utils/operacionLogisticaSegura"
export async function preverLogisticaDb(tipo: TipoLogistica, datos: DatosLogistica) {
  const { data, error } = await supabase.rpc("prever_operacion_logistica", { p_tipo: tipo, p_datos: copiarDatosLogistica(tipo, datos) })
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42883" ? "Falta instalar la actualización de operaciones logísticas." : error.message)
  if (!data || typeof data.token !== "string" || !/^[a-f0-9]{32}$/.test(data.token) || !Array.isArray(data.bloqueos) || typeof data.puede_ejecutar !== "boolean" || typeof data.pedido_id !== "string") throw new Error("No se confirmó la revisión previa. No se envió la operación.")
  return data as VistaLogistica
}
async function control(usuarioEsperado?: string) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || usuarioEsperado && user.id !== usuarioEsperado) throw new Error("Ingresa con el usuario que preparó el intento.")
  let almacen: Storage
  try { almacen = window.localStorage } catch { throw new Error("Habilita el almacenamiento del navegador para conservar el intento.") }
  return { usuarioId: user.id, control: crearControlLogistica({ almacen, proyecto: import.meta.env.VITE_SUPABASE_URL, usuarioId: user.id,
    ejecutar: async s => {
      const { data, error } = await supabase.rpc("ejecutar_operacion_logistica", { p_solicitud_id: s.id, p_tipo: s.tipo, p_datos: s.datos, p_token: s.token, p_usuario_esperado: user.id })
      if (error) throw new Error(error.message); return data
    },
    resolver: async s => {
      const { data, error } = await supabase.rpc("resolver_operacion_logistica", { p_solicitud_id: s.id, p_tipo: s.tipo, p_usuario_esperado: user.id })
      if (error) throw new Error(error.message); return data
    },
  }) }
}
export async function obtenerIntentosLogisticaDb() { return (await control()).control.listar() }
export async function ejecutarLogisticaDb(tipo: TipoLogistica, datos: DatosLogistica, vista: VistaLogistica) {
  if (!vista.puede_ejecutar || vista.bloqueos.length) throw new Error(vista.bloqueos.join(" ") || "Revisa la operación antes de confirmar.")
  const c = await control()
  return c.control.ejecutar({ version: 1, id: crypto.randomUUID(), usuarioId: c.usuarioId, tipo, datos: copiarDatosLogistica(tipo, datos), token: vista.token, pedidoId: vista.pedido_id, creadoEn: new Date().toISOString() })
}
export async function reintentarLogisticaDb(s: IntentoLogistica) { return (await control(s.usuarioId)).control.ejecutar(s) }
export async function resolverLogisticaDb(s: IntentoLogistica) { return (await control(s.usuarioId)).control.resolver(s) }
