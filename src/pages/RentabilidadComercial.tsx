import {
  useEffect,
  useMemo,
  useState,
} from "react"

import { supabase } from "../lib/supabase"

type ResumenMensual = {
  periodo: string
  transporte_contable: number
  transporte_asignado: number
  transporte_no_atribuido: number
  ventas_netas_contables: number
  transporte_pct_ventas: number | null
  facturas_transporte: number
  facturas_periodo_por_confirmar: number
}

type TransporteCliente = {
  periodo: string
  cliente_id: string
  cliente_nombre: string
  gasto_transporte: number
  unidades_facturadas: number
  venta_facturada_sin_impuestos: number
  transporte_por_unidad: number | null
  transporte_pct_facturacion: number | null
  facturas_transporte: number
  periodo_confirmado: boolean
  metodo: string
}

type TransporteFactura = {
  factura_id: string
  fecha_emision: string
  periodo_emision: string
  periodo_servicio: string | null
  periodo_analisis: string
  periodo_confirmado: boolean
  numero_factura: string | null
  proveedor: string
  descripcion: string | null
  gasto_sin_iva: number
  cuenta_codigo: string
  cuenta_nombre: string
  cliente_directo_nombre: string | null
  regla_atribucion:
    | "CLIENTE_DIRECTO"
    | "MULTICLIENTE"
    | "SIN_ATRIBUIR"
}

type Vista = "NEGOCIO" | "CLIENTES" | "PERIODOS"

function mesCorto(periodo: string) {
  if (!periodo) return "—"
  const [anio, mes] = periodo.slice(0, 7).split("-").map(Number)
  return new Intl.DateTimeFormat("es-EC", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
}

function moneda(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numero(
  valor: number | null | undefined,
  decimales = 0,
) {
  return Number(valor ?? 0).toLocaleString("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

function porcentaje(valor: number | null | undefined) {
  if (valor == null || !Number.isFinite(Number(valor))) return "—"
  return `${Number(valor).toLocaleString("es-EC", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function isoMes(fecha: string) {
  return `${fecha.slice(0, 7)}-01`
}

function reglaTexto(regla: TransporteFactura["regla_atribucion"]) {
  if (regla === "CLIENTE_DIRECTO") return "Cliente directo"
  if (regla === "MULTICLIENTE") return "Varios clientes"
  return "No atribuido"
}

export default function RentabilidadComercial() {
  const [vista, setVista] = useState<Vista>("NEGOCIO")
  const [resumen, setResumen] = useState<ResumenMensual[]>([])
  const [clientes, setClientes] = useState<TransporteCliente[]>([])
  const [facturas, setFacturas] = useState<TransporteFactura[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")

  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [clienteFiltro, setClienteFiltro] = useState("TODOS")
  const [periodosEdicion, setPeriodosEdicion] =
    useState<Record<string, string>>({})

  async function cargar() {
    setCargando(true)
    setError("")

    try {
      const [resumenRes, clientesRes, facturasRes] = await Promise.all([
        supabase
          .from("fin_vw_transporte_resumen_mensual")
          .select("*")
          .order("periodo", { ascending: true }),
        supabase
          .from("fin_vw_transporte_cliente_mensual")
          .select("*")
          .order("periodo", { ascending: true })
          .order("cliente_nombre", { ascending: true }),
        supabase
          .from("fin_vw_transporte_facturas")
          .select("*")
          .order("fecha_emision", { ascending: true })
          .order("proveedor", { ascending: true }),
      ])

      if (resumenRes.error) throw resumenRes.error
      if (clientesRes.error) throw clientesRes.error
      if (facturasRes.error) throw facturasRes.error

      const r = (resumenRes.data ?? []) as ResumenMensual[]
      const c = (clientesRes.data ?? []) as TransporteCliente[]
      const f = (facturasRes.data ?? []) as TransporteFactura[]

      setResumen(r)
      setClientes(c)
      setFacturas(f)

      const meses = r.map((fila) => isoMes(fila.periodo)).sort()
      if (meses.length > 0) {
        setDesde((actual) => actual || meses[0])
        setHasta((actual) => actual || (meses.at(-1) ?? meses[0]))
      }

      setPeriodosEdicion(
        Object.fromEntries(
          f.map((fila) => [
            fila.factura_id,
            fila.periodo_servicio
              ? isoMes(fila.periodo_servicio)
              : isoMes(fila.periodo_emision),
          ]),
        ),
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el análisis de transporte.",
      )
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  const mesesDisponibles = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...resumen.map((fila) => isoMes(fila.periodo)),
            ...facturas.map((fila) => isoMes(fila.periodo_analisis)),
          ].filter(Boolean),
        ),
      ).sort(),
    [resumen, facturas],
  )

  const resumenFiltrado = useMemo(
    () =>
      resumen.filter((fila) => {
        const periodo = isoMes(fila.periodo)
        if (desde && periodo < desde) return false
        if (hasta && periodo > hasta) return false
        return true
      }),
    [resumen, desde, hasta],
  )

  const clientesFiltrados = useMemo(
    () =>
      clientes.filter((fila) => {
        const periodo = isoMes(fila.periodo)
        if (desde && periodo < desde) return false
        if (hasta && periodo > hasta) return false
        if (
          clienteFiltro !== "TODOS" &&
          fila.cliente_id !== clienteFiltro
        ) {
          return false
        }
        return true
      }),
    [clientes, desde, hasta, clienteFiltro],
  )

  const facturasFiltradas = useMemo(
    () =>
      facturas.filter((fila) => {
        const periodo = isoMes(fila.periodo_analisis)
        if (desde && periodo < desde) return false
        if (hasta && periodo > hasta) return false
        return true
      }),
    [facturas, desde, hasta],
  )

  const opcionesCliente = useMemo(() => {
    const mapa = new Map<string, string>()
    clientes.forEach((fila) => {
      mapa.set(fila.cliente_id, fila.cliente_nombre)
    })
    return Array.from(mapa.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "es"),
    )
  }, [clientes])

  const totales = useMemo(() => {
    const transporteContable = resumenFiltrado.reduce(
      (suma, fila) => suma + Number(fila.transporte_contable ?? 0),
      0,
    )
    const transporteAsignado = resumenFiltrado.reduce(
      (suma, fila) => suma + Number(fila.transporte_asignado ?? 0),
      0,
    )
    const transporteNoAtribuido = resumenFiltrado.reduce(
      (suma, fila) =>
        suma + Number(fila.transporte_no_atribuido ?? 0),
      0,
    )
    const ventas = resumenFiltrado.reduce(
      (suma, fila) =>
        suma + Number(fila.ventas_netas_contables ?? 0),
      0,
    )
    const pendientes = facturasFiltradas.filter(
      (fila) => !fila.periodo_confirmado,
    ).length

    return {
      transporteContable,
      transporteAsignado,
      transporteNoAtribuido,
      ventas,
      transportePctVentas:
        ventas !== 0 ? (transporteContable / ventas) * 100 : null,
      cobertura:
        transporteContable !== 0
          ? (transporteAsignado / transporteContable) * 100
          : null,
      pendientes,
    }
  }, [resumenFiltrado, facturasFiltradas])

  const clientesAgregados = useMemo(() => {
    type Fila = {
      cliente_id: string
      cliente_nombre: string
      transporte: number
      unidades: number
      ventas: number
      facturas: number
      confirmados: boolean
    }

    const mapa = new Map<string, Fila>()

    clientesFiltrados.forEach((fila) => {
      const actual =
        mapa.get(fila.cliente_id) ?? {
          cliente_id: fila.cliente_id,
          cliente_nombre: fila.cliente_nombre,
          transporte: 0,
          unidades: 0,
          ventas: 0,
          facturas: 0,
          confirmados: true,
        }

      actual.transporte += Number(fila.gasto_transporte ?? 0)
      actual.unidades += Number(fila.unidades_facturadas ?? 0)
      actual.ventas += Number(fila.venta_facturada_sin_impuestos ?? 0)
      actual.facturas += Number(fila.facturas_transporte ?? 0)
      actual.confirmados =
        actual.confirmados && Boolean(fila.periodo_confirmado)

      mapa.set(fila.cliente_id, actual)
    })

    return Array.from(mapa.values())
      .map((fila) => ({
        ...fila,
        transportePorUnidad:
          fila.unidades > 0 ? fila.transporte / fila.unidades : null,
        transportePctVentas:
          fila.ventas !== 0 ? (fila.transporte / fila.ventas) * 100 : null,
      }))
      .sort((a, b) => b.transporte - a.transporte)
  }, [clientesFiltrados])

  const evolucionCliente = useMemo(() => {
    if (clienteFiltro === "TODOS") return []
    return clientesFiltrados
      .filter((fila) => fila.cliente_id === clienteFiltro)
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
  }, [clientesFiltrados, clienteFiltro])

  async function guardarPeriodo(factura: TransporteFactura) {
    const periodo = periodosEdicion[factura.factura_id]
    if (!periodo) return

    setGuardando(factura.factura_id)
    setError("")
    setMensaje("")

    const { error: errorRpc } = await supabase.rpc(
      "fin_guardar_periodo_servicio_factura",
      {
        p_factura_id: factura.factura_id,
        p_periodo: periodo,
      },
    )

    if (errorRpc) {
      setError(errorRpc.message)
      setGuardando(null)
      return
    }

    setMensaje(
      `${factura.proveedor} · ${
        factura.numero_factura ?? "S/F"
      }: período guardado como ${mesCorto(periodo)}.`,
    )

    setGuardando(null)
    await cargar()
  }

  return (
    <main style={pagina}>
      <section style={encabezado}>
        <div>
          <span style={eyebrow}>PAGOS Y FINANZAS · RENTABILIDAD</span>
          <h1 style={titulo}>Gastos · Transporte</h1>
          <p style={subtitulo}>
            Primera capa de rentabilidad comercial. El total del negocio
            proviene de contabilidad; el detalle por cliente solo se asigna
            cuando existe una relación objetiva.
          </p>
        </div>

        <div style={vistaBotones}>
          {([
            ["NEGOCIO", "Negocio"],
            ["CLIENTES", "Clientes"],
            ["PERIODOS", "Períodos de servicio"],
          ] as [Vista, string][]).map(([codigo, texto]) => (
            <button
              key={codigo}
              type="button"
              onClick={() => setVista(codigo)}
              style={{
                ...vistaBoton,
                ...(vista === codigo ? vistaBotonActivo : {}),
              }}
            >
              {texto}
            </button>
          ))}
        </div>
      </section>

      <section style={filtros}>
        <label style={campo}>
          <span style={label}>Desde</span>
          <select
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            style={select}
          >
            {mesesDisponibles.map((periodo) => (
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
            {mesesDisponibles.map((periodo) => (
              <option key={periodo} value={periodo}>
                {mesCorto(periodo)}
              </option>
            ))}
          </select>
        </label>

        {vista === "CLIENTES" && (
          <label style={{ ...campo, minWidth: 260 }}>
            <span style={label}>Cliente</span>
            <select
              value={clienteFiltro}
              onChange={(e) => setClienteFiltro(e.target.value)}
              style={select}
            >
              <option value="TODOS">Todos</option>
              {opcionesCliente.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {error && <div style={errorCaja}>{error}</div>}
      {mensaje && <div style={okCaja}>{mensaje}</div>}

      <section style={kpis}>
        <Kpi
          titulo="Transporte negocio"
          valor={moneda(totales.transporteContable)}
          detalle={`${porcentaje(
            totales.transportePctVentas,
          )} de ventas netas`}
        />
        <Kpi
          titulo="Atribuido a clientes"
          valor={moneda(totales.transporteAsignado)}
          detalle={`${porcentaje(totales.cobertura)} del transporte`}
        />
        <Kpi
          titulo="No atribuido"
          valor={moneda(totales.transporteNoAtribuido)}
          detalle="Logística/fletes sin driver objetivo"
        />
        <Kpi
          titulo="Períodos por confirmar"
          valor={numero(totales.pendientes)}
          detalle="Factura ≠ necesariamente mes de servicio"
          alerta={totales.pendientes > 0}
        />
      </section>

      {cargando ? (
        <section style={panel}>
          <div style={vacio}>Cargando transporte...</div>
        </section>
      ) : vista === "NEGOCIO" ? (
        <VistaNegocio filas={resumenFiltrado} />
      ) : vista === "CLIENTES" ? (
        <VistaClientes
          agregados={clientesAgregados}
          evolucion={evolucionCliente}
          clienteSeleccionado={
            opcionesCliente.find(([id]) => id === clienteFiltro)?.[1] ??
            null
          }
        />
      ) : (
        <section style={panel}>
          <div style={panelCabecera}>
            <div>
              <strong style={panelTitulo}>Período real del servicio</strong>
              <span style={panelTexto}>
                Si una factura de julio corresponde a junio, aquí se cambia a
                junio. Mientras no se confirme, el sistema usa el mes de emisión
                solo como referencia provisional.
              </span>
            </div>
          </div>

          <div style={tablaWrap}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Emisión</th>
                  <th style={th}>Proveedor / factura</th>
                  <th style={th}>Gasto</th>
                  <th style={th}>Atribución</th>
                  <th style={th}>Período servicio</th>
                  <th style={th}>Estado</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {facturasFiltradas.map((factura) => (
                  <tr key={factura.factura_id}>
                    <td style={td}>{factura.fecha_emision}</td>
                    <td style={td}>
                      <strong style={filaTitulo}>{factura.proveedor}</strong>
                      <span style={filaDetalle}>
                        {factura.numero_factura ?? "S/F"} ·{" "}
                        {factura.cuenta_codigo}
                      </span>
                    </td>
                    <td style={tdNum}>{moneda(factura.gasto_sin_iva)}</td>
                    <td style={td}>
                      {reglaTexto(factura.regla_atribucion)}
                    </td>
                    <td style={td}>
                      <select
                        value={
                          periodosEdicion[factura.factura_id] ??
                          isoMes(factura.periodo_emision)
                        }
                        onChange={(e) =>
                          setPeriodosEdicion((actual) => ({
                            ...actual,
                            [factura.factura_id]: e.target.value,
                          }))
                        }
                        style={selectTabla}
                      >
                        {mesesDisponibles.map((periodo) => (
                          <option key={periodo} value={periodo}>
                            {mesCorto(periodo)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          ...badge,
                          ...(factura.periodo_confirmado
                            ? badgeOk
                            : badgePendiente),
                        }}
                      >
                        {factura.periodo_confirmado
                          ? "Confirmado"
                          : "Por confirmar"}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        type="button"
                        onClick={() => void guardarPeriodo(factura)}
                        disabled={guardando === factura.factura_id}
                        style={botonGuardar}
                      >
                        {guardando === factura.factura_id
                          ? "Guardando..."
                          : "Guardar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section style={criterio}>
        <strong>Criterio de atribución actual</strong>
        <span>
          Transporte se toma únicamente de la clasificación oficial de la factura.
          Si una factura tiene un cliente, se atribuye directamente; si tiene varios,
          se prorratea por unidades facturadas del período de servicio. Lo que no tenga
          cliente o un driver objetivo permanece visible como no atribuido.
        </span>
      </section>
    </main>
  )
}

function VistaNegocio({
  filas,
}: {
  filas: ResumenMensual[]
}) {
  const maximo = Math.max(
    1,
    ...filas.flatMap((fila) => [
      Number(fila.transporte_contable ?? 0),
      Number(fila.transporte_asignado ?? 0),
    ]),
  )

  return (
    <section style={panel}>
      <div style={panelCabecera}>
        <div>
          <strong style={panelTitulo}>Evolución del transporte</strong>
          <span style={panelTexto}>
            Contabilidad vs monto que ya podemos explicar por cliente.
          </span>
        </div>
      </div>

      <div style={leyenda}>
        <span style={leyendaItem}>
          <i style={{ ...punto, background: "#38bdf8" }} />
          Transporte contable
        </span>
        <span style={leyendaItem}>
          <i style={{ ...punto, background: "#22c55e" }} />
          Atribuido
        </span>
        <span style={leyendaItem}>
          <i style={{ ...punto, background: "#fb923c" }} />
          No atribuido
        </span>
      </div>

      <div style={svgWrap}>
        <svg viewBox="0 0 1050 320" style={svg}>
          {Array.from({ length: 5 }).map((_, i) => {
            const y = 25 + (i / 4) * 225
            const valor = maximo * (1 - i / 4)
            return (
              <g key={i}>
                <line
                  x1="75"
                  y1={y}
                  x2="1015"
                  y2={y}
                  stroke="#334155"
                />
                <text
                  x="65"
                  y={y + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="10"
                >
                  {moneda(valor)}
                </text>
              </g>
            )
          })}

          {filas.map((fila, i) => {
            const ancho = 940 / Math.max(filas.length, 1)
            const x = 75 + i * ancho + ancho / 2
            const y = (valor: number) =>
              25 + (1 - valor / maximo) * 225

            return (
              <g key={fila.periodo}>
                <line
                  x1={x}
                  y1={y(Number(fila.transporte_contable ?? 0))}
                  x2={x}
                  y2="250"
                  stroke="#38bdf8"
                  strokeWidth={Math.min(32, ancho * 0.3)}
                  opacity="0.85"
                >
                  <title>
                    {`${mesCorto(fila.periodo)} · transporte contable: ${moneda(
                      fila.transporte_contable,
                    )} · ${porcentaje(
                      fila.transporte_pct_ventas,
                    )} de ventas`}
                  </title>
                </line>

                <circle
                  cx={x}
                  cy={y(Number(fila.transporte_asignado ?? 0))}
                  r="5"
                  fill="#0f172a"
                  stroke="#22c55e"
                  strokeWidth="3"
                >
                  <title>
                    {`${mesCorto(fila.periodo)} · atribuido: ${moneda(
                      fila.transporte_asignado,
                    )}`}
                  </title>
                </circle>

                <circle
                  cx={x}
                  cy={y(Number(fila.transporte_no_atribuido ?? 0))}
                  r="5"
                  fill="#0f172a"
                  stroke="#fb923c"
                  strokeWidth="3"
                >
                  <title>
                    {`${mesCorto(fila.periodo)} · no atribuido: ${moneda(
                      fila.transporte_no_atribuido,
                    )}`}
                  </title>
                </circle>

                <text
                  x={x}
                  y="274"
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="10"
                >
                  {mesCorto(fila.periodo)}
                </text>

                <text
                  x={x}
                  y={Math.max(
                    14,
                    y(Number(fila.transporte_contable ?? 0)) - 9,
                  )}
                  textAnchor="middle"
                  fill="#7dd3fc"
                  fontSize="9"
                  fontWeight="700"
                >
                  {porcentaje(fila.transporte_pct_ventas)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div style={tablaWrap}>
        <table style={tabla}>
          <thead>
            <tr>
              <th style={th}>Mes</th>
              <th style={thNum}>Ventas netas</th>
              <th style={thNum}>Transporte contable</th>
              <th style={thNum}>% ventas</th>
              <th style={thNum}>Atribuido</th>
              <th style={thNum}>No atribuido</th>
              <th style={thNum}>Períodos pendientes</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={`tabla-${fila.periodo}`}>
                <td style={td}>{mesCorto(fila.periodo)}</td>
                <td style={tdNum}>{moneda(fila.ventas_netas_contables)}</td>
                <td style={tdNum}>{moneda(fila.transporte_contable)}</td>
                <td style={tdNum}>{porcentaje(fila.transporte_pct_ventas)}</td>
                <td style={tdNum}>{moneda(fila.transporte_asignado)}</td>
                <td style={tdNum}>{moneda(fila.transporte_no_atribuido)}</td>
                <td style={tdNum}>
                  {numero(fila.facturas_periodo_por_confirmar)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function VistaClientes({
  agregados,
  evolucion,
  clienteSeleccionado,
}: {
  agregados: Array<{
    cliente_id: string
    cliente_nombre: string
    transporte: number
    unidades: number
    ventas: number
    facturas: number
    confirmados: boolean
    transportePorUnidad: number | null
    transportePctVentas: number | null
  }>
  evolucion: TransporteCliente[]
  clienteSeleccionado: string | null
}) {
  const maximo = Math.max(
    1,
    ...agregados.map((fila) => fila.transporte),
  )

  return (
    <>
      <section style={panel}>
        <div style={panelCabecera}>
          <div>
            <strong style={panelTitulo}>Transporte por cliente</strong>
            <span style={panelTexto}>
              Ordenado de mayor a menor. $/unidad permite comparar eficiencia
              logística entre clientes.
            </span>
          </div>
        </div>

        <div style={rankingLista}>
          {agregados.map((fila, indice) => (
            <div key={fila.cliente_id} style={rankingFila}>
              <span style={rankingNumero}>{indice + 1}</span>
              <div style={rankingCliente}>
                <strong>{fila.cliente_nombre}</strong>
                <small>
                  {numero(fila.unidades)} unid. · {fila.facturas} factura(s)
                </small>
              </div>
              <div style={barraFondo}>
                <div
                  style={{
                    ...barraValor,
                    width: `${Math.max(
                      2,
                      (fila.transporte / maximo) * 100,
                    )}%`,
                  }}
                />
              </div>
              <div style={rankingValor}>
                <strong>{moneda(fila.transporte)}</strong>
                <small>
                  {fila.transportePorUnidad == null
                    ? "—"
                    : `${moneda(fila.transportePorUnidad)}/unid.`}
                </small>
              </div>
            </div>
          ))}
        </div>

        <div style={tablaWrap}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={th}>Cliente</th>
                <th style={thNum}>Unidades facturadas</th>
                <th style={thNum}>Facturación</th>
                <th style={thNum}>Transporte</th>
                <th style={thNum}>$/unidad</th>
                <th style={thNum}>% facturación</th>
                <th style={th}>Período</th>
              </tr>
            </thead>
            <tbody>
              {agregados.map((fila) => (
                <tr key={`c-${fila.cliente_id}`}>
                  <td style={td}>{fila.cliente_nombre}</td>
                  <td style={tdNum}>{numero(fila.unidades)}</td>
                  <td style={tdNum}>{moneda(fila.ventas)}</td>
                  <td style={tdNum}>{moneda(fila.transporte)}</td>
                  <td style={tdNum}>
                    {fila.transportePorUnidad == null
                      ? "—"
                      : moneda(fila.transportePorUnidad)}
                  </td>
                  <td style={tdNum}>
                    {porcentaje(fila.transportePctVentas)}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        ...badge,
                        ...(fila.confirmados
                          ? badgeOk
                          : badgePendiente),
                      }}
                    >
                      {fila.confirmados
                        ? "Confirmado"
                        : "Incluye provisional"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {clienteSeleccionado && evolucion.length > 0 && (
        <section style={panel}>
          <div style={panelCabecera}>
            <div>
              <strong style={panelTitulo}>
                Evolución · {clienteSeleccionado}
              </strong>
              <span style={panelTexto}>
                Transporte por unidad y porcentaje sobre facturación.
              </span>
            </div>
          </div>

          <div style={miniEvolucion}>
            {evolucion.map((fila) => (
              <article key={fila.periodo} style={miniCard}>
                <span>{mesCorto(fila.periodo)}</span>
                <strong>{moneda(fila.gasto_transporte)}</strong>
                <small>
                  {fila.transporte_por_unidad == null
                    ? "—"
                    : `${moneda(
                        fila.transporte_por_unidad,
                      )}/unid.`}
                </small>
                <small>
                  {porcentaje(fila.transporte_pct_facturacion)} facturación
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function Kpi({
  titulo,
  valor,
  detalle,
  alerta = false,
}: {
  titulo: string
  valor: string
  detalle: string
  alerta?: boolean
}) {
  return (
    <article
      style={{
        ...kpi,
        ...(alerta ? kpiAlerta : {}),
      }}
    >
      <span style={kpiTitulo}>{titulo}</span>
      <strong style={kpiValor}>{valor}</strong>
      <small style={kpiDetalle}>{detalle}</small>
    </article>
  )
}

const pagina = {
  padding: 16,
  maxWidth: 1500,
  margin: "0 auto",
} as const

const encabezado = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "start",
} as const

const eyebrow = {
  color: "#F7931E",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: ".05em",
} as const

const titulo = {
  margin: "4px 0 0",
  color: "#8F1D24",
  fontSize: 28,
} as const

const subtitulo = {
  margin: "6px 0 0",
  maxWidth: 900,
  color: "#6b625f",
  fontSize: 13,
  lineHeight: 1.45,
} as const

const vistaBotones = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
} as const

const vistaBoton = {
  border: "1px solid #d7cbc5",
  borderRadius: 999,
  background: "#fff",
  color: "#685d58",
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
} as const

const vistaBotonActivo = {
  borderColor: "#8F1D24",
  background: "#8F1D24",
  color: "#fff",
} as const

const filtros = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "end",
  marginTop: 14,
  padding: 12,
  border: "1px solid #eadfd8",
  borderRadius: 13,
  background: "#fff",
} as const

const campo = {
  display: "grid",
  gap: 4,
  minWidth: 160,
} as const

const label = {
  color: "#80736d",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
} as const

const select = {
  height: 36,
  border: "1px solid #d7cbc5",
  borderRadius: 9,
  background: "#fff",
  color: "#3f3632",
  padding: "0 9px",
} as const

const kpis = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
  marginTop: 12,
} as const

const kpi = {
  padding: 12,
  border: "1px solid #eadfd8",
  borderRadius: 12,
  background: "#fff",
  display: "grid",
  gap: 4,
} as const

const kpiAlerta = {
  borderColor: "#fdba74",
  background: "#fff7ed",
} as const

const kpiTitulo = {
  color: "#80736d",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
} as const

const kpiValor = {
  color: "#3f3632",
  fontSize: 20,
} as const

const kpiDetalle = {
  color: "#8a7e78",
  fontSize: 10,
} as const

const panel = {
  marginTop: 12,
  padding: 14,
  border: "1px solid #334155",
  borderRadius: 14,
  background: "#0f172a",
  color: "#e2e8f0",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.10)",
} as const

const panelCabecera = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
} as const

const panelTitulo = {
  display: "block",
  color: "#f8fafc",
  fontSize: 15,
} as const

const panelTexto = {
  display: "block",
  marginTop: 3,
  color: "#94a3b8",
  fontSize: 11,
} as const

const leyenda = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid #334155",
} as const

const leyendaItem = {
  display: "inline-flex",
  gap: 6,
  alignItems: "center",
  color: "#cbd5e1",
  fontSize: 10,
} as const

const punto = {
  width: 9,
  height: 9,
  borderRadius: 999,
  display: "inline-block",
} as const

const svgWrap = {
  width: "100%",
  overflowX: "auto",
  marginTop: 8,
} as const

const svg = {
  width: "100%",
  minWidth: 720,
  height: "auto",
  display: "block",
} as const

const tablaWrap = {
  width: "100%",
  overflowX: "auto",
  marginTop: 10,
} as const

const tabla = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 850,
  fontSize: 10,
} as const

const th = {
  padding: "8px 7px",
  textAlign: "left",
  color: "#94a3b8",
  borderBottom: "1px solid #334155",
  whiteSpace: "nowrap",
} as const

const thNum = {
  ...th,
  textAlign: "right",
} as const

const td = {
  padding: "8px 7px",
  color: "#e2e8f0",
  borderBottom: "1px solid #1e293b",
  verticalAlign: "middle",
} as const

const tdNum = {
  ...td,
  textAlign: "right",
  whiteSpace: "nowrap",
} as const

const filaTitulo = {
  display: "block",
  color: "#f8fafc",
  fontSize: 10,
} as const

const filaDetalle = {
  display: "block",
  color: "#94a3b8",
  marginTop: 2,
  fontSize: 9,
} as const

const rankingLista = {
  display: "grid",
  gap: 7,
  marginTop: 12,
} as const

const rankingFila = {
  display: "grid",
  gridTemplateColumns:
    "28px minmax(180px, 280px) minmax(220px, 1fr) 120px",
  gap: 9,
  alignItems: "center",
} as const

const rankingNumero = {
  color: "#64748b",
  textAlign: "center",
  fontWeight: 900,
  fontSize: 10,
} as const

const rankingCliente = {
  display: "grid",
  gap: 2,
  minWidth: 0,
  color: "#f8fafc",
  fontSize: 10,
} as const

const barraFondo = {
  width: "100%",
  height: 12,
  overflow: "hidden",
  borderRadius: 999,
  background: "#1e293b",
} as const

const barraValor = {
  height: "100%",
  borderRadius: 999,
  background: "#8b5cf6",
} as const

const rankingValor = {
  display: "grid",
  gap: 1,
  justifyItems: "end",
  color: "#f8fafc",
  fontSize: 10,
} as const

const badge = {
  display: "inline-block",
  borderRadius: 999,
  padding: "4px 7px",
  fontSize: 9,
  fontWeight: 900,
  whiteSpace: "nowrap",
} as const

const badgeOk = {
  background: "#14532d",
  color: "#bbf7d0",
} as const

const badgePendiente = {
  background: "#7c2d12",
  color: "#fed7aa",
} as const

const selectTabla = {
  minWidth: 125,
  height: 30,
  border: "1px solid #475569",
  borderRadius: 7,
  background: "#111827",
  color: "#f8fafc",
  padding: "0 6px",
  fontSize: 10,
} as const

const botonGuardar = {
  border: "1px solid #fb7185",
  borderRadius: 8,
  background: "#9f1239",
  color: "#fff",
  padding: "6px 9px",
  fontSize: 9,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const

const vacio = {
  padding: 20,
  textAlign: "center",
  color: "#94a3b8",
  fontSize: 11,
} as const

const errorCaja = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#9f1239",
  fontSize: 11,
} as const

const okCaja = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  fontSize: 11,
} as const

const miniEvolucion = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: 8,
  marginTop: 10,
} as const

const miniCard = {
  display: "grid",
  gap: 4,
  padding: 10,
  border: "1px solid #334155",
  borderRadius: 9,
  background: "#111827",
  color: "#cbd5e1",
  fontSize: 9,
} as const

const criterio = {
  marginTop: 10,
  display: "grid",
  gap: 3,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #e7d7cf",
  background: "#fffaf7",
  color: "#6b625f",
  fontSize: 10,
  lineHeight: 1.4,
} as const
