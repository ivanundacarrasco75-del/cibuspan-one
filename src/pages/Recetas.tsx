import { useEffect, useMemo, useState } from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  activarVersionRecetaBiDb,
  agregarComponenteBiDb,
  crearRecetaBiDb,
  crearVersionRecetaBiDb,
  eliminarComponenteBiDb,
  obtenerComponentesVersionBiDb,
  obtenerCostoRecetaBiDb,
  obtenerFormulaProductoBiDb,
  obtenerMateriasPrimasRecetaBiDb,
  obtenerMicrosBiDb,
  obtenerRecetasBiDb,
  obtenerVersionesRecetaBiDb,
  type ComponenteRecetaBiDb,
  type MateriaPrimaRecetaDb,
  type RecetaBiDb,
  type RecetaCostoBiDb,
  type TipoRecetaBi,
  type VersionRecetaBiDb,
} from "../repositories/recetaBiRepository"

type Vista =
  | "RECETAS"
  | "VERSIONES"
  | "FORMULA"
  | "COSTEO"

type NuevoComponente = {
  tipo: "MATERIA_PRIMA" | "MICRO"
  referenciaId: string
  porcentaje: string
  harinaBase: boolean
  incluirEnCosteo: boolean
}

function numero(
  valor: number | null | undefined,
  decimales = 4,
) {
  return Number(valor ?? 0).toLocaleString(
    "es-EC",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimales,
    },
  )
}

function moneda(
  valor: number | null | undefined,
) {
  return Number(valor ?? 0).toLocaleString(
    "es-EC",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    },
  )
}

export default function Recetas() {
  const [vista, setVista] =
    useState<Vista>("RECETAS")

  const [recetas, setRecetas] = useState<
    RecetaBiDb[]
  >([])

  const [versiones, setVersiones] = useState<
    VersionRecetaBiDb[]
  >([])

  const [componentes, setComponentes] =
    useState<ComponenteRecetaBiDb[]>([])

  const [materias, setMaterias] = useState<
    MateriaPrimaRecetaDb[]
  >([])

  const [micros, setMicros] = useState<
    RecetaBiDb[]
  >([])

  const [recetaId, setRecetaId] = useState("")
  const [versionId, setVersionId] =
    useState("")

  const [tipoFiltro, setTipoFiltro] =
    useState<"TODOS" | TipoRecetaBi>("TODOS")

  const [busqueda, setBusqueda] = useState("")

  const [codigoNuevo, setCodigoNuevo] =
    useState("")
  const [nombreNuevo, setNombreNuevo] =
    useState("")
  const [tipoNuevo, setTipoNuevo] =
    useState<TipoRecetaBi>(
      "PRODUCTO_TERMINADO",
    )
  const [descripcionNueva, setDescripcionNueva] =
    useState("")

  const [panesPorBatch, setPanesPorBatch] =
    useState("")
  const [pesoBolaG, setPesoBolaG] =
    useState("")
  const [pesoFinalG, setPesoFinalG] =
    useState("")
  const [pesoBatchKg, setPesoBatchKg] =
    useState("")
  const [
    rendimientoUnidades,
    setRendimientoUnidades,
  ] = useState("")
  const [mermaPorcentaje, setMermaPorcentaje] =
    useState("0")
  const [observacionesVersion, setObservacionesVersion] =
    useState("")

  const [nuevoComponente, setNuevoComponente] =
    useState<NuevoComponente>({
      tipo: "MATERIA_PRIMA",
      referenciaId: "",
      porcentaje: "",
      harinaBase: false,
      incluirEnCosteo: true,
    })

  const [costo, setCosto] =
    useState<RecetaCostoBiDb | null>(null)

  const [cargando, setCargando] =
    useState(true)
  const [guardando, setGuardando] =
    useState(false)

  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const recetaSeleccionada = useMemo(
    () =>
      recetas.find(
        (receta) => receta.id === recetaId,
      ) ?? null,
    [recetas, recetaId],
  )

  const versionSeleccionada = useMemo(
    () =>
      versiones.find(
        (version) =>
          version.id === versionId,
      ) ?? null,
    [versiones, versionId],
  )

  const recetasFiltradas = useMemo(() => {
    const texto =
      busqueda.trim().toLowerCase()

    return recetas.filter((receta) => {
      const coincideTipo =
        tipoFiltro === "TODOS" ||
        receta.tipo === tipoFiltro

      const coincideTexto =
        texto === "" ||
        receta.codigo
          .toLowerCase()
          .includes(texto) ||
        receta.nombre
          .toLowerCase()
          .includes(texto)

      return coincideTipo && coincideTexto
    })
  }, [recetas, busqueda, tipoFiltro])

  useEffect(() => {
    cargarCatalogos()
  }, [])

  useEffect(() => {
    if (!recetaId) {
      setVersiones([])
      setVersionId("")
      setComponentes([])
      setCosto(null)
      return
    }

    cargarVersiones(recetaId)
  }, [recetaId])

  useEffect(() => {
    if (!versionId) {
      setComponentes([])
      setCosto(null)
      return
    }

    cargarVersion(versionId)
  }, [versionId])

  async function cargarCatalogos() {
    setCargando(true)
    setError("")

    try {
      const [
        recetasDb,
        materiasDb,
        microsDb,
      ] = await Promise.all([
        obtenerRecetasBiDb(),
        obtenerMateriasPrimasRecetaBiDb(),
        obtenerMicrosBiDb(),
      ])

      setRecetas(recetasDb)
      setMaterias(materiasDb)
      setMicros(microsDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el módulo de recetas.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function cargarVersiones(
    idReceta: string,
  ) {
    try {
      const datos =
        await obtenerVersionesRecetaBiDb(
          idReceta,
        )

      setVersiones(datos)

      if (datos.length > 0) {
        const vigente =
          datos.find(
            (version) =>
              version.estado === "VIGENTE",
          ) ?? datos[0]

        setVersionId(vigente.id)
      } else {
        setVersionId("")
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las versiones.",
      )
    }
  }

  async function cargarVersion(
    idVersion: string,
  ) {
    try {
      const [
        componentesDb,
        costoDb,
      ] = await Promise.all([
        obtenerComponentesVersionBiDb(
          idVersion,
        ),
        obtenerCostoRecetaBiDb(idVersion),
      ])

      setComponentes(componentesDb)
      setCosto(costoDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la versión.",
      )
    }
  }

  async function crearReceta() {
    setMensaje("")
    setError("")

    if (!codigoNuevo.trim()) {
      setError(
        "Ingresa el código de la receta.",
      )
      return
    }

    if (!nombreNuevo.trim()) {
      setError(
        "Ingresa el nombre de la receta.",
      )
      return
    }

    setGuardando(true)

    try {
      const receta =
        await crearRecetaBiDb({
          codigo: codigoNuevo,
          nombre: nombreNuevo,
          tipo: tipoNuevo,
          descripcion: descripcionNueva,
        })

      setMensaje(
        "Receta creada correctamente.",
      )

      setCodigoNuevo("")
      setNombreNuevo("")
      setDescripcionNueva("")

      await cargarCatalogos()
      setRecetaId(receta.id)
      setVista("VERSIONES")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear la receta.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function crearVersion() {
    if (!recetaSeleccionada) {
      setError(
        "Selecciona una receta.",
      )
      return
    }

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      const version =
        await crearVersionRecetaBiDb({
          recetaId:
            recetaSeleccionada.id,
          panesPorBatch:
            panesPorBatch.trim() === ""
              ? null
              : Number(panesPorBatch),
          pesoBolaG:
            pesoBolaG.trim() === ""
              ? null
              : Number(pesoBolaG),
          pesoFinalG:
            pesoFinalG.trim() === ""
              ? null
              : Number(pesoFinalG),
          pesoBatchKg:
            pesoBatchKg.trim() === ""
              ? null
              : Number(pesoBatchKg),
          rendimientoUnidades:
            rendimientoUnidades.trim() === ""
              ? null
              : Number(rendimientoUnidades),
          mermaPorcentaje:
            Number(mermaPorcentaje || 0),
          observaciones:
            observacionesVersion,
        })

      setMensaje(
        `Versión ${version.numero_version} creada correctamente.`,
      )

      setPanesPorBatch("")
      setPesoBolaG("")
      setPesoFinalG("")
      setPesoBatchKg("")
      setRendimientoUnidades("")
      setMermaPorcentaje("0")
      setObservacionesVersion("")

      await cargarVersiones(
        recetaSeleccionada.id,
      )

      setVersionId(version.id)
      setVista("FORMULA")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear la versión.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function agregarComponente() {
    if (
      !versionSeleccionada ||
      !recetaSeleccionada
    ) {
      setError(
        "Selecciona una receta y una versión.",
      )
      return
    }

    if (
      versionSeleccionada.estado !==
      "BORRADOR"
    ) {
      setError(
        "Solo se pueden modificar versiones en BORRADOR.",
      )
      return
    }

    if (!nuevoComponente.referenciaId) {
      setError(
        "Selecciona el componente.",
      )
      return
    }

    const porcentaje = Number(
      nuevoComponente.porcentaje,
    )

    if (
      !Number.isFinite(porcentaje) ||
      porcentaje < 0
    ) {
      setError(
        "Ingresa un porcentaje válido.",
      )
      return
    }

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      const esMicro =
        recetaSeleccionada.tipo === "MICRO"

      await agregarComponenteBiDb({
        recetaVersionId:
          versionSeleccionada.id,
        tipoComponente:
          nuevoComponente.tipo,
        materiaPrimaId:
          nuevoComponente.tipo ===
          "MATERIA_PRIMA"
            ? nuevoComponente.referenciaId
            : null,
        microRecetaId:
          nuevoComponente.tipo === "MICRO"
            ? nuevoComponente.referenciaId
            : null,
        porcentajePanadero:
          esMicro ? null : porcentaje,
        porcentajeComposicion:
          esMicro ? porcentaje : null,
        esHarinaBase:
          !esMicro &&
          nuevoComponente.harinaBase,
        incluirEnCosteo:
          nuevoComponente.incluirEnCosteo,
        orden: componentes.length + 1,
      })

      setMensaje(
        "Componente agregado correctamente.",
      )

      setNuevoComponente({
        tipo: "MATERIA_PRIMA",
        referenciaId: "",
        porcentaje: "",
        harinaBase: false,
        incluirEnCosteo: true,
      })

      await cargarVersion(
        versionSeleccionada.id,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo agregar el componente.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarComponente(
    componente: ComponenteRecetaBiDb,
  ) {
    if (
      versionSeleccionada?.estado !==
      "BORRADOR"
    ) {
      setError(
        "Solo se pueden modificar versiones en BORRADOR.",
      )
      return
    }

    const confirmar = window.confirm(
      "¿Eliminar este componente de la receta?",
    )

    if (!confirmar) return

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      await eliminarComponenteBiDb(
        componente.id,
      )

      setMensaje(
        "Componente eliminado.",
      )

      await cargarVersion(
        componente.receta_version_id,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el componente.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function activarVersion() {
    if (!versionSeleccionada) return

    const confirmar = window.confirm(
      `¿Activar la versión ${versionSeleccionada.numero_version}? La versión vigente anterior quedará obsoleta.`,
    )

    if (!confirmar) return

    setGuardando(true)
    setMensaje("")
    setError("")

    try {
      await activarVersionRecetaBiDb(
        versionSeleccionada.id,
      )

      setMensaje(
        "Versión activada correctamente.",
      )

      if (recetaSeleccionada) {
        await cargarVersiones(
          recetaSeleccionada.id,
        )
      }

      await cargarCatalogos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo activar la versión.",
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
            MOTOR DE COSTOS Y FORMULACIÓN
          </span>

          <h1 style={titulo}>
            Recetas
          </h1>

          <p style={subtitulo}>
            Gestiona productos terminados, micros,
            versiones, porcentajes panaderos y costos.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarCatalogos}
          disabled={cargando || guardando}
          style={botonSecundario}
        >
          {cargando
            ? "Actualizando..."
            : "Actualizar"}
        </button>
      </header>

      <div style={pestanas}>
        {[
          ["RECETAS", "Recetas"],
          ["VERSIONES", "Versiones"],
          ["FORMULA", "Fórmula"],
          ["COSTEO", "Costeo"],
        ].map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            onClick={() =>
              setVista(valor as Vista)
            }
            style={{
              ...botonPestana,
              ...(vista === valor
                ? botonPestanaActivo
                : {}),
            }}
          >
            {texto}
          </button>
        ))}
      </div>

      {vista === "RECETAS" && (
        <>
          <section style={panel}>
            <h2 style={tituloPanel}>
              Crear receta
            </h2>

            <div style={formularioGrid}>
              <div>
                <label style={label}>
                  Código
                </label>

                <input
                  value={codigoNuevo}
                  onChange={(evento) =>
                    setCodigoNuevo(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label style={label}>
                  Nombre
                </label>

                <input
                  value={nombreNuevo}
                  onChange={(evento) =>
                    setNombreNuevo(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label style={label}>
                  Tipo
                </label>

                <select
                  value={tipoNuevo}
                  onChange={(evento) =>
                    setTipoNuevo(
                      evento.target.value as
                        TipoRecetaBi,
                    )
                  }
                  style={campo}
                >
                  <option value="PRODUCTO_TERMINADO">
                    Producto terminado
                  </option>

                  <option value="MICRO">
                    Micro
                  </option>
                </select>
              </div>

              <div>
                <label style={label}>
                  Descripción
                </label>

                <input
                  value={descripcionNueva}
                  onChange={(evento) =>
                    setDescripcionNueva(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>
            </div>

            <div style={acciones}>
              <button
                type="button"
                onClick={crearReceta}
                disabled={guardando}
                style={botonPrincipal}
              >
                Crear receta
              </button>
            </div>
          </section>

          <section style={panel}>
            <div style={barraFiltros}>
              <input
                value={busqueda}
                onChange={(evento) =>
                  setBusqueda(
                    evento.target.value,
                  )
                }
                placeholder="Buscar por código o nombre"
                style={campoBusqueda}
              />

              <select
                value={tipoFiltro}
                onChange={(evento) =>
                  setTipoFiltro(
                    evento.target.value as
                      | "TODOS"
                      | TipoRecetaBi,
                  )
                }
                style={campoFiltro}
              >
                <option value="TODOS">
                  Todos
                </option>

                <option value="PRODUCTO_TERMINADO">
                  Productos terminados
                </option>

                <option value="MICRO">
                  Micros
                </option>
              </select>

              <span style={contador}>
                {recetasFiltradas.length}
              </span>
            </div>

            <div style={rejillaRecetas}>
              {recetasFiltradas.map((receta) => (
                <article
                  key={receta.id}
                  style={{
                    ...tarjetaReceta,
                    borderColor:
                      recetaId === receta.id
                        ? "#8f1d24"
                        : "#e2e5e9",
                  }}
                >
                  <div>
                    <span style={tipoReceta}>
                      {receta.tipo ===
                      "PRODUCTO_TERMINADO"
                        ? "PRODUCTO TERMINADO"
                        : "MICRO"}
                    </span>

                    <h3 style={nombreReceta}>
                      {receta.nombre}
                    </h3>

                    <p style={codigoReceta}>
                      {receta.codigo}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRecetaId(receta.id)
                      setVista("VERSIONES")
                    }}
                    style={botonAbrir}
                  >
                    Abrir receta
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {vista === "VERSIONES" && (
        <>
          <section style={panel}>
            <h2 style={tituloPanel}>
              Selección de receta
            </h2>

            <select
              value={recetaId}
              onChange={(evento) =>
                setRecetaId(
                  evento.target.value,
                )
              }
              style={campo}
            >
              <option value="">
                Seleccione...
              </option>

              {recetas.map((receta) => (
                <option
                  key={receta.id}
                  value={receta.id}
                >
                  {receta.nombre} ·{" "}
                  {receta.tipo}
                </option>
              ))}
            </select>
          </section>

          {recetaSeleccionada && (
            <>
              <section style={panel}>
                <div style={tituloConContador}>
                  <div>
                    <h2 style={tituloPanel}>
                      Versiones
                    </h2>

                    <p style={descripcion}>
                      {recetaSeleccionada.nombre}
                    </p>
                  </div>

                  <span style={contador}>
                    {versiones.length}
                  </span>
                </div>

                {versiones.length === 0 ? (
                  <div style={estadoVacio}>
                    No existen versiones.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={tabla}>
                      <thead>
                        <tr>
                          <th style={encabezado}>
                            Versión
                          </th>
                          <th style={encabezado}>
                            Estado
                          </th>
                          <th style={encabezado}>
                            Panes
                          </th>
                          <th style={encabezado}>
                            Peso bola
                          </th>
                          <th style={encabezado}>
                            Peso final
                          </th>
                          <th style={encabezado}>
                            Batch
                          </th>
                          <th style={encabezado}>
                            Acción
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {versiones.map(
                          (version) => (
                            <tr key={version.id}>
                              <td style={celda}>
                                V
                                {
                                  version.numero_version
                                }
                              </td>

                              <td style={celda}>
                                {version.estado}
                              </td>

                              <td style={celdaNumero}>
                                {version.panes_por_batch ??
                                  "—"}
                              </td>

                              <td style={celdaNumero}>
                                {version.peso_bola_g
                                  ? `${numero(
                                      version.peso_bola_g,
                                    )} g`
                                  : "—"}
                              </td>

                              <td style={celdaNumero}>
                                {version.peso_final_g
                                  ? `${numero(
                                      version.peso_final_g,
                                    )} g`
                                  : "—"}
                              </td>

                              <td style={celdaNumero}>
                                {version.peso_batch_kg
                                  ? `${numero(
                                      version.peso_batch_kg,
                                    )} kg`
                                  : "Calculado"}
                              </td>

                              <td style={celda}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVersionId(
                                      version.id,
                                    )
                                    setVista(
                                      "FORMULA",
                                    )
                                  }}
                                  style={botonEditar}
                                >
                                  Abrir
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

              <section style={panel}>
                <h2 style={tituloPanel}>
                  Crear nueva versión
                </h2>

                <div style={formularioGrid}>
                  {recetaSeleccionada.tipo ===
                    "PRODUCTO_TERMINADO" && (
                    <>
                      <div>
                        <label style={label}>
                          Panes por batch
                        </label>

                        <input
                          type="number"
                          min="1"
                          value={panesPorBatch}
                          onChange={(evento) =>
                            setPanesPorBatch(
                              evento.target.value,
                            )
                          }
                          style={campo}
                        />
                      </div>

                      <div>
                        <label style={label}>
                          Peso bola (g)
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={pesoBolaG}
                          onChange={(evento) =>
                            setPesoBolaG(
                              evento.target.value,
                            )
                          }
                          style={campo}
                        />
                      </div>

                      <div>
                        <label style={label}>
                          Peso final (g)
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={pesoFinalG}
                          onChange={(evento) =>
                            setPesoFinalG(
                              evento.target.value,
                            )
                          }
                          style={campo}
                        />
                      </div>

                      <div>
                        <label style={label}>
                          Rendimiento unidades
                        </label>

                        <input
                          type="number"
                          min="1"
                          value={rendimientoUnidades}
                          onChange={(evento) =>
                            setRendimientoUnidades(
                              evento.target.value,
                            )
                          }
                          style={campo}
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label style={label}>
                      Peso batch directo (kg)
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={pesoBatchKg}
                      onChange={(evento) =>
                        setPesoBatchKg(
                          evento.target.value,
                        )
                      }
                      style={campo}
                    />
                  </div>

                  <div>
                    <label style={label}>
                      Merma (%)
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={mermaPorcentaje}
                      onChange={(evento) =>
                        setMermaPorcentaje(
                          evento.target.value,
                        )
                      }
                      style={campo}
                    />
                  </div>

                  <div>
                    <label style={label}>
                      Observaciones
                    </label>

                    <input
                      value={observacionesVersion}
                      onChange={(evento) =>
                        setObservacionesVersion(
                          evento.target.value,
                        )
                      }
                      style={campo}
                    />
                  </div>
                </div>

                <div style={acciones}>
                  <button
                    type="button"
                    onClick={crearVersion}
                    disabled={guardando}
                    style={botonPrincipal}
                  >
                    Crear versión
                  </button>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {vista === "FORMULA" && (
        <>
          <section style={panel}>
            <div style={formularioGrid}>
              <div>
                <label style={label}>
                  Receta
                </label>

                <select
                  value={recetaId}
                  onChange={(evento) =>
                    setRecetaId(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  <option value="">
                    Seleccione...
                  </option>

                  {recetas.map((receta) => (
                    <option
                      key={receta.id}
                      value={receta.id}
                    >
                      {receta.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>
                  Versión
                </label>

                <select
                  value={versionId}
                  onChange={(evento) =>
                    setVersionId(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  <option value="">
                    Seleccione...
                  </option>

                  {versiones.map(
                    (version) => (
                      <option
                        key={version.id}
                        value={version.id}
                      >
                        V
                        {
                          version.numero_version
                        }{" "}
                        · {version.estado}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          </section>

          {versionSeleccionada &&
            recetaSeleccionada && (
              <>
                <section style={panel}>
                  <div style={tituloConContador}>
                    <div>
                      <h2 style={tituloPanel}>
                        Fórmula
                      </h2>

                      <p style={descripcion}>
                        {recetaSeleccionada.nombre} · V
                        {
                          versionSeleccionada.numero_version
                        }
                      </p>
                    </div>

                    <span style={contador}>
                      {componentes.length}
                    </span>
                  </div>

                  {componentes.length === 0 ? (
                    <div style={estadoVacio}>
                      No existen componentes.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={tabla}>
                        <thead>
                          <tr>
                            <th style={encabezado}>
                              Orden
                            </th>
                            <th style={encabezado}>
                              Componente
                            </th>
                            <th style={encabezado}>
                              Tipo
                            </th>
                            <th style={encabezado}>
                              %
                              {recetaSeleccionada.tipo ===
                              "MICRO"
                                ? " composición"
                                : " panadero"}
                            </th>
                            <th style={encabezado}>
                              Harina base
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
                          {componentes.map(
                            (componente) => (
                              <tr
                                key={componente.id}
                              >
                                <td style={celdaNumero}>
                                  {componente.orden}
                                </td>

                                <td style={celda}>
                                  <strong>
                                    {componente
                                      .materia_prima
                                      ?.nombre ??
                                      componente.micro
                                        ?.nombre ??
                                      ""}
                                  </strong>
                                </td>

                                <td style={celda}>
                                  {
                                    componente.tipo_componente
                                  }
                                </td>

                                <td style={celdaNumero}>
                                  {numero(
                                    recetaSeleccionada.tipo ===
                                    "MICRO"
                                      ? componente.porcentaje_composicion
                                      : componente.porcentaje_panadero,
                                    6,
                                  )}
                                  %
                                </td>

                                <td style={celda}>
                                  {componente.es_harina_base
                                    ? "Sí"
                                    : "No"}
                                </td>

                                <td style={celda}>
                                  {componente.incluir_en_costeo
                                    ? "Sí"
                                    : "No"}
                                </td>

                                <td style={celda}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      eliminarComponente(
                                        componente,
                                      )
                                    }
                                    disabled={
                                      versionSeleccionada.estado !==
                                      "BORRADOR"
                                    }
                                    style={botonEliminar}
                                  >
                                    Eliminar
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

                {versionSeleccionada.estado ===
                  "BORRADOR" && (
                  <section style={panel}>
                    <h2 style={tituloPanel}>
                      Agregar componente
                    </h2>

                    <div style={formularioGrid}>
                      {recetaSeleccionada.tipo ===
                        "PRODUCTO_TERMINADO" && (
                        <div>
                          <label style={label}>
                            Tipo
                          </label>

                          <select
                            value={
                              nuevoComponente.tipo
                            }
                            onChange={(evento) =>
                              setNuevoComponente(
                                (actual) => ({
                                  ...actual,
                                  tipo:
                                    evento.target
                                      .value as
                                      | "MATERIA_PRIMA"
                                      | "MICRO",
                                  referenciaId:
                                    "",
                                  harinaBase:
                                    false,
                                }),
                              )
                            }
                            style={campo}
                          >
                            <option value="MATERIA_PRIMA">
                              Materia prima
                            </option>

                            <option value="MICRO">
                              Micro
                            </option>
                          </select>
                        </div>
                      )}

                      <div>
                        <label style={label}>
                          Componente
                        </label>

                        <select
                          value={
                            nuevoComponente.referenciaId
                          }
                          onChange={(evento) =>
                            setNuevoComponente(
                              (actual) => ({
                                ...actual,
                                referenciaId:
                                  evento.target.value,
                              }),
                            )
                          }
                          style={campo}
                        >
                          <option value="">
                            Seleccione...
                          </option>

                          {nuevoComponente.tipo ===
                          "MATERIA_PRIMA"
                            ? materias.map(
                                (materia) => (
                                  <option
                                    key={materia.id}
                                    value={materia.id}
                                  >
                                    {materia.nombre}
                                  </option>
                                ),
                              )
                            : micros
                                .filter(
                                  (micro) =>
                                    micro.id !==
                                    recetaSeleccionada.id,
                                )
                                .map((micro) => (
                                  <option
                                    key={micro.id}
                                    value={micro.id}
                                  >
                                    {micro.nombre}
                                  </option>
                                ))}
                        </select>
                      </div>

                      <div>
                        <label style={label}>
                          {recetaSeleccionada.tipo ===
                          "MICRO"
                            ? "% composición"
                            : "% panadero"}
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="0.000001"
                          value={
                            nuevoComponente.porcentaje
                          }
                          onChange={(evento) =>
                            setNuevoComponente(
                              (actual) => ({
                                ...actual,
                                porcentaje:
                                  evento.target.value,
                              }),
                            )
                          }
                          style={campo}
                        />
                      </div>

                      {recetaSeleccionada.tipo ===
                        "PRODUCTO_TERMINADO" &&
                        nuevoComponente.tipo ===
                          "MATERIA_PRIMA" && (
                          <label style={checkLabel}>
                            <input
                              type="checkbox"
                              checked={
                                nuevoComponente.harinaBase
                              }
                              onChange={(evento) =>
                                setNuevoComponente(
                                  (actual) => ({
                                    ...actual,
                                    harinaBase:
                                      evento.target
                                        .checked,
                                    porcentaje:
                                      evento.target
                                        .checked
                                        ? "100"
                                        : actual.porcentaje,
                                  }),
                                )
                              }
                            />

                            Harina base
                          </label>
                        )}

                      <label style={checkLabel}>
                        <input
                          type="checkbox"
                          checked={
                            nuevoComponente.incluirEnCosteo
                          }
                          onChange={(evento) =>
                            setNuevoComponente(
                              (actual) => ({
                                ...actual,
                                incluirEnCosteo:
                                  evento.target
                                    .checked,
                              }),
                            )
                          }
                        />

                        Incluir en costeo
                      </label>
                    </div>

                    <div style={acciones}>
                      <button
                        type="button"
                        onClick={agregarComponente}
                        disabled={guardando}
                        style={botonPrincipal}
                      >
                        Agregar componente
                      </button>
                    </div>
                  </section>
                )}

                {versionSeleccionada.estado ===
                  "BORRADOR" && (
                  <section style={panelAccion}>
                    <div>
                      <h2 style={tituloPanel}>
                        Activar versión
                      </h2>

                      <p style={descripcion}>
                        Al activar esta versión, la
                        anterior quedará obsoleta.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={activarVersion}
                      disabled={guardando}
                      style={botonPrincipal}
                    >
                      Activar versión
                    </button>
                  </section>
                )}
              </>
            )}
        </>
      )}

      {vista === "COSTEO" && (
        <>
          <section style={panel}>
            <div style={formularioGrid}>
              <div>
                <label style={label}>
                  Receta
                </label>

                <select
                  value={recetaId}
                  onChange={(evento) =>
                    setRecetaId(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  <option value="">
                    Seleccione...
                  </option>

                  {recetas
                    .filter(
                      (receta) =>
                        receta.tipo ===
                        "PRODUCTO_TERMINADO",
                    )
                    .map((receta) => (
                      <option
                        key={receta.id}
                        value={receta.id}
                      >
                        {receta.nombre}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label style={label}>
                  Versión
                </label>

                <select
                  value={versionId}
                  onChange={(evento) =>
                    setVersionId(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  <option value="">
                    Seleccione...
                  </option>

                  {versiones.map(
                    (version) => (
                      <option
                        key={version.id}
                        value={version.id}
                      >
                        V
                        {
                          version.numero_version
                        }{" "}
                        · {version.estado}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          </section>

          {!costo ? (
            <section style={estadoVacio}>
              Selecciona una receta vigente con
              componentes para calcular el costo.
            </section>
          ) : (
            <section style={resumenCostos}>
              <article style={tarjetaCosto}>
                <span style={etiquetaCosto}>
                  COSTO DEL BATCH
                </span>

                <strong style={valorCosto}>
                  {moneda(
                    costo.costo_materia_prima_batch,
                  )}
                </strong>
              </article>

              <article style={tarjetaCosto}>
                <span style={etiquetaCosto}>
                  COSTO POR KG
                </span>

                <strong style={valorCosto}>
                  {moneda(
                    costo.costo_materia_prima_kg,
                  )}
                </strong>
              </article>

              <article style={tarjetaCosto}>
                <span style={etiquetaCosto}>
                  COSTO POR UNIDAD
                </span>

                <strong style={valorCosto}>
                  {moneda(
                    costo.costo_materia_prima_unidad,
                  )}
                </strong>
              </article>

              <article style={tarjetaCosto}>
                <span style={etiquetaCosto}>
                  COMPONENTES SIN COSTO
                </span>

                <strong style={valorCosto}>
                  {
                    costo.componentes_sin_costo
                  }
                </strong>
              </article>
            </section>
          )}
        </>
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
  width: "fit-content",
  marginBottom: "22px",
  padding: "6px",
  borderRadius: "10px",
  background: "#e5e7eb",
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

const panelAccion = {
  ...panel,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "20px",
}

const tituloPanel = {
  margin: 0,
  fontSize: "21px",
}

const descripcion = {
  margin: "6px 0 0",
  color: "#6b7280",
  lineHeight: 1.5,
}

const formularioGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
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

const barraFiltros = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: "14px",
  marginBottom: "18px",
}

const campoBusqueda = {
  ...campo,
  flex: "1 1 280px",
}

const campoFiltro = {
  ...campo,
  width: "220px",
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

const rejillaRecetas = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "16px",
}

const tarjetaReceta = {
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between",
  gap: "20px",
  minHeight: "180px",
  padding: "20px",
  border: "1px solid #e2e5e9",
  borderRadius: "12px",
  background: "white",
}

const tipoReceta = {
  color: "#8f1d24",
  fontSize: "11px",
  fontWeight: "bold",
  letterSpacing: "0.8px",
}

const nombreReceta = {
  margin: "8px 0 4px",
  fontSize: "20px",
}

const codigoReceta = {
  margin: 0,
  color: "#6b7280",
}

const botonAbrir = {
  width: "100%",
  padding: "10px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const tituloConContador = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  marginBottom: "18px",
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

const botonEliminar = {
  padding: "8px 12px",
  border: "1px solid #b91c1c",
  borderRadius: "7px",
  background: "white",
  color: "#b91c1c",
  fontWeight: "bold",
  cursor: "pointer",
}

const checkLabel = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "#374151",
  fontWeight: "bold",
}

const estadoVacio = {
  padding: "28px",
  border: "1px dashed #cfd4da",
  borderRadius: "9px",
  color: "#6b7280",
  textAlign: "center" as const,
}

const resumenCostos = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
}

const tarjetaCosto = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "9px",
  padding: "20px",
  border: "1px solid #e2e5e9",
  borderRadius: "12px",
  background: "white",
}

const etiquetaCosto = {
  color: "#6b7280",
  fontSize: "12px",
  fontWeight: "bold",
}

const valorCosto = {
  color: "#8f1d24",
  fontSize: "26px",
}