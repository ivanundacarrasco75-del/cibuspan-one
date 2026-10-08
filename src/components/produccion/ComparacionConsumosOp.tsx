import { useEffect, useRef, useState } from "react"
import { obtenerReferenciasConsumoOp } from "../../repositories/comparacionConsumosOpRepository"
import { compararConsumosOp, type ComparacionOrdenOp, type ReferenciaRecetaOp } from "../../utils/comparacionConsumosOp"
import type { OrdenProduccionImportar } from "../../utils/ordenesProduccionExcel"

const numero = (valor: number | null) => valor === null ? "—" : valor.toLocaleString("es-EC", { maximumFractionDigits: 5 })

export default function ComparacionConsumosOp({ ordenes }: { ordenes: OrdenProduccionImportar[] }) {
  const [comparaciones, setComparaciones] = useState<ComparacionOrdenOp[]>([])
  const [referencias, setReferencias] = useState<ReferenciaRecetaOp[]>([])
  const [consultado, setConsultado] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const consulta = useRef(0)
  useEffect(() => {
    consulta.current += 1
    setComparaciones([]); setReferencias([]); setConsultado(""); setCargando(false); setError("")
    return () => { consulta.current += 1 }
  }, [ordenes])

  async function comparar() {
    const id = ++consulta.current
    setCargando(true); setError(""); setComparaciones([]); setReferencias([])
    try {
      const recetas = await obtenerReferenciasConsumoOp(ordenes)
      if (id !== consulta.current) return
      const mapa = new Map(recetas.map((receta) => [receta.codigoProducto, receta]))
      setReferencias(recetas)
      setComparaciones(ordenes.map((orden) => compararConsumosOp(orden, mapa.get(orden.producto_codigo))))
      setConsultado(new Date().toISOString())
    } catch (err) {
      if (id === consulta.current) setError(err instanceof Error ? err.message : "No se pudo comparar con las recetas.")
    } finally { if (id === consulta.current) setCargando(false) }
  }
  function descargar() {
    const blob = new Blob([JSON.stringify({ consultado_en: consultado, referencia: "Recetas VIGENTES al consultar; no demuestra versión utilizada en cada OP", referencias, comparaciones }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob), enlace = document.createElement("a")
    enlace.href = url; enlace.download = "comparacion_consumos_OP.json"; enlace.click(); URL.revokeObjectURL(url)
  }
  const diferencias = comparaciones.flatMap((orden) => orden.lineas).filter((linea) => linea.estado === "DIFERENCIA").length
  const pendientes = comparaciones.flatMap((orden) => orden.lineas).filter((linea) => ["SIN REFERENCIA", "NO REPORTADO"].includes(linea.estado)).length
  return <section className="op-comparacion">
    <style>{`.op-comparacion{margin-top:15px;padding:12px;border:1px solid #dfd5ce;border-radius:8px;background:white}.op-comparacion h4{margin:0 0 7px}.op-comparacion p,.op-comparacion summary{font-size:12px;line-height:1.5}.op-comparacion button{padding:9px 12px;margin:4px 8px 6px 0;cursor:pointer;border:1px solid #8f1d24;border-radius:7px;background:white;color:#8f1d24}.op-comparacion button:disabled{opacity:.5}.op-comparacion details{border-top:1px solid #eee;padding:9px 0}.op-comparacion summary{cursor:pointer;font-weight:700}.op-comparacion .tabla-consumos{overflow-x:auto}.op-comparacion table{border-collapse:collapse;width:100%;font-size:11px;min-width:700px}.op-comparacion th,.op-comparacion td{padding:7px;text-align:right;border-bottom:1px solid #eee}.op-comparacion th:first-child,.op-comparacion td:first-child{text-align:left}.op-comparacion .dif{color:#a62129;background:#fff4eb}.op-comparacion .pendiente{color:#845e19}.op-comparacion small{display:block;margin:4px 0;color:#6c605c}`}</style>
    <h4>Consumo reportado frente a receta</h4>
    <p>Los consumos reportados se conservan. La comparación usa recetas vigentes hoy, que pueden estar desactualizadas o ser distintas de las utilizadas en esas OP. Las cantidades teóricas se escalan a las unidades inferidas de fundas o a los kilos de micro. Esto no modifica recetas ni existencias.</p>
    <button type="button" disabled={cargando || !ordenes.some((orden) => orden.detalles.length)} onClick={() => void comparar()}>{cargando ? "Consultando recetas…" : "Comparar consumos con recetas"}</button>
    {comparaciones.length > 0 && <button type="button" onClick={descargar}>Descargar comparación</button>}
    {error && <p className="pro-import-error">{error}</p>}
    {comparaciones.length > 0 && <>
      <p>{diferencias} diferencias; {pendientes} componentes pendientes de referencia o no reportados. Tolerancia: 1% o 0,002 kg. Las unidades se toman del catálogo. Un componente ausente del reporte no se considera consumo cero comprobado.</p>
      {comparaciones.map((orden) => <details key={`${orden.orden}|${orden.producto}`}>
        <summary>OP {orden.orden} · {orden.fecha} · {orden.producto} · {orden.lineas.filter((linea) => linea.estado === "DIFERENCIA").length} diferencias</summary>
        <small>Referencia: {orden.version}</small>
        <small>Registro contable: {orden.fecha_registro || "—"} · Finalización del documento: {orden.fecha_fin_original || "—"}</small>
        {orden.observaciones && <p className="pendiente">{orden.observaciones}</p>}
        {orden.advertencias.map((aviso, i) => <p className="pendiente" key={i}>{aviso}</p>)}
        <div className="tabla-consumos"><table><thead><tr><th>Componente</th><th>Unidad</th><th>Reportado</th><th>Receta</th><th>Diferencia</th><th>%</th><th>Resultado</th></tr></thead><tbody>
          {orden.lineas.map((linea) => <tr key={linea.codigo} className={linea.estado === "DIFERENCIA" ? "dif" : linea.estado === "COINCIDE" ? "" : "pendiente"}>
            <td>{linea.codigo} · {linea.nombre}</td><td>{linea.unidad}</td><td>{numero(linea.real)}</td><td>{numero(linea.teorico)}</td><td>{numero(linea.diferencia)}</td><td>{numero(linea.porcentaje)}</td><td>{linea.estado}</td>
          </tr>)}
        </tbody></table></div>
      </details>)}
    </>}
  </section>
}
