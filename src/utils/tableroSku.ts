import type { VentaDiariaDb } from "../repositories/ventasRepository"
import type { DevolucionListadoDb } from "../repositories/devolucionRepository"
import { valorIndicadorValidadoCampo, type RegistroDashboardCampo } from "./dashboardVisitasRotacion"
import { calcularRentabilidadSku, claveCliente, normalizar as normalizarCosto, type CostoProducto } from "./calculoRentabilidadSku"
import type { FacturaDetalleDb } from "../repositories/facturasRepository"
import type { NominaMensualAreaDb } from "../repositories/nominaRepository"
import type { PromocionDb } from "../repositories/promocionesRepository"
import type { ReglaDistribucionDb } from "../repositories/rentabilidadRepository"

export type CatalogoSku = { id: string; codigo: string; nombre: string; corto: string }
export type CostoSku = { producto_id: string; costo_materiales_unidad: number | null; items_sin_costo: number } & Partial<CostoProducto>
export type DatosTableroSku = {
  productos: CatalogoSku[]
  clientes: Array<{ id: string; nombre: string }>
  asignaciones: Array<{ cliente_id: string; producto_id: string; precio?: number | null }>
  ventas: VentaDiariaDb[] | null
  devoluciones: DevolucionListadoDb[] | null
  visitas: RegistroDashboardCampo[] | null
  costos: CostoSku[] | null
  errores: string[]
  rentabilidad?: {
    facturas: FacturaDetalleDb[] | null; nomina: NominaMensualAreaDb[] | null
    promociones: PromocionDb[] | null; reglas: ReglaDistribucionDb[] | null
  }
  contabilidad?: {
    gastos: Array<{periodo:string; detalle_id:string; cuenta_codigo:string; cliente_id:string; valor_asignado:number}> | null
    resumen: Array<{periodo:string; gasto_especifico_cliente:number; clasificacion_pendiente:number; cuentas_pendientes:number; cuentas_sin_matriz:number}> | null
  }
}
export type FilaSku = CatalogoSku & {
  unidades: number; venta: number; devueltas: number; valorDevuelto: number
  devolucionesSinValor: number; neto: number | null; aporte: number | null
  tasaDevolucion: number | null
}
export type RotacionSkuLocal = {
  id: string; productoId: string; nombre: string; local: string; cliente: string
  rotacion: number; semanas: number; fecha: string
}
const normalizar = (valor: string) => valor.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
const numero = (valor: unknown) => valor !== null && valor !== "" && Number.isFinite(Number(valor)) ? Number(valor) : null
function semana(fecha: string) {
  const dia = new Date(`${fecha}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() - (dia.getUTCDay() + 6) % 7)
  return dia.toISOString().slice(0, 10)
}

export function resumirTableroSku(datos: DatosTableroSku, clienteId = "", productoId = "") {
  const permitidos = new Set(datos.asignaciones.filter((a) => !clienteId || a.cliente_id === clienteId).map((a) => a.producto_id))
  const productos = datos.productos.filter((p) => permitidos.has(p.id) && (!productoId || p.id === productoId))
  const filas = new Map(productos.map((p) => [p.id, {
    ...p, unidades: 0, venta: 0, devueltas: 0, valorDevuelto: 0, devolucionesSinValor: 0,
    neto: null, aporte: null, tasaDevolucion: null,
  } as FilaSku]))
  const porCodigo = new Map(datos.productos.map((p) => [normalizar(p.codigo), p.id]))
  const clientes = new Map(datos.clientes.map((c) => [c.id, c.nombre]))
  const porNombre = new Map<string, string[]>()
  datos.clientes.forEach((c) => {
    const clave = normalizar(c.nombre)
    porNombre.set(clave, [...(porNombre.get(clave) ?? []), c.id])
  })
  const asignaciones = new Set(datos.asignaciones.map((a) => `${a.cliente_id}|${a.producto_id}`))
  let ventasSinVinculo = 0
  const ventasPendientes: VentaDiariaDb[] = []
  const devolucionesPendientes: Array<{devolucionId:string; detalleId:string; documento:string; fecha:string; producto:string; sku:string; unidades:number}> = []
  for (const venta of datos.ventas ?? []) {
    const coincidencias = porNombre.get(normalizar(venta.cliente_nombre)) ?? []
    const alias = datos.clientes.filter(c => claveCliente(c.nombre) === claveCliente(venta.cliente_nombre))
    const cliente = venta.cliente_id ?? (coincidencias.length === 1 ? coincidencias[0] : alias.length === 1 ? alias[0].id : "")
    const producto = venta.producto_id ?? porCodigo.get(normalizar(venta.sku)) ?? ""
    if (clienteId && cliente !== clienteId && claveCliente(venta.cliente_nombre) !== claveCliente(clientes.get(clienteId))) continue
    if (productoId && producto !== productoId && normalizar(venta.sku) !== normalizar(productos.find(p=>p.id===productoId)?.codigo ?? "")) continue
    if (!cliente || !producto) { ventasSinVinculo++; ventasPendientes.push(venta); continue }
    const fila = filas.get(producto)
    if (!fila || clienteId && cliente !== clienteId || !asignaciones.has(`${cliente}|${producto}`)) continue
    fila.unidades += Number(venta.cantidad)
    fila.venta += Number(venta.total_sin_impuestos)
  }
  for (const devolucion of datos.devoluciones ?? []) {
    const cliente = devolucion.cliente?.id
    if (!cliente || clienteId && cliente !== clienteId) continue
    for (const detalle of devolucion.detalles) {
      const producto = detalle.producto_id || porCodigo.get(normalizar(detalle.sku_documento ?? "")) || ""
      const fila = filas.get(producto)
      if (!fila || !asignaciones.has(`${cliente}|${producto}`)) continue
      const unidades = numero(detalle.unidades) ?? 0
      fila.devueltas += unidades
      const valor = numero(detalle.valor_total_documento)
      const precio = numero(detalle.precio_unitario_documento)
      if (valor !== null) fila.valorDevuelto += valor
      else if (precio !== null) fila.valorDevuelto += precio * unidades
      else if (unidades !== 0) {
        fila.devolucionesSinValor++
        devolucionesPendientes.push({devolucionId:devolucion.id,detalleId:detalle.id,documento:devolucion.documento_referencia ?? devolucion.archivo_origen ?? 'Sin referencia',fecha:devolucion.fecha_devolucion,producto:fila.corto || fila.nombre,sku:fila.codigo,unidades})
      }
    }
  }
  const costos = new Map((datos.costos ?? []).map((c) => [c.producto_id, c]))
  for (const fila of filas.values()) {
    if (datos.ventas !== null && datos.devoluciones !== null && !fila.devolucionesSinValor) {
      fila.neto = fila.venta - fila.valorDevuelto
      const costo = costos.get(fila.id)
      const unitario = numero(costo?.costo_materiales_unidad)
      if (unitario !== null && unitario >= 0 && Number(costo?.items_sin_costo) === 0) {
        fila.aporte = fila.neto - fila.unidades * unitario
      }
    }
    if (datos.ventas !== null && datos.devoluciones !== null && fila.unidades > 0) {
      fila.tasaDevolucion = fila.devueltas / fila.unidades * 100
    }
  }
  // Una observación por cliente, local, SKU y semana. Conserva la última visita,
  // incluso si su rotación está vacía o pendiente.
  const ultimas = new Map<string, RegistroDashboardCampo>()
  for (const visita of datos.visitas ?? []) {
    if (!filas.has(visita.producto_id) || clienteId && visita.cliente_id !== clienteId ||
        !asignaciones.has(`${visita.cliente_id}|${visita.producto_id}`)) continue
    const clave = `${visita.cliente_id}|${visita.local_id}|${visita.producto_id}|${semana(visita.fecha)}`
    const previa = ultimas.get(clave)
    const orden = (r: RegistroDashboardCampo) => `${r.fecha}|${r.visitado_en}|${r.actualizado_en}|${r.id}`
    if (!previa || orden(visita) > orden(previa)) ultimas.set(clave, visita)
  }
  const pares = new Map<string, { registro: RegistroDashboardCampo; suma: number; n: number; fecha: string }>()
  let pendientes = 0
  for (const visita of ultimas.values()) {
    const rotacion = valorIndicadorValidadoCampo(visita, "rotacion")
    if (rotacion == null || !Number.isFinite(rotacion)) { pendientes++; continue }
    const clave = `${visita.cliente_id}|${visita.local_id}|${visita.producto_id}`
    const par = pares.get(clave) ?? { registro: visita, suma: 0, n: 0, fecha: visita.fecha }
    par.suma += rotacion; par.n++
    if (visita.fecha > par.fecha) par.fecha = visita.fecha
    pares.set(clave, par)
  }
  const rotaciones: RotacionSkuLocal[] = [...pares.entries()].map(([id, p]) => ({
    id, productoId: p.registro.producto_id, nombre: filas.get(p.registro.producto_id)!.corto || p.registro.producto_nombre,
    local: p.registro.local_nombre, cliente: clientes.get(p.registro.cliente_id) ?? p.registro.cliente_nombre ?? "",
    rotacion: p.suma / p.n, semanas: p.n, fecha: p.fecha,
  }))
  const locales = new Map<string, { id: string; nombre: string; cliente: string; suma: number; skus: number; mediciones: number }>()
  for (const [clave, par] of pares) {
    const r = par.registro, id = `${r.cliente_id}|${r.local_id}`
    const local = locales.get(id) ?? { id, nombre: r.local_nombre, cliente: clientes.get(r.cliente_id) ?? "", suma: 0, skus: 0, mediciones: 0 }
    local.suma += par.suma / par.n; local.skus++; local.mediciones += par.n
    locales.set(id, local)
  }
  return {
    filas: [...filas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    rotaciones, locales: [...locales.values()].map((l) => ({ ...l, rotacion: l.suma / l.skus })),
    pendientes, ventasSinVinculo, ventasPendientes, devolucionesPendientes,
  }
}

// La distribución se calcula sobre todos los movimientos antes de filtrar el cliente/SKU.
export function resumirRentabilidadTableroSku(datos: DatosTableroSku, desde: string, hasta: string, clienteId = "", productoId = "") {
  const base = resumirTableroSku(datos, clienteId, productoId)
  const fuentes = datos.rentabilidad
  const completo = datos.ventas !== null && datos.devoluciones !== null && datos.costos !== null &&
    !!fuentes && fuentes.nomina!=null && fuentes.promociones!=null && fuentes.reglas!=null && (!!datos.contabilidad || fuentes.facturas!=null)
  const productos = new Map(datos.productos.map(p => [p.id, p]))
  const clientes = new Map(datos.clientes.map(c => [c.id, c]))
  const permitidos = new Set(datos.asignaciones.filter(a => !clienteId || a.cliente_id === clienteId).map(a =>
    claveCliente(clientes.get(a.cliente_id)?.nombre) + "|" + normalizarCosto(productos.get(a.producto_id)?.codigo)))
  const calculo = calcularRentabilidadSku({
    clientes: datos.clientes, productos: datos.productos,
    relaciones: datos.asignaciones.map(a => ({...a, precio: a.precio ?? null})),
    costos: (datos.costos ?? []).map(c => ({...c, producto_codigo: c.producto_codigo ?? productos.get(c.producto_id)?.codigo ?? "",
      batch_calculado_kg: c.batch_calculado_kg ?? null, rendimiento_unidades: c.rendimiento_unidades ?? null})),
    ventas: datos.ventas ?? [], devoluciones: datos.devoluciones ?? [], facturas: datos.contabilidad ? [] : fuentes?.facturas ?? [],
    nomina: datos.contabilidad ? (fuentes?.nomina ?? []).filter(n=>n.area==='MANO_OBRA_DIRECTA') : fuentes?.nomina ?? [], promociones: fuentes?.promociones ?? [], reglas: fuentes?.reglas ?? [],
    desde, hasta, baseDevoluciones: "REGISTRO",
  })
  // En meses cerrados el libro mayor clasificado es la fuente de gastos históricos.
  // Sustituye las facturas: no se suman ambas fuentes ni se vuelve a añadir nómina de distribución.
  const contable = datos.contabilidad
  const gastosPorCliente = new Map<string,{transporte:number; directo:number}>()
  let sinAsignarContable = 0
  for (const gasto of contable?.gastos ?? []) {
    const key = claveCliente(clientes.get(gasto.cliente_id)?.nombre)
    const actual = gastosPorCliente.get(key) ?? {transporte:0,directo:0}
    if (['6.1.01.2.13.01','6.1.01.2.13.02'].includes(gasto.cuenta_codigo)) actual.transporte += Number(gasto.valor_asignado)
    else actual.directo += Number(gasto.valor_asignado)
    gastosPorCliente.set(key,actual)
  }
  for (const [key,gasto] of gastosPorCliente) {
    if (!calculo.filas.some(f=>f.clienteKey===key && f.unidades>0)) sinAsignarContable += gasto.transporte+gasto.directo
  }
  const contabilidadCompleta = !contable || contable.gastos!==null && contable.resumen!==null && contable.resumen.length>0 && contable.resumen.every(m=>
    Number(m.clasificacion_pendiente)===0 && Number(m.cuentas_pendientes)===0 && Number(m.cuentas_sin_matriz)===0 &&
    Math.abs(Number(m.gasto_especifico_cliente)-(contable.gastos??[]).filter(g=>g.periodo===m.periodo).reduce((s,g)=>s+Number(g.valor_asignado),0))<=.05)
  const filas = base.filas.map(f => {
    const movimientos = calculo.filas.filter(r => r.productoKey === normalizarCosto(f.codigo) && permitidos.has(r.key))
    const sumar = (campo: "descuentos" | "costoMateriales" | "manoObraDirecta" | "transporte" | "gastoClienteDirecto") =>
      movimientos.reduce((s, r) => s + Number(r[campo] ?? 0), 0)
    const descuentos = fuentes?.promociones != null ? sumar("descuentos") : null
    const neto = f.neto !== null && descuentos !== null ? f.neto - descuentos : null
    const materiales = datos.costos !== null && movimientos.every(r => r.completo) ? sumar("costoMateriales") : null
    const manoObra = fuentes?.nomina != null && fuentes?.reglas != null ? sumar("manoObraDirecta") : null
    const asignado = (campo:'transporte'|'directo') => movimientos.reduce((s,r)=>{
      const total = calculo.filas.filter(x=>x.clienteKey===r.clienteKey).reduce((s,x)=>s+Math.max(0,x.unidades),0)
      return s+(total>0 ? (gastosPorCliente.get(r.clienteKey)?.[campo]??0)*Math.max(0,r.unidades)/total : 0)
    },0)
    const transporte = contable ? contabilidadCompleta ? asignado('transporte') : null : fuentes?.facturas != null && fuentes?.nomina != null ? sumar("transporte") : null
    const gastoCliente = contable ? contabilidadCompleta ? asignado('directo') : null : fuentes?.facturas != null ? sumar("gastoClienteDirecto") : null
    const aporte = completo && contabilidadCompleta && neto !== null && materiales !== null && manoObra !== null && transporte !== null && gastoCliente !== null &&
      Math.abs(calculo.costosSinAsignar)+Math.abs(sinAsignarContable) < 0.005 ? neto - materiales - manoObra - transporte - gastoCliente : null
    return {...f, descuento: descuentos, devolucion: datos.devoluciones !== null && !f.devolucionesSinValor ? f.valorDevuelto : null,
      netoComercial: neto, materiales, manoObra, transporte, gastoCliente, contribucion: aporte,
      margen: aporte !== null && neto !== null && neto > 0 ? aporte / neto * 100 : null}
  })
  return {...base, financieras: filas, costosSinAsignar: calculo.costosSinAsignar+sinAsignarContable, fuentesCompletas: completo && contabilidadCompleta, contabilidadCompleta}
}

export function rangoMesTableroSku(periodo:string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(periodo)) return {desde:'',hasta:''}
  const [anio,mes] = periodo.split('-').map(Number)
  return {desde:periodo,hasta:new Date(Date.UTC(anio,mes,0)).toISOString().slice(0,10)}
}

export function periodosCerradosTableroSku(balances:Array<{periodo:string}>, cierres:Array<{periodo:string;mes_cerrado:boolean}>, hoy:string) {
  const cargados = new Set(balances.map(b=>b.periodo))
  return [...new Set(cierres.filter(c=>c.mes_cerrado && cargados.has(c.periodo) && rangoMesTableroSku(c.periodo).hasta && rangoMesTableroSku(c.periodo).hasta<hoy).map(c=>c.periodo))].sort().reverse()
}
