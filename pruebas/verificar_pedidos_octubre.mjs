import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { interpretarListadoFavorita, leerPedidosFavoritaZip } from '../src/utils/pedidosFavoritaZip.ts'
import { interpretarPedidoTutiTexto } from '../src/utils/pedidosClientesPdf.ts'

const cabecera = 'No. Mercado,Mercado,Fecha Pedido,No. Orden,Fecha Entrega,No. Proveedor,Codigo de Barra,Descripcion,Tamano,Empaque,Cantidad,Unidad de Medida,Precio Unitario,Total'
const fila = (orden = '100600000001', entrega = '20261001', cantidad = '3.0000') =>
  `100,100 - CENTRO DE DISTRIBUCION,20260930,${orden},${entrega},0000012211,0007868304262189,"Integral, 600g",600g,5,${cantidad},g,1.62,24.30`
const txt = (orden, entrega, cantidad) => `${cabecera}\r\n${fila(orden, entrega, cantidad)}\r\n`

test('El listado conserva orden, pedido y entrega distintos y convierte cajas a unidades', () => {
  const [p] = interpretarListadoFavorita('\uFEFF' + txt())
  assert.equal(p.numeroPedido, '100600000001')
  assert.equal(p.fechaPedido, '2026-09-30')
  assert.equal(p.fechaEntrega, '2026-10-01')
  assert.equal(p.bodegaTexto, 'CENTRO DE DISTRIBUCION')
  assert.equal(p.productos[0].codigoBarras, '7868304262189')
  assert.equal(p.productos[0].nombre, 'Integral, 600g')
  assert.equal(p.productos[0].cantidadEmpaques * p.productos[0].unidadManejoArchivo, 15)
})

test('Un ZIP de siete órdenes con cinco formatos por orden produce siete pedidos, incluyendo entrega futura', async () => {
  const contenido = {}
  for (let i = 1; i <= 7; i++) {
    const texto = txt(`10060000000${i}`, `2026100${i === 7 ? 8 : i}`)
    contenido[`pedidos/F12211000000${i}.txt`] = strToU8(texto)
    for (const [prefijo, extension] of [['C','csv'], ['A','txt'], ['O','pdf'], ['X','xls']]) {
      contenido[`pedidos/${prefijo}12211000000${i}.${extension}`] = strToU8('OTRA REPRESENTACION')
    }
  }
  const pedidos = await leerPedidosFavoritaZip(zipSync(contenido))
  assert.equal(pedidos.length, 7)
  assert.equal(pedidos[0].fechaEntrega, '2026-10-01')
  assert.equal(pedidos[6].fechaEntrega, '2026-10-08')
  assert.equal(pedidos.reduce((s, p) => s + p.productos[0].cantidadEmpaques * p.productos[0].unidadManejoArchivo, 0), 105)
})

test('Archivos F idénticos de la misma orden no se duplican, pero las cantidades diferentes bloquean la lectura', async () => {
  const iguales = {'F1.txt': strToU8(txt()), 'otra/F1.txt': strToU8(txt())}
  assert.equal((await leerPedidosFavoritaZip(zipSync(iguales))).length, 1)
  iguales['otra/F1.txt'] = strToU8(txt(undefined, undefined, '4'))
  await assert.rejects(leerPedidosFavoritaZip(zipSync(iguales)), /datos diferentes/)
})

test('No se omiten silenciosamente cantidades, fechas, códigos ni productos inválidos', () => {
  for (const cantidad of ['', 'NaN', '-2', '0', '0.5']) {
    assert.throws(() => interpretarListadoFavorita(txt(undefined, undefined, cantidad)), /cantidad inválida/)
  }
  assert.throws(() => interpretarListadoFavorita(txt(undefined, '20260230')), /Fecha.*inválida/)
  assert.throws(() => interpretarListadoFavorita(txt().replace('0007868304262189', '786830426218')), /código o cantidad inválida/)
  assert.throws(() => interpretarListadoFavorita(`${cabecera}\n${fila()}\n${fila()}`), /repite el código/)
  assert.throws(() => interpretarListadoFavorita(cabecera), /no contiene productos/)
})

test('ZIP ajeno o corrupto da error sin producir una carga vacía', async () => {
  await assert.rejects(leerPedidosFavoritaZip(zipSync({'A1.txt': strToU8('ORDEN COMPRA')})), /no contiene listados/)
  await assert.rejects(leerPedidosFavoritaZip(strToU8('no es zip')))
})

test('TUTI: conserva bodega, fecha de entrega y cajas por doce aun con marca partida en dos líneas', () => {
  for (const [orden, bodega, cajas, entrega] of [
    ['4500000001', 'SAMBORONDON', 100, '05.10.2026'],
    ['4500000002', 'MANABI', 125, '05.10.2026'],
    ['4500000003', 'MANABI', 140, '08.10.2026'],
  ]) {
    const [p] = interpretarPedidoTutiTexto(`ORDEN DE COMPRA\n${orden}\nFECHA DEL DOCUMENTO\n02.10.2026\nENTREGAR EN: 2000 TUTI BODEGA ${bodega}\nDirección: DIRECCION\nFECHA Y HORA: ${entrega}, 00:00:00\n1 40002213 ROLLO DE CHOCOLATE PANGOLIN 500G PANGOLI 12 ${cajas} CJ 19.20\nN`)
    assert.equal(p.numeroPedido, orden)
    assert.equal(p.fechaPedido, '2026-10-02')
    assert.equal(p.bodegaTexto, bodega)
    assert.equal(p.fechaEntrega, entrega === '08.10.2026' ? '2026-10-08' : '2026-10-05')
    assert.equal(p.productos[0].codigoBarras, '7868304262219T')
    assert.equal(p.productos[0].cantidadEmpaques * p.productos[0].unidadManejoArchivo, cajas * 12)
    assert.deepEqual(p.advertencias, [])
  }
})
