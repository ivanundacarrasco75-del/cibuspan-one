import { useEffect, useRef, useState } from "react"
import { listarVinculosPendientes, refrescarVinculoSri, resolverVinculoSri, type VinculoExcelSri } from "../repositories/comprasSriRepository"
const importe = (valor: number | string | null) => valor === null ? "—" : Number(valor).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const errorTexto = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo actualizar la coincidencia."
function RevisionVinculo({ vinculo, puedeResolver, actualizar }: { vinculo: VinculoExcelSri; puedeResolver: boolean; actualizar: () => void }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState("")
  const bloqueo = useRef(false)
  const unico = vinculo.candidatos.length === 1
  async function guardar(excel: string | null) {
    if (bloqueo.current || !puedeResolver) return
    bloqueo.current = true; setOcupado(true); setError("")
    const motivo = excel === null ? "El usuario confirmó que son facturas distintas; conservar los registros separados." : "El usuario confirmó que es la misma factura SRI y Excel; vincular los registros."
    try { await resolverVinculoSri(vinculo, excel, motivo); actualizar() }
    catch (fallo) { setError(errorTexto(fallo)) } finally { bloqueo.current = false; setOcupado(false) }
  }
  async function refrescar() {
    if (bloqueo.current || !puedeResolver) return
    bloqueo.current = true; setOcupado(true); setError("")
    try { await refrescarVinculoSri(vinculo); actualizar() } catch (fallo) { setError(errorTexto(fallo)) } finally { bloqueo.current = false; setOcupado(false) }
  }
  return <section className="compras-vinculo-revision" aria-label={`Comparar factura ${vinculo.datos_sri.numero}`}>
    <h3>{unico ? "¿Es la misma factura?" : "¿La factura del SRI es la misma que alguna de estas facturas de Excel?"}</h3>
    <div className="compras-sri-contenedor"><table className="compras-sri-tabla" aria-label={`Comparación ${vinculo.datos_sri.numero}`}><thead><tr><th>Origen</th><th>Factura</th><th>Proveedor</th><th>Emisión</th><th>Total USD</th><th>Neto Excel</th><th>Pagado Excel</th>{!unico && <th>Decisión</th>}</tr></thead>
          <tbody><tr><td><strong>SRI</strong></td><td>{vinculo.datos_sri.numero}</td><td>{vinculo.datos_sri.proveedor}<br /><small>RUC {vinculo.datos_sri.ruc}</small></td><td>{vinculo.datos_sri.fecha}</td><td>{importe(vinculo.datos_sri.total)}</td><td>—</td><td>—</td>{!unico && <td />}</tr>
          {vinculo.candidatos.map(fila => <tr key={fila.id}>
            <td><strong>Excel</strong></td><td>{fila.numero}</td><td>{fila.proveedor}</td><td>{fila.fecha || "—"}</td><td>{importe(fila.total)}</td><td>{importe(fila.neto)}</td><td>{importe(fila.pagado)}</td>
            {!unico && <td><button type="button" disabled={ocupado || !puedeResolver} aria-label={`Sí, vincular con ${fila.numero} de ${fila.proveedor}`} onClick={() => void guardar(fila.id)}>Sí, vincular esta factura</button></td>}
          </tr>)}</tbody></table></div>
      <div className="compras-vinculo-decisiones">
        {unico && <button type="button" disabled={ocupado || !puedeResolver} onClick={() => void guardar(vinculo.candidatos[0].id)}>Sí, es la misma: vincular</button>}
        <button type="button" disabled={ocupado || !puedeResolver} onClick={() => void guardar(null)}>{unico ? "No, son diferentes: guardar separadas" : "No, ninguna coincide: guardar separadas"}</button>
      </div>
      <small>Vincular conserva los pagos ya registrados. Guardar separadas mantiene las facturas como documentos diferentes.</small>
      {ocupado && <p role="status">Guardando decisión…</p>}
      {!puedeResolver && <p>La resolución requiere permiso de Cuentas por pagar.</p>}
      {error && <><p role="alert">{error}</p><button type="button" disabled={ocupado || !puedeResolver} onClick={() => void refrescar()}>Actualizar comparación</button></>}
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
