import { useEffect, useRef, useState } from "react"
import type { RegistroDashboardCampo } from "../../utils/dashboardVisitasRotacion"
import { fechaHoyCampoDashboard } from "../../utils/dashboardVisitasRotacion"
import { pendientesRevisionCampo, prepararRevisionDatoCampo, type FocoRevisionCampo } from "../../utils/revisionDatosCampo"
import { completarLecturaVisitaCampo, obtenerFotosCampo, type LecturaFavorita } from "../../repositories/campoComercialRepository"
import { localizarCamposImagen, type RegionCampoImagen } from "../../utils/recorteCampoImagen"
import "./RevisionDatosCampo.css"

type ImagenRevision = { url: string; ancho: number; alto: number; regiones: Record<string, RegionCampoImagen> }
export default function RevisionDatosCampo({ registros, foco, alGuardar, deshabilitado = false }: {
  registros: RegistroDashboardCampo[]; foco?: FocoRevisionCampo | null; alGuardar: () => void; deshabilitado?: boolean
}) {
  const [fecha, setFecha] = useState(foco?.fecha ?? fechaHoyCampoDashboard())
  const [clave, setClave] = useState(foco ? `${foco.registroId}:${foco.campo}` : "")
  const [valor, setValor] = useState(""), [sinDato, setSinDato] = useState(false), [confirmado, setConfirmado] = useState(false)
  const [imagenes, setImagenes] = useState<ImagenRevision[]>([]), [abriendo, setAbriendo] = useState(false)
  const [guardando, setGuardando] = useState(false), [error, setError] = useState(""), [mensaje, setMensaje] = useState("")
  const cache = useRef(new Map<string, ImagenRevision[]>()), secuencia = useRef(0), operacion = useRef(false)
  const pendientes = pendientesRevisionCampo(registros), visibles = pendientes.filter((p) => !fecha || p.registro.fecha === fecha)
  const elegido = visibles.find((p) => p.clave === clave) ?? visibles[0]
  const fechas = [...new Set([fechaHoyCampoDashboard(), ...registros.map((r) => r.fecha)])].sort().reverse()
  useEffect(() => () => { secuencia.current++; for (const imgs of cache.current.values()) for (const i of imgs) URL.revokeObjectURL(i.url) }, [])
  useEffect(() => {
    if (!elegido) { setImagenes([]); return }
    const r = elegido.registro, c = elegido.campo as keyof LecturaFavorita
    const evidencia = r.lectura_almacenada?.lectura_control
    const principal = evidencia?.principal as Partial<LecturaFavorita> | undefined, control = evidencia?.control as Partial<LecturaFavorita> | undefined
    setValor(String(r.lectura_guardada?.[c] ?? principal?.[c] ?? control?.[c] ?? "")); setSinDato(false); setConfirmado(false); setError("")
    const token = ++secuencia.current, cacheClave = JSON.stringify([r.id, r.capturas_app])
    if (cache.current.has(cacheClave)) { setImagenes(cache.current.get(cacheClave)!); setAbriendo(false); return }
    setImagenes([]); setAbriendo(true)
    void (async () => {
      const urls = await obtenerFotosCampo(r.capturas_app ?? []), nuevas: ImagenRevision[] = []
      try {
        for (const [n, u] of urls.entries()) {
          if (secuencia.current !== token) break
          const respuesta = await fetch(u.url)
          if (!respuesta.ok) throw new Error("No se pudo abrir la captura guardada.")
          const blob = await respuesta.blob(), url = URL.createObjectURL(blob)
          const dimensiones = await new Promise<{ ancho: number; alto: number }>((resolve, reject) => { const img = new Image(); img.onload = () => resolve({ ancho: img.naturalWidth, alto: img.naturalHeight }); img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("El archivo no es una imagen legible.")) }; img.src = url })
          nuevas.push({ url, ...dimensiones, regiones: {} })
          const regiones = await localizarCamposImagen(new File([blob], `captura-${n}`, { type: blob.type }), dimensiones.ancho, dimensiones.alto).catch(() => ({}))
          nuevas[n].regiones = regiones
        }
        if (secuencia.current !== token) { for (const i of nuevas) URL.revokeObjectURL(i.url); return }
        cache.current.set(cacheClave, nuevas); setImagenes(nuevas)
      } catch (e) { for (const i of nuevas) URL.revokeObjectURL(i.url); throw e }
    })().catch((e) => { if (secuencia.current === token) setError(e instanceof Error ? e.message : "No se pudo abrir la evidencia.") }).finally(() => { if (secuencia.current === token) setAbriendo(false) })
  }, [elegido?.clave])
  async function guardar() {
    if (!elegido || !confirmado || operacion.current || deshabilitado) return
    operacion.current = true; setGuardando(true); setError("")
    try {
      if (!sinDato && !valor.trim()) throw new Error("Ingresa el valor o marca que la captura no tiene ese dato.")
      const dato = sinDato ? null : elegido.campo.startsWith("fecha_") ? valor : Number(valor.replace(",", "."))
      const datos = prepararRevisionDatoCampo(elegido.registro, elegido.campo, dato)
      await completarLecturaVisitaCampo(elegido.registro.id, elegido.registro.actualizado_en, datos)
      setMensaje(`${elegido.nombre} guardado como revisión manual. Este campo sale de la lista de pendientes.`)
      alGuardar()
    } catch (e) { setError(e instanceof Error ? e.message : "No se guardó la revisión.") }
    finally { operacion.current = false; setGuardando(false) }
  }
  const conRecorte = imagenes.filter((i) => i.regiones[elegido?.campo ?? ""])
  return <section className="rd-modulo">
    <header><h3>Revisión de datos dudosos</h3><p>Corrige únicamente el campo pendiente. Los datos revisados quedan protegidos y no se vuelven a comprobar automáticamente.</p></header>
    <label>Día de la visita<select value={fecha} disabled={guardando || abriendo || deshabilitado} onChange={(e) => { setFecha(e.target.value); setClave("") }}><option value="">Todas las fechas cargadas</option>{fechas.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
    {mensaje && <p role="status">{mensaje}</p>}
    {!visibles.length ? <p>No hay campos dudosos en la fecha seleccionada.</p> : <div className="rd-columnas">
      <nav aria-label="Campos pendientes"><p>{visibles.length} campos pendientes</p>{visibles.map((p) => <button key={p.clave} type="button" disabled={guardando || abriendo || deshabilitado} aria-pressed={p.clave === elegido?.clave} onClick={() => { setClave(p.clave); setMensaje("") }}><span>{p.registro.local_nombre}</span><small>{p.registro.producto_nombre} · {p.registro.fecha}</small><strong>{p.nombre}</strong></button>)}</nav>
      {elegido && <article><h4>{elegido.registro.local_nombre} · {elegido.registro.producto_nombre}</h4><p>{elegido.nombre}: {elegido.motivo}</p>
        {abriendo && <p role="status">Abriendo y localizando el campo en la captura…</p>}
        {!abriendo && imagenes.length === 0 && <p>No hay una captura disponible para este registro.</p>}
        <div className="rd-evidencia">{(conRecorte.length ? conRecorte : imagenes).map((i) => { const r = i.regiones[elegido.campo]; return <figure key={i.url}>{r ? <svg viewBox={`${r.left} ${r.top} ${r.width} ${r.height}`} role="img" aria-label={`Parte de la captura correspondiente a ${elegido.nombre}`}><image href={i.url} width={i.ancho} height={i.alto} /></svg> : <img src={i.url} alt="Captura guardada; no se pudo localizar el campo automáticamente" />}<figcaption>{r ? elegido.nombre : "Captura completa"}</figcaption><details><summary>Ver imagen completa</summary><img src={i.url} alt="Captura original completa" /></details></figure> })}</div>
        <p>Valor guardado: {String(elegido.registro.lectura_guardada?.[elegido.campo as keyof LecturaFavorita] ?? "Sin dato")}</p>
        <label>{elegido.nombre}<input type={elegido.campo.startsWith("fecha_") ? "date" : "number"} step="any" value={sinDato ? "" : valor} disabled={guardando || abriendo || deshabilitado || sinDato} onChange={(e) => { setValor(e.target.value); setConfirmado(false) }} /></label>
        <label className="rd-confirmacion"><input type="checkbox" checked={sinDato} disabled={guardando || abriendo || deshabilitado} onChange={(e) => { setSinDato(e.target.checked); setConfirmado(false) }} />En la captura este dato está vacío o no aplica.</label>
        <label className="rd-confirmacion"><input type="checkbox" checked={confirmado} disabled={guardando || abriendo || deshabilitado} onChange={(e) => setConfirmado(e.target.checked)} />Comprobé este dato, su fecha y su SKU/local en la captura.</label>
        {error && <p className="vr-error" role="alert">{error}</p>}
        {elegido.registro.puede_procesar === false && <p>Esta visita sólo puede ser corregida por su autor o gerencia.</p>}
        <button type="button" disabled={!confirmado || guardando || abriendo || deshabilitado || elegido.registro.puede_procesar === false} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar y verificar este dato"}</button>
      </article>}
    </div>}
  </section>
}
