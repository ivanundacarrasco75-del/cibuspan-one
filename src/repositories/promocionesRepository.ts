import { supabase } from "../lib/supabase"

export type TipoDescuento = "PORCENTAJE" | "VALOR_UNIDAD"

export type PromocionProductoDb = {
  id: string
  producto_id: string
  sku: string
  producto_nombre: string
  tipo_descuento: TipoDescuento
  valor_descuento: number
  unidades_vendidas: number
  venta_base: number
  descuento_esperado: number
}

export type NotaCreditoPromocionDb = {
  id: string
  numero: string
  fecha: string
  valor_aplicado: number
  observaciones: string | null
}

export type PromocionDb = {
  id: string
  nombre: string
  cliente_id: string
  cliente_nombre: string
  fecha_inicio: string
  fecha_fin: string
  observaciones: string | null
  activo: boolean
  creado_en: string
  estado: "PROXIMA" | "ACTIVA" | "FINALIZADA" | "CANCELADA"
  productos: PromocionProductoDb[]
  unidades_vendidas: number
  venta_base: number
  descuento_esperado: number
  notas_credito: NotaCreditoPromocionDb[]
  notas_total: number
  diferencia: number
}

export type AlertaAplicacionDb = {
  clave: string
  tipo: "MENSAJE" | "PROMOCION_INICIO" | "PROMOCION_FIN"
  titulo: string
  mensaje: string
  fecha: string
  prioridad: "NORMAL" | "ALTA"
  pantalla_destino: string
  leida: boolean
}

export type RecordatorioDb = {
  id: string
  titulo: string
  mensaje: string
  fecha_inicio: string
  fecha_fin: string
  prioridad: "NORMAL" | "ALTA"
  destino_tipo: "TODOS" | "ROL" | "USUARIO"
  destino_rol: string | null
  destino_usuario: string | null
  destino_usuario_nombre: string | null
  activo: boolean
  creado_en: string
}

export type DestinatarioRecordatorioDb = {
  user_id: string
  nombre: string | null
  email: string
  rol: string
}

function mensajeError(prefijo: string, error: { message: string }) {
  return `${prefijo}: ${error.message}`
}

export async function obtenerPromocionesDb() {
  const { data, error } = await supabase.rpc("com_listar_promociones")
  if (error) throw new Error(mensajeError("No se pudieron cargar las promociones", error))
  return (Array.isArray(data) ? data : []) as PromocionDb[]
}

export async function guardarPromocionDb(datos: {
  solicitudId: string
  destinatarios: string[]
  nombre: string
  clienteId: string
  fechaInicio: string
  fechaFin: string
  observaciones: string
  productos: Array<{
    producto_id: string
    tipo_descuento: TipoDescuento
    valor_descuento: number
  }>
}) {
  const { data, error } = await supabase.rpc("com_guardar_promocion_correo", {
    p_solicitud_id: datos.solicitudId,
    p_destinatarios: datos.destinatarios,
    p_nombre: datos.nombre,
    p_cliente_id: datos.clienteId,
    p_fecha_inicio: datos.fechaInicio,
    p_fecha_fin: datos.fechaFin,
    p_observaciones: datos.observaciones,
    p_productos: datos.productos,
  })
  if (error) throw new Error(mensajeError("No se pudo guardar la promoción", error))
  if (typeof data !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data)) throw new Error("La base no confirmó el guardado del descuento.")
  return data
}

export async function registrarNotaCreditoPromocionDb(datos: {
  promocionId: string
  numero: string
  fecha: string
  valorAplicado: number
  observaciones: string
}) {
  const { data, error } = await supabase.rpc("com_registrar_nota_descuento", {
    p_promocion_id: datos.promocionId,
    p_numero: datos.numero,
    p_fecha: datos.fecha,
    p_valor_aplicado: datos.valorAplicado,
    p_observaciones: datos.observaciones,
  })
  if (error) throw new Error(mensajeError("No se pudo registrar la nota de crédito", error))
  return data as string
}

export async function cambiarEstadoPromocionDb(promocionId: string, activo: boolean) {
  const { error } = await supabase.rpc("com_cambiar_estado_promocion", {
    p_promocion_id: promocionId,
    p_activo: activo,
  })
  if (error) throw new Error(mensajeError("No se pudo actualizar la promoción", error))
}

export async function obtenerAlertasAplicacionDb() {
  const { data, error } = await supabase.rpc("app_mis_alertas")
  if (error) throw new Error(mensajeError("No se pudieron cargar las alertas", error))
  return (data ?? []) as AlertaAplicacionDb[]
}

export async function marcarAlertaLeidaDb(clave: string) {
  const { error } = await supabase.rpc("app_marcar_alerta_leida", {
    p_clave: clave,
  })
  if (error) throw new Error(mensajeError("No se pudo actualizar la alerta", error))
}

export async function obtenerRecordatoriosDb() {
  const { data, error } = await supabase.rpc("app_listar_recordatorios")
  if (error) throw new Error(mensajeError("No se pudieron cargar los recordatorios", error))
  return (Array.isArray(data) ? data : []) as RecordatorioDb[]
}

export async function obtenerDestinatariosRecordatoriosDb() {
  const { data, error } = await supabase.rpc("app_destinatarios_recordatorios")
  if (error) throw new Error(mensajeError("No se pudieron cargar los usuarios", error))
  return (data ?? []) as DestinatarioRecordatorioDb[]
}

export async function guardarRecordatorioDb(datos: {
  titulo: string
  mensaje: string
  fechaInicio: string
  fechaFin: string
  prioridad: "NORMAL" | "ALTA"
  destinoTipo: "TODOS" | "ROL" | "USUARIO"
  destinoRol: string | null
  destinoUsuario: string | null
}) {
  const { data, error } = await supabase.rpc("app_guardar_recordatorio", {
    p_titulo: datos.titulo,
    p_mensaje: datos.mensaje,
    p_fecha_inicio: datos.fechaInicio,
    p_fecha_fin: datos.fechaFin,
    p_prioridad: datos.prioridad,
    p_destino_tipo: datos.destinoTipo,
    p_destino_rol: datos.destinoRol,
    p_destino_usuario: datos.destinoUsuario,
  })
  if (error) throw new Error(mensajeError("No se pudo guardar el recordatorio", error))
  return data as string
}

export async function cambiarEstadoRecordatorioDb(recordatorioId: string, activo: boolean) {
  const { error } = await supabase.rpc("app_cambiar_estado_recordatorio", {
    p_recordatorio_id: recordatorioId,
    p_activo: activo,
  })
  if (error) throw new Error(mensajeError("No se pudo actualizar el recordatorio", error))
}

export type CorreoDescuentoDb = { id: string; lote_id: string; promocion_id: string; email: string; nombre: string; estado: string; error: string | null; creado_en: string }
export async function obtenerDestinatariosDescuentosDb() {
 const {data,error}=await supabase.rpc("com_destinatarios_descuentos")
 if(error)throw new Error("No se pudieron cargar destinatarios. Revisa la instalación de correos de descuentos.")
 return (data??[]) as DestinatarioRecordatorioDb[]
}
export async function obtenerCorreosDescuentosDb() {
 const {data,error}=await supabase.rpc("com_estado_correos_descuentos")
 if(error)throw new Error("No se pudo consultar el estado de los correos.")
 return (data??[]) as CorreoDescuentoDb[]
}
export async function enviarCorreosDescuentoDb(loteId: string) {
 const {data,error}=await supabase.functions.invoke("descuentos-correo",{body:{lote_id:loteId}})
 if(error||data?.error||typeof data?.enviados !== "number"||typeof data?.pendientes !== "number")return "El descuento está guardado. Los correos siguen pendientes: revisa el servicio de correo y usa Reintentar envío."
 if(Number(data?.pendientes)>0)return "El descuento está guardado. Hay correos sin confirmar; revisa el registro de envíos."
 return "El proveedor confirmó el envío de los correos. Esto no confirma su lectura ni su llegada a la bandeja de entrada."
}
