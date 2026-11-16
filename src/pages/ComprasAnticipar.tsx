import { useEffect, useState } from "react"
import { cargarComprasResumen } from "../repositories/comprasResumenRepository"
import type { AvisoReposicion } from "../utils/reposicionCompras"
import "./comprasResumen.css"

const loteVisible = 8
const numero = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 })
const fecha = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

function mostrarFecha(valor: string) {
  return fecha.format(new Date(valor))
}

function mostrarNumero(valor: number) {
  return valor > 0 && valor < 0.01 ? "< 0,01" : numero.format(valor)
}

function FilaReposicion({ aviso, hoy, diasConsumo }: { aviso: AvisoReposicion; hoy: string; diasConsumo: number }) {
  const { cobertura, consumoDiario, stock, plazoDias, fechaPedido, riesgo, faltantes, unidad } = aviso
  const estado = riesgo ? "Comprar hoy · riesgo de quiebre"
    : fechaPedido === hoy ? "Comprar hoy"
    : fechaPedido ? `Pedir el ${mostrarFecha(fechaPedido)}` : "Recomendación pendiente"

  return (
    <li className={`compras-aviso${riesgo ? " compras-aviso-riesgo" : ""}`}>
      <div className="compras-aviso-titulo">
        <div><h3>{aviso.nombre}</h3>{aviso.codigo && <span>{aviso.codigo}</span>}</div>
        <strong className={`compras-estado ${riesgo ? "riesgo" : fechaPedido ? "fecha" : "pendiente"}`}>{estado}</strong>
      </div>
      <dl className="compras-medidas">
        <div><dt>Stock disponible</dt><dd>{stock === null ? "Sin saldo" : `${mostrarNumero(stock)} ${unidad}`}</dd></div>
        <div><dt>Cobertura estimada</dt><dd>{cobertura === null ? "Sin estimar" : `${mostrarNumero(cobertura)} días`}</dd></div>
        <div><dt>Plazo del proveedor</dt><dd>{plazoDias === null ? "Sin registro" : `${numero.format(plazoDias)} días`}</dd></div>
      </dl>
      {faltantes.length > 0 && <p className="compras-faltantes">Datos pendientes: {faltantes.join(", ")}.</p>}
      <details>
        <summary>Cómo se calcula</summary>
        <p>La cobertura es el saldo del Kardex dividido por el consumo diario estimado.
          {consumoDiario !== null
            ? ` Para este insumo se registraron en promedio ${mostrarNumero(consumoDiario)} ${unidad} al día.`
            : ` El promedio requiere salidas confirmadas de producción en los últimos ${diasConsumo} días completos.`}
        </p>
        <p>Para sugerir cuándo pedir, se resta el plazo del proveedor al tiempo estimado hasta agotar existencias. Solo se suman las entregas confirmadas que llegan a tiempo.
          {fechaPedido && ` Se consideraron ${aviso.recepcionesConsideradas} entregas confirmadas.`}
        </p>
      </details>
    </li>
  )
}

export default function ComprasAnticipar() {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof cargarComprasResumen>> | null>(null)
  const [error, setError] = useState("")
  const [consulta, setConsulta] = useState(0)
  const [visibles, setVisibles] = useState(loteVisible)

  useEffect(() => {
    let vigente = true
    cargarComprasResumen().then(
      resultado => { if (vigente) setDatos(resultado) },
      motivo => { if (vigente) setError(motivo instanceof Error ? motivo.message : "No se pudieron cargar los insumos.") },
    )
    return () => { vigente = false }
  }, [consulta])

  return (
    <div className="compras-resumen">
      <section className="compras-panel" aria-labelledby="compras-anticipar">
        <div className="compras-seccion-titulo">
          <div><h1 id="compras-anticipar">Compras por anticipar</h1>
            <p>Primero aparecen los insumos con mayor urgencia de compra.</p></div>
          {datos && <span className="compras-periodo">Consumo · {mostrarFecha(datos.desde)} al {mostrarFecha(datos.hasta)}</span>}
        </div>
        {error ? <div className="compras-mensaje" role="alert">
          <p>{error}</p>
          <button type="button" className="compras-boton" onClick={() => { setError(""); setConsulta(anterior => anterior + 1) }}>Reintentar</button>
        </div>
          : !datos ? <p className="compras-mensaje" role="status">Consultando insumos y consumos…</p>
          : datos.avisos.length === 0 ? <p className="compras-mensaje">No hay materias primas ni empaques disponibles en el catálogo del Kardex.</p>
          : <>
            {!datos.saldoConciliado && <p className="compras-mensaje">Saldo referencial. Confirma las existencias físicas en Kardex.</p>}
            {!datos.consumosDisponibles && <p className="compras-mensaje" role="alert">No se pudo consultar el consumo del Kardex. La cobertura queda pendiente.</p>}
            <ul className="compras-lista">
              {datos.avisos.slice(0, visibles).map(aviso => <FilaReposicion key={aviso.id} aviso={aviso} hoy={datos.hoy} diasConsumo={datos.diasConsumo} />)}
            </ul>
            {visibles < datos.avisos.length && <button type="button" className="compras-boton" onClick={() => setVisibles(actual => actual + loteVisible)}>
              Mostrar más insumos ({datos.avisos.length - visibles})
            </button>}
          </>}
      </section>
    </div>
  )
}
