import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
after(()=>server.close())
const {validarPeriodoProduccion,periodoProduccionInicial,mismoPeriodoProduccion}=await server.ssrLoadModule('/src/utils/periodoProduccion.ts')
test('Período inicial usa la fecha Ecuador incluso cerca del cambio UTC',()=>{
 assert.deepEqual(periodoProduccionInicial(new Date('2026-11-05T01:00:00Z')),{desde:'2026-11-04',hasta:'2026-11-05'})
 assert.deepEqual(periodoProduccionInicial(new Date('2026-12-31T18:00:00Z')),{desde:'2026-12-31',hasta:'2027-01-01'})
})
test('Fechas reales, orden y límite anual se validan; un día único es válido',()=>{
 assert.deepEqual(validarPeriodoProduccion({desde:'2026-11-09',hasta:'2026-11-09'}),{desde:'2026-11-09',hasta:'2026-11-09'})
 assert.deepEqual(validarPeriodoProduccion({desde:'2028-02-29',hasta:'2028-03-01'}),{desde:'2028-02-29',hasta:'2028-03-01'})
 for(const p of [{desde:'2026-02-29',hasta:'2026-03-01'},{desde:'',hasta:'2026-11-09'},{desde:'2026-11-10',hasta:'2026-11-09'},{desde:'2026-11-09',hasta:'2028-01-01'},{desde:'2026-11-31',hasta:'2026-12-01'}])assert.throws(()=>validarPeriodoProduccion(p))
})
test('No hay período vigente antes de aplicar y una copia no comparte referencias',()=>{
 const p={desde:'2026-11-09',hasta:'2026-11-10'},c=validarPeriodoProduccion(p)
 assert.equal(mismoPeriodoProduccion(null,p),false);assert.equal(mismoPeriodoProduccion(c,p),true)
 p.hasta='2026-11-11';assert.equal(c.hasta,'2026-11-10');assert.equal(mismoPeriodoProduccion(c,p),false)
})
