import { useEffect, useMemo, useState } from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  obtenerComponentesCosteadosFmDb,
  obtenerCostosProductoCompletosFmDb,
  obtenerFormulasFmDb,
  obtenerMicrosFmDb,
  obtenerVersionesFormulaFmDb,
  obtenerVersionesMicroFmDb,
  type ComponenteCosteadoFmDb,
  type FormulaFmDb,
  type FormulaVersionFmDb,
  type MicroFmDb,
  type MicroVersionFmDb,
} from "../repositories/formulaRepository"
import Preformulacion from "./Preformulacion"

type Pestana = "SKU" | "MICROS"

function numeroFijo(
  valor: number | null | undefined,
  decimales = 3,
) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

function numeroEntero(valor: number | null | undefined) {
  return Math.round(Number(valor ?? 0)).toLocaleString("es-EC", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function moneda(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}

function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export default function Formulas() {
  const [pestana, setPestana] = useState<Pestana>("SKU")
  const [administrando, setAdministrando] = useState(false)
  const [revisionDatos, setRevisionDatos] = useState(0)

  const [formulas, setFormulas] = useState<FormulaFmDb[]>([])
  const [micros, setMicros] = useState<MicroFmDb[]>([])

  const [formulaId, setFormulaId] = useState("")
  const [versionesSku, setVersionesSku] = useState<
    FormulaVersionFmDb[]
  >([])
  const [versionSkuId, setVersionSkuId] = useState("")
  const [componentesSku, setComponentesSku] = useState<
    ComponenteCosteadoFmDb[]
  >([])
  const [costoMateriaPrimaConjunto, setCostoMateriaPrimaConjunto] =
    useState<number | null>(null)
  const [panesObjetivo, setPanesObjetivo] = useState("")

  const [microId, setMicroId] = useState("")
  const [versionesMicro, setVersionesMicro] = useState<
    MicroVersionFmDb[]
  >([])
  const [versionMicroId, setVersionMicroId] = useState("")
  const [componentesVersionMicro, setComponentesVersionMicro] =
    useState<ComponenteCosteadoFmDb[]>([])
  const [microsObjetivo, setMicrosObjetivo] = useState("1")

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  const formulaSeleccionada = useMemo(
    () =>
      formulas.find((formula) => formula.id === formulaId) ??
      null,
    [formulas, formulaId],
  )

  const versionSkuSeleccionada = useMemo(
    () =>
      versionesSku.find(
        (version) => version.id === versionSkuId,
      ) ?? null,
    [versionesSku, versionSkuId],
  )

  const microSeleccionado = useMemo(
    () => micros.find((micro) => micro.id === microId) ?? null,
    [micros, microId],
  )

  const versionMicroSeleccionada = useMemo(
    () =>
      versionesMicro.find(
        (version) =>
          version.formula_version_id === versionMicroId,
      ) ?? null,
    [versionesMicro, versionMicroId],
  )

  const skuBase = Number(
    versionSkuSeleccionada?.rendimiento_unidades ??
      versionSkuSeleccionada?.panes_por_batch ??
      0,
  )
  const unidadesPanBase = Number(
    versionSkuSeleccionada?.panes_por_batch ?? skuBase,
  )
  const unidadesPorSku =
    skuBase > 0 ? unidadesPanBase / skuBase : 1
  const skuSolicitados = Number(panesObjetivo)
  const factorSku =
    Number.isFinite(skuSolicitados) &&
    skuSolicitados > 0 &&
    skuBase > 0
      ? skuSolicitados / skuBase
      : 1
  const unidadesPanSolicitadas = unidadesPanBase * factorSku
  const paradasSolicitadas =
    Number(versionSkuSeleccionada?.paradas_por_batch ?? 1) *
    factorSku

  const microsSolicitados = Number(microsObjetivo)
  const factorMicro =
    Number.isFinite(microsSolicitados) && microsSolicitados > 0
      ? Math.round(microsSolicitados)
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

  const filasSku = useMemo(
    () =>
      componentesSku.map((fila) => ({
        ...fila,
        cantidad:
          Number(fila.cantidad_batch_kg ?? 0) * factorSku,
        costo:
          Number(fila.costo_componente_batch ?? 0) * factorSku,
      })),
    [componentesSku, factorSku],
  )

  const filasImpresionSku = useMemo(() => {
    const filas: { nombre: string; cantidad: number }[] = []
    const indicePorMicro = new Map<string, number>()

    for (const fila of filasSku) {
      if (!fila.micro_id) {
        filas.push({
          nombre: fila.materia_nombre,
          cantidad: fila.cantidad,
        })
        continue
      }

      const indiceExistente = indicePorMicro.get(fila.micro_id)

      if (indiceExistente == null) {
        indicePorMicro.set(fila.micro_id, filas.length)
        filas.push({
          nombre: fila.micro_nombre ?? "MICRO",
          cantidad: fila.cantidad,
        })
      } else {
        filas[indiceExistente].cantidad += fila.cantidad
      }
    }

    return filas
  }, [filasSku])

  const componentesMicro = useMemo(
    () =>
      componentesVersionMicro.filter(
        (fila) => fila.micro_id === microId,
      ),
    [componentesVersionMicro, microId],
  )

  const porcentajePanaderoMicro = componentesMicro.reduce(
    (total, fila) => total + Number(fila.porcentaje_panadero ?? 0),
    0,
  )

  const filasMicro = useMemo(
    () =>
      componentesMicro.map((fila) => ({
        ...fila,
        porcentajeRealMicro:
          porcentajePanaderoMicro > 0
            ? (Number(fila.porcentaje_panadero ?? 0) /
                porcentajePanaderoMicro) *
              100
            : 0,
        cantidad:
          Number(fila.cantidad_batch_kg ?? 0) * factorMicro,
        costo:
          Number(fila.costo_componente_batch ?? 0) * factorMicro,
      })),
    [componentesMicro, factorMicro, porcentajePanaderoMicro],
  )

  const pesoUnMicro = componentesMicro.reduce(
    (total, fila) =>
      total + Number(fila.cantidad_batch_kg ?? 0),
    0,
  )

  const costoFormulaSku = filasSku.reduce(
    (total, fila) => total + fila.costo,
    0,
  )
  const costoTotalSku =
    costoMateriaPrimaConjunto == null
      ? costoFormulaSku
      : costoMateriaPrimaConjunto * factorSku
  const costoTotalMicro = filasMicro.reduce(
    (total, fila) => total + fila.costo,
    0,
  )

  useEffect(() => {
    async function cargarCatalogos() {
      setCargando(true)
      setError("")

      try {
        const [formulasDb, microsDb] = await Promise.all([
          obtenerFormulasFmDb(),
          obtenerMicrosFmDb(),
        ])

        setFormulas(formulasDb)
        setMicros(microsDb)
        setFormulaId((actual) => actual || formulasDb[0]?.id || "")
        setMicroId((actual) => actual || microsDb[0]?.id || "")
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo abrir el módulo de fórmulas.",
        )
      } finally {
        setCargando(false)
      }
    }

    cargarCatalogos()
  }, [revisionDatos])

  useEffect(() => {
    if (!formulaId) {
      setVersionesSku([])
      setVersionSkuId("")
      return
    }

    obtenerVersionesFormulaFmDb(formulaId)
      .then((datos) => {
        setVersionesSku(datos)
        const preferida =
          datos.find((version) => version.estado === "VIGENTE") ??
          datos[0]
        setVersionSkuId(preferida?.id ?? "")
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar las versiones del SKU.",
        ),
      )
  }, [formulaId, revisionDatos])

  useEffect(() => {
    if (!versionSkuId) {
      setComponentesSku([])
      setCostoMateriaPrimaConjunto(null)
      return
    }

    let cancelado = false
    setCostoMateriaPrimaConjunto(null)

    Promise.all([
      obtenerComponentesCosteadosFmDb(versionSkuId),
      obtenerCostosProductoCompletosFmDb(versionSkuId),
    ])
      .then(([componentes, costosProducto]) => {
        if (cancelado) return
        setComponentesSku(componentes)
        setCostoMateriaPrimaConjunto(
          costosProducto[0]?.costo_materia_prima_batch == null
            ? null
            : Number(
                costosProducto[0].costo_materia_prima_batch,
              ),
        )
      })
      .catch((err) =>
        !cancelado &&
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo calcular la fórmula del SKU.",
        ),
      )

    return () => {
      cancelado = true
    }
  }, [versionSkuId])

  useEffect(() => {
    if (!versionSkuSeleccionada) return

    setPanesObjetivo(
      String(
        versionSkuSeleccionada.rendimiento_unidades ??
          versionSkuSeleccionada.panes_por_batch ??
          "",
      ),
    )
  }, [versionSkuSeleccionada])

  useEffect(() => {
    if (!microId) {
      setVersionesMicro([])
      setVersionMicroId("")
      return
    }

    obtenerVersionesMicroFmDb(microId)
      .then((datos) => {
        setVersionesMicro(datos)
        const preferida =
          datos.find((version) => version.estado === "VIGENTE") ??
          datos[0]
        setVersionMicroId(preferida?.formula_version_id ?? "")
        setMicrosObjetivo("1")
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar las versiones del micro.",
        ),
      )
  }, [microId, revisionDatos])

  useEffect(() => {
    if (!versionMicroId) {
      setComponentesVersionMicro([])
      return
    }

    obtenerComponentesCosteadosFmDb(versionMicroId)
      .then(setComponentesVersionMicro)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo calcular la fórmula del micro.",
        ),
      )
  }, [versionMicroId])

  useEffect(() => {
    function regresarDesdeAdministracion(evento: Event) {
      if (!administrando) return
      evento.preventDefault()
      volverAlCalculo()
    }

    window.addEventListener(
      "c1:regresar",
      regresarDesdeAdministracion,
    )
    return () =>
      window.removeEventListener(
        "c1:regresar",
        regresarDesdeAdministracion,
      )
  }, [administrando])

  function volverAlCalculo() {
    setAdministrando(false)
    setRevisionDatos((actual) => actual + 1)
  }

  function imprimir(
    titulo: string,
    detalle: string,
    filas: { nombre: string; cantidad: number }[],
  ) {
    if (filas.length === 0) {
      setError("No hay ingredientes para imprimir.")
      return
    }

    const ventana = window.open(
      "",
      "_blank",
      "width=900,height=700",
    )

    if (!ventana) {
      setError("Permite las ventanas emergentes para imprimir.")
      return
    }

    const filasHtml = filas
      .map(
        (fila) => `
          <tr>
            <td>${escaparHtml(fila.nombre)}</td>
            <td class="numero">${numeroFijo(fila.cantidad)} kg</td>
          </tr>`,
      )
      .join("")

    ventana.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>${escaparHtml(titulo)}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { margin: 0; color: #1f2937; font-family: Arial, sans-serif; }
            header { padding-bottom: 14px; border-bottom: 3px solid #8f1d24; }
            .marca { color: #8f1d24; font-size: 12px; font-weight: 700; letter-spacing: 1px; }
            h1 { margin: 7px 0 4px; font-size: 24px; }
            p { margin: 0; color: #4b5563; }
            table { width: 100%; margin-top: 20px; border-collapse: collapse; }
            th, td { padding: 10px; border-bottom: 1px solid #d1d5db; text-align: left; }
            th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; }
            .numero { text-align: right; font-weight: 700; }
          </style>
        </head>
        <body>
          <header>
            <div class="marca">CIBUSPAN ONE · HOJA DE PRODUCCIÓN</div>
            <h1>${escaparHtml(titulo)}</h1>
            <p>${escaparHtml(detalle)}</p>
          </header>
          <table>
            <thead><tr><th>Ingrediente</th><th class="numero">Cantidad</th></tr></thead>
            <tbody>${filasHtml}</tbody>
          </table>
        </body>
      </html>`)

    ventana.document.close()
    ventana.focus()
    window.setTimeout(() => ventana.print(), 250)
  }

  if (administrando) {
    return (
      <div>
        <div style={barraAdministracion}>
          <button
            type="button"
            onClick={volverAlCalculo}
            style={botonSecundario}
          >
            ← Volver a Fórmulas
          </button>
        </div>
        <Preformulacion />
      </div>
    )
  }

  return (
    <main style={pagina}>
      <ModalMensaje
        abierto={error !== ""}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />

      <header style={cabecera}>
        <div>
          <span style={etiqueta}>COSTEO Y PRODUCCIÓN</span>
          <h1 style={titulo}>Fórmulas</h1>
          <p style={subtitulo}>
            Calcula ingredientes, cantidades y costos para SKU y micros.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAdministrando(true)}
          style={botonSecundario}
        >
          Administrar fórmulas y versiones
        </button>
      </header>

      <div style={pestanas}>
        <button
          type="button"
          onClick={() => setPestana("SKU")}
          style={{
            ...botonPestana,
            ...(pestana === "SKU" ? botonPestanaActivo : {}),
          }}
        >
          SKU
        </button>
        <button
          type="button"
          onClick={() => setPestana("MICROS")}
          style={{
            ...botonPestana,
            ...(pestana === "MICROS" ? botonPestanaActivo : {}),
          }}
        >
          Micros
        </button>
      </div>

      {cargando ? (
        <section style={panel}>Cargando fórmulas...</section>
      ) : pestana === "SKU" ? (
        <>
          <section style={panel}>
            <h2 style={tituloPanel}>Seleccionar fórmula SKU</h2>
            <div style={filtrosGrid}>
              <CampoSeleccion
                etiqueta="Fórmula"
                valor={formulaId}
                cambiar={setFormulaId}
                opciones={formulas.map((formula) => ({
                  valor: formula.id,
                  texto: `${formula.codigo} · ${formula.nombre}`,
                }))}
              />

              <CampoSeleccion
                etiqueta="Versión"
                valor={versionSkuId}
                cambiar={setVersionSkuId}
                opciones={versionesSku.map((version) => ({
                  valor: version.id,
                  texto: `V${version.numero_version} · ${version.estado}`,
                }))}
              />

              <CampoNumero
                etiqueta="Número de fundas a producir"
                valor={panesObjetivo}
                cambiar={setPanesObjetivo}
              />
            </div>
          </section>

          <section style={resumenGrid}>
            <TarjetaResumen
              etiqueta="Fundas a producir"
              valor={Number.isFinite(skuSolicitados) ? String(skuSolicitados) : "0"}
            />
            <TarjetaResumen
              etiqueta="Unidades por funda"
              valor={String(Math.round(unidadesPorSku))}
            />
            <TarjetaResumen
              etiqueta="Unidades individuales"
              valor={numeroFijo(unidadesPanSolicitadas, 0)}
            />
            <TarjetaResumen
              etiqueta="Paradas equivalentes"
              valor={numeroFijo(paradasSolicitadas, 0)}
            />
            <TarjetaResumen
              etiqueta="Cantidad total"
              valor={`${numeroFijo(
                filasSku.reduce(
                  (total, fila) => total + fila.cantidad,
                  0,
                ),
              )} kg`}
            />
            <TarjetaResumen
              etiqueta="Costo de materias primas del SKU"
              valor={moneda(costoTotalSku)}
            />
          </section>

          <section style={panel}>
            <div style={encabezadoTablaBloque}>
              <div>
                <h2 style={tituloPanel}>
                  {formulaSeleccionada?.nombre ?? "Fórmula SKU"}
                </h2>
                <p style={descripcion}>
                  Los ingredientes de los micros están desglosados dentro de la fórmula.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  imprimir(
                    formulaSeleccionada?.nombre ?? "Fórmula SKU",
                    `${skuSolicitados || 0} fundas · ${numeroFijo(
                      unidadesPanSolicitadas,
                      0,
                    )} unidades · ${numeroFijo(
                      paradasSolicitadas,
                      0,
                    )} paradas`,
                    filasImpresionSku,
                  )
                }
                style={botonPrincipal}
              >
                Imprimir fórmula
              </button>
            </div>

            <TablaFormula filas={filasSku} tipo="SKU" />
          </section>
        </>
      ) : (
        <>
          <section style={panel}>
            <h2 style={tituloPanel}>Seleccionar fórmula de micro</h2>
            <div style={filtrosGrid}>
              <CampoSeleccion
                etiqueta="Micro"
                valor={microId}
                cambiar={setMicroId}
                opciones={micros.map((micro) => ({
                  valor: micro.id,
                  texto: `${micro.codigo} · ${micro.nombre}`,
                }))}
              />

              <CampoSeleccion
                etiqueta="Versión"
                valor={versionMicroId}
                cambiar={setVersionMicroId}
                opciones={versionesMicro.map((version) => ({
                  valor: version.formula_version_id,
                  texto: `V${version.numero_version} · ${version.estado} · ${version.formula_nombre}`,
                }))}
              />

              <CampoNumero
                etiqueta="Cantidad de micros a producir"
                valor={microsObjetivo}
                cambiar={cambiarMicrosObjetivo}
              />
            </div>
          </section>

          <section style={resumenGrid}>
            <TarjetaResumen
              etiqueta="Micros a producir"
              valor={numeroEntero(factorMicro)}
            />
            <TarjetaResumen
              etiqueta="Peso de un micro"
              valor={`${numeroFijo(pesoUnMicro)} kg`}
            />
            <TarjetaResumen
              etiqueta="Cantidad total"
              valor={`${numeroFijo(pesoUnMicro * factorMicro)} kg`}
            />
            <TarjetaResumen
              etiqueta="Costo total del micro"
              valor={moneda(costoTotalMicro)}
            />
          </section>

          <section style={panel}>
            <div style={encabezadoTablaBloque}>
              <div>
                <h2 style={tituloPanel}>
                  {microSeleccionado?.nombre ?? "Fórmula de micro"}
                </h2>
                <p style={descripcion}>
                  {versionMicroSeleccionada
                    ? `Versión vinculada a ${versionMicroSeleccionada.formula_nombre}.`
                    : "Selecciona una versión del micro."}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  imprimir(
                    microSeleccionado?.nombre ?? "Fórmula de micro",
                    `${numeroEntero(factorMicro)} micros · Peso unitario: ${numeroFijo(
                      pesoUnMicro,
                    )} kg · Peso total: ${numeroFijo(
                      pesoUnMicro * factorMicro,
                    )} kg`,
                    filasMicro.map((fila) => ({
                      nombre: fila.materia_nombre,
                      cantidad: fila.cantidad,
                    })),
                  )
                }
                style={botonPrincipal}
              >
                Imprimir micro
              </button>
            </div>

            <TablaFormula filas={filasMicro} tipo="MICRO" />
          </section>
        </>
      )}
    </main>
  )
}

function CampoSeleccion({
  etiqueta: textoEtiqueta,
  valor,
  cambiar,
  opciones,
}: {
  etiqueta: string
  valor: string
  cambiar: (valor: string) => void
  opciones: { valor: string; texto: string }[]
}) {
  return (
    <div>
      <label style={label}>{textoEtiqueta}</label>
      <select
        value={valor}
        onChange={(evento) => cambiar(evento.target.value)}
        style={campo}
      >
        {opciones.length === 0 && (
          <option value="">Sin opciones disponibles</option>
        )}
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
    </div>
  )
}

function CampoNumero({
  etiqueta: textoEtiqueta,
  valor,
  cambiar,
}: {
  etiqueta: string
  valor: string
  cambiar: (valor: string) => void
}) {
  return (
    <div>
      <label style={label}>{textoEtiqueta}</label>
      <input
        type="number"
        min="0"
        step="1"
        value={valor}
        onChange={(evento) => cambiar(evento.target.value)}
        style={campo}
      />
    </div>
  )
}

function TarjetaResumen({
  etiqueta: textoEtiqueta,
  valor,
}: {
  etiqueta: string
  valor: string
}) {
  return (
    <article style={tarjetaResumen}>
      <span style={etiquetaResumen}>{textoEtiqueta}</span>
      <strong style={valorResumen}>{valor}</strong>
    </article>
  )
}

function TablaFormula({
  filas,
  tipo,
}: {
  filas: Array<
    ComponenteCosteadoFmDb & {
      cantidad: number
      costo: number
      porcentajeRealMicro?: number
    }
  >
  tipo: "SKU" | "MICRO"
}) {
  if (filas.length === 0) {
    return <p style={vacio}>No existen ingredientes para esta selección.</p>
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={encabezado}>Ingrediente</th>
            <th style={encabezadoNumero}>% panadero</th>
            <th style={encabezadoNumero}>% real</th>
            <th style={encabezadoNumero}>Cantidad</th>
            <th style={encabezadoNumero}>Costo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.componente_id}>
              <td style={celda}>
                <strong>{fila.materia_nombre}</strong>
                {tipo === "SKU" && fila.micro_nombre && (
                  <small style={detalleIngrediente}>
                    Micro: {fila.micro_nombre}
                  </small>
                )}
              </td>
              <td style={celdaNumero}>
                {numeroFijo(fila.porcentaje_panadero)}%
              </td>
              <td style={celdaNumero}>
                {numeroFijo(
                  tipo === "MICRO"
                    ? fila.porcentajeRealMicro
                    : fila.porcentaje_real,
                )}%
              </td>
              <td style={celdaNumero}>
                {numeroFijo(fila.cantidad)} kg
              </td>
              <td style={celdaNumero}>
                {fila.costo_incompleto ? (
                  <span style={sinCosto}>Sin costo</span>
                ) : (
                  <>
                    <strong>{moneda(fila.costo)}</strong>
                    {fila.costo_unitario != null && (
                      <small style={detalleCosto}>
                        {moneda(fila.costo_unitario)}/kg
                      </small>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const pagina = {
  maxWidth: "1500px",
  margin: "0 auto",
  padding: "20px 30px 36px",
  color: "#25272b",
}

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap" as const,
  gap: "18px",
  marginBottom: "22px",
}

const etiqueta = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "1px",
}

const titulo = { margin: "5px 0", fontSize: "32px" }
const subtitulo = { margin: 0, color: "#6b7280" }

const pestanas = {
  display: "flex",
  gap: "8px",
  marginBottom: "22px",
  padding: "6px",
  borderRadius: "12px",
  background: "#e7e9ed",
}

const botonPestana = {
  flex: 1,
  minHeight: "44px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "#5b6470",
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
  boxShadow: "0 6px 20px rgba(15, 23, 42, 0.05)",
}

const tituloPanel = { margin: "0 0 8px", fontSize: "21px" }
const descripcion = { margin: 0, color: "#6b7280", lineHeight: 1.5 }

const filtrosGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "16px",
  marginTop: "18px",
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
  minHeight: "44px",
  padding: "9px 11px",
  border: "1px solid #cfd4da",
  borderRadius: "8px",
  background: "white",
  color: "#25272b",
  boxSizing: "border-box" as const,
}

const resumenGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "14px",
  marginBottom: "22px",
}

const tarjetaResumen = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  padding: "18px",
  border: "1px solid #e2e5e9",
  borderRadius: "12px",
  background: "white",
}

const etiquetaResumen = {
  color: "#6b7280",
  fontSize: "11px",
  fontWeight: "bold",
  textTransform: "uppercase" as const,
}

const valorResumen = { color: "#8f1d24", fontSize: "23px" }

const encabezadoTablaBloque = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap" as const,
  gap: "16px",
  marginBottom: "18px",
}

const tabla = { width: "100%", borderCollapse: "collapse" as const }
const encabezado = {
  padding: "11px",
  borderBottom: "2px solid #d8dde3",
  background: "#f7f8fa",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
  fontSize: "12px",
}
const encabezadoNumero = { ...encabezado, textAlign: "right" as const }
const celda = {
  padding: "11px",
  borderBottom: "1px solid #edf0f2",
  whiteSpace: "nowrap" as const,
}
const celdaNumero = { ...celda, textAlign: "right" as const }

const detalleIngrediente = {
  display: "block",
  marginTop: "4px",
  color: "#8f1d24",
  fontSize: "11px",
}

const detalleCosto = {
  display: "block",
  marginTop: "4px",
  color: "#6b7280",
  fontSize: "10px",
}

const sinCosto = { color: "#b45309", fontWeight: "bold" }
const vacio = { margin: 0, padding: "20px", color: "#6b7280" }

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

const barraAdministracion = {
  display: "flex",
  justifyContent: "flex-end",
  padding: "20px 30px 0",
}
