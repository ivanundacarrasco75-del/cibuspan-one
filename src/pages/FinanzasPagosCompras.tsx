import { Fragment, useEffect, useRef, useState, type FormEvent, type UIEvent } from "react"
import { createPortal } from "react-dom"
import {
  listarComprasProgramadas, listarCuentasCompra, pagarCompra,
  enviarComprasProgramadas, retirarPendienteProgramado, type EnvioCompras, type RetiroProgramado, type CompraProgramada, type CuentaCompra, type TipoCuentaCompra,
} from "../repositories/finanzasComprasRepository"
import { PANTALLA_ANTICIPOS, PANTALLA_CUENTAS_POR_PAGAR, PANTALLA_PAGOS_SEMANALES, PANTALLA_RETENCIONES } from "../utils/permisosAplicacion"
import "./comprasSriTabla.css"
import "./finanzasPagosCompras.css"
import SemanaPagoDocumento from "../components/SemanaPagoDocumento"
import SelectorSemanaPago from "../components/SelectorSemanaPago"
import { semanasDelAnio } from "../utils/semanasPago"
import CorreccionImportesExcel from "../components/CorreccionImportesExcel"
import LiquidarAnticipoRetencion from "../components/LiquidarAnticipoRetencion"
import QuitarCuentaNomina from "../components/QuitarCuentaNomina"
import CorregirMontoNomina from "../components/CorregirMontoNomina"
import type { ResultadoCargaNomina } from "../repositories/nominaRepository"
import { etiquetaAgrupacion } from "../utils/dashboardPeriodos"
import { useColumnasAjustables } from "../hooks/useColumnasAjustables"

const tipos: Record<TipoCuentaCompra, string> = { SRI: "Factura SRI", NOTA_VENTA: "Nota de venta", NO_DEDUCIBLE: "Gasto no deducible", NOMINA: "Pago nómina", ANTICIPO: "Anticipo", PRESTAMO: "Cuota de préstamo", IMPUESTO: "Impuesto" }
const moneda = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const importe = (valor: number | string | null) => valor === null ? "—" : moneda.format(Number(valor))
const centavos = (valor: number | string | null) => Math.round(Number(valor) * 100)
const monto = (valor: number) => (valor / 100).toFixed(2)
const hoy = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format()
const historica = (cuenta: CuentaCompra) => cuenta.origen === "CLASIFICACION_GASTOS"

function lunes(fecha: string) {
  const dia = new Date(`${fecha}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() - (dia.getUTCDay() + 6) % 7)
  return dia.toISOString().slice(0, 10)
}

function mensajeError(error: unknown) {
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message) : "No se pudo completar la operación."
}

type Seleccion = { cuenta: CuentaCompra; monto: string; verificado: boolean }
type Fila = { cuenta?: CuentaCompra; plan?: CompraProgramada }
type FilaProgramada = Awaited<ReturnType<typeof listarComprasProgramadas>>[number]
type Pago = { cuenta: CuentaCompra; operacion: string; abono: boolean; maximo: string; semana: string | null }
type IntentoPlan = { tipo:"ENVIO"; datos:EnvioCompras } | { tipo:"RETIRO"; datos:RetiroProgramado }
type Acciones = {
  actualizarAnticipo?: (id: string) => void
  quitarNomina?: (cuenta: CuentaCompra) => void
  corregirNomina?: (cuenta: CuentaCompra) => void
  actualizarSemana?: (id: string) => void
  actualizarImportes?: (id: string) => void
  seleccionar?: (cuenta: CuentaCompra, marcada: boolean) => void
  seleccion: Map<string, Seleccion>
  cambiarMonto?: (id: string, valor: string) => void
  verificar?: (id: string, verificado: boolean) => void
  abrirPago: (cuenta: CuentaCompra, abono: boolean, plan?: CompraProgramada) => void
  quitar?: (id: string) => void
  ocupado: boolean
}

function TablaCompras({ filas, titulo, modo, acciones, alDesplazar }: {
  filas: Fila[]; titulo: string; modo: "cuentas" | "seleccion" | "semana"; acciones: Acciones
  alDesplazar?: (evento: UIEvent<HTMLDivElement>) => void
}) {
  const [detalle, setDetalle] = useState<string | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)
  const tabla = useRef<HTMLTableElement>(null)
  const titulos = modo === "semana" ? ["Emisión", "Tipo", "Documento", "Proveedor", "Descripción", "Pago programado", "Pagos"] : [
    ...(modo === "cuentas" && acciones.seleccionar ? ["Elegir"] : []), "Emisión",
    ...(modo === "cuentas" ? ["Semana de emisión", "Semana de pago"] : []), "Tipo", "Documento", "Proveedor", "Descripción",
    "Subtotal", "IVA", "Retención", "Total", "Abonado", "Saldo",
    "Monto a pagar", "Estado", "Pagos",
  ]
  const columnas = titulos.length
  const anchos = useColumnasAjustables(modo, titulos, tabla)

  useEffect(() => {
    const elemento = contenedor.current
    if (!elemento || modo !== "cuentas") return
    const medir = () => {
      const barraHorizontal = Math.max(0, elemento.offsetHeight - elemento.clientHeight - 2)
      elemento.style.setProperty("--fin-pagos-barra-horizontal", `${barraHorizontal}px`)
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [modo])

  return (
    <div ref={contenedor} className={`compras-sri-contenedor${modo === "cuentas" ? " fin-pagos-cuentas-scroll" : ""}`}
      tabIndex={0} role="region" aria-label={titulo} onScroll={alDesplazar}>
      <table ref={tabla} className={`compras-sri-tabla fin-pagos-tabla${modo === "semana" ? " fin-pagos-semana" : ""}${anchos.ajustada ? " fin-pagos-ajustada" : ""}`} aria-label={titulo}
        style={anchos.ajustada ? { width: anchos.total, minWidth: anchos.total, tableLayout: "fixed" } : undefined}>
        <colgroup>{titulos.map(columna => <col key={columna} style={anchos.ajustada ? { width: anchos.ancho(columna) } : undefined} />)}</colgroup>
        <thead><tr>{titulos.map(columna => <th key={columna} scope="col" aria-label={columna}
          title={columna === "Semana de emisión" ? "Semana ISO de la fecha de emisión: de lunes a domingo" : columna}>
          <span className="fin-pagos-titulo-columna">{columna}</span>
          <span className="fin-pagos-ajustar-columna" role="separator" aria-orientation="vertical" tabIndex={0}
            aria-label={`Cambiar ancho de ${columna}`} aria-valuemin={40} aria-valuemax={900} aria-valuenow={anchos.ancho(columna)}
            title="Arrastra para cambiar el ancho. También puedes usar las flechas. Doble clic para restablecer esta columna."
            onPointerDown={evento => anchos.iniciar(evento, columna)} onPointerMove={anchos.mover}
            onPointerUp={anchos.terminar} onPointerCancel={anchos.terminar} onLostPointerCapture={anchos.terminar}
            onKeyDown={evento => anchos.teclado(evento, columna)} onDoubleClick={() => anchos.restablecer(columna)} />
        </th>)}</tr></thead>
        <tbody>{filas.map(({ cuenta, plan }) => {
          if (!cuenta && plan) {
            return <tr key={plan.documento_id}>
              <td colSpan={columnas - 2}>Documento de origen no disponible. Revisa el documento antes de pagar.</td>
              <td>{importe(Number(plan.monto)-Number(plan.pagado))}</td>
              <td><button type="button" disabled={acciones.ocupado || Number(plan.pagado) >= Number(plan.monto)} onClick={() => acciones.quitar?.(plan.documento_id)}>Quitar</button></td>
            </tr>
          }
          if (!cuenta) return null
          const elegida = acciones.seleccion.get(cuenta.id)
          const nombre = cuenta.numero_documento || cuenta.proveedor || tipos[cuenta.tipo]
          const restante = plan ? centavos(plan.monto) - centavos(plan.pagado) : centavos(cuenta.saldo)
          const vinculoPendiente = cuenta.observaciones?.includes("Revisar coincidencia con Excel antes de programar pagos")
          const puedePagar = !vinculoPendiente && cuenta.saldo !== null && restante > 0 && (plan ? restante <= centavos(cuenta.saldo) : !cuenta.semana_activa)
          let estado = cuenta.pagado > 0 ? "Abonada" : "Pendiente"
          if (cuenta.saldo === null) estado = "Importe por completar"
          else if (cuenta.saldo <= 0) estado = cuenta.pagado > 0 ? "Pagada" : "Sin saldo"
          else if (historica(cuenta) && cuenta.pagado === 0) estado = "Verificar saldo"
          if (cuenta.semana_activa) estado = `Semana ${cuenta.semana_activa}`
          if (plan) estado = restante === 0 ? "Ejecutado" : puedePagar ? "Programado" : "Revisar saldo"
          if (vinculoPendiente) estado = "Revisar vínculo con Excel"
          return <Fragment key={cuenta.id}>
            <tr className={restante === 0 && (plan || cuenta.pagado > 0) ? "compras-sri-pagada" : elegida ? "fin-pagos-elegida" : undefined}>
              {modo === "cuentas" && acciones.seleccionar && <td><input type="checkbox" aria-label={`Seleccionar ${nombre}`} checked={Boolean(elegida)}
                disabled={acciones.ocupado || (!elegida && (vinculoPendiente || cuenta.saldo === null || cuenta.saldo <= 0 || Boolean(cuenta.semana_activa)))}
                onChange={evento => acciones.seleccionar?.(cuenta, evento.target.checked)} /></td>}
              <td>{cuenta.fecha_documento || "—"}</td>
              {modo === "cuentas" && <><td>{cuenta.fecha_documento ? etiquetaAgrupacion(cuenta.fecha_documento, "SEMANA") : "—"}</td><td>{["SRI", "NOTA_VENTA", "NO_DEDUCIBLE", "ANTICIPO"].includes(cuenta.tipo) && !historica(cuenta) ? <SemanaPagoDocumento documento={cuenta.id} inicial={cuenta.semana_pago} nombre={nombre} disabled={acciones.ocupado} alGuardar={() => acciones.actualizarSemana?.(cuenta.id)} /> : cuenta.semana_pago ?? "—"}</td></>}
              <td>{tipos[cuenta.tipo]}</td>
              <td>{cuenta.numero_documento || "—"}</td><td title={cuenta.proveedor ?? undefined}>{cuenta.proveedor || "—"}</td>
              <td title={cuenta.concepto ?? undefined}>{cuenta.concepto || "—"}</td>
              {modo !== "semana" && [cuenta.subtotal, cuenta.iva, cuenta.retencion, cuenta.total, cuenta.pagado, cuenta.saldo].map((valor, indice) =>
                <td className="compras-sri-monto" key={indice}>{importe(valor)}</td>)}
              {modo === "seleccion" && <td>
                <input type="number" aria-label={`Monto a pagar de ${nombre}`} min="0.01" max={monto(centavos(cuenta.saldo))} step="0.01"
                  value={elegida?.monto ?? ""} required disabled={acciones.ocupado}
                  onChange={evento => acciones.cambiarMonto?.(cuenta.id, evento.target.value)} />
              </td>}
              {modo === "cuentas" && <td className="compras-sri-monto">{importe(cuenta.monto_a_pagar ?? cuenta.saldo)}</td>}
              {modo === "semana" && <td className="compras-sri-monto">{plan ? importe(monto(restante)) : "—"}</td>}
              {modo !== "semana" && <td>{modo === "seleccion" && historica(cuenta)
                ? <label className="fin-pagos-verificar"><input type="checkbox" checked={elegida?.verificado ?? false}
                  disabled={acciones.ocupado} onChange={evento => acciones.verificar?.(cuenta.id, evento.target.checked)} /> Saldo verificado</label>
                : estado}</td>}
              <td className="compras-sri-acciones"><div>
                {modo === "semana" && <button type="button" disabled={acciones.ocupado || !puedePagar || !plan}
                  title={puedePagar ? "Pagar el importe pendiente del plan" : estado} onClick={() => acciones.abrirPago(cuenta, false, plan)}>Pagar</button>}
                <button type="button" aria-expanded={detalle === cuenta.id} onClick={() => setDetalle(detalle === cuenta.id ? null : cuenta.id)}>Detalle</button>
                {modo === "cuentas" && cuenta.tipo === "NOMINA" && acciones.corregirNomina && <button type="button" disabled={acciones.ocupado} onClick={() => acciones.corregirNomina?.(cuenta)}>Corregir monto</button>}
                {modo === "cuentas" && cuenta.tipo === "NOMINA" && acciones.quitarNomina &&
                  <button type="button" aria-label={`Quitar cuenta de nómina de ${cuenta.proveedor} · ${cuenta.numero_documento}`}
                    disabled={acciones.ocupado || Number(cuenta.pagado) > 0 || cuenta.pagos.length > 0 || Boolean(cuenta.semana_activa)}
                    title={Number(cuenta.pagado) > 0 || cuenta.pagos.length > 0 ? "Tiene pagos registrados; revisa el detalle" : cuenta.semana_activa ? "Quita primero esta cuenta de Pagos semanales" : "Retirar la cuenta para volver a cargarla con los datos correctos"}
                    onClick={() => acciones.quitarNomina?.(cuenta)}>Quitar cuenta de nómina</button>}
                {(modo === "seleccion" || modo === "semana") &&
                  <button type="button" disabled={acciones.ocupado || (modo === "semana" && (!plan || restante <= 0))}
                    title={modo === "semana" ? "Retirar solo el pendiente; conserva los abonos registrados" : undefined} onClick={() => acciones.quitar?.(cuenta.id)}>Quitar</button>}
              </div></td>
            </tr>
            {detalle === cuenta.id && <tr><td colSpan={columnas} className="compras-sri-detalle">
              <strong>{nombre}</strong><p>{cuenta.concepto || "Sin descripción"}</p>
              {modo === "semana" && <>
                <p>Estado: {estado} · Subtotal: {importe(cuenta.subtotal)} · IVA: {importe(cuenta.iva)} · Retención: {importe(cuenta.retencion)} · Total: {importe(cuenta.total)}</p>
                <p>Abonado al documento: {importe(cuenta.pagado)} · Saldo del documento: {importe(cuenta.saldo)}</p>
                {plan && <p>Programado acumulado en la semana: {importe(plan.monto)} · Pagado en plan: {importe(plan.pagado)} · Pago pendiente: {importe(monto(restante))}</p>}
              </>}
              {cuenta.ruc && <p>RUC {cuenta.ruc}{cuenta.id.startsWith("sri:") ? " · Clave de acceso " + cuenta.id.slice(4) : ""}</p>}
              {historica(cuenta) && <p>Origen histórico en Clasificación de gastos. Verifica el saldo contra los pagos anteriores.</p>}
              {cuenta.observaciones && <p>{cuenta.observaciones}</p>}
              {modo === "cuentas" && cuenta.tipo === "ANTICIPO" && Number(cuenta.saldo) > 0 && Number(cuenta.pagado) > 0 &&
                <LiquidarAnticipoRetencion anticipoId={cuenta.id.slice("anticipo:".length)} disabled={acciones.ocupado}
                  alGuardar={() => acciones.actualizarAnticipo?.(cuenta.id)} />}
              {modo === "cuentas" && cuenta.origen === "EXCEL" && <CorreccionImportesExcel cuenta={cuenta}
                alGuardar={() => acciones.actualizarImportes?.(cuenta.id)} />}
              {cuenta.pagos.length > 0 ? <ul>{cuenta.pagos.map(pago =>
                <li key={pago.id}>{pago.fecha} · {importe(pago.valor)} · {pago.documento || "Sin referencia"}</li>)}</ul>
                : <p>Sin pagos registrados en este documento.</p>}
            </td></tr>}
          </Fragment>
        })}
        {filas.length === 0 && <tr><td colSpan={columnas}>No hay documentos para mostrar.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export default function FinanzasPagosCompras({ semanal, cambiarPantalla, puedeAbrirPagosSemanales, semanaInicial, cargaNomina }: {
  semanal: boolean; cambiarPantalla: (pantalla: string) => void; puedeAbrirPagosSemanales: boolean; semanaInicial?: string; cargaNomina?: ResultadoCargaNomina
}) {
  const [semanaPago, setSemanaPago] = useState("")
  const [anioSemanaPago, setAnioSemanaPago] = useState(() => Number(hoy().slice(0, 4)))
  const [sinSemana, setSinSemana] = useState(false)
  const [semana, setSemana] = useState(() => semanaInicial ?? lunes(hoy()))
  const [cuentas, setCuentas] = useState<CuentaCompra[]>([])
  const [programadas, setProgramadas] = useState<FilaProgramada[]>([])
  const [seleccion, setSeleccion] = useState(new Map<string, Seleccion>())
  const [tipo, setTipo] = useState(cargaNomina ? "NOMINA" : "")
  const [documentosCarga, setDocumentosCarga] = useState<string[] | undefined>(() => cargaNomina?.filas.map(f => f.id))
  useEffect(() => { setDocumentosCarga(cargaNomina?.filas.map(f => f.id)) }, [cargaNomina])
  const [buscar, setBuscar] = useState("")
  const [pendientes, setPendientes] = useState(false)
  const [total, setTotal] = useState(0)
  const [revision, setRevision] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [errorCargaMas, setErrorCargaMas] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [aviso, setAviso] = useState("")
  const [pago, setPago] = useState<Pago | null>(null)
  const [retiroNomina, setRetiroNomina] = useState<CuentaCompra | null>(null)
  const [correccionNomina, setCorreccionNomina] = useState<CuentaCompra | null>(null)
  const [intentoPago, setIntentoPago] = useState<Parameters<typeof pagarCompra>[0] | null>(null)
  const [intentoPlan, setIntentoPlan] = useState<IntentoPlan | null>(null)
  const bloqueo = useRef(false)
  const consultaCuentas = useRef<{ pagina: number; enCurso: boolean; agotada: boolean } | null>(null)
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (pago && !dialogo.current?.open) dialogo.current?.showModal()
  }, [pago])

  function cerrarPago() {
    if (bloqueo.current) return
    setPago(null)
    setIntentoPago(null)
    setError("")
    setRevision(valor => valor + 1)
  }

  useEffect(() => {
    let vigente = true
    const consulta = { pagina: 1, enCurso: false, agotada: false }
    consultaCuentas.current = semanal ? null : consulta
    setCargando(true)
    setCargandoMas(false)
    setErrorCargaMas("")
    setError("")
    const demora = setTimeout(async () => {
      try {
        if (semanal) {
          const filas = await listarComprasProgramadas(semana)
          if (vigente) setProgramadas(filas)
        } else {
          const resultado = await listarCuentasCompra(0, tipo, buscar.trim(), pendientes, sinSemana ? "SIN_SEMANA" : semanaPago, documentosCarga)
          if (vigente) {
            setCuentas(resultado.cuentas)
            setTotal(resultado.total)
          }
        }
      } catch (fallo) {
        if (vigente) {
          setCuentas([])
          setProgramadas([])
          setTotal(0)
          setError(mensajeError(fallo))
        }
      } finally {
        if (vigente) setCargando(false)
      }
    }, semanal ? 0 : 180)
    return () => {
      vigente = false
      if (consultaCuentas.current === consulta) consultaCuentas.current = null
      clearTimeout(demora)
    }
  }, [semanal, semana, tipo, buscar, pendientes, revision, semanaPago, sinSemana, documentosCarga])

  async function cargarMas() {
    const consulta = consultaCuentas.current
    if (!consulta || consulta.enCurso || consulta.agotada || cargando || cuentas.length >= total) return
    consulta.enCurso = true
    setCargandoMas(true)
    setErrorCargaMas("")
    try {
      const resultado = await listarCuentasCompra(consulta.pagina, tipo, buscar.trim(), pendientes, sinSemana ? "SIN_SEMANA" : semanaPago, documentosCarga)
      if (consultaCuentas.current !== consulta) return
      consulta.pagina += 1
      consulta.agotada = resultado.cuentas.length === 0
      setCuentas(anteriores => {
        const unicas = new Map(anteriores.map(cuenta => [cuenta.id, cuenta]))
        for (const cuenta of resultado.cuentas) unicas.set(cuenta.id, cuenta)
        return Array.from(unicas.values())
      })
      setTotal(resultado.total)
    } catch (fallo) {
      if (consultaCuentas.current === consulta) setErrorCargaMas(mensajeError(fallo))
    } finally {
      consulta.enCurso = false
      if (consultaCuentas.current === consulta) setCargandoMas(false)
    }
  }

  function cargarAlDesplazar(evento: UIEvent<HTMLDivElement>) {
    const { scrollHeight, scrollTop, clientHeight } = evento.currentTarget
    if (!errorCargaMas && scrollHeight - scrollTop - clientHeight <= 54) void cargarMas()
  }

  async function guardar(operacion: () => Promise<void>) {
    if (bloqueo.current) return
    bloqueo.current = true
    setGuardando(true)
    setError("")
    setAviso("")
    try {
      await operacion()
    } catch (fallo) {
      setError(mensajeError(fallo))
    } finally {
      bloqueo.current = false
      setGuardando(false)
    }
  }

  function seleccionar(cuenta: CuentaCompra, marcada: boolean) {
    setSeleccion(anterior => {
      const lista = new Map(anterior)
      if (marcada) lista.set(cuenta.id, { cuenta, monto: monto(centavos(cuenta.monto_a_pagar ?? cuenta.saldo)), verificado: false })
      else lista.delete(cuenta.id)
      return lista
    })
  }

  function editarSeleccion(id: string, cambio: Partial<Pick<Seleccion, "monto" | "verificado">>) {
    setSeleccion(anterior => {
      const fila = anterior.get(id)
      return fila ? new Map(anterior).set(id, { ...fila, ...cambio }) : anterior
    })
  }

  function abrirPago(cuenta: CuentaCompra, abono: boolean, plan?: CompraProgramada) {
    setError("")
    setAviso("")
    setIntentoPago(null)
    setPago({ cuenta, abono, operacion: crypto.randomUUID(), semana: plan ? semana : null,
      maximo: monto(plan ? centavos(plan.monto) - centavos(plan.pagado) : centavos(cuenta.saldo)) })
  }

  function registrarPago(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!pago) return
    const datos = new FormData(evento.currentTarget)
    const solicitud = intentoPago ?? {
      id: pago.cuenta.id, operacion: pago.operacion, monto: pago.abono ? String(datos.get("monto")) : pago.maximo,
      fecha: String(datos.get("fecha")), referencia: String(datos.get("referencia")).trim(),
      semana: pago.semana, verificado: datos.get("verificado") === "on",
    }
    if (!solicitud.referencia) {
      setError("Ingresa la referencia del pago.")
      return
    }
    void guardar(async () => {
      setIntentoPago(solicitud)
      try {
        await pagarCompra(solicitud)
      } catch (fallo) {
        if (typeof fallo === "object" && fallo !== null && "pagoRechazado" in fallo && fallo.pagoRechazado) {
          setIntentoPago(null)
        }
        throw fallo
      }
      seleccionar(pago.cuenta, false)
      setPago(null)
      setIntentoPago(null)
      setAviso("Pago registrado.")
      setRevision(valor => valor + 1)
    })
  }

  function enviarSeleccion(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const filas = Array.from(seleccion.values(), fila => ({ id: fila.cuenta.id, monto: fila.monto, verificado: fila.verificado }))
    procesarPlan({ tipo:"ENVIO", datos:{ operacion:crypto.randomUUID(), semana, filas } })
  }

  function procesarPlan(solicitud:IntentoPlan) {
    void guardar(async () => {
      setIntentoPlan(solicitud)
      try {
        if (solicitud.tipo === "ENVIO") await enviarComprasProgramadas(solicitud.datos)
        else await retirarPendienteProgramado(solicitud.datos)
      } catch (e) {
        if (e && typeof e === "object" && "rechazado" in e && e.rechazado) setIntentoPlan(null)
        throw e
      }
      setIntentoPlan(null)
      if (solicitud.tipo === "ENVIO") {
        setSeleccion(new Map())
        setAviso(`${solicitud.datos.filas.length} documento(s) enviado(s) a la semana del ${solicitud.datos.semana}.`)
        if (puedeAbrirPagosSemanales) cambiarPantalla(PANTALLA_PAGOS_SEMANALES)
        else setRevision(valor => valor + 1)
      } else {
        setAviso("Pendiente retirado. Los abonos y sus referencias se conservaron.")
        setRevision(valor => valor + 1)
      }
    })
  }

  const seleccionadas = Array.from(seleccion.values())
  const totalSeleccion = seleccionadas.reduce((total, fila) => total + (centavos(fila.monto) || 0), 0)
  const saldoSemana = programadas.reduce((total, { plan }) => total + centavos(plan.monto) - centavos(plan.pagado), 0)
  const ocupado = guardando || cargando || pago !== null || retiroNomina !== null || correccionNomina !== null || intentoPlan !== null
  const acciones = { seleccion, abrirPago, ocupado, actualizarAnticipo: (id: string) => {
    setSeleccion(a => { const n = new Map(a); n.delete(id); return n }); setRevision(v => v + 1)
  }, actualizarSemana: (id: string) => { setSeleccion(a => { const n = new Map(a); n.delete(id); return n }); setAviso("Semana de pago guardada con registro del responsable."); setRevision(v => v + 1) }, actualizarImportes: (id: string) => {
    setSeleccion(anterior => { const siguiente = new Map(anterior); siguiente.delete(id); return siguiente })
    setAviso("Importes corregidos y registrados en la bitácora. Ya puedes seleccionar el documento si tiene saldo.")
    setRevision(valor => valor + 1)
  } }

  return (
    <main className="compras-sri-pagina fin-pagos">
      <header className="compras-sri-cabecera">
        <h1>{semanal ? "Pagos semanales" : "Cuentas por pagar"}</h1>
        <div className="compras-sri-herramientas">
          {!semanal && <button type="button" disabled={ocupado} onClick={() => cambiarPantalla(PANTALLA_ANTICIPOS)}>Anticipos</button>}
          {!semanal && <button type="button" disabled={ocupado} onClick={() => cambiarPantalla(PANTALLA_RETENCIONES)}>Retenciones</button>}
          {(semanal || puedeAbrirPagosSemanales) && <button type="button" disabled={ocupado} onClick={() => cambiarPantalla(semanal ? PANTALLA_CUENTAS_POR_PAGAR : PANTALLA_PAGOS_SEMANALES)}>
            {semanal ? "Cuentas por pagar" : "Ver pagos semanales"}
          </button>}
          <button type="button" disabled={guardando || pago !== null || intentoPlan !== null} onClick={() => setRevision(valor => valor + 1)}>Actualizar</button>
        </div>
      </header>
      {error && !pago && <p className="compras-sri-error" role="alert">{error}</p>}
      {intentoPlan && <p role="status">Confirma el resultado antes de continuar. <button type="button" disabled={guardando} onClick={() => procesarPlan(intentoPlan)}>{intentoPlan.tipo === "ENVIO" ? "Reintentar envío" : "Reintentar retiro"}</button></p>}
      {aviso && <p role="status">{aviso}</p>}
      {!semanal && cargaNomina && <section className="fin-pagos-seleccion" aria-label="Resultado de carga de nómina">
        <p role="status">Resultado de la carga: {cargaNomina.filas.filter(f => f.estado === "CREADA").length} creadas · {cargaNomina.filas.filter(f => f.estado === "PREPARADA").length} pagos preparados · {cargaNomina.filas.filter(f => f.estado === "ACTUALIZADA").length} actualizadas · {cargaNomina.filas.filter(f => f.estado === "YA_EXISTIA").length} ya existentes · {cargaNomina.filas.filter(f => f.estado === "YA_PAGADA").length} ya pagadas.</p>
        {cargaNomina.filas.some(f => f.estado === "YA_PAGADA") && <p>Estas cuentas ya estaban pagadas. Volver a cargar el mismo mes y concepto no genera otro pago; revisa el mes y concepto elegidos.</p>}
        {documentosCarga && <><p>Mostrando las cuentas de la última carga. Los demás pagos siguen disponibles al quitar este filtro.</p><button type="button" disabled={ocupado} onClick={() => { setDocumentosCarga(undefined); setTipo(""); setBuscar(""); setPendientes(false); setSinSemana(false); setSemanaPago("") }}>Ver todas las cuentas</button></>}
      </section>}
      {semanal ? (
        <>
          <div className="fin-pagos-filtros">
            <label>Semana del <SelectorSemanaPago etiqueta="Semana del" required value={semana} disabled={guardando || pago !== null || intentoPlan !== null} onChange={setSemana} /></label>
            {!cargando && <strong>Pendiente programado: {importe(monto(saldoSemana))}</strong>}
          </div>
          {cargando ? <p role="status">Cargando pagos semanales…</p> :
            <TablaCompras filas={programadas} modo="semana" titulo="Documentos programados" acciones={{
              ...acciones, quitar: id => {
                const plan = programadas.find(f => f.plan.documento_id === id)?.plan
                if (plan) procesarPlan({ tipo:"RETIRO", datos:{ operacion:crypto.randomUUID(), semana, documento:id, monto:Number(plan.monto), pagado:Number(plan.pagado) } })
              },
            }} />}
        </>
      ) : (
        <>
          <div className="fin-pagos-filtros">
            <label>Tipo <select value={tipo} disabled={guardando || pago !== null || intentoPlan !== null}
              onChange={evento => setTipo(evento.target.value)}>
              <option value="">Todos</option>
              {Object.entries(tipos).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
            </select></label>
            <label>Año de la semana <select aria-label="Año de la semana" value={anioSemanaPago} disabled={guardando || pago !== null || intentoPlan !== null || sinSemana} onChange={e => {
              const anio = Number(e.target.value)
              const numero = semanasDelAnio(anioSemanaPago).find(s => s.desde === semanaPago)?.numero
              setAnioSemanaPago(anio)
              setSemanaPago(numero ? semanasDelAnio(anio)[numero - 1]?.desde ?? "" : "")
            }}>{Array.from({ length: 21 }, (_, i) => Number(hoy().slice(0, 4)) - 10 + i).map(anio => <option key={anio} value={anio}>{anio}</option>)}</select></label>
            <label>Semana de pago <select aria-label="Filtrar semana de pago" value={semanaPago} disabled={guardando || pago !== null || intentoPlan !== null || sinSemana} onChange={e => setSemanaPago(e.target.value)}>
              <option value="">Sin filtro de semana</option>
              {semanasDelAnio(anioSemanaPago).map(s => <option key={s.numero} value={s.desde}>Semana {String(s.numero).padStart(2, "0")}</option>)}
            </select></label>
            <label><input type="checkbox" checked={sinSemana} disabled={guardando || pago !== null || intentoPlan !== null} onChange={e => setSinSemana(e.target.checked)} /> Sin semana asignada</label>
            <button type="button" disabled={guardando || pago !== null || intentoPlan !== null} onClick={() => { setSemanaPago(""); setSinSemana(false) }}>Todas las semanas</button>
            <label>Buscar <input type="search" value={buscar} disabled={guardando || pago !== null || intentoPlan !== null}
              placeholder="Proveedor, documento o descripción" onChange={evento => setBuscar(evento.target.value)} /></label>
            <label><input type="checkbox" checked={pendientes} disabled={guardando || pago !== null || intentoPlan !== null}
              onChange={evento => setPendientes(evento.target.checked)} /> Solo con saldo</label>
          </div>
          <div aria-busy={cargando || cargandoMas}>
            {cargando ? <p role="status">Cargando documentos…</p> :
              <TablaCompras filas={cuentas.map(cuenta => ({ cuenta }))} titulo="Cuentas por pagar consolidadas" modo="cuentas"
                acciones={{ ...acciones, seleccionar, quitarNomina: setRetiroNomina, corregirNomina: setCorreccionNomina }} alDesplazar={cargarAlDesplazar} />}
          </div>
          <div className="compras-sri-paginas">
            {!cargando && <span>{total} documentos</span>}
            {cargandoMas && <span role="status">Cargando más documentos…</span>}
            {errorCargaMas && <>
              <span role="alert">{errorCargaMas}</span>
              <button type="button" onClick={() => void cargarMas()}>Reintentar</button>
            </>}
          </div>
          <section className="fin-pagos-seleccion" aria-labelledby="pagos-seleccionados">
            <h2 id="pagos-seleccionados">Documentos seleccionados</h2>
            <form onSubmit={enviarSeleccion}>
              <TablaCompras filas={seleccionadas} modo="seleccion" titulo="Documentos seleccionados" acciones={{
                ...acciones, cambiarMonto: (id, valor) => editarSeleccion(id, { monto: valor }),
                verificar: (id, verificado) => editarSeleccion(id, { verificado }),
                quitar: id => setSeleccion(anterior => {
                  const siguiente = new Map(anterior)
                  siguiente.delete(id)
                  return siguiente
                }),
              }} />
              <div className="fin-pagos-filtros">
                <label>Semana del <SelectorSemanaPago etiqueta="Semana del" required value={semana} disabled={ocupado} onChange={setSemana} /></label>
                <strong>{seleccionadas.length} seleccionados · {importe(monto(totalSeleccion))}</strong>
                <button type="submit" className="fin-pagos-principal" disabled={ocupado || seleccionadas.length === 0
                  || seleccionadas.some(fila => historica(fila.cuenta) && !fila.verificado)}>
                  {guardando ? "Guardando…" : "Enviar a Pagos semanales"}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
      {retiroNomina && <QuitarCuentaNomina cuenta={retiroNomina} cerrar={() => setRetiroNomina(null)} alQuitar={() => {
        setSeleccion(anterior => { const siguiente = new Map(anterior); siguiente.delete(retiroNomina.id); return siguiente })
        setRetiroNomina(null)
        setAviso("Cuenta de nómina retirada y registrada en la bitácora. Vuelve a Roles de pago → Pagos nómina para cargar el concepto correcto.")
        setRevision(valor => valor + 1)
      }} />}
      {correccionNomina && <CorregirMontoNomina cuenta={correccionNomina} cerrar={() => setCorreccionNomina(null)} alGuardar={() => {
        setSeleccion(anterior => { const siguiente = new Map(anterior); siguiente.delete(correccionNomina.id); return siguiente })
        setCorreccionNomina(null); setAviso("Monto de nómina corregido en la bitácora. Se conservaron los pagos registrados y se actualizó el saldo."); setRevision(v => v + 1)
      }} />}
      {pago && createPortal(<dialog ref={dialogo} className="fin-pagos-dialogo" aria-labelledby="registrar-pago-compra"
        onClose={() => { if (!dialogo.current?.open) cerrarPago() }}
        onCancel={evento => { evento.preventDefault(); cerrarPago() }}>
        <form onSubmit={registrarPago}>
          <h2 id="registrar-pago-compra">{pago.abono ? "Registrar abono" : "Registrar pago"}</h2>
          <p>{pago.cuenta.proveedor} · {pago.cuenta.numero_documento || tipos[pago.cuenta.tipo]}</p>
          <fieldset disabled={guardando || intentoPago !== null}>
            {pago.abono ? <label>Monto <input name="monto" type="number" min="0.01" max={pago.maximo} step="0.01" required /></label> :
              <p>{pago.semana ? "Pendiente programado" : "Saldo del documento"}: <strong>{importe(pago.maximo)}</strong></p>}
            <label>Fecha de pago <input name="fecha" type="date" defaultValue={hoy()} required /></label>
            <label>Referencia del pago <input name="referencia" maxLength={500} required /></label>
            {historica(pago.cuenta) && !pago.semana && <label><input name="verificado" type="checkbox" required /> Verifiqué el saldo contra los pagos anteriores.</label>}
          </fieldset>
          {error && <p className="compras-sri-error" role="alert">{error}</p>}
          <div className="fin-pagos-filtros">
            <button type="submit" className="fin-pagos-principal" disabled={guardando}>
              {guardando ? "Guardando…" : intentoPago ? "Reintentar" : "Confirmar registro"}
            </button>
            <button type="button" disabled={guardando} onClick={cerrarPago}>{intentoPago ? "Cerrar y actualizar" : "Cancelar"}</button>
          </div>
        </form>
      </dialog>, document.body)}
    </main>
  )
}
