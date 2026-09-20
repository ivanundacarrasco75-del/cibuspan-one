import { useCallback, useEffect, useMemo, useState } from "react"
import {
  guardarCoberturaKpiKamDb,
  inicializarCoberturaKpiKamDb,
  obtenerCatalogoCoberturaKpiKamDb,
  type CatalogoCoberturaKpiKamDb,
  type EstadoCoberturaKpiKamDb,
} from "../../repositories/kpiKamRepository"

type Props = {
  periodo: string
  cambiarPeriodo: (periodo: string) => void
  onActualizado: () => void
}

type PosicionCobertura = CatalogoCoberturaKpiKamDb["posiciones"][number]

const VACIO: CatalogoCoberturaKpiKamDb = {
  puede_configurar: false,
  clientes: [],
  locales: [],
  productos: [],
  posiciones: [],
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

export default function KpiKamCobertura({
  periodo,
  cambiarPeriodo,
  onActualizado,
}: Props) {
  const [catalogo, setCatalogo] = useState(VACIO)
  const [clienteId, setClienteId] = useState("")
  const [localId, setLocalId] = useState("")
  const [productoId, setProductoId] = useState("")
  const [estado, setEstado] = useState<EstadoCoberturaKpiKamDb>("PENDIENTE")
  const [esObjetivo, setEsObjetivo] = useState(true)
  const [motivo, setMotivo] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("TODOS")
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const fechaVigencia = `${periodo.slice(0, 7)}-01`

  const cargar = useCallback(async () => {
    setCargando(true)
    setError("")
    try {
      const datos = await obtenerCatalogoCoberturaKpiKamDb(
        clienteId || null,
        fechaVigencia,
      )
      setCatalogo(datos)
    } catch (err) {
      setCatalogo(VACIO)
      setError(err instanceof Error ? err.message : "No se pudo cargar la cobertura.")
    } finally {
      setCargando(false)
    }
  }, [clienteId, fechaVigencia])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    setLocalId("")
    setProductoId("")
    setEstado("PENDIENTE")
    setEsObjetivo(true)
    setMotivo("")
    setBusqueda("")
    setFiltroEstado("TODOS")
  }, [clienteId])

  const resumen = useMemo(() => {
    const objetivos = catalogo.posiciones.filter((item) => item.es_objetivo)
    const activas = objetivos.filter((item) => item.estado === "ACTIVO")
    return {
      objetivos: objetivos.length,
      activas: activas.length,
      porcentaje: objetivos.length > 0
        ? activas.length / objetivos.length * 100
        : null,
    }
  }, [catalogo.posiciones])

  const posicionesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es")
    return catalogo.posiciones.filter((item) => {
      if (filtroEstado !== "TODOS" && item.estado !== filtroEstado) return false
      if (!texto) return true
      return `${item.local_nombre} ${item.producto_codigo} ${item.producto_nombre}`
        .toLocaleLowerCase("es")
        .includes(texto)
    })
  }, [catalogo.posiciones, busqueda, filtroEstado])

  function actualizarPosicion(posicion: PosicionCobertura) {
    setCatalogo((actual) => ({
      ...actual,
      posiciones: actual.posiciones.map((item) =>
        item.id === posicion.id ? posicion : item,
      ),
    }))
    onActualizado()
  }

  async function guardarNueva() {
    if (!clienteId || !localId || !productoId) {
      setError("Selecciona cliente, local y SKU.")
      return
    }
    if (REQUIERE_MOTIVO.has(estado) && !motivo.trim()) {
      setError("Registra el motivo del estado seleccionado.")
      return
    }

    setGuardando("NUEVA")
    setError("")
    setMensaje("")
    try {
      await guardarCoberturaKpiKamDb({
        clienteId,
        localId,
        productoId,
        esObjetivo,
        estado,
        vigenteDesde: fechaVigencia,
        motivo: motivo.trim() || null,
      })
      setMensaje("Posición SKU-local guardada correctamente.")
      setMotivo("")
      await cargar()
      onActualizado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la posición.")
    } finally {
      setGuardando("")
    }
  }

  async function crearMatriz() {
    if (!clienteId) return
    const total = catalogo.locales.length * catalogo.productos.length
    const confirmar = window.confirm(
      `Se crearán como objetivo y estado Pendiente las combinaciones faltantes entre ${catalogo.locales.length} locales y ${catalogo.productos.length} SKU (máximo ${total} posiciones). Úsalo solo si todos los SKU autorizados deben estar en todos los locales. ¿Continuar?`,
    )
    if (!confirmar) return

    setGuardando("MATRIZ")
    setError("")
    setMensaje("")
    try {
      const creadas = await inicializarCoberturaKpiKamDb(clienteId, fechaVigencia)
      setMensaje(`${creadas} posiciones nuevas creadas como pendientes de validación.`)
      await cargar()
      onActualizado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la matriz.")
    } finally {
      setGuardando("")
    }
  }

  if (cargando && catalogo.clientes.length === 0) {
    return <div className="cob-carga">Cargando cobertura SKU-local…</div>
  }

  if (error && !catalogo.puede_configurar && !cargando) {
    return <div className="cob-error">{error}</div>
  }

  if (!catalogo.puede_configurar && !cargando) {
    return <div className="cob-bloqueada">Esta sección está disponible únicamente para Administrador y Gerente.</div>
  }

  return (
    <section className="cobertura-kam">
      <style>{css}</style>

      <header className="cob-head">
        <div>
          <span>COBERTURA COMERCIAL</span>
          <h2>Alcance SKU por local</h2>
          <p>Mide posiciones negociadas activas; no mide inventario ni abastecimiento.</p>
        </div>
        <label><span>Vigencia desde</span><input type="month" value={periodo} onChange={(event) => cambiarPeriodo(event.target.value)} /></label>
      </header>

      <section className="cob-filtros">
        <label><span>Cliente</span><select value={clienteId} onChange={(event) => setClienteId(event.target.value)}><option value="">Seleccionar cliente</option>{catalogo.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label>
        <div><span>Posiciones objetivo</span><strong>{resumen.objetivos}</strong></div>
        <div><span>Posiciones activas</span><strong>{resumen.activas}</strong></div>
        <div><span>Cobertura actual</span><strong className={resumen.porcentaje == null ? "neutral" : resumen.porcentaje >= 95 ? "positivo" : "negativo"}>{resumen.porcentaje == null ? "—" : `${resumen.porcentaje.toFixed(1)}%`}</strong></div>
      </section>

      {error && <div className="cob-error">{error}</div>}
      {mensaje && <div className="cob-exito">{mensaje}</div>}

      {!clienteId ? (
        <div className="cob-vacio">Selecciona un cliente para configurar sus posiciones local–SKU.</div>
      ) : (
        <>
          {(catalogo.locales.length === 0 || catalogo.productos.length === 0) && (
            <div className="cob-aviso">Este cliente necesita {catalogo.locales.length === 0 ? "locales activos" : "SKU autorizados"} en Administración antes de configurar cobertura.</div>
          )}

          <section className="cob-nueva">
            <header><div><span>NUEVA POSICIÓN</span><h3>Registrar local y SKU objetivo</h3></div><button type="button" className="secundario" disabled={Boolean(guardando) || catalogo.locales.length === 0 || catalogo.productos.length === 0} onClick={() => void crearMatriz()}>{guardando === "MATRIZ" ? "Creando…" : "Crear matriz completa"}</button></header>
            <div className="cob-nueva-grid">
              <label><span>Local</span><select value={localId} onChange={(event) => setLocalId(event.target.value)}><option value="">Seleccionar local</option>{catalogo.locales.map((local) => <option key={local.id} value={local.id}>{local.nombre}</option>)}</select></label>
              <label><span>SKU</span><select value={productoId} onChange={(event) => setProductoId(event.target.value)}><option value="">Seleccionar SKU</option>{catalogo.productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} · {producto.codigo}</option>)}</select></label>
              <label><span>Estado</span><select value={estado} onChange={(event) => setEstado(event.target.value as EstadoCoberturaKpiKamDb)}>{ESTADOS.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}</select></label>
              <label className="cob-check"><input type="checkbox" checked={esObjetivo} onChange={(event) => setEsObjetivo(event.target.checked)} /><span>Es posición objetivo</span></label>
              <label className="cob-motivo"><span>Motivo / observación</span><input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder={REQUIERE_MOTIVO.has(estado) ? "Obligatorio para este estado" : "Opcional"} /></label>
              <button type="button" disabled={Boolean(guardando) || !localId || !productoId} onClick={() => void guardarNueva()}>{guardando === "NUEVA" ? "Guardando…" : "Guardar posición"}</button>
            </div>
          </section>

          <section className="cob-listado">
            <header>
              <div><span>POSICIONES VIGENTES</span><h3>Detalle cliente → local → SKU</h3></div>
              <div className="cob-busqueda"><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar local o SKU" /><select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)}><option value="TODOS">Todos los estados</option>{ESTADOS.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}</select></div>
            </header>
            {catalogo.posiciones.length === 0 ? (
              <div className="cob-vacio">Todavía no existen posiciones para este cliente y periodo.</div>
            ) : (
              <div className="cob-tabla"><table><thead><tr><th>Local</th><th>SKU</th><th>Objetivo</th><th>Estado</th><th>Motivo</th><th>Desde</th><th /></tr></thead><tbody>{posicionesFiltradas.map((posicion) => <FilaCobertura key={posicion.id} posicion={posicion} fechaVigencia={fechaVigencia} bloqueada={Boolean(guardando)} onGuardando={setGuardando} onError={setError} onMensaje={setMensaje} onGuardado={actualizarPosicion} />)}</tbody></table></div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

function FilaCobertura({
  posicion,
  fechaVigencia,
  bloqueada,
  onGuardando,
  onError,
  onMensaje,
  onGuardado,
}: {
  posicion: PosicionCobertura
  fechaVigencia: string
  bloqueada: boolean
  onGuardando: (valor: string) => void
  onError: (valor: string) => void
  onMensaje: (valor: string) => void
  onGuardado: (posicion: PosicionCobertura) => void
}) {
  const [estado, setEstado] = useState(posicion.estado)
  const [esObjetivo, setEsObjetivo] = useState(posicion.es_objetivo)
  const [motivo, setMotivo] = useState(posicion.motivo ?? "")

  async function guardar() {
    if (REQUIERE_MOTIVO.has(estado) && !motivo.trim()) {
      onError("Registra el motivo del estado seleccionado.")
      return
    }
    onGuardando(posicion.id)
    onError("")
    onMensaje("")
    try {
      const id = await guardarCoberturaKpiKamDb({
        clienteId: posicion.cliente_id,
        localId: posicion.local_id,
        productoId: posicion.producto_id,
        esObjetivo,
        estado,
        vigenteDesde: fechaVigencia,
        motivo: motivo.trim() || null,
      })
      onGuardado({ ...posicion, id: id || posicion.id, es_objetivo: esObjetivo, estado, motivo: motivo.trim() || null, vigente_desde: fechaVigencia })
      onMensaje("Posición actualizada correctamente.")
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar la posición.")
    } finally {
      onGuardando("")
    }
  }

  return (
    <tr>
      <td data-label="Local"><strong>{posicion.local_nombre}</strong></td>
      <td data-label="SKU"><strong>{posicion.producto_nombre}</strong><small>{posicion.producto_codigo}</small></td>
      <td data-label="Objetivo"><input type="checkbox" checked={esObjetivo} onChange={(event) => setEsObjetivo(event.target.checked)} /></td>
      <td data-label="Estado"><select value={estado} onChange={(event) => setEstado(event.target.value as EstadoCoberturaKpiKamDb)}>{ESTADOS.map((item) => <option key={item.valor} value={item.valor}>{item.etiqueta}</option>)}</select></td>
      <td data-label="Motivo"><input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder={REQUIERE_MOTIVO.has(estado) ? "Obligatorio" : "Opcional"} /></td>
      <td data-label="Desde">{fechaCorta(posicion.vigente_desde)}</td>
      <td data-label="Acción"><button type="button" disabled={bloqueada} onClick={() => void guardar()}>Guardar</button></td>
    </tr>
  )
}

function fechaCorta(valor: string) {
  const [anio, mes, dia] = valor.slice(0, 10).split("-")
  return `${dia}/${mes}/${anio}`
}

const css = `
.cobertura-kam{display:grid;gap:14px}.cob-carga,.cob-bloqueada,.cob-vacio,.cob-error,.cob-exito,.cob-aviso{padding:18px;border:1px solid #e6dad4;border-radius:13px;background:white}.cob-error{color:#a1212a;background:#fff5f5;border-color:#edc8ca}.cob-exito{color:#147542;background:#eef9f2;border-color:#c6e7d2}.cob-aviso{color:#865b12;background:#fff6e7;border-color:#efd8b1}.cob-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:20px;border:1px solid #e6dad4;border-radius:14px;background:white}.cob-head>div>span,.cob-nueva header span,.cob-listado>header span{display:block;color:#f28c18;font-size:11px;font-weight:900;letter-spacing:.09em}.cob-head h2,.cob-nueva h3,.cob-listado h3{margin:4px 0;color:#8f1d24}.cob-head p{margin:0;color:#786b66}.cob-head label{display:grid;gap:5px;min-width:190px}.cob-head label>span,.cob-filtros label>span,.cob-filtros>div>span,.cob-nueva-grid label>span{font-size:10px;font-weight:900;text-transform:uppercase;color:#746660}.cobertura-kam input,.cobertura-kam select{border:1px solid #ddcfc8;border-radius:9px;background:#fbf9f7;padding:10px;color:#3b2d29;font-weight:700}.cobertura-kam button{border:0;border-radius:9px;background:#991f28;color:white;padding:10px 14px;font-weight:800;cursor:pointer}.cobertura-kam button.secundario{background:white;color:#8f1d24;border:1px solid #d9c7bf}.cobertura-kam button:disabled{opacity:.5;cursor:not-allowed}.cob-filtros{display:grid;grid-template-columns:minmax(260px,1.5fr) repeat(3,1fr);gap:10px;padding:13px;border:1px solid #e6dad4;border-radius:14px;background:white}.cob-filtros label{display:grid;gap:5px}.cob-filtros>div{display:flex;flex-direction:column;justify-content:center;padding-left:14px;border-left:1px solid #eadfd9}.cob-filtros strong{font-size:22px;color:#8f1d24}.cob-nueva,.cob-listado{border:1px solid #e6dad4;border-radius:14px;background:white;overflow:hidden}.cob-nueva>header,.cob-listado>header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:17px}.cob-nueva-grid{display:grid;grid-template-columns:1fr 1.2fr .8fr auto;gap:10px;align-items:end;padding:0 17px 17px}.cob-nueva-grid label{display:grid;gap:5px}.cob-check{display:flex!important;flex-direction:row;align-items:center;padding-bottom:11px}.cob-motivo{grid-column:1/-2}.cob-busqueda{display:flex;gap:8px}.cob-tabla{overflow:auto}.cob-tabla table{width:100%;min-width:1050px;border-collapse:collapse}.cob-tabla th{padding:10px 12px;background:#f7f3f0;text-align:left;color:#6f605b;font-size:10px;text-transform:uppercase}.cob-tabla td{padding:9px 12px;border-top:1px solid #eee4de}.cob-tabla td strong,.cob-tabla td small{display:block}.cob-tabla td small{color:#897b75}.cob-tabla td input:not([type=checkbox]){width:100%;min-width:180px}.cob-tabla td select{min-width:145px}.cob-tabla td:last-child{text-align:right}.cob-tabla input[type=checkbox]{width:18px;height:18px}.positivo{color:#148248!important}.negativo{color:#ad2630!important}.neutral{color:#857873!important}@media(max-width:900px){.cob-head,.cob-filtros,.cob-nueva-grid{display:grid;grid-template-columns:1fr}.cob-head label{min-width:0}.cob-filtros>div{border-left:0;padding-left:0}.cob-nueva>header,.cob-listado>header{align-items:stretch;display:grid}.cob-busqueda{display:grid}.cob-motivo{grid-column:auto}}
`
