import { useEffect, useMemo, useState } from "react"
import {
  obtenerDetallePedidoDb,
  obtenerPedidosDb,
  type DetallePedidoConsultaDb,
  type PedidoListadoDb,
} from "../repositories/pedidoRepository"

type SeleccionPedidos = Record<string, boolean>

type PedidoConDetalle = {
  pedido: PedidoListadoDb
  detalles: DetallePedidoConsultaDb[]
}

export default function HojaDespacho() {
  const [pedidos, setPedidos] = useState<
    PedidoListadoDb[]
  >([])

  const [seleccionados, setSeleccionados] =
    useState<SeleccionPedidos>({})

  const [detalles, setDetalles] = useState<
    PedidoConDetalle[]
  >([])

  const [cargando, setCargando] =
    useState(true)

  const [generando, setGenerando] =
    useState(false)

  const [error, setError] =
    useState("")

  useEffect(() => {
    cargarPedidos()
  }, [])

  async function cargarPedidos() {
    setCargando(true)
    setError("")

    try {
      const datos = await obtenerPedidosDb()

      setPedidos(
        datos.filter(
          (pedido) =>
            pedido.estado === "DESPACHADO",
        ),
      )
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

  const pedidosSeleccionados = useMemo(
    () =>
      pedidos.filter(
        (pedido) =>
          seleccionados[pedido.id],
      ),
    [pedidos, seleccionados],
  )

  async function prepararHoja() {
    if (
      pedidosSeleccionados.length === 0
    ) {
      setError(
        "Selecciona al menos un pedido.",
      )
      return
    }

    setGenerando(true)
    setError("")

    try {
      const resultado =
        await Promise.all(
          pedidosSeleccionados.map(
            async (pedido) => ({
              pedido,
              detalles:
                await obtenerDetallePedidoDb(
                  pedido.id,
                ),
            }),
          ),
        )

      setDetalles(resultado)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo preparar la hoja.",
      )
    } finally {
      setGenerando(false)
    }
  }

  const skus = useMemo(() => {
    const mapa = new Map<
      string,
      {
        productoId: string
        corto: string
      }
    >()

    detalles.forEach(({ detalles }) => {
      detalles.forEach((detalle) => {
        mapa.set(detalle.producto_id, {
          productoId:
            detalle.producto_id,
          corto:
            detalle.producto?.corto ??
            "",
        })
      })
    })

    return [...mapa.values()].sort(
      (a, b) =>
        a.corto.localeCompare(b.corto),
    )
  }, [detalles])

  function cantidadPedidoSku(
    pedido: PedidoConDetalle,
    productoId: string,
  ) {
    return pedido.detalles
      .filter(
        (detalle) =>
          detalle.producto_id ===
          productoId,
      )
      .reduce(
        (total, detalle) =>
          total + detalle.total_unidades,
        0,
      )
  }

  function totalSku(productoId: string) {
    return detalles.reduce(
      (total, pedido) =>
        total +
        cantidadPedidoSku(
          pedido,
          productoId,
        ),
      0,
    )
  }

  function imprimir() {
    const encabezados = skus
      .map(
        (sku) =>
          `<th>${sku.corto}</th>`,
      )
      .join("")

    const filas = detalles
      .map((item) => {
        const celdas = skus
          .map(
            (sku) =>
              `<td class="numero">${cantidadPedidoSku(
                item,
                sku.productoId,
              )}</td>`,
          )
          .join("")

        const totalCliente =
          item.detalles.reduce(
            (total, detalle) =>
              total +
              detalle.total_unidades,
            0,
          )

        return `
          <tr>
            <td>${item.pedido.cliente?.nombre ?? ""}</td>
            <td>${item.pedido.bodega?.nombre ?? ""}</td>
            ${celdas}
            <td class="numero">${totalCliente}</td>
          </tr>
        `
      })
      .join("")

    const totales = skus
      .map(
        (sku) =>
          `<td class="numero"><strong>${totalSku(
            sku.productoId,
          )}</strong></td>`,
      )
      .join("")

    const totalGeneral = detalles.reduce(
      (total, pedido) =>
        total +
        pedido.detalles.reduce(
          (subtotal, detalle) =>
            subtotal +
            detalle.total_unidades,
          0,
        ),
      0,
    )

    const ventana = window.open(
      "",
      "_blank",
      "width=1200,height=900",
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
          <title>Hoja de despacho</title>

          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
            }

            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #111;
              font-size: 10px;
            }

            h1 {
              text-align: center;
              margin-bottom: 18px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            th,
            td {
              border: 1px solid #333;
              padding: 6px;
            }

            th {
              background: #f3f4f6;
            }

            .numero {
              text-align: right;
            }

            .total {
              background: #f7f8fa;
            }
          </style>
        </head>

        <body>
          <h1>HOJA DE DESPACHO POR RUTA</h1>

          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Bodega</th>
                ${encabezados}
                <th>Total cliente</th>
              </tr>
            </thead>

            <tbody>
              ${filas}

              <tr class="total">
                <td colspan="2">
                  <strong>TOTAL RUTA</strong>
                </td>

                ${totales}

                <td class="numero">
                  <strong>${totalGeneral}</strong>
                </td>
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
            DOCUMENTO DE RUTA
          </span>

          <h1 style={titulo}>
            Hoja de despacho
          </h1>

          <p style={subtitulo}>
            Selecciona los pedidos despachados
            que el transportista cargará en la ruta.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarPedidos}
          style={botonSecundario}
        >
          Actualizar
        </button>
      </header>

      {error && (
        <div style={mensajeError}>
          {error}
        </div>
      )}

      <section style={panel}>
        {cargando ? (
          <p>Cargando pedidos...</p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>
                      Incluir
                    </th>

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
                      Fecha
                    </th>

                    <th style={encabezado}>
                      Estado
                    </th>

                    <th style={encabezado}>
                      Unidades
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {pedidos.map((pedido) => (
                    <tr key={pedido.id}>
                      <td style={celda}>
                        <input
                          type="checkbox"
                          checked={Boolean(
                            seleccionados[
                              pedido.id
                            ],
                          )}
                          onChange={(evento) =>
                            setSeleccionados(
                              (actuales) => ({
                                ...actuales,
                                [pedido.id]:
                                  evento.target
                                    .checked,
                              }),
                            )
                          }
                        />
                      </td>

                      <td style={celda}>
                        <strong>
                          {
                            pedido.numero_pedido_cliente
                          }
                        </strong>
                      </td>

                      <td style={celda}>
                        {
                          pedido.cliente
                            ?.nombre
                        }
                      </td>

                      <td style={celda}>
                        {
                          pedido.bodega
                            ?.nombre
                        }
                      </td>

                      <td style={celda}>
                        {pedido.fecha_entrega}
                      </td>

                      <td style={celda}>
                        {pedido.estado}
                      </td>

                      <td style={celdaNumero}>
                        {
                          pedido.total_unidades
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={acciones}>
              <button
                type="button"
                onClick={prepararHoja}
                disabled={
                  generando ||
                  pedidosSeleccionados.length === 0
                }
                style={botonPrincipal}
              >
                {generando
                  ? "Preparando..."
                  : "Preparar hoja"}
              </button>
            </div>
          </>
        )}
      </section>

      {detalles.length > 0 && (
        <section style={panel}>
          <div style={tituloPanel}>
            <h2 style={{ margin: 0 }}>
              Consolidado de ruta
            </h2>

            <button
              type="button"
              onClick={imprimir}
              style={botonPrincipal}
            >
              Imprimir / Guardar PDF
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Cliente
                  </th>

                  <th style={encabezado}>
                    Bodega
                  </th>

                  {skus.map((sku) => (
                    <th
                      key={sku.productoId}
                      style={encabezado}
                    >
                      {sku.corto}
                    </th>
                  ))}

                  <th style={encabezado}>
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {detalles.map((item) => (
                  <tr key={item.pedido.id}>
                    <td style={celda}>
                      {
                        item.pedido.cliente
                          ?.nombre
                      }
                    </td>

                    <td style={celda}>
                      {
                        item.pedido.bodega
                          ?.nombre
                      }
                    </td>

                    {skus.map((sku) => (
                      <td
                        key={sku.productoId}
                        style={celdaNumero}
                      >
                        {cantidadPedidoSku(
                          item,
                          sku.productoId,
                        )}
                      </td>
                    ))}

                    <td style={celdaNumero}>
                      <strong>
                        {item.detalles.reduce(
                          (total, detalle) =>
                            total +
                            detalle.total_unidades,
                          0,
                        )}
                      </strong>
                    </td>
                  </tr>
                ))}

                <tr>
                  <td
                    colSpan={2}
                    style={celda}
                  >
                    <strong>
                      TOTAL RUTA
                    </strong>
                  </td>

                  {skus.map((sku) => (
                    <td
                      key={sku.productoId}
                      style={celdaNumero}
                    >
                      <strong>
                        {totalSku(
                          sku.productoId,
                        )}
                      </strong>
                    </td>
                  ))}

                  <td style={celdaNumero}>
                    <strong>
                      {detalles.reduce(
                        (total, pedido) =>
                          total +
                          pedido.detalles.reduce(
                            (
                              subtotal,
                              detalle,
                            ) =>
                              subtotal +
                              detalle.total_unidades,
                            0,
                          ),
                        0,
                      )}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}

const pagina = {
  padding: "30px",
  maxWidth: "1600px",
  margin: "0 auto",
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

const tituloPanel = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "18px",
}

const acciones = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "18px",
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

const mensajeError = {
  marginBottom: "20px",
  padding: "14px 16px",
  borderLeft: "5px solid #b91c1c",
  borderRadius: "8px",
  background: "#fee2e2",
  color: "#991b1b",
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
  whiteSpace: "nowrap" as const,
}

const celdaNumero = {
  ...celda,
  textAlign: "right" as const,
}