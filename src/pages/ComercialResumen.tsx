import { useEffect, useMemo, useState } from "react"

import { supabase } from "../lib/supabase"
import {
  obtenerDetallePedidoDb,
  obtenerPedidosDb,
  type DetallePedidoConsultaDb,
  type PedidoListadoDb,
} from "../repositories/pedidoRepository"
import {
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
} from "../repositories/devolucionRepository"

type ComercialResumenProps = {
  cambiarPantalla: (pantalla: string) => void
}

type PedidoConDetalle = {
  pedido: PedidoListadoDb
  detalles: DetallePedidoConsultaDb[]
}

type PrecioClienteProducto = {
  cliente_id: string
  producto_id: string
  precio: number | null
}

type Movimiento = {
  id: string
  nombre: string
  secundario?: string
  actual: number
  anterior: number
}

type ResumenSemana = {
  pedidosCerrados: number
  unidadesSolicitadas: number
  unidadesDespachadas: number
  fillRate: number
  unidadesDevueltas: number
  tasaDevolucion: number
  ventas: number
  lineasSinPrecio: number
}

const VINO = "#8F1D24"
const NARANJA = "#F7931E"
const VERDE = "#15803d"
const ROJO = "#b42318"

function fechaIsoLocal(fecha: Date) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function sumarDias(fechaIso: string, dias: number) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIsoLocal(fecha)
}

function inicioSemana(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  const dia = fecha.getDay()
  fecha.setDate(fecha.getDate() - (dia === 0 ? 6 : dia - 1))
  return fechaIsoLocal(fecha)
}

function fechaCorta(fechaIso: string) {
  const [, mes, dia] = fechaIso.split("-")
  return `${dia}/${mes}`
}

function numero(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    maximumFractionDigits: 0,
  }).format(Number(valor || 0))
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor || 0))
}

function variacionPorcentual(actual: number, anterior: number) {
  if (anterior === 0) return actual === 0 ? 0 : null
  return ((actual - anterior) / anterior) * 100
}

function diferenciaPuntos(actual: number, anterior: number) {
  return actual - anterior
}

function textoVariacion(actual: number, anterior: number) {
  const variacion = variacionPorcentual(actual, anterior)
  if (variacion === null) return actual > 0 ? "NUEVO" : "0%"
  const flecha = variacion > 0 ? "↑" : variacion < 0 ? "↓" : "→"
  return `${flecha} ${Math.abs(variacion).toFixed(1)}%`
}

function claseVariacion(
  actual: number,
  anterior: number,
  mejorCuandoSube: boolean,
) {
  if (actual === anterior) return "neutral"
  const mejora = actual > anterior ? mejorCuandoSube : !mejorCuandoSube
  return mejora ? "positive" : "negative"
}

export default function ComercialResumen({
  cambiarPantalla,
}: ComercialResumenProps) {
  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionListadoDb[]>([])
  const [precios, setPrecios] = useState<PrecioClienteProducto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  const hoy = fechaIsoLocal(new Date())
  const semanaActual = inicioSemana(hoy)
  const semanaAnterior = sumarDias(semanaActual, -7)
  const finSemanaActual = sumarDias(semanaActual, 6)
  const finSemanaAnterior = sumarDias(semanaAnterior, 6)

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")

    try {
      const [pedidosDb, devolucionesDb, preciosRes] = await Promise.all([
        obtenerPedidosDb(),
        obtenerDevolucionesDb(),
        supabase
          .from("cliente_productos")
          .select("cliente_id, producto_id, precio")
          .eq("activo", true),
      ])

      const pedidosDosSemanas = pedidosDb.filter(
        (pedido) =>
          pedido.fecha_entrega >= semanaAnterior &&
          pedido.fecha_entrega <= finSemanaActual,
      )

      const pedidosConDetalle = await Promise.all(
        pedidosDosSemanas.map(async (pedido) => ({
          pedido,
          detalles: await obtenerDetallePedidoDb(pedido.id),
        })),
      )

      setPedidos(pedidosConDetalle)
      setDevoluciones(devolucionesDb)

      if (preciosRes.error) {
        setPrecios([])
      } else {
        setPrecios((preciosRes.data ?? []) as PrecioClienteProducto[])
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el resumen comercial.",
      )
    } finally {
      setCargando(false)
    }
  }

  const preciosMapa = useMemo(
    () =>
      new Map(
        precios.map((precio) => [
          `${precio.cliente_id}|${precio.producto_id}`,
          precio.precio === null ? null : Number(precio.precio),
        ]),
      ),
    [precios],
  )

  function calcularSemana(semana: string): ResumenSemana {
    const finSemana = sumarDias(semana, 6)
    const pedidosCerrados = pedidos.filter(
      ({ pedido }) =>
        pedido.estado === "DESPACHADO" &&
        pedido.fecha_entrega >= semana &&
        pedido.fecha_entrega <= finSemana,
    )

    let unidadesSolicitadas = 0
    let unidadesDespachadas = 0
    let ventas = 0
    let lineasSinPrecio = 0

    pedidosCerrados.forEach(({ pedido, detalles }) => {
      detalles.forEach((detalle) => {
        const solicitadas = Number(detalle.total_unidades ?? 0)
        const despachadas = Number(detalle.unidades_despachadas ?? 0)
        unidadesSolicitadas += solicitadas
        unidadesDespachadas += despachadas

        if (!pedido.cliente?.id || despachadas <= 0) return

        const precio = preciosMapa.get(
          `${pedido.cliente.id}|${detalle.producto_id}`,
        )

        if (precio === undefined || precio === null) {
          lineasSinPrecio += 1
          return
        }

        ventas += despachadas * precio
      })
    })

    const unidadesDevueltas = devoluciones.reduce((total, devolucion) => {
      return (
        total +
        (devolucion.detalles ?? []).reduce((subtotal, detalle) => {
          return detalle.semana_origen_inicio === semana
            ? subtotal + Number(detalle.unidades ?? 0)
            : subtotal
        }, 0)
      )
    }, 0)

    const fillRate =
      unidadesSolicitadas > 0
        ? (unidadesDespachadas / unidadesSolicitadas) * 100
        : 0

    const tasaDevolucion =
      unidadesDespachadas > 0
        ? (unidadesDevueltas / unidadesDespachadas) * 100
        : 0

    return {
      pedidosCerrados: pedidosCerrados.length,
      unidadesSolicitadas,
      unidadesDespachadas,
      fillRate,
      unidadesDevueltas,
      tasaDevolucion,
      ventas,
      lineasSinPrecio,
    }
  }

  const actual = useMemo(
    () => calcularSemana(semanaActual),
    [pedidos, devoluciones, preciosMapa, semanaActual],
  )

  const anterior = useMemo(
    () => calcularSemana(semanaAnterior),
    [pedidos, devoluciones, preciosMapa, semanaAnterior],
  )

  const movimientosClientes = useMemo<Movimiento[]>(() => {
    const mapa = new Map<string, Movimiento>()

    pedidos.forEach(({ pedido, detalles }) => {
      if (pedido.estado !== "DESPACHADO" || !pedido.cliente?.id) return
      if (
        pedido.fecha_entrega < semanaAnterior ||
        pedido.fecha_entrega > finSemanaActual
      ) {
        return
      }

      let unidades = 0
      detalles.forEach((detalle) => {
        unidades += Number(detalle.unidades_despachadas ?? 0)
      })

      const registro = mapa.get(pedido.cliente.id) ?? {
        id: pedido.cliente.id,
        nombre: pedido.cliente.nombre,
        actual: 0,
        anterior: 0,
      }

      if (pedido.fecha_entrega >= semanaActual) registro.actual += unidades
      else registro.anterior += unidades

      mapa.set(pedido.cliente.id, registro)
    })

    return Array.from(mapa.values())
  }, [pedidos, semanaActual, semanaAnterior, finSemanaActual])

  const movimientosSku = useMemo<Movimiento[]>(() => {
    const mapa = new Map<string, Movimiento>()

    pedidos.forEach(({ pedido, detalles }) => {
      if (pedido.estado !== "DESPACHADO") return
      if (
        pedido.fecha_entrega < semanaAnterior ||
        pedido.fecha_entrega > finSemanaActual
      ) {
        return
      }

      detalles.forEach((detalle) => {
        if (!detalle.producto) return

        const registro = mapa.get(detalle.producto_id) ?? {
          id: detalle.producto_id,
          nombre: detalle.producto.corto,
          secundario: detalle.producto.codigo,
          actual: 0,
          anterior: 0,
        }

        const unidades = Number(detalle.unidades_despachadas ?? 0)
        if (pedido.fecha_entrega >= semanaActual) registro.actual += unidades
        else registro.anterior += unidades

        mapa.set(detalle.producto_id, registro)
      })
    })

    return Array.from(mapa.values())
  }, [pedidos, semanaActual, semanaAnterior, finSemanaActual])

  function extremos(movimientos: Movimiento[]) {
    const ordenados = [...movimientos].sort(
      (a, b) =>
        b.actual - b.anterior - (a.actual - a.anterior),
    )

    return {
      sube: ordenados.find((item) => item.actual - item.anterior > 0) ?? null,
      baja:
        [...ordenados]
          .reverse()
          .find((item) => item.actual - item.anterior < 0) ?? null,
    }
  }

  const clientes = useMemo(
    () => extremos(movimientosClientes),
    [movimientosClientes],
  )
  const skus = useMemo(() => extremos(movimientosSku), [movimientosSku])

  const alertas = useMemo(() => {
    const resultado: {
      titulo: string
      detalle: string
      tipo: "ALERTA" | "ATENCION" | "INFO"
      destino: string
    }[] = []

    if (actual.tasaDevolucion > 8) {
      resultado.push({
        titulo: "Devoluciones sobre la meta",
        detalle: `${actual.tasaDevolucion.toFixed(1)}% frente a la meta ≤ 8%.`,
        tipo: "ALERTA",
        destino: "Comercial · Devoluciones",
      })
    }

    if (actual.fillRate < anterior.fillRate && anterior.unidadesSolicitadas > 0) {
      resultado.push({
        titulo: "Fill Rate disminuyó",
        detalle: `${Math.abs(
          diferenciaPuntos(actual.fillRate, anterior.fillRate),
        ).toFixed(1)} puntos menos que la semana anterior.`,
        tipo: "ATENCION",
        destino: "Comercial · Análisis",
      })
    }

    if (actual.lineasSinPrecio > 0) {
      resultado.push({
        titulo: "Venta con información incompleta",
        detalle: `${actual.lineasSinPrecio} línea${
          actual.lineasSinPrecio === 1 ? "" : "s"
        } despachada${actual.lineasSinPrecio === 1 ? "" : "s"} sin precio configurado.`,
        tipo: "ATENCION",
        destino: "Comercial · Ventas",
      })
    }

    if (clientes.baja) {
      resultado.push({
        titulo: "Cliente con mayor caída",
        detalle: `${clientes.baja.nombre}: ${numero(
          Math.abs(clientes.baja.actual - clientes.baja.anterior),
        )} unidades menos.`,
        tipo: "INFO",
        destino: "Comercial · Clientes",
      })
    }

    if (skus.baja) {
      resultado.push({
        titulo: "SKU con mayor caída",
        detalle: `${skus.baja.nombre}: ${numero(
          Math.abs(skus.baja.actual - skus.baja.anterior),
        )} unidades menos.`,
        tipo: "INFO",
        destino: "Comercial · SKU",
      })
    }

    return resultado.slice(0, 5)
  }, [actual, anterior, clientes.baja, skus.baja])

  const semanaTexto = `Semana ${fechaCorta(semanaActual)}–${fechaCorta(
    finSemanaActual,
  )} vs. ${fechaCorta(semanaAnterior)}–${fechaCorta(finSemanaAnterior)}`

  return (
    <main className="commercial-summary-page">
      <style>{css}</style>

      <header className="commercial-summary-header">
        <div>
          <span>COMERCIAL · CENTRO DE CONTROL</span>
          <h1>Resumen comercial</h1>
          <p>{semanaTexto}</p>
        </div>

        <button type="button" onClick={cargarDatos} disabled={cargando}>
          {cargando ? "Actualizando…" : "Actualizar datos"}
        </button>
      </header>

      {error && <div className="commercial-error">{error}</div>}

      <section className="commercial-kpi-grid">
        <Kpi
          titulo="Venta despachada"
          valor={moneda(actual.ventas)}
          detalle={`Anterior ${moneda(anterior.ventas)}`}
          variacion={textoVariacion(actual.ventas, anterior.ventas)}
          estado={claseVariacion(actual.ventas, anterior.ventas, true)}
          onClick={() => cambiarPantalla("Comercial · Ventas")}
        />

        <Kpi
          titulo="Unidades despachadas"
          valor={`${numero(actual.unidadesDespachadas)} Unid.`}
          detalle={`Anterior ${numero(anterior.unidadesDespachadas)} Unid.`}
          variacion={textoVariacion(
            actual.unidadesDespachadas,
            anterior.unidadesDespachadas,
          )}
          estado={claseVariacion(
            actual.unidadesDespachadas,
            anterior.unidadesDespachadas,
            true,
          )}
          onClick={() => cambiarPantalla("Comercial · Análisis")}
        />

        <Kpi
          titulo="Fill Rate"
          valor={`${actual.fillRate.toFixed(1)}%`}
          detalle={`${numero(actual.unidadesDespachadas)} / ${numero(
            actual.unidadesSolicitadas,
          )} unidades cerradas`}
          variacion={`${diferenciaPuntos(
            actual.fillRate,
            anterior.fillRate,
          ) >= 0 ? "↑" : "↓"} ${Math.abs(
            diferenciaPuntos(actual.fillRate, anterior.fillRate),
          ).toFixed(1)} pts`}
          estado={claseVariacion(actual.fillRate, anterior.fillRate, true)}
          onClick={() => cambiarPantalla("Comercial · Análisis")}
        />

        <Kpi
          titulo="Devoluciones"
          valor={`${actual.tasaDevolucion.toFixed(1)}%`}
          detalle={`${numero(actual.unidadesDevueltas)} Unid. · meta ≤ 8%`}
          variacion={`${diferenciaPuntos(
            actual.tasaDevolucion,
            anterior.tasaDevolucion,
          ) > 0 ? "↑" : diferenciaPuntos(
            actual.tasaDevolucion,
            anterior.tasaDevolucion,
          ) < 0 ? "↓" : "→"} ${Math.abs(
            diferenciaPuntos(actual.tasaDevolucion, anterior.tasaDevolucion),
          ).toFixed(1)} pts`}
          estado={claseVariacion(
            actual.tasaDevolucion,
            anterior.tasaDevolucion,
            false,
          )}
          onClick={() => cambiarPantalla("Comercial · Devoluciones")}
        />
      </section>

      <div className="commercial-note">
        <strong>Venta despachada:</strong> se calcula con unidades realmente
        despachadas × precio vigente configurado por cliente. Las líneas sin
        precio no se inventan y se muestran como alerta.
      </div>

      <section className="commercial-movement-grid">
        <MovimientoCard
          titulo="Cliente que más crece"
          movimiento={clientes.sube}
          positivo
          onClick={() => cambiarPantalla("Comercial · Clientes")}
        />
        <MovimientoCard
          titulo="Cliente con mayor caída"
          movimiento={clientes.baja}
          onClick={() => cambiarPantalla("Comercial · Clientes")}
        />
        <MovimientoCard
          titulo="SKU que más crece"
          movimiento={skus.sube}
          positivo
          onClick={() => cambiarPantalla("Comercial · SKU")}
        />
        <MovimientoCard
          titulo="SKU con mayor caída"
          movimiento={skus.baja}
          onClick={() => cambiarPantalla("Comercial · SKU")}
        />
      </section>

      <section className="commercial-lower-grid">
        <article className="commercial-panel">
          <div className="commercial-panel-head">
            <div>
              <span>CONTROL</span>
              <h2>Alertas comerciales</h2>
            </div>
            <small>{alertas.length} activas</small>
          </div>

          {cargando ? (
            <div className="commercial-empty">Actualizando información…</div>
          ) : alertas.length === 0 ? (
            <div className="commercial-good">
              <strong>Sin alertas relevantes</strong>
              <span>Los indicadores conectados no requieren atención inmediata.</span>
            </div>
          ) : (
            <div className="commercial-alert-list">
              {alertas.map((alerta) => (
                <button
                  key={`${alerta.titulo}-${alerta.detalle}`}
                  type="button"
                  className={`commercial-alert ${alerta.tipo.toLowerCase()}`}
                  onClick={() => cambiarPantalla(alerta.destino)}
                >
                  <span>{alerta.tipo}</span>
                  <div>
                    <strong>{alerta.titulo}</strong>
                    <small>{alerta.detalle}</small>
                  </div>
                  <b>›</b>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="commercial-panel">
          <div className="commercial-panel-head">
            <div>
              <span>SEMANA ACTUAL</span>
              <h2>Operación cerrada</h2>
            </div>
          </div>

          <div className="commercial-operation-list">
            <FilaOperacion
              etiqueta="Pedidos despachados"
              valor={numero(actual.pedidosCerrados)}
            />
            <FilaOperacion
              etiqueta="Unidades solicitadas"
              valor={`${numero(actual.unidadesSolicitadas)} Unid.`}
            />
            <FilaOperacion
              etiqueta="Unidades despachadas"
              valor={`${numero(actual.unidadesDespachadas)} Unid.`}
            />
            <FilaOperacion
              etiqueta="Unidades devueltas atribuidas"
              valor={`${numero(actual.unidadesDevueltas)} Unid.`}
            />
          </div>

          <button
            type="button"
            className="commercial-detail-button"
            onClick={() => cambiarPantalla("Comercial · Análisis")}
          >
            Ver análisis completo →
          </button>
        </article>
      </section>
    </main>
  )
}

function Kpi({
  titulo,
  valor,
  detalle,
  variacion,
  estado,
  onClick,
}: {
  titulo: string
  valor: string
  detalle: string
  variacion: string
  estado: "positive" | "negative" | "neutral"
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`commercial-kpi ${estado}`}
      onClick={onClick}
    >
      <div>
        <span>{titulo}</span>
        <b className={`commercial-trend ${estado}`}>{variacion}</b>
      </div>
      <strong>{valor}</strong>
      <small>{detalle}</small>
      <em>Ver detalle →</em>
    </button>
  )
}

function MovimientoCard({
  titulo,
  movimiento,
  positivo = false,
  onClick,
}: {
  titulo: string
  movimiento: Movimiento | null
  positivo?: boolean
  onClick: () => void
}) {
  const diferencia = movimiento
    ? movimiento.actual - movimiento.anterior
    : 0

  return (
    <button
      type="button"
      className={`commercial-movement-card ${positivo ? "up" : "down"}`}
      onClick={onClick}
    >
      <span>{titulo}</span>
      <strong>{movimiento?.nombre ?? "Sin variación"}</strong>
      {movimiento?.secundario && <small>{movimiento.secundario}</small>}
      <div>
        <b>
          {movimiento
            ? `${diferencia > 0 ? "+" : "−"}${numero(Math.abs(diferencia))} Unid.`
            : "—"}
        </b>
        <em>
          {movimiento
            ? `${numero(movimiento.anterior)} → ${numero(movimiento.actual)}`
            : "Sin movimiento comparable"}
        </em>
      </div>
    </button>
  )
}

function FilaOperacion({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <span>{etiqueta}</span>
      <strong>{valor}</strong>
    </div>
  )
}

const css = `
  .commercial-summary-page {
    max-width: 1540px;
    margin: 0 auto;
    padding: 26px 28px 42px;
    color: #2d2522;
    font-variant-numeric: tabular-nums;
  }

  .commercial-summary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 19px;
  }

  .commercial-summary-header > div > span,
  .commercial-panel-head > div > span {
    color: ${NARANJA};
    font-size: 10px;
    font-weight: 950;
    letter-spacing: 1.2px;
  }

  .commercial-summary-header h1 {
    margin: 4px 0 4px;
    color: ${VINO};
    font-size: clamp(28px, 3vw, 38px);
    letter-spacing: -.65px;
  }

  .commercial-summary-header p {
    margin: 0;
    color: #7e716c;
    font-size: 12px;
  }

  .commercial-summary-header button {
    min-height: 42px;
    padding: 0 17px;
    border: 1px solid #ded2cc;
    border-radius: 8px;
    background: #fff;
    color: ${VINO};
    font-weight: 850;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(71,39,30,.06);
  }

  .commercial-summary-header button:disabled {
    opacity: .6;
    cursor: wait;
  }

  .commercial-error {
    margin-bottom: 15px;
    padding: 12px 14px;
    border-left: 4px solid ${ROJO};
    border-radius: 6px;
    background: #fff0f0;
    color: #a62525;
    font-size: 12px;
  }

  .commercial-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 11px;
    margin-bottom: 11px;
  }

  .commercial-kpi {
    min-width: 0;
    min-height: 142px;
    padding: 16px 17px 13px;
    border: 1px solid #e7ddd8;
    border-top: 3px solid #a99a93;
    border-radius: 10px;
    background: linear-gradient(145deg,#fff,#fbf8f6);
    color: inherit;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 5px 17px rgba(55,36,30,.05);
    transition: transform .14s ease, box-shadow .14s ease;
  }

  .commercial-kpi:hover,
  .commercial-movement-card:hover,
  .commercial-alert:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 22px rgba(55,36,30,.09);
  }

  .commercial-kpi.positive { border-top-color: ${VERDE}; }
  .commercial-kpi.negative { border-top-color: #d33d3d; }

  .commercial-kpi > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .commercial-kpi span {
    color: #746863;
    font-size: 9px;
    font-weight: 950;
    letter-spacing: .45px;
    text-transform: uppercase;
  }

  .commercial-kpi > strong {
    display: block;
    margin: 10px 0 4px;
    color: #211c1a;
    font-size: clamp(24px, 2.2vw, 31px);
    line-height: 1;
  }

  .commercial-kpi > small {
    display: block;
    color: #92857f;
    font-size: 9px;
  }

  .commercial-kpi > em {
    display: block;
    margin-top: 11px;
    color: ${VINO};
    font-size: 9px;
    font-style: normal;
    font-weight: 850;
  }

  .commercial-trend {
    flex: 0 0 auto;
    padding: 3px 6px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 950;
  }

  .commercial-trend.positive { background: #e8f7ed; color: #087b35; }
  .commercial-trend.negative { background: #fff0f0; color: #c72e2e; }
  .commercial-trend.neutral { background: #f1efee; color: #746b67; }

  .commercial-note {
    margin-bottom: 18px;
    padding: 9px 12px;
    border: 1px solid #eadfd9;
    border-radius: 7px;
    background: #fffaf6;
    color: #7c706b;
    font-size: 9px;
    line-height: 1.45;
  }

  .commercial-note strong { color: #563536; }

  .commercial-movement-grid {
    display: grid;
    grid-template-columns: repeat(4,minmax(0,1fr));
    gap: 10px;
    margin-bottom: 22px;
  }

  .commercial-movement-card {
    min-width: 0;
    padding: 14px 15px;
    border: 1px solid #e8dfda;
    border-left: 4px solid #aa9b95;
    border-radius: 9px;
    background: #fff;
    color: inherit;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(61,40,33,.04);
    transition: transform .14s ease, box-shadow .14s ease;
  }

  .commercial-movement-card.up { border-left-color: ${VERDE}; }
  .commercial-movement-card.down { border-left-color: #d33d3d; }
  .commercial-movement-card > span { color: #81736d; font-size: 8px; font-weight: 950; text-transform: uppercase; letter-spacing: .55px; }
  .commercial-movement-card > strong { display: block; margin-top: 5px; color: #503032; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .commercial-movement-card > small { display: block; margin-top: 1px; color: ${NARANJA}; font-size: 8px; font-weight: 850; }
  .commercial-movement-card > div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 11px; }
  .commercial-movement-card b { color: #302725; font-size: 15px; }
  .commercial-movement-card.up b { color: ${VERDE}; }
  .commercial-movement-card.down b { color: ${ROJO}; }
  .commercial-movement-card em { color: #9b8f89; font-size: 9px; font-style: normal; white-space: nowrap; }

  .commercial-lower-grid {
    display: grid;
    grid-template-columns: minmax(0,1.45fr) minmax(300px,.75fr);
    gap: 13px;
  }

  .commercial-panel {
    min-width: 0;
    padding: 19px;
    border: 1px solid #e5dbd5;
    border-radius: 11px;
    background: #fff;
    box-shadow: 0 5px 18px rgba(62,40,33,.045);
  }

  .commercial-panel-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 13px;
  }

  .commercial-panel-head h2 {
    margin: 3px 0 0;
    color: #4f292a;
    font-size: 19px;
  }

  .commercial-panel-head > small {
    color: #938680;
    font-size: 9px;
  }

  .commercial-alert-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .commercial-alert {
    display: grid;
    grid-template-columns: 72px minmax(0,1fr) auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 56px;
    padding: 8px 10px;
    border: 1px solid #eee5e0;
    border-radius: 8px;
    background: #fffdfc;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform .14s ease, box-shadow .14s ease;
  }

  .commercial-alert > span {
    width: fit-content;
    padding: 4px 6px;
    border-radius: 5px;
    background: #f1efee;
    color: #766c68;
    font-size: 7px;
    font-weight: 950;
    letter-spacing: .4px;
  }

  .commercial-alert.alerta > span { background: #ffe8e7; color: ${ROJO}; }
  .commercial-alert.atencion > span { background: #fff3da; color: #936514; }
  .commercial-alert.info > span { background: #edf4ff; color: #315f91; }
  .commercial-alert strong { display: block; color: #503132; font-size: 11px; }
  .commercial-alert small { display: block; margin-top: 2px; color: #8f837e; font-size: 9px; }
  .commercial-alert > b { color: ${VINO}; font-size: 20px; }

  .commercial-good,
  .commercial-empty {
    padding: 25px 16px;
    border: 1px dashed #d9cec8;
    border-radius: 8px;
    text-align: center;
  }

  .commercial-good strong { display: block; color: ${VERDE}; font-size: 13px; }
  .commercial-good span,
  .commercial-empty { color: #8e817b; font-size: 10px; }

  .commercial-operation-list {
    display: flex;
    flex-direction: column;
  }

  .commercial-operation-list > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 0;
    border-bottom: 1px solid #f0e9e5;
  }

  .commercial-operation-list span { color: #817570; font-size: 10px; }
  .commercial-operation-list strong { color: #432d2d; font-size: 12px; }

  .commercial-detail-button {
    width: 100%;
    min-height: 39px;
    margin-top: 14px;
    border: 1px solid #ead8cf;
    border-radius: 7px;
    background: #fff8f3;
    color: ${VINO};
    font-size: 10px;
    font-weight: 900;
    cursor: pointer;
  }

  @media (max-width: 1120px) {
    .commercial-kpi-grid,
    .commercial-movement-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  }

  @media (max-width: 760px) {
    .commercial-summary-page { padding: 18px 14px 94px; }
    .commercial-summary-header { align-items: flex-start; }
    .commercial-summary-header button { min-height: 38px; padding: 0 12px; font-size: 10px; }
    .commercial-kpi-grid,
    .commercial-movement-grid,
    .commercial-lower-grid { grid-template-columns: 1fr; }
    .commercial-kpi { min-height: 128px; }
    .commercial-movement-card > div { align-items: flex-start; flex-direction: column; gap: 3px; }
    .commercial-alert { grid-template-columns: 62px minmax(0,1fr) auto; }
  }

  @media (max-width: 480px) {
    .commercial-summary-header { flex-direction: column; }
    .commercial-summary-header button { width: 100%; }
    .commercial-kpi-grid { grid-template-columns: 1fr; }
  }
`
