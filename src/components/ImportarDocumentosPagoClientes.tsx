import { useEffect, useRef, useState } from "react"
import { TablaCobros } from "./TablasCobros"
import { importarPagosClientes } from "../repositories/documentosPagoClientesRepository"
import type { DocumentoPagoCliente } from "../utils/documentosPagoClientes"

type Cliente = DocumentoPagoCliente["cliente"]
type Estado = "PENDIENTE" | "LEYENDO" | "IMPORTANDO" | "IMPORTADO" | "YA_EXISTIA" | "ERROR" | "SIN_CONFIRMAR"
type ArchivoLote = { archivo:File; cliente:Cliente; estado:Estado; creados:number; duplicados:number; error:string; desde?:string; hasta?:string }
export type ResumenLotePagos = { cliente:Cliente; desde?:string; hasta?:string; creados:number; duplicados:number; fallidos:number; pendientes:number }
const etiquetas:Record<Estado,string> = { PENDIENTE:"Pendiente", LEYENDO:"Leyendo…", IMPORTANDO:"Importando…", IMPORTADO:"Importado", YA_EXISTIA:"Ya existía", ERROR:"Revisar archivo", SIN_CONFIRMAR:"Sin confirmar" }
const esFinal = (f:ArchivoLote) => ["IMPORTADO","YA_EXISTIA","ERROR","SIN_CONFIRMAR"].includes(f.estado)
const esFallo = (f:ArchivoLote) => f.estado === "ERROR" || f.estado === "SIN_CONFIRMAR"

export default function ImportarDocumentosPagoClientes({ deshabilitado, alOcupar, alTerminar }:{
 deshabilitado:boolean; alOcupar:(ocupado:boolean)=>void; alTerminar:(r:ResumenLotePagos)=>void
}) {
 const [lote,setLote] = useState<ArchivoLote[]>([]), [procesando,setProcesando] = useState(false), [parando,setParando] = useState(false)
 const bloqueo=useRef(false), detener=useRef(false), montado=useRef(true)
 useEffect(()=>{montado.current=true;return()=>{montado.current=false;detener.current=true}},[])
 async function procesar(base:ArchivoLote[], indices:number[]) {
  if(bloqueo.current || deshabilitado || !indices.length)return
  bloqueo.current=true;detener.current=false;setParando(false);setProcesando(true);alOcupar(true)
  const resultados=base.map(f=>({...f}))
  try {
   for(const indice of indices) {
    if(detener.current || !montado.current)break
    const fila=resultados[indice];fila.estado="LEYENDO";fila.error="";fila.creados=0;fila.duplicados=0;setLote([...resultados])
    try {
     const {leerDocumentosPago}=await import("../utils/documentosPagoClientesPdf")
     const datos=await leerDocumentosPago(fila.archivo,fila.cliente)
     const fechas=datos.documentos.map(d=>d.fecha).sort();fila.desde=fechas[0];fila.hasta=fechas.at(-1)
     fila.estado="IMPORTANDO";if(montado.current)setLote([...resultados])
     const r=await importarPagosClientes(datos)
     fila.creados=r.creados;fila.duplicados=r.duplicados;fila.estado=r.creados>0?"IMPORTADO":"YA_EXISTIA"
    } catch(e) {
     const rechazado=!!(e && typeof e==="object" && "rechazado" in e && e.rechazado)
     fila.estado=fila.estado==="IMPORTANDO"&&!rechazado?"SIN_CONFIRMAR":"ERROR"
     fila.error=e&&typeof e==="object"&&"message" in e?String(e.message):"No se pudo importar este archivo."
    }
    if(montado.current)setLote([...resultados])
   }
  } finally {
   bloqueo.current=false
   if(montado.current) {
    setProcesando(false);setParando(false);alOcupar(false)
    const fechas=resultados.flatMap(f=>f.desde&&f.hasta?[f.desde,f.hasta]:[]).sort()
    alTerminar({cliente:base[0].cliente,desde:fechas[0],hasta:fechas.at(-1),creados:resultados.reduce((s,f)=>s+f.creados,0),duplicados:resultados.reduce((s,f)=>s+f.duplicados,0),fallidos:resultados.filter(esFallo).length,pendientes:resultados.filter(f=>f.estado==="PENDIENTE").length})
   }
  }
 }
 function seleccionar(archivos:File[],cliente:Cliente) {
  if(!archivos.length||bloqueo.current||deshabilitado)return
  const nuevos:ArchivoLote[]=archivos.map(archivo=>({archivo,cliente,estado:"PENDIENTE",creados:0,duplicados:0,error:""}))
  setLote(nuevos);void procesar(nuevos,nuevos.map((_,i)=>i))
 }
 return <>
  <div className="cxc-documentos-tarjetas">{(["FAVORITA","SANTAMARIA"] as const).map(c=><section className="cxc-panel" key={c}>
   <h2>{c==="FAVORITA"?"Favorita":"Santa María"}</h2><p>{c==="FAVORITA"?"Comprobantes de egreso · PDF":"Control de pagos - Detalle · CSV"}</p>
   <label>Subir documentos <input aria-label={`Subir documento de ${c==="FAVORITA"?"Favorita":"Santa María"}`} type="file" multiple accept={c==="FAVORITA"?".pdf":".csv"} disabled={deshabilitado||procesando}
    onChange={e=>{const archivos=Array.from(e.currentTarget.files??[]);e.currentTarget.value="";seleccionar(archivos,c)}} /></label>
   <p>Puedes seleccionar varios archivos a la vez. Se revisan uno por uno y se omiten los comprobantes repetidos.</p>
  </section>)}</div>
  {lote.length>0&&<section className="cxc-panel" aria-label="Carga masiva de documentos de pago">
   <h2>Resultado de la carga</h2><p role="status">{lote.filter(esFinal).length} de {lote.length} archivos revisados{procesando?" · Procesando…":""}</p>
   {procesando&&<button type="button" disabled={parando} onClick={()=>{detener.current=true;setParando(true)}}>{parando?"Terminando el archivo actual…":"Detener después del archivo actual"}</button>}
   {!procesando&&lote.some(esFallo)&&<button type="button" disabled={deshabilitado} onClick={()=>void procesar(lote,lote.flatMap((f,i)=>esFallo(f)?[i]:[]))}>Reintentar archivos con error o sin confirmar</button>}{" "}
   {!procesando&&lote.some(f=>f.estado==="PENDIENTE")&&<button type="button" disabled={deshabilitado} onClick={()=>void procesar(lote,lote.flatMap((f,i)=>f.estado==="PENDIENTE"?[i]:[]))}>Continuar pendientes</button>}
   <div className="compras-sri-contenedor cxc-scroll"><TablaCobros modo="lote-documentos-pago" titulo="Resultado por archivo de pago" columnas={["Archivo","Estado","Importados","Ya existentes","Detalle"]}><tbody>
    {lote.map((f,i)=><tr key={i}><td>{f.archivo.name}</td><td>{etiquetas[f.estado]}</td><td>{f.creados}</td><td>{f.duplicados}</td><td className="cxc-documento-revision">{f.error}{f.estado==="SIN_CONFIRMAR"&&" Reintenta para confirmar el resultado; el archivo repetido no duplica comprobantes."}</td></tr>)}
   </tbody></TablaCobros></div>
   <p>Los documentos importados quedan pendientes de revisar y conciliar. Si algún archivo falla, los demás continúan.</p>
  </section>}
 </>
}
