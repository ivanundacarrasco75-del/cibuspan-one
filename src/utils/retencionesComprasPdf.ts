import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"
export type TextoRetencionPdf = { texto: string; x: number; y: number }
export type FilaRetencionReporte = { renglon: number; comprobante: string; fecha: string; ruc: string; proveedor: string; factura: string; fecha_factura: string; codigo_renta: string; base_renta: number; renta: number; codigo_segunda: string; base_segunda: number; segunda: number }
export type ReporteRetenciones = { desde: string; hasta: string; base: number; renta: number; segunda: number; filas: FilaRetencionReporte[] }
const centavos = (n: number) => Math.round(n * 100)
function fecha(texto: string) {
  const t = texto.replace(/\s/g, ""), partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  const iso = partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : t
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) throw new Error("Fecha ilegible en el reporte.")
  return iso
}
function numero(t: string, vacio = false) {
  const s = t.replace(/\s/g, "")
  if (vacio && !s) return 0
  if (!/^\d+\.\d{2}$/.test(s)) throw new Error(`Importe ilegible en el reporte: ${s || "vacío"}.`)
  return Number(s)
}
function serie(t: string) {
  const n = t.replace(/\s/g, "")
  if (!/^\d{3}-\d{3}-\d{9}$/.test(n)) throw new Error(`Número incompleto en el reporte: ${n}.`)
  return n
}
// Formato CUADRE REPORTE RESUMEN DE RETENCIONES. Se leen celdas por posición,
// no líneas planas: el número y la fecha están repartidos en dos renglones.
export function interpretarRetencionesPdf(paginas: TextoRetencionPdf[][]): ReporteRetenciones {
  const filas: FilaRetencionReporte[] = [], totales: { base: number; renta: number; segunda: number }[] = []
  let desde = "", hasta = ""
  for (const items of paginas) {
    const texto = items.map(i => i.texto).join(" ")
    if (!/CUADRE REPORTE RESUMEN DE RETENCIONES/.test(texto) || !/CIBUSPAN/.test(texto) || !/No\. Factura/.test(texto)) throw new Error("Usa el reporte Cuadre resumen de retenciones de CIBUSPAN, exportado a PDF con texto.")
    const filtro = /Fecha desde:\s*(\d{2}\/\d{2}\/\d{4})\s*hasta:\s*(\d{2}\/\d{2}\/\d{4})/.exec(texto)
    if (!filtro) throw new Error("No se pudo leer el período del reporte.")
    const d = fecha(filtro[1]), h = fecha(filtro[2])
    if (desde && (desde !== d || hasta !== h)) throw new Error("El PDF mezcla períodos distintos.")
    desde = d; hasta = h
    const anclas = items.filter(i => i.x >= 27 && i.x < 36.4 && /^\d+$/.test(i.texto.trim()) && i.y > 130).sort((a,b) => a.y-b.y)
    const celda = (x1: number, x2: number, y1: number, y2: number) => items.filter(i => i.x >= x1 && i.x < x2 && i.y >= y1 && i.y < y2).sort((a,b) => Math.abs(a.y-b.y)<1 ? a.x-b.x : a.y-b.y).map(i => i.texto).join(" ").trim()
    for (let n=0;n<anclas.length;n++) {
      const a = anclas[n], y1=a.y-4, y2=n+1<anclas.length ? anclas[n+1].y-4 : a.y+8
      const bloque = celda(83.7,380.2,y1,y2), fechaRet = /\d{2}\/\d{2}\/\d{4}/.exec(bloque)?.[0] ?? ""
      const proveedor = bloque.replace(fechaRet, "").trim(), ident = /^(\d{13})\s*(.+)$/.exec(proveedor)
      const factura = celda(380.2,450,y1,y2).replace(/\s/g, "").split("/")
      if (!ident || factura.length !== 2) throw new Error(`Revisa el proveedor o la factura del renglón ${a.texto}.`)
      if (celda(577.2,612,y1,y2)) throw new Error("El reporte contiene una tercera retención fuera del área legible. Exporta el reporte completo antes de importar.")
      filas.push({ renglon:Number(a.texto), comprobante:serie(celda(36.4,83.7,y1,y2)), fecha:fecha(fechaRet), ruc:ident[1], proveedor:ident[2], factura:serie(factura[0]), fecha_factura:fecha(factura[1]), codigo_renta:celda(450,473.85,y1,y2).replace(/\s/g,""), base_renta:numero(celda(473.85,495.45,y1,y2)), renta:numero(celda(495.45,517.8,y1,y2),true), codigo_segunda:celda(517.8,542,y1,y2).replace(/\s/g,""), base_segunda:numero(celda(542,555.3,y1,y2)), segunda:numero(celda(555.3,577.2,y1,y2)) })
    }
    const total = items.find(i => /TOTALES:/.test(i.texto))
    if (total) {
      // El título de totales termina en la celda anterior; los importes se leen aparte.
      totales.push({base:numero(total.texto.split(":")[1]?.trim() || celda(473.85,495.45,total.y-1,total.y+2)),renta:numero(celda(495.45,517.8,total.y-1,total.y+2)),segunda:numero(celda(555.3,577.2,total.y-1,total.y+2))})
    }
  }
  if (!filas.length || filas.length>2000 || totales.length!==1 || filas.some((f,n)=>f.renglon!==n+1)) throw new Error("El reporte está incompleto: revisa páginas, numeración y totales.")
  const suma = (campo: "base_renta"|"renta"|"segunda") => filas.reduce((s,f)=>s+centavos(f[campo]),0)
  if (suma("base_renta")!==centavos(totales[0].base) || suma("renta")!==centavos(totales[0].renta) || suma("segunda")!==centavos(totales[0].segunda)) throw new Error("Los importes leídos no cuadran con los totales del reporte. No se importó ningún registro.")
  if (new Set(filas.map(f=>`${f.ruc}:${f.comprobante}:${f.factura}`)).size!==filas.length) throw new Error("Hay comprobantes repetidos dentro del reporte; revisa el detalle.")
  return {desde,hasta,...totales[0],filas}
}
export async function leerReporteRetenciones(archivo: File) {
  if (!/\.pdf$/i.test(archivo.name) || archivo.size>10*1024*1024) throw new Error("Selecciona un PDF de hasta 10 MB.")
  const buffer=await archivo.arrayBuffer(), hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer)),b=>b.toString(16).padStart(2,"0")).join("")
  const {getDocument,GlobalWorkerOptions}=await import("pdfjs-dist")
  GlobalWorkerOptions.workerSrc=pdfWorker
  const tarea=getDocument({data:new Uint8Array(buffer)}), pdf=await tarea.promise
  try {
    if (pdf.numPages>60) throw new Error("El reporte supera 60 páginas.")
    const paginas:TextoRetencionPdf[][]=[]
    for(let n=1;n<=pdf.numPages;n++) {const p=await pdf.getPage(n), contenido=await p.getTextContent(), escala=612/p.view[2];paginas.push(contenido.items.flatMap(i=>"str" in i?[{texto:i.str,x:i.transform[4]*escala,y:(p.view[3]-i.transform[5])*escala}]:[]))}
    return {hash,archivo:archivo.name,reporte:interpretarRetencionesPdf(paginas)}
  } finally { await tarea.destroy() }
}
