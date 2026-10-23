export type DetalleRegistroProduccion = {
  productoId: string
  tipoDestino: "PRODUCTO_TERMINADO" | "SEMIELABORADO"
  semielaboradoTipoId?: string | null
  numeroParadas: number
  tamanoParada: number
  unidades: number
  fechaProduccion: string
  lote?: string | null
  fechaVencimiento?: string | null
  orden: number
}
export type DatosRegistroProduccion = { fechaProduccionGeneral: string; detalles: DetalleRegistroProduccion[] }
export type SolicitudProduccionPendiente = DatosRegistroProduccion & {
  version: 1; solicitudId: string; usuarioId: string; creadoEn: string
}
export type ProduccionRegistrada = { produccionId: string; repetida: boolean }
type Almacen = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">
type Resolucion = { estado: "CONFIRMADA" | "ANULADA"; produccionId: string | null }
export class RegistroProduccionPendienteError extends Error {
  constructor() {
    super("No se pudo confirmar el resultado. Conservamos el intento: usa Reintentar registro o Comprobar para corregir antes de registrar otra producción.")
    this.name = "RegistroProduccionPendienteError"
  }
}
const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const enCurso = new Map<string, { datos: string; promesa: Promise<ProduccionRegistrada> }>()

function copiaDatos(datos: DatosRegistroProduccion): DatosRegistroProduccion {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaProduccionGeneral) || !Array.isArray(datos.detalles) || !datos.detalles.length) {
    throw new Error("Revisa la fecha y los productos de la producción.")
  }
  const detalles = datos.detalles.map(d => {
    if (!esUuid(d.productoId) || !["PRODUCTO_TERMINADO", "SEMIELABORADO"].includes(d.tipoDestino) ||
      ![d.numeroParadas, d.tamanoParada, d.unidades].every(n => Number.isSafeInteger(n) && n > 0) ||
      !Number.isSafeInteger(d.orden) || !/^\d{4}-\d{2}-\d{2}$/.test(d.fechaProduccion)) {
      throw new Error("Revisa las cantidades, fechas y productos antes de guardar.")
    }
    return { productoId: d.productoId, tipoDestino: d.tipoDestino, semielaboradoTipoId: d.semielaboradoTipoId ?? null,
      numeroParadas: d.numeroParadas, tamanoParada: d.tamanoParada, unidades: d.unidades,
      fechaProduccion: d.fechaProduccion, lote: d.lote ?? null, fechaVencimiento: d.fechaVencimiento ?? null, orden: d.orden }
  })
  return { fechaProduccionGeneral: datos.fechaProduccionGeneral, detalles }
}

export function detallesProduccionRpc(datos: DatosRegistroProduccion) {
  return datos.detalles.map(d => ({ producto_id: d.productoId, tipo_destino: d.tipoDestino,
    semielaborado_tipo_id: d.semielaboradoTipoId ?? null, numero_paradas: d.numeroParadas,
    tamano_parada: d.tamanoParada, unidades: d.unidades, fecha_produccion: d.fechaProduccion,
    lote: d.lote ?? null, fecha_vencimiento: d.fechaVencimiento ?? null, orden: d.orden }))
}

export function crearControlRegistroProduccion(op: {
  almacen: Almacen; proyecto: string; usuarioId: string
  registrar: (s: SolicitudProduccionPendiente) => Promise<unknown>
  resolver: (solicitudId: string) => Promise<unknown>
}) {
  const prefijo = `cibuspan:produccion:v1:${encodeURIComponent(op.proyecto)}:${op.usuarioId}:`
  const clave = (id: string) => prefijo + id
  const listar = (): SolicitudProduccionPendiente[] => {
    const pendientes: SolicitudProduccionPendiente[] = []
    try {
      for (let i = 0; i < op.almacen.length; i++) {
        const k = op.almacen.key(i)
        if (!k?.startsWith(prefijo)) continue
        const s = JSON.parse(op.almacen.getItem(k) || "null") as SolicitudProduccionPendiente
        if (!s || s.version !== 1 || !esUuid(s.solicitudId) || s.usuarioId !== op.usuarioId || k !== clave(s.solicitudId)) throw new Error()
        pendientes.push({ ...s, ...copiaDatos(s) })
      }
    } catch { throw new Error("No se pudo leer un intento guardado en este navegador. No registres nuevamente esa producción hasta comprobar su resultado.") }
    return pendientes.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
  }
  const retirar = (id: string) => {
    // Una limpieza local fallida no convierte una confirmación del servidor en
    // un fallo del registro. El mismo intento podrá comprobarse otra vez.
    try { op.almacen.removeItem(clave(id)) } catch { /* mantiene el intento para recuperación */ }
  }
  const resolver = async (id: string): Promise<Resolucion> => {
    if (!esUuid(id)) throw new Error("Solicitud pendiente inválida.")
    const r = await op.resolver(id) as { estado?: unknown; solicitud_id?: unknown; produccion_id?: unknown } | null
    if (r?.solicitud_id !== id || !["CONFIRMADA", "ANULADA"].includes(String(r.estado)) ||
      (r.estado === "CONFIRMADA" && !esUuid(r.produccion_id)) || (r.estado === "ANULADA" && r.produccion_id !== null)) {
      throw new RegistroProduccionPendienteError()
    }
    retirar(id)
    return { estado: r.estado as Resolucion["estado"], produccionId: r.produccion_id as string | null }
  }
  const registrar = async (id: string, datos: DatosRegistroProduccion): Promise<ProduccionRegistrada> => {
    if (!esUuid(id)) throw new Error("Falta la clave de confirmación de esta producción.")
    const copia = copiaDatos(datos), contenido = JSON.stringify(copia), k = clave(id)
    const pendientes = listar(), anterior = pendientes.find(s => s.solicitudId === id)
    if ((!anterior && pendientes.some(s => s.solicitudId !== id)) || (anterior && JSON.stringify(copiaDatos(anterior)) !== contenido)) {
      throw new RegistroProduccionPendienteError()
    }
    const ejecutando = enCurso.get(k)
    if (ejecutando) {
      if (ejecutando.datos !== contenido) throw new RegistroProduccionPendienteError()
      return ejecutando.promesa
    }
    const solicitud: SolicitudProduccionPendiente = anterior ?? {
      version: 1, solicitudId: id, usuarioId: op.usuarioId, creadoEn: new Date().toISOString(), ...copia,
    }
    if (!anterior) {
      const guardado = JSON.stringify(solicitud)
      try {
        op.almacen.setItem(k, guardado)
        if (op.almacen.getItem(k) !== guardado) throw new Error()
      } catch { throw new Error("Este navegador no pudo conservar el intento. No se envió la producción; habilita el almacenamiento y vuelve a intentar.") }
    }
    const ejecutar = async (): Promise<ProduccionRegistrada> => {
      try {
        const r = await op.registrar(solicitud) as { produccion_id?: unknown; solicitud_id?: unknown; repetida?: unknown } | null
        if (!r || r.solicitud_id !== id || !esUuid(r.produccion_id) || typeof r.repetida !== "boolean") throw new Error("El servidor no confirmó el registro.")
        retirar(id)
        return { produccionId: r.produccion_id, repetida: r.repetida }
      } catch (error) {
        let resultado: Resolucion
        try { resultado = await resolver(id) }
        catch { throw new RegistroProduccionPendienteError() }
        if (resultado.estado === "CONFIRMADA" && resultado.produccionId) return { produccionId: resultado.produccionId, repetida: true }
        throw new Error(error instanceof Error ? error.message : "La producción no se registró. Revisa los datos y confirma nuevamente.")
      }
    }
    const promesa = ejecutar()
    enCurso.set(k, { datos: contenido, promesa })
    try { return await promesa }
    finally { if (enCurso.get(k)?.promesa === promesa) enCurso.delete(k) }
  }
  return { listar, registrar, resolver }
}
