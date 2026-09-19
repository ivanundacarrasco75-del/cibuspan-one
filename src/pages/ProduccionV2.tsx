import { useEffect, useMemo, useState } from "react"
import {
  editarProduccionCompletaDb,
  obtenerDetalleProduccionDb,
  obtenerHistorialProduccionesDb,
  obtenerProduccionSugeridaDb,
  registrarProduccionCompletaDb,
  type ProduccionDetalleHistorialDb,
  type ProduccionResumenHistorialDb,
  type ProduccionSugeridaDb,
} from "../repositories/produccionRepository"
import {
  obtenerTiposSemielaboradoDb,
  type SemielaboradoTipoDb,
} from "../repositories/semielaboradoRepository"
import ModalMensaje from "../components/ModalMensaje"
import ImportacionOrdenesHistoricas from "../components/produccion/ImportacionOrdenesHistoricas"

type SeleccionProduccion = Record<string, boolean>
type LotesPlanificados = Record<string, number>

type ProduccionConfirmada = {
  producto: ProduccionSugeridaDb
  lotes: number
  unidades: number
  lote: string
  fechaProduccion: string
  fechaVencimiento: string
}

type DetalleEdicionProduccion = {
  detalleId: string
  productoCodigo: string
  productoCorto: string
  tipoDestino:
    | "PRODUCTO_TERMINADO"
    | "SEMIELABORADO"
  numeroParadas: string
  unidades: string
  fechaProduccion: string
  lote: string
  fechaVencimiento: string
}

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
  const mes = String(resultado.getMonth() + 1).padStart(2, "0")
  const dia = String(resultado.getDate()).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function generarLote(fecha: string, codigoLote: string) {
  if (!fecha || !codigoLote) return ""

  const [, mes, dia] = fecha.split("-")
  return `${dia}${mes}${codigoLote.padStart(2, "0")}`
}

function formatearFechaDocumento(fecha: string) {
  if (!fecha) return "—"

  const [anio, mes, dia] = fecha.split("-")
  return `${dia}/${mes}/${anio}`
}

function textoOrdenProduccion(
  produccion: ProduccionResumenHistorialDb,
) {
  if (produccion.origen === "HISTORICO") {
    return produccion.numero_orden_externa || "ORDEN HISTÓRICA"
  }
  return `OP-${String(produccion.numero_produccion ?? 0).padStart(5, "0")}`
}

function cantidadHistorial(valor: number, decimales = 3) {
  const numero = Number(valor || 0)
  return numero.toLocaleString("es-EC", {
    minimumFractionDigits: Number.isInteger(numero) ? 0 : decimales,
    maximumFractionDigits: decimales,
  })
}

function escaparHtml(valor: unknown) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}


function CampoFechaCorta({
  valor,
  cambiar,
  soloLectura = false,
  compacto = false,
}: {
  valor: string
  cambiar?: (fechaIso: string) => void
  soloLectura?: boolean
  compacto?: boolean
}) {
  const visual = valor
    ? formatearFechaDocumento(valor)
    : "—"

  if (soloLectura || !cambiar) {
    return (
      <div
        style={{
          ...fechaCortaVisual,
          ...(compacto
            ? fechaCortaVisualCompacta
            : {}),
          background: "#f4f5f7",
        }}
      >
        {visual}
      </div>
    )
  }

  return (
    <label
      style={{
        ...contenedorFechaCorta,
        ...(compacto
          ? contenedorFechaCortaCompacto
          : {}),
      }}
      title="Seleccionar fecha"
    >
      <span style={textoFechaCorta}>
        {visual}
      </span>

      <span
        aria-hidden="true"
        style={iconoCalendario}
      >
        ▣
      </span>

      <input
        type="date"
        value={valor}
        onChange={(evento) =>
          cambiar(evento.target.value)
        }
        style={selectorFechaInvisible}
        aria-label="Seleccionar fecha"
      />
    </label>
  )
}

export default function ProduccionV2() {
  const [produccion, setProduccion] = useState<
    ProduccionSugeridaDb[]
  >([])

  const [tiposSemielaborado, setTiposSemielaborado] =
    useState<SemielaboradoTipoDb[]>([])

  const [seleccionados, setSeleccionados] =
    useState<SeleccionProduccion>({})

  const [lotesPlanificados, setLotesPlanificados] =
    useState<LotesPlanificados>({})

  const [vista, setVista] = useState<
    "SUGERIDA" | "INGRESADA"
  >("SUGERIDA")

  const [
    produccionesIngresadas,
    setProduccionesIngresadas,
  ] = useState<ProduccionResumenHistorialDb[]>([])

  const [cargandoHistorial, setCargandoHistorial] =
    useState(false)

  const [
    produccionHistorialSeleccionada,
    setProduccionHistorialSeleccionada,
  ] = useState<ProduccionResumenHistorialDb | null>(
    null,
  )

  const [
    detalleProduccionHistorial,
    setDetalleProduccionHistorial,
  ] = useState<ProduccionDetalleHistorialDb[]>([])

  const [
    cargandoDetalleHistorial,
    setCargandoDetalleHistorial,
  ] = useState(false)

  const [produccionEditando, setProduccionEditando] =
    useState<ProduccionResumenHistorialDb | null>(null)

  const [fechaGeneralEdicion, setFechaGeneralEdicion] =
    useState("")

  const [detallesEdicion, setDetallesEdicion] =
    useState<DetalleEdicionProduccion[]>([])

  const [cargandoEdicion, setCargandoEdicion] =
    useState(false)

  const [guardandoEdicion, setGuardandoEdicion] =
    useState(false)

  const [busqueda, setBusqueda] = useState("")
  const [soloNecesarios, setSoloNecesarios] =
    useState(true)

  const [mostrarConfirmacion, setMostrarConfirmacion] =
    useState(false)

  const [fechaProduccionGeneral, setFechaProduccionGeneral] =
    useState(fechaHoy())

  const [produccionConfirmada, setProduccionConfirmada] =
    useState<ProduccionConfirmada[]>([])

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    cargarProduccion()
  }, [])

  async function cargarProduccion() {
    setCargando(true)
    setError("")

    try {
      const [
        datos,
        tiposSemielaboradoDb,
      ] = await Promise.all([
        obtenerProduccionSugeridaDb(),
        obtenerTiposSemielaboradoDb(),
      ])

      setProduccion(datos)
      setTiposSemielaborado(
        tiposSemielaboradoDb,
      )

      setSeleccionados((seleccionActual) => {
        const nuevaSeleccion: SeleccionProduccion = {}

        datos.forEach((producto) => {
          const seleccionAnterior =
            seleccionActual[producto.producto_id]

          nuevaSeleccion[producto.producto_id] =
            seleccionAnterior !== undefined
              ? seleccionAnterior
              : producto.unidades_sugeridas > 0
        })

        return nuevaSeleccion
      })

      setLotesPlanificados((planActual) => {
        const nuevoPlan: LotesPlanificados = {}

        datos.forEach((producto) => {
          const planAnterior =
            planActual[producto.producto_id]

          nuevoPlan[producto.producto_id] =
            planAnterior !== undefined
              ? planAnterior
              : producto.lotes_sugeridos
        })

        return nuevoPlan
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo calcular la producción.",
      )
    } finally {
      setCargando(false)
    }
  }

  function cambiarSeleccion(
    productoId: string,
    incluir: boolean,
  ) {
    setSeleccionados((actuales) => ({
      ...actuales,
      [productoId]: incluir,
    }))
  }

  function cambiarLotes(
    productoId: string,
    cambio: number,
  ) {
    setLotesPlanificados((actuales) => {
      const cantidadActual = actuales[productoId] ?? 0
      const nuevaCantidad = Math.max(
        0,
        cantidadActual + cambio,
      )

      return {
        ...actuales,
        [productoId]: nuevaCantidad,
      }
    })

    if (cambio > 0) {
      setSeleccionados((actuales) => ({
        ...actuales,
        [productoId]: true,
      }))
    }
  }

  function seleccionarTodos() {
    const nuevaSeleccion: SeleccionProduccion = {}

    produccion.forEach((producto) => {
      nuevaSeleccion[producto.producto_id] =
        (lotesPlanificados[producto.producto_id] ?? 0) > 0
    })

    setSeleccionados(nuevaSeleccion)
  }

  function quitarTodos() {
    const nuevaSeleccion: SeleccionProduccion = {}

    produccion.forEach((producto) => {
      nuevaSeleccion[producto.producto_id] = false
    })

    setSeleccionados(nuevaSeleccion)
  }

  function restaurarSugerencia() {
    const nuevaSeleccion: SeleccionProduccion = {}
    const nuevoPlan: LotesPlanificados = {}

    produccion.forEach((producto) => {
      nuevoPlan[producto.producto_id] =
        producto.lotes_sugeridos

      nuevaSeleccion[producto.producto_id] =
        producto.lotes_sugeridos > 0
    })

    setLotesPlanificados(nuevoPlan)
    setSeleccionados(nuevaSeleccion)
  }

  async function cargarProduccionesIngresadas() {
    setCargandoHistorial(true)
    setError("")

    try {
      const datos =
        await obtenerHistorialProduccionesDb()

      setProduccionesIngresadas(datos)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el historial de producciones.",
      )
    } finally {
      setCargandoHistorial(false)
    }
  }

  async function abrirDetalleProduccionHistorial(
    produccion: ProduccionResumenHistorialDb,
  ) {
    setProduccionHistorialSeleccionada(
      produccion,
    )
    setDetalleProduccionHistorial([])
    setCargandoDetalleHistorial(true)
    setError("")

    try {
      const detalle =
        await obtenerDetalleProduccionDb(
          produccion.id,
        )

      setDetalleProduccionHistorial(detalle)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el detalle de la producción.",
      )
    } finally {
      setCargandoDetalleHistorial(false)
    }
  }

  function cerrarDetalleProduccionHistorial() {
    if (cargandoDetalleHistorial) return

    setProduccionHistorialSeleccionada(null)
    setDetalleProduccionHistorial([])
  }

  async function abrirEdicionProduccion(
    produccionSeleccionada: ProduccionResumenHistorialDb,
  ) {
    if (
      produccionSeleccionada.origen !== "APP" ||
      produccionSeleccionada.estado !== "REGISTRADA"
    ) {
      setError(
        "Solo se pueden editar producciones registradas desde CIBUSPAN ONE.",
      )
      return
    }

    setProduccionEditando(produccionSeleccionada)
    setFechaGeneralEdicion(
      produccionSeleccionada.fecha_produccion_general,
    )
    setDetallesEdicion([])
    setCargandoEdicion(true)
    setError("")

    try {
      const detalle = await obtenerDetalleProduccionDb(
        produccionSeleccionada.id,
      )

      const detallesAplicacion = detalle.filter(
        (registro) =>
          registro.origen === "APP" &&
          (registro.tipo_destino ===
            "PRODUCTO_TERMINADO" ||
            registro.tipo_destino ===
              "SEMIELABORADO"),
      )

      if (detallesAplicacion.length === 0) {
        throw new Error(
          "La orden no contiene producciones editables.",
        )
      }

      setDetallesEdicion(
        detallesAplicacion.map((registro) => ({
          detalleId: registro.detalle_id,
          productoCodigo: registro.producto_codigo,
          productoCorto: registro.producto_corto,
          tipoDestino:
            registro.tipo_destino === "SEMIELABORADO"
              ? "SEMIELABORADO"
              : "PRODUCTO_TERMINADO",
          numeroParadas: String(
            Number(registro.numero_paradas),
          ),
          unidades: String(Number(registro.unidades)),
          fechaProduccion: registro.fecha_produccion,
          lote: registro.lote ?? "",
          fechaVencimiento:
            registro.fecha_vencimiento ?? "",
        })),
      )
    } catch (err) {
      setProduccionEditando(null)
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo abrir la producción para editar.",
      )
    } finally {
      setCargandoEdicion(false)
    }
  }

  function cambiarDetalleEdicion(
    detalleId: string,
    cambios: Partial<DetalleEdicionProduccion>,
  ) {
    setDetallesEdicion((actuales) =>
      actuales.map((detalle) =>
        detalle.detalleId === detalleId
          ? { ...detalle, ...cambios }
          : detalle,
      ),
    )
  }

  function cerrarEdicionProduccion() {
    if (cargandoEdicion || guardandoEdicion) return

    setProduccionEditando(null)
    setFechaGeneralEdicion("")
    setDetallesEdicion([])
  }

  async function guardarEdicionProduccion() {
    if (!produccionEditando) return

    if (!fechaGeneralEdicion) {
      setError(
        "La fecha general de producción es obligatoria.",
      )
      return
    }

    const detallesNormalizados = detallesEdicion.map(
      (detalle) => ({
        ...detalle,
        numeroParadasNumero: Number(
          detalle.numeroParadas,
        ),
        unidadesNumero: Number(detalle.unidades),
        loteLimpio: detalle.lote.trim().toUpperCase(),
      }),
    )

    const invalido = detallesNormalizados.find(
      (detalle) =>
        !Number.isInteger(
          detalle.numeroParadasNumero,
        ) ||
        detalle.numeroParadasNumero <= 0 ||
        !Number.isInteger(detalle.unidadesNumero) ||
        detalle.unidadesNumero <= 0 ||
        !detalle.fechaProduccion ||
        (detalle.tipoDestino ===
          "PRODUCTO_TERMINADO" &&
          (!detalle.loteLimpio ||
            !detalle.fechaVencimiento ||
            detalle.fechaVencimiento <
              detalle.fechaProduccion)),
    )

    if (invalido) {
      setError(
        `Revisa paradas, unidades, lote y fechas de ${invalido.productoCorto}.`,
      )
      return
    }

    const confirmacion = window.confirm(
      `¿Guardar los cambios de ${textoOrdenProduccion(produccionEditando)}?\n\nEl inventario relacionado se actualizará automáticamente.`,
    )

    if (!confirmacion) return

    setGuardandoEdicion(true)
    setError("")
    setMensaje("")

    try {
      await editarProduccionCompletaDb({
        produccionId: produccionEditando.id,
        fechaProduccionGeneral: fechaGeneralEdicion,
        detalles: detallesNormalizados.map(
          (detalle) => ({
            detalleId: detalle.detalleId,
            numeroParadas:
              detalle.numeroParadasNumero,
            unidades: detalle.unidadesNumero,
            fechaProduccion:
              detalle.fechaProduccion,
            lote:
              detalle.tipoDestino ===
              "PRODUCTO_TERMINADO"
                ? detalle.loteLimpio
                : null,
            fechaVencimiento:
              detalle.tipoDestino ===
              "PRODUCTO_TERMINADO"
                ? detalle.fechaVencimiento
                : null,
          }),
        ),
      })

      await Promise.all([
        cargarProduccion(),
        cargarProduccionesIngresadas(),
      ])

      setProduccionEditando(null)
      setFechaGeneralEdicion("")
      setDetallesEdicion([])
      setMensaje(
        `${textoOrdenProduccion(produccionEditando)} actualizada correctamente.`,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo editar la producción.",
      )
    } finally {
      setGuardandoEdicion(false)
    }
  }

  async function cambiarVista(
    nuevaVista: "SUGERIDA" | "INGRESADA",
  ) {
    setVista(nuevaVista)

    if (nuevaVista === "INGRESADA") {
      await cargarProduccionesIngresadas()
    }
  }

  const produccionFiltrada = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()

    return produccion.filter((producto) => {
      const coincideBusqueda =
        texto === "" ||
        producto.codigo.toLowerCase().includes(texto) ||
        producto.nombre.toLowerCase().includes(texto) ||
        producto.corto.toLowerCase().includes(texto)

      const lotesPlan =
        lotesPlanificados[producto.producto_id] ?? 0

      const coincideNecesidad =
        !soloNecesarios ||
        producto.unidades_sugeridas > 0 ||
        lotesPlan > 0

      return coincideBusqueda && coincideNecesidad
    })
  }, [
    produccion,
    busqueda,
    soloNecesarios,
    lotesPlanificados,
  ])

  const productosIncluidos = useMemo(() => {
    return produccion.filter((producto) => {
      const incluido =
        seleccionados[producto.producto_id]

      const lotes =
        lotesPlanificados[producto.producto_id] ?? 0

      return incluido && lotes > 0
    })
  }, [
    produccion,
    seleccionados,
    lotesPlanificados,
  ])

  const totalPedidos = produccion.reduce(
    (total, producto) =>
      total + producto.pedidos_pendientes,
    0,
  )

  const totalDisponible = produccion.reduce(
    (total, producto) =>
      total + producto.inventario_disponible,
    0,
  )

  const totalLotesSeleccionados =
    productosIncluidos.reduce(
      (total, producto) =>
        total +
        (lotesPlanificados[producto.producto_id] ?? 0),
      0,
    )

  const totalProducirSeleccionado =
    productosIncluidos.reduce(
      (total, producto) => {
        const lotes =
          lotesPlanificados[producto.producto_id] ?? 0

        return total + lotes * producto.tamano_lote
      },
      0,
    )

  function obtenerTipoSemielaborado(
    productoId: string,
  ) {
    return (
      tiposSemielaborado.find(
        (tipo) =>
          tipo.producto_base_id ===
          productoId,
      ) ?? null
    )
  }

  function esSemielaborado(
    productoId: string,
  ) {
    return Boolean(
      obtenerTipoSemielaborado(productoId),
    )
  }

  function destinoProduccion(
    productoId: string,
  ) {
    return esSemielaborado(productoId)
      ? "PREBODEGA DE SEMIELABORADOS"
      : "INVENTARIO TERMINADO"
  }

  function abrirConfirmacion() {
    setMensaje("")
    setError("")

    if (productosIncluidos.length === 0) {
      setError(
        "Incluye al menos un producto con uno o más lotes.",
      )
      return
    }

    const productosSinCodigo = productosIncluidos.filter(
      (producto) =>
        !esSemielaborado(producto.producto_id) &&
        !producto.codigo_lote,
    )

    if (productosSinCodigo.length > 0) {
      setError(
        `Falta código de lote para: ${productosSinCodigo
          .map((producto) => producto.corto)
          .join(", ")}.`,
      )
      return
    }

    const fecha = fechaProduccionGeneral || fechaHoy()

    setProduccionConfirmada(
      productosIncluidos.map((producto) => {
        const lotes =
          lotesPlanificados[producto.producto_id] ?? 0

        const semi = esSemielaborado(producto.producto_id)
        return {
          producto,
          lotes,
          unidades: lotes * producto.tamano_lote,
          lote: semi ? "" : generarLote(fecha, producto.codigo_lote),
          fechaProduccion: fecha,
          fechaVencimiento: semi ? "" : sumarDias(fecha, producto.vida_util_dias),
        }
      }),
    )

    setMostrarConfirmacion(true)
  }

  function cambiarFechaGeneral(nuevaFecha: string) {
    setFechaProduccionGeneral(nuevaFecha)

    setProduccionConfirmada((actuales) =>
      actuales.map((registro) => {
        const semi = esSemielaborado(registro.producto.producto_id)
        return {
          ...registro,
          fechaProduccion: nuevaFecha,
          fechaVencimiento: semi ? "" : sumarDias(nuevaFecha, registro.producto.vida_util_dias),
          lote: semi ? "" : generarLote(nuevaFecha, registro.producto.codigo_lote),
        }
      }),
    )
  }

  function actualizarRegistro(
    productoId: string,
    cambios: Partial<ProduccionConfirmada>,
  ) {
    setProduccionConfirmada((actuales) =>
      actuales.map((registro) =>
        registro.producto.producto_id === productoId
          ? {
              ...registro,
              ...cambios,
            }
          : registro,
      ),
    )
  }

  function imprimirDetalleHistorico(
    produccion: ProduccionResumenHistorialDb,
    detalles: ProduccionDetalleHistorialDb[],
  ) {
    if (detalles.length === 0) {
      setError(
        "Esta producción no tiene detalles para imprimir.",
      )
      return
    }

    const ventana = window.open(
      "",
      "_blank",
      "width=1100,height=800",
    )

    if (!ventana) {
      setError(
        "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para esta página.",
      )
      return
    }

    const filas = detalles
      .map((detalle, indice) => {
        const semielaborado =
          detalle.tipo_destino ===
          "SEMIELABORADO"
        const micro = detalle.tipo_destino === "MICRO"

        const lote = semielaborado
          ? "SE ASIGNA AL ETIQUETAR"
          : detalle.lote || "—"

        const vencimiento =
          semielaborado ||
          !detalle.fecha_vencimiento
            ? "—"
            : formatearFechaDocumento(
                detalle.fecha_vencimiento,
              )

        return `
          <tr>
            <td class="centro">${indice + 1}</td>

            <td>
              <strong>${escaparHtml(
                detalle.producto_corto,
              )}</strong>
              <div class="secundario">
                ${escaparHtml(
                  detalle.producto_nombre,
                )}
              </div>
            </td>

            <td class="centro">
              ${escaparHtml(
                detalle.producto_codigo,
              )}
            </td>

            <td class="numero">
              ${micro ? "—" : cantidadHistorial(detalle.numero_paradas)}
            </td>

            <td class="numero">
              ${micro
                ? `${cantidadHistorial(detalle.kg_micro)} kg`
                : `${cantidadHistorial(detalle.unidades)} Unid.`}
            </td>

            <td class="lote">
              ${escaparHtml(lote)}
            </td>

            <td class="centro">
              ${formatearFechaDocumento(
                detalle.fecha_produccion,
              )}
            </td>

            <td class="centro">
              ${vencimiento}
            </td>
          </tr>
        `
      })
      .join("")

    ventana.document.write(`
      <!doctype html>
      <html lang="es-EC" translate="no">
        <head>
          <meta charset="utf-8" />
          <meta
            name="google"
            content="notranslate"
          />

          <title>
            Producción ${escaparHtml(textoOrdenProduccion(produccion))}
            - Lotes para empaque
          </title>

          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              font-size: 11px;
            }

            .cabecera {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 24px;
              margin-bottom: 14px;
              padding-bottom: 10px;
              border-bottom: 3px solid #8f1d24;
            }

            .marca {
              color: #8f1d24;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 1px;
            }

            h1 {
              margin: 4px 0;
              font-size: 23px;
            }

            .datos {
              text-align: right;
              line-height: 1.6;
            }

            .resumen {
              display: flex;
              gap: 30px;
              margin-bottom: 14px;
              padding: 9px 12px;
              border: 1px solid #d1d5db;
              background: #f9fafb;
            }

            .resumen strong {
              color: #8f1d24;
              font-size: 16px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            th {
              padding: 8px 6px;
              border: 1px solid #9ca3af;
              background: #8f1d24;
              color: white;
              text-align: left;
              font-size: 10px;
            }

            td {
              padding: 9px 6px;
              border: 1px solid #d1d5db;
              vertical-align: middle;
            }

            tbody tr:nth-child(even) {
              background: #f9fafb;
            }

            .centro {
              text-align: center;
            }

            .numero {
              text-align: right;
              font-weight: 700;
            }

            .lote {
              text-align: center;
              font-size: 16px;
              font-weight: 800;
              letter-spacing: 0.5px;
            }

            .secundario {
              margin-top: 2px;
              color: #6b7280;
              font-size: 8px;
            }

            .nota {
              margin-top: 12px;
              color: #6b7280;
              font-size: 9px;
            }

            .firmas {
              display: grid;
              grid-template-columns:
                repeat(2, 1fr);
              gap: 50px;
              margin-top: 28px;
            }

            .firma {
              padding-top: 20px;
              border-top: 1px solid #6b7280;
              text-align: center;
            }
          </style>
        </head>

        <body>
          <div class="cabecera">
            <div>
              <div class="marca">
                CIBUSPAN ONE
              </div>

              <h1>
                Hoja de lotes - Orden completa de producción
              </h1>

              <div>
                Producción N.º
                <strong>
                  ${escaparHtml(textoOrdenProduccion(produccion))}
                </strong>
              </div>
            </div>

            <div class="datos">
              Fecha de producción:
              <strong>
                ${formatearFechaDocumento(
                  produccion.fecha_produccion_general,
                )}
              </strong>
              <br />

              Registrada:
              ${escaparHtml(
                new Date(
                  produccion.creado_en,
                ).toLocaleString("es-EC"),
              )}
            </div>
          </div>

          <div class="resumen">
            <div>
              SKU<br />
              <strong>
                ${produccion.ordenes_micro > 0 ? "MICRO" : produccion.total_skus}
              </strong>
            </div>

            <div>
              ${produccion.ordenes_micro > 0 ? "Cantidad micro" : "Paradas"}<br />
              <strong>
                ${produccion.ordenes_micro > 0
                  ? `${cantidadHistorial(produccion.total_kg_micro)} kg`
                  : cantidadHistorial(produccion.total_paradas)}
              </strong>
            </div>

            <div>
              ${produccion.origen === "HISTORICO" ? "Costo histórico" : "Unidades"}<br />
              <strong>
                ${produccion.origen === "HISTORICO"
                  ? Number(produccion.costo_total ?? 0).toLocaleString("es-EC", { style: "currency", currency: "USD" })
                  : cantidadHistorial(produccion.total_unidades)}
              </strong>
            </div>
          </div>

          <table>
            <colgroup>
              <col style="width: 4%" />
              <col style="width: 24%" />
              <col style="width: 11%" />
              <col style="width: 8%" />
              <col style="width: 9%" />
              <col style="width: 16%" />
              <col style="width: 14%" />
              <col style="width: 14%" />
            </colgroup>

            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Código</th>
                <th>Paradas</th>
                <th>Cantidad</th>
                <th>LOTE</th>
                <th>Producción</th>
                <th>Vencimiento</th>
              </tr>
            </thead>

            <tbody>
              ${filas}
            </tbody>
          </table>

          <div class="nota">
            ${produccion.origen === "HISTORICO"
              ? "Orden importada para análisis histórico; no modifica el inventario disponible."
              : "Los semielaborados permanecen sin lote hasta el proceso de etiquetado."}
          </div>

          <div class="firmas">
            <div class="firma">
              Producción
            </div>

            <div class="firma">
              Empaque
            </div>
          </div>
        </body>
      </html>
    `)

    ventana.document.close()
    ventana.focus()

    window.setTimeout(() => {
      ventana.print()
    }, 350)
  }

  async function imprimirProduccionHistorial(
    produccion: ProduccionResumenHistorialDb,
  ) {
    setError("")

    try {
      const detalles =
        await obtenerDetalleProduccionDb(
          produccion.id,
        )

      imprimirDetalleHistorico(
        produccion,
        detalles,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo preparar la impresión.",
      )
    }
  }

  function imprimirPlanFechasLotes() {
    if (produccionConfirmada.length === 0) {
      setError(
        "No existen productos en el plan para imprimir.",
      )
      return
    }

    const ventana = window.open(
      "",
      "_blank",
      "width=1100,height=800",
    )

    if (!ventana) {
      setError(
        "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para esta página.",
      )
      return
    }

    const totalLotes = produccionConfirmada.reduce(
      (total, registro) =>
        total + registro.lotes,
      0,
    )

    const totalUnidades = produccionConfirmada.reduce(
      (total, registro) =>
        total + registro.unidades,
      0,
    )

    const filas = produccionConfirmada
      .map((registro, indice) => {
        const semi = esSemielaborado(
          registro.producto.producto_id,
        )

        const lote = semi
          ? "SE ASIGNA AL ETIQUETAR"
          : registro.lote || "—"

        const vencimiento = semi
          ? "—"
          : formatearFechaDocumento(
              registro.fechaVencimiento,
            )

        return `
          <tr>
            <td class="centro">${indice + 1}</td>
            <td>
              <strong>${escaparHtml(
                registro.producto.corto,
              )}</strong>
              <div class="secundario">
                ${escaparHtml(
                  registro.producto.nombre,
                )}
              </div>
            </td>
            <td>${escaparHtml(
              registro.producto.codigo,
            )}</td>
            <td class="numero">${registro.lotes}</td>
            <td class="numero">${registro.unidades}</td>
            <td class="centro">${escaparHtml(
              lote,
            )}</td>
            <td class="centro">${formatearFechaDocumento(
              registro.fechaProduccion,
            )}</td>
            <td class="centro">${vencimiento}</td>
            <td>${escaparHtml(
              destinoProduccion(
                registro.producto.producto_id,
              ),
            )}</td>
          </tr>
        `
      })
      .join("")

    const fechaEmision =
      new Date().toLocaleString("es-EC")

    ventana.document.write(`
      <!doctype html>
      <html lang="es-EC" translate="no">
        <head>
          <meta charset="utf-8" />\n          <meta name="google" content="notranslate" />
          <title>Plan de producción - Fechas y lotes</title>

          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              font-size: 10px;
            }

            .cabecera {
              display: flex;
              justify-content: space-between;
              gap: 24px;
              align-items: flex-start;
              margin-bottom: 14px;
              padding-bottom: 10px;
              border-bottom: 3px solid #8f1d24;
            }

            .marca {
              color: #8f1d24;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 1px;
            }

            h1 {
              margin: 4px 0 3px;
              font-size: 22px;
            }

            .subtitulo,
            .emision {
              color: #6b7280;
              line-height: 1.4;
            }

            .emision {
              text-align: right;
              white-space: nowrap;
            }

            .resumen {
              display: flex;
              gap: 28px;
              margin: 0 0 12px;
              padding: 9px 12px;
              border: 1px solid #d1d5db;
              background: #f9fafb;
            }

            .resumen strong {
              color: #8f1d24;
              font-size: 15px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            th {
              padding: 7px 5px;
              border: 1px solid #9ca3af;
              background: #8f1d24;
              color: white;
              font-size: 9px;
              text-align: left;
            }

            td {
              padding: 7px 5px;
              border: 1px solid #d1d5db;
              vertical-align: middle;
              overflow-wrap: anywhere;
            }

            tbody tr:nth-child(even) {
              background: #f9fafb;
            }

            .centro {
              text-align: center;
            }

            .numero {
              text-align: right;
              font-weight: 700;
            }

            .secundario {
              margin-top: 2px;
              color: #6b7280;
              font-size: 8px;
            }

            .pie {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 45px;
              margin-top: 26px;
            }

            .firma {
              padding-top: 20px;
              border-top: 1px solid #6b7280;
              text-align: center;
              color: #4b5563;
            }

            .nota {
              margin-top: 12px;
              color: #6b7280;
              font-size: 8px;
            }

            @media print {
              button {
                display: none !important;
              }
            }
          </style>
        </head>

        <body>
          <div class="cabecera">
            <div>
              <div class="marca">CIBUSPAN ONE</div>
              <h1>Plan de producción - Fechas y lotes</h1>
              <div class="subtitulo">
                Documento para entrega al área de Producción
              </div>
            </div>

            <div class="emision">
              Emitido:<br />
              <strong>${escaparHtml(fechaEmision)}</strong>
            </div>
          </div>

          <div class="resumen">
            <div>
              SKU<br />
              <strong>${produccionConfirmada.length}</strong>
            </div>

            <div>
              Lotes / paradas<br />
              <strong>${totalLotes}</strong>
            </div>

            <div>
              Unidades planificadas<br />
              <strong>${totalUnidades}</strong>
            </div>
          </div>

          <table>
            <colgroup>
              <col style="width: 4%" />
              <col style="width: 18%" />
              <col style="width: 10%" />
              <col style="width: 7%" />
              <col style="width: 8%" />
              <col style="width: 11%" />
              <col style="width: 11%" />
              <col style="width: 11%" />
              <col style="width: 20%" />
            </colgroup>

            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Código</th>
                <th>Lotes</th>
                <th>Unidades</th>
                <th>Lote</th>
                <th>Producción</th>
                <th>Vencimiento</th>
                <th>Destino</th>
              </tr>
            </thead>

            <tbody>
              ${filas}
            </tbody>
          </table>

          <div class="nota">
            Los semielaborados permanecen sin lote hasta el
            proceso de etiquetado. El lote final se genera
            según la fecha de elaboración de la etiqueta.
          </div>

          <div class="pie">
            <div class="firma">
              Entregado por
            </div>

            <div class="firma">
              Recibido por Producción
            </div>
          </div>
        </body>
      </html>
    `)

    ventana.document.close()
    ventana.focus()

    window.setTimeout(() => {
      ventana.print()
    }, 400)
  }

  async function ingresarProduccionCompleta() {
    if (produccionConfirmada.length === 0) return

    const registroInvalido = produccionConfirmada.find((registro) => {
      const semi = esSemielaborado(registro.producto.producto_id)
      if (!registro.fechaProduccion || !Number.isInteger(registro.unidades) || registro.unidades <= 0) return true
      if (semi) return false
      return !registro.lote.trim() || !registro.fechaVencimiento
    })

    if (registroInvalido) {
      setError(
        `Revisa los datos de ${registroInvalido.producto.corto}.`,
      )
      return
    }

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      let skuTerminados = 0
      let unidadesTerminadas = 0
      let skuSemielaborados = 0
      let unidadesSemielaboradas = 0

      const detalles =
        produccionConfirmada.map(
          (registro, indice) => {
            const tipoSemielaborado =
              obtenerTipoSemielaborado(
                registro.producto
                  .producto_id,
              )

            const esSemi =
              Boolean(tipoSemielaborado)

            if (esSemi) {
              skuSemielaborados += 1
              unidadesSemielaboradas +=
                registro.unidades
            } else {
              skuTerminados += 1
              unidadesTerminadas +=
                registro.unidades
            }

            return {
              productoId:
                registro.producto
                  .producto_id,

              tipoDestino: esSemi
                ? ("SEMIELABORADO" as const)
                : ("PRODUCTO_TERMINADO" as const),

              semielaboradoTipoId:
                tipoSemielaborado?.id ??
                null,

              numeroParadas:
                registro.lotes,

              tamanoParada:
                registro.producto
                  .tamano_lote,

              unidades:
                registro.unidades,

              fechaProduccion:
                registro.fechaProduccion,

              lote: esSemi
                ? null
                : registro.lote,

              fechaVencimiento: esSemi
                ? null
                : registro.fechaVencimiento,

              orden:
                indice + 1,
            }
          },
        )

      const produccionId =
        await registrarProduccionCompletaDb({
          fechaProduccionGeneral:
            fechaProduccionGeneral,
          detalles,
        })

      const resumenDestinos: string[] = []

      if (skuTerminados > 0) {
        resumenDestinos.push(
          `${skuTerminados} SKU y ${unidadesTerminadas} unidades a inventario terminado`,
        )
      }

      if (skuSemielaborados > 0) {
        resumenDestinos.push(
          `${skuSemielaborados} SKU y ${unidadesSemielaboradas} unidades a prebodega de semielaborados`,
        )
      }

      setMensaje(
        `Producción ingresada correctamente: ${resumenDestinos.join(
          "; ",
        )}.`,
      )

      setMostrarConfirmacion(false)
      setProduccionConfirmada([])
      setFechaProduccionGeneral(fechaHoy())

      await Promise.all([
        cargarProduccion(),
        cargarProduccionesIngresadas(),
      ])

      setVista("INGRESADA")

      const historialActualizado =
        await obtenerHistorialProduccionesDb()

      const produccionNueva =
        historialActualizado.find(
          (registro) =>
            registro.id === produccionId,
        )

      if (produccionNueva) {
        await abrirDetalleProduccionHistorial(
          produccionNueva,
        )
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo ingresar la producción completa.",
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main className="c1-production" style={pagina} translate="no">
      <style>{produccionResponsiveCss}</style>
      <header className="prod-header" style={cabecera}>
        <div>
          <span style={etiqueta}>
            MÓDULO DE PRODUCCIÓN
          </span>

          <h1 style={titulo}>
            Producción sugerida
          </h1>

          <p style={subtitulo}>
            Ajusta los lotes y registra toda la producción
            en una sola operación.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarProduccion}
          disabled={cargando || guardando}
          style={botonSecundario}
        >
          {cargando
            ? "Calculando..."
            : "Actualizar cálculo"}
        </button>
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

      <div className="prod-tabs" style={pestanas}>
        <button
          type="button"
          onClick={() => cambiarVista("SUGERIDA")}
          style={{
            ...botonPestana,
            ...(vista === "SUGERIDA"
              ? botonPestanaActiva
              : {}),
          }}
        >
          Producción sugerida
        </button>

        <button
          type="button"
          onClick={() => cambiarVista("INGRESADA")}
          style={{
            ...botonPestana,
            ...(vista === "INGRESADA"
              ? botonPestanaActiva
              : {}),
          }}
        >
          Historial de órdenes
        </button>
      </div>

      {vista === "SUGERIDA" && (
        <>
      <section className="prod-kpis" style={indicadores}>
        <TarjetaIndicador
          titulo="Pedidos pendientes"
          valor={totalPedidos}
          detalle="Unidades solicitadas"
        />

        <TarjetaIndicador
          titulo="Inventario disponible"
          valor={totalDisponible}
          detalle="Unidades libres"
        />

        <TarjetaIndicador
          titulo="Productos incluidos"
          valor={productosIncluidos.length}
          detalle="SKU seleccionados"
        />

        <TarjetaIndicador
          titulo="Lotes planificados"
          valor={totalLotesSeleccionados}
          detalle="Paradas de producción"
        />

        <TarjetaIndicador
          titulo="Unidades planificadas"
          valor={totalProducirSeleccionado}
          detalle="Total por fabricar"
        />
      </section>

      <section className="prod-panel" style={panel}>
        <div className="prod-panel-title" style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Plan de producción
            </h2>

            <p style={descripcion}>
              El sistema sugiere los lotes y el jefe de
              producción puede ajustarlos.
            </p>
          </div>

          <span style={contador}>
            {produccionFiltrada.length}
          </span>
        </div>

        <div className="prod-controls" style={barraControles}>
          <div className="prod-filters" style={filtros}>
            <input
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
              placeholder="Buscar producto o código"
              style={campo}
            />

            <label style={controlCheckbox}>
              <input
                type="checkbox"
                checked={soloNecesarios}
                onChange={(evento) =>
                  setSoloNecesarios(
                    evento.target.checked,
                  )
                }
              />

              Mostrar solo productos planificados
            </label>
          </div>

          <div className="prod-select-actions" style={accionesSeleccion}>
            <button
              type="button"
              onClick={restaurarSugerencia}
              style={botonSecundario}
            >
              Restaurar sugerencia
            </button>

            <button
              type="button"
              onClick={seleccionarTodos}
              style={botonSecundario}
            >
              Incluir todos
            </button>

            <button
              type="button"
              onClick={quitarTodos}
              style={botonQuitar}
            >
              Quitar todos
            </button>
          </div>
        </div>

        {cargando ? (
          <div style={estadoVacio}>
            Calculando producción...
          </div>
        ) : produccionFiltrada.length === 0 ? (
          <div style={estadoVacio}>
            No existen productos planificados.
          </div>
        ) : (
          <div className="prod-main-table" style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>Incluir</th>
                  <th style={encabezado}>Producto</th>
                  <th style={encabezado}>Pedidos</th>
                  <th style={encabezado}>Disponible</th>
                  <th style={encabezado}>Necesidad</th>
                  <th style={encabezado}>Tamaño lote</th>
                  <th style={encabezado}>Sugeridos</th>
                  <th style={encabezado}>
                    Lotes planificados
                  </th>
                  <th style={encabezado}>Unidades</th>
                </tr>
              </thead>

              <tbody>
                {produccionFiltrada.map((producto) => {
                  const incluido = Boolean(
                    seleccionados[producto.producto_id],
                  )

                  const lotes =
                    lotesPlanificados[
                      producto.producto_id
                    ] ?? 0

                  const unidadesPlanificadas =
                    lotes * producto.tamano_lote

                  return (
                    <tr
                      key={producto.producto_id}
                      style={{
                        opacity: incluido ? 1 : 0.55,
                        background: incluido
                          ? "white"
                          : "#f9fafb",
                      }}
                    >
                      <td style={celdaCentro}>
                        <input
                          type="checkbox"
                          checked={incluido}
                          onChange={(evento) =>
                            cambiarSeleccion(
                              producto.producto_id,
                              evento.target.checked,
                            )
                          }
                          style={checkboxGrande}
                        />
                      </td>

                      <td style={celda}>
                        <strong>{producto.corto}</strong>
                        <br />
                        <small>{producto.nombre}</small>
                      </td>

                      <td style={celdaNumero}>
                        {producto.pedidos_pendientes}
                      </td>

                      <td style={celdaNumero}>
                        {producto.inventario_disponible}
                      </td>

                      <td style={celdaNumero}>
                        <strong>
                          {producto.necesidad_neta}
                        </strong>
                      </td>

                      <td style={celdaNumero}>
                        {producto.tamano_lote}
                      </td>

                      <td style={celdaNumero}>
                        {producto.lotes_sugeridos}
                      </td>

                      <td style={celdaCentro}>
                        <div style={controlLotes}>
                          <button
                            type="button"
                            onClick={() =>
                              cambiarLotes(
                                producto.producto_id,
                                -1,
                              )
                            }
                            disabled={lotes <= 0}
                            style={botonMenos}
                          >
                            −
                          </button>

                          <strong style={numeroLotes}>
                            {lotes}
                          </strong>

                          <button
                            type="button"
                            onClick={() =>
                              cambiarLotes(
                                producto.producto_id,
                                1,
                              )
                            }
                            style={botonMas}
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td style={celdaNumero}>
                        <strong
                          style={{
                            color:
                              incluido &&
                              unidadesPlanificadas > 0
                                ? "#8f1d24"
                                : "#6b7280",
                            fontSize: "17px",
                          }}
                        >
                          {incluido
                            ? unidadesPlanificadas
                            : 0}
                        </strong>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="prod-summary" style={resumenPlan}>
          <div>
            <span style={datoTitulo}>
              Productos incluidos
            </span>
            <strong style={valorResumen}>
              {productosIncluidos.length}
            </strong>
          </div>

          <div>
            <span style={datoTitulo}>
              Lotes planificados
            </span>
            <strong style={valorResumen}>
              {totalLotesSeleccionados}
            </strong>
          </div>

          <div>
            <span style={datoTitulo}>
              Unidades planificadas
            </span>
            <strong style={valorResumen}>
              {totalProducirSeleccionado}
            </strong>
          </div>
        </div>

        <div className="prod-final-actions" style={accionesFinales}>
          <button
            type="button"
            onClick={abrirConfirmacion}
            disabled={
                           productosIncluidos.length === 0 ||
                           guardando
            }
            style={{
              ...botonIngresarCompleto,
              opacity:
                productosIncluidos.length === 0
                  ? 0.5
                  : 1,
              cursor:
                productosIncluidos.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            Ingresar producción completa
          </button>
        </div>
      </section>
        </>
      )}

      {vista === "INGRESADA" && (
        <section className="prod-panel prod-history" style={panel}>
          <div className="prod-panel-title" style={tituloPanel}>
            <div>
              <h2 style={{ margin: 0 }}>
                Historial de órdenes de producción
              </h2>

              <p style={descripcion}>
                Cada tarjeta representa una orden completa
                ingresada en una sola operación. Los SKU solo
                se muestran al abrir el detalle de la orden.
              </p>
            </div>

            <button
              type="button"
              onClick={
                cargarProduccionesIngresadas
              }
              disabled={cargandoHistorial}
              style={botonSecundario}
            >
              {cargandoHistorial
                ? "Actualizando..."
                : "Actualizar"}
            </button>
          </div>

          <ImportacionOrdenesHistoricas
            alCompletar={cargarProduccionesIngresadas}
          />

          {cargandoHistorial ? (
            <div style={estadoVacio}>
              Cargando órdenes de producción...
            </div>
          ) : produccionesIngresadas.length ===
            0 ? (
            <div style={estadoVacio}>
              No existen órdenes de producción registradas.
            </div>
          ) : (
            <div className="prod-order-grid" style={gridOrdenesProduccion}>
              {produccionesIngresadas.map(
                (registro) => (
                  <article
                    key={registro.id}
                    style={tarjetaOrdenProduccion}
                  >
                    <div style={cabeceraOrdenProduccion}>
                      <div>
                        <span style={etiquetaOrdenProduccion}>
                          {registro.origen === "HISTORICO"
                            ? registro.ordenes_micro > 0
                              ? "ORDEN HISTÓRICA · MICRO"
                              : "ORDEN HISTÓRICA · SKU"
                            : "ORDEN DE PRODUCCIÓN"}
                        </span>

                        <h3 style={numeroOrdenProduccion}>
                          {textoOrdenProduccion(registro)}
                        </h3>

                        <div style={fechaOrdenProduccion}>
                          {formatearFechaDocumento(
                            registro.fecha_produccion_general,
                          )}
                        </div>
                      </div>

                      <span
                        style={
                          registro.origen === "HISTORICO"
                            ? registro.estado_validacion === "VALIDA"
                              ? badgeOrdenRegistrada
                              : badgeOrdenAnulada
                            : registro.estado === "REGISTRADA"
                            ? badgeOrdenRegistrada
                            : badgeOrdenAnulada
                        }
                      >
                        {registro.origen === "HISTORICO"
                          ? registro.estado_validacion === "VALIDA"
                            ? "HISTÓRICA"
                            : "REVISAR"
                          : registro.estado}
                      </span>
                    </div>

                    <div style={resumenOrdenProduccion}>
                      <div style={datoOrdenProduccion}>
                        <span style={datoTitulo}>
                          {registro.ordenes_micro > 0 ? "Tipo" : "SKU"}
                        </span>
                        <strong style={valorOrdenProduccion}>
                          {registro.ordenes_micro > 0 ? "MICRO" : registro.total_skus}
                        </strong>
                      </div>

                      <div style={datoOrdenProduccion}>
                        <span style={datoTitulo}>
                          {registro.ordenes_micro > 0 ? "Cantidad" : "Paradas"}
                        </span>
                        <strong style={valorOrdenProduccion}>
                          {registro.ordenes_micro > 0
                            ? `${cantidadHistorial(registro.total_kg_micro)} kg`
                            : cantidadHistorial(registro.total_paradas)}
                        </strong>
                      </div>

                      <div style={datoOrdenProduccion}>
                        <span style={datoTitulo}>
                          {registro.origen === "HISTORICO" ? "Costo" : "Unidades"}
                        </span>
                        <strong style={valorOrdenProduccion}>
                          {registro.origen === "HISTORICO"
                            ? Number(registro.costo_total ?? 0).toLocaleString("es-EC", { style: "currency", currency: "USD" })
                            : cantidadHistorial(registro.total_unidades, 0)}
                        </strong>
                      </div>
                    </div>

                    <div style={registroOrdenProduccion}>
                      {registro.origen === "HISTORICO"
                        ? "Importada desde el sistema contable · no altera inventario"
                        : <>Registrada: {new Date(registro.creado_en).toLocaleString("es-EC")}</>}
                    </div>

                    <div style={accionesOrdenProduccion}>
                      <button
                        type="button"
                        onClick={() =>
                          abrirDetalleProduccionHistorial(
                            registro,
                          )
                        }
                        style={botonVerOrden}
                      >
                        Ver orden completa
                      </button>

                      {registro.origen === "APP" &&
                        registro.estado === "REGISTRADA" && (
                          <button
                            type="button"
                            onClick={() =>
                              abrirEdicionProduccion(
                                registro,
                              )
                            }
                            disabled={
                              cargandoEdicion ||
                              guardandoEdicion
                            }
                            style={botonEditarOrden}
                          >
                            Editar
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={() =>
                          imprimirProduccionHistorial(
                            registro,
                          )
                        }
                        style={botonImprimirOrden}
                      >
                        {registro.origen === "HISTORICO" ? "Imprimir orden" : "Imprimir hoja de lotes"}
                      </button>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </section>
      )}

      {produccionHistorialSeleccionada && (
        <div style={fondoModal}>
          <section
            className="prod-modal prod-history-modal"
            style={modalHistorialProduccion}
          >
            <header style={cabeceraModal}>
              <div>
                <span style={etiqueta}>
                  HISTORIAL
                </span>

                <h2
                  style={{
                    margin: "5px 0",
                  }}
                >
                  Orden {textoOrdenProduccion(
                    produccionHistorialSeleccionada,
                  )}
                </h2>

                <p style={descripcion}>
                  Fecha:{" "}
                  {formatearFechaDocumento(
                    produccionHistorialSeleccionada.fecha_produccion_general,
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  cerrarDetalleProduccionHistorial
                }
                disabled={
                  cargandoDetalleHistorial
                }
                style={botonCerrar}
              >
                Cerrar
              </button>
            </header>

            {cargandoDetalleHistorial ? (
              <div style={estadoVacio}>
                Cargando detalle...
              </div>
            ) : (
              <>
                <div
                  className="prod-history-table"
                  style={{
                    overflowX: "auto",
                  }}
                >
                  <table style={tabla}>
                    <thead>
                      <tr>
                        <th style={encabezado}>
                          Producto
                        </th>

                        <th style={encabezado}>
                          Paradas
                        </th>

                        <th style={encabezado}>
                          Cantidad
                        </th>

                        <th style={encabezado}>
                          Lote
                        </th>

                        <th style={encabezado}>
                          Producción
                        </th>

                        <th style={encabezado}>
                          Vencimiento
                        </th>

                        <th style={encabezado}>
                          Destino
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {detalleProduccionHistorial.map(
                        (detalle) => (
                          <tr
                            key={
                              detalle.detalle_id
                            }
                          >
                            <td style={celda}>
                              <strong>
                                {
                                  detalle.producto_corto
                                }
                              </strong>

                              <br />

                              <small>
                                {
                                  detalle.producto_codigo
                                }
                              </small>
                            </td>

                            <td
                              style={celdaNumero}
                            >
                              {
                                detalle.numero_paradas
                              }
                            </td>

                            <td
                              style={celdaNumero}
                            >
                              <strong>
                                {detalle.tipo_destino === "MICRO"
                                  ? `${cantidadHistorial(detalle.kg_micro)} kg`
                                  : `${cantidadHistorial(detalle.unidades)} Unid.`}
                              </strong>
                            </td>

                            <td style={celda}>
                              <strong>
                                {detalle.tipo_destino ===
                                "SEMIELABORADO"
                                  ? "SE ASIGNA AL ETIQUETAR"
                                  : detalle.lote ??
                                    "—"}
                              </strong>
                            </td>

                            <td style={celda}>
                              {formatearFechaDocumento(
                                detalle.fecha_produccion,
                              )}
                            </td>

                            <td style={celda}>
                              {detalle.fecha_vencimiento
                                ? formatearFechaDocumento(
                                    detalle.fecha_vencimiento,
                                  )
                                : "—"}
                            </td>

                            <td style={celda}>
                              {detalle.tipo_destino ===
                              "SEMIELABORADO"
                                ? "Prebodega"
                                : detalle.tipo_destino === "MICRO"
                                  ? "Historial de micros"
                                  : detalle.origen === "HISTORICO"
                                    ? "Histórico · no inventario"
                                    : "Inventario terminado"}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="prod-modal-actions" style={accionesModal}>
                  <button
                    type="button"
                    onClick={() =>
                      imprimirDetalleHistorico(
                        produccionHistorialSeleccionada,
                        detalleProduccionHistorial,
                      )
                    }
                    disabled={
                      detalleProduccionHistorial.length ===
                      0
                    }
                    style={
                      botonImprimirHistorial
                    }
                  >
                    Imprimir lotes para empaque
                  </button>

                  <button
                    type="button"
                    onClick={
                      cerrarDetalleProduccionHistorial
                    }
                    style={botonSecundario}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {produccionEditando && (
        <div style={fondoModal}>
          <section
            className="prod-modal prod-edit-modal"
            style={modalProduccion}
          >
            <header style={cabeceraModal}>
              <div>
                <span style={etiqueta}>
                  EDITAR PRODUCCIÓN
                </span>

                <h2 style={{ margin: "5px 0" }}>
                  {textoOrdenProduccion(
                    produccionEditando,
                  )}
                </h2>

                <p style={descripcion}>
                  Corrige la orden y el inventario asociado
                  se actualizará en la misma operación.
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarEdicionProduccion}
                disabled={
                  cargandoEdicion || guardandoEdicion
                }
                style={botonCerrar}
              >
                Cerrar
              </button>
            </header>

            {cargandoEdicion ? (
              <div style={estadoVacio}>
                Cargando producción...
              </div>
            ) : (
              <>
                <div style={fechaGeneralEdicionContenedor}>
                  <label style={label}>
                    Fecha general de producción
                  </label>

                  <input
                    type="date"
                    value={fechaGeneralEdicion}
                    onChange={(evento) =>
                      setFechaGeneralEdicion(
                        evento.target.value,
                      )
                    }
                    disabled={guardandoEdicion}
                    style={campo}
                  />
                </div>

                <div style={avisoEdicionProduccion}>
                  El producto y su destino no cambian. Si un
                  lote ya tiene reservas, despachos o
                  conversiones, el sistema protegerá sus datos
                  y cantidades utilizadas.
                </div>

                <div
                  className="prod-edit-table"
                  style={{ overflowX: "auto" }}
                >
                  <table style={tabla}>
                    <thead>
                      <tr>
                        <th style={encabezado}>Producto</th>
                        <th style={encabezado}>Destino</th>
                        <th style={encabezado}>Paradas</th>
                        <th style={encabezado}>Unidades</th>
                        <th style={encabezado}>
                          Producción
                        </th>
                        <th style={encabezado}>Lote</th>
                        <th style={encabezado}>
                          Vencimiento
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {detallesEdicion.map((detalle) => {
                        const semielaborado =
                          detalle.tipoDestino ===
                          "SEMIELABORADO"

                        return (
                          <tr key={detalle.detalleId}>
                            <td style={celda}>
                              <strong>
                                {detalle.productoCorto}
                              </strong>

                              <br />

                              <small>
                                {detalle.productoCodigo}
                              </small>
                            </td>

                            <td style={celda}>
                              <span
                                style={
                                  semielaborado
                                    ? badgeSemielaborado
                                    : badgeTerminado
                                }
                              >
                                {semielaborado
                                  ? "PREBODEGA"
                                  : "TERMINADO"}
                              </span>
                            </td>

                            <td style={celda}>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={detalle.numeroParadas}
                                onChange={(evento) =>
                                  cambiarDetalleEdicion(
                                    detalle.detalleId,
                                    {
                                      numeroParadas:
                                        evento.target.value,
                                    },
                                  )
                                }
                                disabled={guardandoEdicion}
                                style={campoNumeroEdicion}
                              />
                            </td>

                            <td style={celda}>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={detalle.unidades}
                                onChange={(evento) =>
                                  cambiarDetalleEdicion(
                                    detalle.detalleId,
                                    {
                                      unidades:
                                        evento.target.value,
                                    },
                                  )
                                }
                                disabled={guardandoEdicion}
                                style={campoNumeroEdicion}
                              />
                            </td>

                            <td style={celda}>
                              <input
                                type="date"
                                value={detalle.fechaProduccion}
                                onChange={(evento) =>
                                  cambiarDetalleEdicion(
                                    detalle.detalleId,
                                    {
                                      fechaProduccion:
                                        evento.target.value,
                                    },
                                  )
                                }
                                disabled={guardandoEdicion}
                                style={campoFechaEdicion}
                              />
                            </td>

                            <td style={celda}>
                              {semielaborado ? (
                                <span style={textoPendiente}>
                                  Se asigna al etiquetar
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  value={detalle.lote}
                                  onChange={(evento) =>
                                    cambiarDetalleEdicion(
                                      detalle.detalleId,
                                      {
                                        lote:
                                          evento.target.value.toUpperCase(),
                                      },
                                    )
                                  }
                                  disabled={guardandoEdicion}
                                  style={campoLoteEdicion}
                                />
                              )}
                            </td>

                            <td style={celda}>
                              {semielaborado ? (
                                "—"
                              ) : (
                                <input
                                  type="date"
                                  value={
                                    detalle.fechaVencimiento
                                  }
                                  min={detalle.fechaProduccion}
                                  onChange={(evento) =>
                                    cambiarDetalleEdicion(
                                      detalle.detalleId,
                                      {
                                        fechaVencimiento:
                                          evento.target.value,
                                      },
                                    )
                                  }
                                  disabled={guardandoEdicion}
                                  style={campoFechaEdicion}
                                />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div
                  className="prod-modal-actions"
                  style={accionesModal}
                >
                  <button
                    type="button"
                    onClick={cerrarEdicionProduccion}
                    disabled={guardandoEdicion}
                    style={botonSecundario}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={guardarEdicionProduccion}
                    disabled={
                      guardandoEdicion ||
                      detallesEdicion.length === 0
                    }
                    style={{
                      ...botonGuardarEdicion,
                      opacity: guardandoEdicion ? 0.5 : 1,
                    }}
                  >
                    {guardandoEdicion
                      ? "Guardando cambios..."
                      : "Guardar cambios"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {mostrarConfirmacion && (
        <div style={fondoModal}>
          <section className="prod-modal prod-confirm-modal" style={modalProduccion}>
            <header style={cabeceraModal}>
              <div>
                <span style={etiqueta}>
                  CONFIRMACIÓN
                </span>

                <h2 style={{ margin: "5px 0" }}>
                  Ingresar producción completa
                </h2>

                <p style={descripcion}>
                  Revisa lotes, cantidades, fechas y el destino
                  de cada producción antes de guardar.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMostrarConfirmacion(false)
                }
                disabled={guardando}
                style={botonCerrar}
              >
                Cerrar
              </button>
            </header>

            <div style={fechaGeneral}>
              <div>
                <label style={label}>
                  Fecha general de producción
                </label>

                <CampoFechaCorta
                  valor={fechaProduccionGeneral}
                  cambiar={cambiarFechaGeneral}
                />
              </div>

              <div style={avisoLote}>
                Los productos terminados generan lote como DDMM + código de producto.
                Los semielaborados ingresan a prebodega solo con fecha y cantidad; el lote final se genera automáticamente cuando se etiquetan.
              </div>
            </div>

            <div className="prod-confirm-table" style={{ overflowX: "auto" }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>Producto</th>
                    <th style={encabezado}>Destino</th>
                    <th style={encabezado}>Lotes</th>
                    <th style={encabezado}>Unidades</th>
                    <th style={encabezado}>Lote</th>
                    <th style={encabezado}>Producción</th>
                    <th style={encabezado}>Vencimiento</th>
                  </tr>
                </thead>

                <tbody>
                  {produccionConfirmada.map((registro) => (
                    <tr
                      key={registro.producto.producto_id}
                    >
                      <td style={celda}>
                        <strong>
                          {registro.producto.corto}
                        </strong>
                        <br />
                        <small>
                          Código lote:{" "}
                          {registro.producto.codigo_lote}
                        </small>
                      </td>

                      <td style={celda}>
                        <span
                          style={
                            esSemielaborado(
                              registro.producto
                                .producto_id,
                            )
                              ? badgeSemielaborado
                              : badgeTerminado
                          }
                        >
                          {destinoProduccion(
                            registro.producto
                              .producto_id,
                          )}
                        </span>
                      </td>

                      <td style={celdaNumero}>
                        {registro.lotes}
                      </td>

                      <td style={celda}>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={registro.unidades}
                          onChange={(evento) =>
                            actualizarRegistro(
                              registro.producto
                                .producto_id,
                              {
                                unidades: Number(
                                  evento.target.value,
                                ),
                              },
                            )
                          }
                          style={campoTabla}
                        />
                      </td>

                      <td style={celda}>
                        {esSemielaborado(registro.producto.producto_id) ? (
                          <span style={textoPendiente}>Se asigna al etiquetar</span>
                        ) : (
                          <input
                            value={registro.lote}
                            maxLength={6}
                            onChange={(evento) =>
                              actualizarRegistro(registro.producto.producto_id, {
                                lote: evento.target.value.replace(/\D/g, ""),
                              })
                            }
                            style={campoTabla}
                          />
                        )}
                      </td>

                      <td style={celda}>
                        <CampoFechaCorta
                          valor={registro.fechaProduccion}
                          compacto
                          cambiar={(nuevaFecha) => {
                            const semi =
                              esSemielaborado(
                                registro.producto
                                  .producto_id,
                              )

                            actualizarRegistro(
                              registro.producto
                                .producto_id,
                              {
                                fechaProduccion:
                                  nuevaFecha,
                                fechaVencimiento:
                                  semi
                                    ? ""
                                    : sumarDias(
                                        nuevaFecha,
                                        registro.producto
                                          .vida_util_dias,
                                      ),
                                lote: semi
                                  ? ""
                                  : generarLote(
                                      nuevaFecha,
                                      registro.producto
                                        .codigo_lote,
                                    ),
                              },
                            )
                          }}
                        />
                      </td>

                      <td style={celda}>
                        {esSemielaborado(
                          registro.producto.producto_id,
                        ) ? (
                          <span style={textoPendiente}>
                            Se define al etiquetar
                          </span>
                        ) : (
                          <CampoFechaCorta
                            valor={
                              registro.fechaVencimiento
                            }
                            soloLectura
                            compacto
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={resumenModal}>
              <div>
                <span style={datoTitulo}>SKU</span>
                <strong style={valorResumen}>
                  {produccionConfirmada.length}
                </strong>
              </div>

              <div>
                <span style={datoTitulo}>Lotes</span>
                <strong style={valorResumen}>
                  {produccionConfirmada.reduce(
                    (total, registro) =>
                      total + registro.lotes,
                    0,
                  )}
                </strong>
              </div>

              <div>
                <span style={datoTitulo}>Unidades</span>
                <strong style={valorResumen}>
                  {produccionConfirmada.reduce(
                    (total, registro) =>
                      total + registro.unidades,
                    0,
                  )}
                </strong>
              </div>
            </div>

            <div className="prod-modal-actions" style={accionesModal}>
              <button
                type="button"
                onClick={imprimirPlanFechasLotes}
                disabled={guardando}
                style={botonPdfProduccion}
              >
                PDF fechas y lotes
              </button>

              <button
                type="button"
                onClick={() =>
                  setMostrarConfirmacion(false)
                }
                disabled={guardando}
                style={botonSecundario}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={ingresarProduccionCompleta}
                disabled={guardando}
                style={{
                  ...botonIngresarCompleto,
                  opacity: guardando ? 0.5 : 1,
                }}
              >
                {guardando
                  ? "Ingresando producción..."
                  : "Confirmar e ingresar toda la producción"}
              </button>
            </div>
          </section>
        </div>
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
      <span style={datoTitulo}>{titulo}</span>
      <strong style={valorIndicador}>{valor}</strong>
      <span style={detalleIndicador}>{detalle}</span>
    </article>
  )
}

const pagina = {
  padding: "30px",
  maxWidth: "1750px",
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
  marginBottom: "22px",
  padding: "22px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "#ffffff",
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

const barraControles = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  marginBottom: "18px",
}

const filtros = {
  display: "grid",
  gridTemplateColumns:
    "minmax(260px, 2fr) minmax(260px, 1fr)",
  gap: "14px",
  alignItems: "center",
  flex: 1,
}

const accionesSeleccion = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "9px",
}

const controlCheckbox = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  color: "#374151",
  fontSize: "13px",
  fontWeight: "bold",
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

const checkboxGrande = {
  width: "19px",
  height: "19px",
  cursor: "pointer",
}

const controlLotes = {
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  padding: "4px",
  border: "1px solid #d8dde3",
  borderRadius: "9px",
  background: "#f7f8fa",
}

const botonMenos = {
  width: "34px",
  height: "34px",
  border: "1px solid #8f1d24",
  borderRadius: "7px",
  background: "white",
  color: "#8f1d24",
  fontSize: "21px",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonMas = {
  width: "34px",
  height: "34px",
  border: "none",
  borderRadius: "7px",
  background: "#8f1d24",
  color: "white",
  fontSize: "20px",
  fontWeight: "bold",
  cursor: "pointer",
}

const numeroLotes = {
  minWidth: "30px",
  textAlign: "center" as const,
  fontSize: "18px",
  color: "#25272b",
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

const botonQuitar = {
  padding: "10px 16px",
  border: "1px solid #6b7280",
  borderRadius: "8px",
  background: "white",
  color: "#374151",
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

const botonIngresarCompleto = {
  minHeight: "48px",
  padding: "13px 22px",
  border: "none",
  borderRadius: "9px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
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

const badgeSemielaborado = {
  display: "inline-block",
  padding: "6px 9px",
  borderRadius: "999px",
  background: "#fef3c7",
  color: "#92400e",
  fontSize: "11px",
  fontWeight: "bold",
  whiteSpace: "nowrap" as const,
}

const badgeTerminado = {
  display: "inline-block",
  padding: "6px 9px",
  borderRadius: "999px",
  background: "#dcfce7",
  color: "#166534",
  fontSize: "11px",
  fontWeight: "bold",
  whiteSpace: "nowrap" as const,
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

const celdaNumero = {
  ...celda,
  textAlign: "right" as const,
}

const celdaCentro = {
  ...celda,
  textAlign: "center" as const,
}

const resumenPlan = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "15px",
  marginTop: "20px",
  padding: "18px",
  borderRadius: "10px",
  background: "#f7f8fa",
}

const valorResumen = {
  display: "block",
  marginTop: "5px",
  color: "#8f1d24",
  fontSize: "25px",
}

const accionesFinales = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "18px",
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

const modalProduccion = {
  width: "min(1300px, 96vw)",
  maxHeight: "92vh",
  overflowY: "auto" as const,
  padding: "24px",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 24px 60px rgba(15, 23, 42, 0.25)",
}

const cabeceraModal = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "20px",
  marginBottom: "20px",
}

const fechaGeneral = {
  display: "grid",
  gridTemplateColumns:
    "minmax(220px, 320px) minmax(260px, 1fr)",
  gap: "16px",
  alignItems: "end",
  marginBottom: "20px",
}

const avisoLote = {
  padding: "12px 14px",
  borderRadius: "8px",
  background: "#f7f8fa",
  color: "#6b7280",
  fontSize: "13px",
}

const campoTabla = {
  width: "145px",
  minHeight: "38px",
  boxSizing: "border-box" as const,
  padding: "8px 9px",
  border: "1px solid #cfd4da",
  borderRadius: "7px",
  background: "white",
}

const campoLecturaTabla = {
  ...campoTabla,
  background: "#f4f5f7",
  color: "#8f1d24",
  fontWeight: "bold",
}

const resumenModal = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginTop: "20px",
  padding: "18px",
  borderRadius: "10px",
  background: "#f7f8fa",
}

const accionesModal = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "12px",
  marginTop: "20px",
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

const textoPendiente = {
  color: "#6b7280",
  fontSize: "12px",
  fontStyle: "italic",
}


const botonPdfProduccion = {
  padding: "11px 18px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}


const contenedorFechaCorta = {
  position: "relative" as const,
  width: "100%",
  minHeight: "42px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  background: "white",
  color: "#25272b",
  cursor: "pointer",
  overflow: "hidden",
}

const contenedorFechaCortaCompacto = {
  minHeight: "38px",
  padding: "7px 9px",
  borderRadius: "7px",
}

const textoFechaCorta = {
  whiteSpace: "nowrap" as const,
  fontVariantNumeric: "tabular-nums",
}

const iconoCalendario = {
  color: "#6b7280",
  fontSize: "12px",
}

const selectorFechaInvisible = {
  position: "absolute" as const,
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
}

const fechaCortaVisual = {
  width: "100%",
  minHeight: "42px",
  display: "flex",
  alignItems: "center",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  color: "#25272b",
  whiteSpace: "nowrap" as const,
  fontVariantNumeric: "tabular-nums",
}

const fechaCortaVisualCompacta = {
  minHeight: "38px",
  padding: "7px 9px",
  borderRadius: "7px",
}


const accionesHistorial = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap" as const,
}

const botonVerHistorial = {
  padding: "8px 11px",
  border: "1px solid #8f1d24",
  borderRadius: "7px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonImprimirHistorial = {
  padding: "8px 11px",
  border: "none",
  borderRadius: "7px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const modalHistorialProduccion = {
  width: "min(1250px, 96vw)",
  maxHeight: "92vh",
  overflowY: "auto" as const,
  padding: "24px",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 20px 60px rgba(15, 23, 42, 0.30)",
}


const gridOrdenesProduccion = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "16px",
}

const tarjetaOrdenProduccion = {
  padding: "18px",
  border: "1px solid #d9dde3",
  borderRadius: "12px",
  background: "white",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
}

const cabeceraOrdenProduccion = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "14px",
  paddingBottom: "14px",
  borderBottom: "1px solid #eceff2",
}

const etiquetaOrdenProduccion = {
  display: "block",
  marginBottom: "4px",
  color: "#8f1d24",
  fontSize: "11px",
  fontWeight: "bold",
  letterSpacing: "0.8px",
}

const numeroOrdenProduccion = {
  margin: 0,
  fontSize: "24px",
  color: "#1f2937",
}

const fechaOrdenProduccion = {
  marginTop: "4px",
  color: "#6b7280",
  fontSize: "14px",
}

const badgeOrdenRegistrada = {
  padding: "6px 9px",
  borderRadius: "999px",
  background: "#ecfdf3",
  color: "#166534",
  fontSize: "11px",
  fontWeight: "bold",
}

const badgeOrdenAnulada = {
  padding: "6px 9px",
  borderRadius: "999px",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: "11px",
  fontWeight: "bold",
}

const resumenOrdenProduccion = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "10px",
  marginTop: "14px",
}

const datoOrdenProduccion = {
  padding: "10px",
  borderRadius: "8px",
  background: "#f8fafc",
  textAlign: "center" as const,
}

const valorOrdenProduccion = {
  display: "block",
  marginTop: "3px",
  color: "#8f1d24",
  fontSize: "20px",
}

const registroOrdenProduccion = {
  marginTop: "12px",
  color: "#6b7280",
  fontSize: "12px",
}

const accionesOrdenProduccion = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(130px, 1fr))",
  gap: "10px",
  marginTop: "14px",
}

const botonVerOrden = {
  padding: "10px 12px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonImprimirOrden = {
  padding: "10px 12px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonEditarOrden = {
  padding: "10px 12px",
  border: "none",
  borderRadius: "8px",
  background: "#f7931e",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const fechaGeneralEdicionContenedor = {
  width: "min(320px, 100%)",
  marginBottom: "14px",
}

const avisoEdicionProduccion = {
  marginBottom: "18px",
  padding: "12px 14px",
  borderRadius: "8px",
  background: "#fff7ed",
  color: "#9a3412",
  fontSize: "13px",
}

const campoNumeroEdicion = {
  ...campoTabla,
  width: "95px",
  textAlign: "right" as const,
}

const campoFechaEdicion = {
  ...campoTabla,
  width: "150px",
}

const campoLoteEdicion = {
  ...campoTabla,
  width: "135px",
  textTransform: "uppercase" as const,
}

const botonGuardarEdicion = {
  minHeight: "42px",
  padding: "10px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const produccionResponsiveCss = `
  .c1-production {
    --c1-vino: #8F1D24;
    --c1-vino-oscuro: #68151A;
    --c1-naranja: #F7931E;
    --c1-crema: #F8F5F1;
  }

  .c1-production button {
    transition: transform .12s ease, box-shadow .12s ease;
  }
  .c1-production button:not(:disabled):active {
    transform: translateY(1px);
  }
  .c1-production .prod-final-actions button,
  .c1-production .prod-modal-actions button:last-child {
    background: linear-gradient(90deg, #F7931E, #FF7900) !important;
    color: white !important;
    border-color: transparent !important;
    box-shadow: 0 8px 20px rgba(247,147,30,.18);
  }
  .c1-production .prod-panel {
    border-color: #eee3dd !important;
    box-shadow: 0 5px 18px rgba(72,42,32,.045) !important;
  }
  .c1-production .prod-kpis article {
    border-color: #eee3dd !important;
    box-shadow: 0 4px 16px rgba(72,42,32,.035);
  }
  .c1-production .prod-order-grid article {
    border-color: #eee3dd !important;
  }

  @media (max-width: 1000px) {
    .c1-production {
      padding: 20px !important;
    }
    .c1-production .prod-kpis {
      grid-template-columns: repeat(3,minmax(0,1fr)) !important;
    }
    .c1-production .prod-filters {
      grid-template-columns: 1fr !important;
    }
  }

  @media (max-width: 760px) {
    .c1-production {
      padding: 12px 10px 24px !important;
      max-width: none !important;
      overflow-x: hidden;
    }

    .c1-production .prod-header {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 12px !important;
      margin-bottom: 14px !important;
    }
    .c1-production .prod-header > div:first-child span {
      font-size: 10px !important;
    }
    .c1-production .prod-header h1 {
      font-size: 26px !important;
    }
    .c1-production .prod-header p {
      font-size: 12px !important;
    }
    .c1-production .prod-header > button {
      width: 100%;
      min-height: 42px;
    }

    .c1-production .prod-tabs {
      width: 100% !important;
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 5px !important;
      margin-bottom: 12px !important;
      padding: 4px !important;
    }
    .c1-production .prod-tabs button {
      width: 100%;
      padding: 9px 6px !important;
      font-size: 11px;
    }

    .c1-production .prod-kpis {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      gap: 8px !important;
      margin-bottom: 12px !important;
    }
    .c1-production .prod-kpis article {
      min-width: 0;
      padding: 11px !important;
      gap: 4px !important;
      border-radius: 11px !important;
    }
    .c1-production .prod-kpis article span:first-child {
      font-size: 9px !important;
      line-height: 1.2;
    }
    .c1-production .prod-kpis article strong {
      font-size: 21px !important;
    }
    .c1-production .prod-kpis article span:last-child {
      font-size: 9px !important;
    }

    .c1-production .prod-panel {
      padding: 12px !important;
      border-radius: 12px !important;
      margin-bottom: 12px !important;
    }
    .c1-production .prod-panel-title {
      align-items: flex-start !important;
      gap: 8px !important;
      margin-bottom: 12px !important;
    }
    .c1-production .prod-panel-title h2 {
      font-size: 18px;
    }
    .c1-production .prod-panel-title p {
      font-size: 11px !important;
    }

    .c1-production .prod-controls {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 10px !important;
      margin-bottom: 12px !important;
    }
    .c1-production .prod-filters {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 9px !important;
    }
    .c1-production .prod-select-actions {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 7px !important;
    }
    .c1-production .prod-select-actions button:first-child {
      grid-column: 1 / -1;
    }
    .c1-production .prod-select-actions button {
      min-height: 38px;
      padding: 8px !important;
      font-size: 10px;
    }

    /* Plan de producción: la tabla se convierte en tarjetas móviles. */
    .c1-production .prod-main-table {
      overflow: visible !important;
    }
    .c1-production .prod-main-table table,
    .c1-production .prod-main-table tbody,
    .c1-production .prod-main-table tr,
    .c1-production .prod-main-table td {
      display: block !important;
      width: 100% !important;
    }
    .c1-production .prod-main-table thead {
      display: none !important;
    }
    .c1-production .prod-main-table tbody {
      display: grid !important;
      gap: 9px;
    }
    .c1-production .prod-main-table tr {
      padding: 10px 11px !important;
      border: 1px solid #eee3dd;
      border-radius: 12px;
      background: white !important;
      box-shadow: 0 2px 8px rgba(72,42,32,.035);
      opacity: 1 !important;
    }
    .c1-production .prod-main-table td {
      min-height: 31px;
      display: grid !important;
      grid-template-columns: 108px minmax(0,1fr) !important;
      align-items: center;
      gap: 8px;
      padding: 5px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
      font-size: 12px;
    }
    .c1-production .prod-main-table td::before {
      color: #8e7c75;
      font-size: 10px;
      font-weight: 750;
      text-align: left;
      text-transform: uppercase;
    }
    .c1-production .prod-main-table td:nth-child(1)::before { content: "Incluir"; }
    .c1-production .prod-main-table td:nth-child(2)::before { content: "Producto"; }
    .c1-production .prod-main-table td:nth-child(3)::before { content: "Pedidos"; }
    .c1-production .prod-main-table td:nth-child(4)::before { content: "Disponible"; }
    .c1-production .prod-main-table td:nth-child(5)::before { content: "Necesidad"; }
    .c1-production .prod-main-table td:nth-child(6)::before { content: "Tamaño parada"; }
    .c1-production .prod-main-table td:nth-child(7)::before { content: "Sugeridos"; }
    .c1-production .prod-main-table td:nth-child(8)::before { content: "Paradas"; }
    .c1-production .prod-main-table td:nth-child(9)::before { content: "Unidades"; }
    .c1-production .prod-main-table td:nth-child(2) {
      text-align: left !important;
    }
    .c1-production .prod-main-table td:nth-child(2)::before {
      display: none;
    }
    .c1-production .prod-main-table td:nth-child(2) strong {
      display: block;
      color: var(--c1-vino);
      font-size: 15px;
    }
    .c1-production .prod-main-table td:nth-child(2) small {
      color: #8a7b75;
      white-space: normal;
    }
    .c1-production .prod-main-table td:nth-child(1) input {
      justify-self: end;
    }
    .c1-production .prod-main-table td:nth-child(8) > div {
      justify-self: end;
    }

    .c1-production .prod-summary {
      grid-template-columns: repeat(3,1fr) !important;
      gap: 6px !important;
      margin-top: 10px !important;
      padding: 10px 8px !important;
    }
    .c1-production .prod-summary > div {
      text-align: center;
      min-width: 0;
    }
    .c1-production .prod-summary span {
      font-size: 9px !important;
    }
    .c1-production .prod-summary strong {
      font-size: 19px !important;
    }

    .c1-production .prod-final-actions {
      position: sticky;
      bottom: 74px;
      z-index: 25;
      margin: 10px -3px -3px !important;
      padding-top: 7px;
      background: linear-gradient(180deg, rgba(255,255,255,0), white 28%);
    }
    .c1-production .prod-final-actions button {
      width: 100%;
      min-height: 48px;
    }

    .c1-production .prod-order-grid {
      grid-template-columns: 1fr !important;
      gap: 10px !important;
    }
    .c1-production .prod-order-grid article {
      padding: 13px !important;
    }

    /* Los modales ocupan toda la pantalla en teléfono. */
    .c1-production .prod-modal {
      width: 100vw !important;
      height: 100dvh !important;
      max-height: 100dvh !important;
      border-radius: 0 !important;
      padding: 13px 11px 90px !important;
    }
    .c1-production .prod-modal > header {
      position: sticky;
      top: -13px;
      z-index: 10;
      padding: 13px 0 9px;
      background: white;
      margin-bottom: 10px !important;
    }

    /* Confirmación e historial también se convierten en tarjetas. */
    .c1-production .prod-confirm-table,
    .c1-production .prod-history-table {
      overflow: visible !important;
    }
    .c1-production .prod-confirm-table table,
    .c1-production .prod-confirm-table tbody,
    .c1-production .prod-confirm-table tr,
    .c1-production .prod-confirm-table td,
    .c1-production .prod-history-table table,
    .c1-production .prod-history-table tbody,
    .c1-production .prod-history-table tr,
    .c1-production .prod-history-table td {
      display: block !important;
      width: 100% !important;
    }
    .c1-production .prod-confirm-table thead,
    .c1-production .prod-history-table thead {
      display: none !important;
    }
    .c1-production .prod-confirm-table tbody,
    .c1-production .prod-history-table tbody {
      display: grid !important;
      gap: 9px;
    }
    .c1-production .prod-confirm-table tr,
    .c1-production .prod-history-table tr {
      padding: 10px;
      border: 1px solid #eee3dd;
      border-radius: 12px;
      background: #fffdfb;
    }
    .c1-production .prod-confirm-table td,
    .c1-production .prod-history-table td {
      min-height: 34px;
      display: grid !important;
      grid-template-columns: 112px minmax(0,1fr) !important;
      align-items: center;
      gap: 7px;
      padding: 5px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
      font-size: 12px;
    }
    .c1-production .prod-confirm-table td::before,
    .c1-production .prod-history-table td::before {
      color: #8e7c75;
      font-size: 9px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
    }
    .c1-production .prod-confirm-table td:nth-child(1)::before { content: "Producto"; }
    .c1-production .prod-confirm-table td:nth-child(2)::before { content: "Destino"; }
    .c1-production .prod-confirm-table td:nth-child(3)::before { content: "Paradas"; }
    .c1-production .prod-confirm-table td:nth-child(4)::before { content: "Unidades"; }
    .c1-production .prod-confirm-table td:nth-child(5)::before { content: "Lote"; }
    .c1-production .prod-confirm-table td:nth-child(6)::before { content: "Producción"; }
    .c1-production .prod-confirm-table td:nth-child(7)::before { content: "Vencimiento"; }

    .c1-production .prod-history-table td:nth-child(1)::before { content: "Producto"; }
    .c1-production .prod-history-table td:nth-child(2)::before { content: "Paradas"; }
    .c1-production .prod-history-table td:nth-child(3)::before { content: "Unidades"; }
    .c1-production .prod-history-table td:nth-child(4)::before { content: "Lote"; }
    .c1-production .prod-history-table td:nth-child(5)::before { content: "Producción"; }
    .c1-production .prod-history-table td:nth-child(6)::before { content: "Vencimiento"; }
    .c1-production .prod-history-table td:nth-child(7)::before { content: "Destino"; }

    .c1-production .prod-confirm-table input {
      width: 100% !important;
      max-width: 170px;
      justify-self: end;
    }

    .c1-production .prod-modal-actions {
      position: sticky;
      bottom: -90px;
      z-index: 12;
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 8px !important;
      margin: 14px -3px 0 !important;
      padding: 12px 3px 0;
      background: linear-gradient(180deg, rgba(255,255,255,0), white 22%);
    }
    .c1-production .prod-modal-actions button {
      width: 100%;
      min-height: 44px;
    }
  }
`
