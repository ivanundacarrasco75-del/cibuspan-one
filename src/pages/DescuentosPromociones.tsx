import { useEffect, useMemo, useState } from "react"

import ModalMensaje from "../components/ModalMensaje"
import SimuladorRentabilidad from "./SimuladorRentabilidad"
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

type Vista = "PROGRAMAR" | "NOTAS" | "HISTORIAL" | "SIMULADOR"

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

function fecha(valor: string) {
  if (!valor) return "—"
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${valor.slice(0, 10)}T00:00:00Z`))
}

function etiquetaEstado(estado: PromocionDb["estado"]) {
  if (estado === "PROXIMA") return "Próxima"
  if (estado === "ACTIVA") return "Activa"
  if (estado === "FINALIZADA") return "Finalizada"
  return "Cancelada"
}

export default function DescuentosPromociones() {
  const hoy = fechaIso()

  const [vista, setVista] = useState<Vista>("PROGRAMAR")

  const [clientes, setClientes] = useState<ClienteDb[]>([])
  const [productos, setProductos] = useState<ProductoDb[]>([])
  const [promociones, setPromociones] = useState<PromocionDb[]>([])

  const [cargandoCatalogos, setCargandoCatalogos] = useState(true)
  const [cargandoPromociones, setCargandoPromociones] = useState(false)
  const [promocionesCargadas, setPromocionesCargadas] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  // Programar descuento
  const [nombre, setNombre] = useState("")
  const [clienteId, setClienteId] = useState("")
  const [fechaInicio, setFechaInicio] = useState(hoy)
  const [fechaFin, setFechaFin] = useState(sumarDias(hoy, 7))
  const [observaciones, setObservaciones] = useState("")
  const [productoId, setProductoId] = useState("")
  const [tipoDescuento, setTipoDescuento] =
    useState<TipoDescuento>("PORCENTAJE")
  const [valorDescuento, setValorDescuento] = useState("")
  const [productosSeleccionados, setProductosSeleccionados] = useState<
    ProductoSeleccionado[]
  >([])

  // Notas de crédito
  const [promocionNotaId, setPromocionNotaId] = useState("")
  const [notaNumero, setNotaNumero] = useState("")
  const [notaFecha, setNotaFecha] = useState(hoy)
  const [notaValor, setNotaValor] = useState("")
  const [notaObservaciones, setNotaObservaciones] = useState("")

  useEffect(() => {
    void cargarCatalogos()
  }, [])

  useEffect(() => {
    if (vista === "PROGRAMAR" || vista === "SIMULADOR" || promocionesCargadas) return
    void cargarPromociones()
  }, [vista, promocionesCargadas])

  async function cargarCatalogos() {
    setCargandoCatalogos(true)
    setError("")

    try {
      const [clientesDb, productosDb] = await Promise.all([
        obtenerClientesDb(),
        obtenerProductosDb(),
      ])

      setClientes(clientesDb.filter((item) => item.activo))
      setProductos(productosDb.filter((item) => item.activo))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar clientes y productos.",
      )
    } finally {
      setCargandoCatalogos(false)
    }
  }

  async function cargarPromociones(forzar = false) {
    if (cargandoPromociones) return
    if (promocionesCargadas && !forzar) return

    setCargandoPromociones(true)
    setError("")

    try {
      const promocionesDb = await obtenerPromocionesDb()
      setPromociones(promocionesDb)
      setPromocionesCargadas(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las promociones.",
      )
    } finally {
      setCargandoPromociones(false)
    }
  }

  const productoActual = useMemo(
    () => productos.find((item) => item.id === productoId),
    [productoId, productos],
  )

  const promocionSeleccionada = useMemo(
    () => promociones.find((item) => item.id === promocionNotaId) ?? null,
    [promocionNotaId, promociones],
  )

  function agregarProducto() {
    const valor = Number(valorDescuento.replace(",", "."))

    if (!productoActual) {
      setError("Selecciona un SKU.")
      return
    }

    if (
      !Number.isFinite(valor) ||
      valor <= 0 ||
      (tipoDescuento === "PORCENTAJE" && valor > 100)
    ) {
      setError(
        tipoDescuento === "PORCENTAJE"
          ? "Ingresa un porcentaje mayor que 0 y hasta 100."
          : "Ingresa un descuento por unidad mayor que cero.",
      )
      return
    }

    if (
      productosSeleccionados.some(
        (item) => item.productoId === productoActual.id,
      )
    ) {
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
        nombre: nombre.trim(),
        clienteId,
        fechaInicio,
        fechaFin,
        observaciones: observaciones.trim(),
        productos: productosSeleccionados.map((item) => ({
          producto_id: item.productoId,
          tipo_descuento: item.tipo,
          valor_descuento: item.valor,
        })),
      })

      setNombre("")
      setClienteId("")
      setFechaInicio(hoy)
      setFechaFin(sumarDias(hoy, 7))
      setObservaciones("")
      setProductoId("")
      setValorDescuento("")
      setProductosSeleccionados([])
      setPromocionesCargadas(false)

      setMensaje("El descuento o promoción quedó registrado correctamente.")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el descuento o promoción.",
      )
    } finally {
      setGuardando(false)
    }
  }

  function seleccionarPromocionNota(id: string) {
    setPromocionNotaId(id)
    setNotaNumero("")
    setNotaFecha(hoy)
    setNotaObservaciones("")

    const promocion = promociones.find((item) => item.id === id)

    if (promocion && promocion.diferencia > 0) {
      setNotaValor(promocion.diferencia.toFixed(2))
    } else {
      setNotaValor("")
    }
  }

  async function guardarNota() {
    const valor = Number(notaValor.replace(",", "."))

    if (
      !promocionNotaId ||
      !notaNumero.trim() ||
      !notaFecha ||
      !Number.isFinite(valor) ||
      valor <= 0
    ) {
      setError(
        "Selecciona la promoción y completa número, fecha y valor de la nota de crédito.",
      )
      return
    }

    setGuardando(true)
    setError("")

    try {
      await registrarNotaCreditoPromocionDb({
        promocionId: promocionNotaId,
        numero: notaNumero.trim(),
        fecha: notaFecha,
        valorAplicado: valor,
        observaciones: notaObservaciones.trim(),
      })

      setNotaNumero("")
      setNotaFecha(hoy)
      setNotaValor("")
      setNotaObservaciones("")

      await cargarPromociones(true)

      setMensaje("La nota de crédito quedó registrada correctamente.")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar la nota de crédito.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(promocion: PromocionDb) {
    const accion = promocion.activo ? "cancelar" : "reactivar"

    if (
      !window.confirm(
        `¿Deseas ${accion} la promoción ${promocion.nombre}?`,
      )
    ) {
      return
    }

    setGuardando(true)
    setError("")

    try {
      await cambiarEstadoPromocionDb(promocion.id, !promocion.activo)
      await cargarPromociones(true)

      setMensaje(
        promocion.activo
          ? "La promoción fue cancelada."
          : "La promoción fue reactivada.",
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la promoción.",
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main className="discounts-page">
      <style>{css}</style>

      <ModalMensaje
        abierto={Boolean(mensaje)}
        tipo="EXITO"
        mensaje={mensaje}
        cerrar={() => setMensaje("")}
        cierreAutomaticoMs={4000}
      />

      <ModalMensaje
        abierto={Boolean(error)}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />

      <header className="discounts-header">
        <div>
          <span>COMERCIAL · INGRESO DE INFORMACIÓN</span>
          <h1>Descuentos</h1>
          <p>
            Registra promociones y notas de crédito. El análisis se realiza
            desde Inicio.
          </p>
        </div>
      </header>

      <nav className="discount-tabs">
        <button
          type="button"
          className={vista === "PROGRAMAR" ? "active" : ""}
          onClick={() => setVista("PROGRAMAR")}
        >
          Programar descuento
        </button>

        <button
          type="button"
          className={vista === "NOTAS" ? "active" : ""}
          onClick={() => setVista("NOTAS")}
        >
          Notas de crédito
        </button>

        <button
          type="button"
          className={vista === "HISTORIAL" ? "active" : ""}
          onClick={() => setVista("HISTORIAL")}
        >
          Historial
        </button>

        <button
          type="button"
          className={vista === "SIMULADOR" ? "active" : ""}
          onClick={() => setVista("SIMULADOR")}
        >
          Simulador
        </button>
      </nav>

      {vista === "PROGRAMAR" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>NUEVO DESCUENTO</span>
              <h2>Cliente, fechas y SKU participantes</h2>
            </div>
            <small>
              Registra únicamente las condiciones acordadas con el cliente.
            </small>
          </div>

          {cargandoCatalogos ? (
            <div className="empty">Cargando clientes y productos…</div>
          ) : (
            <>
              <div className="form-grid main-data">
                <label>
                  Nombre o campaña
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Regreso a clases"
                  />
                </label>

                <label>
                  Cliente
                  <select
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                  >
                    <option value="">Seleccionar cliente</option>
                    {clientes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Desde
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </label>

                <label>
                  Hasta
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </label>
              </div>

              <div className="sku-builder">
                <label>
                  SKU
                  <select
                    value={productoId}
                    onChange={(e) => setProductoId(e.target.value)}
                  >
                    <option value="">Seleccionar producto</option>
                    {productos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.codigo} · {item.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Tipo de descuento
                  <select
                    value={tipoDescuento}
                    onChange={(e) =>
                      setTipoDescuento(e.target.value as TipoDescuento)
                    }
                  >
                    <option value="PORCENTAJE">Porcentaje</option>
                    <option value="VALOR_UNIDAD">USD por unidad</option>
                  </select>
                </label>

                <label>
                  {tipoDescuento === "PORCENTAJE"
                    ? "Descuento %"
                    : "Descuento USD/Unid."}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valorDescuento}
                    onChange={(e) => setValorDescuento(e.target.value)}
                    placeholder="0,00"
                  />
                </label>

                <button type="button" onClick={agregarProducto}>
                  Añadir SKU
                </button>
              </div>

              {productosSeleccionados.length > 0 && (
                <div className="selected-products">
                  {productosSeleccionados.map((item) => (
                    <article key={item.productoId}>
                      <div>
                        <strong>{item.nombre}</strong>
                        <small>{item.sku}</small>
                      </div>

                      <b>
                        {item.tipo === "PORCENTAJE"
                          ? `${item.valor.toLocaleString("es-EC")}%`
                          : `${moneda(item.valor)} por Unid.`}
                      </b>

                      <button
                        type="button"
                        onClick={() =>
                          setProductosSeleccionados((actuales) =>
                            actuales.filter(
                              (producto) =>
                                producto.productoId !== item.productoId,
                            ),
                          )
                        }
                      >
                        Quitar
                      </button>
                    </article>
                  ))}
                </div>
              )}

              <label className="observations">
                Observaciones
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Condiciones acordadas con la cadena, número de campaña u otra referencia."
                />
              </label>

              <div className="actions">
                <button
                  type="button"
                  onClick={() => void guardarPromocion()}
                  disabled={guardando}
                >
                  {guardando ? "Guardando…" : "Guardar descuento"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {vista === "NOTAS" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>NOTAS DE CRÉDITO</span>
              <h2>Registrar documento recibido</h2>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={() => void cargarPromociones(true)}
              disabled={cargandoPromociones}
            >
              {cargandoPromociones ? "Actualizando…" : "Actualizar"}
            </button>
          </div>

          {cargandoPromociones && !promocionesCargadas ? (
            <div className="empty">Cargando promociones…</div>
          ) : promociones.length === 0 ? (
            <div className="empty">
              No existen promociones registradas.
            </div>
          ) : (
            <>
              <div className="note-selector">
                <label>
                  Promoción
                  <select
                    value={promocionNotaId}
                    onChange={(e) =>
                      seleccionarPromocionNota(e.target.value)
                    }
                  >
                    <option value="">Seleccionar promoción</option>
                    {promociones.map((promocion) => (
                      <option key={promocion.id} value={promocion.id}>
                        {promocion.cliente_nombre} · {promocion.nombre} ·{" "}
                        {fecha(promocion.fecha_inicio)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {promocionSeleccionada && (
                <>
                  <div className="control-strip">
                    <div>
                      <span>Cliente</span>
                      <strong>
                        {promocionSeleccionada.cliente_nombre}
                      </strong>
                    </div>
                    <div>
                      <span>Periodo</span>
                      <strong>
                        {fecha(promocionSeleccionada.fecha_inicio)} a{" "}
                        {fecha(promocionSeleccionada.fecha_fin)}
                      </strong>
                    </div>
                    <div>
                      <span>Esperado</span>
                      <strong>
                        {moneda(
                          promocionSeleccionada.descuento_esperado,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Notas registradas</span>
                      <strong>
                        {moneda(promocionSeleccionada.notas_total)}
                      </strong>
                    </div>
                    <div
                      className={
                        Math.abs(promocionSeleccionada.diferencia) < 0.01
                          ? "ok"
                          : "pending"
                      }
                    >
                      <span>Diferencia</span>
                      <strong>
                        {moneda(promocionSeleccionada.diferencia)}
                      </strong>
                    </div>
                  </div>

                  <div className="note-form">
                    <label>
                      Número de nota
                      <input
                        value={notaNumero}
                        onChange={(e) => setNotaNumero(e.target.value)}
                        placeholder="Número de NC"
                      />
                    </label>

                    <label>
                      Fecha
                      <input
                        type="date"
                        value={notaFecha}
                        onChange={(e) => setNotaFecha(e.target.value)}
                      />
                    </label>

                    <label>
                      Valor aplicado
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={notaValor}
                        onChange={(e) => setNotaValor(e.target.value)}
                      />
                    </label>

                    <label>
                      Observaciones
                      <input
                        value={notaObservaciones}
                        onChange={(e) =>
                          setNotaObservaciones(e.target.value)
                        }
                        placeholder="Referencia o detalle del documento"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void guardarNota()}
                      disabled={guardando}
                    >
                      {guardando ? "Guardando…" : "Guardar nota"}
                    </button>
                  </div>

                  {promocionSeleccionada.notas_credito.length > 0 && (
                    <div className="existing-notes">
                      <strong>Notas ya registradas</strong>

                      {promocionSeleccionada.notas_credito.map((nota) => (
                        <div key={nota.id}>
                          <span>{nota.numero}</span>
                          <span>{fecha(nota.fecha)}</span>
                          <strong>{moneda(nota.valor_aplicado)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}

      {vista === "HISTORIAL" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span>HISTORIAL</span>
              <h2>Descuentos y documentos registrados</h2>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={() => void cargarPromociones(true)}
              disabled={cargandoPromociones}
            >
              {cargandoPromociones ? "Actualizando…" : "Actualizar"}
            </button>
          </div>

          {cargandoPromociones && !promocionesCargadas ? (
            <div className="empty">Cargando historial…</div>
          ) : promociones.length === 0 ? (
            <div className="empty">
              Todavía no existen descuentos registrados.
            </div>
          ) : (
            <div className="history-list">
              {promociones.map((promocion) => (
                <article className="history-item" key={promocion.id}>
                  <header>
                    <div>
                      <span
                        className={`status ${promocion.estado.toLowerCase()}`}
                      >
                        {etiquetaEstado(promocion.estado)}
                      </span>
                      <h3>{promocion.nombre}</h3>
                      <p>
                        {promocion.cliente_nombre} ·{" "}
                        {fecha(promocion.fecha_inicio)} a{" "}
                        {fecha(promocion.fecha_fin)}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void cambiarEstado(promocion)}
                      disabled={guardando}
                    >
                      {promocion.activo ? "Cancelar" : "Reactivar"}
                    </button>
                  </header>

                  <div className="history-products">
                    {promocion.productos.map((item) => (
                      <div key={item.id}>
                        <span>
                          {item.sku} · {item.producto_nombre}
                        </span>
                        <strong>
                          {item.tipo_descuento === "PORCENTAJE"
                            ? `${Number(
                                item.valor_descuento,
                              ).toLocaleString("es-EC")}%`
                            : `${moneda(
                                item.valor_descuento,
                              )}/Unid.`}
                        </strong>
                      </div>
                    ))}
                  </div>

                  {promocion.notas_credito.length > 0 && (
                    <div className="history-notes">
                      <strong>Notas de crédito</strong>
                      {promocion.notas_credito.map((nota) => (
                        <div key={nota.id}>
                          <span>
                            {nota.numero} · {fecha(nota.fecha)}
                          </span>
                          <strong>{moneda(nota.valor_aplicado)}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {promocion.observaciones && (
                    <p className="history-observation">
                      {promocion.observaciones}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {vista === "SIMULADOR" && (
        <section className="discount-simulator-shell">
          <div className="panel-heading">
            <div>
              <span>SIMULADOR</span>
              <h2>Evaluar descuento antes de aprobarlo</h2>
            </div>
            <small>
              Simula cliente, SKU, unidades, devolución y descuento sin modificar
              información real del sistema.
            </small>
          </div>

          <SimuladorRentabilidad modoIntegrado />
        </section>
      )}
    </main>
  )
}

const css = `
  .discounts-page {
    padding: 4px 28px 42px;
    color: #321f1c;
  }

  .discount-simulator-shell {
    padding: 18px;
    border: 1px solid #eaded8;
    border-radius: 14px;
    background: #ffffff;
  }


  .discounts-header {
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:20px;
    margin-bottom:18px;
  }

  .discounts-header span,
  .panel-heading span {
    color:#f27d16;
    font-size:11px;
    font-weight:900;
    letter-spacing:.12em;
  }

  .discounts-header h1 {
    margin:6px 0 4px;
    font-size:32px;
    color:#351b18;
  }

  .discounts-header p {
    margin:0;
    color:#7b6d68;
  }

  .discounts-page button {
    min-height:40px;
    padding:9px 16px;
    border:0;
    border-radius:9px;
    background:#9d2027;
    color:white;
    font:inherit;
    font-weight:800;
    cursor:pointer;
  }

  .discounts-page button:disabled {
    opacity:.55;
    cursor:not-allowed;
  }

  .discounts-page button.secondary {
    border:1px solid #9d2027;
    background:white;
    color:#9d2027;
  }

  .discount-tabs {
    display:flex;
    gap:6px;
    padding:6px;
    margin-bottom:18px;
    border:1px solid #e6dad4;
    border-radius:12px;
    background:#eee8e4;
    overflow-x:auto;
  }

  .discount-tabs button {
    background:transparent;
    color:#75645f;
    white-space:nowrap;
  }

  .discount-tabs button.active {
    background:#9d2027;
    color:white;
  }

  .panel {
    margin-bottom:18px;
    padding:22px;
    border:1px solid #e7ddd7;
    border-radius:15px;
    background:white;
    box-shadow:0 8px 28px rgba(62,35,29,.045);
  }

  .panel-heading {
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:18px;
    margin-bottom:18px;
  }

  .panel-heading h2 {
    margin:5px 0 0;
    font-size:21px;
  }

  .panel-heading small {
    max-width:420px;
    color:#8a7b75;
    text-align:right;
  }

  .form-grid {
    display:grid;
    gap:12px;
  }

  .main-data {
    grid-template-columns:1.5fr 1.3fr .75fr .75fr;
  }

  .discounts-page label {
    display:flex;
    flex-direction:column;
    gap:6px;
    color:#604d47;
    font-size:11px;
    font-weight:900;
    text-transform:uppercase;
    letter-spacing:.04em;
  }

  .discounts-page input,
  .discounts-page select,
  .discounts-page textarea {
    width:100%;
    min-height:43px;
    padding:9px 11px;
    border:1px solid #d9ccc6;
    border-radius:8px;
    background:white;
    color:#2c201d;
    font:inherit;
    font-size:14px;
    text-transform:none;
    letter-spacing:normal;
    box-sizing:border-box;
  }

  .discounts-page textarea {
    min-height:72px;
    resize:vertical;
  }

  .sku-builder {
    display:grid;
    grid-template-columns:2fr 1fr 1fr auto;
    align-items:end;
    gap:10px;
    margin-top:16px;
    padding:14px;
    border-radius:12px;
    background:#faf6f2;
  }

  .selected-products {
    display:grid;
    gap:7px;
    margin-top:12px;
  }

  .selected-products article {
    display:grid;
    grid-template-columns:1fr auto auto;
    align-items:center;
    gap:14px;
    padding:10px 12px;
    border:1px solid #eee1da;
    border-radius:10px;
  }

  .selected-products article div {
    display:flex;
    flex-direction:column;
  }

  .selected-products small {
    color:#8a7a75;
  }

  .selected-products button {
    min-height:32px;
    padding:5px 10px;
    background:#f5e8e7;
    color:#9d2027;
  }

  .observations {
    margin-top:14px;
  }

  .actions {
    display:flex;
    justify-content:flex-end;
    margin-top:14px;
  }

  .note-selector {
    max-width:760px;
    margin-bottom:16px;
  }

  .control-strip {
    display:grid;
    grid-template-columns:1.2fr 1.2fr repeat(3, .8fr);
    gap:10px;
    margin-bottom:16px;
  }

  .control-strip > div {
    display:flex;
    flex-direction:column;
    gap:5px;
    padding:13px;
    border-radius:10px;
    background:#f7f3f0;
  }

  .control-strip span {
    color:#78645e;
    font-size:10px;
    font-weight:900;
    text-transform:uppercase;
  }

  .control-strip strong {
    font-size:16px;
  }

  .control-strip .pending {
    background:#fff4df;
    color:#9a5b00;
  }

  .control-strip .ok {
    background:#e9f9ef;
    color:#166534;
  }

  .note-form {
    display:grid;
    grid-template-columns:1fr .8fr .8fr 1.4fr auto;
    align-items:end;
    gap:10px;
    padding:14px;
    border-radius:11px;
    background:#faf5ef;
  }

  .existing-notes {
    display:grid;
    gap:7px;
    margin-top:16px;
    padding-top:14px;
    border-top:1px solid #eadfd9;
  }

  .existing-notes > div,
  .history-products > div,
  .history-notes > div {
    display:grid;
    grid-template-columns:1fr auto auto;
    gap:12px;
    align-items:center;
    padding:8px 0;
    border-bottom:1px solid #f0e8e4;
  }

  .history-list {
    display:grid;
    gap:14px;
  }

  .history-item {
    padding:18px;
    border:1px solid #eadfd9;
    border-radius:12px;
    background:#fff;
  }

  .history-item > header {
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:16px;
  }

  .history-item h3 {
    margin:7px 0 3px;
    font-size:19px;
  }

  .history-item p {
    margin:0;
    color:#806f69;
  }

  .history-products,
  .history-notes {
    display:grid;
    gap:2px;
    margin-top:14px;
  }

  .history-products > div,
  .history-notes > div {
    grid-template-columns:1fr auto;
  }

  .history-observation {
    margin-top:14px !important;
    padding:10px 12px;
    border-radius:8px;
    background:#faf7f4;
  }

  .status {
    display:inline-flex;
    padding:4px 8px;
    border-radius:999px;
    font-size:10px;
    font-weight:900;
    text-transform:uppercase;
  }

  .status.activa {
    background:#dcfce7;
    color:#15803d;
  }

  .status.proxima {
    background:#dbeafe;
    color:#1d4ed8;
  }

  .status.finalizada {
    background:#eee8e4;
    color:#655651;
  }

  .status.cancelada {
    background:#fee2e2;
    color:#b91c1c;
  }

  .empty {
    padding:34px;
    text-align:center;
    color:#8b7b75;
  }

  @media (max-width:1050px) {
    .main-data,
    .sku-builder {
      grid-template-columns:repeat(2,minmax(0,1fr));
    }

    .control-strip {
      grid-template-columns:repeat(2,minmax(0,1fr));
    }

    .note-form {
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
  }

  @media (max-width:700px) {
    .discounts-page {
      padding:4px 14px 26px;
    }

    .discounts-header,
    .panel-heading,
    .history-item > header {
      flex-direction:column;
    }

    .discounts-header h1 {
      font-size:27px;
    }

    .main-data,
    .sku-builder,
    .control-strip,
    .note-form {
      grid-template-columns:1fr;
    }

    .panel {
      padding:16px;
    }

    .panel-heading small {
      text-align:left;
    }

    .selected-products article {
      grid-template-columns:1fr;
    }
  }
`
