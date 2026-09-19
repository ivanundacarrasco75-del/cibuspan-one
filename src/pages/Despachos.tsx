import { useState } from "react"
import { obtenerPedidos } from "../services/pedidoService"
import {
  confirmarDespacho,
  crearReservaPedido,
  liberarReserva,
  obtenerReservas,
  obtenerResumenReserva,
} from "../services/reservaInventarioService"

export default function Despachos() {
  const [pedidos, setPedidos] = useState(
    obtenerPedidos(),
  )

  const [reservas, setReservas] = useState(
    obtenerReservas(),
  )

  const [
    pedidoSeleccionado,
    setPedidoSeleccionado,
  ] = useState("")

  const [mensaje, setMensaje] = useState("")

  const pedidosPendientes = pedidos.filter(
    (pedido) =>
      pedido.estado !== "DESPACHADO" &&
      pedido.estado !== "CANCELADO",
  )

  const pedido = pedidos.find(
    (item) => item.id === pedidoSeleccionado,
  )

  const reservaActiva = reservas.find(
    (reserva) =>
      reserva.pedidoId === pedidoSeleccionado &&
      reserva.estado === "ACTIVA",
  )

  const resumenReserva =
    pedidoSeleccionado
      ? obtenerResumenReserva(
          pedidoSeleccionado,
        )
      : []

  const totalReservado =
    reservaActiva?.detalles.reduce(
      (total, detalle) =>
        total + detalle.unidades,
      0,
    ) ?? 0

  function refrescarDatos() {
    setPedidos(obtenerPedidos())
    setReservas(obtenerReservas())
  }

  function abrirPedido(id: string) {
    setPedidoSeleccionado(id)
    setMensaje("")
  }

  function reservarInventario() {
    if (!pedidoSeleccionado) return

    setMensaje("")

    try {
      const reserva = crearReservaPedido(
        pedidoSeleccionado,
      )

      refrescarDatos()

      setMensaje(
        `Reserva ${reserva.id} creada correctamente.`,
      )
    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo reservar el inventario.",
      )
    }
  }

  function liberarInventario() {
    if (!reservaActiva) return

    setMensaje("")

    try {
      liberarReserva(reservaActiva.id)

      refrescarDatos()

      setMensaje(
        "Reserva liberada correctamente.",
      )
    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo liberar la reserva.",
      )
    }
  }

  function confirmarSalida() {
    if (!reservaActiva) return

    const confirmacion = window.confirm(
      `¿Confirmas el despacho de ${totalReservado} unidades?`,
    )

    if (!confirmacion) return

    setMensaje("")

    try {
      confirmarDespacho(reservaActiva.id)

      refrescarDatos()
      setPedidoSeleccionado("")

      setMensaje(
        "Despacho confirmado e inventario actualizado.",
      )
    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo confirmar el despacho.",
      )
    }
  }

  return (
    <div
      style={{
        padding: "30px",
        maxWidth: "1600px",
      }}
    >
      <h1>Despachos</h1>

      <section style={panel}>
        <h2>Pedidos pendientes</h2>

        {pedidosPendientes.length === 0 ? (
          <p>No existen pedidos pendientes.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Pedido
                  </th>

                  <th style={encabezado}>
                    Cliente
                  </th>

                  <th style={encabezado}>
                    Bodega
                  </th>

                  <th style={encabezado}>
                    Entrega
                  </th>

                  <th style={encabezado}>
                    Prioridad
                  </th>

                  <th style={encabezado}>
                    Estado
                  </th>

                  <th style={encabezado}>
                    Acción
                  </th>
                </tr>
              </thead>

              <tbody>
                {pedidosPendientes.map(
                  (pedido) => (
                    <tr key={pedido.id}>
                      <td style={celda}>
                        <strong>
                          {pedido.id}
                        </strong>
                      </td>

                      <td style={celda}>
                        {pedido.cliente}
                      </td>

                      <td style={celda}>
                        {pedido.bodega}
                      </td>

                      <td style={celda}>
                        {pedido.fechaEntrega}
                      </td>

                      <td style={celda}>
                        {pedido.prioridad}
                      </td>

                      <td style={celda}>
                        {pedido.estado}
                      </td>

                      <td style={celda}>
                        <button
                          type="button"
                          onClick={() =>
                            abrirPedido(
                              pedido.id,
                            )
                          }
                          style={
                            botonSecundario
                          }
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pedido && (
        <section style={panel}>
          <h2>{pedido.id}</h2>

          <div style={datosPedido}>
            <p>
              Cliente:
              <br />
              <strong>
                {pedido.cliente}
              </strong>
            </p>

            <p>
              Bodega:
              <br />
              <strong>
                {pedido.bodega}
              </strong>
            </p>

            <p>
              Entrega:
              <br />
              <strong>
                {pedido.fechaEntrega}
              </strong>
            </p>

            <p>
              Empaque:
              <br />
              <strong>
                {pedido.tipoEmpaque}
              </strong>
            </p>
          </div>

          <h3>Detalle solicitado</h3>

          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    SKU
                  </th>

                  <th style={encabezado}>
                    Código
                  </th>

                  <th style={encabezado}>
                    Unidad de manejo
                  </th>

                  <th style={encabezado}>
                    Solicitado
                  </th>

                  <th style={encabezado}>
                    Reservado
                  </th>

                  <th style={encabezado}>
                    Faltante
                  </th>
                </tr>
              </thead>

              <tbody>
                {resumenReserva.map(
                  (producto) => (
                    <tr
                      key={producto.codigo}
                    >
                      <td style={celda}>
                        <strong>
                          {producto.corto}
                        </strong>
                      </td>

                      <td style={celda}>
                        {producto.codigo}
                      </td>

                      <td style={celda}>
                        {
                          producto.unidadesManejo
                        }
                      </td>

                      <td style={celda}>
                        {producto.solicitado}
                      </td>

                      <td style={celda}>
                        {producto.reservado}
                      </td>

                      <td style={celda}>
                        <strong
                          style={{
                            color:
                              producto.faltante >
                              0
                                ? "#b91c1c"
                                : "#15803d",
                          }}
                        >
                          {producto.faltante}
                        </strong>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {!reservaActiva && (
            <button
              type="button"
              onClick={reservarInventario}
              style={botonPrincipal}
            >
              Reservar inventario FEFO
            </button>
          )}
        </section>
      )}

      {reservaActiva && (
        <section style={panel}>
          <h2>Reserva FEFO por lote</h2>

          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Código
                  </th>

                  <th style={encabezado}>
                    Producto
                  </th>

                  <th style={encabezado}>
                    Lote
                  </th>

                  <th style={encabezado}>
                    Fecha producción
                  </th>

                  <th style={encabezado}>
                    Fecha vencimiento
                  </th>

                  <th style={encabezado}>
                    Unidad manejo
                  </th>

                  <th style={encabezado}>
                    Disponible físico
                  </th>

                  <th style={encabezado}>
                    Disponible despachable
                  </th>

                  <th style={encabezado}>
                    Saldo no despachable
                  </th>

                  <th style={encabezado}>
                    Reservado
                  </th>
                </tr>
              </thead>

              <tbody>
                {reservaActiva.detalles.map(
                  (detalle, indice) => (
                    <tr
                      key={`${detalle.inventarioId}-${indice}`}
                    >
                      <td style={celda}>
                        {detalle.codigo}
                      </td>

                      <td style={celda}>
                        <strong>
                          {detalle.corto}
                        </strong>
                      </td>

                      <td style={celda}>
                        <strong>
                          {detalle.lote}
                        </strong>
                      </td>

                      <td style={celda}>
                        {
                          detalle.fechaProduccion
                        }
                      </td>

                      <td style={celda}>
                        {
                          detalle.fechaVencimiento
                        }
                      </td>

                      <td style={celda}>
                        {
                          detalle.unidadesManejo
                        }
                      </td>

                      <td style={celda}>
                        {
                          detalle.disponibleFisico
                        }
                      </td>

                      <td style={celda}>
                        {
                          detalle.disponibleDespachable
                        }
                      </td>

                      <td style={celda}>
                        {
                          detalle.saldoNoDespachable
                        }
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

          <div style={resumenDespacho}>
            <span>Total reservado</span>
            <strong>
              {totalReservado} unidades
            </strong>
          </div>

          <div style={acciones}>
            <button
              type="button"
              onClick={liberarInventario}
              style={botonLiberar}
            >
              Liberar reserva
            </button>

            <button
              type="button"
              onClick={confirmarSalida}
              style={botonConfirmar}
            >
              Confirmar despacho
            </button>
          </div>
        </section>
      )}

      {mensaje && (
        <p style={mensajeEstilo}>
          {mensaje}
        </p>
      )}
    </div>
  )
}

const panel = {
  marginBottom: "26px",
  padding: "22px",
  border: "1px solid #dddddd",
  borderRadius: "10px",
  background: "white",
}

const datosPedido = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "16px",
}

const resumenDespacho = {
  display: "flex",
  justifyContent: "space-between",
  gap: "20px",
  marginTop: "20px",
  padding: "16px",
  borderRadius: "8px",
  background: "#f4f4f4",
}

const acciones = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "12px",
  marginTop: "20px",
}

const botonPrincipal = {
  marginTop: "20px",
  padding: "12px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonSecundario = {
  padding: "8px 12px",
  border: "1px solid #8f1d24",
  borderRadius: "6px",
  background: "white",
  color: "#8f1d24",
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

const botonConfirmar = {
  padding: "12px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#15803d",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const mensajeEstilo = {
  padding: "14px",
  borderRadius: "8px",
  background: "#f4f4f4",
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
  background: "white",
}

const encabezado = {
  padding: "10px",
  borderBottom: "2px solid #cccccc",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #eeeeee",
  whiteSpace: "nowrap" as const,
}