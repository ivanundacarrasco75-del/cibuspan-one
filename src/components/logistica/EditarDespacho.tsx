import { useEffect, useRef, useState } from "react"
import { obtenerEditorDespachoDb, type DatosEditorDespacho } from "../../repositories/edicionDespachoRepository"
import { preverLogisticaDb } from "../../repositories/logisticaSeguraRepository"
import type { useLogisticaSegura } from "../../hooks/useLogisticaSegura"
import type { DatosCorreccionDespacho, ResultadoLogistica } from "../../utils/operacionLogisticaSegura"
type Linea = { detalleId: string; loteId: string; manejo: string; original: boolean }
export default function EditarDespacho({ reservaId, pedidoId, control, bloqueado, onOcupado, onGuardado }: {
  reservaId: string; pedidoId: string; control: ReturnType<typeof useLogisticaSegura>; bloqueado: boolean
  onOcupado: (b: boolean) => void; onGuardado: (r: ResultadoLogistica) => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false), [datos, setDatos] = useState<DatosEditorDespacho | null>(null), [lineas, setLineas] = useState<Linea[]>([])
  const [motivo, setMotivo] = useState(""), [error, setError] = useState(""), [cargando, setCargando] = useState(false), [guardando, setGuardando] = useState(false)
  const envio = useRef(false), lectura = useRef(0)
  useEffect(() => () => { lectura.current++ }, [])
  async function abrir() {
    if (bloqueado || envio.current || cargando) return
    const n = ++lectura.current; setAbierto(true); setCargando(true); setError(""); setDatos(null); setMotivo("")
    try {
      const d = await obtenerEditorDespachoDb(reservaId, pedidoId)
      if (n !== lectura.current) return
      const agrupadas = new Map<string, Linea>()
      for (const a of d.asignaciones) {
        const detalle = d.detalles.find(x => x.id === a.pedido_detalle_id)
        if (!detalle || detalle.unidades_manejo <= 0) throw new Error("Revisa la unidad de manejo del despacho antes de editar.")
        const clave = `${a.pedido_detalle_id}:${a.inventario_lote_id}`, anterior = agrupadas.get(clave)
        agrupadas.set(clave, { detalleId: a.pedido_detalle_id, loteId: a.inventario_lote_id, manejo: String(Number(anterior?.manejo ?? 0) + a.unidades / detalle.unidades_manejo), original: true })
      }
      setDatos(d); setLineas([...agrupadas.values()])
    } catch (e) { if (n === lectura.current) setError((e as Error).message) }
    finally { if (n === lectura.current) setCargando(false) }
  }
  function cancelar() { if (guardando || envio.current || bloqueado) return; lectura.current++; setAbierto(false); setDatos(null); setLineas([]); setMotivo(""); setError(""); setCargando(false) }
  async function guardar() {
    if (!datos || bloqueado || envio.current) return
    envio.current = true; setGuardando(true); onOcupado(true); setError("")
    try {
      const propuesta: DatosCorreccionDespacho = { reservaId, motivo, lineas: lineas.map(l => {
        const detalle = datos.detalles.find(d => d.id === l.detalleId), n = Number(l.manejo)
        if (!detalle || !l.loteId || !l.manejo.trim() || !Number.isSafeInteger(n) || n < 0) throw new Error("Completa lotes y cantidades enteras en gavetas/cajas; escribe cero donde corresponda.")
        return { pedidoDetalleId: l.detalleId, inventarioLoteId: l.loteId, unidades: n * detalle.unidades_manejo }
      }) }
      const revision = await preverLogisticaDb("CORREGIR", propuesta)
      if (revision.pedido_id !== pedidoId || revision.reserva_id !== reservaId) throw new Error("El despacho cambió. Actualiza antes de corregir.")
      if (!revision.puede_ejecutar) throw new Error(revision.bloqueos.join(" "))
      if (!window.confirm(`¿Guardar la corrección del despacho?\n\nAntes: ${revision.unidades_anteriores} unidades\nCorregido: ${revision.unidades} unidades\nStock a restituir: ${revision.entrada_stock}\nStock adicional a descontar: ${revision.salida_stock}\n\nMotivo: ${motivo.trim()}\n\nEl pedido seguirá cerrado. La corrección quedará registrada en el historial.`)) return
      const r = await control.ejecutar("CORREGIR", propuesta, revision)
      await onGuardado(r)
    } catch (e) { setError((e as Error).message) }
    finally { envio.current = false; setGuardando(false); onOcupado(false) }
  }
  if (!abierto) return <button type="button" disabled={bloqueado} onClick={() => void abrir()}>Editar despacho</button>
  const deshabilitado = bloqueado || guardando || cargando
  return <section aria-label="Corregir despacho" style={{ background: "#f7fafc", border: "1px solid #bbcbd5", borderRadius: 10, padding: 16, marginTop: 16 }}>
    <h3>Editar despacho</h3>
    <p>Corrige las cantidades registradas. El pedido seguirá cerrado y el inventario cambiará sólo por la diferencia. Si agregas unidades, confirma el lote que realmente salió.</p>
    {cargando && <p role="status">Cargando cantidades y lotes… <button type="button" disabled={bloqueado} onClick={cancelar}>Salir sin guardar</button></p>}
    {datos && <>
      {datos.detalles.map(d => <div key={d.id} style={{ marginBottom: 18 }}>
        <h4>{d.codigo} · {d.nombre}</h4><p>Pedido: {d.total_unidades} unidades · Despachado: {d.unidades_despachadas} · Unidad de manejo: {d.unidades_manejo}</p>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left" }}><thead><tr><th>Lote real</th><th>Gavetas / cajas correctas</th><th>Unidades</th></tr></thead><tbody>
          {lineas.map((l, indice) => l.detalleId !== d.id ? null : <tr key={indice}>
            <td>{l.original ? <span>{datos.lotes.find(i => i.id === l.loteId)?.lote || l.loteId} · vence {datos.lotes.find(i => i.id === l.loteId)?.fecha_vencimiento}</span> : <select aria-label={`Lote real de ${d.nombre}`} value={l.loteId} disabled={deshabilitado} onChange={e => setLineas(a => a.map((x, n) => n === indice ? { ...x, loteId: e.target.value } : x))}>
              <option value="">Selecciona el lote que salió</option>
              {datos.lotes.filter(i => i.producto_id === d.producto_id && !i.inv_archivo_id && !lineas.some((x, n) => n !== indice && x.detalleId === d.id && x.loteId === i.id)).map(i => <option key={i.id} value={i.id}>{i.lote} · vence {i.fecha_vencimiento} · disponible {i.disponible}</option>)}
            </select>}</td>
            <td><input aria-label={`Cantidad correcta de ${d.nombre}, lote ${l.loteId || "nuevo"}`} type="number" inputMode="numeric" min={0} step={1} value={l.manejo} disabled={deshabilitado} onChange={e => setLineas(a => a.map((x, n) => n === indice ? { ...x, manejo: e.target.value } : x))} />{!l.original && <button type="button" disabled={deshabilitado} onClick={() => setLineas(a => a.filter((_, n) => n !== indice))}>Quitar</button>}</td>
            <td>{Number.isFinite(Number(l.manejo)) ? Number(l.manejo) * d.unidades_manejo : "—"}</td>
          </tr>)}
        </tbody></table></div>
        <button type="button" disabled={deshabilitado} onClick={() => setLineas(a => [...a, { detalleId: d.id, loteId: "", manejo: "0", original: false }])}>Añadir lote a este SKU</button>
      </div>)}
      <label>Motivo del error de registro<textarea value={motivo} minLength={8} maxLength={1000} disabled={deshabilitado} onChange={e => setMotivo(e.target.value)} style={{ display: "block", width: "100%", minHeight: 65 }} /></label>
      <p><button type="button" disabled={deshabilitado} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Revisar y guardar corrección"}</button>{" "}<button type="button" disabled={bloqueado || guardando} onClick={cancelar}>Salir sin guardar</button></p>
      {datos.historial.length > 0 && <details><summary>Correcciones anteriores ({datos.historial.length})</summary>{datos.historial.map(h => <p key={h.solicitud_id}>{new Date(h.creado_en).toLocaleString("es-EC")} · {h.responsable || "Usuario registrado"} · {h.antes} → {h.despues} unidades · {h.motivo}</p>)}</details>}
    </>}
    {error && <p role="alert">{error}</p>}
    {!datos && !cargando && <p><button type="button" disabled={bloqueado} onClick={() => void abrir()}>Volver a cargar</button>{" "}<button type="button" disabled={bloqueado} onClick={cancelar}>Salir sin guardar</button></p>}
  </section>
}
