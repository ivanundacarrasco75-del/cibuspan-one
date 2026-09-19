import { useEffect, useMemo, useState } from "react"
import {
  activarControlConciliacionDespachoDb,
  confirmarDespachoDb,
  guardarNumeroFacturaDespachoDb,
  liberarReservaDespachoDb,
  obtenerDetallePedidoDespachoDb,
  obtenerDetalleReservaDespachoDb,
  obtenerPedidosDespachoDb,
  obtenerReservaActivaDespachoDb,
  obtenerReservaDespachadaPedidoDb,
  prepararPedidoDespachoDb,
  type DetallePedidoDespachoDb,
  type DetalleReservaDespachoDb,
  type PedidoDespachoDb,
  type ReservaDespachoDb,
  type CantidadDespachoSkuDb,
} from "../repositories/despachoRepository"

type VistaDespachos = "OPERACION" | "HISTORIAL"

function fechaAyer() {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - 1)

  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

export default function DespachosV2() {
  const [pedidos, setPedidos] = useState<
    PedidoDespachoDb[]
  >([])

  const [pedidoSeleccionadoId, setPedidoSeleccionadoId] =
    useState("")

  const [detallePedido, setDetallePedido] = useState<
    DetallePedidoDespachoDb[]
  >([])

  const [reservaActiva, setReservaActiva] =
    useState<ReservaDespachoDb | null>(null)

  const [detalleReserva, setDetalleReserva] = useState<
    DetalleReservaDespachoDb[]
  >([])

  const [cantidadesDespacho, setCantidadesDespacho] =
    useState<Record<string, string>>({})

  const [numeroFactura, setNumeroFactura] =
    useState("")

  const [vistaDespachos, setVistaDespachos] =
    useState<VistaDespachos>("OPERACION")

  const [busqueda, setBusqueda] = useState("")
  const [busquedaHistorial, setBusquedaHistorial] =
    useState("")
  const [fechaHistorial, setFechaHistorial] =
    useState(fechaAyer())
  const [cargando, setCargando] = useState(true)
  const [cargandoDetalle, setCargandoDetalle] =
    useState(false)
  const [procesando, setProcesando] = useState(false)

  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const [alertaFefo, setAlertaFefo] = useState("")

  useEffect(() => {
    cargarPedidos()
  }, [])

  async function cargarPedidos(
    mantenerSeleccion = true,
  ) {
    setCargando(true)
    setError("")

    try {
      const pedidosDb =
        await obtenerPedidosDespachoDb()

      setPedidos(pedidosDb)

      if (
        mantenerSeleccion &&
        pedidoSeleccionadoId
      ) {
        const pedidoTodaviaExiste =
          pedidosDb.some(
            (pedido) =>
              pedido.id ===
              pedidoSeleccionadoId,
          )

        if (pedidoTodaviaExiste) {
          await cargarDetallePedido(
            pedidoSeleccionadoId,
          )
        } else {
          limpiarSeleccion()
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los pedidos.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function cargarDetallePedido(
    pedidoId: string,
  ) {
    setPedidoSeleccionadoId(pedidoId)
    setCargandoDetalle(true)
    setMensaje("")
    setError("")
    setDetallePedido([])
    setReservaActiva(null)
    setDetalleReserva([])
    setCantidadesDespacho({})
    setNumeroFactura("")

    try {
      const [detallesDb, reservaDb] =
        await Promise.all([
          obtenerDetallePedidoDespachoDb(
            pedidoId,
          ),
          obtenerReservaActivaDespachoDb(
            pedidoId,
          ),
        ])

      let detallesReservaDb:
        DetalleReservaDespachoDb[] = []

      if (reservaDb) {
        detallesReservaDb =
          await obtenerDetalleReservaDespachoDb(
            reservaDb.id,
          )
      }

      const cantidadesIniciales =
        detallesDb.reduce<
          Record<string, string>
        >((acumulado, detalle) => {
          const unidadesBase = reservaDb
            ? detallesReservaDb
                .filter(
                  (reservaDetalle) =>
                    reservaDetalle.pedido_detalle_id ===
                    detalle.id,
                )
                .reduce(
                  (total, reservaDetalle) =>
                    total +
                    reservaDetalle.unidades,
                  0,
                )
            : detalle.total_unidades

          acumulado[detalle.id] = String(
            unidadesBase /
              detalle.unidades_manejo,
          )

          return acumulado
        }, {})

      setDetallePedido(detallesDb)
      setReservaActiva(reservaDb)
      setNumeroFactura(reservaDb?.numero_factura ?? "")
      setDetalleReserva(detallesReservaDb)
      setCantidadesDespacho(
        cantidadesIniciales,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el detalle.",
      )
    } finally {
      setCargandoDetalle(false)
    }
  }

  async function cargarDetallePedidoHistorial(
    pedidoId: string,
  ) {
    setPedidoSeleccionadoId(pedidoId)
    setCargandoDetalle(true)
    setMensaje("")
    setError("")
    setDetallePedido([])
    setReservaActiva(null)
    setDetalleReserva([])
    setCantidadesDespacho({})
    setNumeroFactura("")

    try {
      const [detallesDb, reservaDb] =
        await Promise.all([
          obtenerDetallePedidoDespachoDb(
            pedidoId,
          ),
          obtenerReservaDespachadaPedidoDb(
            pedidoId,
          ),
        ])

      setDetallePedido(detallesDb)
      setReservaActiva(reservaDb)
      setNumeroFactura(reservaDb?.numero_factura ?? "")

      if (reservaDb) {
        const detallesReservaDb =
          await obtenerDetalleReservaDespachoDb(
            reservaDb.id,
          )

        setDetalleReserva(detallesReservaDb)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el detalle del despacho.",
      )
    } finally {
      setCargandoDetalle(false)
    }
  }

  function cambiarVistaDespachos(
    nuevaVista: VistaDespachos,
  ) {
    if (nuevaVista === vistaDespachos) return

    setVistaDespachos(nuevaVista)
    limpiarSeleccion()
    setMensaje("")
    setError("")
    setAlertaFefo("")
  }

  function limpiarSeleccion() {
    setPedidoSeleccionadoId("")
    setDetallePedido([])
    setReservaActiva(null)
    setDetalleReserva([])
    setCantidadesDespacho({})
    setNumeroFactura("")
  }

  const pedidoSeleccionado = pedidos.find(
    (pedido) =>
      pedido.id === pedidoSeleccionadoId,
  )

  const pedidosFiltrados = useMemo(() => {
    const texto = busqueda
      .trim()
      .toLowerCase()

    return pedidos.filter((pedido) => {
      const esPedidoOperativo =
        pedido.estado === "INGRESADO" ||
        pedido.estado === "PREPARADO"

      const coincideEstado =
        esPedidoOperativo

      const coincideBusqueda =
        texto === "" ||
        pedido.id
          .toLowerCase()
          .includes(texto) ||
        (pedido.cliente?.nombre ?? "")
          .toLowerCase()
          .includes(texto) ||
        (pedido.bodega?.nombre ?? "")
          .toLowerCase()
          .includes(texto)

      return (
        coincideEstado &&
        coincideBusqueda
      )
    })
  }, [pedidos, busqueda])

  const pedidosHistorial = useMemo(() => {
    const texto = busquedaHistorial
      .trim()
      .toLowerCase()

    return pedidos
      .filter(
        (pedido) =>
          pedido.estado === "DESPACHADO",
      )
      .filter((pedido) => {
        if (!fechaHistorial) return true

        return (
          pedido.fecha_entrega ===
          fechaHistorial
        )
      })
      .filter((pedido) => {
        if (!texto) return true

        return (
          pedido.id
            .toLowerCase()
            .includes(texto) ||
          (pedido.cliente?.nombre ?? "")
            .toLowerCase()
            .includes(texto) ||
          (pedido.bodega?.nombre ?? "")
            .toLowerCase()
            .includes(texto)
        )
      })
      .sort((a, b) =>
        b.fecha_entrega.localeCompare(
          a.fecha_entrega,
        ),
      )
  }, [
    pedidos,
    busquedaHistorial,
    fechaHistorial,
  ])

  const lotesDespachadosPorSku = useMemo(() => {
    const grupos = new Map<
      string,
      {
        codigo: string
        corto: string
        nombre: string
        unidadManejo: number
        totalUnidades: number
        detalles: DetalleReservaDespachoDb[]
      }
    >()

    detalleReserva.forEach((detalle) => {
      const producto =
        detalle.pedido_detalle?.producto

      const codigo =
        producto?.codigo ??
        detalle.pedido_detalle_id

      const existente = grupos.get(codigo)

      if (existente) {
        existente.totalUnidades +=
          detalle.unidades
        existente.detalles.push(detalle)
        return
      }

      grupos.set(codigo, {
        codigo: producto?.codigo ?? "",
        corto: producto?.corto ?? "",
        nombre: producto?.nombre ?? "",
        unidadManejo:
          detalle.pedido_detalle
            ?.unidades_manejo ?? 1,
        totalUnidades: detalle.unidades,
        detalles: [detalle],
      })
    })

    return Array.from(grupos.values()).sort(
      (a, b) =>
        a.corto.localeCompare(b.corto),
    )
  }, [detalleReserva])

  const totalUnidadesSolicitadas =
    detallePedido.reduce(
      (total, detalle) =>
        total + detalle.total_unidades,
      0,
    )

  const totalUnidadesManejoSolicitadas =
    detallePedido.reduce(
      (total, detalle) =>
        total +
        detalle.total_unidades /
          detalle.unidades_manejo,
      0,
    )

  const totalUnidadesReservadas =
    detalleReserva.reduce(
      (total, detalle) =>
        total + detalle.unidades,
      0,
    )

  const totalUnidadesManejoReservadas =
    detalleReserva.reduce(
      (total, detalle) => {
        const unidadManejo =
          detalle.pedido_detalle
            ?.unidades_manejo ?? 1

        return (
          total +
          detalle.unidades /
            unidadManejo
        )
      },
      0,
    )

  function unidadesReservadasDetalle(
    pedidoDetalleId: string,
  ) {
    return detalleReserva
      .filter(
        (detalle) =>
          detalle.pedido_detalle_id ===
          pedidoDetalleId,
      )
      .reduce(
        (total, detalle) =>
          total + detalle.unidades,
        0,
      )
  }

  function cantidadManejoADespachar(
    detalle: DetallePedidoDespachoDb,
  ) {
    const valor = Number(
      cantidadesDespacho[detalle.id] ?? 0,
    )

    return Number.isFinite(valor)
      ? valor
      : 0
  }

  const totalUnidadesADespachar =
    detallePedido.reduce(
      (total, detalle) =>
        total +
        cantidadManejoADespachar(detalle) *
          detalle.unidades_manejo,
      0,
    )

  const totalUnidadesManejoADespachar =
    detallePedido.reduce(
      (total, detalle) =>
        total +
        cantidadManejoADespachar(detalle),
      0,
    )

  const fillRateProvisional =
    totalUnidadesSolicitadas > 0
      ? (
          (totalUnidadesADespachar /
            totalUnidadesSolicitadas) *
          100
        ).toFixed(1)
      : "0.0"

  const despachoParcial =
    totalUnidadesADespachar <
    totalUnidadesSolicitadas

  function crearPayloadDespacho():
    CantidadDespachoSkuDb[] {
    if (detallePedido.length === 0) {
      throw new Error(
        "El pedido no tiene productos para despachar.",
      )
    }

    const cantidades = detallePedido.map(
      (detalle) => {
        const unidadesManejo =
          detalle.unidades_manejo
        const cantidadManejo = Number(
          cantidadesDespacho[detalle.id] ??
            0,
        )

        if (
          !Number.isInteger(cantidadManejo) ||
          cantidadManejo < 0
        ) {
          throw new Error(
            `${
              detalle.producto?.corto ??
              "Producto"
            }: la cantidad a despachar debe ser un número entero de gavetas o cajas.`,
          )
        }

        const maximoUnidades = reservaActiva
          ? unidadesReservadasDetalle(
              detalle.id,
            )
          : detalle.total_unidades

        const unidades =
          cantidadManejo * unidadesManejo

        if (unidades > maximoUnidades) {
          throw new Error(
            `${
              detalle.producto?.corto ??
              "Producto"
            }: no puedes despachar más de ${
              maximoUnidades / unidadesManejo
            } gavetas o cajas.`,
          )
        }

        return {
          pedidoDetalleId: detalle.id,
          unidades,
        }
      },
    )

    const total = cantidades.reduce(
      (acumulado, cantidad) =>
        acumulado + cantidad.unidades,
      0,
    )

    if (total <= 0) {
      throw new Error(
        "Debes despachar al menos una unidad de manejo.",
      )
    }

    return cantidades
  }

  async function prepararPedido() {
    if (!pedidoSeleccionado) return

    let cantidades: CantidadDespachoSkuDb[]

    try {
      cantidades = crearPayloadDespacho()
    } catch (err) {
      setAlertaFefo(
        err instanceof Error
          ? err.message
          : "Revisa las cantidades a despachar.",
      )
      return
    }

    const confirmacion = window.confirm(
      `¿Preparar el pedido ${pedidoSeleccionado.id} mediante FEFO por ${totalUnidadesADespachar} de ${totalUnidadesSolicitadas} unidades?${
        despachoParcial
          ? `\n\nDESPACHO PARCIAL · Fill Rate previsto ${fillRateProvisional}%`
          : ""
      }`,
    )

    if (!confirmacion) return

    setProcesando(true)
    setMensaje("")
    setError("")
    setAlertaFefo("")

    try {
      await prepararPedidoDespachoDb(
        pedidoSeleccionado.id,
        cantidades,
      )

      setMensaje(
        despachoParcial
          ? `Pedido preparado para despacho parcial: ${totalUnidadesADespachar} de ${totalUnidadesSolicitadas} unidades.`
          : "Pedido preparado correctamente. El inventario fue reservado por FEFO.",
      )

      await cargarPedidos(false)
      await cargarDetallePedido(
        pedidoSeleccionado.id,
      )
    } catch (err) {
      const mensajeErrorFefo =
        err instanceof Error
          ? err.message
          : "No se pudo preparar el pedido."

      setAlertaFefo(mensajeErrorFefo)
    } finally {
      setProcesando(false)
    }
  }

  async function liberarReserva() {
    if (
      !pedidoSeleccionado ||
      !reservaActiva
    ) {
      return
    }

    const confirmacion = window.confirm(
      `¿Liberar la reserva del pedido ${pedidoSeleccionado.id}? El pedido volverá a estado INGRESADO.`,
    )

    if (!confirmacion) return

    setProcesando(true)
    setMensaje("")
    setError("")

    try {
      await liberarReservaDespachoDb(
        reservaActiva.id,
      )

      setMensaje(
        "Reserva liberada correctamente.",
      )

      await cargarPedidos(false)
      await cargarDetallePedido(
        pedidoSeleccionado.id,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo liberar la reserva.",
      )
    } finally {
      setProcesando(false)
    }
  }

  async function guardarNumeroFactura() {
    if (!reservaActiva) return

    setProcesando(true)
    setMensaje("")
    setError("")

    try {
      const guardado =
        await guardarNumeroFacturaDespachoDb(
          reservaActiva.id,
          numeroFactura,
        )

      setNumeroFactura(guardado)
      setReservaActiva((actual) =>
        actual
          ? {
              ...actual,
              numero_factura: guardado || null,
            }
          : actual,
      )

      setMensaje(
        guardado
          ? `Factura ${guardado} vinculada al despacho.`
          : "Se eliminó el número de factura del despacho.",
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el número de factura.",
      )
    } finally {
      setProcesando(false)
    }
  }

  async function confirmarDespacho() {
    if (
      !pedidoSeleccionado ||
      !reservaActiva
    ) {
      return
    }

    let cantidades: CantidadDespachoSkuDb[]

    try {
      cantidades = crearPayloadDespacho()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Revisa las cantidades a despachar.",
      )
      return
    }

    const facturaLimpia = numeroFactura.trim()

    const confirmacion = window.confirm(
      `¿Confirmas el despacho del pedido ${pedidoSeleccionado.id}?\n\nSolicitado: ${totalUnidadesSolicitadas} unidades\nA despachar: ${totalUnidadesADespachar} unidades\nFill Rate: ${fillRateProvisional}%\nFactura: ${
        facturaLimpia || "SIN NÚMERO · quedará pendiente de vincular"
      }${
        despachoParcial
          ? "\n\nEl pedido quedará cerrado como DESPACHADO aunque sea parcial."
          : ""
      }\n\nEsta acción descontará el inventario.`,
    )

    if (!confirmacion) return

    setProcesando(true)
    setMensaje("")
    setError("")

    try {
      // Solo los despachos confirmados desde esta versión
      // entran al control automático.
      await activarControlConciliacionDespachoDb(
        reservaActiva.id,
      )

      await guardarNumeroFacturaDespachoDb(
        reservaActiva.id,
        facturaLimpia,
      )

      await confirmarDespachoDb(
        reservaActiva.id,
        cantidades,
      )

      setMensaje(
        despachoParcial
          ? `Pedido ${pedidoSeleccionado.id} despachado parcialmente: ${totalUnidadesADespachar} de ${totalUnidadesSolicitadas} unidades · Fill Rate ${fillRateProvisional}%.`
          : `Pedido ${pedidoSeleccionado.id} despachado correctamente.`,
      )

      await cargarPedidos(false)
      await cargarDetallePedido(
        pedidoSeleccionado.id,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo confirmar el despacho.",
      )
    } finally {
      setProcesando(false)
    }
  }

  function renderDetallePedido() {
    return (
      <>
          {!pedidoSeleccionado ? (
            <div style={sinSeleccion}>
              <div style={iconoVacio}>
                C1
              </div>

              <h2>
                Selecciona un pedido
              </h2>

              <p>
                Aquí aparecerá el detalle,
                la reserva FEFO y las acciones
                disponibles.
              </p>
            </div>
          ) : cargandoDetalle ? (
            <div style={sinSeleccion}>
              <p>
                Cargando detalle del pedido...
              </p>
            </div>
          ) : (
            <>
              <div className="dispatch-detail-title" style={tituloDetalle}>
                <div>
                  <span style={etiqueta}>
                    PEDIDO
                  </span>

                  <h2
                    style={{
                      margin: "5px 0",
                    }}
                  >
                    {
                      pedidoSeleccionado.id
                    }
                  </h2>

                  <p
                    style={{
                      ...subtitulo,
                      marginTop: "4px",
                    }}
                  >
                    {pedidoSeleccionado
                      .cliente?.nombre ?? ""}
                  </p>
                </div>

                <span
                  style={badgeEstado(
                    pedidoSeleccionado.estado,
                  )}
                >
                  {
                    pedidoSeleccionado.estado
                  }
                </span>
              </div>

              <section className="dispatch-general-data" style={datosGenerales}>
                <Dato
                  titulo="Bodega"
                  valor={
                    pedidoSeleccionado
                      .bodega?.nombre ?? "-"
                  }
                />

                <Dato
                  titulo="Entrega"
                  valor={
                    pedidoSeleccionado
                      .fecha_entrega
                  }
                />

                <Dato
                  titulo="Hora"
                  valor={
                    pedidoSeleccionado
                      .hora_entrega
                      ? pedidoSeleccionado
                          .hora_entrega.slice(
                            0,
                            5,
                          )
                      : "-"
                  }
                />

                <Dato
                  titulo="Prioridad"
                  valor={
                    pedidoSeleccionado
                      .prioridad
                  }
                />

                <Dato
                  titulo="Empaque"
                  valor={
                    pedidoSeleccionado
                      .tipo_empaque
                  }
                />

                <Dato
                  titulo="Unidades"
                  valor={String(
                    pedidoSeleccionado
                      .total_unidades,
                  )}
                />
              </section>

              {reservaActiva && (
                <section className="dispatch-invoice-link">
                  <div>
                    <span>N.º de factura</span>
                    <strong>
                      {pedidoSeleccionado.estado === "DESPACHADO"
                        ? reservaActiva.conciliacion_aplica
                          ? "Control automático activo"
                          : "Histórico · fuera del control automático"
                        : "Al confirmar entrará al control automático"}
                    </strong>
                    <small>
                      Usa el número completo, por ejemplo 002-001-000016732.
                      Los despachos históricos no generan alertas; pueden revisarse
                      manualmente desde Comercial → Ventas → Conciliación.
                    </small>
                  </div>

                  <div className="dispatch-invoice-controls">
                    <input
                      type="text"
                      value={numeroFactura}
                      onChange={(evento) =>
                        setNumeroFactura(evento.target.value)
                      }
                      placeholder="002-001-000016732"
                      disabled={procesando}
                      autoComplete="off"
                    />

                    <button
                      type="button"
                      onClick={guardarNumeroFactura}
                      disabled={procesando}
                    >
                      {procesando
                        ? "Guardando..."
                        : pedidoSeleccionado.estado === "DESPACHADO"
                          ? "Guardar / corregir"
                          : "Guardar vínculo"}
                    </button>
                  </div>
                </section>
              )}

              {pedidoSeleccionado.estado !==
                "DESPACHADO" && (
                <>
                                <section className="dispatch-section dispatch-requested-section" style={seccionDetalle}>
                                  <div style={tituloSeccion}>
                                    <div>
                                      <h3 style={{ margin: 0 }}>
                                        Cantidades del despacho
                                      </h3>
                                      <p style={{ ...descripcion, margin: "4px 0 0" }}>
                                        El pedido original no se modifica. Ajusta únicamente lo que realmente se enviará.
                                      </p>
                                    </div>

                                    <span>
                                      {detallePedido.length} SKU
                                    </span>
                                  </div>

                                  <div
                                    className="dispatch-requested-table"
                                    style={{ overflowX: "auto" }}
                                  >
                                    <table style={tabla}>
                                      <thead>
                                        <tr>
                                          <th style={encabezado}>Producto</th>
                                          <th style={encabezado}>Código</th>
                                          <th style={encabezado}>UM</th>
                                          <th style={encabezado}>Pedido<br />gav./cajas</th>
                                          <th style={encabezado}>A despachar<br />gav./cajas</th>
                                          <th style={encabezado}>Unidades<br />a despachar</th>
                                        </tr>
                                      </thead>

                                      <tbody>
                                        {detallePedido.map((detalle) => {
                                          const maximoUnidades = reservaActiva
                                            ? unidadesReservadasDetalle(detalle.id)
                                            : detalle.total_unidades
                                          const maximoManejo =
                                            maximoUnidades / detalle.unidades_manejo
                                          const cantidadManejo =
                                            cantidadesDespacho[detalle.id] ?? "0"
                                          const unidadesFinales =
                                            Number(cantidadManejo || 0) *
                                            detalle.unidades_manejo

                                          return (
                                            <tr key={detalle.id}>
                                              <td style={celda}>
                                                <strong>
                                                  {detalle.producto?.corto ?? ""}
                                                </strong>
                                                <br />
                                                <small>
                                                  {detalle.producto?.nombre ?? ""}
                                                </small>
                                              </td>

                                              <td style={celda}>
                                                {detalle.producto?.codigo ?? ""}
                                              </td>

                                              <td style={celda}>
                                                {detalle.unidades_manejo}
                                              </td>

                                              <td style={celda}>
                                                <strong>
                                                  {detalle.total_unidades /
                                                    detalle.unidades_manejo}
                                                </strong>
                                              </td>

                                              <td style={celda}>
                                                <input
                                                  className="dispatch-quantity-input"
                                                  type="number"
                                                  min={0}
                                                  max={maximoManejo}
                                                  step={1}
                                                  inputMode="numeric"
                                                  value={cantidadManejo}
                                                  disabled={procesando}
                                                  onChange={(evento) => {
                                                    const valor =
                                                      evento.target.value

                                                    setCantidadesDespacho(
                                                      (actuales) => ({
                                                        ...actuales,
                                                        [detalle.id]: valor,
                                                      }),
                                                    )
                                                  }}
                                                  aria-label={`Cantidad a despachar de ${
                                                    detalle.producto?.corto ??
                                                    "producto"
                                                  } en gavetas o cajas`}
                                                />
                                                {reservaActiva && (
                                                  <small className="dispatch-max-reserved">
                                                    máx. reservado {maximoManejo}
                                                  </small>
                                                )}
                                              </td>

                                              <td style={celda}>
                                                <strong>
                                                  {Number.isFinite(unidadesFinales)
                                                    ? unidadesFinales
                                                    : 0}
                                                </strong>
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  <div className={`dispatch-partial-summary ${
                                    despachoParcial ? "parcial" : "completo"
                                  }`}>
                                    <div>
                                      <span>Pedido original</span>
                                      <strong>{totalUnidadesSolicitadas}</strong>
                                      <small>unidades</small>
                                    </div>

                                    <div>
                                      <span>A despachar</span>
                                      <strong>{totalUnidadesADespachar}</strong>
                                      <small>unidades</small>
                                    </div>

                                    <div>
                                      <span>Gavetas / cajas</span>
                                      <strong>{totalUnidadesManejoADespachar}</strong>
                                      <small>unidades de manejo</small>
                                    </div>

                                    <div>
                                      <span>Fill Rate previsto</span>
                                      <strong>{fillRateProvisional}%</strong>
                                      <small>despachado / pedido</small>
                                    </div>
                                  </div>

                                  {despachoParcial && (
                                    <div className="dispatch-partial-warning">
                                      Despacho parcial: el pedido conservará sus cantidades originales para medir correctamente el Fill Rate.
                                    </div>
                                  )}
                                </section>
                </>
              )}

              {reservaActiva &&
                detalleReserva.length >
                  0 && (
                  <section
                    className="dispatch-section dispatch-reserve-section"
                    style={
                      seccionDetalle
                    }
                  >
                    <div
                      style={
                        tituloSeccion
                      }
                    >
                      <div>
                        <h3
                          style={{
                            margin: 0,
                          }}
                        >
                          {pedidoSeleccionado.estado ===
                          "DESPACHADO"
                            ? "Detalle por SKU y lote"
                            : "Reserva FEFO"}
                        </h3>

                        <p
                          style={{
                            ...descripcion,
                            marginBottom: 0,
                          }}
                        >
                          {pedidoSeleccionado.estado ===
                          "DESPACHADO"
                            ? "Cada SKU muestra por separado los lotes realmente utilizados."
                            : "Lotes asignados al pedido."}
                        </p>
                      </div>

                      <span
                        style={
                          badgePreparado
                        }
                      >
                        {pedidoSeleccionado.estado ===
                        "DESPACHADO"
                          ? "DESPACHADO"
                          : "RESERVA ACTIVA"}
                      </span>
                    </div>

                    {pedidoSeleccionado.estado ===
                    "DESPACHADO" ? (
                      <div className="dispatch-history-sku-groups">
                        {lotesDespachadosPorSku.map(
                          (grupo) => (
                            <article
                              key={grupo.codigo}
                              className="dispatch-history-sku-card"
                            >
                              <div className="dispatch-history-sku-header">
                                <div>
                                  <strong>
                                    {grupo.corto ||
                                      "Producto"}
                                  </strong>

                                  <span>
                                    {grupo.codigo}
                                  </span>
                                </div>

                                <div className="dispatch-history-sku-total">
                                  <strong>
                                    {grupo.totalUnidades}
                                  </strong>
                                  <span>
                                    unidades
                                  </span>
                                </div>
                              </div>

                              <div className="dispatch-history-lots-table">
                                <table style={tabla}>
                                  <thead>
                                    <tr>
                                      <th style={encabezado}>
                                        Lote
                                      </th>
                                      <th style={encabezado}>
                                        Producción
                                      </th>
                                      <th style={encabezado}>
                                        Vencimiento
                                      </th>
                                      <th style={encabezado}>
                                        Gavetas / cajas
                                      </th>
                                      <th style={encabezado}>
                                        Unidades
                                      </th>
                                    </tr>
                                  </thead>

                                  <tbody>
                                    {grupo.detalles.map(
                                      (detalle) => (
                                        <tr key={detalle.id}>
                                          <td style={celda}>
                                            <strong>
                                              {detalle
                                                .inventario_lote
                                                ?.lote ??
                                                ""}
                                            </strong>
                                          </td>

                                          <td style={celda}>
                                            {detalle
                                              .inventario_lote
                                              ?.fecha_produccion ??
                                              ""}
                                          </td>

                                          <td style={celda}>
                                            {detalle
                                              .inventario_lote
                                              ?.fecha_vencimiento ??
                                              ""}
                                          </td>

                                          <td style={celda}>
                                            <strong>
                                              {detalle.unidades /
                                                grupo.unidadManejo}
                                            </strong>
                                          </td>

                                          <td style={celda}>
                                            <strong>
                                              {detalle.unidades}
                                            </strong>
                                          </td>
                                        </tr>
                                      ),
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </article>
                          ),
                        )}
                      </div>
                    ) : (
                      <div
                        className="dispatch-reserve-table"
                        style={{
                          overflowX:
                            "auto",
                        }}
                      >
                        <table
                          style={tabla}
                        >
                          <thead>
                            <tr>
                              <th
                                style={
                                  encabezado
                                }
                              >
                                Producto
                              </th>

                              <th
                                style={
                                  encabezado
                                }
                              >
                                Lote
                              </th>

                              <th
                                style={
                                  encabezado
                                }
                              >
                                Producción
                              </th>

                              <th
                                style={
                                  encabezado
                                }
                              >
                                Vencimiento
                              </th>

                              <th
                                style={
                                  encabezado
                                }
                              >
                                Gavetas / cajas
                              </th>

                              <th
                                style={
                                  encabezado
                                }
                              >
                                Unidades
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {detalleReserva.map(
                              (detalle) => {
                                const unidadManejo =
                                  detalle
                                    .pedido_detalle
                                    ?.unidades_manejo ??
                                  1

                                return (
                                  <tr
                                    key={
                                      detalle.id
                                    }
                                  >
                                    <td
                                      style={
                                        celda
                                      }
                                    >
                                      <strong>
                                        {detalle
                                          .pedido_detalle
                                          ?.producto
                                          ?.corto ??
                                          ""}
                                      </strong>

                                      <br />

                                      <small>
                                        {detalle
                                          .pedido_detalle
                                          ?.producto
                                          ?.codigo ??
                                          ""}
                                      </small>
                                    </td>

                                    <td
                                      style={
                                        celda
                                      }
                                    >
                                      <strong>
                                        {detalle
                                          .inventario_lote
                                          ?.lote ??
                                          ""}
                                      </strong>
                                    </td>

                                    <td
                                      style={
                                        celda
                                      }
                                    >
                                      {detalle
                                        .inventario_lote
                                        ?.fecha_produccion ??
                                        ""}
                                    </td>

                                    <td
                                      style={
                                        celda
                                      }
                                    >
                                      {detalle
                                        .inventario_lote
                                        ?.fecha_vencimiento ??
                                        ""}
                                    </td>

                                    <td
                                      style={
                                        celda
                                      }
                                    >
                                      <strong>
                                        {detalle.unidades /
                                          unidadManejo}
                                      </strong>
                                    </td>

                                    <td
                                      style={
                                        celda
                                      }
                                    >
                                      <strong>
                                        {
                                          detalle.unidades
                                        }
                                      </strong>
                                    </td>
                                  </tr>
                                )
                              },
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

<div className="dispatch-summary" style={resumen}>
                      <span>
                        {
                          totalUnidadesManejoReservadas
                        }{" "}
                        gavetas o cajas
                      </span>

                      <strong>
                        {
                          totalUnidadesReservadas
                        }{" "}
                        {pedidoSeleccionado.estado ===
                        "DESPACHADO"
                          ? "unidades despachadas"
                          : "unidades reservadas"}
                      </strong>
                    </div>
                  </section>
                )}

              <section className="dispatch-actions" style={acciones}>
                {pedidoSeleccionado.estado ===
                  "INGRESADO" && (
                  <button
                    type="button"
                    onClick={prepararPedido}
                    disabled={procesando}
                    style={
                      botonPreparar
                    }
                  >
                    {procesando
                      ? "Preparando..."
                      : "Preparar por FEFO"}
                  </button>
                )}

                {pedidoSeleccionado.estado ===
                  "PREPARADO" &&
                  reservaActiva && (
                    <>
                      <button
                        type="button"
                        onClick={
                          liberarReserva
                        }
                        disabled={
                          procesando
                        }
                        style={
                          botonLiberar
                        }
                      >
                        Liberar reserva
                      </button>

                      <button
                        type="button"
                        onClick={
                          confirmarDespacho
                        }
                        disabled={
                          procesando
                        }
                        style={
                          botonDespachar
                        }
                      >
                        {procesando
                          ? "Procesando..."
                          : "Confirmar despacho"}
                      </button>
                    </>
                  )}

                {pedidoSeleccionado.estado ===
                  "DESPACHADO" && (
                  <div
                    style={
                      mensajeDespachado
                    }
                  >
                    Pedido despachado. El inventario ya fue descontado.
                    {numeroFactura.trim()
                      ? ` · Factura ${numeroFactura.trim()}`
                      : " · Pendiente de vincular factura."}
                  </div>
                )}
              </section>
            </>
          )}
      </>
    )
  }

  return (
    <main className="c1-dispatch" style={pagina}>
      {/* CIBUSPAN ONE: DESPACHOS CON PESTAÑAS OPERACION + HISTORIAL */}
      <style>{despachosResponsiveCss}</style>
      <header className="dispatch-header" style={cabecera}>
        <div>
          <span style={etiqueta}>
            MÓDULO LOGÍSTICO
          </span>

          <h1 style={titulo}>
            Despachos
          </h1>

          <p style={subtitulo}>
            Preparación FEFO, confirmación y
            consulta del historial de despachos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => cargarPedidos()}
          disabled={cargando || procesando}
          style={botonActualizar}
        >
          {cargando
            ? "Actualizando..."
            : "Actualizar"}
        </button>
      </header>

      {mensaje && (
        <div style={mensajeExito}>
          {mensaje}
        </div>
      )}

      {error && (
        <div style={mensajeError}>
          {error}
        </div>
      )}

      {alertaFefo && (
        <div
          className="dispatch-alert-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dispatch-alert-title"
        >
          <div className="dispatch-alert-box">
            <div className="dispatch-alert-icon">!</div>

            <h3 id="dispatch-alert-title">
              No se pudo preparar el pedido
            </h3>

            <p>{alertaFefo}</p>

            <button
              type="button"
              autoFocus
              onClick={() => setAlertaFefo("")}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      <div
        className="dispatch-tabs"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          width: "min(430px, 100%)",
          gap: "6px",
          marginBottom: "18px",
          padding: "5px",
          border: "1px solid #e5d6cf",
          borderRadius: "12px",
          background: "#ffffff",
          boxShadow: "0 4px 14px rgba(72,42,32,.05)",
        }}
      >
        <button
          type="button"
          onClick={() =>
            cambiarVistaDespachos("OPERACION")
          }
          style={{
            minHeight: "42px",
            padding: "9px 14px",
            border: "none",
            borderRadius: "9px",
            background:
              vistaDespachos === "OPERACION"
                ? "#8F1D24"
                : "#F8F5F1",
            color:
              vistaDespachos === "OPERACION"
                ? "#ffffff"
                : "#5f514c",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Operación
        </button>

        <button
          type="button"
          onClick={() =>
            cambiarVistaDespachos("HISTORIAL")
          }
          style={{
            minHeight: "42px",
            padding: "9px 14px",
            border: "none",
            borderRadius: "9px",
            background:
              vistaDespachos === "HISTORIAL"
                ? "#8F1D24"
                : "#F8F5F1",
            color:
              vistaDespachos === "HISTORIAL"
                ? "#ffffff"
                : "#5f514c",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Historial
        </button>
      </div>

      <section className="dispatch-kpis" style={indicadores}>
        <TarjetaIndicador
          titulo="Ingresados"
          valor={
            pedidos.filter(
              (pedido) =>
                pedido.estado ===
                "INGRESADO",
            ).length
          }
        />

        <TarjetaIndicador
          titulo="Preparados"
          valor={
            pedidos.filter(
              (pedido) =>
                pedido.estado ===
                "PREPARADO",
            ).length
          }
        />

        <TarjetaIndicador
          titulo="Despachados"
          valor={
            pedidos.filter(
              (pedido) =>
                pedido.estado ===
                "DESPACHADO",
            ).length
          }
        />

        <TarjetaIndicador
          titulo="Total pedidos"
          valor={pedidos.length}
        />
      </section>

      {vistaDespachos === "OPERACION" && (
        <>
                <section className="dispatch-layout" style={distribucion}>
                  <aside className="dispatch-orders-panel" style={panelPedidos}>
                    <div className="dispatch-panel-title" style={tituloPanel}>
                      <div>
                        <h2 style={{ margin: 0 }}>
                          Pedidos
                        </h2>

                        <p style={descripcion}>
                          Selecciona un pedido para
                          revisar o procesar.
                        </p>
                      </div>

                      <span style={contador}>
                        {pedidosFiltrados.length}
                      </span>
                    </div>

                    <div className="dispatch-filters" style={filtros}>
                      <input
                        value={busqueda}
                        onChange={(evento) =>
                          setBusqueda(
                            evento.target.value,
                          )
                        }
                        placeholder="Buscar pedido o cliente"
                        style={campo}
                      />

                    </div>

                    {cargando ? (
                      <div style={estadoVacio}>
                        Cargando pedidos...
                      </div>
                    ) : pedidosFiltrados.length ===
                      0 ? (
                      <div style={estadoVacio}>
                        No existen pedidos ingresados
                        o preparados.
                      </div>
                    ) : (
                      <div className="dispatch-order-list" style={listaPedidos}>
                        {pedidosFiltrados.map(
                          (pedido) => {
                            const seleccionado =
                              pedido.id ===
                              pedidoSeleccionadoId

                            return (
                              <div
                                key={pedido.id}
                                className={`dispatch-order-item ${
                                  seleccionado ? "seleccionado" : ""
                                }`}
                              >
                              <button
                                type="button"
                                onClick={() =>
                                  cargarDetallePedido(
                                    pedido.id,
                                  )
                                }
                                style={{
                                  ...tarjetaPedido,
                                  borderColor:
                                    seleccionado
                                      ? "#8f1d24"
                                      : "#e2e5e9",
                                  background:
                                    seleccionado
                                      ? "#fff7f7"
                                      : "white",
                                }}
                              >
                                <div
                                  style={
                                    pedidoCabecera
                                  }
                                >
                                  <strong>
                                    {pedido.id}
                                  </strong>

                                  <span
                                    style={badgeEstado(
                                      pedido.estado,
                                    )}
                                  >
                                    {pedido.estado}
                                  </span>
                                </div>

                                <span
                                  style={
                                    clientePedido
                                  }
                                >
                                  {pedido.cliente
                                    ?.nombre ??
                                    "Cliente no registrado"}
                                </span>

                                <div
                                  style={
                                    datosPedidoLista
                                  }
                                >
                                  <span>
                                    {pedido.bodega
                                      ?.nombre ?? ""}
                                  </span>

                                  <span>
                                    {
                                      pedido.fecha_entrega
                                    }
                                  </span>
                                </div>

                                <div
                                  style={
                                    unidadesPedido
                                  }
                                >
                                  {
                                    pedido.total_unidades
                                  }{" "}
                                  unidades
                                </div>
                              </button>

                              {seleccionado && (
                                <div className="dispatch-inline-detail">
                                  {renderDetallePedido()}
                                </div>
                              )}
                              </div>
                            )
                          },
                        )}
                      </div>
                    )}
                  </aside>

                  <section className="dispatch-detail-panel" style={panelDetalle}>
                    <div className="dispatch-desktop-detail">
                      {renderDetallePedido()}
                    </div>
                  </section>
                </section>
        </>
      )}

      {vistaDespachos === "HISTORIAL" && (
        <section
          className="dispatch-layout dispatch-history-layout"
          style={distribucion}
        >
          <aside
            className="dispatch-orders-panel dispatch-history-panel"
            style={panelPedidos}
          >
            <div
              className="dispatch-panel-title"
              style={tituloPanel}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  Historial
                </h2>

                <p style={descripcion}>
                  Pedidos ya despachados.
                </p>
              </div>

              <span style={contador}>
                {pedidosHistorial.length}
              </span>
            </div>

            <div className="dispatch-history-filters">
              <div className="dispatch-history-date-filter">
                <label htmlFor="fecha-historial-despachos">
                  Fecha de entrega
                </label>

                <div className="dispatch-history-date-row">
                  <input
                    id="fecha-historial-despachos"
                    type="date"
                    value={fechaHistorial}
                    onChange={(evento) => {
                      setFechaHistorial(
                        evento.target.value,
                      )
                      limpiarSeleccion()
                    }}
                    style={campo}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setFechaHistorial("")
                      limpiarSeleccion()
                    }}
                    className="dispatch-history-all-button"
                  >
                    Todos
                  </button>
                </div>
              </div>

              <div className="dispatch-history-search-filter">
                <label htmlFor="buscar-historial-despachos">
                  Buscar
                </label>

                <input
                  id="buscar-historial-despachos"
                  value={busquedaHistorial}
                  onChange={(evento) =>
                    setBusquedaHistorial(
                      evento.target.value,
                    )
                  }
                  placeholder="Cliente, bodega o pedido"
                  style={campo}
                />
              </div>
            </div>

            {cargando ? (
              <div style={estadoVacio}>
                Cargando historial...
              </div>
            ) : pedidosHistorial.length === 0 ? (
              <div style={estadoVacio}>
                {fechaHistorial
                  ? "No existen despachos para la fecha seleccionada."
                  : "No existen despachos registrados."}
              </div>
            ) : (
              <div
                className="dispatch-order-list dispatch-history-list"
                style={listaPedidos}
              >
                {pedidosHistorial.map(
                  (pedido) => {
                    const seleccionado =
                      pedido.id ===
                      pedidoSeleccionadoId

                    return (
                      <div
                        key={pedido.id}
                        className={`dispatch-order-item ${
                          seleccionado
                            ? "seleccionado"
                            : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            cargarDetallePedidoHistorial(
                              pedido.id,
                            )
                          }
                          style={{
                            ...tarjetaPedido,
                            borderColor:
                              seleccionado
                                ? "#8f1d24"
                                : "#e2e5e9",
                            background:
                              seleccionado
                                ? "#fff7f7"
                                : "white",
                          }}
                        >
                          <div style={pedidoCabecera}>
                            <strong>
                              {pedido.cliente?.nombre ??
                                "Cliente"}
                            </strong>

                            <span
                              style={badgeEstado(
                                pedido.estado,
                              )}
                            >
                              DESPACHADO
                            </span>
                          </div>

                          <span style={clientePedido}>
                            {pedido.bodega?.nombre ??
                              "Bodega no registrada"}
                          </span>

                          <div
                            style={datosPedidoLista}
                          >
                            <span>
                              Entrega:{" "}
                              {pedido.fecha_entrega}
                            </span>

                            <span>
                              {pedido.tipo_empaque}
                            </span>
                          </div>

                          <div
                            style={unidadesPedido}
                          >
                            {pedido.total_unidades}{" "}
                            unidades
                          </div>
                        </button>

                        {seleccionado && (
                          <div className="dispatch-inline-detail">
                            {renderDetallePedido()}
                          </div>
                        )}
                      </div>
                    )
                  },
                )}
              </div>
            )}
          </aside>

          <section
            className="dispatch-detail-panel"
            style={panelDetalle}
          >
            <div className="dispatch-desktop-detail">
              {renderDetallePedido()}
            </div>
          </section>
        </section>
      )}
    </main>
  )
}

type TarjetaIndicadorProps = {
  titulo: string
  valor: number
}

function TarjetaIndicador({
  titulo,
  valor,
}: TarjetaIndicadorProps) {
  return (
    <article style={tarjetaIndicador}>
      <span style={datoTitulo}>
        {titulo}
      </span>

      <strong style={valorIndicador}>
        {valor}
      </strong>
    </article>
  )
}

type DatoProps = {
  titulo: string
  valor: string
}

function Dato({
  titulo,
  valor,
}: DatoProps) {
  return (
    <div style={dato}>
      <span style={datoTitulo}>
        {titulo}
      </span>

      <strong>{valor}</strong>
    </div>
  )
}

function badgeEstado(
  estado: string,
) {
  if (estado === "PREPARADO") {
    return {
      ...badgeBase,
      background: "#fef3c7",
      color: "#92400e",
    }
  }

  if (estado === "DESPACHADO") {
    return {
      ...badgeBase,
      background: "#dcfce7",
      color: "#166534",
    }
  }

  return {
    ...badgeBase,
    background: "#e0f2fe",
    color: "#075985",
  }
}

const pagina = {
  width: "100%",
  maxWidth: "none",
  boxSizing: "border-box" as const,
  padding: "20px 24px",
  margin: 0,
  color: "#25272b",
}

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  marginBottom: "24px",
}

const etiqueta = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "1px",
}

const titulo = {
  margin: "5px 0",
  fontSize: "32px",
}

const subtitulo = {
  margin: 0,
  color: "#6b7280",
}

const botonActualizar = {
  padding: "10px 16px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const indicadores = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(170px, 1fr))",
  gap: "15px",
  marginBottom: "22px",
}

const tarjetaIndicador = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  padding: "18px",
  border: "1px solid #e2e5e9",
  borderRadius: "12px",
  background: "white",
}

const datoTitulo = {
  color: "#6b7280",
  fontSize: "12px",
}

const valorIndicador = {
  color: "#8f1d24",
  fontSize: "28px",
}

const distribucion = {
  display: "grid",
  gridTemplateColumns:
    "minmax(330px, 390px) minmax(0, 1fr)",
  gap: "18px",
  alignItems: "start",
}

const panelPedidos = {
  padding: "18px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "white",
}

const panelDetalle = {
  minHeight: "600px",
  padding: "22px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "white",
}

const tituloPanel = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "15px",
  marginBottom: "16px",
}

const descripcion = {
  margin: "5px 0 0",
  color: "#6b7280",
  fontSize: "13px",
}

const contador = {
  minWidth: "34px",
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#8f1d24",
  color: "white",
  textAlign: "center" as const,
  fontWeight: "bold",
}

const filtros = {
  display: "grid",
  gap: "10px",
  marginBottom: "15px",
}

const campo = {
  width: "100%",
  minHeight: "41px",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  background: "white",
}

const listaPedidos = {
  display: "grid",
  gap: "10px",
  maxHeight: "690px",
  overflowY: "auto" as const,
}

const tarjetaPedido = {
  width: "100%",
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  padding: "14px",
  border: "1px solid #e2e5e9",
  borderRadius: "10px",
  textAlign: "left" as const,
  cursor: "pointer",
}

const pedidoCabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
}

const clientePedido = {
  color: "#374151",
  fontSize: "13px",
}

const datosPedidoLista = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  color: "#6b7280",
  fontSize: "12px",
}

const unidadesPedido = {
  color: "#8f1d24",
  fontSize: "13px",
  fontWeight: "bold",
}

const sinSeleccion = {
  minHeight: "520px",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center" as const,
  color: "#6b7280",
}

const iconoVacio = {
  width: "58px",
  height: "58px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "10px",
  borderRadius: "14px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
}

const tituloDetalle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "20px",
  marginBottom: "20px",
}

const datosGenerales = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(135px, 1fr))",
  gap: "12px",
  marginBottom: "22px",
}

const dato = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "5px",
  padding: "13px",
  borderRadius: "9px",
  background: "#f7f8fa",
}

const seccionDetalle = {
  marginBottom: "22px",
  padding: "18px",
  border: "1px solid #e2e5e9",
  borderRadius: "11px",
}

const tituloSeccion = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "15px",
  marginBottom: "15px",
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "10px",
  borderBottom: "2px solid #d8dde3",
  background: "#f7f8fa",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
  fontSize: "12px",
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #edf0f2",
  whiteSpace: "nowrap" as const,
}

const resumen = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  marginTop: "16px",
  padding: "14px",
  borderRadius: "8px",
  background: "#f5f6f8",
}

const acciones = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
  gap: "12px",
  paddingTop: "18px",
  borderTop: "1px solid #e5e7eb",
}

const botonPreparar = {
  padding: "12px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonLiberar = {
  padding: "12px 20px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonDespachar = {
  padding: "12px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#15803d",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const mensajeDespachado = {
  width: "100%",
  padding: "14px",
  borderRadius: "8px",
  background: "#dcfce7",
  color: "#166534",
  textAlign: "center" as const,
  fontWeight: "bold",
}

const estadoVacio = {
  padding: "30px 15px",
  border: "1px dashed #cfd4da",
  borderRadius: "9px",
  color: "#6b7280",
  textAlign: "center" as const,
}

const mensajeExito = {
  marginBottom: "20px",
  padding: "14px 16px",
  borderLeft: "5px solid #15803d",
  borderRadius: "8px",
  background: "#dcfce7",
  color: "#166534",
}

const mensajeError = {
  marginBottom: "20px",
  padding: "14px 16px",
  borderLeft: "5px solid #b91c1c",
  borderRadius: "8px",
  background: "#fee2e2",
  color: "#991b1b",
}

const badgeBase = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: "bold",
}

const badgePreparado = {
  ...badgeBase,
  background: "#fef3c7",
  color: "#92400e",
}

const despachosResponsiveCss = `
  .c1-dispatch {
    --c1-vino: #8F1D24;
    --c1-vino-oscuro: #68151A;
    --c1-naranja: #F7931E;
    --c1-crema: #F8F5F1;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    box-sizing: border-box !important;
  }

  .c1-dispatch .dispatch-tabs {
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-bottom: 16px;
    padding: 4px;
    border: 1px solid #eadfd9;
    border-radius: 11px;
    background: #fff;
  }

  .c1-dispatch .dispatch-tabs button {
    min-width: 130px;
    padding: 9px 16px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #6b5b55;
    font-weight: 800;
    cursor: pointer;
  }

  .c1-dispatch .dispatch-tabs button.activo {
    background: var(--c1-vino);
    color: white;
    box-shadow: 0 5px 14px rgba(143,29,36,.14);
  }

  .c1-dispatch .dispatch-filters {
    grid-template-columns: 1fr !important;
  }

  .c1-dispatch .dispatch-history-panel .dispatch-filters {
    grid-template-columns: 1fr !important;
  }

  .c1-dispatch .dispatch-history-filters {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 10px;
    margin-bottom: 15px;
  }

  .c1-dispatch .dispatch-history-date-filter,
  .c1-dispatch .dispatch-history-search-filter {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .c1-dispatch .dispatch-history-date-filter label,
  .c1-dispatch .dispatch-history-search-filter label {
    color: #7a6d67;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .35px;
  }

  .c1-dispatch .dispatch-history-date-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 7px;
  }

  .c1-dispatch .dispatch-history-all-button {
    min-height: 41px;
    padding: 8px 12px;
    border: 1px solid #8F1D24;
    border-radius: 8px;
    background: #fff;
    color: #8F1D24;
    font-weight: 800;
    cursor: pointer;
  }

  .c1-dispatch .dispatch-history-all-button:hover {
    background: #fff7f7;
  }

  .c1-dispatch .dispatch-history-list {
    max-height: 760px !important;
  }

  .c1-dispatch .dispatch-quantity-input {
    width: 92px;
    min-height: 38px;
    padding: 7px 8px;
    border: 1px solid #d7c8c1;
    border-radius: 8px;
    background: #fff;
    color: #3f3532;
    font: inherit;
    font-weight: 800;
    text-align: right;
  }

  .c1-dispatch .dispatch-quantity-input:focus {
    outline: none;
    border-color: var(--c1-naranja);
    box-shadow: 0 0 0 3px rgba(247,147,30,.13);
  }

  .c1-dispatch .dispatch-max-reserved {
    display: block;
    margin-top: 3px;
    color: #8e7c75;
    font-size: 9px;
    white-space: nowrap;
  }

  .c1-dispatch .dispatch-partial-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 8px;
    margin-top: 12px;
    padding: 10px;
    border: 1px solid #eadfd9;
    border-radius: 10px;
    background: #faf7f5;
  }

  .c1-dispatch .dispatch-partial-summary.parcial {
    border-color: #f3c88e;
    background: #fff8ee;
  }

  .c1-dispatch .dispatch-partial-summary > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    text-align: center;
  }

  .c1-dispatch .dispatch-partial-summary span,
  .c1-dispatch .dispatch-partial-summary small {
    color: #7a6d67;
    font-size: 9px;
  }

  .c1-dispatch .dispatch-partial-summary strong {
    color: var(--c1-vino);
    font-size: 18px;
  }

  .c1-dispatch .dispatch-partial-warning {
    margin-top: 8px;
    padding: 9px 10px;
    border: 1px solid #f3c88e;
    border-radius: 9px;
    background: #fff8ee;
    color: #8a5613;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
  }

  .c1-dispatch .dispatch-history-sku-groups {
    display: grid;
    gap: 14px;
  }

  .c1-dispatch .dispatch-history-sku-card {
    overflow: hidden;
    border: 1px solid #eadfd9;
    border-radius: 12px;
    background: #fff;
  }

  .c1-dispatch .dispatch-history-sku-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid #eadfd9;
    background: #fff8f4;
  }

  .c1-dispatch .dispatch-history-sku-header > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .c1-dispatch .dispatch-history-sku-header > div:first-child strong {
    color: var(--c1-vino);
    font-size: 14px;
  }

  .c1-dispatch .dispatch-history-sku-header > div:first-child span {
    color: #7a6d67;
    font-size: 11px;
  }

  .c1-dispatch .dispatch-history-sku-total {
    display: flex;
    align-items: baseline;
    gap: 5px;
    white-space: nowrap;
  }

  .c1-dispatch .dispatch-history-sku-total strong {
    color: var(--c1-vino);
    font-size: 18px;
  }

  .c1-dispatch .dispatch-history-sku-total span {
    color: #7a6d67;
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 700;
  }

  .c1-dispatch .dispatch-history-lots-table {
    width: 100%;
    overflow-x: auto;
  }

  .c1-dispatch .dispatch-history-lots-table table {
    width: 100%;
  }

  .c1-dispatch .dispatch-order-item {
    display: block;
    width: 100%;
  }

  .c1-dispatch .dispatch-order-item > button {
    width: 100%;
  }

  .c1-dispatch .dispatch-inline-detail {
    display: none;
  }

  .c1-dispatch .dispatch-desktop-detail {
    display: block;
  }

  .c1-dispatch .dispatch-orders-panel,
  .c1-dispatch .dispatch-detail-panel,
  .c1-dispatch .dispatch-kpis article {
    border-color: #eee3dd !important;
    box-shadow: 0 5px 18px rgba(72,42,32,.045);
  }

  .c1-dispatch .dispatch-header h1,
  .c1-dispatch .dispatch-panel-title h2,
  .c1-dispatch .dispatch-detail-title h2 {
    color: #4f2728;
  }

  .c1-dispatch input:focus,
  .c1-dispatch select:focus {
    outline: none;
    border-color: var(--c1-naranja) !important;
    box-shadow: 0 0 0 3px rgba(247,147,30,.13);
  }

  .c1-dispatch .dispatch-alert-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(38, 25, 22, .42);
    backdrop-filter: blur(2px);
  }

  .c1-dispatch .dispatch-alert-box {
    width: min(420px, calc(100vw - 32px));
    padding: 24px 24px 20px;
    border: 1px solid #f1d7d5;
    border-radius: 16px;
    background: white;
    box-shadow: 0 24px 70px rgba(45, 22, 18, .25);
    text-align: center;
  }

  .c1-dispatch .dispatch-alert-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 12px;
    border-radius: 50%;
    background: #fff1f0;
    color: #b42318;
    font-size: 26px;
    font-weight: 900;
  }

  .c1-dispatch .dispatch-alert-box h3 {
    margin: 0 0 8px;
    color: #65191f;
    font-size: 20px;
  }

  .c1-dispatch .dispatch-alert-box p {
    margin: 0 0 20px;
    color: #5f514c;
    font-size: 14px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .c1-dispatch .dispatch-alert-box button {
    min-width: 140px;
    min-height: 44px;
    padding: 10px 22px;
    border: 0;
    border-radius: 9px;
    background: #8F1D24;
    color: white;
    font-weight: 800;
    cursor: pointer;
  }

  .c1-dispatch .dispatch-alert-box button:hover {
    background: #68151A;
  }


  .c1-dispatch .dispatch-invoice-link {
    display: grid;
    grid-template-columns: minmax(220px, .9fr) minmax(320px, 1.4fr);
    gap: 16px;
    align-items: end;
    margin: 12px 0 16px;
    padding: 14px 16px;
    border: 1px solid #eadfd9;
    border-left: 4px solid #F7931E;
    border-radius: 12px;
    background: #fffaf6;
  }

  .c1-dispatch .dispatch-invoice-link > div:first-child {
    display: grid;
    gap: 3px;
  }

  .c1-dispatch .dispatch-invoice-link span {
    color: #9b7d72;
    font-size: 9px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .05em;
  }

  .c1-dispatch .dispatch-invoice-link strong {
    color: #6f2a2e;
    font-size: 13px;
  }

  .c1-dispatch .dispatch-invoice-link small {
    color: #8b7b75;
    font-size: 9px;
    line-height: 1.4;
  }

  .c1-dispatch .dispatch-invoice-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .c1-dispatch .dispatch-invoice-controls input {
    width: 100%;
    min-width: 0;
    min-height: 42px;
    box-sizing: border-box;
    padding: 0 12px;
    border: 1px solid #d9cdc7;
    border-radius: 8px;
    background: white;
    color: #3f302b;
    font-size: 13px;
    font-weight: 800;
    outline: none;
  }

  .c1-dispatch .dispatch-invoice-controls input:focus {
    border-color: #F7931E;
    box-shadow: 0 0 0 3px rgba(247,147,30,.12);
  }

  .c1-dispatch .dispatch-invoice-controls button {
    min-height: 42px;
    padding: 0 14px;
    border: 1px solid #8F1D24;
    border-radius: 8px;
    background: white;
    color: #8F1D24;
    font-size: 10px;
    font-weight: 900;
    cursor: pointer;
  }

  @media (max-width: 1050px) {
    .c1-dispatch {
      padding: 18px !important;
    }

    .c1-dispatch .dispatch-layout {
      grid-template-columns: minmax(280px, 340px) minmax(0,1fr) !important;
      gap: 14px !important;
    }
  }

  @media (max-width: 820px) {
    .c1-dispatch {
      padding: 12px 10px 26px !important;
      overflow-x: hidden;
    }

    .c1-dispatch .dispatch-header {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 12px !important;
      margin-bottom: 14px !important;
    }

    .c1-dispatch .dispatch-header h1 {
      font-size: 26px !important;
    }

    .c1-dispatch .dispatch-header p {
      font-size: 12px !important;
    }

    .c1-dispatch .dispatch-header > button {
      width: 100%;
      min-height: 42px;
    }

    .c1-dispatch .dispatch-tabs {
      width: 100%;
      display: grid;
      margin-bottom: 12px;
    }

    .c1-dispatch .dispatch-tabs button {
      min-width: 0;
      width: 100%;
      min-height: 40px;
      padding: 8px 6px;
    }

    .c1-dispatch .dispatch-history-filters {
      grid-template-columns: 1fr !important;
      gap: 9px !important;
    }

    .c1-dispatch .dispatch-history-date-row {
      grid-template-columns: minmax(0, 1fr) 72px !important;
    }

    .c1-dispatch .dispatch-history-date-row input,
    .c1-dispatch .dispatch-history-search-filter input,
    .c1-dispatch .dispatch-history-all-button {
      min-height: 44px !important;
    }

    .c1-dispatch .dispatch-kpis {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      gap: 8px !important;
      margin-bottom: 12px !important;
    }

    .c1-dispatch .dispatch-kpis article {
      min-width: 0;
      padding: 11px !important;
      border-radius: 11px !important;
    }

    .c1-dispatch .dispatch-kpis article span {
      font-size: 9px !important;
    }

    .c1-dispatch .dispatch-kpis article strong {
      font-size: 21px !important;
    }

    .c1-dispatch .dispatch-layout {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 12px !important;
    }

    .c1-dispatch .dispatch-orders-panel,
    .c1-dispatch .dispatch-detail-panel {
      width: 100%;
      min-width: 0;
      padding: 13px !important;
      border-radius: 12px !important;
    }

    .c1-dispatch .dispatch-detail-panel {
      min-height: 0 !important;
    }

    .c1-dispatch .dispatch-panel-title {
      align-items: flex-start !important;
      margin-bottom: 10px !important;
    }

    .c1-dispatch .dispatch-panel-title h2 {
      font-size: 18px;
    }

    .c1-dispatch .dispatch-panel-title p {
      font-size: 11px !important;
    }

    .c1-dispatch .dispatch-filters {
      grid-template-columns: 1fr !important;
      gap: 7px !important;
    }

    .c1-dispatch .dispatch-filters input {
      min-height: 42px !important;
      font-size: 12px;
    }

    .c1-dispatch .dispatch-order-list {
      max-height: none !important;
      overflow-y: visible !important;
      gap: 8px !important;
      padding-right: 0;
    }

    .c1-dispatch .dispatch-order-item {
      display: block;
      width: 100%;
    }

    .c1-dispatch .dispatch-order-item > button {
      width: 100%;
      min-height: 0;
      padding: 11px !important;
      border-radius: 11px !important;
    }

    .c1-dispatch .dispatch-detail-panel {
      display: none !important;
    }

    .c1-dispatch .dispatch-inline-detail {
      display: block !important;
      width: 100%;
      margin-top: 8px;
      padding: 12px;
      border: 1px solid #eadfd9;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 8px 20px rgba(72,42,32,.07);
    }

    .c1-dispatch .dispatch-inline-detail .dispatch-detail-title {
      margin-top: 0 !important;
    }

    .c1-dispatch .dispatch-order-item.seleccionado > button {
      border-color: var(--c1-vino) !important;
      box-shadow: 0 0 0 2px rgba(143,29,36,.08);
    }

    .c1-dispatch .dispatch-detail-title {
      align-items: flex-start !important;
      gap: 8px !important;
      margin-bottom: 12px !important;
    }

    .c1-dispatch .dispatch-detail-title h2 {
      max-width: 230px;
      font-size: 18px !important;
      overflow-wrap: anywhere;
    }

    .c1-dispatch .dispatch-general-data {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      gap: 7px !important;
      margin-bottom: 12px !important;
    }

    .c1-dispatch .dispatch-general-data > div {
      min-width: 0;
      padding: 10px !important;
    }

    .c1-dispatch .dispatch-general-data span {
      font-size: 9px !important;
    }

    .c1-dispatch .dispatch-general-data strong {
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .c1-dispatch .dispatch-section {
      padding: 11px !important;
      margin-bottom: 11px !important;
      border-radius: 11px !important;
    }

    .c1-dispatch .dispatch-section > div:first-child h3 {
      font-size: 16px !important;
    }

    .c1-dispatch .dispatch-history-sku-groups {
      gap: 10px;
    }

    .c1-dispatch .dispatch-history-sku-card {
      border-radius: 11px;
    }

    .c1-dispatch .dispatch-history-sku-header {
      padding: 10px;
      gap: 8px;
    }

    .c1-dispatch .dispatch-history-sku-header > div:first-child strong {
      font-size: 13px;
    }

    .c1-dispatch .dispatch-history-sku-total strong {
      font-size: 16px;
    }

    /* En móvil: UNA sola tarjeta por SKU.
       Los lotes quedan como filas compactas dentro de esa tarjeta,
       sin convertirse en una segunda lista de tarjetas. */
    .c1-dispatch .dispatch-history-lots-table {
      overflow: visible !important;
      padding: 0 10px 8px;
    }

    .c1-dispatch .dispatch-history-lots-table table,
    .c1-dispatch .dispatch-history-lots-table tbody {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
    }

    .c1-dispatch .dispatch-history-lots-table thead {
      display: none !important;
    }

    .c1-dispatch .dispatch-history-lots-table tbody {
      margin: 0;
      padding: 0;
    }

    .c1-dispatch .dispatch-history-lots-table tr {
      display: grid !important;
      grid-template-columns: minmax(0,1fr) auto !important;
      gap: 4px 12px;
      width: 100% !important;
      min-width: 0 !important;
      padding: 9px 0;
      border: 0 !important;
      border-bottom: 1px solid #eee3dd !important;
      border-radius: 0 !important;
      background: transparent !important;
    }

    .c1-dispatch .dispatch-history-lots-table tr:last-child {
      border-bottom: 0 !important;
    }

    .c1-dispatch .dispatch-history-lots-table td {
      display: block !important;
      width: auto !important;
      min-width: 0 !important;
      min-height: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: left !important;
      font-size: 11px;
      color: #6f625c;
    }

    .c1-dispatch .dispatch-history-lots-table td::before {
      display: inline !important;
      margin-right: 4px;
      color: #9b8981;
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(1) {
      grid-column: 1;
      grid-row: 1;
      color: #4f2728;
      font-size: 13px;
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(1)::before {
      content: "Lote ";
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(5) {
      grid-column: 2;
      grid-row: 1;
      text-align: right !important;
      color: var(--c1-vino);
      font-size: 13px;
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(5)::before {
      content: "";
      display: none !important;
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(2) {
      grid-column: 1;
      grid-row: 2;
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(2)::before {
      content: "Prod. ";
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(3) {
      grid-column: 1;
      grid-row: 3;
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(3)::before {
      content: "Vence ";
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(4) {
      grid-column: 2;
      grid-row: 2 / span 2;
      align-self: center;
      text-align: right !important;
    }

    .c1-dispatch .dispatch-history-lots-table td:nth-child(4)::before {
      content: "UM ";
    }

    /* DETALLE SOLICITADO COMO TARJETAS */
    .c1-dispatch .dispatch-requested-table,
    .c1-dispatch .dispatch-reserve-table {
      overflow: visible !important;
    }

    .c1-dispatch .dispatch-requested-table table,
    .c1-dispatch .dispatch-requested-table tbody,
    .c1-dispatch .dispatch-requested-table tr,
    .c1-dispatch .dispatch-requested-table td,
    .c1-dispatch .dispatch-reserve-table table,
    .c1-dispatch .dispatch-reserve-table tbody,
    .c1-dispatch .dispatch-reserve-table tr,
    .c1-dispatch .dispatch-reserve-table td {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
    }

    .c1-dispatch .dispatch-requested-table thead,
    .c1-dispatch .dispatch-reserve-table thead {
      display: none !important;
    }

    .c1-dispatch .dispatch-requested-table tbody,
    .c1-dispatch .dispatch-reserve-table tbody {
      display: grid !important;
      gap: 8px;
    }

    .c1-dispatch .dispatch-requested-table tr,
    .c1-dispatch .dispatch-reserve-table tr {
      padding: 10px;
      border: 1px solid #eee3dd;
      border-radius: 11px;
      background: #fffdfb;
    }

    .c1-dispatch .dispatch-requested-table td,
    .c1-dispatch .dispatch-reserve-table td {
      min-height: 30px;
      display: grid !important;
      grid-template-columns: 110px minmax(0,1fr) !important;
      align-items: center;
      gap: 8px;
      padding: 4px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
      font-size: 12px;
    }

    .c1-dispatch .dispatch-requested-table td::before,
    .c1-dispatch .dispatch-reserve-table td::before {
      color: #8e7c75;
      font-size: 9px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
    }

    .c1-dispatch .dispatch-requested-table td:nth-child(1)::before { content: "Producto"; }
    .c1-dispatch .dispatch-requested-table td:nth-child(2)::before { content: "Código"; }
    .c1-dispatch .dispatch-requested-table td:nth-child(3)::before { content: "UM"; }
    .c1-dispatch .dispatch-requested-table td:nth-child(4)::before { content: "Pedido gav./cajas"; }
    .c1-dispatch .dispatch-requested-table td:nth-child(5)::before { content: "A despachar"; }
    .c1-dispatch .dispatch-requested-table td:nth-child(6)::before { content: "Unidades"; }

    .c1-dispatch .dispatch-reserve-table td:nth-child(1)::before { content: "Producto"; }
    .c1-dispatch .dispatch-reserve-table td:nth-child(2)::before { content: "Lote"; }
    .c1-dispatch .dispatch-reserve-table td:nth-child(3)::before { content: "Producción"; }
    .c1-dispatch .dispatch-reserve-table td:nth-child(4)::before { content: "Vencimiento"; }
    .c1-dispatch .dispatch-reserve-table td:nth-child(5)::before { content: "Gavetas / cajas"; }
    .c1-dispatch .dispatch-reserve-table td:nth-child(6)::before { content: "Unidades"; }

    .c1-dispatch .dispatch-requested-table td:nth-child(1),
    .c1-dispatch .dispatch-reserve-table td:nth-child(1) {
      display: block !important;
      text-align: left !important;
      padding-bottom: 7px !important;
      border-bottom: 1px solid #f1e8e3 !important;
    }

    .c1-dispatch .dispatch-requested-table td:nth-child(1)::before,
    .c1-dispatch .dispatch-reserve-table td:nth-child(1)::before {
      display: none;
    }

    .c1-dispatch .dispatch-requested-table td:nth-child(1) strong,
    .c1-dispatch .dispatch-reserve-table td:nth-child(1) strong {
      color: var(--c1-vino);
      font-size: 14px;
    }

    .c1-dispatch .dispatch-quantity-input {
      width: 100% !important;
      max-width: 120px;
      min-height: 40px !important;
      margin-left: auto;
      font-size: 14px;
    }

    .c1-dispatch .dispatch-max-reserved {
      text-align: right;
      white-space: normal;
    }

    .c1-dispatch .dispatch-partial-summary {
      grid-template-columns: repeat(2, minmax(0,1fr)) !important;
      gap: 6px !important;
      padding: 8px !important;
    }

    .c1-dispatch .dispatch-partial-summary > div {
      padding: 6px 4px;
      border-radius: 8px;
      background: rgba(255,255,255,.7);
    }

    .c1-dispatch .dispatch-partial-summary strong {
      font-size: 16px !important;
    }

    .c1-dispatch .dispatch-summary {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 4px !important;
      padding: 10px !important;
      margin-top: 9px !important;
      text-align: center;
    }

    .c1-dispatch .dispatch-summary strong {
      color: var(--c1-vino);
      font-size: 16px;
    }

    .c1-dispatch .dispatch-inline-detail .dispatch-actions {
      position: static !important;
      margin-top: 12px !important;
    }

    .c1-dispatch .dispatch-actions {
      position: sticky;
      bottom: 74px;
      z-index: 25;
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 8px !important;
      padding: 12px !important;
      margin: 0 -2px !important;
      border: 1px solid #eee3dd !important;
      border-radius: 12px;
      background: rgba(255,255,255,.97);
      backdrop-filter: blur(10px);
    }

    .c1-dispatch .dispatch-actions button {
      width: 100%;
      min-height: 46px;
    }
  }

  @media (max-width: 720px) {
    .c1-dispatch .dispatch-invoice-link {
      grid-template-columns: 1fr;
    }

    .c1-dispatch .dispatch-invoice-controls {
      grid-template-columns: 1fr;
    }

    .c1-dispatch .dispatch-invoice-controls button {
      width: 100%;
    }
  }

  @media (max-width: 470px) {
    .c1-dispatch .dispatch-alert-box {
      padding: 20px 16px 16px;
      border-radius: 14px;
    }

    .c1-dispatch .dispatch-alert-box h3 {
      font-size: 18px;
    }

    .c1-dispatch .dispatch-alert-box button {
      width: 100%;
    }

    .c1-dispatch .dispatch-filters {
      grid-template-columns: 1fr !important;
    }

    .c1-dispatch .dispatch-general-data {
      grid-template-columns: 1fr 1fr !important;
    }
  }
`

