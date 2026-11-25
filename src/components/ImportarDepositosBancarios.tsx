import { useEffect, useId, useMemo, useRef, useState } from "react"
import { consultarDepositosCobro, importarDepositos, type DepositoCobro, type ImportacionDepositos, type ResultadoImportacionDepositos } from "../repositories/cobrosRepository"
import { estadoMovimientoBancario, leerEstadoProdubanco, nombreBancoProdubanco, type EstadoProdubanco } from "../utils/estadoCuentaProdubanco"

const importe = (valor: number | string) => Number(valor).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mensaje = (e: unknown) => e && typeof e === "object" && "message" in e ? String(e.message) : "No se pudo procesar el estado de cuenta."
const etiquetas = { NUEVO: "Nuevo", DUPLICADO: "Ya registrado", CONFLICTO: "Revisar referencia / importe", EXCLUIDO: "Traspaso propio o reverso", REVISAR: "Ingreso por comprobar" }
function VentanaImportar({ cerrar, alGuardar }: { cerrar: () => void; alGuardar: (r: ResultadoImportacionDepositos) => void }) {
  const dialogo = useRef<HTMLDialogElement>(null), tituloId = useId(), bloqueo = useRef(false)
  const [estado, setEstado] = useState<EstadoProdubanco | null>(null), [existentes, setExistentes] = useState<DepositoCobro[]>([])
  const [seleccion, setSeleccion] = useState(new Set<string>()), [leyendo, setLeyendo] = useState(false), [guardando, setGuardando] = useState(false), [error, setError] = useState("")
  const [pendiente, setPendiente] = useState<ImportacionDepositos | null>(null)
  const ocupado = leyendo || guardando || pendiente !== null
  useEffect(() => { const ventana = dialogo.current, anterior = document.activeElement; ventana?.showModal(); return () => { ventana?.close(); if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus() } }, [])
  const filas = useMemo(() => estado?.movimientos.map(m => ({ ...m, estado: estadoMovimientoBancario(m, estado, existentes, estado.movimientos) })) ?? [], [estado, existentes])
  const elegidas = filas.filter(m => seleccion.has(m.id) && ["NUEVO", "REVISAR"].includes(m.estado))
  const total = elegidas.reduce((s, m) => s + Math.round(Number(m.monto) * 100), 0)
  async function leer(archivo: File | undefined) {
    if (!archivo || bloqueo.current) return
    bloqueo.current = true; setLeyendo(true); setError(""); setEstado(null); setSeleccion(new Set())
    try {
      const [datos, registros] = await Promise.all([leerEstadoProdubanco(archivo), consultarDepositosCobro()])
      setEstado(datos); setExistentes(registros)
      setSeleccion(new Set(datos.movimientos.filter(m => estadoMovimientoBancario(m, datos, registros, datos.movimientos) === "NUEVO").map(m => m.id)))
    } catch (fallo) { setError(mensaje(fallo)) } finally { bloqueo.current = false; setLeyendo(false) }
  }
  async function actualizar() {
    if (bloqueo.current || pendiente) return; bloqueo.current = true; setLeyendo(true); setError("")
    try { setExistentes(await consultarDepositosCobro()) } catch (e) { setError(mensaje(e)) } finally { bloqueo.current = false; setLeyendo(false) }
  }
  async function guardar() {
    if (!estado || bloqueo.current || (!pendiente && !elegidas.length)) return
    const solicitud = pendiente ?? { operacion: crypto.randomUUID(), archivo: estado.archivo, huella: estado.huella, cuenta: estado.cuenta, tipo: estado.tipo,
      filas: elegidas.map(m => ({ id: m.id, fecha: m.fecha, referencia: m.referencia, monto: m.monto, ordenante: m.ordenante, observaciones: m.observaciones })) }
    bloqueo.current = true; setGuardando(true); setPendiente(solicitud); setError("")
    try { const resultado = await importarDepositos(solicitud); setPendiente(null); alGuardar(resultado); cerrar() }
    catch (fallo) { if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null); setError(mensaje(fallo)) }
    finally { bloqueo.current = false; setGuardando(false) }
  }
  return <dialog ref={dialogo} className="cxc-ventana cxc-importacion" aria-labelledby={tituloId} onCancel={e => { e.preventDefault(); if (!ocupado) cerrar() }}>
    <header><h2 id={tituloId}>Importar estado de cuenta</h2><button type="button" aria-label="Cerrar importación" disabled={ocupado} onClick={cerrar}>×</button></header>
    <p>Selecciona el Excel (.xlsx) de Produbanco. Revisa los ingresos y confirma cuáles guardar como depósitos pendientes de identificar.</p>
    <label>Archivo del banco <input aria-label="Estado de cuenta de Produbanco" type="file" accept=".xlsx" disabled={ocupado} onChange={e => { const archivo = e.target.files?.[0]; e.target.value = ""; void leer(archivo) }} /></label>
    {leyendo && <p role="status">Leyendo archivo y comprobando duplicados…</p>}
    {estado && <>
      <p><strong>{estado.archivo}</strong><br />{nombreBancoProdubanco(estado.cuenta, estado.tipo)} · Del {estado.desde} al {estado.hasta}</p>
      <label>Tipo de cuenta <select aria-label="Tipo de cuenta del estado" disabled={ocupado} value={estado.tipo} onChange={e => { const tipo = e.target.value as EstadoProdubanco["tipo"]; const datos = { ...estado, tipo }; setEstado(datos); setSeleccion(new Set(datos.movimientos.filter(m => estadoMovimientoBancario(m, datos, existentes, datos.movimientos) === "NUEVO").map(m => m.id))) }}><option value="CORRIENTE">Corriente</option><option value="AHORROS">Ahorros</option></select></label>
      <p>{elegidas.length} seleccionados · USD {importe(total / 100)} · {filas.filter(f => f.estado === "DUPLICADO").length} ya registrados · {estado.debitos} débitos / movimientos sin ingreso omitidos.</p>
      <p>Los traspasos propios y reversos quedan excluidos. Las referencias con importe distinto no se sobrescriben. Los ingresos desconocidos requieren que los marques después de comprobarlos.</p>
      <fieldset disabled={ocupado} className="cxc-importacion-campos"><div className="compras-sri-contenedor cxc-scroll"><table className="compras-sri-tabla" aria-label="Vista previa de depósitos"><thead><tr><th>Elegir</th><th>Fecha</th><th>Referencia</th><th>Importe USD</th><th>Concepto bancario</th><th>Estado</th></tr></thead><tbody>
        {filas.map((m, i) => <tr key={`${m.id}:${i}`}><td><input type="checkbox" aria-label={`Importar referencia ${m.referencia} fila ${m.fila}`} disabled={!["NUEVO", "REVISAR"].includes(m.estado)} checked={seleccion.has(m.id) && ["NUEVO", "REVISAR"].includes(m.estado)} onChange={e => setSeleccion(actual => { const nuevo = new Set(actual); if (e.target.checked) nuevo.add(m.id); else nuevo.delete(m.id); return nuevo })} /></td><td>{m.fecha}</td><td>{m.referencia}</td><td>{importe(m.monto)}</td><td>{m.causal}</td><td>{etiquetas[m.estado]}</td></tr>)}
      </tbody></table></div></fieldset>
      <div className="fin-pagos-filtros"><button type="button" disabled={ocupado} onClick={() => setSeleccion(new Set(filas.filter(f => f.estado === "NUEVO").map(f => f.id)))}>Elegir nuevos</button><button type="button" disabled={ocupado} onClick={() => setSeleccion(new Set())}>Desmarcar todos</button><button type="button" disabled={ocupado} onClick={() => void actualizar()}>Actualizar comprobación</button></div>
    </>}
    {error && <p role="alert" className="compras-sri-error">{error}</p>}
    <div className="fin-pagos-filtros"><button type="button" disabled={guardando || leyendo || (!pendiente && (!elegidas.length || elegidas.length > 2000))} onClick={() => void guardar()}>{guardando ? "Importando…" : pendiente ? "Reintentar importación" : "Confirmar importación"}</button>
      <button type="button" disabled={ocupado} onClick={cerrar}>Cancelar</button></div>
    {pendiente && !guardando && <p>La respuesta no se pudo confirmar. Reintenta la misma importación; los depósitos no se duplicarán.</p>}
  </dialog>
}
export default function ImportarDepositosBancarios({ alGuardar, deshabilitado }: { alGuardar: (r: ResultadoImportacionDepositos) => void; deshabilitado: boolean }) {
  const [abierto, setAbierto] = useState(false)
  return <><button type="button" disabled={deshabilitado} onClick={() => setAbierto(true)}>Importar estado de cuenta</button>{abierto && <VentanaImportar cerrar={() => setAbierto(false)} alGuardar={alGuardar} />}</>
}
