export type PeriodoDashboard =
  | "MES"
  | "TRIMESTRE"
  | "SEMESTRE"
  | "ANIO"
  | "PERSONALIZADO"

export type AgrupacionDashboard =
  | "DIA"
  | "SEMANA"
  | "MES"
  | "TRIMESTRE"
  | "SEMESTRE"

export const ETIQUETAS_AGRUPACION: Record<AgrupacionDashboard, string> = {
  DIA: "Días",
  SEMANA: "Semanas",
  MES: "Meses",
  TRIMESTRE: "Trimestres",
  SEMESTRE: "Semestres",
}

export function diasEntreDashboard(desde: string, hasta: string) {
  const inicio = new Date(`${desde}T12:00:00`).getTime()
  const fin = new Date(`${hasta}T12:00:00`).getTime()
  return Math.max(1, Math.round((fin - inicio) / 86400000) + 1)
}

export function agrupacionesParaPeriodo(
  periodo: string,
  desde: string,
  hasta: string,
): AgrupacionDashboard[] {
  if (periodo === "MES") return ["SEMANA", "DIA"]
  if (periodo === "TRIMESTRE") return ["MES", "SEMANA"]
  if (periodo === "SEMESTRE") return ["MES", "TRIMESTRE"]
  if (periodo === "ANIO") return ["MES", "TRIMESTRE", "SEMESTRE"]

  const dias = diasEntreDashboard(desde, hasta)
  if (dias <= 31) return ["SEMANA", "DIA"]
  if (dias <= 93) return ["MES", "SEMANA"]
  if (dias <= 186) return ["MES", "TRIMESTRE"]
  return ["MES", "TRIMESTRE", "SEMESTRE"]
}

function fechaIsoLocal(fecha: Date) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, "0")
  const dia = String(fecha.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function numeroSemanaIso(fechaIso: string) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  fecha.setHours(0, 0, 0, 0)
  fecha.setDate(fecha.getDate() + 3 - ((fecha.getDay() + 6) % 7))
  const primerJueves = new Date(fecha.getFullYear(), 0, 4)
  return 1 + Math.round(
    ((fecha.getTime() - primerJueves.getTime()) / 86400000 -
      3 +
      ((primerJueves.getDay() + 6) % 7)) /
      7,
  )
}

export function inicioAgrupacion(
  fechaIso: string,
  agrupacion: AgrupacionDashboard,
) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  if (agrupacion === "DIA") return fechaIso
  if (agrupacion === "SEMANA") {
    const dia = fecha.getDay()
    fecha.setDate(fecha.getDate() - (dia === 0 ? 6 : dia - 1))
    return fechaIsoLocal(fecha)
  }
  if (agrupacion === "MES") {
    return fechaIsoLocal(new Date(fecha.getFullYear(), fecha.getMonth(), 1))
  }
  if (agrupacion === "TRIMESTRE") {
    const mesInicial = Math.floor(fecha.getMonth() / 3) * 3
    return fechaIsoLocal(new Date(fecha.getFullYear(), mesInicial, 1))
  }
  const mesInicial = fecha.getMonth() < 6 ? 0 : 6
  return fechaIsoLocal(new Date(fecha.getFullYear(), mesInicial, 1))
}

export function finAgrupacion(
  fechaIso: string,
  agrupacion: AgrupacionDashboard,
) {
  const inicio = new Date(`${inicioAgrupacion(fechaIso, agrupacion)}T12:00:00`)
  if (agrupacion === "DIA") return fechaIsoLocal(inicio)
  if (agrupacion === "SEMANA") {
    inicio.setDate(inicio.getDate() + 6)
    return fechaIsoLocal(inicio)
  }
  const meses = agrupacion === "MES" ? 1 : agrupacion === "TRIMESTRE" ? 3 : 6
  return fechaIsoLocal(new Date(inicio.getFullYear(), inicio.getMonth() + meses, 0))
}

export function etiquetaAgrupacion(
  fechaIso: string,
  agrupacion: AgrupacionDashboard,
) {
  const fecha = new Date(`${fechaIso}T12:00:00`)
  if (agrupacion === "DIA") {
    return `${String(fecha.getDate()).padStart(2, "0")}/${String(fecha.getMonth() + 1).padStart(2, "0")}`
  }
  if (agrupacion === "SEMANA") {
    return String(numeroSemanaIso(fechaIso)).padStart(2, "0")
  }
  if (agrupacion === "MES") {
    return new Intl.DateTimeFormat("es-EC", { month: "short" })
      .format(fecha)
      .replace(".", "")
  }
  if (agrupacion === "TRIMESTRE") {
    return `Q${Math.floor(fecha.getMonth() / 3) + 1}`
  }
  return fecha.getMonth() < 6 ? "S1" : "S2"
}

export function detalleAgrupacion(
  fechaIso: string,
  agrupacion: AgrupacionDashboard,
) {
  const inicio = inicioAgrupacion(fechaIso, agrupacion)
  const fin = finAgrupacion(fechaIso, agrupacion)
  const formato = (valor: string) => {
    const [anio, mes, dia] = valor.split("-")
    return `${dia}/${mes}/${anio}`
  }
  return inicio === fin ? formato(inicio) : `${formato(inicio)}–${formato(fin)}`
}
