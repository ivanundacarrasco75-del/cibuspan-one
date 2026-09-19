import { useEffect, useMemo, useState } from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  convertirSemielaboradoDb,
  editarLoteSemielaboradoDb,
  obtenerConversionesSemielaboradoDb,
  obtenerDestinosSemielaboradoDb,
  obtenerResumenSemielaboradosDb,
  obtenerStockSemielaboradosDb,
  type ConversionSemielaboradoDb,
  type SemielaboradoDestinoDb,
  type StockSemielaboradoDb,
  type StockSemielaboradoResumenDb,
} from "../repositories/semielaboradoRepository"

function fechaHoy() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(
    fecha.getMonth() + 1,
  ).padStart(2, "0")
  const dia = String(
    fecha.getDate(),
  ).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function sumarDias(
  fecha: string,
  dias: number,
) {
  if (!fecha) return ""

  const resultado = new Date(
    `${fecha}T12:00:00`,
  )

  resultado.setDate(
    resultado.getDate() + dias,
  )

  const anio = resultado.getFullYear()
  const mes = String(
    resultado.getMonth() + 1,
  ).padStart(2, "0")
  const dia = String(
    resultado.getDate(),
  ).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function generarLote(
  fecha: string,
  codigoLote: string | null | undefined,
) {
  if (!fecha || !codigoLote) return ""

  const [, mes, dia] = fecha.split("-")

  return `${dia}${mes}${codigoLote.padStart(2, "0")}`
}

export default function EtiquetadoSemielaborados() {
  const [stock, setStock] = useState<
    StockSemielaboradoDb[]
  >([])

  const [resumen, setResumen] = useState<
    StockSemielaboradoResumenDb[]
  >([])

  const [conversiones, setConversiones] =
    useState<ConversionSemielaboradoDb[]>([])

  const [destinos, setDestinos] = useState<
    SemielaboradoDestinoDb[]
  >([])

  const [
    inventarioSemielaboradoId,
    setInventarioSemielaboradoId,
  ] = useState("")

  const [productoFinalId, setProductoFinalId] =
    useState("")

  const [cantidad, setCantidad] = useState("")
  const [
    fechaElaboracionEtiqueta,
    setFechaElaboracionEtiqueta,
  ] = useState(fechaHoy())

  const [loteFinal, setLoteFinal] = useState("")
  const [fechaVencimiento, setFechaVencimiento] =
    useState("")

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] =
    useState(false)

  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const [
    loteEditando,
    setLoteEditando,
  ] = useState<StockSemielaboradoDb | null>(
    null,
  )

  const [
    fechaProduccionEditando,
    setFechaProduccionEditando,
  ] = useState("")

  const [
    cantidadDisponibleEditando,
    setCantidadDisponibleEditando,
  ] = useState("")

  const [
    guardandoEdicion,
    setGuardandoEdicion,
  ] = useState(false)

  useEffect(() => {
    cargarPantalla()
  }, [])

  const loteSeleccionado = useMemo(
    () =>
      stock.find(
        (registro) =>
          registro.id ===
          inventarioSemielaboradoId,
      ) ?? null,
    [stock, inventarioSemielaboradoId],
  )

  const destinoSeleccionado = useMemo(
    () =>
      destinos.find(
        (destino) =>
          destino.producto_final_id ===
          productoFinalId,
      ) ?? null,
    [destinos, productoFinalId],
  )

  function actualizarDatosEtiqueta(
    fecha: string,
    destino: SemielaboradoDestinoDb | null,
  ) {
    if (!fecha || !destino?.producto_final) {
      setLoteFinal("")
      setFechaVencimiento("")
      return
    }

    setLoteFinal(
      generarLote(
        fecha,
        destino.producto_final.codigo_lote,
      ),
    )

    setFechaVencimiento(
      sumarDias(
        fecha,
        destino.producto_final.vida_util_dias,
      ),
    )
  }

  useEffect(() => {
    async function cargarDestinos() {
      setDestinos([])
      setProductoFinalId("")

      if (!loteSeleccionado) return

      try {
        const datos =
          await obtenerDestinosSemielaboradoDb(
            loteSeleccionado.semielaborado_tipo_id,
          )

        setDestinos(datos)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los productos finales.",
        )
      }
    }

    cargarDestinos()
  }, [loteSeleccionado])

  useEffect(() => {
    actualizarDatosEtiqueta(
      fechaElaboracionEtiqueta,
      destinoSeleccionado,
    )
  }, [
    fechaElaboracionEtiqueta,
    destinoSeleccionado,
  ])

  async function cargarPantalla() {
    setCargando(true)
    setError("")

    try {
      const [
        stockDb,
        resumenDb,
        conversionesDb,
      ] = await Promise.all([
        obtenerStockSemielaboradosDb(),
        obtenerResumenSemielaboradosDb(),
        obtenerConversionesSemielaboradoDb(),
      ])

      setStock(stockDb)
      setResumen(resumenDb)
      setConversiones(conversionesDb)

      if (
        inventarioSemielaboradoId &&
        !stockDb.some(
          (registro) =>
            registro.id ===
            inventarioSemielaboradoId,
        )
      ) {
        limpiarFormulario()
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la prebodega.",
      )
    } finally {
      setCargando(false)
    }
  }

  function limpiarFormulario() {
    setInventarioSemielaboradoId("")
    setProductoFinalId("")
    setDestinos([])
    setCantidad("")
    setFechaElaboracionEtiqueta(fechaHoy())
    setLoteFinal("")
    setFechaVencimiento("")
  }

  async function convertir() {
    setMensaje("")
    setError("")

    const cantidadNumerica = Number(cantidad)

    if (!loteSeleccionado) {
      setError(
        "Selecciona un lote de semielaborado.",
      )
      return
    }

    if (!productoFinalId) {
      setError(
        "Selecciona el producto final.",
      )
      return
    }

    if (
      !Number.isInteger(cantidadNumerica) ||
      cantidadNumerica <= 0
    ) {
      setError(
        "La cantidad debe ser un número entero mayor que cero.",
      )
      return
    }

    if (
      cantidadNumerica >
      loteSeleccionado.cantidad_disponible
    ) {
      setError(
        `Solo existen ${loteSeleccionado.cantidad_disponible} unidades disponibles para etiquetar.`,
      )
      return
    }

    if (!fechaElaboracionEtiqueta) {
      setError(
        "Selecciona la fecha de elaboración.",
      )
      return
    }

    if (!loteFinal.trim()) {
      setError(
        "Ingresa el lote final de la etiqueta.",
      )
      return
    }

    if (!fechaVencimiento) {
      setError(
        "No se pudo calcular la fecha de vencimiento.",
      )
      return
    }

    setGuardando(true)

    try {
      await convertirSemielaboradoDb({
        inventarioSemielaboradoId:
          loteSeleccionado.id,
        productoFinalId,
        cantidad:
          cantidadNumerica,
        fechaElaboracionEtiqueta,
        loteFinal,
        fechaVencimiento,
      })

      setMensaje(
        `${cantidadNumerica} unidades convertidas correctamente a ${
          destinoSeleccionado?.producto_final
            ?.corto ?? "producto final"
        }.`,
      )

      limpiarFormulario()
      await cargarPantalla()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo completar el etiquetado.",
      )
    } finally {
      setGuardando(false)
    }
  }

  function abrirEditarLote(
    registro: StockSemielaboradoDb,
  ) {
    setLoteEditando(registro)
    setFechaProduccionEditando(
      registro.fecha_produccion,
    )
    setCantidadDisponibleEditando(
      String(registro.cantidad_disponible),
    )
  }

  function cerrarEditarLote() {
    if (guardandoEdicion) return

    setLoteEditando(null)
    setFechaProduccionEditando("")
    setCantidadDisponibleEditando("")
  }

  function dejarDisponibleEnCero() {
    setCantidadDisponibleEditando("0")
  }

  async function guardarEdicionLote() {
    if (!loteEditando) return

    const disponibleNuevo = Number(
      cantidadDisponibleEditando,
    )

    if (!fechaProduccionEditando) {
      setError(
        "Selecciona la fecha de producción.",
      )
      return
    }

    if (
      !Number.isInteger(disponibleNuevo) ||
      disponibleNuevo < 0
    ) {
      setError(
        "La cantidad disponible debe ser un número entero mayor o igual a cero.",
      )
      return
    }

    setGuardandoEdicion(true)
    setError("")
    setMensaje("")

    try {
      await editarLoteSemielaboradoDb({
        inventarioSemielaboradoId:
          loteEditando.id,
        fechaProduccion:
          fechaProduccionEditando,
        cantidadDisponible:
          disponibleNuevo,
      })

      setMensaje(
        `Semielaborado actualizado. Disponible actual: ${disponibleNuevo} unidades.`,
      )

      cerrarEditarLote()
      await cargarPantalla()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo editar el lote.",
      )
    } finally {
      setGuardandoEdicion(false)
    }
  }

  return (
    <main style={pagina}>
      <ModalMensaje
        abierto={mensaje !== ""}
        tipo="EXITO"
        mensaje={mensaje}
        cerrar={() => setMensaje("")}
        cierreAutomaticoMs={2500}
      />

      <ModalMensaje
        abierto={error !== ""}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />

      <header style={cabecera}>
        <div>
          <span style={etiqueta}>
            PREBODEGA Y ETIQUETADO
          </span>

          <h1 style={titulo}>
            Semielaborados
          </h1>

          <p style={subtitulo}>
            Convierte bases producidas en productos
            finales etiquetados e ingrésalos al
            inventario terminado.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarPantalla}
          disabled={cargando || guardando}
          style={botonSecundario}
        >
          {cargando
            ? "Actualizando..."
            : "Actualizar"}
        </button>
      </header>

      <section style={resumenGrid}>
        {resumen.length === 0 ? (
          <div style={estadoVacio}>
            No existen semielaborados disponibles.
          </div>
        ) : (
          resumen.map((registro) => (
            <article
              key={registro.semielaborado_tipo_id}
              style={tarjetaResumen}
            >
              <span style={datoTitulo}>
                {registro.nombre}
              </span>

              <strong style={valorResumen}>
                {registro.cantidad_disponible}
              </strong>

              <span style={detalleResumen}>
                unidades pendientes de etiquetar
              </span>
            </article>
          ))
        )}
      </section>

      <section style={panel}>
        <div style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Convertir a producto final
            </h2>

            <p style={descripcion}>
              Selecciona la base, el producto final,
              la cantidad y los datos definitivos de
              etiqueta.
            </p>
          </div>
        </div>

        <div style={formulario}>
          <div>
            <label style={label}>
              Lote de semielaborado
            </label>

            <select
              value={inventarioSemielaboradoId}
              onChange={(evento) =>
                setInventarioSemielaboradoId(
                  evento.target.value,
                )
              }
              style={campo}
            >
              <option value="">
                Seleccione...
              </option>

              {stock.map((registro) => (
                <option
                  key={registro.id}
                  value={registro.id}
                >
                  {registro.nombre} · lote{" "}
                  {registro.lote_interno || "—"} ·{" "}
                  {registro.cantidad_disponible} unidades
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>
              Producto final
            </label>

            <select
              value={productoFinalId}
              disabled={!loteSeleccionado}
              onChange={(evento) => {
                const id = evento.target.value

                setProductoFinalId(id)

                const destino =
                  destinos.find(
                    (item) =>
                      item.producto_final_id === id,
                  ) ?? null

                actualizarDatosEtiqueta(
                  fechaElaboracionEtiqueta,
                  destino,
                )
              }}
              style={campo}
            >
              <option value="">
                Seleccione...
              </option>

              {destinos.map((destino) => (
                <option
                  key={destino.id}
                  value={destino.producto_final_id}
                >
                  {destino.producto_final?.corto ??
                    ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>
              Cantidad a etiquetar
            </label>

            <input
              type="number"
              min="1"
              step="1"
              max={
                loteSeleccionado
                  ?.cantidad_disponible
              }
              value={cantidad}
              onChange={(evento) =>
                setCantidad(evento.target.value)
              }
              style={campo}
            />
          </div>

          <div>
            <label style={label}>
              Fecha de elaboración
            </label>

            <input
              type="date"
              value={fechaElaboracionEtiqueta}
              onChange={(evento) => {
                const fecha = evento.target.value

                setFechaElaboracionEtiqueta(fecha)

                actualizarDatosEtiqueta(
                  fecha,
                  destinoSeleccionado,
                )
              }}
              style={campo}
            />
          </div>

          <div>
            <label style={label}>
              Lote final
            </label>

            <input
              value={loteFinal}
              readOnly
              placeholder=""
              style={{
                ...campo,
                background: "#f4f5f7",
                fontWeight: "bold",
                color: "#8f1d24",
              }}
            />
          </div>

          <div>
            <label style={label}>
              Fecha de vencimiento
            </label>

            <input
              type="date"
              value={fechaVencimiento}
              readOnly
              style={{
                ...campo,
                background: "#f4f5f7",
              }}
            />
          </div>
        </div>

        {loteSeleccionado && (
          <div style={avisoDisponible}>
            Disponible para etiquetar:{" "}
            <strong>
              {
                loteSeleccionado.cantidad_disponible
              }{" "}
              unidades
            </strong>
          </div>
        )}

        <div style={acciones}>
          <button
            type="button"
            onClick={limpiarFormulario}
            disabled={guardando}
            style={botonSecundario}
          >
            Limpiar
          </button>

          <button
            type="button"
            onClick={convertir}
            disabled={guardando}
            style={{
              ...botonPrincipal,
              opacity: guardando ? 0.5 : 1,
            }}
          >
            {guardando
              ? "Convirtiendo..."
              : "Confirmar etiquetado"}
          </button>
        </div>
      </section>

      <section style={panel}>
        <div style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Stock disponible por lote
            </h2>

            <p style={descripcion}>
              Bases aún pendientes de etiquetar.
            </p>
          </div>

          <span style={contador}>
            {stock.length}
          </span>
        </div>

        {cargando ? (
          <div style={estadoVacio}>
            Cargando semielaborados...
          </div>
        ) : stock.length === 0 ? (
          <div style={estadoVacio}>
            No existen lotes disponibles.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Semielaborado
                  </th>
                  <th style={encabezado}>
                    Ingreso a prebodega
                  </th>
                  <th style={encabezado}>
                    Lote
                  </th>
                  <th style={encabezado}>
                    Inicial
                  </th>
                  <th style={encabezado}>
                    Convertido
                  </th>
                  <th style={encabezado}>
                    Disponible
                  </th>
                  <th style={encabezado}>
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody>
                {stock.map((registro) => (
                  <tr key={registro.id}>
                    <td style={celda}>
                      <strong>
                        {registro.nombre}
                      </strong>
                    </td>

                    <td style={celda}>
                      {registro.fecha_produccion}
                    </td>

                    <td style={celda}>
                      {registro.lote_interno}
                    </td>

                    <td style={celdaNumero}>
                      {registro.cantidad_inicial}
                    </td>

                    <td style={celdaNumero}>
                      {registro.cantidad_convertida}
                    </td>

                    <td style={celdaNumero}>
                      <strong>
                        {
                          registro.cantidad_disponible
                        }
                      </strong>
                    </td>

                    <td style={celda}>
                      <button
                        type="button"
                        onClick={() =>
                          abrirEditarLote(registro)
                        }
                        disabled={
                          guardando ||
                          guardandoEdicion
                        }
                        style={botonEditarLote}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={panel}>
        <div style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Historial de etiquetado
            </h2>

            <p style={descripcion}>
              Conversiones realizadas hacia inventario
              terminado.
            </p>
          </div>

          <span style={contador}>
            {conversiones.length}
          </span>
        </div>

        {conversiones.length === 0 ? (
          <div style={estadoVacio}>
            No existen conversiones registradas.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Producto final
                  </th>
                  <th style={encabezado}>
                    Cantidad
                  </th>
                  <th style={encabezado}>
                    Elaboración
                  </th>
                  <th style={encabezado}>
                    Lote final
                  </th>
                  <th style={encabezado}>
                    Vencimiento
                  </th>
                  <th style={encabezado}>
                    Registrado
                  </th>
                </tr>
              </thead>

              <tbody>
                {conversiones.map((registro) => (
                  <tr key={registro.id}>
                    <td style={celda}>
                      <strong>
                        {registro.producto_final
                          ?.corto ?? ""}
                      </strong>
                    </td>

                    <td style={celdaNumero}>
                      {registro.cantidad}
                    </td>

                    <td style={celda}>
                      {
                        registro.fecha_elaboracion_etiqueta
                      }
                    </td>

                    <td style={celda}>
                      {registro.lote_final}
                    </td>

                    <td style={celda}>
                      {registro.fecha_vencimiento}
                    </td>

                    <td style={celda}>
                      {new Date(
                        registro.creado_en,
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {loteEditando && (
        <div style={fondoModal}>
          <div style={modalEdicion}>
            <h2 style={{ marginTop: 0 }}>
              Editar lote de semielaborado
            </h2>

            <p style={descripcion}>
              {loteEditando.nombre}
            </p>

            <div style={formularioModal}>
              <div>
                <label style={label}>
                  Fecha de ingreso a prebodega
                </label>

                <input
                  type="date"
                  value={
                    fechaProduccionEditando
                  }
                  onChange={(evento) =>
                    setFechaProduccionEditando(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div style={avisoEdicion}>
                Este semielaborado permanece sin lote. La fecha de producción final y el lote se asignarán automáticamente al momento de etiquetar.
              </div>

              <div>
                <label style={label}>
                  Disponible actual
                </label>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={
                    cantidadDisponibleEditando
                  }
                  onChange={(evento) =>
                    setCantidadDisponibleEditando(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div style={avisoEdicion}>
                Ya convertidas históricamente:{" "}
                <strong>
                  {loteEditando.cantidad_convertida}
                </strong>
                {" · "}
                Disponible actual registrado:{" "}
                <strong>
                  {loteEditando.cantidad_disponible}
                </strong>
                . Aquí corriges únicamente lo que existe
                físicamente ahora en prebodega.
              </div>
            </div>

            <div style={acciones}>
              <button
                type="button"
                onClick={dejarDisponibleEnCero}
                disabled={guardandoEdicion}
                style={botonCero}
              >
                Dejar disponible en 0
              </button>

              <button
                type="button"
                onClick={cerrarEditarLote}
                disabled={guardandoEdicion}
                style={botonSecundario}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={guardarEdicionLote}
                disabled={guardandoEdicion}
                style={{
                  ...botonPrincipal,
                  opacity:
                    guardandoEdicion
                      ? 0.5
                      : 1,
                }}
              >
                {guardandoEdicion
                  ? "Guardando..."
                  : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const pagina = {
  padding: "30px",
  maxWidth: "1500px",
  margin: "0 auto",
  color: "#25272b",
}

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  marginBottom: "24px",
}

const etiqueta = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "1px",
}

const titulo = {
  margin: "5px 0",
  fontSize: "32px",
}

const subtitulo = {
  margin: 0,
  color: "#6b7280",
}

const resumenGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
  marginBottom: "22px",
}

const tarjetaResumen = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "7px",
  padding: "18px",
  border: "1px solid #e2e5e9",
  borderRadius: "12px",
  background: "white",
}

const datoTitulo = {
  color: "#6b7280",
  fontSize: "12px",
}

const valorResumen = {
  color: "#8f1d24",
  fontSize: "30px",
}

const detalleResumen = {
  color: "#6b7280",
  fontSize: "12px",
}

const panel = {
  marginBottom: "22px",
  padding: "22px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 6px 20px rgba(15, 23, 42, 0.05)",
}

const tituloPanel = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  marginBottom: "20px",
}

const descripcion = {
  margin: "6px 0 0",
  color: "#6b7280",
  fontSize: "13px",
}

const formulario = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
}

const label = {
  display: "block",
  marginBottom: "7px",
  color: "#374151",
  fontSize: "13px",
  fontWeight: "bold",
}

const campo = {
  width: "100%",
  minHeight: "42px",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  background: "white",
}

const avisoDisponible = {
  marginTop: "16px",
  padding: "12px 14px",
  borderLeft: "4px solid #2563eb",
  borderRadius: "8px",
  background: "#eff6ff",
  color: "#1e40af",
}

const acciones = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "12px",
  marginTop: "20px",
}

const botonPrincipal = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonSecundario = {
  padding: "10px 16px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const contador = {
  minWidth: "36px",
  padding: "7px 11px",
  borderRadius: "999px",
  background: "#8f1d24",
  color: "white",
  textAlign: "center" as const,
  fontWeight: "bold",
}

const estadoVacio = {
  padding: "28px",
  border: "1px dashed #cfd4da",
  borderRadius: "9px",
  color: "#6b7280",
  textAlign: "center" as const,
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "10px",
  borderBottom: "2px solid #d8dde3",
  background: "#f7f8fa",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
  fontSize: "12px",
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #edf0f2",
  whiteSpace: "nowrap" as const,
}

const celdaNumero = {
  ...celda,
  textAlign: "right" as const,
}

const botonEditarLote = {
  padding: "8px 12px",
  border: "1px solid #8f1d24",
  borderRadius: "7px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const fondoModal = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 3000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  background: "rgba(15, 23, 42, 0.55)",
}

const modalEdicion = {
  width: "min(560px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto" as const,
  padding: "24px",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 20px 60px rgba(15, 23, 42, 0.30)",
}

const formularioModal = {
  display: "grid",
  gap: "16px",
}

const avisoEdicion = {
  padding: "12px 14px",
  borderLeft: "4px solid #8f1d24",
  borderRadius: "8px",
  background: "#f9f2f2",
  color: "#5f1a1f",
  lineHeight: 1.5,
}


const botonCero = {
  padding: "10px 16px",
  border: "1px solid #b91c1c",
  borderRadius: "8px",
  background: "#fff7f7",
  color: "#b91c1c",
  fontWeight: "bold",
  cursor: "pointer",
}