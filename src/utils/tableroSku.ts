import type { VentaDiariaDb } from "../repositories/ventasRepository"
import type { DevolucionListadoDb } from "../repositories/devolucionRepository"
import { valorIndicadorValidadoCampo, type RegistroDashboardCampo } from "./dashboardVisitasRotacion"

export type CatalogoSku = { id: string; codigo: string; nombre: string; corto: string }
export type CostoSku = { producto_id: string; costo_materiales_unidad: number | null; items_sin_costo: number }
export type DatosTableroSku = {
  productos: CatalogoSku[]
  clientes: Array<{ id: string; nombre: string }>
  asignaciones: Array<{ cliente_id: string; producto_id: string }>
  ventas: VentaDiariaDb[] | null
  devoluciones: DevolucionListadoDb[] | null
  visitas: RegistroDashboardCampo[] | null
  costos: CostoSku[] | null
  errores: string[]
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
  for (const venta of datos.ventas ?? []) {
    const coincidencias = porNombre.get(normalizar(venta.cliente_nombre)) ?? []
    const cliente = venta.cliente_id ?? (coincidencias.length === 1 ? coincidencias[0] : "")
    const producto = venta.producto_id ?? porCodigo.get(normalizar(venta.sku)) ?? ""
    if (!cliente || !producto) { ventasSinVinculo++; continue }
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
      else if (unidades !== 0) fila.devolucionesSinValor++
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
    pendientes, ventasSinVinculo,
  }
}
