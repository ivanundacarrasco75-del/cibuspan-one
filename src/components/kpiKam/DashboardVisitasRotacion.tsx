import { useEffect, useMemo, useState } from "react"
import { obtenerDashboardVisitasRotacion, type DatosDashboardCampo } from "../../repositories/dashboardVisitasRotacionRepository"
import {
  fechaHoyCampoDashboard, INDICADORES_CAMPO, resumirSemanasCampo, semanasDashboardCampo, variacionSemanalCampo,
  type IndicadorCampo, type OrigenVisitaCampo, type SerieSkuCampo, type SemanaCampo,
} from "../../utils/dashboardVisitasRotacion"
import "./DashboardVisitasRotacion.css"
import { FotosCampo, UbicacionCampo } from "./UbicacionCampo"

const VACIO: DatosDashboardCampo = { clientes: [], locales: [], productos: [], registros: [] }
const COLORES = ["#64748b", "#a78bfa", "#38bdf8", "#fb923c", "#22d3ee"]
const numero = (valor: number | null) => valor === null ? "—" : valor.toLocaleString("es-EC", { maximumFractionDigits: 2 })
const fecha = (valor: string) => `${valor.slice(8, 10)}/${valor.slice(5, 7)}`
const nombreCorto = (nombre: string) => nombre.replace(/^PANGOL[IÍ]N\s+/i, "")

export default function DashboardVisitasRotacion({ revision }: { revision: unknown }) {
  const [hoy] = useState(() => fechaHoyCampoDashboard())
  const [referencia, setReferencia] = useState(hoy)
  const [clienteId, setClienteId] = useState("")
  const [localId, setLocalId] = useState("")
  const [indicador, setIndicador] = useState<IndicadorCampo>("rotacion")
  const [origen, setOrigen] = useState<OrigenVisitaCampo>("TODOS")
  const [datos, setDatos] = useState(VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [actualizacion, setActualizacion] = useState(0)
  const ventana = useMemo(() => {
    try {
      const semanas = semanasDashboardCampo(referencia)
      if (referencia > hoy) throw new Error("Selecciona una semana hasta el día de hoy.")
      return { semanas, error: "" }
    } catch (err) { return { semanas: [], error: err instanceof Error ? err.message : "Revisa la fecha." } }
  }, [referencia, hoy])
  const desde = ventana.semanas[0]?.desde ?? "", hasta = ventana.semanas[4]?.hasta ?? ""
  const corte = hasta > hoy ? hoy : hasta
  useEffect(() => {
    let vigente = true
    if (!desde || !hasta) { setCargando(false); return }
    setCargando(true); setError("")
    void obtenerDashboardVisitasRotacion(clienteId, desde, corte).then((respuesta) => {
      if (vigente) setDatos(respuesta)
    }).catch((err) => {
      if (vigente) setError(err instanceof Error ? err.message : "No se pudieron cargar las visitas.")
    }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [clienteId, desde, hasta, corte, revision, actualizacion])
  const config = INDICADORES_CAMPO.find((item) => item.id === indicador)!
  const unidadCambio = config.unidad === "%" ? "puntos porcentuales" : config.unidad
  const series = useMemo(() => resumirSemanasCampo({ registros: datos.registros, productos: datos.productos, semanas: ventana.semanas, indicador, clienteId, localId, origen }), [datos, ventana.semanas, indicador, clienteId, localId, origen])
  const esActual = ventana.semanas.length > 0 && hoy >= desde && hoy >= ventana.semanas[4].desde && hoy <= hasta
  const semanas = ventana.semanas.map((s, i) => ({ ...s, etiqueta: i === 4 ? esActual ? "Esta semana · en curso" : "Semana seleccionada" : s.etiqueta }))
  const medidos = series.filter((s) => s.semanas[4]?.valor !== null && s.semanas[4]?.valor !== undefined)
  const comparables = series.filter((s) => s.semanas[4]?.valor != null && s.semanas[3]?.valor != null)
  const revisiones = datos.registros.filter((r) => r.fecha >= (semanas[4]?.desde ?? "9999") && (!localId || r.local_id === localId) && (origen === "TODOS" || r.responsable_rol === origen))
  const clientesTexto = datos.clientes.find((c) => c.id === clienteId)?.nombre ?? "Todos los clientes"
  const localTexto = datos.locales.find((l) => l.id === localId)?.nombre ?? "Todos los locales"
  function restablecer() { setClienteId(""); setLocalId(""); setIndicador("rotacion"); setOrigen("TODOS"); setReferencia(hoy) }
  function descargar() {
    const celda = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`
    const encabezado = ["Cliente", "Local", "SKU", "Producto", "Indicador", "Unidad", ...semanas.flatMap((s) => [`${s.desde} a ${s.hasta}`, "Locales con dato", "Última revisión"])]
    const filas = series.map((s) => [clientesTexto, localTexto, s.codigo, s.nombre, config.nombre, config.unidad, ...s.semanas.flatMap((p) => [p.valor, p.locales_con_dato, p.ultima_fecha])])
    const contenido = "\uFEFF" + [encabezado, ...filas].map((fila) => fila.map(celda).join(";")).join("\r\n")
    const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" })), enlace = document.createElement("a")
    enlace.href = url; enlace.download = `visitas_${indicador}_${corte}.csv`; enlace.click(); URL.revokeObjectURL(url)
  }
  return <section className="vr-dashboard">
    <header className="vr-header"><div><span>DASHBOARD · VISITAS Y ROTACIÓN</span><h2>Evolución en punto de venta</h2><p>{desde && `${fecha(desde)} – ${fecha(corte)} · `}{esActual ? "Esta semana" : "Semana seleccionada"} y las cuatro anteriores, SKU por SKU.</p></div><button type="button" onClick={restablecer}>Restablecer filtros</button></header>
    <div className="vr-filtros">
      <label><span>Cliente</span><select value={clienteId} disabled={cargando} onChange={(e) => { setClienteId(e.target.value); setLocalId("") }}><option value="">Todos los clientes</option>{datos.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label><span>Local</span><select value={localId} disabled={cargando} onChange={(e) => setLocalId(e.target.value)}><option value="">Todos los locales</option>{datos.locales.map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.nombre}</option>)}</select></label>
      <label><span>Indicador</span><select value={indicador} onChange={(e) => setIndicador(e.target.value as IndicadorCampo)}>{INDICADORES_CAMPO.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label>
      <label><span>Tipo de visita</span><select value={origen} onChange={(e) => setOrigen(e.target.value as OrigenVisitaCampo)}><option value="TODOS">Todas las visitas</option><option value="MERCADERISTA">Mercaderista</option><option value="KAM">KAM</option></select></label>
      <label><span>Semana de referencia</span><input type="date" max={hoy} value={referencia} onChange={(e) => setReferencia(e.target.value)} /></label>
      <button type="button" disabled={cargando || !!ventana.error} onClick={() => setActualizacion((v) => v + 1)}>Actualizar</button>
    </div>
    {(ventana.error || error) && <div className="vr-error" role="alert">{ventana.error || error}</div>}
    {cargando && <p className="vr-estado" role="status">Cargando las cinco semanas de visitas…</p>}
    {!cargando && !ventana.error && !error && <>
      <div className="vr-contexto"><span>{clientesTexto} / {localTexto}</span><span>{config.nombre} · {config.unidad}</span></div>
      <div className="vr-cards">
        <article><span>SKU con dato {esActual ? "esta semana" : "en la semana seleccionada"}</span><strong>{medidos.length} / {series.length}</strong><small>Para {config.nombre.toLowerCase()}</small></article>
        <article><span>Locales revisados</span><strong>{new Set(revisiones.map((r) => r.local_id)).size}</strong><small>Semana de referencia</small></article>
        <article><span>SKU comparables</span><strong>{comparables.length}</strong><small>Con dato en las dos últimas semanas</small></article>
        <article><span>Última visita</span><strong>{revisiones.length ? fecha(revisiones.map((r) => r.fecha).sort().at(-1)!) : "—"}</strong><small>{esActual ? "Semana en curso" : "Semana seleccionada"}</small></article>
      </div>
      <section className="vr-chart-panel">
        <header><div><h3>{config.nombre} por SKU</h3><p>{config.descripcion}</p></div><button type="button" onClick={descargar} disabled={!series.length}>Descargar datos</button></header>
        <div className="vr-leyenda">{semanas.map((s, i) => <span key={s.desde}><i style={{ background: COLORES[i] }} /><span>{s.etiqueta}<small>{fecha(s.desde)} – {fecha(s.hasta)}</small></span></span>)}</div>
        {series.length > 0 && !series.some((s) => s.semanas.some((p) => p.valor !== null)) && <p className="vr-estado">No hay mediciones de {config.nombre.toLowerCase()} para estos filtros en las cinco semanas.</p>}
        {!series.length ? <p className="vr-estado">No hay SKU disponibles para este cliente.</p> : <GraficoSku series={series} semanas={semanas} unidad={config.unidad} />}
        <p className="vr-nota">Cada barra usa la última revisión de ese SKU en cada local y semana. “Sin dato” significa que falta una medición; cero es un valor registrado. Al cambiar el número de locales revisados, la comparación puede variar por cobertura.{esActual && " La semana actual aún está en curso."}</p>
        {origen !== "TODOS" && <p className="vr-nota">El tipo de visita usa el rol registrado al guardar. Las visitas antiguas sin rol identificado aparecen en “Todas las visitas”.</p>}
      </section>
      <section className="vr-tabla-panel"><h3>Comparación de las cinco semanas</h3><p>{config.unidad} · Debajo de cada valor: locales con dato / locales revisados.</p><div className="vr-tabla-scroll"><table><thead><tr><th>SKU</th>{semanas.map((s) => <th key={s.desde}>{s.etiqueta}<small>{fecha(s.desde)} – {fecha(s.hasta)}</small></th>)}<th>Variación vs anterior</th></tr></thead><tbody>{series.map((s) => {
        const cambio = variacionSemanalCampo(s.semanas[4], s.semanas[3])
        const distinto = s.semanas[4].locales_con_dato !== s.semanas[3].locales_con_dato
        return <tr key={s.id}><th>{nombreCorto(s.nombre)}<small>{s.codigo}</small></th>{s.semanas.map((p, i) => <td key={i} className={i === 4 ? "vr-actual" : ""}>{p.valor === null ? "Sin dato" : numero(p.valor)}<small>{p.locales_con_dato} / {p.locales_revisados} locales{p.ultima_fecha && ` · ${fecha(p.ultima_fecha)}`}</small></td>)}<td>{!cambio ? "—" : `${cambio.diferencia > 0 ? "+" : ""}${numero(cambio.diferencia)} ${unidadCambio}`}<small>{cambio?.porcentaje != null ? `${cambio.porcentaje > 0 ? "+" : ""}${numero(cambio.porcentaje)}%` : cambio ? "Base anterior cero" : "Falta dato comparable"}{cambio && distinto && " · Cobertura distinta"}</small></td></tr>
      })}</tbody></table></div></section>
      <details className="vr-revisiones"><summary>Ver registros de visitas de la semana seleccionada ({revisiones.length})</summary><div className="vr-tabla-scroll"><table><thead><tr><th>Fecha</th><th>Local</th><th>SKU</th><th>Tipo de visita</th><th>{config.nombre}</th><th>Evidencia</th></tr></thead><tbody>{[...revisiones].sort((a, b) => b.visitado_en.localeCompare(a.visitado_en)).map((r) => <tr key={r.id}><td>{r.fecha}</td><td>{r.local_nombre}</td><td>{r.producto_nombre}</td><td>{r.responsable_rol ?? "Sin identificar"}</td><td>{numero(r.valores[indicador])} {config.unidad}</td><td><details><summary>Ubicación y fotos</summary><UbicacionCampo dato={r.georreferencia} /><FotosCampo fotos={r.fotos_georreferencia} /></details></td></tr>)}</tbody></table></div></details>
    </>}
  </section>
}

function GraficoSku({ series, semanas, unidad }: { series: SerieSkuCampo[]; semanas: SemanaCampo[]; unidad: string }) {
  const ancho = 1040, margen = 300, zona = 625, fila = 112
  const maximo = Math.max(1, ...series.flatMap((s) => s.semanas.map((p) => p.valor ?? 0)))
  const minimo = Math.min(0, ...series.flatMap((s) => s.semanas.map((p) => p.valor ?? 0)))
  const x = (valor: number) => margen + (valor - minimo) / (maximo - minimo) * zona
  return <div className="vr-grafico-scroll"><svg viewBox={`0 0 ${ancho} ${series.length * fila + 55}`} style={{ minWidth: ancho }} role="img" aria-label={`Comparación de ${unidad} para todos los SKU en cinco semanas; valores completos en la tabla inferior.`}>
    <title>Todos los SKU · cinco semanas · {unidad}</title>
    {Array.from({ length: 5 }, (_, i) => <g key={i}><line x1={margen + i * zona / 4} x2={margen + i * zona / 4} y1={30} y2={series.length * fila + 40} stroke="#283642" /><text x={margen + i * zona / 4} y={18} textAnchor="middle" fill="#aab6c3" fontSize="11">{numero(minimo + i * (maximo - minimo) / 4)}</text></g>)}
    {series.map((s, posicion) => <g key={s.id} transform={`translate(0,${35 + posicion * fila})`}>
      <text x="12" y="36" fill="#e7edf3" fontSize="12" fontWeight="700"><title>{s.nombre}</title>{nombreCorto(s.nombre).length > 36 ? `${nombreCorto(s.nombre).slice(0, 34)}…` : nombreCorto(s.nombre)}</text>
      <text x="12" y="55" fill="#8fa0b0" fontSize="10">{s.codigo}</text>
      {s.semanas.map((p, i) => <g key={i}><title>{s.nombre} · {semanas[i].etiqueta} ({semanas[i].desde} – {semanas[i].hasta}): {p.valor === null ? "Sin dato" : `${numero(p.valor)} ${unidad}`} · {p.locales_con_dato} locales con dato</title>
        {p.valor === null ? <text x={margen + 6} y={i * 18 + 12} fill="#708296" fontSize="10">Sin dato</text> : <>
          <rect x={Math.min(x(0), x(p.valor))} y={i * 18} width={Math.max(2, Math.abs(x(p.valor) - x(0)))} height={12} rx={3} fill={COLORES[i]} />
          <text x={Math.max(x(0), x(p.valor)) + 7} y={i * 18 + 10} fill={i === 4 ? "#67e8f9" : "#bec8d2"} fontSize="10" fontWeight={i === 4 ? "700" : "400"}>{numero(p.valor)}</text>
        </>}
      </g>)}
      <line x1="12" x2={ancho - 12} y1={fila - 10} y2={fila - 10} stroke="#1e2b35" />
    </g>)}
  </svg></div>
}
