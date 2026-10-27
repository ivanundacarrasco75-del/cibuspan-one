import { useEffect, useRef, useState } from "react"
import { ejecutarLogisticaDb, obtenerIntentosLogisticaDb, reintentarLogisticaDb, resolverLogisticaDb } from "../repositories/logisticaSeguraRepository"
import { LogisticaPendienteError, type DatosLogistica, type IntentoLogistica, type TipoLogistica, type VistaLogistica } from "../utils/operacionLogisticaSegura"
export function useLogisticaSegura() {
  const [pendientes, setPendientes] = useState<IntentoLogistica[]>([]), [listo, setListo] = useState(false), [ocupado, setOcupado] = useState(false), [error, setError] = useState("")
  const accion = useRef(false), lectura = useRef(0)
  async function refrescar() {
    const n = ++lectura.current
    try { const p = await obtenerIntentosLogisticaDb(); if (n !== lectura.current) return; setPendientes(p); setListo(true); setError("") }
    catch (e) { if (n === lectura.current) { setListo(false); setError((e as Error).message) } }
  }
  useEffect(() => { void refrescar(); return () => { lectura.current++ } }, [])
  async function ejecutar(tipo: TipoLogistica, datos: DatosLogistica, vista: VistaLogistica) {
    if (!listo || pendientes.length || accion.current) throw new LogisticaPendienteError()
    accion.current = true; setOcupado(true)
    try { return await ejecutarLogisticaDb(tipo, datos, vista) }
    finally { await refrescar(); accion.current = false; setOcupado(false) }
  }
  async function recuperar(s: IntentoLogistica, reintentar: boolean) {
    if (accion.current) throw new LogisticaPendienteError()
    accion.current = true; setOcupado(true)
    try { return reintentar ? await reintentarLogisticaDb(s) : await resolverLogisticaDb(s) }
    finally { await refrescar(); accion.current = false; setOcupado(false) }
  }
  return { pendientes, ocupado, listo, error, bloqueado: !listo || pendientes.length > 0 || ocupado, refrescar, ejecutar, recuperar }
}
