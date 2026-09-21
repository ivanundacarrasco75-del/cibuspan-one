import { useCallback, useEffect, useMemo, useState } from "react"
import {
  actualizarEstadoCompromisoKpiKamDb,
  guardarCompromisoKpiKamDb,
  obtenerCatalogoCompromisosKpiKamDb,
  type CatalogoCompromisosKpiKamDb,
  type CompromisoKpiKamDb,
  type EstadoCompromisoKpiKamDb,
  type PrioridadCompromisoKpiKamDb,
} from "../../repositories/kpiKamRepository"

type Props = {
  periodo: string
  cambiarPeriodo: (periodo: string) => void
  clienteInicial?: string | null
  onActualizado: () => void
}

const VACIO: CatalogoCompromisosKpiKamDb = {
  puede_gestionar: false,
  clientes: [],
  compromisos: [],
}

const ETIQUETA_ESTADO: Record<EstadoCompromisoKpiKamDb, string> = {
  PENDIENTE: "Pendiente",
  EN_GESTION: "En gestión",
  CUMPLIDO: "Cumplido",
  VENCIDO: "Vencido",
  CANCELADO: "Cancelado",
}

function fechaLocal(fecha = new Date()) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function fechaLegible(fecha: string | null) {
  if (!fecha) return "—"
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${fecha}T12:00:00`))
}

export default function KpiKamCompromisos({
  periodo,
  cambiarPeriodo,
  clienteInicial,
  onActualizado,
}: Props) {
  const [catalogo, setCatalogo] = useState(VACIO)
  const [clienteFiltro, setClienteFiltro] = useState(clienteInicial || "TODOS")
  const [estadoFiltro, setEstadoFiltro] = useState("ABIERTOS")
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [clienteId, setClienteId] = useState(clienteInicial || "")
  const [descripcion, setDescripcion] = useState("")
  const [fechaLimite, setFechaLimite] = useState(fechaLocal())
  const [prioridad, setPrioridad] = useState<PrioridadCompromisoKpiKamDb>("MEDIA")
  const [observaciones, setObservaciones] = useState("")
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const cargar = useCallback(async () => {
    setCargando(true)
    setError("")
    try {
      setCatalogo(await obtenerCatalogoCompromisosKpiKamDb(periodo))
    } catch (err) {
      setCatalogo(VACIO)
      setError(err instanceof Error ? err.message : "No se pudieron cargar los compromisos.")
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (!clienteInicial) return
    setClienteFiltro(clienteInicial)
    setClienteId(clienteInicial)
  }, [clienteInicial])

  const compromisos = useMemo(
    () => catalogo.compromisos.filter((compromiso) => {
      if (clienteFiltro !== "TODOS" && compromiso.cliente_id !== clienteFiltro) return false
      if (estadoFiltro === "TODOS") return true
      if (estadoFiltro === "ABIERTOS") {
        return ["PENDIENTE", "EN_GESTION", "VENCIDO"].includes(compromiso.estado_efectivo)
      }
      return compromiso.estado_efectivo === estadoFiltro
    }),
    [catalogo.compromisos, clienteFiltro, estadoFiltro],
  )

  const resumen = useMemo(() => ({
    abiertos: catalogo.compromisos.filter((item) => ["PENDIENTE", "EN_GESTION"].includes(item.estado)).length,
    vencidos: catalogo.compromisos.filter((item) => item.estado_efectivo === "VENCIDO").length,
    cumplidos: catalogo.compromisos.filter((item) => item.estado === "CUMPLIDO").length,
  }), [catalogo.compromisos])

  function limpiarFormulario() {
    setEditandoId(null)
    setClienteId(clienteInicial || (clienteFiltro === "TODOS" ? "" : clienteFiltro))
    setDescripcion("")
    setFechaLimite(fechaLocal())
    setPrioridad("MEDIA")
    setObservaciones("")
  }

  function editar(compromiso: CompromisoKpiKamDb) {
    setEditandoId(compromiso.id)
    setClienteId(compromiso.cliente_id)
    setDescripcion(compromiso.descripcion)
    setFechaLimite(compromiso.fecha_limite)
    setPrioridad(compromiso.prioridad)
    setObservaciones(compromiso.observaciones ?? "")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function guardar() {
    if (!clienteId || !descripcion.trim() || !fechaLimite) {
      setError("Selecciona el cliente, escribe el compromiso y define la fecha límite.")
      return
    }

    setGuardando("FORMULARIO")
    setMensaje("")
    setError("")
    try {
      await guardarCompromisoKpiKamDb({
        id: editandoId,
        clienteId,
        descripcion,
        fechaLimite,
        prioridad,
        observaciones,
      })
      setMensaje(editandoId ? "Compromiso actualizado correctamente." : "Compromiso creado correctamente.")
      limpiarFormulario()
      await cargar()
      onActualizado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el compromiso.")
    } finally {
      setGuardando("")
    }
  }

  async function cambiarEstado(
    compromiso: CompromisoKpiKamDb,
    estado: "PENDIENTE" | "EN_GESTION" | "CUMPLIDO" | "CANCELADO",
  ) {
    let motivoCancelacion: string | null = null
    if (estado === "CANCELADO") {
      motivoCancelacion = window.prompt("Escribe el motivo de la cancelación:")?.trim() || null
      if (!motivoCancelacion) return
    }
    if (estado === "CUMPLIDO" && !window.confirm("¿Confirmas que el compromiso fue cumplido hoy?")) return
    if (estado === "PENDIENTE" && !window.confirm("¿Deseas reabrir este compromiso?")) return

    setGuardando(compromiso.id)
    setMensaje("")
    setError("")
    try {
      await actualizarEstadoCompromisoKpiKamDb({
        id: compromiso.id,
        estado,
        motivoCancelacion,
        fechaCumplimiento: estado === "CUMPLIDO" ? fechaLocal() : null,
      })
      setMensaje(`Compromiso actualizado a ${ETIQUETA_ESTADO[estado].toLowerCase()}.`)
      await cargar()
      onActualizado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el compromiso.")
    } finally {
      setGuardando("")
    }
  }

  return (
    <section className="kcomp-page">
      <style>{css}</style>

      <header className="kcomp-head">
        <div><span>GESTIÓN COMERCIAL</span><h2>Compromisos por cliente</h2><p>Registra acuerdos, fechas límite y cumplimiento. Los resultados actualizan el KPI del mes.</p></div>
        <label><span>Periodo del tablero</span><input type="month" value={periodo} onChange={(e) => cambiarPeriodo(e.target.value)} /></label>
      </header>

      {error && <div className="kcomp-aviso error">{error}</div>}
      {mensaje && <div className="kcomp-aviso exito">{mensaje}</div>}

      <section className="kcomp-resumen">
        <article><span>Abiertos</span><strong>{resumen.abiertos}</strong><small>Pendientes o en gestión</small></article>
        <article className={resumen.vencidos > 0 ? "alerta" : ""}><span>Vencidos</span><strong>{resumen.vencidos}</strong><small>Requieren acción inmediata</small></article>
        <article><span>Cumplidos</span><strong>{resumen.cumplidos}</strong><small>Visibles en este periodo</small></article>
      </section>

      {catalogo.puede_gestionar && (
        <section className="kcomp-formulario">
          <header><div><span>{editandoId ? "EDITAR COMPROMISO" : "NUEVO COMPROMISO"}</span><h3>{editandoId ? "Actualizar acuerdo" : "Registrar acuerdo comercial"}</h3></div>{editandoId && <button type="button" className="secundario" onClick={limpiarFormulario}>Cancelar edición</button>}</header>
          <div className="kcomp-campos">
            <label><span>Cliente</span><select value={clienteId} onChange={(e) => setClienteId(e.target.value)}><option value="">Seleccionar cliente</option>{catalogo.clientes.map((cliente) => <option key={cliente.cliente_id} value={cliente.cliente_id}>{cliente.cliente_nombre} · {cliente.kam_nombre || "KAM"}</option>)}</select></label>
            <label className="descripcion"><span>Compromiso</span><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Confirmar codificación del SKU Integral" /></label>
            <label><span>Fecha límite</span><input type="date" min={editandoId ? undefined : fechaLocal()} value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} /></label>
            <label><span>Prioridad</span><select value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadCompromisoKpiKamDb)}><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option></select></label>
            <label className="observaciones"><span>Observaciones</span><input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Información adicional opcional" /></label>
            <button type="button" className="principal" onClick={() => void guardar()} disabled={guardando === "FORMULARIO"}>{guardando === "FORMULARIO" ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear compromiso"}</button>
          </div>
        </section>
      )}

      <section className="kcomp-listado">
        <header>
          <div><span>SEGUIMIENTO</span><h3>Compromisos registrados</h3></div>
          <div className="kcomp-filtros">
            <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}><option value="TODOS">Todos los clientes</option>{catalogo.clientes.map((cliente) => <option key={cliente.cliente_id} value={cliente.cliente_id}>{cliente.cliente_nombre}</option>)}</select>
            <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}><option value="ABIERTOS">Abiertos</option><option value="TODOS">Todos los estados</option><option value="PENDIENTE">Pendientes</option><option value="EN_GESTION">En gestión</option><option value="VENCIDO">Vencidos</option><option value="CUMPLIDO">Cumplidos</option><option value="CANCELADO">Cancelados</option></select>
          </div>
        </header>

        {cargando ? <div className="kcomp-vacio">Cargando compromisos…</div> : compromisos.length === 0 ? <div className="kcomp-vacio">No existen compromisos para estos filtros.</div> : (
          <div className="kcomp-tabla-wrap"><table><thead><tr><th>Cliente / responsable</th><th>Compromiso</th><th>Fecha límite</th><th>Prioridad</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{compromisos.map((compromiso) => (
            <tr key={compromiso.id}>
              <td><strong>{compromiso.cliente_nombre}</strong><small>{compromiso.kam_nombre || "Sin responsable"}</small></td>
              <td><strong>{compromiso.descripcion}</strong>{compromiso.observaciones && <small>{compromiso.observaciones}</small>}{compromiso.motivo_cancelacion && <small>Cancelación: {compromiso.motivo_cancelacion}</small>}</td>
              <td><strong>{fechaLegible(compromiso.fecha_limite)}</strong>{compromiso.fecha_cumplimiento && <small>Cumplido: {fechaLegible(compromiso.fecha_cumplimiento)}</small>}</td>
              <td><span className={`kcomp-prioridad ${compromiso.prioridad.toLowerCase()}`}>{compromiso.prioridad}</span></td>
              <td><span className={`kcomp-estado ${compromiso.estado_efectivo.toLowerCase()}`}>{ETIQUETA_ESTADO[compromiso.estado_efectivo]}</span></td>
              <td><div className="kcomp-acciones"><button type="button" onClick={() => editar(compromiso)} disabled={Boolean(guardando)}>Editar</button>{compromiso.estado === "PENDIENTE" && <button type="button" onClick={() => void cambiarEstado(compromiso, "EN_GESTION")} disabled={Boolean(guardando)}>Iniciar</button>}{["PENDIENTE", "EN_GESTION"].includes(compromiso.estado) ? <><button type="button" className="cumplir" onClick={() => void cambiarEstado(compromiso, "CUMPLIDO")} disabled={Boolean(guardando)}>Cumplir</button><button type="button" className="cancelar" onClick={() => void cambiarEstado(compromiso, "CANCELADO")} disabled={Boolean(guardando)}>Cancelar</button></> : <button type="button" onClick={() => void cambiarEstado(compromiso, "PENDIENTE")} disabled={Boolean(guardando)}>Reabrir</button>}</div></td>
            </tr>
          ))}</tbody></table></div>
        )}
      </section>
    </section>
  )
}

const css = `
.kcomp-page{display:grid;gap:14px;color:#342824}.kcomp-head,.kcomp-formulario,.kcomp-listado,.kcomp-resumen{border:1px solid #e5d8d2;border-radius:15px;background:#fff}.kcomp-head{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:20px}.kcomp-head span,.kcomp-formulario header span,.kcomp-listado header span,.kcomp-campos label>span{display:block;color:#f28c18;font-size:10px;font-weight:900;letter-spacing:.08em}.kcomp-head h2,.kcomp-formulario h3,.kcomp-listado h3{margin:4px 0;color:#8f1d24}.kcomp-head p{margin:0;color:#746762}.kcomp-head label{display:grid;gap:6px;min-width:190px}.kcomp-head input,.kcomp-campos input,.kcomp-campos select,.kcomp-filtros select{border:1px solid #decfc8;border-radius:9px;background:#fbf9f7;padding:10px;color:#342824;font-weight:700}.kcomp-aviso{padding:13px 16px;border-radius:11px}.kcomp-aviso.error{border:1px solid #efc4c7;background:#fff3f4;color:#a01f29}.kcomp-aviso.exito{border:1px solid #bde4cc;background:#effaf3;color:#14733e}.kcomp-resumen{display:grid;grid-template-columns:repeat(3,1fr);overflow:hidden}.kcomp-resumen article{padding:16px 20px}.kcomp-resumen article+article{border-left:1px solid #eee4df}.kcomp-resumen span,.kcomp-resumen small{display:block;color:#81736e;font-size:11px}.kcomp-resumen strong{display:block;margin:5px 0;color:#8f1d24;font-size:27px}.kcomp-resumen article.alerta strong{color:#bd202c}.kcomp-formulario>header,.kcomp-listado>header{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:17px 19px;border-bottom:1px solid #eee4df}.kcomp-formulario h3,.kcomp-listado h3{font-size:19px}.kcomp-formulario button,.kcomp-acciones button{border:1px solid #d8c7c0;border-radius:8px;background:#fff;color:#6a5953;padding:8px 10px;font-weight:800;cursor:pointer}.kcomp-campos{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(270px,1.6fr) minmax(150px,.6fr) minmax(130px,.5fr);gap:11px;padding:18px}.kcomp-campos label{display:grid;gap:6px}.kcomp-campos .observaciones{grid-column:1/-2}.kcomp-campos .principal{align-self:end;border:1px solid #981f28;border-radius:9px;background:#981f28;color:#fff;padding:11px 15px;font-weight:900;cursor:pointer}.kcomp-campos button:disabled,.kcomp-acciones button:disabled{opacity:.55;cursor:wait}.kcomp-filtros{display:flex;gap:8px}.kcomp-filtros select{min-width:190px}.kcomp-tabla-wrap{overflow:auto}.kcomp-tabla-wrap table{width:100%;min-width:1080px;border-collapse:collapse}.kcomp-tabla-wrap th{background:#f7f3f0;color:#6d5d57;font-size:10px;text-transform:uppercase;text-align:left;padding:10px 12px}.kcomp-tabla-wrap td{padding:12px;border-top:1px solid #eee5df;vertical-align:top}.kcomp-tabla-wrap td strong,.kcomp-tabla-wrap td small{display:block}.kcomp-tabla-wrap td small{margin-top:4px;color:#847772;line-height:1.3}.kcomp-prioridad,.kcomp-estado{display:inline-block;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900}.kcomp-prioridad.alta{background:#fee5e7;color:#aa2029}.kcomp-prioridad.media{background:#fff0cf;color:#996200}.kcomp-prioridad.baja{background:#e7f3eb;color:#257248}.kcomp-estado.pendiente{background:#f0ece9;color:#6e625d}.kcomp-estado.en_gestion{background:#fff0cf;color:#996200}.kcomp-estado.cumplido{background:#def4e6;color:#167441}.kcomp-estado.vencido{background:#fee2e4;color:#ad202a}.kcomp-estado.cancelado{background:#ebe8e6;color:#726660}.kcomp-acciones{display:flex;gap:5px;flex-wrap:wrap}.kcomp-acciones button.cumplir{border-color:#288956;color:#167441}.kcomp-acciones button.cancelar{border-color:#c98489;color:#a12029}.kcomp-vacio{padding:30px;text-align:center;color:#81746f}
@media(max-width:900px){.kcomp-campos{grid-template-columns:1fr 1fr}.kcomp-campos .observaciones{grid-column:1/-1}.kcomp-campos .principal{grid-column:1/-1}.kcomp-listado>header{align-items:stretch;flex-direction:column}.kcomp-filtros select{min-width:0;flex:1}}
@media(max-width:620px){.kcomp-head{align-items:stretch;flex-direction:column}.kcomp-head label{min-width:0}.kcomp-resumen{grid-template-columns:1fr}.kcomp-resumen article+article{border-left:0;border-top:1px solid #eee4df}.kcomp-campos{grid-template-columns:1fr}.kcomp-campos .observaciones,.kcomp-campos .principal{grid-column:auto}.kcomp-filtros{flex-direction:column}}
`
