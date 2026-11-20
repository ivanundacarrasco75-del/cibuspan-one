const usd = n => n.toLocaleString('es-EC', {style: 'currency', currency: 'USD'})
const pct = n => n === null ? '—' : n.toLocaleString('es-EC', {maximumFractionDigits: 1}) + ' %'

export default function RentabilidadPreliminar({datos, productoIds}) {
  const filas = datos.filter(f => productoIds.includes(f.id)).map(f => {
    const neto = f.venta - f.descuento - f.devolucion
    const completo = [f.materiales, f.manoObra, f.transporte, f.gastoCliente].every(n => n !== null && Number.isFinite(n))
    const aporte = completo ? neto - f.materiales - f.manoObra - f.transporte - f.gastoCliente : null
    return {...f, neto, aporte, margen: aporte !== null && neto > 0 ? aporte / neto * 100 : null}
  })
  const completas = filas.filter(f => f.aporte !== null)
  const neto = completas.reduce((s, f) => s + f.neto, 0)
  const aporte = completas.reduce((s, f) => s + f.aporte, 0)
  const pendiente = completas.length !== filas.length
  const perdidas = completas.filter(f => f.aporte < 0).length
  const mejores = [...completas].sort((a, b) => b.aporte - a.aporte).slice(0, 5)
  const peores = [...completas].filter(f => f.margen !== null).sort((a, b) => a.margen - b.margen).slice(0, 5)
  const ranking = (titulo, lista, esMargen) => <section className="sku-ranking">
    <header><h3>{titulo}</h3><span>{esMargen ? 'Margen %' : 'USD'}</span></header>
    {!lista.length && <p className="sku-vacio">Sin movimientos con costos completos para este filtro.</p>}
    <ol>{lista.map(f => {
      const valor = esMargen ? f.margen : f.aporte
      const max = Math.max(1, ...lista.map(x => Math.abs(esMargen ? x.margen : x.aporte)))
      return <li key={f.id}><div className="rentabilidad-fila"><span className="sku-ranking-texto"><strong>{f.nombre}</strong><small>{esMargen ? `${usd(f.aporte)} de aporte` : `${pct(f.margen)} de margen`}{f.aporte < 0 ? ' · Genera pérdida' : ''}</small></span><b className={valor < 0 ? 'sku-negativo' : ''}>{esMargen ? pct(valor) : usd(valor)}</b></div>
        <div className="sku-track"><i style={{width: `${Math.abs(valor) / max * 100}%`, background: valor < 0 ? '#fb7185' : '#4ade80'}} /></div></li>
    })}</ol>
  </section>
  return <section className="rentabilidad-preliminar" aria-label="Contribución y margen preliminares">
    <header><div><span className="rentabilidad-etiqueta">NUEVO · DATOS DE EJEMPLO</span><h2>Contribución y margen</h2></div><span className="rentabilidad-formula">Después de descuentos, devoluciones y costos directos</span></header>
    <div className="sku-totales">
      <article><span>Venta neta comercial</span><strong>{usd(filas.reduce((s, f) => s + f.neto, 0))}</strong><small>Descuentos y devoluciones descontados</small></article>
      <article><span>Aporte del periodo</span><strong>{pendiente ? 'Costo pendiente' : usd(aporte)}</strong><small>{pendiente ? `${usd(aporte)} calculado en ${completas.length} de ${filas.length} SKU` : 'Después de todos los costos directos'}</small></article>
      <article><span>Margen de contribución</span><strong>{pendiente ? 'Pendiente' : pct(neto > 0 ? aporte / neto * 100 : null)}</strong><small>Aporte ÷ venta neta · Calculado sobre los totales</small></article>
      <article><span>SKU que generan pérdida</span><strong className={perdidas ? 'sku-negativo' : ''}>{perdidas}</strong><small>{filas.length} SKU con movimientos · {filas.length - completas.length} con costo pendiente</small></article>
    </div>
    <p className="sku-metodo">Venta neta = facturado − descuentos − devoluciones. Aporte = venta neta − materiales y empaques − mano de obra directa − transporte − gastos directos del cliente. El margen expresa cuánto deja cada dólar de venta neta. No incluye gastos generales, intereses ni impuestos. Las cifras de esta sección son ilustrativas; falta conectar el cálculo del reporte de rentabilidad con las fuentes reales.</p>
    <div className="sku-rankings">{ranking('5 SKU que más dinero dejan', mejores, false)}{ranking('5 SKU con menor margen', peores, true)}</div>
    <div className="sku-detalle"><header><h3>Rentabilidad por SKU</h3><span className="rentabilidad-formula">Rojo = pérdida</span></header><div className="sku-tabla-scroll"><table><thead><tr><th>SKU</th><th>Venta neta</th><th>Materiales y empaques</th><th>Mano de obra</th><th>Transporte</th><th>Gasto cliente</th><th>Aporte</th><th>Margen</th></tr></thead><tbody>{filas.map(f => <tr key={f.id}><th>{f.nombre}<small>{f.codigo}</small></th><td>{usd(f.neto)}</td><td>{f.materiales === null ? 'Costo pendiente' : usd(f.materiales)}</td><td>{f.manoObra === null ? 'Costo pendiente' : usd(f.manoObra)}</td><td>{f.transporte === null ? 'Costo pendiente' : usd(f.transporte)}</td><td>{f.gastoCliente === null ? 'Costo pendiente' : usd(f.gastoCliente)}</td><td className={f.aporte < 0 ? 'sku-negativo' : ''}><b>{f.aporte === null ? 'Costo pendiente' : usd(f.aporte)}</b></td><td className={f.margen < 0 ? 'sku-negativo' : ''}><b>{pct(f.margen)}</b></td></tr>)}</tbody></table></div>{!filas.length && <p className="sku-vacio">Este SKU no tiene movimientos en el ejemplo.</p>}</div>
  </section>
}
