import { useState } from "react"
import { guardarGeorreferenciaLocal, obtenerFotosCampo } from "../../repositories/campoComercialRepository"
import { enlaceMapa, obtenerPosicionCampo, textoUbicacion, type FotoCampo, type GeorreferenciaCampo, type LocalCampo } from "../../utils/georreferenciaCampo"

export function UbicacionCampo({ dato }: { dato?: GeorreferenciaCampo | null }) {
  return <div style={{ fontSize: 12, marginTop: 8 }}>
    {dato && <strong>{dato.local_nombre}</strong>}
    {dato?.direccion && <div>{dato.direccion}</div>}
    {dato?.nombre_local_captura && <div>Local leído de la captura: {dato.nombre_local_captura} · {dato.local_captura_coincide ? "Coincide con el local seleccionado" : "No se pudo confirmar una coincidencia única"}</div>}
    <div>{textoUbicacion(dato)}</div>
    {dato?.ubicacion && <div>Precisión: ±{Math.round(dato.ubicacion.precision)} m · <a href={enlaceMapa(dato.ubicacion)} target="_blank" rel="noopener noreferrer">Ver ubicación en mapa</a></div>}
    {dato?.ubicacion?.registrado_en && <div>GPS registrado: {new Date(dato.ubicacion.registrado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</div>}
  </div>
}

export function FotosCampo({ fotos = [] }: { fotos?: FotoCampo[] }) {
  const [urls, setUrls] = useState<Array<{ ruta: string; url: string }>>([])
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(false)
  if (!fotos.length) return null
  async function abrir() {
    setCargando(true); setError("")
    try { setUrls(await obtenerFotosCampo(fotos.map((f) => f.ruta))) }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudieron cargar las fotos.") }
    finally { setCargando(false) }
  }
  return <details><summary>Fotos y ubicación ({fotos.length})</summary>
    <button type="button" disabled={cargando} onClick={() => void abrir()}>{cargando ? "Cargando fotos…" : "Abrir fotos"}</button>
    {error && <p role="alert">{error}</p>}
    {fotos.map((f) => <figure key={f.ruta} style={{ margin: "12px 0" }}>
      {urls.find((u) => u.ruta === f.ruta) && <a href={urls.find((u) => u.ruta === f.ruta)!.url} target="_blank" rel="noopener noreferrer"><img src={urls.find((u) => u.ruta === f.ruta)!.url} alt={`Percha de ${f.georreferencia.local_nombre}`} style={{ maxWidth: 260, width: "100%" }} /></a>}
      <figcaption>{f.origen === "GALERIA" ? "Foto cargada de galería" : f.origen === "CAMARA" ? "Adjuntada desde el botón de cámara" : "Origen sin registrar"}
        {f.adjuntada_en && <div>Adjuntada: {new Date(f.adjuntada_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</div>}
        <UbicacionCampo dato={f.georreferencia} />
        <div>El GPS corresponde al momento de adjuntar; no confirma el lugar original de una foto de galería.</div>
      </figcaption>
    </figure>)}
  </details>
}

export function ConfigurarUbicacionLocales({ locales, actualizado }: { locales: LocalCampo[]; actualizado: () => Promise<void> }) {
  const [id, setId] = useState("")
  const local = locales.find((l) => l.id === id)
  return <section className="campo-paso">
    <h3>Direcciones y ubicación de los locales</h3>
    <p>Registra el punto del supermercado una sola vez. Se usará para comprobar las visitas sin consultas a servicios de mapas de pago.</p>
    <label><span>Local</span><select value={id} onChange={(e) => setId(e.target.value)}><option value="">Seleccionar local</option>{locales.map((l) => <option key={l.id} value={l.id}>{l.codigo} · {l.nombre}{l.latitud != null ? " · con coordenadas" : " · pendiente"}</option>)}</select></label>
    {local && <FormularioUbicacion key={`${local.id}-${local.referencia_actualizada_en}`} local={local} actualizado={actualizado} />}
  </section>
}

function FormularioUbicacion({ local, actualizado }: { local: LocalCampo; actualizado: () => Promise<void> }) {
  const [direccion, setDireccion] = useState(local.direccion ?? "")
  const [latitud, setLatitud] = useState(String(local.latitud ?? ""))
  const [longitud, setLongitud] = useState(String(local.longitud ?? ""))
  const [radio, setRadio] = useState(local.radio_metros ?? 150)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const [capturas, setCapturas] = useState<Array<{ ruta: string; url: string }>>([])
  async function verPropuesta() {
    setOcupado(true); setError("")
    try { setCapturas(await obtenerFotosCampo(local.propuesta?.capturas ?? [])) }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo abrir la captura.") }
    finally { setOcupado(false) }
  }
  async function gps() {
    setOcupado(true); setError(""); setMensaje("")
    try { const p = await obtenerPosicionCampo(); setLatitud(String(p.latitud)); setLongitud(String(p.longitud)); setMensaje(`Punto obtenido con precisión ±${Math.round(p.precision)} m. Confirma que estás en este local antes de guardar.`) }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo obtener la ubicación.") }
    finally { setOcupado(false) }
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setOcupado(true); setError(""); setMensaje("")
    try {
      if (!latitud.trim() || !longitud.trim()) throw new Error("Ingresa las dos coordenadas.")
      await guardarGeorreferenciaLocal({ ...local, direccion, latitud: Number(latitud), longitud: Number(longitud), radio_metros: radio })
      await actualizado(); setMensaje("Ubicación del local registrada.")
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el punto.") }
    finally { setOcupado(false) }
  }
  return <form onSubmit={(e) => void guardar(e)}>
    {error && <p role="alert" className="campo-error">{error}</p>}{mensaje && <p role="status">{mensaje}</p>}
    <fieldset disabled={ocupado} style={{ border: 0, margin: 0, padding: 0 }}>
      {local.propuesta && <aside className="campo-advertencia">
        <p>Propuesta de la primera visita con GPS y captura coincidente: {local.propuesta.nombre_captura} · {local.propuesta.responsable} · {new Date(local.propuesta.visitado_en).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })} · precisión ±{Math.round(local.propuesta.precision)} m.</p>
        <a href={enlaceMapa(local.propuesta)} target="_blank" rel="noopener noreferrer">Ver punto propuesto</a>
        <button type="button" onClick={() => void verPropuesta()}>Revisar captura de En Percha</button>
        {capturas.map((c) => <a key={c.ruta} href={c.url} target="_blank" rel="noopener noreferrer"><img src={c.url} alt="Captura utilizada para proponer el local" style={{ display: "block", maxWidth: 280, width: "100%" }} /></a>)}
        <button type="button" onClick={() => { setLatitud(String(local.propuesta!.latitud)); setLongitud(String(local.propuesta!.longitud)); setMensaje("Punto propuesto cargado. Revisa el mapa y guarda para confirmar la referencia.") }}>Usar punto propuesto por la captura</button>
      </aside>}
      <label><span>Dirección del local</span><input value={direccion} onChange={(e) => setDireccion(e.target.value)} maxLength={300} /></label>
      <div className="campo-grid campo-grid-3">
        <label><span>Latitud</span><input required type="number" step="any" min={-90} max={90} value={latitud} onChange={(e) => setLatitud(e.target.value)} /></label>
        <label><span>Longitud</span><input required type="number" step="any" min={-180} max={180} value={longitud} onChange={(e) => setLongitud(e.target.value)} /></label>
        <label><span>Radio del local (metros)</span><input required type="number" min={30} max={500} value={radio} onChange={(e) => setRadio(Number(e.target.value))} /></label>
      </div>
      <p>Puedes copiar las coordenadas de un mapa o usar tu ubicación si estás físicamente en el local. Un radio demasiado amplio reduce la precisión de la comprobación.</p>
      <button type="button" onClick={() => void gps()}>Usar mi ubicación para este local</button>
      <button type="submit">{ocupado ? "Procesando…" : "Guardar ubicación del local"}</button>
    </fieldset>
  </form>
}
