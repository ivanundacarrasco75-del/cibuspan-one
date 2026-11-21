import type {CSSProperties, ReactNode} from 'react'
export type FilaGrafico = {id:string; nombre:string; etiqueta?:string; detalle?:string; valor:number}
type Desglose = {neto:number; resultado:number; materiales:number; manoObra:number; transporte:number; gastoCliente:number; cif:number; generales:number}
const n=(v:number)=>v.toLocaleString('es-EC',{maximumFractionDigits:1})
const usd=(v:number)=>v.toLocaleString('es-EC',{style:'currency',currency:'USD'})
const pct=(v:number|null)=>v===null?'—':n(v)+' %'
const ratio=(a:number,b:number)=>b>0?a/b*100:null
export function Panel({titulo, subtitulo, color, children, extra}: {titulo:string; subtitulo:string; color:string; children:ReactNode; extra?:ReactNode}) {
  return <section className="pn-panel" style={{'--acento': color} as CSSProperties}><header><div><h2>{titulo}</h2><p>{subtitulo}</p></div>{extra ?? <span className="pn-badge">TOP 5</span>}</header>{children}</section>
}

export function Columnas({filas}: {filas:FilaGrafico[]}) {
  const max = Math.max(1, ...filas.map(f => f.valor))
  return !filas.length ? <p className="pn-vacio">Sin ventas en este periodo.</p> : <svg className="pn-grafico" viewBox="0 0 300 145" role="img" aria-label="Los cinco SKU con más unidades facturadas">
    <defs><linearGradient id="pn-columnas" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b5a9ff"/><stop offset="100%" stopColor="#6255c9" stopOpacity=".45"/></linearGradient></defs>
    {[35, 70, 105].map(y => <line key={y} x1="8" x2="294" y1={y} y2={y} stroke="#ffffff0b"/>)}
    {filas.map((f, i) => {const h = f.valor / max * 89, x = 15 + i * 58; return <g key={f.id}><title>{f.nombre}: {n(f.valor)} unidades facturadas</title><rect x={x} y={111 - h} width="35" height={h} rx="5" fill="url(#pn-columnas)"/><text x={x + 17.5} y={103 - h} textAnchor="middle" className="pn-svg-numero">{n(f.valor)}</text><text x={x + 17.5} y="129" textAnchor="middle" className="pn-svg-texto" style={{fontSize:9}}><tspan x={x + 17.5}>{(f.etiqueta ?? f.nombre).slice(0,9)}</tspan><tspan x={x + 17.5} dy="12">{(f.etiqueta ?? f.nombre).slice(9,18)}</tspan></text></g>})}
  </svg>
}

export function Barras({filas, formato = n, tipo = 'barra'}: {filas:FilaGrafico[]; formato?:(n:number)=>string; tipo?:string}) {
  const min = Math.min(0, ...filas.map(f => f.valor)), max = Math.max(1, ...filas.map(f => f.valor))
  const inicio = 119, ancho = 128, cero = inicio + (0 - min) / (max - min) * ancho
  const x = (v:number) => inicio + (v - min) / (max - min) * ancho
  return !filas.length ? <p className="pn-vacio">Sin movimientos para este filtro.</p> : <svg className="pn-grafico" viewBox="0 0 300 145" role="img" aria-label={filas.map(f => `${f.nombre}: ${formato(f.valor)}`).join('; ')}>
    {min < 0 && <line x1={cero} x2={cero} y1="0" y2="140" stroke="#6d7a96" strokeDasharray="3 3"/>}
    {filas.map((f, i) => {const y = 13 + i * 27, valor = f.valor, fin = x(valor), negativo = valor < 0; return <g key={f.id}>
      <title>{f.nombre} · {f.detalle ?? ''}: {formato(valor)}</title>
      <text x="0" y={y + 4} className="pn-svg-texto">{f.etiqueta ?? f.nombre.slice(0,14)}</text>
      <line x1={inicio} x2={inicio + ancho} y1={y} y2={y} stroke="#ffffff08" strokeWidth={tipo === 'punto' ? 2 : 7} strokeLinecap="round"/>
      <line x1={cero} x2={fin} y1={y} y2={y} stroke={negativo ? '#ff8f9d' : 'var(--acento)'} strokeWidth={tipo === 'punto' ? 2 : 7} strokeLinecap="round" opacity={tipo === 'punto' ? '.55' : '.85'}/>
      {tipo === 'punto' && <circle cx={fin} cy={y} r="5" fill={negativo ? '#ff8f9d' : 'var(--acento)'}/>}
      <text x="298" y={y + 4} textAnchor="end" className="pn-svg-numero" style={negativo ? {fill: '#ff8f9d'} : undefined}>{formato(valor)}</text>
    </g>})}
  </svg>
}

export function Distribucion({filas,puente}: {filas:Desglose[];puente?:{facturado:number;descuentos:number;devoluciones:number}}) {
  const sumar = (campo:keyof Desglose) => filas.reduce((s, f) => s + f[campo], 0)
  const total = sumar('neto'), resultado = sumar('resultado')
  const partes = [{nombre: 'Materiales', valor: sumar('materiales'), color: '#9c8bef'}, {nombre: 'Mano de obra', valor: sumar('manoObra'), color: '#73b6ec'}, {nombre: 'Transporte', valor: sumar('transporte'), color: '#e3bc7c'}, {nombre: 'Gasto cliente', valor: sumar('gastoCliente'), color: '#e58fa9'}, {nombre:'CIF estimados',valor:sumar('cif'),color:'#80c9da'},{nombre:'Gastos generales',valor:sumar('generales'),color:'#cf9bdc'}, {nombre: 'Resultado', valor: resultado, color: '#75d5b3'}]
  let recorrido = 0
  const positivas = partes.filter(p => p.valor > 0), base = positivas.reduce((s, p) => s + p.valor, 0)
  return <>{puente && <div className="pn-puente-neto"><span>Facturado <b>{usd(puente.facturado)}</b></span><span>− Descuentos <b>{usd(puente.descuentos)}</b></span><span>− Devoluciones <b>{usd(puente.devoluciones)}</b></span><span>Venta neta <b>{usd(total)}</b></span></div>}<div className="pn-distribucion"><svg viewBox="0 0 140 140" role="img" aria-label={`Margen tras CIF y gastos generales ${pct(ratio(resultado, total))}. Devoluciones y descuentos ya restados de la venta neta.`}>
    <circle cx="70" cy="70" r="51" fill="none" stroke="#ffffff09" strokeWidth="11"/>
    {positivas.map(p => {const longitud = p.valor / Math.max(1, base) * 320.442, offset = recorrido; recorrido += longitud; return <circle key={p.nombre} cx="70" cy="70" r="51" fill="none" stroke={p.color} strokeWidth="11" strokeDasharray={`${Math.max(0, longitud - 3)} ${320.442 - Math.max(0, longitud - 3)}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)"><title>{p.nombre}: {usd(p.valor)}</title></circle>})}
    <text x="70" y="69" textAnchor="middle" className="pn-donut-numero" style={resultado<0?{fill:'#ff9ca9'}:undefined}>{pct(ratio(resultado, total))}</text><text x="70" y="87" textAnchor="middle" className="pn-donut-texto">TRAS GASTOS</text>
  </svg><ul>{partes.map(p => <li key={p.nombre}><span><i style={{background: p.color}}/>{p.nombre}</span><b className={p.valor < 0 ? 'pn-negativo' : ''}>{usd(p.valor)}</b></li>)}</ul>{resultado < 0 && <p className="pn-distribucion-aviso">Costos superiores a la venta neta. La pérdida se indica en rojo; el anillo representa los costos positivos.</p>}</div></>
}

