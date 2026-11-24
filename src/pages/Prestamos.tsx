import { useEffect, useRef, useState, type FormEvent } from "react"
import { guardarCuotasPrestamo, guardarPrestamo, historialPrestamo, listarCuotasPrestamo, listarPrestamos, retirarCuotaPrestamo,
  type CuotaPrestamo, type DatosCuotas, type DatosPrestamo, type HistorialPrestamo, type Prestamo } from "../repositories/prestamosRepository"
import "./comprasSriTabla.css"
import "./finanzasPagosCompras.css"
import "./prestamos.css"

const hoy = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format()
const moneda = (valor: number | string) => Number(valor).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const textoError = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo completar la operación."
function FormularioPrestamo({ id, prestamo, alGuardar, cancelar }: { id: string; prestamo?: Prestamo; alGuardar: (id: string) => void; cancelar: () => void }) {
  const [datos, setDatos] = useState<DatosPrestamo>(() => ({ id, revision: prestamo?.revision ?? null, acreedor: prestamo?.acreedor ?? "", referencia: prestamo?.referencia ?? "",
    fecha: prestamo?.fecha ?? hoy(), numero_cuotas: prestamo?.numero_cuotas ?? 1, monto_total: prestamo ? Number(prestamo.monto_total).toFixed(2) : "",
    pagado_previo: Number(prestamo?.pagado_previo ?? 0).toFixed(2), observaciones: prestamo?.observaciones ?? "", motivo: "Registro o corrección según documento del préstamo" }))
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const bloqueo = useRef(false)
  async function guardar(evento: FormEvent) {
    evento.preventDefault(); if (bloqueo.current) return
    bloqueo.current = true; setOcupado(true); setError("")
    try { await guardarPrestamo(datos); alGuardar(id) } catch (fallo) { setError(textoError(fallo)) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  const cambiar = (campo: keyof DatosPrestamo, valor: string | number) => setDatos(actual => ({ ...actual, [campo]: valor }))
  return <form onSubmit={guardar} className="prestamos-editor">
    <h2>{prestamo ? "Editar préstamo" : "Nuevo préstamo"}</h2>
    <p>Ingresa el total pactado de las cuotas, incluidos los cargos acordados. El pago previo corresponde a lo abonado antes de usar esta tarjeta; no genera un desembolso nuevo.</p>
    <fieldset disabled={ocupado} className="fin-pagos-filtros">
      <label>Acreedor / banco <input aria-label="Acreedor del préstamo" required minLength={2} maxLength={200} value={datos.acreedor} onChange={e => cambiar("acreedor", e.target.value)} /></label>
      <label>N.º de préstamo / referencia <input aria-label="Referencia del préstamo" required maxLength={100} value={datos.referencia} onChange={e => cambiar("referencia", e.target.value)} /></label>
      <label>Fecha del préstamo <input aria-label="Fecha del préstamo" type="date" required value={datos.fecha} onChange={e => cambiar("fecha", e.target.value)} /></label>
      <label>N.º total de cuotas <input aria-label="Número total de cuotas" type="number" required min="1" max="600" step="1" value={datos.numero_cuotas} onChange={e => cambiar("numero_cuotas", Number(e.target.value))} /></label>
      <label>Total a pagar USD <input aria-label="Total a pagar del préstamo" type="number" required min="0.01" max="999999999.99" step="0.01" value={datos.monto_total} onChange={e => cambiar("monto_total", e.target.value)} /></label>
      <label>Pagado previamente USD <input aria-label="Pagado previamente" type="number" required min="0" max={datos.monto_total || undefined} step="0.01" value={datos.pagado_previo} onChange={e => cambiar("pagado_previo", e.target.value)} /></label>
      <label>Observaciones <input maxLength={500} value={datos.observaciones} onChange={e => cambiar("observaciones", e.target.value)} /></label>
      <label>Motivo del registro / cambio <input required minLength={5} maxLength={500} value={datos.motivo} onChange={e => cambiar("motivo", e.target.value)} /></label>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <button disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar préstamo"}</button>{" "}<button type="button" disabled={ocupado} onClick={cancelar}>Cancelar</button>
  </form>
}

type Linea = { id: string; numero: string; vencimiento: string; monto: string; detalle: string; revision: number; enviada: boolean; pagado: number; saldo: number; semana_activa: string | null }
const convertir = (cuota: CuotaPrestamo): Linea => ({ ...cuota, numero: String(cuota.numero), monto: Number(cuota.monto).toFixed(2) })
const inicial = (numero: number): Linea => ({ id: crypto.randomUUID(), numero: String(numero), vencimiento: "", monto: "", detalle: "", revision: 0, enviada: false, pagado: 0, saldo: 0, semana_activa: null })
function CuotasPrestamo({ prestamo, alGuardar, alEnviar }: { prestamo: Prestamo; alGuardar: () => void; alEnviar: () => void }) {
  const [filas, setFilas] = useState<Linea[]>([]), [originales, setOriginales] = useState<CuotaPrestamo[]>([])
  const [historial, setHistorial] = useState<HistorialPrestamo[]>([])
  const [seleccion, setSeleccion] = useState(new Set<string>())
  const [motivo, setMotivo] = useState("Cuotas ingresadas según documento del préstamo")
  const [cargando, setCargando] = useState(true), [ocupado, setOcupado] = useState(false), [error, setError] = useState(""), [falloCarga, setFalloCarga] = useState(false)
  const [pendiente, setPendiente] = useState<{ datos: DatosCuotas; enviar: boolean } | null>(null)
  const bloqueo = useRef(false)
  useEffect(() => {
    let vigente = true
    void Promise.all([listarCuotasPrestamo(prestamo.id), historialPrestamo(prestamo.id)]).then(([cuotas, cambios]) => {
      if (!vigente) return
      setOriginales(cuotas); setFilas(cuotas.length ? cuotas.map(convertir) : Number(prestamo.saldo) > 0 ? [inicial(1)] : []); setHistorial(cambios)
    }).catch(fallo => { if (vigente) { setFalloCarga(true); setError(textoError(fallo)) } }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [prestamo.id, prestamo.saldo])
  const usados = new Set(filas.map(fila => Number(fila.numero)))
  const siguiente = Array.from({ length: prestamo.numero_cuotas }, (_, i) => i + 1).find(n => !usados.has(n))
  const bloqueado = ocupado || cargando || falloCarga || pendiente !== null
  function cambiar(id: string, campo: "numero" | "vencimiento" | "monto" | "detalle", valor: string) { setFilas(actual => actual.map(fila => fila.id === id ? { ...fila, [campo]: valor } : fila)) }
  async function guardar(evento: FormEvent) {
    evento.preventDefault(); if (bloqueo.current) return
    const enviar = pendiente?.enviar ?? ((evento.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "cuentas"
    if (enviar && seleccion.size === 0) { setError("Selecciona las cuotas que pasarán a Cuentas por pagar."); return }
    const activas = filas.filter(fila => fila.revision > 0 || fila.monto !== "" || seleccion.has(fila.id))
    if (!activas.length) { setError("Ingresa al menos una cuota."); return }
    const datos = pendiente?.datos ?? { operacion: crypto.randomUUID(), prestamo: prestamo.id, revision: prestamo.revision, motivo,
      filas: activas.map(fila => ({ id: fila.id, numero: Number(fila.numero), vencimiento: fila.vencimiento, monto: fila.monto, detalle: fila.detalle, revision: fila.revision, enviar: enviar && seleccion.has(fila.id) })) }
    bloqueo.current = true; setOcupado(true); setError(""); setPendiente({ datos, enviar })
    try { await guardarCuotasPrestamo(datos); if (enviar) alEnviar(); else alGuardar() }
    catch (fallo) { if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null); setError(textoError(fallo)) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  async function retirar(fila: Linea) {
    if (bloqueo.current) return
    const cambios = filas.some(actual => {
      const original = originales.find(q => q.id === actual.id)
      return original ? JSON.stringify(convertir(original)) !== JSON.stringify(actual) : actual.monto !== ""
    })
    if (cambios) { setError("Guarda primero las cuotas nuevas o editadas antes de retirar otra."); return }
    const cuota = originales.find(q => q.id === fila.id)
    if (!cuota) return
    bloqueo.current = true; setOcupado(true); setError("")
    try { await retirarCuotaPrestamo(cuota, motivo + " · Retiro de cuota pendiente para corregirla"); alGuardar() }
    catch (fallo) { setError(textoError(fallo)) } finally { bloqueo.current = false; setOcupado(false) }
  }
  return <section>
    <h2>Cuotas del préstamo · {prestamo.referencia}</h2>
    <p>Registra solo las cuotas que quedan pendientes, con su número real. Enviar a Cuentas por pagar no registra un pago.</p>
    {cargando && <p role="status">Cargando cuotas…</p>}
    <form onSubmit={guardar}>
      <fieldset disabled={bloqueado} className="prestamos-cuotas-campos">
        <div className="compras-sri-contenedor prestamos-cuotas-scroll"><table className="compras-sri-tabla prestamos-tabla" aria-label="Cuotas del préstamo">
          <thead><tr><th>Elegir</th><th>N.º cuota</th><th>Vencimiento</th><th>Detalle</th><th>Importe USD</th><th>Pagado USD</th><th>Saldo USD</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{filas.map((fila, indice) => {
            const requiere = fila.revision > 0 || fila.monto !== "" || seleccion.has(fila.id)
            return <tr key={fila.id}>
              <td><input type="checkbox" aria-label={`Seleccionar cuota ${fila.numero}`} disabled={fila.enviada} checked={seleccion.has(fila.id)} onChange={e => setSeleccion(actual => { const nuevo = new Set(actual); if (e.target.checked) nuevo.add(fila.id); else nuevo.delete(fila.id); return nuevo })} /></td>
              <td><input aria-label={`Número de cuota fila ${indice + 1}`} type="number" min="1" max={prestamo.numero_cuotas} step="1" required={requiere} value={fila.numero} readOnly={fila.enviada} onChange={e => cambiar(fila.id, "numero", e.target.value)} /></td>
              <td><input aria-label={`Vencimiento cuota fila ${indice + 1}`} type="date" required={requiere} value={fila.vencimiento} readOnly={fila.enviada} onChange={e => cambiar(fila.id, "vencimiento", e.target.value)} /></td>
              <td><input aria-label={`Detalle cuota fila ${indice + 1}`} maxLength={500} value={fila.detalle} readOnly={fila.enviada} onChange={e => cambiar(fila.id, "detalle", e.target.value)} /></td>
              <td><input aria-label={`Importe cuota fila ${indice + 1}`} type="number" min="0.01" step="0.01" required={requiere} value={fila.monto} readOnly={fila.enviada} onChange={e => cambiar(fila.id, "monto", e.target.value)} /></td>
              <td>{moneda(fila.pagado)}</td><td>{fila.revision ? moneda(fila.saldo) : fila.monto ? moneda(fila.monto) : "—"}</td>
              <td>{fila.enviada ? Number(fila.saldo) === 0 ? "Pagada" : fila.semana_activa ? `Semana ${fila.semana_activa}` : "En Cuentas por pagar" : "Borrador"}</td>
              <td>{fila.enviada ? Number(fila.pagado) === 0 && !fila.semana_activa && <button type="button" onClick={() => void retirar(fila)}>Retirar de Cuentas</button>
                : fila.revision === 0 && <button type="button" onClick={() => { setFilas(actual => actual.filter(q => q.id !== fila.id)); setSeleccion(actual => { const nuevo = new Set(actual); nuevo.delete(fila.id); return nuevo }) }}>Quitar fila</button>}</td>
            </tr>
          })}{!filas.length && !cargando && <tr><td colSpan={9}>No hay cuotas registradas.</td></tr>}</tbody>
        </table></div>
        <div className="fin-pagos-filtros">
          <button type="button" disabled={!siguiente} onClick={() => siguiente && setFilas(actual => [...actual, inicial(siguiente)])}>Agregar cuota</button>
          <label>Motivo <input required minLength={5} maxLength={400} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
          <span>{seleccion.size} cuotas seleccionadas</span>
        </div>
      </fieldset>
      <div className="fin-pagos-filtros">
        <button value="guardar" disabled={ocupado || cargando || falloCarga || (pendiente !== null && pendiente.enviar)}>{ocupado ? "Guardando…" : pendiente ? "Reintentar guardado" : "Guardar cuotas"}</button>
        <button value="cuentas" disabled={ocupado || cargando || falloCarga || (pendiente !== null && !pendiente.enviar) || (!pendiente && seleccion.size === 0)}>{pendiente?.enviar ? "Reintentar envío" : "Enviar seleccionadas a Cuentas por pagar"}</button>
      </div>
    </form>
    {error && <p role="alert" className="compras-sri-error">{error}</p>}
    {historial.length > 0 && <details><summary>Bitácora del préstamo · últimos {historial.length} cambios</summary>
      <div className="compras-sri-contenedor"><table className="compras-sri-tabla prestamos-tabla"><thead><tr><th>Fecha</th><th>Responsable</th><th>Acción</th><th>Cuota</th><th>Anterior USD</th><th>Nuevo USD</th><th>Motivo</th></tr></thead>
        <tbody>{historial.map(cambio => <tr key={cambio.id}><td>{new Date(cambio.creado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</td><td>{cambio.responsable || "Usuario registrado"}</td>
          <td>{cambio.accion === "FIN_PRESTAMO_GUARDAR" ? "Préstamo registrado o corregido" : cambio.accion === "FIN_PRESTAMO_CUOTA_RETIRAR" ? "Cuota retirada de Cuentas" : "Cuota guardada o enviada"}</td>
          <td>{cambio.detalle.nuevo?.numero ?? cambio.detalle.anterior?.numero ?? "—"}</td>
          <td>{cambio.detalle.anterior ? moneda(cambio.detalle.anterior.monto ?? cambio.detalle.anterior.monto_total ?? 0) : "—"}</td>
          <td>{cambio.detalle.nuevo ? moneda(cambio.detalle.nuevo.monto ?? cambio.detalle.nuevo.monto_total ?? 0) : "—"}</td><td>{cambio.detalle.motivo}</td></tr>)}</tbody>
      </table></div>
    </details>}
  </section>
}

export default function Prestamos({ alEnviar }: { alEnviar: () => void }) {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]), [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [formulario, setFormulario] = useState<{ id: string; existente?: Prestamo } | null>(null)
  const [cargando, setCargando] = useState(true), [error, setError] = useState(""), [mensaje, setMensaje] = useState(""), [revision, setRevision] = useState(0)
  useEffect(() => {
    let vigente = true; setCargando(true); setError("")
    void listarPrestamos().then(filas => { if (vigente) setPrestamos(filas) }).catch(fallo => { if (vigente) setError(textoError(fallo)) }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [revision])
  const actual = prestamos.find(p => p.id === seleccionado)
  return <main className="compras-sri-pagina fin-pagos prestamos-pagina">
    <header className="compras-sri-cabecera"><h1>Préstamos</h1><div className="compras-sri-herramientas">
      <button type="button" disabled={cargando} onClick={() => { setFormulario({ id: crypto.randomUUID() }); setSeleccionado(null); setMensaje("") }}>Nuevo préstamo</button>
      <button type="button" disabled={cargando} onClick={() => setRevision(valor => valor + 1)}>Actualizar</button>
    </div></header>
    {error && <p role="alert" className="compras-sri-error">{error}</p>}{mensaje && <p role="status">{mensaje}</p>}
    {cargando ? <p role="status">Cargando préstamos…</p> : <div className="compras-sri-contenedor"><table className="compras-sri-tabla prestamos-tabla" aria-label="Listado de préstamos">
      <thead><tr><th>Acreedor</th><th>Referencia</th><th>Fecha</th><th>N.º cuotas</th><th>Total pactado USD</th><th>Pagado total USD</th><th>Saldo USD</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>{prestamos.map(p => <tr key={p.id}><td>{p.acreedor}</td><td>{p.referencia}</td><td>{p.fecha}</td><td>{p.numero_cuotas}</td><td>{moneda(p.monto_total)}</td><td>{moneda(p.pagado_total)}</td><td>{moneda(p.saldo)}</td>
        <td>{Number(p.saldo) === 0 ? "Pagado" : "Pendiente"}</td><td><button onClick={() => { setSeleccionado(p.id); setFormulario(null); setMensaje("") }}>Detalle</button></td></tr>)}
        {!prestamos.length && <tr><td colSpan={9}>Todavía no hay préstamos registrados.</td></tr>}</tbody>
    </table></div>}
    {formulario && <FormularioPrestamo key={formulario.id} id={formulario.id} prestamo={formulario.existente} cancelar={() => setFormulario(null)} alGuardar={id => {
      setFormulario(null); setSeleccionado(id); setMensaje("Préstamo guardado con registro del responsable."); setRevision(valor => valor + 1)
    }} />}
    {!formulario && actual && !cargando && <>
      <div className="fin-pagos-filtros prestamos-resumen" role="status">
        <strong>Saldo del préstamo: USD {moneda(actual.saldo)}</strong><span>Pagado previamente: USD {moneda(actual.pagado_previo)}</span>
        <span>Pagos registrados aquí: USD {moneda(actual.pagado_registrado)}</span><span>Saldo sin distribuir en cuotas: USD {moneda(actual.sin_distribuir)}</span>
        <button type="button" onClick={() => setFormulario({ id: actual.id, existente: actual })}>Editar préstamo</button>
      </div>
      <CuotasPrestamo key={`${actual.id}:${actual.revision}:${revision}`} prestamo={actual} alEnviar={alEnviar} alGuardar={() => { setMensaje("Cuotas actualizadas. El saldo se calcula con los pagos registrados."); setRevision(valor => valor + 1) }} />
    </>}
  </main>
}
