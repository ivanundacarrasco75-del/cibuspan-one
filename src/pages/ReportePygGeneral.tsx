import { useEffect, useMemo, useState } from "react"
import type {
  MargenBrutoMensualDb,
  ResultadoMensualDb,
} from "../repositories/costosIndirectosRepository"

function numero(valor: number | null | undefined) {
  return Number(valor ?? 0)
}

function moneda(valor: number | null | undefined) {
  return numero(valor).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function porcentaje(valor: number | null | undefined) {
  return `${numero(valor).toLocaleString("es-EC", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function mesPeriodo(periodo: string) {
  const [anio, mes] = periodo.split("-").map(Number)
  return new Intl.DateTimeFormat("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
}

type PygCalculado = {
  periodo: string
  ventasBrutas: number
  devoluciones: number
  descuentos: number
  ventasNetas: number
  costoVentas: number
  margenBruto: number
  margenBrutoPct: number
  gastosVentas: number
  gastosAdministracion: number
  resultadoOperativo: number
  depreciacion: number
  ebitda: number
  margenEbitda: number
  otrosIngresos: number
  gastosFinancieros: number
  resultadoEjercicio: number
  cuentas: number
  diferenciaVentasNetas: number
}

function calcularPyg(
  resultado: ResultadoMensualDb,
  margen?: MargenBrutoMensualDb,
): PygCalculado {
  const ventasNetas = numero(resultado.ventas_netas)
  const costoVentas = numero(resultado.costo_ventas)
  const margenBruto = ventasNetas - costoVentas
  const ventasNetasDetalle = margen
    ? numero(margen.ventas_netas)
    : ventasNetas

  return {
    periodo: resultado.periodo,
    ventasBrutas: margen
      ? numero(margen.ventas_brutas)
      : ventasNetas,
    devoluciones: numero(margen?.devoluciones_ventas),
    descuentos: numero(margen?.descuentos_ventas),
    ventasNetas,
    costoVentas,
    margenBruto,
    margenBrutoPct:
      ventasNetas !== 0 ? (margenBruto / ventasNetas) * 100 : 0,
    gastosVentas: numero(resultado.gastos_ventas),
    gastosAdministracion: numero(resultado.gastos_administracion),
    resultadoOperativo: numero(resultado.resultado_operativo),
    depreciacion: numero(resultado.depreciacion),
    ebitda: numero(resultado.ebitda_estimado),
    margenEbitda: numero(resultado.margen_ebitda_estimado),
    otrosIngresos: numero(resultado.otros_ingresos),
    gastosFinancieros: numero(resultado.gastos_financieros),
    resultadoEjercicio: numero(resultado.resultado_ejercicio),
    cuentas: Number(resultado.cuentas ?? 0),
    diferenciaVentasNetas: ventasNetasDetalle - ventasNetas,
  }
}

function Variacion({
  actual,
  anterior,
  mejorCuandoSube = true,
  formato = "MONEDA",
}: {
  actual: number
  anterior?: number
  mejorCuandoSube?: boolean
  formato?: "MONEDA" | "PORCENTAJE"
}) {
  if (anterior === undefined) {
    return <small style={detalleNeutro}>Sin mes anterior comparable</small>
  }

  const diferencia = actual - anterior
  const estable = Math.abs(diferencia) < 0.005
  const favorable = mejorCuandoSube ? diferencia > 0 : diferencia < 0
  const color = estable ? "#a16207" : favorable ? "#15803d" : "#b91c1c"
  const simbolo = estable ? "→" : diferencia > 0 ? "↑" : "↓"
  const valor =
    formato === "PORCENTAJE"
      ? `${Math.abs(diferencia).toFixed(1)} pp`
      : moneda(Math.abs(diferencia))

  return (
    <small style={{ ...detalleNeutro, color }}>
      {simbolo} {valor} frente al mes anterior
    </small>
  )
}

function Tarjeta({
  etiqueta,
  valor,
  actual,
  anterior,
  mejorCuandoSube,
  formato,
}: {
  etiqueta: string
  valor: string
  actual: number
  anterior?: number
  mejorCuandoSube?: boolean
  formato?: "MONEDA" | "PORCENTAJE"
}) {
  return (
    <article style={tarjeta}>
      <span style={tarjetaEtiqueta}>{etiqueta}</span>
      <strong style={tarjetaValor}>{valor}</strong>
      <Variacion
        actual={actual}
        anterior={anterior}
        mejorCuandoSube={mejorCuandoSube}
        formato={formato}
      />
    </article>
  )
}

export default function ReportePygGeneral({
  resultados,
  margenes,
  cargando,
}: {
  resultados: ResultadoMensualDb[]
  margenes: MargenBrutoMensualDb[]
  cargando: boolean
}) {
  const periodos = useMemo(
    () => resultados.map((fila) => fila.periodo).sort().reverse(),
    [resultados],
  )
  const [periodo, setPeriodo] = useState("")

  useEffect(() => {
    if (periodos.length === 0) {
      setPeriodo("")
      return
    }
    if (!periodos.includes(periodo)) setPeriodo(periodos[0])
  }, [periodo, periodos])

  const filas = useMemo(() => {
    const margenPorPeriodo = new Map(
      margenes.map((fila) => [fila.periodo, fila]),
    )
    return resultados
      .map((fila) => calcularPyg(fila, margenPorPeriodo.get(fila.periodo)))
      .sort((a, b) => b.periodo.localeCompare(a.periodo))
  }, [margenes, resultados])

  const actual = filas.find((fila) => fila.periodo === periodo)
  const indiceActual = filas.findIndex((fila) => fila.periodo === periodo)
  const anterior = indiceActual >= 0 ? filas[indiceActual + 1] : undefined

  if (cargando) {
    return <section style={panelVacio}>Calculando el PyG general…</section>
  }

  if (!actual) {
    return (
      <section style={panelVacio}>
        Aún no existen meses importados. Carga el Estado de Resultados desde
        “Importación contable”.
      </section>
    )
  }

  const lineas = [
    { etiqueta: "Ventas brutas", valor: actual.ventasBrutas, tipo: "NORMAL" },
    { etiqueta: "(−) Devoluciones", valor: actual.devoluciones, tipo: "RESTA" },
    { etiqueta: "(−) Descuentos y promociones", valor: actual.descuentos, tipo: "RESTA" },
    { etiqueta: "Ventas netas", valor: actual.ventasNetas, tipo: "SUBTOTAL" },
    { etiqueta: "(−) Costo de ventas", valor: actual.costoVentas, tipo: "RESTA" },
    { etiqueta: "Margen bruto", valor: actual.margenBruto, tipo: "TOTAL" },
    { etiqueta: "(−) Gastos de ventas", valor: actual.gastosVentas, tipo: "RESTA" },
    { etiqueta: "(−) Gastos administrativos", valor: actual.gastosAdministracion, tipo: "RESTA" },
    { etiqueta: "Resultado operativo", valor: actual.resultadoOperativo, tipo: "SUBTOTAL" },
    { etiqueta: "(+) Otros ingresos", valor: actual.otrosIngresos, tipo: "SUMA" },
    { etiqueta: "(−) Gastos financieros", valor: actual.gastosFinancieros, tipo: "RESTA" },
    { etiqueta: "Resultado del ejercicio", valor: actual.resultadoEjercicio, tipo: "FINAL" },
  ]

  return (
    <div style={contenedor}>
      <section style={panel}>
        <div style={cabecera}>
          <div>
            <span style={kicker}>ESTADO DE RESULTADOS</span>
            <h2 style={titulo}>PyG general</h2>
            <p style={descripcion}>
              Lectura mensual oficial basada en el Estado de Resultados
              importado. Devengo contable; no representa movimientos de caja.
            </p>
          </div>
          <label style={selectorEtiqueta}>
            <span>Periodo</span>
            <select
              value={periodo}
              onChange={(evento) => setPeriodo(evento.target.value)}
              style={selector}
            >
              {periodos.map((item) => (
                <option key={item} value={item}>
                  {mesPeriodo(item)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={tarjetas}>
          <Tarjeta
            etiqueta="Ventas netas"
            valor={moneda(actual.ventasNetas)}
            actual={actual.ventasNetas}
            anterior={anterior?.ventasNetas}
          />
          <Tarjeta
            etiqueta="Margen bruto"
            valor={porcentaje(actual.margenBrutoPct)}
            actual={actual.margenBrutoPct}
            anterior={anterior?.margenBrutoPct}
            formato="PORCENTAJE"
          />
          <Tarjeta
            etiqueta="EBITDA"
            valor={moneda(actual.ebitda)}
            actual={actual.ebitda}
            anterior={anterior?.ebitda}
          />
          <Tarjeta
            etiqueta="Margen EBITDA"
            valor={porcentaje(actual.margenEbitda)}
            actual={actual.margenEbitda}
            anterior={anterior?.margenEbitda}
            formato="PORCENTAJE"
          />
          <Tarjeta
            etiqueta="Resultado del ejercicio"
            valor={moneda(actual.resultadoEjercicio)}
            actual={actual.resultadoEjercicio}
            anterior={anterior?.resultadoEjercicio}
          />
        </div>
      </section>

      {Math.abs(actual.diferenciaVentasNetas) > 0.02 && (
        <aside style={alerta}>
          Revisión necesaria: el detalle de ventas brutas, devoluciones y
          descuentos difiere del total contable de ventas netas en {moneda(
            actual.diferenciaVentasNetas,
          )}.
        </aside>
      )}

      <section style={panel}>
        <div style={cabeceraTabla}>
          <div>
            <span style={kicker}>DETALLE DEL MES</span>
            <h3 style={subtitulo}>Estado de pérdidas y ganancias</h3>
          </div>
          <small style={fuente}>
            {actual.cuentas} cuentas contables · {mesPeriodo(actual.periodo)}
          </small>
        </div>

        <div style={tablaContenedor}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Concepto</th>
                <th style={thNumero}>Valor</th>
                <th style={thNumero}>% ventas netas</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((linea) => {
                const esResultado = ["TOTAL", "FINAL"].includes(linea.tipo)
                const esSubtotal = linea.tipo === "SUBTOTAL"
                const colorResultado =
                  esResultado || esSubtotal
                    ? linea.valor >= 0
                      ? "#166534"
                      : "#b91c1c"
                    : "#334155"
                return (
                  <tr key={linea.etiqueta} style={esResultado ? filaTotal : undefined}>
                    <td style={{ ...td, ...(esResultado || esSubtotal ? tdFuerte : {}) }}>
                      {linea.etiqueta}
                    </td>
                    <td style={{ ...tdNumero, color: colorResultado }}>
                      {moneda(linea.valor)}
                    </td>
                    <td style={{ ...tdNumero, color: colorResultado }}>
                      {porcentaje(
                        actual.ventasNetas !== 0
                          ? (linea.valor / actual.ventasNetas) * 100
                          : 0,
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={puenteEbitda}>
          <span>Puente EBITDA</span>
          <strong>{moneda(actual.resultadoOperativo)}</strong>
          <small>resultado operativo</small>
          <b>+</b>
          <strong>{moneda(actual.depreciacion)}</strong>
          <small>depreciación</small>
          <b>=</b>
          <strong style={{ color: actual.ebitda >= 0 ? "#166534" : "#b91c1c" }}>
            {moneda(actual.ebitda)}
          </strong>
          <small>EBITDA</small>
        </div>
      </section>

      <section style={panel}>
        <div style={cabeceraTabla}>
          <div>
            <span style={kicker}>EVOLUCIÓN</span>
            <h3 style={subtitulo}>Histórico mensual</h3>
          </div>
          <small style={fuente}>Selecciona un mes para abrir su PyG</small>
        </div>
        <div style={tablaContenedor}>
          <table style={{ ...tabla, minWidth: 850 }}>
            <thead>
              <tr>
                <th style={th}>Mes</th>
                <th style={thNumero}>Ventas netas</th>
                <th style={thNumero}>Margen bruto</th>
                <th style={thNumero}>Margen bruto %</th>
                <th style={thNumero}>EBITDA</th>
                <th style={thNumero}>Margen EBITDA</th>
                <th style={thNumero}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr
                  key={fila.periodo}
                  onClick={() => setPeriodo(fila.periodo)}
                  style={{
                    cursor: "pointer",
                    background: fila.periodo === periodo ? "#fff7ed" : "white",
                  }}
                >
                  <td style={tdMes}>{mesPeriodo(fila.periodo)}</td>
                  <td style={tdNumero}>{moneda(fila.ventasNetas)}</td>
                  <td style={tdNumero}>{moneda(fila.margenBruto)}</td>
                  <td style={tdNumero}>{porcentaje(fila.margenBrutoPct)}</td>
                  <td style={{ ...tdNumero, color: fila.ebitda >= 0 ? "#166534" : "#b91c1c" }}>
                    {moneda(fila.ebitda)}
                  </td>
                  <td style={tdNumero}>{porcentaje(fila.margenEbitda)}</td>
                  <td style={{ ...tdNumero, color: fila.resultadoEjercicio >= 0 ? "#166534" : "#b91c1c" }}>
                    {moneda(fila.resultadoEjercicio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside style={nota}>
        Validación requerida antes del PyG por cliente: escoger un mes cerrado y
        comprobar que ventas netas, costo de ventas, EBITDA y resultado coincidan
        con el reporte contable original.
      </aside>
    </div>
  )
}

const contenedor = { display: "grid", gap: 16 }
const panel = {
  padding: 22,
  border: "1px solid #e5d8cf",
  borderRadius: 15,
  background: "white",
  boxShadow: "0 8px 20px rgba(92, 44, 34, 0.04)",
}
const panelVacio = {
  ...panel,
  padding: 36,
  color: "#64748b",
  textAlign: "center" as const,
}
const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 18,
  flexWrap: "wrap" as const,
}
const kicker = { color: "#f97316", fontSize: 11, fontWeight: 900, letterSpacing: 1 }
const titulo = { margin: "5px 0 4px", color: "#981b1f", fontSize: 27 }
const subtitulo = { margin: "4px 0 0", color: "#981b1f", fontSize: 20 }
const descripcion = { margin: 0, maxWidth: 720, color: "#6b625f" }
const selectorEtiqueta = {
  display: "grid",
  gap: 6,
  color: "#7c2d12",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase" as const,
}
const selector = {
  minWidth: 220,
  minHeight: 42,
  padding: "8px 12px",
  border: "1px solid #dccbc0",
  borderRadius: 9,
  background: "white",
  color: "#2f2320",
  fontWeight: 700,
  textTransform: "capitalize" as const,
}
const tarjetas = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  marginTop: 20,
}
const tarjeta = {
  minWidth: 0,
  padding: 15,
  border: "1px solid #eadfd8",
  borderRadius: 12,
  background: "#fffcfa",
}
const tarjetaEtiqueta = {
  display: "block",
  minHeight: 28,
  color: "#786b65",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase" as const,
}
const tarjetaValor = { display: "block", margin: "5px 0 7px", color: "#261c1a", fontSize: 22 }
const detalleNeutro = { display: "block", color: "#7c746f", fontSize: 11, fontWeight: 700 }
const alerta = {
  padding: "13px 15px",
  border: "1px solid #f2b8b5",
  borderRadius: 11,
  background: "#fff1f1",
  color: "#991b1b",
  fontWeight: 700,
}
const nota = {
  padding: "13px 15px",
  border: "1px solid #f3d49b",
  borderRadius: 11,
  background: "#fff9e8",
  color: "#7c5a12",
}
const cabeceraTabla = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 14,
  flexWrap: "wrap" as const,
}
const fuente = { color: "#7c746f", textTransform: "capitalize" as const }
const tablaContenedor = { overflowX: "auto" as const, marginTop: 18 }
const tabla = { width: "100%", minWidth: 680, borderCollapse: "collapse" as const }
const th = {
  padding: "10px 12px",
  borderBottom: "2px solid #eadfd8",
  color: "#76645d",
  fontSize: 11,
  textAlign: "left" as const,
  textTransform: "uppercase" as const,
}
const thNumero = { ...th, textAlign: "right" as const }
const td = { padding: "10px 12px", borderBottom: "1px solid #eee5df", color: "#475569" }
const tdFuerte = { color: "#2f2320", fontWeight: 900 }
const tdNumero = { ...td, textAlign: "right" as const, fontWeight: 700, whiteSpace: "nowrap" as const }
const tdMes = { ...td, color: "#7f1d1d", fontWeight: 900, textTransform: "capitalize" as const }
const filaTotal = { background: "#fff9f5" }
const puenteEbitda = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 16,
  padding: "12px 14px",
  border: "1px solid #d7eadc",
  borderRadius: 10,
  background: "#f5fbf6",
  color: "#334155",
  flexWrap: "wrap" as const,
}
