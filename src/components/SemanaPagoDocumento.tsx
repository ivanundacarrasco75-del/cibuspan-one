import { useEffect, useRef, useState } from "react"
import { guardarSemanaPago } from "../repositories/semanasPagoRepository"
import { semanaEmisionCobro } from "../utils/plazosCobros"
import SelectorSemanaPago from "./SelectorSemanaPago"
export function lunesPago(fecha: string) { return fecha ? semanaEmisionCobro(fecha)?.desde ?? "" : "" }
export default function SemanaPagoDocumento({ documento, inicial, nombre, disabled = false, alGuardar }: { documento: string; inicial?: string | null; nombre: string; disabled?: boolean; alGuardar?: (semana: string | null) => void }) {
  const [valor, setValor] = useState(inicial ?? ""), [guardado, setGuardado] = useState(inicial ?? ""), [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const pendiente = useRef<{ semana: string; anterior: string | null; operacion: string } | null>(null), bloqueo = useRef(false)
  useEffect(() => { setValor(inicial ?? ""); setGuardado(inicial ?? "") }, [inicial, documento])
  async function guardar(nuevo = valor) {
    if (bloqueo.current || disabled) return
    const semana = lunesPago(nuevo)
    if (!pendiente.current && semana === guardado) return
    const solicitud = pendiente.current ?? { semana, anterior: guardado || null, operacion: crypto.randomUUID() }
    bloqueo.current = true; setOcupado(true); pendiente.current = solicitud; setError("")
    try { await guardarSemanaPago(documento, solicitud.semana, solicitud.anterior, solicitud.operacion); setGuardado(solicitud.semana); setValor(solicitud.semana); pendiente.current = null; alGuardar?.(solicitud.semana || null) }
    catch (e) { if (e && typeof e === "object" && "rechazado" in e && e.rechazado) pendiente.current = null; setError(e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo guardar la semana.") }
    finally { bloqueo.current = false; setOcupado(false) }
  }
  return <span className="semana-pago-editor"><SelectorSemanaPago etiqueta={`Semana de pago de ${nombre}`} value={valor} disabled={disabled || ocupado || pendiente.current !== null} onChange={nuevo => { setValor(nuevo); void guardar(nuevo) }} />{ocupado && <small>Guardando…</small>}{error && <span role="alert">{error} <button type="button" onClick={() => void guardar()}>Reintentar</button></span>}</span>
}
