import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { useColumnasAjustables } from "../hooks/useColumnasAjustables"
import { sugerirRetencionCobro } from "../utils/retencionesCobros"
import { depositoEnSemanasCobro, plazoClienteCobro, previsionCobro, rangoMesCobros, semanaEmisionCobro, ventanasCobros } from "../utils/plazosCobros"
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
function TablaCobros({ modo, titulo, columnas, children }: { modo: string; titulo: string; columnas: string[]; children: ReactNode }) {
  const tabla = useRef<HTMLTableElement>(null)
  const anchos = useColumnasAjustables(`cxc-${modo}`, columnas, tabla)
  return <table ref={tabla} className={`compras-sri-tabla cxc-tabla fin-pagos-tabla${anchos.ajustada ? " fin-pagos-ajustada" : ""}`} aria-label={titulo}
    style={anchos.ajustada ? { width: anchos.total, minWidth: anchos.total, tableLayout: "fixed" } : undefined}>
    <colgroup>{columnas.map(c => <col key={c} style={anchos.ajustada ? { width: anchos.ancho(c) } : undefined} />)}</colgroup>
    <thead><tr>{columnas.map(c => <th key={c} scope="col" aria-label={c}><span className="fin-pagos-titulo-columna">{c}</span>
      <span className="fin-pagos-ajustar-columna" role="separator" aria-orientation="vertical" tabIndex={0} aria-label={`Cambiar ancho de ${c}`} aria-valuemin={40} aria-valuemax={900} aria-valuenow={anchos.ancho(c)}
        title="Arrastra para cambiar el ancho. Flechas para ajustar; doble clic para restablecer."
        onPointerDown={e => anchos.iniciar(e, c)} onPointerMove={anchos.mover} onPointerUp={anchos.terminar} onPointerCancel={anchos.terminar} onLostPointerCapture={anchos.terminar}
        onKeyDown={e => anchos.teclado(e, c)} onDoubleClick={() => anchos.restablecer(c)} /></th>)}</tr></thead>{children}
  </table>
}
function VentanaCobros({ titulo, cerrar, bloqueado = false, children }: { titulo: string; cerrar: () => void; bloqueado?: boolean; children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null), tituloId = useId()
  useEffect(() => {
    const ventana = dialogo.current, anterior = document.activeElement
    ventana?.showModal()
    return () => { ventana?.close(); if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus() }
  }, [])
  return <dialog ref={dialogo} className="cxc-ventana" aria-labelledby={tituloId} onCancel={e => { e.preventDefault(); if (!bloqueado) cerrar() }}
    onClick={e => { if (e.target !== e.currentTarget || bloqueado) return; const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cerrar() }}>
    <header><h2 id={tituloId}>{titulo}</h2><button type="button" aria-label="Cerrar ventana" disabled={bloqueado} onClick={cerrar}>×</button></header>{children}
  </dialog>
}
function EditarFactura({ factura, guardar, cancelar }: { factura: FacturaCobro; guardar: () => void; cancelar: () => void }) {
  const [total, setTotal] = useState(factura.total === null ? "" : Number(factura.total).toFixed(2)), [fecha, setFecha] = useState(factura.vencimiento ?? previsionCobro(factura)?.fecha ?? "")
  const [motivo, setMotivo] = useState("Total y vencimiento verificados con la factura"), [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const bloqueo = useRef(false)
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return; bloqueo.current = true; setOcupado(true); setError("")
    try { await confirmarFacturaCobro(factura, total, fecha, motivo); guardar() } catch (fallo) { setError(errorTexto(fallo)) } finally { bloqueo.current = false; setOcupado(false) }
  }
  return <VentanaCobros titulo={`Verificar factura · ${factura.comprobante}`} cerrar={cancelar} bloqueado={ocupado}><form className="cxc-panel" onSubmit={enviar}>
    <p>{factura.cliente} · Venta importada sin impuestos: USD {dinero(factura.subtotal_importado)}. Ingresa el total real de la factura, incluidos los impuestos que correspondan.</p>
    {plazoClienteCobro(factura.cliente) !== null && <p>Plazo informado: {plazoClienteCobro(factura.cliente) === 0 ? "contra factura emitida" : `${plazoClienteCobro(factura.cliente)} días calendario desde la emisión`}. Puedes corregir el vencimiento.</p>}
    <fieldset disabled={ocupado}><label>Total real USD <input aria-label="Total real de la factura" type="number" min="0.01" max="999999999.99" step="0.01" required value={total} onChange={e => setTotal(e.target.value)} /></label>
      <label>Vencimiento <input aria-label="Vencimiento de la factura" type="date" required value={fecha} onChange={e => setFecha(e.target.value)} /></label>
      <label>Motivo <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label></fieldset>
    {error && <p role="alert">{error}</p>}<button disabled={ocupado}>Confirmar total y vencimiento</button>{" "}<button type="button" disabled={ocupado} onClick={cancelar}>Cerrar</button></form></VentanaCobros>
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
  const [mes, setMes] = useState(""), [soloSemanas, setSoloSemanas] = useState(true)
  const [facturas, setFacturas] = useState<FacturaCobro[]>([]), [depositos, setDepositos] = useState<DepositoCobro[]>([])
  const [ordenFacturas, setOrdenFacturas] = useState("antiguo"), [ordenDepositos, setOrdenDepositos] = useState("reciente")
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
  const facturasOrdenadas = useMemo(() => [...facturas].sort((a, b) => (ordenFacturas === "antiguo" ? 1 : -1) *
    (a.fecha_emision.localeCompare(b.fecha_emision) || a.comprobante.localeCompare(b.comprobante, "es", { numeric: true }))), [facturas, ordenFacturas])
  const depositosOrdenados = useMemo(() => [...depositos].sort((a, b) => (ordenDepositos === "antiguo" ? 1 : -1) *
    (a.fecha.localeCompare(b.fecha) || a.referencia.localeCompare(b.referencia, "es", { numeric: true }) || a.id.localeCompare(b.id))), [depositos, ordenDepositos])
  const ventanas = useMemo(() => ventanasCobros(facturas), [facturas])
  const previsiones = useMemo(() => new Map(facturas.map(f => [f.comprobante, previsionCobro(f)])), [facturas])
  const sinPlazo = facturas.length - [...previsiones.values()].filter(Boolean).length
  const depositosVisibles = useMemo(() => soloSemanas ? depositosOrdenados.filter(d => depositoEnSemanasCobro(d.fecha, ventanas)) : depositosOrdenados, [depositosOrdenados, soloSemanas, ventanas])
  const dep = depositos.find(d => d.id === deposito && !d.anulado)
  const depositoFuera = !!dep && soloSemanas && !depositoEnSemanasCobro(dep.fecha, ventanas)
  const elegidas = facturas.filter(f => seleccion[f.comprobante])
  const totalEfectivo = elegidas.reduce((s, f) => s + centavos(seleccion[f.comprobante].efectivo), 0)
  const totalRetencion = elegidas.reduce((s, f) => s + centavos(seleccion[f.comprobante].retencion), 0)
  const bloqueado = cargando || ocupado || pendiente !== null
  function aplicarFiltro(inicio: string, fin: string) {
    setFiltro({ desde: inicio, hasta: fin, buscar }); setSoloSemanas(true); setDeposito("")
  }
  async function detalle(f: FacturaCobro) { setError(""); try { setEditar(null); setHistoria({ comprobante: f.comprobante, filas: await historialCobro(f.comprobante) }) } catch (e) { setError(errorTexto(e)) } }
  function cambiar(comprobante: string, campo: keyof Reparto, valor: string) { setSeleccion(s => ({ ...s, [comprobante]: { ...s[comprobante], [campo]: valor } })) }
  async function confirmar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return
    if (!pendiente && depositoFuera) { setError("El depósito seleccionado queda fuera de las semanas previstas. Desmarca el filtro semanal para usarlo expresamente."); return }
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
    <div className="fin-pagos-filtros"><label>Ordenar por {tab === "Depósitos recibidos" ? "fecha del depósito" : "fecha de emisión"}{" "}
      <select aria-label="Ordenar por fecha" disabled={bloqueado} value={tab === "Depósitos recibidos" ? ordenDepositos : ordenFacturas}
        onChange={e => tab === "Depósitos recibidos" ? setOrdenDepositos(e.target.value) : setOrdenFacturas(e.target.value)}>
        <option value="antiguo">Más antiguo primero</option><option value="reciente">Más reciente primero</option>
      </select></label></div>
    {aviso && <p role="status">{aviso}</p>}{error && <p role="alert" className="compras-sri-error">{error}</p>}{cargando && <p role="status">Cargando facturas y depósitos…</p>}
      <form className="fin-pagos-filtros" onSubmit={e => { e.preventDefault(); if (desde > hasta) { setError("Revisa el rango de fechas."); return } aplicarFiltro(desde, hasta) }}>
        <fieldset disabled={bloqueado}><label>Mes de emisión <input aria-label="Mes de emisión" type="month" value={mes} onChange={e => { setMes(e.target.value); const rango = rangoMesCobros(e.target.value); if (rango) { setDesde(rango.desde); setHasta(rango.hasta); aplicarFiltro(rango.desde, rango.hasta) } }} /></label>
          <label>Emisión desde <input aria-label="Emisión desde" type="date" required value={desde} onChange={e => { setDesde(e.target.value); setMes("") }} /></label><label>Hasta <input aria-label="Emisión hasta" type="date" required value={hasta} onChange={e => { setHasta(e.target.value); setMes("") }} /></label>
          <label>Cliente o factura <input aria-label="Buscar cliente o factura" value={buscar} onChange={e => setBuscar(e.target.value)} /></label><button>Consultar</button></fieldset></form>
      <div className="fin-pagos-filtros"><label><input type="checkbox" aria-label="Solo depósitos de semanas de pago esperadas" checked={soloSemanas} disabled={bloqueado} onChange={e => { setSoloSemanas(e.target.checked); setError("") }} /> Solo depósitos de semanas de pago esperadas</label>
        <span>{depositosVisibles.length} de {depositos.length} depósitos · Facturas emitidas: {filtro.desde} al {filtro.hasta}</span></div>
      <p>Favorita, Rosado y Santa María: 21 días; Tuti: 60 días; Soldmer: contra factura. Se desplaza la semana de emisión completa y se incluyen semanas completas de pago, de lunes a domingo. Los vencimientos corregidos manualmente prevalecen.</p>
      {sinPlazo > 0 && <p>{sinPlazo} facturas sin previsión de cobro: revisa su cliente o vencimiento. Puedes desmarcar el filtro para ver todos los depósitos.</p>}
      {ventanas.length > 0 && <details><summary>Semanas de pago previstas</summary>{ventanas.map(v => <p key={v.desde}>{v.desde} al {v.hasta}</p>)}</details>}
      {depositoFuera && <p role="alert">El depósito seleccionado está fuera de las semanas previstas. Desmarca el filtro semanal si corresponde aplicarlo.</p>}
    {tab !== "Depósitos recibidos" && <>
      <p>{facturas.length} facturas en el rango · {facturas.filter(f => !f.verificada).length} por verificar. Las ventas importadas no incluyen impuestos; confirma el total real antes de conciliar.</p>
      {tab === "Conciliar" && <div className="fin-pagos-filtros"><label>Depósito a distribuir <select aria-label="Depósito a distribuir" disabled={bloqueado || !puedeConciliar} value={deposito} onChange={e => { setDeposito(e.target.value); setError("") }}><option value="">Sin depósito · solo registrar retenciones</option>{depositoFuera && dep && <option value={dep.id}>Fuera de semanas · {dep.fecha} · {dep.referencia}</option>}{depositosVisibles.filter(d => !d.anulado && Number(d.disponible) > 0).map(d => <option key={d.id} value={d.id}>{d.fecha} · {d.banco} · {d.referencia} · disponible USD {dinero(d.disponible)}</option>)}</select></label>
        <span>Disponible: USD {dinero(dep?.disponible ?? 0)}</span></div>}
      <div className="compras-sri-contenedor cxc-scroll"><TablaCobros modo="facturas" titulo="Facturas por cobrar" columnas={[...(tab === "Conciliar" ? ["Elegir"] : []), "Emisión", "Semana de emisión", "Factura", "Cliente", "Venta sin impuestos", "Total confirmado", "Vencimiento", "Semana de pago", "Cobrado", "Retenido", "Saldo", "Estado", "Acciones"]}>
        <tbody>{facturasOrdenadas.map(f => { const previsto = previsiones.get(f.comprobante); return <tr key={f.comprobante}>{tab === "Conciliar" && <td><input aria-label={`Elegir factura ${f.comprobante}`} type="checkbox" disabled={bloqueado || !puedeConciliar || !f.verificada || Number(f.saldo) <= 0} checked={!!seleccion[f.comprobante]} onChange={e => setSeleccion(actual => { const nuevo = { ...actual }; if (e.target.checked) nuevo[f.comprobante] = { efectivo: "", retencion: sugerirRetencionCobro(f)?.importe ?? "", referencia_retencion: "", fecha_retencion: "" }; else delete nuevo[f.comprobante]; return nuevo })} /></td>}
          <td>{f.fecha_emision}</td><td>{semanaEmisionCobro(f.fecha_emision)?.etiqueta ?? "—"}</td><td>{f.comprobante}</td><td>{f.cliente}</td><td>{dinero(f.subtotal_importado)}</td><td>{dinero(f.total)}</td><td>{f.vencimiento ?? (previsto ? `${previsto.fecha} (sugerido)` : "—")}</td><td>{previsto ? `${previsto.desde} al ${previsto.hasta}` : "Sin plazo"}</td><td>{dinero(f.cobrado)}</td><td>{dinero(f.retenido)}</td><td>{dinero(f.saldo)}</td>
          <td>{!f.fuente_valida ? "Revisar cliente / fecha en Ventas" : !f.verificada ? "Por verificar total" : Number(f.saldo) === 0 ? "Saldada" : f.vencimiento && f.vencimiento < hoy() ? "Vencida" : "Pendiente"}</td>
          <td>{puedeEditar && <button disabled={bloqueado || !f.fuente_valida} onClick={() => { setHistoria(null); setEditar(f) }}>{f.verificada ? "Editar total" : "Verificar total"}</button>}{" "}<button disabled={bloqueado} onClick={() => void detalle(f)}>Detalle</button></td></tr> })}{!facturas.length && !cargando && <tr><td colSpan={tab === "Conciliar" ? 15 : 14}>No hay facturas en este rango.</td></tr>}</tbody></TablaCobros></div>
      {editar && <EditarFactura key={editar.comprobante} factura={editar} cancelar={() => setEditar(null)} guardar={() => { setAviso("Total y vencimiento confirmados con registro del responsable."); actualizar() }} />}
    </>}
    {tab === "Depósitos recibidos" && <>{puedeConciliar && <FormularioDeposito guardar={id => { setDeposito(id); setAviso("Depósito registrado; puedes distribuirlo en Conciliar."); actualizar() }} />}
      <div className="compras-sri-contenedor cxc-scroll"><TablaCobros modo="depositos" titulo="Depósitos recibidos" columnas={["Fecha", "Banco / cuenta", "Referencia", "Depositante", "Importe", "Aplicado", "Por identificar", "Estado", "Acciones"]}>
        <tbody>{depositosVisibles.map(d => <tr key={d.id}><td>{d.fecha}</td><td>{d.banco}</td><td>{d.referencia}</td><td>{d.ordenante}</td><td>{dinero(d.monto)}</td><td>{dinero(d.aplicado)}</td><td>{dinero(d.disponible)}</td><td>{d.anulado ? "Anulado" : Number(d.disponible) === 0 ? "Conciliado" : Number(d.aplicado) > 0 ? "Parcialmente identificado" : "Pendiente de identificar"}</td>
          <td>{!d.anulado && puedeConciliar && <><button disabled={bloqueado || Number(d.disponible) <= 0} onClick={() => { setDeposito(d.id); setTab("Conciliar") }}>Conciliar</button>{" "}{Number(d.aplicado) === 0 && <button disabled={bloqueado} onClick={() => setAnular({ aplicacion: null, deposito: d.id })}>Anular</button>}</>}</td></tr>)}{!depositosVisibles.length && <tr><td colSpan={9}>{soloSemanas ? "No hay depósitos en las semanas previstas. Desmarca el filtro para ver todos." : "No hay depósitos registrados."}</td></tr>}</tbody></TablaCobros></div></>}
    {tab === "Conciliar" && puedeConciliar && <form className="cxc-panel" onSubmit={confirmar}><h2>Distribución del cobro y retenciones</h2>
      <p>Referencias informadas: Favorita y Santa María 2 %; Tuti 1,75 %, sobre el total confirmado con IVA. Son sugerencias editables: verifica base, porcentaje e importe con el comprobante. Se descuentan las retenciones ya registradas.</p>
      <fieldset disabled={bloqueado}><div className="compras-sri-contenedor"><TablaCobros modo="distribucion" titulo="Distribución del depósito" columnas={["Factura", "Cliente", "Saldo", "Dinero del depósito", "Retención sugerida", "Retención", "N.º comprobante retención", "Fecha retención", "Saldo después"]}>
        <tbody>{elegidas.map(f => { const r = seleccion[f.comprobante], sugerencia = sugerirRetencionCobro(f); return <tr key={f.comprobante}><td>{f.comprobante}</td><td>{f.cliente}</td><td>{dinero(f.saldo)}</td>
          <td><input aria-label={`Cobro ${f.comprobante}`} type="number" min="0" step="0.01" max={f.saldo ?? 0} value={r.efectivo} onChange={e => cambiar(f.comprobante, "efectivo", e.target.value)} /></td>
          <td>{sugerencia ? <><span>{sugerencia.porcentaje.toLocaleString("es-EC")} % · {sugerencia.importe === null ? "Revisar saldo" : `USD ${dinero(sugerencia.importe)}`}</span>{" "}{sugerencia.importe !== null && <button type="button" aria-label={`Usar retención sugerida ${f.comprobante}`} onClick={() => cambiar(f.comprobante, "retencion", sugerencia.importe!)}>Usar sugerencia</button>}</> : "Ingreso manual"}</td>
          <td><input aria-label={`Retención ${f.comprobante}`} type="number" min="0" step="0.01" max={f.saldo ?? 0} value={r.retencion} onChange={e => cambiar(f.comprobante, "retencion", e.target.value)} /></td>
          <td><input aria-label={`Comprobante retención ${f.comprobante}`} maxLength={100} required={Number(r.retencion) > 0} value={r.referencia_retencion} onChange={e => cambiar(f.comprobante, "referencia_retencion", e.target.value)} /></td>
          <td><input aria-label={`Fecha retención ${f.comprobante}`} type="date" required={Number(r.retencion) > 0} value={r.fecha_retencion} onChange={e => cambiar(f.comprobante, "fecha_retencion", e.target.value)} /></td>
          <td>{dinero((centavos(f.saldo ?? 0) - centavos(r.efectivo) - centavos(r.retencion)) / 100)}</td></tr> })}{!elegidas.length && <tr><td colSpan={9}>Marca las facturas verificadas que corresponden al cobro.</td></tr>}</tbody></TablaCobros></div>
        <p>Dinero aplicado: USD {dinero(totalEfectivo / 100)} · Retenciones: USD {dinero(totalRetencion / 100)} · Depósito por identificar: USD {dinero((centavos(dep?.disponible ?? 0) - totalEfectivo) / 100)}</p>
        <label>Motivo / verificación <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label></fieldset>
      <button disabled={ocupado || cargando || (!pendiente && !elegidas.length)}>{pendiente ? "Reintentar conciliación" : "Confirmar conciliación"}</button></form>}
    {historia && <VentanaCobros titulo={`Detalle de cobros · ${historia.comprobante}`} cerrar={() => setHistoria(null)}><section className="cxc-panel"><div className="compras-sri-contenedor"><TablaCobros modo="detalle" titulo="Detalle de cobros" columnas={["Registro", "Responsable", "Depósito / fecha", "Cobro", "Retención", "Comprobante / fecha retención", "Estado", "Acciones"]}><tbody>
      {historia.filas.map(a => <tr key={a.id}><td>{new Date(a.creado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</td><td>{a.responsable}</td><td>{a.banco} {a.referencia_deposito ?? "—"} · {a.fecha_deposito ?? "—"}</td><td>{dinero(a.efectivo)}</td><td>{dinero(a.retencion)}</td><td>{a.referencia_retencion || "—"} · {a.fecha_retencion ?? "—"}</td><td>{a.anulada ? "Anulado" : "Aplicado"}</td><td>{!a.anulada && puedeConciliar && <button disabled={bloqueado} onClick={() => { setHistoria(null); setAnular({ aplicacion: a.id, deposito: null }) }}>Anular aplicación</button>}</td></tr>)}{!historia.filas.length && <tr><td colSpan={8}>Sin cobros ni retenciones registrados.</td></tr>}</tbody></TablaCobros></div><button onClick={() => setHistoria(null)}>Cerrar detalle</button></section></VentanaCobros>}
    {anular && <VentanaCobros titulo="Anular movimiento" cerrar={() => setAnular(null)} bloqueado={ocupado}><form className="cxc-panel" onSubmit={confirmarAnulacion}><p>La anulación conserva el historial y restaura los saldos correspondientes.</p><label>Motivo de anulación <input aria-label="Motivo de anulación" required minLength={5} maxLength={500} disabled={ocupado} value={motivoAnular} onChange={e => setMotivoAnular(e.target.value)} /></label>{" "}{error && <p role="alert">{error}</p>}<button disabled={ocupado}>Confirmar anulación</button>{" "}<button type="button" disabled={ocupado} onClick={() => setAnular(null)}>Cancelar</button></form></VentanaCobros>}
  </main>
}
