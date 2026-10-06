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

export async function catalogoKardex() {
  const { data, error } = await supabase.rpc("inv_kardex_catalogo")
  if (error) throw new Error(`No se pudo cargar el Kardex. ${error.message}`)
  return data as { articulos: ArticuloKardex[]; lotes: LoteKardex[] }
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
