import type { OrdenProduccionImportar } from "./ordenesProduccionExcel"

export type ComponenteReferenciaOp = {
  codigo: string; nombre: string; unidad: string; cantidadPorUnidad: number; aliases?: string[]
}
export type ReferenciaRecetaOp = {
  codigoProducto: string; version: string; componentes: ComponenteReferenciaOp[]; advertencias: string[]
}
export type DiferenciaConsumoOp = {
  codigo: string; nombre: string; unidad: string; real: number | null; teorico: number | null
  diferencia: number | null; porcentaje: number | null; estado: string
}
export type ComparacionOrdenOp = {
  orden: string; producto: string; fecha: string; version: string; advertencias: string[]; lineas: DiferenciaConsumoOp[]
}

export function codigoMateriaOp(valor: string) {
  const codigo = valor.trim().toUpperCase()
  return /^\d{1,12}$/.test(codigo) ? codigo.replace(/^0+(?=\d)/, "") : codigo
}
export function nombreMicroOp(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((v) => v && !["MIC", "MICRO", "PAN", "DE", "DEL", "PANGOLIN"].includes(v)).join(" ")
}

export function compararConsumosOp(orden: OrdenProduccionImportar, referencia?: ReferenciaRecetaOp): ComparacionOrdenOp {
  const resultado: ComparacionOrdenOp = {
    orden: orden.numero_orden, producto: orden.producto_nombre, fecha: orden.fecha_produccion,
    version: referencia?.version ?? "Sin receta vinculada", advertencias: [...(referencia?.advertencias ?? [])], lineas: [],
  }
  if (!referencia) resultado.advertencias.push("No se encontró una receta vigente vinculada; no se inventan cantidades teóricas.")
  const producidas = orden.tipo_orden === "SKU" ? orden.unidades_producidas : orden.kg_micro
  if (orden.tipo_orden === "SKU") resultado.advertencias.push("Las unidades son inferidas de fundas; confirmar antes de dar por definitivas las diferencias.")
  if (!Number.isFinite(producidas) || producidas <= 0) resultado.advertencias.push("Falta una cantidad producida válida para escalar la receta.")
  const esperados = new Map<string, ComponenteReferenciaOp>()
  const aliases = new Map<string, Set<string>>()
  for (const componente of referencia?.componentes ?? []) {
    const clave = codigoMateriaOp(componente.codigo)
    const anterior = esperados.get(clave)
    if (anterior && anterior.unidad !== componente.unidad) throw new Error(`Unidades incompatibles en la receta de ${componente.nombre}.`)
    esperados.set(clave, { ...componente, cantidadPorUnidad: (anterior?.cantidadPorUnidad ?? 0) + componente.cantidadPorUnidad })
    for (const alias of [componente.codigo, ...(componente.aliases ?? [])]) {
      const key = codigoMateriaOp(alias), candidatos = aliases.get(key) ?? new Set<string>()
      candidatos.add(clave); aliases.set(key, candidatos)
    }
  }
  const reales = new Map<string, { cantidad: number; nombre: string }>()
  for (const detalle of orden.detalles) {
    const codigo = codigoMateriaOp(detalle.materia_codigo)
    const candidatos = aliases.get(codigo)
    if (candidatos && candidatos.size > 1) resultado.advertencias.push(`Código ambiguo ${detalle.materia_codigo}; no se vincula automáticamente.`)
    const clave = candidatos?.size === 1 ? [...candidatos][0] : `real:${codigo}`
    const anterior = reales.get(clave)
    reales.set(clave, { cantidad: (anterior?.cantidad ?? 0) + detalle.cantidad, nombre: detalle.materia_nombre })
  }
  for (const clave of new Set([...esperados.keys(), ...reales.keys()])) {
    const esperado = esperados.get(clave), real = reales.get(clave)
    const teorico = esperado && Number.isFinite(esperado.cantidadPorUnidad) && esperado.cantidadPorUnidad >= 0 && producidas > 0
      ? esperado.cantidadPorUnidad * producidas : null
    const diferencia = real && teorico !== null ? real.cantidad - teorico : null
    const porcentaje = diferencia !== null && teorico !== null && teorico > 0 ? diferencia / teorico * 100 : null
    const tolerancia = teorico === null ? 0 : Math.max(esperado?.unidad === "KG" ? 0.002 : esperado?.unidad === "G" ? 2 : 0, teorico * 0.01)
    resultado.lineas.push({
      codigo: esperado?.codigo ?? clave.replace(/^real:/, ""), nombre: esperado?.nombre ?? real?.nombre ?? clave,
      unidad: esperado?.unidad ?? "Sin verificar", real: real?.cantidad ?? null, teorico, diferencia, porcentaje,
      estado: !real ? "NO REPORTADO" : teorico === null ? "SIN REFERENCIA" : Math.abs(diferencia ?? 0) <= tolerancia ? "COINCIDE" : "DIFERENCIA",
    })
  }
  return resultado
}
