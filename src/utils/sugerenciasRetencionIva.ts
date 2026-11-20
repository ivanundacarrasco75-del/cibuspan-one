export type PerfilRetencionIva = {
  ruc: string; proveedor: string; fuente: string; archivo: string; hasta: string; facturas: number; con_iva: number
  sin_retencion: number; al_30: number; al_70: number; al_100: number; revisar: number; ultima_factura: string
  estado: "SUGERIDA" | "VARIABLE" | "INSUFICIENTE" | "REVISAR_CERO" | "SIN_IVA"; porcentaje_sugerido: number | null
  ejemplo: { factura: string; fecha: string; pagina: number; porcentaje: number | null }
}
export function sugerirRetencionIva(perfil: PerfilRetencionIva | undefined, ruc: string | null | undefined,
  fecha: string | null | undefined, iva: number | null, notaVenta = false) {
  if (notaVenta) return { texto: "Nota de venta: verificar RIMPE y tratamiento; no se presume retención.", porcentaje: null, monto: null }
  if (iva === null || !Number.isFinite(iva)) return { texto: "Falta el IVA del documento.", porcentaje: null, monto: null }
  if (iva <= 0) return { texto: "Sin IVA en el documento.", porcentaje: null, monto: null }
  if (!ruc || !perfil || perfil.ruc !== ruc) return { texto: "Sin historial para este RUC.", porcentaje: null, monto: null }
  if (!fecha || fecha <= perfil.hasta) return { texto: "Documento del período histórico. Revisar retenciones existentes.", porcentaje: null, monto: null }
  if (perfil.estado !== "SUGERIDA" || ![30,70,100].includes(Number(perfil.porcentaje_sugerido))) {
    const textos = { VARIABLE: "El porcentaje varía según la operación. Revisa el concepto.", INSUFICIENTE: "Historial insuficiente para sugerir una tasa.",
      REVISAR_CERO: "Historial sin retención. Verifica la condición actual del proveedor.", SIN_IVA: "Historial sin IVA. No se presume una tasa.", SUGERIDA: "Revisar porcentaje observado." }
    return { texto: textos[perfil.estado], porcentaje: null, monto: null }
  }
  const porcentaje = Number(perfil.porcentaje_sugerido)
  return { texto: `Historial: ${porcentaje}% del IVA · ${perfil.con_iva} facturas. Confirmar concepto y condición actual.`, porcentaje,
    monto: Math.round(Math.round(iva * 100) * porcentaje / 100) / 100 }
}
