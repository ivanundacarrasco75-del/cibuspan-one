import { useEffect, useRef, useState } from "react"
import { completarLecturaVisitaCampo, leerCapturasGuardadasCampo } from "../../repositories/campoComercialRepository"
import type { RegistroDashboardCampo } from "../../utils/dashboardVisitasRotacion"
import type { LocalCampo } from "../../utils/georreferenciaCampo"
import { capturasPendientesCampo, recuperarCapturasPendientesCampo, type ResultadoRecuperacionCampo } from "../../utils/recuperacionCapturasCampo"

export default function RecuperarCapturasPendientes({ registros, locales, deshabilitado, alCambiarEstado, alTerminar }: {
  registros: RegistroDashboardCampo[]; locales: LocalCampo[]; deshabilitado: boolean
  alCambiarEstado: (ocupado: boolean) => void; alTerminar: () => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [progreso, setProgreso] = useState("")
  const [resultados, setResultados] = useState<ResultadoRecuperacionCampo[]>([])
  const [resumen, setResumen] = useState("")
  const cancelada = useRef(false), ejecutando = useRef(false), vigente = useRef(true)
  useEffect(() => { vigente.current = true; return () => { vigente.current = false; cancelada.current = true } }, [])
  const pendientes = capturasPendientesCampo(registros)
  function descargarDiagnostico() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ resumen, resultados }, null, 2)], { type: "application/json" }))
    const enlace = document.createElement("a")
    enlace.href = url; enlace.download = "diagnostico_lectura_capturas.json"; enlace.click(); URL.revokeObjectURL(url)
  }
  async function recuperar() {
    if (ejecutando.current || deshabilitado || !pendientes.length) return
    ejecutando.current = true; cancelada.current = false
    setOcupado(true); alCambiarEstado(true); setResultados([]); setResumen(""); setProgreso("Iniciando lectura de capturas…")
    try {
      const respuesta = await recuperarCapturasPendientesCampo({ registros: pendientes, locales,
        leer: (r, avance) => leerCapturasGuardadasCampo(r.capturas_app!, avance),
        guardar: (r, datos) => completarLecturaVisitaCampo(r.id, r.actualizado_en, datos),
        cancelada: () => cancelada.current,
        progreso: (texto) => { if (vigente.current && !cancelada.current) setProgreso(texto) },
        resultado: (r) => { if (vigente.current) setResultados((actuales) => [...actuales, r]) },
      })
      if (!vigente.current) return
      setResumen(`${cancelada.current ? "Proceso detenido. " : "Lectura finalizada. "}${respuesta.filter((r) => r.estado === "COMPLETADA").length} visitas auditadas; ${respuesta.filter((r) => r.estado === "SIN_CAMBIOS").length} sin cantidades nuevas; ${respuesta.filter((r) => r.estado === "REVISAR").length} para revisar; ${respuesta.filter((r) => r.estado === "ERROR").length} con error. ${pendientes.length - respuesta.length} sin procesar.`)
      alTerminar()
    } catch (err) { if (vigente.current) setResumen(err instanceof Error ? err.message : "No se pudo completar la recuperación.") }
    finally { ejecutando.current = false; if (vigente.current) { setOcupado(false); alCambiarEstado(false); setProgreso("") } }
  }
  return <section className="vr-recuperacion-conjunta">
    <button className="vr-releer" type="button" disabled={ocupado || deshabilitado || !pendientes.length} onClick={() => void recuperar()}>Auditar y corregir capturas ({deshabilitado ? "…" : pendientes.length})</button>
    <p>Incluye las cinco semanas de los filtros actuales. Revisa también cantidades ya llenas. Corrige campos con dos lecturas coincidentes, conserva los manuales declarados y guarda un respaldo antes de cada cambio. Los campos dudosos quedan pendientes y fuera del gráfico validado. Mantén la app abierta mientras termina.</p>
    {ocupado && <><p role="status">{progreso}</p><button type="button" onClick={() => { cancelada.current = true; setProgreso("Deteniendo el proceso…") }}>Detener</button></>}
    {resumen && <p role="status">{resumen}</p>}
    {!ocupado && resultados.length > 0 && <button type="button" onClick={descargarDiagnostico}>Descargar diagnóstico de lectura</button>}
    {resultados.length > 0 && <details><summary>Ver resultados por visita ({resultados.length})</summary><ul>{resultados.map((r) => <li key={r.id}>{r.fecha} · {r.local} · {r.producto}: {r.mensaje}</li>)}</ul></details>}
  </section>
}
