import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  actualizarMateriaPrimaDb,
  importarCostosMateriasPrimasDb,
  obtenerCategoriasMateriaPrimaDb,
  obtenerImportacionesCostosDb,
  obtenerMateriasPrimasCostoActualDb,
  type CategoriaMateriaPrimaDb,
  type ImportacionCostoDb,
  type MateriaPrimaCostoActualDb,
} from "../repositories/materiaPrimaRepository"
import {
  leerArchivoCostos,
  type LineaCostoExcel,
  type ResultadoArchivoCostos,
  type TipoArticuloCosto,
} from "../utils/costosMateriaPrimaExcel"

function fechaHoy() {
  const fecha = new Date()
  const anio = fecha.getFullYear()
  const mes = String(
    fecha.getMonth() + 1,
  ).padStart(2, "0")
  const dia = String(
    fecha.getDate(),
  ).padStart(2, "0")

  return `${anio}-${mes}-${dia}`
}

function numero(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString(
    "es-EC",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    },
  )
}

function etiquetaTipoArticulo(
  tipo: TipoArticuloCosto,
) {
  if (tipo === "EMPAQUE") return "Empaque"
  if (tipo === "MICRO") return "Micro"
  return "Materia prima"
}

function ResumenArchivo({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string
  valor: number
  color: string
}) {
  return (
    <div style={tarjetaResumen}>
      <span style={tarjetaResumenEtiqueta}>
        {etiqueta}
      </span>
      <strong
        style={{
          ...tarjetaResumenValor,
          color,
        }}
      >
        {valor}
      </strong>
    </div>
  )
}

type FormularioEdicion = {
  categoriaId: string
  unidadBase: "KG" | "UNIDAD"
  incluirEnCosteo: boolean
  esEmpaque: boolean
  nombreCorto: string
  observaciones: string
}

export default function MateriasPrimas() {
  const [vista, setVista] = useState<
    "CATALOGO" | "IMPORTAR" | "HISTORIAL"
  >("CATALOGO")

  const [categorias, setCategorias] = useState<
    CategoriaMateriaPrimaDb[]
  >([])

  const [materias, setMaterias] = useState<
    MateriaPrimaCostoActualDb[]
  >([])

  const [importaciones, setImportaciones] =
    useState<ImportacionCostoDb[]>([])

  const [busqueda, setBusqueda] = useState("")
  const [soloSinCosto, setSoloSinCosto] =
    useState(false)

  const [
    materiaSeleccionada,
    setMateriaSeleccionada,
  ] = useState<MateriaPrimaCostoActualDb | null>(
    null,
  )

  const [formulario, setFormulario] =
    useState<FormularioEdicion>({
      categoriaId: "",
      unidadBase: "KG",
      incluirEnCosteo: true,
      esEmpaque: false,
      nombreCorto: "",
      observaciones: "",
    })

  const [fechaCorte, setFechaCorte] =
    useState(fechaHoy())

  const [archivoOrigen, setArchivoOrigen] =
    useState("")

  const [lineasImportar, setLineasImportar] =
    useState<LineaCostoExcel[]>([])

  const [resumenArchivo, setResumenArchivo] =
    useState<ResultadoArchivoCostos | null>(null)

  const [leyendoArchivo, setLeyendoArchivo] =
    useState(false)

  const inputArchivoRef =
    useRef<HTMLInputElement | null>(null)

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] =
    useState(false)

  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")

    try {
      const [
        categoriasDb,
        materiasDb,
        importacionesDb,
      ] = await Promise.all([
        obtenerCategoriasMateriaPrimaDb(),
        obtenerMateriasPrimasCostoActualDb(),
        obtenerImportacionesCostosDb(),
      ])

      setCategorias(categoriasDb)
      setMaterias(materiasDb)
      setImportaciones(importacionesDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el módulo de materias primas.",
      )
    } finally {
      setCargando(false)
    }
  }

  const materiasFiltradas = useMemo(() => {
    const texto =
      busqueda.trim().toLowerCase()

    return materias.filter((materia) => {
      const coincide =
        texto === "" ||
        materia.codigo
          .toLowerCase()
          .includes(texto) ||
        (materia.codigo_contable ?? "")
          .toLowerCase()
          .includes(texto) ||
        materia.nombre
          .toLowerCase()
          .includes(texto)

      const cumpleCosto =
        !soloSinCosto ||
        !materia.costo_unitario ||
        materia.costo_unitario <= 0

      return coincide && cumpleCosto
    })
  }, [materias, busqueda, soloSinCosto])

  function abrirEdicion(
    materia: MateriaPrimaCostoActualDb,
  ) {
    setMateriaSeleccionada(materia)

    const categoria =
      categorias.find(
        (item) =>
          item.nombre === materia.categoria,
      )

    setFormulario({
      categoriaId: categoria?.id ?? "",
      unidadBase: materia.unidad_base,
      incluirEnCosteo:
        materia.incluir_en_costeo,
      esEmpaque: materia.es_empaque,
      nombreCorto:
        materia.nombre_corto ?? "",
      observaciones: "",
    })
  }

  function cerrarEdicion() {
    if (guardando) return

    setMateriaSeleccionada(null)
  }

  async function guardarEdicion() {
    if (!materiaSeleccionada) return

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      await actualizarMateriaPrimaDb(
        materiaSeleccionada.id,
        formulario,
      )

      setMensaje(
        `${materiaSeleccionada.nombre} actualizada correctamente.`,
      )

      setMateriaSeleccionada(null)
      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la materia prima.",
      )
    } finally {
      setGuardando(false)
    }
  }

  function limpiarArchivo() {
    setLineasImportar([])
    setResumenArchivo(null)
    setArchivoOrigen("")

    if (inputArchivoRef.current) {
      inputArchivoRef.current.value = ""
    }
  }

  async function seleccionarArchivo(
    evento: ChangeEvent<HTMLInputElement>,
  ) {
    const archivo = evento.target.files?.[0]

    if (!archivo) return

    setLeyendoArchivo(true)
    setMensaje("")
    setError("")
    setLineasImportar([])
    setResumenArchivo(null)

    try {
      const resultado =
        await leerArchivoCostos(archivo)

      if (resultado.lineas.length === 0) {
        throw new Error(
          "El archivo no contiene insumos válidos para importar.",
        )
      }

      setLineasImportar(resultado.lineas)
      setResumenArchivo(resultado)
      setArchivoOrigen(archivo.name)

      if (resultado.fechaCorteSugerida) {
        setFechaCorte(
          resultado.fechaCorteSugerida,
        )
      }
    } catch (err) {
      limpiarArchivo()
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo leer el archivo de costos.",
      )
    } finally {
      setLeyendoArchivo(false)
    }
  }

  async function importarCostos() {
    setMensaje("")
    setError("")

    if (!fechaCorte) {
      setError(
        "Selecciona la fecha de corte.",
      )
      return
    }

    if (!archivoOrigen.trim()) {
      setError(
        "Ingresa el nombre del archivo de origen.",
      )
      return
    }

    if (lineasImportar.length === 0) {
      setError(
        "No se encontraron líneas válidas para importar.",
      )
      return
    }

    const corteExistente = importaciones.some(
      (importacion) =>
        importacion.fecha_corte === fechaCorte,
    )

    if (
      corteExistente &&
      !window.confirm(
        "Ya existe una importación para esta fecha. ¿Deseas actualizarla con este archivo?",
      )
    ) {
      return
    }

    setGuardando(true)

    try {
      const resultado =
        await importarCostosMateriasPrimasDb({
          lineas: lineasImportar,
          fechaCorte,
          archivoOrigen:
            archivoOrigen.trim(),
        })

      setMensaje(
        `Importación completada: ${resultado.registrosImportados} costos registrados y ${resultado.registrosSinCosto} artículos sin costo nuevo.`,
      )

      limpiarArchivo()
      await cargarDatos()
      setVista("HISTORIAL")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo completar la importación.",
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
        cierreAutomaticoMs={2500}
      />

      <ModalMensaje
        abierto={error !== ""}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />

      <header style={cabecera}>
        <div>
          <span style={etiqueta}>
            COSTOS Y FORMULACIÓN
          </span>

          <h1 style={titulo}>
            Materias primas
          </h1>

          <p style={subtitulo}>
            Catálogo maestro, costos vigentes e
            historial de importaciones contables.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarDatos}
          disabled={cargando || guardando}
          style={botonSecundario}
        >
          {cargando
            ? "Actualizando..."
            : "Actualizar"}
        </button>
      </header>

      <div style={pestanas}>
        <button
          type="button"
          onClick={() => setVista("CATALOGO")}
          style={{
            ...botonPestana,
            ...(vista === "CATALOGO"
              ? botonPestanaActivo
              : {}),
          }}
        >
          Catálogo
        </button>

        <button
          type="button"
          onClick={() => setVista("IMPORTAR")}
          style={{
            ...botonPestana,
            ...(vista === "IMPORTAR"
              ? botonPestanaActivo
              : {}),
          }}
        >
          Importar costos
        </button>

        <button
          type="button"
          onClick={() => setVista("HISTORIAL")}
          style={{
            ...botonPestana,
            ...(vista === "HISTORIAL"
              ? botonPestanaActivo
              : {}),
          }}
        >
          Historial
        </button>
      </div>

      {vista === "CATALOGO" && (
        <section style={panel}>
          <div style={barraFiltros}>
            <input
              value={busqueda}
              onChange={(evento) =>
                setBusqueda(evento.target.value)
              }
              placeholder="Buscar por código o nombre"
              style={campoBusqueda}
            />

            <label style={checkLabel}>
              <input
                type="checkbox"
                checked={soloSinCosto}
                onChange={(evento) =>
                  setSoloSinCosto(
                    evento.target.checked,
                  )
                }
              />

              Solo sin costo vigente
            </label>

            <span style={contador}>
              {materiasFiltradas.length}
            </span>
          </div>

          {cargando ? (
            <div style={estadoVacio}>
              Cargando materias primas...
            </div>
          ) : materiasFiltradas.length === 0 ? (
            <div style={estadoVacio}>
              No existen materias primas para
              mostrar.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>
                      Código
                    </th>
                    <th style={encabezado}>
                      Materia prima
                    </th>
                    <th style={encabezado}>
                      Categoría
                    </th>
                    <th style={encabezado}>
                      Unidad
                    </th>
                    <th style={encabezado}>
                      Fecha costo
                    </th>
                    <th style={encabezado}>
                      Costo unitario
                    </th>
                    <th style={encabezado}>
                      Costea
                    </th>
                    <th style={encabezado}>
                      Acción
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {materiasFiltradas.map(
                    (materia) => (
                      <tr key={materia.id}>
                        <td style={celda}>
                          {materia.codigo_contable ??
                            materia.codigo}
                        </td>

                        <td style={celda}>
                          <strong>
                            {materia.nombre}
                          </strong>
                        </td>

                        <td style={celda}>
                          {materia.categoria ?? "—"}
                        </td>

                        <td style={celda}>
                          {materia.unidad_base}
                        </td>

                        <td style={celda}>
                          {materia.fecha_corte ?? "—"}
                        </td>

                        <td style={celdaNumero}>
                          {materia.costo_unitario
                            ? `$${numero(
                                materia.costo_unitario,
                              )}`
                            : "Sin costo"}
                        </td>

                        <td style={celda}>
                          {materia.incluir_en_costeo
                            ? "Sí"
                            : "No"}
                        </td>

                        <td style={celda}>
                          <button
                            type="button"
                            onClick={() =>
                              abrirEdicion(materia)
                            }
                            style={botonEditar}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {vista === "IMPORTAR" && (
        <section style={panel}>
          <h2 style={tituloPanel}>
            Importar corte contable
          </h2>

          <p style={descripcion}>
            Selecciona el archivo Excel mensual que
            entrega el sistema contable. Se excluirán
            automáticamente los productos terminados,
            devoluciones y registros de otras
            sucursales.
          </p>

          <div style={formularioImportacion}>
            <div>
              <label style={label}>
                Fecha de corte
              </label>

              <input
                type="date"
                value={fechaCorte}
                onChange={(evento) =>
                  setFechaCorte(
                    evento.target.value,
                  )
                }
                style={campo}
              />
            </div>

            <div>
              <label style={label}>
                Reporte mensual
              </label>

              <input
                ref={inputArchivoRef}
                type="file"
                accept=".xls,.xlsx"
                onChange={seleccionarArchivo}
                disabled={leyendoArchivo || guardando}
                style={inputArchivoOculto}
                id="archivo-costos-mp"
              />

              <label
                htmlFor="archivo-costos-mp"
                style={{
                  ...botonSeleccionarArchivo,
                  opacity:
                    leyendoArchivo || guardando
                      ? 0.55
                      : 1,
                }}
              >
                {leyendoArchivo
                  ? "Leyendo archivo..."
                  : archivoOrigen
                    ? "Cambiar archivo"
                    : "Seleccionar archivo Excel"}
              </label>
            </div>
          </div>

          {archivoOrigen && resumenArchivo && (
            <>
              <div style={archivoSeleccionado}>
                <div>
                  <span style={archivoEtiqueta}>
                    ARCHIVO LISTO
                  </span>
                  <strong style={archivoNombre}>
                    {archivoOrigen}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={limpiarArchivo}
                  disabled={guardando}
                  style={botonQuitarArchivo}
                >
                  Quitar
                </button>
              </div>

              <div style={tarjetasResumen}>
                <ResumenArchivo
                  etiqueta="Filas leídas"
                  valor={resumenArchivo.filasLeidas}
                  color="#334155"
                />
                <ResumenArchivo
                  etiqueta="Insumos a importar"
                  valor={lineasImportar.length}
                  color="#15803d"
                />
                <ResumenArchivo
                  etiqueta="Productos omitidos"
                  valor={
                    resumenArchivo.productosTerminadosOmitidos
                  }
                  color="#b45309"
                />
                <ResumenArchivo
                  etiqueta="Otras filas omitidas"
                  valor={
                    resumenArchivo.otrasSucursalesOmitidas +
                    resumenArchivo.filasInvalidas
                  }
                  color="#b91c1c"
                />
              </div>
            </>
          )}

          {lineasImportar.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>
                      Código
                    </th>
                    <th style={encabezado}>
                      Nombre
                    </th>
                    <th style={encabezado}>
                      Tipo
                    </th>
                    <th style={encabezado}>
                      Stock
                    </th>
                    <th style={encabezado}>
                      Costo total
                    </th>
                    <th style={encabezado}>
                      Costo unitario
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {lineasImportar
                    .slice(0, 20)
                    .map((linea, indice) => (
                      <tr
                        key={`${linea.codigoContable}-${indice}`}
                      >
                        <td style={celda}>
                          {linea.codigoContable}
                        </td>

                        <td style={celda}>
                          {linea.nombre}
                        </td>

                        <td style={celda}>
                          {etiquetaTipoArticulo(
                            linea.tipoArticulo,
                          )}
                        </td>

                        <td style={celdaNumero}>
                          {numero(linea.stock)}
                        </td>

                        <td style={celdaNumero}>
                          ${numero(
                            linea.costoTotal,
                          )}
                        </td>

                        <td style={celdaNumero}>
                          {linea.costoUnitario > 0
                            ? `$${numero(
                                linea.costoUnitario,
                              )}`
                            : "Sin costo nuevo"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={acciones}>
            <button
              type="button"
              onClick={() => {
                limpiarArchivo()
              }}
              disabled={guardando}
              style={botonSecundario}
            >
              Limpiar
            </button>

            <button
              type="button"
              onClick={importarCostos}
              disabled={
                guardando ||
                leyendoArchivo ||
                lineasImportar.length === 0
              }
              style={{
                ...botonPrincipal,
                opacity:
                  guardando ||
                  leyendoArchivo ||
                  lineasImportar.length === 0
                    ? 0.5
                    : 1,
              }}
            >
              {guardando
                ? "Importando..."
                : "Confirmar importación"}
            </button>
          </div>
        </section>
      )}

      {vista === "HISTORIAL" && (
        <section style={panel}>
          <div style={tituloConContador}>
            <div>
              <h2 style={tituloPanel}>
                Historial de importaciones
              </h2>

              <p style={descripcion}>
                Cortes contables registrados en el
                sistema.
              </p>
            </div>

            <span style={contador}>
              {importaciones.length}
            </span>
          </div>

          {importaciones.length === 0 ? (
            <div style={estadoVacio}>
              No existen importaciones registradas.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabla}>
                <thead>
                  <tr>
                    <th style={encabezado}>
                      Fecha de corte
                    </th>
                    <th style={encabezado}>
                      Archivo
                    </th>
                    <th style={encabezado}>
                      Leídos
                    </th>
                    <th style={encabezado}>
                      Importados
                    </th>
                    <th style={encabezado}>
                      Sin costo
                    </th>
                    <th style={encabezado}>
                      Registrado
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {importaciones.map(
                    (importacion) => (
                      <tr key={importacion.id}>
                        <td style={celda}>
                          {importacion.fecha_corte}
                        </td>

                        <td style={celda}>
                          {importacion.archivo_origen ??
                            "—"}
                        </td>

                        <td style={celdaNumero}>
                          {
                            importacion.registros_leidos
                          }
                        </td>

                        <td style={celdaNumero}>
                          {
                            importacion.registros_importados
                          }
                        </td>

                        <td style={celdaNumero}>
                          {
                            importacion.registros_sin_costo
                          }
                        </td>

                        <td style={celda}>
                          {new Date(
                            importacion.creado_en,
                          ).toLocaleString()}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {materiaSeleccionada && (
        <div style={fondoModal}>
          <div style={modal}>
            <h2 style={{ marginTop: 0 }}>
              Editar materia prima
            </h2>

            <p style={descripcion}>
              {materiaSeleccionada.nombre}
            </p>

            <div style={formularioModal}>
              <div>
                <label style={label}>
                  Nombre corto
                </label>

                <input
                  value={formulario.nombreCorto}
                  onChange={(evento) =>
                    setFormulario(
                      (actual) => ({
                        ...actual,
                        nombreCorto:
                          evento.target.value,
                      }),
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label style={label}>
                  Categoría
                </label>

                <select
                  value={formulario.categoriaId}
                  onChange={(evento) =>
                    setFormulario(
                      (actual) => ({
                        ...actual,
                        categoriaId:
                          evento.target.value,
                      }),
                    )
                  }
                  style={campo}
                >
                  <option value="">
                    Sin categoría
                  </option>

                  {categorias.map(
                    (categoria) => (
                      <option
                        key={categoria.id}
                        value={categoria.id}
                      >
                        {categoria.nombre}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label style={label}>
                  Unidad
                </label>

                <select
                  value={formulario.unidadBase}
                  onChange={(evento) =>
                    setFormulario(
                      (actual) => ({
                        ...actual,
                        unidadBase:
                          evento.target.value as
                            | "KG"
                            | "UNIDAD",
                      }),
                    )
                  }
                  style={campo}
                >
                  <option value="KG">KG</option>
                  <option value="UNIDAD">
                    UNIDAD
                  </option>
                </select>
              </div>

              <label style={checkLabel}>
                <input
                  type="checkbox"
                  checked={
                    formulario.incluirEnCosteo
                  }
                  onChange={(evento) =>
                    setFormulario(
                      (actual) => ({
                        ...actual,
                        incluirEnCosteo:
                          evento.target.checked,
                      }),
                    )
                  }
                />

                Incluir en costeo
              </label>

              <label style={checkLabel}>
                <input
                  type="checkbox"
                  checked={formulario.esEmpaque}
                  onChange={(evento) =>
                    setFormulario(
                      (actual) => ({
                        ...actual,
                        esEmpaque:
                          evento.target.checked,
                      }),
                    )
                  }
                />

                Es material de empaque
              </label>

              <div>
                <label style={label}>
                  Observaciones
                </label>

                <textarea
                  value={formulario.observaciones}
                  onChange={(evento) =>
                    setFormulario(
                      (actual) => ({
                        ...actual,
                        observaciones:
                          evento.target.value,
                      }),
                    )
                  }
                  style={areaObservaciones}
                />
              </div>
            </div>

            <div style={acciones}>
              <button
                type="button"
                onClick={cerrarEdicion}
                disabled={guardando}
                style={botonSecundario}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={guardarEdicion}
                disabled={guardando}
                style={botonPrincipal}
              >
                {guardando
                  ? "Guardando..."
                  : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const pagina = {
  padding: "30px",
  maxWidth: "1500px",
  margin: "0 auto",
  color: "#25272b",
}

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
  marginBottom: "24px",
}

const etiqueta = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "1px",
}

const titulo = {
  margin: "5px 0",
  fontSize: "32px",
}

const subtitulo = {
  margin: 0,
  color: "#6b7280",
}

const pestanas = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
  marginBottom: "22px",
  padding: "6px",
  borderRadius: "10px",
  background: "#e5e7eb",
  width: "fit-content",
}

const botonPestana = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "#6b7280",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonPestanaActivo = {
  background: "#8f1d24",
  color: "white",
}

const panel = {
  marginBottom: "22px",
  padding: "22px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 6px 20px rgba(15, 23, 42, 0.05)",
}

const tituloPanel = {
  margin: 0,
  fontSize: "21px",
}

const descripcion = {
  margin: "6px 0 18px",
  color: "#6b7280",
  lineHeight: 1.5,
}

const barraFiltros = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: "14px",
  marginBottom: "18px",
}

const campoBusqueda = {
  flex: "1 1 280px",
  minHeight: "42px",
  padding: "9px 11px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  color: "#25272b",
  background: "white",
}

const checkLabel = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "#374151",
  fontWeight: "bold",
}

const contador = {
  minWidth: "36px",
  padding: "7px 11px",
  borderRadius: "999px",
  background: "#8f1d24",
  color: "white",
  textAlign: "center" as const,
  fontWeight: "bold",
}

const formularioImportacion = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
}

const formularioModal = {
  display: "grid",
  gap: "16px",
}

const label = {
  display: "block",
  marginBottom: "7px",
  color: "#374151",
  fontSize: "13px",
  fontWeight: "bold",
}

const campo = {
  width: "100%",
  minHeight: "42px",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  color: "#25272b",
  background: "white",
}

const inputArchivoOculto = {
  position: "absolute" as const,
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap" as const,
}

const botonSeleccionarArchivo = {
  minHeight: "42px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 16px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const archivoSeleccionado = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  marginTop: "18px",
  padding: "14px 16px",
  border: "1px solid #bbf7d0",
  borderRadius: "10px",
  background: "#f0fdf4",
}

const archivoEtiqueta = {
  display: "block",
  marginBottom: "3px",
  color: "#15803d",
  fontSize: "11px",
  fontWeight: "bold",
  letterSpacing: ".7px",
}

const archivoNombre = {
  display: "block",
  overflowWrap: "anywhere" as const,
}

const botonQuitarArchivo = {
  padding: "7px 10px",
  border: "1px solid #b91c1c",
  borderRadius: "7px",
  background: "white",
  color: "#b91c1c",
  fontWeight: "bold",
  cursor: "pointer",
}

const tarjetasResumen = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(145px, 1fr))",
  gap: "12px",
  margin: "16px 0",
}

const tarjetaResumen = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "5px",
  padding: "14px",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  background: "#f8fafc",
}

const tarjetaResumenEtiqueta = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: "bold",
}

const tarjetaResumenValor = {
  fontSize: "24px",
  lineHeight: 1,
}

const areaObservaciones = {
  ...campo,
  minHeight: "90px",
  resize: "vertical" as const,
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
}

const encabezado = {
  padding: "10px",
  borderBottom: "2px solid #d8dde3",
  background: "#f7f8fa",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
  fontSize: "12px",
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #edf0f2",
  whiteSpace: "nowrap" as const,
}

const celdaNumero = {
  ...celda,
  textAlign: "right" as const,
}

const botonEditar = {
  padding: "8px 12px",
  border: "1px solid #8f1d24",
  borderRadius: "7px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const acciones = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "12px",
  marginTop: "20px",
}

const botonPrincipal = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonSecundario = {
  padding: "10px 16px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const estadoVacio = {
  padding: "28px",
  border: "1px dashed #cfd4da",
  borderRadius: "9px",
  color: "#6b7280",
  textAlign: "center" as const,
}

const tituloConContador = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
}

const fondoModal = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 3000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  background: "rgba(15, 23, 42, 0.55)",
}

const modal = {
  width: "min(560px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto" as const,
  padding: "24px",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 20px 60px rgba(15, 23, 42, 0.30)",
}
