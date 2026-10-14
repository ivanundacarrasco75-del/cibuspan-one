import { valorIndicadorValidadoCampo, type RegistroDashboardCampo } from "./dashboardVisitasRotacion"
import { camposPendientesDatosCampo } from "./estadoDatosCampo"

export type VisitaDiariaCampo = {
  clave: string; fecha: string; cliente_id: string; local_id: string; local_nombre: string
  responsables: Array<{ id: string; nombre: string; rol: string | null }>
  primero: string; ultimo: string; skus: number; capturas: number; rotaciones: number; pendientes: number
}
export function agruparVisitasDiariasCampo(registros: RegistroDashboardCampo[], responsableId = "", localId = "") {
  const grupos = new Map<string, RegistroDashboardCampo[]>()
  const unicos = new Map(registros.map((r) => [r.id, r]))
  for (const r of unicos.values()) {
    if (responsableId && r.registrado_por !== responsableId || localId && r.local_id !== localId) continue
    const clave = JSON.stringify([r.fecha, r.cliente_id, r.local_id])
    const grupo = grupos.get(clave) ?? []; grupo.push(r); grupos.set(clave, grupo)
  }
  return [...grupos].map(([clave, grupo]): VisitaDiariaCampo => {
    const skus = new Map<string, RegistroDashboardCampo>()
    for (const r of grupo) {
      const anterior = skus.get(r.producto_id)
      const orden = (v: RegistroDashboardCampo) => `${v.visitado_en}|${v.actualizado_en}|${v.id}`
      if (!anterior || orden(r) > orden(anterior)) skus.set(r.producto_id, r)
    }
    const tiempos = grupo.map((r) => r.visitado_en).filter(Boolean).sort()
    return { clave, fecha: grupo[0].fecha, cliente_id: grupo[0].cliente_id, local_id: grupo[0].local_id, local_nombre: grupo[0].local_nombre,
      responsables: [...new Map(grupo.map((r) => [r.registrado_por ?? "", { id: r.registrado_por ?? "", nombre: r.responsable_nombre ?? "Sin nombre registrado", rol: r.responsable_rol }])).values()],
      primero: tiempos[0] ?? "", ultimo: tiempos.at(-1) ?? "", skus: skus.size,
      capturas: new Set(grupo.flatMap((r) => r.capturas_app ?? [])).size,
      rotaciones: [...skus.values()].filter((r) => valorIndicadorValidadoCampo(r, "rotacion") !== null).length,
      pendientes: [...skus.values()].filter((r) => camposPendientesDatosCampo(r).length > 0).length }
  }).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.local_nombre.localeCompare(b.local_nombre, "es") || a.clave.localeCompare(b.clave))
}
