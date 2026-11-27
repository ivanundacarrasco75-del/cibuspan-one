import { supabase } from "../lib/supabase"
import type { DocumentoPagoCliente, LineaPagoCliente } from "../utils/documentosPagoClientes"
import type { FacturaCobro } from "./cobrosRepository"

export type CabeceraPagoCliente = { id:string; cliente:DocumentoPagoCliente["cliente"]; referencia:string; fecha:string; neto:number; version:string; operacion:string|null; archivo:string; facturas:number }
export type PreviaPagoCliente = { documento:CabeceraPagoCliente & { datos:DocumentoPagoCliente }; descuentos:number; facturas:{ indice:number; linea:LineaPagoCliente; cuenta:FacturaCobro|null; firma:string; confirmar_total:boolean; error:string|null; aviso:string|null }[] }
export type CrucePagoCliente = { id:string; operacion:string; version:string; deposito:string|null; repartos:{indice:number; firma:string; descuento:number}[]; motivo:string }
async function rpc<T>(nombre:string,parametros:Record<string,unknown>):Promise<T> {
 const {data,error,status}=await supabase.rpc(nombre,parametros)
 if(error)throw Object.assign(error,{rechazado:status>=400&&status<500})
 return data as T
}
export const importarPagosClientes=(d:{hash:string;archivo:string;documentos:DocumentoPagoCliente[]})=>rpc<{creados:number;duplicados:number}>("fin_cxc_importar_comprobantes",{p_hash:d.hash,p_archivo:d.archivo,p_documentos:d.documentos})
export const consultarPagosClientes=(desde:string,hasta:string,cliente:string)=>rpc<{total:number;filas:CabeceraPagoCliente[]}>("fin_cxc_comprobantes_consultar",{p_desde:desde,p_hasta:hasta,p_cliente:cliente})
export const previaPagoCliente=(id:string)=>rpc<PreviaPagoCliente>("fin_cxc_comprobante_previa",{p_id:id})
export const conciliarPagoCliente=(d:CrucePagoCliente)=>rpc<void>("fin_cxc_conciliar_comprobante",{p_id:d.id,p_operacion:d.operacion,p_version:d.version,p_deposito:d.deposito,p_repartos:d.repartos,p_motivo:d.motivo})
export const anularPagoCliente=(d:CabeceraPagoCliente,motivo:string)=>rpc<void>("fin_cxc_anular_comprobante",{p_id:d.id,p_operacion:d.operacion,p_version:d.version,p_motivo:motivo})
