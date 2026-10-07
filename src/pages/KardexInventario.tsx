import { useEffect, useRef, useState } from "react"
import CrearArticuloInventario from "../components/inventario/CrearArticuloInventario"
import { catalogoKardex, consultarKardex, registrarMovimientoKardex, cargarInventarioInicial,
  consultarInicioOctubre, iniciarOctubre, descargarRespaldoInicio,
  type InicioOctubre, type ConsultaKardex, type LoteKardex, type LineaCargaInicial } from "../repositories/kardexRepository"
import { leerFilasInventarioInicial, validarLotesIniciales, movimientoParaConteo, unidadesCoinciden, crearLoteInicial, vencimientoInicial, actualizarCorteLotes, vincularArticulo,
  puedeOmitirSinExistencias, validarExclusionesInicio,
  type ArticuloKardex, type LineaInventarioInicial, type LoteInicial, type TipoInventario } from "../utils/inventarioInicialExcel"

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
const numero = (valor: number) => Number(valor).toLocaleString("es-EC", { maximumFractionDigits: 6 })
const clave = (a: ArticuloKardex) => `${a.tipo}:${a.id}`
type FilaRevision = LineaInventarioInicial & { hoja: string; incluir: boolean; lotes: LoteInicial[] }

export default function KardexInventario() {
  const [articulos, setArticulos] = useState<ArticuloKardex[]>([])
  const [lotes, setLotes] = useState<LoteKardex[]>([])
  const [tipo, setTipo] = useState<TipoInventario>("MATERIA_PRIMA")
  const [busqueda, setBusqueda] = useState("")
  const [seleccion, setSeleccion] = useState("")
  const [vista, setVista] = useState<"KARDEX" | "INICIAL">("KARDEX")
  const [desde, setDesde] = useState("2026-10-01")
  const [hasta, setHasta] = useState(hoy())
  const [consulta, setConsulta] = useState<ConsultaKardex | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [formulario, setFormulario] = useState(false)
  const [fecha, setFecha] = useState(hoy())
  const [clase, setClase] = useState("CONTEO")
  const [cantidad, setCantidad] = useState("")
  const [motivo, setMotivo] = useState("")
  const [documento, setDocumento] = useState("")
  const [loteId, setLoteId] = useState("")
  const [saldoEsperado, setSaldoEsperado] = useState<number | null>(null)
  const [solicitud, setSolicitud] = useState("")
  const [archivo, setArchivo] = useState("")
  const [hash, setHash] = useState("")
  const [corte, setCorte] = useState("2026-09-30")
  const [revision, setRevision] = useState<FilaRevision[]>([])
  const [unidadConfirmada, setUnidadConfirmada] = useState(false)
  const [confirmarCarga, setConfirmarCarga] = useState(false)
  const [altaFila, setAltaFila] = useState<number | null>(null)
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [inicio, setInicio] = useState<InicioOctubre | null>(null)
  const [reiniciar, setReiniciar] = useState(false)
  const peticion = useRef(0)
  const saldoPeticion = useRef(0)
  const archivoInput = useRef<HTMLInputElement>(null)
  const articulo = articulos.find((a) => clave(a) === seleccion)
  const lotesArticulo = lotes.filter((l) => l.producto_id === articulo?.id)
  const loteSeleccionado = lotesArticulo.find((l) => l.id === loteId)
  const incluidos = revision.filter((r) => r.incluir)
  const omitidos = revision.filter((r) => !r.incluir && puedeOmitirSinExistencias(r))
  const clavesIncluidas = incluidos.flatMap((r) => r.articulo ? [clave(r.articulo)] : [])
  const repetidos = new Set(clavesIncluidas.filter((valor, i) => clavesIncluidas.indexOf(valor) !== i))
  const problema = (r: FilaRevision) => !r.incluir && puedeOmitirSinExistencias(r) ? "" : (!Number.isFinite(r.cantidad) || r.cantidad < 0 ? "Cantidad inválida" : "") ||
    (r.problema === "Falta código" && r.articulo ? "" : r.problema) || (!r.articulo ? "Vincula o crea el artículo en el catálogo" :
    r.incluir && repetidos.has(clave(r.articulo)) ? "Artículo repetido: deja una fila con su saldo total" :
    r.unidadArchivo && !unidadesCoinciden(r.unidadArchivo, r.articulo.unidad) ? "La unidad del Excel no coincide con el catálogo" :
    r.articulo.iniciado && !reiniciar ? "Ya tiene saldo o movimientos; usa un ajuste" :
    r.articulo.tipo === "PRODUCTO_TERMINADO" ? (!Number.isInteger(r.cantidad) ? "PT requiere unidades enteras" : validarLotesIniciales(r.cantidad, r.lotes, corte)) : "")
  const errorInicio = reiniciar && (!inicio?.puede_iniciar || !inicio.token || corte !== "2026-09-30" ||
    Number(inicio.reservadas) !== 0 || !!validarExclusionesInicio(revision) ||
    !incluidos.some((r) => r.articulo?.tipo === "MATERIA_PRIMA") || !incluidos.some((r) => r.articulo?.tipo === "PRODUCTO_TERMINADO"))
  const errorCarga = errorInicio || incluidos.some((r) => !!problema(r)) || new Set(incluidos.map((r) => r.articulo && clave(r.articulo))).size !== incluidos.length

  async function cargarCatalogo() {
    const [datos, estado] = await Promise.all([catalogoKardex(), consultarInicioOctubre()])
    setArticulos(datos.articulos); setLotes(datos.lotes)
    setInicio(estado)
    if (estado.activo) { setReiniciar(false); setCorte("2026-09-30") }
    return datos
  }
  useEffect(() => { setCargando(true); void cargarCatalogo().catch((e) => setError(e.message)).finally(() => setCargando(false)) }, [])
  useEffect(() => {
    const id = ++peticion.current
    setConsulta(null); setFormulario(false); setError("")
    if (!articulo) return
    setCargando(true)
    void consultarKardex(articulo, desde, hasta).then((datos) => { if (id === peticion.current) setConsulta(datos) })
      .catch((e) => { if (id === peticion.current) setError(e.message) })
      .finally(() => { if (id === peticion.current) setCargando(false) })
  }, [seleccion, desde, hasta])
  useEffect(() => {
    const id = ++saldoPeticion.current
    setSaldoEsperado(null)
    if (!formulario || !articulo) return
    if (articulo.tipo === "PRODUCTO_TERMINADO") { setSaldoEsperado(loteSeleccionado?.cantidad ?? null); return }
    void consultarKardex(articulo, "", fecha).then((datos) => { if (id === saldoPeticion.current) setSaldoEsperado(datos.saldo_cierre) })
      .catch((e) => { if (id === saldoPeticion.current) setError(e.message) })
  }, [formulario, fecha, loteId, seleccion])

  async function actualizar() {
    if (guardando) return
    const id = ++peticion.current
    setCargando(true); setError("")
    try {
      await cargarCatalogo()
      const datos = articulo ? await consultarKardex(articulo, desde, hasta) : null
      if (id === peticion.current) { setConsulta(datos); setFormulario(false) }
    } catch (e) { if (id === peticion.current) setError((e as Error).message) }
    finally { if (id === peticion.current) setCargando(false) }
  }
  async function mas() {
    if (!articulo || !consulta) return
    const id = peticion.current
    setCargando(true)
    try {
      const datos = await consultarKardex(articulo, desde, hasta, consulta.movimientos.length)
      if (id === peticion.current) setConsulta({ ...datos, movimientos: [...consulta.movimientos, ...datos.movimientos] })
    } catch (e) { if (id === peticion.current) setError((e as Error).message) }
    finally { if (id === peticion.current) setCargando(false) }
  }
  function abrirMovimiento() {
    setMensaje(""); setError(""); setFecha(hoy()); setClase("CONTEO"); setCantidad(""); setMotivo(""); setDocumento("")
    setLoteId(lotesArticulo.length === 1 ? lotesArticulo[0].id : ""); setSolicitud(crypto.randomUUID()); setFormulario(true)
  }
  async function guardarMovimiento() {
    if (!articulo || saldoEsperado === null || guardando) return
    const valor = Number(cantidad)
    if (!cantidad.trim() || !Number.isFinite(valor) || valor < 0 || motivo.trim().length < 5) { setError("Revisa la cantidad y escribe un motivo de al menos 5 caracteres."); return }
    setGuardando(true); setError(""); setMensaje("")
    try {
      await registrarMovimientoKardex({ articulo, loteId, fecha, clase, cantidad: valor, saldoEsperado, motivo, documento, solicitudId: solicitud })
      setFormulario(false); setMensaje("Movimiento guardado en el Kardex.")
      await cargarCatalogo(); setConsulta(await consultarKardex(articulo, desde, hasta))
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }
  async function leerExcel(f: File) {
    setCargando(true); setError(""); setMensaje(""); setRevision([]); setHash(""); setConfirmarCarga(false); setUnidadConfirmada(false); setSoloPendientes(false)
    try {
      const [{ default: readExcel }, buffer] = await Promise.all([import("read-excel-file/browser"), f.arrayBuffer()])
      const digest = await crypto.subtle.digest("SHA-256", buffer)
      const hojas = await readExcel(f)
      const filas: FilaRevision[] = []
      const omitidas: string[] = []
      for (const hoja of hojas) {
        try {
          const leidas = leerFilasInventarioInicial(hoja.data, articulos)
          filas.push(...leidas.map((r) => ({ ...r, hoja: hoja.sheet, incluir: true,
            lotes: r.articulo?.tipo === "PRODUCTO_TERMINADO" && r.cantidad > 0 ? [crearLoteInicial(r.articulo, r.cantidad, corte)] : [] })))
        } catch (e) { omitidas.push(`${hoja.sheet}: ${(e as Error).message}`) }
      }
      if (!filas.length) throw new Error(omitidas.join("; ") || "No se encontraron artículos.")
      setArchivo(f.name); setHash(Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")); setRevision(filas)
      if (omitidas.length) setMensaje(`Hojas sin tabla de inventario: ${omitidas.join("; ")}`)
    } catch (e) { setError((e as Error).message) } finally { setCargando(false); if (archivoInput.current) archivoInput.current.value = "" }
  }
  function cambiarFila(index: number, cambios: Partial<FilaRevision>) {
    setRevision((actual) => actual.map((r, i) => i === index ? { ...r, ...cambios } : r)); setConfirmarCarga(false)
  }
  async function vincularAlta(nuevo: { id: string; tipo: TipoInventario }) {
    const datos = await cargarCatalogo()
    const creado = datos.articulos.find((a) => a.id === nuevo.id && a.tipo === nuevo.tipo)
    if (!creado) throw new Error("El artículo se guardó, pero no está disponible para tu acceso al Kardex. Revisa sus permisos antes de continuar.")
    setRevision((filas) => filas.map((r, i) => {
      if (r.articulo) return r
      const a = i === altaFila ? creado : vincularArticulo(r.codigo, datos.articulos)
      return a ? { ...r, articulo: a, lotes: a.tipo === "PRODUCTO_TERMINADO" && r.cantidad > 0 ? [crearLoteInicial(a, r.cantidad, corte)] : [] } : r
    }))
    setAltaFila(null); setConfirmarCarga(false); setMensaje("Artículo disponible y vinculado. El stock se guardará al confirmar la carga.")
  }
  async function cargarInicial() {
    if (guardando || errorCarga || !unidadConfirmada || !incluidos.length || !confirmarCarga) return
    setGuardando(true); setError(""); setMensaje("")
    try {
      const lineas: LineaCargaInicial[] = incluidos.map((r) => ({ tipo: r.articulo!.tipo, articulo_id: r.articulo!.id, cantidad: r.cantidad,
        costo_total: r.costoTotal, lotes: r.lotes.map((l) => ({ cantidad: l.cantidad, lote: l.lote, fecha_produccion: l.fechaProduccion, fecha_vencimiento: l.fechaVencimiento })) }))
      const resultado = reiniciar ? await iniciarOctubre(archivo, hash, corte, lineas, inicio!.token!) : await cargarInventarioInicial(archivo, hash, corte, lineas)
      setRevision([]); setConfirmarCarga(false); setReiniciar(false)
      ++peticion.current; setConsulta(null); setSeleccion(""); setFormulario(false)
      setMensaje(resultado.repetido ? "La carga ya estaba confirmada; no se duplicaron existencias." : reiniciar ?
        "Octubre iniciado. El Excel es el único saldo inicial; el inventario anterior quedó respaldado. Ahora registra los movimientos desde el 01/10." :
        "Saldos iniciales registrados. Ya puedes revisar cada artículo en el Kardex.")
      await cargarCatalogo()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }

  return <div className="kardex">
    {altaFila !== null && revision[altaFila] && <CrearArticuloInventario fila={revision[altaFila]} onVinculado={vincularAlta} onCerrar={() => setAltaFila(null)} />}
    <style>{css}</style><header><div><small>INVENTARIO Y BODEGA</small><h1>Kardex</h1><p>Saldo inicial, entradas, salidas y ajustes por artículo.</p></div>
      <button disabled={guardando || cargando} onClick={() => void actualizar()}>Actualizar</button></header>
    <nav><button disabled={guardando} className={vista === "KARDEX" ? "activo" : ""} onClick={() => setVista("KARDEX")}>Revisar artículos</button>
      <button disabled={guardando} className={vista === "INICIAL" ? "activo" : ""} onClick={() => setVista("INICIAL")}>Cargar saldo inicial</button></nav>
    {error && <p role="alert" className="error">{error}</p>}{mensaje && <p role="status" className="exito">{mensaje}</p>}
    {inicio?.activo && <section><p>Inicio operativo: 01/10/2026 · Saldo inicial: 30/09/2026. Inventario en reconstrucción: el saldo será provisional mientras completas los movimientos de octubre.</p>
      {inicio.puede_descargar && <button disabled={guardando} onClick={() => void descargarRespaldoInicio(inicio.respaldo_id!).catch((e) => setError(e.message))}>Descargar respaldo anterior</button>}</section>}
    {vista === "INICIAL" ? <section><h2>Un Excel para ambos inventarios</h2>
      <p>Los artículos se vinculan automáticamente por código. Revisa las filas pendientes, las sucursales y las unidades.</p>
      <p>Para producto terminado se genera un lote de referencia y se usa el cierre como fecha de producción estimada. El vencimiento se calcula con la vida útil del SKU en el catálogo. Puedes corregir las fechas y dividir la cantidad entre lotes.</p>
      <p>La carga habitual añade saldos y bloquea artículos con movimientos. La opción de inicio de octubre respalda y sustituye el inventario anterior. La carga no sustituye la importación de costos de Compras.</p>
      {!inicio?.activo && <div className="confirmacion"><h3>Empezar desde octubre</h3>
        <p>El Excel del 30/09 será el único saldo inicial de MP y PT. Debes incluir todos los artículos con existencias; puedes omitir los que tienen saldo cero y ya no usas. Se respaldarán los lotes y movimientos anteriores. Los artículos fuera de la carga quedarán sin existencias anteriores. Pedidos, despachos, fórmulas y catálogos se conservan.</p>
        {inicio?.instalado === false ? <p className="pendiente">Instala la actualización de inicio de octubre en la base de datos para habilitar esta opción.</p> :
          inicio?.puede_iniciar ? <><p>Se archivarán {inicio.lotes} lotes y {inicio.movimientos} movimientos. Un reinicio confirmado no se puede repetir con otro archivo.</p>
            {!!Number(inicio.reservadas) && <p className="pendiente">Hay {numero(Number(inicio.reservadas))} unidades reservadas. Libera las reservas desde los pedidos y pulsa Actualizar.</p>}
            <label className="check"><input type="checkbox" checked={reiniciar} disabled={guardando || cargando || !!Number(inicio.reservadas)} onChange={(e) => {
              setReiniciar(e.target.checked); setConfirmarCarga(false); setUnidadConfirmada(false)
              if (e.target.checked) {
                setCorte("2026-09-30"); setRevision((filas) => filas.map((r) => ({ ...r, incluir: true, lotes: actualizarCorteLotes(r.lotes, r.articulo, "2026-09-30") })))
              }
            }} />Usar este Excel para iniciar octubre y respaldar el inventario anterior.</label></> : <p>Esta operación está disponible para un administrador.</p>}
      </div>}
      <div className="campos"><label>Fecha del cierre<input type="date" max={hoy()} value={corte} disabled={guardando || reiniciar || inicio?.activo} onChange={(e) => {
        const fechaCorte = e.target.value; setCorte(fechaCorte); setConfirmarCarga(false)
        setRevision((filas) => filas.map((r) => ({ ...r, lotes: actualizarCorteLotes(r.lotes, r.articulo, fechaCorte) })))
      }} /></label>
        <label>Excel de inventario<input ref={archivoInput} type="file" accept=".xlsx" disabled={cargando || guardando || !articulos.length} onChange={(e) => { const f = e.target.files?.[0]; if (f) void leerExcel(f) }} /></label></div>
      {cargando && <p>Cargando…</p>}
      {!!revision.length && <><p>{archivo} · {incluidos.length} filas seleccionadas. {reiniciar ? "Solo puedes omitir artículos sin existencias ni costo pendiente." : "Desmarca filas de otras sucursales; no se excluyen silenciosamente."}</p>
        {!!omitidos.length && <div className="confirmacion"><p>{omitidos.length} artículos omitidos con existencia cero:</p>
          {revision.map((r, i) => !r.incluir && puedeOmitirSinExistencias(r) ? <div key={i}>{r.codigo || "Sin código"} · {r.nombre}
            <button disabled={guardando} onClick={() => cambiarFila(i, { incluir: true })}>Volver a incluir</button></div> : null)}</div>}
        <label className="check"><input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />Mostrar solo pendientes ({revision.filter((r) => !!problema(r)).length})</label>
        <div className="tabla"><table><thead><tr><th>Cargar</th><th>Hoja / fila / sucursal</th><th>Artículo del Excel</th><th>Stock</th><th>Artículo vinculado / unidad</th><th>Revisión</th></tr></thead>
          <tbody>{revision.map((r, i) => soloPendientes && !problema(r) ? null : <tr key={i}><td><input aria-label={`Incluir fila ${r.fila} de ${r.hoja}`} type="checkbox" checked={r.incluir} disabled={guardando || (reiniciar && !puedeOmitirSinExistencias(r))} onChange={(e) => cambiarFila(i, { incluir: e.target.checked })} /></td>
            <td>{r.hoja} / {r.fila}<small>{r.sucursal || "Sin sucursal"}</small></td><td>{r.codigo || "Sin código"}<small>{r.nombre}</small></td><td>{Number.isFinite(r.cantidad) ? numero(r.cantidad) : "Sin cantidad válida"}<small>{r.unidadArchivo || "Unidad no indicada"}</small></td>
            <td><select disabled={guardando} value={r.articulo ? clave(r.articulo) : ""} onChange={(e) => {
              const a = articulos.find((item) => clave(item) === e.target.value) || null
              cambiarFila(i, { articulo: a, lotes: a?.tipo === "PRODUCTO_TERMINADO" && r.cantidad > 0 ? [crearLoteInicial(a, r.cantidad, corte)] : [] })
            }}><option value="">Elegir artículo…</option>{articulos.map((a) => <option key={clave(a)} value={clave(a)}>{a.tipo === "PRODUCTO_TERMINADO" ? "PT" : "MP/Empaque"} · {a.codigo} · {a.nombre} · {a.unidad}</option>)}</select>
              {!r.articulo && <button disabled={guardando || cargando} onClick={() => { setAltaFila(i); setConfirmarCarga(false) }}>Crear artículo</button>}
              {r.articulo?.tipo === "PRODUCTO_TERMINADO" && r.cantidad > 0 && <div className="lotes">{r.lotes.map((l, li) => <div className="lote" key={li}>
                <label>Cantidad<input type="number" min="1" step="1" value={l.cantidad} disabled={guardando} onChange={(e) => cambiarFila(i, { lotes: r.lotes.map((v, j) => j === li ? { ...v, cantidad: Number(e.target.value) } : v) })} /></label>
                <label>Lote<input value={l.lote} disabled={guardando} onChange={(e) => cambiarFila(i, { lotes: r.lotes.map((v, j) => j === li ? { ...v, lote: e.target.value, automatico: false } : v) })} /></label>
                <label>Producción<input type="date" max={corte} value={l.fechaProduccion} disabled={guardando} onChange={(e) => cambiarFila(i, { lotes: r.lotes.map((v, j) => j === li ? { ...v, fechaProduccion: e.target.value,
                  fechaVencimiento: vencimientoInicial(e.target.value, r.articulo?.vida_util_dias), automatico: false } : v) })} /></label>
                <label>Vencimiento<input type="date" value={l.fechaVencimiento} disabled={guardando} onChange={(e) => cambiarFila(i, { lotes: r.lotes.map((v, j) => j === li ? { ...v, fechaVencimiento: e.target.value, automatico: false } : v) })} /></label>
                <button disabled={guardando} onClick={() => cambiarFila(i, { lotes: r.lotes.filter((_, j) => j !== li) })}>Quitar lote</button>
              </div>)}<small>{r.articulo.vida_util_dias ? `Vida útil del catálogo: ${r.articulo.vida_util_dias} días.` : "Sin vida útil configurada: completa el vencimiento o corrige el catálogo."} Los lotes INICIAL-EST son referencias de la carga inicial.</small>
                <button disabled={guardando} onClick={() => cambiarFila(i, { lotes: [...r.lotes, crearLoteInicial(r.articulo!, 0, corte,
                  Math.max(0, ...r.lotes.map((l) => Number(l.lote.split("-").at(-1)) || 0)) + 1)] })}>Añadir lote</button></div>}
            </td><td className={problema(r) ? "pendiente" : ""}>{!r.incluir && puedeOmitirSinExistencias(r) ? "Omitido: sin existencias" : problema(r) || "Listo"}
              {r.incluir && puedeOmitirSinExistencias(r) && <button disabled={guardando} onClick={() => cambiarFila(i, { incluir: false })}>Omitir sin existencias</button>}
            </td></tr>)}</tbody></table></div>
        {errorCarga && <p className="pendiente">Completa las filas seleccionadas. Cada artículo debe aparecer una sola vez, con su saldo total.</p>}
        <label className="check"><input type="checkbox" checked={unidadConfirmada} disabled={guardando} onChange={(e) => { setUnidadConfirmada(e.target.checked); setConfirmarCarga(false) }} />Revisé las sucursales y las cantidades están en la unidad indicada para cada artículo.</label>
        {confirmarCarga ? <div className="confirmacion"><p>{reiniciar ? `Se respaldará y sustituirá el inventario anterior por las ${incluidos.length} filas seleccionadas al 30/09/2026. Se omiten ${omitidos.length} artículos con existencia cero. Después solo sumarán los movimientos que registres desde el 01/10.` : `Se registrarán ${incluidos.length} saldos al cierre del ${corte}. Las filas desmarcadas quedan fuera de la carga.`}</p>
          <button className="principal" disabled={guardando || errorCarga || !unidadConfirmada} onClick={() => void cargarInicial()}>{guardando ? "Guardando…" : reiniciar ? "Confirmar inicio de octubre" : "Confirmar carga"}</button>
          <button disabled={guardando} onClick={() => setConfirmarCarga(false)}>Volver a revisar</button></div> :
          <button className="principal" disabled={errorCarga || !incluidos.length || !unidadConfirmada || !corte || guardando} onClick={() => setConfirmarCarga(true)}>{reiniciar ? "Revisar inicio de octubre" : "Revisar y cargar saldos"}</button>}
      </>}
    </section> : <>
      <section><div className="campos"><label>Inventario<select disabled={guardando} value={tipo} onChange={(e) => { setTipo(e.target.value as TipoInventario); setSeleccion(""); setFormulario(false) }}>
        <option value="MATERIA_PRIMA">Materias primas y empaques</option><option value="PRODUCTO_TERMINADO">Producto terminado</option></select></label>
        <label>Buscar<input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código o nombre" /></label>
        <label>Artículo<select value={seleccion} disabled={guardando} onChange={(e) => setSeleccion(e.target.value)}><option value="">Elegir…</option>
          {articulos.filter((a) => a.tipo === tipo && `${a.codigo} ${a.nombre}`.toLowerCase().includes(busqueda.toLowerCase())).map((a) => <option value={clave(a)} key={clave(a)}>{a.codigo} · {a.nombre}</option>)}</select></label>
        <label>Desde<input type="date" value={desde} disabled={guardando} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="date" value={hasta} disabled={guardando} onChange={(e) => setHasta(e.target.value)} /></label></div></section>
      {articulo && <section><h2>{articulo.nombre}</h2><div className="saldos"><span>Stock actual: {numero(articulo.saldo)} {articulo.unidad}</span>
        {consulta && <><span>Antes del rango: {numero(consulta.saldo_anterior)}</span><span>Al cierre del rango: {numero(consulta.saldo_cierre)}</span></>}</div>
        {!articulo.iniciado && <p className="pendiente">Este artículo todavía no tiene saldo inicial en el Kardex.</p>}
        <p>{inicio?.activo ? "El stock parte exclusivamente del Excel al 30/09 y de los movimientos registrados después." : "Los saldos existentes de PT se registran desde la activación del Kardex."} Las órdenes históricas y los consumos por receta todavía no generan movimientos de materias primas automáticamente.</p>
        <button className="principal" disabled={cargando || guardando || !articulo.iniciado} onClick={abrirMovimiento}>Registrar entrada, salida o conteo</button>
        {formulario && <div className="movimiento"><h3>Nuevo movimiento · {articulo.unidad}</h3><div className="campos">
          {articulo.tipo === "PRODUCTO_TERMINADO" && <label>Lote<select value={loteId} disabled={guardando} onChange={(e) => setLoteId(e.target.value)}><option value="">Elegir lote…</option>
            {lotesArticulo.map((l) => <option key={l.id} value={l.id}>{l.lote} · {l.fecha_produccion} · Stock {numero(l.cantidad)} · Reservado {numero(l.reservado)}</option>)}</select></label>}
          <label>Fecha<input type="date" max={hoy()} value={fecha} disabled={guardando || articulo.tipo === "PRODUCTO_TERMINADO"} onChange={(e) => setFecha(e.target.value)} /></label>
          <label>Tipo<select value={clase} disabled={guardando} onChange={(e) => setClase(e.target.value)}><option value="CONTEO">Conteo físico / ajuste</option><option value="ENTRADA">Entrada</option><option value="SALIDA">Salida</option></select></label>
          <label>{clase === "CONTEO" ? "Cantidad contada" : "Cantidad del movimiento"}<input type="number" min="0" step={articulo.unidad === "KG" ? "0.000001" : "1"} value={cantidad} disabled={guardando} onChange={(e) => setCantidad(e.target.value)} /></label>
          <label>Documento / OP / factura<input maxLength={200} value={documento} disabled={guardando} onChange={(e) => setDocumento(e.target.value)} /></label>
          <label>Motivo obligatorio<input maxLength={500} value={motivo} disabled={guardando} onChange={(e) => setMotivo(e.target.value)} placeholder="Compra, consumo OP, merma, diferencia de conteo…" /></label>
        </div><p>Saldo a la fecha{articulo.tipo === "PRODUCTO_TERMINADO" ? " del lote" : ""}: {saldoEsperado === null ? "Consultando…" : numero(saldoEsperado)}
          {clase === "CONTEO" && cantidad.trim() && Number.isFinite(Number(cantidad)) && Number(cantidad) >= 0 && saldoEsperado !== null && ` · Ajuste: ${numero(movimientoParaConteo(saldoEsperado, Number(cantidad)))}`}</p>
          <button className="principal" disabled={guardando || saldoEsperado === null || !cantidad.trim() || motivo.trim().length < 5} onClick={() => void guardarMovimiento()}>{guardando ? "Guardando…" : "Guardar movimiento"}</button>
          <button disabled={guardando} onClick={() => { setFormulario(false); setError("") }}>Salir sin guardar</button>
        </div>}
        {cargando && <p>Cargando…</p>}{consulta && <><div className="tabla"><table><thead><tr><th>Fecha</th><th>Tipo / lote</th><th>Entrada</th><th>Salida</th><th>Saldo</th><th>Motivo / documento</th><th>Responsable / registro</th></tr></thead>
          <tbody>{consulta.movimientos.map((m) => <tr key={m.id}><td>{m.fecha}</td><td>{m.clase.replaceAll("_", " ")}<small>{m.lote}</small></td><td>{m.cantidad > 0 ? numero(m.cantidad) : "—"}</td>
            <td>{m.cantidad < 0 ? numero(-m.cantidad) : "—"}</td><td>{numero(m.saldo)}</td><td>{m.motivo}<small>{m.documento}</small></td><td>{m.responsable}<small>{new Date(m.creado_en).toLocaleString("es-EC")}</small></td></tr>)}</tbody></table></div>
          {!consulta.total && <p>No hay movimientos en este rango.</p>}{consulta.movimientos.length < consulta.total && <button disabled={cargando} onClick={() => void mas()}>Cargar más ({consulta.movimientos.length}/{consulta.total})</button>}</>}
      </section>}
    </>}
  </div>
}

const css = `
.kardex dialog.alta-inventario{border:1px solid #d2c4bd;border-radius:12px;padding:22px;max-width:800px;width:calc(100% - 64px);max-height:80vh;overflow:auto;color:#403330}.kardex dialog.alta-inventario::backdrop{background:rgb(0 0 0 / 40%)}.kardex{padding:22px;max-width:1600px;margin:auto;color:#403330}.kardex header{display:flex;justify-content:space-between;align-items:center;gap:16px}.kardex h1{margin:4px 0;color:#8f1d24}.kardex h2{font-size:19px}.kardex small{display:block;font-size:11px;color:#796d67;margin-top:4px}.kardex p{font-size:13px;line-height:1.5}.kardex nav{display:flex;gap:8px;margin:16px 0}.kardex section{background:white;border:1px solid #e5dcd6;border-radius:12px;padding:20px;margin:15px 0}.kardex button{border:1px solid #c9b5ab;border-radius:7px;background:#fff;padding:10px 14px;color:#68151a;cursor:pointer;margin:4px}.kardex button.principal,.kardex button.activo{background:#8f1d24;color:white;border-color:#8f1d24}.kardex button:disabled{opacity:.5;cursor:default}.kardex .campos{display:flex;flex-wrap:wrap;gap:14px}.kardex label{display:flex;flex-direction:column;gap:6px;font-size:12px}.kardex input,.kardex select{border:1px solid #d2c4bd;border-radius:6px;padding:9px;max-width:100%;background:white;color:#403330}.kardex .campos input,.kardex .campos select{max-width:360px}.kardex .tabla{overflow:auto;margin:16px 0}.kardex table{width:100%;border-collapse:collapse;min-width:900px;font-size:12px}.kardex th,.kardex td{padding:10px;border-bottom:1px solid #eee4dd;vertical-align:top;text-align:left}.kardex th{background:#f6eee8}.kardex .error{background:#fdebea;color:#9c242b;padding:12px;border-radius:8px}.kardex .exito{background:#e8f6eb;color:#176833;padding:12px;border-radius:8px}.kardex .pendiente{color:#95590b}.kardex .check{flex-direction:row;align-items:center;margin:18px 0}.kardex .check input{width:18px;height:18px}.kardex .lotes{min-width:520px;margin-top:10px}.kardex .lote{display:flex;align-items:end;gap:8px;background:#faf7f3;padding:10px;margin:5px 0}.kardex .lote input{width:115px}.kardex .lote label:first-child input{width:70px}.kardex .movimiento,.kardex .confirmacion{padding:15px;background:#faf5ef;border:1px solid #e6d5c5;border-radius:8px;margin:15px 0}.kardex .saldos{display:flex;flex-wrap:wrap;gap:12px}.kardex .saldos span{background:#f6eee8;border-radius:8px;padding:12px;font-size:14px}@media(max-width:650px){.kardex{padding:12px}.kardex section{padding:12px}.kardex .campos{display:grid;grid-template-columns:1fr 1fr}.kardex .campos input,.kardex .campos select{width:100%;box-sizing:border-box}.kardex header{align-items:start}.kardex nav button{flex:1}.kardex .saldos span{width:100%}}
`
