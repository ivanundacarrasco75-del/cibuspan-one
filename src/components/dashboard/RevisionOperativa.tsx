import type { DevolucionListadoDb } from "../../repositories/devolucionRepository"
import type { VentaDiariaDb } from "../../repositories/ventasRepository"
import "./RevisionOperativa.css"

type Rango = { desde: string; hasta: string }

export type DevengoRevision = {
  periodo: string
  ventas_netas: number | null
  costo_venta: number | null
  cif_operativo: number | null
  gasto_especifico_cliente: number | null
  gasto_general: number | null
  ebitda: number | null
}

const rubros = [
  ["costo_venta", "Costo de venta"],
  ["cif_operativo", "Costos indirectos reclasificados"],
  ["gasto_especifico_cliente", "Gastos específicos de clientes"],
  ["gasto_general", "Gastos generales"],
] as const

const usd = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" })
const decimal = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 })
const fechaCorta = (fecha: string) => fecha.slice(5).split("-").reverse().join("/")
const cambioUsd = (valor: number) => `${valor >= 0 ? "+" : "−"}${usd.format(Math.abs(valor))}`
const enRango = (fecha: string, rango: Rango) => fecha >= rango.desde && fecha <= rango.hasta

function sumarDias(fecha: string, dias: number) {
  const dia = new Date(`${fecha}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() + dias)
  return dia.toISOString().slice(0, 10)
}

export function resumirDevengo(filas: DevengoRevision[], rango: Rango) {
  const meses: DevengoRevision[] = []
  let siguiente = rango.desde
  while (siguiente <= rango.hasta) {
    if (!siguiente.endsWith("-01")) return null
    const inicio = new Date(`${siguiente}T12:00:00Z`)
    inicio.setUTCMonth(inicio.getUTCMonth() + 1)
    const mesSiguiente = inicio.toISOString().slice(0, 10)
    const fila = filas.find((item) => item.periodo === siguiente)
    if (!fila || sumarDias(mesSiguiente, -1) > rango.hasta) return null
    if ([fila.ventas_netas, fila.ebitda, ...rubros.map(([campo]) => fila[campo])]
      .some((valor) => valor == null || !Number.isFinite(Number(valor)))) return null
    meses.push(fila)
    siguiente = mesSiguiente
  }
  if (meses.length === 0) return null
  const subtotales = rubros.map(([campo, nombre]) => ({
    nombre,
    valor: meses.reduce((total, fila) => total + Number(fila[campo]), 0),
  }))
  return {
    subtotales,
    costos: subtotales.reduce((total, rubro) => total + rubro.valor, 0),
    ventas: meses.reduce((total, fila) => total + Number(fila.ventas_netas), 0),
    ebitda: meses.reduce((total, fila) => total + Number(fila.ebitda), 0),
  }
}

export function resumirOperacion(
  ventas: VentaDiariaDb[],
  devoluciones: DevolucionListadoDb[] | null,
  rango: Rango,
) {
  const clientes = new Map<string, { nombre: string; importe: number; unidades: number; devueltas: number }>()
  const semanas = new Map<string, number>()
  let unidades = 0
  for (const venta of ventas) {
    if (!enRango(venta.fecha_emision, rango)) continue
    const importe = Number(venta.total_sin_impuestos ?? 0)
    const nombre = venta.cliente_nombre.trim()
    if (nombre) {
      const clave = venta.cliente_id ?? nombre.toLocaleUpperCase("es")
      const cliente = clientes.get(clave) ?? { nombre, importe: 0, unidades: 0, devueltas: 0 }
      cliente.importe += importe
      cliente.unidades += Number(venta.cantidad ?? 0)
      clientes.set(clave, cliente)
    }
    const dia = new Date(`${venta.fecha_emision}T12:00:00Z`).getUTCDay()
    const semana = sumarDias(venta.fecha_emision, -((dia + 6) % 7))
    semanas.set(semana, (semanas.get(semana) ?? 0) + importe)
    unidades += Number(venta.cantidad ?? 0)
  }

  let devueltas = 0
  for (const devolucion of devoluciones ?? []) {
    const cliente = devolucion.cliente
      ? clientes.get(devolucion.cliente.id) ?? clientes.get(devolucion.cliente.nombre.trim().toLocaleUpperCase("es"))
      : undefined
    for (const detalle of devolucion.detalles ?? []) {
      const vida = Number(detalle.vida_efectiva_dias ?? 0)
      const origen = vida > 0
        ? sumarDias(devolucion.fecha_devolucion, -vida)
        : detalle.semana_origen_inicio
      if (!origen || !enRango(origen, rango)) continue
      const cantidad = Number(detalle.unidades ?? 0)
      devueltas += cantidad
      if (cliente) cliente.devueltas += cantidad
    }
  }
  return {
    clientes,
    semanas: Array.from(semanas, ([fecha, importe]) => ({ fecha, importe }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    tasa: devoluciones !== null && unidades > 0 ? 100 * devueltas / unidades : null,
    devueltas,
    unidades,
  }
}

type Datos = {
  ventas: VentaDiariaDb[] | null
  devoluciones: DevolucionListadoDb[] | null
  devengo: DevengoRevision[] | null
}

export default function RevisionOperativa({
  datos, actual, anterior, verCostos, verDevoluciones, verComercial,
}: {
  datos: Datos | null
  actual: Rango
  anterior: Rango
  verCostos: () => void
  verDevoluciones: () => void
  verComercial: () => void
}) {
  const vigente = resumirOperacion(datos?.ventas ?? [], datos?.devoluciones ?? null, actual)
  const previo = resumirOperacion(datos?.ventas ?? [], datos?.devoluciones ?? null, anterior)
  const devengo = datos?.devengo ? resumirDevengo(datos.devengo, actual) : null
  const devengoAnterior = datos?.devengo ? resumirDevengo(datos.devengo, anterior) : null
  const aumentoCostos = devengo && devengoAnterior ? devengo.costos - devengoAnterior.costos : 0
  const mayorRubro = devengo && devengoAnterior && devengo.subtotales
    .map((rubro, i) => ({ nombre: rubro.nombre, cambio: rubro.valor - devengoAnterior.subtotales[i].valor }))
    .sort((a, b) => b.cambio - a.cambio)[0]
  const aumentoTasa = vigente.tasa != null && previo.tasa != null ? vigente.tasa - previo.tasa : 0
  const mayorAumentoTasa = Array.from(vigente.clientes, ([clave, cliente]) => {
    const previoCliente = previo.clientes.get(clave)
    if (!previoCliente || previoCliente.unidades <= 0 || cliente.unidades <= 0) return null
    const antes = 100 * previoCliente.devueltas / previoCliente.unidades
    const ahora = 100 * cliente.devueltas / cliente.unidades
    return { nombre: cliente.nombre, antes, ahora, aumento: ahora - antes }
  }).filter((cliente) => cliente !== null)
    .filter((cliente) => cliente.aumento >= 0.01)
    .sort((a, b) => b.aumento - a.aumento)[0]
  const mayorCaida = Array.from(previo.clientes, ([clave, cliente]) => ({
    ...cliente,
    actual: vigente.clientes.get(clave)?.importe ?? 0,
  })).filter((cliente) => cliente.importe - cliente.actual >= 0.01)
    .sort((a, b) => (b.importe - b.actual) - (a.importe - a.actual))[0]
  const maximo = Math.max(1, ...vigente.semanas.map((semana) => Math.abs(semana.importe)))
  const ventasComparables = vigente.semanas.length > 0 && previo.semanas.length > 0
  const tasasComparables = vigente.tasa != null && previo.tasa != null
  const hayCambios = aumentoCostos >= 0.01 || aumentoTasa >= 0.01 || (ventasComparables && !!mayorCaida)

  return (
    <section className="revision-operativa" aria-labelledby="revision-operativa-titulo">
      <header>
        <h2 id="revision-operativa-titulo">Comparación de períodos</h2>
        <p>{fechaCorta(actual.desde)}–{fechaCorta(actual.hasta)} frente a {fechaCorta(anterior.desde)}–{fechaCorta(anterior.hasta)}</p>
      </header>
      {!datos ? <p role="status">Cargando revisión del período…</p> : <>
        <div className="revision-operativa-columnas">
          <section className="revision-operativa-panel">
            <h3>¿Qué requiere atención?</h3>
            {devengo && devengoAnterior && aumentoCostos >= 0.01 && (
              <details>
                <summary>Subieron los costos y gastos <strong>{cambioUsd(aumentoCostos)}</strong></summary>
                <p>De {usd.format(devengoAnterior.costos)} a {usd.format(devengo.costos)}.
                  {mayorRubro && <> El mayor aumento fue en {mayorRubro.nombre.toLowerCase()} ({cambioUsd(mayorRubro.cambio)}).</>}
                </p>
                <button type="button" onClick={verCostos}>Ver costos y gastos por devengo</button>
              </details>
            )}
            {previo.tasa != null && vigente.tasa != null && aumentoTasa >= 0.01 && (
              <details>
                <summary>Subió la tasa de devolución <strong>+{decimal.format(aumentoTasa)} p. p.</strong></summary>
                <p>De {decimal.format(previo.tasa)} % a {decimal.format(vigente.tasa)} %. En el período actual se atribuyeron {decimal.format(vigente.devueltas)} unidades devueltas a partir de {decimal.format(vigente.unidades)} unidades facturadas.</p>
                {mayorAumentoTasa && (
                  <p>{mayorAumentoTasa.nombre} tuvo el mayor aumento entre los clientes comparables, de {decimal.format(mayorAumentoTasa.antes)} % a {decimal.format(mayorAumentoTasa.ahora)} %.</p>
                )}
                <button type="button" onClick={verDevoluciones}>Ver devoluciones</button>
              </details>
            )}
            {ventasComparables && mayorCaida && (
              <details>
                <summary>Bajó la facturación de {mayorCaida.nombre} <strong>{cambioUsd(mayorCaida.actual - mayorCaida.importe)}</strong></summary>
                <p>De {usd.format(mayorCaida.importe)} a {usd.format(mayorCaida.actual)} sin impuestos. Es la mayor caída entre los clientes con facturación previa.</p>
                <button type="button" onClick={verComercial}>Ver análisis comercial</button>
              </details>
            )}
            {!hayCambios && <p>{ventasComparables || tasasComparables || (devengo && devengoAnterior)
              ? "No se detectaron aumentos de costos o devoluciones ni caídas de facturación por cliente en los indicadores comparables."
              : "Aún no hay datos suficientes para comparar estos períodos."}</p>}
            {(!datos.ventas || !datos.devoluciones || !datos.devengo) && (
              <p role="status">Algunas fuentes no se pudieron consultar. Usa «Actualizar datos» para reintentar.</p>
            )}
            {datos.ventas && !ventasComparables && <p>La comparación de clientes requiere facturación en ambos períodos.</p>}
            {datos.ventas && datos.devoluciones && !tasasComparables && <p>La tasa requiere unidades facturadas en ambos períodos.</p>}
          </section>
          <section className="revision-operativa-panel">
            <h3>Facturación semanal</h3>
            <p>Sin impuestos · USD</p>
            {vigente.semanas.length > 0 ? (
              <ul className="revision-operativa-semanas">
                {vigente.semanas.map(({ fecha, importe }) => (
                  <li key={fecha}>
                    <span>{fechaCorta(fecha < actual.desde ? actual.desde : fecha)}–{fechaCorta(sumarDias(fecha, 6) > actual.hasta ? actual.hasta : sumarDias(fecha, 6))}</span>
                    <span className="revision-operativa-barra" aria-hidden="true"><span style={{ width: `${100 * Math.abs(importe) / maximo}%` }} /></span>
                    <strong>{usd.format(importe)}</strong>
                  </li>
                ))}
              </ul>
            ) : <p>{datos.ventas ? "Sin facturación registrada en este período." : "Facturación no disponible."}</p>}
          </section>
        </div>
        <section className="revision-operativa-panel">
          <h3>Costos y gastos por devengo</h3>
          {devengo ? (
            <dl className="revision-operativa-indicadores">
              {([
                ["ventas", "Ventas netas contables"],
                ["costos", "Costos y gastos operativos"],
                ["ebitda", "EBITDA"],
              ] as const).map(([campo, titulo]) => (
                <div key={campo}>
                  <dt>{titulo}</dt>
                  <dd>{usd.format(devengo[campo])}</dd>
                  {devengoAnterior && <small>{cambioUsd(devengo[campo] - devengoAnterior[campo])} vs. anterior</small>}
                </div>
              ))}
            </dl>
          ) : <p>El resumen por devengo requiere seleccionar meses completos con cierre contable.</p>}
          {devengo && !devengoAnterior && <p>Sin cierre contable comparable para el período anterior.</p>}
          <button type="button" onClick={verCostos}>Abrir panel completo de costos y gastos</button>
        </section>
      </>}
    </section>
  )
}
