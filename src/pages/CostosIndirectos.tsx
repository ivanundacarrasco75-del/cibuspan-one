import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react"

import ModalMensaje from "../components/ModalMensaje"
import ReporteMargenBrutoAnalitico from "./ReporteMargenBrutoAnalitico"
import ReporteEstructuraCostos from "./ReporteEstructuraCostos"
import {
  importarBalanceResultadosDb,
  obtenerImportacionesResultadosDb,
  obtenerResultadosMensualesDb,
  obtenerMargenBrutoMensualDb,
  type ImportacionResultadosDb,
  type ResultadoMensualDb,
  type MargenBrutoMensualDb,
} from "../repositories/costosIndirectosRepository"
import {
  leerArchivoBalance,
  type ResultadoArchivoBalance,
} from "../utils/balanceResultadosExcel"

type Vista = "IMPORTAR" | "MARGEN" | "RESUMEN" | "HISTORIAL"

function mesPeriodo(periodo: string) {
  const [anio, mes] = periodo.split("-").map(Number)
  return new Intl.DateTimeFormat("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
}

function fechaHora(valor: string) {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(valor))
}

function moneda(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function porcentaje(valor: number | null | undefined) {
  return `${Number(valor ?? 0).toLocaleString("es-EC", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

export default function CostosIndirectos() {
  const [vista, setVista] = useState<Vista>("MARGEN")
  const [resultados, setResultados] = useState<ResultadoMensualDb[]>([])
  const [margenes, setMargenes] = useState<MargenBrutoMensualDb[]>([])
  const [importaciones, setImportaciones] = useState<
    ImportacionResultadosDb[]
  >([])
  const [archivoNombre, setArchivoNombre] = useState("")
  const [archivoLeido, setArchivoLeido] =
    useState<ResultadoArchivoBalance | null>(null)
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
      const [resultadosDb, importacionesDb, margenesDb] = await Promise.all([
        obtenerResultadosMensualesDb(),
        obtenerImportacionesResultadosDb(),
        obtenerMargenBrutoMensualDb(),
      ])
      setResultados(resultadosDb)
      setImportaciones(importacionesDb)
      setMargenes(margenesDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el módulo de costos.",
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

  async function seleccionarArchivo(
    evento: ChangeEvent<HTMLInputElement>,
  ) {
    const archivo = evento.target.files?.[0]
    if (!archivo) return

    setLeyendo(true)
    setMensaje("")
    setError("")
    setArchivoLeido(null)

    try {
      const resultado = await leerArchivoBalance(archivo)
      setArchivoNombre(archivo.name)
      setArchivoLeido(resultado)
    } catch (err) {
      limpiarArchivo()
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo leer el balance.",
      )
    } finally {
      setLeyendo(false)
    }
  }

  async function guardarArchivo() {
    if (!archivoLeido || !archivoNombre) return

    const mesesGuardados = new Set(
      resultados.map((resultado) => resultado.periodo),
    )
    const mesesActualizados = archivoLeido.periodos.filter((periodo) =>
      mesesGuardados.has(periodo),
    )

    if (
      mesesActualizados.length > 0 &&
      !window.confirm(
        `El archivo actualizará ${mesesActualizados.length} meses ya guardados y conservará el historial de importaciones. ¿Deseas continuar?`,
      )
    ) {
      return
    }

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      const respuesta = await importarBalanceResultadosDb({
        archivoNombre,
        lineas: archivoLeido.lineas,
      })

      setMensaje(
        `Balance guardado: ${respuesta.meses_importados} meses, ${respuesta.cuentas_importadas} cuentas y ${respuesta.registros_importados} valores mensuales.`,
      )
      limpiarArchivo()
      await cargarDatos()
      setVista("RESUMEN")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el balance.",
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main style={pagina}>
      <ModalMensaje
        abierto={mensaje !== ""}
        tipo="EXITO"
        mensaje={mensaje}
        cerrar={() => setMensaje("")}
        cierreAutomaticoMs={3500}
      />
      <ModalMensaje
        abierto={error !== ""}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />

      <header style={cabecera}>
        <div>
          <span style={etiqueta}>COSTOS Y RENTABILIDAD</span>
          <h1 style={titulo}>Costos de producción</h1>
          <p style={subtitulo}>
            Base contable mensual para validar primero el margen bruto real
            del negocio. El EBITDA queda fuera de esta etapa.
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

      <div style={pestanas}>
        {([
          ["MARGEN", "Margen bruto"],
          ["IMPORTAR", "Importar balance"],
          ["RESUMEN", "Resultado contable existente"],
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
      </div>


      {vista === "MARGEN" && (
        <>
          <ReporteEstructuraCostos />

          {margenes.length > 0 && (
            <ReporteMargenBrutoAnalitico margenes={margenes} />
          )}

          <section style={{ ...panel, marginTop: 16 }}>
            <div style={encabezadoPanel}>
              <div>
                <h2 style={tituloPanel}>Margen bruto contable y gerencial</h2>
                <p style={descripcion}>
                  El costo de ventas ya contiene MP, MOD y CIF capitalizados por
                  contabilidad. No se vuelven a sumar para evitar duplicación.
                  Solo se reclasifica como CIF gerencial la depreciación de
                  maquinaria actualmente registrada fuera del costo de producción.
                </p>
              </div>
            </div>

            {margenes.length === 0 ? (
              <div style={zonaVacia}>
                Aún no existen meses contables disponibles para calcular margen bruto.
              </div>
            ) : (
              <>
                {(() => {
                  const totales = margenes.reduce(
                    (acum, fila) => ({
                      ventasNetas: acum.ventasNetas + Number(fila.ventas_netas ?? 0),
                      costo: acum.costo + Number(fila.costo_fabricacion_gerencial ?? 0),
                      margen: acum.margen + Number(fila.margen_bruto ?? 0),
                    }),
                    { ventasNetas: 0, costo: 0, margen: 0 },
                  )
                  const margenPct =
                    totales.ventasNetas !== 0
                      ? (totales.margen / totales.ventasNetas) * 100
                      : 0

                  return (
                    <div style={resumenGrid}>
                      <Tarjeta
                        etiqueta="Ventas netas acumuladas"
                        valor={moneda(totales.ventasNetas)}
                      />
                      <Tarjeta
                        etiqueta="Costo fabricación acumulado"
                        valor={moneda(totales.costo)}
                      />
                      <Tarjeta
                        etiqueta="Margen bruto acumulado"
                        valor={moneda(totales.margen)}
                      />
                      <Tarjeta
                        etiqueta="Margen bruto acumulado %"
                        valor={porcentaje(margenPct)}
                      />
                    </div>
                  )
                })()}

                <div style={aviso}>
                  Fórmula oficial de esta etapa: Ventas netas − costo de ventas
                  contable − depreciación de maquinaria de producción = margen bruto
                  gerencial. Transporte, administración, comercial, financiamiento y
                  EBITDA no participan aquí.
                </div>

                <div style={{ overflowX: "auto", marginTop: 18 }}>
                  <table style={tabla}>
                    <thead>
                      <tr>
                        <th style={encabezado}>Mes</th>
                        <th style={encabezadoNumero}>Ventas brutas</th>
                        <th style={encabezadoNumero}>Devoluciones</th>
                        <th style={encabezadoNumero}>Descuentos</th>
                        <th style={encabezadoNumero}>Ventas netas</th>
                        <th style={encabezadoNumero}>Costo ventas contable</th>
                        <th style={encabezadoNumero}>Deprec. maquinaria</th>
                        <th style={encabezadoNumero}>Costo fabricación</th>
                        <th style={encabezadoNumero}>Margen bruto</th>
                        <th style={encabezadoNumero}>Margen bruto %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {margenes.map((fila) => (
                        <tr key={fila.periodo}>
                          <td style={celdaMes}>{mesPeriodo(fila.periodo)}</td>
                          <td style={celdaNumero}>{moneda(fila.ventas_brutas)}</td>
                          <td style={celdaNumero}>{moneda(fila.devoluciones_ventas)}</td>
                          <td style={celdaNumero}>{moneda(fila.descuentos_ventas)}</td>
                          <td style={celdaNumero}>
                            <strong>{moneda(fila.ventas_netas)}</strong>
                          </td>
                          <td style={celdaNumero}>{moneda(fila.costo_ventas_contable)}</td>
                          <td style={celdaNumero}>{moneda(fila.depreciacion_maquinaria)}</td>
                          <td style={celdaNumero}>
                            <strong>{moneda(fila.costo_fabricacion_gerencial)}</strong>
                          </td>
                          <td
                            style={{
                              ...celdaNumero,
                              color:
                                Number(fila.margen_bruto) >= 0 ? "#15803d" : "#b91c1c",
                            }}
                          >
                            <strong>{moneda(fila.margen_bruto)}</strong>
                          </td>
                          <td
                            style={{
                              ...celdaNumero,
                              color:
                                Number(fila.margen_bruto_porcentaje ?? 0) >= 0
                                  ? "#15803d"
                                  : "#b91c1c",
                            }}
                          >
                            <strong>{porcentaje(fila.margen_bruto_porcentaje)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {margenes.length > 0 && (
            <section style={{ ...panel, marginTop: 16 }}>
              <h2 style={tituloPanel}>Auditoría del costo de fabricación</h2>
              <p style={descripcion}>
                Estas columnas permiten comprobar de dónde sale el costo contable sin
                sumar dos veces MOD ni CIF ya capitalizados.
              </p>

              <div style={{ overflowX: "auto", marginTop: 18 }}>
                <table style={tabla}>
                  <thead>
                    <tr>
                      <th style={encabezado}>Mes</th>
                      <th style={encabezadoNumero}>Producto vendido 5.2.01</th>
                      <th style={encabezadoNumero}>MOD residual 5.2.02</th>
                      <th style={encabezadoNumero}>CIF residual 5.2.03</th>
                      <th style={encabezadoNumero}>Daños prod. .97</th>
                      <th style={encabezadoNumero}>Dev. producto .98</th>
                      <th style={encabezadoNumero}>Ajustes inv. .99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {margenes.map((fila) => (
                      <tr key={`aud-${fila.periodo}`}>
                        <td style={celdaMes}>{mesPeriodo(fila.periodo)}</td>
                        <td style={celdaNumero}>{moneda(fila.costo_producto_vendido)}</td>
                        <td style={celdaNumero}>{moneda(fila.mod_residual)}</td>
                        <td style={celdaNumero}>{moneda(fila.cif_residual)}</td>
                        <td style={celdaNumero}>{moneda(fila.desperdicio_danos_produccion)}</td>
                        <td style={celdaNumero}>{moneda(fila.desperdicio_devoluciones_producto)}</td>
                        <td style={celdaNumero}>{moneda(fila.ajustes_inventario_costo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </>
      )}

      {vista === "IMPORTAR" && (
        <section style={panel}>
          <div style={encabezadoPanel}>
            <div>
              <h2 style={tituloPanel}>Cargar balance de resultados</h2>
              <p style={descripcion}>
                Selecciona el archivo acumulado del mes. Los meses existentes
                se actualizarán y el mes nuevo se agregará automáticamente.
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
              <div style={resumenGrid}>
                <Tarjeta etiqueta="Archivo" valor={archivoNombre} />
                <Tarjeta
                  etiqueta="Periodo"
                  valor={`${mesPeriodo(archivoLeido.periodos[0])} a ${mesPeriodo(
                    archivoLeido.periodos.at(-1) ?? archivoLeido.periodos[0],
                  )}`}
                />
                <Tarjeta
                  etiqueta="Meses encontrados"
                  valor={String(archivoLeido.periodos.length)}
                />
                <Tarjeta
                  etiqueta="Cuentas contables"
                  valor={String(archivoLeido.cuentas)}
                />
                <Tarjeta
                  etiqueta="Valores mensuales"
                  valor={String(archivoLeido.registros)}
                />
              </div>

              <div style={aviso}>
                Se reemplazarán únicamente los valores de los meses incluidos
                en este archivo. Los demás meses permanecerán intactos.
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
                  {guardando ? "Guardando..." : "Guardar o actualizar meses"}
                </button>
              </div>
            </>
          ) : (
            <div style={zonaVacia}>
              Todavía no has seleccionado el balance comparativo.
            </div>
          )}
        </section>
      )}

      {vista === "RESUMEN" && (
        <section style={panel}>
          <h2 style={tituloPanel}>Resultados mensuales importados</h2>
          <p style={descripcion}>
            Esta es la lectura contable existente del sistema. Para decisiones
            de margen bruto usa la pestaña “Margen bruto”.
          </p>

          {resultados.length === 0 ? (
            <div style={zonaVacia}>Aún no existen meses importados.</div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>Mes</th>
                    <th style={encabezadoNumero}>Ventas netas</th>
                    <th style={encabezadoNumero}>Costo de ventas</th>
                    <th style={encabezadoNumero}>Gastos de ventas</th>
                    <th style={encabezadoNumero}>Gastos administrativos</th>
                    <th style={encabezadoNumero}>Resultado operativo</th>
                    <th style={encabezadoNumero}>EBITDA preliminar</th>
                    <th style={encabezadoNumero}>Margen EBITDA</th>
                    <th style={encabezadoNumero}>Resultado del ejercicio</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((resultado) => (
                    <tr key={resultado.periodo}>
                      <td style={celdaMes}>{mesPeriodo(resultado.periodo)}</td>
                      <td style={celdaNumero}>{moneda(resultado.ventas_netas)}</td>
                      <td style={celdaNumero}>{moneda(resultado.costo_ventas)}</td>
                      <td style={celdaNumero}>{moneda(resultado.gastos_ventas)}</td>
                      <td style={celdaNumero}>
                        {moneda(resultado.gastos_administracion)}
                      </td>
                      <td
                        style={{
                          ...celdaNumero,
                          color:
                            Number(resultado.resultado_operativo) >= 0
                              ? "#15803d"
                              : "#b91c1c",
                        }}
                      >
                        {moneda(resultado.resultado_operativo)}
                      </td>
                      <td
                        style={{
                          ...celdaNumero,
                          color:
                            Number(resultado.ebitda_estimado) >= 0
                              ? "#15803d"
                              : "#b91c1c",
                        }}
                      >
                        {moneda(resultado.ebitda_estimado)}
                      </td>
                      <td
                        style={{
                          ...celdaNumero,
                          color:
                            Number(resultado.margen_ebitda_estimado) >= 0
                              ? "#15803d"
                              : "#b91c1c",
                        }}
                      >
                        {porcentaje(resultado.margen_ebitda_estimado)}
                      </td>
                      <td
                        style={{
                          ...celdaNumero,
                          color:
                            Number(resultado.resultado_ejercicio) >= 0
                              ? "#15803d"
                              : "#b91c1c",
                        }}
                      >
                        {moneda(resultado.resultado_ejercicio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {vista === "HISTORIAL" && (
        <section style={panel}>
          <h2 style={tituloPanel}>Archivos procesados</h2>
          {importaciones.length === 0 ? (
            <div style={zonaVacia}>Aún no existen importaciones.</div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>Fecha</th>
                    <th style={encabezado}>Archivo</th>
                    <th style={encabezado}>Periodo incluido</th>
                    <th style={encabezadoNumero}>Meses</th>
                    <th style={encabezadoNumero}>Cuentas</th>
                    <th style={encabezadoNumero}>Valores</th>
                  </tr>
                </thead>
                <tbody>
                  {importaciones.map((importacion) => (
                    <tr key={importacion.id}>
                      <td style={celda}>{fechaHora(importacion.creado_en)}</td>
                      <td style={celdaMes}>{importacion.archivo_nombre}</td>
                      <td style={celda}>
                        {mesPeriodo(importacion.periodo_desde)} a{" "}
                        {mesPeriodo(importacion.periodo_hasta)}
                      </td>
                      <td style={celdaNumero}>{importacion.meses_incluidos}</td>
                      <td style={celdaNumero}>{importacion.cuentas_incluidas}</td>
                      <td style={celdaNumero}>{importacion.registros_importados}</td>
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

function Tarjeta({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div style={tarjeta}>
      <span style={tarjetaEtiqueta}>{etiqueta}</span>
      <strong style={tarjetaValor}>{valor}</strong>
    </div>
  )
}

const pagina = {
  padding: "8px 0 30px",
  color: "#111827",
}

const cabecera = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 20,
  marginBottom: 20,
  flexWrap: "wrap" as const,
}

const etiqueta = {
  color: "#8f1d24",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.1,
}

const titulo = {
  margin: "5px 0 2px",
  fontSize: 32,
  lineHeight: 1.1,
}

const subtitulo = {
  margin: 0,
  color: "#64748b",
  maxWidth: 760,
}

const pestanas = {
  display: "flex",
  gap: 8,
  padding: 6,
  marginBottom: 20,
  borderRadius: 12,
  background: "#e9edf3",
  overflowX: "auto" as const,
}

const botonPestana = {
  border: 0,
  borderRadius: 9,
  padding: "10px 18px",
  background: "transparent",
  color: "#64748b",
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
}

const botonPestanaActivo = {
  background: "#a51f29",
  color: "white",
}

const panel = {
  padding: 22,
  border: "1px solid #dbe2ea",
  borderRadius: 15,
  background: "white",
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
}

const encabezadoPanel = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 18,
  flexWrap: "wrap" as const,
}

const tituloPanel = {
  margin: 0,
  fontSize: 21,
}

const descripcion = {
  margin: "6px 0 0",
  color: "#64748b",
}

const resumenGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
  marginTop: 22,
}

const tarjeta = {
  minWidth: 0,
  padding: 15,
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  background: "#f8fafc",
}

const tarjetaEtiqueta = {
  display: "block",
  marginBottom: 7,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase" as const,
}

const tarjetaValor = {
  display: "block",
  overflowWrap: "anywhere" as const,
  fontSize: 16,
}

const aviso = {
  marginTop: 18,
  padding: "12px 14px",
  border: "1px solid #f0d58c",
  borderRadius: 10,
  background: "#fff8df",
  color: "#7c5b08",
}

const acciones = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 18,
  flexWrap: "wrap" as const,
}

const botonPrincipal = {
  border: 0,
  borderRadius: 9,
  padding: "11px 17px",
  background: "#a51f29",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
}

const botonSecundario = {
  border: "1px solid #a51f29",
  borderRadius: 9,
  padding: "10px 16px",
  background: "white",
  color: "#8f1d24",
  fontWeight: 800,
  cursor: "pointer",
}

const zonaVacia = {
  marginTop: 20,
  padding: 28,
  border: "1px dashed #cbd5e1",
  borderRadius: 12,
  color: "#64748b",
  textAlign: "center" as const,
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
  minWidth: 900,
}

const encabezado = {
  padding: "11px 10px",
  borderBottom: "2px solid #dbe2ea",
  color: "#475569",
  fontSize: 11,
  textAlign: "left" as const,
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
}

const encabezadoNumero = {
  ...encabezado,
  textAlign: "right" as const,
}

const celda = {
  padding: "11px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  whiteSpace: "nowrap" as const,
}

const celdaMes = {
  ...celda,
  color: "#111827",
  fontWeight: 800,
  textTransform: "capitalize" as const,
}

const celdaNumero = {
  ...celda,
  textAlign: "right" as const,
  fontWeight: 700,
}
