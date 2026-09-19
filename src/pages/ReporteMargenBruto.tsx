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
  obtenerFacturasDb,
  type FacturaDetalleDb,
} from "../repositories/facturasRepository"

import {
  obtenerNominaMensualAreaDb,
  type NominaMensualAreaDb,
} from "../repositories/nominaRepository"

import {
  obtenerPromocionesDb,
  type PromocionDb,
} from "../repositories/promocionesRepository"

import {
  obtenerVentasDiariasRangoDb,
  type VentaDiariaDb,
} from "../repositories/ventasRepository"

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

type Relacion = {
  cliente_id: string
  producto_id: string
  precio: number | null
}

type CostoProducto = {
  producto_id: string
  producto_codigo: string
  batch_calculado_kg: number | null
  rendimiento_unidades: number | null
  costo_materia_prima_unidad: number | null
  costo_empaque_unidad: number | null
  costo_materiales_unidad: number | null
  items_sin_costo: number
}

type Movimiento = {
  key: string
  clienteKey: string
  cliente: string
  productoKey: string
  codigo: string
  sku: string
  unidades: number
  unidadesDevueltas: number
  ventaBruta: number
  descuentos: number
  devoluciones: number
}

type FilaCalculo = Movimiento & {
  ventasNetas: number
  kgEquivalente: number
  costoMateriaPrima: number | null
  costoEmpaque: number | null
  costoMateriales: number | null
  manoObraDirecta: number
  cif: number
  costoFabricacion: number | null
  margenBruto: number | null
  margenBrutoPorcentaje: number | null
  completo: boolean
}

type Dimension = "CLIENTE" | "SKU"

type FilaResumen = {
  id: string
  nombre: string
  secundario: string
  unidades: number
  ventasNetas: number
  costoMateriaPrima: number | null
  costoEmpaque: number | null
  manoObraDirecta: number
  cif: number
  costoFabricacion: number | null
  margenBruto: number | null
  margenBrutoPorcentaje: number | null
  completo: boolean
}

function fechaIso(fecha = new Date()) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function inicioMes() {
  return `${fechaIso().slice(0, 7)}-01`
}

function sumarDias(valor: string, dias: number) {
  const fecha = new Date(`${valor}T12:00:00`)
  fecha.setDate(fecha.getDate() + dias)
  return fechaIso(fecha)
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
    .replace(/\s+/g, " ")
    .trim()
}

function moneda(valor: number, decimales = 2) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number.isFinite(valor) ? valor : 0)
}

function numero(valor: number, decimales = 0) {
  return new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number.isFinite(valor) ? valor : 0)
}

function porcentaje(valor: number | null) {
  return valor === null || !Number.isFinite(valor)
    ? "—"
    : `${valor.toFixed(1)}%`
}

function porUnidad(
  valor: number | null,
  unidades: number,
) {
  if (valor === null || unidades <= 0) {
    return null
  }
  return valor / unidades
}

export default function ReporteMargenBruto() {
  const [desdeEdicion, setDesdeEdicion] =
    useState(inicioMes())
  const [hastaEdicion, setHastaEdicion] =
    useState(fechaIso())
  const [desde, setDesde] =
    useState(inicioMes())
  const [hasta, setHasta] =
    useState(fechaIso())

  const [clientes, setClientes] =
    useState<Cliente[]>([])
  const [productos, setProductos] =
    useState<Producto[]>([])
  const [relaciones, setRelaciones] =
    useState<Relacion[]>([])
  const [costos, setCostos] =
    useState<CostoProducto[]>([])
  const [ventas, setVentas] =
    useState<VentaDiariaDb[]>([])
  const [devoluciones, setDevoluciones] =
    useState<DevolucionListadoDb[]>([])
  const [facturas, setFacturas] =
    useState<FacturaDetalleDb[]>([])
  const [nomina, setNomina] =
    useState<NominaMensualAreaDb[]>([])
  const [promociones, setPromociones] =
    useState<PromocionDb[]>([])

  const [clienteFiltro, setClienteFiltro] =
    useState("TODOS")
  const [skuFiltro, setSkuFiltro] =
    useState("TODOS")
  const [dimension, setDimension] =
    useState<Dimension>("CLIENTE")

  const [cargando, setCargando] =
    useState(true)
  const [error, setError] = useState("")
  const [avisos, setAvisos] =
    useState<string[]>([])

  const solicitudRef = useRef(0)

  const cargar = useCallback(async () => {
    const solicitud =
      solicitudRef.current + 1
    solicitudRef.current = solicitud

    setCargando(true)
    setError("")

    const advertencias: string[] = []

    const opcional = async <T,>(
      promesa: Promise<T>,
      respaldo: T,
      nombre: string,
    ) => {
      try {
        return await promesa
      } catch {
        advertencias.push(nombre)
        return respaldo
      }
    }

    try {
      const [
        clientesRes,
        productosRes,
        relacionesRes,
        costosRes,
        ventasDb,
        devolucionesDb,
        facturasDb,
        nominaDb,
        promocionesDb,
      ] = await Promise.all([
        supabase
          .from("clientes")
          .select("id,nombre")
          .eq("activo", true)
          .order("nombre"),

        supabase
          .from("productos")
          .select("id,codigo,nombre,corto")
          .eq("activo", true)
          .order("corto"),

        supabase
          .from("cliente_productos")
          .select(
            "cliente_id,producto_id,precio",
          )
          .eq("activo", true),

        supabase
          .from(
            "fm_vw_productos_costo_completo",
          )
          .select(
            "producto_id,producto_codigo,batch_calculado_kg,rendimiento_unidades,costo_materia_prima_unidad,costo_empaque_unidad,costo_materiales_unidad,items_sin_costo",
          ),

        obtenerVentasDiariasRangoDb(
          desde,
          hasta,
        ),

        obtenerDevolucionesDb(
          desde,
          sumarDias(hasta, 60),
        ),

        opcional(
          obtenerFacturasDb(),
          [],
          "facturas de costos",
        ),

        opcional(
          obtenerNominaMensualAreaDb(),
          [],
          "nómina",
        ),

        opcional(
          obtenerPromocionesDb(),
          [],
          "descuentos y promociones",
        ),
      ])

      if (clientesRes.error) {
        throw clientesRes.error
      }

      if (productosRes.error) {
        throw productosRes.error
      }

      if (relacionesRes.error) {
        throw relacionesRes.error
      }

      if (costosRes.error) {
        throw costosRes.error
      }

      if (
        solicitud !==
        solicitudRef.current
      ) {
        return
      }

      setClientes(
        (clientesRes.data ?? []) as Cliente[],
      )
      setProductos(
        (productosRes.data ?? []) as Producto[],
      )
      setRelaciones(
        (relacionesRes.data ?? []) as Relacion[],
      )
      setCostos(
        (costosRes.data ??
          []) as CostoProducto[],
      )
      setVentas(ventasDb)
      setDevoluciones(devolucionesDb)
      setFacturas(facturasDb)
      setNomina(nominaDb)
      setPromociones(promocionesDb)
      setAvisos(advertencias)
    } catch (err) {
      if (
        solicitud !==
        solicitudRef.current
      ) {
        return
      }

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo calcular el margen bruto.",
      )
    } finally {
      if (
        solicitud ===
        solicitudRef.current
      ) {
        setCargando(false)
      }
    }
  }, [desde, hasta])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const calculo = useMemo(() => {
    const clientesId = new Map(
      clientes.map((item) => [
        item.id,
        item,
      ]),
    )

    const nombresCliente = new Map<
      string,
      string
    >()

    clientes.forEach((item) => {
      const key = claveCliente(item.nombre)
      const actual =
        nombresCliente.get(key)

      if (
        !actual ||
        normalizar(item.nombre).includes(
          "CORPORACION",
        )
      ) {
        nombresCliente.set(
          key,
          item.nombre,
        )
      }
    })

    const productosId = new Map(
      productos.map((item) => [
        item.id,
        item,
      ]),
    )

    const productosCodigo = new Map(
      productos.map((item) => [
        normalizar(item.codigo),
        item,
      ]),
    )

    const clienteKeyPorId = new Map(
      clientes.map((item) => [
        item.id,
        claveCliente(item.nombre),
      ]),
    )

    const productoKeyPorId = new Map(
      productos.map((item) => [
        item.id,
        normalizar(item.codigo),
      ]),
    )

    const precios = new Map<
      string,
      number | null
    >()

    relaciones.forEach((item) => {
      const clienteKey =
        clienteKeyPorId.get(
          item.cliente_id,
        )
      const productoKey =
        productoKeyPorId.get(
          item.producto_id,
        )

      if (
        clienteKey &&
        productoKey
      ) {
        precios.set(
          `${clienteKey}|${productoKey}`,
          item.precio == null
            ? null
            : Number(item.precio),
        )
      }
    })

    const costosId = new Map(
      costos.map((item) => [
        item.producto_id,
        item,
      ]),
    )

    const costosCodigo = new Map(
      costos.map((item) => [
        normalizar(
          item.producto_codigo,
        ),
        item,
      ]),
    )

    const promocionesMapa = new Map<
      string,
      Array<{
        desde: string
        hasta: string
        tipo:
          | "PORCENTAJE"
          | "VALOR_UNIDAD"
        valor: number
      }>
    >()

    promociones
      .filter((item) => item.activo)
      .forEach((promocion) => {
        const clienteKey =
          clienteKeyPorId.get(
            promocion.cliente_id,
          ) ??
          claveCliente(
            promocion.cliente_nombre,
          )

        promocion.productos.forEach(
          (producto) => {
            const productoKey =
              productoKeyPorId.get(
                producto.producto_id,
              ) ??
              normalizar(
                producto.sku,
              )

            const key = `${clienteKey}|${productoKey}`
            const lista =
              promocionesMapa.get(key) ??
              []

            lista.push({
              desde:
                promocion.fecha_inicio,
              hasta:
                promocion.fecha_fin,
              tipo:
                producto.tipo_descuento,
              valor: Number(
                producto.valor_descuento,
              ),
            })

            promocionesMapa.set(
              key,
              lista,
            )
          },
        )
      })

    const movimientos = new Map<
      string,
      Movimiento
    >()

    const obtenerMovimiento = (
      clienteKey: string,
      cliente: string,
      productoKey: string,
      codigo: string,
      sku: string,
    ) => {
      const key = `${clienteKey}|${productoKey}`
      const actual =
        movimientos.get(key)

      if (actual) return actual

      const nuevo: Movimiento = {
        key,
        clienteKey,
        cliente:
          nombresCliente.get(
            clienteKey,
          ) ?? cliente,
        productoKey,
        codigo,
        sku,
        unidades: 0,
        unidadesDevueltas: 0,
        ventaBruta: 0,
        descuentos: 0,
        devoluciones: 0,
      }

      movimientos.set(key, nuevo)
      return nuevo
    }

    ventas.forEach((venta) => {
      const clienteCatalogo =
        venta.cliente_id
          ? clientesId.get(
              venta.cliente_id,
            )
          : null

      const productoCatalogo =
        venta.producto_id
          ? productosId.get(
              venta.producto_id,
            )
          : productosCodigo.get(
              normalizar(venta.sku),
            )

      const clienteKey =
        claveCliente(
          clienteCatalogo?.nombre ??
            venta.cliente_nombre,
        )

      const productoKey =
        normalizar(
          productoCatalogo?.codigo ??
            venta.sku,
        )

      const movimiento =
        obtenerMovimiento(
          clienteKey,
          clienteCatalogo?.nombre ??
            venta.cliente_nombre,
          productoKey,
          productoCatalogo?.codigo ??
            venta.sku,
          productoCatalogo?.corto ||
            productoCatalogo?.nombre ||
            venta.producto_nombre ||
            venta.sku,
        )

      const unidades = Number(
        venta.cantidad ?? 0,
      )
      const valor = Number(
        venta.total_sin_impuestos ?? 0,
      )

      movimiento.unidades += unidades
      movimiento.ventaBruta += valor

      const descuento = (
        promocionesMapa.get(
          movimiento.key,
        ) ?? []
      )
        .filter(
          (item) =>
            venta.fecha_emision >=
              item.desde &&
            venta.fecha_emision <=
              item.hasta,
        )
        .reduce(
          (total, item) =>
            total +
            (item.tipo ===
            "PORCENTAJE"
              ? (valor * item.valor) /
                100
              : unidades *
                item.valor),
          0,
        )

      movimiento.descuentos +=
        Math.min(
          Math.max(0, descuento),
          Math.max(0, valor),
        )
    })

    devoluciones.forEach(
      (devolucion) => {
        const clienteKey =
          claveCliente(
            devolucion.cliente?.nombre,
          )

        ;(
          devolucion.detalles ?? []
        ).forEach((detalle) => {
          const productoCatalogo =
            detalle.producto_id
              ? productosId.get(
                  detalle.producto_id,
                )
              : null

          const codigo =
            productoCatalogo?.codigo ??
            detalle.producto?.codigo ??
            detalle.sku_documento ??
            "SIN SKU"

          const productoKey =
            normalizar(codigo)

          const fechaOrigen =
            Number(
              detalle.vida_efectiva_dias ??
                0,
            ) > 0
              ? sumarDias(
                  devolucion.fecha_devolucion,
                  -Number(
                    detalle.vida_efectiva_dias,
                  ),
                )
              : detalle.semana_origen_inicio

          if (
            fechaOrigen < desde ||
            fechaOrigen > hasta
          ) {
            return
          }

          const movimiento =
            obtenerMovimiento(
              clienteKey,
              devolucion.cliente?.nombre ??
                "Sin cliente",
              productoKey,
              codigo,
              productoCatalogo?.corto ||
                detalle.producto?.corto ||
                detalle.producto_nombre_documento ||
                codigo,
            )

          const unidades = Number(
            detalle.unidades ?? 0,
          )

          const precioDocumento =
            detalle.precio_unitario_documento ==
            null
              ? null
              : Number(
                  detalle.precio_unitario_documento,
                )

          movimiento.unidadesDevueltas +=
            unidades

          movimiento.devoluciones +=
            detalle.valor_total_documento ==
            null
              ? unidades *
                Number(
                  precioDocumento ??
                    precios.get(
                      movimiento.key,
                    ) ??
                    0,
                )
              : Number(
                  detalle.valor_total_documento,
                )
        })
      },
    )

    const filas: FilaCalculo[] =
      Array.from(
        movimientos.values(),
      ).map((movimiento) => {
        const producto =
          productosCodigo.get(
            movimiento.productoKey,
          )

        const costo =
          (producto
            ? costosId.get(producto.id)
            : undefined) ??
          costosCodigo.get(
            movimiento.productoKey,
          )

        const mpUnitario =
          costo
            ?.costo_materia_prima_unidad ==
          null
            ? null
            : Number(
                costo.costo_materia_prima_unidad,
              )

        const empaqueUnitario =
          costo?.costo_empaque_unidad ==
          null
            ? null
            : Number(
                costo.costo_empaque_unidad,
              )

        const materialesUnitario =
          costo
            ?.costo_materiales_unidad ==
          null
            ? null
            : Number(
                costo.costo_materiales_unidad,
              )

        const rendimiento = Number(
          costo?.rendimiento_unidades ?? 0,
        )

        const kgUnitario =
          rendimiento > 0
            ? Number(
                costo?.batch_calculado_kg ??
                  0,
              ) / rendimiento
            : 0

        const completo =
          materialesUnitario !== null &&
          Number(
            costo?.items_sin_costo ?? 0,
          ) === 0

        return {
          ...movimiento,
          ventasNetas:
            movimiento.ventaBruta -
            movimiento.descuentos -
            movimiento.devoluciones,
          kgEquivalente:
            movimiento.unidades *
            kgUnitario,
          costoMateriaPrima:
            mpUnitario === null
              ? null
              : movimiento.unidades *
                mpUnitario,
          costoEmpaque:
            empaqueUnitario === null
              ? null
              : movimiento.unidades *
                empaqueUnitario,
          costoMateriales:
            materialesUnitario === null
              ? null
              : movimiento.unidades *
                materialesUnitario,
          manoObraDirecta: 0,
          cif: 0,
          costoFabricacion: null,
          margenBruto: null,
          margenBrutoPorcentaje: null,
          completo,
        }
      })

    let costosSinAsignar = 0

    const asignarPorKg = (
      monto: number,
      campo:
        | "manoObraDirecta"
        | "cif",
      clienteKey?: string | null,
    ) => {
      if (
        !Number.isFinite(monto) ||
        monto === 0
      ) {
        return
      }

      const candidatas =
        clienteKey
          ? filas.filter(
              (fila) =>
                fila.clienteKey ===
                clienteKey,
            )
          : filas

      let totalBase =
        candidatas.reduce(
          (total, fila) =>
            total +
            Math.max(
              0,
              fila.kgEquivalente,
            ),
          0,
        )

      if (totalBase <= 0) {
        costosSinAsignar += monto
        return
      }

      candidatas.forEach((fila) => {
        fila[campo] +=
          (monto *
            Math.max(
              0,
              fila.kgEquivalente,
            )) /
          totalBase
      })
    }

    const periodoDesde =
      `${desde.slice(0, 7)}-01`
    const periodoHasta =
      `${hasta.slice(0, 7)}-01`

    // MOD y MOI provienen de la nómina ya abierta por área.
    nomina.forEach((fila) => {
      if (
        fila.periodo <
          periodoDesde ||
        fila.periodo >
          periodoHasta
      ) {
        return
      }

      const costo = Number(
        fila.costo_empresa ?? 0,
      )

      if (
        fila.area ===
        "MANO_OBRA_DIRECTA"
      ) {
        asignarPorKg(
          costo,
          "manoObraDirecta",
        )
      }

      if (
        fila.area ===
        "MANO_OBRA_INDIRECTA"
      ) {
        asignarPorKg(
          costo,
          "cif",
        )
      }
    })

    const cuentasPersonal =
      new Set([
        "6.1.01.1.01.01",
        "6.1.01.1.01.04",
        "6.2.01.1.01.05",
        "6.1.01.1.01.06",
        "NOM-MOD",
        "NOM-MOI",
        "NOM-ADM",
        "NOM-VTA",
        "NOM-DIST",
      ])

    // CIF: solamente facturas clasificadas como OPERACION.
    // Se excluyen administración, comercial, transporte,
    // obligaciones, financiamiento y demás estructura.
    facturas.forEach((factura) => {
      const periodoFactura =
        factura.periodo_servicio ??
        (factura.fecha_emision
          ? `${factura.fecha_emision.slice(
              0,
              7,
            )}-01`
          : null)

      if (
        factura.estado === "ANULADA" ||
        !periodoFactura ||
        periodoFactura <
          periodoDesde ||
        periodoFactura >
          periodoHasta ||
        !factura.impacta_ebitda ||
        cuentasPersonal.has(
          factura.cuenta_codigo,
        ) ||
        factura.grupo !== "OPERACION"
      ) {
        return
      }

      const monto = Number(
        factura.subtotal ?? 0,
      )

      const clienteIds =
        factura.afecta_tipo ===
        "CLIENTE"
          ? factura.cliente_ids?.length
            ? factura.cliente_ids
            : factura.cliente_id
              ? [factura.cliente_id]
              : []
          : []

      if (clienteIds.length > 0) {
        const montoPorCliente =
          monto / clienteIds.length

        clienteIds.forEach(
          (clienteId) => {
            const clienteKey =
              clienteKeyPorId.get(
                clienteId,
              ) ?? null

            asignarPorKg(
              montoPorCliente,
              "cif",
              clienteKey,
            )
          },
        )
      } else {
        asignarPorKg(
          monto,
          "cif",
        )
      }
    })

    filas.forEach((fila) => {
      if (
        !fila.completo ||
        fila.costoMateriales === null
      ) {
        return
      }

      fila.costoFabricacion =
        fila.costoMateriales +
        fila.manoObraDirecta +
        fila.cif

      fila.margenBruto =
        fila.ventasNetas -
        fila.costoFabricacion

      fila.margenBrutoPorcentaje =
        fila.ventasNetas > 0
          ? (fila.margenBruto /
              fila.ventasNetas) *
            100
          : null
    })

    return {
      filas,
      costosSinAsignar,
    }
  }, [
    clientes,
    productos,
    relaciones,
    costos,
    ventas,
    devoluciones,
    facturas,
    nomina,
    promociones,
    desde,
    hasta,
  ])

  const opcionesClientes = useMemo(() => {
    const mapa = new Map<
      string,
      {
        key: string
        nombre: string
      }
    >()

    clientes.forEach((cliente) => {
      const key =
        claveCliente(
          cliente.nombre,
        )

      const actual = mapa.get(key)

      if (
        !actual ||
        normalizar(
          cliente.nombre,
        ).includes("CORPORACION")
      ) {
        mapa.set(key, {
          key,
          nombre: cliente.nombre,
        })
      }
    })

    return Array.from(
      mapa.values(),
    ).sort((a, b) =>
      a.nombre.localeCompare(
        b.nombre,
        "es",
      ),
    )
  }, [clientes])

  const opcionesSku = useMemo(() => {
    const clientesIdsSeleccionados =
      new Set(
        clientes
          .filter(
            (cliente) =>
              clienteFiltro ===
                "TODOS" ||
              claveCliente(
                cliente.nombre,
              ) === clienteFiltro,
          )
          .map(
            (cliente) =>
              cliente.id,
          ),
      )

    const productosPermitidos =
      new Set(
        relaciones
          .filter((relacion) =>
            clientesIdsSeleccionados.has(
              relacion.cliente_id,
            ),
          )
          .map(
            (relacion) =>
              relacion.producto_id,
          ),
      )

    return productos
      .filter(
        (producto) =>
          clienteFiltro === "TODOS" ||
          productosPermitidos.size ===
            0 ||
          productosPermitidos.has(
            producto.id,
          ),
      )
      .map((producto) => ({
        key: normalizar(
          producto.codigo,
        ),
        codigo: producto.codigo,
        nombre:
          producto.corto ||
          producto.nombre,
      }))
      .sort((a, b) =>
        a.nombre.localeCompare(
          b.nombre,
          "es",
        ),
      )
  }, [
    clientes,
    productos,
    relaciones,
    clienteFiltro,
  ])

  useEffect(() => {
    if (
      skuFiltro !== "TODOS" &&
      !opcionesSku.some(
        (item) =>
          item.key === skuFiltro,
      )
    ) {
      setSkuFiltro("TODOS")
    }
  }, [opcionesSku, skuFiltro])

  const filasFiltradas = useMemo(
    () =>
      calculo.filas
        .filter(
          (fila) =>
            clienteFiltro ===
              "TODOS" ||
            fila.clienteKey ===
              clienteFiltro,
        )
        .filter(
          (fila) =>
            skuFiltro === "TODOS" ||
            fila.productoKey ===
              skuFiltro,
        ),
    [
      calculo.filas,
      clienteFiltro,
      skuFiltro,
    ],
  )

  const resumen = useMemo<
    FilaResumen[]
  >(() => {
    const mapa = new Map<
      string,
      FilaResumen
    >()

    filasFiltradas.forEach(
      (fila) => {
        const id =
          dimension === "CLIENTE"
            ? fila.clienteKey
            : fila.productoKey

        const nombre =
          dimension === "CLIENTE"
            ? fila.cliente
            : fila.sku

        const secundario =
          dimension === "CLIENTE"
            ? "Cliente"
            : fila.codigo

        const actual =
          mapa.get(id)

        if (actual) {
          actual.unidades +=
            fila.unidades
          actual.ventasNetas +=
            fila.ventasNetas

          if (
            actual.costoMateriaPrima !==
              null &&
            fila.costoMateriaPrima !==
              null
          ) {
            actual.costoMateriaPrima +=
              fila.costoMateriaPrima
          } else {
            actual.costoMateriaPrima =
              null
          }

          if (
            actual.costoEmpaque !==
              null &&
            fila.costoEmpaque !==
              null
          ) {
            actual.costoEmpaque +=
              fila.costoEmpaque
          } else {
            actual.costoEmpaque =
              null
          }

          actual.manoObraDirecta +=
            fila.manoObraDirecta
          actual.cif += fila.cif

          if (
            actual.costoFabricacion !==
              null &&
            fila.costoFabricacion !==
              null
          ) {
            actual.costoFabricacion +=
              fila.costoFabricacion
          } else {
            actual.costoFabricacion =
              null
          }

          if (
            actual.margenBruto !== null &&
            fila.margenBruto !== null
          ) {
            actual.margenBruto +=
              fila.margenBruto
          } else {
            actual.margenBruto =
              null
          }

          actual.completo =
            actual.completo &&
            fila.completo
        } else {
          mapa.set(id, {
            id,
            nombre,
            secundario,
            unidades:
              fila.unidades,
            ventasNetas:
              fila.ventasNetas,
            costoMateriaPrima:
              fila.costoMateriaPrima,
            costoEmpaque:
              fila.costoEmpaque,
            manoObraDirecta:
              fila.manoObraDirecta,
            cif: fila.cif,
            costoFabricacion:
              fila.costoFabricacion,
            margenBruto:
              fila.margenBruto,
            margenBrutoPorcentaje:
              fila.margenBrutoPorcentaje,
            completo:
              fila.completo,
          })
        }
      },
    )

    return Array.from(
      mapa.values(),
    )
      .map((fila) => ({
        ...fila,
        margenBrutoPorcentaje:
          fila.margenBruto !== null &&
          fila.ventasNetas > 0
            ? (fila.margenBruto /
                fila.ventasNetas) *
              100
            : null,
      }))
      .sort(
        (a, b) =>
          (b.margenBruto ?? -Infinity) -
          (a.margenBruto ?? -Infinity),
      )
  }, [filasFiltradas, dimension])

  const totales = useMemo(() => {
    const completos =
      filasFiltradas.filter(
        (fila) => fila.completo,
      )

    const unidades =
      filasFiltradas.reduce(
        (total, fila) =>
          total + fila.unidades,
        0,
      )

    const ventasNetas =
      filasFiltradas.reduce(
        (total, fila) =>
          total +
          fila.ventasNetas,
        0,
      )

    const mp =
      completos.reduce(
        (total, fila) =>
          total +
          Number(
            fila.costoMateriaPrima ??
              0,
          ),
        0,
      )

    const empaque =
      completos.reduce(
        (total, fila) =>
          total +
          Number(
            fila.costoEmpaque ?? 0,
          ),
        0,
      )

    const mod =
      completos.reduce(
        (total, fila) =>
          total +
          fila.manoObraDirecta,
        0,
      )

    const cif =
      completos.reduce(
        (total, fila) =>
          total + fila.cif,
        0,
      )

    const costoFabricacion =
      completos.reduce(
        (total, fila) =>
          total +
          Number(
            fila.costoFabricacion ??
              0,
          ),
        0,
      )

    const margenBruto =
      completos.reduce(
        (total, fila) =>
          total +
          Number(
            fila.margenBruto ?? 0,
          ),
        0,
      )

    return {
      unidades,
      ventasNetas,
      mp,
      empaque,
      mod,
      cif,
      costoFabricacion,
      margenBruto,
      margenBrutoPorcentaje:
        ventasNetas > 0
          ? (margenBruto /
              ventasNetas) *
            100
          : null,
      completos: completos.length,
      incompletos:
        filasFiltradas.length -
        completos.length,
    }
  }, [filasFiltradas])

  function aplicarPeriodo() {
    if (
      !desdeEdicion ||
      !hastaEdicion ||
      desdeEdicion > hastaEdicion
    ) {
      setError(
        "El rango de fechas no es válido.",
      )
      return
    }

    setDesde(desdeEdicion)
    setHasta(hastaEdicion)
  }

  function exportarCsv() {
    const encabezados = [
      dimension === "CLIENTE"
        ? "Cliente"
        : "SKU",
      "Código / tipo",
      "Unidades",
      "Ventas netas",
      "Materia prima",
      "Empaque directo",
      "MOD",
      "CIF",
      "Costo fabricación",
      "Margen bruto",
      "Margen bruto %",
    ]

    const filas = resumen.map(
      (fila) => [
        fila.nombre,
        fila.secundario,
        fila.unidades,
        fila.ventasNetas,
        fila.costoMateriaPrima,
        fila.costoEmpaque,
        fila.manoObraDirecta,
        fila.cif,
        fila.costoFabricacion,
        fila.margenBruto,
        fila.margenBrutoPorcentaje,
      ],
    )

    const contenido = [
      encabezados,
      ...filas,
    ]
      .map((fila) =>
        fila
          .map(
            (valor) =>
              `"${String(
                valor ?? "",
              ).replaceAll(
                '"',
                '""',
              )}"`,
          )
          .join(","),
      )
      .join("\n")

    const archivo = new Blob(
      [`\uFEFF${contenido}`],
      {
        type: "text/csv;charset=utf-8",
      },
    )

    const url =
      URL.createObjectURL(archivo)
    const enlace =
      document.createElement("a")

    enlace.href = url
    enlace.download =
      `margen-bruto-${dimension.toLowerCase()}-${desde}-${hasta}.csv`

    enlace.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="gross-report">
      <style>{css}</style>

      <header className="gross-header">
        <div>
          <span>
            COMERCIAL · MARGEN BRUTO
          </span>
          <h1>
            Margen bruto de fabricación
          </h1>
          <p>
            Primera capa de rentabilidad:
            únicamente costos de fabricar
            el producto. Sin transporte,
            administración, comercial,
            financiamiento ni estructura.
          </p>
        </div>

        <button
          type="button"
          onClick={exportarCsv}
          disabled={
            resumen.length === 0
          }
        >
          Exportar CSV
        </button>
      </header>

      <section className="gross-formula">
        <strong>
          Ventas netas − MP − Empaque − MOD − CIF = Margen bruto
        </strong>
        <small>
          MOD y CIF compartidos se distribuyen por kg equivalente,
          siguiendo la base productiva que ya utiliza CIBUSPAN ONE.
        </small>
      </section>

      <section className="gross-filters">
        <label>
          <span>Desde</span>
          <input
            type="date"
            value={desdeEdicion}
            onChange={(e) =>
              setDesdeEdicion(
                e.target.value,
              )
            }
          />
        </label>

        <label>
          <span>Hasta</span>
          <input
            type="date"
            value={hastaEdicion}
            onChange={(e) =>
              setHastaEdicion(
                e.target.value,
              )
            }
          />
        </label>

        <label>
          <span>Cliente</span>
          <select
            value={clienteFiltro}
            onChange={(e) => {
              setClienteFiltro(
                e.target.value,
              )
              setSkuFiltro("TODOS")
            }}
          >
            <option value="TODOS">
              Todos los clientes
            </option>
            {opcionesClientes.map(
              (item) => (
                <option
                  key={item.key}
                  value={item.key}
                >
                  {item.nombre}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          <span>SKU</span>
          <select
            value={skuFiltro}
            onChange={(e) =>
              setSkuFiltro(
                e.target.value,
              )
            }
          >
            <option value="TODOS">
              Todos los SKU
            </option>
            {opcionesSku.map(
              (item) => (
                <option
                  key={item.key}
                  value={item.key}
                >
                  {item.nombre} ·{" "}
                  {item.codigo}
                </option>
              ),
            )}
          </select>
        </label>

        <button
          type="button"
          onClick={aplicarPeriodo}
          disabled={cargando}
        >
          {cargando
            ? "Calculando..."
            : "Aplicar periodo"}
        </button>
      </section>

      {error && (
        <div className="gross-error">
          {error}
        </div>
      )}

      {avisos.length > 0 && (
        <div className="gross-warning">
          No se pudieron cargar:{" "}
          {avisos.join(", ")}.
        </div>
      )}

      {!cargando &&
        ventas.length === 0 && (
          <div className="gross-warning">
            No existen ventas
            importadas entre {desde} y{" "}
            {hasta}.
          </div>
        )}

      {calculo.costosSinAsignar >
        0 && (
        <div className="gross-warning">
          {moneda(
            calculo.costosSinAsignar,
          )}{" "}
          de MOD/CIF no pudieron
          asignarse porque no existe
          una base suficiente de kg
          equivalente en el período.
        </div>
      )}

      {totales.incompletos > 0 && (
        <div className="gross-warning">
          {numero(
            totales.incompletos,
          )}{" "}
          combinaciones cliente/SKU
          tienen costo de materiales
          incompleto. No se incluyen
          en el margen bruto hasta
          completar su costo.
        </div>
      )}

      <section className="gross-kpis">
        <Kpi
          titulo="Ventas netas"
          valor={moneda(
            totales.ventasNetas,
          )}
          detalle={`${numero(
            totales.unidades,
          )} unidades facturadas`}
        />

        <Kpi
          titulo="Materia prima"
          valor={moneda(totales.mp)}
          detalle={
            totales.unidades > 0
              ? `${moneda(
                  totales.mp /
                    totales.unidades,
                  4,
                )} / ud`
              : "—"
          }
        />

        <Kpi
          titulo="Empaque directo"
          valor={moneda(
            totales.empaque,
          )}
          detalle={
            totales.unidades > 0
              ? `${moneda(
                  totales.empaque /
                    totales.unidades,
                  4,
                )} / ud`
              : "—"
          }
        />

        <Kpi
          titulo="MOD"
          valor={moneda(totales.mod)}
          detalle="Mano de obra directa"
        />

        <Kpi
          titulo="CIF"
          valor={moneda(totales.cif)}
          detalle="MOI + costos de operación fabril"
        />

        <Kpi
          titulo="Costo fabricación"
          valor={moneda(
            totales.costoFabricacion,
          )}
          detalle="MP + Empaque + MOD + CIF"
        />

        <Kpi
          titulo="Margen bruto"
          valor={moneda(
            totales.margenBruto,
          )}
          detalle={
            totales.unidades > 0
              ? `${moneda(
                  totales.margenBruto /
                    totales.unidades,
                  4,
                )} / ud`
              : "—"
          }
        />

        <Kpi
          titulo="Margen bruto %"
          valor={porcentaje(
            totales.margenBrutoPorcentaje,
          )}
          detalle="Margen bruto / ventas netas"
        />
      </section>

      <section className="gross-panel">
        <header>
          <div>
            <span>ANÁLISIS</span>
            <h2>
              {dimension === "CLIENTE"
                ? "Margen bruto por cliente"
                : "Margen bruto por SKU"}
            </h2>
            <p>
              Los KPI superiores siempre
              muestran el negocio completo
              según los filtros elegidos.
            </p>
          </div>

          <div className="gross-dimension">
            <button
              type="button"
              className={
                dimension === "CLIENTE"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setDimension(
                  "CLIENTE",
                )
              }
            >
              Por cliente
            </button>

            <button
              type="button"
              className={
                dimension === "SKU"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setDimension("SKU")
              }
            >
              Por SKU
            </button>
          </div>
        </header>

        {cargando ? (
          <div className="gross-empty">
            Calculando margen bruto...
          </div>
        ) : resumen.length === 0 ? (
          <div className="gross-empty">
            No existen movimientos para
            estos filtros.
          </div>
        ) : (
          <div className="gross-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    {dimension ===
                    "CLIENTE"
                      ? "Cliente"
                      : "SKU"}
                  </th>
                  <th>Unidades</th>
                  <th>Ventas netas</th>
                  <th>MP</th>
                  <th>Empaque</th>
                  <th>MOD</th>
                  <th>CIF</th>
                  <th>
                    Costo fabricación
                  </th>
                  <th>Margen bruto</th>
                  <th>
                    Margen bruto %
                  </th>
                  <th>
                    Margen / ud
                  </th>
                </tr>
              </thead>

              <tbody>
                {resumen.map((fila) => (
                  <tr key={fila.id}>
                    <td>
                      <strong>
                        {fila.nombre}
                      </strong>
                      <small>
                        {fila.secundario}
                      </small>
                    </td>

                    <td>
                      {numero(
                        fila.unidades,
                      )}
                    </td>

                    <td>
                      <strong>
                        {moneda(
                          fila.ventasNetas,
                        )}
                      </strong>
                    </td>

                    <td>
                      {fila.costoMateriaPrima ===
                      null
                        ? "—"
                        : moneda(
                            fila.costoMateriaPrima,
                          )}
                    </td>

                    <td>
                      {fila.costoEmpaque ===
                      null
                        ? "—"
                        : moneda(
                            fila.costoEmpaque,
                          )}
                    </td>

                    <td>
                      {moneda(
                        fila.manoObraDirecta,
                      )}
                    </td>

                    <td>
                      {moneda(fila.cif)}
                    </td>

                    <td>
                      {fila.costoFabricacion ===
                      null
                        ? "—"
                        : moneda(
                            fila.costoFabricacion,
                          )}
                    </td>

                    <td>
                      <strong
                        className={
                          Number(
                            fila.margenBruto ??
                              -1,
                          ) >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        {fila.margenBruto ===
                        null
                          ? "—"
                          : moneda(
                              fila.margenBruto,
                            )}
                      </strong>
                    </td>

                    <td>
                      <strong
                        className={
                          Number(
                            fila.margenBrutoPorcentaje ??
                              -1,
                          ) >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        {porcentaje(
                          fila.margenBrutoPorcentaje,
                        )}
                      </strong>
                    </td>

                    <td>
                      {porUnidad(
                        fila.margenBruto,
                        fila.unidades,
                      ) === null
                        ? "—"
                        : moneda(
                            porUnidad(
                              fila.margenBruto,
                              fila.unidades,
                            ) ?? 0,
                            4,
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="gross-scope">
        <h3>Qué entra en CIF en esta primera etapa</h3>
        <p>
          Mano de obra indirecta de producción
          más facturas ya clasificadas en el
          grupo OPERACIÓN: materiales y
          ferretería, aseo/limpieza/control de
          plagas, mantenimiento de instalaciones
          y equipos, agua, energía eléctrica,
          combustibles, servicios técnicos,
          arriendos y alimentación del personal.
        </p>
        <p>
          No entran transporte, administración,
          comercial, obligaciones, financiamiento
          ni otros gastos de estructura. Esos se
          revisarán después de validar primero el
          margen bruto.
        </p>
      </section>
    </main>
  )
}

function Kpi({
  titulo,
  valor,
  detalle,
}: {
  titulo: string
  valor: string
  detalle: string
}) {
  return (
    <article>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small>{detalle}</small>
    </article>
  )
}

const css = `
  .gross-report {
    width: 100%;
    max-width: none;
    box-sizing: border-box;
    padding: 18px;
    color: #2b2422;
    background: #f8f5f1;
  }

  .gross-report * {
    box-sizing: border-box;
  }

  .gross-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    margin-bottom: 12px;
  }

  .gross-header > div > span,
  .gross-panel > header span {
    color: #8F1D24;
    font-size: 8px;
    font-weight: 950;
    letter-spacing: .08em;
  }

  .gross-header h1 {
    margin: 4px 0;
    font-size: 27px;
  }

  .gross-header p,
  .gross-panel > header p {
    margin: 0;
    color: #776a65;
    font-size: 10px;
    line-height: 1.45;
  }

  .gross-header button,
  .gross-filters > button {
    min-height: 40px;
    padding: 0 14px;
    border: 0;
    border-radius: 8px;
    background: #8F1D24;
    color: white;
    font-size: 9px;
    font-weight: 900;
    cursor: pointer;
  }

  .gross-formula {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    padding: 11px 13px;
    border: 1px solid #cde8d5;
    border-left: 4px solid #20a95b;
    border-radius: 8px;
    background: #f2fbf5;
  }

  .gross-formula strong {
    color: #1e6338;
    font-size: 10px;
  }

  .gross-formula small {
    color: #65786b;
    font-size: 8px;
  }

  .gross-filters {
    display: grid;
    grid-template-columns:
      145px 145px minmax(190px,1fr)
      minmax(220px,1.25fr) auto;
    gap: 10px;
    align-items: end;
    margin-bottom: 12px;
    padding: 13px;
    border: 1px solid #e6dcd6;
    border-radius: 10px;
    background: white;
  }

  .gross-filters label > span {
    display: block;
    margin-bottom: 5px;
    color: #6f625d;
    font-size: 8px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .gross-filters input,
  .gross-filters select {
    width: 100%;
    min-height: 40px;
    padding: 7px 9px;
    border: 1px solid #d9d0cc;
    border-radius: 7px;
    background: white;
    color: #392f2c;
  }

  .gross-error,
  .gross-warning {
    margin-bottom: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 9px;
    line-height: 1.4;
  }

  .gross-error {
    border-left: 4px solid #b91c1c;
    background: #fee2e2;
    color: #991b1b;
  }

  .gross-warning {
    border-left: 4px solid #F7931E;
    background: #fff7ed;
    color: #9a3412;
  }

  .gross-kpis {
    display: grid;
    grid-template-columns:
      repeat(4, minmax(150px, 1fr));
    gap: 9px;
    margin-bottom: 12px;
  }

  .gross-kpis article {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 13px;
    border: 1px solid #e7ddd8;
    border-top: 3px solid #F7931E;
    border-radius: 9px;
    background: white;
  }

  .gross-kpis span {
    color: #786b65;
    font-size: 8px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .gross-kpis strong {
    color: #8F1D24;
    font-size: 18px;
    overflow-wrap: anywhere;
  }

  .gross-kpis small {
    color: #958781;
    font-size: 8px;
  }

  .gross-panel,
  .gross-scope {
    padding: 15px;
    border: 1px solid #e5dad4;
    border-radius: 11px;
    background: white;
  }

  .gross-panel > header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 11px;
  }

  .gross-panel h2 {
    margin: 3px 0;
    font-size: 18px;
  }

  .gross-dimension {
    display: flex;
    overflow: hidden;
    border: 1px solid #d9d0cc;
    border-radius: 8px;
  }

  .gross-dimension button {
    min-height: 35px;
    padding: 0 11px;
    border: 0;
    background: white;
    color: #6f625d;
    font-size: 8px;
    font-weight: 900;
    cursor: pointer;
  }

  .gross-dimension button.active {
    background: #8F1D24;
    color: white;
  }

  .gross-table-wrap {
    width: 100%;
    overflow-x: auto;
    border: 1px solid #ece6e2;
    border-radius: 8px;
  }

  .gross-table-wrap table {
    width: 100%;
    min-width: 1180px;
    border-collapse: collapse;
  }

  .gross-table-wrap th {
    padding: 9px;
    background: #f8f5f3;
    color: #6f625d;
    text-align: right;
    font-size: 8px;
    white-space: nowrap;
  }

  .gross-table-wrap th:first-child,
  .gross-table-wrap td:first-child {
    text-align: left;
  }

  .gross-table-wrap td {
    padding: 9px;
    border-top: 1px solid #eee8e4;
    text-align: right;
    font-size: 9px;
    white-space: nowrap;
  }

  .gross-table-wrap td strong {
    display: block;
  }

  .gross-table-wrap td small {
    display: block;
    margin-top: 2px;
    color: #968983;
    font-size: 7px;
  }

  .positive {
    color: #15803d !important;
  }

  .negative {
    color: #b91c1c !important;
  }

  .gross-empty {
    padding: 30px;
    color: #80736d;
    text-align: center;
  }

  .gross-scope {
    margin-top: 10px;
    background: #fffaf7;
  }

  .gross-scope h3 {
    margin: 0 0 7px;
    color: #6b3935;
    font-size: 12px;
  }

  .gross-scope p {
    margin: 5px 0 0;
    color: #776a65;
    font-size: 9px;
    line-height: 1.5;
  }

  @media (max-width: 1150px) {
    .gross-filters {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }

    .gross-filters > button {
      grid-column: 1 / -1;
    }

    .gross-kpis {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 700px) {
    .gross-report {
      padding: 10px;
    }

    .gross-header,
    .gross-formula,
    .gross-panel > header {
      flex-direction: column;
      align-items: stretch;
    }

    .gross-header button {
      width: 100%;
    }

    .gross-filters {
      grid-template-columns: 1fr;
    }

    .gross-filters > button {
      grid-column: auto;
    }

    .gross-kpis {
      grid-template-columns: 1fr;
    }

    .gross-dimension {
      width: 100%;
    }

    .gross-dimension button {
      flex: 1;
    }
  }
`
