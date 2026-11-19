import { supabase } from "../lib/supabase"
import { periodoProduccionInicial } from "../utils/periodoProduccion"
import { calcularReposicion, ordenarReposicion, sumarDiasCompras } from "../utils/reposicionCompras"
import type { ArticuloKardex } from "../utils/inventarioInicialExcel"
import { consultarArranqueOperativo } from "./arranqueOperativoRepository"

async function leerConsumos(desde: string, hasta: string) {
  const consumos = new Map<string, number>()
  let ultimoId = 0
  const limite = 500
  while (true) {
    const { data, error } = await supabase.from("inv_kardex_movimientos")
      .select("id,articulo_id,cantidad")
      .eq("tipo", "MATERIA_PRIMA").eq("clase", "SALIDA").lt("cantidad", 0)
      .not("solicitud_datos->>solicitud_produccion", "is", null)
      .gte("fecha", desde).lte("fecha", hasta)
      .gt("id", ultimoId).order("id").limit(limite)
    if (error) throw new Error("No se pudieron consultar los consumos confirmados del Kardex.")
    if (data.length === 0) return consumos
    for (const movimiento of data) {
      consumos.set(movimiento.articulo_id, (consumos.get(movimiento.articulo_id) ?? 0) - Number(movimiento.cantidad))
    }
    ultimoId = data[data.length - 1].id
  }
}

export async function cargarComprasResumen() {
  const hoy = periodoProduccionInicial().desde
  const diasConsumo = 30
  const desde = sumarDiasCompras(hoy, -diasConsumo)
  const hasta = sumarDiasCompras(hoy, -1)
  const [catalogo, consumos, arranque] = await Promise.allSettled([
    supabase.rpc("inv_kardex_catalogo"),
    leerConsumos(desde, hasta),
    consultarArranqueOperativo(),
  ])
  if (catalogo.status === "rejected" || catalogo.value.error || !Array.isArray(catalogo.value.data?.articulos)) {
    throw new Error("No se pudo cargar el catálogo y los saldos del Kardex.")
  }
  const articulos = catalogo.value.data.articulos as ArticuloKardex[]
  const estadoArranque = arranque.status === "fulfilled" ? arranque.value : null
  const inicioMP = estadoArranque?.corte_mp?.fecha_inicio
    ?? (estadoArranque?.aplicado && estadoArranque.alcance !== "PT" ? estadoArranque.fecha_inicio : undefined)
  const saldoConciliado = !!inicioMP && inicioMP <= hoy
  const avisos = articulos.filter(articulo => articulo.tipo === "MATERIA_PRIMA").map(articulo => {
    const consumo = consumos.status === "fulfilled" ? consumos.value.get(articulo.id) : undefined
    const saldo = Number(articulo.saldo)
    return calcularReposicion({
      id: articulo.id, codigo: articulo.codigo, nombre: articulo.nombre, unidad: articulo.unidad,
      stock: articulo.iniciado && Number.isFinite(saldo) && saldo >= 0 ? saldo : null,
      consumoDiario: consumo && Number.isFinite(consumo) ? consumo / diasConsumo : null,
      // Las entradas del Kardex son pasadas y las facturas no confirman una entrega futura.
      plazoDias: null,
      recepciones: null,
    }, hoy)
  }).sort(ordenarReposicion)
  return { hoy, desde, hasta, diasConsumo, avisos, saldoConciliado, consumosDisponibles: consumos.status === "fulfilled" }
}
