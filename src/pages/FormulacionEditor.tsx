import { useEffect, useRef, useState } from "react"
import {
  obtenerFormulasFmDb, obtenerVersionesFormulaFmDb, obtenerComponentesFmDb,
  type FormulaFmDb, type FormulaVersionFmDb, type PreformulacionComponenteFmDb,
} from "../repositories/formulaRepository"
import { guardarNuevaFormulacion } from "../services/formulacionService"
import { etiquetaVersionFormula, fechaFormulacionHoy, pesoParadaKg, versionPreferidaFormula } from "../utils/formulacionVersion"
import { guardarVersionFormulacion, leerIntentoVersionFormulacion, type IntentoVersionFormulacion } from "../repositories/formulacionGuardadoRepository"

export default function FormulacionEditor({ alGuardar }: { alGuardar: () => void }) {
  const [formulas, setFormulas] = useState<FormulaFmDb[]>([])
  const [formulaId, setFormulaId] = useState("")
  const [versiones, setVersiones] = useState<FormulaVersionFmDb[]>([])
  const [versionId, setVersionId] = useState("")
  const [filas, setFilas] = useState<PreformulacionComponenteFmDb[]>([])
  const [valores, setValores] = useState<Record<string, string>>({})
  const [destinos, setDestinos] = useState<Record<string, "DIRECTO" | "MICRO">>({})
  const [panes, setPanes] = useState("")
  const [pesoBola, setPesoBola] = useState("")
  const [rendimiento, setRendimiento] = useState("")
  const [pesoFinal, setPesoFinal] = useState("")
  const [nombre, setNombre] = useState("")
  const [fecha, setFecha] = useState(fechaFormulacionHoy)
  const [activar, setActivar] = useState(true)
  const [pendiente, setPendiente] = useState<IntentoVersionFormulacion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const bloqueo = useRef(false)
  const version = versiones.find(fila => fila.id === versionId)
  const total = filas.reduce((suma, fila) => suma + (Number(valores[fila.id]?.replace(",", ".")) || 0), 0)
  const formato = (valor: number) => valor.toLocaleString("es-EC", { maximumFractionDigits: 4 })
  const peso = pesoParadaKg(Number(panes), Number(pesoBola))
  const bloqueado = guardando || guardado || !!pendiente
  const microKg = peso !== null && total > 0 ? filas.reduce((suma, fila) =>
    suma + (destinos[fila.id] === "MICRO" ? Number(valores[fila.id]?.replace(",", ".")) || 0 : 0), 0) / total * peso : null

  useEffect(() => {
    let vigente = true
    Promise.all([obtenerFormulasFmDb(), leerIntentoVersionFormulacion()]).then(([datos, intento]) => {
      if (vigente) { setFormulas(datos); setPendiente(intento) }
    })
      .catch(err => { if (vigente) setError(err.message) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    let vigente = true
    setVersiones([]); setVersionId(""); setFilas([]); setError(""); setMensaje("")
    if (!formulaId) return
    setCargando(true)
    obtenerVersionesFormulaFmDb(formulaId).then(datos => {
      if (!vigente) return
      setVersiones(datos); setVersionId(versionPreferidaFormula(datos)?.id ?? "")
      setNombre(`V${Math.max(0, ...datos.map(fila => fila.numero_version)) + 1}`)
    }).catch(err => { if (vigente) setError(err.message) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [formulaId])

  useEffect(() => {
    let vigente = true
    setFilas([]); setValores({}); setDestinos({}); setGuardado(false)
    if (!versionId) return
    const seleccionada = versiones.find(v => v.id === versionId)
    setPanes(String(seleccionada?.panes_por_batch ?? ""))
    setPesoBola(String(seleccionada?.peso_bola_g ??
      (seleccionada?.peso_batch_kg && seleccionada.panes_por_batch ? seleccionada.peso_batch_kg * 1000 / seleccionada.panes_por_batch : "")))
    setRendimiento(String(seleccionada?.rendimiento_unidades ?? seleccionada?.panes_por_batch ?? ""))
    setPesoFinal(String(seleccionada?.peso_final_g ?? ""))
    setCargando(true)
    obtenerComponentesFmDb(versionId).then(datos => {
      if (!vigente) return
      setFilas(datos); setValores(Object.fromEntries(datos.map(fila => [fila.id, String(fila.porcentaje_panadero)])))
      setDestinos(Object.fromEntries(datos.map(fila => [fila.id, fila.destino_tipo])))
    }).catch(err => { if (vigente) setError(err.message) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [versionId])

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!version || bloqueo.current) return
    bloqueo.current = true; setGuardando(true); setError(""); setMensaje("")
    try {
      const id = await guardarNuevaFormulacion({ origen: version, componentes: filas, porcentajes: valores,
        nombre, fecha, activar, destinos,
        parametros: { panes: Number(panes), rendimiento: Number(rendimiento), pesoBolaG: Number(pesoBola), pesoFinalG: Number(pesoFinal) } })
      setGuardado(true)
      setMensaje(`Versión «${nombre.trim()}» guardada${activar ? " y establecida como vigente" : " como borrador"}.`)
      alGuardar()
      // El guardado y la recarga se informan por separado para evitar guardar dos veces.
      try {
        const datos = await obtenerVersionesFormulaFmDb(formulaId)
        setVersiones(datos); setVersionId(id)
        setNombre(`V${Math.max(0, ...datos.map(fila => fila.numero_version)) + 1}`)
      } catch {
        setError("La versión quedó guardada. Vuelve a abrir Formulación para actualizar el listado.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la versión.")
      try { setPendiente(await leerIntentoVersionFormulacion()) } catch { setError("No se pudo comprobar el intento guardado. Conserva el almacenamiento del navegador.") }
    } finally {
      bloqueo.current = false; setGuardando(false)
    }
  }

  async function recuperar() {
    if (!pendiente || bloqueo.current) return
    bloqueo.current = true; setGuardando(true); setError("")
    try {
      await guardarVersionFormulacion(pendiente.origen, pendiente.datos)
      setPendiente(null); setGuardado(true); alGuardar()
      setMensaje("Se recuperó el guardado de la nueva versión de fórmula y su micro.")
      if (formulaId) setVersiones(await obtenerVersionesFormulaFmDb(formulaId))
    } catch (e) {
      setError((e as Error).message)
      try { setPendiente(await leerIntentoVersionFormulacion()) } catch { /* Mantiene bloqueado el intento conocido. */ }
    } finally { bloqueo.current = false; setGuardando(false) }
  }

  return <section className="fm-editor">
    <header><h1>Formulación</h1><p>Selecciona el SKU y su versión. Edita porcentajes, destinos y datos de la parada para guardar una nueva versión.</p></header>
    {error && <p className="fm-error" role="alert">{error}</p>}
    {mensaje && <p className="fm-exito" role="status">{mensaje}</p>}
    {pendiente && <div className="fm-aviso"><p>Hay una nueva versión por confirmar. Comprueba el mismo guardado antes de continuar.</p>
      <button type="button" className="fm-secundario" disabled={guardando} onClick={() => void recuperar()}>Comprobar / reintentar guardado</button></div>}
    <div className="fm-filtros">
      <label>SKU<select value={formulaId} disabled={cargando || guardando || !!pendiente} onChange={e => setFormulaId(e.target.value)}>
        <option value="">Seleccionar SKU</option>
        {formulas.map(fila => <option key={fila.id} value={fila.id}>{fila.codigo} · {fila.nombre}</option>)}
      </select></label>
      <label>Versión<select value={versionId} disabled={cargando || guardando || !!pendiente} onChange={e => { setVersionId(e.target.value); setMensaje(""); setError("") }}>
        <option value="">{formulaId ? "Seleccionar versión" : "Selecciona primero un SKU"}</option>
        {versiones.map(fila => <option key={fila.id} value={fila.id}>{etiquetaVersionFormula(fila)}</option>)}
      </select></label>
    </div>
    {cargando ? <p role="status">Cargando fórmula…</p> : !filas.length ? <p className="fm-aviso">{versionId ? "Esta versión no tiene ingredientes registrados." : "Selecciona un SKU y una versión para ver la fórmula."}</p> :
      <form onSubmit={guardar}>
        <fieldset className="fm-guardado" disabled={bloqueado}><legend>Datos de la parada</legend>
          <div className="fm-filtros">
            <label>Unidades de pan por parada<input type="number" min="1" step="1" required value={panes} onChange={e => setPanes(e.target.value)} /></label>
            <label>Peso de bola (g)<input type="number" min="0.0001" step="0.0001" required value={pesoBola} onChange={e => setPesoBola(e.target.value)} /></label>
            <label>Peso de la parada (kg)<input readOnly value={peso ?? ""} /></label>
            <label>Rendimiento de fundas / unidades vendibles<input type="number" min="1" step="1" required value={rendimiento} onChange={e => setRendimiento(e.target.value)} /></label>
            <label>Peso final por pan (g)<input type="number" min="0.0001" step="0.0001" required value={pesoFinal} onChange={e => setPesoFinal(e.target.value)} /></label>
          </div>
        </fieldset>
        <div className="fm-hoja" tabIndex={0} aria-label="Tabla de formulación, desplazamiento horizontal">
          <table><thead><tr><th>N.º</th><th>Código</th><th>Ingrediente</th><th>Destino</th><th>% panadero</th><th>% real</th></tr></thead>
            <tbody>{filas.map((fila, indice) => <tr key={fila.id}>
              <th scope="row">{indice + 1}</th><td>{fila.materia_prima?.codigo ?? "—"}</td>
              <td>{fila.materia_prima?.nombre ?? "Ingrediente"}{fila.es_harina_base && <small>Harina base</small>}</td>
              <td><select aria-label={`Destino de ${fila.materia_prima?.nombre ?? indice + 1}`} value={destinos[fila.id] ?? "DIRECTO"} disabled={bloqueado || fila.es_harina_base}
                onChange={e => setDestinos(actual => ({ ...actual, [fila.id]: e.target.value as "DIRECTO" | "MICRO" }))}>
                <option value="DIRECTO">Directo</option><option value="MICRO">Micro</option></select></td>
              <td className="fm-editable"><input aria-label={`Porcentaje panadero de ${fila.materia_prima?.nombre ?? indice + 1}`} type="number" min="0" step="any" required
                value={valores[fila.id] ?? ""} disabled={bloqueado} onChange={e => setValores(actual => ({ ...actual, [fila.id]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key !== "Enter") return
                  e.preventDefault()
                  const inputs = e.currentTarget.closest("table")?.querySelectorAll<HTMLInputElement>("input")
                  const siguiente = inputs?.[indice + (e.shiftKey ? -1 : 1)]
                  siguiente?.focus(); siguiente?.select()
                }} /></td>
              <td className="fm-numero">{formato(total > 0 ? (Number(valores[fila.id]?.replace(",", ".")) || 0) / total * 100 : 0)}%</td>
            </tr>)}</tbody>
            <tfoot><tr><th colSpan={4}>Total</th><td className="fm-numero">{formato(total)}%</td><td className="fm-numero">{total > 0 ? "100%" : "0%"}</td></tr></tfoot>
          </table>
        </div>
        {microKg !== null && Object.values(destinos).includes("MICRO") && <p className="fm-aviso">Micro por parada {formato(microKg)} kg. Su detalle se guarda con la nueva versión de la fórmula.</p>}
        <fieldset className="fm-guardado" disabled={bloqueado}>
          <legend>Guardar una nueva versión</legend>
          <div className="fm-filtros"><label>Nombre de la nueva versión<input value={nombre} maxLength={120} required onChange={e => setNombre(e.target.value)} /></label>
            <label>Fecha de la nueva versión<input type="date" min={fechaFormulacionHoy()} max={activar ? fechaFormulacionHoy() : undefined} value={fecha} required onChange={e => setFecha(e.target.value)} /></label></div>
          <label className="fm-casilla"><input type="checkbox" checked={activar} onChange={e => setActivar(e.target.checked)} />Establecer como vigente al guardar</label>
          <button type="submit" className="fm-principal">{guardando ? "Guardando…" : guardado ? "Versión guardada" : "Guardar nueva versión"}</button>
        </fieldset>
      </form>}
  </section>
}
