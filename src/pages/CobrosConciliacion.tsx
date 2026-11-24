import { useEffect, useRef, useState, type FormEvent } from "react"
import { anularCobro, conciliarCobro, confirmarFacturaCobro, consultarDepositosCobro, consultarFacturasCobro, crearDepositoCobro, historialCobro,
  type AplicacionCobro, type ConciliacionCobro, type DepositoCobro, type FacturaCobro, type NuevoDeposito } from "../repositories/cobrosRepository"
import "./comprasSriTabla.css"
import "./finanzasPagosCompras.css"
import "./cobrosConciliacion.css"
const hoy = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format()
const dinero = (n: number | string | null) => n === null ? "—" : Number(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const centavos = (n: string | number) => Math.round(Number(n || 0) * 100)
const errorTexto = (e: unknown) => e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo completar la operación."
type Reparto = { efectivo: string; retencion: string; referencia_retencion: string; fecha_retencion: string }
function EditarFactura({ factura, guardar, cancelar }: { factura: FacturaCobro; guardar: () => void; cancelar: () => void }) {
  const [total, setTotal] = useState(factura.total === null ? "" : Number(factura.total).toFixed(2)), [fecha, setFecha] = useState(factura.vencimiento ?? "")
  const [motivo, setMotivo] = useState("Total y vencimiento verificados con la factura"), [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const bloqueo = useRef(false)
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return; bloqueo.current = true; setOcupado(true); setError("")
    try { await confirmarFacturaCobro(factura, total, fecha, motivo); guardar() } catch (fallo) { setError(errorTexto(fallo)) } finally { bloqueo.current = false; setOcupado(false) }
  }
  return <form className="cxc-panel" onSubmit={enviar}><h2>Verificar factura · {factura.comprobante}</h2>
    <p>{factura.cliente} · Venta importada sin impuestos: USD {dinero(factura.subtotal_importado)}. Ingresa el total real de la factura, incluidos los impuestos que correspondan.</p>
    <fieldset disabled={ocupado}><label>Total real USD <input aria-label="Total real de la factura" type="number" min="0.01" max="999999999.99" step="0.01" required value={total} onChange={e => setTotal(e.target.value)} /></label>
      <label>Vencimiento <input aria-label="Vencimiento de la factura" type="date" required value={fecha} onChange={e => setFecha(e.target.value)} /></label>
      <label>Motivo <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label></fieldset>
    {error && <p role="alert">{error}</p>}<button disabled={ocupado}>Confirmar total y vencimiento</button>{" "}<button type="button" disabled={ocupado} onClick={cancelar}>Cerrar</button></form>
}
function FormularioDeposito({ guardar }: { guardar: (id: string) => void }) {
  const nuevo = (): NuevoDeposito => ({ id: crypto.randomUUID(), banco: "", referencia: "", fecha: hoy(), monto: "", ordenante: "", observaciones: "" })
  const [datos, setDatos] = useState(nuevo), [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const [pendiente, setPendiente] = useState<NuevoDeposito | null>(null), bloqueo = useRef(false)
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return; const solicitud = pendiente ?? { ...datos }; bloqueo.current = true; setOcupado(true); setPendiente(solicitud); setError("")
    try { await crearDepositoCobro(solicitud); setPendiente(null); setDatos(nuevo()); guardar(solicitud.id) }
    catch (fallo) { if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null); setError(errorTexto(fallo)) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  const cambiar = (campo: keyof NuevoDeposito, valor: string) => setDatos(d => ({ ...d, [campo]: valor }))
  return <form className="cxc-panel" onSubmit={enviar}><h2>Registrar depósito</h2><p>Puedes dejarlo pendiente de identificar. El importe debe coincidir con el dinero recibido en el banco.</p>
    <fieldset disabled={ocupado || pendiente !== null}>
      <label>Banco / cuenta <input aria-label="Banco del depósito" required minLength={2} maxLength={120} value={datos.banco} onChange={e => cambiar("banco", e.target.value)} /></label>
      <label>Número de depósito <input aria-label="Número de depósito" required maxLength={100} value={datos.referencia} onChange={e => cambiar("referencia", e.target.value)} /></label>
      <label>Fecha <input aria-label="Fecha del depósito" type="date" required value={datos.fecha} onChange={e => cambiar("fecha", e.target.value)} /></label>
      <label>Importe USD <input aria-label="Importe del depósito" type="number" required min="0.01" max="999999999.99" step="0.01" value={datos.monto} onChange={e => cambiar("monto", e.target.value)} /></label>
      <label>Depositante / cliente <input maxLength={200} value={datos.ordenante} onChange={e => cambiar("ordenante", e.target.value)} /></label>
      <label>Observaciones <input maxLength={500} value={datos.observaciones} onChange={e => cambiar("observaciones", e.target.value)} /></label>
    </fieldset>{error && <p role="alert">{error}</p>}<button disabled={ocupado}>{pendiente ? "Reintentar registro" : "Guardar depósito"}</button></form>
}
export default function CobrosConciliacion({ puedeEditar, puedeConciliar, tabInicial = "Facturas y saldos" }: { puedeEditar: boolean; puedeConciliar: boolean; tabInicial?: string }) {
  const [tab, setTab] = useState(tabInicial), [desde, setDesde] = useState(hoy().slice(0, 4) + "-01-01"), [hasta, setHasta] = useState(hoy()), [buscar, setBuscar] = useState("")
  const [filtro, setFiltro] = useState({ desde, hasta, buscar }), [revision, setRevision] = useState(0)
  const [facturas, setFacturas] = useState<FacturaCobro[]>([]), [depositos, setDepositos] = useState<DepositoCobro[]>([])
  const [cargando, setCargando] = useState(true), [error, setError] = useState(""), [aviso, setAviso] = useState("")
  const [editar, setEditar] = useState<FacturaCobro | null>(null), [historia, setHistoria] = useState<{ comprobante: string; filas: AplicacionCobro[] } | null>(null)
  const [deposito, setDeposito] = useState(""), [seleccion, setSeleccion] = useState<Record<string, Reparto>>({}), [motivo, setMotivo] = useState("Cobro y retención comprobados con sus documentos")
  const [pendiente, setPendiente] = useState<ConciliacionCobro | null>(null), [ocupado, setOcupado] = useState(false), [anular, setAnular] = useState<{ aplicacion: string | null; deposito: string | null } | null>(null)
  const [motivoAnular, setMotivoAnular] = useState(""), bloqueo = useRef(false)
  useEffect(() => {
    let vigente = true; setCargando(true); setError(""); setSeleccion({}); setHistoria(null); setEditar(null)
    void Promise.all([consultarFacturasCobro(filtro.desde, filtro.hasta, filtro.buscar), consultarDepositosCobro()]).then(([f, d]) => { if (vigente) { setFacturas(f); setDepositos(d) } })
      .catch(e => { if (vigente) { setFacturas([]); setDepositos([]); setError(errorTexto(e)) } }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [filtro, revision])
  const actualizar = () => setRevision(v => v + 1)
  const dep = depositos.find(d => d.id === deposito && !d.anulado)
  const elegidas = facturas.filter(f => seleccion[f.comprobante])
  const totalEfectivo = elegidas.reduce((s, f) => s + centavos(seleccion[f.comprobante].efectivo), 0)
  const totalRetencion = elegidas.reduce((s, f) => s + centavos(seleccion[f.comprobante].retencion), 0)
  const bloqueado = cargando || ocupado || pendiente !== null
  async function detalle(f: FacturaCobro) { setError(""); try { setHistoria({ comprobante: f.comprobante, filas: await historialCobro(f.comprobante) }) } catch (e) { setError(errorTexto(e)) } }
  function cambiar(comprobante: string, campo: keyof Reparto, valor: string) { setSeleccion(s => ({ ...s, [comprobante]: { ...s[comprobante], [campo]: valor } })) }
  async function confirmar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return
    if (!pendiente && (!elegidas.length || totalEfectivo > centavos(dep?.disponible ?? 0))) { setError("Selecciona facturas y revisa el disponible del depósito."); return }
    const solicitud = pendiente ?? { id: crypto.randomUUID(), deposito: deposito || null, motivo, filas: elegidas.map(f => ({ comprobante: f.comprobante, revision: f.revision, huella: f.huella, saldo: Number(f.saldo), efectivo: seleccion[f.comprobante].efectivo || "0", retencion: seleccion[f.comprobante].retencion || "0", referencia_retencion: seleccion[f.comprobante].referencia_retencion, fecha_retencion: seleccion[f.comprobante].fecha_retencion || null })) }
    if (!pendiente && solicitud.filas.some(f => centavos(f.efectivo) + centavos(f.retencion) <= 0 || centavos(f.efectivo) + centavos(f.retencion) > centavos(f.saldo))) { setError("El cobro más la retención debe ser mayor que cero y no superar el saldo de cada factura."); return }
    bloqueo.current = true; setOcupado(true); setPendiente(solicitud); setEditar(null); setAnular(null); setHistoria(null); setError("")
    try { await conciliarCobro(solicitud); setPendiente(null); setAviso("Conciliación registrada. Los saldos se actualizaron con el cobro más la retención."); actualizar() }
    catch (fallo) { if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null); setError(errorTexto(fallo)) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  async function confirmarAnulacion(e: FormEvent) {
    e.preventDefault(); if (!anular || bloqueo.current || pendiente) return; bloqueo.current = true; setOcupado(true); setError("")
    try { await anularCobro(anular.aplicacion, anular.deposito, motivoAnular); setAnular(null); setMotivoAnular(""); setAviso("Movimiento anulado con registro del responsable y motivo."); actualizar() }
    catch (fallo) { setError(errorTexto(fallo)) } finally { bloqueo.current = false; setOcupado(false) }
  }
  return <main className="compras-sri-pagina fin-pagos cxc-pagina"><header className="compras-sri-cabecera"><h1>Cuentas por cobrar y conciliación</h1><button disabled={bloqueado} onClick={actualizar}>Actualizar</button></header>
    <p>Saldo de factura = total confirmado − cobros − retenciones. Las retenciones no son depósitos bancarios.</p>
    <p>Los saldos consideran únicamente los cobros y retenciones registrados aquí. Ingresa los cobros históricos correspondientes antes de usar estos saldos como cartera pendiente.</p>
    <nav className="fin-pagos-filtros" aria-label="Secciones de cobros">{["Facturas y saldos", "Depósitos recibidos", "Conciliar"].map(t => <button key={t} disabled={bloqueado} aria-pressed={tab === t} onClick={() => { setTab(t); setHistoria(null); setEditar(null) }}>{t}</button>)}</nav>
    {aviso && <p role="status">{aviso}</p>}{error && <p role="alert" className="compras-sri-error">{error}</p>}{cargando && <p role="status">Cargando facturas y depósitos…</p>}
    {tab !== "Depósitos recibidos" && <>
      <form className="fin-pagos-filtros" onSubmit={e => { e.preventDefault(); if (desde > hasta) { setError("Revisa el rango de fechas."); return } setFiltro({ desde, hasta, buscar }) }}>
        <fieldset disabled={bloqueado}><label>Emisión desde <input aria-label="Emisión desde" type="date" required value={desde} onChange={e => setDesde(e.target.value)} /></label><label>Hasta <input aria-label="Emisión hasta" type="date" required value={hasta} onChange={e => setHasta(e.target.value)} /></label>
          <label>Cliente o factura <input aria-label="Buscar cliente o factura" value={buscar} onChange={e => setBuscar(e.target.value)} /></label><button>Consultar</button></fieldset></form>
      <p>{facturas.length} facturas en el rango · {facturas.filter(f => !f.verificada).length} por verificar. Las ventas importadas no incluyen impuestos; confirma el total real antes de conciliar.</p>
      {tab === "Conciliar" && <div className="fin-pagos-filtros"><label>Depósito a distribuir <select aria-label="Depósito a distribuir" disabled={bloqueado || !puedeConciliar} value={deposito} onChange={e => setDeposito(e.target.value)}><option value="">Sin depósito · solo registrar retenciones</option>{depositos.filter(d => !d.anulado && Number(d.disponible) > 0).map(d => <option key={d.id} value={d.id}>{d.fecha} · {d.banco} · {d.referencia} · disponible USD {dinero(d.disponible)}</option>)}</select></label>
        <span>Disponible: USD {dinero(dep?.disponible ?? 0)}</span></div>}
      <div className="compras-sri-contenedor cxc-scroll"><table className="compras-sri-tabla cxc-tabla" aria-label="Facturas por cobrar"><thead><tr>{tab === "Conciliar" && <th>Elegir</th>}<th>Emisión</th><th>Factura</th><th>Cliente</th><th>Venta sin impuestos</th><th>Total confirmado</th><th>Vencimiento</th><th>Cobrado</th><th>Retenido</th><th>Saldo</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{facturas.map(f => <tr key={f.comprobante}>{tab === "Conciliar" && <td><input aria-label={`Elegir factura ${f.comprobante}`} type="checkbox" disabled={bloqueado || !puedeConciliar || !f.verificada || Number(f.saldo) <= 0} checked={!!seleccion[f.comprobante]} onChange={e => setSeleccion(actual => { const nuevo = { ...actual }; if (e.target.checked) nuevo[f.comprobante] = { efectivo: "", retencion: "", referencia_retencion: "", fecha_retencion: "" }; else delete nuevo[f.comprobante]; return nuevo })} /></td>}
          <td>{f.fecha_emision}</td><td>{f.comprobante}</td><td>{f.cliente}</td><td>{dinero(f.subtotal_importado)}</td><td>{dinero(f.total)}</td><td>{f.vencimiento ?? "—"}</td><td>{dinero(f.cobrado)}</td><td>{dinero(f.retenido)}</td><td>{dinero(f.saldo)}</td>
          <td>{!f.fuente_valida ? "Revisar cliente / fecha en Ventas" : !f.verificada ? "Por verificar total" : Number(f.saldo) === 0 ? "Saldada" : f.vencimiento && f.vencimiento < hoy() ? "Vencida" : "Pendiente"}</td>
          <td>{puedeEditar && <button disabled={bloqueado || !f.fuente_valida} onClick={() => setEditar(f)}>{f.verificada ? "Editar total" : "Verificar total"}</button>}{" "}<button disabled={bloqueado} onClick={() => void detalle(f)}>Detalle</button></td></tr>)}{!facturas.length && !cargando && <tr><td colSpan={tab === "Conciliar" ? 13 : 12}>No hay facturas en este rango.</td></tr>}</tbody></table></div>
      {editar && <EditarFactura key={editar.comprobante} factura={editar} cancelar={() => setEditar(null)} guardar={() => { setAviso("Total y vencimiento confirmados con registro del responsable."); actualizar() }} />}
    </>}
    {tab === "Depósitos recibidos" && <>{puedeConciliar && <FormularioDeposito guardar={id => { setDeposito(id); setAviso("Depósito registrado; puedes distribuirlo en Conciliar."); actualizar() }} />}
      <div className="compras-sri-contenedor cxc-scroll"><table className="compras-sri-tabla cxc-tabla" aria-label="Depósitos recibidos"><thead><tr><th>Fecha</th><th>Banco / cuenta</th><th>Referencia</th><th>Depositante</th><th>Importe</th><th>Aplicado</th><th>Por identificar</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{depositos.map(d => <tr key={d.id}><td>{d.fecha}</td><td>{d.banco}</td><td>{d.referencia}</td><td>{d.ordenante}</td><td>{dinero(d.monto)}</td><td>{dinero(d.aplicado)}</td><td>{dinero(d.disponible)}</td><td>{d.anulado ? "Anulado" : Number(d.disponible) === 0 ? "Conciliado" : Number(d.aplicado) > 0 ? "Parcialmente identificado" : "Pendiente de identificar"}</td>
          <td>{!d.anulado && puedeConciliar && <><button disabled={bloqueado || Number(d.disponible) <= 0} onClick={() => { setDeposito(d.id); setTab("Conciliar") }}>Conciliar</button>{" "}{Number(d.aplicado) === 0 && <button disabled={bloqueado} onClick={() => setAnular({ aplicacion: null, deposito: d.id })}>Anular</button>}</>}</td></tr>)}{!depositos.length && <tr><td colSpan={9}>No hay depósitos registrados.</td></tr>}</tbody></table></div></>}
    {tab === "Conciliar" && puedeConciliar && <form className="cxc-panel" onSubmit={confirmar}><h2>Distribución del cobro y retenciones</h2>
      <fieldset disabled={bloqueado}><div className="compras-sri-contenedor"><table className="compras-sri-tabla cxc-tabla" aria-label="Distribución del depósito"><thead><tr><th>Factura</th><th>Cliente</th><th>Saldo</th><th>Dinero del depósito</th><th>Retención</th><th>N.º comprobante retención</th><th>Fecha retención</th><th>Saldo después</th></tr></thead>
        <tbody>{elegidas.map(f => { const r = seleccion[f.comprobante]; return <tr key={f.comprobante}><td>{f.comprobante}</td><td>{f.cliente}</td><td>{dinero(f.saldo)}</td>
          <td><input aria-label={`Cobro ${f.comprobante}`} type="number" min="0" step="0.01" max={f.saldo ?? 0} value={r.efectivo} onChange={e => cambiar(f.comprobante, "efectivo", e.target.value)} /></td>
          <td><input aria-label={`Retención ${f.comprobante}`} type="number" min="0" step="0.01" max={f.saldo ?? 0} value={r.retencion} onChange={e => cambiar(f.comprobante, "retencion", e.target.value)} /></td>
          <td><input aria-label={`Comprobante retención ${f.comprobante}`} maxLength={100} required={Number(r.retencion) > 0} value={r.referencia_retencion} onChange={e => cambiar(f.comprobante, "referencia_retencion", e.target.value)} /></td>
          <td><input aria-label={`Fecha retención ${f.comprobante}`} type="date" required={Number(r.retencion) > 0} value={r.fecha_retencion} onChange={e => cambiar(f.comprobante, "fecha_retencion", e.target.value)} /></td>
          <td>{dinero((centavos(f.saldo ?? 0) - centavos(r.efectivo) - centavos(r.retencion)) / 100)}</td></tr> })}{!elegidas.length && <tr><td colSpan={8}>Marca las facturas verificadas que corresponden al cobro.</td></tr>}</tbody></table></div>
        <p>Dinero aplicado: USD {dinero(totalEfectivo / 100)} · Retenciones: USD {dinero(totalRetencion / 100)} · Depósito por identificar: USD {dinero((centavos(dep?.disponible ?? 0) - totalEfectivo) / 100)}</p>
        <label>Motivo / verificación <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label></fieldset>
      <button disabled={ocupado || cargando || (!pendiente && !elegidas.length)}>{pendiente ? "Reintentar conciliación" : "Confirmar conciliación"}</button></form>}
    {historia && <section className="cxc-panel"><h2>Detalle de cobros · {historia.comprobante}</h2><div className="compras-sri-contenedor"><table className="compras-sri-tabla cxc-tabla"><thead><tr><th>Registro</th><th>Responsable</th><th>Depósito / fecha</th><th>Cobro</th><th>Retención</th><th>Comprobante / fecha retención</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {historia.filas.map(a => <tr key={a.id}><td>{new Date(a.creado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</td><td>{a.responsable}</td><td>{a.banco} {a.referencia_deposito ?? "—"} · {a.fecha_deposito ?? "—"}</td><td>{dinero(a.efectivo)}</td><td>{dinero(a.retencion)}</td><td>{a.referencia_retencion || "—"} · {a.fecha_retencion ?? "—"}</td><td>{a.anulada ? "Anulado" : "Aplicado"}</td><td>{!a.anulada && puedeConciliar && <button disabled={bloqueado} onClick={() => setAnular({ aplicacion: a.id, deposito: null })}>Anular aplicación</button>}</td></tr>)}{!historia.filas.length && <tr><td colSpan={8}>Sin cobros ni retenciones registrados.</td></tr>}</tbody></table></div><button onClick={() => setHistoria(null)}>Cerrar detalle</button></section>}
    {anular && <form className="cxc-panel" onSubmit={confirmarAnulacion}><h2>Anular movimiento</h2><p>La anulación conserva el historial y restaura los saldos correspondientes.</p><label>Motivo de anulación <input aria-label="Motivo de anulación" required minLength={5} maxLength={500} disabled={ocupado} value={motivoAnular} onChange={e => setMotivoAnular(e.target.value)} /></label>{" "}<button disabled={ocupado}>Confirmar anulación</button>{" "}<button type="button" disabled={ocupado} onClick={() => setAnular(null)}>Cancelar</button></form>}
  </main>
}
