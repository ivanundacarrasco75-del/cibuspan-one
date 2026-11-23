import { useEffect, useState, type FormEvent } from "react"
import { listarVinculosPendientes, refrescarVinculoSri, resolverVinculoSri, type VinculoExcelSri } from "../repositories/comprasSriRepository"
const importe = (valor: number | string | null) => valor === null ? "—" : Number(valor).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const errorTexto = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo actualizar la coincidencia."
function RevisionVinculo({ vinculo, puedeResolver, actualizar }: { vinculo: VinculoExcelSri; puedeResolver: boolean; actualizar: () => void }) {
  const [seleccion, setSeleccion] = useState("")
  const [motivo, setMotivo] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState("")
  async function guardar(evento: FormEvent) {
    evento.preventDefault(); if (ocupado || !seleccion) return
    setOcupado(true); setError("")
    try { await resolverVinculoSri(vinculo, seleccion === "DISTINTAS" ? null : seleccion, motivo); actualizar() }
    catch (fallo) { setError(errorTexto(fallo)) } finally { setOcupado(false) }
  }
  async function refrescar() {
    if (ocupado) return
    setOcupado(true); setError("")
    try { await refrescarVinculoSri(vinculo); actualizar() } catch (fallo) { setError(errorTexto(fallo)) } finally { setOcupado(false) }
  }
  return <section>
    <p><strong>{vinculo.datos_sri.numero} · {vinculo.datos_sri.proveedor}</strong> · RUC {vinculo.datos_sri.ruc} · Emisión {vinculo.datos_sri.fecha} · Total USD {importe(vinculo.datos_sri.total)}</p>
    <p>{vinculo.motivo} El XML pendiente requiere resolver la coincidencia antes de programar o pagar.</p>
    <form onSubmit={guardar}>
      <fieldset disabled={ocupado || !puedeResolver}>
        <div className="compras-sri-contenedor"><table className="compras-sri-tabla"><thead><tr><th>Elegir</th><th>Documento Excel</th><th>Proveedor</th><th>Emisión</th><th>Total</th><th>Neto</th><th>Pagado Excel</th></tr></thead>
          <tbody>{vinculo.candidatos.map(fila => <tr key={fila.id}>
            <td><input type="radio" name={`vinculo-${vinculo.clave}`} aria-label={`Vincular con ${fila.numero} de ${fila.proveedor}`} required checked={seleccion === fila.id} onChange={() => setSeleccion(fila.id)} /></td>
            <td>{fila.numero}</td><td>{fila.proveedor}</td><td>{fila.fecha || "—"}</td><td>{importe(fila.total)}</td><td>{importe(fila.neto)}</td><td>{importe(fila.pagado)}</td>
          </tr>)}</tbody></table></div>
        <label><input type="radio" name={`vinculo-${vinculo.clave}`} required checked={seleccion === "DISTINTAS"} onChange={() => setSeleccion("DISTINTAS")} /> Son facturas distintas: conservar ambos registros</label>
        <p><label>Motivo de la decisión <input required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label></p>
        <label><input type="checkbox" required /> Verifiqué proveedor, número completo, fecha, importes y pagos con los documentos.</label>
      </fieldset>
      <button disabled={ocupado || !puedeResolver || !seleccion}>{ocupado ? "Guardando…" : seleccion === "DISTINTAS" ? "Confirmar que son distintas" : "Confirmar vinculación"}</button>
      <button type="button" disabled={ocupado || !puedeResolver} onClick={() => void refrescar()}>Actualizar datos de la coincidencia</button>
      {!puedeResolver && <p>La resolución requiere permiso de Cuentas por pagar.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  </section>
}
export default function VinculosExcelSri({ revision, puedeResolver, alResolver }: { revision: number; puedeResolver: boolean; alResolver: () => void }) {
  const [filas, setFilas] = useState<VinculoExcelSri[]>([])
  const [error, setError] = useState("")
  useEffect(() => {
    let vigente = true; setError("")
    void listarVinculosPendientes().then(datos => { if (vigente) setFilas(datos) }).catch(fallo => { if (vigente) setError(errorTexto(fallo)) })
    return () => { vigente = false }
  }, [revision])
  return <>
    {error && <p role="alert">No se pudieron consultar las coincidencias con Excel. {error}</p>}
    {filas.length > 0 && <details open><summary>Coincidencias con Excel por revisar · {filas.length}{filas.length === 50 ? " (primeras 50)" : ""}</summary>
      {filas.map(fila => <RevisionVinculo key={fila.clave + fila.revision} vinculo={fila} puedeResolver={puedeResolver} actualizar={alResolver} />)}
    </details>}
  </>
}
