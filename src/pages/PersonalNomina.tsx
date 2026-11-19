import { useRef, useState, type FormEvent } from "react"
import { guardarPersonalNomina, type EmpleadoNominaDb } from "../repositories/nominaRepository"
import { AREAS_NOMINA, ETIQUETAS_AREA_NOMINA } from "../utils/rolesPagoPdf"
import "./nominaGestion.css"

type Personal = Pick<EmpleadoNominaDb, "id" | "nombre" | "area" | "activo" | "tipo_vinculo">
const nuevoPersonal = (): Personal => ({
  id: crypto.randomUUID(), nombre: "", area: "MANO_OBRA_DIRECTA", activo: true, tipo_vinculo: "NOMINA",
})
export default function PersonalNomina({ empleados, alGuardar }: {
  empleados: EmpleadoNominaDb[]; alGuardar: () => Promise<void>
}) {
  const [edicion, setEdicion] = useState<Personal | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const ocupado = useRef(false)

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!edicion || ocupado.current) return
    ocupado.current = true
    setGuardando(true)
    setError("")
    try {
      await guardarPersonalNomina(edicion)
      setEdicion(null)
      await alGuardar()
    } catch (fallo) {
      setError(typeof fallo === "object" && fallo && "message" in fallo ? String(fallo.message) : "No se pudo guardar la persona.")
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }

  return <section className="nom-gestion">
    <header><h2>Empleados y áreas</h2>
      <button type="button" disabled={guardando} onClick={() => { setError(""); setEdicion(nuevoPersonal()) }}>Nuevo</button>
    </header>
    {error && <p role="alert">{error}</p>}
    {edicion && <form className="nom-personal-form" onSubmit={guardar}>
      <label>Nombre <input value={edicion.nombre} maxLength={200} required disabled={guardando}
        onChange={evento => setEdicion({ ...edicion, nombre: evento.target.value })} /></label>
      <label>Área <select aria-label="Área" value={edicion.area} disabled={guardando}
        onChange={evento => setEdicion({ ...edicion, area: evento.target.value as Personal["area"] })}>
        {AREAS_NOMINA.map(area => <option key={area} value={area}>{ETIQUETAS_AREA_NOMINA[area]}</option>)}
      </select></label>
      <label>Vínculo <select aria-label="Vínculo" value={edicion.tipo_vinculo} disabled={guardando}
        onChange={evento => setEdicion({ ...edicion, tipo_vinculo: evento.target.value as Personal["tipo_vinculo"] })}>
        <option value="NOMINA">Nómina</option><option value="EXTERNO">Prestador externo</option>
      </select></label>
      <label>Estado <select aria-label="Estado" value={edicion.activo ? "ACTIVO" : "DESVINCULADO"} disabled={guardando}
        onChange={evento => setEdicion({ ...edicion, activo: evento.target.value === "ACTIVO" })}>
        <option value="ACTIVO">Activo</option><option value="DESVINCULADO">Desvinculado</option>
      </select></label>
      <button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
      <button type="button" disabled={guardando} onClick={() => setEdicion(null)}>Cancelar</button>
    </form>}
    <div className="nom-gestion-scroll" tabIndex={0} role="region" aria-label="Lista de personal">
      <table><thead><tr><th>Nombre</th><th>Área</th><th>Vínculo</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody>{empleados.map(persona => <tr key={persona.id}>
          <td>{persona.nombre}</td><td>{ETIQUETAS_AREA_NOMINA[persona.area]}</td>
          <td>{persona.tipo_vinculo === "EXTERNO" ? "Prestador externo" : "Nómina"}</td>
          <td>{persona.activo ? "Activo" : "Desvinculado"}</td>
          <td><button type="button" disabled={guardando}
            aria-label={`Editar ${persona.nombre}`} onClick={() => { setError(""); setEdicion(persona) }}>Editar</button></td>
        </tr>)}
        {empleados.length === 0 && <tr><td colSpan={5}>Todavía no hay personal registrado.</td></tr>}
        </tbody></table>
    </div>
  </section>
}
