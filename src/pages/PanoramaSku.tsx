import {useEffect, useMemo, useState} from 'react'
import {obtenerTableroSku} from '../repositories/tableroSkuRepository'
import {resumirRentabilidadTableroSku, type DatosTableroSku} from '../utils/tableroSku'
import {fechaHoyCampoDashboard} from '../utils/dashboardVisitasRotacion'
import {Panel, Columnas, Barras, Distribucion, type FilaGrafico} from '../components/PanoramaGraficosSku'
import './PanoramaSku.css'

const n = (v:number) => v.toLocaleString('es-EC', {maximumFractionDigits:1})
const usd = (v:number|null) => v === null ? 'Pendiente' : v.toLocaleString('es-EC', {style:'currency',currency:'USD'})
const pct = (v:number|null) => v === null ? '—' : `${n(v)} %`
const ratio = (a:number,b:number) => b > 0 ? a / b * 100 : null
const top = (filas:FilaGrafico[], asc = false) => [...filas].sort((a,b) => (asc ? a.valor-b.valor : b.valor-a.valor) || a.nombre.localeCompare(b.nombre)).slice(0,5)
const VACIO:DatosTableroSku = {productos:[],clientes:[],asignaciones:[],ventas:null,devoluciones:null,visitas:null,costos:null,errores:[]}

export default function PanoramaSku({cambiarPantalla}:{cambiarPantalla:(pantalla:string)=>void}) {
  const [hoy] = useState(fechaHoyCampoDashboard)
  const [desde,setDesde] = useState(`${hoy.slice(0,7)}-01`), [hasta,setHasta] = useState(hoy)
  const [sku,setSku] = useState(''), [cliente,setCliente] = useState('')
  const [datos,setDatos] = useState(VACIO), [error,setError] = useState('')
  const [cargando,setCargando] = useState(true), [revision,setRevision] = useState(0)
  const valido = !!desde && !!hasta && desde <= hasta && hasta <= hoy
  useEffect(() => {
    let vigente = true
    if (!valido) {setCargando(false); return}
    setCargando(true); setError('')
    void obtenerTableroSku(desde,hasta).then(d => {if(vigente)setDatos(d)})
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
    <header className="pn-cabecera"><div><span className="pn-marca">CIBUSPAN <b>ONE</b><i> / </i> INTELIGENCIA COMERCIAL</span><h1>Panorama de SKU<span>●</span></h1></div><button type="button" className="pn-actualizar" disabled={cargando || !valido} onClick={()=>setRevision(r=>r+1)}>Actualizar</button></header>
    <section className="pn-filtros" aria-label="Filtros del panorama"><label>Desde<input type="date" value={desde} max={hasta} onChange={e=>setDesde(e.target.value)}/></label><label>Hasta<input type="date" value={hasta} min={desde} max={hoy} onChange={e=>setHasta(e.target.value)}/></label><label>Cliente<select value={cliente} onChange={e=>{setCliente(e.target.value);setSku('')}}><option value="">Todos los clientes</option>{datos.clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>SKU<select value={sku} onChange={e=>setSku(e.target.value)}><option value="">Todos los SKU activos asignados</option>{opciones.map(p=><option key={p.id} value={p.id}>{p.codigo} · {p.corto || p.nombre}</option>)}</select></label>{sku && <button onClick={()=>setSku('')}>Ver todos ×</button>}<button type="button" onClick={()=>cambiarPantalla('Rentabilidad por SKU')}>Rentabilidad completa ↗</button></section>
    {(!valido || error) && <p className="pn-error" role="alert">{error || 'Revisa las fechas del periodo.'}</p>}
    {cargando && <p className="pn-estado" role="status">Cargando ventas, devoluciones, visitas y costos…</p>}
    {!cargando && valido && !error && <>
    {datos.errores.length>0 && <div className="pn-error" role="alert">{datos.errores.map(e=><p key={e}>{e}</p>)}Los indicadores afectados quedan pendientes.</div>}
    {Math.abs(resumen.costosSinAsignar)>=.005 && <p className="pn-error">Hay {usd(resumen.costosSinAsignar)} en costos sin distribuir. El aporte queda pendiente.</p>}
    {(resumen.ventasSinVinculo>0 || filas.some(f=>f.devolucionesSinValor>0)) && <p className="pn-error">{resumen.ventasSinVinculo} líneas de venta sin vínculo único a cliente o producto. {filas.reduce((s,f)=>s+f.devolucionesSinValor,0)} líneas devueltas sin valor comprobado. Revisa sus vínculos o importes antes de tomar decisiones.</p>}
    <section className="pn-kpis" aria-label="Resumen comercial"><article><span>VENTA NETA COMERCIAL</span><strong>{usd(neto)}</strong><small>Facturado − descuentos − devoluciones</small></article><article><span>APORTE DEL PERIODO</span><strong className={(aporte??0)<0?'pn-negativo':'pn-menta'}>{usd(aporte)}</strong><small>Según costos directos registrados</small></article><article><span>MARGEN DE CONTRIBUCIÓN</span><strong className={(aporte??0)<0?'pn-negativo':''}>{aporte!==null && neto!==null ? pct(ratio(aporte,neto)) : 'Pendiente'}</strong><small>Calculado sobre los totales</small></article><article><span>UNIDADES DEVUELTAS</span><strong>{datos.devoluciones===null?'—':n(devueltas)}<em>{datos.ventas!==null && datos.devoluciones!==null ? pct(ratio(devueltas,unidades)):'—'}</em></strong><small>{usd(sumar('devolucion'))} en devoluciones</small></article></section>
    <div className="pn-senales"><span><i className="pn-dot-rojo"/><b>{perdidas.length} SKU con pérdida</b> · {completas.length} de {conMovimiento.length} con aporte calculado</span><span><i className="pn-dot-ambar"/><b>{datos.ventas===null?'—':sinVenta.length} SKU sin venta</b></span><span>{datos.ventas===null?'—':n(unidades)} u facturadas <i>·</i> {filas.length} SKU activos <i>·</i> {resumen.locales.length} locales con rotación</span></div>
    <div className="pn-grid">
      <Panel titulo="Los más vendidos" subtitulo="Unidades facturadas" color="#ac9af5"><Columnas filas={top(ventaGrafico)}/></Panel>
      <Panel titulo="Los de menor venta" subtitulo="Unidades · Solo venta positiva" color="#91b3ee"><Barras filas={top(ventaGrafico,true)} tipo="punto"/></Panel>
      <Panel titulo="Los más devueltos" subtitulo="Unidades devueltas · % al pasar el cursor" color="#eea0b0"><Barras filas={top(filas.filter(f=>f.devueltas>0).map(f=>({id:f.id,nombre:f.nombre,etiqueta:breve(f.id),detalle:`${pct(f.tasaDevolucion)} del facturado`,valor:f.devueltas})))}/></Panel>
      <Panel titulo="De la venta al aporte" subtitulo="Distribución de la venta neta" color="#75d5b3" extra={<span className="pn-badge">USD</span>}>{aporte!==null ? <Distribucion filas={costosCompletos}/> : <p className="pn-vacio">Costos o fuentes pendientes. No se presenta una distribución parcial.</p>}</Panel>
      <Panel titulo="Los que más dejan" subtitulo="Aporte después de costos directos · USD" color="#75d5b3"><Barras filas={top(completas.map(f=>({id:f.id,nombre:f.nombre,etiqueta:breve(f.id),detalle:`${pct(f.margen)} de margen`,valor:f.contribucion!})))} formato={v=>n(Math.round(v))}/></Panel>
      <Panel titulo="Los de menor margen" subtitulo="Margen de contribución · %" color="#a999f1"><Barras filas={top(completas.filter(f=>f.margen!==null).map(f=>({id:f.id,nombre:f.nombre,etiqueta:breve(f.id),detalle:`${usd(f.contribucion)} de aporte`,valor:f.margen!})),true)} formato={pct} tipo="punto"/></Panel>
      <Panel titulo="Locales de mayor rotación" subtitulo="Unidades/día por SKU observado" color="#7ed0dc"><Barras filas={top(resumen.locales.map(f=>({id:f.id,nombre:f.nombre,etiqueta:f.nombre.replace(/Supermaxi |Megamaxi /gi,'').slice(0,18),detalle:`${f.cliente} · ${f.skus} SKU · ${f.mediciones} mediciones semanales`,valor:f.rotacion})))} tipo="punto"/></Panel>
      <Panel titulo="SKU + local destacados" subtitulo="Rotación promedio · Unidades/día" color="#d3bf8d"><div className="pn-calor">{rotaciones.map(f=><div key={f.id} title={`${f.nombre} · ${f.local} · ${f.cliente} · ${f.semanas} semanas · Último dato ${f.fecha}`}><span>{breve(f.productoId)}<small>{f.local.replace(/Supermaxi |Megamaxi /gi,'')}</small></span><div>{Array.from({length:7},(_,i)=><i key={i} style={{opacity:i<Math.round(f.rotacion/maxRotacion*7) ? .35+i*.09:.07}}/>)}</div><b>{n(f.rotacion)}</b></div>)}{!rotaciones.length && <p className="pn-vacio">Sin rotaciones verificadas o manuales.</p>}</div></Panel>
    </div>
    <div className="pn-cobertura"><span>Rotación: última visita por SKU, local y semana; promedio de semanas disponibles. La cobertura varía entre locales.</span><span>{resumen.pendientes} mediciones semanales pendientes · Valores verificados o manuales</span></div>
    <section className="pn-detalle"><header><div><h2>Todos los números, en un mismo lugar.</h2><p>Detalle completo por SKU · Desliza horizontalmente para ver todos los costos.</p></div><span className="pn-badge">{filas.length} SKU</span></header><div className="pn-tabla"><table><thead><tr><th>Producto</th><th>Facturadas</th><th>Devueltas</th><th>Devolución %</th><th>Venta facturada</th><th>Descuentos</th><th>Valor devuelto</th><th>Venta neta</th><th>Materiales y empaques</th><th>Mano de obra</th><th>Transporte</th><th>Gasto cliente</th><th>Aporte</th><th>Margen</th><th>Venta tras devoluciones</th><th>Aporte tras materiales</th></tr></thead><tbody>{filas.map(f=><tr key={f.id}><th>{f.corto || f.nombre}<small>{f.codigo}</small></th><td>{datos.ventas===null?'—':n(f.unidades)}</td><td>{datos.devoluciones===null?'—':n(f.devueltas)}</td><td>{pct(f.tasaDevolucion)}</td><td>{usd(datos.ventas===null?null:f.venta)}</td><td>{usd(f.descuento)}</td><td>{usd(f.devolucion)}</td><td>{usd(f.netoComercial)}</td><td>{usd(f.materiales)}</td><td>{usd(f.manoObra)}</td><td>{usd(f.transporte)}</td><td>{usd(f.gastoCliente)}</td><td className={(f.contribucion??0)<0?'pn-negativo':'pn-menta'}><b>{usd(f.contribucion)}</b></td><td className={(f.contribucion??0)<0?'pn-negativo':''}>{pct(f.margen)}</td><td>{usd(f.neto)}</td><td>{usd(f.aporte)}</td></tr>)}</tbody></table></div>{!filas.length && <p className="pn-estado">Sin SKU activos asignados para este filtro.</p>}</section>
    <footer className="pn-metodo"><p><b>Lectura del margen.</b> Aporte = venta neta − materiales y empaques − mano de obra directa − transporte − gastos directos del cliente. Margen = aporte / venta neta × 100. Usa costos de materiales vigentes y gastos/nómina registrados de los meses del periodo, sin prorratearlos por día. No incluye gastos generales, intereses ni impuestos. Fuentes o costos incompletos se muestran como pendientes.</p><p><b>Devoluciones y promociones.</b> Devoluciones por fecha de registro; pueden corresponder a ventas anteriores. El reporte de rentabilidad atribuye devoluciones a su periodo de origen, por lo que puede diferir. Los descuentos aplican las promociones registradas vigentes en la fecha de venta. Los costos se distribuyen antes de filtrar cliente o SKU. Las semanas sin visita no se estiman.</p></footer>
    </>}
  </main></div>
}
