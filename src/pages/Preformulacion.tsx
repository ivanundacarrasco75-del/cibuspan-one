import { useEffect, useMemo, useRef, useState } from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  activarVersionFmDb,
  agregarComponenteFmDb,
  actualizarComponenteFmDb,
  crearFormulaFmDb,
  crearMicroFmDb,
  crearReformulacionFmDb,
  crearVersionFormulaFmDb,
  eliminarComponenteFmDb,
  eliminarVersionBorradorFmDb,
  obtenerComponentesFmDb,
  obtenerFormulasFmDb,
  obtenerMateriasPrimasFmDb,
  obtenerMicrosFmDb,
  obtenerResumenFormulaFmDb,
  obtenerVersionesMicroFmDb,
  obtenerVersionesFormulaFmDb,
  type CostoFormulaFmDb,
  type CostoProductoCompletoFmDb,
  type EmpaqueProductoFmDb,
  type FormulaFinalFmDb,
  type FormulaFmDb,
  type FormulaVersionFmDb,
  type MateriaPrimaFmDb,
  type MicroFmDb,
  type MicroVersionFmDb,
  type PreformulacionCalculadaFmDb,
  type PreformulacionComponenteFmDb,
  type RecetaMicroFmDb,
} from "../repositories/formulaRepository"

type Vista =
  | "FORMULAS"
  | "MICROS"
  | "VERSIONES"
  | "PREFORMULACION"
  | "RESULTADOS"

function numero(
  valor: number | null | undefined,
  decimales = 3,
) {
  return Number(valor ?? 0).toLocaleString(
    "es-EC",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimales,
    },
  )
}

function numeroFijo(
  valor: number | null | undefined,
  decimales = 3,
) {
  return Number(valor ?? 0).toLocaleString(
    "es-EC",
    {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    },
  )
}

function numeroEntero(valor: number | null | undefined) {
  return Math.round(Number(valor ?? 0)).toLocaleString(
    "es-EC",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
  )
}

function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
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

export default function Preformulacion() {
  const [vista, setVista] =
    useState<Vista>("FORMULAS")
  const historialVistasRef = useRef<Vista[]>([])

  function cambiarVista(destino: Vista) {
    setVista((actual) => {
      if (actual === destino) return actual

      historialVistasRef.current = [
        ...historialVistasRef.current,
        actual,
      ].slice(-30)

      return destino
    })
  }

  const [formulas, setFormulas] = useState<
    FormulaFmDb[]
  >([])

  const [micros, setMicros] = useState<
    MicroFmDb[]
  >([])

  const [materias, setMaterias] = useState<
    MateriaPrimaFmDb[]
  >([])

  const [versiones, setVersiones] = useState<
    FormulaVersionFmDb[]
  >([])

  const [componentes, setComponentes] =
    useState<PreformulacionComponenteFmDb[]>([])

  const [preformulacion, setPreformulacion] =
    useState<PreformulacionCalculadaFmDb[]>([])

  const [formulaFinal, setFormulaFinal] =
    useState<FormulaFinalFmDb[]>([])

  const [recetasMicro, setRecetasMicro] =
    useState<RecetaMicroFmDb[]>([])

  const [costo, setCosto] =
    useState<CostoFormulaFmDb | null>(null)

  const [costosProducto, setCostosProducto] =
    useState<CostoProductoCompletoFmDb[]>([])

  const [empaquesProducto, setEmpaquesProducto] =
    useState<EmpaqueProductoFmDb[]>([])

  const [formulaId, setFormulaId] = useState("")
  const [versionId, setVersionId] = useState("")

  const [codigoFormula, setCodigoFormula] =
    useState("")
  const [nombreFormula, setNombreFormula] =
    useState("")
  const [descripcionFormula, setDescripcionFormula] =
    useState("")

  const [codigoMicro, setCodigoMicro] =
    useState("")
  const [nombreMicro, setNombreMicro] =
    useState("")
  const [descripcionMicro, setDescripcionMicro] =
    useState("")

  const [panesPorBatch, setPanesPorBatch] =
    useState("")
  const [pesoBolaG, setPesoBolaG] =
    useState("")
  const [pesoFinalG, setPesoFinalG] =
    useState("")
  const [pesoBatchKg, setPesoBatchKg] =
    useState("")
  const [rendimientoUnidades, setRendimientoUnidades] =
    useState("")
  const [paradasPorBatch, setParadasPorBatch] =
    useState("1")
  const [mermaPorcentaje, setMermaPorcentaje] =
    useState("0")
  const [observacionesVersion, setObservacionesVersion] =
    useState("")

  const [materiaPrimaId, setMateriaPrimaId] =
    useState("")
  const [porcentajePanadero, setPorcentajePanadero] =
    useState("")
  const [destinoTipo, setDestinoTipo] =
    useState<"DIRECTO" | "MICRO">("DIRECTO")
  const [microId, setMicroId] = useState("")
  const [esHarinaBase, setEsHarinaBase] =
    useState(false)
  const [incluirEnCosteo, setIncluirEnCosteo] =
    useState(true)
  const [componenteEditandoId, setComponenteEditandoId] =
    useState("")

  const [panesObjetivo, setPanesObjetivo] =
    useState("")
  const [preparacionResultado, setPreparacionResultado] =
    useState("FORMULA")
  const [microFichaId, setMicroFichaId] = useState("")
  const [microsObjetivo, setMicrosObjetivo] = useState("1")
  const [versionesMicro, setVersionesMicro] = useState<
    MicroVersionFmDb[]
  >([])
  const versionMicroPendienteRef = useRef("")

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] =
    useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const formulaSeleccionada = useMemo(
    () =>
      formulas.find(
        (formula) => formula.id === formulaId,
      ) ?? null,
    [formulas, formulaId],
  )

  const versionSeleccionada = useMemo(
    () =>
      versiones.find(
        (version) => version.id === versionId,
      ) ?? null,
    [versiones, versionId],
  )

  const microFichaSeleccionado = useMemo(
    () =>
      micros.find((micro) => micro.id === microFichaId) ??
      null,
    [micros, microFichaId],
  )

  const microsAgrupados = useMemo(() => {
    const mapa = new Map<string, RecetaMicroFmDb[]>()

    for (const fila of recetasMicro) {
      const actual = mapa.get(fila.micro_id) ?? []
      actual.push(fila)
      mapa.set(fila.micro_id, actual)
    }

    return Array.from(mapa.values())
  }, [recetasMicro])

  const unidadesBase = Number(
    versionSeleccionada?.rendimiento_unidades ??
      versionSeleccionada?.panes_por_batch ??
      0,
  )

  const unidadesPanBase = Number(
    versionSeleccionada?.panes_por_batch ?? unidadesBase,
  )

  const unidadesPorSku =
    unidadesBase > 0 ? unidadesPanBase / unidadesBase : 1

  const paradasBase = Number(
    versionSeleccionada?.paradas_por_batch ?? 1,
  )

  const panesCalculados = Number(panesObjetivo)

  const factorEscala =
    Number.isFinite(panesCalculados) &&
    panesCalculados > 0 &&
    unidadesBase > 0
      ? panesCalculados / unidadesBase
      : 1

  const unidadesPanCalculadas = unidadesPanBase * factorEscala
  const paradasCalculadas = paradasBase * factorEscala

  const microsCalculados = Number(microsObjetivo)

  const factorMicro =
    Number.isFinite(microsCalculados) &&
    microsCalculados > 0
      ? Math.round(microsCalculados)
      : 1

  function cambiarMicrosObjetivo(valor: string) {
    if (valor === "") {
      setMicrosObjetivo("")
      return
    }

    const cantidad = Number(valor)
    setMicrosObjetivo(
      Number.isFinite(cantidad)
        ? String(Math.max(0, Math.round(cantidad)))
        : "",
    )
  }

  const factorCantidadMicro = microFichaId
    ? factorMicro
    : factorEscala

  const microSeleccionadoId =
    preparacionResultado.startsWith("MICRO:")
      ? preparacionResultado.slice(6)
      : ""

  const microSeleccionado =
    microsAgrupados.find(
      (grupo) => grupo[0]?.micro_id === microSeleccionadoId,
    ) ?? null

  const cantidadBaseMicroSeleccionado = preformulacion
    .filter(
      (fila) => fila.micro_id === microSeleccionadoId,
    )
    .reduce(
      (total, fila) =>
        total + Number(fila.cantidad_batch_kg ?? 0),
      0,
    )

  const resumenMicros = useMemo(
    () =>
      microsAgrupados.map((grupo) => {
        const micro = grupo[0]
        const cantidadBase = preformulacion
          .filter((fila) => fila.micro_id === micro.micro_id)
          .reduce(
            (total, fila) =>
              total + Number(fila.cantidad_batch_kg ?? 0),
            0,
          )

        return {
          id: micro.micro_id,
          nombre: micro.micro_nombre,
          numeroMicros: factorEscala,
          cantidadKg: cantidadBase * factorEscala,
        }
      }),
    [microsAgrupados, preformulacion, factorEscala],
  )

  useEffect(() => {
    cargarCatalogos()
  }, [])

  useEffect(() => {
    function regresarVistaInterna(evento: Event) {
      const anterior = historialVistasRef.current.pop()

      if (!anterior) return

      evento.preventDefault()
      if (anterior !== "RESULTADOS") {
        setMicroFichaId("")
      }
      setVista(anterior)
    }

    window.addEventListener(
      "c1:regresar",
      regresarVistaInterna,
    )

    return () => {
      window.removeEventListener(
        "c1:regresar",
        regresarVistaInterna,
      )
    }
  }, [])

  useEffect(() => {
    if (!formulaId) {
      setVersiones([])
      setVersionId("")
      setComponentes([])
      limpiarResultados()
      return
    }

    cargarVersiones(formulaId)
  }, [formulaId])

  useEffect(() => {
    if (!versionId) {
      setComponentes([])
      limpiarResultados()
      return
    }

    cargarVersion(versionId)
  }, [versionId])

  useEffect(() => {
    if (!versionSeleccionada) {
      setPanesObjetivo("")
      return
    }

    setPanesObjetivo(
      String(
        versionSeleccionada.rendimiento_unidades ??
        versionSeleccionada.panes_por_batch ??
          "",
      ),
    )
    setPreparacionResultado(
      microFichaId
        ? `MICRO:${microFichaId}`
        : "FORMULA",
    )
  }, [versionId, versionSeleccionada, microFichaId])

  function limpiarResultados() {
    setPreformulacion([])
    setFormulaFinal([])
    setRecetasMicro([])
    setCosto(null)
    setCostosProducto([])
    setEmpaquesProducto([])
  }

  async function cargarCatalogos() {
    setCargando(true)
    setError("")

    try {
      const [
        formulasDb,
        microsDb,
        materiasDb,
      ] = await Promise.all([
        obtenerFormulasFmDb(),
        obtenerMicrosFmDb(),
        obtenerMateriasPrimasFmDb(),
      ])

      setFormulas(formulasDb)
      setMicros(microsDb)
      setMaterias(materiasDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el módulo.",
      )
    } finally {
      setCargando(false)
    }
  }

  async function cargarVersiones(id: string) {
    try {
      const datos =
        await obtenerVersionesFormulaFmDb(id)

      setVersiones(datos)

      if (datos.length > 0) {
        const versionPreferida = datos.find(
          (version) =>
            version.id ===
            versionMicroPendienteRef.current,
        )

        const vigente =
          versionPreferida ??
          datos.find(
            (version) =>
              version.estado === "VIGENTE",
          ) ?? datos[0]

        setVersionId(vigente.id)
        versionMicroPendienteRef.current = ""
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

  async function cargarVersion(id: string) {
    try {
      const [componentesDb, resumen] =
        await Promise.all([
          obtenerComponentesFmDb(id),
          obtenerResumenFormulaFmDb(id),
        ])

      setComponentes(componentesDb)

      if (
        componenteEditandoId &&
        !componentesDb.some(
          (componente) =>
            componente.id === componenteEditandoId,
        )
      ) {
        limpiarFormularioComponente()
      }
      setPreformulacion(resumen.preformulacion)
      setFormulaFinal(resumen.formulaFinal)
      setRecetasMicro(resumen.recetasMicro)
      setCosto(resumen.costo)
      setCostosProducto(resumen.costosProducto)
      setEmpaquesProducto(resumen.empaquesProducto)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la versión.",
      )
    }
  }

  function abrirVersionMicro(version: MicroVersionFmDb) {
    setPreparacionResultado(`MICRO:${version.micro_id}`)
    setMicrosObjetivo("1")

    if (formulaId === version.formula_id) {
      setVersionId(version.formula_version_id)
      return
    }

    versionMicroPendienteRef.current =
      version.formula_version_id
    setFormulaId(version.formula_id)
  }

  async function abrirMicroComoFormula(micro: MicroFmDb) {
    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      const versionesDb =
        await obtenerVersionesMicroFmDb(micro.id)

      if (versionesDb.length === 0) {
        setError(
          "Este micro todavía no tiene una receta asignada a una versión de pan.",
        )
        return
      }

      const versionInicial =
        versionesDb.find(
          (version) => version.estado === "VIGENTE",
        ) ?? versionesDb[0]

      setVersionesMicro(versionesDb)
      setMicroFichaId(micro.id)
      cambiarVista("RESULTADOS")
      abrirVersionMicro(versionInicial)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo abrir la fórmula del micro.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function crearFormula() {
    setError("")
    setMensaje("")

    setGuardando(true)

    try {
      const formula = await crearFormulaFmDb({
        codigo: codigoFormula,
        nombre: nombreFormula,
        descripcion: descripcionFormula,
      })

      setCodigoFormula("")
      setNombreFormula("")
      setDescripcionFormula("")
      setMensaje("Fórmula creada correctamente.")

      await cargarCatalogos()
      setFormulaId(formula.id)
      cambiarVista("VERSIONES")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear la fórmula.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function crearMicro() {
    setError("")
    setMensaje("")
    setGuardando(true)

    try {
      await crearMicroFmDb({
        codigo: codigoMicro,
        nombre: nombreMicro,
        descripcion: descripcionMicro,
      })

      setCodigoMicro("")
      setNombreMicro("")
      setDescripcionMicro("")
      setMensaje("Micro creado correctamente.")

      await cargarCatalogos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el micro.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function crearVersion() {
    if (!formulaSeleccionada) {
      setError("Selecciona una fórmula.")
      return
    }

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      const version =
        await crearVersionFormulaFmDb({
          formulaId: formulaSeleccionada.id,
          versionOrigenId: versionSeleccionada?.id ?? null,
          panesPorBatch:
            panesPorBatch === ""
              ? null
              : Number(panesPorBatch),
          pesoBolaG:
            pesoBolaG === ""
              ? null
              : Number(pesoBolaG),
          pesoFinalG:
            pesoFinalG === ""
              ? null
              : Number(pesoFinalG),
          pesoBatchKg:
            pesoBatchKg === ""
              ? null
              : Number(pesoBatchKg),
          rendimientoUnidades:
            rendimientoUnidades === ""
              ? null
              : Number(rendimientoUnidades),
          paradasPorBatch:
            paradasPorBatch === ""
              ? 1
              : Number(paradasPorBatch),
          mermaPorcentaje:
            Number(mermaPorcentaje || 0),
          observaciones:
            observacionesVersion,
        })

      setMensaje(
        `Versión ${version.numero_version} creada con sus versiones de micros.`,
      )

      setPanesPorBatch("")
      setPesoBolaG("")
      setPesoFinalG("")
      setPesoBatchKg("")
      setRendimientoUnidades("")
      setParadasPorBatch("1")
      setMermaPorcentaje("0")
      setObservacionesVersion("")

      await cargarVersiones(
        formulaSeleccionada.id,
      )
      setVersionId(version.id)
      cambiarVista("PREFORMULACION")
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

  async function crearReformulacion() {
    if (!versionSeleccionada) return

    const confirmar = window.confirm(
      `¿Crear una nueva reformulación a partir de la versión ${versionSeleccionada.numero_version}?`,
    )

    if (!confirmar) return

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      const nuevaVersionId =
        await crearReformulacionFmDb(
          versionSeleccionada.id,
        )

      await cargarVersiones(
        versionSeleccionada.formula_id,
      )
      setVersionId(nuevaVersionId)
      cambiarVista("PREFORMULACION")
      setMensaje(
        "Reformulación creada. Ya puedes editar o sustituir ingredientes.",
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear la reformulación.",
      )
    } finally {
      setGuardando(false)
    }
  }

  function limpiarFormularioComponente() {
    setComponenteEditandoId("")
    setMateriaPrimaId("")
    setPorcentajePanadero("")
    setDestinoTipo("DIRECTO")
    setMicroId("")
    setEsHarinaBase(false)
    setIncluirEnCosteo(true)
  }

  function cargarFormularioComponente(
    componente: PreformulacionComponenteFmDb,
  ) {
    setComponenteEditandoId(componente.id)
    setMateriaPrimaId(componente.materia_prima_id)
    setPorcentajePanadero(
      String(componente.porcentaje_panadero),
    )
    setDestinoTipo(componente.destino_tipo)
    setMicroId(componente.micro_id ?? "")
    setEsHarinaBase(componente.es_harina_base)
    setIncluirEnCosteo(componente.incluir_en_costeo)
  }

  async function editarComponente(
    componente: PreformulacionComponenteFmDb,
  ) {
    if (!versionSeleccionada) return

    if (versionSeleccionada.estado === "BORRADOR") {
      cargarFormularioComponente(componente)
      return
    }

    const confirmar = window.confirm(
      "Esta versión está protegida. ¿Crear una reformulación y editar allí este ingrediente?",
    )

    if (!confirmar) return

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      const nuevaVersionId =
        await crearReformulacionFmDb(
          versionSeleccionada.id,
        )

      const componentesNuevos =
        await obtenerComponentesFmDb(nuevaVersionId)

      const copia = componentesNuevos.find(
        (item) =>
          item.orden === componente.orden &&
          item.materia_prima_id ===
            componente.materia_prima_id,
      )

      await cargarVersiones(
        versionSeleccionada.formula_id,
      )
      setVersionId(nuevaVersionId)
      await cargarVersion(nuevaVersionId)

      if (copia) {
        cargarFormularioComponente(copia)
      }

      setMensaje(
        "Reformulación creada. Modifica el ingrediente y guarda los cambios.",
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar la edición.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function guardarComponente() {
    if (!versionSeleccionada) {
      setError("Selecciona una versión.")
      return
    }

    if (
      versionSeleccionada.estado !== "BORRADOR"
    ) {
      setError(
        "Solo se modifican versiones en BORRADOR.",
      )
      return
    }

    if (!materiaPrimaId) {
      setError("Selecciona una materia prima.")
      return
    }

    const porcentaje = Number(porcentajePanadero)

    if (
      !Number.isFinite(porcentaje) ||
      porcentaje < 0
    ) {
      setError(
        "Ingresa un porcentaje panadero válido.",
      )
      return
    }

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      const componenteActual = componentes.find(
        (componente) =>
          componente.id === componenteEditandoId,
      )

      if (componenteActual) {
        await actualizarComponenteFmDb(
          componenteActual.id,
          {
            materiaPrimaId,
            porcentajePanadero: porcentaje,
            destinoTipo,
            microId:
              destinoTipo === "MICRO"
                ? microId
                : null,
            esHarinaBase,
            incluirEnCosteo,
            orden: componenteActual.orden,
          },
        )
        setMensaje("Ingrediente actualizado.")
      } else {
        await agregarComponenteFmDb({
          formulaVersionId:
            versionSeleccionada.id,
          materiaPrimaId,
          porcentajePanadero: porcentaje,
          destinoTipo,
          microId:
            destinoTipo === "MICRO"
              ? microId
              : null,
          esHarinaBase,
          incluirEnCosteo,
          orden: componentes.length + 1,
        })
        setMensaje("Ingrediente agregado.")
      }

      limpiarFormularioComponente()
      await cargarVersion(
        versionSeleccionada.id,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo agregar el ingrediente.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarComponente(
    componente: PreformulacionComponenteFmDb,
  ) {
    const confirmar = window.confirm(
      "¿Eliminar este ingrediente?",
    )

    if (!confirmar) return

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      await eliminarComponenteFmDb(
        componente.id,
      )

      if (componenteEditandoId === componente.id) {
        limpiarFormularioComponente()
      }

      setMensaje("Ingrediente eliminado.")
      await cargarVersion(
        componente.formula_version_id,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el ingrediente.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarVersion(
    version: FormulaVersionFmDb,
  ) {
    if (version.estado !== "BORRADOR") {
      setError(
        "Solo se pueden eliminar versiones en BORRADOR.",
      )
      return
    }

    const confirmar = window.confirm(
      `¿Eliminar definitivamente la versión ${version.numero_version} y sus componentes?`,
    )

    if (!confirmar) return

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      await eliminarVersionBorradorFmDb(version.id)

      if (versionId === version.id) {
        setVersionId("")
        limpiarFormularioComponente()
      }

      await cargarVersiones(version.formula_id)
      setMensaje("Versión borrador eliminada.")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar la versión.",
      )
    } finally {
      setGuardando(false)
    }
  }

  async function activarVersion() {
    if (!versionSeleccionada) return

    const confirmar = window.confirm(
      `¿Activar la versión ${versionSeleccionada.numero_version}?`,
    )

    if (!confirmar) return

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      await activarVersionFmDb(
        versionSeleccionada.id,
      )

      setMensaje("Versión activada correctamente.")

      if (formulaSeleccionada) {
        await cargarVersiones(
          formulaSeleccionada.id,
        )
      }

      await cargarVersion(
        versionSeleccionada.id,
      )
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

  async function seleccionarComoVigente(
    version: FormulaVersionFmDb,
  ) {
    if (version.estado === "VIGENTE") return

    const mensajeConfirmacion =
      version.estado === "OBSOLETA"
        ? `¿Restaurar la versión ${version.numero_version}? Se creará una nueva copia y quedará como vigente.`
        : `¿Activar la versión ${version.numero_version} como vigente?`

    if (!window.confirm(mensajeConfirmacion)) return

    setGuardando(true)
    setError("")
    setMensaje("")

    try {
      const versionParaActivar =
        version.estado === "OBSOLETA"
          ? await crearReformulacionFmDb(version.id)
          : version.id

      await activarVersionFmDb(versionParaActivar)
      await cargarVersiones(version.formula_id)
      setVersionId(versionParaActivar)

      setMensaje(
        version.estado === "OBSOLETA"
          ? `Versión ${version.numero_version} restaurada como una nueva versión vigente.`
          : `Versión ${version.numero_version} activada correctamente.`,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo seleccionar la versión vigente.",
      )
    } finally {
      setGuardando(false)
    }
  }

  function cantidadIngredienteMicro(
    fila: RecetaMicroFmDb,
  ) {
    const componente = preformulacion.find(
      (item) =>
        item.micro_id === fila.micro_id &&
        item.materia_prima_id === fila.materia_prima_id,
    )

    return Number(componente?.cantidad_batch_kg ?? 0) *
      factorCantidadMicro
  }

  function imprimirFormulaProduccion() {
    if (!versionSeleccionada || !formulaSeleccionada) {
      setError("Selecciona una fórmula y una versión para imprimir.")
      return
    }

    const esFormulaPan = preparacionResultado === "FORMULA"
    const tituloImpresion = esFormulaPan
      ? formulaSeleccionada.nombre
      : microSeleccionado?.[0]?.micro_nombre ?? "Micro"

    const filasImpresion = esFormulaPan
      ? formulaFinal.map((fila) => ({
          nombre: fila.componente_nombre,
          cantidad:
            Number(fila.cantidad_batch_kg ?? 0) *
            factorEscala,
        }))
      : (microSeleccionado ?? []).map((fila) => ({
          nombre: fila.materia_nombre,
          cantidad: cantidadIngredienteMicro(fila),
        }))

    if (filasImpresion.length === 0) {
      setError("No hay cantidades disponibles para imprimir.")
      return
    }

    const ventana = window.open(
      "",
      "_blank",
      "width=900,height=700",
    )

    if (!ventana) {
      setError(
        "El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e intenta otra vez.",
      )
      return
    }

    const filasHtml = filasImpresion
      .map(
        (fila) => `
          <tr>
            <td>${escaparHtml(fila.nombre)}</td>
            <td class="cantidad">${numeroFijo(fila.cantidad)} kg</td>
          </tr>`,
      )
      .join("")

    const datoEscala = esFormulaPan
      ? `Paradas equivalentes: ${numeroFijo(paradasCalculadas, 0)}`
      : `Peso unitario: ${numeroFijo(
          cantidadBaseMicroSeleccionado,
        )} kg · Cantidad total: ${numeroFijo(
          cantidadBaseMicroSeleccionado *
            factorCantidadMicro,
        )} kg`

    const datoProduccion = esFormulaPan
      ? `<div><strong>Fundas requeridas:</strong> ${numero(panesCalculados, 0)}</div>
         <div><strong>Unidades individuales:</strong> ${numero(unidadesPanCalculadas, 0)}</div>`
      : `<div><strong>Micros requeridos:</strong> ${numeroEntero(factorCantidadMicro)}</div>`

    ventana.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>${escaparHtml(tituloImpresion)} · Hoja de producción</title>
          <style>
            @page { size: A4; margin: 15mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #111827;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 13px;
            }
            header {
              padding-bottom: 14px;
              border-bottom: 3px solid #8f1d24;
            }
            .marca {
              color: #8f1d24;
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 1px;
            }
            h1 { margin: 7px 0 4px; font-size: 24px; }
            .subtitulo { margin: 0; color: #4b5563; }
            .datos {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 8px 24px;
              margin: 18px 0;
              padding: 12px;
              border: 1px solid #d1d5db;
              border-radius: 8px;
              background: #f9fafb;
            }
            table { width: 100%; border-collapse: collapse; }
            th, td {
              padding: 10px 9px;
              border-bottom: 1px solid #d1d5db;
              text-align: left;
            }
            th {
              background: #f3f4f6;
              font-size: 11px;
              text-transform: uppercase;
            }
            .cantidad { text-align: right; font-weight: 700; }
            footer { margin-top: 24px; color: #6b7280; font-size: 11px; }
          </style>
        </head>
        <body>
          <header>
            <div class="marca">CIBUSPAN ONE</div>
            <h1>${escaparHtml(tituloImpresion)}</h1>
            <p class="subtitulo">Hoja de producción · ${esFormulaPan ? "Fórmula de pan" : "Receta de micro"}</p>
          </header>

          <section class="datos">
            <div><strong>Versión:</strong> V${versionSeleccionada.numero_version}</div>
            ${datoProduccion}
            <div><strong>${datoEscala}</strong></div>
            <div><strong>Fecha:</strong> ${new Date().toLocaleDateString("es-EC")}</div>
          </section>

          <table>
            <thead>
              <tr>
                <th>Ingrediente / componente</th>
                <th class="cantidad">Cantidad</th>
              </tr>
            </thead>
            <tbody>${filasHtml}</tbody>
          </table>

          <footer>Documento generado desde CIBUSPAN ONE.</footer>
        </body>
      </html>`)

    ventana.document.close()
    ventana.focus()
    window.setTimeout(() => ventana.print(), 250)
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
            MOTOR DE FORMULACIÓN V3
          </span>

          <h1 style={titulo}>
            Preformulación
          </h1>

          <p style={subtitulo}>
            Formula todos los ingredientes en porcentaje
            panadero y decide cuáles ingresan directamente
            o mediante un micro.
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
          ["FORMULAS", "Fórmulas"],
          ["MICROS", "Catálogo de micros"],
          ["VERSIONES", "Versiones"],
          ["PREFORMULACION", "Preformulación"],
          ["RESULTADOS", "Resultados"],
        ].map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            onClick={() => {
              if (valor !== "RESULTADOS") {
                setMicroFichaId("")
              }
              cambiarVista(valor as Vista)
            }}
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

      {vista === "FORMULAS" && (
        <>
          <section style={panel}>
            <h2 style={tituloPanel}>
              Crear fórmula maestra
            </h2>

            <div style={formularioGrid}>
              <Campo
                etiqueta="Código"
                valor={codigoFormula}
                cambiar={setCodigoFormula}
              />

              <Campo
                etiqueta="Nombre"
                valor={nombreFormula}
                cambiar={setNombreFormula}
              />

              <Campo
                etiqueta="Descripción"
                valor={descripcionFormula}
                cambiar={setDescripcionFormula}
              />
            </div>

            <div style={acciones}>
              <button
                type="button"
                onClick={crearFormula}
                disabled={guardando}
                style={botonPrincipal}
              >
                Crear fórmula
              </button>
            </div>
          </section>

          <section style={rejilla}>
            {formulas.map((formula) => (
              <article
                key={formula.id}
                style={tarjeta}
              >
                <div>
                  <span style={codigoTarjeta}>
                    {formula.codigo}
                  </span>

                  <h2 style={nombreTarjeta}>
                    {formula.nombre}
                  </h2>

                  <p style={descripcion}>
                    {formula.descripcion ??
                      "Sin descripción"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMicroFichaId("")
                    setFormulaId(formula.id)
                    cambiarVista("VERSIONES")
                  }}
                  style={botonPrincipal}
                >
                  Abrir
                </button>
              </article>
            ))}

            {micros.map((micro) => (
              <article key={micro.id} style={tarjeta}>
                <div>
                  <span style={codigoTarjeta}>
                    MICRO · {micro.codigo}
                  </span>

                  <h2 style={nombreTarjeta}>
                    {micro.nombre}
                  </h2>

                  <p style={descripcion}>
                    {micro.descripcion ?? "Fórmula de micro"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => abrirMicroComoFormula(micro)}
                  disabled={guardando}
                  style={botonPrincipal}
                >
                  Abrir fórmula
                </button>
              </article>
            ))}
          </section>
        </>
      )}

      {vista === "MICROS" && (
        <>
          <section style={panel}>
            <h2 style={tituloPanel}>
              Crear micro
            </h2>

            <div style={formularioGrid}>
              <Campo
                etiqueta="Código"
                valor={codigoMicro}
                cambiar={setCodigoMicro}
              />

              <Campo
                etiqueta="Nombre"
                valor={nombreMicro}
                cambiar={setNombreMicro}
              />

              <Campo
                etiqueta="Descripción"
                valor={descripcionMicro}
                cambiar={setDescripcionMicro}
              />
            </div>

            <div style={acciones}>
              <button
                type="button"
                onClick={crearMicro}
                disabled={guardando}
                style={botonPrincipal}
              >
                Crear micro
              </button>
            </div>
          </section>

          <section style={rejilla}>
            {micros.map((micro) => (
              <article
                key={micro.id}
                style={tarjeta}
              >
                <span style={codigoTarjeta}>
                  {micro.codigo}
                </span>

                <h2 style={nombreTarjeta}>
                  {micro.nombre}
                </h2>

                <p style={descripcion}>
                  {micro.descripcion ??
                    "Sin descripción"}
                </p>

                <button
                  type="button"
                  onClick={() => abrirMicroComoFormula(micro)}
                  disabled={guardando}
                  style={botonPrincipal}
                >
                  Abrir fórmula
                </button>
              </article>
            ))}
          </section>
        </>
      )}

      {vista === "VERSIONES" && (
        <>
          <SelectorFormula
            formulas={formulas}
            formulaId={formulaId}
            cambiarFormula={setFormulaId}
          />

          {formulaSeleccionada && (
            <>
              <section style={panel}>
                <h2 style={tituloPanel}>
                  Versiones de {formulaSeleccionada.nombre}
                </h2>

                <div style={{ overflowX: "auto" }}>
                  <table style={tabla}>
                    <thead>
                      <tr>
                        <th style={encabezado}>Versión</th>
                        <th style={encabezado}>Estado</th>
                        <th style={encabezado}>Unidades de pan</th>
                        <th style={encabezado}>Rendimiento fundas</th>
                        <th style={encabezado}>Paradas</th>
                        <th style={encabezado}>Peso bola</th>
                        <th style={encabezado}>Batch</th>
                        <th style={encabezado}>Acción</th>
                      </tr>
                    </thead>

                    <tbody>
                      {versiones.map((version) => (
                        <tr key={version.id}>
                          <td style={celda}>
                            V{version.numero_version}
                          </td>

                          <td style={celda}>
                            {version.estado}
                          </td>

                          <td style={celdaNumero}>
                            {version.panes_por_batch ??
                              "—"}
                          </td>

                          <td style={celdaNumero}>
                            {version.rendimiento_unidades ?? "—"}
                          </td>

                          <td style={celdaNumero}>
                            {numero(version.paradas_por_batch, 0)}
                          </td>

                          <td style={celdaNumero}>
                            {version.peso_bola_g
                              ? `${numero(
                                  version.peso_bola_g,
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
                            <div style={accionesTabla}>
                              <button
                                type="button"
                                onClick={() => {
                                  setVersionId(
                                    version.id,
                                  )
                                  cambiarVista(
                                    "PREFORMULACION",
                                  )
                                }}
                                style={botonEditar}
                              >
                                Abrir
                              </button>

                              {version.estado !== "VIGENTE" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    seleccionarComoVigente(version)
                                  }
                                  disabled={guardando}
                                  style={botonSeleccionarVigente}
                                >
                                  {version.estado === "OBSOLETA"
                                    ? "Restaurar como vigente"
                                    : "Activar como vigente"}
                                </button>
                              )}

                              {version.estado === "BORRADOR" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    eliminarVersion(version)
                                  }
                                  disabled={guardando}
                                  style={botonEliminar}
                                >
                                  Eliminar versión completa
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section style={panel}>
                <h2 style={tituloPanel}>
                  Crear nueva versión
                </h2>

                <div style={formularioGrid}>
                  <CampoNumero
                    etiqueta="Unidades de pan por batch"
                    valor={panesPorBatch}
                    cambiar={setPanesPorBatch}
                  />

                  <CampoNumero
                    etiqueta="Peso bola (g)"
                    valor={pesoBolaG}
                    cambiar={setPesoBolaG}
                    paso="0.01"
                  />

                  <CampoNumero
                    etiqueta="Peso final (g)"
                    valor={pesoFinalG}
                    cambiar={setPesoFinalG}
                    paso="0.01"
                  />

                  <CampoNumero
                    etiqueta="Peso batch directo (kg)"
                    valor={pesoBatchKg}
                    cambiar={setPesoBatchKg}
                    paso="0.001"
                  />

                  <CampoNumero
                    etiqueta="Rendimiento de fundas"
                    valor={rendimientoUnidades}
                    cambiar={setRendimientoUnidades}
                  />

                  <CampoNumero
                    etiqueta="Paradas por batch"
                    valor={paradasPorBatch}
                    cambiar={setParadasPorBatch}
                    paso="1"
                  />

                  <CampoNumero
                    etiqueta="Merma (%)"
                    valor={mermaPorcentaje}
                    cambiar={setMermaPorcentaje}
                    paso="0.01"
                  />

                  <Campo
                    etiqueta="Observaciones"
                    valor={observacionesVersion}
                    cambiar={setObservacionesVersion}
                  />
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

      {vista === "PREFORMULACION" && (
        <>
          <SelectorFormulaVersion
            formulas={formulas}
            formulaId={formulaId}
            cambiarFormula={setFormulaId}
            versiones={versiones}
            versionId={versionId}
            cambiarVersion={setVersionId}
          />

          {versionSeleccionada && (
            <>
              {versionSeleccionada.estado !==
                "BORRADOR" && (
                <section style={panelAccion}>
                  <div>
                    <h2 style={tituloPanel}>
                      Reformular esta versión
                    </h2>

                    <p style={descripcion}>
                      Se creará una copia en borrador. La
                      fórmula vigente permanecerá intacta
                      hasta que actives la nueva versión.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={crearReformulacion}
                    disabled={guardando}
                    style={botonPrincipal}
                  >
                    Crear reformulación
                  </button>
                </section>
              )}

              <section style={panel}>
                <h2 style={tituloPanel}>
                  Ingredientes de la preformulación
                </h2>

                <div style={{ overflowX: "auto" }}>
                  <table style={tabla}>
                    <thead>
                      <tr>
                        <th style={encabezado}>Orden</th>
                        <th style={encabezado}>Ingrediente</th>
                        <th style={encabezado}>% panadero</th>
                        <th style={encabezado}>Destino</th>
                        <th style={encabezado}>Base de harina</th>
                        <th style={encabezado}>Costea</th>
                        <th style={encabezado}>Acción</th>
                      </tr>
                    </thead>

                    <tbody>
                      {componentes.map(
                        (componente) => (
                          <tr key={componente.id}>
                            <td style={celdaNumero}>
                              {componente.orden}
                            </td>

                            <td style={celda}>
                              <strong>
                                {
                                  componente
                                    .materia_prima
                                    ?.nombre
                                }
                              </strong>
                            </td>

                            <td style={celdaNumero}>
                              {numero(
                                componente.porcentaje_panadero,
                                6,
                              )}
                              %
                            </td>

                            <td style={celda}>
                              {componente.destino_tipo ===
                              "DIRECTO"
                                ? "DIRECTO"
                                : componente.micro?.nombre}
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
                              <div style={accionesTabla}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    editarComponente(
                                      componente,
                                    )
                                  }
                                  disabled={guardando}
                                  style={botonEditar}
                                >
                                  Editar
                                </button>

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
                              </div>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {versionSeleccionada.estado ===
                "BORRADOR" && (
                <section style={panel}>
                  <h2 style={tituloPanel}>
                    {componenteEditandoId
                      ? "Editar o sustituir ingrediente"
                      : "Agregar ingrediente"}
                  </h2>

                  <div style={formularioGrid}>
                    <div>
                      <label style={label}>
                        Materia prima
                      </label>

                      <select
                        value={materiaPrimaId}
                        onChange={(evento) =>
                          setMateriaPrimaId(
                            evento.target.value,
                          )
                        }
                        style={campo}
                      >
                        <option value="">
                          Seleccione...
                        </option>

                        {materias.map((materia) => (
                          <option
                            key={materia.id}
                            value={materia.id}
                          >
                            {materia.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <CampoNumero
                      etiqueta="% panadero"
                      valor={porcentajePanadero}
                      cambiar={setPorcentajePanadero}
                      paso="0.000001"
                    />

                    <div>
                      <label style={label}>
                        Destino
                      </label>

                      <select
                        value={destinoTipo}
                        onChange={(evento) => {
                          const valor =
                            evento.target.value as
                              | "DIRECTO"
                              | "MICRO"

                          setDestinoTipo(valor)

                          if (valor === "DIRECTO") {
                            setMicroId("")
                          }
                        }}
                        style={campo}
                      >
                        <option value="DIRECTO">
                          Directo
                        </option>

                        <option value="MICRO">
                          Micro
                        </option>
                      </select>
                    </div>

                    {destinoTipo === "MICRO" && (
                      <div>
                        <label style={label}>
                          Micro de destino
                        </label>

                        <select
                          value={microId}
                          onChange={(evento) =>
                            setMicroId(
                              evento.target.value,
                            )
                          }
                          style={campo}
                        >
                          <option value="">
                            Seleccione...
                          </option>

                          {micros.map((micro) => (
                            <option
                              key={micro.id}
                              value={micro.id}
                            >
                              {micro.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <label style={checkLabel}>
                      <input
                        type="checkbox"
                        checked={esHarinaBase}
                        onChange={(evento) => {
                          const marcado =
                            evento.target.checked

                          setEsHarinaBase(marcado)

                          if (marcado) {
                            setDestinoTipo("DIRECTO")
                            setMicroId("")
                          }
                        }}
                      />

                      Parte de la base de harina
                    </label>

                    <label style={checkLabel}>
                      <input
                        type="checkbox"
                        checked={incluirEnCosteo}
                        onChange={(evento) =>
                          setIncluirEnCosteo(
                            evento.target.checked,
                          )
                        }
                      />

                      Incluir en costeo
                    </label>
                  </div>

                  <div style={acciones}>
                    <button
                      type="button"
                      onClick={guardarComponente}
                      disabled={guardando}
                      style={botonPrincipal}
                    >
                      {componenteEditandoId
                        ? "Guardar cambios"
                        : "Agregar ingrediente"}
                    </button>

                    {componenteEditandoId && (
                      <button
                        type="button"
                        onClick={limpiarFormularioComponente}
                        disabled={guardando}
                        style={botonSecundario}
                      >
                        Cancelar edición
                      </button>
                    )}
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
                      Los ingredientes marcados como base de
                      harina deben sumar 100%.
                    </p>
                  </div>

                  <div style={accionesPanel}>
                    <button
                      type="button"
                      onClick={() =>
                        eliminarVersion(versionSeleccionada)
                      }
                      disabled={guardando}
                      style={botonEliminarPrincipal}
                    >
                      Eliminar versión completa
                    </button>

                    <button
                      type="button"
                      onClick={activarVersion}
                      disabled={guardando}
                      style={botonPrincipal}
                    >
                      Activar versión
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {vista === "RESULTADOS" && (
        <>
          {microFichaSeleccionado ? (
            <section style={panel}>
              <span style={etiqueta}>FÓRMULA DE MICRO</span>
              <h2 style={tituloPanel}>
                {microFichaSeleccionado.nombre}
              </h2>

              <div style={formularioGrid}>
                <div>
                  <label style={label}>
                    Versión del micro
                  </label>

                  <select
                    value={versionId}
                    onChange={(evento) => {
                      const version = versionesMicro.find(
                        (item) =>
                          item.formula_version_id ===
                          evento.target.value,
                      )

                      if (version) {
                        abrirVersionMicro(version)
                      }
                    }}
                    style={campo}
                  >
                    {versionesMicro.map((version) => (
                      <option
                        key={version.formula_version_id}
                        value={version.formula_version_id}
                      >
                        V{version.numero_version} · {version.estado} · {version.formula_nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>Fórmula principal</label>
                  <div style={campoLectura}>
                    {formulaSeleccionada?.nombre ?? "—"}
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <SelectorFormulaVersion
              formulas={formulas}
              formulaId={formulaId}
              cambiarFormula={setFormulaId}
              versiones={versiones}
              versionId={versionId}
              cambiarVersion={setVersionId}
            />
          )}

          {versionSeleccionada && (
            <>
              <section style={panel}>
                <h2 style={tituloPanel}>
                  {microFichaSeleccionado
                    ? "Calcular producción del micro"
                    : "Calcular producción"}
                </h2>

                {microFichaSeleccionado ? (
                  <>
                    <div style={formularioGrid}>
                      <CampoNumero
                        etiqueta="Número de micros a producir"
                        valor={microsObjetivo}
                        cambiar={cambiarMicrosObjetivo}
                        paso="1"
                      />
                    </div>

                    <div style={resumenCostos}>
                      <TarjetaCosto
                        etiqueta="Micros solicitados"
                        valor={numeroEntero(factorMicro)}
                      />

                      <TarjetaCosto
                        etiqueta="Cantidad de un micro"
                        valor={`${numeroFijo(
                          cantidadBaseMicroSeleccionado,
                        )} kg`}
                      />

                      <TarjetaCosto
                        etiqueta="Cantidad total"
                        valor={`${numeroFijo(
                          cantidadBaseMicroSeleccionado *
                            factorMicro,
                        )} kg`}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div style={formularioGrid}>
                      <CampoNumero
                        etiqueta="Número de fundas requerido"
                        valor={panesObjetivo}
                        cambiar={setPanesObjetivo}
                      />

                      <div>
                        <label style={label}>
                          Preformulación a visualizar
                        </label>

                        <select
                          value={preparacionResultado}
                          onChange={(evento) =>
                            setPreparacionResultado(
                              evento.target.value,
                            )
                          }
                          style={campo}
                        >
                          <option value="FORMULA">
                            PRODUCTO · {formulaSeleccionada?.nombre}
                          </option>

                          {microsAgrupados.map((grupo) => (
                            <option
                              key={grupo[0].micro_id}
                              value={`MICRO:${grupo[0].micro_id}`}
                            >
                              MICRO · {grupo[0].micro_nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={resumenCostos}>
                      <TarjetaCosto
                        etiqueta="Fundas solicitadas"
                        valor={numero(panesCalculados, 0)}
                      />

                      <TarjetaCosto
                        etiqueta="Unidades por funda"
                        valor={String(Math.round(unidadesPorSku))}
                      />

                      <TarjetaCosto
                        etiqueta="Unidades individuales"
                        valor={numero(unidadesPanCalculadas, 0)}
                      />

                      <TarjetaCosto
                        etiqueta="Paradas equivalentes"
                        valor={numero(paradasCalculadas, 0)}
                      />
                    </div>
                  </>
                )}

                <div style={acciones}>
                  <button
                    type="button"
                    onClick={imprimirFormulaProduccion}
                    style={botonPrincipal}
                  >
                    {preparacionResultado === "FORMULA"
                      ? "Imprimir fórmula de pan"
                      : "Imprimir receta del micro"}
                  </button>
                </div>
              </section>

              {preparacionResultado === "FORMULA" && (
                <>
                  <section style={resumenCostos}>
                    <TarjetaCosto
                      etiqueta="Ingredientes por batch"
                      valor={moneda(
                        costo?.costo_materia_prima_batch,
                      )}
                    />

                    <TarjetaCosto
                      etiqueta="Ingredientes por kg"
                      valor={moneda(
                        costo?.costo_materia_prima_kg,
                      )}
                    />

                    <TarjetaCosto
                      etiqueta="Ingredientes por unidad"
                      valor={moneda(
                        costo?.costo_materia_prima_unidad,
                      )}
                    />

                    <TarjetaCosto
                      etiqueta="Ingredientes sin costo"
                      valor={String(
                        costo?.componentes_sin_costo ?? 0,
                      )}
                    />
                  </section>

                  {costosProducto.map((producto) => (
                    <section
                      key={producto.producto_id}
                      style={panel}
                    >
                      <h2 style={tituloPanel}>
                        Costo completo — {producto.producto_nombre}
                      </h2>

                      <p style={descripcion}>
                        Incluye ingredientes y empaques del SKU{" "}
                        {producto.producto_codigo}.
                      </p>

                      <div style={resumenCostos}>
                        <TarjetaCosto
                          etiqueta="Ingredientes por unidad"
                          valor={moneda(
                            producto.costo_materia_prima_unidad,
                          )}
                        />

                        <TarjetaCosto
                          etiqueta="Empaque por unidad"
                          valor={moneda(
                            producto.costo_empaque_unidad,
                          )}
                        />

                        <TarjetaCosto
                          etiqueta="Materiales por unidad"
                          valor={moneda(
                            producto.costo_materiales_unidad,
                          )}
                        />

                        <TarjetaCosto
                          etiqueta={`Materiales para ${numero(
                            panesCalculados,
                            0,
                          )} panes`}
                          valor={moneda(
                            Number(
                              producto.costo_materiales_unidad,
                            ) * panesCalculados,
                          )}
                        />

                        <TarjetaCosto
                          etiqueta="Ítems sin costo"
                          valor={String(
                            producto.items_sin_costo,
                          )}
                        />
                      </div>
                    </section>
                  ))}

                  <section style={panel}>
                    <h2 style={tituloPanel}>
                      Precio de empaques
                    </h2>

                    {empaquesProducto.length === 0 ? (
                      <p style={alertaCosto}>
                        No hay un empaque asignado o visible para
                        esta fórmula.
                      </p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={tabla}>
                          <thead>
                            <tr>
                              <th style={encabezado}>Producto</th>
                              <th style={encabezado}>Empaque</th>
                              <th style={encabezado}>Cantidad/unid.</th>
                              <th style={encabezado}>Precio empaque</th>
                              <th style={encabezado}>Costo/unid.</th>
                            </tr>
                          </thead>

                          <tbody>
                            {empaquesProducto.map((empaque) => (
                              <tr
                                key={`${empaque.producto_id}-${empaque.materia_prima_id}`}
                              >
                                <td style={celda}>
                                  {empaque.producto_nombre}
                                </td>
                                <td style={celda}>
                                  {empaque.materia_nombre}
                                </td>
                                <td style={celdaNumero}>
                                  {numero(
                                    empaque.cantidad_por_unidad,
                                    3,
                                  )}
                                </td>
                                <td style={celdaNumero}>
                                  {empaque.precio_empaque == null
                                    ? "SIN COSTO"
                                    : moneda(
                                        empaque.precio_empaque,
                                      )}
                                </td>
                                <td style={celdaNumero}>
                                  {moneda(
                                    empaque.costo_empaque_unidad,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section style={panel}>
                    <h2 style={tituloPanel}>
                      Preformulación para {numero(
                        panesCalculados,
                        0,
                      )} panes
                    </h2>

                    <TablaResultado
                      filas={preformulacion.map((fila) => ({
                        nombre: fila.materia_nombre,
                        porcentaje: fila.porcentaje_panadero,
                        cantidad:
                          Number(fila.cantidad_batch_kg ?? 0) *
                          factorEscala,
                        destino:
                          fila.destino_tipo === "DIRECTO"
                            ? "DIRECTO"
                            : fila.micro_nombre ?? "MICRO",
                      }))}
                    />
                  </section>

                  <section style={panel}>
                    <h2 style={tituloPanel}>
                      Fórmula final de producción
                    </h2>

                    <TablaResultado
                      filas={formulaFinal.map((fila) => ({
                        nombre: fila.componente_nombre,
                        porcentaje: fila.porcentaje_panadero,
                        cantidad:
                          Number(fila.cantidad_batch_kg ?? 0) *
                          factorEscala,
                        destino: fila.tipo_componente,
                      }))}
                    />
                  </section>

                  <section style={panel}>
                    <h2 style={tituloPanel}>
                      Micros requeridos
                    </h2>

                    <div style={{ overflowX: "auto" }}>
                      <table style={tabla}>
                        <thead>
                          <tr>
                            <th style={encabezado}>Micro</th>
                            <th style={encabezado}>N.º de micros</th>
                            <th style={encabezado}>Cantidad total</th>
                          </tr>
                        </thead>

                        <tbody>
                          {resumenMicros.map((micro) => (
                            <tr key={micro.id}>
                              <td style={celda}>{micro.nombre}</td>
                              <td style={celdaNumero}>
                                {numeroEntero(micro.numeroMicros)}
                              </td>
                              <td style={celdaNumero}>
                                {numero(micro.cantidadKg, 3)} kg
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}

              {microSeleccionado && (
                <section style={panel}>
                  <h2 style={tituloPanel}>
                    {microSeleccionado[0].micro_nombre}
                  </h2>

                  <div style={resumenCostos}>
                    <TarjetaCosto
                      etiqueta="N.º de micros"
                      valor={numeroEntero(factorCantidadMicro)}
                    />

                    <TarjetaCosto
                      etiqueta="Cantidad total de micro"
                      valor={`${numeroFijo(
                        cantidadBaseMicroSeleccionado *
                          factorCantidadMicro,
                      )} kg`}
                    />
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={tabla}>
                      <thead>
                        <tr>
                          <th style={encabezado}>Ingrediente</th>
                          <th style={encabezado}>% del micro</th>
                          <th style={encabezado}>Cantidad calculada</th>
                        </tr>
                      </thead>

                      <tbody>
                        {microSeleccionado.map((fila) => (
                          <tr
                            key={`${fila.micro_id}-${fila.materia_prima_id}`}
                          >
                            <td style={celda}>
                              {fila.materia_nombre}
                            </td>
                            <td style={celdaNumero}>
                              {numero(
                                fila.porcentaje_composicion_micro,
                                6,
                              )}%
                            </td>
                            <td style={celdaNumero}>
                              {numeroFijo(
                                cantidadIngredienteMicro(fila),
                              )} kg
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

type CampoProps = {
  etiqueta: string
  valor: string
  cambiar: (valor: string) => void
}

function Campo({
  etiqueta,
  valor,
  cambiar,
}: CampoProps) {
  return (
    <div>
      <label style={label}>{etiqueta}</label>

      <input
        value={valor}
        onChange={(evento) =>
          cambiar(evento.target.value)
        }
        style={campo}
      />
    </div>
  )
}

type CampoNumeroProps = CampoProps & {
  paso?: string
}

function CampoNumero({
  etiqueta,
  valor,
  cambiar,
  paso = "1",
}: CampoNumeroProps) {
  return (
    <div>
      <label style={label}>{etiqueta}</label>

      <input
        type="number"
        min="0"
        step={paso}
        value={valor}
        onChange={(evento) =>
          cambiar(evento.target.value)
        }
        style={campo}
      />
    </div>
  )
}

function SelectorFormula({
  formulas,
  formulaId,
  cambiarFormula,
}: {
  formulas: FormulaFmDb[]
  formulaId: string
  cambiarFormula: (id: string) => void
}) {
  return (
    <section style={panel}>
      <label style={label}>
        Fórmula
      </label>

      <select
        value={formulaId}
        onChange={(evento) =>
          cambiarFormula(evento.target.value)
        }
        style={campo}
      >
        <option value="">
          Seleccione...
        </option>

        {formulas.map((formula) => (
          <option
            key={formula.id}
            value={formula.id}
          >
            {formula.nombre}
          </option>
        ))}
      </select>
    </section>
  )
}

function SelectorFormulaVersion({
  formulas,
  formulaId,
  cambiarFormula,
  versiones,
  versionId,
  cambiarVersion,
}: {
  formulas: FormulaFmDb[]
  formulaId: string
  cambiarFormula: (id: string) => void
  versiones: FormulaVersionFmDb[]
  versionId: string
  cambiarVersion: (id: string) => void
}) {
  return (
    <section style={panel}>
      <div style={formularioGrid}>
        <div>
          <label style={label}>
            Fórmula
          </label>

          <select
            value={formulaId}
            onChange={(evento) =>
              cambiarFormula(
                evento.target.value,
              )
            }
            style={campo}
          >
            <option value="">
              Seleccione...
            </option>

            {formulas.map((formula) => (
              <option
                key={formula.id}
                value={formula.id}
              >
                {formula.nombre}
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
              cambiarVersion(
                evento.target.value,
              )
            }
            style={campo}
          >
            <option value="">
              Seleccione...
            </option>

            {versiones.map((version) => (
              <option
                key={version.id}
                value={version.id}
              >
                V{version.numero_version} ·{" "}
                {version.estado}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  )
}

function TarjetaCosto({
  etiqueta,
  valor,
}: {
  etiqueta: string
  valor: string
}) {
  return (
    <article style={tarjetaCosto}>
      <span style={etiquetaCosto}>
        {etiqueta}
      </span>

      <strong style={valorCosto}>
        {valor}
      </strong>
    </article>
  )
}

function TablaResultado({
  filas,
}: {
  filas: {
    nombre: string
    porcentaje: number
    cantidad: number | null
    destino: string
  }[]
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={encabezado}>
              Componente
            </th>
            <th style={encabezado}>
              % panadero
            </th>
            <th style={encabezado}>
              Cantidad calculada
            </th>
            <th style={encabezado}>
              Destino
            </th>
          </tr>
        </thead>

        <tbody>
          {filas.map((fila, indice) => (
            <tr key={`${fila.nombre}-${indice}`}>
              <td style={celda}>
                {fila.nombre}
              </td>

              <td style={celdaNumero}>
                {numero(
                  fila.porcentaje,
                  6,
                )}
                %
              </td>

              <td style={celdaNumero}>
                {fila.cantidad == null
                  ? "—"
                  : `${numero(
                      fila.cantidad,
                      3,
                    )} kg`}
              </td>

              <td style={celda}>
                {fila.destino}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  lineHeight: 1.5,
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
  margin: "0 0 18px",
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

const campoLectura = {
  ...campo,
  display: "flex",
  alignItems: "center",
  background: "#f9fafb",
  fontWeight: "bold",
}

const acciones = {
  display: "flex",
  justifyContent: "flex-end",
  flexWrap: "wrap" as const,
  gap: "12px",
  marginTop: "20px",
}

const accionesPanel = {
  display: "flex",
  justifyContent: "flex-end",
  flexWrap: "wrap" as const,
  gap: "12px",
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

const rejilla = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(270px, 1fr))",
  gap: "16px",
}

const tarjeta = {
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between",
  gap: "18px",
  minHeight: "190px",
  padding: "20px",
  border: "1px solid #e2e5e9",
  borderRadius: "12px",
  background: "white",
}

const codigoTarjeta = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: "bold",
}

const nombreTarjeta = {
  margin: "7px 0",
  fontSize: "20px",
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

const botonSeleccionarVigente = {
  padding: "8px 12px",
  border: "1px solid #15803d",
  borderRadius: "7px",
  background: "#f0fdf4",
  color: "#166534",
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

const botonEliminarPrincipal = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#b91c1c",
  color: "white",
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

const resumenCostos = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
  marginBottom: "22px",
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
  textTransform: "uppercase" as const,
}

const valorCosto = {
  color: "#8f1d24",
  fontSize: "26px",
}

const accionesTabla = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
}

const alertaCosto = {
  margin: 0,
  padding: "12px 14px",
  border: "1px solid #f59e0b",
  borderRadius: "8px",
  background: "#fffbeb",
  color: "#92400e",
}
