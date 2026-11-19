import assert from "node:assert/strict"
import { test } from "node:test"
import { calcularReposicion, ordenarReposicion } from "../src/utils/reposicionCompras.ts"

const hoy = "2026-11-16"
const insumo = { id: "mp", nombre: "Harina", codigo: "MP", unidad: "KG", stock: 25, consumoDiario: 10, plazoDias: 3, recepciones: [] }
const calcular = cambios => calcularReposicion({ ...insumo, ...cambios }, hoy)

test("advierte un quiebre previsto antes de la entrega y distingue pedir hoy con margen", () => {
  const urgente = calcular()
  assert.equal(urgente.cobertura, 2.5)
  assert.equal(urgente.riesgo, true)
  assert.equal(urgente.fechaPedido, hoy)
  assert.equal(calcular({ stock: 30 }).riesgo, true)
  const hoyConMargen = calcular({ stock: 35 })
  assert.equal(hoyConMargen.fechaPedido, hoy)
  assert.equal(hoyConMargen.riesgo, false)
})

test("suma entregas confirmadas en secuencia solo mientras quede cobertura", () => {
  const aviso = calcular({ recepciones: [
    { fecha: "2026-11-23", cantidad: 100 },
    { fecha: "2026-11-20", cantidad: 20 },
    { fecha: "2026-11-18", cantidad: 20 },
    { fecha: "2026-11-15", cantidad: 100 },
  ] })
  assert.equal(aviso.cobertura, 2.5)
  assert.equal(aviso.recepcionesConsideradas, 2)
  assert.equal(aviso.fechaPedido, "2026-11-19")
  assert.equal(aviso.riesgo, false)
  assert.equal(calcular({ stock: 0, recepciones: [{ fecha: hoy, cantidad: 50 }] }).fechaPedido, "2026-11-18")
})

test("identifica cada dato ausente y conserva métricas que sí se conocen", () => {
  const incompleto = calcular({ plazoDias: null, recepciones: null })
  assert.equal(incompleto.cobertura, 2.5)
  assert.equal(incompleto.fechaPedido, null)
  assert.equal(incompleto.riesgo, false)
  assert.deepEqual(incompleto.faltantes, ["plazo de entrega del proveedor", "registro de recepciones futuras confirmadas"])
  const sinHistorial = calcular({ stock: null, consumoDiario: null })
  assert.equal(sinHistorial.cobertura, null)
  assert.equal(sinHistorial.fechaPedido, null)
  assert.deepEqual(sinHistorial.faltantes, ["saldo registrado en Kardex", "consumo confirmado en el período"])
  assert.equal(calcular({ stock: 0 }).cobertura, 0)
})

test("prioriza la fecha de pedido y usa cobertura en los pendientes", () => {
  const avisos = [
    calcular({ id: "sin-cobertura", consumoDiario: null }),
    calcular({ id: "programado", stock: 75 }),
    calcular({ id: "pendiente", plazoDias: null }),
    calcular({ id: "riesgo-moderado", stock: 20 }),
    calcular({ id: "riesgo-alto", stock: 0 }),
  ]
  assert.deepEqual(avisos.sort(ordenarReposicion).map(aviso => aviso.id),
    ["riesgo-alto", "riesgo-moderado", "programado", "pendiente", "sin-cobertura"])
})
