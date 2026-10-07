import { unidadesCoinciden, type TipoInventario } from "./inventarioInicialExcel.ts"

export type ClaseAltaInventario = "MATERIA_PRIMA" | "EMPAQUE" | "MICRO" | "PRODUCTO_TERMINADO"
export type DatosAltaInventario = {
  clase: ClaseAltaInventario | ""; codigo: string; nombre: string; unidad: string
  vidaUtilDias: number; loteProduccion: number; reactivar: boolean
}

export function unidadAltaInventario(unidad: string): "KG" | "UNIDAD" | "" {
  return unidadesCoinciden(unidad, "KG") ? "KG" : unidadesCoinciden(unidad, "UNIDAD") ? "UNIDAD" : ""
}

export function prepararAltaInventario(datos: DatosAltaInventario) {
  if (!["MATERIA_PRIMA", "EMPAQUE", "MICRO", "PRODUCTO_TERMINADO"].includes(datos.clase)) throw new Error("Elige el tipo de artículo.")
  let codigo = datos.codigo.trim().toUpperCase()
  const nombre = datos.nombre.trim().toUpperCase()
  if (!codigo || !nombre) throw new Error("Completa el código y el nombre.")
  const tipo: TipoInventario = datos.clase === "PRODUCTO_TERMINADO" ? "PRODUCTO_TERMINADO" : "MATERIA_PRIMA"
  const unidad = unidadAltaInventario(datos.unidad)
  if (!unidad) throw new Error("Elige la unidad: KG o UNIDAD.")
  if (tipo === "PRODUCTO_TERMINADO") {
    if (unidad !== "UNIDAD") throw new Error("Producto terminado requiere UNIDAD.")
    if (!Number.isSafeInteger(datos.vidaUtilDias) || datos.vidaUtilDias <= 0) throw new Error("Indica la vida útil real en días enteros.")
    if (!Number.isSafeInteger(datos.loteProduccion) || datos.loteProduccion <= 0) throw new Error("Indica las unidades reales por parada de producción.")
  } else if (/^\d{1,5}$/.test(codigo)) codigo = codigo.padStart(5, "0")
  return { tipo, codigo, nombre, unidad,
    esEmpaque: datos.clase === "EMPAQUE", incluirEnCosteo: datos.clase !== "MICRO",
    observaciones: datos.clase === "MICRO" ? "Micro preparado registrado desde el inventario inicial. Costear sus ingredientes sin duplicar el costo del micro." : "Artículo creado desde el inventario inicial." }
}
