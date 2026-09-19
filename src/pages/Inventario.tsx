import { useMemo, useState } from "react"
import { skus } from "../data/skus"

type RegistroInventario = {
  id: string
  codigo: string
  lote: string
  fechaProduccion: string
  fechaVencimiento: string
  cantidad: number
}

function sumarDias(fecha: string, dias: number) {
  const resultado = new Date(`${fecha}T12:00:00`)
  resultado.setDate(resultado.getDate() + dias)

  return resultado.toISOString().slice(0, 10)
}

export default function Inventario() {
  const [codigo, setCodigo] = useState("")
  const [lote, setLote] = useState("")
  const [fechaProduccion, setFechaProduccion] = useState("")
  const [cantidad, setCantidad] = useState("")
  const [mensaje, setMensaje] = useState("")

  const [inventario, setInventario] = useState<RegistroInventario[]>(
    () =>
      JSON.parse(
        localStorage.getItem("cibuspan-inventario") ?? "[]",
      ),
  )

  const resumenSku = useMemo(() => {
    return skus
      .map((producto) => {
        const registros = inventario.filter(
          (registro) => registro.codigo === producto.codigo,
        )

        const total = registros.reduce(
          (suma, registro) => suma + registro.cantidad,
          0,
        )

        return {
          codigo: producto.codigo,
          corto: producto.corto,
          nombre: producto.nombre,
          total,
          lotes: registros.length,
        }
      })
      .filter((producto) => producto.total > 0)
  }, [inventario])

  const totalGeneral = inventario.reduce(
    (suma, registro) => suma + registro.cantidad,
    0,
  )

  function registrarEntrada() {
    setMensaje("")

    const producto = skus.find(
      (item) => item.codigo === codigo,
    )

    if (!producto) {
      setMensaje("Selecciona un SKU.")
      return
    }

    if (!lote.trim()) {
      setMensaje("Ingresa el número de lote.")
      return
    }

    if (!fechaProduccion) {
      setMensaje("Selecciona la fecha de producción.")
      return
    }

    const cantidadNumerica = Number(cantidad)

    if (cantidadNumerica <= 0) {
      setMensaje("Ingresa una cantidad válida.")
      return
    }

    const nuevoRegistro: RegistroInventario = {
      id: `INV-${Date.now()}`,
      codigo,
      lote: lote.trim().toUpperCase(),
      fechaProduccion,
      fechaVencimiento: sumarDias(
        fechaProduccion,
        producto.vidaUtil,
      ),
      cantidad: cantidadNumerica,
    }

    const nuevoInventario = [...inventario, nuevoRegistro]

    setInventario(nuevoInventario)

    localStorage.setItem(
      "cibuspan-inventario",
      JSON.stringify(nuevoInventario),
    )

    setLote("")
    setCantidad("")
    setMensaje("Entrada registrada correctamente.")
  }

  return (
    <div style={{ padding: "30px", maxWidth: "1200px" }}>
      <h1>Inventario</h1>

      <section style={panel}>
        <h2>Registrar entrada</h2>

        <div style={formulario}>
          <div>
            <label>SKU</label>

            <select
              value={codigo}
              onChange={(evento) =>
                setCodigo(evento.target.value)
              }
              style={campo}
            >
              <option value="">Seleccione...</option>

              {skus.map((producto) => (
                <option
                  key={producto.codigo}
                  value={producto.codigo}
                >
                  {producto.corto} - {producto.codigo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Lote</label>

            <input
              value={lote}
              onChange={(evento) =>
                setLote(evento.target.value)
              }
              placeholder="Ejemplo: INT30072601"
              style={campo}
            />
          </div>

          <div>
            <label>Fecha de producción</label>

            <input
              type="date"
              value={fechaProduccion}
              onChange={(evento) =>
                setFechaProduccion(evento.target.value)
              }
              style={campo}
            />
          </div>

          <div>
            <label>Unidades</label>

            <input
              type="number"
              min="1"
              value={cantidad}
              onChange={(evento) =>
                setCantidad(evento.target.value)
              }
              style={campo}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={registrarEntrada}
          style={boton}
        >
          Registrar entrada
        </button>

        {mensaje && <p>{mensaje}</p>}
      </section>

      <section style={{ marginTop: "30px" }}>
        <h2>Resumen por SKU</h2>

        <p>
          Total general: <strong>{totalGeneral} unidades</strong>
        </p>

        {resumenSku.length === 0 ? (
          <p>No existe inventario registrado.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>SKU</th>
                  <th style={encabezado}>Código</th>
                  <th style={encabezado}>Producto</th>
                  <th style={encabezado}>Lotes</th>
                  <th style={encabezado}>Total unidades</th>
                </tr>
              </thead>

              <tbody>
                {resumenSku.map((producto) => (
                  <tr key={producto.codigo}>
                    <td style={celda}>
                      <strong>{producto.corto}</strong>
                    </td>
                    <td style={celda}>{producto.codigo}</td>
                    <td style={celda}>{producto.nombre}</td>
                    <td style={celda}>{producto.lotes}</td>
                    <td style={celda}>
                      <strong>{producto.total}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: "30px" }}>
        <h2>Detalle por lote y fecha</h2>

        {inventario.length === 0 ? (
          <p>No existen lotes registrados.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>SKU</th>
                  <th style={encabezado}>Código</th>
                  <th style={encabezado}>Lote</th>
                  <th style={encabezado}>Producción</th>
                  <th style={encabezado}>Vencimiento</th>
                  <th style={encabezado}>Unidades</th>
                </tr>
              </thead>

              <tbody>
                {[...inventario]
                  .sort((a, b) =>
                    a.fechaVencimiento.localeCompare(
                      b.fechaVencimiento,
                    ),
                  )
                  .map((registro) => {
                    const producto = skus.find(
                      (item) =>
                        item.codigo === registro.codigo,
                    )

                    return (
                      <tr key={registro.id}>
                        <td style={celda}>
                          {producto?.corto ?? ""}
                        </td>
                        <td style={celda}>{registro.codigo}</td>
                        <td style={celda}>{registro.lote}</td>
                        <td style={celda}>
                          {registro.fechaProduccion}
                        </td>
                        <td style={celda}>
                          {registro.fechaVencimiento}
                        </td>
                        <td style={celda}>
                          <strong>{registro.cantidad}</strong>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const panel = {
  padding: "22px",
  background: "white",
  borderRadius: "12px",
  border: "1px solid #dddddd",
}

const formulario = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "18px",
  marginBottom: "20px",
}

const campo = {
  display: "block",
  width: "100%",
  padding: "10px",
  marginTop: "6px",
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