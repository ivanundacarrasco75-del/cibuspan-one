import type { LecturaFavorita } from "../repositories/campoComercialRepository"
import { CAMPOS_CANTIDADES_CAMPO, CAMPOS_FECHAS_CAMPO } from "./lecturaCapturasCampo.ts"

export const VERSION_VALIDACION_CAMPO = "20261013.2"
export const CAMPOS_LECTURA_VALIDABLES = [...CAMPOS_CANTIDADES_CAMPO, ...CAMPOS_FECHAS_CAMPO] as const
export type EstadoDatoCampo = "DOBLE_LECTURA" | "REVISION_MANUAL" | "MANUAL_DECLARADO" | "SIN_DATO" | "PENDIENTE"
export type VerificacionDatoCampo = { estado: EstadoDatoCampo; valor: number | string | null; motivo?: string }
export type VerificacionCamposCampo = Record<string, VerificacionDatoCampo>
const codigo = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")
const nombre = (v: string | null | undefined) => (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
export function identidadDobleLecturaCampo(a: LecturaFavorita, b: LecturaFavorita) {
  return /^\d{13}$/.test(codigo(a.codigo_barras)) && codigo(a.codigo_barras) === codigo(b.codigo_barras) && nombre(a.local_nombre).length >= 6 && nombre(a.local_nombre) === nombre(b.local_nombre)
}
const toleranciaInventario = (r: number, s: number, d: number) => Math.max(.05, s * .01, .005 * (r + d) + .000025)

// El cociente confirma un valor presente en las capturas; no crea una rotación.
// Las lecturas recibidas pertenecen únicamente a las imágenes del SKU seleccionado.
export function conciliarRotacionInventarioCampo(a: LecturaFavorita, b: LecturaFavorita, lecturas: LecturaFavorita[]) {
  const s = a.stock_local_unidades, d = a.dias_inventario_local
  if (!identidadDobleLecturaCampo(a, b) || Math.min(a.confianza, b.confianza) < .65 ||
    s == null || !Number.isSafeInteger(s) || s <= 0 || s !== b.stock_local_unidades ||
    d == null || !Number.isFinite(d) || d <= 0 || d !== b.dias_inventario_local) return null
  const observadas = lecturas.filter((l) => l.confianza >= .65).map((l) => l.rotacion_diaria_unidades)
    .filter((r): r is number => r != null && Number.isFinite(r))
  const candidatas = [...new Set(observadas)].filter((r) => r > 0 && r < 100 && Math.abs(r * d - s) <= toleranciaInventario(r, s, d))
  if (candidatas.length !== 1) return null
  const r = candidatas[0]
  if (observadas.filter((v) => v === r).length < 2 || (a.rotacion_diaria_unidades === r && b.rotacion_diaria_unidades === r)) return null
  const evidencia = { metodo: "STOCK_DIVIDIDO_DIAS", stock: s, dias: d, cociente: s / d, valor: r,
    tolerancia_stock: toleranciaInventario(r, s, d), lecturas_observadas: observadas,
    principal_anterior: a.rotacion_diaria_unidades, control_anterior: b.rotacion_diaria_unidades }
  a.rotacion_diaria_unidades = r; b.rotacion_diaria_unidades = r
  for (const l of [a, b]) l.advertencias = l.advertencias.filter((m) => !m.includes("Valores distintos para rotación diaria") && m !== "No se reconoció la rotación diaria.")
  return evidencia
}
export function motivosCoherenciaCampo(datos: Partial<LecturaFavorita>) {
  const motivos: Record<string, string> = {}
  for (const [c] of CAMPOS_CANTIDADES_CAMPO) {
    const v = datos[c]
    if (v == null) continue
    if (!Number.isFinite(v) || v < 0 || (c.startsWith("participacion_") && v > 100) || (["stock_local_unidades", "unidades_por_caja", "cantidad_ultimo_pedido", "cantidad_ultimo_despacho"].includes(c) && !Number.isSafeInteger(v))) motivos[c] = "Cantidad fuera del formato válido."
  }
  for (const [c] of CAMPOS_FECHAS_CAMPO) {
    const v = datos[c]
    if (v != null) { const dia = new Date(`${v}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== v) motivos[c] = "La fecha reconocida no es válida." }
  }
  const r = datos.rotacion_diaria_unidades, s = datos.stock_local_unidades, d = datos.dias_inventario_local
  if (r != null && r >= 100) motivos.rotacion_diaria_unidades = "La rotación debe ser menor de 100 unidades diarias; comprobar stock y días de inventario."
  // Stock / días debe concordar con la rotación, admitiendo el redondeo del reporte.
  if (r != null && s != null && d != null && r >= 0 && d > 0) {
    const tolerancia = toleranciaInventario(r, s, d)
    if (Math.abs(r * d - s) > tolerancia) for (const c of ["rotacion_diaria_unidades", "stock_local_unidades", "dias_inventario_local"]) motivos[c] = "Rotación, stock y días de inventario no concuerdan; revisar la captura."
  }
  if (datos.precio_comercio != null && datos.precio_afiliado != null && datos.precio_afiliado > datos.precio_comercio + .01) motivos.precio_afiliado = "Precio afiliado mayor al precio comercio; requiere revisión."
  return motivos
}
export function verificarDosLecturasCampo(a: LecturaFavorita, b: LecturaFavorita): VerificacionCamposCampo {
  const coherencia = motivosCoherenciaCampo(a), identidad = identidadDobleLecturaCampo(a, b)
  return Object.fromEntries(CAMPOS_LECTURA_VALIDABLES.map(([c]) => {
    const va = a[c] ?? null, vb = b[c] ?? null
    let dato: VerificacionDatoCampo = { estado: "PENDIENTE", valor: va, motivo: "No hubo coincidencia de dos lecturas para este campo." }
    const fechaAsociada = c === "cantidad_ultimo_pedido" ? "fecha_ultimo_pedido" : c === "cantidad_ultimo_despacho" ? "fecha_ultimo_despacho" : null
    const fechaPendiente = fechaAsociada && typeof va === "number" && va > 0 && (!a[fechaAsociada] || a[fechaAsociada] !== b[fechaAsociada] || !!coherencia[fechaAsociada])
    if (identidad && Math.min(a.confianza, b.confianza) >= .65 && va !== null && va === vb && !coherencia[c] && !fechaPendiente) dato = { estado: "DOBLE_LECTURA", valor: va }
    else if (identidad && a.campos_sin_dato?.includes(c) && b.campos_sin_dato?.includes(c)) dato = { estado: "SIN_DATO", valor: null }
    else if (fechaPendiente) dato.motivo = "La cantidad no tiene una fecha asociada confirmada en ambas lecturas."
    else if (coherencia[c]) dato.motivo = coherencia[c]
    else if (!identidad) dato.motivo = "No se confirmó local y SKU en dos lecturas."
    return [c, dato]
  }))
}
export function datoVerificadoCampo(campo: string, valor: unknown, verificacion?: VerificacionCamposCampo | null) {
  const v = verificacion?.[campo]
  return !!v && ["DOBLE_LECTURA", "REVISION_MANUAL", "MANUAL_DECLARADO"].includes(v.estado) && v.valor === valor
}
export function verificacionManualCampo(datos: Partial<LecturaFavorita>, estado: "REVISION_MANUAL" | "MANUAL_DECLARADO" = "REVISION_MANUAL"): VerificacionCamposCampo {
  return Object.fromEntries(CAMPOS_LECTURA_VALIDABLES.filter(([c]) => datos[c] != null).map(([c]) => [c, { estado, valor: datos[c]! }]))
}

// Sólo los campos declarados manualmente se conservan frente a una nueva lectura.
export function combinarLecturaValidadaCampo(actual: LecturaFavorita, resultado: LecturaFavorita): LecturaFavorita {
  const combinado = { ...actual, ...resultado, verificacion_campos: { ...resultado.verificacion_campos } }
  for (const [c] of CAMPOS_LECTURA_VALIDABLES) {
    const manual = actual.verificacion_campos?.[c]
    if (manual && ["REVISION_MANUAL", "MANUAL_DECLARADO"].includes(manual.estado) && manual.valor === actual[c]) {
      Object.assign(combinado, { [c]: actual[c] }); combinado.verificacion_campos[c] = manual
    } else if (resultado.verificacion_campos?.[c]?.estado === "SIN_DATO") Object.assign(combinado, { [c]: null })
  }
  return combinado
}
