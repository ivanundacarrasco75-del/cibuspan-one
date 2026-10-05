import { supabase } from "../lib/supabase"

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
  locales: Array<{ id: string; codigo: string; nombre: string }>
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

  if (registrosBase.length > 0) {
    const ids = registrosBase.map((item) => item.id).filter(Boolean)
    const { data: detalles, error: errorDetalles } = await supabase
      .from("com_visitas_campo_sku")
      .select("id, datos_ia")
      .in("id", ids)

    if (!errorDetalles) {
      for (const detalle of detalles ?? []) {
        carasPorRegistro.set(String(detalle.id), leerCarasPercha(detalle.datos_ia))
      }
    }
  }

  const registros = registrosBase.map((item) => ({
    ...item,
    caras_percha: carasPorRegistro.get(item.id) ?? null,
  }))

  const resumenBase = { ...VACIO.resumen, ...(fila.resumen ?? {}) }
  const sinPercharConStock = registros.filter((item) =>
    item.caras_percha === 0 && (item.stock_local_unidades ?? 0) > 0
  ).length

  return {
    ...VACIO,
    ...fila,
    clientes: Array.isArray(fila.clientes) ? fila.clientes : [],
    locales: Array.isArray(fila.locales) ? fila.locales : [],
    productos: Array.isArray(fila.productos) ? fila.productos : [],
    registros,
    resumen: {
      ...resumenBase,
      sin_perchar_con_stock: sinPercharConStock,
    },
  } satisfies CatalogoCampoComercial
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
  const { data, error } = await supabase.rpc("com_kpi_campo_guardar_visita", {
    p_datos: datos,
  })
  if (error) throw new Error(`No se pudo guardar la visita: ${error.message}`)
  return String(data ?? "")
}

function leerCarasPercha(datosIa: unknown) {
  if (!datosIa || typeof datosIa !== "object" || Array.isArray(datosIa)) return null
  const valor = (datosIa as Record<string, unknown>).caras_percha
  if (valor === null || valor === undefined || valor === "") return null
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero < 0) return null
  return Math.trunc(numero)
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
