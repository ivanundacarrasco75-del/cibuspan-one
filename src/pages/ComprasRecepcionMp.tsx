import { useEffect, useRef, useState } from "react"
import type { FacturaSri } from "../utils/comprasSri"
import {
  estadoRecepcionCompra, confirmarRecepcionCompra,
  type EstadoRecepcion, type SolicitudRecepcion,
} from "../repositories/comprasRecepcionRepository"
import "./comprasRecepcionMp.css"
import { cantidadRecibidaCompra, proponerRecepcionCompra } from "../utils/comprasRecepcionAutomatica"

const mensaje = (e: unknown) => e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo consultar la recepción."
type Linea = { articulo: string; cantidad: string; explicacion: string }

export default function ComprasRecepcionMp({ factura, fechaFactura = factura.fecha }: { factura: FacturaSri; fechaFactura?: string }) {
  const [estado, setEstado] = useState<EstadoRecepcion | null>(null)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [fecha, setFecha] = useState(fechaFactura)
  const [lineas, setLineas] = useState<Linea[]>(() => factura.items.map(() => ({ articulo: "", cantidad: "", explicacion: "" })))
  const [confirmado, setConfirmado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [incierta, setIncierta] = useState<SolicitudRecepcion | null>(null)
  const ocupado = useRef(false)

  useEffect(() => {
    let vigente = true
    setError("")
    void estadoRecepcionCompra(factura.clave).then(e => {
      if (vigente) {
        setEstado(e)
        setLineas(proponerRecepcionCompra(factura.items.map((item, i) => ({ ...item,
          unidad: item.unidad || e.facturaXml?.items[i]?.unidad })), e.articulos))
      }
    })
      .catch(e => { if (vigente) setError(mensaje(e)) })
    return () => { vigente = false }
  }, [factura.clave, revision])

  const elegidas = lineas.flatMap((l, i) => l.articulo ? [{ linea: i, articulo_id: l.articulo, cantidad: Number(l.cantidad.replace(",", ".")) }] : [])
  const cantidadesValidas = elegidas.length > 0 && elegidas.every(l => Number.isFinite(l.cantidad) && l.cantidad > 0
    && Math.abs(l.cantidad * 1e6 - Math.round(l.cantidad * 1e6)) < 0.00001
    && estado?.articulos.find(a => a.id === l.articulo_id)?.iniciado)

  async function guardar() {
    if (ocupado.current || !estado || (!incierta && (!confirmado || !fecha || !cantidadesValidas))) return
    ocupado.current = true; setGuardando(true); setError("")
    const solicitud = incierta ?? { p_clave: factura.clave, p_version: estado.version, p_fecha: fecha,
      p_lineas: elegidas, p_solicitud: crypto.randomUUID() }
    // Conserva el mismo contenido e identificador si se pierde la respuesta.
    setIncierta(solicitud)
    try {
      const recepcion = await confirmarRecepcionCompra(solicitud)
      setEstado({ ...estado, recepcion }); setIncierta(null)
    } catch (e) {
      setError(mensaje(e))
      if (e && typeof e === "object" && "incierto" in e && !e.incierto) setIncierta(null)
    } finally { ocupado.current = false; setGuardando(false) }
  }

  function cambiar(indice: number, cambio: Partial<Linea>) {
    setLineas(actual => actual.map((l, i) => i === indice ? { ...l, ...cambio } : l))
    setConfirmado(false)
  }

  return <section className="compras-recepcion" aria-label="Recepción de materias primas">
    <h3>Ingreso al Kardex de MP</h3>
    {error && <p role="alert">{error} {!estado && <button type="button" onClick={() => setRevision(r => r + 1)}>Reintentar consulta</button>}</p>}
    {!estado && !error && <p role="status">Consultando recepción…</p>}
    {estado?.recepcion ? <>
      <p role="status">Recepción registrada · {estado.recepcion.fecha}. Las entradas ya constan en el Kardex de MP.</p>
      <ul>{estado.recepcion.movimientos.map(m => <li key={m.movimiento_id}>
        {m.nombre} · {m.cantidad} {m.unidad} · Movimiento {m.movimiento_id}
      </li>)}</ul>
    </> : estado && !estado.puede ? <p>Necesitas permiso de inventario de materias primas para registrar la recepción.</p>
      : estado && <>
        <p>La fecha parte de la factura. Los productos y las cantidades reconocidos se completan automáticamente.
          Revisa la propuesta y corrige solo lo que cambie en la recepción. Los servicios y conceptos sin artículo seleccionado no ingresan al inventario.</p>
        {factura.clave.startsWith("excel:") && <p>El Excel no incluye cantidades físicas. Completa la cantidad real con el documento o la recepción de bodega.</p>}
        <fieldset disabled={guardando || !!incierta}>
          <label>Fecha de recepción <input aria-label="Fecha de recepción" type="date" value={fecha}
            onChange={e => { setFecha(e.target.value); setConfirmado(false) }} /></label>
          <div className="compras-recepcion-tabla"><table><thead><tr>
            <th>Detalle de factura</th><th>Cant. facturada</th><th>Artículo del Kardex</th><th>Cant. recibida</th><th>Unidad</th>
          </tr></thead><tbody>{factura.items.map((item, i) => {
            const articulo = estado.articulos.find(a => a.id === lineas[i].articulo)
            return <tr key={i}><td>{item.descripcion}</td><td>{item.cantidad
              ? [item.cantidad, item.unidad || estado.facturaXml?.items[i]?.unidad].filter(Boolean).join(" ") : "Pendiente"}</td>
              <td><select aria-label={`Artículo de ${item.descripcion}`} value={lineas[i].articulo} onChange={e => cambiar(i, {
                articulo: e.target.value,
                ...cantidadRecibidaCompra({ ...item, unidad: item.unidad || estado.facturaXml?.items[i]?.unidad },
                  estado.articulos.find(a => a.id === e.target.value) ?? null),
              })}>
                <option value="">No ingresa al inventario</option>
                {estado.articulos.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}{a.iniciado ? "" : " · Falta saldo inicial"}</option>)}
              </select></td>
              <td><input aria-label={`Cantidad recibida de ${item.descripcion}`} inputMode="decimal" value={lineas[i].cantidad}
                disabled={!articulo} onChange={e => cambiar(i, { cantidad: e.target.value, explicacion: "Cantidad ajustada manualmente." })} />
                <small>{lineas[i].explicacion}</small></td>
              <td>{articulo?.unidad ?? "—"}{articulo && !articulo.iniciado && <span> · Carga primero el saldo inicial en Kardex.</span>}</td></tr>
          })}</tbody></table></div>
          <label className="compras-recepcion-confirmar"><input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />
            Confirmo la recepción completa de los materiales seleccionados, sus unidades y cantidades, y que aún no se ingresaron al Kardex.
          </label>
          <p>Se registra una recepción por factura. No confirmes entregas parciales ni compras ya incluidas en una toma física posterior a su recepción.</p>
        </fieldset>
        <button type="button" disabled={guardando || (!incierta && (!fecha || !cantidadesValidas || !confirmado))}
          onClick={() => void guardar()}>{guardando ? "Registrando…" : incierta ? "Verificar / reintentar recepción" : "Confirmar entrada al Kardex"}</button>
      </>}
  </section>
}
