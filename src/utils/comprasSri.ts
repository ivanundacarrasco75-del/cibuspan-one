const RUC_CIBUSPAN = "1792759277001"

function campo(elemento: Element, nombre: string) {
  return Array.from(elemento.children).find((hijo) => hijo.localName === nombre)
}

function valor(elemento: Element, nombre: string) {
  return campo(elemento, nombre)?.textContent?.trim() ?? ""
}

function hijos(elemento: Element, grupo: string, nombre: string) {
  return Array.from(campo(elemento, grupo)?.children ?? []).filter((hijo) => hijo.localName === nombre)
}

function leerXml(texto: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) throw new Error("El XML contiene declaraciones incompatibles.")
  const documento = new DOMParser().parseFromString(texto, "application/xml")
  if (documento.querySelector("parsererror")) throw new Error("El XML está dañado o incompleto.")
  return documento.documentElement
}

function importe(elemento: Element, nombre: string) {
  const monto = valor(elemento, nombre)
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(monto)) throw new Error(`Campo numérico inválido: ${nombre}.`)
  return monto
}

function impuesto(elemento: Element) {
  return {
    codigo: valor(elemento, "codigo"),
    codigoPorcentaje: valor(elemento, "codigoPorcentaje"),
    tarifa: valor(elemento, "tarifa"),
    base: importe(elemento, "baseImponible"),
    valor: importe(elemento, "valor"),
  }
}

export function leerFacturaSri(xml: string) {
  const raiz = leerXml(xml)
  let factura = raiz
  let autorizacion = ""
  if (raiz.localName === "autorizacion") {
    if (valor(raiz, "estado") !== "AUTORIZADO") throw new Error("El comprobante no consta como autorizado.")
    autorizacion = valor(raiz, "numeroAutorizacion")
    factura = leerXml(valor(raiz, "comprobante"))
  }
  const trib = campo(factura, "infoTributaria")
  const info = campo(factura, "infoFactura")
  if (factura.localName !== "factura" || !trib || !info || valor(trib, "codDoc") !== "01") {
    throw new Error("El documento no es una factura de compra.")
  }
  if (valor(info, "identificacionComprador") !== RUC_CIBUSPAN) throw new Error("La factura pertenece a otro comprador.")
  const clave = valor(trib, "claveAcceso")
  if (!/^\d{49}$/.test(clave)) throw new Error("La factura no tiene una clave de acceso válida.")
  const ruc = valor(trib, "ruc")
  const proveedor = valor(trib, "razonSocial")
  const serie = [valor(trib, "estab"), valor(trib, "ptoEmi"), valor(trib, "secuencial")].join("-")
  const fecha = valor(info, "fechaEmision")
  if (!proveedor || !/^\d{13}$/.test(ruc) || !/^\d{3}-\d{3}-\d{9}$/.test(serie) || !/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
    throw new Error("La factura tiene datos de identificación incompletos.")
  }
  const [dia, mes, anio] = fecha.split("/")
  const items = hijos(factura, "detalles", "detalle").map((item) => ({
    codigo: valor(item, "codigoPrincipal"),
    codigoAuxiliar: valor(item, "codigoAuxiliar"),
    descripcion: valor(item, "descripcion"),
    cantidad: importe(item, "cantidad"),
    precio: importe(item, "precioUnitario"),
    descuento: importe(item, "descuento"),
    subtotal: importe(item, "precioTotalSinImpuesto"),
    impuestos: hijos(item, "impuestos", "impuesto").map(impuesto),
  }))
  if (!items.length || items.some((item) => !item.descripcion)) throw new Error("Falta el detalle de la factura.")
  return {
    clave, ruc, proveedor, serie, fecha: `${anio}-${mes}-${dia}`,
    autorizacion: autorizacion || clave,
    estadoXml: raiz === factura ? "Sin constancia de autorización en el XML" : "AUTORIZADO",
    subtotal: importe(info, "totalSinImpuestos"),
    descuento: importe(info, "totalDescuento"),
    total: importe(info, "importeTotal"),
    moneda: valor(info, "moneda"),
    impuestos: hijos(info, "totalConImpuestos", "totalImpuesto").map(impuesto),
    pagos: hijos(info, "pagos", "pago").map((pago) => ({
      forma: valor(pago, "formaPago"),
      total: importe(pago, "total"),
      plazo: valor(pago, "plazo"),
      unidad: valor(pago, "unidadTiempo"),
    })),
    items,
  }
}

export type FacturaSri = ReturnType<typeof leerFacturaSri>
