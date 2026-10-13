import { useEffect, useRef, useState } from "react"
import { analizarCapturasFavorita, completarLecturaVisitaCampo, obtenerFotosCampo, type LecturaFavorita } from "../../repositories/campoComercialRepository"
import { CAMPOS_LECTURA_VALIDABLES, VERSION_VALIDACION_CAMPO, type VerificacionCamposCampo } from "../../utils/validacionLecturasCampo"
import { CAMPOS_CANTIDADES_CAMPO, CAMPOS_FECHAS_CAMPO, proponerLecturaRevisadaCampo, prepararRecuperacionCaptura, tieneCantidadesCaptura, type CampoCantidadCaptura, type CampoFechaCaptura } from "../../utils/lecturaCapturasCampo"
import type { RegistroDashboardCampo } from "../../utils/dashboardVisitasRotacion"
import { localDeCaptura, type LocalCampo } from "../../utils/georreferenciaCampo"
import { guardarLecturaComprobadaCampo } from "../../utils/recuperacionCapturasCampo"

export default function RecuperarLecturaVisita({ registro, locales, alCompletar, deshabilitado = false }: { registro: RegistroDashboardCampo; locales: LocalCampo[]; alCompletar: () => void; deshabilitado?: boolean }) {
  const [lectura, setLectura] = useState<LecturaFavorita | null>(null)
  const [valores, setValores] = useState<Record<CampoCantidadCaptura, number | null> | null>(null)
  const [fechas, setFechas] = useState<Record<CampoFechaCaptura, string | null>>({ fecha_ultimo_pedido: null, fecha_ultimo_despacho: null })
  const [confirmados, setConfirmados] = useState<string[]>([])
  const [camposBorrar, setCamposBorrar] = useState<string[]>([])
  const [mensaje, setMensaje] = useState("")
  const [imagenes, setImagenes] = useState<Array<{ ruta: string; url: string }>>([])
  const [ocupado, setOcupado] = useState(false)
  const [progreso, setProgreso] = useState("")
  const [error, setError] = useState("")
  const revision = useRef(0)
  const operacion = useRef(false)
  useEffect(() => () => { revision.current++ }, [])
  if (!registro.capturas_app?.length) return <small>Sin capturas de la app guardadas.</small>
  async function releer() {
    if (deshabilitado || ocupado || operacion.current) return
    operacion.current = true
    const id = ++revision.current
    setOcupado(true); setError(""); setMensaje(""); setLectura(null); setValores(null); setCamposBorrar([]); setConfirmados([]); setProgreso("Abriendo capturas guardadas…")
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
      const resultado = await analizarCapturasFavorita(archivos, (porcentaje, mensaje) => { if (revision.current === id) setProgreso(`${mensaje} ${porcentaje}%`) }, registro.producto_codigo)
      if (revision.current !== id) return
      setLectura(resultado)
      const localLeido = resultado.local_nombre ? localDeCaptura(resultado.local_nombre, locales) : null
      if (localLeido && localLeido.id !== registro.local_id) throw new Error("La captura corresponde a otro local. No se aplicaron cambios.")
      const codigo = (resultado.codigo_barras ?? "").replace(/\D/g, "")
      if (/^\d{13}$/.test(codigo) && codigo !== registro.producto_codigo.replace(/T$/i, "")) {
        throw new Error("El código reconocido corresponde a otro SKU. Revisa las capturas; no se aplicaron cambios.")
      }
      const propuesta = proponerLecturaRevisadaCampo(registro.lectura_guardada ?? {}, resultado)
      setValores(propuesta.valores); setFechas(propuesta.fechas); setCamposBorrar(propuesta.camposBorrar)
      setProgreso("Guardando los campos comprobados…")
      const guardada = await guardarLecturaComprobadaCampo({ registro, lectura: resultado, locales,
        cancelada: () => revision.current !== id,
        guardar: (datos) => completarLecturaVisitaCampo(registro.id, registro.actualizado_en, datos),
      })
      if (revision.current !== id) return
      if (guardada) { alCompletar(); return }
      setMensaje("Sin cambios automáticos. Puedes revisar y guardar manualmente los campos pendientes.")
      if (!tieneCantidadesCaptura(resultado)) setError("El lector no reconoció cantidades. Revisa el texto reconocido; puedes completar manualmente los valores verificables antes de guardar.")
    } catch (err) { if (revision.current === id) setError(err instanceof Error ? err.message : "No se pudieron leer las capturas.") }
    finally { operacion.current = false; if (revision.current === id) { setOcupado(false); setProgreso("") } }
  }
  async function guardar() {
    if (!valores || !lectura || ocupado || deshabilitado || operacion.current) return
    operacion.current = true
    setOcupado(true); setError(""); setProgreso("Completando esta visita…")
    try {
      const datos = hayCambiosDatos ? prepararRecuperacionCaptura(valores, lectura, registro.lectura_guardada ?? {}, fechas, camposBorrar) : { confianza: lectura.confianza, texto_ocr: lectura.texto_ocr ?? "", advertencias: lectura.advertencias }
      const verificacion: VerificacionCamposCampo = Object.fromEntries(CAMPOS_LECTURA_VALIDABLES.filter(([c]) => c in datos || camposBorrar.includes(c) || confirmados.includes(c)).map(([c]) => [c, { estado: "REVISION_MANUAL", valor: c.startsWith("fecha_") ? fechas[c as CampoFechaCaptura] : valores[c as CampoCantidadCaptura] }]))
      await completarLecturaVisitaCampo(registro.id, registro.actualizado_en, { ...datos, verificacion_campos: verificacion, version_validacion: VERSION_VALIDACION_CAMPO })
      alCompletar()
    } catch (err) { setError(err instanceof Error ? err.message : "No se guardaron las cantidades.") }
    finally { operacion.current = false; setOcupado(false); setProgreso("") }
  }
  function marcarBorrado(campo: string, vacio: boolean) {
    setCamposBorrar((actuales) => vacio && registro.lectura_guardada?.[campo as CampoCantidadCaptura | CampoFechaCaptura] != null ? [...new Set([...actuales, campo])] : actuales.filter((c) => c !== campo))
  }
  function aplicarReconocidos() {
    if (!lectura || !valores) return
    const cantidades = { ...valores }, fechasNuevas = { ...fechas }, borrar = new Set(camposBorrar)
    for (const [c] of CAMPOS_CANTIDADES_CAMPO) {
      if (lectura[c] != null) { cantidades[c] = lectura[c]; borrar.delete(c) }
      else if (lectura.campos_sin_dato?.includes(c)) { cantidades[c] = null; if (registro.lectura_guardada?.[c] != null) borrar.add(c) }
    }
    for (const [c] of CAMPOS_FECHAS_CAMPO) {
      if (lectura[c]) { fechasNuevas[c] = lectura[c]; borrar.delete(c) }
      else if (lectura.campos_sin_dato?.includes(c)) { fechasNuevas[c] = null; if (registro.lectura_guardada?.[c] != null) borrar.add(c) }
    }
    setValores(cantidades); setFechas(fechasNuevas); setCamposBorrar([...borrar]); setError("")
    setMensaje("Valores reconocidos aplicados a la columna Guardar. Revisa las correcciones y guarda los cambios.")
  }
  const hayCambiosDatos = valores && (camposBorrar.length > 0 || CAMPOS_CANTIDADES_CAMPO.some(([c]) => valores[c] != null && valores[c] !== registro.lectura_guardada?.[c]) || CAMPOS_FECHAS_CAMPO.some(([c]) => fechas[c] != null && fechas[c] !== registro.lectura_guardada?.[c]))
  const hayCambios = hayCambiosDatos || confirmados.length > 0
  const campos = [...CAMPOS_CANTIDADES_CAMPO.slice(0, -2), CAMPOS_FECHAS_CAMPO[0], CAMPOS_CANTIDADES_CAMPO.at(-2)!, CAMPOS_FECHAS_CAMPO[1], CAMPOS_CANTIDADES_CAMPO.at(-1)!]
  return <div className="vr-recuperar">
    <button className="vr-releer" type="button" disabled={ocupado || deshabilitado} onClick={() => void releer()}>{ocupado ? progreso : `Releer y guardar comprobados (${registro.capturas_app.length})`}</button>
    <p>Lee las capturas, guarda automáticamente los campos comprobados y actualiza el gráfico. Los datos manuales declarados se conservan; los campos dudosos quedan para revisión.</p>
    {imagenes.map((i) => <a key={i.ruta} href={i.url} target="_blank" rel="noopener noreferrer">Abrir captura</a>)}
    {error && <p className="vr-error" role="alert">{error}</p>}
    {lectura?.advertencias.map((a, i) => <p key={i}>{a}</p>)}
    {valores && lectura && <>
      <button type="button" disabled={ocupado || deshabilitado} onClick={aplicarReconocidos}>Aplicar valores reconocidos</button>
      <p>La columna Guardar propone los valores reconocidos. Cuando el lector no reconoce un campo, conserva el anterior y lo señala. Revisa antes de guardar.</p>
      <div className="vr-tabla-scroll"><table><thead><tr><th>Campo</th><th>Ya guardado</th><th>Reconocido ahora</th><th>Guardar</th></tr></thead><tbody>{campos.map(([campo, nombre]) => {
        const esFecha = campo.startsWith("fecha_"), cantidad = campo as CampoCantidadCaptura, fecha = campo as CampoFechaCaptura
        const valor = esFecha ? fechas[fecha] : valores[cantidad]
        return <tr key={campo} className={camposBorrar.includes(campo) || valor != null && valor !== registro.lectura_guardada?.[campo] ? "vr-cambio-lectura" : undefined}><th>{nombre}</th><td>{registro.lectura_guardada?.[campo] ?? "—"}</td><td>{lectura[campo] ?? (lectura.campos_sin_dato?.includes(campo) ? "Sin dato en captura (—)" : "Sin reconocer")}<small>{lectura.verificacion_campos?.[campo]?.estado === "DOBLE_LECTURA" ? "Dos lecturas coinciden" : "Pendiente de comprobar"}</small></td><td><input type={esFecha ? "date" : "number"} min={esFecha ? undefined : "0"} step={esFecha ? undefined : "any"} aria-label={`Completar ${nombre}`} disabled={ocupado || deshabilitado} value={valor ?? ""} onChange={(e) => {
          const vacio = e.target.value === ""; marcarBorrado(campo, vacio)
          if (esFecha) setFechas((v) => ({ ...v, [fecha]: vacio ? null : e.target.value }))
          else setValores((v) => v && ({ ...v, [cantidad]: vacio ? null : Number(e.target.value) }))
          setError(""); setMensaje("")
        }} />{camposBorrar.includes(campo) ? <small>Se quitará el dato anterior al guardar.</small> : lectura[campo] == null && valor != null && valor === registro.lectura_guardada?.[campo] && <small>Dato anterior conservado: el lector no reconoció este campo.</small>}<label><input type="checkbox" style={{ width: "auto" }} disabled={ocupado || deshabilitado} checked={confirmados.includes(campo)} onChange={(e) => setConfirmados((v) => e.target.checked ? [...new Set([...v, campo])] : v.filter((c) => c !== campo))} />Comprobé este campo en la captura</label></td></tr>
      })}</tbody></table></div>
      {mensaje && <p role="status">{mensaje}</p>}
      <button type="button" disabled={ocupado || deshabilitado || !hayCambios} onClick={() => void guardar()}>{ocupado ? progreso : "Guardar cambios en esta visita"}</button>
      {!hayCambios && <p>Sin cambios pendientes: los valores de la columna Guardar ya están en esta visita. Si comprobaste un campo pendiente en la captura, marca su casilla para registrarlo como revisión manual.</p>}
    </>}
    {lectura?.texto_ocr && <details><summary>Texto reconocido</summary><pre>{lectura.texto_ocr}</pre></details>}
  </div>
}
