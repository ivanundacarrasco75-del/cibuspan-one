import { useEffect, useState } from "react"
import RevisionDatosCampo from "../components/kpiKam/RevisionDatosCampo"
import { obtenerDashboardVisitasRotacion, type DatosDashboardCampo } from "../repositories/dashboardVisitasRotacionRepository"
import { fechaHoyCampoDashboard } from "../utils/dashboardVisitasRotacion"
import { CLAVE_REVISION_CAMPO, type FiltrosRevisionCampo } from "../utils/revisionDatosCampo"
import "../components/kpiKam/DashboardVisitasRotacion.css"

function leerFiltrosRevision(): FiltrosRevisionCampo | null {
  try {
    const filtros = JSON.parse(sessionStorage.getItem(CLAVE_REVISION_CAMPO) ?? "null")
    if (!filtros || typeof filtros.campo !== "string" || typeof filtros.clienteId !== "string") return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filtros.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(filtros.hasta)) return null
    return {
      campo: filtros.campo, desde: filtros.desde, hasta: filtros.hasta, clienteId: filtros.clienteId,
      registrosBarra: Array.isArray(filtros.registrosBarra) ? filtros.registrosBarra.filter((id: unknown) => typeof id === "string") : undefined,
    }
  } catch { return null }
}

export default function RevisionDatosVisitas() {
  const [hoy] = useState(fechaHoyCampoDashboard)
  const [foco] = useState(leerFiltrosRevision)
  useEffect(() => { try { sessionStorage.removeItem(CLAVE_REVISION_CAMPO) } catch { /* El filtro sigue disponible en memoria. */ } }, [])
  const [desde, setDesde] = useState(foco?.desde ?? `${hoy.slice(0, 7)}-01`), [hasta, setHasta] = useState(foco?.hasta ?? hoy)
  const [cliente, setCliente] = useState(foco?.clienteId ?? ""), [revision, setRevision] = useState(0)
  const [datos, setDatos] = useState<DatosDashboardCampo>({ clientes: [], locales: [], productos: [], registros: [] })
  const [cargando, setCargando] = useState(true), [error, setError] = useState("")
  const valido = !!desde && !!hasta && desde <= hasta && hasta <= hoy
  useEffect(() => { let vigente = true; if (!valido) { setCargando(false); return }; setCargando(true); setError("")
    void obtenerDashboardVisitasRotacion(cliente, desde, hasta).then((r) => { if (vigente) setDatos(r) }).catch((e) => { if (vigente) setError(e.message ?? "No se pudo cargar la revisión.") }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [desde, hasta, cliente, revision, valido])
  return <div className="campo-comercial"><section className="vr-dashboard"><header className="vr-header"><div><span>COMERCIAL · REVISIÓN DE DATOS</span><h2>Revisión de capturas por campo</h2><p>Se muestran sólo datos dudosos. Cada corrección se guarda en su visita original y se marca como revisada.</p></div></header>
    <div className="vr-filtros"><label><span>Desde</span><input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label><label><span>Hasta</span><input type="date" value={hasta} max={hoy} min={desde} onChange={(e) => setHasta(e.target.value)} /></label><label><span>Cliente</span><select value={cliente} disabled={cargando} onChange={(e) => setCliente(e.target.value)}><option value="">Todos</option>{datos.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label></div>
    {(!valido || error) && <p className="vr-error" role="alert">{error || "Revisa el rango de fechas."}</p>}
    {cargando && <p role="status">Cargando campos pendientes…</p>}
    <RevisionDatosCampo registros={valido && !error ? datos.registros : []} campoInicial={foco?.campo} registrosBarra={foco?.registrosBarra} deshabilitado={cargando || !valido || !!error} alGuardar={() => setRevision((v) => v + 1)} />
  </section></div>
}
