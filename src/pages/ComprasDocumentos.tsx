import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import "./comprasResumen.css"

const porPagina = 20
const moneda = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" })
const fecha = new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeZone: "UTC" })
const periodo = new Intl.DateTimeFormat("es-EC", { month: "short", year: "numeric", timeZone: "UTC" })

type Documento = {
  id: string
  periodo: string
  fecha_documento: string | null
  numero_documento: string | null
  proveedor: string | null
  concepto: string | null
  valor: number | null
}

export default function ComprasDocumentos({ tipo }: { tipo: "notas" | "noDeducibles" }) {
  const [pagina, setPagina] = useState(0)
  const [reintento, setReintento] = useState(0)
  const [documentos, setDocumentos] = useState<Documento[] | null>(null)
  const [error, setError] = useState(false)
  const titulo = tipo === "notas" ? "Notas de venta" : "Gastos no deducibles"

  useEffect(() => {
    let vigente = true
    async function cargar() {
      const consulta = supabase.from("fin_vw_resultado_clasificacion_detalle")
        .select("id,periodo,fecha_documento,numero_documento,proveedor,concepto,valor")
      const filtro = tipo === "notas"
        ? consulta.eq("tipo_documento", "NOTA_VENTA")
        : consulta.eq("cuenta_codigo", "6.2.01.2.14.31")
      try {
        const { data, error: errorConsulta } = await filtro
          .order("periodo", { ascending: false })
          .order("fecha_documento", { ascending: false, nullsFirst: false })
          .order("id")
          .range(pagina * porPagina, (pagina + 1) * porPagina)
        if (errorConsulta) throw errorConsulta
        if (vigente) setDocumentos(data ?? [])
      } catch {
        if (vigente) setError(true)
      }
    }
    void cargar()
    return () => { vigente = false }
  }, [tipo, pagina, reintento])

  function cambiarPagina(destino: number) {
    setDocumentos(null)
    setPagina(destino)
  }

  return (
    <div className="compras-resumen">
      <section className="compras-panel" aria-labelledby="compras-documentos-titulo">
        <div className="compras-seccion-titulo">
          <div>
            <h1 id="compras-documentos-titulo">{titulo}</h1>
            <p>Registros de Clasificación de gastos.</p>
          </div>
        </div>
        {error ? <div className="compras-mensaje" role="alert">
          <p>No se pudieron consultar los registros.</p>
          <button type="button" className="compras-boton" onClick={() => { setError(false); setReintento(actual => actual + 1) }}>Reintentar</button>
        </div> : !documentos ? <p className="compras-mensaje" role="status">Consultando registros…</p>
          : documentos.length === 0 ? <p className="compras-mensaje">No hay registros en esta página.</p>
          : <ul className="compras-lista">
            {documentos.slice(0, porPagina).map(documento => (
              <li key={documento.id} className="compras-aviso">
                <div className="compras-aviso-titulo">
                  <div>
                    <h3>{documento.proveedor || documento.concepto || "Sin proveedor registrado"}</h3>
                    {documento.proveedor && documento.concepto && <span>{documento.concepto}</span>}
                  </div>
                  <strong className="compras-estado fecha">{documento.valor === null ? "Sin importe" : moneda.format(documento.valor)}</strong>
                </div>
                <dl className="compras-medidas">
                  <div><dt>Documento</dt><dd>{documento.numero_documento || "Sin número"}</dd></div>
                  <div><dt>Fecha</dt><dd>{documento.fecha_documento ? fecha.format(new Date(documento.fecha_documento)) : "Sin fecha"}</dd></div>
                  <div><dt>Período</dt><dd>{periodo.format(new Date(documento.periodo))}</dd></div>
                </dl>
              </li>
            ))}
          </ul>}
        {!error && documentos && (pagina > 0 || documentos.length > porPagina) && (
          <nav className="compras-paginacion" aria-label="Páginas de documentos">
            {pagina > 0 && <button type="button" className="compras-boton" onClick={() => cambiarPagina(pagina - 1)}>Anterior</button>}
            <span>Página {pagina + 1}</span>
            {documentos.length > porPagina && <button type="button" className="compras-boton" onClick={() => cambiarPagina(pagina + 1)}>Siguiente</button>}
          </nav>
        )}
      </section>
    </div>
  )
}
