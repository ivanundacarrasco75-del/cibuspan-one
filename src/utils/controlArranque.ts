import { uuidArranque, fechaArranque, sumarDiaArranque, type ConteosArranque, type ResultadoArranque } from "./arranqueOperativo"
export type IntentoArranque = { version: 1; id: string; usuarioId: string; inicio: string; conteos: ConteosArranque; token: string; creadoEn: string }
type Almacen = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">
export class ArranquePendienteError extends Error { constructor() { super("El resultado no está confirmado. Conservamos el intento: usa Reintentar o Comprobar antes de preparar otra aplicación."); this.name = "ArranquePendienteError" } }
export class ArranqueNoAplicadoError extends Error { constructor(m: string) { super(m); this.name = "ArranqueNoAplicadoError" } }
const enCurso = new Map<string, { datos: string; resultado: Promise<ResultadoArranque> }>()
export function crearControlArranque(op: { almacen: Almacen; proyecto: string; usuarioId: string; aplicar: (s: IntentoArranque) => Promise<unknown>; resolver: (id: string) => Promise<unknown> }) {
  const prefijo = `cibuspan:arranque:intento:v1:${encodeURIComponent(op.proyecto)}:${op.usuarioId}:`
  const clave = (id: string) => prefijo + id
  function validar(s: IntentoArranque) {
    if (s.version !== 1 || !uuidArranque(s.id) || s.usuarioId !== op.usuarioId || !fechaArranque(s.inicio) || !s.conteos || s.conteos.version !== 1 ||
      ![s.conteos.mp, s.conteos.pt, s.conteos.semi].every(Array.isArray) || !/^[a-f0-9]{32}$/.test(s.token) || typeof s.creadoEn !== "string") throw new Error("Intento de arranque guardado inválido; no lo descartes sin comprobar el resultado.")
  }
  const listar = (): IntentoArranque[] => {
    const datos: IntentoArranque[] = []
    try {
      for (let i = 0; i < op.almacen.length; i++) {
        const k = op.almacen.key(i); if (!k?.startsWith(prefijo)) continue
        const s = JSON.parse(op.almacen.getItem(k) || "null") as IntentoArranque
        validar(s); if (k !== clave(s.id)) throw new Error(); datos.push(s)
      }
    } catch { throw new Error("No se pudo leer un intento pendiente. No apliques el corte otra vez hasta comprobarlo.") }
    return datos.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
  }
  const retirar = (id: string) => { try { op.almacen.removeItem(clave(id)) } catch { /* una limpieza fallida no revierte la confirmación */ } }
  const comprobar = (r: unknown, id: string, inicio?: string) => {
    const dato = r as ResultadoArranque | { estado: "ANULADO"; solicitud_id: string } | null
    if (!dato || dato.solicitud_id !== id) throw new ArranquePendienteError()
    if (dato.estado === "ANULADO") return dato
    if (dato.estado !== "APLICADO" || typeof dato.repetido !== "boolean" || !fechaArranque(dato.fecha_inicio) || !fechaArranque(dato.fecha_cierre) ||
      (inicio && dato.fecha_inicio !== inicio) || dato.fecha_cierre !== sumarDiaArranque(dato.fecha_inicio, -1) || !Array.isArray(dato.resumen?.lineas)) throw new ArranquePendienteError()
    return dato
  }
  const resolver = async (id: string) => {
    if (!uuidArranque(id)) throw new Error("Solicitud inválida.")
    const inicio = listar().find(s => s.id === id)?.inicio
    const r = comprobar(await op.resolver(id), id, inicio); retirar(id); return r
  }
  const aplicar = async (solicitud: IntentoArranque): Promise<ResultadoArranque> => {
    const s = JSON.parse(JSON.stringify(solicitud)) as IntentoArranque
    validar(s)
    const pendientes = listar(), previo = pendientes.find(p => p.id === s.id)
    const datos = JSON.stringify({ inicio: s.inicio, conteos: s.conteos, token: s.token })
    if ((!previo && pendientes.length) || (previo && JSON.stringify({ inicio: previo.inicio, conteos: previo.conteos, token: previo.token }) !== datos)) throw new ArranquePendienteError()
    const k = clave(s.id), actual = enCurso.get(k)
    if (actual) { if (actual.datos !== datos) throw new ArranquePendienteError(); return actual.resultado }
    if (!previo) {
      const contenido = JSON.stringify(s)
      try { op.almacen.setItem(k, contenido); if (op.almacen.getItem(k) !== contenido) throw new Error() }
      catch { throw new Error("No se pudo conservar el intento en este navegador. El corte no se envió.") }
    }
    const ejecutar = async (): Promise<ResultadoArranque> => {
      try {
        const r = comprobar(await op.aplicar(s), s.id, s.inicio)
        if (r.estado !== "APLICADO") throw new Error("El servidor no confirmó la aplicación.")
        retirar(s.id); return r
      } catch (error) {
        let r: Awaited<ReturnType<typeof resolver>>
        try { r = await resolver(s.id) } catch { throw new ArranquePendienteError() }
        if (r.estado === "APLICADO") return { ...r, repetido: true }
        throw new ArranqueNoAplicadoError(error instanceof Error ? error.message : "El corte no se aplicó; actualiza la vista previa.")
      }
    }
    const resultado = ejecutar(); enCurso.set(k, { datos, resultado })
    try { return await resultado } finally { if (enCurso.get(k)?.resultado === resultado) enCurso.delete(k) }
  }
  return { listar, aplicar, resolver }
}
