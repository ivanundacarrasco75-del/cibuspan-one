import { useMemo, useState } from "react"
import { clientes } from "../data/clientes"
import { bodegas } from "../data/bodegas"
import { skus } from "../data/skus"
import { clienteSkus } from "../data/clienteSkus"
import { guardarPedido } from "../services/pedidoService"
import HistorialPedidos from "../components/pedidos/HistorialPedidos"

type Cantidades = Record<string, number>

export default function Pedidos() {
  const [clienteId, setClienteId] = useState<number | "">("")
  const [bodegaId, setBodegaId] = useState<number | "">("")
  const [fecha, setFecha] = useState("")
  const [horaEntrega, setHoraEntrega] = useState("")
  const [prioridad, setPrioridad] = useState("NORMAL")
  const [contactoRecepcion, setContactoRecepcion] =
    useState("")
  const [observaciones, setObservaciones] = useState("")
  const [cantidades, setCantidades] =
    useState<Cantidades>({})
  const [mensaje, setMensaje] = useState("")
  const [actualizador, setActualizador] = useState(0)

  const bodegasCliente = useMemo(() => {
    if (clienteId === "") return []

    return bodegas.filter(
      (bodega) => bodega.clienteId === clienteId,
    )
  }, [clienteId])

  const productosHabilitados = useMemo(() => {
    if (clienteId === "") return []

    return clienteSkus
      .filter(
        (relacion) => relacion.clienteId === clienteId,
      )
      .map((relacion) => {
        const producto = skus.find(
          (sku) => sku.codigo === relacion.sku,
        )

        if (!producto) return null

        return {
          ...producto,
          unidadesManejo: relacion.unidadesManejo,
        }
      })
      .filter(
        (
          producto,
        ): producto is NonNullable<typeof producto> =>
          producto !== null,
      )
  }, [clienteId])

  const bodegaSeleccionada = bodegas.find(
    (bodega) => bodega.id === bodegaId,
  )

  const productosPedido = productosHabilitados
    .map((producto) => {
      const cantidadManejo =
        cantidades[producto.codigo] ?? 0

      return {
        codigo: producto.codigo,
        nombre: producto.nombre,
        corto: producto.corto,
        unidadesManejo: producto.unidadesManejo,
        cantidadManejo,
        totalUnidades:
          cantidadManejo * producto.unidadesManejo,
        unidadesDespachadas: 0,
        estado: "PENDIENTE" as const,
        lotesDespachados: [],
      }
    })
    .filter(
      (producto) => producto.cantidadManejo > 0,
    )

  const totalUnidades = productosPedido.reduce(
    (total, producto) =>
      total + producto.totalUnidades,
    0,
  )

  function cambiarCliente(valor: string) {
    const nuevoClienteId =
      valor === "" ? "" : Number(valor)

    setClienteId(nuevoClienteId)
    setBodegaId("")
    setCantidades({})
    setMensaje("")
  }

  function cambiarCantidad(
    codigo: string,
    valor: string,
  ) {
    const cantidad = Math.max(
      0,
      Number(valor) || 0,
    )

    setCantidades((anteriores) => ({
      ...anteriores,
      [codigo]: cantidad,
    }))
  }

  function limpiarFormulario() {
    setClienteId("")
    setBodegaId("")
    setFecha("")
    setHoraEntrega("")
    setPrioridad("NORMAL")
    setContactoRecepcion("")
    setObservaciones("")
    setCantidades({})
  }

  function registrarPedido() {
    setMensaje("")

    if (clienteId === "") {
      setMensaje("Selecciona un cliente.")
      return
    }

    if (bodegaId === "") {
      setMensaje("Selecciona una bodega.")
      return
    }

    if (!fecha) {
      setMensaje("Selecciona la fecha de entrega.")
      return
    }

    if (productosPedido.length === 0) {
      setMensaje("Ingresa al menos una cantidad.")
      return
    }

    const cliente = clientes.find(
      (item) => item.id === clienteId,
    )

    if (!cliente || !bodegaSeleccionada) {
      setMensaje(
        "No se encontraron los datos del cliente o bodega.",
      )
      return
    }

    const nuevoPedido = guardarPedido({
      fechaEntrega: fecha,
      horaEntrega,
      prioridad,
      contactoRecepcion:
        contactoRecepcion.trim(),
      observaciones: observaciones.trim(),
      clienteId,
      cliente: cliente.nombre,
      bodegaId,
      bodega: bodegaSeleccionada.nombre,
      tipoEmpaque:
        bodegaSeleccionada.tipoEmpaque,
      productos: productosPedido,
      totalUnidades,
    })

    limpiarFormulario()
    setActualizador((valor) => valor + 1)

    setMensaje(
      `${nuevoPedido.id} guardado: ${productosPedido.length} SKU y ${totalUnidades} unidades.`,
    )
  }

  return (
    <div
      style={{
        padding: "30px",
        maxWidth: "1200px",
      }}
    >
      <h1>Nuevo Pedido</h1>

      <section style={panel}>
        <div style={formulario}>
          <div>
            <label>Cliente</label>

            <select
              value={clienteId}
              onChange={(evento) =>
                cambiarCliente(
                  evento.target.value,
                )
              }
              style={campo}
            >
              <option value="">
                Seleccione...
              </option>

              {clientes.map((cliente) => (
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
            <label>Bodega</label>

            <select
              value={bodegaId}
              disabled={clienteId === ""}
              onChange={(evento) =>
                setBodegaId(
                  evento.target.value === ""
                    ? ""
                    : Number(
                        evento.target.value,
                      ),
                )
              }
              style={campo}
            >
              <option value="">
                Seleccione...
              </option>

              {bodegasCliente.map((bodega) => (
                <option
                  key={bodega.id}
                  value={bodega.id}
                >
                  {bodega.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Fecha de entrega</label>

            <input
              type="date"
              value={fecha}
              onChange={(evento) =>
                setFecha(evento.target.value)
              }
              style={campo}
            />
          </div>

          <div>
            <label>Hora de entrega</label>

            <input
              type="time"
              value={horaEntrega}
              onChange={(evento) =>
                setHoraEntrega(
                  evento.target.value,
                )
              }
              style={campo}
            />
          </div>

          <div>
            <label>Prioridad</label>

            <select
              value={prioridad}
              onChange={(evento) =>
                setPrioridad(
                  evento.target.value,
                )
              }
              style={campo}
            >
              <option value="NORMAL">
                Normal
              </option>
              <option value="ALTA">
                Alta
              </option>
              <option value="URGENTE">
                Urgente
              </option>
            </select>
          </div>

          <div>
            <label>
              Contacto de recepción
            </label>

            <input
              value={contactoRecepcion}
              onChange={(evento) =>
                setContactoRecepcion(
                  evento.target.value,
                )
              }
              placeholder="Nombre o teléfono"
              style={campo}
            />
          </div>
        </div>

        <div>
          <label>Observaciones</label>

          <textarea
            value={observaciones}
            onChange={(evento) =>
              setObservaciones(
                evento.target.value,
              )
            }
            placeholder="Indicaciones especiales"
            rows={3}
            style={{
              ...campo,
              resize: "vertical",
            }}
          />
        </div>

        {bodegaSeleccionada && (
          <p>
            Empaque de despacho:{" "}
            <strong>
              {
                bodegaSeleccionada.tipoEmpaque
              }
            </strong>
          </p>
        )}
      </section>

      {clienteId !== "" && (
        <>
          <h2>Productos habilitados</h2>

          <div
            style={{ overflowX: "auto" }}
          >
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
                    Unidades por manejo
                  </th>
                  <th style={encabezado}>
                    Cantidad de manejos
                  </th>
                  <th style={encabezado}>
                    Total unidades
                  </th>
                </tr>
              </thead>

              <tbody>
                {productosHabilitados.map(
                  (producto) => {
                    const cantidad =
                      cantidades[
                        producto.codigo
                      ] ?? 0

                    return (
                      <tr
                        key={producto.codigo}
                      >
                        <td style={celda}>
                          {producto.codigo}
                        </td>

                        <td style={celda}>
                          <strong>
                            {producto.corto}
                          </strong>
                          <br />
                          <small>
                            {producto.nombre}
                          </small>
                        </td>

                        <td style={celda}>
                          {
                            producto.unidadesManejo
                          }
                        </td>

                        <td style={celda}>
                          <input
                            type="number"
                            min="0"
                            value={cantidad}
                            onChange={(
                              evento,
                            ) =>
                              cambiarCantidad(
                                producto.codigo,
                                evento.target
                                  .value,
                              )
                            }
                            style={{
                              width: "90px",
                              padding: "8px",
                            }}
                          />
                        </td>

                        <td style={celda}>
                          {cantidad *
                            producto.unidadesManejo}
                        </td>
                      </tr>
                    )
                  },
                )}
              </tbody>
            </table>
          </div>

          <section style={resumen}>
            <p>
              SKU solicitados:{" "}
              <strong>
                {productosPedido.length}
              </strong>
            </p>

            <p>
              Total de unidades:{" "}
              <strong>
                {totalUnidades}
              </strong>
            </p>

            <p>
              Prioridad:{" "}
              <strong>{prioridad}</strong>
            </p>

            <button
              type="button"
              onClick={registrarPedido}
              style={boton}
            >
              Guardar pedido
            </button>

            {mensaje && (
              <p
                style={{
                  marginTop: "14px",
                }}
              >
                {mensaje}
              </p>
            )}
          </section>
        </>
      )}

      <HistorialPedidos
        key={actualizador}
      />
    </div>
  )
}

const panel = {
  padding: "22px",
  background: "white",
  border: "1px solid #dddddd",
  borderRadius: "12px",
  marginBottom: "28px",
}

const formulario = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "18px",
}

const campo = {
  display: "block",
  width: "100%",
  padding: "10px",
  marginTop: "6px",
}

const resumen = {
  marginTop: "22px",
  padding: "18px",
  background: "#f4f4f4",
  borderRadius: "10px",
}

const boton = {
  padding: "12px 22px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
  background: "white",
}

const encabezado = {
  padding: "12px",
  textAlign: "left" as const,
  borderBottom: "2px solid #dddddd",
}

const celda = {
  padding: "12px",
  borderBottom: "1px solid #eeeeee",
}