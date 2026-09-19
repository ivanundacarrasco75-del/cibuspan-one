import { useMemo, useState } from "react"
import { obtenerPedidos } from "../services/pedidoService"

type DetalleDespacho = {
  codigo: string
  corto?: string
  lote: string
  fechaProduccion: string
  fechaVencimiento: string
  unidades: number
}

type Despacho = {
  id: string
  pedidoId: string
  reservaId: string
  cliente?: string
  bodega?: string
  fechaEntrega?: string
  tipoEmpaque?: string
  fechaDespacho: string
  detalles: DetalleDespacho[]
}

export default function HistorialDespachos() {
  const despachos: Despacho[] = JSON.parse(
    localStorage.getItem("cibuspan-despachos") ?? "[]",
  )

  const pedidos = obtenerPedidos()

  const [filtroCliente, setFiltroCliente] = useState("")
  const [filtroPedido, setFiltroPedido] = useState("")
  const [filtroLote, setFiltroLote] = useState("")
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")

  const despachosCompletos = useMemo(() => {
    return despachos.map((despacho) => {
      const pedidoRelacionado = pedidos.find(
        (pedido) => pedido.id === despacho.pedidoId,
      )

      return {
        ...despacho,
        cliente:
          despacho.cliente ??
          pedidoRelacionado?.cliente ??
          "No registrado",
        bodega:
          despacho.bodega ??
          pedidoRelacionado?.bodega ??
          "No registrada",
        fechaEntrega:
          despacho.fechaEntrega ??
          pedidoRelacionado?.fechaEntrega ??
          "No registrada",
        tipoEmpaque:
          despacho.tipoEmpaque ??
          pedidoRelacionado?.tipoEmpaque ??
          "No registrada",
      }
    })
  }, [despachos, pedidos])

  const despachosFiltrados = useMemo(() => {
    return despachosCompletos
      .filter((despacho) => {
        const coincideCliente =
          filtroCliente.trim() === "" ||
          despacho.cliente
            .toLowerCase()
            .includes(filtroCliente.trim().toLowerCase())

        const coincidePedido =
          filtroPedido.trim() === "" ||
          despacho.pedidoId
            .toLowerCase()
            .includes(filtroPedido.trim().toLowerCase())

        const coincideLote =
          filtroLote.trim() === "" ||
          despacho.detalles.some((detalle) =>
            detalle.lote
              .toLowerCase()
              .includes(filtroLote.trim().toLowerCase()),
          )

        const fechaDespacho =
          despacho.fechaDespacho.slice(0, 10)

        const coincideDesde =
          fechaDesde === "" || fechaDespacho >= fechaDesde

        const coincideHasta =
          fechaHasta === "" || fechaDespacho <= fechaHasta

        return (
          coincideCliente &&
          coincidePedido &&
          coincideLote &&
          coincideDesde &&
          coincideHasta
        )
      })
      .sort((a, b) =>
        b.fechaDespacho.localeCompare(a.fechaDespacho),
      )
  }, [
    despachosCompletos,
    filtroCliente,
    filtroPedido,
    filtroLote,
    fechaDesde,
    fechaHasta,
  ])

  const totalUnidades = despachosFiltrados.reduce(
    (total, despacho) =>
      total +
      despacho.detalles.reduce(
        (subtotal, detalle) =>
          subtotal + detalle.unidades,
        0,
      ),
    0,
  )

  function limpiarFiltros() {
    setFiltroCliente("")
    setFiltroPedido("")
    setFiltroLote("")
    setFechaDesde("")
    setFechaHasta("")
  }

  return (
    <div
      style={{
        padding: "30px",
        maxWidth: "1500px",
      }}
    >
      <h1>Historial de despachos</h1>

      <section style={panelFiltros}>
        <h2>Filtros</h2>

        <div style={filtros}>
          <div>
            <label>Cliente</label>

            <input
              value={filtroCliente}
              onChange={(evento) =>
                setFiltroCliente(evento.target.value)
              }
              placeholder="Buscar cliente"
              style={campo}
            />
          </div>

          <div>
            <label>Número de pedido</label>

            <input
              value={filtroPedido}
              onChange={(evento) =>
                setFiltroPedido(evento.target.value)
              }
              placeholder="Ejemplo: PED-000003"
              style={campo}
            />
          </div>

          <div>
            <label>Número de lote</label>

            <input
              value={filtroLote}
              onChange={(evento) =>
                setFiltroLote(evento.target.value)
              }
              placeholder="Ejemplo: 300701"
              style={campo}
            />
          </div>

          <div>
            <label>Fecha desde</label>

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
            <label>Fecha hasta</label>

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

        <button
          type="button"
          onClick={limpiarFiltros}
          style={botonLimpiar}
        >
          Limpiar filtros
        </button>
      </section>

      <section style={resumen}>
        <div style={tarjeta}>
          <span>Despachos encontrados</span>
          <strong>{despachosFiltrados.length}</strong>
        </div>

        <div style={tarjeta}>
          <span>Unidades despachadas</span>
          <strong>{totalUnidades}</strong>
        </div>
      </section>

      {despachosFiltrados.length === 0 ? (
        <p>No existen despachos con estos filtros.</p>
      ) : (
        despachosFiltrados.map((despacho) => {
          const unidadesDespacho =
            despacho.detalles.reduce(
              (total, detalle) =>
                total + detalle.unidades,
              0,
            )

          return (
            <section
              key={despacho.id}
              style={panel}
            >
              <h2>{despacho.id}</h2>

              <div style={datosDespacho}>
                <p>
                  Pedido:
                  <br />
                  <strong>{despacho.pedidoId}</strong>
                </p>

                <p>
                  Cliente:
                  <br />
                  <strong>{despacho.cliente}</strong>
                </p>

                <p>
                  Bodega:
                  <br />
                  <strong>{despacho.bodega}</strong>
                </p>

                <p>
                  Fecha de entrega:
                  <br />
                  <strong>{despacho.fechaEntrega}</strong>
                </p>

                <p>
                  Unidad de despacho:
                  <br />
                  <strong>{despacho.tipoEmpaque}</strong>
                </p>

                <p>
                  Fecha y hora del despacho:
                  <br />
                  <strong>
                    {new Date(
                      despacho.fechaDespacho,
                    ).toLocaleString()}
                  </strong>
                </p>

                <p>
                  Total de unidades:
                  <br />
                  <strong>{unidadesDespacho}</strong>
                </p>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={tabla}>
                  <thead>
                    <tr>
                      <th style={encabezado}>Código</th>
                      <th style={encabezado}>Producto</th>
                      <th style={encabezado}>Lote</th>
                      <th style={encabezado}>
                        Producción
                      </th>
                      <th style={encabezado}>
                        Vencimiento
                      </th>
                      <th style={encabezado}>
                        Unidades
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {despacho.detalles.map(
                      (detalle, indice) => (
                        <tr
                          key={`${despacho.id}-${indice}`}
                        >
                          <td style={celda}>
                            {detalle.codigo}
                          </td>

                          <td style={celda}>
                            <strong>
                              {detalle.corto ?? ""}
                            </strong>
                          </td>

                          <td style={celda}>
                            <strong>
                              {detalle.lote}
                            </strong>
                          </td>

                          <td style={celda}>
                            {detalle.fechaProduccion}
                          </td>

                          <td style={celda}>
                            {detalle.fechaVencimiento}
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
            </section>
          )
        })
      )}
    </div>
  )
}

const panelFiltros = {
  marginBottom: "24px",
  padding: "22px",
  border: "1px solid #dddddd",
  borderRadius: "10px",
  background: "white",
}

const filtros = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "16px",
  marginBottom: "18px",
}

const campo = {
  display: "block",
  width: "100%",
  padding: "10px",
  marginTop: "6px",
}

const botonLimpiar = {
  padding: "10px 16px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const resumen = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "16px",
  marginBottom: "24px",
}

const tarjeta = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  padding: "18px",
  borderRadius: "10px",
  background: "#f4f4f4",
}

const panel = {
  marginBottom: "24px",
  padding: "22px",
  border: "1px solid #dddddd",
  borderRadius: "10px",
  background: "white",
}

const datosDespacho = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "16px",
  marginBottom: "22px",
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "10px",
  textAlign: "left" as const,
  borderBottom: "2px solid #cccccc",
  whiteSpace: "nowrap" as const,
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #eeeeee",
  whiteSpace: "nowrap" as const,
}