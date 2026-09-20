import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  guardarLocalMonitoreadoKpiKamDb,
  incorporarLocalesExistentesKpiKamDb,
  importarCoberturaFavoritaKpiKamDb,
  obtenerCatalogoCoberturaKpiKamDb,
  revisarCoberturaKpiKamDb,
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
  candidatos_locales: [],
}

const ESTADOS: Array<{ valor: EstadoCoberturaKpiKamDb; etiqueta: string }> = [
  { valor: "ACTIVO", etiqueta: "Codificado" },
  { valor: "PENDIENTE", etiqueta: "Pendiente" },
  { valor: "DESCODIFICADO", etiqueta: "Descodificado" },
  { valor: "SUSPENDIDO", etiqueta: "Suspendido" },
  { valor: "NO_AUTORIZADO", etiqueta: "No autorizado" },
  { valor: "INACTIVO", etiqueta: "Inactivo" },
]

export default function KpiKamCobertura({ periodo, cambiarPeriodo, onActualizado }: Props) {
  const archivoRef = useRef<HTMLInputElement>(null)
  const [catalogo, setCatalogo] = useState(VACIO)
  const [clienteId, setClienteId] = useState("")
  const [fechaRevision, setFechaRevision] = useState(fechaHoyLocal)
  const [nuevoCodigo, setNuevoCodigo] = useState("")
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [candidatosSeleccionados, setCandidatosSeleccionados] = useState<string[]>([])
  const [archivo, setArchivo] = useState<File | null>(null)
  const [archivoHash, setArchivoHash] = useState("")
  const [lectura, setLectura] = useState<ResultadoCoberturaFavoritaExcel | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [filtroMatriz, setFiltroMatriz] = useState("TODOS")
  const [productoFiltro, setProductoFiltro] = useState("TODOS")
  const [panelAdmin, setPanelAdmin] = useState<"" | "IMPORTAR" | "LOCAL" | "HISTORIAL">("")
  const [cargando, setCargando] = useState(true)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const fechaConsulta = fechaRevision

  const cargar = useCallback(async () => {
    setCargando(true)
    setError("")
    try {
      setCatalogo(await obtenerCatalogoCoberturaKpiKamDb(clienteId || null, fechaConsulta))
    } catch (err) {
      setCatalogo(VACIO)
      setError(err instanceof Error ? err.message : "No se pudo cargar la cobertura.")
    } finally {
      setCargando(false)
    }
  }, [clienteId, fechaConsulta])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    if (fechaRevision.slice(0, 7) === periodo.slice(0, 7)) return
    const hoy = fechaHoyLocal()
    setFechaRevision(
      hoy.slice(0, 7) === periodo.slice(0, 7) ? hoy : finMes(periodo),
    )
  }, [fechaRevision, periodo])
  useEffect(() => {
    setBusqueda("")
    setFiltroMatriz("TODOS")
    setProductoFiltro("TODOS")
    setPanelAdmin("")
    setCandidatosSeleccionados([])
    setArchivo(null)
    setArchivoHash("")
    setLectura(null)
  }, [clienteId])

  const localesActivos = useMemo(
    () => catalogo.locales.filter((item) => item.activo),
    [catalogo.locales],
  )
  const posicionesPorCelda = useMemo(() => {
    const mapa = new Map<string, PosicionCobertura>()
    catalogo.posiciones.forEach((item) => {
      mapa.set(claveCelda(item.local_id, item.producto_id), item)
    })
    return mapa
  }, [catalogo.posiciones])
  const productosMatriz = useMemo(() => (
    [...catalogo.productos].sort((a, b) => {
      const alcanceA = catalogo.posiciones.filter((item) => item.producto_id === a.id && coberturaActiva(item)).length
      const alcanceB = catalogo.posiciones.filter((item) => item.producto_id === b.id && coberturaActiva(item)).length
      if (alcanceA !== alcanceB) return alcanceB - alcanceA
      return a.nombre.localeCompare(b.nombre, "es")
    })
  ), [catalogo.posiciones, catalogo.productos])
  const productosVisibles = useMemo(
    () => productoFiltro === "TODOS"
      ? productosMatriz
      : productosMatriz.filter((item) => item.id === productoFiltro),
    [productoFiltro, productosMatriz],
  )
  const localesMatriz = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es")
    return localesActivos.filter((local) => {
      if (texto && !`${local.codigo} ${local.nombre}`.toLocaleLowerCase("es").includes(texto)) return false
      const posiciones = productosVisibles.map((producto) =>
        posicionesPorCelda.get(claveCelda(local.id, producto.id)))
      if (filtroMatriz === "BRECHAS") return posiciones.some((item) => !coberturaActiva(item))
      if (filtroMatriz === "PENDIENTES") return posiciones.some((item) => item?.estado === "PENDIENTE")
      if (filtroMatriz === "ALERTAS") return posiciones.some((item) => item?.reportado_ultimo === false)
      return true
    })
  }, [busqueda, filtroMatriz, localesActivos, posicionesPorCelda, productosVisibles])
  const resumen = useMemo(() => {
    const activas = catalogo.posiciones.filter(coberturaActiva)
    return {
      activas: activas.length,
      skus: new Set(activas.map((item) => item.producto_id)).size,
      pendientes: catalogo.posiciones.filter((item) => item.estado === "PENDIENTE").length,
      alertas: catalogo.posiciones.filter((item) => item.reportado_ultimo === false).length,
    }
  }, [catalogo.posiciones])

  async function revisarCelda(
    localId: string,
    productoId: string,
    estado: EstadoCoberturaKpiKamDb,
  ) {
    const celda = claveCelda(localId, productoId)
    setGuardando(celda)
    setError("")
    setMensaje("")
    try {
      await revisarCoberturaKpiKamDb({
        clienteId,
        localId,
        productoId,
        estado,
        fechaRevision,
      })
      setMensaje(`Cambio registrado en la revisión del ${fechaCorta(fechaRevision)}.`)
      await cargar()
      onActualizado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la revisión.")
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

  async function incorporarLocalesExistentes() {
    const seleccionados = catalogo.candidatos_locales.filter((item) =>
      candidatosSeleccionados.includes(item.clave))
    if (!clienteId || seleccionados.length === 0) {
      return setError("Selecciona al menos un local existente.")
    }
    setGuardando("EXISTENTES")
    setError("")
    setMensaje("")
    try {
      const resultado = await incorporarLocalesExistentesKpiKamDb({
        clienteId,
        candidatos: seleccionados,
      })
      setCandidatosSeleccionados([])
      setMensaje(`${resultado.incorporados} locales incorporados al seguimiento.${resultado.yaExistian > 0 ? ` ${resultado.yaExistian} ya estaban registrados.` : ""}`)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron incorporar los locales.")
    } finally { setGuardando("") }
  }

  function alternarCandidato(clave: string) {
    setCandidatosSeleccionados((actuales) =>
      actuales.includes(clave)
        ? actuales.filter((item) => item !== clave)
        : [...actuales, clave])
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
        <div><span>COBERTURA COMERCIAL</span><h2>Revisión semanal SKU-local</h2><p>Selecciona únicamente las posiciones que cambiaron. Los demás estados se conservan.</p></div>
        <label><span>Fecha de revisión</span><input type="date" value={fechaRevision} onChange={(event) => { setFechaRevision(event.target.value); cambiarPeriodo(event.target.value.slice(0, 7)) }} /></label>
      </header>
      <section className="cob-filtros">
        <label><span>Cliente</span><select value={clienteId} onChange={(event) => setClienteId(event.target.value)}><option value="">Seleccionar cliente</option>{catalogo.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label>
        <div><span>Locales</span><strong>{localesActivos.length}</strong></div>
        <div><span>Posiciones activas</span><strong className="positivo">{resumen.activas}</strong></div>
        <div><span>SKU con alcance</span><strong>{resumen.skus}</strong></div>
        <div><span>Pendientes / alertas</span><strong className={resumen.pendientes + resumen.alertas > 0 ? "negativo" : "neutral"}>{resumen.pendientes + resumen.alertas}</strong></div>
      </section>
      {error && <div className="cob-error">{error}</div>}
      {mensaje && <div className="cob-exito">{mensaje}</div>}
      {!clienteId ? <div className="cob-vacio">Selecciona un cliente para gestionar sus locales y cobertura.</div> : <>
        <section className="cob-barra-admin">
          <div><span>GESTIÓN</span><strong>La matriz es la vista principal. Abre estas opciones solo cuando las necesites.</strong></div>
          <nav>
            {catalogo.puede_importar && <button className={panelAdmin === "IMPORTAR" ? "activo" : "secundario"} type="button" onClick={() => setPanelAdmin((actual) => actual === "IMPORTAR" ? "" : "IMPORTAR")}>Importar reporte</button>}
            {catalogo.puede_gestionar_locales && <button className={panelAdmin === "LOCAL" ? "activo" : "secundario"} type="button" onClick={() => setPanelAdmin((actual) => actual === "LOCAL" ? "" : "LOCAL")}>Agregar local</button>}
            {catalogo.importaciones.length > 0 && <button className={panelAdmin === "HISTORIAL" ? "activo" : "secundario"} type="button" onClick={() => setPanelAdmin((actual) => actual === "HISTORIAL" ? "" : "HISTORIAL")}>Historial</button>}
          </nav>
          <input ref={archivoRef} hidden type="file" accept=".xlsx,.xls" onChange={seleccionarArchivo} />
        </section>
        {panelAdmin === "IMPORTAR" && catalogo.puede_importar && <section className="cob-panel cob-panel-compacto">
          <header><div><span>REPORTE DE ALCANCE</span><h3>Importar reporte de Corporación Favorita</h3><p>La primera carga usa QUITO; las siguientes reconocen los códigos guardados.</p></div><button type="button" onClick={() => archivoRef.current?.click()} disabled={leyendo || Boolean(guardando)}>{leyendo ? "Analizando…" : "Seleccionar Excel"}</button></header>
          {lectura && archivo && <div className="cob-import-preview">
            <div><span>Archivo</span><strong>{archivo.name}</strong><small>Hoja: {lectura.hoja}</small></div>
            <div><span>Modo</span><strong>{lectura.usaColumnaQuito ? "Carga inicial QUITO" : "Seguimiento por código"}</strong><small>{fechaCorta(lectura.fechaReporte)}</small></div>
            <div><span>Locales</span><strong>{lectura.localesSeleccionados}</strong><small>de {lectura.localesArchivo} en el archivo</small></div>
            <div><span>Posiciones</span><strong>{lectura.posicionesSeleccionadas}</strong><small>{lectura.skusSeleccionados} SKU</small></div>
            <button type="button" onClick={() => void importarArchivo()} disabled={Boolean(guardando)}>{guardando === "IMPORTAR" ? "Importando…" : "Confirmar importación"}</button>
          </div>}
          {lectura?.advertencias.map((aviso) => <div className="cob-aviso" key={aviso}>{aviso}</div>)}
        </section>}
        {panelAdmin === "LOCAL" && catalogo.puede_gestionar_locales && <section className="cob-panel cob-panel-compacto">
          <header><div><span>LOCALES MONITOREADOS</span><h3>Agregar una nueva sucursal</h3><p>Usa el código que aparecerá al inicio de UNIDAD_OPERATIVA en los reportes futuros.</p></div><div className="cob-local-form"><input value={nuevoCodigo} onChange={(event) => setNuevoCodigo(event.target.value)} placeholder="Código, ej. 718" /><input value={nuevoNombre} onChange={(event) => setNuevoNombre(event.target.value)} placeholder="Nombre del local" /><button type="button" onClick={() => void guardarLocal()} disabled={Boolean(guardando)}>{guardando === "LOCAL" ? "Guardando…" : "Agregar local"}</button></div></header>
          {catalogo.candidatos_locales.length > 0 && <div className="cob-candidatos">
            <div className="cob-candidatos-head"><div><strong>Traer locales existentes</strong><small>Encontrados en el catálogo operativo y en documentos ya importados. Selecciona únicamente los que se van a monitorear.</small></div><button className="secundario" type="button" onClick={() => setCandidatosSeleccionados(candidatosSeleccionados.length === catalogo.candidatos_locales.length ? [] : catalogo.candidatos_locales.map((item) => item.clave))}>{candidatosSeleccionados.length === catalogo.candidatos_locales.length ? "Quitar selección" : "Seleccionar todos"}</button></div>
            <div className="cob-candidatos-lista">{catalogo.candidatos_locales.map((item) => <label key={item.clave} className={candidatosSeleccionados.includes(item.clave) ? "seleccionado" : ""}><input type="checkbox" checked={candidatosSeleccionados.includes(item.clave)} onChange={() => alternarCandidato(item.clave)} /><span><strong>{item.nombre}</strong><small>{item.origen} · {item.codigo_sugerido}</small></span></label>)}</div>
            <footer><span>{candidatosSeleccionados.length} de {catalogo.candidatos_locales.length} seleccionados</span><button type="button" disabled={Boolean(guardando) || candidatosSeleccionados.length === 0} onClick={() => void incorporarLocalesExistentes()}>{guardando === "EXISTENTES" ? "Incorporando…" : "Incorporar seleccionados"}</button></footer>
          </div>}
        </section>}
        {panelAdmin === "HISTORIAL" && <section className="cob-panel cob-panel-compacto">
          <header><div><span>HISTORIAL</span><h3>Últimas importaciones</h3><p>Trazabilidad de los archivos que alimentaron la matriz.</p></div></header>
          <div className="cob-history">{catalogo.importaciones.map((item) => <span key={item.id}><b>{fechaCorta(item.fecha_reporte)}</b>{item.archivo_nombre}<em>{item.locales_archivo} locales · {item.posiciones_importadas} posiciones</em></span>)}</div>
        </section>}
        <section className="cob-matriz-panel">
          <header className="cob-matriz-head">
            <div><span>MATRIZ DE COBERTURA</span><h3>Locales × SKU</h3><p>Cambia el estado dentro de la casilla. Se guarda inmediatamente con la fecha de revisión.</p></div>
            <div className="cob-matriz-filtros">
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar local" />
              <select value={productoFiltro} onChange={(event) => setProductoFiltro(event.target.value)}><option value="TODOS">Todos los SKU</option>{productosMatriz.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre}</option>)}</select>
              <select value={filtroMatriz} onChange={(event) => setFiltroMatriz(event.target.value)}><option value="TODOS">Todos los locales</option><option value="BRECHAS">Con brechas</option><option value="PENDIENTES">Con oportunidades</option><option value="ALERTAS">Con alertas</option></select>
            </div>
          </header>
          <div className="cob-leyenda"><span><i className="verde">✓</i>Codificado</span><span><i className="gris">○</i>Sin revisar</span><span><i className="naranja">!</i>Pendiente</span><span><i className="rojo">×</i>Descodificado / inactivo</span></div>
          {localesMatriz.length === 0 || productosVisibles.length === 0 ? <div className="cob-vacio">No existen resultados para estos filtros.</div> : <div className="cob-matriz-scroll"><table style={{ minWidth: `${Math.max(760, 250 + productosVisibles.length * 125)}px` }}><thead><tr><th className="local-col">Local monitoreado</th>{productosVisibles.map((producto) => <th key={producto.id} title={`${producto.nombre} · ${producto.codigo}`}><strong>{producto.nombre}</strong><small>{producto.codigo}</small></th>)}</tr></thead><tbody>{localesMatriz.map((local) => <tr key={local.id}><th className="local-col"><strong>{local.codigo}</strong><span>{local.nombre}</span></th>{productosVisibles.map((producto) => {
            const posicion = posicionesPorCelda.get(claveCelda(local.id, producto.id))
            const visual = visualCelda(posicion)
            const clave = claveCelda(local.id, producto.id)
            return <td key={producto.id}><select className={`cob-celda-select ${visual.clase}`} value={posicion?.estado ?? "SIN_COBERTURA"} disabled={Boolean(guardando)} title={`${local.nombre} · ${producto.nombre}: ${visual.etiqueta}`} aria-label={`${local.nombre}, ${producto.nombre}, ${visual.etiqueta}`} onChange={(event) => void revisarCelda(local.id, producto.id, event.target.value as EstadoCoberturaKpiKamDb)}><option value="SIN_COBERTURA" disabled>{guardando === clave ? "Guardando…" : "Sin revisar"}</option>{ESTADOS.map((item) => <option key={item.valor} value={item.valor} disabled={item.valor === "ACTIVO" && !producto.autorizado}>{item.etiqueta}</option>)}</select></td>
          })}</tr>)}</tbody></table></div>}
          <footer><span>Mostrando {localesMatriz.length} de {localesActivos.length} locales</span><span>{productosVisibles.length} SKU visibles</span></footer>
        </section>
      </>}
    </section>
  )
}

function fechaCorta(valor: string) {
  const [anio, mes, dia] = valor.slice(0, 10).split("-")
  return `${dia}/${mes}/${anio}`
}

function fechaHoyLocal() {
  const fecha = new Date()
  const desfase = fecha.getTimezoneOffset() * 60_000
  return new Date(fecha.getTime() - desfase).toISOString().slice(0, 10)
}

function finMes(periodo: string) {
  const [anio, mes] = periodo.slice(0, 7).split("-").map(Number)
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`
}

function etiquetaEstado(valor: EstadoCoberturaKpiKamDb) {
  return ESTADOS.find((item) => item.valor === valor)?.etiqueta ?? valor
}

function claveCelda(localId: string, productoId: string) {
  return `${localId}|${productoId}`
}

function coberturaActiva(posicion?: PosicionCobertura) {
  return posicion?.estado === "ACTIVO" && posicion.reportado_ultimo !== false
}

function visualCelda(posicion?: PosicionCobertura) {
  if (!posicion) return { clase: "sin-cobertura", simbolo: "○", etiqueta: "Sin cobertura" }
  if (posicion.reportado_ultimo === false) {
    return { clase: "alerta", simbolo: "×", etiqueta: "No aparece en el último reporte" }
  }
  if (posicion.estado === "ACTIVO") {
    return { clase: "activa", simbolo: "✓", etiqueta: "Cobertura activa" }
  }
  if (posicion.estado === "PENDIENTE") {
    return { clase: "pendiente", simbolo: "!", etiqueta: "Oportunidad pendiente" }
  }
  return { clase: "inactiva", simbolo: "×", etiqueta: etiquetaEstado(posicion.estado) }
}

const css = `
.cobertura-kam{display:grid;gap:14px}.cob-carga,.cob-bloqueada,.cob-vacio,.cob-error,.cob-exito,.cob-aviso{padding:16px;border:1px solid #e6dad4;border-radius:13px;background:white}.cob-error{color:#a1212a;background:#fff5f5;border-color:#edc8ca}.cob-exito{color:#147542;background:#eef9f2;border-color:#c6e7d2}.cob-aviso{color:#865b12;background:#fff6e7;border-color:#efd8b1}.cob-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:20px;border:1px solid #e6dad4;border-radius:14px;background:white}.cob-head>div>span,.cob-panel header span,.cob-nueva header span,.cob-listado>header span{display:block;color:#f28c18;font-size:10px;font-weight:900;letter-spacing:.09em}.cob-head h2,.cob-panel h3,.cob-nueva h3,.cob-listado h3{margin:4px 0;color:#8f1d24}.cob-head p,.cob-panel header p,.cob-nueva header p{margin:0;color:#786b66}.cob-head label{display:grid;gap:5px;min-width:190px}.cob-head label>span,.cob-filtros label>span,.cob-filtros>div>span,.cob-nueva-grid label>span,.cob-skus-campo>span{font-size:10px;font-weight:900;text-transform:uppercase;color:#746660}.cobertura-kam input,.cobertura-kam select{border:1px solid #ddcfc8;border-radius:9px;background:#fbf9f7;padding:10px;color:#3b2d29;font-weight:700}.cobertura-kam button{border:0;border-radius:9px;background:#991f28;color:white;padding:10px 14px;font-weight:800;cursor:pointer}.cobertura-kam button:disabled{opacity:.5;cursor:not-allowed}.cob-filtros{display:grid;grid-template-columns:minmax(260px,1.5fr) repeat(3,1fr);gap:10px;padding:13px;border:1px solid #e6dad4;border-radius:14px;background:white}.cob-filtros label{display:grid;gap:5px}.cob-filtros>div{display:flex;flex-direction:column;justify-content:center;padding-left:14px;border-left:1px solid #eadfd9}.cob-filtros strong{font-size:20px;color:#8f1d24}.cob-filtros small{color:#af6220}.cob-panel,.cob-nueva,.cob-listado{border:1px solid #e6dad4;border-radius:14px;background:white;overflow:hidden}.cob-panel>header,.cob-nueva>header,.cob-listado>header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:17px}.cob-import-preview{display:grid;grid-template-columns:1.5fr repeat(3,1fr) auto;gap:9px;align-items:center;padding:0 17px 17px}.cob-import-preview>div{min-height:62px;padding:10px;border:1px solid #eadfd9;border-radius:9px}.cob-import-preview span,.cob-import-preview small{display:block;color:#81736d;font-size:9px}.cob-import-preview strong{display:block;margin:4px 0;color:#5b3232;font-size:11px}.cob-history{display:grid;gap:5px;padding:12px 17px;border-top:1px solid #eee4de;color:#746660;font-size:9px}.cob-local-form{display:grid;grid-template-columns:120px minmax(220px,1fr) auto;gap:8px}.cob-locales{display:flex;flex-wrap:wrap;gap:7px;padding:0 17px 17px}.cob-locales span{display:flex;gap:5px;padding:6px 9px;border-radius:99px;background:#f5efeb;color:#6b5b55;font-size:9px}.cob-nueva-grid{display:grid;grid-template-columns:1.2fr .8fr auto;gap:10px;align-items:end;padding:0 17px 17px}.cob-nueva-grid label{display:grid;gap:5px}.cob-check{display:flex!important;flex-direction:row;align-items:center;padding-bottom:11px}.cob-skus-campo{display:grid;grid-column:1/-1;gap:6px}.cob-skus-vacio{padding:16px;border:1px dashed #dacbc4;border-radius:10px;color:#897b75;background:#fbf9f7}.cob-skus-lista{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:7px}.cob-sku-opcion{display:grid!important;grid-template-columns:auto 1fr auto;align-items:center;gap:9px;padding:10px;border:1px solid #e3d8d2;border-radius:10px;background:#fbfaf9;cursor:pointer;transition:.15s ease}.cob-sku-opcion input{width:18px;height:18px;accent-color:#18834b}.cob-sku-opcion span strong,.cob-sku-opcion span small{display:block}.cob-sku-opcion span strong{color:#512f2f}.cob-sku-opcion span small{margin-top:2px;color:#83756f;font-size:9px}.cob-sku-opcion em{font-size:8px;font-style:normal;font-weight:900;color:#8f817b;text-align:right}.cob-sku-opcion.activa{border-color:#b9dfc9;background:#f1faf5}.cob-sku-opcion.activa em{color:#16814a}.cob-sku-opcion.sin-cobertura{opacity:.52}.cob-sku-opcion.sin-cobertura:hover,.cob-sku-opcion.seleccionada{opacity:1}.cob-sku-opcion.seleccionada{border-color:#f0a449;background:#fff8ed;box-shadow:0 0 0 2px rgba(240,140,24,.12)}.cob-sku-opcion.seleccionada input{accent-color:#f28c18}.cob-motivo{grid-column:1/-2}.cob-busqueda{display:flex;gap:8px}.cob-tabla{overflow:auto}.cob-tabla table{width:100%;min-width:1120px;border-collapse:collapse}.cob-tabla th{padding:10px 12px;background:#f7f3f0;text-align:left;color:#6f605b;font-size:9px;text-transform:uppercase}.cob-tabla td{padding:9px 12px;border-top:1px solid #eee4de;font-size:10px}.cob-tabla td strong,.cob-tabla td small{display:block}.cob-tabla td small{margin-top:2px;color:#897b75}.cob-tabla td input:not([type=checkbox]){width:100%;min-width:180px}.cob-tabla td select{min-width:140px}.cob-tabla td:last-child{text-align:right}.cob-tabla input[type=checkbox]{width:18px;height:18px}.cob-pendiente{color:#b26c17!important;font-weight:800}.positivo{color:#148248!important}.negativo{color:#ad2630!important}.neutral{color:#857873!important}@media(max-width:1000px){.cob-head,.cob-filtros,.cob-import-preview,.cob-nueva-grid{display:grid;grid-template-columns:1fr}.cob-head label{min-width:0}.cob-filtros>div{border-left:0;padding-left:0}.cob-panel>header,.cob-nueva>header,.cob-listado>header{align-items:stretch;display:grid}.cob-local-form,.cob-busqueda{display:grid;grid-template-columns:1fr}.cob-motivo,.cob-skus-campo{grid-column:auto}.cob-skus-lista{grid-template-columns:1fr}}
.cob-filtros{grid-template-columns:minmax(250px,1.5fr) repeat(4,minmax(105px,.65fr))}
.cob-barra-admin{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:11px 14px;border:1px solid #e6dad4;border-radius:12px;background:#fff}.cob-barra-admin>div{display:grid;gap:2px}.cob-barra-admin>div span{color:#f28c18;font-size:9px;font-weight:900;letter-spacing:.09em}.cob-barra-admin>div strong{color:#746660;font-size:10px}.cob-barra-admin nav{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.cobertura-kam button.secundario{border:1px solid #ddcfc8;background:#fff;color:#7b302f}.cobertura-kam button.activo{background:#991f28;color:#fff}.cob-panel-compacto>header{padding:14px}.cob-panel-compacto h3{font-size:16px}.cob-panel-compacto header p{font-size:11px}.cob-history{display:grid;gap:0;padding:0 14px 14px;border-top:0}.cob-history span{display:grid;grid-template-columns:80px minmax(180px,1fr) auto;gap:12px;padding:10px;border-top:1px solid #eee4de;color:#5f514c}.cob-history span b{color:#8f1d24}.cob-history span em{font-style:normal;color:#897b75}
.cob-matriz-panel{border:1px solid #e2d6d0;border-radius:14px;background:#fff;overflow:hidden}.cob-matriz-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:15px 16px}.cob-matriz-head>div:first-child>span{display:block;color:#f28c18;font-size:9px;font-weight:900;letter-spacing:.09em}.cob-matriz-head h3{margin:3px 0;color:#8f1d24;font-size:18px}.cob-matriz-head p{margin:0;color:#7d6f69;font-size:10px}.cob-matriz-filtros{display:flex;gap:7px}.cob-matriz-filtros input{min-width:175px}.cob-matriz-filtros select{max-width:175px}.cob-leyenda{display:flex;gap:18px;flex-wrap:wrap;padding:9px 16px;border-top:1px solid #eee4de;background:#faf8f6;color:#70635e;font-size:9px}.cob-leyenda span{display:flex;align-items:center;gap:6px}.cob-leyenda i{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;font-style:normal;font-size:14px;font-weight:900}.cob-leyenda .verde{color:#148248;background:#e8f7ee}.cob-leyenda .gris{color:#9b8e88;background:#f0ece9}.cob-leyenda .naranja{color:#b2680c;background:#fff1da}.cob-leyenda .rojo{color:#ad2630;background:#fdebed}.cob-matriz-scroll{max-height:64vh;overflow:auto;border-top:1px solid #eee4de;border-bottom:1px solid #eee4de}.cob-matriz-scroll table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}.cob-matriz-scroll th,.cob-matriz-scroll td{height:48px;padding:6px;border-right:1px solid #eee5e0;border-bottom:1px solid #eee5e0;text-align:center}.cob-matriz-scroll thead th{position:sticky;top:0;z-index:3;height:66px;background:#f6f1ee;color:#6b5b55}.cob-matriz-scroll thead th strong,.cob-matriz-scroll thead th small{display:block;overflow:hidden;text-overflow:ellipsis}.cob-matriz-scroll thead th strong{font-size:8px;text-transform:uppercase;white-space:normal}.cob-matriz-scroll thead th small{margin-top:4px;color:#9a8d87;font-size:7px;white-space:nowrap}.cob-matriz-scroll .local-col{position:sticky;left:0;width:250px;z-index:2;text-align:left;padding-left:14px;background:#fff}.cob-matriz-scroll thead .local-col{z-index:4;background:#f6f1ee;font-size:9px;text-transform:uppercase}.cob-matriz-scroll tbody .local-col strong,.cob-matriz-scroll tbody .local-col span{display:block}.cob-matriz-scroll tbody .local-col strong{color:#8f1d24;font-size:10px}.cob-matriz-scroll tbody .local-col span{margin-top:2px;color:#4e413d;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cobertura-kam button.cob-celda{display:inline-grid;place-items:center;width:34px;height:34px;padding:0;border-radius:9px;font-size:19px;font-weight:900;line-height:1;transition:transform .12s ease,box-shadow .12s ease}.cobertura-kam button.cob-celda:hover{transform:scale(1.08);box-shadow:0 3px 9px rgba(68,40,34,.14)}.cobertura-kam button.cob-celda.activa{color:#148248;background:#e8f7ee}.cobertura-kam button.cob-celda.sin-cobertura{color:#9b8e88;background:#f0ece9}.cobertura-kam button.cob-celda.pendiente{color:#b2680c;background:#fff1da}.cobertura-kam button.cob-celda.alerta,.cobertura-kam button.cob-celda.inactiva{color:#ad2630;background:#fdebed}.cob-matriz-panel>footer{display:flex;justify-content:space-between;padding:9px 16px;color:#81736d;font-size:9px}
.cob-modal-fondo{position:fixed;inset:0;z-index:1000;display:flex;justify-content:flex-end;background:rgba(35,24,22,.42);backdrop-filter:blur(2px)}.cob-detalle{width:min(430px,94vw);height:100%;padding:20px;background:#fff;box-shadow:-10px 0 30px rgba(44,27,23,.18);overflow:auto}.cob-detalle>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-bottom:15px;border-bottom:1px solid #eee4de}.cob-detalle>header span{color:#f28c18;font-size:9px;font-weight:900;letter-spacing:.09em}.cob-detalle>header h3{margin:4px 0;color:#8f1d24;font-size:23px}.cob-detalle>header p{margin:0;color:#6d5f59}.cobertura-kam button.cob-cerrar{width:34px;height:34px;padding:0;border-radius:50%;background:#f1ebe7;color:#7b302f;font-size:21px}.cob-estado-actual{display:flex;align-items:center;gap:10px;margin:16px 0;padding:12px;border-radius:10px;font-weight:900}.cob-estado-actual>strong{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;font-size:20px}.cob-estado-actual.activa{color:#148248;background:#eaf8ef}.cob-estado-actual.sin-cobertura{color:#776a65;background:#f1eeec}.cob-estado-actual.pendiente{color:#a65f08;background:#fff2dd}.cob-estado-actual.alerta,.cob-estado-actual.inactiva{color:#a8252e;background:#fdebed}.cob-detalle dl{display:grid;gap:0;margin:0 0 18px}.cob-detalle dl>div{display:flex;justify-content:space-between;gap:15px;padding:9px 0;border-bottom:1px solid #eee4de}.cob-detalle dt{color:#81736d;font-size:10px}.cob-detalle dd{margin:0;color:#4e413d;font-size:10px;font-weight:800;text-align:right}.cob-detalle-form{display:grid;gap:12px}.cob-detalle-form label{display:grid;gap:5px}.cob-detalle-form label>span{color:#746660;font-size:9px;font-weight:900;text-transform:uppercase}.cob-detalle-form textarea{min-height:95px;resize:vertical;border:1px solid #ddcfc8;border-radius:9px;background:#fbf9f7;padding:10px;color:#3b2d29;font:inherit}.cob-detalle-form .cob-check{display:flex;padding:0}.cob-nota{padding:10px;border-radius:9px;background:#fff3df;color:#97601b}.cob-detalle-form>button{margin-top:4px}
@media(max-width:1100px){.cob-filtros{grid-template-columns:1.5fr repeat(2,1fr)}.cob-matriz-head{align-items:stretch;display:grid}.cob-matriz-filtros{display:grid;grid-template-columns:1fr 1fr 1fr}.cob-matriz-filtros input,.cob-matriz-filtros select{max-width:none;min-width:0}}
@media(max-width:700px){.cob-filtros{grid-template-columns:1fr 1fr}.cob-filtros label{grid-column:1/-1}.cob-barra-admin{align-items:stretch;display:grid}.cob-barra-admin nav{justify-content:flex-start}.cob-matriz-filtros{grid-template-columns:1fr}.cob-history span{grid-template-columns:1fr;gap:3px}.cob-import-preview{grid-template-columns:1fr}.cob-local-form{grid-template-columns:1fr}.cob-detalle{width:100vw}.cob-matriz-panel>footer{gap:8px;flex-wrap:wrap}}
.cob-error-modal{margin-bottom:12px}
.cob-candidatos{display:grid;gap:10px;padding:0 14px 14px;border-top:1px solid #eee4de}.cob-candidatos-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding-top:13px}.cob-candidatos-head strong,.cob-candidatos-head small{display:block}.cob-candidatos-head strong{color:#8f1d24}.cob-candidatos-head small{margin-top:3px;color:#81736d;font-size:10px}.cob-candidatos-lista{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:7px;max-height:240px;overflow:auto}.cob-candidatos-lista label{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:center;padding:10px;border:1px solid #e3d8d2;border-radius:10px;background:#fbfaf9;cursor:pointer}.cob-candidatos-lista label.seleccionado{border-color:#e7a45a;background:#fff8ee}.cob-candidatos-lista input{width:18px;height:18px;accent-color:#991f28}.cob-candidatos-lista strong,.cob-candidatos-lista small{display:block}.cob-candidatos-lista strong{color:#513d38;font-size:10px}.cob-candidatos-lista small{margin-top:3px;color:#8a7c76;font-size:8px}.cob-candidatos footer{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#81736d;font-size:9px}
.cobertura-kam select.cob-celda-select{width:112px;min-width:112px;height:34px;padding:4px 22px 4px 7px;border:0;border-radius:8px;font-size:8px;font-weight:900;text-transform:uppercase;cursor:pointer}.cobertura-kam select.cob-celda-select.activa{color:#147542;background:#e8f7ee}.cobertura-kam select.cob-celda-select.sin-cobertura{color:#877a74;background:#f0ece9}.cobertura-kam select.cob-celda-select.pendiente{color:#a65f08;background:#fff1da}.cobertura-kam select.cob-celda-select.alerta,.cobertura-kam select.cob-celda-select.inactiva{color:#a8252e;background:#fdebed}.cobertura-kam select.cob-celda-select:disabled{opacity:.62;cursor:wait}
`
