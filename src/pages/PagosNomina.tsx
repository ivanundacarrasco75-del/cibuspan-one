import { useRef, useState, type FormEvent } from "react"
import {
  cargarNominaCuentas, CONCEPTOS_PAGO_NOMINA, type CargaNominaCuentas,
  type ConceptoPagoNomina, type EmpleadoNominaDb, type ResultadoCargaNomina,
} from "../repositories/nominaRepository"
import { ETIQUETAS_AREA_NOMINA } from "../utils/rolesPagoPdf"
import "./nominaGestion.css"

const hoy = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format()
type Borrador = { elegidos: Set<string>; montos: Record<string, string> }

export default function PagosNomina({ empleados, alCargar }: {
  empleados: EmpleadoNominaDb[]; alCargar: (resultado: ResultadoCargaNomina) => void
}) {
  const [mes, setMes] = useState(() => hoy().slice(0, 7))
  const [concepto, setConcepto] = useState<ConceptoPagoNomina>("PRIMERA_QUINCENA")
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({})
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState<CargaNominaCuentas | null>(null)
  const [error, setError] = useState("")
  const bloqueo = useRef(false)
  const personas = empleados.filter(persona => persona.activo)
  const clave = `${mes}:${concepto}`
  const borrador = borradores[clave] ?? { elegidos: new Set<string>(), montos: {} }
  const valorPersona = (id: string) => borrador.montos[id] ?? (concepto === "PRIMERA_QUINCENA" ? "300.00" : "")
  const seleccionadas = personas.filter(persona => borrador.elegidos.has(persona.id))
  const total = seleccionadas.reduce((suma, persona) => suma + Math.round(Number(valorPersona(persona.id) || 0) * 100), 0) / 100
  const bloqueado = guardando || pendiente !== null
  const nombreMes = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${mes}-01T12:00:00Z`))

  function cambiar(elegidos: Set<string>, montos = borrador.montos) {
    setBorradores(anteriores => ({ ...anteriores, [clave]: { elegidos, montos } }))
  }
  async function cargar(evento: FormEvent) {
    evento.preventDefault()
    if (bloqueo.current) return
    const solicitud = pendiente ?? {
      operacion: crypto.randomUUID(),
      periodo: `${mes}-01`, concepto,
      filas: seleccionadas.map(persona => ({ empleado_id: persona.id, monto: valorPersona(persona.id) })),
    }
    if (solicitud.filas.length === 0) return
    bloqueo.current = true
    setGuardando(true)
    setError("")
    try {
      setPendiente(solicitud)
      const resultado = await cargarNominaCuentas(solicitud)
      setPendiente(null)
      alCargar(resultado)
    } catch (fallo) {
      if (typeof fallo === "object" && fallo !== null && "cargaRechazada" in fallo && fallo.cargaRechazada) setPendiente(null)
      setError(typeof fallo === "object" && fallo && "message" in fallo ? String(fallo.message) : "No se pudo cargar la nómina.")
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }
  return <section className="nom-gestion">
    <h2>Pagos nómina</h2>
    <form onSubmit={cargar}>
      <div className="nom-gestion-filtros">
        <label>Mes <input type="month" value={mes} required disabled={bloqueado}
          onChange={evento => evento.target.value && setMes(evento.target.value)} /></label>
        <label>Concepto <select aria-label="Concepto" value={concepto} disabled={bloqueado}
          onChange={evento => setConcepto(evento.target.value as ConceptoPagoNomina)}>
          {Object.entries(CONCEPTOS_PAGO_NOMINA).map(([codigo, etiqueta]) =>
            <option key={codigo} value={codigo}>{etiqueta}{codigo === "SUELDO" || codigo.endsWith("QUINCENA") ? ` · ${nombreMes}` : ""}</option>)}
        </select></label>
      </div>
      <div className="nom-gestion-scroll" tabIndex={0} role="region" aria-label="Personal para pagos de nómina">
        <table><thead><tr>
          <th><input type="checkbox" aria-label="Seleccionar todo el personal" disabled={bloqueado || personas.length === 0}
            checked={personas.length > 0 && seleccionadas.length === personas.length}
            onChange={evento => cambiar(new Set(evento.target.checked ? personas.map(persona => persona.id) : []))} /></th>
          <th>Nombre</th><th>Vínculo</th><th>Área</th><th>Monto USD</th>
        </tr></thead><tbody>{personas.map(persona => <tr key={persona.id}>
          <td><input type="checkbox" aria-label={`Seleccionar ${persona.nombre}`} checked={borrador.elegidos.has(persona.id)} disabled={bloqueado}
            onChange={evento => {
              const elegidos = new Set(borrador.elegidos)
              if (evento.target.checked) elegidos.add(persona.id)
              else elegidos.delete(persona.id)
              cambiar(elegidos)
            }} /></td>
          <td>{persona.nombre}</td><td>{persona.tipo_vinculo === "EXTERNO" ? "Prestador externo" : "Nómina"}</td>
          <td>{ETIQUETAS_AREA_NOMINA[persona.area]}</td>
          <td><input type="number" aria-label={`Monto de ${persona.nombre}`} min="0.01" max="999999999.99" step="0.01"
            required={borrador.elegidos.has(persona.id)} value={valorPersona(persona.id)} disabled={bloqueado}
            onChange={evento => cambiar(borrador.elegidos, { ...borrador.montos, [persona.id]: evento.target.value })} /></td>
        </tr>)}
        {personas.length === 0 && <tr><td colSpan={5}>Agrega personal activo en Empleados y áreas.</td></tr>}
        </tbody></table>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="nom-gestion-filtros">
        <strong>{seleccionadas.length} personas · {total.toLocaleString("es-EC", { style: "currency", currency: "USD" })}</strong>
        <button type="submit" disabled={guardando || seleccionadas.length === 0}>
          {guardando ? "Cargando…" : pendiente ? "Reintentar carga" : "Cargar a cuentas por pagar"}
        </button>
      </div>
    </form>
  </section>
}
