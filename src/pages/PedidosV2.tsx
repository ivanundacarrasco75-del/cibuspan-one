import { useEffect, useMemo, useRef, useState } from "react"
import {
  buscarPedidosActivosBodegaFechaDb,
  crearPedidoDb,
  eliminarPedidoIngresadoDb,
  obtenerBodegasClienteDb,
  obtenerClientesPedidoDb,
  obtenerDetallePedidoDb,
  obtenerPedidosDb,
  obtenerProductosClienteDb,
  type BodegaPedidoDb,
  type ClientePedidoDb,
  type DetallePedidoConsultaDb,
  type PedidoListadoDb,
  type ProductoPedidoDb,
} from "../repositories/pedidoRepository"
import ModalMensaje from "../components/ModalMensaje"
import { extraerPedidosSantamariaCsv } from "../utils/pedidosSantamariaCsv"

type CantidadesPedido = Record<string, string>

type LineaImportacionSantamaria = {
  codigoBarras: string
  nombre: string
  cantidadEmpaques: number
  unidadManejoArchivo: number
  totalUnidades: number
  producto: ProductoPedidoDb | null
}

type OrdenImportacionSantamaria = {
  numeroPedido: string
  unidadNegocio: string
  fechaEntrega: string
  lineas: LineaImportacionSantamaria[]
  errores: string[]
  seleccionada: boolean
  registrada: boolean
}

type ImportacionSantamariaPreparada = {
  cliente: ClientePedidoDb
  bodega: BodegaPedidoDb
  archivo: string
  ordenes: OrdenImportacionSantamaria[]
}

function fechaManana() {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + 1)

  return fecha.toISOString().slice(0, 10)
}


const MESES_FAVORITA: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
}

type LineaFavorita = {
  codigoBarras: string
  unidadManejoArchivo: number
  cantidadPedida: number
}
function extraerPedidoFavorita(texto: string) {
  const lineas = texto.split(/\r?\n/)

  const lineaOrden = lineas.find((linea) =>
    linea.includes("ORDEN COMPRA"),
  )

  const coincidenciaOrden =
    lineaOrden?.match(
      /50\s*:\s*([\d ]{6,})\s*$/,
    )

  const numeroPedido =
    coincidenciaOrden?.[1]
      ?.replace(/\s+/g, "")
      .trim() ?? ""

  const coincidenciaFecha = texto.match(
    /Fecha Vigencia:\s*(\d{2})\/([A-Z]{3})\/(\d{4})/i,
  )

  const dia = coincidenciaFecha?.[1] ?? ""

  const mesTexto =
    coincidenciaFecha?.[2]
      ?.toUpperCase() ?? ""

  const anio = coincidenciaFecha?.[3] ?? ""

  const mes =
    MESES_FAVORITA[mesTexto] ?? ""

  const fechaEntrega =
    dia && mes && anio
      ? `${anio}-${mes}-${dia}`
      : ""

  const productos: LineaFavorita[] = []

  lineas.forEach((linea) => {
    const coincidencia = linea.match(
      /(\d{13})\s+(\d+)\s+\d+[.,]\d+\s+(\d+)\s*$/,
    )

    if (!coincidencia) return

    productos.push({
      codigoBarras: coincidencia[1],
      unidadManejoArchivo:
        Number(coincidencia[2]),
      cantidadPedida:
        Number(coincidencia[3]),
    })
  })

  return {
    numeroPedido,
    fechaEntrega,
    productos,
  }
}
export default function PedidosV2() {
  const archivoFavoritaRef =
    useRef<HTMLInputElement | null>(null)
  const archivoSantamariaRef =
    useRef<HTMLInputElement | null>(null)

  const [cargandoArchivo, setCargandoArchivo] =
    useState(false)
  const [importacionSantamaria, setImportacionSantamaria] =
    useState<ImportacionSantamariaPreparada | null>(null)

  const [clientes, setClientes] = useState<
    ClientePedidoDb[]
  >([])

  const [bodegas, setBodegas] = useState<
    BodegaPedidoDb[]
  >([])

  const [productos, setProductos] = useState<
    ProductoPedidoDb[]
  >([])

  const [pedidos, setPedidos] = useState<
    PedidoListadoDb[]
  >([])

  const [filtroEstadoPedidos, setFiltroEstadoPedidos] =
    useState<"INGRESADO" | "DESPACHADO">("INGRESADO")

  const [numeroPedidoCliente, setNumeroPedidoCliente] =
    useState("")

  const [clienteId, setClienteId] = useState("")
  const [bodegaId, setBodegaId] = useState("")
  const [fechaEntrega, setFechaEntrega] =
    useState(fechaManana())
  const [horaEntrega, setHoraEntrega] = useState("")
  const [prioridad, setPrioridad] = useState<
    "NORMAL" | "ALTA" | "URGENTE"
  >("NORMAL")

  const [cantidadesManejo, setCantidadesManejo] =
    useState<CantidadesPedido>({})

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const [pedidoVisualizado, setPedidoVisualizado] =
    useState<PedidoListadoDb | null>(null)

  const [detalleVisualizado, setDetalleVisualizado] =
    useState<DetallePedidoConsultaDb[]>([])

  const [cargandoDetalle, setCargandoDetalle] =
    useState(false)

  useEffect(() => {
    cargarPantalla()
  }, [])

  async function cargarPantalla() {
    setCargando(true)
    setError("")

    try {
      const [clientesDb, pedidosDb] =
        await Promise.all([
          obtenerClientesPedidoDb(),
          obtenerPedidosDb(),
        ])

      setClientes(clientesDb)
      setPedidos(pedidosDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la pantalla.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function cargarArchivoFavorita(
    archivo: File,
  ) {
    setCargandoArchivo(true)
    setMensaje("")
    setError("")

    try {
      const texto = await archivo.text()
      const pedido = extraerPedidoFavorita(texto)

      if (!pedido.numeroPedido) {
        throw new Error(
          "No se pudo identificar el número de orden de Favorita.",
        )
      }

      if (!pedido.fechaEntrega) {
        throw new Error(
          "No se pudo identificar la fecha de vigencia del pedido.",
        )
      }

      if (pedido.productos.length === 0) {
        throw new Error(
          "No se encontraron productos en el archivo.",
        )
      }

      const clienteFavorita = clientes.find(
        (cliente) =>
          cliente.nombre
            .toUpperCase()
            .includes("FAVORITA"),
      )

      if (!clienteFavorita) {
        throw new Error(
          "No se encontró Corporación Favorita en la lista de clientes.",
        )
      }

      const [bodegasDb, productosDb] =
        await Promise.all([
          obtenerBodegasClienteDb(
            clienteFavorita.id,
          ),
          obtenerProductosClienteDb(
            clienteFavorita.id,
          ),
        ])

      if (bodegasDb.length === 0) {
        throw new Error(
          "Corporación Favorita no tiene bodegas activas configuradas.",
        )
      }

      const bodegaDetectada =
        bodegasDb.find((bodega) => {
          const nombre =
            bodega.nombre.toUpperCase()

          return (
            nombre.includes("CENTRAL") ||
            nombre.includes("CENTRO") ||
            nombre.includes("CD")
          )
        }) ?? bodegasDb[0]

      const cantidadesIniciales =
        productosDb.reduce<CantidadesPedido>(
          (acumulado, producto) => {
            acumulado[producto.id] = ""
            return acumulado
          },
          {},
        )

      const codigosNoEncontrados: string[] = []
      const diferenciasUnidad: string[] = []

      pedido.productos.forEach(
        (lineaArchivo) => {
          const producto = productosDb.find(
            (item) =>
              item.codigo.trim() ===
              lineaArchivo.codigoBarras,
          )

          if (!producto) {
            codigosNoEncontrados.push(
              lineaArchivo.codigoBarras,
            )
            return
          }

          cantidadesIniciales[producto.id] =
            String(lineaArchivo.cantidadPedida)

          if (
            producto.unidad_manejo !==
            lineaArchivo.unidadManejoArchivo
          ) {
            diferenciasUnidad.push(
              `${producto.corto}: archivo ${lineaArchivo.unidadManejoArchivo}, sistema ${producto.unidad_manejo}`,
            )
          }
        },
      )

      setNumeroPedidoCliente(
        pedido.numeroPedido,
      )
      setClienteId(clienteFavorita.id)
      setBodegas(bodegasDb)
      setBodegaId(bodegaDetectada.id)
      setProductos(productosDb)
      setCantidadesManejo(
        cantidadesIniciales,
      )
      setFechaEntrega(
        pedido.fechaEntrega,
      )
      setHoraEntrega("")
      setPrioridad("NORMAL")

      const mensajes: string[] = [
        `Pedido Favorita ${pedido.numeroPedido} cargado desde el archivo.`,
      ]

      if (codigosNoEncontrados.length > 0) {
        mensajes.push(
          `Códigos no encontrados: ${codigosNoEncontrados.join(", ")}.`,
        )
      }

      if (diferenciasUnidad.length > 0) {
        mensajes.push(
          `Revisa unidades de manejo: ${diferenciasUnidad.join("; ")}.`,
        )
      }

      setMensaje(mensajes.join(" "))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo leer el archivo de Favorita.",
      )
    } finally {
      setCargandoArchivo(false)

      if (archivoFavoritaRef.current) {
        archivoFavoritaRef.current.value = ""
      }
    }
  }

  async function cargarArchivoSantamaria(
    archivo: File,
  ) {
    setCargandoArchivo(true)
    setImportacionSantamaria(null)
    setMensaje("")
    setError("")

    try {
      const texto = await archivo.text()
      const ordenesArchivo = extraerPedidosSantamariaCsv(texto)

      if (ordenesArchivo.length === 0) {
        throw new Error(
          "El CSV no contiene órdenes reconocibles de Mega Santamaría.",
        )
      }

      const clienteSantamaria = clientes.find((cliente) => {
        const nombre = cliente.nombre
          .toUpperCase()
          .replace(/[^A-Z]/g, "")

        return nombre.includes("SANTAMARIA")
      })

      if (!clienteSantamaria) {
        throw new Error(
          "No se encontró Mega Santamaría en la lista de clientes activos.",
        )
      }

      const [bodegasDb, productosDb] = await Promise.all([
        obtenerBodegasClienteDb(clienteSantamaria.id),
        obtenerProductosClienteDb(clienteSantamaria.id),
      ])

      if (bodegasDb.length === 0) {
        throw new Error(
          "Mega Santamaría no tiene una bodega activa configurada.",
        )
      }

      const bodegaDetectada =
        bodegasDb.find((bodega) => {
          const nombre = bodega.nombre.toUpperCase()
          return (
            nombre.includes("CENTRAL") ||
            nombre.includes("CENTRO") ||
            nombre === "CD"
          )
        }) ?? bodegasDb[0]

      const numerosEnArchivo = new Set<string>()
      const numerosRegistrados = new Set(
        pedidos.map((pedido) =>
          pedido.numero_pedido_cliente.trim().toUpperCase(),
        ),
      )

      const ordenes = ordenesArchivo.map<OrdenImportacionSantamaria>(
        (orden) => {
          const errores: string[] = []
          const numeroPedido = orden.numeroPedido.trim().toUpperCase()

          if (!numeroPedido) {
            errores.push("No tiene número de orden.")
          } else if (numerosEnArchivo.has(numeroPedido)) {
            errores.push("La orden está repetida dentro del archivo.")
          } else {
            numerosEnArchivo.add(numeroPedido)
          }

          if (numerosRegistrados.has(numeroPedido)) {
            errores.push("Esta orden ya está registrada en CIBUSPAN ONE.")
          }

          if (!orden.fechaEntrega) {
            errores.push("No tiene fecha de cancelación válida.")
          }

          if (orden.productos.length === 0) {
            errores.push("No contiene productos.")
          }

          const lineas = orden.productos.map<LineaImportacionSantamaria>(
            (linea) => {
              const producto =
                productosDb.find(
                  (item) => item.codigo.trim() === linea.codigoBarras,
                ) ?? null

              if (!producto) {
                errores.push(
                  `Código ${linea.codigoBarras} no configurado para Santamaría.`,
                )
              } else if (
                Math.abs(
                  producto.unidad_manejo - linea.unidadManejoArchivo,
                ) > 0.001
              ) {
                errores.push(
                  `${producto.corto}: el archivo usa ${linea.unidadManejoArchivo} unidades por empaque y el sistema ${producto.unidad_manejo}.`,
                )
              }

              const totalCalculado =
                linea.cantidadEmpaques * linea.unidadManejoArchivo

              if (
                Math.abs(totalCalculado - linea.totalUnidades) > 0.001
              ) {
                errores.push(
                  `${linea.codigoBarras}: cantidad y total de unidades no coinciden.`,
                )
              }

              return {
                ...linea,
                producto,
              }
            },
          )

          return {
            numeroPedido,
            unidadNegocio: orden.unidadNegocio,
            fechaEntrega: orden.fechaEntrega,
            lineas,
            errores,
            seleccionada: errores.length === 0,
            registrada: false,
          }
        },
      )

      setImportacionSantamaria({
        cliente: clienteSantamaria,
        bodega: bodegaDetectada,
        archivo: archivo.name,
        ordenes,
      })

      const validas = ordenes.filter(
        (orden) => orden.errores.length === 0,
      ).length

      setMensaje(
        `Se detectaron ${ordenes.length} órdenes de Mega Santamaría. ${validas} están listas para registrar.`,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo leer el CSV de Mega Santamaría.",
      )
    } finally {
      setCargandoArchivo(false)

      if (archivoSantamariaRef.current) {
        archivoSantamariaRef.current.value = ""
      }
    }
  }

  function cambiarSeleccionOrdenSantamaria(
    numeroPedido: string,
    seleccionada: boolean,
  ) {
    setImportacionSantamaria((actual) => {
      if (!actual) return actual

      return {
        ...actual,
        ordenes: actual.ordenes.map((orden) =>
          orden.numeroPedido === numeroPedido
            ? { ...orden, seleccionada }
            : orden,
        ),
      }
    })
  }

  async function registrarPedidosSantamaria() {
    if (!importacionSantamaria) return

    const pendientes = importacionSantamaria.ordenes.filter(
      (orden) =>
        orden.seleccionada &&
        !orden.registrada &&
        orden.errores.length === 0,
    )

    if (pendientes.length === 0) {
      setError("Selecciona al menos una orden válida para registrar.")
      return
    }

    setCargandoArchivo(true)
    setMensaje("")
    setError("")

    const resultados = new Map<
      string,
      { registrada: boolean; error?: string }
    >()

    for (const orden of pendientes) {
      try {
        await crearPedidoDb({
          numeroPedidoCliente: orden.numeroPedido,
          clienteId: importacionSantamaria.cliente.id,
          bodegaId: importacionSantamaria.bodega.id,
          fechaEntrega: orden.fechaEntrega,
          horaEntrega: "",
          prioridad: "NORMAL",
          tipoEmpaque: importacionSantamaria.bodega.tipo_empaque,
          detalles: orden.lineas.map((linea) => ({
            productoId: linea.producto?.id ?? "",
            totalUnidades: linea.totalUnidades,
            unidadManejo: linea.producto?.unidad_manejo ?? 0,
          })),
        })

        resultados.set(orden.numeroPedido, { registrada: true })
      } catch (err) {
        resultados.set(orden.numeroPedido, {
          registrada: false,
          error:
            err instanceof Error
              ? err.message
              : "No se pudo registrar la orden.",
        })
      }
    }

    const registradas = Array.from(resultados.values()).filter(
      (resultado) => resultado.registrada,
    ).length
    const fallidas = resultados.size - registradas

    setImportacionSantamaria((actual) => {
      if (!actual) return actual

      return {
        ...actual,
        ordenes: actual.ordenes.map((orden) => {
          const resultado = resultados.get(orden.numeroPedido)
          if (!resultado) return orden

          return resultado.registrada
            ? {
                ...orden,
                registrada: true,
                seleccionada: false,
              }
            : {
                ...orden,
                seleccionada: false,
                errores: [
                  ...orden.errores,
                  resultado.error ?? "No se pudo registrar la orden.",
                ],
              }
        }),
      }
    })

    try {
      setPedidos(await obtenerPedidosDb())
    } catch {
      // El registro ya terminó; el botón Actualizar permite recargar la lista.
    }

    if (registradas > 0) {
      setMensaje(
        `${registradas} orden${registradas === 1 ? "" : "es"} de Mega Santamaría registrada${registradas === 1 ? "" : "s"} correctamente.`,
      )
    }

    if (fallidas > 0) {
      setError(
        `${fallidas} orden${fallidas === 1 ? "" : "es"} no se pudo${fallidas === 1 ? "" : "ieron"} registrar. Revisa el detalle.`,
      )
    }

    setCargandoArchivo(false)
  }

  async function seleccionarCliente(
    nuevoClienteId: string,
  ) {
    setClienteId(nuevoClienteId)
    setBodegaId("")
    setBodegas([])
    setProductos([])
    setCantidadesManejo({})
    setMensaje("")
    setError("")

    if (!nuevoClienteId) return

    try {
      const [bodegasDb, productosDb] =
        await Promise.all([
          obtenerBodegasClienteDb(
            nuevoClienteId,
          ),
          obtenerProductosClienteDb(
            nuevoClienteId,
          ),
        ])

      setBodegas(bodegasDb)
      setProductos(productosDb)

      const cantidadesIniciales =
        productosDb.reduce<CantidadesPedido>(
          (acumulado, producto) => {
            acumulado[producto.id] = ""
            return acumulado
          },
          {},
        )

      setCantidadesManejo(cantidadesIniciales)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los datos del cliente.",
      )
    }
  }

  const bodegaSeleccionada = bodegas.find(
    (bodega) => bodega.id === bodegaId,
  )

  function cambiarCantidadManejo(
    productoId: string,
    valor: string,
  ) {
    if (
      valor !== "" &&
      (!/^\d+$/.test(valor) ||
        Number(valor) < 0)
    ) {
      return
    }

    setCantidadesManejo((actuales) => ({
      ...actuales,
      [productoId]: valor,
    }))
  }

  const detallesPedido = useMemo(() => {
    return productos
      .map((producto) => {
        const unidadesManejo = Number(
          cantidadesManejo[producto.id] ?? 0,
        )

        const totalUnidades =
          unidadesManejo *
          producto.unidad_manejo

        return {
          producto,
          unidadesManejo,
          totalUnidades,
        }
      })
      .filter(
        (detalle) =>
          detalle.unidadesManejo > 0,
      )
  }, [productos, cantidadesManejo])

  const totalSkus = detallesPedido.length

  const totalUnidades =
    detallesPedido.reduce(
      (total, detalle) =>
        total + detalle.totalUnidades,
      0,
    )

  const totalUnidadesManejo =
    detallesPedido.reduce(
      (total, detalle) =>
        total + detalle.unidadesManejo,
      0,
    )

  function limpiarFormulario() {
    setNumeroPedidoCliente("")
    setClienteId("")
    setBodegaId("")
    setBodegas([])
    setProductos([])
    setCantidadesManejo({})
    setFechaEntrega(fechaManana())
    setHoraEntrega("")
    setPrioridad("NORMAL")
  }

  async function guardarPedido() {
    setMensaje("")
    setError("")

    if (!numeroPedidoCliente.trim()) {
      setError(
        "Ingresa el número del pedido.",
      )
      return
    }

    if (!clienteId) {
      setError("Selecciona un cliente.")
      return
    }

    if (!bodegaSeleccionada) {
      setError("Selecciona una bodega.")
      return
          }

    if (!fechaEntrega) {
      setError(
        "Selecciona la fecha de entrega.",
      )
      return
    }

    if (detallesPedido.length === 0) {
      setError(
        "Ingresa al menos una gaveta o caja en un SKU.",
      )
      return
    }

    try {
      const pedidosExistentes =
        await buscarPedidosActivosBodegaFechaDb(
          bodegaId,
          fechaEntrega,
        )

      if (pedidosExistentes.length > 0) {
        const resumenExistentes =
          pedidosExistentes
            .map(
              (pedido) =>
                `• ${pedido.numero_pedido_cliente} · ${pedido.estado} · ${pedido.total_unidades} unidades`,
            )
            .join("\n")

        const confirmarPedidoAdicional =
          window.confirm(
            `Ya existe${
              pedidosExistentes.length > 1
                ? "n"
                : ""
            } ${pedidosExistentes.length} pedido${
              pedidosExistentes.length > 1
                ? "s"
                : ""
            } activo${
              pedidosExistentes.length > 1
                ? "s"
                : ""
            } para ${
              bodegaSeleccionada.nombre
            } con fecha ${fechaEntrega}:\n\n${resumenExistentes}\n\n¿Deseas ingresar otro pedido para esta misma bodega y fecha?`,
          )

        if (!confirmarPedidoAdicional) {
          setMensaje(
            "El nuevo pedido no fue guardado.",
          )
          return
        }
      }

      setGuardando(true)

      const resultado = await crearPedidoDb({
        numeroPedidoCliente:
          numeroPedidoCliente.trim(),
        clienteId,
        bodegaId,
        fechaEntrega,
        horaEntrega,
        prioridad,
        tipoEmpaque:
          bodegaSeleccionada.tipo_empaque,
        detalles: detallesPedido.map(
          (detalle) => ({
            productoId:
              detalle.producto.id,
            totalUnidades:
              detalle.totalUnidades,
            unidadManejo:
              detalle.producto
                .unidad_manejo,
          }),
        ),
      })

      setMensaje(
        `Pedido ${resultado.numeroPedidoCliente} creado correctamente con ${resultado.totalUnidades} unidades.`,
      )

      limpiarFormulario()

      const pedidosActualizados =
        await obtenerPedidosDb()

      setPedidos(pedidosActualizados)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el pedido.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarPedido(
    pedido: PedidoListadoDb,
  ) {
    if (pedido.estado !== "INGRESADO") {
      setError(
        `El pedido ${pedido.numero_pedido_cliente} está en estado ${pedido.estado} y no puede eliminarse.`,
      )
      return
    }

    const confirmacion = window.confirm(
      `¿Eliminar definitivamente el pedido ${pedido.numero_pedido_cliente}?\n\nEsta acción eliminará también todos sus productos y no se puede deshacer.`,
    )

    if (!confirmacion) return

    setMensaje("")
    setError("")
    setGuardando(true)

    try {
      const resultado =
        await eliminarPedidoIngresadoDb(
          pedido.id,
        )

      if (pedidoVisualizado?.id === pedido.id) {
        cerrarDetallePedido()
      }

      setPedidos((actuales) =>
        actuales.filter(
          (item) => item.id !== pedido.id,
        ),
      )

      setMensaje(
        `Pedido ${resultado.numeroPedidoCliente} eliminado correctamente.`,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el pedido.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function verPedido(
    pedido: PedidoListadoDb,
  ) {
    setPedidoVisualizado(pedido)
    setDetalleVisualizado([])
    setCargandoDetalle(true)
    setMensaje("")
    setError("")

    try {
      const detalles =
        await obtenerDetallePedidoDb(
          pedido.id,
        )

      setDetalleVisualizado(detalles)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el pedido.",
      )
    } finally {
      setCargandoDetalle(false)
    }
  }

  function cerrarDetallePedido() {
    setPedidoVisualizado(null)
    setDetalleVisualizado([])
  }

  const pedidosOrdenados = useMemo(() => {
    return pedidos
      .filter(
        (pedido) =>
          pedido.estado === filtroEstadoPedidos,
      )
      .sort((a, b) =>
        b.creado_en.localeCompare(
          a.creado_en,
        ),
      )
  }, [pedidos, filtroEstadoPedidos])

  if (cargando) {
    return (
      <main className="c1-orders" style={pagina}>
        <style>{pedidosResponsiveCss}</style>
        <h1>Pedidos</h1>
        <p>Cargando información...</p>
      </main>
    )
  }

  return (
    <main className="c1-orders" style={pagina}>
      <style>{pedidosResponsiveCss}</style>
      <header className="orders-header" style={cabecera}>
        <div>
          <span style={etiqueta}>
            MÓDULO COMERCIAL
          </span>

          <h1 style={tituloPrincipal}>
            Pedidos
          </h1>

          <p style={subtitulo}>
            Ingreso de pedidos por gavetas o
            cajas.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarPantalla}
          style={botonSecundario}
        >
          Actualizar
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

      <section className="orders-import" style={panelImportacion}>
        <div>
          <span style={etiqueta}>
            IMPORTACIÓN AUTOMÁTICA
          </span>

          <h2 style={{ margin: "5px 0" }}>
            Cargar pedidos de clientes
          </h2>

          <p style={descripcionPanel}>
            Importa el TXT de Favorita o el CSV de
            Mega Santamaría. El sistema reconocerá
            número, bodega, fecha y cantidades por SKU.
          </p>
        </div>

        <div className="orders-import-actions" style={accionesImportacion}>
          <input
            ref={archivoFavoritaRef}
            type="file"
            accept=".txt,text/plain"
            disabled={cargandoArchivo}
            onChange={(evento) => {
              const archivo =
                evento.target.files?.[0]

              if (archivo) {
                cargarArchivoFavorita(archivo)
              }
            }}
            style={{ display: "none" }}
          />

          <input
            ref={archivoSantamariaRef}
            type="file"
            accept=".csv,text/csv"
            disabled={cargandoArchivo}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0]

              if (archivo) {
                cargarArchivoSantamaria(archivo)
              }
            }}
            style={{ display: "none" }}
          />

          <button
            type="button"
            onClick={() =>
              archivoFavoritaRef.current?.click()
            }
            disabled={cargandoArchivo}
            style={{
              ...botonImportar,
              opacity: cargandoArchivo
                ? 0.5
                : 1,
            }}
          >
            {cargandoArchivo
              ? "Leyendo archivo..."
              : "Seleccionar TXT Favorita"}
          </button>

          <button
            type="button"
            onClick={() => archivoSantamariaRef.current?.click()}
            disabled={cargandoArchivo}
            style={{
              ...botonImportarSantamaria,
              opacity: cargandoArchivo ? 0.5 : 1,
            }}
          >
            {cargandoArchivo
              ? "Procesando..."
              : "Seleccionar CSV Santamaría"}
          </button>
        </div>
      </section>

      {importacionSantamaria && (
        <section className="orders-panel" style={panelImportacionSantamaria}>
          <div style={tituloPanel}>
            <div>
              <span style={etiqueta}>VISTA PREVIA</span>
              <h2 style={{ margin: "5px 0" }}>
                Órdenes de Mega Santamaría
              </h2>
              <p style={descripcionPanel}>
                {importacionSantamaria.archivo} · {importacionSantamaria.bodega.nombre}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setImportacionSantamaria(null)}
              disabled={cargandoArchivo}
              style={botonCerrarImportacion}
            >
              Cerrar
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>Importar</th>
                  <th style={encabezado}>Orden</th>
                  <th style={encabezado}>Entrega</th>
                  <th style={encabezado}>SKU</th>
                  <th style={encabezado}>Cajas</th>
                  <th style={encabezado}>Unidades</th>
                  <th style={encabezado}>Estado</th>
                </tr>
              </thead>

              <tbody>
                {importacionSantamaria.ordenes.map((orden) => {
                  const totalCajas = orden.lineas.reduce(
                    (total, linea) => total + linea.cantidadEmpaques,
                    0,
                  )
                  const totalOrden = orden.lineas.reduce(
                    (total, linea) => total + linea.totalUnidades,
                    0,
                  )
                  const bloqueada =
                    orden.registrada || orden.errores.length > 0

                  return (
                    <tr key={orden.numeroPedido || orden.unidadNegocio}>
                      <td style={celda}>
                        <input
                          type="checkbox"
                          checked={orden.seleccionada}
                          disabled={bloqueada || cargandoArchivo}
                          onChange={(evento) =>
                            cambiarSeleccionOrdenSantamaria(
                              orden.numeroPedido,
                              evento.target.checked,
                            )
                          }
                          aria-label={`Importar orden ${orden.numeroPedido}`}
                          style={checkImportacion}
                        />
                      </td>
                      <td style={celda}>
                        <strong>{orden.numeroPedido || "Sin número"}</strong>
                        <br />
                        <small>{orden.unidadNegocio}</small>
                      </td>
                      <td style={celda}>{orden.fechaEntrega || "Sin fecha"}</td>
                      <td style={celda}>{orden.lineas.length}</td>
                      <td style={celda}>{totalCajas}</td>
                      <td style={celda}>
                        <strong>{totalOrden}</strong>
                      </td>
                      <td style={{ ...celda, whiteSpace: "normal" }}>
                        {orden.registrada ? (
                          <span style={badgeCorrecto}>REGISTRADA</span>
                        ) : orden.errores.length === 0 ? (
                          <span style={badgeCorrecto}>LISTA</span>
                        ) : (
                          <div>
                            <span style={badgeErrorImportacion}>REVISAR</span>
                            <ul style={listaErroresImportacion}>
                              {orden.errores.map((detalle, indice) => (
                                <li key={`${detalle}-${indice}`}>{detalle}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={pieImportacionSantamaria}>
            <div>
              <strong>
                {
                  importacionSantamaria.ordenes.filter(
                    (orden) =>
                      orden.seleccionada &&
                      !orden.registrada &&
                      orden.errores.length === 0,
                  ).length
                } órdenes seleccionadas
              </strong>
              <p style={descripcionPanel}>
                Las órdenes con errores no se guardarán incompletas.
              </p>
            </div>

            <button
              type="button"
              onClick={registrarPedidosSantamaria}
              disabled={
                cargandoArchivo ||
                !importacionSantamaria.ordenes.some(
                  (orden) =>
                    orden.seleccionada &&
                    !orden.registrada &&
                    orden.errores.length === 0,
                )
              }
              style={{
                ...botonGuardar,
                opacity:
                  cargandoArchivo ||
                  !importacionSantamaria.ordenes.some(
                    (orden) =>
                      orden.seleccionada &&
                      !orden.registrada &&
                      orden.errores.length === 0,
                  )
                    ? 0.5
                    : 1,
              }}
            >
              {cargandoArchivo
                ? "Registrando órdenes..."
                : "Registrar órdenes seleccionadas"}
            </button>
          </div>
        </section>
      )}

      <section className="orders-panel orders-data" style={panel}>
        <div className="orders-panel-title" style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Datos del pedido
            </h2>

            <p style={descripcionPanel}>
              Selecciona el cliente, bodega y
              fecha de entrega.
            </p>
          </div>

          <span style={estadoNuevo}>
            NUEVO
          </span>
        </div>

        <div className="orders-form" style={formularioPrincipal}>
          <div>
            <label style={label}>
              Número de pedido
            </label>

            <input
              value={numeroPedidoCliente}
              onChange={(evento) =>
                setNumeroPedidoCliente(
                  evento.target.value.toUpperCase(),
                )
              }
              placeholder="Ej. 458721"
              style={campo}
            />
          </div>

          <div>
            <label style={label}>
              Cliente
            </label>

            <select
              value={clienteId}
              onChange={(evento) =>
                seleccionarCliente(
                  evento.target.value,
                )
              }
              style={campo}
            >
              <option value="">
                Seleccione...
              </option>

              {clientes.map((cliente) => (
                <option
                  key={cliente.id}
                  value={cliente.id}
                >
                  {cliente.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>
              Bodega
            </label>

            <select
              value={bodegaId}
              disabled={!clienteId}
              onChange={(evento) =>
                setBodegaId(
                  evento.target.value,
                )
              }
              style={campo}
            >
              <option value="">
                Seleccione...
              </option>

              {bodegas.map((bodega) => (
                <option
                  key={bodega.id}
                  value={bodega.id}
                >
                  {bodega.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={label}>
              Fecha de entrega
            </label>

            <input
              type="date"
              value={fechaEntrega}
              onChange={(evento) =>
                setFechaEntrega(
                  evento.target.value,
                )
              }
              style={campo}
            />
          </div>

          <div>
            <label style={label}>
              Hora de entrega
            </label>

            <input
              type="time"
              value={horaEntrega}
              onChange={(evento) =>
                setHoraEntrega(
                  evento.target.value,
                )
              }
              style={campo}
            />
          </div>

          <div>
            <label style={label}>
              Prioridad
            </label>
    <select
              value={prioridad}
              onChange={(evento) =>
                setPrioridad(
                  evento.target.value as
                    | "NORMAL"
                    | "ALTA"
                    | "URGENTE",
                )
              }
              style={campo}
            >
              <option value="NORMAL">
                Normal
              </option>

              <option value="ALTA">
                Alta
              </option>

              <option value="URGENTE">
                Urgente
              </option>
            </select>
          </div>

          <div>
            <label style={label}>
              Tipo de empaque
            </label>

            <input
              value={
                bodegaSeleccionada?.tipo_empaque ??
                ""
              }
              readOnly
              placeholder="Se completa con la bodega"
              style={{
                ...campo,
                background: "#f4f5f7",
              }}
            />
          </div>
        </div>

        <div style={avisoDuplicado}>
          Si ya existe un pedido activo para la misma bodega
          y fecha, el sistema pedirá confirmación antes de
          registrar uno adicional.
        </div>
      </section>

      <section className="orders-panel orders-products" style={panel}>
        <div className="orders-panel-title" style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Productos solicitados
            </h2>

            <p style={descripcionPanel}>
              Ingresa el número de gavetas o
              cajas. Las unidades se calculan
              automáticamente.
            </p>
          </div>

          <span style={contador}>
            {productos.length}
          </span>
        </div>

        {!clienteId ? (
          <div style={estadoVacio}>
            Selecciona un cliente para mostrar
            sus productos.
          </div>
        ) : productos.length === 0 ? (
          <div style={estadoVacio}>
            Este cliente no tiene productos
            asignados.
          </div>
        ) : (
          <div className="orders-products-table" style={{ overflowX: "auto" }}>
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
                    Unidad de manejo
                  </th>

                  <th style={encabezado}>
                    Gavetas / cajas
                  </th>

                  <th style={encabezado}>
                    Unidades solicitadas
                  </th>

                  <th style={encabezado}>
                    Estado
                  </th>
                </tr>
              </thead>

              <tbody>
                {productos.map((producto) => {
                  const unidadesManejo = Number(
                    cantidadesManejo[
                      producto.id
                    ] ?? 0,
                  )

                  const unidadesSolicitadas =
                    unidadesManejo *
                    producto.unidad_manejo

                  return (
                    <tr key={producto.id}>
                      <td style={celda}>
                        <strong>
                          {producto.corto}
                        </strong>

                        <br />

                        <small>
                          {producto.nombre}
                        </small>
                      </td>

                      <td style={celda}>
                        {producto.codigo}
                      </td>

                      <td style={celda}>
                        <strong>
                          {producto.unidad_manejo}
                        </strong>
                      </td>

                      <td style={celda}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={
                            cantidadesManejo[
                              producto.id
                            ] ?? ""
                          }
                          onChange={(evento) =>
                            cambiarCantidadManejo(
                              producto.id,
                              evento.target.value,
                            )
                          }
                          style={campoCantidad}
                        />
                      </td>

                      <td style={celda}>
                        <strong
                          style={{
                            color:
                              unidadesSolicitadas >
                              0
                                ? "#8f1d24"
                                : "#6b7280",
                            fontSize: "17px",
                          }}
                        >
                          {unidadesSolicitadas}
                        </strong>
                      </td>

                      <td style={celda}>
                        {unidadesManejo > 0 ? (
                          <span style={badgeCorrecto}>
                            Solicitado
                          </span>
                        ) : (
                          <span style={badgeNeutro}>
                            Sin pedido
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="orders-summary" style={resumenPedido}>
        <div style={tarjetaResumen}>
          <span style={datoTitulo}>
            SKU solicitados
          </span>

          <strong style={datoResumen}>
            {totalSkus}
          </strong>
        </div>

        <div style={tarjetaResumen}>
          <span style={datoTitulo}>
            Gavetas / cajas
          </span>

          <strong style={datoResumen}>
            {totalUnidadesManejo}
          </strong>
        </div>

        <div style={tarjetaResumen}>
          <span style={datoTitulo}>
            Total de unidades
          </span>

          <strong style={datoResumen}>
            {totalUnidades}
          </strong>
        </div>

        <div style={tarjetaResumen}>
          <span style={datoTitulo}>
            Tipo de empaque
          </span>

          <strong style={datoResumenTexto}>
            {bodegaSeleccionada?.tipo_empaque ??
              "-"}
          </strong>
        </div>
      </section>

      <section className="orders-save-panel" style={panelAcciones}>
        <div>
          <span style={datoTitulo}>
            Resumen del pedido
          </span>

          <strong style={totalPedido}>
            {totalUnidadesManejo} gavetas o cajas ·{" "}
            {totalUnidades} unidades
          </strong>
        </div>

        <button
          type="button"
          onClick={guardarPedido}
          disabled={
            guardando ||
            detallesPedido.length === 0
          }
          style={{
            ...botonGuardar,
            opacity:
              guardando ||
              detallesPedido.length === 0
                ? 0.5
                : 1,
            cursor:
              guardando ||
              detallesPedido.length === 0
                ? "not-allowed"
                : "pointer",
          }}
        >
          {guardando
            ? "Guardando..."
            : "Guardar pedido"}
        </button>
      </section>

      <section className="orders-panel orders-registered" style={panel}>
        <div className="orders-panel-title" style={tituloPanel}>
          <div>
            <h2 style={{ margin: 0 }}>
              Pedidos registrados
            </h2>

            <p style={descripcionPanel}>
              Pedidos almacenados en Supabase.
            </p>
          </div>

          <div className="orders-registered-tools">
            <div
              className="orders-status-filter"
              aria-label="Filtrar pedidos por estado"
            >
              <button
                type="button"
                onClick={() =>
                  setFiltroEstadoPedidos(
                    "INGRESADO",
                  )
                }
                className={
                  filtroEstadoPedidos ===
                  "INGRESADO"
                    ? "activo"
                    : ""
                }
              >
                Ingresados
              </button>

              <button
                type="button"
                onClick={() =>
                  setFiltroEstadoPedidos(
                    "DESPACHADO",
                  )
                }
                className={
                  filtroEstadoPedidos ===
                  "DESPACHADO"
                    ? "activo"
                    : ""
                }
              >
                Despachados
              </button>
            </div>

            <span style={contador}>
              {pedidosOrdenados.length}
            </span>
          </div>
        </div>

        {pedidosOrdenados.length === 0 ? (
          <div style={estadoVacio}>
            {filtroEstadoPedidos === "INGRESADO"
              ? "No existen pedidos ingresados."
              : "No existen pedidos despachados."}
          </div>
        ) : (
          <div className="orders-registered-table" style={{ overflowX: "auto" }}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={encabezado}>
                    Fecha de ingreso
                  </th>
                  <th style={encabezado}>
                    Cliente
                  </th>
                  <th style={encabezado}>
                    Bodega
                  </th>
                  <th style={encabezado}>
                    Estado
                  </th>
                  <th style={encabezado}>
                    Unidades
                  </th>
                  <th style={encabezado}>
                    Acción
                  </th>
                </tr>
              </thead>

              <tbody>
                {pedidosOrdenados.map(
                  (pedido) => (
                    <tr key={pedido.id}>
                      <td style={celda}>
                        <strong>
                          {new Date(
                            pedido.creado_en,
                          ).toLocaleDateString(
                            "es-EC",
                          )}
                        </strong>
                      </td>

                      <td style={celda}>
                        {pedido.cliente?.nombre ?? ""}
                      </td>

                      <td style={celda}>
                        {pedido.bodega?.nombre ?? ""}
                      </td>

                      <td style={celda}>
                        <span style={badgeEstado}>
                          {pedido.estado}
                        </span>
                      </td>

                      <td style={celda}>
                        <strong>
                          {pedido.total_unidades}
                        </strong>
                      </td>

                      <td style={celda}>
                        <div style={accionesPedido}>
                          <button
                            type="button"
                            onClick={() =>
                              verPedido(pedido)
                            }
                            style={botonVerPedido}
                          >
                            Ver pedido
                          </button>

                          {pedido.estado === "INGRESADO" && (
                            <button
                              type="button"
                              onClick={() =>
                                eliminarPedido(pedido)
                              }
                              disabled={guardando}
                              style={{
                                ...botonEliminarPedido,
                                opacity: guardando
                                  ? 0.5
                                  : 1,
                              }}
                            >
                              Eliminar
                            </button>
                          )}
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

      {pedidoVisualizado && (
        <div style={fondoModal}>
          <section className="orders-modal" style={modalPedido}>
            <header style={cabeceraModal}>
              <div>
                <span style={etiqueta}>
                  DETALLE DEL PEDIDO
                </span>

                <h2 style={{ margin: "5px 0" }}>
                  {pedidoVisualizado.numero_pedido_cliente}
                </h2>

                <p style={descripcionPanel}>
                  Registro interno: {pedidoVisualizado.id}
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarDetallePedido}
                style={botonCerrarModal}
              >
                Cerrar
              </button>
            </header>

            <div className="orders-modal-kpis" style={datosPedidoVisualizado}>
              <div style={datoPedidoVisualizado}>
                <span style={datoTitulo}>
                  Número de pedido
                </span>

                <strong>
                  {pedidoVisualizado.numero_pedido_cliente}
                </strong>
              </div>

              <div style={datoPedidoVisualizado}>
                <span style={datoTitulo}>
                  Cliente
                </span>
                <strong>
                  {pedidoVisualizado.cliente
                    ?.nombre ?? "-"}
                </strong>
              </div>

              <div style={datoPedidoVisualizado}>
                <span style={datoTitulo}>
                  Bodega
                </span>
                <strong>
                  {pedidoVisualizado.bodega
                    ?.nombre ?? "-"}
                </strong>
              </div>

              <div style={datoPedidoVisualizado}>
                <span style={datoTitulo}>
                  Entrega
                </span>
                <strong>
                  {pedidoVisualizado.fecha_entrega}
                </strong>
              </div>

              <div style={datoPedidoVisualizado}>
                <span style={datoTitulo}>
                  Hora
                </span>
                <strong>
                  {pedidoVisualizado.hora_entrega
                    ? pedidoVisualizado.hora_entrega.slice(
                        0,
                        5,
                      )
                    : "-"}
                </strong>
              </div>

              <div style={datoPedidoVisualizado}>
                <span style={datoTitulo}>
                  Prioridad
                </span>
                <strong>
                  {pedidoVisualizado.prioridad}
                </strong>
              </div>

              <div style={datoPedidoVisualizado}>
                <span style={datoTitulo}>
                  Estado
                </span>    <strong>
                  {pedidoVisualizado.estado}
                </strong>
              </div>
            </div>

            {cargandoDetalle ? (
              <div style={estadoVacio}>
                Cargando detalle...
              </div>
            ) : detalleVisualizado.length === 0 ? (
              <div style={estadoVacio}>
                El pedido no contiene productos.
              </div>
            ) : (
              <div className="orders-detail-table" style={{ overflowX: "auto" }}>
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
                        Unidad de manejo
                      </th>
                      <th style={encabezado}>
                        Gavetas / cajas
                      </th>
                      <th style={encabezado}>
                        Unidades
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {detalleVisualizado.map(
                      (detalle) => (
                        <tr key={detalle.id}>
                          <td style={celda}>
                            <strong>
                              {detalle.producto
                                ?.corto ?? ""}
                            </strong>
                            <br />
                            <small>
                              {detalle.producto
                                ?.nombre ?? ""}
                            </small>
                          </td>

                          <td style={celda}>
                            {detalle.producto
                              ?.codigo ?? ""}
                          </td>

                          <td style={celda}>
                            {detalle.unidades_manejo}
                          </td>

                          <td style={celda}>
                            <strong>
                              {detalle.total_unidades /
                                detalle.unidades_manejo}
                            </strong>
                          </td>

                          <td style={celda}>
                            <strong>
                              {detalle.total_unidades}
                            </strong>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="orders-modal-summary" style={resumenModal}>
              <div>
                <span style={datoTitulo}>SKU</span>
                <strong style={valorModal}>
                  {detalleVisualizado.length}
                </strong>
              </div>

              <div>
                <span style={datoTitulo}>
                  Gavetas / cajas
                </span>
                <strong style={valorModal}>
                  {detalleVisualizado.reduce(
                    (total, detalle) =>
                      total +
                      detalle.total_unidades /
                        detalle.unidades_manejo,
                    0,
                  )}
                </strong>
              </div>

              <div>
                <span style={datoTitulo}>
                  Total de unidades
                </span>
                <strong style={valorModal}>
                  {detalleVisualizado.reduce(
                    (total, detalle) =>
                      total +
                      detalle.total_unidades,
                    0,
                  )}
                </strong>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function badgePrioridad(prioridad: string) {
  const colores =
    prioridad === "URGENTE"
      ? {
          background: "#fee2e2",
          color: "#991b1b",
        }
      : prioridad === "ALTA"
        ? {
            background: "#fef3c7",
            color: "#92400e",
          }
        : {
            background: "#e5e7eb",
            color: "#374151",
          }

  return {
    ...badge,
    ...colores,
  }
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

const tituloPrincipal = {
  margin: "5px 0",
  fontSize: "32px",
}

const subtitulo = {
  margin: 0,
  color: "#6b7280",
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

const panelAcciones = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
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

const descripcionPanel = {
  margin: "6px 0 0",
  color: "#6b7280",
  fontSize: "14px",
}

const estadoNuevo = {
  padding: "7px 11px",
  borderRadius: "999px",
  background: "#fff1d6",
  color: "#9a5d00",
  fontSize: "12px",
  fontWeight: "bold",
}

const formularioPrincipal = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(210px, 1fr))",
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
  minHeight: "43px",
  boxSizing: "border-box" as const,
  padding: "10px 12px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  background: "white",
  color: "#25272b",
}

const campoCantidad = {
  width: "110px",
  minHeight: "40px",
  boxSizing: "border-box" as const,
  padding: "8px 10px",
  border: "1px solid #cfd4da",
  borderRadius: "7px",
  textAlign: "right" as const,
  fontSize: "16px",
  fontWeight: "bold",
}

const resumenPedido = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(190px, 1fr))",
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

const datoResumen = {
  color: "#8f1d24",
  fontSize: "28px",
}

const datoResumenTexto = {
  color: "#8f1d24",
  fontSize: "20px",
}

const totalPedido = {
  display: "block",
  marginTop: "4px",
  color: "#8f1d24",
  fontSize: "23px",
}

const botonGuardar = {
  minHeight: "46px",
  padding: "12px 22px",
  border: "none",
  borderRadius: "9px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
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
  borderRadius: "10px",
  background: "#fafafa",
  color: "#6b7280",
  textAlign: "center" as const,
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "11px",
  borderBottom: "2px solid #d8dde3",
  background: "#f7f8fa",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
  fontSize: "13px",
}

const celda = {
  padding: "11px",
  borderBottom: "1px solid #edf0f2",
  whiteSpace: "nowrap" as const,
  verticalAlign: "middle" as const,
}

const badge = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: "bold",
}

const badgeEstado = {
  ...badge,
  background: "#e0f2fe",
  color: "#075985",
}

const badgeNeutro = {
  ...badge,
  background: "#f3f4f6",
  color: "#6b7280",
}

const badgeCorrecto = {
  ...badge,
  background: "#dcfce7",
  color: "#166534",
}

const accionesPedido = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
}

const botonEliminarPedido = {
  padding: "8px 12px",
  border: "1px solid #b91c1c",
  borderRadius: "7px",
  background: "white",
  color: "#b91c1c",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonVerPedido = {
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
  zIndex: 2000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  background: "rgba(15, 23, 42, 0.55)",
}

const modalPedido = {
  width: "min(1050px, 96vw)",
  maxHeight: "90vh",
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

const botonCerrarModal = {
  padding: "9px 14px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  background: "white",
  color: "#374151",
  cursor: "pointer",
}

const datosPedidoVisualizado = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  marginBottom: "20px",
}

const datoPedidoVisualizado = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "5px",
  padding: "13px",
  borderRadius: "9px",
  background: "#f7f8fa",
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

const valorModal = {
  display: "block",
  marginTop: "5px",
  color: "#8f1d24",
  fontSize: "24px",
}

const avisoDuplicado = {
  marginTop: "16px",
  padding: "12px 14px",
  borderLeft: "4px solid #2563eb",
  borderRadius: "8px",
  background: "#eff6ff",
  color: "#1e40af",
  fontSize: "13px",
}

const panelImportacion = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  marginBottom: "22px",
  padding: "22px",
  border: "1px solid #bfdbfe",
  borderRadius: "14px",
  background: "#eff6ff",
}

const accionesImportacion = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
  gap: "10px",
  flexShrink: 0,
}

const botonImportar = {
  minHeight: "44px",
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonImportarSantamaria = {
  ...botonImportar,
  background: "#8f1d24",
}

const panelImportacionSantamaria = {
  ...panel,
  borderColor: "#f0d2ad",
  background: "#fffdf9",
}

const botonCerrarImportacion = {
  padding: "9px 14px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  background: "white",
  color: "#374151",
  fontWeight: "bold",
  cursor: "pointer",
}

const checkImportacion = {
  width: "20px",
  height: "20px",
  accentColor: "#8f1d24",
  cursor: "pointer",
}

const badgeErrorImportacion = {
  ...badge,
  background: "#fee2e2",
  color: "#991b1b",
}

const listaErroresImportacion = {
  margin: "7px 0 0",
  paddingLeft: "18px",
  color: "#991b1b",
  fontSize: "12px",
}

const pieImportacionSantamaria = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  marginTop: "18px",
  paddingTop: "18px",
  borderTop: "1px solid #eee3dd",
}

const pedidosResponsiveCss = `
  .c1-orders {
    --c1-vino: #8F1D24;
    --c1-vino-oscuro: #68151A;
    --c1-naranja: #F7931E;
  }

  .c1-orders .orders-panel,
  .c1-orders .orders-save-panel,
  .c1-orders .orders-summary > div {
    border-color: #eee3dd !important;
    box-shadow: 0 5px 18px rgba(72,42,32,.045) !important;
  }

  .c1-orders .orders-import {
    border-color: #f0d2ad !important;
    background: linear-gradient(135deg,#fff8ef,#fffdf9) !important;
  }

  .c1-orders .orders-import button,
  .c1-orders .orders-save-panel > button {
    background: linear-gradient(90deg,#F7931E,#FF7900) !important;
    color: white !important;
    border-color: transparent !important;
  }

  .c1-orders input:focus,
  .c1-orders select:focus {
    outline: none;
    border-color: #F7931E !important;
    box-shadow: 0 0 0 3px rgba(247,147,30,.13);
  }

  .c1-orders .orders-registered-tools {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .c1-orders .orders-status-filter {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid #eadfd9;
    border-radius: 10px;
    background: #f8f4f1;
  }

  .c1-orders .orders-status-filter button {
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #75635d;
    font-weight: 800;
    cursor: pointer;
  }

  .c1-orders .orders-status-filter button.activo {
    background: #8F1D24;
    color: white;
    box-shadow: 0 3px 9px rgba(143,29,36,.14);
  }

  @media (max-width: 1000px) {
    .c1-orders { padding: 20px !important; }
    .c1-orders .orders-form {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
    }
  }

  @media (max-width: 760px) {
    .c1-orders {
      padding: 12px 10px 26px !important;
      max-width: none !important;
      overflow-x: hidden;
    }

    .c1-orders .orders-header {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 12px !important;
      margin-bottom: 14px !important;
    }

    .c1-orders .orders-header h1 {
      font-size: 26px !important;
    }

    .c1-orders .orders-header > button {
      width: 100%;
      min-height: 42px;
    }

    .c1-orders .orders-import {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 12px !important;
      padding: 14px !important;
      margin-bottom: 12px !important;
      border-radius: 12px !important;
    }

    .c1-orders .orders-import-actions,
    .c1-orders .orders-import-actions button {
      width: 100%;
    }

    .c1-orders .orders-panel {
      padding: 13px !important;
      margin-bottom: 12px !important;
      border-radius: 12px !important;
    }

    .c1-orders .orders-panel-title {
      align-items: flex-start !important;
      margin-bottom: 12px !important;
    }

    .c1-orders .orders-panel-title h2 {
      font-size: 18px;
    }

    .c1-orders .orders-registered .orders-panel-title {
      flex-direction: column !important;
      align-items: stretch !important;
    }

    .c1-orders .orders-registered-tools {
      width: 100%;
      justify-content: space-between;
    }

    .c1-orders .orders-status-filter {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .c1-orders .orders-status-filter button {
      width: 100%;
      padding: 0 8px;
      font-size: 11px;
    }

    .c1-orders .orders-form {
      grid-template-columns: 1fr !important;
      gap: 11px !important;
    }

    /* PRODUCTOS */
    .c1-orders .orders-products-table,
    .c1-orders .orders-registered-table,
    .c1-orders .orders-detail-table {
      overflow: visible !important;
    }

    .c1-orders .orders-products-table table,
    .c1-orders .orders-products-table tbody,
    .c1-orders .orders-products-table tr,
    .c1-orders .orders-products-table td,
    .c1-orders .orders-registered-table table,
    .c1-orders .orders-registered-table tbody,
    .c1-orders .orders-registered-table tr,
    .c1-orders .orders-registered-table td,
    .c1-orders .orders-detail-table table,
    .c1-orders .orders-detail-table tbody,
    .c1-orders .orders-detail-table tr,
    .c1-orders .orders-detail-table td {
      display: block !important;
      width: 100% !important;
    }

    .c1-orders .orders-products-table thead,
    .c1-orders .orders-registered-table thead,
    .c1-orders .orders-detail-table thead {
      display: none !important;
    }

    .c1-orders .orders-products-table tbody,
    .c1-orders .orders-registered-table tbody,
    .c1-orders .orders-detail-table tbody {
      display: grid !important;
      gap: 9px;
    }

    .c1-orders .orders-products-table tr,
    .c1-orders .orders-registered-table tr,
    .c1-orders .orders-detail-table tr {
      padding: 11px;
      border: 1px solid #eee3dd;
      border-radius: 12px;
      background: #fffdfb;
    }

    .c1-orders .orders-products-table td,
    .c1-orders .orders-registered-table td,
    .c1-orders .orders-detail-table td {
      min-height: 32px;
      display: grid !important;
      grid-template-columns: 116px minmax(0,1fr) !important;
      align-items: center;
      gap: 8px;
      padding: 5px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
      font-size: 12px;
    }

    .c1-orders .orders-products-table td::before,
    .c1-orders .orders-registered-table td::before,
    .c1-orders .orders-detail-table td::before {
      color: #8e7c75;
      font-size: 9px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
    }

    .c1-orders .orders-products-table td:nth-child(1)::before { content: "Producto"; }
    .c1-orders .orders-products-table td:nth-child(2)::before { content: "Código"; }
    .c1-orders .orders-products-table td:nth-child(3)::before { content: "U. manejo"; }
    .c1-orders .orders-products-table td:nth-child(4)::before { content: "Gavetas / cajas"; }
    .c1-orders .orders-products-table td:nth-child(5)::before { content: "Unidades"; }
    .c1-orders .orders-products-table td:nth-child(6)::before { content: "Estado"; }

    .c1-orders .orders-registered-table td:nth-child(1)::before { content: "Ingreso"; }
    .c1-orders .orders-registered-table td:nth-child(2)::before { content: "Cliente"; }
    .c1-orders .orders-registered-table td:nth-child(3)::before { content: "Bodega"; }
    .c1-orders .orders-registered-table td:nth-child(4)::before { content: "Estado"; }
    .c1-orders .orders-registered-table td:nth-child(5)::before { content: "Unidades"; }
    .c1-orders .orders-registered-table td:nth-child(6)::before { content: "Acciones"; }

    .c1-orders .orders-detail-table td:nth-child(1)::before { content: "Producto"; }
    .c1-orders .orders-detail-table td:nth-child(2)::before { content: "Código"; }
    .c1-orders .orders-detail-table td:nth-child(3)::before { content: "U. manejo"; }
    .c1-orders .orders-detail-table td:nth-child(4)::before { content: "Gavetas / cajas"; }
    .c1-orders .orders-detail-table td:nth-child(5)::before { content: "Unidades"; }

    .c1-orders .orders-products-table input {
      width: 104px !important;
      justify-self: end;
    }

    .c1-orders .orders-summary {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      gap: 8px !important;
      margin-bottom: 12px !important;
    }

    .c1-orders .orders-summary > div {
      min-width: 0;
      padding: 11px !important;
    }

    .c1-orders .orders-save-panel {
      position: sticky;
      bottom: 74px;
      z-index: 25;
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 10px !important;
      padding: 13px !important;
      margin-bottom: 12px !important;
      background: rgba(255,255,255,.97) !important;
    }

    .c1-orders .orders-save-panel > button {
      width: 100%;
      min-height: 48px;
    }

    .c1-orders .orders-registered-table td:last-child > div {
      justify-self: end;
    }

    .c1-orders .orders-modal {
      width: 100vw !important;
      height: 100dvh !important;
      max-height: 100dvh !important;
      padding: 13px 11px 26px !important;
      border-radius: 0 !important;
    }

    .c1-orders .orders-modal > header {
      position: sticky;
      top: -13px;
      z-index: 12;
      padding: 13px 0 10px;
      background: white;
    }

    .c1-orders .orders-modal-kpis {
      grid-template-columns: repeat(2,minmax(0,1fr)) !important;
      gap: 7px !important;
    }

    .c1-orders .orders-modal-summary {
      grid-template-columns: repeat(3,1fr) !important;
      gap: 6px !important;
      padding: 10px !important;
    }
  }
`
