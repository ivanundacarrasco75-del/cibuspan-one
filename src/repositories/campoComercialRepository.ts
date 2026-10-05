import { supabase } from "../lib/supabase"
import { leerCarasPercha, type RegistroSupervision } from "../utils/supervisionCampo"
import { puntoValido, type LocalCampo, type GeorreferenciaCampo, type FotoCampo } from "../utils/georreferenciaCampo"

export type PresenciaPercha = "PRESENTE" | "AUSENTE" | "NO_REVISADO"

export type LecturaFavorita = {
  local_nombre: string | null
  codigo_barras: string | null
  codigo_referencia: string | null
  nombre_producto: string | null
  fecha_fuente: string | null
  precio_comercio: number | null
  precio_afiliado: number | null
  rotacion_diaria_unidades: number | null
  venta_diaria_valor: number | null
  prediccion_venta_unidades: number | null
  participacion_clase: number | null
  participacion_subclase: number | null
  stock_local_unidades: number | null
  dias_inventario_local: number | null
  stock_cd_cajas: number | null
  unidades_por_caja: number | null
  dias_inventario_cd: number | null
  fecha_ultimo_pedido: string | null
  cantidad_ultimo_pedido: number | null
  fecha_ultimo_despacho: string | null
  cantidad_ultimo_despacho: number | null
  confianza: number
  advertencias: string[]
}

export type CatalogoCampoComercial = {
  rol: string
  puede_administrar: boolean
  clientes: Array<{ id: string; nombre: string }>
  locales: LocalCampo[]
  aviso_georreferencia?: string
  productos: Array<{ id: string; codigo: string; nombre: string; autorizado: boolean }>
  resumen: {
    locales_visitados: number
    posiciones_revisadas: number
    codificadas: number
    presentes_percha: number
    quiebres_stock: number
    sin_perchar_con_stock: number
    rotacion_diaria_promedio: number | null
    dias_inventario_promedio: number | null
  }
  registros: Array<{
    id: string
    fecha: string
    cliente_id: string
    local_id: string
    local_nombre: string
    producto_id: string
    producto_nombre: string
    producto_codigo: string
    codificado_app: boolean | null
    presencia_percha: PresenciaPercha
    caras_percha: number | null
    rotacion_diaria_unidades: number | null
    stock_local_unidades: number | null
    dias_inventario_local: number | null
    observaciones: string | null
    georreferencia?: GeorreferenciaCampo | null
    fotos_georreferencia?: FotoCampo[]
  }>
}

const VACIO: CatalogoCampoComercial = {
  rol: "",
  puede_administrar: false,
  clientes: [],
  locales: [],
  productos: [],
  resumen: {
    locales_visitados: 0,
    posiciones_revisadas: 0,
    codificadas: 0,
    presentes_percha: 0,
    quiebres_stock: 0,
    sin_perchar_con_stock: 0,
    rotacion_diaria_promedio: null,
    dias_inventario_promedio: null,
  },
  registros: [],
}

export async function obtenerCatalogoCampoComercial(
  clienteId: string | null,
  desde: string,
  hasta: string,
) {
  const { data, error } = await supabase.rpc("com_kpi_campo_catalogo", {
    p_cliente_id: clienteId,
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw new Error(`No se pudo cargar el trabajo de campo: ${error.message}`)

  const fila = (data ?? {}) as Partial<CatalogoCampoComercial>
  const registrosBase = Array.isArray(fila.registros) ? fila.registros : []
  const carasPorRegistro = new Map<string, number | null>()
  const evidenciaPorRegistro = new Map<string, { georreferencia: GeorreferenciaCampo | null; fotos_georreferencia: FotoCampo[] }>()

  if (registrosBase.length > 0) {
    const ids = registrosBase.map((item) => item.id).filter(Boolean)
    const { data: detalles, error: errorDetalles } = await supabase
      .from("com_visitas_campo_sku")
      .select("id, datos_ia")
      .in("id", ids)

    if (!errorDetalles) {
      for (const detalle of detalles ?? []) {
        carasPorRegistro.set(String(detalle.id), leerCarasPercha(detalle.datos_ia))
        evidenciaPorRegistro.set(String(detalle.id), leerEvidenciaCampo(detalle.datos_ia))
      }
    }
  }

  const registros = registrosBase.map((item) => ({
    ...item,
    caras_percha: carasPorRegistro.get(item.id) ?? null,
    ...evidenciaPorRegistro.get(item.id),
  }))

  const resumenBase = { ...VACIO.resumen, ...(fila.resumen ?? {}) }
  const sinPercharConStock = registros.filter((item) =>
    item.caras_percha === 0 && (item.stock_local_unidades ?? 0) > 0
  ).length
  const localesBase = Array.isArray(fila.locales) ? fila.locales : []
  const { data: referencias, error: errorReferencias } = await supabase.rpc("com_kpi_campo_georeferencias", { p_cliente_id: clienteId })
  const porId = new Map((Array.isArray(referencias) ? referencias : []).map((r: LocalCampo) => [r.id, r]))

  return {
    ...VACIO,
    ...fila,
    clientes: Array.isArray(fila.clientes) ? fila.clientes : [],
    locales: localesBase.map((l) => ({ ...l, ...(porId.get(l.id) ?? {}) })),
    aviso_georreferencia: errorReferencias ? "No se pudieron cargar las coordenadas de los locales. La visita sigue disponible; no se puede confirmar la ubicación del local." : "",
    productos: Array.isArray(fila.productos) ? fila.productos : [],
    registros,
    resumen: {
      ...resumenBase,
      sin_perchar_con_stock: sinPercharConStock,
    },
  } satisfies CatalogoCampoComercial
}

export async function guardarGeorreferenciaLocal(local: LocalCampo) {
  if (!puntoValido(local)) throw new Error("Ingresa latitud y longitud válidas.")
  const { data, error } = await supabase.rpc("com_kpi_campo_guardar_georreferencia", {
    p_local_id: local.id, p_direccion: local.direccion ?? "", p_latitud: local.latitud,
    p_longitud: local.longitud, p_radio_metros: local.radio_metros ?? 150,
  })
  if (error) throw new Error(`No se pudo registrar la ubicación del local: ${error.message}`)
  if (data !== local.id) throw new Error("No se confirmó la actualización del local. Actualiza antes de volver a intentar.")
}

function leerEvidenciaCampo(datos: unknown) {
  const evidencia = (datos && typeof datos === "object" ? datos : {}) as Record<string, unknown>
  return { georreferencia: (evidencia.georreferencia_visita ?? null) as GeorreferenciaCampo | null,
    fotos_georreferencia: Array.isArray(evidencia.fotos_georreferencia) ? evidencia.fotos_georreferencia as FotoCampo[] : [] }
}

export async function obtenerFotosCampo(rutas: string[]) {
  if (!rutas.length) return []
  const { data, error } = await supabase.storage.from("visitas-campo").createSignedUrls(rutas, 600)
  if (error) throw new Error(`No se pudieron abrir las fotos: ${error.message}`)
  if (data.some((foto) => foto.error || !foto.signedUrl)) throw new Error("No se pudo abrir alguna foto. Actualiza e intenta nuevamente.")
  return data.map((foto) => ({ ruta: foto.path!, url: foto.signedUrl! }))
}

export async function subirImagenesCampo(
  archivos: File[],
  tipo: "captura" | "percha",
) {
  const { data: usuario } = await supabase.auth.getUser()
  const userId = usuario.user?.id
  if (!userId) throw new Error("La sesión no es válida.")

  return Promise.all(archivos.map(async (archivo, indice) => {
    const extension = extensionSegura(archivo)
    const nombre = `${userId}/${fechaHoy()}/${tipo}-${Date.now()}-${indice}-${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage
      .from("visitas-campo")
      .upload(nombre, archivo, { contentType: archivo.type, upsert: false })
    if (error) throw new Error(`No se pudo subir ${archivo.name}: ${error.message}`)
    return nombre
  }))
}

export async function analizarCapturasFavorita(
  archivos: File[],
  onProgreso?: (porcentaje: number, mensaje: string) => void,
) {
  const { leerCapturasFavoritaOcr } = await import("../utils/ocrFavorita")
  return leerCapturasFavoritaOcr(archivos, onProgreso)
}

export type GuardarVisitaCampo = {
  cliente_id: string
  local_id: string
  producto_id: string
  fecha_visita: string
  visitado_en: string
  latitud: number | null
  longitud: number | null
  precision_metros: number | null
  codificado_app: boolean | null
  presencia_percha: PresenciaPercha
  capturas_app: string[]
  fotos_percha: string[]
  observaciones: string | null
  observaciones_sku: string | null
  confianza_ia: number | null
  datos_ia: LecturaFavorita | Record<string, unknown>
  nombre_reportado?: string | null
} & Partial<LecturaFavorita>

export async function guardarVisitaCampo(datos: GuardarVisitaCampo) {
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser()
  if (errorSesion || !sesion.user) throw new Error("La sesión no es válida.")
  const { data: perfil, error: errorPerfil } = await supabase.from("app_profiles")
    .select("nombre, rol").eq("user_id", sesion.user.id).single()
  if (errorPerfil || !perfil) throw new Error("No se pudo verificar el responsable de la visita.")
  const caras = (datos.datos_ia as Record<string, unknown>).caras_percha
  if (caras != null && leerCarasPercha(datos.datos_ia) === null) {
    throw new Error("Caras en percha debe ser un entero desde cero.")
  }
  const { data, error } = await supabase.rpc("com_kpi_campo_guardar_visita", {
    p_datos: {
      ...datos,
      datos_ia: {
        ...datos.datos_ia,
        responsable_id: sesion.user.id,
        responsable_rol: perfil.rol,
        responsable_nombre: perfil.nombre || sesion.user.email || "Sin nombre",
      },
    },
  })
  if (error) throw new Error(`No se pudo guardar la visita: ${error.message}`)
  return String(data ?? "")
}

export async function obtenerSupervisionCampo(desde: string, hasta: string, clienteId: string | null) {
  const registros: RegistroSupervision[] = []
  for (let inicio = 0; ; inicio += 500) {
    let consulta = supabase.from("com_visitas_campo_sku").select(`
      id, producto_id, datos_ia, stock_local_unidades, rotacion_diaria_unidades,
      presencia_percha, observaciones,
      producto:productos(nombre),
      visita:com_visitas_campo!inner(fecha_visita, visitado_en, cliente_id,
        local_monitoreado_id, registrado_por, estado,
        local:com_locales_monitoreados(nombre), responsable:app_profiles(nombre, rol))
    `).eq("visita.estado", "CONFIRMADA")
      .gte("visita.fecha_visita", desde).lte("visita.fecha_visita", hasta)
      .order("id").range(inicio, inicio + 499)
    if (clienteId) consulta = consulta.eq("visita.cliente_id", clienteId)
    const { data, error } = await consulta
    if (error) throw new Error(`No se pudo cargar la supervisión: ${error.message}`)
    for (const fila of data ?? []) {
      const visita = fila.visita as unknown as {
        fecha_visita: string; visitado_en: string; cliente_id: string;
        local_monitoreado_id: string; registrado_por: string;
        local: { nombre: string } | null; responsable: { nombre: string | null; rol: string } | null;
      }
      const datos = (fila.datos_ia ?? {}) as Record<string, unknown>
      const autorGuardado = datos.responsable_id === visita.registrado_por
      const rol = autorGuardado && typeof datos.responsable_rol === "string"
        ? datos.responsable_rol : visita.responsable?.rol ?? null
      registros.push({
        id: fila.id, fecha: visita.fecha_visita, visitado_en: visita.visitado_en,
        cliente_id: visita.cliente_id, local_id: visita.local_monitoreado_id,
        local_nombre: visita.local?.nombre ?? "Local", producto_id: fila.producto_id,
        producto_nombre: (fila.producto as unknown as { nombre: string } | null)?.nombre ?? "SKU",
        responsable_id: visita.registrado_por,
        responsable_nombre: autorGuardado && typeof datos.responsable_nombre === "string"
          ? datos.responsable_nombre : visita.responsable?.nombre ?? "Responsable sin identificar",
        responsable_rol: rol, caras_percha: leerCarasPercha(datos),
        stock_local_unidades: fila.stock_local_unidades,
        rotacion_diaria_unidades: fila.rotacion_diaria_unidades,
        presencia_percha: fila.presencia_percha, observaciones: fila.observaciones,
        ...leerEvidenciaCampo(datos),
      })
    }
    if ((data?.length ?? 0) < 500) return registros
  }
}

function extensionSegura(archivo: File) {
  if (archivo.type === "image/png") return "png"
  if (archivo.type === "image/webp") return "webp"
  return "jpg"
}

function fechaHoy() {
  const ahora = new Date()
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 10)
}
