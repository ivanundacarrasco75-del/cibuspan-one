import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { fechaDocumento, facturaDocumento, validarDocumentoPago, type DocumentoPagoCliente, type LineaPagoCliente } from "./documentosPagoClientes"
function moneda(s:string){const negativo=s.includes("(")||s.includes("-");const v=s.replace(/[()$\s-]/g,"");if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(v))throw Error(`Importe ilegible: ${s}`);return Number(v.replace(/,/g,""))*(negativo?-1:1)}
export function interpretarPagoFavorita(paginas:string[][]):DocumentoPagoCliente {
 const texto=paginas.flat().join("\n")
 if(!texto.includes("CORPORACION FAVORITA")||!texto.includes("1790016919001")||!texto.includes("1792759277001"))throw Error("El PDF no es un comprobante de Favorita emitido a CIBUSPAN.")
 const referencia=/documento de pago:\s*(\d+)/i.exec(texto)?.[1],fecha=/Fecha de pago:\s*(\d{4}-\d{2}-\d{2})/i.exec(texto)?.[1],neto=/Total pagado:\s*(\$[\d,.]+)/i.exec(texto)?.[1]
 if(!referencia||!fecha||!neto)throw Error("No se pudo leer referencia, fecha o neto del comprobante.")
 const lineas:LineaPagoCliente[]=[];let numero=0
 for(const pagina of paginas)for(const t of pagina){
  const inicio=/^\s*(\d+)\s+(\d{4}-\d{2}-\d{2})\s+/.exec(t);if(!inicio)continue
  if(Number(inicio[1])!==++numero)throw Error("El detalle del PDF está incompleto o tiene renglones repetidos.")
  const importes=[...t.matchAll(/\(?-?\$\s*[\d,.]+\)?/g)];if(importes.length!==4)throw Error(`No se pudieron leer los cuatro importes del renglón ${numero}.`)
  const cabecera=t.slice(inicio[0].length,importes[0].index).trim(),n=/^(.*?)\s+(\S+)$/.exec(cabecera);if(!n)throw Error("Falta tipo o número de documento.")
  const valores=importes.map(x=>moneda(x[0])),tipo=n[1].trim()==="PV-Factura Proveedor"?"FACTURA":"DESCUENTO"
  lineas.push({tipo,clase:n[1].trim(),numero:tipo==="FACTURA"?facturaDocumento(n[2]):n[2],fecha:fechaDocumento(inicio[2]),valor:valores[0],retencion:-(valores[1]+valores[2]),aplicado:valores[3],asociado:"",referencia_retencion:""})
 }
 return validarDocumentoPago({cliente:"FAVORITA",referencia,fecha:fechaDocumento(fecha),banco:/Banco:\s*(.*?)\s+Cuenta bancaria:/i.exec(texto)?.[1]?.trim()??"",neto:moneda(neto),lineas})
}
export async function leerDocumentosPago(archivo:File,cliente:"FAVORITA"|"SANTAMARIA") {
 if(archivo.size>10*1024*1024)throw Error("Selecciona un archivo de hasta 10 MB.")
 const datos=await archivo.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",datos)),b=>b.toString(16).padStart(2,"0")).join("")
 if(cliente==="SANTAMARIA") {if(!/\.csv$/i.test(archivo.name))throw Error("Santa María: selecciona el CSV Control de pagos - Detalle.");let texto:string;try{texto=new TextDecoder("utf-8",{fatal:true}).decode(datos)}catch{texto=new TextDecoder("windows-1252").decode(datos)}return {hash,archivo:archivo.name,documentos:(await import("./documentosPagoClientes")).leerCsvSantaMaria(texto)}}
 if(!/\.pdf$/i.test(archivo.name))throw Error("Favorita: selecciona el PDF Comprobante de Egreso.")
 const {getDocument,GlobalWorkerOptions}=await import("pdfjs-dist");GlobalWorkerOptions.workerSrc=pdfWorker
 const tarea=getDocument({data:new Uint8Array(datos)}),pdf=await tarea.promise
 try{if(pdf.numPages>50)throw Error("El comprobante supera 50 páginas.");const paginas:string[][]=[]
  for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),c=await p.getTextContent(),vista=p.getViewport({scale:1}),items=c.items.flatMap(i=>{if(!("str" in i)||!i.str.trim())return [];const [x,y]=vista.convertToViewportPoint(i.transform[4],i.transform[5]);return [{str:i.str,x,y}]}).sort((a,b)=>Math.abs(a.y-b.y)<1?a.x-b.x:a.y-b.y);const filas:{y:number;textos:string[]}[]=[];for(const i of items){let f=filas.find(f=>Math.abs(f.y-i.y)<2);if(!f){f={y:i.y,textos:[]};filas.push(f)}f.textos.push(i.str)}paginas.push(filas.map(f=>f.textos.join(" ")))}
  return {hash,archivo:archivo.name,documentos:[interpretarPagoFavorita(paginas)]}
 }finally{await tarea.destroy()}
}
