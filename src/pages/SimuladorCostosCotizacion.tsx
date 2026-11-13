import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { obtenerBaseCostosCotizacion, type BaseCostosCotizacion } from "../repositories/cotizacionRepository"

const campos = [
  { clave: "precio", etiqueta: "Precio propuesto sin IVA por unidad (USD)" },
  { clave: "unidades", etiqueta: "Unidades previstas" },
  { clave: "materiales", etiqueta: "Materiales y empaque por unidad (USD)" },
  { clave: "descuento", etiqueta: "Descuento (%)" },
  { clave: "devolucion", etiqueta: "Devoluciones previstas (%)" },
  { clave: "objetivo", etiqueta: "Margen mínimo deseado (%)" },
] as const

type Campo = typeof campos[number]["clave"]
type Producto = { id: string; codigo: string; nombre: string }

const moneda = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" })
const monedaUnidad = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 4 })
const porcentaje = new Intl.NumberFormat("es-EC", { style: "percent", maximumFractionDigits: 2 })
const numero = new Intl.NumberFormat("es-EC")
const mesBalance = new Intl.DateTimeFormat("es-EC", { month: "long", year: "numeric", timeZone: "UTC" })

function importe(texto: string | undefined) {
  const limpio = texto?.trim()
  if (!limpio || !/^\d+(?:[.,]\d{1,4})?$/.test(limpio)) return null
  const valor = Number(limpio.replace(",", "."))
  return Number.isFinite(valor) ? valor : null
}

function tasa(texto: string | undefined) {
  const valor = importe(texto)
  return valor !== null && valor <= 100 ? valor / 100 : null
}

function mostrarLimite(limite: number | null) {
  if (limite === null) return "—"
  if (limite < -1e-10) return "No alcanza el margen mínimo"
  return porcentaje.format(Math.floor(Math.max(0, limite) * 10000 + 1e-8) / 10000)
}

export default function SimuladorCostosCotizacion() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [productoId, setProductoId] = useState("")
  const [aviso, setAviso] = useState("")
  const [referencia, setReferencia] = useState<{ productoId: string; costo: number | null } | null>(null)
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
    async function cargarCosto() {
      const { data, error } = await supabase.from("fm_vw_productos_costo_completo")
        .select("costo_materiales_unidad,items_sin_costo").eq("producto_id", productoId).maybeSingle()
      if (!vigente) return
      const costo = !error && data?.costo_materiales_unidad != null && Number(data.items_sin_costo) === 0
        ? Number(data.costo_materiales_unidad)
        : null
      setReferencia({ productoId, costo: costo !== null && Number.isFinite(costo) && costo >= 0 ? costo : null })
    }
    void cargarCosto()
    return () => { vigente = false }
  }, [productoId])

  const costoCatalogo = referencia?.productoId === productoId ? referencia.costo : null
  const materiales = importe(valores.materiales) ?? (!valores.materiales?.trim() ? costoCatalogo : null)
  const modUnidad = base ? base.manoObra / base.unidadesProducidas : null
  const cifUnidad = base ? base.cif / base.unidadesProducidas : null
  const transporteUnidad = base ? base.transporte / base.unidadesVendidas : null
  const gastosUnidad = base ? base.gastos / base.unidadesVendidas : null
  const precio = importe(valores.precio)
  const descuento = tasa(valores.descuento)
  const devolucion = tasa(valores.devolucion)
  const objetivo = tasa(valores.objetivo)
  const unidades = importe(valores.unidades)
  const unidadesValidas = unidades !== null && Number.isSafeInteger(unidades) && unidades > 0
  const costoProduccion = unidadesValidas && materiales !== null && modUnidad !== null && cifUnidad !== null
    ? (materiales + modUnidad + cifUnidad) * unidades
    : null
  const gastosTotales = unidadesValidas && transporteUnidad !== null && gastosUnidad !== null
    ? (transporteUnidad + gastosUnidad) * unidades : null
  const costoTotal = costoProduccion !== null && gastosTotales !== null ? costoProduccion + gastosTotales : null
  const costoUnitario = costoTotal !== null && unidadesValidas ? costoTotal / unidades : null
  const factorNeto = descuento !== null && devolucion !== null ? (1 - descuento) * (1 - devolucion) : null
  const venta = precio !== null && unidadesValidas ? precio * unidades : null
  const ventaNeta = venta !== null && factorNeto !== null ? venta * factorNeto : null
  const precioEquilibrio = costoUnitario !== null && factorNeto !== null && factorNeto > 0
    ? costoUnitario / factorNeto : null
  const utilidad = ventaNeta !== null && costoTotal !== null ? ventaNeta - costoTotal : null
  const margen = utilidad !== null && ventaNeta !== null && ventaNeta > 0 ? utilidad / ventaNeta : null
  const ingresoMinimo = costoTotal !== null && objetivo !== null && objetivo < 1 ? costoTotal / (1 - objetivo) : null
  const antesDescuento = venta !== null && devolucion !== null ? venta * (1 - devolucion) : null
  const antesDevolucion = venta !== null && descuento !== null ? venta * (1 - descuento) : null
  const maxDescuento = ingresoMinimo !== null && antesDescuento !== null && antesDescuento > 0
    ? 1 - ingresoMinimo / antesDescuento : null
  const maxDevolucion = ingresoMinimo !== null && antesDevolucion !== null && antesDevolucion > 0
    ? 1 - ingresoMinimo / antesDevolucion : null
  const resultados: [string, number | null, Intl.NumberFormat][] = [
    ["Ventas al precio propuesto", venta, moneda],
    ["Ventas netas después de descuento y devoluciones", ventaNeta, moneda],
    ["Costo total de producción", costoProduccion, moneda],
    ["Transporte y otros gastos", gastosTotales, moneda],
    ["Costo total con gastos", costoTotal, moneda],
    ["Costo por unidad", costoUnitario, monedaUnidad],
    ["Precio de equilibrio por unidad con los ajustes", precioEquilibrio, monedaUnidad],
    ["Utilidad estimada", utilidad, moneda],
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
            setValores((actual) => ({ ...actual, materiales: "" }))
          }}>
            <option value="">Ingresar costos manualmente</option>
            {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.codigo} · {producto.nombre}</option>)}
          </select>
        </label>
        {campos.map(({ clave, etiqueta }) => {
          const texto = valores[clave] ?? ""
          const esTasa = clave === "descuento" || clave === "devolucion" || clave === "objetivo"
          const invalido = esTasa
            ? tasa(texto) === null || (clave === "objetivo" && objetivo === 1)
            : !!texto.trim() && (clave === "unidades" ? !unidadesValidas : importe(texto) === null)
          return (
            <label key={clave}>{etiqueta}
              <input
                inputMode={clave === "unidades" ? "numeric" : "decimal"}
                value={texto}
                aria-invalid={invalido}
                placeholder={clave === "materiales" && costoCatalogo !== null ? monedaUnidad.format(costoCatalogo) : undefined}
                onChange={(e) => setValores((actual) => ({ ...actual, [clave]: e.target.value }))}
              />
              {invalido && <small>{esTasa ? clave === "objetivo" ? "Ingresa un porcentaje desde 0 y menor que 100." : "Ingresa un porcentaje entre 0 y 100."
                : clave === "unidades" ? "Ingresa un número entero mayor a cero." : "Ingresa un importe válido, con hasta cuatro decimales."}</small>}
              {clave === "materiales" && productoId && <small>
                {referencia === null ? "Consultando el costo de materiales y empaque…" : costoCatalogo === null
                  ? "Costo de catálogo incompleto o no disponible. Ingresa un importe."
                  : `Costo de catálogo: ${monedaUnidad.format(costoCatalogo)}. Puedes reemplazarlo.`}
              </small>}
            </label>
          )
        })}
      </div>
      <div className="cotizacion-margen" aria-live="polite">
        <div><span>Margen estimado sobre ventas netas</span>
          <strong className={margen !== null && margen < 0 ? "cotizacion-perdida" : undefined}>{margen === null ? "—" : porcentaje.format(margen)}</strong>
          {margen !== null && objetivo !== null && objetivo < 1 && <small>{margen + 1e-10 >= objetivo ? "Alcanza el margen mínimo" : "Por debajo del margen mínimo"}</small>}
        </div>
        <div><span>Descuento máximo</span><strong>{mostrarLimite(maxDescuento)}</strong><small>Con las devoluciones ingresadas</small></div>
        <div><span>Devolución máxima</span><strong>{mostrarLimite(maxDevolucion)}</strong><small>Con el descuento ingresado</small></div>
      </div>
      <p>Las devoluciones se valoran al precio con descuento. Se conserva el costo de todas las unidades del pedido. Con un margen mínimo de 0 %, los máximos indican el punto de equilibrio.</p>
      {estadoBase && <p role="status">{estadoBase}</p>}
      {base && <section className="cotizacion-base">
        <h3>Base contable de {mesBalance.format(new Date(base.periodo + "T00:00:00Z"))}</h3>
        <p>Balance importado: {base.archivos.length ? base.archivos.join(", ") : "nombre del archivo no disponible"}. Mano de obra tomada de los roles de pago del mismo mes.</p>
        <p>Mano de obra y CIF repartidos entre {numero.format(base.unidadesProducidas)} unidades producidas. Transporte y otros gastos repartidos entre {numero.format(base.unidadesVendidas)} unidades facturadas del negocio.</p>
        <dl className="cotizacion-resultados">
          {([
            ["Mano de obra directa por unidad", modUnidad],
            ["CIF por unidad", cifUnidad],
            ["Transporte por unidad", transporteUnidad],
            ["Otros gastos por unidad", gastosUnidad],
          ] as const).map(([etiqueta, costo]) => (
            <div key={etiqueta}><dt>{etiqueta}</dt><dd>{costo === null ? "—" : monedaUnidad.format(costo)}</dd></div>
          ))}
        </dl>
      </section>}
      <dl className="cotizacion-resultados" aria-live="polite">
        {resultados.map(([etiqueta, valor, formato]) => (
          <div key={etiqueta}><dt>{etiqueta}</dt>
            <dd>{valor !== null && Number.isFinite(valor) ? formato.format(valor) : "—"}</dd>
          </div>
        ))}
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
  .cotizacion-margen{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px;margin-top:20px}
  .cotizacion-margen>div{display:grid;align-content:start;gap:5px;background:#faf1ef;border:1px solid #e5dad4;border-radius:8px;padding:14px;text-align:left}
  .cotizacion-margen strong{font-size:20px}.cotizacion-margen>div:first-child strong{font-size:32px;color:#166534}
  .cotizacion-margen>div:first-child .cotizacion-perdida{color:#a11f29}
  .cotizacion-base{border-top:1px solid #e5dad4;padding-top:12px;margin-top:16px}.cotizacion-base h3{margin:0}
`
