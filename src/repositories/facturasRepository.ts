import { supabase } from "../lib/supabase"
import type { CuentaPagoDb } from "./pagosRepository"

export type LineaFacturaImportar = {
  clave_origen: string
  fecha_emision: string | null
  fecha_vencimiento: string | null
  fecha_pago: string | null
  pagada: boolean
  numero_factura: string | null
  proveedor: string
  proveedor_normalizado: string
  descripcion: string | null
  subtotal: number
  aplica_iva: boolean
  tasa_iva: number
  iva: number
  total_factura: number
  retencion: number
  retencion_referencia: string | null
  valor_neto_pagar: number
  documento: string | null
  cuenta_codigo: string
  estado_clasificacion: "AUTOMATICA" | "REVISADA" | "PENDIENTE"
  confianza: number
  fila_origen: number
  semana_pago_sugerida: string | null
  semana_pago_numero: number | null
}

export type FacturaDetalleDb = {
  id: string
  clave_origen: string
  fecha_emision: string | null
  periodo_servicio: string | null
  fecha_vencimiento: string | null
  fecha_pago_origen: string | null
  pagada_origen: boolean
  numero_factura: string | null
  proveedor: string
  proveedor_normalizado: string
  descripcion: string | null
  subtotal: number
  aplica_iva: boolean
  tasa_iva: number
  iva: number
  total_factura: number
  retencion: number
  retencion_referencia: string | null
  valor_neto_pagar: number
  total_abonado: number
  saldo: number
  estado: "PENDIENTE" | "ABONO" | "PAGADA" | "ANULADA"
  cuenta_codigo: string
  cuenta_nombre: string
  grupo: CuentaPagoDb["grupo"]
  naturaleza: CuentaPagoDb["naturaleza"]
  impacta_ebitda: boolean
  estado_clasificacion: "AUTOMATICA" | "REVISADA" | "PENDIENTE"
  confianza: number
  notas: string | null
  archivo_origen: string | null
  hoja_origen: string | null
  fila_origen: number | null
  creado_en: string
  actualizado_en: string
  afecta_tipo: "GENERAL" | "CLIENTE"
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_ids: string[] | null
  clientes_cantidad: number
  semana_pago_sugerida: string | null
  semana_pago_numero: number | null
}

export type ProgramacionPagoDb = {
  id: string
  factura_id: string
  semana_inicio: string
  semana_numero: number
  seleccionada: boolean
  monto_programado: number
  notas: string | null
  actualizado_en: string
  estado_plan: "PREPARADO" | "PAGADO"
  abono_id: string | null
  fecha_pago: string | null
  monto_pagado: number | null
  documento_pago: string | null
  pagado_en: string | null
}

export type PlanPagoSemanalDb = {
  semana_inicio: string
  presupuesto_disponible: number
  notas: string | null
  actualizado_en: string
}

export type ImportacionFacturaDb = {
  id: string
  archivo_nombre: string
  archivo_hash: string
  hoja_origen: string
  anio: number
  facturas_archivo: number
  facturas_nuevas: number
  facturas_actualizadas: number
  facturas_pagadas: number
  facturas_pendientes: number
  total_neto: number
  creado_en: string
}

export type AbonoFacturaDb = {
  id: string
  factura_id: string
  fecha_pago: string
  semana_inicio: string
  semana_numero: number
  monto: number
  documento: string | null
  notas: string | null
  origen: "EXCEL" | "MANUAL"
  proveedor: string
  numero_factura: string | null
  descripcion: string | null
  cuenta_codigo: string
  cuenta_nombre: string
  grupo: CuentaPagoDb["grupo"]
  naturaleza: CuentaPagoDb["naturaleza"]
  impacta_ebitda: boolean
  creado_en: string
  afecta_tipo: "GENERAL" | "CLIENTE"
  cliente_id: string | null
  cliente_nombre: string | null
}

export type PagoFacturaSemanalDb = {
  semana_inicio: string
  semana_numero: number
  cuenta_codigo: string
  cuenta_nombre: string
  grupo: CuentaPagoDb["grupo"]
  naturaleza: CuentaPagoDb["naturaleza"]
  impacta_ebitda: boolean
  movimientos: number
  total_pagado: number
  actualizado_en: string
}

async function obtenerTodo<T>(tabla: string, orden: string, ascendente: boolean) {
  const registros: T[] = []
  const pagina = 1000
  let desde = 0
  while (true) {
    const { data, error } = await supabase
      .from(tabla)
      .select("*")
      .order(orden, { ascending: ascendente, nullsFirst: false })
      .range(desde, desde + pagina - 1)
    if (error) throw new Error(error.message)
    const bloque = (data ?? []) as T[]
    registros.push(...bloque)
    if (bloque.length < pagina) break
    desde += pagina
  }
  return registros
}

export async function obtenerFacturasDb() {
  try {
    return await obtenerTodo<FacturaDetalleDb>("fin_vw_facturas_periodo", "fecha_emision", false)
  } catch (error) {
    throw new Error(`No se pudieron cargar las facturas: ${error instanceof Error ? error.message : "error desconocido"}`)
  }
}

export async function obtenerProgramacionesDb() {
  try {
    return await obtenerTodo<ProgramacionPagoDb>("fin_vw_programacion_pagos", "semana_inicio", false)
  } catch (error) {
    throw new Error(`No se pudo cargar la programación: ${error instanceof Error ? error.message : "error desconocido"}`)
  }
}

export async function obtenerPlanesPagoSemanalesDb() {
  try {
    return await obtenerTodo<PlanPagoSemanalDb>("fin_planes_pago_semanales", "semana_inicio", false)
  } catch (error) {
    throw new Error(`No se pudo cargar el presupuesto semanal: ${error instanceof Error ? error.message : "error desconocido"}`)
  }
}

export async function obtenerAbonosFacturasDb() {
  try {
    return await obtenerTodo<AbonoFacturaDb>("fin_vw_factura_abonos", "fecha_pago", false)
  } catch (error) {
    throw new Error(`No se pudieron cargar los abonos: ${error instanceof Error ? error.message : "error desconocido"}`)
  }
}

export async function obtenerPagosFacturasSemanalesDb() {
  try {
    return await obtenerTodo<PagoFacturaSemanalDb>("fin_vw_factura_pagos_semanales", "semana_inicio", true)
  } catch (error) {
    throw new Error(`No se pudo cargar el resumen semanal: ${error instanceof Error ? error.message : "error desconocido"}`)
  }
}

export async function obtenerImportacionesFacturasDb() {
  const { data, error } = await supabase
    .from("fin_importaciones_facturas")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(30)
  if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`)
  return (data ?? []) as ImportacionFacturaDb[]
}

export async function importarFacturas2026Db(datos: {
  archivoNombre: string
  archivoHash: string
  hojaOrigen: string
  lineas: LineaFacturaImportar[]
}) {
  const { data, error } = await supabase.rpc("fin_importar_facturas_2026", {
    p_archivo_nombre: datos.archivoNombre,
    p_archivo_hash: datos.archivoHash,
    p_hoja_origen: datos.hojaOrigen,
    p_lineas: datos.lineas,
  })
  if (error) throw new Error(`No se pudieron importar las facturas: ${error.message}`)
  const { error: errorSemanas } = await supabase.rpc("fin_actualizar_semanas_pago_facturas", {
    p_lineas: datos.lineas.map((linea) => ({
      clave_origen: linea.clave_origen,
      semana_pago_sugerida: linea.semana_pago_sugerida,
      semana_pago_numero: linea.semana_pago_numero,
    })),
  })
  if (errorSemanas) throw new Error(`Las facturas se importaron, pero no se pudo guardar la semana de pago: ${errorSemanas.message}`)
  return data as {
    importacion_id: string
    facturas_archivo: number
    facturas_nuevas: number
    facturas_actualizadas: number
    facturas_pagadas: number
    facturas_pendientes: number
    total_neto: number
  }
}

export async function guardarFacturaDb(datos: {
  id?: string | null
  fecha_emision: string
  fecha_vencimiento: string
  numero_factura: string
  proveedor: string
  descripcion: string
  subtotal: number
  aplica_iva: boolean
  tasa_iva: number
  retencion: number
  retencion_referencia?: string
  cuenta_codigo: string
  notas: string
  afecta_tipo: "GENERAL" | "CLIENTE"
  cliente_id: string | null
}) {
  const { data, error } = await supabase.rpc("fin_guardar_factura", { p_datos: datos })
  if (error) throw new Error(`No se pudo guardar la factura: ${error.message}`)
  return data as string
}

export type PagoFacturaEditar = {
  id: string
  fecha_pago: string
  monto: number
  documento: string
  notas: string
}

export async function guardarFacturaCompletaDb(datos: {
  id?: string | null
  fecha_emision: string
  periodo_servicio: string
  fecha_vencimiento: string
  numero_factura: string
  proveedor: string
  descripcion: string
  subtotal: number
  aplica_iva: boolean
  tasa_iva: number
  retencion: number
  retencion_referencia: string
  cuenta_codigo: string
  notas: string
  afecta_tipo: "GENERAL" | "CLIENTE"
  cliente_id: string | null
  cliente_ids: string[]
}, pagos: PagoFacturaEditar[]) {
  const { data, error } = await supabase.rpc("fin_guardar_factura_v12", {
    p_datos: datos,
    p_abonos: pagos,
  })
  if (error) throw new Error(`No se pudo guardar la factura y sus pagos: ${error.message}`)
  return data as string
}

export type GastoClienteMensualDb = {
  mes: string
  cliente_id: string
  cliente_nombre: string
  cuenta_codigo: string
  cuenta_nombre: string
  facturas: number
  gasto_sin_iva: number
}

export type GastoClienteDetalleDb = {
  factura_id: string
  fecha_emision: string
  cliente_id: string
  cliente_nombre: string
  cuenta_codigo: string
  cuenta_nombre: string
  proveedor: string
  numero_factura: string | null
  descripcion: string | null
  gasto_sin_iva: number
}

export async function obtenerGastosClienteDetalleDb() {
  try {
    return await obtenerTodo<GastoClienteDetalleDb>(
      "fin_vw_gastos_cliente_detalle",
      "fecha_emision",
      true,
    )
  } catch (error) {
    throw new Error(
      `No se pudieron cargar los gastos directos por cliente: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    )
  }
}

export async function obtenerGastosClienteMensualesDb() {
  try {
    return await obtenerTodo<GastoClienteMensualDb>(
      "fin_vw_gastos_cliente_mensuales",
      "mes",
      true,
    )
  } catch (error) {
    throw new Error(
      `No se pudieron cargar los gastos directos por cliente: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    )
  }
}

export async function programarFacturaDb(datos: {
  facturaId: string
  semanaInicio: string
  seleccionada: boolean
  monto: number
}) {
  const { data, error } = await supabase.rpc("fin_programar_factura", {
    p_factura_id: datos.facturaId,
    p_semana_inicio: datos.semanaInicio,
    p_seleccionada: datos.seleccionada,
    p_monto: datos.monto,
  })
  if (error) throw new Error(`No se pudo actualizar el plan semanal: ${error.message}`)
  return data as string
}

export async function guardarPresupuestoSemanalDb(datos: {
  semanaInicio: string
  presupuesto: number
}) {
  const { error } = await supabase.rpc("fin_guardar_presupuesto_semanal", {
    p_semana_inicio: datos.semanaInicio,
    p_presupuesto: datos.presupuesto,
    p_notas: null,
  })
  if (error) throw new Error(`No se pudo guardar el dinero disponible: ${error.message}`)
}

export async function ejecutarPagoProgramadoDb(datos: {
  programacionId: string
  fechaPago: string
  documento: string
  notas: string
}) {
  const { data, error } = await supabase.rpc("fin_ejecutar_pago_programado", {
    p_programacion_id: datos.programacionId,
    p_fecha_pago: datos.fechaPago,
    p_documento: datos.documento,
    p_notas: datos.notas || null,
  })
  if (error) throw new Error(`No se pudo completar el pago programado: ${error.message}`)
  return data as string
}

export async function registrarAbonoFacturaDb(datos: {
  facturaId: string
  fechaPago: string
  monto: number
  documento: string
  notas: string
}) {
  const { data, error } = await supabase.rpc("fin_registrar_abono_factura", {
    p_factura_id: datos.facturaId,
    p_fecha_pago: datos.fechaPago,
    p_monto: datos.monto,
    p_documento: datos.documento || null,
    p_notas: datos.notas || null,
  })
  if (error) throw new Error(`No se pudo registrar el abono: ${error.message}`)
  return data as string
}

export async function clasificarFacturaDb(datos: {
  facturaId: string
  cuentaCodigo: string
  recordarProveedor: boolean
}) {
  const { error } = await supabase.rpc("fin_clasificar_factura", {
    p_factura_id: datos.facturaId,
    p_cuenta_codigo: datos.cuentaCodigo,
    p_recordar_proveedor: datos.recordarProveedor,
  })
  if (error) throw new Error(`No se pudo clasificar la factura: ${error.message}`)
}

export async function clasificarFacturasMasivoDb(datos: {
  facturaIds: string[]
  cuentaCodigo: string
  afectaTipo: "GENERAL" | "CLIENTE"
  clienteId: string | null
  recordarProveedor: boolean
}) {
  const { data, error } = await supabase.rpc("fin_clasificar_facturas_masivo", {
    p_factura_ids: datos.facturaIds,
    p_cuenta_codigo: datos.cuentaCodigo,
    p_afecta_tipo: datos.afectaTipo,
    p_cliente_id: datos.afectaTipo === "CLIENTE" ? datos.clienteId : null,
    p_recordar_proveedor: datos.recordarProveedor,
  })
  if (error) throw new Error(`No se pudieron clasificar las facturas: ${error.message}`)
  return data as { facturas_actualizadas: number; proveedores_recordados: number }
}
