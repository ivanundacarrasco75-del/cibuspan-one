import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { useColumnasAjustables } from "../hooks/useColumnasAjustables"
import ImportarDepositosBancarios from "../components/ImportarDepositosBancarios"
import { facturaSinIvaCobro, netoPendienteCobro, sugerirRetencionCobro } from "../utils/retencionesCobros"
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
type Reparto = { efectivo: string; retencion: string }
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
  const [total, setTotal] = useState(Number(factura.total ?? factura.subtotal_importado).toFixed(2)), [fecha, setFecha] = useState(factura.vencimiento ?? previsionCobro(factura)?.fecha ?? "")
  const [motivo, setMotivo] = useState("Total y vencimiento verificados con la factura"), [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const bloqueo = useRef(false)
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return; bloqueo.current = true; setOcupado(true); setError("")
    try { await confirmarFacturaCobro(factura, total, fecha, motivo); guardar() } catch (fallo) { setError(errorTexto(fallo)) } finally { bloqueo.current = false; setOcupado(false) }
  }
  return <VentanaCobros titulo={`Verificar factura · ${factura.comprobante}`} cerrar={cancelar} bloqueado={ocupado}><form className="cxc-panel" onSubmit={enviar}>
    <p>{factura.cliente} · Venta importada sin impuestos: USD {dinero(factura.subtotal_importado)}. Se propone el total de venta sin IVA según la información del negocio. Puedes corregirlo con la factura.</p>
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
  const [editar, setEditar] = useState<FacturaCobro | null>(null), [historia, setHistoria] = useState<{ comprobante: string; factura: FacturaCobro; filas: AplicacionCobro[] } | null>(null)
  const [retenciones, setRetenciones] = useState<Record<string, { base: string; valor: string }>>({})
  const [deposito, setDeposito] = useState(""), [seleccion, setSeleccion] = useState<Record<string, Reparto>>({}), [motivo, setMotivo] = useState("Cobro conciliado para control de caja")
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
  const bloqueado = cargando || ocupado || pendiente !== null
  function aplicarFiltro(inicio: string, fin: string) {
    setFiltro({ desde: inicio, hasta: fin, buscar }); setSoloSemanas(true); setDeposito("")
  }
  async function detalle(f: FacturaCobro) { setError(""); try { setEditar(null); setHistoria({ comprobante: f.comprobante, factura: f, filas: await historialCobro(f.comprobante) }) } catch (e) { setError(errorTexto(e)) } }
  const baseRetencion = (f: FacturaCobro) => JSON.stringify([f.huella, f.total ?? f.subtotal_importado, f.cobrado, f.retenido])
  const retencionActual = (f: FacturaCobro) => retenciones[f.comprobante]?.base === baseRetencion(f) ? retenciones[f.comprobante].valor : sugerirRetencionCobro(facturaSinIvaCobro(f))?.importe ?? ""
  function cambiarRetencion(f: FacturaCobro, valor: string) {
    setRetenciones(actual => ({ ...actual, [f.comprobante]: { base: baseRetencion(f), valor } }))
    setSeleccion(actual => {
      const r = actual[f.comprobante]
      if (!r) return actual
      const completo = centavos(r.efectivo) + centavos(r.retencion) === centavos(f.saldo ?? 0)
      return { ...actual, [f.comprobante]: { ...r, retencion: valor, efectivo: completo ? ((centavos(f.saldo ?? 0) - centavos(valor)) / 100).toFixed(2) : r.efectivo } }
    })
  }
  function cambiar(comprobante: string, campo: keyof Reparto, valor: string) {
    const f = facturas.find(f => f.comprobante === comprobante)
    if (campo === "retencion" && f) cambiarRetencion(f, valor)
    else setSeleccion(s => ({ ...s, [comprobante]: { ...s[comprobante], [campo]: valor } }))
  }
  async function elegirFactura(f: FacturaCobro, elegir: boolean) {
    if (bloqueo.current) return
    if (!elegir) { setSeleccion(actual => { const nuevo = { ...actual }; delete nuevo[f.comprobante]; return nuevo }); return }
    const retencion = retencionActual(f)
    if (!Number.isFinite(Number(retencion)) || centavos(retencion) < 0 || centavos(retencion) > centavos(facturaSinIvaCobro(f).saldo ?? 0)) { setError("Revisa la retención: no puede superar el saldo ni ser negativa."); return }
    let confirmada = f
    if (!f.verificada) {
      const propuesta = facturaSinIvaCobro(f), vencimiento = previsionCobro(f)?.fecha
      if (!puedeEditar || !propuesta.verificada || !vencimiento) { setEditar(f); return }
      bloqueo.current = true; setOcupado(true); setError("")
      try {
        await confirmarFacturaCobro(f, Number(propuesta.total).toFixed(2), vencimiento, "Total según venta de producto sin IVA informado por el usuario; vencimiento según plazo del cliente")
        const actuales = await consultarFacturasCobro(f.fecha_emision, f.fecha_emision, f.comprobante)
        const actual = actuales.find(a => a.comprobante === f.comprobante)
        if (!actual?.verificada || actual.huella !== f.huella) throw new Error("La factura cambió. Actualiza y vuelve a seleccionarla.")
        confirmada = actual
        setFacturas(filas => filas.map(a => a.comprobante === f.comprobante ? actual : a))
      } catch (e) { setError(errorTexto(e)); return } finally { bloqueo.current = false; setOcupado(false) }
    }
    setSeleccion(actual => ({ ...actual, [f.comprobante]: { efectivo: ((centavos(confirmada.saldo ?? 0) - centavos(retencion)) / 100).toFixed(2), retencion } }))
  }
  async function confirmar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return
    if (!pendiente && depositoFuera) { setError("El depósito seleccionado queda fuera de las semanas previstas. Desmarca el filtro semanal para usarlo expresamente."); return }
    if (!pendiente && elegidas.some(f => netoPendienteCobro(f, seleccion[f.comprobante].retencion) === null)) { setError("Revisa la retención de las facturas seleccionadas en Detalle."); return }
    if (!pendiente && (!elegidas.length || totalEfectivo > centavos(dep?.disponible ?? 0))) { setError("Selecciona facturas y revisa el disponible del depósito."); return }
    const solicitud = pendiente ?? { id: crypto.randomUUID(), deposito: deposito || null, motivo, filas: elegidas.map(f => ({ comprobante: f.comprobante, revision: f.revision, huella: f.huella, saldo: Number(f.saldo), efectivo: seleccion[f.comprobante].efectivo || "0", retencion: seleccion[f.comprobante].retencion || "0", referencia_retencion: "", fecha_retencion: null })) }
    if (!pendiente && solicitud.filas.some(f => centavos(f.efectivo) + centavos(f.retencion) <= 0 || centavos(f.efectivo) + centavos(f.retencion) > centavos(f.saldo))) { setError("El cobro más la retención debe ser mayor que cero y no superar el saldo de cada factura."); return }
    bloqueo.current = true; setOcupado(true); setPendiente(solicitud); setEditar(null); setAnular(null); setHistoria(null); setError("")
    try { await conciliarCobro(solicitud); setPendiente(null); setAviso("Conciliación registrada para control de caja. Se aplicaron el dinero recibido y la retención descontada."); actualizar() }
    catch (fallo) { if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null); setError(errorTexto(fallo)) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  async function confirmarAnulacion(e: FormEvent) {
    e.preventDefault(); if (!anular || bloqueo.current || pendiente) return; bloqueo.current = true; setOcupado(true); setError("")
    try { await anularCobro(anular.aplicacion, anular.deposito, motivoAnular); setAnular(null); setMotivoAnular(""); setAviso("Movimiento anulado con registro del responsable y motivo."); actualizar() }
    catch (fallo) { setError(errorTexto(fallo)) } finally { bloqueo.current = false; setOcupado(false) }
  }
  return <main className="compras-sri-pagina fin-pagos cxc-pagina"><header className="compras-sri-cabecera"><h1>Cuentas por cobrar y conciliación</h1><button disabled={bloqueado} onClick={actualizar}>Actualizar</button></header>
    {tab === "Conciliar" && <p>Control de caja: el depósito es el dinero recibido; la retención se descuenta de la factura. Contabilidad gestiona sus comprobantes.</p>}
    {tab !== "Conciliar" && <p>Saldo de factura = total confirmado − cobros − retenciones. Las retenciones no son depósitos bancarios.</p>}
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
      {tab === "Conciliar" ? <p>{facturas.length} facturas en el rango. Marca las facturas de un mismo pago; el neto por cobrar ya descuenta la retención. Puedes corregirla en Detalle.</p> : <p>{facturas.length} facturas en el rango · {facturas.filter(f => !f.verificada).length} por verificar. Productos sin IVA: se propone el valor de venta como total. Al elegir una factura nueva se confirma ese total y su plazo, registrando al responsable. Puedes corregirlos en Verificar total.</p>}
      {tab === "Conciliar" && <div className="fin-pagos-filtros"><label>Depósito a distribuir <select aria-label="Depósito a distribuir" disabled={bloqueado || !puedeConciliar} value={deposito} onChange={e => { setDeposito(e.target.value); setError("") }}><option value="">Sin depósito · solo registrar retenciones</option>{depositoFuera && dep && <option value={dep.id}>Fuera de semanas · {dep.fecha} · {dep.referencia}</option>}{depositosVisibles.filter(d => !d.anulado && Number(d.disponible) > 0).map(d => <option key={d.id} value={d.id}>{d.fecha} · {d.banco} · {d.referencia} · disponible USD {dinero(d.disponible)}</option>)}</select></label>
        <span>Disponible: USD {dinero(dep?.disponible ?? 0)}</span></div>}
      {tab === "Conciliar" ? <div className="compras-sri-contenedor cxc-scroll cxc-compacta"><TablaCobros modo="conciliar-facturas" titulo="Facturas por cobrar" columnas={["Elegir", "Emisión", "Factura", "Cliente", "Semana de pago", "Neto por cobrar", "Acciones"]}>
        <tbody>{facturasOrdenadas.map(f => { const calculada = facturaSinIvaCobro(f), previsto = previsiones.get(f.comprobante), neto = netoPendienteCobro(f, retencionActual(f)); return <tr key={f.comprobante}>
          <td><input aria-label={`Elegir factura ${f.comprobante}`} type="checkbox" disabled={bloqueado || !puedeConciliar || (!f.verificada && (!puedeEditar || !calculada.verificada || !previsto)) || neto === null || Number(calculada.saldo) <= 0} checked={!!seleccion[f.comprobante]} onChange={e => void elegirFactura(f, e.target.checked)} /></td>
          <td>{f.fecha_emision}</td><td>{f.comprobante}</td><td>{f.cliente}</td><td>{previsto ? `${previsto.desde} al ${previsto.hasta}` : "Sin plazo"}</td><td className="cxc-neto" aria-label={`Neto por cobrar ${f.comprobante}`}>{neto === null ? "Revisar en Detalle" : dinero(neto)}</td>
          <td><button disabled={bloqueado} onClick={() => void detalle(f)}>Detalle</button></td></tr> })}{!facturas.length && !cargando && <tr><td colSpan={7}>No hay facturas en este rango.</td></tr>}</tbody></TablaCobros></div> : <>
      <div className="compras-sri-contenedor cxc-scroll"><TablaCobros modo="facturas" titulo="Facturas por cobrar" columnas={["Emisión", "Semana de emisión", "Factura", "Cliente", "Venta sin impuestos", "Total de factura", "Vencimiento", "Semana de pago", "Cobrado", "Retención registrada", "Retención calculada", "Saldo", "Estado", "Acciones"]}>
        <tbody>{facturasOrdenadas.map(f => { const previsto = previsiones.get(f.comprobante), calculada = facturaSinIvaCobro(f), sugerencia = sugerirRetencionCobro(calculada); return <tr key={f.comprobante}>
          <td>{f.fecha_emision}</td><td>{semanaEmisionCobro(f.fecha_emision)?.etiqueta ?? "—"}</td><td>{f.comprobante}</td><td>{f.cliente}</td><td>{dinero(f.subtotal_importado)}</td><td>{dinero(calculada.total)}{!f.verificada && calculada.verificada && " (IVA 0 %)"}</td><td>{f.vencimiento ?? (previsto ? `${previsto.fecha} (sugerido)` : "—")}</td><td>{previsto ? `${previsto.desde} al ${previsto.hasta}` : "Sin plazo"}</td><td>{dinero(f.cobrado)}</td><td>{dinero(f.retenido)}</td><td><input aria-label={`Retención calculada ${f.comprobante}`} type="number" min="0" step="0.01" max={calculada.saldo ?? 0} disabled={bloqueado || !puedeConciliar || !calculada.verificada || Number(calculada.saldo) <= 0} value={retencionActual(f)} onChange={e => cambiarRetencion(f, e.target.value)} />{sugerencia && <span> {sugerencia.porcentaje.toLocaleString("es-EC")} %</span>}</td><td>{dinero(calculada.saldo)}</td>
          <td>{!f.fuente_valida ? "Revisar cliente / fecha en Ventas" : !f.verificada ? calculada.verificada ? "Total propuesto sin IVA" : "Por verificar total" : Number(f.saldo) === 0 ? "Saldada" : f.vencimiento && f.vencimiento < hoy() ? "Vencida" : "Pendiente"}</td>
          <td>{puedeEditar && <button disabled={bloqueado || !f.fuente_valida} onClick={() => { setHistoria(null); setEditar(f) }}>{f.verificada ? "Editar total" : "Verificar total"}</button>}{" "}<button disabled={bloqueado} onClick={() => void detalle(f)}>Detalle</button></td></tr> })}{!facturas.length && !cargando && <tr><td colSpan={14}>No hay facturas en este rango.</td></tr>}</tbody></TablaCobros></div>
      </>}
      {editar && <EditarFactura key={editar.comprobante} factura={editar} cancelar={() => setEditar(null)} guardar={() => { setAviso("Total y vencimiento confirmados con registro del responsable."); actualizar() }} />}
    </>}
    {tab === "Depósitos recibidos" && <>{puedeConciliar && <><ImportarDepositosBancarios deshabilitado={bloqueado} alGuardar={r => { setSoloSemanas(false); setDeposito(""); setAviso(`${r.creados} depósitos importados por USD ${dinero(r.importe_creado)}; ${r.duplicados} duplicados omitidos. Quedan pendientes de identificar. Se muestran todos los depósitos.`); actualizar() }} /><FormularioDeposito guardar={id => { setSoloSemanas(false); setDeposito(id); setAviso("Depósito registrado; puedes distribuirlo en Conciliar."); actualizar() }} /></>}
      <div className="compras-sri-contenedor cxc-scroll"><TablaCobros modo="depositos" titulo="Depósitos recibidos" columnas={["Fecha", "Banco / cuenta", "Referencia", "Depositante", "Importe", "Aplicado", "Por identificar", "Estado", "Acciones"]}>
        <tbody>{depositosVisibles.map(d => <tr key={d.id}><td>{d.fecha}</td><td>{d.banco}</td><td>{d.referencia}</td><td>{d.ordenante}</td><td>{dinero(d.monto)}</td><td>{dinero(d.aplicado)}</td><td>{dinero(d.disponible)}</td><td>{d.anulado ? "Anulado" : Number(d.disponible) === 0 ? "Conciliado" : Number(d.aplicado) > 0 ? "Parcialmente identificado" : "Pendiente de identificar"}</td>
          <td>{!d.anulado && puedeConciliar && <><button disabled={bloqueado || Number(d.disponible) <= 0} onClick={() => { setDeposito(d.id); setTab("Conciliar") }}>Conciliar</button>{" "}{Number(d.aplicado) === 0 && <button disabled={bloqueado} onClick={() => setAnular({ aplicacion: null, deposito: d.id })}>Anular</button>}</>}</td></tr>)}{!depositosVisibles.length && <tr><td colSpan={9}>{soloSemanas ? "No hay depósitos en las semanas previstas. Desmarca el filtro para ver todos." : "No hay depósitos registrados."}</td></tr>}</tbody></TablaCobros></div></>}
    {tab === "Conciliar" && puedeConciliar && <form className="cxc-panel" onSubmit={confirmar}><h2>Facturas del pago</h2>
      <p className="cxc-comparacion" role="status">{elegidas.length} facturas seleccionadas · Importe a buscar en el banco: <strong>USD {dinero(totalEfectivo / 100)}</strong></p>
      {!!elegidas.length && <section aria-label="Depósitos coincidentes"><h3>Depósitos con el mismo importe</h3><p>La comparación usa el disponible del depósito y respeta el filtro de semanas. Elige el depósito después de identificar al cliente.</p>
        <div className="compras-sri-contenedor cxc-scroll cxc-compacta"><TablaCobros modo="coincidencias" titulo="Depósitos con el mismo importe" columnas={["Fecha", "Referencia", "Banco / cuenta", "Disponible", "Acciones"]}><tbody>
          {depositosVisibles.filter(d => !d.anulado && totalEfectivo > 0 && centavos(d.disponible) === totalEfectivo).map(d => <tr key={d.id}><td>{d.fecha}</td><td>{d.referencia}</td><td>{d.banco}</td><td>{dinero(d.disponible)}</td><td><button type="button" disabled={bloqueado} onClick={() => { setDeposito(d.id); setError("") }}>{deposito === d.id ? "Depósito elegido" : "Usar depósito"}</button></td></tr>)}
          {!depositosVisibles.some(d => !d.anulado && totalEfectivo > 0 && centavos(d.disponible) === totalEfectivo) && <tr><td colSpan={5}>No hay coincidencias exactas. Puedes marcar más facturas del pago, corregir el importe o elegir otro depósito en el selector.</td></tr>}
        </tbody></TablaCobros></div></section>}
      <fieldset disabled={bloqueado}><div className="compras-sri-contenedor cxc-compacta"><TablaCobros modo="distribucion-neta" titulo="Distribución del depósito" columnas={["Factura", "Cliente", "Neto por cobrar", "Pago a aplicar", "Acciones"]}>
        <tbody>{elegidas.map(f => { const r = seleccion[f.comprobante]; return <tr key={f.comprobante}><td>{f.comprobante}</td><td>{f.cliente}</td><td>{dinero(netoPendienteCobro(f, r.retencion))}</td>
          <td><input aria-label={`Cobro ${f.comprobante}`} type="number" min="0" step="0.01" max={netoPendienteCobro(f, r.retencion) ?? 0} value={r.efectivo} onChange={e => cambiar(f.comprobante, "efectivo", e.target.value)} /></td>
          <td><button type="button" onClick={() => void detalle(f)}>Detalle</button></td></tr> })}{!elegidas.length && <tr><td colSpan={5}>Marca las facturas que corresponden al pago.</td></tr>}</tbody></TablaCobros></div>
        <p>Pago a aplicar: USD {dinero(totalEfectivo / 100)} · Depósito por identificar: USD {dinero((centavos(dep?.disponible ?? 0) - totalEfectivo) / 100)}</p>
        <label>Motivo / verificación <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label></fieldset>
      <button disabled={ocupado || cargando || (!pendiente && !elegidas.length)}>{pendiente ? "Reintentar conciliación" : "Confirmar conciliación"}</button></form>}
    {historia && <VentanaCobros titulo={`Detalle de cobros · ${historia.comprobante}`} cerrar={() => setHistoria(null)}><section className="cxc-panel">
      <p>{historia.factura.cliente}</p>
      <dl className="cxc-desglose"><dt>Venta sin impuestos</dt><dd>{dinero(historia.factura.subtotal_importado)}</dd><dt>Total de factura</dt><dd>{dinero(facturaSinIvaCobro(historia.factura).total)}</dd><dt>Cobrado</dt><dd>{dinero(historia.factura.cobrado)}</dd><dt>Retención registrada</dt><dd>{dinero(historia.factura.retenido)}</dd><dt>Saldo contable</dt><dd>{dinero(facturaSinIvaCobro(historia.factura).saldo)}</dd></dl>
      <label>Retención pendiente USD <input aria-label={`Retención ${historia.comprobante}`} type="number" min="0" step="0.01" max={facturaSinIvaCobro(historia.factura).saldo ?? 0} value={retencionActual(historia.factura)} disabled={bloqueado || !puedeConciliar || !facturaSinIvaCobro(historia.factura).verificada} onChange={e => cambiarRetencion(historia.factura, e.target.value)} /></label>
      {sugerirRetencionCobro(facturaSinIvaCobro(historia.factura))?.importe != null && <button type="button" disabled={bloqueado || !puedeConciliar} onClick={() => cambiarRetencion(historia.factura, sugerirRetencionCobro(facturaSinIvaCobro(historia.factura))!.importe!)}>Usar retención sugerida</button>}
      <p>Neto por cobrar: <strong>USD {dinero(netoPendienteCobro(historia.factura, retencionActual(historia.factura)))}</strong></p>
      {puedeEditar && <button type="button" disabled={bloqueado || !historia.factura.fuente_valida} onClick={() => { setEditar(historia.factura); setHistoria(null) }}>{historia.factura.verificada ? "Editar total" : "Verificar total"}</button>}
      <h3>Movimientos registrados</h3><div className="compras-sri-contenedor"><TablaCobros modo="detalle" titulo="Detalle de cobros" columnas={["Registro", "Responsable", "Depósito / fecha", "Cobro", "Retención", "Soporte contable", "Estado", "Acciones"]}><tbody>
      {historia.filas.map(a => <tr key={a.id}><td>{new Date(a.creado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</td><td>{a.responsable}</td><td>{a.banco} {a.referencia_deposito ?? "—"} · {a.fecha_deposito ?? "—"}</td><td>{dinero(a.efectivo)}</td><td>{dinero(a.retencion)}</td><td>{a.referencia_retencion ? `${a.referencia_retencion} · ${a.fecha_retencion ?? "—"}` : Number(a.retencion) > 0 ? "Gestionado por Contabilidad" : "—"}</td><td>{a.anulada ? "Anulado" : "Aplicado"}</td><td>{!a.anulada && puedeConciliar && <button disabled={bloqueado} onClick={() => { setHistoria(null); setAnular({ aplicacion: a.id, deposito: null }) }}>Anular aplicación</button>}</td></tr>)}{!historia.filas.length && <tr><td colSpan={8}>Sin cobros ni retenciones registrados.</td></tr>}</tbody></TablaCobros></div><button onClick={() => setHistoria(null)}>Cerrar detalle</button></section></VentanaCobros>}
    {anular && <VentanaCobros titulo="Anular movimiento" cerrar={() => setAnular(null)} bloqueado={ocupado}><form className="cxc-panel" onSubmit={confirmarAnulacion}><p>La anulación conserva el historial y restaura los saldos correspondientes.</p><label>Motivo de anulación <input aria-label="Motivo de anulación" required minLength={5} maxLength={500} disabled={ocupado} value={motivoAnular} onChange={e => setMotivoAnular(e.target.value)} /></label>{" "}{error && <p role="alert">{error}</p>}<button disabled={ocupado}>Confirmar anulación</button>{" "}<button type="button" disabled={ocupado} onClick={() => setAnular(null)}>Cancelar</button></form></VentanaCobros>}
  </main>
}
