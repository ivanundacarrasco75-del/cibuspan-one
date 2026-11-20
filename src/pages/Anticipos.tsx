import { Fragment, useEffect, useRef, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { aplicarAnticipo, guardarAnticipo, listarAnticipos, type Anticipo, type CruceAnticipo, type DatosAnticipo } from "../repositories/anticiposRepository"
import { CUENTAS_POR_PAGINA, listarCuentasCompra, programarCompras, type CuentaCompra } from "../repositories/finanzasComprasRepository"
import "./comprasSriTabla.css"
import "./finanzasPagosCompras.css"
import "./anticipos.css"

const hoy = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format()
const dinero = (valor: number) => Number(valor).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const centavos = (valor: string | number) => Math.round(Number(valor) * 100)
const errorTexto = (fallo: unknown) => typeof fallo === "object" && fallo && "message" in fallo ? String(fallo.message) : "No se pudo guardar la operación."
const rechazado = (fallo: unknown) => typeof fallo === "object" && fallo && "rechazado" in fallo && fallo.rechazado
function lunes(fecha: string) {
  const dia = new Date(fecha + "T12:00:00Z")
  dia.setUTCDate(dia.getUTCDate() - (dia.getUTCDay() + 6) % 7)
  return dia.toISOString().slice(0, 10)
}

function CruzarAnticipo({ anticipo, cerrar, alGuardar }: { anticipo: Anticipo; cerrar: () => void; alGuardar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const ocupado = useRef(false)
  const [buscar, setBuscar] = useState("")
  const [filtro, setFiltro] = useState("")
  const [pagina, setPagina] = useState(0)
  const [facturas, setFacturas] = useState<CuentaCompra[]>([])
  const [total, setTotal] = useState(0)
  const [factura, setFactura] = useState<CuentaCompra | null>(null)
  const [monto, setMonto] = useState("")
  const [confirmado, setConfirmado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState<CruceAnticipo | null>(null)
  const [error, setError] = useState("")
  const operacion = useRef(crypto.randomUUID())

  useEffect(() => { if (!dialogo.current?.open) dialogo.current?.showModal() }, [])
  useEffect(() => {
    let vigente = true
    setCargando(true)
    void listarCuentasCompra(pagina, "SRI", filtro, true).then(resultado => {
      if (vigente) { setFacturas(resultado.cuentas); setTotal(resultado.total) }
    }).catch(fallo => { if (vigente) setError(errorTexto(fallo)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [filtro, pagina])

  async function cruzar(evento: FormEvent) {
    evento.preventDefault()
    if (!factura || ocupado.current) return
    const solicitud = pendiente ?? { id: operacion.current, anticipo: anticipo.id, factura: factura.id, monto, confirmado }
    ocupado.current = true
    setGuardando(true)
    setError("")
    setPendiente(solicitud)
    try {
      await aplicarAnticipo(solicitud)
      alGuardar()
    } catch (fallo) {
      if (rechazado(fallo)) setPendiente(null)
      setError(errorTexto(fallo))
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }
  const bloqueado = guardando || pendiente !== null
  return createPortal(<dialog ref={dialogo} className="fin-pagos-dialogo anticipos-cruce" aria-labelledby="titulo-cruce"
    onClose={() => { if (!dialogo.current?.open && !ocupado.current) cerrar() }}
    onCancel={evento => { evento.preventDefault(); if (!ocupado.current) cerrar() }}>
    <h2 id="titulo-cruce">Cruzar anticipo con factura</h2>
    <p>{anticipo.numero} · {anticipo.proveedor} · Disponible USD {dinero(anticipo.disponible)}</p>
    <form className="fin-pagos-filtros" onSubmit={evento => { evento.preventDefault(); setPagina(0); setFiltro(buscar.trim()) }}>
      <label>Buscar factura <input value={buscar} disabled={bloqueado} placeholder="Número o proveedor" onChange={evento => setBuscar(evento.target.value)} /></label>
      <button disabled={bloqueado || cargando}>Buscar</button>
    </form>
    <div className="compras-sri-contenedor anticipos-facturas" tabIndex={0} aria-label="Facturas para cruzar" role="region">
      <table className="compras-sri-tabla anticipos-tabla"><thead><tr><th>Elegir</th><th>Fecha</th><th>Factura</th><th>Proveedor</th><th>RUC</th><th>Saldo</th></tr></thead>
        <tbody>{!cargando && facturas.map(fila => <tr key={fila.id}>
          <td><input type="radio" name="factura-cruce" aria-label={`Elegir factura ${fila.numero_documento}`} checked={factura?.id === fila.id} disabled={bloqueado}
            onChange={() => { setFactura(fila); setConfirmado(false); setMonto(Math.min(Number(fila.saldo), Number(anticipo.disponible)).toFixed(2)) }} /></td>
          <td>{fila.fecha_documento}</td><td>{fila.numero_documento}</td><td>{fila.proveedor}</td><td>{fila.ruc || "—"}</td><td>{dinero(Number(fila.saldo))}</td>
        </tr>)}
        {cargando && <tr><td colSpan={6}>Buscando facturas…</td></tr>}
        {!cargando && facturas.length === 0 && <tr><td colSpan={6}>No hay facturas con saldo para esta búsqueda.</td></tr>}
        </tbody></table>
    </div>
    <div className="fin-pagos-filtros">
      <button disabled={bloqueado || cargando || pagina === 0} onClick={() => setPagina(valor => valor - 1)}>Anterior</button>
      <span>Página {pagina + 1} · {total} facturas</span>
      <button disabled={bloqueado || cargando || (pagina + 1) * CUENTAS_POR_PAGINA >= total} onClick={() => setPagina(valor => valor + 1)}>Siguiente</button>
    </div>
    <form onSubmit={cruzar}>
      {factura && <p>Factura {factura.numero_documento} · {factura.proveedor} · Saldo USD {dinero(Number(factura.saldo))}</p>}
      <fieldset disabled={bloqueado}>
        <label>Monto a cruzar <input type="number" min="0.01" max={Math.min(Number(factura?.saldo ?? 0), Number(anticipo.disponible))} step="0.01"
          value={monto} required onChange={evento => setMonto(evento.target.value)} /></label>
        <label><input type="checkbox" checked={confirmado} required onChange={evento => setConfirmado(evento.target.checked)} /> Confirmo que el anticipo corresponde al proveedor y a la factura seleccionados.</label>
      </fieldset>
      {error && <p role="alert" className="compras-sri-error">{error}</p>}
      <div className="fin-pagos-filtros">
        <button type="submit" className="fin-pagos-principal" disabled={guardando || !factura}>{guardando ? "Guardando…" : pendiente ? "Reintentar cruce" : "Cruzar con factura"}</button>
        <button type="button" disabled={guardando} onClick={cerrar}>{pendiente ? "Cerrar y actualizar" : "Cancelar"}</button>
      </div>
    </form>
  </dialog>, document.body)
}

export default function Anticipos({ alProgramar, puedeAbrirPagosSemanales }: {
  alProgramar: (semana: string) => void; puedeAbrirPagosSemanales: boolean
}) {
  const [filas, setFilas] = useState<Anticipo[]>([])
  const [revision, setRevision] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [edicion, setEdicion] = useState<DatosAnticipo | null>(null)
  const [guardarPendiente, setGuardarPendiente] = useState<DatosAnticipo | null>(null)
  const [seleccion, setSeleccion] = useState<Record<string, string>>({})
  const [semana, setSemana] = useState(() => lunes(hoy()))
  const [cruce, setCruce] = useState<Anticipo | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const ocupado = useRef(false)
  useEffect(() => {
    let vigente = true
    setCargando(true)
    void listarAnticipos().then(datos => { if (vigente) setFilas(datos) })
      .catch(fallo => { if (vigente) setError(errorTexto(fallo)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [revision])

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!edicion || ocupado.current) return
    const solicitud = guardarPendiente ?? edicion
    ocupado.current = true; setGuardando(true); setError(""); setGuardarPendiente(solicitud)
    try {
      await guardarAnticipo(solicitud)
      setEdicion(null); setGuardarPendiente(null); setMensaje("Anticipo guardado.")
      setRevision(valor => valor + 1)
    } catch (fallo) {
      if (rechazado(fallo)) setGuardarPendiente(null)
      setError(errorTexto(fallo))
    } finally { ocupado.current = false; setGuardando(false) }
  }
  async function programar(evento: FormEvent) {
    evento.preventDefault()
    if (ocupado.current) return
    ocupado.current = true; setGuardando(true); setError("")
    try {
      await programarCompras(semana, Object.entries(seleccion).map(([id, monto]) => ({ id: "anticipo:" + id, monto, verificado: false })))
      setSeleccion({}); setMensaje("Anticipos enviados a la semana del " + semana + ".")
      if (puedeAbrirPagosSemanales) alProgramar(semana)
      else setRevision(valor => valor + 1)
    } catch (fallo) { setError(errorTexto(fallo)) }
    finally { ocupado.current = false; setGuardando(false) }
  }
  const elegidas = filas.filter(fila => fila.id in seleccion)
  const total = Object.values(seleccion).reduce((suma, valor) => suma + (centavos(valor) || 0), 0) / 100
  const bloqueado = guardando || cargando
  return <main className="compras-sri-pagina fin-pagos anticipos-pagina">
    <header className="compras-sri-cabecera"><h1>Anticipos a proveedores</h1><div className="compras-sri-herramientas">
      <button disabled={bloqueado} onClick={() => {
        setEdicion({ id: crypto.randomUUID(), fecha: hoy(), proveedor: "", ruc: "", concepto: "", monto: "" })
        setGuardarPendiente(null); setError("")
      }}>Nuevo anticipo</button>
      <button disabled={guardando} onClick={() => setRevision(valor => valor + 1)}>Actualizar</button>
    </div></header>
    {mensaje && <p role="status">{mensaje}</p>}
    {error && <p role="alert" className="compras-sri-error">{error}</p>}
    {edicion && <form className="compras-sri-formulario" onSubmit={guardar}>
      <fieldset disabled={guardando || guardarPendiente !== null} className="anticipos-campos">
        <label>Fecha <input type="date" required value={edicion.fecha} onChange={evento => setEdicion({ ...edicion, fecha: evento.target.value })} /></label>
        <label>Proveedor <input required minLength={2} maxLength={200} value={edicion.proveedor} onChange={evento => setEdicion({ ...edicion, proveedor: evento.target.value })} /></label>
        <label>RUC (opcional) <input pattern="[0-9]{13}" maxLength={13} value={edicion.ruc} onChange={evento => setEdicion({ ...edicion, ruc: evento.target.value })} /></label>
        <label>Concepto <input required maxLength={500} value={edicion.concepto} onChange={evento => setEdicion({ ...edicion, concepto: evento.target.value })} /></label>
        <label>Monto USD <input required type="number" min="0.01" max="999999999.99" step="0.01" value={edicion.monto} onChange={evento => setEdicion({ ...edicion, monto: evento.target.value })} /></label>
      </fieldset>
      <button disabled={guardando} type="submit">{guardando ? "Guardando…" : guardarPendiente ? "Reintentar" : "Guardar anticipo"}</button>
      <button disabled={guardando} type="button" onClick={() => { setEdicion(null); setGuardarPendiente(null); setRevision(valor => valor + 1) }}>Cancelar</button>
    </form>}
    {cargando ? <p role="status">Cargando anticipos…</p> : <div className="compras-sri-contenedor" role="region" tabIndex={0} aria-label="Anticipos a proveedores">
      <table className="compras-sri-tabla anticipos-tabla"><thead><tr><th>Elegir</th><th>Fecha</th><th>Anticipo</th><th>Proveedor</th><th>Concepto</th>
        <th>Monto</th><th>Pagado</th><th>Cruzado</th><th>Disponible para cruzar</th><th>Pendiente de pago</th><th>Acciones</th></tr></thead>
        <tbody>{filas.map(fila => <Fragment key={fila.id}>
          <tr><td><input type="checkbox" aria-label={`Seleccionar ${fila.numero}`} checked={fila.id in seleccion}
            disabled={bloqueado || fila.saldo <= 0 || Boolean(fila.semana_activa)}
            onChange={evento => setSeleccion(actual => {
              const siguiente = { ...actual }
              if (evento.target.checked) siguiente[fila.id] = Number(fila.saldo).toFixed(2)
              else delete siguiente[fila.id]
              return siguiente
            })} /></td>
            <td>{fila.fecha}</td><td>{fila.numero}</td><td>{fila.proveedor}</td><td>{fila.concepto}</td>
            {[fila.monto, fila.pagado, fila.aplicado, fila.disponible, fila.saldo].map((valor, indice) => <td key={indice} className="compras-sri-monto">{dinero(valor)}</td>)}
            <td><div className="anticipos-acciones">
              {fila.disponible > 0 && <button disabled={bloqueado} onClick={() => setCruce(fila)}>Cruzar con factura</button>}
              {fila.pagado === 0 && !fila.semana_activa && <button disabled={bloqueado} onClick={() => { setGuardarPendiente(null); setEdicion({ ...fila, monto: Number(fila.monto).toFixed(2) }) }}>Editar</button>}
              <button onClick={() => setDetalle(detalle === fila.id ? null : fila.id)}>Detalle</button>
            </div></td>
          </tr>
          {detalle === fila.id && <tr><td colSpan={11} className="compras-sri-detalle">
            <p>{fila.proveedor} · Identificación {fila.ruc || "pendiente"}{fila.semana_activa ? " · Programado para " + fila.semana_activa : ""}</p>
            {fila.pagos.map(pago => <p key={pago.id}>Pago {pago.fecha} · USD {dinero(pago.valor)} · {pago.documento}</p>)}
            {fila.aplicaciones.map(aplicacion => <p key={aplicacion.id}>Factura {aplicacion.numero} · {aplicacion.proveedor} · Cruzado USD {dinero(aplicacion.monto)}</p>)}
          </td></tr>}
        </Fragment>)}
        {filas.length === 0 && <tr><td colSpan={11}>Todavía no hay anticipos registrados.</td></tr>}
        </tbody></table>
    </div>}
    <section className="fin-pagos-seleccion"><h2>Anticipos seleccionados</h2>
      <form onSubmit={programar}>
        <div className="compras-sri-contenedor"><table className="compras-sri-tabla anticipos-tabla"><thead><tr><th>Anticipo</th><th>Proveedor</th><th>Pendiente</th><th>Monto a programar</th><th>Acción</th></tr></thead>
          <tbody>{elegidas.map(fila => <tr key={fila.id}><td>{fila.numero}</td><td>{fila.proveedor}</td><td>{dinero(fila.saldo)}</td>
            <td><input aria-label={`Monto de ${fila.numero}`} type="number" min="0.01" max={fila.saldo} step="0.01" required disabled={bloqueado} value={seleccion[fila.id]}
              onChange={evento => setSeleccion(actual => ({ ...actual, [fila.id]: evento.target.value }))} /></td>
            <td><button type="button" disabled={bloqueado} onClick={() => setSeleccion(actual => { const siguiente = { ...actual }; delete siguiente[fila.id]; return siguiente })}>Quitar</button></td>
          </tr>)}
          {elegidas.length === 0 && <tr><td colSpan={5}>No hay anticipos seleccionados.</td></tr>}
          </tbody></table></div>
        <div className="fin-pagos-filtros"><label>Semana del <input type="date" required value={semana} disabled={bloqueado} onChange={evento => evento.target.value && setSemana(lunes(evento.target.value))} /></label>
          <strong>Total USD {dinero(total)}</strong><button type="submit" disabled={bloqueado || elegidas.length === 0}>Enviar a Pagos semanales</button></div>
      </form>
    </section>
    {cruce && <CruzarAnticipo anticipo={cruce} cerrar={() => { setCruce(null); setRevision(valor => valor + 1) }}
      alGuardar={() => { setCruce(null); setRevision(valor => valor + 1); setMensaje("Anticipo cruzado. El saldo de la factura fue actualizado.") }} />}
  </main>
}
