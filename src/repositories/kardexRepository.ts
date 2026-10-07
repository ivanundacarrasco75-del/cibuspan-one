import { supabase } from "../lib/supabase"
import type { ArticuloKardex, TipoInventario } from "../utils/inventarioInicialExcel"

export type LoteKardex = {
  id: string; producto_id: string; lote: string; fecha_produccion: string
  fecha_vencimiento: string; cantidad: number; reservado: number
}
export type MovimientoKardex = {
  id: number; fecha: string; clase: string; cantidad: number; saldo: number
  lote: string | null; motivo: string; documento: string | null; responsable: string; creado_en: string
}
export type ConsultaKardex = { movimientos: MovimientoKardex[]; total: number; saldo_anterior: number; saldo_cierre: number }

export type InicioOctubre = {
  instalado: boolean; activo: boolean; puede_iniciar: boolean; fecha_corte?: string
  token?: string; lotes?: number; movimientos?: number; reservadas?: number; respaldo_id?: string; puede_descargar?: boolean
}

export async function consultarInicioOctubre(): Promise<InicioOctubre> {
  const { data, error } = await supabase.rpc("inv_inicio_estado")
  if (error?.code === "PGRST202" || error?.code === "42883") return { instalado: false, activo: false, puede_iniciar: false }
  if (error) throw new Error(`No se pudo revisar el inicio de octubre. ${error.message}`)
  return data as InicioOctubre
}

export async function iniciarOctubre(archivo: string, hash: string, fecha: string, lineas: LineaCargaInicial[], token: string) {
  const { data, error } = await supabase.rpc("inv_inicio_confirmar", {
    p_archivo: archivo, p_hash: hash, p_fecha: fecha, p_lineas: lineas, p_token: token,
  })
  if (error) throw new Error(error.message)
  if (!data?.id || !data?.respaldo_id) throw new Error("No se recibió la confirmación del inicio y su respaldo.")
  return data as { id: string; respaldo_id: string; repetido: boolean }
}

export async function descargarRespaldoInicio(id: string) {
  const { data, error } = await supabase.from("inv_respaldos_inicio").select("*").eq("id", id).single()
  if (error) throw new Error(`No se pudo descargar el respaldo. ${error.message}`)
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
  const enlace = document.createElement("a")
  enlace.href = url; enlace.download = `Respaldo-inventario-antes-octubre-${id}.json`; enlace.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function catalogoKardex() {
  const { data, error } = await supabase.rpc("inv_kardex_catalogo")
  if (error) throw new Error(`No se pudo cargar el Kardex. ${error.message}`)
  const catalogo = data as { articulos: ArticuloKardex[]; lotes: LoteKardex[] }
  if (catalogo.articulos.some((a) => a.tipo === "PRODUCTO_TERMINADO")) {
    const { data: productos, error: errorProductos } = await supabase.from("productos").select("id,vida_util_dias").eq("activo", true)
    if (errorProductos) throw new Error(`No se pudo consultar la vida útil de los productos. ${errorProductos.message}`)
    const vidas = new Map((productos ?? []).map((p) => [p.id, p.vida_util_dias]))
    catalogo.articulos = catalogo.articulos.map((a) => a.tipo === "PRODUCTO_TERMINADO" ? { ...a, vida_util_dias: vidas.get(a.id) ?? null } : a)
  }
  return catalogo
}

export async function consultarKardex(articulo: ArticuloKardex, desde: string, hasta: string, inicio = 0) {
  const { data, error } = await supabase.rpc("inv_kardex_consultar", {
    p_tipo: articulo.tipo, p_articulo_id: articulo.id, p_desde: desde || null, p_hasta: hasta || null,
    p_inicio: inicio, p_limite: 100,
  })
  if (error) throw new Error(error.message)
  return data as ConsultaKardex
}

export async function registrarMovimientoKardex(datos: {
  articulo: ArticuloKardex; loteId: string; fecha: string; clase: string; cantidad: number
  saldoEsperado: number; motivo: string; documento: string; solicitudId: string
}) {
  const { data, error } = await supabase.rpc("inv_kardex_registrar", {
    p_tipo: datos.articulo.tipo, p_articulo_id: datos.articulo.id, p_lote_id: datos.loteId || null,
    p_fecha: datos.fecha, p_clase: datos.clase, p_cantidad: datos.cantidad, p_saldo_esperado: datos.saldoEsperado,
    p_motivo: datos.motivo, p_documento: datos.documento, p_solicitud_id: datos.solicitudId,
  })
  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error("No se recibió la confirmación del movimiento.")
  return data as { id: number; repetido: boolean }
}

export type LineaCargaInicial = {
  tipo: TipoInventario; articulo_id: string; cantidad: number; costo_total: number | null
  lotes: Array<{ cantidad: number; lote: string; fecha_produccion: string; fecha_vencimiento: string }>
}
export async function cargarInventarioInicial(archivo: string, hash: string, fecha: string, lineas: LineaCargaInicial[]) {
  const { data, error } = await supabase.rpc("inv_kardex_cargar_inicial", {
    p_archivo: archivo, p_hash: hash, p_fecha: fecha, p_lineas: lineas,
  })
  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error("No se recibió la confirmación de la carga.")
  return data as { id: string; repetido: boolean }
}
