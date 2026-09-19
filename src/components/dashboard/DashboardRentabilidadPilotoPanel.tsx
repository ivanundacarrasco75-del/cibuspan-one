import { useEffect, useMemo, useRef, useState } from "react"
import type { DevolucionListadoDb } from "../../repositories/devolucionRepository"
import type { VentaDiariaDb } from "../../repositories/ventasRepository"

const CIAN = "#19d8f2"
const MAGENTA = "#ff1688"
const VERDE = "#5fff75"
const COLORES = [CIAN, MAGENTA, VERDE, "#ffd166", "#a78bfa", "#fb7185", "#60a5fa", "#f97316"]

type AgrupacionDashboard = "DIA" | "SEMANA" | "MES" | "TRIMESTRE" | "SEMESTRE"

export type RentabilidadPilotoDetalle = {
  key: string
  clienteId: string
  cliente: string
  productoId: string
  codigo: string
  sku: string
  unidadesDespachadas: number
  unidadesDevueltas: number
  ventaFacturada: number
  valorDevoluciones: number
  ventasNetas: number
  costoMateriales: number | null
  manoObraDirecta: number
  transporte: number
  gastosAsignados: number
  ebitdaEstimado: number | null
  margenEbitda: number | null
  completo: boolean
}

type PuntoSerie = { punto: string; valor: number | null }
type SerieGrafico = { id: string; nombre: string; color: string; puntos: PuntoSerie[] }

type EscenarioCargado = {
  id: string
  etiqueta: string
  clientes: number
  skus: number
  descuento: number
  volumen: number
  devolucion: number
  objetivo: number
  ventaNeta: number
  margenBruto: number
  ebitda: number
  margenEbitda: number
  cumple: boolean
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

function clienteClave(nombre: string | null | undefined) {
  const valor = normalizar(nombre)
  if (valor.includes("FAVORITA") || valor.includes("SUPERMAXI") || valor.includes("MEGAMAXI")) {
    return "CORPORACION FAVORITA"
  }
  if (valor.includes("SANTAMARIA") || valor.includes("SANTA MARIA") || valor.includes("MEGA SANTA")) {
    return "MEGA SANTAMARIA"
  }
  if (valor.includes("ROSADO") || valor.includes("COMISARIATO")) return "CORPORACION EL ROSADO"
  if (valor.includes("TUTI")) return "TUTI"
  return valor || "SIN CLIENTE"
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
  const fecha = new Date(`${fechaIso}T12:00:00`)
  const dia = fecha.getDay()
  fecha.setDate(fecha.getDate() - (dia === 0 ? 6 : dia - 1))
  return fechaIsoLocal(fecha)
}

function claveAgrupacion(fecha: string, agrupacion: AgrupacionDashboard) {
  if (agrupacion === "DIA") return fecha
  if (agrupacion === "SEMANA") return inicioSemana(fecha)
  if (agrupacion === "MES") return `${fecha.slice(0, 7)}-01`
  const [anio, mes] = fecha.split("-").map(Number)
  const mesInicial = agrupacion === "TRIMESTRE"
    ? Math.floor((mes - 1) / 3) * 3
    : mes <= 6 ? 0 : 6
  return fechaIsoLocal(new Date(anio, mesInicial, 1))
}

function puntosPeriodo(desde: string, hasta: string, agrupacion: AgrupacionDashboard) {
  const puntos: string[] = []
  let actual = agrupacion === "SEMANA" ? inicioSemana(desde) : desde
  while (actual <= hasta || (agrupacion === "SEMANA" && actual <= inicioSemana(hasta))) {
    const clave = claveAgrupacion(actual, agrupacion)
    if (puntos[puntos.length - 1] !== clave) puntos.push(clave)
    const fecha = new Date(`${actual}T12:00:00`)
    if (agrupacion === "DIA") fecha.setDate(fecha.getDate() + 1)
    else if (agrupacion === "SEMANA") fecha.setDate(fecha.getDate() + 7)
    else if (agrupacion === "MES") fecha.setMonth(fecha.getMonth() + 1, 1)
    else if (agrupacion === "TRIMESTRE") fecha.setMonth(fecha.getMonth() + 3, 1)
    else fecha.setMonth(fecha.getMonth() + 6, 1)
    actual = fechaIsoLocal(fecha)
  }
  return puntos
}

function etiquetaPunto(fechaIso: string, agrupacion: AgrupacionDashboard) {
  if (agrupacion === "DIA") return `${fechaIso.slice(8, 10)}/${fechaIso.slice(5, 7)}`
  if (agrupacion === "SEMANA") return `${fechaIso.slice(8, 10)}/${fechaIso.slice(5, 7)}`
  if (agrupacion === "MES") {
    return new Intl.DateTimeFormat("es-EC", { month: "short" })
      .format(new Date(`${fechaIso}T12:00:00`)).replace(".", "")
  }
  const [anio, mes] = fechaIso.split("-").map(Number)
  return agrupacion === "TRIMESTRE"
    ? `T${Math.floor((mes - 1) / 3) + 1} ${anio}`
    : `S${mes <= 6 ? 1 : 2} ${anio}`
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(valor) ? valor : 0)
}

function porcentaje(valor: number) {
  return `${Number.isFinite(valor) ? valor.toFixed(1) : "0.0"}%`
}

function numeroPositivo(valor: string, respaldo = 0) {
  const convertido = Number(valor)
  return Number.isFinite(convertido) ? convertido : respaldo
}

export default function DashboardRentabilidadPilotoPanel({
  detalle,
  ventas,
  devoluciones,
  fechaDesde,
  fechaHasta,
  agrupacion,
  costosSinAsignar,
  aviso,
}: {
  detalle: RentabilidadPilotoDetalle[]
  ventas: VentaDiariaDb[]
  devoluciones: DevolucionListadoDb[]
  fechaDesde: string
  fechaHasta: string
  agrupacion: AgrupacionDashboard
  costosSinAsignar: number
  aviso: string
}) {
  const [clientesSeleccionados, setClientesSeleccionados] = useState<string[]>([])
  const [skusSeleccionados, setSkusSeleccionados] = useState<string[]>([])
  const [compararPor, setCompararPor] = useState<"SKU" | "CLIENTE">("SKU")
  const [metrica, setMetrica] = useState<"VENTA" | "MARGEN_BRUTO" | "EBITDA">("EBITDA")
  const [nombreEscenario, setNombreEscenario] = useState("")
  const [descuentoEscenario, setDescuentoEscenario] = useState("0")
  const [volumenEscenario, setVolumenEscenario] = useState("0")
  const [devolucionEscenario, setDevolucionEscenario] = useState("8")
  const [objetivoEscenario, setObjetivoEscenario] = useState("10")
  const [escenarios, setEscenarios] = useState<EscenarioCargado[]>([])
  const [mensaje, setMensaje] = useState("")
  const numeroEscenarioRef = useRef(1)

  const catalogos = useMemo(() => {
    const clientes = new Map<string, { id: string; nombre: string; venta: number }>()
    const skus = new Map<string, { id: string; nombre: string; codigo: string; venta: number }>()
    detalle.forEach((fila) => {
      const clienteId = clienteClave(fila.cliente)
      const productoId = normalizar(fila.codigo)
      const cliente = clientes.get(clienteId) ?? {
        id: clienteId,
        nombre: fila.cliente,
        venta: 0,
      }
      cliente.venta += fila.ventaFacturada
      clientes.set(clienteId, cliente)
      const sku = skus.get(productoId) ?? {
        id: productoId,
        nombre: fila.sku,
        codigo: fila.codigo,
        venta: 0,
      }
      sku.venta += fila.ventaFacturada
      skus.set(productoId, sku)
    })
    return {
      clientes: Array.from(clientes.values()).sort((a, b) => b.venta - a.venta),
      skus: Array.from(skus.values()).sort((a, b) => b.venta - a.venta),
    }
  }, [detalle])

  const claveClientes = catalogos.clientes.map((item) => item.id).join("|")
  const claveSkus = catalogos.skus.map((item) => item.id).join("|")
  useEffect(() => {
    setClientesSeleccionados((actuales) => {
      const validos = actuales.filter((id) => catalogos.clientes.some((item) => item.id === id))
      return validos.length > 0 ? validos : catalogos.clientes.map((item) => item.id)
    })
  }, [claveClientes, catalogos.clientes])
  useEffect(() => {
    setSkusSeleccionados((actuales) => {
      const validos = actuales.filter((id) => catalogos.skus.some((item) => item.id === id))
      return validos.length > 0 ? validos : catalogos.skus.slice(0, 4).map((item) => item.id)
    })
  }, [claveSkus, catalogos.skus])

  const seleccion = useMemo(() => {
    const clientesSet = new Set(clientesSeleccionados)
    const skusSet = new Set(skusSeleccionados)
    const filas = detalle.filter(
      (fila) =>
        clientesSet.has(clienteClave(fila.cliente)) &&
        skusSet.has(normalizar(fila.codigo)),
    )
    const completas = filas.filter((fila) => fila.completo)
    const ventaFacturada = completas.reduce((total, fila) => total + fila.ventaFacturada, 0)
    const devolucionesValor = completas.reduce((total, fila) => total + fila.valorDevoluciones, 0)
    const ventasNetas = completas.reduce((total, fila) => total + fila.ventasNetas, 0)
    const materiales = completas.reduce((total, fila) => total + Number(fila.costoMateriales ?? 0), 0)
    const mod = completas.reduce((total, fila) => total + fila.manoObraDirecta, 0)
    const transporte = completas.reduce((total, fila) => total + fila.transporte, 0)
    const gastos = completas.reduce((total, fila) => total + fila.gastosAsignados, 0)
    const unidades = completas.reduce((total, fila) => total + fila.unidadesDespachadas, 0)
    const unidadesDevueltas = completas.reduce((total, fila) => total + fila.unidadesDevueltas, 0)
    const margenBruto = ventasNetas - materiales - mod
    const ebitda = margenBruto - transporte - gastos
    return {
      filas,
      completas,
      ventaFacturada,
      devolucionesValor,
      ventasNetas,
      materiales,
      mod,
      transporte,
      gastos,
      unidades,
      unidadesDevueltas,
      margenBruto,
      ebitda,
      margenBrutoPorcentaje: ventasNetas > 0 ? margenBruto / ventasNetas * 100 : 0,
      margenEbitda: ventasNetas > 0 ? ebitda / ventasNetas * 100 : 0,
      tasaDevolucion: unidades > 0 ? unidadesDevueltas / unidades * 100 : 0,
    }
  }, [detalle, clientesSeleccionados, skusSeleccionados])

  useEffect(() => {
    setDevolucionEscenario(seleccion.tasaDevolucion.toFixed(1))
  }, [seleccion.tasaDevolucion])

  const evolucion = useMemo(() => {
    type Acumulado = {
      venta: number
      devolucion: number
      materiales: number
      mod: number
      transporte: number
      gastos: number
      unidades: number
    }
    const vacio = (): Acumulado => ({
      venta: 0,
      devolucion: 0,
      materiales: 0,
      mod: 0,
      transporte: 0,
      gastos: 0,
      unidades: 0,
    })
    const puntos = puntosPeriodo(fechaDesde, fechaHasta, agrupacion)
    const clientesSet = new Set(clientesSeleccionados)
    const skusSet = new Set(skusSeleccionados)
    type BaseCostos = {
      unidades: number
      materiales: number
      mod: number
      transporte: number
      gastos: number
    }
    const costosPorAlias = new Map<string, BaseCostos>()
    const costosPorSku = new Map<string, BaseCostos>()
    const preciosPorAlias = new Map<string, number>()
    const preciosPorSku = new Map<string, number>()
    const acumularCostos = (
      mapaCostos: Map<string, BaseCostos>,
      key: string,
      fila: RentabilidadPilotoDetalle,
    ) => {
      if (!fila.completo || fila.unidadesDespachadas <= 0) return
      const actual = mapaCostos.get(key) ?? {
        unidades: 0,
        materiales: 0,
        mod: 0,
        transporte: 0,
        gastos: 0,
      }
      actual.unidades += fila.unidadesDespachadas
      actual.materiales += Number(fila.costoMateriales ?? 0)
      actual.mod += fila.manoObraDirecta
      actual.transporte += fila.transporte
      actual.gastos += fila.gastosAsignados
      mapaCostos.set(key, actual)
    }
    detalle.forEach((fila) => {
      const skuKey = normalizar(fila.codigo)
      const aliasKey = `${clienteClave(fila.cliente)}|${skuKey}`
      acumularCostos(
        costosPorAlias,
        aliasKey,
        fila,
      )
      acumularCostos(costosPorSku, skuKey, fila)
      if (fila.unidadesDespachadas > 0 && fila.ventaFacturada > 0) {
        const precio = fila.ventaFacturada / fila.unidadesDespachadas
        preciosPorAlias.set(aliasKey, precio)
        if (!preciosPorSku.has(skuKey)) preciosPorSku.set(skuKey, precio)
      }
    })
    const mapa = new Map<string, Acumulado>()
    const obtener = (grupo: string, punto: string) => {
      const key = `${grupo}|${punto}`
      const actual = mapa.get(key) ?? vacio()
      mapa.set(key, actual)
      return actual
    }

    ventas.forEach((venta) => {
      if (venta.fecha_emision < fechaDesde || venta.fecha_emision > fechaHasta) return
      const clienteId = clienteClave(venta.cliente_nombre)
      const productoId = normalizar(venta.sku)
      if (!clientesSet.has(clienteId) || !skusSet.has(productoId)) return
      const grupo = compararPor === "SKU" ? productoId : clienteId
      const actual = obtener(grupo, claveAgrupacion(venta.fecha_emision, agrupacion))
      const unidades = Number(venta.cantidad ?? 0)
      const baseCostos = costosPorAlias.get(`${clienteId}|${productoId}`)
        ?? costosPorSku.get(productoId)
      actual.venta += Number(venta.total_sin_impuestos ?? 0)
      actual.unidades += unidades
      if (baseCostos && baseCostos.unidades > 0) {
        actual.materiales += unidades * baseCostos.materiales / baseCostos.unidades
        actual.mod += unidades * baseCostos.mod / baseCostos.unidades
        actual.transporte += unidades * baseCostos.transporte / baseCostos.unidades
        actual.gastos += unidades * baseCostos.gastos / baseCostos.unidades
      }
    })

    devoluciones.forEach((devolucion) => {
      const clienteId = clienteClave(devolucion.cliente?.nombre)
      ;(devolucion.detalles ?? []).forEach((item) => {
        if (!item.producto) return
        const productoId = normalizar(item.producto.codigo)
        if (!clientesSet.has(clienteId) || !skusSet.has(productoId)) return
        const fechaOrigen = Number(item.vida_efectiva_dias ?? 0) > 0
          ? sumarDias(devolucion.fecha_devolucion, -Number(item.vida_efectiva_dias))
          : item.semana_origen_inicio
        if (fechaOrigen < fechaDesde || fechaOrigen > fechaHasta) return
        const grupo = compararPor === "SKU" ? productoId : clienteId
        const actual = obtener(grupo, claveAgrupacion(fechaOrigen, agrupacion))
        const precio = preciosPorAlias.get(`${clienteId}|${productoId}`)
          ?? preciosPorSku.get(productoId)
          ?? 0
        actual.devolucion += item.valor_total_documento == null
          ? Number(item.unidades ?? 0) * precio
          : Number(item.valor_total_documento)
      })
    })

    const grupos = compararPor === "SKU"
      ? catalogos.skus.filter((item) => skusSet.has(item.id))
      : catalogos.clientes.filter((item) => clientesSet.has(item.id))
    const series: SerieGrafico[] = grupos.slice(0, 8).map((grupo, indice) => ({
      id: grupo.id,
      nombre: grupo.nombre,
      color: COLORES[indice % COLORES.length],
      puntos: puntos.map((punto) => {
        const actual = mapa.get(`${grupo.id}|${punto}`)
        if (!actual || actual.venta <= 0) return { punto, valor: null }
        const ventaNeta = actual.venta - actual.devolucion
        const margenBruto = ventaNeta - actual.materiales - actual.mod
        const ebitda = margenBruto - actual.transporte - actual.gastos
        const valor = metrica === "VENTA"
          ? ventaNeta
          : metrica === "MARGEN_BRUTO"
            ? ventaNeta > 0 ? margenBruto / ventaNeta * 100 : 0
            : ventaNeta > 0 ? ebitda / ventaNeta * 100 : 0
        return { punto, valor }
      }),
    }))
    return { puntos, series, gruposOmitidos: Math.max(0, grupos.length - 8) }
  }, [
    detalle,
    ventas,
    devoluciones,
    fechaDesde,
    fechaHasta,
    agrupacion,
    compararPor,
    metrica,
    clientesSeleccionados,
    skusSeleccionados,
    catalogos,
  ])

  function alternar(
    id: string,
    actualizar: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    actualizar((actuales) =>
      actuales.includes(id)
        ? actuales.filter((actual) => actual !== id)
        : [...actuales, id],
    )
  }

  function cargarEscenario() {
    if (seleccion.completas.length === 0 || seleccion.unidades <= 0) {
      setMensaje("Selecciona al menos un cliente y un SKU con costo completo.")
      return
    }
    const descuento = Math.max(0, Math.min(100, numeroPositivo(descuentoEscenario)))
    const variacionVolumen = Math.max(-100, numeroPositivo(volumenEscenario))
    const devolucion = Math.max(0, Math.min(100, numeroPositivo(devolucionEscenario)))
    const objetivo = Math.max(0, Math.min(99, numeroPositivo(objetivoEscenario, 10)))
    const factor = Math.max(0, 1 + variacionVolumen / 100)
    const ventaBruta = seleccion.ventaFacturada * factor
    const ventaNeta = Math.max(
      0,
      ventaBruta * (1 - descuento / 100 - devolucion / 100),
    )
    const materiales = seleccion.materiales * factor
    const mod = seleccion.mod * factor
    const transporte = seleccion.transporte * factor
    const gastos = seleccion.gastos
    const margenBruto = ventaNeta - materiales - mod
    const ebitda = margenBruto - transporte - gastos
    const margenEbitda = ventaNeta > 0 ? ebitda / ventaNeta * 100 : 0
    const etiqueta = nombreEscenario.trim() || `Escenario ${numeroEscenarioRef.current}`
    numeroEscenarioRef.current += 1
    setEscenarios((actuales) => [...actuales, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      etiqueta,
      clientes: clientesSeleccionados.length,
      skus: skusSeleccionados.length,
      descuento,
      volumen: variacionVolumen,
      devolucion,
      objetivo,
      ventaNeta,
      margenBruto,
      ebitda,
      margenEbitda,
      cumple: margenEbitda >= objetivo,
    }])
    setNombreEscenario("")
    setMensaje(`${etiqueta} cargado.`)
  }

  const mejorEscenario = useMemo(() => {
    const cumplen = escenarios.filter((item) => item.cumple)
    const candidatas = cumplen.length > 0 ? cumplen : escenarios
    return [...candidatas].sort((a, b) => b.ebitda - a.ebitda)[0] ?? null
  }, [escenarios])

  return (
    <section className="rp-shell">
      <style>{css}</style>
      <header className="rp-header">
        <div>
          <span>VISTA PILOTO · RENTABILIDAD COMERCIAL</span>
          <h2>Evolución y escenarios</h2>
          <p>Selecciona varios clientes y SKU para analizar su rentabilidad conjunta o compararlos.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setClientesSeleccionados(catalogos.clientes.map((item) => item.id))
            setSkusSeleccionados(catalogos.skus.slice(0, 4).map((item) => item.id))
          }}
        >
          Restablecer selección
        </button>
      </header>

      {(aviso || costosSinAsignar > 0) && (
        <div className="rp-warning">
          {aviso || `${moneda(costosSinAsignar)} todavía no pudieron distribuirse en el periodo.`}
        </div>
      )}

      <div className="rp-layout">
        <aside className="rp-filters">
          <SelectorCasillas
            titulo="Clientes"
            opciones={catalogos.clientes}
            seleccionados={clientesSeleccionados}
            onAlternar={(id) => alternar(id, setClientesSeleccionados)}
            onPrincipales={() => setClientesSeleccionados(catalogos.clientes.map((item) => item.id))}
          />
          <SelectorCasillas
            titulo="SKU"
            opciones={catalogos.skus}
            seleccionados={skusSeleccionados}
            onAlternar={(id) => alternar(id, setSkusSeleccionados)}
            onPrincipales={() => setSkusSeleccionados(catalogos.skus.slice(0, 6).map((item) => item.id))}
          />
        </aside>

        <div className="rp-content">
          <section className="rp-kpis">
            <Kpi etiqueta="Ventas netas" valor={moneda(seleccion.ventasNetas)} tono="cyan" />
            <Kpi etiqueta="Margen bruto" valor={porcentaje(seleccion.margenBrutoPorcentaje)} tono="verde" />
            <Kpi etiqueta="EBITDA estimado" valor={moneda(seleccion.ebitda)} tono="magenta" />
            <Kpi etiqueta="Margen EBITDA" valor={porcentaje(seleccion.margenEbitda)} tono={seleccion.margenEbitda >= 10 ? "verde" : "magenta"} />
            <Kpi etiqueta="Devolución" valor={porcentaje(seleccion.tasaDevolucion)} tono={seleccion.tasaDevolucion <= 8 ? "verde" : "magenta"} />
          </section>

          <section className="rp-chart-card">
            <header>
              <div><span>EVOLUCIÓN EN EL TIEMPO</span><h3>Comparación seleccionada</h3></div>
              <div className="rp-chart-controls">
                <select value={compararPor} onChange={(e) => setCompararPor(e.target.value as "SKU" | "CLIENTE")}>
                  <option value="SKU">Comparar SKU</option>
                  <option value="CLIENTE">Comparar clientes</option>
                </select>
                <select value={metrica} onChange={(e) => setMetrica(e.target.value as typeof metrica)}>
                  <option value="VENTA">Ventas netas</option>
                  <option value="MARGEN_BRUTO">Margen bruto %</option>
                  <option value="EBITDA">Margen EBITDA %</option>
                </select>
              </div>
            </header>
            {evolucion.series.length === 0 ? (
              <div className="rp-empty">Selecciona información para generar el gráfico.</div>
            ) : (
              <GraficoLineas
                puntos={evolucion.puntos}
                series={evolucion.series}
                agrupacion={agrupacion}
                esMoneda={metrica === "VENTA"}
              />
            )}
            {evolucion.gruposOmitidos > 0 && (
              <small className="rp-chart-note">El gráfico muestra los primeros 8 seleccionados. Hay {evolucion.gruposOmitidos} adicionales incluidos en los indicadores.</small>
            )}
          </section>

          <section className="rp-planner">
            <header><span>PLANIFICACIÓN</span><h3>Escenario conjunto para la selección</h3><p>El volumen ajusta costos variables; los gastos generales se mantienen fijos.</p></header>
            <div className="rp-planner-fields">
              <label><span>Nombre</span><input value={nombreEscenario} onChange={(e) => setNombreEscenario(e.target.value)} placeholder="Ej. Promoción septiembre" /></label>
              <label><span>Descuento</span><div><input type="number" value={descuentoEscenario} onChange={(e) => setDescuentoEscenario(e.target.value)} /><b>%</b></div></label>
              <label><span>Variación de volumen</span><div><input type="number" value={volumenEscenario} onChange={(e) => setVolumenEscenario(e.target.value)} /><b>%</b></div></label>
              <label><span>Devolución esperada</span><div><input type="number" value={devolucionEscenario} onChange={(e) => setDevolucionEscenario(e.target.value)} /><b>%</b></div></label>
              <label><span>Meta EBITDA</span><div><input type="number" value={objetivoEscenario} onChange={(e) => setObjetivoEscenario(e.target.value)} /><b>%</b></div></label>
              <button type="button" onClick={cargarEscenario}>Cargar escenario</button>
            </div>
            {mensaje && <small className="rp-message">{mensaje}</small>}
          </section>

          {escenarios.length > 0 && (
            <section className="rp-scenarios">
              <header>
                <div><span>PROPUESTAS GUARDADAS</span><h3>Comparación de escenarios</h3></div>
                <button type="button" onClick={() => setEscenarios([])}>Limpiar</button>
              </header>
              <div className="rp-scenario-table">
                <table>
                  <thead><tr><th>Escenario</th><th>Selección</th><th>Descuento</th><th>Volumen</th><th>Devolución</th><th>Venta neta</th><th>EBITDA</th><th>Margen</th><th>Resultado</th><th /></tr></thead>
                  <tbody>{escenarios.map((item) => (
                    <tr key={item.id} className={item.id === mejorEscenario?.id ? "best" : ""}>
                      <td><strong>{item.etiqueta}</strong></td>
                      <td>{item.clientes} clientes · {item.skus} SKU</td>
                      <td>{porcentaje(item.descuento)}</td>
                      <td>{item.volumen > 0 ? "+" : ""}{porcentaje(item.volumen)}</td>
                      <td>{porcentaje(item.devolucion)}</td>
                      <td>{moneda(item.ventaNeta)}</td>
                      <td>{moneda(item.ebitda)}</td>
                      <td>{porcentaje(item.margenEbitda)}</td>
                      <td><em className={item.cumple ? "ok" : "no"}>{item.id === mejorEscenario?.id ? item.cumple ? "Mejor EBITDA" : "Mejor disponible" : item.cumple ? "Cumple" : "No cumple"}</em></td>
                      <td><button type="button" onClick={() => setEscenarios((actuales) => actuales.filter((actual) => actual.id !== item.id))}>Eliminar</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <GraficoEscenarios escenarios={escenarios} mejorId={mejorEscenario?.id ?? null} />
            </section>
          )}
        </div>
      </div>
    </section>
  )
}

function SelectorCasillas({
  titulo,
  opciones,
  seleccionados,
  onAlternar,
  onPrincipales,
}: {
  titulo: string
  opciones: { id: string; nombre: string; venta: number; codigo?: string }[]
  seleccionados: string[]
  onAlternar: (id: string) => void
  onPrincipales: () => void
}) {
  return (
    <section className="rp-selector">
      <header><div><span>FILTRO MÚLTIPLE</span><h3>{titulo}</h3></div><button type="button" onClick={onPrincipales}>{titulo === "Clientes" ? "Todos" : "Top 6"}</button></header>
      <div>{opciones.map((opcion) => (
        <label key={opcion.id} className={seleccionados.includes(opcion.id) ? "active" : ""}>
          <input type="checkbox" checked={seleccionados.includes(opcion.id)} onChange={() => onAlternar(opcion.id)} />
          <span><strong>{opcion.nombre}</strong><small>{opcion.codigo || moneda(opcion.venta)}</small></span>
        </label>
      ))}</div>
    </section>
  )
}

function Kpi({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono: "cyan" | "magenta" | "verde" }) {
  return <article className={`rp-kpi ${tono}`}><span>{etiqueta}</span><strong>{valor}</strong></article>
}

function GraficoLineas({
  puntos,
  series,
  agrupacion,
  esMoneda,
}: {
  puntos: string[]
  series: SerieGrafico[]
  agrupacion: AgrupacionDashboard
  esMoneda: boolean
}) {
  const ancho = Math.max(820, 100 + puntos.length * 58)
  const alto = 340
  const margen = { izquierda: 62, derecha: 22, arriba: 25, abajo: 58 }
  const valores = series.flatMap((serie) => serie.puntos.map((item) => item.valor).filter((valor): valor is number => valor !== null))
  const minimo = Math.min(esMoneda ? 0 : -10, ...valores, 0)
  const maximo = Math.max(esMoneda ? 1 : 10, ...valores)
  const amplitud = Math.max(1, maximo - minimo)
  const x = (indice: number) => margen.izquierda + indice * ((ancho - margen.izquierda - margen.derecha) / Math.max(1, puntos.length - 1))
  const y = (valor: number) => margen.arriba + (maximo - valor) / amplitud * (alto - margen.arriba - margen.abajo)
  const ejeCero = y(0)
  const camino = (serie: SerieGrafico) => {
    let activo = false
    return serie.puntos.map((item, indice) => {
      if (item.valor === null) {
        activo = false
        return ""
      }
      const comando = activo ? "L" : "M"
      activo = true
      return `${comando}${x(indice)},${y(item.valor)}`
    }).join(" ")
  }
  return (
    <div className="rp-line-chart">
      <div className="rp-legend">{series.map((serie) => <span key={serie.id}><i style={{ background: serie.color }} />{serie.nombre}</span>)}</div>
      <div className="rp-chart-scroll"><svg viewBox={`0 0 ${ancho} ${alto}`} style={{ minWidth: ancho }} role="img" aria-label="Evolución de rentabilidad">
        {Array.from({ length: 6 }, (_, indice) => {
          const valor = maximo - amplitud * indice / 5
          return <g key={indice}><line x1={margen.izquierda} y1={y(valor)} x2={ancho - margen.derecha} y2={y(valor)} stroke="#283442" /><text x={margen.izquierda - 8} y={y(valor) + 4} textAnchor="end">{esMoneda ? `$${Math.round(valor / 1000)}k` : `${valor.toFixed(0)}%`}</text></g>
        })}
        <line x1={margen.izquierda} y1={ejeCero} x2={ancho - margen.derecha} y2={ejeCero} stroke="#697586" />
        {puntos.map((punto, indice) => <text key={punto} x={x(indice)} y={alto - 22} textAnchor="middle">{etiquetaPunto(punto, agrupacion)}</text>)}
        {series.map((serie) => <g key={serie.id}><path d={camino(serie)} fill="none" stroke={serie.color} strokeWidth="3" />{serie.puntos.map((item, indice) => item.valor === null ? null : <circle key={item.punto} cx={x(indice)} cy={y(item.valor)} r="4" fill={serie.color}><title>{serie.nombre}: {esMoneda ? moneda(item.valor) : porcentaje(item.valor)}</title></circle>)}</g>)}
      </svg></div>
    </div>
  )
}

function GraficoEscenarios({ escenarios, mejorId }: { escenarios: EscenarioCargado[]; mejorId: string | null }) {
  const maximo = Math.max(10, ...escenarios.map((item) => Math.abs(item.margenEbitda)))
  return <div className="rp-scenario-chart">{escenarios.map((item) => (
    <article key={item.id} className={item.id === mejorId ? "best" : ""}>
      <strong>{item.etiqueta}</strong>
      <div><i className={item.margenEbitda >= 0 ? "positive" : "negative"} style={{ width: `${Math.max(2, Math.abs(item.margenEbitda) / maximo * 100)}%` }} /></div>
      <span>{porcentaje(item.margenEbitda)} · {moneda(item.ebitda)}</span>
    </article>
  ))}</div>
}

const css = `
  .rp-shell{--bg:#090c12;--panel:#111722;--line:#26303d;--text:#f7f9fc;--muted:#8f9aaa;margin-top:2px;padding:22px;border:1px solid #252d39;border-radius:14px;background:radial-gradient(circle at 8% 0%,#182836 0,transparent 30%),radial-gradient(circle at 100% 10%,#321024 0,transparent 32%),var(--bg);color:var(--text);box-shadow:0 18px 40px rgba(32,21,19,.16)}
  .rp-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.rp-header span,.rp-selector header span,.rp-chart-card header span,.rp-planner header>span,.rp-scenarios header span{color:${CIAN};font-size:8px;font-weight:950;letter-spacing:1.2px}.rp-header h2{margin:4px 0 3px;color:#fff;font-size:25px}.rp-header p,.rp-planner header p{margin:0;color:var(--muted);font-size:10px}.rp-header>button,.rp-selector header button,.rp-scenarios>header>button{min-height:34px;padding:0 11px;border:1px solid #354150;border-radius:7px;background:#151c27;color:#dbe4ed;font-size:8px;font-weight:900;cursor:pointer}.rp-warning{margin-bottom:13px;padding:10px 12px;border-left:4px solid #ffd166;border-radius:7px;background:#2c2516;color:#f7d878;font-size:9px}.rp-layout{display:grid;grid-template-columns:245px minmax(0,1fr);gap:16px}.rp-filters{display:grid;align-content:start;gap:12px}.rp-selector{padding:12px;border:1px solid var(--line);border-radius:10px;background:rgba(16,22,32,.92)}.rp-selector header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}.rp-selector h3,.rp-chart-card h3,.rp-planner h3,.rp-scenarios h3{margin:2px 0 0;color:#f4f7fb;font-size:13px}.rp-selector>div{display:grid;gap:5px;max-height:275px;padding-right:3px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#3a4858 #111722}.rp-selector label{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:center;gap:7px;min-height:40px;padding:6px 8px;border:1px solid #293441;border-radius:6px;background:#181f2a;color:#cbd4df;cursor:pointer}.rp-selector label.active{border-color:${CIAN};background:linear-gradient(90deg,rgba(25,216,242,.18),rgba(255,22,136,.06))}.rp-selector input{accent-color:${CIAN}}.rp-selector label>span{min-width:0;display:flex;flex-direction:column}.rp-selector strong{overflow:hidden;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.rp-selector small{margin-top:2px;color:#778596;font-size:7px}.rp-content{min-width:0}.rp-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-bottom:11px}.rp-kpi{min-width:0;padding:13px;border:1px solid var(--line);border-top:3px solid #667383;border-radius:8px;background:linear-gradient(145deg,#171e29,#101620)}.rp-kpi.cyan{border-top-color:${CIAN}}.rp-kpi.magenta{border-top-color:${MAGENTA}}.rp-kpi.verde{border-top-color:${VERDE}}.rp-kpi span{display:block;color:#8996a7;font-size:7px;font-weight:900;letter-spacing:.7px;text-transform:uppercase}.rp-kpi strong{display:block;margin-top:7px;overflow:hidden;color:#fff;font-size:clamp(15px,1.7vw,22px);text-overflow:ellipsis;white-space:nowrap}.rp-chart-card,.rp-planner,.rp-scenarios{padding:15px;border:1px solid var(--line);border-radius:10px;background:rgba(15,21,31,.95)}.rp-chart-card>header,.rp-scenarios>header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.rp-chart-controls{display:flex;gap:7px}.rp-chart-controls select,.rp-planner input{min-height:35px;padding:6px 9px;border:1px solid #344252;border-radius:6px;background:#171f2a;color:#e8edf3;font-size:9px}.rp-empty{min-height:260px;display:grid;place-items:center;color:#8390a0}.rp-legend{display:flex;flex-wrap:wrap;gap:10px;padding:2px 2px 9px}.rp-legend span{display:flex;align-items:center;gap:5px;color:#aab4c0;font-size:7px}.rp-legend i{width:8px;height:8px;border-radius:2px}.rp-chart-scroll{overflow-x:auto}.rp-chart-scroll svg{display:block;width:100%;height:auto}.rp-chart-scroll text{fill:#758295;font-size:8px}.rp-chart-note{display:block;margin-top:7px;color:#d7ad62;font-size:8px}.rp-planner{margin-top:11px}.rp-planner header{margin-bottom:11px}.rp-planner-fields{display:grid;grid-template-columns:1.4fr repeat(4,minmax(100px,.7fr)) auto;align-items:end;gap:8px}.rp-planner-fields label>span{display:block;margin-bottom:5px;color:#96a2b2;font-size:8px;font-weight:800}.rp-planner-fields label>div{position:relative}.rp-planner-fields input{width:100%;box-sizing:border-box}.rp-planner-fields label b{position:absolute;right:9px;top:10px;color:${CIAN};font-size:9px}.rp-planner-fields button{min-height:35px;padding:0 13px;border:0;border-radius:6px;background:linear-gradient(90deg,${MAGENTA},#bd176e);color:white;font-size:8px;font-weight:950;cursor:pointer}.rp-message{display:block;margin-top:8px;color:${CIAN};font-size:8px}.rp-scenarios{margin-top:11px}.rp-scenario-table{overflow-x:auto;border:1px solid #283442;border-radius:7px}.rp-scenario-table table{width:100%;min-width:1050px;border-collapse:collapse}.rp-scenario-table th{padding:8px;background:#151d28;color:#8f9aaa;text-align:left;font-size:7px}.rp-scenario-table td{padding:8px;border-top:1px solid #25303d;color:#d7dee7;font-size:8px;white-space:nowrap}.rp-scenario-table tr.best{background:#1c281e}.rp-scenario-table em{padding:4px 7px;border-radius:999px;font-style:normal;font-weight:900}.rp-scenario-table em.ok{background:rgba(95,255,117,.12);color:${VERDE}}.rp-scenario-table em.no{background:rgba(255,22,136,.12);color:#ff62ad}.rp-scenario-table td button{border:0;background:transparent;color:#ff7cad;font-size:8px;cursor:pointer}.rp-scenario-chart{display:grid;gap:8px;margin-top:12px}.rp-scenario-chart article{display:grid;grid-template-columns:150px minmax(0,1fr) 150px;align-items:center;gap:9px;padding:8px;border-radius:7px;background:#131a24}.rp-scenario-chart article.best{outline:1px solid ${VERDE}}.rp-scenario-chart strong,.rp-scenario-chart span{font-size:8px}.rp-scenario-chart div{height:8px;overflow:hidden;border-radius:999px;background:#27313e}.rp-scenario-chart i{display:block;height:100%;border-radius:inherit}.rp-scenario-chart i.positive{background:linear-gradient(90deg,${CIAN},${VERDE})}.rp-scenario-chart i.negative{background:${MAGENTA}}
  @media(max-width:1180px){.rp-layout{grid-template-columns:1fr}.rp-filters{grid-template-columns:1fr 1fr}.rp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.rp-planner-fields{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:720px){.rp-shell{padding:13px}.rp-header,.rp-chart-card>header,.rp-scenarios>header{flex-direction:column}.rp-header>button{align-self:stretch}.rp-filters{grid-template-columns:1fr}.rp-selector>div{max-height:190px}.rp-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.rp-chart-controls{width:100%;flex-direction:column}.rp-chart-controls select{width:100%}.rp-planner-fields{grid-template-columns:1fr}.rp-scenario-chart article{grid-template-columns:1fr}.rp-scenario-chart article span{text-align:right}}
`
