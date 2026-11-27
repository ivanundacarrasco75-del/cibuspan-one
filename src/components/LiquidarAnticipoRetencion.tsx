import { useEffect, useRef, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { consultarAnticipo, liquidarAnticipoRetencion, type Anticipo, type LiquidacionAnticipo } from "../repositories/anticiposRepository"

const dinero = (valor: number) => Number(valor).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const textoError = (fallo: unknown) => fallo && typeof fallo === "object" && "message" in fallo ? String(fallo.message) : "No se pudo liquidar el anticipo."

function Liquidacion({ id, cerrar, alGuardar }: { id: string; cerrar: () => void; alGuardar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const ocupado = useRef(false)
  const operacion = useRef(crypto.randomUUID())
  const [anticipo, setAnticipo] = useState<Anticipo | null>(null)
  const [retencion, setRetencion] = useState("")
  const [motivo, setMotivo] = useState("")
  const [confirmado, setConfirmado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState<LiquidacionAnticipo | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { if (!dialogo.current?.open) dialogo.current?.showModal() }, [])
  useEffect(() => {
    let vigente = true
    void consultarAnticipo(id).then(a => {
      if (vigente) { setAnticipo(a); setRetencion((Number(a.monto) - Number(a.pagado)).toFixed(2)) }
    }).catch(fallo => { if (vigente) setError(textoError(fallo)) })
    return () => { vigente = false }
  }, [id])
  const facturas = [...new Map(anticipo?.aplicaciones.map(a => [a.factura_id, a]) ?? []).values()]
  const valido = anticipo && Number(anticipo.saldo) > 0 && Number(anticipo.pagado) > 0
    && Number(anticipo.pagado) === Number(anticipo.aplicado) && facturas.length === 1
  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!anticipo || !valido || ocupado.current) return
    const solicitud = pendiente ?? { operacion: operacion.current, anticipo: id, factura: facturas[0].factura_id,
      monto: anticipo.monto, pagado: anticipo.pagado, retencion, motivo }
    ocupado.current = true; setGuardando(true); setPendiente(solicitud); setError("")
    try { await liquidarAnticipoRetencion(solicitud); alGuardar() }
    catch (fallo) {
      if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null)
      setError(textoError(fallo))
    } finally { ocupado.current = false; setGuardando(false) }
  }
  return createPortal(<dialog ref={dialogo} className="fin-pagos-dialogo" aria-labelledby="titulo-liquidar-anticipo"
    onCancel={evento => { evento.preventDefault(); if (!ocupado.current) cerrar() }}
    onClose={() => { if (!ocupado.current) cerrar() }}>
    <h2 id="titulo-liquidar-anticipo">Liquidar anticipo con retención</h2>
    {!anticipo && !error && <p>Cargando anticipo…</p>}
    {anticipo && <>
      <p>{anticipo.numero} · {anticipo.proveedor}</p>
      <p>Importe registrado: USD {dinero(anticipo.monto)}. Desembolsado y cruzado: USD {dinero(anticipo.aplicado)}.</p>
      {facturas.map(f => <p key={f.factura_id}>Factura {f.numero} · {f.proveedor}</p>)}
      <p>El importe del anticipo se corregirá a USD {dinero(anticipo.pagado)}. La retención se descontará de la factura como cálculo pendiente de emisión. Ambos saldos deberán quedar en cero.</p>
      <p>El pago bancario y el cruce se conservan. El importe anterior y el responsable quedan en el historial.</p>
      {!valido && <p role="alert">Requiere un solo cruce, todo el pago aplicado y un saldo pendiente.</p>}
      <form onSubmit={guardar}>
        <fieldset disabled={guardando || pendiente !== null || !valido}>
          <label>Total retenido USD <input required type="number" min="0.01" step="0.01" value={retencion} onChange={e => setRetencion(e.target.value)} /></label>
          <label>Motivo <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
          <label><input required type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} /> Confirmo que toda la diferencia es retención de esta factura.</label>
        </fieldset>
        <div className="fin-pagos-filtros"><button disabled={guardando || !valido || !confirmado}>{guardando ? "Guardando…" : pendiente ? "Reintentar liquidación" : "Guardar liquidación"}</button></div>
      </form>
    </>}
    {error && <p role="alert" className="compras-sri-error">{error}</p>}
    <button disabled={guardando} onClick={cerrar}>{pendiente ? "Cerrar y actualizar" : "Cerrar"}</button>
  </dialog>, document.body)
}

export default function LiquidarAnticipoRetencion({ anticipoId, disabled, alGuardar }: { anticipoId: string; disabled?: boolean; alGuardar: () => void }) {
  const [abierto, setAbierto] = useState(false)
  return <>
    <button type="button" disabled={disabled} onClick={() => setAbierto(true)}>Liquidar con retención</button>
    {abierto && <Liquidacion id={anticipoId} cerrar={() => { setAbierto(false); alGuardar() }} alGuardar={() => { setAbierto(false); alGuardar() }} />}
  </>
}
