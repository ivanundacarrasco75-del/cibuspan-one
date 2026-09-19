import { useEffect, useMemo, useState } from "react"
import type { DevolucionListadoDb } from "../../repositories/devolucionRepository"
import type { VentaDiariaDb } from "../../repositories/ventasRepository"

const CIAN = "#19d8f2"
const MAGENTA = "#ff1688"

type FilaDevolucionPiloto = {
  fechaOrigen: string
  cliente: string
  sku: string
  unidades: number
  valor: number
}

type AgrupacionDashboard =
  | "DIA"
  | "SEMANA"
  | "MES"
  | "TRIMESTRE"
  | "SEMESTRE"

function normalizar(valor: string | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function clienteClave(nombre: string | null | undefined) {
  const valor = normalizar(nombre)
  if (
    valor.includes("FAVORITA") ||
    valor.includes("SUPERMAXI") ||
    valor.includes("MEGAMAXI")
  ) return "CORPORACION FAVORITA"
  if (
    valor.includes("SANTAMARIA") ||
    valor.includes("SANTA MARIA") ||
    valor.includes("MEGA SANTA")
  ) return "MEGA SANTAMARIA"
  if (valor.includes("ROSADO") || valor.includes("COMISARIATO")) {
    return "CORPORACION EL ROSADO"
  }
  if (valor.includes("TUTI")) return "TUTI"
  return valor || "SIN AUTOSERVICIO"
}

function clienteEtiqueta(clave: string, nombre: string) {
  if (clave === "CORPORACION FAVORITA") return "Corporación Favorita"
  if (clave === "MEGA SANTAMARIA") return "Mega Santamaría"
  if (clave === "CORPORACION EL ROSADO") return "Corporación El Rosado"
  if (clave === "TUTI") return "TUTI"
  return nombre || "Sin autoservicio"
}

function fechaIsoLocal(fecha: Date) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function inicioSemana(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  const dia = fecha.getDay()
  fecha.setDate(fecha.getDate() - (dia === 0 ? 6 : dia - 1))
  return fechaIsoLocal(fecha)
}

function sumarDias(fechaIso: string, dias: number) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIsoLocal(fecha)
}

function semanasEntre(desde: string, hasta: string) {
  const semanas: string[] = []
  let actual = inicioSemana(desde)
  const ultima = inicioSemana(hasta)
  while (actual <= ultima) {
    semanas.push(actual)
    actual = sumarDias(actual, 7)
  }
  return semanas
}

function diasEntre(desde: string, hasta: string) {
  const dias: string[] = []
  let actual = desde
  while (actual <= hasta) {
    dias.push(actual)
    actual = sumarDias(actual, 1)
  }
  return dias
}

function mesesEntre(desde: string, hasta: string) {
  const meses: string[] = []
  const inicio = new Date(`${desde.slice(0, 7)}-01T12:00:00`)
  const fin = `${hasta.slice(0, 7)}-01`
  let actual = fechaIsoLocal(inicio)
  while (actual <= fin) {
    meses.push(actual)
    inicio.setMonth(inicio.getMonth() + 1)
    actual = fechaIsoLocal(inicio)
  }
  return meses
}

function claveAgrupacion(fecha: string, agrupacion: AgrupacionDashboard) {
  if (agrupacion === "DIA") return fecha
  if (agrupacion === "MES") return `${fecha.slice(0, 7)}-01`
  if (agrupacion === "TRIMESTRE" || agrupacion === "SEMESTRE") {
    const [anio, mes] = fecha.split("-").map(Number)
    const mesInicial = agrupacion === "TRIMESTRE"
      ? Math.floor((mes - 1) / 3) * 3
      : mes <= 6 ? 0 : 6
    return fechaIsoLocal(new Date(anio, mesInicial, 1))
  }
  return inicioSemana(fecha)
}

function puntosPeriodo(
  desde: string,
  hasta: string,
  agrupacion: AgrupacionDashboard,
) {
  if (agrupacion === "DIA") return diasEntre(desde, hasta)
  if (agrupacion === "MES") return mesesEntre(desde, hasta)
  if (agrupacion === "TRIMESTRE" || agrupacion === "SEMESTRE") {
    return Array.from(
      new Set(
        mesesEntre(desde, hasta).map((mes) =>
          claveAgrupacion(mes, agrupacion),
        ),
      ),
    )
  }
  return semanasEntre(desde, hasta)
}

function numeroSemanaIso(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setHours(0, 0, 0, 0)
  fecha.setDate(fecha.getDate() + 3 - ((fecha.getDay() + 6) % 7))
  const primerJueves = new Date(fecha.getFullYear(), 0, 4)
  return 1 + Math.round(
    ((fecha.getTime() - primerJueves.getTime()) / 86400000 -
      3 +
      ((primerJueves.getDay() + 6) % 7)) /
      7,
  )
}

function etiquetaPunto(fechaIso: string, agrupacion: AgrupacionDashboard) {
  if (agrupacion === "DIA") {
    const [, mes, dia] = fechaIso.split("-")
    return `${dia}/${mes}`
  }
  if (agrupacion === "MES") {
    return new Intl.DateTimeFormat("es-EC", { month: "short" })
      .format(new Date(`${fechaIso}T12:00:00`))
      .replace(".", "")
  }
  if (agrupacion === "TRIMESTRE") {
    const [anio, mes] = fechaIso.split("-").map(Number)
    return `T${Math.floor((mes - 1) / 3) + 1} ${anio}`
  }
  if (agrupacion === "SEMESTRE") {
    const [anio, mes] = fechaIso.split("-").map(Number)
    return `S${mes <= 6 ? 1 : 2} ${anio}`
  }
  return String(numeroSemanaIso(fechaIso)).padStart(2, "0")
}

function numero(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    maximumFractionDigits: 0,
  }).format(valor || 0)
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor || 0)
}

function porcentaje(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(valor || 0)
}

function textoPeriodo(desde: string, hasta: string) {
  const formato = (fecha: string) => {
    const [anio, mes, dia] = fecha.split("-")
    return `${dia}/${mes}/${anio}`
  }
  return `${formato(desde)} — ${formato(hasta)}`
}

export default function DashboardPilotoPanel({
  ventas,
  devoluciones,
  fechaDesde,
  fechaHasta,
  agrupacion,
}: {
  ventas: VentaDiariaDb[]
  devoluciones: DevolucionListadoDb[]
  fechaDesde: string
  fechaHasta: string
  agrupacion: AgrupacionDashboard
}) {
  const [autoserviciosSeleccionados, setAutoserviciosSeleccionados] = useState<string[]>([])
  const [sku, setSku] = useState("TODOS")

  const datos = useMemo(() => {
    const ventasPeriodo = ventas.filter(
      (item) =>
        item.fecha_emision >= fechaDesde && item.fecha_emision <= fechaHasta,
    )

    const filasDevolucion: FilaDevolucionPiloto[] = []
    devoluciones.forEach((devolucion) => {
      const cliente = devolucion.cliente?.nombre ?? "Sin autoservicio"
      ;(devolucion.detalles ?? []).forEach((detalle) => {
        const vidaEfectiva = Number(detalle.vida_efectiva_dias ?? 0)
        const fechaOrigen = vidaEfectiva > 0
          ? sumarDias(devolucion.fecha_devolucion, -vidaEfectiva)
          : detalle.semana_origen_inicio || devolucion.fecha_devolucion
        if (fechaOrigen < fechaDesde || fechaOrigen > fechaHasta) return
        filasDevolucion.push({
          fechaOrigen,
          cliente,
          sku: detalle.producto?.codigo ?? detalle.sku_documento ?? "Sin SKU",
          unidades: Number(detalle.unidades ?? 0),
          valor: Number(detalle.valor_total_documento ?? 0),
        })
      })
    })

    const mapaClientes = new Map<string, { valor: string; nombre: string; venta: number }>()
    ventasPeriodo.forEach((item) => {
      const valor = clienteClave(item.cliente_nombre)
      const actual = mapaClientes.get(valor) ?? {
        valor,
        nombre: clienteEtiqueta(valor, item.cliente_nombre),
        venta: 0,
      }
      actual.venta += Number(item.total_sin_impuestos ?? 0)
      mapaClientes.set(valor, actual)
    })
    const autoservicios = Array.from(mapaClientes.values()).sort(
      (a, b) => b.venta - a.venta,
    )

    const ventasCliente = ventasPeriodo.filter(
      (item) =>
        autoserviciosSeleccionados.length === 0 ||
        autoserviciosSeleccionados.includes(clienteClave(item.cliente_nombre)),
    )
    const mapaSku = new Map<
      string,
      { valor: string; codigo: string; nombre: string; venta: number }
    >()
    ventasCliente.forEach((item) => {
      const valor = normalizar(item.sku || "Sin SKU")
      const actual = mapaSku.get(valor) ?? {
        valor,
        codigo: item.sku || "Sin SKU",
        nombre: item.producto_nombre || item.sku || "Sin producto",
        venta: 0,
      }
      actual.venta += Number(item.total_sin_impuestos ?? 0)
      mapaSku.set(valor, actual)
    })
    const skus = Array.from(mapaSku.values()).sort((a, b) => b.venta - a.venta)

    const ventasFiltradas = ventasCliente.filter(
      (item) => sku === "TODOS" || normalizar(item.sku) === sku,
    )
    const devolucionesFiltradas = filasDevolucion.filter(
      (item) =>
        (autoserviciosSeleccionados.length === 0 ||
          autoserviciosSeleccionados.includes(clienteClave(item.cliente))) &&
        (sku === "TODOS" || normalizar(item.sku) === sku),
    )

    const ventaTotal = ventasFiltradas.reduce(
      (total, item) => total + Number(item.total_sin_impuestos ?? 0),
      0,
    )
    const unidadesVendidas = ventasFiltradas.reduce(
      (total, item) => total + Number(item.cantidad ?? 0),
      0,
    )
    const unidadesDevueltas = devolucionesFiltradas.reduce(
      (total, item) => total + item.unidades,
      0,
    )
    const valorDevuelto = devolucionesFiltradas.reduce(
      (total, item) => total + item.valor,
      0,
    )
    const ventaNeta = ventaTotal - valorDevuelto
    const tasa = unidadesVendidas > 0 ? (unidadesDevueltas / unidadesVendidas) * 100 : 0

    const serie = puntosPeriodo(fechaDesde, fechaHasta, agrupacion).map((punto) => ({
      punto,
      venta: ventasFiltradas
        .filter((item) => claveAgrupacion(item.fecha_emision, agrupacion) === punto)
        .reduce((total, item) => total + Number(item.total_sin_impuestos ?? 0), 0),
      devolucion: devolucionesFiltradas
        .filter((item) => claveAgrupacion(item.fechaOrigen, agrupacion) === punto)
        .reduce((total, item) => total + item.valor, 0),
    }))

    const compararAutoservicios = autoserviciosSeleccionados.length !== 1
    const mapaRanking = new Map<string, { nombre: string; codigo: string; venta: number }>()
    ventasFiltradas.forEach((item) => {
      const clave = compararAutoservicios
        ? clienteClave(item.cliente_nombre)
        : normalizar(item.sku)
      const actual = mapaRanking.get(clave) ?? {
        nombre: compararAutoservicios
          ? clienteEtiqueta(clave, item.cliente_nombre)
          : item.producto_nombre,
        codigo: compararAutoservicios ? "Autoservicio" : item.sku,
        venta: 0,
      }
      actual.venta += Number(item.total_sin_impuestos ?? 0)
      mapaRanking.set(clave, actual)
    })
    const ranking = Array.from(mapaRanking.values())
      .sort((a, b) => b.venta - a.venta)
      .slice(0, 7)

    return {
      autoservicios,
      skus,
      ventaTotal,
      ventaNeta,
      valorDevuelto,
      unidadesVendidas,
      unidadesDevueltas,
      tasa,
      serie,
      ranking,
    }
  }, [ventas, devoluciones, fechaDesde, fechaHasta, agrupacion, autoserviciosSeleccionados, sku])

  useEffect(() => {
    setAutoserviciosSeleccionados((actuales) => {
      const validos = actuales.filter((valor) =>
        datos.autoservicios.some((item) => item.valor === valor),
      )
      return validos.length === actuales.length ? actuales : validos
    })
  }, [datos.autoservicios])

  useEffect(() => {
    if (sku !== "TODOS" && !datos.skus.some((item) => item.valor === sku)) {
      setSku("TODOS")
    }
  }, [sku, datos.skus])

  const maxSerie = Math.max(
    1,
    ...datos.serie.flatMap((item) => [item.venta, item.devolucion]),
  )
  const maxRanking = Math.max(1, ...datos.ranking.map((item) => item.venta))
  const tasaGrafico = Math.max(0, Math.min(datos.tasa, 100))
  const agrupacionTexto =
    agrupacion === "DIA"
      ? "día"
      : agrupacion === "MES"
        ? "mes"
        : agrupacion === "TRIMESTRE"
          ? "trimestre"
          : agrupacion === "SEMESTRE"
            ? "semestre"
            : "semana"

  return (
    <section className="pilot-shell">
      <style>{css}</style>

      <header className="pilot-header">
        <div>
          <span>DASHBOARD OFICIAL · COMERCIAL</span>
          <h2>Comercial interactivo</h2>
          <p>{textoPeriodo(fechaDesde, fechaHasta)} · Selecciona uno o varios clientes y luego un SKU.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAutoserviciosSeleccionados([])
            setSku("TODOS")
          }}
        >
          Restablecer filtros
        </button>
      </header>

      <div className="pilot-layout">
        <aside className="pilot-filters">
          <SelectorClientes
            titulo="Clientes"
            seleccionarTodos={() => {
              setAutoserviciosSeleccionados([])
              setSku("TODOS")
            }}
            opciones={datos.autoservicios.map((item) => ({
              valor: item.valor,
              etiqueta: item.nombre,
              detalle: moneda(item.venta),
            }))}
            valoresActivos={autoserviciosSeleccionados}
            alternar={(valor) => {
              setAutoserviciosSeleccionados((actuales) =>
                actuales.includes(valor)
                  ? actuales.filter((item) => item !== valor)
                  : [...actuales, valor],
              )
              setSku("TODOS")
            }}
          />

          <SelectorBotones
            titulo="SKU"
            todosActivo={sku === "TODOS"}
            seleccionarTodos={() => setSku("TODOS")}
            opciones={datos.skus.map((item) => ({
              valor: item.valor,
              etiqueta: item.nombre,
              detalle: item.codigo,
            }))}
            valorActivo={sku}
            seleccionar={setSku}
          />
        </aside>

        <div className="pilot-content">
          {ventas.length === 0 ? (
            <div className="pilot-empty">
              Importa ventas desde Comercial → Ventas → Importar ventas para activar este dashboard.
            </div>
          ) : (
            <>
              <section className="pilot-kpis">
                <KpiPiloto etiqueta="Ventas" valor={moneda(datos.ventaTotal)} tono="cyan" />
                <KpiPiloto etiqueta="Devoluciones" valor={moneda(datos.valorDevuelto)} tono="magenta" />
                <KpiPiloto etiqueta="Venta neta" valor={moneda(datos.ventaNeta)} tono="verde" />
                <KpiPiloto etiqueta="Unidades vendidas" valor={`${numero(datos.unidadesVendidas)} Unid.`} tono="cyan" />
                <KpiPiloto etiqueta="Unidades devueltas" valor={`${numero(datos.unidadesDevueltas)} Unid.`} tono="magenta" />
              </section>

              <section className="pilot-grid">
                <article className="pilot-chart pilot-weekly">
                  <header>
                    <div><span>TENDENCIA</span><h3>Ventas y devoluciones por {agrupacionTexto}</h3></div>
                    <div className="pilot-legend"><i className="cyan" /> Ventas <i className="magenta" /> Devoluciones</div>
                  </header>
                  <div className="pilot-week-bars">
                    {datos.serie.map((item) => (
                      <div key={item.punto}>
                        <span>{etiquetaPunto(item.punto, agrupacion)}</span>
                        <section>
                          <i className="cyan" style={{ height: `${Math.max(2, item.venta / maxSerie * 100)}%` }} title={`Ventas ${moneda(item.venta)}`} />
                          <i className="magenta" style={{ height: `${Math.max(item.devolucion > 0 ? 2 : 0, item.devolucion / maxSerie * 100)}%` }} title={`Devoluciones ${moneda(item.devolucion)}`} />
                        </section>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="pilot-chart pilot-rate">
                  <header><div><span>CALIDAD COMERCIAL</span><h3>Tasa de devolución</h3></div></header>
                  <div
                    className="pilot-donut"
                    style={{ background: `conic-gradient(${MAGENTA} 0 ${tasaGrafico}%, #24303d ${tasaGrafico}% 100%)` }}
                  >
                    <div><strong>{porcentaje(datos.tasa)}%</strong><span>del periodo</span></div>
                  </div>
                  <p className={datos.tasa <= 8 ? "ok" : "alert"}>
                    {datos.tasa <= 8 ? "Dentro de la meta de 8%" : "Sobre la meta de 8%"}
                  </p>
                </article>

                <article className="pilot-chart pilot-ranking">
                  <header>
                    <div>
                      <span>CONCENTRACIÓN</span>
                      <h3>{autoserviciosSeleccionados.length === 1 ? "Ventas por SKU" : "Ventas por cliente"}</h3>
                    </div>
                  </header>
                  <div>
                    {datos.ranking.map((item) => (
                      <section key={`${item.codigo}-${item.nombre}`}>
                        <p><strong>{item.nombre}</strong><span>{moneda(item.venta)}</span></p>
                        <div><i style={{ width: `${item.venta / maxRanking * 100}%` }} /></div>
                        <small>{item.codigo}</small>
                      </section>
                    ))}
                  </div>
                </article>
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function SelectorClientes({
  titulo,
  seleccionarTodos,
  opciones,
  valoresActivos,
  alternar,
}: {
  titulo: string
  seleccionarTodos: () => void
  opciones: { valor: string; etiqueta: string; detalle: string }[]
  valoresActivos: string[]
  alternar: (valor: string) => void
}) {
  return (
    <section className="pilot-selector">
      <header>
        <span>FILTRO MÚLTIPLE</span>
        <h3>{titulo}</h3>
        <small className="pilot-selection-summary">
          {valoresActivos.length === 0
            ? "Todos los clientes"
            : `${valoresActivos.length} cliente${valoresActivos.length === 1 ? "" : "s"} seleccionado${valoresActivos.length === 1 ? "" : "s"}`}
        </small>
      </header>
      <div>
        <button
          type="button"
          className={valoresActivos.length === 0 ? "active" : ""}
          onClick={seleccionarTodos}
        >
          <strong>Todos</strong><small>Vista completa</small>
        </button>
        {opciones.map((opcion) => (
          <label
            key={opcion.valor}
            className={`pilot-check-row ${valoresActivos.includes(opcion.valor) ? "active" : ""}`}
          >
            <input
              type="checkbox"
              checked={valoresActivos.includes(opcion.valor)}
              onChange={() => alternar(opcion.valor)}
            />
            <span>
              <strong>{opcion.etiqueta}</strong>
              <small>{opcion.detalle}</small>
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}

function SelectorBotones({
  titulo,
  todosActivo,
  seleccionarTodos,
  opciones,
  valorActivo,
  seleccionar,
}: {
  titulo: string
  todosActivo: boolean
  seleccionarTodos: () => void
  opciones: { valor: string; etiqueta: string; detalle: string }[]
  valorActivo: string
  seleccionar: (valor: string) => void
}) {
  return (
    <section className="pilot-selector">
      <header><span>FILTRO</span><h3>{titulo}</h3></header>
      <div>
        <button type="button" className={todosActivo ? "active" : ""} onClick={seleccionarTodos}>
          <strong>Todos</strong><small>Vista completa</small>
        </button>
        {opciones.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            className={valorActivo === opcion.valor ? "active" : ""}
            onClick={() => seleccionar(opcion.valor)}
          >
            <strong>{opcion.etiqueta}</strong><small>{opcion.detalle}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

function KpiPiloto({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string
  valor: string
  tono: "cyan" | "magenta" | "verde"
}) {
  return <article className={`pilot-kpi ${tono}`}><span>{etiqueta}</span><strong>{valor}</strong></article>
}

const css = `
  .pilot-shell { --pilot-bg:#090c12; --pilot-panel:#111722; --pilot-line:#26303d; --pilot-text:#f7f9fc; --pilot-muted:#8f9aaa; margin-top:2px; padding:22px; border:1px solid #252d39; border-radius:14px; background:radial-gradient(circle at 8% 0%,#182836 0,transparent 30%),radial-gradient(circle at 100% 10%,#321024 0,transparent 32%),var(--pilot-bg); color:var(--pilot-text); box-shadow:0 18px 40px rgba(32,21,19,.16); }
  .pilot-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
  .pilot-header span,.pilot-selector header span,.pilot-chart header span { color:${CIAN}; font-size:8px; font-weight:950; letter-spacing:1.2px; }
  .pilot-header h2 { margin:4px 0 3px; color:#fff; font-size:25px; }
  .pilot-header p { margin:0; color:var(--pilot-muted); font-size:10px; }
  .pilot-header > button { min-height:36px; padding:0 13px; border:1px solid #354150; border-radius:7px; background:#151c27; color:#dbe4ed; font-size:9px; font-weight:900; cursor:pointer; }
  .pilot-layout { display:grid; grid-template-columns:235px minmax(0,1fr); gap:16px; }
  .pilot-filters { display:grid; align-content:start; gap:12px; min-width:0; }
  .pilot-selector { min-width:0; padding:13px; border:1px solid var(--pilot-line); border-radius:10px; background:rgba(16,22,32,.9); }
  .pilot-selector header { margin-bottom:9px; }
  .pilot-selection-summary { display:block; margin-top:4px; color:#7f8c9c; font-size:8px; }
  .pilot-selector h3,.pilot-chart h3 { margin:2px 0 0; color:#f4f7fb; font-size:13px; }
  .pilot-selector > div { display:grid; gap:6px; max-height:260px; padding-right:4px; overflow-y:auto; scrollbar-color:#3a4858 #111722; scrollbar-width:thin; }
  .pilot-selector button { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:39px; padding:7px 9px; border:1px solid #293441; border-radius:6px; background:#181f2a; color:#cbd4df; text-align:left; cursor:pointer; }
  .pilot-selector button strong { min-width:0; overflow:hidden; font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
  .pilot-selector button small { flex:0 0 auto; color:#778596; font-size:7px; }
  .pilot-selector button:hover { border-color:#497082; }
  .pilot-selector button.active { border-color:${CIAN}; background:linear-gradient(90deg,rgba(25,216,242,.22),rgba(255,22,136,.08)); color:#fff; box-shadow:inset 3px 0 ${CIAN}; }
  .pilot-selector button.active small { color:${CIAN}; }
  .pilot-check-row { display:grid; grid-template-columns:16px minmax(0,1fr); align-items:center; gap:8px; min-height:39px; padding:7px 9px; border:1px solid #293441; border-radius:6px; background:#181f2a; color:#cbd4df; cursor:pointer; }
  .pilot-check-row input { width:14px; height:14px; margin:0; accent-color:${CIAN}; }
  .pilot-check-row > span { min-width:0; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .pilot-check-row strong { min-width:0; color:#dbe4ed; font-size:9px; line-height:1.2; white-space:normal; }
  .pilot-check-row small { flex:0 0 auto; color:#778596; font-size:7px; }
  .pilot-check-row.active { border-color:${CIAN}; background:linear-gradient(90deg,rgba(25,216,242,.18),rgba(255,22,136,.06)); box-shadow:inset 3px 0 ${CIAN}; }
  .pilot-check-row.active small { color:${CIAN}; }
  .pilot-content { min-width:0; }
  .pilot-empty { min-height:360px; display:grid; place-items:center; padding:20px; border:1px dashed #344151; border-radius:10px; color:#8592a3; text-align:center; }
  .pilot-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:9px; margin-bottom:11px; }
  .pilot-kpi { min-width:0; padding:14px; border:1px solid var(--pilot-line); border-top:3px solid #667383; border-radius:8px; background:linear-gradient(145deg,#171e29,#101620); }
  .pilot-kpi.cyan { border-top-color:${CIAN}; }.pilot-kpi.magenta { border-top-color:${MAGENTA}; }.pilot-kpi.verde { border-top-color:#5fff75; }
  .pilot-kpi span { display:block; color:#8996a7; font-size:7px; font-weight:900; letter-spacing:.7px; text-transform:uppercase; }
  .pilot-kpi strong { display:block; margin-top:7px; color:#fff; font-size:clamp(15px,1.55vw,23px); line-height:1.08; letter-spacing:-.2px; white-space:nowrap; }
  .pilot-grid { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(235px,.45fr); gap:11px; }
  .pilot-chart { min-width:0; padding:15px; border:1px solid var(--pilot-line); border-radius:10px; background:rgba(15,21,31,.94); }
  .pilot-chart header { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; margin-bottom:14px; }
  .pilot-legend { display:flex; align-items:center; gap:5px; color:#8996a7; font-size:7px; }
  .pilot-legend i { width:7px; height:7px; border-radius:2px; }.pilot-legend i.cyan { background:${CIAN}; }.pilot-legend i.magenta { background:${MAGENTA}; }
  .pilot-week-bars { height:270px; display:flex; align-items:stretch; gap:5px; padding-top:9px; overflow-x:auto; border-bottom:1px solid #3a4655; scrollbar-width:thin; }
  .pilot-week-bars > div { min-width:27px; flex:1; display:flex; flex-direction:column-reverse; align-items:center; gap:6px; }
  .pilot-week-bars > div > span { color:#748194; font-size:7px; font-weight:850; }
  .pilot-week-bars section { width:100%; height:235px; display:flex; align-items:flex-end; justify-content:center; gap:2px; }
  .pilot-week-bars section i { width:36%; min-height:0; border-radius:3px 3px 0 0; box-shadow:0 0 12px currentColor; }
  .pilot-week-bars i.cyan { background:${CIAN}; color:${CIAN}; }.pilot-week-bars i.magenta { background:${MAGENTA}; color:${MAGENTA}; }
  .pilot-rate { text-align:center; }
  .pilot-rate header { text-align:left; }
  .pilot-donut { width:170px; height:170px; display:grid; place-items:center; margin:21px auto 18px; border-radius:50%; box-shadow:0 0 25px rgba(255,22,136,.14); }
  .pilot-donut > div { width:126px; height:126px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:50%; background:#101620; }
  .pilot-donut strong { color:#fff; font-size:28px; }.pilot-donut span { margin-top:3px; color:#7f8c9c; font-size:8px; }
  .pilot-rate > p { display:inline-flex; padding:5px 9px; border-radius:999px; font-size:8px; font-weight:900; }
  .pilot-rate > p.ok { background:rgba(95,255,117,.12); color:#65f477; }.pilot-rate > p.alert { background:rgba(255,22,136,.12); color:#ff62ad; }
  .pilot-ranking { grid-column:1/-1; }
  .pilot-ranking > div { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:11px 19px; }
  .pilot-ranking section p { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 5px; }
  .pilot-ranking section p strong { min-width:0; overflow:hidden; color:#dfe6ee; font-size:8px; text-overflow:ellipsis; white-space:nowrap; }
  .pilot-ranking section p span { color:${CIAN}; font-size:8px; font-weight:900; }
  .pilot-ranking section > div { height:7px; overflow:hidden; border-radius:999px; background:#26303d; }
  .pilot-ranking section > div i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,${MAGENTA},${CIAN}); }
  .pilot-ranking section small { display:block; margin-top:4px; color:#687587; font-size:7px; }
  @media (max-width:1100px) { .pilot-layout { grid-template-columns:1fr; }.pilot-filters { grid-template-columns:1fr 1fr; }.pilot-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media (max-width:720px) { .pilot-shell { padding:14px; }.pilot-header { flex-direction:column; }.pilot-header > button { align-self:stretch; }.pilot-filters { grid-template-columns:1fr; }.pilot-selector > div { max-height:180px; }.pilot-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); }.pilot-grid { grid-template-columns:1fr; }.pilot-rate,.pilot-ranking { grid-column:1; }.pilot-ranking > div { grid-template-columns:1fr; }.pilot-week-bars { height:220px; }.pilot-week-bars section { height:185px; } }
`
