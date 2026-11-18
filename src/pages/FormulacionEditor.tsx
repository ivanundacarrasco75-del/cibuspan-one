import { useEffect, useRef, useState } from "react"
import {
  obtenerFormulasFmDb, obtenerVersionesFormulaFmDb, obtenerComponentesFmDb,
  type FormulaFmDb, type FormulaVersionFmDb, type PreformulacionComponenteFmDb,
} from "../repositories/formulaRepository"
import { guardarNuevaFormulacion } from "../services/formulacionService"
import { etiquetaVersionFormula, fechaFormulacionHoy, versionPreferidaFormula } from "../utils/formulacionVersion"

export default function FormulacionEditor({ alGuardar }: { alGuardar: () => void }) {
  const [formulas, setFormulas] = useState<FormulaFmDb[]>([])
  const [formulaId, setFormulaId] = useState("")
  const [versiones, setVersiones] = useState<FormulaVersionFmDb[]>([])
  const [versionId, setVersionId] = useState("")
  const [filas, setFilas] = useState<PreformulacionComponenteFmDb[]>([])
  const [valores, setValores] = useState<Record<string, string>>({})
  const [nombre, setNombre] = useState("")
  const [fecha, setFecha] = useState(fechaFormulacionHoy)
  const [activar, setActivar] = useState(true)
  const [borradorId, setBorradorId] = useState<string>()
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const bloqueo = useRef(false)
  const version = versiones.find(fila => fila.id === versionId)
  const total = filas.reduce((suma, fila) => suma + (Number(valores[fila.id]?.replace(",", ".")) || 0), 0)
  const formato = (valor: number) => valor.toLocaleString("es-EC", { maximumFractionDigits: 4 })

  useEffect(() => {
    let vigente = true
    obtenerFormulasFmDb().then(datos => { if (vigente) setFormulas(datos) })
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
    setFilas([]); setValores({}); setBorradorId(undefined); setGuardado(false)
    if (!versionId) return
    setCargando(true)
    obtenerComponentesFmDb(versionId).then(datos => {
      if (!vigente) return
      setFilas(datos); setValores(Object.fromEntries(datos.map(fila => [fila.id, String(fila.porcentaje_panadero)])))
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
        nombre, fecha, activar, borradorId }, setBorradorId)
      setGuardado(true)
      setMensaje(`Versión «${nombre.trim()}» guardada${activar ? " y establecida como vigente" : " como borrador"}.`)
      alGuardar()
      // El guardado y la recarga se informan por separado para evitar guardar dos veces.
      try {
        const datos = await obtenerVersionesFormulaFmDb(formulaId)
        setVersiones(datos); setVersionId(id); setBorradorId(undefined)
        setNombre(`V${Math.max(0, ...datos.map(fila => fila.numero_version)) + 1}`)
      } catch {
        setError("La versión quedó guardada. Vuelve a abrir Formulación para actualizar el listado.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la versión.")
    } finally {
      bloqueo.current = false; setGuardando(false)
    }
  }

  return <section className="fm-editor">
    <header><h1>Formulación</h1><p>Selecciona el SKU y su versión. Edita el porcentaje panadero en las celdas resaltadas.</p></header>
    {error && <p className="fm-error" role="alert">{error}</p>}
    {mensaje && <p className="fm-exito" role="status">{mensaje}</p>}
    {borradorId && !guardado && !guardando && <p className="fm-aviso">La copia está en borrador. Puedes reintentar el guardado para completar esta misma versión.</p>}
    <div className="fm-filtros">
      <label>SKU<select value={formulaId} disabled={cargando || guardando || !!borradorId} onChange={e => setFormulaId(e.target.value)}>
        <option value="">Seleccionar SKU</option>
        {formulas.map(fila => <option key={fila.id} value={fila.id}>{fila.codigo} · {fila.nombre}</option>)}
      </select></label>
      <label>Versión<select value={versionId} disabled={cargando || guardando || !!borradorId} onChange={e => { setVersionId(e.target.value); setMensaje(""); setError("") }}>
        <option value="">{formulaId ? "Seleccionar versión" : "Selecciona primero un SKU"}</option>
        {versiones.map(fila => <option key={fila.id} value={fila.id}>{etiquetaVersionFormula(fila)}</option>)}
      </select></label>
    </div>
    {cargando ? <p role="status">Cargando fórmula…</p> : !filas.length ? <p className="fm-aviso">{versionId ? "Esta versión no tiene ingredientes registrados." : "Selecciona un SKU y una versión para ver la fórmula."}</p> :
      <form onSubmit={guardar}>
        <div className="fm-hoja" tabIndex={0} aria-label="Tabla de formulación, desplazamiento horizontal">
          <table><thead><tr><th>N.º</th><th>Código</th><th>Ingrediente</th><th>Destino</th><th>% panadero</th><th>% real</th></tr></thead>
            <tbody>{filas.map((fila, indice) => <tr key={fila.id}>
              <th scope="row">{indice + 1}</th><td>{fila.materia_prima?.codigo ?? "—"}</td>
              <td>{fila.materia_prima?.nombre ?? "Ingrediente"}{fila.es_harina_base && <small>Harina base</small>}</td>
              <td>{fila.destino_tipo === "MICRO" ? fila.micro?.nombre ?? "Micro" : "Directo"}</td>
              <td className="fm-editable"><input aria-label={`Porcentaje panadero de ${fila.materia_prima?.nombre ?? indice + 1}`} type="number" min="0" step="any" required
                value={valores[fila.id] ?? ""} disabled={guardando || guardado} onChange={e => setValores(actual => ({ ...actual, [fila.id]: e.target.value }))}
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
        <fieldset className="fm-guardado" disabled={guardando || guardado}>
          <legend>Guardar una nueva versión</legend>
          <div className="fm-filtros"><label>Nombre de la nueva versión<input value={nombre} maxLength={120} required onChange={e => setNombre(e.target.value)} /></label>
            <label>Fecha de modificación<input type="date" value={fecha} required onChange={e => setFecha(e.target.value)} /></label></div>
          <label className="fm-casilla"><input type="checkbox" checked={activar} onChange={e => setActivar(e.target.checked)} />Establecer como vigente al guardar</label>
          <button type="submit" className="fm-principal">{guardando ? "Guardando…" : guardado ? "Versión guardada" : "Guardar nueva versión"}</button>
        </fieldset>
      </form>}
  </section>
}
