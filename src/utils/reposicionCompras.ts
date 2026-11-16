const MS_DIA = 86_400_000

export function sumarDiasCompras(fecha: string, dias: number) {
  return new Date(Date.parse(fecha) + dias * MS_DIA).toISOString().slice(0, 10)
}

export type InsumoReposicion = {
  id: string
  codigo: string
  nombre: string
  unidad: string
  stock: number | null
  consumoDiario: number | null
  plazoDias: number | null
  // null: sin fuente. []: fuente consultada, sin entregas pendientes.
  recepciones: readonly { fecha: string; cantidad: number }[] | null
}

export function calcularReposicion(insumo: InsumoReposicion, hoy: string) {
  const { stock, consumoDiario, plazoDias, recepciones } = insumo
  const cobertura = stock !== null && consumoDiario !== null ? stock / consumoDiario : null
  const faltantes: string[] = []
  if (stock === null) faltantes.push("saldo registrado en Kardex")
  if (consumoDiario === null) faltantes.push("consumo confirmado en el período")
  if (plazoDias === null) faltantes.push("plazo de entrega del proveedor")
  if (recepciones === null) faltantes.push("registro de recepciones futuras confirmadas")

  if (cobertura === null || consumoDiario === null || plazoDias === null || recepciones === null) {
    return { ...insumo, cobertura, faltantes, diasParaPedir: null, fechaPedido: null, riesgo: false, recepcionesConsideradas: 0 }
  }

  let diasHastaAgotar = cobertura
  let recepcionesConsideradas = 0
  for (const recepcion of [...recepciones].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const diasHastaLlegada = (Date.parse(recepcion.fecha) - Date.parse(hoy)) / MS_DIA
    if (diasHastaLlegada < 0) continue
    // Una entrega posterior al primer quiebre no puede evitarlo.
    if (diasHastaLlegada > diasHastaAgotar) break
    diasHastaAgotar += recepcion.cantidad / consumoDiario
    recepcionesConsideradas++
  }

  const diasParaPedir = diasHastaAgotar - plazoDias
  return {
    ...insumo, cobertura, faltantes, diasParaPedir, recepcionesConsideradas,
    fechaPedido: sumarDiasCompras(hoy, Math.max(0, Math.floor(diasParaPedir))),
    riesgo: diasParaPedir <= 0,
  }
}

export type AvisoReposicion = ReturnType<typeof calcularReposicion>

export function ordenarReposicion(a: AvisoReposicion, b: AvisoReposicion) {
  // Sin una fecha recomendada se usa la cobertura como referencia de revisión.
  const plazoA = a.diasParaPedir ?? Infinity
  const plazoB = b.diasParaPedir ?? Infinity
  if (plazoA !== plazoB) return plazoA - plazoB
  const coberturaA = a.cobertura ?? Infinity
  const coberturaB = b.cobertura ?? Infinity
  if (coberturaA !== coberturaB) return coberturaA - coberturaB
  return a.nombre.localeCompare(b.nombre, "es")
}
