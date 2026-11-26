import test from 'node:test'
import assert from 'node:assert/strict'
import { semanasDelAnio } from '../src/utils/semanasPago.ts'

test('2026 tiene 53 semanas ISO; sus extremos incluyen días de años civiles vecinos',()=>{
 const semanas=semanasDelAnio(2026)
 assert.equal(semanas.length,53)
 assert.deepEqual(semanas[0],{numero:1,desde:'2025-12-29'})
 assert.deepEqual(semanas.at(-1),{numero:53,desde:'2026-12-28'})
 assert.equal(semanas[47].desde,'2026-11-23')
})
test('Años con 52 semanas no ofrecen una semana 53 y comienzan en el lunes correcto',()=>{
 assert.equal(semanasDelAnio(2027).length,52)
 assert.equal(semanasDelAnio(2027)[0].desde,'2027-01-04')
 assert.equal(semanasDelAnio(2021).length,52)
 assert.equal(semanasDelAnio(2020).length,53)
})
