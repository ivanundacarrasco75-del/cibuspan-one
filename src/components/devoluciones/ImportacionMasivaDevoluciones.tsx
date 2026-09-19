import { useEffect, useMemo, useRef, useState } from "react"
import {
  importarDevolucionesMasivasDb,
  obtenerCatalogoProductosDevolucionDb,
  obtenerClientesDevolucionDb,
  obtenerReferenciasDevolucionesDb,
  type ClienteDevolucionDb,
  type DocumentoDevolucionMasivaDb,
  type ProductoDevolucionDb,
} from "../../repositories/devolucionRepository"
import {
  leerArchivosDevolucionesMasivas,
  type DocumentoDevolucionMasiva,
  type ResultadoLecturaDevolucionesMasivas,
} from "../../utils/devolucionesMasivas"

type Props = {
  onCompletado: () => Promise<void> | void
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function numero(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    maximumFractionDigits: 0,
  }).format(valor || 0)
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor || 0)
}

function fechaCorta(valor: string) {
  if (!valor) return "—"
  const [anio, mes, dia] = valor.split("-")
  return `${dia}/${mes}/${anio}`
}

function detectarCliente(
  documento: DocumentoDevolucionMasiva,
  clientes: ClienteDevolucionDb[],
) {
  return clientes.find((cliente) => {
    const nombre = normalizar(cliente.nombre)
    if (documento.fuente === "SUPERMAXI") {
      return nombre.includes("FAVORITA") || nombre.includes("SUPERMAXI")
    }
    return nombre.includes("SANTAMARIA") ||
      nombre.includes("SANTA MARIA") ||
      nombre.includes("MEGA")
  }) ?? null
}

export default function ImportacionMasivaDevoluciones({
  onCompletado,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [clientes, setClientes] = useState<ClienteDevolucionDb[]>([])
  const [productos, setProductos] = useState<ProductoDevolucionDb[]>([])
  const [referencias, setReferencias] = useState<Set<string>>(new Set())
  const [archivos, setArchivos] = useState<File[]>([])
  const [resultado, setResultado] =
    useState<ResultadoLecturaDevolucionesMasivas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [progreso, setProgreso] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    cargarCatalogos()
  }, [])

  async function cargarCatalogos() {
    setCargando(true)
    setError("")
    try {
      const [clientesDb, productosDb, referenciasDb] = await Promise.all([
        obtenerClientesDevolucionDb(),
        obtenerCatalogoProductosDevolucionDb(),
        obtenerReferenciasDevolucionesDb(),
      ])
      setClientes(clientesDb)
      setProductos(productosDb)
      setReferencias(new Set(
        referenciasDb.map((item) =>
          `${item.cliente_id}|${normalizar(item.documento_referencia)}`,
        ),
      ))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo preparar la importación.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function seleccionarArchivos(lista: FileList | null) {
    const seleccionados = Array.from(lista ?? [])
    if (seleccionados.length === 0) return

    setLeyendo(true)
    setArchivos(seleccionados)
    setResultado(null)
    setMensaje("")
    setError("")
    try {
      setResultado(await leerArchivosDevolucionesMasivas(seleccionados))
    } catch (err) {
      setArchivos([])
      if (inputRef.current) inputRef.current.value = ""
      setError(
        err instanceof Error ? err.message : "No se pudieron leer los archivos.",
      )
    } finally {
      setLeyendo(false)
    }
  }

  const preparacion = useMemo(() => {
    const catalogo = new Map(productos.map((producto) => [producto.codigo.trim(), producto]))
    const documentos: DocumentoDevolucionMasivaDb[] = []
    const sinCliente = new Set<string>()
    const skusDesconocidos = new Set<string>()
    let existentes = 0

    ;(resultado?.documentos ?? []).forEach((documento) => {
      const cliente = detectarCliente(documento, clientes)
      if (!cliente) {
        sinCliente.add(documento.fuente)
        return
      }

      const esExistente = referencias.has(
        `${cliente.id}|${normalizar(documento.documento_referencia)}`,
      )
      if (esExistente) existentes += 1

      documento.detalles.forEach((detalle) => {
        if (!catalogo.has(detalle.sku.trim())) {
          skusDesconocidos.add(detalle.sku.trim())
        }
      })

      if (!esExistente) {
        documentos.push({
          fuente: documento.fuente,
          archivo_origen: documento.archivo_origen,
          documento_referencia: documento.documento_referencia,
          fecha_devolucion: documento.fecha_devolucion,
          cliente_id: cliente.id,
          codigo_local: documento.codigo_local,
          nombre_local: documento.nombre_local,
          estado_documento: documento.estado_documento,
          observacion: documento.observacion,
          motivo: documento.motivo,
          valor_total: documento.valor_total,
          detalles: documento.detalles,
        })
      }
    })

    return {
      documentos,
      existentes,
      sinCliente: Array.from(sinCliente),
      skusDesconocidos: Array.from(skusDesconocidos).sort(),
    }
  }, [resultado, clientes, productos, referencias])

  const resumen = useMemo(() => {
    const documentos = resultado?.documentos ?? []
    const meses = new Map<string, {
      mes: string
      fuente: string
      documentos: number
      unidades: number
      valor: number
    }>()

    documentos.forEach((documento) => {
      const clave = `${documento.fecha_devolucion.slice(0, 7)}|${documento.fuente}`
      const actual = meses.get(clave) ?? {
        mes: documento.fecha_devolucion.slice(0, 7),
        fuente: documento.fuente === "SUPERMAXI" ? "Supermaxi" : "Santamaría",
        documentos: 0,
        unidades: 0,
        valor: 0,
      }
      actual.documentos += 1
      actual.unidades += documento.detalles.reduce(
        (total, detalle) => total + detalle.unidades,
        0,
      )
      actual.valor += documento.valor_total
      meses.set(clave, actual)
    })

    const fechas = documentos.map((documento) => documento.fecha_devolucion).sort()
    return {
      documentos: documentos.length,
      lineas: documentos.reduce((total, documento) => total + documento.detalles.length, 0),
      unidades: documentos.reduce(
        (total, documento) => total + documento.detalles.reduce(
          (subtotal, detalle) => subtotal + detalle.unidades,
          0,
        ),
        0,
      ),
      valor: documentos.reduce((total, documento) => total + documento.valor_total, 0),
      desde: fechas[0] ?? "",
      hasta: fechas.at(-1) ?? "",
      meses: Array.from(meses.values()).sort((a, b) =>
        b.mes.localeCompare(a.mes) || a.fuente.localeCompare(b.fuente),
      ),
    }
  }, [resultado])

  async function guardar() {
    if (!resultado || preparacion.documentos.length === 0) return
    if (
      resultado.conflictos.length > 0 ||
      preparacion.sinCliente.length > 0 ||
      preparacion.skusDesconocidos.length > 0
    ) return

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      const tamanoLote = 40
      let nuevos = 0
      let duplicados = 0
      let unidades = 0
      let valor = 0

      for (let indice = 0; indice < preparacion.documentos.length; indice += tamanoLote) {
        const lote = preparacion.documentos.slice(indice, indice + tamanoLote)
        const numeroLote = Math.floor(indice / tamanoLote) + 1
        const totalLotes = Math.ceil(preparacion.documentos.length / tamanoLote)
        setProgreso(`Guardando lote ${numeroLote} de ${totalLotes}…`)

        const respuesta = await importarDevolucionesMasivasDb({
          archivos: Array.from(new Set(
            lote.map((documento) => documento.archivo_origen.split("/")[0]),
          )),
          documentos: lote,
        })
        nuevos += Number(respuesta.documentos_nuevos ?? 0)
        duplicados += Number(respuesta.documentos_duplicados ?? 0)
        unidades += Number(respuesta.unidades_importadas ?? 0)
        valor += Number(respuesta.valor_importado ?? 0)
      }

      setMensaje(
        `Importación completada: ${numero(nuevos)} documentos nuevos, ${numero(unidades)} unidades y ${moneda(valor)}. ${numero(duplicados + preparacion.existentes + (resultado?.documentosDuplicados ?? 0))} duplicados fueron omitidos.`,
      )
      setResultado(null)
      setArchivos([])
      if (inputRef.current) inputRef.current.value = ""
      await cargarCatalogos()
      await onCompletado()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo completar la importación.",
      )
    } finally {
      setGuardando(false)
      setProgreso("")
    }
  }

  const bloqueada = Boolean(
    !resultado ||
    preparacion.documentos.length === 0 ||
    resultado.conflictos.length > 0 ||
    preparacion.sinCliente.length > 0 ||
    preparacion.skusDesconocidos.length > 0,
  )

  return (
    <section className="bulk-returns">
      <style>{css}</style>
      <header>
        <div>
          <span>IMPORTACIÓN HISTÓRICA</span>
          <h2>Cargar devoluciones masivamente</h2>
          <p>
            Selecciona juntos los ZIP o TXT de Supermaxi y los Excel de
            Santamaría. Primero se mostrará una validación completa.
          </p>
        </div>
      </header>

      {mensaje && <div className="bulk-message success">{mensaje}</div>}
      {error && <div className="bulk-message error">{error}</div>}

      <div className="bulk-upload-box">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".zip,.txt,.xlsx,.xls"
          disabled={cargando || leyendo || guardando}
          onChange={(evento) => seleccionarArchivos(evento.target.files)}
        />
        <div>
          <strong>{leyendo ? "Leyendo y validando…" : "Seleccionar archivos"}</strong>
          <small>ZIP/TXT de Supermaxi · XLSX de Santamaría</small>
        </div>
        {archivos.length > 0 && <b>{archivos.length} archivos</b>}
      </div>

      {resultado && (
        <>
          <div className="bulk-kpis">
            <article><span>Documentos únicos</span><strong>{numero(resumen.documentos)}</strong><small>{numero(resultado.documentosDuplicados)} copias y {numero(resultado.documentosVacios)} vacíos descartados</small></article>
            <article><span>Unidades</span><strong>{numero(resumen.unidades)}</strong><small>{numero(resumen.lineas)} líneas de SKU</small></article>
            <article><span>Valor devuelto</span><strong>{moneda(resumen.valor)}</strong><small>según notas de crédito</small></article>
            <article><span>Periodo</span><strong>{fechaCorta(resumen.desde)}</strong><small>hasta {fechaCorta(resumen.hasta)}</small></article>
          </div>

          <div className="bulk-validation">
            <p className="ok">✓ {numero(preparacion.documentos.length)} documentos listos para guardar</p>
            {preparacion.existentes > 0 && <p className="warning">○ {numero(preparacion.existentes)} ya existen en CIBUSPAN ONE y se omitirán</p>}
            {resultado.documentosVacios > 0 && <p className="warning">○ {numero(resultado.documentosVacios)} documentos sin productos y con valor cero fueron omitidos</p>}
            {resultado.conflictos.length > 0 && <p className="danger">! Documentos repetidos con información diferente: {resultado.conflictos.join(", ")}</p>}
            {preparacion.sinCliente.length > 0 && <p className="danger">! No se encontró el cliente para: {preparacion.sinCliente.join(", ")}</p>}
            {preparacion.skusDesconocidos.length > 0 && <p className="danger">! SKU no registrados: {preparacion.skusDesconocidos.join(", ")}</p>}
          </div>

          <div className="bulk-table-wrap">
            <table>
              <thead><tr><th>Mes</th><th>Cliente</th><th>Documentos</th><th>Unidades</th><th>Valor</th></tr></thead>
              <tbody>
                {resumen.meses.map((fila) => (
                  <tr key={`${fila.mes}|${fila.fuente}`}>
                    <td>{fila.mes}</td><td>{fila.fuente}</td><td>{numero(fila.documentos)}</td><td>{numero(fila.unidades)}</td><td>{moneda(fila.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bulk-actions">
            <button
              type="button"
              onClick={guardar}
              disabled={bloqueada || guardando}
            >
              {guardando ? progreso || "Guardando…" : `Guardar ${numero(preparacion.documentos.length)} documentos`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

const css = `
  .bulk-returns { padding: 20px; border: 1px solid #eadfd9; border-radius: 14px; background: #fff; box-shadow: 0 5px 18px rgba(72,42,32,.045); }
  .bulk-returns > header span { color: #F7931E; font-size: 10px; font-weight: 950; letter-spacing: 1px; }
  .bulk-returns h2 { margin: 4px 0; color: #4f2728; }
  .bulk-returns header p { max-width: 760px; margin: 0; color: #786b66; font-size: 12px; line-height: 1.5; }
  .bulk-upload-box { display: flex; align-items: center; gap: 14px; margin: 18px 0; padding: 17px; border: 2px dashed #d9c8c0; border-radius: 11px; background: #fffaf7; }
  .bulk-upload-box input { max-width: 330px; }
  .bulk-upload-box div { display: flex; flex-direction: column; }
  .bulk-upload-box strong { color: #5b3031; }
  .bulk-upload-box small { color: #91847e; }
  .bulk-upload-box b { margin-left: auto; color: #8F1D24; }
  .bulk-message { margin: 14px 0; padding: 11px 13px; border-radius: 8px; font-size: 12px; font-weight: 750; }
  .bulk-message.success { background: #ecf9f0; color: #166534; }
  .bulk-message.error { background: #fff0f0; color: #a51f2a; }
  .bulk-kpis { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; margin-bottom: 14px; }
  .bulk-kpis article { padding: 14px; border: 1px solid #e9dfda; border-top: 3px solid #F7931E; border-radius: 9px; background: #fff; }
  .bulk-kpis span { display: block; color: #7b6d67; font-size: 9px; font-weight: 900; text-transform: uppercase; }
  .bulk-kpis strong { display: block; margin: 6px 0 3px; color: #8F1D24; font-size: 22px; }
  .bulk-kpis small { color: #998b85; font-size: 9px; }
  .bulk-validation { margin-bottom: 14px; padding: 12px 14px; border-radius: 9px; background: #f8f5f1; }
  .bulk-validation p { margin: 4px 0; font-size: 11px; font-weight: 750; }
  .bulk-validation .ok { color: #16733a; }
  .bulk-validation .warning { color: #94630b; }
  .bulk-validation .danger { color: #aa2630; }
  .bulk-table-wrap { max-height: 390px; overflow: auto; border: 1px solid #e9dfda; border-radius: 9px; }
  .bulk-table-wrap table { width: 100%; border-collapse: collapse; }
  .bulk-table-wrap th { position: sticky; top: 0; padding: 10px; background: #f5efeb; color: #6e5d57; font-size: 9px; text-align: left; text-transform: uppercase; }
  .bulk-table-wrap td { padding: 9px 10px; border-top: 1px solid #eee6e2; color: #4f4541; font-size: 11px; }
  .bulk-table-wrap th:nth-child(n+3), .bulk-table-wrap td:nth-child(n+3) { text-align: right; }
  .bulk-actions { display: flex; justify-content: flex-end; margin-top: 15px; }
  .bulk-actions button { min-height: 43px; padding: 10px 18px; border: 0; border-radius: 8px; background: #8F1D24; color: #fff; font-weight: 850; cursor: pointer; }
  .bulk-actions button:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 800px) { .bulk-kpis { grid-template-columns: repeat(2,minmax(0,1fr)); } .bulk-upload-box { align-items: flex-start; flex-direction: column; } .bulk-upload-box b { margin-left: 0; } }
`
