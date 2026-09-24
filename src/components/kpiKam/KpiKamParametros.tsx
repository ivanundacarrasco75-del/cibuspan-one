import { useCallback, useEffect, useMemo, useState } from "react"
import {
  guardarParametrosKpiKamDb,
  obtenerCatalogoParametrosKpiKamDb,
  type CatalogoParametrosKpiKamDb,
  type ParametroKpiKamDb,
} from "../../repositories/kpiKamRepository"
import { CODIGOS_KPI_KAM } from "../../types/kpiKam"

type Props = {
  periodo: string
  cambiarPeriodo: (periodo: string) => void
  onActualizado: () => void
}

type FilaEditable = ParametroKpiKamDb & {
  pesoTexto: string
  metaTexto: string
}

const VACIO: CatalogoParametrosKpiKamDb = {
  puede_configurar: false,
  clientes: [],
  configuraciones: [],
}

export default function KpiKamParametros({
  periodo,
  cambiarPeriodo,
  onActualizado,
}: Props) {
  const [clienteId, setClienteId] = useState("")
  const [catalogo, setCatalogo] = useState(VACIO)
  const [filas, setFilas] = useState<FilaEditable[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const cargar = useCallback(async () => {
    setCargando(true)
    setError("")
    setMensaje("")
    try {
      const datos = await obtenerCatalogoParametrosKpiKamDb(
        periodo,
        clienteId || null,
      )
      setCatalogo(datos)
      setFilas(datos.configuraciones.map((fila) => ({
        ...fila,
        pesoTexto: String(fila.peso),
        metaTexto: fila.meta == null ? "" : String(fila.meta),
      })))
    } catch (err) {
      setCatalogo(VACIO)
      setFilas([])
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las metas KPI.",
      )
    } finally {
      setCargando(false)
    }
  }, [clienteId, periodo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const totalPeso = useMemo(
    () => filas.reduce((total, fila) => {
      const peso = Number(fila.pesoTexto.replace(",", "."))
      return total + (Number.isFinite(peso) ? peso : 0)
    }, 0),
    [filas],
  )

  function cambiarFila(
    codigo: string,
    cambios: Partial<Pick<FilaEditable, "aplica" | "pesoTexto" | "metaTexto">>,
  ) {
    setFilas((actuales) => actuales.map((fila) =>
      fila.codigo === codigo ? { ...fila, ...cambios } : fila,
    ))
  }

  async function guardar() {
    if (filas.length !== CODIGOS_KPI_KAM.length) {
      setError(`La configuración debe contener los ${CODIGOS_KPI_KAM.length} KPI.`)
      return
    }
    if (Math.abs(totalPeso - 100) > 0.01) {
      setError("La suma de los pesos debe ser exactamente 100%.")
      return
    }

    const configuraciones = filas.map((fila) => {
      const peso = Number(fila.pesoTexto.replace(",", "."))
      const meta = fila.metaTexto.trim() === ""
        ? null
        : Number(fila.metaTexto.replace(",", "."))
      return {
        codigo: fila.codigo,
        aplica: fila.aplica,
        peso,
        meta,
        rangos_puntuacion: fila.rangos_puntuacion,
        reglas_criticas: fila.reglas_criticas,
      }
    })

    const invalida = configuraciones.find((fila) =>
      !Number.isFinite(fila.peso)
      || fila.peso < 0
      || fila.peso > 100
      || (fila.aplica && (fila.meta == null || !Number.isFinite(fila.meta)))
      || (
        fila.aplica
        && fila.codigo === "CRECIMIENTO_RENTABLE"
        && Number(fila.meta) <= 0
      ),
    )
    if (invalida) {
      setError("Revisa los pesos y completa la meta de cada KPI aplicable. La meta de crecimiento rentable debe ser mayor que cero.")
      return
    }

    setGuardando(true)
    setMensaje("")
    setError("")
    try {
      await guardarParametrosKpiKamDb({
        periodo,
        clienteId: clienteId || null,
        configuraciones,
      })
      setMensaje(
        clienteId
          ? "Las metas específicas del cliente fueron guardadas."
          : "La configuración general fue guardada.",
      )
      onActualizado()
      const datos = await obtenerCatalogoParametrosKpiKamDb(
        periodo,
        clienteId || null,
      )
      setCatalogo(datos)
      setFilas(datos.configuraciones.map((fila) => ({
        ...fila,
        pesoTexto: String(fila.peso),
        metaTexto: fila.meta == null ? "" : String(fila.meta),
      })))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron guardar las metas KPI.",
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="kam-parametros">
      <style>{css}</style>

      <header className="kam-parametros-head">
        <div>
          <span>CONFIGURACIÓN DE EVALUACIÓN</span>
          <h2>Metas, pesos y aplicabilidad</h2>
          <p>Define la regla general o crea una excepción para un cliente desde el mes seleccionado.</p>
        </div>
        <div className="kam-parametros-filtros">
          <label>
            <span>Periodo de vigencia</span>
            <input
              type="month"
              value={periodo}
              onChange={(event) => cambiarPeriodo(event.target.value)}
            />
          </label>
          <label>
            <span>Alcance</span>
            <select
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
            >
              <option value="">General · todos los clientes</option>
              {catalogo.clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="kam-parametros-nota">
        <strong>{clienteId ? "Excepción por cliente" : "Regla general"}</strong>
        <span>Los pesos suman 100%. Si un KPI no aplica, su peso se redistribuye automáticamente entre los demás.</span>
      </div>

      {error && <div className="kam-parametros-error">{error}</div>}
      {mensaje && <div className="kam-parametros-exito">{mensaje}</div>}

      {cargando ? (
        <div className="kam-parametros-carga">Cargando metas y pesos…</div>
      ) : filas.length === 0 ? (
        <div className="kam-parametros-carga">No existe una configuración KPI disponible para este periodo.</div>
      ) : (
        <div className="kam-parametros-tabla">
          <table>
            <thead>
              <tr>
                <th>KPI</th>
                <th>Aplica</th>
                <th>Peso</th>
                <th>Meta</th>
                <th>Origen vigente</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.codigo} className={fila.aplica ? "" : "no-aplica"}>
                  <td>
                    <strong>{fila.nombre}</strong>
                    <small>{fila.descripcion || "Indicador KPI KAM"}</small>
                  </td>
                  <td>
                    <label className="kam-parametros-check">
                      <input
                        type="checkbox"
                        checked={fila.aplica}
                        disabled={!catalogo.puede_configurar}
                        onChange={(event) => cambiarFila(fila.codigo, { aplica: event.target.checked })}
                      />
                      <span>{fila.aplica ? "Sí" : "No"}</span>
                    </label>
                  </td>
                  <td>
                    <div className="kam-parametros-numero">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={fila.pesoTexto}
                        disabled={!catalogo.puede_configurar}
                        onChange={(event) => cambiarFila(fila.codigo, { pesoTexto: event.target.value })}
                      />
                      <span>%</span>
                    </div>
                  </td>
                  <td>
                    <div className="kam-parametros-numero">
                      <input
                        type="number"
                        step="0.01"
                        value={fila.metaTexto}
                        disabled={!catalogo.puede_configurar || !fila.aplica}
                        placeholder={fila.aplica ? "Obligatoria" : "No aplica"}
                        onChange={(event) => cambiarFila(fila.codigo, { metaTexto: event.target.value })}
                      />
                      <span>{fila.codigo === "ROTACION_DIARIA" ? "u/día" : "%"}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`kam-parametros-origen ${fila.origen.toLocaleLowerCase()}`}>
                      {fila.origen === "CLIENTE" ? "Cliente" : "General"}
                    </span>
                    <small>Desde {fechaCorta(fila.vigente_desde)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && filas.length > 0 && (
        <footer className="kam-parametros-pie">
          <div className={Math.abs(totalPeso - 100) <= 0.01 ? "correcto" : "incorrecto"}>
            <span>Suma de pesos</span>
            <strong>{totalPeso.toLocaleString("es-EC", { maximumFractionDigits: 2 })}%</strong>
          </div>
          {catalogo.puede_configurar ? (
            <button type="button" disabled={guardando} onClick={() => void guardar()}>
              {guardando ? "Guardando…" : "Guardar metas y pesos"}
            </button>
          ) : (
            <small>Solo Administrador o Gerente puede modificar esta configuración.</small>
          )}
        </footer>
      )}
    </section>
  )
}

function fechaCorta(valor: string) {
  if (!valor) return "—"
  const [anio, mes, dia] = valor.slice(0, 10).split("-")
  return `${dia}/${mes}/${anio}`
}

const css = `
.kam-parametros{display:grid;gap:14px}.kam-parametros-head{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;padding:20px;border:1px solid #e6dad4;border-radius:14px;background:#fff}.kam-parametros-head>div:first-child>span{color:#f28c18;font-size:10px;font-weight:900;letter-spacing:.09em}.kam-parametros-head h2{margin:5px 0;color:#8f1d24}.kam-parametros-head p{margin:0;color:#746761}.kam-parametros-filtros{display:grid;grid-template-columns:180px minmax(260px,1fr);gap:10px;min-width:min(520px,48vw)}.kam-parametros label{display:grid;gap:5px}.kam-parametros label>span{color:#746660;font-size:10px;font-weight:900;text-transform:uppercase}.kam-parametros input,.kam-parametros select{width:100%;box-sizing:border-box;border:1px solid #ddcfc8;border-radius:9px;background:#fbf9f7;padding:10px;color:#3b2d29;font-weight:700}.kam-parametros-nota{display:flex;gap:12px;align-items:center;padding:13px 16px;border:1px solid #f0d4aa;border-radius:11px;background:#fff8ed;color:#75645b}.kam-parametros-nota strong{color:#8f1d24;white-space:nowrap}.kam-parametros-error,.kam-parametros-exito,.kam-parametros-carga{padding:16px;border:1px solid #e6dad4;border-radius:11px;background:#fff}.kam-parametros-error{color:#a1212a;background:#fff5f5;border-color:#edc8ca}.kam-parametros-exito{color:#147542;background:#eef9f2;border-color:#c6e7d2}.kam-parametros-tabla{overflow:auto;border:1px solid #e6dad4;border-radius:14px;background:#fff}.kam-parametros table{width:100%;min-width:930px;border-collapse:collapse}.kam-parametros th{padding:11px 14px;background:#f7f3f0;color:#6f605b;font-size:10px;text-align:left;text-transform:uppercase}.kam-parametros td{padding:12px 14px;border-top:1px solid #eee4de}.kam-parametros td:first-child{width:39%}.kam-parametros td strong,.kam-parametros td small{display:block}.kam-parametros td small{margin-top:4px;color:#897b75}.kam-parametros tr.no-aplica td{background:#faf9f8;color:#8e827d}.kam-parametros-check{display:flex!important;grid-template-columns:auto auto;align-items:center;justify-content:flex-start}.kam-parametros-check input{width:18px;height:18px;accent-color:#981f28}.kam-parametros-check span{font-size:12px!important;color:#443733!important}.kam-parametros-numero{display:flex;min-width:135px}.kam-parametros-numero input{border-radius:9px 0 0 9px}.kam-parametros-numero span{display:grid;place-items:center;padding:0 10px;border:1px solid #ddcfc8;border-left:0;border-radius:0 9px 9px 0;background:#f7f3f0;font-weight:900}.kam-parametros-origen{display:inline-block;padding:5px 9px;border-radius:999px;background:#f1ebe7;color:#725f57;font-size:10px;font-weight:900;text-transform:uppercase}.kam-parametros-origen.cliente{background:#fff0d9;color:#9b5e0a}.kam-parametros-pie{display:flex;justify-content:flex-end;align-items:center;gap:18px;padding:15px 18px;border:1px solid #e6dad4;border-radius:12px;background:#fff}.kam-parametros-pie>div{display:flex;gap:10px;align-items:baseline}.kam-parametros-pie>div span{color:#746761}.kam-parametros-pie>div strong{font-size:20px}.kam-parametros-pie .correcto strong{color:#18864b}.kam-parametros-pie .incorrecto strong{color:#aa2630}.kam-parametros-pie button{border:0;border-radius:9px;background:#981f28;color:#fff;padding:11px 16px;font-weight:900;cursor:pointer}.kam-parametros-pie button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:900px){.kam-parametros-head{align-items:stretch;flex-direction:column}.kam-parametros-filtros{grid-template-columns:1fr;min-width:0}.kam-parametros-nota,.kam-parametros-pie{align-items:flex-start;flex-direction:column}.kam-parametros-pie button{width:100%}}
`
