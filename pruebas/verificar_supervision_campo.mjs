import test from 'node:test'
import assert from 'node:assert/strict'
import { compararSupervision, inicioSemanaCampo, leerCarasPercha } from '../src/utils/supervisionCampo.ts'

const base = { id: 'm', fecha: '2026-10-05', visitado_en: '2026-10-05T14:00:00Z',
  cliente_id: 'c', local_id: 'l', local_nombre: 'Local', producto_id: 'p', producto_nombre: 'SKU',
  responsable_id: 'merc', responsable_nombre: 'Mercaderista', responsable_rol: 'MERCADERISTA',
  caras_percha: 3, stock_local_unidades: 8, rotacion_diaria_unidades: 2,
  presencia_percha: 'PRESENTE', observaciones: null }
const kam = { ...base, id: 'k', responsable_id: 'kam', responsable_rol: 'KAM',
  responsable_nombre: 'KAM', visitado_en: '2026-10-05T16:00:00Z' }

test('Cero es una observación válida; vacío, fracción y datos corruptos no son cero', () => {
  for (const v of [undefined, null, '', ' ', false, -1, 1.5, Infinity, {}]) {
    assert.equal(leerCarasPercha({ caras_percha: v }), null)
  }
  assert.equal(leerCarasPercha({ caras_percha: 0 }), 0)
  assert.equal(leerCarasPercha({ caras_percha: '3' }), 3)
})
test('Empareja cliente, local y SKU; prioriza mismo día y hora más cercana', () => {
  const datos = [base, { ...base, id: 'mas-cercano', visitado_en: '2026-10-05T15:45:00Z' },
    { ...base, id: 'otro-local', local_id: 'otro' },
    { ...base, id: 'otro-cliente', cliente_id: 'otro' },
    { ...base, id: 'otro-sku', producto_id: 'otro' },
    { ...base, id: 'otra-fecha', fecha: '2026-10-06', visitado_en: '2026-10-05T15:59:00Z' }, kam]
  const [c] = compararSupervision(datos)
  assert.equal(c.mercaderista.id, 'mas-cercano')
  assert.equal(c.mismoDia, true)
})
test('La semana es lunes a domingo, incluso al cambiar de mes o año', () => {
  assert.equal(inicioSemanaCampo('2027-01-03'), '2026-12-28')
  assert.equal(compararSupervision([{ ...base, fecha: '2026-10-04' }, kam])[0].mercaderista, null)
  const c = compararSupervision([base, { ...kam, fecha: '2026-10-11' }])[0]
  assert.ok(c.mercaderista)
  assert.equal(c.mismoDia, false)
})
test('Detecta diferencias y datos faltantes sin equiparar null a cero', () => {
  const [c] = compararSupervision([base, { ...kam, caras_percha: 0, stock_local_unidades: null,
    rotacion_diaria_unidades: 3, presencia_percha: 'AUSENTE' }])
  assert.deepEqual(c.diferencias, ['Caras', 'Rotación', 'Presencia'])
  assert.deepEqual(c.faltantes, ['Stock'])
})
test('No confunde ausencia de supervisión con coincidencia ni roles desconocidos con mercaderista', () => {
  assert.equal(compararSupervision([base]).length, 0)
  const [c] = compararSupervision([{ ...base, responsable_rol: null }, kam])
  assert.equal(c.mercaderista, null)
  assert.deepEqual(c.diferencias, [])
})
