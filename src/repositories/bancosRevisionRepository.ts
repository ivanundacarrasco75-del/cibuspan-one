import { supabase } from "../lib/supabase"

const cuentasBancos = ["1.1.01.2.01.01", "1.1.01.2.01.02"]

export type SaldoBancarioRevision = { periodo: string; saldo: number }

export async function obtenerSaldosBancariosRevision(desde: string, hasta: string): Promise<SaldoBancarioRevision[]> {
  const { data, error } = await supabase.from("fin_vw_balance_comparativo")
    .select("anio,mes,cuenta_codigo,valor,ultimo_mes")
    .in("cuenta_codigo", cuentasBancos)
    .gte("anio", Number(desde.slice(0, 4)))
    .lte("anio", Number(hasta.slice(0, 4)))
    .gte("mes", 1).lte("mes", 12)
  if (error) throw error

  const porMes = new Map<string, Map<string, number | null>>()
  for (const fila of data ?? []) {
    const periodo = `${fila.anio}-${String(fila.mes).padStart(2, "0")}-01`
    if (fila.mes > fila.ultimo_mes || periodo < desde || periodo > hasta) continue
    const cuentas = porMes.get(periodo) ?? new Map<string, number | null>()
    cuentas.set(fila.cuenta_codigo, cuentas.has(fila.cuenta_codigo) || fila.valor == null
      ? null : Number(fila.valor))
    porMes.set(periodo, cuentas)
  }

  const saldos: SaldoBancarioRevision[] = []
  for (const [periodo, cuentas] of porMes) {
    const valores = cuentasBancos.map((codigo) => cuentas.get(codigo))
    if (valores.every((valor): valor is number => typeof valor === "number" && Number.isFinite(valor))) {
      saldos.push({ periodo, saldo: valores.reduce((total, valor) => total + valor, 0) })
    }
  }
  return saldos
}
