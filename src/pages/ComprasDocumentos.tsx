import { Fragment, useEffect, useRef, useState, type FormEvent } from "react"
import { guardarDocumentoCompra, listarDocumentosCompra, type DocumentoCompra } from "../repositories/comprasDocumentosRepository"
import "./comprasSriTabla.css"

const porPagina = 20
const moneda = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" })
const fecha = new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeZone: "UTC" })
const periodo = new Intl.DateTimeFormat("es-EC", { month: "short", year: "numeric", timeZone: "UTC" })

const columnas = [
  ["fecha", "Fecha emisión"], ["serie", "N.º documento"], ["proveedor", "Proveedor"],
  ["descripcion", "Descripción"], ["subtotal", "Subtotal"], ["iva", "IVA"], ["retencion", "Retención"],
  ["total", "Total"], ["estado", "Estado"], ["detalle", "Detalle"],
]
const hoy = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format()
const importe = (valor: number | null) => valor === null ? "—" : moneda.format(valor)

export default function ComprasDocumentos({ tipo }: { tipo: "notas" | "noDeducibles" }) {
  const [pagina, setPagina] = useState(0)
  const [reintento, setReintento] = useState(0)
  const [documentos, setDocumentos] = useState<DocumentoCompra[] | null>(null)
  const [error, setError] = useState(false)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [formulario, setFormulario] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState("")
  const [mensaje, setMensaje] = useState("")
  const solicitud = useRef("")
  const ocupado = useRef(false)
  const titulo = tipo === "notas" ? "Notas de venta" : "Gastos no deducibles"
  const tipoDocumento = tipo === "notas" ? "NOTA_VENTA" : "NO_DEDUCIBLE"

  useEffect(() => {
    let vigente = true
    listarDocumentosCompra(tipoDocumento, pagina * porPagina, porPagina + 1)
      .then(filas => { if (vigente) setDocumentos(filas) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [tipoDocumento, pagina, reintento])

  function cambiarPagina(destino: number) {
    setDocumentos(null)
    setDetalle(null)
    setPagina(destino)
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (ocupado.current) return
    const datos = new FormData(evento.currentTarget)
    const texto = (campo: string) => String(datos.get(campo) ?? "").trim()
    const numero = (campo: string) => {
      const valor = texto(campo)
      return valor === "" ? null : Number(valor.replace(",", "."))
    }
    const proveedor = texto("proveedor")
    const concepto = texto("concepto")
    const subtotal = numero("subtotal")
    if (!proveedor || !concepto || subtotal === null || !Number.isFinite(subtotal) || subtotal <= 0 || (tipo === "notas" && !texto("numero"))) {
      setErrorGuardar("Completa el documento, el proveedor, la descripción y un subtotal mayor que cero.")
      return
    }
    ocupado.current = true
    setGuardando(true)
    setErrorGuardar("")
    try {
      await guardarDocumentoCompra({
        id: solicitud.current, tipo: tipoDocumento, fecha_documento: texto("fecha"),
        numero_documento: texto("numero") || null, proveedor, concepto, subtotal,
        iva: numero("iva"), retencion: numero("retencion"), observaciones: texto("observaciones") || null,
      })
      setFormulario(false)
      setMensaje("Documento guardado.")
      setError(false)
      cambiarPagina(0)
      setReintento(actual => actual + 1)
    } catch (error) {
      setErrorGuardar(error instanceof Error ? error.message : "No se pudo confirmar el registro. Puedes reintentar.")
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }

  return (
    <section className="compras-sri-pagina" aria-labelledby="compras-documentos-titulo">
      <header className="compras-sri-cabecera">
        <h1 id="compras-documentos-titulo">{titulo}</h1>
        <button type="button" className="compras-sri-alta" disabled={formulario || error || !documentos} onClick={() => {
          solicitud.current = crypto.randomUUID()
          setMensaje("")
          setErrorGuardar("")
          setFormulario(true)
        }}>{tipo === "notas" ? "Nueva nota de venta" : "Nuevo gasto no deducible"}</button>
      </header>
      {formulario && (
        <form className="compras-sri-formulario compras-sri-formulario-manual" onSubmit={guardar}>
          <fieldset disabled={guardando}>
          {tipo === "notas" && <p>Nota de venta: verifica el régimen RIMPE y su tratamiento. No se presume retención de renta ni de IVA a partir del nombre del proveedor.</p>}
            <label>Fecha de emisión <input name="fecha" type="date" defaultValue={hoy()} required /></label>
            <label>N.º documento <input name="numero" maxLength={80} required={tipo === "notas"} /></label>
            <label>Proveedor <input name="proveedor" maxLength={200} required /></label>
            <label>Descripción <input name="concepto" maxLength={500} required /></label>
            <label>Subtotal sin IVA <input name="subtotal" inputMode="decimal" pattern="[0-9]{1,9}([.,][0-9]{1,2})?" required /></label>
            <label>IVA <input name="iva" inputMode="decimal" pattern="[0-9]{1,9}([.,][0-9]{1,2})?" /></label>
            <label>Retención <input name="retencion" inputMode="decimal" pattern="[0-9]{1,9}([.,][0-9]{1,2})?" /></label>
            <label>Observaciones <input name="observaciones" maxLength={500} /></label>
            <button type="submit">{guardando ? "Guardando…" : "Guardar documento"}</button>
            <button type="button" onClick={() => setFormulario(false)}>Cancelar</button>
          </fieldset>
          {errorGuardar && <p role="alert">{errorGuardar}</p>}
        </form>
      )}
      {mensaje && <p role="status">{mensaje}</p>}
      {error ? <div role="alert">
          <p>No se pudieron consultar los registros.</p>
          <button type="button" onClick={() => { setError(false); setReintento(actual => actual + 1) }}>Reintentar</button>
        </div> : !documentos ? <p role="status">Consultando registros…</p>
          : <div className="compras-sri-contenedor" tabIndex={0} role="region" aria-label={`Tabla desplazable de ${titulo.toLowerCase()}`}>
            <table className="compras-sri-tabla compras-sri-tabla-documentos" aria-label={titulo}>
              <colgroup>{columnas.map(([campo]) => <col key={campo} className={`compras-sri-col-${campo}`} />)}</colgroup>
              <thead><tr>{columnas.map(([campo, etiqueta]) => <th key={campo} scope="col">{etiqueta}</th>)}</tr></thead>
              <tbody>
                {documentos.length === 0 && <tr><td colSpan={columnas.length}>
                  {tipo === "noDeducibles" && pagina === 0
                    ? "Todavía no hay gastos no deducibles ingresados manualmente."
                    : "No hay documentos en esta página."}
                </td></tr>}
                {documentos.slice(0, porPagina).map(documento => (
                  <Fragment key={documento.id}>
                    <tr className={documento.origen === "EXCEL" && documento.saldo_excel === 0 ? "compras-sri-pagada" : undefined}>
                      <td>{documento.fecha_documento ? fecha.format(new Date(documento.fecha_documento)) : "—"}</td>
                      <td title={documento.numero_documento ?? undefined}>{documento.numero_documento || "—"}</td>
                      <td title={documento.proveedor ?? undefined}>{documento.proveedor || "—"}</td>
                      <td title={documento.concepto ?? undefined}>{documento.concepto || "—"}</td>
                      <td className="compras-sri-monto">{importe(documento.subtotal)}</td>
                      <td className="compras-sri-monto">{importe(documento.iva)}</td>
                      <td className="compras-sri-monto">{importe(documento.retencion)}</td>
                      <td className="compras-sri-monto">{importe(documento.total)}</td>
                      <td className="compras-sri-estado">{documento.origen !== "EXCEL" ? "Registrado"
                        : documento.saldo_excel === null ? "Por revisar"
                        : documento.saldo_excel === 0 ? "Pagada"
                        : Number(documento.pagado_excel) > 0 ? "Abonada" : "Pendiente"}</td>
                      <td><button type="button" aria-expanded={detalle === documento.id} onClick={() => setDetalle(detalle === documento.id ? null : documento.id)}>Detalle</button></td>
                    </tr>
                    {detalle === documento.id && <tr><td colSpan={columnas.length} className="compras-sri-detalle">
                      <div>{documento.origen === "EXCEL" ? "Importado desde Excel" : documento.origen === "MANUAL_COMPRAS" ? "Registro manual de Compras" : "Clasificación de gastos"} · {documento.periodo ? periodo.format(new Date(documento.periodo)) : "Fecha por completar"}</div>
                      {documento.origen === "EXCEL" && <div>Pagado: {importe(documento.pagado_excel ?? null)} · Pendiente: {importe(documento.saldo_excel ?? null)}</div>}
                      {documento.cuenta_codigo && <div>Cuenta {documento.cuenta_codigo}</div>}
                      <div>{documento.numero_documento} {documento.proveedor}</div>
                      <div>{documento.concepto}</div>
                      {documento.observaciones && <div>{documento.observaciones}</div>}
                    </td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>}
        {!error && documentos && (pagina > 0 || documentos.length > porPagina) && (
          <nav className="compras-sri-paginas" aria-label="Páginas de documentos">
            {pagina > 0 && <button type="button" onClick={() => cambiarPagina(pagina - 1)}>Anterior</button>}
            <span>Página {pagina + 1}</span>
            {documentos.length > porPagina && <button type="button" onClick={() => cambiarPagina(pagina + 1)}>Siguiente</button>}
          </nav>
        )}
    </section>
  )
}
