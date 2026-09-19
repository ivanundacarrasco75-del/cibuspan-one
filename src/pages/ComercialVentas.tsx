import { Fragment, useEffect, useMemo, useState } from "react"

import {
  obtenerDetallePedidoDb,
  obtenerPedidosDb,
  type DetallePedidoConsultaDb,
  type PedidoListadoDb,
} from "../repositories/pedidoRepository"
import {
  obtenerImportacionesVentasDb,
  obtenerVentasDetallePorComprobantesDb,
  obtenerVentasDetalleRangoDb,
  type VentaDetalleDb,
} from "../repositories/ventasRepository"
import {
  obtenerDespachosConciliacionDb,
  type DespachoConciliacionDb,
} from "../repositories/despachoRepository"
import {
  conciliarUnidadesVentasDespachos,
  type FilaConciliacion,
} from "../services/conciliacionComercial"

type ComercialVentasProps = {
  cambiarPantalla: (pantalla: string) => void
}

type PedidoConDetalle = {
  pedido: PedidoListadoDb
  detalles: DetallePedidoConsultaDb[]
}

type VistaVentas = "DETALLE" | "CLIENTE" | "SKU" | "CONCILIACION"

type GrupoVenta = {
  id: string
  nombre: string
  secundario: string
  comprobantes: number
  unidades: number
  venta: number
  precioNetoPromedio: number
  solicitadas: number
  despachadas: number
  fillRate: number | null
}

const VINO = "#8F1D24"
const NARANJA = "#F7931E"

function fechaIsoLocal(fecha: Date) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function inicioMesDe(fechaIso: string) {
  const [anio, mes] = fechaIso.split("-")
  return `${anio}-${mes}-01`
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

function porcentaje(valor: number | null) {
  return valor === null ? "—" : `${valor.toFixed(1)}%`
}

function escaparCsv(valor: unknown) {
  return `"${String(valor ?? "").replaceAll('"', '""')}"`
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function claveClienteVenta(venta: VentaDetalleDb) {
  return venta.cliente_id
    ? `ID:${venta.cliente_id}`
    : `N:${normalizar(venta.cliente_nombre)}`
}

function claveProductoVenta(venta: VentaDetalleDb) {
  return venta.producto_id
    ? `ID:${venta.producto_id}`
    : `SKU:${normalizar(venta.sku)}`
}

function claveClientePedido(pedido: PedidoListadoDb) {
  return pedido.cliente?.id
    ? `ID:${pedido.cliente.id}`
    : `N:${normalizar(pedido.cliente?.nombre ?? "")}`
}

function claveProductoPedido(detalle: DetallePedidoConsultaDb) {
  return detalle.producto_id
    ? `ID:${detalle.producto_id}`
    : `SKU:${normalizar(detalle.producto?.codigo ?? "")}`
}

export default function ComercialVentas({
  cambiarPantalla,
}: ComercialVentasProps) {
  const hoy = fechaIsoLocal(new Date())
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")
  const [ventas, setVentas] = useState<VentaDetalleDb[]>([])
  const [ventasConciliacion, setVentasConciliacion] =
    useState<VentaDetalleDb[]>([])
  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([])
  const [despachosConciliacion, setDespachosConciliacion] =
    useState<DespachoConciliacionDb[]>([])
  const [clienteFiltro, setClienteFiltro] = useState("TODOS")
  const [skuFiltro, setSkuFiltro] = useState("TODOS")
  const [busqueda, setBusqueda] = useState("")
  const [vista, setVista] = useState<VistaVentas>("DETALLE")
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [periodoSinFacturacion, setPeriodoSinFacturacion] = useState(false)
  const [primeraFechaVentas, setPrimeraFechaVentas] =
    useState("")
  const [modoConciliacion, setModoConciliacion] =
    useState<"ACTIVA" | "HISTORICO">("ACTIVA")
  const [ventasHistoricas, setVentasHistoricas] =
    useState<VentaDetalleDb[]>([])
  const [cargandoHistorico, setCargandoHistorico] =
    useState(false)
  const [historicoCargado, setHistoricoCargado] =
    useState(false)

  useEffect(() => {
    cargarInicial()
  }, [])

  async function cargarInicial() {
    setCargando(true)
    setError("")

    try {
      const importaciones = await obtenerImportacionesVentasDb()
      const fechasDesde = importaciones
        .map((item) => item.fecha_desde)
        .filter(Boolean)
        .sort()

      const primeraFecha =
        fechasDesde[0] ??
        `${new Date().getFullYear()}-01-01`

      setPrimeraFechaVentas(primeraFecha)

      const ultimaFecha = importaciones
        .map((item) => item.fecha_hasta)
        .filter(Boolean)
        .sort()
        .at(-1) ?? hoy

      const desde = inicioMesDe(ultimaFecha)
      const hasta = ultimaFecha
      setFechaDesde(desde)
      setFechaHasta(hasta)
      await cargarPeriodo(desde, hasta)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la facturación real.",
      )
      setCargando(false)
    }
  }

  async function cargarPeriodo(desde = fechaDesde, hasta = fechaHasta) {
    if (!desde || !hasta) {
      setError("Selecciona un rango de fechas.")
      return
    }

    if (desde > hasta) {
      setError("La fecha desde no puede ser posterior a la fecha hasta.")
      return
    }

    setCargando(true)
    setError("")
    setPeriodoSinFacturacion(false)

    try {
      const [ventasDb, pedidosDb, despachosDb] = await Promise.all([
        obtenerVentasDetalleRangoDb(desde, hasta),
        obtenerPedidosDb(),
        obtenerDespachosConciliacionDb(),
      ])

      const facturasDespachosPeriodo =
        despachosDb
          .filter(
            (despacho) =>
              despacho.conciliacion_aplica &&
              despacho.fecha >= desde &&
              despacho.fecha <= hasta &&
              Boolean(
                despacho.numero_factura?.trim(),
              ),
          )
          .map(
            (despacho) =>
              despacho.numero_factura!,
          )

      const ventasVinculadas =
        await obtenerVentasDetallePorComprobantesDb(
          facturasDespachosPeriodo,
        )

      const ventasConciliacionMap =
        new Map<string, VentaDetalleDb>()

      ventasVinculadas.forEach((venta) =>
        ventasConciliacionMap.set(
          venta.id,
          venta,
        ),
      )

      const pedidosPeriodo = pedidosDb.filter(
        (pedido) =>
          pedido.estado === "DESPACHADO" &&
          pedido.fecha_entrega >= desde &&
          pedido.fecha_entrega <= hasta,
      )

      const pedidosConDetalle = await Promise.all(
        pedidosPeriodo.map(async (pedido) => ({
          pedido,
          detalles: await obtenerDetallePedidoDb(pedido.id),
        })),
      )

      setVentas(ventasDb)
      setVentasConciliacion(
        Array.from(
          ventasConciliacionMap.values(),
        ),
      )
      setPedidos(pedidosConDetalle)
      setDespachosConciliacion(despachosDb)
      setPeriodoSinFacturacion(ventasDb.length === 0)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las ventas.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function conciliarHistoricoHastaHoy() {
    const desde =
      primeraFechaVentas ||
      `${new Date().getFullYear()}-01-01`

    setCargandoHistorico(true)
    setError("")

    try {
      const historicas =
        await obtenerVentasDetalleRangoDb(
          desde,
          hoy,
        )

      setVentasHistoricas(historicas)
      setHistoricoCargado(true)
      setModoConciliacion("HISTORICO")
      setVista("CONCILIACION")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo ejecutar la conciliación histórica.",
      )
    } finally {
      setCargandoHistorico(false)
    }
  }

  const clientes = useMemo(() => {
    const mapa = new Map<string, string>()
    ventas.forEach((venta) => {
      mapa.set(claveClienteVenta(venta), venta.cliente_nombre)
    })
    return Array.from(mapa, ([id, nombre]) => ({ id, nombre })).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    )
  }, [ventas])

  const skus = useMemo(() => {
    const mapa = new Map<string, { id: string; codigo: string; nombre: string }>()
    ventas.forEach((venta) => {
      const id = claveProductoVenta(venta)
      mapa.set(id, {
        id,
        codigo: venta.sku,
        nombre: venta.producto_nombre,
      })
    })
    return Array.from(mapa.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    )
  }, [ventas])

  const ventasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()

    return ventas.filter((venta) => {
      if (
        clienteFiltro !== "TODOS" &&
        claveClienteVenta(venta) !== clienteFiltro
      ) {
        return false
      }

      if (
        skuFiltro !== "TODOS" &&
        claveProductoVenta(venta) !== skuFiltro
      ) {
        return false
      }

      if (!texto) return true

      return (
        venta.comprobante.toLowerCase().includes(texto) ||
        venta.cliente_nombre.toLowerCase().includes(texto) ||
        venta.sku.toLowerCase().includes(texto) ||
        venta.producto_nombre.toLowerCase().includes(texto)
      )
    })
  }, [ventas, clienteFiltro, skuFiltro, busqueda])

  const operacionFiltrada = useMemo(() => {
    return pedidos.flatMap(({ pedido, detalles }) =>
      detalles
        .filter((detalle) => {
          if (
            clienteFiltro !== "TODOS" &&
            claveClientePedido(pedido) !== clienteFiltro
          ) {
            return false
          }

          if (
            skuFiltro !== "TODOS" &&
            claveProductoPedido(detalle) !== skuFiltro
          ) {
            return false
          }

          return true
        })
        .map((detalle) => ({ pedido, detalle })),
    )
  }, [pedidos, clienteFiltro, skuFiltro])

  const ventasParaConciliar = useMemo(() => {
    return ventasConciliacion.filter((venta) => {
      if (
        clienteFiltro !== "TODOS" &&
        claveClienteVenta(venta) !== clienteFiltro
      ) return false

      if (
        skuFiltro !== "TODOS" &&
        claveProductoVenta(venta) !== skuFiltro
      ) return false

      return true
    })
  }, [
    ventasConciliacion,
    clienteFiltro,
    skuFiltro,
  ])

  const despachosParaConciliar = useMemo(() => {
    return despachosConciliacion
      .filter((despacho) => despacho.conciliacion_aplica)
      .flatMap(
        (despacho) =>
        despacho.detalles
          .filter((detalle) => {
            if (
              clienteFiltro !== "TODOS" &&
              (despacho.cliente_id
                ? `ID:${despacho.cliente_id}`
                : `N:${normalizar(
                    despacho.cliente_nombre,
                  )}`) !== clienteFiltro
            ) {
              return false
            }

            if (
              skuFiltro !== "TODOS" &&
              (detalle.producto_id
                ? `ID:${detalle.producto_id}`
                : `SKU:${normalizar(
                    detalle.sku,
                  )}`) !== skuFiltro
            ) {
              return false
            }

            return (
              Number(
                detalle.unidades ?? 0,
              ) > 0
            )
          })
          .map((detalle) => ({
            reservaId:
              despacho.reserva_id,
            pedidoId:
              despacho.pedido_id,
            pedidoNumero:
              despacho.numero_pedido_cliente ||
              despacho.pedido_id,
            numeroFactura:
              despacho.numero_factura,
            fecha: despacho.fecha,
            clienteId:
              despacho.cliente_id,
            cliente:
              despacho.cliente_nombre,
            productoId:
              detalle.producto_id,
            sku: detalle.sku,
            producto:
              detalle.producto_nombre,
            unidades: Number(
              detalle.unidades ?? 0,
            ),
          })),
    )
  }, [
    despachosConciliacion,
    clienteFiltro,
    skuFiltro,
  ])

  const conciliacion = useMemo(
    () =>
      conciliarUnidadesVentasDespachos(
        ventasParaConciliar.map(
          (venta) => ({
            id: venta.id,
            comprobante:
              venta.comprobante,
            fecha:
              venta.fecha_emision,
            clienteId:
              venta.cliente_id,
            cliente:
              venta.cliente_nombre,
            productoId:
              venta.producto_id,
            sku: venta.sku,
            producto:
              venta.producto_nombre,
            unidades: Number(
              venta.cantidad ?? 0,
            ),
          }),
        ),
        despachosParaConciliar,
        {
          desde: fechaDesde,
          hasta: fechaHasta,
        },
      ),
    [
      ventasParaConciliar,
      despachosParaConciliar,
      fechaDesde,
      fechaHasta,
    ],
  )

  const despachosHistoricosParaConciliar = useMemo(
    () =>
      despachosConciliacion.flatMap((despacho) =>
        despacho.detalles.map((detalle) => ({
          reservaId: despacho.reserva_id,
          pedidoId: despacho.pedido_id,
          pedidoNumero:
            despacho.numero_pedido_cliente ||
            despacho.pedido_id,
          numeroFactura: despacho.numero_factura,
          fecha: despacho.fecha,
          clienteId: despacho.cliente_id,
          cliente: despacho.cliente_nombre,
          productoId: detalle.producto_id,
          sku: detalle.sku,
          producto: detalle.producto_nombre,
          unidades: Number(detalle.unidades ?? 0),
        })),
      ),
    [despachosConciliacion],
  )

  const conciliacionHistorica = useMemo(() => {
    if (!historicoCargado) return null

    const desde =
      primeraFechaVentas ||
      `${new Date().getFullYear()}-01-01`

    return conciliarUnidadesVentasDespachos(
      ventasHistoricas.map((venta) => ({
        id: venta.id,
        comprobante: venta.comprobante,
        fecha: venta.fecha_emision,
        clienteId: venta.cliente_id,
        cliente: venta.cliente_nombre,
        productoId: venta.producto_id,
        sku: venta.sku,
        producto: venta.producto_nombre,
        unidades: Number(venta.cantidad ?? 0),
      })),
      despachosHistoricosParaConciliar,
      { desde, hasta: hoy },
    )
  }, [
    historicoCargado,
    primeraFechaVentas,
    ventasHistoricas,
    despachosHistoricosParaConciliar,
    hoy,
  ])

  const conciliacionMostrada =
    modoConciliacion === "HISTORICO" &&
    conciliacionHistorica
      ? conciliacionHistorica
      : conciliacion

  const resumen = useMemo(() => {
    const venta = ventasFiltradas.reduce(
      (total, item) => total + Number(item.total_sin_impuestos ?? 0),
      0,
    )
    const unidadesFacturadas = ventasFiltradas.reduce(
      (total, item) => total + Number(item.cantidad ?? 0),
      0,
    )
    const comprobantes = new Set(
      ventasFiltradas.map((item) => item.comprobante),
    ).size
    const solicitadas = operacionFiltrada.reduce(
      (total, item) => total + Number(item.detalle.total_unidades ?? 0),
      0,
    )
    const despachadas = operacionFiltrada.reduce(
      (total, item) => total + Number(item.detalle.unidades_despachadas ?? 0),
      0,
    )
    const fillRate =
      solicitadas > 0 ? (despachadas / solicitadas) * 100 : null

    return {
      venta,
      unidadesFacturadas,
      comprobantes,
      solicitadas,
      despachadas,
      fillRate,
    }
  }, [ventasFiltradas, operacionFiltrada])

  const operacionPorCliente = useMemo(() => {
    const mapa = new Map<string, { solicitadas: number; despachadas: number }>()
    pedidos.forEach(({ pedido, detalles }) => {
      const key = claveClientePedido(pedido)
      const actual = mapa.get(key) ?? { solicitadas: 0, despachadas: 0 }
      detalles.forEach((detalle) => {
        if (
          skuFiltro !== "TODOS" &&
          claveProductoPedido(detalle) !== skuFiltro
        ) return
        actual.solicitadas += Number(detalle.total_unidades ?? 0)
        actual.despachadas += Number(detalle.unidades_despachadas ?? 0)
      })
      mapa.set(key, actual)
    })
    return mapa
  }, [pedidos, skuFiltro])

  const operacionPorSku = useMemo(() => {
    const mapa = new Map<string, { solicitadas: number; despachadas: number }>()
    pedidos.forEach(({ pedido, detalles }) => {
      if (
        clienteFiltro !== "TODOS" &&
        claveClientePedido(pedido) !== clienteFiltro
      ) return

      detalles.forEach((detalle) => {
        const key = claveProductoPedido(detalle)
        const actual = mapa.get(key) ?? { solicitadas: 0, despachadas: 0 }
        actual.solicitadas += Number(detalle.total_unidades ?? 0)
        actual.despachadas += Number(detalle.unidades_despachadas ?? 0)
        mapa.set(key, actual)
      })
    })
    return mapa
  }, [pedidos, clienteFiltro])

  function agrupar(tipo: "CLIENTE" | "SKU") {
    const mapa = new Map<
      string,
      {
        id: string
        nombre: string
        secundario: string
        comprobantes: Set<string>
        unidades: number
        venta: number
        valorNetoPonderado: number
      }
    >()

    ventasFiltradas.forEach((venta) => {
      const id =
        tipo === "CLIENTE"
          ? claveClienteVenta(venta)
          : claveProductoVenta(venta)
      const nombre =
        tipo === "CLIENTE" ? venta.cliente_nombre : venta.producto_nombre
      const secundario = tipo === "CLIENTE" ? "Cliente" : venta.sku
      const actual = mapa.get(id) ?? {
        id,
        nombre,
        secundario,
        comprobantes: new Set<string>(),
        unidades: 0,
        venta: 0,
        valorNetoPonderado: 0,
      }

      const unidades = Number(venta.cantidad ?? 0)
      actual.comprobantes.add(venta.comprobante)
      actual.unidades += unidades
      actual.venta += Number(venta.total_sin_impuestos ?? 0)
      actual.valorNetoPonderado += unidades * Number(venta.precio_neto ?? 0)
      mapa.set(id, actual)
    })

    return Array.from(mapa.values())
      .map<GrupoVenta>((item) => {
        const op =
          tipo === "CLIENTE"
            ? operacionPorCliente.get(item.id)
            : operacionPorSku.get(item.id)
        const solicitadas = Number(op?.solicitadas ?? 0)
        const despachadas = Number(op?.despachadas ?? 0)
        return {
          id: item.id,
          nombre: item.nombre,
          secundario: item.secundario,
          comprobantes: item.comprobantes.size,
          unidades: item.unidades,
          venta: item.venta,
          precioNetoPromedio:
            item.unidades > 0 ? item.valorNetoPonderado / item.unidades : 0,
          solicitadas,
          despachadas,
          fillRate:
            solicitadas > 0 ? (despachadas / solicitadas) * 100 : null,
        }
      })
      .sort((a, b) => b.venta - a.venta)
  }

  const resumenClientes = useMemo(
    () => agrupar("CLIENTE"),
    [ventasFiltradas, operacionPorCliente],
  )

  const resumenSku = useMemo(
    () => agrupar("SKU"),
    [ventasFiltradas, operacionPorSku],
  )

  function limpiarFiltros() {
    setClienteFiltro("TODOS")
    setSkuFiltro("TODOS")
    setBusqueda("")
  }

  function exportarCsv() {
    const encabezados = [
      "Fecha",
      "Comprobante",
      "Cliente",
      "Codigo SKU",
      "Producto",
      "Cantidad",
      "Precio unitario",
      "Descuento",
      "Precio neto",
      "Total sin impuestos",
    ]

    const filas = ventasFiltradas.map((venta) => [
      venta.fecha_emision,
      venta.comprobante,
      venta.cliente_nombre,
      venta.sku,
      venta.producto_nombre,
      venta.cantidad,
      venta.precio_unitario,
      venta.descuento,
      venta.precio_neto,
      venta.total_sin_impuestos,
    ])

    const contenido = [encabezados, ...filas]
      .map((fila) => fila.map(escaparCsv).join(","))
      .join("\n")

    const blob = new Blob([`\uFEFF${contenido}`], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = `ventas-reales-cibuspan-${fechaDesde}-${fechaHasta}.csv`
    enlace.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="sales-page">
      <style>{css}</style>

      <header className="sales-header">
        <div>
          <span className="sales-kicker">COMERCIAL · VENTAS</span>
          <h1>Ventas</h1>
          <p>
            Facturación real importada del reporte VENTAS POR ITEM, cruzada con
            el desempeño operativo de pedidos y despachos.
          </p>
        </div>

        <div className="sales-header-actions">
          <button type="button" className="secondary" onClick={() => window.print()}>
            Imprimir
          </button>
          <button
            type="button"
            className="secondary"
            onClick={exportarCsv}
            disabled={cargando || ventasFiltradas.length === 0}
          >
            Exportar CSV
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => cargarPeriodo()}
            disabled={cargando}
          >
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </header>

      <section className="sales-source-note">
        <div>
          <strong>Fuente monetaria oficial:</strong> com_ventas_detalle · Total sin impuestos.
        </div>
        <span>
          <strong>Fill Rate:</strong> pedidos DESPACHADOS · unidades despachadas / solicitadas.
        </span>
      </section>

      {error && <div className="sales-error">{error}</div>}

      {periodoSinFacturacion && !cargando && (
        <div className="sales-warning">
          <strong>No hay facturación importada para este periodo.</strong> Si ya existe el
          reporte VENTAS POR ITEM, impórtalo desde el módulo histórico de ventas.
          Los despachos operativos no se convierten automáticamente en dólares para
          evitar estimaciones contables.
        </div>
      )}

      {!cargando &&
        conciliacion.tieneDespachos &&
        (conciliacion.tieneFacturas ? (
          conciliacion.validado ? (
            <div className="sales-reconciliation-ok">
              <div>
                <strong>
                  Conciliación automática validada.
                </strong>{" "}
                Solo se controlan los despachos nuevos confirmados
                desde la activación de esta función.
              </div>
              <span>
                {numero(conciliacion.totalDespachadas)} Unid. ={" "}
                {numero(conciliacion.totalFacturadas)} Unid.
              </span>
            </div>
          ) : (
            <div className="sales-reconciliation-warning">
              <div>
                <strong>
                  Conciliación automática requiere revisión.
                </strong>{" "}
                {numero(conciliacion.gruposConciliadosFactura)} coincidencias
                validadas por factura ·{" "}
                {numero(conciliacion.pendientesVincular)} pendientes de vínculo ·{" "}
                {numero(conciliacion.gruposConDiferencia)} diferencias.
              </div>
              <button
                type="button"
                onClick={() => {
                  setModoConciliacion("ACTIVA")
                  setVista("CONCILIACION")
                }}
              >
                Ver qué pasó
              </button>
            </div>
          )
        ) : (
          <div className="sales-reconciliation-warning">
            <div>
              <strong>
                Despachos nuevos pendientes de vínculo o facturación.
              </strong>{" "}
              Hay movimientos dentro del control automático sin una factura
              vinculada/importada que permita validarlos.
            </div>
            <button
              type="button"
              onClick={() => {
                setModoConciliacion("ACTIVA")
                setVista("CONCILIACION")
              }}
            >
              Revisar
            </button>
          </div>
        ))}

      {!cargando &&
        !conciliacion.tieneDespachos && (
          <div className="sales-reconciliation-info">
            <strong>
              Control automático activo.
            </strong>{" "}
            Los despachos históricos están excluidos. Las alertas comenzarán
            únicamente con los nuevos despachos confirmados usando esta versión.
          </div>
        )}

      <section className="sales-filter-panel">
        <div className="sales-filter-grid">
          <label>
            <span>Desde</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(evento) => setFechaDesde(evento.target.value)}
            />
          </label>

          <label>
            <span>Hasta</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(evento) => setFechaHasta(evento.target.value)}
            />
          </label>

          <label>
            <span>Cliente</span>
            <select
              value={clienteFiltro}
              onChange={(evento) => setClienteFiltro(evento.target.value)}
            >
              <option value="TODOS">Todos los clientes</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>SKU</span>
            <select
              value={skuFiltro}
              onChange={(evento) => setSkuFiltro(evento.target.value)}
            >
              <option value="TODOS">Todos los SKU</option>
              {skus.map((sku) => (
                <option key={sku.id} value={sku.id}>
                  {sku.codigo} · {sku.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="sales-search">
            <span>Buscar</span>
            <input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Comprobante, cliente o SKU"
            />
          </label>
        </div>

        <div className="sales-filter-actions">
          <button type="button" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
          <button type="button" className="apply" onClick={() => cargarPeriodo()}>
            Aplicar periodo
          </button>
        </div>
      </section>

      <section className="sales-kpis">
        <article>
          <span>Venta sin impuestos</span>
          <strong>{ventasFiltradas.length > 0 ? moneda(resumen.venta) : "—"}</strong>
          <small>facturación real importada</small>
        </article>

        <article>
          <span>Unidades facturadas</span>
          <strong>{numero(resumen.unidadesFacturadas)}</strong>
          <small>
            {numero(resumen.despachadas)} Unid. despachadas · diferencia{" "}
            {numero(resumen.unidadesFacturadas - resumen.despachadas)}
          </small>
        </article>

        <article>
          <span>Fill Rate operativo</span>
          <strong>{porcentaje(resumen.fillRate)}</strong>
          <small>
            {numero(resumen.despachadas)} / {numero(resumen.solicitadas)} Unid.
          </small>
        </article>

        <article>
          <span>Comprobantes</span>
          <strong>{numero(resumen.comprobantes)}</strong>
          <small>documentos de venta en el filtro</small>
        </article>
      </section>

      <section className="sales-shortcuts">
        <button type="button" onClick={() => cambiarPantalla("Comercial · Pedidos")}>
          Pedidos
        </button>
        <button type="button" onClick={() => cambiarPantalla("Comercial · Devoluciones")}>
          Devoluciones
        </button>
        <button type="button" onClick={() => cambiarPantalla("Comercial · Resumen")}>
          Dashboard comercial
        </button>
      </section>

      <nav className="sales-tabs" aria-label="Vista de ventas">
        <button
          type="button"
          className={vista === "DETALLE" ? "active" : ""}
          onClick={() => setVista("DETALLE")}
        >
          Detalle real
        </button>
        <button
          type="button"
          className={vista === "CLIENTE" ? "active" : ""}
          onClick={() => setVista("CLIENTE")}
        >
          Por cliente
        </button>
        <button
          type="button"
          className={vista === "SKU" ? "active" : ""}
          onClick={() => setVista("SKU")}
        >
          Por SKU
        </button>
        <button
          type="button"
          className={vista === "CONCILIACION" ? "active" : ""}
          onClick={() => {
            setModoConciliacion("ACTIVA")
            setVista("CONCILIACION")
          }}
        >
          Conciliación
          {conciliacion.gruposConDiferencia +
            conciliacion.pendientesVincular >
            0 && (
            <span className="sales-tab-alert">
              {conciliacion.gruposConDiferencia +
                conciliacion.pendientesVincular}
            </span>
          )}
        </button>
      </nav>

      {cargando ? (
        <div className="sales-empty">Cargando facturación real...</div>
      ) : vista === "CONCILIACION" ? (
        <>
          <div className="reconciliation-mode-bar">
            <div>
              <strong>
                {modoConciliacion === "ACTIVA"
                  ? "Control automático desde activación"
                  : "Revisión histórica manual"}
              </strong>
              <small>
                {modoConciliacion === "ACTIVA"
                  ? "Los despachos anteriores no generan alertas."
                  : `Revisión informativa desde ${
                      primeraFechaVentas ||
                      `${new Date().getFullYear()}-01-01`
                    } hasta ${hoy}. No modifica el control oficial.`}
              </small>
            </div>

            <div className="reconciliation-mode-actions">
              {modoConciliacion === "HISTORICO" && (
                <button
                  type="button"
                  onClick={() =>
                    setModoConciliacion("ACTIVA")
                  }
                >
                  Volver al control activo
                </button>
              )}

              <button
                type="button"
                className="historical"
                disabled={cargandoHistorico}
                onClick={conciliarHistoricoHastaHoy}
              >
                {cargandoHistorico
                  ? "Conciliando..."
                  : "Conciliar histórico hasta hoy"}
              </button>
            </div>
          </div>

          <ConciliacionVentas
            filas={conciliacionMostrada.filas}
            historico={
              modoConciliacion === "HISTORICO"
            }
          />
        </>
      ) : ventasFiltradas.length === 0 ? (
        <div className="sales-empty">
          No existen ventas importadas para los filtros seleccionados.
        </div>
      ) : vista === "DETALLE" ? (
        <DetalleVentas lineas={ventasFiltradas} />
      ) : (
        <ResumenAgrupado
          filas={vista === "CLIENTE" ? resumenClientes : resumenSku}
          titulo={vista === "CLIENTE" ? "Cliente" : "SKU"}
        />
      )}

      <footer className="sales-footer">
        <strong>Criterio:</strong> el valor monetario corresponde al campo “Tot sin Imptos”
        del reporte de facturación importado. El Fill Rate continúa siendo un indicador
        operativo calculado con pedidos cerrados y unidades realmente despachadas.
      </footer>
    </main>
  )
}

function DetalleVentas({ lineas }: { lineas: VentaDetalleDb[] }) {
  return (
    <section className="sales-panel">
      <div className="sales-panel-head">
        <div>
          <span>FACTURACIÓN REAL</span>
          <h2>Detalle de ventas</h2>
        </div>
        <small>{numero(lineas.length)} líneas</small>
      </div>

      <div className="sales-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Comprobante</th>
              <th>Cliente</th>
              <th>SKU</th>
              <th>Cant.</th>
              <th>Unitario</th>
              <th>Dcto.</th>
              <th>Neto</th>
              <th>Total sin impuestos</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((venta) => (
              <tr key={venta.id}>
                <td data-label="Fecha">{venta.fecha_emision}</td>
                <td data-label="Comprobante"><strong>{venta.comprobante}</strong></td>
                <td data-label="Cliente"><strong>{venta.cliente_nombre}</strong></td>
                <td data-label="SKU">
                  <strong>{venta.producto_nombre}</strong>
                  <small>{venta.sku}</small>
                </td>
                <td data-label="Cant.">{numero(Number(venta.cantidad))}</td>
                <td data-label="Unitario">{moneda(Number(venta.precio_unitario))}</td>
                <td data-label="Dcto.">{moneda(Number(venta.descuento))}</td>
                <td data-label="Neto">{moneda(Number(venta.precio_neto))}</td>
                <td data-label="Total sin impuestos">
                  <strong>{moneda(Number(venta.total_sin_impuestos))}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ResumenAgrupado({
  filas,
  titulo,
}: {
  filas: GrupoVenta[]
  titulo: string
}) {
  return (
    <section className="sales-panel">
      <div className="sales-panel-head">
        <div>
          <span>CONSOLIDADO REAL</span>
          <h2>Ventas por {titulo.toLowerCase()}</h2>
        </div>
        <small>{numero(filas.length)} registros</small>
      </div>

      <div className="sales-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{titulo}</th>
              <th>Comprobantes</th>
              <th>Unid. facturadas</th>
              <th>Precio neto prom.</th>
              <th>Venta sin impuestos</th>
              <th>Despachadas</th>
              <th>Fill Rate</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.id}>
                <td data-label={titulo}>
                  <strong>{fila.nombre}</strong>
                  <small>{fila.secundario}</small>
                </td>
                <td data-label="Comprobantes">{numero(fila.comprobantes)}</td>
                <td data-label="Unid. facturadas"><strong>{numero(fila.unidades)}</strong></td>
                <td data-label="Precio neto prom.">{moneda(fila.precioNetoPromedio)}</td>
                <td data-label="Venta sin impuestos"><strong>{moneda(fila.venta)}</strong></td>
                <td data-label="Despachadas">{numero(fila.despachadas)}</td>
                <td data-label="Fill Rate">
                  <span className={
                    fila.fillRate === null
                      ? "neutral"
                      : fila.fillRate >= 98
                        ? "good"
                        : fila.fillRate >= 95
                          ? "warn"
                          : "bad"
                  }>
                    {porcentaje(fila.fillRate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}


function etiquetaEstadoConciliacion(
  estado: FilaConciliacion["estado"],
) {
  switch (estado) {
    case "CONCILIADO":
      return "Conciliado por factura"
    case "COINCIDE_SIN_VINCULO":
      return "Coincide · falta vincular"
    case "PENDIENTE_VINCULAR":
      return "Despacho sin N.º factura"
    case "FACTURA_NO_ENCONTRADA":
      return "Factura no encontrada"
    case "FACTURADO_NO_DESPACHADO":
      return "Facturado sin despacho"
    case "DESPACHADO_NO_FACTURADO":
      return "SKU despachado no facturado"
    case "DESPACHO_MAYOR":
      return "Despacho mayor"
    case "FACTURA_MAYOR":
      return "Factura mayor"
    case "CLIENTE_DIFERENTE":
      return "Cliente no coincide"
  }
}

function ConciliacionVentas({
  filas,
  historico = false,
}: {
  filas: FilaConciliacion[]
  historico?: boolean
}) {
  const [abierta, setAbierta] =
    useState<string | null>(null)

  if (filas.length === 0) {
    return (
      <div className="sales-empty">
        No existen movimientos de despacho
        ni facturación para conciliar.
      </div>
    )
  }

  return (
    <section className="sales-panel">
      <div className="sales-panel-head">
        <div>
          <span>
            {historico
              ? "REVISIÓN HISTÓRICA"
              : "CONTROL CRUZADO"}
          </span>
          <h2>
            {historico
              ? "Conciliación histórica informativa"
              : "Conciliación despacho vs. factura"}
          </h2>
        </div>
        <small>
          Factura → Cliente → SKU → Unidades
        </small>
      </div>

      <div className="sales-reconciliation-explainer">
        {historico ? (
          <>
            <strong>
              Revisión manual del histórico disponible.
            </strong>{" "}
            Puede mostrar diferencias porque antes de activar el sistema no se
            registraban todos los despachos. Este resultado no genera alertas
            oficiales ni modifica ningún dato.
          </>
        ) : (
          <>
            <strong>
              Primera llave: N.º de factura.
            </strong>{" "}
            Cuando el despacho tiene factura vinculada, se busca exactamente
            ese comprobante y se validan sus SKU y unidades. Los históricos
            quedan fuera del control automático.
          </>
        )}
      </div>

      <div className="sales-table-wrap">
        <table className="sales-reconciliation-table">
          <thead>
            <tr>
              <th>Factura / método</th>
              <th>Cliente</th>
              <th>SKU</th>
              <th>Despachadas</th>
              <th>Facturadas</th>
              <th>Diferencia</th>
              <th>Estado</th>
              <th>Revisión</th>
            </tr>
          </thead>

          <tbody>
            {filas.map((fila) => (
              <Fragment key={fila.id}>
                <tr
                  className={
                    fila.estado ===
                    "CONCILIADO"
                      ? ""
                      : "row-mismatch"
                  }
                >
                  <td data-label="Factura / método">
                    <strong>
                      {fila.numeroFactura ||
                        "Sin vínculo"}
                    </strong>
                    <small>
                      {fila.metodo ===
                      "FACTURA"
                        ? "Vínculo directo"
                        : "Respaldo Cliente + SKU"}
                    </small>
                  </td>

                  <td data-label="Cliente">
                    <strong>
                      {fila.cliente}
                    </strong>
                  </td>

                  <td data-label="SKU">
                    <strong>
                      {fila.producto}
                    </strong>
                    <small>
                      {fila.sku}
                    </small>
                  </td>

                  <td data-label="Despachadas">
                    {numero(
                      fila.despachadas,
                    )}
                  </td>

                  <td data-label="Facturadas">
                    {numero(
                      fila.facturadas,
                    )}
                  </td>

                  <td data-label="Diferencia">
                    <strong
                      className={
                        Math.abs(
                          fila.diferencia,
                        ) <= 0.001
                          ? "difference-zero"
                          : "difference-alert"
                      }
                    >
                      {fila.diferencia > 0
                        ? "+"
                        : ""}
                      {numero(
                        fila.diferencia,
                      )}
                    </strong>
                  </td>

                  <td data-label="Estado">
                    <span
                      className={
                        fila.estado ===
                        "CONCILIADO"
                          ? "reconciliation-status ok"
                          : fila.estado ===
                              "COINCIDE_SIN_VINCULO"
                            ? "reconciliation-status pending"
                            : "reconciliation-status alert"
                      }
                    >
                      {etiquetaEstadoConciliacion(
                        fila.estado,
                      )}
                    </span>
                  </td>

                  <td data-label="Revisión">
                    <button
                      type="button"
                      className="reconciliation-detail-button"
                      onClick={() =>
                        setAbierta(
                          abierta === fila.id
                            ? null
                            : fila.id,
                        )
                      }
                    >
                      {abierta === fila.id
                        ? "Cerrar"
                        : "Ver detalle"}
                    </button>
                  </td>
                </tr>

                {abierta === fila.id && (
                  <tr className="reconciliation-detail-row">
                    <td colSpan={8}>
                      <div className="reconciliation-detail-grid">
                        <div>
                          <h4>
                            Fuente 1 · Despachos
                          </h4>

                          {fila.despachos
                            .length === 0 ? (
                            <p className="reconciliation-empty-source">
                              No existe despacho
                              relacionado.
                            </p>
                          ) : (
                            <table className="reconciliation-source-table">
                              <thead>
                                <tr>
                                  <th>
                                    Fecha
                                  </th>
                                  <th>
                                    Pedido
                                  </th>
                                  <th>
                                    Factura vinculada
                                  </th>
                                  <th>
                                    Unid.
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {fila.despachos.map(
                                  (
                                    item,
                                    indice,
                                  ) => (
                                    <tr
                                      key={`${item.reservaId}-${item.sku}-${indice}`}
                                    >
                                      <td>
                                        {
                                          item.fecha
                                        }
                                      </td>
                                      <td>
                                        {
                                          item.pedidoNumero
                                        }
                                      </td>
                                      <td>
                                        {item.numeroFactura ||
                                          "Pendiente"}
                                      </td>
                                      <td>
                                        {numero(
                                          item.unidades,
                                        )}
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>

                        <div>
                          <h4>
                            Fuente 2 · Facturación
                          </h4>

                          {fila.facturas
                            .length === 0 ? (
                            <p className="reconciliation-empty-source">
                              No existe comprobante
                              importado que
                              corresponda.
                            </p>
                          ) : (
                            <table className="reconciliation-source-table">
                              <thead>
                                <tr>
                                  <th>
                                    Fecha
                                  </th>
                                  <th>
                                    Comprobante
                                  </th>
                                  <th>
                                    Unid.
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {fila.facturas.map(
                                  (item) => (
                                    <tr
                                      key={
                                        item.id
                                      }
                                    >
                                      <td>
                                        {
                                          item.fecha
                                        }
                                      </td>
                                      <td>
                                        {
                                          item.comprobante
                                        }
                                      </td>
                                      <td>
                                        {numero(
                                          item.unidades,
                                        )}
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>

                      <div className="reconciliation-causes">
                        <strong>
                          Qué revisar:
                        </strong>{" "}
                        número de factura digitado,
                        factura todavía no importada,
                        cliente distinto, SKU omitido,
                        unidades diferentes,
                        duplicidad o
                        corrección/anulación.
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const css = `
  .sales-page {
    width: 100%;
    max-width: none;
    margin: 0;
    box-sizing: border-box;
    padding: 26px 28px 46px;
    color: #332824;
    font-variant-numeric: tabular-nums;
  }

  .sales-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 14px;
  }

  .sales-kicker,
  .sales-panel-head span {
    color: ${NARANJA};
    font-size: 10px;
    font-weight: 950;
    letter-spacing: 1.2px;
  }

  .sales-header h1 {
    margin: 4px 0 4px;
    color: ${VINO};
    font-size: clamp(28px, 3vw, 38px);
  }

  .sales-header p {
    margin: 0;
    color: #786b66;
    font-size: 13px;
  }

  .sales-header-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .sales-header-actions button,
  .sales-filter-actions button,
  .sales-shortcuts button,
  .sales-tabs button {
    min-height: 40px;
    padding: 0 14px;
    border-radius: 8px;
    font-weight: 850;
    cursor: pointer;
  }

  .sales-header-actions button:disabled {
    opacity: .55;
    cursor: wait;
  }

  .sales-header-actions .primary,
  .sales-filter-actions .apply {
    border: 1px solid ${VINO};
    background: ${VINO};
    color: white;
  }

  .sales-header-actions .secondary,
  .sales-filter-actions button,
  .sales-shortcuts button {
    border: 1px solid #dfd4ce;
    background: white;
    color: ${VINO};
  }

  .sales-source-note {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
    padding: 10px 13px;
    border: 1px solid #e4dad5;
    border-left: 4px solid ${NARANJA};
    border-radius: 8px;
    background: #fffaf6;
    color: #756863;
    font-size: 10px;
  }

  .sales-source-note strong { color: #54312f; }

  .sales-error,
  .sales-warning {
    margin-bottom: 14px;
    padding: 12px 14px;
    border-radius: 7px;
    font-size: 11px;
    line-height: 1.5;
  }

  .sales-error {
    border-left: 4px solid #c73636;
    background: #fff0f0;
    color: #9f2525;
  }

  .sales-warning {
    border-left: 4px solid #d99a28;
    background: #fff8e8;
    color: #805f1f;
  }

  .sales-filter-panel {
    margin-bottom: 15px;
    padding: 15px;
    border: 1px solid #e7ddd7;
    border-radius: 10px;
    background: white;
    box-shadow: 0 4px 15px rgba(70, 43, 34, .04);
  }

  .sales-filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    width: 100%;
  }

  .sales-search { min-width: 0; }

  .sales-filter-grid label { min-width: 0; }

  .sales-filter-grid label > span {
    display: block;
    margin-bottom: 5px;
    color: #7d6f69;
    font-size: 9px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .45px;
  }

  .sales-filter-grid input,
  .sales-filter-grid select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 39px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid #dcd2cc;
    border-radius: 7px;
    background: white;
    color: #433734;
  }

  .sales-filter-grid input:focus,
  .sales-filter-grid select:focus {
    outline: 2px solid rgba(247, 147, 30, .18);
    border-color: ${NARANJA};
  }

  .sales-filter-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 11px;
  }

  .sales-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 11px;
    margin-bottom: 13px;
  }

  .sales-kpis article {
    min-width: 0;
    padding: 15px 16px;
    border: 1px solid #e8dfda;
    border-top: 3px solid ${NARANJA};
    border-radius: 9px;
    background: linear-gradient(145deg, #fffaf7, #fff);
    box-shadow: 0 4px 14px rgba(70, 43, 34, .04);
  }

  .sales-kpis span {
    display: block;
    color: #796b65;
    font-size: 9px;
    font-weight: 950;
    letter-spacing: .45px;
    text-transform: uppercase;
  }

  .sales-kpis strong {
    display: block;
    margin: 6px 0 3px;
    color: ${VINO};
    font-size: 25px;
    line-height: 1.05;
  }

  .sales-kpis small {
    color: #9a8c86;
    font-size: 9px;
  }

  .sales-shortcuts {
    display: flex;
    gap: 7px;
    margin-bottom: 15px;
  }

  .sales-shortcuts button {
    min-height: 34px;
    padding: 0 11px;
    font-size: 10px;
  }

  .sales-tabs {
    display: flex;
    gap: 4px;
    width: fit-content;
    max-width: 100%;
    margin-bottom: 12px;
    padding: 4px;
    border-radius: 9px;
    background: #f1ebe7;
    overflow-x: auto;
  }

  .sales-tabs button {
    min-height: 36px;
    border: 0;
    background: transparent;
    color: #796b65;
    font-size: 10px;
  }

  .sales-tabs button.active {
    background: white;
    color: ${VINO};
    box-shadow: 0 2px 8px rgba(72, 45, 36, .1);
  }

  .sales-panel {
    border: 1px solid #e5dcd7;
    border-radius: 10px;
    background: white;
    box-shadow: 0 5px 18px rgba(62, 40, 33, .045);
    overflow: hidden;
  }

  .sales-panel-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 17px 12px;
    border-bottom: 1px solid #eee6e1;
  }

  .sales-panel-head h2 {
    margin: 3px 0 0;
    color: #4f2b2b;
    font-size: 19px;
  }

  .sales-panel-head small {
    color: #9b8d87;
    font-size: 10px;
  }

  .sales-table-wrap {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
  }

  .sales-table-wrap table {
    width: 100%;
    min-width: 0;
    table-layout: auto;
    border-collapse: collapse;
  }

  .sales-table-wrap th {
    padding: 9px 7px;
    border-bottom: 2px solid #e9dfda;
    background: #fcfaf8;
    color: #887a74;
    font-size: 7.5px;
    font-weight: 950;
    letter-spacing: .4px;
    text-align: right;
    text-transform: uppercase;
  }

  .sales-table-wrap th:nth-child(-n+4) { text-align: left; }

  .sales-table-wrap td {
    padding: 10px 7px;
    border-bottom: 1px solid #f0e9e5;
    color: #514641;
    font-size: 9.5px;
    text-align: right;
    vertical-align: middle;
  }

  .sales-table-wrap td:nth-child(-n+4) { text-align: left; }
  .sales-table-wrap td strong { color: #4f2e2e; }
  .sales-table-wrap td small {
    display: block;
    margin-top: 2px;
    color: #9c8e88;
    font-size: 8px;
  }

  .sales-table-wrap th,
  .sales-table-wrap td { overflow-wrap: anywhere; }

  .sales-table-wrap td:nth-child(3),
  .sales-table-wrap td:nth-child(4) { min-width: 110px; }

  .sales-table-wrap tbody tr:hover { background: #fffbf8; }

  .good,
  .warn,
  .bad,
  .neutral {
    display: inline-flex;
    padding: 4px 7px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 900;
    white-space: nowrap;
  }

  .good { background: #e8f7ed; color: #087b35; }
  .warn { background: #fff4dc; color: #956512; }
  .bad { background: #fff0f0; color: #b62b2b; }
  .neutral { background: #f1efed; color: #7a6e68; }

  .sales-empty {
    padding: 48px 20px;
    border: 1px dashed #d8ccc5;
    border-radius: 10px;
    background: #fff;
    color: #8e817b;
    text-align: center;
  }

  .sales-footer {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 8px;
    background: #f7f3f0;
    color: #7b6d67;
    font-size: 9px;
    line-height: 1.5;
  }


  .reconciliation-mode-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 12px;
    padding: 12px 14px;
    border: 1px solid #e8ddd7;
    border-radius: 9px;
    background: white;
  }

  .reconciliation-mode-bar > div:first-child {
    display: grid;
    gap: 3px;
  }

  .reconciliation-mode-bar strong {
    color: #5e302f;
    font-size: 11px;
  }

  .reconciliation-mode-bar small {
    color: #81736e;
    font-size: 9px;
    line-height: 1.4;
  }

  .reconciliation-mode-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .reconciliation-mode-actions button {
    min-height: 34px;
    padding: 0 11px;
    border: 1px solid #d9cec8;
    border-radius: 7px;
    background: white;
    color: #6b5650;
    font-size: 9px;
    font-weight: 900;
    cursor: pointer;
  }

  .reconciliation-mode-actions button.historical {
    border-color: #8F1D24;
    color: #8F1D24;
  }

  .reconciliation-mode-actions button:disabled {
    opacity: .55;
    cursor: wait;
  }

  .sales-reconciliation-ok,
  .sales-reconciliation-warning,
  .sales-reconciliation-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
    padding: 12px 14px;
    border-radius: 8px;
    font-size: 10px;
    line-height: 1.45;
  }

  .sales-reconciliation-ok {
    border: 1px solid #ccebd7;
    border-left: 4px solid #159447;
    background: #effaf3;
    color: #28623e;
  }

  .sales-reconciliation-warning {
    border: 1px solid #f1d4d4;
    border-left: 4px solid #c73636;
    background: #fff4f4;
    color: #8f2929;
  }

  .sales-reconciliation-warning button {
    flex: 0 0 auto;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid #b92f2f;
    border-radius: 7px;
    background: white;
    color: #a12a2a;
    font-weight: 900;
    cursor: pointer;
  }

  .sales-reconciliation-info {
    border: 1px solid #ecdcae;
    border-left: 4px solid #d99a28;
    background: #fff9e9;
    color: #7f6328;
  }

  .sales-tab-alert {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 999px;
    background: #c73636;
    color: white;
    font-size: 8px;
    font-weight: 950;
  }

  .sales-reconciliation-explainer {
    padding: 10px 16px;
    border-bottom: 1px solid #eee6e1;
    background: #fffaf6;
    color: #756863;
    font-size: 9px;
    line-height: 1.5;
  }

  .sales-reconciliation-table .row-mismatch {
    background: #fffafa;
  }

  .difference-zero { color: #15803d; }
  .difference-alert { color: #b42318 !important; }

  .reconciliation-status {
    display: inline-flex;
    padding: 4px 7px;
    border-radius: 999px;
    font-size: 8px;
    font-weight: 950;
    white-space: nowrap;
  }

  .reconciliation-status.ok {
    background: #e8f7ed;
    color: #087b35;
  }

  .reconciliation-status.alert {
    background: #fff0f0;
    color: #b62b2b;
  }

  .reconciliation-status.pending {
    background: #fff7df;
    color: #8a6315;
  }

  .reconciliation-detail-button {
    min-height: 30px;
    padding: 0 9px;
    border: 1px solid #dfd4ce;
    border-radius: 6px;
    background: white;
    color: #8F1D24;
    font-size: 8px;
    font-weight: 900;
    cursor: pointer;
  }

  .reconciliation-detail-row > td {
    padding: 0 !important;
    background: #faf7f4;
    text-align: left !important;
  }

  .reconciliation-detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    padding: 14px;
  }

  .reconciliation-detail-grid h4 {
    margin: 0 0 8px;
    color: #5c3331;
    font-size: 10px;
  }

  .reconciliation-source-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
  }

  .reconciliation-source-table th,
  .reconciliation-source-table td {
    padding: 7px 8px !important;
    border: 1px solid #eee5df !important;
    font-size: 8px !important;
    text-align: left !important;
  }

  .reconciliation-source-table th:last-child,
  .reconciliation-source-table td:last-child {
    text-align: right !important;
  }

  .reconciliation-empty-source {
    margin: 0;
    padding: 12px;
    border: 1px dashed #dfd3cc;
    border-radius: 7px;
    background: white;
    color: #8d807a;
    font-size: 9px;
  }

  .reconciliation-causes {
    margin: 0 14px 14px;
    padding: 9px 11px;
    border-left: 3px solid #F7931E;
    background: white;
    color: #776a64;
    font-size: 8px;
    line-height: 1.5;
  }

  @media (max-width: 1180px) {
    .sales-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (max-width: 720px) {
    .reconciliation-mode-bar {
      align-items: flex-start;
      flex-direction: column;
    }

    .reconciliation-mode-actions {
      width: 100%;
    }

    .reconciliation-mode-actions button {
      flex: 1;
    }

    .sales-reconciliation-ok,
    .sales-reconciliation-warning,
    .sales-reconciliation-info {
      align-items: flex-start;
      flex-direction: column;
    }

    .sales-reconciliation-warning button {
      width: 100%;
    }

    .reconciliation-detail-grid {
      grid-template-columns: 1fr;
    }

    .sales-page { padding: 18px 12px 34px; }
    .sales-header { flex-direction: column; }
    .sales-header-actions { width: 100%; justify-content: stretch; }
    .sales-header-actions button { flex: 1; }
    .sales-source-note { align-items: flex-start; flex-direction: column; }
    .sales-filter-grid { grid-template-columns: 1fr; }
    .sales-filter-actions { display: grid; grid-template-columns: 1fr 1fr; }
    .sales-kpis { grid-template-columns: 1fr 1fr; gap: 8px; }
    .sales-kpis article { padding: 12px; }
    .sales-kpis strong { font-size: 21px; }
    .sales-shortcuts { overflow-x: auto; }
    .sales-table-wrap { overflow: visible; }
    .sales-table-wrap table,
    .sales-table-wrap thead,
    .sales-table-wrap tbody,
    .sales-table-wrap tr,
    .sales-table-wrap td {
      display: block;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .sales-table-wrap thead { display: none; }
    .sales-table-wrap tbody { padding: 8px; }
    .sales-table-wrap tr {
      margin-bottom: 8px;
      padding: 8px 10px;
      border: 1px solid #ece3de;
      border-radius: 8px;
    }
    .sales-table-wrap td,
    .sales-table-wrap td:nth-child(-n+4) {
      display: grid;
      grid-template-columns: minmax(100px, .75fr) minmax(0, 1.25fr);
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid #f2ece8;
      text-align: right;
    }
    .sales-table-wrap td:last-child { border-bottom: 0; }
    .sales-table-wrap td::before {
      content: attr(data-label);
      color: #8a7d77;
      font-size: 8px;
      font-weight: 950;
      text-align: left;
      text-transform: uppercase;
    }
  }

  @media print {
    .sales-header-actions,
    .sales-filter-panel,
    .sales-shortcuts,
    .sales-tabs { display: none !important; }
    .sales-page { max-width: none; padding: 0; }
    .sales-panel { box-shadow: none; }
  }
`
