import type { FacturaCobro } from "../repositories/cobrosRepository"

// Referencias informadas por el usuario para conciliar cobros; no son reglas
// fiscales del SRI. La base solicitada es el total confirmado, incluido IVA.
export type PorcentajeRetencionCobro = 1.75 | 2
export const vigenciaRetencionCobro = "2026-03-01"
// Referencia operativa, no determinación tributaria: la emisión es una pista;
// la retención real depende del pago o acreditación y del documento del cliente.
export function porcentajeHistoricoCobro(fecha?: string): PorcentajeRetencionCobro {
  const valida = !!fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && Number.isFinite(Date.parse(fecha)) && new Date(fecha).toISOString().slice(0,10) === fecha
  return valida && fecha < vigenciaRetencionCobro ? 1.75 : 2
}
// Solo propone el total para facturas nuevas y fuentes coherentes. Una edición
// previa o un cambio en Ventas siempre requiere revisión expresa.
export function facturaSinIvaCobro(f: FacturaCobro): FacturaCobro {
  const total = Number(f.subtotal_importado)
  if (f.total !== null || f.revision !== 0 || !f.fuente_valida || !Number.isFinite(total) || total <= 0 || total >= 1000000000 || Number(f.cobrado) !== 0 || Number(f.retenido) !== 0 || Number(f.ajustado ?? 0) !== 0) return f
  return { ...f, total, saldo: total, verificada: true }
}

type BaseFactura = Pick<FacturaCobro, "cliente" | "total" | "retenido" | "saldo" | "verificada" | "fuente_valida"> & Partial<Pick<FacturaCobro,"fecha_emision">>
export function sugerirRetencionCobro(factura: BaseFactura, porcentajeElegido?: PorcentajeRetencionCobro) {
  if (!factura.fuente_valida || !factura.verificada || factura.total === null || factura.saldo === null) return null
  const total = Number(factura.total), retenido = Number(factura.retenido), saldo = Number(factura.saldo)
  if (![total, retenido, saldo].every(Number.isFinite) || total <= 0 || retenido < 0 || saldo < 0) return null
  const totalCentavos = Math.round(total * 100), retenidoCentavos = Math.round(retenido * 100)
  const registradas = ([1.75,2] as const).filter(p => retenidoCentavos > 0 && Math.round(totalCentavos * p / 100) === retenidoCentavos)
  const porcentaje = porcentajeElegido ?? (registradas.length === 1 ? registradas[0] : porcentajeHistoricoCobro(factura.fecha_emision))
  const esperado = Math.round((totalCentavos * porcentaje) / 100)
  const pendiente = Math.max(0, esperado - Math.round(retenido * 100))
  return { cliente: factura.cliente, porcentaje, origen: porcentajeElegido !== undefined ? "ELEGIDA" : registradas.length === 1 ? "REGISTRADA" : "FECHA_EMISION", totalEsperado: (esperado / 100).toFixed(2),
    importe: pendiente <= Math.round(saldo * 100) ? (pendiente / 100).toFixed(2) : null }
}

// Saldo contable ya descuenta retenciones registradas; resta solo la pendiente.
export function netoPendienteCobro(factura: FacturaCobro, retencionPendiente: string): number | null {
  const f = facturaSinIvaCobro(factura), retencion = Number(retencionPendiente || 0), saldo = Number(f.saldo)
  if (!f.verificada || f.saldo === null || !Number.isFinite(saldo) || !Number.isFinite(retencion) || retencion < 0 || !/^\d*(\.\d{1,2})?$/.test(retencionPendiente) || Math.round(retencion * 100) > Math.round(saldo * 100)) return null
  return (Math.round(saldo * 100) - Math.round(retencion * 100)) / 100
}
