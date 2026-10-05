import { useEffect, useMemo, useState } from "react"
import { obtenerSupervisionCampo } from "../../repositories/campoComercialRepository"
import { compararSupervision, inicioSemanaCampo, type RegistroSupervision } from "../../utils/supervisionCampo"

type Props = { clientes: Array<{ id: string; nombre: string }> }

export default function SupervisionCampo({ clientes }: Props) {
  const hoy = fechaHoy()
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const [cliente, setCliente] = useState("")
  const [local, setLocal] = useState("")
  const [modo, setModo] = useState("TODOS")
  const [registros, setRegistros] = useState<RegistroSupervision[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let vigente = true
    setRegistros([])
    setError("")
    if (!desde || !hasta || hasta < desde) { setError("Selecciona un rango de fechas válido."); setCargando(false); return }
    setCargando(true)
    // Incluir semanas completas para no perder la visita comparable en los bordes.
    const fin = new Date(`${inicioSemanaCampo(hasta)}T12:00:00Z`)
    fin.setUTCDate(fin.getUTCDate() + 6)
    void obtenerSupervisionCampo(inicioSemanaCampo(desde), fin.toISOString().slice(0, 10), cliente || null)
      .then((datos) => { if (vigente) setRegistros(datos) })
      .catch((err) => { if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar el reporte.") })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [desde, hasta, cliente, revision])

  const locales = useMemo(() => [...new Map(registros.map((r) => [r.local_id, r.local_nombre])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "es")), [registros])
  const comparaciones = useMemo(() => compararSupervision(registros)
    .filter((c) => c.kam.fecha >= desde && c.kam.fecha <= hasta && (!local || c.kam.local_id === local))
    .sort((a, b) => b.kam.visitado_en.localeCompare(a.kam.visitado_en)), [registros, desde, hasta, local])
  const filas = comparaciones.filter((c) => modo === "TODOS" ||
    (modo === "DIFERENCIAS" && c.diferencias.length > 0) ||
    (modo === "MISMO_DIA" && c.mercaderista && c.mismoDia) ||
    (modo === "MISMA_SEMANA" && c.mercaderista && !c.mismoDia))
  const sinKam = registros.filter((r) => r.responsable_rol === "MERCADERISTA" &&
    r.fecha >= desde && r.fecha <= hasta && (!local || r.local_id === local) &&
    !registros.some((k) => k.responsable_rol === "KAM" && k.cliente_id === r.cliente_id &&
      k.local_id === r.local_id && k.producto_id === r.producto_id && inicioSemanaCampo(k.fecha) === inicioSemanaCampo(r.fecha)))
  const sinIdentificar = registros.filter((r) => !r.responsable_rol &&
    r.fecha >= desde && r.fecha <= hasta && (!local || r.local_id === local)).length

  function exportar() {
    const cabecera = ["Local", "SKU", "Coincidencia", "Mercaderista", "Fecha mercaderista", "KAM", "Fecha KAM",
      "Caras mercaderista", "Caras KAM", "Diferencia caras KAM - mercaderista", "Stock mercaderista", "Stock KAM",
      "Rotación mercaderista", "Rotación KAM", "Presencia mercaderista", "Presencia KAM", "Diferencias", "Datos faltantes", "Observaciones mercaderista", "Observaciones KAM"]
    const datos = filas.map((c) => [c.kam.local_nombre, c.kam.producto_nombre,
      c.mercaderista ? c.mismoDia ? "Mismo día" : "Misma semana" : "Sin visita comparable",
      c.mercaderista?.responsable_nombre, c.mercaderista?.visitado_en, c.kam.responsable_nombre, c.kam.visitado_en,
      c.mercaderista?.caras_percha, c.kam.caras_percha,
      c.mercaderista?.caras_percha != null && c.kam.caras_percha != null ? c.kam.caras_percha - c.mercaderista.caras_percha : null,
      c.mercaderista?.stock_local_unidades, c.kam.stock_local_unidades,
      c.mercaderista?.rotacion_diaria_unidades, c.kam.rotacion_diaria_unidades,
      c.mercaderista?.presencia_percha, c.kam.presencia_percha,
      c.diferencias.join(" / "), c.faltantes.join(" / "), c.mercaderista?.observaciones, c.kam.observaciones])
    const texto = [cabecera, ...datos].map((fila) => fila.map(celdaCsv).join(";")).join("\r\n")
    const url = URL.createObjectURL(new Blob(["\uFEFF", texto], { type: "text/csv;charset=utf-8" }))
    const enlace = document.createElement("a")
    enlace.href = url; enlace.download = `Supervision_KAM_${desde}_${hasta}.csv`; enlace.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="supervision-campo">
    <style>{css}</style>
    <header><h3>Reporte de supervisión KAM</h3><p>Compara el mismo local y SKU. Prioriza el mismo día y luego la visita más cercana de la misma semana (lunes a domingo).</p></header>
    <div className="supervision-filtros">
      <label><span>Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
      <label><span>Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      <label><span>Cliente</span><select value={cliente} onChange={(e) => { setCliente(e.target.value); setLocal("") }}><option value="">Todos</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label><span>Local</span><select value={local} onChange={(e) => setLocal(e.target.value)}><option value="">Todos</option>{locales.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label>
      <label><span>Mostrar</span><select value={modo} onChange={(e) => setModo(e.target.value)}><option value="TODOS">Todos</option><option value="DIFERENCIAS">Con diferencias</option><option value="MISMO_DIA">Mismo día</option><option value="MISMA_SEMANA">Solo misma semana</option></select></label>
      <button type="button" onClick={() => setRevision((v) => v + 1)} disabled={cargando}>Actualizar reporte</button>
      <button type="button" onClick={exportar} disabled={cargando || !!error || !filas.length}>Descargar CSV</button>
    </div>
    {cargando ? <p role="status">Cargando supervisión…</p> : error ? <div className="campo-error" role="alert">{error}</div> : <>
      <div className="supervision-resumen">
        <span>{comparaciones.filter((c) => c.mercaderista).length} comparaciones</span>
        <span>{comparaciones.filter((c) => c.diferencias.length).length} con diferencias</span>
        <span>{comparaciones.filter((c) => !c.mercaderista).length} visitas KAM sin mercaderista comparable</span>
        <span>{sinKam.length} registros de mercaderista sin visita KAM esa semana</span>
      </div>
      <p className="campo-advertencia">Una diferencia requiere revisión: entre visitas puede haber venta, reposición o cambios de percha. Se conservan ambos registros.</p>
      {sinIdentificar > 0 && <p className="campo-advertencia">{sinIdentificar} registros antiguos sin rol visible no se pueden atribuir a KAM o mercaderista. Los nuevos registros guardan el responsable y su rol.</p>}
      {!filas.length ? <p>No hay comparaciones para estos filtros.</p> : <div className="supervision-tabla"><table>
        <thead><tr><th>Local / SKU</th><th>Visitas comparadas</th><th>Caras (M / K)</th><th>Stock (M / K)</th><th>Rotación (M / K)</th><th>Presencia (M / K)</th><th>Resultado</th></tr></thead>
        <tbody>{filas.map((c) => <tr key={c.kam.id} className={c.diferencias.length ? "diferencia" : ""}>
          <td>{c.kam.local_nombre}<small>{c.kam.producto_nombre}</small></td>
          <td><span>{c.mercaderista ? c.mismoDia ? "Mismo día" : "Misma semana" : "Sin visita comparable"}</span>
            <small>M: {c.mercaderista ? `${c.mercaderista.responsable_nombre} · ${fechaHora(c.mercaderista.visitado_en)} · visita ${c.mercaderista.fecha}` : "Sin registro"}</small>
            <small>K: {c.kam.responsable_nombre} · {fechaHora(c.kam.visitado_en)} · visita {c.kam.fecha}</small>
          </td>
          <td>{valores(c.mercaderista?.caras_percha, c.kam.caras_percha)}{c.mercaderista?.caras_percha != null && c.kam.caras_percha != null && <small>Δ K − M: {c.kam.caras_percha - c.mercaderista.caras_percha}</small>}</td>
          <td>{valores(c.mercaderista?.stock_local_unidades, c.kam.stock_local_unidades)}</td>
          <td>{valores(c.mercaderista?.rotacion_diaria_unidades, c.kam.rotacion_diaria_unidades)}</td>
          <td>{presencia(c.mercaderista?.presencia_percha)} / {presencia(c.kam.presencia_percha)}</td>
          <td>{!c.mercaderista ? "Sin comparación" : c.diferencias.length ? `Diferencias: ${c.diferencias.join(", ")}` : c.faltantes.length ? "Comparación incompleta" : "Coinciden"}
            {c.faltantes.length > 0 && <small>Sin dato: {c.faltantes.join(", ")}</small>}
            {c.kam.caras_percha === 0 && (c.kam.stock_local_unidades ?? 0) > 0 && <small className="supervision-alerta">KAM: CON STOCK NO PERCHADO</small>}
            {c.mercaderista?.caras_percha === 0 && (c.mercaderista.stock_local_unidades ?? 0) > 0 && <small className="supervision-alerta">Mercaderista: CON STOCK NO PERCHADO</small>}
            {(c.mercaderista?.observaciones || c.kam.observaciones) && <details><summary>Observaciones</summary><p>M: {c.mercaderista?.observaciones || "—"}</p><p>K: {c.kam.observaciones || "—"}</p></details>}
          </td>
        </tr>)}</tbody>
      </table></div>}
      {sinKam.length > 0 && <details><summary>Ver registros de mercaderista sin visita KAM esa semana ({sinKam.length})</summary>{sinKam.map((r) => <p key={r.id}>{r.local_nombre} · {r.producto_nombre} · {r.fecha} · {r.responsable_nombre}</p>)}</details>}
      <small>M = mercaderista; K = KAM. “Sin dato” no equivale a cero. El rango filtra la fecha de las visitas KAM; la búsqueda comparable incluye la semana completa.</small>
    </>}
  </section>
}

function fechaHoy() { const f = new Date(); return new Date(f.getTime() - f.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
function fechaHora(fecha: string) { return new Date(fecha).toLocaleString("es-EC", { timeZone: "America/Guayaquil", dateStyle: "short", timeStyle: "short" }) }
function valores(a: number | null | undefined, b: number | null) { return `${a ?? "Sin dato"} / ${b ?? "Sin dato"}` }
function presencia(v?: string) { return v === "PRESENTE" ? "Sí" : v === "AUSENTE" ? "No" : "Sin revisar" }
function celdaCsv(valor: unknown) { let s = String(valor ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"` }
const css = `.supervision-campo{display:grid;gap:14px;padding:18px;border:1px solid #e5dad4;border-radius:14px;background:#fff}.supervision-campo h3{margin:0;color:#8f1d24}.supervision-campo p{font-size:13px}.supervision-filtros{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.supervision-filtros label{min-width:130px;flex:1}.supervision-resumen{display:flex;gap:12px;flex-wrap:wrap}.supervision-resumen span{padding:10px;background:#f8f5f1;border-radius:9px;font-size:12px}.supervision-tabla{overflow:auto}.supervision-tabla table{border-collapse:collapse;width:100%;font-size:12px;min-width:900px}.supervision-tabla th,.supervision-tabla td{padding:11px;border:1px solid #e5dad4;text-align:left;vertical-align:top}.supervision-tabla th{background:#f8f5f1}.supervision-tabla small{display:block;margin-top:5px;color:#76665f}.supervision-tabla tr.diferencia{background:#fff7eb}.supervision-tabla .supervision-alerta{color:#a5242d;font-weight:700}@media(max-width:600px){.supervision-campo{padding:12px}.supervision-filtros label{min-width:100%;box-sizing:border-box}}`
