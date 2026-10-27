export type DetalleNuevoPedido = { productoId: string; totalUnidades: number; unidadManejo: number }
export type NuevoPedidoDb = {
  numeroPedidoCliente: string; clienteId: string; bodegaId: string; fechaEntrega: string; horaEntrega: string
  prioridad: "NORMAL" | "ALTA" | "URGENTE"; tipoEmpaque: string; detalles: DetalleNuevoPedido[]
}
export type SolicitudPedidoPendiente = { version: 1; solicitudId: string; usuarioId: string; creadoEn: string; origen: string; datos: NuevoPedidoDb }
export type PedidoRegistrado = { id: string; numeroPedidoCliente: string; totalUnidades: number; repetida: boolean; vigente: boolean }
type Almacen = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">
type Resolucion = { estado: "CONFIRMADA"; resultado: PedidoRegistrado } | { estado: "ANULADA"; resultado: null }
export class RegistroPedidoPendienteError extends Error {
  constructor() { super("Falta confirmar el resultado del pedido. Conservamos el intento: usa Reintentar o Comprobar antes de registrar otro."); this.name = "RegistroPedidoPendienteError" }
}
export class RegistroPedidoNoGuardadoError extends Error {
  constructor(m: string) { super(m); this.name = "RegistroPedidoNoGuardadoError" }
}
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s)
const fecha = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
const entero = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 2147483647
export function copiarDatosPedido(d: NuevoPedidoDb): NuevoPedidoDb {
  if (!d || typeof d.numeroPedidoCliente !== "string" || !d.numeroPedidoCliente.trim() || d.numeroPedidoCliente.trim().length > 100 ||
    !uuid(d.clienteId) || !uuid(d.bodegaId) || !fecha(d.fechaEntrega) || typeof d.horaEntrega !== "string" ||
    (d.horaEntrega !== "" && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(d.horaEntrega)) ||
    !["NORMAL", "ALTA", "URGENTE"].includes(d.prioridad) || typeof d.tipoEmpaque !== "string" || d.tipoEmpaque.length > 100 ||
    !Array.isArray(d.detalles) || !d.detalles.length || d.detalles.length > 1000) throw new Error("Revisa número, cliente, bodega, fecha y productos del pedido.")
  const ids = new Set<string>(); let total = 0
  const detalles = d.detalles.map(l => {
    if (!uuid(l.productoId) || ids.has(l.productoId) || !entero(l.totalUnidades) || !entero(l.unidadManejo) || l.totalUnidades % l.unidadManejo !== 0) throw new Error("Revisa productos sin repetir, cantidades enteras y unidad de manejo.")
    ids.add(l.productoId); total += l.totalUnidades
    if (!entero(total)) throw new Error("El total del pedido excede el rango permitido.")
    return { productoId: l.productoId, totalUnidades: l.totalUnidades, unidadManejo: l.unidadManejo }
  })
  return { numeroPedidoCliente: d.numeroPedidoCliente.trim().toUpperCase(), clienteId: d.clienteId, bodegaId: d.bodegaId,
    fechaEntrega: d.fechaEntrega, horaEntrega: d.horaEntrega, prioridad: d.prioridad, tipoEmpaque: d.tipoEmpaque, detalles }
}
const enCurso = new Map<string, { datos: string; promesa: Promise<PedidoRegistrado> }>()
export function crearControlRegistroPedido(op: {
  almacen: Almacen; proyecto: string; usuarioId: string
  registrar: (s: SolicitudPedidoPendiente) => Promise<unknown>; resolver: (id: string) => Promise<unknown>
}) {
  const prefijo = `cibuspan:pedido:v1:${encodeURIComponent(op.proyecto)}:${op.usuarioId}:`, clave = (id: string) => prefijo + id
  const listar = (): SolicitudPedidoPendiente[] => {
    const pendientes: SolicitudPedidoPendiente[] = []
    try {
      for (let i = 0; i < op.almacen.length; i++) {
        const k = op.almacen.key(i); if (!k?.startsWith(prefijo)) continue
        const s = JSON.parse(op.almacen.getItem(k) || "null") as SolicitudPedidoPendiente
        if (!s || s.version !== 1 || !uuid(s.solicitudId) || s.usuarioId !== op.usuarioId || k !== clave(s.solicitudId) ||
          typeof s.origen !== "string" || typeof s.creadoEn !== "string" || !Number.isFinite(Date.parse(s.creadoEn))) throw new Error()
        pendientes.push({ ...s, datos: copiarDatosPedido(s.datos) })
      }
    } catch { throw new Error("No se pudo leer un intento guardado. No registres el pedido nuevamente hasta comprobar su resultado; conserva este navegador.") }
    return pendientes.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
  }
  const retirar = (id: string) => { try { op.almacen.removeItem(clave(id)) } catch { /* éxito confirmado; se podrá comprobar otra vez */ } }
  const resultado = (r: unknown, id: string, d?: NuevoPedidoDb): PedidoRegistrado => {
    const v = r as { solicitud_id?: unknown; pedido_id?: unknown; numero_pedido_cliente?: unknown; total_unidades?: unknown; repetida?: unknown; vigente?: unknown } | null
    if (!v || v.solicitud_id !== id || typeof v.pedido_id !== "string" || !/^PED-\d{8}-[a-f0-9]{32}$/i.test(v.pedido_id) || !v.pedido_id.endsWith(id.replaceAll("-", "")) ||
      typeof v.numero_pedido_cliente !== "string" || !v.numero_pedido_cliente.trim() || !entero(v.total_unidades) || typeof v.repetida !== "boolean" || typeof v.vigente !== "boolean" ||
      (d && (v.numero_pedido_cliente !== d.numeroPedidoCliente || v.total_unidades !== d.detalles.reduce((s, l) => s + l.totalUnidades, 0)))) throw new RegistroPedidoPendienteError()
    return { id: v.pedido_id, numeroPedidoCliente: v.numero_pedido_cliente, totalUnidades: v.total_unidades, repetida: v.repetida, vigente: v.vigente }
  }
  const resolver = async (id: string): Promise<Resolucion> => {
    if (!uuid(id)) throw new Error("Solicitud inválida.")
    const datos = listar().find(s => s.solicitudId === id)?.datos
    const r = await op.resolver(id) as { solicitud_id?: unknown; estado?: unknown; pedido_id?: unknown } | null
    if (!r || r.solicitud_id !== id || !["CONFIRMADA", "ANULADA"].includes(String(r.estado)) || r.estado === "ANULADA" && r.pedido_id !== null) throw new RegistroPedidoPendienteError()
    const res: Resolucion = r.estado === "CONFIRMADA" ? { estado: "CONFIRMADA", resultado: resultado(r, id, datos) } : { estado: "ANULADA", resultado: null }
    retirar(id); return res
  }
  const registrar = async (id: string, datos: NuevoPedidoDb, origen = "MANUAL"): Promise<PedidoRegistrado> => {
    if (!uuid(id) || typeof origen !== "string") throw new Error("Falta la clave del intento de pedido.")
    const copia = copiarDatosPedido(datos), texto = JSON.stringify(copia), k = clave(id), pendientes = listar(), anterior = pendientes.find(s => s.solicitudId === id)
    if ((!anterior && pendientes.length) || anterior && JSON.stringify(anterior.datos) !== texto) throw new RegistroPedidoPendienteError()
    const actual = enCurso.get(k)
    if (actual) { if (actual.datos !== texto) throw new RegistroPedidoPendienteError(); return actual.promesa }
    const s: SolicitudPedidoPendiente = anterior ?? { version: 1, solicitudId: id, usuarioId: op.usuarioId, creadoEn: new Date().toISOString(), origen, datos: copia }
    if (!anterior) {
      const guardado = JSON.stringify(s)
      try { op.almacen.setItem(k, guardado); if (op.almacen.getItem(k) !== guardado) throw new Error() }
      catch { throw new Error("No se pudo conservar el intento en este navegador. No se envió el pedido.") }
    }
    const ejecutar = async (): Promise<PedidoRegistrado> => {
      try { const r = resultado(await op.registrar(s), id, copia); retirar(id); return r }
      catch (error) {
        let r: Resolucion
        try { r = await resolver(id) } catch { throw new RegistroPedidoPendienteError() }
        if (r.estado === "CONFIRMADA") return { ...r.resultado, repetida: true }
        throw new RegistroPedidoNoGuardadoError(error instanceof Error ? error.message : "El pedido no se guardó. Revisa los datos.")
      }
    }
    const promesa = ejecutar(); enCurso.set(k, { datos: texto, promesa })
    try { return await promesa } finally { if (enCurso.get(k)?.promesa === promesa) enCurso.delete(k) }
  }
  return { listar, registrar, resolver }
}
