import { useEffect, useMemo, useState } from "react"

import {
  obtenerCatalogoProductosDevolucionDb,
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
  type ProductoDevolucionDb,
} from "../repositories/devolucionRepository"
import {
  obtenerVentasSemanalesDb,
  type VentaSemanalDb,
} from "../repositories/ventasRepository"

type Props = {
  cambiarPantalla: (pantalla: string) => void
}

type FilaClienteSku = {
  clave: string
  semana: string
  clienteClave: string
  cliente: string
  sku: string
  producto: string
  enviadas: number
  devueltas: number
  valorDevuelto: number
}

type FilaSemana = {
  semana: string
  enviadas: number
  devueltas: number
  valorDevuelto: number
  porcentaje: number | null
  consolidada: boolean
  fechaConsolidacion: string
}

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
  if (!fechaIso) return ""
  const fecha = new Date(`${fechaIso}T12:00:00`)
  const dia = fecha.getDay()
  fecha.setDate(fecha.getDate() - (dia === 0 ? 6 : dia - 1))
  return fechaIsoLocal(fecha)
}

function semanasEntre(desde: string, hasta: string) {
  if (!desde || !hasta || desde > hasta) return []
  const semanas: string[] = []
  let semana = inicioSemana(desde)
  const ultima = inicioSemana(hasta)
  while (semana <= ultima) {
    semanas.push(semana)
    semana = sumarDias(semana, 7)
  }
  return semanas
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function clienteClave(nombre: string) {
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
  return valor || "SIN CLIENTE"
}

function clienteEtiqueta(clave: string, nombre: string) {
  if (clave === "CORPORACION FAVORITA") return "Corporación Favorita"
  if (clave === "MEGA SANTAMARIA") return "Mega Santamaría"
  if (clave === "CORPORACION EL ROSADO") return "Corporación El Rosado"
  if (clave === "TUTI") return "TUTI"
  return nombre || "Sin cliente"
}

function numero(valor: number) {
  return Math.round(valor || 0).toLocaleString("es-EC")
}

function moneda(valor: number) {
  return Number(valor || 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function tasa(devueltas: number, enviadas: number) {
  return enviadas > 0 ? (devueltas / enviadas) * 100 : null
}

function formatoTasa(valor: number | null) {
  return valor === null ? "—" : `${valor.toFixed(1)}%`
}

function fechaCorta(fechaIso: string) {
  if (!fechaIso) return "—"
  const [, mes, dia] = fechaIso.split("-")
  return `${dia}/${mes}`
}

function etiquetaSemana(semana: string) {
  return `${fechaCorta(semana)}–${fechaCorta(sumarDias(semana, 6))}`
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

function etiquetaEjeSemana(fechaIso: string) {
  return String(numeroSemanaIso(fechaIso)).padStart(2, "0")
}

export default function ReporteDevoluciones({ cambiarPantalla }: Props) {
  const [ventas, setVentas] = useState<VentaSemanalDb[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionListadoDb[]>([])
  const [productos, setProductos] = useState<ProductoDevolucionDb[]>([])
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")
  const [cliente, setCliente] = useState("TODOS")
  const [sku, setSku] = useState("TODOS")
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  // La primera carga se ejecuta una sola vez; el botón Actualizar reutiliza la función.
  useEffect(() => {
    void cargarDatos()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarDatos() {
    setCargando(true)
    setError("")
    try {
      const [ventasDb, devolucionesDb, productosDb] = await Promise.all([
        obtenerVentasSemanalesDb(),
        obtenerDevolucionesDb(),
        obtenerCatalogoProductosDevolucionDb(),
      ])
      setVentas(ventasDb)
      setDevoluciones(devolucionesDb)
      setProductos(productosDb)

      if (!fechaDesde || !fechaHasta) {
        const semanas = Array.from(new Set([
          ...ventasDb.map((item) => item.semana_inicio),
          ...devolucionesDb.flatMap((item) =>
            (item.detalles ?? []).map((detalle) => detalle.semana_origen_inicio),
          ),
        ])).filter(Boolean).sort()
        const ultima = semanas.at(-1) ?? ""
        const primera = semanas[Math.max(0, semanas.length - 8)] ?? ultima
        setFechaDesde(primera)
        setFechaHasta(ultima ? sumarDias(ultima, 6) : "")
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el reporte de devoluciones.",
      )
    } finally {
      setCargando(false)
    }
  }

  const filasBase = useMemo(() => {
    const mapa = new Map<string, FilaClienteSku>()

    function obtenerFila(datos: {
      semana: string
      clienteNombre: string
      sku: string
      producto: string
    }) {
      const claveCliente = clienteClave(datos.clienteNombre)
      const codigo = datos.sku.trim()
      const clave = `${datos.semana}|${claveCliente}|${codigo}`
      const existente = mapa.get(clave)
      if (existente) {
        if (!existente.producto && datos.producto) existente.producto = datos.producto
        return existente
      }

      const fila: FilaClienteSku = {
        clave,
        semana: datos.semana,
        clienteClave: claveCliente,
        cliente: clienteEtiqueta(claveCliente, datos.clienteNombre),
        sku: codigo,
        producto: datos.producto || codigo,
        enviadas: 0,
        devueltas: 0,
        valorDevuelto: 0,
      }
      mapa.set(clave, fila)
      return fila
    }

    ventas.forEach((venta) => {
      if (!venta.semana_inicio || !venta.sku) return
      const fila = obtenerFila({
        semana: venta.semana_inicio,
        clienteNombre: venta.cliente_nombre,
        sku: venta.sku,
        producto: venta.producto_nombre,
      })
      fila.enviadas += Number(venta.unidades ?? 0)
    })

    devoluciones.forEach((devolucion) => {
      const nombreCliente = devolucion.cliente?.nombre ?? "Sin cliente"
      ;(devolucion.detalles ?? []).forEach((detalle) => {
        const semana = detalle.semana_origen_inicio
        const codigo = detalle.producto?.codigo ?? detalle.sku_documento ?? ""
        if (!codigo || !semana) return
        const fila = obtenerFila({
          semana,
          clienteNombre: nombreCliente,
          sku: codigo,
          producto:
            detalle.producto?.corto ??
            detalle.producto_nombre_documento ??
            codigo,
        })
        fila.devueltas += Number(detalle.unidades ?? 0)
        fila.valorDevuelto += Number(detalle.valor_total_documento ?? 0)
      })
    })

    return Array.from(mapa.values())
  }, [ventas, devoluciones])

  const semanaDesde = inicioSemana(fechaDesde)
  const semanaHasta = inicioSemana(fechaHasta)
  const filasPeriodo = useMemo(
    () => filasBase.filter((fila) =>
      (!semanaDesde || fila.semana >= semanaDesde) &&
      (!semanaHasta || fila.semana <= semanaHasta)),
    [filasBase, semanaDesde, semanaHasta],
  )

  const clientes = useMemo(() => {
    const mapa = new Map<string, string>()
    filasPeriodo.forEach((fila) => mapa.set(fila.clienteClave, fila.cliente))
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [filasPeriodo])

  const skus = useMemo(() => {
    const mapa = new Map<string, string>()
    filasPeriodo
      .filter((fila) => cliente === "TODOS" || fila.clienteClave === cliente)
      .forEach((fila) => mapa.set(fila.sku, fila.producto))
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [filasPeriodo, cliente])

  useEffect(() => {
    if (cliente !== "TODOS" && !clientes.some(([clave]) => clave === cliente)) {
      setCliente("TODOS")
    }
  }, [cliente, clientes])

  useEffect(() => {
    if (sku !== "TODOS" && !skus.some(([codigo]) => codigo === sku)) {
      setSku("TODOS")
    }
  }, [sku, skus])

  const filasFiltradas = useMemo(
    () => filasPeriodo.filter((fila) =>
      (cliente === "TODOS" || fila.clienteClave === cliente) &&
      (sku === "TODOS" || fila.sku === sku)),
    [filasPeriodo, cliente, sku],
  )

  const desfaseMaximoSemanas = useMemo(() => {
    const codigos = new Set(filasFiltradas.map((fila) => fila.sku.trim()))
    const desfases = productos
      .filter((producto) => codigos.has(producto.codigo.trim()))
      .map((producto) => Math.max(
        0,
        Math.round(Math.max(1, Number(producto.vida_util_dias ?? 0) - 2) / 7),
      ))

    return desfases.length > 0 ? Math.max(...desfases) : 4
  }, [filasFiltradas, productos])

  const fechaHoy = fechaIsoLocal(new Date())

  const resumenSemanal = useMemo<FilaSemana[]>(() => {
    const mapa = new Map<string, Omit<FilaSemana, "porcentaje">>()
    semanasEntre(fechaDesde, fechaHasta).forEach((semana) => {
      const fechaConsolidacion = sumarDias(
        semana,
        desfaseMaximoSemanas * 7 + 6,
      )
      mapa.set(semana, {
        semana,
        enviadas: 0,
        devueltas: 0,
        valorDevuelto: 0,
        consolidada: fechaConsolidacion <= fechaHoy,
        fechaConsolidacion,
      })
    })
    filasFiltradas.forEach((fila) => {
      const actual = mapa.get(fila.semana)
      if (!actual) return
      actual.enviadas += fila.enviadas
      actual.devueltas += fila.devueltas
      actual.valorDevuelto += fila.valorDevuelto
    })
    return Array.from(mapa.values()).map((fila) => ({
      ...fila,
      porcentaje: tasa(fila.devueltas, fila.enviadas),
    }))
  }, [
    filasFiltradas,
    fechaDesde,
    fechaHasta,
    desfaseMaximoSemanas,
    fechaHoy,
  ])

  const resumenClienteSku = useMemo(() => {
    const mapa = new Map<string, Omit<FilaClienteSku, "clave" | "semana"> & {
      enviadasConsolidadas: number
      devueltasConsolidadas: number
    }>()
    filasFiltradas.forEach((fila) => {
      const clave = `${fila.clienteClave}|${fila.sku}`
      const actual = mapa.get(clave) ?? {
        clienteClave: fila.clienteClave,
        cliente: fila.cliente,
        sku: fila.sku,
        producto: fila.producto,
        enviadas: 0,
        devueltas: 0,
        valorDevuelto: 0,
        enviadasConsolidadas: 0,
        devueltasConsolidadas: 0,
      }
      actual.enviadas += fila.enviadas
      actual.devueltas += fila.devueltas
      actual.valorDevuelto += fila.valorDevuelto
      const fechaConsolidacion = sumarDias(
        fila.semana,
        desfaseMaximoSemanas * 7 + 6,
      )
      if (fechaConsolidacion <= fechaHoy) {
        actual.enviadasConsolidadas += fila.enviadas
        actual.devueltasConsolidadas += fila.devueltas
      }
      mapa.set(clave, actual)
    })
    return Array.from(mapa.entries())
      .map(([clave, fila]) => ({
        ...fila,
        clave,
        porcentaje: tasa(
          fila.devueltasConsolidadas,
          fila.enviadasConsolidadas,
        ),
      }))
      .filter((fila) => fila.devueltas > 0)
      .sort((a, b) => b.devueltas - a.devueltas || b.enviadas - a.enviadas)
  }, [filasFiltradas, desfaseMaximoSemanas, fechaHoy])

  const totalEnviadas = resumenSemanal.reduce((total, fila) => total + fila.enviadas, 0)
  const totalDevueltas = resumenSemanal.reduce((total, fila) => total + fila.devueltas, 0)
  const totalValor = resumenSemanal.reduce((total, fila) => total + fila.valorDevuelto, 0)
  const semanasConsolidadas = resumenSemanal.filter((fila) => fila.consolidada)
  const semanasPendientes = resumenSemanal.filter((fila) => !fila.consolidada)
  const enviadasConsolidadas = semanasConsolidadas.reduce(
    (total, fila) => total + fila.enviadas,
    0,
  )
  const devueltasConsolidadas = semanasConsolidadas.reduce(
    (total, fila) => total + fila.devueltas,
    0,
  )
  const porcentajeTotal = tasa(devueltasConsolidadas, enviadasConsolidadas)

  function exportarCsv() {
    const filas = [
      ["Cliente", "SKU", "Producto", "Unidades enviadas", "Unidades devueltas", "% devolución consolidada", "Valor devuelto"],
      ...resumenClienteSku.map((fila) => [
        fila.cliente,
        fila.sku,
        fila.producto,
        fila.enviadas,
        fila.devueltas,
        formatoTasa(fila.porcentaje),
        fila.valorDevuelto.toFixed(2),
      ]),
    ]
    const contenido = filas.map((fila) => fila.map((valor) =>
      `"${String(valor).replaceAll('"', '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([`\uFEFF${contenido}`], {
      type: "text/csv;charset=utf-8",
    }))
    const enlace = document.createElement("a")
    enlace.href = url
    enlace.download = `devoluciones-${fechaDesde}-${fechaHasta}.csv`
    enlace.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="returns-report">
      <style>{css}</style>

      <header className="returns-header">
        <div>
          <span>REPORTES · DEVOLUCIONES</span>
          <h1>Análisis de devoluciones</h1>
          <p>Compara cada devolución con las ventas de su semana estimada de despacho, calculada según la vida útil del SKU.</p>
        </div>
        <button type="button" onClick={cargarDatos} disabled={cargando}>
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      <nav className="returns-tabs" aria-label="Módulos de ventas">
        <button type="button" onClick={() => cambiarPantalla("Ventas")}>Ventas</button>
        <button type="button" className="active">Devoluciones</button>
        <button type="button" onClick={() => cambiarPantalla("Descuentos y promociones")}>Descuentos y promociones</button>
      </nav>

      {error && <div className="returns-error">{error}</div>}

      <section className="returns-panel filters">
        <div className="panel-heading">
          <div><h2>Filtros</h2><p>El rango corresponde a la semana estimada de despacho, de lunes a domingo.</p></div>
          <button type="button" className="secondary" onClick={exportarCsv} disabled={resumenClienteSku.length === 0}>Exportar CSV</button>
        </div>
        <div className="filter-grid">
          <label>Desde<input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} /></label>
          <label>Cliente<select value={cliente} onChange={(e) => { setCliente(e.target.value); setSku("TODOS") }}><option value="TODOS">Todos los clientes</option>{clientes.map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}</select></label>
          <label>SKU<select value={sku} onChange={(e) => setSku(e.target.value)}><option value="TODOS">Todos los SKU</option>{skus.map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre} · {codigo}</option>)}</select></label>
        </div>
      </section>

      <section className="returns-kpis">
        <Kpi titulo="Unidades enviadas" valor={`${numero(totalEnviadas)} Unid.`} detalle="Ventas de las semanas de origen" />
        <Kpi titulo="Unidades devueltas" valor={`${numero(totalDevueltas)} Unid.`} detalle="Atribuidas por vida útil" />
        <Kpi titulo="Porcentaje consolidado" valor={formatoTasa(porcentajeTotal)} detalle={porcentajeTotal === null ? "Sin semanas completas para comparar" : porcentajeTotal <= 8 ? "Solo semanas completas · meta ≤ 8%" : "Solo semanas completas · sobre 8%"} estado={porcentajeTotal === null ? "neutral" : porcentajeTotal <= 8 ? "good" : "bad"} />
        <Kpi titulo="Semanas pendientes" valor={`${semanasPendientes.length}`} detalle={`En azul · desfase máximo ${desfaseMaximoSemanas} semanas`} estado="pending" />
        <Kpi titulo="Valor devuelto" valor={moneda(totalValor)} detalle="Según notas de crédito" />
      </section>

      <section className="returns-panel">
        <div className="panel-heading"><div><h2>Evolución por semana de despacho</h2><p>Rojo: devolución consolidada. Azul: todavía pueden llegar devoluciones.</p></div></div>
        {cargando ? <div className="empty">Calculando reporte…</div> : <GraficoUnidades datos={resumenSemanal} />}
      </section>

      <section className="returns-charts-grid">
        <article className="returns-panel">
          <div className="panel-heading"><div><h2>Porcentaje semanal</h2><p>Los puntos azules son provisionales y no deben interpretarse como resultado final.</p></div></div>
          <GraficoPorcentaje datos={resumenSemanal} />
        </article>
        <article className="returns-panel">
          <div className="panel-heading"><div><h2>Cliente × SKU</h2><p>Principales devoluciones del periodo.</p></div></div>
          <GraficoClienteSku datos={resumenClienteSku.slice(0, 12)} />
        </article>
      </section>

      <section className="returns-panel">
        <div className="panel-heading"><div><h2>Detalle semanal</h2><p>Vida útil 21 días: aproximadamente 3 semanas atrás. Vida útil 30 días: aproximadamente 4 semanas atrás. En ambos casos se consideran 2 días de retiro anticipado.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Semana estimada de despacho</th><th>Estado</th><th>Enviadas</th><th>Devueltas atribuidas</th><th>% devolución</th><th>Valor devuelto</th></tr></thead><tbody>{resumenSemanal.map((fila) => <tr key={fila.semana} className={fila.consolidada ? "" : "pending-row"}><td>{etiquetaSemana(fila.semana)}</td><td><EstadoSemana fila={fila} /></td><td>{numero(fila.enviadas)}</td><td>{numero(fila.devueltas)}</td><td><Tasa valor={fila.porcentaje} pendiente={!fila.consolidada} /></td><td>{moneda(fila.valorDevuelto)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="returns-panel">
        <div className="panel-heading"><div><h2>Devoluciones por cliente y SKU</h2><p>Atribuidas a su semana estimada de despacho y ordenadas desde la mayor cantidad.</p></div></div>
        {resumenClienteSku.length === 0 ? <div className="empty">No existen movimientos para este filtro.</div> : <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>SKU</th><th>Producto</th><th>Enviadas</th><th>Devueltas</th><th>% devolución</th><th>Valor</th></tr></thead><tbody>{resumenClienteSku.map((fila) => <tr key={fila.clave}><td><strong>{fila.cliente}</strong></td><td>{fila.sku}</td><td>{fila.producto}</td><td>{numero(fila.enviadas)}</td><td><strong>{numero(fila.devueltas)}</strong></td><td><Tasa valor={fila.porcentaje} /></td><td>{moneda(fila.valorDevuelto)}</td></tr>)}</tbody></table></div>}
      </section>
    </main>
  )
}

function Kpi({ titulo, valor, detalle, estado = "neutral" }: { titulo: string; valor: string; detalle: string; estado?: "neutral" | "good" | "bad" | "pending" }) {
  return <article className={`returns-kpi ${estado}`}><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>
}

function Tasa({ valor, pendiente = false }: { valor: number | null; pendiente?: boolean }) {
  const estado = pendiente ? "pending" : valor === null ? "neutral" : valor <= 8 ? "good" : "bad"
  return <strong className={`rate-badge ${estado}`}>{formatoTasa(valor)}</strong>
}

function EstadoSemana({ fila }: { fila: FilaSemana }) {
  return fila.consolidada
    ? <span className="status-badge complete">Consolidada</span>
    : <span className="status-badge pending">Pendiente hasta {fechaCorta(fila.fechaConsolidacion)}</span>
}

function GraficoUnidades({ datos }: { datos: FilaSemana[] }) {
  if (datos.length === 0) return <div className="empty">No existen semanas para graficar.</div>
  const ancho = 960, alto = 300, izquierda = 62, derecha = 24, arriba = 24, abajo = 52
  const w = ancho - izquierda - derecha, h = alto - arriba - abajo
  const maximo = Math.max(1, ...datos.flatMap((fila) => [fila.enviadas, fila.devueltas]))
  const x = (i: number) => izquierda + (datos.length === 1 ? w / 2 : i / (datos.length - 1) * w)
  const y = (v: number) => arriba + h - v / maximo * h
  const ruta = (campo: "enviadas" | "devueltas") => datos.map((fila, i) => `${i ? "L" : "M"}${x(i)},${y(fila[campo])}`).join(" ")
  return <div className="svg-wrap"><svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Unidades enviadas y devueltas por semana">{[0,.25,.5,.75,1].map(t => <g key={t}><line x1={izquierda} x2={ancho-derecha} y1={y(maximo*t)} y2={y(maximo*t)} className="grid-line"/><text x={izquierda-9} y={y(maximo*t)+4} textAnchor="end" className="axis">{numero(maximo*t)}</text></g>)}<path d={ruta("enviadas")} className="line sent"/>{datos.slice(1).map((fila,indice)=>{const anterior=datos[indice];const pendiente=!fila.consolidada||!anterior.consolidada;return <line key={`r-${fila.semana}`} x1={x(indice)} y1={y(anterior.devueltas)} x2={x(indice+1)} y2={y(fila.devueltas)} className={`return-segment ${pendiente?"pending":"complete"}`}/>})}{datos.map((fila,i)=><g key={fila.semana}><circle cx={x(i)} cy={y(fila.enviadas)} r="4" className="dot sent"><title>{`${etiquetaSemana(fila.semana)}: ${numero(fila.enviadas)} enviadas`}</title></circle><circle cx={x(i)} cy={y(fila.devueltas)} r="4" className={`dot returned ${fila.consolidada?"complete":"pending"}`}><title>{`${etiquetaSemana(fila.semana)}: ${numero(fila.devueltas)} devueltas · ${fila.consolidada?"consolidada":"todavía pueden llegar devoluciones"}`}</title></circle><text x={x(i)} y={alto-18} textAnchor="middle" className="axis">{etiquetaEjeSemana(fila.semana)}</text></g>)}</svg><div className="legend"><span className="sent">● Enviadas</span><span className="returned">● Devolución consolidada</span><span className="pending">● Devolución pendiente</span></div></div>
}

function GraficoPorcentaje({ datos }: { datos: FilaSemana[] }) {
  if (datos.length === 0) return <div className="empty">No existen semanas para graficar.</div>
  const ancho = 680, alto = 290, izquierda = 52, derecha = 24, arriba = 24, abajo = 52
  const w = ancho-izquierda-derecha, h=alto-arriba-abajo
  const valores = datos.map(f => f.porcentaje ?? 0)
  const maximo = Math.max(10, ...valores)
  const x=(i:number)=>izquierda+(datos.length===1?w/2:i/(datos.length-1)*w)
  const y=(v:number)=>arriba+h-v/maximo*h
  return <div className="svg-wrap"><svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Porcentaje semanal de devoluciones">{[0,.25,.5,.75,1].map(t=><g key={t}><line x1={izquierda} x2={ancho-derecha} y1={y(maximo*t)} y2={y(maximo*t)} className="grid-line"/><text x={izquierda-8} y={y(maximo*t)+4} textAnchor="end" className="axis">{(maximo*t).toFixed(1)}%</text></g>)}<line x1={izquierda} x2={ancho-derecha} y1={y(8)} y2={y(8)} className="target-line"/>{datos.slice(1).map((fila,indice)=>{const anterior=datos[indice];if(fila.porcentaje===null||anterior.porcentaje===null)return null;const pendiente=!fila.consolidada||!anterior.consolidada;return <line key={`t-${fila.semana}`} x1={x(indice)} y1={y(anterior.porcentaje)} x2={x(indice+1)} y2={y(fila.porcentaje)} className={`rate-segment ${pendiente?"pending":"complete"}`}/>})}{datos.map((f,i)=><g key={f.semana}>{f.porcentaje !== null && <circle cx={x(i)} cy={y(f.porcentaje)} r="4" className={`dot rate ${!f.consolidada?"pending":f.porcentaje<=8?"good":"bad"}`}><title>{`${etiquetaSemana(f.semana)}: ${formatoTasa(f.porcentaje)} · ${f.consolidada?"consolidada":"provisional"}`}</title></circle>}<text x={x(i)} y={alto-18} textAnchor="middle" className="axis">{etiquetaEjeSemana(f.semana)}</text></g>)}</svg><div className="legend"><span className="rate">● % consolidado</span><span className="pending">● % provisional</span><span className="target">— Meta 8%</span></div></div>
}

function GraficoClienteSku({ datos }: { datos: Array<{ clave: string; cliente: string; producto: string; devueltas: number; porcentaje: number | null }> }) {
  if (datos.length === 0) return <div className="empty">No existen devoluciones para graficar.</div>
  const ancho=720, alto=Math.max(250,datos.length*38+38), izquierda=230, derecha=70, arriba=16, abajo=24
  const w=ancho-izquierda-derecha, paso=(alto-arriba-abajo)/datos.length, maximo=Math.max(1,...datos.map(f=>f.devueltas))
  return <div className="svg-wrap bars"><svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Devoluciones por cliente y SKU">{datos.map((fila,i)=>{const y=arriba+i*paso+5, bw=fila.devueltas/maximo*w; const etiqueta=`${fila.cliente} · ${fila.producto}`; return <g key={fila.clave}><text x={izquierda-10} y={y+14} textAnchor="end" className="bar-label">{etiqueta.length>31?`${etiqueta.slice(0,29)}…`:etiqueta}</text><rect x={izquierda} y={y} width={Math.max(2,bw)} height={20} rx="4" className={`bar ${(fila.porcentaje??0)<=8?"good":"bad"}`}><title>{`${etiqueta}: ${numero(fila.devueltas)} Unid. · ${formatoTasa(fila.porcentaje)}`}</title></rect><text x={Math.min(ancho-derecha+8,izquierda+bw+7)} y={y+14} className="bar-value">{numero(fila.devueltas)}</text></g>})}</svg></div>
}

const css = `
  .returns-report{width:100%;box-sizing:border-box;padding:20px 24px;color:#25272b}.returns-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:16px}.returns-header span{color:#8f1d24;font-size:11px;font-weight:950;letter-spacing:1px}.returns-header h1{margin:5px 0 4px;font-size:32px}.returns-header p,.panel-heading p{margin:0;color:#756b67;font-size:12px}.returns-header>button,.secondary{padding:10px 16px;border:1px solid #8f1d24;border-radius:8px;background:#fff;color:#8f1d24;font-weight:800;cursor:pointer}.returns-tabs{display:flex;gap:5px;margin-bottom:18px;padding:5px;border-radius:10px;background:#e7e9ee}.returns-tabs button{padding:10px 22px;border:0;border-radius:8px;background:transparent;color:#687082;font-weight:800;cursor:pointer}.returns-tabs button.active{background:#9f1f27;color:#fff}.returns-panel{box-sizing:border-box;margin-bottom:18px;padding:20px;border:1px solid #eadfd9;border-radius:14px;background:#fff;box-shadow:0 5px 18px rgba(72,42,32,.045)}.panel-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;margin-bottom:15px}.panel-heading h2{margin:0 0 4px;color:#4f2728;font-size:20px}.filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.filter-grid label{font-size:11px;font-weight:800;color:#655853}.filter-grid input,.filter-grid select{display:block;width:100%;min-height:42px;box-sizing:border-box;margin-top:6px;padding:9px 10px;border:1px solid #d8ccc6;border-radius:8px;background:#fff}.returns-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:18px}.returns-kpi{padding:16px;border:1px solid #eadfd9;border-top:4px solid #8f1d24;border-radius:12px;background:#fff}.returns-kpi.good{border-top-color:#159447}.returns-kpi.bad{border-top-color:#c82f3b}.returns-kpi.pending{border-top-color:#2563eb}.returns-kpi span{display:block;color:#756b67;font-size:10px;font-weight:900;text-transform:uppercase}.returns-kpi strong{display:block;margin:8px 0 4px;color:#4f2728;font-size:23px}.returns-kpi small{color:#897c77;font-size:10px}.returns-charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.svg-wrap{width:100%;overflow-x:auto}.svg-wrap svg{display:block;width:100%;min-width:560px}.grid-line{stroke:#eadfd9;stroke-width:1}.axis,.bar-label,.bar-value{fill:#7d716c;font-size:10px}.line{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.line.sent{stroke:#f7931e}.return-segment,.rate-segment{stroke-width:3;stroke-linecap:round}.return-segment.complete,.rate-segment.complete{stroke:#8f1d24}.return-segment.pending,.rate-segment.pending{stroke:#2563eb;stroke-dasharray:7 5}.dot{stroke:#fff;stroke-width:2}.dot.sent{fill:#f7931e}.dot.returned.complete{fill:#8f1d24}.dot.returned.pending,.dot.rate.pending{fill:#2563eb}.dot.rate.good{fill:#159447}.dot.rate.bad{fill:#c82f3b}.target-line{stroke:#159447;stroke-width:1.5;stroke-dasharray:6 5}.legend{display:flex;flex-wrap:wrap;justify-content:center;gap:20px;margin-top:7px;font-size:11px;font-weight:800}.legend .sent{color:#f7931e}.legend .returned,.legend .rate{color:#8f1d24}.legend .pending{color:#2563eb}.legend .target{color:#159447}.bar{fill:#8f1d24}.bar.good{fill:#159447}.bar.bad{fill:#c82f3b}.bar-value{font-weight:800}.table-wrap{overflow:auto;border:1px solid #eee4df;border-radius:9px}.table-wrap table{width:100%;border-collapse:collapse}.table-wrap th{padding:10px;background:#f6f1ee;color:#6b5e58;font-size:9px;text-align:left;text-transform:uppercase}.table-wrap td{padding:10px;border-top:1px solid #eee6e2;color:#4f4541;font-size:11px}.table-wrap th:nth-child(n+3),.table-wrap td:nth-child(n+3){text-align:right}.pending-row{background:#f4f8ff}.rate-badge,.status-badge{display:inline-block;min-width:55px;padding:4px 7px;border-radius:999px;text-align:center}.rate-badge.good,.status-badge.complete{background:#e2f7e9;color:#16733a}.rate-badge.bad{background:#fde8e8;color:#b12632}.rate-badge.neutral{background:#f0eeec;color:#716762}.rate-badge.pending,.status-badge.pending{background:#e7efff;color:#1d4ed8}.status-badge{min-width:82px;font-size:9px;font-weight:800}.empty{padding:25px;text-align:center;color:#81746e}.returns-error{margin-bottom:14px;padding:12px;border-radius:8px;background:#fde8e8;color:#a51f2a;font-weight:750}
  @media(max-width:1000px){.filter-grid,.returns-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.returns-charts-grid{grid-template-columns:1fr}}
  @media(max-width:650px){.returns-report{padding:14px}.returns-header{flex-direction:column}.returns-header h1{font-size:25px}.returns-tabs{flex-wrap:wrap}.returns-tabs button{flex:1 1 120px}.filter-grid,.returns-kpis{grid-template-columns:1fr}.panel-heading{flex-direction:column}.secondary{width:100%}}
`
