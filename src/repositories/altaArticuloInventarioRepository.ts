import { supabase } from "../lib/supabase"
import { crearProductoDb } from "../services/catalogoService"
import { prepararAltaInventario, type DatosAltaInventario } from "../utils/altaArticuloInventario"
import { vincularArticulo, type ArticuloKardex, type TipoInventario } from "../utils/inventarioInicialExcel"

export type ArticuloAltaInventario = ArticuloKardex & { activo: boolean }

async function leerCatalogoCompleto(tabla: "materias_primas" | "productos", columnas: string) {
  const filas: Record<string, unknown>[] = []
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from(tabla).select(columnas).order("id").range(inicio, inicio + 499)
    if (error) throw new Error(`No se pudo revisar el catálogo de ${tabla}: ${error.message}`)
    const pagina = (data ?? []) as unknown as Record<string, unknown>[]
    filas.push(...pagina)
    if (pagina.length < 500) return filas
  }
}

export async function catalogosAltaInventario(): Promise<ArticuloAltaInventario[]> {
  const [materias, productos] = await Promise.all([
    leerCatalogoCompleto("materias_primas", "id,codigo,codigo_contable,nombre,unidad_base,activo"),
    leerCatalogoCompleto("productos", "id,codigo,nombre,vida_util_dias,activo"),
  ])
  return [...materias.map((m) => ({ tipo: "MATERIA_PRIMA" as const, id: String(m.id), codigo: String(m.codigo),
    codigo_contable: m.codigo_contable ? String(m.codigo_contable) : null, nombre: String(m.nombre), unidad: String(m.unidad_base),
    activo: m.activo === true, saldo: 0, iniciado: false })),
    ...productos.map((p) => ({ tipo: "PRODUCTO_TERMINADO" as const, id: String(p.id), codigo: String(p.codigo), codigo_contable: null,
      nombre: String(p.nombre), unidad: "UNIDAD", vida_util_dias: Number(p.vida_util_dias), activo: p.activo === true, saldo: 0, iniciado: false }))]
}

export function candidatosAltaInventario(codigo: string, catalogo: ArticuloAltaInventario[]) {
  return codigo.trim() ? catalogo.filter((a) => vincularArticulo(codigo, [a])) : []
}

export async function guardarAltaArticuloInventario(datos: DatosAltaInventario): Promise<{ id: string; tipo: TipoInventario }> {
  const catalogo = await catalogosAltaInventario()
  const candidatos = candidatosAltaInventario(datos.codigo, catalogo)
  if (candidatos.length > 1) throw new Error("El código coincide con varios artículos. Vincula el correcto en la lista; no se creará un duplicado.")
  const existente = candidatos[0]
  if (existente) {
    if (!existente.activo) {
      if (!datos.reactivar) throw new Error("Este artículo está inactivo. Confirma su activación para usarlo en la carga.")
      const { data, error } = await supabase.from(existente.tipo === "PRODUCTO_TERMINADO" ? "productos" : "materias_primas")
        .update({ activo: true }).eq("id", existente.id).select("id,activo").single()
      if (error || !data?.activo) throw new Error(`No se pudo activar el artículo. ${error?.message ?? "Revisa los permisos del catálogo."}`)
    }
    return { id: existente.id, tipo: existente.tipo }
  }
  const alta = prepararAltaInventario(datos)
  if (alta.tipo === "PRODUCTO_TERMINADO") {
    const p = await crearProductoDb({ codigo: alta.codigo, nombre: alta.nombre, corto: alta.nombre,
      loteProduccion: datos.loteProduccion, stockSeguridad: 0, vidaUtilDias: datos.vidaUtilDias })
    if (!p?.id) throw new Error("No se recibió confirmación del producto creado.")
    return { id: p.id, tipo: alta.tipo }
  }
  const { data, error } = await supabase.from("materias_primas").insert({ codigo: alta.codigo, codigo_contable: alta.codigo,
    nombre: alta.nombre, nombre_corto: alta.nombre, unidad_base: alta.unidad, es_empaque: alta.esEmpaque,
    incluir_en_costeo: alta.incluirEnCosteo, observaciones: alta.observaciones, activo: true }).select("id").single()
  if (error || !data?.id) throw new Error(`No se pudo crear el artículo. ${error?.message ?? "No se recibió confirmación."}`)
  return { id: data.id, tipo: alta.tipo }
}
