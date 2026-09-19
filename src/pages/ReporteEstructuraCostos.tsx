import {
  useEffect,
  useMemo,
  useState,
} from "react"

import { supabase } from "../lib/supabase"

type CostoNaturalezaDb = {
  periodo: string
  naturaleza: "MP" | "MOD" | "CIF" | "AJUSTE"
  rubro_codigo: string
  rubro_nombre: string
  cuenta_codigo: string
  cuenta_nombre: string
  valor: number
  fuente: string
  observaciones: string | null
}

type OrdenHistorica = {
  id?: string
  fecha_produccion: string
  producto_id: string | null
  producto_codigo: string | null
  unidades_producidas: number | null
  tipo_orden: string
  estado_validacion: string | null
}

type CostoProducto = {
  producto_id: string
  producto_codigo: string
  batch_calculado_kg: number | null
  rendimiento_unidades: number | null
}

type Agrupacion = "MES" | "TRIMESTRE" | "SEMESTRE" | "ANIO"
type ModoValor = "TOTAL" | "POR_KG"
type ModoPareto = "RUBRO" | "CUENTA"
type ModoEvolucion = "RUBRO" | "CUENTA"

type SerieDef = {
  codigo: string
  etiqueta: string
  color: string
  tipo: "AGREGADO" | "RUBRO" | "REFERENCIA"
  unidad: "USD" | "KG"
}

type PuntoSerie = {
  key: string
  orden: number
  etiqueta: string
  kg: number
  ventasNetas: number
  valores: Record<string, number>
}

type VentaMensualDb = {
  periodo: string
  ventas_netas: number
}

function periodoMes(valor: string) {
  return `${valor.slice(0, 7)}-01`
}

function finMes(valor: string) {
  const [anio, mes] = valor.slice(0, 7).split("-").map(Number)
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
}

function mesCorto(periodo: string) {
  const [anio, mes] = periodo.split("-").map(Number)
  return new Intl.DateTimeFormat("es-EC", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
}

function agruparPeriodo(periodo: string, agrupacion: Agrupacion) {
  const [anio, mes] = periodo.split("-").map(Number)

  if (agrupacion === "MES") {
    return {
      key: periodo,
      orden: anio * 100 + mes,
      etiqueta: mesCorto(periodo),
    }
  }

  if (agrupacion === "TRIMESTRE") {
    const trimestre = Math.ceil(mes / 3)
    return {
      key: `${anio}-T${trimestre}`,
      orden: anio * 10 + trimestre,
      etiqueta: `T${trimestre} ${anio}`,
    }
  }

  if (agrupacion === "SEMESTRE") {
    const semestre = mes <= 6 ? 1 : 2
    return {
      key: `${anio}-S${semestre}`,
      orden: anio * 10 + semestre,
      etiqueta: `S${semestre} ${anio}`,
    }
  }

  return {
    key: String(anio),
    orden: anio,
    etiqueta: String(anio),
  }
}

function moneda(valor: number) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numero(valor: number, decimales = 0) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

function porcentaje(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) return "—"
  return `${valor.toLocaleString("es-EC", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

async function obtenerOrdenesPaginadas(
  fechaDesde: string,
  fechaHasta: string,
) {
  const registros: OrdenHistorica[] = []
  const tamanoPagina = 1000
  let inicio = 0

  while (true) {
    const { data, error } = await supabase
      .from("pro_ordenes_historicas")
      .select(
        "id,fecha_produccion,producto_id,producto_codigo,unidades_producidas,tipo_orden,estado_validacion",
      )
      .eq("tipo_orden", "SKU")
      .gte("fecha_produccion", fechaDesde)
      .lte("fecha_produccion", fechaHasta)
      .order("id", { ascending: true })
      .range(inicio, inicio + tamanoPagina - 1)

    if (error) {
      return { data: [] as OrdenHistorica[], error }
    }

    const pagina = (data ?? []) as OrdenHistorica[]
    registros.push(...pagina)

    if (pagina.length < tamanoPagina) break
    inicio += tamanoPagina
  }

  return { data: registros, error: null }
}

export default function ReporteEstructuraCostos() {
  const [costos, setCostos] = useState<CostoNaturalezaDb[]>([])
  const [ordenes, setOrdenes] = useState<OrdenHistorica[]>([])
  const [costosProducto, setCostosProducto] = useState<CostoProducto[]>([])
  const [ventasMensuales, setVentasMensuales] = useState<VentaMensualDb[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [desdeAplicado, setDesdeAplicado] = useState("")
  const [hastaAplicado, setHastaAplicado] = useState("")
  const [agrupacion, setAgrupacion] = useState<Agrupacion>("MES")
  const [modoValor, setModoValor] = useState<ModoValor>("TOTAL")
  const [modoPareto, setModoPareto] = useState<ModoPareto>("RUBRO")
  const [modoEvolucion, setModoEvolucion] =
    useState<ModoEvolucion>("RUBRO")
  const [incluirAjustes, setIncluirAjustes] = useState(false)
  const [cuentasSeleccionadas, setCuentasSeleccionadas] =
    useState<string[]>([])

  const series: SerieDef[] = useMemo(
    () => [
      { codigo: "VENTAS_NETAS", etiqueta: "Ventas netas", color: "#22d3ee", tipo: "REFERENCIA", unidad: "USD" },
      { codigo: "PRODUCCION_KG", etiqueta: "Producción kg", color: "#facc15", tipo: "REFERENCIA", unidad: "KG" },
      { codigo: "FAB_TOTAL", etiqueta: "Costo fabricación", color: "#f43f5e", tipo: "AGREGADO", unidad: "USD" },
      { codigo: "MP_TOTAL", etiqueta: "Materia prima", color: "#38bdf8", tipo: "AGREGADO", unidad: "USD" },
      { codigo: "MOD_TOTAL", etiqueta: "Sueldos y salarios", color: "#a78bfa", tipo: "AGREGADO", unidad: "USD" },
      { codigo: "CIF_TOTAL", etiqueta: "CIF gerencial", color: "#f59e0b", tipo: "AGREGADO", unidad: "USD" },
      { codigo: "CIF_MANTENIMIENTO", etiqueta: "Mantenimiento", color: "#22c55e", tipo: "RUBRO", unidad: "USD" },
      { codigo: "CIF_COMBUSTIBLES", etiqueta: "Combustibles", color: "#fb7185", tipo: "RUBRO", unidad: "USD" },
      { codigo: "CIF_ELECTRICIDAD", etiqueta: "Electricidad", color: "#fde047", tipo: "RUBRO", unidad: "USD" },
      { codigo: "CIF_ARRENDAMIENTO", etiqueta: "Arrendamiento", color: "#2dd4bf", tipo: "RUBRO", unidad: "USD" },
      { codigo: "CIF_SUMINISTROS", etiqueta: "Suministros", color: "#60a5fa", tipo: "RUBRO", unidad: "USD" },
      { codigo: "CIF_DEPRECIACION", etiqueta: "Depreciación maquinaria", color: "#c084fc", tipo: "RUBRO", unidad: "USD" },
      { codigo: "CIF_OTROS", etiqueta: "Otros CIF", color: "#94a3b8", tipo: "RUBRO", unidad: "USD" },
      { codigo: "AJUSTE_DEVOLUCIONES", etiqueta: "Desperdicio devoluciones", color: "#f97316", tipo: "RUBRO", unidad: "USD" },
      { codigo: "AJUSTE_INVENTARIO", etiqueta: "Ajustes inventario", color: "#e879f9", tipo: "RUBRO", unidad: "USD" },
    ],
    [],
  )

  const [seleccionadas, setSeleccionadas] = useState<string[]>([
    "VENTAS_NETAS",
    "PRODUCCION_KG",
    "MP_TOTAL",
    "MOD_TOTAL",
    "CIF_TOTAL",
  ])

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      setError("")

      try {
        const { data, error: errorCostos } = await supabase
          .from("fin_costos_fabricacion_naturaleza")
          .select(
            "periodo,naturaleza,rubro_codigo,rubro_nombre,cuenta_codigo,cuenta_nombre,valor,fuente,observaciones",
          )
          .order("periodo", { ascending: true })
          .order("rubro_codigo", { ascending: true })

        if (errorCostos) throw errorCostos

        const filas = (data ?? []) as CostoNaturalezaDb[]
        setCostos(filas)

        const periodos = Array.from(
          new Set(filas.map((fila) => periodoMes(fila.periodo))),
        ).sort()

        if (periodos.length > 0) {
          const primero = periodos[0]
          const ultimo = periodos.at(-1) ?? primero
          setDesde(primero)
          setHasta(ultimo)
          setDesdeAplicado(primero)
          setHastaAplicado(ultimo)

          const [ordenesRes, costosRes, ventasRes] = await Promise.all([
            obtenerOrdenesPaginadas(primero, finMes(ultimo)),
            supabase
              .from("fm_vw_productos_costo_completo")
              .select(
                "producto_id,producto_codigo,batch_calculado_kg,rendimiento_unidades",
              ),
            supabase
              .from("fin_vw_margen_bruto_mensual")
              .select("periodo,ventas_netas")
              .gte("periodo", primero)
              .lte("periodo", ultimo)
              .order("periodo", { ascending: true }),
          ])

          if (!ordenesRes.error) {
            setOrdenes(ordenesRes.data)
          }

          if (!costosRes.error) {
            setCostosProducto(
              (costosRes.data ?? []) as CostoProducto[],
            )
          }

          if (!ventasRes.error) {
            setVentasMensuales(
              (ventasRes.data ?? []) as VentaMensualDb[],
            )
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la estructura de costos.",
        )
      } finally {
        setCargando(false)
      }
    }

    void cargar()
  }, [])

  useEffect(() => {
    if (!desdeAplicado || !hastaAplicado) return

    async function recargarProduccion() {
      const resultado = await obtenerOrdenesPaginadas(
        desdeAplicado,
        finMes(hastaAplicado),
      )
      if (!resultado.error) setOrdenes(resultado.data)
    }

    void recargarProduccion()
  }, [desdeAplicado, hastaAplicado])

  const kgPorMes = useMemo(() => {
    const costoId = new Map(
      costosProducto.map((fila) => [fila.producto_id, fila]),
    )
    const costoCodigo = new Map(
      costosProducto.map((fila) => [fila.producto_codigo, fila]),
    )
    const mapa = new Map<string, number>()

    ordenes.forEach((orden) => {
      if (
        orden.tipo_orden !== "SKU" ||
        orden.estado_validacion === "ANULADA"
      ) {
        return
      }

      const costo =
        (orden.producto_id
          ? costoId.get(orden.producto_id)
          : undefined) ??
        (orden.producto_codigo
          ? costoCodigo.get(orden.producto_codigo)
          : undefined)

      const rendimiento = Number(costo?.rendimiento_unidades ?? 0)
      const batchKg = Number(costo?.batch_calculado_kg ?? 0)
      const unidades = Number(orden.unidades_producidas ?? 0)

      if (rendimiento <= 0 || batchKg <= 0 || unidades <= 0) return

      const kg = unidades * (batchKg / rendimiento)
      const periodo = periodoMes(orden.fecha_produccion)
      mapa.set(periodo, (mapa.get(periodo) ?? 0) + kg)
    })

    return mapa
  }, [ordenes, costosProducto])

  const filasPeriodo = useMemo(
    () =>
      costos.filter((fila) => {
        const periodo = periodoMes(fila.periodo)
        return (
          periodo >= desdeAplicado &&
          periodo <= hastaAplicado
        )
      }),
    [costos, desdeAplicado, hastaAplicado],
  )

  const totales = useMemo(() => {
    const total = (naturaleza: CostoNaturalezaDb["naturaleza"]) =>
      filasPeriodo
        .filter((fila) => fila.naturaleza === naturaleza)
        .reduce((suma, fila) => suma + Number(fila.valor ?? 0), 0)

    const mp = total("MP")
    const mod = total("MOD")
    const cif = total("CIF")
    const ajustes = total("AJUSTE")
    const fabricacion = mp + mod + cif
    const kg = Array.from(kgPorMes.entries())
      .filter(([periodo]) =>
        periodo >= desdeAplicado && periodo <= hastaAplicado,
      )
      .reduce((suma, [, valor]) => suma + valor, 0)

    const ventas = ventasMensuales
      .filter((fila) => {
        const periodo = periodoMes(fila.periodo)
        return periodo >= desdeAplicado && periodo <= hastaAplicado
      })
      .reduce(
        (suma, fila) => suma + Number(fila.ventas_netas ?? 0),
        0,
      )

    return {
      mp,
      mod,
      cif,
      ajustes,
      fabricacion,
      kg,
      ventas,
      modPct: fabricacion !== 0 ? (mod / fabricacion) * 100 : null,
      modVentasPct: ventas !== 0 ? (mod / ventas) * 100 : null,
      cifVentasPct: ventas !== 0 ? (cif / ventas) * 100 : null,
      mpVentasPct: ventas !== 0 ? (mp / ventas) * 100 : null,
      fabricacionVentasPct:
        ventas !== 0 ? (fabricacion / ventas) * 100 : null,
      modKg: kg > 0 ? mod / kg : null,
      cifKg: kg > 0 ? cif / kg : null,
      mpKg: kg > 0 ? mp / kg : null,
    }
  }, [
    filasPeriodo,
    kgPorMes,
    ventasMensuales,
    desdeAplicado,
    hastaAplicado,
  ])

  const datosGrafico = useMemo<PuntoSerie[]>(() => {
    const mapa = new Map<string, PuntoSerie>()

    filasPeriodo.forEach((fila) => {
      const grupo = agruparPeriodo(
        periodoMes(fila.periodo),
        agrupacion,
      )
      const actual =
        mapa.get(grupo.key) ?? {
          key: grupo.key,
          orden: grupo.orden,
          etiqueta: grupo.etiqueta,
          kg: 0,
          ventasNetas: 0,
          valores: {},
        }

      actual.valores[fila.rubro_codigo] =
        (actual.valores[fila.rubro_codigo] ?? 0) +
        Number(fila.valor ?? 0)

      const cuentaGrafico =
        fila.naturaleza === "MOD"
          ? "ACC|MOD|SUELDOS_Y_SALARIOS"
          : `ACC|${fila.naturaleza}|${fila.cuenta_codigo}`

      actual.valores[cuentaGrafico] =
        (actual.valores[cuentaGrafico] ?? 0) +
        Number(fila.valor ?? 0)

      actual.valores[`${fila.naturaleza}_TOTAL`] =
        (actual.valores[`${fila.naturaleza}_TOTAL`] ?? 0) +
        Number(fila.valor ?? 0)

      mapa.set(grupo.key, actual)
    })

    kgPorMes.forEach((kg, periodo) => {
      if (periodo < desdeAplicado || periodo > hastaAplicado) return
      const grupo = agruparPeriodo(periodo, agrupacion)
      const actual =
        mapa.get(grupo.key) ?? {
          key: grupo.key,
          orden: grupo.orden,
          etiqueta: grupo.etiqueta,
          kg: 0,
          ventasNetas: 0,
          valores: {},
        }

      actual.kg += kg
      mapa.set(grupo.key, actual)
    })

    ventasMensuales.forEach((venta) => {
      const periodo = periodoMes(venta.periodo)
      if (periodo < desdeAplicado || periodo > hastaAplicado) return
      const grupo = agruparPeriodo(periodo, agrupacion)
      const actual =
        mapa.get(grupo.key) ?? {
          key: grupo.key,
          orden: grupo.orden,
          etiqueta: grupo.etiqueta,
          kg: 0,
          ventasNetas: 0,
          valores: {},
        }

      actual.ventasNetas += Number(venta.ventas_netas ?? 0)
      mapa.set(grupo.key, actual)
    })

    return Array.from(mapa.values())
      .map((punto) => ({
        ...punto,
        valores: {
          ...punto.valores,
          FAB_TOTAL:
            Number(punto.valores.MP_TOTAL ?? 0) +
            Number(punto.valores.MOD_TOTAL ?? 0) +
            Number(punto.valores.CIF_TOTAL ?? 0),
          VENTAS_NETAS: punto.ventasNetas,
          PRODUCCION_KG: punto.kg,
        },
      }))
      .sort((a, b) => a.orden - b.orden)
  }, [
    filasPeriodo,
    agrupacion,
    kgPorMes,
    ventasMensuales,
    desdeAplicado,
    hastaAplicado,
  ])

  const cuentasDisponibles = useMemo(() => {
    type CuentaAgrupada = {
      codigo: string
      etiqueta: string
      valor: number
    }

    const mapa = new Map<string, CuentaAgrupada>()

    filasPeriodo.forEach((fila) => {
      const codigo =
        fila.naturaleza === "MOD"
          ? "ACC|MOD|SUELDOS_Y_SALARIOS"
          : `ACC|${fila.naturaleza}|${fila.cuenta_codigo}`

      const etiqueta =
        fila.naturaleza === "MOD"
          ? "Sueldos y salarios"
          : fila.cuenta_nombre

      const actual =
        mapa.get(codigo) ?? {
          codigo,
          etiqueta,
          valor: 0,
        }

      actual.valor += Number(fila.valor ?? 0)
      mapa.set(codigo, actual)
    })

    return Array.from(mapa.values())
      .filter((fila) => fila.valor > 0)
      .sort((a, b) => b.valor - a.valor)
  }, [filasPeriodo])

  useEffect(() => {
    if (
      modoEvolucion === "CUENTA" &&
      cuentasSeleccionadas.length === 0 &&
      cuentasDisponibles.length > 0
    ) {
      setCuentasSeleccionadas(
        cuentasDisponibles.slice(0, 5).map((fila) => fila.codigo),
      )
    }
  }, [
    modoEvolucion,
    cuentasSeleccionadas.length,
    cuentasDisponibles,
  ])

  const seriesCuentas = useMemo<SerieDef[]>(() => {
    const colores = [
      "#a78bfa",
      "#38bdf8",
      "#22c55e",
      "#f59e0b",
      "#fb7185",
      "#2dd4bf",
      "#c084fc",
      "#60a5fa",
      "#fde047",
      "#94a3b8",
    ]

    return [
      {
        codigo: "VENTAS_NETAS",
        etiqueta: "Ventas netas",
        color: "#22d3ee",
        tipo: "REFERENCIA",
        unidad: "USD",
      },
      {
        codigo: "PRODUCCION_KG",
        etiqueta: "Producción kg",
        color: "#facc15",
        tipo: "REFERENCIA",
        unidad: "KG",
      },
      ...cuentasDisponibles.map((cuenta, indice) => ({
        codigo: cuenta.codigo,
        etiqueta: cuenta.etiqueta,
        color: colores[indice % colores.length],
        tipo: "RUBRO" as const,
        unidad: "USD" as const,
      })),
    ]
  }, [cuentasDisponibles])

  const seriesActivas = useMemo(() => {
    if (modoEvolucion === "CUENTA") {
      return seriesCuentas.filter(
        (serie) =>
          serie.codigo === "VENTAS_NETAS" ||
          serie.codigo === "PRODUCCION_KG" ||
          cuentasSeleccionadas.includes(serie.codigo),
      )
    }

    return series.filter((serie) =>
      seleccionadas.includes(serie.codigo),
    )
  }, [
    modoEvolucion,
    series,
    seriesCuentas,
    seleccionadas,
    cuentasSeleccionadas,
  ])

  const escalaGrafico = useMemo(() => {
    const valoresUsd = datosGrafico.flatMap((punto) =>
      seriesActivas
        .filter((serie) => serie.unidad === "USD")
        .map((serie) => {
          const valor = Number(punto.valores[serie.codigo] ?? 0)
          if (
            modoValor === "POR_KG" &&
            serie.codigo !== "VENTAS_NETAS"
          ) {
            return punto.kg > 0 ? valor / punto.kg : 0
          }
          return valor
        }),
    )

    const valoresKg = datosGrafico.flatMap((punto) =>
      seriesActivas
        .filter((serie) => serie.unidad === "KG")
        .map((serie) => Number(punto.valores[serie.codigo] ?? 0)),
    )

    const maxUsd = Math.max(1, ...valoresUsd.map((valor) => Math.abs(valor)))
    const minUsd = Math.min(0, ...valoresUsd)
    const maxKg = Math.max(1, ...valoresKg.map((valor) => Math.abs(valor)))

    return {
      minUsd,
      maxUsd,
      maxKg,
    }
  }, [datosGrafico, seriesActivas, modoValor])

  const pareto = useMemo(() => {
    type Fila = {
      id: string
      nombre: string
      detalle: string
      valor: number
      participacion: number
      acumulado: number
    }

    const mapa = new Map<
      string,
      { nombre: string; detalle: string; valor: number }
    >()

    filasPeriodo
      .filter(
        (fila) =>
          incluirAjustes || fila.naturaleza !== "AJUSTE",
      )
      .forEach((fila) => {
        const esNomina = fila.naturaleza === "MOD"

        const id = esNomina
          ? "MOD_SUELDOS_Y_SALARIOS"
          : modoPareto === "RUBRO"
            ? fila.rubro_codigo
            : `${fila.naturaleza}|${fila.cuenta_codigo}`

        const nombre = esNomina
          ? "Sueldos y salarios"
          : modoPareto === "RUBRO"
            ? fila.rubro_nombre
            : fila.cuenta_nombre

        const detalle = esNomina
          ? "5.2.02.1.01.* · nómina de producción agrupada"
          : modoPareto === "RUBRO"
            ? fila.naturaleza
            : fila.cuenta_codigo

        const actual =
          mapa.get(id) ?? { nombre, detalle, valor: 0 }

        actual.valor += Number(fila.valor ?? 0)
        mapa.set(id, actual)
      })

    const ordenadas = Array.from(mapa.entries())
      .map(([id, fila]) => ({ id, ...fila }))
      .filter((fila) => fila.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 12)

    const total = ordenadas.reduce(
      (suma, fila) => suma + fila.valor,
      0,
    )

    let acumulado = 0

    const filas: Fila[] = ordenadas.map((fila) => {
      const participacion =
        total > 0 ? (fila.valor / total) * 100 : 0
      acumulado += participacion
      return {
        ...fila,
        participacion,
        acumulado,
      }
    })

    return {
      filas,
      total,
      maximo: Math.max(1, ...filas.map((fila) => fila.valor)),
    }
  }, [
    filasPeriodo,
    incluirAjustes,
    modoPareto,
  ])

  function alternarSerie(codigo: string) {
    setSeleccionadas((actuales) =>
      actuales.includes(codigo)
        ? actuales.filter((item) => item !== codigo)
        : [...actuales, codigo],
    )
  }

  function alternarCuenta(codigo: string) {
    setCuentasSeleccionadas((actuales) =>
      actuales.includes(codigo)
        ? actuales.filter((item) => item !== codigo)
        : [...actuales, codigo],
    )
  }

  function seleccionarTopCuentas() {
    setCuentasSeleccionadas(
      cuentasDisponibles.slice(0, 5).map((fila) => fila.codigo),
    )
  }

  function aplicar() {
    if (!desde || !hasta) return
    if (desde > hasta) {
      setError("El período inicial no puede ser posterior al final.")
      return
    }
    setDesdeAplicado(desde)
    setHastaAplicado(hasta)
  }

  const periodosDisponibles = useMemo(
    () =>
      Array.from(
        new Set(costos.map((fila) => periodoMes(fila.periodo))),
      ).sort(),
    [costos],
  )

  return (
    <section style={panelOscuro}>
      <div style={cabecera}>
        <div>
          <span style={eyebrow}>ESTRUCTURA Y EFICIENCIA DE COSTOS</span>
          <h2 style={titulo}>¿Dónde se está yendo el costo?</h2>
          <p style={subtitulo}>
            MP, mano de obra, CIF y cuentas específicas. Esta vista analiza
            costo de fabricación incurrido/absorbido; el margen bruto contable
            sigue siendo la referencia oficial para costo reconocido en ventas.
          </p>
        </div>
      </div>

      <div style={filtros}>
        <label style={campo}>
          <span style={label}>Desde</span>
          <select
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            style={select}
          >
            {periodosDisponibles.map((periodo) => (
              <option key={periodo} value={periodo}>
                {mesCorto(periodo)}
              </option>
            ))}
          </select>
        </label>

        <label style={campo}>
          <span style={label}>Hasta</span>
          <select
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            style={select}
          >
            {periodosDisponibles.map((periodo) => (
              <option key={periodo} value={periodo}>
                {mesCorto(periodo)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={aplicar}
          style={botonAplicar}
        >
          Aplicar
        </button>

        <div style={botonesGrupo}>
          {([
            ["MES", "Mes"],
            ["TRIMESTRE", "Trimestre"],
            ["SEMESTRE", "Semestre"],
            ["ANIO", "Año"],
          ] as [Agrupacion, string][]).map(([codigo, texto]) => (
            <button
              key={codigo}
              type="button"
              onClick={() => setAgrupacion(codigo)}
              style={{
                ...botonPill,
                ...(agrupacion === codigo ? botonPillActivo : {}),
              }}
            >
              {texto}
            </button>
          ))}
        </div>

        <div style={botonesGrupo}>
          {([
            ["TOTAL", "Valor $"],
            ["POR_KG", "$ / kg"],
          ] as [ModoValor, string][]).map(([codigo, texto]) => (
            <button
              key={codigo}
              type="button"
              onClick={() => setModoValor(codigo)}
              style={{
                ...botonPill,
                ...(modoValor === codigo ? botonPillActivoAzul : {}),
              }}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={errorCaja}>{error}</div>}

      <div style={kpis}>
        <Kpi
          titulo="Ventas netas"
          valor={moneda(totales.ventas)}
          detalle="Referencia contable del período"
        />
        <Kpi
          titulo="Materia prima"
          valor={moneda(totales.mp)}
          detalle={`${porcentaje(totales.mpVentasPct)} de ventas · ${
            totales.mpKg == null ? "sin kg" : `${moneda(totales.mpKg)} / kg`
          }`}
        />
        <Kpi
          titulo="Sueldos y salarios"
          valor={moneda(totales.mod)}
          detalle={`${porcentaje(totales.modVentasPct)} de ventas · ${
            totales.modKg == null ? "sin kg" : `${moneda(totales.modKg)} / kg`
          }`}
        />
        <Kpi
          titulo="CIF gerencial"
          valor={moneda(totales.cif)}
          detalle={`${porcentaje(totales.cifVentasPct)} de ventas · ${
            totales.cifKg == null ? "sin kg" : `${moneda(totales.cifKg)} / kg`
          }`}
        />
        <Kpi
          titulo="Costo fabricación incurrido"
          valor={moneda(totales.fabricacion)}
          detalle={`${porcentaje(
            totales.fabricacionVentasPct,
          )} de ventas · ${numero(totales.kg, 1)} kg equivalentes`}
        />
      </div>

      <div style={graficoCard}>
        <div style={graficoCabecera}>
          <div>
            <strong style={graficoTitulo}>Evolución de costos</strong>
            <span style={graficoTexto}>
              Compara costos con ventas y producción. Cada punto de costo
              muestra además qué porcentaje representa de las ventas del período.
              Cambia a $/kg para observar eficiencia, no solo gasto total.
            </span>
          </div>

          <div style={botonesGrupo}>
            {([
              ["RUBRO", "Rubros"],
              ["CUENTA", "Cuentas"],
            ] as [ModoEvolucion, string][]).map(([codigo, texto]) => (
              <button
                key={codigo}
                type="button"
                onClick={() => setModoEvolucion(codigo)}
                style={{
                  ...botonPill,
                  ...(modoEvolucion === codigo ? botonPillActivo : {}),
                }}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        {modoEvolucion === "RUBRO" ? (
          <div style={checks}>
            {series.map((serie) => (
              <label key={serie.codigo} style={check}>
                <input
                  type="checkbox"
                  checked={seleccionadas.includes(serie.codigo)}
                  onChange={() => alternarSerie(serie.codigo)}
                />
                <span style={{ ...puntoColor, background: serie.color }} />
                <span>{serie.etiqueta}</span>
              </label>
            ))}
          </div>
        ) : (
          <>
            <div style={cuentasToolbar}>
              <span style={textoCuenta}>
                Top 5 seleccionadas por defecto. Puedes agregar o quitar
                cualquier cuenta sin perder Ventas ni Producción.
              </span>
              <button
                type="button"
                onClick={seleccionarTopCuentas}
                style={botonPill}
              >
                Restablecer Top 5
              </button>
            </div>

            <div style={checks}>
              {cuentasDisponibles.map((cuenta) => {
                const serie = seriesCuentas.find(
                  (item) => item.codigo === cuenta.codigo,
                )
                return (
                  <label key={cuenta.codigo} style={check}>
                    <input
                      type="checkbox"
                      checked={cuentasSeleccionadas.includes(
                        cuenta.codigo,
                      )}
                      onChange={() => alternarCuenta(cuenta.codigo)}
                    />
                    <span
                      style={{
                        ...puntoColor,
                        background: serie?.color ?? "#94a3b8",
                      }}
                    />
                    <span>
                      {cuenta.etiqueta} · {moneda(cuenta.valor)}
                    </span>
                  </label>
                )
              })}
            </div>
          </>
        )}

        {cargando ? (
          <div style={vacio}>Cargando estructura de costos...</div>
        ) : seriesActivas.length === 0 ? (
          <div style={vacio}>Selecciona al menos una métrica.</div>
        ) : (
          <div style={svgWrap}>
            {(() => {
              const ancho = 1100
              const alto = 340
              const izq = 78
              const der =
                seriesActivas.some((serie) => serie.unidad === "KG")
                  ? 70
                  : 28
              const arriba = 24
              const abajo = 52
              const anchoPlot = ancho - izq - der
              const altoPlot = alto - arriba - abajo
              const rangoUsd =
                escalaGrafico.maxUsd - escalaGrafico.minUsd || 1

              const x = (indice: number) =>
                datosGrafico.length <= 1
                  ? izq + anchoPlot / 2
                  : izq +
                    (indice / (datosGrafico.length - 1)) * anchoPlot

              const yUsd = (valor: number) =>
                arriba +
                ((escalaGrafico.maxUsd - valor) / rangoUsd) * altoPlot

              const yKg = (valor: number) =>
                arriba +
                (1 - valor / Math.max(escalaGrafico.maxKg, 1)) *
                  altoPlot

              const valorPunto = (
                punto: PuntoSerie,
                serie: SerieDef,
              ) => {
                const valor = Number(
                  punto.valores[serie.codigo] ?? 0,
                )

                if (
                  modoValor === "POR_KG" &&
                  serie.unidad === "USD" &&
                  serie.codigo !== "VENTAS_NETAS"
                ) {
                  return punto.kg > 0 ? valor / punto.kg : 0
                }

                return valor
              }

              const porcentajeVentas = (
                punto: PuntoSerie,
                serie: SerieDef,
              ) => {
                if (serie.unidad !== "USD") return null
                if (serie.codigo === "VENTAS_NETAS") return 100
                if (punto.ventasNetas === 0) return null

                const valorOriginal = Number(
                  punto.valores[serie.codigo] ?? 0,
                )

                return (valorOriginal / punto.ventasNetas) * 100
              }

              return (
                <svg viewBox={`0 0 ${ancho} ${alto}`} style={svg}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const proporcion = i / 4
                    const yy = arriba + proporcion * altoPlot
                    const valorUsd =
                      escalaGrafico.maxUsd -
                      proporcion * rangoUsd
                    const valorKg =
                      escalaGrafico.maxKg * (1 - proporcion)

                    return (
                      <g key={`grid-${i}`}>
                        <line
                          x1={izq}
                          y1={yy}
                          x2={izq + anchoPlot}
                          y2={yy}
                          stroke="#334155"
                        />

                        <text
                          x={izq - 10}
                          y={yy + 4}
                          textAnchor="end"
                          fill="#94a3b8"
                          fontSize="11"
                        >
                          {modoValor === "POR_KG"
                            ? `${moneda(valorUsd)}/kg`
                            : moneda(valorUsd)}
                        </text>

                        {seriesActivas.some(
                          (serie) => serie.unidad === "KG",
                        ) && (
                          <text
                            x={izq + anchoPlot + 10}
                            y={yy + 4}
                            textAnchor="start"
                            fill="#facc15"
                            fontSize="11"
                          >
                            {`${numero(valorKg, 0)} kg`}
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {datosGrafico.map((punto, i) => (
                    <text
                      key={`x-${punto.key}`}
                      x={x(i)}
                      y={arriba + altoPlot + 24}
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="11"
                    >
                      {punto.etiqueta}
                    </text>
                  ))}

                  {seriesActivas.map((serie) => {
                    const puntos = datosGrafico
                      .map((punto, i) => {
                        const valor = valorPunto(punto, serie)
                        const yy =
                          serie.unidad === "KG"
                            ? yKg(valor)
                            : yUsd(valor)

                        return `${x(i)},${yy}`
                      })
                      .join(" ")

                    return (
                      <g key={serie.codigo}>
                        <polyline
                          points={puntos}
                          fill="none"
                          stroke={serie.color}
                          strokeWidth={
                            serie.codigo === "VENTAS_NETAS" ? "3.5" : "3"
                          }
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          strokeDasharray={
                            serie.codigo === "VENTAS_NETAS"
                              ? "9 5"
                              : serie.unidad === "KG"
                                ? "5 4"
                                : undefined
                          }
                        />

                        {datosGrafico.map((punto, i) => {
                          const valor = valorPunto(punto, serie)
                          const anterior =
                            i > 0
                              ? valorPunto(
                                  datosGrafico[i - 1],
                                  serie,
                                )
                              : null
                          const variacion =
                            anterior !== null && anterior !== 0
                              ? ((valor - anterior) / Math.abs(anterior)) * 100
                              : null
                          const yy =
                            serie.unidad === "KG"
                              ? yKg(valor)
                              : yUsd(valor)
                          const pct = porcentajeVentas(punto, serie)

                          return (
                            <g key={`${serie.codigo}-${punto.key}`}>
                              <circle
                                cx={x(i)}
                                cy={yy}
                                r="4"
                                fill="#0f172a"
                                stroke={serie.color}
                                strokeWidth="3"
                              >
                                <title>
                                  {serie.unidad === "KG"
                                    ? `${punto.etiqueta} · ${serie.etiqueta}: ${numero(
                                        valor,
                                        1,
                                      )} kg${
                                        variacion == null
                                          ? ""
                                          : ` · variación ${porcentaje(
                                              variacion,
                                            )} vs período anterior`
                                      }`
                                    : `${punto.etiqueta} · ${serie.etiqueta}: ${
                                        modoValor === "POR_KG" &&
                                        serie.codigo !== "VENTAS_NETAS"
                                          ? `${moneda(valor)} / kg`
                                          : moneda(valor)
                                      }${
                                        pct == null
                                          ? ""
                                          : ` · ${porcentaje(
                                              pct,
                                            )} de ventas`
                                      }${
                                        variacion == null
                                          ? ""
                                          : ` · variación ${porcentaje(
                                              variacion,
                                            )} vs período anterior`
                                      }`}
                                </title>
                              </circle>

                              {pct != null &&
                                serie.codigo !== "VENTAS_NETAS" && (
                                  <text
                                    x={x(i)}
                                    y={yy - 8}
                                    textAnchor="middle"
                                    fill={serie.color}
                                    fontSize="9"
                                    fontWeight="700"
                                  >
                                    {porcentaje(pct)}
                                  </text>
                                )}
                            </g>
                          )
                        })}
                      </g>
                    )
                  })}
                </svg>
              )
            })()}
          </div>
        )}
      </div>

      <div style={graficoCard}>
        <div style={graficoCabecera}>
          <div>
            <strong style={graficoTitulo}>Pareto de costos</strong>
            <span style={graficoTexto}>
              Qué rubros o cuentas concentran el costo. La línea acumulada
              muestra dónde se alcanza el 80%.
            </span>
          </div>

          <div style={botonesGrupo}>
            {([
              ["RUBRO", "Rubros"],
              ["CUENTA", "Cuentas"],
            ] as [ModoPareto, string][]).map(([codigo, texto]) => (
              <button
                key={codigo}
                type="button"
                onClick={() => setModoPareto(codigo)}
                style={{
                  ...botonPill,
                  ...(modoPareto === codigo ? botonPillActivo : {}),
                }}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        <label style={{ ...check, marginTop: 10 }}>
          <input
            type="checkbox"
            checked={incluirAjustes}
            onChange={(e) => setIncluirAjustes(e.target.checked)}
          />
          Incluir desperdicio por devoluciones y ajustes de inventario
        </label>

        {pareto.filas.length === 0 ? (
          <div style={vacio}>No hay costos para el Pareto.</div>
        ) : (
          <div style={svgWrap}>
            {(() => {
              const ancho = 1100
              const alto = 400
              const izq = 64
              const der = 60
              const arriba = 24
              const abajo = 118
              const anchoPlot = ancho - izq - der
              const altoPlot = alto - arriba - abajo
              const n = pareto.filas.length
              const paso = anchoPlot / Math.max(n, 1)
              const barraAncho = Math.min(54, paso * 0.62)

              const yValor = (valor: number) =>
                arriba +
                (1 - valor / pareto.maximo) * altoPlot

              const yPct = (valor: number) =>
                arriba + (1 - valor / 100) * altoPlot

              const xCentro = (i: number) =>
                izq + paso * i + paso / 2

              const lineaAcumulada = pareto.filas
                .map(
                  (fila, i) =>
                    `${xCentro(i)},${yPct(fila.acumulado)}`,
                )
                .join(" ")

              return (
                <svg viewBox={`0 0 ${ancho} ${alto}`} style={svg}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const p = i / 4
                    const yy = arriba + p * altoPlot
                    const val = pareto.maximo * (1 - p)
                    return (
                      <g key={`pareto-grid-${i}`}>
                        <line
                          x1={izq}
                          y1={yy}
                          x2={izq + anchoPlot}
                          y2={yy}
                          stroke="#334155"
                        />
                        <text
                          x={izq - 8}
                          y={yy + 4}
                          textAnchor="end"
                          fill="#94a3b8"
                          fontSize="10"
                        >
                          {moneda(val)}
                        </text>
                        <text
                          x={izq + anchoPlot + 8}
                          y={yy + 4}
                          textAnchor="start"
                          fill="#94a3b8"
                          fontSize="10"
                        >
                          {`${Math.round((1 - p) * 100)}%`}
                        </text>
                      </g>
                    )
                  })}

                  <line
                    x1={izq}
                    y1={yPct(80)}
                    x2={izq + anchoPlot}
                    y2={yPct(80)}
                    stroke="#f59e0b"
                    strokeDasharray="7 6"
                    strokeWidth="2"
                  />
                  <text
                    x={izq + anchoPlot - 4}
                    y={yPct(80) - 7}
                    textAnchor="end"
                    fill="#fbbf24"
                    fontSize="11"
                    fontWeight="700"
                  >
                    80%
                  </text>

                  {pareto.filas.map((fila, i) => {
                    const x = xCentro(i) - barraAncho / 2
                    const yy = yValor(fila.valor)
                    const h = arriba + altoPlot - yy

                    return (
                      <g key={fila.id}>
                        <rect
                          x={x}
                          y={yy}
                          width={barraAncho}
                          height={Math.max(1, h)}
                          rx="5"
                          fill="#8b5cf6"
                        >
                          <title>
                            {`${fila.nombre}: ${moneda(
                              fila.valor,
                            )} · ${porcentaje(
                              fila.participacion,
                            )} · acumulado ${porcentaje(
                              fila.acumulado,
                            )}`}
                          </title>
                        </rect>

                        <text
                          x={xCentro(i)}
                          y={arriba + altoPlot + 18}
                          textAnchor="end"
                          transform={`rotate(-42 ${xCentro(i)} ${
                            arriba + altoPlot + 18
                          })`}
                          fill="#cbd5e1"
                          fontSize="10"
                        >
                          {fila.nombre.length > 24
                            ? `${fila.nombre.slice(0, 22)}…`
                            : fila.nombre}
                        </text>
                      </g>
                    )
                  })}

                  <polyline
                    points={lineaAcumulada}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {pareto.filas.map((fila, i) => (
                    <circle
                      key={`cum-${fila.id}`}
                      cx={xCentro(i)}
                      cy={yPct(fila.acumulado)}
                      r="4"
                      fill="#0f172a"
                      stroke="#22d3ee"
                      strokeWidth="3"
                    >
                      <title>
                        {`${fila.nombre} · acumulado ${porcentaje(
                          fila.acumulado,
                        )}`}
                      </title>
                    </circle>
                  ))}
                </svg>
              )
            })()}
          </div>
        )}

        <div style={paretoTabla}>
          {pareto.filas.map((fila, i) => (
            <div key={`row-${fila.id}`} style={paretoFila}>
              <span style={ranking}>{i + 1}</span>
              <span style={paretoNombre}>
                <strong>{fila.nombre}</strong>
                <small>{fila.detalle}</small>
              </span>
              <strong>{moneda(fila.valor)}</strong>
              <span>{porcentaje(fila.participacion)}</span>
              <span>Acum. {porcentaje(fila.acumulado)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={nota}>
        MP, sueldos y salarios, y CIF de enero-julio provienen del cierre productivo auditado.
        La nómina de producción se agrupa como “Sueldos y salarios” para reducir ruido.
        En Evolución puedes alternar entre rubros y cuentas contables; los tooltips
        muestran también la variación frente al período anterior.
        Depreciación de maquinaria se presenta como CIF gerencial. Las pérdidas
        por devoluciones y ajustes se mantienen separadas para no confundirlas
        con eficiencia de fabricación.
      </div>
    </section>
  )
}

function Kpi({
  titulo,
  valor,
  detalle,
}: {
  titulo: string
  valor: string
  detalle: string
}) {
  return (
    <div style={kpi}>
      <span style={kpiTitulo}>{titulo}</span>
      <strong style={kpiValor}>{valor}</strong>
      <span style={kpiDetalle}>{detalle}</span>
    </div>
  )
}

const panelOscuro = {
  padding: 16,
  borderRadius: 16,
  border: "1px solid #334155",
  background: "#020617",
  color: "#e2e8f0",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
} as const

const cabecera = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
} as const

const eyebrow = {
  color: "#fb923c",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: ".06em",
} as const

const titulo = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 22,
} as const

const subtitulo = {
  margin: "6px 0 0",
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
  maxWidth: 950,
} as const

const filtros = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "end",
  marginTop: 14,
} as const

const campo = {
  display: "grid",
  gap: 5,
  minWidth: 150,
} as const

const label = {
  color: "#94a3b8",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
} as const

const select = {
  minHeight: 36,
  border: "1px solid #475569",
  borderRadius: 9,
  background: "#0f172a",
  color: "#f8fafc",
  padding: "0 9px",
} as const

const botonAplicar = {
  minHeight: 36,
  border: 0,
  borderRadius: 9,
  background: "#b4232b",
  color: "#fff",
  padding: "0 14px",
  fontWeight: 800,
  cursor: "pointer",
} as const

const botonesGrupo = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  alignItems: "center",
} as const

const botonPill = {
  border: "1px solid #475569",
  borderRadius: 999,
  background: "#0f172a",
  color: "#cbd5e1",
  padding: "6px 10px",
  fontSize: 10,
  fontWeight: 800,
  cursor: "pointer",
} as const

const botonPillActivo = {
  borderColor: "#fb7185",
  background: "#9f1239",
  color: "#fff",
} as const

const botonPillActivoAzul = {
  borderColor: "#38bdf8",
  background: "#075985",
  color: "#fff",
} as const

const kpis = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
  marginTop: 14,
} as const

const kpi = {
  display: "grid",
  gap: 5,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #1e293b",
  background: "#0f172a",
} as const

const kpiTitulo = {
  color: "#94a3b8",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
} as const

const kpiValor = {
  color: "#f8fafc",
  fontSize: 18,
} as const

const kpiDetalle = {
  color: "#cbd5e1",
  fontSize: 10,
} as const

const graficoCard = {
  marginTop: 12,
  padding: 13,
  borderRadius: 13,
  border: "1px solid #1e293b",
  background: "#0f172a",
} as const

const graficoCabecera = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "start",
} as const

const graficoTitulo = {
  display: "block",
  color: "#f8fafc",
  fontSize: 14,
} as const

const graficoTexto = {
  display: "block",
  marginTop: 3,
  color: "#94a3b8",
  fontSize: 11,
} as const

const cuentasToolbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #1e293b",
} as const

const textoCuenta = {
  color: "#94a3b8",
  fontSize: 10,
} as const

const checks = {
  display: "flex",
  flexWrap: "wrap",
  gap: "7px 13px",
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #1e293b",
} as const

const check = {
  display: "inline-flex",
  gap: 6,
  alignItems: "center",
  color: "#e2e8f0",
  fontSize: 10,
  cursor: "pointer",
} as const

const puntoColor = {
  width: 8,
  height: 8,
  borderRadius: 999,
  display: "inline-block",
} as const

const svgWrap = {
  width: "100%",
  overflowX: "auto",
  marginTop: 6,
} as const

const svg = {
  display: "block",
  width: "100%",
  minWidth: 760,
  height: "auto",
} as const

const vacio = {
  marginTop: 10,
  padding: 16,
  border: "1px dashed #475569",
  borderRadius: 10,
  color: "#94a3b8",
  textAlign: "center",
  fontSize: 11,
} as const

const errorCaja = {
  marginTop: 10,
  padding: 10,
  border: "1px solid #7f1d1d",
  background: "#450a0a",
  color: "#fecaca",
  borderRadius: 9,
  fontSize: 11,
} as const

const paretoTabla = {
  display: "grid",
  gap: 4,
  marginTop: 8,
} as const

const paretoFila = {
  display: "grid",
  gridTemplateColumns: "26px minmax(160px, 1fr) 100px 60px 85px",
  gap: 8,
  alignItems: "center",
  minHeight: 30,
  padding: "4px 7px",
  borderRadius: 7,
  background: "#111827",
  fontSize: 10,
  color: "#cbd5e1",
} as const

const ranking = {
  color: "#64748b",
  textAlign: "center",
  fontWeight: 900,
} as const

const paretoNombre = {
  minWidth: 0,
  display: "grid",
  gap: 1,
  color: "#f8fafc",
} as const

const nota = {
  marginTop: 10,
  color: "#94a3b8",
  fontSize: 10,
  lineHeight: 1.4,
} as const
