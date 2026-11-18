import { useEffect, useRef, useState } from "react"
import {
  contextoAltaFormula, guardarProductoFormula, obtenerMaterialesAltaFormula,
  type DatosNuevoProducto, type MaterialAltaFormula, type ResultadoNuevoProducto,
} from "../repositories/nuevoProductoFormulaRepository"
import { obtenerMicrosFmDb, type MicroFmDb } from "../repositories/formulaRepository"

type Ingrediente = { id: string; material: string; porcentaje: string; base: boolean; micro: string }
type Empaque = { id: string; material: string; cantidad: string }
type Intento = { id: string; usuario: string; datos: DatosNuevoProducto }
const filaIngrediente = (): Ingrediente => ({ id: crypto.randomUUID(), material: "", porcentaje: "", base: false, micro: "" })
const moneda = (valor: number) => Number(valor).toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 4 })

export default function NuevoProductoFormula({ alGuardar }: { alGuardar: () => void }) {
  const [materiales, setMateriales] = useState<MaterialAltaFormula[]>([])
  const [micros, setMicros] = useState<MicroFmDb[]>([])
  const [codigo, setCodigo] = useState("")
  const [nombre, setNombre] = useState("")
  const [corto, setCorto] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [panes, setPanes] = useState("")
  const [rendimiento, setRendimiento] = useState("")
  const [vida, setVida] = useState("")
  const [peso, setPeso] = useState("")
  const [pesoFinal, setPesoFinal] = useState("")
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>(() => [filaIngrediente()])
  const [empaques, setEmpaques] = useState<Empaque[]>([])
  const [contexto, setContexto] = useState<Awaited<ReturnType<typeof contextoAltaFormula>> | null>(null)
  const [pendiente, setPendiente] = useState<Intento | null>(null)
  const [resultado, setResultado] = useState<ResultadoNuevoProducto | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const accion = useRef(false)
  const bloqueado = cargando || guardando || !!pendiente || !!resultado

  useEffect(() => {
    let activo = true
    Promise.all([obtenerMaterialesAltaFormula(), obtenerMicrosFmDb(), contextoAltaFormula()]).then(([m, mi, ctx]) => {
      if (!activo) return
      setMateriales(m); setMicros(mi); setContexto(ctx)
      const copia = localStorage.getItem(ctx.clave)
      if (copia) {
        const intento = JSON.parse(copia) as Intento
        if (!intento.id || intento.usuario !== ctx.usuario || !Array.isArray(intento.datos?.ingredientes) || !Array.isArray(intento.datos?.empaques)) {
          throw new Error("Hay un intento guardado que requiere revisión antes de crear otro producto.")
        }
        setPendiente(intento)
        const d = intento.datos
        setCodigo(d.codigo); setNombre(d.nombre); setCorto(d.corto); setDescripcion(d.descripcion)
        setPanes(String(d.panes)); setRendimiento(String(d.rendimiento)); setVida(String(d.vida_util))
        setPeso(String(d.peso_batch_kg)); setPesoFinal(String(d.peso_final_g))
        setIngredientes(d.ingredientes.map(i => ({ id: crypto.randomUUID(), material: i.materia_prima_id, porcentaje: String(i.porcentaje), base: i.harina_base, micro: i.micro_id ?? "" })))
        setEmpaques(d.empaques.map(e => ({ id: crypto.randomUUID(), material: e.materia_prima_id, cantidad: String(e.cantidad) })))
      }
    }).catch(e => { if (activo) { setError(e.message); setContexto(null) } })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [])

  const cambiarIngrediente = (id: string, campos: Partial<Ingrediente>) =>
    setIngredientes(filas => filas.map(f => f.id === id ? { ...f, ...campos } : f))
  const suma = ingredientes.reduce((total, i) => total + (Number(i.porcentaje.replace(",", ".")) || 0), 0)
  const base = ingredientes.filter(i => i.base).reduce((total, i) => total + (Number(i.porcentaje.replace(",", ".")) || 0), 0)
  const ingredientesDisponibles = materiales.filter(m => !m.es_empaque)
  const empaquesDisponibles = materiales.filter(m => m.es_empaque)
  const numero = (texto: string, etiqueta: string, entero = false) => {
    const valor = Number(texto.trim().replace(",", "."))
    if (!texto.trim() || !Number.isFinite(valor) || valor <= 0 || (entero && !Number.isInteger(valor))) throw new Error(`Completa ${etiqueta} con un número positivo${entero ? " entero" : ""}.`)
    return valor
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!contexto || accion.current || resultado) return
    accion.current = true; setGuardando(true); setError("")
    let intento = pendiente
    try {
      if (!intento) {
        if (!codigo.trim() || !nombre.trim() || !corto.trim()) throw new Error("Completa el código, el nombre y el nombre corto del producto.")
        if (Math.abs(base - 100) > 0.000001) throw new Error("Las harinas base deben sumar 100%.")
        const datos: DatosNuevoProducto = {
          codigo: codigo.trim(), nombre: nombre.trim(), corto: corto.trim(), descripcion: descripcion.trim(),
          panes: numero(panes, "las unidades de pan por parada", true), rendimiento: numero(rendimiento, "las unidades vendibles por parada", true),
          vida_util: numero(vida, "la vida útil", true), peso_batch_kg: numero(peso, "el peso de la parada"), peso_final_g: numero(pesoFinal, "el peso final"),
          ingredientes: ingredientes.map(i => {
            const m = materiales.find(m => m.id === i.material)
            if (!m || m.es_empaque) throw new Error("Selecciona cada ingrediente.")
            if (m.unidad_base !== "KG") throw new Error(`${m.nombre} usa ${m.unidad_base}. Selecciona su artículo en KG para formular por peso.`)
            if (m.incluir_en_costeo && m.costo_unitario === null) throw new Error(`Falta el costo vigente de ${m.nombre}.`)
            return { materia_prima_id: m.id, porcentaje: numero(i.porcentaje, `el porcentaje de ${m.nombre}`), harina_base: i.base, micro_id: i.micro || null }
          }),
          empaques: empaques.map(e => {
            const m = materiales.find(m => m.id === e.material)
            if (!m?.es_empaque) throw new Error("Selecciona cada empaque.")
            if (m.incluir_en_costeo && m.costo_unitario === null) throw new Error(`Falta el costo vigente de ${m.nombre}.`)
            return { materia_prima_id: m.id, cantidad: numero(e.cantidad, `la cantidad de ${m.nombre}`) }
          }),
        }
        intento = { id: crypto.randomUUID(), usuario: contexto.usuario, datos }
        const copia = JSON.stringify(intento)
        localStorage.setItem(contexto.clave, copia)
        if (localStorage.getItem(contexto.clave) !== copia) throw new Error("No se pudo conservar el intento en este navegador.")
        setPendiente(intento)
      }
      const r = await guardarProductoFormula(intento.id, intento.datos, intento.usuario)
      setResultado(r)
      try { localStorage.removeItem(contexto.clave) } catch { /* El comprobante permite recuperar el mismo resultado. */ }
      setPendiente(null); alGuardar()
    } catch (e) {
      const fallo = e as Error & { rechazoConfirmado?: boolean }
      setError(fallo.message)
      if (fallo.rechazoConfirmado) {
        try { localStorage.removeItem(contexto.clave); setPendiente(null) } catch { /* Conserva el intento si falla el almacenamiento. */ }
      }
    } finally {
      accion.current = false; setGuardando(false)
    }
  }

  return <section className="fm-editor">
    <header><h1>Ingresar nuevo producto</h1><p>Registra el SKU, su fórmula por parada y los empaques de cada unidad vendible.</p></header>
    {error && <p className="fm-error" role="alert">{error}</p>}
    {cargando && <p role="status">Cargando ingredientes y costos…</p>}
    {pendiente && !resultado && <p className="fm-aviso">Hay un guardado por comprobar para {pendiente.datos.codigo}. Reintenta para recuperar el mismo producto y su costo.</p>}
    {resultado && <section className="fm-exito" role="status"><h2>{resultado.codigo} · {resultado.nombre}</h2>
      <p>Producto guardado con fórmula vigente. Costo de ingredientes por unidad vendible {moneda(resultado.costo_materia_prima_unidad)}, empaque {moneda(resultado.costo_empaque_unidad)} y materiales {moneda(resultado.costo_materiales_unidad)}.</p>
      <p>El costo de materiales está disponible en el simulador y en las consultas de costos del producto.</p>
    </section>}
    <form onSubmit={guardar}>
      <fieldset className="fm-guardado" disabled={bloqueado}><legend>Producto</legend>
        <div className="fm-filtros">
          <label>Código / SKU<input required maxLength={100} value={codigo} onChange={e => setCodigo(e.target.value)} /></label>
          <label>Nombre del producto<input required maxLength={200} value={nombre} onChange={e => setNombre(e.target.value)} /></label>
          <label>Nombre corto<input required maxLength={100} value={corto} onChange={e => setCorto(e.target.value)} /></label>
          <label>Vida útil (días)<input required type="number" min="1" step="1" value={vida} onChange={e => setVida(e.target.value)} /></label>
          <label>Descripción<input maxLength={2000} value={descripcion} onChange={e => setDescripcion(e.target.value)} /></label>
        </div>
      </fieldset>
      <fieldset className="fm-guardado" disabled={bloqueado}><legend>Crear fórmula maestra</legend>
        <div className="fm-filtros">
          <label>Unidades de pan por parada<input required type="number" min="1" step="1" value={panes} onChange={e => setPanes(e.target.value)} /></label>
          <label>Rendimiento de fundas / unidades vendibles<input required type="number" min="1" step="1" value={rendimiento} onChange={e => setRendimiento(e.target.value)} /></label>
          <label>Peso de la parada (kg)<input required type="number" min="0.0001" step="0.0001" value={peso} onChange={e => setPeso(e.target.value)} /></label>
          <label>Peso final por pan (g)<input required type="number" min="0.0001" step="0.0001" value={pesoFinal} onChange={e => setPesoFinal(e.target.value)} /></label>
        </div>
        <p>Selecciona los ingredientes y sus porcentajes panaderos. Marca las harinas de la base, que deben sumar 100%. El cálculo por peso usa ingredientes del catálogo en KG.</p>
        <div className="fm-hoja"><table><thead><tr><th>Ingrediente</th><th>% panadero</th><th>Harina base</th><th>Destino</th><th>Costo de referencia</th><th /></tr></thead>
          <tbody>{ingredientes.map(i => {
            const m = materiales.find(m => m.id === i.material)
            return <tr key={i.id}><td><select aria-label="Ingrediente" value={i.material} required onChange={e => cambiarIngrediente(i.id, { material: e.target.value })}>
              <option value="">Seleccionar ingrediente</option>{ingredientesDisponibles.map(m => <option key={m.id} value={m.id}>{m.codigo} · {m.nombre} ({m.unidad_base})</option>)}
            </select></td><td><input aria-label="Porcentaje panadero" required type="number" min="0.000001" step="0.000001" value={i.porcentaje} onChange={e => cambiarIngrediente(i.id, { porcentaje: e.target.value })} /></td>
              <td><input aria-label="Harina base" type="checkbox" checked={i.base} onChange={e => cambiarIngrediente(i.id, { base: e.target.checked, micro: "" })} /></td>
              <td><select aria-label="Destino del ingrediente" value={i.micro} disabled={i.base} onChange={e => cambiarIngrediente(i.id, { micro: e.target.value })}><option value="">Directo</option>{micros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></td>
              <td>{!m ? "—" : !m.incluir_en_costeo ? "Excluido del costeo en catálogo" : m.costo_unitario === null ? "Costo pendiente" : `${moneda(m.costo_unitario)} / ${m.unidad_base}`}</td>
              <td><button type="button" aria-label="Quitar ingrediente" disabled={ingredientes.length === 1} onClick={() => setIngredientes(f => f.filter(x => x.id !== i.id))}>Quitar</button></td></tr>
          })}</tbody></table></div>
        <p>Harinas base {base.toLocaleString("es-EC")}% · Total panadero {suma.toLocaleString("es-EC")}%</p>
        <button type="button" className="fm-secundario" onClick={() => setIngredientes(f => [...f, filaIngrediente()])}>Agregar ingrediente</button>
      </fieldset>
      <fieldset className="fm-guardado" disabled={bloqueado}><legend>Empaques por unidad vendible</legend>
        <p>Ingresa la cantidad consumida por funda o presentación de venta, usando la unidad del catálogo.</p>
        {empaques.map(e => <div className="fm-filtros" key={e.id}>
          <label>Empaque<select required value={e.material} onChange={evento => setEmpaques(f => f.map(x => x.id === e.id ? { ...x, material: evento.target.value } : x))}>
            <option value="">Seleccionar empaque</option>{empaquesDisponibles.map(m => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad_base})</option>)}</select></label>
          <label>Cantidad por unidad vendible<input required type="number" min="0.000001" step="0.000001" value={e.cantidad} onChange={evento => setEmpaques(f => f.map(x => x.id === e.id ? { ...x, cantidad: evento.target.value } : x))} /></label>
          <button type="button" className="fm-secundario" onClick={() => setEmpaques(f => f.filter(x => x.id !== e.id))}>Quitar empaque</button>
        </div>)}
        <button type="button" className="fm-secundario" onClick={() => setEmpaques(f => [...f, { id: crypto.randomUUID(), material: "", cantidad: "" }])}>Agregar empaque</button>
      </fieldset>
      <button type="submit" className="fm-principal" disabled={cargando || guardando || !!resultado || !contexto}>{guardando ? "Guardando y costeando…" : pendiente ? "Reintentar guardado" : "Guardar producto y costear fórmula"}</button>
    </form>
  </section>
}
