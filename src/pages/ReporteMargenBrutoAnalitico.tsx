import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { supabase } from "../lib/supabase"

import {
  obtenerDevolucionesDb,
  type DevolucionListadoDb,
} from "../repositories/devolucionRepository"

import {
  obtenerVentasDiariasRangoDb,
  type VentaDiariaDb,
} from "../repositories/ventasRepository"

type MargenMes = {
  periodo: string
  ventas_brutas: number
  devoluciones_ventas: number
  descuentos_ventas: number
  ventas_netas: number
  costo_producto_vendido: number
  desperdicio_devoluciones_producto: number
  ajustes_inventario_costo: number
  costo_ventas_contable: number
  depreciacion_maquinaria: number
  costo_fabricacion_gerencial: number
  margen_bruto: number
  margen_bruto_porcentaje: number | null
}

type Props = {
  margenes: MargenMes[]
}

type Cliente = {
  id: string
  nombre: string
}

type Producto = {
  id: string
  codigo: string
  nombre: string
  corto: string
}

type CostoActual = {
  producto_id: string
  producto_codigo: string
  batch_calculado_kg: number | null
  rendimiento_unidades: number | null
  costo_materiales_unidad: number | null
  items_sin_costo: number
}

type OrdenHistorica = {
  id?: string
  fecha_produccion: string
  producto_id: string | null
  producto_codigo: string | null
  unidades_producidas: number | null
  costo_total: number | null
  tipo_orden: string
  estado_validacion: string | null
}

type Movimiento = {
  key: string
  periodo: string
  clienteKey: string
  cliente: string
  productoKey: string
  codigo: string
  sku: string
  unidadesFacturadas: number
  unidadesDevueltas: number
  ventaFactura: number
  pesoDevolucion: number
}

type FilaConciliada = Movimiento & {
  unidadesNetas: number
  ventaBruta: number
  devoluciones: number
  descuentos: number
  ventasNetas: number
  costoProducto: number
  costoDevoluciones: number
  costoResidual: number
  costoFabricacion: number
  margenBruto: number
  margenPorcentaje: number | null
  fuenteCosto: "HISTORICO" | "ACTUAL" | "UNIDADES"
}

type Dimension = "CLIENTE" | "SKU" | "CLIENTE_SKU"

type AgrupacionGrafico = "MES" | "TRIMESTRE" | "SEMESTRE" | "ANIO"

type MetricaParticipacion = "PRODUCTO" | "DEVOLUCION" | "RESIDUAL"

type MetricaGrafico =
  | "VENTAS_NETAS"
  | "COSTO_PRODUCTO"
  | "COSTO_DEVOLUCIONES"
  | "CIF_AJUSTES"
  | "COSTO_FABRICACION"
  | "MARGEN_BRUTO"
  | "MARGEN_PCT"

type PuntoGrafico = {
  key: string
  orden: number
  etiqueta: string
  ventasNetas: number
  costoProducto: number
  costoDevoluciones: number
  costoResidual: number
  costoFabricacion: number
  margenBruto: number
  margenPct: number | null
}

type FilaResumen = {
  id: string
  principal: string
  secundario: string
  unidadesFacturadas: number
  unidadesDevueltas: number
  unidadesNetas: number
  ventaBruta: number
  devoluciones: number
  descuentos: number
  ventasNetas: number
  costoProducto: number
  costoDevoluciones: number
  costoResidual: number
  costoFabricacion: number
  margenBruto: number
  margenPorcentaje: number | null
}

function normalizar(valor: string | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function claveCliente(nombre: string | null | undefined) {
  const texto = normalizar(nombre)

  if (
    texto.includes("FAVORITA") ||
    texto.includes("SUPERMAXI") ||
    texto.includes("MEGAMAXI")
  ) {
    return "CORPORACION FAVORITA"
  }

  if (
    texto.includes("SANTAMARIA") ||
    texto.includes("SANTA MARIA")
  ) {
    return "MEGA SANTAMARIA"
  }

  if (
    texto.includes("ROSADO") ||
    texto.includes("COMISARIATO")
  ) {
    return "CORPORACION EL ROSADO"
  }

  if (texto.includes("TUTI")) {
    return "TUTI"
  }

  return texto
    .replace(/\bC A\b/g, "")
    .replace(/\bS A\b/g, "")
    .replace(/\bCIA LTDA\b/g, "")
    .replace(/\bLTDA\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function inicioMes(valor: string) {
  return `${valor.slice(0, 7)}-01`
}

function finMes(valor: string) {
  const [anio, mes] = valor.slice(0, 7).split("-").map(Number)
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
}

function periodoDeFecha(valor: string) {
  return `${valor.slice(0, 7)}-01`
}

function mesCorto(periodo: string) {
  const [anio, mes] = periodo.split("-").map(Number)
  return new Intl.DateTimeFormat("es-EC", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
}


function agruparPeriodo(
  periodo: string,
  agrupacion: AgrupacionGrafico,
) {
  const [anio, mes] = periodo.split("-").map(Number)

  if (agrupacion === "MES") {
    return {
      key: periodo,
      orden: anio * 100 + mes,
      etiqueta: mesCorto(periodo),
    }
  }

  if (agrupacion === "TRIMESTRE") {
    const trimestre = Math.ceil(mes / 3)
    return {
      key: `${anio}-T${trimestre}`,
      orden: anio * 10 + trimestre,
      etiqueta: `T${trimestre} ${anio}`,
    }
  }

  if (agrupacion === "SEMESTRE") {
    const semestre = mes <= 6 ? 1 : 2
    return {
      key: `${anio}-S${semestre}`,
      orden: anio * 10 + semestre,
      etiqueta: `S${semestre} ${anio}`,
    }
  }

  return {
    key: String(anio),
    orden: anio,
    etiqueta: String(anio),
  }
}

function moneda(valor: number) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numero(valor: number, decimales = 0) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

function porcentaje(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) return "—"

  return `${valor.toLocaleString("es-EC", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function casiCero(valor: number) {
  return Math.abs(valor) < 0.005
}

async function obtenerOrdenesHistoricasRangoPaginadas(
  fechaDesde: string,
  fechaHasta: string,
) {
  const registros: OrdenHistorica[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("pro_ordenes_historicas")
      .select(
        "id,fecha_produccion,producto_id,producto_codigo,unidades_producidas,costo_total,tipo_orden,estado_validacion",
      )
      .eq("tipo_orden", "SKU")
      .gte("fecha_produccion", fechaDesde)
      .lte("fecha_produccion", fechaHasta)
      .order("id", { ascending: true })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      return {
        data: [] as OrdenHistorica[],
        error,
      }
    }

    const pagina = (data ?? []) as OrdenHistorica[]
    registros.push(...pagina)

    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return {
    data: registros,
    error: null,
  }
}

export default function ReporteMargenBrutoAnalitico({
  margenes,
}: Props) {
  const periodosDisponibles = useMemo(
    () =>
      [...margenes]
        .map((fila) => inicioMes(fila.periodo))
        .sort(),
    [margenes],
  )

  const [desdeMes, setDesdeMes] = useState("")
  const [hastaMes, setHastaMes] = useState("")
  const [desdeAplicado, setDesdeAplicado] = useState("")
  const [hastaAplicado, setHastaAplicado] = useState("")
  const [dimension, setDimension] = useState<Dimension>("CLIENTE")
  const [clienteFiltro, setClienteFiltro] = useState("TODOS")
  const [skuFiltro, setSkuFiltro] = useState("TODOS")
  const [mostrarCalidad, setMostrarCalidad] = useState(false)
  const [agrupacionGrafico, setAgrupacionGrafico] =
    useState<AgrupacionGrafico>("MES")
  const [metricasGrafico, setMetricasGrafico] = useState<MetricaGrafico[]>([
    "VENTAS_NETAS",
    "COSTO_FABRICACION",
    "MARGEN_BRUTO",
  ])
  const [dimensionParticipacion, setDimensionParticipacion] =
    useState<Dimension>("CLIENTE")
  const [metricasParticipacion, setMetricasParticipacion] =
    useState<MetricaParticipacion[]>([
      "PRODUCTO",
      "DEVOLUCION",
      "RESIDUAL",
    ])

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [costosActuales, setCostosActuales] = useState<CostoActual[]>([])
  const [ordenesHistoricas, setOrdenesHistoricas] = useState<OrdenHistorica[]>([])
  const [ventas, setVentas] = useState<VentaDiariaDb[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionListadoDb[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const [avisos, setAvisos] = useState<string[]>([])

  const solicitudRef = useRef(0)

  useEffect(() => {
    if (periodosDisponibles.length === 0 || desdeMes || hastaMes) return

    const desde = periodosDisponibles[0]
    const hasta = periodosDisponibles.at(-1) ?? desde

    setDesdeMes(desde)
    setHastaMes(hasta)
    setDesdeAplicado(desde)
    setHastaAplicado(hasta)
  }, [periodosDisponibles, desdeMes, hastaMes])

  const cargar = useCallback(async () => {
    if (!desdeAplicado || !hastaAplicado) return

    const solicitud = solicitudRef.current + 1
    solicitudRef.current = solicitud
    setCargando(true)
    setError("")
    const advertencias: string[] = []

    const desdeFecha = desdeAplicado
    const hastaFecha = finMes(hastaAplicado)

    try {
      const [
        clientesRes,
        productosRes,
        costosRes,
        ordenesRes,
        ventasDb,
        devolucionesDb,
      ] = await Promise.all([
        supabase
          .from("clientes")
          .select("id,nombre")
          .order("nombre"),

        supabase
          .from("productos")
          .select("id,codigo,nombre,corto")
          .order("corto"),

        supabase
          .from("fm_vw_productos_costo_completo")
          .select(
            "producto_id,producto_codigo,batch_calculado_kg,rendimiento_unidades,costo_materiales_unidad,items_sin_costo",
          ),

        obtenerOrdenesHistoricasRangoPaginadas(
          desdeFecha,
          hastaFecha,
        ),

        obtenerVentasDiariasRangoDb(desdeFecha, hastaFecha),

        obtenerDevolucionesDb(desdeFecha, hastaFecha),
      ])

      if (clientesRes.error) throw clientesRes.error
      if (productosRes.error) throw productosRes.error
      if (costosRes.error) throw costosRes.error

      if (ordenesRes.error) {
        advertencias.push(
          "No se pudieron leer los costos históricos de órdenes; se usará la fórmula/costo actual como peso relativo.",
        )
      }

      if (solicitud !== solicitudRef.current) return

      setClientes((clientesRes.data ?? []) as Cliente[])
      setProductos((productosRes.data ?? []) as Producto[])
      setCostosActuales((costosRes.data ?? []) as CostoActual[])
      setOrdenesHistoricas(
        ordenesRes.error
          ? []
          : ((ordenesRes.data ?? []) as OrdenHistorica[]),
      )
      setVentas(ventasDb)
      setDevoluciones(devolucionesDb)
      setAvisos(advertencias)
    } catch (err) {
      if (solicitud !== solicitudRef.current) return

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el margen bruto analítico.",
      )
    } finally {
      if (solicitud === solicitudRef.current) {
        setCargando(false)
      }
    }
  }, [desdeAplicado, hastaAplicado])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const calculo = useMemo(() => {
    if (!desdeAplicado || !hastaAplicado) {
      return {
        filas: [] as FilaConciliada[],
        resumen: [] as FilaResumen[],
        totalContableVentas: 0,
        totalContableCosto: 0,
        totalAnaliticoVentas: 0,
        totalAnaliticoCosto: 0,
        meses: 0,
        usosHistoricos: 0,
        usosActuales: 0,
        usosUnidades: 0,
      }
    }

    const margenPorMes = new Map(
      margenes
        .filter((fila) => {
          const periodo = inicioMes(fila.periodo)
          return periodo >= desdeAplicado && periodo <= hastaAplicado
        })
        .map((fila) => [inicioMes(fila.periodo), fila]),
    )

    const clientesId = new Map(clientes.map((item) => [item.id, item]))
    const productosId = new Map(productos.map((item) => [item.id, item]))
    const productosCodigo = new Map(
      productos.map((item) => [normalizar(item.codigo), item]),
    )

    const nombresCliente = new Map<string, string>()
    clientes.forEach((item) => {
      const key = claveCliente(item.nombre)
      const actual = nombresCliente.get(key)
      if (!actual || normalizar(item.nombre).includes("CORPORACION")) {
        nombresCliente.set(key, item.nombre)
      }
    })

    const costosId = new Map(
      costosActuales.map((item) => [item.producto_id, item]),
    )
    const costosCodigo = new Map(
      costosActuales.map((item) => [
        normalizar(item.producto_codigo),
        item,
      ]),
    )

    type CostoHistoricoAcum = {
      costo: number
      unidades: number
    }

    const costosHistoricos = new Map<string, CostoHistoricoAcum>()

    ordenesHistoricas.forEach((orden) => {
      if (
        orden.tipo_orden !== "SKU" ||
        normalizar(orden.estado_validacion) === "ANULADA"
      ) {
        return
      }

      const periodo = periodoDeFecha(orden.fecha_produccion)
      const producto =
        (orden.producto_id
          ? productosId.get(orden.producto_id)
          : undefined) ??
        (orden.producto_codigo
          ? productosCodigo.get(normalizar(orden.producto_codigo))
          : undefined)

      const productoKey = normalizar(
        producto?.codigo ?? orden.producto_codigo ?? "",
      )

      if (!productoKey) return

      const key = `${periodo}|${productoKey}`
      const actual = costosHistoricos.get(key) ?? { costo: 0, unidades: 0 }

      actual.costo += Number(orden.costo_total ?? 0)
      actual.unidades += Number(orden.unidades_producidas ?? 0)

      costosHistoricos.set(key, actual)
    })

    const movimientos = new Map<string, Movimiento>()

    const obtenerMovimiento = (
      periodo: string,
      clienteKey: string,
      cliente: string,
      productoKey: string,
      codigo: string,
      sku: string,
    ) => {
      const key = `${periodo}|${clienteKey}|${productoKey}`
      const existente = movimientos.get(key)

      if (existente) return existente

      const nuevo: Movimiento = {
        key,
        periodo,
        clienteKey,
        cliente: nombresCliente.get(clienteKey) ?? cliente,
        productoKey,
        codigo,
        sku,
        unidadesFacturadas: 0,
        unidadesDevueltas: 0,
        ventaFactura: 0,
        pesoDevolucion: 0,
      }

      movimientos.set(key, nuevo)
      return nuevo
    }

    ventas.forEach((venta) => {
      const periodo = periodoDeFecha(venta.fecha_emision)
      if (!margenPorMes.has(periodo)) return

      const clienteCatalogo =
        venta.cliente_id ? clientesId.get(venta.cliente_id) : undefined

      const productoCatalogo =
        (venta.producto_id
          ? productosId.get(venta.producto_id)
          : undefined) ??
        productosCodigo.get(normalizar(venta.sku))

      const clienteKey = claveCliente(
        clienteCatalogo?.nombre ?? venta.cliente_nombre,
      )
      const productoKey = normalizar(
        productoCatalogo?.codigo ?? venta.sku,
      )

      const movimiento = obtenerMovimiento(
        periodo,
        clienteKey,
        clienteCatalogo?.nombre ?? venta.cliente_nombre,
        productoKey,
        productoCatalogo?.codigo ?? venta.sku,
        productoCatalogo?.corto ||
          productoCatalogo?.nombre ||
          venta.producto_nombre ||
          venta.sku,
      )

      movimiento.unidadesFacturadas += Number(venta.cantidad ?? 0)
      movimiento.ventaFactura += Number(venta.total_sin_impuestos ?? 0)
    })

    devoluciones.forEach((devolucion) => {
      const periodo = periodoDeFecha(devolucion.fecha_devolucion)
      if (!margenPorMes.has(periodo)) return

      const clienteKey = claveCliente(devolucion.cliente?.nombre)

      ;(devolucion.detalles ?? []).forEach((detalle) => {
        const productoCatalogo =
          (detalle.producto_id
            ? productosId.get(detalle.producto_id)
            : undefined) ??
          productosCodigo.get(
            normalizar(
              detalle.producto?.codigo ??
                detalle.sku_documento ??
                "",
            ),
          )

        const codigo =
          productoCatalogo?.codigo ??
          detalle.producto?.codigo ??
          detalle.sku_documento ??
          "SIN SKU"

        const productoKey = normalizar(codigo)

        const movimiento = obtenerMovimiento(
          periodo,
          clienteKey,
          devolucion.cliente?.nombre ?? "Sin cliente",
          productoKey,
          codigo,
          productoCatalogo?.corto ||
            detalle.producto?.corto ||
            detalle.producto_nombre_documento ||
            codigo,
        )

        const unidades = Number(detalle.unidades ?? 0)
        const valorDocumento =
          detalle.valor_total_documento == null
            ? 0
            : Number(detalle.valor_total_documento)
        const precioDocumento =
          detalle.precio_unitario_documento == null
            ? 0
            : Number(detalle.precio_unitario_documento)
        const valor =
          valorDocumento !== 0
            ? Math.abs(valorDocumento)
            : precioDocumento !== 0
              ? Math.abs(unidades * precioDocumento)
              : 0

        movimiento.unidadesDevueltas += unidades
        movimiento.pesoDevolucion += valor > 0 ? valor : Math.abs(unidades)
      })
    })

    const porMes = new Map<string, Movimiento[]>()
    movimientos.forEach((movimiento) => {
      const lista = porMes.get(movimiento.periodo) ?? []
      lista.push(movimiento)
      porMes.set(movimiento.periodo, lista)
    })

    const filas: FilaConciliada[] = []
    let usosHistoricos = 0
    let usosActuales = 0
    let usosUnidades = 0

    margenPorMes.forEach((margenMes, periodo) => {
      const movimientosMes = porMes.get(periodo) ?? []

      if (movimientosMes.length === 0) return

      const totalVentaFactura = movimientosMes.reduce(
        (total, fila) => total + Math.max(0, fila.ventaFactura),
        0,
      )

      const totalPesoDevolucion = movimientosMes.reduce(
        (total, fila) => total + Math.max(0, fila.pesoDevolucion),
        0,
      )

      const preliminares = movimientosMes.map((movimiento) => {
        const producto =
          productosCodigo.get(movimiento.productoKey)

        const costoActual =
          (producto ? costosId.get(producto.id) : undefined) ??
          costosCodigo.get(movimiento.productoKey)

        const costoHistorico = costosHistoricos.get(
          `${periodo}|${movimiento.productoKey}`,
        )

        let costoUnitarioPeso = 0
        let fuenteCosto: "HISTORICO" | "ACTUAL" | "UNIDADES" = "UNIDADES"

        if (
          costoHistorico &&
          costoHistorico.unidades > 0 &&
          costoHistorico.costo > 0
        ) {
          costoUnitarioPeso =
            costoHistorico.costo / costoHistorico.unidades
          fuenteCosto = "HISTORICO"
          usosHistoricos += 1
        } else if (
          costoActual?.costo_materiales_unidad != null &&
          Number(costoActual.costo_materiales_unidad) > 0 &&
          Number(costoActual.items_sin_costo ?? 0) === 0
        ) {
          costoUnitarioPeso = Number(costoActual.costo_materiales_unidad)
          fuenteCosto = "ACTUAL"
          usosActuales += 1
        } else {
          usosUnidades += 1
        }

        const rendimiento = Number(costoActual?.rendimiento_unidades ?? 0)
        const kgUnitario =
          rendimiento > 0
            ? Number(costoActual?.batch_calculado_kg ?? 0) / rendimiento
            : 0

        const unidadesNetas =
          movimiento.unidadesFacturadas - movimiento.unidadesDevueltas

        const pesoProducto =
          costoUnitarioPeso > 0
            ? unidadesNetas * costoUnitarioPeso
            : unidadesNetas

        // El desperdicio por devoluciones (.98) debe recaer en quien originó
        // la devolución. Se pondera por costo del SKU; si no existe, por unidades.
        const pesoCostoDevolucion =
          movimiento.unidadesDevueltas > 0
            ? movimiento.unidadesDevueltas *
              (costoUnitarioPeso > 0 ? costoUnitarioPeso : 1)
            : 0

        // CIF general, ajustes y depreciación no se asignan con base negativa.
        // Los registros de solo devolución reciben su costo específico vía .98.
        const unidadesBaseResidual = Math.max(0, unidadesNetas)
        const pesoResidual =
          kgUnitario > 0
            ? unidadesBaseResidual * kgUnitario
            : unidadesBaseResidual

        return {
          movimiento,
          unidadesNetas,
          pesoProducto,
          pesoCostoDevolucion,
          pesoResidual,
          fuenteCosto,
        }
      })

      const totalPesoProducto = preliminares.reduce(
        (total, fila) => total + fila.pesoProducto,
        0,
      )

      const totalPesoCostoDevolucion = preliminares.reduce(
        (total, fila) => total + fila.pesoCostoDevolucion,
        0,
      )

      const totalPesoResidual = preliminares.reduce(
        (total, fila) => total + fila.pesoResidual,
        0,
      )

      const poolProducto = Number(margenMes.costo_producto_vendido ?? 0)
      const poolDevoluciones = Number(
        margenMes.desperdicio_devoluciones_producto ?? 0,
      )

      // Todo el resto del costo gerencial (CIF general, ajustes, depreciación,
      // etc.) se mantiene como pool general. La .98 queda separada.
      const poolResidual =
        Number(margenMes.costo_fabricacion_gerencial ?? 0) -
        poolProducto -
        poolDevoluciones

      preliminares.forEach((preliminar) => {
        const movimiento = preliminar.movimiento

        const participacionVenta =
          totalVentaFactura > 0
            ? Math.max(0, movimiento.ventaFactura) / totalVentaFactura
            : 1 / preliminares.length

        const participacionDevolucion =
          totalPesoDevolucion > 0
            ? Math.max(0, movimiento.pesoDevolucion) / totalPesoDevolucion
            : participacionVenta

        const ventaBruta =
          Number(margenMes.ventas_brutas ?? 0) * participacionVenta

        const devolucionesMes =
          Number(margenMes.devoluciones_ventas ?? 0) *
          participacionDevolucion

        const descuentos =
          Number(margenMes.descuentos_ventas ?? 0) * participacionVenta

        const ventasNetas = ventaBruta - devolucionesMes - descuentos

        const costoProducto =
          !casiCero(totalPesoProducto)
            ? poolProducto *
              (preliminar.pesoProducto / totalPesoProducto)
            : poolProducto * participacionVenta

        const costoDevoluciones =
          !casiCero(totalPesoCostoDevolucion)
            ? poolDevoluciones *
              (preliminar.pesoCostoDevolucion / totalPesoCostoDevolucion)
            : poolDevoluciones * participacionVenta

        const costoResidual =
          !casiCero(totalPesoResidual)
            ? poolResidual *
              (preliminar.pesoResidual / totalPesoResidual)
            : poolResidual * participacionVenta

        const costoFabricacion =
          costoProducto + costoDevoluciones + costoResidual
        const margenBruto = ventasNetas - costoFabricacion

        filas.push({
          ...movimiento,
          unidadesNetas: preliminar.unidadesNetas,
          ventaBruta,
          devoluciones: devolucionesMes,
          descuentos,
          ventasNetas,
          costoProducto,
          costoDevoluciones,
          costoResidual,
          costoFabricacion,
          margenBruto,
          margenPorcentaje:
            ventasNetas !== 0 ? (margenBruto / ventasNetas) * 100 : null,
          fuenteCosto: preliminar.fuenteCosto,
        })
      })
    })

    const filtradas = filas.filter((fila) => {
      if (clienteFiltro !== "TODOS" && fila.clienteKey !== clienteFiltro) {
        return false
      }

      if (skuFiltro !== "TODOS" && fila.productoKey !== skuFiltro) {
        return false
      }

      return true
    })

    const agrupadas = new Map<string, FilaResumen>()

    filtradas.forEach((fila) => {
      let id = ""
      let principal = ""
      let secundario = ""

      if (dimension === "CLIENTE") {
        id = fila.clienteKey
        principal = fila.cliente
        secundario = "Cliente"
      } else if (dimension === "SKU") {
        id = fila.productoKey
        principal = fila.sku
        secundario = fila.codigo
      } else {
        id = `${fila.clienteKey}|${fila.productoKey}`
        principal = fila.cliente
        secundario = `${fila.codigo} · ${fila.sku}`
      }

      const actual =
        agrupadas.get(id) ?? {
          id,
          principal,
          secundario,
          unidadesFacturadas: 0,
          unidadesDevueltas: 0,
          unidadesNetas: 0,
          ventaBruta: 0,
          devoluciones: 0,
          descuentos: 0,
          ventasNetas: 0,
          costoProducto: 0,
          costoDevoluciones: 0,
          costoResidual: 0,
          costoFabricacion: 0,
          margenBruto: 0,
          margenPorcentaje: null,
        }

      actual.unidadesFacturadas += fila.unidadesFacturadas
      actual.unidadesDevueltas += fila.unidadesDevueltas
      actual.unidadesNetas += fila.unidadesNetas
      actual.ventaBruta += fila.ventaBruta
      actual.devoluciones += fila.devoluciones
      actual.descuentos += fila.descuentos
      actual.ventasNetas += fila.ventasNetas
      actual.costoProducto += fila.costoProducto
      actual.costoDevoluciones += fila.costoDevoluciones
      actual.costoResidual += fila.costoResidual
      actual.costoFabricacion += fila.costoFabricacion
      actual.margenBruto += fila.margenBruto
      agrupadas.set(id, actual)
    })

    const resumen = Array.from(agrupadas.values())
      .map((fila) => ({
        ...fila,
        margenPorcentaje:
          fila.ventasNetas !== 0
            ? (fila.margenBruto / fila.ventasNetas) * 100
            : null,
      }))
      .sort((a, b) => b.margenBruto - a.margenBruto)

    const totalContableVentas = Array.from(margenPorMes.values()).reduce(
      (total, fila) => total + Number(fila.ventas_netas ?? 0),
      0,
    )

    const totalContableCosto = Array.from(margenPorMes.values()).reduce(
      (total, fila) => total + Number(fila.costo_fabricacion_gerencial ?? 0),
      0,
    )

    const totalAnaliticoVentas = filas.reduce(
      (total, fila) => total + fila.ventasNetas,
      0,
    )

    const totalAnaliticoCosto = filas.reduce(
      (total, fila) => total + fila.costoFabricacion,
      0,
    )

    return {
      filas,
      resumen,
      totalContableVentas,
      totalContableCosto,
      totalAnaliticoVentas,
      totalAnaliticoCosto,
      meses: margenPorMes.size,
      usosHistoricos,
      usosActuales,
      usosUnidades,
    }
  }, [
    desdeAplicado,
    hastaAplicado,
    margenes,
    clientes,
    productos,
    costosActuales,
    ordenesHistoricas,
    ventas,
    devoluciones,
    clienteFiltro,
    skuFiltro,
    dimension,
  ])

  const opcionesCliente = useMemo(() => {
    const mapa = new Map<string, string>()

    calculo.filas.forEach((fila) => {
      if (!mapa.has(fila.clienteKey)) mapa.set(fila.clienteKey, fila.cliente)
    })

    return Array.from(mapa.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "es"),
    )
  }, [calculo.filas])

  const opcionesSku = useMemo(() => {
    const mapa = new Map<string, string>()

    calculo.filas.forEach((fila) => {
      if (!mapa.has(fila.productoKey)) {
        mapa.set(fila.productoKey, `${fila.codigo} · ${fila.sku}`)
      }
    })

    return Array.from(mapa.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "es"),
    )
  }, [calculo.filas])


  const conteoCalidad = useMemo(() => {
    const historicos = new Set<string>()
    const actuales = new Set<string>()
    const unidades = new Set<string>()

    calculo.filas.forEach((fila) => {
      const id = `${fila.periodo}|${fila.productoKey}`
      if (fila.fuenteCosto === "HISTORICO") historicos.add(id)
      else if (fila.fuenteCosto === "ACTUAL") actuales.add(id)
      else unidades.add(id)
    })

    return {
      historicos: historicos.size,
      actuales: actuales.size,
      unidades: unidades.size,
    }
  }, [calculo.filas])

  const totalesFiltrados = useMemo(
    () =>
      calculo.resumen.reduce(
        (acum, fila) => ({
          ventas: acum.ventas + fila.ventasNetas,
          costo: acum.costo + fila.costoFabricacion,
          margen: acum.margen + fila.margenBruto,
        }),
        { ventas: 0, costo: 0, margen: 0 },
      ),
    [calculo.resumen],
  )

  const metricasDisponibles = useMemo(
    () =>
      [
        {
          codigo: "VENTAS_NETAS" as MetricaGrafico,
          etiqueta: "Ventas netas",
          color: "#2563eb",
          tipo: "DINERO" as const,
        },
        {
          codigo: "COSTO_PRODUCTO" as MetricaGrafico,
          etiqueta: "Costo producto",
          color: "#7c3aed",
          tipo: "DINERO" as const,
        },
        {
          codigo: "COSTO_DEVOLUCIONES" as MetricaGrafico,
          etiqueta: "Costo devolución",
          color: "#f97316",
          tipo: "DINERO" as const,
        },
        {
          codigo: "CIF_AJUSTES" as MetricaGrafico,
          etiqueta: "CIF / ajustes / deprec.",
          color: "#64748b",
          tipo: "DINERO" as const,
        },
        {
          codigo: "COSTO_FABRICACION" as MetricaGrafico,
          etiqueta: "Costo fabricación",
          color: "#b91c1c",
          tipo: "DINERO" as const,
        },
        {
          codigo: "MARGEN_BRUTO" as MetricaGrafico,
          etiqueta: "Margen bruto",
          color: "#16a34a",
          tipo: "DINERO" as const,
        },
        {
          codigo: "MARGEN_PCT" as MetricaGrafico,
          etiqueta: "Margen %",
          color: "#0891b2",
          tipo: "PORCENTAJE" as const,
        },
      ],
    [],
  )

  const datosGrafico = useMemo(() => {
    const mapa = new Map<string, PuntoGrafico>()

    calculo.filas
      .filter((fila) => {
        if (
          clienteFiltro !== "TODOS" &&
          fila.clienteKey !== clienteFiltro
        ) {
          return false
        }

        if (
          skuFiltro !== "TODOS" &&
          fila.productoKey !== skuFiltro
        ) {
          return false
        }

        return true
      })
      .forEach((fila) => {
        const grupo = agruparPeriodo(fila.periodo, agrupacionGrafico)
        const actual =
          mapa.get(grupo.key) ?? {
            key: grupo.key,
            orden: grupo.orden,
            etiqueta: grupo.etiqueta,
            ventasNetas: 0,
            costoProducto: 0,
            costoDevoluciones: 0,
            costoResidual: 0,
            costoFabricacion: 0,
            margenBruto: 0,
            margenPct: null,
          }

        actual.ventasNetas += fila.ventasNetas
        actual.costoProducto += fila.costoProducto
        actual.costoDevoluciones += fila.costoDevoluciones
        actual.costoResidual += fila.costoResidual
        actual.costoFabricacion += fila.costoFabricacion
        actual.margenBruto += fila.margenBruto

        mapa.set(grupo.key, actual)
      })

    return Array.from(mapa.values())
      .map((fila) => ({
        ...fila,
        margenPct:
          fila.ventasNetas !== 0
            ? (fila.margenBruto / fila.ventasNetas) * 100
            : null,
      }))
      .sort((a, b) => a.orden - b.orden)
  }, [
    calculo.filas,
    clienteFiltro,
    skuFiltro,
    agrupacionGrafico,
  ])

  const grafico = useMemo(() => {
    const definiciones = metricasDisponibles.filter((metrica) =>
      metricasGrafico.includes(metrica.codigo),
    )

    const valorMetrica = (
      punto: PuntoGrafico,
      codigo: MetricaGrafico,
    ) => {
      if (codigo === "VENTAS_NETAS") return punto.ventasNetas
      if (codigo === "COSTO_PRODUCTO") return punto.costoProducto
      if (codigo === "COSTO_DEVOLUCIONES") return punto.costoDevoluciones
      if (codigo === "CIF_AJUSTES") return punto.costoResidual
      if (codigo === "COSTO_FABRICACION") return punto.costoFabricacion
      if (codigo === "MARGEN_BRUTO") return punto.margenBruto
      return punto.margenPct ?? 0
    }

    const dinero = definiciones.filter(
      (metrica) => metrica.tipo === "DINERO",
    )
    const porcentajes = definiciones.filter(
      (metrica) => metrica.tipo === "PORCENTAJE",
    )

    const valoresDinero = datosGrafico.flatMap((punto) =>
      dinero.map((metrica) => valorMetrica(punto, metrica.codigo)),
    )
    const valoresPorcentaje = datosGrafico.flatMap((punto) =>
      porcentajes.map((metrica) => valorMetrica(punto, metrica.codigo)),
    )

    let minDinero = Math.min(0, ...valoresDinero)
    let maxDinero = Math.max(0, ...valoresDinero)
    let minPct = Math.min(0, ...valoresPorcentaje)
    let maxPct = Math.max(0, ...valoresPorcentaje)

    if (maxDinero === minDinero) maxDinero = minDinero + 1
    if (maxPct === minPct) maxPct = minPct + 1

    return {
      definiciones,
      dinero,
      porcentajes,
      minDinero,
      maxDinero,
      minPct,
      maxPct,
      valorMetrica,
    }
  }, [datosGrafico, metricasDisponibles, metricasGrafico])

  function alternarMetrica(codigo: MetricaGrafico) {
    setMetricasGrafico((actuales) =>
      actuales.includes(codigo)
        ? actuales.filter((item) => item !== codigo)
        : [...actuales, codigo],
    )
  }


  const participacionCostos = useMemo(() => {
    type FilaParticipacion = {
      id: string
      principal: string
      secundario: string
      producto: number
      devolucion: number
      residual: number
      totalSeleccionado: number
      porcentaje: number
    }

    const agrupadas = new Map<
      string,
      Omit<FilaParticipacion, "totalSeleccionado" | "porcentaje">
    >()

    calculo.filas
      .filter((fila) => {
        if (
          clienteFiltro !== "TODOS" &&
          fila.clienteKey !== clienteFiltro
        ) {
          return false
        }

        if (
          skuFiltro !== "TODOS" &&
          fila.productoKey !== skuFiltro
        ) {
          return false
        }

        return true
      })
      .forEach((fila) => {
        let id = ""
        let principal = ""
        let secundario = ""

        if (dimensionParticipacion === "CLIENTE") {
          id = fila.clienteKey
          principal = fila.cliente
          secundario = "Cliente"
        } else if (dimensionParticipacion === "SKU") {
          id = fila.productoKey
          principal = fila.sku
          secundario = fila.codigo
        } else {
          id = `${fila.clienteKey}|${fila.productoKey}`
          principal = fila.cliente
          secundario = `${fila.codigo} · ${fila.sku}`
        }

        const actual =
          agrupadas.get(id) ?? {
            id,
            principal,
            secundario,
            producto: 0,
            devolucion: 0,
            residual: 0,
          }

        actual.producto += Math.max(0, fila.costoProducto)
        actual.devolucion += Math.max(0, fila.costoDevoluciones)
        actual.residual += Math.max(0, fila.costoResidual)
        agrupadas.set(id, actual)
      })

    const valorSeleccionado = (
      fila: {
        producto: number
        devolucion: number
        residual: number
      },
    ) => {
      let total = 0
      if (metricasParticipacion.includes("PRODUCTO")) {
        total += fila.producto
      }
      if (metricasParticipacion.includes("DEVOLUCION")) {
        total += fila.devolucion
      }
      if (metricasParticipacion.includes("RESIDUAL")) {
        total += fila.residual
      }
      return total
    }

    const base = Array.from(agrupadas.values()).map((fila) => ({
      ...fila,
      totalSeleccionado: valorSeleccionado(fila),
    }))

    const totalGeneral = base.reduce(
      (total, fila) => total + fila.totalSeleccionado,
      0,
    )

    const filas = base
      .filter((fila) => fila.totalSeleccionado > 0)
      .map((fila) => ({
        ...fila,
        porcentaje:
          totalGeneral > 0
            ? (fila.totalSeleccionado / totalGeneral) * 100
            : 0,
      }))
      .sort((a, b) => b.totalSeleccionado - a.totalSeleccionado)

    return {
      totalGeneral,
      filas,
      top: filas.slice(0, 12),
      maximo: Math.max(1, filas[0]?.totalSeleccionado ?? 1),
    }
  }, [
    calculo.filas,
    clienteFiltro,
    skuFiltro,
    dimensionParticipacion,
    metricasParticipacion,
  ])

  function alternarMetricaParticipacion(
    codigo: MetricaParticipacion,
  ) {
    setMetricasParticipacion((actuales) =>
      actuales.includes(codigo)
        ? actuales.filter((item) => item !== codigo)
        : [...actuales, codigo],
    )
  }

  const sinFiltros =
    clienteFiltro === "TODOS" &&
    skuFiltro === "TODOS"

  const diferenciaVentas =
    calculo.totalAnaliticoVentas - calculo.totalContableVentas
  const diferenciaCosto =
    calculo.totalAnaliticoCosto - calculo.totalContableCosto


  const filasCalidad = useMemo(
    () =>
      calculo.filas
        .filter((fila) => fila.fuenteCosto !== "HISTORICO")
        .sort((a, b) => {
          if (a.fuenteCosto !== b.fuenteCosto) {
            return a.fuenteCosto === "UNIDADES" ? -1 : 1
          }
          if (a.periodo !== b.periodo) {
            return a.periodo.localeCompare(b.periodo)
          }
          return a.sku.localeCompare(b.sku, "es")
        }),
    [calculo.filas],
  )

  const resumenCalidad = useMemo(() => {
    const mapa = new Map<
      string,
      {
        id: string
        periodo: string
        codigo: string
        sku: string
        fuenteCosto: "ACTUAL" | "UNIDADES"
        clientes: Set<string>
        unidadesFacturadas: number
        unidadesNetas: number
        costoFabricacion: number
      }
    >()

    filasCalidad.forEach((fila) => {
      const id = `${fila.periodo}|${fila.productoKey}|${fila.fuenteCosto}`
      const actual =
        mapa.get(id) ?? {
          id,
          periodo: fila.periodo,
          codigo: fila.codigo,
          sku: fila.sku,
          fuenteCosto: fila.fuenteCosto as "ACTUAL" | "UNIDADES",
          clientes: new Set<string>(),
          unidadesFacturadas: 0,
          unidadesNetas: 0,
          costoFabricacion: 0,
        }

      actual.clientes.add(fila.cliente)
      actual.unidadesFacturadas += fila.unidadesFacturadas
      actual.unidadesNetas += fila.unidadesNetas
      actual.costoFabricacion += fila.costoFabricacion
      mapa.set(id, actual)
    })

    return Array.from(mapa.values())
  }, [filasCalidad])

  function aplicarPeriodo() {
    if (!desdeMes || !hastaMes) return

    if (desdeMes > hastaMes) {
      setError("El mes inicial no puede ser posterior al mes final.")
      return
    }

    setDesdeAplicado(desdeMes)
    setHastaAplicado(hastaMes)
  }

  return (
    <section style={panel}>
      <div style={cabecera}>
        <div>
          <span style={etiqueta}>DISTRIBUCIÓN GERENCIAL RECONCILIADA</span>
          <h2 style={titulo}>Margen bruto por cliente y SKU</h2>
          <p style={descripcion}>
            El total del negocio sigue siendo el contable. Esta sección solo
            distribuye ese mismo total entre SKU y clientes, sin crear ni
            eliminar costo.
          </p>
        </div>
      </div>

      <div style={filtros}>
        <label style={campo}>
          <span style={label}>Desde mes</span>
          <select
            value={desdeMes}
            onChange={(evento) => setDesdeMes(evento.target.value)}
            style={select}
          >
            {periodosDisponibles.map((periodo) => (
              <option key={periodo} value={periodo}>
                {mesCorto(periodo)}
              </option>
            ))}
          </select>
        </label>

        <label style={campo}>
          <span style={label}>Hasta mes</span>
          <select
            value={hastaMes}
            onChange={(evento) => setHastaMes(evento.target.value)}
            style={select}
          >
            {periodosDisponibles.map((periodo) => (
              <option key={periodo} value={periodo}>
                {mesCorto(periodo)}
              </option>
            ))}
          </select>
        </label>

        <label style={campo}>
          <span style={label}>Cliente</span>
          <select
            value={clienteFiltro}
            onChange={(evento) => setClienteFiltro(evento.target.value)}
            style={select}
          >
            <option value="TODOS">Todos</option>
            {opcionesCliente.map(([key, nombre]) => (
              <option key={key} value={key}>
                {nombre}
              </option>
            ))}
          </select>
        </label>

        <label style={campo}>
          <span style={label}>SKU</span>
          <select
            value={skuFiltro}
            onChange={(evento) => setSkuFiltro(evento.target.value)}
            style={select}
          >
            <option value="TODOS">Todos</option>
            {opcionesSku.map(([key, nombre]) => (
              <option key={key} value={key}>
                {nombre}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={aplicarPeriodo}
          disabled={cargando}
          style={botonAplicar}
        >
          {cargando ? "Calculando..." : "Aplicar"}
        </button>
      </div>

      {error && <div style={errorCaja}>{error}</div>}

      {avisos.map((avisoTexto) => (
        <div key={avisoTexto} style={advertenciaCaja}>
          {avisoTexto}
        </div>
      ))}


      <div style={graficoInteractivo}>
        <div style={graficoCabecera}>
          <div>
            <strong style={graficoTituloPrincipal}>Evolución de costos y margen</strong>
            <span style={graficoSubtitulo}>
              Selecciona varias métricas para ver cómo se relacionan en el tiempo.
            </span>
          </div>

          <div style={agrupacionBotones}>
            {([
              ["MES", "Mes"],
              ["TRIMESTRE", "Trimestre"],
              ["SEMESTRE", "Semestre"],
              ["ANIO", "Año"],
            ] as [AgrupacionGrafico, string][]).map(([codigo, texto]) => (
              <button
                key={codigo}
                type="button"
                onClick={() => setAgrupacionGrafico(codigo)}
                style={{
                  ...botonAgrupacion,
                  ...(agrupacionGrafico === codigo
                    ? botonAgrupacionActivo
                    : {}),
                }}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        <div style={metricasChecks}>
          {metricasDisponibles.map((metrica) => (
            <label key={metrica.codigo} style={metricaCheck}>
              <input
                type="checkbox"
                checked={metricasGrafico.includes(metrica.codigo)}
                onChange={() => alternarMetrica(metrica.codigo)}
              />
              <span
                style={{
                  ...metricaColor,
                  background: metrica.color,
                }}
              />
              <span>{metrica.etiqueta}</span>
            </label>
          ))}
        </div>

        {metricasGrafico.length === 0 ? (
          <div style={sinDatosGrafico}>
            Marca al menos una métrica para graficar.
          </div>
        ) : datosGrafico.length === 0 ? (
          <div style={sinDatosGrafico}>
            No hay datos para los filtros seleccionados.
          </div>
        ) : (
          <div style={svgWrap}>
            {(() => {
              const ancho = 1000
              const alto = 300
              const izquierda = 70
              const derecha = grafico.porcentajes.length > 0 ? 62 : 28
              const arriba = 18
              const abajo = 54
              const anchoPlot = ancho - izquierda - derecha
              const altoPlot = alto - arriba - abajo

              const x = (indice: number) =>
                datosGrafico.length <= 1
                  ? izquierda + anchoPlot / 2
                  : izquierda +
                    (indice / (datosGrafico.length - 1)) * anchoPlot

              const yDinero = (valor: number) =>
                arriba +
                ((grafico.maxDinero - valor) /
                  (grafico.maxDinero - grafico.minDinero)) *
                  altoPlot

              const yPct = (valor: number) =>
                arriba +
                ((grafico.maxPct - valor) /
                  (grafico.maxPct - grafico.minPct)) *
                  altoPlot

              const lineas = 4

              return (
                <svg
                  viewBox={`0 0 ${ancho} ${alto}`}
                  role="img"
                  aria-label="Gráfico interactivo de costos y margen"
                  style={svg}
                >
                  {Array.from({ length: lineas + 1 }).map((_, indice) => {
                    const proporcion = indice / lineas
                    const yy = arriba + proporcion * altoPlot
                    const valorDinero =
                      grafico.maxDinero -
                      proporcion *
                        (grafico.maxDinero - grafico.minDinero)

                    return (
                      <g key={`grid-${indice}`}>
                        <line
                          x1={izquierda}
                          y1={yy}
                          x2={izquierda + anchoPlot}
                          y2={yy}
                          stroke="#334155"
                          strokeWidth="1"
                        />
                        {grafico.dinero.length > 0 && (
                          <text
                            x={izquierda - 10}
                            y={yy + 4}
                            textAnchor="end"
                            fontSize="11"
                            fill="#cbd5e1"
                          >
                            {moneda(valorDinero)}
                          </text>
                        )}
                        {grafico.porcentajes.length > 0 && (
                          <text
                            x={izquierda + anchoPlot + 10}
                            y={yy + 4}
                            textAnchor="start"
                            fontSize="11"
                            fill="#cbd5e1"
                          >
                            {porcentaje(
                              grafico.maxPct -
                                proporcion *
                                  (grafico.maxPct - grafico.minPct),
                            )}
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {grafico.minDinero < 0 &&
                    grafico.maxDinero > 0 &&
                    grafico.dinero.length > 0 && (
                      <line
                        x1={izquierda}
                        y1={yDinero(0)}
                        x2={izquierda + anchoPlot}
                        y2={yDinero(0)}
                        stroke="#64748b"
                        strokeWidth="1.5"
                      />
                    )}

                  {datosGrafico.map((punto, indice) => (
                    <g key={`x-${punto.key}`}>
                      <line
                        x1={x(indice)}
                        y1={arriba + altoPlot}
                        x2={x(indice)}
                        y2={arriba + altoPlot + 5}
                        stroke="#64748b"
                      />
                      <text
                        x={x(indice)}
                        y={arriba + altoPlot + 22}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#cbd5e1"
                      >
                        {punto.etiqueta}
                      </text>
                    </g>
                  ))}

                  {grafico.definiciones.map((metrica) => {
                    const esPct = metrica.tipo === "PORCENTAJE"
                    const puntos = datosGrafico
                      .map((punto, indice) => {
                        const valor = grafico.valorMetrica(
                          punto,
                          metrica.codigo,
                        )
                        return `${x(indice)},${
                          esPct ? yPct(valor) : yDinero(valor)
                        }`
                      })
                      .join(" ")

                    return (
                      <g key={metrica.codigo}>
                        <polyline
                          points={puntos}
                          fill="none"
                          stroke={metrica.color}
                          strokeWidth="3"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          strokeDasharray={esPct ? "8 5" : undefined}
                        />

                        {datosGrafico.map((punto, indice) => {
                          const valor = grafico.valorMetrica(
                            punto,
                            metrica.codigo,
                          )
                          const yy = esPct ? yPct(valor) : yDinero(valor)

                          return (
                            <circle
                              key={`${metrica.codigo}-${punto.key}`}
                              cx={x(indice)}
                              cy={yy}
                              r="4"
                              fill="#0f172a"
                              stroke={metrica.color}
                              strokeWidth="3"
                            >
                              <title>
                                {`${punto.etiqueta} · ${metrica.etiqueta}: ${
                                  esPct
                                    ? porcentaje(valor)
                                    : moneda(valor)
                                }`}
                              </title>
                            </circle>
                          )
                        })}
                      </g>
                    )
                  })}
                </svg>
              )
            })()}
          </div>
        )}

        <div style={notaGrafico}>
          Eje izquierdo: valores en USD. Si seleccionas “Margen %”, se muestra
          con eje derecho y línea discontinua.
        </div>
      </div>


      <div style={graficoParticipacion}>
        <div style={graficoCabecera}>
          <div>
            <strong style={graficoTituloPrincipal}>
              Participación de los costos
            </strong>
            <span style={graficoSubtitulo}>
              Ordenado de mayor a menor. Usa los mismos filtros de período,
              cliente y SKU del gráfico superior.
            </span>
          </div>

          <div style={agrupacionBotones}>
            {([
              ["CLIENTE", "Clientes"],
              ["SKU", "SKU"],
              ["CLIENTE_SKU", "Cliente + SKU"],
            ] as [Dimension, string][]).map(([codigo, texto]) => (
              <button
                key={codigo}
                type="button"
                onClick={() => setDimensionParticipacion(codigo)}
                style={{
                  ...botonAgrupacion,
                  ...(dimensionParticipacion === codigo
                    ? botonAgrupacionActivo
                    : {}),
                }}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        <div style={metricasChecks}>
          {([
            ["PRODUCTO", "Costo producto", "#8b5cf6"],
            ["DEVOLUCION", "Costo devolución", "#f97316"],
            ["RESIDUAL", "CIF / ajustes / deprec.", "#94a3b8"],
          ] as [MetricaParticipacion, string, string][]).map(
            ([codigo, texto, color]) => (
              <label key={codigo} style={metricaCheck}>
                <input
                  type="checkbox"
                  checked={metricasParticipacion.includes(codigo)}
                  onChange={() => alternarMetricaParticipacion(codigo)}
                />
                <span
                  style={{
                    ...metricaColor,
                    background: color,
                  }}
                />
                <span>{texto}</span>
              </label>
            ),
          )}
        </div>

        {metricasParticipacion.length === 0 ? (
          <div style={sinDatosGraficoOscuro}>
            Marca al menos un componente de costo.
          </div>
        ) : participacionCostos.top.length === 0 ? (
          <div style={sinDatosGraficoOscuro}>
            No hay costos para los filtros seleccionados.
          </div>
        ) : (
          <div style={participacionLista}>
            {participacionCostos.top.map((fila, indice) => {
              const anchoTotal =
                (fila.totalSeleccionado / participacionCostos.maximo) * 100

              const seleccionadoProducto =
                metricasParticipacion.includes("PRODUCTO")
                  ? fila.producto
                  : 0
              const seleccionadoDevolucion =
                metricasParticipacion.includes("DEVOLUCION")
                  ? fila.devolucion
                  : 0
              const seleccionadoResidual =
                metricasParticipacion.includes("RESIDUAL")
                  ? fila.residual
                  : 0

              const base = Math.max(
                fila.totalSeleccionado,
                0.000001,
              )
              const pctProducto =
                (seleccionadoProducto / base) * 100
              const pctDevolucion =
                (seleccionadoDevolucion / base) * 100
              const pctResidual =
                (seleccionadoResidual / base) * 100

              return (
                <div key={fila.id} style={participacionFila}>
                  <div style={participacionRanking}>
                    {indice + 1}
                  </div>

                  <div style={participacionEntidad}>
                    <strong style={participacionPrincipal}>
                      {fila.principal}
                    </strong>
                    <span style={participacionSecundario}>
                      {fila.secundario}
                    </span>
                  </div>

                  <div style={participacionBarraArea}>
                    <div style={participacionBarraFondo}>
                      <div
                        style={{
                          ...participacionBarraEscala,
                          width: `${Math.max(1.5, anchoTotal)}%`,
                        }}
                      >
                        {seleccionadoProducto > 0 && (
                          <div
                            title={`Costo producto: ${moneda(
                              seleccionadoProducto,
                            )}`}
                            style={{
                              ...participacionSegmento,
                              width: `${pctProducto}%`,
                              background: "#8b5cf6",
                            }}
                          />
                        )}
                        {seleccionadoDevolucion > 0 && (
                          <div
                            title={`Costo devolución: ${moneda(
                              seleccionadoDevolucion,
                            )}`}
                            style={{
                              ...participacionSegmento,
                              width: `${pctDevolucion}%`,
                              background: "#f97316",
                            }}
                          />
                        )}
                        {seleccionadoResidual > 0 && (
                          <div
                            title={`CIF / ajustes / deprec.: ${moneda(
                              seleccionadoResidual,
                            )}`}
                            style={{
                              ...participacionSegmento,
                              width: `${pctResidual}%`,
                              background: "#94a3b8",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={participacionValor}>
                    <strong>{moneda(fila.totalSeleccionado)}</strong>
                    <span>{porcentaje(fila.porcentaje)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={notaGraficoOscuro}>
          Se muestran los 12 mayores. El porcentaje representa la participación
          sobre el total de los componentes seleccionados.
        </div>
      </div>

      <div style={kpis}>
        <Kpi
          etiqueta={sinFiltros ? "Ventas netas conciliadas" : "Ventas netas filtradas"}
          valor={moneda(
            sinFiltros ? calculo.totalAnaliticoVentas : totalesFiltrados.ventas,
          )}
        />
        <Kpi
          etiqueta={sinFiltros ? "Costo fabricación conciliado" : "Costo fabricación filtrado"}
          valor={moneda(
            sinFiltros ? calculo.totalAnaliticoCosto : totalesFiltrados.costo,
          )}
        />
        <Kpi
          etiqueta="Margen bruto"
          valor={moneda(totalesFiltrados.margen)}
        />
        <Kpi
          etiqueta="Margen bruto %"
          valor={porcentaje(
            totalesFiltrados.ventas !== 0
              ? (totalesFiltrados.margen / totalesFiltrados.ventas) * 100
              : null,
          )}
        />
      </div>

      {sinFiltros && (
        <div style={conciliacion}>
          <span>
            Meses conciliados: <strong>{calculo.meses}</strong>
          </span>
          <span>
            Diferencia ventas:{" "}
            <strong style={{ color: casiCero(diferenciaVentas) ? "#15803d" : "#b91c1c" }}>
              {moneda(diferenciaVentas)}
            </strong>
          </span>
          <span>
            Diferencia costo:{" "}
            <strong style={{ color: casiCero(diferenciaCosto) ? "#15803d" : "#b91c1c" }}>
              {moneda(diferenciaCosto)}
            </strong>
          </span>
          <span>
            Calidad SKU/mes:{" "}
            <strong>
              histórico {conteoCalidad.historicos} · actual {conteoCalidad.actuales} ·
              unidades {conteoCalidad.unidades}
            </strong>
          </span>
          <span>
            Órdenes históricas leídas: <strong>{numero(ordenesHistoricas.length)}</strong>
          </span>
        </div>
      )}


      <div style={calidadCaja}>
        <div style={calidadCabecera}>
          <div>
            <strong style={calidadTitulo}>Calidad de asignación de costo SKU</strong>
            <span style={calidadTexto}>
              Histórico = mejor evidencia disponible. Actual = fórmula vigente usada
              como ponderador. Unidades = último respaldo y requiere revisión.
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMostrarCalidad((actual) => !actual)}
            style={botonCalidad}
          >
            {mostrarCalidad ? "Ocultar detalle" : "Ver calidad de asignación"}
          </button>
        </div>

        {mostrarCalidad && (
          <>
            {resumenCalidad.length === 0 ? (
              <div style={calidadOk}>
                Todos los SKU del período usan costo histórico.
              </div>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ ...tabla, minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th style={th}>Mes</th>
                      <th style={th}>SKU</th>
                      <th style={th}>Fuente</th>
                      <th style={thNumero}>Clientes</th>
                      <th style={thNumero}>Unid. fact.</th>
                      <th style={thNumero}>Unid. netas</th>
                      <th style={thNumero}>Costo asignado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenCalidad.map((fila) => (
                      <tr key={fila.id}>
                        <td style={tdEntidad}>
                          <strong>{mesCorto(fila.periodo)}</strong>
                        </td>
                        <td style={tdEntidad}>
                          <strong>{fila.sku}</strong>
                          <span style={secundario}>{fila.codigo}</span>
                        </td>
                        <td style={tdEntidad}>
                          <span
                            style={{
                              ...fuenteBadge,
                              ...(fila.fuenteCosto === "UNIDADES"
                                ? fuenteBadgeAlerta
                                : fuenteBadgeActual),
                            }}
                          >
                            {fila.fuenteCosto === "UNIDADES"
                              ? "POR UNIDADES ⚠"
                              : "COSTO ACTUAL"}
                          </span>
                        </td>
                        <td style={tdNumero}>{numero(fila.clientes.size)}</td>
                        <td style={tdNumero}>{numero(fila.unidadesFacturadas)}</td>
                        <td style={tdNumero}>{numero(fila.unidadesNetas)}</td>
                        <td style={tdNumero}>{moneda(fila.costoFabricacion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div style={tablaCabeceraCompacta}>
        <div>
          <strong style={seccionTituloTabla}>Detalle analítico</strong>
          <span style={seccionSubtituloTabla}>
            Cambia la dimensión sin alterar el gráfico ni la conciliación.
          </span>
        </div>
      <div style={dimensiones}>
        {([
          ["CLIENTE", "Por cliente"],
          ["SKU", "Por SKU"],
          ["CLIENTE_SKU", "Cliente + SKU"],
        ] as [Dimension, string][]).map(([codigo, texto]) => (
          <button
            key={codigo}
            type="button"
            onClick={() => setDimension(codigo)}
            style={{
              ...botonDimension,
              ...(dimension === codigo ? botonDimensionActivo : {}),
            }}
          >
            {texto}
          </button>
        ))}
      </div>

      </div>

      <div style={tablaWrap}>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Entidad</th>
              <th style={thNumero}>Unid. fact.</th>
              <th style={thNumero}>Unid. dev.</th>
              <th style={thNumero}>Unid. netas</th>
              <th style={thNumero}>Ventas netas</th>
              <th style={thNumero}>Costo producto</th>
              <th style={thNumero}>Costo devolución</th>
              <th style={thNumero}>CIF/ajustes/deprec.</th>
              <th style={thNumero}>Costo fabricación</th>
              <th style={thNumero}>Margen bruto</th>
              <th style={thNumero}>Margen %</th>
            </tr>
          </thead>
          <tbody>
            {calculo.resumen.length === 0 ? (
              <tr>
                <td colSpan={11} style={vacio}>
                  {cargando
                    ? "Calculando distribución..."
                    : "No hay movimientos para los filtros seleccionados."}
                </td>
              </tr>
            ) : (
              calculo.resumen.map((fila) => (
                <tr key={fila.id}>
                  <td style={tdEntidad}>
                    <strong>{fila.principal}</strong>
                    <span style={secundario}>{fila.secundario}</span>
                  </td>
                  <td style={tdNumero}>{numero(fila.unidadesFacturadas)}</td>
                  <td style={tdNumero}>{numero(fila.unidadesDevueltas)}</td>
                  <td style={tdNumero}>{numero(fila.unidadesNetas)}</td>
                  <td style={tdNumero}>
                    <strong>{moneda(fila.ventasNetas)}</strong>
                  </td>
                  <td style={tdNumero}>{moneda(fila.costoProducto)}</td>
                  <td style={tdNumero}>{moneda(fila.costoDevoluciones)}</td>
                  <td style={tdNumero}>{moneda(fila.costoResidual)}</td>
                  <td style={tdNumero}>
                    <strong>{moneda(fila.costoFabricacion)}</strong>
                  </td>
                  <td
                    style={{
                      ...tdNumero,
                      color: fila.margenBruto >= 0 ? "#15803d" : "#b91c1c",
                    }}
                  >
                    <strong>{moneda(fila.margenBruto)}</strong>
                  </td>
                  <td
                    style={{
                      ...tdNumero,
                      color:
                        Number(fila.margenPorcentaje ?? 0) >= 0
                          ? "#15803d"
                          : "#b91c1c",
                    }}
                  >
                    <strong>{porcentaje(fila.margenPorcentaje)}</strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={pie}>
        “Costo producto” distribuye el costo contable 5.2.01.
        “Costo devolución” asigna específicamente el desperdicio de devoluciones
        5.2.03.1.01.98 a los clientes/SKU que generaron las devoluciones.
        “CIF/ajustes/deprec.” distribuye el resto del costo de fabricación
        gerencial. El total del negocio continúa siendo el cierre contable oficial.
      </p>
    </section>
  )
}

function Kpi({
  etiqueta,
  valor,
}: {
  etiqueta: string
  valor: string
}) {
  return (
    <div style={kpi}>
      <span style={kpiEtiqueta}>{etiqueta}</span>
      <strong style={kpiValor}>{valor}</strong>
    </div>
  )
}

const panel = {
  marginTop: 12,
  padding: 16,
  border: "1px solid #dbe3ec",
  borderRadius: 16,
  background: "#ffffff",
} as const

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
} as const

const etiqueta = {
  display: "block",
  marginBottom: 6,
  color: "#c77812",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: ".04em",
} as const

const titulo = {
  margin: 0,
  fontSize: 22,
  color: "#231815",
} as const

const descripcion = {
  margin: "6px 0 0",
  color: "#667085",
  lineHeight: 1.5,
  maxWidth: 960,
} as const

const aviso = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: 12,
  background: "#fff8e6",
  border: "1px solid #efd38c",
  color: "#7a4b00",
  lineHeight: 1.45,
} as const

const filtros = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  alignItems: "end",
  marginTop: 18,
} as const

const campo = {
  display: "grid",
  gap: 6,
} as const

const label = {
  fontSize: 11,
  fontWeight: 800,
  color: "#475467",
  textTransform: "uppercase",
  letterSpacing: ".03em",
} as const

const select = {
  width: "100%",
  minHeight: 40,
  padding: "0 10px",
  border: "1px solid #d0d5dd",
  borderRadius: 10,
  background: "#fff",
  color: "#344054",
} as const

const botonAplicar = {
  minHeight: 40,
  border: 0,
  borderRadius: 10,
  padding: "0 16px",
  background: "#a71f27",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
} as const

const dimensiones = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 18,
} as const

const botonDimension = {
  border: "1px solid #d0d5dd",
  background: "#fff",
  color: "#475467",
  borderRadius: 999,
  padding: "8px 14px",
  fontWeight: 800,
  cursor: "pointer",
} as const

const botonDimensionActivo = {
  background: "#a71f27",
  borderColor: "#a71f27",
  color: "#fff",
} as const

const kpis = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginTop: 18,
} as const

const kpi = {
  padding: 14,
  border: "1px solid #e4e7ec",
  borderRadius: 12,
  background: "#f8fafc",
  display: "grid",
  gap: 8,
} as const

const kpiEtiqueta = {
  fontSize: 11,
  color: "#667085",
  fontWeight: 800,
  textTransform: "uppercase",
} as const

const kpiValor = {
  fontSize: 20,
  color: "#1d2939",
} as const

const conciliacion = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px 18px",
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#344054",
  fontSize: 12,
} as const

const tablaWrap = {
  overflowX: "auto",
  marginTop: 18,
  border: "1px solid #e4e7ec",
  borderRadius: 12,
} as const

const tabla = {
  width: "100%",
  minWidth: 1180,
  borderCollapse: "collapse",
  fontSize: 13,
} as const

const th = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#f8fafc",
  borderBottom: "1px solid #d0d5dd",
  color: "#475467",
  fontSize: 10,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
} as const

const thNumero = {
  ...th,
  textAlign: "right",
} as const

const tdEntidad = {
  padding: "10px 12px",
  borderBottom: "1px solid #eaecf0",
  minWidth: 220,
} as const

const secundario = {
  display: "block",
  marginTop: 2,
  color: "#667085",
  fontSize: 11,
} as const

const tdNumero = {
  padding: "10px 12px",
  borderBottom: "1px solid #eaecf0",
  textAlign: "right",
  whiteSpace: "nowrap",
  color: "#344054",
} as const

const vacio = {
  padding: 24,
  textAlign: "center",
  color: "#667085",
} as const

const errorCaja = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
} as const

const advertenciaCaja = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
} as const



const sinDatosGrafico = {
  padding: "18px 12px",
  textAlign: "center",
  color: "#cbd5e1",
  fontSize: 12,
  borderRadius: 10,
  background: "#111827",
  border: "1px dashed #475569",
  marginTop: 10,
} as const

const graficoInteractivo = {
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #334155",
  background: "#0f172a",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
} as const

const graficoCabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
} as const

const graficoTituloPrincipal = {
  display: "block",
  color: "#f8fafc",
  fontSize: 15,
} as const

const graficoSubtitulo = {
  display: "block",
  marginTop: 3,
  color: "#94a3b8",
  fontSize: 12,
} as const

const agrupacionBotones = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
} as const

const botonAgrupacion = {
  border: "1px solid #475569",
  background: "#1e293b",
  color: "#cbd5e1",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
} as const

const botonAgrupacionActivo = {
  background: "#b4232b",
  borderColor: "#ef4444",
  color: "#ffffff",
} as const

const metricasChecks = {
  display: "flex",
  gap: "7px 14px",
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #334155",
} as const

const metricaCheck = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#e2e8f0",
  fontSize: 11,
  cursor: "pointer",
  userSelect: "none",
} as const

const metricaColor = {
  width: 9,
  height: 9,
  borderRadius: 999,
  display: "inline-block",
  flexShrink: 0,
} as const

const svgWrap = {
  width: "100%",
  marginTop: 8,
  overflowX: "auto",
} as const

const svg = {
  width: "100%",
  minWidth: 680,
  height: "auto",
  display: "block",
} as const

const notaGrafico = {
  marginTop: 2,
  color: "#94a3b8",
  fontSize: 10,
  textAlign: "right",
} as const


const graficoParticipacion = {
  display: "none",
  marginTop: 10,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #334155",
  background: "#0f172a",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
} as const

const sinDatosGraficoOscuro = {
  padding: "18px 12px",
  textAlign: "center",
  color: "#cbd5e1",
  fontSize: 12,
  borderRadius: 10,
  background: "#111827",
  border: "1px dashed #475569",
  marginTop: 10,
} as const

const participacionLista = {
  display: "grid",
  gap: 8,
  marginTop: 12,
} as const

const participacionFila = {
  display: "grid",
  gridTemplateColumns: "28px minmax(150px, 240px) minmax(220px, 1fr) 110px",
  gap: 10,
  alignItems: "center",
  minHeight: 38,
} as const

const participacionRanking = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 900,
  textAlign: "center",
} as const

const participacionEntidad = {
  minWidth: 0,
} as const

const participacionPrincipal = {
  display: "block",
  color: "#f8fafc",
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const

const participacionSecundario = {
  display: "block",
  marginTop: 2,
  color: "#94a3b8",
  fontSize: 9,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const

const participacionBarraArea = {
  minWidth: 0,
} as const

const participacionBarraFondo = {
  width: "100%",
  height: 14,
  borderRadius: 999,
  overflow: "hidden",
  background: "#1e293b",
} as const

const participacionBarraEscala = {
  display: "flex",
  height: "100%",
  borderRadius: 999,
  overflow: "hidden",
} as const

const participacionSegmento = {
  height: "100%",
  minWidth: 1,
} as const

const participacionValor = {
  display: "grid",
  justifyItems: "end",
  gap: 1,
  color: "#f8fafc",
  fontSize: 10,
} as const

const notaGraficoOscuro = {
  marginTop: 8,
  color: "#94a3b8",
  fontSize: 10,
  textAlign: "right",
} as const

const tablaCabeceraCompacta = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "end",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 16,
} as const

const seccionTituloTabla = {
  display: "block",
  color: "#1f2937",
  fontSize: 14,
} as const

const seccionSubtituloTabla = {
  display: "block",
  marginTop: 3,
  color: "#667085",
  fontSize: 11,
} as const

const calidadCaja = {
  marginTop: 14,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #dbe3ec",
  background: "#f8fafc",
} as const

const calidadCabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
} as const

const calidadTitulo = {
  display: "block",
  color: "#344054",
  fontSize: 13,
} as const

const calidadTexto = {
  display: "block",
  marginTop: 4,
  color: "#667085",
  fontSize: 12,
  lineHeight: 1.4,
} as const

const botonCalidad = {
  border: "1px solid #a71f27",
  background: "#fff",
  color: "#a71f27",
  borderRadius: 10,
  padding: "8px 12px",
  fontWeight: 800,
  cursor: "pointer",
} as const

const calidadOk = {
  marginTop: 12,
  padding: 10,
  borderRadius: 10,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  fontSize: 12,
} as const

const fuenteBadge = {
  display: "inline-block",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 900,
  whiteSpace: "nowrap",
} as const

const fuenteBadgeActual = {
  background: "#eff6ff",
  color: "#1d4ed8",
} as const

const fuenteBadgeAlerta = {
  background: "#fff7ed",
  color: "#c2410c",
} as const

const pie = {
  margin: "12px 0 0",
  color: "#667085",
  fontSize: 12,
  lineHeight: 1.45,
} as const
