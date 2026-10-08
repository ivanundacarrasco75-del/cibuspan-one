import { supabase } from "../lib/supabase"
import { codigoMateriaOp, nombreMicroOp, type ComponenteReferenciaOp, type ReferenciaRecetaOp } from "../utils/comparacionConsumosOp"
import type { OrdenProduccionImportar } from "../utils/ordenesProduccionExcel"

type Registro = Record<string, unknown>
async function leer(tabla: string, orden: string[], filtro?: [string, string | boolean]) {
  const filas: Registro[] = []
  for (let inicio = 0; ; inicio += 500) {
    let consulta = supabase.from(tabla).select("*")
    if (filtro) consulta = consulta.eq(filtro[0], filtro[1])
    for (const columna of orden) consulta = consulta.order(columna)
    const { data, error } = await consulta.range(inicio, inicio + 499)
    if (error) throw new Error(`No se pudieron consultar las recetas (${tabla}): ${error.message}`)
    filas.push(...(data ?? []))
    if ((data?.length ?? 0) < 500) return filas
  }
}
const txt = (valor: unknown) => String(valor ?? "").trim()

export async function obtenerReferenciasConsumoOp(ordenes: OrdenProduccionImportar[]): Promise<ReferenciaRecetaOp[]> {
  const [productos, materias, relaciones, formulas, versiones, finales, micros, empaques] = await Promise.all([
    leer("productos", ["id"]), leer("materias_primas", ["id"]),
    leer("fm_formula_productos", ["formula_id", "producto_id"], ["activo", true]),
    leer("fm_formulas", ["id"], ["activo", true]),
    leer("fm_formula_versiones", ["id"], ["estado", "VIGENTE"]),
    leer("fm_vw_formula_final", ["formula_version_id", "orden"], ["estado", "VIGENTE"]),
    leer("fm_vw_recetas_micro", ["formula_version_id", "orden"], ["estado", "VIGENTE"]),
    leer("fm_producto_empaques", ["id"], ["activo", true]),
  ])
  const porId = new Map(materias.map((materia) => [txt(materia.id), materia]))
  const codigos = (materia: Registro) => [txt(materia.codigo), txt(materia.codigo_contable)].filter(Boolean)
  const activos = new Set(formulas.map((formula) => txt(formula.id)))
  const referencias: ReferenciaRecetaOp[] = []
  for (const codigo of new Set(ordenes.map((orden) => orden.producto_codigo))) {
    const op = ordenes.find((orden) => orden.producto_codigo === codigo)!
    const componentes: ComponenteReferenciaOp[] = [], advertencias: string[] = [], etiquetas: string[] = []
    let recetaIncompleta = false
    const agregarMateria = (id: string, cantidad: number, esCantidadCatalogo = false) => {
      const materia = porId.get(id), unidad = txt(materia?.unidad_base).toUpperCase()
      if (!materia || !Number.isFinite(cantidad) || cantidad < 0 || !unidad) {
        advertencias.push(`Componente ${id} sin cantidad o unidad verificable.`); return
      }
      if (!esCantidadCatalogo && !["KG", "G"].includes(unidad)) {
        advertencias.push(`Unidad ${unidad} de ${txt(materia.nombre)} incompatible con los kilos calculados de la receta.`); return
      }
      if (!esCantidadCatalogo && unidad === "G") cantidad *= 1000
      componentes.push({ codigo: txt(materia.codigo), nombre: txt(materia.nombre), unidad, cantidadPorUnidad: cantidad, aliases: codigos(materia) })
    }
    if (op.tipo_orden === "SKU") {
      const productosCodigo = productos.filter((producto) => txt(producto.codigo) === codigo)
      if (productosCodigo.length !== 1) continue
      const producto = productosCodigo[0]
      const formulaIds = [...new Set(relaciones.filter((relacion) => txt(relacion.producto_id) === txt(producto.id) && activos.has(txt(relacion.formula_id))).map((relacion) => txt(relacion.formula_id)))]
      if (!formulaIds.length) continue
      for (const formulaId of formulaIds) {
        const candidatas = versiones.filter((version) => txt(version.formula_id) === formulaId)
        if (candidatas.length !== 1) { recetaIncompleta = true; advertencias.push(`La fórmula ${formulaId} no tiene una única versión vigente.`); continue }
        const version = candidatas[0], unidades = Number(version.rendimiento_unidades ?? version.panes_por_batch)
        const formula = formulas.find((item) => txt(item.id) === formulaId)
        etiquetas.push(`${txt(formula?.nombre)} v${txt(version.numero_version)}`)
        if (!Number.isFinite(unidades) || unidades <= 0) { recetaIncompleta = true; advertencias.push("Rendimiento de receta sin verificar."); continue }
        const filas = finales.filter((item) => txt(item.formula_version_id) === txt(version.id))
        if (!filas.length) { recetaIncompleta = true; advertencias.push("La fórmula vigente no tiene componentes calculados.") }
        for (const fila of filas) {
          if (fila.cantidad_batch_kg == null) { advertencias.push(`Cantidad no calculada para ${txt(fila.componente_nombre)}.`); continue }
          const cantidad = Number(fila.cantidad_batch_kg) / unidades
          if (fila.tipo_componente === "MICRO") {
            const nombre = txt(fila.componente_nombre), clave = nombreMicroOp(nombre)
            // Solo coincidencia inequívoca de nombre de mezcla; sin crear aliases.
            const candidatasMp = materias.filter((materia) => /^MICRO\b/i.test(txt(materia.nombre)) && nombreMicroOp(txt(materia.nombre)) === clave)
            if (candidatasMp.length === 1) agregarMateria(txt(candidatasMp[0].id), cantidad)
            else advertencias.push(`Micro ${nombre} sin vínculo único al catálogo; no se calculó su diferencia.`)
          } else agregarMateria(txt(fila.materia_prima_id), cantidad)
        }
      }
      // El Rollo usa dos fórmulas. Su empaque se agrega una sola vez.
      for (const empaque of empaques.filter((item) => txt(item.producto_id) === txt(producto.id))) {
        agregarMateria(txt(empaque.materia_prima_id), Number(empaque.cantidad_por_unidad), true)
      }
      if (formulaIds.length > 1) advertencias.push("Consumos sumados de las fórmulas vinculadas; empaque contado una vez.")
      if (recetaIncompleta) { componentes.length = 0; advertencias.push("No se calcula la diferencia contra una receta incompleta.") }
    } else {
      const clave = nombreMicroOp(op.producto_nombre)
      const grupos = new Map<string, Registro[]>()
      for (const fila of micros.filter((item) => activos.has(txt(item.formula_id)) && nombreMicroOp(txt(item.micro_nombre)) === clave)) {
        const key = `${txt(fila.formula_version_id)}|${txt(fila.micro_id)}`
        grupos.set(key, [...(grupos.get(key) ?? []), fila])
      }
      const opciones = [...grupos.values()]
      if (!opciones.length) continue
      const firma = (filas: Registro[]) => JSON.stringify(filas.map((fila) => [txt(fila.materia_prima_id), Number(fila.porcentaje_composicion_micro)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
      if (new Set(opciones.map(firma)).size !== 1) { advertencias.push("Hay composiciones vigentes diferentes para este micro; seleccionar una receta requiere revisión.") }
      else {
        const filas = opciones[0], total = filas.reduce((suma, fila) => suma + Number(fila.porcentaje_composicion_micro), 0)
        if (!Number.isFinite(total) || Math.abs(total - 100) > 0.01) advertencias.push("La composición del micro no suma 100%; revisar antes de comparar.")
        else for (const fila of filas) agregarMateria(txt(fila.materia_prima_id), Number(fila.porcentaje_composicion_micro) / 100)
        etiquetas.push(...new Set(opciones.map((filas) => `${txt(filas[0].formula_nombre)} v${txt(filas[0].numero_version)}`)))
      }
    }
    // Un alias de dos artículos nunca debe decidirse por orden de consulta.
    const aliasIds = new Map<string, Set<string>>()
    for (const materia of materias) for (const alias of codigos(materia)) {
      const key = codigoMateriaOp(alias), ids = aliasIds.get(key) ?? new Set<string>()
      ids.add(txt(materia.id)); aliasIds.set(key, ids)
    }
    for (const componente of componentes) componente.aliases = componente.aliases?.filter((alias) => aliasIds.get(codigoMateriaOp(alias))?.size === 1)
    referencias.push({ codigoProducto: codigo, version: etiquetas.join(" + ") || "Sin receta inequívoca", componentes, advertencias })
  }
  return referencias
}
