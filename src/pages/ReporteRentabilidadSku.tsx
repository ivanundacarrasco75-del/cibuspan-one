import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import { obtenerDevolucionesDb, type DevolucionListadoDb } from "../repositories/devolucionRepository"
import { obtenerFacturasDb, type FacturaDetalleDb } from "../repositories/facturasRepository"
import { obtenerNominaMensualAreaDb, type NominaMensualAreaDb } from "../repositories/nominaRepository"
import { obtenerPromocionesDb, type PromocionDb } from "../repositories/promocionesRepository"
import {
  obtenerReglasDistribucionDb,
  REGLAS_DISTRIBUCION_PREDETERMINADAS,
  type BaseDistribucion,
  type ReglaDistribucionDb,
} from "../repositories/rentabilidadRepository"
import { obtenerVentasDiariasRangoDb, type VentaDiariaDb } from "../repositories/ventasRepository"

type Cliente = { id: string; nombre: string }
type Producto = { id: string; codigo: string; nombre: string; corto: string }
type Relacion = { cliente_id: string; producto_id: string; precio: number | null }
type CostoProducto = {
  producto_id: string
  producto_codigo: string
  batch_calculado_kg: number | null
  rendimiento_unidades: number | null
  costo_materiales_unidad: number | null
  items_sin_costo: number
}

type Movimiento = {
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

type FilaCalculo = Movimiento & {
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

type FilaReporte = {
  id: string
  codigo: string
  sku: string
  unidades: number
  unidadesDevueltas: number
  ventaBruta: number
  descuentos: number
  devoluciones: number
  ventasNetas: number
  costoProducto: number | null
  transporte: number
  gastoClienteDirecto: number
  gastoGeneral: number
  margenBruto: number | null
  contribucion: number | null
  ebitda: number | null
  completo: boolean
}

type OrdenSku = "APORTE_TOTAL" | "APORTE_UNIDAD" | "MARGEN_TOTAL" | "MARGEN_PORCENTAJE" | "UNIDADES"

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

function inicioMes() {
  return `${fechaIso().slice(0, 7)}-01`
}

function normalizar(valor: string | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function claveCliente(nombre: string | null | undefined) {
  const texto = normalizar(nombre)
  if (texto.includes("FAVORITA") || texto.includes("SUPERMAXI") || texto.includes("MEGAMAXI")) return "CORPORACION FAVORITA"
  if (texto.includes("SANTAMARIA") || texto.includes("SANTA MARIA")) return "MEGA SANTAMARIA"
  if (texto.includes("ROSADO") || texto.includes("COMISARIATO")) return "CORPORACION EL ROSADO"
  if (texto.includes("TUTI")) return "TUTI"
  return texto.replace(/\bC A\b/g, "").replace(/\bCIA LTDA\b/g, "").replace(/\s+/g, " ").trim()
}

function moneda(valor: number, decimales = 2) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number.isFinite(valor) ? valor : 0)
}

function numero(valor: number, decimales = 0) {
  return new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number.isFinite(valor) ? valor : 0)
}

function porcentaje(valor: number | null) {
  return valor === null || !Number.isFinite(valor) ? "—" : `${valor.toFixed(1)}%`
}

function porUnidad(valor: number | null, unidades: number) {
  return valor === null || unidades <= 0 ? null : valor / unidades
}

export default function ReporteRentabilidadSku() {
  const [desdeEdicion, setDesdeEdicion] = useState(inicioMes())
  const [hastaEdicion, setHastaEdicion] = useState(fechaIso())
  const [desde, setDesde] = useState(inicioMes())
  const [hasta, setHasta] = useState(fechaIso())
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [relaciones, setRelaciones] = useState<Relacion[]>([])
  const [costos, setCostos] = useState<CostoProducto[]>([])
  const [ventas, setVentas] = useState<VentaDiariaDb[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionListadoDb[]>([])
  const [facturas, setFacturas] = useState<FacturaDetalleDb[]>([])
  const [nomina, setNomina] = useState<NominaMensualAreaDb[]>([])
  const [promociones, setPromociones] = useState<PromocionDb[]>([])
  const [reglas, setReglas] = useState<ReglaDistribucionDb[]>(REGLAS_DISTRIBUCION_PREDETERMINADAS)
  const [clienteFiltro, setClienteFiltro] = useState("TODOS")
  const [skuFiltro, setSkuFiltro] = useState("TODOS")
  const [ordenSku, setOrdenSku] = useState<OrdenSku>("APORTE_TOTAL")
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [avisos, setAvisos] = useState<string[]>([])
  const solicitudRef = useRef(0)

  const cargar = useCallback(async () => {
    const solicitud = solicitudRef.current + 1
    solicitudRef.current = solicitud
    setCargando(true)
    setError("")
    const advertencias: string[] = []
    const opcional = async <T,>(promesa: Promise<T>, respaldo: T, nombre: string) => {
      try {
        return await promesa
      } catch {
        advertencias.push(nombre)
        return respaldo
      }
    }
    try {
      const [
        clientesRes,
        productosRes,
        relacionesRes,
        costosRes,
        ventasDb,
        devolucionesDb,
        facturasDb,
        nominaDb,
        promocionesDb,
        reglasDb,
      ] = await Promise.all([
        supabase.from("clientes").select("id,nombre").eq("activo", true).order("nombre"),
        supabase.from("productos").select("id,codigo,nombre,corto").eq("activo", true).order("corto"),
        supabase.from("cliente_productos").select("cliente_id,producto_id,precio").eq("activo", true),
        supabase.from("fm_vw_productos_costo_completo").select("producto_id,producto_codigo,batch_calculado_kg,rendimiento_unidades,costo_materiales_unidad,items_sin_costo"),
        obtenerVentasDiariasRangoDb(desde, hasta),
        obtenerDevolucionesDb(desde, sumarDias(hasta, 60)),
        opcional(obtenerFacturasDb(), [], "facturas y gastos"),
        opcional(obtenerNominaMensualAreaDb(), [], "nómina"),
        opcional(obtenerPromocionesDb(), [], "descuentos y promociones"),
        opcional(obtenerReglasDistribucionDb(), REGLAS_DISTRIBUCION_PREDETERMINADAS, "reglas de distribución"),
      ])
      if (clientesRes.error) throw clientesRes.error
      if (productosRes.error) throw productosRes.error
      if (relacionesRes.error) throw relacionesRes.error
      if (costosRes.error) throw costosRes.error
      if (solicitud !== solicitudRef.current) return
      setClientes((clientesRes.data ?? []) as Cliente[])
      setProductos((productosRes.data ?? []) as Producto[])
      setRelaciones((relacionesRes.data ?? []) as Relacion[])
      setCostos((costosRes.data ?? []) as CostoProducto[])
      setVentas(ventasDb)
      setDevoluciones(devolucionesDb)
      setFacturas(facturasDb)
      setNomina(nominaDb)
      setPromociones(promocionesDb)
      setReglas(reglasDb)
      setAvisos(advertencias)
    } catch (err) {
      if (solicitud !== solicitudRef.current) return
      setError(err instanceof Error ? err.message : "No se pudo calcular el reporte.")
    } finally {
      if (solicitud === solicitudRef.current) setCargando(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const calculo = useMemo(() => {
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
        const fechaOrigen = Number(detalle.vida_efectiva_dias ?? 0) > 0
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

    let costosSinAsignar = 0
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
    const cuentasTransporte = new Set(["6.1.01.2.13.01", "6.1.01.2.13.02"])
    facturas.forEach((factura) => {
      const periodoFactura = factura.periodo_servicio
        ?? (factura.fecha_emision ? `${factura.fecha_emision.slice(0, 7)}-01` : null)
      if (factura.estado === "ANULADA" || !periodoFactura || periodoFactura < periodoDesde || periodoFactura > periodoHasta || !factura.impacta_ebitda || cuentasPersonal.has(factura.cuenta_codigo)) return
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

    filas.forEach((fila) => {
      if (!fila.completo || fila.costoMateriales === null) return
      fila.margenBruto = fila.ventasNetas - fila.costoMateriales - fila.manoObraDirecta
      fila.contribucion = fila.margenBruto - fila.transporte - fila.gastoClienteDirecto
      fila.ebitda = fila.contribucion - fila.gastoGeneral
    })
    return { filas, costosSinAsignar }
  }, [clientes, productos, relaciones, costos, ventas, devoluciones, facturas, nomina, promociones, reglas, desde, hasta])

  const opcionesClientes = useMemo(() => {
    const mapa = new Map<string, { key: string; nombre: string }>()
    clientes.forEach((cliente) => {
      const key = claveCliente(cliente.nombre)
      const actual = mapa.get(key)
      if (!actual || normalizar(cliente.nombre).includes("CORPORACION")) {
        mapa.set(key, { key, nombre: cliente.nombre })
      }
    })
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [clientes])

  const filasReporte = useMemo(() => {
    const mapa = new Map<string, FilaReporte>()
    calculo.filas
      .filter((fila) => clienteFiltro === "TODOS" || fila.clienteKey === clienteFiltro)
      .filter((fila) => skuFiltro === "TODOS" || fila.productoKey === skuFiltro)
      .forEach((fila) => {
        const actual = mapa.get(fila.productoKey)
        if (actual) {
          actual.unidades += fila.unidades
          actual.unidadesDevueltas += fila.unidadesDevueltas
          actual.ventaBruta += fila.ventaBruta
          actual.descuentos += fila.descuentos
          actual.devoluciones += fila.devoluciones
          actual.ventasNetas += fila.ventasNetas
          actual.costoProducto = (actual.costoProducto ?? 0) + Number(fila.costoMateriales ?? 0) + fila.manoObraDirecta
          actual.transporte += fila.transporte
          actual.gastoClienteDirecto += fila.gastoClienteDirecto
          actual.gastoGeneral += fila.gastoGeneral
          actual.margenBruto = (actual.margenBruto ?? 0) + Number(fila.margenBruto ?? 0)
          actual.contribucion = (actual.contribucion ?? 0) + Number(fila.contribucion ?? 0)
          actual.ebitda = (actual.ebitda ?? 0) + Number(fila.ebitda ?? 0)
          actual.completo = actual.completo && fila.completo
        } else {
          mapa.set(fila.productoKey, {
            id: fila.productoKey,
            codigo: fila.codigo,
            sku: fila.sku,
            unidades: fila.unidades,
            unidadesDevueltas: fila.unidadesDevueltas,
            ventaBruta: fila.ventaBruta,
            descuentos: fila.descuentos,
            devoluciones: fila.devoluciones,
            ventasNetas: fila.ventasNetas,
            costoProducto: fila.costoMateriales === null ? null : fila.costoMateriales + fila.manoObraDirecta,
            transporte: fila.transporte,
            gastoClienteDirecto: fila.gastoClienteDirecto,
            gastoGeneral: fila.gastoGeneral,
            margenBruto: fila.margenBruto,
            contribucion: fila.contribucion,
            ebitda: fila.ebitda,
            completo: fila.completo,
          })
        }
      })
    const resultado = Array.from(mapa.values()).map((fila) => fila.completo
      ? fila
      : { ...fila, costoProducto: null, margenBruto: null, contribucion: null, ebitda: null })
    const valorOrden = (fila: FilaReporte) => {
      if (ordenSku === "APORTE_UNIDAD") return porUnidad(fila.contribucion, fila.unidades) ?? -Infinity
      if (ordenSku === "MARGEN_TOTAL") return fila.margenBruto ?? -Infinity
      if (ordenSku === "MARGEN_PORCENTAJE") return fila.margenBruto !== null && fila.ventasNetas > 0 ? fila.margenBruto / fila.ventasNetas : -Infinity
      if (ordenSku === "UNIDADES") return fila.unidades
      return fila.contribucion ?? -Infinity
    }
    return resultado.sort((a, b) => valorOrden(b) - valorOrden(a) || b.ventasNetas - a.ventasNetas)
  }, [calculo.filas, clienteFiltro, skuFiltro, ordenSku])

  const opcionesSku = useMemo(() => {
    const clientesIdsSeleccionados = new Set(
      clientes
        .filter((cliente) => clienteFiltro === "TODOS" || claveCliente(cliente.nombre) === clienteFiltro)
        .map((cliente) => cliente.id),
    )
    const productosPermitidos = new Set(
      relaciones
        .filter((relacion) => clientesIdsSeleccionados.has(relacion.cliente_id))
        .map((relacion) => relacion.producto_id),
    )
    const catalogo = productos.filter((producto) =>
      clienteFiltro === "TODOS" || productosPermitidos.size === 0 || productosPermitidos.has(producto.id),
    )
    return catalogo
      .map((producto) => ({
        key: normalizar(producto.codigo),
        codigo: producto.codigo,
        nombre: producto.corto || producto.nombre,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  }, [clientes, productos, relaciones, clienteFiltro])

  useEffect(() => {
    if (skuFiltro !== "TODOS" && !opcionesSku.some((item) => item.key === skuFiltro)) setSkuFiltro("TODOS")
  }, [opcionesSku, skuFiltro])

  const totales = useMemo(() => {
    const unidades = filasReporte.reduce((total, fila) => total + fila.unidades, 0)
    const ventaBruta = filasReporte.reduce((total, fila) => total + fila.ventaBruta, 0)
    const ventasNetas = filasReporte.reduce((total, fila) => total + fila.ventasNetas, 0)
    const descuentos = filasReporte.reduce((total, fila) => total + fila.descuentos, 0)
    const devolucionesValor = filasReporte.reduce((total, fila) => total + fila.devoluciones, 0)
    const devolucionesUnidades = filasReporte.reduce((total, fila) => total + fila.unidadesDevueltas, 0)
    const completos = filasReporte.filter((fila) => fila.completo)
    const margenBruto = completos.reduce((total, fila) => total + Number(fila.margenBruto ?? 0), 0)
    const contribucion = completos.reduce((total, fila) => total + Number(fila.contribucion ?? 0), 0)
    const ebitda = completos.reduce((total, fila) => total + Number(fila.ebitda ?? 0), 0)
    const gastos = completos.reduce((total, fila) => total + fila.transporte + fila.gastoClienteDirecto + fila.gastoGeneral, 0)
    return { unidades, ventaBruta, ventasNetas, descuentos, devolucionesValor, devolucionesUnidades, margenBruto, contribucion, ebitda, gastos }
  }, [filasReporte])

  function aplicarPeriodo() {
    if (!desdeEdicion || !hastaEdicion || desdeEdicion > hastaEdicion) {
      setError("El rango de fechas no es válido.")
      return
    }
    setDesde(desdeEdicion)
    setHasta(hastaEdicion)
  }

  function exportarCsv() {
    const encabezados = ["Posición", "SKU", "Código", "Unidades", "Precio promedio/ud", "Descuento/ud", "Descuento %", "Devolución/ud", "Devolución %", "Precio efectivo/ud", "Costo producto/ud", "Margen bruto/ud", "Margen bruto %", "Contribución/ud", "Aporte total", "Aporte %", "Transporte/ud", "Gasto cliente/ud", "Gasto general/ud", "Gastos totales/ud", "EBITDA/ud", "Margen EBITDA %"]
    const filas = filasReporte.map((fila, indice) => {
      const u = fila.unidades
      const margenPorcentaje = fila.margenBruto !== null && fila.ventasNetas > 0 ? fila.margenBruto / fila.ventasNetas * 100 : null
      const aportePorcentaje = fila.contribucion !== null && fila.ventasNetas > 0 ? fila.contribucion / fila.ventasNetas * 100 : null
      const margenEbitda = fila.ebitda !== null && fila.ventasNetas > 0 ? fila.ebitda / fila.ventasNetas * 100 : null
      return [indice + 1, fila.sku, fila.codigo, u, porUnidad(fila.ventaBruta, u), porUnidad(fila.descuentos, u), fila.ventaBruta > 0 ? fila.descuentos / fila.ventaBruta * 100 : 0, porUnidad(fila.devoluciones, u), u > 0 ? fila.unidadesDevueltas / u * 100 : 0, porUnidad(fila.ventasNetas, u), porUnidad(fila.costoProducto, u), porUnidad(fila.margenBruto, u), margenPorcentaje, porUnidad(fila.contribucion, u), fila.contribucion, aportePorcentaje, porUnidad(fila.transporte, u), porUnidad(fila.gastoClienteDirecto, u), porUnidad(fila.gastoGeneral, u), porUnidad(fila.transporte + fila.gastoClienteDirecto + fila.gastoGeneral, u), porUnidad(fila.ebitda, u), margenEbitda]
    })
    const contenido = [encabezados, ...filas].map((fila) => fila.map((valor) => `"${String(valor ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")
    const archivo = new Blob([`\uFEFF${contenido}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(archivo)
    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = `rentabilidad-sku-${desde}-${hasta}.csv`
    enlace.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="unit-profit-report">
      <style>{css}</style>
      <header className="upr-header">
        <div><span>REPORTES · RENTABILIDAD COMERCIAL</span><h1>Rentabilidad por SKU y cliente</h1><p>Precios, devoluciones, descuentos, costos y gastos expresados por unidad vendida.</p></div>
        <button type="button" onClick={exportarCsv} disabled={filasReporte.length === 0}>Exportar CSV</button>
      </header>

      <section className="upr-filters">
        <label><span>Desde</span><input type="date" value={desdeEdicion} onChange={(e) => setDesdeEdicion(e.target.value)} /></label>
        <label><span>Hasta</span><input type="date" value={hastaEdicion} onChange={(e) => setHastaEdicion(e.target.value)} /></label>
        <label><span>Cliente</span><select value={clienteFiltro} onChange={(e) => { setClienteFiltro(e.target.value); setSkuFiltro("TODOS") }}><option value="TODOS">Todos los clientes</option>{opcionesClientes.map((item) => <option key={item.key} value={item.key}>{item.nombre}</option>)}</select></label>
        <label><span>SKU</span><select value={skuFiltro} onChange={(e) => setSkuFiltro(e.target.value)}><option value="TODOS">Todos los SKU</option>{opcionesSku.map((item) => <option key={item.key} value={item.key}>{item.nombre} · {item.codigo}</option>)}</select></label>
        <button type="button" onClick={aplicarPeriodo} disabled={cargando}>{cargando ? "Calculando…" : "Aplicar periodo"}</button>
      </section>

      {error && <div className="upr-error">{error}</div>}
      {avisos.length > 0 && <div className="upr-warning">No se pudieron cargar: {avisos.join(", ")}. Los indicadores relacionados pueden estar incompletos.</div>}
      {!cargando && ventas.length === 0 && <div className="upr-warning">No existen ventas importadas entre {desde} y {hasta}. Puedes escoger cualquier cliente o SKU, pero el reporte mostrará resultados cuando se cargue la facturación de ese periodo en el módulo Ventas.</div>}
      {ventas.length > 0 && calculo.costosSinAsignar > 0 && <div className="upr-warning">{moneda(calculo.costosSinAsignar)} de gastos no pudieron asignarse porque no existe una base suficiente de ventas en el periodo.</div>}

      <section className="upr-kpis">
        <Kpi titulo="Precio promedio" valor={totales.unidades > 0 ? moneda(totales.ventaBruta / totales.unidades, 4) : "—"} detalle="ponderado por unidades" />
        <Kpi titulo="Precio efectivo" valor={totales.unidades > 0 ? moneda(totales.ventasNetas / totales.unidades, 4) : "—"} detalle="después de descuentos y devoluciones" />
        <Kpi titulo="Devolución" valor={porcentaje(totales.unidades > 0 ? totales.devolucionesUnidades / totales.unidades * 100 : 0)} detalle={`${moneda(totales.devolucionesValor)} atribuido`} />
        <Kpi titulo="Margen bruto" valor={porcentaje(totales.ventasNetas > 0 ? totales.margenBruto / totales.ventasNetas * 100 : 0)} detalle={totales.unidades > 0 ? `${moneda(totales.margenBruto / totales.unidades, 4)} por unidad` : "—"} />
        <Kpi titulo="Aporte total" valor={moneda(totales.contribucion)} detalle={porcentaje(totales.ventasNetas > 0 ? totales.contribucion / totales.ventasNetas * 100 : 0)} />
        <Kpi titulo="Gastos estimados" valor={totales.unidades > 0 ? moneda(totales.gastos / totales.unidades, 4) : "—"} detalle="por unidad vendida" />
        <Kpi titulo="EBITDA unitario" valor={totales.unidades > 0 ? moneda(totales.ebitda / totales.unidades, 4) : "—"} detalle={porcentaje(totales.ventasNetas > 0 ? totales.ebitda / totales.ventasNetas * 100 : 0)} />
      </section>

      <section className="upr-panel">
        <header><div><h2>Ranking de aporte por SKU</h2><p>{clienteFiltro === "TODOS" ? "Promedios ponderados de todos los clientes seleccionados." : "Resultados del cliente seleccionado."}</p></div><div className="upr-ranking-controls"><label><span>Ordenar por</span><select value={ordenSku} onChange={(e)=>setOrdenSku(e.target.value as OrdenSku)}><option value="APORTE_TOTAL">Mayor aporte total</option><option value="APORTE_UNIDAD">Mayor aporte por unidad</option><option value="MARGEN_TOTAL">Mayor margen bruto total</option><option value="MARGEN_PORCENTAJE">Mayor margen bruto %</option><option value="UNIDADES">Mayor volumen</option></select></label><span>{numero(filasReporte.length)} SKU</span></div></header>
        {cargando ? <div className="upr-empty">Calculando rentabilidad…</div> : filasReporte.length === 0 ? <div className="upr-empty">No existen ventas para estos filtros.</div> : (
          <div className="upr-table-wrap"><table><thead><tr><th>#</th><th>SKU</th><th>Unidades</th><th>Precio promedio/ud</th><th>Descuento</th><th>Devolución</th><th>Precio efectivo/ud</th><th>Costo producto/ud</th><th>Margen bruto/ud</th><th>Margen bruto %</th><th>Contribución/ud</th><th>Aporte total</th><th>Aporte %</th><th>Transporte/ud</th><th>Gasto cliente/ud</th><th>Gasto general/ud</th><th>Gastos totales/ud</th><th>EBITDA/ud</th><th>Margen EBITDA</th></tr></thead><tbody>{filasReporte.map((fila, indice) => {
            const u = fila.unidades
            const gastos = fila.transporte + fila.gastoClienteDirecto + fila.gastoGeneral
            const margenBrutoPorcentaje = fila.margenBruto !== null && fila.ventasNetas > 0 ? fila.margenBruto / fila.ventasNetas * 100 : null
            const aportePorcentaje = fila.contribucion !== null && fila.ventasNetas > 0 ? fila.contribucion / fila.ventasNetas * 100 : null
            const margenEbitda = fila.ebitda !== null && fila.ventasNetas > 0 ? fila.ebitda / fila.ventasNetas * 100 : null
            return <tr key={fila.id}><td data-label="Posición"><strong className="upr-rank">{indice + 1}</strong></td><td data-label="SKU"><strong>{fila.sku}</strong><small>{fila.codigo}</small></td><td data-label="Unidades">{numero(u)}</td><td data-label="Precio promedio">{u > 0 ? moneda(fila.ventaBruta / u, 4) : "—"}</td><td data-label="Descuento">{u > 0 ? moneda(fila.descuentos / u, 4) : "—"}<small>{porcentaje(fila.ventaBruta > 0 ? fila.descuentos / fila.ventaBruta * 100 : 0)}</small></td><td data-label="Devolución">{u > 0 ? moneda(fila.devoluciones / u, 4) : "—"}<small>{porcentaje(u > 0 ? fila.unidadesDevueltas / u * 100 : 0)}</small></td><td data-label="Precio efectivo">{u > 0 ? moneda(fila.ventasNetas / u, 4) : "—"}</td><td data-label="Costo producto">{fila.costoProducto === null ? "—" : moneda(fila.costoProducto / Math.max(1, u), 4)}</td><td data-label="Margen bruto">{fila.margenBruto === null ? "—" : moneda(fila.margenBruto / Math.max(1, u), 4)}</td><td data-label="Margen bruto %"><ValorPorcentaje valor={margenBrutoPorcentaje} /></td><td data-label="Contribución">{fila.contribucion === null ? "—" : moneda(fila.contribucion / Math.max(1, u), 4)}</td><td data-label="Aporte total"><strong>{fila.contribucion === null ? "—" : moneda(fila.contribucion)}</strong></td><td data-label="Aporte %"><ValorPorcentaje valor={aportePorcentaje} /></td><td data-label="Transporte">{u > 0 ? moneda(fila.transporte / u, 4) : "—"}</td><td data-label="Gasto cliente">{u > 0 ? moneda(fila.gastoClienteDirecto / u, 4) : "—"}</td><td data-label="Gasto general">{u > 0 ? moneda(fila.gastoGeneral / u, 4) : "—"}</td><td data-label="Gastos totales">{u > 0 ? moneda(gastos / u, 4) : "—"}</td><td data-label="EBITDA">{fila.ebitda === null ? "—" : moneda(fila.ebitda / Math.max(1, u), 4)}</td><td data-label="Margen EBITDA"><ValorPorcentaje valor={margenEbitda} />{!fila.completo && <small>Costo incompleto</small>}</td></tr>
          })}</tbody></table></div>
        )}
      </section>
      <footer>El margen bruto resta materiales, empaques y mano de obra directa. El aporte también resta transporte y gastos directos del cliente. El EBITDA incorpora además los gastos generales distribuidos.</footer>
    </main>
  )
}

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return <article><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>
}

function ValorPorcentaje({ valor }: { valor: number | null }) {
  return <strong className={Number(valor ?? -1) >= 0 ? "positive" : "negative"}>{porcentaje(valor)}</strong>
}

const css = `
  .unit-profit-report{max-width:1760px;margin:0 auto;padding:26px;color:#2b2422;background:#f8f5f1;min-height:100vh}.upr-header{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}.upr-header span{color:#8f1d24;font-size:9px;font-weight:950;letter-spacing:1.1px}.upr-header h1{margin:4px 0;font-size:30px}.upr-header p,.upr-panel header p{margin:0;color:#776a65;font-size:12px}.upr-header button,.upr-filters>button{min-height:40px;padding:0 15px;border:0;border-radius:8px;background:#8f1d24;color:white;font-weight:850;cursor:pointer}.upr-header button:disabled{opacity:.45}.upr-filters{display:grid;grid-template-columns:145px 145px minmax(190px,1fr) minmax(230px,1.3fr) auto;align-items:end;gap:10px;margin-bottom:14px;padding:14px;border:1px solid #e6dcd6;border-radius:11px;background:white}.upr-filters label>span{display:block;margin-bottom:5px;color:#6f625d;font-size:9px;font-weight:900;text-transform:uppercase}.upr-filters input,.upr-filters select{width:100%;min-height:40px;box-sizing:border-box;padding:7px 9px;border:1px solid #d9d0cc;border-radius:7px;background:white;color:#392f2c}.upr-error,.upr-warning{margin-bottom:12px;padding:11px 13px;border-radius:8px;font-size:11px}.upr-error{border-left:4px solid #b91c1c;background:#fee2e2;color:#991b1b}.upr-warning{border-left:4px solid #f7931e;background:#fff7ed;color:#9a3412}.upr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px;margin-bottom:14px}.upr-kpis article{display:flex;flex-direction:column;gap:5px;padding:14px;border:1px solid #eadfd9;border-top:3px solid #f7931e;border-radius:10px;background:white}.upr-kpis span{color:#786b65;font-size:9px;font-weight:850}.upr-kpis strong{color:#8f1d24;font-size:21px}.upr-kpis small{color:#958781;font-size:9px}.upr-panel{padding:17px;border:1px solid #e5dad4;border-radius:12px;background:white}.upr-panel>header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.upr-panel h2{margin:0 0 3px;font-size:20px}.upr-ranking-controls{display:flex;align-items:flex-end;gap:9px}.upr-ranking-controls>span{padding:5px 8px;border-radius:999px;background:#fff1e4;color:#9a4f0f;font-size:9px;font-weight:900}.upr-ranking-controls label>span{display:block;margin-bottom:4px;color:#776a65;font-size:8px;font-weight:900;text-transform:uppercase}.upr-ranking-controls select{min-height:35px;padding:5px 8px;border:1px solid #d9d0cc;border-radius:7px;background:white;color:#392f2c;font-size:10px;font-weight:800}.upr-table-wrap{overflow:auto;border:1px solid #ece6e2;border-radius:8px}.upr-table-wrap table{width:100%;min-width:2350px;border-collapse:collapse}.upr-table-wrap th{padding:9px;background:#f8f5f3;color:#6f625d;text-align:right;font-size:9px;white-space:nowrap}.upr-table-wrap th:first-child,.upr-table-wrap td:first-child{text-align:center}.upr-table-wrap th:nth-child(2),.upr-table-wrap td:nth-child(2){text-align:left}.upr-table-wrap td{padding:9px;border-top:1px solid #eee8e4;text-align:right;font-size:10px;white-space:nowrap}.upr-table-wrap td strong{display:block}.upr-table-wrap td small{display:block;margin-top:3px;color:#968983;font-size:8px}.upr-rank{display:inline-grid!important;width:25px;height:25px;place-items:center;border-radius:50%;background:#fff1e4;color:#9a4f0f}.positive{color:#15803d}.negative{color:#b91c1c}.upr-empty{padding:30px;color:#80736d;text-align:center}.unit-profit-report>footer{margin-top:10px;color:#8d7f79;font-size:10px}
  @media(max-width:1100px){.upr-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.upr-filters>button{grid-column:1/-1}.upr-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:700px){.unit-profit-report{padding:12px 10px 24px}.upr-header{align-items:stretch;flex-direction:column}.upr-header button{width:100%}.upr-filters{grid-template-columns:1fr}.upr-filters>button{grid-column:auto}.upr-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.upr-kpis strong{font-size:17px}.upr-panel{padding:11px}.upr-panel>header{flex-direction:column}.upr-ranking-controls{width:100%;align-items:stretch;flex-direction:column}.upr-ranking-controls select{width:100%}.upr-table-wrap{overflow:visible;border:0}.upr-table-wrap table,.upr-table-wrap tbody,.upr-table-wrap tr,.upr-table-wrap td{display:block;width:100%;box-sizing:border-box}.upr-table-wrap table{min-width:0}.upr-table-wrap thead{display:none}.upr-table-wrap tbody{display:grid;gap:9px}.upr-table-wrap tr{padding:9px 11px;border:1px solid #e9dfda;border-radius:9px}.upr-table-wrap td{display:grid;grid-template-columns:130px minmax(0,1fr);align-items:center;gap:7px;padding:5px 0;border:0;white-space:normal}.upr-table-wrap td:before{content:attr(data-label);color:#837670;text-align:left;font-size:8px;font-weight:850}}
`
