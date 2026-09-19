import { supabase } from "../lib/supabase"

export type CuentaPagoDb = {
  id: string
  codigo: string
  nombre: string
  grupo:
    | "INVENTARIO"
    | "PERSONAL"
    | "OPERACION"
    | "ADMINISTRACION"
    | "COMERCIAL"
    | "OBLIGACIONES"
    | "FINANCIAMIENTO"
    | "ACTIVOS"
    | "TRANSFERENCIAS"
    | "OTROS"
    | "PENDIENTE"
  naturaleza:
    | "GASTO_EBITDA"
    | "INVENTARIO"
    | "OBLIGACION"
    | "FINANCIAMIENTO"
    | "ACTIVO"
    | "TRANSFERENCIA"
    | "OTRO"
    | "PENDIENTE"
  cuenta_contable_referencia: string | null
  impacta_ebitda: boolean
  activo: boolean
  orden: number
}

export type ReglaClasificacionPagoDb = {
  id: string
  campo: "COMBINADO" | "PROVEEDOR" | "DESCRIPCION"
  patron: string
  prioridad: number
  confianza: number
  origen: "SISTEMA" | "USUARIO"
  activo: boolean
  cuenta_codigo: string
  cuenta_nombre: string
}

export type LineaPagoImportar = {
  clave_origen: string
  fecha_pago: string
  semana_inicio: string
  fecha_emision: string | null
  estado_pago: "PAGADO" | "PROGRAMADO" | "ANULADO"
  factura: string | null
  proveedor: string
  proveedor_normalizado: string
  descripcion: string | null
  valor_total: number | null
  iva: number | null
  retencion_referencia: string | null
  valor_pagado: number
  documento: string | null
  cuenta_codigo: string
  estado_clasificacion: "AUTOMATICA" | "REVISADA" | "PENDIENTE"
  confianza: number
  fila_origen: number
}

export type ImportacionPagosDb = {
  id: string
  archivo_nombre: string
  archivo_hash: string
  hoja_origen: string
  fecha_desde: string
  fecha_hasta: string
  movimientos_archivo: number
  movimientos_nuevos: number
  movimientos_actualizados: number
  movimientos_pendientes: number
  total_pagado: number
  creado_en: string
}

export type PagoDetalleDb = {
  id: string
  clave_origen: string
  fecha_pago: string
  semana_inicio: string
  semana_numero: number
  fecha_emision: string | null
  estado_pago: "PAGADO" | "PROGRAMADO" | "ANULADO"
  factura: string | null
  proveedor: string
  descripcion: string | null
  valor_total: number | null
  iva: number | null
  retencion_referencia: string | null
  valor_pagado: number
  documento: string | null
  estado_clasificacion: "AUTOMATICA" | "REVISADA" | "PENDIENTE"
  confianza: number
  cuenta_codigo: string
  cuenta_nombre: string
  grupo: CuentaPagoDb["grupo"]
  naturaleza: CuentaPagoDb["naturaleza"]
  cuenta_contable_referencia: string | null
  impacta_ebitda: boolean
  archivo_origen: string
  hoja_origen: string
  fila_origen: number
  actualizado_en: string
}

export type PagoSemanalDb = {
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

export type RespuestaImportacionPagos = {
  importacion_id: string
  fecha_desde: string
  fecha_hasta: string
  movimientos_archivo: number
  movimientos_nuevos: number
  movimientos_actualizados: number
  movimientos_pendientes: number
  total_pagado: number
}

export async function obtenerCuentasPagosDb() {
  const { data, error } = await supabase
    .from("fin_cuentas_pago")
    .select("*")
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true })

  if (error) {
    throw new Error(`No se pudo cargar el catálogo de cuentas: ${error.message}`)
  }

  return (data ?? []) as CuentaPagoDb[]
}

export async function obtenerReglasPagosDb() {
  const { data, error } = await supabase
    .from("fin_reglas_clasificacion_pago")
    .select(`
      id,
      campo,
      patron,
      prioridad,
      confianza,
      origen,
      activo,
      cuenta:fin_cuentas_pago(codigo, nombre)
    `)
    .eq("activo", true)
    .order("prioridad", { ascending: true })

  if (error) {
    throw new Error(`No se pudieron cargar las reglas automáticas: ${error.message}`)
  }

  return (data ?? []).map((regla) => {
    const cuenta = Array.isArray(regla.cuenta) ? regla.cuenta[0] : regla.cuenta
    return {
      id: regla.id,
      campo: regla.campo,
      patron: regla.patron,
      prioridad: Number(regla.prioridad),
      confianza: Number(regla.confianza),
      origen: regla.origen,
      activo: Boolean(regla.activo),
      cuenta_codigo: cuenta?.codigo ?? "PENDIENTE",
      cuenta_nombre: cuenta?.nombre ?? "Por revisar",
    } as ReglaClasificacionPagoDb
  })
}

export async function obtenerImportacionesPagosDb() {
  const { data, error } = await supabase
    .from("fin_importaciones_pagos")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(30)

  if (error) {
    throw new Error(`No se pudo cargar el historial de pagos: ${error.message}`)
  }

  return (data ?? []) as ImportacionPagosDb[]
}

export async function obtenerPagosDetalleDb() {
  const registros: PagoDetalleDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("fin_vw_pagos_detalle")
      .select("*")
      .order("fecha_pago", { ascending: false })
      .order("id", { ascending: false })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(`No se pudieron cargar los pagos: ${error.message}`)
    }

    const pagina = (data ?? []) as PagoDetalleDb[]
    registros.push(...pagina)
    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

export async function obtenerPagosSemanalesDb() {
  const registros: PagoSemanalDb[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("fin_vw_pagos_semanales")
      .select("*")
      .order("semana_inicio", { ascending: true })
      .order("cuenta_nombre", { ascending: true })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      throw new Error(`No se pudo cargar el resumen semanal de pagos: ${error.message}`)
    }

    const pagina = (data ?? []) as PagoSemanalDb[]
    registros.push(...pagina)
    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return registros
}

export async function importarPagosDb(datos: {
  archivoNombre: string
  archivoHash: string
  hojaOrigen: string
  lineas: LineaPagoImportar[]
}) {
  const { data, error } = await supabase.rpc("fin_importar_pagos", {
    p_archivo_nombre: datos.archivoNombre,
    p_archivo_hash: datos.archivoHash,
    p_hoja_origen: datos.hojaOrigen,
    p_lineas: datos.lineas,
  })

  if (error) {
    throw new Error(`No se pudieron guardar los pagos: ${error.message}`)
  }

  return data as RespuestaImportacionPagos
}

export async function actualizarClasificacionPagoDb(datos: {
  pagoId: string
  cuentaCodigo: string
  recordarProveedor: boolean
}) {
  const { error } = await supabase.rpc("fin_actualizar_clasificacion_pago", {
    p_pago_id: datos.pagoId,
    p_cuenta_codigo: datos.cuentaCodigo,
    p_recordar_proveedor: datos.recordarProveedor,
  })

  if (error) {
    throw new Error(`No se pudo actualizar la clasificación: ${error.message}`)
  }
}
