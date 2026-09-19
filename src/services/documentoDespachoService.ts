import type { Pedido } from "./pedidoService"
import type { ReservaInventario } from "./reservaInventarioService"
import { skus } from "../data/skus"

function escapar(texto: string) {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function imprimirListaDespacho(
  pedido: Pedido,
  reserva: ReservaInventario,
) {
  const filas = reserva.detalles
    .map((detalle) => {
      const producto = skus.find(
        (item) => item.codigo === detalle.codigo,
      )

      return `
        <tr>
          <td>${escapar(producto?.corto ?? "")}</td>
          <td>${escapar(detalle.codigo)}</td>
          <td>${escapar(producto?.nombre ?? "")}</td>
          <td>${escapar(detalle.fechaProduccion)}</td>
          <td>${escapar(detalle.fechaVencimiento)}</td>
          <td>${escapar(detalle.lote)}</td>
          <td class="numero">${detalle.unidades}</td>
        </tr>
      `
    })
    .join("")

  const totalUnidades = reserva.detalles.reduce(
    (total, detalle) => total + detalle.unidades,
    0,
  )

  const ventana = window.open("", "_blank")

  if (!ventana) {
    throw new Error(
      "El navegador bloqueó la ventana de impresión.",
    )
  }

  ventana.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Lista de despacho ${escapar(pedido.id)}</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 30px;
            color: #222;
          }

          h1 {
            margin-bottom: 4px;
            color: #8f1d24;
          }

          h2 {
            margin-top: 0;
            font-size: 16px;
            font-weight: normal;
          }

          .datos {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 30px;
            margin: 24px 0;
          }

          .datos p {
            margin: 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          th,
          td {
            border: 1px solid #999;
            padding: 8px;
            text-align: left;
          }

          th {
            background: #eeeeee;
          }

          .numero {
            text-align: right;
          }

          .totales {
            margin-top: 18px;
            font-size: 15px;
          }

          .firmas {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 60px;
            margin-top: 70px;
          }

          .firma {
            border-top: 1px solid #333;
            padding-top: 8px;
            text-align: center;
          }

          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <h1>CIBUSPAN ONE</h1>
        <h2>Lista de despacho</h2>

        <div class="datos">
          <p><strong>Pedido:</strong> ${escapar(pedido.id)}</p>
          <p><strong>Fecha de entrega:</strong> ${escapar(pedido.fechaEntrega)}</p>

          <p><strong>Cliente:</strong> ${escapar(pedido.cliente)}</p>
          <p><strong>Bodega:</strong> ${escapar(pedido.bodega)}</p>

          <p><strong>Empaque:</strong> ${escapar(pedido.tipoEmpaque)}</p>
          <p><strong>Prioridad:</strong> ${escapar(pedido.prioridad)}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Código</th>
              <th>Producto</th>
              <th>Fecha producción</th>
              <th>Fecha vencimiento</th>
              <th>Lote</th>
              <th>Unidades</th>
            </tr>
          </thead>

          <tbody>
            ${filas}
          </tbody>
        </table>

        <p class="totales">
          <strong>Total de unidades: ${totalUnidades}</strong>
        </p>

        <div class="firmas">
          <div class="firma">Preparado por</div>
          <div class="firma">Revisado por</div>
        </div>

        <button onclick="window.print()">
          Imprimir / Guardar como PDF
        </button>
      </body>
    </html>
  `)

  ventana.document.close()
}