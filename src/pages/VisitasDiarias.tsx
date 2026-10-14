import { useEffect, useMemo, useState } from "react"
import { obtenerDashboardVisitasRotacion, type DatosDashboardCampo } from "../repositories/dashboardVisitasRotacionRepository"
import { fechaHoyCampoDashboard } from "../utils/dashboardVisitasRotacion"
import { agruparVisitasDiariasCampo } from "../utils/visitasDiariasCampo"
import "../components/kpiKam/DashboardVisitasRotacion.css"
import "./VisitasDiarias.css"
import { CLAVE_REVISION_CAMPO, pendientesRevisionCampo } from "../utils/revisionDatosCampo"

const VACIO: DatosDashboardCampo = { clientes: [], locales: [], productos: [], registros: [] }
const fecha = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`
function horaRegistro(v: string, dia: string) {
  if (!v || !Number.isFinite(Date.parse(v))) return "—"
  const instante = new Date(v), local = fechaHoyCampoDashboard(instante)
  const hora = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false }).format(instante)
  return local === dia ? hora : `${hora} (${fecha(local)})`
}
export default function VisitasDiarias({ cambiarPantalla }: { cambiarPantalla?: (p: string) => void }) {
  const [hoy] = useState(() => fechaHoyCampoDashboard())
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`), [hasta, setHasta] = useState(hoy)
  const [cliente, setCliente] = useState(""), [local, setLocal] = useState(""), [responsable, setResponsable] = useState("")
  const [datos, setDatos] = useState(VACIO), [cargando, setCargando] = useState(true), [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const rangoValido = /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && desde <= hasta && hasta <= hoy
  useEffect(() => {
    let vigente = true
    if (!rangoValido) { setCargando(false); return }
    setCargando(true); setError("")
    void obtenerDashboardVisitasRotacion(cliente, desde, hasta).then((r) => { if (vigente) setDatos(r) })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : "No se pudo cargar el registro diario.") })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [cliente, desde, hasta, rangoValido, revision])
  const visitas = useMemo(() => agruparVisitasDiariasCampo(datos.registros, responsable, local), [datos, responsable, local])
  const locales = [...new Map([...datos.locales.map((l) => [l.id, { id: l.id, nombre: l.nombre }] as const), ...datos.registros.map((r) => [r.local_id, { id: r.local_id, nombre: r.local_nombre }] as const)]).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  const responsables = [...new Map(datos.registros.filter((r) => r.registrado_por).map((r) => [r.registrado_por!, { id: r.registrado_por!, nombre: r.responsable_nombre ?? "Sin nombre registrado", rol: r.responsable_rol }])).values()]
  const clienteNombre = (id: string) => datos.clientes.find((c) => c.id === id)?.nombre ?? "Cliente sin nombre disponible"
  function revisar(dia: string, clienteId: string, localId: string) {
    const p = pendientesRevisionCampo(datos.registros.filter((r) => r.fecha === dia && r.cliente_id === clienteId && r.local_id === localId))[0]
    if (!p || !cambiarPantalla) return
    try { sessionStorage.setItem(CLAVE_REVISION_CAMPO, JSON.stringify({ registroId: p.registro.id, campo: p.campo, fecha: p.registro.fecha, clienteId: p.registro.cliente_id })) } catch { /* La revisión diaria sigue accesible. */ }
    cambiarPantalla("Comercial · Revisión de datos")
  }
  function descargar() {
    const celda = (v: unknown) => { const s = String(v ?? ""); return `"${(/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"` }
    const filas = [["Fecha visita", "Cliente", "Local", "Responsables", "Primer registro", "Último registro", "SKU registrados", "Capturas guardadas", "SKU con rotación disponible", "SKU con campos pendientes"],
      ...visitas.map((v) => [v.fecha, clienteNombre(v.cliente_id), v.local_nombre, v.responsables.map((r) => r.nombre).join(" / "), v.primero, v.ultimo, v.skus, v.capturas, v.rotaciones, v.pendientes])]
    const url = URL.createObjectURL(new Blob(["\uFEFF" + filas.map((f) => f.map(celda).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a"); a.href = url; a.download = `visitas_diarias_${desde}_${hasta}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  return <div className="campo-comercial"><section className="vr-dashboard vd-dashboard">
    <header className="vr-header"><div><span>COMERCIAL · REGISTRO DIARIO</span><h2>Visitas diarias a locales</h2><p>Locales con visitas registradas por día, responsables y SKU ingresados. La visita se muestra aunque algún dato de la captura esté pendiente.</p></div><button type="button" disabled={cargando || !!error || !rangoValido || !visitas.length} onClick={descargar}>Descargar lista</button></header>
    <div className="vr-filtros">
      <label><span>Desde</span><input type="date" value={desde} max={hasta || hoy} onChange={(e) => setDesde(e.target.value)} /></label>
      <label><span>Hasta</span><input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} /></label>
      <label><span>Cliente</span><select value={cliente} disabled={cargando} onChange={(e) => { setCliente(e.target.value); setLocal(""); setResponsable("") }}><option value="">Todos los clientes</option>{datos.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label><span>Local</span><select value={local} disabled={cargando} onChange={(e) => setLocal(e.target.value)}><option value="">Todos los locales</option>{local && !locales.some((l) => l.id === local) && <option value={local}>Local seleccionado sin registros en este periodo</option>}{locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></label>
      <label><span>Responsable</span><select value={responsable} disabled={cargando} onChange={(e) => setResponsable(e.target.value)}><option value="">Todos</option>{responsable && !responsables.some((r) => r.id === responsable) && <option value={responsable}>Responsable seleccionado sin registros en este periodo</option>}{responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}{r.rol && ` · ${r.rol}`}</option>)}</select></label>
      <button type="button" disabled={cargando || !rangoValido} onClick={() => setRevision((v) => v + 1)}>Actualizar</button>
    </div>
    <div className="vr-vistas"><button type="button" onClick={() => { setDesde(hoy); setHasta(hoy) }}>Hoy</button><button type="button" onClick={() => { setDesde(`${hoy.slice(0, 7)}-01`); setHasta(hoy) }}>Este mes</button><button type="button" onClick={() => { setLocal(""); setResponsable("") }}>Todos los locales y responsables</button></div>
    {!rangoValido && <p className="vr-error" role="alert">Selecciona un rango de fechas válido, hasta hoy.</p>}
    {error && <p className="vr-error" role="alert">{error}</p>}
    {cargando && <p role="status">Cargando visitas registradas…</p>}
    {!cargando && !error && rangoValido && <>
      <div className="vr-cards"><article><span>Visitas a locales</span><strong>{visitas.length}</strong><small>Un local por día y cliente.</small></article><article><span>Locales distintos</span><strong>{new Set(visitas.map((v) => v.local_id)).size}</strong><small>En el periodo seleccionado.</small></article><article><span>SKU revisados por día/local</span><strong>{visitas.reduce((s, v) => s + v.skus, 0)}</strong><small>Sin sumar repetidos en el mismo local y día.</small></article><article><span>Días con visitas</span><strong>{new Set(visitas.map((v) => v.fecha)).size}</strong><small>{fecha(desde)} – {fecha(hasta)}</small></article></div>
      <section className="vr-tabla-panel"><h3>Locales visitados diariamente</h3><p>“Visita registrada” confirma el ingreso en la app. Las columnas de capturas y rotación muestran por separado la información disponible.</p>
        <div className="vr-tabla-scroll"><table><thead><tr><th>Fecha</th><th>Cliente / local</th><th>Responsables</th><th>Horas de registro</th><th>SKU registrados</th><th>Capturas guardadas</th><th>Rotaciones disponibles</th><th>Estado</th></tr></thead><tbody>{visitas.map((v) => <tr key={v.clave}><td>{fecha(v.fecha)}</td><th>{v.local_nombre}<small>{clienteNombre(v.cliente_id)}</small></th><td>{v.responsables.map((r) => <div key={r.id}>{r.nombre}<small>{r.rol ?? "Rol sin identificar"}</small></div>)}</td><td>{horaRegistro(v.primero, v.fecha)} – {horaRegistro(v.ultimo, v.fecha)}</td><td>{v.skus}</td><td>{v.capturas}</td><td>{v.rotaciones} / {v.skus}</td><td>Visita registrada<small>{v.pendientes ? `${v.pendientes} SKU con algún campo pendiente` : "Sin campos de lectura pendientes"}</small>{!!v.pendientes && cambiarPantalla && <button type="button" onClick={() => revisar(v.fecha, v.cliente_id, v.local_id)}>Revisar datos</button>}</td></tr>)}</tbody></table></div>
        {!visitas.length && <p className="vr-estado">No hay visitas registradas para estos filtros.</p>}
        <p className="vr-nota">Diez SKU ingresados en un local cuentan como una visita diaria. Si KAM y mercaderista registran el mismo local, se muestran ambos responsables. Las horas corresponden al momento de registrar los SKU, y no certifican la duración de la visita.</p>
      </section>
    </>}
  </section></div>
}
