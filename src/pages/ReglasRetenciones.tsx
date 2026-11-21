import { useEffect, useRef, useState, type FormEvent } from "react"
import { CUENTAS_POR_PAGINA, listarCuentasCompra, type CuentaCompra } from "../repositories/finanzasComprasRepository"
import { anularRetencion, aplicarRetencion, listarReglasRetencion, listarRetenciones, listarPerfilesRetencionIva,
  type ReglaRetencion, type RetencionDocumento, type SolicitudRetencion } from "../repositories/retencionesRepository"
import "./comprasSriTabla.css"
import "./finanzasPagosCompras.css"
import "./retenciones.css"
import SugerenciaRetencionIva from "../components/SugerenciaRetencionIva"
import type { PerfilRetencionIva } from "../utils/sugerenciasRetencionIva"

const hoy = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format()
const dinero = (valor: number) => Number(valor).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const centavos = (valor: number | string) => Math.round(Number(valor) * 100)
const textoError = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo completar la operación."
const fuenteIR = "https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar?id=76ba02f0-718a-41b7-a54a-7e0f5615808a&nombre=NAC-DGERCGC26-00000009.pdf"
const fuenteIVA = "https://www.sri.gob.ec/normativa-para-agentes-de-retencion-y-contribuyentes-especiales"

function RetencionFactura({ cuenta, reglas, alActualizar, perfil }: {
  cuenta: CuentaCompra; reglas: ReglaRetencion[]; alActualizar: () => void; perfil?: PerfilRetencionIva
}) {
  const [fecha, setFecha] = useState(hoy)
  const [regimen, setRegimen] = useState("")
  const [especial, setEspecial] = useState(false)
  const [comprobante, setComprobante] = useState("")
  const [motivo, setMotivo] = useState("")
  const [confirmado, setConfirmado] = useState(false)
  const [lineas, setLineas] = useState<{ impuesto: "RENTA" | "IVA"; regla: string; base: string; valor?: string }[]>([
    { impuesto: "RENTA", regla: "", base: Number(cuenta.subtotal ?? 0).toFixed(2) },
    { impuesto: "IVA", regla: "", base: Number(cuenta.iva ?? 0).toFixed(2) },
  ])
  const [historial, setHistorial] = useState<RetencionDocumento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [pendiente, setPendiente] = useState<SolicitudRetencion | null>(null)
  const [anulacion, setAnulacion] = useState("")
  const [anularConfirmado, setAnularConfirmado] = useState(false)
  const operacion = useRef(crypto.randomUUID())
  const ocupado = useRef(false)
  useEffect(() => {
    let vigente = true
    void listarRetenciones(cuenta.id).then(filas => { if (vigente) setHistorial(filas) })
      .catch(fallo => { if (vigente) setError(textoError(fallo)) }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [cuenta.id])
  const activa = historial.find(fila => fila.estado === "ACTIVA")
  const bloqueado = cargando || guardando || pendiente !== null
  const totalCentavos = lineas.reduce((suma, linea) => {
    const regla = reglas.find(fila => fila.id === linea.regla)
    return suma + (linea.valor !== undefined ? centavos(linea.valor) : Math.round(centavos(linea.base) * Number(regla?.porcentaje ?? 0) / 100))
  }, 0)
  // Un XML no descontaba la columna antigua; Excel/manual ya incorporaban su neto.
  const retencionPrevia = cuenta.origen === "SRI" ? 0 : Math.max(0, centavos(cuenta.total ?? 0) - centavos(cuenta.neto ?? 0))
  const nuevoSaldo = centavos(cuenta.neto ?? 0) + retencionPrevia - totalCentavos - centavos(cuenta.pagado)

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (ocupado.current) return
    const solicitud = pendiente ?? { id: operacion.current, documento: cuenta.id, fecha, regimen, especial, comprobante, motivo,
      lineas: lineas.map(({ regla, base, valor }) => ({ regla, base, ...(valor !== undefined ? { valor } : {}) })), confirmado }
    ocupado.current = true; setGuardando(true); setError(""); setPendiente(solicitud)
    try {
      await aplicarRetencion(solicitud)
      alActualizar()
    } catch (fallo) {
      if (fallo && typeof fallo === "object" && "rechazado" in fallo && fallo.rechazado) setPendiente(null)
      setError(textoError(fallo))
    } finally { ocupado.current = false; setGuardando(false) }
  }
  async function anular(evento: FormEvent) {
    evento.preventDefault()
    if (!activa || ocupado.current) return
    ocupado.current = true; setGuardando(true); setError("")
    try { await anularRetencion(activa.id, anulacion); alActualizar() }
    catch (fallo) { setError(textoError(fallo)) }
    finally { ocupado.current = false; setGuardando(false) }
  }
  return <section className="retenciones-documento">
    <h2>{cuenta.numero_documento} · {cuenta.proveedor}</h2>
    <p>Subtotal USD {dinero(Number(cuenta.subtotal))} · IVA USD {dinero(Number(cuenta.iva))} · Total USD {dinero(Number(cuenta.total))} · Saldo actual USD {dinero(Number(cuenta.saldo))}</p>
    {!activa && <div className="retenciones-historial-aviso">
      <SugerenciaRetencionIva perfil={perfil} ruc={cuenta.ruc} fecha={cuenta.fecha_documento} iva={cuenta.iva}
        notaVenta={cuenta.tipo === "NOTA_VENTA"} descuentoIncluido={Number(cuenta.total) > Number(cuenta.neto)} />
      <p>Selecciona abajo la regla que corresponde al concepto y verifica la condición actual del proveedor. Renta no se infiere de este historial.</p>
    </div>}
    {cargando ? <p>Cargando retenciones…</p> : activa ? <>
      <p><strong>Retención registrada: USD {dinero(activa.total)}</strong> · {activa.fecha} · Comprobante {activa.comprobante || "sin importe"}</p>
      <p>{activa.motivo}</p>
      <div className="compras-sri-contenedor"><table className="compras-sri-tabla"><thead><tr><th>Impuesto</th><th>Concepto</th><th>Base</th><th>%</th><th>Retenido</th></tr></thead>
        <tbody>{activa.lineas.map((linea, indice) => <tr key={indice}><td>{linea.impuesto}</td><td>{linea.concepto}</td><td>{dinero(linea.base)}</td><td>{linea.porcentaje}</td><td>{dinero(linea.valor)}{linea.ajuste_manual && <small> · Ajustado; cálculo original {dinero(Number(linea.valor_calculado))}</small>}</td></tr>)}</tbody></table></div>
      <form onSubmit={anular} className="retenciones-anular">
        <label>Motivo de anulación <input required minLength={5} maxLength={500} disabled={guardando} value={anulacion} onChange={evento => setAnulacion(evento.target.value)} /></label>
        <label><input type="checkbox" required checked={anularConfirmado} disabled={guardando} onChange={evento => setAnularConfirmado(evento.target.checked)} /> Confirmo que corresponde revertir este descuento en CIBUSPAN. La anulación del comprobante ante el SRI se gestiona por separado.</label>
        <button disabled={guardando || !anularConfirmado}>Anular registro de retención</button>
      </form>
    </> : <form onSubmit={guardar}>
      <fieldset disabled={bloqueado}>
        <div className="fin-pagos-filtros">
          <label>Fecha de retención <input required type="date" min={cuenta.fecha_documento ?? undefined} value={fecha} onChange={evento => evento.target.value && setFecha(evento.target.value)} /></label>
          <label>Régimen del proveedor <select aria-label="Régimen del proveedor" required value={regimen} onChange={evento => { setRegimen(evento.target.value); setLineas(actual => actual.map(linea => ({ ...linea, regla: "", valor: undefined }))) }}>
            <option value="">Seleccionar</option><option value="GENERAL">General / actividad fuera de RIMPE</option><option value="RIMPE_EMPRENDEDOR">RIMPE Emprendedor</option><option value="RIMPE_POPULAR">RIMPE Negocio Popular</option>
          </select></label>
          <label><input type="checkbox" checked={especial} onChange={evento => { setEspecial(evento.target.checked); setLineas(actual => actual.map(linea => linea.impuesto === "IVA" ? { ...linea, regla: "", valor: undefined } : linea)) }} /> Proveedor contribuyente especial</label>
        </div>
        <div className="compras-sri-contenedor"><table className="compras-sri-tabla retenciones-lineas"><thead><tr><th>Impuesto</th><th>Regla</th><th>Base USD</th><th>%</th><th>Retenido USD</th><th /></tr></thead>
          <tbody>{lineas.map((linea, indice) => {
            const impuesto = linea.impuesto
            const disponibles = reglas.filter(regla => regla.impuesto === impuesto && regla.desde <= fecha && (!regla.hasta || regla.hasta >= fecha)
              && !(regimen === "RIMPE_POPULAR" && regla.porcentaje > 0) && !(especial && impuesto === "IVA" && regla.porcentaje > 0)
              && !(impuesto === "RENTA" && (regimen === "RIMPE_EMPRENDEDOR" ? !["IR_RIMPE_2026", "IR_NO_APLICA"].includes(regla.id) : regla.id === "IR_RIMPE_2026")))
            const regla = disponibles.find(fila => fila.id === linea.regla)
            const calculado = Math.round(centavos(linea.base) * Number(regla?.porcentaje ?? 0) / 100) / 100
            return <tr key={indice}><td>{impuesto}</td><td><select aria-label={`Regla ${impuesto} ${indice + 1}`} required value={linea.regla} onChange={evento => setLineas(actual => actual.map((fila, n) => n === indice ? { ...fila, regla: evento.target.value, valor: undefined } : fila))}>
              <option value="">Seleccionar regla vigente</option>{disponibles.map(fila => <option key={fila.id} value={fila.id}>{fila.concepto} · {fila.porcentaje}%</option>)}</select></td>
              <td><input aria-label={`Base ${impuesto} ${indice + 1}`} required type="number" min="0" step="0.01" max={impuesto === "IVA" ? Number(cuenta.iva) : Number(cuenta.subtotal)} value={linea.base}
                onChange={evento => setLineas(actual => actual.map((fila, n) => n === indice ? { ...fila, base: evento.target.value, valor: undefined } : fila))} /></td>
              <td>{regla?.porcentaje ?? "—"}</td><td><input aria-label={`Retenido ${impuesto} ${indice + 1}`} type="number" min="0" step="0.01" required
                max={regla?.porcentaje === 0 ? 0 : impuesto === "IVA" ? Number(linea.base) : Math.round(centavos(linea.base) * 0.1) / 100}
                value={linea.valor ?? calculado.toFixed(2)} disabled={!regla}
                onChange={evento => setLineas(actual => actual.map((fila, n) => n === indice ? { ...fila, valor: evento.target.value } : fila))} />
                {linea.valor !== undefined && <button type="button" onClick={() => setLineas(actual => actual.map((fila, n) => n === indice ? { ...fila, valor: undefined } : fila))}>Usar calculado</button>}</td>
              <td>{indice > 1 && <button type="button" onClick={() => setLineas(actual => actual.filter((_, n) => n !== indice))}>Quitar</button>}</td></tr>
          })}</tbody></table></div>
        <div className="fin-pagos-filtros">
          <button type="button" onClick={() => setLineas(actual => [...actual, { impuesto: "RENTA", regla: "", base: "" }])}>Agregar otra base de renta</button>
          <button type="button" onClick={() => setLineas(actual => [...actual, { impuesto: "IVA", regla: "", base: "" }])}>Agregar otra base de IVA</button>
        </div>
        <p>Retención total: <strong>USD {dinero(totalCentavos / 100)}</strong> · Saldo resultante: <strong>USD {dinero(nuevoSaldo / 100)}</strong></p>
        <p>El importe retenido es editable. Si corriges el cálculo, explica el ajuste en el motivo; se conservarán ambos valores en el detalle.</p>
        <p>La renta se calcula sobre la base sin IVA; la retención de IVA, sobre el impuesto. Si ya había una retención incluida en el neto, este registro la sustituye. La fecha corresponde al pago o crédito en cuenta, lo que ocurra primero.</p>
        <div className="fin-pagos-filtros">
          <label>Comprobante de retención emitido <input required={totalCentavos > 0} maxLength={100} value={comprobante} onChange={evento => setComprobante(evento.target.value)} /></label>
          <label>Concepto / motivo de no retener <input required maxLength={500} value={motivo} onChange={evento => setMotivo(evento.target.value)} /></label>
        </div>
        <label><input required type="checkbox" checked={confirmado} onChange={evento => setConfirmado(evento.target.checked)} /> Verifiqué el régimen del proveedor, la fecha, las bases y los supuestos de las reglas elegidas.</label>
      </fieldset>
      <button disabled={guardando || cargando || nuevoSaldo < 0}>{guardando ? "Guardando…" : pendiente ? "Reintentar registro" : "Registrar retención y actualizar saldo"}</button>
    </form>}
    {error && <p role="alert" className="compras-sri-error">{error}</p>}
    {historial.filter(fila => fila.estado === "ANULADA").map(fila => <p key={fila.id}>Registro anulado: {fila.fecha} · {fila.comprobante} · USD {dinero(fila.total)}</p>)}
  </section>
}

export default function ReglasRetenciones() {
  const [reglas, setReglas] = useState<ReglaRetencion[]>([])
  const [perfiles, setPerfiles] = useState<PerfilRetencionIva[]>([])
  const [buscar, setBuscar] = useState("")
  const [filtro, setFiltro] = useState("")
  const [tipo, setTipo] = useState("SRI")
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<CuentaCompra[]>([])
  const [total, setTotal] = useState(0)
  const [cuenta, setCuenta] = useState<CuentaCompra | null>(null)
  const [revision, setRevision] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  useEffect(() => {
    let vigente = true
    setCargando(true); setError("")
    void Promise.all([listarReglasRetencion(), listarCuentasCompra(pagina, tipo, filtro, false), listarPerfilesRetencionIva()]).then(([catalogo, documentos, historial]) => {
      if (vigente) { setReglas(catalogo); setFilas(documentos.cuentas); setTotal(documentos.total); setPerfiles(historial) }
    }).catch(fallo => { if (vigente) setError(textoError(fallo)) }).finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [pagina, tipo, filtro, revision])
  return <main className="compras-sri-pagina fin-pagos retenciones-pagina">
    <h1>Reglas de retenciones</h1>
    <p>CIBUSPAN: agente de retención. Selecciona el documento y las reglas que corresponden al proveedor. Este registro calcula el neto; no emite ni autoriza comprobantes ante el SRI.</p>
    {mensaje && <p role="status">{mensaje}</p>}
    {error && <p role="alert" className="compras-sri-error">{error}</p>}
    <details><summary>Consultar reglas de casos frecuentes y su vigencia</summary>
      <p><a href={fuenteIR} target="_blank" rel="noreferrer">Resolución de renta 2026</a> · <a href={fuenteIVA} target="_blank" rel="noreferrer">Cuadro y normativa del SRI para agentes</a>. Para casos no incluidos, revisa el tratamiento antes de descontar.</p>
      <div className="compras-sri-contenedor"><table className="compras-sri-tabla"><thead><tr><th>Impuesto</th><th>Concepto</th><th>%</th><th>Desde</th><th>Hasta</th><th>Fuente</th></tr></thead>
        <tbody>{reglas.map(regla => <tr key={regla.id}><td>{regla.impuesto}</td><td>{regla.concepto}</td><td>{regla.porcentaje}</td><td>{regla.desde}</td><td>{regla.hasta || "Vigente"}</td><td>{regla.fuente}</td></tr>)}</tbody></table></div>
    </details>
    <details className="retenciones-perfiles"><summary>Reglas sugeridas del historial: {perfiles.length} proveedores</summary>
      <p>Se vinculan por RUC exacto. Las tasas positivas uniformes en al menos tres facturas sirven como sugerencia de IVA. Los ceros, variaciones y muestras insuficientes requieren revisión. No son comprobantes emitidos ni descuentos aplicados.</p>
      <div className="compras-sri-contenedor"><table className="compras-sri-tabla"><thead><tr><th>RUC</th><th>Proveedor</th><th>Con IVA</th><th>Sin retención</th><th>30%</th><th>70%</th><th>100%</th><th>Sugerencia</th><th>Fuente</th></tr></thead>
        <tbody>{perfiles.map(perfil => <tr key={perfil.ruc}><td>{perfil.ruc}</td><td title={perfil.proveedor}>{perfil.proveedor}</td><td>{perfil.con_iva}</td><td>{perfil.sin_retencion}</td>
          <td>{perfil.al_30}</td><td>{perfil.al_70}</td><td>{perfil.al_100}</td><td>{perfil.porcentaje_sugerido !== null ? `${perfil.porcentaje_sugerido}% · por confirmar` : perfil.estado === "VARIABLE" ? "Varía por operación" : perfil.estado === "INSUFICIENTE" ? "Pocas muestras" : perfil.estado === "REVISAR_CERO" ? "Revisar condición actual" : "Historial sin IVA"}</td>
          <td>{perfil.archivo} · hasta {perfil.hasta} · ejemplo pág. {perfil.ejemplo.pagina}</td></tr>)}</tbody></table></div>
    </details>
    {cuenta ? <>
      <RetencionFactura key={cuenta.id} cuenta={cuenta} reglas={reglas} perfil={perfiles.find(perfil => perfil.ruc === cuenta.ruc)} alActualizar={() => {
        setCuenta(null); setRevision(valor => valor + 1); setMensaje("Registro actualizado. Revisa el saldo en Cuentas por pagar.")
      }} />
      <button type="button" onClick={() => { setCuenta(null); setRevision(valor => valor + 1) }}>Volver a documentos y actualizar</button>
    </> : <>
      <form className="fin-pagos-filtros" onSubmit={evento => { evento.preventDefault(); setPagina(0); setFiltro(buscar.trim()) }}>
        <label>Tipo <select value={tipo} onChange={evento => { setTipo(evento.target.value); setPagina(0) }}><option value="SRI">Facturas</option><option value="NOTA_VENTA">Notas de venta</option></select></label>
        <label>Buscar <input value={buscar} onChange={evento => setBuscar(evento.target.value)} placeholder="Proveedor o documento" /></label><button disabled={cargando}>Buscar</button>
      </form>
      <div className="compras-sri-contenedor retenciones-documentos"><table className="compras-sri-tabla"><thead><tr><th>Fecha</th><th>Documento</th><th>Proveedor</th><th>Subtotal</th><th>IVA</th><th>Retención</th><th>Saldo</th><th /></tr></thead>
        <tbody>{!cargando && filas.map(fila => <tr key={fila.id}><td>{fila.fecha_documento}</td><td>{fila.numero_documento}</td><td>{fila.proveedor}</td>
          {[fila.subtotal, fila.iva, fila.retencion, fila.saldo].map((valor, indice) => <td key={indice}>{valor === null ? "—" : dinero(valor)}</td>)}
          <td><button onClick={() => { setCuenta(fila); setMensaje("") }}>Calcular / detalle</button></td></tr>)}
          {cargando && <tr><td colSpan={8}>Cargando documentos…</td></tr>}
          {!cargando && filas.length === 0 && <tr><td colSpan={8}>No hay documentos para esta búsqueda.</td></tr>}
        </tbody></table></div>
      <div className="fin-pagos-filtros"><button disabled={cargando || pagina === 0} onClick={() => setPagina(valor => valor - 1)}>Anterior</button><span>Página {pagina + 1} · {total} documentos</span>
        <button disabled={cargando || (pagina + 1) * CUENTAS_POR_PAGINA >= total} onClick={() => setPagina(valor => valor + 1)}>Siguiente</button></div>
    </>}
  </main>
}
