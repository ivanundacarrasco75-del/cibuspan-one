import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"

import ModalMensaje from "../components/ModalMensaje"
import {
  actualizarAreaNominaDb,
  importarNominaPdfDb,
  obtenerEmpleadosNominaDb,
  obtenerImportacionesNominaDb,
  obtenerNominaMensualAreaDb,
  type EmpleadoNominaDb,
  type ImportacionNominaDb,
  type NominaMensualAreaDb,
} from "../repositories/nominaRepository"
import {
  AREAS_NOMINA,
  ETIQUETAS_AREA_NOMINA,
  leerRolesPagoPdf,
  type AnalisisRolesPdf,
  type AreaNomina,
} from "../utils/rolesPagoPdf"

type Vista = "IMPORTAR" | "RESUMEN" | "EMPLEADOS"

function moneda(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numero(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC")
}

function mesPeriodo(periodo: string) {
  const [anio, mes] = periodo.slice(0, 7).split("-").map(Number)
  return new Intl.DateTimeFormat("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
}

export default function RolesPago() {
  const [vista, setVista] = useState<Vista>("IMPORTAR")
  const [empleados, setEmpleados] = useState<EmpleadoNominaDb[]>([])
  const [importaciones, setImportaciones] = useState<ImportacionNominaDb[]>([])
  const [resumenMensual, setResumenMensual] = useState<NominaMensualAreaDb[]>([])
  const [periodoResumen, setPeriodoResumen] = useState("")
  const [analisis, setAnalisis] = useState<AnalisisRolesPdf | null>(null)
  const [areasSeleccionadas, setAreasSeleccionadas] = useState<Record<string, AreaNomina>>({})
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")
    try {
      const [empleadosDb, importacionesDb, resumenDb] = await Promise.all([
        obtenerEmpleadosNominaDb(),
        obtenerImportacionesNominaDb(),
        obtenerNominaMensualAreaDb(),
      ])
      setEmpleados(empleadosDb)
      setImportaciones(importacionesDb)
      setResumenMensual(resumenDb)
      setPeriodoResumen((actual) => actual || importacionesDb[0]?.periodo || "")
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el módulo de roles.",
      )
    } finally {
      setCargando(false)
    }
  }

  function limpiarArchivo() {
    setAnalisis(null)
    setAreasSeleccionadas({})
    if (inputRef.current) inputRef.current.value = ""
  }

  async function seleccionarArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    if (!archivo) return
    setProcesando(true)
    setError("")
    setMensaje("")
    setAnalisis(null)

    try {
      const areasGuardadas = new Map(
        empleados.map((empleado) => [empleado.nombre_normalizado, empleado.area]),
      )
      const resultado = await leerRolesPagoPdf(archivo, areasGuardadas)
      setAnalisis(resultado)
      setAreasSeleccionadas(
        Object.fromEntries(
          resultado.empleados.map((empleado) => [empleado.nombreNormalizado, empleado.area]),
        ),
      )
    } catch (err) {
      limpiarArchivo()
      setError(
        err instanceof Error ? err.message : "No se pudo leer el reporte de roles.",
      )
    } finally {
      setProcesando(false)
    }
  }

  async function guardarImportacion() {
    if (!analisis) return
    const existente = importaciones.find((item) => item.periodo === analisis.periodo)
    if (
      existente
      && !window.confirm(
        `Ya existe un rol de ${mesPeriodo(analisis.periodo)}. Esta carga reemplazará ese mes. ¿Deseas continuar?`,
      )
    ) return

    setProcesando(true)
    setError("")
    try {
      const respuesta = await importarNominaPdfDb({
        periodo: analisis.periodo,
        archivoNombre: analisis.archivoNombre,
        archivoHash: analisis.archivoHash,
        movimientos: analisis.movimientos.map((movimiento) => ({
          ...movimiento,
          area: areasSeleccionadas[movimiento.empleado_normalizado] ?? movimiento.area,
        })),
      })
      setMensaje(
        `Rol de ${mesPeriodo(respuesta.periodo)} guardado: ${numero(respuesta.empleados)} empleados y ${moneda(respuesta.costo_empresa)} de costo laboral.`,
      )
      limpiarArchivo()
      await cargarDatos()
      setPeriodoResumen(respuesta.periodo)
      setVista("RESUMEN")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el rol.")
    } finally {
      setProcesando(false)
    }
  }

  async function cambiarAreaEmpleado(empleado: EmpleadoNominaDb, area: AreaNomina) {
    if (empleado.area === area) return
    const anterior = empleado.area
    setEmpleados((actuales) =>
      actuales.map((item) => item.id === empleado.id ? { ...item, area } : item),
    )
    try {
      await actualizarAreaNominaDb(empleado.id, area)
      await cargarDatos()
      setMensaje(`Área de ${empleado.nombre} actualizada en todo el historial.`)
    } catch (err) {
      setEmpleados((actuales) =>
        actuales.map((item) => item.id === empleado.id ? { ...item, area: anterior } : item),
      )
      setError(err instanceof Error ? err.message : "No se pudo cambiar el área.")
    }
  }

  const empleadosAnalisis = useMemo(() => {
    if (!analisis) return []
    return analisis.empleados.map((empleado) => ({
      ...empleado,
      area: areasSeleccionadas[empleado.nombreNormalizado] ?? empleado.area,
    }))
  }, [analisis, areasSeleccionadas])

  const areasAnalisis = useMemo(() => {
    const mapa = new Map<AreaNomina, { empleados: number; costo: number }>()
    empleadosAnalisis.forEach((empleado) => {
      const actual = mapa.get(empleado.area) ?? { empleados: 0, costo: 0 }
      actual.empleados += 1
      actual.costo += empleado.costoEmpresa
      mapa.set(empleado.area, actual)
    })
    return mapa
  }, [empleadosAnalisis])

  const periodosDisponibles = useMemo(
    () => Array.from(new Set(importaciones.map((item) => item.periodo))),
    [importaciones],
  )
  const importacionSeleccionada = importaciones.find((item) => item.periodo === periodoResumen)
  const areasPeriodo = resumenMensual.filter((item) => item.periodo === periodoResumen)
  const maximoArea = Math.max(1, ...areasPeriodo.map((item) => Number(item.costo_empresa)))

  return (
    <main className="nom-page">
      <style>{css}</style>
      <ModalMensaje
        abierto={Boolean(error)}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />
      <ModalMensaje
        abierto={Boolean(mensaje)}
        tipo="EXITO"
        mensaje={mensaje}
        cerrar={() => setMensaje("")}
        cierreAutomaticoMs={4500}
      />

      <header className="nom-header">
        <div>
          <span>CONTROL FINANCIERO · COSTO LABORAL</span>
          <h1>Roles de pago</h1>
          <p>Carga el reporte mensual, clasifica al personal por área y analiza el costo real de nómina.</p>
        </div>
        <button type="button" className="secondary" onClick={() => void cargarDatos()} disabled={cargando || procesando}>
          {cargando ? "Actualizando..." : "Actualizar"}
        </button>
      </header>

      <nav className="nom-tabs">
        {([
          ["IMPORTAR", "Cargar PDF"],
          ["RESUMEN", "Resumen mensual"],
          ["EMPLEADOS", "Empleados y áreas"],
        ] as [Vista, string][]).map(([id, etiqueta]) => (
          <button key={id} type="button" className={vista === id ? "active" : ""} onClick={() => setVista(id)}>
            {etiqueta}
          </button>
        ))}
      </nav>

      {vista === "IMPORTAR" && (
        <section className="nom-panel">
          <div className="nom-panel-head">
            <div>
              <span>IMPORTACIÓN MENSUAL</span>
              <h2>Seleccionar DETALLE RUBROS</h2>
              <p>El archivo se valida completamente antes de guardar o reemplazar un mes.</p>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={procesando}>
              {procesando ? "Analizando..." : "Seleccionar PDF"}
            </button>
            <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={seleccionarArchivo} />
          </div>

          {!analisis ? (
            <div className="nom-empty">Selecciona el reporte mensual con las columnas empleado, rubro, ingresos y egresos.</div>
          ) : (
            <>
              <section className="nom-kpis">
                <Kpi titulo="Periodo" valor={mesPeriodo(analisis.periodo)} detalle={analisis.archivoNombre} clase="wine" />
                <Kpi titulo="Empleados" valor={numero(analisis.empleados.length)} detalle={`${numero(analisis.movimientos.length)} rubros`} clase="orange" />
                <Kpi titulo="Costo empresa" valor={moneda(analisis.costoEmpresa)} detalle="Ingresos y provisiones" clase="green" />
                <Kpi titulo="Descuentos" valor={moneda(analisis.descuentos)} detalle="No aumentan el costo" clase="gray" />
                <Kpi titulo="Pago neto del rol" valor={moneda(analisis.pagoNetoRol)} detalle="Rubros visibles en rol" clase="blue" />
              </section>

              {analisis.advertencias.length > 0 && (
                <div className="nom-warning">
                  {analisis.advertencias.map((aviso) => <p key={aviso}>{aviso}</p>)}
                </div>
              )}

              <section className="nom-area-preview">
                <header><div><span>CLASIFICACIÓN</span><h3>Costo por área</h3></div><small>Puedes corregir el área antes de guardar</small></header>
                <div>
                  {AREAS_NOMINA.map((area) => {
                    const resumen = areasAnalisis.get(area)
                    if (!resumen) return null
                    return <article key={area}><span>{ETIQUETAS_AREA_NOMINA[area]}</span><strong>{moneda(resumen.costo)}</strong><small>{resumen.empleados} empleados</small></article>
                  })}
                </div>
              </section>

              <div className="nom-table-wrap preview">
                <table>
                  <thead><tr><th>Empleado</th><th>Área</th><th>Rubros</th><th>Costo empresa</th><th>Descuentos</th><th>Pago neto</th></tr></thead>
                  <tbody>
                    {empleadosAnalisis.map((empleado) => (
                      <tr key={empleado.nombreNormalizado}>
                        <td data-label="Empleado"><strong>{empleado.nombre}</strong></td>
                        <td data-label="Área"><SelectorArea value={empleado.area} onChange={(area) => setAreasSeleccionadas((actual) => ({ ...actual, [empleado.nombreNormalizado]: area }))} /></td>
                        <td data-label="Rubros">{numero(empleado.movimientos)}</td>
                        <td data-label="Costo empresa">{moneda(empleado.costoEmpresa)}</td>
                        <td data-label="Descuentos">{moneda(empleado.descuentos)}</td>
                        <td data-label="Pago neto">{moneda(empleado.pagoNetoRol)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="nom-actions">
                <button type="button" className="secondary" onClick={limpiarArchivo} disabled={procesando}>Quitar</button>
                <button type="button" onClick={() => void guardarImportacion()} disabled={procesando || analisis.advertencias.length > 0}>
                  {procesando ? "Guardando..." : `Guardar rol de ${mesPeriodo(analisis.periodo)}`}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {vista === "RESUMEN" && (
        <section className="nom-panel">
          <div className="nom-panel-head">
            <div><span>HISTORIAL CONECTADO</span><h2>Costo laboral mensual</h2><p>Las provisiones forman parte del costo; los descuentos se muestran aparte.</p></div>
            <label className="nom-period-filter">Mes<select value={periodoResumen} onChange={(evento) => setPeriodoResumen(evento.target.value)}><option value="">Seleccionar...</option>{periodosDisponibles.map((periodo) => <option key={periodo} value={periodo}>{mesPeriodo(periodo)}</option>)}</select></label>
          </div>

          {!importacionSeleccionada ? <div className="nom-empty">Todavía no existen roles importados.</div> : <>
            <section className="nom-kpis four">
              <Kpi titulo="Costo empresa" valor={moneda(importacionSeleccionada.costo_empresa)} detalle="Costo laboral devengado" clase="wine" />
              <Kpi titulo="Pago neto del rol" valor={moneda(importacionSeleccionada.pago_neto_rol)} detalle="Pago al personal" clase="green" />
              <Kpi titulo="Descuentos" valor={moneda(importacionSeleccionada.descuentos)} detalle="Aportes, anticipos y préstamos" clase="orange" />
              <Kpi titulo="Empleados" valor={numero(importacionSeleccionada.empleados)} detalle={`${numero(importacionSeleccionada.movimientos)} rubros`} clase="gray" />
            </section>

            <section className="nom-bars">
              <header><div><span>DISTRIBUCIÓN</span><h3>Costo por área</h3></div><small>{mesPeriodo(importacionSeleccionada.periodo)}</small></header>
              {areasPeriodo.map((item) => (
                <article key={item.area}>
                  <div><strong>{ETIQUETAS_AREA_NOMINA[item.area]}</strong><small>{numero(item.empleados)} empleados</small></div>
                  <span><i style={{ width: `${Math.max(2, Number(item.costo_empresa) / maximoArea * 100)}%` }} /></span>
                  <b>{moneda(item.costo_empresa)}</b>
                  <small>Pago neto {moneda(item.pago_neto_rol)}</small>
                </article>
              ))}
            </section>
          </>}

          {importaciones.length > 0 && <section className="nom-history"><header><span>CARGAS REALIZADAS</span><h3>Meses guardados</h3></header>{importaciones.map((item) => <article key={item.id}><div><strong>{mesPeriodo(item.periodo)}</strong><small>{item.archivo_nombre}</small></div><span>{numero(item.empleados)} empleados · {numero(item.movimientos)} rubros</span><b>{moneda(item.costo_empresa)}</b></article>)}</section>}
        </section>
      )}

      {vista === "EMPLEADOS" && (
        <section className="nom-panel">
          <div className="nom-panel-head"><div><span>MAESTRO DE PERSONAL</span><h2>Empleados y áreas</h2><p>Un cambio de área actualiza automáticamente todo el historial del empleado.</p></div></div>
          {empleados.length === 0 ? <div className="nom-empty">Los empleados aparecerán al instalar la migración o importar el primer rol.</div> : <div className="nom-table-wrap"><table><thead><tr><th>Empleado</th><th>Área vigente</th><th>Actualización</th></tr></thead><tbody>{empleados.map((empleado) => <tr key={empleado.id}><td data-label="Empleado"><strong>{empleado.nombre}</strong></td><td data-label="Área"><SelectorArea value={empleado.area} onChange={(area) => void cambiarAreaEmpleado(empleado, area)} /></td><td data-label="Actualización">{new Date(empleado.actualizado_en).toLocaleDateString("es-EC")}</td></tr>)}</tbody></table></div>}
        </section>
      )}
    </main>
  )
}

function SelectorArea({ value, onChange }: { value: AreaNomina; onChange: (area: AreaNomina) => void }) {
  return <select value={value} onChange={(evento) => onChange(evento.target.value as AreaNomina)}>{AREAS_NOMINA.map((area) => <option key={area} value={area}>{ETIQUETAS_AREA_NOMINA[area]}</option>)}</select>
}

function Kpi({ titulo, valor, detalle, clase }: { titulo: string; valor: string; detalle: string; clase: string }) {
  return <article className={`nom-kpi ${clase}`}><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>
}

const css = `
  .nom-page { width: 100%; padding: 8px 28px 40px; color: #2b2020; }
  .nom-page button, .nom-page input, .nom-page select { font: inherit; }
  .nom-header, .nom-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .nom-header { margin-bottom: 20px; }
  .nom-header span, .nom-panel-head span, .nom-area-preview header span, .nom-bars header span, .nom-history header span { color: #f07f12; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
  .nom-header h1 { margin: 4px 0 2px; color: #8f1d24; font-size: clamp(30px, 3.2vw, 46px); line-height: 1; }
  .nom-header p, .nom-panel-head p { margin: 3px 0 0; color: #6f625e; }
  .nom-page button { min-height: 42px; padding: 10px 18px; border: 1px solid #9f2028; border-radius: 9px; background: #9f2028; color: white; font-weight: 800; cursor: pointer; }
  .nom-page button.secondary { background: white; color: #8f1d24; }
  .nom-page button:disabled { opacity: .55; cursor: wait; }
  .nom-tabs { display: flex; gap: 4px; margin-bottom: 16px; padding: 6px; border: 1px solid #e6ded8; border-radius: 12px; background: #eee9e5; }
  .nom-tabs button { flex: 1; border-color: transparent; background: transparent; color: #6d5c57; }
  .nom-tabs button.active { background: white; color: #8f1d24; box-shadow: 0 4px 14px rgba(65,35,29,.08); }
  .nom-panel { padding: 22px; border: 1px solid #e4dbd5; border-radius: 15px; background: white; box-shadow: 0 10px 30px rgba(81,45,36,.05); }
  .nom-panel-head h2, .nom-area-preview h3, .nom-bars h3, .nom-history h3 { margin: 4px 0; }
  .nom-empty { margin-top: 20px; padding: 44px 20px; border: 1px dashed #d8c8bf; border-radius: 12px; color: #796c67; text-align: center; background: #fffaf7; }
  .nom-kpis { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 10px; margin: 20px 0; }
  .nom-kpis.four { grid-template-columns: repeat(4,minmax(0,1fr)); }
  .nom-kpi { min-height: 118px; padding: 15px; border: 1px solid #eadfda; border-top: 3px solid #9b8f89; border-radius: 10px; background: #fffdfc; }
  .nom-kpi.wine { border-top-color: #9f2028; } .nom-kpi.orange { border-top-color: #f7931e; } .nom-kpi.green { border-top-color: #14934f; } .nom-kpi.blue { border-top-color: #3278c9; }
  .nom-kpi span { display: block; min-height: 28px; color: #735f58; font-size: 10px; font-weight: 900; text-transform: uppercase; }
  .nom-kpi strong { display: block; margin: 8px 0; font-size: clamp(20px,2vw,28px); line-height: 1; }
  .nom-kpi small { color: #8c7a74; }
  .nom-warning { margin: 15px 0; padding: 12px 16px; border-left: 3px solid #e48a00; background: #fff7e5; color: #8a5700; }
  .nom-warning p { margin: 4px 0; }
  .nom-area-preview, .nom-bars, .nom-history { margin-top: 18px; padding: 17px; border: 1px solid #eadfd9; border-radius: 12px; }
  .nom-area-preview header, .nom-bars header { display: flex; justify-content: space-between; align-items: end; gap: 15px; }
  .nom-area-preview header small, .nom-bars header small { color: #8a7a75; }
  .nom-area-preview > div { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 8px; margin-top: 12px; }
  .nom-area-preview article { padding: 12px; border-radius: 9px; background: #faf6f3; }
  .nom-area-preview article span, .nom-area-preview article strong, .nom-area-preview article small { display: block; }
  .nom-area-preview article span { color: #755f58; font-size: 11px; font-weight: 800; }
  .nom-area-preview article strong { margin: 6px 0; font-size: 20px; }
  .nom-area-preview article small { color: #8b7c77; }
  .nom-table-wrap { margin-top: 18px; overflow: auto; border: 1px solid #e7ddd7; border-radius: 11px; }
  .nom-table-wrap.preview { max-height: 440px; }
  .nom-table-wrap table { width: 100%; border-collapse: collapse; min-width: 780px; }
  .nom-table-wrap thead { position: sticky; top: 0; z-index: 1; background: #f5efeb; }
  .nom-table-wrap th, .nom-table-wrap td { padding: 12px; border-bottom: 1px solid #eee5df; text-align: left; white-space: nowrap; }
  .nom-table-wrap th { color: #715d56; font-size: 10px; text-transform: uppercase; }
  .nom-table-wrap td { font-size: 13px; }
  .nom-table-wrap select, .nom-period-filter select { min-height: 38px; padding: 7px 10px; border: 1px solid #d9cec8; border-radius: 8px; background: white; color: #352927; }
  .nom-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
  .nom-period-filter { display: flex; flex-direction: column; gap: 5px; color: #715f58; font-size: 11px; font-weight: 800; text-transform: uppercase; }
  .nom-period-filter select { min-width: 210px; text-transform: none; }
  .nom-bars article { display: grid; grid-template-columns: minmax(190px,1fr) minmax(180px,3fr) 130px 190px; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid #eee5df; }
  .nom-bars article:last-child { border-bottom: 0; }
  .nom-bars article div strong, .nom-bars article div small { display: block; }
  .nom-bars article div small, .nom-bars article > small { color: #8b7c77; }
  .nom-bars article > span { height: 10px; overflow: hidden; border-radius: 999px; background: #eee5df; }
  .nom-bars article > span i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#9f2028,#f7931e); }
  .nom-history header { margin-bottom: 8px; }
  .nom-history article { display: grid; grid-template-columns: 1.4fr 1fr 140px; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee5df; }
  .nom-history article:last-child { border-bottom: 0; }
  .nom-history article div strong, .nom-history article div small { display: block; }
  .nom-history article div small, .nom-history article > span { color: #887973; }
  @media (max-width: 980px) { .nom-kpis, .nom-kpis.four { grid-template-columns: repeat(2,minmax(0,1fr)); } .nom-bars article { grid-template-columns: 1fr 1.5fr 110px; } .nom-bars article > small { grid-column: 1/-1; } }
  @media (max-width: 700px) { .nom-page { padding: 8px 14px 30px; } .nom-header, .nom-panel-head { flex-direction: column; } .nom-header button, .nom-panel-head button { width: 100%; } .nom-tabs { overflow-x: auto; } .nom-tabs button { flex: 0 0 auto; } .nom-panel { padding: 15px; } .nom-kpis, .nom-kpis.four { grid-template-columns: 1fr; } .nom-area-preview header, .nom-bars header { align-items: flex-start; flex-direction: column; } .nom-period-filter, .nom-period-filter select { width: 100%; } .nom-bars article { grid-template-columns: 1fr; gap: 7px; } .nom-history article { grid-template-columns: 1fr; gap: 5px; } }
`
