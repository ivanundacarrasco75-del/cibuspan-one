import test from 'node:test'
import assert from 'node:assert/strict'
import { CAMPOS_CANTIDADES_CAMPO, tieneCantidadesCaptura, completarCantidadesCaptura, prepararRecuperacionCaptura } from '../src/utils/lecturaCapturasCampo.ts'

const lectura = (extra={}) => ({confianza:.9,advertencias:[],texto_ocr:'Texto de captura',...Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.map(([k])=>[k,null])),...extra})
test('Reconocer solo nombre o código no es una lectura de cantidades; cero sí lo es',()=>{
 assert.equal(tieneCantidadesCaptura(lectura({nombre_producto:'PAN',codigo_barras:'7868304262189'})),false)
 assert.equal(tieneCantidadesCaptura(lectura({stock_local_unidades:0})),true)
 assert.equal(tieneCantidadesCaptura(lectura({rotacion_diaria_unidades:NaN})),false)
})
test('Recuperar cantidades conserva el stock manual incluso en cero y propone campos antes vacíos',()=>{
 const original={stock_local_unidades:0}, leida=lectura({stock_local_unidades:7,rotacion_diaria_unidades:2.5})
 const valores=completarCantidadesCaptura(original,leida)
 assert.equal(valores.stock_local_unidades,0);assert.equal(valores.rotacion_diaria_unidades,2.5)
 const patch=prepararRecuperacionCaptura(valores,leida,original)
 assert.equal(patch.rotacion_diaria_unidades,2.5);assert.equal('stock_local_unidades' in patch,false)
 assert.equal('caras_percha' in patch,false);assert.equal('fecha_visita' in patch,false)
 assert.deepEqual(original,{stock_local_unidades:0})
})
test('Una corrección expresa puede guardar cero, pero no vaciar cantidades anteriores ni guardar sin cambios',()=>{
 const original={stock_local_unidades:7}, leida=lectura(), valores=completarCantidadesCaptura(original,leida)
 assert.throws(()=>prepararRecuperacionCaptura(valores,leida,original),/nuevas o corregidas/)
 const patch=prepararRecuperacionCaptura({...valores,stock_local_unidades:0},leida,original)
 assert.equal(patch.stock_local_unidades,0)
 assert.throws(()=>prepararRecuperacionCaptura({...valores,stock_local_unidades:null},leida,original),/nuevas o corregidas/)
 assert.throws(()=>prepararRecuperacionCaptura({...valores,stock_local_unidades:-1},leida,original),/desde cero/)
})
