import { unzipSync, strFromU8 } from "fflate"
import type { DepositoCobro } from "../repositories/cobrosRepository"
export type MovimientoBancario = { id: string; fecha: string; referencia: string; monto: string; causal: string; ordenante: string; observaciones: string; fila: number; clase: "INGRESO" | "REVISAR" | "EXCLUIDO"; motivo: string }
export type EstadoProdubanco = { archivo: string; huella: string; cuenta: string; tipo: "CORRIENTE" | "AHORROS"; desde: string; hasta: string; hoja: string; movimientos: MovimientoBancario[]; debitos: number }
const texto = (valor: unknown) => String(valor ?? "").trim()
const normal = (valor: unknown) => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
function fechaBancaria(valor: unknown) {
  if (valor instanceof Date && Number.isFinite(valor.getTime())) return valor.toISOString().slice(0, 10)
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto(valor))
  if (!partes) throw new Error("La fecha debe tener el formato del banco MM/DD/YYYY.")
  const fecha = `${partes[3]}-${partes[1].padStart(2, "0")}-${partes[2].padStart(2, "0")}`
  const dia = new Date(fecha + "T12:00:00Z")
  if (!Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) throw new Error("Fecha bancaria inválida.")
  return fecha
}
function centavosBancarios(valor: unknown) {
  const s = texto(valor)
  if (!/^-?\d+(\.\d{1,2}0*)?$/.test(s)) throw new Error("Importe inválido: el estado debe contener importes numéricos con hasta dos decimales.")
  const n = Number(s)
  if (!Number.isFinite(n) || Math.abs(n) >= 1000000000) throw new Error("Importe fuera del rango permitido.")
  return Math.round(n * 100)
}
// Compatible con los UUID de la carga histórica enero–octubre (namespace URL).
async function identidadDeposito(cuenta: string, fecha: string, referencia: string) {
  const espacio = new Uint8Array([0x6b,0xa7,0xb8,0x11,0x9d,0xad,0x11,0xd1,0x80,0xb4,0x00,0xc0,0x4f,0xd4,0x30,0xc8])
  const nombre = new TextEncoder().encode(`cibuspan:produbanco:${cuenta}:${fecha}:${referencia}`)
  const entrada = new Uint8Array(espacio.length + nombre.length); entrada.set(espacio); entrada.set(nombre, espacio.length)
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", entrada)).slice(0, 16)
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
export function nombreBancoProdubanco(cuenta: string, tipo: EstadoProdubanco["tipo"]) { return `Produbanco · ${tipo === "CORRIENTE" ? "Corriente" : "Ahorros"} · ****${cuenta.slice(-4)}` }
export async function procesarEstadoProdubanco(archivo: string, hojas: { sheet: string; data: unknown[][] }[], huella: string): Promise<EstadoProdubanco> {
  const validas = hojas.map(hoja => ({ ...hoja, cabecera: hoja.data.findIndex(r => normal(r[0]) === "FECHAPROCESO" && normal(r[2]) === "CAUSAL" && normal(r[3]) === "TOTAL" && normal(r[6]) === "REFERENCIA") })).filter(h => h.cabecera >= 0)
  if (validas.length !== 1) throw new Error("Selecciona un estado de cuenta de Produbanco con una sola hoja de movimientos (FECHA PROCESO, CAUSAL, TOTAL y REFERENCIA).")
  const h = validas[0], dato = (clave: string) => h.data.slice(0,h.cabecera).find(r => normal(r[0]) === clave)?.[1]
  const cuenta = texto(dato("CUENTA")).replace(/\s/g, ""), moneda = normal(dato("MONEDA"))
  if (!/^\d{6,24}$/.test(cuenta)) throw new Error("No se pudo identificar el número de cuenta del estado.")
  if (!["DOLAR", "DOLARES", "USD"].includes(moneda)) throw new Error("Solo se admiten estados de cuenta en dólares.")
  const desde = fechaBancaria(dato("DESDE")), hasta = fechaBancaria(dato("HASTA"))
  if (desde > hasta) throw new Error("El período del estado de cuenta no es válido.")
  const tipo = normal(archivo).includes("AHORRO") ? "AHORROS" as const : "CORRIENTE" as const
  const movimientos: MovimientoBancario[] = []; let debitos = 0
  if (h.data.length > 20000) throw new Error("El archivo es demasiado extenso; separa los movimientos por mes.")
  for (let i = h.cabecera + 1; i < h.data.length; i++) {
    const r = h.data[i]; if (!r?.some(v => v !== null && v !== undefined && texto(v) !== "")) continue
    try {
      const fecha = fechaBancaria(r[0]), centavos = centavosBancarios(r[3])
      if (fecha < desde || fecha > hasta) throw new Error("La fecha queda fuera del período indicado por el banco.")
      if (centavos <= 0) { debitos++; continue }
      const referencia = texto(r[6]), causal = texto(r[2]), transaccion = texto(r[1])
      if (!referencia || referencia.length > 100) throw new Error("Falta una referencia válida del movimiento.")
      const codigo = causal.split("-")[0].trim()
      const excluido = normal(causal).includes("MISMOCLIENTE") || /^\(REV\)/i.test(causal)
      const conocido = ["42002","42252","1049","1416","1476","1590","1620"].includes(codigo)
      movimientos.push({ id: await identidadDeposito(cuenta, fecha, referencia), fecha, referencia, monto: (centavos / 100).toFixed(2), causal,
        ordenante: codigo === "1049" ? "SUPERMAXI" : "", fila: i + 1,
        observaciones: `Importado de ${archivo} · ${h.sheet} fila ${i + 1}. ${transaccion}. ${causal}. Oficina: ${texto(r[7])}. Pendiente de identificar y conciliar.`.slice(0,500),
        clase: excluido ? "EXCLUIDO" : conocido ? "INGRESO" : "REVISAR", motivo: excluido ? "Traspaso propio o reverso de cargo" : conocido ? "Ingreso recibido" : "Comprueba si corresponde a un ingreso recibido" })
    } catch (error) { throw new Error(`Fila ${i + 1}: ${error instanceof Error ? error.message : "Revisa los datos del movimiento."}`) }
  }
  if (!movimientos.length) throw new Error("El estado no contiene movimientos de ingreso.")
  return { archivo, huella, cuenta, tipo, desde, hasta, hoja: h.sheet, movimientos, debitos }
}
// Lee todas las filas físicas, sin confiar en dimension. Los estados del banco
// usan prefijos XML y algunos declaran solo A3:H10 aunque contienen todo el mes.
export function leerHojasEstadoBancario(buffer: ArrayBuffer) {
  let tamano = 0
  const archivos = unzipSync(new Uint8Array(buffer), { filter: f => {
    if (!/^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/.test(f.name)) return false
    tamano += f.originalSize
    if (tamano > 60 * 1024 * 1024) throw new Error("El contenido del archivo es demasiado extenso.")
    return true
  } })
  const xml = (ruta: string) => {
    if (!archivos[ruta]) throw new Error("El archivo no contiene una estructura Excel válida.")
    const texto = strFromU8(archivos[ruta])
    if (/<!DOCTYPE/i.test(texto)) throw new Error("El archivo contiene una estructura XML no admitida.")
    const documento = new DOMParser().parseFromString(texto, "application/xml")
    if (documento.getElementsByTagName("parsererror").length) throw new Error("No se pudo leer el XML del estado.")
    return documento
  }
  const nodos = (n: Document | Element, nombre: string) => Array.from(n.getElementsByTagNameNS("*", nombre))
  const textoNodo = (n: Element) => nodos(n, "t").map(t => t.textContent ?? "").join("")
  const compartidos = archivos["xl/sharedStrings.xml"] ? nodos(xml("xl/sharedStrings.xml"), "si").map(textoNodo) : []
  const relaciones = nodos(xml("xl/_rels/workbook.xml.rels"), "Relationship")
  const hojas = nodos(xml("xl/workbook.xml"), "sheet")
  if (hojas.length > 20) throw new Error("El archivo contiene demasiadas hojas.")
  return hojas.map(h => {
    const id = h.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
    const relacion = relaciones.find(r => r.getAttribute("Id") === id)
    const destino = relacion?.getAttribute("Target") ?? ""
    const ruta = destino.startsWith("/") ? destino.slice(1) : "xl/" + destino.replace(/^\.\//, "")
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(ruta)) throw new Error("Hoja bancaria no admitida.")
    const datos: unknown[][] = []
    for (const fila of nodos(xml(ruta), "row")) {
      const numero = Number(fila.getAttribute("r") || datos.length + 1)
      if (!Number.isInteger(numero) || numero < 1 || numero > 20000 || datos[numero - 1]) throw new Error("Numeración de filas no admitida.")
      const valores: unknown[] = []; let anterior = 0
      for (const celda of nodos(fila, "c")) {
        const direccion = celda.getAttribute("r"), letras = direccion?.match(/^([A-Z]+)[0-9]+$/)?.[1]
        const columna = letras ? [...letras].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) : anterior + 1
        anterior = columna
        if (columna > 8) continue
        if (nodos(celda, "f").length) throw new Error("El estado bancario debe contener valores, sin fórmulas.")
        const tipo = celda.getAttribute("t"), valor = nodos(celda, "v")[0]?.textContent ?? ""
        if (tipo === "e") throw new Error("El estado contiene una celda con error.")
        if (tipo === "s" && (!/^\d+$/.test(valor) || compartidos[Number(valor)] === undefined)) throw new Error("Texto compartido inválido.")
        valores[columna - 1] = tipo === "s" ? compartidos[Number(valor)] : tipo === "inlineStr" ? textoNodo(celda) : valor
      }
      datos[numero - 1] = valores
    }
    return { sheet: h.getAttribute("name") ?? "Hoja", data: Array.from({ length: datos.length }, (_, i) => datos[i] ?? []) }
  })
}
export async function leerEstadoProdubanco(archivo: File) {
  if (!/\.xlsx$/i.test(archivo.name) || archivo.size > 20 * 1024 * 1024 || archivo.name.length > 200) throw new Error("Selecciona un archivo Excel .xlsx de hasta 20 MB y nombre de hasta 200 caracteres.")
  const buffer = await archivo.arrayBuffer()
  const hojas = leerHojasEstadoBancario(buffer), digest = await crypto.subtle.digest("SHA-256", buffer)
  return procesarEstadoProdubanco(archivo.name, hojas, Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join(""))
}
export function estadoMovimientoBancario(m: MovimientoBancario, estado: Pick<EstadoProdubanco,"cuenta"|"tipo">, existentes: DepositoCobro[], movimientos: MovimientoBancario[]): "NUEVO" | "REVISAR" | "CONFLICTO" | "DUPLICADO" | "EXCLUIDO" {
  if (m.clase === "EXCLUIDO") return "EXCLUIDO"
  const repetidas = movimientos.filter(r => r.fecha === m.fecha && r.referencia.toUpperCase() === m.referencia.toUpperCase() && r.clase !== "EXCLUIDO")
  if (repetidas.length > 1) return "CONFLICTO"
  const banco = nombreBancoProdubanco(estado.cuenta, estado.tipo).toUpperCase()
  const previo = existentes.find(d => d.id === m.id || (!d.anulado && d.banco.trim().toUpperCase() === banco && d.fecha === m.fecha && d.referencia.trim().toUpperCase() === m.referencia.toUpperCase()))
  if (!previo) return m.clase === "REVISAR" ? "REVISAR" : "NUEVO"
  if (previo.anulado || previo.banco.trim().toUpperCase() !== banco || previo.fecha !== m.fecha || previo.referencia.trim().toUpperCase() !== m.referencia.toUpperCase() || Math.round(Number(previo.monto)*100) !== Math.round(Number(m.monto)*100)) return "CONFLICTO"
  return "DUPLICADO"
}
