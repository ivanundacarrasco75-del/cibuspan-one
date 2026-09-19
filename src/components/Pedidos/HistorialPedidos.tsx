type ProductoPedido = {
  codigo: string
  corto: string
  cantidadManejo: number
  totalUnidades: number
}

type PedidoGuardado = {
  id: string
  fechaEntrega: string
  cliente: string
  bodega: string
  tipoEmpaque: string
  productos: ProductoPedido[]
  totalUnidades: number
  estado: string
}

export default function HistorialPedidos() {
  const pedidos: PedidoGuardado[] = JSON.parse(
    localStorage.getItem("cibuspan-pedidos") ?? "[]",
  )

  return (
    <section style={{ marginTop: "35px" }}>
      <h2>Pedidos guardados</h2>

      {pedidos.length === 0 ? (
        <p>No existen pedidos registrados.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "white",
            }}
          >
            <thead>
              <tr>
                <th style={encabezado}>Pedido</th>
                <th style={encabezado}>Cliente</th>
                <th style={encabezado}>Bodega</th>
                <th style={encabezado}>Entrega</th>
                <th style={encabezado}>SKU</th>
                <th style={encabezado}>Unidades</th>
                <th style={encabezado}>Estado</th>
              </tr>
            </thead>

            <tbody>
              {[...pedidos].reverse().map((pedido) => (
                <tr key={pedido.id}>
                  <td style={celda}>{pedido.id}</td>
                  <td style={celda}>{pedido.cliente}</td>
                  <td style={celda}>{pedido.bodega}</td>
                  <td style={celda}>{pedido.fechaEntrega}</td>
                  <td style={celda}>{pedido.productos.length}</td>
                  <td style={celda}>{pedido.totalUnidades}</td>
                  <td style={celda}>{pedido.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
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