import { useEffect, useState } from "react"
import {
  guardarCompraSri, listarComprasSri, marcarRideLeido, obtenerCompraXml,
  type CompraGuardada,
} from "../repositories/comprasSriRepository"
import { leerFacturaSri } from "../utils/comprasSri"

const sri = "https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT"
const porPagina = 25
const formato = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monto = (valor: string | number) => formato.format(Number(valor))

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
  const [descargando, setDescargando] = useState("")
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

  async function descargar(clave: string, serie: string) {
    setDescargando(clave)
    try {
      const xml = await obtenerCompraXml(clave)
      const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }))
      const enlace = document.createElement("a")
      enlace.href = url
      enlace.download = `${serie}.xml`
      enlace.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setResultados([`${serie} · ${mensajeError(error)}`])
    } finally {
      setDescargando("")
    }
  }

  return (
    <section>
      <h1>Facturas de compra del SRI</h1>
      <p>Abre el SRI, consulta Comprobantes electrónicos recibidos y descarga el XML y el RIDE de las facturas que quieras registrar.</p>
      <p><a href={sri} target="_blank" rel="noopener noreferrer">Abrir SRI en Línea</a></p>
      <label>
        Importar XML y PDF del SRI{" "}
        <input type="file" accept=".xml,.pdf" multiple disabled={importando}
          onChange={(evento) => {
            const archivos = Array.from(evento.currentTarget.files ?? [])
            evento.currentTarget.value = ""
            if (archivos.length) void importar(archivos)
          }} />
      </label>
      {importando && <p role="status">Procesando documentos…</p>}
      {resultados.length > 0 && (
        <ul aria-label="Resultado de los archivos" aria-live="polite">
          {resultados.map((resultado, indice) => <li key={indice}>{resultado}</li>)}
        </ul>
      )}
      {errorTabla && <p role="alert">No se pudieron consultar las compras. {errorTabla}</p>}
      {cargando && <p role="status">Cargando compras…</p>}
      {!cargando && !errorTabla && !compras.length && <p>Todavía no hay facturas registradas.</p>}
      {!cargando && !errorTabla && compras.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>{["Fecha", "Factura", "Proveedor", "Subtotal", "IVA", "Total", "RIDE", "ADMYSIS"]
                .map((columna) => <th key={columna} scope="col">{columna}</th>)}</tr>
            </thead>
            <tbody>
              {compras.map(({ datos, ride_leido }) => (
                <tr key={datos.clave}>
                  <td>{datos.fecha}</td>
                  <td>
                    <details>
                      <summary>{datos.serie}</summary>
                      <div>Autorización: {datos.autorizacion}</div>
                      <div>{datos.estadoXml}</div>
                      <ul>
                        {datos.items.map((item, indice) => (
                          <li key={indice}>
                            {item.codigo} · {item.descripcion} · {item.cantidad} × {item.precio}
                            {" · Subtotal "}{monto(item.subtotal)}
                          </li>
                        ))}
                      </ul>
                      {datos.pagos.map((pago, indice) => (
                        <div key={indice}>Pago {pago.forma} · {pago.total} · {pago.plazo} {pago.unidad}</div>
                      ))}
                    </details>
                  </td>
                  <td>{datos.proveedor}<br /><small>{datos.ruc}</small></td>
                  <td>{monto(datos.subtotal)}</td>
                  <td>{monto(datos.impuestos.filter((impuesto) => impuesto.codigo === "2")
                    .reduce((total, impuesto) => total + Number(impuesto.valor), 0))}</td>
                  <td>{monto(datos.total)}</td>
                  <td>{ride_leido ? "Vinculado" : "Pendiente"}</td>
                  <td>
                    <button type="button" disabled={Boolean(descargando)}
                      onClick={() => void descargar(datos.clave, datos.serie)}>
                      {descargando === datos.clave ? "Descargando…" : "Descargar XML"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(pagina > 0 || haySiguiente) && !errorTabla && (
        <nav aria-label="Páginas de facturas">
          <button type="button" disabled={pagina === 0 || cargando} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          {" "}Página {pagina + 1}{" "}
          <button type="button" disabled={!haySiguiente || cargando} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </nav>
      )}
    </section>
  )
}
