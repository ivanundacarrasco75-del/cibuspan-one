import type {
  AlertaKpiKam,
  BaseCalculoKpiKam,
  ClasificacionKpiKam,
  CodigoKpiKam,
  ConfiguracionKpiKam,
  OperadorReglaCritica,
  RangoPuntuacionKpi,
  ResultadoKpiKam,
  ResultadoKpiKamDetalle,
} from "../types/kpiKam"
import { CODIGOS_KPI_KAM } from "../types/kpiKam"

const TOLERANCIA = 0.000001

type MetricaKpi = {
  valor: number | null
  numerador: number | null
  denominador: number | null
  motivo: string | null
}

function numeroFinito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor)
}

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(maximo, Math.max(minimo, valor))
}

function redondear(valor: number, decimales = 6) {
  const factor = 10 ** decimales
  return Math.round((valor + Number.EPSILON) * factor) / factor
}

function dividir(
  numerador: number,
  denominador: number,
): number | null {
  if (!numeroFinito(numerador) || !numeroFinito(denominador)) return null
  if (Math.abs(denominador) <= TOLERANCIA) return null
  return (numerador / denominador) * 100
}

function cumpleOperador(
  valor: number,
  operador: OperadorReglaCritica,
  umbral: number,
) {
  if (operador === "MAYOR_QUE") return valor > umbral
  if (operador === "MAYOR_O_IGUAL") return valor >= umbral
  if (operador === "MENOR_QUE") return valor < umbral
  if (operador === "MENOR_O_IGUAL") return valor <= umbral
  return Math.abs(valor - umbral) <= TOLERANCIA
}

function textoValor(valor: number) {
  return `${valor.toLocaleString("es-EC", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`
}

function calcularNota(
  valor: number,
  meta: number | null,
  rangos: RangoPuntuacionKpi[],
) {
  const brecha = meta == null ? null : Math.max(0, meta - valor)
  const cumplimientoMeta =
    meta != null && Math.abs(meta) > TOLERANCIA
      ? (valor / meta) * 100
      : null

  for (const rango of rangos) {
    let coincide = false

    if (rango.crecimiento_negativo === true && valor < 0) {
      coincide = true
    } else if (
      rango.cumplimiento_meta_desde != null &&
      cumplimientoMeta != null &&
      valor >= 0 &&
      cumplimientoMeta >= rango.cumplimiento_meta_desde
    ) {
      coincide = true
    } else if (
      rango.brecha_pp_hasta != null &&
      brecha != null &&
      brecha <= rango.brecha_pp_hasta + TOLERANCIA
    ) {
      coincide = true
    } else if (
      rango.brecha_pp_mayor != null &&
      brecha != null &&
      brecha > rango.brecha_pp_mayor
    ) {
      coincide = true
    } else if (rango.desde != null && valor >= rango.desde) {
      coincide = true
    } else if (rango.hasta != null && valor <= rango.hasta) {
      coincide = true
    } else if (rango.mayor_que != null && valor > rango.mayor_que) {
      coincide = true
    }

    if (coincide) return limitar(Number(rango.puntos), 0, 100)
  }

  return null
}

function calcularMetricas(base: BaseCalculoKpiKam) {
  const ventaNeta =
    Number(base.ventaFacturadaNeta || 0) -
    Number(base.devolucionesValor || 0) -
    Number(base.ajustesVentaNeta || 0)

  const costosCompletos = [
    base.costoProducto,
    base.transporte,
    base.costosVariablesComerciales,
    base.promocionesCostoAdicional,
  ].every(numeroFinito)

  const contribucion = costosCompletos
    ? ventaNeta -
      Number(base.costoProducto) -
      Number(base.transporte) -
      Number(base.costosVariablesComerciales) -
      Number(base.promocionesCostoAdicional)
    : null

  const margenContribucion =
    contribucion == null ? null : dividir(contribucion, ventaNeta)

  const crecimientoRentable =
    contribucion == null || base.contribucionAnterior == null
      ? null
      : dividir(
          contribucion - base.contribucionAnterior,
          Math.abs(base.contribucionAnterior),
        )

  const metricas: Record<CodigoKpiKam, MetricaKpi> = {
    VENTAS_PRESUPUESTO: {
      valor:
        base.presupuesto != null && base.presupuesto > TOLERANCIA
          ? dividir(ventaNeta, base.presupuesto)
          : null,
      numerador: ventaNeta,
      denominador: base.presupuesto,
      motivo:
        base.presupuesto == null || base.presupuesto <= TOLERANCIA
          ? "Falta presupuesto mensual."
          : null,
    },
    MARGEN_CONTRIBUCION: {
      valor: margenContribucion,
      numerador: contribucion,
      denominador: ventaNeta,
      motivo:
        contribucion == null
          ? "Faltan costos históricos o variables del periodo."
          : Math.abs(ventaNeta) <= TOLERANCIA
            ? "No existe venta neta para calcular el margen."
            : null,
    },
    DEVOLUCIONES: {
      valor: dividir(base.devolucionesValor, base.ventaBruta),
      numerador: base.devolucionesValor,
      denominador: base.ventaBruta,
      motivo:
        base.ventaBruta <= TOLERANCIA
          ? "No existe venta bruta para calcular devoluciones."
          : null,
    },
    FUGAS_COMERCIALES: {
      valor: dividir(base.fugasComercialesValor, base.ventaBruta),
      numerador: base.fugasComercialesValor,
      denominador: base.ventaBruta,
      motivo:
        base.ventaBruta <= TOLERANCIA
          ? "No existe venta bruta para calcular fugas."
          : null,
    },
    CRECIMIENTO_RENTABLE: {
      valor: crecimientoRentable,
      numerador:
        contribucion == null || base.contribucionAnterior == null
          ? null
          : contribucion - base.contribucionAnterior,
      denominador: base.contribucionAnterior,
      motivo:
        contribucion == null
          ? "No se pudo calcular la contribución actual."
          : base.contribucionAnterior == null
            ? "Falta la contribución del mismo periodo del año anterior."
            : Math.abs(base.contribucionAnterior) <= TOLERANCIA
              ? "La contribución del año anterior es cero."
              : null,
    },
    COBERTURA_SKU: {
      valor: dividir(
        base.posicionesSkuLocalActivas,
        base.posicionesSkuLocalObjetivo,
      ),
      numerador: base.posicionesSkuLocalActivas,
      denominador: base.posicionesSkuLocalObjetivo,
      motivo:
        base.posicionesSkuLocalObjetivo <= 0
          ? "No existen posiciones SKU-local objetivo configuradas."
          : null,
    },
    ROTACION_DIARIA: {
      valor: base.rotacionDiariaPromedio,
      numerador: base.rotacionDiariaPromedio,
      denominador: base.observacionesRotacion,
      motivo:
        base.rotacionDiariaPromedio == null || base.observacionesRotacion <= 0
          ? "Aún no existen capturas de rotación confirmadas en el periodo."
          : null,
    },
    COMPROMISOS: {
      valor: dividir(
        base.compromisosCumplidosATiempo,
        base.compromisosConVencimiento,
      ),
      numerador: base.compromisosCumplidosATiempo,
      denominador: base.compromisosConVencimiento,
      motivo:
        base.compromisosConVencimiento <= 0
          ? "No existen compromisos con vencimiento en el periodo."
          : null,
    },
  }

  return {
    ventaNeta: redondear(ventaNeta),
    contribucion: contribucion == null ? null : redondear(contribucion),
    margenContribucion:
      margenContribucion == null ? null : redondear(margenContribucion),
    metricas,
  }
}

function crearAlertas(
  configuracion: ConfiguracionKpiKam,
  valor: number,
) {
  return configuracion.reglasCriticas
    .filter((regla) => cumpleOperador(valor, regla.operador, regla.umbral))
    .map<AlertaKpiKam>((regla) => ({
      codigo: regla.codigo,
      kpi: configuracion.codigo,
      mensaje:
        regla.mensaje ??
        `${configuracion.nombre}: ${textoValor(valor)} activa la regla ${regla.codigo}.`,
      critica: true,
      bloqueaVerde: Boolean(regla.bloquea_verde),
    }))
}

function clasificar(puntaje: number): ClasificacionKpiKam {
  if (puntaje >= 90) return "VERDE"
  if (puntaje >= 75) return "AMARILLO"
  return "ROJO"
}

export function calcularResultadoKpiKam(
  base: BaseCalculoKpiKam,
  configuraciones: ConfiguracionKpiKam[],
): ResultadoKpiKam {
  const { ventaNeta, contribucion, margenContribucion, metricas } =
    calcularMetricas(base)

  const codigosRecibidos = configuraciones.map((item) => item.codigo)
  const configuracionCompleta =
    CODIGOS_KPI_KAM.every((codigo) => codigosRecibidos.includes(codigo)) &&
    new Set(codigosRecibidos).size === CODIGOS_KPI_KAM.length &&
    configuraciones.length === CODIGOS_KPI_KAM.length
  const pesoConfiguradoTotal = configuraciones.reduce(
    (total, configuracion) => total + configuracion.peso,
    0,
  )
  const pesosValidos = Math.abs(pesoConfiguradoTotal - 100) <= 0.01

  const pesoAplicable = configuraciones
    .filter((configuracion) => configuracion.aplica)
    .reduce((total, configuracion) => total + configuracion.peso, 0)

  const detalles = configuraciones.map<ResultadoKpiKamDetalle>(
    (configuracion) => {
      const pesoEfectivo =
        configuracion.aplica && pesoAplicable > TOLERANCIA
          ? (configuracion.peso / pesoAplicable) * 100
          : 0

      if (!configuracion.aplica) {
        return {
          codigo: configuracion.codigo,
          nombre: configuracion.nombre,
          estado: "NO_APLICA",
          valor: null,
          numerador: null,
          denominador: null,
          meta: configuracion.meta,
          nota: null,
          pesoConfigurado: configuracion.peso,
          pesoEfectivo: 0,
          puntos: null,
          alertas: [],
          motivo: "KPI configurado como no aplicable.",
        }
      }

      const metrica = metricas[configuracion.codigo]
      if (metrica.valor == null || !numeroFinito(metrica.valor)) {
        return {
          codigo: configuracion.codigo,
          nombre: configuracion.nombre,
          estado: "SIN_DATOS",
          valor: null,
          numerador: metrica.numerador,
          denominador: metrica.denominador,
          meta: configuracion.meta,
          nota: null,
          pesoConfigurado: configuracion.peso,
          pesoEfectivo: redondear(pesoEfectivo, 4),
          puntos: null,
          alertas: [],
          motivo: metrica.motivo ?? "Información insuficiente.",
        }
      }

      const nota = calcularNota(
        metrica.valor,
        configuracion.meta,
        configuracion.rangosPuntuacion,
      )

      if (nota == null) {
        const alertas = crearAlertas(configuracion, metrica.valor)
        return {
          codigo: configuracion.codigo,
          nombre: configuracion.nombre,
          estado: "SIN_DATOS",
          valor: redondear(metrica.valor),
          numerador: metrica.numerador,
          denominador: metrica.denominador,
          meta: configuracion.meta,
          nota: null,
          pesoConfigurado: configuracion.peso,
          pesoEfectivo: redondear(pesoEfectivo, 4),
          puntos: null,
          alertas,
          motivo: "Los rangos configurados no cubren el valor calculado.",
        }
      }

      const alertas = crearAlertas(configuracion, metrica.valor)

      return {
        codigo: configuracion.codigo,
        nombre: configuracion.nombre,
        estado: "CALCULADO",
        valor: redondear(metrica.valor),
        numerador:
          metrica.numerador == null ? null : redondear(metrica.numerador),
        denominador:
          metrica.denominador == null ? null : redondear(metrica.denominador),
        meta: configuracion.meta,
        nota: redondear(nota, 4),
        pesoConfigurado: configuracion.peso,
        pesoEfectivo: redondear(pesoEfectivo, 4),
        puntos: redondear((nota * pesoEfectivo) / 100, 4),
        alertas,
        motivo: null,
      }
    },
  )

  const aplicables = detalles.filter((detalle) => detalle.estado !== "NO_APLICA")
  const completo =
    configuracionCompleta &&
    pesosValidos &&
    aplicables.length > 0 &&
    aplicables.every((detalle) => detalle.estado === "CALCULADO")
  const puntaje = completo
    ? limitar(
        detalles.reduce((total, detalle) => total + Number(detalle.puntos ?? 0), 0),
        0,
        100,
      )
    : null

  const alertas = detalles.flatMap((detalle) => detalle.alertas)
  const alertaCritica = alertas.some((alerta) => alerta.critica)
  let clasificacion = puntaje == null ? null : clasificar(puntaje)

  if (
    clasificacion === "VERDE" &&
    alertas.some((alerta) => alerta.bloqueaVerde)
  ) {
    clasificacion = "AMARILLO"
  }

  return {
    periodo: base.periodo,
    kamUserId: base.kamUserId,
    clienteId: base.clienteId,
    clienteNombre: base.clienteNombre ?? null,
    provisional: true,
    completo,
    puntaje: puntaje == null ? null : redondear(puntaje, 4),
    clasificacion,
    alertaCritica,
    ventaNeta,
    contribucion,
    margenContribucion,
    detalles,
    alertas,
    advertencias: [
      ...(base.advertencias ?? []),
      ...(!configuracionCompleta
        ? [`La configuración no contiene exactamente los ${CODIGOS_KPI_KAM.length} KPI.`]
        : []),
      ...(!pesosValidos
        ? [
            `Los pesos configurados suman ${redondear(pesoConfiguradoTotal, 2)}% y deben sumar 100%.`,
          ]
        : []),
    ],
  }
}
