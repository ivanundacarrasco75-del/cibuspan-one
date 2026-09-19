export type VentaConciliacionInput = {
  id: string
  comprobante: string
  fecha: string
  clienteId: string | null
  cliente: string
  productoId: string | null
  sku: string
  producto: string
  unidades: number
}

export type DespachoConciliacionInput = {
  reservaId: string
  pedidoId: string
  pedidoNumero: string
  numeroFactura: string | null
  fecha: string
  clienteId: string | null
  cliente: string
  productoId: string | null
  sku: string
  producto: string
  unidades: number
}

export type MetodoConciliacion = "FACTURA" | "RESPALDO"

export type EstadoConciliacion =
  | "CONCILIADO"
  | "COINCIDE_SIN_VINCULO"
  | "PENDIENTE_VINCULAR"
  | "FACTURA_NO_ENCONTRADA"
  | "FACTURADO_NO_DESPACHADO"
  | "DESPACHADO_NO_FACTURADO"
  | "DESPACHO_MAYOR"
  | "FACTURA_MAYOR"
  | "CLIENTE_DIFERENTE"

export type FilaConciliacion = {
  id: string
  metodo: MetodoConciliacion
  numeroFactura: string | null
  cliente: string
  sku: string
  producto: string
  despachadas: number
  facturadas: number
  diferencia: number
  estado: EstadoConciliacion
  despachos: DespachoConciliacionInput[]
  facturas: VentaConciliacionInput[]
}

export type ResumenConciliacion = {
  filas: FilaConciliacion[]
  totalDespachadas: number
  totalFacturadas: number
  diferenciaTotal: number
  gruposConciliadosFactura: number
  gruposCoincidenRespaldo: number
  gruposConDiferencia: number
  pendientesVincular: number
  facturasNoEncontradas: number
  tieneDespachos: boolean
  tieneFacturas: boolean
  validado: boolean
}

const TOLERANCIA = 0.001

function normalizarTexto(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

export function normalizarNumeroFactura(
  valor: string | null | undefined,
) {
  return normalizarTexto(valor ?? "")
}

function claveCliente(
  id: string | null,
  nombre: string,
) {
  return id
    ? `ID:${id}`
    : `N:${normalizarTexto(nombre)}`
}

function claveProducto(
  id: string | null,
  sku: string,
) {
  const skuNormalizado =
    normalizarTexto(sku)

  if (skuNormalizado) {
    return `SKU:${skuNormalizado}`
  }

  return id
    ? `ID:${id}`
    : "SKU:SIN_CODIGO"
}

function coincideCliente(
  despachos: DespachoConciliacionInput[],
  facturas: VentaConciliacionInput[],
) {
  if (!despachos.length || !facturas.length) return true

  const clientesDespacho = new Set(
    despachos.map((item) =>
      claveCliente(item.clienteId, item.cliente),
    ),
  )
  const clientesFactura = new Set(
    facturas.map((item) =>
      claveCliente(item.clienteId, item.cliente),
    ),
  )

  if (
    Array.from(clientesDespacho).some(
      (clave) =>
        clientesFactura.has(clave),
    )
  ) {
    return true
  }

  const nombresDespacho = new Set(
    despachos.map((item) =>
      normalizarTexto(item.cliente),
    ),
  )
  const nombresFactura = new Set(
    facturas.map((item) =>
      normalizarTexto(item.cliente),
    ),
  )

  return Array.from(nombresDespacho).some(
    (nombre) =>
      nombresFactura.has(nombre),
  )
}

function estadoDiferencia(
  despachadas: number,
  facturadas: number,
): EstadoConciliacion {
  const diferencia = facturadas - despachadas

  if (Math.abs(diferencia) <= TOLERANCIA) {
    return "CONCILIADO"
  }

  if (facturadas <= TOLERANCIA) {
    return "DESPACHADO_NO_FACTURADO"
  }

  if (despachadas <= TOLERANCIA) {
    return "FACTURADO_NO_DESPACHADO"
  }

  return diferencia < 0
    ? "DESPACHO_MAYOR"
    : "FACTURA_MAYOR"
}

function dentroPeriodo(
  fecha: string,
  desde: string,
  hasta: string,
) {
  return fecha >= desde && fecha <= hasta
}

type GrupoBase = {
  cliente: string
  sku: string
  producto: string
  despachadas: number
  facturadas: number
  despachos: DespachoConciliacionInput[]
  facturas: VentaConciliacionInput[]
}

function agruparPorProducto(
  despachos: DespachoConciliacionInput[],
  facturas: VentaConciliacionInput[],
) {
  const mapa = new Map<string, GrupoBase>()

  function obtener(
    productoId: string | null,
    sku: string,
    cliente: string,
    producto: string,
  ) {
    const key = claveProducto(productoId, sku)
    const actual = mapa.get(key)
    if (actual) return actual

    const nuevo: GrupoBase = {
      cliente,
      sku,
      producto,
      despachadas: 0,
      facturadas: 0,
      despachos: [],
      facturas: [],
    }
    mapa.set(key, nuevo)
    return nuevo
  }

  for (const item of despachos) {
    const grupo = obtener(
      item.productoId,
      item.sku,
      item.cliente,
      item.producto,
    )
    grupo.despachadas += Number(item.unidades || 0)
    grupo.despachos.push(item)
  }

  for (const item of facturas) {
    const grupo = obtener(
      item.productoId,
      item.sku,
      item.cliente,
      item.producto,
    )
    grupo.facturadas += Number(item.unidades || 0)
    grupo.facturas.push(item)
  }

  return mapa
}

export function conciliarUnidadesVentasDespachos(
  ventas: VentaConciliacionInput[],
  despachos: DespachoConciliacionInput[],
  periodo: { desde: string; hasta: string },
): ResumenConciliacion {
  const ventasPeriodo = ventas.filter((item) =>
    dentroPeriodo(
      item.fecha,
      periodo.desde,
      periodo.hasta,
    ),
  )

  const facturasDespachosPeriodo = new Set(
    despachos
      .filter((item) =>
        dentroPeriodo(
          item.fecha,
          periodo.desde,
          periodo.hasta,
        ),
      )
      .map((item) =>
        normalizarNumeroFactura(
          item.numeroFactura,
        ),
      )
      .filter(Boolean),
  )

  const facturasSeleccionadas = new Set([
    ...ventasPeriodo
      .map((item) =>
        normalizarNumeroFactura(
          item.comprobante,
        ),
      )
      .filter(Boolean),
    ...facturasDespachosPeriodo,
  ])

  const ventasRelevantes = ventas.filter(
    (item) =>
      dentroPeriodo(
        item.fecha,
        periodo.desde,
        periodo.hasta,
      ) ||
      facturasDespachosPeriodo.has(
        normalizarNumeroFactura(
          item.comprobante,
        ),
      ),
  )

  const despachosRelevantes = despachos.filter(
    (item) => {
      const factura =
        normalizarNumeroFactura(
          item.numeroFactura,
        )

      return (
        dentroPeriodo(
          item.fecha,
          periodo.desde,
          periodo.hasta,
        ) ||
        (factura &&
          facturasSeleccionadas.has(
            factura,
          ))
      )
    },
  )

  const ventasPorFactura = new Map<
    string,
    VentaConciliacionInput[]
  >()

  for (const venta of ventasRelevantes) {
    const factura =
      normalizarNumeroFactura(
        venta.comprobante,
      )

    if (!factura) continue

    const lista =
      ventasPorFactura.get(factura) ?? []
    lista.push(venta)
    ventasPorFactura.set(factura, lista)
  }

  const despachosPorFactura = new Map<
    string,
    DespachoConciliacionInput[]
  >()
  const despachosSinFactura:
    DespachoConciliacionInput[] = []

  for (const despacho of despachosRelevantes) {
    const factura =
      normalizarNumeroFactura(
        despacho.numeroFactura,
      )

    if (!factura) {
      if (
        dentroPeriodo(
          despacho.fecha,
          periodo.desde,
          periodo.hasta,
        )
      ) {
        despachosSinFactura.push(despacho)
      }
      continue
    }

    const lista =
      despachosPorFactura.get(factura) ?? []
    lista.push(despacho)
    despachosPorFactura.set(factura, lista)
  }

  const facturasConsumidas =
    new Set<string>()
  const filas: FilaConciliacion[] = []

  // Capa 1: vínculo exacto por N.º de factura.
  for (
    const [
      facturaNormalizada,
      despachosFactura,
    ] of despachosPorFactura
  ) {
    const facturas =
      ventasPorFactura.get(
        facturaNormalizada,
      ) ?? []

    const numeroFactura =
      despachosFactura[0]?.numeroFactura ||
      facturas[0]?.comprobante ||
      facturaNormalizada

    if (facturas.length === 0) {
      const grupos =
        agruparPorProducto(
          despachosFactura,
          [],
        )

      for (
        const [
          productoKey,
          grupo,
        ] of grupos
      ) {
        filas.push({
          id:
            `F:${facturaNormalizada}|` +
            productoKey,
          metodo: "FACTURA",
          numeroFactura,
          cliente: grupo.cliente,
          sku: grupo.sku,
          producto: grupo.producto,
          despachadas: grupo.despachadas,
          facturadas: 0,
          diferencia:
            -grupo.despachadas,
          estado: "FACTURA_NO_ENCONTRADA",
          despachos: grupo.despachos,
          facturas: [],
        })
      }
      continue
    }

    facturasConsumidas.add(
      facturaNormalizada,
    )

    const clienteOk =
      coincideCliente(
        despachosFactura,
        facturas,
      )

    const grupos =
      agruparPorProducto(
        despachosFactura,
        facturas,
      )

    for (
      const [
        productoKey,
        grupo,
      ] of grupos
    ) {
      const estado = clienteOk
        ? estadoDiferencia(
            grupo.despachadas,
            grupo.facturadas,
          )
        : "CLIENTE_DIFERENTE"

      filas.push({
        id:
          `F:${facturaNormalizada}|` +
          productoKey,
        metodo: "FACTURA",
        numeroFactura,
        cliente:
          grupo.despachos[0]?.cliente ||
          grupo.facturas[0]?.cliente ||
          grupo.cliente,
        sku: grupo.sku,
        producto: grupo.producto,
        despachadas: grupo.despachadas,
        facturadas: grupo.facturadas,
        diferencia:
          grupo.facturadas -
          grupo.despachadas,
        estado,
        despachos: grupo.despachos,
        facturas: grupo.facturas,
      })
    }
  }

  // Capa 2: respaldo por Cliente + SKU + período
  // solo para movimientos que aún no tienen vínculo exacto.
  const ventasRestantes =
    ventasPeriodo.filter(
      (venta) =>
        !facturasConsumidas.has(
          normalizarNumeroFactura(
            venta.comprobante,
          ),
        ),
    )

  type GrupoRespaldo =
    GrupoBase & { key: string }

  const respaldo =
    new Map<string, GrupoRespaldo>()

  function obtenerRespaldo(datos: {
    clienteId: string | null
    cliente: string
    productoId: string | null
    sku: string
    producto: string
  }) {
    const key =
      `${claveCliente(
        datos.clienteId,
        datos.cliente,
      )}|${claveProducto(
        datos.productoId,
        datos.sku,
      )}`

    const actual = respaldo.get(key)
    if (actual) return actual

    const nuevo: GrupoRespaldo = {
      key,
      cliente: datos.cliente,
      sku: datos.sku,
      producto: datos.producto,
      despachadas: 0,
      facturadas: 0,
      despachos: [],
      facturas: [],
    }

    respaldo.set(key, nuevo)
    return nuevo
  }

  for (
    const despacho of despachosSinFactura
  ) {
    const grupo = obtenerRespaldo({
      clienteId: despacho.clienteId,
      cliente: despacho.cliente,
      productoId: despacho.productoId,
      sku: despacho.sku,
      producto: despacho.producto,
    })

    grupo.despachadas +=
      Number(despacho.unidades || 0)
    grupo.despachos.push(despacho)
  }

  for (const venta of ventasRestantes) {
    const grupo = obtenerRespaldo({
      clienteId: venta.clienteId,
      cliente: venta.cliente,
      productoId: venta.productoId,
      sku: venta.sku,
      producto: venta.producto,
    })

    grupo.facturadas +=
      Number(venta.unidades || 0)
    grupo.facturas.push(venta)
  }

  for (const grupo of respaldo.values()) {
    const diferencia =
      grupo.facturadas -
      grupo.despachadas

    let estado: EstadoConciliacion

    if (
      grupo.despachadas > TOLERANCIA &&
      grupo.facturadas > TOLERANCIA &&
      Math.abs(diferencia) <=
        TOLERANCIA
    ) {
      estado = "COINCIDE_SIN_VINCULO"
    } else if (
      grupo.despachadas > TOLERANCIA &&
      grupo.facturadas <= TOLERANCIA
    ) {
      estado = "PENDIENTE_VINCULAR"
    } else {
      estado = estadoDiferencia(
        grupo.despachadas,
        grupo.facturadas,
      )
    }

    filas.push({
      id: `R:${grupo.key}`,
      metodo: "RESPALDO",
      numeroFactura: null,
      cliente: grupo.cliente,
      sku: grupo.sku,
      producto: grupo.producto,
      despachadas: grupo.despachadas,
      facturadas: grupo.facturadas,
      diferencia,
      estado,
      despachos: grupo.despachos,
      facturas: grupo.facturas,
    })
  }

  filas.sort((a, b) => {
    const prioridad = (
      fila: FilaConciliacion,
    ) => {
      if (
        fila.estado === "CONCILIADO"
      ) return 5

      if (
        fila.estado ===
        "COINCIDE_SIN_VINCULO"
      ) return 4

      if (
        fila.estado ===
        "PENDIENTE_VINCULAR"
      ) return 3

      return 0
    }

    const porEstado =
      prioridad(a) - prioridad(b)

    if (porEstado !== 0) {
      return porEstado
    }

    const porDiferencia =
      Math.abs(b.diferencia) -
      Math.abs(a.diferencia)

    if (porDiferencia !== 0) {
      return porDiferencia
    }

    return a.cliente.localeCompare(
      b.cliente,
    )
  })

  const totalDespachadas =
    filas.reduce(
      (total, fila) =>
        total + fila.despachadas,
      0,
    )

  const totalFacturadas =
    filas.reduce(
      (total, fila) =>
        total + fila.facturadas,
      0,
    )

  const gruposConciliadosFactura =
    filas.filter(
      (fila) =>
        fila.estado === "CONCILIADO" &&
        fila.metodo === "FACTURA",
    ).length

  const gruposCoincidenRespaldo =
    filas.filter(
      (fila) =>
        fila.estado ===
        "COINCIDE_SIN_VINCULO",
    ).length

  const pendientesVincular =
    filas.filter(
      (fila) =>
        fila.estado ===
          "COINCIDE_SIN_VINCULO" ||
        fila.estado ===
          "PENDIENTE_VINCULAR",
    ).length

  const facturasNoEncontradas =
    filas.filter(
      (fila) =>
        fila.estado ===
        "FACTURA_NO_ENCONTRADA",
    ).length

  const gruposConDiferencia =
    filas.filter(
      (fila) =>
        fila.estado !== "CONCILIADO" &&
        fila.estado !==
          "COINCIDE_SIN_VINCULO" &&
        fila.estado !==
          "PENDIENTE_VINCULAR",
    ).length

  const tieneDespachos =
    despachosRelevantes.length > 0
  const tieneFacturas =
    ventasRelevantes.length > 0

  return {
    filas,
    totalDespachadas,
    totalFacturadas,
    diferenciaTotal:
      totalFacturadas -
      totalDespachadas,
    gruposConciliadosFactura,
    gruposCoincidenRespaldo,
    gruposConDiferencia,
    pendientesVincular,
    facturasNoEncontradas,
    tieneDespachos,
    tieneFacturas,
    validado:
      filas.length > 0 &&
      filas.every(
        (fila) =>
          fila.metodo === "FACTURA" &&
          fila.estado === "CONCILIADO",
      ),
  }
}
