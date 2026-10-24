export type GrupoArranque = "mp" | "pt" | "semi"
export type ArticuloArranque = { id: string; codigo: string; codigo_contable?: string | null; nombre: string; unidad: string; activo: boolean; saldo: number; saldo_kardex?: number }
export type LotePtArranque = { id: string; producto_id: string; lote: string; fecha_produccion: string; fecha_vencimiento: string; cantidad: number; inv_archivo_id: string | null }
export type LoteSemiArranque = { id: string; semielaborado_tipo_id: string; fecha_produccion: string; lote_interno: string; disponible: number; convertido: number; cantidad_inicial: number }
export type CatalogoArranque = {
  hoy: string; mp: ArticuloArranque[]; pt: ArticuloArranque[]; semi: ArticuloArranque[]
  lotes_pt: LotePtArranque[]; lotes_semi: LoteSemiArranque[]; reservas_activas: number
  pedidos_pendientes: { id: string; numero_pedido_cliente: string | null; fecha_entrega: string; total_unidades: number; estado: string }[]
}
export type LoteBorradorArranque = { id: string; cantidad: string; lote: string; fecha_produccion: string; fecha_vencimiento: string; lote_interno: string }
type ConteoMp = { id: string; unidad: string; cantidad: string; etiqueta: string }
export type ConteoLotes = { id: string; total: string; lotes: LoteBorradorArranque[]; etiqueta: string }
export type IncidenciaArranque = { clave: string; codigo: string; nombre: string; cantidad: number | null; motivo: string; decision: string; conteoAnterior?: unknown }
export type BorradorArranque = { version: 1; inicio: string; nota: string; fuentes: string[]; incidencias: IncidenciaArranque[]; mp: ConteoMp[]; pt: ConteoLotes[]; semi: ConteoLotes[] }
export type ConteosArranque = {
  version: 1; nota: string; fuentes: string[]; incidencias: IncidenciaArranque[]
  mp: { id: string; cantidad: number; unidad: string }[]
  pt: { id: string; total: number; lotes: { id: string; lote: string; fecha_produccion: string; fecha_vencimiento: string; cantidad: number }[] }[]
  semi: { id: string; total: number; lotes: { id: string; fecha_produccion: string; lote_interno: string; cantidad: number }[] }[]
}
export type LineaVistaArranque = { grupo: GrupoArranque; id: string; codigo: string; nombre: string; unidad: string; sistema: number; conteo: number; diferencia: number; kardex: number }
export type VistaArranque = { token: string; puede_aplicar: boolean; bloqueos: string[]; avisos: string[]; lineas: LineaVistaArranque[]; fecha_inicio: string; fecha_cierre: string }
export type EstadoArranque = { instalado: boolean; aplicado: boolean; puede_preparar: boolean; hoy: string; id?: string; fecha_inicio?: string; fecha_cierre?: string; aplicado_en?: string }
export type ResultadoArranque = { estado: "APLICADO"; solicitud_id: string; fecha_inicio: string; fecha_cierre: string; resumen: { lineas: LineaVistaArranque[]; avisos: string[] }; repetido: boolean }
export const uuidArranque = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s)
export const fechaArranque = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
export function sumarDiaArranque(s: string, n = 1) { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export function numeroArranque(s: string, entero = false): number {
  if (typeof s !== "string" || !/^\d+(?:[.,]\d{1,6})?$/.test(s.trim())) throw new Error("Completa la cantidad; una casilla vacía no es cero. Usa números sin separadores de miles.")
  const n = Number(s.trim().replace(",", "."))
  if (!Number.isFinite(n) || n < 0 || n > 1e12 || (entero && (!Number.isInteger(n) || n > 2147483647))) throw new Error("Cantidad fuera del rango o con unidades fraccionadas.")
  return n
}
export function crearBorradorArranque(c: CatalogoArranque): BorradorArranque {
  const lote = (l: Partial<LoteBorradorArranque>): LoteBorradorArranque => ({ id: "", cantidad: "", lote: "", fecha_produccion: "", fecha_vencimiento: "", lote_interno: "", ...l })
  return { version: 1, inicio: "", nota: "Conteo físico de arranque", fuentes: [], incidencias: [],
    mp: c.mp.map(a => ({ id: a.id, unidad: a.unidad, cantidad: "", etiqueta: `${a.codigo} · ${a.nombre}` })),
    pt: c.pt.map(a => ({ id: a.id, total: "", etiqueta: `${a.codigo} · ${a.nombre}`, lotes: c.lotes_pt.filter(l => l.producto_id === a.id && l.cantidad > 0).map(l => lote({ id: l.id, lote: l.lote, fecha_produccion: l.fecha_produccion, fecha_vencimiento: l.fecha_vencimiento })) })),
    semi: c.semi.map(a => ({ id: a.id, total: "", etiqueta: `${a.codigo} · ${a.nombre}`, lotes: c.lotes_semi.filter(l => l.semielaborado_tipo_id === a.id && l.disponible > 0).map(l => lote({ id: l.id, fecha_produccion: l.fecha_produccion, lote_interno: l.lote_interno })) })),
  }
}
export function leerBorradorArranque(s: string): BorradorArranque {
  const d = JSON.parse(s) as BorradorArranque
  if (!d || d.version !== 1 || typeof d.inicio !== "string" || typeof d.nota !== "string" || !Array.isArray(d.fuentes) || !d.fuentes.every(v => typeof v === "string") || !Array.isArray(d.incidencias)) throw new Error("Borrador inválido; no se sustituyó tu conteo.")
  for (const grupo of ["mp", "pt", "semi"] as const) {
    if (!Array.isArray(d[grupo]) || d[grupo].length > 4000 || d[grupo].some(a => !uuidArranque(a.id) || typeof a.etiqueta !== "string")) throw new Error("Borrador sin artículos válidos.")
  }
  if (d.mp.some(a => typeof a.unidad !== "string" || typeof a.cantidad !== "string") || [...d.pt, ...d.semi].some(a => typeof a.total !== "string" || !Array.isArray(a.lotes) || a.lotes.some(l => !uuidArranque(l.id) || [l.cantidad, l.lote, l.fecha_produccion, l.fecha_vencimiento, l.lote_interno].some(v => typeof v !== "string")))) throw new Error("Borrador con campos incompletos o incompatibles.")
  if (d.incidencias.some(i => [i.clave, i.codigo, i.nombre, i.motivo, i.decision].some(v => typeof v !== "string") || (i.cantidad !== null && (!Number.isFinite(i.cantidad) || typeof i.cantidad !== "number")))) throw new Error("Revisión del archivo inválida.")
  return d
}
export function sincronizarBorradorArranque(d: BorradorArranque, c: CatalogoArranque): BorradorArranque {
  const nuevo = crearBorradorArranque(c), incidencias = [...d.incidencias]
  for (const g of ["mp", "pt", "semi"] as const) {
    for (const a of d[g]) if (!c[g].some(n => n.id === a.id)) incidencias.push({ clave: `retirado:${g}:${a.id}`, codigo: a.id, nombre: a.etiqueta, cantidad: null, motivo: "Artículo fuera del catálogo actual: revisar/reactivar antes de excluir su conteo. Se conserva el detalle anterior en el borrador descargable.", decision: "", conteoAnterior: a })
  }
  return { ...nuevo, inicio: d.inicio, nota: d.nota, fuentes: d.fuentes, incidencias,
    mp: nuevo.mp.map(a => {
      const anterior = d.mp.find(x => x.id === a.id)
      if (anterior && anterior.unidad !== a.unidad) { incidencias.push({ clave: `unidad:${a.id}`, codigo: a.id, nombre: a.etiqueta, cantidad: null, motivo: `Unidad cambió de ${anterior.unidad} a ${a.unidad}; conteo anterior ${anterior.cantidad}. Revisa el material.`, decision: "" }); return a }
      return anterior ? { ...a, cantidad: anterior.cantidad } : a
    }),
    pt: nuevo.pt.map(a => { const antes = d.pt.find(x => x.id === a.id); return antes ? { ...a, total: antes.total, lotes: antes.lotes } : a }),
    semi: nuevo.semi.map(a => { const antes = d.semi.find(x => x.id === a.id); return antes ? { ...a, total: antes.total, lotes: antes.lotes } : a }),
  }
}
export function prepararConteosArranque(d: BorradorArranque, c: CatalogoArranque): ConteosArranque {
  if (!fechaArranque(d.inicio) || d.inicio < c.hoy || d.inicio > sumarDiaArranque(c.hoy)) throw new Error("Elige inicio hoy o mañana cuando esté listo el conteo al cierre anterior.")
  if (d.nota.trim().length < 5 || d.nota.length > 2000) throw new Error("Escribe una nota del conteo (5 a 2000 caracteres).")
  if (d.incidencias.some(i => i.decision.trim().length < 5)) throw new Error("Resuelve las filas pendientes del Excel o los cambios del catálogo antes de continuar.")
  for (const g of ["mp", "pt", "semi"] as const) {
    if (d[g].length !== c[g].length || new Set(d[g].map(a => a.id)).size !== d[g].length || d[g].some(a => !c[g].some(x => x.id === a.id))) throw new Error("El catálogo cambió: sincroniza y completa los artículos nuevos.")
  }
  const mp = d.mp.map(a => {
    if (a.unidad !== c.mp.find(x => x.id === a.id)!.unidad) throw new Error(`Revisa la unidad de ${a.etiqueta}.`)
    return { id: a.id, unidad: a.unidad, cantidad: numeroArranque(a.cantidad, a.unidad === "UNIDAD") }
  })
  const todosLotes = new Set<string>()
  const lotes = (a: ConteoLotes, grupo: "pt" | "semi") => {
    const total = numeroArranque(a.total, true), claves = new Set<string>()
    const items = a.lotes.map(l => {
      const cantidad = numeroArranque(l.cantidad, true)
      if (cantidad === 0 || !uuidArranque(l.id) || !fechaArranque(l.fecha_produccion) || l.fecha_produccion >= d.inicio) throw new Error(`Completa cantidades y fechas reales de los lotes de ${a.etiqueta}; quita los que no existen físicamente.`)
      if (grupo === "pt" && (!l.lote.trim() || l.lote.trim().length > 100 || !fechaArranque(l.fecha_vencimiento) || l.fecha_vencimiento < l.fecha_produccion)) throw new Error(`Revisa lote y vencimiento de ${a.etiqueta}.`)
      if (l.lote_interno.length > 100) throw new Error("Referencia interna demasiado larga.")
      const clave = (grupo === "pt" ? l.lote.trim().toUpperCase() : l.lote_interno) + "|" + l.fecha_produccion
      if (claves.has(clave)) throw new Error(`Lote repetido en ${a.etiqueta}.`); claves.add(clave)
      // La identidad exacta puede ser un lote existente, incluso archivado.
      const existentes = grupo === "pt" ? c.lotes_pt.filter(x => x.producto_id === a.id && x.lote.trim().toUpperCase() === l.lote.trim().toUpperCase() && x.fecha_produccion === l.fecha_produccion)
        : c.lotes_semi.filter(x => x.semielaborado_tipo_id === a.id && x.lote_interno === l.lote_interno && x.fecha_produccion === l.fecha_produccion)
      const propio = existentes.find(x => x.id === l.id)
      if (!propio && existentes.length > 1) throw new Error("Hay identidades de lote ambiguas; selecciona la fila existente correcta.")
      const id = propio?.id ?? existentes[0]?.id ?? l.id
      if (todosLotes.has(id)) throw new Error("El mismo lote aparece más de una vez."); todosLotes.add(id)
      return { id, cantidad, lote: l.lote.trim().toUpperCase(), fecha_produccion: l.fecha_produccion, fecha_vencimiento: l.fecha_vencimiento, lote_interno: l.lote_interno }
    })
    if (items.reduce((s, l) => s + l.cantidad, 0) !== total) throw new Error(`Los lotes de ${a.etiqueta} no suman el total físico contado.`)
    return { id: a.id, total, lotes: items }
  }
  return { version: 1, nota: d.nota.trim(), fuentes: [...d.fuentes], incidencias: d.incidencias.map(i => ({ ...i })), mp,
    pt: d.pt.map(a => { const v = lotes(a, "pt"); return { ...v, lotes: v.lotes.map(({ id, cantidad, lote, fecha_produccion, fecha_vencimiento }) => ({ id, cantidad, lote, fecha_produccion, fecha_vencimiento })) } }),
    semi: d.semi.map(a => { const v = lotes(a, "semi"); return { ...v, lotes: v.lotes.map(({ id, cantidad, lote_interno, fecha_produccion }) => ({ id, cantidad, lote_interno, fecha_produccion })) } }),
  }
}
export function vincularCodigoArranque(codigo: string, c: CatalogoArranque) {
  const clave = (s: string) => { const t = s.trim().toUpperCase(); return /^\d{1,12}$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t }
  const opciones = (["mp", "pt"] as const).flatMap(grupo => c[grupo].filter(a => [a.codigo, a.codigo_contable ?? ""].some(v => v && clave(v) === clave(codigo))).map(a => ({ grupo, articulo: a })))
  return opciones.length === 1 ? opciones[0] : null
}
export function importarFilasArranque(d: BorradorArranque, c: CatalogoArranque, filas: { codigo: string; nombre: string; cantidad: number; unidadArchivo: string; problema?: string; origen: string }[], fuente: string): BorradorArranque {
  const resultado = leerBorradorArranque(JSON.stringify(d)), mapeadas = filas.map(f => ({ f, enlace: vincularCodigoArranque(f.codigo, c) }))
  const incidencias: IncidenciaArranque[] = []
  for (const { f, enlace } of mapeadas) {
    const repetido = enlace && mapeadas.filter(x => x.enlace?.grupo === enlace.grupo && x.enlace?.articulo.id === enlace.articulo.id).length > 1
    const unidad = (s: string) => s.trim().toUpperCase().replace(/\.$/, "").replace(/^(KILOS?|KILOGRAMOS?)$/, "KG").replace(/^(UND|UNID|UNIDADES|UDS?|UNID\.)$/, "UNIDAD")
    const motivo = !enlace ? "Sin vínculo único: revisa catálogo, código o alcance del archivo." : repetido ? "Artículo repetido en el archivo: consolida o identifica las bodegas; no se sumaron filas automáticamente." :
      f.problema ? f.problema : !Number.isFinite(f.cantidad) || f.cantidad < 0 ? "Cantidad inválida o ambigua." : f.unidadArchivo && unidad(f.unidadArchivo) !== unidad(enlace.articulo.unidad) ? "La unidad del archivo no coincide con el catálogo." :
      enlace.articulo.unidad === "UNIDAD" && !Number.isInteger(f.cantidad) ? "El artículo requiere unidades enteras." : ""
    if (motivo) { incidencias.push({ clave: fuente + "|" + f.origen, codigo: f.codigo, nombre: f.nombre, cantidad: Number.isFinite(f.cantidad) ? f.cantidad : null, motivo, decision: "" }); continue }
    if (enlace!.grupo === "mp") resultado.mp = resultado.mp.map(a => a.id === enlace!.articulo.id ? { ...a, cantidad: String(f.cantidad) } : a)
    else resultado.pt = resultado.pt.map(a => a.id === enlace!.articulo.id ? { ...a, total: String(f.cantidad), lotes: f.cantidad === 0 ? [] : a.lotes } : a)
  }
  resultado.incidencias = [...resultado.incidencias.filter(i => !i.clave.startsWith(fuente + "|")), ...incidencias]
  resultado.fuentes = [...new Set([...resultado.fuentes, fuente])]
  return resultado
}
