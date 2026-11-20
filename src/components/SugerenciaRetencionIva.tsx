import { sugerirRetencionIva, type PerfilRetencionIva } from "../utils/sugerenciasRetencionIva"

export default function SugerenciaRetencionIva({ perfil, ruc, fecha, iva, notaVenta, descuentoIncluido = false }: {
  perfil?: PerfilRetencionIva; ruc?: string | null; fecha?: string | null; iva: number | null; notaVenta?: boolean; descuentoIncluido?: boolean
}) {
  const sugerencia = sugerirRetencionIva(perfil, ruc, fecha, iva, notaVenta)
  return <span className="sugerencia-retencion-iva" title={sugerencia.texto}>
    <span>{sugerencia.monto !== null ? `IVA sugerido: USD ${sugerencia.monto.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sugerencia.porcentaje}%)` : sugerencia.texto}</span>
    {sugerencia.monto !== null && <small>{perfil?.con_iva} facturas de respaldo · Por confirmar</small>}
    {sugerencia.monto !== null && descuentoIncluido && <small>Hay descuento en el neto: conciliar antes de descontar.</small>}
  </span>
}
