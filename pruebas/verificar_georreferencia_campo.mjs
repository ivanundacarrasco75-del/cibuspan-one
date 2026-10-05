import test from 'node:test'
import assert from 'node:assert/strict'
import { asociarFotos, claveFoto, distanciaMetros, enlaceMapa, georreferenciarLocal, localDeCaptura, obtenerPosicionCampo } from '../src/utils/georreferenciaCampo.ts'
import { crearVisitaCampo, registrarSkuEnVisita } from '../src/utils/visitaActivaCampo.ts'

const local = { id: 'local-a', codigo: 'a', nombre: 'Supermercado A', direccion: 'Dirección de referencia',
  latitud: -0.2, longitud: -78.5, radio_metros: 150, referencia_actualizada_en: '2026-10-05T14:00:00Z' }
const gps = { latitud: -0.2, longitud: -78.5, precision: 10, registrado_en: '2026-10-05T15:00:00Z' }

test('Identifica el local con nombre y dirección cuando la ubicación es compatible', () => {
  const g = georreferenciarLocal(local, gps)
  assert.equal(g.estado, 'COMPATIBLE')
  assert.equal(g.distancia_metros, 0)
  assert.equal(g.local_nombre, local.nombre)
  assert.equal(g.direccion, local.direccion)
})

test('La distancia respeta el ecuador y la línea de cambio de fecha', () => {
  assert.ok(Math.abs(distanciaMetros({ latitud: 0, longitud: 0 }, { latitud: 0, longitud: 1 }) - 111195) < 1)
  assert.ok(distanciaMetros({ latitud: 0, longitud: 179.999 }, { latitud: 0, longitud: -179.999 }) < 225)
  assert.equal(georreferenciarLocal({ ...local, latitud: 0, longitud: 0 }, { ...gps, latitud: 0, longitud: 0 }).estado, 'COMPATIBLE')
})

test('Distingue fuera del local, GPS impreciso y una lectura en el límite del radio', () => {
  assert.equal(georreferenciarLocal(local, { ...gps, longitud: -78.49 }).estado, 'FUERA')
  assert.equal(georreferenciarLocal(local, { ...gps, precision: 101 }).estado, 'IMPRECISA')
  assert.equal(georreferenciarLocal(local, { ...gps, longitud: -78.4987, precision: 20 }).estado, 'REVISAR')
})

test('Sin referencia o GPS inválido nunca afirma que la persona está en el local', () => {
  assert.equal(georreferenciarLocal({ ...local, latitud: null, longitud: null }, gps).estado, 'SIN_REFERENCIA')
  assert.equal(georreferenciarLocal(local, null).estado, 'SIN_UBICACION')
  for (const datos of [{ ...gps, latitud: NaN }, { ...gps, longitud: 181 }, { ...gps, precision: -1 }, { ...gps, precision: Infinity }]) {
    assert.equal(georreferenciarLocal(local, datos).estado, 'SIN_UBICACION')
  }
})

test('La referencia se mantiene durante los SKU y al restaurar el borrador, aunque luego editen el catálogo', () => {
  const copia = structuredClone(local)
  const v = crearVisitaCampo({ clienteId: 'favorita', localId: local.id, fecha: '2026-10-05', ubicacion: gps, referenciaLocal: copia }, 'v', '2026-10-05T15:00:00Z')
  copia.nombre = 'Otro local'; copia.latitud = 8
  const restaurada = JSON.parse(JSON.stringify(registrarSkuEnVisita(v, { id: 'p', nombre: 'Integral' })))
  assert.equal(restaurada.referenciaLocal.nombre, local.nombre)
  assert.equal(georreferenciarLocal(restaurada.referenciaLocal, restaurada.ubicacion).estado, 'COMPATIBLE')
})

test('Cada foto conserva origen, momento y GPS propios al asociarse con su archivo subido', () => {
  const a = { name: 'a.jpg', size: 20, lastModified: 1 }, b = { name: 'b.jpg', size: 30, lastModified: 2 }
  const fotos = asociarFotos(['ruta-a', 'ruta-b'], [a, b], [
    { archivo: claveFoto(b), origen: 'GALERIA', adjuntada_en: '2026-10-05T16:00:00Z', georreferencia: georreferenciarLocal(local, { ...gps, longitud: -78.49 }) },
    { archivo: claveFoto(a), origen: 'CAMARA', adjuntada_en: '2026-10-05T15:00:00Z', georreferencia: georreferenciarLocal(local, gps) },
  ], local)
  assert.equal(fotos[0].ruta, 'ruta-a')
  assert.equal(fotos[0].origen, 'CAMARA')
  assert.equal(fotos[0].georreferencia.estado, 'COMPATIBLE')
  assert.equal(fotos[1].origen, 'GALERIA')
  assert.equal(fotos[1].georreferencia.estado, 'FUERA')
  assert.notEqual(fotos[0].adjuntada_en, fotos[1].adjuntada_en)
})

test('Las fotos antiguas o de otro local no heredan una ubicación inventada de la visita', () => {
  const a = { name: 'a.jpg', size: 20, lastModified: 1 }
  const fotos = asociarFotos(['ruta'], [a], [{ archivo: claveFoto(a), origen: 'CAMARA', adjuntada_en: 'ahora',
    georreferencia: georreferenciarLocal({ ...local, id: 'otro' }, gps) }], local)
  assert.equal(fotos[0].origen, 'DESCONOCIDO')
  assert.equal(fotos[0].georreferencia.estado, 'SIN_UBICACION')
  assert.equal(fotos[0].adjuntada_en, null)
  assert.equal(fotos[0].georreferencia.local_id, local.id)
})

test('Usa enlaces de mapa sin API y no construye enlaces con coordenadas inválidas', () => {
  assert.match(enlaceMapa(gps), /^https:\/\/www\.openstreetmap\.org\//)
  assert.equal(enlaceMapa({ latitud: NaN, longitud: 0 }), '')
})

test('Solicita GPS actual por cada adjunto y conserva la hora del posicionamiento', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let opciones
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: {
    getCurrentPosition(ok, _, options) { opciones = options; ok({ coords: { latitude: -0.2, longitude: -78.5, accuracy: 10 }, timestamp: Date.parse(gps.registrado_en) }) },
  } } })
  try { assert.deepEqual(await obtenerPosicionCampo(), { ...gps, registrado_en: new Date(gps.registrado_en).toISOString() }); assert.equal(opciones.maximumAge, 0); assert.equal(opciones.enableHighAccuracy, true) }
  finally { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator }
})

test('La primera captura debe identificar un solo local; nombres genéricos o ambiguos no crean referencia', () => {
  const locales = [{ ...local, nombre: 'Supermaxi Iñaquito' }, { ...local, id: 'b', nombre: 'Supermaxi El Jardín' }]
  assert.equal(localDeCaptura('SUPERMÁXI IÑAQUITO', locales).id, 'local-a')
  assert.equal(localDeCaptura('Supermaxi', locales), null)
  assert.equal(localDeCaptura('Q', locales), null)
  assert.equal(localDeCaptura('No reconocido', locales), null)
  assert.equal(localDeCaptura(null, locales), null)
})
