import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { supabase } from "../lib/supabase"
import { leerBalanceComparativoPdf } from "../utils/balanceComparativoPdf"
import { calcularHashArchivo, leerLibroMayorPdf } from "../utils/libroMayorPdf"
import { leerEstadoResultadosPdf } from "../utils/estadoResultadosPdf"

type Props = {
  cambiarPantalla: (pantalla: string) => void
}

type CierreMensual = {
  periodo: string
  cuentas_estado_resultados: number
  estado_resultados_cargado: boolean
  libro_mayor_cargado: boolean
  libro_mayor_archivo: string | null
  libro_mayor_movimientos: number
  balance_cargado: boolean
  balance_archivo: string | null
  balance_ultimo_mes: number | null
  cuentas_requieren_detalle: number
  cuentas_conciliadas: number
  cuentas_no_conciliadas: number
  pendiente_clasificar: number
  cuentas_sin_matriz: number
  valor_sin_matriz: number
  listo_para_cerrar: boolean
  mes_cerrado: boolean
  cerrado_en: string | null
  cierre_completo: boolean
}

type BalanceImportado = {
  id: string
  anio: number
  archivo_nombre: string
  ultimo_mes: number
  registros_importados: number
  actualizado_en: string
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

export default function ImportacionContable({ cambiarPantalla }: Props) {
  const [cierres, setCierres] = useState<CierreMensual[]>([])
  const [balances, setBalances] = useState<BalanceImportado[]>([])
  const [periodo, setPeriodo] = useState("")
  const [cargando, setCargando] = useState(true)
  const [subiendoResultados, setSubiendoResultados] = useState(false)
  const [subiendoLibro, setSubiendoLibro] = useState(false)
  const [subiendoBalance, setSubiendoBalance] = useState(false)
  const [procesandoCierre, setProcesandoCierre] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const inputResultadosRef = useRef<HTMLInputElement | null>(null)
  const inputLibroRef = useRef<HTMLInputElement | null>(null)
  const inputBalanceRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void cargar()
  }, [])

  async function cargar(periodoPreferido?: string) {
    setCargando(true)
    setError("")
    try {
      const [cierresRes, balancesRes] = await Promise.all([
        supabase
          .from("fin_vw_cierre_contable_mensual")
          .select("*")
          .order("periodo", { ascending: true }),
        supabase
          .from("fin_balance_importaciones")
          .select("id,anio,archivo_nombre,ultimo_mes,registros_importados,actualizado_en")
          .order("anio", { ascending: false }),
      ])

      if (cierresRes.error) throw cierresRes.error
      if (balancesRes.error) throw balancesRes.error

      const cierresDb = (cierresRes.data ?? []) as CierreMensual[]
      const balancesDb = (balancesRes.data ?? []) as BalanceImportado[]
      setCierres(cierresDb)
      setBalances(balancesDb)

      // Al entrar sin un periodo preferido, continuar con el PRIMER mes abierto.
      // Esto evita saltar al mes siguiente (p. ej. julio) cuando junio ya está
      // conciliado pero todavía falta marcar su cierre.
      const disponible = periodoPreferido && cierresDb.some((fila) => fila.periodo === periodoPreferido)
        ? periodoPreferido
        : cierresDb.find((fila) => !fila.mes_cerrado)?.periodo
          ?? cierresDb.at(-1)?.periodo
          ?? ""
      setPeriodo(disponible)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar el cierre contable.")
    } finally {
      setCargando(false)
    }
  }

  const cierre = useMemo(
    () => cierres.find((fila) => fila.periodo === periodo) ?? null,
    [cierres, periodo],
  )

  const anios = useMemo(() => {
    return Array.from(
      new Set<number>(cierres.map((fila) => Number(fila.periodo.slice(0, 4)))),
    ).sort((a, b) => b - a)
  }, [cierres])

  const balanceAnio = useMemo(() => {
    if (!periodo) return null
    const anio = Number(periodo.slice(0, 4))
    return balances.find((fila) => fila.anio === anio) ?? null
  }, [balances, periodo])

  async function subirEstadoResultados(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ""
    if (!archivo || !periodo || !cierre) return

    setSubiendoResultados(true)
    setError("")
    setMensaje("")

    try {
      if (cierre.mes_cerrado) {
        throw new Error(`${nombrePeriodo(periodo)} está cerrado. Reábrelo antes de actualizar su Estado de Resultados.`)
      }

      if (cierre.libro_mayor_cargado && cierre.estado_resultados_cargado) {
        throw new Error(
          "El Libro Mayor de este periodo ya fue importado. Para proteger la conciliación, no se actualiza el Estado de Resultados después de cargar el Libro Mayor.",
        )
      }

      const [resultado, hash] = await Promise.all([
        leerEstadoResultadosPdf(archivo),
        calcularHashArchivo(archivo),
      ])

      const periodoPdf = `${resultado.fecha_hasta.slice(0, 7)}-01`
      if (periodoPdf !== periodo) {
        throw new Error(
          `El Estado de Resultados tiene corte ${fechaCorta(resultado.fecha_hasta)}, pero el periodo seleccionado es ${nombrePeriodo(periodo)}.`,
        )
      }

      if (cierre.estado_resultados_cargado) {
        const confirmar = window.confirm(
          `${nombrePeriodo(periodo)} ya tiene Estado de Resultados. Se reemplazarán únicamente los valores de este mes; los meses cerrados anteriores permanecerán intactos. ¿Continuar?`,
        )
        if (!confirmar) return
      }

      const { data, error: rpcError } = await supabase.rpc(
        "fin_importar_estado_resultados_acumulado",
        {
          p_meta: {
            periodo,
            archivo_nombre: archivo.name,
            archivo_hash: hash,
            fecha_desde: resultado.fecha_desde,
            fecha_hasta: resultado.fecha_hasta,
          },
          p_cuentas: resultado.cuentas,
        },
      )

      if (rpcError) throw rpcError

      const datos = (data ?? {}) as {
        cuentas_importadas?: number
        modo?: "MENSUAL" | "ACUMULADO"
      }
      const detalleModo =
        datos.modo === "MENSUAL"
          ? "Se importaron directamente los valores del reporte mensual."
          : "El valor mensual se calculó desde el acumulado sin modificar meses cerrados."

      setMensaje(
        `Estado de Resultados de ${nombrePeriodo(periodo)} cargado: ${Number(datos.cuentas_importadas ?? resultado.cuentas.length)} cuentas. ${detalleModo}`,
      )
      await cargar(periodo)
      window.dispatchEvent(new Event("cibuspan-costos-refresh"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el Estado de Resultados.")
    } finally {
      setSubiendoResultados(false)
    }
  }

  async function subirLibroMayor(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ""
    if (!archivo || !periodo || !cierre) return

    setSubiendoLibro(true)
    setError("")
    setMensaje("")

    try {
      if (cierre.mes_cerrado) {
        throw new Error(`${nombrePeriodo(periodo)} está cerrado. Reábrelo antes de cargar un Libro Mayor.`)
      }

      if (!cierre.estado_resultados_cargado) {
        throw new Error("Primero carga el Estado de Resultados del periodo.")
      }

      if (cierre.libro_mayor_cargado) {
        throw new Error(`Ya existe un Libro Mayor importado para ${nombrePeriodo(periodo)}.`)
      }

      const { data: cuentasData, error: cuentasError } = await supabase
        .from("fin_vw_conciliacion_cuentas_mixtas")
        .select("cuenta_codigo,cuenta_nombre,valor_contable")
        .eq("periodo", periodo)
        .order("cuenta_codigo", { ascending: true })

      if (cuentasError) throw cuentasError

      const cuentasPeriodo = (cuentasData ?? []).map((fila) => ({
        cuenta_codigo: String(fila.cuenta_codigo ?? ""),
        cuenta_nombre: String(fila.cuenta_nombre ?? fila.cuenta_codigo ?? ""),
        valor_contable: Number(fila.valor_contable ?? 0),
      }))

      if (cuentasPeriodo.length === 0) {
        throw new Error(
          "No existen cuentas configuradas para conciliación en este periodo. Revisa primero la matriz de clasificación.",
        )
      }

      const [resultado, hash] = await Promise.all([
        leerLibroMayorPdf(
          archivo,
          cuentasPeriodo.map((fila) => fila.cuenta_codigo),
        ),
        calcularHashArchivo(archivo),
      ])

      if (resultado.periodo !== periodo) {
        throw new Error(
          `El Libro Mayor corresponde a ${nombrePeriodo(resultado.periodo)}, pero está seleccionado ${nombrePeriodo(periodo)}.`,
        )
      }

      const porCuenta = new Map<string, number>()
      for (const movimiento of resultado.movimientos) {
        porCuenta.set(
          movimiento.cuenta_codigo,
          redondear((porCuenta.get(movimiento.cuenta_codigo) ?? 0) + movimiento.valor),
        )
      }

      const diferencias = cuentasPeriodo
        .map((fila) => {
          const libro = redondear(porCuenta.get(fila.cuenta_codigo) ?? 0)
          const diferencia = redondear(fila.valor_contable - libro)
          return { ...fila, libro, diferencia }
        })
        .filter((fila) => Math.abs(fila.diferencia) > 0.02)

      if (diferencias.length > 0) {
        const detalle = diferencias
          .slice(0, 5)
          .map(
            (fila) =>
              `${fila.cuenta_codigo} ${fila.cuenta_nombre}: ER ${dinero(fila.valor_contable)} / Libro Mayor ${dinero(fila.libro)}`,
          )
          .join(" · ")
        throw new Error(
          `El Libro Mayor fue leído, pero ${diferencias.length} cuenta(s) no cuadran contra el Estado de Resultados. ${detalle}`,
        )
      }

      const { error: rpcError } = await supabase.rpc("fin_importar_libro_mayor", {
        p_meta: {
          periodo: resultado.periodo,
          archivo_nombre: archivo.name,
          archivo_hash: hash,
          fecha_desde: resultado.fecha_desde,
          fecha_hasta: resultado.fecha_hasta,
          registros_leidos: resultado.registros_leidos,
        },
        p_movimientos: resultado.movimientos,
      })

      if (rpcError) throw rpcError

      setMensaje(
        `Libro Mayor de ${nombrePeriodo(periodo)} importado y conciliado. Ya puedes abrir Clasificación para distribuir las partidas que requieren decisión.`,
      )
      await cargar(periodo)
      window.dispatchEvent(new Event("cibuspan-costos-refresh"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el Libro Mayor.")
    } finally {
      setSubiendoLibro(false)
    }
  }

  async function cambiarCierre(marcado: boolean) {
    if (!cierre || !periodo) return

    setError("")
    setMensaje("")

    if (marcado && !cierre.listo_para_cerrar) {
      setError("El mes todavía no cumple todos los requisitos para cerrarse.")
      return
    }

    const texto = marcado
      ? `Cerrar ${nombrePeriodo(periodo)}. Desde ese momento Estado de Resultados, Libro Mayor, clasificación y Balance del mes quedarán inamovibles.`
      : `Reabrir ${nombrePeriodo(periodo)}. El mes volverá a permitir cambios y deberá revisarse antes de cerrarlo otra vez.`

    if (!window.confirm(texto)) return

    setProcesandoCierre(true)
    try {
      const { error: rpcError } = marcado
        ? await supabase.rpc("fin_cerrar_periodo", { p_periodo: periodo })
        : await supabase.rpc("fin_reabrir_periodo", {
            p_periodo: periodo,
            p_motivo: "Reapertura manual desde Importación contable",
          })

      if (rpcError) throw rpcError

      setMensaje(
        marcado
          ? `${nombrePeriodo(periodo)} quedó CERRADO e inamovible.`
          : `${nombrePeriodo(periodo)} fue reabierto.`,
      )
      await cargar(periodo)
      window.dispatchEvent(new Event("cibuspan-costos-refresh"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado del cierre.")
    } finally {
      setProcesandoCierre(false)
    }
  }

  async function subirBalance(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ""
    if (!archivo) return

    setSubiendoBalance(true)
    setError("")
    setMensaje("")

    try {
      const resultado = await leerBalanceComparativoPdf(archivo)
      const periodoDestino = `${resultado.anio}-${String(Math.min(resultado.ultimo_mes, 12)).padStart(2, "0")}-01`

      const { error: rpcError } = await supabase.rpc("fin_importar_balance_comparativo", {
        p_meta: {
          anio: resultado.anio,
          archivo_nombre: archivo.name,
          archivo_hash: resultado.archivo_hash,
          ultimo_mes: resultado.ultimo_mes,
        },
        p_cuentas: resultado.cuentas,
      })

      if (rpcError) throw rpcError

      setMensaje(
        `Balance ${resultado.anio} actualizado: ${resultado.cuentas.length.toLocaleString("es-EC")} cuentas, información hasta ${MESES[resultado.ultimo_mes - 1]}.`,
      )
      await cargar(periodo || periodoDestino)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar el Balance Comparativo.")
    } finally {
      setSubiendoBalance(false)
    }
  }

  const periodoTexto = cierre ? nombrePeriodo(cierre.periodo) : "Sin periodo"
  const mesCerrado = Boolean(cierre?.mes_cerrado)
  const listoParaCerrar = Boolean(cierre?.listo_para_cerrar)

  return (
    <main style={pagina}>
      <header style={encabezadoPagina}>
        <div>
          <span style={kicker}>PAGOS Y FINANZAS · CIERRE MENSUAL</span>
          <h1 style={titulo}>Importación contable</h1>
          <p style={subtitulo}>
            Un solo punto de control para Estado de Resultados, Libro Mayor y Balance Comparativo.
          </p>
        </div>
        <button type="button" style={botonSecundario} onClick={() => void cargar(periodo)} disabled={cargando}>
          {cargando ? "Actualizando…" : "Actualizar estado"}
        </button>
      </header>

      <section style={barraPeriodo}>
        <label style={campoLabel}>
          Periodo de control
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={campo} disabled={cargando}>
            {cierres.map((fila) => (
              <option key={fila.periodo} value={fila.periodo}>{nombrePeriodo(fila.periodo)}</option>
            ))}
          </select>
        </label>
        <div style={estadoCierre(mesCerrado)}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>CIERRE CONTABLE</span>
          <strong style={{ fontSize: 18 }}>
            {mesCerrado ? "CERRADO" : listoParaCerrar ? "LISTO PARA CERRAR" : "EN PROCESO"}
          </strong>
          <small>{periodoTexto}</small>
        </div>
      </section>

      {error && <div style={alertaError}>{error}</div>}
      {mensaje && <div style={alertaOk}>{mensaje}</div>}

      <section style={grillaDocumentos}>
        <TarjetaDocumento
          numero="1"
          titulo="Estado de Resultados"
          descripcion="Resultado oficial del mes y total de control para ingresos, costo de venta y gastos."
          listo={Boolean(cierre?.estado_resultados_cargado)}
          detalle={cierre?.estado_resultados_cargado
            ? `${cierre.cuentas_estado_resultados} cuentas cargadas para ${periodoTexto}.`
            : `Falta cargar el Estado de Resultados de ${periodoTexto}.`}
          accion={cierre?.estado_resultados_cargado ? "Actualizar Estado de Resultados" : "Subir Estado de Resultados"}
          onClick={() => inputResultadosRef.current?.click()}
          ocupado={subiendoResultados}
          deshabilitado={mesCerrado || Boolean(cierre?.libro_mayor_cargado)}
        />

        <TarjetaDocumento
          numero="2"
          titulo="Libro Mayor"
          descripcion="Detalle de movimientos utilizado para conciliación y clasificación de las cuentas que requieren revisión."
          listo={Boolean(cierre?.libro_mayor_cargado)}
          detalle={cierre?.libro_mayor_cargado
            ? `${cierre.libro_mayor_movimientos} movimientos importados · ${cierre.libro_mayor_archivo ?? "Libro Mayor"}.`
            : `Falta cargar y conciliar el Libro Mayor de ${periodoTexto}.`}
          accion={cierre?.libro_mayor_cargado ? "Libro Mayor cargado" : "Subir Libro Mayor"}
          onClick={() => inputLibroRef.current?.click()}
          ocupado={subiendoLibro}
          deshabilitado={mesCerrado || Boolean(cierre?.libro_mayor_cargado) || !Boolean(cierre?.estado_resultados_cargado)}
          accionSecundaria={cierre?.libro_mayor_cargado ? "Abrir Clasificación" : undefined}
          onClickSecundario={cierre?.libro_mayor_cargado
            ? () => cambiarPantalla("Pagos y Finanzas · Clasificación de gastos")
            : undefined}
        />

        <TarjetaDocumento
          numero="3"
          titulo="Balance Comparativo"
          descripcion="Situación financiera y evolución de activos, pasivos, inventarios, cuentas por cobrar y demás cuentas del año."
          listo={Boolean(cierre?.balance_cargado)}
          detalle={balanceAnio
            ? `${balanceAnio.archivo_nombre} · actualizado hasta ${MESES[balanceAnio.ultimo_mes - 1]} ${balanceAnio.anio}.`
            : periodo
              ? `No hay Balance Comparativo ${periodo.slice(0, 4)} registrado.`
              : "No hay Balance Comparativo registrado."}
          accion={balanceAnio ? "Actualizar Balance" : "Subir Balance"}
          onClick={() => inputBalanceRef.current?.click()}
          ocupado={subiendoBalance}
        />
      </section>

      <input
        ref={inputResultadosRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(evento) => void subirEstadoResultados(evento)}
        style={{ display: "none" }}
      />

      <input
        ref={inputLibroRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(evento) => void subirLibroMayor(evento)}
        style={{ display: "none" }}
      />

      <input
        ref={inputBalanceRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(evento) => void subirBalance(evento)}
        style={{ display: "none" }}
      />

      <section style={panelCierreMes}>
        <label style={{ ...checkCierre, opacity: (!mesCerrado && !listoParaCerrar) ? 0.58 : 1 }}>
          <input
            type="checkbox"
            checked={mesCerrado}
            disabled={procesandoCierre || (!mesCerrado && !listoParaCerrar)}
            onChange={(e) => void cambiarCierre(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: VINO, cursor: "pointer" }}
          />
          <div>
            <strong style={{ display: "block", color: mesCerrado ? "#27633b" : VINO }}>
              {mesCerrado ? "Mes cerrado e inamovible" : "Cerrar mes e inmovilizar datos"}
            </strong>
            <small style={{ color: "#756862", lineHeight: 1.45 }}>
              {mesCerrado
                ? "Las futuras cargas del Balance conservarán este mes. Para hacer un ajuste real, primero desmarca el check y confirma la reapertura."
                : listoParaCerrar
                  ? "Todo está conciliado. Al marcar el check se congela Estado de Resultados, Libro Mayor, clasificación y Balance de este mes."
                  : "El check se habilita cuando estén cargados los tres documentos y la clasificación esté conciliada al 100%."}
            </small>
          </div>
        </label>
      </section>

      <section style={panelControl}>
        <div style={panelControlHeader}>
          <div>
            <span style={kicker}>CONTROL DEL PERIODO</span>
            <h2 style={{ ...titulo, fontSize: 22, marginTop: 4 }}>{periodoTexto}</h2>
          </div>
          <button type="button" style={botonPrimario} onClick={() => cambiarPantalla("Dashboard")}>
            Ver dashboard de Inicio
          </button>
        </div>

        <div style={grillaControl}>
          <IndicadorControl etiqueta="Estado de Resultados" listo={Boolean(cierre?.estado_resultados_cargado)} />
          <IndicadorControl etiqueta="Libro Mayor" listo={Boolean(cierre?.libro_mayor_cargado)} />
          <IndicadorControl etiqueta="Balance" listo={Boolean(cierre?.balance_cargado)} />
          <IndicadorControl
            etiqueta="Clasificación"
            listo={Boolean(cierre && cierre.cuentas_no_conciliadas === 0 && Number(cierre.pendiente_clasificar) <= 0.02)}
            detalle={cierre
              ? `${cierre.cuentas_conciliadas}/${cierre.cuentas_requieren_detalle} cuentas conciliadas`
              : undefined}
          />
        </div>

        {cierre && Number(cierre.pendiente_clasificar) > 0.02 && (
          <p style={notaPendiente}>
            Quedan {dinero(Number(cierre.pendiente_clasificar))} pendientes de clasificación.
          </p>
        )}
        {cierre && Number(cierre.cuentas_sin_matriz ?? 0) > 0 && (
          <p style={notaPendiente}>
            Hay {cierre.cuentas_sin_matriz} cuenta(s) sin regla en la matriz; deben resolverse antes del cierre.
          </p>
        )}
      </section>

      {anios.length === 0 && !cargando && (
        <div style={estadoVacio}>Todavía no existen periodos contables cargados.</div>
      )}
    </main>
  )
}

function TarjetaDocumento({
  numero,
  titulo,
  descripcion,
  listo,
  detalle,
  accion,
  onClick,
  ocupado = false,
  deshabilitado = false,
  accionSecundaria,
  onClickSecundario,
}: {
  numero: string
  titulo: string
  descripcion: string
  listo: boolean
  detalle: string
  accion: string
  onClick: () => void
  ocupado?: boolean
  deshabilitado?: boolean
  accionSecundaria?: string
  onClickSecundario?: () => void
}) {
  return (
    <article style={tarjeta}>
      <div style={tarjetaCabecera}>
        <span style={numeroPaso}>{numero}</span>
        <span style={badge(listo)}>{listo ? "LISTO" : "PENDIENTE"}</span>
      </div>
      <h2 style={tituloTarjeta}>{titulo}</h2>
      <p style={descripcionTarjeta}>{descripcion}</p>
      <div style={detalleTarjeta}>{detalle}</div>
      <button
        type="button"
        style={{ ...botonPrimario, opacity: ocupado || deshabilitado ? 0.55 : 1 }}
        onClick={onClick}
        disabled={ocupado || deshabilitado}
      >
        {ocupado ? "Procesando PDF…" : accion}
      </button>
      {accionSecundaria && onClickSecundario && (
        <button
          type="button"
          style={{ ...botonSecundario, marginTop: 8 }}
          onClick={onClickSecundario}
        >
          {accionSecundaria}
        </button>
      )}
    </article>
  )
}

function IndicadorControl({ etiqueta, listo, detalle }: { etiqueta: string; listo: boolean; detalle?: string }) {
  return (
    <div style={controlItem}>
      <span style={circuloEstado(listo)}>{listo ? "✓" : "!"}</span>
      <div>
        <strong style={{ display: "block", color: "#352e2b" }}>{etiqueta}</strong>
        <small style={{ color: "#776d68" }}>{detalle ?? (listo ? "Disponible" : "Pendiente")}</small>
      </div>
    </div>
  )
}

function nombrePeriodo(periodo: string) {
  const [anio, mes] = periodo.split("-")
  return `${MESES[Number(mes) - 1] ?? mes} ${anio}`
}

function fechaCorta(fecha: string) {
  const [anio, mes, dia] = fecha.split("-")
  return `${dia}/${mes}/${anio}`
}

function redondear(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function dinero(valor: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(valor || 0)
}

const VINO = "#8F1D24"
const NARANJA = "#F7931E"
const pagina = { maxWidth: 1380, margin: "0 auto", padding: "26px 28px 44px" }
const encabezadoPagina = { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 20 }
const kicker = { color: NARANJA, fontSize: 11, fontWeight: 900, letterSpacing: ".06em" }
const titulo = { margin: "5px 0 5px", color: VINO, fontSize: 30, lineHeight: 1.1 }
const subtitulo = { margin: 0, color: "#6f625d", lineHeight: 1.5 }
const barraPeriodo = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", padding: 16, border: "1px solid #e5d9d3", borderRadius: 14, background: "#fff", marginBottom: 18 }
const campoLabel = { display: "grid", gap: 6, color: "#756862", fontSize: 11, fontWeight: 900, textTransform: "uppercase" as const }
const campo = { minWidth: 230, minHeight: 42, padding: "8px 11px", border: "1px solid #d8cec8", borderRadius: 8, background: "#fff", color: "#3f3632" }
const grillaDocumentos = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }
const tarjeta = { display: "flex", flexDirection: "column" as const, minHeight: 280, padding: 20, border: "1px solid #e4dad5", borderRadius: 16, background: "#fff", boxShadow: "0 8px 26px rgba(78,48,38,.06)" }
const tarjetaCabecera = { display: "flex", justifyContent: "space-between", alignItems: "center" }
const numeroPaso = { display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 10, background: "#f8ece8", color: VINO, fontWeight: 900 }
const tituloTarjeta = { margin: "18px 0 7px", color: "#392f2b", fontSize: 21 }
const descripcionTarjeta = { margin: 0, color: "#736761", lineHeight: 1.5, minHeight: 68 }
const detalleTarjeta = { margin: "14px 0 18px", padding: "11px 12px", borderRadius: 9, background: "#faf7f5", color: "#5f5550", fontSize: 13, lineHeight: 1.45, flex: 1 }
const botonPrimario = { minHeight: 40, padding: "0 15px", border: 0, borderRadius: 8, background: VINO, color: "#fff", fontWeight: 900, cursor: "pointer" }
const botonSecundario = { minHeight: 40, padding: "0 15px", border: "1px solid #d8cac3", borderRadius: 8, background: "#fff", color: VINO, fontWeight: 900, cursor: "pointer" }
const panelCierreMes = { marginTop: 18, padding: 18, border: "1px solid #e4dad5", borderRadius: 16, background: "#fff" }
const checkCierre = { display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }
const panelControl = { marginTop: 18, padding: 20, border: "1px solid #e4dad5", borderRadius: 16, background: "#fff" }
const panelControlHeader = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 16 }
const grillaControl = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }
const controlItem = { display: "flex", alignItems: "center", gap: 10, padding: 12, border: "1px solid #eee6e2", borderRadius: 10, background: "#fcfaf9" }
const alertaError = { marginBottom: 16, padding: "11px 14px", borderRadius: 9, background: "#fff0f0", color: "#a21e28", border: "1px solid #f1c9cc" }
const alertaOk = { marginBottom: 16, padding: "11px 14px", borderRadius: 9, background: "#f1f8f2", color: "#27633b", border: "1px solid #cfe4d4" }
const notaPendiente = { margin: "14px 0 0", color: "#a15a13", fontWeight: 700 }
const estadoVacio = { marginTop: 18, padding: 30, textAlign: "center" as const, color: "#776d68", border: "1px dashed #d8cec8", borderRadius: 12 }

function badge(listo: boolean) {
  return {
    padding: "5px 9px",
    borderRadius: 999,
    background: listo ? "#e9f6ed" : "#fff4e8",
    color: listo ? "#277340" : "#a75d13",
    fontSize: 10,
    fontWeight: 900,
  }
}

function estadoCierre(listo: boolean) {
  return {
    display: "grid",
    gap: 2,
    minWidth: 190,
    padding: "10px 14px",
    borderRadius: 10,
    background: listo ? "#e9f6ed" : "#fff4e8",
    color: listo ? "#276b3d" : "#9b5816",
  }
}

function circuloEstado(listo: boolean) {
  return {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    flex: "0 0 30px",
    borderRadius: "50%",
    background: listo ? "#dff2e5" : "#fff0dd",
    color: listo ? "#277340" : "#a75d13",
    fontWeight: 900,
  }
}
