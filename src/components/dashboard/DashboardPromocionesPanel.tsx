import { useEffect, useMemo, useState } from "react"

import {
  obtenerPromocionesDb,
  type PromocionDb,
} from "../../repositories/promocionesRepository"
import {
  obtenerVentasDiariasRangoDb,
  type VentaDiariaDb,
} from "../../repositories/ventasRepository"
import {
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
} from "../../repositories/devolucionRepository"

type Periodo = {
  desde: string
  hasta: string
  venta: number
  unidades: number
  devoluciones: number
  tasaDevolucion: number
  estado: "COMPLETO" | "PARCIAL" | "PENDIENTE"
}

type Analisis = {
  promocion: PromocionDb
  antes: Periodo
  durante: Periodo
  despues: Periodo
  incrementoVenta: number
  incrementoVentaPct: number | null
  reduccionDevolucionesPct: number | null
  mejoraTasaPp: number
  resultadoIncrementalBruto: number
}

function fechaIsoLocal(fecha: Date) {
  const y = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, "0")
  const d = String(fecha.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function sumarDias(fechaIso: string, dias: number) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIsoLocal(fecha)
}

function diasInclusivos(desde: string, hasta: string) {
  const a = new Date(`${desde}T12:00:00`).getTime()
  const b = new Date(`${hasta}T12:00:00`).getTime()
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

function normalizar(valor: string | null | undefined) {
  return String(valor ?? "").trim().replace(/\s+/g, " ").toUpperCase()
}

function moneda(valor: number) {
  return Number(valor || 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numero(valor: number) {
  return Number(valor || 0).toLocaleString("es-EC", {
    maximumFractionDigits: 0,
  })
}

function porcentaje(valor: number | null) {
  return valor === null || !Number.isFinite(valor) ? "—" : `${valor.toFixed(1)}%`
}

function fechaCorta(fechaIso: string) {
  if (!fechaIso) return "—"
  const [, mes, dia] = fechaIso.split("-")
  return `${dia}/${mes}`
}

function variacion(actual: number, anterior: number) {
  if (anterior === 0) return actual === 0 ? 0 : null
  return ((actual - anterior) / anterior) * 100
}

function coincideVenta(
  venta: VentaDiariaDb,
  promocion: PromocionDb,
  ids: Set<string>,
  skus: Set<string>,
) {
  const cliente =
    venta.cliente_id === promocion.cliente_id ||
    (!venta.cliente_id &&
      normalizar(venta.cliente_nombre) === normalizar(promocion.cliente_nombre))

  if (!cliente) return false

  return (
    (Boolean(venta.producto_id) && ids.has(String(venta.producto_id))) ||
    skus.has(normalizar(venta.sku))
  )
}

export default function DashboardPromocionesPanel() {
  const [promociones, setPromociones] = useState<PromocionDb[]>([])
  const [ventas, setVentas] = useState<VentaDiariaDb[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionListadoDb[]>([])
  const [promocionId, setPromocionId] = useState("")
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    void cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    setError("")

    try {
      const promocionesDb = (await obtenerPromocionesDb()).filter(
        (item) => item.estado !== "CANCELADA",
      )

      setPromociones(promocionesDb)

      if (promocionesDb.length === 0) {
        setVentas([])
        setDevoluciones([])
        setPromocionId("")
        return
      }

      const limites = promocionesDb.map((p) => {
        const dias = diasInclusivos(p.fecha_inicio, p.fecha_fin)
        return {
          desde: sumarDias(p.fecha_inicio, -dias),
          hasta: sumarDias(p.fecha_fin, dias),
        }
      })

      const desde = limites.map((x) => x.desde).sort()[0]
      const fechasHasta = limites.map((x) => x.hasta).sort()
      const hasta = fechasHasta[fechasHasta.length - 1] ?? ""

      const [ventasDb, devolucionesDb] = await Promise.all([
        obtenerVentasDiariasRangoDb(desde, hasta),
        obtenerDevolucionesDb(desde, sumarDias(hasta, 60)),
      ])

      setVentas(ventasDb)
      setDevoluciones(devolucionesDb)

      const ordenadas = [...promocionesDb].sort((a, b) =>
        b.fecha_inicio.localeCompare(a.fecha_inicio),
      )
      setPromocionId((actual) =>
        promocionesDb.some((p) => p.id === actual)
          ? actual
          : ordenadas[0]?.id ?? "",
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo calcular el análisis de promociones.",
      )
    } finally {
      setCargando(false)
    }
  }

  const ultimaFechaVenta = useMemo(
    () =>
      ventas.reduce(
        (ultima, venta) =>
          venta.fecha_emision > ultima ? venta.fecha_emision : ultima,
        "",
      ),
    [ventas],
  )

  const analisis = useMemo<Analisis[]>(() => {
    return promociones
      .map((promocion) => {
        const dias = diasInclusivos(promocion.fecha_inicio, promocion.fecha_fin)
        const antesDesde = sumarDias(promocion.fecha_inicio, -dias)
        const antesHasta = sumarDias(promocion.fecha_inicio, -1)
        const despuesDesde = sumarDias(promocion.fecha_fin, 1)
        const despuesHasta = sumarDias(promocion.fecha_fin, dias)

        const ids = new Set(
          promocion.productos.map((p) => String(p.producto_id)),
        )
        const skus = new Set(
          promocion.productos.map((p) => normalizar(p.sku)),
        )

        const ventasPromo = ventas.filter((venta) =>
          coincideVenta(venta, promocion, ids, skus),
        )

        const devolucionesPromo = devoluciones.filter(
          (d) => d.cliente?.id === promocion.cliente_id,
        )

        const estadoPeriodo = (
          desde: string,
          hasta: string,
        ): Periodo["estado"] => {
          if (!ultimaFechaVenta || desde > ultimaFechaVenta) return "PENDIENTE"
          if (hasta > ultimaFechaVenta) return "PARCIAL"
          return "COMPLETO"
        }

        const calcular = (
          desde: string,
          hasta: string,
          ventaForzada?: number,
          unidadesForzadas?: number,
        ): Periodo => {
          const estado = estadoPeriodo(desde, hasta)
          const hastaReal =
            estado === "PARCIAL" && ultimaFechaVenta ? ultimaFechaVenta : hasta

          const ventasPeriodo = ventasPromo.filter(
            (v) => v.fecha_emision >= desde && v.fecha_emision <= hastaReal,
          )

          const venta = ventasPeriodo.reduce(
            (t, v) => t + Number(v.total_sin_impuestos ?? 0),
            0,
          )
          const unidades = ventasPeriodo.reduce(
            (t, v) => t + Number(v.cantidad ?? 0),
            0,
          )

          const devueltas = devolucionesPromo.reduce(
            (total, devolucion) =>
              total +
              (devolucion.detalles ?? []).reduce((suma, detalle) => {
                const producto =
                  ids.has(String(detalle.producto_id)) ||
                  skus.has(normalizar(detalle.producto?.codigo))

                if (!producto) return suma

                const fechaAtribuida =
                  detalle.semana_origen_inicio || devolucion.fecha_devolucion

                if (fechaAtribuida < desde || fechaAtribuida > hastaReal) {
                  return suma
                }

                return suma + Number(detalle.unidades ?? 0)
              }, 0),
            0,
          )

          const unidadesFinal =
            unidadesForzadas === undefined
              ? unidades
              : Number(unidadesForzadas)

          return {
            desde,
            hasta,
            venta:
              ventaForzada === undefined ? venta : Number(ventaForzada),
            unidades: unidadesFinal,
            devoluciones: devueltas,
            tasaDevolucion:
              unidadesFinal > 0 ? (devueltas / unidadesFinal) * 100 : 0,
            estado,
          }
        }

        const antes = calcular(antesDesde, antesHasta)
        const durante = calcular(
          promocion.fecha_inicio,
          promocion.fecha_fin,
          promocion.venta_base,
          promocion.unidades_vendidas,
        )
        const despues = calcular(despuesDesde, despuesHasta)

        const incrementoVenta = durante.venta - antes.venta
        const reduccionDevolucionesPct =
          antes.devoluciones === 0
            ? durante.devoluciones === 0
              ? 0
              : null
            : ((antes.devoluciones - durante.devoluciones) /
                antes.devoluciones) *
              100

        return {
          promocion,
          antes,
          durante,
          despues,
          incrementoVenta,
          incrementoVentaPct: variacion(durante.venta, antes.venta),
          reduccionDevolucionesPct,
          mejoraTasaPp: antes.tasaDevolucion - durante.tasaDevolucion,
          resultadoIncrementalBruto:
            incrementoVenta - Number(promocion.descuento_esperado || 0),
        }
      })
      .sort((a, b) =>
        b.promocion.fecha_inicio.localeCompare(a.promocion.fecha_inicio),
      )
  }, [promociones, ventas, devoluciones, ultimaFechaVenta])

  const seleccionado =
    analisis.find((a) => a.promocion.id === promocionId) ??
    analisis[0] ??
    null

  const totales = useMemo(
    () => ({
      ventaBase: promociones.reduce(
        (t, p) => t + Number(p.venta_base || 0),
        0,
      ),
      descuento: promociones.reduce(
        (t, p) => t + Number(p.descuento_esperado || 0),
        0,
      ),
      notas: promociones.reduce(
        (t, p) => t + Number(p.notas_total || 0),
        0,
      ),
      diferencia: promociones.reduce(
        (t, p) => t + Number(p.diferencia || 0),
        0,
      ),
    }),
    [promociones],
  )

  if (cargando) {
    return (
      <section className="promo-analysis">
        <style>{css}</style>
        <div className="promo-empty">Calculando promociones…</div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="promo-analysis">
        <style>{css}</style>
        <div className="promo-error">{error}</div>
      </section>
    )
  }

  return (
    <section className="promo-analysis">
      <style>{css}</style>

      <header className="promo-header">
        <div>
          <span>DESCUENTOS Y PROMOCIONES</span>
          <h2>Impacto comercial de promociones</h2>
          <p>
            Compara períodos equivalentes antes, durante y después. Las
            devoluciones se atribuyen a la semana de venta que las originó.
          </p>
        </div>
        <button type="button" onClick={() => void cargar()}>
          Actualizar
        </button>
      </header>

      {promociones.length === 0 ? (
        <div className="promo-empty">
          No existen promociones registradas para analizar.
        </div>
      ) : (
        <>
          <div className="promo-kpis">
            <Kpi
              titulo="Venta afectada"
              valor={moneda(totales.ventaBase)}
              detalle="Facturación dentro de promociones"
            />
            <Kpi
              titulo="Descuento generado"
              valor={moneda(totales.descuento)}
              detalle="Calculado sobre ventas reales"
            />
            <Kpi
              titulo="Notas recibidas"
              valor={moneda(totales.notas)}
              detalle="Notas de crédito conciliadas"
            />
            <Kpi
              titulo="Pendiente"
              valor={moneda(totales.diferencia)}
              detalle="Esperado menos notas recibidas"
              alerta={Math.abs(totales.diferencia) >= 0.01}
            />
          </div>

          <div className="promo-selector">
            <label>
              <span>Promoción a analizar</span>
              <select
                value={seleccionado?.promocion.id ?? ""}
                onChange={(e) => setPromocionId(e.target.value)}
              >
                {analisis.map((a) => (
                  <option key={a.promocion.id} value={a.promocion.id}>
                    {a.promocion.nombre} · {a.promocion.cliente_nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {seleccionado && (
            <>
              <section className="promo-selected">
                <div className="promo-selected-head">
                  <div>
                    <span>{seleccionado.promocion.estado}</span>
                    <h3>{seleccionado.promocion.nombre}</h3>
                    <p>
                      {seleccionado.promocion.cliente_nombre} ·{" "}
                      {fechaCorta(seleccionado.promocion.fecha_inicio)}–
                      {fechaCorta(seleccionado.promocion.fecha_fin)}
                    </p>
                  </div>

                  <div className="promo-skus">
                    {seleccionado.promocion.productos.map((p) => (
                      <span key={p.id}>
                        {p.producto_nombre || p.sku} ·{" "}
                        {p.tipo_descuento === "PORCENTAJE"
                          ? `${Number(p.valor_descuento).toFixed(1)}%`
                          : `${moneda(p.valor_descuento)}/Unid.`}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="promo-comparison-wrap">
                  <table className="promo-comparison">
                    <thead>
                      <tr>
                        <th>Indicador</th>
                        <th>
                          Antes
                          <small>
                            {fechaCorta(seleccionado.antes.desde)}–
                            {fechaCorta(seleccionado.antes.hasta)}
                          </small>
                        </th>
                        <th className="current">
                          Promoción
                          <small>
                            {fechaCorta(seleccionado.durante.desde)}–
                            {fechaCorta(seleccionado.durante.hasta)}
                          </small>
                        </th>
                        <th>
                          Después
                          <small>
                            {fechaCorta(seleccionado.despues.desde)}–
                            {fechaCorta(seleccionado.despues.hasta)}
                          </small>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <Fila
                        etiqueta="Ventas"
                        antes={moneda(seleccionado.antes.venta)}
                        durante={moneda(seleccionado.durante.venta)}
                        despues={
                          seleccionado.despues.estado === "PENDIENTE"
                            ? "Pendiente"
                            : moneda(seleccionado.despues.venta)
                        }
                      />
                      <Fila
                        etiqueta="Unidades vendidas"
                        antes={numero(seleccionado.antes.unidades)}
                        durante={numero(seleccionado.durante.unidades)}
                        despues={
                          seleccionado.despues.estado === "PENDIENTE"
                            ? "Pendiente"
                            : numero(seleccionado.despues.unidades)
                        }
                      />
                      <Fila
                        etiqueta="Unidades devueltas"
                        antes={numero(seleccionado.antes.devoluciones)}
                        durante={numero(seleccionado.durante.devoluciones)}
                        despues={
                          seleccionado.despues.estado === "PENDIENTE"
                            ? "Pendiente"
                            : numero(seleccionado.despues.devoluciones)
                        }
                      />
                      <Fila
                        etiqueta="% devolución"
                        antes={porcentaje(seleccionado.antes.tasaDevolucion)}
                        durante={porcentaje(
                          seleccionado.durante.tasaDevolucion,
                        )}
                        despues={
                          seleccionado.despues.estado === "PENDIENTE"
                            ? "Pendiente"
                            : porcentaje(
                                seleccionado.despues.tasaDevolucion,
                              )
                        }
                      />
                    </tbody>
                  </table>
                </div>

                <div className="promo-result-grid">
                  <Resultado
                    titulo="Variación de ventas"
                    valor={porcentaje(seleccionado.incrementoVentaPct)}
                    detalle={`${moneda(
                      seleccionado.incrementoVenta,
                    )} vs. período anterior`}
                    positivo={
                      seleccionado.incrementoVentaPct !== null &&
                      seleccionado.incrementoVentaPct >= 0
                    }
                  />
                  <Resultado
                    titulo="Reducción de devoluciones"
                    valor={
                      seleccionado.reduccionDevolucionesPct === null
                        ? "Sin base"
                        : porcentaje(
                            seleccionado.reduccionDevolucionesPct,
                          )
                    }
                    detalle={`${seleccionado.mejoraTasaPp.toFixed(
                      1,
                    )} pp de mejora en tasa`}
                    positivo={
                      seleccionado.reduccionDevolucionesPct !== null &&
                      seleccionado.reduccionDevolucionesPct >= 0
                    }
                  />
                  <Resultado
                    titulo="Costo del descuento"
                    valor={moneda(
                      seleccionado.promocion.descuento_esperado,
                    )}
                    detalle="Sobre la facturación real"
                  />
                  <Resultado
                    titulo="Incremental bruto"
                    valor={moneda(
                      seleccionado.resultadoIncrementalBruto,
                    )}
                    detalle="Venta adicional menos descuento; antes de costos"
                    positivo={
                      seleccionado.resultadoIncrementalBruto >= 0
                    }
                  />
                </div>

                <div className="promo-reconciliation">
                  <div>
                    <span>Descuento esperado</span>
                    <strong>
                      {moneda(
                        seleccionado.promocion.descuento_esperado,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Notas recibidas</span>
                    <strong>
                      {moneda(seleccionado.promocion.notas_total)}
                    </strong>
                  </div>
                  <div
                    className={
                      Math.abs(seleccionado.promocion.diferencia) < 0.01
                        ? "balanced"
                        : "pending"
                    }
                  >
                    <span>Diferencia</span>
                    <strong>
                      {moneda(seleccionado.promocion.diferencia)}
                    </strong>
                  </div>
                </div>
              </section>

              <footer className="promo-footnote">
                Los períodos comparados tienen la misma duración. El
                incremental bruto todavía no es utilidad: faltan materiales,
                transporte, mano de obra y demás costos. Esa decisión se
                completa con el simulador de rentabilidad.
              </footer>
            </>
          )}
        </>
      )}
    </section>
  )
}

function Kpi({
  titulo,
  valor,
  detalle,
  alerta = false,
}: {
  titulo: string
  valor: string
  detalle: string
  alerta?: boolean
}) {
  return (
    <article className={`promo-kpi ${alerta ? "alert" : ""}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small>{detalle}</small>
    </article>
  )
}

function Fila({
  etiqueta,
  antes,
  durante,
  despues,
}: {
  etiqueta: string
  antes: string
  durante: string
  despues: string
}) {
  return (
    <tr>
      <th>{etiqueta}</th>
      <td>{antes}</td>
      <td className="current">{durante}</td>
      <td>{despues}</td>
    </tr>
  )
}

function Resultado({
  titulo,
  valor,
  detalle,
  positivo,
}: {
  titulo: string
  valor: string
  detalle: string
  positivo?: boolean
}) {
  return (
    <article
      className={
        positivo === undefined
          ? "promo-result"
          : `promo-result ${positivo ? "positive" : "negative"}`
      }
    >
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small>{detalle}</small>
    </article>
  )
}

const css = `
  .promo-analysis {
    margin-top: 28px;
    padding-top: 26px;
    border-top: 1px solid #eaded8;
    color: #2f2927;
  }

  .promo-header {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:18px;
    margin-bottom:18px;
  }

  .promo-header > div > span,
  .promo-selected-head > div:first-child > span {
    display:block;
    margin-bottom:5px;
    color:#8F1D24;
    font-size:11px;
    font-weight:900;
    letter-spacing:.08em;
  }

  .promo-header h2,
  .promo-selected h3 { margin:0; }

  .promo-header p,
  .promo-selected p,
  .promo-footnote {
    margin:6px 0 0;
    color:#756963;
    font-size:13px;
    line-height:1.5;
  }

  .promo-header button {
    min-height:38px;
    padding:8px 14px;
    border:1px solid #8F1D24;
    border-radius:9px;
    background:white;
    color:#8F1D24;
    font-weight:800;
    cursor:pointer;
  }

  .promo-kpis,
  .promo-result-grid {
    display:grid;
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:12px;
  }

  .promo-kpi,
  .promo-result {
    padding:15px;
    border:1px solid #eaded8;
    border-radius:12px;
    background:white;
  }

  .promo-kpi.alert { background:#fff8f5; }

  .promo-kpi span,
  .promo-result span,
  .promo-reconciliation span {
    display:block;
    color:#796d67;
    font-size:11px;
    font-weight:800;
    text-transform:uppercase;
  }

  .promo-kpi strong,
  .promo-result strong,
  .promo-reconciliation strong {
    display:block;
    margin-top:6px;
    font-size:20px;
  }

  .promo-kpi small,
  .promo-result small {
    display:block;
    margin-top:5px;
    color:#8a7e78;
    font-size:11px;
  }

  .promo-result.positive strong { color:#166534; }
  .promo-result.negative strong { color:#9f1d1d; }

  .promo-selector {
    margin:18px 0;
    padding:14px;
    border:1px solid #eaded8;
    border-radius:12px;
    background:#fbf8f6;
  }

  .promo-selector label {
    display:grid;
    grid-template-columns:180px minmax(0,1fr);
    align-items:center;
    gap:12px;
  }

  .promo-selector span {
    font-size:12px;
    font-weight:800;
  }

  .promo-selector select {
    width:100%;
    min-height:40px;
    padding:8px 10px;
    border:1px solid #d9cdc7;
    border-radius:8px;
    background:white;
  }

  .promo-selected {
    padding:18px;
    border:1px solid #eaded8;
    border-radius:14px;
    background:white;
  }

  .promo-selected-head {
    display:flex;
    justify-content:space-between;
    gap:20px;
    align-items:flex-start;
    margin-bottom:16px;
  }

  .promo-skus {
    display:flex;
    flex-wrap:wrap;
    justify-content:flex-end;
    gap:7px;
    max-width:55%;
  }

  .promo-skus span {
    padding:6px 9px;
    border-radius:999px;
    background:#f3ece8;
    color:#6a5a53;
    font-size:11px;
    font-weight:800;
  }

  .promo-comparison-wrap {
    overflow-x:auto;
    border:1px solid #eaded8;
    border-radius:12px;
  }

  .promo-comparison {
    width:100%;
    min-width:680px;
    border-collapse:collapse;
  }

  .promo-comparison th,
  .promo-comparison td {
    padding:11px 12px;
    border-bottom:1px solid #eee5e1;
    text-align:right;
  }

  .promo-comparison thead th {
    background:#f8f4f1;
    color:#625650;
    font-size:11px;
    text-transform:uppercase;
  }

  .promo-comparison thead th:first-child,
  .promo-comparison tbody th { text-align:left; }

  .promo-comparison thead small {
    display:block;
    margin-top:4px;
    color:#958983;
    font-size:10px;
    text-transform:none;
  }

  .promo-comparison tbody th {
    color:#5f5550;
    font-size:12px;
  }

  .promo-comparison tbody td {
    font-weight:800;
  }

  .promo-comparison .current { background:#fff8f5; }

  .promo-reconciliation {
    display:grid;
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:10px;
    margin-top:14px;
    padding-top:14px;
    border-top:1px solid #eee5e1;
  }

  .promo-reconciliation > div {
    padding:12px;
    border-radius:10px;
    background:#f8f5f3;
  }

  .promo-reconciliation .balanced { background:#ecfdf3; }
  .promo-reconciliation .pending { background:#fff7ed; }

  .promo-empty,
  .promo-error {
    padding:18px;
    border:1px dashed #d9cdc7;
    border-radius:12px;
    background:#fffdfb;
    color:#746862;
  }

  .promo-error {
    border-color:#f0b8b8;
    background:#fff7f7;
    color:#9f1d1d;
  }

  .promo-footnote { margin-top:12px; }

  @media (max-width:980px) {
    .promo-kpis,
    .promo-result-grid {
      grid-template-columns:repeat(2,minmax(0,1fr));
    }

    .promo-selected-head { flex-direction:column; }
    .promo-skus { max-width:none; justify-content:flex-start; }
  }

  @media (max-width:640px) {
    .promo-header { flex-direction:column; }

    .promo-kpis,
    .promo-result-grid,
    .promo-reconciliation {
      grid-template-columns:1fr;
    }

    .promo-selector label { grid-template-columns:1fr; }
  }
`
