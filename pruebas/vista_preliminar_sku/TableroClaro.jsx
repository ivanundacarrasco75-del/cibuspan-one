import {useMemo, useState} from 'react'
import {datos, rentabilidadEjemplo} from './datos.mjs'
import {resumirTableroSku} from '../../src/utils/tableroSku'
import './TableroClaro.css'

const num = n => n.toLocaleString('es-EC', {maximumFractionDigits: 1})
const usd = n => n.toLocaleString('es-EC', {style: 'currency', currency: 'USD'})
const pct = n => n === null ? '—' : `${num(n)} %`
const dividir = (n, d) => d > 0 ? n / d * 100 : null
const secciones = ['Resumen', 'Ventas', 'Devoluciones', 'Rentabilidad', 'Rotación', 'Detalle']

function Lista({titulo, subtitulo, filas, formato = num, ascendente = false, elegir}) {
  const top = [...filas].sort((a, b) => (ascendente ? a.valor - b.valor : b.valor - a.valor) || a.nombre.localeCompare(b.nombre)).slice(0, 5)
  const max = Math.max(1, ...top.map(f => Math.abs(f.valor)))
  return <article className="cl-panel"><header><div><h3>{titulo}</h3><p>{subtitulo}</p></div><span className="cl-top">TOP 5</span></header>
    {!top.length && <p className="cl-vacio">Sin movimientos para este filtro.</p>}
    <ol className="cl-lista">{top.map((f, i) => <li key={f.id}><span className="cl-posicion">{String(i + 1).padStart(2, '0')}</span><div className="cl-fila-contenido">
      <div className="cl-fila-titulo">{f.productoId ? <button onClick={() => elegir(f.productoId)}>{f.nombre}</button> : <strong>{f.nombre}</strong>}<b className={f.valor < 0 ? 'cl-rojo' : ''}>{formato(f.valor)}</b></div>
      <small>{f.detalle}</small><div className="cl-barra" aria-hidden="true"><i className={f.valor < 0 ? 'cl-fondo-rojo' : ''} style={{width: `${Math.abs(f.valor) / max * 100}%`}} /></div>
    </div></li>)}</ol>
  </article>
}

export default function TableroClaro() {
  const [seccion, setSeccion] = useState('Resumen')
  const [cliente, setCliente] = useState('')
  const [sku, setSku] = useState('')
  const [desde, setDesde] = useState('2026-11-01')
  const [hasta, setHasta] = useState('2026-11-20')
  const valido = !!desde && !!hasta && desde <= hasta
  const enPeriodo = fecha => valido && fecha >= desde && fecha <= hasta
  const resumen = useMemo(() => resumirTableroSku({...datos,
    ventas: enPeriodo('2026-11-15') ? datos.ventas : [],
    devoluciones: datos.devoluciones.filter(d => enPeriodo(d.fecha_devolucion)),
    visitas: datos.visitas.filter(v => enPeriodo(v.fecha)),
  }, cliente, sku), [cliente, sku, desde, hasta])
  const ids = new Set(resumen.filas.map(f => f.id))
  const financiera = rentabilidadEjemplo.filter(f => ids.has(f.id) && enPeriodo('2026-11-15')).map(f => {
    const neto = f.venta - f.descuento - f.devolucion
    const aporte = neto - f.materiales - f.manoObra - f.transporte - f.gastoCliente
    return {...f, neto, aporte, margen: dividir(aporte, neto)}
  })
  const porId = new Map(financiera.map(f => [f.id, f]))
  const sumar = campo => financiera.reduce((s, f) => s + f[campo], 0)
  const neto = sumar('neto'), aporte = sumar('aporte'), margen = dividir(aporte, neto)
  const unidades = resumen.filas.reduce((s, f) => s + f.unidades, 0)
  const devueltas = resumen.filas.reduce((s, f) => s + f.devueltas, 0)
  const sinVentas = resumen.filas.filter(f => f.unidades === 0)
  const perdidas = financiera.filter(f => f.aporte < 0)
  const masDevuelto = [...resumen.filas].sort((a, b) => b.devueltas - a.devueltas)[0]
  const comunes = resumen.filas.map(f => ({id: f.id, productoId: f.id, nombre: f.nombre, detalle: f.codigo, valor: f.unidades}))
  const beneficios = financiera.map(f => ({id: f.id, productoId: f.id, nombre: f.nombre, detalle: `${pct(f.margen)} de margen · ${usd(f.neto)} de venta neta`, valor: f.aporte}))
  const margenes = financiera.filter(f => f.margen !== null).map(f => ({id: f.id, productoId: f.id, nombre: f.nombre, detalle: `${usd(f.aporte)} de aporte${f.aporte < 0 ? ' · Genera pérdida' : ''}`, valor: f.margen}))
  const devueltos = resumen.filas.filter(f => f.devueltas > 0).map(f => ({id: f.id, productoId: f.id, nombre: f.nombre, detalle: `${pct(f.tasaDevolucion)} de las unidades facturadas`, valor: f.devueltas}))
  const verSku = id => {setSku(id); setSeccion('Detalle')}
  const lista = (titulo, subtitulo, filas, formato = num, ascendente = false) => <Lista {...{titulo, subtitulo, filas, formato, ascendente}} elegir={verSku} />
  const ventasPanel = <>{lista('Los más vendidos', 'Unidades facturadas en el periodo', comunes.filter(f => f.valor > 0))}{lista('Los de menor venta', 'Venta positiva · Los que no venden aparecen aparte', comunes.filter(f => f.valor > 0), num, true)}</>
  const rentabilidadPanel = <>{lista('Los que más dinero dejan', 'Aporte después de todos los costos directos', beneficios, usd)}{lista('Los de menor margen', 'Porcentaje sobre la venta neta', margenes, pct, true)}</>
  return <div className="cl-app">
    <div className="cl-demo"><span>VISTA PRELIMINAR · DATOS DE EJEMPLO</span><a href="./index.html">Comparar con el estilo anterior ↗</a></div>
    <main className="cl-main">
      <header className="cl-cabecera"><div><span className="cl-marca">CIBUSPAN <b>ONE</b><i>/</i> COMERCIAL</span><h1>El movimiento de tus SKU.</h1><p>Qué se vende, qué deja margen y dónde prestar atención.</p></div><span className="cl-version">02 <small>VISTA EJECUTIVA</small></span></header>
      <section className="cl-filtros" aria-label="Filtros"><label>Desde<input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label><label>Hasta<input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label><label>Cliente<select value={cliente} onChange={e => {setCliente(e.target.value); setSku('')}}><option value="">Todos los clientes</option>{datos.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>Producto<select value={sku} onChange={e => setSku(e.target.value)}><option value="">Todos los SKU activos asignados</option>{datos.productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>{sku && <button className="cl-limpiar" onClick={() => setSku('')}>Quitar SKU ×</button>}</section>
      {!valido ? <p role="alert" className="cl-rojo">Revisa las fechas del periodo.</p> : <>
      <section className="cl-kpis" aria-label="Resultados principales">
        <article><span>Venta neta comercial</span><strong>{usd(neto)}</strong><small>Después de descuentos y devoluciones</small></article>
        <article className="cl-kpi-destacado"><span>Aporte del periodo</span><strong>{usd(aporte)}</strong><small>Después de todos los costos directos</small></article>
        <article><span>Margen de contribución</span><strong>{pct(margen)}</strong><small>Lo que deja cada dólar de venta neta</small></article>
        <article><span>Unidades devueltas</span><strong>{num(devueltas)}<em>{pct(dividir(devueltas, unidades))}</em></strong><small>Respecto a las unidades facturadas</small></article>
      </section>
      <div className="cl-contexto"><span><b>{num(unidades)}</b> unidades facturadas</span><span><b>{resumen.filas.length}</b> SKU activos asignados</span><span><b>{resumen.locales.length}</b> locales con rotación</span><span><b>{resumen.pendientes}</b> mediciones pendientes</span></div>
      <nav className="cl-tabs" aria-label="Secciones del tablero">{secciones.map(s => <button key={s} aria-current={s === seccion ? 'page' : undefined} className={s === seccion ? 'activo' : ''} onClick={() => setSeccion(s)}>{s}</button>)}</nav>
      <header className="cl-titulo-seccion"><h2>{seccion === 'Resumen' ? 'Lo importante, primero.' : seccion}</h2><span>{seccion === 'Resumen' ? 'Resumen del periodo seleccionado' : 'Mismos datos · Otra forma de leerlos'}</span></header>
      {seccion === 'Resumen' && <>
        <section className="cl-atencion" aria-label="Puntos para revisar">
          <button onClick={() => setSeccion('Rentabilidad')}><span className="cl-punto cl-fondo-rojo"/><div><b>{perdidas.length} SKU {perdidas.length === 1 ? 'genera pérdida' : 'generan pérdidas'}</b><small>{perdidas.length ? `${perdidas[0].nombre} · ${usd(perdidas[0].aporte)}` : 'Ningún aporte negativo en este filtro'}</small></div><span>↗</span></button>
          <button onClick={() => setSeccion('Devoluciones')}><span className="cl-punto cl-ambar"/><div><b>Mayor devolución</b><small>{masDevuelto?.devueltas > 0 ? `${masDevuelto.nombre} · ${num(masDevuelto.devueltas)} unidades` : 'Sin devoluciones en este filtro'}</small></div><span>↗</span></button>
          <button onClick={() => setSeccion('Ventas')}><span className="cl-punto"/><div><b>{sinVentas.length} SKU sin venta</b><small>{sinVentas[0]?.nombre ?? 'Todos los SKU tienen venta registrada'}</small></div><span>↗</span></button>
        </section>
        <div className="cl-grid">{lista('Los que más dinero dejan', 'Aporte después de costos directos', beneficios, usd)}{lista('Los más vendidos', 'Unidades facturadas', comunes.filter(f => f.valor > 0))}</div>
      </>}
      {seccion === 'Ventas' && <><div className="cl-grid">{ventasPanel}</div><section className="cl-panel cl-separado"><h3>Sin venta en este periodo <span className="cl-top">{sinVentas.length} SKU</span></h3><div className="cl-chips">{sinVentas.map(f => <button key={f.id} onClick={() => verSku(f.id)}>{f.nombre} ↗</button>)}{!sinVentas.length && <p>Todos los SKU tienen ventas registradas.</p>}</div></section></>}
      {seccion === 'Devoluciones' && <div className="cl-grid">{lista('Los más devueltos', 'Unidades y porcentaje sobre lo facturado', devueltos)}<article className="cl-panel"><h3>El impacto de las devoluciones</h3><div className="cl-impacto"><strong>{usd(sumar('devolucion'))}</strong><p>Valor devuelto en este periodo</p></div><p className="cl-nota">Se muestra por fecha de registro. Puede corresponder a ventas anteriores; el porcentaje compara movimientos del periodo, sin vincular cada devolución a su factura de origen.</p><p className="cl-nota">La venta neta y el aporte ya descuentan este valor.</p></article></div>}
      {seccion === 'Rentabilidad' && <div className="cl-grid">{rentabilidadPanel}</div>}
      {seccion === 'Rotación' && <><div className="cl-grid">{lista('Los locales de mayor rotación', 'Promedio diario por SKU observado', resumen.locales.map(l => ({id: l.id, nombre: l.nombre, detalle: `${l.cliente} · ${l.skus} SKU · ${l.mediciones} mediciones semanales`, valor: l.rotacion})), n => `${num(n)} u/día`)}{lista('Los mejores SKU por local', 'Promedio de las semanas observadas', resumen.rotaciones.map(r => ({id: r.id, productoId: r.productoId, nombre: r.nombre, detalle: `${r.local} · ${r.cliente} · ${r.semanas} semanas · Último dato ${r.fecha}`, valor: r.rotacion})), n => `${num(n)} u/día`)}</div><p className="cl-nota cl-separado">Última visita por SKU, local y semana. Solo rotaciones verificadas o declaradas manualmente. Los promedios usan las semanas disponibles; cada SKU pesa igual dentro del local. La cobertura puede variar entre locales.</p></>}
      {(seccion === 'Detalle' || seccion === 'Rentabilidad') && <section className="cl-panel cl-separado"><header><div><h3>{seccion === 'Rentabilidad' ? 'De la venta al aporte' : 'Cada SKU, en detalle'}</h3><p>Desliza la tabla para consultar todos los indicadores.</p></div><span className="cl-top">{resumen.filas.length} SKU</span></header><div className="cl-tabla"><table><thead><tr><th>Producto</th><th>Facturadas</th><th>Devueltas</th><th>Devolución</th><th>Venta facturada</th><th>Descuentos</th><th>Valor devuelto</th><th>Venta neta</th><th>Materiales y empaques</th><th>Mano de obra</th><th>Transporte</th><th>Gasto cliente</th><th>Aporte</th><th>Margen</th><th>Aporte tras materiales</th></tr></thead><tbody>{resumen.filas.map(f => {
        const r = porId.get(f.id)
        return <tr key={f.id}><th>{f.nombre}<small>{f.codigo}</small></th><td>{num(f.unidades)}</td><td>{num(f.devueltas)}</td><td>{pct(f.tasaDevolucion)}</td><td>{usd(f.venta)}</td><td>{usd(r?.descuento ?? 0)}</td><td>{usd(f.valorDevuelto)}</td><td>{usd(r?.neto ?? 0)}</td><td>{usd(r?.materiales ?? 0)}</td><td>{usd(r?.manoObra ?? 0)}</td><td>{usd(r?.transporte ?? 0)}</td><td>{usd(r?.gastoCliente ?? 0)}</td><td className={(r?.aporte ?? 0) < 0 ? 'cl-rojo' : 'cl-verde'}><b>{usd(r?.aporte ?? 0)}</b></td><td className={(r?.aporte ?? 0) < 0 ? 'cl-rojo' : ''}><b>{pct(r?.margen ?? null)}</b></td><td>{usd(f.aporte ?? 0)}</td></tr>
      })}</tbody></table></div></section>}
      <details className="cl-metodo"><summary>Cómo se calculan los indicadores <span>+</span></summary><div><p><b>Venta neta comercial:</b> facturado − descuentos − devoluciones. <b>Aporte:</b> venta neta − materiales y empaques − mano de obra directa − transporte − gastos directos del cliente. No incluye gastos generales, intereses ni impuestos.</p><p><b>Margen:</b> aporte ÷ venta neta × 100. El margen general se calcula sobre los totales; no se promedian porcentajes. Sin venta neta positiva se muestra «—». En la integración real, los costos incompletos deberán aparecer como pendientes.</p><p><b>Comparación con el cálculo de materiales:</b> venta tras devoluciones {usd(resumen.filas.reduce((s, f) => s + (f.neto ?? 0), 0))}; aporte tras materiales {usd(resumen.filas.reduce((s, f) => s + (f.aporte ?? 0), 0))}. Este último todavía no descuenta promociones, mano de obra, transporte ni gasto del cliente.</p><p><b>Datos del ejemplo:</b> ventas y devoluciones del 15/11/2026, visitas del 18/11/2026. Los filtros trabajan sobre esas fechas ficticias. Solo se incluyen SKU activos con asignación activa al cliente. Esta vista no consulta ni modifica la base de datos.</p></div></details>
      </>}
      <footer className="cl-footer"><span>CIBUSPAN ONE · Decisiones comerciales</span><span>Diseño alternativo · Información ilustrativa</span></footer>
    </main>
  </div>
}
