import {useEffect, useMemo, useState} from 'react'
import {obtenerTableroSku,obtenerPeriodosTableroSku} from '../repositories/tableroSkuRepository'
import {resumirRentabilidadTableroSku,rangoMesTableroSku, type DatosTableroSku} from '../utils/tableroSku'
import {Panel, Columnas, Barras, Distribucion, type FilaGrafico} from '../components/PanoramaGraficosSku'
import './PanoramaSku.css'

const n = (v:number) => v.toLocaleString('es-EC', {maximumFractionDigits:1})
const usd = (v:number|null) => v === null ? 'Pendiente' : v.toLocaleString('es-EC', {style:'currency',currency:'USD'})
const pct = (v:number|null) => v === null ? '—' : `${n(v)} %`
const ratio = (a:number,b:number) => b > 0 ? a / b * 100 : null
const top = (filas:FilaGrafico[], asc = false) => [...filas].sort((a,b) => (asc ? a.valor-b.valor : b.valor-a.valor) || a.nombre.localeCompare(b.nombre)).slice(0,5)
const VACIO:DatosTableroSku = {productos:[],clientes:[],asignaciones:[],ventas:null,devoluciones:null,visitas:null,costos:null,errores:[]}

export default function PanoramaSku({cambiarPantalla,abrirDevolucion}:{cambiarPantalla:(pantalla:string)=>void;abrirDevolucion?:(id:string)=>void}) {
  const [periodos,setPeriodos] = useState<string[]>([]), [periodo,setPeriodo] = useState('')
  const [cargandoPeriodos,setCargandoPeriodos] = useState(true), [errorPeriodos,setErrorPeriodos] = useState('')
  const [mostrarRevision,setMostrarRevision] = useState<'ventas'|'devoluciones'|null>(null)
  const {desde,hasta} = rangoMesTableroSku(periodo)
  const [sku,setSku] = useState(''), [cliente,setCliente] = useState('')
  const [datos,setDatos] = useState(VACIO), [error,setError] = useState('')
  const [cargando,setCargando] = useState(true), [revision,setRevision] = useState(0)
  const [periodoCargado,setPeriodoCargado] = useState('')
  const valido = periodos.includes(periodo) && !!desde && !cargandoPeriodos && !errorPeriodos
  useEffect(()=>{
    let vigente=true
    setCargandoPeriodos(true);setErrorPeriodos('')
    void obtenerPeriodosTableroSku().then(p=>{if(vigente){setPeriodos(p);setPeriodo(actual=>p.includes(actual)?actual:p[0]??'')}})
      .catch(e=>{if(vigente)setErrorPeriodos(e instanceof Error?e.message:'No se pudieron cargar los balances.')})
      .finally(()=>{if(vigente)setCargandoPeriodos(false)})
    return()=>{vigente=false}
  },[revision])
  useEffect(() => {
    let vigente = true
    if (!valido) {setCargando(false); return}
    setCargando(true); setError('')
    void obtenerTableroSku(desde,hasta).then(d => {if(vigente){setDatos(d);setPeriodoCargado(desde)}})
      .catch(e => {if(vigente)setError(e instanceof Error ? e.message : 'No se pudo cargar el tablero.')})
      .finally(() => {if(vigente)setCargando(false)})
    return () => {vigente=false}
  },[desde,hasta,valido,revision])
  const resumen = useMemo(() => resumirRentabilidadTableroSku(datos,desde,hasta,cliente,sku),[datos,desde,hasta,cliente,sku])
  const {financieras:filas} = resumen
  const sumar = (campo:'netoComercial'|'contribucion'|'devolucion') => {
    const fuente = campo==='netoComercial' ? datos.ventas!==null && datos.devoluciones!==null && datos.rentabilidad?.promociones!=null
      : campo==='devolucion' ? datos.devoluciones!==null : resumen.fuentesCompletas
    return fuente && filas.every(f=>f[campo]!==null) ? filas.reduce((s,f)=>s+f[campo]!,0) : null
  }
  const neto = sumar('netoComercial'), aporte = sumar('contribucion')
  const unidades = resumen.filas.reduce((s,f)=>s+f.unidades,0), devueltas = resumen.filas.reduce((s,f)=>s+f.devueltas,0)
  const sinVenta = datos.ventas === null ? [] : filas.filter(f=>f.unidades===0)
  const perdidas = filas.filter(f=>f.contribucion!==null && f.contribucion<0)
  const conMovimiento = filas.filter(f=>f.unidades!==0 || f.devueltas!==0 || f.venta!==0)
  const completas = conMovimiento.filter(f=>f.contribucion!==null)
  const porId = new Map(filas.map(f=>[f.id,f]))
  const breve = (id:string) => {const f=porId.get(id); return (f?.corto || f?.nombre || id).replace(/^PANGOLIN\s+/i,'').slice(0,17)}
  const ventaGrafico = filas.filter(f=>f.unidades>0).map(f=>({id:f.id,nombre:f.nombre,etiqueta:breve(f.id),valor:f.unidades}))
  const costosCompletos = filas.flatMap(f=>f.netoComercial!==null && f.contribucion!==null && f.materiales!==null && f.manoObra!==null && f.transporte!==null && f.gastoCliente!==null ? [{neto:f.netoComercial,aporte:f.contribucion,materiales:f.materiales,manoObra:f.manoObra,transporte:f.transporte,gastoCliente:f.gastoCliente}] : [])
  const opciones = datos.productos.filter(p=>datos.asignaciones.some(a=>a.producto_id===p.id && (!cliente || a.cliente_id===cliente)))
  const rotaciones = [...resumen.rotaciones].sort((a,b)=>b.rotacion-a.rotacion || a.nombre.localeCompare(b.nombre)).slice(0,5)
  const maxRotacion = Math.max(1,...rotaciones.map(f=>f.rotacion))
  return <div className="pn-app"><main className="pn-main">
    <header className="pn-cabecera"><div><span className="pn-marca">CIBUSPAN <b>ONE</b><i> / </i> INTELIGENCIA COMERCIAL</span><h1>Panorama de SKU<span>●</span></h1></div><button type="button" className="pn-actualizar" disabled={cargando || cargandoPeriodos} onClick={()=>setRevision(r=>r+1)}>Actualizar</button></header>
    <section className="pn-filtros" aria-label="Filtros del panorama"><label>Año<select value={periodo.slice(0,4)} disabled={cargandoPeriodos || !periodos.length} onChange={e=>setPeriodo(periodos.find(p=>p.startsWith(e.target.value))??'')}>{[...new Set(periodos.map(p=>p.slice(0,4)))].map(a=><option key={a}>{a}</option>)}</select></label><label>Mes<select value={periodo} disabled={cargandoPeriodos || !periodos.length} onChange={e=>setPeriodo(e.target.value)}>{periodos.filter(p=>p.startsWith(periodo.slice(0,4))).map(p=><option key={p} value={p}>{new Date(`${p}T12:00:00Z`).toLocaleDateString('es-EC',{month:'long',timeZone:'UTC'})}</option>)}</select></label><label>Cliente<select value={cliente} onChange={e=>{setCliente(e.target.value);setSku('')}}><option value="">Todos los clientes</option>{datos.clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>SKU<select value={sku} onChange={e=>setSku(e.target.value)}><option value="">Todos los SKU activos asignados</option>{opciones.map(p=><option key={p.id} value={p.id}>{p.codigo} · {p.corto || p.nombre}</option>)}</select></label>{sku && <button onClick={()=>setSku('')}>Ver todos ×</button>}<button type="button" onClick={()=>cambiarPantalla('Rentabilidad por SKU')}>Rentabilidad completa ↗</button></section>
    {errorPeriodos && <p className="pn-error" role="alert">{errorPeriodos} <button onClick={()=>cambiarPantalla('Costos indirectos')}>Revisar balances</button></p>}
    {!cargandoPeriodos && !errorPeriodos && !periodos.length && <p className="pn-error">No hay meses completos con balance cargado y cierre confirmado. <button onClick={()=>cambiarPantalla('Costos indirectos')}>Abrir balances</button></p>}
    {error && <p className="pn-error" role="alert">{error}</p>}
    {(cargandoPeriodos || cargando && valido) && <p className="pn-estado" role="status">Cargando balances cerrados, ventas, devoluciones y costos…</p>}
    {!cargando && valido && periodoCargado===periodo && !error && <>
    {datos.errores.length>0 && <div className="pn-error" role="alert">{datos.errores.map(e=><p key={e}>{e}</p>)}Los indicadores afectados quedan pendientes.</div>}
    {Math.abs(resumen.costosSinAsignar)>=.005 && <p className="pn-error">Hay {usd(resumen.costosSinAsignar)} en costos sin distribuir. El aporte queda pendiente.</p>}
    {!resumen.contabilidadCompleta && <p className="pn-error">El gasto asignado por cliente no está conciliado con el balance. <button onClick={()=>cambiarPantalla('Pagos y Finanzas · Clasificación de gastos')}>Revisar clasificación y asignaciones</button></p>}
    {(resumen.ventasPendientes.length>0 || resumen.devolucionesPendientes.length>0) && <div className="pn-error">{resumen.ventasPendientes.length>0 && <p><button onClick={()=>setMostrarRevision(m=>m==='ventas'?null:'ventas')}>Revisar {resumen.ventasPendientes.length} ventas sin vínculo ↗</button> · Solo registros del filtro seleccionado.</p>}{resumen.devolucionesPendientes.length>0 && <p><button onClick={()=>setMostrarRevision(m=>m==='devoluciones'?null:'devoluciones')}>Revisar {resumen.devolucionesPendientes.length} líneas devueltas sin importe ↗</button> · Sus SKU no entran al cálculo del margen hasta comprobar el documento.</p>}</div>}
    {mostrarRevision==='devoluciones' && resumen.devolucionesPendientes.length>0 && <section className="pn-detalle pn-revision"><header><div><h2>Devoluciones que necesitan importe</h2><p>Comprueba el valor en el documento original. No se estiman precios ni se sustituyen datos.</p></div><button onClick={()=>setMostrarRevision(null)}>Cerrar ×</button></header><div className="pn-tabla"><table><thead><tr><th>Documento</th><th>Fecha</th><th>SKU</th><th>Producto</th><th>Unidades</th><th>Revisión</th></tr></thead><tbody>{resumen.devolucionesPendientes.map((d,i)=><tr key={d.detalleId??i}><th>{d.documento}</th><td>{d.fecha}</td><td>{d.sku}</td><td>{d.producto}</td><td>{n(d.unidades)}</td><td><button onClick={()=>abrirDevolucion?abrirDevolucion(d.devolucionId):cambiarPantalla('Comercial · Devoluciones')}>Abrir este documento ↗</button></td></tr>)}</tbody></table></div></section>}
    {mostrarRevision==='ventas' && resumen.ventasPendientes.length>0 && <section className="pn-detalle pn-revision"><header><div><h2>Ventas que necesitan vínculo</h2><p>Identifica la factura y revisa su cliente o SKU en el catálogo.</p></div><button onClick={()=>cambiarPantalla('Comercial · Ventas')}>Abrir ventas ↗</button></header><div className="pn-tabla"><table><thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>SKU</th><th>Producto</th><th>Valor</th></tr></thead><tbody>{resumen.ventasPendientes.map((v,i)=><tr key={v.id??i}><th>{v.comprobante??'Sin referencia'}</th><td>{v.fecha_emision}</td><td>{v.cliente_nombre}</td><td>{v.sku}</td><td>{v.producto_nombre}</td><td>{usd(v.total_sin_impuestos)}</td></tr>)}</tbody></table></div></section>}
    <section className="pn-kpis" aria-label="Resumen comercial"><article><span>VENTA NETA COMERCIAL</span><strong>{usd(neto)}</strong><small>Facturado − descuentos − devoluciones</small></article><article><span>APORTE DEL PERIODO</span><strong className={(aporte??0)<0?'pn-negativo':'pn-menta'}>{usd(aporte)}</strong><small>Según costos directos registrados</small></article><article><span>MARGEN DE CONTRIBUCIÓN</span><strong className={(aporte??0)<0?'pn-negativo':''}>{aporte!==null && neto!==null ? pct(ratio(aporte,neto)) : 'Pendiente'}</strong><small>Calculado sobre los totales</small></article><article><span>UNIDADES DEVUELTAS</span><strong>{datos.devoluciones===null?'—':n(devueltas)}<em>{datos.ventas!==null && datos.devoluciones!==null ? pct(ratio(devueltas,unidades)):'—'}</em></strong><small>{usd(sumar('devolucion'))} en devoluciones</small></article></section>
    <div className="pn-senales"><span><i className="pn-dot-rojo"/><b>{perdidas.length} SKU con pérdida</b> · {completas.length} de {conMovimiento.length} con aporte calculado</span><span><i className="pn-dot-ambar"/><b>{datos.ventas===null?'—':sinVenta.length} SKU sin venta</b></span><span>{datos.ventas===null?'—':n(unidades)} u facturadas <i>·</i> {filas.length} SKU activos <i>·</i> {resumen.locales.length} locales con rotación</span></div>
    <div className="pn-grid">
      <Panel titulo="Los más vendidos" subtitulo="Unidades facturadas" color="#ac9af5"><Columnas filas={top(ventaGrafico)}/></Panel>
      <Panel titulo="Los de menor venta" subtitulo="Unidades · Solo venta positiva" color="#91b3ee"><Barras filas={top(ventaGrafico,true)} tipo="punto"/></Panel>
      <Panel titulo="Los más devueltos" subtitulo="Unidades devueltas · % al pasar el cursor" color="#eea0b0"><Barras filas={top(filas.filter(f=>f.devueltas>0).map(f=>({id:f.id,nombre:f.nombre,etiqueta:breve(f.id),detalle:`${pct(f.tasaDevolucion)} del facturado`,valor:f.devueltas})))}/></Panel>
      <Panel titulo="De la venta al aporte" subtitulo="Distribución de la venta neta" color="#75d5b3" extra={<span className="pn-badge">USD</span>}>{aporte!==null ? <Distribucion filas={costosCompletos}/> : <p className="pn-vacio">Costos o fuentes pendientes. No se presenta una distribución parcial.</p>}</Panel>
      <Panel titulo="Mayor aporte en dólares" subtitulo="Dinero que deja cada SKU · No es un ranking de %" color="#75d5b3" extra={<span className="pn-badge">{completas.length} SKU CALCULADOS</span>}><Barras filas={top(completas.map(f=>({id:f.id,nombre:f.nombre,etiqueta:breve(f.id),detalle:`${pct(f.margen)} de margen`,valor:f.contribucion!})))} formato={v=>n(Math.round(v))}/></Panel>
      <Panel titulo={completas.length<=5?'Margen de los SKU calculados':'Menores márgenes relativos'} subtitulo={completas.length<=5?'Todos los disponibles · Ordenados de menor a mayor %':'Porcentaje de venta neta · No implica pérdida'} color="#a999f1" extra={<span className="pn-badge">{completas.length} SKU CALCULADOS</span>}><Barras filas={top(completas.filter(f=>f.margen!==null).map(f=>({id:f.id,nombre:f.nombre,etiqueta:breve(f.id),detalle:`${usd(f.contribucion)} de aporte`,valor:f.margen!})),true)} formato={pct} tipo="punto"/></Panel>
      <Panel titulo="Locales de mayor rotación" subtitulo="Unidades/día por SKU observado" color="#7ed0dc"><Barras filas={top(resumen.locales.map(f=>({id:f.id,nombre:f.nombre,etiqueta:f.nombre.replace(/Supermaxi |Megamaxi /gi,'').slice(0,18),detalle:`${f.cliente} · ${f.skus} SKU · ${f.mediciones} mediciones semanales`,valor:f.rotacion})))} tipo="punto"/></Panel>
      <Panel titulo="SKU + local destacados" subtitulo="Rotación promedio · Unidades/día" color="#d3bf8d"><div className="pn-calor">{rotaciones.map(f=><div key={f.id} title={`${f.nombre} · ${f.local} · ${f.cliente} · ${f.semanas} semanas · Último dato ${f.fecha}`}><span>{breve(f.productoId)}<small>{f.local.replace(/Supermaxi |Megamaxi /gi,'')}</small></span><div>{Array.from({length:7},(_,i)=><i key={i} style={{opacity:i<Math.round(f.rotacion/maxRotacion*7) ? .35+i*.09:.07}}/>)}</div><b>{n(f.rotacion)}</b></div>)}{!rotaciones.length && <p className="pn-vacio">Sin rotaciones verificadas o manuales.</p>}</div></Panel>
    </div>
    <div className="pn-cobertura"><span>El aporte en dólares depende del volumen; el margen es un porcentaje. Pueden destacar los mismos SKU. Solo se comparan los que tienen importes y costos completos.</span><span>{resumen.pendientes} mediciones de rotación pendientes · Promedios de semanas disponibles</span></div>
    <section className="pn-detalle"><header><div><h2>Todos los números, en un mismo lugar.</h2><p>Detalle completo por SKU · Desliza horizontalmente para ver todos los costos.</p></div><span className="pn-badge">{filas.length} SKU</span></header><div className="pn-tabla"><table><thead><tr><th>Producto</th><th>Facturadas</th><th>Devueltas</th><th>Devolución %</th><th>Venta facturada</th><th>Descuentos</th><th>Valor devuelto</th><th>Venta neta</th><th>Materiales y empaques</th><th>Mano de obra</th><th>Transporte</th><th>Gasto cliente</th><th>Aporte</th><th>Margen</th><th>Venta tras devoluciones</th><th>Aporte tras materiales</th></tr></thead><tbody>{filas.map(f=><tr key={f.id}><th>{f.corto || f.nombre}<small>{f.codigo}</small></th><td>{datos.ventas===null?'—':n(f.unidades)}</td><td>{datos.devoluciones===null?'—':n(f.devueltas)}</td><td>{pct(f.tasaDevolucion)}</td><td>{usd(datos.ventas===null?null:f.venta)}</td><td>{usd(f.descuento)}</td><td>{usd(f.devolucion)}</td><td>{usd(f.netoComercial)}</td><td>{usd(f.materiales)}</td><td>{usd(f.manoObra)}</td><td>{usd(f.transporte)}</td><td>{usd(f.gastoCliente)}</td><td className={(f.contribucion??0)<0?'pn-negativo':'pn-menta'}><b>{usd(f.contribucion)}</b></td><td className={(f.contribucion??0)<0?'pn-negativo':''}>{pct(f.margen)}</td><td>{usd(f.neto)}</td><td>{usd(f.aporte)}</td></tr>)}</tbody></table></div>{!filas.length && <p className="pn-estado">Sin SKU activos asignados para este filtro.</p>}</section>
    <footer className="pn-metodo"><p><b>Fuentes del margen.</b> Aporte = venta neta − materiales y empaques − mano de obra directa − transporte − gastos directos del cliente. Materiales a costo vigente; mano de obra de la nómina del mes; transporte y gastos del cliente del libro mayor clasificado, conciliado con el balance. No se suman además las facturas. No incluye gastos generales, intereses ni impuestos. <button onClick={()=>cambiarPantalla('Pagos y Finanzas · Clasificación de gastos')}>Revisar gastos y asignaciones ↗</button> <button onClick={()=>cambiarPantalla('Costos indirectos')}>Ver balances ↗</button></p><p><b>Periodo y comparación.</b> Solo meses completos con balance cargado y cierre confirmado; por defecto el último disponible. Margen = aporte / venta neta × 100, calculado sobre totales. Los costos se distribuyen antes de filtrar. Devoluciones por fecha de registro; el reporte de rentabilidad usa origen y puede diferir también en sus fuentes históricas de gasto. Descuentos según promociones registradas en la fecha de venta. Rotación: última visita por SKU/local/semana, sin estimar semanas ausentes.</p></footer>
    </>}
  </main></div>
}
