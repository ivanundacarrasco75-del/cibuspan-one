import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import type { CuentaCompra } from "../repositories/finanzasComprasRepository"
import { quitarCuentaNomina, type RetiroCuentaNomina } from "../repositories/nominaRepository"

export default function QuitarCuentaNomina({ cuenta, cerrar, alQuitar }: {
  cuenta: CuentaCompra; cerrar: () => void; alQuitar: () => void
}) {
  const dialogo = useRef<HTMLDialogElement>(null), titulo = useId(), bloqueo = useRef(false)
  const [motivo, setMotivo] = useState("Concepto de nómina incorrecto; se volverá a cargar con el concepto correcto")
  const [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const [pendiente, setPendiente] = useState<RetiroCuentaNomina | null>(null)
  const bloqueado = ocupado || pendiente !== null
  useEffect(() => {
    const ventana = dialogo.current, anterior = document.activeElement
    ventana?.showModal()
    return () => { ventana?.close(); if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus() }
  }, [])
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return
    const datos = pendiente ?? { operacion: crypto.randomUUID(), documento: cuenta.id, monto: Number(cuenta.total), motivo: motivo.trim() }
    bloqueo.current = true; setOcupado(true); setPendiente(datos); setError("")
    try { await quitarCuentaNomina(datos); alQuitar() }
    catch (e) {
      if (e && typeof e === "object" && "rechazado" in e && e.rechazado) setPendiente(null)
      setError(e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo quitar la cuenta de nómina.")
    } finally { bloqueo.current = false; setOcupado(false) }
  }
  return createPortal(<dialog ref={dialogo} className="fin-pagos-dialogo" aria-labelledby={titulo}
    onCancel={e => { e.preventDefault(); if (!bloqueado) cerrar() }}>
    <form onSubmit={enviar}><h2 id={titulo}>Quitar cuenta de nómina</h2>
      <p><strong>{cuenta.proveedor}</strong><br />{cuenta.numero_documento}<br />
        Importe: USD {Number(cuenta.total).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <p>Se retirará esta cuenta de Cuentas por pagar y quedarán registrados el documento original, el motivo y el responsable.</p>
      <p>Después puedes volver a Roles de pago → Pagos nómina y cargar el mes, concepto e importe correctos.</p>
      <fieldset disabled={bloqueado}><label>Motivo <input aria-label="Motivo para quitar la cuenta de nómina" required minLength={5} maxLength={500}
        value={motivo} onChange={e => setMotivo(e.target.value)} /></label></fieldset>
      {error && <p className="compras-sri-error" role="alert">{error}</p>}
      <div className="fin-pagos-filtros"><button disabled={ocupado} type="submit">{pendiente ? "Reintentar retiro" : "Confirmar y quitar"}</button>
        <button type="button" disabled={bloqueado} onClick={cerrar}>Cancelar</button></div>
    </form>
  </dialog>, document.body)
}
