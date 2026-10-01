import { useEffect, useMemo, useState } from "react"
import {
  obtenerGestionComercialDashboardDb,
  type ClienteGestionComercialDb,
  type GestionComercialDashboardDb,
  type KamKpiDb,
  type ResumenGestionComercialDb,
} from "../../repositories/kpiKamRepository"

type Props = {
  periodo: string
  cambiarPeriodo: (periodo: string) => void
  kamId: string
  cambiarKam: (kamId: string) => void
  clienteId: string
  cambiarCliente: (clienteId: string) => void
  kams: KamKpiDb[]
  refreshToken: number
  actualizar: () => void
  cambiarPantalla?: (pantalla: string) => void
  abrirAcciones: () => void
}

const RESUMEN_VACIO: ResumenGestionComercialDb = {
  venta_bruta: 0,
  venta_neta: 0,
  venta_neta_anterior: 0,
  crecimiento_pct: null,
  devoluciones: 0,
  devoluciones_pct: 0,
  margen_comercial_pct: null,
  cobertura_pct: null,
  quiebres_detectados: 0,
  codificaciones_nuevas: 0,
  descodificaciones: 0,
  acciones_pendientes: 0,
  acciones_vencidas: 0,
}

const VACIO: GestionComercialDashboardDb = {
  periodo: "",
  periodo_anterior: "",
  resumen: RESUMEN_VACIO,
  clientes: [],
}

export default function GestionComercialDashboard({
  periodo,
  cambiarPeriodo,
  kamId,
  cambiarKam,
  clienteId,
  cambiarCliente,
  kams,
  refreshToken,
  actualizar,
  cambiarPantalla,
  abrirAcciones,
}: Props) {
  const [datos, setDatos] = useState(VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError("")
    void obtenerGestionComercialDashboardDb(
      periodo,
      kamId === "TODOS" ? null : kamId,
    ).then((respuesta) => {
      if (!vigente) return
      setDatos(respuesta)
    }).catch((err) => {
      if (!vigente) return
      setDatos(VACIO)
      setError(err instanceof Error ? err.message : "No se pudo cargar Gestión Comercial.")
    }).finally(() => {
      if (vigente) setCargando(false)
    })
    return () => { vigente = false }
  }, [kamId, periodo, refreshToken])

  useEffect(() => {
    if (clienteId === "TODOS") return
    if (!datos.clientes.some((cliente) => cliente.id === clienteId)) {
      cambiarCliente("TODOS")
    }
  }, [cambiarCliente, clienteId, datos.clientes])

  const clienteSeleccionado = useMemo(
    () => datos.clientes.find((cliente) => cliente.id === clienteId) ?? null,
    [clienteId, datos.clientes],
  )
  const resumen = clienteSeleccionado
    ? resumenCliente(clienteSeleccionado)
    : datos.resumen

  function navegar(pantalla: string) {
    cambiarPantalla?.(pantalla)
  }

  return (
    <section className="gc-dashboard">
      <style>{css}</style>

      <section className="gc-filtros">
        <label><span>Periodo</span><input type="month" value={periodo} onChange={(e) => cambiarPeriodo(e.target.value)} /></label>
        <label><span>Responsable</span><select value={kamId} onChange={(e) => { cambiarKam(e.target.value); cambiarCliente("TODOS") }}><option value="TODOS">Todos los KAM</option>{kams.map((kam) => <option key={kam.user_id} value={kam.user_id}>{kam.nombre || kam.email}</option>)}</select></label>
        <label><span>Cliente</span><select value={clienteId} onChange={(e) => cambiarCliente(e.target.value)}><option value="TODOS">Todos los clientes</option>{datos.clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label>
        <button type="button" onClick={actualizar} disabled={cargando}>{cargando ? "Actualizando…" : "Actualizar datos"}</button>
      </section>

      {error && <div className="gc-error"><strong>No se pudo cargar el tablero.</strong><span>{error}</span><small>Instala la migración 202609300002 para activar esta vista.</small></div>}

      {!error && <>
        {clienteSeleccionado && <div className="gc-regreso"><button type="button" onClick={() => cambiarCliente("TODOS")}>← Volver a todos los clientes</button><span>Detalle de {clienteSeleccionado.nombre}</span></div>}

        <section className="gc-indicadores">
          <Tarjeta titulo="Venta neta del mes" valor={moneda(resumen.venta_neta)} detalle={`${moneda(resumen.venta_neta_anterior)} mes anterior`} tono="vino" onClick={() => navegar("Comercial · Ventas")} />
          <Tarjeta titulo="Crecimiento vs mes anterior" valor={porcentaje(resumen.crecimiento_pct)} detalle="Variación de venta neta" tono={tonoMayor(resumen.crecimiento_pct)} onClick={() => navegar("Comercial · Ventas")} />
          <Tarjeta titulo="Devoluciones" valor={porcentaje(resumen.devoluciones_pct)} detalle={`${moneda(resumen.devoluciones)} · meta ≤ 8%`} tono={resumen.devoluciones_pct <= 8 ? "verde" : resumen.devoluciones_pct <= 12 ? "naranja" : "rojo"} onClick={() => navegar("Comercial · Devoluciones")} />
          <Tarjeta titulo="Margen comercial" valor={porcentaje(resumen.margen_comercial_pct)} detalle={resumen.margen_comercial_pct == null ? "Costos incompletos" : "Después de costos variables"} tono={tonoMayor(resumen.margen_comercial_pct)} onClick={() => navegar("Pagos y Finanzas · Rentabilidad")} />
          <Tarjeta titulo="Cobertura SKU / local" valor={porcentaje(resumen.cobertura_pct)} detalle="Posiciones activas sobre objetivo" tono={resumen.cobertura_pct == null ? "gris" : resumen.cobertura_pct >= 95 ? "verde" : resumen.cobertura_pct >= 85 ? "naranja" : "rojo"} onClick={() => navegar("Comercial · Visitas y rotación")} />
          <Tarjeta titulo="Quiebres detectados" valor={entero(resumen.quiebres_detectados)} detalle="Última revisión disponible" tono={resumen.quiebres_detectados > 0 ? "rojo" : "verde"} onClick={() => navegar("Comercial · Visitas y rotación")} />
          <Tarjeta titulo="Codificaciones nuevas" valor={entero(resumen.codificaciones_nuevas)} detalle="Cambios registrados este mes" tono={resumen.codificaciones_nuevas > 0 ? "verde" : "gris"} onClick={() => navegar("Comercial · Visitas y rotación")} />
          <Tarjeta titulo="Descodificaciones" valor={entero(resumen.descodificaciones)} detalle="Cambios registrados este mes" tono={resumen.descodificaciones > 0 ? "rojo" : "verde"} onClick={() => navegar("Comercial · Visitas y rotación")} />
          <Tarjeta titulo="Acciones pendientes" valor={entero(resumen.acciones_pendientes)} detalle="Compromisos en gestión" tono={resumen.acciones_pendientes > 0 ? "naranja" : "verde"} onClick={abrirAcciones} />
          <Tarjeta titulo="Acciones vencidas" valor={entero(resumen.acciones_vencidas)} detalle="Requieren atención inmediata" tono={resumen.acciones_vencidas > 0 ? "rojo" : "verde"} onClick={abrirAcciones} />
        </section>

        <section className="gc-clientes">
          <header><div><span>CUENTAS CLAVE</span><h2>Resultado por cliente</h2></div><small>Las tarjetas permanecen visibles aunque el resultado sea cero.</small></header>
          <div className="gc-clientes-grid">
            {datos.clientes.map((cliente) => <ClienteCard key={cliente.id} cliente={cliente} activo={cliente.id === clienteId} onClick={() => cambiarCliente(cliente.id)} />)}
            {!cargando && datos.clientes.length === 0 && <div className="gc-vacio">No existen clientes asignados al KAM para este periodo.</div>}
          </div>
        </section>

        {clienteSeleccionado && <DetalleCliente cliente={clienteSeleccionado} navegar={navegar} abrirAcciones={abrirAcciones} />}
      </>}
    </section>
  )
}

function Tarjeta({ titulo, valor, detalle, tono, onClick }: { titulo: string; valor: string; detalle: string; tono: string; onClick?: () => void }) {
  return <button type="button" className={`gc-kpi ${tono}`} onClick={onClick}><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small><em>Abrir detalle →</em></button>
}

function ClienteCard({ cliente, activo, onClick }: { cliente: ClienteGestionComercialDb; activo: boolean; onClick: () => void }) {
  return <button type="button" className={`gc-cliente ${activo ? "activo" : ""}`} onClick={onClick}>
    <header><strong>{cliente.nombre}</strong><i className={cliente.variacion_pct == null ? "gris" : cliente.variacion_pct >= 0 ? "verde" : "rojo"}>{cliente.variacion_pct == null ? "—" : `${cliente.variacion_pct >= 0 ? "↑" : "↓"} ${Math.abs(cliente.variacion_pct).toFixed(1)}%`}</i></header>
    <b>{moneda(cliente.venta_neta)}</b>
    <div><span>Devoluciones <strong>{porcentaje(cliente.devoluciones_pct)}</strong></span><span>Cobertura <strong>{porcentaje(cliente.cobertura_pct)}</strong></span></div>
    <footer><span>{cliente.quiebres_detectados} quiebres</span><span>{cliente.acciones_vencidas} acciones vencidas</span></footer>
  </button>
}

function DetalleCliente({ cliente, navegar, abrirAcciones }: { cliente: ClienteGestionComercialDb; navegar: (pantalla: string) => void; abrirAcciones: () => void }) {
  return <section className="gc-detalle">
    <header><div><span>DETALLE DE CUENTA</span><h2>{cliente.nombre}</h2></div><nav><button type="button" onClick={() => navegar("Comercial · Visitas y rotación")}>Gestionar cobertura</button><button type="button" onClick={abrirAcciones}>Ver acciones</button></nav></header>
    <div className="gc-detalle-resumen">
      <Dato titulo="Venta actual" valor={moneda(cliente.venta_neta)} />
      <Dato titulo="Mes anterior" valor={moneda(cliente.venta_neta_anterior)} />
      <Dato titulo="Variación" valor={porcentaje(cliente.variacion_pct)} tono={tonoMayor(cliente.variacion_pct)} />
      <Dato titulo="Devoluciones" valor={`${moneda(cliente.devoluciones)} · ${porcentaje(cliente.devoluciones_pct)}`} tono={cliente.devoluciones_pct <= 8 ? "verde" : "rojo"} />
      <Dato titulo="Margen" valor={porcentaje(cliente.margen_comercial_pct)} />
    </div>
    <div className="gc-cobertura-resumen">
      <Dato titulo="Locales" valor={entero(cliente.locales)} />
      <Dato titulo="SKU codificados" valor={entero(cliente.sku_codificados)} tono="verde" />
      <Dato titulo="SKU descodificados" valor={entero(cliente.sku_descodificados)} tono={cliente.sku_descodificados > 0 ? "rojo" : "verde"} />
      <Dato titulo="SKU pendientes" valor={entero(cliente.sku_pendientes)} tono={cliente.sku_pendientes > 0 ? "naranja" : "verde"} />
      <Dato titulo="Cobertura" valor={porcentaje(cliente.cobertura_pct)} />
    </div>
    <div className="gc-tablas">
      <Tabla titulo="Venta por SKU" columnas={["SKU", "Actual", "Anterior", "Variación"]} filas={cliente.ventas_sku.map((fila) => [fila.producto, moneda(fila.venta_actual), moneda(fila.venta_anterior), porcentaje(fila.variacion_pct)])} vacio="No existen ventas por SKU en el periodo." />
      <Tabla titulo="Principales devoluciones por SKU" columnas={["SKU", "Unidades", "Valor"]} filas={cliente.devoluciones_sku.map((fila) => [fila.producto, numero(fila.unidades), moneda(fila.valor)])} vacio="No existen devoluciones por SKU." />
      <Tabla titulo="Principales locales con devoluciones" columnas={["Local", "Valor"]} filas={cliente.devoluciones_local.map((fila) => [fila.local, moneda(fila.valor)])} vacio="No existen devoluciones con local identificado." />
    </div>
  </section>
}

function Dato({ titulo, valor, tono = "" }: { titulo: string; valor: string; tono?: string }) {
  return <div className={`gc-dato ${tono}`}><span>{titulo}</span><strong>{valor}</strong></div>
}

function Tabla({ titulo, columnas, filas, vacio }: { titulo: string; columnas: string[]; filas: string[][]; vacio: string }) {
  return <section className="gc-tabla"><h3>{titulo}</h3><div><table><thead><tr>{columnas.map((columna) => <th key={columna}>{columna}</th>)}</tr></thead><tbody>{filas.length === 0 ? <tr><td colSpan={columnas.length}>{vacio}</td></tr> : filas.map((fila, indice) => <tr key={`${fila[0]}-${indice}`}>{fila.map((valor, celda) => <td key={`${indice}-${celda}`}>{valor}</td>)}</tr>)}</tbody></table></div></section>
}

function resumenCliente(cliente: ClienteGestionComercialDb): ResumenGestionComercialDb {
  return {
    venta_bruta: cliente.venta_bruta,
    venta_neta: cliente.venta_neta,
    venta_neta_anterior: cliente.venta_neta_anterior,
    crecimiento_pct: cliente.variacion_pct,
    devoluciones: cliente.devoluciones,
    devoluciones_pct: cliente.devoluciones_pct,
    margen_comercial_pct: cliente.margen_comercial_pct,
    cobertura_pct: cliente.cobertura_pct,
    quiebres_detectados: cliente.quiebres_detectados,
    codificaciones_nuevas: cliente.codificaciones_nuevas,
    descodificaciones: cliente.descodificaciones,
    acciones_pendientes: cliente.acciones_pendientes,
    acciones_vencidas: cliente.acciones_vencidas,
  }
}

function valorNumero(valor: unknown) {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : 0
}
function moneda(valor: unknown) { return valorNumero(valor).toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }) }
function numero(valor: unknown) { return valorNumero(valor).toLocaleString("es-EC", { maximumFractionDigits: 2 }) }
function entero(valor: unknown) { return Math.round(valorNumero(valor)).toLocaleString("es-EC") }
function porcentaje(valor: unknown) { return valor == null || !Number.isFinite(Number(valor)) ? "No disponible" : `${Number(valor).toFixed(1)}%` }
function tonoMayor(valor: unknown) { return valor == null ? "gris" : Number(valor) >= 0 ? "verde" : "rojo" }

const css = `
.gc-dashboard{display:grid;gap:14px}.gc-filtros{display:grid;grid-template-columns:1fr 1fr 1.2fr auto;gap:10px;padding:13px;border:1px solid #e5d9d3;border-radius:14px;background:#fff}.gc-filtros label{display:grid;gap:5px}.gc-filtros label span,.gc-clientes>header span,.gc-detalle>header span{color:#f28c18;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.gc-filtros input,.gc-filtros select{width:100%;border:1px solid #ddcfc8;border-radius:9px;background:#fbf9f7;padding:11px;color:#382b27;font-weight:800}.gc-filtros>button,.gc-regreso button,.gc-detalle nav button{align-self:end;border:0;border-radius:9px;background:#981f28;color:#fff;padding:12px 15px;font-weight:900;cursor:pointer}.gc-filtros>button:disabled{opacity:.55}.gc-error{display:grid;gap:5px;padding:18px;border:1px solid #edc5c8;border-radius:13px;background:#fff4f4;color:#9b2029}.gc-error span,.gc-error small{color:#765f5c}.gc-regreso{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border:1px solid #e5d9d3;border-radius:12px;background:#fff}.gc-regreso span{color:#6f615c;font-weight:800}.gc-indicadores{display:grid;grid-template-columns:repeat(5,minmax(180px,1fr));gap:10px}.gc-kpi{display:flex;min-height:160px;flex-direction:column;align-items:flex-start;text-align:left;padding:15px;border:1px solid #e5d9d3;border-top:5px solid #8f1d24;border-radius:13px;background:#fff;color:#342824;cursor:pointer}.gc-kpi:hover{box-shadow:0 7px 18px rgba(79,43,36,.1);transform:translateY(-1px)}.gc-kpi>span{font-size:11px;font-weight:900;text-transform:uppercase}.gc-kpi>strong{margin:14px 0 5px;color:#8f1d24;font-size:25px}.gc-kpi>small{color:#7d706b}.gc-kpi>em{margin-top:auto;padding-top:12px;color:#981f28;font-size:10px;font-style:normal;font-weight:900}.gc-kpi.verde{border-top-color:#168048}.gc-kpi.verde>strong{color:#168048}.gc-kpi.naranja{border-top-color:#e18d13}.gc-kpi.naranja>strong{color:#a96306}.gc-kpi.rojo{border-top-color:#a9212b}.gc-kpi.rojo>strong{color:#a9212b}.gc-kpi.gris{border-top-color:#9b8f89}.gc-kpi.gris>strong{color:#756963}.gc-clientes,.gc-detalle{border:1px solid #e4d8d2;border-radius:14px;background:#fff;overflow:hidden}.gc-clientes>header,.gc-detalle>header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:17px}.gc-clientes h2,.gc-detalle h2{margin:4px 0 0;color:#8f1d24}.gc-clientes>header small{color:#847771}.gc-clientes-grid{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:10px;padding:0 17px 17px}.gc-cliente{display:grid;gap:12px;padding:15px;border:1px solid #e3d8d2;border-radius:12px;background:#fbfaf8;color:#382c28;text-align:left;cursor:pointer}.gc-cliente:hover,.gc-cliente.activo{border-color:#c98477;background:#fff8f2;box-shadow:0 5px 15px rgba(76,40,34,.09)}.gc-cliente header{display:flex;justify-content:space-between;gap:10px}.gc-cliente header strong{font-size:12px}.gc-cliente header i{height:max-content;padding:4px 6px;border-radius:20px;background:#eee;font-size:9px;font-style:normal}.gc-cliente>b{color:#8f1d24;font-size:23px}.gc-cliente>div,.gc-cliente>footer{display:flex;justify-content:space-between;gap:8px}.gc-cliente>div span{display:grid;color:#81736d;font-size:9px}.gc-cliente>div strong{margin-top:3px;color:#4a3d38;font-size:12px}.gc-cliente>footer{padding-top:9px;border-top:1px solid #ebe1dc;color:#796b66;font-size:9px}.gc-vacio{grid-column:1/-1;padding:22px;color:#7b6e68;text-align:center}.gc-detalle>header nav{display:flex;gap:7px}.gc-detalle-resumen,.gc-cobertura-resumen{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid #ece2dd}.gc-cobertura-resumen{background:#faf7f4}.gc-dato{display:grid;gap:7px;padding:15px;border-right:1px solid #ece2dd}.gc-dato:last-child{border-right:0}.gc-dato span{color:#7d706b;font-size:9px;font-weight:900;text-transform:uppercase}.gc-dato strong{color:#8f1d24;font-size:18px}.verde{color:#168048!important}.naranja{color:#a96306!important}.rojo{color:#a9212b!important}.gris{color:#81756f!important}.gc-tablas{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px;padding:14px;border-top:1px solid #ece2dd}.gc-tabla{min-width:0;border:1px solid #e7ddd8;border-radius:11px;overflow:hidden}.gc-tabla h3{margin:0;padding:12px;color:#642927;font-size:14px}.gc-tabla>div{max-height:330px;overflow:auto}.gc-tabla table{width:100%;border-collapse:collapse}.gc-tabla th{position:sticky;top:0;padding:8px;background:#f4efec;color:#70615c;font-size:9px;text-align:left;text-transform:uppercase}.gc-tabla td{padding:9px 8px;border-top:1px solid #eee5e0;color:#4d403b;font-size:10px}.gc-tabla td:not(:first-child){text-align:right;white-space:nowrap}
@media(max-width:1200px){.gc-indicadores{grid-template-columns:repeat(3,1fr)}.gc-clientes-grid{grid-template-columns:repeat(2,1fr)}.gc-tablas{grid-template-columns:1fr}.gc-detalle-resumen,.gc-cobertura-resumen{grid-template-columns:repeat(3,1fr)}}
@media(max-width:720px){.gc-filtros,.gc-indicadores,.gc-clientes-grid,.gc-detalle-resumen,.gc-cobertura-resumen{grid-template-columns:1fr}.gc-filtros>button{width:100%}.gc-regreso,.gc-clientes>header,.gc-detalle>header{align-items:stretch;display:grid}.gc-detalle nav{display:grid!important}.gc-kpi{min-height:135px}.gc-dato{border-right:0;border-bottom:1px solid #ece2dd}.gc-clientes-grid{padding:0 12px 12px}}
`
