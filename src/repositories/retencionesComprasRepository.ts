import { supabase } from "../lib/supabase"
import type { FilaRetencionReporte, ReporteRetenciones } from "../utils/retencionesComprasPdf"
export type CandidatoRetencion = { id:string; numero:string; proveedor:string; fecha:string|null; total:number|null; pagado:number; saldo:number|null; retencion:number|null; saldo_nuevo:number; segura:boolean; aviso?:string|null; error:string|null; firma:string }
export type RetencionImportada = { id:string; datos:Omit<FilaRetencionReporte,"renglon">; retencion_id:string|null; estado_retencion:"ACTIVA"|"ANULADA"|null; documento_id:string|null; archivo:string; candidatos:CandidatoRetencion[] }
export type CruceRetencion = {fila:string;documento:string;firma:string}
function fallo(error:object,status:number) {return Object.assign(error,{rechazado:status>=400&&status<500})}
export async function importarReporteRetenciones(hash:string,archivo:string,reporte:ReporteRetenciones) {
 const {error,status}=await supabase.rpc("compras_importar_retenciones",{p_hash:hash,p_archivo:archivo,p_reporte:reporte});if(error)throw fallo(error,status)
}
export async function consultarReporteRetenciones(desde:string,hasta:string) {
 const {data,error}=await supabase.rpc("compras_consultar_retenciones",{p_desde:desde,p_hasta:hasta});if(error)throw error;return data as RetencionImportada[]
}
export async function cruzarReporteRetenciones(operacion:string,filas:CruceRetencion[]) {
 const {error,status}=await supabase.rpc("compras_cruzar_retenciones",{p_operacion:operacion,p_filas:filas});if(error)throw fallo(error,status)
}
