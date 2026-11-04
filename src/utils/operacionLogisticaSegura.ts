export type TipoLogistica = "ELIMINAR" | "DESPACHAR" | "PREPARAR" | "LIBERAR" | "CORREGIR"
export type LineaCorreccionDespacho = { pedidoDetalleId: string; inventarioLoteId: string; unidades: number }
export type DatosCorreccionDespacho = { reservaId: string; motivo: string; lineas: LineaCorreccionDespacho[] }
export type DatosLogistica = DatosCorreccionDespacho | { pedidoId: string } | { pedidoId: string; cantidades: { pedidoDetalleId: string; unidades: number }[] } | { reservaId: string } | { reservaId: string; numeroFactura: string; cantidades: { pedidoDetalleId: string; unidades: number }[] }
export type VistaLogistica = { token: string; puede_ejecutar: boolean; bloqueos: string[]; pedido_id: string; numero_pedido_cliente: string | null; unidades: number; skus?: number; total_pedido?: number; parcial?: boolean; numero_factura?: string; reserva_id?: string | null; unidades_anteriores?: number; entrada_stock?: number; salida_stock?: number; motivo?: string }
export type IntentoLogistica = { version: 1; id: string; usuarioId: string; tipo: TipoLogistica; datos: DatosLogistica; token: string; pedidoId: string; creadoEn: string }
export type ResultadoLogistica = { estado: "CONFIRMADA"; solicitud_id: string; tipo: TipoLogistica; objeto_id: string; pedido_id: string; reserva_id?: string; resumen: Omit<VistaLogistica, "token">; repetida: boolean }
export type ResolucionLogistica = ResultadoLogistica | { estado: "ANULADA"; solicitud_id: string; tipo: TipoLogistica }
type Almacen = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s)
const idPedido = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0 && s.trim().length <= 200
export class LogisticaPendienteError extends Error { constructor() { super("Falta comprobar el resultado. Conservamos el intento; usa Reintentar o Comprobar antes de repetir la operación."); this.name = "LogisticaPendienteError" } }
export class LogisticaNoEjecutadaError extends Error { constructor(m: string) { super(m); this.name = "LogisticaNoEjecutadaError" } }
export function copiarDatosLogistica(tipo: TipoLogistica, valor: DatosLogistica): DatosLogistica {
  if (!valor || typeof valor !== "object") throw new Error("Operación incompleta.")
  if (tipo === "CORREGIR") {
    if (!("reservaId" in valor) || !uuid(valor.reservaId) || !("motivo" in valor) || typeof valor.motivo !== "string" || valor.motivo.trim().length < 8 || valor.motivo.trim().length > 1000 || !Array.isArray(valor.lineas) || !valor.lineas.length || valor.lineas.length > 3000) throw new Error("Selecciona el despacho y explica el motivo de corrección (8 a 1000 caracteres).")
    const claves = new Set<string>(); let total = 0
    const lineas = valor.lineas.map(l => {
      if (!l || !uuid(l.pedidoDetalleId) || !uuid(l.inventarioLoteId) || !Number.isSafeInteger(l.unidades) || l.unidades < 0 || l.unidades > 2147483647) throw new Error("Revisa lotes y cantidades enteras de la corrección.")
      const pedidoDetalleId = l.pedidoDetalleId.toLowerCase(), inventarioLoteId = l.inventarioLoteId.toLowerCase(), clave = `${pedidoDetalleId}:${inventarioLoteId}`
      if (claves.has(clave)) throw new Error("No repitas el mismo SKU y lote.")
      claves.add(clave); total += l.unidades; return { pedidoDetalleId, inventarioLoteId, unidades: l.unidades }
    }).sort((a, b) => a.pedidoDetalleId.localeCompare(b.pedidoDetalleId) || a.inventarioLoteId.localeCompare(b.inventarioLoteId))
    if (total <= 0 || total > 2147483647) throw new Error("La corrección debe conservar unidades; no es una anulación de despacho.")
    return { reservaId: valor.reservaId.toLowerCase(), motivo: valor.motivo.trim(), lineas }
  }
  if (tipo === "ELIMINAR") {
    if (!("pedidoId" in valor) || !idPedido(valor.pedidoId)) throw new Error("Selecciona un pedido.")
    return { pedidoId: valor.pedidoId.trim() }
  }
  if (tipo === "LIBERAR") {
    if (!("reservaId" in valor) || !uuid(valor.reservaId)) throw new Error("Selecciona una reserva.")
    return { reservaId: valor.reservaId.toLowerCase() }
  }
  if (tipo === "PREPARAR") {
    if (!("pedidoId" in valor) || !idPedido(valor.pedidoId) || !("cantidades" in valor)) throw new Error("Completa pedido y cantidades.")
    const c = copiarDatosLogistica("DESPACHAR", { reservaId: "00000000-0000-0000-0000-000000000000", numeroFactura: "", cantidades: valor.cantidades })
    return { pedidoId: valor.pedidoId.trim(), cantidades: "cantidades" in c ? c.cantidades : [] }
  }
  if (tipo !== "DESPACHAR" || !("reservaId" in valor) || !uuid(valor.reservaId) || !("numeroFactura" in valor) || typeof valor.numeroFactura !== "string" || valor.numeroFactura.trim().length > 200 || !Array.isArray(valor.cantidades) || !valor.cantidades.length || valor.cantidades.length > 1000) throw new Error("Completa reserva, factura y cantidades.")
  const ids = new Set<string>(); let total = 0
  const cantidades = valor.cantidades.map(c => {
    if (!uuid(c.pedidoDetalleId) || ids.has(c.pedidoDetalleId.toLowerCase()) || !Number.isSafeInteger(c.unidades) || c.unidades < 0 || c.unidades > 2147483647) throw new Error("Revisa líneas sin repetir y cantidades enteras, incluyendo cero cuando corresponda.")
    const pedidoDetalleId = c.pedidoDetalleId.toLowerCase(); ids.add(pedidoDetalleId); total += c.unidades
    return { pedidoDetalleId, unidades: c.unidades }
  }).sort((a, b) => a.pedidoDetalleId.localeCompare(b.pedidoDetalleId))
  if (total <= 0 || total > 2147483647) throw new Error("Total a despachar fuera de rango.")
  return { reservaId: valor.reservaId.toLowerCase(), numeroFactura: valor.numeroFactura.trim(), cantidades }
}
const enCurso = new Map<string, { datos: string; promesa: Promise<ResultadoLogistica> }>()
export function crearControlLogistica(op: {
  almacen: Almacen; proyecto: string; usuarioId: string
  ejecutar: (s: IntentoLogistica) => Promise<unknown>; resolver: (s: IntentoLogistica) => Promise<unknown>
}) {
  const prefijo = `cibuspan:logistica:v1:${encodeURIComponent(op.proyecto)}:${op.usuarioId}:`, clave = (id: string) => prefijo + id
  function validar(s: IntentoLogistica) {
    if (!s || s.version !== 1 || !uuid(s.id) || s.usuarioId !== op.usuarioId || !idPedido(s.pedidoId) || !/^[a-f0-9]{32}$/.test(s.token) || typeof s.creadoEn !== "string" || !Number.isFinite(Date.parse(s.creadoEn))) throw new Error("Intento logístico inválido. Conserva su copia antes de comprobarlo.")
    const datos = copiarDatosLogistica(s.tipo, s.datos)
    if ((s.tipo === "ELIMINAR" || s.tipo === "PREPARAR") && "pedidoId" in datos && datos.pedidoId !== s.pedidoId) throw new Error("El pedido del intento no coincide con la revisión guardada.")
    return { ...s, datos }
  }
  const listar = (): IntentoLogistica[] => {
    const datos: IntentoLogistica[] = []
    try {
      for (let i = 0; i < op.almacen.length; i++) {
        const k = op.almacen.key(i); if (!k?.startsWith(prefijo)) continue
        const s = validar(JSON.parse(op.almacen.getItem(k) || "null")); if (k !== clave(s.id)) throw new Error(); datos.push(s)
      }
    } catch { throw new Error("No se pudo leer un intento logístico guardado. No repitas la operación; conserva este navegador y solicita revisión.") }
    return datos.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
  }
  const retirar = (id: string) => { try { op.almacen.removeItem(clave(id)) } catch { /* comprobante confirmado, se podrá consultar otra vez */ } }
  function comprobar(r: unknown, s: IntentoLogistica): ResolucionLogistica {
    const v = r as ResolucionLogistica | null
    if (!v || v.solicitud_id !== s.id || v.tipo !== s.tipo) throw new LogisticaPendienteError()
    if (v.estado === "ANULADA") return v
    const objeto = "pedidoId" in s.datos ? s.datos.pedidoId : s.datos.reservaId
    if (v.estado !== "CONFIRMADA" || v.objeto_id !== objeto || v.pedido_id !== s.pedidoId || typeof v.repetida !== "boolean" || v.resumen?.pedido_id !== s.pedidoId || !Number.isSafeInteger(v.resumen?.unidades) || v.resumen.unidades < 0 || !Array.isArray(v.resumen.bloqueos)) throw new LogisticaPendienteError()
    if (s.tipo === "DESPACHAR" && "numeroFactura" in s.datos && (v.resumen.unidades !== s.datos.cantidades.reduce((n, c) => n + c.unidades, 0) || v.resumen.numero_factura !== s.datos.numeroFactura)) throw new LogisticaPendienteError()
    if (s.tipo === "PREPARAR" || s.tipo === "LIBERAR") {
      if (!uuid(v.reserva_id) || v.resumen.reserva_id !== v.reserva_id) throw new LogisticaPendienteError()
      if (s.tipo === "PREPARAR" && "cantidades" in s.datos && v.resumen.unidades !== s.datos.cantidades.reduce((n, c) => n + c.unidades, 0)) throw new LogisticaPendienteError()
      if (s.tipo === "LIBERAR" && "reservaId" in s.datos && v.reserva_id !== s.datos.reservaId) throw new LogisticaPendienteError()
    }
    if (s.tipo === "CORREGIR" && "lineas" in s.datos) {
      if (v.reserva_id !== s.datos.reservaId || v.resumen.reserva_id !== s.datos.reservaId || v.resumen.unidades !== s.datos.lineas.reduce((n, l) => n + l.unidades, 0) || v.resumen.motivo !== s.datos.motivo || !Number.isSafeInteger(v.resumen.unidades_anteriores) || (v.resumen.unidades_anteriores ?? -1) < 0 || !Number.isSafeInteger(v.resumen.entrada_stock) || (v.resumen.entrada_stock ?? -1) < 0 || !Number.isSafeInteger(v.resumen.salida_stock) || (v.resumen.salida_stock ?? -1) < 0 || v.resumen.unidades_anteriores! - v.resumen.unidades !== v.resumen.entrada_stock! - v.resumen.salida_stock!) throw new LogisticaPendienteError()
    }
    return v
  }
  const resolver = async (intento: IntentoLogistica) => { const s = validar(intento), r = comprobar(await op.resolver(s), s); retirar(s.id); return r }
  const ejecutar = async (intento: IntentoLogistica): Promise<ResultadoLogistica> => {
    const s = validar(JSON.parse(JSON.stringify(intento))), datos = JSON.stringify({ tipo: s.tipo, datos: s.datos, token: s.token, pedidoId: s.pedidoId })
    const pendientes = listar(), anterior = pendientes.find(p => p.id === s.id)
    if ((!anterior && pendientes.length) || anterior && JSON.stringify({ tipo: anterior.tipo, datos: anterior.datos, token: anterior.token, pedidoId: anterior.pedidoId }) !== datos) throw new LogisticaPendienteError()
    const k = clave(s.id), actual = enCurso.get(k)
    if (actual) { if (actual.datos !== datos) throw new LogisticaPendienteError(); return actual.promesa }
    if (!anterior) {
      const guardado = JSON.stringify(s)
      try { op.almacen.setItem(k, guardado); if (op.almacen.getItem(k) !== guardado) throw new Error() }
      catch { throw new Error("No se pudo conservar el intento. No se envió la operación.") }
    }
    const realizar = async (): Promise<ResultadoLogistica> => {
      try { const r = comprobar(await op.ejecutar(s), s); if (r.estado !== "CONFIRMADA") throw new Error("El servidor no confirmó la operación."); retirar(s.id); return r }
      catch (e) {
        let r: ResolucionLogistica
        try { r = await resolver(s) } catch { throw new LogisticaPendienteError() }
        if (r.estado === "CONFIRMADA") return { ...r, repetida: true }
        throw new LogisticaNoEjecutadaError(e instanceof Error ? e.message : "La operación no se ejecutó. Actualiza y revisa otra vez.")
      }
    }
    const promesa = realizar(); enCurso.set(k, { datos, promesa })
    try { return await promesa } finally { if (enCurso.get(k)?.promesa === promesa) enCurso.delete(k) }
  }
  return { listar, ejecutar, resolver }
}
