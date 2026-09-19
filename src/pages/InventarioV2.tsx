import { useEffect, useMemo, useState } from "react"
import {
  actualizarLoteInventarioDb,
  ajustarInventarioLoteDb,
  crearLoteInventarioDb,
  convertirInventarioEmpaqueDb,
  eliminarLoteInventarioDb,
  obtenerInventarioLotesDb,
  obtenerStockDisponibleLotesDb,
  type InventarioLoteDb,
  type StockDisponibleLoteDb,
} from "../repositories/inventarioRepository"
import ModalMensaje from "../components/ModalMensaje"
import EtiquetadoSemielaborados from "./EtiquetadoSemielaborados"
import {
  obtenerProductosDb,
  type ProductoDb,
} from "../services/catalogoService"

type VistaInventario = "RESUMEN" | "LOTES"

type FiltroInventario =
  | "TODOS"
  | "DISPONIBLE"
  | "AGOTADO"
  | "PROXIMO_VENCER"

function fechaHoy() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function sumarDias(fecha: string, dias: number) {
  if (!fecha) return ""

  const resultado = new Date(`${fecha}T12:00:00`)
  resultado.setDate(resultado.getDate() + dias)

  const anio = resultado.getFullYear()
  const mes = String(
    resultado.getMonth() + 1,
  ).padStart(2, "0")
  const dia = String(
    resultado.getDate(),
  ).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function diasHastaVencimiento(
  fechaVencimiento: string,
) {
  const hoy = new Date(`${fechaHoy()}T12:00:00`)
  const vencimiento = new Date(
    `${fechaVencimiento}T12:00:00`,
  )

  return Math.ceil(
    (vencimiento.getTime() - hoy.getTime()) /
      (1000 * 60 * 60 * 24),
  )
}

export default function InventarioV2() {
  const [moduloInventario, setModuloInventario] =
    useState<"TERMINADO" | "SEMIELABORADOS">(
      "TERMINADO",
    )

  const [productos, setProductos] = useState<
    ProductoDb[]
  >([])

  const [inventario, setInventario] = useState<
    InventarioLoteDb[]
  >([])

  const [stockDisponible, setStockDisponible] =
    useState<StockDisponibleLoteDb[]>([])

  const [vista, setVista] =
    useState<VistaInventario>("RESUMEN")

  const [productoDetalleId, setProductoDetalleId] =
    useState("")

  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] =
    useState<FiltroInventario>("DISPONIBLE")

  const [fechaIngresoDesde, setFechaIngresoDesde] =
    useState("")

  const [fechaIngresoHasta, setFechaIngresoHasta] =
    useState("")

  const [mostrarFormulario, setMostrarFormulario] =
    useState(false)

  const [loteEditandoId, setLoteEditandoId] =
    useState("")

  const [productoId, setProductoId] = useState("")
  const [lote, setLote] = useState("")

  const [fechaProduccion, setFechaProduccion] =
    useState(fechaHoy())

  const [fechaIngresoBodega, setFechaIngresoBodega] =
    useState(fechaHoy())

  const [fechaVencimiento, setFechaVencimiento] =
    useState("")

  const [cantidad, setCantidad] = useState("")

  const [loteEmpaque, setLoteEmpaque] =
    useState<InventarioLoteDb | null>(null)

  const [productoDestinoId, setProductoDestinoId] =
    useState("")

  const [cantidadEmpaque, setCantidadEmpaque] =
    useState("")

  const [guardandoEmpaque, setGuardandoEmpaque] =
    useState(false)

  const [loteAjuste, setLoteAjuste] =
    useState<InventarioLoteDb | null>(null)

  const [tipoAjuste, setTipoAjuste] =
    useState<"ENTRADA" | "SALIDA">("SALIDA")

  const [cantidadAjuste, setCantidadAjuste] =
    useState("")

  const [motivoAjuste, setMotivoAjuste] =
    useState("PRODUCTO_DANADO")

  const [observacionesAjuste, setObservacionesAjuste] =
    useState("")

  const [guardandoAjuste, setGuardandoAjuste] =
    useState(false)

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    cargarDatos()
  }, [])

  const productoSeleccionado = productos.find(
    (producto) => producto.id === productoId,
  )

  async function cargarDatos() {
    setCargando(true)
    setError("")

    try {
      const [
        productosDb,
        inventarioDb,
        stockDisponibleDb,
      ] = await Promise.all([
        obtenerProductosDb(),
        obtenerInventarioLotesDb(),
        obtenerStockDisponibleLotesDb(),
      ])

      setProductos(productosDb)
      setInventario(inventarioDb)
      setStockDisponible(stockDisponibleDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el inventario.",
      )
    } finally {
      setCargando(false)
    }
  }

  function calcularVencimiento(
    nuevoProductoId: string,
    nuevaFechaProduccion: string,
  ) {
    const producto = productos.find(
      (item) => item.id === nuevoProductoId,
    )

    if (!producto || !nuevaFechaProduccion) {
      setFechaVencimiento("")
      return
    }

    setFechaVencimiento(
      sumarDias(
        nuevaFechaProduccion,
        producto.vida_util_dias,
      ),
    )
  }

  function seleccionarProducto(
    nuevoProductoId: string,
  ) {
    setProductoId(nuevoProductoId)

    calcularVencimiento(
      nuevoProductoId,
      fechaProduccion,
    )
  }

  function cambiarFechaProduccion(
    nuevaFecha: string,
  ) {
    setFechaProduccion(nuevaFecha)

    calcularVencimiento(
      productoId,
      nuevaFecha,
    )
  }

  function limpiarFormulario() {
    setLoteEditandoId("")
    setProductoId("")
    setLote("")
    setFechaProduccion(fechaHoy())
    setFechaIngresoBodega(fechaHoy())
    setFechaVencimiento("")
    setCantidad("")
    setMostrarFormulario(false)
  }

  function abrirNuevoLote() {
    limpiarFormulario()
    setMostrarFormulario(true)
    setMensaje("")
    setError("")
  }

  function editarLote(
    registro: InventarioLoteDb,
  ) {
    setLoteEditandoId(registro.id)
    setProductoId(registro.producto_id)
    setLote(registro.lote)
    setFechaProduccion(
      registro.fecha_produccion,
    )
    setFechaIngresoBodega(
      registro.fecha_ingreso_bodega,
    )
    setFechaVencimiento(
      registro.fecha_vencimiento,
    )
    setCantidad(String(registro.cantidad))
    setMostrarFormulario(true)
    setMensaje("")
    setError("")
  }

  async function guardarLote() {
    setMensaje("")
    setError("")
    setGuardando(true)

    try {
      const cantidadNumerica =
        Number(cantidad)

      if (loteEditandoId) {
        await actualizarLoteInventarioDb(
          loteEditandoId,
          {
            lote,
            fechaProduccion,
            fechaIngresoBodega,
            fechaVencimiento,
            cantidad: cantidadNumerica,
          },
        )

        setMensaje(
          "Lote actualizado correctamente.",
        )
      } else {
        await crearLoteInventarioDb({
          productoId,
          lote,
          fechaProduccion,
          fechaIngresoBodega,
          fechaVencimiento,
          cantidad: cantidadNumerica,
        })

        setMensaje(
          "Lote creado correctamente.",
        )
      }

      limpiarFormulario()
      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el lote.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarLote(
    registro: InventarioLoteDb,
  ) {
    const confirmacion = window.confirm(
      `¿Eliminar el lote ${registro.lote} de ${
        registro.producto?.corto ??
        "este producto"
      }?`,
    )

    if (!confirmacion) return

    setMensaje("")
    setError("")

    try {
      await eliminarLoteInventarioDb(
        registro.id,
      )

      setMensaje(
        "Lote eliminado correctamente.",
      )

      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el lote.",
      )
    }
  }

  function obtenerDestinosEmpaque(
    registro: InventarioLoteDb,
  ) {
    const origen =
      registro.producto?.corto
        ?.trim()
        .toUpperCase() ?? ""

    const destinosPermitidos: Record<
      string,
      string[]
    > = {
      ROLLO: ["CHOCO TUTI"],
      "CHOCO TUTI": ["ROLLO"],
      "SANDUCHERO INTEGRAL": [
        "SANTA INTEGRAL",
        "SANTA MARIA SANDUCHERO INTEGRAL",
        "SANTAMARIA SANDUCHERO INTEGRAL",
      ],
      "SAND. INTEGRAL": [
        "SANTA INTEGRAL",
        "SANTA MARIA SANDUCHERO INTEGRAL",
        "SANTAMARIA SANDUCHERO INTEGRAL",
      ],
      "SANTA INTEGRAL": [
        "SANDUCHERO INTEGRAL",
        "SAND. INTEGRAL",
      ],
      "SANTA MARIA SANDUCHERO INTEGRAL": [
        "SANDUCHERO INTEGRAL",
        "SAND. INTEGRAL",
      ],
      "SANTAMARIA SANDUCHERO INTEGRAL": [
        "SANDUCHERO INTEGRAL",
        "SAND. INTEGRAL",
      ],
    }

    const nombresDestino =
      destinosPermitidos[origen] ?? []

    return productos
      .filter((producto) =>
        nombresDestino.includes(
          producto.corto.trim().toUpperCase(),
        ),
      )
      .sort((a, b) =>
        a.corto.localeCompare(b.corto),
      )
  }

  function abrirEmpaque(
    registro: InventarioLoteDb,
  ) {
    const disponibilidad =
      stockDisponible.find(
        (item) => item.id === registro.id,
      )

    const disponible =
      disponibilidad?.cantidad_disponible ??
      registro.cantidad

    if (disponible <= 0) {
           setError(
        "Este lote no tiene unidades disponibles para empacar.",
      )
      return
    }

    const destinos =
      obtenerDestinosEmpaque(registro)

    if (destinos.length === 0) {
      setError(
        `No existen destinos de empaque configurados para ${
          registro.producto?.corto ?? "este producto"
        }.`,
      )
      return
    }

    setLoteEmpaque(registro)
    setProductoDestinoId(destinos[0]?.id ?? "")
    setCantidadEmpaque("")
    setMensaje("")
    setError("")
  }

  function cerrarEmpaque() {
    setLoteEmpaque(null)
    setProductoDestinoId("")
    setCantidadEmpaque("")
  }

  async function confirmarEmpaque() {
    if (!loteEmpaque) return

    const cantidadNumerica =
      Number(cantidadEmpaque)

    setGuardandoEmpaque(true)
    setMensaje("")
    setError("")

    try {
      await convertirInventarioEmpaqueDb({
        inventarioOrigenId: loteEmpaque.id,
        productoDestinoId,
        cantidad: cantidadNumerica,
      })

      const productoDestino = productos.find(
        (producto) =>
          producto.id === productoDestinoId,
      )

      setMensaje(
        `${cantidadNumerica} unidades de ${
          loteEmpaque.producto?.corto ?? "producto"
        } fueron empacadas como ${
          productoDestino?.corto ?? "producto destino"
        }.`,
              )

      cerrarEmpaque()
      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo realizar el empaque.",
      )
    } finally {
      setGuardandoEmpaque(false)
    }
  }

  function abrirAjuste(
    registro: InventarioLoteDb,
      ) {
    setLoteAjuste(registro)
    setTipoAjuste("SALIDA")
    setCantidadAjuste("")
    setMotivoAjuste("PRODUCTO_DANADO")
    setObservacionesAjuste("")
    setMensaje("")
    setError("")
  }

  function cerrarAjuste() {
    setLoteAjuste(null)
    setCantidadAjuste("")
    setMotivoAjuste("PRODUCTO_DANADO")
    setObservacionesAjuste("")
  }

  function cambiarTipoAjuste(
    nuevoTipo: "ENTRADA" | "SALIDA",
  ) {
    setTipoAjuste(nuevoTipo)

    setMotivoAjuste(
      nuevoTipo === "ENTRADA"
        ? "CONTEO_FISICO"
        : "PRODUCTO_DANADO",
    )
  }

  async function confirmarAjuste() {
    if (!loteAjuste) return

    const cantidadNumerica =
      Number(cantidadAjuste)

    setGuardandoAjuste(true)
    setMensaje("")
    setError("")

    try {
      await ajustarInventarioLoteDb({
        inventarioLoteId: loteAjuste.id,
        tipo: tipoAjuste,
        cantidad: cantidadNumerica,
        motivo: motivoAjuste,
        observaciones:
          observacionesAjuste,
      })

      setMensaje(
        `Ajuste registrado: ${tipoAjuste} de ${cantidadNumerica} unidades en ${
          loteAjuste.producto?.corto ?? "producto"
        }, lote ${loteAjuste.lote}.`,
      )

      cerrarAjuste()
      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo ajustar el inventario.",
      )
    } finally {
      setGuardandoAjuste(false)
    }
  }

  function filtrarIngresosHoy() {
    const hoy = fechaHoy()
    setFechaIngresoDesde(hoy)
    setFechaIngresoHasta(hoy)
  }

  function limpiarFiltroFechas() {
    setFechaIngresoDesde("")
    setFechaIngresoHasta("")
  }

  const inventarioCompleto = useMemo(() => {
    return inventario.map((registro) => {
      const disponibilidad =
        stockDisponible.find(
          (item) => item.id === registro.id,
        )

      return {
        ...registro,

        cantidadReservada:
          disponibilidad
            ?.cantidad_reservada ?? 0,

        cantidadDisponible:
          disponibilidad
            ?.cantidad_disponible ??
          registro.cantidad,

        diasVencimiento:
          diasHastaVencimiento(
            registro.fecha_vencimiento,
          ),
      }
    })
  }, [inventario, stockDisponible])

  const inventarioFiltradoPorFecha = useMemo(() => {
    return inventarioCompleto.filter((registro) => {
      const coincideDesde =
        !fechaIngresoDesde ||
        registro.fecha_ingreso_bodega >=
          fechaIngresoDesde

      const coincideHasta =
        !fechaIngresoHasta ||
        registro.fecha_ingreso_bodega <=
          fechaIngresoHasta

      return coincideDesde && coincideHasta
    })
  }, [
    inventarioCompleto,
    fechaIngresoDesde,
    fechaIngresoHasta,
  ])

  const resumenPorSku = useMemo(() => {
    const resumen = new Map<
      string,
      {
        productoId: string
        codigo: string
        corto: string
        nombre: string
        stockFisico: number
        reservado: number
        disponible: number
        lotes: number
        proximoVencer: number
      }
    >()

    inventarioFiltradoPorFecha.forEach((registro) => {
      const productoId = registro.producto_id
      const existente = resumen.get(productoId)

      if (existente) {
        existente.stockFisico += registro.cantidad
        existente.reservado += registro.cantidadReservada
        existente.disponible += registro.cantidadDisponible

        if (registro.cantidadDisponible > 0) {
          existente.lotes += 1
        }

        if (
          registro.diasVencimiento >= 0 &&
          registro.diasVencimiento <= 7
        ) {
          existente.proximoVencer += 1
        }

        return
      }

      resumen.set(productoId, {
        productoId,
        codigo: registro.producto?.codigo ?? "",
        corto: registro.producto?.corto ?? "",
        nombre: registro.producto?.nombre ?? "",
        stockFisico: registro.cantidad,
        reservado: registro.cantidadReservada,
        disponible: registro.cantidadDisponible,
        lotes:
          registro.cantidadDisponible > 0
            ? 1
            : 0,
        proximoVencer:
          registro.diasVencimiento >= 0 &&
          registro.diasVencimiento <= 7
            ? 1
            : 0,
      })
    })

    const texto = busqueda.trim().toLowerCase()

    return [...resumen.values()]
      .filter(
        (registro) =>
          registro.stockFisico > 0 &&
          (
            texto === "" ||
            registro.codigo
              .toLowerCase()
              .includes(texto) ||
            registro.corto
              .toLowerCase()
              .includes(texto) ||
            registro.nombre
              .toLowerCase()
              .includes(texto)
          ),
      )
      .sort((a, b) =>
        a.corto.localeCompare(b.corto),
      )
  }, [
    inventarioFiltradoPorFecha,
    busqueda,
  ])

  function verLotesProducto(productoId: string) {
    setProductoDetalleId(productoId)
    setVista("LOTES")
    setFiltro("DISPONIBLE")
  }

  function volverResumen() {
    setProductoDetalleId("")
    setVista("RESUMEN")
  }

  const inventarioFiltrado = useMemo(() => {
    const texto =
      busqueda.trim().toLowerCase()

    return inventarioCompleto.filter(
      (registro) => {
        const coincideBusqueda =
          texto === "" ||
          registro.lote
            .toLowerCase()
            .includes(texto) ||
          (registro.producto?.codigo ?? "")
            .toLowerCase()
            .includes(texto) ||
          (registro.producto?.nombre ?? "")
            .toLowerCase()
            .includes(texto) ||
          (registro.producto?.corto ?? "")
            .toLowerCase()
            .includes(texto)

        const coincideFiltro =
          filtro === "TODOS" ||
          (filtro === "DISPONIBLE" &&
            registro.cantidadDisponible >
              0) ||
          (filtro === "AGOTADO" &&
            registro.cantidadDisponible ===
              0) ||
          (filtro ===
            "PROXIMO_VENCER" &&
            registro.diasVencimiento >=
              0 &&
            registro.diasVencimiento <= 7)

        const coincideProducto =
          !productoDetalleId ||
          registro.producto_id === productoDetalleId

        const coincideFechaDesde =
          !fechaIngresoDesde ||
          registro.fecha_ingreso_bodega >=
            fechaIngresoDesde

        const coincideFechaHasta =
          !fechaIngresoHasta ||
          registro.fecha_ingreso_bodega <=
            fechaIngresoHasta

        return (
          coincideBusqueda &&
          coincideFiltro &&
          coincideProducto &&
          coincideFechaDesde &&
          coincideFechaHasta
        )
      },
    )
  }, [
    inventarioCompleto,
    busqueda,
    filtro,
    productoDetalleId,
    fechaIngresoDesde,
    fechaIngresoHasta,
  ])

  const totalFisico =
    inventarioFiltradoPorFecha.reduce(
      (total, registro) =>
        total + registro.cantidad,
      0,
    )

  const totalReservado =
    inventarioFiltradoPorFecha.reduce(
      (total, registro) =>
        total +
        registro.cantidadReservada,
      0,
    )

  const totalDisponible =
    inventarioFiltradoPorFecha.reduce(
      (total, registro) =>
        total +
        registro.cantidadDisponible,
      0,
    )

  const lotesProximosVencer =
    inventarioFiltradoPorFecha.filter(
      (registro) =>
        registro.diasVencimiento >= 0 &&
        registro.diasVencimiento <= 7,
    ).length

  return (
    <main className="c1-inventory" style={pagina}>
      <style>{inventarioResponsiveCss}</style>
      <header className="inventory-header" style={cabecera}>
        <div>
          <span style={etiqueta}>
            MÓDULO DE BODEGA
          </span>

          <h1 style={titulo}>
            {moduloInventario === "TERMINADO"
              ? "Inventario"
              : "Semielaborados"}
          </h1>

          <p style={subtitulo}>
            {moduloInventario === "TERMINADO"
              ? "Control centralizado de producto terminado por lote."
              : "Control de bases pendientes de etiquetar y conversión a producto final."}
          </p>
        </div>

        {moduloInventario === "TERMINADO" && (
          <div className="inventory-header-actions" style={accionesCabecera}>
            <button
              type="button"
              onClick={cargarDatos}
              disabled={cargando}
              style={botonSecundario}
            >
              {cargando
                ? "Actualizando..."
                : "Actualizar"}
            </button>

            <button
              type="button"
              onClick={abrirNuevoLote}
              style={botonPrincipal}
            >
              Nuevo lote
            </button>
          </div>
        )}
      </header>

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

      <div className="inventory-module-tabs" style={pestanasModulo}>
        <button
          type="button"
          onClick={() =>
            setModuloInventario("TERMINADO")
          }
          style={{
            ...botonModulo,
            ...(moduloInventario === "TERMINADO"
              ? botonModuloActivo
              : {}),
          }}
        >
          Inventario terminado
        </button>

        <button
          type="button"
          onClick={() =>
            setModuloInventario("SEMIELABORADOS")
          }
          style={{
            ...botonModulo,
            ...(moduloInventario ===
            "SEMIELABORADOS"
              ? botonModuloActivo
              : {}),
          }}
        >
          Semielaborados
        </button>
      </div>

      {moduloInventario === "TERMINADO" ? (
        <>
      <section className="inventory-kpis" style={indicadores}>
        <TarjetaIndicador
          titulo="Stock físico"
          valor={totalFisico}
          detalle="Unidades registradas"
        />

        <TarjetaIndicador
          titulo="Reservado"
          valor={totalReservado}
          detalle="Unidades comprometidas"
        />

        <TarjetaIndicador
          titulo="Disponible"
          valor={totalDisponible}
          detalle="Unidades libres"
        />

        <TarjetaIndicador
          titulo="Próximos a vencer"
          valor={lotesProximosVencer}
          detalle="Lotes hasta 7 días"
        />
      </section>

      <div className="inventory-view-tabs" style={pestanas}>
        <button
          type="button"
          onClick={volverResumen}
          style={{
            ...botonPestana,
            ...(vista === "RESUMEN"
              ? botonPestanaActiva
              : {}),
          }}
        >
          Resumen por SKU
        </button>

        <button
          type="button"
          onClick={() => {
            setProductoDetalleId("")
            setVista("LOTES")
          }}
          style={{
            ...botonPestana,
            ...(vista === "LOTES"
              ? botonPestanaActiva
              : {}),
          }}
        >
          Inventario por lote
        </button>
      </div>

      {mostrarFormulario && (
        <section className="inventory-panel inventory-form-panel" style={panelFormulario}>
          <div className="inventory-panel-title" style={tituloPanel}>
            <div>
              <h2 style={{ margin: 0 }}>
                {loteEditandoId
                  ? "Editar lote"
                  : "Nuevo lote"}
              </h2>

              <p style={descripcion}>
                La fecha de vencimiento se
                calcula automáticamente según
                la vida útil del producto.
                              </p>
            </div>

            <button
              type="button"
              onClick={limpiarFormulario}
              style={botonCerrar}
            >
              Cerrar
            </button>
          </div>

          <div className="inventory-form" style={formulario}>
            <div>
              <label style={label}>
                Producto
              </label>

              <select
                value={productoId}
                disabled={Boolean(
                  loteEditandoId,
                )}
                onChange={(evento) =>
                  seleccionarProducto(
                    evento.target.value,
                  )
                }
                style={campo}
              >
                <option value="">
                  Seleccione...
                </option>

                {productos
                  .filter(
                    (producto) =>
                      producto.activo,
                  )
                  .map((producto) => (
                    <option
                      key={producto.id}
                      value={producto.id}
                    >
                      {producto.corto} ·{" "}
                      {producto.codigo}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label style={label}>
                Vida útil
              </label>

              <input
                value={
                  productoSeleccionado
                    ? `${productoSeleccionado.vida_util_dias} días`
                    : ""
                }
                readOnly
                placeholder="Seleccione un producto"
                style={{
                  ...campo,
                  background: "#f4f5f7",
                               }}
              />
            </div>

            <div>
              <label style={label}>
                Lote
              </label>

              <input
                value={lote}
                onChange={(evento) =>
                  setLote(evento.target.value)
                }
                style={campo}
              />
            </div>

            <div>
              <label style={label}>
                Fecha de producción
              </label>
             <input
                type="date"
                value={fechaProduccion}
                onChange={(evento) =>
                  cambiarFechaProduccion(
                    evento.target.value,
                  )
                }
                style={campo}
              />
            </div>

            <div>
              <label style={label}>
                Fecha de ingreso a bodega
              </label>

              <input
                type="date"
                value={fechaIngresoBodega}
                onChange={(evento) =>
                  setFechaIngresoBodega(
                    evento.target.value,
                  )
                }
                style={campo}
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
                  fontWeight: "bold",
                  color: "#8f1d24",
                }}
              />
            </div>

            <div>
              <label style={label}>
                Cantidad física
              </label>

              <input
                type="number"
                min="0"
                step="1"
                value={cantidad}
                onChange={(evento) =>
                  setCantidad(
                    evento.target.value,
                  )
                }
                style={campo}
              />
            </div>
          </div>

          <div className="inventory-form-actions" style={accionesFormulario}>
            <button
              type="button"
              onClick={limpiarFormulario}
              style={botonSecundario}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={guardarLote}
              disabled={guardando}
              style={{
                ...botonPrincipal,
                opacity: guardando
                  ? 0.5
                  : 1,
              }}
            >
              {guardando
                ? "Guardando..."
                : loteEditandoId
                  ? "Actualizar lote"
                  : "Guardar lote"}
            </button>
          </div>
        </section>
      )}

      {loteEmpaque && (
        <div style={fondoModal}>
          <section className="inventory-modal inventory-pack-modal" style={modalEmpaque}>
            <div style={tituloPanel}>
              <div>
                <span style={etiqueta}>
                  MÓDULO DE EMPAQUE
                </span>

                <h2 style={{ margin: "5px 0" }}>
                  Convertir producto
                </h2>

                <p style={descripcion}>
                  Conserva el lote y las fechas, pero cambia
                  el SKU comercial.
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarEmpaque}
                disabled={guardandoEmpaque}
                style={botonCerrar}
              >
                Cerrar
              </button>
            </div>

            {error && (
              <div style={mensajeError}>
                {error}
              </div>
            )}

            <div className="inventory-modal-kpis" style={datosEmpaque}>
              <div style={datoEmpaque}>
                <span style={datoTitulo}>
                  Producto origen
                </span>
                <strong>
                  {loteEmpaque.producto?.corto ?? ""}
                </strong>
              </div>

              <div style={datoEmpaque}>
                <span style={datoTitulo}>Lote</span>
                <strong>{loteEmpaque.lote}</strong>
              </div>

              <div style={datoEmpaque}>
                <span style={datoTitulo}>
                  Disponible
                </span>
                <strong>
                  {stockDisponible.find(
                    (item) => item.id === loteEmpaque.id,
                  )?.cantidad_disponible ??
                    loteEmpaque.cantidad}
                </strong>
              </div>

              <div style={datoEmpaque}>
                <span style={datoTitulo}>
                  Vencimiento
                </span>
                <strong>
                  {loteEmpaque.fecha_vencimiento}
                </strong>
              </div>
            </div>

            <div className="inventory-modal-form" style={formularioEmpaque}>
              <div>
                <label style={label}>
                  Empacar como
                </label>
                <select
                  value={productoDestinoId}
                  onChange={(evento) =>
                    setProductoDestinoId(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  {obtenerDestinosEmpaque(
                    loteEmpaque,
                  ).map((producto) => (
                    <option
                      key={producto.id}
                      value={producto.id}
                    >
                      {producto.corto} · {producto.codigo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>
                  Cantidad a convertir
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cantidadEmpaque}
                  onChange={(evento) =>
                    setCantidadEmpaque(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>
            </div>

            <div style={accionesFormulario}>
              <button
                type="button"
                onClick={cerrarEmpaque}
                disabled={guardandoEmpaque}
                style={botonSecundario}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarEmpaque}
                disabled={guardandoEmpaque}
                style={{
                  ...botonPrincipal,
                  opacity: guardandoEmpaque ? 0.5 : 1,
                }}
              >
                {guardandoEmpaque
                  ? "Procesando..."
                  : "Confirmar empaque"}
              </button>
            </div>
          </section>
        </div>
      )}

      {loteAjuste && (
        <div style={fondoModal}>
          <section className="inventory-modal inventory-adjust-modal" style={modalAjuste}>
            <div style={tituloPanel}>
              <div>
                <span style={etiqueta}>
                  AJUSTE DE INVENTARIO
                </span>

                <h2 style={{ margin: "5px 0" }}>
                  Registrar ajuste
                </h2>

                <p style={descripcion}>
                  El movimiento quedará registrado
                  con motivo, usuario y fecha.
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarAjuste}
                disabled={guardandoAjuste}
                style={botonCerrar}
              >
                Cerrar
              </button>
            </div>

            {error && (
              <div style={mensajeError}>
                {error}
              </div>
            )}

            <div className="inventory-modal-kpis" style={datosAjuste}>
              <div style={datoAjuste}>
                <span style={datoTitulo}>
                  Producto
                </span>

                <strong>
                  {loteAjuste.producto?.corto ?? ""}
                </strong>
              </div>

              <div style={datoAjuste}>
                <span style={datoTitulo}>
                  Lote
                </span>

                <strong>
                  {loteAjuste.lote}
                </strong>
              </div>

              <div style={datoAjuste}>
                <span style={datoTitulo}>
                  Físico
                </span>

                <strong>
                  {loteAjuste.cantidad}
                </strong>
              </div>

              <div style={datoAjuste}>
                <span style={datoTitulo}>
                  Disponible
                </span>

                <strong>
                  {stockDisponible.find(
                    (item) =>
                      item.id === loteAjuste.id,
                  )?.cantidad_disponible ??
                    loteAjuste.cantidad}
                </strong>
              </div>
            </div>

            <div className="inventory-modal-form" style={formularioAjuste}>
              <div>
                <label style={label}>
                  Tipo de ajuste
                </label>

                <select
                  value={tipoAjuste}
                  onChange={(evento) =>
                    cambiarTipoAjuste(
                      evento.target.value as
                        | "ENTRADA"
                        | "SALIDA",
                    )
                  }
                  style={campo}
                >
                  <option value="ENTRADA">
                    Entrada
                  </option>

                  <option value="SALIDA">
                    Salida
                  </option>
                </select>
              </div>

              <div>
                <label style={label}>
                  Cantidad
                </label>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cantidadAjuste}
                  onChange={(evento) =>
                    setCantidadAjuste(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label style={label}>
                  Motivo
                </label>

                <select
                  value={motivoAjuste}
                  onChange={(evento) =>
                    setMotivoAjuste(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  {tipoAjuste === "ENTRADA" ? (
                    <>
                      <option value="CONTEO_FISICO">
                        Conteo físico
                      </option>

                      <option value="DEVOLUCION_INTERNA">
                        Devolución interna
                      </option>

                      <option value="CORRECCION_REGISTRO">
                        Corrección de registro
                      </option>

                      <option value="OTRO">
                        Otro
                      </option>
                    </>
                  ) : (
                    <>
                      <option value="PRODUCTO_DANADO">
                        Producto dañado
                      </option>

                      <option value="DONACION">
                        Donación
                      </option>

                      <option value="MUESTRA">
                        Muestra
                      </option>

                      <option value="CONSUMO_INTERNO">
                        Consumo interno
                      </option>

                      <option value="CORRECCION_REGISTRO">
                        Corrección de registro
                      </option>

                      <option value="OTRO">
                        Otro
                      </option>
                    </>
                  )}
                </select>
              </div>

              <div style={campoObservaciones}>
                <label style={label}>
                  Observaciones
                </label>

                <textarea
                  value={observacionesAjuste}
                  onChange={(evento) =>
                    setObservacionesAjuste(
                      evento.target.value,
                    )
                  }
                  rows={3}
                  placeholder="Detalle opcional del ajuste"
                  style={{
                    ...campo,
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            <div style={accionesFormulario}>
              <button
                type="button"
                          onClick={cerrarAjuste}
                disabled={guardandoAjuste}
                style={botonSecundario}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarAjuste}
                disabled={guardandoAjuste}
                style={{
                  ...botonPrincipal,
                  opacity: guardandoAjuste
                    ? 0.5
                    : 1,
                }}
              >
                {guardandoAjuste
                  ? "Guardando..."
                  : "Confirmar ajuste"}
              </button>
            </div>
          </section>
        </div>
      )}

      {vista === "RESUMEN" && (
        <section className="inventory-panel inventory-summary-panel" style={panel}>
          <div className="inventory-panel-title" style={tituloPanel}>
            <div>
              <h2 style={{ margin: 0 }}>
                Resumen por SKU
              </h2>

              <p style={descripcion}>
                Existencias consolidadas sin importar el lote.
                              </p>
            </div>

            <span style={contador}>
              {resumenPorSku.length}
            </span>
          </div>

          <div className="inventory-summary-filters" style={filtrosResumenGlobal}>
            <input
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
              placeholder="Buscar producto o código"
              style={campo}
            />

            <div>
              <label style={labelFiltroFecha}>
                Ingreso desde
              </label>

              <input
                type="date"
                value={fechaIngresoDesde}
                onChange={(evento) =>
                  setFechaIngresoDesde(
                    evento.target.value,
                  )
                }
                style={campo}
              />
            </div>

            <div>
              <label style={labelFiltroFecha}>
                Ingreso hasta
              </label>

              <input
                type="date"
                value={fechaIngresoHasta}
                onChange={(evento) =>
                  setFechaIngresoHasta(
                    evento.target.value,
                  )
                }
                style={campo}
              />
            </div>

            <button
              type="button"
              onClick={filtrarIngresosHoy}
              style={botonFiltroHoy}
            >
              Ingresos de hoy
            </button>

            <button
              type="button"
              onClick={limpiarFiltroFechas}
              disabled={
                !fechaIngresoDesde &&
                !fechaIngresoHasta
              }
              style={{
                ...botonLimpiarFiltro,
                opacity:
                  !fechaIngresoDesde &&
                  !fechaIngresoHasta
                    ? 0.5
                    : 1,
              }}
            >
              Limpiar fechas
            </button>
          </div>

          {(fechaIngresoDesde ||
            fechaIngresoHasta) && (
            <div style={avisoFiltroActivo}>
              Mostrando ingresos de bodega
              {fechaIngresoDesde
                ? ` desde ${fechaIngresoDesde}`
                : ""}
              {fechaIngresoHasta
                ? ` hasta ${fechaIngresoHasta}`
                : ""}.
            </div>
          )}

          {cargando ? (
            <div style={estadoVacio}>
              Cargando inventario...
            </div>
          ) : resumenPorSku.length === 0 ? (
            <div style={estadoVacio}>
              No existen productos con inventario.
            </div>
          ) : (
            <div className="inventory-summary-table" style={{ overflowX: "auto" }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>Producto</th>
                    <th style={encabezado}>Stock físico</th>
                    <th style={encabezado}>Reservado</th>
                    <th style={encabezado}>Disponible</th>
                    <th style={encabezado}>Lotes</th>
                    <th style={encabezado}>
                      Próximos a vencer
                    </th>
                    <th style={encabezado}>Detalle</th>
                  </tr>
                </thead>

                <tbody>
                  {resumenPorSku.map((registro) => (
                    <tr
                      key={registro.productoId}
                      onClick={() =>
                        verLotesProducto(
                          registro.productoId,
                        )
                      }
                      style={filaClickeable}
                    >
                      <td style={celda}>
                        <strong>{registro.corto}</strong>
                                          <br />
                        <small>{registro.nombre}</small>
                      </td>

                      <td style={celdaNumero}>
                        <strong>
                          {registro.stockFisico}
                        </strong>
                      </td>

                      <td style={celdaNumero}>
                        {registro.reservado}
                      </td>

                      <td style={celdaNumero}>
                        <strong
                          style={{
                            color:
                              registro.disponible > 0
                                ? "#15803d"
                                : "#b91c1c",
                          }}
                        >
                          {registro.disponible}
                        </strong>
                      </td>

                      <td style={celdaNumero}>
                        {registro.lotes}
                      </td>

                      <td style={celdaNumero}>
                        <span
                          style={
                            registro.proximoVencer > 0
                              ? badgeAlerta
                              : badgeCorrecto
                          }
                        >
                          {registro.proximoVencer}
                        </span>
                      </td>

                      <td style={celda}>
                        <button
                          type="button"
                          onClick={(evento) => {
                            evento.stopPropagation()
                            verLotesProducto(
                              registro.productoId,
                            )
                          }}
                          style={botonVerLotes}
                        >
                          Ver lotes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {vista === "LOTES" && (
      <section className="inventory-panel inventory-lots-panel" style={panel}>
        <div className="inventory-panel-title" style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Inventario por lote
            </h2>

            <p style={descripcion}>
              Stock físico, reservado y
              disponible para FEFO.
            </p>
          </div>

          <div className="inventory-title-actions" style={accionesTitulo}>
            {productoDetalleId && (
              <button
                type="button"
                onClick={volverResumen}
                style={botonSecundario}
              >
                Volver al resumen
              </button>
            )}

            <span style={contador}>
              {inventarioFiltrado.length}
            </span>
          </div>
        </div>

        <div className="inventory-lots-filters" style={filtros}>
          <input
            value={busqueda}
            onChange={(evento) =>
              setBusqueda(
                evento.target.value,
              )
            }
            placeholder="Buscar producto, código o lote"
            style={campo}
          />

          <select
            value={filtro}
            onChange={(evento) =>
              setFiltro(
                evento.target
                  .value as FiltroInventario,
              )
            }
            style={campo}
          >
            <option value="TODOS">
              Todos
            </option>

            <option value="DISPONIBLE">
              Con disponibilidad
            </option>

            <option value="AGOTADO">
              Agotados
            </option>

            <option value="PROXIMO_VENCER">
              Próximos a vencer
            </option>
          </select>

          <div>
            <label style={labelFiltroFecha}>
              Ingreso desde
            </label>

            <input
              type="date"
              value={fechaIngresoDesde}
              onChange={(evento) =>
                setFechaIngresoDesde(
                  evento.target.value,
                )
              }
              style={campo}
            />
          </div>

          <div>
            <label style={labelFiltroFecha}>
              Ingreso hasta
            </label>

            <input
              type="date"
              value={fechaIngresoHasta}
              onChange={(evento) =>
                setFechaIngresoHasta(
                  evento.target.value,
                )
              }
              style={campo}
            />
          </div>

          <button
            type="button"
            onClick={filtrarIngresosHoy}
            style={botonFiltroHoy}
          >
            Ingresos de hoy
          </button>

          <button
            type="button"
            onClick={limpiarFiltroFechas}
            disabled={
              !fechaIngresoDesde &&
              !fechaIngresoHasta
            }
            style={{
              ...botonLimpiarFiltro,
              opacity:
                !fechaIngresoDesde &&
                !fechaIngresoHasta
                  ? 0.5
                  : 1,
            }}
          >
            Limpiar fechas
          </button>
        </div>

        {cargando ? (
          <div style={estadoVacio}>
            Cargando inventario...
          </div>
        ) : inventarioFiltrado.length ===
          0 ? (
          <div style={estadoVacio}>
            No existen lotes con estos
            filtros.
          </div>
        ) : (
          <div className="inventory-lots-table" style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Producto
                  </th>

                  <th style={encabezado}>
                    Código
                  </th>

                  <th style={encabezado}>
                    Lote
                  </th>

                  <th style={encabezado}>
                    Producción
                  </th>

                  <th style={encabezado}>
                    Ingreso a bodega
                  </th>

                  <th style={encabezado}>
                    Vencimiento
                  </th>

                  <th style={encabezado}>
                    Días
                  </th>

                  <th style={encabezado}>
                    Físico
                  </th>

                  <th style={encabezado}>
                    Reservado
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
                {inventarioFiltrado.map(
                  (registro) => (
                    <tr key={registro.id}>
                      <td style={celda}>
                        <strong>
                          {registro.producto
                            ?.corto ?? ""}
                        </strong>

                        <br />

                        <small>
                          {registro.producto
                            ?.nombre ?? ""}
                        </small>
                      </td>

                      <td style={celda}>
                        {registro.producto
                          ?.codigo ?? ""}
                      </td>

                      <td style={celda}>
                        <strong>
                          {registro.lote}
                        </strong>
                      </td>

                      <td style={celda}>
                        {
                          registro.fecha_produccion
                        }
                      </td>

                      <td style={celda}>
                        {
                          registro.fecha_ingreso_bodega
                        }
                      </td>

                      <td style={celda}>
                        {
                          registro.fecha_vencimiento
                        }
                      </td>

                      <td style={celda}>
                        <span
                          style={badgeVencimiento(
                            registro.diasVencimiento,
                          )}
                        >
                          {
                            registro.diasVencimiento
                          }
                        </span>
                      </td>

                      <td style={celda}>
                        {registro.cantidad}
                      </td>

                      <td style={celda}>
                        {
                          registro.cantidadReservada
                        }
                      </td>

                      <td style={celda}>
                        <strong
                          style={{
                            color:
                              registro.cantidadDisponible >
                              0
                                ? "#15803d"
                                : "#b91c1c",
                          }}
                        >
                          {
                            registro.cantidadDisponible
                          }
                        </strong>
                      </td>

                      <td style={celda}>
                        <div
                          style={accionesTabla}
                        >
                          {obtenerDestinosEmpaque(
                            registro,
                          ).length > 0 &&
                            registro.cantidadDisponible > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  abrirEmpaque(registro)
                                }
                                style={botonEmpacar}
                              >
                                Empacar
                              </button>
                            )}

                          <button
                            type="button"
                            onClick={() =>
                              abrirAjuste(
                                registro,
                              )
                            }
                            style={botonAjustar}
                          >
                            Ajustar
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              editarLote(
                                registro,
                              )
                            }
                            style={botonEditar}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              eliminarLote(
                                registro,
                              )
                            }
                            style={botonEliminar}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
        </>
      ) : (
        <EtiquetadoSemielaborados />
      )}
    </main>
  )
}

type TarjetaIndicadorProps = {
  titulo: string
  valor: number
  detalle: string
}

function TarjetaIndicador({
  titulo,
  valor,
  detalle,
}: TarjetaIndicadorProps) {
  return (
    <article style={tarjetaIndicador}>
      <span style={datoTitulo}>
        {titulo}
      </span>

      <strong style={valorIndicador}>
        {valor}
              </strong>
    <span style={detalleIndicador}>
        {detalle}
      </span>
    </article>
  )
}

function badgeVencimiento(dias: number) {
  if (dias < 0 || dias <= 3) {
    return {
      ...badgeBase,
      background: "#fee2e2",
      color: "#991b1b",
    }
  }

  if (dias <= 7) {
    return {
      ...badgeBase,
      background: "#fef3c7",
      color: "#92400e",
    }
  }

  return {
    ...badgeBase,
    background: "#dcfce7",
    color: "#166534",
  }
  }

const pagina = {
  width: "100%",
  maxWidth: "none",
  boxSizing: "border-box" as const,
  padding: "20px 24px",
  margin: 0,
  color: "#25272b",
}

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  marginBottom: "24px",
}

const accionesCabecera = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "10px",
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

const pestanasModulo = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
  marginBottom: "22px",
  padding: "6px",
  borderRadius: "10px",
  background: "#e5e7eb",
  width: "fit-content",
}

const botonModulo = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "#6b7280",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonModuloActivo = {
  background: "#8f1d24",
  color: "white",
  boxShadow:
    "0 2px 8px rgba(15, 23, 42, 0.10)",
}

const indicadores = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "15px",
  marginBottom: "22px",
}

const tarjetaIndicador = {
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

const valorIndicador = {
  color: "#8f1d24",
  fontSize: "28px",
}

const detalleIndicador = {
  color: "#6b7280",
  fontSize: "12px",
}

const panel = {
  width: "100%",
  boxSizing: "border-box" as const,
  marginBottom: "22px",
  padding: "20px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "#ffffff",
  boxShadow:
    "0 6px 20px rgba(15, 23, 42, 0.05)",
}

const panelFormulario = {
  ...panel,
  borderTop: "4px solid #8f1d24",
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
    "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "16px",
}

const filtrosResumenGlobal = {
  display: "grid",
  gridTemplateColumns:
    "minmax(260px, 2fr) minmax(170px, 1fr) minmax(170px, 1fr) auto auto",
  gap: "12px",
  alignItems: "end",
  marginBottom: "18px",
}

const avisoFiltroActivo = {
  marginBottom: "16px",
  padding: "11px 13px",
  borderLeft: "4px solid #2563eb",
  borderRadius: "8px",
  background: "#eff6ff",
  color: "#1e40af",
  fontSize: "13px",
}

const filtros = {
  display: "grid",
  gridTemplateColumns:
    "minmax(250px, 2fr) minmax(180px, 1fr) minmax(170px, 1fr) minmax(170px, 1fr) auto auto",
  gap: "12px",
  alignItems: "end",
  marginBottom: "18px",
}

const labelFiltroFecha = {
  display: "block",
  marginBottom: "6px",
  color: "#6b7280",
  fontSize: "12px",
  fontWeight: "bold",
}

const botonFiltroHoy = {
  minHeight: "42px",
  padding: "9px 14px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonLimpiarFiltro = {
  minHeight: "42px",
  padding: "9px 14px",
  border: "1px solid #6b7280",
  borderRadius: "8px",
  background: "white",
  color: "#374151",
  fontWeight: "bold",
  cursor: "pointer",
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

const accionesFormulario = {
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

const botonCerrar = {
  padding: "8px 12px",
  border: "1px solid #cfd4da",
  borderRadius: "7px",
  background: "white",
  color: "#374151",
  cursor: "pointer",
}

const botonEditar = {
  padding: "7px 10px",
  border: "1px solid #8f1d24",
  borderRadius: "7px",
  background: "white",
  color: "#8f1d24",
  cursor: "pointer",
}

const botonEliminar = {
  padding: "7px 10px",
  border: "1px solid #dc2626",
  borderRadius: "7px",
  background: "white",
  color: "#dc2626",
  cursor: "pointer",
}

const accionesTabla = {
  display: "flex",
  gap: "8px",
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

const mensajeExito = {
  marginBottom: "20px",
  padding: "14px 16px",
  borderLeft: "5px solid #15803d",
  borderRadius: "8px",
  background: "#dcfce7",
  color: "#166534",
}

const mensajeError = {
  marginBottom: "20px",
  padding: "14px 16px",
  borderLeft: "5px solid #b91c1c",
  borderRadius: "8px",
  background: "#fee2e2",
  color: "#991b1b",
}

const estadoVacio = {
  padding: "30px",
  border: "1px dashed #cfd4da",
  borderRadius: "9px",
  color: "#6b7280",
  textAlign: "center" as const,
}

const tabla = {
  width: "100%",
  minWidth: "940px",
  tableLayout: "auto" as const,
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
  verticalAlign: "middle" as const,
}

const badgeBase = {
  display: "inline-block",
  minWidth: "34px",
  padding: "5px 8px",
  borderRadius: "999px",
  textAlign: "center" as const,
  fontSize: "11px",
  fontWeight: "bold",
}

const pestanas = {
  display: "flex",
  gap: "8px",
  marginBottom: "22px",
  padding: "6px",
  borderRadius: "10px",
  background: "#f3f4f6",
  width: "fit-content",
}

const botonPestana = {
  padding: "10px 16px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "#6b7280",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonPestanaActiva = {
  background: "white",
  color: "#8f1d24",
  boxShadow:
    "0 2px 8px rgba(15, 23, 42, 0.08)",
}

const filtroResumen = {
  maxWidth: "520px",
  marginBottom: "18px",
}

const accionesTitulo = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
}

const filaClickeable = {
  cursor: "pointer",
}

const botonVerLotes = {
  padding: "8px 12px",
  border: "1px solid #8f1d24",
  borderRadius: "7px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const celdaNumero = {
  ...celda,
  textAlign: "right" as const,
}

const badgeCorrecto = {
  ...badgeBase,
  background: "#dcfce7",
  color: "#166534",
}

const badgeAlerta = {
  ...badgeBase,
  background: "#fef3c7",
  color: "#92400e",
}

const botonEmpacar = {
  padding: "7px 10px",
  border: "1px solid #15803d",
  borderRadius: "7px",
  background: "white",
  color: "#15803d",
  fontWeight: "bold",
  cursor: "pointer",
}

const fondoModal = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 2000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  background: "rgba(15, 23, 42, 0.55)",
}

const modalEmpaque = {
  width: "min(850px, 96vw)",
  maxHeight: "92vh",
  overflowY: "auto" as const,
  padding: "24px",
  borderRadius: "14px",
  background: "white",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.25)",
}

const datosEmpaque = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  marginBottom: "20px",
}

const datoEmpaque = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "5px",
  padding: "13px",
  borderRadius: "9px",
  background: "#f7f8fa",
}

const formularioEmpaque = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
}

const botonAjustar = {
  padding: "7px 10px",
  border: "1px solid #2563eb",
  borderRadius: "7px",
  background: "white",
  color: "#2563eb",
  fontWeight: "bold",
  cursor: "pointer",
}

const modalAjuste = {
  width: "min(900px, 96vw)",
  maxHeight: "92vh",
  overflowY: "auto" as const,
  padding: "24px",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 24px 60px rgba(15, 23, 42, 0.25)",
}

const datosAjuste = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  marginBottom: "20px",
}

const datoAjuste = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "5px",
  padding: "13px",
  borderRadius: "9px",
  background: "#f7f8fa",
}

const formularioAjuste = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
}

const campoObservaciones = {
  gridColumn: "1 / -1",
}

const inventarioResponsiveCss = `
  .c1-inventory {
    --c1-vino: #8F1D24;
    --c1-vino-oscuro: #68151A;
    --c1-naranja: #F7931E;
    --c1-crema: #F8F5F1;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    box-sizing: border-box !important;
  }

  .c1-inventory .inventory-summary-panel,
  .c1-inventory .inventory-lots-panel {
    width: 100% !important;
    max-width: none !important;
    box-sizing: border-box !important;
  }

  .c1-inventory .inventory-summary-table,
  .c1-inventory .inventory-lots-table {
    width: 100% !important;
  }

  .c1-inventory .inventory-panel,
  .c1-inventory .inventory-kpis article {
    border-color: #eee3dd !important;
    box-shadow: 0 5px 18px rgba(72,42,32,.045) !important;
  }

  .c1-inventory .inventory-header h1,
  .c1-inventory .inventory-panel h2 {
    color: #4f2728;
  }

  .c1-inventory input:focus,
  .c1-inventory select:focus,
  .c1-inventory textarea:focus {
    outline: none;
    border-color: #F7931E !important;
    box-shadow: 0 0 0 3px rgba(247,147,30,.13);
  }

  .c1-inventory .inventory-header-actions button:last-child,
  .c1-inventory .inventory-form-actions button:last-child {
    background: linear-gradient(90deg,#F7931E,#FF7900) !important;
    color: white !important;
    border-color: transparent !important;
    box-shadow: 0 8px 20px rgba(247,147,30,.18);
  }

  @media (max-width: 1100px) {
    .c1-inventory {
      padding: 20px !important;
    }

    .c1-inventory .inventory-summary-filters,
    .c1-inventory .inventory-lots-filters {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
    }

    .c1-inventory .inventory-form {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
    }
  }

  @media (max-width: 760px) {
    .c1-inventory {
      padding: 12px 10px 26px !important;
      max-width: none !important;
      overflow-x: hidden;
    }

    .c1-inventory .inventory-header {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 12px !important;
      margin-bottom: 14px !important;
    }

    .c1-inventory .inventory-header h1 {
      font-size: 26px !important;
    }

    .c1-inventory .inventory-header p {
      font-size: 12px !important;
    }

    .c1-inventory .inventory-header-actions {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
    }

    .c1-inventory .inventory-header-actions button {
      width: 100%;
      min-height: 42px;
      padding: 8px !important;
    }

    .c1-inventory .inventory-module-tabs,
    .c1-inventory .inventory-view-tabs {
      width: 100% !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 5px !important;
      padding: 4px !important;
      margin-bottom: 12px !important;
    }

    .c1-inventory .inventory-module-tabs button,
    .c1-inventory .inventory-view-tabs button {
      width: 100%;
      min-height: 39px;
      padding: 8px 5px !important;
      font-size: 11px;
    }

    .c1-inventory .inventory-kpis {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      gap: 8px !important;
      margin-bottom: 12px !important;
    }

    .c1-inventory .inventory-kpis article {
      min-width: 0;
      padding: 11px !important;
      gap: 4px !important;
      border-radius: 11px !important;
    }

    .c1-inventory .inventory-kpis article span:first-child {
      font-size: 9px !important;
      line-height: 1.2;
    }

    .c1-inventory .inventory-kpis article strong {
      font-size: 21px !important;
    }

    .c1-inventory .inventory-kpis article span:last-child {
      font-size: 9px !important;
    }

    .c1-inventory .inventory-panel {
      padding: 13px !important;
      margin-bottom: 12px !important;
      border-radius: 12px !important;
    }

    .c1-inventory .inventory-panel-title {
      align-items: flex-start !important;
      gap: 8px !important;
      margin-bottom: 12px !important;
    }

    .c1-inventory .inventory-panel-title h2 {
      font-size: 18px;
    }

    .c1-inventory .inventory-panel-title p {
      font-size: 11px !important;
    }

    .c1-inventory .inventory-form,
    .c1-inventory .inventory-summary-filters,
    .c1-inventory .inventory-lots-filters,
    .c1-inventory .inventory-modal-form {
      grid-template-columns: 1fr !important;
      gap: 9px !important;
    }

    .c1-inventory .inventory-summary-filters > button,
    .c1-inventory .inventory-lots-filters > button {
      width: 100%;
      min-height: 40px;
    }

    .c1-inventory .inventory-form-actions {
      position: sticky;
      bottom: 74px;
      z-index: 25;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
      margin: 14px -3px -3px !important;
      padding-top: 8px;
      background: linear-gradient(180deg,rgba(255,255,255,0),white 30%);
    }

    .c1-inventory .inventory-form-actions button {
      width: 100%;
      min-height: 44px;
    }

    /* RESUMEN POR SKU -> TARJETAS */
    .c1-inventory .inventory-summary-table {
      overflow: visible !important;
    }

    .c1-inventory .inventory-summary-table table,
    .c1-inventory .inventory-lots-table table {
      min-width: 0 !important;
    }

    .c1-inventory .inventory-summary-table table,
    .c1-inventory .inventory-summary-table tbody,
    .c1-inventory .inventory-summary-table tr,
    .c1-inventory .inventory-summary-table td {
      display: block !important;
      width: 100% !important;
    }

    .c1-inventory .inventory-summary-table thead {
      display: none !important;
    }

    .c1-inventory .inventory-summary-table tbody {
      display: grid !important;
      gap: 9px;
    }

    .c1-inventory .inventory-summary-table tr {
      padding: 11px;
      border: 1px solid #eee3dd;
      border-radius: 12px;
      background: #fffdfb;
      box-shadow: 0 2px 8px rgba(72,42,32,.035);
    }

    .c1-inventory .inventory-summary-table td {
      min-height: 31px;
      display: grid !important;
      grid-template-columns: 116px minmax(0,1fr) !important;
      align-items: center;
      gap: 8px;
      padding: 4px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
      font-size: 12px;
    }

    .c1-inventory .inventory-summary-table td::before {
      color: #8e7c75;
      font-size: 9px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
    }

    .c1-inventory .inventory-summary-table td:nth-child(1)::before { content: "Producto"; }
    .c1-inventory .inventory-summary-table td:nth-child(2)::before { content: "Stock físico"; }
    .c1-inventory .inventory-summary-table td:nth-child(3)::before { content: "Reservado"; }
    .c1-inventory .inventory-summary-table td:nth-child(4)::before { content: "Disponible"; }
    .c1-inventory .inventory-summary-table td:nth-child(5)::before { content: "Lotes"; }
    .c1-inventory .inventory-summary-table td:nth-child(6)::before { content: "Por vencer"; }
    .c1-inventory .inventory-summary-table td:nth-child(7)::before { content: "Detalle"; }

    .c1-inventory .inventory-summary-table td:nth-child(1) {
      display: block !important;
      text-align: left !important;
      padding-bottom: 8px !important;
      border-bottom: 1px solid #f1e8e3 !important;
    }

    .c1-inventory .inventory-summary-table td:nth-child(1)::before {
      display: none;
    }

    .c1-inventory .inventory-summary-table td:nth-child(1) strong {
      color: var(--c1-vino);
      font-size: 15px;
    }

    .c1-inventory .inventory-summary-table td:nth-child(1) small {
      display: block;
      margin-top: 2px;
      color: #8b7b75;
      white-space: normal;
    }

    .c1-inventory .inventory-summary-table td:last-child button {
      width: 100%;
      min-height: 38px;
    }

    /* INVENTARIO POR LOTE -> TARJETAS */
    .c1-inventory .inventory-lots-table {
      overflow: visible !important;
    }

    .c1-inventory .inventory-lots-table table,
    .c1-inventory .inventory-lots-table tbody,
    .c1-inventory .inventory-lots-table tr,
    .c1-inventory .inventory-lots-table td {
      display: block !important;
      width: 100% !important;
    }

    .c1-inventory .inventory-lots-table thead {
      display: none !important;
    }

    .c1-inventory .inventory-lots-table tbody {
      display: grid !important;
      gap: 10px;
    }

    .c1-inventory .inventory-lots-table tr {
      padding: 11px;
      border: 1px solid #eee3dd;
      border-radius: 12px;
      background: #fffdfb;
      box-shadow: 0 2px 8px rgba(72,42,32,.035);
    }

    .c1-inventory .inventory-lots-table td {
      min-height: 31px;
      display: grid !important;
      grid-template-columns: 116px minmax(0,1fr) !important;
      align-items: center;
      gap: 8px;
      padding: 4px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
      font-size: 12px;
    }

    .c1-inventory .inventory-lots-table td::before {
      color: #8e7c75;
      font-size: 9px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
    }

    .c1-inventory .inventory-lots-table td:nth-child(1)::before { content: "Producto"; }
    .c1-inventory .inventory-lots-table td:nth-child(2)::before { content: "Código"; }
    .c1-inventory .inventory-lots-table td:nth-child(3)::before { content: "Lote"; }
    .c1-inventory .inventory-lots-table td:nth-child(4)::before { content: "Producción"; }
    .c1-inventory .inventory-lots-table td:nth-child(5)::before { content: "Ingreso bodega"; }
    .c1-inventory .inventory-lots-table td:nth-child(6)::before { content: "Vencimiento"; }
    .c1-inventory .inventory-lots-table td:nth-child(7)::before { content: "Días"; }
    .c1-inventory .inventory-lots-table td:nth-child(8)::before { content: "Físico"; }
    .c1-inventory .inventory-lots-table td:nth-child(9)::before { content: "Reservado"; }
    .c1-inventory .inventory-lots-table td:nth-child(10)::before { content: "Disponible"; }
    .c1-inventory .inventory-lots-table td:nth-child(11)::before { content: "Acciones"; }

    .c1-inventory .inventory-lots-table td:nth-child(1) {
      display: block !important;
      text-align: left !important;
      padding-bottom: 8px !important;
      border-bottom: 1px solid #f1e8e3 !important;
    }

    .c1-inventory .inventory-lots-table td:nth-child(1)::before {
      display: none;
    }

    .c1-inventory .inventory-lots-table td:nth-child(1) strong {
      color: var(--c1-vino);
      font-size: 15px;
    }

    .c1-inventory .inventory-lots-table td:nth-child(1) small {
      display: block;
      color: #8b7b75;
      white-space: normal;
    }

    .c1-inventory .inventory-lots-table td:last-child > div {
      justify-self: stretch;
      display: grid !important;
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: 7px !important;
      width: 100%;
    }

    .c1-inventory .inventory-lots-table td:last-child button {
      width: 100%;
      min-height: 38px;
      padding: 7px 5px !important;
      font-size: 10px;
    }

    .c1-inventory .inventory-title-actions {
      flex-wrap: wrap !important;
      justify-content: flex-end;
    }

    /* MODALES -> PANTALLA COMPLETA */
    .c1-inventory .inventory-modal {
      width: 100vw !important;
      height: 100dvh !important;
      max-height: 100dvh !important;
      border-radius: 0 !important;
      padding: 13px 11px 28px !important;
    }

    .c1-inventory .inventory-modal > div:first-child {
      position: sticky;
      top: -13px;
      z-index: 12;
      padding: 13px 0 10px;
      background: white;
    }

    .c1-inventory .inventory-modal-kpis {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      gap: 7px !important;
    }

    .c1-inventory .inventory-modal-kpis > div {
      min-width: 0;
      padding: 10px !important;
    }

    .c1-inventory .inventory-modal-kpis span {
      font-size: 9px !important;
    }

    .c1-inventory .inventory-modal-kpis strong {
      font-size: 12px;
      overflow-wrap: anywhere;
    }
  }
`
