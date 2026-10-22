type Contenido = { nombre: string; cliente: string; fecha_inicio: string; fecha_fin: string; observaciones?: string; productos: Array<{sku: string; nombre: string; tipo: string; valor: number}> }
export function mensajeDescuento(c: Contenido) {
 return { subject: `Descuento registrado: ${c.nombre}`.replace(/[\r\n]/g,' ').slice(0,200),
 text: [`CIBUSPAN ONE · Descuento registrado`, `Nombre: ${c.nombre}`, `Cliente: ${c.cliente}`, `Vigencia: ${c.fecha_inicio} al ${c.fecha_fin}`, '',
 ...c.productos.map(p=>`${p.sku} · ${p.nombre}: ${Number(p.valor)}${p.tipo==='PORCENTAJE'?'%':' USD por unidad'}`), '', `Observaciones: ${c.observaciones || 'Sin observaciones'}`].join('\n') }
}
