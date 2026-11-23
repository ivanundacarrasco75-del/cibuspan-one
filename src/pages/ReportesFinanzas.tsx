import { useEffect, useRef, useState, type FormEvent } from "react"
import { consultarReporteFinanzas, type DatosReporteFinanzas, type TipoReporteFinanzas } from "../repositories/reportesFinanzasRepository"
import { descargarReporteExcel, imprimirReporteFinanzas, rangoMesReporte, reportesFinanzas, valorReporte } from "../utils/reportesFinanzas"
import "./comprasSriTabla.css"
import "./finanzasPagosCompras.css"
import "./reportesFinanzas.css"

const mesActual = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format().slice(0, 7)
const dinero = (valor: number | undefined) => Number(valor ?? 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const textoError = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo consultar el reporte."
type Consulta = { tipo: TipoReporteFinanzas; desde: string; hasta: string; datos: DatosReporteFinanzas }
const porPagina = 100
export default function ReportesFinanzas() {
  const [tipo, setTipo] = useState<TipoReporteFinanzas>("PAGOS")
  const [mes, setMes] = useState(mesActual)
  const [desde, setDesde] = useState(() => rangoMesReporte(mesActual()).desde)
  const [hasta, setHasta] = useState(() => rangoMesReporte(mesActual()).hasta)
  const [consulta, setConsulta] = useState<Consulta | null>(null)
  const [pagina, setPagina] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState("")
  const version = useRef(0), bloqueo = useRef(false)
  useEffect(() => () => { version.current++ }, [])
  function cambiar() { setConsulta(null); setPagina(0); setError("") }
  async function generar(evento: FormEvent) {
    evento.preventDefault(); if (bloqueo.current) return
    if (!desde || !hasta || desde > hasta) { setError("La fecha inicial debe ser anterior o igual a la final."); return }
    const actual = ++version.current
    bloqueo.current = true; setOcupado(true); setConsulta(null); setError("")
    try {
      const datos = await consultarReporteFinanzas(tipo, desde, hasta)
      if (version.current === actual) { setConsulta({ tipo, desde, hasta, datos }); setPagina(0) }
    } catch (fallo) { if (version.current === actual) setError(textoError(fallo)) }
    finally { bloqueo.current = false; if (version.current === actual) setOcupado(false) }
  }
  const resumen = consulta ? consulta.tipo === "PAGOS"
    ? `${consulta.datos.movimientos ?? 0} pagos · ${consulta.datos.documentos ?? 0} documentos · Total pagado USD ${dinero(consulta.datos.total)}`
    : `${consulta.datos.recepciones ?? 0} recepciones · ${consulta.datos.lineas ?? 0} líneas de materia prima` : ""
  const resumenExportacion = resumen + (consulta?.tipo === "PAGOS" && Number(consulta.datos.sin_fecha) > 0
    ? ` · Aviso: ${consulta.datos.sin_fecha} pagos de origen sin fecha válida excluidos; no se pueden asignar al rango.` : "")
  async function descargar() {
    if (!consulta || exportando) return
    setExportando(true); setError("")
    try { await descargarReporteExcel(consulta.tipo, consulta.desde, consulta.hasta, consulta.datos.filas, resumenExportacion) }
    catch (fallo) { setError(textoError(fallo)) } finally { setExportando(false) }
  }
  function imprimir() {
    if (!consulta) return
    try { imprimirReporteFinanzas(consulta.tipo, consulta.desde, consulta.hasta, consulta.datos.filas, resumenExportacion) }
    catch (fallo) { setError(textoError(fallo)) }
  }
  const definicion = consulta ? reportesFinanzas[consulta.tipo] : reportesFinanzas[tipo]
  return <main className="compras-sri-pagina fin-pagos fin-reportes">
    <h1>Reportes de Pagos y Finanzas</h1>
    <form onSubmit={generar}>
      <fieldset disabled={ocupado || exportando} className="fin-pagos-filtros fin-reportes-filtros">
        <label>Reporte <select aria-label="Reporte" value={tipo} onChange={e => { setTipo(e.target.value as TipoReporteFinanzas); cambiar() }}>
          <option value="PAGOS">Pagos realizados · Mensual / rango de fechas</option><option value="MP">Compras de MP · Recepciones físicas</option>
        </select></label>
        <label>Mes completo <input aria-label="Mes completo" type="month" value={mes} onChange={e => {
          const nuevo = e.target.value; setMes(nuevo)
          if (nuevo) { const rango = rangoMesReporte(nuevo); setDesde(rango.desde); setHasta(rango.hasta) }
          cambiar()
        }} /></label>
        <label>Desde <input aria-label="Desde" type="date" required value={desde} max={hasta || undefined} onChange={e => { setDesde(e.target.value); setMes(""); cambiar() }} /></label>
        <label>Hasta <input aria-label="Hasta" type="date" required value={hasta} min={desde || undefined} onChange={e => { setHasta(e.target.value); setMes(""); cambiar() }} /></label>
        <button type="submit" disabled={ocupado || exportando}>{ocupado ? "Consultando…" : "Generar vista previa"}</button>
      </fieldset>
    </form>
    <p>{definicion.descripcion}</p>
    {error && <p role="alert" className="compras-sri-error">{error}</p>}
    {ocupado && <p role="status">Preparando el reporte completo del rango seleccionado…</p>}
    {!consulta && !ocupado && <p>Escoge el reporte y las fechas; después genera la vista previa.</p>}
    {consulta && <section aria-label="Vista previa del reporte">
      <h2>{definicion.titulo}</h2><p>{consulta.desde} al {consulta.hasta}</p>
      <p role="status" className="fin-reportes-resumen">{resumen}</p>
      {consulta.tipo === "PAGOS" && Number(consulta.datos.sin_fecha) > 0 && <p role="note">Hay {consulta.datos.sin_fecha} pagos sin fecha válida en el origen. No se incluyen porque no se pueden asignar a este rango.</p>}
      {consulta.tipo === "MP" && consulta.datos.cantidades?.map(item => <span className="fin-reportes-unidad" key={item.unidad}>{item.unidad || "Sin unidad"}: {Number(item.cantidad).toLocaleString("es-EC", { maximumFractionDigits: 6 })}</span>)}
      <div className="fin-pagos-filtros">
        <button type="button" disabled={exportando || !consulta.datos.filas.length} onClick={() => void descargar()}>{exportando ? "Preparando Excel…" : "Descargar Excel completo"}</button>
        <button type="button" disabled={exportando || !consulta.datos.filas.length} onClick={imprimir}>Imprimir / Guardar PDF</button>
      </div>
      <div className="compras-sri-contenedor"><table className="compras-sri-tabla fin-reportes-tabla" aria-label="Detalle del reporte">
        <thead><tr>{definicion.columnas.map(col => <th key={col.campo} scope="col">{col.titulo}</th>)}</tr></thead>
        <tbody>{consulta.datos.filas.slice(pagina * porPagina, (pagina + 1) * porPagina).map((fila, indice) => <tr key={indice}>
          {definicion.columnas.map(col => <td key={col.campo} className={col.formato ? "fin-reportes-numero" : undefined}>{valorReporte(fila, col)}</td>)}
        </tr>)}{!consulta.datos.filas.length && <tr><td colSpan={definicion.columnas.length}>No hay movimientos registrados en este rango.</td></tr>}</tbody>
      </table></div>
      {consulta.datos.filas.length > 0 && <div className="fin-pagos-filtros">
        <button type="button" disabled={pagina === 0} onClick={() => setPagina(valor => valor - 1)}>Anterior</button>
        <span>Mostrando {pagina * porPagina + 1}–{Math.min((pagina + 1) * porPagina, consulta.datos.filas.length)} de {consulta.datos.filas.length}. La descarga y la impresión incluyen todas las filas.</span>
        <button type="button" disabled={(pagina + 1) * porPagina >= consulta.datos.filas.length} onClick={() => setPagina(valor => valor + 1)}>Siguiente</button>
      </div>}
    </section>}
  </main>
}
