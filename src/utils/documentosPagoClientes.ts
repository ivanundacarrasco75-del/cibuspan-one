export type LineaPagoCliente = { tipo:"FACTURA"|"DESCUENTO"; clase:string; numero:string; fecha:string; valor:number; retencion:number; aplicado:number; asociado:string; referencia_retencion:string; fuente?:Record<string,string> }
export type DocumentoPagoCliente = { cliente:"FAVORITA"|"SANTAMARIA"; referencia:string; fecha:string; banco:string; neto:number; lineas:LineaPagoCliente[] }
export const centavosDocumento = (n:number) => Math.round(n*100)
export function fechaDocumento(valor:string) {
 const t=valor.trim(), d=/^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(t), iso=d?`${d[3]}-${d[2]}-${d[1]}`:t
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)throw Error(`Fecha inválida: ${valor}`)
 return iso
}
export function facturaDocumento(valor:string) {const s=valor.replace(/\s/g,"");const m=/^(\d{3})-(\d{3})-(\d{1,9})$/.exec(s);if(!m)throw Error(`Número de factura incompleto: ${valor}`);return `${m[1]}-${m[2]}-${m[3].padStart(9,"0")}`}
export function validarDocumentoPago(d:DocumentoPagoCliente) {
 if(!d.referencia.trim()||d.referencia.length>100||!d.lineas.length||d.lineas.length>100)throw Error("Revisa referencia y detalle del comprobante (hasta 100 documentos).")
 fechaDocumento(d.fecha)
 const facturas=d.lineas.filter(l=>l.tipo==="FACTURA")
 if(!facturas.length||new Set(facturas.map(l=>l.numero)).size!==facturas.length)throw Error("El comprobante debe incluir facturas distintas.")
 if(new Set(d.lineas.filter(l=>l.tipo==="DESCUENTO").map(l=>l.clase+":"+l.numero)).size!==d.lineas.filter(l=>l.tipo==="DESCUENTO").length)throw Error("El comprobante repite un descuento.")
 for(const l of d.lineas){fechaDocumento(l.fecha);for(const x of [l.valor,l.retencion,l.aplicado])if(!Number.isFinite(x)||Math.abs(x)>=1e9||Math.abs(x*100-Math.round(x*100))>.0001)throw Error("Revisa los importes del documento.")
  if(l.tipo==="FACTURA"){facturaDocumento(l.numero);if(l.valor<=0||l.retencion<0||l.aplicado<0||centavosDocumento(l.aplicado)+centavosDocumento(l.retencion)>centavosDocumento(l.valor))throw Error(`El pago y retención superan la factura ${l.numero}.`)}
  else if(l.valor>=0||l.aplicado>=0||l.retencion!==0||-centavosDocumento(l.aplicado)>-centavosDocumento(l.valor))throw Error(`Revisa el descuento ${l.numero}.`)
 }
 const neto=d.lineas.reduce((s,l)=>s+centavosDocumento(l.aplicado),0)
 if(neto<0||neto!==centavosDocumento(d.neto))throw Error("El detalle no cuadra con el neto del comprobante.")
 return d
}
// Propuesta editable: distribuye los descuentos globales por el neto de cada factura.
export function distribuirDescuentos(d:DocumentoPagoCliente) {
 const facturas=d.lineas.flatMap((l,i)=>l.tipo==="FACTURA"?[{indice:i,peso:centavosDocumento(l.aplicado)}]:[])
 const descuento=-d.lineas.filter(l=>l.tipo==="DESCUENTO").reduce((s,l)=>s+centavosDocumento(l.aplicado),0), base=facturas.reduce((s,l)=>s+l.peso,0)
 if(descuento>base)throw Error("Los descuentos superan el importe aplicado a facturas.")
 const filas=facturas.map(l=>{const producto=BigInt(descuento)*BigInt(l.peso), divisor=BigInt(base||1);return {...l,descuento:Number(producto/divisor),resto:producto%divisor}})
 let faltante=descuento-filas.reduce((s,l)=>s+l.descuento,0)
 for(const l of [...filas].sort((a,b)=>a.resto===b.resto?a.indice-b.indice:a.resto>b.resto?-1:1)){if(!faltante)break;l.descuento++;faltante--}
 return Object.fromEntries(filas.map(l=>[l.indice,(l.descuento/100).toFixed(2)])) as Record<number,string>
}
function celdasCsv(texto:string) {
 const filas:string[][]=[];let fila:string[]=[],celda="",comillas=false
 for(let i=0;i<texto.length;i++){const c=texto[i];if(c==='"'){if(comillas&&texto[i+1]==='"'){celda+='"';i++}else comillas=!comillas}else if(c===';'&&!comillas){fila.push(celda);celda=""}else if((c==='\n'||c==='\r')&&!comillas){if(c==='\r'&&texto[i+1]==='\n')i++;fila.push(celda);if(fila.some(x=>x.trim()))filas.push(fila);fila=[];celda=""}else celda+=c}
 if(comillas)throw Error("CSV incompleto: comillas sin cerrar.");fila.push(celda);if(fila.some(x=>x.trim()))filas.push(fila);return filas
}
const normalizar=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]/g,"")
function importeCsv(s:string) {const v=s.replace(/[$\s]/g,"");if(!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(v))throw Error(`Importe ilegible en CSV: ${s}`);return Number(v.replace(/\./g,"").replace(",","."))}
export function leerCsvSantaMaria(texto:string):DocumentoPagoCliente[] {
 const tabla=celdasCsv(texto.replace(/^\uFEFF/,"")),cabecera=tabla.shift()?.map(normalizar)??[]
 const esperadas=["LINEA","FECHAPAGO","DOCUMENTOPAGO","FECHADOCUMENTO","DOCUMENTO","COMPROBANTEPROVEEDOR","COMPROBANTEASOCIADO","RETENCION","TARIFA0","TARIFAIVA","IVA","RETENCIONRENTA","RETENCIONIVA","MONTOPAGO"]
 if(cabecera.join()!==esperadas.join())throw Error("El CSV no corresponde a Control de pagos - Detalle de Santa María.")
 const docs=new Map<string,DocumentoPagoCliente>()
 for(const [i,c] of tabla.entries()){
  if(c.length!==14)throw Error(`Renglón ${i+2}: cantidad de columnas incorrecta.`)
  const fecha=fechaDocumento(c[1]),referencia=c[2].trim(),clave=fecha+":"+referencia,clase=c[4].trim(),tipo=normalizar(clase)==="FACTURAPROVEEDOR"?"FACTURA":"DESCUENTO"
  const valor=(centavosDocumento(importeCsv(c[8]))+centavosDocumento(importeCsv(c[9]))+centavosDocumento(importeCsv(c[10])))/100
  const ir=importeCsv(c[11]),iva=importeCsv(c[12]);if(ir>0||iva>0)throw Error("El reporte contiene reversos de retención; requiere revisión antes de importar.")
  const l:LineaPagoCliente={tipo,clase,numero:facturaDocumento(c[5]),fecha:fechaDocumento(c[3]),valor,retencion:-(centavosDocumento(ir)+centavosDocumento(iva))/100,aplicado:importeCsv(c[13]),asociado:c[6].trim()==="--"?"":c[6].trim(),referencia_retencion:c[7].trim(),fuente:Object.fromEntries(cabecera.map((h,n)=>[h,c[n]]))}
  let d=docs.get(clave);if(!d){d={cliente:"SANTAMARIA",referencia,fecha,banco:"",neto:0,lineas:[]};docs.set(clave,d)}d.lineas.push(l)
 }
 if(!docs.size||docs.size>100)throw Error("Selecciona un CSV con entre 1 y 100 pagos completos.")
 return [...docs.values()].map(d=>validarDocumentoPago({...d,neto:d.lineas.reduce((s,l)=>s+centavosDocumento(l.aplicado),0)/100}))
}
