type Articulo = { id: string; codigo: string; nombre: string; unidad: string }
type Item = { codigo?: string; codigoAuxiliar?: string; descripcion: string; cantidad: string; unidad?: string }
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
const nombre = (s: string) => normalizar(s).replace(/MOHO[ -]+SORBIC/g, "MOHOSORBIC")
  .replace(/\bSABORIZANTE\b/g, "SABOR").replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ")
const unidad = (s = "") => {
  const u = nombre(s)
  return /^(KG|KGS|KLS|KILO|KILOS|KILOGRAMO|KILOGRAMOS)$/.test(u) ? "KG"
    : /^(G|GR|GRS|GRAMO|GRAMOS)$/.test(u) ? "G"
      : /^(U|UND|UNID|UNIDAD|UNIDADES)$/.test(u) ? "UNIDAD" : ""
}
const numero = (s: string) => /^\d+(?:[.,]\d+)?$/.test(s.trim()) ? Number(s.trim().replace(",", ".")) : NaN
const textoCantidad = (n: number) => String(Math.round(n * 1e6) / 1e6)

export function reconocerArticuloCompra(item: Item, articulos: Articulo[]): Articulo | null {
  const descripcion = ` ${nombre(item.descripcion)} `
  if (/\b(SERVICIOS?|ARRIENDO|ARRENDAMIENTO|TRANSPORTE)\b/.test(descripcion)) return null
  const candidatos = articulos.filter(a => descripcion.includes(` ${nombre(a.nombre)} `))
  // Si coinciden varios nombres (por ejemplo avena y avena molida), elegir
  // únicamente el nombre más específico; los empates necesitan revisión.
  candidatos.sort((a, b) => nombre(b.nombre).length - nombre(a.nombre).length)
  if (candidatos.length && (candidatos.length === 1 || nombre(candidatos[0].nombre).length > nombre(candidatos[1].nombre).length)) return candidatos[0]
  if (candidatos.length) return null
  const codigos = [item.codigo, item.codigoAuxiliar].filter(Boolean).map(c => nombre(c!))
  const porCodigo = articulos.filter(a => codigos.includes(nombre(a.codigo))
    && nombre(a.nombre).split(" ").some(p => p.length > 3 && descripcion.includes(` ${p} `)))
  return porCodigo.length === 1 ? porCodigo[0] : null
}

export function cantidadRecibidaCompra(item: Item, articulo: Articulo | null) {
  if (!articulo) return { cantidad: "", explicacion: "Selecciona el artículo; no hay una coincidencia única en el catálogo." }
  const q = numero(item.cantidad)
  if (!Number.isFinite(q) || q <= 0) return { cantidad: "", explicacion: "Falta la cantidad física en el documento." }
  const descripcion = normalizar(item.descripcion)
  const u = unidad(item.unidad) || (/^\s*\(K\)/.test(descripcion) ? "KG" : "")
  const base = articulo.unidad
  const resultado = (n: number, explicacion: string) => n > 0 && Number.isFinite(n)
    && Math.abs(n - Math.round(n * 1e6) / 1e6) <= Number.EPSILON * Math.max(1, n) * 4
    && (base !== "UNIDAD" || Number.isInteger(n))
    ? { cantidad: textoCantidad(n), explicacion } : { cantidad: "", explicacion: "Revisa la conversión y los decimales en la unidad del catálogo." }
  if (u === base) return resultado(q, `Cantidad del XML: ${textoCantidad(q)} ${base}.`)
  if (base === "KG" && u === "G") return resultado(q / 1000, `${textoCantidad(q)} G ÷ 1000 = ${textoCantidad(q / 1000)} KG.`)
  if (item.unidad?.trim() && !u && !/^(SACOS?|CAJAS?|PAQUETES?|BOLSAS?)$/.test(nombre(item.unidad))) {
    return { cantidad: "", explicacion: `La unidad ${item.unidad} necesita una conversión confirmada a ${base}.` }
  }
  if (base === "UNIDAD" && !u && /\b(FUNDAS?|CAJAS?|EMPAQUES?|UNIDADES?|UND)\b/.test(descripcion)
    && !/\b(PAQUETES?|PACK|CIENTO|MILLAR|ROLLOS?)\b/.test(descripcion)) {
    return resultado(q, `Cantidad facturada: ${textoCantidad(q)} UNIDAD. El peso impreso identifica la presentación del empaque.`)
  }
  if (base === "KG" && (!u || u === "UNIDAD")) {
    const pesos = [...descripcion.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(KILOGRAMOS?|KILOS?|KGS?|KLS|GRAMOS?|GRS?|G)\b/g)]
    if (pesos.length === 1 && !/\d\s*[X×*]\s*\d/.test(descripcion)) {
      const peso = numero(pesos[0][1]) / (/^(G|GR)/.test(pesos[0][2]) ? 1000 : 1)
      return resultado(q * peso, `${textoCantidad(q)} × ${textoCantidad(peso)} KG por presentación = ${textoCantidad(q * peso)} KG. Revisa la presentación indicada en la factura.`)
    }
  }
  return { cantidad: "", explicacion: "La unidad de compra o su conversión no está clara en el documento. Completa la cantidad en la unidad del catálogo." }
}

export function proponerRecepcionCompra(items: Item[], articulos: Articulo[]) {
  return items.map(item => {
    const articulo = reconocerArticuloCompra(item, articulos)
    return { articulo: articulo?.id ?? "", ...cantidadRecibidaCompra(item, articulo) }
  })
}
