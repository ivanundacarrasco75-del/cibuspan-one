// Semanas ISO: lunes a domingo; la semana 1 contiene el 4 de enero.
export function semanasDelAnio(anio: number) {
  if (!Number.isInteger(anio) || anio < 1900 || anio > 9998) return []
  const primerLunes = (year: number) => {
    const fecha = new Date(Date.UTC(year, 0, 4))
    fecha.setUTCDate(fecha.getUTCDate() - (fecha.getUTCDay() + 6) % 7)
    return fecha.getTime()
  }
  const inicio = primerLunes(anio), diasSemana = 7 * 86400000
  return Array.from({ length: (primerLunes(anio + 1) - inicio) / diasSemana }, (_, indice) => ({
    numero: indice + 1, desde: new Date(inicio + indice * diasSemana).toISOString().slice(0, 10),
  }))
}
