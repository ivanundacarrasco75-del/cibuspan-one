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
  const existenciaCd = fragmentoDespues(texto, /EXISTENCIA\s+EN\s+CD\s*[:.-]?/, 90)

  const lectura: LecturaFavorita = {
    local_nombre: textoLinea(lineas, /\bLOCAL\s*[:.-]?\s*(.+)$/),
    codigo_barras: codigoDespues(texto, /CODIGO\s+DE\s+BARRAS\s*[:.-]?/),
    codigo_referencia: codigoDespues(texto, /CODIGO\s+(?:REF\.?\s*)?(?:PROVEEDOR|REFERENCIA)\s*[:.-]?/),
    nombre_producto: producto(lineas),
    fecha_fuente: fechaFuente(texto),
    precio_comercio: numeroDespues(texto, /PRECIO\s+COMERCIO\s*[:.-]?/),
    precio_afiliado: numeroDespues(texto, /PRECIO\s+AFILIADO\s*[:.-]?/),
    rotacion_diaria_unidades: numeroDespues(texto, /VENTA\s+PROMEDIO\s+DIARIA\s*\(?\s*CANT[^:]*[:.-]?/),
    venta_diaria_valor: numeroDespues(texto, /VENTA\s+PROMEDIO\s+DIARIA\s*\(?\s*VALOR[^:]*[:.-]?/),
    prediccion_venta_unidades: numeroDespues(texto, /PREDICCION\s+DE\s+VENTAS\s+FUTURAS[^:]*[:.-]?/),
    participacion_clase: numeroDespues(texto, /PARTICIPACION\s+(?:CLA|CLASE)[^:]*[:.-]?/),
    participacion_subclase: numeroDespues(texto, /PARTICIPACION\s+(?:SCLA|SUBCLASE)[^:]*[:.-]?/),
    stock_local_unidades: numeroDespues(texto, /EXISTENCIA\s+EN\s+LOCAL\s*[:.-]?/),
    dias_inventario_local: numeroDespues(texto, /DIAS\s+(?:DE\s+)?INVENTARIO\s+LOCAL\s*[:.-]?/),
    stock_cd_cajas: primerNumero(existenciaCd),
    unidades_por_caja: numeroDespues(existenciaCd, /CAJAS?\s+DE\s+/),
    dias_inventario_cd: numeroDespues(texto, /DIAS\s+(?:DE\s+)?INVENTARIO\s+CD\s*[:.-]?/),
    fecha_ultimo_pedido: fechaDespues(texto, /FECHA\s+(?:ULT\.?|ULTIMO)\s+PEDIDO\s*[:.-]?/),
    cantidad_ultimo_pedido: numeroDespues(texto, /CANTIDAD\s+(?:DEL\s+)?PEDIDO\s*[:.-]?/),
    fecha_ultimo_despacho: fechaDespues(texto, /FECHA\s+(?:ULT\.?|ULTIMO)\s+DESPACHO\s*[:.-]?/),
    cantidad_ultimo_despacho: numeroDespues(texto, /CANTIDAD\s+(?:DEL\s+)?DESPACHO\s*[:.-]?/),
    confianza: limitar(confianza, 0, 1),
    advertencias: [],
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

function numeroDespues(texto: string, etiqueta: RegExp) {
  return primerNumero(fragmentoDespues(texto, etiqueta))
}

function primerNumero(fragmento: string) {
  const coincidencia = fragmento.match(/-?\s*\$?\s*(\d+(?:[.,]\d+)?)/)
  if (!coincidencia) return null
  const numero = Number(coincidencia[1].replace(",", "."))
  return Number.isFinite(numero) ? numero : null
}

function codigoDespues(texto: string, etiqueta: RegExp) {
  const fragmento = fragmentoDespues(texto, etiqueta, 80)
  const coincidencia = fragmento.match(/(?:\d[\s.:_-]*){8,14}/)
  if (!coincidencia) return null
  const codigo = coincidencia[0].replace(/\D/g, "")
  return codigo.length >= 8 ? codigo : null
}

function textoLinea(lineas: string[], patron: RegExp) {
  for (const linea of lineas) {
    const coincidencia = linea.match(patron)
    const valor = coincidencia?.[1]?.replace(/^[\s:.-]+|[\s:.-]+$/g, "").trim()
    if (valor) return valor
  }
  return null
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
