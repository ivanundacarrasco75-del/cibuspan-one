import type { LocalCampo, PosicionCampo } from "./georreferenciaCampo"

export type UbicacionCampo = PosicionCampo
export type VisitaActivaCampo = {
  id: string
  iniciadoEn: string
  clienteId: string
  localId: string
  fecha: string
  ubicacion: UbicacionCampo | null
  referenciaLocal?: LocalCampo
  skusGuardados: Array<{ id: string; nombre: string }>
}

export function crearVisitaCampo(
  contexto: Pick<VisitaActivaCampo, "clienteId" | "localId" | "fecha" | "ubicacion" | "referenciaLocal">,
  id: string,
  iniciadoEn: string,
): VisitaActivaCampo {
  if (!contexto.clienteId || !contexto.localId || !contexto.fecha) {
    throw new Error("Selecciona cliente, local y fecha para iniciar la visita.")
  }
  return { ...contexto, referenciaLocal: contexto.referenciaLocal ? { ...contexto.referenciaLocal } : undefined,
    ubicacion: contexto.ubicacion ? { ...contexto.ubicacion } : null,
    id, iniciadoEn, skusGuardados: [] }
}

export function registrarSkuEnVisita(visita: VisitaActivaCampo, sku: { id: string; nombre: string }): VisitaActivaCampo {
  if (visita.skusGuardados.some((item) => item.id === sku.id)) {
    throw new Error("Este SKU ya se guardó en la visita.")
  }
  return { ...visita, skusGuardados: [...visita.skusGuardados, { ...sku }] }
}
