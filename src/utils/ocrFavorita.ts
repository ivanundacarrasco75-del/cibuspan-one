import { createWorker, PSM, type LoggerMessage } from "tesseract.js"
import type { LecturaFavorita } from "../repositories/campoComercialRepository"

type ProgresoOcr = (porcentaje: number, mensaje: string) => void

export async function leerCapturasFavoritaOcr(
  archivos: File[],
  onProgreso?: ProgresoOcr,
): Promise<LecturaFavorita> {
  if (archivos.length === 0) throw new Error("Selecciona al menos una imagen.")

  let indice = 0
  const worker = await createWorker("spa", 1, {
    logger: (mensaje: LoggerMessage) => {
      if (mensaje.status !== "recognizing text") return
      const avance = ((indice + Number(mensaje.progress || 0)) / archivos.length) * 100
      onProgreso?.(Math.min(99, Math.round(avance)), "Reconociendo texto…")
    },
  })

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    })
    const textos: string[] = []
    const confianzas: number[] = []
    for (indice = 0; indice < archivos.length; indice += 1) {
      onProgreso?.(Math.round(indice / archivos.length * 100), `Leyendo imagen ${indice + 1} de ${archivos.length}…`)
      const resultado = await worker.recognize(archivos[indice])
      textos.push(resultado.data.text)
      confianzas.push(resultado.data.confidence)
    }
    onProgreso?.(100, "Interpretando valores…")
    return interpretarReporteFavorita(
      textos.join("\n"),
      promedio(confianzas) / 100,
    )
  } finally {
    await worker.terminate()
  }
}

export function interpretarReporteFavorita(
  textoOriginal: string,
  confianza = 0,
): LecturaFavorita {
  const texto = normalizarTexto(textoOriginal)
  const lineas = texto.split("\n").map((linea) => linea.trim()).filter(Boolean)
  const conflictos: string[] = []
  const cantidad = (etiqueta: RegExp, nombre: string, fuente = texto) => {
    const valores = [...fuente.matchAll(new RegExp(etiqueta.source, "g"))].map((m) =>
      primerNumero(fuente.slice(m.index! + m[0].length, m.index! + m[0].length + 120)),
    ).filter((v): v is number => v !== null)
    if (new Set(valores).size > 1) { conflictos.push(`Valores distintos para ${nombre} entre las capturas; revisa las imágenes.`); return null }
    return valores[0] ?? null
  }

  const lectura: LecturaFavorita = {
    texto_ocr: textoOriginal.slice(0, 20000),
    local_nombre: textoLinea(lineas, /^LOCAL\s*[:.-]?\s*(.+)$/),
    codigo_barras: codigoDespues(texto, /CODIGO\s+DE\s+BARRAS\s*[:.-]?/),
    codigo_referencia: codigoDespues(texto, /CODIGO\s+(?:REF\.?\s*)?(?:PROVEEDOR|REFERENCIA)\s*[:.-]?/),
    nombre_producto: producto(lineas),
    fecha_fuente: fechaFuente(texto),
    precio_comercio: cantidad(/PRECIO\s+COMERCIO\s*[:=]?/, "precio comercio"),
    precio_afiliado: cantidad(/PRECIO\s+AFILIADO\s*[:=]?/, "precio afiliado"),
    rotacion_diaria_unidades: cantidad(/VENTA\s+PROMEDIO\s+DIARIA\s*\(?\s*CANT(?:IDAD)?\.?\s*\)?\s*[:=]?/, "rotación diaria"),
    venta_diaria_valor: cantidad(/VENTA\s+PROMEDIO\s+DIARIA\s*\(?\s*VALOR\s*\)?\s*[:=]?/, "venta diaria"),
    prediccion_venta_unidades: cantidad(/PREDICCION\s+DE\s+VENTAS\s+FUTURAS\s*(?:\(\s*CANT(?:IDAD)?\.?\s*\))?\s*[:=]?/, "predicción"),
    participacion_clase: cantidad(/PARTICIPACION\s+(?:CLASE|CLA)\b\s*(?:\(\s*%\s*\))?\s*[:=]?/, "participación clase"),
    participacion_subclase: cantidad(/PARTICIPACION\s+(?:SUBCLASE|SCLA)\b\s*(?:\(\s*%\s*\))?\s*[:=]?/, "participación subclase"),
    stock_local_unidades: cantidad(/EXISTENCIA\s+EN\s+LOCAL\s*[:=]?/, "stock local"),
    dias_inventario_local: cantidad(/DIAS\s+(?:DE\s+)?INVENTARIO\s+LOCAL\s*[:=]?/, "días de inventario local"),
    stock_cd_cajas: cantidad(/EXISTENCIA\s+EN\s+CD\s*[:=]?/, "stock CD"),
    unidades_por_caja: cantidad(/CAJAS?\s+DE\s+/, "unidades por caja"),
    dias_inventario_cd: cantidad(/DIAS\s+(?:DE\s+)?INVENTARIO\s+CD\s*[:=]?/, "días de inventario CD"),
    fecha_ultimo_pedido: fechaDespues(texto, /FECHA\s+(?:ULT\.?|ULTIMO)\s+PEDIDO\s*[:.-]?/),
    cantidad_ultimo_pedido: cantidad(/CANTIDAD\s+(?:DEL\s+)?PEDIDO\s*[:=]?/, "cantidad del pedido"),
    fecha_ultimo_despacho: fechaDespues(texto, /FECHA\s+(?:ULT\.?|ULTIMO)\s+DESPACHO\s*[:.-]?/),
    cantidad_ultimo_despacho: cantidad(/CANTIDAD\s+(?:DEL\s+)?DESPACHO\s*[:=]?/, "cantidad del despacho"),
    confianza: limitar(confianza, 0, 1),
    advertencias: conflictos,
  }

  if (!lectura.local_nombre) lectura.advertencias.push("No se reconoció el local.")
  if (!lectura.codigo_barras && !lectura.codigo_referencia) lectura.advertencias.push("No se reconoció el código del SKU.")
  if (lectura.rotacion_diaria_unidades == null) lectura.advertencias.push("No se reconoció la rotación diaria.")
  if (lectura.stock_local_unidades == null) lectura.advertencias.push("No se reconoció el stock local.")
  if (lectura.confianza < 0.65) lectura.advertencias.push("La calidad de lectura fue baja; revisa cuidadosamente los valores.")
  return lectura
}

function normalizarTexto(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[|]/g, "I")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
}

function fragmentoDespues(texto: string, etiqueta: RegExp, longitud = 120) {
  const coincidencia = etiqueta.exec(texto)
  if (!coincidencia) return ""
  return texto.slice(coincidencia.index + coincidencia[0].length, coincidencia.index + coincidencia[0].length + longitud)
}

function primerNumero(fragmento: string) {
  // Un campo sin valor no puede tomar el número de la siguiente etiqueta.
  const coincidencia = fragmento.match(/^\s*\$?\s*(-?\d+(?:[.,]\d+)?)(?![\d.,])/)
  if (!coincidencia) return null
  const numero = Number(coincidencia[1].replace(",", "."))
  return Number.isFinite(numero) ? numero : null
}

function codigoDespues(texto: string, etiqueta: RegExp) {
  const codigos = new Set<string>()
  for (const m of texto.matchAll(new RegExp(etiqueta.source, "g"))) {
    const fragmento = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 80)
    const coincidencia = fragmento.match(/^\s*((?:\d[ ._-]*){8,14})\b/)
    const codigo = coincidencia?.[1]?.replace(/\D/g, "")
    if (codigo && codigo.length >= 8) codigos.add(codigo)
  }
  return codigos.size === 1 ? [...codigos][0] : null
}

function textoLinea(lineas: string[], patron: RegExp) {
  const valores = new Set<string>()
  for (const linea of lineas) {
    const coincidencia = linea.match(patron)
    const valor = coincidencia?.[1]?.replace(/^[\s:.-]+|[\s:.-]+$/g, "").trim()
    if (valor) valores.add(valor)
  }
  return valores.size === 1 ? [...valores][0] : null
}

function producto(lineas: string[]) {
  const candidata = lineas.find((linea) =>
    /\bPAN\b/.test(linea) &&
    /PANGOLIN/.test(linea) &&
    !/DETALLE|PARTICIPACION/.test(linea),
  )
  return candidata?.replace(/^[\s:.-]+|[\s:.-]+$/g, "").trim() || null
}

function fechaFuente(texto: string) {
  const coincidencia = texto.match(/(\d{2})[/-](\d{2})[/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!coincidencia) return null
  return `${coincidencia[3]}-${coincidencia[2]}-${coincidencia[1]}T${coincidencia[4].padStart(2, "0")}:${coincidencia[5]}:${coincidencia[6] ?? "00"}`
}

function fechaDespues(texto: string, etiqueta: RegExp) {
  const fragmento = fragmentoDespues(texto, etiqueta, 60)
  const iso = fragmento.match(/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  const local = fragmento.match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/)
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
  return null
}

function promedio(valores: number[]) {
  if (valores.length === 0) return 0
  return valores.reduce((total, valor) => total + valor, 0) / valores.length
}

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(maximo, Math.max(minimo, Number.isFinite(valor) ? valor : minimo))
}
