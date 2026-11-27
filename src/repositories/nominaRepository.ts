import { supabase } from "../lib/supabase"
import type { AreaNomina, MovimientoRolPdf } from "../utils/rolesPagoPdf"

export type EmpleadoNominaDb = {
  id: string
  nombre: string
  nombre_normalizado: string
  area: AreaNomina
  activo: boolean
  tipo_vinculo: "NOMINA" | "EXTERNO"
  creado_en: string
  actualizado_en: string
}

export type ImportacionNominaDb = {
  id: string
  periodo: string
  archivo_nombre: string
  archivo_hash: string
  empleados: number
  movimientos: number
  costo_empresa: number
  descuentos: number
  pago_neto_rol: number
  creado_en: string
  actualizado_en: string
}

export type NominaMensualAreaDb = {
  periodo: string
  area: AreaNomina
  empleados: number
  costo_empresa: number
  descuentos: number
  pago_neto_rol: number
}

export type NominaEmpleadoMesDb = {
  periodo: string
  empleado_id: string
  nombre: string
  area: AreaNomina
  movimientos: number
  costo_empresa: number
  descuentos: number
  pago_neto_rol: number
}

export type ResultadoImportacionNomina = {
  importacion_id: string
  periodo: string
  empleados: number
  movimientos: number
  costo_empresa: number
  descuentos: number
  pago_neto_rol: number
}

export async function obtenerEmpleadosNominaDb(incluirDesvinculados = false) {
  let consulta = supabase
    .rpc("fin_consultar_personal")
    .select("*")
    .order("nombre")
  if (!incluirDesvinculados) consulta = consulta.eq("activo", true)
  const { data, error } = await consulta
  if (error) throw new Error(`No se pudieron cargar los empleados: ${error.message}`)
  return (data ?? []) as EmpleadoNominaDb[]
}

export async function guardarPersonalNomina(persona: Pick<EmpleadoNominaDb, "id" | "nombre" | "area" | "activo" | "tipo_vinculo">) {
  const { error } = await supabase.rpc("fin_guardar_personal", {
    p_id: persona.id, p_nombre: persona.nombre, p_area: persona.area,
    p_activo: persona.activo, p_tipo: persona.tipo_vinculo,
  })
  if (error) throw error
}

export const CONCEPTOS_PAGO_NOMINA = {
  SUELDO: "Sueldo",
  PRIMERA_QUINCENA: "Primera quincena",
  SEGUNDA_QUINCENA: "Segunda quincena",
  DECIMO_TERCERO: "Décimo tercer sueldo",
  DECIMO_CUARTO: "Décimo cuarto sueldo",
  DECIMO_SEXTO: "Décimo sexto sueldo",
} as const
export type ConceptoPagoNomina = keyof typeof CONCEPTOS_PAGO_NOMINA
export type CargaNominaCuentas = {
  operacion: string
  periodo: string; concepto: ConceptoPagoNomina
  filas: { empleado_id: string; monto: string }[]
}
export type ResultadoCargaNomina = { operacion:string; filas:{id:string;nombre:string;periodo:string;concepto:ConceptoPagoNomina;monto:number;total?:number;pagado?:number;saldo?:number;estado:"CREADA"|"ACTUALIZADA"|"YA_PAGADA"|"YA_EXISTIA"|"PREPARADA"}[] }
export async function cargarNominaCuentas(datos: CargaNominaCuentas) {
  const { data, error, status } = await supabase.rpc("fin_cargar_nomina_verificada", {
    p_operacion: datos.operacion,
    p_periodo: datos.periodo, p_concepto: datos.concepto, p_filas: datos.filas,
  })
  if (error) throw Object.assign(error, { cargaRechazada: status >= 400 && status < 500 })
  return data as ResultadoCargaNomina
}

export type RetiroCuentaNomina = { operacion: string; documento: string; monto: number; motivo: string }
export type CorreccionMontoNomina = { operacion:string; documento:string; anterior:number; total:string; motivo:string }
export async function corregirMontoNomina(d:CorreccionMontoNomina) {
  const {error,status}=await supabase.rpc("fin_corregir_monto_nomina",{p_operacion:d.operacion,p_documento:d.documento,p_anterior:d.anterior,p_total:d.total,p_motivo:d.motivo})
  if(error)throw Object.assign(error,{rechazado:status>=400&&status<500})
}
export async function quitarCuentaNomina(datos: RetiroCuentaNomina) {
  const { error, status } = await supabase.rpc("fin_quitar_cuenta_nomina", {
    p_operacion: datos.operacion, p_documento: datos.documento, p_monto: datos.monto, p_motivo: datos.motivo,
  })
  if (error) throw Object.assign(error, { rechazado: status >= 400 && status < 500 })
}

export async function obtenerImportacionesNominaDb() {
  const { data, error } = await supabase
    .rpc("fin_consultar_roles_importados")
    .select("*")
    .order("periodo", { ascending: false })
    .limit(36)
  if (error) throw new Error(`No se pudo cargar el historial de roles: ${error.message}`)
  return (data ?? []) as ImportacionNominaDb[]
}

export async function obtenerNominaMensualAreaDb(gestionRoles = false) {
  const consulta = gestionRoles ? supabase.rpc("fin_consultar_resumen_roles") : supabase.from("fin_vw_nomina_mensual_area")
  const { data, error } = await consulta
    .select("*")
    .order("periodo", { ascending: true })
  if (error) throw new Error(`No se pudo cargar el resumen de nómina: ${error.message}`)
  return (data ?? []) as NominaMensualAreaDb[]
}

export async function obtenerNominaEmpleadoMesDb(periodo?: string) {
  let consulta = supabase
    .from("fin_vw_nomina_empleado_mes")
    .select("*")
    .order("nombre")
  if (periodo) consulta = consulta.eq("periodo", periodo)
  const { data, error } = await consulta
  if (error) throw new Error(`No se pudo cargar el detalle de nómina: ${error.message}`)
  return (data ?? []) as NominaEmpleadoMesDb[]
}

export async function importarNominaPdfDb(datos: {
  periodo: string
  archivoNombre: string
  archivoHash: string
  movimientos: MovimientoRolPdf[]
}) {
  const { data, error } = await supabase.rpc("fin_importar_nomina_pdf", {
    p_periodo: datos.periodo,
    p_archivo_nombre: datos.archivoNombre,
    p_archivo_hash: datos.archivoHash,
    p_movimientos: datos.movimientos,
  })
  if (error) throw new Error(`No se pudo importar el rol: ${error.message}`)
  return data as ResultadoImportacionNomina
}

export async function actualizarAreaNominaDb(
  empleadoId: string,
  area: AreaNomina,
) {
  const { error } = await supabase.rpc("fin_actualizar_area_nomina", {
    p_empleado_id: empleadoId,
    p_area: area,
  })
  if (error) throw new Error(`No se pudo actualizar el área: ${error.message}`)
}
