import type { FilaReporteFinanzas, TipoReporteFinanzas } from "../repositories/reportesFinanzasRepository"
export type ColumnaReporte = { campo: string; titulo: string; formato?: "dinero" | "cantidad" }
export const reportesFinanzas: Record<TipoReporteFinanzas, { titulo: string; descripcion: string; columnas: ColumnaReporte[] }> = {
  PAGOS: {
    titulo: "Pagos realizados",
    descripcion: "Filtra por fecha del pago. Incluye los pagos de las cuentas consolidadas y anticipos desembolsados. Los cruces de anticipos, retenciones y pagos solo programados no son salidas nuevas de dinero.",
    columnas: [
      { campo: "fecha_pago", titulo: "Fecha de pago" }, { campo: "proveedor", titulo: "Proveedor / beneficiario" },
      { campo: "numero_documento", titulo: "Documento" }, { campo: "concepto", titulo: "Concepto" },
      { campo: "tipo", titulo: "Tipo" }, { campo: "referencia", titulo: "Referencia del pago" },
      { campo: "valor", titulo: "Pagado USD", formato: "dinero" },
    ],
  },
  MP: {
    titulo: "Compras de MP · Recepciones físicas",
    descripcion: "Filtra por fecha del ingreso físico confirmado. Cantidades en la unidad registrada del material. El subtotal de la línea facturada es informativo: no representa un pago ni una valoración de lo recibido parcialmente.",
    columnas: [
      { campo: "fecha_ingreso", titulo: "Fecha de ingreso" }, { campo: "numero_documento", titulo: "Factura" },
      { campo: "proveedor", titulo: "Proveedor" }, { campo: "codigo_material", titulo: "Código MP" },
      { campo: "material", titulo: "Materia prima" }, { campo: "unidad", titulo: "Unidad" },
      { campo: "cantidad", titulo: "Cantidad recibida", formato: "cantidad" },
      { campo: "subtotal_facturado", titulo: "Subtotal línea facturada USD", formato: "dinero" },
    ],
  },
}
export function rangoMesReporte(mes: string) {
  const [anio, numeroMes] = mes.split("-").map(Number)
  const ultimo = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` }
}
export function valorReporte(fila: FilaReporteFinanzas, columna: ColumnaReporte) {
  const valor = fila[columna.campo]
  if (valor === null || valor === undefined || valor === "") return "—"
  if (!columna.formato) return String(valor)
  return Number(valor).toLocaleString("es-EC", { minimumFractionDigits: columna.formato === "dinero" ? 2 : 0, maximumFractionDigits: columna.formato === "dinero" ? 2 : 6 })
}
export async function descargarReporteExcel(tipo: TipoReporteFinanzas, desde: string, hasta: string, filas: FilaReporteFinanzas[], resumen: string) {
  const { default: ExcelJS } = await import("exceljs")
  const libro = new ExcelJS.Workbook()
  libro.creator = "CIBUSPAN ONE"
  const hoja = libro.addWorksheet("Reporte")
  const reporte = reportesFinanzas[tipo]
  hoja.addRow(["CIBUSPAN ONE · " + reporte.titulo])
  hoja.addRow([`Desde ${desde} hasta ${hasta}`])
  hoja.addRow([resumen]); hoja.addRow([reporte.descripcion]); hoja.addRow(reporte.columnas.map(c => c.titulo))
  for (const fila of filas) hoja.addRow(reporte.columnas.map(col => fila[col.campo] == null ? null : col.formato ? Number(fila[col.campo]) : String(fila[col.campo])))
  hoja.views = [{ state: "frozen", ySplit: 5 }]
  hoja.autoFilter = { from: { row: 5, column: 1 }, to: { row: filas.length + 5, column: reporte.columnas.length } }
  reporte.columnas.forEach((col, indice) => {
    hoja.getColumn(indice + 1).width = col.formato ? 24 : ["concepto", "material", "proveedor", "referencia"].includes(col.campo) ? 38 : 22
    if (col.formato) hoja.getColumn(indice + 1).numFmt = col.formato === "dinero" ? '#,##0.00' : '#,##0.######'
  })
  hoja.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } }
  hoja.getRow(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF051142" } }
  const contenido = await libro.xlsx.writeBuffer()
  const enlace = document.createElement("a")
  const url = URL.createObjectURL(new Blob([contenido as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
  enlace.href = url; enlace.download = `${tipo === "PAGOS" ? "Pagos" : "Recepciones_MP"}_${desde}_${hasta}.xlsx`
  document.body.appendChild(enlace); enlace.click(); enlace.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function imprimirReporteFinanzas(tipo: TipoReporteFinanzas, desde: string, hasta: string, filas: FilaReporteFinanzas[], resumen: string) {
  const ventana = window.open("", "_blank")
  if (!ventana) throw new Error("El navegador bloqueó la ventana de impresión. Permite abrirla y vuelve a intentar.")
  ventana.opener = null
  const reporte = reportesFinanzas[tipo], doc = ventana.document
  doc.title = `${reporte.titulo} · ${desde} a ${hasta}`
  const estilo = doc.createElement("style")
  estilo.textContent = "body{font:11px Arial;color:#152536}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px;text-align:left}th{background:#e9eff4}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}"
  doc.head.append(estilo)
  for (const [tag, texto] of [["h1", "CIBUSPAN ONE · " + reporte.titulo], ["p", `Desde ${desde} hasta ${hasta}`], ["p", resumen], ["p", reporte.descripcion]]) {
    const elemento = doc.createElement(tag); elemento.textContent = texto; doc.body.append(elemento)
  }
  const tabla = doc.createElement("table"), cabecera = tabla.createTHead().insertRow()
  for (const col of reporte.columnas) { const th = doc.createElement("th"); th.textContent = col.titulo; cabecera.append(th) }
  const cuerpo = tabla.createTBody()
  for (const fila of filas) { const tr = cuerpo.insertRow(); for (const col of reporte.columnas) tr.insertCell().textContent = valorReporte(fila, col) }
  doc.body.append(tabla)
  ventana.addEventListener("afterprint", () => ventana.close(), { once: true })
  ventana.requestAnimationFrame(() => { ventana.focus(); ventana.print() })
}
