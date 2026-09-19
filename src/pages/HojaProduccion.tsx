import { useEffect, useMemo, useState } from "react"
import {
  obtenerProduccionesIngresadasDb,
  type ProduccionIngresadaDb,
} from "../repositories/produccionRepository"

function fechaHoy() {
  return new Date().toISOString().slice(0, 10)
}

function formatearFecha(fecha: string) {
  if (!fecha) return ""

  const [anio, mes, dia] =
    fecha.slice(0, 10).split("-")

  return `${dia}/${mes}/${anio}`
}

export default function HojaProduccion() {
  const [producciones, setProducciones] = useState<
    ProduccionIngresadaDb[]
  >([])

  const [fechaSeleccionada, setFechaSeleccionada] =
    useState(fechaHoy())

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    cargarProducciones()
  }, [])

  async function cargarProducciones() {
    setCargando(true)
    setError("")

    try {
      const datos =
        await obtenerProduccionesIngresadasDb()

      setProducciones(datos)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las producciones.",
      )
    } finally {
      setCargando(false)
    }
  }

  const produccionFecha = useMemo(() => {
    return producciones
      .filter(
        (registro) =>
          registro.fecha_produccion ===
          fechaSeleccionada,
      )
      .sort((a, b) =>
        (a.producto?.corto ?? "").localeCompare(
          b.producto?.corto ?? "",
        ),
      )
  }, [producciones, fechaSeleccionada])

  const totalParadas = produccionFecha.reduce(
    (total, registro) =>
      total + Number(registro.numero_paradas ?? 0),
    0,
  )

  const totalUnidades = produccionFecha.reduce(
    (total, registro) =>
      total + registro.cantidad,
    0,
  )

  function imprimir() {
    if (produccionFecha.length === 0) {
      setError(
        "No existen producciones ingresadas para la fecha seleccionada.",
      )
      return
    }

    const filasHtml = produccionFecha
      .map(
        (registro) => `
          <tr>
            <td>${registro.producto?.corto ?? ""}</td>
            <td class="numero">${registro.numero_paradas ?? 0}</td>
            <td class="numero">${
              registro.tamano_parada ??
              registro.producto?.tamano_lote ??
              0
            }</td>
            <td class="numero">${registro.cantidad}</td>
          </tr>
        `,
      )
      .join("")

    const ventana = window.open(
      "",
      "_blank",
      "width=900,height=1100",
    )

    if (!ventana) {
      setError(
        "El navegador bloqueó la ventana de impresión.",
      )
      return
    }

    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Hoja de producción</title>

          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }

            body {
              margin: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #111;
              font-size: 12px;
            }

            h1 {
              margin: 0 0 6px;
              text-align: center;
              font-size: 20px;
            }

            .fecha {
              margin-bottom: 20px;
              text-align: center;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            th,
            td {
              border: 1px solid #333;
              padding: 8px;
            }

            th {
              background: #f3f4f6;
              text-align: left;
            }

            .numero {
              text-align: right;
            }

            .total {
              background: #f3f4f6;
              font-weight: bold;
            }
          </style>
        </head>

        <body>
          <h1>HOJA DE PRODUCCIÓN</h1>

          <div class="fecha">
            Fecha de producción:
            ${formatearFecha(fechaSeleccionada)}
          </div>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Paradas / batches</th>
                <th>Unidades por parada</th>
                <th>Total unidades</th>
              </tr>
            </thead>

            <tbody>
              ${filasHtml}

              <tr class="total">
                <td>TOTAL</td>
                <td class="numero">${totalParadas}</td>
                <td></td>
                <td class="numero">${totalUnidades}</td>
              </tr>
            </tbody>
          </table>

          <script>
            window.onload = function () {
              window.print()
            }

            window.onafterprint = function () {
              window.close()
            }
          </script>
        </body>
      </html>
    `)

    ventana.document.close()
  }

  return (
    <main style={pagina}>
      <header style={cabecera}>
        <div>
          <span style={etiqueta}>
            DOCUMENTO OPERATIVO
          </span>

          <h1 style={titulo}>
            Hoja de producción
          </h1>

          <p style={subtitulo}>
            Consulta las paradas realmente ingresadas
            en Producción para la fecha seleccionada.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarProducciones}
          disabled={cargando}
          style={botonSecundario}
        >
          {cargando
            ? "Actualizando..."
            : "Actualizar"}
        </button>
      </header>

      {error && (
        <div style={mensajeError}>
          {error}
        </div>
      )}

      <section style={panel}>
        <div style={controles}>
          <div>
            <label style={label}>
              Fecha de producción
            </label>

            <input
              type="date"
              value={fechaSeleccionada}
              onChange={(evento) => {
                setFechaSeleccionada(
                  evento.target.value,
                )
                setError("")
              }}
              style={campo}
            />
          </div>

          <button
            type="button"
            onClick={imprimir}
            disabled={
              cargando ||
              produccionFecha.length === 0
            }
            style={{
              ...botonPrincipal,
              opacity:
                cargando ||
                produccionFecha.length === 0
                  ? 0.5
                  : 1,
            }}
          >
            Imprimir / Guardar PDF
          </button>
        </div>
      </section>

      <section style={panel}>
        <div style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Producción registrada
            </h2>

            <p style={descripcion}>
              Fecha:{" "}
              {formatearFecha(fechaSeleccionada)}
            </p>
          </div>

          <span style={contador}>
            {produccionFecha.length}
          </span>
        </div>

        {cargando ? (
          <div style={estadoVacio}>
            Cargando producciones...
          </div>
        ) : produccionFecha.length === 0 ? (
          <div style={estadoVacio}>
            No existen producciones ingresadas
            para esta fecha.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Producto
                  </th>

                  <th style={encabezado}>
                    Paradas / batches
                  </th>

                  <th style={encabezado}>
                    Unidades por parada
                  </th>

                  <th style={encabezado}>
                    Total unidades
                  </th>
                </tr>
              </thead>

              <tbody>
                {produccionFecha.map(
                  (registro) => (
                    <tr key={registro.id}>
                      <td style={celda}>
                        <strong>
                          {registro.producto?.corto ??
                            ""}
                        </strong>

                        <br />

                        <small>
                          {registro.producto?.nombre ??
                            ""}
                        </small>
                      </td>

                      <td style={celdaNumero}>
                        <strong>
                          {registro.numero_paradas ??
                            0}
                        </strong>
                      </td>

                      <td style={celdaNumero}>
                        {registro.tamano_parada ??
                          registro.producto
                            ?.tamano_lote ??
                          0}
                      </td>

                      <td style={celdaNumero}>
                        <strong>
                          {registro.cantidad}
                        </strong>
                      </td>
                    </tr>
                  ),
                )}

                <tr style={filaTotal}>
                  <td style={celda}>
                    <strong>TOTAL</strong>
                  </td>

                  <td style={celdaNumero}>
                    <strong>
                      {totalParadas}
                    </strong>
                  </td>

                  <td style={celda}></td>

                  <td style={celdaNumero}>
                    <strong>
                      {totalUnidades}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

const pagina = {
  padding: "30px",
  maxWidth: "1300px",
  margin: "0 auto",
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

const panel = {
  marginBottom: "22px",
  padding: "22px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "white",
}

const controles = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  gap: "16px",
}

const tituloPanel = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  marginBottom: "18px",
}

const descripcion = {
  margin: "6px 0 0",
  color: "#6b7280",
  fontSize: "13px",
}

const label = {
  display: "block",
  marginBottom: "7px",
  fontWeight: "bold",
}

const campo = {
  minHeight: "42px",
  padding: "9px 11px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  background: "white",
}

const botonPrincipal = {
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

const contador = {
  minWidth: "36px",
  padding: "7px 11px",
  borderRadius: "999px",
  background: "#8f1d24",
  color: "white",
  textAlign: "center" as const,
  fontWeight: "bold",
}

const mensajeError = {
  marginBottom: "20px",
  padding: "14px 16px",
  borderLeft: "5px solid #b91c1c",
  borderRadius: "8px",
  background: "#fee2e2",
  color: "#991b1b",
}

const estadoVacio = {
  padding: "30px",
  border: "1px dashed #cfd4da",
  borderRadius: "9px",
  color: "#6b7280",
  textAlign: "center" as const,
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
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #edf0f2",
  verticalAlign: "middle" as const,
}

const celdaNumero = {
  ...celda,
  textAlign: "right" as const,
}

const filaTotal = {
  background: "#f7f8fa",
}