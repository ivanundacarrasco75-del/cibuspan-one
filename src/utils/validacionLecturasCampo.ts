import type { LecturaFavorita } from "../repositories/campoComercialRepository"
import { CAMPOS_CANTIDADES_CAMPO, CAMPOS_FECHAS_CAMPO } from "./lecturaCapturasCampo.ts"

export const VERSION_VALIDACION_CAMPO = "20261013.1"
export const CAMPOS_LECTURA_VALIDABLES = [...CAMPOS_CANTIDADES_CAMPO, ...CAMPOS_FECHAS_CAMPO] as const
export type EstadoDatoCampo = "DOBLE_LECTURA" | "REVISION_MANUAL" | "MANUAL_DECLARADO" | "SIN_DATO" | "PENDIENTE"
export type VerificacionDatoCampo = { estado: EstadoDatoCampo; valor: number | string | null; motivo?: string }
export type VerificacionCamposCampo = Record<string, VerificacionDatoCampo>
const codigo = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")
const nombre = (v: string | null | undefined) => (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
export function identidadDobleLecturaCampo(a: LecturaFavorita, b: LecturaFavorita) {
  return /^\d{13}$/.test(codigo(a.codigo_barras)) && codigo(a.codigo_barras) === codigo(b.codigo_barras) && nombre(a.local_nombre).length >= 6 && nombre(a.local_nombre) === nombre(b.local_nombre)
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
  // Control de coherencia, nunca usado para calcular o reemplazar un valor faltante.
  if (r != null && s != null && d != null && r > 0 && d > 0) {
    const tolerancia = Math.max(1, s * .05, .005 * (r + d) + .000025)
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
    if (identidad && Math.min(a.confianza, b.confianza) >= .65 && va !== null && va === vb && !coherencia[c]) dato = { estado: "DOBLE_LECTURA", valor: va }
    else if (identidad && a.campos_sin_dato?.includes(c) && b.campos_sin_dato?.includes(c)) dato = { estado: "SIN_DATO", valor: null }
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
    } else if (resultado.verificacion_campos?.[c]?.estado !== "DOBLE_LECTURA") Object.assign(combinado, { [c]: null })
  }
  return combinado
}
