import { useEffect, useState } from "react"
import {
  guardarCompraSri, listarComprasSri, marcarRideLeido,
  type CompraGuardada,
} from "../repositories/comprasSriRepository"
import { leerFacturaSri } from "../utils/comprasSri"
import ComprasSriTabla from "./ComprasSriTabla"

const sri = "https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT"
const porPagina = 25

function mensajeError(error: unknown) {
  if (typeof error === "object" && error && "message" in error) return String(error.message)
  return "No se pudo completar la operación."
}

export default function ComprasSri() {
  const [compras, setCompras] = useState<CompraGuardada[]>([])
  const [pagina, setPagina] = useState(0)
  const [haySiguiente, setHaySiguiente] = useState(false)
  const [revision, setRevision] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [importando, setImportando] = useState(false)
  const [errorTabla, setErrorTabla] = useState("")
  const [resultados, setResultados] = useState<string[]>([])

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setErrorTabla("")
    listarComprasSri(pagina * porPagina, porPagina + 1)
      .then((filas) => {
        if (!vigente) return
        setCompras(filas.slice(0, porPagina))
        setHaySiguiente(filas.length > porPagina)
      })
      .catch((error) => {
        if (vigente) setErrorTabla(mensajeError(error))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => { vigente = false }
  }, [pagina, revision])

  async function importar(archivos: File[]) {
    setImportando(true)
    setResultados([])
    const salida: string[] = []
    try {
      const ordenados = [...archivos.filter((archivo) => /\.xml$/i.test(archivo.name)),
        ...archivos.filter((archivo) => !/\.xml$/i.test(archivo.name))]
      for (const archivo of ordenados) {
        try {
          if (/\.xml$/i.test(archivo.name)) {
            if (archivo.size > 2 * 1024 * 1024) throw new Error("El XML supera 2 MB.")
            const xml = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await archivo.arrayBuffer())
            const creada = await guardarCompraSri(leerFacturaSri(xml), xml)
            salida.push(`${archivo.name} · ${creada ? "Factura registrada" : "La factura ya estaba registrada"}`)
          } else if (/\.pdf$/i.test(archivo.name)) {
            if (archivo.size > 20 * 1024 * 1024) throw new Error("El PDF supera 20 MB.")
            const { leerClaveRide } = await import("../utils/comprasSriRide")
            const vinculado = await marcarRideLeido(await leerClaveRide(archivo))
            salida.push(`${archivo.name} · ${vinculado ? "Clave del RIDE vinculada" : "Carga también el XML de esta factura"}`)
          } else {
            salida.push(`${archivo.name} · Selecciona un XML o un PDF del SRI`)
          }
        } catch (error) {
          salida.push(`${archivo.name} · ${mensajeError(error)}`)
        }
      }
    } finally {
      setResultados(salida)
      setPagina(0)
      setRevision((actual) => actual + 1)
      setImportando(false)
    }
  }

  return (
    <section className="compras-sri-pagina">
      <header className="compras-sri-cabecera">
        <h1>Facturas de compra del SRI</h1>
        <div className="compras-sri-herramientas">
          <a href={sri} target="_blank" rel="noopener noreferrer">Abrir SRI en Línea</a>
          <label className="compras-sri-importar">
            <input type="file" accept=".xml,.pdf" multiple disabled={importando}
              aria-label="Importar XML y PDF del SRI"
              onChange={(evento) => {
                const archivos = Array.from(evento.currentTarget.files ?? [])
                evento.currentTarget.value = ""
                if (archivos.length) void importar(archivos)
              }} />
            <span aria-hidden="true">Importar XML o PDF</span>
          </label>
        </div>
      </header>
      {importando && <p role="status">Procesando documentos…</p>}
      {resultados.length > 0 && (
        <ul aria-label="Resultado de los archivos" aria-live="polite">
          {resultados.map((resultado, indice) => <li key={indice}>{resultado}</li>)}
        </ul>
      )}
      {errorTabla && <p role="alert">No se pudieron consultar las compras. {errorTabla}</p>}
      {cargando && <p role="status">Cargando compras…</p>}
      {!cargando && !errorTabla && !compras.length && <p>Todavía no hay facturas registradas.</p>}
      {!cargando && !errorTabla && compras.length > 0 && <ComprasSriTabla compras={compras} />}
      {(pagina > 0 || haySiguiente) && !errorTabla && (
        <nav className="compras-sri-paginas" aria-label="Páginas de facturas">
          <button type="button" disabled={pagina === 0 || cargando} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          {" "}Página {pagina + 1}{" "}
          <button type="button" disabled={!haySiguiente || cargando} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </nav>
      )}
    </section>
  )
}
