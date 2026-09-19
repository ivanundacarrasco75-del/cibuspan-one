import { useEffect, useMemo, useState } from "react"

import type {
  DevolucionListadoDb,
  ProductoDevolucionDb,
} from "../../repositories/devolucionRepository"
import type {
  VentaDiariaDb,
  VentaSemanalDb,
} from "../../repositories/ventasRepository"
import {
  detalleAgrupacion,
  etiquetaAgrupacion,
  ETIQUETAS_AGRUPACION,
  finAgrupacion,
  inicioAgrupacion,
  type AgrupacionDashboard,
} from "../../utils/dashboardPeriodos"

type Props = {
  ventas: VentaSemanalDb[]
  ventasDiarias: VentaDiariaDb[]
  devoluciones: DevolucionListadoDb[]
  productos: ProductoDevolucionDb[]
  cargando: boolean
  cambiarPantalla: (pantalla: string) => void
  fechaDesde: string
  fechaHasta: string
  agrupacion: AgrupacionDashboard
}

type FilaBase = {
  clave: string
  semana: string
  clienteClave: string
  cliente: string
  sku: string
  producto: string
  enviadas: number
  devueltas: number
  valorDevuelto: number
}

type FilaSemana = {
  semana: string
  enviadas: number
  devueltas: number
  valorDevuelto: number
  porcentaje: number | null
  consolidada: boolean
  fechaConsolidacion: string
}

type FilaGrafico = FilaSemana & {
  etiqueta: string
  detalle: string
}

type FilaRanking = {
  clave: string
  nombre: string
  secundario: string
  enviadas: number
  devueltas: number
  valorDevuelto: number
  enviadasConsolidadas: number
  devueltasConsolidadas: number
  porcentaje: number | null
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

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function clienteClave(nombre: string) {
  const valor = normalizar(nombre)
  if (
    valor.includes("FAVORITA") ||
    valor.includes("SUPERMAXI") ||
    valor.includes("MEGAMAXI")
  ) return "CORPORACION FAVORITA"
  if (
    valor.includes("SANTAMARIA") ||
    valor.includes("SANTA MARIA") ||
    valor.includes("MEGA SANTA")
  ) return "MEGA SANTAMARIA"
  if (valor.includes("ROSADO") || valor.includes("COMISARIATO")) {
    return "CORPORACION EL ROSADO"
  }
  if (valor.includes("TUTI")) return "TUTI"
  return valor || "SIN CLIENTE"
}

function clienteEtiqueta(clave: string, nombre: string) {
  if (clave === "CORPORACION FAVORITA") return "Corporación Favorita"
  if (clave === "MEGA SANTAMARIA") return "Mega Santamaría"
  if (clave === "CORPORACION EL ROSADO") return "Corporación El Rosado"
  if (clave === "TUTI") return "TUTI"
  return nombre || "Sin cliente"
}

function numero(valor: number) {
  return Math.round(valor || 0).toLocaleString("es-EC")
}

function moneda(valor: number) {
  return Number(valor || 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function tasa(devueltas: number, enviadas: number) {
  return enviadas > 0 ? (devueltas / enviadas) * 100 : null
}

function formatoTasa(valor: number | null) {
  return valor === null ? "—" : `${valor.toFixed(1)}%`
}

function fechaCorta(fechaIso: string) {
  if (!fechaIso) return "—"
  const [, mes, dia] = fechaIso.split("-")
  return `${dia}/${mes}`
}

function etiquetaSemana(semana: string) {
  return `${fechaCorta(semana)}–${fechaCorta(sumarDias(semana, 6))}`
}

export default function DashboardDevolucionesPanel({
  ventas,
  ventasDiarias,
  devoluciones,
  productos,
  cargando,
  cambiarPantalla,
  fechaDesde,
  fechaHasta,
  agrupacion,
}: Props) {
  const [clientesSeleccionados, setClientesSeleccionados] = useState<string[]>([])
  const [sku, setSku] = useState("TODOS")

  const filasBase = useMemo(() => {
    const mapa = new Map<string, FilaBase>()

    function obtenerFila(datos: {
      semana: string
      clienteNombre: string
      sku: string
      producto: string
    }) {
      const claveCliente = clienteClave(datos.clienteNombre)
      const codigo = datos.sku.trim()
      const clave = `${datos.semana}|${claveCliente}|${codigo}`
      const existente = mapa.get(clave)
      if (existente) {
        if (!existente.producto && datos.producto) existente.producto = datos.producto
        return existente
      }

      const nueva: FilaBase = {
        clave,
        semana: datos.semana,
        clienteClave: claveCliente,
        cliente: clienteEtiqueta(claveCliente, datos.clienteNombre),
        sku: codigo,
        producto: datos.producto || codigo,
        enviadas: 0,
        devueltas: 0,
        valorDevuelto: 0,
      }
      mapa.set(clave, nueva)
      return nueva
    }

    ventas.forEach((venta) => {
      if (!venta.semana_inicio || !venta.sku) return
      const fila = obtenerFila({
        semana: venta.semana_inicio,
        clienteNombre: venta.cliente_nombre,
        sku: venta.sku,
        producto: venta.producto_nombre,
      })
      fila.enviadas += Number(venta.unidades ?? 0)
    })

    devoluciones.forEach((devolucion) => {
      const nombreCliente = devolucion.cliente?.nombre ?? "Sin cliente"
      ;(devolucion.detalles ?? []).forEach((detalle) => {
        const semana = detalle.semana_origen_inicio
        const codigo = detalle.producto?.codigo ?? detalle.sku_documento ?? ""
        if (!semana || !codigo) return
        const fila = obtenerFila({
          semana,
          clienteNombre: nombreCliente,
          sku: codigo,
          producto:
            detalle.producto?.corto ??
            detalle.producto_nombre_documento ??
            codigo,
        })
        fila.devueltas += Number(detalle.unidades ?? 0)
        fila.valorDevuelto += Number(detalle.valor_total_documento ?? 0)
      })
    })

    return Array.from(mapa.values())
  }, [ventas, devoluciones])

  const semanasDisponibles = useMemo(
    () => Array.from(new Set(filasBase.map((fila) => fila.semana)))
      .filter(Boolean)
      .sort(),
    [filasBase],
  )

  const semanasAtribuidasPorRecepcion = useMemo(() => {
    const semanas = new Set<string>()
    devoluciones.forEach((devolucion) => {
      if (
        (fechaDesde && devolucion.fecha_devolucion < fechaDesde) ||
        (fechaHasta && devolucion.fecha_devolucion > fechaHasta)
      ) return
      ;(devolucion.detalles ?? []).forEach((detalle) => {
        if (detalle.semana_origen_inicio) {
          semanas.add(detalle.semana_origen_inicio)
        }
      })
    })
    return semanas
  }, [devoluciones, fechaDesde, fechaHasta])

  const semanasPeriodo = useMemo(() => {
    const desde = fechaDesde ? sumarDias(fechaDesde, -6) : ""
    return semanasDisponibles.filter((semana) =>
      ((!desde || semana >= desde) && (!fechaHasta || semana <= fechaHasta)) ||
      semanasAtribuidasPorRecepcion.has(semana),
    )
  }, [fechaDesde, fechaHasta, semanasDisponibles, semanasAtribuidasPorRecepcion])

  const semanasAtribuidasFueraRango = useMemo(() => {
    const desde = fechaDesde ? sumarDias(fechaDesde, -6) : ""
    return Array.from(semanasAtribuidasPorRecepcion).filter((semana) =>
      (desde && semana < desde) || (fechaHasta && semana > fechaHasta),
    ).length
  }, [semanasAtribuidasPorRecepcion, fechaDesde, fechaHasta])

  const semanasSet = useMemo(() => new Set(semanasPeriodo), [semanasPeriodo])
  const filasPeriodo = useMemo(
    () => filasBase.filter((fila) => semanasSet.has(fila.semana)),
    [filasBase, semanasSet],
  )

  const clientes = useMemo(() => {
    const mapa = new Map<string, string>()
    filasPeriodo.forEach((fila) => mapa.set(fila.clienteClave, fila.cliente))
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [filasPeriodo])

  const clientesSeleccionadosSet = useMemo(
    () => new Set(clientesSeleccionados),
    [clientesSeleccionados],
  )

  const skus = useMemo(() => {
    const mapa = new Map<string, string>()
    filasPeriodo
      .filter((fila) =>
        clientesSeleccionados.length === 0 ||
        clientesSeleccionadosSet.has(fila.clienteClave),
      )
      .forEach((fila) => mapa.set(fila.sku, fila.producto))
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [filasPeriodo, clientesSeleccionados, clientesSeleccionadosSet])

  useEffect(() => {
    const disponibles = new Set(clientes.map(([clave]) => clave))
    setClientesSeleccionados((actuales) => {
      const validos = actuales.filter((clave) => disponibles.has(clave))
      return validos.length === actuales.length ? actuales : validos
    })
  }, [clientes])

  useEffect(() => {
    if (sku !== "TODOS" && !skus.some(([codigo]) => codigo === sku)) {
      setSku("TODOS")
    }
  }, [sku, skus])

  function alternarCliente(clave: string) {
    setClientesSeleccionados((actuales) =>
      actuales.includes(clave)
        ? actuales.filter((item) => item !== clave)
        : [...actuales, clave],
    )
    setSku("TODOS")
  }

  const filasFiltradas = useMemo(
    () => filasPeriodo.filter((fila) =>
      (clientesSeleccionados.length === 0 ||
        clientesSeleccionadosSet.has(fila.clienteClave)) &&
      (sku === "TODOS" || fila.sku === sku)),
    [filasPeriodo, clientesSeleccionados, clientesSeleccionadosSet, sku],
  )

  const unidadesRecibidasEnRango = useMemo(() =>
    devoluciones.reduce((total, devolucion) => {
      if (
        (fechaDesde && devolucion.fecha_devolucion < fechaDesde) ||
        (fechaHasta && devolucion.fecha_devolucion > fechaHasta) ||
        (clientesSeleccionados.length > 0 &&
          !clientesSeleccionadosSet.has(
            clienteClave(devolucion.cliente?.nombre ?? ""),
          ))
      ) return total
      return total + (devolucion.detalles ?? []).reduce((subtotal, detalle) => {
        const codigo = detalle.producto?.codigo ?? detalle.sku_documento ?? ""
        if (sku !== "TODOS" && codigo !== sku) return subtotal
        return subtotal + Number(detalle.unidades ?? 0)
      }, 0)
    }, 0),
  [
    devoluciones,
    fechaDesde,
    fechaHasta,
    clientesSeleccionados,
    clientesSeleccionadosSet,
    sku,
  ])

  const desfaseMaximoSemanas = useMemo(() => {
    const codigos = new Set(filasFiltradas.map((fila) => fila.sku.trim()))
    const desfases = productos
      .filter((producto) => codigos.has(producto.codigo.trim()))
      .map((producto) => Math.max(
        0,
        Math.round(Math.max(1, Number(producto.vida_util_dias ?? 0) - 2) / 7),
      ))
    return desfases.length > 0 ? Math.max(...desfases) : 4
  }, [filasFiltradas, productos])

  const hoy = fechaIsoLocal(new Date())
  const resumenSemanal = useMemo<FilaSemana[]>(() => {
    const mapa = new Map<string, Omit<FilaSemana, "porcentaje">>()
    semanasPeriodo.forEach((semana) => {
      const fechaConsolidacion = sumarDias(semana, desfaseMaximoSemanas * 7 + 6)
      mapa.set(semana, {
        semana,
        enviadas: 0,
        devueltas: 0,
        valorDevuelto: 0,
        consolidada: fechaConsolidacion <= hoy,
        fechaConsolidacion,
      })
    })
    filasFiltradas.forEach((fila) => {
      const actual = mapa.get(fila.semana)
      if (!actual) return
      actual.enviadas += fila.enviadas
      actual.devueltas += fila.devueltas
      actual.valorDevuelto += fila.valorDevuelto
    })
    return Array.from(mapa.values()).map((fila) => ({
      ...fila,
      porcentaje: tasa(fila.devueltas, fila.enviadas),
    }))
  }, [filasFiltradas, semanasPeriodo, desfaseMaximoSemanas, hoy])

  const resumenGrafico = useMemo<FilaGrafico[]>(() => {
    if (agrupacion === "SEMANA") {
      return resumenSemanal.map((fila) => ({
        ...fila,
        etiqueta: etiquetaAgrupacion(fila.semana, "SEMANA"),
        detalle: etiquetaSemana(fila.semana),
      }))
    }

    const mapa = new Map<string, Omit<FilaGrafico, "porcentaje">>()
    const asegurar = (fecha: string) => {
      const clave = inicioAgrupacion(fecha, agrupacion)
      const existente = mapa.get(clave)
      if (existente) return existente
      const fechaConsolidacion = sumarDias(
        finAgrupacion(clave, agrupacion),
        desfaseMaximoSemanas * 7,
      )
      const nuevo: Omit<FilaGrafico, "porcentaje"> = {
        semana: clave,
        etiqueta: etiquetaAgrupacion(clave, agrupacion),
        detalle: detalleAgrupacion(clave, agrupacion),
        enviadas: 0,
        devueltas: 0,
        valorDevuelto: 0,
        consolidada: fechaConsolidacion <= hoy,
        fechaConsolidacion,
      }
      mapa.set(clave, nuevo)
      return nuevo
    }

    let cursor = fechaDesde
    while (cursor <= fechaHasta) {
      asegurar(cursor)
      cursor = sumarDias(cursor, 1)
    }

    devoluciones.forEach((devolucion) => {
      if (
        devolucion.fecha_devolucion < fechaDesde ||
        devolucion.fecha_devolucion > fechaHasta ||
        (clientesSeleccionados.length > 0 &&
          !clientesSeleccionadosSet.has(
            clienteClave(devolucion.cliente?.nombre ?? ""),
          ))
      ) return

      ;(devolucion.detalles ?? []).forEach((detalle) => {
        const codigo = detalle.producto?.codigo ?? detalle.sku_documento ?? ""
        if (sku !== "TODOS" && codigo !== sku) return
        const vidaEfectiva = Number(detalle.vida_efectiva_dias ?? 0)
        const fechaOrigen = vidaEfectiva > 0
          ? sumarDias(devolucion.fecha_devolucion, -vidaEfectiva)
          : detalle.semana_origen_inicio
        if (!fechaOrigen) return
        const fila = asegurar(fechaOrigen)
        fila.devueltas += Number(detalle.unidades ?? 0)
        fila.valorDevuelto += Number(detalle.valor_total_documento ?? 0)
      })
    })

    ventasDiarias.forEach((venta) => {
      if (
        (clientesSeleccionados.length > 0 &&
          !clientesSeleccionadosSet.has(clienteClave(venta.cliente_nombre))) ||
        (sku !== "TODOS" && venta.sku !== sku)
      ) return
      const clave = inicioAgrupacion(venta.fecha_emision, agrupacion)
      if (
        (venta.fecha_emision < fechaDesde || venta.fecha_emision > fechaHasta) &&
        !mapa.has(clave)
      ) return
      asegurar(venta.fecha_emision).enviadas += Number(venta.cantidad ?? 0)
    })

    return Array.from(mapa.values())
      .sort((a, b) => a.semana.localeCompare(b.semana))
      .map((fila) => ({
        ...fila,
        porcentaje: tasa(fila.devueltas, fila.enviadas),
      }))
  }, [
    agrupacion,
    resumenSemanal,
    fechaDesde,
    fechaHasta,
    devoluciones,
    ventasDiarias,
    clientesSeleccionados,
    clientesSeleccionadosSet,
    sku,
    desfaseMaximoSemanas,
    hoy,
  ])

  const construirRanking = (tipo: "CLIENTE" | "SKU") => {
    const mapa = new Map<string, Omit<FilaRanking, "porcentaje">>()
    filasFiltradas.forEach((fila) => {
      const clave = tipo === "CLIENTE" ? fila.clienteClave : fila.sku
      const actual = mapa.get(clave) ?? {
        clave,
        nombre: tipo === "CLIENTE" ? fila.cliente : fila.producto,
        secundario: tipo === "CLIENTE" ? "Todos los SKU" : fila.sku,
        enviadas: 0,
        devueltas: 0,
        valorDevuelto: 0,
        enviadasConsolidadas: 0,
        devueltasConsolidadas: 0,
      }
      actual.enviadas += fila.enviadas
      actual.devueltas += fila.devueltas
      actual.valorDevuelto += fila.valorDevuelto
      const fechaConsolidacion = sumarDias(
        fila.semana,
        desfaseMaximoSemanas * 7 + 6,
      )
      if (fechaConsolidacion <= hoy) {
        actual.enviadasConsolidadas += fila.enviadas
        actual.devueltasConsolidadas += fila.devueltas
      }
      mapa.set(clave, actual)
    })
    return Array.from(mapa.values())
      .map((fila) => ({
        ...fila,
        porcentaje: tasa(fila.devueltasConsolidadas, fila.enviadasConsolidadas),
      }))
      .filter((fila) => fila.devueltas > 0)
      .sort((a, b) => b.devueltas - a.devueltas || b.enviadas - a.enviadas)
  }

  const rankingClientes = useMemo(
    () => construirRanking("CLIENTE"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filasFiltradas, desfaseMaximoSemanas, hoy],
  )
  const rankingSku = useMemo(
    () => construirRanking("SKU"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filasFiltradas, desfaseMaximoSemanas, hoy],
  )

  const periodosConsolidados = resumenGrafico.filter((fila) => fila.consolidada)
  const periodosPendientes = resumenGrafico.filter((fila) => !fila.consolidada)
  const totalEnviadas = resumenGrafico.reduce((total, fila) => total + fila.enviadas, 0)
  const totalDevueltas = resumenGrafico.reduce((total, fila) => total + fila.devueltas, 0)
  const totalValor = resumenGrafico.reduce((total, fila) => total + fila.valorDevuelto, 0)
  const enviadasConsolidadas = periodosConsolidados.reduce(
    (total, fila) => total + fila.enviadas,
    0,
  )
  const devueltasConsolidadas = periodosConsolidados.reduce(
    (total, fila) => total + fila.devueltas,
    0,
  )
  const porcentajeConsolidado = tasa(devueltasConsolidadas, enviadasConsolidadas)
  const ultimaConsolidada = periodosConsolidados.filter((fila) => fila.enviadas > 0).at(-1)
  const anteriorConsolidada = periodosConsolidados.filter((fila) => fila.enviadas > 0).at(-2)
  const etiquetaGrupo = ETIQUETAS_AGRUPACION[agrupacion].toLocaleLowerCase("es-EC")

  return (
    <section className="dashboard-view dd-dashboard">
      <style>{css}</style>

      <header className="dd-heading">
        <div>
          <span>CONTROL DE DEVOLUCIONES · V12.10</span>
          <h2>Devoluciones consolidadas y pendientes</h2>
          <p>Relacionadas con la semana estimada de despacho según la vida útil de cada SKU.</p>
        </div>
        <button type="button" onClick={() => cambiarPantalla("Reporte de devoluciones")}>
          Abrir reporte completo
        </button>
      </header>

      <section className="dd-filters">
        <div className="dd-client-filter">
          <div className="dd-filter-title">
            <span>Clientes</span>
            <small>
              {clientesSeleccionados.length === 0
                ? "Todos"
                : `${clientesSeleccionados.length} seleccionados`}
            </small>
          </div>
          <div className="dd-client-options">
            <label className={clientesSeleccionados.length === 0 ? "active" : ""}>
              <input
                type="checkbox"
                checked={clientesSeleccionados.length === 0}
                onChange={() => { setClientesSeleccionados([]); setSku("TODOS") }}
              />
              <span>Todos los clientes</span>
            </label>
            {clientes.map(([clave, nombre]) => {
              const activo = clientesSeleccionadosSet.has(clave)
              return (
                <label key={clave} className={activo ? "active" : ""}>
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={() => alternarCliente(clave)}
                  />
                  <span>{nombre}</span>
                </label>
              )
            })}
          </div>
        </div>
        <label className="dd-sku-filter">
          SKU
          <select value={sku} onChange={(evento) => setSku(evento.target.value)}>
            <option value="TODOS">Todos los SKU</option>
            {skus.map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre} · {codigo}</option>)}
          </select>
        </label>
        <div className="dd-period-label">
          <span>Rango analizado</span>
          <strong>{semanasPeriodo.length > 0 ? `${etiquetaSemana(semanasPeriodo[0])} a ${etiquetaSemana(semanasPeriodo.at(-1) ?? "")}` : "Sin información"}</strong>
        </div>
      </section>

      <div className="dd-life-rule">
        <strong>Regla de vida útil activa.</strong>
        Las devoluciones recibidas entre {fechaCorta(fechaDesde)} y {fechaCorta(fechaHasta)}
        {" "}se trasladan a su semana estimada de despacho usando la vida útil de cada SKU menos 2 días.
        {semanasAtribuidasFueraRango > 0 && (
          <> Por eso se añadieron {semanasAtribuidasFueraRango} semana{semanasAtribuidasFueraRango === 1 ? "" : "s"} anterior{semanasAtribuidasFueraRango === 1 ? "" : "es"} al gráfico.</>
        )}
      </div>

      <section className="dd-kpis">
        <Kpi titulo="Enviadas" valor={`${numero(totalEnviadas)} Unid.`} detalle={`${ETIQUETAS_AGRUPACION[agrupacion]} seleccionados`} />
        <Kpi titulo="Recibidas en las fechas" valor={`${numero(unidadesRecibidasEnRango)} Unid.`} detalle="Se reubican según vida útil" estado="bad" />
        <Kpi titulo="Devueltas atribuidas" valor={`${numero(totalDevueltas)} Unid.`} detalle="Ubicadas en semana de despacho" estado="bad" />
        <Kpi
          titulo="Porcentaje consolidado"
          valor={formatoTasa(porcentajeConsolidado)}
          detalle={porcentajeConsolidado === null ? "Sin semanas completas" : porcentajeConsolidado <= 8 ? "Dentro de la meta ≤ 8%" : "Sobre la meta del 8%"}
          estado={porcentajeConsolidado === null ? "neutral" : porcentajeConsolidado <= 8 ? "good" : "bad"}
        />
        <Kpi titulo="Periodos pendientes" valor={String(periodosPendientes.length)} detalle={`Azul · espera máxima ${desfaseMaximoSemanas} semanas`} estado="pending" />
        <Kpi titulo="Valor devuelto" valor={moneda(totalValor)} detalle="Según notas de crédito" />
      </section>

      {cargando ? (
        <div className="dd-empty">Actualizando información de devoluciones…</div>
      ) : resumenGrafico.length === 0 ? (
        <div className="dd-empty">No existen movimientos para los filtros seleccionados.</div>
      ) : (
        <>
          <section className="dd-panel">
            <div className="dd-panel-heading">
              <div><span>EVOLUCIÓN POR {etiquetaGrupo.toLocaleUpperCase("es-EC")}</span><h3>Unidades enviadas y devueltas</h3></div>
              <Leyenda />
            </div>
            <GraficoUnidades datos={resumenGrafico} />
          </section>

          <section className="dd-two-columns">
            <article className="dd-panel">
              <div className="dd-panel-heading"><div><span>PORCENTAJE</span><h3>Tasa de devolución por {etiquetaGrupo}</h3></div></div>
              <GraficoPorcentaje datos={resumenGrafico} agrupacion={agrupacion} />
            </article>
            <article className="dd-panel dd-current-reading">
              <div className="dd-panel-heading"><div><span>ÚLTIMA LECTURA VÁLIDA</span><h3>Comparación consolidada</h3></div></div>
              {ultimaConsolidada ? (
                <div className="dd-comparison">
                  <div><span>Periodo</span><strong>{ultimaConsolidada.etiqueta} · {ultimaConsolidada.detalle}</strong></div>
                  <div><span>Enviadas</span><strong>{numero(ultimaConsolidada.enviadas)}</strong></div>
                  <div><span>Devueltas</span><strong>{numero(ultimaConsolidada.devueltas)}</strong></div>
                  <div><span>Tasa</span><strong className={(ultimaConsolidada.porcentaje ?? 0) <= 8 ? "good" : "bad"}>{formatoTasa(ultimaConsolidada.porcentaje)}</strong></div>
                  <Variacion actual={ultimaConsolidada.porcentaje} anterior={anteriorConsolidada?.porcentaje ?? null} />
                </div>
              ) : <div className="dd-empty compact">Todavía no existen periodos consolidados.</div>}
            </article>
          </section>

          <section className="dd-two-columns">
            <Ranking titulo="Clientes con más devoluciones" filas={rankingClientes.slice(0, 8)} />
            <Ranking titulo="SKU con más devoluciones" filas={rankingSku.slice(0, 8)} />
          </section>

          <section className="dd-panel">
            <div className="dd-panel-heading">
              <div><span>ESTADO DEL PERIODO</span><h3>Detalle por {etiquetaGrupo}</h3></div>
              <small>Los periodos azules todavía pueden recibir devoluciones.</small>
            </div>
            <div className="dd-table-wrap">
              <table>
                <thead><tr><th>Periodo estimado de despacho</th><th>Estado</th><th>Enviadas</th><th>Devueltas</th><th>Tasa</th><th>Valor</th></tr></thead>
                <tbody>{resumenGrafico.map((fila) => (
                  <tr key={fila.semana} className={fila.consolidada ? "" : "pending"}>
                    <td><strong>{fila.etiqueta}</strong> · {fila.detalle}</td>
                    <td>{fila.consolidada ? <span className="dd-status complete">Consolidada</span> : <span className="dd-status pending">Pendiente hasta {fechaCorta(fila.fechaConsolidacion)}</span>}</td>
                    <td>{numero(fila.enviadas)}</td>
                    <td>{numero(fila.devueltas)}</td>
                    <td><strong className={!fila.consolidada ? "pending" : (fila.porcentaje ?? 0) <= 8 ? "good" : "bad"}>{formatoTasa(fila.porcentaje)}</strong></td>
                    <td>{moneda(fila.valorDevuelto)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  )
}

function Kpi({ titulo, valor, detalle, estado = "neutral" }: { titulo: string; valor: string; detalle: string; estado?: "neutral" | "good" | "bad" | "pending" }) {
  return <article className={`dd-kpi ${estado}`}><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>
}

function Leyenda() {
  return <div className="dd-legend"><span className="sent">● Enviadas</span><span className="complete">● Consolidada</span><span className="pending">● Pendiente</span></div>
}

function Variacion({ actual, anterior }: { actual: number | null; anterior: number | null }) {
  if (actual === null || anterior === null) return <p>Sin periodo anterior comparable.</p>
  const diferencia = actual - anterior
  const mejora = diferencia <= 0
  return <p className={mejora ? "good" : "bad"}>{mejora ? "↓" : "↑"} {Math.abs(diferencia).toFixed(1)} puntos frente a la consolidada anterior.</p>
}

function GraficoUnidades({ datos }: { datos: FilaGrafico[] }) {
  const ancho = 980, alto = 300, izquierda = 58, derecha = 22, arriba = 20, abajo = 48
  const anchoUtil = ancho - izquierda - derecha, altoUtil = alto - arriba - abajo
  const maximo = Math.max(1, ...datos.flatMap((fila) => [fila.enviadas, fila.devueltas]))
  const x = (indice: number) => izquierda + (datos.length === 1 ? anchoUtil / 2 : indice / (datos.length - 1) * anchoUtil)
  const y = (valor: number) => arriba + altoUtil - valor / maximo * altoUtil
  const ruta = (campo: "enviadas" | "devueltas") => datos.map((fila, indice) => `${indice ? "L" : "M"}${x(indice)},${y(fila[campo])}`).join(" ")
  return <div className="dd-svg"><svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Unidades enviadas y devueltas por periodo">{[0,.25,.5,.75,1].map((tramo) => <g key={tramo}><line x1={izquierda} x2={ancho-derecha} y1={y(maximo*tramo)} y2={y(maximo*tramo)} className="grid"/><text x={izquierda-8} y={y(maximo*tramo)+4} textAnchor="end">{numero(maximo*tramo)}</text></g>)}<path d={ruta("enviadas")} className="sent-line"/>{datos.slice(1).map((fila, indice) => { const anterior = datos[indice]; const pendiente = !fila.consolidada || !anterior.consolidada; return <line key={fila.semana} x1={x(indice)} y1={y(anterior.devueltas)} x2={x(indice+1)} y2={y(fila.devueltas)} className={pendiente ? "return-line pending" : "return-line complete"}/> })}{datos.map((fila, indice) => <g key={fila.semana}><circle cx={x(indice)} cy={y(fila.enviadas)} r="4" className="sent-dot"><title>{`${fila.detalle} · ${numero(fila.enviadas)} enviadas`}</title></circle><circle cx={x(indice)} cy={y(fila.devueltas)} r="4" className={fila.consolidada ? "return-dot complete" : "return-dot pending"}><title>{`${fila.detalle} · ${numero(fila.devueltas)} devueltas · ${fila.consolidada ? "consolidado" : "pendiente"}`}</title></circle><text x={x(indice)} y={alto-16} textAnchor="middle">{fila.etiqueta}</text></g>)}</svg></div>
}

function GraficoPorcentaje({ datos, agrupacion }: { datos: FilaGrafico[]; agrupacion: AgrupacionDashboard }) {
  const ancho = 690, alto = 280, izquierda = 48, derecha = 20, arriba = 20, abajo = 46
  const anchoUtil = ancho - izquierda - derecha, altoUtil = alto - arriba - abajo
  const maximo = Math.max(10, ...datos.map((fila) => fila.porcentaje ?? 0))
  const x = (indice: number) => izquierda + (datos.length === 1 ? anchoUtil / 2 : indice / (datos.length - 1) * anchoUtil)
  const y = (valor: number) => arriba + altoUtil - valor / maximo * altoUtil
  return <div className="dd-svg"><svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Porcentaje de devolución por ${ETIQUETAS_AGRUPACION[agrupacion].toLocaleLowerCase("es-EC")}`}>{[0,.25,.5,.75,1].map((tramo) => <g key={tramo}><line x1={izquierda} x2={ancho-derecha} y1={y(maximo*tramo)} y2={y(maximo*tramo)} className="grid"/><text x={izquierda-7} y={y(maximo*tramo)+4} textAnchor="end">{(maximo*tramo).toFixed(1)}%</text></g>)}<line x1={izquierda} x2={ancho-derecha} y1={y(8)} y2={y(8)} className="target"/>{datos.slice(1).map((fila, indice) => { const anterior = datos[indice]; if (fila.porcentaje === null || anterior.porcentaje === null) return null; const pendiente = !fila.consolidada || !anterior.consolidada; return <line key={fila.semana} x1={x(indice)} y1={y(anterior.porcentaje)} x2={x(indice+1)} y2={y(fila.porcentaje)} className={pendiente ? "rate-line pending" : "rate-line complete"}/> })}{datos.map((fila, indice) => <g key={fila.semana}>{fila.porcentaje !== null && <circle cx={x(indice)} cy={y(fila.porcentaje)} r="4" className={!fila.consolidada ? "rate-dot pending" : fila.porcentaje <= 8 ? "rate-dot good" : "rate-dot bad"}><title>{`${fila.detalle} · ${formatoTasa(fila.porcentaje)} · ${fila.consolidada ? "consolidado" : "provisional"}`}</title></circle>}<text x={x(indice)} y={alto-15} textAnchor="middle">{fila.etiqueta}</text></g>)}</svg><div className="dd-chart-note"><span className="target-note">— Meta 8%</span><span className="pending">● Azul = provisional</span></div></div>
}

function Ranking({ titulo, filas }: { titulo: string; filas: FilaRanking[] }) {
  const maximo = Math.max(1, ...filas.map((fila) => fila.devueltas))
  return <article className="dd-panel dd-ranking"><div className="dd-panel-heading"><div><span>PRINCIPALES IMPACTOS</span><h3>{titulo}</h3></div></div>{filas.length === 0 ? <div className="dd-empty compact">No hay devoluciones para este filtro.</div> : <div>{filas.map((fila, indice) => <article key={fila.clave}><b>{String(indice+1).padStart(2,"0")}</b><div className="dd-rank-name"><strong>{fila.nombre}</strong><small>{fila.secundario}</small><i><span style={{ width: `${Math.max(2, fila.devueltas / maximo * 100)}%` }}/></i></div><div className="dd-rank-value"><strong>{numero(fila.devueltas)} Unid.</strong><small>{formatoTasa(fila.porcentaje)} consolidado</small></div></article>)}</div>}</article>
}

const css = `
  .dd-dashboard{--dd-bg:#090c12;--dd-panel:#111722;--dd-panel2:#171e29;--dd-line:#26303d;--dd-text:#f7f9fc;--dd-muted:#8f9aaa;--dd-cyan:#19d8f2;--dd-magenta:#ff1688;--dd-green:#5fff75;box-sizing:border-box;width:100%;padding:22px;border:1px solid #252d39;border-radius:14px;background:radial-gradient(circle at 8% 0%,#182836 0,transparent 30%),radial-gradient(circle at 100% 10%,#321024 0,transparent 32%),var(--dd-bg);color:var(--dd-text);box-shadow:0 18px 40px rgba(32,21,19,.16)}
  .dd-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:16px}.dd-heading>div>span,.dd-panel-heading>div>span{color:var(--dd-cyan);font-size:9px;font-weight:950;letter-spacing:1.2px}.dd-heading h2{margin:4px 0;color:#fff;font-size:23px}.dd-heading p{margin:0;color:var(--dd-muted);font-size:11px}.dd-heading>button{min-height:39px;padding:0 14px;border:1px solid #354150;border-radius:8px;background:#151c27;color:#dbe4ed;font-size:10px;font-weight:900;cursor:pointer}
  .dd-filters{display:grid;grid-template-columns:minmax(320px,1.45fr) minmax(220px,.7fr) minmax(250px,.85fr);align-items:stretch;gap:10px;margin-bottom:13px;padding:13px;border:1px solid var(--dd-line);border-radius:10px;background:rgba(16,22,32,.92)}.dd-filters>label,.dd-filter-title>span{color:#9aa7b7;font-size:9px;font-weight:900;text-transform:uppercase}.dd-filters select{display:block;width:100%;min-height:39px;box-sizing:border-box;margin-top:5px;padding:7px 9px;border:1px solid #354150!important;border-radius:7px;background:#151c27!important;color:#dbe4ed!important;-webkit-text-fill-color:#dbe4ed!important}.dd-client-filter{min-width:0}.dd-filter-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}.dd-filter-title small{color:var(--dd-cyan);font-size:8px;font-weight:900}.dd-client-options{display:flex;flex-wrap:wrap;gap:6px;max-height:120px;overflow-y:auto;padding-right:3px;scrollbar-width:thin;scrollbar-color:#3a4858 #111722}.dd-client-options label{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:4px 8px;border:1px solid #293441;border-radius:6px;background:#181f2a;color:#cbd4df;font-size:9px;cursor:pointer}.dd-client-options label.active{border-color:var(--dd-cyan);background:linear-gradient(90deg,rgba(25,216,242,.18),rgba(255,22,136,.06));color:#fff}.dd-client-options input{width:13px!important;height:13px!important;margin:0!important;accent-color:var(--dd-cyan);background:transparent!important}.dd-sku-filter{min-width:0}.dd-period-label{display:flex;flex-direction:column;justify-content:center;padding:10px 12px;border:1px solid #293441;border-radius:8px;background:#151c27}.dd-period-label span{color:#7f8c9c;font-size:8px;font-weight:900;text-transform:uppercase}.dd-period-label strong{margin-top:5px;color:#e6edf5;font-size:11px}
  .dd-life-rule{margin:-3px 0 14px;padding:11px 13px;border-left:4px solid var(--dd-cyan);border-radius:7px;background:rgba(25,216,242,.08);color:#aeb9c6;font-size:10px;line-height:1.5}.dd-life-rule strong{color:var(--dd-cyan)}
  .dd-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:15px}.dd-kpi{min-width:0;padding:14px;border:1px solid var(--dd-line);border-top:3px solid #667383;border-radius:9px;background:linear-gradient(145deg,#171e29,#101620)}.dd-kpi.good{border-top-color:var(--dd-green)}.dd-kpi.bad{border-top-color:var(--dd-magenta)}.dd-kpi.pending{border-top-color:#4f8cff}.dd-kpi>span{display:block;color:#8996a7;font-size:8px;font-weight:950;letter-spacing:.4px;text-transform:uppercase}.dd-kpi>strong{display:block;margin:7px 0 3px;color:#fff;font-size:clamp(17px,1.7vw,23px);line-height:1.08;white-space:nowrap}.dd-kpi>small{color:#738194;font-size:8px}
  .dd-panel{margin-bottom:14px;padding:17px;border:1px solid var(--dd-line);border-radius:10px;background:rgba(15,21,31,.94);box-shadow:0 5px 18px rgba(0,0,0,.16)}.dd-panel-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:15px;margin-bottom:10px}.dd-panel-heading h3{margin:3px 0 0;color:#f4f7fb;font-size:17px}.dd-panel-heading>small{color:#7f8c9c;font-size:9px}.dd-legend,.dd-chart-note{display:flex;flex-wrap:wrap;gap:13px;font-size:9px;font-weight:900}.dd-legend .sent{color:var(--dd-cyan)}.dd-legend .complete{color:var(--dd-magenta)}.dd-legend .pending,.dd-chart-note .pending{color:#4f8cff}.dd-svg{width:100%;overflow-x:auto}.dd-svg svg{display:block;width:100%;min-width:560px}.dd-svg text{fill:#7f8c9c;font-size:9px}.dd-svg .grid{stroke:#2c3745;stroke-width:1}.sent-line{fill:none;stroke:var(--dd-cyan);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.return-line,.rate-line{stroke-width:3;stroke-linecap:round}.return-line.complete,.rate-line.complete{stroke:var(--dd-magenta)}.return-line.pending,.rate-line.pending{stroke:#4f8cff;stroke-dasharray:7 5}.sent-dot,.return-dot,.rate-dot{stroke:#0f151f;stroke-width:2}.sent-dot{fill:var(--dd-cyan)}.return-dot.complete{fill:var(--dd-magenta)}.return-dot.pending,.rate-dot.pending{fill:#4f8cff}.rate-dot.good{fill:var(--dd-green)}.rate-dot.bad{fill:var(--dd-magenta)}.target{stroke:var(--dd-green);stroke-width:1.5;stroke-dasharray:6 5}.dd-chart-note{justify-content:center;margin-top:4px}.target-note{color:var(--dd-green)}
  .dd-two-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.dd-current-reading{min-height:310px}.dd-comparison{display:grid;grid-template-columns:1fr 1fr;gap:10px}.dd-comparison>div{padding:12px;border:1px solid #293441;border-radius:7px;background:#151c27}.dd-comparison span{display:block;color:#7f8c9c;font-size:8px;font-weight:950;text-transform:uppercase}.dd-comparison strong{display:block;margin-top:5px;color:#fff;font-size:18px}.dd-comparison p{grid-column:1/-1;margin:3px 0 0;padding:10px;border-radius:6px;background:#151c27;font-size:11px;font-weight:850}.good{color:var(--dd-green)!important}.bad{color:#ff5b78!important}
  .dd-ranking>div:last-child{display:flex;flex-direction:column;gap:7px}.dd-ranking article{display:grid;grid-template-columns:27px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #26303d}.dd-ranking article>b{color:#596778;font-size:10px}.dd-rank-name{min-width:0}.dd-rank-name>strong,.dd-rank-name>small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dd-rank-name>strong{color:#e3e9f0;font-size:11px}.dd-rank-name>small{margin-top:2px;color:#738194;font-size:8px}.dd-rank-name i{display:block;height:4px;margin-top:6px;border-radius:9px;background:#26303d;overflow:hidden}.dd-rank-name i span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--dd-magenta),var(--dd-cyan))}.dd-rank-value{text-align:right}.dd-rank-value strong,.dd-rank-value small{display:block}.dd-rank-value strong{color:#edf3f8;font-size:10px}.dd-rank-value small{margin-top:3px;color:#7f8c9c;font-size:8px}
  .dd-table-wrap{overflow:auto;border:1px solid #293441;border-radius:8px}.dd-table-wrap table{width:100%;border-collapse:collapse}.dd-table-wrap th{padding:9px;background:#151c27;color:#95a2b2;font-size:8px;text-align:right;text-transform:uppercase}.dd-table-wrap th:first-child,.dd-table-wrap th:nth-child(2){text-align:left}.dd-table-wrap td{padding:9px;border-top:1px solid #26303d;color:#cbd4df;font-size:10px;text-align:right;white-space:nowrap}.dd-table-wrap td:first-child,.dd-table-wrap td:nth-child(2){text-align:left}.dd-table-wrap tr.pending{background:rgba(79,140,255,.07)}.dd-table-wrap strong.pending{color:#6aa0ff}.dd-status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:900}.dd-status.complete{background:rgba(95,255,117,.12);color:var(--dd-green)}.dd-status.pending{background:rgba(79,140,255,.13);color:#7facff}.dd-empty{padding:40px 18px;border:1px dashed #344151;border-radius:9px;color:#8592a3;text-align:center}.dd-empty.compact{padding:25px 12px}
  @media(max-width:1180px){.dd-filters{grid-template-columns:1fr 1fr}.dd-client-filter{grid-column:1/-1}.dd-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:760px){.dd-dashboard{padding:14px}.dd-heading{flex-direction:column}.dd-heading>button{width:100%}.dd-filters,.dd-kpis,.dd-two-columns{grid-template-columns:1fr}.dd-client-filter{grid-column:auto}.dd-client-options{max-height:180px}.dd-panel{padding:13px}.dd-current-reading{min-height:0}.dd-panel-heading{align-items:flex-start;flex-direction:column}.dd-ranking article{grid-template-columns:23px minmax(0,1fr)}.dd-rank-value{grid-column:2;text-align:left}}
`
