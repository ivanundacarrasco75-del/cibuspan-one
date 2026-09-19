import { useEffect, useMemo, useState } from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  obtenerClientesDb,
  obtenerProductosDb,
  type ClienteDb,
  type ProductoDb,
} from "../services/catalogoService"
import {
  cambiarEstadoPromocionDb,
  guardarPromocionDb,
  obtenerPromocionesDb,
  registrarNotaCreditoPromocionDb,
  type PromocionDb,
  type TipoDescuento,
} from "../repositories/promocionesRepository"

type ProductoSeleccionado = {
  productoId: string
  sku: string
  nombre: string
  tipo: TipoDescuento
  valor: number
}

function fechaIso(fecha = new Date()) {
  return fecha.toISOString().slice(0, 10)
}

function sumarDias(fecha: string, dias: number) {
  const valor = new Date(`${fecha}T12:00:00`)
  valor.setDate(valor.getDate() + dias)
  return fechaIso(valor)
}

function moneda(valor: number) {
  return Number(valor || 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numero(valor: number) {
  return Number(valor || 0).toLocaleString("es-EC", {
    maximumFractionDigits: 0,
  })
}

function fecha(valor: string) {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${valor.slice(0, 10)}T00:00:00Z`))
}

export default function DescuentosPromociones() {
  const hoy = fechaIso()
  const [clientes, setClientes] = useState<ClienteDb[]>([])
  const [productos, setProductos] = useState<ProductoDb[]>([])
  const [promociones, setPromociones] = useState<PromocionDb[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const [nombre, setNombre] = useState("")
  const [clienteId, setClienteId] = useState("")
  const [fechaInicio, setFechaInicio] = useState(hoy)
  const [fechaFin, setFechaFin] = useState(sumarDias(hoy, 7))
  const [observaciones, setObservaciones] = useState("")
  const [productoId, setProductoId] = useState("")
  const [tipoDescuento, setTipoDescuento] = useState<TipoDescuento>("PORCENTAJE")
  const [valorDescuento, setValorDescuento] = useState("")
  const [productosSeleccionados, setProductosSeleccionados] = useState<ProductoSeleccionado[]>([])

  const [promocionNotaId, setPromocionNotaId] = useState("")
  const [notaNumero, setNotaNumero] = useState("")
  const [notaFecha, setNotaFecha] = useState(hoy)
  const [notaValor, setNotaValor] = useState("")
  const [notaObservaciones, setNotaObservaciones] = useState("")

  useEffect(() => {
    void cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")
    try {
      const [clientesDb, productosDb, promocionesDb] = await Promise.all([
        obtenerClientesDb(),
        obtenerProductosDb(),
        obtenerPromocionesDb(),
      ])
      setClientes(clientesDb.filter((item) => item.activo))
      setProductos(productosDb.filter((item) => item.activo))
      setPromociones(promocionesDb)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los descuentos.")
    } finally {
      setCargando(false)
    }
  }

  const productoActual = useMemo(
    () => productos.find((item) => item.id === productoId),
    [productoId, productos],
  )

  function agregarProducto() {
    const valor = Number(valorDescuento.replace(",", "."))
    if (!productoActual) {
      setError("Selecciona un SKU.")
      return
    }
    if (!Number.isFinite(valor) || valor <= 0 || (tipoDescuento === "PORCENTAJE" && valor > 100)) {
      setError(tipoDescuento === "PORCENTAJE"
        ? "Ingresa un porcentaje mayor que 0 y hasta 100."
        : "Ingresa un descuento por unidad mayor que cero.")
      return
    }
    if (productosSeleccionados.some((item) => item.productoId === productoActual.id)) {
      setError("Ese SKU ya fue agregado a la promoción.")
      return
    }
    setProductosSeleccionados((actuales) => [
      ...actuales,
      {
        productoId: productoActual.id,
        sku: productoActual.codigo,
        nombre: productoActual.nombre,
        tipo: tipoDescuento,
        valor,
      },
    ])
    setProductoId("")
    setValorDescuento("")
  }

  async function guardarPromocion() {
    if (!nombre.trim() || !clienteId || !fechaInicio || !fechaFin) {
      setError("Completa el nombre, el cliente y el rango de fechas.")
      return
    }
    if (fechaFin < fechaInicio) {
      setError("La fecha final no puede ser anterior a la fecha inicial.")
      return
    }
    if (productosSeleccionados.length === 0) {
      setError("Agrega al menos un SKU a la promoción.")
      return
    }
    setGuardando(true)
    setError("")
    try {
      await guardarPromocionDb({
        nombre,
        clienteId,
        fechaInicio,
        fechaFin,
        observaciones,
        productos: productosSeleccionados.map((item) => ({
          producto_id: item.productoId,
          tipo_descuento: item.tipo,
          valor_descuento: item.valor,
        })),
      })
      setNombre("")
      setClienteId("")
      setObservaciones("")
      setProductosSeleccionados([])
      setMensaje("La promoción quedó registrada y ya aparecerá en las alertas de inicio y finalización.")
      await cargarDatos()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la promoción.")
    } finally {
      setGuardando(false)
    }
  }

  function abrirNota(promocion: PromocionDb) {
    setPromocionNotaId(promocion.id)
    setNotaNumero("")
    setNotaFecha(hoy)
    setNotaValor(promocion.diferencia > 0 ? promocion.diferencia.toFixed(2) : "")
    setNotaObservaciones("")
  }

  async function guardarNota() {
    const valor = Number(notaValor.replace(",", "."))
    if (!promocionNotaId || !notaNumero.trim() || !notaFecha || !Number.isFinite(valor) || valor <= 0) {
      setError("Completa el número, la fecha y el valor de la nota de crédito.")
      return
    }
    setGuardando(true)
    setError("")
    try {
      await registrarNotaCreditoPromocionDb({
        promocionId: promocionNotaId,
        numero: notaNumero,
        fecha: notaFecha,
        valorAplicado: valor,
        observaciones: notaObservaciones,
      })
      setPromocionNotaId("")
      setMensaje("La nota de crédito fue conciliada con la promoción.")
      await cargarDatos()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la nota de crédito.")
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(promocion: PromocionDb) {
    const accion = promocion.activo ? "cancelar" : "reactivar"
    if (!window.confirm(`¿Deseas ${accion} la promoción ${promocion.nombre}?`)) return
    setGuardando(true)
    try {
      await cambiarEstadoPromocionDb(promocion.id, !promocion.activo)
      setMensaje(promocion.activo ? "La promoción fue cancelada." : "La promoción fue reactivada.")
      await cargarDatos()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la promoción.")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main className="discounts-page">
      <style>{css}</style>
      <ModalMensaje abierto={Boolean(mensaje)} tipo="EXITO" mensaje={mensaje} cerrar={() => setMensaje("")} cierreAutomaticoMs={4000} />
      <ModalMensaje abierto={Boolean(error)} tipo="ERROR" mensaje={error} cerrar={() => setError("")} />

      <header className="discounts-header">
        <div>
          <span>VENTAS · CONTROL COMERCIAL</span>
          <h1>Descuentos y promociones</h1>
          <p>Calcula el descuento esperado con las ventas reales y compáralo con las notas de crédito recibidas.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void cargarDatos()} disabled={cargando || guardando}>
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </header>
<section className="panel creator">
        <div className="panel-heading">
          <div><span>NUEVA PROMOCIÓN</span><h2>Cliente, fechas y SKU participantes</h2></div>
          <small>Puedes incluir todos los productos de la misma promoción antes de guardarla.</small>
        </div>
        <div className="form-grid main-data">
          <label>Nombre o campaña<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Promoción regreso a clases" /></label>
          <label>Cliente<select value={clienteId} onChange={(e) => setClienteId(e.target.value)}><option value="">Seleccionar cliente</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label>Desde<input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></label>
          <label>Hasta<input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></label>
        </div>

        <div className="sku-builder">
          <label>SKU<select value={productoId} onChange={(e) => setProductoId(e.target.value)}><option value="">Seleccionar producto</option>{productos.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}</select></label>
          <label>Tipo de descuento<select value={tipoDescuento} onChange={(e) => setTipoDescuento(e.target.value as TipoDescuento)}><option value="PORCENTAJE">Porcentaje</option><option value="VALOR_UNIDAD">USD por unidad</option></select></label>
          <label>{tipoDescuento === "PORCENTAJE" ? "Descuento %" : "Descuento USD/Unid."}<input type="number" min="0" step="0.01" value={valorDescuento} onChange={(e) => setValorDescuento(e.target.value)} placeholder="0,00" /></label>
          <button type="button" onClick={agregarProducto}>Añadir SKU</button>
        </div>

        {productosSeleccionados.length > 0 && (
          <div className="selected-products">
            {productosSeleccionados.map((item) => <article key={item.productoId}><div><strong>{item.nombre}</strong><small>{item.sku}</small></div><b>{item.tipo === "PORCENTAJE" ? `${item.valor.toLocaleString("es-EC")}%` : `${moneda(item.valor)} por Unid.`}</b><button type="button" onClick={() => setProductosSeleccionados((actuales) => actuales.filter((producto) => producto.productoId !== item.productoId))}>Quitar</button></article>)}
          </div>
        )}

        <label className="observations">Observaciones<textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Condiciones acordadas con la cadena, número de campaña u otra referencia." /></label>
        <div className="actions"><button type="button" onClick={() => void guardarPromocion()} disabled={guardando}>{guardando ? "Guardando…" : "Guardar promoción"}</button></div>
      </section>

      <section className="summary-grid">
        <Kpi titulo="Promociones activas" valor={numero(promociones.filter((item) => item.estado === "ACTIVA").length)} detalle="En ejecución hoy" />
        <Kpi titulo="Descuento esperado" valor={moneda(promociones.reduce((suma, item) => suma + Number(item.descuento_esperado || 0), 0))} detalle="Según ventas importadas" />
        <Kpi titulo="Notas recibidas" valor={moneda(promociones.reduce((suma, item) => suma + Number(item.notas_total || 0), 0))} detalle="Valores conciliados" />
        <Kpi titulo="Pendiente por conciliar" valor={moneda(promociones.reduce((suma, item) => suma + Math.max(0, Number(item.diferencia || 0)), 0))} detalle="Esperado menos notas" alerta />
      </section>

      <section className="panel history">
        <div className="panel-heading"><div><span>CONCILIACIÓN</span><h2>Promociones registradas</h2></div></div>
        {cargando ? <div className="empty">Calculando descuentos…</div> : promociones.length === 0 ? <div className="empty">Todavía no existen promociones registradas.</div> : promociones.map((promocion) => (
          <article className="promotion" key={promocion.id}>
            <header>
              <div><span className={`status ${promocion.estado.toLowerCase()}`}>{etiquetaEstado(promocion.estado)}</span><h3>{promocion.nombre}</h3><p>{promocion.cliente_nombre} · {fecha(promocion.fecha_inicio)} a {fecha(promocion.fecha_fin)}</p></div>
              <button type="button" className="link-button" onClick={() => void cambiarEstado(promocion)} disabled={guardando}>{promocion.activo ? "Cancelar" : "Reactivar"}</button>
            </header>
            <div className="reconciliation">
              <div><span>Venta base</span><strong>{moneda(promocion.venta_base)}</strong><small>{numero(promocion.unidades_vendidas)} Unid.</small></div>
              <div><span>Descuento esperado</span><strong>{moneda(promocion.descuento_esperado)}</strong><small>Calculado por SKU</small></div>
              <div><span>Notas recibidas</span><strong>{moneda(promocion.notas_total)}</strong><small>{promocion.notas_credito.length} documento(s)</small></div>
              <div className={Math.abs(promocion.diferencia) < 0.01 ? "balanced" : "pending"}><span>Diferencia</span><strong>{moneda(promocion.diferencia)}</strong><small>{Math.abs(promocion.diferencia) < 0.01 ? "Conciliada" : promocion.diferencia > 0 ? "Falta nota de crédito" : "Nota superior al esperado"}</small></div>
            </div>
            <div className="product-table"><table><thead><tr><th>SKU</th><th>Producto</th><th>Descuento</th><th>Unidades vendidas</th><th>Venta base</th><th>Esperado</th></tr></thead><tbody>{promocion.productos.map((item) => <tr key={item.id}><td>{item.sku}</td><td>{item.producto_nombre}</td><td>{item.tipo_descuento === "PORCENTAJE" ? `${Number(item.valor_descuento).toLocaleString("es-EC")}%` : `${moneda(item.valor_descuento)}/Unid.`}</td><td>{numero(item.unidades_vendidas)}</td><td>{moneda(item.venta_base)}</td><td><strong>{moneda(item.descuento_esperado)}</strong></td></tr>)}</tbody></table></div>
            {promocion.notas_credito.length > 0 && <div className="notes"><strong>Notas de crédito:</strong>{promocion.notas_credito.map((nota) => <span key={nota.id}>{nota.numero} · {fecha(nota.fecha)} · {moneda(nota.valor_aplicado)}</span>)}</div>}

            {promocionNotaId === promocion.id ? (
              <div className="note-form">
                <label>Número de nota<input value={notaNumero} onChange={(e) => setNotaNumero(e.target.value)} /></label>
                <label>Fecha<input type="date" value={notaFecha} onChange={(e) => setNotaFecha(e.target.value)} /></label>
                <label>Valor aplicado<input type="number" min="0" step="0.01" value={notaValor} onChange={(e) => setNotaValor(e.target.value)} /></label>
                <label>Observación<input value={notaObservaciones} onChange={(e) => setNotaObservaciones(e.target.value)} /></label>
                <button type="button" onClick={() => void guardarNota()} disabled={guardando}>Guardar nota</button>
                <button type="button" className="secondary" onClick={() => setPromocionNotaId("")}>Cerrar</button>
              </div>
            ) : <button type="button" className="register-note" onClick={() => abrirNota(promocion)}>Registrar o cotejar nota de crédito</button>}
          </article>
        ))}
      </section>
    </main>
  )
}

function etiquetaEstado(estado: PromocionDb["estado"]) {
  if (estado === "PROXIMA") return "Próxima"
  if (estado === "ACTIVA") return "Activa"
  if (estado === "FINALIZADA") return "Finalizada"
  return "Cancelada"
}

function Kpi({ titulo, valor, detalle, alerta = false }: { titulo: string; valor: string; detalle: string; alerta?: boolean }) {
  return <article className={`discount-kpi ${alerta ? "alert" : ""}`}><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>
}

const css = `
  .discounts-page { padding: 4px 28px 42px; color: #321f1c; }
  .discounts-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
  .discounts-header span, .panel-heading span { color:#f27d16; font-size:11px; font-weight:900; letter-spacing:.12em; }
  .discounts-header h1 { margin:6px 0 4px; font-size:32px; color:#351b18; }
  .discounts-header p, .panel-heading p { margin:0; color:#7b6d68; }
  button { font:inherit; }
  .discounts-page button { min-height:40px; padding:9px 16px; border:0; border-radius:9px; background:#9d2027; color:white; font-weight:800; cursor:pointer; }
  .discounts-page button:disabled { opacity:.55; cursor:not-allowed; }
  .discounts-page button.secondary, .discounts-page .link-button { border:1px solid #9d2027; background:white; color:#9d2027; }
  .sales-tabs { display:flex; gap:6px; margin-bottom:18px; padding:5px; border:1px solid #eaded8; border-radius:12px; background:#eee8e4; overflow-x:auto; }
  .sales-tabs button { min-width:150px; background:transparent; color:#75645f; white-space:nowrap; }
  .sales-tabs button.active { background:#9d2027; color:white; box-shadow:0 6px 16px rgba(143,29,36,.14); }
  .panel { margin-bottom:18px; padding:22px; border:1px solid #e7ddd7; border-radius:15px; background:white; box-shadow:0 8px 28px rgba(62,35,29,.045); }
  .panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
  .panel-heading h2 { margin:5px 0 0; font-size:21px; }
  .panel-heading small { max-width:420px; color:#8a7b75; text-align:right; }
  .form-grid { display:grid; gap:12px; }
  .main-data { grid-template-columns:1.5fr 1.3fr .75fr .75fr; }
  .discounts-page label { display:flex; flex-direction:column; gap:6px; color:#604d47; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
  .discounts-page input, .discounts-page select, .discounts-page textarea { width:100%; min-height:43px; padding:9px 11px; border:1px solid #d9ccc6; border-radius:8px; background:white; color:#2c201d; font:inherit; font-size:14px; text-transform:none; letter-spacing:normal; }
  .discounts-page textarea { min-height:72px; resize:vertical; }
  .sku-builder { display:grid; grid-template-columns:2fr 1fr 1fr auto; align-items:end; gap:10px; margin-top:16px; padding:14px; border-radius:12px; background:#faf6f2; }
  .selected-products { display:grid; gap:7px; margin-top:12px; }
  .selected-products article { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:14px; padding:10px 12px; border:1px solid #eee1da; border-radius:10px; }
  .selected-products article div { display:flex; flex-direction:column; }
  .selected-products small { color:#8a7a75; }
  .selected-products button { min-height:32px; padding:5px 10px; background:#f5e8e7; color:#9d2027; }
  .observations { margin-top:14px; }
  .actions { display:flex; justify-content:flex-end; margin-top:14px; }
  .summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:18px; }
  .discount-kpi { min-height:125px; display:flex; flex-direction:column; gap:8px; padding:18px; border:1px solid #e5d9d3; border-top:3px solid #9d2027; border-radius:13px; background:white; }
  .discount-kpi.alert { border-top-color:#e59410; background:#fffaf0; }
  .discount-kpi span { color:#725f58; font-size:11px; font-weight:900; text-transform:uppercase; }
  .discount-kpi strong { font-size:25px; color:#291b19; }
  .discount-kpi small { color:#8b7d78; }
  .promotion { padding:18px 0 22px; border-top:1px solid #eadfd9; }
  .promotion:first-of-type { border-top:0; }
  .promotion > header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
  .promotion h3 { margin:7px 0 3px; font-size:19px; }
  .promotion p { margin:0; color:#806f69; }
  .status { display:inline-flex; padding:4px 8px; border-radius:999px; font-size:10px; font-weight:900; text-transform:uppercase; }
  .status.activa { background:#dcfce7; color:#15803d; }
  .status.proxima { background:#dbeafe; color:#1d4ed8; }
  .status.finalizada { background:#eee8e4; color:#655651; }
  .status.cancelada { background:#fee2e2; color:#b91c1c; }
  .reconciliation { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; margin:15px 0; }
  .reconciliation > div { display:flex; flex-direction:column; gap:5px; padding:13px; border-radius:10px; background:#f7f3f0; }
  .reconciliation span { color:#78645e; font-size:10px; font-weight:900; text-transform:uppercase; }
  .reconciliation strong { font-size:20px; }
  .reconciliation small { color:#8c7d77; }
  .reconciliation .pending { background:#fff4df; color:#9a5b00; }
  .reconciliation .balanced { background:#e9f9ef; color:#166534; }
  .product-table { overflow-x:auto; border:1px solid #eee3dd; border-radius:10px; }
  .product-table table { width:100%; border-collapse:collapse; min-width:760px; }
  .product-table th, .product-table td { padding:10px; border-bottom:1px solid #eee5e0; text-align:left; font-size:12px; }
  .product-table th { color:#725f58; font-size:10px; text-transform:uppercase; background:#fbf8f6; }
  .notes { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; align-items:center; }
  .notes span { padding:6px 9px; border-radius:7px; background:#f0ebe8; font-size:12px; }
  .register-note { margin-top:14px; }
  .note-form { display:grid; grid-template-columns:1fr .8fr .8fr 1.3fr auto auto; align-items:end; gap:9px; margin-top:14px; padding:13px; border-radius:11px; background:#faf5ef; }
  .empty { padding:34px; text-align:center; color:#8b7b75; }
  @media (max-width:1050px) {
    .main-data { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .sku-builder { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .summary-grid, .reconciliation { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .note-form { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
  @media (max-width:700px) {
    .discounts-page { padding:4px 14px 26px; }
    .discounts-header { flex-direction:column; }
    .discounts-header h1 { font-size:27px; }
    .main-data, .sku-builder, .summary-grid, .reconciliation, .note-form { grid-template-columns:1fr; }
    .panel { padding:16px; }
    .panel-heading { flex-direction:column; }
    .panel-heading small { text-align:left; }
    .selected-products article { grid-template-columns:1fr; }
    .promotion > header { flex-direction:column; }
  }
`
