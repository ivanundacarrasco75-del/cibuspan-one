import test from 'node:test'
import assert from 'node:assert/strict'
import { crearVisitaCampo, registrarSkuEnVisita } from '../src/utils/visitaActivaCampo.ts'

const contexto = { clienteId: 'favorita', localId: 'local-a', fecha: '2026-10-05',
  ubicacion: { latitud: -0.2, longitud: -78.5, precision: 8 } }

test('Conserva local, cliente, fecha y ubicación durante diez o más SKU', () => {
  let visita = crearVisitaCampo(contexto, 'visita-1', '2026-10-05T15:00:00Z')
  for (let n = 1; n <= 12; n++) visita = registrarSkuEnVisita(visita, { id: `sku-${n}`, nombre: `Pan ${n}` })
  assert.equal(visita.skusGuardados.length, 12)
  assert.equal(visita.clienteId, contexto.clienteId)
  assert.equal(visita.localId, contexto.localId)
  assert.equal(visita.fecha, contexto.fecha)
  assert.deepEqual(visita.ubicacion, contexto.ubicacion)
  assert.equal(visita.id, 'visita-1')
})
test('La ubicación queda fijada al iniciar y guardar un SKU no modifica el registro anterior', () => {
  const datos = structuredClone(contexto)
  const inicial = crearVisitaCampo(datos, 'v1', '2026-10-05T15:00:00Z')
  datos.ubicacion.latitud = 5
  const siguiente = registrarSkuEnVisita(inicial, { id: 'sku-1', nombre: 'Integral' })
  assert.equal(inicial.skusGuardados.length, 0)
  assert.equal(siguiente.ubicacion.latitud, -0.2)
})
test('No duplica un SKU dentro de la visita', () => {
  const visita = registrarSkuEnVisita(crearVisitaCampo(contexto, 'v', '2026-10-05T15:00:00Z'), { id: 'p', nombre: 'Pan' })
  assert.throws(() => registrarSkuEnVisita(visita, { id: 'p', nombre: 'Pan' }), /ya se guardó/)
})
test('El borrador recupera el contexto y el avance al reabrir', () => {
  const visita = registrarSkuEnVisita(crearVisitaCampo(contexto, 'v', '2026-10-05T15:00:00Z'), { id: 'p', nombre: 'Pan' })
  const restaurado = JSON.parse(JSON.stringify({ visitaActiva: visita })).visitaActiva
  const siguiente = registrarSkuEnVisita(restaurado, { id: 'p2', nombre: 'Granos' })
  assert.deepEqual(siguiente.skusGuardados.map((p) => p.id), ['p', 'p2'])
  assert.equal(siguiente.localId, contexto.localId)
})
test('Una visita nueva empieza con otro local, sin SKU ni ubicación heredados', () => {
  const visita = crearVisitaCampo({ ...contexto, localId: 'local-b', ubicacion: null }, 'v2', '2026-10-05T16:00:00Z')
  assert.equal(visita.localId, 'local-b')
  assert.equal(visita.ubicacion, null)
  assert.deepEqual(visita.skusGuardados, [])
  assert.throws(() => crearVisitaCampo({ ...contexto, localId: '' }, 'v3', 'ahora'), /Selecciona/)
})
