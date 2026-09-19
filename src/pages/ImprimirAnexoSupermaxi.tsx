import { useEffect, useMemo } from "react"
import { obtenerPedidos } from "../services/pedidoService"
import { skus } from "../data/skus"

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
  cliente?: string
  bodega?: string
  fechaDespacho: string
  detalles: DetalleDespacho[]
}

function formatearFecha(fecha: string) {
  if (!fecha) return ""

  const [anio, mes, dia] = fecha
    .slice(0, 10)
    .split("-")

  return `${dia}/${mes}/${anio}`
}

export default function ImprimirAnexoSupermaxi() {
  const parametros = new URLSearchParams(
    window.location.search,
  )

  const despachoId =
    parametros.get("despachoId") ?? ""

  const proveedor =
    parametros.get("proveedor") ?? "12211"

  const ruc =
    parametros.get("ruc") ?? "1792759277001"

  const pedidos = obtenerPedidos()

  const despachos: Despacho[] = JSON.parse(
    localStorage.getItem(
      "cibuspan-despachos",
    ) ?? "[]",
  )

  const despacho = useMemo(() => {
    const encontrado = despachos.find(
      (item) => item.id === despachoId,
    )

    if (!encontrado) return undefined

    const pedidoRelacionado = pedidos.find(
      (pedido) =>
        pedido.id === encontrado.pedidoId,
    )

    return {
      ...encontrado,
      cliente:
        encontrado.cliente ??
        pedidoRelacionado?.cliente ??
        "",
      bodega:
        encontrado.bodega ??
        pedidoRelacionado?.bodega ??
        "",
    }
  }, [despachoId, despachos, pedidos])

  useEffect(() => {
    if (!despacho) return

    const temporizador = window.setTimeout(
      () => {
        window.print()
      },
      400,
    )

    return () =>
      window.clearTimeout(temporizador)
  }, [despacho])

  if (!despacho) {
    return (
      <main style={errorPagina}>
        <h1>No se encontró el despacho</h1>

        <p>
          Verifica que el documento se haya
          abierto desde Anexo Supermaxi.
        </p>
      </main>
    )
  }

  return (
    <main style={documento}>
      <section style={datosCabecera}>
        <p>
          <strong>Fecha:</strong>{" "}
          {formatearFecha(
            despacho.fechaDespacho,
          )}
        </p>

        <p>
          <strong>Proveedor:</strong>{" "}
          {proveedor}
        </p>

        <p>
          <strong>RUC:</strong> {ruc}
        </p>
      </section>

      <p style={textoLegal}>
        De conformidad con la legislación
        vigente, el presente anexo contiene el
        detalle del lote de la mercadería que
        se entrega con la fecha de elaboración
        y caducidad de la misma:
      </p>

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
          {despacho.detalles.map(
            (detalle, indice) => {
              const producto = skus.find(
                (item) =>
                  item.codigo ===
                  detalle.codigo,
              )

              return (
                <tr
                  key={`${detalle.codigo}-${detalle.lote}-${indice}`}
                >
                  <td style={celda}>
                    {detalle.codigo}
                  </td>

                  <td style={celda}>
                    {producto?.nombre ??
                      detalle.corto ??
                      ""}
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
              )
            },
          )}
        </tbody>
      </table>

      <section style={aviso}>
        <p>
          Aviso: los productos y cantidades
          detalladas en este anexo pueden
          diferir de las cantidades y productos
          recibidos por Corporación Favorita
          C.A. detallados en el Acta de entrega
          - recepción. El único propósito del
          presente documento es el señalamiento
          del lote, fecha de elaboración y
          caducidad de los productos.
        </p>

        <p>
          Para observar la cantidad real
          recibida Corporación Favorita C.A.
          deberá observarse el acta de entrega
          recepción a la que se adjunta el
          presente anexo.
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

      <style>
        {`
          html,
          body,
          #root {
            margin: 0;
            padding: 0;
            background: white;
          }

          @page {
            size: A4 portrait;
            margin: 14mm;
          }

          @media print {
            html,
            body,
            #root {
              width: 100%;
              background: white !important;
            }
          }
        `}
      </style>
    </main>
  )
}

const documento = {
  width: "100%",
  maxWidth: "190mm",
  margin: "0 auto",
  padding: "14mm",
  boxSizing: "border-box" as const,
  background: "white",
  color: "#111111",
  fontFamily:
    "Arial, Helvetica, sans-serif",
  fontSize: "11px",
}

const datosCabecera = {
  marginBottom: "22px",
  lineHeight: 1.45,
}

const textoLegal = {
  maxWidth: "170mm",
  marginBottom: "18px",
  lineHeight: 1.45,
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: "10px",
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

const errorPagina = {
  padding: "40px",
  fontFamily:
    "Arial, Helvetica, sans-serif",
}