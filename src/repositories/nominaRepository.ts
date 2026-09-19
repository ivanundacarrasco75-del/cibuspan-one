import { supabase } from "../lib/supabase"
import type { AreaNomina, MovimientoRolPdf } from "../utils/rolesPagoPdf"

export type EmpleadoNominaDb = {
  id: string
  nombre: string
  nombre_normalizado: string
  area: AreaNomina
  activo: boolean
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

export async function obtenerEmpleadosNominaDb() {
  const { data, error } = await supabase
    .from("fin_nomina_empleados")
    .select("*")
    .eq("activo", true)
    .order("nombre")
  if (error) throw new Error(`No se pudieron cargar los empleados: ${error.message}`)
  return (data ?? []) as EmpleadoNominaDb[]
}

export async function obtenerImportacionesNominaDb() {
  const { data, error } = await supabase
    .from("fin_nomina_importaciones")
    .select("*")
    .order("periodo", { ascending: false })
    .limit(36)
  if (error) throw new Error(`No se pudo cargar el historial de roles: ${error.message}`)
  return (data ?? []) as ImportacionNominaDb[]
}

export async function obtenerNominaMensualAreaDb() {
  const { data, error } = await supabase
    .from("fin_vw_nomina_mensual_area")
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
