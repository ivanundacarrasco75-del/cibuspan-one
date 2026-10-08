import { useEffect, useMemo, useRef, useState } from "react"

import {
  importarLoteOrdenesProduccionDb,
  obtenerCodigosProductosProduccionDb,
  obtenerImportacionesOrdenesProduccionDb,
  type ImportacionOrdenesProduccionDb,
} from "../../repositories/produccionRepository"
import {
  huellaArchivo,
  leerArchivoOrdenesProduccion,
  type ResultadoOrdenesProduccionExcel,
} from "../../utils/ordenesProduccionExcel"
import { leerPdfOrdenesProduccion } from "../../utils/ordenesProduccionPdf"
import ComparacionConsumosOp from "./ComparacionConsumosOp"
import { ajustarFechasOrdenesHistoricas, claveOrdenHistorica } from "../../utils/fechasOrdenesHistoricas"

type Props = {
  alCompletar: () => Promise<void> | void
}

function numero(valor: number, decimales = 0) {
  return Number(valor || 0).toLocaleString("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

function moneda(valor: number) {
  return Number(valor || 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fecha(fechaIso: string | null) {
  if (!fechaIso) return "—"
  const [anio, mes, dia] = fechaIso.split("-")
  return `${dia}/${mes}/${anio}`
}

export default function ImportacionOrdenesHistoricas({ alCompletar }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [resultado, setResultado] = useState<ResultadoOrdenesProduccionExcel | null>(null)
  const [fechasProduccion, setFechasProduccion] = useState<Record<string, string>>({})
  const [hash, setHash] = useState("")
  const [codigosRegistrados, setCodigosRegistrados] = useState<string[]>([])
  const [importaciones, setImportaciones] = useState<ImportacionOrdenesProduccionDb[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!abierto) return
    void cargarReferencias()
  }, [abierto])

  async function cargarReferencias() {
    try {
      const [codigos, historial] = await Promise.all([
        obtenerCodigosProductosProduccionDb(),
        obtenerImportacionesOrdenesProduccionDb(),
      ])
      setCodigosRegistrados(codigos)
      setImportaciones(historial)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron consultar los datos existentes.")
    }
  }

  async function seleccionarArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const seleccionado = evento.target.files?.[0] ?? null
    setArchivo(seleccionado)
    setResultado(null)
    setFechasProduccion({})
    setHash("")
    setMensaje("")
    setError("")
    setProgreso(0)
    if (!seleccionado) return

    setLeyendo(true)
    try {
      const esPdf = seleccionado.name.toLowerCase().endsWith(".pdf")
      const [lectura, huella] = await Promise.all([
        esPdf
          ? leerPdfOrdenesProduccion(seleccionado)
          : leerArchivoOrdenesProduccion(seleccionado),
        huellaArchivo(seleccionado),
      ])
      setResultado(lectura)
      setHash(huella)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo validar el archivo.")
    } finally {
      setLeyendo(false)
    }
  }

  const noRegistrados = resultado
    ? resultado.skus.filter((codigo) => !codigosRegistrados.includes(codigo))
    : []

  const revisionFechas = useMemo(() => {
    if (!resultado) return { datos: null, error: "" }
    try { return { datos: ajustarFechasOrdenesHistoricas(resultado, fechasProduccion), error: "" } }
    catch (err) { return { datos: null, error: err instanceof Error ? err.message : "Revisa las fechas de producción." } }
  }, [resultado, fechasProduccion])

  function cambiarFecha(clave: string, valor: string) {
    setFechasProduccion((actual) => ({ ...actual, [clave]: valor }))
    setMensaje(""); setError("")
  }

  async function importar() {
    if (!archivo || !revisionFechas.datos || !hash || importando) return
    const ordenes = revisionFechas.datos.ordenes
    setImportando(true)
    setError("")
    setMensaje("")
    setProgreso(0)

    const tamanoLote = 100
    const lotes = Math.ceil(ordenes.length / tamanoLote)
    let nuevas = 0
    let actualizadas = 0

    try {
      for (let indice = 0; indice < lotes; indice += 1) {
        const desde = indice * tamanoLote
        const lote = ordenes.slice(desde, desde + tamanoLote)
        const respuesta = await importarLoteOrdenesProduccionDb({
          archivoNombre: archivo.name,
          archivoHash: hash,
          ordenes: lote,
          finalizar: indice === lotes - 1,
        })
        nuevas += Number(respuesta.ordenes_nuevas ?? 0)
        actualizadas += Number(respuesta.ordenes_actualizadas ?? 0)
        setProgreso(Math.round(((indice + 1) / lotes) * 100))
      }

      setMensaje(
        `Importación completada: ${numero(nuevas)} registros nuevos y ${numero(actualizadas)} actualizados.`,
      )
      await Promise.all([cargarReferencias(), Promise.resolve(alCompletar())])
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : "No se completó la importación."} Puedes volver a importar el mismo archivo; no se duplicarán las órdenes.`,
      )
    } finally {
      setImportando(false)
    }
  }

  return (
    <section className="pro-import">
      <style>{css}</style>
      <button type="button" className="pro-import-toggle" onClick={() => setAbierto((actual) => !actual)}>
        {abierto ? "Cerrar importación" : "Importar OP / revisar consumos"}
      </button>

      {abierto && (
        <div className="pro-import-body">
          <header>
            <div><span>IMPORTACIÓN DE PRODUCCIÓN REAL</span><h3>OP del sistema contable</h3><p>Carga OP liquidadas o confirmadas con egresos de materias primas, en PDF o Excel. Actualiza historial y dashboard sin sumar inventario disponible ni descontar materias primas.</p></div>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={leyendo || importando}>{leyendo ? "Validando…" : "Seleccionar PDF de OP"}</button>
            <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls" hidden onChange={seleccionarArchivo} />
          </header>

          {error && <div className="pro-import-error">{error}</div>}
          {mensaje && <div className="pro-import-success">{mensaje}</div>}

          {resultado && (
            <>
              <div className="pro-import-file"><strong>{archivo?.name}</strong><span>{fecha(revisionFechas.datos?.fechaDesde ?? resultado.fechaDesde)}–{fecha(revisionFechas.datos?.fechaHasta ?? resultado.fechaHasta)}</span></div>
              {resultado.advertencias?.map((aviso, indice) => <div className="pro-import-warning" key={indice}>{aviso}</div>)}
              <section className="pro-import-kpis">
                <article><span>Registros de OP</span><strong>{numero(resultado.ordenes.length)}</strong><small>{numero(resultado.filas)} filas reconocidas</small></article>
                <article><span>Producto terminado</span><strong>{numero(resultado.ordenesSku)}</strong><small>{numero(resultado.unidadesSku, 0)} Unid.</small></article>
                <article><span>Micros</span><strong>{numero(resultado.ordenesMicro)}</strong><small>{numero(resultado.kgMicro, 3)} kg de mezcla</small></article>
                <article><span>Costo histórico</span><strong>{moneda(resultado.costoTotal)}</strong><small>Según el reporte contable</small></article>
                <article className={resultado.ordenesRevisar > 0 ? "warning" : "ready"}><span>Requieren revisión</span><strong>{numero(resultado.ordenesRevisar)}</strong><small>Se importan señaladas, sin alterar inventario</small></article>
              </section>

              {noRegistrados.length > 0 && <div className="pro-import-warning">SKU no vinculados al catálogo actual: {noRegistrados.join(", ")}. Se conservarán en el historial con el código y nombre del archivo.</div>}
              <section className="pro-import-dates">
                <h4>Fecha real de producción</h4>
                <p>Las fechas contables son provisionales: una OP puede registrarse después de producirse. Corrige solo las fechas que conozcas. Se conservan las fechas del documento y todos sus consumos; no se restan días automáticamente.</p>
                <div className="pro-import-dates-scroll"><table><thead><tr><th>OP / producto</th><th>Registro contable</th><th>Finalización del documento</th><th>Fecha de producción</th><th>Referencia</th></tr></thead><tbody>
                  {resultado.ordenes.map((orden) => {
                    const clave = claveOrdenHistorica(orden), valor = fechasProduccion[clave] ?? orden.fecha_produccion
                    return <tr key={clave}>
                      <td>{orden.numero_orden}<small>{orden.producto_codigo} · {orden.producto_nombre}</small></td>
                      <td>{fecha(orden.fecha_registro)}</td><td>{fecha(orden.fecha_fin_original)}</td>
                      <td><input type="date" aria-label={`Fecha de producción OP ${orden.numero_orden} ${orden.producto_nombre}`} value={valor} disabled={importando} onChange={(e) => cambiarFecha(clave, e.target.value)} /></td>
                      <td>{valor !== orden.fecha_produccion ? "Corregida" : "Del documento (provisional)"}</td>
                    </tr>
                  })}
                </tbody></table></div>
                {revisionFechas.error && <div className="pro-import-error">{revisionFechas.error}</div>}
              </section>
              {revisionFechas.datos && <ComparacionConsumosOp ordenes={revisionFechas.datos.ordenes} />}

              <div className="pro-import-actions">
                <p>La clave para evitar duplicados es OP + SKU. Volver a cargar el archivo actualiza los registros existentes.</p>
                <button type="button" onClick={importar} disabled={importando || !revisionFechas.datos}>{importando ? `Importando ${progreso}%…` : `Importar ${numero(resultado.ordenes.length)} registros`}</button>
              </div>
              {importando && <div className="pro-progress"><span style={{ width: `${progreso}%` }} /></div>}
            </>
          )}

          {importaciones.length > 0 && (
            <div className="pro-import-history">
              <h4>Últimas importaciones</h4>
              {importaciones.slice(0, 5).map((item) => <article key={item.id}><div><strong>{item.archivo_nombre}</strong><small>{fecha(item.fecha_desde)}–{fecha(item.fecha_hasta)}</small></div><span>{numero(item.ordenes_archivo)} órdenes</span><b className={item.estado === "COMPLETADA" ? "ready" : "warning"}>{item.estado}</b></article>)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const css = `
  .pro-import-dates{margin-top:15px;padding:12px;border:1px solid #e9dfda;border-radius:8px;background:white}.pro-import-dates h4{margin:0 0 7px}.pro-import-dates p{font-size:12px;line-height:1.5}.pro-import-dates-scroll{overflow-x:auto}.pro-import-dates table{width:100%;min-width:760px;border-collapse:collapse;font-size:11px}.pro-import-dates th,.pro-import-dates td{text-align:left;padding:9px;border-bottom:1px solid #eee}.pro-import-dates small{display:block;margin-top:4px}.pro-import-dates input{min-height:36px;padding:6px;border:1px solid #c9bdb6;border-radius:5px}
  .pro-import{margin-bottom:18px}.pro-import-toggle{min-height:39px;padding:0 14px;border:1px solid #8f1d24;border-radius:8px;background:#fff;color:#8f1d24;font-weight:850;cursor:pointer}.pro-import-body{margin-top:12px;padding:18px;border:1px solid #eadfd9;border-radius:11px;background:#fffaf7}.pro-import-body>header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.pro-import-body header>div>span{color:#f7931e;font-size:9px;font-weight:950;letter-spacing:1.1px}.pro-import-body h3{margin:4px 0;color:#542d2e;font-size:19px}.pro-import-body header p{margin:0;color:#83756f;font-size:10px}.pro-import-body header>button,.pro-import-actions button{min-height:39px;padding:0 14px;border:0;border-radius:7px;background:#8f1d24;color:#fff;font-weight:850;cursor:pointer;white-space:nowrap}.pro-import-body button:disabled{opacity:.6;cursor:wait}.pro-import-error,.pro-import-success,.pro-import-warning{margin-top:13px;padding:11px 12px;border-radius:7px;font-size:10px;font-weight:750}.pro-import-error{background:#fdeaea;color:#ae2831}.pro-import-success{background:#e8f7ed;color:#087b35}.pro-import-warning{border-left:3px solid #d99a28;background:#fff6e2;color:#805b16}.pro-import-file{display:flex;justify-content:space-between;gap:14px;margin-top:14px;padding:10px 12px;border-radius:7px;background:#f3eeeb;color:#5d4e48;font-size:10px}.pro-import-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px}.pro-import-kpis article{padding:12px;border:1px solid #e9dfda;border-top:3px solid #8f1d24;border-radius:8px;background:#fff}.pro-import-kpis article.warning{border-top-color:#d99a28}.pro-import-kpis article.ready{border-top-color:#159447}.pro-import-kpis span,.pro-import-kpis small{display:block;color:#83746e;font-size:8px}.pro-import-kpis span{font-weight:900;text-transform:uppercase}.pro-import-kpis strong{display:block;margin:6px 0 3px;color:#3c2926;font-size:19px}.pro-import-actions{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:13px}.pro-import-actions p{margin:0;color:#83756f;font-size:9px}.pro-progress{height:7px;margin-top:10px;border-radius:99px;background:#eadfda;overflow:hidden}.pro-progress span{display:block;height:100%;background:linear-gradient(90deg,#8f1d24,#f7931e)}.pro-import-history{margin-top:17px;padding-top:12px;border-top:1px solid #eadfda}.pro-import-history h4{margin:0 0 7px;color:#583031}.pro-import-history article{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:8px;border-top:1px solid #eee5e0;font-size:9px}.pro-import-history article strong,.pro-import-history article small{display:block}.pro-import-history article small{margin-top:2px;color:#948681}.pro-import-history article>b{padding:4px 7px;border-radius:99px;font-size:8px}.pro-import-history .ready{background:#e5f6eb;color:#087b35}.pro-import-history .warning{background:#fff3d8;color:#916415}
  @media(max-width:1000px){.pro-import-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.pro-import-body>header,.pro-import-actions{flex-direction:column}.pro-import-body header>button,.pro-import-actions button{width:100%}.pro-import-kpis{grid-template-columns:1fr}.pro-import-file{flex-direction:column}.pro-import-history article{grid-template-columns:1fr}}
`
