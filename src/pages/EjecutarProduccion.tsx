import { useState } from "react"
import {
  ejecutarPrograma,
  obtenerProgramasPendientes,
  type DetalleEjecucion,
} from "../services/produccionService"

export default function EjecutarProduccion() {
  const [programas, setProgramas] = useState(
    obtenerProgramasPendientes(),
  )

  const [programaId, setProgramaId] = useState("")
  const [fechaProduccionReal, setFechaProduccionReal] =
    useState("")
  const [detalles, setDetalles] = useState<
    Record<string, DetalleEjecucion>
  >({})
  const [mensaje, setMensaje] = useState("")

  const programaSeleccionado = programas.find(
    (programa) => programa.id === programaId,
  )

  function seleccionarPrograma(id: string) {
    setProgramaId(id)
    setMensaje("")

    const programa = programas.find(
      (item) => item.id === id,
    )

    if (!programa) {
      setDetalles({})
      return
    }

    const nuevosDetalles: Record<
      string,
      DetalleEjecucion
    > = {}

    programa.productos.forEach((producto) => {
      nuevosDetalles[producto.codigo] = {
        codigo: producto.codigo,
        lote: "",
        unidades: producto.unidadesProgramadas,
      }
    })

    setDetalles(nuevosDetalles)
  }

  function cambiarDetalle(
    codigo: string,
    campo: "lote" | "unidades",
    valor: string,
  ) {
    setDetalles((actuales) => ({
      ...actuales,
      [codigo]: {
        ...actuales[codigo],
        [campo]:
          campo === "unidades"
            ? Math.max(0, Number(valor) || 0)
            : valor,
      },
    }))
  }

  function confirmarEjecucion() {
    setMensaje("")

    try {
      ejecutarPrograma(
        programaId,
        fechaProduccionReal,
        Object.values(detalles),
      )

      setMensaje(
        "Producción ejecutada e inventario actualizado.",
      )

      setProgramas(obtenerProgramasPendientes())
      setProgramaId("")
      setFechaProduccionReal("")
      setDetalles({})
    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo ejecutar la producción.",
      )
    }
  }

  return (
    <div style={{ padding: "30px", maxWidth: "1200px" }}>
      <h1>Ejecutar producción</h1>

      <div style={{ marginBottom: "20px" }}>
        <label>Programa pendiente</label>

        <select
          value={programaId}
          onChange={(evento) =>
            seleccionarPrograma(evento.target.value)
          }
          style={{
            display: "block",
            width: "100%",
            maxWidth: "600px",
            padding: "10px",
            marginTop: "6px",
          }}
        >
          <option value="">Seleccione...</option>

          {programas.map((programa) => (
            <option
              key={programa.id}
              value={programa.id}
            >
              {programa.id} · entrega{" "}
              {programa.fechaEntrega} ·{" "}
              {programa.totalProgramado} lotes
            </option>
          ))}
        </select>
      </div>

      {programaSeleccionado && (
        <>
          <div style={{ marginBottom: "20px" }}>
            <label>Fecha real de producción</label>

            <input
              type="date"
              value={fechaProduccionReal}
              onChange={(evento) =>
                setFechaProduccionReal(
                  evento.target.value,
                )
              }
              style={{
                display: "block",
                padding: "10px",
                marginTop: "6px",
              }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>SKU</th>
                  <th style={encabezado}>
                    Lotes programados
                  </th>
                  <th style={encabezado}>
                    Unidades programadas
                  </th>
                  <th style={encabezado}>
                    Número de lote real
                  </th>
                  <th style={encabezado}>
                    Unidades reales
                  </th>
                </tr>
              </thead>

              <tbody>
                {programaSeleccionado.productos.map(
                  (producto) => {
                    const detalle =
                      detalles[producto.codigo]

                    return (
                      <tr key={producto.codigo}>
                        <td style={celda}>
                          <strong>
                            {producto.corto}
                          </strong>
                          <br />
                          <small>
                            {producto.codigo}
                          </small>
                        </td>

                        <td style={celda}>
                          {producto.lotesProgramados}
                        </td>

                        <td style={celda}>
                          {producto.unidadesProgramadas}
                        </td>

                        <td style={celda}>
                          <input
                            value={detalle?.lote ?? ""}
                            onChange={(evento) =>
                              cambiarDetalle(
                                producto.codigo,
                                "lote",
                                evento.target.value,
                              )
                            }
                            placeholder="Ingrese lote"
                            style={{
                              width: "180px",
                              padding: "8px",
                            }}
                          />
                        </td>

                        <td style={celda}>
                          <input
                            type="number"
                            min="0"
                            value={detalle?.unidades ?? 0}
                            onChange={(evento) =>
                              cambiarDetalle(
                                producto.codigo,
                                "unidades",
                                evento.target.value,
                              )
                            }
                            style={{
                              width: "120px",
                              padding: "8px",
                            }}
                          />
                        </td>
                      </tr>
                    )
                  },
                )}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={confirmarEjecucion}
            style={{
              marginTop: "22px",
              padding: "12px 22px",
              border: "none",
              borderRadius: "8px",
              background: "#8f1d24",
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Confirmar ejecución
          </button>
        </>
      )}

      {programas.length === 0 && (
        <p>No existen programas pendientes.</p>
      )}

      {mensaje && (
        <p style={{ marginTop: "16px" }}>{mensaje}</p>
      )}
    </div>
  )
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
  whiteSpace: "nowrap" as const,
}

const celda = {
  padding: "12px",
  borderBottom: "1px solid #eeeeee",
  whiteSpace: "nowrap" as const,
}