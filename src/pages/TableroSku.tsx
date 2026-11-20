import { useEffect, useMemo, useState } from "react"
import { obtenerTableroSku } from "../repositories/tableroSkuRepository"
import { resumirTableroSku, type DatosTableroSku } from "../utils/tableroSku"
import { fechaHoyCampoDashboard } from "../utils/dashboardVisitasRotacion"
import "./TableroSku.css"

const entero = (valor: number) => valor.toLocaleString("es-EC", { maximumFractionDigits: 1 })
const dinero = (valor: number) => valor.toLocaleString("es-EC", { style: "currency", currency: "USD" })
const porcentaje = (valor: number | null) => valor === null ? "—" : `${entero(valor)} %`
const VACIO: DatosTableroSku = {
  productos: [], clientes: [], asignaciones: [], ventas: null, devoluciones: null, visitas: null, costos: null, errores: [],
}
type ItemRanking = { id: string; nombre: string; detalle: string; valor: number; productoId?: string }

function Ranking({ titulo, unidad, items, vacio, alElegir, inverso = false }: {
  titulo: string; unidad: string; items: ItemRanking[]; vacio: string
  alElegir: (id: string) => void; inverso?: boolean
}) {
  const cinco = [...items].sort((a, b) => (inverso ? a.valor - b.valor : b.valor - a.valor) || a.nombre.localeCompare(b.nombre)).slice(0, 5)
  const maximo = Math.max(1, ...cinco.map((i) => Math.abs(i.valor)))
  return <section className="sku-ranking">
    <header><h3>{titulo}</h3><span>{unidad}</span></header>
    {!cinco.length && <p className="sku-vacio">{vacio}</p>}
    <ol>{cinco.map((item) => <li key={item.id}>
      <button type="button" disabled={!item.productoId} onClick={() => item.productoId && alElegir(item.productoId)}>
        <span className="sku-ranking-texto"><strong>{item.nombre}</strong><small>{item.detalle}</small></span>
        <b className={item.valor < 0 ? "sku-negativo" : ""}>{unidad === "USD" ? dinero(item.valor) : entero(item.valor)}</b>
      </button>
      <div className="sku-track" aria-hidden="true"><i style={{ width: `${Math.abs(item.valor) / maximo * 100}%` }} /></div>
    </li>)}</ol>
  </section>
}

export default function TableroSku({ cambiarPantalla }: { cambiarPantalla: (pantalla: string) => void }) {
  const [hoy] = useState(fechaHoyCampoDashboard)
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const [cliente, setCliente] = useState("")
  const [sku, setSku] = useState("")
  const [datos, setDatos] = useState(VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const valido = !!desde && !!hasta && desde <= hasta && hasta <= hoy
  useEffect(() => {
    let vigente = true
    if (!valido) { setCargando(false); return }
    setCargando(true); setError("")
    void obtenerTableroSku(desde, hasta).then((respuesta) => {
      if (vigente) setDatos(respuesta)
    }).catch((e) => { if (vigente) setError(e instanceof Error ? e.message : "No se pudo cargar el tablero.") })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [desde, hasta, revision, valido])
  const resumen = useMemo(() => resumirTableroSku(datos, cliente, sku), [datos, cliente, sku])
  const opciones = useMemo(() => {
    const ids = new Set(datos.asignaciones.filter((a) => !cliente || a.cliente_id === cliente).map((a) => a.producto_id))
    return datos.productos.filter((p) => ids.has(p.id))
  }, [datos, cliente])
  const { filas, rotaciones, locales } = resumen
  const venta = filas.reduce((s, f) => s + f.venta, 0)
  const unidades = filas.reduce((s, f) => s + f.unidades, 0)
  const devueltas = filas.reduce((s, f) => s + f.devueltas, 0)
  const netoCompleto = datos.ventas !== null && datos.devoluciones !== null && filas.every((f) => f.neto !== null)
  const aporteCompleto = netoCompleto && datos.costos !== null && filas.every((f) => f.aporte !== null)
  const nombre = (f: typeof filas[number]) => f.corto || f.nombre
  const comunes = filas.map((f) => ({ id: f.id, productoId: f.id, nombre: nombre(f), detalle: f.codigo }))
  const sinVentas = filas.filter((f) => f.unidades === 0 && f.venta === 0)
  const faltanValores = filas.reduce((s, f) => s + f.devolucionesSinValor, 0)
  const disponibilidad = (fuente: unknown, texto: string) => fuente === null ? "Fuente no disponible." : texto
  return <main className="sku-tablero">
    <header className="sku-cabecera"><div><span>DASHBOARDS</span><h2>Movimiento de SKU</h2>
      <p>Ventas, devoluciones y desempeño en punto de venta.</p></div>
      <button type="button" disabled={cargando || !valido} onClick={() => setRevision((n) => n + 1)}>Actualizar</button>
    </header>
    <section className="sku-filtros" aria-label="Filtros del tablero">
      <label>Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
      <label>Hasta<input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} /></label>
      <label>Cliente<select value={cliente} onChange={(e) => { setCliente(e.target.value); setSku("") }}>
        <option value="">Todos los clientes</option>{datos.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select></label>
      <label>SKU<select value={sku} onChange={(e) => setSku(e.target.value)}><option value="">Todos los SKU activos asignados</option>
        {opciones.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.corto || p.nombre}</option>)}
      </select></label>
    </section>
    {(!valido || error) && <p className="sku-error" role="alert">{error || "Revisa las fechas del periodo."}</p>}
    {cargando && <p role="status">Cargando ventas, devoluciones, visitas y costos…</p>}
    {!cargando && valido && !error && <>
      {datos.errores.length > 0 && <div className="sku-error" role="alert">{datos.errores.map((e) => <p key={e}>{e}</p>)}</div>}
      <section className="sku-totales" aria-label="Resumen del periodo">
        <article><span>Unidades facturadas</span><strong>{datos.ventas === null ? "—" : entero(unidades)}</strong><small>{filas.length} SKU activos asignados</small></article>
        <article><span>Venta después de devoluciones</span><strong>{netoCompleto ? dinero(filas.reduce((s, f) => s + f.neto!, 0)) : "—"}</strong><small>Importes sin impuestos</small></article>
        <article><span>Unidades devueltas</span><strong>{datos.devoluciones === null ? "—" : entero(devueltas)}</strong><small>{datos.ventas !== null && datos.devoluciones !== null && unidades > 0 ? `${porcentaje(devueltas / unidades * 100)} de las unidades facturadas` : "Según fecha de devolución"}</small></article>
        <article><span>Aporte después de materiales</span><strong>{aporteCompleto ? dinero(filas.reduce((s, f) => s + f.aporte!, 0)) : "—"}</strong><small>Incluye devoluciones · costo vigente</small></article>
      </section>
      <p className="sku-metodo">Venta facturada del periodo {datos.ventas === null ? "—" : dinero(venta)}. Las devoluciones se toman por su fecha de registro y pueden corresponder a ventas anteriores. El aporte resta el valor devuelto y el costo de materiales de todas las unidades facturadas. Mano de obra, transporte y gastos se consultan en Rentabilidad por SKU.</p>
      {(faltanValores > 0 || resumen.ventasSinVinculo > 0) && <p className="sku-aviso">{faltanValores > 0 && `${faltanValores} líneas devueltas sin valor comprobado. El neto y aporte de sus SKU quedan pendientes. `}{resumen.ventasSinVinculo > 0 && `${resumen.ventasSinVinculo} líneas de venta sin vínculo único a cliente o producto requieren revisar el catálogo.`}</p>}
      <div className="sku-rankings">
        <Ranking titulo="5 SKU más vendidos" unidad="unidades" items={datos.ventas === null ? [] : comunes.map((f, i) => ({ ...f, valor: filas[i].unidades })).filter((f) => f.valor > 0)} vacio={disponibilidad(datos.ventas, "Sin ventas positivas en este periodo.")} alElegir={setSku} />
        <Ranking titulo="5 SKU con menor venta" unidad="unidades" inverso items={datos.ventas === null ? [] : comunes.map((f, i) => ({ ...f, valor: filas[i].unidades })).filter((f) => f.valor > 0)} vacio={disponibilidad(datos.ventas, "Sin ventas positivas en este periodo.")} alElegir={setSku} />
        <Ranking titulo="5 SKU más devueltos" unidad="unidades" items={datos.devoluciones === null ? [] : comunes.map((f, i) => ({ ...f, valor: filas[i].devueltas, detalle: `${f.detalle} · ${porcentaje(filas[i].tasaDevolucion)} del facturado` })).filter((f) => f.valor > 0)} vacio={disponibilidad(datos.devoluciones, "Sin devoluciones registradas.")} alElegir={setSku} />
        <Ranking titulo="5 SKU con mayor aporte" unidad="USD" items={comunes.flatMap((f, i) => filas[i].aporte !== null && (filas[i].unidades !== 0 || filas[i].devueltas > 0) ? [{ ...f, valor: filas[i].aporte!, detalle: `${f.detalle} · Después de devoluciones y materiales` }] : [])} vacio="Faltan movimientos o costos completos para calcular el aporte." alElegir={setSku} />
        <Ranking titulo="5 locales con mayor rotación promedio" unidad="u/día por SKU" items={locales.map((l) => ({ id: l.id, nombre: l.nombre, detalle: `${l.cliente} · ${l.skus} SKU · ${l.mediciones} mediciones semanales`, valor: l.rotacion }))} vacio={disponibilidad(datos.visitas, "Sin rotaciones verificadas o manuales declaradas.")} alElegir={setSku} />
        <Ranking titulo="5 combinaciones SKU y local" unidad="u/día" items={rotaciones.map((r) => ({ id: r.id, productoId: r.productoId, nombre: r.nombre, detalle: `${r.cliente} · ${r.local} · ${r.semanas} semanas · Último dato ${r.fecha}`, valor: r.rotacion }))} vacio={disponibilidad(datos.visitas, "Sin rotaciones verificadas o manuales declaradas.")} alElegir={setSku} />
      </div>
      {datos.ventas !== null && sinVentas.length > 0 && <section className="sku-sin-ventas"><h3>SKU sin venta en el periodo · {sinVentas.length}</h3>
        <div>{sinVentas.map((f) => <button type="button" key={f.id} onClick={() => setSku(f.id)}>{nombre(f)}</button>)}</div>
      </section>}
      <p className="sku-metodo">Rotación por local y SKU promediada entre semanas, usando la última visita de cada semana. Cada SKU tiene el mismo peso en el promedio del local. La cantidad de SKU y semanas observadas puede variar entre locales. {resumen.pendientes} mediciones semanales sin rotación verificada o manual declarada.</p>
      <section className="sku-detalle"><header><h3>Detalle por SKU</h3>{sku && <button type="button" onClick={() => setSku("")}>Ver todos los SKU</button>}</header>
        <div className="sku-tabla-scroll"><table><thead><tr><th>SKU</th><th>Facturadas</th><th>Devueltas</th><th>Devolución %</th><th>Venta tras devoluciones</th><th>Aporte tras materiales</th></tr></thead>
          <tbody>{filas.map((f) => <tr key={f.id}><th>{nombre(f)}<small>{f.codigo}</small></th>
            <td>{datos.ventas === null ? "—" : entero(f.unidades)}</td><td>{datos.devoluciones === null ? "—" : entero(f.devueltas)}</td>
            <td>{porcentaje(f.tasaDevolucion)}</td><td>{f.neto === null ? "Pendiente" : dinero(f.neto)}</td>
            <td className={(f.aporte ?? 0) < 0 ? "sku-negativo" : ""}>{f.aporte === null ? "Pendiente" : dinero(f.aporte)}</td></tr>)}</tbody></table></div>
        {!filas.length && <p className="sku-vacio">Sin SKU activos asignados para este filtro.</p>}
      </section>
      <footer className="sku-enlaces"><button type="button" onClick={() => cambiarPantalla("Rentabilidad por SKU")}>Rentabilidad completa</button>
        <button type="button" onClick={() => cambiarPantalla("Dashboard · Visitas y rotación")}>Visitas PDV</button>
        <button type="button" onClick={() => cambiarPantalla("Comercial · Devoluciones")}>Devoluciones</button></footer>
    </>}
  </main>
}
