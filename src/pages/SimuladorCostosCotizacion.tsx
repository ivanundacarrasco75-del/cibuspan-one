import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const campos = [
  { clave: "precio", etiqueta: "Precio propuesto sin IVA por unidad (USD)" },
  { clave: "unidades", etiqueta: "Unidades previstas" },
  { clave: "materiales", etiqueta: "Materiales y empaque por unidad (USD)" },
  { clave: "fabricacion", etiqueta: "Mano de obra y costos indirectos de fabricación por unidad (USD)" },
  { clave: "transporte", etiqueta: "Transporte total de la cotización (USD)" },
  { clave: "gastos", etiqueta: "Otros gastos totales de la cotización (USD)" },
] as const

type Campo = typeof campos[number]["clave"]
type Producto = { id: string; codigo: string; nombre: string }

const moneda = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" })
const monedaUnidad = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 4 })
const porcentaje = new Intl.NumberFormat("es-EC", { style: "percent", maximumFractionDigits: 2 })

function importe(texto: string | undefined) {
  const limpio = texto?.trim()
  if (!limpio || !/^\d+(?:[.,]\d{1,4})?$/.test(limpio)) return null
  const valor = Number(limpio.replace(",", "."))
  return Number.isFinite(valor) ? valor : null
}

export default function SimuladorCostosCotizacion() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [productoId, setProductoId] = useState("")
  const [aviso, setAviso] = useState("")
  const [referencia, setReferencia] = useState<{ productoId: string; costo: number | null } | null>(null)
  const [valores, setValores] = useState<Partial<Record<Campo, string>>>({})

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
  const fabricacion = importe(valores.fabricacion)
  const transporte = importe(valores.transporte)
  const gastos = importe(valores.gastos)
  const precio = importe(valores.precio)
  const unidades = importe(valores.unidades)
  const unidadesValidas = unidades !== null && Number.isSafeInteger(unidades) && unidades > 0
  const costoProduccion = unidadesValidas && materiales !== null && fabricacion !== null
    ? (materiales + fabricacion) * unidades
    : null
  const gastosTotales = transporte !== null && gastos !== null ? transporte + gastos : null
  const costoTotal = costoProduccion !== null && gastosTotales !== null ? costoProduccion + gastosTotales : null
  const costoUnitario = costoTotal !== null && unidadesValidas ? costoTotal / unidades : null
  const venta = precio !== null && unidadesValidas ? precio * unidades : null
  const utilidad = venta !== null && costoTotal !== null ? venta - costoTotal : null
  const margen = utilidad !== null && venta !== null && venta > 0 ? utilidad / venta : null
  const resultados: [string, number | null, Intl.NumberFormat][] = [
    ["Ventas al precio propuesto", venta, moneda],
    ["Costo total de producción", costoProduccion, moneda],
    ["Transporte y otros gastos", gastosTotales, moneda],
    ["Costo total con gastos", costoTotal, moneda],
    ["Precio de equilibrio por unidad", costoUnitario, monedaUnidad],
    ["Utilidad estimada", utilidad, moneda],
    ["Margen sobre ventas", margen, porcentaje],
  ]

  return (
    <section className="cotizacion">
      <style>{estilos}</style>
      <h2>Simulador de costos para cotizar</h2>
      <p>Calcula cuánto cuesta atender un pedido y prueba distintos precios, incluso para un cliente nuevo. Ingresa 0 en los rubros que no apliquen.</p>
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
          const invalido = !!texto.trim() && (clave === "unidades" ? !unidadesValidas : importe(texto) === null)
          return (
            <label key={clave}>{etiqueta}
              <input
                inputMode={clave === "unidades" ? "numeric" : "decimal"}
                value={texto}
                aria-invalid={invalido}
                placeholder={clave === "materiales" && costoCatalogo !== null ? monedaUnidad.format(costoCatalogo) : undefined}
                onChange={(e) => setValores((actual) => ({ ...actual, [clave]: e.target.value }))}
              />
              {invalido && <small>{clave === "unidades" ? "Ingresa un número entero mayor a cero." : "Ingresa un importe válido, con hasta cuatro decimales."}</small>}
              {clave === "materiales" && productoId && <small>
                {referencia === null ? "Consultando el costo de materiales y empaque…" : costoCatalogo === null
                  ? "Costo de catálogo incompleto o no disponible. Ingresa un importe."
                  : `Costo de catálogo: ${monedaUnidad.format(costoCatalogo)}. Puedes reemplazarlo.`}
              </small>}
            </label>
          )
        })}
      </div>
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
`
