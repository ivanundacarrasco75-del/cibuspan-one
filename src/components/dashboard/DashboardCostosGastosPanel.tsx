import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabase"
import { obtenerResumenProduccionesRangoDb } from "../../repositories/produccionRepository"
import { obtenerVentasDiariasRangoDb } from "../../repositories/ventasRepository"
import { obtenerNominaMensualAreaDb } from "../../repositories/nominaRepository"

type Props = {
  cambiarPantalla: (pantalla: string) => void
}

type FilaFinanciera = {
  periodo: string
  ventas_facturadas: number
  devoluciones: number
  descuentos: number
  ventas_netas: number
  otros_ingresos: number
  costo_venta: number
  cif_en_costo_venta: number
  cif_operativo: number
  cif_total_informativo: number
  gasto_especifico_cliente: number
  gasto_general: number
  depreciaciones: number
  otros_fuera_ebitda: number
  margen_bruto_operativo: number
  contribucion: number
  ebitda: number
  margen_ebitda_pct: number | null
  clasificacion_pendiente: number
  cuentas_pendientes: number
  cuentas_sin_matriz: number
  valor_sin_matriz: number
}

type ProduccionResumen = {
  fecha_produccion_general: string
  total_unidades: number
}

type VentaResumen = {
  fecha_emision: string
  cantidad: number
}

type NominaResumen = {
  periodo: string
  area: string
  costo_empresa: number | null
}

type FilaDashboard = FilaFinanciera & {
  unidadesProducidas: number
  unidadesVendidas: number
  mod: number
  modUnidad: number | null
  cifUnidad: number | null
  costoVentaUnidadVendida: number | null
  gastoEspecificoUnidad: number | null
  gastoGeneralPct: number | null
  costoVentaPct: number | null
}

type RubroMensual = {
  periodo: string
  cuenta_codigo: string
  cuenta_nombre: string
  clasificacion_gerencial: string
  comportamiento: string
  incluida_costo_venta_contable: boolean
  impacta_ebitda: boolean
  origen: "ER" | "DETALLE"
  valor: number
}

type Desviacion = {
  clave: string
  cuentaCodigo: string
  cuentaNombre: string
  clasificacion: string
  comportamiento: string
  origen: "ER" | "DETALLE"
  anterior: number
  actual: number
  cambio: number
  cambioPct: number | null
  impactoEbitda: number
  impactaEbitda: boolean
}

type DetalleRubro = {
  id: string
  fecha_documento: string | null
  numero_documento: string | null
  proveedor: string | null
  concepto: string | null
  valor: number
  clasificacion_gerencial: string
  subcategoria: string | null
  area: string | null
  clientes_resumen: string | null
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const VINO = "#8F1D24"
const NARANJA = "#F7931E"

export default function DashboardCostosGastosPanel({ cambiarPantalla }: Props) {
  const [filas, setFilas] = useState<FilaDashboard[]>([])
  const [rubros, setRubros] = useState<RubroMensual[]>([])
  const [anio, setAnio] = useState(2026)
  const [anios, setAnios] = useState<number[]>([2026])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [periodosPendientes, setPeriodosPendientes] = useState<string[]>([])
  const [rubroSeleccionado, setRubroSeleccionado] = useState<Desviacion | null>(null)
  const [detalleRubro, setDetalleRubro] = useState<DetalleRubro[]>([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  useEffect(() => {
    void cargar()

    const refrescar = () => void cargar(anio)
    window.addEventListener("cibuspan-costos-refresh", refrescar)
    return () => window.removeEventListener("cibuspan-costos-refresh", refrescar)
  }, [anio])

  async function cargar(anioForzado?: number) {
    setCargando(true)
    setError("")
    setRubroSeleccionado(null)
    setDetalleRubro([])
    try {
      const { data: periodosDb, error: periodosError } = await supabase
        .from("fin_vw_costos_gastos_mensual")
        .select("periodo")
        .order("periodo", { ascending: true })
      if (periodosError) throw periodosError

      const aniosDb: number[] = Array.from(
        new Set<number>(
          ((periodosDb ?? []) as Array<{ periodo: string }>).map((fila) =>
            Number(String(fila.periodo).slice(0, 4)),
          ),
        ),
      ).filter((valor) => Number.isFinite(valor) && valor > 0).sort((a, b) => b - a)
      if (aniosDb.length > 0) setAnios(aniosDb)

      const anioObjetivo = anioForzado ?? (aniosDb.includes(anio) ? anio : aniosDb[0] ?? anio)
      if (anioObjetivo !== anio) setAnio(anioObjetivo)

      const desde = `${anioObjetivo}-01-01`
      const hasta = `${anioObjetivo}-12-31`

      const [finRes, cierresRes, rubrosRes, produccionDb, ventasDb, nominaDb] = await Promise.all([
        supabase
          .from("fin_vw_costos_gastos_mensual")
          .select("*")
          .gte("periodo", desde)
          .lte("periodo", hasta)
          .order("periodo", { ascending: true }),
        supabase
          .from("fin_vw_cierre_contable_mensual")
          .select("periodo,mes_cerrado")
          .gte("periodo", desde)
          .lte("periodo", hasta),
        supabase
          .from("fin_vw_costos_gastos_rubros_mensual")
          .select("*")
          .gte("periodo", desde)
          .lte("periodo", hasta),
        obtenerResumenProduccionesRangoDb(desde, hasta, true),
        obtenerVentasDiariasRangoDb(desde, hasta),
        obtenerNominaMensualAreaDb(),
      ])

      if (finRes.error) throw finRes.error
      if (cierresRes.error) throw cierresRes.error
      if (rubrosRes.error) throw rubrosRes.error

      const periodosCerrados = new Set(
        ((cierresRes.data ?? []) as Array<{ periodo: string; mes_cerrado: boolean }>)
          .filter((fila) => fila.mes_cerrado)
          .map((fila) => fila.periodo),
      )

      const produccion = produccionDb as unknown as ProduccionResumen[]
      const ventas = ventasDb as unknown as VentaResumen[]
      const nomina = nominaDb as unknown as NominaResumen[]

      const produccionMes = new Map<string, number>()
      produccion.forEach((fila) => {
        const periodo = `${fila.fecha_produccion_general.slice(0, 7)}-01`
        produccionMes.set(periodo, (produccionMes.get(periodo) ?? 0) + Number(fila.total_unidades ?? 0))
      })

      const ventasMes = new Map<string, number>()
      ventas.forEach((fila) => {
        const periodo = `${fila.fecha_emision.slice(0, 7)}-01`
        ventasMes.set(periodo, (ventasMes.get(periodo) ?? 0) + Number(fila.cantidad ?? 0))
      })

      const modMes = new Map<string, number>()
      nomina.forEach((fila) => {
        if (!fila.periodo.startsWith(String(anioObjetivo))) return
        if (fila.area !== "MANO_OBRA_DIRECTA") return
        modMes.set(fila.periodo, (modMes.get(fila.periodo) ?? 0) + Number(fila.costo_empresa ?? 0))
      })

      const dashboard = ((finRes.data ?? []) as FilaFinanciera[]).map((fila) => {
        const producidas = produccionMes.get(fila.periodo) ?? 0
        const vendidas = ventasMes.get(fila.periodo) ?? 0
        const mod = modMes.get(fila.periodo) ?? 0
        const ventasNetas = Number(fila.ventas_netas ?? 0)
        const cif = Number(fila.cif_total_informativo ?? 0)
        const costoVenta = Number(fila.costo_venta ?? 0)
        const gastoEspecifico = Number(fila.gasto_especifico_cliente ?? 0)
        const gastoGeneral = Number(fila.gasto_general ?? 0)

        return {
          ...fila,
          unidadesProducidas: producidas,
          unidadesVendidas: vendidas,
          mod,
          modUnidad: producidas > 0 ? mod / producidas : null,
          cifUnidad: producidas > 0 ? cif / producidas : null,
          costoVentaUnidadVendida: vendidas > 0 ? costoVenta / vendidas : null,
          gastoEspecificoUnidad: vendidas > 0 ? gastoEspecifico / vendidas : null,
          gastoGeneralPct: ventasNetas !== 0 ? (gastoGeneral / ventasNetas) * 100 : null,
          costoVentaPct: ventasNetas !== 0 ? (costoVenta / ventasNetas) * 100 : null,
        }
      })

      const cerradas = dashboard.filter(
        (fila) =>
          periodosCerrados.has(fila.periodo) &&
          Number(fila.clasificacion_pendiente) <= 0.02 &&
          Number(fila.cuentas_pendientes) === 0 &&
          Number(fila.cuentas_sin_matriz) === 0,
      )
      setFilas(cerradas)
      setRubros(
        ((rubrosRes.data ?? []) as RubroMensual[])
          .filter((fila) => periodosCerrados.has(fila.periodo))
          .map((fila) => ({ ...fila, valor: Number(fila.valor ?? 0) })),
      )
      setPeriodosPendientes(
        dashboard
          .filter((fila) => !cerradas.some((cerrada) => cerrada.periodo === fila.periodo))
          .map((fila) => fila.periodo),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo construir el dashboard de costos y gastos.")
    } finally {
      setCargando(false)
    }
  }

  const ultima = filas.at(-1) ?? null
  const anterior = filas.length > 1 ? filas.at(-2) ?? null : null

  const graficoCostoUnidad = useMemo(
    () => filas.map((fila) => ({
      etiqueta: etiquetaMes(fila.periodo),
      mod: fila.modUnidad,
      cif: fila.cifUnidad,
    })),
    [filas],
  )

  const desviaciones = useMemo(() => {
    if (!ultima || !anterior) return [] as Desviacion[]
    const actuales = rubros.filter((r) => r.periodo === ultima.periodo)
    const previos = rubros.filter((r) => r.periodo === anterior.periodo)

    type Acumulado = Desviacion & {
      anteriorEbitda: number
      actualEbitda: number
      clasificaciones: Set<string>
    }

    const mapa = new Map<string, Acumulado>()

    const cargarFila = (rubro: RubroMensual, esActual: boolean) => {
      // El nivel gerencial principal es la CUENTA CONTABLE completa.
      // Una cuenta que requiere detalle puede estar repartida entre CIF,
      // gasto específico, gasto general, etc.; no debe aparecer fragmentada
      // como si cada clasificación fuera una cuenta diferente.
      const clave = rubro.cuenta_codigo
      const existente = mapa.get(clave) ?? {
        clave,
        cuentaCodigo: rubro.cuenta_codigo,
        cuentaNombre: rubro.cuenta_nombre,
        clasificacion: rubro.clasificacion_gerencial,
        comportamiento: rubro.comportamiento,
        origen: rubro.origen,
        anterior: 0,
        actual: 0,
        cambio: 0,
        cambioPct: null,
        impactoEbitda: 0,
        impactaEbitda: false,
        anteriorEbitda: 0,
        actualEbitda: 0,
        clasificaciones: new Set<string>(),
      }

      const valor = Number(rubro.valor ?? 0)
      if (esActual) {
        existente.actual += valor
        if (rubro.impacta_ebitda) existente.actualEbitda += valor
      } else {
        existente.anterior += valor
        if (rubro.impacta_ebitda) existente.anteriorEbitda += valor
      }

      existente.impactaEbitda = existente.impactaEbitda || rubro.impacta_ebitda
      existente.origen = rubro.origen === "DETALLE" ? "DETALLE" : existente.origen
      existente.clasificaciones.add(rubro.clasificacion_gerencial)
      mapa.set(clave, existente)
    }

    actuales.forEach((r) => cargarFila(r, true))
    previos.forEach((r) => cargarFila(r, false))

    return Array.from(mapa.values())
      .map((item) => {
        const delta = item.actual - item.anterior
        const impacto = -(item.actualEbitda - item.anteriorEbitda)
        const clasificaciones = Array.from(item.clasificaciones)
        return {
          ...item,
          clasificacion:
            clasificaciones.length > 1
              ? "Clasificación mixta"
              : clasificaciones[0] ?? item.clasificacion,
          cambio: delta,
          cambioPct: Math.abs(item.anterior) > 0.005 ? (delta / Math.abs(item.anterior)) * 100 : null,
          impactoEbitda: impacto,
        }
      })
      .filter((item) => Math.abs(item.cambio) > 0.005 || Math.abs(item.impactoEbitda) > 0.005)
      .sort((a, b) => Math.abs(b.impactoEbitda) - Math.abs(a.impactoEbitda))
  }, [rubros, ultima, anterior])

  const puntosEquilibrio = useMemo(() => {
    const calcular = (fila: FilaDashboard | null) => {
      if (!fila) return null
      const delMes = rubros.filter((r) => r.periodo === fila.periodo && r.impacta_ebitda)
      const variablesNoCogs = delMes
        .filter((r) => !r.incluida_costo_venta_contable && ["VARIABLE", "SEMI_VARIABLE"].includes(r.comportamiento))
        .reduce((suma, r) => suma + Number(r.valor ?? 0), 0)
      const fijosNoCogs = delMes
        .filter((r) => !r.incluida_costo_venta_contable && !["VARIABLE", "SEMI_VARIABLE"].includes(r.comportamiento))
        .reduce((suma, r) => suma + Number(r.valor ?? 0), 0)
      const ventas = Number(fila.ventas_netas ?? 0)
      const costoVariableEstimado = Number(fila.costo_venta ?? 0) + variablesNoCogs
      const margenContribucion = ventas - costoVariableEstimado
      const ratio = ventas > 0 ? margenContribucion / ventas : 0
      const pe = ratio > 0 ? fijosNoCogs / ratio : null
      const margenSeguridad = pe != null && ventas > 0 ? ((ventas - pe) / ventas) * 100 : null
      return {
        ventas,
        variablesNoCogs,
        costoVariableEstimado,
        fijosNoCogs,
        margenContribucion,
        ratio,
        pe,
        margenSeguridad,
      }
    }

    return {
      actual: calcular(ultima),
      anterior: calcular(anterior),
    }
  }, [rubros, ultima, anterior])

  const puntoEquilibrio = puntosEquilibrio.actual
  const puntoEquilibrioAnterior = puntosEquilibrio.anterior

  const puenteEbitda = useMemo(() => {
    if (!ultima || !anterior) return [] as Array<{ etiqueta: string; impacto: number }>
    return [
      { etiqueta: "Ventas netas", impacto: ultima.ventas_netas - anterior.ventas_netas },
      { etiqueta: "Otros ingresos", impacto: ultima.otros_ingresos - anterior.otros_ingresos },
      { etiqueta: "Costo de venta", impacto: -(ultima.costo_venta - anterior.costo_venta) },
      { etiqueta: "CIF reclasificado", impacto: -(ultima.cif_operativo - anterior.cif_operativo) },
      { etiqueta: "Gastos específicos", impacto: -(ultima.gasto_especifico_cliente - anterior.gasto_especifico_cliente) },
      { etiqueta: "Gastos generales", impacto: -(ultima.gasto_general - anterior.gasto_general) },
    ].filter((item) => Math.abs(item.impacto) > 0.005)
  }, [ultima, anterior])

  async function verDetalle(desviacion: Desviacion) {
    if (!ultima) return
    setRubroSeleccionado(desviacion)
    setDetalleRubro([])
    if (desviacion.origen !== "DETALLE") return

    setCargandoDetalle(true)
    try {
      const { data, error: detalleError } = await supabase
        .from("fin_vw_resultado_clasificacion_detalle")
        .select("id,fecha_documento,numero_documento,proveedor,concepto,valor,clasificacion_gerencial,subcategoria,area,clientes_resumen")
        .eq("periodo", ultima.periodo)
        .eq("cuenta_codigo", desviacion.cuentaCodigo)
        .order("fecha_documento", { ascending: true })
      if (detalleError) throw detalleError
      setDetalleRubro((data ?? []) as DetalleRubro[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el detalle del rubro.")
    } finally {
      setCargandoDetalle(false)
    }
  }

  if (cargando && filas.length === 0) {
    return <section className="cg-panel"><div className="cg-loading">Construyendo tablero de costos y gastos…</div></section>
  }

  return (
    <section className="cg-panel">
      <style>{css}</style>

      <div className="cg-heading">
        <div>
          <span>COSTOS Y GASTOS · CONTROL GERENCIAL</span>
          <h2>Rentabilidad, punto de equilibrio y desviaciones</h2>
          <p>Valores contables conciliados, clasificación gerencial y explicación de los cambios que más impactan el EBITDA.</p>
        </div>
        <div className="cg-actions">
          <label>
            Año
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {anios.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void cargar(anio)}>Actualizar</button>
          <button type="button" className="secondary" onClick={() => cambiarPantalla("Pagos y Finanzas · Importación contable")}>
            Importación contable
          </button>
        </div>
      </div>

      {error && <div className="cg-error">{error}</div>}

      {ultima ? (
        <>
          <div className="cg-period-note">
            Último mes cerrado: <strong>{nombreMes(ultima.periodo)}</strong>
            {anterior ? <> · comparación contra <strong>{nombreMes(anterior.periodo)}</strong></> : null}
          </div>
          <div className="cg-kpi-legend" aria-label="Interpretación de tendencias">
            <span className="positive">↑↓ Mejor</span>
            <span className="negative">↑↓ Peor</span>
            <span className="neutral">→ Relativamente igual</span>
            <small>Naranja: variación de hasta ±2% o ±0,5 puntos porcentuales.</small>
          </div>

          <div className="cg-kpis">
            <Kpi titulo="Ventas netas" valor={dinero(ultima.ventas_netas)} cambio={cambio(ultima.ventas_netas, anterior?.ventas_netas)} />
            <Kpi titulo="Devoluciones / notas de crédito" valor={dinero(ultima.devoluciones)} cambio={cambio(ultima.devoluciones, anterior?.devoluciones)} invertir />
            <Kpi titulo="Descuentos sobre ventas" valor={dinero(ultima.descuentos)} cambio={cambio(ultima.descuentos, anterior?.descuentos)} invertir />
            <Kpi titulo="Punto de equilibrio" valor={puntoEquilibrio?.pe != null ? dinero(puntoEquilibrio.pe) : "—"} cambio={cambio(puntoEquilibrio?.pe, puntoEquilibrioAnterior?.pe)} invertir />
            <Kpi titulo="Margen de seguridad" valor={puntoEquilibrio?.margenSeguridad != null ? porcentaje(puntoEquilibrio.margenSeguridad) : "—"} cambio={cambioPuntos(puntoEquilibrio?.margenSeguridad, puntoEquilibrioAnterior?.margenSeguridad)} />
            <Kpi titulo="EBITDA" valor={dinero(ultima.ebitda)} cambio={cambio(ultima.ebitda, anterior?.ebitda)} />
            <Kpi titulo="Costo de venta / ventas" valor={porcentaje(ultima.costoVentaPct)} cambio={cambio(ultima.costoVentaPct, anterior?.costoVentaPct)} invertir />
            <Kpi titulo="MOD / unidad producida" valor={dineroUnitario(ultima.modUnidad)} cambio={cambio(ultima.modUnidad, anterior?.modUnidad)} invertir />
            <Kpi titulo="CIF / unidad producida" valor={dineroUnitario(ultima.cifUnidad)} cambio={cambio(ultima.cifUnidad, anterior?.cifUnidad)} invertir />
            <Kpi titulo="Gasto cliente / unidad vendida" valor={dineroUnitario(ultima.gastoEspecificoUnidad)} cambio={cambio(ultima.gastoEspecificoUnidad, anterior?.gastoEspecificoUnidad)} invertir />
            <Kpi titulo="Gasto general / ventas" valor={porcentaje(ultima.gastoGeneralPct)} cambio={cambio(ultima.gastoGeneralPct, anterior?.gastoGeneralPct)} invertir />
            <Kpi titulo="Margen EBITDA" valor={porcentaje(ultima.margen_ebitda_pct)} cambio={cambioPuntos(ultima.margen_ebitda_pct, anterior?.margen_ebitda_pct)} />
          </div>

          {puntoEquilibrio && (
            <article className="cg-card cg-break-even">
              <div className="cg-card-title">
                <div>
                  <span>PUNTO DE EQUILIBRIO GERENCIAL</span>
                  <h3>¿Cuánto debemos vender para cubrir la estructura?</h3>
                </div>
                <small>Estimación conservadora: el costo de venta contable se trata como variable y la matriz separa gastos variables/semi-variables de la estructura fija.</small>
              </div>
              <div className="cg-break-grid">
                <MiniDato titulo="Ventas netas" valor={dinero(puntoEquilibrio.ventas)} />
                <MiniDato titulo="Costo variable estimado" valor={dinero(puntoEquilibrio.costoVariableEstimado)} />
                <MiniDato titulo="Margen contribución estimado" valor={dinero(puntoEquilibrio.margenContribucion)} />
                <MiniDato titulo="Margen contribución %" valor={porcentaje(puntoEquilibrio.ratio * 100)} />
                <MiniDato titulo="Estructura fija estimada" valor={dinero(puntoEquilibrio.fijosNoCogs)} />
                <MiniDato titulo="Punto de equilibrio" valor={puntoEquilibrio.pe != null ? dinero(puntoEquilibrio.pe) : "—"} destacado />
              </div>
              {puntoEquilibrio.pe != null && (
                <div className="cg-pe-track">
                  <div className="cg-pe-labels">
                    <span>PE {dinero(puntoEquilibrio.pe)}</span>
                    <strong>Ventas {dinero(puntoEquilibrio.ventas)}</strong>
                  </div>
                  <div className="cg-pe-bar">
                    <div className="cg-pe-point" style={{ left: `${Math.min(100, Math.max(0, (puntoEquilibrio.pe / Math.max(puntoEquilibrio.ventas, puntoEquilibrio.pe)) * 100))}%` }} />
                    <div className="cg-pe-sales" style={{ width: `${Math.min(100, Math.max(0, (puntoEquilibrio.ventas / Math.max(puntoEquilibrio.ventas, puntoEquilibrio.pe)) * 100))}%` }} />
                  </div>
                </div>
              )}
            </article>
          )}

          {periodosPendientes.length > 0 && (
            <div className="cg-warning">
              El tablero muestra solo meses marcados como CERRADOS. Aún no se incluyen: {periodosPendientes.map(etiquetaMes).join(", ")}.
            </div>
          )}

          {anterior && (
            <div className="cg-grid-two cg-analysis-grid">
              <article className="cg-card">
                <div className="cg-card-title">
                  <div>
                    <span>¿QUÉ CAMBIÓ ESTE MES?</span>
                    <h3>Rubros con mayor impacto económico</h3>
                  </div>
                  <small>Ordenados por impacto en dólares sobre EBITDA. Cada fila representa la cuenta contable completa; haz clic para ver cómo se repartió entre CIF, cliente, gasto general u otras clasificaciones cuando exista detalle.</small>
                </div>
                <div className="cg-table-wrap compact">
                  <table className="cg-impact-table">
                    <thead>
                      <tr>
                        <th>Rubro</th>
                        <th>{etiquetaMes(anterior.periodo)}</th>
                        <th>{etiquetaMes(ultima.periodo)}</th>
                        <th>Cambio $</th>
                        <th>Cambio %</th>
                        <th>Impacto EBITDA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {desviaciones.slice(0, 10).map((item) => (
                        <tr key={item.clave} onClick={() => void verDetalle(item)} className="clickable">
                          <td>
                            <strong>{item.cuentaNombre}</strong>
                            <small>{item.cuentaCodigo} · {etiquetaClasificacion(item.clasificacion)}</small>
                          </td>
                          <td>{dinero(item.anterior)}</td>
                          <td>{dinero(item.actual)}</td>
                          <td className={item.cambio > 0 ? "negative" : "positive"}>{dineroConSigno(item.cambio)}</td>
                          <td>{item.cambioPct == null ? "—" : porcentajeConSigno(item.cambioPct)}</td>
                          <td className={item.impactoEbitda >= 0 ? "positive" : "negative"}>{item.impactaEbitda ? dineroConSigno(item.impactoEbitda) : "No EBITDA"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="cg-card">
                <div className="cg-card-title">
                  <div>
                    <span>PUENTE DE EBITDA</span>
                    <h3>{etiquetaMes(anterior.periodo)} → {etiquetaMes(ultima.periodo)}</h3>
                  </div>
                </div>
                <div className="cg-bridge-start"><span>EBITDA {etiquetaMes(anterior.periodo)}</span><strong>{dinero(anterior.ebitda)}</strong></div>
                <div className="cg-bridge">
                  {puenteEbitda.map((item) => (
                    <div key={item.etiqueta}>
                      <span>{item.etiqueta}</span>
                      <strong className={item.impacto >= 0 ? "positive" : "negative"}>{dineroConSigno(item.impacto)}</strong>
                    </div>
                  ))}
                </div>
                <div className="cg-bridge-end"><span>EBITDA {etiquetaMes(ultima.periodo)}</span><strong className={ultima.ebitda >= 0 ? "positive" : "negative"}>{dinero(ultima.ebitda)}</strong></div>
              </article>
            </div>
          )}

          {anterior && <ParetoDesviaciones tipo="DETERIORO" datos={desviaciones.filter((item) => item.impactoEbitda < -0.005).slice(0, 8)} />}
          {anterior && <ParetoDesviaciones tipo="MEJORA" datos={desviaciones.filter((item) => item.impactoEbitda > 0.005).slice(0, 8)} />}

          {rubroSeleccionado && (
            <article className="cg-card cg-detail-card">
              <div className="cg-card-title">
                <div>
                  <span>DETALLE DEL RUBRO</span>
                  <h3>{rubroSeleccionado.cuentaNombre}</h3>
                  <small>{rubroSeleccionado.cuentaCodigo} · {etiquetaClasificacion(rubroSeleccionado.clasificacion)}</small>
                </div>
                <button className="cg-close" type="button" onClick={() => { setRubroSeleccionado(null); setDetalleRubro([]) }}>Cerrar</button>
              </div>
              {cargandoDetalle ? (
                <div className="cg-loading small">Cargando movimientos…</div>
              ) : rubroSeleccionado.origen !== "DETALLE" ? (
                <div className="cg-info">Esta es una cuenta de clasificación fija. Su variación se toma directamente del Estado de Resultados; no requiere apertura manual en el Libro Mayor.</div>
              ) : detalleRubro.length === 0 ? (
                <div className="cg-info">No se encontraron movimientos de detalle para este rubro.</div>
              ) : (
                <div className="cg-table-wrap compact">
                  <table className="cg-detail-table">
                    <thead><tr><th>Fecha</th><th>Documento</th><th>Proveedor / persona</th><th>Concepto</th><th>Cliente(s)</th><th>Valor</th></tr></thead>
                    <tbody>
                      {detalleRubro.map((item) => (
                        <tr key={item.id}>
                          <td>{item.fecha_documento ? fechaCorta(item.fecha_documento) : "—"}</td>
                          <td>{item.numero_documento || "—"}</td>
                          <td>{item.proveedor || "—"}</td>
                          <td>{item.concepto || item.subcategoria || "—"}</td>
                          <td>{item.clientes_resumen || "—"}</td>
                          <td>{dinero(item.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          )}

          <div className="cg-grid-two">
            <article className="cg-card">
              <div className="cg-card-title">
                <div>
                  <span>EFICIENCIA DE PRODUCCIÓN</span>
                  <h3>MOD y CIF por unidad producida</h3>
                </div>
              </div>
              <LineasCosto datos={graficoCostoUnidad} />
              <div className="cg-legend"><span>● MOD / ud.</span><span>◆ CIF / ud.</span></div>
            </article>

            <article className="cg-card">
              <div className="cg-card-title">
                <div>
                  <span>ÚLTIMO MES</span>
                  <h3>Estructura del resultado</h3>
                </div>
              </div>
              <Cascada fila={ultima} />
            </article>
          </div>

          <article className="cg-card cg-table-card">
            <div className="cg-card-title">
              <div>
                <span>EVOLUCIÓN</span>
                <h3>Resumen mensual</h3>
              </div>
              <small>Las cifras por unidad permiten separar crecimiento de volumen de pérdida de eficiencia.</small>
            </div>
            <div className="cg-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th>Unid. producidas</th>
                    <th>Unid. vendidas</th>
                    <th>Ventas netas</th>
                    <th>Costo venta</th>
                    <th>Costo venta / ud vendida</th>
                    <th>MOD</th>
                    <th>MOD / ud prod.</th>
                    <th>CIF</th>
                    <th>CIF / ud prod.</th>
                    <th>Gasto cliente</th>
                    <th>Gasto general</th>
                    <th>EBITDA</th>
                    <th>EBITDA %</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => (
                    <tr key={fila.periodo}>
                      <td><strong>{etiquetaMes(fila.periodo)}</strong></td>
                      <td>{numero(fila.unidadesProducidas)}</td>
                      <td>{numero(fila.unidadesVendidas)}</td>
                      <td>{dinero(fila.ventas_netas)}</td>
                      <td>{dinero(fila.costo_venta)}</td>
                      <td>{dineroUnitario(fila.costoVentaUnidadVendida)}</td>
                      <td>{dinero(fila.mod)}</td>
                      <td>{dineroUnitario(fila.modUnidad)}</td>
                      <td>{dinero(fila.cif_total_informativo)}</td>
                      <td>{dineroUnitario(fila.cifUnidad)}</td>
                      <td>{dinero(fila.gasto_especifico_cliente)}</td>
                      <td>{dinero(fila.gasto_general)}</td>
                      <td className={Number(fila.ebitda) >= 0 ? "positive" : "negative"}>{dinero(fila.ebitda)}</td>
                      <td className={Number(fila.margen_ebitda_pct ?? 0) >= 0 ? "positive" : "negative"}>{porcentaje(fila.margen_ebitda_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <div className="cg-footnote">
            <strong>Lectura correcta:</strong> el ranking de desviaciones prioriza impacto económico en dólares. El porcentaje ayuda a diagnosticar, pero no decide la prioridad. La MOD y el CIF se muestran como indicadores de eficiencia y no se vuelven a restar cuando ya están absorbidos en el costo contable de producción.
          </div>
        </>
      ) : (
        <div className="cg-loading">No hay meses cerrados disponibles para {anio}.</div>
      )}
    </section>
  )
}

function Kpi({ titulo, valor, cambio: cambioValor, invertir = false }: { titulo: string; valor: string; cambio: string | null; invertir?: boolean }) {
  let clase = ""
  let flecha = ""
  if (cambioValor) {
    const numeroCambio = Number(cambioValor.replace(" pp", "").replace("%", ""))
    const umbralNeutral = cambioValor.includes(" pp") ? 0.5 : 2
    flecha = Math.abs(numeroCambio) <= umbralNeutral ? "→" : numeroCambio > 0 ? "↑" : "↓"
    if (Math.abs(numeroCambio) <= umbralNeutral) {
      clase = "neutral"
    } else {
      const bueno = invertir ? numeroCambio < 0 : numeroCambio > 0
      clase = bueno ? "positive" : "negative"
    }
  }
  return (
    <article className={`cg-kpi${clase ? ` cg-kpi--${clase}` : ""}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      <small className={clase}>{cambioValor ? <><b aria-hidden="true">{flecha}</b> {cambioValor} vs mes anterior</> : "Sin comparación disponible"}</small>
    </article>
  )
}

function MiniDato({ titulo, valor, destacado = false }: { titulo: string; valor: string; destacado?: boolean }) {
  return <div className={destacado ? "cg-mini destacado" : "cg-mini"}><span>{titulo}</span><strong>{valor}</strong></div>
}

function ParetoDesviaciones({ datos, tipo }: { datos: Desviacion[]; tipo: "DETERIORO" | "MEJORA" }) {
  const esMejora = tipo === "MEJORA"
  const maximo = Math.max(...datos.map((item) => Math.abs(item.impactoEbitda)), 1)
  const totalImpacto = datos.reduce((s, item) => s + Math.abs(item.impactoEbitda), 0)
  return (
    <article className={`cg-card cg-pareto-card${esMejora ? " mejora" : " deterioro"}`}>
      <div className="cg-card-title">
        <div>
          <span>{esMejora ? "PARETO DE MEJORAS" : "PARETO DE DESVIACIONES"}</span>
          <h3>{esMejora ? "¿Qué impulsó el EBITDA?" : "¿Dónde se concentró el deterioro?"}</h3>
        </div>
        <small>{esMejora
          ? "Prioriza los rubros que más aportaron a la mejora del EBITDA frente al mes anterior."
          : "Prioriza los rubros que explican la mayor parte de la pérdida de EBITDA antes de revisar partidas menores."}</small>
      </div>
      <div className="cg-pareto">
        {datos.length === 0 ? (
          <div className="cg-pareto-empty">
            {esMejora ? "No se registraron rubros con aporte positivo al EBITDA frente al mes anterior." : "No se registraron rubros con deterioro del EBITDA frente al mes anterior."}
          </div>
        ) : datos.map((item) => (
          <div className="cg-pareto-row" key={item.clave}>
            <div className="cg-pareto-label"><strong>{item.cuentaNombre}</strong><span>{dineroConSigno(item.impactoEbitda)}</span></div>
            <div className="cg-pareto-track"><div style={{ width: `${Math.max(3, (Math.abs(item.impactoEbitda) / maximo) * 100)}%` }} /></div>
            <small>{totalImpacto > 0 ? `${((Math.abs(item.impactoEbitda) / totalImpacto) * 100).toFixed(1)}% ${esMejora ? "de la mejora mostrada" : "del deterioro mostrado"}` : ""}</small>
          </div>
        ))}
      </div>
    </article>
  )
}

function LineasCosto({ datos }: { datos: Array<{ etiqueta: string; mod: number | null; cif: number | null }> }) {
  const ancho = 680
  const alto = 220
  const margen = 34
  const valores = datos.flatMap((fila) => [fila.mod, fila.cif]).filter((valor): valor is number => valor !== null && Number.isFinite(valor))
  const maximo = Math.max(...valores, 0.01)
  const pasoX = datos.length > 1 ? (ancho - margen * 2) / (datos.length - 1) : 0
  const y = (valor: number | null) => valor == null ? null : alto - margen - (valor / maximo) * (alto - margen * 2)
  const puntos = (clave: "mod" | "cif") => datos
    .map((fila, indice) => {
      const yy = y(fila[clave])
      return yy == null ? null : `${margen + indice * pasoX},${yy}`
    })
    .filter(Boolean)
    .join(" ")

  return (
    <div className="cg-chart-scroll">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Evolución de MOD y CIF por unidad">
        <line x1={margen} y1={alto - margen} x2={ancho - margen} y2={alto - margen} className="axis" />
        <polyline points={puntos("mod")} className="line-mod" />
        <polyline points={puntos("cif")} className="line-cif" />
        {datos.map((fila, indice) => {
          const x = margen + indice * pasoX
          const yMod = y(fila.mod)
          const yCif = y(fila.cif)
          return (
            <g key={fila.etiqueta}>
              {yMod != null && <circle cx={x} cy={yMod} r="4" className="dot-mod" />}
              {yCif != null && <rect x={x - 4} y={yCif - 4} width="8" height="8" rx="1" className="dot-cif" />}
              <text x={x} y={alto - 9} textAnchor="middle" className="label">{fila.etiqueta}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Cascada({ fila }: { fila: FilaDashboard }) {
  const items = [
    ["Ventas netas", fila.ventas_netas],
    ["+ Otros ingresos", fila.otros_ingresos],
    ["− Costo de venta", -fila.costo_venta],
    ["− CIF reclasificado", -fila.cif_operativo],
    ["− Gastos específicos", -fila.gasto_especifico_cliente],
    ["− Gastos generales", -fila.gasto_general],
  ] as Array<[string, number]>

  return (
    <div className="cg-waterfall">
      {items.map(([etiqueta, valor]) => (
        <div key={etiqueta}><span>{etiqueta}</span><strong>{dinero(valor)}</strong></div>
      ))}
      <div className="total"><span>EBITDA</span><strong className={fila.ebitda >= 0 ? "positive" : "negative"}>{dinero(fila.ebitda)}</strong></div>
      <div className="total minor"><span>Margen EBITDA</span><strong>{porcentaje(fila.margen_ebitda_pct)}</strong></div>
    </div>
  )
}

function etiquetaClasificacion(valor: string) {
  const mapa: Record<string, string> = {
    COSTO_VENTA: "Costo de venta",
    CIF: "CIF",
    GASTO_ESPECIFICO_CLIENTE: "Gasto específico cliente",
    GASTO_GENERAL: "Gasto general",
    FUERA_EBITDA: "Fuera EBITDA",
  }
  return mapa[valor] ?? valor
}

function etiquetaMes(periodo: string) {
  const mes = Number(periodo.slice(5, 7))
  return MESES[mes - 1] ?? periodo.slice(0, 7)
}

function nombreMes(periodo: string) {
  const fecha = new Date(`${periodo}T12:00:00`)
  return new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric" }).format(fecha)
}

function fechaCorta(valor: string) {
  const fecha = new Date(`${valor.slice(0, 10)}T12:00:00`)
  return new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(fecha)
}

function dinero(valor: number | null | undefined) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(valor ?? 0))
}

function dineroConSigno(valor: number) {
  const abs = dinero(Math.abs(valor))
  if (valor > 0) return `+${abs}`
  if (valor < 0) return `-${abs}`
  return abs
}

function dineroUnitario(valor: number | null | undefined) {
  if (valor == null || !Number.isFinite(Number(valor))) return "—"
  return `${dinero(Number(valor))}/ud`
}

function numero(valor: number) {
  return new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 }).format(valor || 0)
}

function porcentaje(valor: number | null | undefined) {
  if (valor == null || !Number.isFinite(Number(valor))) return "—"
  return `${Number(valor).toFixed(1)}%`
}

function porcentajeConSigno(valor: number) {
  return `${valor >= 0 ? "+" : ""}${valor.toFixed(1)}%`
}

function cambio(actual: number | null | undefined, anterior: number | null | undefined) {
  if (actual == null || anterior == null || !Number.isFinite(Number(actual)) || !Number.isFinite(Number(anterior)) || Number(anterior) === 0) return null
  const valor = ((Number(actual) - Number(anterior)) / Math.abs(Number(anterior))) * 100
  return `${valor >= 0 ? "+" : ""}${valor.toFixed(1)}%`
}

function cambioPuntos(actual: number | null | undefined, anterior: number | null | undefined) {
  if (actual == null || anterior == null || !Number.isFinite(Number(actual)) || !Number.isFinite(Number(anterior))) return null
  const valor = Number(actual) - Number(anterior)
  return `${valor >= 0 ? "+" : ""}${valor.toFixed(1)} pp`
}

const css = `
  .cg-panel { display:grid; gap:16px; width:100%; min-width:0; }
  .cg-heading { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; padding:18px 20px; border:1px solid #e6dcd6; border-radius:12px; background:#fff; }
  .cg-heading > div:first-child > span, .cg-card-title span { color:${NARANJA}; font-size:10px; font-weight:900; letter-spacing:.07em; }
  .cg-heading h2 { margin:4px 0 5px; color:${VINO}; font-size:24px; }
  .cg-heading p { margin:0; color:#736762; font-size:12px; }
  .cg-actions { display:flex; gap:8px; align-items:end; flex-wrap:wrap; justify-content:flex-end; }
  .cg-actions label { color:#786b65; font-size:9px; font-weight:900; text-transform:uppercase; }
  .cg-actions select { display:block; min-width:90px; height:38px; margin-top:4px; padding:0 9px; border:1px solid #d8cec8; border-radius:7px; background:#fff; }
  .cg-actions button { min-height:38px; padding:0 13px; border:0; border-radius:7px; background:${VINO}; color:#fff; font-size:10px; font-weight:900; cursor:pointer; }
  .cg-actions button.secondary { border:1px solid #d8cac3; background:#fff; color:${VINO}; }
  .cg-period-note { padding:9px 13px; border-radius:8px; background:#faf6f3; color:#6f625d; font-size:11px; }
  .cg-kpi-legend { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin-top:-8px; color:#7b6d67; font-size:9px; font-weight:800; }
  .cg-kpi-legend small { color:#958780; font-size:8px; font-weight:600; }
  .cg-kpis { display:grid; grid-template-columns:repeat(5,minmax(150px,1fr)); gap:10px; }
  .cg-kpi { min-width:0; padding:14px; border:1px solid #e7ded9; border-radius:11px; background:#fff; box-shadow:0 4px 14px rgba(70,43,34,.035); }
  .cg-kpi > span { display:block; min-height:27px; color:#786b65; font-size:9px; font-weight:900; text-transform:uppercase; line-height:1.35; }
  .cg-kpi > strong { display:block; overflow:hidden; margin:5px 0 3px; color:#322b28; font-size:20px; text-overflow:ellipsis; white-space:nowrap; }
  .cg-kpi small { color:#887a73; font-size:9px; font-weight:700; }
  .cg-kpi small b { display:inline-block; min-width:12px; font-size:13px; line-height:1; }
  .cg-kpi--positive { border-top:3px solid #267341; }
  .cg-kpi--negative { border-top:3px solid #b42631; }
  .cg-kpi--neutral { border-top:3px solid ${NARANJA}; }
  .positive { color:#267341 !important; }
  .negative { color:#b42631 !important; }
  .neutral { color:#c66a00 !important; }
  .cg-grid-two { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr); gap:14px; }
  .cg-analysis-grid { grid-template-columns:minmax(0,1.5fr) minmax(300px,.5fr); }
  .cg-card { min-width:0; padding:17px; border:1px solid #e6dcd6; border-radius:12px; background:#fff; }
  .cg-card-title { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; margin-bottom:12px; }
  .cg-card-title h3 { margin:3px 0 0; color:#3a312d; font-size:17px; }
  .cg-card-title small { max-width:430px; color:#82746d; font-size:10px; line-height:1.45; text-align:right; }
  .cg-break-even { border-left:4px solid ${VINO}; }
  .cg-break-grid { display:grid; grid-template-columns:repeat(6,minmax(120px,1fr)); gap:9px; }
  .cg-mini { padding:11px; border-radius:8px; background:#faf8f7; }
  .cg-mini span { display:block; min-height:24px; color:#81736d; font-size:9px; font-weight:800; text-transform:uppercase; line-height:1.3; }
  .cg-mini strong { display:block; margin-top:4px; color:#3a312d; font-size:15px; }
  .cg-mini.destacado { background:#fbefea; }
  .cg-mini.destacado strong { color:${VINO}; font-size:18px; }
  .cg-pe-track { margin-top:14px; }
  .cg-pe-labels { display:flex; justify-content:space-between; gap:12px; margin-bottom:5px; color:#786b65; font-size:10px; }
  .cg-pe-labels strong { color:${VINO}; }
  .cg-pe-bar { position:relative; height:14px; overflow:hidden; border-radius:999px; background:#eee8e5; }
  .cg-pe-sales { height:100%; border-radius:999px; background:#d9eadf; }
  .cg-pe-point { position:absolute; z-index:2; top:-3px; bottom:-3px; width:3px; background:${VINO}; transform:translateX(-1px); }
  .cg-table-wrap { width:100%; overflow-x:auto; }
  .cg-table-wrap.compact table { min-width:780px; }
  .cg-table-wrap table { width:100%; min-width:1450px; border-collapse:collapse; font-size:10px; }
  .cg-table-wrap th { padding:9px 8px; border-bottom:2px solid #ded2cc; color:#746762; text-align:right; white-space:nowrap; }
  .cg-table-wrap th:first-child { text-align:left; }
  .cg-table-wrap td { padding:9px 8px; border-bottom:1px solid #eee8e5; color:#4e4541; text-align:right; white-space:nowrap; }
  .cg-table-wrap td:first-child { text-align:left; color:${VINO}; }
  .cg-impact-table td:first-child strong { display:block; color:#3f3632; }
  .cg-impact-table td:first-child small { display:block; margin-top:2px; color:#958780; font-size:8px; }
  .cg-impact-table tr.clickable { cursor:pointer; }
  .cg-impact-table tr.clickable:hover { background:#fff9f5; }
  .cg-bridge-start, .cg-bridge-end { display:flex; justify-content:space-between; gap:12px; padding:11px 10px; border-radius:8px; background:#faf6f3; color:#5e514c; font-size:11px; font-weight:900; }
  .cg-bridge-end { margin-top:8px; background:#fbefea; color:${VINO}; }
  .cg-bridge { display:grid; gap:5px; margin-top:8px; }
  .cg-bridge > div { display:flex; justify-content:space-between; gap:12px; padding:7px 4px; border-bottom:1px solid #f0e9e5; color:#6d605a; font-size:10px; }
  .cg-pareto { display:grid; gap:11px; }
  .cg-pareto-row { display:grid; grid-template-columns:minmax(170px,260px) 1fr minmax(100px,160px); gap:10px; align-items:center; }
  .cg-pareto-label { display:flex; justify-content:space-between; gap:8px; color:#544a45; font-size:10px; }
  .cg-pareto-label span { color:#b42631; font-weight:900; white-space:nowrap; }
  .cg-pareto-track { height:10px; overflow:hidden; border-radius:999px; background:#f0e7e3; }
  .cg-pareto-track > div { height:100%; border-radius:999px; background:${VINO}; }
  .cg-pareto-card.mejora { border-left:4px solid #267341; }
  .cg-pareto-card.mejora .cg-pareto-label span { color:#267341; }
  .cg-pareto-card.mejora .cg-pareto-track > div { background:#267341; }
  .cg-pareto-card.deterioro { border-left:4px solid ${VINO}; }
  .cg-pareto-row small { color:#8a7c75; font-size:9px; text-align:right; }
  .cg-pareto-empty { padding:16px; border-radius:8px; background:#faf8f7; color:#7b6e68; font-size:10px; text-align:center; }
  .cg-detail-card { border-top:3px solid ${NARANJA}; }
  .cg-close { min-height:32px; padding:0 11px; border:1px solid #d8cac3; border-radius:7px; background:#fff; color:${VINO}; font-size:9px; font-weight:900; cursor:pointer; }
  .cg-info { padding:12px; border-radius:8px; background:#faf8f7; color:#766a64; font-size:10px; line-height:1.5; }
  .cg-detail-table { min-width:980px !important; }
  .cg-chart-scroll { width:100%; overflow-x:auto; }
  .cg-chart-scroll svg { display:block; width:100%; min-width:480px; height:220px; }
  .cg-chart-scroll .axis { stroke:#ddd2cc; stroke-width:1; }
  .cg-chart-scroll .line-mod, .cg-chart-scroll .line-cif { fill:none; stroke-width:3; stroke-linejoin:round; stroke-linecap:round; }
  .cg-chart-scroll .line-mod { stroke:${VINO}; }
  .cg-chart-scroll .line-cif { stroke:${NARANJA}; }
  .cg-chart-scroll .dot-mod { fill:${VINO}; }
  .cg-chart-scroll .dot-cif { fill:${NARANJA}; }
  .cg-chart-scroll .label { fill:#786b65; font-size:10px; font-weight:700; }
  .cg-legend { display:flex; gap:16px; color:#746762; font-size:10px; font-weight:800; }
  .cg-legend span:first-child { color:${VINO}; }
  .cg-legend span:last-child { color:#b9650a; }
  .cg-waterfall { display:grid; gap:8px; }
  .cg-waterfall > div { display:flex; justify-content:space-between; gap:14px; padding:8px 0; border-bottom:1px solid #f0e9e5; color:#655a55; font-size:11px; }
  .cg-waterfall > div strong { color:#362f2c; }
  .cg-waterfall .total { margin-top:3px; padding:11px 10px; border:0; border-radius:8px; background:#faf2ee; color:${VINO}; font-weight:900; }
  .cg-waterfall .total.minor { margin-top:0; background:#fafafa; color:#4f4743; }
  .cg-table-card { overflow:hidden; }
  .cg-footnote { padding:12px 14px; border-left:4px solid ${NARANJA}; border-radius:7px; background:#fff8ef; color:#785c3f; font-size:10px; line-height:1.5; }
  .cg-warning { padding:10px 13px; border:1px solid #f0d5ae; border-radius:8px; background:#fff8ed; color:#925b16; font-size:10px; font-weight:700; }
  .cg-error { padding:11px 13px; border:1px solid #f0c8cb; border-radius:8px; background:#fff1f1; color:#a11f29; font-size:11px; }
  .cg-loading { padding:36px; border:1px dashed #d8cec8; border-radius:12px; background:#fff; color:#766a64; text-align:center; }
  .cg-loading.small { padding:18px; }
  @media (max-width:1300px) { .cg-kpis { grid-template-columns:repeat(4,minmax(150px,1fr)); } .cg-break-grid { grid-template-columns:repeat(3,minmax(120px,1fr)); } }
  @media (max-width:1100px) { .cg-kpis { grid-template-columns:repeat(2,minmax(150px,1fr)); } .cg-grid-two, .cg-analysis-grid { grid-template-columns:1fr; } .cg-pareto-row { grid-template-columns:220px 1fr; } .cg-pareto-row small { grid-column:2; text-align:left; } }
  @media (max-width:720px) { .cg-heading { flex-direction:column; } .cg-actions { width:100%; justify-content:flex-start; } .cg-kpis { grid-template-columns:1fr 1fr; } .cg-break-grid { grid-template-columns:1fr 1fr; } .cg-pareto-row { grid-template-columns:1fr; } .cg-pareto-row small { grid-column:auto; } }
  @media (max-width:480px) { .cg-kpis, .cg-break-grid { grid-template-columns:1fr; } }
`
