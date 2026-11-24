import { useEffect, useRef, useState, type FormEvent } from "react"
import { guardarImpuestos, listarImpuestos, type GuardadoImpuestos, type Impuesto } from "../repositories/impuestosRepository"
import "./comprasSriTabla.css"
import "./finanzasPagosCompras.css"
import "./prestamos.css"
const moneda = (n: number) => Number(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mensaje = (e: unknown) => e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo completar la operación."
export default function Impuestos({ alEnviar }: { alEnviar: () => void }) {
  const [mes, setMes] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format().slice(0, 7))
  const [filas, setFilas] = useState<Impuesto[]>([]), [seleccion, setSeleccion] = useState(new Set<string>())
  const [cargando, setCargando] = useState(true), [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const [falloCarga, setFalloCarga] = useState(false), [revision, setRevision] = useState(0), [aviso, setAviso] = useState("")
  const [motivo, setMotivo] = useState("Impuestos registrados según declaración verificada")
  const [pendiente, setPendiente] = useState<GuardadoImpuestos | null>(null)
  const bloqueo = useRef(false)
  useEffect(() => {
    let vigente = true; setCargando(true); setError(""); setFalloCarga(false); setSeleccion(new Set())
    void listarImpuestos(mes + "-01").then(datos => {
      if (!vigente) return
      setFilas((["RENTA", "IVA"] as const).map(impuesto => {
        const actual = datos.find(f => f.impuesto === impuesto)
        return actual ? { ...actual, monto: Number(actual.monto).toFixed(2) } : { id: crypto.randomUUID(), periodo: mes + "-01", impuesto, vencimiento: "", monto: "", referencia: "", detalle: "", revision: 0, enviada: false, pagado: 0, saldo: 0, semana_activa: null }
      }))
    }).catch(e => { if (vigente) { setError(mensaje(e)); setFalloCarga(true) } }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [mes, revision])
  const deshabilitado = cargando || ocupado || falloCarga || pendiente !== null
  const cambiar = (id: string, campo: "monto" | "vencimiento" | "referencia" | "detalle", valor: string) => setFilas(actual => actual.map(f => f.id === id ? { ...f, [campo]: valor } : f))
  async function guardar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return
    const enviar = pendiente?.enviar ?? (((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "enviar")
    const activas = filas.filter(f => f.revision > 0 || f.monto !== "" || seleccion.has(f.id))
    if (!activas.length || (enviar && !seleccion.size)) { setError("Ingresa un importe y selecciona los impuestos que deseas enviar."); return }
    const datos = pendiente ?? { operacion: crypto.randomUUID(), motivo, enviar, filas: activas.map(f => ({ id: f.id, periodo: f.periodo, impuesto: f.impuesto, vencimiento: f.vencimiento, monto: f.monto, referencia: f.referencia, detalle: f.detalle, revision: f.revision, enviar: enviar && seleccion.has(f.id) })) }
    bloqueo.current = true; setOcupado(true); setError(""); setPendiente(datos)
    try { await guardarImpuestos(datos); setPendiente(null); if (enviar) alEnviar(); else { setAviso("Impuestos guardados con registro del responsable."); setRevision(v => v + 1) } }
    catch (fallo) { if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null); setError(mensaje(fallo)) }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  return <main className="compras-sri-pagina fin-pagos prestamos-pagina">
    <header className="compras-sri-cabecera"><h1>Impuestos</h1></header>
    <p>Ingresa manualmente el impuesto a la renta y el IVA del período. Marca los que pasarán a Cuentas por pagar para luego programarlos en Pagos semanales.</p>
    <div className="fin-pagos-filtros"><label>Mes del impuesto <input aria-label="Mes del impuesto" type="month" required value={mes} disabled={ocupado || pendiente !== null} onChange={e => { if (e.target.value) { setMes(e.target.value); setAviso("") } }} /></label>
      <button disabled={ocupado || cargando || pendiente !== null} onClick={() => setRevision(v => v + 1)}>Actualizar</button></div>
    {aviso && <p role="status">{aviso}</p>}{cargando && <p role="status">Cargando impuestos…</p>}
    {!cargando && !falloCarga && <form onSubmit={guardar}>
      <fieldset disabled={deshabilitado} className="prestamos-cuotas-campos">
        <div className="compras-sri-contenedor"><table className="compras-sri-tabla prestamos-tabla" aria-label="Impuestos mensuales">
          <thead><tr><th>Elegir</th><th>Período</th><th>Impuesto</th><th>Vencimiento</th><th>Referencia / declaración</th><th>Detalle</th><th>Importe USD</th><th>Pagado USD</th><th>Saldo USD</th><th>Estado</th></tr></thead>
          <tbody>{filas.map(f => {
            const requiere = f.revision > 0 || f.monto !== "" || seleccion.has(f.id), fijo = Number(f.pagado) > 0 || !!f.semana_activa
            return <tr key={f.id}>
              <td><input type="checkbox" aria-label={`Seleccionar ${f.impuesto}`} disabled={f.enviada} checked={seleccion.has(f.id)} onChange={e => setSeleccion(actual => { const nuevo = new Set(actual); if (e.target.checked) nuevo.add(f.id); else nuevo.delete(f.id); return nuevo })} /></td>
              <td>{mes}</td><td>{f.impuesto === "RENTA" ? "Impuesto a la renta" : "IVA"}</td>
              <td><input aria-label={`Vencimiento ${f.impuesto}`} type="date" required={requiere} value={f.vencimiento} readOnly={fijo} onChange={e => cambiar(f.id, "vencimiento", e.target.value)} /></td>
              <td><input aria-label={`Referencia ${f.impuesto}`} maxLength={100} value={f.referencia} readOnly={fijo} onChange={e => cambiar(f.id, "referencia", e.target.value)} /></td>
              <td><input aria-label={`Detalle ${f.impuesto}`} maxLength={500} value={f.detalle} readOnly={fijo} onChange={e => cambiar(f.id, "detalle", e.target.value)} /></td>
              <td><input aria-label={`Importe ${f.impuesto}`} type="number" min="0.01" max="999999999.99" step="0.01" required={requiere} value={f.monto} readOnly={fijo} onChange={e => cambiar(f.id, "monto", e.target.value)} /></td>
              <td>{moneda(f.pagado)}</td><td>{f.revision ? moneda(f.saldo) : f.monto ? moneda(Number(f.monto)) : "—"}</td>
              <td>{f.enviada ? Number(f.saldo) === 0 ? "Pagado" : f.semana_activa ? `Semana ${f.semana_activa}` : "En Cuentas por pagar" : "Borrador"}</td>
            </tr>
          })}</tbody>
        </table></div>
        <div className="fin-pagos-filtros"><label>Motivo del registro / cambio <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label><span>{seleccion.size} seleccionados</span></div>
      </fieldset>
      <div className="fin-pagos-filtros"><button value="guardar" disabled={ocupado || (pendiente !== null && pendiente.enviar)}>{pendiente ? "Reintentar guardado" : "Guardar impuestos"}</button>
        <button value="enviar" disabled={ocupado || (pendiente !== null && !pendiente.enviar) || (!pendiente && !seleccion.size)}>{pendiente?.enviar ? "Reintentar envío" : "Enviar seleccionados a Cuentas por pagar"}</button></div>
    </form>}
    {error && <p role="alert" className="compras-sri-error">{error}</p>}
  </main>
}
