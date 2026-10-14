import type { GeorreferenciaCampo, FotoCampo } from "./georreferenciaCampo"
import { datoVerificadoCampo, esIngresoManualCampo, type VerificacionCamposCampo } from "./validacionLecturasCampo.ts"
import type { LecturaFavorita } from "../repositories/campoComercialRepository"

export type IndicadorCampo = "rotacion" | "stock" | "dias" | "caras" | "precio" | "precio_afiliado" | "venta" | "prediccion" | "stock_cd" | "dias_cd" | "presencia" | "codificacion" | "quiebres" | "sin_perchar"
export type OrigenVisitaCampo = "TODOS" | "MERCADERISTA" | "KAM"
export const INDICADORES_CAMPO: Array<{ id: IndicadorCampo; nombre: string; unidad: string; agregacion: "PROMEDIO" | "SUMA"; descripcion: string }> = [
  { id: "rotacion", nombre: "Rotación diaria", unidad: "u/día", agregacion: "PROMEDIO", descripcion: "Venta promedio diaria reportada; promedio entre los locales con dato." },
  { id: "stock", nombre: "Stock en el local", unidad: "unidades", agregacion: "SUMA", descripcion: "Suma de existencias de los locales con dato; cada local se cuenta una vez." },
  { id: "dias", nombre: "Días de inventario local", unidad: "días", agregacion: "PROMEDIO", descripcion: "Promedio de días de inventario reportados en los locales con dato." },
  { id: "caras", nombre: "Caras en percha", unidad: "caras", agregacion: "PROMEDIO", descripcion: "Promedio de caras registradas por local." },
  { id: "precio", nombre: "Precio al público", unidad: "USD", agregacion: "PROMEDIO", descripcion: "Precio promedio registrado en los locales con dato." },
  { id: "precio_afiliado", nombre: "Precio afiliado", unidad: "USD", agregacion: "PROMEDIO", descripcion: "Precio de afiliado promedio registrado." },
  { id: "venta", nombre: "Venta promedio diaria", unidad: "USD/día", agregacion: "PROMEDIO", descripcion: "Valor de venta diaria reportado; promedio por local con dato." },
  { id: "prediccion", nombre: "Predicción de venta", unidad: "unidades", agregacion: "PROMEDIO", descripcion: "Predicción reportada, promediada entre locales; conserva el horizonte de la fuente." },
  { id: "stock_cd", nombre: "Stock del CD", unidad: "cajas", agregacion: "PROMEDIO", descripcion: "Promedio del stock de CD reportado; no se suma porque varios locales pueden mostrar el mismo CD." },
  { id: "dias_cd", nombre: "Días de inventario CD", unidad: "días", agregacion: "PROMEDIO", descripcion: "Promedio de días de inventario del CD reportados." },
  { id: "presencia", nombre: "Presencia en percha", unidad: "%", agregacion: "PROMEDIO", descripcion: "Porcentaje de locales con presencia entre los que sí se revisaron físicamente." },
  { id: "codificacion", nombre: "Codificación verificada", unidad: "%", agregacion: "PROMEDIO", descripcion: "Porcentaje de locales codificados entre los que tienen una respuesta registrada." },
  { id: "quiebres", nombre: "Quiebres de stock", unidad: "%", agregacion: "PROMEDIO", descripcion: "Porcentaje de locales con stock cero entre los que registraron stock." },
  { id: "sin_perchar", nombre: "Con stock sin perchar", unidad: "%", agregacion: "PROMEDIO", descripcion: "Porcentaje de locales con stock positivo y cero caras, entre los que registraron ambos datos." },
]
export type SemanaCampo = { desde: string; hasta: string; etiqueta: string }
export type ProductoDashboardCampo = { id: string; codigo: string; nombre: string }
export type RegistroDashboardCampo = {
  id: string; fecha: string; visitado_en: string; actualizado_en: string
  cliente_id: string; local_id: string; local_nombre: string
  producto_id: string; producto_codigo: string; producto_nombre: string; responsable_rol: string | null
  georreferencia?: GeorreferenciaCampo | null; fotos_georreferencia?: FotoCampo[]
  capturas_app?: string[]; lectura_guardada?: Partial<LecturaFavorita>; lector_estado?: string | null
  verificacion_campos?: VerificacionCamposCampo; version_validacion?: string
  lectura_almacenada?: LecturaFavorita
  registrado_por?: string; puede_procesar?: boolean
  responsable_nombre?: string | null; visita_id?: string
  valores: Record<IndicadorCampo, number | null>
}
export function valorIndicadorValidadoCampo(r: RegistroDashboardCampo, indicador: IndicadorCampo) {
  const campos: Partial<Record<IndicadorCampo, string>> = { rotacion: "rotacion_diaria_unidades", stock: "stock_local_unidades", dias: "dias_inventario_local", precio: "precio_comercio", precio_afiliado: "precio_afiliado", venta: "venta_diaria_valor", prediccion: "prediccion_venta_unidades", stock_cd: "stock_cd_cajas", dias_cd: "dias_inventario_cd", quiebres: "stock_local_unidades", sin_perchar: "stock_local_unidades" }
  const campo = campos[indicador]
  if (!campo || esIngresoManualCampo(r)) return r.valores[indicador]
  const actual = r.lectura_guardada?.[campo as keyof LecturaFavorita]
  if (datoVerificadoCampo(campo, actual, r.verificacion_campos)) return r.valores[indicador]
  // La captura sólo de respaldo y el ingreso sin lector son declaraciones manuales.
  if (!Object.keys(r.verificacion_campos ?? {}).length && ["RESPALDO_MANUAL", "SIN_LECTOR"].includes(r.lector_estado ?? "")) return r.valores[indicador]
  return null
}
export type PuntoSemanaCampo = {
  valor: number | null; locales_con_dato: number; locales_revisados: number; ultima_fecha: string | null
  pendientes?: Array<{ registroId: string; campo: string; fecha: string; clienteId: string }>
}
export type SerieSkuCampo = ProductoDashboardCampo & { semanas: PuntoSemanaCampo[] }

export function fechaHoyCampoDashboard(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora)
}
function fechaUtc(fecha: string) {
  const parsed = new Date(`${fecha}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha) throw new Error("Selecciona una fecha de referencia válida.")
  return parsed
}
const sumarDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * 86400000).toISOString().slice(0, 10)

export function semanasDashboardCampo(referencia: string): SemanaCampo[] {
  const fecha = fechaUtc(referencia), lunes = new Date(fecha.getTime() - ((fecha.getUTCDay() + 6) % 7) * 86400000)
  return Array.from({ length: 5 }, (_, indice) => ({
    desde: sumarDias(lunes, (indice - 4) * 7), hasta: sumarDias(lunes, (indice - 4) * 7 + 6),
    etiqueta: indice === 4 ? "Semana de referencia" : `Hace ${4 - indice} ${indice === 3 ? "semana" : "semanas"}`,
  }))
}

export function resumirSemanasCampo({ registros, productos, semanas, indicador, clienteId = "", localId = "", origen = "TODOS", soloValidados = false, camposPendientes }: {
  registros: RegistroDashboardCampo[]; productos: ProductoDashboardCampo[]; semanas: SemanaCampo[]
  soloValidados?: boolean; indicador: IndicadorCampo; clienteId?: string; localId?: string; origen?: OrigenVisitaCampo
  camposPendientes?: (r: RegistroDashboardCampo) => Array<{ campo: string }>
}): SerieSkuCampo[] {
  const ultimos = new Map<string, RegistroDashboardCampo>()
  const visibles = registros.filter((r) => (!clienteId || r.cliente_id === clienteId) && (!localId || r.local_id === localId) && (origen === "TODOS" || r.responsable_rol === origen))
  for (const registro of visibles) {
    const semana = semanas.findIndex((s) => registro.fecha >= s.desde && registro.fecha <= s.hasta)
    if (semana < 0) continue
    const clave = `${semana}|${registro.cliente_id}|${registro.local_id}|${registro.producto_id}`, anterior = ultimos.get(clave)
    const orden = (r: RegistroDashboardCampo) => `${r.fecha}|${r.visitado_en}|${r.actualizado_en}|${r.id}`
    if (!anterior || orden(registro) > orden(anterior)) ultimos.set(clave, registro)
  }
  const catalogo = new Map(productos.map((p) => [p.id, p]))
  for (const r of ultimos.values()) if (!catalogo.has(r.producto_id)) catalogo.set(r.producto_id, { id: r.producto_id, codigo: r.producto_codigo, nombre: r.producto_nombre })
  const agrupados = new Map<string, RegistroDashboardCampo[]>()
  for (const [clave, r] of ultimos) {
    const key = `${clave.split("|")[0]}|${r.producto_id}`, grupo = agrupados.get(key) ?? []
    grupo.push(r); agrupados.set(key, grupo)
  }
  const config = INDICADORES_CAMPO.find((i) => i.id === indicador)!
  return [...catalogo.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.codigo.localeCompare(b.codigo)).map((producto) => ({
    ...producto,
    semanas: semanas.map((_, indice) => {
      const registrosSku = agrupados.get(`${indice}|${producto.id}`) ?? []
      const valores = registrosSku.map((r) => soloValidados ? valorIndicadorValidadoCampo(r, indicador) : r.valores[indicador])
      const datos = registrosSku.filter((_, i) => valores[i] !== null && Number.isFinite(valores[i]))
      const suma = valores.reduce<number>((total, v) => total + (v !== null && Number.isFinite(v) ? v : 0), 0)
      return {
        valor: !datos.length ? null : config.agregacion === "SUMA" ? suma : suma / datos.length,
        locales_con_dato: datos.length, locales_revisados: registrosSku.length,
        ultima_fecha: datos.length ? datos.map((r) => r.fecha).sort().at(-1)! : null,
        ...(camposPendientes ? { pendientes: registrosSku.flatMap((r) => camposPendientes(r).map((c) => ({ registroId: r.id, campo: c.campo, fecha: r.fecha, clienteId: r.cliente_id }))) } : {}),
      }
    }),
  }))
}

export function variacionSemanalCampo(actual: PuntoSemanaCampo, anterior: PuntoSemanaCampo) {
  if (actual.valor === null || anterior.valor === null) return null
  return { diferencia: actual.valor - anterior.valor, porcentaje: anterior.valor === 0 ? null : (actual.valor - anterior.valor) / anterior.valor * 100 }
}
