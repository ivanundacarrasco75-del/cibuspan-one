import { useEffect, useMemo, useState } from "react"

import {
  obtenerClientesPedidoDb,
  obtenerDetallePedidoDb,
  obtenerPedidosDb,
  type ClientePedidoDb,
  type DetallePedidoConsultaDb,
  type PedidoListadoDb,
} from "../repositories/pedidoRepository"

import {
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
} from "../repositories/devolucionRepository"

import {
  obtenerImportacionesVentasDb,
  obtenerVentasDetalleRangoDb,
  type VentaDetalleDb,
} from "../repositories/ventasRepository"

import {
  obtenerFechaInicioConciliacionDb,
} from "../repositories/conciliacionRepository"
import ReporteMargenBruto from "./ReporteMargenBruto"

type Props = {
  cambiarPantalla?: (pantalla: string) => void
}

type PedidoConDetalle = {
  pedido: PedidoListadoDb
  detalles: DetallePedidoConsultaDb[]
}

type PeriodoTipo = "MES" | "TRIMESTRE" | "SEMESTRE" | "ANIO"
type Granularidad = "SEMANA" | "MES"
type Dimension = "CLIENTE" | "SKU"

type ProductoCatalogo = {
  key: string
  id: string | null
  sku: string
  nombre: string
}

type FilaResumen = {
  key: string
  nombre: string
  secundario: string
  venta: number
  facturadas: number
  pedidas: number
  despachadas: number
  fillRate: number | null
  devueltas: number
  porcentajeDevolucion: number | null
  baseDevolucion: "DESPACHO" | "FACTURA" | "SIN BASE"
}

type BucketTendencia = {
  key: string
  etiqueta: string
  venta: number
  facturadas: number
  despachadas: number
  pedidas: number
  devueltas: number
  fillRate: number | null
  porcentajeDevolucion: number | null
  baseDevolucion: "DESPACHO" | "FACTURA" | "SIN BASE"
}

function hoyIso() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function aFecha(fechaIso: string) {
  const [anio, mes, dia] = fechaIso.split("-").map(Number)
  return new Date(anio, mes - 1, dia)
}

function fechaIso(fecha: Date) {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, "0"),
    String(fecha.getDate()).padStart(2, "0"),
  ].join("-")
}

function ultimoDiaMes(anio: number, mes1a12: number) {
  return new Date(anio, mes1a12, 0).getDate()
}

function sumarDias(fechaIsoValor: string, dias: number) {
  const fecha = aFecha(fechaIsoValor)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIso(fecha)
}

function inicioSemana(fechaIsoValor: string) {
  const fecha = aFecha(fechaIsoValor)
  const diaSemana = fecha.getDay()
  fecha.setDate(
    fecha.getDate() +
      (diaSemana === 0 ? -6 : 1 - diaSemana),
  )
  return fechaIso(fecha)
}

function finSemana(fechaIsoValor: string) {
  return sumarDias(inicioSemana(fechaIsoValor), 6)
}

function inicioMes(fechaIsoValor: string) {
  return `${fechaIsoValor.slice(0, 7)}-01`
}

function finMes(fechaIsoValor: string) {
  const [anio, mes] = fechaIsoValor
    .slice(0, 7)
    .split("-")
    .map(Number)
  return `${anio}-${String(mes).padStart(2, "0")}-${String(
    ultimoDiaMes(anio, mes),
  ).padStart(2, "0")}`
}

function sumarMeses(fechaIsoValor: string, meses: number) {
  const fecha = aFecha(inicioMes(fechaIsoValor))
  fecha.setMonth(fecha.getMonth() + meses)
  return fechaIso(fecha)
}

function numero(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    maximumFractionDigits: 0,
  }).format(Number(valor || 0))
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0))
}

function porcentaje(
  numerador: number,
  denominador: number,
): number | null {
  if (!denominador) return null
  return Number(
    ((numerador / denominador) * 100).toFixed(1),
  )
}

function porcentajeTexto(valor: number | null) {
  return valor === null ? "—" : `${valor.toFixed(1)}%`
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

function normalizarNombreCliente(valor: string) {
  const tokens = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const quitarParFinal = (a: string, b: string) => {
    if (
      tokens.length >= 2 &&
      tokens[tokens.length - 2] === a &&
      tokens[tokens.length - 1] === b
    ) {
      tokens.splice(-2)
      return true
    }
    return false
  }

  if (!quitarParFinal("S", "A")) {
    quitarParFinal("C", "A")
  }

  if (["SA", "CA"].includes(tokens.at(-1) ?? "")) {
    tokens.pop()
  }

  if (tokens.at(-1) === "LTDA") tokens.pop()

  if (
    ["CIA", "COMPANIA"].includes(
      tokens.at(-1) ?? "",
    )
  ) {
    tokens.pop()
  }

  return tokens.join("")
}

function etiquetaMes(fechaIsoValor: string) {
  const fecha = aFecha(fechaIsoValor)
  return new Intl.DateTimeFormat("es-EC", {
    month: "short",
  })
    .format(fecha)
    .replace(".", "")
    .toUpperCase()
}

function etiquetaSemana(fechaIsoValor: string) {
  const inicio = inicioSemana(fechaIsoValor)
  const fin = finSemana(fechaIsoValor)
  const [, mi, di] = inicio.split("-")
  const [, mf, df] = fin.split("-")
  return mi === mf
    ? `${di}-${df}/${mi}`
    : `${di}/${mi}-${df}/${mf}`
}

function rangoDesdeReferencia(
  referencia: string,
  tipo: PeriodoTipo,
) {
  const [anio, mes] = referencia.split("-").map(Number)

  if (tipo === "MES") {
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(
      ultimoDiaMes(anio, mes),
    ).padStart(2, "0")}`
    return { desde, hasta }
  }

  if (tipo === "TRIMESTRE") {
    const inicioTrimestre = Math.floor((mes - 1) / 3) * 3 + 1
    const finTrimestre = inicioTrimestre + 2
    return {
      desde: `${anio}-${String(inicioTrimestre).padStart(2, "0")}-01`,
      hasta: `${anio}-${String(finTrimestre).padStart(2, "0")}-${String(
        ultimoDiaMes(anio, finTrimestre),
      ).padStart(2, "0")}`,
    }
  }

  if (tipo === "SEMESTRE") {
    const inicioSemestre = mes <= 6 ? 1 : 7
    const finSemestre = inicioSemestre + 5
    return {
      desde: `${anio}-${String(inicioSemestre).padStart(2, "0")}-01`,
      hasta: `${anio}-${String(finSemestre).padStart(2, "0")}-${String(
        ultimoDiaMes(anio, finSemestre),
      ).padStart(2, "0")}`,
    }
  }

  return {
    desde: `${anio}-01-01`,
    hasta: `${anio}-12-31`,
  }
}

function etiquetaPeriodo(
  referencia: string,
  tipo: PeriodoTipo,
) {
  const [anio, mes] = referencia.split("-").map(Number)

  if (tipo === "MES") {
    const fecha = new Date(anio, mes - 1, 1)
    return new Intl.DateTimeFormat("es-EC", {
      month: "long",
      year: "numeric",
    }).format(fecha)
  }

  if (tipo === "TRIMESTRE") {
    const trimestre = Math.floor((mes - 1) / 3) + 1
    return `T${trimestre} · ${anio}`
  }

  if (tipo === "SEMESTRE") {
    return `${mes <= 6 ? "1.er" : "2.º"} semestre · ${anio}`
  }

  return `Año ${anio}`
}

function clampHastaHoy(hasta: string) {
  const hoy = hoyIso()
  return hasta > hoy ? hoy : hasta
}

function claveProducto(
  productoId: string | null | undefined,
  sku: string,
  skuAId: Map<string, string>,
) {
  if (productoId) return `ID:${productoId}`

  const skuNormalizado = normalizar(sku)
  const id = skuAId.get(skuNormalizado)
  return id ? `ID:${id}` : `SKU:${skuNormalizado}`
}

function baseDevolucion(
  preferida: "DESPACHO" | "FACTURA",
  despachadas: number,
  facturadas: number,
): "DESPACHO" | "FACTURA" | "SIN BASE" {
  if (preferida === "DESPACHO") {
    return despachadas > 0
      ? "DESPACHO"
      : "SIN BASE"
  }

  return facturadas > 0
    ? "FACTURA"
    : "SIN BASE"
}

export default function ComercialClientes({
  cambiarPantalla,
}: Props) {
  const hoy = hoyIso()

  const [clientes, setClientes] = useState<ClientePedidoDb[]>([])
  const [ventas, setVentas] = useState<VentaDetalleDb[]>([])
  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([])
  const [devoluciones, setDevoluciones] =
    useState<DevolucionListadoDb[]>([])

  const [tipoPeriodo, setTipoPeriodo] =
    useState<PeriodoTipo>("MES")
  const [referencia, setReferencia] = useState(
    hoy.slice(0, 7),
  )
  const [granularidad, setGranularidad] =
    useState<Granularidad>("SEMANA")
  const [dimension, setDimension] =
    useState<Dimension>("CLIENTE")
  const [vistaPrincipal, setVistaPrincipal] =
    useState<"COMERCIAL" | "MARGEN_BRUTO">("COMERCIAL")
  const [clienteFiltro, setClienteFiltro] =
    useState("TODOS")
  const [skuFiltro, setSkuFiltro] =
    useState("TODOS")

  const [fechaDesde, setFechaDesde] = useState(
    inicioMes(hoy),
  )
  const [fechaHasta, setFechaHasta] = useState(hoy)

  const [fechaInicioConciliacion, setFechaInicioConciliacion] =
    useState<string | null>(null)

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    cargarInicial()
  }, [])

  async function cargarInicial() {
    setCargando(true)
    setError("")

    try {
      const [
        clientesDb,
        importaciones,
        devolucionesDb,
        fechaActivacionDb,
      ] = await Promise.all([
        obtenerClientesPedidoDb(),
        obtenerImportacionesVentasDb(),
        obtenerDevolucionesDb(),
        obtenerFechaInicioConciliacionDb(),
      ])

      const ultimaFecha =
        importaciones
          .map((item) => item.fecha_hasta)
          .filter(Boolean)
          .sort()
          .at(-1) ?? hoy

      const referenciaInicial =
        ultimaFecha.slice(0, 7)
      const rango = rangoDesdeReferencia(
        referenciaInicial,
        "MES",
      )

      setClientes(clientesDb)
      setDevoluciones(devolucionesDb)
      setFechaInicioConciliacion(fechaActivacionDb)
      setReferencia(referenciaInicial)

      await cargarRango(
        rango.desde,
        clampHastaHoy(rango.hasta),
        clientesDb,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar Comercial · Clientes.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function cargarRango(
    desde: string,
    hasta: string,
    clientesDisponibles = clientes,
  ) {
    setCargando(true)
    setError("")

    try {
      const [ventasDb, pedidosDb] =
        await Promise.all([
          obtenerVentasDetalleRangoDb(
            desde,
            hasta,
          ),
          obtenerPedidosDb(),
        ])

      const pedidosPeriodo = pedidosDb.filter(
        (pedido) =>
          pedido.fecha_entrega >= desde &&
          pedido.fecha_entrega <= hasta,
      )

      const pedidosConDetalle = await Promise.all(
        pedidosPeriodo.map(async (pedido) => ({
          pedido,
          detalles:
            await obtenerDetallePedidoDb(pedido.id),
        })),
      )

      setVentas(ventasDb)
      setPedidos(pedidosConDetalle)
      setFechaDesde(desde)
      setFechaHasta(hasta)

      if (
        clienteFiltro !== "TODOS" &&
        !clientesDisponibles.some(
          (cliente) =>
            cliente.id === clienteFiltro,
        )
      ) {
        setClienteFiltro("TODOS")
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el periodo.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function aplicarPeriodo() {
    const rango = rangoDesdeReferencia(
      referencia,
      tipoPeriodo,
    )
    await cargarRango(
      rango.desde,
      clampHastaHoy(rango.hasta),
    )
  }

  async function cambiarTipoPeriodo(
    nuevoTipo: PeriodoTipo,
  ) {
    setTipoPeriodo(nuevoTipo)

    const nuevaGranularidad: Granularidad =
      nuevoTipo === "MES"
        ? "SEMANA"
        : "MES"

    setGranularidad(nuevaGranularidad)

    const rango = rangoDesdeReferencia(
      referencia,
      nuevoTipo,
    )

    await cargarRango(
      rango.desde,
      clampHastaHoy(rango.hasta),
    )
  }

  const clientePorNombre = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const cliente of clientes) {
      mapa.set(
        normalizarNombreCliente(
          cliente.nombre,
        ),
        cliente.id,
      )
    }
    return mapa
  }, [clientes])

  const clientePorId = useMemo(() => {
    const mapa = new Map<string, ClientePedidoDb>()
    for (const cliente of clientes) {
      mapa.set(cliente.id, cliente)
    }
    return mapa
  }, [clientes])

  function resolverClienteVenta(
    venta: VentaDetalleDb,
  ) {
    const porNombre = clientePorNombre.get(
      normalizarNombreCliente(
        venta.cliente_nombre,
      ),
    )
    if (porNombre) return porNombre

    if (
      venta.cliente_id &&
      clientePorId.has(venta.cliente_id)
    ) {
      return venta.cliente_id
    }

    return `N:${normalizarNombreCliente(
      venta.cliente_nombre,
    )}`
  }

  const skuAId = useMemo(() => {
    const mapa = new Map<string, string>()

    for (const venta of ventas) {
      if (venta.producto_id && venta.sku) {
        mapa.set(
          normalizar(venta.sku),
          venta.producto_id,
        )
      }
    }

    for (const { detalles } of pedidos) {
      for (const detalle of detalles) {
        if (
          detalle.producto_id &&
          detalle.producto?.codigo
        ) {
          mapa.set(
            normalizar(
              detalle.producto.codigo,
            ),
            detalle.producto_id,
          )
        }
      }
    }

    for (const devolucion of devoluciones) {
      for (const detalle of devolucion.detalles ?? []) {
        if (
          detalle.producto_id &&
          detalle.producto?.codigo
        ) {
          mapa.set(
            normalizar(
              detalle.producto.codigo,
            ),
            detalle.producto_id,
          )
        }
      }
    }

    return mapa
  }, [ventas, pedidos, devoluciones])

  const catalogoProductos = useMemo<
    ProductoCatalogo[]
  >(() => {
    const mapa = new Map<
      string,
      ProductoCatalogo
    >()

    const guardar = (
      id: string | null,
      sku: string,
      nombre: string,
    ) => {
      const key = claveProducto(
        id,
        sku,
        skuAId,
      )
      const actual = mapa.get(key)

      if (!actual) {
        mapa.set(key, {
          key,
          id,
          sku,
          nombre:
            nombre || sku || "Producto",
        })
      } else {
        if (!actual.id && id) actual.id = id
        if (!actual.sku && sku) actual.sku = sku
        if (
          (!actual.nombre ||
            actual.nombre === "Producto") &&
          nombre
        ) {
          actual.nombre = nombre
        }
      }
    }

    for (const venta of ventas) {
      guardar(
        venta.producto_id,
        venta.sku,
        venta.producto_nombre,
      )
    }

    for (const { detalles } of pedidos) {
      for (const detalle of detalles) {
        guardar(
          detalle.producto_id,
          detalle.producto?.codigo ?? "",
          detalle.producto?.corto ||
            detalle.producto?.nombre ||
            "",
        )
      }
    }

    for (const devolucion of devoluciones) {
      for (const detalle of devolucion.detalles ?? []) {
        guardar(
          detalle.producto_id,
          detalle.producto?.codigo ?? "",
          detalle.producto?.corto ||
            detalle.producto?.nombre ||
            "",
        )
      }
    }

    return Array.from(mapa.values()).sort(
      (a, b) =>
        a.nombre.localeCompare(b.nombre),
    )
  }, [ventas, pedidos, devoluciones, skuAId])

  const periodoConDespachoCompleto = useMemo(
    () =>
      Boolean(
        fechaInicioConciliacion &&
        fechaDesde >= fechaInicioConciliacion,
      ),
    [fechaInicioConciliacion, fechaDesde],
  )

  const basePreferidaPeriodo:
    | "DESPACHO"
    | "FACTURA" =
    periodoConDespachoCompleto
      ? "DESPACHO"
      : "FACTURA"

  const semanasFiltro = useMemo(() => {
    return {
      desde: inicioSemana(fechaDesde),
      hasta: inicioSemana(fechaHasta),
    }
  }, [fechaDesde, fechaHasta])

  const ventasFiltradas = useMemo(() => {
    return ventas.filter((venta) => {
      if (
        clienteFiltro !== "TODOS" &&
        resolverClienteVenta(venta) !==
          clienteFiltro
      ) {
        return false
      }

      const productoKey = claveProducto(
        venta.producto_id,
        venta.sku,
        skuAId,
      )

      if (
        skuFiltro !== "TODOS" &&
        productoKey !== skuFiltro
      ) {
        return false
      }

      return true
    })
  }, [
    ventas,
    clienteFiltro,
    skuFiltro,
    clientePorNombre,
    clientePorId,
    skuAId,
  ])

  const pedidosFiltrados = useMemo(() => {
    return pedidos
      .filter(({ pedido }) => {
        if (
          clienteFiltro !== "TODOS" &&
          pedido.cliente?.id !==
            clienteFiltro
        ) {
          return false
        }
        return true
      })
      .map(({ pedido, detalles }) => ({
        pedido,
        detalles: detalles.filter(
          (detalle) => {
            if (skuFiltro === "TODOS") {
              return true
            }

            const key = claveProducto(
              detalle.producto_id,
              detalle.producto?.codigo ?? "",
              skuAId,
            )
            return key === skuFiltro
          },
        ),
      }))
      .filter(
        ({ detalles }) =>
          detalles.length > 0,
      )
  }, [
    pedidos,
    clienteFiltro,
    skuFiltro,
    skuAId,
  ])

  const devolucionesFiltradas = useMemo(() => {
    return devoluciones
      .filter((devolucion) => {
        if (
          clienteFiltro !== "TODOS" &&
          devolucion.cliente?.id !==
            clienteFiltro
        ) {
          return false
        }
        return true
      })
      .map((devolucion) => ({
        devolucion,
        detalles: (
          devolucion.detalles ?? []
        ).filter((detalle) => {
          if (
            detalle.semana_origen_inicio <
              semanasFiltro.desde ||
            detalle.semana_origen_inicio >
              semanasFiltro.hasta
          ) {
            return false
          }

          if (skuFiltro === "TODOS") {
            return true
          }

          const key = claveProducto(
            detalle.producto_id,
            detalle.producto?.codigo ?? "",
            skuAId,
          )
          return key === skuFiltro
        }),
      }))
      .filter(
        ({ detalles }) =>
          detalles.length > 0,
      )
  }, [
    devoluciones,
    clienteFiltro,
    skuFiltro,
    semanasFiltro,
    skuAId,
  ])

  const totales = useMemo(() => {
    const venta = ventasFiltradas.reduce(
      (total, fila) =>
        total +
        Number(
          fila.total_sin_impuestos ?? 0,
        ),
      0,
    )

    const facturadas =
      ventasFiltradas.reduce(
        (total, fila) =>
          total +
          Number(fila.cantidad ?? 0),
        0,
      )

    let pedidas = 0
    let despachadas = 0

    for (const { pedido, detalles } of pedidosFiltrados) {
      if (
        pedido.estado !== "DESPACHADO"
      ) {
        continue
      }

      for (const detalle of detalles) {
        pedidas += Number(
          detalle.total_unidades ?? 0,
        )
        despachadas += Number(
          detalle.unidades_despachadas ?? 0,
        )
      }
    }

    const devueltas =
      devolucionesFiltradas.reduce(
        (total, grupo) =>
          total +
          grupo.detalles.reduce(
            (suma, detalle) =>
              suma +
              Number(
                detalle.unidades ?? 0,
              ),
            0,
          ),
        0,
      )

    const base = baseDevolucion(
      basePreferidaPeriodo,
      despachadas,
      facturadas,
    )

    const denominadorDevolucion =
      base === "DESPACHO"
        ? despachadas
        : base === "FACTURA"
          ? facturadas
          : 0

    return {
      venta,
      facturadas,
      pedidas,
      despachadas,
      fillRate: periodoConDespachoCompleto
        ? porcentaje(
            despachadas,
            pedidas,
          )
        : null,
      devueltas,
      porcentajeDevolucion:
        porcentaje(
          devueltas,
          denominadorDevolucion,
        ),
      baseDevolucion: base,
    }
  }, [
    ventasFiltradas,
    pedidosFiltrados,
    devolucionesFiltradas,
    basePreferidaPeriodo,
    periodoConDespachoCompleto,
  ])

  const filasClientes = useMemo<
    FilaResumen[]
  >(() => {
    const mapa = new Map<
      string,
      FilaResumen
    >()

    const asegurar = (
      id: string,
      nombre: string,
    ) => {
      const actual = mapa.get(id)
      if (actual) return actual

      const nuevo: FilaResumen = {
        key: id,
        nombre,
        secundario: "",
        venta: 0,
        facturadas: 0,
        pedidas: 0,
        despachadas: 0,
        fillRate: null,
        devueltas: 0,
        porcentajeDevolucion: null,
        baseDevolucion: "SIN BASE",
      }
      mapa.set(id, nuevo)
      return nuevo
    }

    for (const cliente of clientes) {
      if (
        clienteFiltro !== "TODOS" &&
        cliente.id !== clienteFiltro
      ) {
        continue
      }
      asegurar(
        cliente.id,
        cliente.nombre,
      )
    }

    for (const venta of ventasFiltradas) {
      const id =
        resolverClienteVenta(venta)
      const nombre =
        clientePorId.get(id)?.nombre ??
        venta.cliente_nombre
      const fila = asegurar(id, nombre)
      fila.venta += Number(
        venta.total_sin_impuestos ?? 0,
      )
      fila.facturadas += Number(
        venta.cantidad ?? 0,
      )
    }

    for (const { pedido, detalles } of pedidosFiltrados) {
      if (
        pedido.estado !== "DESPACHADO" ||
        !pedido.cliente
      ) {
        continue
      }

      const fila = asegurar(
        pedido.cliente.id,
        pedido.cliente.nombre,
      )

      for (const detalle of detalles) {
        fila.pedidas += Number(
          detalle.total_unidades ?? 0,
        )
        fila.despachadas += Number(
          detalle.unidades_despachadas ?? 0,
        )
      }
    }

    for (const grupo of devolucionesFiltradas) {
      if (!grupo.devolucion.cliente) continue

      const fila = asegurar(
        grupo.devolucion.cliente.id,
        grupo.devolucion.cliente.nombre,
      )

      fila.devueltas +=
        grupo.detalles.reduce(
          (total, detalle) =>
            total +
            Number(
              detalle.unidades ?? 0,
            ),
          0,
        )
    }

    return Array.from(mapa.values())
      .map((fila) => {
        const base = baseDevolucion(
          basePreferidaPeriodo,
          fila.despachadas,
          fila.facturadas,
        )
        const denominador =
          base === "DESPACHO"
            ? fila.despachadas
            : base === "FACTURA"
              ? fila.facturadas
              : 0

        return {
          ...fila,
          fillRate: periodoConDespachoCompleto
            ? porcentaje(
                fila.despachadas,
                fila.pedidas,
              )
            : null,
          porcentajeDevolucion:
            porcentaje(
              fila.devueltas,
              denominador,
            ),
          baseDevolucion: base,
        }
      })
      .filter(
        (fila) =>
          fila.venta !== 0 ||
          fila.facturadas !== 0 ||
          fila.pedidas !== 0 ||
          fila.despachadas !== 0 ||
          fila.devueltas !== 0,
      )
      .sort((a, b) => b.venta - a.venta)
  }, [
    clientes,
    clienteFiltro,
    ventasFiltradas,
    pedidosFiltrados,
    devolucionesFiltradas,
    clientePorId,
    clientePorNombre,
    basePreferidaPeriodo,
    periodoConDespachoCompleto,
  ])

  const filasSku = useMemo<
    FilaResumen[]
  >(() => {
    const mapa = new Map<
      string,
      FilaResumen
    >()

    const asegurar = (
      key: string,
      nombre: string,
      sku: string,
    ) => {
      const actual = mapa.get(key)
      if (actual) return actual

      const nuevo: FilaResumen = {
        key,
        nombre,
        secundario: sku,
        venta: 0,
        facturadas: 0,
        pedidas: 0,
        despachadas: 0,
        fillRate: null,
        devueltas: 0,
        porcentajeDevolucion: null,
        baseDevolucion: "SIN BASE",
      }
      mapa.set(key, nuevo)
      return nuevo
    }

    for (const producto of catalogoProductos) {
      if (
        skuFiltro !== "TODOS" &&
        producto.key !== skuFiltro
      ) {
        continue
      }

      asegurar(
        producto.key,
        producto.nombre,
        producto.sku,
      )
    }

    for (const venta of ventasFiltradas) {
      const key = claveProducto(
        venta.producto_id,
        venta.sku,
        skuAId,
      )
      const fila = asegurar(
        key,
        venta.producto_nombre,
        venta.sku,
      )
      fila.venta += Number(
        venta.total_sin_impuestos ?? 0,
      )
      fila.facturadas += Number(
        venta.cantidad ?? 0,
      )
    }

    for (const { detalles } of pedidosFiltrados) {
      for (const detalle of detalles) {
        const key = claveProducto(
          detalle.producto_id,
          detalle.producto?.codigo ?? "",
          skuAId,
        )
        const fila = asegurar(
          key,
          detalle.producto?.corto ||
            detalle.producto?.nombre ||
            "Producto",
          detalle.producto?.codigo ?? "",
        )
        fila.pedidas += Number(
          detalle.total_unidades ?? 0,
        )
        fila.despachadas += Number(
          detalle.unidades_despachadas ?? 0,
        )
      }
    }

    for (const grupo of devolucionesFiltradas) {
      for (const detalle of grupo.detalles) {
        const key = claveProducto(
          detalle.producto_id,
          detalle.producto?.codigo ?? "",
          skuAId,
        )
        const fila = asegurar(
          key,
          detalle.producto?.corto ||
            detalle.producto?.nombre ||
            "Producto",
          detalle.producto?.codigo ?? "",
        )
        fila.devueltas += Number(
          detalle.unidades ?? 0,
        )
      }
    }

    return Array.from(mapa.values())
      .map((fila) => {
        const base = baseDevolucion(
          basePreferidaPeriodo,
          fila.despachadas,
          fila.facturadas,
        )
        const denominador =
          base === "DESPACHO"
            ? fila.despachadas
            : base === "FACTURA"
              ? fila.facturadas
              : 0

        return {
          ...fila,
          fillRate: periodoConDespachoCompleto
            ? porcentaje(
                fila.despachadas,
                fila.pedidas,
              )
            : null,
          porcentajeDevolucion:
            porcentaje(
              fila.devueltas,
              denominador,
            ),
          baseDevolucion: base,
        }
      })
      .filter(
        (fila) =>
          fila.venta !== 0 ||
          fila.facturadas !== 0 ||
          fila.pedidas !== 0 ||
          fila.despachadas !== 0 ||
          fila.devueltas !== 0,
      )
      .sort((a, b) => b.venta - a.venta)
  }, [
    catalogoProductos,
    skuFiltro,
    ventasFiltradas,
    pedidosFiltrados,
    devolucionesFiltradas,
    skuAId,
    basePreferidaPeriodo,
    periodoConDespachoCompleto,
  ])

  const filasDimension =
    dimension === "CLIENTE"
      ? filasClientes
      : filasSku

  const buckets = useMemo<
    BucketTendencia[]
  >(() => {
    const items = new Map<
      string,
      BucketTendencia
    >()

    if (granularidad === "SEMANA") {
      let cursor = inicioSemana(fechaDesde)
      const limite = inicioSemana(fechaHasta)

      while (cursor <= limite) {
        items.set(cursor, {
          key: cursor,
          etiqueta:
            etiquetaSemana(cursor),
          venta: 0,
          facturadas: 0,
          despachadas: 0,
          pedidas: 0,
          devueltas: 0,
          fillRate: null,
          porcentajeDevolucion: null,
          baseDevolucion: "SIN BASE",
        })
        cursor = sumarDias(cursor, 7)
      }
    } else {
      let cursor = inicioMes(fechaDesde)
      const limite = inicioMes(fechaHasta)

      while (cursor <= limite) {
        items.set(cursor, {
          key: cursor,
          etiqueta: etiquetaMes(cursor),
          venta: 0,
          facturadas: 0,
          despachadas: 0,
          pedidas: 0,
          devueltas: 0,
          fillRate: null,
          porcentajeDevolucion: null,
          baseDevolucion: "SIN BASE",
        })
        cursor = sumarMeses(cursor, 1)
      }
    }

    const keyFecha = (
      fecha: string,
    ) =>
      granularidad === "SEMANA"
        ? inicioSemana(fecha)
        : inicioMes(fecha)

    for (const venta of ventasFiltradas) {
      const key = keyFecha(
        venta.fecha_emision,
      )
      const item = items.get(key)
      if (!item) continue
      item.venta += Number(
        venta.total_sin_impuestos ?? 0,
      )
      item.facturadas += Number(
        venta.cantidad ?? 0,
      )
    }

    for (const { pedido, detalles } of pedidosFiltrados) {
      if (
        pedido.estado !== "DESPACHADO"
      ) {
        continue
      }

      const key = keyFecha(
        pedido.fecha_entrega,
      )
      const item = items.get(key)
      if (!item) continue

      for (const detalle of detalles) {
        item.pedidas += Number(
          detalle.total_unidades ?? 0,
        )
        item.despachadas += Number(
          detalle.unidades_despachadas ?? 0,
        )
      }
    }

    for (const grupo of devolucionesFiltradas) {
      for (const detalle of grupo.detalles) {
        const key = keyFecha(
          detalle.semana_origen_inicio,
        )
        const item = items.get(key)
        if (!item) continue
        item.devueltas += Number(
          detalle.unidades ?? 0,
        )
      }
    }

    return Array.from(items.values()).map(
      (item) => {
        const bucketPosteriorActivacion =
          Boolean(
            fechaInicioConciliacion &&
            item.key >= fechaInicioConciliacion,
          )

        const base = baseDevolucion(
          bucketPosteriorActivacion
            ? "DESPACHO"
            : "FACTURA",
          item.despachadas,
          item.facturadas,
        )

        const denominador =
          base === "DESPACHO"
            ? item.despachadas
            : base === "FACTURA"
              ? item.facturadas
              : 0

        return {
          ...item,
          fillRate:
            bucketPosteriorActivacion
              ? porcentaje(
                  item.despachadas,
                  item.pedidas,
                )
              : null,
          porcentajeDevolucion:
            porcentaje(
              item.devueltas,
              denominador,
            ),
          baseDevolucion: base,
        }
      },
    )
  }, [
    granularidad,
    fechaDesde,
    fechaHasta,
    ventasFiltradas,
    pedidosFiltrados,
    devolucionesFiltradas,
    fechaInicioConciliacion,
  ])

  const topVentas = useMemo(
    () =>
      [...filasDimension]
        .sort((a, b) => b.venta - a.venta)
        .slice(0, 8),
    [filasDimension],
  )

  const topDevolucion = useMemo(
    () =>
      [...filasDimension]
        .filter(
          (fila) =>
            fila.porcentajeDevolucion !==
            null,
        )
        .sort(
          (a, b) =>
            (b.porcentajeDevolucion ?? 0) -
            (a.porcentajeDevolucion ?? 0),
        )
        .slice(0, 8),
    [filasDimension],
  )

  const rangoTexto = `${fechaDesde} — ${fechaHasta}`

  if (vistaPrincipal === "MARGEN_BRUTO") {
    return (
      <main className="gross-margin-shell">
        <style>{`
          .gross-margin-shell {
            width: 100%;
            max-width: none;
            box-sizing: border-box;
            padding: 12px 10px 46px;
            background: #f8f5f1;
          }

          .gross-margin-back {
            margin-bottom: 10px;
          }

          .gross-margin-back button {
            min-height: 38px;
            padding: 0 14px;
            border: 1px solid #8F1D24;
            border-radius: 8px;
            background: #fff;
            color: #8F1D24;
            font-size: 9px;
            font-weight: 900;
            cursor: pointer;
          }
        `}</style>

        <div className="gross-margin-back">
          <button
            type="button"
            onClick={() =>
              setVistaPrincipal("COMERCIAL")
            }
          >
            ← Volver al análisis comercial
          </button>
        </div>

        <ReporteMargenBruto />
      </main>
    )
  }

  return (
    <main className="commercial-bi-page">
      <style>{css}</style>

      <section className="commercial-bi-controls">
        <div className="period-switch">
          <label>Vista por periodo</label>
          <div>
            {(
              [
                ["MES", "Mes"],
                ["TRIMESTRE", "Trimestre"],
                ["SEMESTRE", "Semestre"],
                ["ANIO", "Año"],
              ] as Array<
                [PeriodoTipo, string]
              >
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                className={
                  tipoPeriodo === id
                    ? "active"
                    : ""
                }
                onClick={() => {
                  void cambiarTipoPeriodo(id)
                }}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        <div className="control-field">
          <label>Periodo específico</label>
          {tipoPeriodo === "MES" ? (
            <input
              type="month"
              value={referencia}
              onChange={(evento) =>
                setReferencia(
                  evento.target.value,
                )
              }
            />
          ) : (
            <select
              value={referencia}
              onChange={(evento) => {
                const nuevaReferencia =
                  evento.target.value
                setReferencia(
                  nuevaReferencia,
                )

                const rango =
                  rangoDesdeReferencia(
                    nuevaReferencia,
                    tipoPeriodo,
                  )

                void cargarRango(
                  rango.desde,
                  clampHastaHoy(
                    rango.hasta,
                  ),
                )
              }}
            >
              {Array.from(
                {
                  length:
                    new Date().getFullYear() -
                    2020 +
                    1,
                },
                (_, indice) =>
                  new Date().getFullYear() -
                  indice,
              ).flatMap((anio) => {
                if (tipoPeriodo === "ANIO") {
                  return [
                    <option
                      key={`${anio}-01`}
                      value={`${anio}-01`}
                    >
                      Año {anio}
                    </option>,
                  ]
                }

                if (
                  tipoPeriodo ===
                  "TRIMESTRE"
                ) {
                  return [1, 4, 7, 10].map(
                    (mes, indice) => (
                      <option
                        key={`${anio}-${mes}`}
                        value={`${anio}-${String(
                          mes,
                        ).padStart(2, "0")}`}
                      >
                        T{indice + 1} · {anio}
                      </option>
                    ),
                  )
                }

                return [1, 7].map(
                  (mes, indice) => (
                    <option
                      key={`${anio}-${mes}`}
                      value={`${anio}-${String(
                        mes,
                      ).padStart(2, "0")}`}
                    >
                      {indice + 1}.º semestre ·{" "}
                      {anio}
                    </option>
                  ),
                )
              })}
            </select>
          )}
        </div>

        <div className="control-field">
          <label>Mostrar datos por</label>
          <select
            value={granularidad}
            onChange={(evento) =>
              setGranularidad(
                evento.target
                  .value as Granularidad,
              )
            }
          >
            <option value="SEMANA">
              Semanas
            </option>
            <option value="MES">
              Meses
            </option>
          </select>
        </div>

        <div className="control-field date-readonly">
          <label>Desde</label>
          <strong>{fechaDesde}</strong>
        </div>

        <div className="control-field date-readonly">
          <label>Hasta</label>
          <strong>{fechaHasta}</strong>
        </div>

        <button
          type="button"
          className="apply-button"
          onClick={aplicarPeriodo}
          disabled={cargando}
        >
          {cargando
            ? "Cargando..."
            : "Aplicar"}
        </button>
      </section>

      {error && (
        <div className="commercial-bi-error">
          {error}
        </div>
      )}

      <section className="commercial-bi-dashboard">
        <header className="dashboard-header">
          <div>
            <span>
              COMERCIAL · CLIENTES
            </span>
            <h1>
              Comercial interactivo
            </h1>
            <p>
              {rangoTexto} ·{" "}
              {etiquetaPeriodo(
                referencia,
                tipoPeriodo,
              )}
            </p>
            <small className="activation-note">
              {fechaInicioConciliacion
                ? `Control de despacho válido desde ${fechaInicioConciliacion}`
                : "Aún no existe un primer despacho marcado para conciliación; el histórico usa factura como base."}
            </small>
          </div>

          <div className="dashboard-actions">
            <button
              type="button"
              className="gross-margin-open"
              onClick={() =>
                setVistaPrincipal("MARGEN_BRUTO")
              }
            >
              Margen bruto
            </button>

            <div className="dimension-switch">
              <button
                type="button"
                className={
                  dimension === "CLIENTE"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setDimension("CLIENTE")
                }
              >
                Por clientes
              </button>
              <button
                type="button"
                className={
                  dimension === "SKU"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setDimension("SKU")
                }
              >
                Por SKU
              </button>
            </div>

            <button
              type="button"
              className="reset-button"
              onClick={() => {
                setClienteFiltro("TODOS")
                setSkuFiltro("TODOS")
              }}
            >
              Restablecer filtros
            </button>
          </div>
        </header>

        <div className="dashboard-grid">
          <aside className="dashboard-filters">
            <FilterBox
              titulo="Cliente"
              value={clienteFiltro}
              onChange={setClienteFiltro}
              options={[
                {
                  value: "TODOS",
                  label: "Todos",
                },
                ...clientes.map(
                  (cliente) => ({
                    value: cliente.id,
                    label: cliente.nombre,
                  }),
                ),
              ]}
            />

            <FilterBox
              titulo="SKU"
              value={skuFiltro}
              onChange={setSkuFiltro}
              options={[
                {
                  value: "TODOS",
                  label: "Todos",
                },
                ...catalogoProductos.map(
                  (producto) => ({
                    value: producto.key,
                    label: `${producto.nombre}${
                      producto.sku
                        ? ` · ${producto.sku}`
                        : ""
                    }`,
                  }),
                ),
              ]}
            />

            <div className="filter-note">
              <span>BASE DEL ANÁLISIS</span>
              <p>
                Ventas: facturación real.
                Devoluciones: semana de origen.
                Antes de activar el control,
                % devolución usa factura y
                Fill Rate no se presenta como
                válido. Desde la activación,
                ambos usan despacho real.
              </p>
            </div>

            <button
              type="button"
              className="detail-link"
              onClick={() =>
                cambiarPantalla?.(
                  "Comercial · Ventas",
                )
              }
            >
              Abrir detalle de Ventas
            </button>
          </aside>

          <div className="dashboard-main">
            <div className="kpi-row">
              <Kpi
                titulo="Venta facturada"
                valor={moneda(totales.venta)}
                subtitulo="Total sin impuestos"
                tone="cyan"
              />
              <Kpi
                titulo="Unid. facturadas"
                valor={`${numero(
                  totales.facturadas,
                )} Unid.`}
                subtitulo="Fuente: factura"
                tone="pink"
              />
              <Kpi
                titulo="Unid. despachadas"
                valor={`${numero(
                  totales.despachadas,
                )} Unid.`}
                subtitulo={
                  periodoConDespachoCompleto
                    ? "Fuente: despacho"
                    : "Histórico parcial · no usar como base"
                }
                tone="green"
              />
              <Kpi
                titulo="Fill Rate"
                valor={porcentajeTexto(
                  totales.fillRate,
                )}
                subtitulo={
                  !periodoConDespachoCompleto
                    ? "Histórico de despachos incompleto"
                    : totales.pedidas > 0
                      ? `${numero(
                          totales.despachadas,
                        )} / ${numero(
                          totales.pedidas,
                        )}`
                      : "Sin pedidos despachados"
                }
                tone="blue"
              />
              <Kpi
                titulo="Unid. devueltas"
                valor={`${numero(
                  totales.devueltas,
                )} Unid.`}
                subtitulo="Semana de origen"
                tone="orange"
              />
              <Kpi
                titulo="% devolución"
                valor={porcentajeTexto(
                  totales.porcentajeDevolucion,
                )}
                subtitulo={
                  totales.baseDevolucion ===
                  "DESPACHO"
                    ? "Base: despacho"
                    : totales.baseDevolucion ===
                        "FACTURA"
                      ? "Base: factura · histórico"
                      : "Sin base válida"
                }
                tone="magenta"
              />
            </div>

            <div className="charts-grid">
              <section className="dark-panel trend-panel">
                <PanelTitle
                  eyebrow="TENDENCIA"
                  titulo={`Venta facturada por ${
                    granularidad === "SEMANA"
                      ? "semana"
                      : "mes"
                  }`}
                  derecha={moneda(
                    totales.venta,
                  )}
                />
                <VerticalBars
                  items={buckets.map(
                    (item) => ({
                      key: item.key,
                      label: item.etiqueta,
                      value: item.venta,
                      display: moneda(
                        item.venta,
                      ),
                    }),
                  )}
                />
              </section>

              <section className="dark-panel quality-panel">
                <PanelTitle
                  eyebrow="CALIDAD COMERCIAL"
                  titulo="% devolución"
                  derecha={
                    totales.baseDevolucion ===
                    "FACTURA"
                      ? "Base factura · histórico"
                      : totales.baseDevolucion ===
                          "DESPACHO"
                        ? "Base despacho"
                        : "Sin base"
                  }
                />

                <div className="donut-area">
                  <Donut
                    value={
                      totales.porcentajeDevolucion ??
                      0
                    }
                  />
                  <div className="quality-copy">
                    <strong>
                      {porcentajeTexto(
                        totales.porcentajeDevolucion,
                      )}
                    </strong>
                    <small>
                      {numero(
                        totales.devueltas,
                      )}{" "}
                      unidades devueltas
                    </small>
                  </div>
                </div>
              </section>

              <section className="dark-panel ranking-panel">
                <PanelTitle
                  eyebrow="VENTAS"
                  titulo={`Ranking por ${
                    dimension === "CLIENTE"
                      ? "cliente"
                      : "SKU"
                  }`}
                  derecha={`${numero(
                    filasDimension.length,
                  )} registros`}
                />
                <HorizontalRanking
                  filas={topVentas}
                  tipo="VENTA"
                />
              </section>

              <section className="dark-panel ranking-panel">
                <PanelTitle
                  eyebrow="DEVOLUCIONES"
                  titulo={`Mayor % por ${
                    dimension === "CLIENTE"
                      ? "cliente"
                      : "SKU"
                  }`}
                  derecha="Top 8"
                />
                <HorizontalRanking
                  filas={topDevolucion}
                  tipo="DEVOLUCION"
                />
              </section>

              <section className="dark-panel trend-quality-panel">
                <PanelTitle
                  eyebrow="EVOLUCIÓN"
                  titulo="Devolución y Fill Rate"
                  derecha={
                    granularidad ===
                    "SEMANA"
                      ? "Semanal"
                      : "Mensual"
                  }
                />
                <QualityTimeline
                  items={buckets}
                />
              </section>
            </div>

            <section className="dark-panel summary-panel">
              <PanelTitle
                eyebrow="RESUMEN"
                titulo={`Comparativo por ${
                  dimension === "CLIENTE"
                    ? "cliente"
                    : "SKU"
                }`}
                derecha={`${numero(
                  filasDimension.length,
                )} filas`}
              />

              <div className="summary-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        {dimension === "CLIENTE"
                          ? "Cliente"
                          : "SKU"}
                      </th>
                      <th>Venta</th>
                      <th>Facturadas</th>
                      <th>Pedidas</th>
                      <th>Despachadas</th>
                      <th>Fill Rate</th>
                      <th>Devueltas</th>
                      <th>% devolución</th>
                      <th>Base %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasDimension.map(
                      (fila) => (
                        <tr
                          key={fila.key}
                          onClick={() => {
                            if (
                              dimension ===
                              "CLIENTE"
                            ) {
                              setClienteFiltro(
                                fila.key,
                              )
                            } else {
                              setSkuFiltro(
                                fila.key,
                              )
                            }
                          }}
                        >
                          <td>
                            <strong>
                              {fila.nombre}
                            </strong>
                            {fila.secundario && (
                              <small>
                                {
                                  fila.secundario
                                }
                              </small>
                            )}
                          </td>
                          <td>
                            <strong>
                              {moneda(
                                fila.venta,
                              )}
                            </strong>
                          </td>
                          <td>
                            {numero(
                              fila.facturadas,
                            )}
                          </td>
                          <td>
                            {numero(
                              fila.pedidas,
                            )}
                          </td>
                          <td>
                            {numero(
                              fila.despachadas,
                            )}
                          </td>
                          <td>
                            {porcentajeTexto(
                              fila.fillRate,
                            )}
                          </td>
                          <td>
                            {numero(
                              fila.devueltas,
                            )}
                          </td>
                          <td>
                            <strong>
                              {porcentajeTexto(
                                fila.porcentajeDevolucion,
                              )}
                            </strong>
                          </td>
                          <td>
                            <BaseBadge
                              base={
                                fila.baseDevolucion
                              }
                            />
                          </td>
                        </tr>
                      ),
                    )}

                    {!cargando &&
                      filasDimension.length ===
                        0 && (
                        <tr>
                          <td
                            colSpan={9}
                            className="empty-row"
                          >
                            No existen
                            movimientos para
                            los filtros
                            seleccionados.
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}

function FilterBox({
  titulo,
  value,
  onChange,
  options,
}: {
  titulo: string
  value: string
  onChange: (value: string) => void
  options: {
    value: string
    label: string
  }[]
}) {
  return (
    <section className="filter-box">
      <span>FILTRO</span>
      <h3>{titulo}</h3>
      <select
        value={value}
        onChange={(evento) =>
          onChange(evento.target.value)
        }
      >
        {options.map((opcion) => (
          <option
            key={opcion.value}
            value={opcion.value}
          >
            {opcion.label}
          </option>
        ))}
      </select>
    </section>
  )
}

function Kpi({
  titulo,
  valor,
  subtitulo,
  tone,
}: {
  titulo: string
  valor: string
  subtitulo: string
  tone:
    | "cyan"
    | "pink"
    | "green"
    | "blue"
    | "orange"
    | "magenta"
}) {
  return (
    <article className={`bi-kpi ${tone}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small>{subtitulo}</small>
    </article>
  )
}

function PanelTitle({
  eyebrow,
  titulo,
  derecha,
}: {
  eyebrow: string
  titulo: string
  derecha: string
}) {
  return (
    <header className="panel-title">
      <div>
        <span>{eyebrow}</span>
        <h2>{titulo}</h2>
      </div>
      <small>{derecha}</small>
    </header>
  )
}

function VerticalBars({
  items,
}: {
  items: {
    key: string
    label: string
    value: number
    display: string
  }[]
}) {
  const maximo = Math.max(
    1,
    ...items.map((item) => item.value),
  )

  if (items.length === 0) {
    return (
      <div className="chart-empty">
        Sin datos.
      </div>
    )
  }

  return (
    <div className="vertical-chart">
      {items.map((item) => {
        const altura =
          item.value <= 0
            ? 0
            : Math.max(
                4,
                (item.value / maximo) * 100,
              )

        return (
          <div
            key={item.key}
            className="vertical-column"
            title={`${item.label}: ${item.display}`}
          >
            <div className="bar-value">
              {item.value > 0
                ? item.display
                : ""}
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  height: `${altura}%`,
                }}
              />
            </div>
            <span>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function Donut({
  value,
}: {
  value: number
}) {
  const radio = 54
  const circunferencia =
    2 * Math.PI * radio
  const valorVisual = Math.min(
    100,
    Math.max(0, value),
  )
  const dash =
    (valorVisual / 100) *
    circunferencia

  return (
    <svg
      className="donut"
      viewBox="0 0 140 140"
      aria-label={`Tasa de devolución ${value.toFixed(
        1,
      )}%`}
    >
      <circle
        className="donut-track"
        cx="70"
        cy="70"
        r={radio}
      />
      <circle
        className="donut-value"
        cx="70"
        cy="70"
        r={radio}
        strokeDasharray={`${dash} ${
          circunferencia - dash
        }`}
      />
    </svg>
  )
}

function HorizontalRanking({
  filas,
  tipo,
}: {
  filas: FilaResumen[]
  tipo: "VENTA" | "DEVOLUCION"
}) {
  const maximo = Math.max(
    1,
    ...filas.map((fila) =>
      tipo === "VENTA"
        ? fila.venta
        : fila.porcentajeDevolucion ??
          0,
    ),
  )

  if (filas.length === 0) {
    return (
      <div className="chart-empty">
        Sin datos para este filtro.
      </div>
    )
  }

  return (
    <div className="horizontal-ranking">
      {filas.map((fila) => {
        const valor =
          tipo === "VENTA"
            ? fila.venta
            : fila.porcentajeDevolucion ??
              0
        const ancho =
          valor <= 0
            ? 0
            : Math.max(
                3,
                (valor / maximo) * 100,
              )

        return (
          <div
            key={fila.key}
            className="ranking-row"
          >
            <div className="ranking-label">
              <strong>{fila.nombre}</strong>
              <span>
                {tipo === "VENTA"
                  ? moneda(valor)
                  : `${valor.toFixed(
                      1,
                    )}%`}
              </span>
            </div>
            <div className="ranking-track">
              <div
                className="ranking-fill"
                style={{
                  width: `${ancho}%`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function QualityTimeline({
  items,
}: {
  items: BucketTendencia[]
}) {
  if (items.length === 0) {
    return (
      <div className="chart-empty">
        Sin datos.
      </div>
    )
  }

  return (
    <div className="quality-timeline">
      {items.map((item) => (
        <div
          key={item.key}
          className="quality-period"
        >
          <div className="quality-period-head">
            <strong>
              {item.etiqueta}
            </strong>
            <span>
              Dev.{" "}
              {porcentajeTexto(
                item.porcentajeDevolucion,
              )}
            </span>
          </div>

          <div className="metric-row">
            <small>Devolución</small>
            <div>
              <i
                className="metric-fill return"
                style={{
                  width: `${Math.min(
                    100,
                    item.porcentajeDevolucion ??
                      0,
                  )}%`,
                }}
              />
            </div>
            <b>
              {porcentajeTexto(
                item.porcentajeDevolucion,
              )}
            </b>
          </div>

          <div className="metric-row">
            <small>Fill Rate</small>
            <div>
              <i
                className="metric-fill fill"
                style={{
                  width: `${Math.min(
                    100,
                    item.fillRate ?? 0,
                  )}%`,
                }}
              />
            </div>
            <b>
              {porcentajeTexto(
                item.fillRate,
              )}
            </b>
          </div>
        </div>
      ))}
    </div>
  )
}

function BaseBadge({
  base,
}: {
  base:
    | "DESPACHO"
    | "FACTURA"
    | "SIN BASE"
}) {
  return (
    <span
      className={`base-badge ${base.toLowerCase().replace(
        " ",
        "-",
      )}`}
    >
      {base === "DESPACHO"
        ? "Despacho"
        : base === "FACTURA"
          ? "Factura"
          : "Sin base"}
    </span>
  )
}

const css = `
  .commercial-bi-page {
    width: 100%;
    max-width: none;
    box-sizing: border-box;
    margin: 0;
    padding: 12px 10px 46px;
    color: #463631;
    overflow-x: hidden;
  }

  .commercial-bi-page * {
    box-sizing: border-box;
  }

  .commercial-bi-controls {
    display: grid;
    grid-template-columns:
      minmax(290px, 1.35fr)
      minmax(150px, .68fr)
      minmax(150px, .68fr)
      minmax(120px, .55fr)
      minmax(120px, .55fr)
      auto;
    gap: 10px;
    align-items: end;
    margin-bottom: 16px;
    padding: 13px;
    border: 1px solid #e8ddd7;
    border-radius: 12px;
    background: #fffdfc;
    box-shadow: 0 7px 18px rgba(83, 50, 39, .04);
    overflow: visible;
  }

  .commercial-bi-controls > * {
    min-width: 0;
  }

  .period-switch label,
  .control-field label {
    display: block;
    margin-bottom: 6px;
    color: #8b746b;
    font-size: 7px;
    font-weight: 950;
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .period-switch > div {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    overflow: hidden;
    border: 1px solid #e0d4ce;
    border-radius: 8px;
    background: #f6f1ee;
  }

  .period-switch button {
    min-height: 40px;
    border: 0;
    border-right: 1px solid #e6dad4;
    background: transparent;
    color: #77635b;
    font-size: 8px;
    font-weight: 900;
    cursor: pointer;
  }

  .period-switch button:last-child {
    border-right: 0;
  }

  .period-switch button.active {
    background: white;
    color: #8F1D24;
    box-shadow: 0 2px 6px rgba(84, 48, 37, .1);
  }

  .control-field {
    min-width: 0;
  }

  .control-field input,
  .control-field select {
    width: 100%;
    height: 40px;
    padding: 0 10px;
    border: 1px solid #dfd3cd;
    border-radius: 8px;
    background: white;
    color: #4c3b35;
    font-size: 9px;
    font-weight: 800;
    outline: none;
  }

  .date-readonly strong {
    min-height: 40px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    border: 1px solid #e5dad5;
    border-radius: 8px;
    background: #faf7f5;
    color: #674f47;
    font-size: 9px;
  }

  .apply-button {
    min-height: 40px;
    padding: 0 15px;
    border: 0;
    border-radius: 8px;
    background: #9d2028;
    color: white;
    font-size: 9px;
    font-weight: 950;
    cursor: pointer;
  }

  .apply-button:disabled {
    opacity: .55;
    cursor: wait;
  }

  .commercial-bi-error {
    margin-bottom: 14px;
    padding: 11px 13px;
    border: 1px solid #efcdcd;
    border-left: 4px solid #bd3535;
    border-radius: 8px;
    background: #fff4f4;
    color: #952c2c;
    font-size: 9px;
    font-weight: 800;
  }

  .commercial-bi-dashboard {
    overflow: hidden;
    border: 1px solid #202b36;
    border-radius: 16px;
    background:
      radial-gradient(circle at 90% 4%, rgba(102, 0, 54, .28), transparent 32%),
      linear-gradient(145deg, #070d14, #0b121b 60%, #10151d);
    box-shadow: 0 18px 40px rgba(17, 27, 37, .14);
    color: white;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    padding: 18px 14px 15px;
  }

  .dashboard-header > div:first-child > span,
  .filter-box > span,
  .filter-note > span,
  .panel-title span {
    color: #19def2;
    font-size: 7px;
    font-weight: 950;
    letter-spacing: .11em;
  }

  .dashboard-header h1 {
    margin: 6px 0 4px;
    color: #ffffff !important;
    font-size: 25px;
    line-height: 1.05;
    letter-spacing: -.02em;
  }

  .dashboard-header p {
    margin: 0;
    color: #8ca1b2;
    font-size: 8px;
  }

  .activation-note {
    display: block;
    margin-top: 6px;
    color: #6f8da1;
    font-size: 7px;
    line-height: 1.4;
  }

  .dashboard-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .gross-margin-open {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid #38df8a;
    border-radius: 8px;
    background: #10271e;
    color: #5fff9b;
    font-size: 8px;
    font-weight: 950;
    cursor: pointer;
    white-space: nowrap;
  }

  .gross-margin-open:hover {
    background: #17372a;
  }

  .dimension-switch {
    display: flex;
    overflow: hidden;
    border: 1px solid #314153;
    border-radius: 8px;
  }

  .dimension-switch button,
  .reset-button {
    min-height: 36px;
    padding: 0 11px;
    border: 0;
    background: #101b27;
    color: #9fb1bf;
    font-size: 8px;
    font-weight: 900;
    cursor: pointer;
  }

  .dimension-switch button.active {
    background: #173244;
    color: #26e1f0;
  }

  .reset-button {
    border: 1px solid #385067;
    border-radius: 8px;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 185px minmax(0, 1fr);
    gap: 10px;
    padding: 0 14px 18px;
  }

  .dashboard-filters {
    display: grid;
    align-content: start;
    gap: 12px;
  }

  .filter-box,
  .filter-note {
    padding: 11px;
    border: 1px solid #273747;
    border-radius: 11px;
    background: rgba(13, 24, 35, .92);
  }

  .filter-box h3 {
    margin: 7px 0 8px;
    font-size: 11px;
  }

  .filter-box select {
    width: 100%;
    min-height: 40px;
    padding: 0 10px;
    border: 2px solid #18d6e9;
    border-radius: 7px;
    background: #113041;
    color: white;
    font-size: 8px;
    font-weight: 800;
    outline: none;
  }

  .filter-box select option {
    color: #222;
    background: white;
  }

  .filter-note p {
    margin: 8px 0 0;
    color: #8ea3b4;
    font-size: 8px;
    line-height: 1.55;
  }

  .detail-link {
    min-height: 38px;
    border: 1px solid #335064;
    border-radius: 8px;
    background: #0e1b27;
    color: #9fcddd;
    font-size: 8px;
    font-weight: 900;
    cursor: pointer;
  }

  .dashboard-main {
    min-width: 0;
  }

  .kpi-row {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 7px;
    margin-bottom: 10px;
  }

  .bi-kpi {
    position: relative;
    overflow: hidden;
    min-width: 0;
    padding: 13px 12px 12px;
    border: 1px solid #2d3c4d;
    border-radius: 9px;
    background: #0e1824;
  }

  .bi-kpi::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: var(--tone);
  }

  .bi-kpi.cyan { --tone: #16d6e7; }
  .bi-kpi.pink { --tone: #ff2b9c; }
  .bi-kpi.green { --tone: #32e777; }
  .bi-kpi.blue { --tone: #39b8ff; }
  .bi-kpi.orange { --tone: #ff9f32; }
  .bi-kpi.magenta { --tone: #ff187d; }

  .bi-kpi span {
    display: block;
    min-height: 19px;
    color: #86a0b3;
    font-size: 7px;
    font-weight: 950;
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  .bi-kpi strong {
    display: block;
    margin-top: 7px;
    color: white;
    font-size: clamp(13px, 1.2vw, 18px);
    line-height: 1.05;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .bi-kpi small {
    display: block;
    margin-top: 8px;
    color: #71879a;
    font-size: 7px;
    line-height: 1.35;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(220px, .45fr);
    gap: 8px;
  }

  .dark-panel {
    min-width: 0;
    border: 1px solid #263747;
    border-radius: 11px;
    background: rgba(12, 23, 34, .94);
  }

  .panel-title {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 14px 8px;
  }

  .panel-title h2 {
    margin: 6px 0 0;
    color: white;
    font-size: 12px;
  }

  .panel-title > small {
    color: #8196a7;
    font-size: 7px;
    white-space: nowrap;
  }

  .trend-panel {
    min-height: 290px;
  }

  .quality-panel {
    min-height: 290px;
  }

  .ranking-panel {
    min-height: 290px;
  }

  .trend-quality-panel {
    grid-column: 1 / -1;
  }

  .vertical-chart {
    width: 100%;
    height: 220px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(42px, 1fr));
    align-items: stretch;
    gap: 6px;
    padding: 8px 12px 14px;
  }

  .vertical-column {
    min-width: 0;
    width: 100%;
    display: grid;
    display: grid;
    grid-template-rows: 28px 1fr 24px;
    gap: 4px;
    align-items: end;
  }

  .bar-value {
    overflow: hidden;
    color: #7f9bad;
    font-size: 6px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-track {
    height: 100%;
    min-height: 80px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
    border-radius: 5px;
    background:
      repeating-linear-gradient(
        to top,
        rgba(255,255,255,.045) 0,
        rgba(255,255,255,.045) 1px,
        transparent 1px,
        transparent 25%
      );
  }

  .bar-fill {
    width: 100%;
    min-height: 0;
    border-radius: 4px 4px 0 0;
    background: linear-gradient(180deg, #18deed, #1689ab);
    box-shadow: 0 0 16px rgba(24, 222, 237, .18);
  }

  .vertical-column > span {
    overflow: hidden;
    color: #8399aa;
    font-size: 6px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .donut-area {
    min-height: 220px;
    display: grid;
    place-items: center;
    position: relative;
    padding: 4px 14px 18px;
  }

  .donut {
    width: 165px;
    height: 165px;
    transform: rotate(-90deg);
  }

  .donut-track,
  .donut-value {
    fill: none;
    stroke-width: 16;
  }

  .donut-track {
    stroke: #263645;
  }

  .donut-value {
    stroke: #ff278e;
    stroke-linecap: round;
  }

  .quality-copy {
    position: absolute;
    display: grid;
    place-items: center;
    gap: 5px;
  }

  .quality-copy strong {
    font-size: 28px;
  }

  .quality-copy small {
    color: #7891a4;
    font-size: 7px;
  }

  .horizontal-ranking {
    display: grid;
    gap: 11px;
    padding: 8px 14px 16px;
  }

  .ranking-row {
    display: grid;
    gap: 5px;
  }

  .ranking-label {
    min-width: 0;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .ranking-label strong {
    min-width: 0;
    overflow: hidden;
    color: #dbe8f0;
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ranking-label span {
    flex: 0 0 auto;
    color: #9db2c1;
    font-size: 7px;
  }

  .ranking-track {
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: #1c2a37;
  }

  .ranking-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #17d8e8, #ff268f);
  }

  .quality-timeline {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    padding: 8px 14px 15px;
  }

  .quality-period {
    padding: 9px;
    border: 1px solid #243646;
    border-radius: 8px;
    background: #0b1621;
  }

  .quality-period-head {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 8px;
  }

  .quality-period-head strong {
    color: #dbe8ef;
    font-size: 8px;
  }

  .quality-period-head span {
    color: #ff4a9e;
    font-size: 7px;
  }

  .metric-row {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) 37px;
    gap: 5px;
    align-items: center;
    margin-top: 6px;
  }

  .metric-row small {
    color: #7f96a8;
    font-size: 6px;
  }

  .metric-row > div {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: #1d2d3a;
  }

  .metric-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
  }

  .metric-fill.return {
    background: #ff268f;
  }

  .metric-fill.fill {
    background: #28d995;
  }

  .metric-row b {
    color: #bfd0dc;
    font-size: 6px;
    text-align: right;
  }

  .summary-panel {
    margin-top: 10px;
  }

  .summary-table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .summary-table-wrap table {
    width: 100%;
    min-width: 920px;
    border-collapse: collapse;
  }

  .summary-table-wrap th {
    padding: 9px 10px;
    border-top: 1px solid #203140;
    border-bottom: 1px solid #2a3a49;
    background: #0a141e;
    color: #71899b;
    font-size: 7px;
    text-align: left;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .summary-table-wrap td {
    padding: 9px 10px;
    border-bottom: 1px solid #1d2c39;
    color: #aec0cc;
    font-size: 8px;
  }

  .summary-table-wrap tbody tr {
    cursor: pointer;
  }

  .summary-table-wrap tbody tr:hover {
    background: #101f2b;
  }

  .summary-table-wrap td strong {
    color: #eef6fa;
  }

  .summary-table-wrap td small {
    display: block;
    margin-top: 2px;
    color: #6f8799;
    font-size: 6px;
  }

  .base-badge {
    display: inline-flex;
    padding: 3px 6px;
    border-radius: 999px;
    font-size: 6px;
    font-weight: 950;
  }

  .base-badge.despacho {
    background: #14382c;
    color: #48df9a;
  }

  .base-badge.factura {
    background: #3a2d16;
    color: #ffc45e;
  }

  .base-badge.sin-base {
    background: #26313a;
    color: #8294a1;
  }

  .chart-empty,
  .empty-row {
    padding: 30px 14px !important;
    color: #6e8698 !important;
    font-size: 8px !important;
    text-align: center !important;
  }

  @media (max-width: 1450px) {
    .commercial-bi-controls {
      grid-template-columns:
        minmax(260px, 1.4fr)
        minmax(140px, .7fr)
        minmax(140px, .7fr)
        minmax(105px, .55fr)
        minmax(105px, .55fr)
        auto;
    }

    .kpi-row {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 1180px) {
    .commercial-bi-controls {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .period-switch {
      grid-column: 1 / -1;
    }

    .dashboard-grid {
      grid-template-columns: 1fr;
    }

    .dashboard-filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .filter-note,
    .detail-link {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 760px) {
    .commercial-bi-page {
      padding: 10px 8px 82px;
    }

    .commercial-bi-controls {
      grid-template-columns: 1fr 1fr;
    }

    .period-switch,
    .apply-button {
      grid-column: 1 / -1;
    }

    .dashboard-header {
      flex-direction: column;
    }

    .dashboard-actions {
      width: 100%;
      align-items: stretch;
      flex-direction: column;
    }

    .dimension-switch {
      width: 100%;
    }

    .dimension-switch button {
      flex: 1;
    }

    .dashboard-grid {
      padding: 0 12px 14px;
    }

    .dashboard-filters {
      grid-template-columns: 1fr;
    }

    .filter-note,
    .detail-link {
      grid-column: auto;
    }

    .kpi-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .charts-grid {
      grid-template-columns: 1fr;
    }

    .trend-quality-panel {
      grid-column: auto;
    }

    .vertical-chart {
      min-width: 0;
      grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
    }

    .trend-panel {
      overflow-x: hidden;
    }
  }

  @media (max-width: 450px) {
    .commercial-bi-controls {
      grid-template-columns: 1fr;
    }

    .period-switch,
    .apply-button {
      grid-column: auto;
    }

    .period-switch > div {
      grid-template-columns: repeat(2, 1fr);
    }

    .kpi-row {
      grid-template-columns: 1fr;
    }
  }

  @media print {
    .commercial-bi-controls,
    .dashboard-actions,
    .dashboard-filters {
      display: none !important;
    }

    .commercial-bi-page {
      padding: 0;
    }

    .commercial-bi-dashboard {
      box-shadow: none;
    }

    .dashboard-grid {
      display: block;
    }
  }
`
