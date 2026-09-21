import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import KpiKamConfiguracion from "../components/kpiKam/KpiKamConfiguracion"
import KpiKamCobertura from "../components/kpiKam/KpiKamCobertura"
import {
  obtenerBasesProvisionalesKpiKamDb,
  obtenerConfiguracionesKpiKamDb,
  obtenerKamsKpiDb,
  type KamKpiDb,
} from "../repositories/kpiKamRepository"
import { calcularResultadoKpiKam } from "../services/kpiKamCalculo"
import {
  CODIGOS_KPI_KAM,
  type ClasificacionKpiKam,
  type CodigoKpiKam,
  type ResultadoKpiKam,
  type ResultadoKpiKamDetalle,
} from "../types/kpiKam"

type ResumenDetalle = {
  codigo: CodigoKpiKam
  nombre: string
  estado: ResultadoKpiKamDetalle["estado"]
  valor: number | null
  numerador: number | null
  denominador: number | null
  meta: number | null
  nota: number | null
  pesoConfigurado: number | null
  puntos: number | null
  alertas: number
  motivo: string | null
}

type Props = {
  integradoDashboard?: boolean
  refreshToken?: number
}

const ETIQUETAS_CORTAS: Record<CodigoKpiKam, string> = {
  VENTAS_PRESUPUESTO: "Ventas vs presupuesto",
  MARGEN_CONTRIBUCION: "Margen de contribución",
  DEVOLUCIONES: "Devoluciones",
  FUGAS_COMERCIALES: "Fugas comerciales",
  CRECIMIENTO_RENTABLE: "Crecimiento rentable",
  COBERTURA_SKU: "Cobertura SKU",
  COMPROMISOS: "Compromisos",
}

const PESOS_KPI_KAM: Record<CodigoKpiKam, number> = {
  VENTAS_PRESUPUESTO: 20,
  MARGEN_CONTRIBUCION: 20,
  DEVOLUCIONES: 15,
  FUGAS_COMERCIALES: 15,
  CRECIMIENTO_RENTABLE: 10,
  COBERTURA_SKU: 10,
  COMPROMISOS: 10,
}

function periodoActual() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  return `${anio}-${mes}`
}

function periodoAnterior(periodo: string) {
  const [anio, mes] = periodo.split("-").map(Number)
  const fecha = new Date(anio, mes - 2, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(valor) ? valor : 0)
}

function porcentaje(valor: number | null) {
  return valor == null || !Number.isFinite(valor)
    ? "—"
    : `${valor.toLocaleString("es-EC", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`
}

function clasificar(puntaje: number): ClasificacionKpiKam {
  if (puntaje >= 90) return "VERDE"
  if (puntaje >= 75) return "AMARILLO"
  return "ROJO"
}

function promedioPonderado(
  filas: Array<{ valor: number; peso: number }>,
) {
  const peso = filas.reduce((total, fila) => total + fila.peso, 0)
  if (filas.length === 0) return null
  if (peso <= 0) {
    return filas.reduce((total, fila) => total + fila.valor, 0) / filas.length
  }
  return filas.reduce(
    (total, fila) => total + fila.valor * fila.peso,
    0,
  ) / peso
}

function resumirResultados(resultados: ResultadoKpiKam[]) {
  const completos = resultados.filter(
    (resultado) => resultado.completo && resultado.puntaje != null,
  )
  const completo = resultados.length > 0 && completos.length === resultados.length
  const puntaje = completo
    ? promedioPonderado(
        completos.map((resultado) => ({
          valor: Number(resultado.puntaje),
          peso: Math.max(0, resultado.ventaNeta),
        })),
      )
    : null
  const bloqueoVerde = resultados.some((resultado) =>
    resultado.alertas.some((alerta) => alerta.bloqueaVerde),
  )
  let clasificacion = puntaje == null ? null : clasificar(puntaje)
  if (clasificacion === "VERDE" && bloqueoVerde) clasificacion = "AMARILLO"

  const detalles = CODIGOS_KPI_KAM.map<ResumenDetalle>((codigo) => {
    const filas = resultados
      .map((resultado) => ({
        resultado,
        detalle: resultado.detalles.find((item) => item.codigo === codigo),
      }))
      .filter(
        (item): item is {
          resultado: ResultadoKpiKam
          detalle: ResultadoKpiKamDetalle
        } => Boolean(item.detalle),
      )
    const calculadas = filas.filter(
      (item) => item.detalle.estado === "CALCULADO",
    )
    const todasNoAplican = filas.length > 0 && filas.every(
      (item) => item.detalle.estado === "NO_APLICA",
    )
    const estado = todasNoAplican
      ? "NO_APLICA"
      : filas.some((item) => item.detalle.estado === "SIN_DATOS")
        ? "SIN_DATOS"
        : calculadas.length > 0
          ? "CALCULADO"
          : "SIN_DATOS"
    const ponderar = (campo: "valor" | "nota" | "puntos") =>
      promedioPonderado(
        calculadas
          .filter((item) => item.detalle[campo] != null)
          .map((item) => ({
            valor: Number(item.detalle[campo]),
            peso: Math.max(0, item.resultado.ventaNeta),
          })),
      )

    return {
      codigo,
      nombre: ETIQUETAS_CORTAS[codigo],
      estado,
      valor: ponderar("valor"),
      numerador: calculadas.some((item) => item.detalle.numerador != null)
        ? calculadas.reduce(
            (total, item) => total + Number(item.detalle.numerador ?? 0),
            0,
          )
        : null,
      denominador: calculadas.some((item) => item.detalle.denominador != null)
        ? calculadas.reduce(
            (total, item) => total + Number(item.detalle.denominador ?? 0),
            0,
          )
        : null,
      meta: promedioPonderado(
        calculadas
          .filter((item) => item.detalle.meta != null)
          .map((item) => ({
            valor: Number(item.detalle.meta),
            peso: Math.max(0, item.resultado.ventaNeta),
          })),
      ),
      nota: ponderar("nota"),
      pesoConfigurado: promedioPonderado(
        filas.map((item) => ({
          valor: item.detalle.pesoConfigurado,
          peso: Math.max(0, item.resultado.ventaNeta),
        })),
      ) ?? PESOS_KPI_KAM[codigo],
      puntos: ponderar("puntos"),
      alertas: filas.reduce(
        (total, item) => total + item.detalle.alertas.length,
        0,
      ),
      motivo:
        filas.find((item) => item.detalle.estado === "SIN_DATOS")?.detalle
          .motivo ??
        (todasNoAplican ? "Configurado como no aplicable." : null),
    }
  })

  return {
    completo,
    puntaje,
    clasificacion,
    detalles,
    alertas: resultados.flatMap((resultado) => resultado.alertas),
  }
}

function buscarDetalle(
  detalles: ResumenDetalle[],
  codigo: CodigoKpiKam,
) {
  return detalles.find((detalle) => detalle.codigo === codigo) ?? null
}

function semaforoDetalle(detalle: ResumenDetalle) {
  if (detalle.nota == null) return "incompleto"
  if (detalle.nota >= 90) return "verde"
  if (detalle.nota >= 75) return "amarillo"
  return "rojo"
}

function baseDetalle(detalle: ResumenDetalle) {
  const numerador = detalle.numerador
  const denominador = detalle.denominador
  if (numerador == null) return detalle.motivo ?? "Información pendiente"
  if (detalle.codigo === "COBERTURA_SKU") {
    return `${Math.round(numerador)} de ${Math.round(denominador ?? 0)} posiciones activas`
  }
  if (detalle.codigo === "COMPROMISOS") {
    return `${Math.round(numerador)} de ${Math.round(denominador ?? 0)} compromisos a tiempo`
  }
  if (detalle.codigo === "MARGEN_CONTRIBUCION") {
    return `${moneda(numerador)} de contribución sobre ${moneda(denominador ?? 0)}`
  }
  if (detalle.codigo === "CRECIMIENTO_RENTABLE") {
    return `${moneda(numerador)} de variación en contribución`
  }
  if (detalle.codigo === "VENTAS_PRESUPUESTO") {
    return `${moneda(numerador)} de ${moneda(denominador ?? 0)} presupuestados`
  }
  if (detalle.codigo === "DEVOLUCIONES") {
    return `${moneda(numerador)} devueltos sobre ${moneda(denominador ?? 0)}`
  }
  return `${moneda(numerador)} de fugas sobre ${moneda(denominador ?? 0)}`
}

function avisosResultado(resultado: ResultadoKpiKam) {
  return Array.from(new Set([
    ...resultado.advertencias,
    ...resultado.detalles
      .filter((item) => item.estado === "SIN_DATOS")
      .map((item) => item.motivo)
      .filter((item): item is string => Boolean(item)),
  ]))
}

export default function KpiKam({
  integradoDashboard = false,
  refreshToken,
}: Props = {}) {
  const [vista, setVista] = useState<"RESULTADOS" | "CONFIGURACION" | "COBERTURA">("RESULTADOS")
  const [periodo, setPeriodo] = useState(periodoActual())
  const [kamId, setKamId] = useState("TODOS")
  const [clienteId, setClienteId] = useState("TODOS")
  const [kams, setKams] = useState<KamKpiDb[]>([])
  const [resultados, setResultados] = useState<ResultadoKpiKam[]>([])
  const [resultadosAnteriores, setResultadosAnteriores] = useState<ResultadoKpiKam[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [actualizacion, setActualizacion] = useState(refreshToken ?? 0)
  const solicitudRef = useRef(0)

  const cargar = useCallback(async () => {
    const solicitud = solicitudRef.current + 1
    solicitudRef.current = solicitud
    setCargando(true)
    setError("")

    try {
      const anterior = periodoAnterior(periodo)
      const kamFiltro = kamId === "TODOS" ? null : kamId
      const [bases, basesAnteriores, listaKams] = await Promise.all([
        obtenerBasesProvisionalesKpiKamDb(periodo, kamFiltro),
        obtenerBasesProvisionalesKpiKamDb(anterior, kamFiltro),
        obtenerKamsKpiDb().catch(() => [] as KamKpiDb[]),
      ])
      const [configuraciones, configuracionesAnteriores] = await Promise.all([
        Promise.all(
          bases.map((base) =>
            obtenerConfiguracionesKpiKamDb(periodo, base.clienteId),
          ),
        ),
        Promise.all(
          basesAnteriores.map((base) =>
            obtenerConfiguracionesKpiKamDb(anterior, base.clienteId),
          ),
        ),
      ])
      if (solicitud !== solicitudRef.current) return
      setKams(listaKams)
      setResultados(
        bases.map((base, indice) =>
          calcularResultadoKpiKam(base, configuraciones[indice]),
        ),
      )
      setResultadosAnteriores(
        basesAnteriores.map((base, indice) =>
          calcularResultadoKpiKam(base, configuracionesAnteriores[indice]),
        ),
      )
    } catch (err) {
      if (solicitud !== solicitudRef.current) return
      setResultados([])
      setResultadosAnteriores([])
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar KPI KAM.",
      )
    } finally {
      if (solicitud === solicitudRef.current) setCargando(false)
    }
  }, [periodo, kamId])

  useEffect(() => {
    void cargar()
  }, [cargar, actualizacion])

  useEffect(() => {
    if (refreshToken == null) return
    setActualizacion(refreshToken)
  }, [refreshToken])

  const clientes = useMemo(
    () => resultados
      .map((resultado) => ({
        id: resultado.clienteId ?? "",
        nombre: resultado.clienteNombre ?? "Sin cliente",
      }))
      .filter((cliente) => cliente.id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [resultados],
  )

  useEffect(() => {
    if (
      clienteId !== "TODOS" &&
      !clientes.some((cliente) => cliente.id === clienteId)
    ) {
      setClienteId("TODOS")
    }
  }, [clienteId, clientes])

  const seleccionados = useMemo(
    () => clienteId === "TODOS"
      ? resultados
      : resultados.filter((resultado) => resultado.clienteId === clienteId),
    [resultados, clienteId],
  )
  const seleccionadosAnteriores = useMemo(
    () => clienteId === "TODOS"
      ? resultadosAnteriores
      : resultadosAnteriores.filter(
          (resultado) => resultado.clienteId === clienteId,
        ),
    [resultadosAnteriores, clienteId],
  )
  const resumen = useMemo(
    () => resumirResultados(seleccionados),
    [seleccionados],
  )
  const resumenAnterior = useMemo(
    () => resumirResultados(seleccionadosAnteriores),
    [seleccionadosAnteriores],
  )
  const variacionPuntaje =
    resumen.puntaje != null && resumenAnterior.puntaje != null
      ? resumen.puntaje - resumenAnterior.puntaje
      : null
  const ventaNeta = seleccionados.reduce(
    (total, resultado) => total + resultado.ventaNeta,
    0,
  )
  const incompletos = seleccionados.filter((resultado) => !resultado.completo)
  const clientesCompletos = seleccionados.length - incompletos.length
  const kpisConResultado = resumen.detalles.filter(
    (detalle) => detalle.valor != null,
  ).length
  const avanceDatos = Math.round(
    (kpisConResultado / CODIGOS_KPI_KAM.length) * 100,
  )

  return (
    <section className={`kam-page ${integradoDashboard ? "kam-page-integrado" : ""}`}>
      <style>{css}</style>

      {!integradoDashboard && <header className="kam-head">
        <div>
          <span>COMERCIAL · GESTIÓN RENTABLE</span>
          <h1>KPI KAM</h1>
          <p>Resultados mensuales por responsable y cliente, con datos reales y trazabilidad.</p>
        </div>
        <div className="kam-head-actions">
          <button type="button" className={vista === "RESULTADOS" ? "activo" : "secundario"} onClick={() => setVista("RESULTADOS")}>Inicio</button>
          <button type="button" className={vista === "CONFIGURACION" ? "activo" : "secundario"} onClick={() => setVista("CONFIGURACION")}>Configurar</button>
          <button type="button" className={vista === "COBERTURA" ? "activo" : "secundario"} onClick={() => setVista("COBERTURA")}>Cobertura SKU-local</button>
          {vista === "RESULTADOS" && <button type="button" className="actualizar" onClick={() => setActualizacion((valor) => valor + 1)} disabled={cargando}>{cargando ? "Actualizando…" : "Actualizar datos"}</button>}
        </div>
      </header>}

      {vista === "CONFIGURACION" ? (
        <KpiKamConfiguracion
          periodo={periodo}
          cambiarPeriodo={setPeriodo}
          onActualizado={() => setActualizacion((valor) => valor + 1)}
        />
      ) : vista === "COBERTURA" ? (
        <KpiKamCobertura
          periodo={periodo}
          cambiarPeriodo={setPeriodo}
          onActualizado={() => setActualizacion((valor) => valor + 1)}
        />
      ) : (
        <>
      <section className="kam-filtros">
        <label>
          <span>Periodo</span>
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </label>
        <label>
          <span>KAM</span>
          <select value={kamId} onChange={(e) => { setKamId(e.target.value); setClienteId("TODOS") }}>
            <option value="TODOS">Todos los KAM</option>
            {kams.map((kam) => <option key={kam.user_id} value={kam.user_id}>{kam.nombre || kam.email}</option>)}
          </select>
        </label>
        <label>
          <span>Cliente</span>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="TODOS">Todos los clientes</option>
            {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}
          </select>
        </label>
        <div className="kam-filtro-resumen">
          <span>Vista actual</span>
          <strong>{seleccionados.length} cliente{seleccionados.length === 1 ? "" : "s"}</strong>
          <small>{moneda(ventaNeta)} venta neta</small>
        </div>
      </section>

      {error && <div className="kam-error"><strong>No se pudo calcular el tablero.</strong><span>{error}</span></div>}

      {!error && !cargando && resultados.length === 0 && (
        <div className="kam-vacio">
          <span>TABLERO LISTO PARA COMENZAR</span>
          <h2>Los siete KPI todavía no tienen información calculable</h2>
          <p>Las fichas permanecen visibles para trabajar cada indicador. Los resultados aparecerán automáticamente al completar sus fuentes.</p>
        </div>
      )}

      {!error && !cargando && (
        <>
          <section className="kam-avance">
            <div className="kam-avance-intro">
              <span>AVANCE DEL TABLERO</span>
              <h2>{kpisConResultado} de {CODIGOS_KPI_KAM.length} KPI ya muestran resultado</h2>
              <p>Los indicadores pendientes aparecerán automáticamente cuando exista información suficiente.</p>
              <div className="kam-avance-barra"><i style={{ width: `${avanceDatos}%` }} /></div>
            </div>
            <div className="kam-avance-dato">
              <span>Datos disponibles</span>
              <strong>{avanceDatos}%</strong>
              <small>{CODIGOS_KPI_KAM.length - kpisConResultado} KPI pendientes</small>
            </div>
            <div className="kam-avance-dato">
              <span>Clientes completos</span>
              <strong>{clientesCompletos}/{seleccionados.length}</strong>
              <small>{incompletos.length === 0 ? "Información completa" : "Requieren completar datos"}</small>
            </div>
            <div className="kam-avance-dato">
              <span>Estado del periodo</span>
              <strong>PROVISIONAL</strong>
              <small>Se actualiza con cada nuevo registro</small>
            </div>
          </section>

          <section className={`kam-score ${resumen.clasificacion?.toLowerCase() ?? "incompleto"}`}>
            <div className="kam-score-principal">
              <span>RESULTADO PROVISIONAL DEL MES</span>
              <strong>{resumen.puntaje == null ? "—" : Math.round(resumen.puntaje)}</strong>
              <small>/ 100 puntos</small>
            </div>
            <div className="kam-score-estado">
              <span>Estado general</span>
              <strong>{resumen.clasificacion ?? "INCOMPLETO"}</strong>
              <small>{resumen.completo ? "Las siete mediciones están disponibles." : seleccionados.length === 0 ? "Aún no existen clientes con datos para este periodo." : `${incompletos.length} cliente(s) necesitan completar información.`}</small>
            </div>
            <div className="kam-score-cambio">
              <span>Variación mensual</span>
              <strong className={variacionPuntaje == null ? "neutral" : variacionPuntaje >= 0 ? "positivo" : "negativo"}>
                {variacionPuntaje == null ? "—" : `${variacionPuntaje >= 0 ? "↑" : "↓"} ${Math.abs(variacionPuntaje).toFixed(1)} puntos`}
              </strong>
              <small>{resumenAnterior.puntaje == null ? "Mes anterior sin resultado completo." : `${Math.round(resumenAnterior.puntaje)} → ${Math.round(resumen.puntaje ?? 0)}`}</small>
            </div>
          </section>

          <section className="kam-cards">
            {resumen.detalles.map((detalle) => {
              const anterior = buscarDetalle(resumenAnterior.detalles, detalle.codigo)
              const cambio = detalle.valor != null && anterior?.valor != null
                ? detalle.valor - anterior.valor
                : null
              const menorEsMejor = detalle.codigo === "DEVOLUCIONES"
                || detalle.codigo === "FUGAS_COMERCIALES"
              const mejora = cambio == null
                ? null
                : menorEsMejor ? cambio <= 0 : cambio >= 0
              return (
                <article key={detalle.codigo} className={`kam-card ${detalle.estado.toLowerCase()} ${semaforoDetalle(detalle)}`}>
                  <header>
                    <div><span>{detalle.nombre}</span><small>Peso {detalle.pesoConfigurado == null ? "—" : `${detalle.pesoConfigurado.toFixed(0)}%`} · {detalle.estado === "CALCULADO" ? "Completo" : detalle.estado === "NO_APLICA" ? "No aplica" : detalle.valor == null ? "Sin datos" : "Parcial"}</small></div>
                    {detalle.alertas > 0 && <b>{detalle.alertas} alerta{detalle.alertas === 1 ? "" : "s"}</b>}
                  </header>
                  <strong>{detalle.estado === "NO_APLICA" ? "N/A" : detalle.valor == null ? "No disponible" : porcentaje(detalle.valor)}</strong>
                  <p>{baseDetalle(detalle)}</p>
                  <div className="kam-card-meta"><span>Meta {porcentaje(detalle.meta)}</span><b>{detalle.nota == null ? "Sin nota" : `${detalle.nota.toFixed(0)}/100`}</b><em>{detalle.puntos == null ? "—" : `${detalle.puntos.toFixed(1)} pts`}</em></div>
                  <div className="kam-card-barra"><i style={{ width: `${Math.max(0, Math.min(100, detalle.nota ?? 0))}%` }} /></div>
                  <small className={`kam-card-cambio ${mejora == null ? "neutral" : mejora ? "positivo" : "negativo"}`}>
                    {cambio == null ? detalle.motivo ?? "Sin comparación mensual" : `${cambio >= 0 ? "↑" : "↓"} ${Math.abs(cambio).toFixed(1)} pp vs mes anterior`}
                  </small>
                </article>
              )
            })}
          </section>

          {resumen.alertas.length > 0 && (
            <section className="kam-alertas">
              <div><span>ALERTAS AUTOMÁTICAS</span><h2>Situaciones que requieren decisión</h2></div>
              <ul>{resumen.alertas.map((alerta, indice) => <li key={`${alerta.codigo}-${indice}`}><strong>{ETIQUETAS_CORTAS[alerta.kpi]}</strong><span>{alerta.mensaje}</span></li>)}</ul>
            </section>
          )}

          <section className="kam-tabla-panel">
            <header><div><span>RESULTADO POR CLIENTE</span><h2>¿Dónde se concentra el desempeño?</h2></div><small>Selecciona una fila para revisar ese cliente.</small></header>
            <div className="kam-tabla-wrap">
              <table>
                <thead><tr><th>Cliente</th><th>Puntaje</th><th>Ventas</th><th>Margen</th><th>Devoluciones</th><th>Fugas</th><th>Crecimiento</th><th>Cobertura</th><th>Compromisos</th></tr></thead>
                <tbody>
                  {seleccionados.length === 0 && <tr><td colSpan={9} className="kam-tabla-vacia">Aún no existen resultados por cliente para este periodo.</td></tr>}
                  {seleccionados.map((resultado) => {
                    const detalle = new Map(resultado.detalles.map((item) => [item.codigo, item]))
                    return (
                      <tr key={resultado.clienteId} onClick={() => setClienteId(resultado.clienteId ?? "TODOS")} className={clienteId === resultado.clienteId ? "seleccionado" : ""}>
                        <td data-label="Cliente"><strong>{resultado.clienteNombre}</strong><small>{resultado.completo ? "Cálculo completo" : "Información pendiente"}</small></td>
                        <td data-label="Puntaje"><span className={`kam-badge ${resultado.clasificacion?.toLowerCase() ?? "incompleto"}`}>{resultado.puntaje == null ? "—" : resultado.puntaje.toFixed(0)}</span></td>
                        <CeldaKpi detalle={detalle.get("VENTAS_PRESUPUESTO")} />
                        <CeldaKpi detalle={detalle.get("MARGEN_CONTRIBUCION")} />
                        <CeldaKpi detalle={detalle.get("DEVOLUCIONES")} />
                        <CeldaKpi detalle={detalle.get("FUGAS_COMERCIALES")} />
                        <CeldaKpi detalle={detalle.get("CRECIMIENTO_RENTABLE")} />
                        <CeldaKpi detalle={detalle.get("COBERTURA_SKU")} />
                        <CeldaKpi detalle={detalle.get("COMPROMISOS")} />
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {incompletos.length > 0 && (
            <section className="kam-pendientes">
              <span>CALIDAD DEL DATO</span>
              <h2>Información pendiente para cerrar el resultado</h2>
              {incompletos.map((resultado) => (
                <article key={resultado.clienteId}>
                  <strong>{resultado.clienteNombre}</strong>
                  <ul>{avisosResultado(resultado).map((aviso) => <li key={aviso}>{aviso}</li>)}</ul>
                </article>
              ))}
            </section>
          )}
        </>
      )}
        </>
      )}
    </section>
  )
}

function CeldaKpi({ detalle }: { detalle?: ResultadoKpiKamDetalle }) {
  return (
    <td data-label={detalle?.nombre ?? "KPI"}>
      {detalle?.estado === "NO_APLICA"
        ? "N/A"
        : detalle?.valor == null
          ? "—"
          : porcentaje(detalle.valor)}
    </td>
  )
}

const css = `
.kam-page{padding:28px;max-width:1500px;margin:0 auto;color:#2b211f}.kam-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:20px}.kam-head span,.kam-filtros label>span,.kam-filtro-resumen>span,.kam-score span,.kam-tabla-panel>header span,.kam-alertas>div>span,.kam-pendientes>span,.kam-vacio>span{display:block;color:#f28c18;font-size:11px;font-weight:900;letter-spacing:.09em}.kam-head h1{margin:4px 0 4px;color:#8f1d24;font-size:34px}.kam-head p{margin:0;color:#766b67}.kam-head-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.kam-head button{border:1px solid #dfd1ca;border-radius:10px;background:white;color:#6d5e59;padding:11px 15px;font-weight:800;cursor:pointer}.kam-head button.activo,.kam-head button.actualizar{border-color:#981f28;background:#981f28;color:white}.kam-head button.actualizar{margin-left:6px}.kam-head button:disabled{opacity:.6}.kam-filtros{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr)) minmax(200px,.8fr);gap:10px;padding:12px;border:1px solid #e8dcd5;border-radius:14px;background:#fff;margin-bottom:16px}.kam-filtros label{display:grid;gap:6px}.kam-filtros input,.kam-filtros select{width:100%;border:1px solid #ded1ca;border-radius:9px;background:#fbf9f7;padding:11px;color:#382b27;font-weight:700}.kam-filtro-resumen{border-left:1px solid #eadfd9;padding-left:18px;display:flex;flex-direction:column;justify-content:center}.kam-filtro-resumen strong{font-size:18px;color:#8f1d24}.kam-filtro-resumen small{color:#827773}.kam-error,.kam-vacio{border:1px solid #e5c7c7;border-radius:14px;background:#fff7f7;padding:24px;display:grid;gap:6px}.kam-error strong{color:#a12029}.kam-error span{color:#6f5d59}.kam-vacio{border-color:#eadfd8;background:white}.kam-vacio h2{margin:4px 0;color:#8f1d24}.kam-vacio p{margin:0;color:#756864}.kam-score{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #e4d8d2;border-left:6px solid #8a817c;border-radius:16px;background:white;overflow:hidden;margin-bottom:14px}.kam-score.verde{border-left-color:#18864b}.kam-score.amarillo{border-left-color:#e59b16}.kam-score.rojo{border-left-color:#aa2630}.kam-score>div{padding:20px 24px;min-height:125px;display:flex;flex-direction:column;justify-content:center}.kam-score>div+div{border-left:1px solid #eee5e0}.kam-score-principal strong{font-size:52px;line-height:1;color:#8f1d24}.kam-score-principal small,.kam-score-estado small,.kam-score-cambio small{color:#817570;margin-top:6px}.kam-score-estado strong{font-size:24px;margin-top:6px}.kam-score.verde .kam-score-estado strong{color:#18864b}.kam-score.amarillo .kam-score-estado strong{color:#c47b00}.kam-score.rojo .kam-score-estado strong{color:#aa2630}.kam-score-cambio strong{font-size:20px;margin-top:8px}.positivo{color:#148248!important}.negativo{color:#ad2630!important}.neutral{color:#857873!important}.kam-cards{display:grid;grid-template-columns:repeat(4,minmax(210px,1fr));gap:10px;margin-bottom:14px}.kam-card{border:1px solid #e8ddd7;border-radius:14px;background:white;padding:16px;min-height:155px;display:flex;flex-direction:column}.kam-card header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.kam-card header span{font-size:12px;font-weight:900;color:#655651;text-transform:uppercase}.kam-card header b{font-size:10px;color:#a9232d;background:#fff0f1;border-radius:20px;padding:4px 7px}.kam-card>strong{font-size:27px;color:#8f1d24;margin:16px 0 12px}.kam-card>div{display:flex;justify-content:space-between;border-top:1px solid #eee5e0;padding-top:9px;color:#695c57;font-size:12px}.kam-card>small{margin-top:auto;padding-top:8px;line-height:1.25}.kam-card.sin_datos{background:#fcfaf8}.kam-card.no_aplica{background:#f4f1ee}.kam-alertas,.kam-pendientes,.kam-tabla-panel{border:1px solid #e6dad4;border-radius:14px;background:#fff;margin-bottom:14px;padding:18px}.kam-alertas{display:grid;grid-template-columns:minmax(220px,.5fr) 1fr;gap:24px;border-left:5px solid #a5222c}.kam-alertas h2,.kam-pendientes h2,.kam-tabla-panel h2{margin:4px 0;color:#5c211f}.kam-alertas ul,.kam-pendientes ul{margin:0;padding-left:18px}.kam-alertas li{margin:0 0 8px}.kam-alertas li strong{display:block;color:#9a2029}.kam-alertas li span{color:#6d605b}.kam-tabla-panel{padding:0;overflow:hidden}.kam-tabla-panel>header{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;padding:18px}.kam-tabla-panel>header small{color:#857873}.kam-tabla-wrap{overflow:auto}.kam-tabla{width:100%}.kam-tabla-wrap table{width:100%;border-collapse:collapse;min-width:980px}.kam-tabla-wrap th{background:#f7f3f0;color:#6c5d58;font-size:11px;text-transform:uppercase;text-align:left;padding:11px 13px}.kam-tabla-wrap td{padding:12px 13px;border-top:1px solid #eee5df;color:#433632}.kam-tabla-wrap tbody tr{cursor:pointer}.kam-tabla-wrap tbody tr:hover,.kam-tabla-wrap tbody tr.seleccionado{background:#fff8f0}.kam-tabla-wrap td:first-child strong,.kam-tabla-wrap td:first-child small{display:block}.kam-tabla-wrap td:first-child small{color:#8c7f7a;margin-top:2px}.kam-badge{display:inline-grid;place-items:center;min-width:42px;padding:7px;border-radius:20px;background:#eee;color:#605550;font-weight:900}.kam-badge.verde{background:#e3f5e9;color:#167641}.kam-badge.amarillo{background:#fff1cf;color:#9b6500}.kam-badge.rojo{background:#fde4e5;color:#a51f29}.kam-pendientes article{display:grid;grid-template-columns:minmax(180px,.35fr) 1fr;gap:20px;border-top:1px solid #eee4de;padding:12px 0}.kam-pendientes article:first-of-type{margin-top:12px}.kam-pendientes article strong{color:#8f1d24}.kam-pendientes li{color:#6f625d;margin:3px 0}@media(max-width:1100px){.kam-filtros{grid-template-columns:1fr 1fr}.kam-filtro-resumen{border-left:0;padding-left:0}.kam-cards{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.kam-page{padding:18px 12px}.kam-head{display:grid}.kam-head-actions{display:grid;grid-template-columns:1fr 1fr}.kam-head button{width:100%}.kam-head button.actualizar{grid-column:1/-1;margin-left:0}.kam-filtros,.kam-score,.kam-cards,.kam-alertas{grid-template-columns:1fr}.kam-score>div+div{border-left:0;border-top:1px solid #eee5e0}.kam-score>div{min-height:auto}.kam-pendientes article{grid-template-columns:1fr}.kam-tabla-panel>header{display:grid}.kam-head h1{font-size:29px}}
.kam-avance{display:grid;grid-template-columns:minmax(320px,1.6fr) repeat(3,minmax(150px,.65fr));gap:0;margin-bottom:14px;border:1px solid #e4d8d2;border-radius:16px;background:#fff;overflow:hidden}.kam-avance-intro{padding:18px 22px}.kam-avance-intro>span,.kam-avance-dato>span{display:block;color:#f28c18;font-size:11px;font-weight:900;letter-spacing:.08em}.kam-avance-intro h2{margin:5px 0;color:#512b2b;font-size:21px}.kam-avance-intro p{margin:0;color:#756964;font-size:12px}.kam-avance-barra{height:9px;margin-top:14px;border-radius:999px;background:#eee8e4;overflow:hidden}.kam-avance-barra i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#f28c18,#159447);transition:width .2s ease}.kam-avance-dato{display:flex;flex-direction:column;justify-content:center;padding:18px;border-left:1px solid #eee5e0}.kam-avance-dato strong{margin:8px 0 4px;color:#8f1d24;font-size:25px}.kam-avance-dato small{color:#817570;font-size:11px;line-height:1.35}
.kam-cards{grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:12px}.kam-card{min-height:250px;padding:17px;border-top:5px solid #aaa}.kam-card.verde{border-top-color:#18864b}.kam-card.amarillo{border-top-color:#e59b16}.kam-card.rojo{border-top-color:#aa2630}.kam-card.incompleto{border-top-color:#9a8e88}.kam-card header div{display:grid;gap:5px}.kam-card header span{font-size:13px}.kam-card header small{color:#8b7d77;font-size:11px;font-weight:800}.kam-card>strong{margin:15px 0 6px;font-size:31px}.kam-card>p{min-height:34px;margin:0 0 12px;color:#6f625d;font-size:12px;line-height:1.4}.kam-card>.kam-card-meta{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding-top:10px;border-top:1px solid #eee5e0;color:#695c57;font-size:11px}.kam-card-meta em{font-style:normal;font-weight:900;color:#8f1d24}.kam-card>.kam-card-barra{display:block;height:7px;margin:10px 0 0;padding:0;border:0;border-radius:999px;background:#eee8e4;overflow:hidden}.kam-card-barra i{display:block;height:100%;border-radius:inherit;background:#9a8e88}.kam-card.verde .kam-card-barra i{background:#18864b}.kam-card.amarillo .kam-card-barra i{background:#e59b16}.kam-card.rojo .kam-card-barra i{background:#aa2630}.kam-card>.kam-card-cambio{display:block;margin-top:auto;padding-top:11px;font-size:11px;line-height:1.35}.kam-tabla-wrap table{min-width:1250px}
@media(max-width:1100px){.kam-avance{grid-template-columns:1fr 1fr 1fr}.kam-avance-intro{grid-column:1/-1}.kam-avance-dato:first-of-type{border-left:0}}
@media(max-width:720px){.kam-avance{grid-template-columns:1fr}.kam-avance-intro{grid-column:auto}.kam-avance-dato{border-left:0;border-top:1px solid #eee5e0}.kam-cards{grid-template-columns:1fr}}
.kam-page.kam-page-integrado{max-width:none;padding:4px 0 36px}.kam-page-integrado .kam-filtros{margin-top:0}
.kam-card.incompleto>strong{color:#756964;font-size:23px}.kam-tabla-wrap td.kam-tabla-vacia{padding:28px;color:#817570;text-align:center;font-size:12px;cursor:default}
`
