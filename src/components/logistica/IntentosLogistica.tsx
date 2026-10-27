import { useState } from "react"
import type { useLogisticaSegura } from "../../hooks/useLogisticaSegura"
import { LogisticaNoEjecutadaError, type IntentoLogistica } from "../../utils/operacionLogisticaSegura"
export default function IntentosLogistica({ control, ocupado, onResuelta }: { control: ReturnType<typeof useLogisticaSegura>; ocupado: boolean; onResuelta: () => Promise<void> }) {
  const [mensaje, setMensaje] = useState(""), [error, setError] = useState(""), [cerrado, setCerrado] = useState<IntentoLogistica | null>(null)
  function descargar(s: IntentoLogistica) { const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `Intento-logistica-${s.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
  async function recuperar(s: IntentoLogistica, reintentar: boolean) {
    setError(""); setMensaje("")
    try {
      const r = await control.recuperar(s, reintentar)
      setError("")
      if (r.estado === "ANULADA") { setCerrado(s); setMensaje("El intento quedó cerrado sin ejecutar. Actualiza el pedido y revisa otra vez antes de confirmar.") }
      else { setCerrado(null); setMensaje(r.tipo === "ELIMINAR" ? `Eliminación del pedido ${r.pedido_id} confirmada; no se repitió.` : `Despacho del pedido ${r.pedido_id} confirmado; no se volvió a descontar stock.`) }
      await onResuelta()
    } catch (e) { if (e instanceof LogisticaNoEjecutadaError) setCerrado(s); setError((e as Error).message) }
  }
  if (control.listo && !control.ocupado && !control.error && !control.pendientes.length && !mensaje && !error && !cerrado) return null
  return <section style={{ background: "#fff7e6", color: "#493821", border: "1px solid #dbbd7d", borderRadius: 10, padding: 16, marginBottom: 18 }} aria-label="Operaciones logísticas por comprobar">
    {!control.listo && !control.error && <p role="status">Comprobando si hay operaciones pendientes…</p>}
    {control.ocupado && <p role="status">Comprobando el resultado de la operación…</p>}
    {control.error && <p role="alert">{control.error} <button type="button" disabled={ocupado || control.ocupado} onClick={() => void control.refrescar()}>Volver a comprobar</button></p>}
    {control.pendientes.length > 0 && <><h2>Hay una operación por comprobar</h2><p>Puede haberse ejecutado aunque no llegara la respuesta. Conserva este navegador y comprueba el intento antes de repetirlo o cambiar de dispositivo.</p></>}
    {control.pendientes.map(s => <div key={s.id}><p>{s.tipo === "ELIMINAR" ? "Eliminar pedido" : "Confirmar despacho"}: {s.pedidoId}</p>
      <button type="button" disabled={ocupado || control.ocupado} onClick={() => void recuperar(s, true)}>Reintentar la misma operación</button>{" "}
      <button type="button" disabled={ocupado || control.ocupado} onClick={() => void recuperar(s, false)}>Comprobar para corregir</button>{" "}
      <button type="button" onClick={() => descargar(s)}>Descargar copia</button>
    </div>)}
    {mensaje && <p role="status">{mensaje}</p>}{error && <p role="alert">{error}</p>}
    {cerrado && <button type="button" onClick={() => descargar(cerrado)}>Descargar copia del intento cerrado</button>}
  </section>
}
