import { supabase } from "../lib/supabase"
import { obtenerVentasDiariasRangoDb } from "./ventasRepository"
import { obtenerDevolucionesDb } from "./devolucionRepository"
import { obtenerDashboardVisitasRotacion } from "./dashboardVisitasRotacionRepository"
import type { DatosTableroSku, CatalogoSku, CostoSku } from "../utils/tableroSku"
import { obtenerFacturasDb } from "./facturasRepository"
import { obtenerNominaMensualAreaDb } from "./nominaRepository"
import { obtenerPromocionesDb } from "./promocionesRepository"
import { obtenerReglasDistribucionDb } from "./rentabilidadRepository"

async function leerCatalogo<T>(tabla: string, campos: string, orden: string, activo = false): Promise<T[]> {
  const filas: T[] = []
  for (let inicio = 0; ; inicio += 500) {
    let consulta = supabase.from(tabla).select(campos).order(orden)
    if (activo) consulta = consulta.eq("activo", true)
    const { data, error } = await consulta.range(inicio, inicio + 499)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []) as unknown as T[])
    if ((data?.length ?? 0) < 500) return filas
  }
}

export async function obtenerTableroSku(desde: string, hasta: string): Promise<DatosTableroSku> {
  const [productos, clientes, asignaciones] = await Promise.all([
    leerCatalogo<CatalogoSku>("productos", "id,codigo,nombre,corto", "id", true),
    leerCatalogo<{ id: string; nombre: string }>("clientes", "id,nombre", "id", true),
    leerCatalogo<{ cliente_id: string; producto_id: string; precio: number | null }>("cliente_productos", "cliente_id,producto_id,precio", "id", true),
  ])
  const resultados = await Promise.allSettled([
    obtenerVentasDiariasRangoDb(desde, hasta),
    obtenerDevolucionesDb(desde, hasta),
    obtenerDashboardVisitasRotacion("", desde, hasta, { soloAsignados: true }),
    leerCatalogo<CostoSku>("fm_vw_productos_costo_completo",
      "producto_id,producto_codigo,batch_calculado_kg,rendimiento_unidades,costo_materiales_unidad,items_sin_costo", "producto_id"),
    obtenerFacturasDb(), obtenerNominaMensualAreaDb(), obtenerPromocionesDb(), obtenerReglasDistribucionDb(),
  ] as const)
  const errores: string[] = []
  const nombres = ["Ventas", "Devoluciones", "Visitas", "Costos", "Gastos", "Nómina", "Promociones", "Reglas de distribución"]
  resultados.forEach((resultado, indice) => {
    if (resultado.status === "rejected") {
      errores.push(`${nombres[indice]} · ${resultado.reason instanceof Error ? resultado.reason.message : "No se pudo consultar esta fuente"}`)
    }
  })
  const [ventas, devoluciones, visitas, costos, facturas, nomina, promociones, reglas] = resultados
  return {
    productos, clientes, asignaciones, errores,
    ventas: ventas.status === "fulfilled" ? ventas.value : null,
    devoluciones: devoluciones.status === "fulfilled" ? devoluciones.value : null,
    visitas: visitas.status === "fulfilled" ? visitas.value.registros : null,
    costos: costos.status === "fulfilled" ? costos.value : null,
    rentabilidad: {
      facturas: facturas.status === "fulfilled" ? facturas.value : null,
      nomina: nomina.status === "fulfilled" ? nomina.value : null,
      promociones: promociones.status === "fulfilled" ? promociones.value : null,
      reglas: reglas.status === "fulfilled" ? reglas.value : null,
    },
  }
}
