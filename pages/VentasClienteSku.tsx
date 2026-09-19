import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  importarVentasDb,
  obtenerImportacionesVentasDb,
  obtenerVentasSemanalesDb,
  type ImportacionVentasDb,
  type VentaSemanalDb,
} from "../repositories/ventasRepository"
import {
  leerArchivoVentas,
  type ResultadoArchivoVentas,
} from "../utils/ventasExcel"

type Vista = "RESUMEN" | "IMPORTAR" | "HISTORIAL"

type VentasClienteSkuProps = {
  cambiarPantalla: (pantalla: string) => void
}

type ResumenSemana = {
  semanaInicio: string
  unidades: number
  venta: number
  movimientos: number
  variacion: number | null
}

function moneda(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numero(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    maximumFractionDigits: 0,
  })
}

function fecha(valor: string) {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${valor.slice(0, 10)}T00:00:00Z`))
}

function fechaHora(valor: string) {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(valor))
}

function sumarDias(fechaIso: string, dias: number) {
  const valor = new Date(`${fechaIso}T00:00:00Z`)
  valor.setUTCDate(valor.getUTCDate() + dias)
  return valor.toISOString().slice(0, 10)
}

function etiquetaSemana(inicio: string) {
  return `${fecha(inicio)} – ${fecha(sumarDias(inicio, 6))}`
}

export default function VentasClienteSku({
  cambiarPantalla,
}: VentasClienteSkuProps) {
  const [vista, setVista] = useState<Vista>("IMPORTAR")
  const [ventas, setVentas] = useState<VentaSemanalDb[]>([])
  const [importaciones, setImportaciones] = useState<ImportacionVentasDb[]>([])
  const [cliente, setCliente] = useState("TODOS")
  const [sku, setSku] = useState("TODOS")
  const [archivoNombre, setArchivoNombre] = useState("")
  const [archivoLeido, setArchivoLeido] =
    useState<ResultadoArchivoVentas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")

    try {
      const [ventasDb, importacionesDb] = await Promise.all([
        obtenerVentasSemanalesDb(),
        obtenerImportacionesVentasDb(),
      ])
      setVentas(ventasDb)
      setImportaciones(importacionesDb)
      if (ventasDb.length > 0 && importacionesDb.length > 0) {
        setVista((actual) => actual === "IMPORTAR" ? "RESUMEN" : actual)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el módulo de ventas.",
      )
    } finally {
      setCargando(false)
    }
  }

  function limpiarArchivo() {
    setArchivoNombre("")
    setArchivoLeido(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function seleccionarArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    if (!archivo) return

    setLeyendo(true)
    setMensaje("")
    setError("")
    setArchivoLeido(null)

    try {
      const resultado = await leerArchivoVentas(archivo)
      setArchivoNombre(archivo.name)
      setArchivoLeido(resultado)
    } catch (err) {
      limpiarArchivo()
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo leer el reporte de ventas.",
      )
    } finally {
      setLeyendo(false)
    }
  }

  async function guardarArchivo() {
    if (!archivoLeido || !archivoNombre) return

    if (
      importaciones.length > 0 &&
      !window.confirm(
        "Las líneas ya existentes se actualizarán por comprobante y SKU; las ventas nuevas se agregarán. ¿Deseas continuar?",
      )
    ) {
      return
    }

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      const respuesta = await importarVentasDb({
        archivoNombre,
        lineas: archivoLeido.lineas,
      })

      setMensaje(
        `Ventas guardadas: ${numero(respuesta.movimientos_nuevos)} nuevas y ${numero(respuesta.movimientos_actualizados)} actualizadas.`,
      )
      limpiarArchivo()
      await cargarDatos()
      setVista("RESUMEN")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron guardar las ventas.",
      )
    } finally {
      setGuardando(false)
    }
  }

  const clientes = useMemo(
    () => Array.from(new Set(ventas.map((item) => item.cliente_nombre)))
      .sort((a, b) => a.localeCompare(b)),
    [ventas],
  )

  const skus = useMemo(() => {
    const mapa = new Map<string, string>()
    ventas
      .filter((item) => cliente === "TODOS" || item.cliente_nombre === cliente)
      .forEach((item) => mapa.set(item.sku, item.producto_nombre))
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [ventas, cliente])

  useEffect(() => {
    if (sku === "TODOS") return
    if (!skus.some(([codigo]) => codigo === sku)) setSku("TODOS")
  }, [sku, skus])

  const ventasFiltradas = useMemo(
    () => ventas.filter((item) =>
      (cliente === "TODOS" || item.cliente_nombre === cliente) &&
      (sku === "TODOS" || item.sku === sku)),
    [ventas, cliente, sku],
  )

  const resumenSemanal = useMemo<ResumenSemana[]>(() => {
    const mapa = new Map<string, Omit<ResumenSemana, "variacion">>()

    ventasFiltradas.forEach((item) => {
      const actual = mapa.get(item.semana_inicio) ?? {
        semanaInicio: item.semana_inicio,
        unidades: 0,
        venta: 0,
        movimientos: 0,
      }
      actual.unidades += Number(item.unidades ?? 0)
      actual.venta += Number(item.venta_sin_impuestos ?? 0)
      actual.movimientos += Number(item.movimientos ?? 0)
      mapa.set(item.semana_inicio, actual)
    })

    return Array.from(mapa.values())
      .sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio))
      .map((item, indice, lista) => {
        const anterior = lista[indice - 1]?.venta
        const variacion = indice === 0
          ? null
          : anterior === 0
            ? item.venta > 0 ? 100 : 0
            : ((item.venta - anterior) / Math.abs(anterior)) * 100
        return { ...item, variacion }
      })
  }, [ventasFiltradas])

  const totalVenta = resumenSemanal.reduce((total, item) => total + item.venta, 0)
  const totalUnidades = resumenSemanal.reduce(
    (total, item) => total + item.unidades,
    0,
  )
  const totalMovimientos = resumenSemanal.reduce(
    (total, item) => total + item.movimientos,
    0,
  )

  const rankingClientes = useMemo(
    () => agruparVentas(ventasFiltradas, (item) => item.cliente_nombre)
      .slice(0, 8),
    [ventasFiltradas],
  )

  const rankingSku = useMemo(
    () => agruparVentas(
      ventasFiltradas,
      (item) => `${item.sku}|${item.producto_nombre}`,
    ).slice(0, 12),
    [ventasFiltradas],
  )

  return (
    <main className="c1-ventas" style={pagina}>
      <style>{estilosResponsive}</style>

      <ModalMensaje
        abierto={mensaje !== ""}
        tipo="EXITO"
        mensaje={mensaje}
        cerrar={() => setMensaje("")}
        cierreAutomaticoMs={4000}
      />
      <ModalMensaje
        abierto={error !== ""}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />

      <header className="ventas-header" style={cabecera}>
        <div>
          <span style={etiqueta}>FACTURACIÓN REAL</span>
          <h1 style={titulo}>Ventas por cliente y SKU</h1>
          <p style={subtitulo}>
            Importa semanalmente el reporte de ventas y compara el crecimiento
            de unidades y facturación sin impuestos.
          </p>
        </div>
        <button
          type="button"
          onClick={cargarDatos}
          disabled={cargando || guardando}
          style={botonSecundario}
        >
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </header>

      <nav className="ventas-main-tabs" aria-label="Tipos de reportes">
        <button
          type="button"
          onClick={() => cambiarPantalla("Reportes")}
        >
          Producción
        </button>
        <button type="button" className="active">
          Ventas
        </button>
      </nav>

      <nav style={pestanas}>
        {([
          ["RESUMEN", "Resumen semanal"],
          ["IMPORTAR", "Importar Excel"],
          ["HISTORIAL", "Historial"],
        ] as [Vista, string][]).map(([codigo, texto]) => (
          <button
            key={codigo}
            type="button"
            onClick={() => setVista(codigo)}
            style={{
              ...botonPestana,
              ...(vista === codigo ? botonPestanaActivo : {}),
            }}
          >
            {texto}
          </button>
        ))}
      </nav>

      {vista === "IMPORTAR" && (
        <section style={panel}>
          <div className="ventas-panel-heading">
            <div>
              <h2 style={tituloPanel}>Cargar reporte de ventas</h2>
              <p style={descripcion}>
                Puedes cargar únicamente la semana nueva o un reporte acumulado.
                El sistema no duplicará comprobantes ya guardados.
              </p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={leyendo || guardando}
              style={botonPrincipal}
            >
              {leyendo ? "Leyendo archivo..." : "Seleccionar archivo Excel"}
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={seleccionarArchivo}
            style={{ display: "none" }}
          />

          {archivoLeido ? (
            <>
              <div className="ventas-summary-grid" style={resumenArchivo}>
                <Tarjeta etiqueta="Archivo" valor={archivoNombre} />
                <Tarjeta
                  etiqueta="Periodo"
                  valor={`${fecha(archivoLeido.fechaDesde)} a ${fecha(archivoLeido.fechaHasta)}`}
                />
                <Tarjeta
                  etiqueta="Movimientos"
                  valor={numero(archivoLeido.movimientos)}
                />
                <Tarjeta etiqueta="Clientes" valor={numero(archivoLeido.clientes)} />
                <Tarjeta etiqueta="SKU" valor={numero(archivoLeido.skus)} />
                <Tarjeta etiqueta="Unidades" valor={numero(archivoLeido.unidades)} />
                <Tarjeta
                  etiqueta="Venta sin impuestos"
                  valor={moneda(archivoLeido.ventaSinImpuestos)}
                />
              </div>

              <div style={aviso}>
                La identificación se realiza por comprobante y SKU. Si vuelves a
                cargar el acumulado, se actualizarán las líneas existentes y se
                agregarán solamente las nuevas.
              </div>

              <div style={acciones}>
                <button
                  type="button"
                  onClick={limpiarArchivo}
                  disabled={guardando}
                  style={botonSecundario}
                >
                  Quitar archivo
                </button>
                <button
                  type="button"
                  onClick={guardarArchivo}
                  disabled={guardando}
                  style={botonPrincipal}
                >
                  {guardando ? "Guardando..." : "Guardar ventas"}
                </button>
              </div>
            </>
          ) : (
            <div style={zonaVacia}>
              Selecciona el reporte “VENTAS POR ITEM” exportado desde Admisys.
            </div>
          )}
        </section>
      )}

      {vista === "RESUMEN" && (
        <>
          <section style={panel}>
            <div className="ventas-panel-heading">
              <div>
                <h2 style={tituloPanel}>Filtros</h2>
                <p style={descripcion}>
                  Analiza todos los movimientos o selecciona un cliente y un SKU.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVista("IMPORTAR")}
                style={botonPrincipal}
              >
                Importar ventas
              </button>
            </div>

            <div className="ventas-filtros" style={filtros}>
              <label style={label}>
                Cliente
                <select
                  value={cliente}
                  onChange={(evento) => {
                    setCliente(evento.target.value)
                    setSku("TODOS")
                  }}
                  style={campo}
                >
                  <option value="TODOS">Todos los clientes</option>
                  {clientes.map((nombre) => (
                    <option key={nombre} value={nombre}>{nombre}</option>
                  ))}
                </select>
              </label>

              <label style={label}>
                SKU
                <select
                  value={sku}
                  onChange={(evento) => setSku(evento.target.value)}
                  style={campo}
                >
                  <option value="TODOS">Todos los SKU</option>
                  {skus.map(([codigo, nombre]) => (
                    <option key={codigo} value={codigo}>
                      {nombre} · {codigo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="ventas-kpis" style={kpis}>
            <Tarjeta etiqueta="Facturación sin impuestos" valor={moneda(totalVenta)} />
            <Tarjeta etiqueta="Unidades facturadas" valor={numero(totalUnidades)} />
            <Tarjeta etiqueta="Movimientos" valor={numero(totalMovimientos)} />
            <Tarjeta etiqueta="Semanas" valor={numero(resumenSemanal.length)} />
            <Tarjeta etiqueta="Clientes" valor={numero(new Set(ventasFiltradas.map((item) => item.cliente_nombre)).size)} />
            <Tarjeta etiqueta="SKU" valor={numero(new Set(ventasFiltradas.map((item) => item.sku)).size)} />
          </section>

          <section style={panel}>
            <h2 style={tituloPanel}>Evolución semanal de la facturación</h2>
            <p style={descripcion}>Valores sin impuestos según la fecha de emisión.</p>
            {resumenSemanal.length === 0 ? (
              <div style={zonaVacia}>Aún no existen ventas para este filtro.</div>
            ) : (
              <GraficoVentas datos={resumenSemanal} />
            )}
          </section>

          <section style={panel}>
            <h2 style={tituloPanel}>Crecimiento semana contra semana</h2>
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>Semana</th>
                    <th style={encabezadoNumero}>Unidades</th>
                    <th style={encabezadoNumero}>Facturación</th>
                    <th style={encabezadoNumero}>Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {[...resumenSemanal].reverse().map((semana) => (
                    <tr key={semana.semanaInicio}>
                      <td style={celda}>{etiquetaSemana(semana.semanaInicio)}</td>
                      <td style={celdaNumero}>{numero(semana.unidades)}</td>
                      <td style={celdaNumero}>{moneda(semana.venta)}</td>
                      <td style={celdaNumero}>
                        <Variacion valor={semana.variacion} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="ventas-rankings" style={rankings}>
            <Ranking
              titulo="Facturación por cliente"
              datos={rankingClientes.map((item) => ({
                ...item,
                etiqueta: item.etiqueta,
              }))}
            />
            <Ranking
              titulo="Facturación por SKU"
              datos={rankingSku.map((item) => ({
                ...item,
                etiqueta: item.etiqueta.split("|")[1] ?? item.etiqueta,
              }))}
            />
          </div>
        </>
      )}

      {vista === "HISTORIAL" && (
        <section style={panel}>
          <h2 style={tituloPanel}>Archivos procesados</h2>
          {importaciones.length === 0 ? (
            <div style={zonaVacia}>Aún no existen importaciones de ventas.</div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>Fecha de carga</th>
                    <th style={encabezado}>Archivo</th>
                    <th style={encabezado}>Periodo</th>
                    <th style={encabezadoNumero}>Movimientos</th>
                    <th style={encabezadoNumero}>Nuevos</th>
                    <th style={encabezadoNumero}>Actualizados</th>
                    <th style={encabezadoNumero}>Unidades</th>
                    <th style={encabezadoNumero}>Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {importaciones.map((item) => (
                    <tr key={item.id}>
                      <td style={celda}>{fechaHora(item.creado_en)}</td>
                      <td style={celda}>{item.archivo_nombre}</td>
                      <td style={celda}>
                        {fecha(item.fecha_desde)} a {fecha(item.fecha_hasta)}
                      </td>
                      <td style={celdaNumero}>{numero(item.movimientos_archivo)}</td>
                      <td style={celdaNumero}>{numero(item.movimientos_nuevos)}</td>
                      <td style={celdaNumero}>{numero(item.movimientos_actualizados)}</td>
                      <td style={celdaNumero}>{numero(item.unidades_archivo)}</td>
                      <td style={celdaNumero}>{moneda(item.venta_sin_impuestos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function agruparVentas(
  ventas: VentaSemanalDb[],
  clave: (item: VentaSemanalDb) => string,
) {
  const mapa = new Map<string, { etiqueta: string; venta: number; unidades: number }>()
  ventas.forEach((item) => {
    const etiqueta = clave(item)
    const actual = mapa.get(etiqueta) ?? { etiqueta, venta: 0, unidades: 0 }
    actual.venta += Number(item.venta_sin_impuestos ?? 0)
    actual.unidades += Number(item.unidades ?? 0)
    mapa.set(etiqueta, actual)
  })
  return Array.from(mapa.values()).sort((a, b) => b.venta - a.venta)
}

function Tarjeta({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <article style={tarjeta}>
      <span style={tarjetaEtiqueta}>{etiqueta}</span>
      <strong style={tarjetaValor}>{valor}</strong>
    </article>
  )
}

function Variacion({ valor }: { valor: number | null }) {
  if (valor === null) return <span style={{ color: "#6b7280" }}>—</span>
  const positivo = valor >= 0
  return (
    <strong style={{ color: positivo ? "#15803d" : "#b91c1c" }}>
      {positivo ? "▲" : "▼"} {Math.abs(valor).toLocaleString("es-EC", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%
    </strong>
  )
}

function Ranking({
  titulo: tituloRanking,
  datos,
}: {
  titulo: string
  datos: { etiqueta: string; venta: number; unidades: number }[]
}) {
  const maximo = Math.max(...datos.map((item) => item.venta), 1)
  return (
    <section style={panel}>
      <h2 style={tituloPanel}>{tituloRanking}</h2>
      {datos.length === 0 ? (
        <div style={zonaVacia}>Sin información.</div>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {datos.map((item) => (
            <div key={item.etiqueta}>
              <div style={rankingCabecera}>
                <span>{item.etiqueta}</span>
                <strong>{moneda(item.venta)}</strong>
              </div>
              <div style={barraFondo}>
                <div
                  style={{
                    ...barraValor,
                    width: `${Math.max((item.venta / maximo) * 100, 1)}%`,
                  }}
                />
              </div>
              <small style={{ color: "#786d68" }}>
                {numero(item.unidades)} Unid.
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function GraficoVentas({ datos }: { datos: ResumenSemana[] }) {
  const ancho = 940
  const alto = 300
  const margen = { izquierda: 72, derecha: 22, arriba: 28, abajo: 58 }
  const anchoUtil = ancho - margen.izquierda - margen.derecha
  const altoUtil = alto - margen.arriba - margen.abajo
  const maximo = Math.max(...datos.map((item) => item.venta), 1) * 1.08
  const x = (indice: number) => margen.izquierda +
    (datos.length === 1 ? anchoUtil / 2 : (indice / (datos.length - 1)) * anchoUtil)
  const y = (valor: number) => margen.arriba + altoUtil - (valor / maximo) * altoUtil
  const puntos = datos.map((item, indice) => `${x(indice)},${y(item.venta)}`).join(" ")
  const cada = Math.max(1, Math.ceil(datos.length / 10))

  return (
    <div className="ventas-chart">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Evolución semanal de ventas">
        {[0, 0.25, 0.5, 0.75, 1].map((porcion) => {
          const valor = maximo * porcion
          const posicionY = y(valor)
          return (
            <g key={porcion}>
              <line
                x1={margen.izquierda}
                x2={ancho - margen.derecha}
                y1={posicionY}
                y2={posicionY}
                stroke="#eadfd9"
              />
              <text
                x={margen.izquierda - 10}
                y={posicionY + 4}
                textAnchor="end"
                fontSize="10"
                fill="#766762"
              >
                {moneda(valor).replace(",00", "")}
              </text>
            </g>
          )
        })}

        <polyline
          points={puntos}
          fill="none"
          stroke="#8f1d24"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {datos.map((item, indice) => (
          <g key={item.semanaInicio}>
            <circle cx={x(indice)} cy={y(item.venta)} r="5" fill="#f7931e">
              <title>{etiquetaSemana(item.semanaInicio)}: {moneda(item.venta)}</title>
            </circle>
            {(indice % cada === 0 || indice === datos.length - 1) && (
              <text
                x={x(indice)}
                y={alto - 25}
                textAnchor="middle"
                fontSize="9"
                fill="#766762"
              >
                {fecha(item.semanaInicio).replace(" de 2026", "")}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

const pagina = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "24px",
  color: "#25272b",
}

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "18px",
  marginBottom: "18px",
}

const etiqueta = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: ".7px",
}

const titulo = { margin: "5px 0 4px", fontSize: "32px", color: "#261d1c" }
const subtitulo = { margin: 0, color: "#6b7280", lineHeight: 1.45 }

const pestanas = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "6px",
  padding: "6px",
  marginBottom: "22px",
  borderRadius: "11px",
  background: "#e9ebef",
}

const botonPestana = {
  padding: "10px 18px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "#6b7280",
  fontWeight: 800,
  cursor: "pointer",
}

const botonPestanaActivo = { background: "#9f1f28", color: "white" }

const panel = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "22px",
  marginBottom: "18px",
  border: "1px solid #e0e3e8",
  borderRadius: "14px",
  background: "white",
  boxShadow: "0 6px 20px rgba(70,42,32,.045)",
}

const tituloPanel = { margin: 0, fontSize: "20px", color: "#211b1b" }
const descripcion = { margin: "5px 0 0", color: "#6b7280", lineHeight: 1.45 }

const botonPrincipal = {
  padding: "11px 17px",
  border: "none",
  borderRadius: "9px",
  background: "#9f1f28",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
}

const botonSecundario = {
  padding: "10px 16px",
  border: "1px solid #9f1f28",
  borderRadius: "9px",
  background: "white",
  color: "#9f1f28",
  fontWeight: 800,
  cursor: "pointer",
}

const resumenArchivo = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "12px",
  marginTop: "22px",
}

const kpis = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: "12px",
  marginBottom: "18px",
}

const tarjeta = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  padding: "16px",
  border: "1px solid #e0e3e8",
  borderRadius: "12px",
  background: "white",
}

const tarjetaEtiqueta = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase" as const,
  letterSpacing: ".35px",
}

const tarjetaValor = {
  overflow: "hidden",
  color: "#8f1d24",
  fontSize: "21px",
  textOverflow: "ellipsis",
}

const aviso = {
  marginTop: "16px",
  padding: "12px 14px",
  border: "1px solid #fed7aa",
  borderRadius: "10px",
  background: "#fff7ed",
  color: "#9a4c00",
  lineHeight: 1.45,
}

const acciones = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "18px",
}

const zonaVacia = {
  marginTop: "18px",
  padding: "24px",
  border: "1px dashed #d7dbe2",
  borderRadius: "11px",
  background: "#fafafa",
  color: "#6b7280",
  textAlign: "center" as const,
}

const filtros = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(240px, 380px))",
  gap: "14px",
  marginTop: "18px",
}

const label = {
  display: "grid",
  gap: "7px",
  color: "#6b5b55",
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase" as const,
}

const campo = {
  width: "100%",
  minHeight: "43px",
  padding: "9px 11px",
  border: "1px solid #d6d9df",
  borderRadius: "8px",
  background: "white",
}

const tabla = {
  width: "100%",
  minWidth: "760px",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "11px",
  borderBottom: "2px solid #ded2cc",
  color: "#6b5b55",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
}

const encabezadoNumero = { ...encabezado, textAlign: "right" as const }
const celda = { padding: "11px", borderBottom: "1px solid #eeeeee" }
const celdaNumero = { ...celda, textAlign: "right" as const, whiteSpace: "nowrap" as const }

const rankings = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "18px",
}

const rankingCabecera = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "5px",
  color: "#403735",
  fontSize: "12px",
}

const barraFondo = {
  height: "7px",
  marginBottom: "4px",
  borderRadius: "999px",
  background: "#f0e7e2",
  overflow: "hidden",
}

const barraValor = {
  height: "100%",
  borderRadius: "999px",
  background: "linear-gradient(90deg, #8f1d24, #f7931e)",
}

const estilosResponsive = `
  .c1-ventas .ventas-panel-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
  }

  .c1-ventas .ventas-main-tabs {
    display: flex;
    gap: 6px;
    padding: 6px;
    margin-bottom: 14px;
    border-radius: 11px;
    background: #e9ebef;
  }

  .c1-ventas .ventas-main-tabs button {
    flex: 0 1 210px;
    min-height: 42px;
    padding: 10px 18px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #6b7280;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .c1-ventas .ventas-main-tabs button.active {
    background: #9f1f28;
    color: white;
  }

  .c1-ventas .ventas-chart {
    width: 100%;
    margin-top: 18px;
    overflow-x: auto;
    border: 1px solid #eee3dd;
    border-radius: 12px;
    background: #fffdfb;
  }

  .c1-ventas .ventas-chart svg {
    display: block;
    min-width: 760px;
    width: 100%;
    height: auto;
  }

  @media (max-width: 1100px) {
    .c1-ventas { padding: 18px !important; }
    .c1-ventas .ventas-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  }

  @media (max-width: 760px) {
    .c1-ventas { padding: 14px !important; }
    .c1-ventas .ventas-header,
    .c1-ventas .ventas-panel-heading {
      flex-direction: column;
    }
    .c1-ventas .ventas-header button,
    .c1-ventas .ventas-panel-heading button {
      width: 100%;
    }
    .c1-ventas h1 { font-size: 25px !important; }
    .c1-ventas nav button { flex: 1 1 140px; }
    .c1-ventas .ventas-main-tabs button { flex: 1 1 50%; }
    .c1-ventas .ventas-kpis,
    .c1-ventas .ventas-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
    .c1-ventas .ventas-rankings {
      grid-template-columns: 1fr !important;
    }
    .c1-ventas .ventas-filtros {
      grid-template-columns: 1fr !important;
    }
  }
`
