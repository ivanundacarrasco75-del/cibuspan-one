import { useEffect, useRef, useState } from "react"
import { consultarArranqueOperativo, contextoBorradorArranque, obtenerCatalogoArranque, preverArranqueOperativo,
  aplicarArranqueOperativo, intentosArranquePendientes, resolverArranqueOperativo, informeArranqueOperativo } from "../../repositories/arranqueOperativoRepository"
import { crearBorradorArranque, leerBorradorArranque, sincronizarBorradorArranque, prepararConteosArranque, importarFilasArranque,
  numeroArranque, sumarDiaArranque, type BorradorArranque, type CatalogoArranque, type GrupoArranque, type VistaArranque,
  type EstadoArranque, type LoteBorradorArranque, type ResultadoArranque } from "../../utils/arranqueOperativo"
import { ArranqueNoAplicadoError, type IntentoArranque } from "../../utils/controlArranque"
import { leerFilasInventarioInicial, type ArticuloKardex } from "../../utils/inventarioInicialExcel"

const n = (v: number) => Number(v).toLocaleString("es-EC", { maximumFractionDigits: 6 })
function descargar(nombre: string, datos: unknown) { const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
type Preparado = { vista: VistaArranque; intento: IntentoArranque }
export default function ArranqueOperativo({ onEstado }: { onEstado: (s: EstadoArranque) => void }) {
  const [estado, setEstado] = useState<EstadoArranque | null>(null)
  const [catalogo, setCatalogo] = useState<CatalogoArranque | null>(null)
  const [borrador, setBorrador] = useState<BorradorArranque | null>(null)
  const [contexto, setContexto] = useState<{ usuarioId: string; clave: string } | null>(null)
  const [pendientes, setPendientes] = useState<IntentoArranque[]>([])
  const [preparado, setPreparado] = useState<Preparado | null>(null)
  const [resultado, setResultado] = useState<ResultadoArranque | null>(null)
  const [informe, setInforme] = useState<Record<string, unknown> | null>(null)
  const [grupo, setGrupo] = useState<GrupoArranque>("mp")
  const [buscar, setBuscar] = useState("")
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [editando, setEditando] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [errorLocal, setErrorLocal] = useState("")
  const [confirmaConteo, setConfirmaConteo] = useState(false)
  const [confirmaPedidos, setConfirmaPedidos] = useState(false)
  const [pedidoVisto, setPedidoVisto] = useState(false)
  const activo = useRef(true), accion = useRef(false), archivo = useRef<HTMLInputElement>(null), json = useRef<HTMLInputElement>(null)
  const bloqueado = ocupado || pendientes.length > 0 || !!resultado || !!estado?.aplicado
  function cambiar(d: BorradorArranque) { setBorrador(d); setPreparado(null); setConfirmaConteo(false); setConfirmaPedidos(false); setMensaje("") }
  async function cargar() {
    const e = await consultarArranqueOperativo()
    if (!activo.current) return
    setEstado(e); onEstado(e)
    if (!e.instalado || !e.puede_preparar) return
    const ctx = await contextoBorradorArranque(), intentos = await intentosArranquePendientes()
    if (!activo.current) return
    setContexto(ctx); setPendientes(intentos)
    if (e.aplicado) { const r = await informeArranqueOperativo(); if (activo.current) setInforme(r); return }
    const c = await obtenerCatalogoArranque()
    if (!activo.current) return
    setCatalogo(c)
    // No sobreescribe un borrador corrupto: se puede descargar y revisar primero.
    const previo = window.localStorage.getItem(ctx.clave)
    const d = previo ? sincronizarBorradorArranque(leerBorradorArranque(previo), c) : crearBorradorArranque(c)
    setBorrador(d)
  }
  useEffect(() => {
    activo.current = true; setOcupado(true)
    void cargar().catch(e => { if (activo.current) setError(e instanceof Error ? e.message : "No se pudo cargar el arranque.") }).finally(() => { if (activo.current) setOcupado(false) })
    return () => { activo.current = false }
  }, [])
  useEffect(() => {
    if (!borrador || !contexto || estado?.aplicado || resultado) return
    try { const s = JSON.stringify(borrador); window.localStorage.setItem(contexto.clave, s); if (window.localStorage.getItem(contexto.clave) !== s) throw new Error(); setErrorLocal("") }
    catch { setErrorLocal("No se pudo guardar el borrador en este navegador. Descárgalo para conservar tus conteos.") }
  }, [borrador, contexto, estado?.aplicado, resultado])
  async function actualizarCatalogo() {
    if (accion.current) return
    accion.current = true; setOcupado(true); setError("")
    try { const c = await obtenerCatalogoArranque(); setCatalogo(c); if (borrador) cambiar(sincronizarBorradorArranque(borrador, c)); setMensaje("Catálogo y referencias actualizados. Se conservaron los conteos; revisa artículos nuevos o pendientes.") }
    catch (e) { setError((e as Error).message) } finally { accion.current = false; setOcupado(false) }
  }
  async function reiniciarBorradorLocal() {
    if (!contexto || pendientes.length || accion.current || !window.confirm("¿Empezar un borrador vacío? Descarga primero el anterior si contiene conteos. Esto no cambia inventarios ni solicitudes del servidor.")) return
    accion.current = true; setOcupado(true)
    try { const c = await obtenerCatalogoArranque(); setCatalogo(c); cambiar(crearBorradorArranque(c)); setError("") }
    catch (e) { setError((e as Error).message) } finally { accion.current = false; setOcupado(false) }
  }
  function cambiarMp(id: string, cantidad: string) { if (borrador) cambiar({ ...borrador, mp: borrador.mp.map(a => a.id === id ? { ...a, cantidad } : a) }) }
  function cambiarGrupo(id: string, campos: Partial<BorradorArranque["pt"][number]>) {
    if (!borrador || grupo === "mp") return
    cambiar({ ...borrador, [grupo]: borrador[grupo].map(a => a.id === id ? { ...a, ...campos } : a) })
  }
  function cambiarLote(id: string, i: number, campos: Partial<LoteBorradorArranque>) {
    if (!borrador || grupo === "mp") return
    const a = borrador[grupo].find(a => a.id === id)!
    cambiarGrupo(id, { lotes: a.lotes.map((l, j) => j === i ? { ...l, ...campos } : l) })
  }
  function sinExistencias(id: string) {
    if (!borrador) return
    if (grupo === "mp") { cambiarMp(id, "0"); return }
    const a = borrador[grupo].find(a => a.id === id)!
    if ((Number(a.total) > 0 || a.lotes.some(l => Number(l.cantidad) > 0)) && !window.confirm("¿Declarar cero existencias físicas y retirar los lotes de este conteo?")) return
    cambiarGrupo(id, { total: "0", lotes: [] })
  }
  const pendiente = (id: string, g: GrupoArranque) => {
    if (!borrador) return true
    try {
      if (g === "mp") { const a = borrador.mp.find(a => a.id === id)!; numeroArranque(a.cantidad, a.unidad === "UNIDAD"); return false }
      const a = borrador[g].find(a => a.id === id)!, total = numeroArranque(a.total, true)
      if (a.lotes.some(l => !l.fecha_produccion || (g === "pt" && (!l.lote.trim() || !l.fecha_vencimiento)))) return true
      return a.lotes.reduce((s, l) => s + numeroArranque(l.cantidad, true), 0) !== total || a.lotes.some(l => numeroArranque(l.cantidad, true) <= 0)
    } catch { return true }
  }
  async function importar(f: File) {
    if (!borrador || !catalogo || accion.current) return
    accion.current = true; setOcupado(true); setError("")
    try {
      const [{ default: readExcel }, buffer] = await Promise.all([import("read-excel-file/browser"), f.arrayBuffer()])
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), b => b.toString(16).padStart(2, "0")).join("")
      const articulos: ArticuloKardex[] = (["mp", "pt"] as const).flatMap(g => catalogo[g].map(a => ({ tipo: g === "mp" ? "MATERIA_PRIMA" as const : "PRODUCTO_TERMINADO" as const,
        id: a.id, codigo: a.codigo, codigo_contable: a.codigo_contable ?? null, nombre: a.nombre, unidad: a.unidad, saldo: a.saldo, iniciado: true })))
      const hojas = await readExcel(f), filas: Parameters<typeof importarFilasArranque>[2] = [], omitidas: string[] = []
      for (const h of hojas) {
        try { filas.push(...leerFilasInventarioInicial(h.data, articulos).map(l => ({ ...l, problema: l.problema === "Costo total inválido" ? "" : l.problema, origen: `${h.sheet}:${l.fila}` }))) }
        catch (e) { omitidas.push(`${h.sheet}: ${(e as Error).message}`) }
      }
      if (!filas.length) throw new Error(omitidas.join("; ") || "No se encontraron artículos de inventario.")
      const fuente = `${f.name} · ${hash}`
      const d = importarFilasArranque(borrador, catalogo, filas, fuente)
      // Las hojas no leídas son incidencias visibles; no se ignoran silenciosamente.
      d.incidencias.push(...omitidas.map((m, i) => ({ clave: fuente + "|hoja:" + i, codigo: "", nombre: f.name, cantidad: null, motivo: m, decision: "" })))
      cambiar(d); setMensaje("Cantidades leídas sin sumarlas a stock. Completa las filas pendientes y los lotes reales de PT; semielaborados se cuentan aparte.")
    } catch (e) { setError((e as Error).message) }
    finally { accion.current = false; setOcupado(false); if (archivo.current) archivo.current.value = "" }
  }
  async function previsualizar() {
    if (!borrador || !catalogo || !contexto || accion.current || pendientes.length) return
    accion.current = true; setOcupado(true); setError(""); setMensaje("")
    try {
      const conteos = prepararConteosArranque(borrador, catalogo)
      const vista = await preverArranqueOperativo(borrador.inicio, conteos)
      setPreparado({ vista, intento: { version: 1, id: crypto.randomUUID(), usuarioId: contexto.usuarioId, inicio: borrador.inicio, conteos, token: vista.token, creadoEn: new Date().toISOString() } })
      setConfirmaConteo(false); setConfirmaPedidos(false)
      if (vista.bloqueos.length) setError(vista.bloqueos.join(" "))
    } catch (e) { setError((e as Error).message) } finally { accion.current = false; setOcupado(false) }
  }
  async function confirmado(r: ResultadoArranque) {
    setResultado(r); setPreparado(null); setMensaje(r.repetido ? "Se recuperó el corte ya aplicado, sin repetir ajustes." : "Arranque aplicado. El físico y el Kardex quedaron con el conteo confirmado.")
    try { const e = await consultarArranqueOperativo(); setEstado(e); onEstado(e); setInforme(await informeArranqueOperativo()); setPendientes(await intentosArranquePendientes()) }
    catch { setError("El arranque ya quedó aplicado. No se pudo refrescar su informe; vuelve a abrir esta pantalla.") }
  }
  async function aplicar() {
    if (!preparado || !confirmaConteo || !confirmaPedidos || !preparado.vista.puede_aplicar || accion.current || pendientes.length) return
    if (!window.confirm(`¿Aplicar el inventario contado al cierre del ${preparado.vista.fecha_cierre} para iniciar el ${preparado.vista.fecha_inicio}? Esta apertura se confirma una sola vez.`)) return
    accion.current = true; setOcupado(true); setError("")
    try { await confirmado(await aplicarArranqueOperativo(preparado.intento)) }
    catch (e) { setError((e as Error).message); if (e instanceof ArranqueNoAplicadoError) setPreparado(null); try { setPendientes(await intentosArranquePendientes()) } catch { /* conserva bloqueo y error */ } }
    finally { accion.current = false; setOcupado(false) }
  }
  async function recuperar(s: IntentoArranque, reintentar: boolean) {
    if (accion.current) return
    accion.current = true; setOcupado(true); setError("")
    try {
      const r = reintentar ? await aplicarArranqueOperativo(s) : await resolverArranqueOperativo(s)
      if (r.estado === "APLICADO") await confirmado(r)
      else { setPendientes(await intentosArranquePendientes()); setPreparado(null); setConfirmaConteo(false); setConfirmaPedidos(false); setMensaje("El intento quedó cerrado sin aplicar. Conservamos el borrador; actualiza la vista previa antes de volver a confirmar.") }
    } catch (e) { setError((e as Error).message); if (e instanceof ArranqueNoAplicadoError) setPreparado(null); try { setPendientes(await intentosArranquePendientes()) } catch { /* conserva el bloqueo del intento conocido */ } }
    finally { accion.current = false; setOcupado(false) }
  }
  const filasResumen = resultado?.resumen.lineas ?? ((informe?.resumen as { lineas?: ResultadoArranque["resumen"]["lineas"] } | undefined)?.lineas ?? [])
  return <section className="arranque-op">
    <style>{css}</style>
    <h2>Arranque con inventario físico</h2>
    <p>Prepara el conteo ahora y elige la fecha cuando esté listo. El inicio será hoy o mañana, con inventario al cierre del día anterior. Hasta confirmar, esta pantalla no cambia existencias.</p>
    {error && <p className="ao-error" role="alert">{error}</p>}{errorLocal && <p className="ao-error" role="alert">{errorLocal}</p>}{mensaje && <p className="ao-exito" role="status">{mensaje}</p>}
    {ocupado && <p role="status">Procesando…</p>}
    {!ocupado && error && !borrador && !estado?.aplicado && <div className="ao-acciones">
      <button onClick={() => { setOcupado(true); setError(""); void cargar().catch(e => setError(e.message)).finally(() => setOcupado(false)) }}>Volver a cargar</button>
      {contexto && <><button onClick={() => { try { const s = window.localStorage.getItem(contexto.clave); descargar("Borrador-arranque-para-revisar.json", { contenido: s }) } catch { setError("No se pudo leer el borrador del navegador.") } }}>Descargar borrador local para revisar</button>
        <button disabled={pendientes.length > 0} onClick={() => void reiniciarBorradorLocal()}>Empezar otro borrador vacío</button></>}
    </div>}
    {estado && !estado.instalado && <p>La actualización del arranque está pendiente de instalar. Solicita la actualización del sistema.</p>}
    {estado?.instalado && !estado.puede_preparar && !estado.aplicado && <p>Un administrador habilitado debe preparar y confirmar este inventario.</p>}
    {pendientes.length > 0 && <div className="ao-aviso"><h3>Hay un intento por comprobar</h3><p>No prepares otra aplicación hasta resolver su resultado. No borres el almacenamiento ni cambies de dispositivo para reintentar.</p>
      {pendientes.map(s => <div key={s.id}><span>Inicio {s.inicio}</span> <button disabled={ocupado || !estado?.puede_preparar} onClick={() => void recuperar(s, true)}>Reintentar el mismo corte</button> <button disabled={ocupado || !estado?.puede_preparar} onClick={() => void recuperar(s, false)}>Comprobar resultado</button></div>)}
    </div>}
    {(estado?.aplicado || resultado) ? <div>
      <h3>Arranque confirmado</h3><p>Inicio: {resultado?.fecha_inicio ?? estado?.fecha_inicio}. Cierre contado: {resultado?.fecha_cierre ?? estado?.fecha_cierre}. El historial previo se conserva como período no conciliado.</p>
      {estado?.puede_preparar && <button onClick={() => { if (informe) descargar(`Arranque-inventario-${estado?.fecha_inicio}.json`, informe); else void informeArranqueOperativo().then(r => descargar(`Arranque-inventario.json`, r)).catch(e => setError(e.message)) }}>Descargar informe y respaldo del corte</button>}
      {!!filasResumen.length && <div className="ao-tabla"><table><thead><tr><th>Grupo</th><th>Artículo</th><th>Anterior</th><th>Contado</th><th>Diferencia</th><th>Unidad</th></tr></thead><tbody>{filasResumen.map(l => <tr key={l.grupo + l.id}><td>{l.grupo.toUpperCase()}</td><td>{l.codigo} · {l.nombre}</td><td>{n(l.sistema)}</td><td>{n(l.conteo)}</td><td>{n(l.diferencia)}</td><td>{l.unidad}</td></tr>)}</tbody></table></div>}
    </div> : borrador && catalogo && <>
      <fieldset disabled={bloqueado}>
        <div className="ao-campos"><label>Fecha de inicio<input type="date" min={catalogo.hoy} max={sumarDiaArranque(catalogo.hoy)} value={borrador.inicio} onChange={e => cambiar({ ...borrador, inicio: e.target.value })} /></label>
          <label>Nota / responsable del conteo<textarea maxLength={2000} rows={2} value={borrador.nota} onChange={e => cambiar({ ...borrador, nota: e.target.value })} /></label></div>
        <p>Cuenta MP, empaques y micros inventariables en sus unidades de catálogo. PT y semielaborados se desglosan por lotes y fechas reales. Un campo vacío sigue pendiente; no es cero.</p>
        <div className="ao-acciones"><button onClick={() => void actualizarCatalogo()}>Actualizar catálogo conservando conteos</button><button onClick={() => archivo.current?.click()}>Leer Excel de MP y PT</button>
          <button onClick={() => descargar("Borrador-arranque.json", borrador)}>Descargar borrador</button><button onClick={() => json.current?.click()}>Cargar borrador guardado</button></div>
        <input hidden ref={archivo} type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) void importar(f) }} />
        <input hidden ref={json} type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; if (f) void f.text().then(s => cambiar(sincronizarBorradorArranque(leerBorradorArranque(s), catalogo))).catch(e => setError(e.message)); e.currentTarget.value = "" }} />
        <p>El Excel rellena cantidades; no suma existencias, no cambia costos y no inventa fechas de PT. Revisa el alcance y las bodegas del archivo. Los semielaborados se cuentan en su pestaña.</p>
        <nav className="ao-acciones">{(["mp", "pt", "semi"] as const).map(g => <button className={grupo === g ? "activo" : ""} key={g} onClick={() => setGrupo(g)}>{g === "mp" ? "MP / Empaques / Micros" : g === "pt" ? "Producto terminado" : "Semielaborados"} ({borrador[g].filter(a => pendiente(a.id, g)).length} pendientes)</button>)}</nav>
        <div className="ao-campos"><label>Buscar artículo<input value={buscar} onChange={e => setBuscar(e.target.value)} /></label><label className="ao-check"><input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />Sólo pendientes</label></div>
        {grupo === "mp" ? <div className="ao-tabla"><table><thead><tr><th>Artículo</th><th>Saldo en sistema</th><th>Conteo físico</th><th>Unidad</th><th /></tr></thead><tbody>
          {borrador.mp.filter(a => a.etiqueta.toLocaleLowerCase().includes(buscar.toLocaleLowerCase()) && (!soloPendientes || editando === a.id || pendiente(a.id, "mp"))).map(a => <tr key={a.id} onFocusCapture={() => setEditando(a.id)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setEditando("") }}><td>{a.etiqueta}</td><td>{n(catalogo.mp.find(x => x.id === a.id)?.saldo ?? 0)}</td><td><input aria-label={`Conteo ${a.etiqueta}`} inputMode="decimal" value={a.cantidad} onChange={e => cambiarMp(a.id, e.target.value)} /></td><td>{a.unidad}</td><td><button onClick={() => sinExistencias(a.id)}>Sin existencias (0)</button></td></tr>)}
        </tbody></table></div> : <div>
          {borrador[grupo].filter(a => a.etiqueta.toLocaleLowerCase().includes(buscar.toLocaleLowerCase()) && (!soloPendientes || editando === a.id || pendiente(a.id, grupo))).map(a => <div className="ao-articulo" key={a.id} onFocusCapture={() => setEditando(a.id)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setEditando("") }}>
            <h3>{a.etiqueta}</h3><div className="ao-acciones"><label>Total físico contado (Unid.)<input inputMode="numeric" value={a.total} onChange={e => cambiarGrupo(a.id, { total: e.target.value })} /></label><button onClick={() => sinExistencias(a.id)}>Sin existencias (0)</button><button onClick={() => { try { cambiarGrupo(a.id, { total: String(a.lotes.reduce((s, l) => s + numeroArranque(l.cantidad, true), 0)) }) } catch (e) { setError((e as Error).message) } }}>Usar suma de lotes</button></div>
            <p>Saldo en sistema: {n(catalogo[grupo].find(x => x.id === a.id)?.saldo ?? 0)} Unid. Los lotes de referencia no son cantidades ya verificadas.</p>
            <div className="ao-tabla"><table><thead><tr><th>{grupo === "pt" ? "Lote real" : "Referencia interna (puede estar vacía)"}</th><th>Producción real</th>{grupo === "pt" && <th>Vencimiento real</th>}<th>Conteo</th><th /></tr></thead><tbody>{a.lotes.map((l, i) => <tr key={i}><td><input aria-label={`Lote ${i + 1} ${a.etiqueta}`} value={grupo === "pt" ? l.lote : l.lote_interno} onChange={e => cambiarLote(a.id, i, grupo === "pt" ? { id: crypto.randomUUID(), lote: e.target.value } : { id: crypto.randomUUID(), lote_interno: e.target.value })} /></td>
              <td><input type="date" value={l.fecha_produccion} max={borrador.inicio ? sumarDiaArranque(borrador.inicio, -1) : catalogo.hoy} onChange={e => cambiarLote(a.id, i, { id: crypto.randomUUID(), fecha_produccion: e.target.value })} /></td>
              {grupo === "pt" && <td><input type="date" value={l.fecha_vencimiento} onChange={e => cambiarLote(a.id, i, { fecha_vencimiento: e.target.value })} /></td>}
              <td><input inputMode="numeric" aria-label={`Conteo lote ${i + 1} ${a.etiqueta}`} value={l.cantidad} onChange={e => cambiarLote(a.id, i, { cantidad: e.target.value })} /></td><td><button onClick={() => cambiarGrupo(a.id, { lotes: a.lotes.filter((_, n) => n !== i) })}>No existe / quitar fila</button></td></tr>)}</tbody></table></div>
            <div className="ao-acciones"><button onClick={() => cambiarGrupo(a.id, { lotes: [...a.lotes, { id: crypto.randomUUID(), cantidad: "", lote: "", lote_interno: "", fecha_produccion: "", fecha_vencimiento: "" }] })}>Agregar lote físico</button></div>
          </div>)}
        </div>}
        {!!borrador.incidencias.length && <section className="ao-aviso"><h3>Filas o cambios que requieren decisión</h3><p>Completa manualmente el catálogo/conteo o explica por qué una fila queda fuera del alcance. Un artículo con existencias reales debe estar incluido; no lo omitas por falta de vínculo.</p>
          {borrador.incidencias.map((i, k) => <label key={i.clave}>{i.codigo} · {i.nombre} · {i.cantidad === null ? "Cantidad sin verificar" : n(i.cantidad)}<p>{i.motivo}</p>
            <input aria-label={`Decisión ${i.codigo || k}`} placeholder="Cómo se resolvió o por qué se excluye (mínimo 5 caracteres)" value={i.decision} onChange={e => cambiar({ ...borrador, incidencias: borrador.incidencias.map((x, j) => j === k ? { ...x, decision: e.target.value } : x) })} /></label>)}
        </section>}
        <details open={pedidoVisto} onToggle={e => setPedidoVisto(e.currentTarget.open)}><summary>Revisar pedidos pendientes ({catalogo.pedidos_pendientes.length}) y reservas activas ({catalogo.reservas_activas})</summary>
          <p>Comprueba sus estados en Pedidos y libera reservas desde Despachos antes de aplicar. Esta pantalla no cambia estados ni borra pedidos.</p>
          <div className="ao-tabla"><table><thead><tr><th>Pedido</th><th>Entrega</th><th>Estado</th><th>Unidades</th></tr></thead><tbody>{catalogo.pedidos_pendientes.map(p => <tr key={p.id}><td>{p.numero_pedido_cliente || p.id}</td><td>{p.fecha_entrega}</td><td>{p.estado}</td><td>{n(p.total_unidades)}</td></tr>)}</tbody></table></div>
        </details>
        <button className="ao-principal" onClick={() => void previsualizar()}>Revisar vista previa del corte</button>
      </fieldset>
      {preparado && !pendientes.length && <section className="ao-vista"><h3>Vista previa: aún no se aplicó</h3><p>Inventario al cierre del {preparado.vista.fecha_cierre}. Operación desde el {preparado.vista.fecha_inicio}.</p>
        {preparado.vista.avisos.map((a, i) => <p className="ao-aviso" key={i}>{a}</p>)}{preparado.vista.bloqueos.map((a, i) => <p className="ao-error" key={i}>{a}</p>)}
        <div className="ao-tabla"><table><thead><tr><th>Grupo</th><th>Artículo</th><th>Físico sistema</th><th>Kardex anterior</th><th>Conteo</th><th>Diferencia física</th><th>Unidad</th></tr></thead><tbody>{preparado.vista.lineas.map(l => <tr key={l.grupo + l.id}><td>{l.grupo.toUpperCase()}</td><td>{l.codigo} · {l.nombre}</td><td>{n(l.sistema)}</td><td>{n(l.kardex)}</td><td>{n(l.conteo)}</td><td>{n(l.diferencia)}</td><td>{l.unidad}</td></tr>)}</tbody></table></div>
        <p>Se conservará el historial. Los lotes anteriores no declarados físicamente quedarán sin disponibilidad; las conversiones de semielaborados se conservan. Si el Kardex PT anterior no coincidía con el físico, se registra su diferencia residual sin volver a mover el stock.</p>
        <label className="ao-check"><input type="checkbox" checked={confirmaConteo} disabled={ocupado} onChange={e => setConfirmaConteo(e.target.checked)} />Confirmo el conteo completo, sus ceros explícitos, lotes, fechas y que no hay operaciones físicas sin registrar entre conteo y arranque.</label>
        <label className="ao-check"><input type="checkbox" checked={confirmaPedidos} disabled={ocupado} onChange={e => setConfirmaPedidos(e.target.checked)} />Revisé cuáles pedidos siguen realmente pendientes; las reservas anteriores están liberadas.</label>
        <button className="ao-principal" disabled={ocupado || !confirmaConteo || !confirmaPedidos || !preparado.vista.puede_aplicar || !!errorLocal} onClick={() => void aplicar()}>Aplicar inventario del arranque una sola vez</button>
      </section>}
    </>}
  </section>
}
const css = `.arranque-op{color:#263b33}.arranque-op fieldset{border:0;padding:0;margin:0;min-width:0}.arranque-op p{line-height:1.45}.arranque-op input:not([type=checkbox]),.arranque-op textarea{box-sizing:border-box;font:inherit;font-size:16px;min-height:38px;width:100%;padding:7px;border:1px solid #b5c7bd;border-radius:6px}.arranque-op input[type=checkbox]{width:auto}.arranque-op button{padding:9px 12px;border:1px solid #96ad9e;border-radius:7px;background:white;cursor:pointer}.arranque-op button:disabled{opacity:.5;cursor:default}.arranque-op .activo,.arranque-op .ao-principal{background:#245b40;color:white}.arranque-op .ao-principal{margin-top:14px}.ao-campos,.ao-acciones{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:12px 0}.ao-campos>label{flex:1;min-width:220px}.ao-check{display:flex;align-items:start;gap:9px;margin:14px 0}.ao-tabla{overflow:auto;margin:12px 0}.ao-tabla table{width:100%;min-width:650px;border-collapse:collapse}.ao-tabla th,.ao-tabla td{border-bottom:1px solid #d5dfd9;text-align:left;padding:8px}.ao-tabla input{min-width:100px}.ao-articulo,.ao-vista{border:1px solid #bbcfc0;border-radius:9px;padding:14px;margin:12px 0}.ao-error{background:#fff0ed;color:#8e2119;padding:12px;border-radius:6px}.ao-exito{background:#e8f7ec;padding:12px;border-radius:6px}.ao-aviso{background:#fff6df;padding:12px;border-radius:6px}.ao-aviso>label{display:block;margin-bottom:14px}.arranque-op details{margin-top:16px}.arranque-op summary{cursor:pointer;font-weight:600}`
