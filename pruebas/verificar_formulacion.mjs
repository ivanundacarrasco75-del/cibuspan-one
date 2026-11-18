import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import * as util from '../src/utils/formulacionVersion.ts'

const origen = { id: 'origen', formula_id: 'sku', numero_version: 2, estado: 'VIGENTE', observaciones: 'Notas existentes' }
const ingrediente = (id, orden, porcentaje = 10) => ({ id, formula_version_id: 'origen', materia_prima_id: id,
  porcentaje_panadero: porcentaje, destino_tipo: 'DIRECTO', micro_id: null, es_harina_base: orden === 1,
  incluir_en_costeo: true, orden, observaciones: null, materia_prima: { nombre: id } })

function escenario() {
  const llamadas = []
  const componentes = [ingrediente('harina', 1, 100), ingrediente('agua', 2, 60)]
  let copia = componentes.map(fila => ({ ...fila, id: `copia-${fila.id}`, formula_version_id: 'copia' })).reverse()
  const versiones = [origen]
  let fallo = false
  const mock = {
    obtenerVersionesFormulaFmDb: async () => versiones,
    crearReformulacionFmDb: async id => { llamadas.push(['crear', id]); versiones.push({ ...origen, id: 'copia', estado: 'BORRADOR' }); return 'copia' },
    obtenerComponentesFmDb: async () => copia,
    guardarPorcentajeBorradorFmDb: async (id, version, porcentaje) => {
      llamadas.push(['porcentaje', id, version, porcentaje])
      if (fallo && id === 'copia-agua') throw Error('Fallo simulado')
      copia.find(fila => fila.id === id).porcentaje_panadero = porcentaje
    },
    guardarDatosVersionBorradorFmDb: async (id, observaciones) => { llamadas.push(['datos', id]); versiones.find(fila => fila.id === id).observaciones = observaciones },
    activarVersionFmDb: async id => { llamadas.push(['activar', id]); versiones.find(fila => fila.id === id).estado = 'VIGENTE' },
  }
  const module = { exports: {} }
  const source = fs.readFileSync(new URL('../src/services/formulacionService.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)(name => name.includes('formulacionGuardadoRepository')
    ? { guardarVersionFormulacion: async (id, datos) => { llamadas.push(['atomico', id, datos]); return 'version-nueva' } }
    : name.includes('formulaRepository') ? mock : util, module, module.exports)
  const datos = { origen, componentes, porcentajes: { harina: '100', agua: '65' }, nombre: 'Prueba nueva', fecha: '2026-11-18', activar: true }
  return { guardar: module.exports.guardarNuevaFormulacion, datos, llamadas, versiones,
    fallar: () => { fallo = true }, recuperar: () => { fallo = false }, cambiarEstructura: () => { copia = copia.slice(0, 1) } }
}

test('Selecciona la última vigente aunque exista un borrador más reciente', () => {
  assert.equal(util.versionPreferidaFormula([{ ...origen, id: 'borrador', numero_version: 8, estado: 'BORRADOR' }, origen, { ...origen, id: 'vieja', numero_version: 1 }]).id, origen.id)
})
test('La parada se obtiene de panes por peso de bola y rechaza valores incompletos', () => {
  assert.equal(util.pesoParadaKg(20, 580), 11.6)
  assert.equal(util.pesoParadaKg(40, 580), 23.2)
  assert.equal(util.pesoParadaKg(0, 580), null)
  assert.equal(util.pesoParadaKg(20, NaN), null)
})
test('Los cambios de parada y destino usan un único guardado de nueva versión', async () => {
  const e = escenario()
  const datos = { ...e.datos, parametros: { panes: 40, rendimiento: 40, pesoBolaG: 580, pesoFinalG: 500 },
    destinos: { harina: 'DIRECTO', agua: 'MICRO' } }
  assert.equal(await e.guardar(datos), 'version-nueva')
  assert.equal(e.llamadas.length, 1)
  const [accion, id, enviado] = e.llamadas[0]
  assert.equal(accion, 'atomico');assert.equal(id, 'origen')
  assert.equal(enviado.peso_bola_g, 580);assert.equal(enviado.panes, 40)
  assert.deepEqual(enviado.componentes.map(f => f.destino), ['DIRECTO', 'MICRO'])
  assert.equal(e.datos.componentes[1].destino_tipo, 'DIRECTO')
})

test('Nombre y fecha se conservan en los datos existentes de la versión', () => {
  const notas = util.observacionesNuevaFormula('Nueva receta', '2026-11-18', origen)
  assert.equal(util.nombreVersionFormula({ ...origen, observaciones: notas }), 'Nueva receta')
  assert.match(notas, /Fecha de modificación: 2026-11-18/)
  assert.match(notas, /Notas existentes/)
  const siguiente = util.observacionesNuevaFormula('Otra', '2026-11-19', { ...origen, observaciones: notas })
  assert.equal((siguiente.match(/Nombre de versión:/g) ?? []).length, 1)
})

test('Guardar copia la versión y solo actualiza porcentajes en la copia antes de activarla', async () => {
  const e = escenario(); let borrador
  assert.equal(await e.guardar(e.datos, id => { borrador = id }), 'copia')
  assert.equal(borrador, 'copia')
  assert.deepEqual(e.llamadas, [['crear', 'origen'], ['porcentaje', 'copia-harina', 'copia', 100], ['porcentaje', 'copia-agua', 'copia', 65], ['datos', 'copia'], ['activar', 'copia']])
  assert.equal(e.datos.componentes[1].porcentaje_panadero, 60)
})

test('Los valores vacíos, negativos, no numéricos y las fechas inválidas no crean versiones', async () => {
  for (const agua of ['', '-1', 'abc']) {
    const e = escenario()
    await assert.rejects(e.guardar({ ...e.datos, porcentajes: { harina: '100', agua } }, () => {}))
    assert.equal(e.llamadas.length, 0)
  }
  const e = escenario()
  await assert.rejects(e.guardar({ ...e.datos, fecha: '2026-02-30' }, () => {}))
  assert.equal(e.llamadas.length, 0)
})

test('Un fallo no activa la fórmula y el reintento utiliza el mismo borrador', async () => {
  const e = escenario(); e.fallar(); let borrador
  await assert.rejects(e.guardar(e.datos, id => { borrador = id }), /Fallo simulado/)
  assert.equal(e.llamadas.some(fila => fila[0] === 'activar'), false)
  e.recuperar()
  await e.guardar({ ...e.datos, borradorId: borrador }, () => {})
  assert.equal(e.llamadas.filter(fila => fila[0] === 'crear').length, 1)
  // Reintentar después de una respuesta perdida de activación no vuelve a escribir.
  const cantidad = e.llamadas.length
  await e.guardar({ ...e.datos, borradorId: borrador }, () => {})
  assert.equal(e.llamadas.length, cantidad)
})

test('Una estructura distinta bloquea el guardado y no activa la copia', async () => {
  const e = escenario(); e.cambiarEstructura()
  await assert.rejects(e.guardar(e.datos, () => {}), /estructura/)
  assert.deepEqual(e.llamadas, [['crear', 'origen']])
})

test('Guardar como borrador no cambia la versión vigente', async () => {
  const e = escenario()
  await e.guardar({ ...e.datos, activar: false }, () => {})
  assert.equal(e.llamadas.some(fila => fila[0] === 'activar'), false)
  assert.equal(e.versiones.find(fila => fila.id === 'copia').estado, 'BORRADOR')
})

test('La tabla de SKU agrupa cada micro y conserva la cantidad total sin exponer sus ingredientes', () => {
  const filas = [{ materia_nombre: 'Harina', micro_id: null, micro_nombre: null, cantidad: 10 },
    { materia_nombre: 'Azúcar', micro_id: 'm', micro_nombre: 'Micro A', cantidad: 2 },
    { materia_nombre: 'Sal', micro_id: 'm', micro_nombre: 'Micro A', cantidad: 1 },
    { materia_nombre: 'Agua', micro_id: null, micro_nombre: null, cantidad: 6 }]
  assert.deepEqual(util.agruparIngredientesImpresion(filas), [{ nombre: 'Harina', cantidad: 10 }, { nombre: 'Micro A', cantidad: 3 }, { nombre: 'Agua', cantidad: 6 }])
})
