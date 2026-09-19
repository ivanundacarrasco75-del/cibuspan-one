import { useEffect, useMemo, useState } from "react"
import {
  obtenerAnexosSuperDb,
  type AnexoSuperDb,
} from "../repositories/despachoRepository"

function formatearFecha(fecha: string) {
  if (!fecha) return ""

  const [anio, mes, dia] = fecha
    .slice(0, 10)
    .split("-")

  return `${dia}/${mes}/${anio}`
}

function escaparHtml(valor: string | number) {
  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export default function AnexoSupermaxi() {
  const [anexos, setAnexos] = useState<
    AnexoSuperDb[]
  >([])

  const [anexoId, setAnexoId] = useState("")
  const [proveedor, setProveedor] =
    useState("12211")
  const [ruc, setRuc] =
    useState("1792759277001")

  const [fechaEntrega, setFechaEntrega] =
    useState("")

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    cargarAnexos()
  }, [])

  async function cargarAnexos() {
    setCargando(true)
    setError("")

    try {
      const datos = await obtenerAnexosSuperDb()
      setAnexos(datos)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los anexos.",
      )
    } finally {
      setCargando(false)
    }
  }

  const anexoSeleccionado = useMemo(
    () =>
      anexos.find(
        (anexo) =>
          anexo.reserva_id === anexoId,
      ),
    [anexos, anexoId],
  )

  function imprimirAnexo() {
    if (!anexoSeleccionado) return

    if (!fechaEntrega) {
      setError(
        "Selecciona la fecha de entrega.",
      )
      return
    }

    const filas = anexoSeleccionado.detalles
      .map(
        (detalle) => `
          <tr>
            <td>${escaparHtml(detalle.codigo)}</td>
            <td>${escaparHtml(
              detalle.nombre || detalle.corto,
            )}</td>
            <td>${escaparHtml(detalle.lote)}</td>
            <td>${escaparHtml(
              formatearFecha(
                detalle.fechaProduccion,
              ),
            )}</td>
            <td>${escaparHtml(
              formatearFecha(
                detalle.fechaVencimiento,
              ),
            )}</td>
            <td class="numero">${escaparHtml(
              detalle.unidades,
            )}</td>
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
        "El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio.",
      )
      return
    }

    const html = `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          />
          <title>
            Anexo Supermaxi ${escaparHtml(
              anexoSeleccionado.pedido_id,
            )}
          </title>

          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              background: white;
              color: #111;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 11px;
            }

            .anexo {
              width: 100%;
            }

            h1 {
              margin: 0 0 14px;
              text-align: center;
              font-size: 18px;
            }

            .datos {
              margin-bottom: 18px;
              line-height: 1.5;
            }

            .datos p {
              margin: 2px 0;
            }

            .texto-legal {
              max-width: 100%;
              margin: 0 0 16px;
              line-height: 1.45;
              text-align: justify;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              font-size: 10px;
            }

            th,
            td {
              padding: 5px;
              border: 1px solid #333;
              vertical-align: middle;
              word-break: break-word;
            }

            th {
              text-align: center;
              font-weight: normal;
            }

            .numero {
              text-align: right;
            }

            .aviso {
              margin-top: 16px;
              line-height: 1.45;
              text-align: justify;
            }

            .firmas {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 65px;
              margin-top: 70px;
              padding: 0 50px;
            }

            .firma {
              padding-top: 8px;
              border-top: 1px solid #222;
              text-align: center;
              font-size: 10px;
            }

            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>

        <body>
          <main class="anexo">
            <h1>Anexo Supermaxi</h1>

            <section class="datos">
              <p>
                <strong>Fecha:</strong>
                ${escaparHtml(
                  formatearFecha(
                    fechaEntrega,
                  ),
                )}
              </p>

              <p>
                <strong>Proveedor:</strong>
                ${escaparHtml(proveedor)}
              </p>
              <p>
                <strong>RUC:</strong>
                ${escaparHtml(ruc)}
              </p>

              <p>
                <strong>Pedido:</strong>
                ${escaparHtml(
                  anexoSeleccionado.pedido_id,
                )}
              </p>

              <p>
                <strong>Bodega:</strong>
                ${escaparHtml(
                  anexoSeleccionado.bodega,
                )}
              </p>
            </section>

            <p class="texto-legal">
              De conformidad con la legislación vigente,
              el presente anexo contiene el detalle del lote
              de la mercadería que se entrega con la fecha
              de elaboración y caducidad de la misma:
            </p>

            <table>
              <thead>
                <tr>
                  <th style="width: 16%">
                    Código de barras
                  </th>

                  <th style="width: 28%">
                    Descripción - tamaño
                  </th>

                  <th style="width: 11%">
                    Lote
                  </th>

                  <th style="width: 16%">
                    Fecha de elaboración
                  </th>

                  <th style="width: 16%">
                    Fecha de caducidad
                  </th>

                  <th style="width: 13%">
                    Unidades
                  </th>
                </tr>
              </thead>

              <tbody>
                ${filas}
              </tbody>
            </table>

            <section class="aviso">
              <p>
                Aviso: los productos y cantidades detalladas
                en este anexo pueden diferir de las cantidades
                y productos recibidos por Corporación Favorita
                C.A. detallados en el Acta de entrega -
                recepción.
              </p>

              <p>
                El único propósito del presente documento es
                señalar el lote, fecha de elaboración y
                caducidad de los productos.
              </p>
            </section>

            <section class="firmas">
              <div class="firma">
                CORPORACIÓN FAVORITA C.A.
              </div>

              <div class="firma">
                CIBUSPAN CÍA. LTDA.
              </div>
            </section>
          </main>

          <script>
            window.addEventListener("load", function () {
              setTimeout(function () {
                window.print()
              }, 250)
            })

            window.addEventListener(
              "afterprint",
              function () {
                window.close()
              },
            )
          </script>
        </body>
      </html>
    `

    ventana.document.open()
    ventana.document.write(html)
    ventana.document.close()
  }

  return (
    <div style={pagina}>
      <section style={controles}>
        <div style={cabeceraControles}>
          <h1 style={{ margin: 0 }}>
            Anexo Supermaxi
          </h1>

          <button
            type="button"
            onClick={cargarAnexos}
            disabled={cargando}
            style={botonSecundario}
          >
            {cargando
              ? "Actualizando..."
              : "Actualizar"}
          </button>
        </div>

        {error && (
          <div style={mensajeError}>
            {error}
          </div>
        )}

        <div style={formulario}>
          <div>
            <label>Despacho</label>

            <select
              value={anexoId}
              onChange={(evento) => {
                const id = evento.target.value

                setAnexoId(id)

                const anexo = anexos.find(
                  (item) =>
                    item.reserva_id === id,
                )

                setFechaEntrega(
                  anexo?.fecha_despacho
                    ?.slice(0, 10) ?? "",
                )
              }}
              style={campo}
            >
              <option value="">
                Seleccione...
              </option>

              {anexos.map((anexo) => (
                <option
                  key={anexo.reserva_id}
                  value={anexo.reserva_id}
                >
                  {anexo.pedido_id} ·{" "}
                  {anexo.bodega} ·{" "}
                  {formatearFecha(
                    anexo.fecha_despacho,
                  )}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Proveedor</label>

            <input
              value={proveedor}
              onChange={(evento) =>
                setProveedor(
                  evento.target.value,
                )
              }
              style={campo}
            />
          </div>

          <div>
            <label>RUC</label>

            <input
              value={ruc}
              onChange={(evento) =>
                setRuc(evento.target.value)
              }
              style={campo}
            />
          </div>

          <div>
            <label>Fecha de entrega</label>

            <input
              type="date"
              value={fechaEntrega}
              onChange={(evento) =>
                setFechaEntrega(
                  evento.target.value,
                )
              }
              style={campo}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={imprimirAnexo}
          disabled={
            !anexoSeleccionado ||
            !fechaEntrega
          }
          style={{
            ...boton,
            opacity:
              anexoSeleccionado &&
              fechaEntrega
                ? 1
                : 0.5,
            cursor:
              anexoSeleccionado &&
              fechaEntrega
                ? "pointer"
                : "not-allowed",
          }}
        >
          Imprimir / Guardar como PDF
        </button>
      </section>

      {!anexoSeleccionado ? (
        <p>
          Selecciona un despacho de Corporación
          Favorita.
        </p>
      ) : (
        <section style={vistaPrevia}>
          <h2 style={{ textAlign: "center" }}>
            Anexo Supermaxi
          </h2>

          <div style={datosCabecera}>
            <p>
              <strong>Fecha:</strong>{" "}
              {formatearFecha(
                fechaEntrega,
              )}
            </p>

            <p>
              <strong>Proveedor:</strong>{" "}
              {proveedor}
            </p>

            <p>
              <strong>RUC:</strong> {ruc}
            </p>

            <p>
              <strong>Pedido:</strong>{" "}
              {anexoSeleccionado.pedido_id}
            </p>
            <p>
              <strong>Bodega:</strong>{" "}
              {anexoSeleccionado.bodega}
            </p>
          </div>

          <p style={textoLegal}>
            De conformidad con la legislación
            vigente, el presente anexo contiene el
            detalle del lote de la mercadería que se
            entrega con la fecha de elaboración y
            caducidad de la misma:
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Código de barras
                  </th>

                  <th style={encabezado}>
                    Descripción - tamaño
                  </th>

                  <th style={encabezado}>
                    Lote
                  </th>

                  <th style={encabezado}>
                    Fecha de elaboración
                  </th>

                  <th style={encabezado}>
                    Fecha de caducidad
                  </th>

                  <th style={encabezado}>
                    Unidades
                  </th>
                </tr>
              </thead>

              <tbody>
                {anexoSeleccionado.detalles.map(
                  (detalle, indice) => (
                    <tr
                      key={`${detalle.codigo}-${detalle.lote}-${indice}`}
                    >
                      <td style={celda}>
                        {detalle.codigo}
                      </td>

                      <td style={celda}>
                        {detalle.nombre ||
                          detalle.corto}
                      </td>

                      <td style={celda}>
                        {detalle.lote}
                      </td>

                      <td style={celda}>
                        {formatearFecha(
                          detalle.fechaProduccion,
                        )}
                      </td>

                      <td style={celda}>
                        {formatearFecha(
                          detalle.fechaVencimiento,
                        )}
                      </td>

                      <td style={celdaNumero}>
                        {detalle.unidades}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <section style={aviso}>
            <p>
              Aviso: los productos y cantidades
              detalladas en este anexo pueden diferir
              de las cantidades y productos recibidos
              por Corporación Favorita C.A.
            </p>

            <p>
              El único propósito del presente
              documento es señalar el lote, fecha de
              elaboración y caducidad de los
              productos.
            </p>
          </section>

          <section style={firmas}>
            <div style={firma}>
              CORPORACIÓN FAVORITA C.A.
            </div>

            <div style={firma}>
              CIBUSPAN CÍA. LTDA.
            </div>
          </section>
        </section>
      )}
    </div>
  )
}

const pagina = {
  padding: "30px",
  maxWidth: "1200px",
  margin: "0 auto",
}

const controles = {
  marginBottom: "24px",
  padding: "22px",
  border: "1px solid #dddddd",
  borderRadius: "12px",
  background: "white",
}

const cabeceraControles = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  marginBottom: "18px",
}

const formulario = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
  marginBottom: "18px",
}

const campo = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px",
  marginTop: "6px",
}

const boton = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
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

const mensajeError = {
  marginBottom: "18px",
  padding: "12px 14px",
  borderLeft: "5px solid #b91c1c",
  borderRadius: "8px",
  background: "#fee2e2",
  color: "#991b1b",
}

const vistaPrevia = {
  padding: "22px",
  border: "1px solid #dddddd",
  borderRadius: "12px",
  background: "white",
  color: "#111111",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "12px",
}

const datosCabecera = {
  marginBottom: "22px",
  lineHeight: 1.45,
}

const textoLegal = {
  maxWidth: "760px",
  marginBottom: "18px",
  lineHeight: 1.45,
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: "11px",
}

const encabezado = {
  padding: "6px",
  border: "1px solid #333333",
  textAlign: "center" as const,
  fontWeight: "normal",
}

const celda = {
  padding: "4px 6px",
  border: "1px solid #333333",
  verticalAlign: "middle" as const,
}

const celdaNumero = {
  ...celda,
  textAlign: "right" as const,
}

const aviso = {
  marginTop: "18px",
  lineHeight: 1.45,
}

const firmas = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "65px",
  marginTop: "70px",
  padding: "0 70px",
}

const firma = {
  paddingTop: "8px",
  borderTop: "1px solid #222222",
  textAlign: "center" as const,
  fontSize: "10px",
}