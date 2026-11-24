import { Fragment, useEffect, useRef, useState, type FormEvent, type UIEvent } from "react"
import { createPortal } from "react-dom"
import {
  listarComprasProgramadas, listarCuentasCompra, pagarCompra,
  programarCompras, quitarCompraProgramada, type CompraProgramada, type CuentaCompra, type TipoCuentaCompra,
} from "../repositories/finanzasComprasRepository"
import { PANTALLA_ANTICIPOS, PANTALLA_CUENTAS_POR_PAGAR, PANTALLA_PAGOS_SEMANALES, PANTALLA_RETENCIONES } from "../utils/permisosAplicacion"
import "./comprasSriTabla.css"
import "./finanzasPagosCompras.css"
import CorreccionImportesExcel from "../components/CorreccionImportesExcel"
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
type Acciones = {
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
  const titulos = [
    ...(modo === "cuentas" && acciones.seleccionar ? ["Elegir"] : []), "Emisión",
    ...(modo === "cuentas" ? ["Semana de emisión"] : []), "Tipo", "Documento", "Proveedor", "Descripción",
    "Subtotal", "IVA", "Retención", "Total", "Abonado", "Saldo",
    ...(modo === "cuentas" ? [] : [modo === "semana" ? "Programado" : "Monto a pagar"]),
    ...(modo === "semana" ? ["Pagado en plan"] : []), "Estado", "Pagos",
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
      <table ref={tabla} className={`compras-sri-tabla fin-pagos-tabla${anchos.ajustada ? " fin-pagos-ajustada" : ""}`} aria-label={titulo}
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
              <td colSpan={11}>Documento de origen no disponible</td>
              <td>{importe(plan.monto)}</td><td>{importe(plan.pagado)}</td><td>Revisar</td>
              <td>{plan.pagado === 0 && <button disabled={acciones.ocupado} onClick={() => acciones.quitar?.(plan.documento_id)}>Retirar</button>}</td>
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
              {modo === "cuentas" && <td>{cuenta.fecha_documento ? etiquetaAgrupacion(cuenta.fecha_documento, "SEMANA") : "—"}</td>}
              <td>{tipos[cuenta.tipo]}</td>
              <td>{cuenta.numero_documento || "—"}</td><td title={cuenta.proveedor ?? undefined}>{cuenta.proveedor || "—"}</td>
              <td title={cuenta.concepto ?? undefined}>{cuenta.concepto || "—"}</td>
              {[cuenta.subtotal, cuenta.iva, cuenta.retencion, cuenta.total, cuenta.pagado, cuenta.saldo].map((valor, indice) =>
                <td className="compras-sri-monto" key={indice}>{importe(valor)}</td>)}
              {modo === "seleccion" && <td>
                <input type="number" aria-label={`Monto a pagar de ${nombre}`} min="0.01" max={monto(centavos(cuenta.saldo))} step="0.01"
                  value={elegida?.monto ?? ""} required disabled={acciones.ocupado}
                  onChange={evento => acciones.cambiarMonto?.(cuenta.id, evento.target.value)} />
              </td>}
              {plan && <><td className="compras-sri-monto">{importe(plan.monto)}</td><td className="compras-sri-monto">{importe(plan.pagado)}</td></>}
              <td>{modo === "seleccion" && historica(cuenta)
                ? <label className="fin-pagos-verificar"><input type="checkbox" checked={elegida?.verificado ?? false}
                  disabled={acciones.ocupado} onChange={evento => acciones.verificar?.(cuenta.id, evento.target.checked)} /> Saldo verificado</label>
                : estado}</td>
              <td className="compras-sri-acciones"><div>
                {modo === "semana" && puedePagar && <>
                  <button type="button" disabled={acciones.ocupado} onClick={() => acciones.abrirPago(cuenta, true, plan)}>Abonar</button>
                  <button type="button" disabled={acciones.ocupado} onClick={() => acciones.abrirPago(cuenta, false, plan)}>Pagar</button>
                </>}
                <button type="button" aria-expanded={detalle === cuenta.id} onClick={() => setDetalle(detalle === cuenta.id ? null : cuenta.id)}>Detalle</button>
                {(modo === "seleccion" || (plan && plan.pagado === 0)) &&
                  <button type="button" disabled={acciones.ocupado} onClick={() => acciones.quitar?.(cuenta.id)}>Quitar</button>}
              </div></td>
            </tr>
            {detalle === cuenta.id && <tr><td colSpan={columnas} className="compras-sri-detalle">
              <strong>{nombre}</strong><p>{cuenta.concepto || "Sin descripción"}</p>
              {cuenta.ruc && <p>RUC {cuenta.ruc}{cuenta.id.startsWith("sri:") ? " · Clave de acceso " + cuenta.id.slice(4) : ""}</p>}
              {historica(cuenta) && <p>Origen histórico en Clasificación de gastos. Verifica el saldo contra los pagos anteriores.</p>}
              {cuenta.observaciones && <p>{cuenta.observaciones}</p>}
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

export default function FinanzasPagosCompras({ semanal, cambiarPantalla, puedeAbrirPagosSemanales, semanaInicial }: {
  semanal: boolean; cambiarPantalla: (pantalla: string) => void; puedeAbrirPagosSemanales: boolean; semanaInicial?: string
}) {
  const [semana, setSemana] = useState(() => semanaInicial ?? lunes(hoy()))
  const [cuentas, setCuentas] = useState<CuentaCompra[]>([])
  const [programadas, setProgramadas] = useState<FilaProgramada[]>([])
  const [seleccion, setSeleccion] = useState(new Map<string, Seleccion>())
  const [tipo, setTipo] = useState("")
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
  const [intentoPago, setIntentoPago] = useState<Parameters<typeof pagarCompra>[0] | null>(null)
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
          const resultado = await listarCuentasCompra(0, tipo, buscar.trim(), pendientes)
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
  }, [semanal, semana, tipo, buscar, pendientes, revision])

  async function cargarMas() {
    const consulta = consultaCuentas.current
    if (!consulta || consulta.enCurso || consulta.agotada || cargando || cuentas.length >= total) return
    consulta.enCurso = true
    setCargandoMas(true)
    setErrorCargaMas("")
    try {
      const resultado = await listarCuentasCompra(consulta.pagina, tipo, buscar.trim(), pendientes)
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
      if (marcada) lista.set(cuenta.id, { cuenta, monto: monto(centavos(cuenta.saldo)), verificado: false })
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
    void guardar(async () => {
      await programarCompras(semana, filas)
      setSeleccion(new Map())
      setAviso(`${filas.length} documento(s) enviado(s) a la semana del ${semana}.`)
      if (puedeAbrirPagosSemanales) cambiarPantalla(PANTALLA_PAGOS_SEMANALES)
      else setRevision(valor => valor + 1)
    })
  }

  const seleccionadas = Array.from(seleccion.values())
  const totalSeleccion = seleccionadas.reduce((total, fila) => total + (centavos(fila.monto) || 0), 0)
  const saldoSemana = programadas.reduce((total, { plan }) => total + centavos(plan.monto) - centavos(plan.pagado), 0)
  const ocupado = guardando || cargando || pago !== null
  const acciones = { seleccion, abrirPago, ocupado, actualizarImportes: (id: string) => {
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
          <button type="button" disabled={guardando || pago !== null} onClick={() => setRevision(valor => valor + 1)}>Actualizar</button>
        </div>
      </header>
      {error && !pago && <p className="compras-sri-error" role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}
      {semanal ? (
        <>
          <div className="fin-pagos-filtros">
            <label>Semana del <input type="date" value={semana} disabled={guardando || pago !== null}
              onChange={evento => evento.target.value && setSemana(lunes(evento.target.value))} /></label>
            {!cargando && <strong>Pendiente programado: {importe(monto(saldoSemana))}</strong>}
          </div>
          {cargando ? <p role="status">Cargando pagos semanales…</p> :
            <TablaCompras filas={programadas} modo="semana" titulo="Documentos programados" acciones={{
              ...acciones, quitar: id => void guardar(async () => {
                await quitarCompraProgramada(semana, id)
                setRevision(valor => valor + 1)
              }),
            }} />}
        </>
      ) : (
        <>
          <div className="fin-pagos-filtros">
            <label>Tipo <select value={tipo} disabled={guardando || pago !== null}
              onChange={evento => setTipo(evento.target.value)}>
              <option value="">Todos</option>
              {Object.entries(tipos).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
            </select></label>
            <label>Buscar <input type="search" value={buscar} disabled={guardando || pago !== null}
              placeholder="Proveedor, documento o descripción" onChange={evento => setBuscar(evento.target.value)} /></label>
            <label><input type="checkbox" checked={pendientes} disabled={guardando || pago !== null}
              onChange={evento => setPendientes(evento.target.checked)} /> Solo con saldo</label>
          </div>
          <div aria-busy={cargando || cargandoMas}>
            {cargando ? <p role="status">Cargando documentos…</p> :
              <TablaCompras filas={cuentas.map(cuenta => ({ cuenta }))} titulo="Cuentas por pagar consolidadas" modo="cuentas"
                acciones={{ ...acciones, seleccionar }} alDesplazar={cargarAlDesplazar} />}
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
                <label>Semana del <input type="date" value={semana} disabled={ocupado}
                  onChange={evento => evento.target.value && setSemana(lunes(evento.target.value))} /></label>
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
