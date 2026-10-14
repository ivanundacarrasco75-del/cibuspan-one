import { useEffect, useRef, useState } from "react"
import { completarLecturaVisitaCampo, leerCapturasGuardadasCampo } from "../../repositories/campoComercialRepository"
import type { RegistroDashboardCampo } from "../../utils/dashboardVisitasRotacion"
import type { LocalCampo } from "../../utils/georreferenciaCampo"
import { capturasPendientesCampo, recuperarCapturasPendientesCampo, type ResultadoRecuperacionCampo } from "../../utils/recuperacionCapturasCampo"
import { claveProcesamientoCampo, excepcionesProcesamientoCampo, procesarVisitasAutomaticamenteCampo, visitasSinProcesarCampo } from "../../utils/procesamientoAutomaticoCampo"
import { resumenDatosCampo, resumenResultadosDatosCampo } from "../../utils/estadoDatosCampo"

export default function RecuperarCapturasPendientes({ registros, locales, deshabilitado, alCambiarEstado, alTerminar, automatico = false }: {
  registros: RegistroDashboardCampo[]; locales: LocalCampo[]; deshabilitado: boolean
  alCambiarEstado: (ocupado: boolean) => void; alTerminar: () => void
  automatico?: boolean
}) {
  const [ocupado, setOcupado] = useState(false)
  const [progreso, setProgreso] = useState("")
  const [resultados, setResultados] = useState<ResultadoRecuperacionCampo[]>([])
  const [resumen, setResumen] = useState("")
  const cancelada = useRef(false), ejecutando = useRef(false), vigente = useRef(true)
  const intentadas = useRef(new Set<string>()), pausada = useRef(false)
  useEffect(() => { vigente.current = true; return () => { vigente.current = false; cancelada.current = true } }, [])
  const pendientes = capturasPendientesCampo(registros)
  const estadoDatos = resumenDatosCampo(registros)
  const idsVisibles = new Set(registros.map((r) => r.id))
  const excepciones = [...new Map([...excepcionesProcesamientoCampo(registros), ...resultados.filter((r) => idsVisibles.has(r.id) && (r.estado === "ERROR" || r.estado === "REVISAR" || r.mensaje.includes("Excepciones:")))].map((r) => [r.id, r])).values()]
  useEffect(() => {
    if (automatico && !deshabilitado && !ocupado && !pausada.current && visitasSinProcesarCampo(registros).some((r) => !intentadas.current.has(claveProcesamientoCampo(r)))) void recuperar(undefined, true)
  }, [registros, locales, deshabilitado, ocupado, automatico])
  function descargarDiagnostico() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ resumen, resultados }, null, 2)], { type: "application/json" }))
    const enlace = document.createElement("a")
    enlace.href = url; enlace.download = "diagnostico_lectura_capturas.json"; enlace.click(); URL.revokeObjectURL(url)
  }
  async function recuperar(diagnostico?: Map<string, import("../../repositories/campoComercialRepository").LecturaFavorita>, automatico = false) {
    const seleccionados = automatico ? visitasSinProcesarCampo(registros).filter((r) => !intentadas.current.has(claveProcesamientoCampo(r)))
      : diagnostico ? registros.filter((r) => diagnostico.has(r.id) && r.lector_estado !== "RESPALDO_MANUAL") : pendientes
    if (ejecutando.current || deshabilitado || !seleccionados.length) return
    ejecutando.current = true; cancelada.current = false
    for (const r of seleccionados) intentadas.current.add(claveProcesamientoCampo(r))
    setOcupado(true); alCambiarEstado(true); setResultados([]); setResumen(""); setProgreso(diagnostico ? "Iniciando comprobación del diagnóstico…" : "Iniciando lectura de capturas…")
    try {
      let guardadas = 0
      const respuesta = await (automatico ? procesarVisitasAutomaticamenteCampo : recuperarCapturasPendientesCampo)({ registros: seleccionados, locales,
        leerImagenes: (r: RegistroDashboardCampo, avance: (texto: string) => void) => leerCapturasGuardadasCampo(r.capturas_app!, avance, r.producto_codigo),
        leer: async (r, avance) => {
          if (!diagnostico) return leerCapturasGuardadasCampo(r.capturas_app!, avance, r.producto_codigo)
          avance("Comprobando el texto del diagnóstico, sin releer imágenes…")
          const { reanalizarDiagnosticoCapturaCampo } = await import("../../utils/reanalizarDiagnosticoCapturasCampo")
          return reanalizarDiagnosticoCapturaCampo(diagnostico.get(r.id)!, r.producto_codigo)
        },
        guardar: (r, datos) => completarLecturaVisitaCampo(r.id, r.actualizado_en, datos),
        cancelada: () => cancelada.current,
        progreso: (texto) => { if (vigente.current && !cancelada.current) setProgreso(texto) },
        resultado: (r) => { if (vigente.current) { setResultados((actuales) => [...actuales, r]); if (r.estado === "COMPLETADA" && ++guardadas % 10 === 0) alTerminar() } },
      })
      if (!vigente.current) return
      for (const r of seleccionados) if (!respuesta.some((p) => p.id === r.id)) intentadas.current.delete(claveProcesamientoCampo(r))
      const resumenDatos = resumenResultadosDatosCampo(respuesta)
      setResumen(`${cancelada.current ? "Proceso detenido. " : "Último procesamiento terminado. "}${resumenDatos.completos} registros sin excepciones; ${resumenDatos.parciales} con datos guardados y campos pendientes; ${resumenDatos.bloqueados} con lectura bloqueada; ${resumenDatos.errores} con error; ${resumenDatos.sinCambios} sin cambios; ${seleccionados.length - respuesta.length} sin procesar.`)
      alTerminar()
    } catch (err) { if (vigente.current) setResumen(err instanceof Error ? err.message : "No se pudo completar la recuperación.") }
    finally { ejecutando.current = false; if (vigente.current) { setOcupado(false); alCambiarEstado(false); setProgreso("") } }
  }
  async function importarDiagnostico(archivo: File | undefined) {
    if (!archivo || ocupado || deshabilitado || ejecutando.current) return
    try {
      if (archivo.size > 30 * 1024 * 1024) throw new Error("El archivo de diagnóstico es demasiado grande.")
      const datos = JSON.parse(await archivo.text())
      if (!Array.isArray(datos.resultados) || !datos.resultados.length) throw new Error("Selecciona el diagnóstico descargado por esta app.")
      const mapa = new Map<string, import("../../repositories/campoComercialRepository").LecturaFavorita>()
      for (const r of datos.resultados) {
        if (typeof r?.id !== "string" || !r.lectura?.lectura_control) throw new Error("El diagnóstico no contiene las lecturas originales necesarias.")
        if (mapa.has(r.id)) throw new Error("El diagnóstico repite una visita; no se aplicó ningún cambio.")
        mapa.set(r.id, r.lectura)
      }
      if (!registros.some((r) => mapa.has(r.id))) throw new Error("Estas visitas no están en los filtros actuales. Restablece los filtros.")
      await recuperar(mapa)
    } catch (err) { setResumen(err instanceof Error ? err.message : "No se pudo abrir el diagnóstico.") }
  }
  return <section className="vr-recuperacion-conjunta">
    <h3>Estado de las capturas y los datos</h3>
    <div className="vr-cards" aria-label="Datos guardados en los filtros actuales">
      <article><span>Registros de SKU guardados</span><strong>{estadoDatos.registros}</strong><small>Cada local puede tener varios SKU.</small></article>
      <article><span>Capturas guardadas</span><strong>{estadoDatos.capturas}</strong><small>En {estadoDatos.registrosConCapturas} registros de SKU.</small></article>
      <article><span>Rotaciones disponibles</span><strong>{estadoDatos.rotacionesDisponibles}</strong><small>Comprobadas o declaradas manualmente.</small></article>
      <article><span>Rotaciones pendientes</span><strong>{estadoDatos.rotacionesPendientes}</strong><small>Se conserva la captura; el valor disponible se muestra como provisional.</small></article>
    </div>
    <p>{estadoDatos.otrosPendientes} registros tienen otros campos pendientes. Una rotación comprobada sigue disponible aunque falte otro campo. Los nuevos SKU se leen al cargarlos; los pendientes se resuelven en Revisión de datos.</p>
    {ocupado && <><p role="status">{progreso}</p><p>{resultados.length} visitas procesadas · el gráfico se actualiza durante el proceso. Mantén esta pantalla abierta hasta terminar.</p><button type="button" onClick={() => { pausada.current = true; cancelada.current = true; setProgreso("Deteniendo el proceso…") }}>Detener</button></>}
    {!ocupado && pausada.current && <button type="button" onClick={() => { pausada.current = false; void recuperar(undefined, true) }}>Continuar procesamiento automático</button>}
    {resumen && resultados.every((r) => idsVisibles.has(r.id)) && <p role="status">{resumen}</p>}
    {excepciones.length > 0 && <details><summary>Ver excepciones ({excepciones.length})</summary><ul>{excepciones.map((r) => <li key={r.id}>{r.local} · {r.producto}: {r.mensaje}</li>)}</ul></details>}
    <details><summary>Herramientas de recuperación</summary>
    <button className="vr-releer" type="button" disabled={ocupado || deshabilitado || !pendientes.length} onClick={() => void recuperar()}>Auditar y corregir capturas ({deshabilitado ? "…" : pendientes.length})</button>
    <label>Corregir desde diagnóstico JSON<input type="file" accept=".json,application/json" disabled={ocupado || deshabilitado} onChange={(e) => { const archivo = e.target.files?.[0]; e.target.value = ""; void importarDiagnostico(archivo) }} /></label>
    <p>Selecciona el diagnóstico ya descargado para comprobar y corregir sus visitas sin repetir el OCR. Se conserva el respaldo y se respetan los filtros y los cambios manuales.</p>
    <p>Incluye las cinco semanas de los filtros actuales. Revisa también cantidades ya llenas. Corrige campos con dos lecturas coincidentes, conserva los manuales declarados y guarda un respaldo antes de cada cambio. Los campos dudosos quedan pendientes y fuera del gráfico validado. Mantén la app abierta mientras termina.</p>
    {!ocupado && resultados.length > 0 && <button type="button" onClick={descargarDiagnostico}>Descargar diagnóstico de lectura</button>}
    {resultados.length > 0 && <details><summary>Ver registros del último proceso ({resultados.length})</summary><ul>{resultados.map((r) => <li key={r.id}>{r.fecha} · {r.local} · {r.producto}: {r.mensaje}</li>)}</ul></details>}
    </details>
  </section>
}
