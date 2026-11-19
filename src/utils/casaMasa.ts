export const CODIGOS_CM = ["CM-001", "CM-002", "CM-003", "CM-004"] as const
export const ESTADOS_EMPAQUE_CM = ["PENDIENTE", "EN PREPARACION", "EMPACADO Y ETIQUETADO", "LISTO"] as const
export type EstadoEmpaqueCM = typeof ESTADOS_EMPAQUE_CM[number]
export const esCodigoCM = (codigo: string) => CODIGOS_CM.some(c => c === codigo.trim().toUpperCase())

export function validarPedidoCM(productos: { codigo: string; cantidad: number; manejo: number }[]) {
  if (!productos.length || productos.some(p => !esCodigoCM(p.codigo) || !Number.isSafeInteger(p.cantidad) || p.cantidad <= 0 ||
    !Number.isSafeInteger(p.manejo) || p.manejo <= 0 || p.cantidad % p.manejo !== 0) ||
    new Set(productos.map(p => p.codigo.trim().toUpperCase())).size !== productos.length) {
    throw new Error("Selecciona SKU de Casa Masa con cantidades enteras y múltiplos de su unidad de manejo.")
  }
}

export function fechaLocalCM() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}
