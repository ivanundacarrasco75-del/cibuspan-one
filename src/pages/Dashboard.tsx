import { useMemo } from "react"
import { obtenerPedidos } from "../services/pedidoService"
import { skus } from "../data/skus"

type RegistroInventario = {
  id: string
  codigo: string
  lote: string
  fechaProduccion: string
  fechaVencimiento: string
  cantidad: number
}

type ProgramaProduccion = {
  id: string
  fechaProduccion: string
  fechaProduccionReal?: string
  totalProgramado: number
  totalUnidadesProgramadas: number
  estado: string
}

type DetalleDespacho = {
  codigo: string
  corto?: string
  unidades: number
}

type Despacho = {
  id: string
  pedidoId: string
  cliente?: string
  fechaDespacho: string
  detalles: DetalleDespacho[]
}

type Devolucion = {
  id: string
  unidades: number
  motivo: string
  fechaRegistro: string
}

function fechaLocal() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function inicioMesActual() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")

  return `${anio}-${mes}-01`
}

function diasHasta(fecha: string) {
  const hoy = new Date(`${fechaLocal()}T12:00:00`)
  const destino = new Date(`${fecha}T12:00:00`)

  return Math.ceil(
    (destino.getTime() - hoy.getTime()) /
      (1000 * 60 * 60 * 24),
  )
}

export default function Dashboard() {
  const pedidos = obtenerPedidos()

  const inventario: RegistroInventario[] = JSON.parse(
    localStorage.getItem("cibuspan-inventario") ?? "[]",
  )

  const programas: ProgramaProduccion[] = JSON.parse(
    localStorage.getItem(
      "cibuspan-programas-produccion",
    ) ?? "[]",
  )

  const despachos: Despacho[] = JSON.parse(
    localStorage.getItem("cibuspan-despachos") ?? "[]",
  )

  const devoluciones: Devolucion[] = JSON.parse(
    localStorage.getItem("cibuspan-devoluciones") ?? "[]",
  )

  const hoy = fechaLocal()
  const inicioMes = inicioMesActual()

  const programaHoy = programas
    .filter(
      (programa) =>
        programa.fechaProduccion === hoy ||
        programa.fechaProduccionReal === hoy,
    )
    .at(-1)

  const lotesProgramadosHoy =
    programaHoy?.totalProgramado ?? 0

  const unidadesProgramadasHoy =
    programaHoy?.totalUnidadesProgramadas ?? 0

  const programasPendientes = programas.filter(
    (programa) => programa.estado === "PROGRAMADO",
  ).length

  const pedidosIngresados = pedidos.filter(
    (pedido) => pedido.estado === "INGRESADO",
  ).length

  const pedidosListos = pedidos.filter(
    (pedido) =>
      pedido.estado === "LISTO PARA DESPACHO",
  ).length

  const pedidosEnProduccion = pedidos.filter(
    (pedido) =>
      pedido.estado === "PLANIFICADO" ||
      pedido.estado === "EN PRODUCCION",
  ).length

  const despachosHoy = despachos.filter(
    (despacho) =>
      despacho.fechaDespacho.slice(0, 10) === hoy,
  )

  const unidadesDespachadasHoy =
    despachosHoy.reduce(
      (total, despacho) =>
        total +
        despacho.detalles.reduce(
          (subtotal, detalle) =>
            subtotal + detalle.unidades,
          0,
        ),
      0,
    )

  const totalInventario = inventario.reduce(
    (total, registro) =>
      total + registro.cantidad,
    0,
  )

  const totalLotes = inventario.length

  const productosConStock = new Set(
    inventario
      .filter((registro) => registro.cantidad > 0)
      .map((registro) => registro.codigo),
  )

  const productosSinStock = skus.filter(
    (producto) =>
      !productosConStock.has(producto.codigo),
  ).length

  const lotesProximosVencer = inventario.filter(
    (registro) => {
      const dias = diasHasta(
        registro.fechaVencimiento,
      )

      return dias >= 0 && dias <= 7
    },
  )

  const pedidosSinReserva = pedidos.filter(
    (pedido) =>
      pedido.estado !== "DESPACHADO" &&
      pedido.estado !== "CANCELADO" &&
      pedido.estado !== "LISTO PARA DESPACHO",
  ).length

  const devolucionesMes = devoluciones.filter(
    (devolucion) =>
      devolucion.fechaRegistro.slice(0, 10) >=
      inicioMes,
  )

  const unidadesDevueltasMes =
    devolucionesMes.reduce(
      (total, devolucion) =>
        total + devolucion.unidades,
      0,
    )

  const despachosMes = despachos.filter(
    (despacho) =>
      despacho.fechaDespacho.slice(0, 10) >=
      inicioMes,
  )

  const unidadesDespachadasMes =
    despachosMes.reduce(
      (total, despacho) =>
        total +
        despacho.detalles.reduce(
          (subtotal, detalle) =>
            subtotal + detalle.unidades,
          0,
        ),
      0,
    )

  const porcentajeDevolucion =
    unidadesDespachadasMes > 0
      ? (
          (unidadesDevueltasMes /
            unidadesDespachadasMes) *
          100
        ).toFixed(1)
      : "0.0"

  const principalMotivo = useMemo(() => {
    if (devolucionesMes.length === 0) {
      return "Sin devoluciones"
    }

    const motivos: Record<string, number> = {}

    devolucionesMes.forEach((devolucion) => {
      motivos[devolucion.motivo] =
        (motivos[devolucion.motivo] ?? 0) +
        devolucion.unidades
    })

    return Object.entries(motivos).sort(
      (a, b) => b[1] - a[1],
    )[0][0]
  }, [devolucionesMes])

  const alertas: {
    nivel: "ROJO" | "AMARILLO" | "VERDE"
    texto: string
  }[] = []

  if (lotesProgramadosHoy > 25) {
    alertas.push({
      nivel: "ROJO",
      texto: `La producción supera la capacidad en ${
        lotesProgramadosHoy - 25
      } lotes.`,
    })
  }

  if (productosSinStock > 0) {
    alertas.push({
      nivel: "ROJO",
      texto: `${productosSinStock} SKU no tienen inventario disponible.`,
    })
  }

  if (pedidosSinReserva > 0) {
    alertas.push({
      nivel: "AMARILLO",
      texto: `${pedidosSinReserva} pedidos todavía no tienen reserva de inventario.`,
    })
  }

  if (lotesProximosVencer.length > 0) {
    alertas.push({
      nivel: "AMARILLO",
      texto: `${lotesProximosVencer.length} lotes vencen en los próximos 7 días.`,
    })
  }

  if (programasPendientes > 0) {
    alertas.push({
      nivel: "AMARILLO",
      texto: `${programasPendientes} programas de producción están pendientes de ejecución.`,
    })
  }

  if (alertas.length === 0) {
    alertas.push({
      nivel: "VERDE",
      texto: "No existen alertas operativas.",
    })
  }

  const tieneAlertaRoja = alertas.some(
    (alerta) => alerta.nivel === "ROJO",
  )

  const tieneAlertaAmarilla = alertas.some(
    (alerta) => alerta.nivel === "AMARILLO",
  )

  const estadoGeneral = tieneAlertaRoja
    ? "ACCIÓN INMEDIATA"
    : tieneAlertaAmarilla
      ? "ATENCIÓN REQUERIDA"
      : "OPERACIÓN NORMAL"

  const colorEstado = tieneAlertaRoja
    ? "#b91c1c"
    : tieneAlertaAmarilla
      ? "#d97706"
      : "#15803d"

  return (
    <div style={pagina}>
      <section
        style={{
          ...estadoOperacion,
          borderLeft: `8px solid ${colorEstado}`,
        }}
      >
        <div>
          <span style={etiquetaSuperior}>
            ESTADO GENERAL
          </span>

          <h1
            style={{
              margin: "6px 0 0",
              color: colorEstado,
            }}
          >
            {estadoGeneral}
          </h1>
        </div>

        <div
          style={{
            ...semaforo,
            background: colorEstado,
          }}
        />
      </section>

      <h2>Producción de hoy</h2>

      <section style={rejillaTarjetas}>
        <Tarjeta
          titulo="Lotes programados"
          valor={`${lotesProgramadosHoy} / 25`}
          detalle={`${Math.max(
            0,
            25 - lotesProgramadosHoy,
          )} lotes disponibles`}
        />

        <Tarjeta
          titulo="Unidades programadas"
          valor={unidadesProgramadasHoy}
          detalle="Producción planificada"
        />

        <Tarjeta
          titulo="Programas pendientes"
          valor={programasPendientes}
          detalle="Pendientes de ejecución"
        />
      </section>

      <h2>Pedidos y despachos</h2>

      <section style={rejillaTarjetas}>
        <Tarjeta
          titulo="Pedidos ingresados"
          valor={pedidosIngresados}
          detalle="Pendientes de planificación"
        />

        <Tarjeta
          titulo="En producción"
          valor={pedidosEnProduccion}
          detalle="Pedidos en proceso"
        />

        <Tarjeta
          titulo="Listos para despacho"
          valor={pedidosListos}
          detalle="Con inventario reservado"
        />

        <Tarjeta
          titulo="Despachos de hoy"
          valor={despachosHoy.length}
          detalle={`${unidadesDespachadasHoy} unidades`}
        />
      </section>

      <h2>Inventario</h2>

      <section style={rejillaTarjetas}>
        <Tarjeta
          titulo="Unidades en stock"
          valor={totalInventario}
          detalle="Inventario físico"
        />

        <Tarjeta
          titulo="Lotes activos"
          valor={totalLotes}
          detalle="Registros por lote"
        />

        <Tarjeta
          titulo="SKU sin stock"
          valor={productosSinStock}
          detalle="Requieren revisión"
        />

        <Tarjeta
          titulo="Próximos a vencer"
          valor={lotesProximosVencer.length}
          detalle="En los próximos 7 días"
        />
      </section>

      <h2>Devoluciones del mes</h2>

      <section style={rejillaTarjetas}>
        <Tarjeta
          titulo="Unidades devueltas"
          valor={unidadesDevueltasMes}
          detalle="Mes actual"
        />

        <Tarjeta
          titulo="Porcentaje devolución"
          valor={`${porcentajeDevolucion}%`}
          detalle="Sobre unidades despachadas"
        />

        <Tarjeta
          titulo="Principal motivo"
          valor={principalMotivo}
          detalle="Mayor cantidad devuelta"
          textoReducido
        />
      </section>

      <section style={panelAlertas}>
        <h2 style={{ marginTop: 0 }}>Alertas operativas</h2>

        <div style={listaAlertas}>
          {alertas.map((alerta, indice) => (
            <div
              key={`${alerta.texto}-${indice}`}
              style={{
                ...alertaFila,
                borderLeft: `5px solid ${colorAlerta(
                  alerta.nivel,
                )}`,
              }}
            >
              <span
                style={{
                  ...puntoAlerta,
                  background: colorAlerta(
                    alerta.nivel,
                  ),
                }}
              />

              <span>{alerta.texto}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

type TarjetaProps = {
  titulo: string
  valor: string | number
  detalle: string
  textoReducido?: boolean
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  textoReducido = false,
}: TarjetaProps) {
  return (
    <article style={tarjeta}>
      <span style={tituloTarjeta}>{titulo}</span>

      <strong
        style={{
          ...valorTarjeta,
          fontSize: textoReducido ? "22px" : "32px",
        }}
      >
        {valor}
      </strong>

      <span style={detalleTarjeta}>{detalle}</span>
    </article>
  )
}

function colorAlerta(
  nivel: "ROJO" | "AMARILLO" | "VERDE",
) {
  if (nivel === "ROJO") return "#b91c1c"
  if (nivel === "AMARILLO") return "#d97706"

  return "#15803d"
}

const pagina = {
  padding: "30px",
  maxWidth: "1500px",
  margin: "0 auto",
}

const estadoOperacion = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  padding: "22px",
  marginBottom: "30px",
  border: "1px solid #dddddd",
  borderRadius: "14px",
  background: "white",
  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.06)",
}

const etiquetaSuperior = {
  color: "#6b7280",
  fontSize: "13px",
  letterSpacing: "1px",
}

const semaforo = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  boxShadow: "0 0 0 8px rgba(0, 0, 0, 0.05)",
}

const rejillaTarjetas = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "18px",
  marginBottom: "32px",
}

const tarjeta = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px",
  minHeight: "145px",
  padding: "20px",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  background: "white",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.05)",
}

const tituloTarjeta = {
  color: "#6b7280",
  fontSize: "14px",
}

const valorTarjeta = {
  color: "#8f1d24",
  lineHeight: 1.1,
}

const detalleTarjeta = {
  color: "#6b7280",
  fontSize: "13px",
}

const panelAlertas = {
  padding: "22px",
  border: "1px solid #dddddd",
  borderRadius: "14px",
  background: "white",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.05)",
}

const listaAlertas = {
  display: "grid",
  gap: "12px",
}

const alertaFila = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "14px",
  borderRadius: "8px",
  background: "#f9fafb",
}

const puntoAlerta = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  flexShrink: 0,
}