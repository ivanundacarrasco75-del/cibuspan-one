import type { VentaDiariaDb } from "../repositories/ventasRepository"
import type { DevolucionListadoDb } from "../repositories/devolucionRepository"
import type { FacturaDetalleDb } from "../repositories/facturasRepository"
import type { NominaMensualAreaDb } from "../repositories/nominaRepository"
import type { PromocionDb } from "../repositories/promocionesRepository"
import type { BaseDistribucion, ReglaDistribucionDb } from "../repositories/rentabilidadRepository"

export type Cliente = { id: string; nombre: string }
export type Producto = { id: string; codigo: string; nombre: string; corto: string }
export type Relacion = { cliente_id: string; producto_id: string; precio: number | null }
export type CostoProducto = {
  producto_id: string
  producto_codigo: string
  batch_calculado_kg: number | null
  rendimiento_unidades: number | null
  costo_materiales_unidad: number | null
  items_sin_costo: number
}

export type TransporteClasificado = {
  cliente_id: string
  cliente_nombre: string
  gasto_transporte: number
}

export type TransporteMes = { filas: TransporteClasificado[]; sinAtribuir: number }

export type Movimiento = {
  key: string
  clienteKey: string
  cliente: string
  productoKey: string
  codigo: string
  sku: string
  unidades: number
  unidadesDevueltas: number
  ventaBruta: number
  descuentos: number
  devoluciones: number
}

export type FilaCalculo = Movimiento & {
  ventasNetas: number
  kgEquivalente: number
  costoMateriales: number | null
  manoObraDirecta: number
  transporte: number
  gastoClienteDirecto: number
  gastoGeneral: number
  margenBruto: number | null
  contribucion: number | null
  ebitda: number | null
  completo: boolean
}

function fechaIso(fecha = new Date()) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function sumarDias(valor: string, dias: number) {
  const fecha = new Date(`${valor}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIso(fecha)
}

export function normalizar(valor: string | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

export function claveCliente(nombre: string | null | undefined) {
  const texto = normalizar(nombre)
  if (texto.includes("FAVORITA") || texto.includes("SUPERMAXI") || texto.includes("MEGAMAXI")) return "CORPORACION FAVORITA"
  if (texto.includes("SANTAMARIA") || texto.includes("SANTA MARIA")) return "MEGA SANTAMARIA"
  if (texto.includes("ROSADO") || texto.includes("COMISARIATO")) return "CORPORACION EL ROSADO"
  if (texto.includes("TUTI")) return "TUTI"
  return texto.replace(/\bC A\b/g, "").replace(/\bCIA LTDA\b/g, "").replace(/\s+/g, " ").trim()
}

export type DatosCalculoRentabilidad = {
  clientes: Cliente[]; productos: Producto[]; relaciones: Relacion[]; costos: CostoProducto[]
  ventas: VentaDiariaDb[]; devoluciones: DevolucionListadoDb[]; facturas: FacturaDetalleDb[]
  nomina: NominaMensualAreaDb[]; promociones: PromocionDb[]; reglas: ReglaDistribucionDb[]
  transporteClasificado?: TransporteMes | null; desde: string; hasta: string
  baseDevoluciones?: "ORIGEN" | "REGISTRO"
}

export function calcularRentabilidadSku({clientes, productos, relaciones, costos, ventas, devoluciones,
  facturas, nomina, promociones, reglas, transporteClasificado = null, desde, hasta,
  baseDevoluciones = "ORIGEN"}: DatosCalculoRentabilidad) {
type Campo = "manoObraDirecta" | "transporte" | "gastoClienteDirecto" | "gastoGeneral"
const clientesId = new Map(clientes.map((item) => [item.id, item]))
const nombresCliente = new Map<string, string>()
clientes.forEach((item) => {
  const key = claveCliente(item.nombre)
  const actual = nombresCliente.get(key)
  if (!actual || normalizar(item.nombre).includes("CORPORACION")) nombresCliente.set(key, item.nombre)
})
const productosId = new Map(productos.map((item) => [item.id, item]))
const productosCodigo = new Map(productos.map((item) => [normalizar(item.codigo), item]))
const clienteKeyPorId = new Map(clientes.map((item) => [item.id, claveCliente(item.nombre)]))
const productoKeyPorId = new Map(productos.map((item) => [item.id, normalizar(item.codigo)]))
const precios = new Map<string, number | null>()
relaciones.forEach((item) => {
  const clienteKey = clienteKeyPorId.get(item.cliente_id)
  const productoKey = productoKeyPorId.get(item.producto_id)
  if (clienteKey && productoKey) precios.set(`${clienteKey}|${productoKey}`, item.precio == null ? null : Number(item.precio))
})
const costosId = new Map(costos.map((item) => [item.producto_id, item]))
const costosCodigo = new Map(costos.map((item) => [normalizar(item.producto_codigo), item]))
const reglasMapa = new Map(reglas.map((item) => [item.codigo, item.base_distribucion]))
const baseRegla = (codigo: string, respaldo: BaseDistribucion) => reglasMapa.get(codigo) ?? respaldo

const promocionesMapa = new Map<string, Array<{ desde: string; hasta: string; tipo: "PORCENTAJE" | "VALOR_UNIDAD"; valor: number }>>()
promociones.filter((item) => item.activo).forEach((promocion) => {
  const clienteKey = clienteKeyPorId.get(promocion.cliente_id) ?? claveCliente(promocion.cliente_nombre)
  promocion.productos.forEach((producto) => {
    const productoKey = productoKeyPorId.get(producto.producto_id) ?? normalizar(producto.sku)
    const key = `${clienteKey}|${productoKey}`
    const lista = promocionesMapa.get(key) ?? []
    lista.push({ desde: promocion.fecha_inicio, hasta: promocion.fecha_fin, tipo: producto.tipo_descuento, valor: Number(producto.valor_descuento) })
    promocionesMapa.set(key, lista)
  })
})

const movimientos = new Map<string, Movimiento>()
const obtenerMovimiento = (clienteKey: string, cliente: string, productoKey: string, codigo: string, sku: string) => {
  const key = `${clienteKey}|${productoKey}`
  const actual = movimientos.get(key)
  if (actual) return actual
  const nuevo: Movimiento = {
    key,
    clienteKey,
    cliente: nombresCliente.get(clienteKey) ?? cliente,
    productoKey,
    codigo,
    sku,
    unidades: 0,
    unidadesDevueltas: 0,
    ventaBruta: 0,
    descuentos: 0,
    devoluciones: 0,
  }
  movimientos.set(key, nuevo)
  return nuevo
}

ventas.forEach((venta) => {
  const clienteCatalogo = venta.cliente_id ? clientesId.get(venta.cliente_id) : null
  const productoCatalogo = venta.producto_id ? productosId.get(venta.producto_id) : productosCodigo.get(normalizar(venta.sku))
  const clienteKey = claveCliente(clienteCatalogo?.nombre ?? venta.cliente_nombre)
  const productoKey = normalizar(productoCatalogo?.codigo ?? venta.sku)
  const movimiento = obtenerMovimiento(
    clienteKey,
    clienteCatalogo?.nombre ?? venta.cliente_nombre,
    productoKey,
    productoCatalogo?.codigo ?? venta.sku,
    productoCatalogo?.corto || productoCatalogo?.nombre || venta.producto_nombre || venta.sku,
  )
  const unidades = Number(venta.cantidad ?? 0)
  const valor = Number(venta.total_sin_impuestos ?? 0)
  movimiento.unidades += unidades
  movimiento.ventaBruta += valor
  const descuento = (promocionesMapa.get(movimiento.key) ?? [])
    .filter((item) => venta.fecha_emision >= item.desde && venta.fecha_emision <= item.hasta)
    .reduce((total, item) => total + (item.tipo === "PORCENTAJE" ? valor * item.valor / 100 : unidades * item.valor), 0)
  movimiento.descuentos += Math.min(Math.max(0, descuento), Math.max(0, valor))
})

devoluciones.forEach((devolucion) => {
  const clienteKey = claveCliente(devolucion.cliente?.nombre)
  ;(devolucion.detalles ?? []).forEach((detalle) => {
    const productoCatalogo = detalle.producto_id ? productosId.get(detalle.producto_id) : null
    const codigo = productoCatalogo?.codigo ?? detalle.producto?.codigo ?? detalle.sku_documento ?? "SIN SKU"
    const productoKey = normalizar(codigo)
    const fechaOrigen = baseDevoluciones === "REGISTRO" ? devolucion.fecha_devolucion : Number(detalle.vida_efectiva_dias ?? 0) > 0
      ? sumarDias(devolucion.fecha_devolucion, -Number(detalle.vida_efectiva_dias))
      : detalle.semana_origen_inicio
    if (fechaOrigen < desde || fechaOrigen > hasta) return
    const movimiento = obtenerMovimiento(
      clienteKey,
      devolucion.cliente?.nombre ?? "Sin cliente",
      productoKey,
      codigo,
      productoCatalogo?.corto || detalle.producto?.corto || detalle.producto_nombre_documento || codigo,
    )
    const unidades = Number(detalle.unidades ?? 0)
    const precioDocumento = detalle.precio_unitario_documento == null ? null : Number(detalle.precio_unitario_documento)
    movimiento.unidadesDevueltas += unidades
    movimiento.devoluciones += detalle.valor_total_documento == null
      ? unidades * Number(precioDocumento ?? precios.get(movimiento.key) ?? 0)
      : Number(detalle.valor_total_documento)
  })
})

const filas: FilaCalculo[] = Array.from(movimientos.values()).map((movimiento) => {
  const producto = productosCodigo.get(movimiento.productoKey)
  const costo = (producto ? costosId.get(producto.id) : undefined) ?? costosCodigo.get(movimiento.productoKey)
  const costoUnitario = costo?.costo_materiales_unidad == null ? null : Number(costo.costo_materiales_unidad)
  const rendimiento = Number(costo?.rendimiento_unidades ?? 0)
  const kgUnitario = rendimiento > 0 ? Number(costo?.batch_calculado_kg ?? 0) / rendimiento : 0
  const completo = costoUnitario !== null && Number(costo?.items_sin_costo ?? 0) === 0
  return {
    ...movimiento,
    ventasNetas: movimiento.ventaBruta - movimiento.descuentos - movimiento.devoluciones,
    kgEquivalente: movimiento.unidades * kgUnitario,
    costoMateriales: costoUnitario === null ? null : movimiento.unidades * costoUnitario,
    manoObraDirecta: 0,
    transporte: 0,
    gastoClienteDirecto: 0,
    gastoGeneral: 0,
    margenBruto: null,
    contribucion: null,
    ebitda: null,
    completo,
  }
})

let costosSinAsignar = transporteClasificado?.sinAtribuir ?? 0
const valorBase = (fila: FilaCalculo, base: BaseDistribucion) => {
  if (base === "UNIDADES") return Math.max(0, fila.unidades)
  if (base === "KG_EQUIVALENTE") return Math.max(0, fila.kgEquivalente)
  return Math.max(0, fila.ventasNetas)
}
const asignar = (
  monto: number,
  base: BaseDistribucion,
  campo: Campo,
  clienteKey?: string | null,
  excluirClienteKey?: string | null,
) => {
  if (!Number.isFinite(monto) || monto === 0) return
  const candidatas = clienteKey
    ? filas.filter((fila) => fila.clienteKey === clienteKey)
    : excluirClienteKey
      ? filas.filter((fila) => fila.clienteKey !== excluirClienteKey)
      : filas
  let baseAplicada = base
  let totalBase = candidatas.reduce((total, fila) => total + valorBase(fila, baseAplicada), 0)
  if (totalBase <= 0 && baseAplicada !== "VENTAS_NETAS") {
    baseAplicada = "VENTAS_NETAS"
    totalBase = candidatas.reduce((total, fila) => total + valorBase(fila, baseAplicada), 0)
  }
  if (totalBase <= 0) {
    costosSinAsignar += monto
    return
  }
  candidatas.forEach((fila) => {
    fila[campo] += monto * valorBase(fila, baseAplicada) / totalBase
  })
}

const periodoDesde = `${desde.slice(0, 7)}-01`
const periodoHasta = `${hasta.slice(0, 7)}-01`
nomina.forEach((fila) => {
  if (fila.periodo < periodoDesde || fila.periodo > periodoHasta) return
  const costo = Number(fila.costo_empresa ?? 0)
  if (fila.area === "MANO_OBRA_DIRECTA") asignar(costo, baseRegla("PERSONAL_PRODUCCION", "KG_EQUIVALENTE"), "manoObraDirecta")
  else if (fila.area === "DISTRIBUCION") asignar(costo, "UNIDADES", "transporte", null, "TUTI")
  else asignar(costo, "UNIDADES", "gastoGeneral")
})

const cuentasPersonal = new Set(["6.1.01.1.01.01", "6.1.01.1.01.04", "6.2.01.1.01.05", "6.1.01.1.01.06", "NOM-MOD", "NOM-MOI", "NOM-ADM", "NOM-VTA", "NOM-DIST"])
const cuentaTransporteClasificado = "6.1.01.2.13.01"
const cuentasTransporte = new Set([cuentaTransporteClasificado, "6.1.01.2.13.02"])
const usarTransporteClasificado = transporteClasificado !== null
  && (transporteClasificado.filas.length > 0 || transporteClasificado.sinAtribuir > 0)
facturas.forEach((factura) => {
  const periodoFactura = factura.periodo_servicio
    ?? (factura.fecha_emision ? `${factura.fecha_emision.slice(0, 7)}-01` : null)
  if (factura.estado === "ANULADA" || !periodoFactura || periodoFactura < periodoDesde || periodoFactura > periodoHasta || !factura.impacta_ebitda || cuentasPersonal.has(factura.cuenta_codigo)) return
  if (usarTransporteClasificado && factura.cuenta_codigo === cuentaTransporteClasificado) return
  const monto = Number(factura.subtotal ?? 0)
  const clienteIds = factura.afecta_tipo === "CLIENTE"
    ? factura.cliente_ids?.length
      ? factura.cliente_ids
      : factura.cliente_id
        ? [factura.cliente_id]
        : []
    : []
  const transporte = cuentasTransporte.has(factura.cuenta_codigo)
  const base: BaseDistribucion = "UNIDADES"
  if (clienteIds.length > 0) {
    const montoPorCliente = monto / clienteIds.length
    clienteIds.forEach((clienteId) => {
      const clienteKey = clienteKeyPorId.get(clienteId) ?? null
      asignar(montoPorCliente, base, transporte ? "transporte" : "gastoClienteDirecto", clienteKey)
    })
  } else {
    asignar(monto, base, transporte ? "transporte" : "gastoGeneral")
  }
})

for (const gasto of transporteClasificado?.filas ?? []) {
  const clienteKey = clienteKeyPorId.get(gasto.cliente_id) ?? claveCliente(gasto.cliente_nombre)
  const candidatas = filas.filter((fila) => fila.clienteKey === clienteKey)
  const monto = Number(gasto.gasto_transporte)
  if (candidatas.some((fila) => fila.unidades > 0 || fila.ventasNetas > 0)) {
    asignar(monto, "UNIDADES", "transporte", clienteKey)
  } else if (candidatas.length > 0) {
    candidatas[0].transporte += monto
  } else {
    filas.push({
      key: `${clienteKey}|transporte-clasificado`, clienteKey,
      cliente: nombresCliente.get(clienteKey) ?? gasto.cliente_nombre,
      productoKey: "", codigo: "", sku: "Transporte clasificado",
      unidades: 0, unidadesDevueltas: 0, ventaBruta: 0, descuentos: 0,
      devoluciones: 0, ventasNetas: 0, kgEquivalente: 0, costoMateriales: 0,
      manoObraDirecta: 0, transporte: monto, gastoClienteDirecto: 0,
      gastoGeneral: 0, margenBruto: null, contribucion: null, ebitda: null,
      completo: true,
    })
  }
}

filas.forEach((fila) => {
  if (!fila.completo || fila.costoMateriales === null) return
  fila.margenBruto = fila.ventasNetas - fila.costoMateriales - fila.manoObraDirecta
  fila.contribucion = fila.margenBruto - fila.transporte - fila.gastoClienteDirecto
  fila.ebitda = fila.contribucion - fila.gastoGeneral
})
return { filas, costosSinAsignar }
}
