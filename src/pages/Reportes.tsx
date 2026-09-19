import { useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  obtenerDetallePedidoDb,
  obtenerPedidosDb,
  type DetallePedidoConsultaDb,
  type PedidoListadoDb,
} from "../repositories/pedidoRepository"
import {
  obtenerInventarioLotesDb,
  type InventarioLoteDb,
} from "../repositories/inventarioRepository"
import {
  obtenerHistorialProduccionesDb,
  type ProduccionResumenHistorialDb,
} from "../repositories/produccionRepository"
import {
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
  type DetalleDevolucionListadoDb,
} from "../repositories/devolucionRepository"
import {
  obtenerGastosClienteDetalleDb,
  type GastoClienteDetalleDb,
} from "../repositories/facturasRepository"
import {
  obtenerVentasSemanalesDb,
  type VentaSemanalDb,
} from "../repositories/ventasRepository"

type PedidoConDetalleReporte = {
  pedido: PedidoListadoDb
  detalles: DetallePedidoConsultaDb[]
}

type DevolucionDetalleReporte = {
  devolucion: DevolucionListadoDb
  detalle: DetalleDevolucionListadoDb
}

type PuntoSemana = {
  semanaInicio: string
  etiqueta: string
  pedidas: number
  solicitadasCerradas: number
  despachadas: number
  producidas: number
  devueltas: number
}

type PrecioClienteProducto = {
  cliente_id: string
  producto_id: string
  precio: number | null
}

type CostoReceta = {
  receta_codigo: string
  costo_materia_prima_unidad: number | null
  componentes_sin_costo: number
}

type PuntoComercial = {
  semanaInicio: string
  etiqueta: string
  despachadas: number
  devueltas: number
  tasaDevolucion: number
  ventasNetas: number | null
  gastosDirectos: number
  contribucion: number | null
  margen: number | null
  configuracionCompleta: boolean
}

function fechaActual() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function inicioMesActual() {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(
    fecha.getMonth() + 1,
  ).padStart(2, "0")}-01`
}

function fechaIsoLocal(fecha: Date) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function sumarDias(fechaIso: string, dias: number) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIsoLocal(fecha)
}

function inicioSemana(fechaIso: string) {
  if (!fechaIso) return ""

  const fecha = new Date(`${fechaIso}T12:00:00`)
  const dia = fecha.getDay()
  const diasDesdeLunes = dia === 0 ? 6 : dia - 1
  fecha.setDate(fecha.getDate() - diasDesdeLunes)
  return fechaIsoLocal(fecha)
}

function finSemana(fechaIso: string) {
  return sumarDias(inicioSemana(fechaIso), 6)
}

function numeroSemanaIso(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  const fechaUtc = new Date(
    Date.UTC(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
    ),
  )

  const dia = fechaUtc.getUTCDay() || 7
  fechaUtc.setUTCDate(fechaUtc.getUTCDate() + 4 - dia)

  const inicioAnio = new Date(
    Date.UTC(fechaUtc.getUTCFullYear(), 0, 1),
  )

  return Math.ceil(
    ((fechaUtc.getTime() - inicioAnio.getTime()) /
      86400000 +
      1) /
      7,
  )
}

function fechaCorta(fechaIso: string) {
  if (!fechaIso) return ""
  const [, mes, dia] = fechaIso.split("-")
  return `${dia}/${mes}`
}

function etiquetaSemana(semanaInicio: string) {
  if (!semanaInicio) return "—"
  const fin = sumarDias(semanaInicio, 6)
  return `S${numeroSemanaIso(semanaInicio)} · ${fechaCorta(
    semanaInicio,
  )}–${fechaCorta(fin)}`
}

function semanasEntre(desde: string, hasta: string) {
  if (!desde || !hasta || desde > hasta) return []

  const inicio = inicioSemana(desde)
  const ultima = inicioSemana(hasta)
  const semanas: string[] = []
  let actual = inicio

  while (actual <= ultima) {
    semanas.push(actual)
    actual = sumarDias(actual, 7)
  }

  return semanas
}

function porcentaje(numerador: number, denominador: number) {
  return denominador > 0
    ? ((numerador / denominador) * 100).toFixed(1)
    : "0.0"
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor || 0)
}

function etiquetaEjeSemana(fechaIso: string) {
  return `Sem. ${String(numeroSemanaIso(fechaIso)).padStart(2, "0")}`
}

function numero(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    maximumFractionDigits: 3,
  }).format(valor || 0)
}

export default function Reportes({
  cambiarPantalla,
}: {
  cambiarPantalla: (pantalla: string) => void
}) {
  const [fechaDesde, setFechaDesde] = useState(
    inicioMesActual(),
  )
  const [fechaHasta, setFechaHasta] = useState(
    fechaActual(),
  )

  const [pedidos, setPedidos] = useState<
    PedidoListadoDb[]
  >([])
  const [inventario, setInventario] = useState<
    InventarioLoteDb[]
  >([])
  const [producciones, setProducciones] = useState<
    ProduccionResumenHistorialDb[]
  >([])
  const [devoluciones, setDevoluciones] = useState<
    DevolucionListadoDb[]
  >([])
  const [precios, setPrecios] = useState<
    PrecioClienteProducto[]
  >([])
  const [costosReceta, setCostosReceta] = useState<
    CostoReceta[]
  >([])
  const [gastosCliente, setGastosCliente] = useState<
    GastoClienteDetalleDb[]
  >([])
  const [ventasFacturadas, setVentasFacturadas] = useState<
    VentaSemanalDb[]
  >([])
  const [avisoRentabilidad, setAvisoRentabilidad] =
    useState("")

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  const [pedidosConDetalle, setPedidosConDetalle] =
    useState<PedidoConDetalleReporte[]>([])
  const [cargandoDetalles, setCargandoDetalles] =
    useState(false)

  const [clienteSeleccionadoId, setClienteSeleccionadoId] =
    useState("TODOS")
  const [skuGraficoId, setSkuGraficoId] =
    useState("TODOS")

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")

    try {
      const [
        pedidosDb,
        inventarioDb,
        produccionesDb,
        devolucionesDb,
        preciosRes,
        costosRes,
        gastosClienteDb,
        ventasFacturadasDb,
      ] = await Promise.all([
        obtenerPedidosDb(),
        obtenerInventarioLotesDb(),
        obtenerHistorialProduccionesDb(),
        obtenerDevolucionesDb(),
        supabase
          .from("cliente_productos")
          .select("cliente_id, producto_id, precio")
          .eq("activo", true),
        supabase
          .from("bi_vw_recetas_costo_actual")
          .select(
            "receta_codigo, costo_materia_prima_unidad, componentes_sin_costo",
          ),
        obtenerGastosClienteDetalleDb(),
        obtenerVentasSemanalesDb(),
      ])

      setPedidos(pedidosDb)
      setInventario(inventarioDb)
      setProducciones(produccionesDb)
      setDevoluciones(devolucionesDb)
      setPrecios(
        (preciosRes.data ?? []) as PrecioClienteProducto[],
      )
      setCostosReceta(
        (costosRes.data ?? []) as CostoReceta[],
      )
      setGastosCliente(gastosClienteDb)
      setVentasFacturadas(ventasFacturadasDb)

      const avisos: string[] = []
      if (preciosRes.error) avisos.push("precios por cliente")
      if (costosRes.error) avisos.push("costos de recetas")
      setAvisoRentabilidad(
        avisos.length > 0
          ? `No se pudieron consultar: ${avisos.join(" y ")}.`
          : "",
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los datos del reporte.",
      )
    } finally {
      setCargando(false)
    }
  }

  const rangoSemanalDesde = useMemo(
    () => inicioSemana(fechaDesde),
    [fechaDesde],
  )

  const rangoSemanalHasta = useMemo(
    () => finSemana(fechaHasta),
    [fechaHasta],
  )

  const semanasPeriodo = useMemo(
    () => semanasEntre(fechaDesde, fechaHasta),
    [fechaDesde, fechaHasta],
  )

  const ventasFacturadasPeriodo = useMemo(
    () =>
      ventasFacturadas.filter(
        (venta) =>
          venta.semana_inicio >= rangoSemanalDesde &&
          venta.semana_inicio <= inicioSemana(rangoSemanalHasta),
      ),
    [ventasFacturadas, rangoSemanalDesde, rangoSemanalHasta],
  )

  const totalFacturacionImportada = useMemo(
    () =>
      ventasFacturadasPeriodo.reduce(
        (total, venta) =>
          total + Number(venta.venta_sin_impuestos ?? 0),
        0,
      ),
    [ventasFacturadasPeriodo],
  )

  const totalUnidadesFacturadas = useMemo(
    () =>
      ventasFacturadasPeriodo.reduce(
        (total, venta) =>
          total + Number(venta.unidades ?? 0),
        0,
      ),
    [ventasFacturadasPeriodo],
  )

  const pedidosPeriodo = useMemo(
    () =>
      pedidos.filter(
        (pedido) =>
          pedido.fecha_entrega >= rangoSemanalDesde &&
          pedido.fecha_entrega <= rangoSemanalHasta,
      ),
    [pedidos, rangoSemanalDesde, rangoSemanalHasta],
  )

  useEffect(() => {
    let cancelado = false

    async function cargarDetallesPeriodo() {
      if (pedidosPeriodo.length === 0) {
        setPedidosConDetalle([])
        setCargandoDetalles(false)
        return
      }

      setCargandoDetalles(true)

      try {
        const resultado = await Promise.all(
          pedidosPeriodo.map(async (pedido) => ({
            pedido,
            detalles: await obtenerDetallePedidoDb(
              pedido.id,
            ),
          })),
        )

        if (!cancelado) {
          setPedidosConDetalle(resultado)
        }
      } catch (err) {
        if (!cancelado) {
          setPedidosConDetalle([])
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el detalle de pedidos.",
          )
        }
      } finally {
        if (!cancelado) {
          setCargandoDetalles(false)
        }
      }
    }

    cargarDetallesPeriodo()

    return () => {
      cancelado = true
    }
  }, [pedidosPeriodo])

  const produccionesPeriodo = useMemo(
    () =>
      producciones.filter(
        (produccion) =>
          produccion.estado === "REGISTRADA" &&
          produccion.fecha_produccion_general >=
            rangoSemanalDesde &&
          produccion.fecha_produccion_general <=
            rangoSemanalHasta,
      ),
    [
      producciones,
      rangoSemanalDesde,
      rangoSemanalHasta,
    ],
  )

  const pedidosDespachadosConDetalle = useMemo(
    () =>
      pedidosConDetalle.filter(
        ({ pedido }) => pedido.estado === "DESPACHADO",
      ),
    [pedidosConDetalle],
  )

  const detallesDevoluciones = useMemo<
    DevolucionDetalleReporte[]
  >(
    () =>
      devoluciones.flatMap((devolucion) =>
        (devolucion.detalles ?? []).map((detalle) => ({
          devolucion,
          detalle,
        })),
      ),
    [devoluciones],
  )

  const detallesDevolucionesAtribuidasPeriodo = useMemo(
    () => {
      const primeraSemana = semanasPeriodo[0] ?? ""
      const ultimaSemana =
        semanasPeriodo[semanasPeriodo.length - 1] ?? ""

      if (!primeraSemana || !ultimaSemana) return []

      return detallesDevoluciones.filter(
        ({ detalle }) =>
          detalle.semana_origen_inicio >= primeraSemana &&
          detalle.semana_origen_inicio <= ultimaSemana,
      )
    }, [detallesDevoluciones, semanasPeriodo],
  )

  const devolucionesRecibidasPeriodo = useMemo(
    () =>
      devoluciones.filter(
        (devolucion) =>
          devolucion.fecha_devolucion >= rangoSemanalDesde &&
          devolucion.fecha_devolucion <= rangoSemanalHasta,
      ),
    [
      devoluciones,
      rangoSemanalDesde,
      rangoSemanalHasta,
    ],
  )

  const unidadesPedidas = pedidosPeriodo.reduce(
    (total, pedido) =>
      total + Number(pedido.total_unidades ?? 0),
    0,
  )

  const unidadesSolicitadasDespachos =
    pedidosDespachadosConDetalle.reduce(
      (total, { detalles }) =>
        total +
        detalles.reduce(
          (subtotal, detalle) =>
            subtotal + Number(detalle.total_unidades ?? 0),
          0,
        ),
      0,
    )

  const unidadesDespachadas =
    pedidosDespachadosConDetalle.reduce(
      (total, { detalles }) =>
        total +
        detalles.reduce(
          (subtotal, detalle) =>
            subtotal +
            Number(detalle.unidades_despachadas ?? 0),
          0,
        ),
      0,
    )

  const unidadesProducidas = produccionesPeriodo.reduce(
    (total, produccion) =>
      total + Number(produccion.total_unidades ?? 0),
    0,
  )

  const paradasProducidas = produccionesPeriodo.reduce(
    (total, produccion) =>
      total + Number(produccion.total_paradas ?? 0),
    0,
  )

  const ordenesMicros = produccionesPeriodo.reduce(
    (total, produccion) =>
      total + Number(produccion.ordenes_micro ?? 0),
    0,
  )

  const kgMicrosProducidos = produccionesPeriodo.reduce(
    (total, produccion) =>
      total + Number(produccion.total_kg_micro ?? 0),
    0,
  )

  const unidadesDevueltasAtribuidas =
    detallesDevolucionesAtribuidasPeriodo.reduce(
      (total, { detalle }) =>
        total + Number(detalle.unidades ?? 0),
      0,
    )

  const unidadesDevueltasRecibidas =
    devolucionesRecibidasPeriodo.reduce(
      (total, devolucion) =>
        total +
        (devolucion.detalles ?? []).reduce(
          (subtotal, detalle) =>
            subtotal + Number(detalle.unidades ?? 0),
          0,
        ),
      0,
    )

  const valorDevueltoAtribuido =
    detallesDevolucionesAtribuidasPeriodo.reduce(
      (total, { detalle }) =>
        total + Number(detalle.valor_total_documento ?? 0),
      0,
    )

  const valorDevueltoRecibido =
    devolucionesRecibidasPeriodo.reduce(
      (total, devolucion) =>
        total + Number(devolucion.valor_total_documento ?? 0),
      0,
    )

  const fillRate = porcentaje(
    unidadesDespachadas,
    unidadesSolicitadasDespachos,
  )

  const porcentajeDevolucion = porcentaje(
    unidadesDevueltasAtribuidas,
    unidadesDespachadas,
  )

  const inventarioActivo = inventario.filter(
    (registro) => Number(registro.cantidad) > 0,
  )

  const inventarioTotal = inventarioActivo.reduce(
    (total, registro) =>
      total + Number(registro.cantidad ?? 0),
    0,
  )

  const comportamientoSemanal = useMemo<PuntoSemana[]>(
    () => {
      const mapa = new Map<string, PuntoSemana>()

      semanasPeriodo.forEach((semanaInicio) => {
        mapa.set(semanaInicio, {
          semanaInicio,
          etiqueta: etiquetaSemana(semanaInicio),
          pedidas: 0,
          solicitadasCerradas: 0,
          despachadas: 0,
          producidas: 0,
          devueltas: 0,
        })
      })

      pedidosConDetalle.forEach(({ pedido, detalles }) => {
        const semana = inicioSemana(pedido.fecha_entrega)
        const punto = mapa.get(semana)
        if (!punto) return

        detalles.forEach((detalle) => {
          punto.pedidas += Number(
            detalle.total_unidades ?? 0,
          )

          if (pedido.estado === "DESPACHADO") {
            punto.solicitadasCerradas += Number(
              detalle.total_unidades ?? 0,
            )
            punto.despachadas += Number(
              detalle.unidades_despachadas ?? 0,
            )
          }
        })
      })

      produccionesPeriodo.forEach((produccion) => {
        const semana = inicioSemana(
          produccion.fecha_produccion_general,
        )
        const punto = mapa.get(semana)
        if (!punto) return

        punto.producidas += Number(
          produccion.total_unidades ?? 0,
        )
      })

      detallesDevolucionesAtribuidasPeriodo.forEach(
        ({ detalle }) => {
          const punto = mapa.get(
            detalle.semana_origen_inicio,
          )
          if (!punto) return

          punto.devueltas += Number(
            detalle.unidades ?? 0,
          )
        },
      )

      return Array.from(mapa.values())
    },
    [
      semanasPeriodo,
      pedidosConDetalle,
      produccionesPeriodo,
      detallesDevolucionesAtribuidasPeriodo,
    ],
  )

  const clientesSku = useMemo(() => {
    const mapa = new Map<
      string,
      { id: string; nombre: string }
    >()

    pedidosPeriodo.forEach((pedido) => {
      if (!pedido.cliente?.id) return
      mapa.set(pedido.cliente.id, {
        id: pedido.cliente.id,
        nombre: pedido.cliente.nombre,
      })
    })

    detallesDevolucionesAtribuidasPeriodo.forEach(
      ({ devolucion }) => {
        if (!devolucion.cliente?.id) return
        mapa.set(devolucion.cliente.id, {
          id: devolucion.cliente.id,
          nombre: devolucion.cliente.nombre,
        })
      },
    )

    return Array.from(mapa.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    )
  }, [
    pedidosPeriodo,
    detallesDevolucionesAtribuidasPeriodo,
  ])

  useEffect(() => {
    if (clienteSeleccionadoId === "TODOS") return

    const disponible = clientesSku.some(
      (cliente) => cliente.id === clienteSeleccionadoId,
    )

    if (!disponible) {
      setClienteSeleccionadoId("TODOS")
      setSkuGraficoId("TODOS")
    }
  }, [clientesSku, clienteSeleccionadoId])

  const pedidosCliente = useMemo(
    () =>
      clienteSeleccionadoId === "TODOS"
        ? pedidosConDetalle
        : pedidosConDetalle.filter(
            ({ pedido }) =>
              pedido.cliente?.id === clienteSeleccionadoId,
          ),
    [pedidosConDetalle, clienteSeleccionadoId],
  )

  const devolucionesCliente = useMemo(
    () =>
      clienteSeleccionadoId === "TODOS"
        ? detallesDevolucionesAtribuidasPeriodo
        : detallesDevolucionesAtribuidasPeriodo.filter(
            ({ devolucion }) =>
              devolucion.cliente?.id ===
              clienteSeleccionadoId,
          ),
    [
      detallesDevolucionesAtribuidasPeriodo,
      clienteSeleccionadoId,
    ],
  )

  const resumenSkuCliente = useMemo(() => {
    const mapa = new Map<
      string,
      {
        productoId: string
        codigo: string
        corto: string
        nombre: string
        pedidas: number
        solicitadasCerradas: number
        despachadas: number
        devueltas: number
      }
    >()

    pedidosCliente.forEach(({ pedido, detalles }) => {
      detalles.forEach((detalle) => {
        const producto = detalle.producto
        if (!producto) return

        const existente = mapa.get(detalle.producto_id)
        const pedidas = Number(detalle.total_unidades ?? 0)
        const solicitadasCerradas =
          pedido.estado === "DESPACHADO" ? pedidas : 0
        const despachadas =
          pedido.estado === "DESPACHADO"
            ? Number(detalle.unidades_despachadas ?? 0)
            : 0

        if (existente) {
          existente.pedidas += pedidas
          existente.solicitadasCerradas +=
            solicitadasCerradas
          existente.despachadas += despachadas
          return
        }

        mapa.set(detalle.producto_id, {
          productoId: detalle.producto_id,
          codigo: producto.codigo,
          corto: producto.corto,
          nombre: producto.nombre,
          pedidas,
          solicitadasCerradas,
          despachadas,
          devueltas: 0,
        })
      })
    })

    devolucionesCliente.forEach(({ detalle }) => {
      const producto = detalle.producto
      if (!producto) return

      const existente = mapa.get(detalle.producto_id)
      const devueltas = Number(detalle.unidades ?? 0)

      if (existente) {
        existente.devueltas += devueltas
        return
      }

      mapa.set(detalle.producto_id, {
        productoId: detalle.producto_id,
        codigo: producto.codigo,
        corto: producto.corto,
        nombre: producto.nombre,
        pedidas: 0,
        solicitadasCerradas: 0,
        despachadas: 0,
        devueltas,
      })
    })

    return Array.from(mapa.values())
      .map((registro) => ({
        ...registro,
        fillRate: porcentaje(
          registro.despachadas,
          registro.solicitadasCerradas,
        ),
        porcentajeDevolucion: porcentaje(
          registro.devueltas,
          registro.despachadas,
        ),
      }))
      .sort((a, b) => b.pedidas - a.pedidas)
  }, [pedidosCliente, devolucionesCliente])

  const clienteSeleccionado =
    clienteSeleccionadoId === "TODOS"
      ? { id: "TODOS", nombre: "TODOS LOS CLIENTES" }
      : clientesSku.find(
          (cliente) =>
            cliente.id === clienteSeleccionadoId,
        ) ?? null

  const skuGrafico =
    resumenSkuCliente.find(
      (sku) => sku.productoId === skuGraficoId,
    ) ?? null

  const evolucionClienteSku = useMemo<PuntoSemana[]>(
    () => {
      const mapa = new Map<string, PuntoSemana>()

      semanasPeriodo.forEach((semanaInicio) => {
        mapa.set(semanaInicio, {
          semanaInicio,
          etiqueta: etiquetaSemana(semanaInicio),
          pedidas: 0,
          solicitadasCerradas: 0,
          despachadas: 0,
          producidas: 0,
          devueltas: 0,
        })
      })

      pedidosCliente.forEach(({ pedido, detalles }) => {
        const punto = mapa.get(
          inicioSemana(pedido.fecha_entrega),
        )
        if (!punto) return

        detalles.forEach((detalle) => {
          if (
            skuGraficoId !== "TODOS" &&
            detalle.producto_id !== skuGraficoId
          ) {
            return
          }

          punto.pedidas += Number(
            detalle.total_unidades ?? 0,
          )

          if (pedido.estado === "DESPACHADO") {
            punto.solicitadasCerradas += Number(
              detalle.total_unidades ?? 0,
            )
            punto.despachadas += Number(
              detalle.unidades_despachadas ?? 0,
            )
          }
        })
      })

      devolucionesCliente.forEach(({ detalle }) => {
        if (
          skuGraficoId !== "TODOS" &&
          detalle.producto_id !== skuGraficoId
        ) {
          return
        }

        const punto = mapa.get(
          detalle.semana_origen_inicio,
        )
        if (!punto) return

        punto.devueltas += Number(
          detalle.unidades ?? 0,
        )
      })

      return Array.from(mapa.values())
    }, [
      semanasPeriodo,
      pedidosCliente,
      devolucionesCliente,
      skuGraficoId,
    ],
  )

  const comportamientoComercial = useMemo<PuntoComercial[]>(
    () => {
      type PuntoAcumulado = {
        semanaInicio: string
        etiqueta: string
        despachadas: number
        devueltas: number
        ventasNetas: number
        gastosDirectos: number
        contribucion: number
        configuracionCompleta: boolean
        movimientos: number
      }

      const mapa = new Map<string, PuntoAcumulado>()
      semanasPeriodo.forEach((semanaInicio) => {
        mapa.set(semanaInicio, {
          semanaInicio,
          etiqueta: etiquetaSemana(semanaInicio),
          despachadas: 0,
          devueltas: 0,
          ventasNetas: 0,
          gastosDirectos: 0,
          contribucion: 0,
          configuracionCompleta: true,
          movimientos: 0,
        })
      })

      const preciosMapa = new Map(
        precios.map((registro) => [
          `${registro.cliente_id}|${registro.producto_id}`,
          registro.precio === null
            ? null
            : Number(registro.precio),
        ]),
      )
      const costosMapa = new Map(
        costosReceta.map((registro) => [
          registro.receta_codigo.trim().toUpperCase(),
          registro,
        ]),
      )

      ventasFacturadasPeriodo.forEach((venta) => {
        if (
          (clienteSeleccionadoId !== "TODOS" &&
            venta.cliente_id !== clienteSeleccionadoId) ||
          (skuGraficoId !== "TODOS" &&
            venta.producto_id !== skuGraficoId)
        ) {
          return
        }

        const punto = mapa.get(venta.semana_inicio)
        if (!punto) return

        const valor = Number(venta.venta_sin_impuestos ?? 0)
        punto.ventasNetas += valor
        punto.contribucion += valor
      })

      pedidosCliente.forEach(({ pedido, detalles }) => {
        if (pedido.estado !== "DESPACHADO") return
        const clienteId = pedido.cliente?.id
        if (!clienteId) return

        const punto = mapa.get(
          inicioSemana(pedido.fecha_entrega),
        )
        if (!punto) return

        detalles.forEach((detalle) => {
          if (
            (skuGraficoId !== "TODOS" &&
              detalle.producto_id !== skuGraficoId) ||
            !detalle.producto
          ) return

          const unidades = Number(
            detalle.unidades_despachadas ?? 0,
          )
          if (unidades <= 0) return

          punto.movimientos += 1
          punto.despachadas += unidades

          const costo = costosMapa.get(
            detalle.producto.codigo.trim().toUpperCase(),
          )
          const costoUnitario =
            costo?.costo_materia_prima_unidad == null
              ? null
              : Number(costo.costo_materia_prima_unidad)
          const completo =
            costoUnitario != null &&
            Number(costo?.componentes_sin_costo ?? 0) === 0

          if (!completo) {
            punto.configuracionCompleta = false
            return
          }

          punto.contribucion -= unidades * costoUnitario
        })
      })

      devolucionesCliente.forEach(({ devolucion, detalle }) => {
        if (
          (skuGraficoId !== "TODOS" &&
            detalle.producto_id !== skuGraficoId) ||
          !devolucion.cliente?.id
        ) return

        const punto = mapa.get(
          detalle.semana_origen_inicio,
        )
        if (!punto) return

        const unidades = Number(detalle.unidades ?? 0)
        if (unidades <= 0) return

        punto.movimientos += 1
        punto.devueltas += unidades

        const precio = preciosMapa.get(
          `${devolucion.cliente.id}|${detalle.producto_id}`,
        )
        if (precio == null) {
          punto.configuracionCompleta = false
          return
        }

        const valorDevolucion = unidades * precio
        punto.ventasNetas -= valorDevolucion
        punto.contribucion -= valorDevolucion
      })

      if (skuGraficoId === "TODOS") {
        gastosCliente.forEach((gasto) => {
          if (
            gasto.fecha_emision < rangoSemanalDesde ||
            gasto.fecha_emision > rangoSemanalHasta ||
            (clienteSeleccionadoId !== "TODOS" &&
              gasto.cliente_id !== clienteSeleccionadoId)
          ) return

          const punto = mapa.get(inicioSemana(gasto.fecha_emision))
          if (!punto) return

          const valor = Number(gasto.gasto_sin_iva ?? 0)
          punto.gastosDirectos += valor
          punto.contribucion -= valor
        })
      }

      return Array.from(mapa.values()).map((punto) => {
        const completo =
          punto.movimientos === 0 ||
          punto.configuracionCompleta
        const ventasNetas = completo ? punto.ventasNetas : null
        const contribucion = completo
          ? punto.contribucion
          : null
        const margen =
          contribucion !== null &&
          ventasNetas !== null &&
          ventasNetas > 0
            ? (contribucion / ventasNetas) * 100
            : completo
              ? 0
              : null

        return {
          semanaInicio: punto.semanaInicio,
          etiqueta: punto.etiqueta,
          despachadas: punto.despachadas,
          devueltas: punto.devueltas,
          tasaDevolucion:
            punto.despachadas > 0
              ? (punto.devueltas / punto.despachadas) * 100
              : 0,
          ventasNetas,
          gastosDirectos: punto.gastosDirectos,
          contribucion,
          margen,
          configuracionCompleta: completo,
        }
      })
    },
    [
      semanasPeriodo,
      pedidosCliente,
      devolucionesCliente,
      skuGraficoId,
      precios,
      costosReceta,
      gastosCliente,
      ventasFacturadasPeriodo,
      rangoSemanalDesde,
      rangoSemanalHasta,
      clienteSeleccionadoId,
    ],
  )

  const ultimaSemanaComercial =
    comportamientoComercial[
      comportamientoComercial.length - 1
    ] ?? null
  const semanaComercialAnterior =
    comportamientoComercial[
      comportamientoComercial.length - 2
    ] ?? null

  const totalesSkuCliente = useMemo(
    () =>
      resumenSkuCliente.reduce(
        (total, sku) => ({
          pedidas: total.pedidas + sku.pedidas,
          solicitadasCerradas:
            total.solicitadasCerradas +
            sku.solicitadasCerradas,
          despachadas:
            total.despachadas + sku.despachadas,
          devueltas: total.devueltas + sku.devueltas,
        }),
        {
          pedidas: 0,
          solicitadasCerradas: 0,
          despachadas: 0,
          devueltas: 0,
        },
      ),
    [resumenSkuCliente],
  )

  const clientesResumen = useMemo(() => {
    const resumen = new Map<
      string,
      {
        id: string
        cliente: string
        despachos: number
        unidades: number
        devueltas: number
        ventasNetas: number
        contribucionBase: number
        gastosDirectos: number
        configuracionCompleta: boolean
      }
    >()

    const preciosMapa = new Map(
      precios.map((registro) => [
        `${registro.cliente_id}|${registro.producto_id}`,
        registro.precio === null ? null : Number(registro.precio),
      ]),
    )
    const costosMapa = new Map(
      costosReceta.map((registro) => [
        registro.receta_codigo.trim().toUpperCase(),
        registro,
      ]),
    )

    const obtenerRegistro = (id: string, cliente: string) => {
      const existente = resumen.get(id)
      if (existente) return existente
      const nuevo = {
        id,
        cliente,
        despachos: 0,
        unidades: 0,
        devueltas: 0,
        ventasNetas: 0,
        contribucionBase: 0,
        gastosDirectos: 0,
        configuracionCompleta: true,
      }
      resumen.set(id, nuevo)
      return nuevo
    }

    ventasFacturadasPeriodo.forEach((venta) => {
      const id =
        venta.cliente_id ??
        `SIN_ID:${venta.cliente_nombre}`
      const registro = obtenerRegistro(
        id,
        venta.cliente_nombre || "No registrado",
      )
      const valor = Number(venta.venta_sin_impuestos ?? 0)
      registro.ventasNetas += valor
      registro.contribucionBase += valor
    })

    pedidosDespachadosConDetalle.forEach(
      ({ pedido, detalles }) => {
        const id = pedido.cliente?.id ?? "SIN_CLIENTE"
        const nombre =
          pedido.cliente?.nombre ?? "No registrado"
        const registro = obtenerRegistro(id, nombre)
        registro.despachos += 1

        detalles.forEach((detalle) => {
          const unidades = Number(detalle.unidades_despachadas ?? 0)
          registro.unidades += unidades
          if (!detalle.producto || id === "SIN_CLIENTE") {
            registro.configuracionCompleta = false
            return
          }

          const costo = costosMapa.get(
            detalle.producto.codigo.trim().toUpperCase(),
          )
          const costoUnitario =
            costo?.costo_materia_prima_unidad == null
              ? null
              : Number(costo.costo_materia_prima_unidad)
          if (
            costoUnitario == null ||
            Number(costo?.componentes_sin_costo ?? 0) > 0
          ) {
            registro.configuracionCompleta = false
            return
          }

          registro.contribucionBase -= unidades * costoUnitario
        })
      },
    )

    detallesDevolucionesAtribuidasPeriodo.forEach(
      ({ devolucion, detalle }) => {
        const id =
          devolucion.cliente?.id ?? "SIN_CLIENTE"
        const nombre =
          devolucion.cliente?.nombre ?? "No registrado"
        const registro = obtenerRegistro(id, nombre)
        const unidades = Number(detalle.unidades ?? 0)
        registro.devueltas += unidades
        const precio = preciosMapa.get(`${id}|${detalle.producto_id}`)
        if (precio == null) {
          registro.configuracionCompleta = false
          return
        }
        registro.ventasNetas -= unidades * precio
        registro.contribucionBase -= unidades * precio
      },
    )

    gastosCliente.forEach((gasto) => {
      if (
        gasto.fecha_emision < rangoSemanalDesde ||
        gasto.fecha_emision > rangoSemanalHasta
      ) return
      const registro = obtenerRegistro(
        gasto.cliente_id,
        gasto.cliente_nombre,
      )
      registro.gastosDirectos += Number(gasto.gasto_sin_iva ?? 0)
    })

    return Array.from(resumen.values())
      .map((registro) => {
        const ventasNetas = registro.configuracionCompleta
          ? registro.ventasNetas
          : null
        const contribucion = registro.configuracionCompleta
          ? registro.contribucionBase - registro.gastosDirectos
          : null
        return {
          ...registro,
          ventasNetas,
          contribucion,
          margen:
            contribucion !== null &&
            ventasNetas !== null &&
            ventasNetas > 0
              ? (contribucion / ventasNetas) * 100
              : null,
          porcentajeDevolucion: porcentaje(
            registro.devueltas,
            registro.unidades,
          ),
        }
      })
      .sort((a, b) => b.unidades - a.unidades)
  }, [
    pedidosDespachadosConDetalle,
    detallesDevolucionesAtribuidasPeriodo,
    ventasFacturadasPeriodo,
    precios,
    costosReceta,
    gastosCliente,
    rangoSemanalDesde,
    rangoSemanalHasta,
  ])

  const devolucionesPorMotivo = useMemo(() => {
    const resumen: Record<string, number> = {}

    detallesDevolucionesAtribuidasPeriodo.forEach(
      ({ detalle }) => {
        resumen[detalle.motivo] =
          (resumen[detalle.motivo] ?? 0) +
          Number(detalle.unidades ?? 0)
      },
    )

    return Object.entries(resumen)
      .map(([motivo, unidades]) => ({ motivo, unidades }))
      .sort((a, b) => b.unidades - a.unidades)
  }, [detallesDevolucionesAtribuidasPeriodo])

  function exportarSkuClienteCsv() {
    if (!clienteSeleccionado) return

    const filas = [
      [
        "Cliente",
        "SKU",
        "Código",
        "Unidades pedidas",
        "Unidades despachadas",
        "Fill Rate",
        "Unidades devueltas atribuidas",
        "% devolución",
      ],
      ...resumenSkuCliente.map((sku) => [
        clienteSeleccionado.nombre,
        sku.corto,
        sku.codigo,
        sku.pedidas,
        sku.despachadas,
        `${sku.fillRate}%`,
        sku.devueltas,
        `${sku.porcentajeDevolucion}%`,
      ]),
    ]

    descargarCsv(
      filas,
      `sku-cliente-${clienteSeleccionado.nombre
        .toLowerCase()
        .replaceAll(" ", "-")}-${fechaDesde}-${fechaHasta}.csv`,
    )
  }

  function exportarCsv() {
    const filas: Array<Array<string | number>> = [
      [
        "Periodo solicitado",
        `${fechaDesde} a ${fechaHasta}`,
      ],
      [
        "Semanas completas analizadas",
        `${rangoSemanalDesde} a ${rangoSemanalHasta}`,
      ],
      [],
      [
        "Pedidos",
        "Unidades pedidas",
        "Unidades solicitadas cerradas",
        "Unidades despachadas",
        "Fill Rate",
        "Unidades producidas",
        "Paradas producidas",
        "Órdenes de micros",
        "Kg de micros producidos",
        "Devoluciones atribuidas",
        "Devoluciones recibidas",
        "Valor devoluciones atribuidas",
        "Valor devoluciones recibidas",
        "% devolución atribuida",
      ],
      [
        pedidosPeriodo.length,
        unidadesPedidas,
        unidadesSolicitadasDespachos,
        unidadesDespachadas,
        `${fillRate}%`,
        unidadesProducidas,
        paradasProducidas,
        ordenesMicros,
        kgMicrosProducidos,
        unidadesDevueltasAtribuidas,
        unidadesDevueltasRecibidas,
        valorDevueltoAtribuido,
        valorDevueltoRecibido,
        `${porcentajeDevolucion}%`,
      ],
      [],
      [
        "Semana",
        "Pedidas",
        "Solicitadas cerradas",
        "Despachadas",
        "Fill Rate",
        "Producidas",
        "Devueltas atribuidas",
        "% devolución",
      ],
      ...comportamientoSemanal.map((semana) => [
        semana.etiqueta,
        semana.pedidas,
        semana.solicitadasCerradas,
        semana.despachadas,
        `${porcentaje(
          semana.despachadas,
          semana.solicitadasCerradas,
        )}%`,
        semana.producidas,
        semana.devueltas,
        `${porcentaje(
          semana.devueltas,
          semana.despachadas,
        )}%`,
      ]),
    ]

    descargarCsv(
      filas,
      `reporte-semanal-cibuspan-${fechaDesde}-${fechaHasta}.csv`,
    )
  }

  function descargarCsv(
    filas: Array<Array<string | number>>,
    nombre: string,
  ) {
    const contenido = filas
      .map((fila) =>
        fila
          .map(
            (valor) =>
              `"${String(valor).replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\n")

    const archivo = new Blob([contenido], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(archivo)
    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = nombre
    enlace.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="c1-reportes" style={pagina}>
      <style>{reportesResponsiveCss}</style>

      <header className="reports-header">
        <div>
          <span className="reports-eyebrow">
            ANÁLISIS SEMANAL
          </span>
          <h1>Reportes</h1>
          <p>
            Facturación importada, pedidos, despachos, producción y devoluciones
            analizados por semanas de lunes a domingo.
          </p>
        </div>
        <button
          type="button"
          style={boton}
          onClick={() => cambiarPantalla("Rentabilidad por SKU")}
        >
          Rentabilidad por SKU
        </button>
      </header>

      <section
        className="reports-panel reports-period-panel"
        style={panel}
      >
        <div className="reports-panel-heading">
          <div>
            <h2>Periodo</h2>
            <p>
              El rango seleccionado se expande a semanas completas
              para que los porcentajes sean comparables.
            </p>
          </div>
        </div>

        <div className="reports-filters" style={filtros}>
          <div>
            <label>Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(evento) =>
                setFechaDesde(evento.target.value)
              }
              style={campo}
            />
          </div>

          <div>
            <label>Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(evento) =>
                setFechaHasta(evento.target.value)
              }
              style={campo}
            />
          </div>
        </div>

        <div className="reports-week-range">
          Semanas analizadas: {etiquetaSemana(rangoSemanalDesde)}
          {" → "}
          {etiquetaSemana(inicioSemana(rangoSemanalHasta))}
        </div>

        <div className="reports-period-actions">
          <button
            type="button"
            onClick={cargarDatos}
            disabled={cargando}
            style={botonSecundario}
          >
            {cargando ? "Actualizando..." : "Actualizar datos"}
          </button>

          <button
            type="button"
            onClick={exportarCsv}
            disabled={cargando}
            style={boton}
          >
            Exportar reporte semanal CSV
          </button>
        </div>
      </section>

      {error && <div className="reports-error">{error}</div>}

      <section className="reports-kpis" style={tarjetas}>
        <Tarjeta
          titulo="Facturación real"
          valor={moneda(totalFacturacionImportada)}
          detalle={`${numero(totalUnidadesFacturadas)} unidades facturadas · archivo importado`}
        />
        <Tarjeta
          titulo="Pedidos"
          valor={pedidosPeriodo.length}
          detalle={`${unidadesPedidas} unidades`}
        />
        <Tarjeta
          titulo="Despachos"
          valor={pedidosDespachadosConDetalle.length}
          detalle={`${unidadesDespachadas} unidades`}
        />
        <Tarjeta
          titulo="Producción"
          valor={produccionesPeriodo.length}
          detalle={`${numero(unidadesProducidas)} unidades · ${numero(paradasProducidas)} paradas · ${numero(kgMicrosProducidos)} kg de micros (${ordenesMicros} órdenes)`}
        />
        <Tarjeta
          titulo="Fill Rate"
          valor={`${fillRate}%`}
          detalle={`${unidadesDespachadas} / ${unidadesSolicitadasDespachos} unidades cerradas`}
        />
        <Tarjeta
          titulo="Devolución atribuida"
          valor={`${porcentajeDevolucion}%`}
          detalle={`${unidadesDevueltasAtribuidas} atribuidas · ${unidadesDevueltasRecibidas} recibidas`}
        />
        <Tarjeta
          titulo="Valor de devoluciones"
          valor={moneda(valorDevueltoAtribuido)}
          detalle={`${moneda(valorDevueltoRecibido)} recibido en el periodo`}
        />
        <Tarjeta
          titulo="Inventario actual"
          valor={inventarioTotal}
          detalle={`${inventarioActivo.length} lotes activos`}
        />
      </section>

      <section
        className="reports-panel reports-weekly-panel"
        style={panel}
      >
        <div className="reports-panel-heading">
          <div>
            <h2>Comportamiento semanal general</h2>
            <p>
              Las devoluciones se muestran en la semana de despacho
              a la que fueron atribuidas, no en la semana en que llegaron.
            </p>
          </div>
        </div>

        {cargandoDetalles ? (
          <div className="reports-empty">
            Calculando comportamiento semanal...
          </div>
        ) : (
          <>
            <div className="reports-chart-block no-border">
              <GraficoSemanal datos={comportamientoSemanal} />
            </div>

            <div className="reports-table reports-weekly-table">
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>Semana</th>
                    <th style={encabezado}>Pedidas</th>
                    <th style={encabezado}>Despachadas</th>
                    <th style={encabezado}>Fill Rate</th>
                    <th style={encabezado}>Producidas</th>
                    <th style={encabezado}>Devueltas</th>
                    <th style={encabezado}>% devolución</th>
                  </tr>
                </thead>
                <tbody>
                  {comportamientoSemanal.map((semana) => (
                    <tr key={semana.semanaInicio}>
                      <td style={celda}>
                        <strong>{semana.etiqueta}</strong>
                      </td>
                      <td style={celda}>{semana.pedidas}</td>
                      <td style={celda}>
                        {semana.despachadas}
                      </td>
                      <td style={celda}>
                        {porcentaje(
                          semana.despachadas,
                          semana.solicitadasCerradas,
                        )}%
                      </td>
                      <td style={celda}>{semana.producidas}</td>
                      <td style={celda}>{semana.devueltas}</td>
                      <td style={celda}>
                        <strong>
                          {porcentaje(
                            semana.devueltas,
                            semana.despachadas,
                          )}%
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section
        className="reports-panel reports-sku-client-panel"
        style={panel}
      >
        <div className="reports-panel-heading">
          <div>
            <h2>SKU por cliente</h2>
            <p>
              Fill Rate y devolución por SKU, comparados semana contra semana.
            </p>
          </div>

          <button
            type="button"
            onClick={exportarSkuClienteCsv}
            disabled={
              !clienteSeleccionado ||
              resumenSkuCliente.length === 0
            }
            style={{
              ...botonSecundario,
              opacity:
                !clienteSeleccionado ||
                resumenSkuCliente.length === 0
                  ? 0.5
                  : 1,
            }}
          >
            Exportar SKU CSV
          </button>
        </div>

        <div className="reports-sku-controls">
          <div>
            <label>Cliente</label>
            <select
              value={clienteSeleccionadoId}
              onChange={(evento) => {
                setClienteSeleccionadoId(
                  evento.target.value,
                )
                setSkuGraficoId("TODOS")
              }}
              style={campo}
            >
              <option value="TODOS">TODOS</option>
              {clientesSku.map((cliente) => (
                <option
                  key={cliente.id}
                  value={cliente.id}
                >
                  {cliente.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>SKU para gráfico</label>
            <select
              value={skuGraficoId}
              onChange={(evento) =>
                setSkuGraficoId(evento.target.value)
              }
              style={campo}
              disabled={resumenSkuCliente.length === 0}
            >
              <option value="TODOS">Todos los SKU</option>
              {resumenSkuCliente.map((sku) => (
                <option
                  key={sku.productoId}
                  value={sku.productoId}
                >
                  {sku.corto}
                </option>
              ))}
            </select>
          </div>
        </div>

        {cargandoDetalles ? (
          <div className="reports-empty">
            Cargando detalle de SKU...
          </div>
        ) : resumenSkuCliente.length === 0 ? (
          <div className="reports-empty">
            No existen SKU para el filtro seleccionado.
          </div>
        ) : (
          <>
            <div className="reports-table reports-sku-table">
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>SKU</th>
                    <th style={encabezado}>Código</th>
                    <th style={encabezado}>Pedidas</th>
                    <th style={encabezado}>Despachadas</th>
                    <th style={encabezado}>Fill Rate</th>
                    <th style={encabezado}>Devueltas</th>
                    <th style={encabezado}>% devolución</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenSkuCliente.map((sku) => (
                    <tr
                      key={sku.productoId}
                      onClick={() =>
                        setSkuGraficoId(sku.productoId)
                      }
                      className={
                        skuGraficoId === sku.productoId
                          ? "reports-sku-row-selected"
                          : ""
                      }
                    >
                      <td style={celda}>
                        <strong>{sku.corto}</strong>
                        <br />
                        <small>{sku.nombre}</small>
                      </td>
                      <td style={celda}>{sku.codigo}</td>
                      <td style={celda}>{sku.pedidas}</td>
                      <td style={celda}>{sku.despachadas}</td>
                      <td style={celda}>{sku.fillRate}%</td>
                      <td style={celda}>
                        <strong>{sku.devueltas}</strong>
                      </td>
                      <td style={celda}>
                        <strong>
                          {sku.porcentajeDevolucion}%
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={celda}>
                      <strong>TOTAL</strong>
                    </td>
                    <td style={celda}>—</td>
                    <td style={celda}>
                      {totalesSkuCliente.pedidas}
                    </td>
                    <td style={celda}>
                      {totalesSkuCliente.despachadas}
                    </td>
                    <td style={celda}>
                      {porcentaje(
                        totalesSkuCliente.despachadas,
                        totalesSkuCliente.solicitadasCerradas,
                      )}%
                    </td>
                    <td style={celda}>
                      {totalesSkuCliente.devueltas}
                    </td>
                    <td style={celda}>
                      {porcentaje(
                        totalesSkuCliente.devueltas,
                        totalesSkuCliente.despachadas,
                      )}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="reports-chart-block">
              <div className="reports-chart-heading">
                <div>
                  <h3>Comportamiento semanal</h3>
                  <p>
                    {clienteSeleccionado?.nombre ?? "Cliente"}
                    {" · "}
                    {skuGrafico
                      ? skuGrafico.corto
                      : "Todos los SKU"}
                  </p>
                </div>
              </div>

              <GraficoSemanal datos={evolucionClienteSku} />
            </div>
          </>
        )}
      </section>

      <section
        className="reports-panel reports-commercial-evolution"
        style={panel}
      >
        <div className="reports-panel-heading">
          <div>
            <span className="reports-commercial-eyebrow">
              CRECIMIENTO Y RENTABILIDAD
            </span>
            <h2>Evolución comercial</h2>
            <p>
              {clienteSeleccionado?.nombre ?? "Todos los clientes"}
              {" · "}
              {skuGrafico ? skuGrafico.corto : "Todos los SKU"}
              {" · comparación semana contra semana"}
            </p>
          </div>
        </div>

        {comportamientoComercial.length < 2 ? (
          <div className="reports-empty">
            Selecciona un periodo de al menos dos semanas para
            medir crecimiento o decrecimiento.
          </div>
        ) : (
          <>
            <div className="reports-growth-grid">
              <TarjetaCrecimiento
                titulo="Despachos"
                actual={ultimaSemanaComercial?.despachadas ?? 0}
                anterior={semanaComercialAnterior?.despachadas ?? 0}
                mejorCuandoSube
                unidad="Unid."
              />
              <TarjetaCrecimiento
                titulo="Devoluciones"
                actual={ultimaSemanaComercial?.devueltas ?? 0}
                anterior={semanaComercialAnterior?.devueltas ?? 0}
                mejorCuandoSube={false}
                unidad="Unid."
              />
              <TarjetaCrecimiento
                titulo="Tasa de devolución"
                actual={ultimaSemanaComercial?.tasaDevolucion ?? 0}
                anterior={semanaComercialAnterior?.tasaDevolucion ?? 0}
                mejorCuandoSube={false}
                unidad="%"
                decimales={1}
              />
              <TarjetaCrecimiento
                titulo="Contribución preliminar"
                actual={ultimaSemanaComercial?.contribucion ?? null}
                anterior={semanaComercialAnterior?.contribucion ?? null}
                mejorCuandoSube
                monedaValor
              />
            </div>

            {(avisoRentabilidad ||
              comportamientoComercial.some(
                (semana) => !semana.configuracionCompleta,
              )) && (
              <div className="reports-commercial-warning">
                <strong>Rentabilidad incompleta.</strong>{" "}
                {avisoRentabilidad ||
                  "Existen semanas con precios o costos de receta pendientes."}
              </div>
            )}

            <div className="reports-commercial-charts">
              <article>
                <div className="reports-chart-heading">
                  <div>
                    <h3>Despachos y devoluciones</h3>
                    <p>Unidades por semana</p>
                  </div>
                </div>
                <GraficoDespachosDevoluciones
                  datos={comportamientoComercial}
                />
              </article>

              <article>
                <div className="reports-chart-heading">
                  <div>
                    <h3>Tasa de devolución</h3>
                    <p>Comparada con la meta máxima del 8%</p>
                  </div>
                </div>
                <GraficoTasaDevolucion
                  datos={comportamientoComercial}
                />
              </article>

              <article className="wide">
                <div className="reports-chart-heading">
                  <div>
                    <h3>Contribución preliminar semanal</h3>
                    <p>
                      Facturación real importada − devoluciones − materia prima
                      − gastos directos del cliente
                    </p>
                  </div>
                </div>
                <GraficoContribucion
                  datos={comportamientoComercial}
                />
              </article>
            </div>
          </>
        )}
      </section>

      <section
        className="reports-panel reports-clients-panel"
        style={panel}
      >
        <h2>Operación y margen preliminar por cliente</h2>
        <p className="reports-section-note">
          Las ventas provienen de la facturación importada. El margen preliminar
          descuenta devoluciones, materia prima y facturas asignadas al cliente.
          No incluye los gastos del negocio completo.
        </p>

        {clientesResumen.length === 0 ? (
          <p>No existen movimientos en estas semanas.</p>
        ) : (
          <div className="reports-table reports-clients-table">
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>Cliente</th>
                  <th style={encabezado}>Despachos</th>
                  <th style={encabezado}>Unidades</th>
                  <th style={encabezado}>Devueltas</th>
                  <th style={encabezado}>% devolución</th>
                  <th style={encabezado}>Ventas netas</th>
                  <th style={encabezado}>Gastos directos</th>
                  <th style={encabezado}>Contribución</th>
                  <th style={encabezado}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {clientesResumen.map((cliente) => (
                  <tr key={cliente.id}>
                    <td style={celda}>
                      <strong>{cliente.cliente}</strong>
                    </td>
                    <td style={celda}>{cliente.despachos}</td>
                    <td style={celda}>{cliente.unidades}</td>
                    <td style={celda}>{cliente.devueltas}</td>
                    <td style={celda}>
                      <strong>
                        {cliente.porcentajeDevolucion}%
                      </strong>
                    </td>
                    <td style={celda}>
                      {cliente.ventasNetas === null
                        ? "Pendiente"
                        : moneda(cliente.ventasNetas)}
                    </td>
                    <td style={celda}>
                      {moneda(cliente.gastosDirectos)}
                    </td>
                    <td style={celda}>
                      {cliente.contribucion === null
                        ? "Pendiente"
                        : moneda(cliente.contribucion)}
                    </td>
                    <td style={celda}>
                      <strong>
                        {cliente.margen === null
                          ? "Pendiente"
                          : `${cliente.margen.toFixed(1)}%`}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="reports-panel reports-returns-panel"
        style={panel}
      >
        <h2>Devoluciones atribuidas por motivo</h2>
        <p className="reports-section-note">
          Se agrupan por la semana de origen calculada con la vida útil
          de cada SKU menos los 2 días de retiro anticipado de percha.
        </p>

        {devolucionesPorMotivo.length === 0 ? (
          <p>No existen devoluciones atribuidas en estas semanas.</p>
        ) : (
          <div className="reports-table reports-returns-table">
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>Motivo</th>
                  <th style={encabezado}>Unidades</th>
                  <th style={encabezado}>Participación</th>
                </tr>
              </thead>
              <tbody>
                {devolucionesPorMotivo.map((registro) => (
                  <tr key={registro.motivo}>
                    <td style={celda}>
                      <strong>{registro.motivo}</strong>
                    </td>
                    <td style={celda}>{registro.unidades}</td>
                    <td style={celda}>
                      {porcentaje(
                        registro.unidades,
                        unidadesDevueltasAtribuidas,
                      )}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function TarjetaCrecimiento({
  titulo,
  actual,
  anterior,
  mejorCuandoSube,
  unidad = "",
  decimales = 0,
  monedaValor = false,
}: {
  titulo: string
  actual: number | null
  anterior: number | null
  mejorCuandoSube: boolean
  unidad?: string
  decimales?: number
  monedaValor?: boolean
}) {
  if (actual === null || anterior === null) {
    return (
      <article className="reports-growth-card pending">
        <span>{titulo}</span>
        <strong>—</strong>
        <small>Configuración pendiente</small>
      </article>
    )
  }

  const subio = actual > anterior
  const igual = actual === anterior
  const estado = igual
    ? "neutral"
    : subio === mejorCuandoSube
      ? "positive"
      : "negative"
  const variacion =
    anterior === 0
      ? actual === 0
        ? 0
        : null
      : ((actual - anterior) / anterior) * 100
  const flecha = subio ? "↑" : actual < anterior ? "↓" : "→"
  const formato = (valor: number) =>
    monedaValor
      ? moneda(valor)
      : `${valor.toLocaleString("es-EC", {
          minimumFractionDigits: decimales,
          maximumFractionDigits: decimales,
        })}${unidad ? ` ${unidad}` : ""}`

  return (
    <article className={`reports-growth-card ${estado}`}>
      <span>{titulo}</span>
      <strong>{formato(actual)}</strong>
      <div>
        <b>{flecha}</b>
        {variacion === null
          ? "Nuevo"
          : `${Math.abs(variacion).toFixed(1)}%`}
      </div>
      <small>Anterior: {formato(anterior)}</small>
    </article>
  )
}

function GraficoDespachosDevoluciones({
  datos,
}: {
  datos: PuntoComercial[]
}) {
  const ancho = 720
  const alto = 250
  const margen = { arriba: 22, derecha: 20, abajo: 48, izquierda: 54 }
  const graficoAncho = ancho - margen.izquierda - margen.derecha
  const graficoAlto = alto - margen.arriba - margen.abajo
  const maximo = Math.max(
    1,
    ...datos.flatMap((punto) => [
      punto.despachadas,
      punto.devueltas,
    ]),
  )
  const x = (indice: number) =>
    margen.izquierda +
    (datos.length === 1
      ? graficoAncho / 2
      : (indice / (datos.length - 1)) * graficoAncho)
  const y = (valor: number) =>
    margen.arriba + graficoAlto - (valor / maximo) * graficoAlto
  const ruta = (campo: "despachadas" | "devueltas") =>
    datos
      .map(
        (punto, indice) =>
          `${indice === 0 ? "M" : "L"}${x(indice)},${y(punto[campo])}`,
      )
      .join(" ")
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="reports-svg-wrap">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Evolución semanal de despachos y devoluciones">
        {ticks.map((tick) => {
          const valor = maximo * tick
          const posicionY = y(valor)
          return (
            <g key={tick}>
              <line x1={margen.izquierda} x2={ancho - margen.derecha} y1={posicionY} y2={posicionY} className="commercial-grid-line" />
              <text x={margen.izquierda - 9} y={posicionY + 3} textAnchor="end" className="commercial-axis-label">{Math.round(valor).toLocaleString("es-EC")}</text>
            </g>
          )
        })}
        <path d={ruta("despachadas")} className="commercial-line dispatch" />
        <path d={ruta("devueltas")} className="commercial-line returns" />
        {datos.map((punto, indice) => (
          <g key={punto.semanaInicio}>
            <circle cx={x(indice)} cy={y(punto.despachadas)} r="4" className="commercial-dot dispatch"><title>{`${punto.etiqueta}: ${punto.despachadas} despachadas`}</title></circle>
            <circle cx={x(indice)} cy={y(punto.devueltas)} r="4" className="commercial-dot returns"><title>{`${punto.etiqueta}: ${punto.devueltas} devueltas`}</title></circle>
            <text x={x(indice)} y={alto - 18} textAnchor="middle" className="commercial-axis-label">{etiquetaEjeSemana(punto.semanaInicio)}</text>
          </g>
        ))}
      </svg>
      <div className="commercial-chart-legend"><span className="dispatch">● Despachadas</span><span className="returns">● Devueltas</span></div>
    </div>
  )
}

function GraficoTasaDevolucion({
  datos,
}: {
  datos: PuntoComercial[]
}) {
  const ancho = 720
  const alto = 250
  const margen = { arriba: 22, derecha: 20, abajo: 48, izquierda: 48 }
  const graficoAncho = ancho - margen.izquierda - margen.derecha
  const graficoAlto = alto - margen.arriba - margen.abajo
  const maximo = Math.max(10, ...datos.map((punto) => punto.tasaDevolucion))
  const x = (indice: number) => margen.izquierda + (indice / Math.max(1, datos.length - 1)) * graficoAncho
  const y = (valor: number) => margen.arriba + graficoAlto - (valor / maximo) * graficoAlto
  const ruta = datos.map((punto, indice) => `${indice === 0 ? "M" : "L"}${x(indice)},${y(punto.tasaDevolucion)}`).join(" ")
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="reports-svg-wrap">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Evolución semanal de la tasa de devolución">
        {ticks.map((tick) => {
          const valor = maximo * tick
          const posicionY = y(valor)
          return <g key={tick}><line x1={margen.izquierda} x2={ancho - margen.derecha} y1={posicionY} y2={posicionY} className="commercial-grid-line" /><text x={margen.izquierda - 8} y={posicionY + 3} textAnchor="end" className="commercial-axis-label">{valor.toFixed(1)}%</text></g>
        })}
        <line x1={margen.izquierda} x2={ancho - margen.derecha} y1={y(8)} y2={y(8)} className="commercial-target-line" />
        <text x={ancho - margen.derecha} y={y(8) - 6} textAnchor="end" className="commercial-target-label">Meta 8%</text>
        <path d={ruta} className="commercial-line rate" />
        {datos.map((punto, indice) => (
          <g key={punto.semanaInicio}>
            <circle cx={x(indice)} cy={y(punto.tasaDevolucion)} r="4" className={`commercial-dot rate ${punto.tasaDevolucion <= 8 ? "good" : "bad"}`}><title>{`${punto.etiqueta}: ${punto.tasaDevolucion.toFixed(1)}%`}</title></circle>
            <text x={x(indice)} y={alto - 18} textAnchor="middle" className="commercial-axis-label">{etiquetaEjeSemana(punto.semanaInicio)}</text>
          </g>
        ))}
      </svg>
      <div className="commercial-chart-legend"><span className="rate">● % devolución</span><span className="target">— Meta máxima</span></div>
    </div>
  )
}

function GraficoContribucion({
  datos,
}: {
  datos: PuntoComercial[]
}) {
  const ancho = 1120
  const alto = 280
  const margen = { arriba: 24, derecha: 24, abajo: 52, izquierda: 70 }
  const graficoAncho = ancho - margen.izquierda - margen.derecha
  const graficoAlto = alto - margen.arriba - margen.abajo
  const valores = datos.map((punto) => punto.contribucion ?? 0)
  const minimo = Math.min(0, ...valores)
  const maximo = Math.max(1, ...valores)
  const rango = Math.max(1, maximo - minimo)
  const y = (valor: number) => margen.arriba + ((maximo - valor) / rango) * graficoAlto
  const paso = graficoAncho / Math.max(1, datos.length)
  const anchoBarra = Math.min(58, paso * 0.58)
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="reports-svg-wrap wide-chart">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Contribución preliminar por semana">
        {ticks.map((tick) => {
          const valor = minimo + rango * tick
          const posicionY = y(valor)
          return <g key={tick}><line x1={margen.izquierda} x2={ancho - margen.derecha} y1={posicionY} y2={posicionY} className="commercial-grid-line" /><text x={margen.izquierda - 10} y={posicionY + 3} textAnchor="end" className="commercial-axis-label">{moneda(valor)}</text></g>
        })}
        <line x1={margen.izquierda} x2={ancho - margen.derecha} y1={y(0)} y2={y(0)} className="commercial-zero-line" />
        {datos.map((punto, indice) => {
          const centroX = margen.izquierda + paso * indice + paso / 2
          const valor = punto.contribucion
          const inicioY = y(Math.max(0, valor ?? 0))
          const finY = y(Math.min(0, valor ?? 0))
          return (
            <g key={punto.semanaInicio}>
              {valor === null ? <rect x={centroX - anchoBarra / 2} y={margen.arriba} width={anchoBarra} height={graficoAlto} className="commercial-bar pending"><title>{`${punto.etiqueta}: configuración pendiente`}</title></rect> : <rect x={centroX - anchoBarra / 2} y={inicioY} width={anchoBarra} height={Math.max(2, finY - inicioY)} rx="4" className={`commercial-bar ${valor >= 0 ? "positive" : "negative"}`}><title>{`${punto.etiqueta}: ${moneda(valor)}`}</title></rect>}
              <text x={centroX} y={alto - 19} textAnchor="middle" className="commercial-axis-label">{etiquetaEjeSemana(punto.semanaInicio)}</text>
            </g>
          )
        })}
      </svg>
      <div className="commercial-chart-legend"><span className="positive">■ Contribución positiva</span><span className="negative">■ Contribución negativa</span><span className="pending">▨ Configuración pendiente</span></div>
    </div>
  )
}

function GraficoSemanal({ datos }: { datos: PuntoSemana[] }) {
  const ancho = 900
  const alto = 300
  const margenIzq = 58
  const margenDer = 18
  const margenSup = 18
  const margenInf = 50
  const anchoGrafico = ancho - margenIzq - margenDer
  const altoGrafico = alto - margenSup - margenInf

  const maximo = Math.max(
    1,
    ...datos.flatMap((punto) => [
      punto.pedidas,
      punto.despachadas,
      punto.devueltas,
    ]),
  )

  function x(indice: number) {
    if (datos.length <= 1) {
      return margenIzq + anchoGrafico / 2
    }

    return (
      margenIzq +
      (indice / (datos.length - 1)) * anchoGrafico
    )
  }

  function y(valor: number) {
    return (
      margenSup +
      altoGrafico -
      (valor / maximo) * altoGrafico
    )
  }

  function crearRuta(
    campo: "pedidas" | "despachadas" | "devueltas",
  ) {
    return datos
      .map((punto, indice) => {
        const comando = indice === 0 ? "M" : "L"
        return `${comando} ${x(indice)} ${y(
          punto[campo],
        )}`
      })
      .join(" ")
  }

  if (datos.length === 0) {
    return (
      <div className="reports-empty">
        No existen datos para graficar.
      </div>
    )
  }

  const marcasY = [0, 0.25, 0.5, 0.75, 1]
  const sinMovimiento = datos.every(
    (punto) =>
      punto.pedidas === 0 &&
      punto.despachadas === 0 &&
      punto.devueltas === 0,
  )

  return (
    <div className="reports-chart">
      <div className="reports-chart-legend">
        <span>
          <i className="reports-legend-dot reports-legend-orders" />
          Pedidas
        </span>
        <span>
          <i className="reports-legend-dot reports-legend-dispatch" />
          Despachadas
        </span>
        <span>
          <i className="reports-legend-dot reports-legend-returns" />
          Devueltas atribuidas
        </span>
      </div>

      {sinMovimiento && (
        <div className="reports-chart-zero">
          No existen unidades para este filtro.
        </div>
      )}

      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label="Comportamiento semanal de pedidos, despachos y devoluciones"
      >
        {marcasY.map((fraccion) => {
          const valor = Math.round(maximo * fraccion)
          const posicionY = y(valor)

          return (
            <g key={fraccion}>
              <line
                x1={margenIzq}
                x2={ancho - margenDer}
                y1={posicionY}
                y2={posicionY}
                stroke="#eadfd9"
                strokeWidth="1"
              />
              <text
                x={margenIzq - 10}
                y={posicionY + 4}
                textAnchor="end"
                fontSize="11"
                fill="#8e7c75"
              >
                {valor}
              </text>
            </g>
          )
        })}

        {datos.map((punto, indice) => (
          <text
            key={punto.semanaInicio}
            x={x(indice)}
            y={alto - 16}
            textAnchor="middle"
            fontSize="10"
            fill="#8e7c75"
          >
            {etiquetaEjeSemana(punto.semanaInicio)}
          </text>
        ))}

        <path
          d={crearRuta("pedidas")}
          fill="none"
          stroke="#8F1D24"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={crearRuta("despachadas")}
          fill="none"
          stroke="#F7931E"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={crearRuta("devueltas")}
          fill="none"
          stroke="#6B7280"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {datos.map((punto, indice) => (
          <g key={`p-${punto.semanaInicio}`}>
            <circle
              cx={x(indice)}
              cy={y(punto.pedidas)}
              r="3"
              fill="#8F1D24"
            />
            <circle
              cx={x(indice)}
              cy={y(punto.despachadas)}
              r="3"
              fill="#F7931E"
            />
            <circle
              cx={x(indice)}
              cy={y(punto.devueltas)}
              r="3"
              fill="#6B7280"
            />
          </g>
        ))}
      </svg>
    </div>
  )
}

type TarjetaProps = {
  titulo: string
  valor: string | number
  detalle: string
}

function Tarjeta({ titulo, valor, detalle }: TarjetaProps) {
  return (
    <article className="reports-kpi-card" style={tarjeta}>
      <span style={tituloTarjeta}>{titulo}</span>
      <strong style={valorTarjeta}>{valor}</strong>
      <span style={detalleTarjeta}>{detalle}</span>
    </article>
  )
}

const pagina = {
  width: "100%",
  maxWidth: "none",
  boxSizing: "border-box" as const,
  padding: "20px 24px",
  margin: 0,
  color: "#25272b",
}

const panel = {
  width: "100%",
  boxSizing: "border-box" as const,
  marginBottom: "18px",
  padding: "20px",
  border: "1px solid #eadfd9",
  borderRadius: "14px",
  background: "white",
  boxShadow: "0 5px 18px rgba(72,42,32,.045)",
}

const filtros = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(180px, 260px))",
  gap: "12px",
  marginBottom: "10px",
}

const campo = {
  display: "block",
  width: "100%",
  minHeight: "42px",
  boxSizing: "border-box" as const,
  padding: "9px 10px",
  marginTop: "6px",
  border: "1px solid #d8ccc6",
  borderRadius: "8px",
  background: "white",
}

const boton = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonSecundario = {
  padding: "10px 16px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const tarjetas = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: "12px",
  marginBottom: "18px",
}

const tarjeta = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "7px",
  minHeight: "118px",
  padding: "16px",
  border: "1px solid #eadfd9",
  borderRadius: "12px",
  background: "white",
  boxShadow: "0 4px 14px rgba(72,42,32,.04)",
}

const tituloTarjeta = {
  color: "#6b7280",
  fontSize: "13px",
}

const valorTarjeta = {
  color: "#8f1d24",
  fontSize: "27px",
}

const detalleTarjeta = {
  color: "#6b7280",
  fontSize: "11px",
  lineHeight: 1.35,
}

const tabla = {
  width: "100%",
  minWidth: "720px",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "10px",
  textAlign: "left" as const,
  borderBottom: "2px solid #ded2cc",
  whiteSpace: "nowrap" as const,
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #eeeeee",
  whiteSpace: "nowrap" as const,
}

const reportesResponsiveCss = `
  .c1-reportes {
    --c1-vino: #8F1D24;
    --c1-vino-oscuro: #68151A;
    --c1-naranja: #F7931E;
    --c1-crema: #F8F5F1;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    box-sizing: border-box !important;
  }

  .c1-reportes .reports-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 16px;
  }

  .c1-reportes .reports-main-tabs {
    display: flex;
    gap: 6px;
    padding: 6px;
    margin-bottom: 18px;
    border-radius: 11px;
    background: #e9ebef;
  }

  .c1-reportes .reports-main-tabs button {
    flex: 0 1 210px;
    min-height: 42px;
    padding: 10px 18px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #6b7280;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .c1-reportes .reports-main-tabs button.active {
    background: #9f1f28;
    color: white;
  }

  .c1-reportes .reports-eyebrow {
    display: inline-block;
    margin-bottom: 4px;
    color: var(--c1-naranja);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .7px;
  }

  .c1-reportes .reports-header h1 {
    margin: 0;
    color: #4f2728;
    font-size: 30px;
  }

  .c1-reportes .reports-header p,
  .c1-reportes .reports-panel-heading p,
  .c1-reportes .reports-section-note {
    max-width: 820px;
    margin: 5px 0 0;
    color: #766762;
    font-size: 12px;
    line-height: 1.45;
  }

  .c1-reportes .reports-panel h2 {
    margin-top: 0;
    color: #4f2728;
    font-size: 18px;
  }

  .c1-reportes .reports-panel-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 14px;
  }

  .c1-reportes .reports-panel-heading h2 {
    margin-bottom: 4px;
  }

  .c1-reportes label {
    display: block;
    color: #7a6d67;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .35px;
  }

  .c1-reportes input:focus,
  .c1-reportes select:focus {
    outline: none;
    border-color: var(--c1-naranja) !important;
    box-shadow: 0 0 0 3px rgba(247,147,30,.13);
  }

  .c1-reportes .reports-period-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .c1-reportes .reports-week-range {
    display: inline-block;
    padding: 6px 9px;
    border-radius: 999px;
    background: #fff3e6;
    color: #9a4c00;
    font-size: 10px;
    font-weight: 800;
  }

  .c1-reportes .reports-error {
    margin: 0 0 14px;
    padding: 11px 13px;
    border: 1px solid #fecaca;
    border-radius: 10px;
    background: #fff1f2;
    color: #991b1b;
    font-size: 12px;
    font-weight: 700;
  }

  .c1-reportes .reports-kpi-card {
    min-width: 0;
  }

  .c1-reportes .reports-table {
    width: 100%;
    overflow-x: auto;
  }

  .c1-reportes .reports-table th {
    color: #6b5b55;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .3px;
  }

  .c1-reportes .reports-table td {
    color: #403735;
    font-size: 12px;
  }

  .c1-reportes .reports-sku-controls {
    display: grid;
    grid-template-columns: minmax(220px,320px) minmax(220px,320px);
    gap: 12px;
    margin-bottom: 14px;
  }

  .c1-reportes .reports-empty {
    padding: 18px;
    border: 1px dashed #ddcec7;
    border-radius: 10px;
    color: #7a6d67;
    text-align: center;
    font-size: 12px;
    background: #fffdfb;
  }

  .c1-reportes .reports-sku-table tbody tr {
    cursor: pointer;
  }

  .c1-reportes .reports-sku-table tbody tr:hover,
  .c1-reportes .reports-sku-row-selected {
    background: #fff8f4;
  }

  .c1-reportes .reports-sku-table tfoot {
    background: #faf6f3;
    font-weight: 800;
  }

  .c1-reportes .reports-chart-block {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid #eee3dd;
  }

  .c1-reportes .reports-chart-block.no-border {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .c1-reportes .reports-chart-heading h3 {
    margin: 0 0 3px;
    color: #4f2728;
    font-size: 15px;
  }

  .c1-reportes .reports-chart-heading p {
    margin: 0;
    color: #7a6d67;
    font-size: 11px;
  }

  .c1-reportes .reports-chart {
    position: relative;
    width: 100%;
    min-height: 275px;
    padding-top: 34px;
    border: 1px solid #eee3dd;
    border-radius: 12px;
    background: #fffdfb;
    overflow: hidden;
  }

  .c1-reportes .reports-chart svg {
    display: block;
    width: 100%;
    height: auto;
    min-height: 250px;
  }

  .c1-reportes .reports-chart-legend {
    position: absolute;
    top: 10px;
    left: 14px;
    right: 14px;
    z-index: 3;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    color: #6f625c;
    font-size: 10px;
    font-weight: 700;
  }

  .c1-reportes .reports-chart-legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .c1-reportes .reports-legend-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
  }

  .c1-reportes .reports-legend-orders {
    background: #8F1D24;
  }

  .c1-reportes .reports-legend-dispatch {
    background: #F7931E;
  }

  .c1-reportes .reports-legend-returns {
    background: #6B7280;
  }

  .c1-reportes .reports-chart-zero {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 4;
    transform: translate(-50%,-50%);
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(255,255,255,.94);
    color: #8e7c75;
    font-size: 11px;
    font-weight: 700;
  }

  .c1-reportes .reports-commercial-eyebrow {
    display: inline-block;
    margin-bottom: 4px;
    color: var(--c1-naranja);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .8px;
  }

  .c1-reportes .reports-growth-grid {
    display: grid;
    grid-template-columns: repeat(4,minmax(0,1fr));
    gap: 9px;
    margin-bottom: 13px;
  }

  .c1-reportes .reports-growth-card {
    min-width: 0;
    padding: 13px;
    border: 1px solid #e9dfda;
    border-top: 3px solid #a89a94;
    border-radius: 9px;
    background: #fffdfb;
  }

  .c1-reportes .reports-growth-card.positive { border-top-color: #159447; }
  .c1-reportes .reports-growth-card.negative { border-top-color: #d33d3d; }
  .c1-reportes .reports-growth-card.pending { border-top-color: #d99a28; }
  .c1-reportes .reports-growth-card > span { display: block; color: #786b65; font-size: 8px; font-weight: 900; letter-spacing: .4px; text-transform: uppercase; }
  .c1-reportes .reports-growth-card > strong { display: block; margin: 6px 0 3px; color: #352b28; font-size: 20px; }
  .c1-reportes .reports-growth-card > div { display: inline-flex; align-items: center; gap: 3px; margin-right: 6px; padding: 3px 6px; border-radius: 4px; background: #f1efee; font-size: 9px; font-weight: 900; }
  .c1-reportes .reports-growth-card.positive > div { background: #e8f7ed; color: #087b35; }
  .c1-reportes .reports-growth-card.negative > div { background: #fff0f0; color: #c72e2e; }
  .c1-reportes .reports-growth-card > div b { font-size: 13px; }
  .c1-reportes .reports-growth-card > small { color: #9b8e88; font-size: 8px; }

  .c1-reportes .reports-commercial-warning {
    margin-bottom: 13px;
    padding: 10px 12px;
    border-left: 3px solid #d99a28;
    border-radius: 6px;
    background: #fff8e8;
    color: #856421;
    font-size: 10px;
  }

  .c1-reportes .reports-commercial-charts {
    display: grid;
    grid-template-columns: repeat(2,minmax(0,1fr));
    gap: 11px;
  }

  .c1-reportes .reports-commercial-charts > article {
    min-width: 0;
    padding: 14px;
    border: 1px solid #eae1dc;
    border-radius: 10px;
    background: #fffdfb;
  }

  .c1-reportes .reports-commercial-charts > article.wide {
    grid-column: 1 / -1;
  }

  .c1-reportes .reports-svg-wrap {
    width: 100%;
    margin-top: 9px;
    overflow-x: auto;
  }

  .c1-reportes .reports-svg-wrap svg {
    display: block;
    width: 100%;
    min-width: 520px;
    height: auto;
  }

  .c1-reportes .reports-svg-wrap.wide-chart svg {
    min-width: 760px;
  }

  .c1-reportes .commercial-grid-line {
    stroke: #eadfd9;
    stroke-width: 1;
  }

  .c1-reportes .commercial-zero-line {
    stroke: #8a7b75;
    stroke-width: 1.4;
  }

  .c1-reportes .commercial-axis-label {
    fill: #8e7c75;
    font-size: 9px;
  }

  .c1-reportes .commercial-line {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .c1-reportes .commercial-line.dispatch { stroke: #159447; }
  .c1-reportes .commercial-line.returns { stroke: #d33d3d; }
  .c1-reportes .commercial-line.rate { stroke: #F7931E; }
  .c1-reportes .commercial-dot { stroke: white; stroke-width: 2; }
  .c1-reportes .commercial-dot.dispatch { fill: #159447; }
  .c1-reportes .commercial-dot.returns { fill: #d33d3d; }
  .c1-reportes .commercial-dot.rate.good { fill: #159447; }
  .c1-reportes .commercial-dot.rate.bad { fill: #d33d3d; }
  .c1-reportes .commercial-target-line { stroke: #8F1D24; stroke-width: 1.3; stroke-dasharray: 6 5; }
  .c1-reportes .commercial-target-label { fill: #8F1D24; font-size: 9px; font-weight: 800; }
  .c1-reportes .commercial-bar.positive { fill: #159447; }
  .c1-reportes .commercial-bar.negative { fill: #d33d3d; }
  .c1-reportes .commercial-bar.pending { fill: #eadfd9; opacity: .55; }

  .c1-reportes .commercial-chart-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 14px;
    color: #796c66;
    font-size: 9px;
    font-weight: 800;
  }

  .c1-reportes .commercial-chart-legend .dispatch,
  .c1-reportes .commercial-chart-legend .positive { color: #159447; }
  .c1-reportes .commercial-chart-legend .returns,
  .c1-reportes .commercial-chart-legend .negative { color: #d33d3d; }
  .c1-reportes .commercial-chart-legend .rate { color: #F7931E; }
  .c1-reportes .commercial-chart-legend .target { color: #8F1D24; }
  .c1-reportes .commercial-chart-legend .pending { color: #9b8e88; }

  @media (max-width: 1180px) {
    .c1-reportes .reports-kpis {
      grid-template-columns: repeat(3,minmax(0,1fr)) !important;
    }

    .c1-reportes .reports-growth-grid {
      grid-template-columns: repeat(2,minmax(0,1fr));
    }
  }

  @media (max-width: 760px) {
    .c1-reportes {
      padding: 12px 10px 28px !important;
      overflow-x: hidden;
    }

    .c1-reportes .reports-header h1 {
      font-size: 26px;
    }

    .c1-reportes .reports-header {
      flex-direction: column;
    }

    .c1-reportes .reports-header button {
      width: 100%;
    }

    .c1-reportes .reports-main-tabs button {
      flex: 1 1 50%;
    }

    .c1-reportes .reports-panel {
      padding: 12px !important;
      margin-bottom: 11px !important;
    }

    .c1-reportes .reports-panel-heading {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 8px !important;
    }

    .c1-reportes .reports-panel-heading button {
      width: 100%;
    }

    .c1-reportes .reports-filters,
    .c1-reportes .reports-sku-controls {
      grid-template-columns: 1fr !important;
      gap: 8px !important;
    }

    .c1-reportes .reports-period-actions {
      display: grid !important;
      grid-template-columns: 1fr !important;
    }

    .c1-reportes .reports-period-actions button {
      width: 100%;
      min-height: 44px;
    }

    .c1-reportes .reports-kpis {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      gap: 7px !important;
    }

    .c1-reportes .reports-kpi-card {
      min-height: 105px !important;
      padding: 11px !important;
    }

    .c1-reportes .reports-kpi-card strong {
      font-size: 22px !important;
    }

    .c1-reportes .reports-chart {
      min-height: 225px;
      padding-top: 48px;
    }

    .c1-reportes .reports-chart svg {
      min-height: 215px;
    }

    .c1-reportes .reports-chart-legend {
      gap: 7px 10px;
      font-size: 9px;
    }

    .c1-reportes .reports-commercial-charts {
      grid-template-columns: 1fr;
    }

    .c1-reportes .reports-commercial-charts > article.wide {
      grid-column: auto;
    }

    .c1-reportes .reports-growth-card {
      padding: 10px;
    }

    .c1-reportes .reports-growth-card > strong {
      font-size: 17px;
    }

    /* TABLA SEMANAL -> TARJETAS */
    .c1-reportes .reports-weekly-table,
    .c1-reportes .reports-sku-table,
    .c1-reportes .reports-clients-table,
    .c1-reportes .reports-returns-table {
      overflow: visible !important;
    }

    .c1-reportes .reports-weekly-table table,
    .c1-reportes .reports-weekly-table tbody,
    .c1-reportes .reports-weekly-table tr,
    .c1-reportes .reports-weekly-table td,
    .c1-reportes .reports-sku-table table,
    .c1-reportes .reports-sku-table tbody,
    .c1-reportes .reports-sku-table tr,
    .c1-reportes .reports-sku-table td,
    .c1-reportes .reports-clients-table table,
    .c1-reportes .reports-clients-table tbody,
    .c1-reportes .reports-clients-table tr,
    .c1-reportes .reports-clients-table td,
    .c1-reportes .reports-returns-table table,
    .c1-reportes .reports-returns-table tbody,
    .c1-reportes .reports-returns-table tr,
    .c1-reportes .reports-returns-table td {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
    }

    .c1-reportes .reports-weekly-table thead,
    .c1-reportes .reports-sku-table thead,
    .c1-reportes .reports-sku-table tfoot,
    .c1-reportes .reports-clients-table thead,
    .c1-reportes .reports-returns-table thead {
      display: none !important;
    }

    .c1-reportes .reports-weekly-table tbody,
    .c1-reportes .reports-sku-table tbody,
    .c1-reportes .reports-clients-table tbody,
    .c1-reportes .reports-returns-table tbody {
      display: grid !important;
      gap: 8px;
    }

    .c1-reportes .reports-weekly-table tr,
    .c1-reportes .reports-sku-table tr,
    .c1-reportes .reports-clients-table tr,
    .c1-reportes .reports-returns-table tr {
      padding: 10px;
      border: 1px solid #eee3dd;
      border-radius: 11px;
      background: #fffdfb;
    }

    .c1-reportes .reports-weekly-table td,
    .c1-reportes .reports-sku-table td,
    .c1-reportes .reports-clients-table td,
    .c1-reportes .reports-returns-table td {
      display: grid !important;
      grid-template-columns: 115px minmax(0,1fr) !important;
      gap: 7px;
      padding: 4px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
      font-size: 11px;
    }

    .c1-reportes .reports-weekly-table td::before,
    .c1-reportes .reports-sku-table td::before,
    .c1-reportes .reports-clients-table td::before,
    .c1-reportes .reports-returns-table td::before {
      color: #8e7c75;
      font-size: 8px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
    }

    .c1-reportes .reports-weekly-table td:nth-child(1)::before { content: "Semana"; }
    .c1-reportes .reports-weekly-table td:nth-child(2)::before { content: "Pedidas"; }
    .c1-reportes .reports-weekly-table td:nth-child(3)::before { content: "Despachadas"; }
    .c1-reportes .reports-weekly-table td:nth-child(4)::before { content: "Fill Rate"; }
    .c1-reportes .reports-weekly-table td:nth-child(5)::before { content: "Producidas"; }
    .c1-reportes .reports-weekly-table td:nth-child(6)::before { content: "Devueltas"; }
    .c1-reportes .reports-weekly-table td:nth-child(7)::before { content: "% devolución"; }

    .c1-reportes .reports-sku-table td:nth-child(1)::before { content: "SKU"; }
    .c1-reportes .reports-sku-table td:nth-child(2)::before { content: "Código"; }
    .c1-reportes .reports-sku-table td:nth-child(3)::before { content: "Pedidas"; }
    .c1-reportes .reports-sku-table td:nth-child(4)::before { content: "Despachadas"; }
    .c1-reportes .reports-sku-table td:nth-child(5)::before { content: "Fill Rate"; }
    .c1-reportes .reports-sku-table td:nth-child(6)::before { content: "Devueltas"; }
    .c1-reportes .reports-sku-table td:nth-child(7)::before { content: "% devolución"; }

    .c1-reportes .reports-clients-table td:nth-child(1)::before { content: "Cliente"; }
    .c1-reportes .reports-clients-table td:nth-child(2)::before { content: "Despachos"; }
    .c1-reportes .reports-clients-table td:nth-child(3)::before { content: "Unidades"; }
    .c1-reportes .reports-clients-table td:nth-child(4)::before { content: "Devueltas"; }
    .c1-reportes .reports-clients-table td:nth-child(5)::before { content: "% devolución"; }

    .c1-reportes .reports-returns-table td:nth-child(1)::before { content: "Motivo"; }
    .c1-reportes .reports-returns-table td:nth-child(2)::before { content: "Unidades"; }
    .c1-reportes .reports-returns-table td:nth-child(3)::before { content: "Participación"; }

    .c1-reportes .reports-weekly-table td:nth-child(1),
    .c1-reportes .reports-sku-table td:nth-child(1),
    .c1-reportes .reports-clients-table td:nth-child(1),
    .c1-reportes .reports-returns-table td:nth-child(1) {
      display: block !important;
      text-align: left !important;
      padding-bottom: 7px !important;
      margin-bottom: 3px;
      border-bottom: 1px solid #f0e6e1 !important;
    }

    .c1-reportes .reports-weekly-table td:nth-child(1)::before,
    .c1-reportes .reports-sku-table td:nth-child(1)::before,
    .c1-reportes .reports-clients-table td:nth-child(1)::before,
    .c1-reportes .reports-returns-table td:nth-child(1)::before {
      display: none;
    }
  }
`
