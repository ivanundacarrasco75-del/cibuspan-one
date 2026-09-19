import { supabase } from "../lib/supabase"
import {
  CODIGOS_KPI_KAM,
  type CodigoKpiKam,
  type ConfiguracionKpiKam,
  type RangoPuntuacionKpi,
  type ReglaCriticaKpi,
} from "../types/kpiKam"

type DefinicionRelacion = {
  codigo: string
  nombre: string
  orden: number
}

type ConfiguracionDb = {
  id: string
  kpi_id: string
  alcance: "GENERAL" | "CLIENTE"
  cliente_id: string | null
  vigente_desde: string
  vigente_hasta: string | null
  aplica: boolean
  peso: number
  meta: number | null
  rangos_puntuacion: unknown
  reglas_criticas: unknown
  kpi: DefinicionRelacion | DefinicionRelacion[] | null
}

function esCodigoKpi(valor: string): valor is CodigoKpiKam {
  return (CODIGOS_KPI_KAM as readonly string[]).includes(valor)
}

function listaJson<T>(valor: unknown, etiqueta: string) {
  if (!Array.isArray(valor)) {
    throw new Error(`La ${etiqueta} de KPI no es una lista válida.`)
  }
  return valor as T[]
}

function fechaFinMes(periodo: string) {
  const [anio, mes] = periodo.slice(0, 7).split("-").map(Number)
  if (!anio || !mes || mes < 1 || mes > 12) {
    throw new Error("El periodo de KPI no es válido.")
  }
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
}

async function consultarConfiguraciones(
  periodo: string,
  alcance: "GENERAL" | "CLIENTE",
  clienteId?: string,
) {
  const hasta = fechaFinMes(periodo)
  let consulta = supabase
    .from("com_kpi_configuraciones")
    .select(`
      id,
      kpi_id,
      alcance,
      cliente_id,
      vigente_desde,
      vigente_hasta,
      aplica,
      peso,
      meta,
      rangos_puntuacion,
      reglas_criticas,
      kpi:com_kpi_definiciones!inner(
        codigo,
        nombre,
        orden
      )
    `)
    .eq("activo", true)
    .eq("alcance", alcance)
    .lte("vigente_desde", hasta)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${periodo}`)
    .order("vigente_desde", { ascending: false })

  if (alcance === "CLIENTE") {
    if (!clienteId) return []
    consulta = consulta.eq("cliente_id", clienteId)
  }

  const { data, error } = await consulta
  if (error) {
    throw new Error(
      `No se pudo cargar la configuración KPI: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as ConfiguracionDb[]
}

function seleccionarVigente(filas: ConfiguracionDb[]) {
  const porCodigo = new Map<CodigoKpiKam, ConfiguracionDb>()

  for (const fila of filas) {
    const relacion = Array.isArray(fila.kpi) ? fila.kpi[0] : fila.kpi
    const codigo = relacion?.codigo ?? ""
    if (!esCodigoKpi(codigo) || porCodigo.has(codigo)) continue
    porCodigo.set(codigo, fila)
  }

  return porCodigo
}

function convertirConfiguracion(fila: ConfiguracionDb): ConfiguracionKpiKam {
  const relacion = Array.isArray(fila.kpi) ? fila.kpi[0] : fila.kpi
  const codigo = relacion?.codigo ?? ""

  if (!relacion || !esCodigoKpi(codigo)) {
    throw new Error("Existe una configuración vinculada a un KPI desconocido.")
  }

  return {
    id: fila.id,
    codigo,
    nombre: relacion.nombre,
    aplica: Boolean(fila.aplica),
    peso: Number(fila.peso),
    meta: fila.meta == null ? null : Number(fila.meta),
    rangosPuntuacion: listaJson<RangoPuntuacionKpi>(
      fila.rangos_puntuacion,
      "regla de puntuación",
    ),
    reglasCriticas: listaJson<ReglaCriticaKpi>(
      fila.reglas_criticas,
      "regla crítica",
    ),
  }
}

export async function obtenerConfiguracionesKpiKamDb(
  periodo: string,
  clienteId?: string | null,
) {
  const [generales, cliente] = await Promise.all([
    consultarConfiguraciones(periodo, "GENERAL"),
    clienteId
      ? consultarConfiguraciones(periodo, "CLIENTE", clienteId)
      : Promise.resolve([] as ConfiguracionDb[]),
  ])

  const vigentes = seleccionarVigente(generales)
  const excepciones = seleccionarVigente(cliente)
  excepciones.forEach((fila, codigo) => vigentes.set(codigo, fila))

  return Array.from(vigentes.values())
    .map(convertirConfiguracion)
    .sort(
      (a, b) =>
        CODIGOS_KPI_KAM.indexOf(a.codigo) -
        CODIGOS_KPI_KAM.indexOf(b.codigo),
    )
}

export type KamKpiDb = {
  user_id: string
  nombre: string | null
  email: string
}

export async function obtenerKamsKpiDb() {
  const { data, error } = await supabase
    .from("app_profiles")
    .select("user_id,nombre,email")
    .eq("rol", "KAM")
    .eq("activo", true)
    .order("nombre")

  if (error) {
    throw new Error(`No se pudieron cargar los KAM: ${error.message}`)
  }

  return (data ?? []) as KamKpiDb[]
}

export type ClienteKamDb = {
  id: string
  kam_user_id: string
  cliente_id: string
  vigente_desde: string
  vigente_hasta: string | null
  cliente: { id: string; nombre: string } | null
}

export async function obtenerClientesKamDb(
  periodo: string,
  kamUserId?: string | null,
) {
  const hasta = fechaFinMes(periodo)
  let consulta = supabase
    .from("com_kam_clientes")
    .select(`
      id,
      kam_user_id,
      cliente_id,
      vigente_desde,
      vigente_hasta,
      cliente:clientes!inner(id,nombre)
    `)
    .eq("activo", true)
    .lte("vigente_desde", hasta)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${periodo}`)
    .order("cliente_id")

  if (kamUserId) consulta = consulta.eq("kam_user_id", kamUserId)

  const { data, error } = await consulta
  if (error) {
    throw new Error(
      `No se pudieron cargar los clientes asignados: ${error.message}`,
    )
  }

  return (data ?? []) as unknown as ClienteKamDb[]
}
