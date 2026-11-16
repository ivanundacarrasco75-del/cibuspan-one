import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  obtenerBaseCostosCotizacion,
  obtenerMaterialesCotizacion,
  obtenerPrecioFacturadoCotizacion,
  obtenerPreciosSucursalCotizacion,
  obtenerTransporteClienteCotizacion,
  type BaseCostosCotizacion,
} from "../repositories/cotizacionRepository"
import { obtenerClientesDb, type ClienteDb } from "../services/catalogoService"

const campos = [
  { clave: "precio", etiqueta: "Precio propuesto sin IVA por unidad (USD)" },
  { clave: "unidades", etiqueta: "Unidades previstas" },
  { clave: "materiales", etiqueta: "Materiales y empaque por unidad (USD)" },
  { clave: "transporte", etiqueta: "Transporte total del pedido (USD)" },
  { clave: "descuento", etiqueta: "Descuento (%)" },
  { clave: "devolucion", etiqueta: "Devoluciones previstas (%)" },
  { clave: "objetivo", etiqueta: "Margen mínimo deseado (%)" },
] as const

type Campo = typeof campos[number]["clave"]
type Producto = { id: string; codigo: string; nombre: string }

const moneda = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" })
const monedaUnidad = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 4 })
const porcentaje = new Intl.NumberFormat("es-EC", { style: "percent", maximumFractionDigits: 2 })
const mesBalance = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" })

function importe(texto: string | undefined, esPrecio = false) {
  const limpio = texto?.trim()
  const formato = esPrecio ? /^\d+(?:[.,]\d{1,6})?$/ : /^\d+(?:[.,]\d{1,4})?$/
  if (!limpio || !formato.test(limpio)) return null
  const valor = Number(limpio.replace(",", "."))
  return Number.isFinite(valor) ? valor : null
}

function tasa(texto: string | undefined) {
  const valor = importe(texto)
  return valor !== null && valor <= 100 ? valor / 100 : null
}

export default function SimuladorCostosCotizacion() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [productoId, setProductoId] = useState("")
  const [clientes, setClientes] = useState<ClienteDb[] | null>(null)
  const [clienteElegido, setClienteElegido] = useState<string | null>(null)
  const [clienteProducto, setClienteProducto] = useState<string | null>(null)
  const [sucursales, setSucursales] = useState<Awaited<ReturnType<typeof obtenerPreciosSucursalCotizacion>> | null>(null)
  const [errorSucursales, setErrorSucursales] = useState(false)
  const [precioFacturado, setPrecioFacturado] = useState<{
    clienteId: string
    productoId: string
    datos: Awaited<ReturnType<typeof obtenerPrecioFacturadoCotizacion>>
    error?: boolean
  } | null>(null)
  const [errorClientes, setErrorClientes] = useState(false)
  const [flete, setFlete] = useState<{
    clienteId: string
    periodo: string
    datos: Awaited<ReturnType<typeof obtenerTransporteClienteCotizacion>>
    error?: boolean
  } | null>(null)
  const [aviso, setAviso] = useState("")
  const [referencia, setReferencia] = useState<{
    productoId: string
    datos: Awaited<ReturnType<typeof obtenerMaterialesCotizacion>>
    error?: boolean
  } | null>(null)
  const [valores, setValores] = useState<Partial<Record<Campo, string>>>({
    descuento: "0", devolucion: "0", objetivo: "0",
  })
  const [base, setBase] = useState<BaseCostosCotizacion | null>(null)
  const [estadoBase, setEstadoBase] = useState("Consultando el último balance cerrado con datos para cotizar…")

  useEffect(() => {
    let vigente = true
    obtenerBaseCostosCotizacion().then((datos) => {
      if (!vigente) return
      setBase(datos)
      setEstadoBase(datos ? "" : "No hay un mes cerrado con costos, producción y ventas suficientes para calcular el margen.")
    }).catch(() => {
      if (vigente) setEstadoBase("No se pudieron consultar los costos del balance. Vuelve a abrir la pestaña para reintentar.")
    })
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    let vigente = true
    obtenerClientesDb().then((datos) => {
      if (vigente) setClientes(datos.filter((cliente) => cliente.activo))
    }).catch(() => {
      if (vigente) setErrorClientes(true)
    })
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    if (!productoId || !clientes) return
    let vigente = true
    async function consultarCliente() {
      const { data, error } = await supabase.from("cliente_productos")
        .select("cliente_id").eq("producto_id", productoId).eq("activo", true)
      if (!vigente || error) return
      const asociados = clientes?.filter((cliente) => data.some((fila) => fila.cliente_id === cliente.id)) ?? []
      setClienteProducto(asociados.length === 1 ? asociados[0].id : null)
    }
    void consultarCliente()
    return () => { vigente = false }
  }, [productoId, clientes])

  useEffect(() => {
    if (!productoId) return
    let vigente = true
    obtenerPreciosSucursalCotizacion(productoId).then((datos) => {
      if (vigente) setSucursales(datos)
    }).catch(() => {
      if (vigente) setErrorSucursales(true)
    })
    return () => { vigente = false }
  }, [productoId])

  const sucursal = sucursales?.find(({ bodega }) => clienteElegido === `bodega:${bodega.id}`)
  const clienteId = sucursal?.bodega.cliente_id ?? clienteElegido ?? (productoId ? clienteProducto : "")
  const cliente = clientes?.find((fila) => fila.id === clienteId)
  const requiereSucursal = !sucursal && sucursales?.some(({ bodega }) => bodega.cliente_id === clienteId)
  const sucursalesCargadas = sucursales !== null
  useEffect(() => {
    if (!clienteId || !productoId || !sucursalesCargadas || sucursal || requiereSucursal) return
    let vigente = true
    obtenerPrecioFacturadoCotizacion(clienteId, productoId).then((datos) => {
      if (vigente) setPrecioFacturado({ clienteId, productoId, datos })
    }).catch(() => {
      if (vigente) setPrecioFacturado({ clienteId, productoId, datos: null, error: true })
    })
    return () => { vigente = false }
  }, [clienteId, productoId, sucursal, requiereSucursal, sucursalesCargadas])

  const periodo = base?.periodo
  useEffect(() => {
    if (!clienteId || !periodo) return
    let vigente = true
    obtenerTransporteClienteCotizacion(periodo, clienteId).then((datos) => {
      if (vigente) setFlete({ clienteId, periodo, datos })
    }).catch(() => {
      if (vigente) setFlete({ clienteId, periodo, datos: null, error: true })
    })
    return () => { vigente = false }
  }, [clienteId, periodo])

  useEffect(() => {
    let vigente = true
    async function cargar() {
      const registros: Producto[] = []
      const limite = 1000
      for (let inicio = 0; ; inicio += limite) {
        const { data, error } = await supabase.from("productos")
          .select("id,codigo,nombre").eq("activo", true).order("nombre").order("id")
          .range(inicio, inicio + limite - 1)
        if (!vigente) return
        if (error) {
          setAviso("El catálogo no está disponible. Puedes ingresar los costos manualmente.")
          return
        }
        registros.push(...(data ?? []))
        if ((data?.length ?? 0) < limite) {
          setProductos(registros)
          return
        }
      }
    }
    void cargar()
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    if (!productoId) return
    let vigente = true
    obtenerMaterialesCotizacion(productoId).then((datos) => {
      if (vigente) setReferencia({ productoId, datos })
    }).catch(() => {
      if (vigente) setReferencia({ productoId, datos: null, error: true })
    })
    return () => { vigente = false }
  }, [productoId])

  const materialesCatalogo = referencia?.productoId === productoId ? referencia.datos : null
  const costoCatalogo = materialesCatalogo?.costo ?? null
  const materiales = importe(valores.materiales) ?? (!valores.materiales?.trim() ? costoCatalogo : null)
  const modUnidad = base ? base.manoObra / base.unidadesProducidas : null
  const cifUnidad = base ? base.cif / base.unidadesProducidas : null
  const fleteCliente = flete && flete.clienteId === clienteId && flete.periodo === periodo ? flete : null
  const transporteUnidad = clienteId === ""
    ? (base ? base.transporte / base.unidadesVendidas : null)
    : (fleteCliente?.datos ? fleteCliente.datos.total / fleteCliente.datos.unidades : null)
  const origenFlete = cliente ? `Libro Mayor · ${cliente.nombre}` : "promedio general del balance"
  const precioSucursal = sucursal ? Number(sucursal.precio) : null
  const referenciaPrecio = precioFacturado?.clienteId === clienteId && precioFacturado.productoId === productoId
    ? precioFacturado : null
  const precioFactura = requiereSucursal ? null : referenciaPrecio?.datos
  const precioSugerido = precioSucursal ?? (precioFactura?.estado === "disponible" ? precioFactura.precio : null)
  const precio = valores.precio === undefined ? precioSugerido : importe(valores.precio, true)
  const descuento = tasa(valores.descuento)
  const devolucion = tasa(valores.devolucion)
  const objetivo = tasa(valores.objetivo)
  const unidades = importe(valores.unidades)
  const unidadesValidas = unidades !== null && Number.isSafeInteger(unidades) && unidades > 0
  const transporteBalance = unidadesValidas && transporteUnidad !== null
    ? transporteUnidad * unidades : null
  const transportePedido = valores.transporte?.trim() ? importe(valores.transporte) : transporteBalance
  const materialesPedido = unidadesValidas && materiales !== null ? materiales * unidades : null
  const cifPedido = unidadesValidas && cifUnidad !== null ? cifUnidad * unidades : null
  const manoObraPedido = unidadesValidas && modUnidad !== null ? modUnidad * unidades : null
  const gastosGeneralesPedido = unidadesValidas && base
    ? base.gastosGenerales / base.unidadesVendidas * unidades : null
  const gastosAsignados = clienteId ? base?.gastosEspecificosPorCliente.get(clienteId) ?? 0 : 0
  const ventasCliente = clienteId ? base?.unidadesPorCliente.get(clienteId) ?? 0 : 0
  const gastosEspecificosUnidad = !base || clienteId === null ? null
    : clienteId === "" ? base.gastosEspecificos / base.unidadesVendidas
    : ventasCliente > 0 ? gastosAsignados / ventasCliente
    : gastosAsignados === 0 ? 0 : null
  const gastosEspecificosPedido = unidadesValidas && gastosEspecificosUnidad !== null && transportePedido !== null
    ? gastosEspecificosUnidad * unidades + transportePedido : null
  const gastosSinAsignar = base && clienteId
    ? base.gastosEspecificos - [...base.gastosEspecificosPorCliente.values()].reduce((total, gasto) => total + gasto, 0) : 0
  const rubros = [materialesPedido, cifPedido, manoObraPedido, gastosGeneralesPedido, gastosEspecificosPedido]
  const costoTotal = rubros.every((rubro) => rubro !== null)
    ? rubros.reduce<number>((total, rubro) => total + (rubro ?? 0), 0) : null
  const factorNeto = descuento !== null && devolucion !== null ? (1 - descuento) * (1 - devolucion) : null
  const venta = precio !== null && unidadesValidas ? precio * unidades : null
  const ventaNeta = venta !== null && factorNeto !== null ? venta * factorNeto : null
  const utilidad = ventaNeta !== null && costoTotal !== null ? ventaNeta - costoTotal : null
  const margen = utilidad !== null && ventaNeta !== null && ventaNeta > 0 ? utilidad / ventaNeta : null
  const costos: [string, number | null][] = [
    ["Costo de MP y empaque", materialesPedido],
    ["CIF", cifPedido],
    ["MOD", manoObraPedido],
    ["Gastos generales", gastosGeneralesPedido],
    ["Gastos específicos", gastosEspecificosPedido],
    ["Costo total", costoTotal],
  ]

  return (
    <section className="cotizacion">
      <style>{estilos}</style>
      <h2>Simulador de costos para cotizar</h2>
      <p>Cotiza para un cliente nuevo con los costos del negocio y prueba distintos precios, descuentos y devoluciones.</p>
      {aviso && <p role="status">{aviso}</p>}
      <div className="cotizacion-campos">
        <label>Producto de referencia (opcional)
          <select value={productoId} onChange={(e) => {
            setProductoId(e.target.value)
            setReferencia(null)
            setClienteProducto(null)
            if (sucursal) setClienteElegido(sucursal.bodega.cliente_id)
            setSucursales(null)
            setErrorSucursales(false)
            setPrecioFacturado(null)
            setValores((actual) => ({ ...actual, materiales: "", precio: undefined }))
          }}>
            <option value="">Ingresar costos manualmente</option>
            {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.codigo} · {producto.nombre}</option>)}
          </select>
        </label>
        <label>Cliente o sucursal
          <select value={clienteElegido ?? clienteId ?? "__auto"} onChange={(e) => {
            if (e.target.value !== clienteId || sucursal) setPrecioFacturado(null)
            setValores((actual) => ({ ...actual, precio: undefined }))
            setClienteElegido(e.target.value)
          }}>
            {clienteId === null && <option value="__auto" disabled>Selecciona un cliente</option>}
            <option value="">Sin cliente · promedio general</option>
            {sucursales?.map(({ bodega }) => {
              const titular = clientes?.find((fila) => fila.id === bodega.cliente_id)
              return titular && <option key={bodega.id} value={`bodega:${bodega.id}`}>{titular.nombre} · {bodega.nombre}</option>
            })}
            {clientes?.map((fila) => <option key={fila.id} value={fila.id}>{fila.nombre}</option>)}
          </select>
          {errorClientes && <small>El catálogo de clientes no está disponible. Puedes ingresar el flete del pedido.</small>}
          {errorSucursales && <small>No se pudieron consultar los precios por sucursal.</small>}
        </label>
        {campos.map(({ clave, etiqueta }) => {
          const texto = valores[clave] ?? (clave === "precio" && precioSugerido !== null ? String(precioSugerido) : "")
          const esTasa = clave === "descuento" || clave === "devolucion" || clave === "objetivo"
          const invalido = esTasa
            ? tasa(texto) === null || (clave === "objetivo" && objetivo === 1)
            : !!texto.trim() && (clave === "unidades" ? !unidadesValidas : importe(texto, clave === "precio") === null)
          return (
            <label key={clave}>{etiqueta}
              <input
                inputMode={clave === "unidades" ? "numeric" : "decimal"}
                value={texto}
                aria-invalid={invalido}
                placeholder={clave === "materiales" && costoCatalogo !== null ? monedaUnidad.format(costoCatalogo)
                  : clave === "transporte" && transporteBalance !== null ? moneda.format(transporteBalance) : undefined}
                onChange={(e) => setValores((actual) => ({ ...actual, [clave]: e.target.value }))}
                onBlur={clave === "precio" && texto.trim() === "" && precioSugerido !== null
                  ? () => setValores((actual) => ({ ...actual, precio: undefined }))
                  : undefined}
              />
              {invalido && <small>{esTasa ? clave === "objetivo" ? "Ingresa un porcentaje desde 0 y menor que 100." : "Ingresa un porcentaje entre 0 y 100."
                : clave === "unidades" ? "Ingresa un número entero mayor a cero."
                : clave === "precio" ? "Ingresa un precio válido, con hasta seis decimales."
                : "Ingresa un importe válido, con hasta cuatro decimales."}</small>}
              {clave === "precio" && clienteId && productoId && <small>
                {sucursal ? `Precio de ${sucursal.bodega.nombre}. Puedes editarlo.`
                  : requiereSucursal ? "Elige la sucursal para aplicar su precio."
                  : errorSucursales ? "Ingresa el precio propuesto."
                  : referenciaPrecio?.error ? "No se pudo consultar el precio facturado. Ingresa el precio propuesto."
                  : precioFactura?.estado === "disponible" ? `Precio unitario facturado el ${precioFactura.fecha}. Puedes editarlo.`
                  : precioFactura?.estado === "varios" ? "La última fecha tiene varios precios unitarios. Ingresa el precio de la cotización."
                  : referenciaPrecio ? "No hay un precio facturado para esta combinación. Ingresa el precio propuesto."
                  : "Consultando el precio unitario facturado…"}
              </small>}
              {clave === "materiales" && productoId && <small>
                {referencia === null ? "Consultando el costo de materiales y empaque…"
                  : referencia.error ? "No se pudo consultar el costo de catálogo. Ingresa un importe."
                  : costoCatalogo === null
                  ? "Costo de catálogo incompleto o no disponible. Ingresa un importe."
                  : `Costo de catálogo: ${monedaUnidad.format(costoCatalogo)}. Puedes reemplazarlo.`}
                {materialesCatalogo && !materialesCatalogo.tieneEmpaque && " El SKU no tiene empaque registrado."}
              </small>}
              {clave === "unidades" && materialesCatalogo?.panesPorUnidad != null && materialesCatalogo.panesPorUnidad > 1 &&
                <small>Cada unidad cotizada corresponde a {materialesCatalogo.panesPorUnidad.toLocaleString("es-EC")} panes según la fórmula.</small>}
              {clave === "transporte" && <small>
                {transporteBalance !== null
                  ? `Sugerido según ${origenFlete}: ${moneda.format(transporteBalance)}. Puedes reemplazarlo, incluso por 0.`
                  : fleteCliente?.error ? "No se pudo consultar el transporte clasificado de este cliente. Ingresa el flete del pedido."
                  : fleteCliente && !fleteCliente.datos ? "El cliente no tiene transporte clasificado con unidades facturadas en este mes. Ingresa el flete del pedido."
                  : clienteId === null ? "Confirma el cliente o ingresa el flete del pedido."
                  : "Completa las unidades y espera el flete sugerido, o ingresa el flete del pedido."}
              </small>}
            </label>
          )
        })}
      </div>
      {estadoBase && <p role="status">{estadoBase}</p>}
      {Math.abs(gastosSinAsignar) > 0.05 && <p role="status">
        Los gastos específicos del balance difieren en {moneda.format(Math.abs(gastosSinAsignar))} de los asignados en el Libro Mayor.
      </p>}
      {clienteId && gastosAsignados !== 0 && ventasCliente <= 0 && <p role="status">
        El cliente tiene gastos específicos asignados y faltan unidades facturadas para repartirlos.
      </p>}
      <h3>Resumen del pedido</h3>
      {base && <small>Base contable de {mesBalance.format(new Date(base.periodo + "T00:00:00Z"))}
        {base.archivos.length > 0 && (" · " + base.archivos.join(", "))}</small>}
      <dl className="cotizacion-resultados" aria-live="polite">
        {costos.map(([etiqueta, valor]) => (
          <div key={etiqueta}><dt>{etiqueta}</dt>
            <dd>{valor === null ? "—" : moneda.format(valor)}</dd>
            {etiqueta === "Gastos específicos" && transportePedido !== null && <small>Flete aplicado {moneda.format(transportePedido)}</small>}
            {etiqueta === "Costo total" && valor !== null && unidadesValidas && <small>{monedaUnidad.format(valor / unidades)} por unidad</small>}
          </div>
        ))}
        <div><dt>Margen</dt>
          <dd className={utilidad !== null && utilidad < 0 ? "cotizacion-perdida" : undefined}>
            {utilidad === null ? "—" : moneda.format(utilidad)}
          </dd>
          <small>
            {margen === null ? "—" : porcentaje.format(margen)}
            {" sobre ventas netas"}
          </small>
          {margen !== null && objetivo !== null && objetivo < 1 && <small>
            {margen + 1e-10 >= objetivo ? "Alcanza el margen mínimo" : "Por debajo del margen mínimo"}
          </small>}
        </div>
      </dl>
    </section>
  )
}

const estilos = `
  .cotizacion{padding:20px;border:1px solid #e5dad4;border-radius:12px;background:white;color:#392f2c}
  .cotizacion h2{margin:0}.cotizacion p{margin:8px 0 16px;color:#6f625d}
  .cotizacion-campos,.cotizacion-resultados{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}
  .cotizacion label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:700}
  .cotizacion input,.cotizacion select{min-height:40px;width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #d9d0cc;border-radius:7px;background:white;color:inherit;font:inherit}
  .cotizacion [aria-invalid=true]{border-color:#b91c1c}.cotizacion small{font-weight:400}
  .cotizacion-resultados{margin:20px 0 0}.cotizacion-resultados>div{padding:12px;border-radius:8px;background:#f8f5f3}
  .cotizacion-resultados dt{font-size:12px}.cotizacion-resultados dd{margin:4px 0 0;font-size:20px;font-weight:750;color:#8f1d24}
  .cotizacion-resultados .cotizacion-perdida{color:#a11f29}
`
