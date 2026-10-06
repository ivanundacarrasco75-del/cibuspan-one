import type { Row } from "read-excel-file/browser"

export type TipoInventario = "MATERIA_PRIMA" | "PRODUCTO_TERMINADO"
export type ArticuloKardex = {
  tipo: TipoInventario; id: string; codigo: string; codigo_contable: string | null
  nombre: string; unidad: string; saldo: number; iniciado: boolean
}
export type LineaInventarioInicial = {
  fila: number; codigo: string; nombre: string; cantidad: number; costoTotal: number | null
  sucursal: string; articulo: ArticuloKardex | null; problema: string
}
export type LoteInicial = { cantidad: number; lote: string; fechaProduccion: string; fechaVencimiento: string }

const normalizar = (valor: unknown) => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase()
const encabezado = (valor: unknown) => normalizar(valor).replace(/[^A-Z0-9]/g, "")

// Excel entrega números nativos. En textos se aceptan los dos separadores usuales,
// pero una sola separación de tres cifras se exige como número nativo por ambigua.
export function cantidadExcel(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN
  let texto = String(valor ?? "").trim().replace(/\s/g, "")
  if (!texto) return NaN
  if (texto.includes(",") && texto.includes(".")) {
    const decimal = texto.lastIndexOf(",") > texto.lastIndexOf(".") ? "," : "."
    texto = texto.replace(decimal === "," ? /\./g : /,/g, "").replace(",", ".")
  } else if (/^[+-]?\d+[,.]\d{3}$/.test(texto)) return NaN
  else if (texto.includes(",")) texto = texto.replace(",", ".")
  return /^[+-]?\d+(\.\d+)?$/.test(texto) ? Number(texto) : NaN
}

export function vincularArticulo(codigo: string, articulos: ArticuloKardex[]): ArticuloKardex | null {
  const clave = normalizar(codigo)
  const candidatos = articulos.filter((a) => normalizar(a.codigo) === clave || (a.codigo_contable && normalizar(a.codigo_contable) === clave))
  return candidatos.length === 1 ? candidatos[0] : null
}

export function leerFilasInventarioInicial(filas: Row[], articulos: ArticuloKardex[]) {
  const indice = filas.findIndex((fila) => fila.some((c) => ["CODARTICULO", "CODIGOARTICULO", "CODIGO"].includes(encabezado(c))) &&
    fila.some((c) => ["STOCK", "CANTIDAD", "EXISTENCIA"].includes(encabezado(c))))
  if (indice < 0) throw new Error("No se encontraron las columnas código y stock en el Excel.")
  const cabecera = filas[indice].map(encabezado)
  const columna = (...nombres: string[]) => cabecera.findIndex((c) => nombres.includes(c))
  const codigo = columna("CODARTICULO", "CODIGOARTICULO", "CODIGO")
  const nombre = columna("NOMBREDELARTICULO", "NOMBREARTICULO", "NOMBRE", "DESCRIPCION")
  const stock = columna("STOCK", "CANTIDAD", "EXISTENCIA")
  const costo = columna("COSTOTOTAL", "VALORTOTAL")
  const sucursal = columna("SUCURSAL", "BODEGA")
  if (nombre < 0) throw new Error("Falta la columna nombre o descripción del artículo.")
  const lineas: LineaInventarioInicial[] = []
  filas.slice(indice + 1).forEach((fila, i) => {
    const clave = String(fila[codigo] ?? "").trim()
    const descripcion = String(fila[nombre] ?? "").trim()
    if (!clave && (!descripcion || /^TOTAL(?:ES)?\b/.test(normalizar(descripcion)))) return
    const cantidad = cantidadExcel(fila[stock])
    const costoTotal = costo < 0 || fila[costo] === null || fila[costo] === "" ? null : cantidadExcel(fila[costo])
    const articulo = clave ? vincularArticulo(clave, articulos) : null
    const problema = !clave ? "Falta código" : !descripcion ? "Falta nombre" :
      !Number.isFinite(cantidad) || cantidad < 0 ? "Cantidad inválida o separador ambiguo" :
      costoTotal !== null && (!Number.isFinite(costoTotal) || costoTotal < 0) ? "Costo total inválido" :
      articulo?.tipo === "PRODUCTO_TERMINADO" && !Number.isInteger(cantidad) ? "Producto terminado debe tener unidades enteras" : ""
    lineas.push({ fila: indice + i + 2, codigo: clave, nombre: descripcion, cantidad, costoTotal,
      sucursal: sucursal < 0 ? "" : String(fila[sucursal] ?? "").trim(), articulo, problema })
  })
  if (!lineas.length) throw new Error("El archivo no contiene artículos para revisar.")
  return lineas
}

export function validarLotesIniciales(cantidad: number, lotes: LoteInicial[], fechaCorte: string): string {
  if (cantidad === 0) return ""
  if (!lotes.length) return "Completa los lotes del producto terminado."
  const vistos = new Set<string>()
  for (const lote of lotes) {
    if (!Number.isInteger(lote.cantidad) || lote.cantidad <= 0 || !lote.lote.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(lote.fechaProduccion) || !/^\d{4}-\d{2}-\d{2}$/.test(lote.fechaVencimiento) ||
      lote.fechaProduccion > fechaCorte || lote.fechaVencimiento < lote.fechaProduccion) return "Revisa cantidad, lote y fechas."
    const clave = `${lote.lote.trim().toUpperCase()}|${lote.fechaProduccion}`
    if (vistos.has(clave)) return "El lote está repetido en este artículo."
    vistos.add(clave)
  }
  return lotes.reduce((s, l) => s + l.cantidad, 0) === cantidad ? "" : "Las cantidades de los lotes no suman el stock del Excel."
}

export function movimientoParaConteo(saldo: number, contado: number) {
  if (!Number.isFinite(saldo) || !Number.isFinite(contado) || contado < 0) throw new Error("Conteo inválido.")
  return Math.round((contado - saldo) * 1e6) / 1e6
}
