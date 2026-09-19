import { useMemo, useState } from "react"
import { skus } from "../data/skus"
import { obtenerPedidos } from "../services/pedidoService"
import {
  stockComprometidoPorSku,
  stockDisponiblePorSku,
  stockFisicoPorSku,
} from "../services/inventarioService"
type ProductoPedido = {
  codigo: string
  totalUnidades: number
}

type Pedido = {
  id: string
  fechaEntrega: string
  productos: ProductoPedido[]
}

function fechaManana() {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + 1)

  return fecha.toISOString().slice(0, 10)
}

export default function Produccion() {
  const [fechaEntrega, setFechaEntrega] = useState(fechaManana())

  const [adicionales, setAdicionales] = useState<
    Record<string, number>
  >({})

  const pedidos: Pedido[] = obtenerPedidos()

  const planProduccion = useMemo(() => {
    const pedidosFecha = pedidos.filter(
      (pedido) => pedido.fechaEntrega === fechaEntrega,
    )

    return skus.map((producto) => {
      const demanda = pedidosFecha.reduce(
        (totalPedido, pedido) => {
          const unidadesSku = pedido.productos
            .filter(
              (detalle) =>
                detalle.codigo === producto.codigo,
            )
            .reduce(
              (total, detalle) =>
                total + detalle.totalUnidades,
              0,
            )

          return totalPedido + unidadesSku
        },
        0,
      )

      const stockFisico = stockFisicoPorSku(producto.codigo)

      const stockComprometido =
        stockComprometidoPorSku(
          producto.codigo,
          fechaEntrega,
        )

      const stockDisponible =
        stockDisponiblePorSku(
          producto.codigo,
          fechaEntrega,
        )

      const faltantePedidos = Math.max(
        0,
        demanda - stockDisponible,
      )

      const necesidadRecomendada = Math.max(
        0,
        demanda +
          producto.stockSeguridad -
          stockDisponible,
      )

      const lotesMinimos = Math.ceil(
        faltantePedidos / producto.lote,
      )

      const lotesRecomendados = Math.ceil(
        necesidadRecomendada / producto.lote,
      )

      const lotesAdicionales =
        adicionales[producto.codigo] ?? 0

      const lotesProgramados =
        lotesRecomendados + lotesAdicionales

      const unidadesProgramadas =
        lotesProgramados * producto.lote

      const stockProyectado =
        stockDisponible +
        unidadesProgramadas -
        demanda

      return {
        ...producto,
        demanda,
        stockFisico,
        stockComprometido,
        stockDisponible,
        faltantePedidos,
        lotesMinimos,
        lotesRecomendados,
        lotesAdicionales,
        lotesProgramados,
        unidadesProgramadas,
        stockProyectado,
      }
    })
  }, [fechaEntrega, pedidos, adicionales])

  const totalRecomendado = planProduccion.reduce(
    (total, producto) =>
      total + producto.lotesRecomendados,
    0,
  )

  const totalAdicional = planProduccion.reduce(
    (total, producto) =>
      total + producto.lotesAdicionales,
    0,
  )

  const totalProgramado =
    totalRecomendado + totalAdicional

  const totalUnidadesProgramadas = planProduccion.reduce(
    (total, producto) =>
      total + producto.unidadesProgramadas,
    0,
  )

  function cambiarAdicional(
    codigo: string,
    diferencia: number,
  ) {
    setAdicionales((actuales) => {
      const actual = actuales[codigo] ?? 0

      return {
        ...actuales,
        [codigo]: Math.max(0, actual + diferencia),
      }
    })
  }

  function guardarPrograma() {
    const productosProgramados = planProduccion.filter(
      (producto) => producto.lotesProgramados > 0,
    )

    if (productosProgramados.length === 0) {
      alert("No existen lotes programados.")
      return
    }

    const programa = {
      id: `PROD-${Date.now()}`,
      fechaProduccion: new Date()
        .toISOString()
        .slice(0, 10),
      fechaEntrega,
      totalRecomendado,
      totalAdicional,
      totalProgramado,
      totalUnidadesProgramadas,
      productos: productosProgramados,
      estado: "PROGRAMADO",
    }

    const programas = JSON.parse(
      localStorage.getItem(
        "cibuspan-programas-produccion",
      ) ?? "[]",
    )

    localStorage.setItem(
      "cibuspan-programas-produccion",
      JSON.stringify([...programas, programa]),
    )

    alert("Programa de producción guardado.")
  }

  return (
    <div style={{ padding: "30px", maxWidth: "1500px" }}>
      <h1>Producción de hoy</h1>

      <div style={{ marginBottom: "25px" }}>
        <label>Fecha de entrega de los pedidos</label>

        <input
          type="date"
          value={fechaEntrega}
          onChange={(evento) =>
            setFechaEntrega(evento.target.value)
          }
          style={{
            display: "block",
            padding: "10px",
            marginTop: "6px",
          }}
        />
      </div>

      <section style={resumen}>
        <div style={tarjeta}>
          <span>Recomendados</span>
          <strong>{totalRecomendado} lotes</strong>
        </div>

        <div style={tarjeta}>
          <span>Adicionales</span>
          <strong>{totalAdicional} lotes</strong>
        </div>

        <div style={tarjeta}>
          <span>Programados</span>
          <strong>{totalProgramado} / 25 lotes</strong>
        </div>

        <div style={tarjeta}>
          <span>Capacidad disponible</span>
          <strong>
            {Math.max(0, 25 - totalProgramado)} lotes
          </strong>
        </div>

        <div style={tarjeta}>
          <span>Unidades programadas</span>
          <strong>{totalUnidadesProgramadas}</strong>
        </div>
      </section>

      {totalProgramado > 25 && (
        <p style={{ color: "#b00020", fontWeight: "bold" }}>
          Capacidad excedida en {totalProgramado - 25} lotes.
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={encabezado}>SKU</th>
              <th style={encabezado}>Demanda</th>
              <th style={encabezado}>Stock físico</th>
              <th style={encabezado}>Comprometido</th>
              <th style={encabezado}>Disponible</th>
              <th style={encabezado}>Stock seguridad</th>
              <th style={encabezado}>Tamaño lote</th>
              <th style={encabezado}>Mínimo</th>
              <th style={encabezado}>Recomendado</th>
              <th style={encabezado}>Adicional</th>
              <th style={encabezado}>Programado</th>
              <th style={encabezado}>Unidades</th>
              <th style={encabezado}>Stock proyectado</th>
            </tr>
          </thead>

          <tbody>
            {planProduccion.map((producto) => (
              <tr key={producto.codigo}>
                <td style={celda}>
                  <strong>{producto.corto}</strong>
                  <br />
                  <small>{producto.codigo}</small>
                </td>

                <td style={celda}>{producto.demanda}</td>
                <td style={celda}>{producto.stockFisico}</td>
                <td style={celda}>
                  {producto.stockComprometido}
                </td>
                <td style={celda}>
                  <strong>{producto.stockDisponible}</strong>
                </td>
                <td style={celda}>
                  {producto.stockSeguridad}
                </td>
                <td style={celda}>{producto.lote}</td>
                <td style={celda}>{producto.lotesMinimos}</td>
                <td style={celda}>
                  {producto.lotesRecomendados}
                </td>

                <td style={celda}>
                  <div style={controlCantidad}>
                    <button
                      type="button"
                      onClick={() =>
                        cambiarAdicional(
                          producto.codigo,
                          -1,
                        )
                      }
                      style={botonCantidad}
                    >
                      −
                    </button>

                    <strong>
                      {producto.lotesAdicionales}
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        cambiarAdicional(
                          producto.codigo,
                          1,
                        )
                      }
                      style={botonCantidad}
                    >
                      +
                    </button>
                  </div>
                </td>

                <td style={celda}>
                  <strong>
                    {producto.lotesProgramados}
                  </strong>
                </td>

                <td style={celda}>
                  {producto.unidadesProgramadas}
                </td>

                <td style={celda}>
                  <strong>
                    {producto.stockProyectado}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={guardarPrograma}
        disabled={totalProgramado > 25}
        style={{
          marginTop: "22px",
          padding: "12px 22px",
          border: "none",
          borderRadius: "8px",
          background:
            totalProgramado > 25 ? "#aaaaaa" : "#8f1d24",
          color: "white",
          fontWeight: "bold",
          cursor:
            totalProgramado > 25
              ? "not-allowed"
              : "pointer",
        }}
      >
        Guardar programa de producción
      </button>
    </div>
  )
}

const resumen = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "15px",
  marginBottom: "25px",
}

const tarjeta = {
  padding: "16px",
  background: "#f4f4f4",
  borderRadius: "10px",
  display: "flex",
  flexDirection: "column" as const,
  gap: "6px",
}

const controlCantidad = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
}

const botonCantidad = {
  width: "32px",
  height: "32px",
  border: "1px solid #cccccc",
  borderRadius: "6px",
  background: "white",
  cursor: "pointer",
  fontSize: "18px",
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