import type { ReactNode } from "react"

const mesCorto = new Intl.DateTimeFormat("es-EC", { month: "short", timeZone: "UTC" })
const numero = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 })
const miles = new Intl.NumberFormat("es-EC", { notation: "compact", maximumFractionDigits: 1 })

export function mesRevision(periodo: string, formato: "short" | "long" = "short") {
  const fecha = new Date(`${periodo}T12:00:00Z`)
  return formato === "short" ? mesCorto.format(fecha)
    : new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" }).format(fecha)
}

export function desplazarMes(periodo: string, meses: number) {
  const fecha = new Date(`${periodo.slice(0, 7)}-01T12:00:00Z`)
  fecha.setUTCMonth(fecha.getUTCMonth() + meses)
  return fecha.toISOString().slice(0, 10)
}

export type PuntoRevision = { etiqueta: string; valor: number | null }

export function GraficoRevision({
  titulo, vigente, anterior, puntos, formato, unidad, faltante, indice = false,
  subeEsBueno = true, tendencia = false, children,
}: {
  titulo: string
  vigente: number | null
  anterior: number | null
  puntos: PuntoRevision[]
  formato: (valor: number) => string
  unidad: string
  faltante: string
  indice?: boolean
  subeEsBueno?: boolean
  tendencia?: boolean
  children?: ReactNode
}) {
  const cambio = vigente !== null && anterior !== null ? vigente - anterior : null
  const cambioVisible = cambio !== null && Math.abs(cambio) >= (indice ? 0.05 : 0.005) ? cambio : null
  const valores = puntos.flatMap(({ valor }) => valor === null ? [] : [valor])
  const maximo = Math.max(1, ...valores.map(Math.abs))
  const negativos = valores.some((valor) => valor < 0)

  return (
    <figure className={`revision-operativa-panel revision-grafico${tendencia ? " revision-grafico-ancho" : ""}`}>
      <figcaption>
        <h3>{titulo}</h3>
        <div className="revision-grafico-cifra">
          <strong>{vigente === null ? "—" : formato(vigente)}</strong>
          {cambioVisible !== null && (
            <span className={(cambioVisible > 0) === subeEsBueno ? "revision-mejora" : "revision-alerta"}>
              {cambioVisible > 0 ? "↑ " : "↓ "}
              {indice ? `${numero.format(Math.abs(cambioVisible))} p. p.` : formato(Math.abs(cambioVisible))}
            </span>
          )}
        </div>
      </figcaption>
      {valores.length === 0 ? <p>{faltante}</p> : tendencia ? (
        <Tendencia puntos={puntos} formato={formato} />
      ) : (
        <ul className="revision-grafico-barras" aria-label={unidad}>
          {puntos.map(({ etiqueta, valor }, i) => {
            const ancho = valor === null ? 0 : 100 * Math.abs(valor) / maximo / (negativos ? 2 : 1)
            const inicio = negativos ? 50 - (valor !== null && valor < 0 ? ancho : 0) : 0
            return (
              <li key={`${i}-${etiqueta}`}>
                <span>{etiqueta}</span>
                <span className="revision-grafico-pista" aria-hidden="true">
                  <span style={{ left: `${inicio}%`, width: `${ancho}%` }} />
                </span>
                <strong>{valor === null ? "—" : formato(valor)}</strong>
              </li>
            )
          })}
        </ul>
      )}
      {children}
    </figure>
  )
}

function Tendencia({ puntos, formato }: { puntos: PuntoRevision[]; formato: (valor: number) => string }) {
  const valores = puntos.flatMap(({ valor }) => valor === null ? [] : [valor])
  const minimo = Math.min(0, ...valores)
  const maximo = Math.max(1, ...valores)
  const posiciones = puntos.map(({ valor }, i) => valor === null ? null : {
    x: (i + 0.5) * 100 / puntos.length,
    y: 92 - 84 * (valor - minimo) / (maximo - minimo),
  })
  const descripcion = puntos.map(({ etiqueta, valor }) => `${etiqueta} ${valor === null ? "sin dato" : formato(valor)}`).join(", ")
  return (
    <div className="revision-grafico-linea" role="img" aria-label={`Ventas netas en USD. ${descripcion}`}>
      <div className="revision-grafico-escala" aria-hidden="true">
        <span>{miles.format(maximo)}</span><span>{miles.format((maximo + minimo) / 2)}</span><span>{miles.format(minimo)}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {[8, 50, 92].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} className="revision-grafico-guia" />)}
        {posiciones.map((punto, i) => {
          const previo = posiciones[i - 1]
          return punto && previo ? <line key={i} x1={previo.x} x2={punto.x} y1={previo.y} y2={punto.y} className="revision-grafico-trazo" /> : null
        })}
      </svg>
      <div className="revision-grafico-puntos" aria-hidden="true">
        {posiciones.map((punto, i) => punto && <span key={i} style={{ left: `${punto.x}%`, top: `${punto.y}%` }} title={formato(puntos[i].valor!)} />)}
      </div>
      <div className="revision-grafico-meses" aria-hidden="true">
        {puntos.map(({ etiqueta }, i) => <span key={i}>{etiqueta}</span>)}
      </div>
    </div>
  )
}
