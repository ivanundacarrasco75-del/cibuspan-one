// CIBUSPAN ONE BUILD: DEVOLUCIONES_COMPATIBLE_REPO_V9_20260809
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  obtenerBodegasDevolucionDb,
  obtenerClientesDevolucionDb,
  obtenerDevolucionesDb,
  obtenerProductosDevolucionDb,
  registrarDevolucionDb,
  type BodegaDevolucionDb,
  type ClienteDevolucionDb,
  type DevolucionListadoDb,
  type ProductoDevolucionDb,
} from "../repositories/devolucionRepository"
import ImportacionMasivaDevoluciones from "../components/devoluciones/ImportacionMasivaDevoluciones"

type VistaDevoluciones = "INGRESO" | "IMPORTAR" | "HISTORIAL"
type OrigenRegistro = "MANUAL" | "DOCUMENTO"
type Cantidades = Record<string, string>
type TipoSemanaFiltro = "RECEPCION" | "ORIGEN"

type DatosDocumentoImportado = {
  tipo: "SUPERMAXI" | "GENERICO"
  numero: string
  fecha: string
  tdaCodigo: string
  tdaNombre: string
  observacion: string
  skus: number
  unidades: number
}

type ResultadoImportacionDocumento = {
  cantidades: Cantidades
  advertencias: string[]
  metadatos: DatosDocumentoImportado
}

const DIAS_RETIRO_ANTES_CADUCIDAD = 2

const MESES_DOCUMENTO: Record<string, string> = {
  ENE: "01",
  FEB: "02",
  MAR: "03",
  ABR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AGO: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DIC: "12",
  JAN: "01",
  APR: "04",
  AUG: "08",
  DEC: "12",
}

function fechaHoy() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function fechaIsoLocal(fecha: Date) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function sumarDias(fechaIso: string, dias: number) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIsoLocal(fecha)
}

function inicioSemana(fechaIso: string) {
  if (!fechaIso) return ""

  const fecha = new Date(`${fechaIso}T12:00:00`)
  const dia = fecha.getDay()
  const diasDesdeLunes = dia === 0 ? 6 : dia - 1

  fecha.setDate(fecha.getDate() - diasDesdeLunes)
  return fechaIsoLocal(fecha)
}

function numeroSemanaIso(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  const fechaUtc = new Date(
    Date.UTC(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
    ),
  )

  const dia = fechaUtc.getUTCDay() || 7
  fechaUtc.setUTCDate(
    fechaUtc.getUTCDate() + 4 - dia,
  )

  const inicioAnio = new Date(
    Date.UTC(fechaUtc.getUTCFullYear(), 0, 1),
  )

  return Math.ceil(
    ((fechaUtc.getTime() - inicioAnio.getTime()) /
      86400000 +
      1) /
      7,
  )
}

function fechaCorta(fechaIso: string) {
  if (!fechaIso) return ""
  const [anio, mes, dia] = fechaIso.split("-")
  return `${dia}/${mes}/${anio.slice(2)}`
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor || 0)
}

function etiquetaSemana(semanaInicio: string) {
  if (!semanaInicio) return "—"

  const fin = sumarDias(semanaInicio, 6)
  const semana = numeroSemanaIso(semanaInicio)

  return `S${semana} · ${fechaCorta(
    semanaInicio,
  )}–${fechaCorta(fin)}`
}

function vidaEfectiva(vidaUtil: number) {
  return Math.max(
    1,
    Number(vidaUtil || 0) -
      DIAS_RETIRO_ANTES_CADUCIDAD,
  )
}

function desfaseSemanas(vidaUtil: number) {
  return Math.max(
    0,
    Math.round(vidaEfectiva(vidaUtil) / 7),
  )
}

function semanaOrigenCalculada(
  fechaDevolucion: string,
  vidaUtil: number,
) {
  const semanaRecepcion = inicioSemana(fechaDevolucion)
  const desfase = desfaseSemanas(vidaUtil)

  return sumarDias(
    semanaRecepcion,
    -(desfase * 7),
  )
}

function totalUnidadesDevolucion(
  devolucion: DevolucionListadoDb,
) {
  return (devolucion.detalles ?? []).reduce(
    (total, detalle) =>
      total + Number(detalle.unidades ?? 0),
    0,
  )
}

function normalizarTexto(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
}

function esErrorDocumentoDuplicado(
  mensaje: string,
) {
  const texto = normalizarTexto(mensaje)

  return (
    texto.includes("YA FUE REGISTR") ||
    texto.includes("DUPLIC") ||
    (
      texto.includes("DOCUMENTO") &&
      (
        texto.includes("YA EXIST") ||
        texto.includes("UNIQUE") ||
        texto.includes("UNICO") ||
        texto.includes("REPETID")
      )
    )
  )
}


function convertirFechaDocumento(
  dia: string,
  mesTexto: string,
  anio: string,
) {
  const mes =
    MESES_DOCUMENTO[
      normalizarTexto(mesTexto)
    ] ?? ""

  if (!dia || !mes || !anio) return ""

  return `${anio}-${mes}-${dia.padStart(2, "0")}`
}

function extraerDocumentoSupermaxi(
  texto: string,
  productos: ProductoDevolucionDb[],
): ResultadoImportacionDocumento | null {
  const lineas = texto.split(/\r?\n/)
  const textoNormalizado = normalizarTexto(texto)

  const esSupermaxi =
    textoNormalizado.includes(
      "CORPORACION FAVORITA",
    ) &&
    textoNormalizado.includes(
      "DEVOLUCION PROVEEDOR",
    )

  if (!esSupermaxi) return null

  const coincidenciaNumero = texto.match(
    /No\.\s*:\s*(\d+)/i,
  )

  const coincidenciaFecha = texto.match(
    /Fecha\s+Elaboracion\s*:\s*(\d{2})\/([A-Z]{3})\/(\d{4})/i,
  )

  const numero =
    coincidenciaNumero?.[1] ?? ""

  const fecha = coincidenciaFecha
    ? convertirFechaDocumento(
        coincidenciaFecha[1],
        coincidenciaFecha[2],
        coincidenciaFecha[3],
      )
    : ""

  const indiceTda = lineas.findIndex((linea) =>
    normalizarTexto(linea).includes(
      "TDA/ALM/CDI:",
    ),
  )

  let tdaCodigo = ""
  let tdaNombre = ""

  if (indiceTda >= 0) {
    const lineaTda = lineas
      .slice(indiceTda + 1)
      .find((linea) => linea.trim())

    const coincidenciaTda =
      lineaTda?.match(
        /^\s*(\d+)\s+(.+?)\s{2,}\d+\s+/,
      )

    if (coincidenciaTda) {
      tdaCodigo = coincidenciaTda[1]
      tdaNombre = coincidenciaTda[2].trim()
    }
  }

  const lineaObservacion = lineas.find(
    (linea) =>
      /^\s*Observaciones\s*:/i.test(linea),
  )

  const observacion =
    lineaObservacion
      ?.replace(
        /^\s*Observaciones\s*:\s*/i,
        "",
      )
      .trim() ?? ""

  const productosPorCodigo = new Map(
    productos.map((producto) => [
      producto.codigo.trim(),
      producto,
    ]),
  )

  const cantidades: Cantidades = {}
  const advertencias: string[] = []
  const codigosDesconocidos =
    new Set<string>()

  let unidadesDocumento = 0
  let filasDocumento = 0

  lineas.forEach((lineaOriginal) => {
    const linea = lineaOriginal.trim()

    if (!/^\d{13}\s+/.test(linea)) {
      return
    }

    const coincidencia = linea.match(
      /^(\d{13})\s+\d+\s+.+?\s+\d+\s*g\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?\s+(\d+(?:[.,]\d+)?)(?:\s|$)/i,
    )

    if (!coincidencia) {
      advertencias.push(
        `No se pudo interpretar la línea: ${linea.slice(
          0,
          80,
        )}`,
      )
      return
    }

    const codigo = coincidencia[1]
    const unidades = Math.round(
      Number(
        coincidencia[2].replace(",", "."),
      ),
    )

    filasDocumento += 1
    unidadesDocumento += unidades

    const producto =
      productosPorCodigo.get(codigo)

    if (!producto) {
      codigosDesconocidos.add(codigo)
      return
    }

    cantidades[producto.id] = String(
      Number(
        cantidades[producto.id] ?? 0,
      ) + unidades,
    )
  })

  if (codigosDesconocidos.size > 0) {
    advertencias.push(
      `Códigos del documento no asignados a este cliente en CIBUSPAN ONE: ${Array.from(
        codigosDesconocidos,
      ).join(", ")}`,
    )
  }

  const skusReconocidos = Object.values(
    cantidades,
  ).filter(
    (valor) => Number(valor) > 0,
  ).length

  const unidadesReconocidas =
    Object.values(cantidades).reduce(
      (total, valor) =>
        total + Number(valor || 0),
      0,
    )

  if (
    filasDocumento > 0 &&
    unidadesDocumento !== unidadesReconocidas
  ) {
    advertencias.push(
      `El documento contiene ${unidadesDocumento} unidades, pero ${unidadesReconocidas} quedaron asociadas a SKU configurados para el cliente.`,
    )
  }

  return {
    cantidades,
    advertencias,
    metadatos: {
      tipo: "SUPERMAXI",
      numero,
      fecha,
      tdaCodigo,
      tdaNombre,
      observacion,
      skus: skusReconocidos,
      unidades: unidadesReconocidas,
    },
  }
}

function extraerCantidadesDocumentoGenerico(
  texto: string,
  productos: ProductoDevolucionDb[],
): ResultadoImportacionDocumento {
  const cantidades: Cantidades = {}
  const advertencias: string[] = []
  const lineas = texto.split(/\r?\n/)

  const productosPorLongitud = [...productos].sort(
    (a, b) => b.codigo.length - a.codigo.length,
  )

  const codigosDesconocidos = new Set<string>()

  lineas.forEach((lineaOriginal) => {
    const linea = lineaOriginal.trim()
    if (!linea) return

    const producto = productosPorLongitud.find(
      (item) =>
        item.codigo && linea.includes(item.codigo),
    )

    if (!producto) {
      const codigo13 =
        linea.match(/\b\d{13}\b/)?.[0]

      if (codigo13) {
        codigosDesconocidos.add(codigo13)
      }

      return
    }

    const posicion =
      linea.indexOf(producto.codigo)

    const resto = linea.slice(
      posicion + producto.codigo.length,
    )

    const numeros = Array.from(
      resto.matchAll(/\d+(?:[.,]\d+)?/g),
    )
      .map((coincidencia) =>
        Number(
          coincidencia[0].replace(",", "."),
        ),
      )
      .filter(
        (numero) =>
          Number.isFinite(numero) && numero > 0,
      )

    if (numeros.length === 0) {
      advertencias.push(
        `${producto.corto}: se encontró el código pero no una cantidad clara.`,
      )
      return
    }

    const unidades = Math.round(numeros[0])

    cantidades[producto.id] = String(
      Number(cantidades[producto.id] ?? 0) +
        unidades,
    )
  })

  if (codigosDesconocidos.size > 0) {
    advertencias.push(
      `Códigos no reconocidos para este cliente: ${Array.from(
        codigosDesconocidos,
      ).join(", ")}`,
    )
  }

  return {
    cantidades,
    advertencias,
    metadatos: {
      tipo: "GENERICO",
      numero: "",
      fecha: "",
      tdaCodigo: "",
      tdaNombre: "",
      observacion: "",
      skus: Object.values(cantidades).filter(
        (valor) => Number(valor) > 0,
      ).length,
      unidades: Object.values(cantidades).reduce(
        (total, valor) =>
          total + Number(valor || 0),
        0,
      ),
    },
  }
}

export default function Devoluciones() {
  const archivoRef =
    useRef<HTMLInputElement | null>(null)

  const [vista, setVista] =
    useState<VistaDevoluciones>("INGRESO")

  const [clientes, setClientes] = useState<
    ClienteDevolucionDb[]
  >([])
  const [bodegas, setBodegas] = useState<
    BodegaDevolucionDb[]
  >([])
  const [productos, setProductos] = useState<
    ProductoDevolucionDb[]
  >([])
  const [devoluciones, setDevoluciones] = useState<
    DevolucionListadoDb[]
  >([])

  const [fechaDevolucion, setFechaDevolucion] =
    useState(fechaHoy())
  const [clienteId, setClienteId] = useState("")
  const [bodegaId, setBodegaId] = useState("")
  const [origenRegistro, setOrigenRegistro] =
    useState<OrigenRegistro>("MANUAL")
  const [documentoReferencia, setDocumentoReferencia] =
    useState("")
  const [motivo, setMotivo] = useState(
    "VENCIMIENTO / RETIRO DE PERCHA",
  )
  const [cantidades, setCantidades] =
    useState<Cantidades>({})
  const [busquedaSku, setBusquedaSku] = useState("")
  const [advertenciasDocumento, setAdvertenciasDocumento] =
    useState<string[]>([])

  const [datosDocumento, setDatosDocumento] =
    useState<DatosDocumentoImportado | null>(null)

  const [observacionDocumento, setObservacionDocumento] =
    useState("")

  const [busquedaHistorial, setBusquedaHistorial] =
    useState("")
  const [tipoSemanaFiltro, setTipoSemanaFiltro] =
    useState<TipoSemanaFiltro>("ORIGEN")
  const [fechaSemanaFiltro, setFechaSemanaFiltro] =
    useState("")
  const [devolucionSeleccionadaId, setDevolucionSeleccionadaId] =
    useState("")

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [cargandoArchivo, setCargandoArchivo] =
    useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const errorDialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    cargarPantalla()
  }, [])

  useEffect(() => {
    const dialogo = errorDialogRef.current

    if (!dialogo) return

    if (error) {
      if (!dialogo.open) {
        dialogo.showModal()
      }
      return
    }

    if (dialogo.open) {
      dialogo.close()
    }
  }, [error])

  async function cargarPantalla() {
    setCargando(true)
    setError("")

    try {
      const [clientesDb, devolucionesDb] =
        await Promise.all([
          obtenerClientesDevolucionDb(),
          obtenerDevolucionesDb(),
        ])

      setClientes(clientesDb)
      setDevoluciones(devolucionesDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el módulo de devoluciones.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function seleccionarCliente(
    nuevoClienteId: string,
  ) {
    setClienteId(nuevoClienteId)
    setBodegaId("")
    setBodegas([])
    setProductos([])
    setCantidades({})
    setAdvertenciasDocumento([])
    setDatosDocumento(null)
    setObservacionDocumento("")
    setMensaje("")
    setError("")

    if (!nuevoClienteId) return

    try {
      const [bodegasDb, productosDb] =
        await Promise.all([
          obtenerBodegasDevolucionDb(
            nuevoClienteId,
          ),
          obtenerProductosDevolucionDb(
            nuevoClienteId,
          ),
        ])

      setBodegas(bodegasDb)
      setProductos(productosDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los datos del cliente.",
      )
    }
  }

  function cambiarOrigen(
    nuevoOrigen: OrigenRegistro,
  ) {
    setOrigenRegistro(nuevoOrigen)
    setAdvertenciasDocumento([])
    setDatosDocumento(null)
    setObservacionDocumento("")
    setMensaje("")
    setError("")

    if (nuevoOrigen === "MANUAL") {
      setDocumentoReferencia("")
    }
  }

  async function cargarDocumento(
    archivo: File | null,
  ) {
    if (!archivo) return

    setCargandoArchivo(true)
    setError("")
    setMensaje("")
    setAdvertenciasDocumento([])
    setDatosDocumento(null)
    setObservacionDocumento("")

    try {
      const texto = await archivo.text()
      const textoNormalizado =
        normalizarTexto(texto)

      const esDocumentoFavorita =
        textoNormalizado.includes(
          "CORPORACION FAVORITA",
        ) &&
        textoNormalizado.includes(
          "DEVOLUCION PROVEEDOR",
        )

      let clienteDocumentoId = clienteId

      if (esDocumentoFavorita) {
        const clienteFavorita =
          clientes.find((cliente) => {
            const nombre =
              normalizarTexto(
                cliente.nombre,
              )

            return (
              nombre.includes("FAVORITA") ||
              nombre.includes("SUPERMAXI")
            )
          })

        if (!clienteFavorita) {
          throw new Error(
            "El documento pertenece a Corporación Favorita, pero no encontré ese cliente activo en CIBUSPAN ONE.",
          )
        }

        clienteDocumentoId =
          clienteFavorita.id
      }

      if (!clienteDocumentoId) {
        throw new Error(
          "No fue posible identificar el cliente automáticamente. Selecciona el cliente y vuelve a cargar el documento.",
        )
      }

      const [bodegasDb, productosDb] =
        await Promise.all([
          obtenerBodegasDevolucionDb(
            clienteDocumentoId,
          ),
          obtenerProductosDevolucionDb(
            clienteDocumentoId,
          ),
        ])

      const resultado: ResultadoImportacionDocumento =
        extraerDocumentoSupermaxi(
          texto,
          productosDb,
        ) ??
        extraerCantidadesDocumentoGenerico(
          texto,
          productosDb,
        )

      const numeroDocumento =
        resultado.metadatos.numero.trim()

      if (numeroDocumento) {
        const devolucionesActuales =
          await obtenerDevolucionesDb()

        const documentoExistente =
          devolucionesActuales.find(
            (devolucion) =>
              devolucion.cliente?.id ===
                clienteDocumentoId &&
              (devolucion.documento_referencia ?? "")
                .trim()
                .toUpperCase() ===
                numeroDocumento.toUpperCase(),
          )

        if (documentoExistente) {
          setCantidades({})
          setDatosDocumento(null)
          setDocumentoReferencia("")
          setObservacionDocumento("")

          if (archivoRef.current) {
            archivoRef.current.value = ""
          }

          setMensaje("")
          setError(
            `DOCUMENTO YA REGISTRADO. El documento de devolución ${numeroDocumento} ya fue registrado el ${documentoExistente.fecha_devolucion}. NO SE REGISTRÓ UNA NUEVA DEVOLUCIÓN.`,
          )
          return
        }
      }

      setClienteId(clienteDocumentoId)
      setBodegas(bodegasDb)
      setProductos(productosDb)
      setCantidades(resultado.cantidades)
      setAdvertenciasDocumento(
        resultado.advertencias,
      )
      setDatosDocumento(resultado.metadatos)

      if (resultado.metadatos.fecha) {
        setFechaDevolucion(
          resultado.metadatos.fecha,
        )
      }

      const referencia =
        resultado.metadatos.numero ||
        archivo.name

      setDocumentoReferencia(referencia)

      const observacionCompleta = [
        resultado.metadatos.observacion,
        resultado.metadatos.tdaCodigo ||
        resultado.metadatos.tdaNombre
          ? `Tda/Alm/CDI: ${[
              resultado.metadatos.tdaCodigo,
              resultado.metadatos.tdaNombre,
            ]
              .filter(Boolean)
              .join(" ")}`
          : "",
        `Archivo: ${archivo.name}`,
      ]
        .filter(Boolean)
        .join(" · ")

      setObservacionDocumento(
        observacionCompleta,
      )

      if (
        normalizarTexto(
          resultado.metadatos.observacion,
        ).includes("VIDA UTIL") ||
        normalizarTexto(
          resultado.metadatos.observacion,
        ).includes("VENCIMIENTO")
      ) {
        setMotivo(
          "VENCIMIENTO / RETIRO DE PERCHA",
        )
      }

      const nombreTda =
        resultado.metadatos.tdaNombre

      if (nombreTda) {
        const nombreNormalizado =
          normalizarTexto(nombreTda)

        const bodegaDetectada =
          bodegasDb.find((bodega) => {
            const nombreBodega =
              normalizarTexto(
                bodega.nombre,
              )

            return (
              nombreBodega ===
                nombreNormalizado ||
              nombreBodega.includes(
                nombreNormalizado,
              ) ||
              nombreNormalizado.includes(
                nombreBodega,
              )
            )
          })

        setBodegaId(
          bodegaDetectada?.id ?? "",
        )
      } else {
        setBodegaId("")
      }

      const skusReconocidos =
        resultado.metadatos.skus

      if (skusReconocidos === 0) {
        setError(
          "El documento fue reconocido, pero ninguno de sus códigos de barras está asignado al cliente en CIBUSPAN ONE.",
        )
        return
      }

      if (
        resultado.metadatos.tipo ===
        "SUPERMAXI"
      ) {
        setMensaje(
          `Devolución Supermaxi ${resultado.metadatos.numero || ""} cargada automáticamente: ${resultado.metadatos.skus} SKU y ${resultado.metadatos.unidades} unidades. Revisa y confirma el registro.`,
        )
      } else {
        setMensaje(
          `Documento leído: ${resultado.metadatos.skus} SKU y ${resultado.metadatos.unidades} unidades. Revisa las cantidades antes de guardar.`,
        )
      }
    } catch (err) {
      const mensajeErrorDocumento =
        err instanceof Error
          ? err.message
          : "No se pudo leer el documento."

      if (
        esErrorDocumentoDuplicado(
          mensajeErrorDocumento,
        )
      ) {
        setError("")
        setMensaje("")
        setCantidades({})
        setDatosDocumento(null)
        setDocumentoReferencia("")
        setObservacionDocumento("")

        if (archivoRef.current) {
          archivoRef.current.value = ""
        }

        setError(
          `DOCUMENTO YA REGISTRADO. ${mensajeErrorDocumento} NO SE REGISTRÓ UNA NUEVA DEVOLUCIÓN.`,
        )
      } else {
        setError(mensajeErrorDocumento)
      }
    } finally {
      setCargandoArchivo(false)
    }
  }

  function cambiarCantidad(
    productoId: string,
    valor: string,
  ) {
    if (valor !== "" && !/^\d+$/.test(valor)) {
      return
    }

    setCantidades((actual) => ({
      ...actual,
      [productoId]: valor,
    }))
  }

  function limpiarCantidades() {
    setCantidades({})
    setAdvertenciasDocumento([])
    setDatosDocumento(null)
    setObservacionDocumento("")

    if (archivoRef.current) {
      archivoRef.current.value = ""
    }
  }

  const productosFiltrados = useMemo(() => {
    const texto = busquedaSku.trim().toLowerCase()

    if (!texto) return productos

    return productos.filter(
      (producto) =>
        producto.codigo
          .toLowerCase()
          .includes(texto) ||
        producto.corto
          .toLowerCase()
          .includes(texto) ||
        producto.nombre
          .toLowerCase()
          .includes(texto),
    )
  }, [productos, busquedaSku])

  const resumenIngreso = useMemo(() => {
    let skus = 0
    let unidades = 0

    productos.forEach((producto) => {
      const cantidad = Number(
        cantidades[producto.id] ?? 0,
      )

      if (cantidad > 0) {
        skus += 1
        unidades += cantidad
      }
    })

    return { skus, unidades }
  }, [productos, cantidades])

  const semanasOrigenIngreso = useMemo(() => {
    const semanas = new Set<string>()

    productos.forEach((producto) => {
      const cantidad = Number(
        cantidades[producto.id] ?? 0,
      )

      if (cantidad <= 0) return

      semanas.add(
        semanaOrigenCalculada(
          fechaDevolucion,
          producto.vida_util_dias,
        ),
      )
    })

    return Array.from(semanas).sort()
  }, [productos, cantidades, fechaDevolucion])

  async function guardarDevolucion() {
    if (!clienteId) {
      setError("Selecciona un cliente.")
      return
    }

    const detalles = productos
      .map((producto) => ({
        productoId: producto.id,
        unidades: Number(
          cantidades[producto.id] ?? 0,
        ),
        motivo,
        observaciones:
          observacionDocumento || undefined,
      }))
      .filter((detalle) => detalle.unidades > 0)

    if (detalles.length === 0) {
      setError(
        "Ingresa al menos un SKU con unidades devueltas.",
      )
      return
    }

    const confirmacion = window.confirm(
      `¿Registrar ${resumenIngreso.unidades} unidades devueltas en ${resumenIngreso.skus} SKU? CIBUSPAN ONE atribuirá cada SKU a su semana de origen según vida útil menos 2 días.`,
    )

    if (!confirmacion) return

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      await registrarDevolucionDb({
        fechaDevolucion,
        clienteId,
        bodegaId: bodegaId || null,
        origenRegistro,
        documentoReferencia,
        detalles,
      })

      setMensaje(
        `Devolución registrada correctamente: ${resumenIngreso.unidades} unidades.`,
      )

      limpiarCantidades()
      setDocumentoReferencia("")

      const devolucionesDb =
        await obtenerDevolucionesDb()
      setDevoluciones(devolucionesDb)
    } catch (err) {
      const mensajeErrorGuardado =
        err instanceof Error
          ? err.message
          : "No se pudo registrar la devolución."

      if (
        esErrorDocumentoDuplicado(
          mensajeErrorGuardado,
        )
      ) {
        setError("")
        setMensaje("")
        setError(
          `DOCUMENTO YA REGISTRADO. ${mensajeErrorGuardado} NO SE REGISTRÓ UNA NUEVA DEVOLUCIÓN.`,
        )
      } else {
        setError(mensajeErrorGuardado)
      }
    } finally {
      setGuardando(false)
    }
  }

  const semanaFiltroInicio = useMemo(
    () =>
      fechaSemanaFiltro
        ? inicioSemana(fechaSemanaFiltro)
        : "",
    [fechaSemanaFiltro],
  )

  const devolucionesFiltradas = useMemo(() => {
    const texto = busquedaHistorial
      .trim()
      .toLowerCase()

    return devoluciones.filter((devolucion) => {
      const coincideTexto =
        !texto ||
        devolucion.id
          .toLowerCase()
          .includes(texto) ||
        (devolucion.cliente?.nombre ?? "")
          .toLowerCase()
          .includes(texto) ||
        (devolucion.bodega?.nombre ?? "")
          .toLowerCase()
          .includes(texto) ||
        (devolucion.nombre_local_documento ?? "")
          .toLowerCase()
          .includes(texto) ||
        (devolucion.fuente_documento ?? "")
          .toLowerCase()
          .includes(texto) ||
        (devolucion.documento_referencia ?? "")
          .toLowerCase()
          .includes(texto)

      if (!coincideTexto) return false
      if (!semanaFiltroInicio) return true

      if (tipoSemanaFiltro === "RECEPCION") {
        return (devolucion.detalles ?? []).some(
          (detalle) =>
            detalle.semana_recepcion_inicio ===
            semanaFiltroInicio,
        )
      }

      return (devolucion.detalles ?? []).some(
        (detalle) =>
          detalle.semana_origen_inicio ===
          semanaFiltroInicio,
      )
    })
  }, [
    devoluciones,
    busquedaHistorial,
    semanaFiltroInicio,
    tipoSemanaFiltro,
  ])

  const devolucionSeleccionada =
    devoluciones.find(
      (devolucion) =>
        devolucion.id ===
        devolucionSeleccionadaId,
    ) ?? null

  const unidadesRecibidasSemanaActual = useMemo(() => {
    const semanaActual = inicioSemana(fechaHoy())

    return devoluciones.reduce((total, devolucion) => {
      const unidades = (devolucion.detalles ?? [])
        .filter(
          (detalle) =>
            detalle.semana_recepcion_inicio ===
            semanaActual,
        )
        .reduce(
          (subtotal, detalle) =>
            subtotal + Number(detalle.unidades ?? 0),
          0,
        )

      return total + unidades
    }, 0)
  }, [devoluciones])

  const unidadesTotalesHistoricas = useMemo(
    () =>
      devoluciones.reduce(
        (total, devolucion) =>
          total +
          totalUnidadesDevolucion(devolucion),
        0,
      ),
    [devoluciones],
  )

  if (cargando) {
    return (
      <main className="c1-returns" style={pagina}>
        <style>{devolucionesCss}</style>
        <style>{`
          dialog::backdrop {
            background: rgba(33, 20, 18, 0.66);
          }
        `}</style>
        <h1>Devoluciones</h1>
        <p>Cargando información...</p>
      </main>
    )
  }

  return (
    <main className="c1-returns" style={pagina}>
      <style>{devolucionesCss}</style>


      <header className="returns-header">
        <div>
          <span className="returns-eyebrow">
            CONTROL COMERCIAL
          </span>
          <h1>Devoluciones</h1>
          <p>
            Registro manual o por documento y atribución
            automática a la semana de despacho de origen.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarPantalla}
          disabled={cargando || guardando}
          style={botonSecundario}
        >
          Actualizar
        </button>
      </header>

      {mensaje && (
        <div style={mensajeExito}>{mensaje}</div>
      )}

      <dialog
        ref={errorDialogRef}
        onCancel={(evento) => {
          evento.preventDefault()
          setError("")
        }}
        style={{
          width: "min(460px, calc(100vw - 32px))",
          padding: 0,
          border: 0,
          borderRadius: "16px",
          background: "#ffffff",
          boxShadow:
            "0 24px 70px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div
          style={{
            padding: "26px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
              borderRadius: "50%",
              background: "#8F1D24",
              color: "#ffffff",
              fontSize: "30px",
              fontWeight: 900,
            }}
          >
            !
          </div>

          <h2
            style={{
              margin: "0 0 10px",
              color: "#4f2728",
              fontSize: "22px",
            }}
          >
            Documento ya registrado
          </h2>

          <p
            style={{
              margin: "0 0 12px",
              color: "#5f5551",
              fontSize: "15px",
              lineHeight: 1.55,
              whiteSpace: "pre-line",
            }}
          >
            {error}
          </p>

          <div
            style={{
              margin: "0 0 20px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#fff1f2",
              color: "#8F1D24",
              fontSize: "13px",
              fontWeight: 900,
            }}
          >
            NO SE REGISTRÓ UNA NUEVA DEVOLUCIÓN
          </div>

          <button
            type="button"
            onClick={() => setError("")}
            autoFocus
            style={{
              minWidth: "140px",
              minHeight: "46px",
              padding: "10px 22px",
              border: 0,
              borderRadius: "9px",
              background: "#8F1D24",
              color: "#ffffff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Aceptar
          </button>
        </div>
      </dialog>

      <section className="returns-kpis">
        <TarjetaIndicador
          titulo="Registros"
          valor={devoluciones.length}
          detalle="devoluciones registradas"
        />
        <TarjetaIndicador
          titulo="Recibidas esta semana"
          valor={unidadesRecibidasSemanaActual}
          detalle={etiquetaSemana(
            inicioSemana(fechaHoy()),
          )}
        />
        <TarjetaIndicador
          titulo="Histórico"
          valor={unidadesTotalesHistoricas}
          detalle="unidades devueltas"
        />
        <TarjetaIndicador
          titulo="Regla de retiro"
          valor="2 días"
          detalle="antes de caducidad"
        />
      </section>

      <nav className="returns-tabs">
        <button
          type="button"
          className={
            vista === "INGRESO" ? "activo" : ""
          }
          onClick={() => setVista("INGRESO")}
        >
          Ingreso
        </button>

        <button
          type="button"
          className={
            vista === "IMPORTAR" ? "activo" : ""
          }
          onClick={() => setVista("IMPORTAR")}
        >
          Importación masiva
        </button>

        <button
          type="button"
          className={
            vista === "HISTORIAL" ? "activo" : ""
          }
          onClick={() => setVista("HISTORIAL")}
        >
          Historial
        </button>
      </nav>

      {vista === "INGRESO" ? (
        <>
          <section style={panel} className="returns-panel">
            <div className="returns-panel-title">
              <div>
                <h2>Registrar devolución</h2>
                <p>
                  La semana de origen se calcula por SKU con
                  vida útil − 2 días y se agrupa de lunes a domingo.
                </p>
              </div>

              <div className="returns-source-toggle">
                <button
                  type="button"
                  className={
                    origenRegistro === "MANUAL"
                      ? "activo"
                      : ""
                  }
                  onClick={() => cambiarOrigen("MANUAL")}
                >
                  Manual
                </button>
                <button
                  type="button"
                  className={
                    origenRegistro === "DOCUMENTO"
                      ? "activo"
                      : ""
                  }
                  onClick={() =>
                    cambiarOrigen("DOCUMENTO")
                  }
                >
                  Documento
                </button>
              </div>
            </div>

            <div className="returns-form-grid">
              <div>
                <label>Fecha de devolución</label>
                <input
                  type="date"
                  value={fechaDevolucion}
                  onChange={(evento) =>
                    setFechaDevolucion(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label>Cliente</label>
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
                <label>Bodega / local</label>
                <select
                  value={bodegaId}
                  onChange={(evento) =>
                    setBodegaId(evento.target.value)
                  }
                  disabled={!clienteId}
                  style={campo}
                >
                  <option value="">
                    Sin especificar
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
                <label>Motivo</label>
                <select
                  value={motivo}
                  onChange={(evento) =>
                    setMotivo(evento.target.value)
                  }
                  style={campo}
                >
                  <option value="VENCIMIENTO / RETIRO DE PERCHA">
                    Vencimiento / retiro de percha
                  </option>
                  <option value="CALIDAD">
                    Calidad
                  </option>
                  <option value="EMPAQUE DAÑADO">
                    Empaque dañado
                  </option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
            </div>

            {origenRegistro === "DOCUMENTO" && (
              <div className="returns-document-box">
                <div>
                  <strong>Importar documento</strong>
                  <p>
                    En documentos de Supermaxi, CIBUSPAN ONE
                    identifica automáticamente cliente, fecha,
                    número de devolución, códigos de barras,
                    cantidades y observación. Solo debes revisar
                    y confirmar antes de guardar.
                  </p>
                </div>

                <input
                  ref={archivoRef}
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  onChange={(evento) =>
                    cargarDocumento(
                      evento.target.files?.[0] ?? null,
                    )
                  }
                  disabled={cargandoArchivo}
                />

                {documentoReferencia && (
                  <span className="returns-file-name">
                    {documentoReferencia}
                  </span>
                )}

                {datosDocumento && (
                  <div className="returns-document-summary">
                    <div>
                      <span>Documento</span>
                      <strong>
                        {datosDocumento.numero || "Sin número"}
                      </strong>
                    </div>

                    <div>
                      <span>Fecha</span>
                      <strong>
                        {datosDocumento.fecha
                          ? fechaCorta(datosDocumento.fecha)
                          : "—"}
                      </strong>
                    </div>

                    <div>
                      <span>SKU</span>
                      <strong>{datosDocumento.skus}</strong>
                    </div>

                    <div>
                      <span>Unidades</span>
                      <strong>{datosDocumento.unidades}</strong>
                    </div>

                    {datosDocumento.observacion && (
                      <div className="returns-document-observation">
                        <span>Observación</span>
                        <strong>
                          {datosDocumento.observacion}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {advertenciasDocumento.length > 0 && (
              <div className="returns-warning">
                {advertenciasDocumento.map(
                  (advertencia) => (
                    <div key={advertencia}>
                      {advertencia}
                    </div>
                  ),
                )}
              </div>
            )}

            <div className="returns-rule-note">
              <strong>Regla aplicada:</strong> el cliente retira
              el producto de percha 2 días antes de caducar.
              Por eso la vida efectiva para atribuir devoluciones
              es la vida útil oficial menos 2 días.
            </div>
          </section>

          <section style={panel} className="returns-panel">
            <div className="returns-panel-title">
              <div>
                <h2>Detalle por SKU</h2>
                <p>
                  Ingresa unidades individuales. La semana de
                  origen se calcula automáticamente por producto.
                </p>
              </div>

              <button
                type="button"
                onClick={limpiarCantidades}
                style={botonSecundario}
              >
                Limpiar
              </button>
            </div>

            <div className="returns-search-row">
              <input
                value={busquedaSku}
                onChange={(evento) =>
                  setBusquedaSku(evento.target.value)
                }
                placeholder="Buscar SKU o código"
                style={campo}
              />
            </div>

            {!clienteId ? (
              <div style={estadoVacio}>
                Selecciona un cliente para ver sus SKU.
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div style={estadoVacio}>
                No existen SKU asignados a este cliente.
              </div>
            ) : (
              <div className="returns-products-table">
                <table style={tabla}>
                  <thead>
                    <tr>
                      <th style={encabezado}>SKU</th>
                      <th style={encabezado}>Código</th>
                      <th style={encabezado}>Vida útil</th>
                      <th style={encabezado}>Vida efectiva</th>
                      <th style={encabezado}>Desfase</th>
                      <th style={encabezado}>Semana atribuida</th>
                      <th style={encabezado}>Unidades</th>
                    </tr>
                  </thead>

                  <tbody>
                    {productosFiltrados.map(
                      (producto) => {
                        const semanaOrigen =
                          semanaOrigenCalculada(
                            fechaDevolucion,
                            producto.vida_util_dias,
                          )

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
                              {producto.vida_util_dias} días
                            </td>
                            <td style={celda}>
                              {vidaEfectiva(
                                producto.vida_util_dias,
                              )} días
                            </td>
                            <td style={celda}>
                              {desfaseSemanas(
                                producto.vida_util_dias,
                              )} sem.
                            </td>
                            <td style={celda}>
                              <strong>
                                {etiquetaSemana(
                                  semanaOrigen,
                                )}
                              </strong>
                            </td>
                            <td style={celda}>
                              <input
                                className="returns-qty-input"
                                inputMode="numeric"
                                value={
                                  cantidades[
                                    producto.id
                                  ] ?? ""
                                }
                                onChange={(evento) =>
                                  cambiarCantidad(
                                    producto.id,
                                    evento.target.value,
                                  )
                                }
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        )
                      },
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="returns-entry-summary">
              <div>
                <span>SKU</span>
                <strong>{resumenIngreso.skus}</strong>
              </div>
              <div>
                <span>Unidades</span>
                <strong>{resumenIngreso.unidades}</strong>
              </div>
              <div>
                <span>Semanas de origen</span>
                <strong>
                  {semanasOrigenIngreso.length || 0}
                </strong>
              </div>
            </div>

            {semanasOrigenIngreso.length > 0 && (
              <div className="returns-origin-preview">
                {semanasOrigenIngreso.map((semana) => (
                  <span key={semana}>
                    {etiquetaSemana(semana)}
                  </span>
                ))}
              </div>
            )}

            <div className="returns-actions">
              <button
                type="button"
                onClick={guardarDevolucion}
                disabled={
                  guardando ||
                  resumenIngreso.unidades <= 0
                }
                style={{
                  ...botonPrincipal,
                  opacity:
                    guardando ||
                    resumenIngreso.unidades <= 0
                      ? 0.55
                      : 1,
                }}
              >
                {guardando
                  ? "Guardando..."
                  : "Registrar devolución"}
              </button>
            </div>
          </section>
        </>
      ) : vista === "IMPORTAR" ? (
        <ImportacionMasivaDevoluciones
          onCompletado={cargarPantalla}
        />
      ) : (
        <section style={panel} className="returns-panel">
          <div className="returns-panel-title">
            <div>
              <h2>Historial</h2>
              <p>
                Consulta por semana recibida o por la semana de
                despacho a la que fue atribuida la devolución.
              </p>
            </div>
            <span className="returns-counter">
              {devolucionesFiltradas.length}
            </span>
          </div>

          <div className="returns-history-filters">
            <div>
              <label>Buscar</label>
              <input
                value={busquedaHistorial}
                onChange={(evento) =>
                  setBusquedaHistorial(
                    evento.target.value,
                  )
                }
                placeholder="Cliente, local o documento"
                style={campo}
              />
            </div>

            <div>
              <label>Tipo de semana</label>
              <select
                value={tipoSemanaFiltro}
                onChange={(evento) =>
                  setTipoSemanaFiltro(
                    evento.target
                      .value as TipoSemanaFiltro,
                  )
                }
                style={campo}
              >
                <option value="ORIGEN">
                  Semana atribuida
                </option>
                <option value="RECEPCION">
                  Semana recibida
                </option>
              </select>
            </div>

            <div>
              <label>Fecha dentro de la semana</label>
              <input
                type="date"
                value={fechaSemanaFiltro}
                onChange={(evento) =>
                  setFechaSemanaFiltro(
                    evento.target.value,
                  )
                }
                style={campo}
              />
            </div>

            <button
              type="button"
              onClick={() => setFechaSemanaFiltro("")}
              style={botonSecundario}
            >
              Todas
            </button>
          </div>

          {semanaFiltroInicio && (
            <div className="returns-filter-week">
              Mostrando {etiquetaSemana(semanaFiltroInicio)}
            </div>
          )}

          {devolucionesFiltradas.length === 0 ? (
            <div style={estadoVacio}>
              No existen devoluciones con estos filtros.
            </div>
          ) : (
            <div className="returns-history-layout">
              <div className="returns-history-list">
                {devolucionesFiltradas.map(
                  (devolucion) => {
                    const seleccionada =
                      devolucion.id ===
                      devolucionSeleccionadaId

                    const semanasOrigen = Array.from(
                      new Set(
                        (devolucion.detalles ?? []).map(
                          (detalle) =>
                            detalle.semana_origen_inicio,
                        ),
                      ),
                    ).sort()

                    return (
                      <button
                        key={devolucion.id}
                        type="button"
                        className={`returns-history-card ${
                          seleccionada ? "seleccionada" : ""
                        }`}
                        onClick={() =>
                          setDevolucionSeleccionadaId(
                            devolucion.id,
                          )
                        }
                      >
                        <div className="returns-history-card-top">
                          <strong>
                            {devolucion.cliente?.nombre ??
                              "Cliente"}
                          </strong>
                          <span>
                            {totalUnidadesDevolucion(
                              devolucion,
                            )}{" "}
                            ud.
                            {devolucion.valor_total_documento !== null &&
                              ` · ${moneda(Number(devolucion.valor_total_documento))}`}
                          </span>
                        </div>

                        <div className="returns-history-meta">
                          <span>
                            {fechaCorta(
                              devolucion.fecha_devolucion,
                            )}
                          </span>
                          <span>
                            {devolucion.nombre_local_documento ??
                              devolucion.bodega?.nombre ??
                              "Sin local"}
                          </span>
                          <span>
                            {devolucion.fuente_documento ??
                              devolucion.origen_registro}
                          </span>
                        </div>

                        <small>
                          Origen: {semanasOrigen
                            .map((semana) =>
                              etiquetaSemana(semana),
                            )
                            .join(" · ")}
                        </small>
                      </button>
                    )
                  },
                )}
              </div>

              <div className="returns-history-detail">
                {!devolucionSeleccionada ? (
                  <div style={estadoVacio}>
                    Selecciona una devolución para ver su detalle.
                  </div>
                ) : (
                  <>
                    <div className="returns-detail-header">
                      <div>
                        <h3>
                          {devolucionSeleccionada.cliente
                            ?.nombre ?? "Devolución"}
                        </h3>
                        <p>
                          {fechaCorta(
                            devolucionSeleccionada.fecha_devolucion,
                          )}{" "}
                          · {devolucionSeleccionada.bodega
                            ?.nombre ??
                            devolucionSeleccionada.nombre_local_documento ??
                            "Sin local especificado"}
                        </p>
                      </div>

                      <span className="returns-source-badge">
                        {
                          devolucionSeleccionada.fuente_documento ??
                          devolucionSeleccionada.origen_registro
                        }
                      </span>
                    </div>

                    {devolucionSeleccionada.documento_referencia && (
                      <div className="returns-document-ref">
                        Documento: {
                          devolucionSeleccionada.documento_referencia
                        }
                      </div>
                    )}

                    {devolucionSeleccionada.valor_total_documento !== null && (
                      <div className="returns-document-ref">
                        Valor de la devolución: {moneda(Number(
                          devolucionSeleccionada.valor_total_documento,
                        ))}
                        {devolucionSeleccionada.estado_documento &&
                          ` · Estado: ${devolucionSeleccionada.estado_documento}`}
                      </div>
                    )}

                    <div className="returns-detail-table">
                      <table style={tabla}>
                        <thead>
                          <tr>
                            <th style={encabezado}>SKU</th>
                            <th style={encabezado}>Unidades</th>
                            <th style={encabezado}>Precio documento</th>
                            <th style={encabezado}>Valor devuelto</th>
                            <th style={encabezado}>Vida útil</th>
                            <th style={encabezado}>Retiro</th>
                            <th style={encabezado}>Vida efectiva</th>
                            <th style={encabezado}>Desfase</th>
                            <th style={encabezado}>Semana recibida</th>
                            <th style={encabezado}>Semana atribuida</th>
                            <th style={encabezado}>Motivo</th>
                          </tr>
                        </thead>

                        <tbody>
                          {devolucionSeleccionada.detalles.map(
                            (detalle) => (
                              <tr key={detalle.id}>
                                <td style={celda}>
                                  <strong>
                                    {detalle.producto?.corto ??
                                      "Producto"}
                                  </strong>
                                  <br />
                                  <small>
                                    {detalle.producto?.codigo ??
                                      ""}
                                  </small>
                                </td>
                                <td style={celda}>
                                  <strong>
                                    {detalle.unidades}
                                  </strong>
                                </td>
                                <td style={celda}>
                                  {detalle.precio_unitario_documento === null
                                    ? "—"
                                    : moneda(Number(detalle.precio_unitario_documento))}
                                </td>
                                <td style={celda}>
                                  {detalle.valor_total_documento === null
                                    ? "—"
                                    : <strong>{moneda(Number(detalle.valor_total_documento))}</strong>}
                                </td>
                                <td style={celda}>
                                  {
                                    detalle.vida_util_dias_snapshot
                                  }{" "}
                                  días
                                </td>
                                <td style={celda}>
                                  {
                                    detalle.dias_retiro_antes_caducidad
                                  }{" "}
                                  días antes
                                </td>
                                <td style={celda}>
                                  {detalle.vida_efectiva_dias}{" "}
                                  días
                                </td>
                                <td style={celda}>
                                  {detalle.desfase_semanas}{" "}
                                  sem.
                                </td>
                                <td style={celda}>
                                  {etiquetaSemana(
                                    detalle.semana_recepcion_inicio,
                                  )}
                                </td>
                                <td style={celda}>
                                  <strong>
                                    {etiquetaSemana(
                                      detalle.semana_origen_inicio,
                                    )}
                                  </strong>
                                </td>
                                <td style={celda}>
                                  {detalle.motivo}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function TarjetaIndicador({
  titulo,
  valor,
  detalle,
}: {
  titulo: string
  valor: string | number
  detalle: string
}) {
  return (
    <article className="returns-kpi-card">
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small>{detalle}</small>
    </article>
  )
}

const pagina = {
  width: "100%",
  maxWidth: "none",
  boxSizing: "border-box" as const,
  padding: "20px 24px",
  margin: 0,
  color: "#2f2927",
}

const panel = {
  width: "100%",
  boxSizing: "border-box" as const,
  marginBottom: "18px",
  padding: "20px",
  border: "1px solid #eadfd9",
  borderRadius: "14px",
  background: "white",
  boxShadow: "0 5px 18px rgba(72,42,32,.045)",
}

const campo = {
  width: "100%",
  minHeight: "42px",
  boxSizing: "border-box" as const,
  marginTop: "6px",
  padding: "9px 10px",
  border: "1px solid #d8ccc6",
  borderRadius: "8px",
  background: "white",
}

const botonPrincipal = {
  minHeight: "42px",
  padding: "10px 17px",
  border: "none",
  borderRadius: "8px",
  background: "#8F1D24",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
}

const botonSecundario = {
  minHeight: "40px",
  padding: "9px 14px",
  border: "1px solid #8F1D24",
  borderRadius: "8px",
  background: "white",
  color: "#8F1D24",
  fontWeight: 800,
  cursor: "pointer",
}

const mensajeExito = {
  marginBottom: "14px",
  padding: "11px 13px",
  border: "1px solid #bbf7d0",
  borderRadius: "10px",
  background: "#f0fdf4",
  color: "#166534",
  fontSize: "12px",
  fontWeight: 700,
}


const estadoVacio = {
  padding: "18px",
  border: "1px dashed #ddcec7",
  borderRadius: "10px",
  background: "#fffdfb",
  color: "#7a6d67",
  textAlign: "center" as const,
  fontSize: "12px",
}

const tabla = {
  width: "100%",
  minWidth: "880px",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "10px",
  textAlign: "left" as const,
  borderBottom: "2px solid #e5d9d2",
  color: "#6d5d57",
  fontSize: "10px",
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #eee6e2",
  whiteSpace: "nowrap" as const,
  fontSize: "12px",
}

const devolucionesCss = `
  .c1-returns {
    --vino: #8F1D24;
    --vino-oscuro: #68151A;
    --naranja: #F7931E;
    --crema: #F8F5F1;
    width: 100% !important;
    max-width: none !important;
    box-sizing: border-box !important;
  }

  .c1-returns .returns-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 16px;
  }

  .c1-returns .returns-eyebrow {
    display: inline-block;
    margin-bottom: 4px;
    color: var(--naranja);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .7px;
  }

  .c1-returns .returns-header h1 {
    margin: 0;
    color: #4f2728;
    font-size: 30px;
  }

  .c1-returns .returns-header p,
  .c1-returns .returns-panel-title p {
    margin: 5px 0 0;
    color: #766762;
    font-size: 12px;
    line-height: 1.45;
  }

  .c1-returns .returns-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 10px;
    margin-bottom: 14px;
  }

  .c1-returns .returns-kpi-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    padding: 14px;
    border: 1px solid #eadfd9;
    border-radius: 12px;
    background: white;
    box-shadow: 0 4px 14px rgba(72,42,32,.04);
  }

  .c1-returns .returns-kpi-card > span {
    color: #7a6d67;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .c1-returns .returns-kpi-card strong {
    color: var(--vino);
    font-size: 25px;
  }

  .c1-returns .returns-kpi-card small {
    color: #8a7b75;
    font-size: 10px;
  }

  .c1-returns .returns-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: min(360px,100%);
    gap: 5px;
    margin-bottom: 14px;
    padding: 4px;
    border: 1px solid #e5d6cf;
    border-radius: 11px;
    background: white;
  }

  .c1-returns .returns-tabs button,
  .c1-returns .returns-source-toggle button {
    min-height: 38px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #6f625c;
    font-weight: 800;
    cursor: pointer;
  }

  .c1-returns .returns-tabs button.activo,
  .c1-returns .returns-source-toggle button.activo {
    background: var(--vino);
    color: white;
  }

  .c1-returns .returns-panel-title {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 14px;
  }

  .c1-returns .returns-panel-title h2 {
    margin: 0;
    color: #4f2728;
    font-size: 18px;
  }

  .c1-returns .returns-source-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-width: 220px;
    gap: 4px;
    padding: 4px;
    border: 1px solid #e5d6cf;
    border-radius: 10px;
    background: #fffdfb;
  }

  .c1-returns .returns-form-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 10px;
  }

  .c1-returns label {
    display: block;
    color: #7a6d67;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .3px;
  }

  .c1-returns input:focus,
  .c1-returns select:focus {
    outline: none;
    border-color: var(--naranja) !important;
    box-shadow: 0 0 0 3px rgba(247,147,30,.13);
  }

  .c1-returns .returns-document-box {
    display: grid;
    grid-template-columns: minmax(0,1fr) minmax(220px,360px);
    gap: 14px;
    align-items: center;
    margin-top: 14px;
    padding: 13px;
    border: 1px solid #eadfd9;
    border-radius: 11px;
    background: #fffaf6;
  }

  .c1-returns .returns-document-box p {
    margin: 4px 0 0;
    color: #7a6d67;
    font-size: 11px;
  }

  .c1-returns .returns-file-name {
    grid-column: 1 / -1;
    color: var(--vino);
    font-size: 11px;
    font-weight: 800;
  }

  .c1-returns .returns-document-summary {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
    margin-top: 5px;
    padding-top: 10px;
    border-top: 1px solid #eadfd9;
  }

  .c1-returns .returns-document-summary > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .c1-returns .returns-document-summary span {
    color: #8e7c75;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .35px;
  }

  .c1-returns .returns-document-summary strong {
    color: #4f2728;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .c1-returns .returns-document-summary .returns-document-observation {
    grid-column: 1 / -1;
  }

  .c1-returns .returns-warning {
    margin-top: 10px;
    padding: 10px 12px;
    border: 1px solid #fed7aa;
    border-radius: 9px;
    background: #fff7ed;
    color: #9a3412;
    font-size: 11px;
  }

  .c1-returns .returns-rule-note {
    margin-top: 12px;
    padding: 10px 12px;
    border-left: 4px solid var(--naranja);
    border-radius: 8px;
    background: #fffaf4;
    color: #655650;
    font-size: 11px;
    line-height: 1.45;
  }

  .c1-returns .returns-search-row {
    width: min(440px,100%);
    margin-bottom: 10px;
  }

  .c1-returns .returns-products-table,
  .c1-returns .returns-detail-table {
    overflow-x: auto;
  }

  .c1-returns .returns-qty-input {
    width: 84px;
    min-height: 38px;
    padding: 7px 8px;
    border: 1px solid #d7cbc5;
    border-radius: 7px;
    text-align: right;
    font-weight: 800;
    color: var(--vino);
  }

  .c1-returns .returns-entry-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .c1-returns .returns-entry-summary > div {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 10px;
    border: 1px solid #eadfd9;
    border-radius: 8px;
    background: #fffdfb;
  }

  .c1-returns .returns-entry-summary span {
    color: #8a7b75;
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 800;
  }

  .c1-returns .returns-entry-summary strong {
    color: var(--vino);
    font-size: 14px;
  }

  .c1-returns .returns-origin-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 9px;
  }

  .c1-returns .returns-origin-preview span,
  .c1-returns .returns-filter-week {
    padding: 6px 8px;
    border-radius: 999px;
    background: #fff3e6;
    color: #9a4c00;
    font-size: 10px;
    font-weight: 800;
  }

  .c1-returns .returns-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
  }

  .c1-returns .returns-history-filters {
    display: grid;
    grid-template-columns: minmax(220px,1.3fr) minmax(170px,.7fr) minmax(180px,.7fr) auto;
    gap: 9px;
    align-items: end;
    margin-bottom: 12px;
  }

  .c1-returns .returns-filter-week {
    display: inline-block;
    margin-bottom: 10px;
  }

  .c1-returns .returns-counter {
    min-width: 38px;
    padding: 6px 9px;
    border-radius: 999px;
    background: #f8eee9;
    color: var(--vino);
    text-align: center;
    font-size: 12px;
    font-weight: 900;
  }

  .c1-returns .returns-history-layout {
    display: grid;
    grid-template-columns: minmax(270px,340px) minmax(0,1fr);
    gap: 12px;
    align-items: start;
  }

  .c1-returns .returns-history-list {
    display: grid;
    gap: 7px;
  }

  .c1-returns .returns-history-card {
    display: block;
    width: 100%;
    padding: 11px;
    border: 1px solid #eadfd9;
    border-radius: 10px;
    background: white;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .c1-returns .returns-history-card.seleccionada {
    border-color: var(--vino);
    box-shadow: 0 0 0 2px rgba(143,29,36,.08);
  }

  .c1-returns .returns-history-card-top {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .c1-returns .returns-history-card-top strong {
    color: #4f2728;
  }

  .c1-returns .returns-history-card-top span {
    color: var(--vino);
    font-weight: 900;
  }

  .c1-returns .returns-history-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 9px;
    margin: 6px 0;
    color: #7a6d67;
    font-size: 10px;
  }

  .c1-returns .returns-history-card small {
    color: #9a6a48;
    line-height: 1.35;
  }

  .c1-returns .returns-history-detail {
    min-width: 0;
    padding: 13px;
    border: 1px solid #eadfd9;
    border-radius: 11px;
    background: #fff;
  }

  .c1-returns .returns-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
  }

  .c1-returns .returns-detail-header h3 {
    margin: 0;
    color: #4f2728;
  }

  .c1-returns .returns-detail-header p {
    margin: 4px 0 0;
    color: #7a6d67;
    font-size: 11px;
  }

  .c1-returns .returns-source-badge {
    padding: 5px 8px;
    border-radius: 999px;
    background: #fff3e6;
    color: #9a4c00;
    font-size: 9px;
    font-weight: 900;
  }

  .c1-returns .returns-document-ref {
    margin-bottom: 9px;
    color: #776861;
    font-size: 11px;
  }

  @media (max-width: 1050px) {
    .c1-returns .returns-kpis {
      grid-template-columns: repeat(2,minmax(0,1fr));
    }

    .c1-returns .returns-form-grid {
      grid-template-columns: repeat(2,minmax(0,1fr));
    }

    .c1-returns .returns-history-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 700px) {
.c1-returns {
      padding: 12px 10px 28px !important;
      overflow-x: hidden;
    }

    .c1-returns .returns-header,
    .c1-returns .returns-panel-title,
    .c1-returns .returns-detail-header {
      display: grid;
      grid-template-columns: 1fr;
      gap: 9px;
    }

    .c1-returns .returns-header h1 {
      font-size: 26px;
    }

    .c1-returns .returns-header > button,
    .c1-returns .returns-panel-title > button {
      width: 100%;
    }

    .c1-returns .returns-kpis {
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: 7px;
    }

    .c1-returns .returns-kpi-card {
      padding: 11px;
    }

    .c1-returns .returns-kpi-card strong {
      font-size: 21px;
    }

    .c1-returns .returns-panel {
      padding: 12px !important;
      margin-bottom: 11px !important;
    }

    .c1-returns .returns-source-toggle {
      width: 100%;
      min-width: 0;
    }

    .c1-returns .returns-document-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    .c1-returns .returns-form-grid,
    .c1-returns .returns-document-box,
    .c1-returns .returns-history-filters {
      grid-template-columns: 1fr !important;
    }

    .c1-returns .returns-history-filters > button {
      width: 100%;
    }

    .c1-returns .returns-document-box input {
      width: 100%;
    }

    .c1-returns .returns-actions {
      position: sticky;
      bottom: calc(70px + env(safe-area-inset-bottom));
      z-index: 5;
      padding-top: 8px;
      background: linear-gradient(to bottom, transparent, white 35%);
    }

    .c1-returns .returns-actions button {
      width: 100%;
      min-height: 46px;
    }

    /* PRODUCTOS COMO TARJETAS */
    .c1-returns .returns-products-table {
      overflow: visible !important;
    }

    .c1-returns .returns-products-table table,
    .c1-returns .returns-products-table tbody,
    .c1-returns .returns-products-table tr,
    .c1-returns .returns-products-table td {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
    }

    .c1-returns .returns-products-table thead {
      display: none !important;
    }

    .c1-returns .returns-products-table tbody {
      display: grid !important;
      gap: 8px;
    }

    .c1-returns .returns-products-table tr {
      padding: 10px;
      border: 1px solid #eee3dd;
      border-radius: 11px;
      background: #fffdfb;
    }

    .c1-returns .returns-products-table td {
      display: grid !important;
      grid-template-columns: 115px minmax(0,1fr) !important;
      gap: 7px;
      align-items: center;
      padding: 4px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
    }

    .c1-returns .returns-products-table td::before {
      color: #8e7c75;
      font-size: 9px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
    }

    .c1-returns .returns-products-table td:nth-child(1)::before { content: "SKU"; }
    .c1-returns .returns-products-table td:nth-child(2)::before { content: "Código"; }
    .c1-returns .returns-products-table td:nth-child(3)::before { content: "Vida útil"; }
    .c1-returns .returns-products-table td:nth-child(4)::before { content: "Vida efectiva"; }
    .c1-returns .returns-products-table td:nth-child(5)::before { content: "Desfase"; }
    .c1-returns .returns-products-table td:nth-child(6)::before { content: "Semana"; }
    .c1-returns .returns-products-table td:nth-child(7)::before { content: "Unidades"; }

    .c1-returns .returns-products-table td:nth-child(1) {
      display: block !important;
      text-align: left !important;
      padding-bottom: 7px !important;
      margin-bottom: 3px;
      border-bottom: 1px solid #f0e6e1 !important;
    }

    .c1-returns .returns-products-table td:nth-child(1)::before {
      display: none;
    }

    .c1-returns .returns-qty-input {
      width: 100%;
      min-height: 42px;
    }

    /* DETALLE HISTORIAL COMO TARJETAS */
    .c1-returns .returns-detail-table {
      overflow: visible !important;
    }

    .c1-returns .returns-detail-table table,
    .c1-returns .returns-detail-table tbody,
    .c1-returns .returns-detail-table tr,
    .c1-returns .returns-detail-table td {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
    }

    .c1-returns .returns-detail-table thead {
      display: none !important;
    }

    .c1-returns .returns-detail-table tbody {
      display: grid !important;
      gap: 8px;
    }

    .c1-returns .returns-detail-table tr {
      padding: 10px;
      border: 1px solid #eee3dd;
      border-radius: 10px;
      background: #fffdfb;
    }

    .c1-returns .returns-detail-table td {
      display: grid !important;
      grid-template-columns: 118px minmax(0,1fr) !important;
      gap: 7px;
      padding: 4px 0 !important;
      border: 0 !important;
      white-space: normal !important;
      text-align: right !important;
      font-size: 11px;
    }

    .c1-returns .returns-detail-table td::before {
      color: #8e7c75;
      font-size: 8px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
    }

    .c1-returns .returns-detail-table td:nth-child(1)::before { content: "SKU"; }
    .c1-returns .returns-detail-table td:nth-child(2)::before { content: "Unidades"; }
    .c1-returns .returns-detail-table td:nth-child(3)::before { content: "Vida útil"; }
    .c1-returns .returns-detail-table td:nth-child(4)::before { content: "Retiro"; }
    .c1-returns .returns-detail-table td:nth-child(5)::before { content: "Vida efectiva"; }
    .c1-returns .returns-detail-table td:nth-child(6)::before { content: "Desfase"; }
    .c1-returns .returns-detail-table td:nth-child(7)::before { content: "Semana recibida"; }
    .c1-returns .returns-detail-table td:nth-child(8)::before { content: "Semana atribuida"; }
    .c1-returns .returns-detail-table td:nth-child(9)::before { content: "Motivo"; }

    .c1-returns .returns-detail-table td:nth-child(1) {
      display: block !important;
      text-align: left !important;
      padding-bottom: 7px !important;
      border-bottom: 1px solid #f0e6e1 !important;
    }

    .c1-returns .returns-detail-table td:nth-child(1)::before {
      display: none;
    }
  }
`
