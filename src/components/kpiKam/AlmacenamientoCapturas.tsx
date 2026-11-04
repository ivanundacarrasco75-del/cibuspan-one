import { useEffect, useRef, useState } from "react"
import { listarCapturasParaMigrar, solicitarCapturasR2, type CopiaCaptura } from "../../repositories/capturasR2Repository"

export default function AlmacenamientoCapturas() {
  const [ocupado, setOcupado] = useState(false), [mensaje, setMensaje] = useState("")
  const [error, setError] = useState(""), [copias, setCopias] = useState<CopiaCaptura[]>([])
  const [retiradas, setRetiradas] = useState<string[]>([]), [confirmacion, setConfirmacion] = useState("")
  const continuar = useRef(true), operacion = useRef(false)
  useEffect(() => () => { continuar.current = false }, [])
  async function ejecutar(retirar = false) {
    if (operacion.current) return
    if (retirar && confirmacion !== "RETIRAR COPIAS VERIFICADAS") return
    operacion.current = true; continuar.current = true; setOcupado(true); setError("")
    try {
      if (retirar) {
        let total = 0
        for (const c of copias) {
          if (!continuar.current) break
          if (retiradas.includes(c.ruta)) continue
          const r = await solicitarCapturasR2<{ ruta: string; retirado: boolean }>("retirar", { ruta: c.ruta, sha256: c.sha256, confirmacion: "RETIRAR_ORIGINAL_VERIFICADO" })
          if (r.ruta !== c.ruta || r.retirado !== true) throw new Error("No se confirmó el retiro de una copia. Se detuvo el proceso.")
          setRetiradas((prev) => [...prev, c.ruta]); setMensaje(`${++total} originales retirados en esta ejecución; las capturas siguen en R2.`)
        }
        setConfirmacion("")
      } else {
        let despues = "", total = 0
        // Keyset pagination includes all visits, independent of dashboard dates.
        // A retry verifies existing copies instead of adding duplicate files.
        while (continuar.current) {
          const filas = await listarCapturasParaMigrar(despues)
          if (!filas.length) break
          for (const { ruta } of filas) {
            if (!continuar.current) break
            const c = await solicitarCapturasR2<CopiaCaptura>("migrar", { ruta })
            if (c.ruta !== ruta || c.verificada !== true) throw new Error("No se confirmó una copia. Se conservó el original.")
            setCopias((prev) => [...prev.filter((p) => p.ruta !== c.ruta), c])
            setMensaje(`${++total} capturas copiadas y verificadas en esta ejecución. No se borró ningún original.`)
          }
          despues = filas.at(-1)!.ruta
          if (filas.length < 100) break
        }
        if (continuar.current) setMensaje(`${total} capturas verificadas en esta ejecución. Revisa que se abran desde Revisión de datos antes de retirar originales. Las fotos históricas de perchas permanecen en Supabase.`)
      }
    } catch (e) { setError(e instanceof Error ? e.message : "No se completó el traslado.") }
    finally { operacion.current = false; setOcupado(false) }
  }
  function descargar() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ generado_en: new Date().toISOString(), copias_verificadas: copias, originales_retirados: retiradas }, null, 2)], { type: "application/json" }))
    const a = document.createElement("a"); a.href = url; a.download = "traslado_capturas_r2.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="campo-paso">
    <h3>Almacenamiento de capturas</h3>
    <p>Las nuevas capturas se guardan en R2 sin reducir su resolución. El traslado conserva cada vínculo con su visita y compara el archivo completo antes de dar la copia por verificada.</p>
    <p>Supabase debe permitir consultar permisos y descargar los originales. Trasladar archivos no levanta por sí solo una restricción del proyecto.</p>
    <button type="button" disabled={ocupado} onClick={() => void ejecutar()}>Copiar y verificar capturas anteriores</button>
    {ocupado && <button type="button" onClick={() => { continuar.current = false; setMensaje("Se detendrá al terminar el archivo actual.") }}>Detener al terminar este archivo</button>}
    {mensaje && <p role="status">{mensaje}</p>}{error && <p role="alert" className="campo-error">{error}</p>}
    {!!copias.length && <>
      <p>{copias.length} copias verificadas; {retiradas.length} originales retirados en esta sesión.</p>
      <button type="button" onClick={descargar}>Descargar informe del traslado</button>
      <details><summary>Liberar espacio de las capturas ya verificadas</summary>
        <p>Después de comprobar que las capturas se abren desde la app, puedes retirar únicamente sus originales de Supabase. Se vuelve a comparar cada original con R2 antes de retirarlo. No borra la captura en R2, datos de visitas ni fotos de perchas. La cuota y el servicio pueden tardar en actualizarse.</p>
        <label>Escribe RETIRAR COPIAS VERIFICADAS<input value={confirmacion} disabled={ocupado} onChange={(e) => setConfirmacion(e.target.value)} autoComplete="off" /></label>
        <button type="button" disabled={ocupado || confirmacion !== "RETIRAR COPIAS VERIFICADAS"} onClick={() => void ejecutar(true)}>Retirar originales verificados de Supabase</button>
      </details>
    </>}
  </section>
}
