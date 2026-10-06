import test from 'node:test'
import assert from 'node:assert/strict'
import { cantidadExcel, leerFilasInventarioInicial, validarLotesIniciales, movimientoParaConteo, vincularArticulo, unidadesCoinciden } from '../src/utils/inventarioInicialExcel.ts'

const mp = { tipo:'MATERIA_PRIMA', id:'mp', codigo:'HARINA', codigo_contable:'1001', nombre:'Harina', unidad:'KG', saldo:0, iniciado:false }
const pt = { tipo:'PRODUCTO_TERMINADO', id:'pt', codigo:'7868304262189', codigo_contable:null, nombre:'Integral', unidad:'UNIDAD', saldo:0, iniciado:false }
const filas = [ ['Inventario septiembre'], ['Sucursal','Cód Artículo','Nombre del Artículo','Stock','P.Costo','Costo Total'],
  ['MATRIZ','1001','HARINA',100.5,0.7,70.35], ['MATRIZ',7868304262189,'PANGOLIN INTEGRAL',20,1,20],
  ['OTRA','1001','HARINA',2,0.7,1.4], ['MATRIZ','DESCONOCIDO','Sin catálogo',0,0,0], ['',null,'TOTAL',122.5,0,91.75] ]
test('Un archivo conserva MP, PT y otras sucursales para revisión explícita', () => {
  const resultado = leerFilasInventarioInicial(filas,[mp,pt])
  assert.equal(resultado.length,4)
  assert.equal(resultado[0].articulo.id,'mp'); assert.equal(resultado[1].articulo.id,'pt')
  assert.equal(resultado[1].cantidad,20); assert.equal(resultado[2].sucursal,'OTRA')
  assert.equal(resultado[3].articulo,null); assert.equal(resultado[3].cantidad,0)
})
test('Los códigos ambiguos no se vinculan automáticamente ni se adivina por nombre', () => {
  assert.equal(vincularArticulo('1001',[mp,{...pt,codigo:'1001'}]),null)
  assert.equal(vincularArticulo('OTRO',[mp]),null)
})
test('El inventario contable sin ceros iniciales se vincula solo a un artículo único', () => {
  const materia={...mp,codigo:'MP12',codigo_contable:'00012'}
  assert.equal(vincularArticulo('12',[materia]).id,'mp')
  assert.equal(vincularArticulo('00012',[materia]).id,'mp')
  assert.equal(vincularArticulo('12',[materia,{...pt,codigo:'12'}]),null)
  assert.equal(vincularArticulo('7868304262219',[{...pt,codigo:'7868304262219T'}]),null)
})
test('El formato de septiembre conserva unidades y marca blancos sin convertirlos a cero', () => {
  const datos=leerFilasInventarioInicial([
    ['SEPTIEMBRE 2026'],['No.','Sucursal','Cód Artículo','Nombre del Artículo','Unidad de medida','Stock'],
    [2,'CIBUSPAN',12,'AFRECHO DE TRIGO','KILOS',127.17],
    [24,'CIBUSPAN',36,'FUNDA CIABATTA','UNIDAD',null],
    [null,null,null,'FUNDA SANDUCHERO INTEGRAL 800g SM','UNIDAD',2754],
    ['Total',null,null,null,null,248834.45199999996]
  ],[{...mp,codigo_contable:'00012'}])
  assert.equal(datos.length,3); assert.equal(datos[0].unidadArchivo,'KILOS');assert.equal(datos[0].articulo.id,'mp')
  assert.ok(Number.isNaN(datos[1].cantidad));assert.match(datos[1].problema,/Cantidad/)
  assert.equal(datos[2].cantidad,2754); assert.equal(datos[2].codigo,'');assert.match(datos[2].problema,/código/)
  assert.equal(unidadesCoinciden('KILOS','KG'),true);assert.equal(unidadesCoinciden('UNIDAD','UNIDAD'),true)
  assert.equal(unidadesCoinciden('KILOS','UNIDAD'),false);assert.equal(unidadesCoinciden('GRAMOS','KG'),false)
})
test('Se corrige el residuo numérico de fórmulas Excel sin recortar precisión real', () => {
  assert.equal(cantidadExcel(80.49600000000001),80.496)
  assert.equal(cantidadExcel(31.416000000000004),31.416)
  assert.equal(cantidadExcel(1.2345678),1.2345678)
})
test('Cantidades y costos inválidos quedan marcados; no se omiten artículos', () => {
  const datos = leerFilasInventarioInicial([filas[1],['MATRIZ','1001','HARINA',-1,1,1],['MATRIZ',pt.codigo,'Integral',1.5,1,1]], [mp,pt])
  assert.equal(datos.length,2); assert.match(datos[0].problema,/Cantidad/); assert.match(datos[1].problema,/enteras/)
  assert.throws(() => leerFilasInventarioInicial([['Sin encabezados']],[mp]),/columnas/)
})
test('Separadores de número sin pérdida silenciosa de cantidades decimales', () => {
  assert.equal(cantidadExcel(1.234),1.234)
  assert.equal(cantidadExcel('100,50'),100.5); assert.equal(cantidadExcel('1.234,50'),1234.5)
  assert.equal(cantidadExcel('1,234.50'),1234.5)
  assert.ok(Number.isNaN(cantidadExcel('1,234'))); assert.ok(Number.isNaN(cantidadExcel('')))
})
test('PT requiere lotes y fechas reales, cantidades completas y sin duplicación', () => {
  const lotes = [{cantidad:8,lote:'A',fechaProduccion:'2026-09-25',fechaVencimiento:'2026-10-25'},
    {cantidad:12,lote:'B',fechaProduccion:'2026-09-26',fechaVencimiento:'2026-10-26'}]
  assert.equal(validarLotesIniciales(20,lotes,'2026-09-30'),'')
  assert.match(validarLotesIniciales(21,lotes,'2026-09-30'),/suman/)
  assert.match(validarLotesIniciales(16,[lotes[0],lotes[0]],'2026-09-30'),/repetido/)
  assert.match(validarLotesIniciales(8,[{...lotes[0],fechaProduccion:'2026-10-01'}],'2026-09-30'),/fechas/)
  assert.match(validarLotesIniciales(8,[{...lotes[0],lote:''}],'2026-09-30'),/lote/)
})
test('Un conteo produce solo la diferencia y conserva precisión de kg', () => {
  assert.equal(movimientoParaConteo(100,98),-2); assert.equal(movimientoParaConteo(98,100),2)
  assert.equal(movimientoParaConteo(.3,.1),-.2); assert.throws(() => movimientoParaConteo(1,-1),/inválido/)
})
test('Lectura de un XLSX real con dos hojas conserva ambos inventarios',async () => {
  const [{default:ExcelJS},{default:leerExcel}] = await Promise.all([import('exceljs'),import('read-excel-file/node')])
  const libro=new ExcelJS.Workbook()
  libro.addWorksheet('Materias primas').addRows([filas[1],filas[2]])
  libro.addWorksheet('Producto terminado').addRows([filas[1],filas[3]])
  const hojas=await leerExcel(Buffer.from(await libro.xlsx.writeBuffer()))
  assert.deepEqual(hojas.map((h) => h.sheet),['Materias primas','Producto terminado'])
  const leidas=hojas.flatMap((h) => leerFilasInventarioInicial(h.data,[mp,pt]))
  assert.equal(leidas.length,2); assert.equal(leidas[0].cantidad,100.5); assert.equal(leidas[1].articulo.id,'pt')
})
