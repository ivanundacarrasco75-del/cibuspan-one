import { procesarFilasOrdenesProduccion } from "./ordenesProduccionExcel.ts"

export type TextoOpPdf = { texto: string; x: number; y: number }

function columna(items: TextoOpPdf[], desde: number, hasta: number) {
  return items.filter((item) => item.x >= desde && item.x < hasta)
    .sort((a, b) => b.y - a.y || a.x - b.x).map((item) => item.texto).join(" ").replace(/\s+/g, " ").trim()
}

export function interpretarOrdenesConfirmadasPdf(paginas: TextoOpPdf[][]) {
  const texto = paginas.flat().map((item) => item.texto).join(" ")
  const corte = texto.match(/Fecha de corte del:\s*(\d{2}\/\d{2}\/20\d{2})\s+al:\s*(\d{2}\/\d{2}\/20\d{2})/i)
  if (!corte) throw new Error("No se reconoce el corte del reporte de egresos de materia prima.")
  const filas: (string | number)[][] = [["Cod Suc", "Sucursal", "Fecha Reg", "Fecha Fin", "Descripción", "Cód Prod Term", "Nombre Prod Terminado", "No Orden", "Cant", "Cod MP", "Nombre de la MP", "Costo Unit", "Costo Total"]]
  const numeros = new Set<number>()
  for (const items of paginas) {
    const anclas = items.filter((item) => item.x >= 355 && item.x < 400 && /^\d{8}$/.test(item.texto))
      .sort((a, b) => b.y - a.y)
    for (const [i, ancla] of anclas.entries()) {
      const linea = items.filter((item) => Math.abs(item.y - ancla.y) <= 1.5)
      const numeroSucursal = columna(linea, 25, 59).split(/\s+/)
      const numero = Number(numeroSucursal[0])
      if (!Number.isInteger(numero) || numero <= 0 || numeros.has(numero)) throw new Error(`Fila repetida o ilegible junto a la OP ${ancla.texto}.`)
      numeros.add(numero)
      const anterior = anclas[i - 1], siguiente = anclas[i + 1]
      const alto = Math.min(anterior ? (anterior.y - ancla.y) / 2 : 25, 25)
      const bajo = Math.min(siguiente ? (ancla.y - siguiente.y) / 2 : 25, 25)
      const celda = items.filter((item) => item.y < ancla.y + alto && item.y > ancla.y - bajo)
      const cantidadCodigo = columna(linea, 395, 461).split(/\s+/)
      if (cantidadCodigo.length !== 2) throw new Error(`Cantidad o código de materia prima ilegible en la fila ${numero}.`)
      const fila = [
        numeroSucursal[1] ?? "", columna(linea, 59, 88), columna(linea, 88, 124), columna(linea, 124, 160),
        columna(celda, 160, 210), columna(linea, 210, 267), columna(celda, 267, 334), ancla.texto,
        cantidadCodigo[0], cantidadCodigo[1], columna(celda, 461, 511),
        columna(linea, 511, 546), columna(linea, 546, 591),
      ]
      if ([2, 3, 5, 8, 9, 11, 12].some((indice) => !fila[indice])) throw new Error(`Dato vacío en la fila ${numero} de la OP ${ancla.texto}.`)
      filas.push(fila)
    }
  }
  if (!numeros.size || numeros.size !== Math.max(...numeros)) throw new Error("La lectura tiene filas faltantes; revisa el PDF antes de importar.")
  // Una celda que cruza página puede perder su primera palabra. Conservamos
  // el texto más completo de la misma OP/artículo y del mismo material.
  const preferido = (textos: string[]) => {
    const cuentas = new Map<string, number>()
    textos.forEach((valor) => cuentas.set(valor, (cuentas.get(valor) ?? 0) + 1))
    return [...cuentas].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0]
  }
  const originales = filas.slice(1).map((fila) => [...fila])
  for (const fila of filas.slice(1)) {
    const iguales = originales.filter((otra) => otra[7] === fila[7] && otra[5] === fila[5])
    for (const indice of [4, 6]) fila[indice] = preferido(iguales.map((otra) => String(otra[indice])))
    const material = originales.filter((otra) => otra[9] === fila[9])
    fila[10] = preferido(material.map((otra) => String(otra[10])))
  }
  const resultado = procesarFilasOrdenesProduccion(filas)
  const totales = texto.match(/Totales del:\s*\d{2}\/\d{2}\/20\d{2}\s+al:\s*\d{2}\/\d{2}\/20\d{2}\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i)
  if (!totales) throw new Error("No se reconocen los totales de control del reporte; revisa si está completo.")
  const cantidadControl = resultado.ordenes.flatMap((orden) => orden.detalles).reduce((suma, detalle) => suma + detalle.cantidad, 0)
  const numeroControl = (valor: string) => Number(valor.replace(/,/g, ""))
  if (Math.abs(cantidadControl - numeroControl(totales[1])) > 0.005 || Math.abs(resultado.costoTotal - numeroControl(totales[3])) > 0.005) {
    throw new Error("Las cantidades o costos leídos no coinciden con los totales del PDF; no se importa una lectura incompleta.")
  }
  const iso = (fecha: string) => fecha.split("/").reverse().join("-")
  if (resultado.ordenes.some((orden) => orden.fecha_produccion < iso(corte[1]) || orden.fecha_produccion > iso(corte[2]))) {
    throw new Error("El reporte contiene OP fuera del corte indicado; revisa las fechas.")
  }
  for (const orden of resultado.ordenes) {
    if (orden.tipo_orden === "SKU") orden.observaciones = `${orden.observaciones} Unidades inferidas del consumo de fundas; verificar producto terminado real.`.trim()
  }
  return { ...resultado, fuente: "CONFIRMADAS" as const, advertencias: [
    `Corte solicitado: ${corte[1]}–${corte[2]}. Registros encontrados: ${resultado.fechaDesde}–${resultado.fechaHasta}.`,
    "Las unidades de PT se infieren de las fundas consumidas; el reporte no declara producción neta ni merma de empaque.",
    "Los micros se registran como producción y consumo de mezcla; sus ingredientes no se deben descontar nuevamente al producir pan.",
  ] }
}
