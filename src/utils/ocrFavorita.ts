import { createWorker, PSM, type LoggerMessage } from "tesseract.js"
import type { LecturaFavorita } from "../repositories/campoComercialRepository"
import { areaCapturaFavorita, type AreaReporteFavorita } from "./areaReporteFavorita"

import { seleccionarCapturasSkuCampo, type TextoImagenCampo } from "./seleccionCapturasSkuCampo"
import { CAMPOS_LECTURA_VALIDABLES, conciliarRotacionInventarioCampo, verificarDosLecturasCampo, VERSION_VALIDACION_CAMPO } from "./validacionLecturasCampo"

type ProgresoOcr = (porcentaje: number, mensaje: string) => void

export async function leerCapturasFavoritaOcr(
  archivos: File[],
  onProgreso?: ProgresoOcr,
  obtenerArea: (archivo: File) => Promise<AreaReporteFavorita | null> = areaCapturaFavorita,
  codigoEsperado?: string,
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
    const imagenes: TextoImagenCampo[] = []
    const textos: string[] = []
    const confianzas: number[] = []
    const controles: string[] = [], confianzasControl: number[] = []
    const confirmaciones: Array<{ campo: string; valor: number | string; texto: string; confianza: number; imagen: number }> = []
    for (indice = 0; indice < archivos.length; indice += 1) {
      onProgreso?.(Math.round(indice / archivos.length * 100), `Leyendo imagen ${indice + 1} de ${archivos.length}…`)
      const area = await obtenerArea(archivos[indice]).catch(() => null)
      await worker.setParameters({ tessedit_pageseg_mode: area ? PSM.SINGLE_BLOCK : PSM.AUTO, preserve_interword_spaces: "1" })
      let textoCabecera = ""
      if (area) {
        // Conservar fecha/hora del reporte en la cabecera sin mezclarla con cantidades.
        const cabecera = await worker.recognize(archivos[indice], { rectangle: { left: area.left, top: 0, width: area.width, height: area.top } })
        textoCabecera = cabecera.data.text
      }
      const resultado = await worker.recognize(archivos[indice], area ? { rectangle: area } : {}, { blocks: true })

      await worker.setParameters({ tessedit_pageseg_mode: area ? PSM.AUTO : PSM.SINGLE_BLOCK })
      onProgreso?.(Math.min(99, Math.round((indice + .5) / archivos.length * 100)), "Comprobando cantidades con otra segmentación…")
      const control = await worker.recognize(archivos[indice], area ? { rectangle: area } : {})
      imagenes.push({ principal: `${textoCabecera}\n${resultado.data.text}`, control: `${textoCabecera}\n${control.data.text}`, confianza: resultado.data.confidence / 100, confianza_control: control.data.confidence / 100 })
      const a = interpretarReporteFavorita(resultado.data.text), b = interpretarReporteFavorita(control.data.text)
      const lineas = resultado.data.blocks?.flatMap((bloque) => bloque.paragraphs.flatMap((p) => p.lines)) ?? []
      for (const [campo] of CAMPOS_LECTURA_VALIDABLES) {
        if (a[campo] == null || a[campo] === b[campo]) continue
        for (let j = 0; j < lineas.length; j++) {
          const grupo = lineas.slice(j, j + 2)
          if (interpretarReporteFavorita(grupo.map((l) => l.text).join("\n"))[campo] !== a[campo]) continue
          const left = Math.max(0, Math.min(...grupo.map((l) => l.bbox.x0)) - 6), top = Math.max(0, Math.min(...grupo.map((l) => l.bbox.y0)) - 5)
          const right = Math.min(area ? area.left + area.width : Infinity, Math.max(...grupo.map((l) => l.bbox.x1)) + 6), bottom = Math.min(area ? area.top + area.height : Infinity, Math.max(...grupo.map((l) => l.bbox.y1)) + 5)
          await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
          const fila = await worker.recognize(archivos[indice], { rectangle: { left, top, width: right - left, height: bottom - top } }).catch(() => null)
          if (fila && fila.data.confidence >= 65 && interpretarReporteFavorita(fila.data.text)[campo] === a[campo]) confirmaciones.push({ campo, valor: a[campo]!, texto: fila.data.text, confianza: fila.data.confidence / 100, imagen: indice })
          break
        }
      }
    }
    onProgreso?.(100, "Interpretando valores…")
    const seleccion = seleccionarCapturasSkuCampo(imagenes, codigoEsperado, interpretarReporteFavorita)
    // Sin cabecera del SKU se conserva el texto para diagnóstico; la validación
    // de identidad impide guardarlo automáticamente como otro producto.
    const indices = seleccion.incluidas.length ? seleccion.incluidas : imagenes.map((_, i) => i)
    for (const i of indices) { textos.push(imagenes[i].principal); controles.push(imagenes[i].control); confianzas.push(imagenes[i].confianza * 100); confianzasControl.push(imagenes[i].confianza_control * 100) }
    const principal = interpretarReporteFavorita(textos.join("\n"), promedio(confianzas) / 100)
    const control = interpretarReporteFavorita(controles.join("\n"), promedio(confianzasControl) / 100)
    for (const [campo] of CAMPOS_LECTURA_VALIDABLES) {
      const filas = confirmaciones.filter((f) => f.campo === campo && indices.includes(f.imagen))
      if (filas.length && filas.every((f) => f.valor === principal[campo])) Object.assign(control, { [campo]: principal[campo] })
    }
    const comprobacionInventario = conciliarRotacionInventarioCampo(principal, control, indices.flatMap((i) => [
      interpretarReporteFavorita(imagenes[i].principal, imagenes[i].confianza),
      interpretarReporteFavorita(imagenes[i].control, imagenes[i].confianza_control),
    ]))
    const verificacion = verificarDosLecturasCampo(principal, control)
    return { ...principal, verificacion_campos: verificacion, version_validacion: VERSION_VALIDACION_CAMPO,
      lectura_control: { principal, control, comprobacion_inventario: comprobacionInventario, confirmaciones_fila: confirmaciones.filter((f) => indices.includes(f.imagen)), imagenes, capturas_incluidas: seleccion.incluidas, capturas_omitidas: seleccion.omitidas },
      advertencias: [...principal.advertencias, ...Object.entries(verificacion).filter(([, v]) => v.estado === "PENDIENTE").map(([c, v]) => `${c}: ${v.motivo}`)] }
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
  const cd = existenciasCd(texto, conflictos)
  const cantidad = (etiqueta: RegExp, nombre: string, fuente = texto, porcentaje = false) => {
    const valores = [...fuente.matchAll(new RegExp(etiqueta.source, "g"))].map((m) =>
      porcentaje ? porcentajeEnFila(fuente.slice(m.index! + m[0].length, m.index! + m[0].length + 160))
        : primerNumero(fuente.slice(m.index! + m[0].length, m.index! + m[0].length + 120)),
    ).filter((v): v is number => v !== null)
    if (new Set(valores).size > 1) { conflictos.push(`Valores distintos para ${nombre} entre las capturas; revisa las imágenes.`); return null }
    return valores[0] ?? null
  }

  const lectura: LecturaFavorita = {
    texto_ocr: textoOriginal.slice(0, 20000),
    // El logotipo produce SH, ES, SS, NM, DL o M£ delante de LOCAL.
    // Sólo se admite un prefijo corto en la cabecera; nunca EXISTENCIA EN LOCAL.
    local_nombre: textoLinea(lineas, /^(?:[A-Z£$]{1,3}\s+)?LOCAL\s*[:.-]?\s*(.+)$/),
    codigo_barras: codigoDespues(texto, /CODIGO\s+DE\s+BARRAS\s*[:.-]?/),
    codigo_referencia: codigoDespues(texto, /CODIGO\s+(?:REF\.?\s*)?(?:PROVEEDOR|REFERENCIA)\s*[:.-]?/),
    nombre_producto: producto(lineas),
    fecha_fuente: fechaFuente(texto),
    precio_comercio: cantidad(/PRECIO\s+COMERCIO\s*[:=]?/, "precio comercio"),
    precio_afiliado: cantidad(/PRECIO\s+AFILIADO\s*[:=]?/, "precio afiliado"),
    // I/l/1/T pueden confundirse en las etiquetas; nunca se cambian los dígitos del valor.
    rotacion_diaria_unidades: cantidad(/VENTA\s+PROMED[I1L]O\s+D[I1LT]AR[I1LT]A\s*\(?\s*CANT(?:IDAD)?\.?\s*\)?\s*[:=]?/, "rotación diaria"),
    venta_diaria_valor: cantidad(/VENTA\s+PROMED[I1L]O\s+D[I1LT]AR[I1LT]A\s*\(?\s*VALOR\.?\s*\)?\s*[:=]?/, "venta diaria"),
    prediccion_venta_unidades: cantidad(/PREDICCION\s+DE\s+VENTAS\s+FUTURAS\s*(?:\(\s*CANT(?:IDAD)?\.?\s*\))?\s*[:=]?/, "predicción"),
    participacion_clase: cantidad(/PARTICIPACION\s+(?:CLASE|CLA)\b\.?\s*(?:\(\s*%\s*\))?\s*[:=]?/, "participación clase", texto, true),
    participacion_subclase: cantidad(/PARTICIPACION\s+(?:SUBCLASE|SCLA)\b\.?\s*(?:\(\s*%\s*\))?\s*[:=]?/, "participación subclase", texto, true),
    stock_local_unidades: cantidad(/EXISTENCIA\s+EN\s+LOCAL\s*[:=]?/, "stock local"),
    dias_inventario_local: cantidad(/DIAS\s+(?:DE\s+)?INVENTARIO\s+LOCAL\s*[:=]?/, "días de inventario local"),
    stock_cd_cajas: cd.stock,
    unidades_por_caja: cd.unidades,
    dias_inventario_cd: cantidad(/DIAS\s+(?:DE\s+)?INVENTARIO\s+CD\s*[:=]?/, "días de inventario CD"),
    fecha_ultimo_pedido: fechaDespues(texto, /FECHA\s+(?:ULT\.?|ULTIMO)\s+PEDIDO\s*[:.-]?/),
    cantidad_ultimo_pedido: cantidad(/CANTIDAD\s+(?:DEL\s+)?PEDIDO\s*[:=]?/, "cantidad del pedido"),
    fecha_ultimo_despacho: fechaDespues(texto, /FECHA\s+(?:ULT\.?|ULTIMO)\s+DESPACHO\s*[:.-]?/),
    cantidad_ultimo_despacho: cantidad(/CANTIDAD\s+(?:DEL\s+)?DESPACHO\s*[:=]?/, "cantidad del despacho"),
    confianza: limitar(confianza, 0, 1),
    advertencias: conflictos,
    campos_sin_dato: [],
  }

  const ausentes = [
    ["fecha_ultimo_pedido", /FECHA\s+(?:ULT\.?|ULTIMO)\s+PEDIDO\s*[:=]?/],
    ["cantidad_ultimo_pedido", /CANTIDAD\s+(?:DEL\s+)?PEDIDO\s*[:=]?/],
    ["fecha_ultimo_despacho", /FECHA\s+(?:ULT\.?|ULTIMO)\s+DESPACHO\s*[:=]?/],
    ["cantidad_ultimo_despacho", /CANTIDAD\s+(?:DEL\s+)?DESPACHO\s*[:=]?/],
  ] as const
  for (const [campo, etiqueta] of ausentes) {
    const fragmentos = [...texto.matchAll(new RegExp(etiqueta.source, "g"))].map((m) => texto.slice(m.index! + m[0].length).trimStart().split("\n")[0].trim())
    if (fragmentos.length && fragmentos.every((f) => /^[-—–]$|^N\/?D$/.test(f))) lectura.campos_sin_dato!.push(campo)
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
  const coincidencia = fragmento.match(/^\s*\$?\s*(-?\d+(?:[.,]\d+)?)(?![\d.,A-Z/-])/)
  if (!coincidencia) return null
  const numero = Number(coincidencia[1].replace(",", "."))
  return Number.isFinite(numero) ? numero : null
}

function porcentajeEnFila(fragmento: string) {
  const inmediato = primerNumero(fragmento)
  if (inmediato !== null) return inmediato >= 0 && inmediato <= 100 ? inmediato : null
  // CLA/SCLA incluyen la descripción de la categoría, a veces en dos líneas.
  const filas = fragmento.trimStart().split("\n").slice(0, 2)
  for (const [i, fila] of filas.entries()) {
    if (i > 0 && /^(?:PARTICIPACION|EXISTENCIA|DIAS|PRECIO|VENTA|FECHA|CANTIDAD)\b/.test(fila.trim())) break
    const m = fila.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*%\s*$/)
    if (m) { const valor = Number(m[1].replace(",", ".")); return valor <= 100 ? valor : null }
  }
  return null
}

function existenciasCd(texto: string, advertencias: string[]) {
  const registros = [...texto.matchAll(/EXISTENCIA\s+EN\s+CD\s*[:=]?/g)].map((m) => {
    const fragmento = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 250).split(/\n\s*(?:DIAS|FECHA|CANTIDAD|PRECIO|VENTA|PARTICIPACION)\b/)[0]
    const cajas = [...fragmento.matchAll(/(?:^|\s)(\d+(?:[.,]\d+)?|O)\s+CAJAS?\s+DE\s+(\d+(?:[.,]\d+)?)/g)]
    if (cajas.length !== [...fragmento.matchAll(/CAJAS?\s+DE\s+/g)].length) {
      advertencias.push("No se reconocieron todas las presentaciones del CD; revisa ese campo.")
      return { stock: null, unidades: null }
    }
    if (!cajas.length) return { stock: primerNumero(fragmento), unidades: null }
    return { stock: cajas.reduce((s, c) => s + (c[1] === "O" ? 0 : Number(c[1].replace(",", "."))), 0), unidades: [...new Set(cajas.map((c) => Number(c[2].replace(",", "."))))] }
  })
  const stocks = [...new Set(registros.map((r) => r.stock).filter((v) => v !== null))]
  const unidades = [...new Set(registros.flatMap((r) => r.unidades ?? []))]
  if (stocks.length > 1) advertencias.push("Valores distintos para stock CD entre las capturas; revisa las imágenes.")
  if (unidades.length > 1) advertencias.push(`El CD muestra cajas de distintas capacidades (${unidades.join(" y ")} unidades). No hay una única cantidad de unidades por caja.`)
  return { stock: stocks.length === 1 ? stocks[0] : null, unidades: unidades.length === 1 ? unidades[0] : null }
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
  const iso = fragmento.match(/^\s*(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  const local = fragmento.match(/^\s*(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/)
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
