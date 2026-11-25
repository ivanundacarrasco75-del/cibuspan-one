import type { FacturaCobro } from "../repositories/cobrosRepository"

// Referencias informadas por el usuario para conciliar cobros; no son reglas
// fiscales del SRI. La base solicitada es el total confirmado, incluido IVA.
const referencias = [
  { cliente: "Favorita", porcentaje: 2, aliases: ["FAVORITA", "CORPORACIONFAVORITA", "CORPORACIONFAVORITACA"] },
  { cliente: "Santa María", porcentaje: 2, aliases: ["SANTAMARIA", "MEGASANTAMARIA", "MEGASANTAMARIASA"] },
  { cliente: "Tuti", porcentaje: 1.75, aliases: ["TUTI", "TIENDASTUTI", "TIENDASTUTITTDESA"] },
]
// Solo propone el total para facturas nuevas y fuentes coherentes. Una edición
// previa o un cambio en Ventas siempre requiere revisión expresa.
export function facturaSinIvaCobro(f: FacturaCobro): FacturaCobro {
  const total = Number(f.subtotal_importado)
  if (f.total !== null || f.revision !== 0 || !f.fuente_valida || !Number.isFinite(total) || total <= 0 || total >= 1000000000 || Number(f.cobrado) !== 0 || Number(f.retenido) !== 0) return f
  return { ...f, total, saldo: total, verificada: true }
}

type BaseFactura = Pick<FacturaCobro, "cliente" | "total" | "retenido" | "saldo" | "verificada" | "fuente_valida">
export function sugerirRetencionCobro(factura: BaseFactura) {
  const nombre = factura.cliente.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const referencia = referencias.find(r => r.aliases.includes(nombre))
  if (!referencia || !factura.fuente_valida || !factura.verificada || factura.total === null || factura.saldo === null) return null
  const total = Number(factura.total), retenido = Number(factura.retenido), saldo = Number(factura.saldo)
  if (![total, retenido, saldo].every(Number.isFinite) || total <= 0 || retenido < 0 || saldo < 0) return null
  const esperado = Math.round((Math.round(total * 100) * referencia.porcentaje) / 100)
  const pendiente = Math.max(0, esperado - Math.round(retenido * 100))
  return { cliente: referencia.cliente, porcentaje: referencia.porcentaje, totalEsperado: (esperado / 100).toFixed(2),
    importe: pendiente <= Math.round(saldo * 100) ? (pendiente / 100).toFixed(2) : null }
}

// Saldo contable ya descuenta retenciones registradas; resta solo la pendiente.
export function netoPendienteCobro(factura: FacturaCobro, retencionPendiente: string): number | null {
  const f = facturaSinIvaCobro(factura), retencion = Number(retencionPendiente || 0), saldo = Number(f.saldo)
  if (!f.verificada || f.saldo === null || !Number.isFinite(saldo) || !Number.isFinite(retencion) || retencion < 0 || !/^\d*(\.\d{1,2})?$/.test(retencionPendiente) || Math.round(retencion * 100) > Math.round(saldo * 100)) return null
  return (Math.round(saldo * 100) - Math.round(retencion * 100)) / 100
}
