import { useEffect, useRef, useState } from "react"
import {
  contextoCatalogoFormulas, ejecutarAccionCatalogo, obtenerCatalogoFormulas,
  type AccionCatalogo, type FormulaCatalogo, type IntentoCatalogo,
} from "../repositories/catalogoFormulasRepository"
import { etiquetaVersionFormula } from "../utils/formulacionVersion"

export default function CatalogoFormulas({ editar, alCambiar }: { editar: () => void; alCambiar: () => void }) {
  const [formulas, setFormulas] = useState<FormulaCatalogo[]>([])
  const [seleccion, setSeleccion] = useState("")
  const [buscar, setBuscar] = useState("")
  const [estado, setEstado] = useState("TODAS")
  const [contexto, setContexto] = useState<Awaited<ReturnType<typeof contextoCatalogoFormulas>> | null>(null)
  const [pendiente, setPendiente] = useState<IntentoCatalogo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const accion = useRef(false)
  const bloqueado = cargando || guardando || !!pendiente
  const formula = formulas.find(f => f.id === seleccion)

  useEffect(() => {
    let activo = true
    Promise.all([obtenerCatalogoFormulas(), contextoCatalogoFormulas()]).then(([datos, ctx]) => {
      if (!activo) return
      const copia = localStorage.getItem(ctx.clave)
      if (copia) {
        const intento = JSON.parse(copia) as IntentoCatalogo
        if (!intento.id || !intento.objeto || !["BLOQUEAR", "DESBLOQUEAR", "ELIMINAR_FORMULA", "ELIMINAR_VERSION"].includes(intento.accion)) {
          throw new Error("Hay una acción guardada que requiere revisión antes de continuar.")
        }
        setPendiente(intento)
      }
      setFormulas(datos); setContexto(ctx)
    }).catch(e => { if (activo) setError(e.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [])

  async function ejecutar(intento: IntentoCatalogo) {
    if (!contexto || accion.current) return
    accion.current = true; setGuardando(true); setError(""); setMensaje("")
    try {
      const copia = JSON.stringify(intento)
      localStorage.setItem(contexto.clave, copia)
      if (localStorage.getItem(contexto.clave) !== copia) throw new Error("No se pudo conservar la acción antes de enviarla.")
      setPendiente(intento)
      await ejecutarAccionCatalogo(intento, contexto.usuario)
      try { localStorage.removeItem(contexto.clave) } catch { /* El comprobante recupera el mismo resultado. */ }
      setPendiente(null)
      const mensajes: Record<AccionCatalogo, string> = {
        BLOQUEAR: "Fórmula bloqueada. Se ocultó de la selección de fórmulas, impresión, recetas y costos.",
        DESBLOQUEAR: "Fórmula desbloqueada.",
        ELIMINAR_FORMULA: "Fórmula y versiones eliminadas.",
        ELIMINAR_VERSION: "Versión eliminada. Revisa la versión vigente del SKU antes de producir o cotizar.",
      }
      setMensaje(mensajes[intento.accion]); alCambiar()
      try { setFormulas(await obtenerCatalogoFormulas()) }
      catch { setError("La acción fue confirmada. Vuelve a abrir el catálogo para actualizar el listado.") }
    } catch (e) {
      const fallo = e as Error & { rechazoConfirmado?: boolean }
      setError(fallo.message)
      if (fallo.rechazoConfirmado) {
        try { localStorage.removeItem(contexto.clave); setPendiente(null) } catch { /* Conserva la acción si falla el almacenamiento. */ }
      }
    } finally { accion.current = false; setGuardando(false) }
  }

  function confirmar(tipo: AccionCatalogo, objeto: string, etiqueta: string) {
    if (bloqueado || !contexto) return
    const preguntas: Record<AccionCatalogo, string> = {
      BLOQUEAR: `¿Bloquear ${etiqueta}? Se ocultará de las opciones de fórmulas, impresión, recetas y costos. Podrás desbloquearla desde este catálogo.`,
      DESBLOQUEAR: `¿Volver a habilitar ${etiqueta}?`,
      ELIMINAR_FORMULA: `¿Eliminar definitivamente ${etiqueta}, todas sus versiones, ingredientes y vínculos de costo? Esta acción es irreversible.`,
      ELIMINAR_VERSION: `¿Eliminar definitivamente ${etiqueta} y sus ingredientes? Si es la vigente, el SKU quedará pendiente de una versión vigente para su costeo.`,
    }
    if (window.confirm(preguntas[tipo])) void ejecutar({ id: crypto.randomUUID(), accion: tipo, objeto, etiqueta })
  }

  const texto = buscar.trim().toLocaleLowerCase()
  const visibles = formulas.filter(f => (`${f.codigo} ${f.nombre}`).toLocaleLowerCase().includes(texto)
    && (estado === "TODAS" || f.activo === (estado === "ACTIVAS")))
  return <section className="fm-editor">
    <header><h1>Administrar catálogo y versiones</h1></header>
    {error && <p className="fm-error" role="alert">{error}</p>}
    {mensaje && <p className="fm-exito" role="status">{mensaje}</p>}
    {cargando && <p role="status">Cargando catálogo…</p>}
    {pendiente && <div className="fm-aviso"><p>Acción por confirmar para {pendiente.etiqueta}.</p>
      <button className="fm-secundario" disabled={guardando} onClick={() => void ejecutar(pendiente)}>Comprobar / reintentar la misma acción</button></div>}
    <div className="fm-filtros">
      <label>Buscar fórmula<input value={buscar} onChange={e => setBuscar(e.target.value)} /></label>
      <label>Estado<select value={estado} onChange={e => setEstado(e.target.value)}><option value="TODAS">Todas</option><option value="ACTIVAS">Activas</option><option value="BLOQUEADAS">Bloqueadas</option></select></label>
    </div>
    <div className="fm-hoja"><table><thead><tr><th>Código</th><th>Fórmula</th><th>Estado</th><th>Versiones</th><th>Acciones</th></tr></thead>
      <tbody>{visibles.map(f => <tr key={f.id}>
        <td>{f.codigo}</td><td>{f.nombre}</td><td>{f.activo ? "Activa" : "Bloqueada"}</td><td>{f.versiones.length}</td>
        <td><div className="fm-acciones">
          <button className="fm-secundario" disabled={bloqueado} onClick={() => setSeleccion(f.id)}>Ver versiones</button>
          <button className="fm-secundario" disabled={bloqueado || !contexto} onClick={() => confirmar(f.activo ? "BLOQUEAR" : "DESBLOQUEAR", f.id, `${f.codigo} · ${f.nombre}`)}>{f.activo ? "Bloquear" : "Desbloquear"}</button>
          <button className="fm-secundario fm-peligro" disabled={bloqueado || !contexto} onClick={() => confirmar("ELIMINAR_FORMULA", f.id, `${f.codigo} · ${f.nombre}`)}>Eliminar fórmula</button>
        </div></td></tr>)}
        {!cargando && !visibles.length && <tr><td colSpan={5}>No hay fórmulas para los filtros elegidos.</td></tr>}
      </tbody></table></div>
    {formula && <section className="fm-guardado"><h2>{formula.codigo} · {formula.nombre}</h2>
      <div className="fm-hoja"><table><thead><tr><th>Versión</th><th>Estado</th><th>Vigente desde</th><th>Acción</th></tr></thead>
        <tbody>{[...formula.versiones].sort((a, b) => b.numero_version - a.numero_version).map(v => <tr key={v.id}>
          <td>{etiquetaVersionFormula(v)}</td><td>{v.estado}</td><td>{v.vigente_desde ?? "—"}</td>
          <td><button className="fm-secundario fm-peligro" disabled={bloqueado || !contexto} onClick={() => confirmar("ELIMINAR_VERSION", v.id, `${formula.codigo} · versión ${v.numero_version}`)}>Eliminar versión</button></td>
        </tr>)}
          {!formula.versiones.length && <tr><td colSpan={4}>Esta fórmula todavía no tiene versiones.</td></tr>}
        </tbody></table></div>
    </section>}
    <button className="fm-secundario" disabled={bloqueado} onClick={editar}>Editar ingredientes, micros y versiones</button>
  </section>
}
