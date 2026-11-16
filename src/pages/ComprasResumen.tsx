import { useEffect, useState } from "react"
import LogoCibuspan from "../components/LogoCibuspan"
import { cargarComprasResumen } from "../repositories/comprasResumenRepository"
import type { AvisoReposicion } from "../utils/reposicionCompras"
import "./comprasResumen.css"

const secciones = [
  { nombre: "Materias primas y empaques", ruta: "Materias Primas y Empaques", descripcion: "Consulta y actualiza el catálogo de insumos.", icono: "m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10" },
  { nombre: "Proveedores", ruta: "Proveedores", pendiente: true, icono: "M3 8h11v9H3zm11 3h4l3 3v3h-7M6 17v3m12-3v3" },
  { nombre: "Facturas", ruta: "Facturas", descripcion: "Consulta y registra facturas de proveedores.", icono: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7" },
  { nombre: "Facturas del SRI", ruta: "Facturas del SRI", descripcion: "Gestiona los XML y los RIDE de las facturas recibidas.", icono: "M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8m-8 4h8m-8 4h4" },
  { nombre: "Costos", ruta: "Costos", pendiente: true, icono: "M12 3v18m4-14H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7" },
  { nombre: "Kardex", ruta: "Kardex", descripcion: "Revisa saldos y movimientos de inventario.", icono: "M5 4h14v16H5zM9 4v16m3-11h4m-4 5h4" },
  { nombre: "Historial", ruta: "Historial", pendiente: true, icono: "M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v5l4 2" },
  { nombre: "Análisis", ruta: "Análisis", pendiente: true, icono: "M4 4v16h16M8 16v-4m4 4V8m4 8V5" },
].map(seccion => ({ ...seccion, ruta: `Compras · ${seccion.ruta}` }))

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

export default function ComprasResumen({ puedeAcceder, cambiarPantalla }: {
  puedeAcceder: (pantalla: string) => boolean
  cambiarPantalla: (pantalla: string) => void
}) {
  const puedeLeerKardex = puedeAcceder("Compras · Kardex")
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof cargarComprasResumen>> | null>(null)
  const [error, setError] = useState("")
  const [consulta, setConsulta] = useState(0)
  const [visibles, setVisibles] = useState(loteVisible)

  useEffect(() => {
    if (!puedeLeerKardex) return
    let vigente = true
    cargarComprasResumen().then(
      resultado => { if (vigente) setDatos(resultado) },
      motivo => { if (vigente) setError(motivo instanceof Error ? motivo.message : "No se pudieron cargar los insumos.") },
    )
    return () => { vigente = false }
  }, [puedeLeerKardex, consulta])

  const tarjetas = secciones.filter(seccion => puedeAcceder(seccion.ruta))

  return (
    <div className="compras-resumen">
      <header className="compras-cabecera">
        <LogoCibuspan ancho={164} />
        <div><h1>Resumen de compras</h1><p>Revisa tus insumos y planifica qué pedir primero.</p></div>
      </header>
      <section className="compras-panel" aria-labelledby="compras-anticipar">
        <div className="compras-seccion-titulo">
          <div><h2 id="compras-anticipar">Compras por anticipar</h2>
            <p>Primero aparecen los insumos con mayor urgencia de compra.</p></div>
          {puedeLeerKardex && datos && <span className="compras-periodo">Consumo · {mostrarFecha(datos.desde)} al {mostrarFecha(datos.hasta)}</span>}
        </div>
        {!puedeLeerKardex ? <p className="compras-mensaje">Necesitas acceso a Kardex de Compras para consultar existencias y consumos.</p>
          : error ? <div className="compras-mensaje" role="alert">
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
      {tarjetas.length > 0 && <section className="compras-accesos" aria-labelledby="compras-secciones">
        <h2 id="compras-secciones">Secciones de compras</h2>
        <div className="compras-tarjetas">
          {tarjetas.map(({ ruta, nombre, descripcion, pendiente, icono }) => (
            <button key={ruta} type="button" className="compras-tarjeta" onClick={() => { if (puedeAcceder(ruta)) cambiarPantalla(ruta) }}>
              <span className="compras-icono"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icono} /></svg></span>
              <span><strong>{nombre}</strong><span className={pendiente ? "compras-en-desarrollo" : ""}>{pendiente ? "Pendiente de implementación" : descripcion}</span></span>
              <span className="compras-flecha" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </section>}
    </div>
  )
}
