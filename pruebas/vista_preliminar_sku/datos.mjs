// Datos ficticios para revisar el diseño. No se consulta Supabase.
const nombres = ['Pan integral 600 g', 'Botón de manjar 360 g', 'Pan de centeno 500 g', 'Pan sanduchero 800 g', 'Botón de maíz 350 g', 'Rollo chocolate 500 g', 'Granos y semillas 500 g']
const productos = nombres.map((nombre, i) => ({id: 'p' + i, codigo: '7868304262' + i, nombre, corto: ''}))
export const datos = {
  productos, clientes: [{id: 'c', nombre: 'CORPORACIÓN FAVORITA S. A.'}],
  asignaciones: productos.map(p => ({cliente_id: 'c', producto_id: p.id})),
  ventas: productos.slice(0, 6).map((p, i) => ({cliente_id: 'c', cliente_nombre: 'CORPORACIÓN FAVORITA S. A.', producto_id: p.id, sku: p.codigo, cantidad: 1000 - i * 130, total_sin_impuestos: (1000 - i * 130) * 1.9})),
  devoluciones: [{cliente: {id: 'c'}, fecha_devolucion: '2026-11-15', detalles: productos.slice(0, 4).map((p, i) => ({producto_id: p.id, unidades: 10 + i * 8, valor_total_documento: (10 + i * 8) * 1.9}))}],
  costos: productos.map(p => ({producto_id: p.id, costo_materiales_unidad: .8, items_sin_costo: 0})),
  visitas: productos.slice(0, 6).map((p, i) => ({id: 'r' + i, cliente_id: 'c', cliente_nombre: 'CORPORACIÓN FAVORITA S. A.', local_id: 'l' + i, local_nombre: ['Supermaxi Bosque', 'Supermaxi El Jardín', 'Megamaxi Scala', 'Supermaxi San Carlos', 'Supermaxi Carcelén', 'Supermaxi Quicentro'][i], producto_id: p.id, producto_nombre: p.nombre, fecha: '2026-11-18', visitado_en: '2026-11-18T12:00:00Z', actualizado_en: '2026-11-18T12:00:00Z', lector_estado: 'RESPALDO_MANUAL', valores: {rotacion: 5.1 - i * .6}})),
  errores: [],
}
export const rentabilidadEjemplo = datos.ventas.map((venta, i) => {
  const devolucion = datos.devoluciones[0].detalles.find(d => d.producto_id === venta.producto_id)
  return {
    id: venta.producto_id, nombre: nombres[i], codigo: venta.sku,
    venta: venta.total_sin_impuestos, descuento: [90, 60, 35, 40, 45, 20][i],
    devolucion: devolucion?.valor_total_documento ?? 0,
    materiales: venta.cantidad * .8, manoObra: venta.cantidad * .25,
    transporte: venta.cantidad * .1, gastoCliente: [40, 35, 60, 180, 500, 90][i],
  }
})
