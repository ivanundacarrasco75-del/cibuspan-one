import { useEffect, useMemo, useState } from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  cambiarEstadoRecordatorioDb,
  guardarRecordatorioDb,
  obtenerDestinatariosRecordatoriosDb,
  obtenerRecordatoriosDb,
  type DestinatarioRecordatorioDb,
  type RecordatorioDb,
} from "../repositories/promocionesRepository"
import { ETIQUETAS_ROL, type AppRole } from "../services/usuarioService"

type DestinoTipo = "TODOS" | "ROL" | "USUARIO"

function hoyIso() {
  return new Date().toISOString().slice(0, 10)
}

function fecha(valor: string) {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${valor.slice(0, 10)}T00:00:00Z`))
}

function etiquetaRol(rol: string | null) {
  return rol && rol in ETIQUETAS_ROL
    ? ETIQUETAS_ROL[rol as AppRole]
    : rol || "Sin rol"
}

export default function RecordatoriosMensajes() {
  const hoy = hoyIso()
  const [recordatorios, setRecordatorios] = useState<RecordatorioDb[]>([])
  const [usuarios, setUsuarios] = useState<DestinatarioRecordatorioDb[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState("")
  const [error, setError] = useState("")
  const [titulo, setTitulo] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [fechaInicio, setFechaInicio] = useState(hoy)
  const [fechaFin, setFechaFin] = useState(hoy)
  const [prioridad, setPrioridad] = useState<"NORMAL" | "ALTA">("NORMAL")
  const [destinoTipo, setDestinoTipo] = useState<DestinoTipo>("TODOS")
  const [destinoRol, setDestinoRol] = useState<AppRole>("GERENTE")
  const [destinoUsuario, setDestinoUsuario] = useState("")

  useEffect(() => {
    void cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")
    try {
      const [recordatoriosDb, usuariosDb] = await Promise.all([
        obtenerRecordatoriosDb(),
        obtenerDestinatariosRecordatoriosDb(),
      ])
      setRecordatorios(recordatoriosDb)
      setUsuarios(usuariosDb)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los mensajes.")
    } finally {
      setCargando(false)
    }
  }

  const activos = useMemo(
    () => recordatorios.filter((item) => item.activo && item.fecha_fin >= hoy),
    [hoy, recordatorios],
  )

  async function guardar() {
    if (!titulo.trim() || !mensaje.trim() || !fechaInicio || !fechaFin) {
      setError("Completa el título, el mensaje y las fechas.")
      return
    }
    if (fechaFin < fechaInicio) {
      setError("La fecha final no puede ser anterior a la fecha inicial.")
      return
    }
    if (destinoTipo === "USUARIO" && !destinoUsuario) {
      setError("Selecciona el usuario que recibirá el mensaje.")
      return
    }
    setGuardando(true)
    try {
      await guardarRecordatorioDb({
        titulo,
        mensaje,
        fechaInicio,
        fechaFin,
        prioridad,
        destinoTipo,
        destinoRol: destinoTipo === "ROL" ? destinoRol : null,
        destinoUsuario: destinoTipo === "USUARIO" ? destinoUsuario : null,
      })
      setTitulo("")
      setMensaje("")
      setDestinoTipo("TODOS")
      setExito("El mensaje quedó programado y aparecerá en la campana de sus destinatarios.")
      await cargarDatos()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el mensaje.")
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(item: RecordatorioDb) {
    setGuardando(true)
    try {
      await cambiarEstadoRecordatorioDb(item.id, !item.activo)
      setExito(item.activo ? "El mensaje fue desactivado." : "El mensaje fue reactivado.")
      await cargarDatos()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el mensaje.")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main className="reminders-page">
      <style>{css}</style>
      <ModalMensaje abierto={Boolean(exito)} tipo="EXITO" mensaje={exito} cerrar={() => setExito("")} cierreAutomaticoMs={4000} />
      <ModalMensaje abierto={Boolean(error)} tipo="ERROR" mensaje={error} cerrar={() => setError("")} />

      <header className="reminders-header">
        <div><span>COMUNICACIÓN INTERNA</span><h1>Recordatorios y mensajes</h1><p>Programa avisos para todos, para un rol o para una persona específica.</p></div>
        <button type="button" className="secondary" onClick={() => void cargarDatos()} disabled={cargando || guardando}>{cargando ? "Actualizando…" : "Actualizar"}</button>
      </header>

      <section className="reminders-kpis">
        <article><span>Mensajes activos</span><strong>{activos.length}</strong><small>Vigentes o próximos</small></article>
        <article><span>Prioridad alta</span><strong>{activos.filter((item) => item.prioridad === "ALTA").length}</strong><small>Requieren atención</small></article>
        <article><span>Usuarios disponibles</span><strong>{usuarios.length}</strong><small>Destinatarios activos</small></article>
      </section>

      <section className="reminders-panel">
        <div className="panel-heading"><div><span>NUEVO AVISO</span><h2>Crear recordatorio o mensaje</h2></div><small>La campana mostrará el mensaje desde siete días antes de su inicio y hasta su fecha final.</small></div>
        <div className="message-grid">
          <label className="wide">Título<input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Inventario físico de fin de mes" /></label>
          <label>Desde<input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></label>
          <label>Hasta<input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></label>
          <label>Prioridad<select value={prioridad} onChange={(e) => setPrioridad(e.target.value as "NORMAL" | "ALTA")}><option value="NORMAL">Normal</option><option value="ALTA">Alta</option></select></label>
          <label>Destinatarios<select value={destinoTipo} onChange={(e) => setDestinoTipo(e.target.value as DestinoTipo)}><option value="TODOS">Todos los usuarios</option><option value="ROL">Un rol</option><option value="USUARIO">Una persona</option></select></label>
          {destinoTipo === "ROL" && <label>Rol<select value={destinoRol} onChange={(e) => setDestinoRol(e.target.value as AppRole)}>{Object.entries(ETIQUETAS_ROL).map(([codigo, nombreRol]) => <option key={codigo} value={codigo}>{nombreRol}</option>)}</select></label>}
          {destinoTipo === "USUARIO" && <label className="wide">Usuario<select value={destinoUsuario} onChange={(e) => setDestinoUsuario(e.target.value)}><option value="">Seleccionar usuario</option>{usuarios.map((item) => <option key={item.user_id} value={item.user_id}>{item.nombre || item.email} · {etiquetaRol(item.rol)}</option>)}</select></label>}
          <label className="full">Mensaje<textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Escribe el detalle que deben ver los usuarios." /></label>
        </div>
        <div className="actions"><button type="button" onClick={() => void guardar()} disabled={guardando}>{guardando ? "Guardando…" : "Programar mensaje"}</button></div>
      </section>

      <section className="reminders-panel">
        <div className="panel-heading"><div><span>HISTORIAL</span><h2>Mensajes programados</h2></div></div>
        {cargando ? <div className="empty">Cargando mensajes…</div> : recordatorios.length === 0 ? <div className="empty">Todavía no existen mensajes programados.</div> : <div className="message-list">{recordatorios.map((item) => <article key={item.id} className={!item.activo ? "inactive" : ""}><div className={`priority ${item.prioridad.toLowerCase()}`}>{item.prioridad === "ALTA" ? "!" : "i"}</div><div className="message-body"><div><span>{destino(item)}</span><h3>{item.titulo}</h3></div><p>{item.mensaje}</p><small>{fecha(item.fecha_inicio)} a {fecha(item.fecha_fin)}</small></div><button type="button" className="secondary" onClick={() => void cambiarEstado(item)} disabled={guardando}>{item.activo ? "Desactivar" : "Reactivar"}</button></article>)}</div>}
      </section>
    </main>
  )
}

function destino(item: RecordatorioDb) {
  if (item.destino_tipo === "TODOS") return "Todos los usuarios"
  if (item.destino_tipo === "ROL") return etiquetaRol(item.destino_rol)
  return item.destino_usuario_nombre || "Usuario"
}

const css = `
  .reminders-page { padding:4px 28px 42px; color:#321f1c; }
  .reminders-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
  .reminders-header span, .panel-heading span { color:#f27d16; font-size:11px; font-weight:900; letter-spacing:.12em; }
  .reminders-header h1 { margin:6px 0 4px; font-size:32px; }
  .reminders-header p { margin:0; color:#7d6f69; }
  .reminders-page button { min-height:40px; padding:9px 16px; border:0; border-radius:9px; background:#9d2027; color:white; font:inherit; font-weight:800; cursor:pointer; }
  .reminders-page button.secondary { border:1px solid #9d2027; background:white; color:#9d2027; }
  .reminders-page button:disabled { opacity:.55; }
  .reminders-kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:18px; }
  .reminders-kpis article { display:flex; flex-direction:column; gap:7px; min-height:115px; padding:17px; border:1px solid #e6dad4; border-top:3px solid #9d2027; border-radius:13px; background:white; }
  .reminders-kpis span { color:#74625c; font-size:11px; font-weight:900; text-transform:uppercase; }
  .reminders-kpis strong { font-size:27px; }
  .reminders-kpis small { color:#8d7d77; }
  .reminders-panel { margin-bottom:18px; padding:22px; border:1px solid #e7ddd7; border-radius:15px; background:white; box-shadow:0 8px 28px rgba(62,35,29,.045); }
  .panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
  .panel-heading h2 { margin:5px 0 0; font-size:21px; }
  .panel-heading small { max-width:430px; color:#8b7b75; text-align:right; }
  .message-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
  .message-grid .wide { grid-column:span 2; }
  .message-grid .full { grid-column:1/-1; }
  .reminders-page label { display:flex; flex-direction:column; gap:6px; color:#604d47; font-size:11px; font-weight:900; text-transform:uppercase; }
  .reminders-page input, .reminders-page select, .reminders-page textarea { width:100%; min-height:43px; padding:9px 11px; border:1px solid #d9ccc6; border-radius:8px; background:white; color:#2c201d; font:inherit; font-size:14px; text-transform:none; }
  .reminders-page textarea { min-height:90px; resize:vertical; }
  .actions { display:flex; justify-content:flex-end; margin-top:14px; }
  .message-list { display:grid; gap:9px; }
  .message-list article { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:13px; padding:14px; border:1px solid #eadfd9; border-radius:11px; }
  .message-list article.inactive { opacity:.55; background:#f7f4f2; }
  .priority { width:39px; height:39px; display:grid; place-items:center; border-radius:50%; font-size:18px; font-weight:900; background:#dbeafe; color:#1d4ed8; }
  .priority.alta { background:#fee2e2; color:#b91c1c; }
  .message-body { min-width:0; }
  .message-body > div { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .message-body span { padding:3px 7px; border-radius:999px; background:#f2ece8; color:#745e56; font-size:10px; font-weight:900; text-transform:uppercase; }
  .message-body h3 { margin:0; font-size:16px; }
  .message-body p { margin:6px 0; color:#5f504b; }
  .message-body small { color:#8b7d77; }
  .empty { padding:34px; text-align:center; color:#8b7b75; }
  @media(max-width:850px) { .message-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:650px) {
    .reminders-page { padding:4px 14px 26px; }
    .reminders-header { flex-direction:column; }
    .reminders-header h1 { font-size:27px; }
    .reminders-kpis, .message-grid { grid-template-columns:1fr; }
    .message-grid .wide, .message-grid .full { grid-column:auto; }
    .reminders-panel { padding:16px; }
    .panel-heading { flex-direction:column; }
    .panel-heading small { text-align:left; }
    .message-list article { grid-template-columns:auto 1fr; }
    .message-list article > button { grid-column:1/-1; }
  }
`
