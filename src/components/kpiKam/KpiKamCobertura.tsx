import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  guardarCoberturaKpiKamDb,
  guardarLocalMonitoreadoKpiKamDb,
  importarCoberturaFavoritaKpiKamDb,
  obtenerCatalogoCoberturaKpiKamDb,
  type CatalogoCoberturaKpiKamDb,
  type EstadoCoberturaKpiKamDb,
} from "../../repositories/kpiKamRepository"
import {
  huellaArchivoCobertura,
  leerReporteCoberturaFavorita,
  type ResultadoCoberturaFavoritaExcel,
} from "../../utils/coberturaFavoritaExcel"

type Props = {
  periodo: string
  cambiarPeriodo: (periodo: string) => void
  onActualizado: () => void
}

type PosicionCobertura = CatalogoCoberturaKpiKamDb["posiciones"][number]

const VACIO: CatalogoCoberturaKpiKamDb = {
  puede_configurar: false,
  puede_importar: false,
  puede_gestionar_locales: false,
  clientes: [],
  locales: [],
  productos: [],
  posiciones: [],
  importaciones: [],
}

const ESTADOS: Array<{ valor: EstadoCoberturaKpiKamDb; etiqueta: string }> = [
  { valor: "ACTIVO", etiqueta: "Activo" },
  { valor: "PENDIENTE", etiqueta: "Pendiente" },
  { valor: "DESCODIFICADO", etiqueta: "Descodificado" },
  { valor: "SUSPENDIDO", etiqueta: "Suspendido" },
  { valor: "NO_AUTORIZADO", etiqueta: "No autorizado" },
  { valor: "INACTIVO", etiqueta: "Inactivo" },
]

const REQUIERE_MOTIVO = new Set<EstadoCoberturaKpiKamDb>([
  "DESCODIFICADO",
  "SUSPENDIDO",
  "NO_AUTORIZADO",
  "INACTIVO",
])

export default function KpiKamCobertura({ periodo, cambiarPeriodo, onActualizado }: Props) {
  const archivoRef = useRef<HTMLInputElement>(null)
  const [catalogo, setCatalogo] = useState(VACIO)
  const [clienteId, setClienteId] = useState("")
  const [localId, setLocalId] = useState("")
  const [productoId, setProductoId] = useState("")
  const [estado, setEstado] = useState<EstadoCoberturaKpiKamDb>("PENDIENTE")
  const [esObjetivo, setEsObjetivo] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [nuevoCodigo, setNuevoCodigo] = useState("")
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [archivoHash, setArchivoHash] = useState("")
  const [lectura, setLectura] = useState<ResultadoCoberturaFavoritaExcel | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("TODOS")
  const [cargando, setCargando] = useState(true)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const fechaVigencia = `${periodo.slice(0, 7)}-01`

  const cargar = useCallback(async () => {
    setCargando(true)
    setError("")
    try {
      setCatalogo(await obtenerCatalogoCoberturaKpiKamDb(clienteId || null, fechaVigencia))
    } catch (err) {
      setCatalogo(VACIO)
      setError(err instanceof Error ? err.message : "No se pudo cargar la cobertura.")
    } finally {
      setCargando(false)
    }
  }, [clienteId, fechaVigencia])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    setLocalId("")
    setProductoId("")
    setEstado("PENDIENTE")
    setEsObjetivo(false)
    setMotivo("")
    setBusqueda("")
    setFiltroEstado("TODOS")
    setArchivo(null)
    setArchivoHash("")
    setLectura(null)
  }, [clienteId])

  const localesActivos = useMemo(
    () => catalogo.locales.filter((item) => item.activo),
    [catalogo.locales],
  )
  const resumen = useMemo(() => {
    const objetivos = catalogo.posiciones.filter((item) => item.es_objetivo)
    const activas = objetivos.filter((item) => item.estado === "ACTIVO")
    return {
      objetivos: objetivos.length,
      activas: activas.length,
      sinReporte: catalogo.posiciones.filter((item) => item.reportado_ultimo === false).length,
      porcentaje: objetivos.length > 0 ? activas.length / objetivos.length * 100 : null,
    }
  }, [catalogo.posiciones])
  const posicionesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es")
    return catalogo.posiciones.filter((item) => {
      if (filtroEstado !== "TODOS" && item.estado !== filtroEstado) return false
      if (!texto) return true
      return `${item.local_codigo} ${item.local_nombre} ${item.producto_codigo} ${item.producto_nombre}`
        .toLocaleLowerCase("es").includes(texto)
    })
  }, [catalogo.posiciones, busqueda, filtroEstado])

  function actualizarPosicion(posicion: PosicionCobertura) {
    setCatalogo((actual) => ({
      ...actual,
      posiciones: actual.posiciones.map((item) => item.id === posicion.id ? posicion : item),
    }))
    onActualizado()
  }

  async function guardarNueva() {
    if (!clienteId || !localId || !productoId) return setError("Selecciona cliente, local y SKU.")
    if (REQUIERE_MOTIVO.has(estado) && !motivo.trim()) return setError("Registra el motivo del estado seleccionado.")
    const producto = catalogo.productos.find((item) => item.id === productoId)
    if (estado === "ACTIVO" && !producto?.autorizado) {
      return setError("El SKU todavía no está autorizado para este cliente. Regístralo como pendiente.")
    }
    setGuardando("NUEVA")
    setError("")
    setMensaje("")
    try {
      await guardarCoberturaKpiKamDb({
        clienteId, localId, productoId, esObjetivo, estado,
        vigenteDesde: fechaVigencia, motivo: motivo.trim() || null,
      })
      setMensaje("Oportunidad SKU-local guardada correctamente.")
      setMotivo("")
      setProductoId("")
      await cargar()
      onActualizado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la posición.")
    } finally { setGuardando("") }
  }

  async function guardarLocal() {
    if (!clienteId || !nuevoCodigo.trim() || !nuevoNombre.trim()) return setError("Registra el código y el nombre del nuevo local.")
    setGuardando("LOCAL")
    setError("")
    setMensaje("")
    try {
      await guardarLocalMonitoreadoKpiKamDb({ clienteId, codigo: nuevoCodigo, nombre: nuevoNombre })
      setNuevoCodigo("")
      setNuevoNombre("")
      setMensaje("Nuevo local incorporado al seguimiento.")
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el local.")
    } finally { setGuardando("") }
  }

  async function seleccionarArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const seleccionado = evento.target.files?.[0] ?? null
    evento.target.value = ""
    setArchivo(seleccionado)
    setArchivoHash("")
    setLectura(null)
    setMensaje("")
    setError("")
    if (!seleccionado || !clienteId) return
    setLeyendo(true)
    try {
      const [resultado, hash] = await Promise.all([
        leerReporteCoberturaFavorita(seleccionado, localesActivos.map((item) => item.codigo)),
        huellaArchivoCobertura(seleccionado),
      ])
      setLectura(resultado)
      setArchivoHash(hash)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el reporte.")
    } finally { setLeyendo(false) }
  }

  async function importarArchivo() {
    if (!archivo || !lectura || !archivoHash || !clienteId) return
    setGuardando("IMPORTAR")
    setError("")
    setMensaje("")
    try {
      const resultado = await importarCoberturaFavoritaKpiKamDb({
        clienteId,
        archivoNombre: archivo.name,
        archivoHash,
        fechaReporte: lectura.fechaReporte,
        inicialQuito: lectura.usaColumnaQuito,
        filas: lectura.filas,
      })
      const faltantes = resultado.skus_no_encontrados.length > 0
        ? ` SKU no encontrados: ${resultado.skus_no_encontrados.join(", ")}.` : ""
      setMensaje(`Importación completada: ${resultado.locales_monitoreados} locales y ${resultado.posiciones_importadas} posiciones reconocidas.${faltantes}`)
      setArchivo(null)
      setArchivoHash("")
      setLectura(null)
      await cargar()
      onActualizado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el reporte.")
    } finally { setGuardando("") }
  }

  if (cargando && catalogo.clientes.length === 0) return <div className="cob-carga">Cargando cobertura SKU-local…</div>
  if (error && !catalogo.puede_configurar && !cargando) return <div className="cob-error">{error}</div>
  if (!catalogo.puede_configurar && !cargando) return <div className="cob-bloqueada">No tienes clientes asignados para gestionar cobertura.</div>

  return (
    <section className="cobertura-kam">
      <style>{css}</style>
      <header className="cob-head">
        <div><span>COBERTURA COMERCIAL</span><h2>Alcance SKU por local</h2><p>Los locales se reconocen por su código estable. El reporte no necesita formato de tabla.</p></div>
        <label><span>Vigencia desde</span><input type="month" value={periodo} onChange={(event) => cambiarPeriodo(event.target.value)} /></label>
      </header>
      <section className="cob-filtros">
        <label><span>Cliente</span><select value={clienteId} onChange={(event) => setClienteId(event.target.value)}><option value="">Seleccionar cliente</option>{catalogo.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label>
        <div><span>Locales monitoreados</span><strong>{localesActivos.length}</strong></div>
        <div><span>Posiciones activas</span><strong>{resumen.activas}/{resumen.objetivos}</strong></div>
        <div><span>Cobertura actual</span><strong className={resumen.porcentaje == null ? "neutral" : resumen.porcentaje >= 95 ? "positivo" : "negativo"}>{resumen.porcentaje == null ? "—" : `${resumen.porcentaje.toFixed(1)}%`}</strong>{resumen.sinReporte > 0 && <small>{resumen.sinReporte} por revisar</small>}</div>
      </section>
      {error && <div className="cob-error">{error}</div>}
      {mensaje && <div className="cob-exito">{mensaje}</div>}
      {!clienteId ? <div className="cob-vacio">Selecciona un cliente para gestionar sus locales y cobertura.</div> : <>
        {catalogo.puede_importar && <section className="cob-panel">
          <header><div><span>REPORTE DE ALCANCE</span><h3>Importar reporte de Corporación Favorita</h3><p>La primera carga usa QUITO. Las siguientes reconocen únicamente los códigos guardados.</p></div><button type="button" onClick={() => archivoRef.current?.click()} disabled={leyendo || Boolean(guardando)}>{leyendo ? "Analizando…" : "Seleccionar Excel"}</button><input ref={archivoRef} hidden type="file" accept=".xlsx,.xls" onChange={seleccionarArchivo} /></header>
          {lectura && archivo && <div className="cob-import-preview">
            <div><span>Archivo</span><strong>{archivo.name}</strong><small>Hoja: {lectura.hoja}</small></div>
            <div><span>Modo</span><strong>{lectura.usaColumnaQuito ? "Carga inicial QUITO" : "Seguimiento por código"}</strong><small>{fechaCorta(lectura.fechaReporte)}</small></div>
            <div><span>Locales</span><strong>{lectura.localesSeleccionados}</strong><small>de {lectura.localesArchivo} en el archivo</small></div>
            <div><span>Posiciones</span><strong>{lectura.posicionesSeleccionadas}</strong><small>{lectura.skusSeleccionados} SKU</small></div>
            <button type="button" onClick={() => void importarArchivo()} disabled={Boolean(guardando)}>{guardando === "IMPORTAR" ? "Importando…" : "Confirmar importación"}</button>
          </div>}
          {lectura?.advertencias.map((aviso) => <div className="cob-aviso" key={aviso}>{aviso}</div>)}
          {catalogo.importaciones.length > 0 && <div className="cob-history"><strong>Últimas importaciones</strong>{catalogo.importaciones.slice(0, 3).map((item) => <span key={item.id}>{fechaCorta(item.fecha_reporte)} · {item.archivo_nombre} · {item.posiciones_importadas} posiciones</span>)}</div>}
        </section>}
        {catalogo.puede_gestionar_locales && <section className="cob-panel">
          <header><div><span>LOCALES MONITOREADOS</span><h3>Agregar una nueva sucursal</h3><p>Usa el código que aparecerá al inicio de UNIDAD_OPERATIVA en los reportes futuros.</p></div><div className="cob-local-form"><input value={nuevoCodigo} onChange={(event) => setNuevoCodigo(event.target.value)} placeholder="Código, ej. 718" /><input value={nuevoNombre} onChange={(event) => setNuevoNombre(event.target.value)} placeholder="Nombre del local" /><button type="button" onClick={() => void guardarLocal()} disabled={Boolean(guardando)}>{guardando === "LOCAL" ? "Guardando…" : "Agregar local"}</button></div></header>
          {localesActivos.length > 0 && <div className="cob-locales">{localesActivos.map((local) => <span key={local.id}><b>{local.codigo}</b>{local.nombre}</span>)}</div>}
        </section>}
        <section className="cob-nueva">
          <header><div><span>EXPANSIÓN DE COBERTURA</span><h3>Agregar oportunidad SKU-local</h3><p>Los SKU no autorizados se registran como pendientes hasta conseguir su codificación.</p></div></header>
          <div className="cob-nueva-grid">
            <label><span>Local</span><select value={localId} onChange={(event) => setLocalId(event.target.value)}><option value="">Seleccionar local</option>{localesActivos.map((local) => <option key={local.id} value={local.id}>{local.codigo} · {local.nombre}</option>)}</select></label>
            <label><span>SKU</span><select value={productoId} onChange={(event) => setProductoId(event.target.value)}><option value="">Seleccionar SKU</option>{catalogo.productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} · {producto.codigo}{producto.autorizado ? "" : " · OPORTUNIDAD"}</option>)}</select></label>
            <label><span>Estado</span><select value={estado} onChange={(event) => setEstado(event.target.value as EstadoCoberturaKpiKamDb)}>{ESTADOS.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}</select></label>
            {catalogo.puede_gestionar_locales && <label className="cob-check"><input type="checkbox" checked={esObjetivo} onChange={(event) => setEsObjetivo(event.target.checked)} /><span>Meta aprobada</span></label>}
            <label className="cob-motivo"><span>Motivo / gestión realizada</span><input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder={REQUIERE_MOTIVO.has(estado) ? "Obligatorio para este estado" : "Opcional"} /></label>
            <button type="button" disabled={Boolean(guardando) || !localId || !productoId} onClick={() => void guardarNueva()}>{guardando === "NUEVA" ? "Guardando…" : "Guardar oportunidad"}</button>
          </div>
        </section>
        <section className="cob-listado">
          <header><div><span>POSICIONES VIGENTES</span><h3>Detalle por local y SKU</h3></div><div className="cob-busqueda"><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar local o SKU" /><select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)}><option value="TODOS">Todos los estados</option>{ESTADOS.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}</select></div></header>
          {catalogo.posiciones.length === 0 ? <div className="cob-vacio">Todavía no existen posiciones. Importa el reporte inicial de Favorita.</div> : <div className="cob-tabla"><table><thead><tr><th>Local</th><th>SKU</th><th>Fuente</th><th>Objetivo</th><th>Estado</th><th>Observación</th><th /></tr></thead><tbody>{posicionesFiltradas.map((posicion) => <FilaCobertura key={posicion.id} posicion={posicion} fechaVigencia={fechaVigencia} bloqueada={Boolean(guardando)} puedeCambiarObjetivo={catalogo.puede_gestionar_locales} onGuardando={setGuardando} onError={setError} onMensaje={setMensaje} onGuardado={actualizarPosicion} />)}</tbody></table></div>}
        </section>
      </>}
    </section>
  )
}

function FilaCobertura({ posicion, fechaVigencia, bloqueada, puedeCambiarObjetivo, onGuardando, onError, onMensaje, onGuardado }: {
  posicion: PosicionCobertura
  fechaVigencia: string
  bloqueada: boolean
  puedeCambiarObjetivo: boolean
  onGuardando: (valor: string) => void
  onError: (valor: string) => void
  onMensaje: (valor: string) => void
  onGuardado: (posicion: PosicionCobertura) => void
}) {
  const [estado, setEstado] = useState(posicion.estado)
  const [esObjetivo, setEsObjetivo] = useState(posicion.es_objetivo)
  const [motivo, setMotivo] = useState(posicion.motivo ?? "")
  async function guardar() {
    if (REQUIERE_MOTIVO.has(estado) && !motivo.trim()) return onError("Registra el motivo del estado seleccionado.")
    onGuardando(posicion.id)
    onError("")
    onMensaje("")
    try {
      const id = await guardarCoberturaKpiKamDb({ clienteId: posicion.cliente_id, localId: posicion.local_id, productoId: posicion.producto_id, esObjetivo, estado, vigenteDesde: fechaVigencia, motivo: motivo.trim() || null })
      onGuardado({ ...posicion, id: id || posicion.id, es_objetivo: esObjetivo, estado, motivo: motivo.trim() || null, vigente_desde: fechaVigencia, confirmado_en: new Date().toISOString() })
      onMensaje("Posición actualizada correctamente.")
    } catch (err) { onError(err instanceof Error ? err.message : "No se pudo actualizar la posición.") }
    finally { onGuardando("") }
  }
  const fuente = posicion.origen === "FAVORITA_REPORTE" ? "Reporte Favorita" : posicion.origen === "OPORTUNIDAD" ? "Oportunidad" : "Registro manual"
  return <tr>
    <td><strong>{posicion.local_codigo ? `${posicion.local_codigo} · ` : ""}{posicion.local_nombre}</strong></td>
    <td><strong>{posicion.producto_nombre}</strong><small>{posicion.producto_codigo}</small></td>
    <td><strong>{fuente}</strong>{posicion.ultima_fecha_reporte && <small>{fechaCorta(posicion.ultima_fecha_reporte)}</small>}{posicion.reportado_ultimo === false && <small className="cob-pendiente">No aparece en el último reporte</small>}</td>
    <td><input type="checkbox" checked={esObjetivo} disabled={!puedeCambiarObjetivo} onChange={(event) => setEsObjetivo(event.target.checked)} /></td>
    <td><select value={estado} onChange={(event) => setEstado(event.target.value as EstadoCoberturaKpiKamDb)}>{ESTADOS.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}</select></td>
    <td><input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder={REQUIERE_MOTIVO.has(estado) ? "Obligatorio" : "Opcional"} /></td>
    <td><button type="button" disabled={bloqueada} onClick={() => void guardar()}>Guardar</button></td>
  </tr>
}

function fechaCorta(valor: string) {
  const [anio, mes, dia] = valor.slice(0, 10).split("-")
  return `${dia}/${mes}/${anio}`
}

const css = `
.cobertura-kam{display:grid;gap:14px}.cob-carga,.cob-bloqueada,.cob-vacio,.cob-error,.cob-exito,.cob-aviso{padding:16px;border:1px solid #e6dad4;border-radius:13px;background:white}.cob-error{color:#a1212a;background:#fff5f5;border-color:#edc8ca}.cob-exito{color:#147542;background:#eef9f2;border-color:#c6e7d2}.cob-aviso{color:#865b12;background:#fff6e7;border-color:#efd8b1}.cob-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:20px;border:1px solid #e6dad4;border-radius:14px;background:white}.cob-head>div>span,.cob-panel header span,.cob-nueva header span,.cob-listado>header span{display:block;color:#f28c18;font-size:10px;font-weight:900;letter-spacing:.09em}.cob-head h2,.cob-panel h3,.cob-nueva h3,.cob-listado h3{margin:4px 0;color:#8f1d24}.cob-head p,.cob-panel header p,.cob-nueva header p{margin:0;color:#786b66}.cob-head label{display:grid;gap:5px;min-width:190px}.cob-head label>span,.cob-filtros label>span,.cob-filtros>div>span,.cob-nueva-grid label>span{font-size:10px;font-weight:900;text-transform:uppercase;color:#746660}.cobertura-kam input,.cobertura-kam select{border:1px solid #ddcfc8;border-radius:9px;background:#fbf9f7;padding:10px;color:#3b2d29;font-weight:700}.cobertura-kam button{border:0;border-radius:9px;background:#991f28;color:white;padding:10px 14px;font-weight:800;cursor:pointer}.cobertura-kam button:disabled{opacity:.5;cursor:not-allowed}.cob-filtros{display:grid;grid-template-columns:minmax(260px,1.5fr) repeat(3,1fr);gap:10px;padding:13px;border:1px solid #e6dad4;border-radius:14px;background:white}.cob-filtros label{display:grid;gap:5px}.cob-filtros>div{display:flex;flex-direction:column;justify-content:center;padding-left:14px;border-left:1px solid #eadfd9}.cob-filtros strong{font-size:20px;color:#8f1d24}.cob-filtros small{color:#af6220}.cob-panel,.cob-nueva,.cob-listado{border:1px solid #e6dad4;border-radius:14px;background:white;overflow:hidden}.cob-panel>header,.cob-nueva>header,.cob-listado>header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:17px}.cob-import-preview{display:grid;grid-template-columns:1.5fr repeat(3,1fr) auto;gap:9px;align-items:center;padding:0 17px 17px}.cob-import-preview>div{min-height:62px;padding:10px;border:1px solid #eadfd9;border-radius:9px}.cob-import-preview span,.cob-import-preview small{display:block;color:#81736d;font-size:9px}.cob-import-preview strong{display:block;margin:4px 0;color:#5b3232;font-size:11px}.cob-history{display:grid;gap:5px;padding:12px 17px;border-top:1px solid #eee4de;color:#746660;font-size:9px}.cob-local-form{display:grid;grid-template-columns:120px minmax(220px,1fr) auto;gap:8px}.cob-locales{display:flex;flex-wrap:wrap;gap:7px;padding:0 17px 17px}.cob-locales span{display:flex;gap:5px;padding:6px 9px;border-radius:99px;background:#f5efeb;color:#6b5b55;font-size:9px}.cob-nueva-grid{display:grid;grid-template-columns:1fr 1.2fr .8fr auto;gap:10px;align-items:end;padding:0 17px 17px}.cob-nueva-grid label{display:grid;gap:5px}.cob-check{display:flex!important;flex-direction:row;align-items:center;padding-bottom:11px}.cob-motivo{grid-column:1/-2}.cob-busqueda{display:flex;gap:8px}.cob-tabla{overflow:auto}.cob-tabla table{width:100%;min-width:1120px;border-collapse:collapse}.cob-tabla th{padding:10px 12px;background:#f7f3f0;text-align:left;color:#6f605b;font-size:9px;text-transform:uppercase}.cob-tabla td{padding:9px 12px;border-top:1px solid #eee4de;font-size:10px}.cob-tabla td strong,.cob-tabla td small{display:block}.cob-tabla td small{margin-top:2px;color:#897b75}.cob-tabla td input:not([type=checkbox]){width:100%;min-width:180px}.cob-tabla td select{min-width:140px}.cob-tabla td:last-child{text-align:right}.cob-tabla input[type=checkbox]{width:18px;height:18px}.cob-pendiente{color:#b26c17!important;font-weight:800}.positivo{color:#148248!important}.negativo{color:#ad2630!important}.neutral{color:#857873!important}@media(max-width:1000px){.cob-head,.cob-filtros,.cob-import-preview,.cob-nueva-grid{display:grid;grid-template-columns:1fr}.cob-head label{min-width:0}.cob-filtros>div{border-left:0;padding-left:0}.cob-panel>header,.cob-nueva>header,.cob-listado>header{align-items:stretch;display:grid}.cob-local-form,.cob-busqueda{display:grid;grid-template-columns:1fr}.cob-motivo{grid-column:auto}}
`
