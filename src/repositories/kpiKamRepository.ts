import { supabase } from "../lib/supabase"
import {
  CODIGOS_KPI_KAM,
  type BaseCalculoKpiKam,
  type CodigoKpiKam,
  type ConfiguracionKpiKam,
  type RangoPuntuacionKpi,
  type ReglaCriticaKpi,
} from "../types/kpiKam"
import type { FilaCoberturaFavorita } from "../utils/coberturaFavoritaExcel"

type BaseProvisionalDb = {
  periodo: string
  kam_user_id: string
  cliente_id: string
  cliente_nombre: string
  venta_bruta: number
  venta_facturada_neta: number
  devoluciones_valor: number
  ajustes_venta_neta: number
  fugas_comerciales_valor: number
  presupuesto: number | null
  costo_producto: number | null
  transporte: number | null
  costos_variables_comerciales: number | null
  promociones_costo_adicional: number | null
  contribucion_anterior: number | null
  posiciones_sku_local_activas: number
  posiciones_sku_local_objetivo: number
  compromisos_cumplidos_a_tiempo: number
  compromisos_con_vencimiento: number
  advertencias: string[] | null
}

type RotacionKpiKamDb = {
  cliente_id: string
  rotacion_diaria_promedio: number | null
  observaciones: number
}

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
  const desde = `${periodo.slice(0, 7)}-01`
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
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${desde}`)
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
  const { data, error } = await supabase.rpc("com_kpi_kam_responsables")

  if (error) {
    throw new Error(`No se pudieron cargar los KAM: ${error.message}`)
  }

  return (data ?? []) as KamKpiDb[]
}

export type UsuarioConfiguracionKpiKamDb = {
  user_id: string
  nombre: string | null
  email: string
  rol: string
}

export type ClienteConfiguracionKpiKamDb = {
  cliente_id: string
  cliente_nombre: string
  kam_user_id: string | null
  kam_nombre: string | null
  presupuesto: number | null
}

export type CatalogoConfiguracionKpiKamDb = {
  puede_configurar: boolean
  usuarios: UsuarioConfiguracionKpiKamDb[]
  clientes: ClienteConfiguracionKpiKamDb[]
}

export type ParametroKpiKamDb = {
  codigo: CodigoKpiKam
  nombre: string
  descripcion: string | null
  aplica: boolean
  peso: number
  meta: number | null
  rangos_puntuacion: RangoPuntuacionKpi[]
  reglas_criticas: ReglaCriticaKpi[]
  origen: "GENERAL" | "CLIENTE"
  vigente_desde: string
}

export type CatalogoParametrosKpiKamDb = {
  puede_configurar: boolean
  clientes: Array<{ id: string; nombre: string }>
  configuraciones: ParametroKpiKamDb[]
}

export type EstadoCompromisoKpiKamDb =
  | "PENDIENTE"
  | "EN_GESTION"
  | "CUMPLIDO"
  | "VENCIDO"
  | "CANCELADO"

export type PrioridadCompromisoKpiKamDb = "BAJA" | "MEDIA" | "ALTA"

export type ClienteCompromisoKpiKamDb = {
  cliente_id: string
  cliente_nombre: string
  kam_user_id: string
  kam_nombre: string | null
}

export type CompromisoKpiKamDb = {
  id: string
  descripcion: string
  cliente_id: string
  cliente_nombre: string
  kam_user_id: string
  kam_nombre: string | null
  fecha_creacion: string
  fecha_limite: string
  estado: Exclude<EstadoCompromisoKpiKamDb, "VENCIDO">
  estado_efectivo: EstadoCompromisoKpiKamDb
  prioridad: PrioridadCompromisoKpiKamDb
  fecha_cumplimiento: string | null
  observaciones: string | null
  motivo_cancelacion: string | null
}

export type CatalogoCompromisosKpiKamDb = {
  puede_gestionar: boolean
  clientes: ClienteCompromisoKpiKamDb[]
  compromisos: CompromisoKpiKamDb[]
}

export type PropuestaPresupuestoKpiKamDb = {
  cliente_id: string
  periodo_desde: string
  periodo_hasta: string
  meses_base: number
  meses_con_ventas: number
  venta_facturada_promedio: number
  devoluciones_promedio: number
  ajustes_promedio: number
  venta_neta_promedio: number
}

export async function obtenerCatalogoConfiguracionKpiKamDb(periodo: string) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_catalogo_configuracion",
    { p_periodo: `${periodo.slice(0, 7)}-01` },
  )

  if (error) {
    throw new Error(
      `No se pudo cargar la configuración KPI KAM: ${error.message}`,
    )
  }

  const catalogo = (data ?? {}) as Partial<CatalogoConfiguracionKpiKamDb>
  return {
    puede_configurar: Boolean(catalogo.puede_configurar),
    usuarios: Array.isArray(catalogo.usuarios) ? catalogo.usuarios : [],
    clientes: Array.isArray(catalogo.clientes) ? catalogo.clientes : [],
  } satisfies CatalogoConfiguracionKpiKamDb
}

export async function obtenerCatalogoParametrosKpiKamDb(
  periodo: string,
  clienteId?: string | null,
) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_catalogo_parametros",
    {
      p_periodo: `${periodo.slice(0, 7)}-01`,
      p_cliente_id: clienteId ?? null,
    },
  )

  if (error) {
    throw new Error(`No se pudieron cargar las metas KPI: ${error.message}`)
  }

  const catalogo = (data ?? {}) as Partial<CatalogoParametrosKpiKamDb>
  const configuraciones = Array.isArray(catalogo.configuraciones)
    ? catalogo.configuraciones
        .filter((fila) => esCodigoKpi(String(fila.codigo)))
        .map((fila): ParametroKpiKamDb => ({
          ...fila,
          codigo: fila.codigo as CodigoKpiKam,
          nombre: String(fila.nombre ?? fila.codigo),
          descripcion: fila.descripcion == null
            ? null
            : String(fila.descripcion),
          aplica: Boolean(fila.aplica),
          peso: Number(fila.peso ?? 0),
          meta: fila.meta == null ? null : Number(fila.meta),
          rangos_puntuacion: Array.isArray(fila.rangos_puntuacion)
            ? fila.rangos_puntuacion
            : [],
          reglas_criticas: Array.isArray(fila.reglas_criticas)
            ? fila.reglas_criticas
            : [],
          origen: fila.origen === "CLIENTE" ? "CLIENTE" : "GENERAL",
          vigente_desde: String(fila.vigente_desde ?? ""),
        }))
    : []

  return {
    puede_configurar: Boolean(catalogo.puede_configurar),
    clientes: Array.isArray(catalogo.clientes) ? catalogo.clientes : [],
    configuraciones,
  } satisfies CatalogoParametrosKpiKamDb
}

export async function guardarParametrosKpiKamDb(datos: {
  periodo: string
  clienteId?: string | null
  configuraciones: Array<{
    codigo: CodigoKpiKam
    aplica: boolean
    peso: number
    meta: number | null
    rangos_puntuacion: RangoPuntuacionKpi[]
    reglas_criticas: ReglaCriticaKpi[]
  }>
}) {
  const { error } = await supabase.rpc("com_kpi_kam_guardar_parametros", {
    p_periodo: `${datos.periodo.slice(0, 7)}-01`,
    p_cliente_id: datos.clienteId ?? null,
    p_configuraciones: datos.configuraciones,
  })

  if (error) {
    throw new Error(`No se pudieron guardar las metas KPI: ${error.message}`)
  }
}

export async function obtenerCatalogoCompromisosKpiKamDb(periodo: string) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_catalogo_compromisos",
    { p_periodo: `${periodo.slice(0, 7)}-01` },
  )

  if (error) {
    throw new Error(
      `No se pudieron cargar los compromisos: ${error.message}`,
    )
  }

  const catalogo = (data ?? {}) as Partial<CatalogoCompromisosKpiKamDb>
  return {
    puede_gestionar: Boolean(catalogo.puede_gestionar),
    clientes: Array.isArray(catalogo.clientes) ? catalogo.clientes : [],
    compromisos: Array.isArray(catalogo.compromisos)
      ? catalogo.compromisos
      : [],
  } satisfies CatalogoCompromisosKpiKamDb
}

export async function guardarCompromisoKpiKamDb(datos: {
  id?: string | null
  clienteId: string
  descripcion: string
  fechaLimite: string
  prioridad: PrioridadCompromisoKpiKamDb
  observaciones?: string | null
}) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_guardar_compromiso",
    {
      p_id: datos.id ?? null,
      p_cliente_id: datos.clienteId,
      p_descripcion: datos.descripcion,
      p_fecha_limite: datos.fechaLimite,
      p_prioridad: datos.prioridad,
      p_observaciones: datos.observaciones ?? null,
    },
  )

  if (error) {
    throw new Error(`No se pudo guardar el compromiso: ${error.message}`)
  }
  return String(data ?? "")
}

export async function actualizarEstadoCompromisoKpiKamDb(datos: {
  id: string
  estado: Exclude<EstadoCompromisoKpiKamDb, "VENCIDO">
  motivoCancelacion?: string | null
  fechaCumplimiento?: string | null
}) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_actualizar_estado_compromiso",
    {
      p_id: datos.id,
      p_estado: datos.estado,
      p_motivo_cancelacion: datos.motivoCancelacion ?? null,
      p_fecha_cumplimiento: datos.fechaCumplimiento ?? null,
    },
  )

  if (error) {
    throw new Error(`No se pudo actualizar el compromiso: ${error.message}`)
  }
  return String(data ?? "")
}

export async function obtenerPropuestaPresupuestoKpiKamDb(periodo: string) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_propuesta_presupuesto",
    { p_periodo: `${periodo.slice(0, 7)}-01` },
  )

  if (error) {
    throw new Error(
      `No se pudo calcular la propuesta de presupuesto: ${error.message}`,
    )
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    (fila): PropuestaPresupuestoKpiKamDb => ({
      cliente_id: String(fila.cliente_id ?? ""),
      periodo_desde: String(fila.periodo_desde ?? ""),
      periodo_hasta: String(fila.periodo_hasta ?? ""),
      meses_base: Number(fila.meses_base ?? 0),
      meses_con_ventas: Number(fila.meses_con_ventas ?? 0),
      venta_facturada_promedio: Number(fila.venta_facturada_promedio ?? 0),
      devoluciones_promedio: Number(fila.devoluciones_promedio ?? 0),
      ajustes_promedio: Number(fila.ajustes_promedio ?? 0),
      venta_neta_promedio: Number(fila.venta_neta_promedio ?? 0),
    }),
  )
}

export async function habilitarUsuarioKpiKamDb(userId: string) {
  const { error } = await supabase.rpc("com_kpi_kam_habilitar_usuario", {
    p_user_id: userId,
  })
  if (error) {
    throw new Error(`No se pudo habilitar el usuario KAM: ${error.message}`)
  }
}

export async function guardarAsignacionKpiKamDb(datos: {
  periodo: string
  clienteId: string
  kamUserId: string | null
}) {
  const { error } = await supabase.rpc("com_kpi_kam_guardar_asignacion", {
    p_periodo: `${datos.periodo.slice(0, 7)}-01`,
    p_cliente_id: datos.clienteId,
    p_kam_user_id: datos.kamUserId,
  })
  if (error) {
    throw new Error(`No se pudo guardar el responsable: ${error.message}`)
  }
}

export async function guardarPresupuestoKpiKamDb(datos: {
  periodo: string
  clienteId: string
  presupuesto: number
}) {
  const { error } = await supabase.rpc("com_kpi_kam_guardar_presupuesto", {
    p_periodo: `${datos.periodo.slice(0, 7)}-01`,
    p_cliente_id: datos.clienteId,
    p_presupuesto: datos.presupuesto,
  })
  if (error) {
    throw new Error(`No se pudo guardar el presupuesto: ${error.message}`)
  }
}

export type EstadoCoberturaKpiKamDb =
  | "ACTIVO"
  | "DESCODIFICADO"
  | "SUSPENDIDO"
  | "NO_AUTORIZADO"
  | "PENDIENTE"
  | "INACTIVO"

export type CatalogoCoberturaKpiKamDb = {
  puede_configurar: boolean
  puede_importar: boolean
  puede_gestionar_locales: boolean
  clientes: Array<{ id: string; nombre: string }>
  locales: Array<{
    id: string
    codigo: string
    nombre: string
    activo: boolean
  }>
  productos: Array<{
    id: string
    codigo: string
    nombre: string
    autorizado: boolean
  }>
  posiciones: Array<{
    id: string
    cliente_id: string
    local_id: string
    local_codigo: string
    local_nombre: string
    producto_id: string
    producto_codigo: string
    producto_nombre: string
    es_objetivo: boolean
    estado: EstadoCoberturaKpiKamDb
    vigente_desde: string
    vigente_hasta: string | null
    motivo: string | null
    origen: "MANUAL" | "FAVORITA_REPORTE" | "OPORTUNIDAD"
    reportado_ultimo: boolean | null
    ultima_fecha_reporte: string | null
    confirmado_en: string | null
  }>
  importaciones: Array<{
    id: string
    archivo_nombre: string
    fecha_reporte: string
    tipo: "INICIAL_QUITO" | "SEGUIMIENTO"
    locales_archivo: number
    posiciones_importadas: number
    locales_ignorados: number
    skus_no_encontrados: string[]
    creado_en: string
  }>
  candidatos_locales: CandidatoLocalKpiKamDb[]
}

export type CandidatoLocalKpiKamDb = {
  clave: string
  tipo: "BODEGA" | "DOCUMENTO"
  referencia_id: string
  codigo_sugerido: string
  nombre: string
  origen: string
}

export async function obtenerCatalogoCoberturaKpiKamDb(
  clienteId: string | null,
  fecha: string,
) {
  const [{ data, error }, candidatosResultado] = await Promise.all([
    supabase.rpc(
      "com_kpi_kam_catalogo_cobertura",
      { p_cliente_id: clienteId, p_fecha: fecha },
    ),
    clienteId
      ? supabase.rpc("com_kpi_kam_candidatos_locales", {
          p_cliente_id: clienteId,
        })
      : Promise.resolve({ data: [], error: null }),
  ])
  if (error) {
    throw new Error(`No se pudo cargar la cobertura: ${error.message}`)
  }

  const candidatosNoDisponibles = candidatosResultado.error?.message
    .toLocaleLowerCase("es")
    .includes("com_kpi_kam_candidatos_locales")
  if (candidatosResultado.error && !candidatosNoDisponibles) {
    throw new Error(
      `No se pudieron cargar los locales existentes: ${candidatosResultado.error.message}`,
    )
  }

  const catalogo = (data ?? {}) as Partial<CatalogoCoberturaKpiKamDb>
  return {
    puede_configurar: Boolean(catalogo.puede_configurar),
    puede_importar: Boolean(catalogo.puede_importar),
    puede_gestionar_locales: Boolean(catalogo.puede_gestionar_locales),
    clientes: Array.isArray(catalogo.clientes) ? catalogo.clientes : [],
    locales: Array.isArray(catalogo.locales) ? catalogo.locales : [],
    productos: Array.isArray(catalogo.productos) ? catalogo.productos : [],
    posiciones: Array.isArray(catalogo.posiciones) ? catalogo.posiciones : [],
    importaciones: Array.isArray(catalogo.importaciones) ? catalogo.importaciones : [],
    candidatos_locales: Array.isArray(candidatosResultado.data)
      ? candidatosResultado.data as CandidatoLocalKpiKamDb[]
      : [],
  } satisfies CatalogoCoberturaKpiKamDb
}

export async function guardarLocalMonitoreadoKpiKamDb(datos: {
  clienteId: string
  codigo: string
  nombre: string
}) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_guardar_local_monitoreado",
    {
      p_cliente_id: datos.clienteId,
      p_codigo_externo: datos.codigo,
      p_nombre: datos.nombre,
    },
  )
  if (error) {
    throw new Error(`No se pudo guardar el local: ${error.message}`)
  }
  return String(data ?? "")
}

export async function incorporarLocalesExistentesKpiKamDb(datos: {
  clienteId: string
  candidatos: CandidatoLocalKpiKamDb[]
}) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_incorporar_locales_existentes",
    {
      p_cliente_id: datos.clienteId,
      p_candidatos: datos.candidatos.map((item) => ({
        tipo: item.tipo,
        referencia_id: item.referencia_id,
      })),
    },
  )
  if (error) {
    throw new Error(`No se pudieron incorporar los locales: ${error.message}`)
  }
  const resultado = (data ?? {}) as {
    incorporados?: number
    ya_existian?: number
  }
  return {
    incorporados: Number(resultado.incorporados ?? 0),
    yaExistian: Number(resultado.ya_existian ?? 0),
  }
}

export type ResultadoImportacionCoberturaKpiKamDb = {
  importacion_id: string
  locales_monitoreados: number
  posiciones_importadas: number
  locales_ignorados: number
  skus_no_encontrados: string[]
}

export async function importarCoberturaFavoritaKpiKamDb(datos: {
  clienteId: string
  archivoNombre: string
  archivoHash: string
  fechaReporte: string
  inicialQuito: boolean
  filas: FilaCoberturaFavorita[]
}) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_importar_alcance_favorita",
    {
      p_cliente_id: datos.clienteId,
      p_archivo_nombre: datos.archivoNombre,
      p_archivo_hash: datos.archivoHash,
      p_fecha_reporte: datos.fechaReporte,
      p_inicial_quito: datos.inicialQuito,
      p_filas: datos.filas,
    },
  )
  if (error) {
    throw new Error(`No se pudo importar el reporte: ${error.message}`)
  }
  const resultado = (data ?? {}) as Partial<ResultadoImportacionCoberturaKpiKamDb>
  return {
    importacion_id: String(resultado.importacion_id ?? ""),
    locales_monitoreados: Number(resultado.locales_monitoreados ?? 0),
    posiciones_importadas: Number(resultado.posiciones_importadas ?? 0),
    locales_ignorados: Number(resultado.locales_ignorados ?? 0),
    skus_no_encontrados: Array.isArray(resultado.skus_no_encontrados)
      ? resultado.skus_no_encontrados.map(String)
      : [],
  } satisfies ResultadoImportacionCoberturaKpiKamDb
}

export async function guardarCoberturaKpiKamDb(datos: {
  clienteId: string
  localId: string
  productoId: string
  esObjetivo: boolean
  estado: EstadoCoberturaKpiKamDb
  vigenteDesde: string
  motivo: string | null
}) {
  const { data, error } = await supabase.rpc("com_kpi_kam_guardar_cobertura", {
    p_cliente_id: datos.clienteId,
    p_bodega_id: datos.localId,
    p_producto_id: datos.productoId,
    p_es_objetivo: datos.esObjetivo,
    p_estado: datos.estado,
    p_vigente_desde: datos.vigenteDesde,
    p_motivo: datos.motivo,
  })
  if (error) {
    throw new Error(`No se pudo guardar la cobertura: ${error.message}`)
  }
  return String(data ?? "")
}

export async function revisarCoberturaKpiKamDb(datos: {
  clienteId: string
  localId: string
  productoId: string
  estado: EstadoCoberturaKpiKamDb
  fechaRevision: string
}) {
  const { data, error } = await supabase.rpc(
    "com_kpi_kam_revisar_cobertura",
    {
      p_cliente_id: datos.clienteId,
      p_local_id: datos.localId,
      p_producto_id: datos.productoId,
      p_estado: datos.estado,
      p_fecha_revision: datos.fechaRevision,
    },
  )
  if (error) {
    throw new Error(`No se pudo registrar la revisión: ${error.message}`)
  }
  return String(data ?? "")
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

function numero(valor: unknown, respaldo = 0) {
  const convertido = Number(valor)
  return Number.isFinite(convertido) ? convertido : respaldo
}

function numeroOpcional(valor: unknown) {
  if (valor == null) return null
  const convertido = Number(valor)
  return Number.isFinite(convertido) ? convertido : null
}

export async function obtenerBasesProvisionalesKpiKamDb(
  periodo: string,
  kamUserId?: string | null,
  clienteId?: string | null,
) {
  const parametros = {
    p_periodo: `${periodo.slice(0, 7)}-01`,
    p_kam_user_id: kamUserId ?? null,
    p_cliente_id: clienteId ?? null,
  }
  const [{ data, error }, rotacionResultado] = await Promise.all([
    supabase.rpc("com_kpi_kam_base_provisional", parametros),
    supabase.rpc("com_kpi_kam_rotacion", parametros),
  ])

  if (error) {
    throw new Error(
      `No se pudo construir la base provisional KPI KAM: ${error.message}`,
    )
  }

  const funcionRotacionNoInstalada = rotacionResultado.error?.message
    .toLocaleLowerCase("es")
    .includes("com_kpi_kam_rotacion")
  if (rotacionResultado.error && !funcionRotacionNoInstalada) {
    throw new Error(`No se pudo cargar la rotación diaria: ${rotacionResultado.error.message}`)
  }
  const rotacionPorCliente = new Map(
    ((rotacionResultado.data ?? []) as RotacionKpiKamDb[]).map((fila) => [
      fila.cliente_id,
      fila,
    ]),
  )

  return ((data ?? []) as BaseProvisionalDb[]).map<BaseCalculoKpiKam>(
    (fila) => {
      const rotacion = rotacionPorCliente.get(fila.cliente_id)
      return ({
      periodo: fila.periodo,
      kamUserId: fila.kam_user_id,
      clienteId: fila.cliente_id,
      clienteNombre: fila.cliente_nombre,
      ventaBruta: numero(fila.venta_bruta),
      ventaFacturadaNeta: numero(fila.venta_facturada_neta),
      devolucionesValor: numero(fila.devoluciones_valor),
      ajustesVentaNeta: numero(fila.ajustes_venta_neta),
      fugasComercialesValor: numero(fila.fugas_comerciales_valor),
      presupuesto: numeroOpcional(fila.presupuesto),
      costoProducto: numeroOpcional(fila.costo_producto),
      transporte: numeroOpcional(fila.transporte),
      costosVariablesComerciales: numeroOpcional(
        fila.costos_variables_comerciales,
      ),
      promocionesCostoAdicional: numeroOpcional(
        fila.promociones_costo_adicional,
      ),
      contribucionAnterior: numeroOpcional(fila.contribucion_anterior),
      posicionesSkuLocalActivas: numero(
        fila.posiciones_sku_local_activas,
      ),
      posicionesSkuLocalObjetivo: numero(
        fila.posiciones_sku_local_objetivo,
      ),
      rotacionDiariaPromedio: numeroOpcional(
        rotacion?.rotacion_diaria_promedio,
      ),
      observacionesRotacion: numero(rotacion?.observaciones),
      compromisosCumplidosATiempo: numero(
        fila.compromisos_cumplidos_a_tiempo,
      ),
      compromisosConVencimiento: numero(
        fila.compromisos_con_vencimiento,
      ),
      advertencias: Array.isArray(fila.advertencias)
        ? fila.advertencias.filter(Boolean)
        : [],
      })
    },
  )
}

export type ResumenClientesNuevosKpiKamDb = {
  desde: string
  hasta: string
  meta: number
  actual: number
  porcentaje: number
  puede_configurar: boolean
}

export async function obtenerClientesNuevosKpiKamDb(
  periodo: string,
  kamUserId?: string | null,
) {
  const { data, error } = await supabase.rpc("com_kpi_kam_clientes_nuevos", {
    p_periodo: `${periodo.slice(0, 7)}-01`,
    p_kam_user_id: kamUserId ?? null,
  })
  if (error) {
    const noInstalada = error.message.toLocaleLowerCase("es")
      .includes("com_kpi_kam_clientes_nuevos")
    if (noInstalada) return null
    throw new Error(`No se pudo cargar el KPI de clientes nuevos: ${error.message}`)
  }
  const fila = (data ?? {}) as Partial<ResumenClientesNuevosKpiKamDb>
  return {
    desde: String(fila.desde ?? ""),
    hasta: String(fila.hasta ?? ""),
    meta: numero(fila.meta, 1),
    actual: numero(fila.actual),
    porcentaje: numero(fila.porcentaje),
    puede_configurar: Boolean(fila.puede_configurar),
  } satisfies ResumenClientesNuevosKpiKamDb
}

export async function guardarMetaClientesNuevosKpiKamDb(
  periodo: string,
  kamUserId: string | null,
  meta: number,
) {
  const { error } = await supabase.rpc("com_kpi_kam_guardar_meta_clientes_nuevos", {
    p_periodo: `${periodo.slice(0, 7)}-01`,
    p_kam_user_id: kamUserId,
    p_meta: meta,
  })
  if (error) throw new Error(`No se pudo guardar la meta trimestral: ${error.message}`)
}
