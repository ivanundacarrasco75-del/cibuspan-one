import { useEffect, useMemo, useState } from "react"
import { obtenerDashboardVisitasRotacion, type DatosDashboardCampo } from "../../repositories/dashboardVisitasRotacionRepository"
import {
  valorIndicadorValidadoCampo, fechaHoyCampoDashboard, INDICADORES_CAMPO, resumirSemanasCampo, semanasDashboardCampo, variacionSemanalCampo,
  type IndicadorCampo, type OrigenVisitaCampo, type SerieSkuCampo, type SemanaCampo,
} from "../../utils/dashboardVisitasRotacion"
import "./DashboardVisitasRotacion.css"
import { FotosCampo, UbicacionCampo } from "./UbicacionCampo"
import RecuperarLecturaVisita from "./RecuperarLecturaVisita"
import RecuperarCapturasPendientes from "./RecuperarCapturasPendientes"
import RevisionDatosCampo from "./RevisionDatosCampo"
import { camposPendientesDatosCampo } from "../../utils/estadoDatosCampo"
import { CLAVE_REVISION_CAMPO, type FocoRevisionCampo } from "../../utils/revisionDatosCampo"

const VACIO: DatosDashboardCampo = { clientes: [], locales: [], productos: [], registros: [] }
const COLORES = ["#64748b", "#a78bfa", "#38bdf8", "#fb923c", "#22d3ee"]
const numero = (valor: number | null) => valor === null ? "—" : valor.toLocaleString("es-EC", { maximumFractionDigits: 2 })
const fecha = (valor: string) => `${valor.slice(8, 10)}/${valor.slice(5, 7)}`
const nombreCorto = (nombre: string) => nombre.replace(/^PANGOL[IÍ]N\s+/i, "")

export default function DashboardVisitasRotacion({ revision, cambiarPantalla }: { revision: unknown; cambiarPantalla?: (pantalla: string) => void }) {
  const [hoy] = useState(() => fechaHoyCampoDashboard())
  const [referencia, setReferencia] = useState(hoy)
  const [clienteId, setClienteId] = useState("")
  const [localId, setLocalId] = useState("")
  const [indicador, setIndicador] = useState<IndicadorCampo>("rotacion")
  const [soloValidados, setSoloValidados] = useState(false)
  const [origen, setOrigen] = useState<OrigenVisitaCampo>("TODOS")
  const [datos, setDatos] = useState(VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [actualizacion, setActualizacion] = useState(0)
  const [vista, setVista] = useState<"EVOLUCION" | "CAPTURAS" | "REVISION">("EVOLUCION")
  const [focoRevision, setFocoRevision] = useState<FocoRevisionCampo | null>(null)
  const [recuperando, setRecuperando] = useState(false)
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
  const series = useMemo(() => resumirSemanasCampo({ registros: datos.registros, productos: datos.productos, semanas: ventana.semanas, indicador, clienteId, localId, origen, soloValidados, camposPendientes: (r) => { const campo: Partial<Record<IndicadorCampo, string>> = { rotacion: "rotacion_diaria_unidades", stock: "stock_local_unidades", dias: "dias_inventario_local", precio: "precio_comercio", precio_afiliado: "precio_afiliado", venta: "venta_diaria_valor", prediccion: "prediccion_venta_unidades", stock_cd: "stock_cd_cajas", dias_cd: "dias_inventario_cd" }; return camposPendientesDatosCampo(r).sort((a, b) => Number(b.campo === campo[indicador]) - Number(a.campo === campo[indicador])) } }), [datos, ventana.semanas, indicador, clienteId, localId, origen, soloValidados])
  const esActual = ventana.semanas.length > 0 && hoy >= desde && hoy >= ventana.semanas[4].desde && hoy <= hasta
  const semanas = ventana.semanas.map((s, i) => ({ ...s, etiqueta: i === 4 ? esActual ? "Esta semana · en curso" : "Semana seleccionada" : s.etiqueta }))
  const medidos = series.filter((s) => s.semanas[4]?.valor !== null && s.semanas[4]?.valor !== undefined)
  const comparables = series.filter((s) => s.semanas[4]?.valor != null && s.semanas[3]?.valor != null)
  const revisiones = datos.registros.filter((r) => r.fecha >= (semanas[4]?.desde ?? "9999") && (!localId || r.local_id === localId) && (origen === "TODOS" || r.responsable_rol === origen))
  const registrosCapturas = datos.registros.filter((r) => (!clienteId || r.cliente_id === clienteId) && (!localId || r.local_id === localId) && (origen === "TODOS" || r.responsable_rol === origen))
  const pendientesIndicador = registrosCapturas.filter((r) => r.valores[indicador] != null && valorIndicadorValidadoCampo(r, indicador) === null).length
  const clientesTexto = datos.clientes.find((c) => c.id === clienteId)?.nombre ?? "Todos los clientes"
  const localTexto = datos.locales.find((l) => l.id === localId)?.nombre ?? "Todos los locales"
  function restablecer() { setClienteId(""); setLocalId(""); setIndicador("rotacion"); setOrigen("TODOS"); setReferencia(hoy) }
  function abrirRevision(foco?: FocoRevisionCampo) {
    if (cambiarPantalla) { try { if (foco) sessionStorage.setItem(CLAVE_REVISION_CAMPO, JSON.stringify(foco)); else sessionStorage.removeItem(CLAVE_REVISION_CAMPO) } catch { /* La lista sigue disponible si el navegador no admite almacenamiento. */ }; cambiarPantalla("Comercial · Revisión de datos") }
    else { setFocoRevision(foco ?? null); setVista("REVISION") }
  }
  function descargar() {
    const celda = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`
    const encabezado = ["Cliente", "Local", "SKU", "Producto", "Indicador", "Unidad", "Estado de datos", ...semanas.flatMap((s) => [`${s.desde} a ${s.hasta}`, "Locales con dato", "Última revisión", "Estado de la semana"])]
    const filas = series.map((s) => [clientesTexto, localTexto, s.codigo, s.nombre, config.nombre, config.unidad, soloValidados ? "Validados / manuales declarados" : "Sin validar incluidos", ...s.semanas.flatMap((p) => [p.valor, p.locales_con_dato, p.ultima_fecha, p.pendientes?.length ? "SKU con campos pendientes" : "Sin campos pendientes"])])
    const contenido = "\uFEFF" + [encabezado, ...filas].map((fila) => fila.map(celda).join(";")).join("\r\n")
    const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" })), enlace = document.createElement("a")
    enlace.href = url; enlace.download = `visitas_${indicador}_${corte}.csv`; enlace.click(); URL.revokeObjectURL(url)
  }
  return <section className="vr-dashboard">
    <header className="vr-header"><div><span>DASHBOARD · VISITAS Y ROTACIÓN</span><h2>Evolución en punto de venta</h2><p>{desde && `${fecha(desde)} – ${fecha(corte)} · `}{esActual ? "Esta semana" : "Semana seleccionada"} y las cuatro anteriores, SKU por SKU.</p></div><button type="button" disabled={recuperando} onClick={restablecer}>Restablecer filtros</button></header>
    <fieldset className="vr-filtros" disabled={recuperando}>
      <label><span>Cliente</span><select value={clienteId} disabled={cargando} onChange={(e) => { setClienteId(e.target.value); setLocalId("") }}><option value="">Todos los clientes</option>{datos.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label><span>Local</span><select value={localId} disabled={cargando} onChange={(e) => setLocalId(e.target.value)}><option value="">Todos los locales</option>{datos.locales.map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.nombre}</option>)}</select></label>
      <label><span>Indicador</span><select value={indicador} onChange={(e) => setIndicador(e.target.value as IndicadorCampo)}>{INDICADORES_CAMPO.filter((i) => i.id !== "stock_cd").map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label>
      <label><span>Tipo de visita</span><select value={origen} onChange={(e) => setOrigen(e.target.value as OrigenVisitaCampo)}><option value="TODOS">Todas las visitas</option><option value="MERCADERISTA">Mercaderista</option><option value="KAM">KAM</option></select></label>
      <label><span>Calidad de datos</span><select value={soloValidados ? "VALIDADOS" : "TODOS"} onChange={(e) => setSoloValidados(e.target.value === "VALIDADOS")}><option value="TODOS">Todos · pendientes en rojo</option><option value="VALIDADOS">Sólo verificados y manuales declarados</option></select></label>
      <label><span>Semana de referencia</span><input type="date" max={hoy} value={referencia} onChange={(e) => setReferencia(e.target.value)} /></label>
      <button type="button" disabled={cargando || !!ventana.error} onClick={() => setActualizacion((v) => v + 1)}>Actualizar</button>
    </fieldset>
    <div className="vr-vistas" aria-label="Vistas del dashboard">
      <button type="button" disabled={recuperando} aria-pressed={vista === "EVOLUCION"} onClick={() => setVista("EVOLUCION")}>Evolución semanal</button>
      <button type="button" disabled={recuperando} aria-pressed={vista === "CAPTURAS"} onClick={() => setVista("CAPTURAS")}>Releer capturas / visitas{!cargando && !error && !ventana.error && ` (${revisiones.length})`}</button>
      <button type="button" className="vr-boton-revision" disabled={recuperando} onClick={() => abrirRevision()}>Revisar sólo datos dudosos</button>
    </div>
    <RecuperarCapturasPendientes registros={registrosCapturas} locales={datos.locales} deshabilitado={cargando || !!error || !!ventana.error} alCambiarEstado={setRecuperando} alTerminar={() => setActualizacion((v) => v + 1)} />
    {(ventana.error || error) && <div className="vr-error" role="alert">{ventana.error || error}</div>}
    <p role="status">{pendientesIndicador} mediciones guardadas de {config.nombre.toLowerCase()} pendientes de verificar. {soloValidados ? "Este filtro muestra sólo datos verificados." : "Los valores provisionales se muestran y los SKU con datos dudosos están señalados en rojo. Pulsa Revisar para corregir el campo concreto."}</p>
    {mensaje && <p role="status">{mensaje}</p>}
    {cargando && <p className="vr-estado" role="status">Cargando las cinco semanas de visitas…</p>}
    {!cargando && !ventana.error && !error && <>
      <div className="vr-contexto"><span>{clientesTexto} / {localTexto}</span><span>{config.nombre} · {config.unidad}</span></div>
      {vista === "EVOLUCION" && <>
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
        {!series.length ? <p className="vr-estado">No hay SKU disponibles para este cliente.</p> : <GraficoSku series={series} semanas={semanas} unidad={config.unidad} alRevisar={abrirRevision} />}
        <p className="vr-nota">Cada barra usa la última revisión de ese SKU en cada local y semana. “Sin dato” significa que no hay una medición disponible para el filtro elegido; cero es un valor registrado. Rojo indica que el SKU tiene algún campo pendiente, aunque otro campo ya esté verificado. Al cambiar el número de locales revisados, la comparación puede variar por cobertura.{esActual && " La semana actual aún está en curso."}</p>
        {origen !== "TODOS" && <p className="vr-nota">El tipo de visita usa el rol registrado al guardar. Las visitas antiguas sin rol identificado aparecen en “Todas las visitas”.</p>}
      </section>
      <section className="vr-tabla-panel"><h3>Comparación de las cinco semanas</h3><p>{config.unidad} · Debajo de cada valor: locales con dato / locales revisados.</p><div className="vr-tabla-scroll"><table><thead><tr><th>SKU</th>{semanas.map((s) => <th key={s.desde}>{s.etiqueta}<small>{fecha(s.desde)} – {fecha(s.hasta)}</small></th>)}<th>Variación vs anterior</th></tr></thead><tbody>{series.map((s) => {
        const cambio = variacionSemanalCampo(s.semanas[4], s.semanas[3])
        const distinto = s.semanas[4].locales_con_dato !== s.semanas[3].locales_con_dato
        return <tr key={s.id} className={s.semanas.some((p) => p.pendientes?.length) ? "vr-sku-pendiente" : undefined}><th>{nombreCorto(s.nombre)}<small>{s.codigo}</small></th>{s.semanas.map((p, i) => <td key={i} className={p.pendientes?.length ? "vr-dato-pendiente" : i === 4 ? "vr-actual" : ""}>{p.valor === null ? "Sin dato" : numero(p.valor)}<small>{p.locales_con_dato} / {p.locales_revisados} locales{p.ultima_fecha && ` · ${fecha(p.ultima_fecha)}`}</small>{!!p.pendientes?.length && <button type="button" className="vr-boton-revision" onClick={() => abrirRevision(p.pendientes![0])}>Revisar {p.pendientes.length} datos</button>}</td>)}<td>{!cambio ? "—" : `${cambio.diferencia > 0 ? "+" : ""}${numero(cambio.diferencia)} ${unidadCambio}`}<small>{cambio?.porcentaje != null ? `${cambio.porcentaje > 0 ? "+" : ""}${numero(cambio.porcentaje)}%` : cambio ? "Base anterior cero" : "Falta dato comparable"}{cambio && distinto && " · Cobertura distinta"}</small></td></tr>
      })}</tbody></table></div></section>
      </>}
      {vista === "REVISION" && <RevisionDatosCampo registros={registrosCapturas} foco={focoRevision} alGuardar={() => setActualizacion((v) => v + 1)} />}
      {vista === "CAPTURAS" && <section className="vr-revisiones">
        <h3>Capturas y datos de visitas</h3>
        <p>Semana del {fecha(semanas[4].desde)} al {fecha(corte)}. Selecciona cliente y local arriba; pulsa “Releer y guardar comprobados” para actualizar el SKU y el gráfico.</p>
        {!revisiones.length && <p className="vr-estado">No hay visitas en esta semana con los filtros seleccionados. Prueba otra semana o restablece los filtros.</p>}
        <div className="vr-lista-visitas">{[...revisiones].sort((a, b) => b.visitado_en.localeCompare(a.visitado_en)).map((r) => <article className="vr-visita" key={r.id}>
          <header><h4>{r.producto_nombre}</h4><span>{fecha(r.fecha)} · {r.responsable_rol ?? "Sin identificar"}</span></header>
          <p>{r.local_nombre} · SKU {r.producto_codigo}</p>
          <p>{config.nombre}: {r.valores[indicador] == null ? "Sin dato" : `${numero(r.valores[indicador])} ${config.unidad}`}{r.valores[indicador] != null && (valorIndicadorValidadoCampo(r, indicador) === null ? " · Pendiente de validar" : " · Validado / manual declarado")}</p>
          <RecuperarLecturaVisita registro={r} locales={datos.locales} deshabilitado={recuperando} alCompletar={() => { setMensaje(`Datos guardados en ${r.local_nombre} · ${r.producto_nombre}.`); setVista("EVOLUCION"); setActualizacion((v) => v + 1) }} />
          <details><summary>Ubicación y fotos</summary><UbicacionCampo dato={r.georreferencia} /><FotosCampo fotos={r.fotos_georreferencia} /></details>
        </article>)}</div>
      </section>}
    </>}
  </section>
}

function GraficoSku({ series, semanas, unidad, alRevisar }: { series: SerieSkuCampo[]; semanas: SemanaCampo[]; unidad: string; alRevisar: (f: FocoRevisionCampo) => void }) {
  const ancho = 1040, margen = 300, zona = 625, fila = 112
  const maximo = Math.max(1, ...series.flatMap((s) => s.semanas.map((p) => p.valor ?? 0)))
  const minimo = Math.min(0, ...series.flatMap((s) => s.semanas.map((p) => p.valor ?? 0)))
  const x = (valor: number) => margen + (valor - minimo) / (maximo - minimo) * zona
  return <div className="vr-grafico-scroll"><svg viewBox={`0 0 ${ancho} ${series.length * fila + 55}`} style={{ minWidth: ancho }} role="img" aria-label={`Comparación de ${unidad} para todos los SKU en cinco semanas; valores completos en la tabla inferior.`}>
    <title>Todos los SKU · cinco semanas · {unidad}</title>
    {Array.from({ length: 5 }, (_, i) => <g key={i}><line x1={margen + i * zona / 4} x2={margen + i * zona / 4} y1={30} y2={series.length * fila + 40} stroke="#283642" /><text x={margen + i * zona / 4} y={18} textAnchor="middle" fill="#aab6c3" fontSize="11">{numero(minimo + i * (maximo - minimo) / 4)}</text></g>)}
    {series.map((s, posicion) => <g key={s.id} transform={`translate(0,${35 + posicion * fila})`}>
      <text x="12" y="36" fill={s.semanas.some((p) => p.pendientes?.length) ? "#fda4af" : "#e7edf3"} fontSize="12" fontWeight="700"><title>{s.nombre}</title>{nombreCorto(s.nombre).length > 36 ? `${nombreCorto(s.nombre).slice(0, 34)}…` : nombreCorto(s.nombre)}</text>
      <text x="12" y="55" fill="#8fa0b0" fontSize="10">{s.codigo}</text>
      {s.semanas.some((p) => p.pendientes?.length) && <text x="12" y="79" fill="#fb7185" fontSize="12" role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => alRevisar(s.semanas.findLast((p) => p.pendientes?.length)!.pendientes![0])} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") alRevisar(s.semanas.findLast((p) => p.pendientes?.length)!.pendientes![0]) }}>Revisar datos pendientes →</text>}
      {s.semanas.map((p, i) => <g key={i}><title>{s.nombre} · {semanas[i].etiqueta} ({semanas[i].desde} – {semanas[i].hasta}): {p.valor === null ? "Sin dato" : `${numero(p.valor)} ${unidad}`} · {p.locales_con_dato} locales con dato</title>
        {p.valor === null ? <text x={margen + 6} y={i * 18 + 12} fill="#708296" fontSize="10">Sin dato</text> : <>
          <rect x={Math.min(x(0), x(p.valor))} y={i * 18} width={Math.max(2, Math.abs(x(p.valor) - x(0)))} height={12} rx={3} fill={p.pendientes?.length ? "#fb7185" : COLORES[i]} />
          <text x={Math.max(x(0), x(p.valor)) + 7} y={i * 18 + 10} fill={i === 4 ? "#67e8f9" : "#bec8d2"} fontSize="10" fontWeight={i === 4 ? "700" : "400"}>{numero(p.valor)}</text>
        </>}
      </g>)}
      <line x1="12" x2={ancho - 12} y1={fila - 10} y2={fila - 10} stroke="#1e2b35" />
    </g>)}
  </svg></div>
}
