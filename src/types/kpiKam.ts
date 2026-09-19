export const CODIGOS_KPI_KAM = [
  "VENTAS_PRESUPUESTO",
  "MARGEN_CONTRIBUCION",
  "DEVOLUCIONES",
  "FUGAS_COMERCIALES",
  "CRECIMIENTO_RENTABLE",
  "COBERTURA_SKU",
  "COMPROMISOS",
] as const

export type CodigoKpiKam = (typeof CODIGOS_KPI_KAM)[number]

export type ClasificacionKpiKam = "VERDE" | "AMARILLO" | "ROJO"

export type EstadoResultadoKpi =
  | "CALCULADO"
  | "NO_APLICA"
  | "SIN_DATOS"

export type OperadorReglaCritica =
  | "MAYOR_QUE"
  | "MAYOR_O_IGUAL"
  | "MENOR_QUE"
  | "MENOR_O_IGUAL"
  | "IGUAL"

export type RangoPuntuacionKpi = {
  puntos: number
  desde?: number
  hasta?: number
  mayor_que?: number
  brecha_pp_hasta?: number
  brecha_pp_mayor?: number
  cumplimiento_meta_desde?: number
  crecimiento_negativo?: boolean
}

export type ReglaCriticaKpi = {
  codigo: string
  operador: OperadorReglaCritica
  umbral: number
  bloquea_verde?: boolean
  mensaje?: string
}

export type ConfiguracionKpiKam = {
  id: string
  codigo: CodigoKpiKam
  nombre: string
  aplica: boolean
  peso: number
  meta: number | null
  rangosPuntuacion: RangoPuntuacionKpi[]
  reglasCriticas: ReglaCriticaKpi[]
}

export type BaseCalculoKpiKam = {
  periodo: string
  kamUserId: string | null
  clienteId: string | null
  clienteNombre?: string | null

  ventaBruta: number
  ventaFacturadaNeta: number
  devolucionesValor: number
  ajustesVentaNeta: number
  fugasComercialesValor: number
  presupuesto: number | null

  costoProducto: number | null
  transporte: number | null
  costosVariablesComerciales: number | null
  promocionesCostoAdicional: number | null

  contribucionAnterior: number | null

  posicionesSkuLocalActivas: number
  posicionesSkuLocalObjetivo: number

  compromisosCumplidosATiempo: number
  compromisosConVencimiento: number

  advertencias?: string[]
}

export type AlertaKpiKam = {
  codigo: string
  kpi: CodigoKpiKam
  mensaje: string
  critica: boolean
  bloqueaVerde: boolean
}

export type ResultadoKpiKamDetalle = {
  codigo: CodigoKpiKam
  nombre: string
  estado: EstadoResultadoKpi
  valor: number | null
  numerador: number | null
  denominador: number | null
  meta: number | null
  nota: number | null
  pesoConfigurado: number
  pesoEfectivo: number
  puntos: number | null
  alertas: AlertaKpiKam[]
  motivo: string | null
}

export type ResultadoKpiKam = {
  periodo: string
  kamUserId: string | null
  clienteId: string | null
  clienteNombre: string | null
  provisional: boolean
  completo: boolean
  puntaje: number | null
  clasificacion: ClasificacionKpiKam | null
  alertaCritica: boolean
  ventaNeta: number
  contribucion: number | null
  margenContribucion: number | null
  detalles: ResultadoKpiKamDetalle[]
  alertas: AlertaKpiKam[]
  advertencias: string[]
}
