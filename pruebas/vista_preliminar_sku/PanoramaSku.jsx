import {useState} from 'react'
import {datos, rentabilidadEjemplo} from './datos.mjs'
import {resumirTableroSku} from '../../src/utils/tableroSku'
import './PanoramaSku.css'

const n = v => v.toLocaleString('es-EC', {maximumFractionDigits: 1})
const usd = v => v.toLocaleString('es-EC', {style: 'currency', currency: 'USD'})
const pct = v => v === null ? '—' : `${n(v)} %`
const ratio = (a, b) => b > 0 ? a / b * 100 : null
const nombres = ['Integral', 'Manjar', 'Centeno', 'Sanduchero', 'Maíz', 'Chocolate', 'Semillas']
const corto = id => nombres[Number(id.slice(1))] ?? id
const ordenar = (filas, campo, asc = false) => [...filas].sort((a, b) => (asc ? a[campo] - b[campo] : b[campo] - a[campo]) || a.id.localeCompare(b.id)).slice(0, 5)

function Panel({titulo, subtitulo, color, children, extra}) {
  return <section className="pn-panel" style={{'--acento': color}}><header><div><h2>{titulo}</h2><p>{subtitulo}</p></div>{extra ?? <span className="pn-badge">TOP 5</span>}</header>{children}</section>
}

function Columnas({filas}) {
  const max = Math.max(1, ...filas.map(f => f.unidades))
  return !filas.length ? <p className="pn-vacio">Sin ventas en este periodo.</p> : <svg className="pn-grafico" viewBox="0 0 300 145" role="img" aria-label="Los cinco SKU con más unidades facturadas">
    <defs><linearGradient id="pn-columnas" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b5a9ff"/><stop offset="100%" stopColor="#6255c9" stopOpacity=".45"/></linearGradient></defs>
    {[35, 70, 105].map(y => <line key={y} x1="8" x2="294" y1={y} y2={y} stroke="#ffffff0b"/>)}
    {filas.map((f, i) => {const h = f.unidades / max * 89, x = 15 + i * 58; return <g key={f.id}><title>{f.nombre}: {n(f.unidades)} unidades facturadas</title><rect x={x} y={111 - h} width="35" height={h} rx="5" fill="url(#pn-columnas)"/><text x={x + 17.5} y={103 - h} textAnchor="middle" className="pn-svg-numero">{n(f.unidades)}</text><text x={x + 17.5} y="131" textAnchor="middle" className="pn-svg-texto">{corto(f.id)}</text></g>})}
  </svg>
}

function Barras({filas, campo = 'valor', formato = n, tipo = 'barra'}) {
  const min = Math.min(0, ...filas.map(f => f[campo])), max = Math.max(1, ...filas.map(f => f[campo]))
  const inicio = 119, ancho = 128, cero = inicio + (0 - min) / (max - min) * ancho
  const x = v => inicio + (v - min) / (max - min) * ancho
  return !filas.length ? <p className="pn-vacio">Sin movimientos para este filtro.</p> : <svg className="pn-grafico" viewBox="0 0 300 145" role="img" aria-label={filas.map(f => `${f.nombre}: ${formato(f[campo])}`).join('; ')}>
    {min < 0 && <line x1={cero} x2={cero} y1="0" y2="140" stroke="#6d7a96" strokeDasharray="3 3"/>}
    {filas.map((f, i) => {const y = 13 + i * 27, valor = f[campo], fin = x(valor), negativo = valor < 0; return <g key={f.id}>
      <title>{f.nombre} · {f.detalle ?? ''}: {formato(valor)}</title>
      <text x="0" y={y + 4} className="pn-svg-texto">{f.etiqueta ?? corto(f.id)}</text>
      <line x1={inicio} x2={inicio + ancho} y1={y} y2={y} stroke="#ffffff08" strokeWidth={tipo === 'punto' ? 2 : 7} strokeLinecap="round"/>
      <line x1={cero} x2={fin} y1={y} y2={y} stroke={negativo ? '#ff8f9d' : 'var(--acento)'} strokeWidth={tipo === 'punto' ? 2 : 7} strokeLinecap="round" opacity={tipo === 'punto' ? '.55' : '.85'}/>
      {tipo === 'punto' && <circle cx={fin} cy={y} r="5" fill={negativo ? '#ff8f9d' : 'var(--acento)'}/>}
      <text x="298" y={y + 4} textAnchor="end" className="pn-svg-numero" style={negativo ? {fill: '#ff8f9d'} : undefined}>{formato(valor)}</text>
    </g>})}
  </svg>
}

function Distribucion({filas}) {
  const sumar = campo => filas.reduce((s, f) => s + f[campo], 0)
  const total = sumar('neto'), aporte = sumar('aporte')
  const partes = [{nombre: 'Materiales', valor: sumar('materiales'), color: '#9c8bef'}, {nombre: 'Mano de obra', valor: sumar('manoObra'), color: '#73b6ec'}, {nombre: 'Transporte', valor: sumar('transporte'), color: '#e3bc7c'}, {nombre: 'Gasto cliente', valor: sumar('gastoCliente'), color: '#e58fa9'}, {nombre: 'Aporte', valor: aporte, color: '#75d5b3'}]
  let recorrido = 0
  const positivas = partes.filter(p => p.valor > 0), base = positivas.reduce((s, p) => s + p.valor, 0)
  return <div className="pn-distribucion"><svg viewBox="0 0 140 140" role="img" aria-label={`Margen de contribución ${pct(ratio(aporte, total))}. Distribución de la venta neta entre costos y aporte.`}>
    <circle cx="70" cy="70" r="51" fill="none" stroke="#ffffff09" strokeWidth="11"/>
    {positivas.map(p => {const longitud = p.valor / Math.max(1, base) * 320.442, offset = recorrido; recorrido += longitud; return <circle key={p.nombre} cx="70" cy="70" r="51" fill="none" stroke={p.color} strokeWidth="11" strokeDasharray={`${Math.max(0, longitud - 3)} ${320.442 - Math.max(0, longitud - 3)}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"><title>{p.nombre}: {usd(p.valor)}</title></circle>})}
    <text x="70" y="69" textAnchor="middle" className="pn-donut-numero">{pct(ratio(aporte, total))}</text><text x="70" y="87" textAnchor="middle" className="pn-donut-texto">MARGEN</text>
  </svg><ul>{partes.map(p => <li key={p.nombre}><span><i style={{background: p.color}}/>{p.nombre}</span><b className={p.valor < 0 ? 'pn-negativo' : ''}>{usd(p.valor)}</b></li>)}</ul>{aporte < 0 && <p className="pn-distribucion-aviso">Costos superiores a la venta neta. La pérdida se indica en rojo; el anillo representa los costos positivos.</p>}</div>
}

export default function PanoramaSku() {
  const [sku, setSku] = useState(''), [cliente, setCliente] = useState('')
  const [desde, setDesde] = useState('2026-11-01'), [hasta, setHasta] = useState('2026-11-20')
  const valido = !!desde && !!hasta && desde <= hasta
  const enPeriodo = fecha => valido && fecha >= desde && fecha <= hasta
  const resumen = resumirTableroSku({...datos, ventas: enPeriodo('2026-11-15') ? datos.ventas : [], devoluciones: datos.devoluciones.filter(d => enPeriodo(d.fecha_devolucion)), visitas: datos.visitas.filter(v => enPeriodo(v.fecha))}, cliente, sku)
  const ids = new Set(resumen.filas.map(f => f.id))
  const filas = rentabilidadEjemplo.filter(f => ids.has(f.id) && enPeriodo('2026-11-15')).map(f => {const neto = f.venta - f.descuento - f.devolucion; const aporte = neto - f.materiales - f.manoObra - f.transporte - f.gastoCliente; return {...f, neto, aporte, margen: ratio(aporte, neto)}})
  const porId = new Map(filas.map(f => [f.id, f])), sumar = campo => filas.reduce((s, f) => s + f[campo], 0)
  const unidades = resumen.filas.reduce((s, f) => s + f.unidades, 0), devueltas = resumen.filas.reduce((s, f) => s + f.devueltas, 0)
  const sinVenta = resumen.filas.filter(f => f.unidades === 0), perdidas = filas.filter(f => f.aporte < 0)
  const masVendidos = ordenar(resumen.filas.filter(f => f.unidades > 0), 'unidades')
  const menosVendidos = ordenar(resumen.filas.filter(f => f.unidades > 0), 'unidades', true)
  const devueltos = ordenar(resumen.filas.filter(f => f.devueltas > 0), 'devueltas')
  const rotaciones = ordenar(resumen.rotaciones, 'rotacion'), maxRotacion = Math.max(1, ...rotaciones.map(f => f.rotacion))
  return <div className="pn-app"><main className="pn-main">
    <header className="pn-cabecera"><div><span className="pn-marca">CIBUSPAN <b>ONE</b><i> / </i> INTELIGENCIA COMERCIAL</span><h1>Panorama de SKU<span>●</span></h1></div><div className="pn-demo"><b>VISTA PRELIMINAR</b><span>Datos de ejemplo · Sin conexión a la base</span></div></header>
    <section className="pn-filtros" aria-label="Filtros del panorama"><label>Desde<input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)}/></label><label>Hasta<input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)}/></label><label>Cliente<select value={cliente} onChange={e => {setCliente(e.target.value); setSku('')}}><option value="">Todos los clientes</option>{datos.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>SKU<select value={sku} onChange={e => setSku(e.target.value)}><option value="">Todos los SKU activos asignados</option>{datos.productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>{sku && <button onClick={() => setSku('')}>Ver todos ×</button>}<a href="./index.html">Primer diseño ↗</a></section>
    {!valido ? <p role="alert">Revisa las fechas del periodo.</p> : <>
    <section className="pn-kpis" aria-label="Resumen comercial"><article><span>VENTA NETA COMERCIAL</span><strong>{usd(sumar('neto'))}</strong><small>Facturado − descuentos − devoluciones</small></article><article><span>APORTE DEL PERIODO</span><strong className={sumar('aporte') < 0 ? 'pn-negativo' : 'pn-menta'}>{usd(sumar('aporte'))}</strong><small>Después de todos los costos directos</small></article><article><span>MARGEN DE CONTRIBUCIÓN</span><strong className={sumar('aporte') < 0 ? 'pn-negativo' : ''}>{pct(ratio(sumar('aporte'), sumar('neto')))}</strong><small>Calculado sobre los totales</small></article><article><span>UNIDADES DEVUELTAS</span><strong>{n(devueltas)}<em>{pct(ratio(devueltas, unidades))}</em></strong><small>{usd(sumar('devolucion'))} en devoluciones</small></article></section>
    <div className="pn-senales"><span><i className="pn-dot-rojo"/><b>{perdidas.length} SKU con pérdida</b>{perdidas.length > 0 && ` · ${perdidas.map(f => corto(f.id)).join(', ')}`}</span><span><i className="pn-dot-ambar"/><b>{sinVenta.length} SKU sin venta</b>{sinVenta.length > 0 && ` · ${sinVenta.map(f => corto(f.id)).join(', ')}`}</span><span>{n(unidades)} u facturadas <i>·</i> {resumen.filas.length} SKU activos <i>·</i> {resumen.locales.length} locales con rotación</span></div>
    <div className="pn-grid">
      <Panel titulo="Los más vendidos" subtitulo="Unidades facturadas" color="#ac9af5"><Columnas filas={masVendidos}/></Panel>
      <Panel titulo="Los de menor venta" subtitulo="Unidades · Solo venta positiva" color="#91b3ee"><Barras filas={menosVendidos} campo="unidades" tipo="punto"/></Panel>
      <Panel titulo="Los más devueltos" subtitulo="Unidades devueltas · % al pasar el cursor" color="#eea0b0"><Barras filas={devueltos.map(f => ({...f, detalle: `${pct(f.tasaDevolucion)} del facturado`}))} campo="devueltas"/></Panel>
      <Panel titulo="De la venta al aporte" subtitulo="Distribución de la venta neta" color="#75d5b3" extra={<span className="pn-badge">USD</span>}><Distribucion filas={filas}/></Panel>
      <Panel titulo="Los que más dejan" subtitulo="Aporte después de costos directos · USD" color="#75d5b3"><Barras filas={ordenar(filas, 'aporte')} campo="aporte" formato={v => n(Math.round(v))}/></Panel>
      <Panel titulo="Los de menor margen" subtitulo="Margen de contribución · %" color="#a999f1"><Barras filas={ordenar(filas.filter(f => f.margen !== null), 'margen', true)} campo="margen" formato={pct} tipo="punto"/></Panel>
      <Panel titulo="Locales de mayor rotación" subtitulo="Unidades/día por SKU observado" color="#7ed0dc"><Barras filas={ordenar(resumen.locales, 'rotacion').map(f => ({...f, etiqueta: f.nombre.replace(/Supermaxi |Megamaxi /g, ''), detalle: `${f.cliente} · ${f.skus} SKU · ${f.mediciones} mediciones semanales`}))} campo="rotacion" tipo="punto"/></Panel>
      <Panel titulo="SKU + local destacados" subtitulo="Rotación promedio · Unidades/día" color="#d3bf8d"><div className="pn-calor">{rotaciones.map(f => <div key={f.id} title={`${f.nombre} · ${f.local} · ${f.cliente} · ${f.semanas} semanas · Último dato ${f.fecha}`}><span>{corto(f.productoId)}<small>{f.local.replace(/Supermaxi |Megamaxi /g, '')}</small></span><div>{Array.from({length: 7}, (_, i) => <i key={i} style={{opacity: i < Math.round(f.rotacion / maxRotacion * 7) ? .35 + i * .09 : .07}}/>)}</div><b>{n(f.rotacion)}</b></div>)}{!rotaciones.length && <p className="pn-vacio">Sin rotaciones verificadas o manuales.</p>}</div></Panel>
    </div>
    <div className="pn-cobertura"><span>Rotación: última visita por SKU, local y semana; promedio de semanas disponibles. La cobertura varía entre locales.</span><span>{resumen.pendientes} mediciones semanales pendientes · Valores verificados o manuales</span></div>
    <section className="pn-detalle"><header><div><h2>Todos los números, en un mismo lugar.</h2><p>Detalle completo por SKU · Desliza horizontalmente para ver todos los costos.</p></div><span className="pn-badge">{resumen.filas.length} SKU</span></header><div className="pn-tabla"><table><thead><tr><th>Producto</th><th>Facturadas</th><th>Devueltas</th><th>Devolución %</th><th>Venta facturada</th><th>Descuentos</th><th>Valor devuelto</th><th>Venta neta</th><th>Materiales y empaques</th><th>Mano de obra</th><th>Transporte</th><th>Gasto cliente</th><th>Aporte</th><th>Margen</th><th>Venta tras devoluciones</th><th>Aporte tras materiales</th></tr></thead><tbody>{resumen.filas.map(f => {const r = porId.get(f.id); return <tr key={f.id}><th>{f.nombre}<small>{f.codigo}</small></th><td>{n(f.unidades)}</td><td>{n(f.devueltas)}</td><td>{pct(f.tasaDevolucion)}</td><td>{usd(f.venta)}</td><td>{usd(r?.descuento ?? 0)}</td><td>{usd(f.valorDevuelto)}</td><td>{usd(r?.neto ?? 0)}</td><td>{usd(r?.materiales ?? 0)}</td><td>{usd(r?.manoObra ?? 0)}</td><td>{usd(r?.transporte ?? 0)}</td><td>{usd(r?.gastoCliente ?? 0)}</td><td className={(r?.aporte ?? 0) < 0 ? 'pn-negativo' : 'pn-menta'}><b>{usd(r?.aporte ?? 0)}</b></td><td className={(r?.aporte ?? 0) < 0 ? 'pn-negativo' : ''}>{pct(r?.margen ?? null)}</td><td>{usd(f.neto ?? 0)}</td><td>{usd(f.aporte ?? 0)}</td></tr>})}</tbody></table></div></section>
    <footer className="pn-metodo"><p><b>Lectura del margen.</b> Aporte = venta neta − materiales y empaques − mano de obra directa − transporte − gastos directos del cliente. Margen = aporte / venta neta × 100. No incluye gastos generales, intereses ni impuestos. El aporte tras materiales es una referencia anterior que todavía no resta todos estos conceptos.</p><p><b>Datos ilustrativos.</b> Las ventas y devoluciones del ejemplo son del 15/11/2026; las visitas del 18/11/2026. Las devoluciones se toman por fecha de registro y pueden corresponder a ventas anteriores. Los porcentajes comparan movimientos del periodo. Falta integrar la rentabilidad real; los costos incompletos deberán aparecer como pendientes. Ninguna cifra de esta vista corresponde a resultados reales.</p></footer>
    </>}
  </main></div>
}
