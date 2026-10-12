import { useEffect, useRef, useState } from "react"
import { analizarCapturasFavorita, completarLecturaVisitaCampo, obtenerFotosCampo, type LecturaFavorita } from "../../repositories/campoComercialRepository"
import { CAMPOS_CANTIDADES_CAMPO, completarCantidadesCaptura, prepararRecuperacionCaptura, tieneCantidadesCaptura, type CampoCantidadCaptura } from "../../utils/lecturaCapturasCampo"
import type { RegistroDashboardCampo } from "../../utils/dashboardVisitasRotacion"
import { localDeCaptura, type LocalCampo } from "../../utils/georreferenciaCampo"

export default function RecuperarLecturaVisita({ registro, locales, alCompletar, deshabilitado = false }: { registro: RegistroDashboardCampo; locales: LocalCampo[]; alCompletar: () => void; deshabilitado?: boolean }) {
  const [lectura, setLectura] = useState<LecturaFavorita | null>(null)
  const [valores, setValores] = useState<Record<CampoCantidadCaptura, number | null> | null>(null)
  const [imagenes, setImagenes] = useState<Array<{ ruta: string; url: string }>>([])
  const [ocupado, setOcupado] = useState(false)
  const [progreso, setProgreso] = useState("")
  const [error, setError] = useState("")
  const revision = useRef(0)
  useEffect(() => () => { revision.current++ }, [])
  if (!registro.capturas_app?.length) return <small>Sin capturas de la app guardadas.</small>
  async function releer() {
    if (deshabilitado || ocupado) return
    const id = ++revision.current
    setOcupado(true); setError(""); setLectura(null); setValores(null); setProgreso("Abriendo capturas guardadas…")
    try {
      const urls = await obtenerFotosCampo(registro.capturas_app!)
      if (revision.current !== id) return
      setImagenes(urls)
      const archivos = await Promise.all(urls.map(async (imagen, i) => {
        const respuesta = await fetch(imagen.url)
        if (!respuesta.ok) throw new Error("No se pudo descargar una captura guardada.")
        const blob = await respuesta.blob()
        return new File([blob], `captura-${i + 1}`, { type: blob.type })
      }))
      if (revision.current !== id) return
      const resultado = await analizarCapturasFavorita(archivos, (porcentaje, mensaje) => { if (revision.current === id) setProgreso(`${mensaje} ${porcentaje}%`) })
      if (revision.current !== id) return
      setLectura(resultado)
      const localLeido = resultado.local_nombre ? localDeCaptura(resultado.local_nombre, locales) : null
      if (localLeido && localLeido.id !== registro.local_id) throw new Error("La captura corresponde a otro local. No se aplicaron cambios.")
      const codigo = (resultado.codigo_barras ?? "").replace(/\D/g, "")
      if (/^\d{13}$/.test(codigo) && codigo !== registro.producto_codigo.replace(/T$/i, "")) {
        throw new Error("El código reconocido corresponde a otro SKU. Revisa las capturas; no se aplicaron cambios.")
      }
      setValores(completarCantidadesCaptura(registro.lectura_guardada ?? {}, resultado))
      if (!tieneCantidadesCaptura(resultado)) setError("El lector no reconoció cantidades. Revisa el texto reconocido; puedes completar manualmente los valores verificables antes de guardar.")
    } catch (err) { if (revision.current === id) setError(err instanceof Error ? err.message : "No se pudieron leer las capturas.") }
    finally { if (revision.current === id) { setOcupado(false); setProgreso("") } }
  }
  async function guardar() {
    if (!valores || !lectura || ocupado || deshabilitado) return
    setOcupado(true); setError(""); setProgreso("Completando esta visita…")
    try {
      const datos = prepararRecuperacionCaptura(valores, lectura, registro.lectura_guardada ?? {})
      await completarLecturaVisitaCampo(registro.id, registro.actualizado_en, datos)
      alCompletar()
    } catch (err) { setError(err instanceof Error ? err.message : "No se guardaron las cantidades.") }
    finally { setOcupado(false); setProgreso("") }
  }
  return <div className="vr-recuperar">
    <button className="vr-releer" type="button" disabled={ocupado || deshabilitado} onClick={() => void releer()}>{ocupado ? progreso : `Releer capturas (${registro.capturas_app.length})`}</button>
    <p>Lee las fotos guardadas de este SKU. Revisa las cantidades antes de guardarlas en esta misma visita.</p>
    {imagenes.map((i) => <a key={i.ruta} href={i.url} target="_blank" rel="noopener noreferrer">Abrir captura</a>)}
    {error && <p role="alert">{error}</p>}
    {lectura?.advertencias.map((a, i) => <p key={i}>{a}</p>)}
    {valores && lectura && <><div className="vr-tabla-scroll"><table><thead><tr><th>Campo</th><th>Ya guardado</th><th>Reconocido ahora</th><th>Guardar</th></tr></thead><tbody>{CAMPOS_CANTIDADES_CAMPO.map(([campo, nombre]) => <tr key={campo}><th>{nombre}</th><td>{registro.lectura_guardada?.[campo] ?? "—"}</td><td>{lectura[campo] ?? "Sin reconocer"}</td><td><input type="number" min="0" step="any" aria-label={`Completar ${nombre}`} disabled={ocupado} value={valores[campo] ?? ""} onChange={(e) => setValores((v) => v && ({ ...v, [campo]: e.target.value === "" ? null : Number(e.target.value) }))} /></td></tr>)}</tbody></table></div><button type="button" disabled={ocupado} onClick={() => void guardar()}>Guardar datos en esta visita</button></>}
    {lectura?.texto_ocr && <details><summary>Texto reconocido</summary><pre>{lectura.texto_ocr}</pre></details>}
  </div>
}
