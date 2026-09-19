export type PagoReporteXlsx = {
  fechaPago: string
  proveedor: string
  factura: string
  descripcion: string
  cuenta: string
  afectaA: string
  cliente: string
  referencia: string
  origen: string
  estadoFactura: string
  monto: number
}

type DatosReportePagos = {
  mes: string
  proveedor: string
  generado: string
  pagos: PagoReporteXlsx[]
  total: number
}

const colorVino = "8F1D24"
const colorNaranja = "F7931E"
const colorTexto = "2F2522"
const colorAlterno = "FFF7F0"
const colorBorde = "E1D8D3"

function textoSeguro(valor: unknown) {
  return String(valor ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .slice(0, 32767)
}

function textoCelda(valor: unknown) {
  const limpio = textoSeguro(valor)
  return limpio === "" ? null : limpio
}

function fechaExcel(fechaIso: string) {
  const [anio, mes, dia] = fechaIso.split("-").map(Number)
  if (!anio || !mes || !dia) return textoSeguro(fechaIso)
  return new Date(anio, mes - 1, dia, 12)
}

export async function crearReportePagosXlsx(datos: DatosReportePagos) {
  const moduloExcel = await import("exceljs")
  const ExcelJS = moduloExcel.default ?? moduloExcel
  const libro = new ExcelJS.Workbook()
  libro.creator = "CIBUSPAN ONE"
  libro.lastModifiedBy = "CIBUSPAN ONE"
  libro.created = new Date()
  libro.modified = new Date()
  libro.subject = "Reporte mensual de pagos"
  libro.title = "Reporte mensual de pagos"

  const hoja = libro.addWorksheet("Pagos del mes", {
    views: [{ state: "frozen", ySplit: 7, activeCell: "A8", showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })

  hoja.columns = [
    { key: "fecha", width: 14 },
    { key: "proveedor", width: 31 },
    { key: "factura", width: 20 },
    { key: "descripcion", width: 35 },
    { key: "cuenta", width: 28 },
    { key: "afecta", width: 19 },
    { key: "cliente", width: 27 },
    { key: "referencia", width: 23 },
    { key: "origen", width: 17 },
    { key: "estado", width: 18 },
    { key: "monto", width: 17 },
  ]

  hoja.mergeCells("A1:K1")
  const titulo = hoja.getCell("A1")
  titulo.value = "REPORTE MENSUAL DE PAGOS · CIBUSPAN ONE"
  titulo.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } }
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${colorVino}` } }
  titulo.alignment = { vertical: "middle" }
  hoja.getRow(1).height = 28

  const resumen: Array<[string, string | number]> = [
    ["Mes", textoSeguro(datos.mes)],
    ["Proveedor", textoSeguro(datos.proveedor)],
    ["Generado", textoSeguro(datos.generado)],
    ["Movimientos", datos.pagos.length],
  ]
  resumen.forEach(([etiqueta, valor], indice) => {
    const fila = indice + 2
    hoja.getCell(fila, 1).value = etiqueta
    hoja.getCell(fila, 1).font = { name: "Aptos", size: 11, bold: true, color: { argb: `FF${colorTexto}` } }
    hoja.getCell(fila, 2).value = valor
  })
  hoja.getCell("D5").value = "Total pagado"
  hoja.getCell("D5").font = { name: "Aptos", size: 11, bold: true, color: { argb: `FF${colorTexto}` } }
  hoja.getCell("E5").value = Number(datos.total) || 0
  hoja.getCell("E5").numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)'
  hoja.getCell("E5").font = { name: "Aptos", size: 11, bold: true, color: { argb: `FF${colorTexto}` } }
  hoja.getCell("E5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF3FA" } }
  hoja.getRow(5).height = 23

  const encabezados = [
    "Fecha de pago", "Proveedor", "Factura", "Descripción", "Cuenta contable",
    "Afecta a", "Cliente", "Referencia", "Origen", "Estado de factura", "Monto pagado",
  ]
  const filaEncabezado = hoja.getRow(7)
  filaEncabezado.values = encabezados
  filaEncabezado.height = 30
  filaEncabezado.eachCell((celda) => {
    celda.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } }
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${colorVino}` } }
    celda.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    celda.border = { bottom: { style: "thin", color: { argb: `FF${colorBorde}` } } }
  })

  datos.pagos.forEach((pago, indice) => {
    const fila = hoja.addRow([
      fechaExcel(pago.fechaPago),
      textoCelda(pago.proveedor),
      textoCelda(pago.factura),
      textoCelda(pago.descripcion),
      textoCelda(pago.cuenta),
      textoCelda(pago.afectaA),
      textoCelda(pago.cliente),
      textoCelda(pago.referencia),
      textoCelda(pago.origen),
      textoCelda(pago.estadoFactura),
      Number.isFinite(Number(pago.monto)) ? Number(pago.monto) : 0,
    ])
    fila.eachCell({ includeEmpty: true }, (celda) => {
      celda.font = { name: "Aptos", size: 11, color: { argb: `FF${colorTexto}` } }
      celda.alignment = { vertical: "middle" }
      celda.border = { bottom: { style: "thin", color: { argb: `FF${colorBorde}` } } }
      if (indice % 2 === 1) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${colorAlterno}` } }
      }
    })
    fila.getCell(1).numFmt = "dd/mm/yyyy"
    fila.getCell(1).alignment = { horizontal: "center", vertical: "middle" }
    for (let columna = 2; columna <= 10; columna += 1) fila.getCell(columna).numFmt = "@"
    fila.getCell(11).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)'
    fila.getCell(11).alignment = { horizontal: "right", vertical: "middle" }
  })

  const ultimaFilaDatos = 7 + datos.pagos.length
  hoja.autoFilter = { from: "A7", to: `K${ultimaFilaDatos}` }

  const filaTotalNumero = ultimaFilaDatos + 2
  hoja.mergeCells(`A${filaTotalNumero}:J${filaTotalNumero}`)
  const etiquetaTotal = hoja.getCell(filaTotalNumero, 1)
  etiquetaTotal.value = "TOTAL DEL MES"
  etiquetaTotal.font = { name: "Aptos", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
  etiquetaTotal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${colorVino}` } }
  etiquetaTotal.alignment = { horizontal: "right", vertical: "middle" }
  const total = hoja.getCell(filaTotalNumero, 11)
  total.value = Number(datos.total) || 0
  total.numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)'
  total.font = { name: "Aptos", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
  total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${colorNaranja}` } }
  total.alignment = { horizontal: "right", vertical: "middle" }
  hoja.getRow(filaTotalNumero).height = 24

  const contenido = await libro.xlsx.writeBuffer()
  return new Blob([contenido], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
