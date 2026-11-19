import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react"
import { guardarEmpaqueCM, listarPedidosCM, type EmpaqueCM, type PedidoCM } from "../repositories/casaMasaRepository"
import { crearPedidoDb, obtenerBodegasClienteDb, obtenerClientesPedidoDb, obtenerProductosClienteDb,
  obtenerRegistrosPedidoPendientesDb, reintentarRegistroPedidoDb, resolverRegistroPedidoDb,
  type BodegaPedidoDb, type ClientePedidoDb, type ProductoPedidoDb } from "../repositories/pedidoRepository"
import type { SolicitudPedidoPendiente } from "../utils/registroPedidoSeguro"
import { CODIGOS_CM, ESTADOS_EMPAQUE_CM, esCodigoCM, fechaLocalCM, validarPedidoCM } from "../utils/casaMasa"
import "./CasaMasa.css"

const errorTexto = (e: unknown) => e instanceof Error ? e.message : "No se pudo completar la operación."
const DespachosV2 = lazy(() => import("./DespachosV2"))
type Props = { puedeDespachar: boolean }

export default function CasaMasa({ puedeDespachar }: Props) {
  const [pedidoPreparacion, setPedidoPreparacion] = useState("")
  const abrirPreparacion = (id: string) => { if (puedeDespachar) setPedidoPreparacion(id) }
  const [desde, setDesde] = useState(fechaLocalCM)
  const [hasta, setHasta] = useState(fechaLocalCM)
  const [periodo, setPeriodo] = useState({ desde, hasta })
  const [pedidos, setPedidos] = useState<PedidoCM[]>([])
  const [seleccion, setSeleccion] = useState<PedidoCM | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [filtro, setFiltro] = useState("ACTIVOS")
  const [busqueda, setBusqueda] = useState("")
  const [revision, setRevision] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [pendientes, setPendientes] = useState<SolicitudPedidoPendiente[]>([])
  const [recuperando, setRecuperando] = useState(false)
  const bloqueoRecuperacion = useRef(false)
  useEffect(() => {
    let vigente = true
    setCargando(true); setError(""); setSeleccion(null)
    Promise.all([listarPedidosCM(periodo.desde, periodo.hasta), obtenerRegistrosPedidoPendientesDb()])
      .then(([p, intentos]) => { if (vigente) { setPedidos(p); setPendientes(intentos) } })
      .catch(e => { if (vigente) { setError(errorTexto(e)); setPedidos([]) } })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [periodo, revision])

  async function recuperar(s: SolicitudPedidoPendiente, comprobar: boolean) {
    if (bloqueoRecuperacion.current) return
    bloqueoRecuperacion.current = true; setRecuperando(true); setMensaje(""); setError("")
    try {
      if (comprobar) {
        const r = await resolverRegistroPedidoDb(s)
        setMensaje(r.estado === "ANULADA" ? "Intento comprobado: no se guardó el pedido. Puedes registrarlo nuevamente." : `Pedido ${r.resultado.numeroPedidoCliente} confirmado${r.resultado.vigente ? "." : "; ya no está vigente."}`)
      } else {
        const r = await reintentarRegistroPedidoDb(s)
        setMensaje(`Pedido ${r.numeroPedidoCliente} confirmado${r.vigente ? "." : "; ya no está vigente."}`)
      }
      setRevision(r => r + 1)
    } catch (e) { setError(errorTexto(e)) }
    finally { bloqueoRecuperacion.current = false; setRecuperando(false) }
  }

  if (pedidoPreparacion) return <section className="cm-page"><button onClick={() => { setPedidoPreparacion(""); setRevision(r => r + 1) }}>← Volver a Casa Masa</button>
    <Suspense fallback={<p>Cargando preparación…</p>}><DespachosV2 pedidoInicialId={pedidoPreparacion} /></Suspense></section>
  const visibles = pedidos.filter(p => (filtro === "TODOS" || (filtro === "ACTIVOS" ? !["DESPACHADO", "CANCELADO", "ENTREGADO"].includes(p.pedido.estado) : p.empaque.estado_empaque === filtro)) &&
    `${p.pedido.numero_pedido_cliente} ${p.pedido.cliente?.nombre} ${p.empaque.repartidor}`.toLowerCase().includes(busqueda.toLowerCase()))
  return <section className="cm-page">
    <header className="cm-header"><div><p className="cm-eyebrow">CASA MASA</p><h1>Pedidos y empaque</h1><p>Organiza cada entrega, revisa sus lotes y prepara el pedido.</p></div>
      <button disabled={cargando || !!error || recuperando || pendientes.length > 0} onClick={() => { setNuevo(true); setSeleccion(null); setMensaje("") }}>+ Nuevo pedido CM</button></header>
    <div className="cm-targets">{CODIGOS_CM.map(c => <div key={c}><strong>{c}</strong><b>20 unidades / día</b><small>Meta de fabricación · no representa stock</small></div>)}</div>
    <form className="cm-toolbar" onSubmit={e => { e.preventDefault(); if (desde && hasta && desde <= hasta && (Date.parse(hasta) - Date.parse(desde)) / 86400000 <= 365) { setNuevo(false); setPeriodo({ desde, hasta }); setMensaje("") } else setError("Selecciona un rango válido de hasta 366 días.") }}>
      <label>Entrega desde<input type="date" value={desde} onChange={e => setDesde(e.target.value)} required /></label>
      <label>Hasta<input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} required /></label>
      <button disabled={cargando || recuperando}>Consultar</button>
      <label>Mostrar<select value={filtro} onChange={e => setFiltro(e.target.value)}><option value="ACTIVOS">Activos</option><option value="TODOS">Todos / historial</option>{ESTADOS_EMPAQUE_CM.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Buscar<input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Pedido, cliente o repartidor" /></label>
    </form>
    {error && <p role="alert" className="cm-error">{error} <button onClick={() => setRevision(r => r + 1)} disabled={recuperando}>Recargar</button></p>}
    {mensaje && <p role="status" className="cm-success">{mensaje}</p>}
    {pendientes.length > 0 && <aside className="cm-notice"><strong>Hay un pedido cuyo resultado debes comprobar antes de registrar otro.</strong>{pendientes.map(s => <p key={s.solicitudId}>{s.datos.numeroPedidoCliente} · {s.origen}
      {s.origen === "CASA_MASA" && <button disabled={recuperando} onClick={() => void recuperar(s, false)}>Reintentar el mismo pedido</button>}
      <button disabled={recuperando} onClick={() => void recuperar(s, true)}>Comprobar resultado</button></p>)}</aside>}
    {nuevo && <NuevoPedidoCM alCerrar={() => setNuevo(false)} alGuardar={(numero, fecha) => {
      setNuevo(false); setMensaje(`Pedido ${numero} guardado en el sistema central. Completa sus datos de entrega y empaque.`)
      setDesde(fecha); setHasta(fecha); setPeriodo({ desde: fecha, hasta: fecha }); setRevision(r => r + 1)
    }} alFallar={() => setRevision(r => r + 1)} />}
    {cargando ? <p role="status">Cargando pedidos…</p> : !error && <>
      <p>{visibles.length} pedidos · {visibles.reduce((s, p) => s + p.pedido.total_unidades, 0)} unidades en esta selección</p>
      {!visibles.length && <div className="cm-empty">No hay pedidos Casa Masa en esta selección. Registra uno nuevo o consulta otras fechas.</div>}
      <div className="cm-grid">{visibles.map(p => <article className="cm-card" key={p.pedido.id}>
        <div className="cm-card-title"><strong>{p.pedido.numero_pedido_cliente}</strong><span>{p.pedido.estado === "DESPACHADO" ? "DESPACHADO" : p.pedido.estado === "CANCELADO" ? "CANCELADO" : p.empaque.estado_empaque}</span></div>
        <h2>{p.pedido.cliente?.nombre ?? "Cliente no disponible"}</h2><p>Entrega: {p.pedido.fecha_entrega} {p.pedido.hora_entrega?.slice(0, 5)}</p>
        <p>{p.empaque.direccion || p.pedido.bodega?.nombre || "Completar punto de entrega"}</p>
        <ul>{p.detalles.map(d => <li key={d.id}><span>{d.producto?.codigo} · {d.producto?.corto}</span><strong>{d.total_unidades} u.</strong></li>)}</ul>
        <p>Repartidor: <strong>{p.empaque.repartidor || "Sin asignar"}</strong></p>
        {["EMPACADO Y ETIQUETADO", "LISTO"].includes(p.empaque.estado_empaque) && p.pedido.estado === "INGRESADO" && <p className="cm-notice">Revisa la reserva: el pedido no figura preparado en logística.</p>}
        <button onClick={() => { setSeleccion(p); setNuevo(false); setMensaje("") }}>Ver / organizar empaque</button>
        {puedeDespachar && <button className="cm-secondary" onClick={() => abrirPreparacion(p.pedido.id)}>Reservas y despacho</button>}
      </article>)}</div>
    </>}
    {seleccion && <EditorEmpaque key={`${seleccion.pedido.id}:${seleccion.empaque.version}`} registro={seleccion}
      alCerrar={() => setSeleccion(null)} abrirPreparacion={puedeDespachar ? () => abrirPreparacion(seleccion.pedido.id) : undefined}
      alGuardar={empaque => { setPedidos(p => p.map(r => r.pedido.id === empaque.pedido_id ? { ...r, empaque } : r)); setSeleccion(null); setMensaje("Avance de empaque guardado. El stock físico se descuenta al confirmar el despacho.") }} />}
    <p className="cm-footnote">Cobros, verificación de pagos, facturación y WhatsApp: pendientes de la siguiente entrega.</p>
  </section>
}

function NuevoPedidoCM({ alCerrar, alGuardar, alFallar }: { alCerrar: () => void; alGuardar: (numero: string, fecha: string) => void; alFallar: () => void }) {
  const [clientes, setClientes] = useState<ClientePedidoDb[]>([])
  const [cliente, setCliente] = useState("")
  const [bodegas, setBodegas] = useState<BodegaPedidoDb[]>([])
  const [bodega, setBodega] = useState("")
  const [productos, setProductos] = useState<ProductoPedidoDb[]>([])
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [numero, setNumero] = useState("")
  const [fecha, setFecha] = useState(fechaLocalCM)
  const [hora, setHora] = useState("")
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const enviando = useRef(false)
  useEffect(() => {
    let vigente = true
    obtenerClientesPedidoDb().then(c => { if (vigente) setClientes(c) }).catch(e => { if (vigente) setError(errorTexto(e)) }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [])
  useEffect(() => {
    let vigente = true
    setBodega(""); setBodegas([]); setProductos([]); setCantidades({}); setError("")
    if (!cliente) return
    setCargando(true)
    Promise.all([obtenerBodegasClienteDb(cliente), obtenerProductosClienteDb(cliente)])
      .then(([b, p]) => { if (vigente) { setBodegas(b); setProductos(p.filter(p => esCodigoCM(p.codigo))) } })
      .catch(e => { if (vigente) setError(errorTexto(e)) }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [cliente])
  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (enviando.current) return
    enviando.current = true; setGuardando(true); setError("")
    try {
      const seleccionados = productos.filter(p => cantidades[p.id] !== undefined && cantidades[p.id] !== "")
      validarPedidoCM(seleccionados.map(p => ({ codigo: p.codigo, cantidad: Number(cantidades[p.id]), manejo: p.unidad_manejo })))
      const destino = bodegas.find(b => b.id === bodega)
      if (!destino) throw new Error("Selecciona el punto de entrega del cliente.")
      const r = await crearPedidoDb({ numeroPedidoCliente: numero, clienteId: cliente, bodegaId: bodega, fechaEntrega: fecha, horaEntrega: hora,
        prioridad: "NORMAL", tipoEmpaque: destino.tipo_empaque, detalles: seleccionados.map(p => ({ productoId: p.id, totalUnidades: Number(cantidades[p.id]), unidadManejo: p.unidad_manejo })) }, crypto.randomUUID(), "CASA_MASA")
      if (!r.vigente) throw new Error("El intento ya corresponde a un pedido retirado. Comprueba el historial antes de registrar otro.")
      alGuardar(r.numeroPedidoCliente, fecha)
    } catch (e) { setError(errorTexto(e)); alFallar() }
    finally { enviando.current = false; setGuardando(false) }
  }
  return <section className="cm-panel"><h2>Nuevo pedido Casa Masa</h2><p>Se registra una sola vez en Pedidos. Utiliza clientes, puntos de entrega y unidades de manejo del catálogo actual.</p>
    <form onSubmit={guardar}><fieldset disabled={guardando || cargando} className="cm-fields">
      <label>Número de pedido<input required maxLength={100} value={numero} onChange={e => setNumero(e.target.value)} placeholder="Referencia única del pedido" /></label>
      <label>Cliente<select required value={cliente} onChange={e => setCliente(e.target.value)}><option value="">Seleccionar</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label>Punto de entrega<select required value={bodega} onChange={e => setBodega(e.target.value)}><option value="">Seleccionar</option>{bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label>
      <label>Fecha de entrega<input required type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
      <label>Hora de entrega<input type="time" value={hora} onChange={e => setHora(e.target.value)} /></label>
      {productos.map(p => <label key={p.id}>{p.codigo} · {p.corto}<input type="number" min={p.unidad_manejo} step={p.unidad_manejo} value={cantidades[p.id] ?? ""} placeholder="Unidades" onChange={e => setCantidades(c => ({ ...c, [p.id]: e.target.value }))} /><small>Múltiplos de {p.unidad_manejo} unidades. Deja vacío para omitir.</small></label>)}
    </fieldset>
      {cliente && !cargando && !productos.length && <p className="cm-notice">Este cliente no tiene SKU CM habilitados. Configura la relación de productos y el punto de entrega desde Administración.</p>}
      {error && <p role="alert" className="cm-error">{error}</p>}
      <div className="cm-actions"><button disabled={guardando || cargando || !productos.length}>Guardar pedido</button><button type="button" className="cm-secondary" disabled={guardando} onClick={alCerrar}>Cerrar</button></div>
    </form></section>
}

function EditorEmpaque({ registro, alCerrar, alGuardar, abrirPreparacion }: { registro: PedidoCM; alCerrar: () => void; alGuardar: (e: EmpaqueCM) => void; abrirPreparacion?: () => void }) {
  const [datos, setDatos] = useState(registro.empaque)
  const [verificado, setVerificado] = useState(false)
  const [error, setError] = useState("")
  const [guardando, setGuardando] = useState(false)
  const enviando = useRef(false)
  const cerrado = !["INGRESADO", "PREPARADO"].includes(registro.pedido.estado)
  const actual = ESTADOS_EMPAQUE_CM.indexOf(registro.empaque.estado_empaque)
  return <div className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-editor-title"><section className="cm-panel">
    <h2 id="cm-editor-title">Empaque · {registro.pedido.numero_pedido_cliente}</h2>
    <p>{registro.pedido.cliente?.nombre} · {registro.pedido.fecha_entrega} · Logística: {registro.pedido.estado}</p>
    <ul>{registro.detalles.map(d => <li key={d.id}>{d.producto?.codigo}: <strong>{d.total_unidades} unidades</strong></li>)}</ul>
    <form onSubmit={async e => {
      e.preventDefault(); if (enviando.current || cerrado) return
      enviando.current = true; setGuardando(true); setError("")
      try { alGuardar(await guardarEmpaqueCM(datos, verificado)) }
      catch (e) { setError(errorTexto(e)) }
      finally { enviando.current = false; setGuardando(false) }
    }}><fieldset className="cm-fields" disabled={guardando || cerrado}>
      <label>Estado de empaque<select value={datos.estado_empaque} onChange={e => { setVerificado(false); setDatos(d => ({ ...d, estado_empaque: e.target.value as EmpaqueCM["estado_empaque"] })) }}>{ESTADOS_EMPAQUE_CM.map((s, i) => <option key={s} disabled={i > actual + 1}>{s}</option>)}</select></label>
      {([['contacto', 'Contacto y teléfono', 300], ['direccion', 'Dirección o punto de entrega', 1000], ['responsable', 'Responsable de empaque', 200], ['repartidor', 'Repartidor asignado', 200], ['observaciones', 'Observaciones', 2000]] as const).map(([campo, etiqueta, limite]) =>
        <label key={campo}>{etiqueta}<input maxLength={limite} value={datos[campo]} onChange={e => setDatos(d => ({ ...d, [campo]: e.target.value }))} /></label>)}
      <label className="cm-check"><input type="checkbox" checked={verificado} onChange={e => setVerificado(e.target.checked)} />Revisé las cantidades físicas y las etiquetas contra los lotes reservados.</label>
    </fieldset>
      <p>Reserva los lotes en Preparación. Empacar no genera una salida de inventario. Puedes volver a una etapa anterior para corregir el pedido.</p>
      {error && <p role="alert" className="cm-error">{error} Si hubo una interrupción de conexión, cierra y recarga para comprobar el resultado.</p>}
      <div className="cm-actions">{!cerrado && <button disabled={guardando}>Guardar avance</button>}{abrirPreparacion && <button type="button" disabled={guardando} className="cm-secondary" onClick={abrirPreparacion}>Ver lotes / preparar despacho</button>}<button type="button" disabled={guardando} className="cm-secondary" onClick={alCerrar}>Cerrar</button></div>
    </form></section></div>
}
