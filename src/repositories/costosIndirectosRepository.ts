import { supabase } from "../lib/supabase"

export type LineaResultadoImportar = {
  periodo: string
  cuenta_codigo: string
  cuenta_descripcion: string
  valor: number
}

export type ImportacionResultadosDb = {
  id: string
  archivo_nombre: string
  periodo_desde: string
  periodo_hasta: string
  meses_incluidos: number
  cuentas_incluidas: number
  registros_importados: number
  creado_en: string
}

export type ResultadoMensualDb = {
  periodo: string
  cuentas: number
  ventas_netas: number
  costo_ventas: number
  gastos_ventas: number
  gastos_administracion: number
  otros_ingresos: number
  gastos_financieros: number
  depreciacion: number
  resultado_operativo: number
  ebitda_estimado: number
  margen_ebitda_estimado: number | null
  resultado_ejercicio: number
  actualizado_en: string
}

export type RespuestaImportacionResultados = {
  importacion_id: string
  periodo_desde: string
  periodo_hasta: string
  meses_importados: number
  cuentas_importadas: number
  registros_importados: number
}

export async function obtenerImportacionesResultadosDb() {
  const { data, error } = await supabase
    .from("fin_importaciones_resultados")
    .select(`
      id,
      archivo_nombre,
      periodo_desde,
      periodo_hasta,
      meses_incluidos,
      cuentas_incluidas,
      registros_importados,
      creado_en
    `)
    .order("creado_en", { ascending: false })
    .limit(24)

  if (error) {
    throw new Error(
      `No se pudo cargar el historial de balances: ${error.message}`,
    )
  }

  return (data ?? []) as ImportacionResultadosDb[]
}

export async function obtenerResultadosMensualesDb() {
  const { data, error } = await supabase
    .from("fin_vw_resultado_mensual")
    .select("*")
    .order("periodo", { ascending: false })

  if (error) {
    throw new Error(
      `No se pudo cargar el resumen mensual: ${error.message}`,
    )
  }

  return (data ?? []) as ResultadoMensualDb[]
}

export async function importarBalanceResultadosDb(datos: {
  archivoNombre: string
  lineas: LineaResultadoImportar[]
}) {
  const { data, error } = await supabase.rpc(
    "fin_importar_balance_resultados",
    {
      p_archivo_nombre: datos.archivoNombre,
      p_lineas: datos.lineas,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo guardar el balance: ${error.message}`,
    )
  }

  return data as RespuestaImportacionResultados
}


export type MargenBrutoMensualDb = {
  periodo: string
  ventas_brutas: number
  devoluciones_ventas: number
  descuentos_ventas: number
  ventas_netas: number
  costo_producto_vendido: number
  mod_residual: number
  cif_residual: number
  desperdicio_danos_produccion: number
  desperdicio_devoluciones_producto: number
  ajustes_inventario_costo: number
  costo_ventas_contable: number
  depreciacion_maquinaria: number
  costo_fabricacion_gerencial: number
  margen_bruto: number
  margen_bruto_porcentaje: number | null
  actualizado_en: string | null
}

export async function obtenerMargenBrutoMensualDb() {
  const { data, error } = await supabase
    .from("fin_vw_margen_bruto_mensual")
    .select(
      `
        periodo,
        ventas_brutas,
        devoluciones_ventas,
        descuentos_ventas,
        ventas_netas,
        costo_producto_vendido,
        mod_residual,
        cif_residual,
        desperdicio_danos_produccion,
        desperdicio_devoluciones_producto,
        ajustes_inventario_costo,
        costo_ventas_contable,
        depreciacion_maquinaria,
        costo_fabricacion_gerencial,
        margen_bruto,
        margen_bruto_porcentaje,
        actualizado_en
      `,
    )
    .order("periodo", { ascending: false })

  if (error) {
    throw new Error(
      `No se pudo cargar el margen bruto contable: ${error.message}`,
    )
  }

  return (data ?? []) as MargenBrutoMensualDb[]
}
