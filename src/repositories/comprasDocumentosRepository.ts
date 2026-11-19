import { supabase } from "../lib/supabase"

export type TipoCompraManual = "NOTA_VENTA" | "NO_DEDUCIBLE"

export type DocumentoManual = {
  id: string
  tipo: TipoCompraManual
  fecha_documento: string
  numero_documento: string | null
  proveedor: string
  concepto: string
  subtotal: number
  iva: number | null
  retencion: number | null
  observaciones: string | null
}

export type DocumentoCompra = {
  id: string
  periodo: string
  fecha_documento: string | null
  numero_documento: string | null
  proveedor: string | null
  concepto: string | null
  subtotal: number | null
  iva: number | null
  retencion: number | null
  total: number | null
  observaciones: string | null
  cuenta_codigo: string | null
  origen: "MANUAL_COMPRAS" | "CLASIFICACION_GASTOS" | "EXCEL"
  pagado_excel?: number | null
  saldo_excel?: number | null
}

export async function listarDocumentosCompra(tipo: TipoCompraManual, inicio: number, limite: number) {
  if (tipo === "NO_DEDUCIBLE") {
    const { data, error } = await supabase.from("compras_vw_documentos_tabla")
      .select("*")
      .eq("tipo", tipo)
      .in("origen", ["MANUAL_COMPRAS", "EXCEL"])
      .order("fecha_documento", { ascending: false, nullsFirst: false })
      .order("id")
      .range(inicio, inicio + limite - 1)
    if (error) throw error
    return (data ?? []) as DocumentoCompra[]
  }

  const { data, error } = await supabase.from("compras_vw_documentos_tabla")
    .select("*")
    .eq("tipo", tipo)
    .order("periodo", { ascending: false, nullsFirst: false })
    .order("fecha_documento", { ascending: false, nullsFirst: false })
    .order("id")
    .range(inicio, inicio + limite - 1)
  if (error) throw error
  return (data ?? []) as DocumentoCompra[]
}

export async function guardarDocumentoCompra(documento: DocumentoManual) {
  const { data, error } = await supabase.from("compras_documentos_manuales")
    .upsert(documento, { onConflict: "id", ignoreDuplicates: true }).select("id")
  if (error) throw error
  if (data?.length) return

  // Si se perdió la primera respuesta, un reintento no crea otro documento.
  const { data: guardado, error: errorLectura } = await supabase.from("compras_documentos_manuales")
    .select("id,tipo,fecha_documento,numero_documento,proveedor,concepto,subtotal,iva,retencion,observaciones")
    .eq("id", documento.id).single()
  if (errorLectura) throw errorLectura
  if (!guardado || !Object.entries(documento).every(([campo, valor]) => guardado[campo as keyof DocumentoManual] === valor)) {
    throw new Error("Ya se guardó un documento con otros datos. Revisa la tabla antes de volver a ingresarlo.")
  }
}
