import { supabase } from "../lib/supabase"

export type TipoCuentaCompra = "SRI" | "NOTA_VENTA" | "NO_DEDUCIBLE" | "NOMINA" | "ANTICIPO" | "PRESTAMO"
export type CuentaCompra = {
  id: string
  tipo: TipoCuentaCompra
  origen: "SRI" | "MANUAL_COMPRAS" | "CLASIFICACION_GASTOS" | "EXCEL" | "NOMINA" | "ANTICIPO" | "PRESTAMO"
  fecha_documento: string | null
  numero_documento: string | null
  proveedor: string | null
  concepto: string | null
  subtotal: number | null
  iva: number | null
  retencion: number | null
  total: number | null
  neto: number | null
  pagado: number
  saldo: number | null
  ruc: string | null
  observaciones: string | null
  semana_activa: string | null
  pagos: { id: string; valor: string | number; fecha: string; documento: string }[]
}

export type CompraProgramada = { documento_id: string; monto: number; pagado: number }
export type SeleccionCompra = { id: string; monto: string; verificado: boolean }

export const CUENTAS_POR_PAGINA = 40

export function estadoImportes(cuenta: CuentaCompra) {
  return Object.fromEntries((["subtotal", "iva", "total", "retencion", "neto", "pagado"] as const)
    .map(campo => [campo, cuenta[campo] === null ? null : Number(cuenta[campo])]))
}
export async function corregirImportesExcel(datos: {
  operacion: string; cuenta: CuentaCompra; subtotal: string; iva: string; total: string; retencion: string; motivo: string
}) {
  const { error, status } = await supabase.rpc("fin_corregir_importes_excel", {
    p_operacion: datos.operacion, p_documento: datos.cuenta.id, p_subtotal: datos.subtotal, p_iva: datos.iva,
    p_total: datos.total, p_retencion: datos.retencion, p_motivo: datos.motivo, p_anterior: estadoImportes(datos.cuenta),
  })
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
}
export type CorreccionImportes = {
  id: string; creado_en: string; responsable_email: string; motivo: string; anterior: CuentaCompra
  subtotal: number; iva: number; total: number; retencion: number; neto: number
}
export async function listarCorreccionesImportes(documento: string) {
  const { data, error } = await supabase.from("fin_correcciones_excel_importes")
    .select("id,creado_en,responsable_email,motivo,anterior,subtotal,iva,total,retencion,neto")
    .eq("documento_id", documento).order("creado_en", { ascending: false }).limit(50)
  if (error) throw error
  return data as CorreccionImportes[]
}

export async function listarCuentasCompra(pagina: number, tipo: string, busqueda: string, pendientes: boolean) {
  const inicio = pagina * CUENTAS_POR_PAGINA
  let consulta = supabase.rpc("fin_consultar_cuentas", {}, { count: "exact" }).select("*")
    .order("fecha_documento", { ascending: false, nullsFirst: false }).order("id")
    .range(inicio, inicio + CUENTAS_POR_PAGINA - 1)
  if (tipo) consulta = consulta.eq("tipo", tipo)
  if (busqueda) consulta = consulta.ilike("busqueda", `%${busqueda.replace(/[\\%_*]/g, "\\$&")}%`)
  if (pendientes) consulta = consulta.gt("saldo", 0)
  const { data, count, error } = await consulta
  if (error) throw error
  return { cuentas: (data ?? []) as CuentaCompra[], total: count ?? 0 }
}

export async function listarComprasProgramadas(semana: string) {
  const planes: CompraProgramada[] = []
  const bloque = 100
  for (let inicio = 0; ; inicio += bloque) {
    const { data, error } = await supabase.rpc("fin_consultar_programaciones").select("documento_id,monto,pagado")
      .eq("semana", semana).order("documento_id").range(inicio, inicio + bloque - 1)
    if (error) throw error
    const registros = (data ?? []) as CompraProgramada[]
    planes.push(...registros)
    if (registros.length < bloque) break
  }
  const cuentas = new Map<string, CuentaCompra>()
  for (let inicio = 0; inicio < planes.length; inicio += bloque) {
    const ids = planes.slice(inicio, inicio + bloque).map(plan => plan.documento_id)
    const { data, error } = await supabase.rpc("fin_consultar_cuentas").select("*").in("id", ids)
    if (error) throw error
    for (const cuenta of (data ?? []) as CuentaCompra[]) cuentas.set(cuenta.id, cuenta)
  }
  return planes.map(plan => ({ plan, cuenta: cuentas.get(plan.documento_id) }))
}

export async function programarCompras(semana: string, filas: SeleccionCompra[]) {
  const { error } = await supabase.rpc("fin_programar_compras", { p_semana: semana, p_filas: filas })
  if (error) throw error
}

export async function quitarCompraProgramada(semana: string, id: string) {
  const { error } = await supabase.rpc("fin_quitar_compra_programada", { p_semana: semana, p_id: id })
  if (error) throw error
}

export async function pagarCompra(datos: {
  id: string; operacion: string; monto: string; fecha: string; referencia: string; semana: string | null; verificado: boolean
}) {
  const { error, status } = await supabase.rpc("fin_pagar_compra", {
    p_id: datos.id, p_operacion: datos.operacion, p_monto: datos.monto, p_fecha: datos.fecha,
    p_referencia: datos.referencia, p_semana: datos.semana, p_verificado: datos.verificado,
  })
  if (error) throw Object.assign(error, { pagoRechazado: status >= 400 && status < 500 })
}
