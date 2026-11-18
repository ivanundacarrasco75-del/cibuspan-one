import test from "node:test"
import assert from "node:assert/strict"
import { cantidadRecibidaCompra, proponerRecepcionCompra, reconocerArticuloCompra } from "../src/utils/comprasRecepcionAutomatica.ts"

const leche = { id: "leche", codigo: "00019", nombre: "LECHE EN POLVO", unidad: "KG" }
const harina = { id: "harina", codigo: "00011", nombre: "HARINA DE TRIGO", unidad: "KG" }
const funda = { id: "funda", codigo: "00030", nombre: "FUNDA PAN BLANCO 600G", unidad: "UNIDAD" }
const item = (descripcion, cantidad = "1", unidad = "") => ({ descripcion, cantidad, unidad })

test("reconoce el producto del catálogo y convierte el saco de leche de 25 kilos", () => {
  const [r] = proponerRecepcionCompra([item("LECHE EN POLVO INDUSTRIAL 25 KILOS.")], [leche, harina])
  assert.equal(r.articulo, "leche")
  assert.equal(r.cantidad, "25")
  assert.match(r.explicacion, /1 × 25 KG/)
})
test("reconoce nombre exacto sin distinguir tildes, espacios o mayúsculas", () => {
  assert.equal(reconocerArticuloCompra(item(" Harina DE   TRIGO 50KG "), [harina])?.id, "harina")
})
test("copiar KG explícitos no vuelve a multiplicar por el peso de la presentación", () => {
  assert.equal(cantidadRecibidaCompra(item("HARINA DE TRIGO SACO 50 KG", "400", "KG"), harina).cantidad, "400")
})
test("convierte presentaciones y gramos a la unidad del catálogo", () => {
  assert.equal(cantidadRecibidaCompra(item("HARINA DE TRIGO 50KLS.", "8"), harina).cantidad, "400")
  assert.equal(cantidadRecibidaCompra(item("LECHE EN POLVO 500 GR", "3"), leche).cantidad, "1.5")
  assert.equal(cantidadRecibidaCompra(item("LECHE EN POLVO", "1500", "GRAMOS"), leche).cantidad, "1.5")
  assert.equal(cantidadRecibidaCompra(item("LECHE EN POLVO 25KG", "1", "LITRO"), leche).cantidad, "")
})
test("los pesos impresos de las fundas no se convierten a stock en kilos", () => {
  assert.equal(cantidadRecibidaCompra(item("FUNDA PAN BLANCO 600G", "300"), funda).cantidad, "300")
  assert.equal(cantidadRecibidaCompra(item("PAQUETE FUNDAS PAN BLANCO 600G", "3"), funda).cantidad, "")
})
test("la marca (K) permite leer cantidades en kilogramos", () => {
  assert.equal(cantidadRecibidaCompra(item("(K) HARINA DE TRIGO", "50.00"), harina).cantidad, "50")
})
test("servicios y nombres o códigos ambiguos no se asignan solos", () => {
  assert.equal(reconocerArticuloCompra(item("SERVICIO DE TRANSPORTE DE HARINA DE TRIGO"), [harina]), null)
  assert.equal(reconocerArticuloCompra(item("LECHE EN POLVO"), [leche, { ...leche, id: "otra" }]), null)
  assert.equal(reconocerArticuloCompra({ ...item("Otro producto"), codigo: "00011" }, [harina]), null)
})
test("escoge el nombre específico si uno es parte del otro", () => {
  const molida = { id: "molida", codigo: "AVM", nombre: "AVENA MOLIDA", unidad: "KG" }
  assert.equal(reconocerArticuloCompra(item("AVENA MOLIDA 25KG"), [molida, { ...molida, id: "avena", nombre: "AVENA" }])?.id, "molida")
})
test("unidades ausentes, conversiones compuestas, cantidades vacías e inválidas quedan pendientes", () => {
  for (const i of [item("LECHE EN POLVO", "10"), item("LECHE EN POLVO 2X25KG", "1"),
    item("LECHE EN POLVO 2KG 5KG"), item("LECHE EN POLVO 25KG", ""), item("LECHE EN POLVO 25KG", "-2")]) {
    assert.equal(cantidadRecibidaCompra(i, leche).cantidad, "")
  }
})
test("unidades enteras y seis decimales conservan las validaciones del Kardex", () => {
  assert.equal(cantidadRecibidaCompra(item("FUNDA", "1.5", "UNIDAD"), funda).cantidad, "")
  assert.equal(cantidadRecibidaCompra(item("HARINA", "0.0000001", "KG"), harina).cantidad, "")
})
test("el Excel sin cantidades físicas no fabrica cantidades a partir del texto", () => {
  const [r] = proponerRecepcionCompra([item("LECHE EN POLVO 25 KG", "")], [leche])
  assert.equal(r.articulo, "leche")
  assert.equal(r.cantidad, "")
  assert.match(r.explicacion, /Falta la cantidad/)
})
