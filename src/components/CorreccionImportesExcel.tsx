import { useEffect, useRef, useState, type FormEvent } from "react"
import { corregirImportesExcel, listarCorreccionesImportes, type CorreccionImportes, type CuentaCompra } from "../repositories/finanzasComprasRepository"

const numero = (valor: number | null) => valor === null ? "" : Number(valor).toFixed(2)
const centavos = (valor: string) => Math.round(Number(valor) * 100)
const errorTexto = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo guardar la corrección."
export default function CorreccionImportesExcel({ cuenta, alGuardar }: { cuenta: CuentaCompra; alGuardar: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [subtotal, setSubtotal] = useState(numero(cuenta.subtotal))
  const [iva, setIva] = useState(numero(cuenta.iva))
  const [total, setTotal] = useState(numero(cuenta.total))
  const [retencion, setRetencion] = useState(numero(cuenta.retencion ?? (cuenta.total !== null && cuenta.neto !== null ? cuenta.total - cuenta.neto : null)))
  const [motivo, setMotivo] = useState("")
  const [historial, setHistorial] = useState<CorreccionImportes[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [pendiente, setPendiente] = useState<Parameters<typeof corregirImportesExcel>[0] | null>(null)
  const bloqueo = useRef(false)
  const operacion = useRef(crypto.randomUUID())
  useEffect(() => {
    let vigente = true
    void listarCorreccionesImportes(cuenta.id).then(filas => { if (vigente) setHistorial(filas) })
      .catch(fallo => { if (vigente) setError(errorTexto(fallo)) })
    return () => { vigente = false }
  }, [cuenta.id])
  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (bloqueo.current) return
    const datos = pendiente ?? { operacion: operacion.current, cuenta, subtotal, iva, total, retencion, motivo }
    bloqueo.current = true; setGuardando(true); setPendiente(datos); setError("")
    try { await corregirImportesExcel(datos); alGuardar() }
    catch (fallo) {
      if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null)
      setError(errorTexto(fallo))
    } finally { bloqueo.current = false; setGuardando(false) }
  }
  return <section>
    <button type="button" onClick={() => setAbierto(valor => !valor)} disabled={guardando} aria-expanded={abierto}>Corregir importes</button>
    {abierto && <form onSubmit={guardar}>
      <p>Verifica los importes contra la factura física. Se guardarán el responsable, la fecha, el motivo y los valores anteriores y nuevos.</p>
      <fieldset disabled={guardando || pendiente !== null} className="fin-pagos-filtros">
        <label>Subtotal USD <input aria-label="Subtotal verificado" required type="number" min="0" step="0.01" value={subtotal} onChange={e => {
          setSubtotal(e.target.value); setTotal(((centavos(e.target.value) + centavos(iva)) / 100).toFixed(2))
        }} /></label>
        <label>IVA USD <input aria-label="IVA verificado" required type="number" min="0" step="0.01" value={iva} onChange={e => {
          setIva(e.target.value); setTotal(((centavos(subtotal) + centavos(e.target.value)) / 100).toFixed(2))
        }} /></label>
        <label>Total USD <input aria-label="Total verificado" required type="number" min="0.01" step="0.01" value={total} onChange={e => {
          setTotal(e.target.value); setSubtotal(((centavos(e.target.value) - centavos(iva)) / 100).toFixed(2))
        }} /></label>
        <label>Retención USD <input aria-label="Retención verificada" required type="number" min="0" max={total} step="0.01" value={retencion} onChange={e => setRetencion(e.target.value)} /></label>
        <label>Neto a pagar USD <input aria-label="Neto verificado" required type="number" min={cuenta.pagado} max={total} step="0.01"
          value={retencion === "" ? "" : ((centavos(total) - centavos(retencion)) / 100).toFixed(2)}
          onChange={e => setRetencion(((centavos(total) - centavos(e.target.value)) / 100).toFixed(2))} /></label>
        <label>Motivo de la corrección <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        <label><input type="checkbox" required /> Verifiqué los valores con la factura física.</label>
      </fieldset>
      <button disabled={guardando}>{guardando ? "Guardando…" : pendiente ? "Reintentar corrección" : "Guardar importes verificados"}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    {historial.length > 0 && <details><summary>Bitácora de cambios de importes</summary>
      {historial.map(fila => <div key={fila.id}>
        <p>{new Date(fila.creado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })} · Responsable: {fila.responsable_email} · {fila.motivo}</p>
        <table className="compras-sri-tabla"><thead><tr><th>Campo</th><th>Anterior USD</th><th>Nuevo USD</th></tr></thead>
          <tbody>{(["subtotal", "iva", "total", "retencion", "neto"] as const).map(campo => <tr key={campo}>
            <td>{campo}</td><td>{numero(fila.anterior[campo]) || "Pendiente"}</td><td>{numero(fila[campo])}</td>
          </tr>)}</tbody></table>
      </div>)}
    </details>}
  </section>
}
